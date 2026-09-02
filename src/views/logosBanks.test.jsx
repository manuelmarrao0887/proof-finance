import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import OverviewView from './OverviewView.jsx';
import TransfersView from './TransfersView.jsx';
import InvestmentsView from './InvestmentsView.jsx';

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

describe('logos de bancos e ativos', () => {
  it('Resumo: cada conta de liquidez/poupança tem o logo do banco', async () => {
    await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'ActivoBank' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Trade Republic' }).length).toBeGreaterThan(0);
  });
  it('Transferências: origem e destino com logo', async () => {
    await renderWithStore(<TransfersView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'ActivoBank' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Revolut' }).length).toBeGreaterThan(0);
  });
  it('Investimentos: logo por ticker e corretora como badge', async () => {
    await renderWithStore(<InvestmentsView />, { fixture: richFixture() });
    expect(screen.getByRole('img', { name: 'Vanguard' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Apple' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Microsoft' })).toBeTruthy();
    expect(screen.getAllByText('XTB').length).toBe(3);
    expect(screen.queryByText(/20 @/)).toBeNull();
  });
});
