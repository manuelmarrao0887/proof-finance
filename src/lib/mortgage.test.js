import { describe, it, expect } from 'vitest';
import { monthlyPayment, totalInterest, effortRate, imtHPP, stampDuty, purchaseTaxes } from './mortgage.js';

describe('monthlyPayment', () => {
  it('amortização francesa 100k a 3% em 30 anos ≈ 421,6', () => {
    expect(monthlyPayment(100000, 3, 30)).toBeCloseTo(421.6, 0);
  });
  it('taxa 0 → principal / meses', () => {
    expect(monthlyPayment(12000, 0, 1)).toBe(1000);
  });
  it('principal 0 → 0', () => {
    expect(monthlyPayment(0, 3, 30)).toBe(0);
  });
});

describe('totalInterest', () => {
  it('é positivo e = prestação*meses − capital', () => {
    const p = 100000, r = 3, y = 30;
    const ti = totalInterest(p, r, y);
    expect(ti).toBeGreaterThan(0);
    expect(ti).toBeCloseTo(monthlyPayment(p, r, y) * 360 - p, 2);
  });
});

describe('effortRate', () => {
  it('500 / 2500 = 20%', () => {
    expect(effortRate(500, 2500)).toBe(20);
  });
  it('rendimento 0 → 0', () => {
    expect(effortRate(500, 0)).toBe(0);
  });
});

describe('imtHPP + stampDuty', () => {
  it('preço no 1º escalão (isento) → 0', () => {
    expect(imtHPP(100000)).toBe(0);
  });
  it('200.000 € → escalão 7% − 10022,42', () => {
    expect(imtHPP(200000)).toBeCloseTo(200000 * 0.07 - 10022.42, 2);
  });
  it('imposto do selo 0,8%', () => {
    expect(stampDuty(200000)).toBeCloseTo(1600, 2);
  });
  it('purchaseTaxes = IMT + IS', () => {
    expect(purchaseTaxes(200000)).toBeCloseTo(imtHPP(200000) + 1600, 2);
  });
});
