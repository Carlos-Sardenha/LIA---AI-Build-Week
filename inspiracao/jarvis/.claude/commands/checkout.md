---
description: Checkout do dia — feito, travado, aprendizados, amanhã; atualiza TODO e Daily
argument-hint: [opcional: o que fiz / o que travou, em texto livre]
---

Execute `System/prompts/checkout.md` em **modo interativo**, seguindo o `CLAUDE.md`. Infira o dia, pergunte uma vez, aplique só o que eu confirmar no `TODO.md`, grave `## Checkout` no Daily de hoje, registre no `log.md` e faça commit + push (regra 8).

Para reuniões e compromissos do dia use o servidor MCP `jarvis` (somente leitura): `jarvis_reunioes` (`periodo: hoje`), `jarvis_compromissos` (`status: abertos`, `pessoa: mateus-falcao`), `jarvis_timeline` (`periodo: hoje`) e `jarvis_buscar`. Sem o servidor, faça Grep em `Compromissos/` por `^status: (aberto|em_andamento|aguardando)`. Compromisso cumprido (confirmado por mim) → `status: concluido` + `concluido_em: <hoje>`.

Se eu passar texto abaixo, trate como minha resposta às perguntas do checkout: $ARGUMENTS
