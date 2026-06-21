import { describe, it, expect } from 'vitest';
import { positionValue, positionPL, positionPLPct, totalValue, totalPL, withAllocation } from './investments.js';

const p1 = { id: 'a', broker: 'XTB', asset: 'AAPL', qty: 10, avgPrice: 100, currentPrice: 120 };
const p2 = { id: 'b', broker: 'TR', asset: 'VWCE', qty: 5, avgPrice: 90, currentPrice: 80 };

describe('posição', () => {
  it('valor = qty * preço atual', () => expect(positionValue(p1)).toBe(1200));
  it('P&L = valor − custo', () => expect(positionPL(p1)).toBe(1200 - 1000));
  it('P&L % sobre o custo', () => expect(positionPLPct(p1)).toBeCloseTo(20, 5));
  it('perda', () => expect(positionPL(p2)).toBe(400 - 450));
});

describe('totais + alocação', () => {
  it('valor total', () => expect(totalValue([p1, p2])).toBe(1200 + 400));
  it('P&L total', () => expect(totalPL([p1, p2])).toBe(200 - 50));
  it('alocação ordenada por valor com %', () => {
    const a = withAllocation([p2, p1]);
    expect(a[0].asset).toBe('AAPL'); // 1200 > 400
    expect(a[0].pct).toBeCloseTo((1200 / 1600) * 100, 5);
  });
});
