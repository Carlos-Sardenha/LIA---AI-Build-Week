import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

type Status = 'starting' | 'working' | 'waiting' | 'idle' | 'exited';
interface Usage { model: string | null; context: number; input: number; output: number; cacheRead: number }
interface SessionMeta {
  id: string; name: string; title: string; titleSource: string; cwd: string; status: Status; detail: string; updatedAt: number; usage: Usage | null; aguardando?: string[];
  /** '' = Geral (contrato das frentes). Servidor antigo não manda: vale ''. */
  frente?: string;
  sugestao?: { frente: string; motivo: string } | null;
}

// ---------- Frentes (contrato em torre/FRENTES-CONTRATO.md) ----------
type Quadrante = 'P1' | 'P2' | 'P3' | 'P4' | 'AG' | 'OK';
interface Tarefa { id: string; texto: string; quadrante: Quadrante; prazo?: string; vencida: boolean; quem?: string; fonte?: string; jira?: string }
interface JiraCard { key: string; titulo: string; status: string; responsavel?: string; url: string; atualizado?: string }
interface TeamsItem { tipo: 'chat' | 'canal' | 'reuniao'; titulo: string; quem?: string; quando: string; trecho: string; url?: string }
interface Externo { jira: JiraCard[]; teams: TeamsItem[]; atualizadoEm: number | null; atualizando: boolean; erro?: string }
interface FrenteResumo {
  id: string; titulo: string; status: string; cor: string; repo?: string;
  resumo: { abertas: number; p1: number; vencidas: number; aguardando: number; sessoes: number; esperando: number; trabalhando: number };
  proximo?: { texto: string; prazo: string };
  externoEm: number | null;
}
interface FrenteDetalhe extends FrenteResumo {
  objetivo: string;
  pastas: string[]; nota: string;
  todo: Tarefa[]; versao: string;
  compromissos: Array<{ id: string; titulo: string; assumido_por?: string; prazo?: string; status?: string; vencido: boolean }>;
  reunioes: Array<{ id: string; data: string; titulo: string }>;
  decisoes: Array<{ id: string; data: string; titulo: string }>;
  pessoas: Array<{ id: string; nome: string }>;
  externo: Externo;
}
type Rota = { aba: 'visao' } | { aba: 'pendencias' } | { aba: 'geral' } | { aba: 'frente'; id: string };

// Aba Pendências (GET /api/pendencias): o TODO inteiro, compromissos, agenda e projetos.
interface TarefaGeral extends Tarefa { frentes: string[]; ctx?: string; cobrar?: string; desde?: string }
interface ReuniaoAgenda { id: string; data: string; hora?: string; titulo: string; participantes: string[]; frentes: string[]; futura: boolean }
interface Pendencias {
  hoje: string;
  versao: string;
  todo: TarefaGeral[];
  compromissos: Array<{ id: string; titulo: string; assumido_por?: string; meu: boolean; prazo?: string; status?: string; vencido: boolean; frentes: string[] }>;
  agenda: ReuniaoAgenda[];
  recentes: ReuniaoAgenda[];
  projetos: Array<{ id: string; titulo: string; status: string; prazo?: string; frente: boolean; abertas: number; p1: number; vencidas: number; nota: string }>;
}

interface Conexao { id: string; nome: string; tipo: 'op' | 'gcloud' | 'gh' | 'vpn' | 'mcp'; ok: boolean | null; detalhe: string; checadoEm: number; conectando?: boolean }

interface Card {
  meta: SessionMeta;
  el: HTMLElement;
  term: Terminal;
  fit: FitAddon;
  selected: boolean;
}

const TOKEN: string = (window as any).TORRE_TOKEN;
const STATUS_LABEL: Record<Status, string> = {
  starting: 'Abrindo', working: 'Trabalhando', waiting: 'Esperando você', idle: 'Ociosa', exited: 'Encerrada',
};
// Cores por família de modelo vêm do tema (style.css), para manter contraste no claro e no escuro.
const MODEL_COLORS: Record<string, string> = { opus: 'var(--m-opus)', sonnet: 'var(--m-sonnet)', haiku: 'var(--m-haiku)', fable: 'var(--m-fable)' };
// Na paleta Colorido cada card ganha uma cor própria.
const CARD_HUES = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
/** Mac usa ⌘ nos atalhos; Windows e Linux usam Ctrl (e o copiar/colar do Windows Terminal). */
const IS_MAC = /mac|iphone|ipad/i.test((navigator as any).userAgentData?.platform || navigator.platform || '');
// Fontes do Windows primeiro (Cascadia vem com o Windows Terminal; Consolas, com o Windows), depois as do Mac.
const TERM_FONT = "'Geist Mono', 'Cascadia Mono', 'Cascadia Code', Consolas, ui-monospace, SFMono-Regular, Menlo, monospace";

const cards = new Map<string, Card>();
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const grid = $('#grid');
let focusId: string | null = null;
let confirmCleanUntil = 0;
let layout: 'grade' | 'foco' = 'grade';
/** Status escolhido na barra lateral ou no topo: os cards dele vão para a frente da grade. */
let statusFrente: Status | null = null;
let socket: WebSocket;
/** Aba atual (vem do hash: #/visao, #/geral, #/frente/<id>). */
let rota: Rota = lerRota();
/** Frentes conhecidas (GET /api/frentes); vazio enquanto o servidor não tem a rota. */
let frentes: FrenteResumo[] = [];
const detalhes = new Map<string, FrenteDetalhe>();

// ---------- Movimento ----------
// Nada linear: chegadas com mola, deslocamentos com saída suave, saídas rápidas. Quem pede menos
// movimento no sistema operacional recebe a mudança direto, sem animação.
const REDUZIR = matchMedia('(prefers-reduced-motion: reduce)');
const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const EASE_MOLA = 'cubic-bezier(.34, 1.4, .64, 1)';
let entradas = 0;
let ultimaEntrada = 0;

/**
 * Card novo sobe e assenta; vários de uma vez (snapshot, importação) entram em cascata.
 * Sem escala: o xterm mede a fonte quando abre, e um card encolhido o faria errar as colunas.
 */
function entrar(el: HTMLElement): Animation | undefined {
  if (REDUZIR.matches) return undefined;
  const agora = performance.now();
  if (agora - ultimaEntrada > 350) entradas = 0;
  ultimaEntrada = agora;
  const atraso = Math.min(entradas++, 8) * 60;
  return el.animate(
    [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
    { duration: 560, delay: atraso, easing: EASE_MOLA, fill: 'backwards' },
  );
}

/**
 * FLIP: mede onde cada card está, aplica a mudança e anima cada um do lugar antigo até o novo.
 * Só translada (escala deformaria o texto do terminal); quem mudou de tamanho entra com um fade curto.
 */
function flip(mudar: () => void): void {
  if (REDUZIR.matches) return mudar();
  const antes = new Map<HTMLElement, DOMRect>();
  for (const c of cards.values()) if (c.el.offsetParent) antes.set(c.el, c.el.getBoundingClientRect());
  mudar();
  for (const [el, a] of antes) {
    if (!el.isConnected || !el.offsetParent) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    const redimensionou = Math.abs(a.width - b.width) > 4 || Math.abs(a.height - b.height) > 4;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !redimensionou) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: redimensionou ? 0.55 : 1 }, { transform: 'none', opacity: 1 }],
      { duration: 480, easing: EASE_OUT },
    );
  }
}

/** Reinicia uma animação de CSS de "mudou" (troca de status, número novo). */
function bump(el: HTMLElement, classe: string): void {
  if (REDUZIR.matches) return;
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
}

// ---------- API ----------

async function api(path: string, body?: object): Promise<any> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-torre-token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  // Rota ainda inexistente (servidor antigo) pode não responder JSON: vira erro com o status.
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw Object.assign(new Error(data?.error ?? `erro ${res.status}`), { status: res.status });
  return data;
}

function sendWs(msg: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${proto}://${location.host}/ws?t=${TOKEN}`);
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'snapshot') {
      for (const meta of msg.sessions as SessionMeta[]) upsert(meta);
    } else if (msg.type === 'meta') {
      upsert(msg.session);
    } else if (msg.type === 'output') {
      cards.get(msg.id)?.term.write(msg.data);
    } else if (msg.type === 'removed') {
      remove(msg.id);
    } else if (msg.type === 'conexoes') {
      renderConexoes(msg.conexoes);
      return;
    } else if (msg.type === 'order') {
      // Outra aba (ou a própria) arrastou: segue a ordem oficial, sem mexer num arrasto em curso.
      if (!drag) applyOrder(msg.ids, false);
      return;
    } else if (msg.type === 'frentes') {
      frenteMudou(String(msg.id ?? '*'));
      return;
    } else if (msg.type === 'conhecimento') {
      void carregarConhecimento();
      return;
    }
    refreshSummary();
  };
  socket.onopen = () => {
    for (const card of cards.values()) {
      card.term.reset();
      // O pty do outro lado pode ter nascido de novo (100×30): manda o tamanho atual mesmo sem mudança.
      sendWs({ type: 'resize', id: card.meta.id, cols: card.term.cols, rows: card.term.rows });
    }
    api('/api/conexoes').then((d) => renderConexoes(d.conexoes)).catch(alertError);
    frenteMudou('*');
    void carregarConhecimento();
  };
  socket.onclose = () => {
    $('#subtitle').textContent = 'servidor desconectado · tentando de novo…';
    // A cada reinício o servidor gera um token novo e recusa o desta página para sempre:
    // com o servidor de volta, recarrega para pegar o token novo (e os terminais voltam inteiros).
    setTimeout(() => {
      fetch('/', { cache: 'no-store' })
        .then((r) => (r.ok ? location.reload() : connect()))
        .catch(() => connect());
    }, 1500);
  };
}

// ---------- Cards ----------

function upsert(meta: SessionMeta): void {
  const existing = cards.get(meta.id);
  if (existing) {
    const before = existing.meta.status;
    const frenteAntes = frenteDe(existing.meta);
    existing.meta = meta;
    paint(existing);
    if (meta.status === 'waiting' && before !== 'waiting') notify(meta);
    // Mudou de frente: sai desta aba (ou entra nela) sem recriar o terminal.
    if (frenteAntes !== frenteDe(meta)) aplicarAba(true);
    return;
  }
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.frente = frenteDe(meta);
  el.hidden = !cardNaAba(meta);
  el.innerHTML = `
    <div class="card-head">
      <span class="grip" title="Arraste para mudar a ordem">⠿</span>
      <span class="kbd"></span>
      <div class="title"><div class="title-row"><b data-act="rename" title="Clique para renomear"></b><button type="button" class="rename" data-act="rename" title="Renomear este terminal">✎</button></div><span></span></div>
      <label class="sel"><input type="checkbox"> Em lote</label>
      <span class="pill"></span>
    </div>
    <div class="meta">
      <span class="model">sem resposta ainda</span>
      <span class="ctx">contexto <span class="track"><span class="fill"></span></span> <span class="mono ctx-label">—</span></span>
      <span class="mono tok"></span>
    </div>
    <div class="sugestao" hidden>
      <span class="sug-dot"></span>
      <span class="sug-txt"></span>
      <button type="button" class="btn small" data-act="sug-mover">Mover</button>
      <button type="button" class="sug-x" data-act="sug-x" title="Manter na Geral (esconde a sugestão nesta página)" aria-label="Manter na Geral">✕</button>
    </div>
    <div class="term"></div>
    <div class="card-foot">
      <span class="detail"></span>
      <button type="button" class="btn small ghost" data-act="mover" aria-haspopup="menu">Mover para…</button>
      <button type="button" class="btn small" data-act="focus">Ampliar</button>
      <button type="button" class="btn small" data-act="resume">Retomar</button>
      <button type="button" class="btn small ghost" data-act="kill">Encerrar</button>
      <button type="button" class="btn small ghost" data-act="forget">Remover</button>
    </div>`;
  grid.append(el);
  const chegada = entrar(el);

  const term = new Terminal({
    fontFamily: TERM_FONT,
    fontSize: 13,
    cursorBlink: true,
    allowProposedApi: false,
    scrollback: 5000,
    // No Windows o clique direito cola (como no Windows Terminal), não seleciona palavra.
    rightClickSelectsWord: IS_MAC,
    theme: termTheme(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const box = el.querySelector('.term') as HTMLElement;
  term.open(box);
  // Os atalhos da Torre passam por cima do terminal; fora do Mac, também o copiar/colar.
  term.attachCustomKeyEventHandler((e) => !isTorreShortcut(e) && (IS_MAC || clipboardKey(term, e)));
  if (!IS_MAC) box.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    void rightClick(term);
  });
  term.onData((data) => sendWs({ type: 'input', id: meta.id, data }));
  term.onResize(({ cols, rows }) => sendWs({ type: 'resize', id: meta.id, cols, rows }));
  term.textarea?.addEventListener('focus', () => setFocusTarget(meta.id));

  const card: Card = { meta, el, term, fit, selected: false };
  el.style.setProperty('--card-hue', CARD_HUES[cards.size % CARD_HUES.length]);
  cards.set(meta.id, card);
  new ResizeObserver(() => refit(card)).observe(box);
  chegada?.finished.then(() => refit(card), () => {});

  const checkbox = el.querySelector('.sel input') as HTMLInputElement;
  checkbox.addEventListener('change', () => {
    card.selected = checkbox.checked;
    refreshBatch();
  });
  const head = el.querySelector('.card-head') as HTMLElement;
  head.addEventListener('click', (ev) => {
    // O clique que fecha um arrasto não renomeia.
    if (suppressClick) return;
    if ((ev.target as HTMLElement).closest('[data-act="rename"]')) startRename(card);
  });
  // Na grade, o cabeçalho inteiro é alça de arrastar (menos botões e caixas).
  head.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || layout !== 'grade' || el.classList.contains('renaming')) return;
    if ((ev.target as HTMLElement).closest('button, input, label')) return;
    beginPress(ev, { id: meta.id, handle: head, container: grid, itemSel: '.card', axis: 'x', onClick: null });
  });
  el.querySelector('.sugestao')!.addEventListener('click', (ev) => {
    const act = (ev.target as HTMLElement).closest('button')?.dataset.act;
    const sug = card.meta.sugestao;
    if (!sug) return;
    if (act === 'sug-mover') void moverSessao(card, sug.frente);
    if (act === 'sug-x') {
      ocultarSugestao(card.meta.id, sug.frente);
      paint(card);
    }
  });
  el.querySelector('.card-foot')!.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    const act = btn?.dataset.act;
    if (act === 'mover') menuMover(card, btn!);
    if (act === 'focus') toggleFocus(meta.id);
    if (act === 'resume') api(`/api/sessions/${meta.id}/resume`, {}).catch(alertError);
    if (act === 'kill') api(`/api/sessions/${meta.id}/kill`, {}).catch(alertError);
    if (act === 'forget') api(`/api/sessions/${meta.id}/forget`, {}).catch(alertError);
  });
  paint(card);
  renumber();
}

// ---------- Copiar e colar no terminal (Windows e Linux) ----------
// Como no Windows Terminal: Ctrl+C copia quando há seleção (sem seleção vai o ^C para o
// Claude), Ctrl+V cola, Ctrl+Shift+C/V também, e o clique direito copia a seleção ou cola.

/** Devolve false quando a tecla é de copiar/colar e o xterm não deve tratá-la. */
function clipboardKey(term: Terminal, e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.altKey || e.metaKey) return true;
  const key = e.key.toLowerCase();
  if (key !== 'c' && key !== 'v' && e.code !== 'KeyC' && e.code !== 'KeyV') return true;
  const isC = key === 'c' || (key !== 'v' && e.code === 'KeyC');
  if (isC) {
    if (!e.shiftKey && !term.hasSelection()) return true; // ^C de verdade
    if (e.type === 'keydown') {
      // Ctrl+Shift+C abriria o inspetor do navegador: o atalho é nosso.
      e.preventDefault();
      if (term.hasSelection()) void copySelection(term);
    }
    return false;
  }
  // Colar: sem preventDefault o navegador dispara o evento paste no textarea do xterm,
  // que cola respeitando o bracketed paste. Ctrl+Shift+V cola como texto puro, igual.
  return false;
}

async function copySelection(term: Terminal): Promise<void> {
  const text = term.getSelection();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    term.clearSelection();
  } catch {
    alertError(new Error('não consegui copiar para a área de transferência'));
  }
}

async function rightClick(term: Terminal): Promise<void> {
  if (term.hasSelection()) return copySelection(term);
  try {
    const text = await navigator.clipboard.readText();
    if (text) term.paste(text);
  } catch {
    alertError(new Error('o navegador não liberou a área de transferência; cole com Ctrl+V'));
  }
  term.focus();
}

