# Agentes de coding do LIA: como usar

Esta pasta tem os **8 agentes de coding** do LIA. Eles seguem o [harness engineering](https://openai.com/pt-BR/index/harness-engineering/) da OpenAI: **humano dirige, agente executa**. A gente diz *o quê* e *o critério de aceitação*, e os agentes escrevem, revisam e mesclam o código. O nosso trabalho é cuidar do ambiente: docs, regras, lint e ferramentas.

Cada `.md` daqui (menos este README) é um agente (subagente do Claude Code): o frontmatter tem `name`, `description` (quando usar) e `tools`, e o corpo é o prompt dele. O Claude Code acha os agentes sozinho quando a sessão abre na raiz do repositório.

Resumo curto também em [docs/agents.md](../../docs/agents.md).

## Os 8 agentes

| # | Agente | Papel | Quando | Edita código? |
|---|---|---|---|---|
| 1 | `fundador` | Monta o esqueleto do projeto: estrutura por domínio e camadas, CI, lint de camadas, `AGENTS.md`, `ARCHITECTURE.md` e `docs/` | Uma vez, ao escolher a stack | sim |
| 2 | `executor` | Implementa a tarefa de ponta a ponta e abre o PR | A cada tarefa | sim |
| 3 | `auto-revisor` | Revisa o próprio diff antes de pedir revisão e devolve a lista do que corrigir | Logo depois de implementar | **não** |
| 4 | `revisor` | Revisa o PR com **um foco** (correção, arquitetura, segurança, testes ou performance) e dá o veredito | Vários em paralelo, um por foco | **não** |
| 5 | `loop-de-revisao` | Leva o PR até o fim: revisões, comentários e CI, repetindo até aprovar ou parar de progredir. Depois mescla | Com o PR aberto | sim |
| 6 | `jardineiro-de-docs` | Corrige doc que não bate com o código, com PRs pequenos | Rotina (toda noite) | só docs |
| 7 | `coletor-de-lixo` | Faxina de padrões ruins e dívida técnica, e atualiza o `QUALITY_SCORE.md` | Rotina (quinta) | sim (refatoração) |
| 8 | `ponta-a-ponta` | Resolve um bug ou feature inteiro com um comando: reproduz, corrige, prova, abre o PR e mescla | Com o repo maduro | sim |

## O fluxo de uma tarefa

~~~
executor → auto-revisor → loop-de-revisao (chama os revisores em paralelo) → merge
~~~

1. **`executor`** lê o `AGENTS.md`, só os docs que a tarefa pede, implementa, testa e abre o PR.
2. **`auto-revisor`** olha o diff e aponta o que corrigir. O `executor` corrige.
3. **`loop-de-revisao`** chama os `revisor` (no mínimo correção e arquitetura), responde os comentários, conserta o CI e repete.
4. Tudo verde e aprovado → compacta os commits e mescla (se o repo permitir merge por agente).

## Como usar

1. **Abra o Claude Code na raiz do LIA**, de preferência numa **worktree própria** da sua trilha (cada trilha roda sua instância do app sem pisar nas outras).
2. **Descreva a tarefa com o critério de aceitação** e diga qual agente usar. Exemplos:

   ~~~
   usa o executor pra fazer a extração de PDF do domínio exames: cada resultado vira nota com valor, unidade, faixa de referência, data e link pro original. Depois leva o PR até o fim com o loop-de-revisao
   ~~~

   ~~~
   usa o revisor com foco em segurança no PR #12
   ~~~

   ~~~
   usa o auto-revisor no meu diff antes do PR
   ~~~

   ~~~
   roda o jardineiro-de-docs
   ~~~

   ~~~
   usa o ponta-a-ponta pra resolver: o alerta de ritmo irregular não aparece na linha do tempo
   ~~~

3. **Acompanhe pelo PR.** O progresso mora no git e no PR, não na conversa. O `loop-de-revisao` relê tudo a cada volta, então dá pra interromper e retomar.
4. **Responda só quando o agente pedir uma decisão** (produto, conflito entre revisores, mudança de escopo). Tarefa mecânica é com ele.

## Detalhes de cada um

### 1. `fundador`

Roda **uma vez**, quando a stack for escolhida. Entrega:

- app dividido por domínio (`exames`, `wearables`, `linha-do-tempo`, `alertas`, `perguntas`, `compartilhamento`), com as camadas `types → config → repo → service → runtime → ui` e dependência só pra frente;
- assuntos transversais (IA, armazenamento, consentimento) entrando por `providers/`;
- CI com build, testes, lint e um **lint de camadas** cuja mensagem de erro já diz como corrigir;
- o `AGENTS.md` como mapa (~100 linhas), o `ARCHITECTURE.md` e a estrutura de `docs/`;
- como subir o app isolado por worktree.

Regras: tecnologia "chata" e conhecida, nada de segredo (só `.env.example`) e nada de regra que não dá pra checar. Termina com a árvore criada e os comandos de build, teste e app.

### 2. `executor`

1. Lê o mapa (`AGENTS.md`) e só os docs da tarefa.
2. Planeja. Mudança grande ganha plano em `docs/exec-plans/active/<tarefa>.md`, com log de progresso.
3. Implementa respeitando as camadas. Se o lint reclamar, segue a instrução da mensagem.
4. Testa, com testes passando e o app rodando na worktree.
5. Abre o PR com `gh` (o que mudou, por quê e como foi validado).
6. Fecha o plano: move pra `completed/` e registra a dívida no `tech-debt-tracker.md`.

Se faltar ferramenta, doc ou regra, ele **não força**: diz o que falta.

### 3. `auto-revisor`

Olha só `git diff main...HEAD` e confere:

- critério de aceitação;
- camadas;
- invariantes (dado validado na borda, log estruturado, nomes);
- testes;
- duplicação;
- sujeira (debug, código comentado, segredo);
- docs que ficaram mentindo.

Devolve uma lista do mais grave ao mais leve, com `arquivo:linha`, ou "pronto para revisão". Não edita.

### 4. `revisor`

Um foco por instância:

| Foco | Procura |
|---|---|
| correção | bug de lógica, caso de borda, erro não tratado, critério não atendido |
| arquitetura | camada quebrada, dependência no sentido errado, abstração duplicada |
| segurança | entrada sem validação, segredo exposto, permissão faltando, injeção |
| testes | regra sem teste, teste que não falharia se o código quebrasse |
| performance | consulta em loop, trabalho repetido, meta de tempo não atingida |

Só reporta o que consegue **provar** (arquivo, linha e cenário), comenta no PR e termina com **APROVADO** ou **MUDANÇAS NECESSÁRIAS**. No LIA, o foco **segurança** roda em todo PR que mexe em upload, armazenamento, consentimento ou chamada de IA (o repo é público e o tema é saúde).

### 5. `loop-de-revisao`

O "Ralph Wiggum loop": auto-revisão → revisores em paralelo → ler e responder **todos** os comentários → conferir o CI → repetir até aprovar.

Para antes quando fica **sem progresso**:

- 2 voltas com os mesmos comentários ou o mesmo erro (dá pra mudar: "para depois de N voltas");
- revisores pedindo coisas opostas;
- o mesmo teste instável falhando de novo.

Aí resume o que trava e a decisão que falta. Nunca usa `--force` na principal nem pula hook. Comentário de humano pesa mais que de agente.

### 6. `jardineiro-de-docs`

Doc errado é pior que doc faltando, porque o agente acredita no que lê. Ele confere:

- docs × código;
- se o `AGENTS.md` continua curto;
- links e índices;
- planos já entregues (vão pra `completed/`);
- arquivos em `docs/generated/`;
- decisão solta em PR que não virou doc.

Abre **um PR pequeno por assunto**, com a prova. Nada pra corrigir → "docs em dia".

### 7. `coletor-de-lixo`

Paga a dívida em parcelas pequenas. Procura desvio dos princípios (`docs/design-docs/core-beliefs.md`), priorizando o que mais se repete, atualiza o `QUALITY_SCORE.md` e o `tech-debt-tracker.md` e abre **no máximo 5 PRs por rodada**, um por padrão. Nunca mistura refatoração com mudança de comportamento. Se o mesmo desvio volta, propõe um lint.

### 8. `ponta-a-ponta`

O modo mais autônomo. Precisa do repo maduro: app por worktree, browser controlável e logs acessíveis.

1. Valida que a `main` está verde.
2. Reproduz o bug e guarda a evidência **antes**.
3. Corrige, com teste que falhava e agora passa.
4. Prova no app, com evidência **depois**.
5. Abre o PR com as duas evidências.
6. Chama o `loop-de-revisao`.
7. Mescla.

Chama humano só pra decisão, mandando as opções e a recomendação dele. Nunca mexe em produção nem em dado real.

## Regras que valem pra todos

- **Quando o agente errar, não corrija o código na mão.** Pergunte o que faltou (doc, ferramenta, regra) e peça pro agente escrever essa melhoria no repo. Agente travou duas vezes no mesmo ponto → para, melhora o repo e tenta de novo.
- **Revisão que se repete é regra que ainda não foi escrita**: vira lint ou doc.
- **Nunca grave segredo** nem dado de saúde real. Só dado sintético em `data/sintetico/`.
- **Todo número mostrado aponta pra fonte**, e a IA orienta, não diagnostica (ver `docs/design-docs/core-beliefs.md`).

## Criar um agente novo

1. Crie `<nome>.md` nesta pasta com o frontmatter:

   ~~~
   ---
   name: <nome>
   description: <o que faz e QUANDO usar, com as frases que devem ativar>
   tools: Read, Glob, Grep
   ---
   ~~~

2. No corpo, escreva: o papel, o fluxo numerado, as regras e o formato da saída.
3. Dê só as ferramentas que ele precisa. Revisor não ganha `Write`.
4. Atualize este README e o `docs/agents.md`.
