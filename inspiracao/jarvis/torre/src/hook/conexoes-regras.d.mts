export const COFRE_DA_TORRE: string;
export function opPelaTorre(args: string[]): boolean;
export function conexaoDaFerramenta(tool: string, input: unknown, conectores?: string[]): string;
export function conexoesDaFerramenta(tool: string, input: unknown, conectores?: string[]): string[];
export function precisaDaVpn(cmd: string): boolean;
export function normalizar(nome: string): string;
export function acharExecutavel(
  nome: string,
  opcoes?: { env?: Record<string, string | undefined>; platform?: string; ignorar?: string[]; existe?: (arquivo: string) => boolean },
): string;
export function montarExecucao(
  arquivo: string,
  args: string[],
  opcoes?: { platform?: string; comspec?: string },
): { arquivo: string; args: string[]; verbatim: boolean };
export function statusDoConector(saida: string, nome: string): { ok: boolean | null; detalhe: string };
export function linhaPath(bin: string, platform?: string): string;
