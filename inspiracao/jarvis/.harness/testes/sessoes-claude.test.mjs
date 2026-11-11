// Testes do coletor de sessões do Claude Code (pipeline/claude-sessoes.mjs + pipeline/lib/sessao-claude.mjs), com uma
// sessão fictícia numa pasta temporária. Rodar: npm test (em .harness/).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lerSessao, projetoDoCwd, notasDoMateus, resumoDaNota, textoDoTurno, trechoConfere, inerte } from '../../pipeline/lib/sessao-claude.mjs'
import { parseNote, wikilinksCorpo } from '../lib/vault.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
const ID = '0a1b2c3d-1111-2222-3333-444455556666'
const CWD = 'C:\\Users\\ana\\repos\\acme-portal\\.claude\\worktrees\\ajuste-login-9f9f9f'
const base = { sessionId: ID, cwd: CWD, gitBranch: 'claude/ajuste-login', isSidechain: false }
const L = (o) => JSON.stringify({ ...base, ...o })
const SESSAO = [
  L({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-10-21T13:00:00Z', message: { role: 'user', content: 'Ajusta o login da Acme\n<system-reminder>interno</system-reminder>' } }),
  L({ type: 'user', isMeta: true, timestamp: '2026-10-21T13:00:01Z', message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: …' }] } }),
  L({ type: 'assistant', timestamp: '2026-10-21T13:00:05Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'pensando' }] } }),
  L({ type: 'assistant', timestamp: '2026-10-21T13:00:06Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'src/login.ts' } }] } }),
  L({ type: 'user', timestamp: '2026-10-21T13:00:07Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'export function login() {}' }] } }),
  L({ type: 'assistant', timestamp: '2026-10-21T13:00:09Z', message: { role: 'assistant', content: [{ type: 'text', text: 'O login não valida o token.' }] } }),
  L({ type: 'assistant', isSidechain: true, timestamp: '2026-10-21T13:00:10Z', message: { role: 'assistant', content: [{ type: 'text', text: 'subagente' }] } }),
  L({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-10-21T13:05:00Z', message: { role: 'user', content: '<command-name>/commit-pr</command-name><command-args>login</command-args>' } }),
  JSON.stringify({ type: 'ai-title', aiTitle: 'Ajuste do login Acme', sessionId: ID }),
  'linha quebrada {',
].join('\n')

test('sessão: turnos na ordem, ferramenta com resultado, meta/sidechain/thinking fora, comando legível', () => {
  const s = lerSessao(SESSAO)
  assert.equal(s.id, ID)
  assert.equal(s.titulo, 'Ajuste do login Acme')
  assert.deepEqual(s.turnos.map((t) => t.autor), ['Mateus', 'Claude', 'Mateus'])
  assert.equal(s.turnos[0].texto, 'Ajusta o login da Acme')
  assert.deepEqual(s.turnos[1].partes.map((p) => (p.texto ? 'texto' : p.ferramenta.nome)), ['Read', 'texto'])
  assert.equal(s.turnos[1].ferramentas[0].entrada, 'file_path: src/login.ts')
  assert.equal(s.turnos[1].ferramentas[0].resultado, 'export function login() {}')
  assert.equal(s.turnos[2].texto, '/commit-pr login')
  assert.deepEqual(s.n, { pedidos: 2, respostas: 1, ferramentas: 1 })
  assert.equal(s.agendada, false)
})

test('sessão: [[link]] citado na conversa não vira aresta', () => {
  assert.equal(inerte('veja [[acme]] e [[ana-lima|Ana]]'), 'veja [\\[acme]] e [\\[ana-lima|Ana]]')
  assert.deepEqual(wikilinksCorpo(inerte('veja [[acme]]')), [])
})

test('sessão: agendada e projeto pelo cwd', () => {
  const ag = L({ type: 'user', origin: { kind: 'task-notification', subkind: 'scheduled-trigger' }, timestamp: '2026-10-21T10:30:00Z', message: { role: 'user', content: 'rodar ritual' } })
  assert.equal(lerSessao(ag).agendada, true)
  const primeiro = (txt) => lerSessao(L({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-10-21T12:00:00Z', message: { role: 'user', content: txt } })).rotina
  assert.equal(primeiro('faça o checkin'), true)
  assert.equal(primeiro('Rodar /ritual'), true)
  assert.equal(primeiro('/pos-reuniao FUP acme'), true)
  assert.equal(primeiro('quero entender o checkin do painel'), false)
  assert.deepEqual(projetoDoCwd(CWD), { projeto: 'acme-portal', worktree: 'ajuste-login-9f9f9f' })
  assert.deepEqual(projetoDoCwd('/home/ana/acme-portal'), { projeto: 'acme-portal', worktree: null })
})

test('coletor: grava nota + cópia íntegra, não regrava sem mudança, preserva Notas do Mateus', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-sessoes-'))
  const origem = path.join(tmp, 'projects')
  const vault = path.join(tmp, 'vault')
  await fs.mkdir(path.join(origem, 'C--Users-ana-repos-acme-portal'), { recursive: true })
  await fs.mkdir(path.join(origem, 'C--Users-ana-OneDrive---wehandle-jarvis'), { recursive: true })
  await fs.mkdir(path.join(vault, 'Daily'), { recursive: true })
  await fs.writeFile(path.join(vault, 'Daily', '2026-10-21.md'), '---\ntype: daily\n---\n')
  const jsonl = path.join(origem, 'C--Users-ana-repos-acme-portal', `${ID}.jsonl`)
  await fs.writeFile(jsonl, SESSAO)
  // sessão no próprio vault que só rodou /checkin: entra em Sessoes/, mas é rotina (sem extração)
  const ROT = 'ffffffff-0000-0000-0000-000000000000'
  await fs.writeFile(path.join(origem, 'C--Users-ana-OneDrive---wehandle-jarvis', `${ROT}.jsonl`),
    L({ sessionId: ROT, cwd: 'C:\\Users\\ana\\OneDrive - wehandle\\jarvis', type: 'user', origin: { kind: 'human' }, timestamp: '2026-10-21T12:00:00Z', message: { role: 'user', content: '<command-name>/checkin</command-name>' } }))
  const rodar = (...extra) => spawnSync(process.execPath, [path.join(RAIZ, 'pipeline', 'claude-sessoes.mjs'), ...extra, '--origem', origem, '--desde', '2000-01-01'], { env: { ...process.env, JARVIS_VAULT: vault }, encoding: 'utf8' })

  const r1 = rodar()
  assert.equal(r1.status, 0, r1.stderr)
  const o1 = JSON.parse(r1.stdout)
  assert.equal(o1.contagem.novas, 2)
  const rotina = o1.gravadas.find((g) => g.projeto === 'jarvis')
  assert.match(await fs.readFile(path.join(vault, rotina.arquivo), 'utf8'), /^rotina: true$/m)
  assert.equal(o1.pendentes_extracao.length, 1)
  assert.deepEqual(o1.pendentes_extracao[0], { arquivo: o1.gravadas.find((g) => g.projeto === 'acme-portal').arquivo, extraido_ate: null, ultimo_turno: 't0003' })
  const arquivo = path.join(vault, o1.pendentes_extracao[0].arquivo)
  assert.match(path.basename(arquivo), /^2026-10-21-acme-portal-ajuste-do-login-acme-0a1b2c3d\.md$/)
  const md = await fs.readFile(arquivo, 'utf8')
  const { fm } = parseNote(md)
  assert.equal(fm.type, 'sessao')
  assert.equal(fm.projeto, 'acme-portal')
  assert.equal(fm.cwd, CWD)
  assert.deepEqual(fm.relacionados, ['[[mateus-falcao]]', '[[2026-10-21]]'])
  assert.match(md, /### t0001 · 10:00 · Mateus\n\n> Ajusta o login da Acme/)
  assert.match(md, /- 🔧 \*\*Read\*\* — file_path: src\/login\.ts\n {2}- ↳ export function login\(\) \{\}\n\n> O login não valida o token\./)
  assert.doesNotMatch(md, /system-reminder|subagente|pensando/)
  assert.equal(await fs.readFile(path.join(vault, 'Inbox', '_raw', 'claude-code', 'acme-portal', `${ID}.jsonl`), 'utf8'), SESSAO)

  // o extrator-sessao leu até t0003: escreve Resumo + extraido_ate; nada pendente
  const extraido = md
    .replace('_(livre — preservado quando a sessão é regravada)_', 'Virou o card ACME-1.')
    .replace(/^extraido_ate: null$/m, 'extraido_ate: t0003').replace(/^extraido_em: null$/m, 'extraido_em: 2026-10-22T09:00:00-03:00')
    .replace(/(## Resumo\n\n)_\(preenchido[^\n]*\n/, '$1Ajuste do token no login da Acme.\n')
  await fs.writeFile(arquivo, extraido)
  const o2 = JSON.parse(rodar().stdout)
  assert.equal(o2.contagem.sem_mudanca, 2)
  assert.deepEqual(o2.pendentes_extracao, [])

  // a sessão cresceu: regrava preservando Resumo, extraido_ate e Notas, e volta a ficar pendente (t0004 novo)
  await fs.appendFile(jsonl, '\n' + L({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-10-21T13:10:00Z', message: { role: 'user', content: 'valeu' } }))
  const o3 = JSON.parse(rodar().stdout)
  assert.equal(o3.contagem.atualizadas, 1)
  assert.equal(o3.gravadas[0].arquivo, o1.pendentes_extracao[0].arquivo)
  assert.deepEqual(o3.pendentes_extracao[0], { arquivo: o3.gravadas[0].arquivo, extraido_ate: 't0003', ultimo_turno: 't0004' })
  const md3 = await fs.readFile(arquivo, 'utf8')
  assert.equal(notasDoMateus(md3), 'Virou o card ACME-1.')
  assert.equal(resumoDaNota(md3), 'Ajuste do token no login da Acme.')
  assert.equal(parseNote(md3).fm.created, fm.created)
  assert.match(md3, /> valeu/)

  // validar: evidência literal passa; paráfrase e turno inexistente reprovam
  await fs.mkdir(path.join(vault, 'Decisoes'), { recursive: true })
  const fonte = o3.gravadas[0].arquivo
  const dec = path.join(vault, 'Decisoes', '2026-10-21-validar-token-no-login.md')
  await fs.writeFile(dec, `---\ntype: decisao\n---\n## Evidências\n- "O login não valida o token." — Claude · fonte: ${fonte}#t0002\n`)
  const v1 = rodar('validar')
  assert.equal(v1.status, 0, v1.stdout)
  assert.equal(JSON.parse(v1.stdout).conferidas, 1)
  await fs.appendFile(dec, `- "o login falha sem token" — Claude · fonte: ${fonte}#t0002\n- "valeu" — Mateus · fonte: ${fonte}#t0099\n`)
  const v2 = rodar('validar', 'Decisoes/2026-10-21-validar-token-no-login.md')
  assert.equal(v2.status, 1)
  assert.deepEqual(JSON.parse(v2.stdout).erros.map((e) => e.erro), ['trecho não é literal do turno', 'sessão ou turno não existe'])
})

test('sessão: trecho com recorte "…" confere em ordem', () => {
  assert.equal(trechoConfere('Ficou definido … só com aval', 'Ficou   definido que a integração sai só com aval da Ana'), true)
  assert.equal(trechoConfere('só com aval … Ficou definido', 'Ficou definido que a integração sai só com aval'), false)
  assert.equal(textoDoTurno('### t0001 · 10:00 · Mateus\n\n> oi\n> tudo\n\n### t0002 · 10:01 · Claude\n\n> ok\n', 't0001').trim(), 'oi\ntudo')
})
