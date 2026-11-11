#!/usr/bin/env node
// Servidor MCP (stdio) "jarvis": expõe o grafo do segundo cérebro como ferramentas para o Claude Code.
// Registrado em .mcp.json na raiz do vault. SÓ LEITURA. Sem dependência externa: JSON-RPC por linha em stdin/stdout.
// O grafo fica em memória e é relido quando passa o TTL (o ritual continua escrevendo no vault).
import readline from 'node:readline'
import * as Q from './lib/consultas.mjs'

const TTL = Number(process.env.JARVIS_TTL_MS) || 60_000
const log = (m) => process.stderr.write(`[jarvis] ${m}\n`)

const per = {
  periodo: { type: 'string', enum: ['hoje', 'semana', 'semana-passada', 'mes', '7d', '30d', '90d', 'proximos-7d'], description: 'atalho relativo a hoje (America/Sao_Paulo)' },
  desde: { type: 'string', description: 'AAAA-MM-DD' },
  ate: { type: 'string', description: 'AAAA-MM-DD' },
}
const limite = { type: 'integer', description: 'máximo de itens na resposta' }
const cliente = { type: 'string', description: 'id, nome ou alias do cliente (ex.: acme, "ACME Ltda")' }
const pessoa = { type: 'string', description: 'id, nome ou alias da pessoa (ex.: ana-lima, "Ana")' }
const tipo = { type: 'string', enum: ['cliente', 'pessoa', 'reuniao', 'projeto', 'tema', 'decisao', 'compromisso', 'nota', 'curso', 'daily', 'semanal', 'todo'], description: 'tipo do nó' }

const FERRAMENTAS = [
  { name: 'jarvis_cobertura', fn: Q.cobertura,
    description: 'Estado do grafo do segundo cérebro: nós por tipo com intervalo de datas, arestas, evidências (e quantas sem citação literal), TODO aberto, Inbox ainda não ingerido, órfãs e links quebrados. Chame ANTES de responder sobre período/pessoa/cliente para dizer o que a resposta cobre.',
    props: {} },
  { name: 'jarvis_buscar', fn: Q.buscar,
    description: 'Busca ranqueada (BM25) sobre todas as notas da wiki (título, aliases, propriedades, corpo), com as ligações de cada resultado no grafo. Para pergunta aberta em linguagem natural. Trecho entre aspas exige a frase literal. Sem embedding: para cobertura completa de um termo, use jarvis_grep.',
    props: { pergunta: { type: 'string' }, tipo, cliente, k: { type: 'integer', description: 'quantos resultados (padrão 8)' }, vizinhos: { type: 'boolean', description: 'mostra ligações (padrão true)' } }, req: ['pergunta'] },
  { name: 'jarvis_grep', fn: Q.grep,
    description: 'Busca LITERAL linha a linha em todas as notas lidas (wiki, TODO, index, log, prompts, Inbox não-bruto), sem caixa e sem acento. Exaustiva: devolve todas as ocorrências com arquivo:linha. Alternativas com | ("cancel|rescis"), prefira radical. Zero ocorrência não prova ausência.',
    props: { termo: { type: 'string' }, regex: { type: 'boolean' }, exigir: { type: 'array', items: { type: 'string' }, description: 'termos que TAMBÉM precisam aparecer na mesma nota' }, tipo, pasta: { type: 'string', description: 'prefixo de caminho (ex.: Reunioes/)' }, max: { type: 'integer', description: 'linhas mostradas (padrão 30, teto 300)' } }, req: ['termo'] },
  { name: 'jarvis_no', fn: Q.no,
    description: 'Um nó por id (basename), nome ou alias: propriedades, para onde aponta e quem aponta para ele (backlinks agrupados por tipo de aresta) e as evidências literais.',
    props: { id: { type: 'string' }, limite }, req: ['id'] },
  { name: 'jarvis_vizinhos', fn: Q.vizinhos,
    description: 'Vizinhança de um nó até 3 saltos (não atravessa hubs: cliente, TODO, daily, semanal). Filtre por tipos separados por vírgula.',
    props: { id: { type: 'string' }, profundidade: { type: 'integer', minimum: 1, maximum: 3 }, tipos: { type: 'string', description: 'ex.: "pessoa,compromisso"' }, fracas: { type: 'boolean', description: 'inclui links do corpo (padrão true)' }, limite }, req: ['id'] },
  { name: 'jarvis_reunioes', fn: Q.reunioes,
    description: 'Reuniões filtradas por pessoa (participante ou citada), cliente, tema, projeto e período, mais recentes primeiro, com pessoas, temas, nº de compromissos e decisões.',
    props: { pessoa, cliente, tema: { type: 'string' }, projeto: { type: 'string' }, ...per, limite } },
  { name: 'jarvis_compromissos', fn: Q.compromissos,
    description: 'Compromissos (ações assumidas por alguém) dos nós Compromissos/ e, por padrão, as tarefas do TODO.md (incluindo "Aguardando" com quem: [[pessoa]]). Filtros: status (abertos = aberto/em_andamento/aguardando), pessoa (quem assumiu ou quem o Mateus aguarda), cliente, projeto, só vencidos, prazo até. Linha do TODO cujo ctx aponta para um compromisso já listado não se repete. Use para "o que o Fulano me deve", "o que está vencido com a ACME".',
    props: { status: { type: 'string', enum: ['abertos', 'aberto', 'em_andamento', 'aguardando', 'concluido', 'cancelado', 'todos'], description: 'padrão abertos' }, pessoa, cliente, projeto: { type: 'string' }, vencidos: { type: 'boolean' }, prazo_ate: { type: 'string', description: 'AAAA-MM-DD' }, incluir_todo: { type: 'boolean', description: 'inclui TODO.md (padrão true)' }, limite } },
  { name: 'jarvis_temas', fn: Q.temas,
    description: 'Temas (tópicos recorrentes) com status, nº de reuniões, compromissos e decisões ligados, primeira e última vez. recorrentes = só os que aparecem em ≥ 2 reuniões.',
    props: { cliente, status: { type: 'string', description: 'aberto | avancando | travado | resolvido' }, recorrentes: { type: 'boolean' }, limite } },
  { name: 'jarvis_decisoes', fn: Q.decisoes,
    description: 'Decisões registradas (Decisoes/) com onde foram tomadas, por quem, status e a evidência literal. Filtros: cliente, projeto, tema, status, período.',
    props: { cliente, projeto: { type: 'string' }, tema: { type: 'string' }, status: { type: 'string', description: 'vigente | revogada | substituida' }, ...per, limite } },
  { name: 'jarvis_timeline', fn: Q.timeline,
    description: 'Linha do tempo: de um nó (cliente, pessoa, projeto, tema…) com tudo que se liga a ele em ordem de data, ou do vault inteiro num período. Filtre por tipos.',
    props: { id: { type: 'string', description: 'nó central (opcional se houver período)' }, ...per, tipos: { type: 'string', description: 'ex.: "reuniao,decisao"' }, limite } },
  { name: 'jarvis_ler', fn: Q.ler,
    description: 'Lê uma nota por id ou caminho relativo, com números de linha. Com linha + janela, só o entorno (use com o arquivo:linha do jarvis_grep).',
    props: { id: { type: 'string' }, caminho: { type: 'string' }, linha: { type: 'integer' }, janela: { type: 'integer', description: 'linhas de cada lado (padrão 40)' } } },
  { name: 'jarvis_evidencias', fn: Q.evidenciasNo,
    description: 'Evidências (citações literais + ponteiro para o bruto) de um nó ou de um tipo, conferindo se cada trecho existe literalmente no arquivo bruto apontado (quando ele está nesta máquina) e, com âncora tNNNN em turnos.txt, no turno citado. Aceita o formato D1 (fonte: System/Archive/raw/AAAA-MM/<fonte>/<item>/turnos.txt#tNNNN, ou Inbox/_raw/… antes do arquivamento) e o legado "meetrox:<id> turno:tNNNN". Use antes de afirmar algo como fato.',
    props: { id: { type: 'string' }, tipo, conferir: { type: 'boolean', description: 'confere no bruto (padrão true)' }, limite } },
]

