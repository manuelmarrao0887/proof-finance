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
        { desc: 'Pingo Doce', amount: 40, cat: 'sup', date: '2026-06-01' },
        { desc: 'Galp', amount: 60, cat: 'cmb', date: '2026-06-02' },
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

  it('subtracts expenses and adds one-off incomes dated after the reading', () => {
    const state = {
      ...base,
      addedExp: [
        { id: 'e1', desc: 'Compra', amount: 50, cat: 'sup', date: '2026-06-10', acct: label },
        { id: 'e2', desc: 'Antiga', amount: 30, cat: 'sup', date: '2026-05-20', acct: label }, // before base → ignored
        { id: 'e3', desc: 'Outra conta', amount: 99, cat: 'sup', date: '2026-06-12', acct: 'Banco X · Conta' }, // other acct
      ],
      incomes: [
        { id: 'i1', name: 'Extra', amount: 200, recurring: false, date: '2026-06-15', acct: label },
        { id: 'i2', name: 'Salário', amount: 3000, recurring: true, acct: label }, // recurring → ignored
      ],
    };
    const acc = getAcctsLive(state).find((a) => a.b === 'Wise');
    expect(acc.v).toBe(1000 - 50 + 200); // 1150
  });

  it('leaves an account untouched when it has no base reading date', () => {
    const state = {
      currentUser: { uid: 'u1' },
      customAccts: [{ id: 'x9', bank: 'Novo', type: 'Conta', value: 500, category: 'Liquidez' }], // no `updated`
      addedExp: [{ id: 'e1', desc: 'X', amount: 50, cat: 'sup', date: '2026-06-10', acct: 'Novo · Conta' }],
      incomes: [],
    };
    const acc = getAcctsLive(state).find((a) => a.b === 'Novo');
    expect(acc.v).toBe(500);
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
