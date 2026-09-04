import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture } from './fixtures.js';
import { initialPersisted } from '../store/store.jsx';
import { monthSpend, netWorth } from '../lib/metrics.js';
import { fc } from '../lib/format.js';
import { todayISO } from '../lib/format.js';
import ContextStrip from '../components/ContextStrip.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import ReportView from '../views/ReportView.jsx';
import CalendarView from '../views/CalendarView.jsx';
import ChartsView from '../views/ChartsView.jsx';
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
    const expected = fc(netWorth(state()));
    const a = await renderWithStore(<ContextStrip tab="charts" />, { fixture: richFixture() });
    expect(a.container.textContent).toContain(expected);
    cleanup();
    const b = await renderWithStore(<ChartsView />, { fixture: richFixture() });
    expect(b.container.textContent).toContain(expected);
  });
});
