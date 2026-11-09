# Health-brain

Hackathon Gama House · Desafio Rivio · demo em 14/11/2026.

## Problema

Na saúde privada, o histórico de cada pessoa fica espalhado entre laboratórios, hospitais, planos e papel. O médico vê só o que o paciente lembra de trazer e não vê os dados dos wearables, mesmo quando indicam arritmia, apneia do sono ou hipertensão. Resultado: exames repetidos e decisões com informação incompleta.

## Visão da Rivio → como o health-brain responde

| Visão | Health-brain |
|---|---|
| **Estruturar o histórico:** foto ou PDF do exame, a IA extrai cada resultado e monta a linha do tempo com as faixas de referência | O original vai pro repositório bruto; cada resultado vira nota estruturada com link pra ele. Raio-x e outras imagens: a nota guarda o link pro arquivo |
| **Acompanhar o presente:** wearables no mesmo histórico, aviso quando é hora de procurar médico | Leituras entram como notas ligadas por data; o domínio `alertas` avisa quando um sinal sai do normal |
| **Mostrar ao médico:** com consentimento, uma visualização só | Linha do tempo única, compartilhada com consentimento, com cada número apontando pra fonte |

## O diferencial: brain, não pasta

Cada exame e cada leitura é uma nota ligada às outras por data, tipo de exame, médico, sintoma e condição. Assim o brain vira a **linha do tempo da saúde da pessoa**, e dá pra perguntar:

- "Como meu colesterol mudou nos últimos 2 anos?"
- "Minha oxigenação caiu antes daquela pneumonia?"

A resposta cruza exames com dados do relógio e mostra de onde tirou cada número. A cada consulta ou sincronização, o brain atualiza as ligações sozinho.

## Fluxo da demo (10 min)

1. Enviar um PDF e uma foto de exame → resultados extraídos com fonte.
2. Importar dados de wearable sintéticos.
3. Linha do tempo com evolução e faixas de referência.
4. Pergunta em linguagem natural respondida com fonte.
5. Alerta de ritmo irregular.
6. Médico abre a visão compartilhada com consentimento.

## Regras do desafio

- Dados sintéticos ou os próprios; de outra pessoa, só com consentimento explícito dela.
- A Rivio não recebe nem guarda dados de saúde dos times.
