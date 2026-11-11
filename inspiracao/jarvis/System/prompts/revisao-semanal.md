# Rotina — Revisão semanal

Sexta 16:30. Fecha a semana e prepara a próxima. Siga o `CLAUDE.md` e o schema do grafo (`System/schema/grafo.md`).

Hora atual: `Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"`. Semana = seg–sex da semana ISO corrente (`Get-Date -UFormat %V`).

## Ferramentas

Prefira o servidor MCP **`jarvis`** (só leitura) com período `semana`; sem ele, use o fallback com Grep/Glob. Comece por `jarvis_cobertura` para saber o que o grafo cobre (e se há Inbox pendente — o que não foi ingerido não entra na revisão).

| Seção | `jarvis` | Fallback |
|---|---|---|
| Reuniões da semana | `jarvis_reunioes` (período `semana`) | Glob `Reunioes/<datas da semana>-*.md` |
| Compromissos | `jarvis_compromissos` (abertos, vencidos, `proximos-7d`) | Grep `^status:`/`^prazo:` em `Compromissos/` |
| Decisões | `jarvis_decisoes` (período `semana`) | Glob `Decisoes/<datas da semana>-*.md` |
| Temas quentes | `jarvis_temas` + `jarvis_reunioes` da semana | Grep `temas:` nas reuniões da semana |
| Histórico de cliente | `jarvis_timeline` (cliente, período `semana`) | Grep `[[<cliente>]]` nas notas da semana |

## Passos

1. **Sync + ingest rápidos**: rode `sync-fontes.md` e `process-inbox.md` para pegar o dia.
2. Leia:
   - os `Daily/` da semana (seg–sex), em especial a seção **`## Checkout`** de cada um (Feito, Travado, Aprendizados, Amanhã, Top 3, Energia) e o `## Check-in`;
   - `TODO.md`, `log.md` da semana e as notas de `Clientes/` atualizadas;
   - `Aprender/fila.md` e os `Aprender/<slug>/<slug>.md` (fontes em `<slug>-fontes.md`) com `status: estudando`.
3. Monte os dados:
   - **Checkouts**: dias com checkout `confirmado` × `a confirmar` × sem checkout; Top 3 cumpridos na semana (soma de "x/3"); itens que apareceram como **Travado** em 2+ dias; itens "Provável feito (confirmar)" ainda não confirmados.
   - **Compromissos**: abertos (`aberto|em_andamento|aguardando`), separados em *Mateus deve* (`assumido_por` inclui `[[mateus-falcao]]`) e *devem ao Mateus/ wehandle*; vencidos; com prazo na próxima semana; firmados nesta semana; fechados nesta semana (`concluido_em` na semana). Status é manual: "aberto" antigo é "aberto no registro".
   - **Temas quentes**: temas com reunião, decisão ou compromisso nesta semana, ordenados por nº de reuniões na semana (desempate: compromissos novos). Marque "novo" se `primeira_vez` cai na semana e ↑ se teve mais reuniões que na semana passada (`jarvis_reunioes` período `semana-passada`).
   - **Aprendizado**: cursos `estudando` com progresso (`modulos_feitos/modulos_total`), módulos concluídos na semana (`log.md` `aprender`, `updated:` do curso), cursos parados > 14 dias (candidatos a voltar para `## Fila`), concluídos na semana, itens novos na fila; aprendizados registrados nos checkouts que viraram (ou deveriam virar) nota em `Notes/`.
   - **Candidatos a card Jira**: compromissos do Mateus e tarefas P1/P2 com trabalho de mais de um dia, envolvendo outro time ou que precisam ser visíveis para o gestor, **sem** `fonte: jira:` no TODO e sem card parecido (dedupe por `jira:` no `TODO.md`). Só listar — criar card é com `/jira`, com prévia e "sim" explícito do Mateus. Nunca escreva no Jira daqui.
4. Escreva `Semanal/YYYY-Www.md`:

