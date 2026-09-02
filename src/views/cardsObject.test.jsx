import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import CardsView from './CardsView.jsx';

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

describe('CardsView: cartão como objeto', () => {
  it('mostra logo do banco, últimos 4 dígitos, rede e dívida', async () => {
    const fx = richFixture();
    fx.customAccts = fx.customAccts.map((a) => (a.id === 'cc' ? { ...a, last4: '2872', network: 'mastercard' } : a));
    const { container } = await renderWithStore(<CardsView />, { fixture: fx });
    expect(container.querySelector('.ccard')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Revolut' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/2872/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeTruthy();
    expect(screen.getByText(/Dívida atual/)).toBeTruthy();
    expect(screen.getByText(/de plafond/)).toBeTruthy();
  });
  it('sem last4 nem rede mostra só pontos e nenhum logo de rede', async () => {
    await renderWithStore(<CardsView />, { fixture: richFixture() });
    expect(screen.getByText(/•••• •••• •••• ••••/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Mastercard' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Visa' })).toBeNull();
  });
});
