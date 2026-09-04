import { describe, it, expect } from 'vitest';
import { netWorth, netWorthHistory, investmentAccountsValue, positionsValue, monthSpend, monthPendingFixed, savingsRate } from './metrics.js';
import { compute, netWorthSeries } from './finance.js';
import { totalValue } from './investments.js';
import { initialPersisted } from '../store/store.jsx';
import { richFixture } from '../test/fixtures.js';
const S = () => ({ ...initialPersisted(), ...richFixture(), currentUser: { uid: 'u' } });
describe('metrics', () => {
  it('netWorth é o nW do compute e o histórico é o netWorthSeries', () => {
    const s = S();
    expect(netWorth(s)).toBe(compute(s).nW);
    expect(netWorthHistory(s)).toEqual(netWorthSeries(s));
  });
  it('contas de investimento e posições são coisas diferentes e ambas existem', () => {
    const s = S();
    expect(investmentAccountsValue(s)).toBe(5000);
    expect(positionsValue(s)).toBe(totalValue(s.positions));
    expect(positionsValue(s)).toBe(3570);
  });
  it('monthSpend soma só as despesas do mês, em valor absoluto', () => {
    const s = { addedExp: [{ amount: 10, date: '2026-09-01' }, { amount: -5, date: '2026-09-30' }, { amount: 99, date: '2026-08-31' }] };
    expect(monthSpend(s, '2026-09')).toBe(15);
    expect(monthSpend(s, '2026-07')).toBe(0);
  });
  it('monthPendingFixed é a soma das recorrentes ainda não lançadas no mês', () => {
    const s = { recurring: [{ id: 'r1', amount: 40 }, { id: 'r2', amount: 36 }], addedExp: [{ recId: 'r2', amount: 36, date: '2026-09-06' }] };
    expect(monthPendingFixed(s, '2026-09')).toBe(40);
    expect(monthPendingFixed(s, '2026-10')).toBe(76);
  });
  it('savingsRate', () => {
    expect(savingsRate(2000, 500)).toBe(75);
    expect(savingsRate(0, 500)).toBeNull();
  });
});
