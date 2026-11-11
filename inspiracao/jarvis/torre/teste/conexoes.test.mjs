// Casos das regras de conexão: node teste/conexoes.test.mjs
import { acharExecutavel, linhaPath, montarExecucao, opPelaTorre, statusDoConector } from '../src/hook/conexoes-regras.mjs';
import { parada } from '../src/hook/conexoes.mjs';

const pelaTorre = [
  ['whoami'],
  ['item', 'get', 'wehandle-ro', '--vault', 'wehandle', '--format', 'json'],
  ['item', 'get', 'airflow-wehandle', '--vault=wehandle', '--fields', 'password', '--reveal'],
  ['item', 'list', '--vault', 'wehandle'],
  ['read', 'op://wehandle/wehandle-cliente-x-hmac/password'],
];
const pelaDigital = [
  ['item', 'get', 'wehandle-PROD', '--vault', 'wehandle', '--format', 'json'],
  ['read', 'op://wehandle/wehandle-PROD/password'],
  ['item', 'get', 'wehandle-ro'],
  ['item', 'get', 'x', '--vault', 'Personal'],
  ['item', 'get', 'wehandle-cliente-y-hmac', '--vault', 'wehandle-entregas'],
  ['read', 'op://wehandle-entregas/x/y'],
  ['item', 'edit', 'airflow-wehandle', '--vault', 'wehandle', 'password=x'],
  ['signin'],
  ['vault', 'list'],
];

const caido = { op: { ok: false }, gcloud: { ok: false }, gh: { ok: false }, vpn: { ok: false }, 'mcp:Datalake': { ok: false }, 'mcp:Microsoft 365': { ok: false }, 'mcp:Metabase': { ok: true } };
const pausa = [
  ['Bash', { command: 'op item get wehandle-ro --vault wehandle --format json | jq .' }, 'op'],
  ['Bash', { command: 'TOKEN=$(op read op://wehandle/airflow-wehandle/password)' }, 'op'],
  ['Bash', { command: 'bq query --max_rows=1000 "SELECT 1"' }, 'gcloud'],
  ['Bash', { command: 'gcloud auth list' }, 'gcloud'],
  ['Bash', { command: 'cd repo && dbt build -s x' }, 'gcloud'],
  ['Bash', { command: 'gh pr list --repo WeHandle/dbt-analytics' }, 'gh'],
  ['mcp__claude_ai_Datalake__execute_sql', {}, 'mcp:Datalake'],
  ['mcp__claude_ai_Datalake__authenticate', {}, 'mcp:Datalake'],
  ['mcp__claude_ai_Microsoft_365__chat_message_search', {}, 'mcp:Microsoft 365'],
  ['Bash', { command: 'curl -s https://airflow.internal.wehandle.com.br/api/v2/version' }, 'vpn'],
  ['Bash', { command: 'psql -X -c "select 1"' }, 'vpn'],
  ['Bash', { command: 'eval "$(op item get wehandle-ro --vault wehandle --format json | python3 x.py)" && psql -c "select 1"' }, 'vpn'],
  ['Bash', { command: 'nc -z -G 3 replica.abc123.sa-east-1.rds.amazonaws.com 5432' }, 'vpn'],
  // Windows: PowerShell e executáveis com extensão/caminho.
  ['PowerShell', { command: 'op item get wehandle-ro --vault wehandle --format json | ConvertFrom-Json' }, 'op'],
  ['PowerShell', { command: 'op.exe read op://wehandle/airflow-wehandle/password' }, 'op'],
  ['PowerShell', { command: '$t = $(op read op://wehandle/airflow-wehandle/password)' }, 'op'],
  ['PowerShell', { command: '& "C:\\Program Files\\1Password CLI\\op.exe" item list --vault wehandle' }, 'op'],
  ['PowerShell', { command: 'gh.exe pr list --repo WeHandle/dbt-analytics' }, 'gh'],
  ['PowerShell', { command: 'gh pr view 12' }, 'gh'],
  ['PowerShell', { command: 'gcloud.cmd auth list' }, 'gcloud'],
  ['PowerShell', { command: '& "C:\\Users\\x\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\bq.cmd" query "SELECT 1"' }, 'gcloud'],
  ['PowerShell', { command: 'Set-Location repo; dbt run -s x' }, 'gcloud'],
  ['PowerShell', { command: 'psql.exe -X -c "select 1"' }, 'vpn'],
  ['PowerShell', { command: '$env:PGPASSWORD = "x"; psql -h replica -c "select 1"' }, 'vpn'],
  ['PowerShell', { command: 'C:\\PostgreSQL\\16\\bin\\pg_dump.exe -h replica db' }, 'vpn'],
  ['PowerShell', { command: 'Invoke-WebRequest https://airflow.internal.wehandle.com.br/api/v2/version' }, 'vpn'],
  ['PowerShell', { command: 'if ($true) { psql -c "select 1" }' }, 'vpn'],
  ['Bash', { command: '/c/Program\\ Files/x/gh.exe pr list' }, 'gh'],
];
const segue = [
  ['Bash', { command: 'op item get wehandle-PROD --vault wehandle --format json' }],
  ['Bash', { command: 'ls ~/.config/gcloud && echo ok' }],
  ['Bash', { command: 'npm run build' }],
  ['Bash', { command: 'cat dbt_project.yml' }],
  ['mcp__claude_ai_Metabase__execute_sql', {}],
  ['mcp__claude_ai_Canva__help', {}],
  ['Read', { file_path: '/tmp/x' }],
  ['Bash', { command: 'grep -rn psql docs/' }],
  ['Bash', { command: 'cat ~/WeHandle/torre/ESTADO.md' }],
  // Windows: nada de CLI na posição de comando.
  ['PowerShell', { command: 'op.exe item get wehandle-PROD --vault wehandle' }],
  ['PowerShell', { command: 'Get-ChildItem $env:APPDATA\\gcloud; Write-Output ok' }],
  ['PowerShell', { command: 'Select-String -Path docs\\*.md -Pattern psql' }],
  ['PowerShell', { command: 'Get-Content C:\\x\\ghost.txt' }],
  ['PowerShell', { command: 'npm run build' }],
  ['PowerShell', { command: 'node .harness/consulta.mjs "op item get"' }],
];

