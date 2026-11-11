// Regra pura das rotinas: dada a rotina, a hora local e o dia da última execução, diz se ela
// roda agora. Fica fora do servidor para o teste (teste/rotinas.test.mjs) rodar sem a Torre.

/** Dia local no formato AAAA-MM-DD (o dia da execução grava assim no estado). */
export function diaLocal(agora) {
  const p = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/**
 * A rotina roda quando é o dia da semana dela (0 = domingo … 6 = sábado), já passou da hora e
 * ela ainda não rodou hoje. Torre fora do ar no horário: roda quando voltar, no mesmo dia.
 * Depois da meia-noite a janela fecha: rotina de sexta não roda no sábado.
 */
export function devida(rotina, agora, ultimoDia) {
  if (rotina.ativa === false) return false;
  if (!Array.isArray(rotina.dias) || !rotina.dias.includes(agora.getDay())) return false;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(rotina.hora ?? ''));
  if (!m) return false;
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  if (minutos < Number(m[1]) * 60 + Number(m[2])) return false;
  return ultimoDia !== diaLocal(agora);
}

/**
 * Pasta da rotina com `~` expandido: aceita `~`, `~/pasta` e `~\pasta` (Windows).
 * Qualquer outro caminho volta como veio.
 */
export function expandirHome(p, home) {
  const s = String(p ?? '');
  if (s === '~') return home;
  if (/^~[\\/]/.test(s)) return home.replace(/[\\/]+$/, '') + s.slice(1);
  return s;
}
