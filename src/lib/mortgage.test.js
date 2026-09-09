import { describe, it, expect } from 'vitest';
import { monthlyPayment, totalInterest, effortRate, imtHPP, stampDuty, purchaseTaxes, monthsElapsed, remainingBalance, simulateExtraRepayment } from './mortgage.js';

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

describe('monthsElapsed', () => {
  it('conta meses inteiros decorridos entre datas (ignora o dia)', () => {
    expect(monthsElapsed('2020-01-15', new Date('2020-04-20'))).toBe(3);
  });
  it('data vazia → 0', () => {
    expect(monthsElapsed('', new Date())).toBe(0);
  });
  it('nunca negativo (data no futuro)', () => {
    expect(monthsElapsed('2030-01-01', new Date('2020-01-01'))).toBe(0);
  });
});

describe('remainingBalance', () => {
  it('sem meses decorridos = capital inicial', () => {
    expect(remainingBalance(100000, 3, 30, 0)).toBeCloseTo(100000, 2);
  });
  it('no fim do prazo = 0', () => {
    expect(remainingBalance(100000, 3, 30, 360)).toBeCloseTo(0, 2);
  });
  it('taxa 0% decresce linearmente', () => {
    expect(remainingBalance(12000, 0, 1, 6)).toBeCloseTo(6000, 2);
  });
});

describe('simulateExtraRepayment', () => {
  const principal = 100000, rate = 3, years = 30, months = 60;
  const payment = monthlyPayment(principal, rate, years);
  const base = { principal, annualRatePct: rate, years, monthsElapsed: months, payment };

  it('extra 0 → sem poupança em nenhum cenário', () => {
    const r = simulateExtraRepayment({ ...base, extra: 0 });
    expect(r.reduceTerm.monthsSaved).toBe(0);
    expect(r.reduceTerm.interestSaved).toBe(0);
    expect(r.reducePayment.interestSaved).toBe(0);
  });

  it('reduzir prazo: poupa meses e juros mantendo a prestação', () => {
    const r = simulateExtraRepayment({ ...base, extra: 10000 });
    expect(r.reduceTerm.monthsSaved).toBeGreaterThan(0);
    expect(r.reduceTerm.interestSaved).toBeGreaterThan(0);
  });

  it('reduzir prestação: baixa o valor mensal mantendo o prazo', () => {
    const r = simulateExtraRepayment({ ...base, extra: 10000 });
    expect(r.reducePayment.newPayment).toBeLessThan(payment);
    expect(r.reducePayment.interestSaved).toBeGreaterThan(0);
  });

  it('extra ≥ saldo em dívida → quita o crédito nos dois cenários', () => {
    const bal = remainingBalance(principal, rate, years, months);
    const r = simulateExtraRepayment({ ...base, extra: bal + 5000 });
    expect(r.payoff).toBe(true);
    expect(r.reduceTerm.newMonths).toBe(0);
    expect(r.reducePayment.newPayment).toBe(0);
  });
});
