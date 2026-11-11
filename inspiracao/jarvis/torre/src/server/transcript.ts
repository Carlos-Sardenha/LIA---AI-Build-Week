import fs from 'node:fs';

export interface Usage {
  model: string | null;
  /** Tokens de entrada da última resposta: aproxima o contexto ocupado. */
  context: number;
  input: number;
  output: number;
  cacheRead: number;
}

export const emptyUsage = (): Usage => ({ model: null, context: 0, input: 0, output: 0, cacheRead: 0 });

/** Títulos gerados vêm às vezes como slug ("personal-finance-control"): vira frase. */
export function prettyTitle(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(t)) {
    const words = t.split('-').join(' ');
    return words[0].toUpperCase() + words.slice(1);
  }
  return t;
}

/** Pedido digitado pela pessoa (não os gerados por ferramentas ou skills), numa linha só. */
export function promptText(line: string): string {
  let d: any;
  try {
    d = JSON.parse(line);
  } catch {
    return '';
  }
  if (d?.type !== 'user' || (d.origin?.kind !== 'human' && d.promptSource !== 'typed')) return '';
  let content = d.message?.content;
  if (Array.isArray(content)) content = content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join(' ');
  if (typeof content !== 'string') return '';
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text || text.startsWith('<')) return '';
  return text.length > 160 ? text.slice(0, 159) + '…' : text;
}

/** Título que o Claude Code grava na transcrição: o de /rename vence o gerado. */
export function titleFromLine(line: string): { title: string; custom: boolean } | null {
  if (!line.includes('-title"')) return null;
  let d: any;
  try {
    d = JSON.parse(line);
  } catch {
    return null;
  }
  if (d?.type === 'custom-title') {
    const t = d.customTitle ?? d.title;
    return typeof t === 'string' && t.trim() ? { title: prettyTitle(t), custom: true } : null;
  }
  if (d?.type === 'ai-title' && typeof d.aiTitle === 'string' && d.aiTitle.trim()) {
    return { title: prettyTitle(d.aiTitle), custom: false };
  }
  return null;
}

/**
 * Lê a transcrição JSONL de uma sessão de forma incremental (só os bytes novos)
 * e acumula modelo, tokens e título. Uma mesma resposta pode vir em várias linhas com
 * o mesmo message.id, então deduplica por id.
 */
export class TranscriptReader {
  usage: Usage = emptyUsage();
  private aiTitle: string | null = null;
  private customTitle: string | null = null;

  private offset = 0;
  private partial = '';
  private seen = new Set<string>();

  /** Primeiro pedido digitado: serve de título enquanto o Claude não gera um. */
  firstPrompt: string | null = null;

  get title(): string | null {
    return this.customTitle ?? this.aiTitle;
  }

  constructor(readonly file: string) {}

  poll(): boolean {
    let size: number;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return false;
    }
    if (size < this.offset) {
      this.offset = 0;
      this.partial = '';
      this.seen.clear();
      this.usage = emptyUsage();
      this.aiTitle = this.customTitle = this.firstPrompt = null;
    }
    if (size === this.offset) return false;

    // No Windows o Claude Code pode estar escrevendo no arquivo agora: leitura que falha
    // (arquivo preso por um instante) fica para a próxima volta, sem derrubar o servidor.
    let buf: Buffer;
    try {
      const fd = fs.openSync(this.file, 'r');
      try {
        buf = Buffer.alloc(size - this.offset);
        fs.readSync(fd, buf, 0, buf.length, this.offset);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return false;
    }
    this.offset = size;

    // Linhas do Windows podem vir com \r no fim: o JSON.parse aceita, o split só tira o \n.
    const lines = (this.partial + buf.toString('utf8')).split('\n');
    this.partial = lines.pop() ?? '';
    let changed = false;
    for (const line of lines) {
      const title = titleFromLine(line);
      if (title) {
        if (title.custom) this.customTitle = title.title;
        else this.aiTitle = title.title;
        changed = true;
        continue;
      }
      if (!this.firstPrompt && (line.includes('"human"') || line.includes('"typed"'))) {
        const prompt = promptText(line);
        if (prompt) {
          this.firstPrompt = prompt;
          changed = true;
          continue;
        }
      }
      if (!line.includes('"usage"')) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = entry?.message;
      const u = msg?.usage;
      if (entry?.type !== 'assistant' || !u || !msg.id || this.seen.has(msg.id)) continue;
      if (msg.model === '<synthetic>') continue;
      this.seen.add(msg.id);
      const fresh = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      const cached = u.cache_read_input_tokens ?? 0;
      this.usage.model = msg.model ?? this.usage.model;
      this.usage.context = fresh + cached;
      this.usage.input += fresh + cached;
      this.usage.cacheRead += cached;
      this.usage.output += u.output_tokens ?? 0;
      changed = true;
    }
    return changed;
  }
}
