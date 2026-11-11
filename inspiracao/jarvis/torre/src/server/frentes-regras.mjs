// Regras puras das frentes (sem IO): casar tarefa com frente, sugerir a frente de uma sessão,
// tirar o objetivo da nota. Testes: node teste/frentes.test.mjs

/** "Ação Já-Feita" → "acao ja feita": sem acento, sem caixa, só letras e números separados por espaço. */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** O texto cita o termo como palavra(s) inteira(s)? Os dois normalizados. */
export function citaTermo(texto, termo) {
  const t = normalizar(termo);
  if (!t) return false;
  return ` ${normalizar(texto)} `.includes(` ${t} `);
}

/** "WeHandle/exptools-ajudante" → "exptools-ajudante"; vazio se não houver. */
export function repoNome(repo) {
  const s = String(repo ?? '').trim().replace(/\.git$/i, '').replace(/[\\/]+$/, '');
  return s.split(/[\\/]/).pop() ?? '';
}

function caminhoNorm(p) {
  return String(p ?? '').normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** cwd é a pasta ou está dentro dela (Windows: \ e / valem igual, sem caixa). */
export function dentroDaPasta(cwd, pasta) {
  const c = caminhoNorm(cwd);
  const p = caminhoNorm(pasta);
  if (!c || !p) return false;
  return c === p || c.startsWith(p + '/');
}

/** Algum trecho do caminho é exatamente o nome do repo? */
export function caminhoTemRepo(cwd, repo) {
  const nome = caminhoNorm(repoNome(repo));
  if (!nome) return false;
  return caminhoNorm(cwd).split('/').includes(nome);
}

const PONTOS_PASTA = 10;
const PONTOS_REPO_NO_CAMINHO = 8;
const PONTOS_CITACAO = 5;
/** Abaixo disso a sessão fica na Geral: uma citação de nome já basta, nada menos. */
export const LIMIAR_SUGESTAO = 5;
/** Nome curto demais ("BI", "app") casa à toa: não conta. */
const TERMO_MINIMO = 4;

function termosDa(frente) {
  const lista = [frente.id, frente.titulo, ...(frente.aliases ?? []), repoNome(frente.repo)];
  const vistos = new Set();
  const out = [];
  for (const t of lista) {
    const n = normalizar(t);
    if (n.length < TERMO_MINIMO || vistos.has(n)) continue;
    vistos.add(n);
    out.push(String(t));
  }
  return out;
}

/**
 * Pontua cada frente para uma sessão da Geral. Pasta da frente e repo no caminho pesam mais;
 * citar o id, o título, um alias ou o repo no título/primeiro pedido soma (no máximo dois termos).
 * Sem passar do limiar, ou com empate no topo, devolve null (a sessão fica na Geral).
 */
export function sugerirFrente(sessao, frentes) {
  const { titulo = '', primeiroPedido = '', cwd = '' } = sessao ?? {};
  const texto = `${titulo} ${primeiroPedido}`;
  const placar = [];
  for (const f of frentes ?? []) {
    if (!f?.id) continue;
    let pontos = 0;
    const motivos = [];
    if (cwd && (f.pastas ?? []).some((p) => dentroDaPasta(cwd, p))) {
      pontos += PONTOS_PASTA;
      motivos.push('abre numa pasta da frente');
    } else if (cwd && f.repo && caminhoTemRepo(cwd, f.repo)) {
      pontos += PONTOS_REPO_NO_CAMINHO;
      motivos.push(`o caminho tem o repo ${repoNome(f.repo)}`);
    }
    const citados = termosDa(f).filter((t) => citaTermo(texto, t)).slice(0, 2);
    if (citados.length) {
      pontos += citados.length * PONTOS_CITACAO;
      motivos.push(`cita ${citados.map((t) => `"${t}"`).join(' e ')}`);
    }
    if (pontos >= LIMIAR_SUGESTAO) placar.push({ frente: f.id, pontos, motivo: motivos.join('; ') });
  }
  if (!placar.length) return null;
  placar.sort((a, b) => b.pontos - a.pontos);
  if (placar[1] && placar[1].pontos === placar[0].pontos) return null;
  return { frente: placar[0].frente, motivo: placar[0].motivo };
}

/** A linha do TODO é da frente? links = ids dos wikilinks da linha (ctx ou texto). */
export function tarefaDaFrente(links, frente) {
  const nomes = new Set([frente.id, ...(frente.aliases ?? [])].map(normalizar).filter(Boolean));
  return (links ?? []).some((l) => l === frente.id || nomes.has(normalizar(l)));
}

/** Chave do Jira da tarefa: fonte "jira:KEY" ou um "jira:KEY" na linha. */
export function jiraDe(fonte, linha) {
  const m = String(fonte ?? '').match(/^\s*jira:\s*([A-Z][A-Z0-9]+-\d+)/i) ?? String(linha ?? '').match(/\bjira:\s*([A-Z][A-Z0-9]+-\d+)/i);
  return m ? m[1].toUpperCase() : undefined;
}

/** Markdown → texto puro de uma linha: wikilinks viram o rótulo, ênfase e código somem. */
export function textoPuro(md) {
  return String(md ?? '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+/g, '')
    .replace(/(\*\*|\*)(?=\S)([^*]+?)\1/g, '$2')
    .replace(/^\s*(?:[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Primeiro parágrafo de "## Objetivo" (ou do corpo, sem títulos), texto puro, até `max` caracteres. */
export function objetivoDe(corpo, max = 400) {
  const linhas = String(corpo ?? '').split(/\r?\n/);
  const ini = linhas.findIndex((l) => /^##\s+Objetivo\b/i.test(l.trim()));
  const resto = ini >= 0 ? linhas.slice(ini + 1) : linhas;
  const par = [];
  for (const l of resto) {
    const t = l.trim();
    if (/^#{1,6}\s/.test(t)) {
      if (par.length || ini >= 0) break;
      continue;
    }
    if (!t) {
      if (par.length) break;
      continue;
    }
    par.push(t);
  }
  const txt = textoPuro(par.join('\n'));
  return txt.length > max ? txt.slice(0, max - 1).trimEnd() + '…' : txt;
}

/** Ativas primeiro, depois pelo título (pt-BR). */
export function ordenarFrentes(lista) {
  const ativa = (s) => (normalizar(s) === 'ativo' || normalizar(s) === 'ativa' ? 0 : 1);
  return [...lista].sort((a, b) => ativa(a.status) - ativa(b.status) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));
}
