# Prompt de retomada

Cole o bloco abaixo num chat novo para continuar o projeto de onde parou.

```md
# Objetivo
Retomar o projeto LIA (hackathon Gama House · Desafio Rivio) a partir da pasta `C:\Users\Carlos\Desktop\lia-hackton` e do contexto abaixo, e me ajudar com as atualizações finais. Todo o produto é feito no Lovable, que você orquestra pelo navegador.

# Contexto
## O projeto
- LIA (sempre "a LIA", no feminino) é um health-brain pessoal: junta exames (PDF ou foto) e dados do relógio numa linha do tempo única, com todo número ligado à fonte. Não diagnostica nem prescreve.
- Conceitos centrais:
  - **LLM Wiki** (Karpathy): bruto, wiki e schema; ingest, query e lint; compilar uma vez, na escrita.
  - **GraphRAG sem embeddings**: busca textual com sinônimos acha os pontos de partida; anda no máximo 2 saltos e junta no máximo 40 fatos; a citação é conferida pelo servidor; sem ponto de partida, responde "não encontrei" e não chama a IA.
  - "A IA extrai, o código decide." As ligações são criadas por regra, nunca pela IA.
- Dados de demo fictícios: a paciente Marina Duarte, os Laboratórios Alfa, Beta e São Lucas, o Hospital Central, a Dra. Helena Costa e o Dr. Rafael Lima. A história da demo é a pneumonia de mar/2025: a SpO2 caiu de 97% para 92% nos 5 dias anteriores.

## Prazos (sábado, 14/11/2026)
- Até as 16h: subir a ideia e a apresentação no portal (o Carlos faz).
- Às 17h: pitch de 5 min + 5 min de perguntas, na Gama House (Rua Mariana Correia, Pinheiros).
- A entrega é apresentar a ideia e os conceitos com o projeto funcionando, não um produto perfeito.

## Onde está cada coisa: a pasta `C:\Users\Carlos\Desktop\lia-hackton`
- **Páginas para abrir no navegador:**
  - `1-apresentacao.html`: o pitch, com vídeo, deck, roteiro de 5 min e o que fazer hoje;
  - `2-conceitos.html`: o artefato "O Brain da LIA", com LLM Wiki, GraphRAG e o projeto;
  - `3-contexto-ia.html`: ondas (feito e falta), mapa do app, regras, fluxo, erros já vistos e este prompt.
- **`apresentacao/`:**
  - `LIA - Apresentação.pptx`: 11 slides; o vídeo está embutido no slide 10;
  - `LIA - Tour da plataforma.mp4`: 2min14s, com a voz neural Thalita;
  - `o-brain-da-lia.html`.
- **`contexto-ia/` (leia primeiro):**
  - `CONTEXTO.md`: mapa do app, regras do motor, estado da demo, fluxo e erros;
  - `planejamento-lovable.md`: plano mestre, com as ondas, os prompts enviados, o registro de créditos, o guardrail e a seção "O que ainda não foi feito";
  - `prompt-de-retomada.md`: este prompt.
- **`repo-github/`:** clone do repo https://github.com/Carlos-Sardenha/LIA---AI-Build-Week (README com LLM Wiki, GraphRAG e o harness; `bastidores/` tem a mesma documentação de contexto). Rode `git pull` antes de usar.
- **Online:**
  - projeto no Lovable: https://lovable.dev/projects/3246bed0-bf28-41f7-a059-d6c3c42904c5 (espaço de trabalho "Marcos's Lovable");
  - preview do app: https://id-preview--3246bed0-bf28-41f7-a059-d6c3c42904c5.lovable.app;
  - artefato v4: https://claude.ai/artifact/4q4R3PeUqod2T24tgejbC3.

## Estado atual do app (Ondas 1, 2, 3, 4A, 4B, 4C como 6.1 e 6 feitas; 149 testes passando)
- **Telas da paciente:**
  - Início: envio do arquivo em 5 etapas visíveis e alerta do relógio;
  - Linha do tempo: Cronologia por ano com o episódio "Pneumonia · mar/2025" e gráficos com "Unificado de";
  - Meu brain: grafo em rede com 40 nós, 174 ligações, 777 fatos e 20 documentos;
  - Wearables: SpO2 diária, com atalho para março/2025;
  - Alertas;
  - Perguntar: com "Como a LIA chegou nisso";
  - Open Health: pedidos de acesso, consentimentos, revogação, histórico de acessos e o botão **"Restaurar demo"** no rodapé.
- **Área do médico:** identificação de demo (Dr. Rafael Lima, CRM 000000-SP), lista de pacientes e ficha consolidada com a origem de cada número.
- **Extração do documento (4C):** profissionais, clínica com endereço, parâmetros da coleta, datas e contatos, cada um com trecho literal e página. Nunca extrai dados do paciente.
- **Demo do Open Health restaurada em 14/11 (conferida na tela):**
  - 4 pedidos pendentes: Plano Saúde Vida, Dr. Rafael (wearables), Hospital Central e Laboratório Alfa;
  - o 123-456 do Dr. Rafael ativo até 15/11/2026 às 23h59;
  - badge de Alertas em 2.
  - O botão "Restaurar demo" volta a esse estado depois de cada ensaio.

## Pendências conhecidas
- Subir a ideia e a apresentação no portal até as 16h (o Carlos faz).
- Depois de cada ensaio do Open Health, clicar em "Restaurar demo".
- O trabalho local que nunca foi commitado (`scripts/exames`, `scripts/sintetico`, o agente extrator-de-exames e os docs dele) se perdeu. Só reconstruir se eu pedir.

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
- **Conferir na tela:** depois de cada relatório, abra a tela no preview do editor e confira. O Lovable já disse que fez coisas que não fez; aconteceu de novo com o botão "Restaurar demo". O link avulso do preview pode demorar a pegar a versão nova.
- **Registrar:** depois de cada passo, atualize `contexto-ia/planejamento-lovable.md`: 🔄 rodando, ✅ feito com o resultado, e o registro de créditos. Se mudar algo que importa para quem continuar, atualize também o `CONTEXTO.md`.
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
1. Leia `contexto-ia/CONTEXTO.md` e `contexto-ia/planejamento-lovable.md` na pasta `lia-hackton`. Se precisar dos conceitos, abra `2-conceitos.html`.
2. Rode `git pull` em `repo-github/` e leia AGENTS.md e README.
3. Abra o projeto no Lovable e o preview, e confirme que o app carrega na Início da Marina e que o Open Health está no estado esperado (4 pedidos, badge 2, botão "Restaurar demo").
4. Me devolva um resumo curto do estado e das pendências, em ordem de prioridade para a apresentação de hoje.
5. Espere minhas atualizações. Para cada uma: escreva o prompt do Lovable, me mostre a estimativa de créditos, envie, acompanhe, confira na tela e registre no .md.

# Pronto quando
- O app abre no preview e o resumo de estado bate com o que está na tela.
- Cada atualização feita está conferida na tela e registrada no .md, sem publicar e sem furar o piso de créditos.
```

Rodar com: Opus · esforço high.
