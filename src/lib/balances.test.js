import { describe, it, expect } from 'vitest';
import {
  balanceAcctKey,
  latestReading,
  accountHistory,
  addReading,
  formatReadingDate,
} from './balances.js';

describe('balanceAcctKey', () => {
  it('template account -> bank_type', () => {
    expect(balanceAcctKey({ bank: 'Activobank', type: 'Conta a Ordem', custom: false })).toBe('Activobank_Conta a Ordem');
  });
  it('custom account -> id', () => {
    expect(balanceAcctKey({ bank: 'Revolut', type: 'Conta a Ordem', custom: true, id: 'abc123' })).toBe('abc123');
  });
});

describe('latestReading', () => {
  const log = [
    { acctKey: 'A', value: 100, date: '2026-05-01' },
    { acctKey: 'A', value: 150, date: '2026-05-30' },
    { acctKey: 'B', value: 9, date: '2026-05-15' },
  ];
  it('returns the most recent reading for a key', () => {
    expect(latestReading(log, 'A')).toEqual({ acctKey: 'A', value: 150, date: '2026-05-30' });
  });
  it('returns null when no reading exists', () => {
    expect(latestReading(log, 'Z')).toBeNull();
  });
  it('handles empty/undefined log', () => {
    expect(latestReading(undefined, 'A')).toBeNull();
  });
});

describe('accountHistory', () => {
  const log = [
    { acctKey: 'A', value: 150, date: '2026-05-30' },
    { acctKey: 'B', value: 9, date: '2026-05-15' },
    { acctKey: 'A', value: 100, date: '2026-05-01' },
  ];
  it('returns only the key, ascending by date', () => {
    expect(accountHistory(log, 'A').map((r) => r.value)).toEqual([100, 150]);
  });
  it('empty log -> []', () => {
    expect(accountHistory([], 'A')).toEqual([]);
  });
});

describe('addReading', () => {
  it('appends immutably', () => {
    const log = [{ acctKey: 'A', value: 1, date: '2026-01-01' }];
    const out = addReading(log, { acctKey: 'A', value: 2, date: '2026-02-01' });
    expect(out).toHaveLength(2);
    expect(log).toHaveLength(1);
    expect(out[1].value).toBe(2);
  });
  it('handles undefined log', () => {
    expect(addReading(undefined, { acctKey: 'A', value: 2, date: '2026-02-01' })).toHaveLength(1);
  });
});

describe('formatReadingDate', () => {
  it('YYYY-MM-DD -> DD/MM/YYYY', () => {
    expect(formatReadingDate('2026-05-30')).toBe('30/05/2026');
  });
  it('passes through unknown formats', () => {
    expect(formatReadingDate('hoje')).toBe('hoje');
  });
});
