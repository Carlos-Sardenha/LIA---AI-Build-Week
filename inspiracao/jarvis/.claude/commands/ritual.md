---
description: Ritual matinal completo — sync das fontes, ingest, repriorização do TODO e briefing do dia
---

Execute `System/prompts/ritual-matinal.md` por inteiro, seguindo o `CLAUDE.md` e o schema do grafo (`System/schema/grafo.md`).

O sync cobre as fontes com `ativo` em `System/config/sources.yml` (hoje: Outlook, Agenda, Teams, Jira, Claude Code e Manual) e atualiza o espelho do Teams no perfil. Se o Meetrox estiver ativo, rode `node pipeline/meetrox.mjs` na raiz do vault e, se sair com 0, grave o `cursor_sugerido` do JSON em `System/config/state.json` → `last_sync.meetrox`.

Termine mostrando a seção Briefing do `Daily/` de hoje.
