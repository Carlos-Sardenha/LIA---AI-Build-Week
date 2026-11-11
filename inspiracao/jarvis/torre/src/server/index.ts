import * as esbuild from 'esbuild';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { COFRE_DA_TORRE } from '../hook/conexoes-regras.mjs';
import { Conexoes } from './conexoes.js';
import { Conhecimento } from './conhecimento.js';
import { closeOriginal, findExternal, hasTranscript, listExternal } from './external.js';
import { Frentes } from './frentes.js';
import { sugerirFrente } from './frentes-regras.mjs';
import { Rotinas } from './rotinas.js';
import { SessionManager } from './sessions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(ROOT, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.TORRE_PORT ?? 4477);
const URL_BASE = `http://${HOST}:${PORT}`;
const ALLOWED_ORIGINS = new Set([URL_BASE, `http://localhost:${PORT}`]);
// Segredo desta execução: a página recebe embutido no HTML, os hooks pelo ambiente.
const TOKEN = randomBytes(16).toString('hex');
const isWin = process.platform === 'win32';

// TORRE_DATA_DIR separa o estado de uma segunda instância (testes) do da instância do dia a dia.
const DATA_DIR = process.env.TORRE_DATA_DIR ? path.resolve(expandHome(process.env.TORRE_DATA_DIR)) : path.join(os.homedir(), '.torre');
fs.mkdirSync(DATA_DIR, { recursive: true });
ensurePtyHelperExecutable();

/**
 * Quem opera esta Torre (`torre.json` na pasta de estado, opcional):
 * { "nome": "Ana", "permissionMode": "auto" }.
 * O nome entra na instrução das sessões; permissionMode vira o --permission-mode de toda
 * sessão (padrão "auto").
 */
interface TorreConfig { nome?: string; permissionMode?: string; pastaPrincipal?: string }
const CONFIG: TorreConfig = lerConfig(path.join(DATA_DIR, 'torre.json'));
const DONO = typeof CONFIG.nome === 'string' ? CONFIG.nome.trim() : '';
const PERMISSION_MODE = modoDePermissao(CONFIG.permissionMode);
const PASTA_PRINCIPAL = pastaPrincipal(CONFIG.pastaPrincipal);

// O app.js é empacotado sempre na pasta de estado, fora do repositório: o repo pode estar
// numa pasta sincronizada (OneDrive) e o build mudando a cada início ficaria subindo. Também
// separa a instância de teste (TORRE_DATA_DIR) da do dia a dia.
const BUILD_DIR = path.join(DATA_DIR, 'build');
await esbuild.build({
  entryPoints: { app: path.join(ROOT, 'src/client/main.ts') },
  bundle: true,
  outdir: BUILD_DIR,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'warning',
});

// A página e o app.js vão juntos: o HTML é lido uma vez, junto com o empacotamento, para uma
// edição em disco não servir HTML novo com o app.js antigo antes do próximo reinício.
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

const hooksSettings = path.join(DATA_DIR, 'hooks-settings.json');
fs.writeFileSync(hooksSettings, JSON.stringify(buildHooksSettings(), null, 2));

// Conexões (1Password, gcloud, gh, conectores): o topo mostra, o hook das sessões pausa.
const BIN_DIR = path.join(ROOT, 'src/bin');
const conexoes = new Conexoes({ dataDir: DATA_DIR, opReal: acharOpReal() });

// Vale para toda sessão da Torre: credencial é assunto da Torre, e parar é melhor que perguntar.
const INSTRUCAO_TORRE = [
  `Você roda dentro do Jarvis${DONO ? ` de ${DONO}` : ''}, que mantém as conexões: 1Password (cofre ${COFRE_DA_TORRE}), gcloud, gh e os conectores do claude.ai.`,
  `Use as conexões normalmente, inclusive o authenticate de um conector quando for o único caminho: se a conexão estiver caída, um hook do Jarvis barra a chamada e marca a sessão. Nunca peça login a ${DONO || 'quem opera o Jarvis'}. Quando o hook disser que uma conexão caiu, pare na hora e termine a resposta com uma linha dizendo o que ficou parado; o Jarvis retoma a sessão quando a conexão voltar.`,
  `Quando uma ação for barrada por hook ou pelo modo de permissão, ou for destrutiva e precisar de ${DONO || 'quem opera o Jarvis'}, não use AskUserQuestion: pare, diga em uma linha o que precisa e espere o comando.`,
].join(' ');

