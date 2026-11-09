# Roadmap: LIA até a demo de 14/11

**Objetivo:** fazer o olho da Rivio brilhar numa **live demo de 10 minutos** no sábado, 14/11, mostrando o health-brain de ponta a ponta: o exame entra, vira linha do tempo, responde pergunta com fonte, avisa quando o relógio vê algo estranho e o médico vê tudo com consentimento.

**Como a gente trabalha:** harness engineering. **Humano dirige, agente executa.** Cada pessoa é dona de uma trilha, descreve a tarefa pro `executor` e leva o PR até o fim com o `loop-de-revisao`. Quando o agente erra, a gente melhora o repo (doc, regra, ferramenta), não o código na mão. Detalhes em [agents.md](agents.md).

## Visão geral da semana

| Dia | Marco | Pronto quando... |
|---|---|---|
| **Seg 09** | 🧱 Fundação | Stack escolhida, `fundador` rodou, app sobe local, dados sintéticos prontos, trilhas divididas |
| **Ter 10** | 📥 Ingestão | PDF/foto vira nota com fonte; export do wearable importado |
| **Qua 11** | 🧠 Brain | Linha do tempo com evolução e faixas de referência; pergunta respondida com fonte |
| **Qui 12** | 🚨 Alertas + médico | Alerta de ritmo irregular; visão do médico com consentimento; **fluxo da demo rodando inteiro**. Fim do dia: **congela feature** |
| **Sex 13** | 🎤 Polimento | Roteiro fechado, 3 ensaios cronometrados, plano B gravado |
| **Sáb 14** | 🏁 Demo | 10 minutos na Gama House |

## Trilhas e donos

> Preencher os nomes no dia 09. Com 3 pessoas, a trilha D se divide entre as outras.

| Trilha | Domínios | Dono | Entrega na demo |
|---|---|---|---|
| **Maestro do harness** | `AGENTS.md`, `docs/`, CI, merges | Carlos | Repo sempre verde e legível pros agentes; integração diária na `main` |
| **A. Ingestão** | `exames` | _a definir_ | Foto/PDF → resultados extraídos com faixa de referência e link pro original |
| **B. Sinais** | `wearables`, `alertas` | _a definir_ | Importa o export, mostra batimento/sono/oxigenação, dispara o alerta |
| **C. Brain** | `linha-do-tempo`, `perguntas` | _a definir_ | Linha do tempo ligada + pergunta em linguagem natural com fonte |
| **D. Experiência** | `compartilhamento`, `ui`, pitch | _a definir_ | Tela do paciente, tela do médico, roteiro e slides |

Cada trilha trabalha numa **worktree própria** (uma instância do app por mudança), então as trilhas andam em paralelo sem pisar uma na outra.

## Dia a dia

### Seg 09 · 🧱 Fundação

- [x] Harness: agentes, `AGENTS.md`, `ARCHITECTURE.md`, `docs/`
- [ ] **Decidir a stack em até 30 min** (sugestão abaixo) e registrar no plano ativo
- [ ] Rodar o `fundador`: estrutura dos 6 domínios, CI, lint de camadas, "Como rodar" no `AGENTS.md`
- [ ] Chave da API de IA no `.env` de cada um (nunca no git; `.env.example` sem valor)
- [ ] Dados sintéticos em `data/sintetico/`: 1 pessoa fictícia com ~3 anos de história (4 laudos em PDF, 1 foto de exame em papel, 1 raio-x, export de wearable com um trecho de ritmo irregular)
- [ ] Dividir as trilhas e preencher os donos

**Sugestão de stack (decidir rápido, não perfeito):** TypeScript de ponta a ponta (um repo só pra front e API), notas do brain como arquivos `.md` com frontmatter ou SQLite (simples e combina com a ideia de brain), modelo de IA com visão pra ler PDF e foto. Tecnologia "chata" e conhecida, que é onde os agentes mais acertam. A demo roda **local**, sem depender de internet além da API de IA.

### Ter 10 · 📥 Ingestão

- [ ] **A:** extração de PDF → nota estruturada (exame, valor, unidade, faixa de referência, data, link pro original)
- [ ] **A:** foto de exame em papel pelo mesmo caminho; raio-x vira nota só com metadados + link
- [ ] **B:** importar o export do wearable (batimento, oxigenação, sono, atividade)
- [ ] **C:** modelo de ligações (data, tipo de exame, médico, sintoma, condição) e o índice
- [ ] **D:** esqueleto das telas (paciente e médico) com dado fake
- [ ] Maestro: integração no fim do dia, `jardineiro-de-docs` rodando à noite

