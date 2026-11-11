// Testes do harness contra a fixture (dados fictícios). Rodar: npm test (em .harness/) ou node --test ".harness/testes/*.test.mjs"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseNote, wikilinks, wikilinksCorpo, evidencias, carregarGrafo, resolverNo, tipoDe, semCercas } from '../lib/vault.mjs'
import { dobrar, padrao } from '../lib/grep.mjs'
import { BM25, tokenizar } from '../lib/indice.mjs'
import * as Q from '../lib/consultas.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.join(AQUI, 'fixture')
const ctx = () => Q.contexto({ root: FIX, forcar: true })

test('parseNote: escalar, lista flow, lista em bloco, comentário e wikilink entre aspas', () => {
  const { fm, body } = parseNote('---\na: 1\nb: "[[x]]"\nc: ["[[y]]", "[[z|Z]]"]\nd:\n  - "[[w]]"\n  - k\ne: texto # comentário\nf: [[solto]]\n---\n# T\ncorpo')
  assert.equal(fm.a, 1)
  assert.equal(fm.b, '[[x]]')
  assert.deepEqual(fm.c, ['[[y]]', '[[z|Z]]'])
  assert.deepEqual(fm.d, ['[[w]]', 'k'])
  assert.equal(fm.e, 'texto')
  assert.equal(fm.f, '[[solto]]')
  assert.match(body, /corpo/)
})

test('wikilinks: rótulo, seção e caminho viram a chave (basename)', () => {
  assert.deepEqual(wikilinks('[[a]] [[b|B]] [[c#sec]] [[System/config/profile|perfil]]').map((x) => x.para), ['a', 'b', 'c', 'profile'])
})

test('evidencias: só citação literal + ponteiro é válida', () => {
  const ev = evidencias('## Evidências\n- "dito assim" — Fulano · fonte: Inbox/_raw/x.md#t1\n- paráfrase solta\n## Outra\n- "fora" · fonte: y')
  assert.equal(ev.length, 2)
  assert.equal(ev[0].cit, 'dito assim')
  assert.equal(ev[0].autor, 'Fulano')
  assert.equal(ev[0].ponteiro, 'Inbox/_raw/x.md#t1')
  assert.equal(ev[0].valida, true)
  assert.equal(ev[1].valida, false)
})

test('grafo: nós, tipos pela pasta/frontmatter, arestas e backlinks', async () => {
  const g = await carregarGrafo(FIX)
  assert.equal(g.nos.get('acme').tipo, 'cliente')
  assert.equal(g.nos.get('2026-10-01-fup-acme').data, '2026-10-01')
  const parts = g.saidas.get('2026-10-01-fup-acme').filter((e) => e.rel === 'participantes').map((e) => e.para)
  assert.deepEqual(parts.sort(), ['ana-lima', 'bruno-souza', 'mateus-falcao'])
  // org em texto puro vira aresta
  assert.ok(g.saidas.get('ana-lima').some((e) => e.rel === 'org' && e.para === 'acme'))
  // backlink tipado
  assert.ok(g.entradas.get('2026-10-01-fup-acme').some((e) => e.rel === 'firmado_em' && e.de === '2026-10-01-ana-lima-enviar-base'))
  // link quebrado reportado, não vira aresta
  assert.ok(g.quebrados.some((q) => q.para === 'fantasma'))
})

test('grafo: ignora System/Archive, Inbox/_raw e não vira nó o index/Inbox', async () => {
  const g = await carregarGrafo(FIX)
  assert.equal(g.nos.has('arquivado'), false)
  assert.equal(g.nos.has('111'), false)
  assert.equal(g.nos.has('index'), false)
  assert.equal(g.nos.has('captura-pendente'), false)
  assert.equal([...g.arquivosTxt.keys()].some((k) => k.startsWith('System/Archive') || k.startsWith('Inbox/_raw')), false)
})

