// Leitura do vault como grafo (schema: System/schema/grafo.md).
// Nota = nó (id = basename), wikilink em propriedade = aresta tipada pelo nome da propriedade,
// wikilink no corpo = aresta fraca "menciona". Só leitura: nada aqui escreve no vault.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// JARVIS_VAULT aponta para outro vault (testes usam a fixture); padrão = dois níveis acima de .harness/lib
export const ROOT = process.env.JARVIS_VAULT
  ? path.resolve(process.env.JARVIS_VAULT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Pastas ignoradas (caminho relativo, com /). Archive e brutos: LGPD + histórico; templates têm links de exemplo.
export const IGNORAR = ['.git', '.claude', '.harness', '.obsidian', '.trash', 'node_modules', 'System/Archive', 'System/templates', 'Inbox/_raw']

export const PASTA_TIPO = {
  Clientes: 'cliente', Pessoas: 'pessoa', Reunioes: 'reuniao', Projetos: 'projeto', Temas: 'tema',
  Decisoes: 'decisao', Compromissos: 'compromisso', Notes: 'nota', Aprender: 'curso', Daily: 'daily', Semanal: 'semanal',
  RegrasNegocio: 'regra', Sessoes: 'sessao',
}
export const TIPOS = [...new Set(Object.values(PASTA_TIPO))]
// arquivos de sistema na raiz: lidos pelo grep, mas não são nós de domínio nem alvo de aresta
const SISTEMA = new Set(['index', 'log', 'CLAUDE', 'AGENTS', 'LEIA-ME', 'README'])
// propriedades que são aresta mesmo com texto puro (sem [[ ]]) quando o texto é uma chave existente
export const PROPS_ARESTA = new Set(['participantes', 'cliente', 'org', 'projeto', 'temas', 'decisoes', 'compromissos',
  'assumido_por', 'firmado_em', 'tomada_em', 'decidido_por', 'relacionados', 'fonte', 'substituida_por', 'modulos'])
const NAO_ARESTA = new Set(['tags', 'aliases', 'travado', 'fundir_em', 'created', 'updated', 'type', 'tipo', 'source'])

export function stripAccents(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '') }
export function norm(s) { return stripAccents(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() }
export function hoje() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
export function addDias(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export function toList(v) { if (v === null || v === undefined || v === '') return []; return Array.isArray(v) ? v : [v] }
const DATA_RE = /^\d{4}-\d{2}-\d{2}/

// ── YAML plano: escalar, lista flow [a, b] e lista em bloco ("- a") ───────────

function parseScalar(v) {
  v = v.trim()
  if (v === '' || v === 'null' || v === '~') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (/^"(.*)"$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  if (/^'(.*)'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'")
  return v
}
function parseFlowList(v) {
  const inner = v.trim().replace(/^\[/, '').replace(/\]$/, '')
  const out = []
  let cur = '', q = null, depth = 0
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue }
    if (ch === '[') { depth++; cur += ch; continue }
    if (ch === ']') { depth--; cur += ch; continue }
    if (ch === ',' && depth === 0) { out.push(parseScalar(cur)); cur = ''; continue }
    cur += ch
  }
  if (cur.trim() !== '') out.push(parseScalar(cur))
  return out.filter((x) => x !== null)
}
// comentário "  # …" fora de aspas e fora de [[ ]]
function semComentario(v) {
  let q = null
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]
    if (q) { if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; continue }
    if (ch === '#' && i > 0 && /\s/.test(v[i - 1])) return v.slice(0, i).trimEnd()
  }
  return v
}
export function parseNote(md) {
  const txt = String(md ?? '').replace(/^﻿/, '')
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/)
  if (!m) return { fm: {}, body: txt, temFm: false, linhaCorpo: 1 }
  const fm = {}
  const lines = m[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!km) continue
    const k = km[1]
    const v = semComentario(km[2])
    if (v.trim() === '' && lines[i + 1] !== undefined && /^\s*-\s/.test(lines[i + 1])) {
      const arr = []
      while (lines[i + 1] !== undefined && /^\s*-\s/.test(lines[i + 1])) { const x = parseScalar(semComentario(lines[i + 1].replace(/^\s*-\s/, ''))); if (x !== null) arr.push(x); i++ }
      fm[k] = arr
    } else if (v.trim().startsWith('[') && !v.trim().startsWith('[[')) fm[k] = parseFlowList(v)
    else fm[k] = parseScalar(v)
  }
  return { fm, body: m[2], temFm: true, linhaCorpo: lines.length + 3 }
}

