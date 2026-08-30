/* ════════════════════════════════════════════════════════════════════════
   strictMode.store — contrato de pureza dos atualizadores funcionais.

   store.jsx documenta (linhas 289-303, 449-460) que `setField`/`patch`
   adiantam sincronamente `stateRef.current` E despacham para o reducer, e que
   isso só converge — dá o MESMO resultado nos dois lados — se o atualizador
   funcional passado (`(prev) => [...prev, x]`, por exemplo) for PURO: sem
   gerar ids, sem Date.now(), e acima de tudo sem MUTAR `prev` em vez de
   devolver um array novo.

   Nada impunha esse contrato em CI: main.jsx (App real) monta dentro de
   <React.StrictMode>, mas renderWithStore só embrulhava em <StoreProvider> —
   um atualizador impuro passava despercebido nos testes e só se revelaria em
   produção (dev build) da pior forma: um registo duplicado.

   Em <React.StrictMode> (dev only), o React invoca a função reducer duas
   vezes por dispatch para apanhar reducers impuros, descartando o resultado
   da 1.ª chamada. `setField` já chama o atualizador uma 3.ª vez, síncrona,
   fora do reducer (o "adiantamento"). Um atualizador PURO devolve sempre o
   mesmo array NOVO nas três chamadas — o resultado converge. Um atualizador
   IMPURO que faça `prev.push(x); return prev` muta o MESMO array de
   referência em cada uma das três chamadas (fast-forward e as duas do
   reducer partilham o array anterior, ainda por cima) — o array acaba com
   3 cópias do registo, não 1.

   Estes testes não sondam o mecanismo interno: montam o StoreProvider REAL
   dentro de StrictMode e correm os dois casos mais expostos — um addExpense,
   e dois addExpense na MESMA volta de act() (o caso que motivou o
   "adiantamento" em primeiro lugar, ver aiChat.store.test.jsx) — confirmando
   que cada chamada produz exatamente UM registo.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

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

afterEach(cleanup);

// Monta o StoreProvider real DENTRO de StrictMode (ao contrário do resto da
// suite) e devolve as `actions`.
async function mountStrictActions() {
  let actions;
  await renderWithStore(<div />, { strict: true, fixture: { addedExp: [] }, onReady: (r) => { actions = r.actions; } });
  return actions;
}

describe('StrictMode — atualizadores funcionais de setField/patch tem de ser puros', () => {
  it('uma chamada a addExpense grava exatamente um registo', async () => {
    const actions = await mountStrictActions();
    act(() => actions.addExpense({ desc: 'Cafe', amount: 1.2, cat: 'rest', date: '2026-08-28' }));
    const rows = actions.getState().addedExp;
    expect(rows).toHaveLength(1);
    expect(rows[0].desc).toBe('Cafe');
  });

  // O caso que motivou o "adiantamento" do stateRef (ver aiChat.store.test.jsx
  // e o comentário em store.jsx:293-298): duas escritas na MESMA volta, antes
  // de o React fazer commit da primeira. Em StrictMode isto exercita a
  // combinação mais exigente — fast-forward + dupla invocação do reducer.
  it('duas chamadas a addExpense na MESMA volta gravam exatamente dois registos, um cada', async () => {
    const actions = await mountStrictActions();
    act(() => {
      actions.addExpense({ desc: 'Cafe', amount: 1.2, cat: 'rest', date: '2026-08-28' });
      actions.addExpense({ desc: 'Pao', amount: 0.9, cat: 'sup', date: '2026-08-28' });
    });
    const rows = actions.getState().addedExp;
    expect(rows).toHaveLength(2);
    expect(rows.map((x) => x.desc).sort()).toEqual(['Cafe', 'Pao']);
  });
});
