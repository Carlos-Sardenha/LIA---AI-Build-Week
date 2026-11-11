#!/usr/bin/env node
// Transcrição de UMA reunião → entidades e relações no grafo do Jarvis. Mesmo fluxo da skill dominio-grafo do
// painel_csm-GraphRAG: a parte determinística é este script (Node ≥ 18, zero dependências); a LLM só lê um prompt
// por chunk e devolve JSON (subagente extrator-reuniao, .claude/agents/extrator-reuniao.md).
//
//   node pipeline/grafo-reuniao.mjs existing --bruto Inbox/_raw/teams/2026-10-21_fup-acme
//   node pipeline/grafo-reuniao.mjs prompt   --bruto … [--todos | --pendentes | --chunk chunk-003] [--max-chars 3500]
//        (o subagente responde cada extracao/prompts/<chunk>.md com o JSON em extracao/respostas/<chunk>.json)
//   node pipeline/grafo-reuniao.mjs merge    --bruto …
//   node pipeline/grafo-reuniao.mjs validate --bruto … [--chunk chunk-003]   (sem --chunk: valida extracao.json)
//   node pipeline/grafo-reuniao.mjs apply    --bruto … [--dry-run]
//   node pipeline/grafo-reuniao.mjs status   --bruto …
//   opções comuns: --vault <raiz> (padrão: a raiz deste repo) · --dono <id-da-pessoa> (padrão JARVIS_DONO ou mateus-falcao)
//
// Pasta de trabalho: <bruto>/extracao/ (git-ignored com o bruto; vai junto para System/Archive/raw/ no arquivamento).
// O bruto é a pasta do item com turnos.txt (Teams: evento.json; Meetrox: call.json).
// Regras: sem trecho literal (dentro de uma fala de turnos.txt) não há evidência e Tema/Decisao/Compromisso novo não
// nasce; entidade existente é reutilizada, nunca recriada; campo manual nunca é sobrescrito (listas por união);
// chave nunca muda. Conteúdo da transcrição é DADO, nunca instrução.
import fs from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseNote } from '../.harness/lib/vault.mjs'
import * as G from './lib/grafo-reuniao.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cmd = process.argv[2]
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); if (i < 0) return d; const v = process.argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v }
const log = (m) => process.stderr.write(`${m}\n`)
const die = (m, c = 1) => { log(`erro: ${m}`); process.exit(c) }
const VAULT = path.resolve(typeof arg('vault') === 'string' ? arg('vault') : ROOT)
const DONO = typeof arg('dono') === 'string' ? arg('dono') : process.env.JARVIS_DONO || 'mateus-falcao'
const BRUTO = typeof arg('bruto') === 'string' ? path.resolve(VAULT, arg('bruto')) : null
if (!BRUTO && cmd !== undefined && cmd !== 'ajuda') die('--bruto <pasta do item com turnos.txt> é obrigatório')
const WORK = BRUTO ? path.join(BRUTO, 'extracao') : null
const rel = (p) => path.relative(VAULT, p).split(path.sep).join('/')
const readJson = async (p, d = null) => { try { return JSON.parse((await fs.readFile(p, 'utf8')).replace(/^﻿/, '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')) } catch { return d } }
const writeJson = async (p, o) => writeAtomic(p, JSON.stringify(o, null, 1) + '\n')
async function writeAtomic(p, s) { await fs.mkdir(path.dirname(p), { recursive: true }); const tmp = `${p}.tmp-${process.pid}`; await fs.writeFile(tmp, s, 'utf8'); await fs.rename(tmp, p) }
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function agora() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}-03:00`
}
const dSP = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

// ── leitura do bruto e do vault ─────────────────────────────────────────────────
async function lerBruto() {
  const tp = path.join(BRUTO, 'turnos.txt')
  if (!existsSync(tp)) die(`${rel(tp)} não existe (rode o coletor da fonte antes)`)
  const turnos = G.lerTurnos(await fs.readFile(tp, 'utf8'))
  if (!turnos.length) die(`${rel(tp)} sem turnos no formato "tNNNN MM:SS Falante: fala"`)
  const partes = rel(BRUTO).split('/')
  // Inbox/_raw/<fonte>/<item>/ ou System/Archive/raw/AAAA-MM/<fonte>/<item>/
  const fonte = (partes.includes('_raw') ? partes[partes.indexOf('_raw') + 1] : partes.includes('raw') ? partes[partes.indexOf('raw') + 2] : null) || 'teams'
  const item = path.basename(BRUTO)
  const ev = await readJson(path.join(BRUTO, 'evento.json'), null)
  const call = await readJson(path.join(BRUTO, 'call.json'), null)
  let meta
  if (ev) meta = { titulo: ev.assunto || item.slice(11), data: ev.inicio ? dSP(ev.inicio) : item.slice(0, 10), teams_id: ev.teams_id ?? null, meetrox_id: null, origem: 'teams', pessoas: [ev.organizador, ...(ev.participantes || [])].filter((p) => p && (p.nome || p.email)) }
  else if (call) meta = { titulo: call.title || `call ${item}`, data: call.timestamp ? dSP(call.timestamp) : hoje(), teams_id: null, meetrox_id: call.id ?? item, origem: 'meetrox', pessoas: (call.attendees || []).map((a) => (typeof a === 'string' ? { email: a } : { nome: a.name, email: a.email })) }
  else meta = { titulo: item.slice(11) || item, data: /^\d{4}-\d{2}-\d{2}/.test(item) ? item.slice(0, 10) : hoje(), teams_id: null, meetrox_id: null, origem: fonte === 'meetrox' ? 'meetrox' : 'teams', pessoas: [] }
  return { turnos, fonte, item, meta }
}
const PASTAS = { Cliente: 'Clientes', Pessoa: 'Pessoas', Projeto: 'Projetos', Tema: 'Temas', Reuniao: 'Reunioes', Decisao: 'Decisoes', Compromisso: 'Compromissos' }
async function lerNos(tipo) {
  const dir = path.join(VAULT, PASTAS[tipo])
  if (!existsSync(dir)) return []
  const out = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const md = await fs.readFile(path.join(dir, f), 'utf8')
    const { fm, body } = parseNote(md)
    out.push({ type: tipo, id: f.slice(0, -3), fm, h1: (body.match(/^#\s+(.+)$/m) || [])[1]?.trim() ?? '' })
  }
  return out
}

// ── existing ────────────────────────────────────────────────────────────────────
async function cmdExisting() {
  const { turnos, fonte, item, meta } = await lerBruto()
  const nos = Object.fromEntries(await Promise.all(Object.keys(PASTAS).map(async (t) => [t, await lerNos(t)])))
  // reunião: por id da fonte, depois data + assunto, senão id novo
  const reus = nos.Reuniao.filter((r) => !r.fm.fundir_em)
  let reu = reus.find((r) => (meta.teams_id && String(r.fm.teams_id ?? '') === String(meta.teams_id)) || (meta.meetrox_id && String(r.fm.meetrox_id ?? '') === String(meta.meetrox_id)))
  reu ??= reus.find((r) => String(r.fm.data ?? r.id.slice(0, 10)) === meta.data && Math.max(G.similaridade(r.id.slice(11), meta.titulo), G.similaridade(r.h1.replace(/\s+—\s+\d{4}-\d{2}-\d{2}$/, ''), meta.titulo)) >= G.LIMIAR.reuso)
  const reuniao = { id: reu?.id ?? `${meta.data}-${G.slugify(meta.titulo) || 'reuniao'}`, existe: !!reu, data: meta.data, titulo: meta.titulo, origem: meta.origem, teams_id: meta.teams_id, meetrox_id: meta.meetrox_id, fonte, item }
  // participantes: agenda + falantes, casados com Pessoas/ por e-mail, nome ou alias
  const pessoas = nos.Pessoa.filter((p) => !p.fm.fundir_em)
  const casar = (nome, email) => pessoas.find((p) => (email && String(p.fm.email ?? '').toLowerCase() === String(email).toLowerCase())) ??
    (nome ? pessoas.find((p) => [p.fm.nome, p.h1, ...G.toAliases(p.fm.aliases)].filter(Boolean).some((n) => G.norm(n) === G.norm(nome)) || p.id === G.slugPessoa(nome)) : undefined)
  const falantes = G.uniq(turnos.map((t) => t.falante))
  const agenda = meta.pessoas.map((p) => ({ nome: p.nome ?? null, email: p.email ? String(p.email).toLowerCase() : null, origem: 'agenda' }))
  const vistos = new Set()
  const participantes = [...agenda, ...falantes.map((n) => ({ nome: n, email: null, origem: 'falante' }))].map((p) => ({ ...p, pessoa: casar(p.nome, p.email)?.id ?? null }))
    .filter((p) => { const k = p.pessoa ?? G.norm(p.nome ?? p.email); if (vistos.has(k)) return false; vistos.add(k); return true })
  // clientes prováveis: domínio externo de e-mail → pessoas de cliente já conhecidas com o mesmo domínio
  const dominios = G.uniq(agenda.map((p) => p.email?.split('@')[1]).filter((d) => d && !d.endsWith('wehandle.com.br')))
  const clientesProvaveis = G.uniq(dominios.flatMap((d) => pessoas.filter((p) => String(p.fm.email ?? '').toLowerCase().endsWith(`@${d}`)).flatMap((p) => G.linksDe(p.fm.cliente ?? p.fm.org))).filter((c) => nos.Cliente.some((x) => x.id === c)))
  const entidades = [
    ...nos.Cliente.map((c) => ({ type: 'Cliente', id: c.id, nome: c.h1 || c.id, aliases: G.toAliases(c.fm.aliases).join(' | ') })),
    ...pessoas.map((p) => ({ type: 'Pessoa', id: p.id, nome: p.fm.nome || p.h1 || p.id, org: G.linksDe(p.fm.org ?? p.fm.cliente)[0] ?? '', email: p.fm.email ?? '', aliases: G.toAliases(p.fm.aliases).join(' | ') })),
    ...nos.Projeto.filter((p) => !p.fm.fundir_em).map((p) => ({ type: 'Projeto', id: p.id, titulo: p.fm.titulo || p.h1 || p.id, status: p.fm.status ?? '', aliases: G.toAliases(p.fm.aliases).join(' | ') })),
    ...nos.Tema.filter((t) => !t.fm.fundir_em).map((t) => ({ type: 'Tema', id: t.id, titulo: t.fm.titulo || t.h1 || t.id, cliente: G.linksDe(t.fm.cliente)[0] ?? '', aliases: G.toAliases(t.fm.aliases).join(' | ') })),
    ...nos.Decisao.filter((d) => G.linksDe(d.fm.tomada_em).includes(reuniao.id)).map((d) => ({ type: 'Decisao', id: d.id, oque: d.fm.oque ?? d.h1 })),
    ...nos.Compromisso.filter((c) => G.linksDe(c.fm.firmado_em).includes(reuniao.id)).map((c) => ({ type: 'Compromisso', id: c.id, oque: c.fm.oque ?? c.h1, status: c.fm.status ?? '' })),
  ]
  const existentes = { gerado: agora(), dono: DONO, reuniao, participantes, participantes_permitidos: G.uniq(participantes.map((p) => p.nome).filter(Boolean).concat(participantes.map((p) => p.pessoa && entidades.find((e) => e.id === p.pessoa)?.nome).filter(Boolean))), clientes_provaveis: clientesProvaveis, entidades }
  await writeJson(path.join(WORK, 'existentes.json'), existentes)
  await writeAtomic(path.join(WORK, 'existentes.txt'), existentesTxt(existentes))
  log(`existing ok · reunião ${reuniao.id}${reuniao.existe ? ' (nota existe)' : ' (nota nova)'} · ${participantes.length} participante(s), ${participantes.filter((p) => p.pessoa).length} casado(s) · ${entidades.length} entidade(s)`)
}
function existentesTxt(ex) {
  const linha = (e) => `${e.type} · ${e.id} · ${Object.entries(e).filter(([k, v]) => !['type', 'id'].includes(k) && v).map(([k, v]) => `${k}: ${v}`).join(' · ')}`
  return [`Reuniao · ${ex.reuniao.id} · ${ex.reuniao.titulo} · ${ex.reuniao.data}`, ...ex.entidades.map(linha)].join('\n') + '\n'
}

// ── prompt ──────────────────────────────────────────────────────────────────────
async function cmdPrompt() {
  const ex = await readJson(path.join(WORK, 'existentes.json')) ?? die('rode "existing" antes')
  const { turnos } = await lerBruto()
  const cs = G.chunks(turnos, +arg('max-chars', 3500))
  await writeJson(path.join(WORK, 'chunks.json'), cs.map((c) => ({ id: c.id, de: c.turnos[0].id, ate: c.turnos[c.turnos.length - 1].id, chars: c.chars })))
  const alvo = arg('chunk', null)
  const sel = typeof alvo === 'string' ? cs.filter((c) => c.id === alvo) : arg('pendentes', false) ? cs.filter((c) => !existsSync(path.join(WORK, 'respostas', `${c.id}.json`))) : cs
  if (!sel.length) { log('nenhum chunk pendente'); process.stdout.write(JSON.stringify({ prompts: [] }) + '\n'); return }
  const txtEx = await fs.readFile(path.join(WORK, 'existentes.txt'), 'utf8')
  const r = ex.reuniao
  const part = ex.participantes.map((p) => `- ${p.nome ?? p.email}${p.email ? ` <${p.email}>` : ''} — ${p.origem}${p.pessoa ? ` → ${p.pessoa}` : ' (sem Pessoa no vault)'}`).join('\n')
  const out = []
  for (const c of sel) {
    const resp = path.join(WORK, 'respostas', `${c.id}.json`)
    const md = [
      `# Pedido de extração — ${r.id} · ${c.id}`,
      '',
      `- resposta: \`${rel(resp)}\` (grave SÓ o JSON)`,
      `- validar: \`node pipeline/grafo-reuniao.mjs validate --bruto ${rel(BRUTO)} --chunk ${c.id}\``,
      `- modelo_sugerido: sonnet`,
      '',
      '## Sistema',
      '',
      'Sua tarefa é extrair entidades e relações do trecho de transcrição abaixo e devolvê-las em JSON estruturado,',
      'seguindo EXATAMENTE o schema (tipos, atributos e enums; inventar tipo, atributo ou valor novo NÃO é permitido).',
      'Todo valor de atributo é escalar; lista vira string com " | ".',
      '',
      '```',
      G.SCHEMA_TXT,
      '```',
      '',
      G.REGRAS,
      '',
      'Formato de saída:',
      '',
      '```json',
      '{ "entities": [ { "type": "Tema", "id": "integracao-portal-acme", "attributes": { "titulo": "Integração do portal", "cliente": "acme" } } ],',
      '  "relationships": [ { "type": "TRATADO_EM", "sourceId": "integracao-portal-acme", "sourceType": "Tema", "targetId": "' + r.id + '", "targetType": "Reuniao", "attributes": { "status": "aberto" } },',
      '    { "type": "EVIDENCIA", "sourceId": "' + r.id + '", "sourceType": "Reuniao", "targetId": "integracao-portal-acme", "targetType": "Tema",',
      '      "attributes": { "tipo": "tema", "trecho": "<cópia literal de uma fala>", "autor_declarado": "Ana Lima", "turno": "t0012" } } ] }',
      '```',
      '',
      '### Entidades existentes (reutilize; nunca recrie)',
      '',
      '```',
      txtEx.trimEnd(),
      '```',
      '',
      '## Usuário',
      '',
      `Reunião: ${r.id} · "${r.titulo}" · ${r.data} · origem ${r.origem}`,
      `Dono do vault: ${ex.dono}`,
      `Clientes prováveis (pelo domínio dos convidados): ${ex.clientes_provaveis.join(', ') || 'nenhum (reunião interna?)'}`,
      'Participantes:',
      part,
      `Trecho: ${c.id} (${c.turnos[0].id}–${c.turnos[c.turnos.length - 1].id} de ${turnos.length} turnos)`,
      '',
      'Texto:',
      '',
      ...c.turnos.map((t) => `${t.id} [${t.tempo}] ${t.falante}: ${t.texto}`),
      '',
    ].join('\n')
    const p = path.join(WORK, 'prompts', `${c.id}.md`)
    await writeAtomic(p, md)
    out.push({ chunk: c.id, prompt: rel(p), resposta: rel(resp) })
  }
  log(`prompt ok · ${out.length} pedido(s) em ${rel(path.join(WORK, 'prompts'))}`)
  process.stdout.write(JSON.stringify({ prompts: out }, null, 1) + '\n')
}