// ── Blocos de código: exemplo de schema não é aresta nem evidência ─────────────
// Cercas (``` ou ~~~, fecha com o mesmo caractere e comprimento ≥) viram linha vazia; nº de linhas preservado.
export function semCercas(txt) {
  let cerca = null
  return String(txt ?? '').split(/\r?\n/).map((l) => {
    const m = l.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (cerca) {
      if (m && m[1][0] === cerca[0] && m[1].length >= cerca.length && m[2].trim() === '') cerca = null
      return ''
    }
    if (m && !(m[1][0] === '`' && m[2].includes('`'))) { cerca = m[1]; return '' }
    return l
  }).join('\n')
}
// código inline (`x`, ``x``) vira espaços do mesmo tamanho (posições preservadas)
export function semCodigoInline(txt) {
  return String(txt ?? '').replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (s) => s.replace(/[^\n]/g, ' '))
}
export function semCodigo(txt) { return semCodigoInline(semCercas(txt)) }

// [[alvo]], [[alvo|rótulo]], [[alvo#seção]], [[pasta/alvo]] → { para: 'alvo', frag }
const WIKI = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]*)?\]\]/g
export function chaveDeLink(alvo) { return String(alvo).trim().replace(/\\/g, '/').split('/').pop().replace(/\.md$/i, '').trim() }
export function wikilinks(v) {
  const out = []
  for (const s of toList(v)) {
    if (typeof s !== 'string') continue
    for (const m of s.matchAll(WIKI)) out.push({ para: chaveDeLink(m[1]), frag: m[2]?.trim() ?? null })
  }
  return out
}
// wikilinks do corpo, ignorando os que estão em bloco de código (cerca ou inline)
export function wikilinksCorpo(body) { return wikilinks(semCodigo(body)) }

