---
created: 2026-10-22T12:00:00-03:00
updated: 2026-10-22T18:00:00-03:00
type: nota
source: manual
tags: [schema, graphrag]
versao: "1.1"
relacionados: ["[[mateus-falcao]]"]
---

# Schema do grafo — segundo cérebro (v1.1)

Contrato entre quem **escreve** no vault (ritual, ingest, check-in/checkout, agentes) e quem **lê** o grafo (`.harness/`, servidor MCP `jarvis`). Padrão GraphRAG (nota = nó, propriedade com wikilink = aresta, evidência literal), com schema **próprio** do segundo cérebro. Complementa o `CLAUDE.md` (convenções gerais de nota); em conflito, o CLAUDE.md manda e este arquivo é ajustado com o Mateus.

> **Exemplos são fictícios** (clientes `acme`/`beta`, pessoas `ana-lima`/`bruno-souza`, ids `1234567`), iguais à fixture de `.harness/testes/`. Esta estrutura vai para o GitHub: nunca ponha aqui nome real de cliente, pessoa ou id real de reunião/card.

## 1. Princípios

| # | Princípio | Consequência prática |
|---|---|---|
| P1 | **Nota = nó; chave = basename do arquivo.** | `Pessoas/ana-lima.md` → nó `ana-lima`. Wikilink resolve pelo basename. |
| P2 | **Chave nunca muda depois de citada.** | Correção de nome vai no H1, em `titulo`/`nome` ou em `aliases`. Duplicata: a nota **fica no lugar** com `fundir_em: "[[canonico]]"` — nunca renomeada, movida para Archive nem apagada. |
| P3 | **Propriedade com wikilink = aresta tipada.** O nome da propriedade é o tipo da aresta. | `cliente: "[[acme]]"` = aresta `cliente` → `acme`. Link no corpo vira aresta fraca `menciona`. |
| P4 | **Sem citação literal, sem evidência.** | Fato afirmado a partir de fonte bruta só vira evidência com o trecho copiado *ipsis litteris* + ponteiro para o bruto (§ 6). Paráfrase não é evidência. |
| P5 | **Campo manual nunca é sobrescrito pela automação.** | Ver § 5. O pipeline só acrescenta (lista por união) ou preenche campo vazio. |
| P6 | **Grafo é só leitura para o harness.** | `.harness/` nunca escreve no vault; quem escreve são os rituais/agentes seguindo este schema. |
| P7 | **Bruto é LGPD.** | Transcrições/chats completos ficam em `Inbox/_raw/` e `System/Archive/raw/` (git-ignored). Nota da wiki guarda só o trecho necessário como evidência, sem CPF, salário, saúde. |

## 2. Nós

Todo nó tem o frontmatter base do CLAUDE.md (`created`, `updated`, `type`, `source`, `tags`). O tipo vem de `type` (ou `tipo`); sem ele, da pasta.

