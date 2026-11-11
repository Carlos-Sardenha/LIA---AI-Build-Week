import { execFile, spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acharExecutavel, montarExecucao, opPelaTorre, statusDoConector, COFRE_DA_TORRE } from '../hook/conexoes-regras.mjs';
import { inheritedEnv } from './sessions.js';

export type Tipo = 'op' | 'gcloud' | 'gh' | 'vpn' | 'mcp';

export interface Conexao {
  id: string;
  nome: string;
  tipo: Tipo;
  /** null enquanto ainda não foi checada. */
  ok: boolean | null;
  detalhe: string;
  checadoEm: number;
  /** Reconectando agora (digital, navegador). */
  conectando?: boolean;
}

/** Conectores do claude.ai que o dia a dia usa; os outros da conta não entram no topo. */
const CONECTORES_PADRAO = ['Datalake', 'Metabase', 'Atlassian', 'Microsoft 365', 'Github', 'ClickUp'];
const CHECAGEM_MS = 10 * 60_000;
// Com alguma caída, checa mais vezes: a sessão parada volta logo depois do login.
const CHECAGEM_CAIDA_MS = 2 * 60_000;
// O 1Password encerra a autorização da CLI com 10 min parada: um sinal de vida a cada 4.
const OP_VIVO_MS = 4 * 60_000;
// A VPN cai sem aviso e a checagem é só um socket: a cada minuto.
const VPN_MS = 60_000;
/**
 * Endereços da rede interna que só respondem pela VPN (Pritunl), lidos de
 * ~/.torre/conexoes.json → "vpn": ["host:porta", …]. A VPN conta como ativa quando o
 * nome resolve e pelo menos um responde: um serviço fora do ar sozinho não derruba a
 * VPN. Sem endereços, a conexão VPN não aparece no topo.
 */
const VPN_PADRAO: string[] = [];

const isWin = process.platform === 'win32';
/** src/bin da Torre: o `op` intermediário mora aqui e nunca conta como o de verdade. */
const BIN_DA_TORRE = fileURLToPath(new URL('../bin', import.meta.url));

/** CLIs acompanhadas: só entram no topo se estiverem instaladas (achadas no PATH). */
type Cli = 'op' | 'gcloud' | 'gh';
const CLIS: Array<[Cli, string]> = [
  ['op', '1Password'],
  ['gcloud', 'gcloud'],
  ['gh', 'GitHub CLI'],
];

export interface ConexoesOptions {
  dataDir: string;
  /** Caminho absoluto do `op` de verdade (o intermediário da Torre fica fora). */
  opReal: string;
}

/**
 * Conexões de que as sessões dependem: 1Password, gcloud, gh, VPN e os conectores do
 * claude.ai. Checa sem pedir nada a ninguém (nenhuma checagem dispara digital ou
 * navegador) e grava o estado num arquivo que o hook das sessões lê.
 *
 * CLI que não está instalada (no Windows do Mateus: op, gcloud e gh) não aparece no
 * topo, não conta como caída e não pausa sessão; se for instalada depois, entra na
 * próxima checagem.
 */
export class Conexoes extends EventEmitter {
  private estado = new Map<string, Conexao>();
  private arquivo: string;
  private conectores: string[];
  private vpn: string[];
  private checando = false;
  /** Caminho de cada CLI; '' quando não está instalada. */
  private cli: Record<Cli, string> = { op: '', gcloud: '', gh: '' };

  constructor(private opts: ConexoesOptions) {
    super();
    this.arquivo = path.join(opts.dataDir, 'conexoes-estado.json');
    this.conectores = lerConectores(path.join(opts.dataDir, 'conexoes.json'));
    this.vpn = lerVpn(path.join(opts.dataDir, 'conexoes.json'));
    this.detectar();
    this.gravar();
    this.agendar();
    setInterval(() => this.manterOpVivo(), OP_VIVO_MS).unref();
    setInterval(() => this.checarVpn(), VPN_MS).unref();
  }

