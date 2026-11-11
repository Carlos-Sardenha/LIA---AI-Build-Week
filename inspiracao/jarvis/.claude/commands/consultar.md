---
description: Pergunta ao segundo cérebro — começa pela cobertura do grafo (jarvis), responde com wikilinks, citação literal e data; se valer, arquiva a resposta como nota
argument-hint: <pergunta>
---

Execute `System/prompts/consultar.md` por inteiro, seguindo o `CLAUDE.md` e `System/schema/grafo.md`. Em resumo:

1. `jarvis_cobertura` primeiro (sem o servidor `jarvis`: `index.md` + Glob/Grep).
2. Consulta certa para a pergunta (`jarvis_compromissos`, `jarvis_reunioes`, `jarvis_decisoes`, `jarvis_temas`, `jarvis_timeline`, `jarvis_grep`, `jarvis_buscar` → `jarvis_no`/`jarvis_ler`).
3. Resposta com `[[wikilink]]` + data absoluta em cada fato e citação literal da seção `## Evidências`; sem trecho → "registrado no vault, sem evidência literal". Declare a cobertura e as lacunas. Não invente.
4. Síntese reaproveitável → pergunte se arquiva como nota; só grave com "sim".
5. `log.md`: `## [data hora] consulta | <pergunta curta>`.

Pergunta: $ARGUMENTS
