---
created: {{agora}}
updated: {{agora}}
type: reuniao
source: {{fonte}}
tags: [reuniao]
data: AAAA-MM-DD
participantes: ["[[pessoa-1]]", "[[pessoa-2]]"]   # P: quem participou (Mateus = [[mateus-falcao]]); citado só no corpo
cliente: "[[cliente]]"           # null se reunião interna
projeto: null                    # "[[projeto]]" quando houver
temas: []                        # P: ["[[tema-cliente]]"]
decisoes: []                     # P: ["[[AAAA-MM-DD-slug]]"]
compromissos: []                 # P: ["[[AAAA-MM-DD-quem-slug]]"]
origem: manual                   # P: meetrox | teams | outlook | manual
meetrox_id: null                 # P: id da call (chave lógica anti-duplicata)
teams_id: null                   # P: id da reunião/transcrição no Teams
bruto: null                      # P: System/Archive/raw/AAAA-MM/<fonte>/<item>/ (ou Inbox/_raw/<fonte>/<item>/ antes de arquivar)
---

# {{Título}} — AAAA-MM-DD

Arquivo: `Reunioes/AAAA-MM-DD-<slug>.md`. Schema: `System/schema/grafo.md` § 4 › reuniao (todos os campos acima ficam no frontmatter, vazios como `null`/`[]`).

## Pré-contexto (gerado antes)
- Última interação:
- Tarefas abertas com este cliente:
- Pontos a levantar:

## Notas / decisões
-

## Evidências
<!-- sem citação literal, sem evidência -->
- "trecho literal da fonte" — Autor · fonte: System/Archive/raw/AAAA-MM/<fonte>/<item>/turnos.txt#tNNNN

## Próximos passos
- [ ] ação → vai para o [[TODO]]

## Notas do Mateus
<!-- manual -->
