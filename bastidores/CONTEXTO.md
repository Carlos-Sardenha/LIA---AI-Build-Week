# Contexto para a IA: como continuar a LIA

Este é o primeiro arquivo a ler para **implementar coisas novas ou corrigir erros no app da LIA** durante a hackathon. O código do app em funcionamento **não está neste repo**. Ele vive no projeto do Lovable, e você trabalha mandando prompts para o Lovable pelo navegador. Este repo guarda o contexto: o porquê, as regras e o histórico.

- Histórico completo, prompts já enviados e créditos: [`planejamento-lovable.md`](planejamento-lovable.md)
- Prompt pronto para abrir um chat novo: [`prompt-de-retomada.md`](prompt-de-retomada.md)
- Conceitos (LLM Wiki, GraphRAG, harness): [`../README.md`](../README.md) e [`../apresentacao/o-brain-da-lia.html`](../apresentacao/o-brain-da-lia.html)

## 1. O produto em 30 segundos

- **LIA** (sempre "a LIA", no feminino) é um health-brain pessoal.
- Junta exames (PDF ou foto) e dados do relógio numa linha do tempo única, com todo número ligado à fonte (trecho literal e página).
- A paciente pergunta em linguagem natural e compartilha com o médico por consentimento, no modelo do Open Finance.
- **Não diagnostica nem prescreve.** Para o médico, os achados aparecem como "Achado para avaliação clínica".

**Demo (dados fictícios):**
- a paciente Marina Duarte, 58 anos;
- os Laboratórios Alfa, Beta e São Lucas e o Hospital Central;
- a Dra. Helena Costa, o Dr. Rafael Lima (CRM 000000-SP) e a Ana Ribeiro;
- a história central é a pneumonia de 18/03/2025: a SpO2 do relógio caiu de 97% para 92% entre 13 e 17/03/2025.

## 2. Onde está o app

| O quê | Onde |
|---|---|
| Projeto ativo (editar) | https://lovable.dev/projects/3246bed0-bf28-41f7-a059-d6c3c42904c5 (espaço "Marcos's Lovable") |
| Preview (usar o app) | https://id-preview--3246bed0-bf28-41f7-a059-d6c3c42904c5.lovable.app |
| Stack | TanStack Start em TypeScript; banco Postgres com RLS e armazenamento privado (Lovable Cloud); IA chamada só em funções do servidor; migrações versionadas |

Os créditos são cobrados do **espaço de trabalho dono do projeto** (o do Marcos), não de quem digita.

## 3. Mapa do app

| Rota | Tela | O que faz |
|---|---|---|
| `/` | Início | Alerta do relógio no topo, envio de PDF/JPG/PNG em 5 etapas visíveis, resultados recentes com "ver fonte" |
| `/linha-do-tempo` | Linha do tempo | Cronologia horizontal por ano (cartões de laudo, episódio "Pneumonia · mar/2025" em destaque, filtros, "Ir para hoje"); um gráfico por exame com faixa e "Unificado de: nomes · laboratórios"; SpO2 como contexto ("do relógio · ver em Wearables") |
| `/meu-brain` | Meu brain | Grafo em rede: 40 nós visíveis, 174 ligações, 777 fatos, 20 documentos; filtros por tipo, zoom, painel do nó com ligações e "ver fonte" |
| `/wearables` | Wearables | SpO2 diária com atalho "março de 2025 (antes da pneumonia)", frequência cardíaca, sono, passos; importar export do relógio |
| `/alertas` | Alertas | Gerados por regra, sem diagnóstico ("vale procurar um médico") |
| `/perguntar` | Perguntar | GraphRAG com resposta citada e "Como a LIA chegou nisso" (pontos de partida, ligações percorridas, evidência) |
| `/open-health` | Open Health | Pedidos de acesso (aprovar em 4 passos ou recusar), consentimentos com prazo e revogar, histórico de acessos, comprovante em PDF, portabilidade (JSON inspirado em FHIR + PDF) |
| `/medico` | Portal do profissional | Identificação de demo (nome + CRM fictícios, sem senha), lista de pacientes que compartilharam, entrada por código ou QR |
| `/medico/ficha` | Ficha consolidada | "Desde o seu último acesso", "O que mudou", alertas, resumo por IA com fonte, "Pergunte sobre esta paciente"; confere o consentimento a cada 15 s |

