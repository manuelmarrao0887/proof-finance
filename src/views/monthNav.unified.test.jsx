import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ExpensesView from './ExpensesView.jsx';
import CardsView from './CardsView.jsx';
import TransfersView from './TransfersView.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
describe('navegação temporal única', () => {
  for (const [name, el] of [['Despesas', <ExpensesView />], ['Cartões', <CardsView />], ['Transferências', <TransfersView />]]) {
    it(name + ' usa o MonthNav (mês anterior / seguinte) e não a barra de segmentos', async () => {
      const { container } = await renderWithStore(el, { fixture: richFixture() });
      expect(screen.getByRole('button', { name: /Meses anteriores/ })).toBeTruthy();
      expect(container.querySelector('.tb')).toBeNull();
      expect(container.textContent).not.toMatch(/Junho – Setembro/);
    });
  }
});

describe('nota "parcial" em Despesas', () => {
  it('mostra "parcial" apenas quando o mês selecionado é o actual e não está no fim do mês', async () => {
    const today = new Date();
    const isEndOfMonth = today.getDate() >= 28;

    // Com mOff=-1 o mês selecionado é o anterior, portanto a nota não deve aparecer
    const { container: containerPrev } = await renderWithStore(<ExpensesView />, {
      fixture: richFixture(),
      onReady: ({ actions }) => actions.setMOff(-1),
    });
    expect(containerPrev.textContent).not.toContain('parcial');
    cleanup();

    // Com estado padrão (mês actual), a nota aparece só se não estamos no fim do mês
    const { container: containerToday } = await renderWithStore(<ExpensesView />, { fixture: richFixture() });
    if (!isEndOfMonth) {
      expect(containerToday.textContent).toContain('parcial');
    } else {
      expect(containerToday.textContent).not.toContain('parcial');
    }
  });
});