  /** O `op` de verdade que as sessões usam fora da Torre (TORRE_OP_REAL). */
  get opReal(): string {
    return this.cli.op || this.opts.opReal;
  }

  lista(): Conexao[] {
    return [...this.estado.values()];
  }

  get(id: string): Conexao | undefined {
    return this.estado.get(id);
  }

  /**
   * Procura as CLIs no PATH (no Windows, com o PATHEXT) e monta o topo na ordem de
   * sempre: 1Password, gcloud, GitHub CLI, VPN, conectores. Mantém o estado de quem
   * já estava; quem foi desinstalado sai. Devolve se algo mudou.
   */
  private detectar(): boolean {
    const env = inheritedEnv();
    const achar = (nome: string) => acharExecutavel(nome, { env, ignorar: [BIN_DA_TORRE] });
    let opReal = this.opts.opReal ? achar(this.opts.opReal) : '';
    if (!opReal) opReal = achar('op');
    if (!opReal && process.platform === 'darwin') opReal = achar('/opt/homebrew/bin/op');
    this.cli = { op: opReal, gcloud: achar('gcloud'), gh: achar('gh') };

    const base: Array<[string, string, Tipo]> = [
      ...CLIS.filter(([id]) => this.cli[id]).map(([id, nome]): [string, string, Tipo] => [id, nome, id]),
      ...(this.vpn.length ? [['vpn', 'VPN', 'vpn'] as [string, string, Tipo]] : []),
      ...this.conectores.map((n): [string, string, Tipo] => [`mcp:${n}`, n, 'mcp']),
    ];
    const antes = [...this.estado.keys()].join('|');
    const novo = new Map<string, Conexao>();
    for (const [id, nome, tipo] of base) novo.set(id, this.estado.get(id) ?? { id, nome, tipo, ok: null, detalhe: 'checando…', checadoEm: 0 });
    this.estado = novo;
    return antes !== [...novo.keys()].join('|');
  }

  private agendar(): void {
    const caida = this.lista().some((c) => c.ok !== true && c.tipo !== 'gh');
    setTimeout(() => this.checarTudo().finally(() => this.agendar()), caida ? CHECAGEM_CAIDA_MS : CHECAGEM_MS).unref();
  }

  async checarTudo(): Promise<void> {
    if (this.checando) return;
    this.checando = true;
    try {
      if (this.detectar()) {
        this.gravar();
        this.emit('changed');
      }
      await Promise.all([this.checarOp(), this.checarGcloud(), this.checarGh(), this.checarVpn(), this.checarConectores()]);
    } finally {
      this.checando = false;
    }
  }

  /**
   * Ciclo de abertura: checa tudo e, se o 1Password estiver fora, já pede a digital
   * (é quando a pessoa está na frente da tela).
   */
  async abertura(): Promise<void> {
    await this.checarTudo();
    if (this.estado.get('op')?.ok === false) await this.conectarOp();
  }

  // ---------- 1Password ----------

  async checarOp(): Promise<void> {
    if (!this.cli.op) return;
    const r = await run(this.cli.op, ['whoami', '--format', 'json'], 15_000);
    if (r.code === 0) {
      let email = '';
      try {
        email = JSON.parse(r.stdout).email ?? '';
      } catch {}
      this.set('op', true, email ? `login da Torre ativo · ${email}` : 'login da Torre ativo');
    } else {
      this.set('op', false, 'sem login · clique para pôr a digital uma vez');
    }
  }

  /** Pede a digital uma vez, pelo processo da Torre: vale para todas as sessões. */
  async conectarOp(): Promise<void> {
    if (!this.cli.op) return;
    this.patch('op', { conectando: true, detalhe: 'confirme com a digital…' });
    const r = await run(this.cli.op, ['vault', 'get', COFRE_DA_TORRE, '--format', 'json'], 90_000);
    this.patch('op', { conectando: false });
    if (r.code !== 0) {
      this.set('op', false, `não conectou: ${primeiraLinha(r.stderr) || 'tempo esgotado'}`);
      return;
    }
    await this.checarOp();
  }

