// Casos da regra das rotinas: node teste/rotinas.test.mjs
import { devida, diaLocal, expandirHome } from '../src/server/rotinas-regras.mjs';

const sexta = { dias: [5], hora: '15:00' };
// 30/10/2026 é sexta; o mês do Date começa em 0.
const em = (dia, h, min) => new Date(2026, 9, dia, h, min);

const casos = [
  [sexta, em(30, 15, 0), undefined, true, 'sexta na hora certa'],
  [sexta, em(30, 18, 40), undefined, true, 'sexta depois da hora (Torre voltou tarde)'],
  [sexta, em(30, 14, 59), undefined, false, 'sexta antes da hora'],
  [sexta, em(30, 16, 0), '2026-10-30', false, 'já rodou hoje'],
  [sexta, em(30, 16, 0), '2026-10-23', true, 'rodou na sexta passada'],
  [sexta, em(31, 9, 0), '2026-10-23', false, 'sábado: a janela de sexta fechou'],
  [sexta, em(29, 15, 0), undefined, false, 'quinta'],
  [{ ...sexta, ativa: false }, em(30, 15, 0), undefined, false, 'desligada'],
  [{ dias: [5], hora: '3pm' }, em(30, 15, 0), undefined, false, 'hora inválida'],
  [{ hora: '15:00' }, em(30, 15, 0), undefined, false, 'sem dias'],
  [{ dias: [1, 3, 5], hora: '8:30' }, em(28, 8, 30), undefined, true, 'vários dias, hora com 1 dígito'],
];

// Pasta da rotina: ~ com barra normal ou invertida (Windows), com home com e sem barra no fim.
const homeWin = 'C:\\Users\\Ana Lima';
const casosHome = [
  ['~', homeWin, homeWin, 'só o til'],
  ['~/projetos', homeWin, 'C:\\Users\\Ana Lima/projetos', 'til com barra normal'],
  ['~\\projetos\\acme', homeWin, 'C:\\Users\\Ana Lima\\projetos\\acme', 'til com barra invertida'],
  ['~/x', '/home/ana/', '/home/ana/x', 'home com barra no fim'],
  ['D:\\trabalho', homeWin, 'D:\\trabalho', 'caminho absoluto fica como está'],
  ['~ana/x', '/home/ana', '~ana/x', 'til de outro usuário não expande'],
];

let falhas = 0;
for (const [r, agora, ultimo, esperado, desc] of casos) {
  const veio = devida(r, agora, ultimo);
  if (veio !== esperado) {
    falhas++;
    console.log('FALHOU', desc, `(esperado ${esperado}, veio ${veio})`);
  }
}
for (const [p, home, esperado, desc] of casosHome) {
  const veio = expandirHome(p, home);
  if (veio !== esperado) {
    falhas++;
    console.log('FALHOU', desc, `(esperado ${esperado}, veio ${veio})`);
  }
}
const total = casos.length + casosHome.length + 1;
if (diaLocal(em(30, 23, 59)) !== '2026-10-30') {
  falhas++;
  console.log('FALHOU diaLocal');
}
console.log(`${total - falhas}/${total} casos certos`);
process.exit(falhas ? 1 : 0);
