// Escrita estreita no vault para o painel do dia (servidor MCP "jarvis-escrita").
// Só estas operações existem: Check-in e Anotações do Daily, tarefas do TODO.md, captura no Inbox/manual
// e o log.md. Nada é apagado (regra 1 do CLAUDE.md): concluir move a linha para "Concluídas".
// Funções puras sobre texto (testáveis) + `executar`, que faz o IO.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ROOT, hoje, addDias, parseNote, wikilinks, carregarGrafo, toList, chaveDeLink } from './vault.mjs'
import { parseTodo } from './consultas.mjs'

// ── Tempo (America/Sao_Paulo, sem horário de verão) ──────────────────────────
export function agora(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`
}
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
export function diaSemana(iso) { return DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()] }
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// ── TODO.md ──────────────────────────────────────────────────────────────────
// id de uma tarefa = hash curto da linha crua (sem o "- [ ] "): se a linha mudou, o id some e a escrita recusa.
export function idLinha(raw) { return createHash('sha1').update(String(raw).replace(/^\s*-\s+\[( |x|X)\]\s+/, '').trim()).digest('hex').slice(0, 10) }
export function versao(txt) { return createHash('sha1').update(String(txt).replace(/\r\n/g, '\n')).digest('hex').slice(0, 12) }

export const QUADRANTES = { P1: /^P1\b/i, P2: /^P2\b/i, P3: /^P3\b/i, P4: /^P4\b/i, AG: /^Aguardando/i, OK: /^Conclu/i }
export function quadranteDe(secao) { for (const [q, re] of Object.entries(QUADRANTES)) if (re.test(String(secao ?? '').trim())) return q; return null }

export function lerTodo(txt) {
  const linhas = String(txt).split(/\r?\n/)
  return parseTodo(txt).map((t) => ({ ...t, id: idLinha(linhas[t.linha - 1]), quadrante: quadranteDe(t.secao), raw: linhas[t.linha - 1] }))
}

function limpar(s) { return String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+\|\s+/g, ' / ').trim() }
function eol(txt) { return /\r\n/.test(txt) ? '\r\n' : '\n' }

// índice da última linha do bloco de uma seção (para inserir no fim dela)
function fimDaSecao(linhas, q) {
  const ini = linhas.findIndex((l) => { const h = l.match(/^##\s+(.+)$/); return h && quadranteDe(h[1]) === q })
  if (ini < 0) return -1
  let fim = ini
  for (let i = ini + 1; i < linhas.length && !/^##\s/.test(linhas[i]); i++) if (linhas[i].trim()) fim = i
  return fim
}
const ORDEM = ['P1', 'P2', 'P3', 'P4', 'AG', 'OK']
const TITULOS = { P1: 'P1 Fazer agora (urgente + importante)', P2: 'P2 Agendar (importante)', P3: 'P3 Delegar / rápido (urgente, pouco importante)', P4: 'P4 Talvez', AG: 'Aguardando (dependo de alguém)', OK: 'Concluídas (últimos 7 dias)' }
function inserirNaSecao(txt, q, linha) {
  const nl = eol(txt)
  const L = String(txt).split(/\r?\n/)
  const fim = fimDaSecao(L, q)
  if (fim >= 0) { L.splice(fim + 1, 0, linha); return L.join(nl) }
  // seção ausente: cria antes da próxima seção conhecida (ou no fim)
  const depois = ORDEM.slice(ORDEM.indexOf(q) + 1)
  let at = L.findIndex((l) => { const h = l.match(/^##\s+(.+)$/); return h && depois.includes(quadranteDe(h[1])) })
  if (at < 0) { while (L.length && !L.at(-1).trim()) L.pop(); L.push(''); at = L.length }
  L.splice(at, 0, `## ${TITULOS[q]}`, linha, '')
  return L.join(nl)
}
function acharLinha(txt, id) {
  const L = String(txt).split(/\r?\n/)
  const i = L.findIndex((l) => /^\s*-\s+\[( |x|X)\]\s+/.test(l) && idLinha(l) === id)
  if (i < 0) throw new Error('tarefa não encontrada: o TODO mudou desde a leitura. Recarregue o painel.')
  return { L, i }
}
function setCampo(raw, k, v) {
  const partes = raw.split(/\s+\|\s+/)
  const j = partes.findIndex((p, n) => n > 0 && new RegExp(`^${k}:`, 'i').test(p.trim()))
  if (v === null || v === undefined || v === '') { if (j > 0) partes.splice(j, 1) }
  else if (j > 0) partes[j] = `${k}: ${v}`
  else partes.push(`${k}: ${v}`)
  return partes.join(' | ')
}