// ── merge / validate ────────────────────────────────────────────────────────────
async function fontes() {
  const dir = path.join(WORK, 'respostas')
  const out = []
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const json = await readJson(path.join(dir, f))
    out.push({ chunk: f.slice(0, -5), json, invalido: json === null })
  }
  return out
}
async function cmdMerge() {
  const fs_ = await fontes()
  if (!fs_.length) die('nada para fundir: extracao/respostas/*.json vazio')
  const invalidas = fs_.filter((f) => f.invalido).map((f) => f.chunk)
  const { extracao, relatorio, alias } = G.fundir(fs_.filter((f) => !f.invalido), await readJson(path.join(WORK, 'dedupe-manual.json'), {}))
  await writeJson(path.join(WORK, 'extracao.json'), extracao)
  await writeJson(path.join(WORK, 'alias-ids.json'), alias)
  await writeJson(path.join(WORK, 'merge-relatorio.json'), { ...relatorio, fontes_invalidas: invalidas })
  log(`merge ok · ${relatorio.fontes} fonte(s) · ${relatorio.entidades_lidas} → ${relatorio.entidades} entidades · ${relatorio.relacoes_lidas} → ${relatorio.relacoes} relações · ${relatorio.unificados.length} unificado(s)${invalidas.length ? ` · JSON inválido: ${invalidas.join(', ')}` : ''}`)
  for (const u of relatorio.unificados) log(`  ${u}`)
  if (invalidas.length) process.exit(1)
}
async function cmdValidate() {
  const ex = await readJson(path.join(WORK, 'existentes.json')) ?? die('rode "existing" antes')
  const { turnos } = await lerBruto()
  const ch = arg('chunk', null)
  const p = typeof ch === 'string' ? path.join(WORK, 'respostas', `${ch}.json`) : path.join(WORK, 'extracao.json')
  if (!existsSync(p)) die(`${rel(p)} não existe`)
  const ext = await readJson(p)
  if (!ext) die(`${rel(p)}: JSON inválido`)
  const { erros, avisos } = G.validar(ext, ex, turnos)
  for (const a of avisos) log(`aviso: ${a}`)
  if (erros.length) { for (const e of erros) log(`ERRO: ${e}`); die(`${erros.length} erro(s) em ${rel(p)}`) }
  log(`validate ok · ${rel(p)} · ${(ext.entities ?? []).length} entidades · ${(ext.relationships ?? []).length} relações · ${avisos.length} aviso(s)`)
}

