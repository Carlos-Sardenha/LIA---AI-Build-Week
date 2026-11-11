# Rotina — Checkout do dia (fechamento)

Roda às **18:00 seg–sex** (agendado) ou sob demanda com `/checkout`. Fecha o dia: o que foi feito, o que travou, o que se aprendeu e o que fica para amanhã. Mantém o `TODO.md` honesto. Siga o `CLAUDE.md`.

Hora atual: `Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"`. "Hoje" = essa data.

## Modo de execução
- **Interativo** (`/checkout`, com o Mateus): infira primeiro, pergunte depois, aplique só o que ele confirmar.
- **Agendado** (sem o Mateus): **não marque nada como feito no TODO** com base em inferência. Registre o checkout com `**Status**: a confirmar` e liste as conclusões prováveis como "Provável feito (confirmar)". Exceção: tarefa importada de ClickUp/Jira que a fonte já mostra fechada pode ser marcada `[x]` com "(fechada no ClickUp/Jira)", como no ritual.
- Se `## Checkout` já existir hoje: no interativo, confirme/complete o existente (substitua o "a confirmar"); no agendado, não faça nada.

## Fase 1 — Inferir o dia (somente leitura)
Reúna evidências, sem chamar sync completo:
1. Daily de hoje: `## Check-in` (Top 3, blocos) e `## Anotações do dia`.
2. `log.md` de hoje (tarefas fechadas via `/tarefa`, capturas, `/cerebro`).
3. `Inbox/` e `Inbox/claude-code/` com arquivos de hoje (sessões de trabalho).
4. Reuniões e compromissos de hoje — prefira o servidor MCP `jarvis` (`.harness/mcp.mjs`, no Claude Code `mcp__jarvis__<ferramenta>`, somente leitura):
   - `jarvis_reunioes` com `periodo: hoje` → reuniões registradas hoje, com decisões e compromissos ligados (aconteceram? têm "Notas / decisões"?);
   - `jarvis_compromissos` com `status: abertos` e `pessoa: mateus-falcao` → candidatos a "cumprido hoje" (nó [[mateus-falcao]]);
   - `jarvis_timeline` com `periodo: hoje` → tudo que entrou no grafo hoje;
   - `jarvis_buscar` para achar o compromisso que corresponde a algo que o Mateus disser ("mandei a base para a [[ana-lima]]"). **Fallback sem o servidor**: `Reunioes/` com data de hoje e Grep em `Compromissos/` por `^status: (aberto|em_andamento|aguardando)`.
5. `git log --since=<hoje 00:00> --oneline` no vault (o que mudou).
6. Opcional, só se o Mateus pedir ou no interativo quando faltar evidência: Outlook/Teams somente leitura para ver se uma resposta prometida saiu.

Classifique cada item do Top 3 e cada P1 tocado como: **feito** (evidência explícita), **provável** (indício), **não tocado**, **travado** (há bloqueio nomeado).

## Fase 2 — Perguntar (só interativo)
Em uma única mensagem curta:
1. "Fiz assim: feito = …, provável = …, não tocado = …. Confere?"
2. "O que travou e quem/o que destrava?"
3. "Algum aprendizado que valha guardar?"
4. "Energia hoje (1–5)? (opcional)"
5. "O que é o primeiro da manhã?"
6. "O que você quer que eu coloque no Jira?" — sempre pergunte. Sugira candidatos (tarefas novas do TODO, avanços em cards DAD), cada card com link e título. Aceite respostas parciais; não insista (a pergunta do Jira é a exceção: faça sempre).

