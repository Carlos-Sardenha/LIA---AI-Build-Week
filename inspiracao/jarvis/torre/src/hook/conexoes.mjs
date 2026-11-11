// Hook de conexões, em todas as sessões abertas pela Torre.
//
// SessionStart: põe o `op` intermediário da Torre à frente no PATH dos comandos da
// sessão (pelo CLAUDE_ENV_FILE, que vem depois do perfil do shell: o path_helper do
// macOS joga o Homebrew para a frente e o `op` de verdade ganharia). No Windows o
// servidor já põe a src/bin à frente do PATH herdado pelo PowerShell; a linha no
// CLAUDE_ENV_FILE vale para o Git Bash, quando houver, com o caminho em /c/….
//
// PreToolUse: se a ferramenta (Bash, PowerShell ou conector) depende de uma conexão
// que caiu, nega com o pedido de parar e avisa a Torre, que marca o card como
// "aguardando conexão" e retoma a sessão quando a conexão voltar. Decide pelo arquivo
// de estado, sem esperar rede; qualquer falha libera (quem decide então é o Claude
// Code, como sempre).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { conexoesDaFerramenta, linhaPath } from './conexoes-regras.mjs';

const { TORRE_URL, TORRE_TOKEN, TORRE_SESSION, TORRE_BIN, TORRE_CONEXOES } = process.env;
const event = process.argv[2] ?? '';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', async () => {
    try {
      if (event === 'SessionStart') prefixarPath();
      if (event === 'PreToolUse') await porta(JSON.parse(semBom(raw)));
      if (event === 'PostToolUse') await achouSoLogin(JSON.parse(semBom(raw)));
    } catch {}
  });
}

function semBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function prefixarPath() {
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile || !TORRE_BIN) return;
  try {
    // UTF-8 sem BOM: o caminho do Mateus tem "ã".
    fs.appendFileSync(envFile, Buffer.from(linhaPath(TORRE_BIN), 'utf8'));
  } catch {}
}

async function porta(ev) {
  const estado = lerEstado();
  const conexao = parada(String(ev.tool_name ?? ''), ev.tool_input ?? {}, estado);
  if (!conexao) return;
  const nome = estado[conexao]?.nome ?? conexao;
  const saida = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Torre: a conexão ${nome} caiu. Pare aqui, sem pedir login e sem contornar por outro caminho. Termine a resposta com uma linha dizendo o que ficou parado; a Torre retoma esta sessão quando ${nome} voltar.`,
    },
  });
  // Bytes UTF-8 sem BOM, independente da página de código do console do Windows.
  process.stdout.write(Buffer.from(saida, 'utf8'));
  await avisar(conexao, ev.tool_name);
}

/**
 * Conector caído só expõe o authenticate: a sessão costuma parar ao ver isso no
 * ToolSearch, sem chamar nada. Marca a sessão do mesmo jeito, para a Torre retomar.
 */
async function achouSoLogin(ev) {
  if (ev.tool_name !== 'ToolSearch') return;
  const estado = lerEstado();
  const achados = JSON.stringify(ev.tool_response ?? '').matchAll(/mcp__claude_ai_(\w+?)__authenticate\b/g);
  for (const [, nome] of achados) {
    const conexao = parada(`mcp__claude_ai_${nome}__authenticate`, {}, estado);
    if (conexao) await avisar(conexao, 'ToolSearch');
  }
}

async function avisar(conexao, ferramenta) {
  if (!TORRE_URL) return;
  try {
    await fetch(`${TORRE_URL}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-torre-token': TORRE_TOKEN ?? '' },
      body: JSON.stringify({ session: TORRE_SESSION, event: 'Aguardando', payload: { conexao, ferramenta } }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {}
}

/** Id da conexão caída de que a ferramenta precisa, ou ''. Só para quem está sabidamente fora (ok === false). */
export function parada(tool, input, estado) {
  const conectores = Object.keys(estado).filter((k) => k.startsWith('mcp:')).map((k) => k.slice(4));
  // Vale também para o authenticate do conector: o login fica com a Torre.
  // CLI não instalada não está no estado (ou tem ok null): nunca pausa.
  return conexoesDaFerramenta(tool, input, conectores).find((c) => estado[c]?.ok === false) ?? '';
}

function lerEstado() {
  try {
    return JSON.parse(semBom(fs.readFileSync(TORRE_CONEXOES ?? '', 'utf8')));
  } catch {
    return {};
  }
}
