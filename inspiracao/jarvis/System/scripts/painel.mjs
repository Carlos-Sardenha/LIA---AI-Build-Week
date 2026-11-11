#!/usr/bin/env node
// Painel do dia (skill `checkin`).
//   node System/scripts/painel.mjs montar [--data AAAA-MM-DD] [--extra System/checkin/extra.json]
//     → System/checkin/checkin.html = modelo .claude/skills/checkin/checkin.html + painel do vault
//       (jarvis_painel) + extra (agenda do Outlook e proposta do dia, montados pelo Claude).
//   node System/scripts/painel.mjs aplicar <pasta-ou-arquivo.json>
//     → executa no vault cada item da fila do db do Artifact (documentos {tool, args}), em ordem de `em`,
//       pelas mesmas operações do servidor jarvis-escrita. Imprime o resultado de cada um (JSON).
// System/checkin/ é git-ignored: a página do dia tem nomes reais.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.JARVIS_VAULT ? path.resolve(process.env.JARVIS_VAULT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const { executar, OPERACOES } = await import(new URL('../../.harness/lib/escrita.mjs', import.meta.url))
const { hoje } = await import(new URL('../../.harness/lib/vault.mjs', import.meta.url))

const [cmd, ...rest] = process.argv.slice(2)
const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : null }
const lerJson = async (p) => JSON.parse((await fs.readFile(p, 'utf8')).replace(/^﻿/, ''))

if (cmd === 'montar') {
  const data = opt('data') ?? hoje()
  const painel = await executar('jarvis_painel', { data }, ROOT)
  const extra = opt('extra') ? await lerJson(path.resolve(opt('extra'))) : {}
  const dados = { hoje: painel.hoje, diaSemana: painel.diaSemana, geradoEm: painel.geradoEm, expediente: { inicio: '09:00', fim: '16:00' }, ...extra, painel }
  const tpl = await fs.readFile(path.join(HERE, '.claude', 'skills', 'checkin', 'checkin.html'), 'utf8')
  const json = JSON.stringify(dados, null, 1).replace(/</g, '\\u003c')
  const out = tpl.replace(/(<script id="painel-data" type="application\/json">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}\n${json}\n${b}`)
    .replace('<title>Painel do Jarvis</title>', '<title>Painel do Jarvis</title>\n<!-- PÁGINA DO DIA (git-ignored): contém nomes reais. Gerada por System/scripts/painel.mjs. -->')
  const dest = path.join(ROOT, 'System', 'checkin', 'checkin.html')
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, out, 'utf8')
  const abertas = painel.todo.filter((t) => !t.feito)
  console.log(JSON.stringify({ arquivo: path.relative(ROOT, dest).replace(/\\/g, '/'), data, tarefas_abertas: abertas.length, compromissos: painel.compromissos.length, projetos: painel.projetos.length, reunioes: painel.reunioes.length, daily: painel.daily.existe }))
} else if (cmd === 'aplicar') {
  const alvo = path.resolve(rest[0] ?? '')
  const st = await fs.stat(alvo)
  const arquivos = st.isDirectory() ? (await fs.readdir(alvo, { recursive: true })).filter((f) => f.endsWith('.json')).map((f) => path.join(alvo, f)) : [alvo]
  const itens = []
  for (const f of arquivos) {
    const j = await lerJson(f)
    for (const d of Array.isArray(j) ? j : [j]) { const doc = d.data ?? d; if (doc.tool) itens.push({ doc_id: d.doc_id ?? d.id ?? path.basename(f, '.json'), ...doc }) }
  }
  itens.sort((a, b) => String(a.em).localeCompare(String(b.em)))
  for (const it of itens) {
    if (it.status && it.status !== 'pendente') { console.log(JSON.stringify({ doc_id: it.doc_id, pulado: it.status })); continue }
    if (!OPERACOES[it.tool] || OPERACOES[it.tool].leitura) { console.log(JSON.stringify({ doc_id: it.doc_id, erro: `operação não permitida: ${it.tool}` })); continue }
    try { console.log(JSON.stringify({ doc_id: it.doc_id, tool: it.tool, rotulo: it.rotulo, ok: await executar(it.tool, it.args ?? {}, ROOT) })) }
    catch (e) { console.log(JSON.stringify({ doc_id: it.doc_id, tool: it.tool, rotulo: it.rotulo, erro: e.message })) }
  }
} else {
  console.error('uso: painel.mjs montar [--data AAAA-MM-DD] [--extra arquivo.json] | aplicar <pasta|arquivo.json>')
  process.exit(2)
}
