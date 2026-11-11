# Frentes na Torre — contrato entre servidor e página

Uma **frente** é uma nota de `Projetos/` do Jarvis com `frente: true` no frontmatter. Cada frente vira uma página da Torre (aba no topo e rota `#/frente/<id>`), com kanban das tarefas, sessões do Claude, cards do Jira, Teams e contexto do grafo. Sessões sem frente ficam em **Geral**.

## Vault (fonte)

Raiz do vault = `PASTA_PRINCIPAL` (checkout principal do Jarvis; nunca o worktree). Código de leitura e escrita reaproveitado do `.harness/lib/` (irmão de `torre/`), sempre passando `root = PASTA_PRINCIPAL`: `consultas.mjs` (`contexto`, `reunioes`, `compromissos`, `decisoes`, `no`) e `escrita.mjs` (`lerTodo`, `executar('jarvis_tarefa', …)`, `versao`). Importe com `import(pathToFileURL(...).href)` tipado como `any` (são .mjs sem tipos).

Frontmatter da frente (todos opcionais, exceto `frente`):

```yaml
frente: true
status: ativo
aliases: [Megabrain, Company Brain]
repo: WeHandle/exptools-ajudantecstomador     # GitHub owner/nome
pastas: ["C:/caminho/do/clone"]               # onde as sessões da frente abrem (1ª) e casam por cwd
jira_jql: 'project = DAD AND text ~ "megabrain" ORDER BY updated DESC'
teams_busca: ["megabrain", "company brain"]   # termos para buscar chats/canais/reuniões
cor: "#b7a4f5"                                # opcional; senão a página escolhe da paleta
```

Tarefa da frente = linha do `TODO.md` com `[[<id>]]` (em `ctx:` ou no texto) ou com um alias em wikilink. Id da frente = nome do arquivo sem `.md`.

## Tipos

```ts
type Quadrante = 'P1' | 'P2' | 'P3' | 'P4' | 'AG' | 'OK';
interface Tarefa { id: string; texto: string; quadrante: Quadrante; prazo?: string; vencida: boolean; quem?: string; fonte?: string; jira?: string }
interface JiraCard { key: string; titulo: string; status: string; responsavel?: string; url: string; atualizado?: string }
interface TeamsItem { tipo: 'chat' | 'canal' | 'reuniao'; titulo: string; quem?: string; quando: string; trecho: string; url?: string }
interface Externo { jira: JiraCard[]; teams: TeamsItem[]; atualizadoEm: number | null; atualizando: boolean; erro?: string }
interface FrenteResumo {
  id: string; titulo: string; status: string; cor: string; repo?: string;
  resumo: { abertas: number; p1: number; vencidas: number; aguardando: number; sessoes: number; esperando: number; trabalhando: number };
  proximo?: { texto: string; prazo: string };          // tarefa aberta com prazo mais próximo
  externoEm: number | null;
}
interface FrenteDetalhe extends FrenteResumo {
  objetivo: string;                                     // 1º parágrafo de "## Objetivo" (ou do corpo), texto puro, ≤ 400 chars
  pastas: string[]; nota: string;                       // nota = caminho relativo (Projetos/<id>.md)
  todo: Tarefa[]; versao: string;
  compromissos: Array<{ id: string; titulo: string; assumido_por?: string; prazo?: string; status?: string; vencido: boolean }>;
  reunioes: Array<{ id: string; data: string; titulo: string }>;     // mais recentes primeiro, ≤ 8
  decisoes: Array<{ id: string; data: string; titulo: string }>;     // ≤ 8
  pessoas: Array<{ id: string; nome: string }>;
  externo: Externo;
}
// SessionMeta ganha:
frente: string;                                         // '' = Geral
sugestao?: { frente: string; motivo: string } | null;   // só em sessões da Geral
```

## API (todas com x-torre-token)

| Rota | Faz |
|---|---|
| `GET /api/sessions` | `{ sessions, home, principal }` (já existe) |
| `POST /api/sessions` `{cwd, name?, frente?}` | abre; com `frente`, a sessão já nasce nela. `cwd` vazio + `frente` = 1ª pasta da frente, senão `principal` |
| `POST /api/sessions/:id/frente` `{frente}` | move a sessão (`''` = Geral); limpa a sugestão; devolve a meta |
| `GET /api/frentes` | `{ frentes: FrenteResumo[] }` (ordem: status ativo primeiro, depois título) |
| `GET /api/frentes/:id` | `FrenteDetalhe` (404 se não existe) |
| `POST /api/frentes/:id/tarefa` `{acao, id?, texto?, quadrante?, prazo?}` | `acao` = `criar` (ganha `ctx: [[id]]`), `mover`, `concluir`, `reabrir`; grava pelo `executar('jarvis_tarefa')` (vai pro log.md) |
| `POST /api/frentes/:id/atualizar` | 202; busca Jira e Teams da frente em segundo plano (`claude -p`, só leitura) e guarda em `~/.torre/frentes/<id>.json` |
| `GET /api/pendencias` | `Pendencias` (tipos em `src/server/frentes.ts`): TODO inteiro com as frentes de cada tarefa, compromissos abertos (`meu`), agenda (+7 dias), recentes (−7 dias) e projetos |
| `POST /api/pendencias/tarefa` `{acao, id?, texto?, quadrante?, prazo?, ctx?}` | igual à tarefa da frente, mas para qualquer linha do TODO; `criar` aceita `ctx` |

Jira/Teams das frentes: uma busca por vez (fila), até 8 min cada.

## WebSocket

- `meta` (já existe) leva `frente` e `sugestao`.
- Novo `{ type: 'frentes', id: string }` — algo mudou na frente `id` (`'*'` = todas: TODO.md mudou no disco, checado a cada 5 s pelo mtime). A página refaz o GET do que está na tela.

## Página

- Abas no topo: **Visão geral** · **Geral** · uma por frente. Rota no hash: `#/visao`, `#/geral`, `#/frente/<id>` — duas abas do navegador, cada uma no foco dela.
- **Visão geral**: um cartão por frente (resumo, próximo prazo, sessões por status, clique abre a página) + cartão "Geral" com as sessões soltas.
- **Geral**: a grade de terminais sem frente; cada card com sugestão mostra o chip "Parece de <frente> · Mover" (e ✕ para manter na Geral).
- **Frente**: cabeçalho (título, status, objetivo, links da nota e do repo, "Nova sessão aqui"), kanban (P1, P2, P3, P4, Aguardando, Concluídas) com arrastar entre colunas e "+ tarefa", grade com os terminais da frente, e coluna com Jira, Teams (com "Atualizar" e "atualizado há…") e Contexto (compromissos, reuniões, decisões, pessoas).
- Um único `#grid` de terminais: cada card tem `data-frente`; a página mostra só os da aba atual (os xterm nunca são recriados ao trocar de aba). Menu do card: "Mover para…".
