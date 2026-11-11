export interface RotinaRegra {
  ativa?: boolean;
  dias: number[];
  hora: string;
}
export function diaLocal(agora: Date): string;
export function devida(rotina: RotinaRegra, agora: Date, ultimoDia: string | undefined): boolean;
export function expandirHome(p: string, home: string): string;
