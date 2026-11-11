---
created: 2026-10-22T12:00:00-03:00
updated: 2026-10-22T12:00:00-03:00
type: config
source: manual
tags: [ferramentas, jira, config]
---

# Catálogo de ferramentas: "quando eu quiser X, use Y"

Roteador do segundo cérebro. Antes de improvisar uma integração, procure aqui. Vale junto com [[CLAUDE]] (regra 3: sistemas externos são **somente leitura**, exceto a escrita no Jira via `/jira` com confirmação explícita do Mateus no chat). Perfil e carteira: [[System/config/profile]]. Fontes de sync: `System/config/sources.yml`.

Legenda: **L** = leitura · **E** = escrita · **Conf.** = exige "sim" explícito do Mateus no chat **antes** de executar (prévia primeiro, depois a ação).

> Nomes de MCP: os conectores aparecem como `mcp__<id-do-conector>__<ferramenta>`; o `<id>` muda por instalação. Procure pela parte final (ex.: `createJiraIssue`) com ToolSearch `select:` ou por palavra-chave. Ferramentas de conector costumam ser *deferred*: carregue o schema antes de chamar. Nunca registre tokens/segredos aqui — só nomes de variáveis de ambiente.

## 1. Segundo cérebro — GraphRAG `jarvis_*` (MCP local, `.harness/mcp.mjs`)

Servidor stdio Node sem dependências, grafo em memória lido do vault. Todas **L**, sem confirmação. Regra: *sem citação literal, sem evidência*.

| Quando eu quiser… | Use | Faz |
|---|---|---|
| Saber o que o grafo cobre (antes de responder) | `jarvis_cobertura` | nós por tipo, datas, evidências sem citação, Inbox pendente, órfãs |
| Pergunta aberta em linguagem natural | `jarvis_buscar` | BM25 sobre a wiki, com vizinhos no grafo |
| Achar TODAS as ocorrências de um termo | `jarvis_grep` | busca literal sem caixa/acento, `arquivo:linha` |
| Ver um nó (cliente, pessoa, tema…) e backlinks | `jarvis_no` | propriedades, arestas, evidências |
| Explorar ligações até 3 saltos | `jarvis_vizinhos` | vizinhança filtrável por tipo |
| Reuniões com alguém / de um cliente / período | `jarvis_reunioes` | lista com pessoas, temas, compromissos, decisões |
| "O que o Fulano me deve", "o que está vencido" | `jarvis_compromissos` | Compromissos/ + TODO.md (inclui Aguardando) |
| Tópicos recorrentes | `jarvis_temas` | status, nº de reuniões/compromissos/decisões |
| Decisões registradas | `jarvis_decisoes` | onde, por quem, status, evidência literal |
| Linha do tempo de um nó ou período | `jarvis_timeline` | eventos em ordem de data |
| Ler uma nota (ou o entorno de uma linha) | `jarvis_ler` | conteúdo numerado |
| Conferir evidência antes de afirmar fato | `jarvis_evidencias` | confere citação no bruto local |

Variáveis de ambiente do servidor: `JARVIS_VAULT`, `JARVIS_TTL_MS`.

## 2. Jira — MCP Atlassian (site `wehandle.atlassian.net`)

- Site: `wehandle.atlassian.net` — passe o **hostname** como `cloudId` nas ferramentas do conector (se falhar, `getAccessibleAtlassianResources` resolve).
- Usuário: Mateus Falcão (descobrir o accountId com `atlassianUserInfo`; em JQL prefira `currentUser()`).
- Projetos visíveis (`getVisibleJiraProjects`, `action: browse`, consultado em 2026-10-22 — 9 projetos):

  | Chave | Projeto | Uso provável a partir do cérebro |
  |---|---|---|
  | `WH` | wehandle | geral / CS — **projeto padrão sugerido** (a confirmar com o Mateus) |
  | `IS` | Infraestrutura / SSI | pedidos de acesso (skill `wehandle-geral:solicitar-acesso`) |
  | `AUT` | Validação | — |
  | `CORE` | Core | produto/engenharia |
  | `DAD` | Dados | pedidos de dados/BI |
  | `HOMOLOG` | Homologação | — |
  | `ITG` | Integrações | integrações de cliente |
  | `MARKET` | MarketPlace | — |
  | `PREQ` | Pre-requisito Engenharia - Missões | — |

  Sem projeto informado e sem contexto que o defina, o `/jira` **pergunta** (o padrão `WH` só entra na prévia como sugestão). Melhorias pedidas por clientes: board com label `Melhoria` (painel de melhorias).
- **Toda escrita passa por `/jira`**: prévia em lote → "sim" do Mateus → executa → log + `fonte: jira:<KEY>` no TODO.