test('fundir_em: duplicata redireciona as arestas para o canônico', async () => {
  const g = await carregarGrafo(FIX)
  assert.equal(g.redir.get('integracao-portal-dup'), 'integracao-portal-acme')
  const t = g.saidas.get('2026-10-01-fup-acme').find((e) => e.rel === 'temas')
  assert.equal(t.para, 'integracao-portal-acme')
  assert.equal(t.via, 'integracao-portal-dup')
  assert.equal(resolverNo(g, 'integracao-portal-dup'), 'integracao-portal-acme')
})

test('resolverNo: alias e nome sem acento', async () => {
  const g = await carregarGrafo(FIX)
  assert.equal(resolverNo(g, 'ACME Ltda'), 'acme')
  assert.equal(resolverNo(g, 'Aninha'), 'ana-lima')
  assert.equal(resolverNo(g, 'mateus falcao'), 'mateus-falcao')
  assert.equal(resolverNo(g, '[[beta]]'), 'beta')
  assert.equal(resolverNo(g, 'acme', 'pessoa'), null)
})

test('grep: sem acento e sem caixa; nunca acha bruto nem arquivo', async () => {
  assert.equal(dobrar('Integração'), 'integracao')
  assert.ok(padrao('integracao').test(dobrar('a Integração')))
  const c = await ctx()
  const r = await Q.grep(c, { termo: 'INTEGRACAO' })
  assert.match(r, /Notes\/reuniao-sem-pauta-vira-status\.md:\d+/)
  assert.match(await Q.grep(c, { termo: 'SEGREDO_BRUTO|SEGREDO_ARQUIVADO' }), /0 ocorrências/)
  assert.match(await Q.grep(c, { termo: 'portal', exigir: ['travado'], tipo: 'reuniao' }), /2026-10-15-fup-acme/)
})

test('BM25: ranqueia pelo termo e tokeniza sem acento/plural', () => {
  assert.deepEqual(tokenizar('Integrações do Portal'), ['integracao', 'portal'])
  const bm = new BM25()
  bm.add('a', 'portal de fornecedores travado portal')
  bm.add('b', 'kickoff de implantação')
  assert.equal(bm.buscar('portal')[0].id, 'a')
  assert.equal(bm.buscar('nada disso').length, 0)
})

test('jarvis_buscar: acha o tema pelo alias e filtra por cliente', async () => {
  const c = await ctx()
  const r = await Q.buscar(c, { pergunta: 'portal de fornecedores', cliente: 'acme' })
  assert.match(r, /\[\[integracao-portal-acme\]\]/)
  assert.doesNotMatch(r, /kickoff-beta/)
})

test('jarvis_reunioes: por pessoa (participante x citada), cliente e período', async () => {
  const c = await ctx()
  const r = await Q.reunioes(c, { pessoa: 'ana-lima' })
  assert.match(r, /2 reunião/)
  assert.match(r, /2026-10-01-fup-acme\]\] .*\(participante\)/)
  assert.match(r, /2026-10-15-fup-acme\]\] .*\(citado no corpo\)/)
  assert.match(await Q.reunioes(c, { cliente: 'beta' }), /1 reunião/)
  assert.match(await Q.reunioes(c, { desde: '2026-10-05', ate: '2026-10-12' }), /kickoff-beta/)
  assert.match(await Q.reunioes(c, { tema: 'integracao-portal-acme' }), /2 reunião/)
})

test('jarvis_compromissos: abertos, vencidos, por pessoa e TODO Aguardando', async () => {
  const c = await ctx()
  const r = await Q.compromissos(c, { ref: '2026-10-20' })
  assert.match(r, /Nós Compromissos\/: 3 \(1 vencidos\)/)
  assert.match(r, /VENCIDO \[\[2026-10-01-ana-lima-enviar-base\]\]/)
  assert.doesNotMatch(r, /revisar-perfis/)
  const ana = await Q.compromissos(c, { pessoa: 'Ana Lima', ref: '2026-10-20' })
  assert.match(ana, /enviar-base/)
  assert.match(ana, /Base de fornecedores revisada .*quem \[\[ana-lima\]\].*cobrar 2026-10-06/)
  assert.match(await Q.compromissos(c, { status: 'concluido', incluir_todo: false }), /revisar-perfis/)
  assert.match(await Q.compromissos(c, { cliente: 'acme', ref: '2026-10-20', incluir_todo: false }), /Nós Compromissos\/: 2/)
})

