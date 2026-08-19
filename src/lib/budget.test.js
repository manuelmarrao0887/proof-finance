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


describe('rollover com teto', () => {
  it('o transitado nunca excede 1× o limite base (nem para cima nem para baixo)', () => {
    const bdg = [{ id: 'sup', lm: 100 }];
    const yms = ['2026-01', '2026-02', '2026-03', '2026-04'];
    // gasta 0 durante 3 meses → sem teto o 4.º mês teria 400 de limite
    const r = effectiveLimits(bdg, { '2026-01': {}, '2026-02': {}, '2026-03': {} }, yms, true);
    expect(r['2026-04'].sup.eff).toBe(200); // base + no máximo 1× base
    // estoura muito durante 2 meses → a falta transitada também é limitada
    const r2 = effectiveLimits(bdg, { '2026-01': { sup: 1000 }, '2026-02': { sup: 1000 } }, yms.slice(0, 3), true);
    expect(r2['2026-03'].sup.eff).toBe(0); // base − 1× base
  });
});