### Qua 11 · 🧠 Brain

- [ ] **C:** linha do tempo ordenada com a evolução de cada resultado ao lado da faixa de referência
- [ ] **C:** pergunta em linguagem natural respondida **citando a fonte** (ex.: "como meu colesterol mudou?")
- [ ] **B:** leituras do wearable entrando na mesma linha do tempo
- [ ] **D:** telas ligadas aos dados reais (sintéticos)
- [ ] Maestro: primeira passada do fluxo inteiro, mesmo que feio

### Qui 12 · 🚨 Alertas + médico

- [ ] **B:** alerta de ritmo irregular → "vale procurar um médico" (orienta, não diagnostica)
- [ ] **D:** consentimento (dar e retirar) + visão do médico numa tela só
- [ ] **Todos:** fluxo da demo rodando do início ao fim
- [ ] `coletor-de-lixo` uma vez e `revisor` com foco em **segurança** em tudo que toca upload, armazenamento, consentimento e IA
- [ ] **18h: feature freeze.** Daqui pra frente só correção e polimento

### Sex 13 · 🎤 Polimento

- [ ] Roteiro da demo fechado (abaixo) e quem fala o quê
- [ ] 3 ensaios cronometrados com o app de verdade
- [ ] **Plano B:** vídeo gravado do fluxo inteiro + app com os dados já carregados (se a API de IA cair, a demo segue)
- [ ] Resposta pronta pras perguntas difíceis (privacidade, erro da IA, como entra dado de outros wearables)

### Sáb 14 · 🏁 Demo

- [ ] Chegar com o app aberto, dados carregados e o vídeo do plano B na tela de trás

## Roteiro da demo (10 min)

| Tempo | O quê | Mensagem |
|---|---|---|
| 0:00–1:00 | O problema: histórico espalhado, médico no escuro | "Seu médico só vê o que você lembra de trazer" |
| 1:00–3:00 | Foto do exame em papel + PDF → resultados com fonte | Estruturar o histórico |
| 3:00–5:00 | Linha do tempo + pergunta "como meu colesterol mudou?" | **Brain, não pasta** (o diferencial) |
| 5:00–6:30 | Wearable + alerta de ritmo irregular | Acompanhar o presente |
| 6:30–8:00 | Pessoa dá consentimento → médico vê tudo numa tela | Mostrar ao médico |
| 8:00–9:00 | Privacidade: dado da pessoa, consentimento, fonte em tudo | Confiança |
| 9:00–10:00 | Próximos passos e fecho | Visão |

## Prioridades (o que cortar se apertar)

| Precisa ter (a demo não existe sem) | Bom ter | Se sobrar tempo |
|---|---|---|
| PDF → nota com fonte | Foto de exame em papel | Raio-x na linha do tempo |
| Linha do tempo com faixa de referência | Pergunta em linguagem natural | Vários wearables diferentes |
| Wearable + 1 alerta | Tela do médico separada | Remédios e vacinas |
| Consentimento simples | Retirar consentimento | Exportar resumo pro médico |

## Rituais

- **Daily de 15 min** às 9h: o que entrou ontem, o que entra hoje, onde o agente travou (e o que falta no repo pra destravar).
- **Integração às 18h** na `main`: tudo verde, fluxo da demo roda.
- **Rotinas dos agentes:** `jardineiro-de-docs` toda noite; `coletor-de-lixo` na quinta.
- **Regra de ouro:** agente travou duas vezes no mesmo ponto → para, melhora o repo, tenta de novo.

## Riscos

| Risco | O que fazer |
|---|---|
| IA lê mal a foto do exame | Testar cedo (terça) com os dados sintéticos; na demo usar foto boa e controlada |
| API de IA lenta ou fora no sábado | Plano B: dados pré-carregados + vídeo gravado |
| Escopo cresce | Feature freeze na quinta 18h; a tabela de prioridades decide |
| Trilhas não se encaixam | Integração diária na `main` desde terça |
| Pergunta sobre privacidade ou diagnóstico errado | Princípios em [core-beliefs.md](design-docs/core-beliefs.md) viram 1 slide e a resposta ensaiada |
| Dado real vazando no repo público | `.gitignore` bloqueia `data/` fora de `sintetico/`; `revisor` de segurança em todo PR sensível |