test('jarvis_compromissos: abertos = aberto|em_andamento|aguardando (D3); "pendente" fica de fora', async () => {
  const c = await ctx()
  const r = await Q.compromissos(c, { ref: '2026-10-20', incluir_todo: false })
  assert.match(r, /validar-acessos-beta\]\] .* · aguardando ·/)
  assert.doesNotMatch(r, /status-legado/)
  assert.match(await Q.compromissos(c, { status: 'todos', incluir_todo: false }), /status-legado/)
  assert.match(await Q.compromissos(c, { status: 'aguardando', incluir_todo: false }), /Nós Compromissos\/: 1\b/)
})

test('jarvis_compromissos: linha do TODO com ctx em compromisso já listado não sai duas vezes', async () => {
  const c = await ctx()
  const r = await Q.compromissos(c, { ref: '2026-10-20' })
  const vezes = (re) => (r.match(re) ?? []).length
  assert.equal(vezes(/Mandar a ata da FUP/g), 1)
  assert.match(r, /\[\[2026-10-15-mateus-falcao-mandar-ata\]\] Mandar a ata da FUP para a ACME .*· TODO\.md:\d+/)
  assert.match(r, /TODO\.md: 3 .*1 linha\(s\) omitida\(s\)/)
  // se o compromisso não está na lista (filtro de status), a linha do TODO não é omitida
  const conc = await Q.compromissos(c, { status: 'todos', pessoa: 'ana-lima', ref: '2026-10-20' })
  assert.doesNotMatch(conc, /omitida/)
  const todosT = await Q.compromissos(c, { status: 'cancelado' })
  assert.doesNotMatch(todosT, /mandar-ata/)
})

test('código: wikilinks e evidências em cerca ou inline são ignorados', async () => {
  assert.deepEqual(wikilinksCorpo('a `[[x]]` b [[y]]\n```\n[[z]]\n```\n``c `[[w]]` ``').map((x) => x.para), ['y'])
  assert.equal(semCercas('a\n```js\nb\n```\nc').split('\n').length, 5)
  assert.deepEqual(evidencias('```\n## Evidências\n- "x" — A · fonte: y#t1\n```\n'), [])
  const g = await carregarGrafo(FIX)
  const n = g.nos.get('exemplo-em-codigo-nao-vira-aresta')
  assert.equal(n.titulo, 'Exemplo em código não vira aresta')
  assert.equal(n.evidencias.length, 0)
  for (const falso of ['link-inline-falso', 'link-inline-duplo', 'link-em-cerca-falso', 'outro-falso', 'ainda-falso']) {
    assert.equal(g.quebrados.some((q) => q.para === falso), false, falso)
  }
  assert.ok(g.saidas.get('exemplo-em-codigo-nao-vira-aresta').some((e) => e.rel === 'menciona' && e.para === 'beta'))
})

