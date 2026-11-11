# LIA: hub de saúde pessoal

Projeto para o **Hackathon Gama House · Desafio Rivio** (AI Build Week, novembro de 2026).

Um **health-brain**: junta exames (do papel ao PDF do laboratório) e dados de wearables numa linha do tempo ligada, que a pessoa consulta em linguagem natural e compartilha com o médico mediante consentimento. Todo número aponta para a fonte.

- Produto: [docs/product-specs/health-brain.md](docs/product-specs/health-brain.md)
- Arquitetura: [ARCHITECTURE.md](ARCHITECTURE.md)
- Plano até a demo: [docs/exec-plans/active/2026-11-14-demo.md](docs/exec-plans/active/2026-11-14-demo.md)

## Como o código é escrito

Este repo segue o [harness engineering](https://openai.com/pt-BR/index/harness-engineering/): quem escreve o código são agentes de IA, e o time cuida do ambiente (docs, regras, ferramentas). O ponto de entrada dos agentes é o [AGENTS.md](AGENTS.md); os agentes e o fluxo estão em [docs/agents.md](docs/agents.md).

- **Guia dos agentes de coding:** [.claude/agents/README.md](.claude/agents/README.md). Explica os 8 agentes (`fundador`, `executor`, `auto-revisor`, `revisor`, `loop-de-revisao`, `jardineiro-de-docs`, `coletor-de-lixo`, `ponta-a-ponta`): o papel de cada um, quando usar, o fluxo de uma tarefa, exemplos de pedido e as regras que valem pra todos.

## Dados

Só dados **sintéticos** entram no repositório (`data/sintetico/`). Dado de saúde real nunca é commitado.
