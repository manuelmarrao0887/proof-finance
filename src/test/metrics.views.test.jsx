import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture } from './fixtures.js';
import { initialPersisted } from '../store/store.jsx';
import { monthSpend, netWorth } from '../lib/metrics.js';
import { fc, fm } from '../lib/format.js';
import { todayISO } from '../lib/format.js';
import { monthKeyAt } from '../lib/months.js';
import ContextStrip from '../components/ContextStrip.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import ReportView from '../views/ReportView.jsx';
import CalendarView from '../views/CalendarView.jsx';
import ChartsView from '../views/ChartsView.jsx';
import TransactionsView from '../views/TransactionsView.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
const state = () => ({ ...initialPersisted(), ...richFixture(), currentUser: { uid: 'test-user' } });
const ym = todayISO().slice(0, 7);

describe('um número, uma fórmula', () => {
  it('o total do mês é igual na faixa, em Despesas, no Relatório e no Calendário', async () => {
    const expected = fc(monthSpend(state(), ym));
    for (const el of [<ContextStrip tab="expenses" />, <ExpensesView />, <ReportView />, <CalendarView />]) {
      const { container } = await renderWithStore(el, { fixture: richFixture() });
      expect(container.textContent, el.type.name).toContain(expected);
      cleanup();
    }
  });
  it('o património é igual na faixa e no cartão de Gráficos', async () => {
    // Mesma fórmula (netWorth(state) === compute(state).nW) dos dois lados —
    // só o formatador difere: a faixa (ContextStrip) usa fc (sem cêntimos),
    // o hero de Património (Hero.jsx, montado em Gráficos na Task 11) usa fm
    // (com cêntimos), como o resto dos heroes da app.
    const net = netWorth(state());
    const a = await renderWithStore(<ContextStrip tab="charts" />, { fixture: richFixture() });
    expect(a.container.textContent).toContain(fc(net));
    cleanup();
    const b = await renderWithStore(<ChartsView />, { fixture: richFixture() });
    expect(b.container.textContent).toContain(fm(net));
  });
  it('ContextStrip/expenses mostra o mês selecionado via mOff, não sempre o mês actual', async () => {
    // mOff=-1 deslocaria a janela um mês para trás (monthKeyAt(3, -1) é o mês anterior ao actual)
    const prevMonthKey = monthKeyAt(3, -1);
    const expected = fc(monthSpend(state(), prevMonthKey));
    const { container } = await renderWithStore(<ContextStrip tab="expenses" />, {
      fixture: richFixture(),
      onReady: ({ actions }) => actions.setMOff(-1),
    });
    expect(container.textContent).toContain(expected);
  });
  it('ContextStrip/transactions mostra "Gastos do mês" como tab expenses', async () => {
    const { container } = await renderWithStore(<ContextStrip tab="transactions" />, { fixture: richFixture() });
    expect(container.textContent).toContain('Gastos do mês');
  });
});