| Quando eu quiser… | Use | L/E | Conf. |
|---|---|---|---|
| Listar meus cards abertos | `searchJiraIssuesUsingJql` — `assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC` | L | não |
| Ver o que eu reportei e está aberto (vira Aguardando) | `searchJiraIssuesUsingJql` — `reporter = currentUser() AND statusCategory != Done` | L | não |
| Ver backlog de um projeto | `searchJiraIssuesUsingJql` — `project = <KEY> AND statusCategory = "To Do" ORDER BY rank` | L | não |
| Detalhar um card | `getJiraIssue` | L | não |
| Saber campos/tipos obrigatórios antes de criar | `getJiraProjectIssueTypesMetadata`, `getJiraIssueTypeMetaWithFields` | L | não |
| Listar projetos e tipos | `getVisibleJiraProjects` | L | não |
| Achar accountId de alguém (responsável) | `lookupJiraAccountId` | L | não |
| Ver transições possíveis de um card | `getTransitionsForJiraIssue` | L | não |
| Relações entre cards, pessoas, times | `getTeamworkGraphContext` → `getTeamworkGraphObject` | L | não |
| Quem sou eu no Atlassian | `atlassianUserInfo` | L | não |
| **Criar card** | `createJiraIssue` (ou skill `wehandle-dev:criar-card-jira`) | E | **sim** |
| **Editar card** (título, descrição, responsável, prazo) | `editJiraIssue` | E | **sim** |
| **Mover card** de status | `getTransitionsForJiraIssue` → `transitionJiraIssue` | E | **sim** |
| **Comentar** em card | `addCommentToJiraIssue` | E | **sim** |
| **Lançar horas** | `addWorklogToJiraIssue` | E | **sim** |
| **Ligar** dois cards | `getIssueLinkTypes` → `createIssueLink` | E | **sim** |

Confluence (mesmo conector): `searchConfluenceUsingCql`, `getConfluencePage` (**L**). Criar/editar páginas (`createConfluencePage`, `updateConfluencePage`) está **fora** da exceção do /jira — não usar a partir do cérebro.

## 3. Skills wehandle (plugins da org)

| Quando eu quiser… | Skill | Faz | L/E | Conf. |
|---|---|---|---|---|
| Criar task/bug com fluxo guiado | `wehandle-dev:criar-card-jira` | valida conexão, coleta info, confirma e cria | E | **sim** (a própria skill confirma; o /jira mostra a prévia antes) |
| Gerenciar cards (mover, comentar, atualizar) | `wehandle-dev:gerenciar-jira` | operações sobre cards existentes | E | **sim** |
| Ver minhas tarefas | `wehandle-dev:minhas-tarefas` | lista o que está atribuído a mim | L | não |
| Pedir acesso a sistema | `wehandle-geral:solicitar-acesso` | abre pedido no Jira (Infraestrutura / SSI) com a liderança como revisor | E | **sim** |
| Ver pedidos de acesso que eu devo aprovar | `wehandle-geral:aprovacoes-pendentes` | fila de aprovação aberta, do mais antigo ao mais novo | L | não |
| Painel de melhorias pedidas por clientes | `anthropic-skills:painel-melhorias` | ClickUp + Jira (label `Melhoria`) + e-mail → artefato | L (botão "registrar no ClickUp" = E) | **sim** para o botão |
| Gerar PDF de um HTML | `wehandle-geral:html-para-pdf` | Puppeteer | E (arquivo local) | não |
| Apresentação/relatório visual wehandle | `wehandle-marketing:criar-apresentacao` | HTML no design system wehandle | E (arquivo local) | não |
| Roadmap de produto | `wehandle-produto:roadmap` + MCP `roadmap-produto` (`frentes`, `entregas`, `releases`, `deck_atual`) | consulta roadmap | L | não |
| Consultar/registrar no vault corporativo | `segundo-cerebro-wehandle` | guardião do vault `wehandle` | **L daqui** (regra 6) | — |

Skills de CS/AM úteis (todas geram material local; nada é enviado sem confirmação):

| Tema | Skill |
|---|---|
| Health score / clientes em risco | `sucesso-health-score` |
| Plano de sucesso | `sucesso-plano-de-sucesso` |
| QBR | `sucesso-qbr` |
| Stakeholders do tomador | `sucesso-gestao-stakeholders` |
| Relacionamento executivo / briefing C-level | `comercial-relacionamento-executivo` |
| Forecast de receita (renovação, expansão, churn) | `comercial-forecast-receita` |
| Customer Risk Review | `governanca-customer-risk-review` |
| Follow-ups operacionais | `customerops-followups-operacionais` |
| CRM, dashboards, atas | `customerops-crm-dashboards-atas` |
| KPIs (MAU, SAU, SLA de validação, permanência, acessos, aderência) | `customerops-mau`, `customerops-sau`, `customerops-sla-validacao`, `customerops-tempo-permanencia`, `customerops-acessos-plataforma`, `customerops-aderencia-fornecedores` |
| Conformidade / isenções documentais | `customerops-conformidade-documental`, `customerops-isencoes-documentais`, `anthropic-skills:cs-analise-isencao-cbo` |
| Implantação (contratos, adesão, treinamento, fornecedores) | `implantacao-input-contratos`, `implantacao-campanhas-adesao`, `implantacao-treinamento-inicial`, `implantacao-ativacao-fornecedores` |