| Tipo (`type`) | Pasta | Chave (basename) | Exemplo de chave | O que é |
|---|---|---|---|---|
| `cliente` | `Clientes/` | `<slug-do-tomador>` | `acme` | Tomador da carteira. Hub do grafo. |
| `pessoa` | `Pessoas/` | `<nome>-<sobrenome>` (sem acento) | `ana-lima` | Pessoa interna ou do cliente. Homônimo real: sufixo da org (`ana-lima-acme`), só na colisão. O Mateus é `[[mateus-falcao]]`. |
| `reuniao` | `Reunioes/` | `AAAA-MM-DD-<slug>` | `2026-10-01-fup-acme` | Uma reunião (Teams, Meetrox, presencial). |
| `projeto` | `Projetos/` | `<slug>` | `plano-de-acao-acme` | Iniciativa com começo e fim. |
| `tema` | `Temas/` | `<slug>`; **com sufixo do cliente quando o tema é do cliente** (`<slug>-<cliente>`) | `integracao-portal-acme` | Tópico **recorrente** que atravessa reuniões/fontes. É o nó que dá recorrência. Tema transversal (não é de um cliente) fica sem sufixo. |
| `decisao` | `Decisoes/` | `AAAA-MM-DD-<slug>` | `2026-10-01-excecao-so-com-aval-da-ana` | Decisão tomada (por quem, onde, por quê). |
| `compromisso` | `Compromissos/` | `AAAA-MM-DD-<quem>-<slug>` | `2026-10-01-ana-lima-enviar-base` | Ação **assumida por alguém** (inclusive o Mateus), com status e prazo. |
| `nota` | `Notes/` | `<titulo-que-afirma-a-ideia>` | `reuniao-sem-pauta-vira-status` | Nota atômica (aprendizado, processo, insight). |
| `curso` | `Aprender/<slug>/` | `<slug>` (arquivo `Aprender/<slug>/<slug>.md`) | `bm25-na-pratica` | Minicurso do agente de aprendizado. Ver § 4 › curso. |
| `regra` | `RegrasNegocio/` | `<slug>`; hub de repositório = `repo-<nome-do-repo>` | `repo-acme-analytics` | Regra de negócio ou repositório do time de dados (o que faz, regras, padrões, onde está a autoridade). Código não é copiado: consulta ao GitHub quando pedido. |
| `sessao` | `Sessoes/` | `AAAA-MM-DD-<projeto>-<slug>-<id8>` | `2026-10-21-acme-portal-ajuste-do-login-0a1b2c3d` | Sessão do Claude Code inteira, em turnos `tNNNN` (alvo de evidência). Gerada pelo `pipeline/claude-sessoes.mjs` no check-in; cópia íntegra em `Inbox/_raw/claude-code/`. `## Resumo` + `extraido_ate`/`extraido_em` (P) são do subagente `extrator-sessao`, que liga Decisões (`tomada_em`), Compromissos (`firmado_em`) e Notes (`relacionados`) à sessão. Só `## Notas do Mateus` é manual. |
| `daily` | `Daily/` | `AAAA-MM-DD` | `2026-10-22` | Briefing do dia. |
| `semanal` | `Semanal/` | `AAAA-Www` | `2026-W43` | Revisão semanal. |

Fora do grafo (lidos só pelo `jarvis_grep`/`jarvis_ler`, sem virar nó de domínio): `TODO.md` (lido à parte como lista de tarefas), `index.md`, `log.md`. Ignorados por completo pelo harness: `System/Archive/`, `System/templates/`, `Inbox/_raw/`, `.claude/`, `.harness/`, `.obsidian/`, `.git/`.

### Datas do nó

Ordem de precedência: `data` → data no início da chave (`AAAA-MM-DD-…`) → `created` (dia).

## 3. Arestas (propriedades de frontmatter)

Valor: um wikilink (`"[[x]]"`) ou lista de wikilinks. Em propriedade de aresta, um texto puro igual a uma chave existente (ex.: `org: acme`) também conta como aresta.

| Propriedade | De → Para | Card. | Significado |
|---|---|---|---|
| `participantes` | reuniao → pessoa | N | Quem **participou** (pessoa só citada não entra; vai no corpo). Fica no frontmatter, não só no corpo. |
| `cliente` | reuniao · projeto · tema · decisao · compromisso · pessoa · curso → cliente | 1 (lista se 2 tomadores na sala) | A qual tomador se refere. |
| `org` | pessoa → cliente | 1 | Legado do template de pessoa (`org: acme`). Equivale a `cliente`. Pessoa da casa: `org: wehandle` (sem nó). |
| `projeto` | reuniao · tema · decisao · compromisso · nota · curso → projeto | N | Iniciativa relacionada. |
| `temas` | reuniao · decisao · compromisso · nota · projeto · curso → tema | N | Pautas/tópicos tratados. Reunião → tema é a aresta que conta recorrência. |
| `decisoes` | reuniao → decisao | N | Decisões tomadas na reunião (espelho de `tomada_em`). |
| `compromissos` | reuniao → compromisso | N | Compromissos firmados na reunião (espelho de `firmado_em`). |
| `assumido_por` | compromisso → pessoa | N | Quem assumiu. "Ana e Mateus" = duas pessoas. Mateus = `[[mateus-falcao]]`. |
| `firmado_em` | compromisso → reuniao (ou daily/nota quando veio de chat/e-mail) | 1 | Onde o compromisso nasceu. |
| `tomada_em` | decisao → reuniao (ou daily/nota) | 1 | Onde a decisão foi tomada. |
| `decidido_por` | decisao → pessoa | N | Quem decidiu. |
| `relacionados` | qualquer → qualquer | N | Ligação genérica; nomeie a relação no corpo. |
| `fonte` | qualquer → ponteiro | N | Origem: wikilink de nó **ou** texto `<sistema>:<id>` (`teams:2026-10-20`, `meetrox:1234567`, `jira:ABC-123`, `clickup:1234567`, `outlook:<assunto> (data)`) **ou** caminho do bruto. |
| `fundir_em` | qualquer → mesmo tipo | 1 | Esta nota é duplicata; o harness redireciona as arestas para o canônico. A duplicata **permanece no lugar** (não vai para Archive). |

