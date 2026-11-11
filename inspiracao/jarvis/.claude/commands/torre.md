---
description: Torre de controle — várias sessões do Claude Code lado a lado numa página local (sobe, instala ou reinicia)
argument-hint: [vazio = subir | instalar | reiniciar]
---

A Torre (`torre/`, porte de `WeHandle/torre`) é **estrutura local**: um servidor Node em `http://127.0.0.1:4477` (`TORRE_PORT`) com estado em `%USERPROFILE%\.torre` (`TORRE_DATA_DIR`). Ela não escreve no vault, não mexe em sistemas externos (Outlook, Teams, ClickUp, Jira) e não pede nem grava segredos. Detalhes em `torre/README.md` e `torre/INSTALAR.md`.

Leia `$ARGUMENTS` e faça só uma destas:

**Vazio — subir.**
1. Se `torre/node_modules/tsx` não existir, diga que falta instalar e rode o fluxo `instalar` abaixo antes.
2. Veja se já há algo ouvindo na porta: `Get-NetTCPConnection -LocalPort 4477 -State Listen -ErrorAction SilentlyContinue`. Se houver, abra `http://127.0.0.1:4477` no navegador do app (`preview_start` com `url`) e pare aí.
3. Senão, `preview_start` com `name: "torre"` (de `.claude/launch.json`). Sem o navegador do app ou se falhar, oriente o Mateus a rodar num terminal: `powershell -ExecutionPolicy Bypass -File torre\scripts\iniciar.ps1`.

**`instalar`.** Rode (PowerShell, timeout longo, o `npm install` demora): `powershell -NoProfile -ExecutionPolicy Bypass -File torre\scripts\instalar.ps1`. Relate os avisos do script (junction já existente, `claude` fora do PATH) sem tentar consertar sozinho: pasta real em `torre\node_modules` nunca se apaga (regra 1).

**`reiniciar`.** Se a Torre foi aberta por `preview_start` nesta conversa, use `preview_stop` e depois `preview_start` com `name: "torre"`. Senão, rode `powershell -NoProfile -ExecutionPolicy Bypass -File torre\scripts\reiniciar.ps1 -SoEncerrar` (encerra só o processo dono da porta, nunca por nome) e suba como no fluxo vazio. Avise que as sessões voltam com **Retomar** no card.

Nunca rode `iniciar.ps1` ou `npm start` em primeiro plano pela ferramenta de shell: o servidor não termina e trava a resposta. Não duplique na Torre (`rotinas.json`) as rotinas agendadas do Jarvis (ritual, check-in, checkout, semanal).
