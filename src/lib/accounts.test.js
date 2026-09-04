import { describe, it, expect } from 'vitest';
import { resolveAccountRef } from './accounts.js';
const A = [
  { bank: 'Activobank', type: 'Conta a Ordem', category: 'Liquidez', custom: true, acctKey: 'a1' },
  { bank: 'Trade Republic', type: 'Poupanca', category: 'Poupanca', custom: true, acctKey: 'a2' },
  { bank: 'Revolut', type: 'Cartão de Crédito', category: 'Cartão de crédito', custom: true, acctKey: 'cc' },
  { bank: 'Revolut', type: 'Conta a Ordem', category: 'Liquidez', custom: false, acctKey: 'Revolut_Conta a Ordem' },
];
describe('resolveAccountRef', () => {
  it('nome do banco, sem acentos nem maiúsculas → rótulo canónico', () => {
    expect(resolveAccountRef('activobank', A)).toEqual({ label: 'Activobank · Conta a Ordem' });
    expect(resolveAccountRef('pago pelo ActivoBank', A)).toEqual({ label: 'Activobank · Conta a Ordem' });
  });
  it('nome do banco com espaço a mais (sem acentos/maiúsculas) também bate', () => {
    expect(resolveAccountRef('Activo Bank', A)).toEqual({ label: 'Activobank · Conta a Ordem' });
  });
  it('rótulo completo bate diretamente', () => {
    expect(resolveAccountRef('Revolut · Cartão de Crédito', A)).toEqual({ label: 'Revolut · Cartão de Crédito' });
    expect(resolveAccountRef('revolut cartao de credito', A)).toEqual({ label: 'Revolut · Cartão de Crédito' });
  });
  it('banco com várias contas: prefere Liquidez; se pedirem o tipo, usa-o', () => {
    expect(resolveAccountRef('Revolut', A)).toEqual({ label: 'Revolut · Conta a Ordem' });
    expect(resolveAccountRef('cartão revolut', A)).toEqual({ label: 'Revolut · Cartão de Crédito' });
  });
  it('ambíguo sem preferência → lista de opções', () => {
    const B = A.filter((a) => a.bank === 'Revolut').map((a) => ({ ...a, category: 'Outros' }));
    expect(resolveAccountRef('revolut', B)).toEqual({ ambiguous: ['Revolut · Cartão de Crédito', 'Revolut · Conta a Ordem'] });
  });
  it('sem match → null; vazio → null', () => {
    expect(resolveAccountRef('Millennium', A)).toBeNull();
    expect(resolveAccountRef('', A)).toBeNull();
    expect(resolveAccountRef(undefined, A)).toBeNull();
  });
});
