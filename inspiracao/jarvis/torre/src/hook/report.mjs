// Chamado pelos hooks do Claude Code nas sessões abertas pela Torre.
// Lê o JSON do evento no stdin e repassa ao servidor. Nunca bloqueia a sessão:
// qualquer falha sai com código 0 e em no máximo 1,5 s.
const event = process.argv[2] ?? 'unknown';
const { TORRE_URL, TORRE_TOKEN, TORRE_SESSION } = process.env;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', async () => {
  if (!TORRE_URL || !TORRE_SESSION) return;
  let payload = {};
  try {
    // Alguns shells do Windows prefixam o BOM do UTF-8.
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {}
  try {
    await fetch(`${TORRE_URL}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-torre-token': TORRE_TOKEN ?? '' },
      body: JSON.stringify({ session: TORRE_SESSION, event, payload }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {}
});
