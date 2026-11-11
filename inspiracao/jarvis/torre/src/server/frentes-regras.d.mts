export interface FrenteRegra {
  id: string;
  titulo?: string;
  aliases?: string[];
  repo?: string;
  pastas?: string[];
}
export interface Sugestao {
  frente: string;
  motivo: string;
}
export const LIMIAR_SUGESTAO: number;
export function normalizar(s: unknown): string;
export function citaTermo(texto: unknown, termo: unknown): boolean;
export function repoNome(repo: unknown): string;
export function dentroDaPasta(cwd: string, pasta: string): boolean;
export function caminhoTemRepo(cwd: string, repo: string): boolean;
export function sugerirFrente(sessao: { titulo?: string; primeiroPedido?: string; cwd?: string }, frentes: FrenteRegra[]): Sugestao | null;
export function tarefaDaFrente(links: string[], frente: FrenteRegra): boolean;
export function jiraDe(fonte: unknown, linha: unknown): string | undefined;
export function textoPuro(md: unknown): string;
export function objetivoDe(corpo: unknown, max?: number): string;
export function ordenarFrentes<T extends { status: string; titulo: string }>(lista: T[]): T[];