let falhas = 0;
let total = 0;
const confere = (ok, desc) => {
  total++;
  if (!ok) {
    falhas++;
    console.log('FALHOU', desc);
  }
};
for (const a of pelaTorre) confere(opPelaTorre(a), `pela Torre: op ${a.join(' ')}`);
for (const a of pelaDigital) confere(!opPelaTorre(a), `pela digital: op ${a.join(' ')}`);
for (const [t, i, c] of pausa) confere(parada(t, i, caido) === c, `pausa ${t} ${JSON.stringify(i)} → ${c} (veio ${parada(t, i, caido) || 'nada'})`);
for (const [t, i] of segue) confere(parada(t, i, caido) === '', `segue ${t} ${JSON.stringify(i)} (veio ${parada(t, i, caido)})`);
// Conexão conectada ou ainda não checada nunca pausa.
const tudoOk = Object.fromEntries(Object.keys(caido).map((k) => [k, { ok: true }]));
for (const [t, i] of pausa) confere(parada(t, i, tudoOk) === '', `com tudo conectado segue ${t}`);
for (const [t, i] of pausa) confere(parada(t, i, {}) === '', `sem estado segue ${t}`);

// Comando que depende de duas conexões para na que caiu, qualquer que seja.
const opEPsql = ['Bash', { command: 'op item get wehandle-ro --vault wehandle --format json && psql -c "select 1"' }];
const so = (id) => ({ ...tudoOk, [id]: { ok: false } });
const duplas = [[so('vpn'), 'vpn'], [so('op'), 'op'], [tudoOk, '']];
for (const [estado, esperado] of duplas) confere(parada(...opEPsql, estado) === esperado, `op + psql com ${esperado || 'tudo ok'} → ${esperado || 'segue'} (veio ${parada(...opEPsql, estado) || 'nada'})`);

// CLI não instalada: a Torre não põe no estado (ou fica ok null) e nada pausa.
const semClis = { 'mcp:Datalake': { ok: true } };
const comNull = { op: { ok: null }, gcloud: { ok: null }, gh: { ok: null }, 'mcp:Datalake': { ok: true } };
for (const [t, i] of pausa.filter(([, , c]) => ['op', 'gcloud', 'gh'].includes(c))) {
  confere(parada(t, i, semClis) === '', `CLI ausente segue ${t} ${JSON.stringify(i)}`);
  confere(parada(t, i, comNull) === '', `CLI ok null segue ${t} ${JSON.stringify(i)}`);
}

// Achar executável no PATH (puro: o "disco" é um Set).
const disco = (lista) => {
  const s = new Set(lista.map((f) => f.toLowerCase()));
  return (f) => s.has(f.toLowerCase());
};
const envWin = { Path: 'C:\\torre\\src\\bin;C:\\Program Files\\GitHub CLI;C:\\sdk\\bin;"C:\\Users\\Mateus Falcão\\.local\\bin"', PATHEXT: '.COM;.EXE;.BAT;.CMD' };
const discoWin = disco(['C:\\torre\\src\\bin\\op.cmd', 'C:\\torre\\src\\bin\\op', 'C:\\Program Files\\GitHub CLI\\gh.exe', 'C:\\sdk\\bin\\gcloud.cmd', 'C:\\sdk\\bin\\gcloud', 'C:\\Users\\Mateus Falcão\\.local\\bin\\claude.exe']);
const achaWin = (nome, extra = {}) => acharExecutavel(nome, { env: envWin, platform: 'win32', existe: discoWin, ...extra });
confere(achaWin('gh') === 'C:\\Program Files\\GitHub CLI\\gh.exe', `win: acha gh.exe (veio ${achaWin('gh')})`);
confere(achaWin('gcloud') === 'C:\\sdk\\bin\\gcloud.cmd', `win: acha gcloud.cmd, não o gcloud sem extensão (veio ${achaWin('gcloud')})`);
confere(achaWin('claude') === 'C:\\Users\\Mateus Falcão\\.local\\bin\\claude.exe', `win: PATH com aspas e acento (veio ${achaWin('claude')})`);
confere(achaWin('op') === 'C:\\torre\\src\\bin\\op.cmd', 'win: sem ignorar, o op.cmd da Torre aparece');
confere(achaWin('op', { ignorar: ['C:\\TORRE\\src\\bin\\'] }) === '', 'win: ignorando a src/bin da Torre, op não está instalado');
confere(achaWin('psql') === '', 'win: psql ausente → ""');
confere(achaWin('C:\\Program Files\\GitHub CLI\\gh') === 'C:\\Program Files\\GitHub CLI\\gh.exe', 'win: caminho sem extensão ganha .exe');
confere(achaWin('C:\\sdk\\bin\\gcloud.cmd') === 'C:\\sdk\\bin\\gcloud.cmd', 'win: caminho com extensão');
const achaMac = (nome) => acharExecutavel(nome, { env: { PATH: '/opt/homebrew/bin:/usr/bin' }, platform: 'darwin', existe: disco(['/opt/homebrew/bin/op', '/usr/bin/open']) });
confere(achaMac('op') === '/opt/homebrew/bin/op', 'mac: acha op');
confere(achaMac('gh') === '', 'mac: gh ausente → ""');