export function todoCriar(txt, { texto, quadrante = 'P2', prazo, ctx, quem, cobrar, data = hoje() }) {
  const t = limpar(texto)
  if (t.length < 3) throw new Error('texto da tarefa vazio')
  if (!QUADRANTES[quadrante] || quadrante === 'OK') throw new Error(`quadrante inválido: ${quadrante}`)
  if (prazo && !DATA_RE.test(prazo)) throw new Error('prazo deve ser AAAA-MM-DD')
  let linha = `- [ ] ${t}`
  if (quadrante === 'AG' && quem) linha += ` | quem: ${limpar(quem)} | desde: ${data}` + (cobrar ? ` | cobrar: ${cobrar}` : '')
  if (prazo) linha += ` | prazo: ${prazo}`
  if (ctx) linha += ` | ctx: [[${limpar(ctx).replace(/^\[\[|\]\]$/g, '')}]]`
  linha += ` | fonte: manual | criado: ${data}`
  return { txt: inserirNaSecao(txt, quadrante, linha), id: idLinha(linha) }
}

export function todoConcluir(txt, id, data = hoje()) {
  const { L, i } = acharLinha(txt, id)
  let raw = L[i].replace(/^(\s*-\s+)\[ \]/, '$1[x]')
  raw = setCampo(raw, 'feito', data)
  L.splice(i, 1)
  return { txt: inserirNaSecao(L.join(eol(txt)), 'OK', raw), id: idLinha(raw) }
}

export function todoReabrir(txt, id, quadrante = 'P2') {
  const { L, i } = acharLinha(txt, id)
  let raw = L[i].replace(/^(\s*-\s+)\[(x|X)\]/, '$1[ ]')
  raw = setCampo(raw, 'feito', null)
  L.splice(i, 1)
  return { txt: inserirNaSecao(L.join(eol(txt)), quadrante, raw), id: idLinha(raw) }
}

export function todoMover(txt, id, quadrante) {
  if (!QUADRANTES[quadrante] || quadrante === 'OK') throw new Error(`quadrante inválido: ${quadrante}`)
  const { L, i } = acharLinha(txt, id)
  const raw = L[i]
  L.splice(i, 1)
  return { txt: inserirNaSecao(L.join(eol(txt)), quadrante, raw), id: idLinha(raw) }
}

export function todoEditar(txt, id, { texto, prazo, ctx } = {}) {
  const { L, i } = acharLinha(txt, id)
  const m = L[i].match(/^(\s*-\s+\[( |x|X)\]\s+)(.*)$/)
  const partes = m[3].split(/\s+\|\s+/)
  if (texto !== undefined) { const t = limpar(texto); if (t.length < 3) throw new Error('texto da tarefa vazio'); partes[0] = t }
  let corpo = partes.join(' | ')
  if (prazo !== undefined) { if (prazo && !DATA_RE.test(prazo)) throw new Error('prazo deve ser AAAA-MM-DD'); corpo = setCampo(corpo, 'prazo', prazo || null) }
  if (ctx !== undefined) corpo = setCampo(corpo, 'ctx', ctx ? `[[${limpar(ctx).replace(/^\[\[|\]\]$/g, '')}]]` : null)
  L[i] = m[1] + corpo
  return { txt: L.join(eol(txt)), id: idLinha(L[i]) }
}