Não são arestas: `tags`, `aliases`, `travado` e campos escalares.

Espelhos (`decisoes`/`tomada_em`, `compromissos`/`firmado_em`): basta **um** lado; o harness devolve o outro por backlink. Prefira escrever no nó filho (decisão/compromisso) — a nota de reunião não precisa ser reescrita a cada compromisso novo (mas pode listar os que nasceram na própria ingestão da reunião).

## 4. Propriedades por tipo

`*` = obrigatória · **M** = manual (§ 5) · **P** = pipeline (pode ser recalculada). Campo obrigatório sem valor conhecido vai presente e vazio (`null` ou `[]`), nunca omitido.

### cliente
`status`* M (`ativo|implantacao|risco|churn`) · `health` M (`verde|amarelo|vermelho|?`) · `renovacao` M (AAAA-MM-DD) · `aliases` (união) · `squad` M · `ultima_interacao` P.

### pessoa
`org`* (ou `cliente`) · `nome` · `papel` M · `email` · `aliases` (união) · `ultima_interacao` P.

### reuniao
Todos presentes no frontmatter (vazio = `null`/`[]`): `data`* (AAAA-MM-DD) · `participantes`* P (lista de wikilinks de pessoa) · `cliente`* · `projeto`* · `temas`* P · `decisoes`* P · `compromissos`* P · `origem`* P (`meetrox|teams|outlook|manual`) · `meetrox_id`* P · `teams_id`* P (os dois ids são a chave lógica para não duplicar; o que não se aplica fica `null`) · `bruto`* P (pasta do item bruto: `System/Archive/raw/AAAA-MM/<fonte>/<item>/`, ou `Inbox/_raw/<fonte>/<item>/` antes do arquivamento; `null` sem bruto) · `nota_mateus` M (opcional).

**Classificar só depois da reunião.** Reunião futura (tag `futura`) leva só o tipo nas `tags` (`1-1`, `daily`, `time`, `alinhamento`, `cliente`, `projeto`) + `futura`, `participantes` e, se o título do convite nomear, `projeto`/`cliente`. Tags temáticas, `temas`, `relacionados`, `decisoes` e `compromissos` ficam vazios: entram depois que ela acontece, extraídos do que foi falado (transcrição/chat), como num GraphRAG. Uma reunião pode ter várias tags temáticas e `relacionados` com mais de um projeto. Pauta pode citar `[[x]]` no corpo (aresta `menciona`).

### projeto
`status`* M (`ideia|ativo|pausado|concluido`) · `prazo` M · `cliente` · `temas`.

### tema
`titulo`* · `cliente` (obrigatório quando a chave tem sufixo de cliente) · `status` M (`aberto|avancando|travado|resolvido`) · `aliases` (união) · `primeira_vez` P · `ultima_vez` P · `n_reunioes` P · `causa_raiz` M (texto livre curto) · `fundir_em` M.

### decisao
`data`* · `oque`* (frase da decisão) · `tomada_em`* · `decidido_por` (wikilinks de pessoa) · `cliente` · `projeto` · `temas` · `status` M (`vigente|revogada|substituida`) · `substituida_por` M (wikilink).