const INSTRUCOES = `Jarvis: grafo do segundo cérebro de trabalho do Mateus Falcão (wehandle). Nós = clientes, pessoas, reuniões, projetos, temas, decisões, compromissos, notas, cursos, dailies (schema em System/schema/grafo.md). SÓ LEITURA: para escrever no vault siga o CLAUDE.md; nunca escreva em ClickUp/Jira/Outlook sem confirmação do Mateus.
Regras: (1) chame jarvis_cobertura antes de responder sobre período/pessoa/cliente e diga o que a resposta cobre (o grafo só sabe o que foi ingerido; Inbox pendente não entrou); (2) cite cada fato com [[id]] e data; (3) sem citação literal, sem evidência: fato vindo de fonte bruta só é afirmado com o trecho de jarvis_evidencias/jarvis_no — sem ele, diga "registrado no vault, sem evidência literal"; (4) status de compromisso é manual: "aberto" antigo é "aberto no registro"; (5) nunca invente: se a ferramenta não trouxe, o vault não tem.
Atalhos: "o que o Fulano me deve / o que devo ao cliente" → jarvis_compromissos; "reuniões com X" → jarvis_reunioes; "o que é recorrente" → jarvis_temas recorrentes; "o que decidimos sobre Y" → jarvis_decisoes ou jarvis_buscar; "histórico de X" → jarvis_timeline; termo/nome/sigla exatos → jarvis_grep (variantes com |); pergunta aberta → jarvis_buscar e depois jarvis_no/jarvis_ler.`

function responder(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n') }
function erro(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n') }

async function tratar(msg) {
  const { id, method, params } = msg
  if (id === undefined || id === null) return // notificação
  switch (method) {
    case 'initialize':
      return responder(id, { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'jarvis', version: '1.0.0' }, instructions: INSTRUCOES })
    case 'ping':
      return responder(id, {})
    case 'tools/list':
      return responder(id, { tools: FERRAMENTAS.map((f) => ({ name: f.name, description: f.description, inputSchema: { type: 'object', properties: f.props, required: f.req ?? [] }, annotations: { readOnlyHint: true } })) })
    case 'tools/call': {
      const f = FERRAMENTAS.find((x) => x.name === params?.name)
      if (!f) return erro(id, -32602, `ferramenta desconhecida: ${params?.name}`)
      try {
        const c = await Q.contexto({ ttlMs: TTL })
        const texto = await f.fn(c, params.arguments ?? {})
        return responder(id, { content: [{ type: 'text', text: texto }] })
      } catch (e) {
        log(`${f.name}: ${e.stack ?? e.message}`)
        return responder(id, { content: [{ type: 'text', text: `erro: ${e.message}` }], isError: true })
      }
    }
    default:
      return erro(id, -32601, `método não suportado: ${method}`)
  }
}

// fila: uma chamada por vez (a carga do grafo não deve rodar em paralelo)
let fila = Promise.resolve()
readline.createInterface({ input: process.stdin }).on('line', (linha) => {
  if (!linha.trim()) return
  let msg
  try { msg = JSON.parse(linha.replace(/^﻿/, '')) } catch { return erro(null, -32700, 'JSON inválido') }
  fila = fila.then(() => tratar(msg)).catch((e) => log(e.stack ?? e.message))
})
log('pronto')
