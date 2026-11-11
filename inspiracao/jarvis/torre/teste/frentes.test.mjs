// Casos das regras das frentes: node teste/frentes.test.mjs
import { citaTermo, dentroDaPasta, jiraDe, normalizar, objetivoDe, ordenarFrentes, sugerirFrente, tarefaDaFrente, textoPuro } from '../src/server/frentes-regras.mjs';

const acme = { id: 'implantacao-acme', titulo: 'Implantação Acme', aliases: ['Projeto Ácme'], repo: 'WeHandle/acme-portal', pastas: ['C:/Users/Ana Lima/repos/acme-portal'] };
const brain = { id: 'megabrain', titulo: 'Megabrain (Company Brain)', aliases: ['Megabrain', 'Company Brain'], repo: 'WeHandle/exptools-ajudantecstomador', pastas: [] };
const curta = { id: 'bi', titulo: 'BI', aliases: ['app'], pastas: [] };
const frentes = [acme, brain, curta];

let falhas = 0;
let total = 0;
const igual = (veio, esperado, desc) => {
  total++;
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas++;
    console.log('FALHOU', desc, `(esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)})`);
  }
};
const frenteDe = (s) => sugerirFrente(s, frentes)?.frente ?? null;

// Positivos
igual(frenteDe({ cwd: 'C:\\Users\\Ana Lima\\repos\\acme-portal\\src' }), 'implantacao-acme', 'cwd dentro da pasta, com \\');
igual(frenteDe({ cwd: 'c:/users/ana lima/repos/ACME-PORTAL' }), 'implantacao-acme', 'cwd igual à pasta, caixa e / diferentes');
igual(frenteDe({ cwd: 'D:\\clones\\exptools-ajudantecstomador\\api' }), 'megabrain', 'repo no caminho Windows com \\');
igual(frenteDe({ titulo: 'Revisar o plano do Company Brain', cwd: 'C:\\tmp' }), 'megabrain', 'alias no título');
igual(frenteDe({ primeiroPedido: 'abre o MEGABRAIN e lista os módulos' }), 'megabrain', 'id no primeiro pedido, caixa alta');
igual(frenteDe({ titulo: 'Status da implantacao acme' }), 'implantacao-acme', 'título sem acento casa o título com acento');
igual(frenteDe({ titulo: 'Reunião do projeto acme' }), 'implantacao-acme', 'alias com acento casa texto sem acento');
igual(frenteDe({ titulo: 'ver exptools-ajudantecstomador' }), 'megabrain', 'nome do repo citado');
igual(sugerirFrente({ cwd: 'C:\\Users\\Ana Lima\\repos\\acme-portal' }, frentes)?.motivo, 'abre numa pasta da frente', 'motivo da pasta');

// Negativos
igual(frenteDe({ titulo: 'Corrigir bug no login', cwd: 'C:\\Users\\Ana Lima\\projetos\\outro' }), null, 'nada casa');
igual(frenteDe({ titulo: 'megabrainzinho de teste' }), null, 'palavra parcial não casa');
igual(frenteDe({ titulo: 'subir o app de BI' }), null, 'termos curtos (< 4) não contam');
igual(frenteDe({ cwd: 'C:\\Users\\Ana Lima\\repos\\acme-portal-v2' }), null, 'pasta com prefixo parecido não é a pasta');
igual(frenteDe({ titulo: 'company brain e implantação acme', cwd: '' }), null, 'empate entre duas frentes fica na Geral');
igual(frenteDe({}), null, 'sessão vazia');
igual(sugerirFrente({ titulo: 'megabrain' }, []), null, 'sem frentes');

// Desempate: pasta pesa mais que citação
igual(frenteDe({ titulo: 'Company Brain', cwd: 'C:/Users/Ana Lima/repos/acme-portal' }), 'implantacao-acme', 'pasta vence citação');

// Utilitários
igual(normalizar('Ação Já-Feita!'), 'acao ja feita', 'normalizar');
igual(citaTermo('Plano do Company-Brain', 'company brain'), true, 'hífen vira espaço');
igual(dentroDaPasta('C:\\a\\b', 'C:/a/b/'), true, 'barra no fim');
igual(tarefaDaFrente(['megabrain'], brain), true, 'tarefa com [[megabrain]]');
igual(tarefaDaFrente(['Company Brain'], brain), true, 'tarefa com alias em wikilink');
igual(tarefaDaFrente(['acme'], brain), false, 'tarefa de outra frente');
igual(jiraDe('jira:DAD-123', ''), 'DAD-123', 'jira pela fonte');
igual(jiraDe('manual', '- [ ] Ver card | ref: jira:dad-9 | criado: x'), 'DAD-9', 'jira na linha');
igual(jiraDe('outlook:2026-10-20', 'sem card'), undefined, 'sem jira');
igual(textoPuro('Fala com [[levy-cruz|Levy]] sobre **o plano** do [[megabrain]] (`x`)'), 'Fala com Levy sobre o plano do megabrain (x)', 'texto puro');
igual(objetivoDe('# T\n\n## Objetivo\nPrimeira linha\nsegunda [[a|A]].\n\nOutro parágrafo\n## Status\n- x'), 'Primeira linha segunda A.', 'objetivo da seção');
igual(objetivoDe('# T\n\nCorpo sem seção.\n\nMais.'), 'Corpo sem seção.', 'objetivo do corpo');
igual(objetivoDe('## Objetivo\n' + 'a'.repeat(500)).length, 400, 'objetivo cortado em 400');
igual(ordenarFrentes([{ titulo: 'Zeta', status: 'ativo' }, { titulo: 'Alfa', status: 'pausado' }, { titulo: 'Beta', status: 'ativo' }]).map((f) => f.titulo), ['Beta', 'Zeta', 'Alfa'], 'ativas primeiro');

console.log(`${total - falhas}/${total} casos certos`);
process.exit(falhas ? 1 : 0);
