// Testes da escrita do painel (jarvis-escrita) contra uma CÓPIA da fixture fictícia — a fixture nunca é alterada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../lib/escrita.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.join(AQUI, 'fixture')
const TPL = path.join(AQUI, '..', '..', 'System', 'templates', 'daily.md')

async function copiaDaFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-escrita-'))
  await fs.cp(FIX, dir, { recursive: true })
  await fs.mkdir(path.join(dir, 'System', 'templates'), { recursive: true })
  await fs.copyFile(TPL, path.join(dir, 'System', 'templates', 'daily.md'))
  return dir
}

const TODO = '# TODO\n\n## P1 Fazer agora\n- [ ] Enviar ata | prazo: 2026-10-10 | ctx: [[acme]]\n\n## P2 Agendar\n- [ ] Preparar kickoff | ctx: [[beta]]\n\n## P3 Delegar\n\n## P4 Talvez\n\n## Aguardando\n- [ ] Base revisada | quem: [[ana-lima]] | cobrar: 2026-10-06\n\n## Concluídas\n- [x] Revisar perfis | feito: 2026-10-01\n'

test('lerTodo: quadrante pela seção e id estável pela linha', () => {
  const t = E.lerTodo(TODO)
  assert.deepEqual(t.map((x) => x.quadrante), ['P1', 'P2', 'AG', 'OK'])
  assert.equal(t[0].id, E.idLinha('- [ ] Enviar ata | prazo: 2026-10-10 | ctx: [[acme]]'))
  assert.equal(E.idLinha('- [x] a | b: c'), E.idLinha('- [ ] a | b: c'))
})