## 4. ClickUp — MCP ClickUp (somente leitura)

| Quando eu quiser… | Use | L/E |
|---|---|---|
| Minhas tarefas abertas | `clickup_filter_tasks` (assignee = eu) | L |
| Buscar tarefa/doc por texto | `clickup_search` | L |
| Detalhe e comentários | `clickup_get_task`, `clickup_get_task_comments` | L |
| Estrutura de espaços/listas (mapear cliente) | `clickup_get_workspace_hierarchy` | L |

Há ferramentas de escrita (`clickup_create_task`, `clickup_update_task`, `clickup_create_task_comment`, `clickup_send_chat_message`…), mas estão **proibidas** a partir do cérebro (regra 3). Se o Mateus pedir, ele faz no ClickUp ou numa sessão fora do vault.

## 5. Microsoft 365 — MCP M365 (somente leitura)

| Quando eu quiser… | Use | L/E |
|---|---|---|
| E-mails | `outlook_email_search` | L |
| Agenda | `outlook_calendar_search` | L |
| Horário livre para propor reunião | `outlook_find_available_time`, `find_meeting_availability` | L |
| Chats do Teams | `chat_message_search`, `teams_list_chats` | L |
| Transcrição de reunião do Teams | `read_resource(calendar:///events/<id>)` → `meetingTranscriptUrl` → `read_resource(<meetingTranscriptUrl>)` (ver § 6) | L |
| Grupos/canais do Teams | `teams_list_teams`, `teams_list_channels`, `teams_list_channel_messages` | L |
| Arquivos (transcrições, atas) no SharePoint/OneDrive | `sharepoint_search`, `sharepoint_folder_search`, `read_resource` | L |
| Achar pessoa (e-mail, cargo) | `search_people`, `get_me` | L |

O conector não envia e-mail nem mensagem — e o cérebro não deve tentar por outro caminho. Rascunho de resposta vai para o chat, o Mateus envia.

## 6. Reuniões → grafo (transcrição do Teams, fonte principal)

Mesmo fluxo do `dominio-grafo` do painel_csm-GraphRAG: scripts determinísticos (Node, sem dependências) + LLM que só devolve JSON. Rotina completa: `System/prompts/pos-reuniao.md` (`/pos-reuniao`). Todos **L** nos sistemas externos.

| Quando eu quiser… | Use | Faz |
|---|---|---|
| Processar as reuniões que acabaram de terminar | `/pos-reuniao` (agendável a cada 30 min no expediente; criar a tarefa só com meu "sim") | agenda → transcrição → grafo, ponta a ponta |
| Transformar a resposta do `read_resource` em `turnos.txt` | `node pipeline/teams-transcricao.mjs [--dry-run] [--item <data>_<slug>] [--refazer]` | `transcript.txt`, `turnos.txt` (`tNNNN MM:SS Falante: fala`), destilação em `Inbox/teams/` |
| Listar o que reutilizar e casar a reunião/participantes | `node pipeline/grafo-reuniao.mjs existing --bruto Inbox/_raw/teams/<item>` | `extracao/existentes.json` |
| Gerar os pedidos de extração | `node pipeline/grafo-reuniao.mjs prompt --bruto … --pendentes` | um `extracao/prompts/chunk-NNN.md` por trecho |
| Responder um pedido | subagente `extrator-reuniao` (`.claude/agents/extrator-reuniao.md`, sonnet) | grava só o JSON em `extracao/respostas/` e roda `validate --chunk` |
| Fundir, validar e gravar no grafo | `node pipeline/grafo-reuniao.mjs merge` · `validate` · `apply [--dry-run]` | notas + `TODO.md`; evidência só literal; campos manuais intactos |
| Ver onde parou | `node pipeline/grafo-reuniao.mjs status --bruto …` | chunks respondidos, merge, apply |

## 7. Meetrox (API própria) — legado, `ativo: false`

