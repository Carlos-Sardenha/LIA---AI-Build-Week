# .harness — GraphRAG do segundo cérebro (servidor MCP `jarvis`)

Lê o vault como grafo e responde perguntas com citação. O servidor `jarvis` é **só leitura**: nada nele escreve no vault, no ClickUp, no Jira ou no Outlook. Node ≥ 22 (testado no 24), ESM, **zero dependências** de runtime.

Ao lado, o servidor `jarvis-escrita` (`escrita.mjs` + `lib/escrita.mjs`) é a escrita **estreita** do Painel do dia (skill `checkin`): `jarvis_painel` (leitura em JSON), `jarvis_checkin_gravar`, `jarvis_anotar`, `jarvis_tarefa` (criar, concluir, reabrir, mover, editar) e `jarvis_capturar`. Só Daily (Check-in e Anotações), linhas do `TODO.md` e `Inbox/manual/`; nunca apaga, toda escrita deixa linha no `log.md`. Nunca escreve fora do vault.

Padrão herdado do GraphRAG do painel CSM (servidor MCP stdio em `.mjs`, grafo em memória lido do vault, grep literal sem acento, BM25, "sem citação literal, sem evidência", chaves imutáveis, campos manuais nunca sobrescritos). O schema é **próprio**: `System/schema/grafo.md`.

## Como roda

- **No Claude Code**: `.mcp.json` na raiz do vault registra o servidor `jarvis` (`node .harness/mcp.mjs`, caminho relativo — abra o Claude Code na raiz do vault). As ferramentas aparecem como `jarvis_*`.
- **No terminal** (mesmas funções):

```powershell
node .harness/consulta.mjs cobertura
node .harness/consulta.mjs reunioes --pessoa ana --periodo 30d
node .harness/consulta.mjs compromissos --pessoa bruno-souza --vencidos
node .harness/consulta.mjs grep "post-mortem|postmortem" --pasta Reunioes/
node .harness/consulta.mjs buscar "perfis de acesso" --cliente acme
node .harness/consulta.mjs timeline acme
node .harness/consulta.mjs evidencias --tipo decisao
```

Nomes nos exemplos (`acme`, `beta`, `ana-lima`, `bruno-souza`, ids como `1234567`) são os fictícios da fixture.

- **Testes** (fixture fictícia em `testes/fixture/`, nunca dados reais). Na raiz do vault, qualquer um:

```powershell
npm --prefix .harness test
node --test ".harness/testes/*.test.mjs"
```

(ou `npm test` de dentro de `.harness/`).

## Ferramentas

| Ferramenta | Para quê |
|---|---|
| `jarvis_cobertura` | O que o grafo cobre: nós por tipo e datas, arestas, evidências, TODO, Inbox não ingerido, órfãs, links quebrados. Chame antes de responder. |
| `jarvis_buscar` | BM25 sobre todas as notas + ligações de cada resultado. Pergunta aberta. `"frase"` exige literal. |
| `jarvis_grep` | Literal, linha a linha, sem caixa/acento, exaustivo (`a\|b` = OU, `exigir` = E na mesma nota). |
| `jarvis_no` | Propriedades, saídas e backlinks agrupados por tipo de aresta, evidências. |
| `jarvis_vizinhos` | BFS até 3 saltos; não atravessa hubs (cliente, TODO, daily, semanal). |
| `jarvis_reunioes` | Filtros pessoa (participante × citada no corpo), cliente, tema, projeto, período. |
| `jarvis_compromissos` | Nós `Compromissos/` + tarefas do `TODO.md` (inclui "Aguardando" com `quem:`); abertos/vencidos/por pessoa/cliente. `abertos` = `aberto`, `em_andamento`, `aguardando` (sem status também conta; valor fora do schema, como `pendente`, não). Linha do TODO cujo `ctx` aponta para um compromisso já listado não se repete: vira `· TODO.md:N` no compromisso. |
| `jarvis_temas` | Temas com nº de reuniões, compromissos, decisões; `recorrentes` = ≥ 2 reuniões. |
| `jarvis_decisoes` | Decisões com onde/por quem/status e a evidência literal. |
| `jarvis_timeline` | Tudo ligado a um nó em ordem de data, ou o vault num período (pessoa/cliente só entram filtrando por tipo). |
| `jarvis_ler` | Nota com números de linha (use com o `arquivo:linha` do grep). |
| `jarvis_evidencias` | Lista as evidências e confere se o trecho existe **literalmente** no bruto apontado. |

Períodos: `hoje`, `semana`, `semana-passada`, `mes`, `7d`, `30d`, `90d`, `proximos-7d`, ou `desde`/`ate` (AAAA-MM-DD, America/Sao_Paulo).

## O que é lido

