import * as pty from 'node-pty';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findTranscript } from './external.js';
import { TranscriptReader, Usage } from './transcript.js';
import type { Sugestao } from './frentes-regras.mjs';

export type Status = 'starting' | 'working' | 'waiting' | 'idle' | 'exited';

/** De onde veio o título: quem está mais acima nunca é sobrescrito por quem está abaixo. */
export type TitleSource = 'user' | 'claude' | 'prompt' | '';
const TITLE_RANK: Record<TitleSource, number> = { user: 3, claude: 2, prompt: 1, '': 0 };

export interface SessionMeta {
  id: string;
  /** Nome da pasta. */
  name: string;
  /** Tema da conversa, mostrado no card; vazio até haver um. */
  title: string;
  titleSource: TitleSource;
  cwd: string;
  status: Status;
  detail: string;
  updatedAt: number;
  usage: Usage | null;
  /** Conexões caídas que pararam a sessão; a Torre retoma quando voltam. */
  aguardando?: string[];
  /** Frente da sessão (id da nota em Projetos/); '' = Geral. */
  frente: string;
  /** Só em sessões da Geral: a frente que parece ser a dela. */
  sugestao?: Sugestao | null;
}

/** Quem sugere a frente de uma sessão da Geral (regras puras com a lista atual de frentes). */
export type Sugeridor = (s: { titulo: string; primeiroPedido: string; cwd: string }) => Sugestao | null;

interface Session {
  meta: SessionMeta;
  term: pty.IPty | null;
  buffer: string;
  reader: TranscriptReader | null;
  /** Encerrada pela Torre (botão ou reabertura por conector): a saída não é erro. */
  killed?: boolean;
  /** Roda quando o processo atual sair (reabrir a sessão depois de um conector voltar). */
  aoSair?: () => void;
  /** Conexão voltou com a sessão ainda trabalhando: retoma no próximo Stop. */
  retomar?: { conexao: string; nome: string };
  /** Último tamanho que a página pediu: o pty de uma retomada nasce nele, e não em 100×30. */
  tamanho?: { cols: number; rows: number };
  /** Primeiro pedido da conversa (entra na sugestão de frente). */
  primeiroPedido?: string;
  /** A pessoa escolheu a frente (ou manteve na Geral): não sugere mais. */
  frenteFixada?: boolean;
}

/** Quanto da saída de cada terminal fica guardado para reabrir a página sem perder a tela. */
const BUFFER_LIMIT = 256 * 1024;
/** Espera entre reabrir a sessão e mandar o "continue", para os conectores ligarem. */
const REABRIR_ESPERA_MS = 25_000;
const isWin = process.platform === 'win32';

export interface ManagerOptions {
  dataDir: string;
  hooksSettings: string;
  /** Argumentos das sessões (modo de permissão, instrução da Torre). */
  args: string[];
  env: Record<string, string>;
}

/**
 * Caminho absoluto do `claude` que as sessões rodam. TORRE_CLAUDE vence tudo. No Windows
 * procura `claude.exe` (o instalador nativo põe em %USERPROFILE%\.local\bin) no PATH e na
 * `.local\bin`; só sem .exe aceita `claude.cmd` (instalação pelo npm). Chamar o .exe direto
 * evita o `cmd.exe /c`, que re-interpreta o --append-system-prompt (acentos, `&`, `^`, `%`).
 * Fora do Windows procura `claude` no PATH e em ~/.local/bin; sem achar, devolve "claude" e o
 * erro do spawn diz o resto.
 */
