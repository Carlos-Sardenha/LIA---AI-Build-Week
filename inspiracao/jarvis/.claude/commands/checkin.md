---
description: Painel do dia (Artifact) — agenda, Top 3, TODO, pessoas, semana e projetos; o que você faz na página grava no vault
argument-hint: [opcional: intenção ou prioridade que você já tem em mente | confirmei]
---

Siga a skill `checkin` (`.claude/skills/checkin/SKILL.md`), com `System/prompts/checkin.md` para o que propor e o `CLAUDE.md` para as regras.

- Sem argumento, ou com uma intenção: **Modo 1 — Propor e publicar** (coleta as sessões do Claude Code inteiras em `Sessoes/` com `node pipeline/claude-sessoes.mjs`, extrai resumo, decisões e compromissos com o subagente `extrator-sessao`, monta o painel do dia com `System/scripts/painel.mjs montar`, publica no Artifact de sempre e deixa o Check-in "a confirmar" no Daily).
- `confirmei`: **Modo 2 — Sincronizar** (aplica a fila do db no vault e garante o Check-in confirmado no Daily).

Para compromissos e reuniões use o servidor MCP `jarvis` (somente leitura): `jarvis_compromissos` (`status: abertos`, `pessoa: mateus-falcao`, `prazo_ate`), `jarvis_reunioes` (`periodo: hoje`), `jarvis_timeline` e `jarvis_buscar`. Sem o servidor, faça Grep em `Compromissos/` por `^status: (aberto|em_andamento|aguardando)`.

Texto passado pelo Mateus (ponto de partida da intenção/Top 3, ou "confirmei"): $ARGUMENTS
