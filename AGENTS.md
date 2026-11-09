# AGENTS.md

Mapa do repositório para agentes. **Não é manual:** aqui só tem o essencial e onde procurar o resto. O detalhe mora em `docs/`.

## O que é

**LIA**: hub de saúde pessoal (health-brain) para o Hackathon Gama House, Desafio Rivio (AI Build Week). Junta exames (PDF ou foto) e dados de wearables numa linha do tempo ligada, que a pessoa consulta em linguagem natural e compartilha com o médico mediante consentimento.

**Entrega:** live demo de 10 minutos em **14/11/2026**. Prioridade é a demo funcionando de ponta a ponta, não cobertura de tudo.

## Onde procurar

| Preciso de... | Leia |
|---|---|
| O que o produto faz e para quem | `docs/product-specs/index.md` |
| Domínios, camadas e regra de dependência | `ARCHITECTURE.md` |
| Princípios que não se negociam (privacidade, fonte) | `docs/design-docs/core-beliefs.md` |
| Roadmap da semana, trilhas e donos | `docs/ROADMAP.md` |
| O que está sendo feito agora | `docs/exec-plans/active/` |
| Dívida técnica conhecida | `docs/exec-plans/tech-debt-tracker.md` |
| Nota de qualidade por domínio | `docs/QUALITY_SCORE.md` |
| Docs de bibliotecas e do desafio | `docs/references/` |
| Os agentes deste repo e o fluxo entre eles | `docs/agents.md` |

## Como rodar

> A definir quando a stack for escolhida (ver `docs/exec-plans/active/`). Quem escolher a stack atualiza esta seção com os comandos de: instalar, rodar o app, rodar os testes, rodar o lint.

## Regras rápidas

1. **Nunca** commite dado de saúde real, `.env`, chave de API ou token. Este repositório é **público**. Dado de teste é sintético e fica em `data/sintetico/`.
2. Todo número mostrado ao usuário aponta para a **fonte** (o PDF, a foto ou a leitura do wearable).
3. Respeite as camadas do `ARCHITECTURE.md`. Assunto transversal (IA, armazenamento, consentimento) entra por `providers/`.
4. Mudança grande ganha plano em `docs/exec-plans/active/`. Mudança pequena, não.
5. Faltou doc, ferramenta ou regra pra você acertar? Diga o que faltou em vez de forçar.
