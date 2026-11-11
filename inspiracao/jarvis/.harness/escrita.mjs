#!/usr/bin/env node
// Servidor MCP (stdio) "jarvis-escrita": a escrita estreita que o painel do dia (skill `checkin`) usa.
// Registrado em .mcp.json ao lado do "jarvis" (que continua SÓ LEITURA). Operações fixas, sem delete:
// painel (leitura estruturada), Check-in e Anotações do Daily, tarefas do TODO.md, captura no Inbox/manual.
// Toda escrita deixa linha no log.md. Mesmo protocolo do mcp.mjs: JSON-RPC por linha, sem dependência.
import readline from 'node:readline'
import { executar, OPERACOES } from './lib/escrita.mjs'

const log = (m) => process.stderr.write(`[jarvis-escrita] ${m}\n`)
const data = { type: 'string', description: 'AAAA-MM-DD (padrão: hoje, America/Sao_Paulo)' }
const quadrante = { type: 'string', enum: ['P1', 'P2', 'P3', 'P4', 'AG'], description: 'quadrante do TODO (AG = Aguardando)' }

const DESCRICOES = {
  jarvis_painel: { description: 'Painel do dia em JSON: TODO por quadrante (cada tarefa com id para escrita), compromissos abertos, projetos ativos, reuniões de ontem a +7 dias, pessoas e as seções Briefing/Check-in/Anotações do Daily. Leitura.',
    props: { data } },
  jarvis_checkin_gravar: { description: 'Grava a seção "## Check-in" do Daily (cria o Daily do template se faltar) a partir do plano confirmado no painel: intenção, Top 3, blocos, riscos, expediente. Substitui só essa seção.',
    props: { data, status: { type: 'string', enum: ['confirmado', 'a_confirmar'] }, intencao: { type: 'string' },
      expediente: { type: 'object', properties: { inicio: { type: 'string' }, fim: { type: 'string' }, padrao: { type: 'boolean' } } },
      top3: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, ctx: { type: 'string' }, trecho: { type: 'string' }, bloco: { type: 'string' } } } },
      blocos: { type: 'array', items: { type: 'object', properties: { inicio: { type: 'string' }, fim: { type: 'string' }, rotulo: { type: 'string' } } } },
      riscos: { type: 'array', items: { type: 'string' } }, ficaParaDepois: { type: 'array', items: { type: 'string' } }, obs: { type: 'string' } },
    req: ['intencao'] },
  jarvis_anotar: { description: 'Acrescenta uma linha "- HH:MM texto" em "## Anotações do dia" do Daily.',
    props: { texto: { type: 'string' }, data }, req: ['texto'] },
  jarvis_tarefa: { description: 'Muda o TODO.md: criar (texto, quadrante, prazo, ctx, quem/cobrar para Aguardando), concluir (move para Concluídas com feito:), reabrir, mover de quadrante ou editar (texto/prazo/ctx). Tarefa existente pelo id do jarvis_painel; se a linha mudou, recusa. Nunca apaga.',
    props: { acao: { type: 'string', enum: ['criar', 'concluir', 'reabrir', 'mover', 'editar'] }, id: { type: 'string' }, texto: { type: 'string' }, quadrante,
      prazo: { type: 'string', description: 'AAAA-MM-DD ou vazio para tirar' }, ctx: { type: 'string', description: 'id do nó (sem colchetes)' }, quem: { type: 'string' }, cobrar: { type: 'string' }, versao: { type: 'string' } },
    req: ['acao'] },
  jarvis_capturar: { description: 'Grava uma captura solta em Inbox/manual/ (processada no próximo /ingest ou ritual).',
    props: { texto: { type: 'string' } }, req: ['texto'] },
}

const INSTRUCOES = 'Jarvis (escrita do painel): operações fixas e estreitas no vault do Mateus — Check-in e Anotações do Daily, tarefas do TODO.md, captura no Inbox/manual. Nada é apagado; toda escrita vai para o log.md. Para consultar o grafo use o servidor "jarvis" (só leitura).'

function responder(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n') }
function erro(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n') }

async function tratar(msg) {
  const { id, method, params } = msg
  if (id === undefined || id === null) return
  switch (method) {
    case 'initialize':
      return responder(id, { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'jarvis-escrita', version: '1.0.0' }, instructions: INSTRUCOES })
    case 'ping':
      return responder(id, {})
    case 'tools/list':
      return responder(id, { tools: Object.entries(DESCRICOES).map(([name, d]) => ({ name, description: d.description,
        inputSchema: { type: 'object', properties: d.props, required: d.req ?? [] },
        annotations: OPERACOES[name].leitura ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false } })) })
    case 'tools/call': {
      const nome = params?.name
      if (!DESCRICOES[nome]) return erro(id, -32602, `ferramenta desconhecida: ${nome}`)
      try {
        const r = await executar(nome, params.arguments ?? {})
        return responder(id, { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: r })
      } catch (e) {
        log(`${nome}: ${e.stack ?? e.message}`)
        return responder(id, { content: [{ type: 'text', text: `erro: ${e.message}` }], isError: true })
      }
    }
    default:
      return erro(id, -32601, `método não suportado: ${method}`)
  }
}

// uma operação por vez: duas escritas no TODO não podem se cruzar
let fila = Promise.resolve()
readline.createInterface({ input: process.stdin }).on('line', (linha) => {
  if (!linha.trim()) return
  let msg
  try { msg = JSON.parse(linha.replace(/^﻿/, '')) } catch { return erro(null, -32700, 'JSON inválido') }
  fila = fila.then(() => tratar(msg)).catch((e) => log(e.stack ?? e.message))
})
log('pronto')
