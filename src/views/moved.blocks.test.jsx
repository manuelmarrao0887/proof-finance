import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ChartsView from './ChartsView.jsx';
import ReportView from './ReportView.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
describe('blocos realojados', () => {
  it('Gráficos tem o património, a alocação, as contas por categoria e o fundo de emergência', async () => {
    const { container } = await renderWithStore(<ChartsView />, { fixture: richFixture() });
    for (const t of ['Património Líquido', 'Contas por categoria', 'Fundo de emergência', 'Liquidez']) expect(container.textContent, t).toMatch(new RegExp(t));
  });
  it('Relatório tem saúde financeira, projeção e subscrições detetadas', async () => {
    const { container } = await renderWithStore(<ReportView />, { fixture: richFixture() });
    for (const t of ['Saúde financeira', 'Projeção', 'Subscrições detectadas']) expect(container.textContent, t).toMatch(new RegExp(t));
  });
});