  private async manterOpVivo(): Promise<void> {
    if (this.estado.get('op')?.ok !== true) return;
    await this.checarOp();
  }

  /** Atende o `op` intermediário de uma sessão. */
  async op(args: string[]): Promise<{ code: number; stdout: string; stderr: string; parado?: boolean }> {
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string') || !opPelaTorre(args)) {
      return { code: 1, stdout: '', stderr: 'Torre: este pedido ao 1Password não sai pelo login da Torre.\n' };
    }
    // Sem a CLI instalada não há o que esperar: erro comum, sem pausar a sessão.
    if (!this.cli.op) return { code: 127, stdout: '', stderr: 'Torre: o 1Password CLI (op) não está instalado nesta máquina.\n' };
    if (this.estado.get('op')?.ok !== true) return parado('1Password');
    const r = await run(this.cli.op, args, 45_000);
    if (r.code !== 0 && /not signed in|authoriz|session expired/i.test(r.stderr)) {
      this.set('op', false, 'login da Torre expirou · clique para pôr a digital');
      return parado('1Password');
    }
    return r;
  }

  // ---------- gcloud, gh ----------

  async checarGcloud(): Promise<void> {
    if (!this.cli.gcloud) return;
    const [user, adc] = await Promise.all([
      run(this.cli.gcloud, ['auth', 'print-access-token', '--quiet'], 30_000),
      run(this.cli.gcloud, ['auth', 'application-default', 'print-access-token', '--quiet'], 30_000),
    ]);
    if (user.code === 0 && adc.code === 0) this.set('gcloud', true, 'conta e ADC ativas');
    else this.set('gcloud', false, `${user.code ? 'conta' : 'ADC'} pede login · clique para abrir o navegador`);
  }

  /** Abre o login do Google no navegador; renova a conta e o ADC (bq, dbt) juntos. */
  async conectarGcloud(): Promise<void> {
    if (!this.cli.gcloud) return;
    this.patch('gcloud', { conectando: true, detalhe: 'termine o login no navegador…' });
    const r = await run(this.cli.gcloud, ['auth', 'login', '--update-adc', '--quiet'], 5 * 60_000);
    this.patch('gcloud', { conectando: false });
    if (r.code !== 0) this.set('gcloud', false, `não conectou: ${primeiraLinha(r.stderr) || 'tempo esgotado'}`);
    await this.checarGcloud();
  }

  async checarGh(): Promise<void> {
    if (!this.cli.gh) return;
    const r = await run(this.cli.gh, ['auth', 'status', '--active'], 20_000);
    // Conforme a versão, o gh escreve o status na saída normal ou na de erro.
    const conta = `${r.stdout}\n${r.stderr}`.match(/account (\S+)/)?.[1];
    if (r.code === 0) this.set('gh', true, conta ? `conta ${conta}` : 'ativo');
    else this.set('gh', false, 'rode `gh auth login` num terminal');
  }

  // ---------- VPN ----------

  async checarVpn(): Promise<void> {
    if (!this.vpn.length) return;
    const r = await Promise.all(this.vpn.map(alcanca));
    const vivos = this.vpn.filter((_, i) => r[i] === 'ok').map((a) => a.split('.')[0]);
    if (vivos.length) {
      const fora = this.vpn.filter((_, i) => r[i] !== 'ok').map((a) => a.split('.')[0]);
      this.set('vpn', true, `rede interna ok · ${vivos.join(', ')}${fora.length ? ` (sem resposta: ${fora.join(', ')})` : ''}`);
    } else {
      const motivo = r.every((x) => x === 'dns') ? 'o nome interno não resolve' : 'nada responde na rede interna';
      this.set('vpn', false, `${motivo} · clique para abrir o Pritunl`);
    }
  }

  /** Abre o Pritunl para a pessoa conectar; as checagens de minuto em minuto percebem a volta. */
  async conectarVpn(): Promise<void> {
    this.patch('vpn', { conectando: true, detalhe: 'conecte no Pritunl…' });
    await abrirPritunl();
    this.patch('vpn', { conectando: false });
    await this.checarVpn();
  }

  // ---------- Conectores do claude.ai ----------

  async checarConectores(): Promise<void> {
    if (!this.conectores.length) return;
    const r = await run(claudeExe(), ['mcp', 'list'], 90_000, os.homedir());
    if (r.code !== 0 && !r.stdout) return;
    for (const nome of this.conectores) {
      const s = statusDoConector(r.stdout, nome);
      this.set(`mcp:${nome}`, s.ok ?? false, s.detalhe);
    }
  }

  // ---------- Estado ----------

  private set(id: string, ok: boolean, detalhe: string): void {
    const c = this.estado.get(id);
    if (!c) return;
    const antes = c.ok;
    Object.assign(c, { ok, detalhe, checadoEm: Date.now() });
    this.gravar();
    this.emit('changed');
    if (ok && antes === false) this.emit('voltou', id, c.nome);
  }

  private patch(id: string, p: Partial<Conexao>): void {
    const c = this.estado.get(id);
    if (!c) return;
    Object.assign(c, p);
    this.emit('changed');
  }

  /** O hook das sessões lê este arquivo a cada ferramenta: escrita atômica. */
  private gravar(): void {
    const data: Record<string, { nome: string; ok: boolean | null }> = {};
    for (const c of this.estado.values()) data[c.id] = { nome: c.nome, ok: c.ok };
    const texto = JSON.stringify(data, null, 2);
    const tmp = `${this.arquivo}.tmp`;
    try {
      fs.writeFileSync(tmp, texto);
      fs.renameSync(tmp, this.arquivo);
    } catch {
      // No Windows o rename pode falhar com o arquivo aberto (antivírus, hook lendo):
      // grava direto; o hook que pegar o meio do caminho libera, como em qualquer falha.
      try {
        fs.writeFileSync(this.arquivo, texto);
      } catch {}
    }
  }
}

