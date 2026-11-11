---
created: {{agora}}
updated: {{agora}}
type: curso
source: {{fonte}}                # manual | claude-code | outlook | teams (de onde veio o pedido)
tags: [curso, {{tema}}]
assunto: "{{assunto do curso}}"
objetivo: "{{objetivo do Mateus com este estudo}}"
status: estudando                # M: fila | estudando | concluido  (mesmo valor da linha em [[Aprender/fila]])
modulos_total: {{N}}
modulos_feitos: 0
fonte_original: "{{url-ou-titulo}}"   # link | livro | vídeo | tópico
artifact_url: ""                 # P: preenchido após publicar {{slug}}.html (Artifact, icon "book")
temas: ["[[{{tema}}]]"]          # aresta Curso -> Tema (Temas/)
projeto: null                    # "[[projeto]]" quando o estudo serve a uma iniciativa
cliente: null                    # "[[cliente]]" quando o estudo serve a um tomador
relacionados: ["[[{{slug}}-fontes]]"]   # + outras notas/cursos ligados ("[[outro-curso]]", "[[nota]]")
formato: {{formato}}             # opcional: link | livro | video | topico
nivel: {{nivel}}                 # opcional: iniciante | intermediario | avancado
duracao_estimada: "{{ex.: 2h}}"  # opcional
---

# {{Título do curso}}

> Arquivos: `Aprender/{{slug}}/{{slug}}.md` (este nó, chave `{{slug}}`, link `[[{{slug}}]]`) · fontes `[[{{slug}}-fontes]]` · página visual `Aprender/{{slug}}/{{slug}}.html` ({{artifact_url}}). Gerado por `/aprender` · fila: [[fila]] · a partir de {{fonte_original}}. Schema: `System/schema/grafo.md` § 4 › curso.

## Objetivo

{{O que o Mateus vai conseguir fazer ao final — verbo no infinitivo, observável.}} Por que agora: {{ligação com projeto/cliente/tema, se houver}}.

## Pré-requisitos

- {{conceito}} — {{onde aprender rápido / já coberto em [[nota]]}}

## Mapa de conceitos

```
{{Conceito A}} ──> {{Conceito B}} ──> {{Conceito C}}
                      └──> {{Conceito D}}
```

| Conceito | Em uma frase | Depende de |
|---|---|---|
| {{A}} | {{definição}} | — |

## Módulos

| # | Módulo | Duração | Feito |
|---|---|---|---|
| 1 | [[#Módulo 1 — {{título}}]] | {{15 min}} | [ ] |

---

### Módulo 1 — {{título}}

**Objetivo do módulo:** {{o que dá para fazer depois deste módulo}}

**Explicação** {{3–6 parágrafos curtos. Linguagem direta, sem encher linguiça.}}

**Exemplo** {{exemplo concreto, de preferência do contexto de trabalho do Mateus}}

**Exercício** {{tarefa prática de 5–15 min}}

<details><summary>Resposta</summary>

{{resposta comentada}}

</details>

**Checagem**
1. {{pergunta}} — a) … b) … c) … · resposta: {{letra}} ({{por quê}})

Evidência: {{citação literal curta da fonte (≤ 15 palavras)}} — [[{{slug}}-fontes]] § {{F1}}

---

## Próximos passos

- {{aplicar em [[projeto]] / aprofundar em …}}

## Registro de estudo

- {{AAAA-MM-DD}} — {{módulos feitos, dúvidas, insights}}
