# Jarvis no localhost (código: Torre)

A página local do Jarvis: uma **Visão geral** de todas as frentes que o Mateus está tocando, uma página por **frente** (kanban, sessões do Claude, Jira, Teams e contexto do grafo), a aba **Geral** com as sessões soltas e o **5 min de conhecimento**. Por baixo, opera várias sessões do Claude Code ao mesmo tempo: cada card é um terminal de verdade, com o status da sessão (trabalhando, esperando você, ociosa), o modelo, o contexto ocupado e os tokens gastos. Na tela o nome é Jarvis; no código continua `torre` (pasta, `/torre`, variáveis `TORRE_*`, `%USERPROFILE%\.torre`).

> **Origem.** Porte da Torre de controle de Lucas Alves Carvalho — repositório `WeHandle/torre`, commit `e24da2574dcf4111ad82ab40ee2d6e1cdb69ef01`. Aqui fica só a Torre de terminais, ajustada para rodar no Windows dentro do vault do Jarvis.

É local: servidor e página na mesma máquina. Feita para Windows 11 (PowerShell 5.1); macOS e Linux continuam funcionando, mas não são o foco.

## Rodar

Primeira vez (ver `INSTALAR.md`):

```powershell
powershell -ExecutionPolicy Bypass -File torre\scripts\instalar.ps1
```

Depois, de qualquer um destes jeitos:

- no Jarvis: `/torre` (abre no navegador do app);
- num terminal: `powershell -ExecutionPolicy Bypass -File torre\scripts\iniciar.ps1` (se a Torre já estiver no ar, só abre a página);
- à mão: `npm start` dentro de `torre\`.

Abra <http://127.0.0.1:4477>. A porta muda com `TORRE_PORT` (ou `iniciar.ps1 -Porta 4500`).

Requisitos: Node 20+ e o `claude` no PATH.

## Como funciona

```
página (xterm.js)  ⇄ WebSocket ⇄  servidor Node  ──  node-pty  ──  claude (um por card)
                                       ▲
                    hooks do Claude ───┘  (POST /hook)
                    transcrição .jsonl ──  modelo e tokens
```

- **Servidor** (`src/server/`): dono dos terminais. Cada sessão é um processo `claude` num PTY (ConPTY no Windows). A página pode fechar e reabrir: o servidor guarda a saída recente e reenvia.
- **Status**: cada sessão aberta pela Torre recebe hooks via `claude --settings %USERPROFILE%\.torre\hooks-settings.json`. O `%USERPROFILE%\.claude\settings.json` fica intocado. O hook (`src/hook/report.mjs`) só repassa o evento.
- **Modelo e tokens**: lidos de forma incremental da transcrição da sessão (`%USERPROFILE%\.claude\projects\…\<id>.jsonl`), deduplicando por `message.id`.
- **Página** (`src/client/`, `public/`): esbuild empacota ao subir o servidor.

Estado em `%USERPROFILE%\.torre\` (muda com `TORRE_DATA_DIR`): a lista de sessões (para retomar depois de reiniciar o servidor, com `claude --resume`), o arquivo de hooks e as configurações abaixo. Nada disso fica no vault.

## Com o Jarvis

- `/torre` sobe a Torre (ou abre, se já estiver no ar); `/torre instalar` e `/torre reiniciar` chamam os scripts de `torre\scripts\`.
- Toda sessão aberta pela Torre recebe `TORRE_SESSION` no ambiente. O hook do Guia do Jarvis (`System/scripts/guia.mjs hook`) fica em silêncio nelas: abrir o guia em cada card seria ruído.
- As dependências moram em `%LOCALAPPDATA%\jarvis-torre\node_modules`, ligadas por junction em `torre\node_modules`: o vault vive no OneDrive e não deve sincronizar milhares de arquivos de pacote.

## Frentes

Uma frente é uma nota de `Projetos/` com `frente: true` no frontmatter (opcionais: `repo`, `pastas`, `jira_jql`, `teams_busca`, `cor`, `aliases`). Contrato completo em `FRENTES-CONTRATO.md`.

- **Abas e rotas**: `#/visao` (padrão), `#/geral`, `#/frente/<id>` — duas abas do navegador podem ficar cada uma numa frente.
- **Kanban**: linhas do `TODO.md` com `[[<id>]]` (ou um alias em wikilink), em P1, P2, P3, P4, Aguardando e Concluídas. Arrastar ou o menu "⋯" grava pelo `jarvis_tarefa` do `.harness` (com linha no `log.md`); "+ tarefa" cria com `ctx: [[<id>]]`.
- **Sessões**: "Nova sessão aqui" abre na 1ª pasta da frente (senão na raiz do Jarvis). Na Geral, cada sessão ganha uma sugestão de frente pelo contexto (pasta, repo, nomes citados); "Mover" confirma, ✕ dispensa. "Mover para…" no card troca a qualquer hora.
- **Jira e Teams**: "Atualizar" roda `claude -p` em segundo plano com só ferramentas de leitura dos conectores, usando `jira_jql` e `teams_busca`; o resultado fica em `%USERPROFILE%\.torre\frentes\<id>.json`.
- **Contexto**: compromissos abertos, reuniões, decisões e pessoas ligadas à frente no grafo.
- O vault lido é sempre o checkout principal do Jarvis (`pastaPrincipal`), nunca um worktree.

