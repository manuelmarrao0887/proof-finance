import { describe, it, expect } from 'vitest';
import { effectiveLimits, monthEffectiveLimits } from './budget.js';

const bdg = [{ id: 'sup', lm: 100 }, { id: 'rest', lm: 50 }];

describe('effectiveLimits', () => {
  it('rollover OFF: eff = lm base; rem = lm − gasto', () => {
    const g = { '2026-05': { sup: 80 }, '2026-06': { sup: 90 } };
    const r = effectiveLimits(bdg, g, ['2026-05', '2026-06'], false);
    expect(r['2026-06'].sup.eff).toBe(100);
    expect(r['2026-06'].sup.rem).toBe(10);
  });
  it('rollover ON: sobra do mês 1 soma ao limite do mês 2', () => {
    const g = { '2026-05': { sup: 80 }, '2026-06': { sup: 90 } };
    const r = effectiveLimits(bdg, g, ['2026-05', '2026-06'], true);
    // mês 1: eff 100, gasto 80, sobra 20 → mês 2 eff = 100 + 20 = 120
    expect(r['2026-06'].sup.eff).toBe(120);
    expect(r['2026-06'].sup.rem).toBe(120 - 90);
  });
  it('rollover ON: falta (gasto > limite) transita negativa', () => {
    const g = { '2026-05': { sup: 130 } }; // 30 acima
    const r = effectiveLimits(bdg, g, ['2026-05', '2026-06'], true);
    expect(r['2026-06'].sup.eff).toBe(100 - 30); // 70
  });
});

describe('monthEffectiveLimits', () => {
  it('agrega meses até ao selecionado', () => {
    const exp = [
      { amount: 80, cat: 'sup', date: '2026-05-10' },
      { amount: 90, cat: 'sup', date: '2026-06-10' },
    ];
    const m = monthEffectiveLimits(exp, bdg, '2026-06', true);
    expect(m.sup.eff).toBe(120); // 100 + sobra 20 de maio
    expect(m.sup.spent).toBe(90);
  });
});