function parado(nome: string) {
  return {
    code: 1,
    stdout: '',
    stderr: `Torre: ${nome} está desconectado. Pare aqui, sem pedir login: a Torre retoma esta sessão quando reconectar.\n`,
    parado: true,
  };
}

/**
 * O `claude` para o `claude mcp list`: TORRE_CLAUDE, senão o do PATH, senão o
 * instalador nativo em ~/.local/bin (claude.exe no Windows).
 */
function claudeExe(): string {
  const env = inheritedEnv();
  if (process.env.TORRE_CLAUDE) return acharExecutavel(process.env.TORRE_CLAUDE, { env }) || process.env.TORRE_CLAUDE;
  const doPath = acharExecutavel('claude', { env });
  if (doPath) return doPath;
  const local = path.join(os.homedir(), '.local', 'bin', isWin ? 'claude.exe' : 'claude');
  return fs.existsSync(local) ? local : 'claude';
}

/** Lista de conectores do topo: ~/.torre/conexoes.json ({"conectores": [...]}), criado com o padrão. */
function lerConectores(file: string): string[] {
  let atual: Record<string, unknown> = {};
  try {
    atual = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (Array.isArray(atual.conectores)) return atual.conectores.map(String);
  } catch {}
  // Mantém as outras chaves ("vpn"): só acrescenta a lista padrão.
  try {
    fs.writeFileSync(file, JSON.stringify({ ...(atual && typeof atual === 'object' ? atual : {}), conectores: CONECTORES_PADRAO }, null, 2) + '\n');
  } catch {}
  return CONECTORES_PADRAO;
}