test('evidências: formato D1 e legado "meetrox:<id> turno:tNNNN"', () => {
  const ev = evidencias([
    '## Evidências',
    '- "dito D1" — Ana Lima · fonte: System/Archive/raw/2026-10/meetrox/1234567/turnos.txt#t0042',
    '- "dito legado" — meetrox:1234567 turno:t0042 · `System/Archive/raw/2026-10/meetrox/1234567/turnos.txt`',
    '- "legado sem caminho" — meetrox:1234567 turno:t0007',
    '- "chat" — Bruno Souza · fonte: Inbox/_raw/teams/1234567/mensagens.json#msg-1234567',
  ].join('\n'))
  assert.deepEqual(ev.map((e) => e.valida), [true, true, true, true])
  assert.equal(ev[0].autor, 'Ana Lima')
  assert.equal(ev[0].ancora, 't0042')
  assert.equal(ev[0].formato, 'd1')
  assert.equal(ev[1].autor, null)
  assert.equal(ev[1].ponteiro, 'System/Archive/raw/2026-10/meetrox/1234567/turnos.txt#t0042')
  assert.equal(ev[1].formato, 'legado')
  assert.equal(ev[2].ponteiro, 'meetrox:1234567 turno:t0007')
  assert.equal(ev[2].sistema, 'meetrox')
  assert.equal(ev[2].item, '1234567')
  assert.equal(ev[3].ancora, 'msg-1234567')
})

test('jarvis_evidencias: turnos.txt por âncora, fallback Inbox/_raw ↔ System/Archive/raw e legado', async () => {
  const c = await ctx()
  const r = await Q.evidenciasNo(c, { id: '2026-10-01-ana-lima-enviar-base' })
  const linhas = r.split('\n').filter((l) => l.startsWith('  - ['))
  assert.equal(linhas.length, 6)
  assert.match(linhas[0], /^\s+- \[OK literal\]/) // bruto legado 111.md#t0020
  assert.match(linhas[1], /^\s+- \[OK literal\]/) // D1 Inbox/_raw/.../turnos.txt#t0020
  assert.match(linhas[2], /fora do turno t0012/) // citação existe, mas em outro turno
  assert.match(linhas[3], /^\s+- \[OK literal\]/) // Inbox/_raw já arquivado → System/Archive/raw
  assert.match(linhas[4], /^\s+- \[OK literal\]/) // legado com caminho
  assert.match(linhas[5], /^\s+- \[OK literal\]/) // legado sem caminho: procura o bruto
})

test('evidências: aspas e apóstrofo dentro do trecho não cortam a citação', () => {
  const ev = evidencias([
    '## Evidências',
    '- "Ela disse "sim" na hora, e o "não" ficou para depois." — Ana Lima · fonte: Inbox/_raw/meetrox/111/turnos.txt#t0001',
    "- 'It's the acme's call' – Bruno Souza · fonte: Inbox/_raw/meetrox/111/turnos.txt#t0002",
    '- “O portal da acme é o “principal”, tá?” - Ana Lima · fonte: Inbox/_raw/meetrox/111/turnos.txt#t0003',
    '- "curto" · fonte: Inbox/_raw/x.md#t1',
  ].join('\n'))
  assert.equal(ev[0].cit, 'Ela disse "sim" na hora, e o "não" ficou para depois.')
  assert.equal(ev[0].autor, 'Ana Lima')
  assert.equal(ev[0].ancora, 't0001')
  assert.equal(ev[1].cit, "It's the acme's call")
  assert.equal(ev[1].autor, 'Bruno Souza')
  assert.equal(ev[2].cit, 'O portal da acme é o “principal”, tá?')
  assert.equal(ev[2].autor, 'Ana Lima')
  assert.equal(ev[3].cit, 'curto')
  assert.equal(ev[3].valida, true)
})

test('jarvis_evidencias: mensagens.txt#<messageId> confere dentro do bloco da mensagem', async () => {
  const cam = 'System/Archive/raw/2026-10/outlook/2026-10-05_status-acme/mensagens.txt'
  const ev = evidencias([
    '## Evidências',
    `- "Consigo revisar os perfis ate dia 25." — Bruno Souza · fonte: ${cam}#msg-0002`,
    `- "Consigo revisar os perfis ate dia 25." — Bruno Souza · fonte: ${cam}#msg-0001`,
    `- "Consigo revisar os perfis ate dia 25." — Bruno Souza · fonte: ${cam}#msg-9999`,
    `- "Frase que ninguém escreveu." — Bruno Souza · fonte: ${cam}#msg-0002`,
    `- "Preciso disso para o portal." — Ana Lima · fonte: ${cam}#msg-0001`,
  ].join('\n'))
  const r = await Promise.all(ev.map((e) => Q.conferirEvidencia(FIX, e)))
  assert.equal(r[0], 'OK literal')
  assert.equal(r[1], 'OK literal, mas fora da mensagem msg-0001')
  assert.match(r[2], /mensagem msg-9999 não existe/)
  assert.equal(r[3], 'NÃO ENCONTRADA no bruto')
  assert.equal(r[4], 'OK literal')
  assert.equal(Q.mensagemDoBruto('[a] x\n[link](u) segue\n[b] y', 'a').trim(), 'x\n[link](u) segue')
})