Toda tela tem caminho de volta: "← Voltar para a paciente" e "Sair do portal" no portal do médico, Fechar/Esc em modais e páginas de 404 e de acesso expirado.

## 4. Regras do motor (não quebre)

**Escrita (LLM Wiki): a IA extrai, o código decide.**
- **Original:**
  - guardado em bucket privado;
  - SHA-256 barra duplicata ("Este exame já está no seu histórico");
  - "ver fonte" abre por link assinado de 600 s.
- **A IA devolve:**
  - o nome como está no laudo;
  - `value_text` exatamente como impresso;
  - unidade, faixa literal (`ref_text`), material, trecho e página.
- **O servidor decide:**
  - a série, pelo dicionário de 15 exames: LDL, HDL, colesterol total, triglicérides, glicemia de jejum, hemoglobina glicada, TSH, T4 livre, hemácias, hemoglobina, leucócitos, plaquetas, creatinina, vitamina D e ferritina. Tenta o nome inteiro, o nome sem o parêntese e o conteúdo do parêntese. Fora do dicionário, a série fica `standardized=false`;
  - o número: vírgula é decimal, e ponto seguido de 3 dígitos é milhar, exceto com zero na frente. Valor ambíguo usa a leitura mais próxima da faixa;
  - a unidade padrão: glicose em mmol/L ×18 e colesterol em mmol/L ×38,67, guardando o valor original e mostrando "convertido de X";
  - o status pela faixa, com limites inclusivos; sem faixa, "Sem referência";
  - o material: o que não é sangue nunca usa o dicionário (ex.: "Urina: glicose").
- **Fonte:** o valor precisa aparecer inteiro no trecho ("28" não vale dentro de "128").
- **Dados do documento (4C):**
  - extrai profissionais (registro e papel), clínica (CNPJ e endereço), parâmetros da coleta, datas e horários e contatos, cada um com trecho e página;
  - o servidor valida CNPJ, CEP, telefone e e-mail;
  - **dados do paciente nunca são extraídos.**
- **Ligações:** criadas por regra (`brain_nodes`, `brain_links`), nunca pela IA. São de quatro tipos: mesma série, mesmo laudo, antes de (com janela em dias) e relacionado. Depois de mudar os dados, rode a reconstrução do brain.

**Leitura (GraphRAG, sem embeddings):**
- **Pontos de partida:** vêm de tsvector em português com sinônimos ("oxigenação" vira SpO2).
- **Limites:** até 2 saltos e até 40 fatos, todos do subgrafo.
- **Antes da IA:** nome e nascimento da paciente não vão para ela.
- **Depois da IA:** o servidor confere a citação de cada frase e esconde a que não tem fonte ou que traz diagnóstico.
- **Sem ponto de partida:** a resposta é "Não encontrei isso no seu histórico", com o selo "resposta sem IA"; a IA não é chamada.
- **Se a IA falhar:** a resposta é montada direto dos dados.

**Segurança:**
- RLS fechado em 15 tabelas para `anon` e `authenticated`; tudo passa pelas funções do servidor.
- O conteúdo dos arquivos é tratado como dado não confiável.
- Nada é apagado; o que for indesejado é arquivado.

## 5. Estado dos dados da demo (o esperado)