test('todoCriar: entra no fim da seção, com fonte e criado; quadrante vazio também recebe', () => {
  const r = E.todoCriar(TODO, { texto: 'Revisar health | score', quadrante: 'P3', prazo: '2026-10-12', ctx: '[[acme]]', data: '2026-10-11' })
  assert.match(r.txt, /## P3 Delegar\n- \[ \] Revisar health \/ score \| prazo: 2026-10-12 \| ctx: \[\[acme\]\] \| fonte: manual \| criado: 2026-10-11\n/)
  const semP3 = E.todoCriar(TODO.replace('## P3 Delegar\n\n', ''), { texto: 'Nova rápida', quadrante: 'P3', data: '2026-10-11' })
  assert.match(semP3.txt, /## P2 Agendar\n- \[ \] Preparar kickoff[^\n]*\n\n## P3 Delegar \/ rápido \(urgente, pouco importante\)\n- \[ \] Nova rápida/)
  assert.throws(() => E.todoCriar(TODO, { texto: 'x y z', quadrante: 'OK' }), /quadrante inválido/)
  assert.throws(() => E.todoCriar(TODO, { texto: 'abc', prazo: 'amanhã' }), /AAAA-MM-DD/)
})

test('todoConcluir move para Concluídas com feito:; reabrir volta e tira o feito', () => {
  const id = E.lerTodo(TODO)[1].id
  const c = E.todoConcluir(TODO, id, '2026-10-11')
  assert.doesNotMatch(c.txt, /## P2 Agendar\n- \[ \] Preparar kickoff/)
  assert.match(c.txt, /- \[x\] Revisar perfis \| feito: 2026-10-01\n- \[x\] Preparar kickoff \| ctx: \[\[beta\]\] \| feito: 2026-10-11/)
  const r = E.todoReabrir(c.txt, c.id, 'P1')
  assert.match(r.txt, /## P1 Fazer agora\n- \[ \] Enviar ata[^\n]*\n- \[ \] Preparar kickoff \| ctx: \[\[beta\]\]\n/)
  assert.equal(E.lerTodo(r.txt).length, 4)
})

test('todoMover e todoEditar; id velho recusa (a linha mudou)', () => {
  const id = E.lerTodo(TODO)[0].id
  const m = E.todoMover(TODO, id, 'P4')
  assert.equal(E.lerTodo(m.txt).find((t) => t.id === m.id).quadrante, 'P4')
  const e = E.todoEditar(m.txt, m.id, { prazo: '2026-11-01', ctx: '' })
  assert.match(e.txt, /- \[ \] Enviar ata \| prazo: 2026-11-01\n/)
  assert.throws(() => E.todoEditar(e.txt, m.id, { texto: 'novo' }), /o TODO mudou/)
})

test('Daily: trocarSecao só mexe na seção; anotar substitui o placeholder', async () => {
  const tpl = await fs.readFile(TPL, 'utf8')
  const d = E.novoDaily(tpl, '2026-10-21', '2026-10-21T09:00:00-03:00')
  assert.match(d, /^# 2026-10-21 — quarta-feira$/m)
  const c = E.trocarSecao(d, 'Check-in', '**Status**: confirmado 09:10')
  assert.equal(E.lerSecao(c, 'Check-in'), '**Status**: confirmado 09:10')
  assert.equal(E.lerSecao(c, 'Anotações do dia'), '(livre para o Mateus)')
  const a = E.anotar(E.anotar(c, 'ligar para a acme', '10:00'), 'ok', '10:05')
  assert.equal(E.lerSecao(a, 'Anotações do dia'), '- 10:00 ligar para a acme\n- 10:05 ok')
  assert.match(a, /## Checkout\r?\n_\(preenchido pelo \/checkout às 18:00\)_/)
  assert.equal(/\r\n/.test(tpl), /\r\n/.test(a)) // mantém o fim de linha do arquivo
})

test('executar: painel, check-in, tarefa e captura numa cópia da fixture, com log.md', async () => {
  const dir = await copiaDaFixture()
  const p = await E.executar('jarvis_painel', { data: '2026-10-15' }, dir)
  assert.ok(p.todo.length >= 4 && p.todo.every((t) => t.id && t.quadrante))
  assert.ok(p.compromissos.length >= 1)
  assert.equal(p.daily.existe, false)
  assert.ok(p.clientes.acme && p.clientes.beta)
  assert.ok(p.entrada.some((e) => e.fonte === 'manual' && e.titulo))
  assert.ok(p.paginas.some((g) => g.tipo === 'decisao' && g.corpo))
  assert.ok(Array.isArray(p.log))
  const r = await E.executar('jarvis_checkin_gravar', { data: '2026-10-15', status: 'confirmado', intencao: 'Fechar a ata', top3: [{ texto: 'Mandar a ata', ctx: 'acme', bloco: '09:30–10:30' }], blocos: [{ inicio: '09:30', fim: '10:30', rotulo: 'Ata' }], riscos: ['QBR sem pré-contexto'] }, dir)
  assert.equal(r.criado, true)
  const daily = await fs.readFile(path.join(dir, 'Daily', '2026-10-15.md'), 'utf8')
  assert.match(daily, /\*\*Intenção\*\*: Fechar a ata/)
  assert.match(daily, /1\. Mandar a ata — \[\[acme\]\] · bloco 09:30–10:30/)
  const id = p.todo.find((t) => t.quadrante === 'P1').id
  await E.executar('jarvis_tarefa', { acao: 'concluir', id }, dir)
  await E.executar('jarvis_tarefa', { acao: 'criar', texto: 'Cobrar a base', quadrante: 'P3' }, dir)
  await assert.rejects(E.executar('jarvis_tarefa', { acao: 'concluir', id }, dir), /o TODO mudou/)
  const c = await E.executar('jarvis_capturar', { texto: 'ideia solta' }, dir)
  assert.match(await fs.readFile(path.join(dir, c.arquivo), 'utf8'), /origem: painel/)
  const log = await fs.readFile(path.join(dir, 'log.md'), 'utf8')
  assert.equal((log.match(/\] painel \| /g) ?? []).length, 4)
  await fs.rm(dir, { recursive: true, force: true })
})

test('servidor stdio: lista as 5 ferramentas e marca só o painel como leitura', async () => {
  const dir = await copiaDaFixture()
  const srv = spawn(process.execPath, [path.join(AQUI, '..', 'escrita.mjs')], { env: { ...process.env, JARVIS_VAULT: dir } })
  const out = []
  srv.stdout.on('data', (b) => out.push(...b.toString().split('\n').filter(Boolean).map((l) => JSON.parse(l))))
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n')
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'jarvis_painel', arguments: { data: '2026-10-15' } } }) + '\n')
  await new Promise((r) => { const t = setInterval(() => { if (out.length >= 3) { clearInterval(t); r() } }, 20) })
  srv.kill()
  const tools = out.find((m) => m.id === 2).result.tools
  assert.deepEqual(tools.map((t) => t.name).sort(), ['jarvis_anotar', 'jarvis_capturar', 'jarvis_checkin_gravar', 'jarvis_painel', 'jarvis_tarefa'])
  assert.deepEqual(tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name), ['jarvis_painel'])
  assert.ok(out.find((m) => m.id === 3).result.structuredContent.todo.length >= 4)
  await fs.rm(dir, { recursive: true, force: true })
})