test('jarvis_evidencias: bruto de /aprender em System/Archive/raw/AAAA-MM/aprender/<slug>/', async () => {
  const ev = evidencias([
    '## Evidências',
    '- "satura a frequencia do termo" — BM25 · fonte: System/Archive/raw/2026-10/aprender/bm25-na-pratica/texto-extraido.md',
    '- "satura a frequencia do termo" — BM25 · fonte: System/Archive/raw/2026-10/aprender/bm25-na-pratica/',
    '- "satura a frequencia do termo" — BM25 · fonte: System/Archive/raw/aprender/bm25-na-pratica/texto-extraido.md',
    '- "Trecho antigo guardado" — Fonte · fonte: System/Archive/raw/2026-09/aprender/curso-antigo/notas.txt',
    '- "não está lá" — BM25 · fonte: System/Archive/raw/2026-10/aprender/bm25-na-pratica/',
    '- "x" — BM25 · fonte: System/Archive/raw/2026-10/aprender/inexistente/',
  ].join('\n'))
  const r = await Promise.all(ev.map((e) => Q.conferirEvidencia(FIX, e)))
  assert.deepEqual(r, ['OK literal', 'OK literal', 'OK literal', 'OK literal', 'NÃO ENCONTRADA no bruto', 'bruto ausente nesta máquina'])
})

test('Aprender (D2): só <slug>/<slug>.md é curso; *-fontes.md não vira curso', async () => {
  assert.equal(tipoDe('Aprender/bm25-na-pratica/bm25-na-pratica.md', {}, 'bm25-na-pratica'), 'curso')
  assert.equal(tipoDe('Aprender/bm25-na-pratica/bm25-na-pratica-fontes.md', {}, 'bm25-na-pratica-fontes'), 'nota')
  assert.equal(tipoDe('Aprender/fila.md', {}, 'fila'), 'nota')
  assert.equal(tipoDe('Aprender/x/x-fontes.md', { type: 'curso' }, 'x-fontes'), 'curso') // type do frontmatter manda
  const g = await carregarGrafo(FIX)
  assert.equal(g.nos.get('bm25-na-pratica').tipo, 'curso')
  assert.equal(g.nos.get('bm25-na-pratica-fontes').tipo, 'nota')
  assert.equal([...g.nos.values()].filter((n) => n.tipo === 'curso').length, 1)
  assert.equal(resolverNo(g, '[[bm25-na-pratica]]', 'curso'), 'bm25-na-pratica')
  const c = await ctx()
  assert.match(await Q.no(c, { id: 'bm25-na-pratica' }), /tipo curso/)
  assert.match(await Q.cobertura(c), /- curso: 1/)
})

test('jarvis_temas e jarvis_decisoes', async () => {
  const c = await ctx()
  const t = await Q.temas(c, { recorrentes: true })
  assert.match(t, /integracao-portal-acme\]\] .*travado · 2 reunião/)
  assert.doesNotMatch(t, /integracao-portal-dup/)
  const d = await Q.decisoes(c, { cliente: 'acme' })
  assert.match(d, /tomada em \[\[2026-10-01-fup-acme\]\]/)
  assert.match(d, /evidência: "Nenhuma exceção nova/)
})