### compromisso
`oque`* (verbo no infinitivo + objeto) · `assumido_por`* · `firmado_em`* · `data`* (quando foi firmado) · `status`* M (`aberto|em_andamento|aguardando|concluido|cancelado`) · `prazo` M (AAAA-MM-DD ou `sem prazo` — nunca converta fala vaga em data) · `fecha_quando` (condição verificável) · `cliente` · `projeto` · `temas` · `todo` P (linha correspondente no TODO, quando o Mateus é quem deve) · `concluido_em` M. Ao concluir: `status: concluido` **e** `concluido_em: AAAA-MM-DD` (os dois juntos). Cancelado: `status: cancelado`. "Vencido" não é status: é derivado (`status` aberto/em_andamento/aguardando + `prazo` < hoje).

### nota
Atômica (< 300 palavras), `relacionados`/`temas`/`projeto` conforme o caso.

### curso
Arquivos: `Aprender/<slug>/<slug>.md` (o nó, `type: curso`, chave = `<slug>`), `Aprender/<slug>/<slug>-fontes.md` (fontes e trechos citados, apoio do curso) e `Aprender/<slug>/<slug>.html` (página visual). Link: `[[<slug>]]`. Propriedades: `assunto`* · `objetivo`* · `status`* M (`fila|estudando|concluido`) · `modulos_total`* · `modulos_feitos` P · `fonte_original` (URL/livro/vídeo/tópico) · `artifact_url` P (URL do Artifact publicado) · `temas` · `projeto` · `cliente` · `relacionados` (inclui `"[[<slug>-fontes]]"`).

## 5. Campos manuais × pipeline

- **Manual (M)**: escrito pelo Mateus (ou pela LLM *com* confirmação dele no chat). A automação **nunca** sobrescreve; só preenche se estiver vazio/`?`.
- **Pipeline (P)**: recalculável a partir das fontes; pode ser regravado pelo ritual/ingest.
- **Lista por união**: `aliases`, `participantes`, `temas`, `relacionados`, `fonte` — o pipeline só acrescenta.
- **Trava explícita**: `travado: [campo1, campo2]` no frontmatter protege qualquer campo, inclusive P.
- **Corpo**: seções `## Notas do Mateus` (ou qualquer seção marcada `<!-- manual -->`) nunca são reescritas.
- **Chave** (basename): imutável (P2).

## 6. Evidência

Regra: **sem citação literal, sem evidência**. Toda decisão, compromisso e afirmação relevante sobre tema que vier de fonte bruta (transcrição, chat, e-mail) carrega pelo menos uma evidência no corpo, na seção `## Evidências`, um item por linha, **formato único**:

```
- "<trecho literal>" — <Autor> · fonte: <caminho>#<âncora>
```

```markdown
## Evidências
- "Eu mando a base até segunda, pode deixar." — Ana Lima · fonte: System/Archive/raw/2026-10/meetrox/1234567/turnos.txt#t0020
- "Nenhuma exceção nova entra sem o meu de acordo." — Ana Lima · fonte: System/Archive/raw/2026-10/teams/2026-10-20_fup-acme/turnos.txt#t0143
- "Consigo revisar os perfis até dia 25." — Bruno Souza · fonte: System/Archive/raw/2026-10/outlook/2026-10-21_revisao-perfis-acme/mensagens.txt#msg-1234567
```

**Caminho** — o canônico é o bruto **arquivado**: `System/Archive/raw/AAAA-MM/<fonte>/<item>/<arquivo>` (AAAA-MM = mês da reunião/mensagem). Antes do arquivamento, `Inbox/_raw/<fonte>/<item>/<arquivo>` também é válido; o process-inbox reescreve o ponteiro para o arquivado quando move o bruto.

**Âncora** — depende do tipo de bruto:

| Fonte | Arquivo | Âncora |
|---|---|---|
| Transcrição (`meetrox`, `teams` › transcrições) | `turnos.txt` — uma fala por linha, `tNNNN MM:SS Falante: fala` | `#tNNNN` (turno) |
| E-mail (`outlook`) / chat (`teams` › chats e canais) | `mensagens.txt` — cada mensagem começa com `[<messageId>]` | `#<messageId>` |