- Só reuniões das quais o Mateus participou; bruto em `Inbox/_raw/meetrox/<call_id>/` (`call.json`, `transcript.txt`, `turnos.txt` numerado `tNNNN`; git-ignored, LGPD) → destilado em `Reunioes/`, `Compromissos/`, `Decisoes/`, `Temas/`. Após o ingest, o bruto vai para `System/Archive/raw/YYYY-MM/meetrox/<call_id>/`.
- Rodar: `node pipeline/meetrox.mjs` (`--dry-run` só lista). Env `MEETROX_API_KEY`. O script só lê o cursor; o ritual grava o `cursor_sugerido` impresso em `state.json` → `last_sync.meetrox`. Detalhes: `System/config/sources.yml` (fonte `meetrox`). **L**, sem confirmação. Religado, a extração para o grafo usa o mesmo `pipeline/grafo-reuniao.mjs --bruto Inbox/_raw/meetrox/<call_id>` (§ 6).

## 8. Rotinas do cérebro (comandos e subagentes)

| Quando eu quiser… | Use | Faz | Escreve em |
|---|---|---|---|
| Planejar o dia (intenção, Top 3, blocos, riscos) e mexer no TODO/anotações pela página | `/checkin` → skill `checkin` (Painel do Jarvis no Artifact; grava pelo MCP `jarvis-escrita`) + `System/prompts/checkin.md` | lê Briefing, TODO e `jarvis_compromissos`/`jarvis_reunioes`/`jarvis_timeline`/`jarvis_buscar` | `## Check-in` do Daily, `log.md` |
| Fechar o dia (feito, travado, aprendizados, amanhã) | `/checkout` → `System/prompts/checkout.md` | infere o dia pelo grafo e log; confirma comigo; compromisso cumprido → `status: concluido` + `concluido_em` | `## Checkout` do Daily, `TODO.md`, `Compromissos/`, `log.md` (+ commit local) |
| Gravar no grafo as reuniões que acabaram | `/pos-reuniao` → `System/prompts/pos-reuniao.md` | transcrição do Teams → pedidos por chunk → subagentes `extrator-reuniao` → merge/validate/apply | `Reunioes/`, `Pessoas/`, `Projetos/`, `Temas/`, `Decisoes/`, `Compromissos/`, `TODO.md`, `index.md`, `log.md` |
| Estudar um link/livro/vídeo/tópico | `/aprender` → `System/prompts/aprender.md` | minicurso em módulos com fontes literais e página HTML | `Aprender/<slug>/<slug>.md`, `<slug>-fontes.md`, `<slug>.html`, `Aprender/fila.md` (+ Artifact privado) |
| Curso longo / várias fontes | subagente `professor` (`.claude/agents/professor.md`) | mesma rotina do `/aprender`, em contexto separado | idem |
| Criar/mover/comentar card no Jira | `/jira` | prévia em lote → "sim" → executa | Jira (com confirmação), `TODO.md`, `log.md` |
| Ver as frentes de forma holística (kanban, sessões do Claude, Jira, Teams, contexto) e tocar várias sessões lado a lado | `/torre` (`torre/`, Jarvis em `http://127.0.0.1:4477`; `/torre instalar`, `/torre reiniciar`). Frente = `Projetos/<id>.md` com `frente: true` (+ `repo`, `pastas`, `jira_jql`, `teams_busca`) | Visão geral, Geral e uma aba por frente; cada card de terminal é um `claude` de verdade; Jira/Teams buscados só leitura ao clicar em Atualizar | `TODO.md` (mover/criar tarefa da frente, via `jarvis_tarefa`, com log); estado em `%USERPROFILE%\.torre` |
| Ler 5 minutos sobre agentes de IA ligados às frentes | `/conhecimento` (`System/prompts/conhecimento.md`; roda no ritual) | posts com link do Marcelo Mendes nos canais da comunidade Tecnologia e Produto + notícia, vídeo e repo, com "como usar" | `System/conhecimento/AAAA-MM-DD.json`; `/conhecimento nota` → `Aprender/pilulas/AAAA-MM-DD.md` |
| Ver todas as features e como usar | `/guia` (skill `.claude/skills/guia/`) — abre sozinho no início da conversa | abre o Artifact; se a estrutura mudou, regenera o JSON de `System/guia/guia.html` e republica | `System/guia/guia.html`, `System/config/guia.json`, `log.md` |

## 9. Outros

| Quando eu quiser… | Use | L/E | Conf. |
|---|---|---|---|
| Agendar rotina (check-in 09:00, checkout 18:00, ritual 07:30, semanal) | MCP `scheduled-tasks` (`list_scheduled_tasks`, `create_scheduled_task`, `update_scheduled_task`) | E (config) | **sim** |
| Página visual (minicurso, painel) | ferramenta `Artifact` (privado por padrão) | E | não para publicar privado |
| Dados do datalake | conector Datalake (BigQuery), projectId definido na instrução da organização | L | não |

Índice: [[index]]
