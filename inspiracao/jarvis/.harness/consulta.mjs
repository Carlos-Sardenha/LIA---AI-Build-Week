#!/usr/bin/env node
// CLI de consulta ao grafo do segundo cérebro (só leitura). Mesmas funções do servidor MCP "jarvis".
//   node .harness/consulta.mjs <comando> [posicional] [--opcao valor] [--flag]
// Comandos:
//   cobertura
//   buscar "<pergunta>" [--tipo t] [--cliente c] [--k N]
//   grep "<termo|variante>" [--regex] [--exigir "a;b"] [--tipo t] [--pasta Reunioes/] [--max N]
//   no <id> · vizinhos <id> [--profundidade 1-3] [--tipos pessoa,tema] · ler <id> [--linha N --janela N] | --caminho <rel>
//   reunioes [--pessoa p] [--cliente c] [--tema t] [--projeto p] [--periodo 30d] [--desde D --ate D]
//   compromissos [--status abertos|concluido|todos] [--pessoa p] [--cliente c] [--vencidos] [--prazo_ate D] [--incluir_todo false]
//   temas [--cliente c] [--status s] [--recorrentes] · decisoes [--cliente c] [--tema t] [--periodo mes]
//   timeline [<id>] [--periodo semana] [--tipos reuniao,decisao] · evidencias [<id>] [--tipo t] [--conferir false]
// Opções globais: --vault <pasta> (padrão: raiz deste vault; ou env JARVIS_VAULT)
import path from 'node:path'
import * as Q from './lib/consultas.mjs'

const [cmd, ...resto] = process.argv.slice(2)
const pos = [], op = {}
const BOOLEANAS = new Set(['regex', 'vencidos', 'recorrentes', 'incluir_todo', 'vizinhos', 'conferir', 'fracas'])
for (let i = 0; i < resto.length; i++) {
  const a = resto[i]
  if (!a.startsWith('--')) { pos.push(a); continue }
  const k = a.slice(2).replace(/-/g, '_')
  const v = resto[i + 1]
  if (BOOLEANAS.has(k)) { if (v === 'true' || v === 'false') { op[k] = v === 'true'; i++ } else op[k] = true; continue }
  if (v === undefined || v.startsWith('--')) op[k] = true
  else { op[k] = /^\d+$/.test(v) ? Number(v) : v; i++ }
}

const comando = {
  cobertura: (c) => Q.cobertura(c, op),
  buscar: (c) => Q.buscar(c, { ...op, pergunta: pos.join(' ') || op.pergunta }),
  grep: (c) => Q.grep(c, { ...op, termo: pos.join(' ') || op.termo }),
  no: (c) => Q.no(c, { ...op, id: pos[0] ?? op.id }),
  vizinhos: (c) => Q.vizinhos(c, { ...op, id: pos[0] ?? op.id }),
  ler: (c) => Q.ler(c, { ...op, id: pos[0] ?? op.id }),
  reunioes: (c) => Q.reunioes(c, op),
  compromissos: (c) => Q.compromissos(c, op),
  temas: (c) => Q.temas(c, op),
  decisoes: (c) => Q.decisoes(c, op),
  timeline: (c) => Q.timeline(c, { ...op, id: pos[0] ?? op.id }),
  evidencias: (c) => Q.evidenciasNo(c, { ...op, id: pos[0] ?? op.id }),
}

if (!cmd || !comando[cmd]) {
  process.stdout.write(`uso: node .harness/consulta.mjs <${Object.keys(comando).join('|')}> [args]\n`)
  process.exit(cmd ? 2 : 0)
}
try {
  const vault = typeof op.vault === 'string' ? path.resolve(op.vault) : undefined
  delete op.vault
  const c = await Q.contexto(vault ? { root: vault } : {})
  process.stdout.write((await comando[cmd](c)) + '\n')
} catch (e) {
  process.stderr.write(`erro: ${e.message}\n`)
  process.exit(1)
}
