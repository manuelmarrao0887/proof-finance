import { describe, it, expect } from 'vitest';
import { categoryTotals, monthTotal, monthComparison, topExpenses, prevMonth, yearMonthlyTotals, yearSummary } from './reports.js';

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

describe('vista anual', () => {
  const EXP = [
    { date: '2026-01-10', amount: 100, cat: 'rest' },
    { date: '2026-01-20', amount: 50, cat: 'sup' },
    { date: '2026-03-05', amount: 300, cat: 'rest' },
    { date: '2025-03-05', amount: 999, cat: 'rest' },
  ];
  it('12 totais por mês, janeiro→dezembro', () => {
    const t = yearMonthlyTotals(EXP, 2026);
    expect(t).toHaveLength(12);
    expect(t[0]).toBe(150); // janeiro
    expect(t[1]).toBe(0); // fevereiro
    expect(t[2]).toBe(300); // março
  });
  it('ignora outros anos', () => {
    expect(yearMonthlyTotals(EXP, 2026).reduce((a, b) => a + b, 0)).toBe(450);
  });
  it('resumo: total, média só dos meses com dados e mês mais caro', () => {
    const s = yearSummary(EXP, 2026);
    expect(s.total).toBe(450);
    expect(s.monthsWithData).toBe(2);
    expect(s.avg).toBe(225);
    expect(s.maxMonth).toBe(2); // março
    expect(s.max).toBe(300);
  });
  it('ano sem dados', () => {
    const s = yearSummary(EXP, 2020);
    expect(s.total).toBe(0);
    expect(s.avg).toBe(0);
    expect(s.maxMonth).toBe(-1);
  });
});
