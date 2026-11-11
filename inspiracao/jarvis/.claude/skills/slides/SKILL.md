---
name: slides
description: Explica qualquer coisa em formato de slides (deck visual publicado como Artifact privado) — repositório, sistema, conceito, processo, decisão, estudo, resumo de reunião. Use SEMPRE que o Mateus pedir uma explicação "visual", "em slides", "tipo apresentação", "me mostra", "desenha pra mim", ou quando a explicação pedida for longa e estrutural (arquitetura, fluxo, camadas, comparação) — ele aprende melhor vendo do que lendo texto corrido.
argument-hint: "<o que explicar> [público/objetivo]"
---

# Slides — explicação visual

O Mateus prefere explicação **visual, em slides**, a texto longo no chat. Esta skill transforma o conteúdo de uma explicação num deck curto, publicado como Artifact privado, e deixa no chat só o resumo + link.

## Quando usar

- Pedido explícito: "explica em slides", "faz visual", "monta uma apresentação".
- Explicação estrutural longa: repositório, arquitetura, fluxo de dados, camadas, processo com etapas, comparação entre opções, onboarding num tema novo.
- Não usar para resposta curta (≤ 5 linhas) ou pergunta factual — aí basta o chat.

## Passos

1. **Juntar o conteúdo primeiro.** Leia as fontes (repo, notas do vault via `jarvis_*`, docs) e só depois desenhe. Fato vindo de fonte segue a regra 9 do `CLAUDE.md`: no deck vai o fato, e a fonte (arquivo, PR, card) aparece no slide ou nas notas do apresentador.
2. **Roteiro (6–14 slides)**, um conceito por slide:
   1. Título + uma frase do que é.
   2. **Mapa** — diagrama do todo (caixas e setas: componentes, fluxo, camadas).
   3. Um slide por peça/etapa: o que é, como funciona, exemplo concreto.
   4. Padrões/regras (convenções, commits, hard-stops) — em tabela ou lista curta.
   5. "Pegadinhas" — o que costuma dar errado.
   6. Dúvidas em aberto / próximos passos. Prefira diagrama, tabela e comparação lado a lado a parágrafo. Máx. ~40 palavras de texto corrido por slide; o resto vai nas notas do apresentador.
3. **Publicar.** Chame a ferramenta Artifact com `action: "quickstart"`, `intent: "slides"`, e siga o tipo de deck que ela indicar (o deck baixa como .pptx/PDF se precisar). Sem tipo de slides disponível: carregue a skill `artifact-design` e escreva um HTML de slides navegável (setas ←/→) em `Aprender/<slug>/<slug>-slides.html`, publicando com `icon: "slides"`. Para diagramas, carregue `artifact-diagramming`.
4. **Ligar ao vault.** Registre o link do deck na nota que deu origem (curso em `Aprender/`, nota em `Notes/`, reunião em `Reunioes/`) e acrescente no `log.md` `## [AAAA-MM-DD HH:MM] slides | <título> (<link>)`.
5. **Resposta no chat**: 3–5 linhas com a ideia central + o link. Não repita o deck inteiro em texto.

## Regras

- Deck é Artifact **privado**. Dado sensível (regra 7) fica fora: nada de CPF, salário, saúde, credencial, nem trecho cru de base de cliente.
- Esta skill é estrutura (vai pro GitHub): exemplos aqui só com fictícios (`acme`, `ana-lima`, `WH-1234`) — regra 10.
- Atualizar > duplicar: se já existe deck do mesmo assunto, republique no mesmo link (`url`) em vez de criar outro.
