/* Posições vindas da sync da Trading212 são espelho: editá-las à mão não
   serve de nada (a sync seguinte reescreve-as). A vista tem de o dizer. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

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

import InvestmentsView from './InvestmentsView.jsx';

const FIXTURE = {
  positions: [
    { id: 't212-VWCE_EQ', asset: 'Vanguard All-World', broker: 'Trading212', qty: 10, avgPrice: 100, currentPrice: 120, source: 't212' },
    { id: 'manual1', asset: 'Bitcoin', broker: 'Kraken', qty: 1, avgPrice: 20000, currentPrice: 25000 },
  ],
};

afterEach(cleanup);

describe('InvestmentsView — posições sincronizadas', () => {
  it('marca a posição vinda da sync como automática', async () => {
    await renderWithStore(<InvestmentsView />, { fixture: FIXTURE });
    expect(await screen.findByText(/auto/i)).toBeTruthy();
  });

  it('tocar numa posição sincronizada explica que não se edita aqui', async () => {
    await renderWithStore(<InvestmentsView />, { fixture: FIXTURE });
    fireEvent.click(screen.getByText('Vanguard All-World'));
    expect(await screen.findByText(/sincronizada/i)).toBeTruthy();
  });

  it('uma posição manual não mostra esse aviso', async () => {
    await renderWithStore(<InvestmentsView />, { fixture: FIXTURE });
    fireEvent.click(screen.getByText('Bitcoin'));
    expect(screen.queryByText(/sincronizada/i)).toBeNull();
  });

  it('as duas posições continuam a contar para o total da carteira', async () => {
    await renderWithStore(<InvestmentsView />, { fixture: FIXTURE });
    // 10 × 120 + 1 × 25000 = 26 200
    expect((await screen.findAllByText(/26[\s.]?200/)).length).toBeGreaterThan(0);
  });
});
