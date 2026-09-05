import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import TransactionsView from './TransactionsView.jsx';
import Shell from '../components/Shell.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
function Probe() { const { state } = useStore(); return <pre data-testid="probe">{JSON.stringify(state.addedExp.find((x) => x.id === 'out1'))}</pre>; }
describe('Transações', () => {
  it('feed do mês agrupado por dia com logos e categoria em 2 toques', async () => {
    const { container } = await renderWithStore(<><TransactionsView /><Probe /></>, { fixture: richFixture() });
    expect(container.querySelectorAll('.day-lb').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Pingo Doce' }).length).toBeGreaterThan(0);
    // richFixture() tem DUAS despesas "COMPRA 4174 PINGO DOCE LISBOA" no mês
    // corrente: a compra normal do histórico (r0, dia 3, usada como baseline
    // pelos testes de anomalias) e a compra fora do padrão de hoje (out1,
    // dia de hoje) — por isso getByLabelText direto seria ambíguo (2 linhas
    // com a mesma descrição). Delimita-se ao grupo "Hoje", onde só está a
    // out1, para testar a categorização da linha certa.
    const hojeGroup = screen.getByText('Hoje').parentElement;
    const sel = within(hojeGroup).getByLabelText(/Categoria de COMPRA 4174 PINGO DOCE/);
    await act(async () => { fireEvent.change(sel, { target: { value: 'rest' } }); });
    expect(JSON.parse(screen.getByTestId('probe').textContent).cat).toBe('rest');
  });
  it('a tab "Despesas" da barra abre as Transações', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Despesas/ })); });
    expect(screen.getByRole('heading', { level: 1, name: 'Transações' })).toBeTruthy();
  });
});
