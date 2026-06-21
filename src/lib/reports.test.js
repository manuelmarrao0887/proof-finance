import { describe, it, expect } from 'vitest';
import { categoryTotals, monthTotal, monthComparison, topExpenses, prevMonth } from './reports.js';

const exp = [
  { desc: 'A', amount: 40, cat: 'sup', date: '2026-06-02' },
  { desc: 'B', amount: 10, cat: 'sup', date: '2026-06-10' },
  { desc: 'C', amount: 30, cat: 'rest', date: '2026-06-05' },
  { desc: 'D', amount: 99, cat: 'rest', date: '2026-05-20' }, // mês anterior
];

describe('categoryTotals + monthTotal', () => {
  it('soma por categoria no mês', () => {
    expect(categoryTotals(exp, '2026-06')).toEqual({ sup: 50, rest: 30 });
  });
  it('total do mês', () => {
    expect(monthTotal(exp, '2026-06')).toBe(80);
  });
});

describe('monthComparison', () => {
  it('compara com o mês anterior, ordenado por atual desc', () => {
    const c = monthComparison(exp, '2026-06', '2026-05');
    expect(c[0].cat).toBe('sup'); // 50 > 30
    const rest = c.find((r) => r.cat === 'rest');
    expect(rest.cur).toBe(30);
    expect(rest.prev).toBe(99);
    expect(rest.delta).toBe(-69);
  });
});

describe('topExpenses', () => {
  it('maiores do mês, desc', () => {
    const t = topExpenses(exp, '2026-06', 2);
    expect(t.map((x) => x.desc)).toEqual(['A', 'C']);
  });
});

describe('prevMonth', () => {
  it('2026-06 → 2026-05', () => expect(prevMonth('2026-06')).toBe('2026-05'));
  it('2026-01 → 2025-12', () => expect(prevMonth('2026-01')).toBe('2025-12'));
});