Toda fonte com transcrição **gera `turnos.txt` numerado** (o sync faz isso para Meetrox e para transcrições do Teams).

- O trecho é **cópia exata** do bruto (pode ser recortado com `…`, nunca reescrito). Erro de ASR fica como está.
- Autor = nome como aparece no bruto (cru do ASR, se não casou com `Pessoas/`).
- Sem bruto (ex.: reunião sem transcrição), a afirmação vai **sem** evidência e com a origem declarada no rodapé (`Origem: outlook:<assunto> (data)`) — o harness a trata como "sem evidência literal".
- Dado sensível (CPF, salário, saúde) não entra no trecho: recorte com `…` ou resuma fora da evidência.
- `jarvis_evidencias` confere se cada trecho existe literalmente no bruto apontado (quando o bruto está na máquina).

## 7. Exemplos

### Reunião

```yaml
---
created: 2026-10-01T15:10:00-03:00
updated: 2026-10-01T15:10:00-03:00
type: reuniao
source: meetrox
tags: [reuniao, fup]
data: 2026-10-01
participantes: ["[[ana-lima]]", "[[bruno-souza]]", "[[mateus-falcao]]"]
cliente: "[[acme]]"
projeto: null
temas: ["[[integracao-portal-acme]]"]
decisoes: ["[[2026-10-01-excecao-so-com-aval-da-ana]]"]
compromissos: ["[[2026-10-01-ana-lima-enviar-base]]"]
origem: meetrox
meetrox_id: 1234567
teams_id: null
bruto: System/Archive/raw/2026-10/meetrox/1234567/
---
```

### Compromisso

```yaml
---
created: 2026-10-01T15:12:00-03:00
updated: 2026-10-01T15:12:00-03:00
type: compromisso
source: meetrox
tags: [compromisso]
data: 2026-10-01
oque: Enviar a base de fornecedores revisada
assumido_por: ["[[ana-lima]]"]
firmado_em: "[[2026-10-01-fup-acme]]"
cliente: "[[acme]]"
temas: ["[[integracao-portal-acme]]"]
status: aberto
prazo: 2026-10-05
fecha_quando: base recebida no e-mail do Mateus
concluido_em: null
---
```

Ao fechar: `status: concluido` + `concluido_em: 2026-10-06`.

### Decisão

```yaml
---
type: decisao
data: 2026-10-01
oque: Nenhuma exceção nova entra sem o "de acordo" da Ana
tomada_em: "[[2026-10-01-fup-acme]]"
decidido_por: ["[[ana-lima]]"]
cliente: "[[acme]]"
temas: ["[[integracao-portal-acme]]"]
status: vigente
---
```

### Tema duplicado

```yaml
---
type: tema
titulo: Integração do portal (duplicata)
cliente: "[[acme]]"
fundir_em: "[[integracao-portal-acme]]"
---
```

### Curso

```yaml
---
type: curso
assunto: BM25 na prática
objetivo: Ajustar a busca do harness com BM25
status: estudando
modulos_total: 4
modulos_feitos: 1
fonte_original: "https://example.com/bm25"
artifact_url: ""
temas: []
projeto: null
cliente: null
relacionados: ["[[bm25-na-pratica-fontes]]"]
---
```

## 8. Como o harness lê (resumo)

- Varre o vault (exceto os ignorados do § 2), parseia frontmatter YAML plano (escalar, lista flow, lista em bloco), wikilinks (`[[x]]`, `[[x|rótulo]]`, `[[x#seção]]`, `[[pasta/x]]` → `x`) e a seção `## Evidências`.
- Monta saídas/entradas (backlinks) por tipo de aresta; `menciona` para links no corpo.
- Busca: `jarvis_grep` (literal, sem caixa/acento, exaustivo) e `jarvis_buscar` (BM25 + vizinhos do grafo).
- Detalhes e ferramentas: `.harness/LEIA-ME.md`.
