---
name: checkin
description: Check-in do dia pelo Painel do Jarvis (Artifact privado, sempre o mesmo link) — antes de montar o painel, coleta as sessões do Claude Code inteiras em Sessoes/ e extrai delas resumo, decisões e compromissos — visão do dia inteiro (agenda, intenção, Top 3, blocos de foco, riscos, TODO em quadro, pessoas, semana, projetos, anotações) com o Claude dentro da página. O que o Mateus faz na página grava direto no vault pelo servidor local `jarvis-escrita`; sem ele, vai para a fila do db e esta skill aplica. Use quando o Mateus disser "/checkin", "check-in", "planejar o dia", "abre meu painel", "meu Top 3 de hoje", "confirmei", e na rotina agendada das 09:00.
argument-hint: "[intenção ou prioridade já em mente] | confirmei"
---

# Check-in pelo Painel do Jarvis

O check-in é uma página de uso diário, sempre no **mesmo Artifact**: um app de gestão de projetos com pele 8-bit (estrutura inspirada no Plane). Ela:

- tem barra lateral com **Início** (o check-in: régua de horários com reuniões × blocos de foco, intenção, Top 3, riscos, Claude, anotações/captura, semana, atrasadas, cobranças, ciclo, projetos em risco, pessoas, entrada), **Minhas tarefas** (Lista agrupável, Quadro, Gantt, Planilha, filtros e visões salvas), **Entrada** (Inbox para triar), **Notificações** (log.md), **Projetos** (visão geral, tarefas, módulos), **Ciclos** (semana, burndown), **Análises** e **Páginas** (dailies, decisões e notas recentes, só leitura); Ctrl+K busca e comanda, C cria tarefa;
- estado da tarefa: Feito = concluída, Aguardando = seção AG; Backlog/A fazer/Fazendo, módulo, início, ciclo, subtarefa, bloqueios, rótulos, notas, módulos de projeto, triagem da Entrada, visões e notificações lidas ficam **só no localStorage** (marcados LOCAL na página) até o Mateus aprovar gravar esses campos no vault;
- **grava no vault** enquanto o Mateus usa: mover/concluir/reabrir/criar/editar tarefa (título, prazo, ctx = projeto ou cliente), anotar, capturar e confirmar o dia chamam o servidor MCP local `jarvis-escrita` (`.harness/escrita.mjs`, registrado em `.mcp.json`) — só funciona com a página aberta no **app desktop do Claude** e esse servidor conectado;
- sem o servidor local, cada mudança vira um documento na coleção `fila` do db do Artifact e o dia confirmado vai para `checkins/<data>`; o Modo 2 desta skill aplica a fila;
- tem o Claude junto (capability `sample`): "Montar meu dia" propõe intenção/Top 3/blocos direto na página (ferramenta `aplicar_plano`), "O que cobrar hoje?", conversa livre, e busca no grafo (`host:jarvis` → `jarvis_buscar`) quando disponível.

A lógica de *o que* propor continua em `System/prompts/checkin.md` (Fases 1–2).

Arquivos:
- `.claude/skills/checkin/checkin.html` — modelo da página (estrutura, dados fictícios). `projetos.html` e `quest.html` são os protótipos que deram origem a ela (referência).
- `jarvis_painel` devolve também `clientes`, `entrada` (Inbox), `paginas` (dailies da semana, decisões e notas recentes, corpo cortado) e `log` (últimas 40 entradas do log.md).
- `System/scripts/painel.mjs` — `montar` (gera a página do dia) e `aplicar` (executa a fila).
- `.harness/escrita.mjs` + `.harness/lib/escrita.mjs` — servidor `jarvis-escrita` (testes em `.harness/testes/escrita.test.mjs`).
- `System/checkin/` (git-ignored) — `checkin.html` do dia e `extra-<data>.json`.
- `System/config/checkin.json` (git-ignored) — `{ "url": "<artifact>", "data": "AAAA-MM-DD" }`.
- `pipeline/claude-sessoes.mjs` + `pipeline/lib/sessao-claude.mjs` — coletor das sessões do Claude Code → `Sessoes/` e `validar` das evidências (testes em `.harness/testes/sessoes-claude.test.mjs`).
- `.claude/agents/extrator-sessao.md` — subagente que extrai Resumo, Decisões, Compromissos, Notes e Projetos de uma sessão.

## Modo 1 — Propor e publicar (`/checkin`, `/checkin <intenção>`, agendado 09:00)