## Pendências e projetos

- **Aba Pendências** (`#/pendencias`): o `TODO.md` inteiro em kanban (todas as frentes e o que não é de frente, com filtro), Aguardando com quem e quando cobrar, compromissos abertos do grafo ("meus" e "dos outros", vencidos primeiro), reuniões dos próximos 7 dias e dos últimos 7. Arrastar ou criar tarefa grava pelo `jarvis_tarefa` (com linha no `log.md`). Rotas: `GET /api/pendencias`, `POST /api/pendencias/tarefa`.
- **Projetos** na Visão geral: todas as notas de `Projetos/`, com status, prazo, tarefas abertas, P1 e vencidas; as que são frente levam à aba delas.
- Jira e Teams das frentes: uma busca por vez (as outras esperam na fila), até 8 minutos cada.

## 5 min de conhecimento

O cartão no topo da Visão geral lê a pílula mais recente de `System/conhecimento/` (gerada pelo `/conhecimento`, que roda no ritual). "Salvar no vault" gera `Aprender/pilulas/<data>.md` (nunca sobrescreve uma nota existente); "Gerar agora" abre uma sessão rodando `/conhecimento`. Na página da frente aparecem só os itens daquela frente.

## Segurança

- O servidor escuta só em `127.0.0.1`.
- Cada execução gera um token. A página o recebe embutido no HTML; a API e o WebSocket recusam pedidos sem ele, e o WebSocket só aceita a origem da própria Torre. Assim, outra aba do navegador não consegue digitar nos terminais.

## Importar terminais

O botão **Importar terminais** lista as sessões do Claude Code abertas fora da Torre (outras abas, outros apps), lidas do registro que cada `claude` mantém em `%USERPROFILE%\.claude\sessions\<pid>.json`. Para cada uma marcada, a Torre encerra o processo original e retoma a mesma conversa num card (`claude --resume`): só um processo escreve na conversa por vez. A aba original fica aberta com o shell. Sessão sem nenhum pedido ainda não tem conversa gravada; nesse caso a Torre abre o Claude na mesma pasta. A lista abre sem nada marcado.

