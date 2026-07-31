import { describe, it, expect } from 'vitest';
import { monthsToTarget, etaDate, ymLabel , goalsAtRisk } from './goals.js';

describe('monthsToTarget', () => {
  it('arredonda para cima', () => {
    expect(monthsToTarget(1000, 300)).toBe(4); // 3.33 → 4
  });
  it('monthly 0 → 0', () => expect(monthsToTarget(1000, 0)).toBe(0));
  it('já atingido (remaining 0) → 0', () => expect(monthsToTarget(0, 300)).toBe(0));
});

describe('etaDate', () => {
  it('today + meses', () => {
    const d = etaDate(1000, 500, new Date(2026, 5, 15)); // 2 meses → ago
    expect(d.getMonth()).toBe(7);
    expect(d.getFullYear()).toBe(2026);
  });
  it('sem monthly → null', () => expect(etaDate(1000, 0)).toBeNull());
});

describe('ymLabel', () => {
  it('formata MM/AAAA', () => expect(ymLabel(new Date(2026, 7, 1))).toBe('08/2026'));
});

describe('goalsAtRisk', () => {
  const NOW = new Date(2026, 6, 15); // 15 julho 2026

  it('meta sem prazo ou já cumprida → não entra', () => {
    expect(goalsAtRisk([{ id: 'a', name: 'X', target: 100, current: 0, monthly: 1 }], NOW)).toEqual([]);
    expect(goalsAtRisk([{ id: 'b', name: 'Y', target: 100, current: 100, deadline: '2026-12-01' }], NOW)).toEqual([]);
  });

  it('reserva insuficiente para o prazo → em risco', () => {
    // faltam 1000 € e 5 meses → precisa de 200/mês, só reserva 50
    const r = goalsAtRisk([{ id: 'g', name: 'Férias', target: 1000, current: 0, monthly: 50, deadline: '2026-12-15' }], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].monthsLeft).toBe(5);
    expect(r[0].needed).toBeCloseTo(200, 5);
    expect(r[0].gap).toBeCloseTo(150, 5);
  });

  it('reserva suficiente → não acusa', () => {
    const r = goalsAtRisk([{ id: 'g', name: 'OK', target: 1000, current: 0, monthly: 200, deadline: '2026-12-15' }], NOW);
    expect(r).toEqual([]);
  });

  it('tolera uma margem de 5%', () => {
    // precisa 200, reserva 195 → dentro da margem
    const r = goalsAtRisk([{ id: 'g', name: 'Quase', target: 1000, current: 0, monthly: 195, deadline: '2026-12-15' }], NOW);
    expect(r).toEqual([]);
  });

  it('sem reserva definida também está em risco', () => {
    const r = goalsAtRisk([{ id: 'g', name: 'Sem plano', target: 500, current: 0, deadline: '2026-11-15' }], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].monthly).toBe(0);
  });

  it('prazo passado ou neste mês → ignorado', () => {
    expect(goalsAtRisk([{ id: 'a', name: 'V', target: 100, current: 0, deadline: '2026-01-01' }], NOW)).toEqual([]);
    expect(goalsAtRisk([{ id: 'b', name: 'W', target: 100, current: 0, deadline: '2026-07-30' }], NOW)).toEqual([]);
  });

  it('ordena pelas mais urgentes primeiro', () => {
    const r = goalsAtRisk(
      [
        { id: 'far', name: 'Longe', target: 1000, current: 0, monthly: 1, deadline: '2027-07-15' },
        { id: 'near', name: 'Perto', target: 1000, current: 0, monthly: 1, deadline: '2026-10-15' },
      ],
      NOW
    );
    expect(r[0].id).toBe('near');
  });
});
