import { describe, it, expect } from 'vitest';
import { positionValue, positionPL, positionPLPct, totalValue, totalPL, withAllocation , portfolioWarnings } from './investments.js';

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

describe('portfolioWarnings', () => {
  const mk = (asset, qty, avg, cur, broker) => ({ id: asset, asset, qty, avgPrice: avg, currentPrice: cur, broker: broker || 'XTB' });

  it('carteira vazia → sem avisos', () => {
    expect(portfolioWarnings([])).toEqual([]);
    expect(portfolioWarnings(null)).toEqual([]);
  });

  it('avisa concentração acima de 40%', () => {
    const w = portfolioWarnings([mk('AAPL', 10, 10, 100), mk('MSFT', 10, 10, 20), mk('VWCE', 10, 10, 20)]);
    const c = w.find((x) => x.id.startsWith('conc-'));
    expect(c).toBeTruthy();
    expect(c.title).toContain('AAPL');
  });

  it('concentração acima de 60% é alerta', () => {
    const w = portfolioWarnings([mk('AAPL', 10, 10, 100), mk('MSFT', 1, 10, 20)]);
    expect(w.find((x) => x.id.startsWith('conc-')).tone).toBe('alert');
  });

  it('carteira equilibrada não gera aviso de concentração', () => {
    const w = portfolioWarnings([mk('A', 10, 10, 10), mk('B', 10, 10, 10), mk('C', 10, 10, 10)]);
    expect(w.find((x) => x.id.startsWith('conc-'))).toBeUndefined();
  });

  it('avisa carteira com uma só posição', () => {
    expect(portfolioWarnings([mk('VWCE', 10, 10, 12)]).find((x) => x.id === 'single')).toBeTruthy();
  });

  it('avisa quando tudo está na mesma corretora', () => {
    const w = portfolioWarnings([mk('A', 10, 10, 10), mk('B', 10, 10, 10), mk('C', 10, 10, 10)]);
    expect(w.find((x) => x.id.startsWith('broker-'))).toBeTruthy();
  });

  it('não avisa de corretora quando há mais do que uma', () => {
    const w = portfolioWarnings([mk('A', 10, 10, 10), mk('B', 10, 10, 10, 'Trade Republic'), mk('C', 10, 10, 10)]);
    expect(w.find((x) => x.id.startsWith('broker-'))).toBeUndefined();
  });

  it('assinala posições abaixo de −25%', () => {
    const w = portfolioWarnings([mk('A', 10, 10, 10), mk('B', 10, 100, 50), mk('C', 10, 10, 10)]);
    const d = w.find((x) => x.id.startsWith('down-'));
    expect(d).toBeTruthy();
    expect(d.title).toContain('B');
  });
});
