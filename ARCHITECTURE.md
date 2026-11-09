# Arquitetura

> Primeira versão, antes da stack. O agente `fundador` completa com as pastas reais e o lint que confere as camadas.

## Domínios

| Domínio | Responsabilidade |
|---|---|
| `exames` | Recebe PDF ou foto, guarda o original no repositório bruto e extrai cada resultado com a faixa de referência do laudo |
| `wearables` | Importa leituras de relógio e anel (batimento, oxigenação, sono, atividade) |
| `linha-do-tempo` | Liga exames, consultas, remédios, vacinas e leituras por data, tipo, sintoma e condição |
| `alertas` | Detecta sinal fora do normal (ex.: ritmo irregular) e sugere procurar um médico |
| `perguntas` | Responde em linguagem natural usando o brain como contexto, sempre citando a fonte |
| `compartilhamento` | Consentimento da pessoa e a visão do médico |

## Camadas (dentro de cada domínio)

```
types → config → repo → service → runtime → ui
```

Cada camada só depende das que vêm **antes** dela. A `ui` não fala com o `repo` direto; o `service` não sabe que existe tela.

## Providers (assuntos transversais)

Entram por uma interface única em `providers/`, nunca importados direto no domínio:

- **ia**: modelo de linguagem (extração de laudo e perguntas)
- **armazenamento**: repositório bruto (arquivos originais) e notas estruturadas
- **consentimento**: quem pode ver o quê

## Modelo do brain

- **Bruto:** o arquivo original, nunca alterado.
- **Nota:** um registro estruturado (ex.: `.md` com frontmatter) por exame, consulta ou janela de leituras, com o link para o bruto.
- **Ligações:** tags e índices por data, tipo de exame, médico, sintoma e condição. A linha do tempo é a visão ordenada dessas ligações.