const manager = new SessionManager({
  dataDir: DATA_DIR,
  hooksSettings,
  args: ['--permission-mode', PERMISSION_MODE, '--append-system-prompt', INSTRUCAO_TORRE],
  env: {
    TORRE_URL: URL_BASE,
    TORRE_TOKEN: TOKEN,
    TORRE_BIN: BIN_DIR,
    TORRE_OP_REAL: conexoes.opReal,
    TORRE_CONEXOES: path.join(DATA_DIR, 'conexoes-estado.json'),
    // O `op` intermediário vem primeiro também para o que roda fora do Bash do Claude (hooks, scripts).
    PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
  },
});

// Frentes: notas de Projetos/ com `frente: true` no vault (PASTA_PRINCIPAL), lidas pelo .harness/lib.
const frentes = new Frentes({
  root: PASTA_PRINCIPAL,
  harnessLib: path.join(ROOT, '..', '.harness', 'lib'),
  dataDir: DATA_DIR,
  sessoes: () => manager.list(),
});
manager.setSugeridor((s) => sugerirFrente(s, frentes.regras()));
// 5 min de conhecimento: pílula diária em System/conhecimento/ do vault.
const conhecimento = new Conhecimento(PASTA_PRINCIPAL);
frentes.on('regras', () => manager.recalcularSugestoes());

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
});

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', URL_BASE);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = INDEX_HTML.replace('__TORRE_TOKEN__', TOKEN);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
    return;
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    serveStatic(url.pathname, res);
    return;
  }

  if (req.headers['x-torre-token'] !== TOKEN) {
    send(res, 403, { error: 'token inválido' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/hook') {
    const { session, event, payload } = await readJson(req);
    manager.onHook(String(session), String(event), payload);
    send(res, 204);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/op') {
    const { args } = await readJson(req);
    send(res, 200, await conexoes.op(args));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/conexoes') {
    send(res, 200, { conexoes: conexoes.lista() });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/conexoes/checar') {
    conexoes.checarTudo();
    send(res, 204);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/conexoes/conectar') {
    const { id } = await readJson(req);
    const c = conexoes.get(String(id));
    if (!c) throw new Error('conexão desconhecida');
    if (c.tipo === 'op') conexoes.conectarOp();
    else if (c.tipo === 'gcloud') conexoes.conectarGcloud();
    else if (c.tipo === 'vpn') conexoes.conectarVpn();
    else if (c.tipo === 'mcp') {
      // O login de conector é OAuth dentro do Claude Code: abre uma sessão já no /mcp, numa
      // pasta confiável (a home pede confiança toda vez).
      send(res, 200, { sessao: manager.open(PASTA_PRINCIPAL, `Login ${c.nome}: no /mcp, escolha ${c.nome} → Authenticate`, '/mcp') });
      return;
    } else throw new Error('esta conexão se renova num terminal: gh auth login');
    send(res, 204);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    send(res, 200, { sessions: manager.list(), home: os.homedir(), principal: PASTA_PRINCIPAL });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/external') {
    send(res, 200, { sessions: listExternal(manager.ids()) });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/import') {
    const { sessionIds } = await readJson(req);
    const results: Array<{ sessionId: string; ok: boolean; error?: string }> = [];
    for (const sessionId of Array.isArray(sessionIds) ? sessionIds.map(String) : []) {
      const original = findExternal(sessionId);
      if (!original) {
        results.push({ sessionId, ok: false, error: 'sessão não está mais aberta' });
        continue;
      }
      try {
        await closeOriginal(original.pid);
        manager.adopt(sessionId, original.cwd, hasTranscript(sessionId));
        results.push({ sessionId, ok: true });
      } catch (err) {
        results.push({ sessionId, ok: false, error: (err as Error).message });
      }
    }
    send(res, 200, { results });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/complete') {
    send(res, 200, { matches: completeDir(url.searchParams.get('p') ?? '') });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sessions') {
    const { cwd, name, frente } = await readJson(req);
    const f = String(frente ?? '').trim();
    if (f && !(await frentes.existe(f))) throw new Error(`frente desconhecida: ${f}`);
    const pasta = expandHome(String(cwd ?? '').trim());
    // Sem pasta: a 1ª pasta da frente (se existir no disco), senão a principal.
    const destino = pasta ? path.resolve(normalizarDrive(pasta)) : (f && (await frentes.primeiraPasta(f))) || PASTA_PRINCIPAL;
    send(res, 201, manager.open(destino, name, undefined, f));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/frentes') {
    send(res, 200, { frentes: await frentes.lista() });
    return;
  }
  const frenteRota = url.pathname.match(/^\/api\/frentes\/([\w.-]+)(?:\/(tarefa|atualizar))?$/);
  if (frenteRota) {
    const [, fid, acao] = frenteRota;
    if (req.method === 'GET' && !acao) {
      const d = await frentes.detalhe(fid);
      if (d) send(res, 200, d);
      else send(res, 404, { error: 'frente não encontrada' });
      return;
    }
    if (req.method === 'POST' && acao === 'tarefa') {
      send(res, 200, await frentes.tarefa(fid, await readJson(req)));
      return;
    }
    if (req.method === 'POST' && acao === 'atualizar') {
      if (await frentes.atualizar(fid)) send(res, 202, { atualizando: true });
      else send(res, 404, { error: 'frente não encontrada' });
      return;
    }
  }
  // Pendências: TODO inteiro, compromissos, agenda e projetos; escrita no TODO pelo jarvis_tarefa.
  if (req.method === 'GET' && url.pathname === '/api/pendencias') {
    send(res, 200, await frentes.pendencias());
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/pendencias/tarefa') {
    send(res, 200, await frentes.tarefaGeral(await readJson(req)));
    return;
  }
  // 5 min de conhecimento: a pílula mais recente, a nota no vault e gerar de novo numa sessão.
  if (req.method === 'GET' && url.pathname === '/api/conhecimento') {
    send(res, 200, conhecimento.ler(url.searchParams.get('data') ?? undefined));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/conhecimento/nota') {
    const { data } = await readJson(req);
    const r = conhecimento.salvarNota(typeof data === 'string' ? data : undefined);
    broadcast({ type: 'conhecimento' });
    send(res, 200, r);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/conhecimento/gerar') {
    send(res, 201, manager.open(PASTA_PRINCIPAL, '5 min de conhecimento', '/conhecimento'));
    return;
  }
  const moverFrente = url.pathname.match(/^\/api\/sessions\/([\w-]+)\/frente$/);
  if (req.method === 'POST' && moverFrente) {
    const f = String((await readJson(req)).frente ?? '').trim();
    if (f && !(await frentes.existe(f))) throw new Error(`frente desconhecida: ${f}`);
    send(res, 200, manager.setFrente(moverFrente[1], f));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sessions/order') {
    const { ids } = await readJson(req);
    send(res, 200, { ids: manager.reorder(Array.isArray(ids) ? ids.map(String) : []) });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sessions/forget-exited') {
    send(res, 200, { removed: manager.forgetExited() });
    return;
  }
  const action = url.pathname.match(/^\/api\/sessions\/([\w-]+)\/(resume|kill|forget|rename)$/);
  if (req.method === 'POST' && action) {
    const [, id, verb] = action;
    if (verb === 'rename') send(res, 200, manager.rename(id, (await readJson(req)).title));
    if (verb === 'resume') send(res, 200, manager.resume(id));
    if (verb === 'kill') (manager.kill(id), send(res, 204));
    if (verb === 'forget') (manager.forget(id), send(res, 204));
    return;
  }
  send(res, 404, { error: 'rota desconhecida' });
}

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', URL_BASE);
  if (url.pathname !== '/ws' || url.searchParams.get('t') !== TOKEN || !ALLOWED_ORIGINS.has(req.headers.origin ?? '')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: 'snapshot', sessions: manager.list() }));
  for (const meta of manager.list()) {
    const data = manager.buffer(meta.id);
    if (data) ws.send(JSON.stringify({ type: 'output', id: meta.id, data }));
  }
  ws.on('message', (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === 'input') manager.write(msg.id, String(msg.data));
    if (msg.type === 'prompt') manager.prompt(msg.id, String(msg.text));
    if (msg.type === 'resize') manager.resize(msg.id, Number(msg.cols), Number(msg.rows));
  });
});

