---
name: commit-pr
description: Faz commit, push e PR numa branch seguindo AS REGRAS DO REPOSITÓRIO em que se está (convenção de commit e branch, template de PR, checklist, hooks, quem pode dar push) e perguntando ao Mateus, no chat, cada decisão antes de publicar. Use SEMPRE que for commitar, criar branch, dar push ou abrir PR — em qualquer repo (Jarvis, WeHandle/metabase, WeHandle/dbt-analytics…) — ou quando o Mateus disser "commita", "sobe isso", "abre o PR", "manda pra revisão".
argument-hint: "[o que foi feito]"
---

# Commit e PR seguindo as regras do repo

Cada repositório tem as próprias regras. Esta skill **descobre** as regras antes de escrever qualquer coisa e **pergunta** ao Mateus o que não dá para decidir sozinho. Push e PR são ações públicas: nada sai da máquina sem um "sim" no chat para aquela prévia.

## 1. Descobrir as regras do repo (ler, não supor)

Leia, nesta ordem, o que existir na raiz do repositório:

- `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md` (seções de commit/branch/PR).
- `.github/pull_request_template.md` ou `.github/PULL_REQUEST_TEMPLATE/`.
- `commitlint.config.*`, `.czrc`, `.husky/`, `.pre-commit-config.yaml`, `.claude/settings.json` (hooks).
- `git log --oneline -20` e os últimos PRs mergeados (`list_pull_requests` com `state: closed`) — o padrão real de título, escopo, corpo e chave do Jira.
- `git branch -a` — padrão de nome de branch e qual é a base (`main`, `develop`…).

Monte um resumo de 4–8 linhas: convenção de commit, de branch, base, template de PR, checks obrigatórios, restrições (ex.: "PR só pela UI", "agente não dá push", "push só de estrutura").

## 2. Conferir o estado

- `git status` e `git diff --stat`: o diff bate com o escopo? Arquivo estranho ao escopo → pergunte antes de incluir.
- Nunca commitar na `main`/base: se estiver nela, proponha a branch nova.
- Procure segredo, credencial e dado sensível no diff (CPF, token, `.env`).
- **Jarvis**: repo privado com estrutura + conteúdo (regra 8 do `CLAUDE.md`). Mudança de estrutura vai em branch + PR; commit de conteúdo das rotinas vai direto no `main` da pasta principal. Nada de `git add -f` em segredo/estado local.

## 3. Perguntar (AskUserQuestion, uma rodada, até 4 perguntas)

Só o que as regras não respondem. Típico:

- Tipo e escopo do commit (`feat(collections)`, `fix(agentes/x)`, `docs`…), com a opção recomendada primeiro.
- Chave do Jira a citar (sugira a do `TODO.md`/card em andamento).
- Branch: nome sugerido no padrão do repo, ou usar a atual.
- PR: abrir agora, como draft, ou só dar push.

## 4. Checks antes de publicar

Rode o que o repo exige: testes, lint, harnesses. Hook falhou → investigue e corrija; **nunca** `--no-verify`, nunca pular assinatura, nunca `push --force`.
- **Jarvis**: `powershell -ExecutionPolicy Bypass -File System/scripts/verificar-publicavel.ps1` tem que sair com 0 antes de qualquer push. Reprovou → não faz push, reporta.

## 5. Prévia e confirmação

Mostre no chat, numa só mensagem:

1. Branch (`origem → base`).
2. Mensagem de commit completa: título no padrão do repo **e corpo em tópicos** (`- arquivo/área: o que mudou e por quê`), um tópico por mudança. Commit sem corpo não sai, mesmo que o repo não exija.
3. Título + corpo do PR preenchendo o template do repo (ou o padrão dos PRs recentes: o que é, arquivos, validação, depois do merge).
4. Comandos que vão rodar (`git add <arquivos>`, `git commit`, `git push -u`, criação do PR).

Pergunte: "Publico?" e espere `sim` explícito **para esta prévia**. Ajuste pedido → nova prévia.

## 6. Executar e registrar

- Commit → push → PR (pelo MCP do GitHub ou `gh`, respeitando o template). PR só dentro da org do repo.
- Se o repo proíbe o agente de dar push/abrir PR (ex.: PR é "checkpoint humano"), pare no commit local e entregue ao Mateus o comando e o texto do PR prontos.
- Depois de abrir o PR: vincule-o à sessão (`ccd_pr`), leia o CI e reporte.
- **Link para um clique**: a resposta final traz o PR como link markdown no topo (`[owner/repo#n — título](url)`), pronto para o Mateus abrir e aprovar. Se a criação do PR depender de um formulário ou falhar, entregue o link de comparação (`https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1`) no lugar.
- No Jarvis: linha no `log.md` (`## [AAAA-MM-DD HH:MM] pr | <repo>#<n> <título>`) e, se houver card, `fonte: jira:<KEY>` na tarefa do `TODO.md`.

## Regras

- Exemplos nesta skill só com fictícios (`acme`, `WH-1234`) — regra 10.
- Deploy em PaaS (Vercel, Netlify, Fly, Railway, Heroku…) está fora — política da wehandle; infraestrutura aprovada é AWS.