export function claudeBin(): string {
  const forced = process.env.TORRE_CLAUDE?.trim();
  if (forced) return forced;
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin')]
    .map((d) => d.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
  const names = isWin ? ['claude.exe', 'claude.cmd'] : ['claude'];
  // Uma volta por nome: um .exe em qualquer pasta vence um .cmd que venha antes no PATH.
  for (const name of names) {
    for (const dir of dirs) {
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {}
    }
  }
  return isWin ? 'claude.exe' : 'claude';
}

/**
 * Dono dos terminais: cada sessão é um processo `claude` num PTY (ConPTY no
 * Windows). Vive no servidor, então a página pode fechar e reabrir à vontade.
 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>();
  private storeFile: string;
  private sugeridor: Sugeridor | null = null;

  constructor(private opts: ManagerOptions) {
    super();
    this.storeFile = path.join(opts.dataDir, 'sessions.json');
    this.load();
    setInterval(() => this.pollTranscripts(), 2000).unref();
  }

  list(): SessionMeta[] {
    return [...this.sessions.values()].map((s) => s.meta);
  }

  buffer(id: string): string {
    return this.sessions.get(id)?.buffer ?? '';
  }

  open(cwd: string, name?: string, firstPrompt?: string, frente = ''): SessionMeta {
    if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`pasta não encontrada: ${cwd}`);
    }
    const id = randomUUID();
    const meta: SessionMeta = {
      id,
      name: path.basename(cwd) || cwd,
      title: name?.trim() ?? '',
      titleSource: name?.trim() ? 'user' : '',
      cwd,
      status: 'starting',
      detail: 'Abrindo o Claude Code…',
      updatedAt: Date.now(),
      usage: null,
      frente,
      sugestao: null,
    };
    // Aberta já numa frente é escolha da pessoa: não sugere outra.
    const s: Session = { meta, term: null, buffer: '', reader: null, primeiroPedido: firstPrompt?.trim() || undefined, frenteFixada: !!frente };
    this.sessions.set(id, s);
    try {
      this.spawn(id, ['--session-id', id], firstPrompt);
    } catch (err) {
      this.sessions.delete(id);
      throw new Error(`não consegui abrir o claude: ${(err as Error).message}`);
    }
    this.sugerir(s);
    this.save();
    return meta;
  }

  /** Liga quem sugere a frente (o servidor, com a lista de frentes) e recalcula tudo. */
  setSugeridor(fn: Sugeridor): void {
    this.sugeridor = fn;
    this.recalcularSugestoes();
  }

  /** A lista de frentes mudou: as sessões da Geral recalculam a sugestão. */
  recalcularSugestoes(): void {
    for (const s of this.sessions.values()) if (this.sugerir(s)) this.emit('meta', s.meta);
  }

  /** Move a sessão para uma frente ('' = Geral). Vale como escolha: a sugestão some de vez. */
  setFrente(id: string, frente: string): SessionMeta {
    const s = this.require(id);
    s.meta.frente = frente;
    s.meta.sugestao = null;
    s.frenteFixada = true;
    this.save();
    this.emit('meta', s.meta);
    return s.meta;
  }

  /** Recalcula a sugestão de uma sessão; true se mudou. Só sessões da Geral não fixadas. */
  private sugerir(s: Session): boolean {
    const antes = JSON.stringify(s.meta.sugestao ?? null);
    let nova = null;
    if (!s.meta.frente && !s.frenteFixada && this.sugeridor) {
      try {
        nova = this.sugeridor({ titulo: s.meta.title, primeiroPedido: s.primeiroPedido ?? '', cwd: s.meta.cwd });
      } catch {}
    }
    s.meta.sugestao = nova;
    return JSON.stringify(nova) !== antes;
  }

  ids(): Set<string> {
    return new Set(this.sessions.keys());
  }

  /**
   * Ordem oficial dos terminais, a que a pessoa arrastou na página. Ids desconhecidos
   * são ignorados; sessões que faltam na lista ficam no fim, na ordem em que estavam.
   */
  reorder(ids: string[]): string[] {
    const next = new Map<string, Session>();
    for (const id of ids) {
      const s = this.sessions.get(id);
      if (s && !next.has(id)) next.set(id, s);
    }
    for (const [id, s] of this.sessions) if (!next.has(id)) next.set(id, s);
    this.sessions = next;
    this.save();
    const order = [...this.sessions.keys()];
    this.emit('order', order);
    return order;
  }

  /**
   * Traz para a Torre uma conversa que estava aberta em outro terminal. Quem
   * chama já encerrou o processo original; aqui só se retoma a conversa.
   */
  adopt(sessionId: string, cwd: string, hasConversation: boolean): SessionMeta {
    if (this.sessions.has(sessionId)) return this.resume(sessionId);
    const meta: SessionMeta = {
      id: sessionId,
      name: path.basename(cwd) || cwd,
      title: '',
      titleSource: '',
      cwd,
      status: 'starting',
      detail: hasConversation ? 'Trazida para o Jarvis · retomando a conversa…' : 'Trazida para o Jarvis · ainda sem conversa',
      updatedAt: Date.now(),
      usage: null,
      frente: '',
      sugestao: null,
    };
    const s: Session = { meta, term: null, buffer: '', reader: null };
    this.sessions.set(sessionId, s);
    this.sugerir(s);
    try {
      this.spawn(sessionId, hasConversation ? ['--resume', sessionId] : ['--session-id', sessionId]);
    } catch (err) {
      this.sessions.delete(sessionId);
      throw new Error(`não consegui retomar a conversa: ${(err as Error).message}`);
    }
    this.save();
    this.emit('meta', meta);
    return meta;
  }

  /** Reabre uma sessão encerrada retomando a mesma conversa. */
  resume(id: string): SessionMeta {
    const s = this.require(id);
    if (s.term) return s.meta;
    s.buffer = '';
    // Sessão que nunca recebeu pedido não tem conversa gravada para retomar.
    const hasConversation = findTranscript(id) !== undefined;
    this.update(id, { status: 'starting', detail: hasConversation ? 'Retomando a conversa…' : 'Abrindo de novo · ainda sem conversa' });
    this.spawn(id, hasConversation ? ['--resume', id] : ['--session-id', id]);
    return s.meta;
  }

  kill(id: string): void {
    const s = this.require(id);
    if (s.term) s.killed = true;
    s.term?.kill();
  }

  forget(id: string): void {
    const s = this.require(id);
    s.term?.kill();
    this.sessions.delete(id);
    this.save();
    this.emit('removed', id);
  }

  /** Tira da Torre todas as sessões encerradas. As conversas ficam gravadas no Claude Code. */
  forgetExited(): number {
    const ids = [...this.sessions.values()].filter((s) => !s.term).map((s) => s.meta.id);
    for (const id of ids) this.forget(id);
    return ids.length;
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.term?.write(data);
  }

  /** Digita um pedido inteiro e confirma, como se a pessoa tivesse teclado. */
  prompt(id: string, text: string): void {
    const term = this.sessions.get(id)?.term;
    if (!term) return;
    term.write(text);
    // Texto chegando de uma vez vira colagem no Claude Code; Enter cedo demais entra na
    // colagem e não envia (2.1.x: "Removed 1 invisible character"). 600 ms passa.
    setTimeout(() => term.write('\r'), 600);
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s || !(cols > 0 && rows > 0)) return;
    s.tamanho = { cols: Math.floor(cols), rows: Math.floor(rows) };
    try {
      s.term?.resize(s.tamanho.cols, s.tamanho.rows);
    } catch {
      // ConPTY recusa resize de um processo que acabou de sair: o onExit cuida do resto.
    }
  }

  onHook(id: string, event: string, payload: any): void {
    const s = this.sessions.get(id);
    if (process.env.TORRE_DEBUG) console.log('[hook]', id.slice(0, 8), event, payload?.transcript_path ?? '');
    if (!s) return;
    this.emit('hook', id, event, payload);
    if (payload?.transcript_path && !s.reader) {
      s.reader = new TranscriptReader(payload.transcript_path);
    }
    switch (event) {
      case 'SessionStart':
        this.update(id, { status: 'idle', detail: 'Pronta para o primeiro pedido' });
        break;
      case 'UserPromptSubmit':
        if (!s.primeiroPedido && payload?.prompt) {
          s.primeiroPedido = oneLine(payload.prompt, 500);
          this.sugerir(s);
        }
        this.update(id, { status: 'working', detail: oneLine(payload?.prompt) || 'Pedido recebido', aguardando: [] });
        this.setTitle(s, oneLine(payload?.prompt, 70), 'prompt');
        break;
      case 'PreToolUse':
      case 'PostToolUse':
        this.update(id, { status: 'working', detail: describeTool(payload) });
        break;
      case 'Notification': {
        const message = String(payload?.message ?? '');
        const permission = /permission/i.test(message);
        // O aviso de ociosidade não apaga a parada por conexão: o card segue "aguardando".
        if (!permission && s.meta.aguardando?.length) break;
        this.update(id, {
          status: permission ? 'waiting' : 'idle',
          detail: permission ? message : 'Esperando o próximo pedido',
        });
        break;
      }
      case 'Aguardando': {
        const conexao = String(payload?.conexao ?? '');
        const lista = [...new Set([...(s.meta.aguardando ?? []), conexao])].filter(Boolean);
        this.update(id, { status: 'waiting', aguardando: lista, detail: `Aguardando conexão: ${lista.map(nomeConexao).join(', ')}` });
        break;
      }
      case 'Stop':
        if (s.retomar) {
          this.update(id, { status: 'idle', detail: 'Retomando: a conexão voltou' });
          this.retomar(s, s.retomar.conexao, s.retomar.nome);
          break;
        }
        // Parada por conexão caída continua esperando até a conexão voltar.
        if (s.meta.aguardando?.length) this.update(id, { status: 'waiting', detail: `Aguardando conexão: ${s.meta.aguardando.map(nomeConexao).join(', ')}` });
        else this.update(id, { status: 'idle', detail: 'Terminou' });
        break;
    }
    this.pollOne(s);
  }

  private spawn(id: string, extraArgs: string[], firstPrompt?: string): void {
    const s = this.require(id);
    const args = [...extraArgs, '--settings', this.opts.hooksSettings, ...this.opts.args];
    if (firstPrompt) args.push(firstPrompt);
    const env = mergeEnv(inheritedEnv(), { ...this.opts.env, TORRE_SESSION: id, TERM: 'xterm-256color', COLORTERM: 'truecolor' });
    const { cols, rows } = s.tamanho ?? { cols: 100, rows: 30 };
    const bin = claudeBin();
    // Windows: o .exe vai direto para o ConPTY (o node-pty monta a linha de comando com as
    // aspas certas). Só a instalação pelo npm (claude.cmd) precisa passar pelo cmd.exe.
    const term =
      isWin && /\.(cmd|bat)$/i.test(bin)
        ? pty.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', bin, ...args], { cwd: s.meta.cwd, env, cols, rows })
        : pty.spawn(bin, args, { name: 'xterm-256color', cwd: s.meta.cwd, env, cols, rows });
    s.term = term;
    term.onData((data) => {
      s.buffer = (s.buffer + data).slice(-BUFFER_LIMIT);
      this.emit('output', id, data);
      // A pergunta de confiança na pasta aparece antes de qualquer hook rodar.
      if (s.meta.status === 'starting' && /trust[^a-z]*this[^a-z]*folder/i.test(stripAnsi(s.buffer.slice(-4096)))) {
        this.update(id, { status: 'waiting', detail: 'Confirme se confia nesta pasta' });
      }
    });
    s.killed = false;
    term.onExit(({ exitCode }) => {
      // Uma retomada já pode ter trocado o terminal: a saída do antigo não mexe no novo.
      if (s.term !== term) return;
      s.term = null;
      const depois = s.aoSair;
      s.aoSair = undefined;
      if (depois) return depois();
      const clean = exitCode === 0 || s.killed;
      this.update(id, { status: 'exited', detail: clean ? 'Sessão encerrada' : `Saiu com código ${exitCode}` });
    });
  }

  /**
   * Uma conexão voltou: as sessões paradas só por ela recebem o pedido de continuar.
   * Sessão trabalhando (alguém já mandou seguir) só perde a marca.
   */
  conexaoVoltou(conexao: string, nome: string): void {
    for (const s of this.sessions.values()) {
      if (!s.meta.aguardando?.includes(conexao)) continue;
      const resto = s.meta.aguardando.filter((c) => c !== conexao);
      const semNoticia = Date.now() - s.meta.updatedAt;
      this.update(s.meta.id, { aguardando: resto });
      if (resto.length || !s.term) continue;
      // "Trabalhando" sem notícia há mais de 1 min é Stop que não chegou: retoma já.
      if (s.meta.status === 'working' && semNoticia < 60_000) s.retomar = { conexao, nome };
      else this.retomar(s, conexao, nome);
    }
  }

  private retomar(s: Session, conexao: string, nome: string): void {
    s.retomar = undefined;
    const pedido = `A conexão ${nome} voltou no Jarvis. Continue de onde parou.`;
    // Cada sessão liga os conectores quando abre: o login feito em outra não chega a
    // uma sessão já aberta. Conector volta reabrindo a mesma conversa, e aí o pedido.
    if (conexao.startsWith('mcp:')) this.reabrir(s, pedido);
    else this.prompt(s.meta.id, pedido);
  }

  private reabrir(s: Session, pedido: string): void {
    const id = s.meta.id;
    s.aoSair = () => {
      this.update(id, { status: 'starting', detail: 'Reabrindo com o conector de volta…' });
      this.spawn(id, ['--resume', id]);
      // Os conectores do claude.ai ligam alguns segundos depois de a sessão abrir: o pedido
      // logo na abertura encontra o conector ainda desligado.
      setTimeout(() => this.prompt(id, pedido), REABRIR_ESPERA_MS);
    };
    this.kill(id);
  }

  private update(id: string, patch: Partial<SessionMeta>): void {
    const s = this.sessions.get(id);
    if (!s) return;
    Object.assign(s.meta, patch, { updatedAt: Date.now() });
    this.emit('meta', s.meta);
  }

  private pollOne(s: Session): void {
    if (s.reader?.poll()) {
      s.meta.usage = { ...s.reader.usage };
      if (!s.primeiroPedido && s.reader.firstPrompt) {
        s.primeiroPedido = oneLine(s.reader.firstPrompt, 500);
        this.sugerir(s);
      }
      if (s.reader.title) this.setTitle(s, s.reader.title, 'claude');
      else if (s.reader.firstPrompt) this.setTitle(s, s.reader.firstPrompt.slice(0, 70), 'prompt');
      this.emit('meta', s.meta);
    }
  }

  /**
   * Nome oficial dado pela pessoa no card: vence o `/rename` e o título gerado
   * pelo Claude. Vazio apaga o nome e volta ao título automático da transcrição.
   */
  rename(id: string, title: unknown): SessionMeta {
    const s = this.require(id);
    const t = oneLine(title, 80);
    if (t) {
      s.meta.title = t;
      s.meta.titleSource = 'user';
    } else {
      s.meta.title = '';
      s.meta.titleSource = '';
      if (s.reader?.title) this.setTitle(s, s.reader.title, 'claude');
      else if (s.reader?.firstPrompt) this.setTitle(s, s.reader.firstPrompt.slice(0, 70), 'prompt');
    }
    this.sugerir(s);
    this.save();
    this.emit('meta', s.meta);
    return s.meta;
  }

  private setTitle(s: Session, title: string, source: TitleSource): void {
    if (!title || TITLE_RANK[source] < TITLE_RANK[s.meta.titleSource]) return;
    // O título provisório é o primeiro pedido: os seguintes não renomeiam o card.
    if (source === 'prompt' && s.meta.titleSource === 'prompt') return;
    if (title === s.meta.title && source === s.meta.titleSource) return;
    s.meta.title = title;
    s.meta.titleSource = source;
    this.sugerir(s);
    this.save();
  }

  private pollTranscripts(): void {
    for (const s of this.sessions.values()) {
      if (!s.term) continue;
      // Sessão retomada só manda hook quando recebe um pedido; a transcrição já existe antes.
      if (!s.reader) {
        const file = findTranscript(s.meta.id);
        if (file) s.reader = new TranscriptReader(file);
      }
      this.pollOne(s);
    }
  }

  private require(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`sessão desconhecida: ${id}`);
    return s;
  }

  private load(): void {
    type Salva = Pick<SessionMeta, 'id' | 'name' | 'cwd'> &
      Partial<Pick<SessionMeta, 'title' | 'titleSource' | 'frente'>> & { frenteFixada?: boolean; primeiroPedido?: string };
    let saved: Salva[] = [];
    try {
      saved = JSON.parse(fs.readFileSync(this.storeFile, 'utf8'));
    } catch {}
    if (!Array.isArray(saved)) saved = [];
    for (const { id, name, cwd, title = '', titleSource = '', frente, frenteFixada, primeiroPedido } of saved) {
      if (!id || !cwd) continue;
      // Sessões de antes das frentes não têm o campo: ficam na Geral.
      const f = typeof frente === 'string' ? frente : '';
      this.sessions.set(id, {
        meta: { id, name, title, titleSource, cwd, status: 'exited', detail: 'Encerrada · dá para retomar', updatedAt: Date.now(), usage: null, frente: f, sugestao: null },
        term: null,
        buffer: '',
        reader: null,
        frenteFixada: !!frenteFixada,
        primeiroPedido: typeof primeiroPedido === 'string' ? primeiroPedido : undefined,
      });
    }
  }

  private save(): void {
    const data = [...this.sessions.values()].map(({ meta: { id, name, cwd, title, titleSource, frente }, frenteFixada, primeiroPedido }) => ({
      id,
      name,
      cwd,
      title,
      titleSource,
      frente,
      ...(frenteFixada ? { frenteFixada } : {}),
      ...(primeiroPedido ? { primeiroPedido } : {}),
    }));
    fs.writeFileSync(this.storeFile, JSON.stringify(data, null, 2));
  }
}

