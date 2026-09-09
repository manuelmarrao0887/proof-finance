import { describe, it, expect } from 'vitest';
import { latestT212, t212History, addT212Reading, t212Gain, t212GainPct } from './trading212.js';

describe('latestT212', () => {
  const log = [
    { baseCusto: 1000, valorAtual: 1050, date: '2026-09-01' },
    { baseCusto: 1200, valorAtual: 1300, date: '2026-09-08' },
  ];
  it('returns the most recent reading', () => {
    expect(latestT212(log)).toEqual({ baseCusto: 1200, valorAtual: 1300, date: '2026-09-08' });
  });
  it('empty/undefined log -> null', () => {
    expect(latestT212([])).toBeNull();
    expect(latestT212(undefined)).toBeNull();
  });
});

describe('t212History', () => {
  it('sorts ascending by date', () => {
    const log = [
      { date: '2026-09-08', valorAtual: 2 },
      { date: '2026-09-01', valorAtual: 1 },
    ];
    expect(t212History(log).map((r) => r.valorAtual)).toEqual([1, 2]);
  });
  it('empty log -> []', () => {
    expect(t212History([])).toEqual([]);
  });
});

describe('addT212Reading', () => {
  it('appends immutably', () => {
    const log = [{ date: '2026-09-01', baseCusto: 1000, valorAtual: 1050 }];
    const out = addT212Reading(log, { date: '2026-09-08', baseCusto: 1200, valorAtual: 1300 });
    expect(out).toHaveLength(2);
    expect(log).toHaveLength(1);
  });
  it('handles undefined log', () => {
    expect(addT212Reading(undefined, { date: '2026-09-01' })).toHaveLength(1);
  });
});

describe('t212Gain', () => {
  it('valorAtual - baseCusto', () => {
    expect(t212Gain({ baseCusto: 1000, valorAtual: 1250 })).toBe(250);
  });
  it('loss is negative', () => {
    expect(t212Gain({ baseCusto: 1000, valorAtual: 900 })).toBe(-100);
  });
  it('null reading -> null', () => {
    expect(t212Gain(null)).toBeNull();
  });
});

describe('t212GainPct', () => {
  it('computes % of base cost', () => {
    expect(t212GainPct({ baseCusto: 1000, valorAtual: 1250 })).toBe(25);
  });
  it('base 0 -> null (division undefined)', () => {
    expect(t212GainPct({ baseCusto: 0, valorAtual: 100 })).toBeNull();
  });
  it('null reading -> null', () => {
    expect(t212GainPct(null)).toBeNull();
  });
});
