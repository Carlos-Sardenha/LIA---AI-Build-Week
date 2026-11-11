// Regras de conexão das sessões da Torre, num lugar só: o `op` intermediário
// (src/bin/op, op.cmd → op-intermediario.mjs), o hook que pausa a sessão
// (conexoes.mjs) e o servidor usam as mesmas. Tudo aqui é puro (sem rede, sem
// processo filho): dá para testar com `node teste/conexoes.test.mjs`.
import fs from 'node:fs';
import path from 'node:path';

/** Único cofre que a Torre lê pelo login dela; os outros seguem pedindo a digital. */
export const COFRE_DA_TORRE = 'wehandle';

/**
 * O pedido ao 1Password sai pelo login da Torre (uma digital para todas as sessões)?
 * Só leitura no cofre wehandle e nunca a credencial de escrita: o resto vai para o
 * `op` de verdade, que pede a digital na própria sessão, como antes.
 */
export function opPelaTorre(args) {
  if (args.some((a) => /prod/i.test(a))) return false;
  const [cmd, sub] = args;
  if (cmd === 'whoami') return true;
  if (cmd === 'read') {
    const uris = args.slice(1).filter((a) => a.startsWith('op://'));
    return uris.length > 0 && uris.every((u) => u.startsWith(`op://${COFRE_DA_TORRE}/`));
  }
  if (cmd === 'item' && (sub === 'get' || sub === 'list')) return cofreDe(args) === COFRE_DA_TORRE;
  return false;
}

function cofreDe(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--vault') return args[i + 1] ?? '';
    if (a.startsWith('--vault=')) return a.slice('--vault='.length);
  }
  return '';
}

/**
 * Qual conexão a ferramenta precisa. Devolve o id da conexão (op, gcloud, gh,
 * vpn, mcp:<Nome>) ou '' quando não depende de nenhuma que a Torre acompanha.
 * Os nomes de conector chegam normalizados: "Microsoft 365" → "Microsoft_365".
 */
export function conexaoDaFerramenta(tool, input, conectores = []) {
  return conexoesDaFerramenta(tool, input, conectores)[0] ?? '';
}

/**
 * Todas as conexões de que a ferramenta depende. Um comando só pode precisar de
 * mais de uma: `op item get wehandle-ro … && psql` usa o 1Password e a VPN.
 * No Windows o Claude Code roda comandos pela ferramenta PowerShell (sem Git Bash):
 * mesmas regras, com `op.exe`, `& "C:\…\gh.exe"` etc. reconhecidos.
 */
export function conexoesDaFerramenta(tool, input, conectores = []) {
  if (tool === 'Bash' || tool === 'PowerShell') return conexoesDoComando(String(input?.command ?? ''));
  const mcp = String(tool).match(/^mcp__claude_ai_(.+?)__/);
  if (!mcp) return [];
  const nome = conectores.find((n) => normalizar(n) === mcp[1]);
  return nome ? [`mcp:${nome}`] : [];
}

/** CLIs que as regras olham; no Windows chegam como op.exe, gcloud.cmd, C:\…\psql.exe. */
const CLIS = 'op|gh|gcloud|bq|dbt|psql|pg_dump';

/**
 * Tira caminho e extensão do Windows das CLIs acompanhadas, para as regras de
 * baixo valerem igual: `& "C:\Program Files\op.exe" read …` → `& op read …`,
 * `gh.exe pr list` → `gh pr list`. Só mexe quando há extensão (.exe/.cmd/.bat) ou
 * aspas em volta de um caminho: `ls ~/.config/gcloud` continua sendo argumento.
 */
function semCaminhoWindows(cmd) {
  const ext = '(?:\\.(?:exe|cmd|bat|ps1))';
  return cmd
    // Caminho entre aspas (com ou sem extensão): "C:\x\op.exe" / 'C:/x/gh'
    .replace(new RegExp(`(["'])(?:[^"'\\s]*?[^"']*?[\\\\/])?(${CLIS})${ext}?\\1(?=\\s|$)`, 'gi'), (_m, _q, n) => n.toLowerCase())
    // Caminho sem aspas com extensão: C:\x\psql.exe / /c/x/op.exe
    .replace(new RegExp(`(?<=^|[\\s;&|(\`{])(?:[A-Za-z]:)?(?:[^\\s"'|;&()]*[\\\\/])?(${CLIS})${ext}(?=\\s|$)`, 'gi'), (_m, n) => n.toLowerCase());
}

