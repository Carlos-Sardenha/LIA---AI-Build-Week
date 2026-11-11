#!/usr/bin/env node
// Guia do Jarvis — detecta se o guia (System/guia/guia.html, publicado como Artifact)
// está em dia com a estrutura que ele descreve, e diz ao Claude o que fazer no início
// da conversa. Node sem dependências.
//
// Uso:
//   node System/scripts/guia.mjs hook            # hook SessionStart (.claude/settings.json): lê o JSON do stdin, imprime additionalContext
//   node System/scripts/guia.mjs status          # humano: em dia? o que mudou? qual a URL?
//   node System/scripts/guia.mjs gravar --url <url>   # depois de publicar: grava URL + hashes atuais
//
// Estado (local, git-ignored): System/config/guia.json no checkout PRINCIPAL do vault
// (worktrees compartilham o mesmo artifact). Nunca guarda segredo — só URL e hashes.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const RAIZ = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());

// Arquivos que definem as features descritas no guia. Mudou algum → guia desatualizado.
const FONTES = [
  ['CLAUDE.md'],
  ['.mcp.json'],
  ['.claude/commands', /\.md$/],
  ['.claude/agents', /\.md$/],
  ['.claude/skills', /SKILL\.md$/],
  ['System/prompts', /\.md$/],
  ['System/config/ferramentas.md'],
  ['System/config/sources.yml'],
  ['System/schema/grafo.md'],
  ['.harness/mcp.mjs'],
  ['pipeline', /\.mjs$/],
  ['System/guia/guia.html'],
];

function raizPrincipal() {
  if (process.env.JARVIS_VAULT) return resolve(process.env.JARVIS_VAULT);
  try {
    const comum = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (comum) return dirname(comum);
  } catch { /* sem git: usa a raiz atual */ }
  return RAIZ;
}

const ESTADO = join(raizPrincipal(), 'System', 'config', 'guia.json');

function listar(dir, filtro) {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [dir];
  const saida = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) saida.push(...listar(rel, filtro));
    else if (!filtro || filtro.test(e.name)) saida.push(rel);
  }
  return saida;
}

function hashesAtuais() {
  const mapa = {};
  for (const [dir, filtro] of FONTES) {
    for (const rel of listar(dir, filtro)) {
      // CRLF/LF não conta como mudança (checkouts diferentes podem divergir).
      const txt = readFileSync(join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');
      mapa[rel.split(sep).join('/')] = createHash('sha256').update(txt).digest('hex').slice(0, 16);
    }
  }
  return Object.fromEntries(Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b)));
}

function lerEstado() {
  try { return JSON.parse(readFileSync(ESTADO, 'utf8')); } catch { return null; }
}

function diferencas(antigo = {}, novo) {
  const mud = [];
  for (const k of Object.keys(novo)) if (antigo[k] !== novo[k]) mud.push(antigo[k] ? `${k} (alterado)` : `${k} (novo)`);
  for (const k of Object.keys(antigo)) if (!(k in novo)) mud.push(`${k} (removido)`);
  return mud;
}

function situacao() {
  const est = lerEstado();
  const atuais = hashesAtuais();
  const mudou = est ? diferencas(est.arquivos, atuais) : [];
  return { est, atuais, mudou, url: est?.artifact_url || null, emDia: !!est?.artifact_url && mudou.length === 0 };
}

function lerStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

const PULAR = 'Se esta sessão foi disparada por uma rotina agendada (ritual, check-in, checkout, semanal) ou por outra sessão, ignore este aviso.';

function hook() {
  if (process.env.TORRE_SESSION) return; // sessão aberta pela Torre (torre/): o guia é ruído ali
  let entrada = {};
  try { entrada = JSON.parse(lerStdin().replace(/^﻿/, '').trim() || '{}'); } catch { /* entrada vazia */ }
  if (entrada.source && entrada.source !== 'startup') return; // só conversa nova
  if (!existsSync(join(RAIZ, 'System', 'guia', 'guia.html'))) return; // fora do vault Jarvis: silêncio

  const s = situacao();
  let ctx;
  if (!s.url) {
    ctx = `Guia do Jarvis: ainda não publicado nesta máquina. Na sua PRIMEIRA resposta desta conversa, antes de atender o pedido, execute a skill \`guia\` (modo atualizar): ela publica System/guia/guia.html como Artifact e grava a URL. Depois siga com o pedido do Mateus. ${PULAR}`;
  } else if (!s.emDia) {
    const lista = s.mudou.slice(0, 15).join('; ') + (s.mudou.length > 15 ? `; +${s.mudou.length - 15}` : '');
    ctx = `Guia do Jarvis DESATUALIZADO — mudaram desde a última publicação: ${lista}. Na sua PRIMEIRA resposta desta conversa, antes de atender o pedido, execute a skill \`guia\` (modo atualizar): reflita essas mudanças no JSON de System/guia/guia.html, republique no mesmo Artifact (${s.url}) e grave o estado. Avise em uma linha que o guia foi atualizado e siga com o pedido do Mateus. ${PULAR}`;
  } else {
    ctx = `Guia do Jarvis em dia: ${s.url}. Na sua PRIMEIRA resposta desta conversa, antes de qualquer outra coisa, chame a ferramenta Artifact com action "open" e url "${s.url}" (sem comentar a abertura) e siga com o pedido do Mateus. ${PULAR}`;
  }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }));
}

function status() {
  const s = situacao();
  console.log(`estado: ${relative(RAIZ, ESTADO) || ESTADO}`);
  console.log(`url: ${s.url || '(não publicado)'}`);
  if (s.est?.atualizado) console.log(`publicado em: ${s.est.atualizado}`);
  console.log(`arquivos monitorados: ${Object.keys(s.atuais).length}`);
  if (!s.url) console.log('situação: NÃO PUBLICADO');
  else if (s.emDia) console.log('situação: EM DIA');
  else { console.log(`situação: DESATUALIZADO (${s.mudou.length})`); for (const m of s.mudou) console.log(`  - ${m}`); }
}

function gravar(args) {
  const i = args.indexOf('--url');
  const url = i >= 0 ? args[i + 1] : lerEstado()?.artifact_url;
  if (!url || !/^https:\/\/claude\.ai\//.test(url)) {
    console.error('gravar: passe --url <link do Artifact em claude.ai>');
    process.exit(2);
  }
  const agora = new Date();
  const off = -agora.getTimezoneOffset();
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  const local = new Date(agora.getTime() + off * 60000).toISOString().slice(0, 19) + (off >= 0 ? '+' : '-') + pad(Math.trunc(off / 60)) + ':' + pad(off % 60);
  const estado = { artifact_url: url, atualizado: local, arquivos: hashesAtuais() };
  writeFileSync(ESTADO, JSON.stringify(estado, null, 2) + '\n', 'utf8');
  console.log(`gravado: ${ESTADO} (${Object.keys(estado.arquivos).length} arquivos)`);
}

const [modo, ...resto] = process.argv.slice(2);
try {
  if (modo === 'hook') hook();
  else if (modo === 'status') status();
  else if (modo === 'gravar') gravar(resto);
  else { console.error('uso: node System/scripts/guia.mjs hook | status | gravar --url <url>'); process.exit(2); }
} catch (e) {
  // Hook nunca pode travar a conversa: falha vira silêncio no modo hook.
  if (modo === 'hook') process.exit(0);
  console.error(`erro: ${e.message}`);
  process.exit(1);
}
