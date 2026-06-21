import { describe, it, expect } from 'vitest';
import { monthsToTarget, etaDate, ymLabel } from './goals.js';

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
