import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import GroupsView from './GroupsView.jsx';

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

describe('GroupsView — detalhe', () => {
  it('abre o grupo e mostra as despesas', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    expect(screen.getByText('Airbnb')).toBeTruthy();
  });

  it('o separador Saldos mostra quem paga a quem', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /saldos/i }));
    // Ana pagou 50 dos 100 que devia → falta 50; João deve 100.
    expect(screen.getByText(/João/)).toBeTruthy();
    expect(screen.getAllByText(/100,00 €/).length).toBeGreaterThan(0);
  });

  it('o separador Atividade lista despesas e acertos', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /atividade/i }));
    expect(screen.getByText(/acerto/i)).toBeTruthy();
  });

  it('voltar regressa à lista', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(screen.getByText(/Novo grupo/i)).toBeTruthy();
  });
});