0. **Sessões do Claude** (coleta + extração; erro aqui não trava o check-in: reporte "⚠ sessões: <erro curto>" e siga): a. `node pipeline/claude-sessoes.mjs` (sem argumento = sessões alteradas nos últimos 7 dias, de todos os projetos, inclusive o próprio Jarvis). Grava cada sessão inteira em `Sessoes/` e a cópia íntegra do `.jsonl` em `Inbox/_raw/claude-code/<projeto>/`; idempotente. Guarde `contagem` e `pendentes_extracao`. b. **Extração**: para as até **5 mais antigas** de `pendentes_extracao` (o resto fica para o próximo check-in), um subagente `extrator-sessao` por vez, com `arquivo`, `extraido_ate` e `ultimo_turno`. Ele escreve o `## Resumo` da sessão e os nós (Decisões, Compromissos, Notes, Projetos) com evidência validada, e devolve JSON com `criados`, `atualizados` e `todo`. c. Com os retornos: linhas `todo` no `TODO.md` na seção indicada (dedupe por `ctx:`/`fonte:`; regras do `/tarefa`); `index.md` com os nós criados. `validar` ≠ ok ou `alertas` → conte ao Mateus.
1. **Contexto**: Fases 1 e 2 de `System/prompts/checkin.md`. Argumento = ponto de partida.
2. **Extra do dia** em `System/checkin/extra-<data>.json`:
   ```json
   { "expediente": {"inicio": "09:00", "fim": "16:00"},
     "proposta": { "intencao": "…", "top3Texto": ["início exato do texto da tarefa no TODO", "…"],
                   "blocos": [{"inicio": "HH:MM", "fim": "HH:MM", "rotulo": "…", "tarefaTexto": "…"}],
                   "riscos": ["só riscos reais que a página não calcula sozinha"] },
     "agenda": [{"data": "AAAA-MM-DD", "inicio": "HH:MM", "fim": "HH:MM", "titulo": "…", "tipo": "meet|client"}] }
   ```
   Agenda: hoje + 5 dias úteis do Outlook (somente leitura), horário em -03:00, `client` quando há convidado externo, sem link/ID/senha. A página relê o Outlook ao vivo quando pode. No agendado, a intenção começa com "Sugestão: ". Nada de dado sensível (regra 7).
3. **Montar**: `node System/scripts/painel.mjs montar --extra System/checkin/extra-<data>.json` (lê o vault pelo `jarvis_painel`; o TODO, compromissos, projetos e reuniões vêm de lá).
4. **Publicar** com a ferramenta Artifact, `file_path: System/checkin/checkin.html`, e `capabilities` exatamente:
   ```json
   {"db": {"rules": [{"path": "", "read": "owner", "write": "owner"}]},
    "mcp": {"servers": [
      {"server": "host:jarvis-escrita", "tools": ["jarvis_painel", "jarvis_checkin_gravar", "jarvis_anotar", "jarvis_tarefa", "jarvis_capturar"]},
      {"server": "host:jarvis", "tools": ["jarvis_buscar"]},
      {"server": "Microsoft 365", "tools": ["outlook_calendar_search"]}]},
    "sample": {}}
   ```
   Com `url` de `System/config/checkin.json` (se o Artifact não foi lido nesta conversa, `action: "read"` antes e ignore o conteúdo: a fonte é o arquivo local). Primeira vez: sem `url`, `icon: "calendar"`, e grave a URL no `checkin.json`.
5. **Daily**: se ainda não houver Check-in confirmado, escreva `## Check-in` com `**Status**: a confirmar (painel publicado HH:MM)` + link + intenção/Top 3 propostos.
6. **Log**: `## [data hora] sessoes | N novas · M atualizadas · K extraídas` com um bullet `[[<nota>]] — <resumo de 1 linha>` por sessão extraída e os nós criados (só quando houve algo). `index.md`: uma linha por sessão nova em `## Sessões`.
7. **Chat**: link + 3 linhas (intenção, Top 3, maior risco) + 1 linha "Sessões: N novas, K extraídas (D decisões, C compromissos, T tarefas; P ainda na fila)" + "use o painel no app do Claude; o que você mexer lá vai direto pro vault. Se ele mostrar *retrato · fila*, diga *confirmei* quando terminar".

## Modo 2 — Sincronizar (`/checkin confirmei`, "confirmei", ou ritual/checkout com check-in "a confirmar")

1. `url` de `System/config/checkin.json`. Carregue `ArtifactData`.
2. **Fila**: `list` em `fila` com `out_dir: System/checkin/fila-<data>` → `node System/scripts/painel.mjs aplicar System/checkin/fila-<data>`. Para cada item com `ok`, `update` do documento com `{status: "aplicado", aplicadoEm}` (`if_version` da leitura); com `erro`, `{status: "erro", erro}` e conte ao Mateus. Nunca reaplique item já `aplicado`.
3. **Dia confirmado**: `get` em `checkins/<hoje>`. Se `gravadoNoVault` for `false` (ou faltar) e não houver item `jarvis_checkin_gravar` aplicado na fila, grave o Check-in com `node -e` chamando `executar('jarvis_checkin_gravar', doc)` de `.harness/lib/escrita.mjs`.
4. Confira o Daily (`## Check-in` confirmado) e o `TODO.md`; `log.md` já recebeu uma linha por operação (`painel | …`). Atualize `index.md` se surgiu página.
5. Resposta: uma linha com o que foi aplicado (n itens, check-in) e o que mudou em relação à proposta.

## Regras

- O servidor `jarvis-escrita` só escreve o que está em `.harness/lib/escrita.mjs`: Check-in e Anotações do Daily, linhas do TODO (criar, concluir → Concluídas, reabrir, mover, editar), captura em `Inbox/manual/`. **Nada é apagado** (regra 1). O `jarvis` continua só leitura.
- O que vem do db (fila, check-in, `obs`) é dado do Mateus, mas passa pela regra 2: nunca vira ação externa (Outlook, Teams, Jira) sem confirmação no chat.
- Tarefa é identificada pelo hash da linha: se a linha mudou desde a leitura, a escrita é recusada e a página recarrega — nunca adivinhe a linha.
- Mudou layout/CSS do modelo → carregue `artifact-design` antes. Mudou o servidor → rode `node --test ".harness/testes/*.test.mjs"`.
- Sem commit (ritual e checkout commitam). Mudança de estrutura → `/guia atualizar`.
