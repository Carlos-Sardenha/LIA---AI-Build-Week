// Consultas do grafo do segundo cérebro (mesmas funções para o MCP e o CLI). Só leitura.
// Toda função recebe (c, args) e devolve texto. c = await contexto().
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ROOT, carregarGrafo, resolverNo, rotulo, hoje, addDias, toList, wikilinks, chaveDeLink, TIPOS, semCodigoInline } from './vault.mjs'
import { indexar } from './indice.mjs'
import { dobrar, padrao, exigencias, casarLinhas, contar, recorte } from './grep.mjs'

// ── contexto com cache ───────────────────────────────────────────────────────

const caches = new Map()
export async function contexto({ root = ROOT, ttlMs = 60_000, forcar = false } = {}) {
  const k = path.resolve(root)
  const c = caches.get(k)
  if (c && !forcar && Date.now() - c.g.carregadoEm < ttlMs) return c
  const g = await carregarGrafo(k)
  const novo = { g, bm: indexar(g), root: k, todo: parseTodo(g.arquivosTxt.get('TODO.md') ?? '') }
  caches.set(k, novo)
  return novo
}

// ── utilidades ───────────────────────────────────────────────────────────────

const HUBS = new Set(['cliente', 'todo', 'daily', 'semanal'])
// D3: abertos = aberto | em_andamento | aguardando. Sem status (fora do schema) conta como aberto para não sumir;
// "pendente" e outros valores fora do schema NÃO contam (o lint aponta).
const ABERTOS = new Set(['aberto', 'em_andamento', 'aguardando', null, undefined, ''])
const lk = (id) => `[[${id}]]`
const lim = (v, d, teto = 500) => Math.max(1, Math.min(Number(v) || d, teto))
const str = (v) => (v === null || v === undefined ? '' : String(v))

function semanaInicio(iso) { const d = new Date(`${iso}T12:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return addDias(iso, -dow) }
export function intervalo({ periodo, desde, ate } = {}, ref = hoje()) {
  let d = desde ?? null, a = ate ?? null
  switch (periodo) {
    case undefined: case null: case '': break
    case 'hoje': d = ref; a = ref; break
    case 'semana': d = semanaInicio(ref); a = addDias(d, 6); break
    case 'semana-passada': a = addDias(semanaInicio(ref), -1); d = addDias(a, -6); break
    case 'mes': d = `${ref.slice(0, 7)}-01`; a = ref; break
    case '7d': d = addDias(ref, -7); a = ref; break
    case '30d': d = addDias(ref, -30); a = ref; break
    case '90d': d = addDias(ref, -90); a = ref; break
    case 'proximos-7d': d = ref; a = addDias(ref, 7); break
    default: throw new Error(`período inválido: ${periodo} (use hoje, semana, semana-passada, mes, 7d, 30d, 90d, proximos-7d)`)
  }
  for (const [n, v] of [['desde', d], ['ate', a]]) if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${n} precisa ser AAAA-MM-DD`)
  return { desde: d, ate: a }
}
const dentro = (data, { desde, ate }) => (!desde || (data && data >= desde)) && (!ate || (data && data <= ate))
const rotuloPeriodo = ({ desde, ate }) => (desde || ate ? ` · período ${desde ?? '…'} a ${ate ?? '…'}` : '')

function exigirNo(g, q, tipo, nomeArg) {
  const id = resolverNo(g, q, tipo)
  if (!id) throw new Error(`${nomeArg ?? tipo ?? 'nó'} não encontrado: "${q}". Use jarvis_buscar para achar o id.`)
  return id
}
const saidas = (g, id) => g.saidas.get(id) ?? []
const entradas = (g, id) => g.entradas.get(id) ?? []
// a liga b? (por propriedade; com fracas = true, também por menção no corpo)
function liga(g, a, b, { fracas = true, rels = null } = {}) {
  return saidas(g, a).some((e) => e.para === b && (fracas || e.rel !== 'menciona') && (!rels || rels.includes(e.rel)))
}
function alvos(g, id, rel, tipo = null) {
  return saidas(g, id).filter((e) => e.rel === rel && (!tipo || g.nos.get(e.para)?.tipo === tipo)).map((e) => e.para)
}
// clientes de um nó: propriedade cliente/org; senão, os da reunião de origem; senão, menção no corpo
function clientesDe(g, id, prof = 0) {
  const diretos = [...alvos(g, id, 'cliente', 'cliente'), ...alvos(g, id, 'org', 'cliente')]
  if (diretos.length) return [...new Set(diretos)]
  if (prof < 1) for (const rel of ['firmado_em', 'tomada_em']) for (const r of alvos(g, id, rel)) { const cs = clientesDe(g, r, prof + 1); if (cs.length) return cs }
  return [...new Set(alvos(g, id, 'menciona', 'cliente'))]
}
function linhaNo(g, id, extra = '') {
  const n = g.nos.get(id)
  return `- ${lk(id)} (${n?.tipo ?? '?'}) ${rotulo(n)}${extra}`
}

// ── TODO.md (lido à parte, não é nó de domínio) ──────────────────────────────