O registro é formato interno do Claude Code e pode mudar entre versões.

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+1…9` (`⌘1…⌘9` no macOS) | Vai para o terminal N |
| Grade / Foco · Ampliar / Minimizar | Um terminal grande e os outros em coluna; Minimizar volta para a grade |
| Barra lateral | Total de terminais abertos, contagem por status e lista; clicar numa conversa a amplia |
| Em lote | Marca sessões para receber o mesmo pedido |
| Clique no nome do card (ou no lápis ✎) | Renomeia o terminal: Enter salva, Esc cancela, vazio volta ao título automático; o nome dado é o oficial |
| Arrastar o cabeçalho do card (na grade) ou um item da lista lateral | Muda a ordem dos terminais: grade, lista e atalhos `Ctrl+1…9` seguem a mesma ordem, gravada no servidor |
| `Tab` no campo Pasta vazio | Traz a pasta principal (a fixada, senão a última usada, senão a home) |
| `Tab` com parte do caminho | Completa como no shell; com várias opções, lista os nomes |

## Ordem dos terminais

Na grade, segure o cabeçalho de um card (a alça ⠿, o nome ou qualquer espaço vazio) e solte onde ele deve ficar: um traço mostra se cai antes ou depois do card sob o cursor. Na lista lateral, o mesmo com cada item; apertar e soltar no lugar continua abrindo a conversa. A ordem é uma só para grade, lista e atalhos `Ctrl+1…9`, fica gravada em `sessions.json` e vale em qualquer aba aberta. Os botões de status ("3 esperando você") continuam trazendo um grupo para a frente sem mexer na ordem gravada.

## Configuração: `%USERPROFILE%\.torre\torre.json`

Arquivo opcional com quem opera esta Torre:

```json
{ "nome": "Ana", "permissionMode": "auto" }
```

- `nome`: como as sessões se referem a você na instrução da Torre. Sem ele, a instrução fala em "quem opera a Torre".
- `permissionMode`: modo de permissão com que cada sessão abre (`claude --permission-mode`). Padrão `auto`.
- `pastaPrincipal`: onde as sessões abrem por padrão (o campo Pasta já vem preenchido com ela). Sem a chave, é a raiz do Jarvis, a pasta acima de `torre/`; rodando de um worktree, o checkout principal do vault. "Fixar como principal" na página vale por cima, só naquele navegador.

## Barra lateral e ampliado

A seta no topo da barra lateral recolhe a barra para uma faixa de 48 px (aponta para a esquerda) e abre de novo (aponta para a direita); a escolha fica salva no navegador. Em **Configurações → Ampliar**, "Terminal ocupa a janela" (padrão) esconde os quadros de tokens, os campos de nova sessão e os outros cards enquanto um terminal está ampliado; "Com os outros em coluna" mantém a disposição anterior.

## Conexões

A faixa **Conexões** no topo mostra as conexões de que as sessões dependem. Verde está conectada; vermelha caiu, e o clique reconecta. Nenhuma checagem pede digital nem abre navegador. A Torre checa a cada 10 min, ou a cada 2 min com alguma conexão caída.

- **Conectores do claude.ai**: os nomes listados em `%USERPROFILE%\.torre\conexoes.json` (`{"conectores": [...]}`). O login é OAuth dentro do Claude Code: o clique abre uma sessão já no `/mcp`; ali, escolha o conector → Authenticate.
- **VPN** (opcional): `"vpn": ["host:porta", …]` com endereços que só respondem pela rede interna. Sem a lista, a VPN não aparece.
- **CLIs** (1Password `op`, `gcloud`, GitHub `gh`): só aparecem quando a CLI está instalada. Na máquina sem elas, a faixa mostra só os conectores (e a VPN, se configurada).
- **Pausar em vez de pedir login:** o hook `src/hook/conexoes.mjs` barra a ferramenta que depende de uma conexão caída. A sessão para, e o card fica **Aguardando conexão**. Quando a conexão volta, a Torre manda a sessão continuar. Para conector, ela reabre a mesma conversa antes do pedido, porque cada sessão liga os conectores quando abre. Regras em `src/hook/conexoes-regras.mjs`.
- Todas as sessões abrem no `permissionMode` do `torre.json` (padrão `auto`), com uma instrução da Torre: credencial é assunto da Torre, e ação barrada ou destrutiva é para parar e esperar você, sem caixa de pergunta.

Casos das regras: `node teste/conexoes.test.mjs`.

## Rotinas: `%USERPROFILE%\.torre\rotinas.json` (opcional)

Lista de sessões que a Torre abre sozinha num dia e hora marcados (lido a cada minuto; editar vale sem reiniciar):

```json
[
  { "id": "exemplo", "nome": "Exemplo {data}", "dias": [1, 2, 3, 4, 5], "hora": "10:00",
    "cwd": "~/projetos/acme", "prompt": "Resuma o que mudou ontem.", "ativa": true }
]
```

`dias`: 0 = domingo … 6 = sábado. Torre fora do ar no horário: roda quando voltar, no mesmo dia. O dia da última execução fica em `rotinas-estado.json`.

> **Não duplique as rotinas do Jarvis.** Ritual (07:30), check-in (09:00), checkout (18:00) e semanal (sex 16:30) rodam pelas tarefas agendadas do app do Claude. Pôr as mesmas aqui faria cada uma rodar duas vezes no vault.

## Aparência

Em **Configurações**, no pé da barra lateral (fechada até você clicar): tema claro ou escuro e três paletas (WeHandle, Verde e preto, Colorido). Fica salvo no navegador. No tema claro, rodar `/theme` dentro do Claude Code e escolher a opção clara deixa as cores do próprio Claude legíveis.

## Diagnóstico

Registrar cada hook recebido no console:

```powershell
$env:TORRE_DEBUG = '1'; npm start
```

Segunda Torre (testes) sem mexer no estado da principal: outra porta e outra pasta de estado.

```powershell
$env:TORRE_PORT = '4478'; $env:TORRE_DATA_DIR = "$env:TEMP\torre-teste"; npm start
```

Para encerrá-la, mate o processo **pela porta**, nunca por nome (o nome `node` também pega a Torre principal e qualquer outro Node da máquina):

```powershell
Get-NetTCPConnection -LocalPort 4478 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

(`torre\scripts\reiniciar.ps1 -Porta 4478 -SoEncerrar` faz o mesmo.)

## Conferir

```powershell
npm test            # casos das regras (conexões, rotinas)
npm run typecheck   # tsc --noEmit
```

## Próximos passos

- Limite do plano (janela de 5h e semanal), com a statusline como referência de fonte.
- Servidor fora da máquina da pessoa, via `criar-app-interna` (AWS/Kubernetes, SSO).
