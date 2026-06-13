import { describe, it, expect } from 'vitest';
import {
  balanceAcctKey,
  latestReading,
  accountHistory,
  addReading,
  formatReadingDate,
  parseBalanceResult,
  listAccounts,
  BALANCE_PROMPT,
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

describe('parseBalanceResult', () => {
  it('numeric value passes through', () => {
    expect(parseBalanceResult({ value: 750.5 })).toEqual({ value: 750.5 });
  });
  it('pt string "1.300,00" -> 1300', () => {
    expect(parseBalanceResult({ value: '1.300,00' })).toEqual({ value: 1300 });
  });
  it('us string "1234.56" -> 1234.56', () => {
    expect(parseBalanceResult({ value: '1234.56' })).toEqual({ value: 1234.56 });
  });
  it('string with currency symbol', () => {
    expect(parseBalanceResult({ value: '€ 325,46' })).toEqual({ value: 325.46 });
  });
  it('error passthrough', () => {
    expect(parseBalanceResult({ error: 'Saldo nao encontrado' })).toEqual({ error: 'Saldo nao encontrado' });
  });
  it('junk -> error', () => {
    expect(parseBalanceResult({ value: 'abc' }).error).toBeTruthy();
  });
  it('null -> error', () => {
    expect(parseBalanceResult(null).error).toBeTruthy();
  });
});

describe('listAccounts', () => {
  it('includes template accounts with acctKey', () => {
    const out = listAccounts({ customAccts: [] });
    const acti = out.find((a) => a.bank === 'Activobank');
    expect(acti).toBeTruthy();
    expect(acti.acctKey).toBe('Activobank_Conta a Ordem');
    expect(acti.custom).toBe(false);
  });
  it('appends custom accounts keyed by id', () => {
    const out = listAccounts({ customAccts: [{ id: 'x1', bank: 'Wise', type: 'Conta a Ordem', category: 'Liquidez' }] });
    const rev = out.find((a) => a.bank === 'Wise');
    expect(rev.acctKey).toBe('x1');
    expect(rev.custom).toBe(true);
    expect(rev.id).toBe('x1');
  });
});

describe('BALANCE_PROMPT', () => {
  it('asks for a value-only JSON', () => {
    expect(BALANCE_PROMPT).toMatch(/value/);
  });
});