const broadcast = (msg: object) => {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(data);
};
manager.on('meta', (session) => broadcast({ type: 'meta', session }));
manager.on('output', (id, data) => broadcast({ type: 'output', id, data }));
manager.on('removed', (id) => broadcast({ type: 'removed', id }));
manager.on('order', (ids) => broadcast({ type: 'order', ids }));
conexoes.on('changed', () => broadcast({ type: 'conexoes', conexoes: conexoes.lista() }));
conexoes.on('voltou', (id: string, nome: string) => manager.conexaoVoltou(id, nome));
frentes.on('mudou', (id: string) => broadcast({ type: 'frentes', id }));

// Rotinas agendadas (rotinas.json na pasta de estado, opcional): abrem uma sessão com o pedido marcado.
const rotinas = new Rotinas({ dataDir: DATA_DIR, manager });

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`A porta ${PORT} já está em uso: outro Jarvis aberto? Use TORRE_PORT para escolher outra.`);
  else console.error('[servidor]', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Jarvis no ar: ${URL_BASE}`);
  rotinas.iniciar();
  // Ciclo de abertura: TORRE_ABERTURA=0 só checa, sem pedir a digital (testes).
  (process.env.TORRE_ABERTURA === '0' ? conexoes.checarTudo() : conexoes.abertura()).catch((err) => console.error('[conexões]', err));
});

/**
 * Hooks das sessões. O Claude Code roda cada hook por um shell (no Windows, Git Bash ou cmd):
 * o caminho vai com barras normais e entre aspas, porque a pasta tem espaços e acentos.
 */
function buildHooksSettings() {
  const script = caminhoDeHook(path.join(ROOT, 'src/hook/report.mjs'));
  const hook = (event: string) => [{ hooks: [{ type: 'command', command: `node "${script}" ${event}`, timeout: 5 }] }];
  // Pausa por conexão caída, em toda sessão, e o PATH do `op` intermediário no início.
  const conexoesScript = caminhoDeHook(path.join(ROOT, 'src/hook/conexoes.mjs'));
  const conexoesHook = (event: string) => ({ type: 'command', command: `node "${conexoesScript}" ${event}`, timeout: 5 });
  return {
    hooks: {
      SessionStart: [{ hooks: [...hook('SessionStart')[0].hooks, conexoesHook('SessionStart')] }],
      UserPromptSubmit: hook('UserPromptSubmit'),
      PreToolUse: [{ matcher: '*', hooks: [conexoesHook('PreToolUse'), ...hook('PreToolUse')[0].hooks] }],
      PostToolUse: [{ matcher: '*', hooks: [...hook('PostToolUse')[0].hooks, conexoesHook('PostToolUse')] }],
      Notification: hook('Notification'),
      Stop: hook('Stop'),
    },
  };
}

/** C:\Users\Ana\torre\x.mjs → C:/Users/Ana/torre/x.mjs: vale no Git Bash, no cmd e no PowerShell. */
function caminhoDeHook(file: string): string {
  return file.split(path.sep).join('/');
}

/** O --permission-mode das sessões: o do torre.json, ou "auto". Só letras passam. */
/**
 * Pasta onde as sessões abrem por padrão: `pastaPrincipal` do torre.json; sem ela, a raiz do
 * Jarvis (o segundo cérebro), que é a pasta acima de torre/. Rodando de um worktree
 * (.claude/worktrees/<nome>), sobe até o checkout principal do vault.
 */
function pastaPrincipal(valor: unknown): string {
  const configurada = typeof valor === 'string' && valor.trim() ? path.resolve(expandHome(valor.trim())) : '';
  if (configurada && fs.existsSync(configurada) && fs.statSync(configurada).isDirectory()) return configurada;
  if (configurada) console.error(`[torre.json] pastaPrincipal não encontrada (${configurada}): usando a raiz do Jarvis`);
  const raiz = path.dirname(ROOT);
  const worktree = raiz.match(/^(.*?)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/);
  return worktree && fs.existsSync(worktree[1]) ? worktree[1] : raiz;
}

function modoDePermissao(valor: unknown): string {
  const modo = typeof valor === 'string' ? valor.trim() : '';
  if (!modo) return 'auto';
  if (!/^[A-Za-z]+$/.test(modo)) {
    console.error(`[torre.json] permissionMode inválido (${modo}): usando "auto"`);
    return 'auto';
  }
  return modo;
}

/** O `op` de verdade: o primeiro do PATH que não é o intermediário da Torre. */
function acharOpReal(): string {
  const mesmo = (a: string, b: string) => (isWin ? a.toLowerCase() === b.toLowerCase() : a === b);
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const limpo = dir.trim().replace(/^"(.*)"$/, '$1');
    if (!limpo || mesmo(path.resolve(limpo), BIN_DIR)) continue;
    const file = path.join(limpo, isWin ? 'op.exe' : 'op');
    if (fs.existsSync(file)) return file;
  }
  return 'op';
}

/**
 * O node-pty precisa do `spawn-helper` executável no macOS/Linux. Quem instala
 * com npm bloqueando scripts de dependência fica sem o chmod do post-install
 * e o spawn falha com "posix_spawnp failed". No Windows não há helper.
 */
function ensurePtyHelperExecutable(): void {
  if (isWin) return;
  const prebuilds = path.join(ROOT, 'node_modules/node-pty/prebuilds');
  if (!fs.existsSync(prebuilds)) return;
  for (const dir of fs.readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, dir, 'spawn-helper');
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  }
}

function serveStatic(pathname: string, res: http.ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    send(res, 404, { error: 'não encontrado' });
    return;
  }
  const base = decoded.startsWith('/build/') ? BUILD_DIR : PUBLIC;
  const file = path.normalize(path.join(base, decoded.replace(/^\/build\//, '/')));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, { error: 'não encontrado' });
    return;
  }
  const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function send(res: http.ServerResponse, status: number, body?: object): void {
  res.writeHead(status, body ? { 'content-type': 'application/json' } : {});
  res.end(body ? JSON.stringify(body) : undefined);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('corpo grande demais');
  }
  return raw ? JSON.parse(raw) : {};
}

function lerConfig(file: string): TorreConfig {
  try {
    // O Bloco de Notas do Windows pode gravar com BOM.
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** `~`, `~/pasta` e `~\pasta` viram a pasta da pessoa. */
function expandHome(p: string): string {
  return p === '~' || /^~[\\/]/.test(p) ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Windows: "C:" sozinho é a pasta atual daquele drive para o Node; aqui quer dizer a raiz. */
function normalizarDrive(p: string): string {
  return isWin && /^[A-Za-z]:$/.test(p) ? `${p}\\` : p;
}

/**
 * Completa um caminho parcial como o Tab do shell: devolve as subpastas de
 * `dirname(p)` cujo nome começa com `basename(p)`. Pastas ocultas só aparecem
 * quando o trecho digitado já começa com ponto. No Windows aceita `/` e `\`, "C:"
 * sozinho (a raiz do drive) e não diferencia maiúsculas.
 */
function completeDir(partial: string): string[] {
  const full = normalizarDrive(expandHome(partial.trim()));
  if (!full) return [];
  const endsWithSep = /[\\/]$/.test(full);
  const dir = endsWithSep ? full : path.dirname(full);
  const prefix = endsWithSep ? '' : path.basename(full);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const caseless = process.platform !== 'linux';
  const norm = (s: string) => (caseless ? s.toLowerCase() : s);
  return entries
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .filter((e) => norm(e.name).startsWith(norm(prefix)))
    .filter((e) => prefix.startsWith('.') || !e.name.startsWith('.'))
    // Pastas de sistema do Windows ($Recycle.Bin, $WinREAgent…) só quando pedidas.
    .filter((e) => !isWin || prefix.startsWith('$') || !e.name.startsWith('$'))
    .map((e) => path.join(dir, e.name))
    .filter((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 50);
}
