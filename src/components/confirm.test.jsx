import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import ConfirmSheet from './ConfirmSheet.jsx';
import ConfirmButton from './ConfirmButton.jsx';
import { snapshotSlices } from '../lib/snapshot.js';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
function Probe() { const { state } = useStore(); return <pre data-testid="probe">{state.addedExp.length}</pre>; }

describe('snapshotSlices', () => {
  it('copia só as fatias pedidas', () => {
    const s = { addedExp: [1], goals: [2], theme: 'dark' };
    expect(snapshotSlices(s, ['addedExp'])).toEqual({ addedExp: [1] });
  });
});

describe('ConfirmSheet + Anular', () => {
  it('remover despesa abre a sheet, mostra o valor, apaga só ao confirmar e o toast anula', async () => {
    window.confirm = vi.fn(() => { throw new Error('confirm() nativo não deve ser chamado'); });
    await renderWithStore(<><ExpensesView /><ConfirmSheet /><Probe /></>, { fixture: richFixture() });
    const before = Number(screen.getByTestId('probe').textContent);
    await act(async () => { fireEvent.change(screen.getAllByLabelText(/Pesquisar despesas/)[0], { target: { value: 'ikea' } }); });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /Remover despesa/ })[0]); });
    const dlg = screen.getByRole('dialog', { name: /Remover despesa/ });
    // fm()/mask() (lib/format.js) usam sempre um espaço INSECÁVEL ( )
    // antes do "€" — mesmo símbolo visual, mas   ≠ espaço normal num
    // regex; sem isto o teste falhava sempre, mesmo com a implementação
    // certa (o valor usa o MESMO formatador que o resto da app, fm()).
    expect(dlg.textContent).toMatch(/80,00 €/);
    expect(Number(screen.getByTestId('probe').textContent)).toBe(before);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remover' })); });
    expect(Number(screen.getByTestId('probe').textContent)).toBe(before - 1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Anular' })); });
    expect(Number(screen.getByTestId('probe').textContent)).toBe(before);
  });

  it('payload não-objeto (harness abre modais genéricos com `true`) não renderiza nada', async () => {
    const { container } = await renderWithStore(<ConfirmSheet />, { fixture: richFixture(), openModal: 'confirm', payload: true });
    expect(container.textContent).toBe('');
  });

  // Fix round 1, finding 1: apagar uma despesa REFLETIDA de um grupo
  // (addedExp com groupEntryId) também põe groupEntries[].linkedExpId a
  // null (orphanedGroupEntries, store.jsx) — se o snapshot do Anular não
  // levar 'groupEntries', a despesa volta mas a entry do grupo fica "sem
  // reflexo", e a próxima edição da entry cria uma SEGUNDA despesa pessoal.
  it('anular a remoção de uma despesa ligada a um grupo repõe o linkedExpId da entry (não só a despesa)', async () => {
    const fixture = richFixture();
    fixture.addedExp = [
      ...fixture.addedExp,
      { id: 'exp-airbnb-link', desc: 'Airbnb Reflexo', amount: 100, cat: 'cas', date: '2026-08-12', groupEntryId: 'ge-1' },
    ];
    fixture.groupEntries = fixture.groupEntries.map((e) => (e.id === 'ge-1' ? { ...e, linkedExpId: 'exp-airbnb-link' } : e));

    let actionsRef;
    await renderWithStore(<><ExpensesView /><ConfirmSheet /><Probe /></>, {
      fixture,
      onReady: ({ actions }) => { actionsRef = actions; },
    });
    expect(actionsRef.getState().groupEntries.find((e) => e.id === 'ge-1').linkedExpId).toBe('exp-airbnb-link');

    await act(async () => { fireEvent.change(screen.getAllByLabelText(/Pesquisar despesas/)[0], { target: { value: 'airbnb reflexo' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Remover despesa/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remover' })); });

    // deleteExpense já orfanou a entry (comportamento existente do store).
    expect(actionsRef.getState().addedExp.some((x) => x.id === 'exp-airbnb-link')).toBe(false);
    expect(actionsRef.getState().groupEntries.find((e) => e.id === 'ge-1').linkedExpId).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Anular' })); });

    expect(actionsRef.getState().addedExp.some((x) => x.id === 'exp-airbnb-link')).toBe(true);
    expect(actionsRef.getState().groupEntries.find((e) => e.id === 'ge-1').linkedExpId).toBe('exp-airbnb-link');
  });
});

describe('ConfirmButton', () => {
  it('só executa ao segundo toque', async () => {
    const onConfirm = vi.fn();
    const { getByRole } = await renderWithStore(<ConfirmButton label="Eliminar meta" confirmLabel="Confirmar eliminação" onConfirm={onConfirm} />, { fixture: {} });
    await act(async () => { fireEvent.click(getByRole('button', { name: 'Eliminar meta' })); });
    expect(onConfirm).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(getByRole('button', { name: 'Confirmar eliminação' })); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
