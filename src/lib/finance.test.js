import { describe, it, expect } from 'vitest';
import {
  compute,
  monthlySummary,
  isPreviewMode,
  isNewUser,
  applyRules,
  getAccts,
  emergencyFund,
  detectSubscriptions,
  chrt,
  getAcctsLive,
  netWorthSeries,
  cardUsage,
} from './finance.js';

// A date `daysAgo` days before now, as YYYY-MM-DD (for time-window tests).
function recentDate(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

/* Preview mode = no currentUser → demo seed data is used.
   Authenticated mode (currentUser truthy) → getByC/getSal return empty so the
   math becomes deterministic from the passed user slices. */

describe('mode flags', () => {
  it('isPreviewMode is true with no currentUser, false with one', () => {
    expect(isPreviewMode({})).toBe(true);
    expect(isPreviewMode({ currentUser: { uid: 'u1' } })).toBe(false);
  });

  it('isNewUser is false in preview, true for an authed user with no data', () => {
    expect(isNewUser({})).toBe(false);
    expect(
      isNewUser({
        currentUser: { uid: 'u1' },
        dynSnaps: [],
        addedExp: [],
        goals: [],
        incomes: [],
        recurring: [],
        customAccts: [],
        dynAccts: null,
      })
    ).toBe(true);
  });
});

describe('compute (preview demo data)', () => {
  const C = compute({}); // preview
  it('totals the three account categories', () => {
    expect(C.cT.Liquidez).toBeCloseTo(621.57, 2);
    expect(C.cT.Poupanca).toBeCloseTo(7055.85, 2);
    expect(C.cT.Investimentos).toBeCloseTo(16553.68, 2);
  });
  it('computes total assets and net worth against the demo loan', () => {
    expect(C.tA).toBeCloseTo(24231.1, 2);
    expect(C.nW).toBeCloseTo(24231.1 - 77555.06, 2);
  });
  it('computes loan paid-progress pp', () => {
    expect(C.pp).toBeCloseTo(((90000 - 77555.06) / 90000) * 100, 4);
  });
});

describe('getAccts (authenticated, custom accounts)', () => {
  it('maps customAccts into the account shape', () => {
    const state = {
      currentUser: { uid: 'u1' },
      dynAccts: null,
      customAccts: [
        { id: 'a1', bank: 'Revolut', type: 'Conta a Ordem', value: 1000, category: 'Liquidez', currency: 'EUR' },
      ],
    };
    const accts = getAccts(state);
    expect(accts).toHaveLength(1);
    expect(accts[0]).toMatchObject({ b: 'Revolut', t: 'Conta a Ordem', v: 1000, c: 'Liquidez', custom: true });
  });
});

describe('monthlySummary (authenticated → deterministic)', () => {
  it('sums recurring incomes + recurring expenses + addedExp for the current month', () => {
    const state = {
      currentUser: { uid: 'u1' },
      em: 3, // current month → addedExp counts
      incomes: [
        { id: 'i1', name: 'Salario', amount: 2000, recurring: true },
        { id: 'i2', name: 'Bonus', amount: 500, recurring: false, date: '2000-01-01' }, // old one-off, ignored
      ],
      recurring: [{ id: 'r1', name: 'Netflix', amount: 10 }],
      addedExp: [
        // Datas no MÊS ATUAL (robusto à passagem de mês).
        { desc: 'Pingo Doce', amount: 40, cat: 'sup', date: new Date().toISOString().slice(0, 7) + '-05' },
        { desc: 'Galp', amount: 60, cat: 'cmb', date: new Date().toISOString().slice(0, 7) + '-06' },
      ],
    };
    const s = monthlySummary(state);
    // inc = 2000 (recurring only; the old one-off is not in current month)
    expect(s.inc).toBe(2000);
    // exp = addedExp(40+60=100) + recurring(10) = 110  (getByC is {} when authed)
    expect(s.exp).toBe(110);
    expect(s.saved).toBe(2000 - 110);
    expect(s.rate).toBeCloseTo(((2000 - 110) / 2000) * 100, 6);
  });

  it('skips a recurring expense once materialised into addedExp (recId) for the month', () => {
    const now = new Date();
    const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const state = {
      currentUser: { uid: 'u1' },
      em: 3,
      incomes: [{ id: 'i1', name: 'Salario', amount: 2000, recurring: true }],
      recurring: [
        { id: 'r1', name: 'Netflix', amount: 10 },
        { id: 'r2', name: 'Spotify', amount: 8 },
      ],
      addedExp: [
        { desc: 'Pingo Doce', amount: 40, cat: 'sup', date: ym + '-01' },
        // Netflix materialised this month → must NOT be double-counted.
        { desc: 'Netflix', amount: 10, cat: 'sub', date: ym + '-05', recId: 'r1' },
      ],
    };
    const s = monthlySummary(state);
    // exp = addedExp(40+10=50) + recurring(only r2=8; r1 skipped) = 58
    expect(s.exp).toBe(58);
  });

  it('falls back to zero income when no incomes and authed (getSal is null)', () => {
    const state = { currentUser: { uid: 'u1' }, em: 3, incomes: [], recurring: [], addedExp: [] };
    const s = monthlySummary(state);
    expect(s.inc).toBe(0);
    expect(s.exp).toBe(0);
    expect(s.rate).toBe(0);
  });
});

describe('detectSubscriptions', () => {
  it('suggests a recurring-looking expense seen 2+ times in 90 days', () => {
    const state = {
      addedExp: [
        { desc: 'Netflix', amount: 10, cat: 'sub', date: recentDate(40) },
        { desc: 'Netflix', amount: 10, cat: 'sub', date: recentDate(10) },
      ],
      recurring: [],
      dismissedSubs: [],
    };
    const out = detectSubscriptions(state);
    expect(out.some((s) => s.desc === 'Netflix')).toBe(true);
  });

  it('does NOT suggest one whose long name is already in recurring (normalized match)', () => {
    const longName = 'Spotify Premium Family Plan Subscription Monthly';
    const state = {
      addedExp: [
        { desc: longName, amount: 18, cat: 'sub', date: recentDate(40) },
        { desc: longName, amount: 18, cat: 'sub', date: recentDate(10) },
      ],
      recurring: [{ id: 'r1', name: longName, amount: 18, cat: 'sub' }],
      dismissedSubs: [],
    };
    const out = detectSubscriptions(state);
    expect(out.some((s) => s.desc === longName)).toBe(false);
  });
});

describe('chrt (sparkline)', () => {
  it('keeps all points within the viewBox for negative-only data', () => {
    const html = chrt([-100, -500, -300], 'var(--success)', 'NetWorth', [], (v) => String(v));
    const ys = [...html.matchAll(/cy="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
    expect(ys.length).toBe(3);
    ys.forEach((y) => {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(56);
    });
  });
});

describe('getAcctsLive (transaction-adjusted balances)', () => {
  const base = {
    currentUser: { uid: 'u1' },
    customAccts: [
      { id: 'x1', bank: 'Wise', type: 'Conta a Ordem', value: 1000, updated: '2026.06.01', category: 'Liquidez' },
    ],
  };
  const label = 'Wise · Conta a Ordem';

  it('MANUAL expenses subtract regardless of date; one-off incomes add; recurring ignored', () => {
    const state = {
      ...base,
      addedExp: [
        { id: 'e1', desc: 'Compra', amount: 50, cat: 'sup', date: '2026-06-10', acct: label },
        { id: 'e2', desc: 'Antiga', amount: 30, cat: 'sup', date: '2026-05-20', acct: label }, // before reading → STILL subtracts (manual)
        { id: 'e3', desc: 'Outra conta', amount: 99, cat: 'sup', date: '2026-06-12', acct: 'Banco X · Conta' }, // other acct → ignored
      ],
      incomes: [
        { id: 'i1', name: 'Extra', amount: 200, recurring: false, date: '2026-06-15', acct: label },
        { id: 'i2', name: 'Salário', amount: 3000, recurring: true, acct: label }, // recurring → ignored
      ],
    };
    const acc = getAcctsLive(state).find((a) => a.b === 'Wise');
    expect(acc.v).toBe(1000 - 50 - 30 + 200); // 1120
  });

  it('IMPORTED transactions (extrato/IA) do NOT move the balance', () => {
    const state = {
      ...base,
      addedExp: [
        { id: 'e1', desc: 'Manual', amount: 50, cat: 'sup', date: '2026-06-10', acct: label },
        { id: 'e2', desc: 'Do extrato', amount: 200, cat: 'sup', date: '2026-06-11', acct: label, imported: true },
      ],
      incomes: [],
    };
    const acc = getAcctsLive(state).find((a) => a.b === 'Wise');
    expect(acc.v).toBe(950); // only the manual 50 subtracts; the imported 200 is ignored
  });

  it('does NOT subtract a SETTLED manual expense (rebaselined into a reading)', () => {
    const state = {
      ...base,
      addedExp: [
        { id: 'e1', desc: 'Nova', amount: 30, cat: 'sup', date: '2026-06-10', acct: label },
        { id: 'e2', desc: 'Saldada', amount: 50, cat: 'sup', date: '2026-06-09', acct: label, settled: true },
      ],
      incomes: [],
    };
    const acc = getAcctsLive(state).find((a) => a.b === 'Wise');
    expect(acc.v).toBe(970); // only the unsettled 30 subtracts
  });

  it('subtracts from a TEMPLATE account tracked via dynAccts (real-world case)', () => {
    const state = {
      currentUser: { uid: 'u1' },
      dynAccts: { 'Activobank_Conta a Ordem': { v: 1000, d: '2026.06.13', n: null } },
      addedExp: [
        { id: 'e1', desc: 'Compra', amount: 50, cat: 'sup', date: '2026-06-20', acct: 'Activobank · Conta a Ordem' },
      ],
      incomes: [],
    };
    const acc = getAcctsLive(state).find((a) => a.b === 'Activobank');
    expect(acc).toBeTruthy();
    expect(acc.v).toBe(950);
  });

  it('matches the account label tolerating accents (Conta à Ordem vs Conta a Ordem)', () => {
    const state = {
      currentUser: { uid: 'u1' },
      dynAccts: { 'Activobank_Conta a Ordem': { v: 1000, d: '2026.06.13', n: null } },
      addedExp: [{ id: 'e1', desc: 'X', amount: 40, cat: 'sup', date: '2026-06-20', acct: 'Activobank · Conta à Ordem' }],
      incomes: [],
    };
    const acc = getAcctsLive(state).find((a) => a.b === 'Activobank');
    expect(acc.v).toBe(960);
  });

  it('TRANSFER moves money between accounts: from −, to +; total unchanged; settled sides ignored', () => {
    const state = {
      currentUser: { uid: 'u1' },
      customAccts: [
        { id: 'a', bank: 'Wise', type: 'Conta a Ordem', value: 1000, updated: '2026.06.01', category: 'Liquidez' },
        { id: 'b', bank: 'Revolut', type: 'Conta a Ordem', value: 200, updated: '2026.06.01', category: 'Liquidez' },
      ],
      addedExp: [],
      incomes: [],
      transfers: [
        { id: 't1', from: 'Wise · Conta a Ordem', to: 'Revolut · Conta a Ordem', amount: 300, date: '2026-06-10' },
        { id: 't2', from: 'Wise · Conta a Ordem', to: 'Revolut · Conta a Ordem', amount: 100, date: '2026-06-11', settledFrom: true }, // origem já saldada → não desconta de novo; destino ainda soma
      ],
    };
    const wise = getAcctsLive(state).find((a) => a.b === 'Wise');
    const rev = getAcctsLive(state).find((a) => a.b === 'Revolut');
    expect(wise.v).toBe(1000 - 300); // t2.from settled → só t1 desconta
    expect(rev.v).toBe(200 + 300 + 100); // ambos os lados de destino somam
  });
});

describe('cartão de crédito', () => {
  const base = {
    currentUser: { uid: 'u1' },
    customAccts: [
      { id: 'ch', bank: 'Activobank', type: 'Conta a Ordem', value: 1000, category: 'Liquidez' },
      { id: 'cc', bank: 'Revolut', type: 'Cartão de Crédito', value: 0, category: 'Cartão de crédito', plafond: 2000 },
    ],
  };
  const cardLabel = 'Revolut · Cartão de Crédito';
  const chLabel = 'Activobank · Conta a Ordem';

  it('cardUsage: used = despesas − pagamentos', () => {
    const state = {
      ...base,
      addedExp: [
        { id: 'e1', desc: 'Amazon', amount: 120, cat: 'out', date: '2026-07-02', acct: cardLabel },
        { id: 'e2', desc: 'Netflix', amount: 30, cat: 'sub', date: '2026-07-05', acct: cardLabel },
        { id: 'e3', desc: 'Café', amount: 5, cat: 'rest', date: '2026-07-06', acct: chLabel }, // outra conta
      ],
      transfers: [{ id: 't1', from: chLabel, to: cardLabel, amount: 50, date: '2026-07-10' }], // pagamento
    };
    const u = cardUsage(state, cardLabel);
    expect(u.spent).toBe(150);
    expect(u.paid).toBe(50);
    expect(u.used).toBe(100);
  });

  it('getAcctsLive: cartão mostra dívida em negativo; despesa do cartão NÃO desconta da conta à ordem', () => {
    const state = {
      ...base,
      addedExp: [{ id: 'e1', desc: 'Amazon', amount: 120, cat: 'out', date: '2026-07-02', acct: cardLabel }],
      transfers: [{ id: 't1', from: chLabel, to: cardLabel, amount: 20, date: '2026-07-10' }],
    };
    const live = getAcctsLive(state);
    const card = live.find((a) => a.t === 'Cartão de Crédito');
    const ch = live.find((a) => a.t === 'Conta a Ordem');
    expect(card.used).toBe(100); // 120 − 20
    expect(card.v).toBe(-100); // dívida em negativo (reduz património)
    expect(card.plafond).toBe(2000);
    // conta à ordem: despesa no CARTÃO não a toca; só o pagamento (−20) desce
    expect(ch.v).toBe(1000 - 20);
  });

  it('pagar tudo zera a dívida', () => {
    const state = {
      ...base,
      addedExp: [{ id: 'e1', desc: 'X', amount: 100, cat: 'out', date: '2026-07-02', acct: cardLabel }],
      transfers: [{ id: 't1', from: chLabel, to: cardLabel, amount: 100, date: '2026-07-10' }],
    };
    const card = getAcctsLive(state).find((a) => a.t === 'Cartão de Crédito');
    expect(card.used).toBe(0);
    expect(card.v).toBe(0);
  });
});

describe('netWorthSeries', () => {
  it('net = ativos − dívida por snapshot', () => {
    const state = {
      currentUser: { uid: 'u1' },
      dynSnaps: [
        { l: 'mai', liq: 100, poup: 50, inv: 200, div: 80 },
        { l: 'jun', liq: 120, poup: 50, inv: 230, div: 70 },
      ],
    };
    const s = netWorthSeries(state);
    expect(s[0]).toEqual({ label: 'mai', assets: 350, debt: 80, net: 270 });
    expect(s[1].net).toBe(400 - 70);
  });
});

describe('applyRules', () => {
  it('returns the cat of the first rule whose pattern is a substring (case-insensitive)', () => {
    const state = {
      rules: [
        { id: 'r1', pattern: 'pingo', cat: 'sup' },
        { id: 'r2', pattern: 'galp', cat: 'cmb' },
      ],
    };
    expect(applyRules(state, 'PINGO DOCE LISBOA')).toBe('sup');
    expect(applyRules(state, 'Galp Combustivel')).toBe('cmb');
    expect(applyRules(state, 'Desconhecido')).toBe(null);
  });
  it('returns null with no rules or empty desc', () => {
    expect(applyRules({ rules: [] }, 'x')).toBe(null);
    expect(applyRules({ rules: [{ pattern: 'a', cat: 'x' }] }, '')).toBe(null);
  });
});

describe('emergencyFund (authenticated)', () => {
  it('counts only Liquidez + Poupanca toward the safe balance', () => {
    const state = {
      currentUser: { uid: 'u1' },
      recurring: [{ amount: 100 }],
      customAccts: [
        { id: 'a', bank: 'X', type: 'Conta a Ordem', value: 3000, category: 'Liquidez' },
        { id: 'b', bank: 'Y', type: 'Poupanca', value: 3000, category: 'Poupanca' },
        { id: 'c', bank: 'Z', type: 'Corretagem', value: 9999, category: 'Investimentos' }, // excluded
      ],
    };
    const ef = emergencyFund(state);
    expect(ef.safe).toBe(6000);
    // avgMonthly = max(avgNonRec(0 when authed), recurring(100) + loanPay(0) + 300) = 400
    expect(ef.avgMonthly).toBe(400);
    expect(ef.months).toBeCloseTo(6000 / 400, 6);
  });
});
