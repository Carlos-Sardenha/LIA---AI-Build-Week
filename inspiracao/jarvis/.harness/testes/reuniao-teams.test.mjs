// Testes do fluxo transcrição do Teams → grafo (pipeline/teams-transcricao.mjs + pipeline/grafo-reuniao.mjs), com dados
// fictícios numa cópia temporária da fixture. Rodar: npm test (em .harness/).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { turnos, textosDaResposta, formatarTurnos, segmentos } from '../../pipeline/lib/transcricao-teams.mjs'
import * as G from '../../pipeline/lib/grafo-reuniao.mjs'
import { parseNote } from '../lib/vault.mjs'
import * as Q from '../lib/consultas.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
const FIX = path.join(AQUI, 'fixture')

const VTT = [
  'WEBVTT',
  '',
  '0a1b/12-0',
  '00:00:03.120 --> 00:00:05.480',
  '<v Ana Lima>Bom dia, pessoal.</v>',
  '',
  '0a1b/13-0',
  '00:00:05.500 --> 00:00:09.000',
  '<v Ana Lima>Ficou definido que a integração do portal sai &amp; volta só com o meu de acordo.</v>',
  '',
  '00:00:10.000 --> 00:00:14.000',
  '<v Mateus Falcão>Eu mando a ata até 2026-10-22, pode deixar.</v>',
  '',
  '00:01:02.000 --> 00:01:04.000',
  '<v Bruno Souza>Eu reviso os perfis de acesso na semana que vem.</v>',
].join('\n')
const RESPOSTA = JSON.stringify({ meeting: { id: 'MSoxMjM0NTY3', subject: 'FUP ACME' }, transcripts: [{ id: 'tr-1', content: VTT }] })

test('transcrição Teams: WebVTT com <v>, entidades HTML, falas consecutivas fundidas', () => {
  const ts = turnos(RESPOSTA)
  assert.equal(ts.length, 3)
  assert.equal(ts[0].falante, 'Ana Lima')
  assert.equal(ts[0].texto, 'Bom dia, pessoal. Ficou definido que a integração do portal sai & volta só com o meu de acordo.')
  assert.equal(ts[1].t, 10)
  assert.equal(formatarTurnos(ts).split('\n')[2], 't0003 01:02 Bruno Souza: Eu reviso os perfis de acesso na semana que vem.')
})

test('transcrição Teams: fallbacks (cue "Nome: fala", texto exportado, resposta vazia)', () => {
  const s = segmentos('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAna Lima: oi\n')
  assert.deepEqual(s.map((x) => [x.falante, x.texto]), [['Ana Lima', 'oi']])
  const e = segmentos('Ana Lima   0:03\nPrimeira fala\ncontinua\nBruno Souza   1:05:10\nSegunda')
  assert.deepEqual(e.map((x) => [x.falante, x.t, x.texto]), [['Ana Lima', 3, 'Primeira fala continua'], ['Bruno Souza', 3910, 'Segunda']])
  assert.deepEqual(textosDaResposta({ note: 'no transcripts', transcripts: [] }), [])
  assert.equal(turnos({ transcripts: [{ nested: { vtt: VTT } }] }).length, 3)
})

