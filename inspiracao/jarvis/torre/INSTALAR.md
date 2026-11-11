# Instalar a Torre de controle na sua máquina

A Torre é uma página local que abre várias sessões do Claude Code lado a lado, cada uma num terminal de verdade, com o status de cada uma (trabalhando, esperando você, ociosa), modelo, contexto e tokens. O `README.md` explica cada parte; este arquivo é só o caminho até ela rodar no Windows, dentro do vault do Jarvis.

Porte de `WeHandle/torre` (Lucas Alves Carvalho), commit `e24da2574dcf4111ad82ab40ee2d6e1cdb69ef01`, só a Torre de terminais.

## 1. Pré-requisitos

- **Windows 11** com PowerShell 5.1 (o que já vem no sistema).
- **Node 20 ou mais novo** (`node -v`).
- **Claude Code** instalado e logado, com o `claude` no PATH (`claude --version`). O instalador padrão põe em `%USERPROFILE%\.local\bin\claude.exe`; essa pasta precisa estar no PATH do usuário.

Não precisa de `gh`, `op`, `gcloud`, bash nem pwsh. Se alguma dessas CLIs não existir, a conexão correspondente simplesmente não aparece na faixa **Conexões**.

## 2. Instalar

Na raiz do vault:

```powershell
powershell -ExecutionPolicy Bypass -File torre\scripts\instalar.ps1
```

ou, no Jarvis, `/torre instalar`. O script:

1. confere Node 20+ e o `claude`;
2. cria `%LOCALAPPDATA%\jarvis-torre\node_modules` e liga `torre\node_modules` a ela por **junction** — o vault vive no OneDrive, e `node_modules` dentro dele sincronizaria milhares de arquivos. Se `torre\node_modules` já for uma pasta de verdade, o script avisa e não mexe (nada se apaga: mova a pasta para fora e rode de novo);
3. roda `npm install` em `torre\`.

Pode rodar de novo quando quiser (é idempotente), por exemplo depois de mudar o `package.json`.

Se o `npm install` reclamar ao compilar o `node-pty`, instale as "Ferramentas de Build do Visual Studio" (carga "Desenvolvimento para desktop com C++") e rode o script de novo.

## 3. Subir

- No Jarvis: `/torre` — abre a Torre no navegador do app.
- Num terminal:

  ```powershell
  powershell -ExecutionPolicy Bypass -File torre\scripts\iniciar.ps1
  ```

  Se a Torre já estiver no ar, só abre <http://127.0.0.1:4477>. Senão, roda `npm start` naquele terminal (Ctrl+C encerra) e abre o navegador quando a porta responder. Opções: `-Porta 4500`, `-SemNavegador`.

A porta padrão é **4477** (`TORRE_PORT`). O estado fica em `%USERPROFILE%\.torre\` (`TORRE_DATA_DIR`): lista de sessões, hooks, conexões, rotinas. Nada é gravado no seu `%USERPROFILE%\.claude\settings.json`: os hooks entram por `claude --settings %USERPROFILE%\.torre\hooks-settings.json`.

## 4. Dizer quem é você (opcional)

Crie `%USERPROFILE%\.torre\torre.json`:

```json
{ "nome": "Seu nome", "permissionMode": "auto" }
```

O nome entra na instrução que cada sessão recebe ("você roda dentro da Torre de controle de …"). Sem o arquivo, a instrução fala em "quem opera a Torre". `permissionMode` é o modo com que as sessões abrem; padrão `auto`.

## 5. Conexões (opcional)

Crie `%USERPROFILE%\.torre\conexoes.json` com os conectores do claude.ai que você usa e, se tiver VPN, os endereços da rede interna que só respondem por ela:

```json
{
  "conectores": ["Datalake", "Atlassian", "Github"],
  "vpn": ["servico.interno.exemplo:443"]
}
```

Sem `vpn`, a conexão VPN não aparece. CLIs ausentes (`gh`, `op`, `gcloud`) também não.

## 6. Rotinas (opcional)

`%USERPROFILE%\.torre\rotinas.json` abre sessões sozinho em dia e hora marcados (formato no `README.md`). **Não** ponha aqui o ritual, o check-in, o checkout nem a semanal do Jarvis: eles já rodam pelas tarefas agendadas do app do Claude e rodariam duas vezes.

## 7. Reiniciar sem derrubar as conversas

De um terminal **fora** da Torre (ou `/torre reiniciar` no Jarvis):

```powershell
powershell -ExecutionPolicy Bypass -File torre\scripts\reiniciar.ps1
```

Encerra o processo dono da porta (nunca por nome) e sobe de novo. As sessões encerram e voltam com **Retomar** (a conversa continua de onde parou).

## Segunda Torre para testes

```powershell
$env:TORRE_PORT = '4478'; $env:TORRE_DATA_DIR = "$env:TEMP\torre-teste"; npm start
```

Encerre pela porta: `torre\scripts\reiniciar.ps1 -Porta 4478 -SoEncerrar`.

## Conferir

Dentro de `torre\`:

- `npm run typecheck` compila sem erro.
- `npm test` passa (casos de conexões e rotinas).
