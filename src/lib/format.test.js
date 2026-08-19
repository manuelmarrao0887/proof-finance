import { describe, it, expect } from 'vitest';
import { normalizeStmtDate, todayISO, fmDate, fmDateShort, fm, fc } from './format.js';

describe('todayISO (data LOCAL, sem UTC shift)', () => {
  it('usa componentes locais — 1 de julho 00:30 local NÃO recua para junho', () => {
    // Instante que em UTC seria 30 de junho 23:30, mas local é 1 de julho 00:30.
    const d = new Date(2026, 6, 1, 0, 30, 0); // mês 6 = julho (local)
    expect(todayISO(d)).toBe('2026-07-01');
  });
  it('formata com zero-padding', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('normalizeStmtDate', () => {
  it('keeps ISO YYYY-MM-DD', () => {
    expect(normalizeStmtDate('2026-04-29')).toBe('2026-04-29');
  });
  it('DD/MM/YYYY -> ISO', () => {
    expect(normalizeStmtDate('29/04/2025')).toBe('2025-04-29');
  });
  it('DD.MM.YYYY -> ISO', () => {
    expect(normalizeStmtDate('05.03.2024')).toBe('2024-03-05');
  });
  it('2-digit year -> 20YY', () => {
    expect(normalizeStmtDate('05.03.24')).toBe('2024-03-05');
  });
  it('DD.MM (no year) -> ISO with inferred year, correct month/day', () => {
    expect(normalizeStmtDate('29.04')).toMatch(/^\d{4}-04-29$/);
  });
  it('empty -> empty', () => {
    expect(normalizeStmtDate('')).toBe('');
  });
  it('unknown format passes through', () => {
    expect(normalizeStmtDate('ontem')).toBe('ontem');
  });
  it('fixes YYYY-DD-MM swap when month is impossible', () => {
    expect(normalizeStmtDate('2025-15-05')).toBe('2025-05-15');
    expect(normalizeStmtDate('2025-28-05')).toBe('2025-05-28');
    expect(normalizeStmtDate('2025-22-05')).toBe('2025-05-22');
  });
  it('leaves valid YYYY-MM-DD untouched', () => {
    expect(normalizeStmtDate('2026-04-24')).toBe('2026-04-24');
    expect(normalizeStmtDate('2025-07-05')).toBe('2025-07-05');
  });
  it('pads single-digit ISO parts', () => {
    expect(normalizeStmtDate('2025-7-5')).toBe('2025-07-05');
  });
});

describe('fmDate / fmDateShort', () => {
  it('ISO → DD/MM/AAAA', () => {
    expect(fmDate('2026-08-20')).toBe('20/08/2026');
    expect(fmDate('lixo')).toBe('lixo');
    expect(fmDate('')).toBe('');
  });
  it('curto: "20 ago" no ano corrente, com ano se for outro', () => {
    const y = new Date().getFullYear();
    expect(fmDateShort(y + '-08-20')).toBe('20 ago');
    expect(fmDateShort((y - 1) + '-01-05')).toBe('5 jan ' + String(y - 1).slice(2));
    expect(fmDateShort(y + '-08-20', true)).toBe('20 ago ' + String(y).slice(2));
  });
});

describe('fm / fc — moeda em formato PT com símbolo', () => {
  it('fm: 2 casas, vírgula decimal, símbolo € com espaço inseparável', () => {
    expect(fm(1234.5)).toBe('1234,50 €');
    expect(fm(0)).toBe('0,00 €');
    expect(fm(-12.345)).toBe('-12,35 €');
  });
  it('fc: sem casas decimais', () => {
    expect(fc(1234.5)).toBe('1235 €');
  });
});