/** Alvos da VPN: ~/.torre/conexoes.json → "vpn": ["host:porta", …]; sem a chave, nenhum. */
function lerVpn(file: string): string[] {
  try {
    const lista = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).vpn;
    if (Array.isArray(lista) && lista.length) return lista.map(String);
  } catch {}
  return VPN_PADRAO;
}

/**
 * Abre o cliente do Pritunl sem esperar por ele. macOS: `open -a Pritunl`. Windows:
 * pritunl.exe nas pastas de instalação; senão `start "" pritunl` pelo cmd.exe.
 */
async function abrirPritunl(): Promise<void> {
  if (process.platform === 'darwin') {
    await run('open', ['-a', 'Pritunl'], 15_000);
    return;
  }
  if (isWin) {
    const env = process.env;
    const pastas = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'), env.LOCALAPPDATA].filter(Boolean) as string[];
    const exe = pastas.map((p) => path.join(p, 'Pritunl', 'pritunl.exe')).find((f) => fs.existsSync(f));
    if (exe) return soltar(exe, []);
    return soltar(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '"start "" pritunl"'], true);
  }
  soltar('pritunl-client-electron', []);
}

/** Abre um programa de janela e segue: nada de esperar ele fechar. */
function soltar(cmd: string, args: string[], verbatim = false): void {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: verbatim, windowsHide: verbatim });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

/** Resolve o nome e abre um socket, sem mandar nada: 'ok', 'dns' ou 'sem resposta'. */
async function alcanca(alvo: string): Promise<'ok' | 'dns' | 'sem resposta'> {
  const [host, porta] = alvo.split(':');
  let ip: string;
  try {
    ip = (await dns.lookup(host)).address;
  } catch {
    return 'dns';
  }
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port: Number(porta), timeout: 4000 });
    const fim = (r: 'ok' | 'sem resposta') => {
      s.destroy();
      resolve(r);
    };
    s.once('connect', () => fim('ok'));
    s.once('timeout', () => fim('sem resposta'));
    s.once('error', () => fim('sem resposta'));
  });
}

/**
 * Roda sem terminal e sem entrada: nada aqui pode ficar esperando alguém digitar.
 * No Windows: acha o executável pelo PATHEXT, roda .cmd/.bat pelo cmd.exe com os
 * argumentos escapados, não abre janela de console e, no tempo esgotado, derruba a
 * árvore inteira (gcloud.cmd → python), não só o cmd.exe.
 */
function run(cmd: string, args: string[], timeout: number, cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const env = inheritedEnv();
  const arquivo = path.isAbsolute(cmd) ? cmd : acharExecutavel(cmd, { env, ignorar: [BIN_DA_TORRE] });
  if (!arquivo) return Promise.resolve({ code: 127, stdout: '', stderr: `${cmd}: não instalado` });
  const ex = montarExecucao(arquivo, args);
  return new Promise((resolve) => {
    let esgotou = false;
    const child = execFile(
      ex.arquivo,
      ex.args,
      { cwd, env, maxBuffer: 10 * 1024 * 1024, windowsHide: true, windowsVerbatimArguments: ex.verbatim },
      (err, stdout, stderr) => {
        clearTimeout(timer);
        const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0;
        const msg = esgotou ? 'tempo esgotado' : err && !stderr ? err.message : '';
        resolve({ code: esgotou && !code ? 1 : code, stdout: String(stdout), stderr: String(stderr) || msg });
      },
    );
    const timer = setTimeout(() => {
      esgotou = true;
      if (isWin && child.pid) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => child.kill());
        } catch {
          child.kill();
        }
      } else child.kill('SIGTERM');
    }, timeout);
    timer.unref();
    child.stdin?.end();
  });
}

function primeiraLinha(s: string): string {
  return s.replace(/^\[ERROR\]\s*\S+\s+\S+\s*/, '').split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 140) ?? '';
}
