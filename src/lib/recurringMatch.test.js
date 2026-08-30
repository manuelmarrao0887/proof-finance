import { describe, it, expect } from 'vitest';
import { matchRecurring, tagRecurringMatches } from './recurringMatch.js';

// Recorrentes tal como o utilizador as escreve no RecModal (nome curto).
const RECS = [
  { id: 'r-vod', name: 'Vodafone', amount: 57.88, day: 2, cat: 'tel' },
  { id: 'r-mgen', name: 'MGEN', amount: 67.0, day: 8, cat: 'seg' },
  { id: 'r-ctk', name: 'Cartrack', amount: 13.53, day: 8, cat: 'car' },
  { id: 'r-med', name: 'Medis', amount: 10.9, day: 15, cat: 'sau' },
  { id: 'r-gym', name: 'Ginásio', amount: 35.9, day: 5, cat: 'gym' },
];

describe('matchRecurring — descritivos reais do ActivoBank', () => {
  it('liga o descritivo do banco à recorrente pelo nome + valor', () => {
    // cleanBankDesc já tirou o prefixo "DD ".
    const t = { desc: 'VODAFONE PORTU 07973636083 PT10100825', amount: -57.88, date: '2026-01-02' };
    expect(matchRecurring(RECS, t)).toBe('r-vod');
  });

  it('tolera variação de valor mês a mês (conta de telemóvel)', () => {
    const t = { desc: 'VODAFONE PORTU 07973636083 PT10100825', amount: -59.42, date: '2026-02-02' };
    expect(matchRecurring(RECS, t)).toBe('r-vod');
  });

  it('ignora acentos e maiúsculas', () => {
    const t = { desc: 'GINASIO SOLINCA LISBOA', amount: -35.9, date: '2026-03-05' };
    expect(matchRecurring(RECS, t)).toBe('r-gym');
  });

  it('usa o descritivo bruto quando o limpo já não tem o nome', () => {
    const t = { desc: 'P0001100069353 PT45109798', raw: 'DD MGEN P0001100069353 PT45109798', amount: -67, date: '2026-04-08' };
    expect(matchRecurring(RECS, t)).toBe('r-mgen');
  });

  it('nome igual mas valor muito diferente → não liga (compra pontual na Vodafone)', () => {
    const t = { desc: 'VODAFONE LOJA COLOMBO', amount: -299.0, date: '2026-05-11' };
    expect(matchRecurring(RECS, t)).toBeNull();
  });

  it('valor igual mas beneficiário diferente → não liga', () => {
    const t = { desc: 'PINGO DOCE TELHEIRAS LI', amount: -57.88, date: '2026-01-05' };
    expect(matchRecurring(RECS, t)).toBeNull();
  });

  it('exige fronteira de palavra — não apanha o nome no meio de outra palavra', () => {
    const recs = [{ id: 'r-tv', name: 'TV', amount: 20, day: 1, cat: 'sub' }];
    // "MOTV" contém mesmo "tv" — se o match fosse substring simples, ligava.
    expect(matchRecurring(recs, { desc: 'MOTV MOTORES LDA', amount: -20, date: '2026-01-04' })).toBeNull();
    expect(matchRecurring(recs, { desc: 'TV CABO PORTUGAL', amount: -20, date: '2026-01-04' })).toBe('r-tv');
  });

  it('créditos nunca ligam a uma recorrente (uma recorrente é despesa)', () => {
    const t = { desc: 'VODAFONE PORTU REEMBOLSO', amount: 57.88, date: '2026-01-02' };
    expect(matchRecurring(RECS, t)).toBeNull();
  });

  it('lista vazia ou entradas inválidas não rebentam', () => {
    expect(matchRecurring([], { desc: 'X', amount: -1, date: '2026-01-01' })).toBeNull();
    expect(matchRecurring(null, { desc: 'X', amount: -1, date: '2026-01-01' })).toBeNull();
    expect(matchRecurring(RECS, null)).toBeNull();
    expect(matchRecurring([{ id: 'r', name: '', amount: 0 }], { desc: '', amount: -1, date: '2026-01-01' })).toBeNull();
  });

  it('entre duas recorrentes com o mesmo nome escolhe a do valor mais próximo', () => {
    const recs = [
      { id: 'r-a', name: 'Apple', amount: 0.99, day: 13, cat: 'sub' },
      { id: 'r-b', name: 'Apple', amount: 9.99, day: 13, cat: 'sub' },
    ];
    expect(matchRecurring(recs, { desc: 'APPLE.COM BILL CORK', amount: -9.99, date: '2026-01-13' })).toBe('r-b');
  });
});

describe('tagRecurringMatches — uma materialização por recorrente e por mês', () => {
  const rows = [
    { _id: '1', desc: 'VODAFONE PORTU 079', amount: -57.88, date: '2026-01-02', _type: 'expense' },
    { _id: '2', desc: 'PINGO DOCE TELHEIRAS', amount: -84.21, date: '2026-01-05', _type: 'expense' },
    { _id: '3', desc: 'VODAFONE PORTU 079', amount: -59.1, date: '2026-02-02', _type: 'expense' },
    { _id: '4', desc: 'CARTRACK PORTU 256', amount: -13.53, date: '2026-02-08', _type: 'expense' },
  ];

  it('marca cada linha que bate certo com o id da recorrente', () => {
    const out = tagRecurringMatches(rows, RECS);
    expect(out.map((r) => r._recId)).toEqual(['r-vod', null, 'r-vod', 'r-ctk']);
  });

  it('não muta a lista original', () => {
    const snapshot = JSON.stringify(rows);
    tagRecurringMatches(rows, RECS);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('duas linhas da mesma recorrente no mesmo mês → só a mais próxima do valor fica ligada', () => {
    const dup = [
      { _id: 'a', desc: 'VODAFONE PORTU', amount: -57.88, date: '2026-01-02', _type: 'expense' },
      { _id: 'b', desc: 'VODAFONE PORTU', amount: -62.0, date: '2026-01-20', _type: 'expense' },
    ];
    const out = tagRecurringMatches(dup, RECS);
    expect(out[0]._recId).toBe('r-vod');
    expect(out[1]._recId).toBeNull();
  });

  it('linhas que não são despesa (transferência/receita) nunca são ligadas', () => {
    const mixed = [
      { _id: 'a', desc: 'VODAFONE PORTU', amount: -57.88, date: '2026-01-02', _type: 'transfer' },
      { _id: 'b', desc: 'VODAFONE PORTU', amount: -57.88, date: '2026-02-02', _type: 'income' },
    ];
    const out = tagRecurringMatches(mixed, RECS);
    expect(out.map((r) => r._recId)).toEqual([null, null]);
  });

  it('sem recorrentes devolve tudo a null', () => {
    expect(tagRecurringMatches(rows, []).every((r) => r._recId === null)).toBe(true);
  });

  it('entradas inválidas devolvem lista vazia', () => {
    expect(tagRecurringMatches(null, RECS)).toEqual([]);
  });
});