// "## Evidências" (schema § 6, decisão D1):
//   D1:     - "trecho literal" — Autor · fonte: System/Archive/raw/AAAA-MM/<fonte>/<item>/turnos.txt#tNNNN
//   legado: - "trecho literal" — meetrox:<id> turno:tNNNN [· `caminho/do/bruto`]
// A aspa de fechamento é a ÚLTIMA aspa seguida do separador do autor (travessão — / – ou hífen): aspas e
// apóstrofos dentro do trecho ("ela disse "sim"", "it's") não cortam a citação. Sem separador, cai no
// formato curto (até a primeira aspa de fechamento).
const ASPAS_SEP = /^["“”‘’']([\s\S]+)["“”‘’']\s*([—–-][\s\S]*)$/
const ASPAS = /^["“”‘’']([\s\S]+?)["“”‘’']\s*(.*)$/
const SISTEMA_ID = /\b(meetrox|teams_transcricoes|teams|outlook|agenda|clickup|jira|claude-code|manual):([^\s·`)]+)/i
function separarResto(resto) {
  resto = resto.replace(/^[—–-]\s*/, '').trim()
  const f = resto.match(/(?:^|\s|·)fonte:\s*(.+)$/i)
  if (f) {
    const ponteiro = f[1].trim().replace(/`/g, '')
    const autor = resto.slice(0, f.index).replace(/[·\s]+$/, '').trim() || null
    const ancora = ponteiro.match(/#([^\s·]+)/)?.[1] ?? ponteiro.match(/\bturno:\s*(t\d+)/i)?.[1] ?? null
    const sis = /^[a-z_-]+:/i.test(ponteiro) && !/^[a-z]:[\\/]/i.test(ponteiro) ? ponteiro.match(SISTEMA_ID) : null
    return { autor, ponteiro, ancora, sistema: sis?.[1].toLowerCase() ?? null, item: sis?.[2] ?? null, formato: 'd1' }
  }
  const sis = resto.match(SISTEMA_ID)
  const turno = resto.match(/\bturno:\s*(t\d+)/i)?.[1] ?? null
  const cam = resto.match(/`([^`]+)`/)?.[1].trim() ?? null
  const partes = resto.split(/\s+·\s+/).filter((p) => !SISTEMA_ID.test(p) && !/\bturno:/i.test(p) && !p.includes('`') && p.trim())
  const autor = partes.join(' · ').replace(/[·\s]+$/, '').trim() || null
  if (!sis && !cam) return { autor, ponteiro: null, ancora: null, sistema: null, item: null, formato: null }
  const ponteiro = cam ? `${cam.replace(/#.*$/, '')}${turno ? `#${turno}` : cam.includes('#') ? cam.slice(cam.indexOf('#')) : ''}` : `${sis[1].toLowerCase()}:${sis[2]}${turno ? ` turno:${turno}` : ''}`
  return { autor, ponteiro, ancora: turno ?? (cam?.match(/#([^\s·]+)/)?.[1] ?? null), sistema: sis?.[1].toLowerCase() ?? null, item: sis?.[2] ?? null, formato: 'legado' }
}
export function evidencias(body, linhaCorpo = 1) {
  const linhas = semCercas(body).split('\n')
  const out = []
  let dentro = false
  linhas.forEach((l, i) => {
    if (/^#{1,6}\s/.test(l)) { dentro = /^##\s+Evid[êe]ncias?\b/i.test(l); return }
    if (!dentro) return
    const it = l.match(/^\s*[-*]\s+(?:>\s*)?(.*)$/)
    if (!it) return
    const item = it[1].trim()
    if (item.startsWith('`')) return // item inteiro em código inline = exemplo, não evidência
    const m = item.match(ASPAS_SEP) ?? item.match(ASPAS)
    if (!m) { out.push({ cit: null, resto: item, autor: null, ponteiro: null, ancora: null, linha: linhaCorpo + i, valida: false }); return }
    const r = separarResto(m[2])
    out.push({ cit: m[1].trim(), ...r, linha: linhaCorpo + i, valida: !!r.ponteiro })
  })
  return out
}

function tituloDoCorpo(body) { const m = semCercas(body).match(/^#\s+(.+)$/m); return m ? m[1].trim() : null }

export function dataDoNo(n) {
  const f = n.fm
  for (const v of [f.data, f.date]) if (v && DATA_RE.test(String(v))) return String(v).slice(0, 10)
  const m = n.id.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  if (f.created && DATA_RE.test(String(f.created))) return String(f.created).slice(0, 10)
  return null
}

// ── Carga ───────────────────────────────────────────────────────────────────

const relDe = (root, p) => path.relative(root, p).replace(/\\/g, '/')
function ignorado(rel) { return IGNORAR.some((d) => rel === d || rel.startsWith(d + '/')) }

async function listarMd(root, dir = root, out = []) {
  let ents
  try { ents = await fs.readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    const rel = relDe(root, p)
    if (ignorado(rel)) continue
    if (e.isDirectory()) await listarMd(root, p, out)
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p)
  }
  return out
}

// type/tipo do frontmatter manda; sem ele, a pasta. Em Aprender/ (D2) só Aprender/<slug>/<slug>.md é curso:
// <slug>-fontes.md, fila.md e afins sem type viram nota.
export function tipoDe(rel, fm, id) {
  const t = fm.type ?? fm.tipo
  if (typeof t === 'string' && t.trim()) return t.trim().toLowerCase()
  const partes = rel.split('/')
  const pasta = partes[0]
  if (pasta === 'Aprender' && partes.length > 1) return partes.length === 3 && partes[1] === id ? 'curso' : 'nota'
  if (PASTA_TIPO[pasta] && rel.includes('/')) return PASTA_TIPO[pasta]
  if (id === 'TODO') return 'todo'
  return 'outro'
}

export async function carregarGrafo(root = ROOT) {
  const t0 = Date.now()
  const arquivos = await listarMd(root)
  const nos = new Map(), arquivosTxt = new Map(), colisoes = []
  for (const p of arquivos) {
    const txt = await fs.readFile(p, 'utf8')
    const rel = relDe(root, p)
    arquivosTxt.set(rel, txt)
    const id = path.basename(p, path.extname(p))
    const { fm, body, temFm, linhaCorpo } = parseNote(txt)
    const sistema = !rel.includes('/') && SISTEMA.has(id)
    if (sistema || rel.startsWith('System/') || rel.startsWith('Inbox/')) continue // grep lê; grafo não
    const n = { id, tipo: tipoDe(rel, fm, id), arquivo: rel, fm, corpo: body, temFm, linhaCorpo,
      titulo: fm.titulo ?? fm.nome ?? fm.oque ?? tituloDoCorpo(body) ?? id, aliases: toList(fm.aliases).map(String) }
    n.data = dataDoNo(n)
    n.evidencias = evidencias(body, linhaCorpo)
    if (nos.has(id)) { colisoes.push({ id, arquivos: [nos.get(id).arquivo, rel] }); continue }
    nos.set(id, n)
  }

  // fundir_em: duplicata redireciona para o canônico (cadeia; inválido = ignora e reporta)
  const redir = new Map(), fusoesInvalidas = []
  for (const n of nos.values()) {
    const alvo = wikilinks(n.fm.fundir_em)[0]?.para ?? (typeof n.fm.fundir_em === 'string' ? chaveDeLink(n.fm.fundir_em) : null)
    if (!alvo) continue
    const caminho = [n.id]
    let cur = alvo, erro = null
    while (cur) {
      const a = nos.get(cur)
      if (!a) { erro = `${n.id} → ${cur} não existe`; break }
      if (a.tipo !== n.tipo) { erro = `${n.id} (${n.tipo}) → ${cur} (${a.tipo}): tipo diferente`; break }
      if (caminho.includes(cur)) { erro = `ciclo ${[...caminho, cur].join(' → ')}`; break }
      caminho.push(cur)
      const prox = wikilinks(a.fm.fundir_em)[0]?.para ?? null
      if (!prox) break
      cur = prox
    }
    if (erro) fusoesInvalidas.push({ id: n.id, erro })
    else redir.set(n.id, caminho.at(-1))
  }
  const canon = (id) => redir.get(id) ?? id

  const saidas = new Map(), entradas = new Map(), quebrados = []
  const push = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v) }
  for (const n of nos.values()) {
    const vistos = new Set()
    const add = (rel, para, frag) => {
      if (SISTEMA.has(para)) return
      const c = canon(para)
      if (c === n.id) return
      const k = `${rel}|${c}`
      if (vistos.has(k)) return
      vistos.add(k)
      if (!nos.has(c)) { quebrados.push({ de: n.id, rel, para }); return }
      push(saidas, n.id, { rel, para: c, frag, ...(c !== para ? { via: para } : {}) })
      push(entradas, c, { rel, de: n.id, frag })
    }
    for (const [rel, v] of Object.entries(n.fm)) {
      if (NAO_ARESTA.has(rel)) continue
      const links = wikilinks(v)
      for (const { para, frag } of links) add(rel, para, frag)
      if (!links.length && PROPS_ARESTA.has(rel)) {
        for (const s of toList(v)) if (typeof s === 'string' && nos.has(chaveDeLink(s))) add(rel, chaveDeLink(s), null)
      }
    }
    for (const { para, frag } of wikilinksCorpo(n.corpo)) add('menciona', para, frag)
  }
  return { root, nos, redir, fusoesInvalidas, colisoes, saidas, entradas, quebrados, arquivosTxt, carregadoEm: Date.now(), ms: Date.now() - t0 }
}

// ── Resolução de nomes ──────────────────────────────────────────────────────

// id exato, [[link]], nome de arquivo, título/nome/aliases (sem acento), ou parcial única. tipo restringe.
export function resolverNo(g, q, tipo = null) {
  if (q === null || q === undefined || q === '') return null
  const s = chaveDeLink(String(q).trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0])
  const ok = (n) => n && (!tipo || n.tipo === tipo)
  const c = g.redir.get(s) ?? s
  if (ok(g.nos.get(c))) return c
  const alvo = norm(String(q))
  if (!alvo) return null
  let parcial = []
  for (const n of g.nos.values()) {
    if (!ok(n)) continue
    const nomes = [n.id, n.id.replace(/-/g, ' '), n.titulo, n.fm.nome, ...n.aliases].filter(Boolean).map(norm)
    if (nomes.includes(alvo)) return n.id
    if (alvo.length >= 3 && nomes.some((x) => x.includes(alvo))) parcial.push(n.id)
  }
  parcial = [...new Set(parcial)]
  return parcial.length === 1 ? parcial[0] : parcial.length > 1 ? parcial.sort((a, b) => a.length - b.length)[0] : null
}

export function rotulo(n) {
  if (!n) return '?'
  const f = n.fm
  switch (n.tipo) {
    case 'compromisso': return `${f.oque ?? n.titulo} [${f.status ?? '?'}${f.prazo ? ` · prazo ${f.prazo}` : ''}]`
    case 'decisao': return `${f.oque ?? n.titulo}${f.status ? ` [${f.status}]` : ''}`
    case 'tema': return `${n.titulo}${f.status ? ` [${f.status}]` : ''}`
    case 'reuniao': return `${n.data ?? ''} · ${n.titulo}`
    case 'curso': return `${f.assunto ?? n.titulo}${f.status ? ` [${f.status}${f.modulos_total ? ` · ${f.modulos_feitos ?? 0}/${f.modulos_total} módulos` : ''}]` : ''}`
    default: return n.titulo ?? n.id
  }
}