// ── apply ───────────────────────────────────────────────────────────────────────
async function lerNota(dir, id) {
  const p = path.join(VAULT, dir, `${id}.md`)
  if (!existsSync(p)) return { p, novo: true, fm: {}, ordem: [], body: '' }
  const md = await fs.readFile(p, 'utf8')
  const { fm, body } = parseNote(md)
  return { p, novo: false, fm, ordem: G.ordemFm(md), body }
}
const montar = (n) => `${G.renderFm(n.fm, n.ordem)}\n${n.body.replace(/^\n*/, '\n')}`.replace(/\n*$/, '\n')
const vazio = (v) => v === null || v === undefined || v === '' || v === '?' || (Array.isArray(v) && !v.length)
const base = (tipo, fonte, tags) => ({ created: agora(), updated: agora(), type: tipo, source: fonte, tags })

async function cmdApply() {
  const DRY = !!arg('dry-run', false)
  const ex = await readJson(path.join(WORK, 'existentes.json')) ?? die('rode "existing" antes')
  const ext = await readJson(path.join(WORK, 'extracao.json')) ?? die('rode "merge" antes')
  const { turnos, fonte, meta } = await lerBruto()
  const { erros } = G.validar(ext, ex, [])
  if (erros.length) { for (const e of erros) log(`ERRO: ${e}`); die('extracao.json não passa no validate — corrija antes do apply') }
  const trava = path.join(VAULT, 'Inbox', '_raw', '.trava-grafo')
  if (!DRY) {
    if (existsSync(trava) && Date.now() - (await fs.stat(trava)).mtimeMs < 30 * 60e3) die(`outro apply em andamento (${rel(trava)}; apague se tiver mais de 30 min)`)
    await writeAtomic(trava, `grafo-reuniao ${agora()}\n`)
  }
  try { await aplicar(ex, ext, turnos, fonte, meta, DRY) } finally { if (!DRY) await fs.rm(trava, { force: true }) }
}

