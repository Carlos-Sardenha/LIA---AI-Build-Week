# Rotina — Ritual matinal (dreaming + briefing)

Roda no **início do dia** (seg–sex 07:30, local, Claude Code). Consolida o que aconteceu desde o último ritual e entrega o briefing do dia. Siga o `CLAUDE.md`.

Hora atual: `Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"`. "Hoje" = essa data.

## Antes de tudo: log técnico
Crie `System/Dreaming/YYYY-MM-DD.md` (se já existir, acrescente `## Execução adicional — HH:MM`, nunca sobrescreva) com as seções abaixo e preencha cada uma AO CONCLUIR a fase:

```markdown
---
created: <agora>
type: dreaming
source: ritual
tags: [dreaming, log]
---
# Ritual — YYYY-MM-DD
## Fase 1 — Sync das fontes
## Fase 2 — Ingest
## Fase 3 — TODO: repriorizar
## Fase 4 — Reconciliar e curar
## Fase 5 — Índice
## Fase 6 — Briefing
## Estatísticas
Índice: [[index]]
```

## Fase 1 — Sync
Execute `System/prompts/sync-fontes.md` por inteiro, cobrindo as fontes **ativas** de `System/config/sources.yml` (hoje: Outlook, Agenda, Teams, Jira, Claude Code, Manual; Meetrox e ClickUp estão `ativo: false`) e o espelho do perfil no Teams. Guarde os avisos de fonte indisponível para o briefing. Fonte inativa não gera aviso nem subseção no "Entrou desde o último ritual".

**Meetrox** (só se `ativo` no `sources.yml`):
1. Rode na raiz do vault: `node pipeline/meetrox.mjs` (precisa de `MEETROX_API_KEY` no ambiente; ausente → "⚠ Meetrox indisponível: chave ausente" no briefing e siga). `--dry-run` só lista, sem gravar.
2. O script grava o bruto em `Inbox/_raw/meetrox/<call_id>/` (`call.json`, `transcript.txt`, `turnos.txt` numerado `tNNNN`) e a destilação em `Inbox/meetrox/`, e imprime um JSON no stdout com `cursor_sugerido`.
3. Exit 0 → grave esse valor em `System/config/state.json` → `last_sync.meetrox` (crie a chave se faltar; chaves ausentes valem `null`). Exit ≠ 0 → **não** avance o cursor e registre o erro no log técnico. O script só lê o cursor; quem escreve é o ritual.
4. Anote no log técnico a `contagem` e as calls `sem_transcricao`/`erros` (ficam para a próxima execução).

## Fase 2 — Ingest
Execute `System/prompts/process-inbox.md` por inteiro (inclui capturas manuais e `/cerebro` acumuladas).

## Fase 3 — TODO: repriorizar
Em `TODO.md`:
1. Tarefa com prazo ≤ 2 dias úteis ou vencida → sobe para **P1** (vencida ganha ` | VENCIDA` no fim da linha).
2. "Aguardando" com `cobrar:` ≤ hoje (ou `desde:` > 5 dias úteis sem `cobrar:`) → marcar para cobrança no briefing.
3. `[x]` com `feito:` > 7 dias → mover para `System/Archive/todo/YYYY-MM.md`.
4. P1 com mais de 7 itens → sinalize sobrecarga no briefing (não rebaixe sozinho).
5. Atualizar `updated:` e as seções "Tarefas abertas" das notas de cliente/projeto tocadas.

## Fase 4 — Reconciliar e curar (leve; o profundo é o `/lint`)
- Duplicatas óbvias criadas hoje (mesma pessoa/cliente/tema com nomes diferentes) → a nota duplicada **fica no lugar** e ganha `fundir_em: "[[canonico]]"` no frontmatter (o harness redireciona as arestas); traga para a canônica o que só existia na duplicata. Nunca mova para `System/Archive/` nem renomeie (a chave é imutável). Mesma tarefa duas vezes no TODO → manter uma linha só, registrando no log.
- Contradição nova (ex.: prazo mudou, contato trocou) → manter o mais recente, registrar evolução ("antes X, desde data Y").
- Notas novas sem link → ligar ao cliente/projeto/pessoa certo.

## Fase 5 — Índice
Atualize `index.md` (§ Agora: link do Daily de hoje; seções com páginas novas; Reuniões recentes = últimas 10). Corrija wikilinks quebrados que você criou.

