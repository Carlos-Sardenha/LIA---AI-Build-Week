---
name: guia
description: Abre ou atualiza o Guia do Jarvis — a página (Artifact) que mostra todas as features do segundo cérebro e como usá-las. Use quando o Mateus pedir o guia, perguntar "o que o Jarvis faz", "quais comandos existem", "como uso X", quando o hook de início de conversa avisar que o guia está desatualizado ou não publicado, e SEMPRE ao terminar uma mudança de estrutura (comando, skill, agente, prompt, ferramenta jarvis_*, fonte, regra do CLAUDE.md).
argument-hint: "[atualizar]"
---

# Guia do Jarvis

Página única `System/guia/guia.html`, publicada como Artifact privado e aberta no início de toda conversa pelo hook `SessionStart` (`.claude/settings.json` → `node System/scripts/guia.mjs hook`). O estado (URL + hash de cada arquivo-fonte) fica em `System/config/guia.json`, git-ignored, no checkout principal do vault.

## Modo padrão (`/guia`)

1. `node System/scripts/guia.mjs status`.
2. `EM DIA` → Artifact `action: "open"` com a URL. Fim.
3. `DESATUALIZADO` ou `NÃO PUBLICADO` → siga o modo atualizar.

## Modo atualizar (`/guia atualizar`, ou aviso do hook)

1. **O que mudou**: `node System/scripts/guia.mjs status` lista os arquivos alterados/novos/removidos. Leia cada um (no modo forçado sem mudanças, releia `.claude/commands/`, `.claude/skills/`, `.claude/agents/`, `System/config/ferramentas.md` e o `CLAUDE.md` § Operações).
2. **Editar só o JSON** de `<script id="guia-data">` em `System/guia/guia.html` (o resto da página renderiza a partir dele):
   - comando/skill novo → item no grupo certo de `grupos` (`cmd`, `args`, `resumo`, `quando`, `escreve`, `exemplos`, e `conf: true` se escreve fora do vault com "sim");
   - comando removido → tirar o item; mudou o comportamento → reescrever o item;
   - ferramenta `jarvis_*` nova → linha em `consultas`; fonte nova → `fontes`; regra inviolável nova → `regras`; pasta nova → `pastas`; horário de rotina → `dia`;
   - `atualizado` = data de hoje (`AAAA-MM-DD`). Escreva do lado de quem usa: o que a pessoa digita e o que acontece, não como foi implementado. Mudança puramente interna (refatoração de prompt sem efeito visível) não muda o JSON — só republique e grave o estado.
3. **Regra 10 do `CLAUDE.md`**: o arquivo é estrutura e vai pro GitHub — exemplos só com fictícios (`acme`, `beta`, `ana-lima`, `WH-1234`); nada de cliente, pessoa ou id real, nem dado sensível.
4. **Publicar** com a ferramenta Artifact, `file_path: System/guia/guia.html`:
   - já existe URL → `url: <URL>` (se o Artifact não foi lido nesta conversa, faça antes `action: "read"` nessa URL; ignore o conteúdo lido, a fonte da verdade é o arquivo local);
   - primeira vez → sem `url`, com `icon: "compass"` e `description: "Todas as features do Jarvis e como usar cada uma."`. Não precisa recarregar a skill `artifact-design` só para trocar o JSON; carregue-a se mexer em layout/CSS.
5. **Gravar o estado**: `node System/scripts/guia.mjs gravar --url <URL>` (rode no diretório onde editou o HTML, para o hash bater com o arquivo publicado).
6. **Log**: se `log.md` existir na raiz, acrescente `## [AAAA-MM-DD HH:MM] guia | atualizado (<arquivos que motivaram>)`.
7. Resposta: uma linha com o link e o que mudou no guia. O commit do `guia.html` vai junto com a mudança de estrutura que o motivou.