async function aplicar(ex, ext, turnos, fonte, meta, DRY) {
  const r = ex.reuniao
  const data = r.data
  const ents = new Map(ext.entities.map((e) => [`${e.type}:${e.id}`, e]))
  const exist = new Map(ex.entidades.map((e) => [`${e.type}:${e.id}`, e]))
  const rels = ext.relationships
  const destinos = (type, from, fromId) => G.uniq(rels.filter((x) => x.type === type && x.sourceType === from && x.sourceId === fromId).map((x) => x.targetId))
  const origens = (type, to, toId) => G.uniq(rels.filter((x) => x.type === type && x.targetType === to && x.targetId === toId).map((x) => x.sourceId))
  const brutoRel = rel(BRUTO) + '/'
  const fonteTodo = meta.origem === 'meetrox' ? `meetrox:${meta.meetrox_id}` : `teams:${data}`
  const rep = { reuniao: r.id, criados: [], atualizados: [], evidencias: 0, evidencias_rejeitadas: [], descartados_sem_evidencia: [], todo: [], autor_divergente: [] }

  // evidências: só trecho literal dentro de uma fala; autor = falante real do turno
  const evid = new Map() // "Tipo:id" → [linhas]
  for (const x of rels.filter((y) => y.type === 'EVIDENCIA')) {
    const t = G.ancorar(x.attributes.trecho, turnos, x.attributes.turno)
    if (!t) { rep.evidencias_rejeitadas.push(`${x.targetType}:${x.targetId} — "${String(x.attributes.trecho).slice(0, 80)}"`); continue }
    if (x.attributes.autor_declarado && G.norm(x.attributes.autor_declarado) !== G.norm(t.falante)) rep.autor_divergente.push(`${t.id}: declarado ${x.attributes.autor_declarado}, falante ${t.falante}`)
    const linha = `- "${String(x.attributes.trecho).replace(/\s+/g, ' ').trim()}" — ${t.falante} · fonte: ${brutoRel}turnos.txt#${t.id}`
    const k = `${x.targetType}:${x.targetId}`
    evid.set(k, G.uniq([...(evid.get(k) ?? []), linha]))
  }
  const temEvid = (tipo, id) => (evid.get(`${tipo}:${id}`) ?? []).length > 0
  const novo = (tipo, id) => ents.has(`${tipo}:${id}`) && !exist.has(`${tipo}:${id}`)
  const escrever = async (n, dir, id) => {
    n.fm.updated = agora()
    ;(n.novo ? rep.criados : rep.atualizados).push(`${dir}/${id}`)
    if (!DRY) await writeAtomic(n.p, montar(n))
  }

  // Pessoas: participantes da agenda/falantes casados + PARTICIPOU
  const mapaPessoa = new Map() // id extraído → id final
  const participantes = G.uniq([...ex.participantes.map((p) => p.pessoa).filter(Boolean), ...destinos('PARTICIPOU', 'Reuniao', r.id)])
  for (const id of participantes) {
    const e = ents.get(`Pessoa:${id}`)
    const n = await lerNota('Pessoas', id)
    if (n.novo && !e) continue
    if (n.novo) {
      n.fm = { ...base('pessoa', fonte, ['pessoa']), nome: e.attributes.nome, org: e.attributes.org || (String(e.attributes.email ?? '').endsWith('@wehandle.com.br') ? 'wehandle' : null), email: e.attributes.email || ex.participantes.find((p) => G.norm(p.nome ?? '') === G.norm(e.attributes.nome))?.email || null, aliases: G.toAliases(e.attributes.aliases), ultima_interacao: data }
      n.body = `# ${e.attributes.nome}\n\n## Histórico\n- ${data} — participou de [[${r.id}]]\n`
    } else {
      if (e?.attributes.aliases) n.fm.aliases = G.uniq([...G.toAliases(n.fm.aliases), ...G.toAliases(e.attributes.aliases)])
      if (vazio(n.fm.ultima_interacao) || String(n.fm.ultima_interacao) < data) n.fm.ultima_interacao = data
      n.body = G.anexarSecao(n.body, 'Histórico', [`- ${data} — participou de [[${r.id}]]`])
    }
    mapaPessoa.set(id, id)
    await escrever(n, 'Pessoas', id)
  }
  const pessoasOk = (ids) => ids.filter((id) => mapaPessoa.has(id) || existsSync(path.join(VAULT, 'Pessoas', `${id}.md`)))

  // Projetos novos
  for (const id of G.uniq(rels.filter((x) => x.type === 'DO_PROJETO').map((x) => x.targetId))) {
    if (!novo('Projeto', id)) continue
    const e = ents.get(`Projeto:${id}`)
    const n = await lerNota('Projetos', id)
    if (!n.novo) continue
    n.fm = { ...base('projeto', fonte, ['projeto']), titulo: e.attributes.titulo, status: null, prazo: null, cliente: e.attributes.cliente ? G.link(e.attributes.cliente) : null, aliases: G.toAliases(e.attributes.aliases) }
    n.body = `# ${e.attributes.titulo}\n\nIniciativa citada em [[${r.id}]] (status a definir pelo Mateus).\n`
    await escrever(n, 'Projetos', id)
  }

  const clientes = destinos('SOBRE', 'Reuniao', r.id)
  const projetosReu = destinos('DO_PROJETO', 'Reuniao', r.id)
  const cliVal = (lista) => (lista.length === 0 ? null : lista.length === 1 ? G.link(lista[0]) : lista.map(G.link))

  // Temas
  const temas = []
  for (const id of origens('TRATADO_EM', 'Reuniao', r.id)) {
    const e = ents.get(`Tema:${id}`)
    if (novo('Tema', id) && !temEvid('Tema', id)) { rep.descartados_sem_evidencia.push(`Tema:${id}`); continue }
    const st = rels.find((x) => x.type === 'TRATADO_EM' && x.sourceId === id)?.attributes?.status
    const n = await lerNota('Temas', id)
    if (n.novo) {
      n.fm = { ...base('tema', fonte, ['tema']), titulo: e.attributes.titulo, cliente: e.attributes.cliente ? G.link(e.attributes.cliente) : null, status: st || 'aberto', aliases: G.toAliases(e.attributes.aliases), primeira_vez: data, ultima_vez: data, n_reunioes: 0, causa_raiz: null, fundir_em: null }
      n.body = `# ${e.attributes.titulo}\n`
    } else if (e?.attributes.aliases) n.fm.aliases = G.uniq([...G.toAliases(n.fm.aliases), ...G.toAliases(e.attributes.aliases)])
    n.body = G.anexarSecao(n.body, 'Histórico', [`- ${data} — tratado em [[${r.id}]]${st ? ` (status visto: ${st})` : ''}`], (l) => l.includes(`[[${r.id}]]`))
    n.body = G.anexarSecao(n.body, 'Evidências', evid.get(`Tema:${id}`) ?? [])
    const hist = (n.body.match(/^- \d{4}-\d{2}-\d{2} — tratado em \[\[/gm) || []).length
    n.fm.n_reunioes = Math.max(Number(n.fm.n_reunioes) || 0, hist)
    if (vazio(n.fm.primeira_vez) || String(n.fm.primeira_vez) > data) n.fm.primeira_vez = data
    if (vazio(n.fm.ultima_vez) || String(n.fm.ultima_vez) < data) n.fm.ultima_vez = data
    temas.push(id)
    await escrever(n, 'Temas', id)
  }
  const temasOk = (ids) => ids.filter((id) => temas.includes(id) || (existsSync(path.join(VAULT, 'Temas', `${id}.md`)) && !novo('Tema', id)))

  // Decisões e compromissos: id provisório → chave final; reaproveita nó da mesma reunião com o mesmo "o quê"
  // lido do vault agora (não do existentes.json): rodar o apply de novo reaproveita o que a rodada anterior gravou
  const daReuniao = {
    Decisao: (await lerNos('Decisao')).filter((d) => G.linksDe(d.fm.tomada_em).includes(r.id)),
    Compromisso: (await lerNos('Compromisso')).filter((c) => G.linksDe(c.fm.firmado_em).includes(r.id)),
  }
  const reaproveitar = (tipo, oque) => daReuniao[tipo].find((x) => G.similaridade(String(x.fm.oque ?? x.h1), oque) >= G.LIMIAR.reuso)?.id
  const chaveLivre = (dir, id) => { let k = id, i = 2; while (existsSync(path.join(VAULT, dir, `${k}.md`))) k = `${id}-${i++}`; return k }
  const decisoes = [], compromissos = []
  for (const e of ext.entities.filter((x) => x.type === 'Decisao')) {
    const ehExist = exist.has(`Decisao:${e.id}`)
    if (!ehExist && !temEvid('Decisao', e.id)) { rep.descartados_sem_evidencia.push(`Decisao:${e.id}`); continue }
    const id = ehExist ? e.id : reaproveitar('Decisao', e.attributes.oque) ?? chaveLivre('Decisoes', `${data}-${G.slugify(e.attributes.oque, 60)}`)
    const n = await lerNota('Decisoes', id)
    const por = pessoasOk(destinos('DECIDIDO_POR', 'Decisao', e.id)), ts = temasOk(destinos('SOBRE_TEMA', 'Decisao', e.id)), pj = destinos('DO_PROJETO', 'Decisao', e.id)
    if (n.novo) {
      n.fm = { ...base('decisao', fonte, ['decisao']), data, oque: e.attributes.oque, tomada_em: G.link(r.id), decidido_por: por.map(G.link), cliente: cliVal(clientes), projeto: cliVal(pj.length ? pj : projetosReu), temas: ts.map(G.link), status: 'vigente', substituida_por: null }
      n.body = `# ${e.attributes.oque}\n`
    } else { n.fm.decidido_por = G.uniao(n.fm.decidido_por, por); n.fm.temas = G.uniao(n.fm.temas, ts) }
    n.body = G.anexarSecao(n.body, 'Evidências', evid.get(`Decisao:${e.id}`) ?? [])
    decisoes.push(id)
    await escrever(n, 'Decisoes', id)
  }
  let todo = existsSync(path.join(VAULT, 'TODO.md')) ? await fs.readFile(path.join(VAULT, 'TODO.md'), 'utf8') : null
  for (const e of ext.entities.filter((x) => x.type === 'Compromisso')) {
    const ehExist = exist.has(`Compromisso:${e.id}`)
    if (!ehExist && !temEvid('Compromisso', e.id)) { rep.descartados_sem_evidencia.push(`Compromisso:${e.id}`); continue }
    const quem = pessoasOk(destinos('ASSUMIDO_POR', 'Compromisso', e.id))
    const id = ehExist ? e.id : reaproveitar('Compromisso', e.attributes.oque) ?? chaveLivre('Compromissos', `${data}-${quem[0] ?? 'alguem'}-${G.slugify(e.attributes.oque, 40)}`)
    const n = await lerNota('Compromissos', id)
    const ts = temasOk(destinos('SOBRE_TEMA', 'Compromisso', e.id)), pj = destinos('DO_PROJETO', 'Compromisso', e.id)
    if (n.novo) {
      n.fm = { ...base('compromisso', fonte, ['compromisso']), data, oque: e.attributes.oque, assumido_por: quem.map(G.link), firmado_em: G.link(r.id), cliente: cliVal(clientes), projeto: cliVal(pj.length ? pj : projetosReu), temas: ts.map(G.link), status: 'aberto', prazo: e.attributes.prazo || 'sem prazo', fecha_quando: e.attributes.fecha_quando || null, todo: null, concluido_em: null }
      n.body = `# ${e.attributes.oque}\n`
    } else { n.fm.assumido_por = G.uniao(n.fm.assumido_por, quem); n.fm.temas = G.uniao(n.fm.temas, ts) }
    n.body = G.anexarSecao(n.body, 'Evidências', evid.get(`Compromisso:${e.id}`) ?? [])
    if (todo !== null) {
      const t = G.linhaTodo(todo, { compId: id, oque: n.fm.oque, prazo: String(n.fm.prazo ?? ''), dono: ex.dono, assumidos: G.linksDe(n.fm.assumido_por), fonte: fonteTodo, data, hoje: hoje() })
      if (t.secao) { todo = t.todo; rep.todo.push(`${t.secao}: ${t.linha}`); if (t.secao !== 'Aguardando' && vazio(n.fm.todo)) n.fm.todo = t.linha.replace(/^- \[ \] /, '') }
    }
    compromissos.push(id)
    await escrever(n, 'Compromissos', id)
  }
  if (todo !== null && rep.todo.length && !DRY) await writeAtomic(path.join(VAULT, 'TODO.md'), todo)

  // Reunião: listas por união; tags temáticas só agora (depois da reunião), e "futura" sai
  const n = await lerNota('Reunioes', r.id)
  const tagsNovas = G.toAliases(ents.get(`Reuniao:${r.id}`)?.attributes?.tags).map((t) => G.slugify(t)).filter(Boolean)
  if (n.novo) {
    n.fm = { ...base('reuniao', fonte, ['reuniao']), data, participantes: [], cliente: null, projeto: null, temas: [], decisoes: [], compromissos: [], origem: meta.origem, meetrox_id: meta.meetrox_id ?? null, teams_id: meta.teams_id ?? null, bruto: brutoRel }
    n.body = `# ${r.titulo} — ${data}\n\n## Notas do Mateus\n<!-- manual -->\n`
  }
  n.fm.tags = G.uniq([...(Array.isArray(n.fm.tags) ? n.fm.tags : G.toAliases(n.fm.tags)).filter((t) => t !== 'futura'), 'reuniao', ...tagsNovas])
  n.fm.participantes = G.uniao(n.fm.participantes, [...mapaPessoa.keys()])
  const cli = G.uniq([...G.linksDe(n.fm.cliente), ...clientes]); n.fm.cliente = cliVal(cli)
  const pjs = G.uniq([...G.linksDe(n.fm.projeto), ...projetosReu]); n.fm.projeto = cliVal(pjs)
  n.fm.temas = G.uniao(n.fm.temas, temas)
  n.fm.decisoes = G.uniao(n.fm.decisoes, decisoes)
  n.fm.compromissos = G.uniao(n.fm.compromissos, compromissos)
  if (vazio(n.fm.origem) || n.fm.origem === 'outlook' || n.fm.origem === 'manual') n.fm.origem = meta.origem
  if (vazio(n.fm.teams_id) && meta.teams_id) n.fm.teams_id = meta.teams_id
  if (vazio(n.fm.meetrox_id) && meta.meetrox_id) n.fm.meetrox_id = meta.meetrox_id
  if (vazio(n.fm.bruto)) n.fm.bruto = brutoRel
  await escrever(n, 'Reunioes', r.id)
  rep.evidencias = [...evid.values()].reduce((a, l) => a + l.length, 0)
  if (!DRY) await writeJson(path.join(WORK, 'apply-relatorio.json'), { aplicado: agora(), ...rep })
  log(`apply ${DRY ? '(dry-run) ' : ''}ok · ${rep.criados.length} criado(s) · ${rep.atualizados.length} atualizado(s) · ${rep.evidencias} evidência(s) · ${rep.evidencias_rejeitadas.length} rejeitada(s) · ${rep.descartados_sem_evidencia.length} descartado(s) sem evidência · ${rep.todo.length} linha(s) no TODO`)
  process.stdout.write(JSON.stringify(rep, null, 1) + '\n')
}

async function cmdStatus() {
  const cs = await readJson(path.join(WORK, 'chunks.json'), [])
  const resp = cs.filter((c) => existsSync(path.join(WORK, 'respostas', `${c.id}.json`))).length
  const st = { existentes: existsSync(path.join(WORK, 'existentes.json')), chunks: cs.length, respondidos: resp, merge: existsSync(path.join(WORK, 'extracao.json')), aplicado: (await readJson(path.join(WORK, 'apply-relatorio.json')))?.aplicado ?? null }
  process.stdout.write(JSON.stringify(st, null, 1) + '\n')
}

const CMDS = { existing: cmdExisting, prompt: cmdPrompt, merge: cmdMerge, validate: cmdValidate, apply: cmdApply, status: cmdStatus }
if (!CMDS[cmd]) die(`uso: node pipeline/grafo-reuniao.mjs <${Object.keys(CMDS).join('|')}> --bruto <pasta> [opções] (ver cabeçalho do arquivo)`, 2)
await CMDS[cmd]()