export function parseTodo(txt) {
  const out = []
  let secao = null
  String(txt).split(/\r?\n/).forEach((l, i) => {
    const h = l.match(/^##\s+(.+)$/)
    if (h) { secao = h[1].trim(); return }
    const m = l.match(/^\s*-\s+\[( |x|X)\]\s+(.*)$/)
    if (!m) return
    const partes = m[2].split(/\s+\|\s+/)
    const campos = {}
    const marcas = []
    for (const p of partes.slice(1)) {
      const kv = p.match(/^([a-z_]+):\s*(.*)$/i)
      if (kv) campos[kv[1].toLowerCase()] = kv[2].trim()
      else marcas.push(p.trim())
    }
    out.push({ texto: partes[0].trim(), feito: m[1] !== ' ', secao, campos, marcas, linha: i + 1,
      links: wikilinks(semCodigoInline(m[2])).map((x) => x.para),
      ctx: wikilinks(semCodigoInline(campos.ctx ?? '')).map((x) => x.para) })
  })
  return out
}

// ── jarvis_cobertura ─────────────────────────────────────────────────────────

async function contarArquivos(dir, filtro = () => true) {
  let n = 0
  async function rec(d) {
    let ents
    try { ents = await fs.readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (e.isDirectory()) await rec(path.join(d, e.name))
      else if (e.isFile() && e.name !== '.gitkeep' && filtro(e.name)) n++
    }
  }
  await rec(dir)
  return n
}

export async function cobertura(c) {
  const { g } = c
  const porTipo = new Map()
  for (const n of g.nos.values()) {
    if (g.redir.has(n.id)) continue
    let t = porTipo.get(n.tipo)
    if (!t) porTipo.set(n.tipo, t = { n: 0, min: null, max: null, semFm: 0 })
    t.n++
    if (n.data) { if (!t.min || n.data < t.min) t.min = n.data; if (!t.max || n.data > t.max) t.max = n.data }
    if (!n.temFm) t.semFm++
  }
  const orfas = [...g.nos.values()].filter((n) => !['todo', 'daily', 'semanal'].includes(n.tipo) && !saidas(g, n.id).length && !entradas(g, n.id).length).map((n) => n.id)
  const evid = [...g.nos.values()].flatMap((n) => n.evidencias)
  const inboxDirs = []
  try { for (const e of await fs.readdir(path.join(g.root, 'Inbox'), { withFileTypes: true })) if (e.isDirectory() && e.name !== '_raw') inboxDirs.push(e.name) } catch {}
  const pend = []
  for (const d of inboxDirs) { const k = await contarArquivos(path.join(g.root, 'Inbox', d)); if (k) pend.push(`${d} ${k}`) }
  const brutos = await contarArquivos(path.join(g.root, 'Inbox', '_raw'))
  const q = [...new Map(g.quebrados.map((x) => [x.para, x])).values()]
  const L = [`Grafo do segundo cérebro · carregado ${new Date(g.carregadoEm).toISOString()} (${g.ms} ms) · hoje ${hoje()}`, '',
    'Nós por tipo (n · datas):']
  for (const t of [...TIPOS, 'todo', 'outro']) {
    const x = porTipo.get(t)
    if (!x) { if (TIPOS.includes(t)) L.push(`- ${t}: 0`); continue }
    L.push(`- ${t}: ${x.n}${x.min ? ` · ${x.min} a ${x.max}` : ''}${x.semFm ? ` · ${x.semFm} sem frontmatter` : ''}`)
  }
  for (const [t, x] of porTipo) if (![...TIPOS, 'todo', 'outro'].includes(t)) L.push(`- ${t} (tipo fora do schema): ${x.n}`)
  const nArestas = [...g.saidas.values()].reduce((s, a) => s + a.length, 0)
  const fortes = [...g.saidas.values()].reduce((s, a) => s + a.filter((e) => e.rel !== 'menciona').length, 0)
  L.push('', `Arestas: ${nArestas} (${fortes} por propriedade, ${nArestas - fortes} por menção no corpo)`,
    `Evidências: ${evid.length} (${evid.filter((e) => !e.valida).length} sem citação literal + ponteiro)`,
    `TODO.md: ${c.todo.filter((t) => !t.feito).length} abertas · ${c.todo.filter((t) => t.feito).length} concluídas`,
    `Inbox pendente (não ingerido): ${pend.length ? pend.join(' · ') : 'vazio'} · brutos em Inbox/_raw: ${brutos} (não lidos pelo grafo)`,
    `Órfãs (sem nenhuma aresta): ${orfas.length}${orfas.length ? ` — ${orfas.slice(0, 10).map(lk).join(', ')}${orfas.length > 10 ? ' …' : ''}` : ''}`,
    `Links quebrados: ${g.quebrados.length} (${q.length} alvos)${q.length ? ` — ${q.slice(0, 10).map((x) => `${x.para} ← ${x.de}`).join('; ')}${q.length > 10 ? ' …' : ''}` : ''}`)
  if (g.colisoes.length) L.push(`Chaves duplicadas (mesmo basename): ${g.colisoes.map((x) => `${x.id} (${x.arquivos.join(', ')})`).join('; ')}`)
  if (g.redir.size) L.push(`Fundidos: ${[...g.redir].map(([a, b]) => `${a} → ${b}`).join('; ')}`)
  if (g.fusoesInvalidas.length) L.push(`fundir_em inválido: ${g.fusoesInvalidas.map((x) => x.erro).join('; ')}`)
  L.push('', 'Ignorados: System/Archive, System/templates, Inbox/_raw, .claude, .harness. O grafo só sabe o que foi ingerido na wiki.')
  return L.join('\n')
}

// ── jarvis_grep ──────────────────────────────────────────────────────────────

export async function grep(c, { termo, regex = false, exigir, tipo, pasta, max } = {}) {
  const { g } = c
  const re = padrao(termo, { regex })
  const req = exigencias(exigir)
  const porArquivo = new Map()
  for (const n of g.nos.values()) porArquivo.set(n.arquivo, n)
  const teto = lim(max, 30, 300)
  const notas = []
  let total = 0
  for (const [arq, txt] of [...g.arquivosTxt].sort((a, b) => a[0].localeCompare(b[0]))) {
    const n = porArquivo.get(arq)
    if (tipo && n?.tipo !== tipo) continue
    if (pasta && !arq.toLowerCase().startsWith(String(pasta).toLowerCase().replace(/\\/g, '/'))) continue
    const dob = dobrar(txt)
    if (req.some((r) => contar(dob, r) === 0)) continue
    const linhas = txt.split(/\r?\n/)
    const dobs = linhas.map(dobrar)
    const hits = casarLinhas(dobs, re)
    if (!hits.length) continue
    total += hits.length
    notas.push({ arq, n, hits, linhas })
  }
  if (!notas.length) return `grep "${termo}": 0 ocorrências${req.length ? ' (com as exigências)' : ''}. Zero não prova que não existe: tente variantes com | ou radical.`
  const L = [`grep "${termo}": ${total} linha(s) em ${notas.length} arquivo(s)`, '']
  let mostradas = 0
  for (const { arq, n, hits, linhas } of notas) {
    L.push(`${arq}${n ? ` · ${lk(n.id)} (${n.tipo})` : ''} — ${hits.length}`)
    for (const h of hits) {
      if (mostradas >= teto) break
      L.push(`  ${arq}:${h.i + 1}: ${recorte(linhas[h.i], h.ini, h.fim)}`)
      mostradas++
    }
    if (mostradas >= teto) { L.push(`… cortado em ${teto} linhas (passe max maior)`); break }
  }
  return L.join('\n')
}

// ── jarvis_buscar ────────────────────────────────────────────────────────────

export async function buscar(c, { pergunta, tipo, cliente, k, vizinhos = true } = {}) {
  const { g, bm } = c
  if (!pergunta || String(pergunta).trim().length < 2) throw new Error('informe a pergunta')
  const cli = cliente ? exigirNo(g, cliente, 'cliente', 'cliente') : null
  const filtro = (id) => {
    const n = g.nos.get(id)
    if (tipo && n.tipo !== tipo) return false
    if (cli && id !== cli && !clientesDe(g, id).includes(cli)) return false
    return true
  }
  // frase entre aspas: exige o literal na nota
  const frases = [...String(pergunta).matchAll(/"([^"]{2,})"/g)].map((m) => dobrar(m[1]))
  const res = bm.buscar(pergunta, lim(k, 8, 50) * 3, filtro)
    .filter((r) => !frases.length || frases.every((f) => dobrar(g.arquivosTxt.get(g.nos.get(r.id).arquivo) ?? '').includes(f)))
    .slice(0, lim(k, 8, 50))
  if (!res.length) return `buscar "${pergunta}": nada encontrado${tipo ? ` (tipo ${tipo})` : ''}${cli ? ` (cliente ${cli})` : ''}. Tente jarvis_grep com variantes.`
  const L = [`buscar "${pergunta}" (BM25): ${res.length} resultado(s)`, '']
  for (const r of res) {
    const n = g.nos.get(r.id)
    L.push(`${linhaNo(g, r.id)} · ${n.arquivo} · score ${r.score.toFixed(2)}`)
    if (vizinhos) {
      const viz = [...saidas(g, r.id).filter((e) => e.rel !== 'menciona').map((e) => `${e.rel}→${lk(e.para)}`),
        ...entradas(g, r.id).filter((e) => e.rel !== 'menciona').map((e) => `${lk(e.de)}→${e.rel}`)].slice(0, 8)
      if (viz.length) L.push(`    ligações: ${viz.join(', ')}`)
    }
  }
  L.push('', 'Busca lexical (sem embedding). Para cobertura exaustiva de um termo, use jarvis_grep.')
  return L.join('\n')
}

// ── jarvis_no ────────────────────────────────────────────────────────────────

export async function no(c, { id, limite } = {}) {
  const { g } = c
  const nid = exigirNo(g, id)
  const n = g.nos.get(nid)
  const L = [`${lk(nid)} · tipo ${n.tipo} · ${n.arquivo}${n.data ? ` · data ${n.data}` : ''}`, `título: ${n.titulo}`]
  if (nid !== chaveDeLink(String(id).replace(/^\[\[|\]\]$/g, '')) && g.redir.has(chaveDeLink(String(id)))) L.push(`(${id} foi fundido em ${nid})`)
  const fusoes = [...g.redir].filter(([, b]) => b === nid).map(([a]) => a)
  if (fusoes.length) L.push(`absorveu: ${fusoes.map(lk).join(', ')}`)
  L.push('', 'Propriedades:')
  for (const [k, v] of Object.entries(n.fm)) L.push(`- ${k}: ${Array.isArray(v) ? v.join(', ') : str(v)}`)
  const teto = lim(limite, 30)
  const agrupa = (lista, campo) => {
    const m = new Map()
    for (const e of lista) { let a = m.get(e.rel); if (!a) m.set(e.rel, a = []); a.push(e[campo]) }
    return m
  }
  L.push('', 'Aponta para:')
  const out = agrupa(saidas(g, nid), 'para')
  if (!out.size) L.push('- (nada)')
  for (const [rel, ids] of out) L.push(`- ${rel}: ${ids.slice(0, teto).map(lk).join(', ')}${ids.length > teto ? ` … +${ids.length - teto}` : ''}`)
  L.push('', 'Apontado por (backlinks):')
  const inn = agrupa(entradas(g, nid), 'de')
  if (!inn.size) L.push('- (nada)')
  for (const [rel, ids] of inn) L.push(`- ${rel}: ${ids.slice(0, teto).map((x) => `${lk(x)} (${g.nos.get(x)?.tipo})`).join(', ')}${ids.length > teto ? ` … +${ids.length - teto}` : ''}`)
  if (n.evidencias.length) {
    L.push('', 'Evidências:')
    for (const e of n.evidencias) L.push(e.valida ? `- "${e.cit}"${e.autor ? ` — ${e.autor}` : ''} · fonte: ${e.ponteiro} (${n.arquivo}:${e.linha})` : `- SEM citação literal + ponteiro: ${e.resto ?? e.cit} (${n.arquivo}:${e.linha})`)
  }
  return L.join('\n')
}

// ── jarvis_vizinhos ──────────────────────────────────────────────────────────

export async function vizinhos(c, { id, profundidade = 1, tipos, limite, fracas = true } = {}) {
  const { g } = c
  const nid = exigirNo(g, id)
  const prof = Math.max(1, Math.min(Number(profundidade) || 1, 3))
  const filtroTipos = tipos ? new Set(String(tipos).split(',').map((x) => x.trim()).filter(Boolean)) : null
  const visto = new Map([[nid, { d: 0, via: null }]])
  let fronteira = [nid]
  for (let d = 1; d <= prof; d++) {
    const prox = []
    for (const cur of fronteira) {
      if (cur !== nid && HUBS.has(g.nos.get(cur)?.tipo)) continue // não atravessa hub (cliente, TODO, daily)
      const viz = [...saidas(g, cur).map((e) => ({ x: e.para, rel: e.rel, dir: '→' })), ...entradas(g, cur).map((e) => ({ x: e.de, rel: e.rel, dir: '←' }))]
      for (const v of viz) {
        if (!fracas && v.rel === 'menciona') continue
        if (visto.has(v.x)) continue
        visto.set(v.x, { d, via: `${cur} ${v.dir}${v.rel}` })
        prox.push(v.x)
      }
    }
    fronteira = prox
  }
  const lista = [...visto].filter(([x]) => x !== nid && (!filtroTipos || filtroTipos.has(g.nos.get(x)?.tipo)))
  lista.sort((a, b) => a[1].d - b[1].d || str(g.nos.get(b[0])?.data).localeCompare(str(g.nos.get(a[0])?.data)))
  const teto = lim(limite, 60)
  const L = [`Vizinhança de ${lk(nid)} até ${prof} salto(s)${filtroTipos ? ` · tipos ${[...filtroTipos].join(',')}` : ''}: ${lista.length} nó(s)`, '']
  for (const [x, info] of lista.slice(0, teto)) L.push(`${linhaNo(g, x)} · salto ${info.d} via ${info.via}`)
  if (lista.length > teto) L.push(`… +${lista.length - teto}`)
  L.push('', 'Hubs (cliente, TODO, daily, semanal) não são atravessados.')
  return L.join('\n')
}

// ── jarvis_reunioes ──────────────────────────────────────────────────────────

export async function reunioes(c, { pessoa, cliente, tema, projeto, periodo, desde, ate, limite } = {}) {
  const { g } = c
  const per = intervalo({ periodo, desde, ate })
  const p = pessoa ? exigirNo(g, pessoa, 'pessoa', 'pessoa') : null
  const cl = cliente ? exigirNo(g, cliente, 'cliente', 'cliente') : null
  const t = tema ? exigirNo(g, tema, 'tema', 'tema') : null
  const pr = projeto ? exigirNo(g, projeto, 'projeto', 'projeto') : null
  const res = []
  for (const n of g.nos.values()) {
    if (n.tipo !== 'reuniao' || g.redir.has(n.id) || !dentro(n.data, per)) continue
    const como = []
    if (p) { if (liga(g, n.id, p, { fracas: false, rels: ['participantes'] })) como.push('participante'); else if (liga(g, n.id, p)) como.push('citado no corpo'); else continue }
    if (cl && !clientesDe(g, n.id).includes(cl)) continue
    if (t && !liga(g, n.id, t) && !liga(g, t, n.id)) continue
    if (pr && !liga(g, n.id, pr) && !liga(g, pr, n.id)) continue
    res.push({ n, como })
  }
  res.sort((a, b) => str(b.n.data).localeCompare(str(a.n.data)))
  const filtros = [p && `pessoa ${p}`, cl && `cliente ${cl}`, t && `tema ${t}`, pr && `projeto ${pr}`].filter(Boolean).join(' · ')
  if (!res.length) return `Nenhuma reunião${filtros ? ` com ${filtros}` : ''}${rotuloPeriodo(per)}.`
  const teto = lim(limite, 30)
  const L = [`${res.length} reunião(ões)${filtros ? ` · ${filtros}` : ''}${rotuloPeriodo(per)}`, '']
  for (const { n, como } of res.slice(0, teto)) {
    const part = [...new Set([...alvos(g, n.id, 'participantes', 'pessoa'), ...(alvos(g, n.id, 'participantes').length ? [] : alvos(g, n.id, 'menciona', 'pessoa'))])]
    const temas = [...alvos(g, n.id, 'temas'), ...entradas(g, n.id).filter((e) => g.nos.get(e.de)?.tipo === 'tema').map((e) => e.de)]
    const comps = [...alvos(g, n.id, 'compromissos'), ...entradas(g, n.id).filter((e) => e.rel === 'firmado_em').map((e) => e.de)]
    const decs = [...alvos(g, n.id, 'decisoes'), ...entradas(g, n.id).filter((e) => e.rel === 'tomada_em').map((e) => e.de)]
    L.push(`- ${n.data ?? '????-??-??'} ${lk(n.id)} ${n.titulo}${como.length ? ` (${como.join(', ')})` : ''}`)
    const cs = clientesDe(g, n.id)
    if (cs.length) L.push(`    cliente: ${cs.map(lk).join(', ')}`)
    if (part.length) L.push(`    pessoas${alvos(g, n.id, 'participantes').length ? '' : ' (citadas no corpo; sem `participantes`)'}: ${part.map(lk).join(', ')}`)
    if (temas.length) L.push(`    temas: ${[...new Set(temas)].map(lk).join(', ')}`)
    if (comps.length) L.push(`    compromissos: ${[...new Set(comps)].length} · decisões: ${[...new Set(decs)].length}`)
    else if (decs.length) L.push(`    decisões: ${[...new Set(decs)].length}`)
  }
  if (res.length > teto) L.push(`… +${res.length - teto}`)
  return L.join('\n')
}

// ── jarvis_compromissos ──────────────────────────────────────────────────────

function statusOk(st, filtro) {
  const s = st === null || st === undefined ? null : String(st).toLowerCase()
  if (!filtro || filtro === 'abertos') return ABERTOS.has(s)
  if (filtro === 'todos') return true
  return s === filtro
}

export async function compromissos(c, { status = 'abertos', pessoa, cliente, projeto, vencidos = false, prazo_ate, incluir_todo = true, limite, ref } = {}) {
  const { g } = c
  const dia = ref ?? hoje()
  const p = pessoa ? exigirNo(g, pessoa, 'pessoa', 'pessoa') : null
  const cl = cliente ? exigirNo(g, cliente, 'cliente', 'cliente') : null
  const pr = projeto ? exigirNo(g, projeto, 'projeto', 'projeto') : null
  const venc = (prazo, st) => /^\d{4}-\d{2}-\d{2}$/.test(str(prazo)) && str(prazo) < dia && ABERTOS.has(st === undefined ? null : st)
  const itens = []
  for (const n of g.nos.values()) {
    if (n.tipo !== 'compromisso' || g.redir.has(n.id)) continue
    const st = n.fm.status ?? null
    if (!statusOk(st, status)) continue
    const quem = alvos(g, n.id, 'assumido_por')
    if (p && !quem.includes(p)) continue
    if (cl && !clientesDe(g, n.id).includes(cl)) continue
    if (pr && !liga(g, n.id, pr)) continue
    const prazo = n.fm.prazo ?? null
    const v = venc(prazo, st === null ? null : String(st).toLowerCase())
    if (vencidos && !v) continue
    if (prazo_ate && !(/^\d{4}-\d{2}-\d{2}$/.test(str(prazo)) && str(prazo) <= prazo_ate)) continue
    itens.push({ n, quem, prazo, v, origem: alvos(g, n.id, 'firmado_em')[0] ?? null })
  }
  const ordem = (a, b) => (b.v - a.v) || str(a.prazo || '9999').localeCompare(str(b.prazo || '9999'))
  itens.sort(ordem)
  // TODO.md: tarefas do Mateus e itens "Aguardando" (quem: [[pessoa]])
  // linha cujo ctx aponta para um nó de Compromisso já listado acima não sai de novo (vira "· TODO.md:N" no nó)
  const listados = new Map(itens.map((x) => [x.n.id, x]))
  const canon = (id) => g.redir.get(id) ?? id
  const todo = []
  let omitidas = 0
  if (incluir_todo && status !== 'cancelado') {
    for (const t of c.todo) {
      const quer = status === 'concluido' ? t.feito : status === 'todos' ? true : !t.feito
      if (!quer) continue
      const dup = (t.ctx ?? []).map(canon).find((x) => listados.has(x))
      if (dup) { (listados.get(dup).todo ??= []).push(t.linha); omitidas++; continue }
      const quem = wikilinks(t.campos.quem ?? '').map((x) => x.para)
      if (p && !quem.includes(p) && !t.links.includes(p)) continue
      if (cl && !t.links.includes(cl)) continue
      if (pr && !t.links.includes(pr)) continue
      const prazo = t.campos.prazo ?? t.campos.cobrar ?? null
      const v = !t.feito && /^\d{4}-\d{2}-\d{2}$/.test(str(prazo)) && prazo < dia
      if (vencidos && !v) continue
      if (prazo_ate && !(/^\d{4}-\d{2}-\d{2}$/.test(str(prazo)) && prazo <= prazo_ate)) continue
      todo.push({ t, quem, prazo, v })
    }
    todo.sort((a, b) => (b.v - a.v) || str(a.prazo || '9999').localeCompare(str(b.prazo || '9999')))
  }
  const filtros = [`status ${status}`, p && `pessoa ${p}`, cl && `cliente ${cl}`, pr && `projeto ${pr}`, vencidos && 'só vencidos', prazo_ate && `prazo até ${prazo_ate}`].filter(Boolean).join(' · ')
  const teto = lim(limite, 40)
  const L = [`Compromissos (${filtros}) · hoje ${dia}`, '', `Nós Compromissos/: ${itens.length}${itens.filter((x) => x.v).length ? ` (${itens.filter((x) => x.v).length} vencidos)` : ''}`]
  for (const { n, quem, prazo, v, origem, todo: noTodo } of itens.slice(0, teto)) {
    L.push(`- ${v ? 'VENCIDO ' : ''}${lk(n.id)} ${n.fm.oque ?? n.titulo} · ${n.fm.status ?? 'sem status'} · prazo ${prazo ?? 'sem prazo'} · quem ${quem.length ? quem.map(lk).join(', ') : '?'}${origem ? ` · firmado em ${lk(origem)}` : ''}${n.evidencias.some((e) => e.valida) ? '' : ' · sem evidência literal'}${noTodo?.length ? ` · ${noTodo.map((x) => `TODO.md:${x}`).join(', ')}` : ''}`)
  }
  if (itens.length > teto) L.push(`… +${itens.length - teto}`)
  if (incluir_todo && status !== 'cancelado') {
    L.push('', `TODO.md: ${todo.length}${todo.filter((x) => x.v).length ? ` (${todo.filter((x) => x.v).length} vencidos)` : ''}${omitidas ? ` · ${omitidas} linha(s) omitida(s): ctx aponta para compromisso já listado` : ''}`)
    for (const { t, quem, prazo, v } of todo.slice(0, teto)) {
      L.push(`- ${v ? 'VENCIDO ' : ''}${t.feito ? '[x] ' : ''}${t.texto} · ${t.secao ?? ''} · ${quem.length ? `quem ${quem.map(lk).join(', ')}` : 'Mateus'}${prazo ? ` · ${t.campos.prazo ? 'prazo' : 'cobrar'} ${prazo}` : ''} · TODO.md:${t.linha}`)
    }
    if (todo.length > teto) L.push(`… +${todo.length - teto}`)
  }
  L.push('', 'Status é manual: "aberto" antigo é "aberto no registro", não fato confirmado.')
  return L.join('\n')
}

// ── jarvis_temas ─────────────────────────────────────────────────────────────

export async function temas(c, { cliente, status, recorrentes = false, limite } = {}) {
  const { g } = c
  const cl = cliente ? exigirNo(g, cliente, 'cliente', 'cliente') : null
  const res = []
  for (const n of g.nos.values()) {
    if (n.tipo !== 'tema' || g.redir.has(n.id)) continue
    if (status && str(n.fm.status).toLowerCase() !== String(status).toLowerCase()) continue
    if (cl && !clientesDe(g, n.id).includes(cl)) continue
    const ligados = [...new Set([...entradas(g, n.id).map((e) => e.de), ...saidas(g, n.id).map((e) => e.para)])]
    const reun = ligados.filter((x) => g.nos.get(x)?.tipo === 'reuniao')
    if (recorrentes && reun.length < 2) continue
    const datas = ligados.map((x) => g.nos.get(x)?.data).filter(Boolean).sort()
    res.push({ n, reun, ultima: datas.at(-1) ?? n.data, primeira: datas[0] ?? n.data,
      comp: ligados.filter((x) => g.nos.get(x)?.tipo === 'compromisso').length, dec: ligados.filter((x) => g.nos.get(x)?.tipo === 'decisao').length })
  }
  res.sort((a, b) => b.reun.length - a.reun.length || str(b.ultima).localeCompare(str(a.ultima)))
  if (!res.length) return `Nenhum tema${cl ? ` do cliente ${cl}` : ''}${status ? ` com status ${status}` : ''}${recorrentes ? ' recorrente (≥ 2 reuniões)' : ''}. Temas/ ${[...g.nos.values()].some((n) => n.tipo === 'tema') ? 'tem notas' : 'ainda está vazio'}.`
  const teto = lim(limite, 40)
  const L = [`${res.length} tema(s)${cl ? ` · cliente ${cl}` : ''}${status ? ` · status ${status}` : ''}`, '']
  for (const x of res.slice(0, teto)) {
    L.push(`- ${lk(x.n.id)} ${x.n.titulo} · ${x.n.fm.status ?? 'sem status'} · ${x.reun.length} reunião(ões) · ${x.comp} compromisso(s) · ${x.dec} decisão(ões) · ${x.primeira ?? '?'} → ${x.ultima ?? '?'}${clientesDe(g, x.n.id).length ? ` · ${clientesDe(g, x.n.id).map(lk).join(', ')}` : ''}`)
  }
  if (res.length > teto) L.push(`… +${res.length - teto}`)
  return L.join('\n')
}

// ── jarvis_decisoes ──────────────────────────────────────────────────────────

export async function decisoes(c, { cliente, projeto, tema, status, periodo, desde, ate, limite } = {}) {
  const { g } = c
  const per = intervalo({ periodo, desde, ate })
  const cl = cliente ? exigirNo(g, cliente, 'cliente', 'cliente') : null
  const pr = projeto ? exigirNo(g, projeto, 'projeto', 'projeto') : null
  const t = tema ? exigirNo(g, tema, 'tema', 'tema') : null
  const res = []
  for (const n of g.nos.values()) {
    if (n.tipo !== 'decisao' || g.redir.has(n.id) || !dentro(n.data, per)) continue
    if (status && str(n.fm.status).toLowerCase() !== String(status).toLowerCase()) continue
    if (cl && !clientesDe(g, n.id).includes(cl)) continue
    if (pr && !liga(g, n.id, pr)) continue
    if (t && !liga(g, n.id, t)) continue
    res.push(n)
  }
  res.sort((a, b) => str(b.data).localeCompare(str(a.data)))
  if (!res.length) return `Nenhuma decisão${[cl, pr, t].filter(Boolean).length ? ` (${[cl, pr, t].filter(Boolean).join(', ')})` : ''}${rotuloPeriodo(per)}.`
  const teto = lim(limite, 40)
  const L = [`${res.length} decisão(ões)${rotuloPeriodo(per)}`, '']
  for (const n of res.slice(0, teto)) {
    const onde = alvos(g, n.id, 'tomada_em')[0] ?? entradas(g, n.id).find((e) => e.rel === 'decisoes')?.de ?? null
    const por = alvos(g, n.id, 'decidido_por')
    const ev = n.evidencias.find((e) => e.valida)
    L.push(`- ${n.data ?? '????-??-??'} ${lk(n.id)} ${n.fm.oque ?? n.titulo} · ${n.fm.status ?? 'vigente?'}${onde ? ` · tomada em ${lk(onde)}` : ''}${por.length ? ` · por ${por.map(lk).join(', ')}` : ''}`)
    L.push(ev ? `    evidência: "${ev.cit}" · fonte: ${ev.ponteiro}` : '    sem evidência literal')
  }
  if (res.length > teto) L.push(`… +${res.length - teto}`)
  return L.join('\n')
}

// ── jarvis_timeline ──────────────────────────────────────────────────────────

export async function timeline(c, { id, periodo, desde, ate, tipos, limite } = {}) {
  const { g } = c
  const per = intervalo({ periodo, desde, ate })
  // sem filtro: pessoa, cliente e TODO ficam de fora (a data deles é só a criação da nota, não um evento)
  const filtroTipos = new Set(tipos ? String(tipos).split(',').map((x) => x.trim()).filter(Boolean) : TIPOS.filter((t) => !['pessoa', 'cliente'].includes(t)))
  let base
  let cab
  if (id) {
    const nid = exigirNo(g, id)
    const lig = new Map()
    // relação por propriedade vale mais que menção no corpo
    const pos = (x, r) => { const a = lig.get(x); if (!a || (a.includes('menciona') && !r.includes('menciona'))) lig.set(x, r) }
    for (const e of saidas(g, nid)) pos(e.para, `→${e.rel}`)
    for (const e of entradas(g, nid)) pos(e.de, `←${e.rel}`)
    base = [[nid, 'o próprio nó'], ...lig]
    cab = `Linha do tempo de ${lk(nid)}`
  } else {
    if (!per.desde && !per.ate) throw new Error('sem id, informe periodo ou desde/ate')
    base = [...g.nos.keys()].map((x) => [x, ''])
    cab = 'Linha do tempo do vault'
  }
  const res = base.map(([x, rel]) => ({ n: g.nos.get(x), rel }))
    .filter(({ n, rel }) => n && n.data && !g.redir.has(n.id) && dentro(n.data, per) && (rel === 'o próprio nó' || filtroTipos.has(n.tipo)))
  res.sort((a, b) => a.n.data.localeCompare(b.n.data) || a.n.tipo.localeCompare(b.n.tipo))
  if (!res.length) return `${cab}: nada datado${rotuloPeriodo(per)}.`
  const teto = lim(limite, 80)
  const corte = res.slice(-teto)
  const L = [`${cab}${rotuloPeriodo(per)}: ${res.length} evento(s)${res.length > teto ? ` (mostrando os ${teto} mais recentes)` : ''}`, '']
  let dia = null
  for (const { n, rel } of corte) {
    if (n.data !== dia) { dia = n.data; L.push(`${dia}`) }
    L.push(`  - ${n.tipo} ${lk(n.id)} ${rotulo(n)}${rel ? ` (${rel})` : ''}`)
  }
  return L.join('\n')
}

// ── jarvis_ler ───────────────────────────────────────────────────────────────

export async function ler(c, { id, caminho, linha, janela } = {}) {
  const { g } = c
  let arq
  if (caminho) {
    arq = String(caminho).replace(/\\/g, '/').replace(/^\.?\//, '')
    if (!g.arquivosTxt.has(arq)) throw new Error(`arquivo fora do vault lido pelo harness (ou inexistente): ${arq}`)
  } else arq = g.nos.get(exigirNo(g, id)).arquivo
  const linhas = g.arquivosTxt.get(arq).split(/\r?\n/)
  const j = lim(janela, 40, 400)
  let a = 0, b = Math.min(linhas.length, 400)
  if (linha) { a = Math.max(0, Number(linha) - 1 - j); b = Math.min(linhas.length, Number(linha) + j) }
  const L = [`${arq} · linhas ${a + 1}–${b} de ${linhas.length}`, '']
  for (let i = a; i < b; i++) L.push(`${String(i + 1).padStart(4)}  ${linhas[i]}`)
  return L.join('\n')
}

// ── jarvis_evidencias ────────────────────────────────────────────────────────

// Bruto de uma evidência (D1): caminho canônico System/Archive/raw/AAAA-MM/<fonte>/<item>/turnos.txt; antes do
// arquivamento, Inbox/_raw/<fonte>/<item>/turnos.txt. Um aponta para o outro se o arquivo já mudou de lugar.
// Ponteiro legado "meetrox:<id> turno:tNNNN" (sem caminho) é procurado nos dois lugares.
// Bruto de /aprender: System/Archive/raw/AAAA-MM/aprender/<slug>/ (canônico) ou System/Archive/raw/aprender/<slug>/
// (sem mês, formato antigo do prompt). O ponteiro pode ser um arquivo da pasta ou a própria pasta (aí a citação é
// procurada em todos os arquivos de texto dela).
async function existe(p) { try { return (await fs.stat(p)).isFile() } catch { return false } }
async function existeDir(p) { try { return (await fs.stat(p)).isDirectory() } catch { return false } }
async function existeBruto(p, pasta) { return (await existe(p)) || (pasta && (await existeDir(p))) }
const MES = /^\d{4}-\d{2}$/
async function noArquivoRaw(root, resto, { pasta = false } = {}) {
  const base = path.join(root, 'System', 'Archive', 'raw')
  let meses = []
  try { meses = (await fs.readdir(base, { withFileTypes: true })).filter((d) => d.isDirectory() && MES.test(d.name)).map((d) => d.name).sort().reverse() } catch {}
  for (const m of meses) { const p = path.join(base, m, resto); if (await existeBruto(p, pasta)) return p }
  return null
}
const TEXTO_BRUTO = /\.(txt|md|json|csv|html?|vtt|srt)$/i
async function lerBruto(abs) {
  if (!(await existeDir(abs))) return fs.readFile(abs, 'utf8')
  const partes = []
  const andar = async (d) => {
    for (const e of (await fs.readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) await andar(p)
      else if (TEXTO_BRUTO.test(e.name)) partes.push(await fs.readFile(p, 'utf8'))
    }
  }
  await andar(abs)
  if (!partes.length) throw new Error('pasta sem texto')
  return partes.join('\n')
}
async function localizarBruto(root, e) {
  const raiz = path.resolve(root)
  const dentroDoVault = (abs) => abs === raiz || abs.startsWith(raiz + path.sep)
  const caminho = e.ponteiro.split(/\s+·\s+|#/)[0].trim().replace(/^`|`$/g, '')
  const externo = /^[a-z_-]+:/i.test(caminho) && !/^[a-z]:[\\/]/i.test(caminho)
  if (!externo) {
    const abs = path.resolve(raiz, caminho)
    if (!dentroDoVault(abs) || caminho.split(/[\\/]/).includes('..')) return { erro: 'ponteiro fora do vault' }
    const rel = caminho.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '')
    // pasta só vale como ponteiro para bruto de /aprender (texto extraído do curso)
    const aprender = /^System\/Archive\/raw\/(?:\d{4}-\d{2}\/)?aprender\/[^/]+(?:\/|$)/.test(rel)
    if (await existeBruto(abs, aprender)) return { abs }
    let alt = null
    if (aprender) {
      const resto = rel.replace(/^System\/Archive\/raw\/(?:\d{4}-\d{2}\/)?/, '')
      alt = await noArquivoRaw(raiz, resto, { pasta: true })
      if (!alt) { const p = path.join(raiz, 'System', 'Archive', 'raw', resto); if (await existeBruto(p, true)) alt = p }
    } else if (rel.startsWith('Inbox/_raw/')) alt = await noArquivoRaw(raiz, rel.slice('Inbox/_raw/'.length))
    else if (/^System\/Archive\/raw\/[^/]+\//.test(rel)) { const p = path.join(raiz, 'Inbox', '_raw', rel.replace(/^System\/Archive\/raw\/[^/]+\//, '')); if (await existe(p)) alt = p }
    return alt ? { abs: alt } : { erro: 'bruto ausente nesta máquina' }
  }
  const sis = e.sistema ?? caminho.split(':')[0].toLowerCase()
  const item = e.item ?? caminho.split(':')[1]
  const pastas = sis === 'teams' ? ['teams', 'teams_transcricoes'] : [sis]
  if (!['meetrox', 'teams', 'teams_transcricoes'].includes(sis) || !item) return { erro: `ponteiro externo (${sis}), não conferível aqui` }
  if (!/^[A-Za-z0-9_-][\w.-]*$/.test(item)) return { erro: 'ponteiro fora do vault' }
  for (const f of pastas) {
    const p = path.join(raiz, 'Inbox', '_raw', f, item, 'turnos.txt')
    if (await existe(p)) return { abs: p }
    const a = await noArquivoRaw(raiz, path.join(f, item, 'turnos.txt'))
    if (a) return { abs: a }
  }
  return { erro: 'bruto ausente nesta máquina' }
}
// confere se cada citação existe literalmente (sem caixa/acento; "…" separa recortes) no bruto apontado;
// com âncora tNNNN, confere no turno (e em até 2 seguintes do mesmo falante, para fala quebrada pelo ASR)
async function conferir(root, e) {
  if (!e.valida) return 'sem ponteiro'
  const loc = await localizarBruto(root, e)
  if (loc.erro) return loc.erro
  let txt
  try { txt = await lerBruto(loc.abs) } catch { return 'bruto ausente nesta máquina' }
  const plano = (s) => dobrar(s).replace(/\s+/g, ' ')
  const pedacos = dobrar(e.cit).split(/…|\.\.\./).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 3)
  if (!pedacos.length) return 'NÃO ENCONTRADA no bruto'
  const tem = (alvo) => pedacos.every((p) => alvo.includes(p))
  if (!tem(plano(txt))) return 'NÃO ENCONTRADA no bruto'
  if (e.ancora && /^t\d+$/i.test(e.ancora)) {
    const linhas = txt.split(/\r?\n/)
    const i = linhas.findIndex((l) => new RegExp(`^${e.ancora}\\b`, 'i').test(l.trim()))
    if (i < 0) return `OK literal, mas o turno ${e.ancora} não existe no bruto`
    const falante = (l) => l?.trim().match(/^t\d+\s+(?:\d{1,2}:\d{2}(?::\d{2})?\s+)?([^:]+):/i)?.[1].trim() ?? null
    const quem = falante(linhas[i])
    let j = i + 1
    while (j < i + 3 && j < linhas.length && quem && falante(linhas[j]) === quem) j++
    if (!tem(plano(linhas.slice(i, j).join(' ')))) return `OK literal, mas fora do turno ${e.ancora}`
  } else if (e.ancora && /(^|[\\/])mensagens\.txt$/i.test(loc.abs)) {
    // e-mail/chat: cada mensagem começa com "[<messageId>]" no início da linha e vai até o próximo cabeçalho
    const bloco = mensagemDoBruto(txt, e.ancora)
    if (bloco == null) return `OK literal, mas a mensagem ${e.ancora} não existe no bruto`
    if (!tem(plano(bloco))) return `OK literal, mas fora da mensagem ${e.ancora}`
  }
  return 'OK literal'
}
// "[<id>]" no início da linha abre uma mensagem ("[texto](url)" de link markdown não conta)
const CAB_MSG = /^\s*\[([^\]\s]+)\](?!\()/
export function mensagemDoBruto(txt, id) {
  const linhas = String(txt).split(/\r?\n/)
  const i = linhas.findIndex((l) => l.match(CAB_MSG)?.[1] === id)
  if (i < 0) return null
  let j = i + 1
  while (j < linhas.length && !CAB_MSG.test(linhas[j])) j++
  return linhas.slice(i, j).join('\n').replace(CAB_MSG, '')
}
// exportado para teste: confere uma evidência já extraída por evidencias()
export const conferirEvidencia = (root, e) => conferir(root, e)

export async function evidenciasNo(c, { id, tipo, conferir: conf = true, limite } = {}) {
  const { g } = c
  const alvosN = id ? [g.nos.get(exigirNo(g, id))] : [...g.nos.values()].filter((n) => (!tipo || n.tipo === tipo) && n.evidencias.length)
  const teto = lim(limite, 60)
  const L = [`Evidências${id ? ` de ${lk(alvosN[0].id)}` : tipo ? ` (tipo ${tipo})` : ''}`, '']
  let n = 0
  const cont = new Map()
  for (const no_ of alvosN) {
    if (!no_.evidencias.length) { if (id) L.push('- nenhuma (afirmações desta nota não têm citação literal)'); continue }
    L.push(`${lk(no_.id)} (${no_.tipo})`)
    for (const e of no_.evidencias) {
      if (n++ >= teto) break
      const r = conf ? await conferir(g.root, e) : 'não conferida'
      cont.set(r, (cont.get(r) ?? 0) + 1)
      L.push(e.valida ? `  - [${r}] "${e.cit}"${e.autor ? ` — ${e.autor}` : ''} · fonte: ${e.ponteiro} (${no_.arquivo}:${e.linha})` : `  - [sem citação/ponteiro] ${e.resto ?? e.cit} (${no_.arquivo}:${e.linha})`)
    }
  }
  if (!id && !alvosN.length) L.push('- nenhuma evidência literal registrada no vault (seções "## Evidências")')
  if (cont.size) L.push('', `Resumo: ${[...cont].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  L.push('Regra: sem citação literal, sem evidência.')
  return L.join('\n')
}