```markdown
---
created: <agora>
updated: <agora>
type: semanal
source: ritual
tags: [semanal]
semana: YYYY-Www
---
# Semana YYYY-Www (dd/mm – dd/mm)

## Entregas
- tarefas fechadas e compromissos concluídos na semana, agrupados por cliente/projeto ([[links]])

## Checkouts
- Top 3 cumpridos: N/15 · checkouts confirmados: N/5 (a confirmar: dd/mm, …)
- travado recorrente: <item> — dias dd/mm, dd/mm — destrava: [[pessoa]]
- prováveis feitos ainda sem confirmação: … (confirmar no próximo /checkout)
- energia média: N/5 (só se informada em ≥ 3 dias)

## Travado / escorregou
- tarefas que venceram ou ficaram em P1 a semana toda — por quê (se houver pista)

## Compromissos
- **Mateus deve** (abertos): <oque> — para [[cliente]] — prazo AAAA-MM-DD — [[compromisso]] ⚠ vencido há N dias
- **Devem ao Mateus**: <oque> — [[pessoa]] — prazo — firmado em [[reuniao]]
- firmados nesta semana: N · concluídos: N · vencidos: N

## Decisões da semana
- <oque> — [[decisao]] — tomada em [[reuniao]] (evidência literal: sim/não). Sem decisão, sem seção.

## Temas quentes
- [[tema]] — N reuniões na semana (novo/↑) — status — 1 linha do que mudou
- (máx. 5)

## Carteira
- por cliente tocado: 1 linha de situação; ⚠ clientes sem nenhum toque há > 14 dias
- riscos novos e oportunidades

## Aguardando
- pendências de terceiros abertas > 5 dias úteis (TODO "Aguardando" + compromissos de terceiros)

## Aprendizado
- [[<slug>]] — M/N módulos (+K na semana) · parado há N dias → voltar para a fila?
- concluídos: … · novos na fila: …
- aprendizados dos checkouts: … ([[nota]] se virou nota)

## Propor no Jira
1. <título do card> — origem: [[compromisso/tarefa]] — por quê vale card
- (só proposta; rodar `/jira` para criar após confirmação). Sem candidato, sem seção.

## Próxima semana
- **Top 3** sugeridos (de P1/P2 e compromissos do Mateus com prazo na semana)
- reuniões já marcadas com cliente
- compromissos que vencem na semana (de quem)
- P4 para eliminar (liste; o Mateus decide)

## Padrões da semana
- 1–2 observações reais (onde o tempo foi, temas recorrentes, travas que se repetem). Sem padrão, sem seção.

Índice: [[index]]
```

   Toda afirmação sobre reunião/decisão/compromisso cita o nó (`[[...]]`) e a data. Seção sem conteúdo real é omitida — não encha.

5. Ajustes no TODO: mover `[x]` > 7 dias para arquivo; sugerir (não aplicar) rebaixes. Compromisso do Mateus aberto sem linha no TODO → propor a linha. Nunca altere `status`/`prazo` de compromisso (manuais): liste para o Mateus confirmar.
6. Aprendizado: sugerir (não aplicar) mover cursos parados > 14 dias para `## Fila`.
7. `index.md` § Agora → link da semana. `log.md`: `## [data hora] semanal | YYYY-Www` (contagens: entregas, compromissos abertos/vencidos, temas quentes, cards propostos).
8. `state.json`: `last_semanal`. Git (regra 8 do `CLAUDE.md`): `git add -A; git commit -m "semanal YYYY-Www"`; se não houver nada staged, siga sem commit vazio. Depois `System/scripts/verificar-publicavel.ps1 -Silencioso`: exit 0 → `git push origin main`; reprovou → sem push, reporte.
9. Mensagem final: Entregas (3 linhas) + Top 3 da próxima semana + riscos (compromissos vencidos, clientes sem toque) + "N cards para propor no Jira — rode `/jira` se quiser".