/**
 * Se a Torre for iniciada de dentro de uma sessão do Claude Code (o app do Claude, um
 * terminal com `claude`), o ambiente traz as marcas dessa sessão (CLAUDECODE,
 * CLAUDE_CODE_CHILD_SESSION…) e o `claude` filho se comporta como subsessão: nem grava a
 * transcrição. Tira só essas marcas; configurações da pessoa (CLAUDE_CODE_USE_BEDROCK etc.)
 * ficam. No Windows o nome da variável não diferencia maiúsculas: compara em maiúsculas.
 */
const SESSION_MARKERS = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_CODE_(ENTRYPOINT|EXECPATH|CHILD_SESSION|SESSION_\w+|MESSAGING_\w+))$/;
export function inheritedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SESSION_MARKERS.test(isWin ? key.toUpperCase() : key)) env[key] = value;
  }
  return env;
}

/**
 * Junta variáveis por cima do ambiente herdado. No Windows `Path` e `PATH` são a mesma
 * variável: sem tirar a herdada, o filho receberia as duas e ficaria com uma qualquer.
 */
function mergeEnv(base: Record<string, string>, extra: Record<string, string>): Record<string, string> {
  const env = { ...base };
  if (isWin) {
    for (const key of Object.keys(extra)) {
      for (const existing of Object.keys(env)) {
        if (existing !== key && existing.toUpperCase() === key.toUpperCase()) delete env[existing];
      }
    }
  }
  return Object.assign(env, extra);
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');
}

/** "mcp:Datalake" → "Datalake"; o resto já é o nome que aparece no topo. */
function nomeConexao(id: string): string {
  if (id === 'op') return '1Password';
  return id.replace(/^mcp:/, '');
}

function oneLine(text: unknown, max = 140): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function describeTool(payload: any): string {
  const tool = String(payload?.tool_name ?? 'ferramenta');
  const input = payload?.tool_input ?? {};
  const arg = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.description ?? '';
  return arg ? `${tool}(${oneLine(arg, 100)})` : tool;
}
