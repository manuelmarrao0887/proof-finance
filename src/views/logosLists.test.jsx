import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ExpensesView from './ExpensesView.jsx';
import CardsView from './CardsView.jsx';
import RecurringView from './RecurringView.jsx';

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

describe('logos nas listas', () => {
  it('Despesas: resultados de pesquisa mostram o logo do comerciante', async () => {
    await renderWithStore(<ExpensesView />, { fixture: richFixture() });
    const input = screen.getAllByPlaceholderText(/Pesquisar/)[0];
    await act(async () => {
      fireEvent.change(input, { target: { value: 'pingo' } });
    });
    expect(screen.getAllByRole('img', { name: 'Pingo Doce' }).length).toBeGreaterThan(0);
  });

  it('Cartões: despesas do cartão mostram o logo (IKEA, Netflix)', async () => {
    await renderWithStore(<CardsView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'IKEA' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Netflix' }).length).toBeGreaterThan(0);
  });

  it('Recorrentes: uma recorrente "Netflix" tem logo; "Internet" cai para a categoria', async () => {
    const fx = richFixture();
    fx.recurring = fx.recurring.concat([{ id: 'rec-nf', name: 'Netflix', amount: 10.99, day: 1, cat: 'sub' }]);
    await renderWithStore(<RecurringView />, { fixture: fx });
    expect(screen.getByRole('img', { name: 'Netflix' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Internet' })).toBeNull();
  });
});