## Fase 6 — Briefing (o produto do ritual)
Escreva `Daily/YYYY-MM-DD.md` a partir de `System/templates/daily.md` (ordem fixa: Briefing → Entrou desde o último ritual → Check-in → Anotações do dia → Checkout). O ritual preenche **só** Briefing e "Entrou desde o último ritual"; deixa os placeholders de Check-in (`/checkin`, 09:00) e Checkout (`/checkout`, 18:00). Se o Daily já existir (execução adicional ou check-in rodou antes), atualize só as seções do ritual — nunca sobrescreva Check-in, Anotações ou Checkout.

Ao montar o Foco do dia, leia o bloco **Amanhã** do `## Checkout` do último Daily útil: é o que o Mateus planejou na véspera e tem precedência como candidato.

```markdown
---
created: <agora>
updated: <agora>
type: daily
source: ritual
tags: [daily]
---
# YYYY-MM-DD — <dia da semana>

## Briefing
**Foco do dia** (máx. 3, de P1): …
**Agenda**: HH:MM título — cliente [[x]] · 1 linha de pré-contexto (última
interação + tarefa aberta com ele) …
**Vencendo / vencidas**: …
**Cobrar hoje**: <item> — [[pessoa]] (desde data)
**Ontem em 3 linhas**: o que entrou/mudou.
**Conexão** (só se real): padrão entre clientes/fontes.
**Saúde**: N tarefas abertas (P1 a / P2 b / P3 c / P4 d) · N clientes · ⚠ fontes indisponíveis

## Entrou desde o último ritual
### Outlook
### Agenda
### Teams
### Meetrox
### ClickUp
### Jira
### Claude Code
### Manual
- resumo com [[links]] para páginas criadas/atualizadas (fonte sem novidade =
  "nada novo"; fonte indisponível = "⚠ indisponível: <motivo>")

## Check-in
_(preenchido pelo /checkin às 09:00)_

## Anotações do dia
(livre para o Mateus)

## Checkout
_(preenchido pelo /checkout às 18:00)_
```

Regras do briefing: honesto e curto (≤ ~25 linhas na seção Briefing). Dia sem novidade = dizer isso. Nunca invente reunião, prazo ou insight.

Para cada reunião **com cliente** de hoje, garanta `Reunioes/YYYY-MM-DD-<slug>.md` com a seção "Pré-contexto" preenchida.

## Fase 7 — 5 min de conhecimento
Rode `System/prompts/conhecimento.md` (passos 1 a 4 e 6): posts do Marcelo Mendes na comunidade Tecnologia e Produto desde `last_sync.conhecimento`, mais notícia, vídeo e repo de agentes de IA, cada um com "como usar" nas frentes. Grava `System/conhecimento/<hoje>.json` (o cartão do Jarvis lê dali) e acrescenta ao Briefing a linha `**5 min de conhecimento**: <destaque> (N itens · no Jarvis)`. Falhou (Teams fora, sem rede): registre no Dreaming e siga — não bloqueia o ritual. A nota no vault só sai com `/conhecimento nota` ou pelo botão do cartão.

## Fechamento
1. Estatísticas no log técnico (capturas, notas criadas/atualizadas, tarefas novas/fechadas, fontes com erro).
2. `log.md`: `## [data hora] ritual | Ritual matinal` + 3–5 bullets.
3. `state.json`: `last_ritual` = agora; confira que cada `last_sync.<fonte>` (`outlook`, `agenda`, `teams`, `meetrox`, `clickup`, `jira`, `claude_sessions`…) só avançou se a fonte rodou sem erro.
4. `git add -A; git commit -m "ritual YYYY-MM-DD"`, depois `System/scripts/verificar-publicavel.ps1 -Silencioso`; exit 0 → `git push origin main` (reprovou → sem push, registre no Dreaming e no briefing).
5. **Mensagem final** = a seção Briefing, em texto simples (vai como notificação). Não proponha Top 3 nem blocos de tempo aqui — isso é do check-in (`System/prompts/checkin.md`), que roda às 09:00 em cima deste briefing.

## Encaixe no dia
| Hora (seg–sex) | Rotina | Escreve no Daily |
|---|---|---|
| 07:30 | Ritual matinal (`/ritual`) | Briefing, Entrou desde o último ritual |
| 09:00 | Check-in (`/checkin`) | Check-in |
| livre | Mateus | Anotações do dia |
| 18:00 | Checkout (`/checkout`) | Checkout (+ TODO, log, commit) |

Se o ritual atrasar e rodar depois das 09:00, ele não toca no Check-in já gravado; o briefing ganha a linha "Ritual rodou às HH:MM — revisar o check-in".