/**
 * Edição do nome no cabeçalho do card: Enter salva, Esc cancela, clicar fora
 * salva. Vazio devolve o título automático (Claude ou primeiro pedido).
 */
function startRename(card: Card): void {
  const { el, meta } = card;
  if (el.classList.contains('renaming')) return;
  const heading = el.querySelector('.title b') as HTMLElement;
  const input = document.createElement('input');
  input.className = 'title-edit';
  input.maxLength = 80;
  input.value = meta.titleSource === 'user' ? meta.title : '';
  input.placeholder = displayTitle(meta);
  input.title = 'Enter salva · Esc cancela · vazio volta ao título automático';
  el.classList.add('renaming');
  heading.replaceWith(input);
  let done = false;
  const finish = async (save: boolean) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    input.replaceWith(heading);
    el.classList.remove('renaming');
    paint(card);
    if (save && value !== (meta.titleSource === 'user' ? meta.title : '')) {
      try {
        upsert(await api(`/api/sessions/${meta.id}/rename`, { title: value }));
      } catch (err) {
        alertError(err as Error);
      }
    }
    if (layout === 'foco' && focusId === meta.id) card.term.focus();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); void finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); void finish(false); }
  });
  input.addEventListener('blur', () => void finish(true));
  input.focus();
  input.select();
}

function paint(card: Card): void {
  const { meta, el } = card;
  const running = meta.status !== 'exited';
  el.dataset.frente = frenteDe(meta);
  pintarSugestao(card);
  el.classList.toggle('waiting', meta.status === 'waiting');
  el.classList.toggle('exited', !running);
  const heading = el.querySelector('.title b') as HTMLElement;
  // Durante a edição o campo é da pessoa: um meta do servidor não apaga o que ela digita.
  if (!el.classList.contains('renaming')) {
    heading.textContent = displayTitle(meta);
    heading.title = meta.titleSource === 'user' ? `${displayTitle(meta)} · nome dado por você` : `${displayTitle(meta)} · clique para renomear`;
  }
  const cwd = el.querySelector('.title span') as HTMLElement;
  cwd.textContent = meta.cwd;
  cwd.title = meta.cwd;
  const pill = el.querySelector('.pill') as HTMLElement;
  const mudouStatus = !!pill.textContent && !pill.classList.contains(meta.status);
  pill.className = `pill ${meta.status}`;
  if (mudouStatus) bump(pill, 'status-mudou');
  pill.textContent = meta.aguardando?.length && meta.status === 'waiting' ? 'Aguardando conexão' : STATUS_LABEL[meta.status];
  const detail = el.querySelector('.detail') as HTMLElement;
  detail.textContent = `${meta.detail} · ${ago(meta.updatedAt)}`;
  detail.title = meta.detail;
  (el.querySelector('[data-act="resume"]') as HTMLElement).hidden = running;
  (el.querySelector('[data-act="kill"]') as HTMLElement).hidden = !running;
  (el.querySelector('[data-act="forget"]') as HTMLElement).hidden = running;

  const u = meta.usage;
  const model = el.querySelector('.model') as HTMLElement;
  if (u?.model) {
    model.textContent = prettyModel(u.model);
    model.style.color = modelColor(u.model);
    // A transcrição não diz o tamanho da janela: passou de 200k, só pode ser a de 1M.
    const windowSize = u.context > 200_000 ? 1_000_000 : 200_000;
    const pct = Math.min(100, (u.context / windowSize) * 100);
    const fill = el.querySelector('.ctx .fill') as HTMLElement;
    fill.style.width = `${pct}%`;
    fill.style.background = pct >= 80 ? 'var(--err)' : pct >= 60 ? 'var(--warn)' : 'var(--muted)';
    (el.querySelector('.ctx-label') as HTMLElement).textContent = `${compact(u.context)} / ${compact(windowSize)}`;
    const tok = el.querySelector('.tok') as HTMLElement;
    const tokens = `↓ ${compact(u.input)} ↑ ${compact(u.output)}`;
    if (tok.textContent !== tokens) {
      const tinha = !!tok.textContent;
      tok.textContent = tokens;
      if (tinha) bump(tok, 'num-mudou');
    }
  }
}

function remove(id: string): void {
  const card = cards.get(id);
  if (!card) return;
  cards.delete(id);
  if (focusId === id) focusId = null;
  // Sai encolhendo e some; os vizinhos deslizam para o lugar dele.
  const sumir = () => {
    flip(() => card.el.remove());
    card.term.dispose();
  };
  if (REDUZIR.matches || !card.el.offsetParent) sumir();
  else card.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.95)' }], { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }).finished.then(sumir, sumir);
  renumber();
  refreshBatch();
  refreshSummary();
}

/** Os atalhos (⌘ ou Ctrl+1…9) numeram os terminais da aba atual; na Visão geral, todos. */
function renumber(): void {
  const lista = atalhoLista();
  for (const c of cards.values()) {
    const i = lista.indexOf(c);
    const kbd = c.el.querySelector('.kbd') as HTMLElement;
    kbd.textContent = i >= 0 && i < 9 ? `${modKey()}${i + 1}` : '';
    kbd.title = i >= 0 && i < 9 ? `${modKey()}${i + 1} vai para este terminal` : '';
  }
  const vazio = $('#empty') as HTMLElement;
  vazio.hidden = cardsDaAba().length > 0;
  vazio.textContent = rota.aba === 'frente'
    ? 'Nenhuma sessão nesta frente ainda. Use “Nova sessão aqui” ou mova uma sessão da Geral para cá.'
    : cards.size > 0
      ? 'Nenhuma sessão solta: todas estão nas frentes. Abra uma nova acima.'
      : 'Nenhuma sessão ainda. Escolha uma pasta acima e abra a primeira.';
}

function refit(card: Card): void {
  const box = card.el.querySelector('.term') as HTMLElement;
  if (box.offsetParent === null || box.clientHeight === 0) return;
  try {
    card.fit.fit();
  } catch {}
}

// ---------- Layout e foco ----------

function setFocusTarget(id: string): void {
  focusId = id;
  for (const c of cards.values()) {
    const big = layout === 'foco' && c.meta.id === id;
    c.el.classList.toggle('is-focus', big);
    // O terminal ampliado oferece voltar à grade; os demais, ocupar o lugar dele.
    (c.el.querySelector('[data-act="focus"]') as HTMLElement).textContent = big ? 'Minimizar' : 'Ampliar';
  }
  renderSidebar();
}

function setLayout(next: 'grade' | 'foco'): void {
  flip(() => {
    layout = next;
    grid.classList.toggle('focus', next === 'foco');
    document.body.classList.toggle('foco', next === 'foco');
    document.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === next));
    if (next === 'foco' && (!focusId || !cards.get(focusId) || cards.get(focusId)!.el.hidden)) focusId = cardsDaAba()[0]?.meta.id ?? null;
    if (focusId) setFocusTarget(focusId);
  });
  requestAnimationFrame(() => cards.forEach(refit));
}

/** Rola até o card ampliado para ele ocupar a janela inteira. */
function revealFocused(): void {
  const card = focusId ? cards.get(focusId) : undefined;
  if (layout !== 'foco' || !card) return;
  // Depois do foco no terminal, que também rola a página e cancelaria esta
  // rolagem. Temporizador em vez de requestAnimationFrame: roda mesmo com a aba
  // em segundo plano.
  setTimeout(() => {
    refit(card);
    card.el.scrollIntoView({ block: 'start' });
  }, 30);
}

function toggleFocus(id: string): void {
  if (layout === 'foco' && focusId === id) return setLayout('grade');
  irParaCard(id);
  focusId = id;
  setLayout('foco');
  revealFocused();
  cards.get(id)?.term.focus();
}

/** ⌘1…⌘9 no Mac, Ctrl+1…Ctrl+9 no Windows e no Linux (sem Alt: Ctrl+Alt é o AltGr do Windows). */
function isTorreShortcut(e: KeyboardEvent): boolean {
  const mod = IS_MAC ? e.metaKey : e.ctrlKey && !e.altKey && !e.metaKey;
  return mod && e.type === 'keydown' && /^[1-9]$/.test(e.key);
}

window.addEventListener('keydown', (e) => {
  if (!isTorreShortcut(e)) return;
  const card = atalhoLista()[Number(e.key) - 1];
  if (!card) return;
  e.preventDefault();
  irParaCard(card.meta.id);
  if (layout === 'foco') setFocusTarget(card.meta.id);
  card.term.focus();
  if (layout === 'foco') revealFocused();
  else card.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}, true);

document.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((b) =>
  b.addEventListener('click', () => {
    setLayout(b.dataset.layout as 'grade' | 'foco');
    revealFocused();
  }),
);

// ---------- Topo: contagens e tokens ----------

