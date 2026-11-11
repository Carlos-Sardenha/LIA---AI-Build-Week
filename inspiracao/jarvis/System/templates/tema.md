---
created: {{agora}}
updated: {{agora}}
type: tema
source: {{fonte}}
tags: [tema]
titulo: {{Título do tema}}
cliente: "[[cliente]]"      # omita se o tema não é de um cliente
status: aberto              # M: aberto | avancando | travado | resolvido
aliases: []                 # outras formas de chamar o mesmo assunto (só acrescente)
primeira_vez: AAAA-MM-DD    # P
ultima_vez: AAAA-MM-DD      # P
n_reunioes: 0               # P
causa_raiz:                 # M: texto curto
fundir_em:                  # M: "[[canonico]]" só se esta nota for duplicata
---

# {{Título do tema}}

Tópico recorrente. Chave = nome do arquivo, com sufixo do cliente quando o tema é do cliente (`Temas/<slug>-<cliente>.md`, ex.: `integracao-portal-acme`). Nunca renomear; duplicata → fica no lugar com `fundir_em: "[[canonico]]"` (não mover para Archive). Schema: `System/schema/grafo.md`.

## Contexto
1–3 linhas: do que se trata e por que importa.

## Histórico
- AAAA-MM-DD — o que aconteceu ([[reuniao-ou-fonte]])

## Evidências
- "trecho literal da fonte" — Autor · fonte: System/Archive/raw/AAAA-MM/<fonte>/<item>/turnos.txt#tNNNN
- "trecho literal de e-mail/chat" — Autor · fonte: System/Archive/raw/AAAA-MM/<fonte>/<item>/mensagens.txt#<messageId>

## Notas do Mateus
<!-- manual: a automação nunca reescreve esta seção -->
