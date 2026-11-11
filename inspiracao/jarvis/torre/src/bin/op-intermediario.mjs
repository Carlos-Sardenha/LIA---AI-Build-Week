// `op` das sessões da Torre (chamado por src/bin/op no macOS/Linux/Git Bash e por
// src/bin/op.cmd no PowerShell/cmd). Leitura no cofre wehandle sai pelo login que a
// Torre mantém (uma digital para todas as sessões); o resto vai para o `op` de
// verdade, que pede a digital aqui mesmo, como antes. Com o login da Torre caído,
// não pede digital: avisa que a sessão deve parar e esperar a Torre reconectar.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acharExecutavel, montarExecucao, opPelaTorre } from '../hook/conexoes-regras.mjs';

const args = process.argv.slice(2);
const { TORRE_URL, TORRE_TOKEN, TORRE_SESSION, TORRE_OP_REAL } = process.env;
const BIN = path.dirname(fileURLToPath(import.meta.url));

await main();

async function main() {
  if (!TORRE_URL || !opPelaTorre(args)) return direto();
  let res;
  try {
    const r = await fetch(`${TORRE_URL}/api/op`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-torre-token': TORRE_TOKEN ?? '' },
      body: JSON.stringify({ args, session: TORRE_SESSION }),
      signal: AbortSignal.timeout(60_000),
    });
    res = await r.json();
  } catch {
    // Torre fora do ar: a sessão segue no caminho de antes.
    return direto();
  }
  if (res?.stdout) process.stdout.write(res.stdout);
  if (res?.stderr) process.stderr.write(res.stderr);
  // exitCode em vez de process.exit: no Windows a escrita num pipe é assíncrona e o
  // exit cortaria a saída.
  process.exitCode = typeof res?.code === 'number' ? res.code : 1;
}

/** O `op` de verdade: TORRE_OP_REAL, senão o primeiro `op` do PATH fora da src/bin da Torre. */
function opReal() {
  const fora = (f) => f && path.resolve(path.dirname(f)).toLowerCase() !== path.resolve(BIN).toLowerCase();
  if (TORRE_OP_REAL) {
    const f = acharExecutavel(TORRE_OP_REAL, { ignorar: [BIN] });
    if (fora(f)) return f;
  }
  const doPath = acharExecutavel('op', { ignorar: [BIN] });
  if (fora(doPath)) return doPath;
  if (process.platform === 'darwin') return '/opt/homebrew/bin/op';
  return '';
}

function direto() {
  const real = opReal();
  if (!real) {
    process.stderr.write('op: o 1Password CLI não está instalado nesta máquina (nem TORRE_OP_REAL aponta para ele).\n');
    process.exit(127);
  }
  const ex = montarExecucao(real, args);
  const r = spawnSync(ex.arquivo, ex.args, { stdio: 'inherit', windowsVerbatimArguments: ex.verbatim });
  process.exit(r.status ?? 1);
}
