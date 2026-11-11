---
description: Adiciona (ou conclui) uma atividade no TODO.md com quadrante Eisenhower
argument-hint: <tarefa, prazo, cliente> | feito <trecho da tarefa>
---

Siga `CLAUDE.md` § TODO.

- Se o texto começar com "feito" / "concluí": encontre a tarefa correspondente no `TODO.md` (confirme comigo se houver mais de uma), marque `[x]`, acrescente `| feito: <hoje>` e mova para "Concluídas". Se houver nó em `Compromissos/` ligado a essa tarefa (campo `todo:` ou mesmo `oque`), atualize-o também: `status: concluido` + `concluido_em: <hoje>`.
- Se o texto for um compromisso assumido ("prometi enviar X para [[ana-lima]] até 2026-10-30"), além da linha no TODO crie o nó em `Compromissos/` por `System/templates/compromisso.md` (`assumido_por: ["[[mateus-falcao]]"]`, `status: aberto`, `firmado_em` = Daily de hoje).
- Caso contrário: reescreva como verbo + objeto, converta datas relativas em absolutas, identifique cliente/projeto/pessoa (Grep no vault; use wikilink só se a nota existir ou se a criar agora do template), escolha o quadrante (P1–P4 ou Aguardando) e insira a linha com `fonte: manual | criado: <hoje>`.

Atualize `updated:` do TODO e registre `## [data hora] tarefa | <resumo>` no `log.md`. Responda em 1 linha: a linha inserida e o quadrante.

Entrada: $ARGUMENTS
