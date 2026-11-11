---
description: Processa o Inbox agora (sem sync das fontes externas)
---

Execute `System/prompts/process-inbox.md` por inteiro, seguindo o `CLAUDE.md` e o schema do grafo (`System/schema/grafo.md`). Não chama nenhuma fonte externa nem o `pipeline/meetrox.mjs`: processa só o que já está em `Inbox/` (destilações) e usa `Inbox/_raw/<fonte>/<item>/turnos.txt` para as evidências literais (`- "<trecho>" — <Autor> · fonte: <caminho>#tNNNN`; após arquivar, o caminho canônico é `System/Archive/raw/YYYY-MM/<fonte>/<item>/turnos.txt#tNNNN`). Não mexe em cursores do `state.json`.

Ao final, faça `git add -A; git commit -m "ingest <data>"` (sem nada staged, siga sem commit), rode `System/scripts/verificar-publicavel.ps1 -Silencioso` e, com exit 0, `git push origin main` (reprovou → sem push, reporte). Devolva o resumo.