function refreshSummary(): void {
  const all = [...cards.values()].map((c) => c.meta);
  const count = (s: Status) => all.filter((m) => m.status === s).length;
  const running = all.filter((m) => m.status !== 'exited').length;
  $('#subtitle').textContent = `${all.length} sessões · ${running} abertas`;
  const pills: Array<[Status, string]> = [
    ['waiting', `${count('waiting')} esperando você`],
    ['working', `${count('working')} trabalhando`],
    ['idle', `${count('idle')} ociosas`],
  ];
  if (statusFrente && !count(statusFrente)) statusFrente = null;
  setHtml($('#counts'), pills.map(([s, label]) => `<button type="button" class="pill ${s}${statusFrente === s ? ' on' : ''}" data-trazer="${s}" title="Trazer para a frente"${count(s) ? '' : ' disabled'}>${label}</button>`).join(''));

  let input = 0, output = 0, cacheRead = 0;
  const perModel = new Map<string, number>();
  for (const m of all) {
    if (!m.usage) continue;
    input += m.usage.input;
    output += m.usage.output;
    cacheRead += m.usage.cacheRead;
    if (m.usage.model) {
      const key = prettyModel(m.usage.model);
      perModel.set(key, (perModel.get(key) ?? 0) + m.usage.input + m.usage.output);
    }
  }
  $('#u-total').textContent = compact(input + output);
  $('#u-split').textContent = `↓ ${compact(input)} entrada · ↑ ${compact(output)} saída`;
  $('#u-cache').textContent = input ? `${Math.round((cacheRead / input) * 100)}%` : '—';
  const total = [...perModel.values()].reduce((a, b) => a + b, 0) || 1;
  $('#u-models').innerHTML = [...perModel.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<span><i style="background:${modelColor(name)}"></i>${escapeHtml(name)} <b>${Math.round((n / total) * 100)}%</b></span>`)
    .join('') || '<span>nenhuma resposta ainda</span>';
  renderSidebar();
  renderTabs();
  if (rota.aba === 'visao') renderVisao(false);
}

// ---------- Topo: conexões ----------

let conexoes: Conexao[] = [];

function renderConexoes(next: Conexao[]): void {
  conexoes = next;
  setHtml($('#conexoes'), conexoes.map((c) => {
    const estado = c.conectando ? 'conectando' : c.ok === null ? 'checando' : c.ok ? 'ok' : 'off';
    const quando = c.checadoEm ? ` · checado ${ago(c.checadoEm)}` : '';
    const acao = c.ok === false && !c.conectando ? ' · clique para reconectar' : '';
    return `<button type="button" class="cx ${estado}" data-cx="${escapeHtml(c.id)}" title="${escapeHtml(c.detalhe + quando + acao)}"${c.ok === false && !c.conectando ? '' : ' disabled'}>${escapeHtml(c.nome)}</button>`;
  }).join(''));
}

$('#conexoes').addEventListener('click', async (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-cx]');
  if (!btn || btn.disabled) return;
  const c = conexoes.find((x) => x.id === btn.dataset.cx);
  if (!c) return;
  if (c.tipo === 'gh') return alertError(new Error('o GitHub CLI se renova num terminal: gh auth login'));
  try {
    const r = await api('/api/conexoes/conectar', { id: c.id });
    // Conector: a Torre abre uma sessão já no /mcp; leva você até ela.
    if (r?.sessao) {
      upsert(r.sessao);
      refreshSummary();
      toggleFocus(r.sessao.id);
    }
  } catch (err) {
    alertError(err as Error);
  }
});

$('#cx-validar').addEventListener('click', async () => {
  try {
    if (conexoes.find((c) => c.id === 'op')?.ok === false) await api('/api/conexoes/conectar', { id: 'op' });
    await api('/api/conexoes/checar', {});
  } catch (err) {
    alertError(err as Error);
  }
});

// O "checado há X" envelhece sozinho.
setInterval(() => conexoes.length && renderConexoes(conexoes), 60_000);

// ---------- Barra lateral: total e lista de terminais ----------

function renderSidebar(): void {
  // Com o mouse apertado na lista (clique ou arrasto), redesenhar trocaria o item sob o cursor.
  if (press) {
    sidebarDirty = true;
    return;
  }
  const list = [...cards.values()];
  const open = list.filter((c) => c.meta.status !== 'exited');
  const closed = list.filter((c) => c.meta.status === 'exited');
  $('#side-open').textContent = String(open.length);
  $('#side-of').textContent = `de ${list.length} ${list.length === 1 ? 'sessão' : 'sessões'}`;

  const order: Status[] = ['waiting', 'working', 'idle', 'starting', 'exited'];
  const label: Record<Status, string> = { ...STATUS_LABEL, idle: 'Ociosas', exited: 'Encerradas', starting: 'Abrindo' };
  setHtml($('#side-status'), order
    .map((s) => [s, list.filter((c) => c.meta.status === s).length] as const)
    .filter(([s, n]) => n > 0 || s === 'waiting' || s === 'working' || s === 'idle')
    .map(([s, n]) => `<li><button type="button" class="side-status-btn${statusFrente === s ? ' on' : ''}" data-trazer="${s}" title="${statusFrente === s ? 'Voltar à ordem normal' : 'Trazer estes terminais para a frente'}"${n ? '' : ' disabled'}><span class="dot ${s}"></span>${label[s]}<b>${n}</b></button></li>`)
    .join(''));

  const atalhos = atalhoLista();
  const item = (c: Card) => {
    const i = atalhos.indexOf(c);
    const active = c.meta.id === focusId ? ' active' : '';
    return `<li><button type="button" class="side-item ${c.meta.status}${active}" data-id="${c.meta.id}" title="${escapeHtml(c.meta.cwd)}">
      <span class="dot ${c.meta.status}" aria-label="${STATUS_LABEL[c.meta.status]}"></span>
      <span class="name">${escapeHtml(displayTitle(c.meta))}</span>
      <span class="kbd">${i >= 0 && i < 9 ? `${modKey()}${i + 1}` : ''}</span>
      <span class="sub">${escapeHtml(shortName(c.meta))} · ${escapeHtml(c.meta.detail)} · ${ago(c.meta.updatedAt)}</span>
    </button></li>`;
  };
  // A ordem é a que você arrastou (a mesma da grade e dos atalhos); um status trazido
  // para a frente vem antes, como na grade.
  const frente = (c: Card) => (statusFrente && c.meta.status === statusFrente ? 0 : 1);
  const sorted = [...open].sort((a, b) => frente(a) - frente(b));
  // Agrupadas por frente, na ordem das abas: Geral e depois cada frente. Sem frentes, lista simples.
  const grupos: Array<{ id: string; titulo: string; cor: string; itens: Card[] }> = [
    { id: '', titulo: 'Geral', cor: 'var(--muted)', itens: [] },
    ...frentes.map((f, i) => ({ id: f.id, titulo: f.titulo, cor: corFrente(f, i), itens: [] as Card[] })),
  ];
  for (const c of sorted) {
    const g = grupos.find((x) => x.id === frenteDe(c.meta)) ?? grupoOrfao(grupos, frenteDe(c.meta));
    g.itens.push(c);
  }
  const agrupar = grupos.length > 1;
  const htmlAbertas = !sorted.length
    ? '<li class="side-empty">Nenhum terminal aberto</li>'
    : !agrupar
      ? sorted.map(item).join('')
      : grupos.filter((g) => g.itens.length).map((g) => {
        const atual = (g.id === '' && rota.aba === 'geral') || (rota.aba === 'frente' && rota.id === g.id);
        return `<li class="side-frente${atual ? ' atual' : ''}"><button type="button" data-ir="${escapeHtml(hashDe(g.id))}" title="Abrir ${escapeHtml(g.titulo)}"><span class="fdot" style="background:${g.cor}"></span>${escapeHtml(g.titulo)}<b>${g.itens.length}</b></button></li>${g.itens.map(item).join('')}`;
      }).join('');
  setHtml($('#side-list'),
    htmlAbertas +
    (closed.length
      ? `<li class="side-group">Encerradas <button type="button" class="btn small ghost side-clean" data-clean>${Date.now() < confirmCleanUntil ? `Confirmar: tirar ${closed.length}` : `Limpar ${closed.length}`}</button></li>${closed.map(item).join('')}`
      : ''));
  aplicarFrente();
}

/**
 * Troca o HTML só quando ele muda. A lista é redesenhada a cada evento de qualquer sessão; trocar
 * o botão entre o apertar e o soltar do mouse fazia o clique se perder.
 */
function setHtml(el: HTMLElement, html: string): void {
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html;
}

/** Os cards do status escolhido vêm primeiro na grade (ordem visual, sem mexer nos atalhos). */
function aplicarFrente(): void {
  const ordem = (c: Card) => (statusFrente && c.meta.status === statusFrente ? '-1' : '');
  if (![...cards.values()].some((c) => c.el.style.order !== ordem(c))) return;
  flip(() => {
    for (const c of cards.values()) c.el.style.order = ordem(c);
  });
}

function trazerParaFrente(s: Status): void {
  statusFrente = statusFrente === s ? null : s;
  // No modo ampliado só um card aparece: volta à grade para mostrar o grupo inteiro.
  if (statusFrente && layout === 'foco') setLayout('grade');
  refreshSummary();
  if (statusFrente) {
    const primeiro = cardsDaAba().find((c) => c.meta.status === statusFrente);
    primeiro?.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

document.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-trazer]');
  if (b) trazerParaFrente(b.dataset.trazer as Status);
  const ir = (ev.target as HTMLElement).closest<HTMLElement>('[data-ir]');
  if (ir) {
    ev.preventDefault();
    location.hash = ir.dataset.ir!;
  }
});

// Dois cliques: o primeiro mostra quantas saem. As conversas continuam gravadas no Claude Code.
$('#side-list').addEventListener('click', async (ev) => {
  if (!(ev.target as HTMLElement).closest('[data-clean]')) return;
  ev.stopPropagation();
  if (Date.now() > confirmCleanUntil) {
    confirmCleanUntil = Date.now() + 4000;
    renderSidebar();
    setTimeout(renderSidebar, 4100);
    return;
  }
  confirmCleanUntil = 0;
  await api('/api/sessions/forget-exited', {}).catch(alertError);
});

function abrirDaLista(ev: Event): void {
  const id = (ev.target as HTMLElement).closest<HTMLElement>('.side-item')?.dataset.id;
  const card = id ? cards.get(id) : undefined;
  if (!card) return;
  // Clicar na lista amplia a conversa (e a mantém ampliada se já estiver), indo para a aba dela.
  irParaCard(card.meta.id);
  focusId = card.meta.id;
  setLayout('foco');
  revealFocused();
  card.term.focus();
}
// O mouse: apertar e soltar no lugar abre a conversa; apertar e mover arrasta o item para
// outra posição. Enquanto o botão está apertado a lista não é redesenhada (o item sob o
// cursor sumiria). Teclado e leitor de tela usam o click, que não vem de ponteiro (detail === 0).
$('#side-list').addEventListener('pointerdown', (ev) => {
  const item = (ev.target as HTMLElement).closest<HTMLElement>('.side-item');
  if (ev.button !== 0 || !item || (ev.target as HTMLElement).closest('[data-clean]')) return;
  // Sem isso o mousedown seguinte põe o foco no botão e tira do terminal recém-aberto.
  ev.preventDefault();
  beginPress(ev, { id: item.dataset.id!, handle: item, container: $('#side-list'), itemSel: '.side-item', axis: 'y', onClick: () => abrirDaLista(ev) });
});
$('#side-list').addEventListener('click', (ev) => {
  if (ev.detail === 0) abrirDaLista(ev);
});

// ---------- Ordem dos terminais: arrastar na grade e na lista lateral ----------
// A ordem oficial é a do Map `cards`: grade, lista lateral e atalhos (⌘ ou Ctrl+1…9) seguem ela.
// Arrastar muda o Map, move o card na grade e grava no servidor, que repassa às outras abas.

interface PressSpec { id: string; handle: HTMLElement; container: HTMLElement; itemSel: string; axis: 'x' | 'y'; onClick: (() => void) | null }
interface Press extends PressSpec { x0: number; y0: number; pointerId: number }
interface Drag { ghost: HTMLElement; target: HTMLElement | null; before: boolean }
const DRAG_START_PX = 6;
let press: Press | null = null;
let drag: Drag | null = null;
let sidebarDirty = false;
let suppressClick = false;

function beginPress(ev: PointerEvent, spec: PressSpec): void {
  if (press) return;
  press = { ...spec, x0: ev.clientX, y0: ev.clientY, pointerId: ev.pointerId };
  spec.handle.setPointerCapture(ev.pointerId);
  spec.handle.addEventListener('pointermove', onPressMove);
  spec.handle.addEventListener('pointerup', onPressEnd);
  spec.handle.addEventListener('pointercancel', onPressCancel);
}

function onPressMove(ev: PointerEvent): void {
  if (!press || ev.pointerId !== press.pointerId) return;
  if (!drag) {
    if (Math.hypot(ev.clientX - press.x0, ev.clientY - press.y0) < DRAG_START_PX) return;
    startDrag();
  }
  moveDrag(ev.clientX, ev.clientY);
}

function startDrag(): void {
  if (!press) return;
  const src = press.handle.closest<HTMLElement>(press.itemSel) ?? press.handle;
  const rect = press.handle.getBoundingClientRect();
  // O fantasma é a alça (cabeçalho do card ou item da lista), não o terminal inteiro.
  const ghost = press.handle.cloneNode(true) as HTMLElement;
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.append(ghost);
  src.classList.add('drag-src');
  document.body.classList.add('dragging');
  drag = { ghost, target: null, before: false };
}

function moveDrag(x: number, y: number): void {
  if (!press || !drag) return;
  drag.ghost.style.transform = `translate(${x - press.x0}px, ${y - press.y0}px)`;
  const under = document.elementFromPoint(x, y)?.closest<HTMLElement>(press.itemSel) ?? null;
  const src = press.handle.closest<HTMLElement>(press.itemSel) ?? press.handle;
  const target = under && under !== src && press.container.contains(under) ? under : null;
  let before = false;
  if (target) {
    const r = target.getBoundingClientRect();
    before = press.axis === 'x' ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
  }
  if (target === drag.target && before === drag.before) return;
  drag.target?.classList.remove('drop-before', 'drop-after');
  drag.target = target;
  drag.before = before;
  target?.classList.add(before ? 'drop-before' : 'drop-after');
}

function onPressEnd(ev: PointerEvent): void {
  if (!press || ev.pointerId !== press.pointerId) return;
  const { onClick } = press;
  const dropped = drag;
  const srcId = press.id;
  const targetId = dropped?.target ? itemId(dropped.target) : null;
  endPress();
  if (!dropped) {
    onClick?.();
    return;
  }
  // O click que vem logo depois do soltar não é um clique de verdade.
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  if (!targetId || !cards.has(srcId) || !cards.has(targetId)) return;
  const ids = orderIds().filter((id) => id !== srcId);
  const at = ids.indexOf(targetId) + (dropped.before ? 0 : 1);
  ids.splice(at, 0, srcId);
  applyOrder(ids, true);
}

function onPressCancel(ev: PointerEvent): void {
  if (!press || ev.pointerId !== press.pointerId) return;
  endPress();
}

function endPress(): void {
  if (!press) return;
  const { handle, pointerId } = press;
  handle.removeEventListener('pointermove', onPressMove);
  handle.removeEventListener('pointerup', onPressEnd);
  handle.removeEventListener('pointercancel', onPressCancel);
  try {
    handle.releasePointerCapture(pointerId);
  } catch {}
  if (drag) {
    drag.ghost.remove();
    drag.target?.classList.remove('drop-before', 'drop-after');
    document.body.classList.remove('dragging');
    (handle.closest(press.itemSel) ?? handle).classList.remove('drag-src');
  }
  drag = null;
  press = null;
  if (sidebarDirty) {
    sidebarDirty = false;
    renderSidebar();
  }
}

/** Id da sessão de um card da grade ou de um item da lista. */
function itemId(el: HTMLElement): string | null {
  if (el.dataset.id) return el.dataset.id;
  for (const c of cards.values()) if (c.el === el) return c.meta.id;
  return null;
}

function orderIds(): string[] {
  return [...cards.keys()];
}

/** Aplica uma ordem: ids desconhecidos são ignorados e os que faltam ficam no fim, como estavam. */
function applyOrder(ids: string[], persist: boolean): void {
  const known = ids.filter((id, i) => cards.has(id) && ids.indexOf(id) === i);
  const next = [...known, ...orderIds().filter((id) => !known.includes(id))];
  if (next.join() === orderIds().join()) return;
  const entries = next.map((id) => [id, cards.get(id)!] as const);
  cards.clear();
  for (const [id, c] of entries) cards.set(id, c);
  // Move só o que saiu do lugar: o xterm de um card movido no DOM se redesenha sozinho.
  flip(() => {
    let cursor: Element | null = grid.firstElementChild;
    for (const [, c] of entries) {
      if (cursor === c.el) cursor = cursor.nextElementSibling;
      else grid.insertBefore(c.el, cursor);
    }
  });
  renumber();
  renderSidebar();
  requestAnimationFrame(() => cards.forEach(refit));
  if (persist) api('/api/sessions/order', { ids: next }).catch(alertError);
}

setInterval(() => {
  cards.forEach(paint);
  renderSidebar();
}, 15_000);

// ---------- Nova sessão ----------

const RECENT_KEY = 'torre.recentCwds';
function recentCwds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function rememberCwd(cwd: string): void {
  const list = [cwd, ...recentCwds().filter((c) => c !== cwd)].slice(0, 10);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
  fillRecent();
}
function fillRecent(): void {
  showOptions(recentCwds());
}

// Campo de pasta com Tab: vazio traz a pasta principal; com texto, completa como no shell.
// Aceita C:\..., \ e / misturados, ~ e ~\ (ou ~/) no começo.
const MAIN_KEY = 'torre.mainCwd';
let home = '';
/** Pasta principal que o servidor indica: a raiz do Jarvis (ou a do torre.json). */
let principal = '';
const cwdInput = $<HTMLInputElement>('#new-cwd');

/** Fixada nesta página > a do servidor (Jarvis) > a última usada > a home. */
function mainCwd(): string {
  try {
    const pinned = localStorage.getItem(MAIN_KEY);
    if (pinned) return pinned;
  } catch {}
  return principal || (recentCwds()[0] ?? home);
}
/** Separador da máquina do servidor: o do home (\ no Windows, / no Mac e no Linux). */
function sep(): string {
  if (home) return home.includes('\\') ? '\\' : '/';
  return IS_MAC || !/win/i.test(navigator.platform) ? '/' : '\\';
}
/** Separador de um caminho que veio do servidor; sem nenhum, o da máquina. */
function sepOf(path: string): string {
  return path.includes('\\') ? '\\' : path.includes('/') ? '/' : sep();
}
function withSep(dir: string): string {
  return /[\\/]$/.test(dir) ? dir : dir + sepOf(dir);
}
/** Troca o ~ do começo pelo home: "~", "~\x" e "~/x". */
function expandTilde(p: string): string {
  if (!home || !/^~(?:$|[\\/])/.test(p)) return p;
  const rest = p.slice(1).replace(/^[\\/]+/, '');
  return rest ? withSep(home) + rest : home;
}
/** Encurta o home para ~ (sem diferenciar maiúsculas no Windows, onde C:\Users e c:\users são a mesma pasta). */
function tilde(dir: string): string {
  if (!home) return dir;
  const win = home.includes('\\');
  const a = win ? dir.toLowerCase() : dir;
  const h = win ? home.toLowerCase() : home;
  if (a === h) return '~';
  if (a.startsWith(h) && /[\\/]/.test(dir[home.length] ?? '')) return '~' + dir.slice(home.length);
  return dir;
}
function showOptions(paths: string[]): void {
  $('#cwd-options').innerHTML = paths.map((p) => `<option value="${escapeHtml(p)}"></option>`).join('');
}
function hint(html: string): void {
  $('#cwd-hint').innerHTML = html;
}
function defaultHint(): void {
  const main = mainCwd();
  const exemplo = sep() === '\\' ? 'C:\\caminho\\da\\pasta ou ~\\pasta' : '~/caminho/da/pasta';
  cwdInput.placeholder = main ? `Tab → ${tilde(main)}` : exemplo;
  hint(main ? `<kbd>Tab</kbd> traz ${escapeHtml(tilde(main))} · <kbd>Tab</kbd> de novo completa a pasta` : '<kbd>Tab</kbd> completa a pasta');
}
function commonPrefix(list: string[]): string {
  // No Windows as pastas não diferenciam maiúsculas: compara sem elas e fica com a grafia da primeira.
  const win = list.some((s) => s.includes('\\'));
  return list.reduce((acc, s) => {
    let i = 0;
    while (i < acc.length && i < s.length && (win ? acc[i].toLowerCase() === s[i].toLowerCase() : acc[i] === s[i])) i++;
    return acc.slice(0, i);
  });
}
/** Último pedaço de um caminho, aceitando \ e / (e o separador no fim). */
function baseName(p: string): string {
  return p.split(/[\\/]+/).filter(Boolean).pop() ?? p;
}

cwdInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  const value = cwdInput.value;
  if (!value) {
    const main = mainCwd();
    if (!main) return;
    e.preventDefault();
    cwdInput.value = withSep(main);
    return;
  }
  e.preventDefault();
  const typed = expandTilde(value);
  let matches: string[] = [];
  try {
    matches = (await api(`/api/complete?p=${encodeURIComponent(typed)}`)).matches;
  } catch {}
  if (matches.length === 0) {
    hint('Nenhuma subpasta aqui · Enter abre a sessão nesta pasta');
    $<HTMLInputElement>('#new-name').focus();
    return;
  }
  if (matches.length === 1) {
    // O próximo pedaço é montado com o separador que veio do servidor.
    cwdInput.value = withSep(matches[0]);
    showOptions([]);
    defaultHint();
    return;
  }
  const common = commonPrefix(matches);
  if (common.length > typed.length) cwdInput.value = common;
  else if (typed !== value) cwdInput.value = typed; // o ~ já vira o caminho de verdade
  showOptions(matches);
  const names = matches.slice(0, 8).map((m) => escapeHtml(baseName(m)));
  hint(`${matches.length} opções: ${names.join(' · ')}${matches.length > 8 ? ' …' : ''}`);
});
cwdInput.addEventListener('input', () => {
  if (!cwdInput.value) {
    fillRecent();
    defaultHint();
  }
});

/** Tira o separador do fim, sem estragar a raiz (C:\ ou /). */
function semSepFinal(p: string): string {
  const t = p.replace(/[\\/]+$/, '');
  if (!t) return p.slice(0, 1);
  return /^[A-Za-z]:$/.test(t) ? t + '\\' : t;
}

$('#pin-main').addEventListener('click', () => {
  const value = semSepFinal(expandTilde(cwdInput.value.trim()));
  if (!value) return;
  try {
    localStorage.setItem(MAIN_KEY, value);
  } catch {}
  defaultHint();
  hint(`Pasta principal: ${escapeHtml(tilde(value))}`);
});

/** Botão do topo: mostra o formulário de nova sessão em qualquer modo, com o foco na pasta. */
$('#top-new').addEventListener('click', () => {
  // Na Visão geral não há grade: a sessão nova vai para a Geral.
  if (rota.aba === 'visao') navegar({ aba: 'geral' }, true);
  document.body.classList.add('novo-aberto');
  const form = $('#new');
  form.scrollIntoView({ block: 'start' });
  cwdInput.focus();
  if (!cwdInput.value) cwdInput.value = mainCwd();
  cwdInput.select();
});
$('#new').addEventListener('keydown', (ev) => {
  if ((ev as KeyboardEvent).key === 'Escape') document.body.classList.remove('novo-aberto');
});

$('#new').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nameInput = $<HTMLInputElement>('#new-name');
  $('#new-error').textContent = '';
  const cwd = expandTilde(cwdInput.value.trim());
  try {
    // Numa frente, a sessão já nasce nela.
    const frente = rota.aba === 'frente' ? rota.id : undefined;
    const meta: SessionMeta = await api('/api/sessions', { cwd, name: nameInput.value, ...(frente ? { frente } : {}) });
    rememberCwd(cwd);
    nameInput.value = '';
    upsert(meta);
    document.body.classList.remove('novo-aberto');
    cards.get(meta.id)?.term.focus();
  } catch (err) {
    $('#new-error').textContent = (err as Error).message;
  }
});

// ---------- Envio em lote ----------

function refreshBatch(): void {
  const marked = [...cards.values()].filter((c) => c.selected);
  const on = marked.length > 0;
  $('#batch-label').textContent = on
    ? `Enviar para ${marked.length} ${marked.length === 1 ? 'sessão' : 'sessões'}: ${marked.map((c) => displayTitle(c.meta)).join(' · ')}`
    : 'Marque “Em lote” nos cards para mandar o mesmo pedido a várias sessões';
  $<HTMLInputElement>('#batch-text').disabled = !on;
  $<HTMLButtonElement>('#batch-send').disabled = !on;
}

$('#batch').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = $<HTMLInputElement>('#batch-text');
  const text = input.value.trim();
  if (!text) return;
  for (const c of cards.values()) {
    if (c.selected && c.meta.status !== 'exited') sendWs({ type: 'prompt', id: c.meta.id, text });
  }
  input.value = '';
});

// ---------- Importar terminais abertos fora da Torre ----------

interface ExternalSession {
  pid: number; sessionId: string; cwd: string; status: string;
  startedAt: number; updatedAt: number; version: string; title: string; lastPrompt: string;
}

const importDialog = $<HTMLDialogElement>('#import-dialog');
const importGo = $<HTMLButtonElement>('#import-go');

async function loadExternal(): Promise<void> {
  const list = $('#import-list');
  $('#import-error').textContent = '';
  list.innerHTML = '<p class="import-empty">Procurando sessões abertas…</p>';
  let sessions: ExternalSession[] = [];
  try {
    sessions = (await api('/api/external')).sessions;
  } catch (err) {
    $('#import-error').textContent = (err as Error).message;
  }
  if (!sessions.length) {
    list.innerHTML = '<p class="import-empty">Nenhuma sessão do Claude Code aberta fora do Jarvis.</p>';
    refreshImportButton();
    return;
  }
  list.innerHTML = sessions.map((s) => {
    const busy = s.status === 'busy';
    return `<label class="import-item">
      <input type="checkbox" value="${escapeHtml(s.sessionId)}">
      <span class="where">${escapeHtml(s.title || s.lastPrompt || 'Conversa sem título')}</span>
      <span class="pill ${busy ? 'working' : 'idle'}">${busy ? 'Trabalhando' : 'Ociosa'}</span>
      <span class="path" title="${escapeHtml(s.cwd)}">${escapeHtml(tilde(s.cwd))}</span>
      <span class="prompt">${s.lastPrompt ? `Último pedido: “${escapeHtml(s.lastPrompt)}”` : '<i>sem pedido registrado</i>'}</span>
      <span class="when">aberta ${ago(s.startedAt)} · última atividade ${ago(s.updatedAt)} · v${escapeHtml(s.version)}</span>
      ${busy ? '<span class="warn">Está trabalhando agora: importar interrompe o que ela está fazendo.</span>' : ''}
    </label>`;
  }).join('');
  refreshImportButton();
}

function selectedImports(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('#import-list input:checked')].map((i) => i.value);
}

function refreshImportButton(): void {
  const n = selectedImports().length;
  importGo.disabled = n === 0;
  importGo.textContent = n ? `Importar ${n} ${n === 1 ? 'terminal' : 'terminais'}` : 'Importar';
}

$('#import').addEventListener('click', () => {
  importDialog.showModal();
  loadExternal();
});
$('#import-list').addEventListener('change', refreshImportButton);
$('#import-refresh').addEventListener('click', loadExternal);
$('#import-cancel').addEventListener('click', () => importDialog.close());

$('#import-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const sessionIds = selectedImports();
  if (!sessionIds.length) return;
  importGo.disabled = true;
  importGo.textContent = 'Importando…';
  try {
    const { results } = await api('/api/import', { sessionIds });
    const failed = (results as Array<{ ok: boolean; error?: string }>).filter((r) => !r.ok);
    if (failed.length) {
      $('#import-error').textContent = failed.map((f) => f.error).join(' · ');
      await loadExternal();
      return;
    }
    importDialog.close();
  } catch (err) {
    $('#import-error').textContent = (err as Error).message;
    refreshImportButton();
  }
});

// ---------- Notificações ----------

$('#notify').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  const result = await Notification.requestPermission();
  $('#notify').textContent = result === 'granted' ? 'Notificações ativas' : 'Notificações bloqueadas';
});
if ('Notification' in window && Notification.permission === 'granted') $('#notify').textContent = 'Notificações ativas';

function notify(meta: SessionMeta): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(`${displayTitle(meta)} está esperando você`, { body: meta.detail, tag: meta.id });
  n.onclick = () => {
    window.focus();
    toggleFocus(meta.id);
  };
}

// ---------- Barra lateral recolhível e terminal ampliado ----------

const SIDE_KEY = 'torre.sideCollapsed';
const AMPLIAR_KEY = 'torre.ampliar';

/** A seta aponta para onde a barra vai: ‹ recolhe para a esquerda, › abre para a direita. */
function setSideCollapsed(collapsed: boolean): void {
  document.body.classList.toggle('side-collapsed', collapsed);
  const btn = $<HTMLButtonElement>('#side-toggle');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.title = collapsed ? 'Abrir a barra lateral' : 'Recolher a barra lateral';
  try {
    localStorage.setItem(SIDE_KEY, collapsed ? '1' : '');
  } catch {}
  // A largura dos terminais muda junto: o xterm recalcula quando a transição termina.
  setTimeout(() => cards.forEach(refit), 220);
}

function setAmpliar(mode: 'janela' | 'coluna'): void {
  document.body.dataset.ampliar = mode;
  document.querySelectorAll<HTMLButtonElement>('[data-ampliar-opt]').forEach((b) => {
    b.classList.toggle('on', b.dataset.ampliarOpt === mode);
    b.setAttribute('aria-pressed', String(b.dataset.ampliarOpt === mode));
  });
  try {
    localStorage.setItem(AMPLIAR_KEY, mode);
  } catch {}
  requestAnimationFrame(() => cards.forEach(refit));
}

$('#side-toggle').addEventListener('click', () => setSideCollapsed(!document.body.classList.contains('side-collapsed')));
document.querySelectorAll<HTMLButtonElement>('[data-ampliar-opt]').forEach((b) =>
  b.addEventListener('click', () => setAmpliar(b.dataset.ampliarOpt as 'janela' | 'coluna')),
);
try {
  setSideCollapsed(localStorage.getItem(SIDE_KEY) === '1');
  setAmpliar(localStorage.getItem(AMPLIAR_KEY) === 'coluna' ? 'coluna' : 'janela');
} catch {
  setAmpliar('janela');
}

// ---------- Aparência ----------

type Theme = 'dark' | 'light';
type Palette = 'pastel' | 'wehandle' | 'matrix' | 'colorido';
// v2: o padrão virou escuro pastel (o index.html lê a mesma chave antes de pintar).
const APPEARANCE_KEY = 'torre.appearance.v2';

function termTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: v('--term'),
    foreground: v('--term-fg'),
    cursor: v('--accent-text'),
    cursorAccent: v('--term'),
    selectionBackground: v('--term-sel'),
  };
}

function applyAppearance(theme: Theme, palette: Palette): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme, palette }));
  } catch {}
  document.querySelectorAll<HTMLButtonElement>('[data-theme-opt]').forEach((b) => {
    b.classList.toggle('on', b.dataset.themeOpt === theme);
    b.setAttribute('aria-pressed', String(b.dataset.themeOpt === theme));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-palette-opt]').forEach((b) => {
    b.classList.toggle('on', b.dataset.paletteOpt === palette);
    b.setAttribute('aria-pressed', String(b.dataset.paletteOpt === palette));
  });
  const theme_ = termTheme();
  for (const c of cards.values()) c.term.options.theme = theme_;
}

document.querySelectorAll<HTMLButtonElement>('[data-theme-opt]').forEach((b) =>
  b.addEventListener('click', () => applyAppearance(b.dataset.themeOpt as Theme, document.documentElement.dataset.palette as Palette)),
);
document.querySelectorAll<HTMLButtonElement>('[data-palette-opt]').forEach((b) =>
  b.addEventListener('click', () => applyAppearance(document.documentElement.dataset.theme as Theme, b.dataset.paletteOpt as Palette)),
);
applyAppearance(document.documentElement.dataset.theme as Theme, document.documentElement.dataset.palette as Palette);

// ---------- Frentes: rotas e abas ----------
// Uma frente é uma nota de Projetos/ com `frente: true` (contrato em torre/FRENTES-CONTRATO.md).
// Abas: Visão geral (#/visao) · Geral (#/geral, sessões sem frente) · uma por frente (#/frente/<id>).
// Há um único #grid de terminais: trocar de aba só esconde/mostra cards (os xterm nunca são recriados).

const PALETA_FRENTES = ['#b7a4f5', '#94c4f2', '#8fd9b0', '#f2c48d', '#f4a9cb', '#f1e2a2', '#a6cbf5', '#c9baff'];
const QUADRANTES: Array<{ q: Quadrante; nome: string; cor: string }> = [
  { q: 'P1', nome: 'P1 · Fazer agora', cor: 'var(--err)' },
  { q: 'P2', nome: 'P2 · Agendar', cor: 'var(--accent)' },
  { q: 'P3', nome: 'P3 · Delegar / rápido', cor: 'var(--info)' },
  { q: 'P4', nome: 'P4 · Talvez', cor: 'var(--muted)' },
  { q: 'AG', nome: 'Aguardando', cor: 'var(--warn)' },
  { q: 'OK', nome: 'Concluídas', cor: 'var(--ok)' },
];
const SUG_KEY = 'torre.sugestoesOcultas';
const JIRA_BASE = 'https://wehandle.atlassian.net/browse/';
let iniciado = false;
let trocaSeq = 0;
let frentesCarregadas = false;
let frentesErro = false;
const naoExiste = new Set<string>();
const erroDetalhe = new Map<string, string>();
/** "Atualizar" clicado: mostra "atualizando…" até o WS `frentes` trazer dados novos. */
const atualizando = new Map<string, { desde: number; em: number | null; erro: string }>();

function frenteDe(meta: SessionMeta): string {
  return meta.frente ?? '';
}

function lerRota(): Rota {
  let h = '';
  try {
    h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  } catch {}
  if (h === 'geral') return { aba: 'geral' };
  if (h === 'pendencias') return { aba: 'pendencias' };
  const m = h.match(/^frente\/(.+)$/);
  if (m) return { aba: 'frente', id: m[1] };
  return { aba: 'visao' };
}
function hashDaRota(r: Rota): string {
  return r.aba === 'frente' ? `#/frente/${encodeURIComponent(r.id)}` : `#/${r.aba}`;
}
function hashDe(frente: string): string {
  return frente ? hashDaRota({ aba: 'frente', id: frente }) : '#/geral';
}

function cardNaAba(meta: SessionMeta): boolean {
  if (rota.aba === 'geral') return frenteDe(meta) === '';
  if (rota.aba === 'frente') return frenteDe(meta) === rota.id;
  return false;
}
function cardsDaAba(): Card[] {
  return [...cards.values()].filter((c) => cardNaAba(c.meta));
}
/** Lista dos atalhos ⌘/Ctrl+1…9: a aba atual; na Visão geral, todos os terminais. */
function atalhoLista(): Card[] {
  return rota.aba === 'visao' || rota.aba === 'pendencias' ? [...cards.values()] : cardsDaAba();
}

function corValida(c: unknown): c is string {
  return typeof c === 'string' && (/^#[0-9a-f]{3,8}$/i.test(c) || /^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(c));
}
function corFrente(f: { cor?: string }, i: number): string {
  return corValida(f.cor) ? f.cor : PALETA_FRENTES[Math.max(0, i) % PALETA_FRENTES.length];
}
function corDoId(id: string): string {
  const i = frentes.findIndex((f) => f.id === id);
  if (i >= 0) return corFrente(frentes[i], i);
  const d = detalhes.get(id);
  return d ? corFrente(d, 0) : 'var(--accent)';
}
function nomeFrente(id: string): string {
  if (!id) return 'Geral';
  return frentes.find((f) => f.id === id)?.titulo ?? detalhes.get(id)?.titulo ?? id;
}
/** Sessão numa frente que a lista não conhece (apagada, ou lista ainda não chegou): grupo com o id. */
function grupoOrfao<T extends { id: string; titulo: string; cor: string; itens: Card[] }>(grupos: T[], id: string): T {
  const g = { id, titulo: nomeFrente(id), cor: corDoId(id), itens: [] as Card[] } as T;
  grupos.push(g);
  return g;
}

interface Contagem { abertas: number; trabalhando: number; esperando: number }
function contarSessoes(): Map<string, Contagem> {
  const m = new Map<string, Contagem>();
  for (const c of cards.values()) {
    if (c.meta.status === 'exited') continue;
    const k = frenteDe(c.meta);
    const x = m.get(k) ?? { abertas: 0, trabalhando: 0, esperando: 0 };
    x.abertas++;
    if (c.meta.status === 'working') x.trabalhando++;
    if (c.meta.status === 'waiting') x.esperando++;
    m.set(k, x);
  }
  return m;
}

/** Abre a aba do card, se ele não está na atual (atalho, lista lateral, notificação). */
function irParaCard(id: string): void {
  const c = cards.get(id);
  if (!c || cardNaAba(c.meta)) return;
  const f = frenteDe(c.meta);
  navegar(f ? { aba: 'frente', id: f } : { aba: 'geral' }, true);
}

function navegar(r: Rota, imediato = false): void {
  const hash = hashDaRota(r);
  if (location.hash !== hash) history.pushState(null, '', hash);
  trocarAba(r, imediato);
}
window.addEventListener('hashchange', () => trocarAba(lerRota(), false));
window.addEventListener('popstate', () => trocarAba(lerRota(), false));

function indiceAba(r: Rota): number {
  if (r.aba === 'visao') return 0;
  if (r.aba === 'pendencias') return 1;
  if (r.aba === 'geral') return 2;
  const i = frentes.findIndex((f) => f.id === r.id);
  return 3 + (i < 0 ? frentes.length : i);
}

function paineis(r: Rota): HTMLElement[] {
  if (r.aba === 'visao') return [$('#view-visao')];
  if (r.aba === 'pendencias') return [$('#pend-head'), $('#pend-aside')];
  if (r.aba === 'geral') return [$('#view-terminais')];
  return [$('#frente-head'), $('#frente-aside'), $('#view-terminais')];
}

/**
 * Troca de aba: o conteúdo atual sai (fade + deslize curto para o lado oposto), o novo entra do
 * lado da aba escolhida. Só translada: os terminais nunca são escalados nem recriados.
 */
function trocarAba(r: Rota, imediato: boolean): void {
  if (iniciado && hashDaRota(r) === hashDaRota(rota)) return;
  const dir = indiceAba(r) >= indiceAba(rota) ? 1 : -1;
  const seq = ++trocaSeq;
  const saindo = iniciado ? paineis(rota).filter((el) => !el.hidden) : [];
  fecharMenu();
  const aplicar = () => {
    for (const el of saindo) el.getAnimations().forEach((a) => a.cancel());
    if (seq !== trocaSeq) return;
    rota = r;
    iniciado = true;
    document.body.dataset.rota = r.aba;
    const visiveis = paineis(r);
    for (const el of [$('#view-visao'), $('#pend-head'), $('#pend-aside'), $('#frente-head'), $('#frente-aside'), $('#view-terminais')]) el.hidden = !visiveis.includes(el);
    adicionando = null;
    renderTabs();
    aplicarAba(false);
    if (r.aba === 'visao') renderVisao(!imediato);
    if (r.aba === 'pendencias') {
      renderPendencias();
      void carregarPendencias();
    }
    if (r.aba === 'frente') {
      renderFrente();
      void carregarDetalhe(r.id);
    }
    $('#main').scrollTop = 0;
    if (!imediato && !REDUZIR.matches) {
      for (const el of visiveis) {
        el.animate([{ opacity: 0, transform: `translateX(${dir * 16}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE_OUT });
      }
    }
  };
  if (imediato || REDUZIR.matches || !saindo.length) return aplicar();
  ateFim(saindo.map((el) =>
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 12}px)` }], { duration: 120, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }),
  ), 220).then(aplicar);
}

/**
 * Espera as animações de saída, mas nunca mais que `ms`: com a janela sem pintar (atrás de outra,
 * aba em segundo plano) o relógio das animações para, e a troca de aba não pode ficar presa nele.
 */
function ateFim(anims: Animation[], ms: number): Promise<void> {
  return Promise.race([
    Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {}),
    new Promise<void>((r) => setTimeout(r, ms)),
  ]);
}

/** Mostra só os cards da aba. Com `animar`, quem sai some com fade e os vizinhos deslizam (FLIP). */
function aplicarAba(animar: boolean): void {
  const saindo = [...cards.values()].filter((c) => !c.el.hidden && !cardNaAba(c.meta));
  const mudar = () => {
    for (const c of cards.values()) {
      const ver = cardNaAba(c.meta);
      const entra = ver && c.el.hidden;
      c.el.hidden = !ver;
      if (entra && animar) entrar(c.el)?.finished.then(() => refit(c), () => {});
    }
  };
  const fim = () => {
    // No modo ampliado, o card ampliado precisa ser desta aba.
    if (layout === 'foco' && (!focusId || cards.get(focusId)?.el.hidden !== false)) {
      focusId = cardsDaAba()[0]?.meta.id ?? null;
      if (focusId) setFocusTarget(focusId);
      else setLayout('grade');
    }
    renumber();
    renderSidebar();
    requestAnimationFrame(() => cardsDaAba().forEach(refit));
  };
  if (animar && !REDUZIR.matches && saindo.length) {
    ateFim(saindo.map((c) =>
      c.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)' }),
    ), 320).then(() => {
      flip(mudar);
      fim();
    });
    return;
  }
  if (animar) flip(mudar);
  else mudar();
  fim();
}

function renderTabs(): void {
  const cont = contarSessoes();
  const tab = (href: string, ativo: boolean, corpo: string, cor?: string, titulo?: string) =>
    `<a role="tab" href="${href}" class="tab${ativo ? ' on' : ''}" aria-selected="${ativo}"${cor ? ` style="--fc:${cor}"` : ''}${titulo ? ` title="${escapeHtml(titulo)}"` : ''}>${corpo}</a>`;
  const espera = (n: number) => (n ? `<span class="dot waiting" title="${n} esperando você"></span>` : '');
  const g = cont.get('') ?? { abertas: 0, trabalhando: 0, esperando: 0 };
  const lista = [...frentes];
  // Frente aberta pelo hash que a lista não tem (ainda): ganha uma aba provisória.
  const r = rota;
  if (r.aba === 'frente' && !lista.some((f) => f.id === r.id)) {
    const d = detalhes.get(r.id);
    lista.push({ id: r.id, titulo: d?.titulo ?? r.id, status: d?.status ?? '', cor: d?.cor ?? '', resumo: d?.resumo ?? { abertas: 0, p1: 0, vencidas: 0, aguardando: 0, sessoes: 0, esperando: 0, trabalhando: 0 }, externoEm: null });
  }
  const html =
    tab('#/visao', rota.aba === 'visao', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>Visão geral') +
    tab('#/pendencias', rota.aba === 'pendencias', `Pendências${contadorPendencias()}`, undefined, 'O TODO inteiro, compromissos e agenda') +
    tab('#/geral', rota.aba === 'geral', `Geral${espera(g.esperando)}<b class="tab-n">${g.abertas}</b>`, undefined, 'Sessões sem frente') +
    lista.map((f, i) => {
      const c = cont.get(f.id) ?? { abertas: 0, trabalhando: 0, esperando: 0 };
      const alerta = (f.resumo?.p1 ?? 0) + (f.resumo?.vencidas ?? 0);
      const n = alerta
        ? `<b class="tab-n alerta" title="${f.resumo.p1} em P1 · ${f.resumo.vencidas} vencidas">${alerta}</b>`
        : f.resumo?.abertas ? `<b class="tab-n" title="${f.resumo.abertas} tarefas abertas">${f.resumo.abertas}</b>` : '';
      return tab(hashDe(f.id), rota.aba === 'frente' && rota.id === f.id, `<span class="fdot"></span>${escapeHtml(f.titulo)}${espera(c.esperando)}${n}`, corFrente(f, i), f.status ? `${f.titulo} · ${f.status}` : f.titulo);
    }).join('');
  setHtml($('#tabs'), html);
  moverIndicador();
}

/** O traço sob a aba ativa desliza (mola) até a nova. */
function moverIndicador(): void {
  const row = $('#tabs');
  const ind = $('#tabs-ind');
  const on = row.querySelector<HTMLElement>('.tab.on');
  if (!on) {
    ind.style.width = '0';
    return;
  }
  const x = on.offsetLeft - row.scrollLeft + row.offsetLeft;
  ind.style.transform = `translateX(${x}px)`;
  ind.style.width = `${on.offsetWidth}px`;
  ind.style.setProperty('--ind', on.style.getPropertyValue('--fc') || 'var(--accent)');
  if (on.offsetLeft < row.scrollLeft || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth) {
    on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
$('#tabs').addEventListener('scroll', moverIndicador, { passive: true });
window.addEventListener('resize', moverIndicador);

// ---------- Frentes: dados ----------

function normalizarResumo<T extends FrenteResumo>(f: T): T {
  const zero = { abertas: 0, p1: 0, vencidas: 0, aguardando: 0, sessoes: 0, esperando: 0, trabalhando: 0 };
  f.resumo = Object.assign(zero, f.resumo ?? {});
  f.titulo = f.titulo || f.id;
  f.status = f.status ?? '';
  return f;
}
function normalizarDetalhe(d: FrenteDetalhe): FrenteDetalhe {
  normalizarResumo(d);
  d.todo = Array.isArray(d.todo) ? d.todo : [];
  d.compromissos = Array.isArray(d.compromissos) ? d.compromissos : [];
  d.reunioes = Array.isArray(d.reunioes) ? d.reunioes : [];
  d.decisoes = Array.isArray(d.decisoes) ? d.decisoes : [];
  d.pessoas = Array.isArray(d.pessoas) ? d.pessoas : [];
  d.pastas = Array.isArray(d.pastas) ? d.pastas : [];
  const e = d.externo ?? ({} as Externo);
  d.externo = { jira: Array.isArray(e.jira) ? e.jira : [], teams: Array.isArray(e.teams) ? e.teams : [], atualizadoEm: e.atualizadoEm ?? null, atualizando: !!e.atualizando, erro: e.erro };
  return d;
}

async function carregarFrentes(): Promise<void> {
  const primeira = !frentesCarregadas;
  try {
    const d = await api('/api/frentes');
    frentes = (Array.isArray(d?.frentes) ? d.frentes : []).map(normalizarResumo);
    frentesErro = false;
  } catch {
    // Servidor sem a rota (ainda) ou fora do ar: a página segue só com a Geral.
    if (!frentesCarregadas) frentes = [];
    frentesErro = true;
  }
  frentesCarregadas = true;
  renderTabs();
  renderSidebar();
  cards.forEach(pintarSugestao);
  renderConhecimento(false);
  if (rota.aba === 'visao') renderVisao(primeira);
  if (rota.aba === 'frente') renderFrente();
}

async function carregarDetalhe(id: string): Promise<void> {
  try {
    const d = normalizarDetalhe(await api(`/api/frentes/${encodeURIComponent(id)}`));
    detalhes.set(id, d);
    naoExiste.delete(id);
    erroDetalhe.delete(id);
    const a = atualizando.get(id);
    if (a && !d.externo.atualizando && (d.externo.atualizadoEm !== a.em || (d.externo.erro ?? '') !== a.erro || Date.now() - a.desde > 180_000)) atualizando.delete(id);
  } catch (err) {
    if ((err as any).status === 404) naoExiste.add(id);
    else erroDetalhe.set(id, (err as Error).message);
  }
  if (rota.aba === 'frente' && rota.id === id) {
    renderFrente();
    renderTabs();
  }
}

let frentesTimer = 0;
const frentesPendentes = new Set<string>();
/** WS `{type:'frentes', id}`: refaz o GET do que está na tela ('*' = todas). */
function frenteMudou(id: string): void {
  frentesPendentes.add(id);
  clearTimeout(frentesTimer);
  frentesTimer = window.setTimeout(() => {
    const ids = [...frentesPendentes];
    frentesPendentes.clear();
    const todas = ids.includes('*');
    void carregarFrentes();
    // Qualquer mudança (de qualquer frente ou do TODO) mexe nas Pendências: contador da aba e Projetos.
    void carregarPendencias();
    for (const k of [...detalhes.keys()]) {
      if ((todas || ids.includes(k)) && !(rota.aba === 'frente' && rota.id === k)) detalhes.delete(k);
    }
    if (rota.aba === 'frente' && (todas || ids.includes(rota.id))) void carregarDetalhe(rota.id);
  }, 250);
}

// ---------- Visão geral ----------

function renderVisao(animar: boolean): void {
  const cont = contarSessoes();
  const zero: Contagem = { abertas: 0, trabalhando: 0, esperando: 0 };
  const sess = (c: Contagem) => c.abertas
    ? `<span><span class="dot working"></span>${c.trabalhando} trabalhando</span><span><span class="dot waiting"></span>${c.esperando} esperando você</span><span class="muted">${c.abertas} ${c.abertas === 1 ? 'sessão' : 'sessões'}</span>`
    : '<span class="muted">Nenhuma sessão aberta</span>';
  const cartoes = frentes.map((f, i) => {
    const r = f.resumo;
    const c = cont.get(f.id) ?? zero;
    const stat = (n: number, rotulo: string, alerta = false) => `<span class="${alerta && n ? 'alerta' : ''}"><b>${n}</b>${rotulo}</span>`;
    const prox = f.proximo
      ? `<p class="fprox" title="${escapeHtml(limparTexto(f.proximo.texto))}">Próximo prazo <b>${escapeHtml(fmtData(f.proximo.prazo))}</b> · ${escapeHtml(limparTexto(f.proximo.texto))}</p>`
      : '<p class="fprox muted">Sem prazo marcado</p>';
    return `<a class="fcard" href="${hashDe(f.id)}" style="--fc:${corFrente(f, i)}">
      <header><span class="fdot"></span><h2>${escapeHtml(f.titulo)}</h2>${f.status ? `<span class="fstatus ${escapeHtml(f.status.toLowerCase())}">${escapeHtml(f.status)}</span>` : ''}</header>
      <div class="fstats">${stat(r.abertas, 'abertas')}${stat(r.p1, 'em P1', true)}${stat(r.vencidas, 'vencidas', true)}${stat(r.aguardando, 'aguardando')}</div>
      <div class="fsess">${sess(c)}</div>
      ${prox}
      <footer>${f.externoEm ? `Jira e Teams atualizados ${ago(emMs(f.externoEm))}` : 'Jira e Teams ainda não buscados'}</footer>
    </a>`;
  });
  const soltas = [...cards.values()].filter((c) => frenteDe(c.meta) === '' && c.meta.status !== 'exited');
  const nSug = soltas.filter((c) => sugestaoVisivel(c.meta)).length;
  const g = cont.get('') ?? zero;
  const geral = `<a class="fcard geral" href="#/geral">
    <header><span class="fdot"></span><h2>Geral</h2><span class="fstatus">sessões soltas</span></header>
    <div class="fsess">${sess(g)}</div>
    ${soltas.length ? `<ul>${soltas.slice(0, 5).map((c) => `<li><span class="dot ${c.meta.status}"></span><span>${escapeHtml(displayTitle(c.meta))}</span></li>`).join('')}${soltas.length > 5 ? `<li class="muted">+ ${soltas.length - 5}</li>` : ''}</ul>` : ''}
    <footer>${nSug ? `${nSug} ${nSug === 1 ? 'parece' : 'parecem'} de uma frente` : 'Sessões sem frente ficam aqui'}</footer>
  </a>`;
  const vazio = !frentes.length
    ? `<div class="fcard vazio"><header><h2>Nenhuma frente ainda</h2></header><p class="muted">${frentesErro ? 'O servidor ainda não respondeu às frentes. Os terminais seguem funcionando na Geral.' : 'Uma frente é uma nota de <code>Projetos/</code> com <code>frente: true</code> no frontmatter.'}</p></div>`
    : '';
  const box = $('#visao-grid');
  setHtml(box, cartoes.join('') + geral + vazio);
  const abertas = frentes.reduce((s, f) => s + f.resumo.abertas, 0);
  const p1 = frentes.reduce((s, f) => s + f.resumo.p1, 0);
  const venc = frentes.reduce((s, f) => s + f.resumo.vencidas, 0);
  $('#visao-sub').textContent = frentes.length
    ? `${frentes.length} ${frentes.length === 1 ? 'frente' : 'frentes'} · ${abertas} tarefas abertas · ${p1} em P1 · ${venc} vencidas`
    : '';
  if (animar && !REDUZIR.matches) {
    [...box.children].forEach((el, i) => (el as HTMLElement).animate(
      [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
      { duration: 520, delay: Math.min(i, 10) * 55, easing: EASE_MOLA, fill: 'backwards' },
    ));
  }
  renderProjetos(animar);
}

// ---------- Página da frente ----------

let adicionando: Quadrante | null = null;

function renderFrente(): void {
  if (rota.aba !== 'frente') return;
  renderCabecalho();
  renderKanban();
  renderAside();
}

function renderCabecalho(): void {
  if (rota.aba !== 'frente') return;
  const id = rota.id;
  const d = detalhes.get(id);
  const cor = corDoId(id);
  $('#frente-head').style.setProperty('--fc', cor);
  $('#frente-aside').style.setProperty('--fc', cor);
  const titulo = escapeHtml(nomeFrente(id));
  if (!d) {
    const msg = naoExiste.has(id)
      ? `<p class="fh-obj">Frente não encontrada. Ela precisa ser uma nota de <code>Projetos/</code> com <code>frente: true</code> (ou o servidor ainda não conhece frentes).</p><div class="fh-links"><a href="#/visao">Voltar à Visão geral</a></div>`
      : erroDetalhe.has(id)
        ? `<p class="fh-obj error">Não consegui carregar: ${escapeHtml(erroDetalhe.get(id))}</p>`
        : '<p class="fh-obj muted carregando">Carregando a frente…</p>';
    setHtml($('#fh-cab'), `<div class="fh"><div class="fh-top"><span class="fdot"></span><h1>${titulo}</h1></div>${msg}</div>`);
    return;
  }
  const repo = d.repo && /^[\w.-]+\/[\w.-]+$/.test(d.repo) ? d.repo : '';
  setHtml($('#fh-cab'), `<div class="fh">
    <div class="fh-top">
      <span class="fdot"></span><h1>${titulo}</h1>${d.status ? `<span class="fstatus ${escapeHtml(d.status.toLowerCase())}">${escapeHtml(d.status)}</span>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn primary" data-fa="nova" title="Abre uma sessão do Claude Code ${d.pastas[0] ? `em ${escapeHtml(d.pastas[0])}` : 'na pasta principal'}, já nesta frente">+ Nova sessão aqui</button>
    </div>
    ${d.objetivo ? `<p class="fh-obj">${escapeHtml(d.objetivo)}</p>` : ''}
    <div class="fh-links">
      ${d.nota ? `<span title="Nota da frente no vault"><span class="muted">Nota</span> <code>${escapeHtml(d.nota)}</code></span>` : ''}
      ${repo ? `<a href="https://github.com/${escapeHtml(repo)}" target="_blank" rel="noopener noreferrer">${escapeHtml(repo)} ↗</a>` : ''}
      ${d.pastas.length ? `<span title="${escapeHtml(d.pastas.join('\n'))}"><span class="muted">Pasta</span> <code>${escapeHtml(tilde(d.pastas[0]))}</code>${d.pastas.length > 1 ? ` +${d.pastas.length - 1}` : ''}</span>` : ''}
    </div>
  </div>`);
}

// ---------- Kanban: um "quadro" é uma frente (id) ou o TODO inteiro (PEND) ----------

const PEND = ':pendencias';
/** Quadro da aba visível (o kanban só existe na frente e em Pendências). */
function quadroAtual(): string | null {
  return rota.aba === 'pendencias' ? PEND : rota.aba === 'frente' ? rota.id : null;
}
function boxDoQuadro(q: string): HTMLElement {
  return q === PEND ? $('#pend-kanban') : $('#kanban');
}
/** Lista completa de tarefas do quadro (as mudanças otimistas mexem nela). */
function todoDo(q: string): Tarefa[] | undefined {
  return q === PEND ? pendencias?.todo : detalhes.get(q)?.todo;
}
/** O que aparece no quadro: em Pendências, só o filtro escolhido. */
function todoVisivel(q: string): Tarefa[] | undefined {
  if (q !== PEND) return todoDo(q);
  return pendencias?.todo.filter(passaFiltro);
}
function recarregarQuadro(q: string): Promise<void> {
  return q === PEND ? carregarPendencias() : carregarDetalhe(q);
}

function renderKanban(): void {
  const q = quadroAtual();
  if (!q) return;
  const box = boxDoQuadro(q);
  const todo = todoVisivel(q);
  if (!todo) {
    box.hidden = true;
    return;
  }
  // Durante um arrasto, redesenhar tiraria o cartão de baixo do ponteiro: fica para depois.
  if (kdrag?.ghost) {
    kanbanSujo = true;
    return;
  }
  box.hidden = false;
  const html = QUADRANTES.map((col) => colunaHtml(todo, col, q)).join('');
  if (box.dataset.html === html) return;
  // Guarda o rascunho de "+ tarefa", a rolagem das colunas e onde cada cartão estava (FLIP).
  const form = box.querySelector<HTMLFormElement>('.knova');
  const rascunho = form
    ? { texto: (form.elements.namedItem('texto') as HTMLInputElement).value, prazo: (form.elements.namedItem('prazo') as HTMLInputElement).value, foco: (document.activeElement as HTMLInputElement | null)?.name ?? '' }
    : null;
  const rolagem = new Map<string, number>();
  box.querySelectorAll<HTMLElement>('.kcol').forEach((c) => rolagem.set(c.dataset.q!, (c.querySelector('.klist') as HTMLElement).scrollTop));
  const antes = new Map<string, DOMRect>();
  box.querySelectorAll<HTMLElement>('.tarefa').forEach((el) => antes.set(el.dataset.tid!, el.getBoundingClientRect()));
  const tinha = antes.size > 0;
  box.dataset.html = html;
  box.innerHTML = html;
  box.querySelectorAll<HTMLElement>('.kcol').forEach((c) => {
    (c.querySelector('.klist') as HTMLElement).scrollTop = rolagem.get(c.dataset.q!) ?? 0;
  });
  const novo = box.querySelector<HTMLFormElement>('.knova');
  if (novo) {
    const texto = novo.elements.namedItem('texto') as HTMLInputElement;
    const prazo = novo.elements.namedItem('prazo') as HTMLInputElement;
    if (rascunho) {
      texto.value = rascunho.texto;
      prazo.value = rascunho.prazo;
    }
    if (!rascunho || rascunho.foco === 'texto') texto.focus();
    else if (rascunho.foco === 'prazo') prazo.focus();
  }
  if (REDUZIR.matches || !tinha) return;
  box.querySelectorAll<HTMLElement>('.tarefa').forEach((el) => {
    const a = antes.get(el.dataset.tid!);
    if (!a) {
      el.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE_MOLA });
      return;
    }
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: EASE_OUT });
  });
}

function colunaHtml(todo: Tarefa[], col: { q: Quadrante; nome: string; cor: string }, quadro: string): string {
  const tarefas = todo.filter((t) => t.quadrante === col.q);
  const limite = col.q === 'OK' ? 25 : Infinity;
  const lista = tarefas.slice(0, limite);
  const form = adicionando === col.q
    ? `<form class="knova" data-q="${col.q}"><input name="texto" placeholder="Verbo + objeto (ex.: Revisar o painel)" maxlength="300" required autocomplete="off" aria-label="Nova tarefa em ${col.nome}"><div class="knova-l"><input name="prazo" type="date" title="Prazo (opcional)" aria-label="Prazo"><button class="btn small primary" type="submit">Adicionar</button><button class="btn small ghost" type="button" data-fa="cancelar">Cancelar</button></div></form>`
    : '';
  return `<section class="kcol" data-q="${col.q}" style="--qc:${col.cor}" aria-label="${col.nome}">
    <header><b>${col.nome}</b><span class="kn">${tarefas.length}</span>${col.q !== 'OK' ? `<button type="button" class="kadd" data-fa="add" data-q="${col.q}" title="Nova tarefa em ${col.nome}">+ tarefa</button>` : ''}</header>
    <div class="klist">${form}${lista.map((t) => tarefaHtml(t, quadro === PEND)).join('') || (form ? '' : '<p class="kvazio">Nada aqui</p>')}${tarefas.length > lista.length ? `<p class="kvazio">+ ${tarefas.length - lista.length} mais antigas</p>` : ''}</div>
  </section>`;
}

function tarefaHtml(t: Tarefa, comFrentes = false): string {
  const jira = t.jira && /^[A-Z][A-Z0-9]+-\d+$/.test(t.jira) && !t.texto.includes(t.jira)
    ? `<a class="jkey" href="${JIRA_BASE}${t.jira}" target="_blank" rel="noopener noreferrer">${t.jira}</a>`
    : '';
  // Em Pendências: chips das frentes da tarefa (cor da frente, levam à aba) ou, sem frente, o ctx.
  let chips = '';
  if (comFrentes) {
    const g = t as TarefaGeral;
    const fs = Array.isArray(g.frentes) ? g.frentes : [];
    chips = fs.length
      ? fs.map((id) => `<a class="tchip" href="${hashDe(id)}" style="--fc:${corDoId(id)}" title="Abrir a frente"><span class="fdot"></span>${escapeHtml(nomeFrente(id))}</a>`).join('')
      : g.ctx ? `<span class="tchip ctx" title="ctx">${escapeHtml(limparTexto(g.ctx))}</span>` : '';
  }
  const classes = ['tarefa', t.vencida && t.quadrante !== 'OK' ? 'venc' : '', t.quadrante === 'OK' ? 'feita' : '', t.id.startsWith('tmp-') ? 'pendente' : ''].filter(Boolean).join(' ');
  return `<article class="${classes}" data-tid="${escapeHtml(t.id)}" tabindex="0" title="Arraste para outra coluna · Enter abre as ações">
    <p>${textoRico(t.texto)}</p>
    <div class="tmeta">${t.prazo ? `<span class="tprazo">${escapeHtml(fmtData(t.prazo))}${t.vencida && t.quadrante !== 'OK' ? ' · vencida' : ''}</span>` : ''}${t.quem ? `<span class="tquem">${escapeHtml(limparTexto(t.quem))}</span>` : ''}${jira}${chips}<button type="button" class="tmenu" data-fa="tmenu" title="Mover ou concluir" aria-haspopup="menu" aria-label="Ações da tarefa">⋯</button></div>
  </article>`;
}

function renderAside(): void {
  const box = $('#frente-aside');
  if (rota.aba !== 'frente') return;
  const id = rota.id;
  const d = detalhes.get(id);
  if (!d) {
    setHtml(box, '');
    return;
  }
  const e = d.externo;
  const ocupado = atualizando.has(id) || e.atualizando;
  const quando = ocupado
    ? '<span class="fa-quando atualizando">atualizando…</span>'
    : `<span class="fa-quando">${e.atualizadoEm ? `atualizado ${ago(emMs(e.atualizadoEm))}` : 'ainda não buscado · clique em Atualizar'}</span>`;
  const jira = e.jira.length
    ? `<ul class="fa-list">${e.jira.map((j) => {
      const href = urlSegura(j.url) ?? (/^[A-Z][A-Z0-9]+-\d+$/.test(j.key) ? JIRA_BASE + j.key : '');
      return `<li><div class="linha">${href ? `<a class="jkey" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(j.key)}</a>` : `<span class="jkey">${escapeHtml(j.key)}</span>`}<span class="jst ${classeStatus(j.status)}">${escapeHtml(j.status)}</span></div><p>${escapeHtml(j.titulo)}</p>${j.responsavel || j.atualizado ? `<span class="muted">${escapeHtml([j.responsavel, j.atualizado ? fmtQuando(j.atualizado) : ''].filter(Boolean).join(' · '))}</span>` : ''}</li>`;
    }).join('')}</ul>`
    : '<p class="fa-vazio">Nenhum card do Jira.</p>';
  const TIPO: Record<string, string> = { chat: 'Chat', canal: 'Canal', reuniao: 'Reunião' };
  const teams = e.teams.length
    ? `<ul class="fa-list">${e.teams.map((t) => {
      const href = urlSegura(t.url);
      const tit = escapeHtml(t.titulo);
      return `<li><div class="linha"><span class="ttipo ${escapeHtml(t.tipo)}">${TIPO[t.tipo] ?? escapeHtml(t.tipo)}</span>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><b>${tit}</b></a>` : `<b>${tit}</b>`}</div><span class="muted">${escapeHtml([t.quem, fmtQuando(t.quando)].filter(Boolean).join(' · '))}</span>${t.trecho ? `<p>${escapeHtml(t.trecho)}</p>` : ''}</li>`;
    }).join('')}</ul>`
    : '<p class="fa-vazio">Nada do Teams.</p>';
  const comp = d.compromissos.length
    ? `<ul class="fa-list">${d.compromissos.map((c) => `<li class="${c.vencido ? 'venc' : ''}"><b>${escapeHtml(c.titulo)}</b><span class="muted">${escapeHtml([c.assumido_por ? limparTexto(c.assumido_por) : '', c.prazo ? `prazo ${fmtData(c.prazo)}${c.vencido ? ' · vencido' : ''}` : '', c.status ?? ''].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`
    : '<p class="fa-vazio">Sem compromissos.</p>';
  const datadas = (xs: Array<{ data: string; titulo: string }>, vazio: string) => xs.length
    ? `<ul class="fa-list compacta">${xs.map((x) => `<li><div class="linha"><span class="mono muted">${escapeHtml(fmtData(x.data))}</span><span class="clip">${escapeHtml(x.titulo)}</span></div></li>`).join('')}</ul>`
    : `<p class="fa-vazio">${vazio}</p>`;
  const pessoas = d.pessoas.length
    ? `<div class="pchips">${d.pessoas.map((p) => `<span class="pchip">${escapeHtml(p.nome || p.id)}</span>`).join('')}</div>`
    : '<p class="fa-vazio">Ninguém ligado ainda.</p>';
  setHtml(box, `${blocoConhecimentoDaFrente(id)}<section class="fa-box">
      <header><h3>Jira e Teams</h3><button type="button" class="btn small" data-fa="atualizar"${ocupado ? ' disabled' : ''} title="Busca de novo os cards do Jira e as conversas do Teams desta frente (só leitura)">Atualizar</button></header>
      ${quando}
      ${e.erro ? `<p class="error">${escapeHtml(e.erro)}</p>` : ''}
      <h4>Jira <span>${e.jira.length}</span></h4>${jira}
      <h4>Teams <span>${e.teams.length}</span></h4>${teams}
    </section>
    <section class="fa-box">
      <header><h3>Contexto</h3></header>
      <h4>Compromissos <span>${d.compromissos.length}</span></h4>${comp}
      <h4>Reuniões</h4>${datadas(d.reunioes, 'Sem reuniões.')}
      <h4>Decisões</h4>${datadas(d.decisoes, 'Sem decisões.')}
      <h4>Pessoas</h4>${pessoas}
    </section>`);
}

// Ações da página da frente (delegadas: o HTML é redesenhado a cada GET).
// O mesmo tratamento vale para o quadro da frente e o de Pendências.
for (const sel of ['#frente-head', '#pend-head']) {
  $(sel).addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-fa]');
    const q = quadroAtual();
    if (!btn || !q) return;
    const fa = btn.dataset.fa;
    if (fa === 'nova' && q !== PEND) void novaSessaoNaFrente(q);
    if (fa === 'filtro') {
      pendFiltro = btn.dataset.f ?? '*';
      try {
        localStorage.setItem(FILTRO_KEY, pendFiltro);
      } catch {}
      renderPendencias();
    }
    if (fa === 'add') {
      adicionando = btn.dataset.q as Quadrante;
      delete boxDoQuadro(q).dataset.html;
      renderKanban();
    }
    if (fa === 'cancelar') {
      adicionando = null;
      renderKanban();
    }
    if (fa === 'tmenu') {
      const tid = btn.closest<HTMLElement>('.tarefa')?.dataset.tid;
      if (tid) menuTarefa(q, tid, btn);
    }
  });
  $(sel).addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const t = e.target as HTMLElement;
    const q = quadroAtual();
    if (e.key === 'Escape' && t.closest('.knova')) {
      adicionando = null;
      renderKanban();
    }
    if (e.key === 'Enter' && t.classList.contains('tarefa') && q) {
      e.preventDefault();
      menuTarefa(q, t.dataset.tid!, t.querySelector('.tmenu') as HTMLElement);
    }
  });
  $(sel).addEventListener('submit', (ev) => {
    const form = (ev.target as HTMLElement).closest<HTMLFormElement>('.knova');
    const q = quadroAtual();
    if (!form || !q) return;
    ev.preventDefault();
    const texto = (form.elements.namedItem('texto') as HTMLInputElement).value.trim();
    const prazo = (form.elements.namedItem('prazo') as HTMLInputElement).value;
    if (!texto) return;
    adicionando = null;
    void criarTarefa(q, texto, form.dataset.q as Quadrante, prazo);
  });
}
$('#frente-aside').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-fa="atualizar"]');
  if (btn && rota.aba === 'frente') void atualizarExterno(rota.id);
});

async function novaSessaoNaFrente(fid: string): Promise<void> {
  try {
    const meta: SessionMeta = await api('/api/sessions', { cwd: '', frente: fid });
    upsert(meta);
    refreshSummary();
    if (frenteDe(meta) !== fid) aviso('A sessão abriu na Geral: o servidor ainda não conhece frentes.');
    const card = cards.get(meta.id);
    card?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card?.term.focus();
  } catch (err) {
    alertError(err as Error);
  }
}

async function atualizarExterno(fid: string): Promise<void> {
  const d = detalhes.get(fid);
  atualizando.set(fid, { desde: Date.now(), em: d?.externo.atualizadoEm ?? null, erro: d?.externo.erro ?? '' });
  renderAside();
  try {
    await api(`/api/frentes/${encodeURIComponent(fid)}/atualizar`, {});
  } catch (err) {
    atualizando.delete(fid);
    renderAside();
    alertError(err as Error);
  }
}

function tarefaApi(q: string, body: object): Promise<any> {
  return api(q === PEND ? '/api/pendencias/tarefa' : `/api/frentes/${encodeURIComponent(q)}/tarefa`, body);
}

/** Depois de escrever: o quadro e a lateral de Pendências (Aguardando) refletem a mudança. */
function redesenharQuadro(q: string): void {
  renderKanban();
  if (q === PEND) renderPendencias();
}

/** Otimista: a tarefa muda de coluna na hora; se o servidor recusar, volta e avisa. */
async function moverTarefa(q: string, tid: string, destino: Quadrante): Promise<void> {
  const t = todoDo(q)?.find((x) => x.id === tid);
  if (!t || t.quadrante === destino) return;
  const origem = t.quadrante;
  const acao = destino === 'OK' ? 'concluir' : origem === 'OK' ? 'reabrir' : 'mover';
  t.quadrante = destino;
  redesenharQuadro(q);
  try {
    await tarefaApi(q, acao === 'concluir' ? { acao, id: tid } : { acao, id: tid, quadrante: destino });
    void recarregarQuadro(q);
  } catch (err) {
    const t2 = todoDo(q)?.find((x) => x.id === tid);
    if (t2) t2.quadrante = origem;
    redesenharQuadro(q);
    alertError(err as Error);
  }
}

async function criarTarefa(q: string, texto: string, quadrante: Quadrante, prazo: string): Promise<void> {
  // Em Pendências, com uma frente no filtro, a tarefa nasce nela (ctx = id da frente).
  const ctx = q === PEND && pendFiltro !== '*' && pendFiltro !== '' ? pendFiltro : undefined;
  const tmp: TarefaGeral = { id: `tmp-${Date.now()}`, texto, quadrante, prazo: prazo || undefined, vencida: false, frentes: ctx ? [ctx] : [] };
  todoDo(q)?.unshift(tmp);
  redesenharQuadro(q);
  try {
    await tarefaApi(q, { acao: 'criar', texto, quadrante, ...(prazo ? { prazo } : {}), ...(ctx ? { ctx } : {}) });
    await recarregarQuadro(q);
  } catch (err) {
    const lista = todoDo(q);
    const i = lista?.findIndex((x) => x.id === tmp.id) ?? -1;
    if (lista && i >= 0) lista.splice(i, 1);
    redesenharQuadro(q);
    alertError(err as Error);
  }
}

function menuTarefa(q: string, tid: string, anchor: HTMLElement): void {
  const fid = q;
  const t = todoDo(q)?.find((x) => x.id === tid);
  if (!t || t.id.startsWith('tmp-')) return;
  abrirMenu(anchor, 'Mover para', QUADRANTES.map((col) => ({
    label: col.q === 'OK' ? 'Concluir' : col.q === 'AG' && t.quadrante === 'OK' ? 'Reabrir em Aguardando' : t.quadrante === 'OK' ? `Reabrir em ${col.nome}` : col.nome,
    cor: col.cor,
    atual: t.quadrante === col.q,
    acao: () => void moverTarefa(fid, tid, col.q),
  })));
}

// ---------- Kanban: arrastar entre colunas (pointer events) ----------

interface KDrag { fid: string; tid: string; el: HTMLElement; x0: number; y0: number; pointerId: number; ghost: HTMLElement | null; alvo: HTMLElement | null }
let kdrag: KDrag | null = null;
let kanbanSujo = false;

function kDown(ev: PointerEvent): void {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('.tarefa');
  const q = quadroAtual();
  if (ev.button !== 0 || !el || kdrag || !q) return;
  if ((ev.target as HTMLElement).closest('a, button, input')) return;
  if (el.classList.contains('pendente')) return;
  kdrag = { fid: q, tid: el.dataset.tid!, el, x0: ev.clientX, y0: ev.clientY, pointerId: ev.pointerId, ghost: null, alvo: null };
  // Ouve na janela (não só no cartão): se a captura do ponteiro se perder, o soltar ainda chega.
  window.addEventListener('pointermove', kMove);
  window.addEventListener('pointerup', kUp);
  window.addEventListener('pointercancel', kCancel);
  try {
    el.setPointerCapture(ev.pointerId);
  } catch {}
}
$('#kanban').addEventListener('pointerdown', kDown);
$('#pend-kanban').addEventListener('pointerdown', kDown);

function kMove(ev: PointerEvent): void {
  if (!kdrag || ev.pointerId !== kdrag.pointerId) return;
  // Botão já solto sem o pointerup ter chegado (fora da janela, por exemplo): encerra aqui.
  if (ev.pointerType === 'mouse' && ev.buttons === 0) return kUp(ev);
  if (!kdrag.ghost) {
    if (Math.hypot(ev.clientX - kdrag.x0, ev.clientY - kdrag.y0) < DRAG_START_PX) return;
    const r = kdrag.el.getBoundingClientRect();
    const ghost = kdrag.el.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost', 'tarefa-ghost');
    ghost.style.width = `${r.width}px`;
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.style.setProperty('--qc', getComputedStyle(kdrag.el).getPropertyValue('--qc'));
    document.body.append(ghost);
    kdrag.el.classList.add('drag-src');
    document.body.classList.add('dragging');
    kdrag.ghost = ghost;
  }
  kdrag.ghost.style.transform = `translate(${ev.clientX - kdrag.x0}px, ${ev.clientY - kdrag.y0}px) rotate(-1.5deg)`;
  // Perto da borda do quadro, ele rola para mostrar as colunas escondidas (Aguardando, Concluídas).
  const kb = boxDoQuadro(kdrag.fid);
  const kr = kb.getBoundingClientRect();
  if (ev.clientX > kr.right - 48) kb.scrollLeft += 14;
  else if (ev.clientX < kr.left + 48) kb.scrollLeft -= 14;
  const sob = document.elementFromPoint(ev.clientX, ev.clientY);
  const col = sob && kb.contains(sob) ? sob.closest<HTMLElement>('.kcol') : null;
  if (col === kdrag.alvo) return;
  kdrag.alvo?.classList.remove('kalvo');
  kdrag.alvo = col;
  col?.classList.add('kalvo');
}

function kUp(ev: PointerEvent): void {
  if (!kdrag || ev.pointerId !== kdrag.pointerId) return;
  const { fid, tid, alvo, ghost } = kdrag;
  kFim();
  if (ghost && alvo) void moverTarefa(fid, tid, alvo.dataset.q as Quadrante);
}

function kCancel(ev: PointerEvent): void {
  if (!kdrag || ev.pointerId !== kdrag.pointerId) return;
  kFim();
}

function kFim(): void {
  if (!kdrag) return;
  const { el, pointerId, ghost, alvo } = kdrag;
  window.removeEventListener('pointermove', kMove);
  window.removeEventListener('pointerup', kUp);
  window.removeEventListener('pointercancel', kCancel);
  try {
    el.releasePointerCapture(pointerId);
  } catch {}
  ghost?.remove();
  alvo?.classList.remove('kalvo');
  el.classList.remove('drag-src');
  if (ghost) document.body.classList.remove('dragging');
  kdrag = null;
  if (kanbanSujo) {
    kanbanSujo = false;
    renderKanban();
  }
}

// ---------- Pendências: o TODO inteiro, compromissos, agenda (e Projetos na Visão geral) ----------

const FILTRO_KEY = 'torre.pendFiltro';
let pendencias: Pendencias | null = null;
let pendErro = false;
/** '*' = todas · '' = sem frente · id = só daquela frente. */
let pendFiltro: string = (() => {
  try {
    return localStorage.getItem(FILTRO_KEY) ?? '*';
  } catch {
    return '*';
  }
})();

async function carregarPendencias(): Promise<void> {
  try {
    const d = await api('/api/pendencias');
    const lista = <T,>(x: unknown): T[] => (Array.isArray(x) ? x : []);
    pendencias = {
      hoje: typeof d?.hoje === 'string' ? d.hoje : hojeIso(),
      versao: String(d?.versao ?? ''),
      todo: lista<TarefaGeral>(d?.todo).map((t) => ({ ...t, frentes: lista<string>(t.frentes) })),
      compromissos: lista<Pendencias['compromissos'][number]>(d?.compromissos).map((c) => ({ ...c, frentes: lista<string>(c.frentes) })),
      agenda: lista<ReuniaoAgenda>(d?.agenda).map((r) => ({ ...r, participantes: lista<string>(r.participantes), frentes: lista<string>(r.frentes) })),
      recentes: lista<ReuniaoAgenda>(d?.recentes).map((r) => ({ ...r, participantes: lista<string>(r.participantes), frentes: lista<string>(r.frentes) })),
      projetos: lista<Pendencias['projetos'][number]>(d?.projetos),
    };
    pendErro = false;
  } catch {
    // Servidor sem a rota (ou fora do ar): a aba mostra o estado vazio; o resto segue.
    pendErro = !pendencias;
  }
  renderTabs();
  if (rota.aba === 'pendencias') renderPendencias();
  if (rota.aba === 'visao') renderProjetos(false);
}

function passaFiltro(t: Tarefa): boolean {
  const fs = (t as TarefaGeral).frentes ?? [];
  if (pendFiltro === '*') return true;
  if (pendFiltro === '') return fs.length === 0;
  return fs.includes(pendFiltro);
}

function contadorPendencias(): string {
  if (!pendencias) return '';
  const abertas = pendencias.todo.filter((t) => t.quadrante !== 'OK');
  const p1 = abertas.filter((t) => t.quadrante === 'P1').length;
  const venc = abertas.filter((t) => t.vencida).length;
  return `<b class="tab-n" title="${abertas.length} tarefas abertas">${abertas.length}</b>${p1 + venc ? `<b class="tab-n alerta" title="${p1} em P1 · ${venc} vencidas">${p1 + venc}</b>` : ''}`;
}

function renderPendencias(): void {
  if (rota.aba !== 'pendencias') return;
  const p = pendencias;
  if (!p) {
    setHtml($('#pend-cab'), `<div class="fh pend-fh"><div class="fh-top"><h1>Pendências</h1></div><p class="fh-obj muted${pendErro ? '' : ' carregando'}">${pendErro ? 'O servidor ainda não respondeu às pendências. Os terminais seguem funcionando na Geral.' : 'Carregando o TODO…'}</p></div>`);
    $('#pend-kanban').hidden = true;
    setHtml($('#pend-aside'), '');
    return;
  }
  const abertas = p.todo.filter((t) => t.quadrante !== 'OK');
  const n = (f: (t: TarefaGeral) => boolean) => abertas.filter(f).length;
  // Filtro: frente que sumiu da lista volta para "Todas".
  if (pendFiltro !== '*' && pendFiltro !== '' && !frentes.some((f) => f.id === pendFiltro) && !abertas.some((t) => t.frentes.includes(pendFiltro))) pendFiltro = '*';
  const chip = (f: string, rotulo: string, qtd: number, cor?: string) =>
    `<button type="button" class="fchip${pendFiltro === f ? ' on' : ''}" data-fa="filtro" data-f="${escapeHtml(f)}" aria-pressed="${pendFiltro === f}"${cor ? ` style="--fc:${cor}"` : ''}>${cor ? '<span class="fdot"></span>' : ''}${escapeHtml(rotulo)}<b>${qtd}</b></button>`;
  const p1 = n((t) => t.quadrante === 'P1');
  const venc = n((t) => t.vencida);
  setHtml($('#pend-cab'), `<div class="fh pend-fh">
    <div class="fh-top"><h1>Pendências</h1><span class="muted">${abertas.length} abertas · ${p1} em P1 · ${venc} vencidas · hoje ${escapeHtml(fmtData(p.hoje))}</span></div>
    <div class="fchips" role="group" aria-label="Filtrar por frente">
      ${chip('*', 'Todas', abertas.length)}${chip('', 'Sem frente', n((t) => t.frentes.length === 0))}
      ${frentes.map((f, i) => chip(f.id, f.titulo, n((t) => t.frentes.includes(f.id)), corFrente(f, i))).join('')}
    </div>
  </div>`);
  renderKanban();
  renderPendAside();
}

function renderPendAside(): void {
  const p = pendencias;
  if (!p) return;
  const hoje = p.hoje;
  const chipsF = (ids: string[]) => ids.map((id) => `<a class="tchip" href="${hashDe(id)}" style="--fc:${corDoId(id)}"><span class="fdot"></span>${escapeHtml(nomeFrente(id))}</a>`).join('');
  const aguardando = p.todo.filter((t) => t.quadrante === 'AG');
  const ag = aguardando.length
    ? `<ul class="fa-list">${aguardando.map((t) => {
      const cobrar = !!t.cobrar && t.cobrar <= hoje;
      const info = [t.quem ? limparTexto(t.quem) : '', t.desde ? `desde ${fmtData(t.desde)}` : '', t.cobrar ? `cobrar ${fmtData(t.cobrar)}` : ''].filter(Boolean).join(' · ');
      return `<li class="${cobrar ? 'cobrar' : ''}"><b>${textoRico(t.texto)}</b>${info ? `<span class="muted">${escapeHtml(info)}${cobrar ? ' · <span class="cobrar-ja">cobrar agora</span>' : ''}</span>` : ''}${t.frentes.length ? `<div class="tchips">${chipsF(t.frentes)}</div>` : ''}</li>`;
    }).join('')}</ul>`
    : '<p class="fa-vazio">Ninguém te devendo nada.</p>';
  const ordenar = <T extends { vencido: boolean; prazo?: string }>(xs: T[]) => [...xs].sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999'));
  const comp = (xs: Pendencias['compromissos'], vazio: string) => xs.length
    ? `<ul class="fa-list">${ordenar(xs).map((c) => `<li class="${c.vencido ? 'venc' : ''}"><b>${escapeHtml(c.titulo)}</b><span class="muted">${escapeHtml([!c.meu && c.assumido_por ? limparTexto(c.assumido_por) : '', c.prazo ? `prazo ${fmtData(c.prazo)}${c.vencido ? ' · vencido' : ''}` : '', c.status ?? ''].filter(Boolean).join(' · '))}</span>${c.frentes.length ? `<div class="tchips">${chipsF(c.frentes)}</div>` : ''}</li>`).join('')}</ul>`
    : `<p class="fa-vazio">${vazio}</p>`;
  const reunioes = (xs: ReuniaoAgenda[], vazio: string) => xs.length
    ? `<ul class="fa-list compacta">${xs.map((r) => `<li${r.data === hoje ? ' class="hoje"' : ''}><div class="linha"><span class="mono muted">${escapeHtml(fmtData(r.data))}${r.hora ? ` ${escapeHtml(r.hora)}` : ''}</span><span class="clip" title="${escapeHtml(r.titulo)}">${escapeHtml(r.titulo)}</span></div>${r.participantes.length || r.frentes.length ? `<div class="tchips">${chipsF(r.frentes)}${r.participantes.length ? `<span class="muted">${r.participantes.length} ${r.participantes.length === 1 ? 'pessoa' : 'pessoas'}</span>` : ''}</div>` : ''}</li>`).join('')}</ul>`
    : `<p class="fa-vazio">${vazio}</p>`;
  const meus = p.compromissos.filter((c) => c.meu);
  const outros = p.compromissos.filter((c) => !c.meu);
  setHtml($('#pend-aside'), `<section class="fa-box">
      <header><h3>Aguardando</h3><span class="kn">${aguardando.length}</span></header>${ag}
    </section>
    <section class="fa-box">
      <header><h3>Compromissos</h3><span class="kn">${p.compromissos.length}</span></header>
      <h4>Meus <span>${meus.length}</span></h4>${comp(meus, 'Nada assumido por você.')}
      <h4>Dos outros <span>${outros.length}</span></h4>${comp(outros, 'Ninguém assumiu nada com você.')}
    </section>
    <section class="fa-box">
      <header><h3>Agenda</h3><span class="muted">próximos 7 dias</span></header>
      ${reunioes(p.agenda, 'Nenhuma reunião futura no vault — o ritual cria as de amanhã.')}
      <h4>Últimos 7 dias <span>${p.recentes.length}</span></h4>${reunioes(p.recentes, 'Nenhuma reunião registrada.')}
    </section>`);
}

/** Visão geral: lista compacta dos projetos (ordem do servidor), depois dos cartões das frentes. */
function renderProjetos(animar: boolean): void {
  const box = $('#visao-projetos');
  const ps = pendencias?.projetos ?? [];
  if (!ps.length) {
    setHtml(box, '');
    return;
  }
  const hoje = pendencias?.hoje ?? hojeIso();
  setHtml(box, `<header class="visao-head"><h2>Projetos</h2><span class="muted">${ps.length}</span></header>
    <ul class="proj-lista">${ps.map((p) => {
      const venceu = !!p.prazo && p.prazo < hoje && !/conclu|encerr|feito/i.test(p.status);
      const cor = p.frente ? corDoId(p.id) : 'var(--border-strong)';
      return `<li class="proj" style="--fc:${cor}">
        <span class="fdot"></span>
        <span class="proj-tit">${escapeHtml(p.titulo)}</span>
        ${p.status ? `<span class="fstatus ${escapeHtml(p.status.toLowerCase())}">${escapeHtml(p.status)}</span>` : '<span></span>'}
        ${p.prazo ? `<span class="proj-prazo${venceu ? ' venc' : ''}">${escapeHtml(fmtData(p.prazo))}${venceu ? ' · vencido' : ''}</span>` : '<span class="proj-prazo muted">sem prazo</span>'}
        <span class="proj-n"><span title="tarefas abertas">${p.abertas} abertas</span>${p.p1 ? `<span class="alerta">${p.p1} P1</span>` : ''}${p.vencidas ? `<span class="alerta">${p.vencidas} vencidas</span>` : ''}</span>
        ${p.frente ? `<a class="selo" href="${hashDe(p.id)}" title="Abrir a aba da frente">frente ›</a>` : `<code class="proj-nota" title="${escapeHtml(p.nota)}">${escapeHtml(p.nota)}</code>`}
      </li>`;
    }).join('')}</ul>`);
  if (animar && !REDUZIR.matches) {
    box.querySelectorAll<HTMLElement>('.proj').forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 440, delay: Math.min(i, 12) * 35, easing: EASE_MOLA, fill: 'backwards' },
    ));
  }
}

// ---------- Sessões: mover entre frentes e sugestão ----------

let ocultasCache: Record<string, string> | null = null;
function sugestoesOcultas(): Record<string, string> {
  if (ocultasCache) return ocultasCache;
  try {
    ocultasCache = JSON.parse(localStorage.getItem(SUG_KEY) ?? '{}') ?? {};
  } catch {
    ocultasCache = {};
  }
  return ocultasCache!;
}
/** ✕ no chip: a sessão fica na Geral e esta página não sugere de novo a mesma frente para ela. */
function ocultarSugestao(id: string, frente: string): void {
  const o = sugestoesOcultas();
  o[id] = frente;
  try {
    localStorage.setItem(SUG_KEY, JSON.stringify(o));
  } catch {}
  refreshSummary();
}
function sugestaoVisivel(meta: SessionMeta): boolean {
  const s = meta.sugestao;
  return !!s?.frente && frenteDe(meta) === '' && sugestoesOcultas()[meta.id] !== s.frente;
}

function pintarSugestao(card: Card): void {
  const box = card.el.querySelector('.sugestao') as HTMLElement;
  const ver = sugestaoVisivel(card.meta);
  const estava = !box.hidden;
  box.hidden = !ver;
  const s = card.meta.sugestao;
  if (!ver || !s) return;
  box.style.setProperty('--fc', corDoId(s.frente));
  (box.querySelector('.sug-txt') as HTMLElement).innerHTML = `Parece de <b>${escapeHtml(nomeFrente(s.frente))}</b>`;
  box.title = s.motivo || '';
  (box.querySelector('[data-act="sug-mover"]') as HTMLElement).title = `Mover esta sessão para ${nomeFrente(s.frente)}`;
  if (!estava) bump(box, 'sug-chega');
}

async function moverSessao(card: Card, frente: string): Promise<void> {
  if (frenteDe(card.meta) === frente) return;
  try {
    const meta: SessionMeta | null = await api(`/api/sessions/${card.meta.id}/frente`, { frente });
    upsert(meta && meta.id ? meta : { ...card.meta, frente, sugestao: null });
    refreshSummary();
    aviso(`“${displayTitle(card.meta)}” foi para ${nomeFrente(frente)}`);
  } catch (err) {
    alertError(err as Error);
  }
}

function menuMover(card: Card, anchor: HTMLElement): void {
  const atual = frenteDe(card.meta);
  const itens = [{ id: '', titulo: 'Geral', cor: 'var(--muted)' }, ...frentes.map((f, i) => ({ id: f.id, titulo: f.titulo, cor: corFrente(f, i) }))];
  if (atual && !itens.some((x) => x.id === atual)) itens.push({ id: atual, titulo: nomeFrente(atual), cor: corDoId(atual) });
  abrirMenu(anchor, 'Mover para', itens.map((x) => ({ label: x.titulo, cor: x.cor, atual: x.id === atual, acao: () => void moverSessao(card, x.id) })));
}

// ---------- Menu suspenso (Mover para…) ----------

interface ItemMenu { label: string; cor?: string; atual?: boolean; acao: () => void }
let menuAberto: HTMLElement | null = null;
let menuAncora: HTMLElement | null = null;

function abrirMenu(anchor: HTMLElement, titulo: string, itens: ItemMenu[]): void {
  const mesmo = menuAncora === anchor;
  fecharMenu();
  if (mesmo) return; // segundo clique no mesmo botão fecha
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="menu-tit">${escapeHtml(titulo)}</div>` + itens.map((it, i) =>
    `<button type="button" role="menuitem" data-i="${i}"${it.atual ? ' disabled aria-current="true"' : ''}>${it.cor ? `<span class="fdot" style="background:${it.cor}"></span>` : ''}<span>${escapeHtml(it.label)}</span>${it.atual ? '<span class="muted">aqui</span>' : ''}</button>`,
  ).join('');
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth;
  const mh = m.offsetHeight;
  const left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8));
  const top = r.bottom + 6 + mh > innerHeight - 8 ? Math.max(8, r.top - mh - 6) : r.bottom + 6;
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  m.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!b || b.disabled) return;
    fecharMenu();
    itens[Number(b.dataset.i)].acao();
  });
  m.addEventListener('keydown', (ev) => {
    const botoes = [...m.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    if (ev.key === 'Escape') {
      ev.preventDefault();
      fecharMenu();
      anchor.focus();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = botoes.length;
      botoes[(i + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n]?.focus();
    }
  });
  menuAberto = m;
  menuAncora = anchor;
  m.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  setTimeout(() => document.addEventListener('pointerdown', foraDoMenu, true), 0);
}
function foraDoMenu(ev: Event): void {
  if (!menuAberto || menuAberto.contains(ev.target as Node)) return;
  // Clique no próprio botão que abriu: o click dele fecha (alternar), não reabre.
  if (menuAncora?.contains(ev.target as Node)) return;
  fecharMenu();
}
function fecharMenu(): void {
  menuAberto?.remove();
  menuAberto = null;
  menuAncora = null;
  document.removeEventListener('pointerdown', foraDoMenu, true);
}
window.addEventListener('resize', fecharMenu);
$('#main').addEventListener('scroll', fecharMenu, { passive: true });

// ---------- 5 min de conhecimento (pílula diária) ----------

type TipoConhecimento = 'marcelo' | 'noticia' | 'video' | 'repo';
interface ItemConhecimento {
  id: string; tipo: TipoConhecimento; titulo: string; resumo: string; porque: string; como_usar: string;
  frentes: string[]; link: string; autor?: string; quando?: string; minutos_video?: number; lido?: boolean; teams?: string;
}
interface Pilula { data: string; geradoEm?: string | number; destaque?: string; minutos?: number; itens: ItemConhecimento[] }

let conhecimento: { pilula: Pilula | null; nota: string | null } | null = null;
const conAbertos = new Set<string>();
let conSalvando = false;
let conGerando = false;

async function carregarConhecimento(): Promise<void> {
  try {
    const d = await api('/api/conhecimento');
    const p = d?.pilula;
    conhecimento = {
      pilula: p && typeof p === 'object' ? { ...p, itens: Array.isArray(p.itens) ? p.itens.map((i: ItemConhecimento) => ({ ...i, frentes: Array.isArray(i.frentes) ? i.frentes : [] })) : [] } : null,
      nota: typeof d?.nota === 'string' && d.nota ? d.nota : null,
    };
  } catch {
    // Servidor sem a rota: o cartão some, o resto da página segue.
    conhecimento = null;
  }
  renderConhecimento(false);
  if (rota.aba === 'frente') renderAside();
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ROTULO_TIPO: Record<TipoConhecimento, string> = { marcelo: 'via Marcelo', noticia: 'Notícia', video: 'Vídeo', repo: 'Repo' };
const ICONE_TIPO: Record<TipoConhecimento, string> = {
  marcelo: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  noticia: '<path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h3"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  repo: '<path d="M6 3h12v18l-6-4-6 4z"/>',
};
function rotuloTipo(i: ItemConhecimento): string {
  const base = ROTULO_TIPO[i.tipo] ?? escapeHtml(i.tipo);
  return i.tipo === 'video' && i.minutos_video ? `${base} · ${i.minutos_video} min` : base;
}
function iconeTipo(t: TipoConhecimento): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_TIPO[t] ?? ICONE_TIPO.noticia}</svg>`;
}
function chipsFrentes(ids: string[]): string {
  return ids.length
    ? `<div class="kfrentes">${ids.map((id) => `<a href="${hashDe(id)}" style="--fc:${corDoId(id)}"><span class="fdot"></span>${escapeHtml(nomeFrente(id))}</a>`).join('')}</div>`
    : '';
}
function tituloLinkado(i: ItemConhecimento, classe: string): string {
  const href = urlSegura(i.link);
  return href
    ? `<a class="${classe}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.titulo)}</a>`
    : `<span class="${classe}">${escapeHtml(i.titulo)}</span>`;
}

/** Cartão no topo da Visão geral: destaque + itens que abrem para "Por que importa" e "Como usar". */
function renderConhecimento(animarNovo: boolean): void {
  const box = $('#conhecimento');
  if (!conhecimento) {
    setHtml(box, '');
    return;
  }
  const { pilula, nota } = conhecimento;
  const gerar = `<button type="button" class="btn small${pilula ? ' ghost' : ' primary'}" data-kc="gerar"${conGerando ? ' disabled' : ''} title="Abre uma sessão “5 min de conhecimento” na Geral rodando /conhecimento">${conGerando ? 'Abrindo…' : 'Gerar agora'}</button>`;
  const icone = '<span class="kcon-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/></svg></span>';
  if (!pilula) {
    setHtml(box, `<section class="kcon vazio"><header class="kcon-head">${icone}<div class="kcon-tit"><h2>5 min de conhecimento</h2><span class="muted">Ainda não há pílula — roda no ritual das 07:30 ou clique em Gerar agora.</span></div><span class="spacer"></span>${gerar}</header></section>`);
    return;
  }
  const quando = pilula.data === hojeIso() ? 'hoje' : fmtData(pilula.data);
  const minutos = pilula.minutos ?? 5;
  const salvar = nota
    ? `<span class="kcon-salvo" title="${escapeHtml(nota)}">Salvo em <code>${escapeHtml(nota)}</code></span>`
    : `<button type="button" class="btn small" data-kc="salvar"${conSalvando ? ' disabled' : ''}>${conSalvando ? 'Salvando…' : 'Salvar no vault'}</button>`;
  const itens = pilula.itens.map((i) => {
    const aberto = conAbertos.has(i.id);
    const id = escapeHtml(i.id);
    return `<li class="kitem tipo-${escapeHtml(i.tipo)}${aberto ? ' aberto' : ''}${i.lido ? ' lido' : ''}" data-id="${id}">
      <div class="kitem-top" data-kc="toggle">
        <span class="ktipo">${iconeTipo(i.tipo)}${rotuloTipo(i)}</span>
        ${tituloLinkado(i, 'ktit')}
        <button type="button" class="kchev" data-kc="toggle" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Ver por que importa e como usar'}">▸</button>
      </div>
      ${i.resumo ? `<p class="kres">${escapeHtml(i.resumo)}</p>` : ''}
      <div class="kitem-corpo"${aberto ? '' : ' hidden'}>
        ${i.porque ? `<div><b>Por que importa</b><p>${escapeHtml(i.porque)}</p></div>` : ''}
        ${i.como_usar ? `<div><b>Como usar</b><p>${escapeHtml(i.como_usar)}</p></div>` : ''}
        ${i.autor || i.quando || i.teams ? `<span class="muted">${escapeHtml([i.autor, i.quando ? fmtQuando(i.quando) : '', i.teams].filter(Boolean).join(' · '))}</span>` : ''}
      </div>
      ${chipsFrentes(i.frentes)}
    </li>`;
  }).join('');
  setHtml(box, `<section class="kcon">
    <header class="kcon-head">${icone}<div class="kcon-tit"><h2>5 min de conhecimento</h2><span class="muted">${escapeHtml(quando)} · ~${minutos} min · ${pilula.itens.length} ${pilula.itens.length === 1 ? 'item' : 'itens'}</span></div><span class="spacer"></span>${salvar}${gerar}</header>
    ${pilula.destaque ? `<p class="kcon-dest">${escapeHtml(pilula.destaque)}</p>` : ''}
    ${itens ? `<ol class="kitens">${itens}</ol>` : ''}
  </section>`);
  if (animarNovo && !REDUZIR.matches) box.firstElementChild?.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: EASE_MOLA });
}

$('#conhecimento').addEventListener('click', async (ev) => {
  const alvo = ev.target as HTMLElement;
  if (alvo.closest('a')) return; // título e chips de frente seguem o link
  const kc = alvo.closest<HTMLElement>('[data-kc]')?.dataset.kc;
  if (kc === 'toggle') {
    const li = alvo.closest<HTMLElement>('.kitem');
    const id = li?.dataset.id;
    if (!id) return;
    if (conAbertos.has(id)) conAbertos.delete(id);
    else conAbertos.add(id);
    renderConhecimento(false);
    const corpo = $('#conhecimento').querySelector<HTMLElement>(`.kitem[data-id="${CSS.escape(id)}"] .kitem-corpo`);
    if (corpo && !corpo.hidden && !REDUZIR.matches) corpo.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_OUT });
  }
  if (kc === 'salvar' && conhecimento?.pilula) {
    conSalvando = true;
    renderConhecimento(false);
    try {
      const r = await api('/api/conhecimento/nota', { data: conhecimento.pilula.data });
      if (conhecimento && r?.nota) conhecimento.nota = r.nota;
      aviso(r?.criada === false ? `A nota já existia: ${r?.nota ?? ''}` : `Salvo em ${r?.nota ?? 'o vault'}`);
    } catch (err) {
      alertError(err as Error);
    }
    conSalvando = false;
    renderConhecimento(false);
  }
  if (kc === 'gerar') {
    conGerando = true;
    renderConhecimento(false);
    try {
      const meta: SessionMeta | null = await api('/api/conhecimento/gerar', {});
      if (meta?.id) {
        upsert(meta);
        refreshSummary();
        navegar({ aba: 'geral' });
        aviso('Gerando a pílula numa sessão na Geral: ela aparece aqui quando terminar.');
        cards.get(meta.id)?.term.focus();
      }
    } catch (err) {
      alertError(err as Error);
    }
    conGerando = false;
    renderConhecimento(false);
  }
});

/** Na página da frente: itens da pílula que citam esta frente. */
function blocoConhecimentoDaFrente(fid: string): string {
  const p = conhecimento?.pilula;
  const itens = p?.itens.filter((i) => i.frentes.includes(fid)) ?? [];
  if (!p || !itens.length) return '';
  const titulo = p.data === hojeIso() ? 'Do 5 min de hoje' : `Do 5 min de ${fmtData(p.data)}`;
  return `<section class="fa-box fa-con">
    <header><h3>${titulo}</h3><a class="fa-mais" href="#/visao">Ver tudo</a></header>
    <ul class="fa-list">${itens.map((i) => `<li><div class="linha"><span class="ktipo">${iconeTipo(i.tipo)}${rotuloTipo(i)}</span></div>${tituloLinkado(i, 'ktit')}${i.porque ? `<p>${escapeHtml(i.porque)}</p>` : i.resumo ? `<p>${escapeHtml(i.resumo)}</p>` : ''}</li>`).join('')}</ul>
  </section>`;
}

// ---------- Utilitários das frentes ----------

/** Epoch em ms (aceita segundos). */
function emMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}
/** 2026-11-10 → 10/11 (com o ano quando não é o atual). */
function fmtData(s: string): string {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s ?? '');
  return m[1] === String(new Date().getFullYear()) ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}
