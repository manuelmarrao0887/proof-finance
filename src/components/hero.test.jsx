/* ════════════════════════════════════════════════════════════════════════
   Hero.test — o cartão "Património Liquido" no topo do Resumo tem de
   respeitar state.balancesHidden: mascarar os MONTANTES (o número grande e
   a linha "Ativos … · Dívida …"), o chip de variação (%, via maskPct) e o
   sparkline (que deixa de ser desenhado) — o modo "saldos ocultos" esconde
   qualquer sinal, incluindo tendência, em toda a app (ver Task 2).

   Fixture com valores facilmente reconhecíveis e todos DIFERENTES entre si,
   para as asserções de ausência/presença não poderem colidir por acaso:
     - conta corrente 12 345 € (Liquidez)
     - cartão de crédito com 500 € de dívida (despesa alocada ao cartão)
     → C.nW = 11 845 €, C.gross = 12 345 €, C.debt = 500 €  (ver compute()
       em lib/finance.js: nW = tA − loan.out; gross exclui CARD_CAT; debt =
       cardDebt + loan.out)
     - dois snapshots em dynSnaps para o sparkline ter >1 ponto (Hero só o
       desenha quando C.hist.length > 1).
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { initialPersisted } from '../store/store.jsx';
import { compute } from '../lib/finance.js';
import { fm, fc } from '../lib/format.js';
import Hero from './Hero.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

function fixture() {
  return {
    customAccts: [
      { id: 'a1', bank: 'Banco Teste', type: 'Conta Corrente', value: 12345, category: 'Liquidez', currency: 'EUR' },
      { id: 'cc1', bank: 'Cartão Teste', type: 'Crédito', value: 0, category: 'Cartão de crédito', plafond: 1000, currency: 'EUR' },
    ],
    addedExp: [
      { id: 'e1', desc: 'Compra grande', amount: 500, cat: 'comp', date: '2026-08-01', acct: 'Cartão Teste · Crédito' },
    ],
    dynSnaps: [
      { l: '2026-06', liq: 9000, poup: 0, inv: 0, div: 0, xP: 0, xT: 0, tC: 0 },
      { l: '2026-07', liq: 11845, poup: 0, inv: 0, div: 0, xP: 0, xT: 0, tC: 0 },
    ],
  };
}

// Replica o cálculo do chip de variação feito em Hero.jsx — heroPct não é
// devolvido por compute(), por isso a única forma de afirmar o texto exato
// (em vez de adivinhar/copiar um valor à mão) é repetir a mesma fórmula
// sobre o mesmo C.
function expectedHeroPct(s) {
  const C = compute(s);
  const lastH = C.hist[C.hist.length - 1] || { liq: 0, poup: 0, inv: 0, div: 0 };
  const baseNW = lastH.liq + lastH.poup + lastH.inv - C.aD || 1;
  return (
    (C.aD >= 0 ? '+' : '') +
    (C.tA > 0 ? ((C.aD / Math.abs(baseNW)) * 100).toFixed(1) : '0') +
    '%'
  );
}

function buildState(fx) {
  return { ...initialPersisted(), ...fx, currentUser: { uid: 'test-user', email: 'test@example.com' } };
}

describe('Hero — respeita balancesHidden', () => {
  it('a fixture produz os valores esperados (auto-verificação, não adivinhados)', () => {
    const s = buildState(fixture());
    const C = compute(s);
    expect(C.nW).toBe(11845);
    expect(C.gross).toBe(12345);
    expect(C.debt).toBe(500);
    expect(C.hist.length).toBeGreaterThan(1);
  });

  it('balancesHidden:true — oculta o número, Ativos/Dívida, % e sparkline', async () => {
    const fx = fixture();
    const s = buildState(fx);
    const C = compute(s);

    const { container } = await renderWithStore(<Hero />, {
      fixture: { ...fx, balancesHidden: true },
    });

    // Montantes: ausentes.
    expect(container.textContent).not.toContain(fm(C.nW));
    expect(container.textContent).not.toContain(fc(C.gross));
    expect(container.textContent).not.toContain(fc(C.debt));
    expect(container.textContent).toContain('••••');

    // Tendência: mascarada — o modo "saldos ocultos" não deixa nenhum sinal
    // visível, nem a variação percentual (Task 2 — maskPct).
    expect(container.textContent).not.toContain(expectedHeroPct(s));
    expect(container.textContent).toContain('••%');

    // Sparkline: não desenhado — mesmo normalizado, é um sinal a esconder.
    // Seletor específico: a própria Hero tem outro <polyline> (a seta do
    // chip de variação), que fica sempre visível — 'svg polyline' sozinho
    // apanhava esse e mascarava um falso-positivo.
    const polyline = container.querySelector('svg[viewBox="0 0 100 28"] polyline');
    expect(polyline).toBeNull();
  });

  it('balancesHidden:false — mostra o número, Ativos/Dívida, % e sparkline', async () => {
    const fx = fixture();
    const s = buildState(fx);
    const C = compute(s);

    const { container } = await renderWithStore(<Hero />, {
      fixture: { ...fx, balancesHidden: false },
    });

    // Montantes: presentes (comportamento inalterado quando visível).
    expect(container.textContent).toContain(fm(C.nW));
    expect(container.textContent).toContain(fc(C.gross));
    expect(container.textContent).toContain(fc(C.debt));
    expect(container.textContent).not.toContain('••••');

    // Tendência: presente.
    expect(container.textContent).toContain(expectedHeroPct(s));

    // Sparkline: presente.
    // Seletor específico: a própria Hero tem outro <polyline> (a seta do
    // chip de variação), que fica sempre visível — 'svg polyline' sozinho
    // apanhava esse e mascarava um falso-positivo.
    const polyline = container.querySelector('svg[viewBox="0 0 100 28"] polyline');
    expect(polyline).not.toBeNull();
    expect(polyline.getAttribute('points')).not.toBe('');
  });
});
