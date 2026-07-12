import { describe, it, expect } from 'vitest';
import { normBankDate, parseBankAmount, cleanBankDesc, isTransferDesc, parseBankStatement, bankExpenseCandidates } from './importBank.js';

describe('helpers', () => {
  it('data DD/MM/YYYY → ISO', () => expect(normBankDate('01/07/2026')).toBe('2026-07-01'));
  it('valor US "1,036.54" → 1036.54', () => expect(parseBankAmount('1,036.54')).toBe(1036.54));
  it('valor negativo', () => expect(parseBankAmount('-15.00')).toBe(-15));
  it('limpa descrição de compra', () => expect(cleanBankDesc('COMPRA 4174 PARE E PROVE 2560-232 T CONTACTLESS')).toBe('PARE E PROVE 2560-232'));
  it('deteta transferência', () => {
    expect(isTransferDesc('TRF P/ Trade Republic')).toBe(true);
    expect(isTransferDesc('IKEA ALFRAGIDE')).toBe(false);
  });
});

const ROWS = [
  ['HISTÓRICO DE CONTA NÚMERO 45588780323', '', '', '', ''],
  ['Moeda:', 'EUR', '', '', ''],
  ['', '', '', '', ''],
  ['Data Lanc.', 'Data Valor', 'Descrição', 'Valor', 'Saldo'],
  ['01/07/2026', '01/07/2026', 'COMPRA 4174 PARE E PROVE 2560-232 T CONTACTLESS', '-15.00', '1,036.54'],
  ['01/07/2026', '01/07/2026', 'TRF P/ Trade Republic', '-526.54', '510.00'],
  ['02/07/2026', '02/07/2026', 'TRF. P/O MANUEL MARRAO', '689.00', '1,039.16'],
  ['03/07/2026', '03/07/2026', 'COMPRA 4174 IKEA ALFRAGIDE IKEA FOO CONTACTLESS', '-9.45', '916.15'],
];

describe('parseBankStatement (ActivoBank)', () => {
  it('deteta header e parseia transações', () => {
    const p = parseBankStatement(ROWS);
    expect(p.header).toBe(true);
    expect(p.txns.length).toBe(4); // 3 débitos + 1 crédito
    expect(p.txns[0]).toMatchObject({ date: '2026-07-01', desc: 'PARE E PROVE 2560-232', amount: -15, isTransfer: false });
    expect(p.txns[1].isTransfer).toBe(true);
  });
  it('candidatos a despesa = só débitos, valor absoluto, imported', () => {
    const exp = bankExpenseCandidates(parseBankStatement(ROWS));
    expect(exp.length).toBe(3); // exclui o crédito (+689)
    expect(exp.every((e) => e.amount > 0 && e.imported)).toBe(true);
    expect(exp.find((e) => e.desc.includes('Trade Republic')).isTransfer).toBe(true);
  });
});
