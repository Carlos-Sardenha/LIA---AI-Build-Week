import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { devida, diaLocal, expandirHome } from './rotinas-regras.mjs';
import type { SessionManager } from './sessions.js';

/** Uma rotina de `rotinas.json`: abre uma sessão com um pedido no dia e na hora marcados. */
export interface Rotina {
  id: string;
  /** Título do card da sessão. `{data}` vira a data do dia (DD/MM). */
  nome: string;
  /** 0 = domingo … 6 = sábado, no relógio da máquina. */
  dias: number[];
  /** HH:MM local. */
  hora: string;
  /** Pasta da sessão (`~/…` ou `~\…` valem); precisa ser confiável para o Claude Code (a home pede confiança). */
  cwd: string;
  /** Primeiro pedido da sessão. */
  prompt: string;
  ativa?: boolean;
}

const CHECAGEM_MS = 60_000;

/**
 * Rotinas da Torre: lê `rotinas.json` da pasta de estado a cada minuto (editar o arquivo vale
 * sem reiniciar) e abre a sessão de cada rotina devida. Sem o arquivo, nada roda. O dia da
 * última execução fica em `rotinas-estado.json`, gravado antes de abrir: uma falha ao abrir não
 * repete a rotina em laço a cada minuto, e o erro fica no log.
 */
export class Rotinas {
  private readonly arquivo: string;
  private readonly estadoArquivo: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: { dataDir: string; manager: SessionManager }) {
    this.arquivo = path.join(opts.dataDir, 'rotinas.json');
    this.estadoArquivo = path.join(opts.dataDir, 'rotinas-estado.json');
  }

  iniciar(): void {
    this.checar();
    this.timer = setInterval(() => this.checar(), CHECAGEM_MS);
    this.timer.unref();
  }

  checar(agora = new Date()): void {
    const rotinas = this.ler();
    if (!rotinas.length) return;
    const estado = this.lerEstado();
    for (const r of rotinas) {
      if (!devida(r, agora, estado[r.id])) continue;
      estado[r.id] = diaLocal(agora);
      this.gravarEstado(estado);
      const data = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}`;
      try {
        const cwd = path.resolve(expandirHome(r.cwd, os.homedir()));
        this.opts.manager.open(cwd, String(r.nome ?? r.id).replace('{data}', data), r.prompt);
        console.log(`[rotinas] ${r.id}: sessão aberta em ${cwd}`);
      } catch (err) {
        console.error(`[rotinas] ${r.id}: ${(err as Error).message}`);
      }
    }
  }

  private ler(): Rotina[] {
    try {
      // O Bloco de Notas do Windows pode gravar o JSON com BOM: tira antes do parse.
      const lista = JSON.parse(fs.readFileSync(this.arquivo, 'utf8').replace(/^﻿/, ''));
      return Array.isArray(lista) ? lista.filter((r) => r && r.id && r.cwd && r.prompt) : [];
    } catch {
      return [];
    }
  }

  private lerEstado(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.estadoArquivo, 'utf8'));
    } catch {
      return {};
    }
  }

  private gravarEstado(estado: Record<string, string>): void {
    const tmp = `${this.estadoArquivo}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 2));
    // No Windows o rename por cima pode falhar se outro processo (antivírus, OneDrive) segura
    // o arquivo por um instante: aí grava direto.
    try {
      fs.renameSync(tmp, this.estadoArquivo);
    } catch {
      fs.writeFileSync(this.estadoArquivo, JSON.stringify(estado, null, 2));
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
  }
}
