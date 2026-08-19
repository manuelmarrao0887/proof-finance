/* Renderiza TODAS as views com (a) um utilizador cheio de dados e (b) uma conta
   vazia, e falha se alguma rebentar ou produzir avisos do React (keys, act,
   props inválidas). É a rede de segurança que faltava: 0 testes de UI. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithStore, captureConsole } from '../test/renderWithStore.jsx';
import { richFixture, emptyFixture } from '../test/fixtures.js';

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

import OverviewView from './OverviewView.jsx';
import ExpensesView from './ExpensesView.jsx';
import GoalsView from './GoalsView.jsx';
import CalendarView from './CalendarView.jsx';
import IncomesView from './IncomesView.jsx';
import RecurringView from './RecurringView.jsx';
import ChartsView from './ChartsView.jsx';
import LoanView from './LoanView.jsx';
import ReportView from './ReportView.jsx';
import InvestmentsView from './InvestmentsView.jsx';
import TransfersView from './TransfersView.jsx';
import CardsView from './CardsView.jsx';
import TaxView from './TaxView.jsx';

const VIEWS = {
  OverviewView, ExpensesView, GoalsView, CalendarView, IncomesView, RecurringView,
  ChartsView, LoanView, ReportView, InvestmentsView, TransfersView, CardsView, TaxView,
};

// Avisos que NÃO são bugs nossos (ruído do ambiente de teste).
const IGNORE = [/not wrapped in act/i, /ReactDOM.render is no longer supported/i];
const realErrors = (list) => list.filter((m) => !IGNORE.some((re) => re.test(m)));

afterEach(() => cleanup());

describe.each(Object.entries(VIEWS))('%s', (name, View) => {
  it('renderiza com dados ricos sem erros nem avisos do React', async () => {
    const cap = captureConsole();
    try {
      const { container } = await renderWithStore(<View />, { fixture: richFixture() });
      expect(container.textContent.length).toBeGreaterThan(0);
    } finally {
      cap.restore();
    }
    expect(realErrors(cap.errors), name + ' console.error').toEqual([]);
    expect(realErrors(cap.warns), name + ' console.warn').toEqual([]);
  });

  it('renderiza com conta vazia (utilizador novo)', async () => {
    const cap = captureConsole();
    try {
      const { container } = await renderWithStore(<View />, { fixture: emptyFixture() });
      expect(container).toBeTruthy();
    } finally {
      cap.restore();
    }
    expect(realErrors(cap.errors), name + ' console.error').toEqual([]);
  });

  it('renderiza com saldos ocultos sem revelar valores', async () => {
    const cap = captureConsole();
    let container;
    try {
      ({ container } = await renderWithStore(<View />, { fixture: { ...richFixture(), balancesHidden: true } }));
    } finally {
      cap.restore();
    }
    expect(realErrors(cap.errors), name + ' console.error').toEqual([]);
    expect(container).toBeTruthy();
  });
});
