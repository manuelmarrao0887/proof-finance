import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// O caminho do repo contém espaços — `new URL(...).pathname` devolve-os
// percent-encoded (%20) e parte o fs.readFileSync. Usamos fileURLToPath +
// path.resolve (mesmo padrão de src/components/assistantFab.test.jsx).
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../');
function read(p) { return fs.readFileSync(path.join(SRC, p), 'utf8'); }

// Linhas com ocorrências legítimas de uma substring proibida porque
// referenciam a CHAVE DE DADOS `plafond` do modelo de conta (que nunca
// muda — ver constraints globais da task), não cópia visível. O teste
// remove estas linhas exatas do conteúdo antes de procurar a substring.
// Formato: [ficheiro, substring exata da linha].
const ALLOWLIST = [
  ["views/CardsView.jsx", "const plafond = a.plafond || 0;"],
  ["views/CardsView.jsx", "const available = plafond - used;"],
  ["views/CardsView.jsx", "const pct = plafond > 0 ? Math.min(100, Math.max(0, (used / plafond) * 100)) : 0;"],
  ["views/CardsView.jsx", "const over = plafond > 0 && used > plafond;"],
  // Mesma razão: a condição e a chamada usam a variável local `plafond`
  // (derivada de `a.plafond`), não texto visível — o texto visível nesta
  // linha já foi corrigido para "limite" / "Sem limite definido".
  ["views/CardsView.jsx", "{plafond > 0 ? mv(used)"],
  ["views/CardsView.jsx", "mv(plafond)"],
];

// Só strings JSX/JS visíveis: ignoramos comentários removendo-os antes de procurar.
function code(p) {
  let c = read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [file, line] of ALLOWLIST) {
    if (file === p) c = c.split(line).join('');
  }
  return c;
}
const BAD = [
  ['components/Hero.jsx', /Património Liquido|Variacao/],
  ['components/ContextStrip.jsx', /Património liquido/],
  ['views/ChartsView.jsx', /Património Liquido/],
  ['views/OverviewView.jsx', /Poupanca \/|despesa media|Projecao|discricionario|fim do mes|Não e\b/],
  // As mesmas regras seguem a cópia: os blocos saíram do Resumo na Task 10.
  ['components/SpendHero.jsx', /fim do mes|Podes gastar hoje\?/],
  ['components/overview/EmergencyFundCard.jsx', /Poupanca \/|despesa media/],
  ['components/overview/ProjectionCard.jsx', /Projecao|discricionario/],
  ['components/overview/SubscriptionsCard.jsx', /Não e\b|regista-las/],
  ['lib/finance.js', /Adesao ao orcamento|Reve os limites/],
  ['views/RecurringView.jsx', /visao clara/],
  ['views/AIView.jsx', /informacao/],
  ['modals/SettingsSheet.jsx', /APARENCIA|~\$0,/],
  ['modals/ActionSheet.jsx', /imobiliario/],
  ['views/IncomesView.jsx', /'Q1'/],
  ['views/ExpensesView.jsx', /'Q1'|Rollover do orçamento/],
  ['views/CardsView.jsx', /plafond/],
  ['modals/AcctModal.jsx', /Plafond mensal/],
];
describe('copy PT-PT', () => {
  for (const [file, re] of BAD) {
    it(file + ' sem ' + re, () => { expect(code(file)).not.toMatch(re); });
  }
  it('custos de IA dizem USD por extenso', () => { expect(read('modals/SettingsSheet.jsx')).toMatch(/USD\s*\/\s*mensagem|USD por mensagem/); });
});
