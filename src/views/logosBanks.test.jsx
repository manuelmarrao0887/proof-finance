import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { fc } from '../lib/format.js';
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

// getByText normaliza espaços: troca o espaço inseparável do fc() por um normal.
const plain = (t) => t.replace(/\u00a0/g, ' ');

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
    // O ganho/perda em euros continua na linha, ao lado do chip de percentagem.
    // (o espaço antes do € é inseparável — getByText normaliza-o para simples)
    expect(screen.getByText(plain('+' + fc(200)))).toBeTruthy();
    expect(screen.getByText('+10.0%')).toBeTruthy();
    expect(screen.getByText(plain(fc(-250)))).toBeTruthy();
  });
  it('Investimentos: com saldos escondidos não mostra o P/L em euros nem a percentagem', async () => {
    const fx = richFixture();
    fx.balancesHidden = true;
    await renderWithStore(<InvestmentsView />, { fixture: fx });
    expect(screen.queryByText(plain('+' + fc(200)))).toBeNull();
    expect(screen.queryByText('+10.0%')).toBeNull();
    expect(screen.getAllByText('••••').length).toBeGreaterThan(0);
  });
});
