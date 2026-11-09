# Agentes do repositório

Os agentes ficam em `.claude/agents/` e seguem o artigo [Harness engineering](https://openai.com/pt-BR/index/harness-engineering/): **humano dirige, agente executa**.

| Agente | Papel | Quando |
|---|---|---|
| `fundador` | Estrutura, CI, lint de camadas, comandos no `AGENTS.md` | Uma vez, ao escolher a stack |
| `executor` | Implementa a tarefa e abre o PR | A cada tarefa |
| `auto-revisor` | Revisa o próprio diff (não edita) | Depois de implementar |
| `revisor` | Revisa o PR com um foco (correção, arquitetura, segurança, testes, performance) | Vários em paralelo |
| `loop-de-revisao` | Revisão → correção → CI até aprovar ou parar de progredir; mescla | Com o PR aberto |
| `jardineiro-de-docs` | Corrige doc que não bate com o código | Rotina |
| `coletor-de-lixo` | Faxina de padrões ruins e dívida técnica | Rotina |
| `ponta-a-ponta` | Reproduz, corrige, prova, PR e merge com um comando | Com o repo maduro |

## Fluxo de uma tarefa

```
executor → auto-revisor → loop-de-revisao (chama os revisores) → merge
```

Exemplo de pedido: _"usa o executor pra fazer a extração de PDF do domínio exames, depois leva o PR até o fim com o loop-de-revisao"_.

## Quando o agente errar

Não corrija o código na mão. Pergunte o que faltou (doc, ferramenta, regra) e peça para o agente escrever essa melhoria no repo.

## Segurança neste repo

Repositório **público** com tema de saúde: o `revisor` com foco em **segurança** roda em todo PR que mexe em upload, armazenamento, consentimento ou chamada de IA.