## Fase 3 — Aplicar no TODO
1. **Feito** (confirmado): `[x]`, acrescentar `| feito: <hoje>`, mover para "Concluídas". Se a tarefa tem `ctx` de cliente/projeto, atualize a seção "Tarefas abertas" da nota e `updated:`.
2. **Reagendar** pendências do Top 3 não feitas: ajuste `prazo:` só se o Mateus disser a nova data (no agendado, apenas sugira). Reclassifique quadrante se o prazo mudou, registrando no log.
3. **Travado por alguém** → nova linha em "Aguardando": `- [ ] <o quê> | quem: [[pessoa]] | desde: <hoje> | cobrar: <data> | ctx: [[x]] | fonte: manual` (cobrar padrão = +2 dias úteis). Se a pessoa não tem nota, crie de `System/templates/pessoa.md` ou use texto simples sem wikilink.
4. **Compromisso cumprido** (nó em `Compromissos/`, só com confirmação do Mateus — `status` é campo manual): `status: concluido` + `concluido_em: <hoje>` e `updated:`. Desistiu/não vale mais → `status: cancelado`. Mudou de fase → `em_andamento` ou `aguardando`. Status válidos: `aberto|em_andamento|aguardando|concluido|cancelado`. Nunca altere a chave/nome do arquivo nem outros campos manuais. Se o compromisso tem `todo:`, marque também a linha do TODO. No agendado, só liste como "Provável cumprido (confirmar)". Compromisso novo dito pelo Mateus ("prometi X ao Y até Z") → crie a nota de Compromisso por `System/templates/compromisso.md` (`assumido_por: ["[[mateus-falcao]]"]`) e a tarefa correspondente no TODO.
5. **Aprendizado** com substância → nota atômica em `Notes/` (Grep antes; atualizar
   > duplicar) com link para o contexto. Frase solta fica só no Daily.
6. Tarefa nova → regras do `/tarefa` (`fonte: manual | criado: <hoje>`).
7. **Jira** (resposta à pergunta 6): itens escolhidos agora → depois do checkout, fluxo do `/jira` (prévia em lote + "sim"). "Vemos amanhã" → linha P1 `- [ ] Decidir no check-in o que vai para o Jira: (1) … (2) … | prazo: <próximo dia útil> | fonte: manual | criado: <hoje>`. No agendado, só liste os candidatos no Daily.

Nunca altere ClickUp, Jira, Outlook ou Teams. Para pedido de criar/atualizar card no Jira, aponte a ferramenta do catálogo e peça confirmação explícita do Mateus numa ação separada — não faça dentro do checkout.

## Fase 4 — Registrar no Daily
Escreva `## Checkout` no fim do Daily de hoje (crie o Daily do template se não existir):

```markdown
## Checkout
**Status**: confirmado HH:MM | a confirmar (agendado HH:MM)
**Feito**: <item> — [[ctx]] · …
**Provável feito (confirmar)**: … (só no agendado)
**Travado**: <item> — bloqueio: … — destrava: [[pessoa]] (Aguardando criado)
**Aprendizados**: … ([[nota]] se virou nota)
**Amanhã**: 1. … 2. … (máx. 3; alimenta o check-in de amanhã)
**Jira**: <cards a criar/atualizar> | decidir no check-in | nada
**Top 3 do check-in**: 2/3 feitos
**Energia**: 4/5 (opcional; omita se não informada)
```

Atualize `updated:` do Daily.

## Fechamento
1. `TODO.md` e notas tocadas com `updated:` atualizado.
2. `index.md` se surgiu nota nova (Notes/, Pessoas/, Compromissos/).
3. `log.md`: `## [data hora] checkout | Checkout YYYY-MM-DD` + bullets (feitos, travados, aguardando criados, notas novas, status).
4. Git (regra 8): `git add -A; git commit -m "checkout YYYY-MM-DD"`, depois `System/scripts/verificar-publicavel.ps1 -Silencioso`; exit 0 → `git push origin main`. Conteúdo populado é git-ignored, então o commit só carrega mudanças de estrutura (schema, prompts, templates). Se não houver nada staged, não é erro: siga em frente sem commit vazio.
5. **Mensagem final**: Feito / Travado / Amanhã em ≤ 6 linhas. No agendado, termine com "Responda /checkout para confirmar o que foi feito."
