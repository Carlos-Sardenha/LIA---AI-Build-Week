---
created: {{agora}}
updated: {{agora}}
type: compromisso
source: {{fonte}}
tags: [compromisso]
data: AAAA-MM-DD                 # quando foi firmado
oque: {{Verbo no infinitivo + objeto}}
assumido_por: ["[[pessoa]]"]     # quem fica devendo (Mateus = [[mateus-falcao]])
firmado_em: "[[reuniao]]"        # reunião (ou daily/nota quando veio de chat/e-mail; sessão em Sessoes/ quando veio do Claude Code)
cliente: "[[cliente]]"           # opcional
projeto: "[[projeto]]"           # opcional
temas: ["[[tema]]"]              # opcional
status: aberto                   # M: aberto | em_andamento | aguardando | concluido | cancelado
prazo: sem prazo                 # M: AAAA-MM-DD ou "sem prazo" (nunca converta fala vaga em data)
fecha_quando: {{condição verificável}}
todo:                            # P: linha do TODO.md quando é o Mateus quem deve
concluido_em:                    # M: AAAA-MM-DD — preencher junto com status: concluido
---

# {{Verbo no infinitivo + objeto}}

Arquivo: `Compromissos/AAAA-MM-DD-<quem>-<slug>.md`. "Vencido" é derivado (aberto/em_andamento/aguardando
+ prazo < hoje), não status. Ao concluir: `status: concluido` **e** `concluido_em: AAAA-MM-DD`. Schema: `System/schema/grafo.md`.

## Evidências
<!-- sem citação literal, sem evidência -->
- "trecho literal da fonte" — Autor · fonte: System/Archive/raw/AAAA-MM/<fonte>/<item>/turnos.txt#tNNNN

## Andamento
- AAAA-MM-DD — atualização (fonte)
