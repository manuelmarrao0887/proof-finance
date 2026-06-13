import { describe, it, expect } from 'vitest';
import { normalizeStmtDate } from './format.js';

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
});