test('grafo-reuniao: literal, chunks, merge por similaridade, TODO', () => {
  assert.ok(G.contemLiteral('Eu mando a ata até sexta, pode deixar.', '“mando a ata … pode deixar”'))
  assert.ok(!G.contemLiteral('Eu mando a ata até sexta.', 'Eu envio a ata'))
  const ts = G.lerTurnos('t0001 00:01 Ana: a b c\nt0002 00:05 Bruno: ' + 'x'.repeat(30) + '\nt0003 00:09 Ana: fim')
  assert.deepEqual(G.chunks(ts, 25).map((c) => c.turnos.map((t) => t.id)), [['t0001'], ['t0002'], ['t0003']])
  const { extracao, relatorio } = G.fundir([
    { chunk: 'chunk-001', json: { entities: [{ type: 'Tema', id: 'portal-acme', attributes: { titulo: 'Integração do portal ACME' } }], relationships: [] } },
    { chunk: 'chunk-002', json: { entities: [{ type: 'Tema', id: 'integracao-do-portal-acme', attributes: { titulo: 'Integração do portal da ACME' } }], relationships: [{ type: 'TRATADO_EM', sourceId: 'integracao-do-portal-acme', sourceType: 'Tema', targetId: 'r', targetType: 'Reuniao', attributes: {} }] } },
  ])
  assert.equal(extracao.entities.length, 1)
  assert.equal(extracao.entities[0].id, 'portal-acme')
  assert.equal(extracao.relationships[0].sourceId, 'portal-acme')
  assert.equal(relatorio.unificados.length, 1)
  const todo = '## P1 Fazer agora\n- [ ] a\n\n## P2 Agendar\n- [ ] b\n\n## Aguardando\n'
  const t1 = G.linhaTodo(todo, { compId: 'c1', oque: 'Mandar ata', prazo: '2099-01-01', dono: 'mateus-falcao', assumidos: ['mateus-falcao'], fonte: 'teams:2026-10-20', data: '2026-10-20', hoje: '2026-10-20' })
  assert.equal(t1.secao, 'P2')
  assert.match(t1.todo, /## P2 Agendar\n- \[ \] b\n- \[ \] Mandar ata \| prazo: 2099-01-01 \| ctx: \[\[c1\]\]/)
  assert.equal(G.linhaTodo(t1.todo, { compId: 'c1', oque: 'x', dono: 'mateus-falcao', assumidos: ['mateus-falcao'] }).secao, null)
  assert.equal(G.linhaTodo(todo, { compId: 'c2', oque: 'Revisar', prazo: 'sem prazo', dono: 'mateus-falcao', assumidos: ['bruno-souza'], data: '2026-10-20', hoje: '2026-10-20' }).secao, 'Aguardando')
})

const node = (args, env = {}) => spawnSync(process.execPath, args, { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, ...env } })

