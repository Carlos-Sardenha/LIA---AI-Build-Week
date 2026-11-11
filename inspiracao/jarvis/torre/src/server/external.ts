import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promptText, titleFromLine } from './transcript.js';

/** Uma sessão do Claude Code aberta fora da Torre (outra aba, outro app). */
export interface ExternalSession {
  pid: number;
  sessionId: string;
  cwd: string;
  status: string;
  startedAt: number;
  updatedAt: number;
  version: string;
  title: string;
  lastPrompt: string;
}

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
// Registro que cada `claude` interativo mantém de si mesmo: <pid>.json.
// É formato interno do Claude Code, então tudo aqui é lido com desconfiança.
const REGISTRY = path.join(CLAUDE_DIR, 'sessions');

export function listExternal(exclude: Set<string>): ExternalSession[] {
  const found: ExternalSession[] = [];
  for (const entry of readRegistry()) {
    if (exclude.has(entry.sessionId)) continue;
    found.push({ ...entry, ...readHeadline(entry.sessionId) });
  }
  return found.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Relê o registro na hora de agir: o pid a encerrar nunca vem da página. */
export function findExternal(sessionId: string): Omit<ExternalSession, 'title' | 'lastPrompt'> | undefined {
  return readRegistry().find((e) => e.sessionId === sessionId);
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Encerra o `claude` original e espera ele sair, para só um processo escrever na conversa.
 * No Windows o SIGTERM vira TerminateProcess (sai na hora, sem aviso); a espera continua
 * porque o arquivo da conversa pode ficar preso mais um instante. Processo de outro usuário
 * ou elevado dá EPERM: a Torre não tem como encerrar, e diz isso.
 */
export async function closeOriginal(pid: number, timeoutMs = 5000): Promise<void> {
  if (!isAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return;
    if (code === 'EPERM') throw new Error(`sem permissão para encerrar o terminal original (pid ${pid}): feche-o à mão e tente de novo`);
    throw err;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    if (!isAlive(pid)) {
      // Windows: o processo some antes de soltar os arquivos abertos.
      if (process.platform === 'win32') await new Promise((r) => setTimeout(r, 300));
      return;
    }
  }
  throw new Error(`o terminal original (pid ${pid}) não fechou a tempo`);
}

function readRegistry(): Array<Omit<ExternalSession, 'title' | 'lastPrompt'>> {
  let files: string[];
  try {
    files = fs.readdirSync(REGISTRY).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: Array<Omit<ExternalSession, 'title' | 'lastPrompt'>> = [];
  for (const file of files) {
    let d: any;
    try {
      d = JSON.parse(fs.readFileSync(path.join(REGISTRY, file), 'utf8'));
    } catch {
      continue;
    }
    const pid = Number(d?.pid);
    const sessionId = String(d?.sessionId ?? '');
    if (!pid || !/^[\w-]{8,}$/.test(sessionId) || typeof d.cwd !== 'string') continue;
    if (d.kind && d.kind !== 'interactive') continue;
    if (pid === process.pid || !isAlive(pid)) continue;
    out.push({
      pid,
      sessionId,
      cwd: d.cwd,
      status: String(d.status ?? 'desconhecido'),
      startedAt: Number(d.startedAt) || 0,
      updatedAt: Number(d.updatedAt) || Number(d.startedAt) || 0,
      version: String(d.version ?? ''),
    });
  }
  return out;
}

/** Sessão aberta sem nenhum pedido ainda não tem transcrição, e não há o que retomar. */
export function hasTranscript(sessionId: string): boolean {
  return findTranscript(sessionId) !== undefined;
}

export function findTranscript(sessionId: string): string | undefined {
  const projects = path.join(CLAUDE_DIR, 'projects');
  let dirs: string[];
  try {
    dirs = fs.readdirSync(projects);
  } catch {
    return undefined;
  }
  for (const dir of dirs) {
    const file = path.join(projects, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  return undefined;
}

/**
 * Título da conversa e último pedido digitado, para a pessoa reconhecer a
 * sessão na lista. Lê do fim para o começo em janelas crescentes: sessões
 * longas têm dezenas de MB e os dois costumam estar perto do fim.
 */
function readHeadline(sessionId: string): { title: string; lastPrompt: string } {
  const result = { title: '', lastPrompt: '' };
  const file = findTranscript(sessionId);
  if (!file) return result;
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return result;
  }
  let custom = '';
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return result;
  }
  try {
    for (const window of [1, 4, 16, 64].map((mb) => mb * 1024 * 1024)) {
      const len = Math.min(size, window);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const t = titleFromLine(line);
        if (t?.custom && !custom) custom = t.title;
        else if (t && !result.title) result.title = t.title;
        if (!result.lastPrompt && (line.includes('"human"') || line.includes('"typed"'))) {
          result.lastPrompt = promptText(line);
        }
        if ((custom || result.title) && result.lastPrompt) break;
      }
      if (((custom || result.title) && result.lastPrompt) || len === size) break;
    }
  } catch {
    // Arquivo preso ou truncado no meio da leitura: mostra o que deu para ler.
  } finally {
    fs.closeSync(fd);
  }
  if (custom) result.title = custom;
  return result;
}
