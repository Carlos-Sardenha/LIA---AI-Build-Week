---
description: Pós-reunião — pega a transcrição do Teams das reuniões que acabaram e grava reunião, pessoas, temas, decisões e compromissos no grafo
---

Execute `System/prompts/pos-reuniao.md` por inteiro, seguindo o `CLAUDE.md` e o schema do grafo (`System/schema/grafo.md`). Fluxo: agenda → `read_resource(meetingTranscriptUrl)` → `node pipeline/teams-transcricao.mjs` → `node pipeline/grafo-reuniao.mjs existing | prompt` → subagentes `extrator-reuniao` (um por chunk, só JSON) → `merge | validate | apply` → arquivar, `index.md`, `log.md`, cursor `last_sync.teams_transcricoes`.

Argumento opcional ($ARGUMENTS): assunto ou data de uma reunião específica — processa só ela (mesmos passos, janela do dia indicado). Somente leitura no Teams/Outlook. Sem reunião nova terminada: termine em silêncio.
