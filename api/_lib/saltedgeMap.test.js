import { describe, it, expect } from 'vitest';
import { mapSaltedgeAccountToCustomAcct, mapSaltedgeTransaction } from './saltedgeMap.js';

describe('mapSaltedgeAccountToCustomAcct', () => {
  it('conta corrente comum vira Conta a Ordem / Liquidez', () => {
    const acc = { id: 'a1', nature: 'account', balance: 1234.5, currency_code: 'EUR' };
    const out = mapSaltedgeAccountToCustomAcct(acc, 'ActivoBank');
    expect(out).toMatchObject({ bank: 'ActivoBank', type: 'Conta a Ordem', category: 'Liquidez', value: 1234.5, custom: true, linkedBank: true, saltedgeAccountId: 'a1' });
  });

  it('poupança vira Poupanca', () => {
    const acc = { id: 'a2', nature: 'savings', balance: 5000 };
    const out = mapSaltedgeAccountToCustomAcct(acc, 'Trade Republic');
    expect(out.type).toBe('Poupanca');
    expect(out.category).toBe('Poupanca');
  });

  it('cartão de crédito usa o mesmo rótulo exato do resto da app, com plafond', () => {
    const acc = { id: 'a3', nature: 'credit_card', balance: -120, extra: { credit_limit: 2000 } };
    const out = mapSaltedgeAccountToCustomAcct(acc, 'Revolut');
    expect(out.type).toBe('Cartão de Crédito');
    expect(out.category).toBe('Cartão de crédito');
    expect(out.plafond).toBe(2000);
  });
});

describe('mapSaltedgeTransaction', () => {
  it('valor negativo é despesa', () => {
    const m = mapSaltedgeTransaction({ id: 't1', amount: -15.5, made_on: '2026-09-05', description: 'PINGO DOCE' });
    expect(m).toMatchObject({ desc: 'PINGO DOCE', amount: -15.5, date: '2026-09-05', isIncome: false, saltedgeTxId: 't1' });
  });

  it('valor positivo é receita', () => {
    const m = mapSaltedgeTransaction({ id: 't2', amount: 1900, made_on: '2026-09-01', description: 'ORDENADO' });
    expect(m.isIncome).toBe(true);
    expect(m.amount).toBe(1900);
  });

  it('sem descrição, usa um rótulo neutro em vez de string vazia', () => {
    const m = mapSaltedgeTransaction({ id: 't3', amount: -5, made_on: '2026-09-05', description: '' });
    expect(m.desc).toBe('Movimento');
  });
});