- Todo `.md` do vault, exceto `System/Archive/`, `System/templates/`, `Inbox/_raw/`, `.claude/`, `.harness/`, `.obsidian/`, `.git/`. Isso vale para o grep também (bruto e arquivo nunca aparecem em resposta).
- Viram **nós**: notas das pastas de conteúdo (Clientes, Pessoas, Reunioes, Projetos, Temas, Decisoes, Compromissos, Notes, Aprender, Daily, Semanal) e `TODO.md` (tipo `todo`, hub). `index.md`, `log.md`, `CLAUDE.md`, `System/` e `Inbox/` só no grep.
- **Tipo**: `type` (ou `tipo`) do frontmatter manda; sem ele, a pasta. Em `Aprender/` só `Aprender/<slug>/<slug>.md` é `curso` (chave = slug); `<slug>-fontes.md`, `fila.md` e afins sem `type` viram `nota`.
- **Arestas**: propriedade de frontmatter com wikilink (nome da propriedade = tipo da aresta); em propriedades de aresta (`org`, `cliente`, `participantes`…) texto puro igual a uma chave existente também conta. Wikilink no corpo = aresta `menciona`. `[[pasta/x|rótulo]]` → `x`. Wikilink dentro de bloco de código (cerca ```` ``` ````/`~~~` ou código inline) é exemplo, não aresta.
- **Evidências**: itens da seção `## Evidências` (fora de bloco de código). Formato canônico (D1): `- "trecho literal" — Autor · fonte: System/Archive/raw/AAAA-MM/<fonte>/<item>/turnos.txt#tNNNN` (antes do arquivamento, `Inbox/_raw/<fonte>/<item>/turnos.txt#tNNNN`; e-mail/chat: âncora = id da mensagem). Também lê o legado `- "trecho" — meetrox:<id> turno:tNNNN [· \`caminho\`]`. Na conferência, um ponteiro `Inbox/_raw/…` já arquivado é achado em `System/Archive/raw/*/…` (e vice-versa), o legado sem caminho é procurado nos dois lugares, e com âncora `tNNNN` o trecho precisa estar naquele turno (ou em até 2 seguintes do mesmo falante). A aspa de fechamento é a última antes do separador do autor (`—`, `–` ou `-`): aspas e apóstrofos dentro do trecho não cortam a citação. E-mail/chat: `mensagens.txt#<messageId>` — cada mensagem começa com `[<messageId>]` no início da linha; o trecho precisa estar no bloco daquela mensagem (até o próximo `[id]`), senão "fora da mensagem <id>" ou "a mensagem <id> não existe no bruto". Bruto de `/aprender`: `System/Archive/raw/AAAA-MM/aprender/<slug>/` (ou o antigo `System/Archive/raw/aprender/<slug>/`, achados um pelo outro); o ponteiro pode ser um arquivo da pasta ou a pasta (procura em todos os arquivos de texto dela).
- `fundir_em: "[[canonico]]"` redireciona as arestas da duplicata (mesmo tipo; cadeia; ciclo é reportado).
- O grafo é relido a cada 60 s (`JARVIS_TTL_MS`). `JARVIS_VAULT` aponta para outro vault (os testes usam isso).

## Arquivos

| Arquivo | Papel |
|---|---|
| `mcp.mjs` | Servidor MCP stdio (JSON-RPC por linha), ferramentas `jarvis_*`, instruções ao modelo. |
| `escrita.mjs` | Servidor MCP stdio `jarvis-escrita` (escrita estreita do Painel do dia). |
| `lib/escrita.mjs` | Operações do painel: funções puras sobre o texto do TODO/Daily + `executar` (IO, `log.md`). Testes em `testes/escrita.test.mjs`. |
| `consulta.mjs` | CLI com as mesmas funções. |
| `lib/vault.mjs` | Parser de frontmatter (YAML plano), wikilinks, evidências, carga do grafo, fusões, resolução de nomes. |
| `lib/grep.mjs` | Dobra de caixa/acento sem mudar posição, padrões, recorte com «marca». |
| `lib/indice.mjs` | Tokenizador pt-BR (stopwords, plural) e BM25. |
| `lib/consultas.mjs` | As consultas (uma função por ferramenta) e o parser do `TODO.md`. |
| `testes/` | `node:test` + fixture fictícia. |

## Limites conhecidos

- Sem embedding: pergunta de sentido depende de variantes no grep ou de termos no BM25.
- Reuniões antigas listam pessoas só no corpo (sem `participantes`): o filtro por pessoa as acha como "citado no corpo", o que não prova participação.
- Status de compromisso é manual; "aberto" antigo é "aberto no registro".
- `jarvis_evidencias` só confere bruto presente nesta máquina (brutos são git-ignored).
