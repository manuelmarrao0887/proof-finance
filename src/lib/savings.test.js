import { describe, it, expect } from 'vitest';
import { savingsOpportunities, totalSavings } from './savings.js';

const NOW = new Date(2026, 6, 15); // 15 julho 2026 → janela = jan..jun
const BDG = [
  { id: 'rest', nm: 'Restauração', lm: 200 },
  { id: 'sup', nm: 'Supermercado', lm: 300 },
  { id: 'laz', nm: 'Lazer', lm: 0 }, // sem limite
];

// Gera n despesas iguais num mês.
function fill(ym, cat, n, amount, desc) {
  return Array.from({ length: n }, (_, i) => ({
    id: ym + cat + i,
    desc: desc || cat,
    cat,
    amount,
    date: ym + '-' + String((i % 27) + 1).padStart(2, '0'),
  }));
}
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

describe('savingsOpportunities', () => {
  it('sem histórico → sem sugestões (não inventa)', () => {
    expect(savingsOpportunities({ addedExp: [], bdg: BDG }, NOW)).toEqual([]);
  });

  it('subscrições: mostra o custo anual e a maior', () => {
    const state = {
      bdg: BDG,
      addedExp: fill('2026-05', 'sup', 2, 30),
      recurring: [
        { id: 'r1', name: 'Ginásio', amount: 36 },
        { id: 'r2', name: 'Netflix', amount: 10 },
      ],
    };
    const o = savingsOpportunities(state, NOW).find((x) => x.kind === 'subscriptions');
    expect(o).toBeTruthy();
    expect(o.yearly).toBeCloseTo(46 * 12, 5);
    expect(o.detail).toContain('Ginásio'); // a maior primeiro
  });

  it('categoria consistentemente acima do limite → poupança = excesso médio', () => {
    // 6 meses de restauração a 300 € com limite 200 €
    const addedExp = MONTHS.flatMap((m) => fill(m, 'rest', 3, 100));
    const o = savingsOpportunities({ bdg: BDG, addedExp }, NOW).find((x) => x.id === 'over-rest');
    expect(o).toBeTruthy();
    expect(o.monthly).toBeCloseTo(100, 5); // 300 − 200
    expect(o.yearly).toBeCloseTo(1200, 5);
  });

  it('não acusa uma categoria por um mês mau isolado', () => {
    const addedExp = [
      ...fill('2026-06', 'rest', 5, 100), // um mês muito acima
      ...fill('2026-05', 'rest', 1, 50),
      ...fill('2026-04', 'rest', 1, 50),
    ];
    expect(savingsOpportunities({ bdg: BDG, addedExp }, NOW).find((x) => x.id === 'over-rest')).toBeUndefined();
  });

  it('deteta gastos formiga (muitas compras pequenas no mesmo sítio)', () => {
    const addedExp = MONTHS.flatMap((m) => fill(m, 'rest', 3, 4, 'Café do Ponto'));
    const o = savingsOpportunities({ bdg: BDG, addedExp }, NOW).find((x) => x.kind === 'ants');
    expect(o).toBeTruthy();
    expect(o.title).toContain('Café do Ponto');
    expect(o.title).toContain('18 compras');
  });

  it('ignora compras grandes na regra dos gastos formiga', () => {
    const addedExp = MONTHS.flatMap((m) => fill(m, 'rest', 3, 80, 'Restaurante Caro'));
    expect(savingsOpportunities({ bdg: BDG, addedExp }, NOW).find((x) => x.kind === 'ants')).toBeUndefined();
  });

  it('sugere definir limite na maior categoria sem orçamento', () => {
    const addedExp = MONTHS.flatMap((m) => fill(m, 'laz', 2, 60));
    const o = savingsOpportunities({ bdg: BDG, addedExp }, NOW).find((x) => x.kind === 'nolimit');
    expect(o).toBeTruthy();
    expect(o.title).toContain('Lazer');
  });

  it('ignora o mês corrente (ainda incompleto)', () => {
    const addedExp = fill('2026-07', 'rest', 10, 100); // só o mês atual
    expect(savingsOpportunities({ bdg: BDG, addedExp }, NOW)).toEqual([]);
  });

  it('ordena por impacto anual e limita a 5', () => {
    const addedExp = MONTHS.flatMap((m) => [...fill(m, 'rest', 3, 100), ...fill(m, 'sup', 4, 100)]);
    const list = savingsOpportunities({ bdg: BDG, addedExp, recurring: [{ id: 'r', name: 'X', amount: 5 }] }, NOW);
    expect(list.length).toBeLessThanOrEqual(5);
    const ys = list.map((o) => o.yearly);
    expect(ys).toEqual([...ys].sort((a, b) => b - a));
  });

  it('totalSavings soma o potencial anual', () => {
    expect(totalSavings([{ yearly: 100 }, { yearly: 50 }])).toBe(150);
    expect(totalSavings([])).toBe(0);
  });
});
