import { describe, it, expect } from 'vitest';
import { topCategories, lastUsedAccount } from './categoryUsage.js';
const today = new Date().toISOString().slice(0, 10);
describe('topCategories', () => {
  it('ordena por frequência nos últimos 90 dias e completa com defaults', () => {
    const s = { bdg: [{ id: 'sup', nm: 'Supermercado' }, { id: 'rest', nm: 'Restauração' }, { id: 'gym', nm: 'Ginásio' }], addedExp: [
      { cat: 'gym', date: today }, { cat: 'gym', date: today }, { cat: 'rest', date: today }, { cat: 'sup', date: '2020-01-01' },
    ] };
    expect(topCategories(s, { n: 4 })).toEqual(['gym', 'rest', 'sup', 'comp']);
  });
  it('sem despesas devolve os defaults', () => {
    expect(topCategories({ bdg: [], addedExp: [] }, { n: 3 })).toEqual(['sup', 'rest', 'comp']);
  });
});
describe('lastUsedAccount', () => {
  it('devolve a conta da despesa mais recente', () => {
    expect(lastUsedAccount({ addedExp: [{ date: '2026-09-01', acct: 'A' }, { date: '2026-09-03', acct: 'B' }, { date: '2026-09-04' }] })).toBe('B');
    expect(lastUsedAccount({ addedExp: [] })).toBe('');
  });
});
