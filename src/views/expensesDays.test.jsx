import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ExpensesView from './ExpensesView.jsx';

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

describe('Despesas: pesquisa agrupada por dia', () => {
  it('mostra cabeçalhos de dia e tira a data ISO de cada linha', async () => {
    const { container } = await renderWithStore(<ExpensesView />, { fixture: richFixture() });
    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText(/Pesquisar/)[0], { target: { value: 'pingo' } });
    });
    expect(container.querySelectorAll('.day-lb').length).toBeGreaterThan(1);
    expect(screen.getByText('Hoje')).toBeTruthy();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
  });
});