test('jarvis_timeline: ordem por data, só o que liga ao nó; vizinhos não atravessa hub', async () => {
  const c = await ctx()
  const tl = await Q.timeline(c, { id: 'acme' })
  assert.ok(tl.indexOf('\n2026-10-01') < tl.indexOf('\n2026-10-15'))
  assert.doesNotMatch(tl, /kickoff-beta/)
  const v = await Q.vizinhos(c, { id: 'ana-lima', profundidade: 2 })
  // acme é hub: não expande para a reunião da Beta via cliente
  assert.doesNotMatch(v, /kickoff-beta/)
  assert.match(v, /2026-10-01-fup-acme/)
})

test('jarvis_evidencias: confere literal no bruto', async () => {
  const c = await ctx()
  const r = await Q.evidenciasNo(c, { id: '2026-10-01-excecao-so-com-aval-da-ana' })
  assert.match(r, /\[OK literal\] "Nenhuma exceção nova/)
  assert.match(r, /\[NÃO ENCONTRADA no bruto\] "Frase que não está/)
  assert.match(r, /\[sem citação\/ponteiro\]/)
})

test('jarvis_cobertura: contagens, Inbox pendente, quebrados', async () => {
  const c = await ctx()
  const r = await Q.cobertura(c)
  assert.match(r, /- reuniao: 3 · 2026-10-01 a 2026-10-15/)
  assert.match(r, /Inbox pendente \(não ingerido\): manual 1/)
  assert.match(r, /brutos em Inbox\/_raw: 2/)
  assert.match(r, /fantasma ← acme/)
})

test('intervalo: atalhos de período', () => {
  assert.deepEqual(Q.intervalo({ periodo: 'semana' }, '2026-10-22'), { desde: '2026-10-19', ate: '2026-10-25' })
  assert.deepEqual(Q.intervalo({ periodo: 'semana-passada' }, '2026-10-22'), { desde: '2026-10-12', ate: '2026-10-18' })
  assert.throws(() => Q.intervalo({ desde: '22/10/2026' }))
})

test('servidor MCP: initialize, tools/list e tools/call (stdio)', async () => {
  const p = spawn(process.execPath, [path.join(AQUI, '..', 'mcp.mjs')], { env: { ...process.env, JARVIS_VAULT: FIX }, stdio: ['pipe', 'pipe', 'pipe'] })
  const respostas = new Map()
  let buf = ''
  p.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); respostas.set(m.id, m) } }
  })
  const enviar = (m) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
  enviar({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
  enviar({ method: 'notifications/initialized' })
  enviar({ id: 2, method: 'tools/list' })
  enviar({ id: 3, method: 'tools/call', params: { name: 'jarvis_no', arguments: { id: 'acme' } } })
  enviar({ id: 4, method: 'tools/call', params: { name: 'jarvis_no', arguments: { id: 'nao-existe-xyz' } } })
  enviar({ id: 5, method: 'tools/call', params: { name: 'nao_existe' } })
  const t0 = Date.now()
  while (respostas.size < 5 && Date.now() - t0 < 10_000) await new Promise((r) => setTimeout(r, 25))
  p.kill()
  assert.equal(respostas.get(1).result.serverInfo.name, 'jarvis')
  const nomes = respostas.get(2).result.tools.map((t) => t.name)
  for (const n of ['jarvis_cobertura', 'jarvis_buscar', 'jarvis_grep', 'jarvis_no', 'jarvis_vizinhos', 'jarvis_reunioes', 'jarvis_compromissos', 'jarvis_temas', 'jarvis_decisoes', 'jarvis_timeline']) assert.ok(nomes.includes(n), n)
  assert.ok(respostas.get(2).result.tools.every((t) => t.annotations.readOnlyHint === true))
  assert.match(respostas.get(3).result.content[0].text, /backlinks/)
  assert.equal(respostas.get(4).result.isError, true)
  assert.equal(respostas.get(5).error.code, -32602)
})