// .cmd no Windows vai pelo cmd.exe com tudo escapado; .exe e outros sistemas, direto.
const exe = montarExecucao('C:\\x\\op.exe', ['read', 'op://wehandle/a b'], { platform: 'win32' });
confere(exe.arquivo === 'C:\\x\\op.exe' && !exe.verbatim && exe.args[1] === 'op://wehandle/a b', 'win: .exe roda direto');
const cmd = montarExecucao('C:\\sdk\\bin\\gcloud.cmd', ['auth', 'x&calc', '50%', 'a"b'], { platform: 'win32', comspec: 'C:\\Windows\\system32\\cmd.exe' });
confere(cmd.arquivo === 'C:\\Windows\\system32\\cmd.exe' && cmd.verbatim, 'win: .cmd vai pelo cmd.exe');
confere(cmd.args.slice(0, 3).join(' ') === '/d /s /c', 'win: cmd.exe /d /s /c');
confere(cmd.args[3] === '"C:\\sdk\\bin\\gcloud.cmd ^"auth^" ^"x^&calc^" ^"50^%^" ^"a\\^"b^""', `win: escape do cmd (veio ${cmd.args[3]})`);
const mac = montarExecucao('/usr/local/bin/gcloud.cmd', ['a'], { platform: 'darwin' });
confere(mac.arquivo === '/usr/local/bin/gcloud.cmd' && !mac.verbatim, 'mac: nunca passa pelo cmd.exe');

// `claude mcp list`: \r\n, √ do Windows, ✔ do macOS, ✗ e Needs authentication.
const lista = [
  'Checking MCP server health…',
  '',
  'claude.ai Datalake: https://bigquery.googleapis.com/mcp - ! Needs authentication',
  'claude.ai Metabase: https://mb.example.com/api/mcp - √ Connected',
  'claude.ai Github: https://api.githubcopilot.com/mcp - ✔ Connected',
  'claude.ai ClickUp: https://mcp.clickup.com/mcp - ✓ Connected',
  'claude.ai Atlassian: https://mcp.atlassian.com/v1/mcp - ✗ Failed to connect',
  '\x1b[32mclaude.ai Microsoft 365: https://microsoft365.mcp.claude.com/mcp - √ Connected\x1b[0m',
  'jarvis: node .harness/mcp.mjs - √ Connected',
].join('\r\n');
const st = (n) => statusDoConector(lista, n);
confere(st('Datalake').ok === false && /pede login/.test(st('Datalake').detalhe), 'mcp: Needs authentication → pede login');
confere(st('Metabase').ok === true, 'mcp: √ Connected (Windows)');
confere(st('Github').ok === true, 'mcp: ✔ Connected (macOS)');
confere(st('ClickUp').ok === true, 'mcp: ✓ Connected');
confere(st('Atlassian').ok === false && st('Atlassian').detalhe === 'Failed to connect', `mcp: ✗ Failed (veio ${st('Atlassian').detalhe})`);
confere(st('Microsoft 365').ok === true, 'mcp: com cores ANSI e espaço no nome');
confere(st('Notion').ok === false && /não aparece/.test(st('Notion').detalhe), 'mcp: ausente da conta');

// Linha do CLAUDE_ENV_FILE.
confere(linhaPath('/Users/x/torre/src/bin', 'darwin') === 'export PATH="/Users/x/torre/src/bin:$PATH"\n', 'env: mac');
const lw = linhaPath('C:\\Users\\MateusFalcão\\OneDrive - wehandle\\torre\\src\\bin', 'win32');
confere(lw === 'export PATH="/c/Users/MateusFalcão/OneDrive - wehandle/torre/src/bin:$PATH"\n', `env: windows vira /c/… (veio ${lw})`);

console.log(`${total - falhas}/${total} casos certos`);
process.exit(falhas ? 1 : 0);