function conexoesDoComando(bruto) {
  const cmd = semCaminhoWindows(bruto);
  const ids = [];
  // Rede interna (réplica, PROD, Airflow, Kafka UI) só passa pela VPN.
  if (precisaDaVpn(cmd)) ids.push('vpn');
  const op = cmd.match(/(?:^|[\s;&|(`${])op\s+([^|;&)`}]*)/);
  if (op && opPelaTorre(op[1].trim().split(/\s+/).map((a) => a.replace(/^["']|["']$/g, '')))) ids.push('op');
  if (/(?:^|[\s;&|(`{])(gcloud|bq)\s/.test(cmd)) ids.push('gcloud');
  else if (/(?:^|[\s;&|(`{])dbt\s+(run|build|test|seed|show|debug|snapshot)\b/.test(cmd)) ids.push('gcloud');
  if (/(?:^|[\s;&|(`{])gh\s/.test(cmd)) ids.push('gh');
  return ids;
}

export function precisaDaVpn(bruto) {
  const cmd = semCaminhoWindows(bruto);
  return /\.internal\.wehandle\.com\.br\b/.test(cmd)
    || /\.rds\.amazonaws\.com\b/.test(cmd)
    // psql na posição de comando (início, depois de ; & | ( { ` ou $(, com VAR=x antes ou
    // $env:VAR='x'; no PowerShell), não como argumento de grep/Select-String.
    || /(?:^|[;&|(`{]|\$\()\s*(?:[A-Za-z_]\w*=\S*\s+)*(psql|pg_dump)\s/.test(cmd);
}

export function normalizar(nome) {
  return String(nome).replace(/[^A-Za-z0-9]/g, '_');
}

// ---------- CLIs no PATH (Windows: PATHEXT) ----------

/** Valor de uma variável de ambiente sem ligar para maiúsculas (no Windows é `Path`). */
function envVar(env, nome) {
  if (env[nome] !== undefined) return env[nome];
  const chave = Object.keys(env).find((k) => k.toUpperCase() === nome.toUpperCase());
  return chave ? env[chave] : undefined;
}

function ehArquivo(f) {
  try {
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
}

/**
 * Caminho absoluto do executável `nome`, procurado no PATH como o shell faria; ''
 * quando não está instalado. No Windows usa as extensões do PATHEXT (op.exe,
 * gcloud.cmd) e ignora arquivos sem extensão (o `op` de shell da Torre não roda
 * fora do Git Bash). `ignorar` tira pastas da busca (a src/bin da Torre, para o
 * `op` de verdade não ser o intermediário). `existe` só existe para os testes.
 */
export function acharExecutavel(nome, { env = process.env, platform = process.platform, ignorar = [], existe = ehArquivo } = {}) {
  if (!nome) return '';
  const win = platform === 'win32';
  const p = win ? path.win32 : path.posix;
  const exts = win
    ? (envVar(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [''];
  const candidatos = (base) => {
    if (!win) return [base];
    const ext = p.extname(base).toLowerCase();
    return ext && exts.includes(ext) ? [base] : exts.map((e) => base + e);
  };
  // Com pasta no nome (absoluto ou relativo): só ele, sem PATH.
  if (/[\\/]/.test(nome)) return candidatos(nome).find((c) => existe(c)) ?? '';
  const mesma = (a, b) => (win ? p.resolve(a).toLowerCase() === p.resolve(b).toLowerCase() : p.resolve(a) === p.resolve(b));
  const pastas = String(envVar(env, 'PATH') ?? '')
    .split(win ? ';' : ':')
    .map((d) => d.trim().replace(/^"(.*)"$/, '$1'))
    .filter((d) => d && !ignorar.some((i) => i && mesma(d, i)));
  for (const dir of pastas) {
    for (const c of candidatos(p.join(dir, nome))) if (existe(c)) return c;
  }
  return '';
}

// ---------- Rodar .cmd/.bat no Windows ----------

// Mesmas regras do cross-spawn: tudo que o cmd.exe interpreta leva ^ na frente.
const META_CMD = /([()\][%!^"`<>&|;, *?])/g;

function escaparArgCmd(arg, duplo) {
  let a = String(arg);
  // Barras antes de aspas dobram e a aspa vira \" (regra do CommandLineToArgvW).
  a = a.replace(/(\\*)"/g, '$1$1\\"');
  a = a.replace(/(\\*)$/, '$1$1');
  a = `"${a}"`;
  a = a.replace(META_CMD, '^$1');
  if (duplo) a = a.replace(META_CMD, '^$1');
  return a;
}

/**
 * Como rodar `arquivo args` com execFile/spawn sem shell. No Windows, .cmd/.bat não
 * rodam sem o cmd.exe (o Node recusa desde o CVE-2024-27980): monta
 * `cmd.exe /d /s /c "<linha>"` com cada argumento escapado, e os argumentos vão
 * literais (windowsVerbatimArguments). Nos outros casos, devolve como veio.
 */
export function montarExecucao(arquivo, args, { platform = process.platform, comspec } = {}) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(arquivo)) {
    return { arquivo, args: [...args], verbatim: false };
  }
  // Shim do npm (node_modules/.bin/x.cmd) repassa %* de novo: escape em dobro.
  const duplo = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(arquivo);
  const linha = [String(arquivo).replace(META_CMD, '^$1'), ...args.map((a) => escaparArgCmd(a, duplo))].join(' ');
  return { arquivo: comspec || 'cmd.exe', args: ['/d', '/s', '/c', `"${linha}"`], verbatim: true };
}

// ---------- `claude mcp list` ----------

function semAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');
}

/**
 * Situação de um conector do claude.ai na saída de `claude mcp list`. Aceita \r\n,
 * cores ANSI e os marcadores de cada sistema (✔/✓/Connected, ✗/✘/Failed,
 * Needs authentication). Devolve { ok, detalhe }; ok null quando a linha não diz.
 */
export function statusDoConector(saida, nome) {
  const linhas = semAnsi(saida).split(/\r?\n/).map((l) => l.trim());
  const linha = linhas.find((l) => l.startsWith(`claude.ai ${nome}:`));
  if (!linha) return { ok: false, detalhe: 'não aparece na conta (conector removido?)' };
  const status = linha.includes(' - ') ? linha.slice(linha.lastIndexOf(' - ') + 3).trim() : linha;
  if (/Needs authentication|needs auth/i.test(status)) return { ok: false, detalhe: 'pede login · clique para abrir o /mcp' };
  if (/[✗✘×]|Failed|Error/i.test(status)) return { ok: false, detalhe: status.replace(/^[✗✘×!]\s*/, '').slice(0, 140) || 'falhou' };
  if (/[✔✓√]|Connected/i.test(status)) return { ok: true, detalhe: 'conectado' };
  return { ok: false, detalhe: status.replace(/^[^\w]+\s*/, '').slice(0, 140) || 'falhou' };
}

// ---------- PATH pelo CLAUDE_ENV_FILE ----------

/**
 * Linha que o hook SessionStart grava no CLAUDE_ENV_FILE para pôr a src/bin da
 * Torre à frente do PATH. O arquivo é lido pelo shell Bash do Claude Code (Git Bash
 * no Windows): caminho do Windows vira /c/Users/…, com aspas e $ ` " \ escapados.
 */
export function linhaPath(bin, platform = process.platform) {
  let dir = String(bin);
  if (platform === 'win32') {
    dir = dir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_m, d) => `/${d.toLowerCase()}`);
  }
  dir = dir.replace(/(["$`\\])/g, '\\$1');
  return `export PATH="${dir}:$PATH"\n`;
}