// ── Daily ────────────────────────────────────────────────────────────────────
export function novoDaily(template, data, ts = agora()) {
  return String(template).replace(/\{\{agora\}\}/g, ts).replace(/^# AAAA-MM-DD — <dia da semana>$/m, `# ${data} — ${diaSemana(data)}`)
}

// substitui o corpo de "## <nome>" (até o próximo "## " ou a linha "Índice:")
export function trocarSecao(txt, nome, corpo) {
  const nl = eol(txt)
  const L = String(txt).split(/\r?\n/)
  const ini = L.findIndex((l) => l.trim() === `## ${nome}`)
  if (ini < 0) throw new Error(`seção "## ${nome}" não existe no Daily`)
  let fim = ini + 1
  while (fim < L.length && !/^##\s/.test(L[fim]) && !/^Índice:/.test(L[fim])) fim++
  L.splice(ini + 1, fim - ini - 1, ...String(corpo).trim().split(/\r?\n/), '')
  return L.join(nl)
}
export function lerSecao(txt, nome) {
  const L = String(txt).split(/\r?\n/)
  const ini = L.findIndex((l) => l.trim() === `## ${nome}`)
  if (ini < 0) return null
  const out = []
  for (let i = ini + 1; i < L.length && !/^##\s/.test(L[i]) && !/^Índice:/.test(L[i]); i++) out.push(L[i])
  return out.join('\n').trim()
}
export function anotar(txt, texto, hora) {
  const atual = lerSecao(txt, 'Anotações do dia') ?? ''
  const base = /^\(livre para o Mateus\)$/.test(atual.trim()) ? '' : atual
  const linha = `- ${hora} ${limpar(texto)}`
  return trocarSecao(txt, 'Anotações do dia', base ? `${base}\n${linha}` : linha)
}
export function tocarUpdated(txt, ts = agora()) { return String(txt).replace(/^updated:.*$/m, `updated: ${ts}`) }

export function blocoCheckin(c, hora) {
  const exp = c.expediente ?? {}
  const linhas = [
    `**Status**: ${c.status === 'confirmado' ? `confirmado ${hora} (pelo painel)` : `a confirmar (painel ${hora})`}`,
    `**Expediente**: ${exp.inicio ?? '09:00'}–${exp.fim ?? '16:00'}${exp.padrao === false ? ` (até ${exp.fim} hoje)` : ' (padrão)'}`,
    `**Intenção**: ${limpar(c.intencao) || '—'}`,
    '**Top 3**',
    ...toList(c.top3).slice(0, 3).map((t, i) => `${i + 1}. ${limpar(t.texto)}${t.ctx ? ` — [[${String(t.ctx).replace(/^\[\[|\]\]$/g, '')}]]` : ''}${t.trecho ? ` · TODO: "${limpar(t.trecho)}"` : ''}${t.bloco ? ` · bloco ${t.bloco}` : ''}`),
    `**Blocos**: ${toList(c.blocos).map((b) => `${b.inicio}–${b.fim} ${limpar(b.rotulo)}`).join(' · ') || '—'}`,
    `**Riscos**: ${toList(c.riscos).map(limpar).join(' · ') || '—'}`,
    `**Fica para depois**: ${toList(c.ficaParaDepois).map(limpar).join(' · ') || '—'}`,
  ]
  if (c.obs) linhas.push(`**Obs do Mateus**: ${limpar(c.obs)}`)
  return linhas.join('\n')
}

// ── IO ───────────────────────────────────────────────────────────────────────
async function lerOu(p, padrao = null) { try { return await fs.readFile(p, 'utf8') } catch { return padrao } }

async function registrar(root, titulo, bullets, ts) {
  const p = path.join(root, 'log.md')
  const atual = await lerOu(p, '')
  const bloco = `\n## [${ts.slice(0, 10)} ${ts.slice(11, 16)}] painel | ${titulo}\n${bullets.map((b) => `- ${b}`).join('\n')}\n`
  await fs.writeFile(p, atual.replace(/\s*$/, '\n') + bloco, 'utf8')
}

async function abrirDaily(root, data, ts) {
  const p = path.join(root, 'Daily', `${data}.md`)
  let txt = await lerOu(p)
  let criado = false
  if (txt === null) {
    const tpl = await lerOu(path.join(root, 'System', 'templates', 'daily.md'))
    if (!tpl) throw new Error('System/templates/daily.md não encontrado')
    txt = novoDaily(tpl, data, ts)
    criado = true
  }
  return { p, txt, criado }
}

// Entrada do painel: o que está no Inbox esperando o ingest (só o título e um resumo curto; brutos ficam fora)
const FONTES_INBOX = ['manual', 'outlook', 'teams', 'clickup', 'jira', 'claude-code']
async function lerEntrada(root) {
  const out = []
  for (const fonte of FONTES_INBOX) {
    let nomes = []
    try { nomes = (await fs.readdir(path.join(root, 'Inbox', fonte))).filter((f) => f.endsWith('.md')) } catch { continue }
    for (const f of nomes) {
      const p = path.join(root, 'Inbox', fonte, f)
      const { fm, body } = parseNote(await fs.readFile(p, 'utf8'))
      const st = await fs.stat(p)
      const linhas = String(body).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const h1 = linhas.find((l) => /^#\s/.test(l))
      const titulo = String(fm.titulo ?? fm.assunto ?? (h1 ? h1.replace(/^#\s+/, '') : linhas[0] ?? f)).slice(0, 140)
      const resumo = linhas.filter((l) => !/^#/.test(l) && l !== titulo).slice(0, 3).join(' ').slice(0, 280)
      const em = String(fm.captured_at ?? st.mtime.toISOString()).slice(0, 16).replace('T', ' ')
      out.push({ id: `${fonte}/${f}`, fonte, arquivo: `Inbox/${fonte}/${f}`, em, titulo, resumo })
    }
  }
  return out.sort((a, b) => b.em.localeCompare(a.em)).slice(0, 40)
}

async function painel(root, { data = hoje() } = {}) {
  const todoTxt = await lerOu(path.join(root, 'TODO.md'), '')
  const todo = lerTodo(todoTxt).map(({ raw, links, marcas, ...t }) => ({ ...t, ctx: t.ctx[0] ?? null }))
  const daily = await lerOu(path.join(root, 'Daily', `${data}.md`))
  const g = await carregarGrafo(root)
  const ate = addDias(data, 7)
  const nos = [...g.nos.values()]
  const lk = (v) => toList(v).map((x) => { const w = wikilinks(String(x)); return w.length ? w[0].para : chaveDeLink(String(x)) })
  const compromissos = nos.filter((n) => n.tipo === 'compromisso' && /^(aberto|em_andamento|aguardando)$/.test(String(n.fm.status ?? 'aberto')))
    .map((n) => ({ id: n.id, oque: n.fm.oque ?? n.titulo ?? n.id, status: n.fm.status ?? 'aberto', prazo: n.fm.prazo ?? null, assumido_por: lk(n.fm.assumido_por)[0] ?? null, cliente: lk(n.fm.cliente)[0] ?? null }))
  const dia = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null)
  const projetos = nos.filter((n) => n.tipo === 'projeto' && String(n.fm.status ?? 'ativo') !== 'concluido')
    .map((n) => ({ id: n.id, titulo: n.titulo ?? n.id, status: n.fm.status ?? null, prazo: n.fm.prazo ?? null, temas: lk(n.fm.temas),
      cliente: lk(n.fm.cliente)[0] ?? null, inicio: dia(n.fm.inicio ?? n.fm.created) }))
  const clientes = Object.fromEntries(nos.filter((n) => n.tipo === 'cliente').map((n) => [n.id, n.titulo ?? n.id]))
  // Páginas (só leitura no painel): dailies da última semana, decisões e notas mais recentes, corpo cortado
  const pag = (n, tipo) => ({ id: n.id, tipo, titulo: n.titulo ?? n.id, data: n.data ?? dia(n.fm.created), corpo: String(n.corpo ?? '').trim().slice(0, 4000),
    links: [...new Set([...lk(n.fm.projeto), ...lk(n.fm.cliente), ...lk(n.fm.tomada_em), ...lk(n.fm.relacionados)])] })
  const recentes = (tipo, k) => nos.filter((n) => n.tipo === tipo).sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? ''))).slice(0, k)
  const paginas = [...recentes('daily', 7).filter((n) => n.id >= addDias(data, -7)).map((n) => pag(n, 'daily')),
    ...recentes('decisao', 12).map((n) => pag(n, 'decisao')), ...recentes('nota', 12).map((n) => pag(n, 'nota'))]
  const entrada = await lerEntrada(root)
  const logTxt = await lerOu(path.join(root, 'log.md'), '')
  const log = [...logTxt.matchAll(/^## \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] ([^|\n]+?)\s*\|\s*(.+)$/gm)].slice(-40).reverse()
    .map((m) => ({ em: m[1], tipo: m[2].trim(), txt: m[3].trim() }))
  const reunioes = nos.filter((n) => n.tipo === 'reuniao' && n.data && n.data >= addDias(data, -1) && n.data <= ate)
    .map((n) => ({ id: n.id, titulo: n.titulo ?? n.id, data: n.data, participantes: lk(n.fm.participantes), cliente: lk(n.fm.cliente)[0] ?? null, futura: toList(n.fm.tags).includes('futura') }))
    .sort((a, b) => a.data.localeCompare(b.data))
  const pessoas = Object.fromEntries(nos.filter((n) => n.tipo === 'pessoa').map((n) => [n.id, n.titulo ?? n.id]))
  return {
    hoje: data, diaSemana: diaSemana(data), geradoEm: agora(), versao: versao(todoTxt),
    todo, compromissos, projetos, reunioes, pessoas, clientes, paginas, entrada, log,
    daily: daily === null ? { existe: false } : { existe: true, briefing: lerSecao(daily, 'Briefing'), checkin: lerSecao(daily, 'Check-in'), anotacoes: lerSecao(daily, 'Anotações do dia') },
  }
}

async function escreverTodo(root, args, fn, titulo) {
  const p = path.join(root, 'TODO.md')
  const txt = await lerOu(p)
  if (txt === null) throw new Error('TODO.md não encontrado')
  if (args.versao && args.versao !== versao(txt)) {
    // versão diferente não bloqueia: o id da linha já garante que a tarefa certa é tocada
  }
  const ts = agora()
  const r = fn(txt, ts.slice(0, 10))
  await fs.writeFile(p, tocarUpdated(r.txt, ts), 'utf8')
  await registrar(root, titulo, [r.resumo ?? titulo], ts)
  return { ok: true, id: r.id, versao: versao(tocarUpdated(r.txt, ts)) }
}

export const OPERACOES = {
  jarvis_painel: { leitura: true, fn: (root, a) => painel(root, a) },

  jarvis_checkin_gravar: { fn: async (root, c) => {
    const data = c.data ?? hoje()
    if (!DATA_RE.test(data)) throw new Error('data deve ser AAAA-MM-DD')
    const ts = agora()
    const { p, txt, criado } = await abrirDaily(root, data, ts)
    const out = tocarUpdated(trocarSecao(txt, 'Check-in', blocoCheckin(c, ts.slice(11, 16))), ts)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, out, 'utf8')
    await registrar(root, `Check-in ${data}${c.status === 'confirmado' ? ' (confirmado)' : ''}`, [...toList(c.top3).slice(0, 3).map((t) => limpar(t.texto)), criado ? `Daily/${data}.md criado pelo painel` : null].filter(Boolean), ts)
    return { ok: true, daily: `Daily/${data}.md`, criado }
  } },

  jarvis_anotar: { fn: async (root, { texto, data = hoje() }) => {
    if (!limpar(texto)) throw new Error('anotação vazia')
    const ts = agora()
    const { p, txt, criado } = await abrirDaily(root, data, ts)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, tocarUpdated(anotar(txt, texto, ts.slice(11, 16)), ts), 'utf8')
    await registrar(root, 'anotação do dia', [limpar(texto).slice(0, 120)], ts)
    return { ok: true, daily: `Daily/${data}.md`, criado }
  } },

  jarvis_tarefa: { fn: async (root, a) => {
    const acao = a.acao
    if (acao === 'criar') return escreverTodo(root, a, (t, d) => ({ ...todoCriar(t, { ...a, data: d }), resumo: `criada (${a.quadrante ?? 'P2'}): ${limpar(a.texto)}` }), 'tarefa criada')
    if (!a.id) throw new Error('id da tarefa obrigatório')
    if (acao === 'concluir') return escreverTodo(root, a, (t, d) => ({ ...todoConcluir(t, a.id, d), resumo: `concluída: ${a.id}` }), 'tarefa concluída')
    if (acao === 'reabrir') return escreverTodo(root, a, (t) => ({ ...todoReabrir(t, a.id, a.quadrante ?? 'P2'), resumo: `reaberta: ${a.id}` }), 'tarefa reaberta')
    if (acao === 'mover') return escreverTodo(root, a, (t) => ({ ...todoMover(t, a.id, a.quadrante), resumo: `movida para ${a.quadrante}: ${a.id}` }), 'tarefa repriorizada')
    if (acao === 'editar') return escreverTodo(root, a, (t) => ({ ...todoEditar(t, a.id, a), resumo: `editada: ${a.id}` }), 'tarefa editada')
    throw new Error(`ação desconhecida: ${acao}`)
  } },

  jarvis_capturar: { fn: async (root, { texto }) => {
    const t = String(texto ?? '').trim()
    if (!t) throw new Error('captura vazia')
    const ts = agora()
    const nome = `${ts.slice(0, 10)}_${ts.slice(11, 13)}${ts.slice(14, 16)}${ts.slice(17, 19)}-painel.md`
    const p = path.join(root, 'Inbox', 'manual', nome)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, `---\ncaptured_at: ${ts}\nsource: manual\norigem: painel\n---\n\n${t}\n`, 'utf8')
    await registrar(root, 'captura', [`Inbox/manual/${nome}`], ts)
    return { ok: true, arquivo: `Inbox/manual/${nome}` }
  } },
}

export async function executar(nome, args = {}, root = ROOT) {
  const op = OPERACOES[nome]
  if (!op) throw new Error(`ferramenta desconhecida: ${nome}`)
  return op.fn(root, args ?? {})
}
