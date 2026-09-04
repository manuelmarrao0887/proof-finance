/* Estado realista de um utilizador com dados em TODAS as áreas da app —
   o objetivo é que cada view tenha algo para mostrar (cartões, transferências,
   fiscal, metas em risco, anomalias, histórico de 6 meses…). Datas relativas
   ao mês corrente para os cálculos "deste mês" funcionarem em qualquer dia. */

const now = new Date();
const ym = (off) => {
  const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
const day = (off, dd) => ym(off) + '-' + String(dd).padStart(2, '0');
const today = ym(0) + '-' + String(Math.max(1, Math.min(now.getDate(), 28))).padStart(2, '0');

export const CHECKING = 'Activobank · Conta a Ordem';
export const SAVINGS = 'Trade Republic · Poupanca';
export const CARD = 'Revolut · Cartão de Crédito';

export function richFixture() {
  const addedExp = [];
  // 6 meses de histórico em várias categorias (+ mês corrente)
  for (let off = -6; off <= 0; off++) {
    addedExp.push(
      { id: 'r' + off, desc: 'COMPRA 4174 PINGO DOCE LISBOA', amount: 45.2, cat: 'sup', date: day(off, 3), acct: CHECKING, imported: true },
      { id: 'c' + off, desc: 'CAFE DO PONTO', amount: 3.5, cat: 'rest', date: day(off, 5), acct: CHECKING, imported: true },
      { id: 'c2' + off, desc: 'CAFE DO PONTO', amount: 3.5, cat: 'rest', date: day(off, 12), acct: CHECKING, imported: true },
      { id: 'u' + off, desc: 'UBER EATS', amount: 24.9, cat: 'rest', date: day(off, 8), acct: CHECKING, imported: true },
      { id: 'g' + off, desc: 'Ginásio', amount: 35.9, cat: 'gym', date: day(off, 6), recId: 'rec-gym' },
      { id: 'h' + off, desc: 'Hospital da Luz', amount: 60, cat: 'sau', date: day(off, 15), acct: CHECKING },
      { id: 'k' + off, desc: 'IKEA', amount: 80, cat: 'comp', date: day(off, 20), acct: CARD }
    );
  }
  // anomalias no mês corrente: cobrança repetida + valor fora do padrão
  addedExp.push(
    { id: 'dup1', desc: 'Netflix', amount: 10.99, cat: 'sub', date: day(0, 1), acct: CARD },
    { id: 'dup2', desc: 'Netflix', amount: 10.99, cat: 'sub', date: day(0, 2), acct: CARD },
    { id: 'out1', desc: 'COMPRA 4174 PINGO DOCE LISBOA', amount: 400, cat: 'sup', date: today, acct: CHECKING }
  );
  return {
    customAccts: [
      { id: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 2500, category: 'Liquidez', currency: 'EUR', updated: '2026.07.01' },
      { id: 'a2', bank: 'Trade Republic', type: 'Poupanca', value: 8000, category: 'Poupanca', currency: 'EUR' },
      { id: 'a3', bank: 'XTB', type: 'Corretagem', value: 5000, category: 'Investimentos', currency: 'EUR' },
      { id: 'cc', bank: 'Revolut', type: 'Cartão de Crédito', value: 0, category: 'Cartão de crédito', plafond: 1500, currency: 'EUR' },
    ],
    addedExp,
    incomes: [
      { id: 'sal', name: 'Salário', amount: 1900, source: 'salary', recurring: false, date: day(0, 1), acct: CHECKING },
      { id: 'sal-1', name: 'Salário', amount: 1900, source: 'salary', recurring: false, date: day(-1, 1), acct: CHECKING },
      { id: 'rec-inc', name: 'Renda recebida', amount: 300, source: 'other', recurring: true, day: 5 },
    ],
    recurring: [
      { id: 'rec-gym', name: 'Ginásio', amount: 35.9, day: 6, cat: 'gym' },
      { id: 'rec-net', name: 'Internet', amount: 39.9, day: 28, cat: 'tel' },
    ],
    goals: [
      { id: 'g1', name: 'Férias', target: 3000, current: 800, deadline: ym(3) + '-01', monthly: 100, color: '#3b6fee' },
      { id: 'g2', name: 'Fundo emergência', target: 6000, current: 5900, monthly: 200, color: '#3fc97a' },
    ],
    transfers: [
      { id: 't1', from: CHECKING, to: SAVINGS, amount: 300, date: day(0, 2), note: 'reforço' },
      { id: 't2', from: CHECKING, to: CARD, amount: 120, date: day(0, 4), note: 'pagamento fatura', cardPayment: true },
    ],
    positions: [
      { id: 'p1', broker: 'XTB', asset: 'VWCE', qty: 20, avgPrice: 100, currentPrice: 110 },
      { id: 'p2', broker: 'XTB', asset: 'AAPL', qty: 5, avgPrice: 200, currentPrice: 150 },
      { id: 'p3', broker: 'XTB', asset: 'MSFT', qty: 2, avgPrice: 300, currentPrice: 310 },
    ],
    people: [
      { id: 'p-ana', name: 'Ana', color: '#12b3a6', createdAt: 1 },
      { id: 'p-joao', name: 'João', color: '#f5a623', createdAt: 2 },
    ],
    groups: [
      {
        id: 'g-ferias', name: 'Férias Algarve', emoji: '🏖️', type: 'trip', currency: 'EUR',
        memberIds: ['me', 'p-ana', 'p-joao'], start: '2026-08-12', end: '2026-08-19',
        reflectMine: true, archived: false, createdAt: 3,
      },
    ],
    groupEntries: [
      {
        id: 'ge-1', groupId: 'g-ferias', kind: 'expense', desc: 'Airbnb', amount: 300,
        date: '2026-08-12', payerId: 'me', splitMode: 'equal', gcat: 'stay', reflect: true,
        shares: [
          { personId: 'me', amount: 100 }, { personId: 'p-ana', amount: 100 }, { personId: 'p-joao', amount: 100 },
        ],
        linkedExpId: null, createdAt: 4,
      },
      {
        id: 'ge-2', groupId: 'g-ferias', kind: 'settlement', fromId: 'p-ana', toId: 'me',
        amount: 50, date: '2026-08-18', method: 'mbway', createdAt: 5,
      },
    ],
    rules: [{ id: 'rule1', pattern: 'pingo doce', cat: 'sup', createdAt: 1 }],
    balanceLog: [
      { id: 'b1', acctKey: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 2400, date: day(-1, 15), createdAt: 1 },
      { id: 'b2', acctKey: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 2500, date: day(0, 1), createdAt: 2 },
    ],
    dynSnaps: [
      { l: 'Jan', liq: 2000, poup: 7000, inv: 4000, div: 0, xP: 0, xT: 0, tC: 0 },
      { l: 'Fev', liq: 2300, poup: 7500, inv: 4500, div: 0, xP: 0, xT: 0, tC: 0 },
    ],
    taxCfg: { imiAmount: 320, iucMonths: [3], couple: false, irs: true },
    housing: { valorAquisicao: 200000, valorEmprestimo: 150000, taxa: 3, prazoAnos: 30 },
    rolloverOn: true,
    theme: 'light',
    lastSeenPatchVersion: 999, // não abrir as Novidades por cima nos testes/screenshots
  };
}

export function emptyFixture() {
  return { lastSeenPatchVersion: 999 }; // não abrir as Novidades por cima nos testes/screenshots
}