/** Data/hora vinda do Teams ou do Jira: ISO vira "10/11 14:30"; o resto passa como veio. */
function fmtQuando(s: string): string {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return String(s ?? '');
  if (m[4] && /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${fmtData(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${fmtData(s)}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
}
/** Tira o [[...]] dos wikilinks (fica o apelido ou o id). */
function limparTexto(s: string): string {
  return String(s ?? '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, alias) => alias || id);
}
/** Texto da tarefa: wikilinks viram etiqueta e chaves do Jira viram link. */
function textoRico(s: string): string {
  const simples = (x: string) => escapeHtml(x)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, alias) => `<span class="wl">${alias || id}</span>`)
    .replace(/\b([A-Z][A-Z0-9]+-\d+)\b/g, `<a class="jkey" href="${JIRA_BASE}$1" target="_blank" rel="noopener noreferrer">$1</a>`);
  // Links Markdown [texto](https://…) viram link; o resto passa por wikilinks e chaves do Jira.
  const re = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;
  let out = '';
  let i = 0;
  for (const m of String(s ?? '').matchAll(re)) {
    out += simples(s.slice(i, m.index)) + `<a class="mdlink" href="${escapeHtml(m[2])}" target="_blank" rel="noopener noreferrer">${escapeHtml(m[1])}</a>`;
    i = m.index! + m[0].length;
  }
  return out + simples(String(s ?? '').slice(i));
}
function urlSegura(u: unknown): string | null {
  return typeof u === 'string' && /^https:\/\//i.test(u) ? u : null;
}
function classeStatus(s: string): string {
  const x = String(s ?? '').toLowerCase();
  if (/conclu|done|feito|resolv|fechad|closed/.test(x)) return 'ok';
  if (/andamento|progress|review|revis|desenvolv|doing|valida/.test(x)) return 'info';
  if (/bloq|block|imped/.test(x)) return 'err';
  return '';
}
/** Aviso neutro (não é erro). */
function aviso(msg: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast ok';
  toast.setAttribute('role', 'status');
  toast.textContent = msg;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 4000);
}

// O "há X" da Visão geral e do Jira/Teams envelhece sozinho.
setInterval(() => {
  if (rota.aba === 'visao') renderVisao(false);
  if (rota.aba === 'frente') renderAside();
}, 60_000);

// ---------- Utilitários ----------

/** Nome curto da sessão: o que o servidor deu ou, sem ele, a última pasta do caminho (\ ou /). */
function shortName(meta: SessionMeta): string {
  return meta.name || baseName(meta.cwd);
}

/** Tema da conversa; enquanto não existe, o nome da pasta. */
function displayTitle(meta: SessionMeta): string {
  return meta.title || shortName(meta);
}

function prettyModel(id: string): string {
  const m = id.match(/claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/i);
  if (!m) return id;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`;
}
function modelColor(model: string): string {
  const family = Object.keys(MODEL_COLORS).find((f) => model.toLowerCase().includes(f));
  return family ? MODEL_COLORS[family] : '#cecfd2';
}
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace('.', ',')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 48 * 3600) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} dias`;
}
function modKey(): string {
  return IS_MAC ? '⌘' : 'Ctrl+';
}
function escapeHtml(s: unknown): string {
  // Campo ausente vira vazio, em vez de derrubar a lista.
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
/** Erro de ação vira aviso na tela, além do console. */
function alertError(err: Error): void {
  console.error(err);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.textContent = `Não deu certo: ${err.message}`;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 6000);
}

fillRecent();
defaultHint();
api('/api/sessions').then((data) => {
  home = data.home;
  principal = data.principal ?? '';
  // O campo já vem com a pasta principal: Abrir (ou Enter) abre direto no Jarvis.
  if (!cwdInput.value) cwdInput.value = mainCwd();
  defaultHint();
}).catch(alertError);
// Rota inicial: sem hash, abre na Visão geral (e grava #/visao para o voltar do navegador).
if (!location.hash) history.replaceState(null, '', hashDaRota(rota));
trocarAba(rota, true);
void carregarFrentes();
void carregarPendencias();
void carregarConhecimento().then(() => renderConhecimento(rota.aba === 'visao'));
if (rota.aba !== 'visao') cwdInput.focus();
connect();
