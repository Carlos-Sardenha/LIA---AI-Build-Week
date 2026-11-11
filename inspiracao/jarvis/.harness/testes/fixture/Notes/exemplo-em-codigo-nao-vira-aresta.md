---
created: 2026-10-03T08:00:00-03:00
updated: 2026-10-03T08:00:00-03:00
type: nota
source: manual
tags: [schema]
relacionados: ["[[bm25-na-pratica]]"]
---

# Exemplo em código não vira aresta

Inline: `[[link-inline-falso]]` e ``dupla `[[link-inline-duplo]]` `` ao lado de um link real para [[beta]].

```markdown
# Titulo falso
## Evidências
- "citação de exemplo" — Fulano · fonte: Inbox/_raw/meetrox/1234567/turnos.txt#t0001
[[link-em-cerca-falso]]
```

~~~~
[[outro-falso]]
```
ainda dentro da cerca de til
[[ainda-falso]]
~~~~

## Evidências
- `- "exemplo inline" — Fulano · fonte: x#t1`
