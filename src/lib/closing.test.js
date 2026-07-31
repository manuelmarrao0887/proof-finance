import { describe, it, expect } from 'vitest';
import { monthClosing } from './closing.js';

const JUN = ['2026-06-03', '2026-06-14', '2026-06-25'];
const BASE = {
  bdg: [{ id: 'rest', nm: 'Restauração' }, { id: 'sup', nm: 'Supermercado' }],
  incomes: [{ id: 'i', name: 'Salário', amount: 2000, recurring: true }],
  addedExp: [
    ...JUN.map((d, i) => ({ id: 'j' + i, desc: 'x', cat: 'rest', amount: 200, date: d })),
    { id: 's1', desc: 'y', cat: 'sup', amount: 100, date: '2026-06-10' },
    // meses de referência
    { id: 'm1', desc: 'z', cat: 'rest', amount: 1000, date: '2026-05-10' },
    { id: 'm2', desc: 'z', cat: 'rest', amount: 1000, date: '2026-04-10' },
  ],
};

describe('monthClosing', () => {
  it('só aparece nos primeiros dias do mês', () => {
    expect(monthClosing(BASE, new Date(2026, 6, 3))).toBeTruthy(); // 3 julho
    expect(monthClosing(BASE, new Date(2026, 6, 20))).toBeNull(); // 20 julho
  });

  it('fecha o mês ANTERIOR com total e categorias', () => {
    const c = monthClosing(BASE, new Date(2026, 6, 2));
    expect(c.monthKey).toBe('2026-06');
    expect(c.monthName).toBe('junho');
    expect(c.total).toBe(700); // 3×200 + 100
    expect(c.top[0]).toMatchObject({ name: 'Restauração', value: 600 });
  });

  it('compara com a média dos 3 meses anteriores', () => {
    const c = monthClosing(BASE, new Date(2026, 6, 2));
    expect(c.avg).toBe(1000); // maio e abril
    expect(c.deltaPct).toBeCloseTo(-30, 5);
    expect(c.better).toBe(true);
  });

  it('calcula poupança quando há rendimento', () => {
    const c = monthClosing(BASE, new Date(2026, 6, 2));
    expect(c.income).toBe(2000);
    expect(c.saved).toBe(1300);
    expect(c.rate).toBeCloseTo(65, 5);
  });

  it('sem rendimento registado não inventa taxa', () => {
    const c = monthClosing({ ...BASE, incomes: [] }, new Date(2026, 6, 2));
    expect(c.saved).toBeNull();
    expect(c.rate).toBeNull();
  });

  it('mês anterior sem despesas → null', () => {
    expect(monthClosing({ ...BASE, addedExp: [] }, new Date(2026, 6, 2))).toBeNull();
  });

  it('atravessa a viragem do ano', () => {
    const s = { ...BASE, addedExp: [{ id: 'd', desc: 'x', cat: 'rest', amount: 50, date: '2025-12-20' }] };
    const c = monthClosing(s, new Date(2026, 0, 2)); // 2 janeiro 2026
    expect(c.monthKey).toBe('2025-12');
    expect(c.monthName).toBe('dezembro');
  });
});
