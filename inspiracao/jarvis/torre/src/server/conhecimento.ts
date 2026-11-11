import fs from 'node:fs';
import path from 'node:path';

/**
 * 5 min de conhecimento: a pílula diária que o /conhecimento (e o ritual) grava em
 * `System/conhecimento/AAAA-MM-DD.json` no vault. Aqui só se lê a mais recente e, a pedido,
 * se gera a nota `Aprender/pilulas/AAAA-MM-DD.md` a partir dela (sem modelo, sem rede).
 */
export interface ItemConhecimento {
  id?: string;
  tipo: string;
  titulo: string;
  resumo?: string;
  porque?: string;
  como_usar?: string;
  frentes?: string[];
  link?: string;
  autor?: string;
  quando?: string;
  minutos_video?: number;
  lido?: boolean;
  teams?: string;
}
export interface Pilula { data: string; geradoEm?: string; destaque?: string; minutos?: number; itens: ItemConhecimento[] }

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export class Conhecimento {
  constructor(private readonly root: string) {}

  private get pasta(): string {
    return path.join(this.root, 'System', 'conhecimento');
  }

  private nota(data: string): string {
    return path.join(this.root, 'Aprender', 'pilulas', `${data}.md`);
  }

  /** A pílula mais recente (ou a do dia pedido), com o caminho da nota se ela já existe. */
  ler(data?: string): { pilula: Pilula | null; nota: string | null } {
    let arquivo = '';
    if (data && DATA_RE.test(data)) arquivo = path.join(this.pasta, `${data}.json`);
    else {
      let nomes: string[] = [];
      try {
        nomes = fs.readdirSync(this.pasta).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
      } catch {}
      if (nomes.length) arquivo = path.join(this.pasta, nomes[nomes.length - 1]);
    }
    if (!arquivo) return { pilula: null, nota: null };
    try {
      const pilula = JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '')) as Pilula;
      if (!pilula || !Array.isArray(pilula.itens) || !DATA_RE.test(String(pilula.data))) return { pilula: null, nota: null };
      const nota = this.nota(pilula.data);
      return { pilula, nota: fs.existsSync(nota) ? path.relative(this.root, nota).replace(/\\/g, '/') : null };
    } catch {
      return { pilula: null, nota: null };
    }
  }

  /** Gera a nota da pílula no vault. Nota existente não é sobrescrita (o Mateus pode ter editado). */
  salvarNota(data?: string): { nota: string; criada: boolean } {
    const { pilula, nota } = this.ler(data);
    if (!pilula) throw new Error('nenhuma pílula para salvar: rode /conhecimento antes');
    if (nota) return { nota, criada: false };
    const ts = agora();
    const frentes = [...new Set(pilula.itens.flatMap((i) => i.frentes ?? []))];
    const doMarcelo = pilula.itens.some((i) => i.tipo === 'marcelo');
    const relacionados = [...frentes, ...(doMarcelo ? ['marcelo-mendes'] : [])].map((f) => `"[[${f}]]"`).join(', ');
    const linhas = [
      '---',
      `created: ${ts}`,
      `updated: ${ts}`,
      'type: nota',
      `source: ${doMarcelo ? 'teams' : 'manual'}`,
      'tags: [conhecimento, agentes-ia]',
      `relacionados: [${relacionados}]`,
      '---',
      '',
      `# 5 min de conhecimento — ${pilula.data}`,
      '',
      pilula.destaque ? `**Destaque:** ${limpar(pilula.destaque)}` : '',
      '',
    ];
    for (const i of pilula.itens) {
      linhas.push(`## ${i.link ? `[${limpar(i.titulo)}](${i.link})` : limpar(i.titulo)}`);
      const meta = [rotuloTipo(i.tipo), i.autor, i.quando, i.minutos_video ? `${i.minutos_video} min` : ''].filter(Boolean).join(' · ');
      if (meta) linhas.push(`_${limpar(meta)}_`, '');
      if (i.resumo) linhas.push(limpar(i.resumo), '');
      if (i.porque) linhas.push(`**Por que importa:** ${limpar(i.porque)}`, '');
      if (i.como_usar) linhas.push(`**Como usar:** ${limpar(i.como_usar)}`, '');
      if (i.frentes?.length) linhas.push(`Frentes: ${i.frentes.map((f) => `[[${f}]]`).join(', ')}`, '');
    }
    linhas.push(`Origem: System/conhecimento/${pilula.data}.json${doMarcelo ? ' · posts de [[marcelo-mendes]] na comunidade Tecnologia e Produto (Teams)' : ''}`, '');
    const destino = this.nota(pilula.data);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, linhas.join('\n'), 'utf8');
    const rel = path.relative(this.root, destino).replace(/\\/g, '/');
    registrar(this.root, ts, `conhecimento | nota da pílula ${pilula.data}`, [`[[${pilula.data}]] em ${rel} (pelo Jarvis no localhost)`]);
    return { nota: rel, criada: true };
  }
}

function rotuloTipo(t: string): string {
  return ({ marcelo: 'via Marcelo Mendes', noticia: 'notícia', video: 'vídeo', repo: 'repositório' } as Record<string, string>)[t] ?? t;
}

function limpar(s: unknown): string {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

/** ISO no fuso de São Paulo, como o resto do vault. */
function agora(d = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour') === '24' ? '00' : v('hour')}:${v('minute')}:${v('second')}-03:00`;
}

function registrar(root: string, ts: string, titulo: string, itens: string[]): void {
  const log = path.join(root, 'log.md');
  if (!fs.existsSync(log)) return;
  const bloco = `\n## [${ts.slice(0, 10)} ${ts.slice(11, 16)}] ${titulo}\n${itens.map((i) => `- ${i}`).join('\n')}\n`;
  fs.appendFileSync(log, bloco, 'utf8');
}
