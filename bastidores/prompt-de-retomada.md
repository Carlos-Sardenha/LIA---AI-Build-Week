# Prompt de retomada

Cole o bloco abaixo num chat novo para continuar o projeto de onde parou.

```md
# Objetivo
Retomar o projeto LIA (hackathon Gama House · Desafio Rivio) a partir deste repo e do contexto abaixo, e me ajudar com as atualizações finais. Todo o produto é feito no Lovable, que você orquestra pelo navegador.

# Contexto
## O projeto
- LIA (sempre "a LIA", no feminino) é um health-brain pessoal: junta exames (PDF ou foto) e dados do relógio numa linha do tempo única, com todo número ligado à fonte. Não diagnostica nem prescreve.
- Conceitos centrais:
  - **LLM Wiki** (Karpathy): bruto, wiki e schema; ingest, query e lint; compilar uma vez, na escrita.
  - **GraphRAG sem embeddings**: busca textual com sinônimos acha os pontos de partida; anda no máximo 2 saltos e junta no máximo 40 fatos; a citação é conferida pelo servidor; sem ponto de partida, responde "não encontrei" e não chama a IA.
  - "A IA extrai, o código decide." As ligações são criadas por regra, nunca pela IA.
- Dados de demo fictícios: a paciente Marina Duarte, os Laboratórios Alfa, Beta e São Lucas, o Hospital Central, a Dra. Helena Costa e o Dr. Rafael Lima. A história da demo é a pneumonia de mar/2025: a SpO2 caiu de 97% para 92% nos 5 dias anteriores.

## Prazos (sábado, 14/11/2026)
- Até as 16h: subir a ideia e a apresentação no portal.
- Às 17h: pitch de 5 min + 5 min de perguntas, na Gama House (Rua Mariana Correia, Pinheiros).
- A entrega é apresentar a ideia e os conceitos com o projeto funcionando, não um produto perfeito.

## Onde está cada coisa
- **Repo:** https://github.com/Carlos-Sardenha/LIA---AI-Build-Week (README explica o LLM Wiki, o GraphRAG e o harness de agentes).
- **Bastidores, neste repo:**
  - `bastidores/planejamento-lovable.md`: plano mestre, com as ondas, os prompts do Lovable, o registro de créditos e o guardrail;
  - `bastidores/prompt-de-retomada.md`: este arquivo.
- **Apresentação, neste repo:**
  - `apresentacao/LIA-apresentacao.pptx`: 11 slides; o vídeo está embutido no slide 10;
  - `apresentacao/LIA-tour-da-plataforma.mp4`: 2min14s, com a voz neural Thalita;
  - `apresentacao/o-brain-da-lia.html`: fonte do artefato.
- **Artefato "O Brain da LIA" (v4):** https://claude.ai/artifact/4q4R3PeUqod2T24tgejbC3. Tem a base (LLM Wiki e GraphRAG por dentro) e o projeto (escopo, telas, fluxo do PDF, Open Health, segurança, arquitetura, números, limitações e roteiro de 5 min).
- **Lovable:** projeto ativo https://lovable.dev/projects/3246bed0-bf28-41f7-a059-d6c3c42904c5, no espaço de trabalho "Marcos's Lovable". Preview do app: https://id-preview--3246bed0-bf28-41f7-a059-d6c3c42904c5.lovable.app

## Estado atual do app (Ondas 1, 2, 3, 4A, 4B e 6 feitas; 144 testes passando)
- **Telas da paciente:**
  - Início: envio do arquivo em 5 etapas visíveis e alerta do relógio;
  - Linha do tempo: Cronologia por ano com o episódio "Pneumonia · mar/2025" e gráficos com "Unificado de";
  - Meu brain: grafo em rede com 40 nós, 174 ligações, 777 fatos e 20 documentos;
  - Wearables: SpO2 diária, com atalho para março/2025;
  - Alertas;
  - Perguntar: com "Como a LIA chegou nisso";
  - Open Health: pedidos de acesso, consentimentos, revogação e histórico de acessos.
- **Área do médico:** identificação de demo (Dr. Rafael Lima, CRM 000000-SP), lista de pacientes e ficha consolidada com a origem de cada número.
- **Extração do documento (4C):** profissionais, clínica com endereço, parâmetros da coleta, datas e contatos, cada um com trecho literal e página. Nunca extrai dados do paciente.

## Pendências conhecidas
- Antes do ensaio ou da apresentação, restaurar a demo do Open Health. O estado esperado tem 4 pedidos pendentes (3 instituições e o Dr. Rafael para wearables), e hoje há 3. O Plano Saúde Vida aparece já aprovado, e o badge de Alertas caiu de 2 para 1.
- O trabalho que nunca foi commitado (`scripts/exames`, `scripts/sintetico`, o agente extrator-de-exames, `docs/design-docs/extracao-de-exames.md` e `docs/references/desafio-rivio`) se perdeu. Só reconstruir se eu pedir.

# Como trabalhamos (fluxo)
- **Você orquestra o Lovable pelo Claude in Chrome.** Uma pessoa só orquestra por vez, e um prompt por vez.
- **Para enviar um prompt:**
  - ache o campo do chat com `find` ("Pergunte à Lovable…"), use o modo **Criar** e Shift+Enter entre parágrafos;
  - envie pelo botão de seta; o Enter às vezes não envia;
  - confira que a mensagem apareceu no chat.
- **Como escrever o prompt:**
  - todo prompt termina com "Não publique o app e não mude dados";
  - todo prompt pede, no fim, como o Lovable testou e a confirmação de que as outras telas continuam funcionando.
- **Acompanhar:** espere em ciclos de ~2 min (wait + screenshot em batch) até aparecer o relatório final com o número de testes.
- **Conferir na tela:** depois de cada relatório, abra a tela no preview e confira. O Lovable já disse que corrigiu coisas que não corrigiu.
- **Registrar:** depois de cada passo, atualize `bastidores/planejamento-lovable.md`: 🔄 rodando, ✅ feito com o resultado, e o registro de créditos.
- **Créditos:**
  - o custo cai no espaço de trabalho dono do projeto (o do Marcos), não em quem digita;
  - piso de **15 créditos**: só envie um prompt se o saldo menos a estimativa alta continuar ≥ 15;
  - eu não consigo ler o saldo do Marcos; peça a ele quando importar.

# Restrições
- Nunca clicar em **Publicar**.
- Nunca aceitar "Continuar" de créditos nem comprar créditos sem me perguntar.
- Não apagar dados; arquivar ou esconder.
- Não digitar senhas, códigos de acesso ou credenciais. A identificação de demo do médico (nome e CRM fictícios) pode ser usada; o código 123-456 não deve ser digitado.
- O repo é público: nada de dados reais nem nomes reais. Os docs técnicos do repo (README, docs/) descrevem tudo como feito no próprio repo; só a pasta `bastidores/` fala do Lovable.
- A LIA é sempre feminina, e nada pode sugerir que ela diagnostica.
- Antes de commit ou push no repo, me pergunte.

# Tarefa
1. Clone ou puxe o repo e leia README, AGENTS.md, ARCHITECTURE.md e `bastidores/planejamento-lovable.md`.
2. Abra o projeto no Lovable e o preview, e confirme que o app carrega na Início da Marina.
3. Me devolva um resumo curto do estado e das pendências, em ordem de prioridade para a apresentação de hoje.
4. Espere minhas atualizações. Para cada uma: escreva o prompt do Lovable, me mostre a estimativa de créditos, envie, acompanhe, confira na tela e registre no .md.

# Pronto quando
- O app abre no preview e o resumo de estado bate com o que está na tela.
- Cada atualização feita está conferida na tela e registrada no .md, sem publicar e sem furar o piso de créditos.
```

Rodar com: Opus · esforço high.