- 4 pedidos de acesso pendentes: Plano Saúde Vida, Hospital Central, Laboratório Alfa e o Dr. Rafael para wearables.
- O código 123-456 está ligado ao Dr. Rafael até 15/11/2026 às 23h59.
- 2 alertas: ritmo irregular (3 episódios entre 08 e 12/11/2026) e queda de SpO2.
- Se o ensaio consumiu os pedidos, peça ao Lovable para **restaurar só os pedidos e consentimentos da demo**, sem apagar o histórico de acessos.

## 6. Como trabalhar (fluxo)

1. Leia o pedido do Carlos e escreva **um prompt por vez** para o Lovable, com:
   - o problema visto na tela e o que deve acontecer;
   - itens numerados;
   - o fim fixo: "Não publique o app e não mude dados. No fim, me diga como testou e confirme que as outras telas continuam funcionando."
2. Estime o custo em créditos (prompts típicos custam 3–12) e respeite o **piso de 15 créditos** no espaço do Marcos. O saldo não aparece para o Carlos; peça ao Marcos quando importar.
3. Envie pelo Claude in Chrome:
   - campo "Pergunte à Lovable…", modo **Criar**, Shift+Enter entre parágrafos;
   - clique na seta para enviar, porque o Enter às vezes não envia;
   - confira que a mensagem entrou no chat.
4. Acompanhe em ciclos de ~2 min até o relatório final (ele traz o número de testes).
5. **Confira na tela, no preview.** O Lovable já disse ter corrigido coisas que continuavam erradas, como nós duplicados e nome de arquivo no rótulo.
6. Registre em `planejamento-lovable.md` (🔄 rodando, ✅ feito com o resultado e os números) e faça commit só com o OK do Carlos.

**Nunca:**
- clicar em Publicar;
- aceitar "Continuar" de créditos ou comprar créditos;
- apagar dados;
- digitar senha ou código de acesso (o 123-456 o Lovable testa sozinho).

**Repo público:**
- nada de dado real;
- os docs técnicos (README, `docs/`) descrevem tudo como feito no próprio repo; só `bastidores/` fala do Lovable;
- a LIA é sempre feminina.

## 7. Erros já vistos e lições

| Sintoma | Causa / lição |
|---|---|
| Nós duplicados no grafo e na Cronologia ("Dra. Helena Costa" e "Dra. Helena Costa · dados fictícios") | O sufixo " · dados fictícios" impedia a normalização. Normalize sem o sufixo, sem acento e sem caixa; o selo "dados fictícios" do topo já avisa |
| Rótulo de documento com nome de arquivo (`complemento-ficticio-3-20261113.pdf`) | Use tipo + laboratório + data; o nome do arquivo fica só no painel lateral. Há teste contra isso |
| Meu brain saiu em grade, não em rede | Peça explicitamente "force-directed, linhas curvas entre nós ligados de fato" |
| Usuário ficou preso no `/medico` | Toda tela precisa de caminho de volta |
| Primeiro item da Cronologia cortado à esquerda | Resolvido no redesenho horizontal |
| Lovable diz "feito" e a tela não mudou | Sempre conferir no preview antes de registrar |
| Contagem de nós: 46 nas ligações × 40 visíveis | 46 conta antes da limpeza de duplicados; a tela mostra 40 |
| Remix do projeto vem com o banco vazio | Foi preciso recriar o esquema e os dados (Prompt M1 no planejamento) |

## 8. Ideias e limitações abertas (backlog)

- Conferir que o trecho existe naquela página do PDF; marcar "trecho não conferido" em foto.
- Segunda extração independente, com voto entre as duas.
- Auditoria: "Extraído por IA em <data> e conferido por regra".
- Importar o export real do Apple Health; foto pelo celular (HEIC, redução para 2000 px).
- Sono e passos na mesma faixa da Linha do tempo.
- Plano B sem IA com corte de tempo de 10 s.
- O "Como a LIA chegou nisso" ainda é mais lista do que grafo; o mini-grafo pode ganhar o visual de rede do Meu brain.