test('ponta a ponta: resposta do Teams → turnos → extração → apply no grafo (vault temporário)', async () => {
  const V = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-teams-'))
  try {
    await fs.cp(FIX, V, { recursive: true })
    // reunião futura criada pela agenda: só tipo + futura + participantes
    await fs.writeFile(path.join(V, 'Reunioes', '2026-10-20-fup-acme.md'), '---\ncreated: 2026-10-19T08:00:00-03:00\nupdated: 2026-10-19T08:00:00-03:00\ntype: reuniao\nsource: outlook\ntags: [reuniao, futura]\ndata: 2026-10-20\nparticipantes: ["[[ana-lima]]", "[[mateus-falcao]]"]\ncliente: null\nprojeto: null\ntemas: []\ndecisoes: []\ncompromissos: []\norigem: outlook\nmeetrox_id: null\nteams_id: null\nbruto: null\n---\n\n# FUP ACME — 2026-10-20\n\n## Notas do Mateus\n<!-- manual -->\nnão mexer\n')
    const item = path.join(V, 'Inbox', '_raw', 'teams', '2026-10-20_fup-acme')
    await fs.mkdir(item, { recursive: true })
    await fs.writeFile(path.join(item, 'evento.json'), JSON.stringify({ evento_id: 'ev-1', teams_id: 'MSoxMjM0NTY3', assunto: 'FUP ACME', inicio: '2026-10-20T10:00:00-03:00', fim: '2026-10-20T10:30:00-03:00', organizador: { nome: 'Mateus Falcão', email: 'mateus@exemplo.com' }, participantes: [{ nome: 'Ana Lima', email: 'ana@acme.example' }, { nome: 'Bruno Souza', email: 'bruno@acme.example' }] }))
    await fs.writeFile(path.join(item, 'resposta.json'), RESPOSTA)

    let r = node(['pipeline/teams-transcricao.mjs'], { JARVIS_VAULT: V })
    assert.equal(r.status, 0, r.stderr)
    assert.match(await fs.readFile(path.join(item, 'turnos.txt'), 'utf8'), /^t0001 00:03 Ana Lima: Bom dia/)
    const dest = await fs.readFile(path.join(V, 'Inbox', 'teams', '2026-10-20_transcricao_fup-acme.md'), 'utf8')
    assert.match(dest, /teams_id: "MSoxMjM0NTY3"/)
    assert.equal(JSON.parse(node(['pipeline/teams-transcricao.mjs'], { JARVIS_VAULT: V }).stdout).contagem.ja_processados, 1) // idempotente

    const bruto = ['--vault', V, '--bruto', 'Inbox/_raw/teams/2026-10-20_fup-acme']
    r = node(['pipeline/grafo-reuniao.mjs', 'existing', ...bruto]); assert.equal(r.status, 0, r.stderr)
    const ex = JSON.parse(await fs.readFile(path.join(item, 'extracao', 'existentes.json'), 'utf8'))
    assert.equal(ex.reuniao.id, '2026-10-20-fup-acme') // casou com a nota da agenda (data + assunto)
    assert.ok(ex.participantes.some((p) => p.pessoa === 'ana-lima'))
    r = node(['pipeline/grafo-reuniao.mjs', 'prompt', ...bruto, '--todos']); assert.equal(r.status, 0, r.stderr)
    assert.match(await fs.readFile(path.join(item, 'extracao', 'prompts', 'chunk-001.md'), 'utf8'), /t0002 \[00:10\] Mateus Falcão: Eu mando a ata/)

    // o que o subagente extrator-reuniao devolveria
    const R = '2026-10-20-fup-acme'
    const ev = (to, type, tipo, trecho, turno) => ({ type: 'EVIDENCIA', sourceId: R, sourceType: 'Reuniao', targetId: to, targetType: type, attributes: { tipo, trecho, turno } })
    const resp = {
      entities: [
        { type: 'Reuniao', id: R, attributes: { tags: 'fup | portal-fornecedores' } },
        { type: 'Cliente', id: 'acme' },
        { type: 'Tema', id: 'integracao-portal-acme', attributes: { aliases: 'portal' } },
        { type: 'Decisao', id: 'dec-portal-so-com-aval', attributes: { oque: 'Integração do portal só com o de acordo da Ana' } },
        { type: 'Compromisso', id: 'comp-mandar-ata', attributes: { oque: 'Mandar a ata', prazo: '2026-10-22' } },
        { type: 'Compromisso', id: 'comp-revisar-perfis', attributes: { oque: 'Revisar os perfis de acesso', prazo: 'sem prazo' } },
        { type: 'Compromisso', id: 'comp-inventado', attributes: { oque: 'Algo sem fala', prazo: 'sem prazo' } },
      ],
      relationships: [
        { type: 'SOBRE', sourceId: R, sourceType: 'Reuniao', targetId: 'acme', targetType: 'Cliente', attributes: {} },
        { type: 'PARTICIPOU', sourceId: R, sourceType: 'Reuniao', targetId: 'bruno-souza', targetType: 'Pessoa', attributes: {} },
        { type: 'TRATADO_EM', sourceId: 'integracao-portal-acme', sourceType: 'Tema', targetId: R, targetType: 'Reuniao', attributes: { status: 'avancando' } },
        { type: 'TOMADA_EM', sourceId: 'dec-portal-so-com-aval', sourceType: 'Decisao', targetId: R, targetType: 'Reuniao', attributes: {} },
        { type: 'DECIDIDO_POR', sourceId: 'dec-portal-so-com-aval', sourceType: 'Decisao', targetId: 'ana-lima', targetType: 'Pessoa', attributes: {} },
        { type: 'FIRMOU', sourceId: R, sourceType: 'Reuniao', targetId: 'comp-mandar-ata', targetType: 'Compromisso', attributes: {} },
        { type: 'ASSUMIDO_POR', sourceId: 'comp-mandar-ata', sourceType: 'Compromisso', targetId: 'mateus-falcao', targetType: 'Pessoa', attributes: {} },
        { type: 'ASSUMIDO_POR', sourceId: 'comp-revisar-perfis', sourceType: 'Compromisso', targetId: 'bruno-souza', targetType: 'Pessoa', attributes: {} },
        { type: 'SOBRE_TEMA', sourceId: 'dec-portal-so-com-aval', sourceType: 'Decisao', targetId: 'integracao-portal-acme', targetType: 'Tema', attributes: {} },
        ev('integracao-portal-acme', 'Tema', 'tema', 'a integração do portal sai & volta', 't0001'),
        ev('dec-portal-so-com-aval', 'Decisao', 'decisao', 'Ficou definido que a integração do portal sai & volta só com o meu de acordo.', 't0001'),
        ev('comp-mandar-ata', 'Compromisso', 'compromisso', 'Eu mando a ata até 2026-10-22, pode deixar.', 't0002'),
        ev('comp-revisar-perfis', 'Compromisso', 'compromisso', 'Eu reviso os perfis de acesso', 't0003'),
      ],
    }
    await fs.mkdir(path.join(item, 'extracao', 'respostas'), { recursive: true })
    // paráfrase é recusada pelo validate do chunk
    const ruim = { ...resp, relationships: [...resp.relationships, ev('comp-inventado', 'Compromisso', 'compromisso', 'eu faço depois', 't0002')] }
    await fs.writeFile(path.join(item, 'extracao', 'respostas', 'chunk-001.json'), JSON.stringify(ruim))
    r = node(['pipeline/grafo-reuniao.mjs', 'validate', ...bruto, '--chunk', 'chunk-001'])
    assert.notEqual(r.status, 0); assert.match(r.stderr, /não é literal/)
    await fs.writeFile(path.join(item, 'extracao', 'respostas', 'chunk-001.json'), JSON.stringify(resp))
    r = node(['pipeline/grafo-reuniao.mjs', 'validate', ...bruto, '--chunk', 'chunk-001']); assert.equal(r.status, 0, r.stderr)
    r = node(['pipeline/grafo-reuniao.mjs', 'merge', ...bruto]); assert.equal(r.status, 0, r.stderr)
    r = node(['pipeline/grafo-reuniao.mjs', 'apply', ...bruto]); assert.equal(r.status, 0, r.stderr)
    const rep = JSON.parse(r.stdout)
    assert.deepEqual(rep.descartados_sem_evidencia, ['Compromisso:comp-inventado'])

    const reu = await fs.readFile(path.join(V, 'Reunioes', `${R}.md`), 'utf8')
    const { fm } = parseNote(reu)
    assert.deepEqual(fm.tags, ['reuniao', 'fup', 'portal-fornecedores']) // "futura" saiu; tags só depois da reunião
    assert.deepEqual(fm.participantes, ['[[ana-lima]]', '[[mateus-falcao]]', '[[bruno-souza]]'])
    assert.equal(fm.cliente, '[[acme]]')
    assert.equal(fm.origem, 'teams')
    assert.equal(fm.teams_id, 'MSoxMjM0NTY3')
    assert.deepEqual(fm.temas, ['[[integracao-portal-acme]]'])
    assert.equal(fm.compromissos.length, 2)
    assert.match(reu, /## Notas do Mateus\n<!-- manual -->\nnão mexer/)

    const tema = parseNote(await fs.readFile(path.join(V, 'Temas', 'integracao-portal-acme.md'), 'utf8'))
    assert.equal(tema.fm.status, 'travado') // campo manual intocado
    assert.deepEqual(tema.fm.aliases, ['portal ACME', 'portal'])
    assert.match(tema.body, /- "a integração do portal sai & volta" — Ana Lima · fonte: Inbox\/_raw\/teams\/2026-10-20_fup-acme\/turnos.txt#t0001/)

    const comp = parseNote(await fs.readFile(path.join(V, 'Compromissos', '2026-10-20-mateus-falcao-mandar-a-ata.md'), 'utf8'))
    assert.equal(comp.fm.prazo, '2026-10-22')
    assert.equal(comp.fm.firmado_em, `[[${R}]]`)
    const todo = await fs.readFile(path.join(V, 'TODO.md'), 'utf8')
    assert.match(todo, /- \[ \] Mandar a ata \| prazo: 2026-10-22 \| ctx: \[\[2026-10-20-mateus-falcao-mandar-a-ata\]\] \| fonte: teams:2026-10-20/)
    assert.match(todo, /## Aguardando[\s\S]*quem: \[\[bruno-souza\]\]/)

    // o harness enxerga e confere as evidências gravadas
    const c = await Q.contexto({ root: V, forcar: true })
    const evs = await Q.evidenciasNo(c, { id: '2026-10-20-mateus-falcao-mandar-a-ata' })
    assert.match(evs, /OK literal/)

    // idempotente: segundo apply não duplica evidência nem linha do TODO
    r = node(['pipeline/grafo-reuniao.mjs', 'apply', ...bruto]); assert.equal(r.status, 0, r.stderr)
    assert.equal(JSON.parse(r.stdout).todo.length, 0)
    const tema2 = await fs.readFile(path.join(V, 'Temas', 'integracao-portal-acme.md'), 'utf8')
    assert.equal(tema2.split('turnos.txt#t0001').length - 1, 1)
  } finally {
    await fs.rm(V, { recursive: true, force: true })
  }
})
