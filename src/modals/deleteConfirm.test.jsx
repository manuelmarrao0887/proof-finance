/* Task 3 introduziu confirm() nativo antes de apagar despesa/meta; Task 8
   substitui-o por ConfirmButton (dois toques em 4s, sem bloquear o browser —
   ver src/components/ConfirmButton.jsx) + toast "Anular". Este ficheiro passa
   a testar o novo mecanismo: o primeiro toque só arma o botão (nada é
   apagado), só o segundo (no mesmo botão, agora com o texto de confirmação)
   apaga mesmo. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import AddExpenseSheet from './AddExpenseSheet.jsx';
import GoalModal from './GoalModal.jsx';

vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));

afterEach(() => cleanup());

function Probe() {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify({ e: state.addedExp.length, g: state.goals.length })}</pre>;
}

describe('apagar pede confirmação (ConfirmButton, dois toques)', () => {
  it('despesa: primeiro toque não apaga, segundo apaga', async () => {
    await renderWithStore(<><AddExpenseSheet /><Probe /></>, { fixture: richFixture(), openModal: 'add', payload: { editId: 'out1' } });
    const before = JSON.parse(screen.getByTestId('probe').textContent).e;

    await act(async () => {
      fireEvent.click(screen.getByText('Eliminar despesa'));
    });
    expect(JSON.parse(screen.getByTestId('probe').textContent).e).toBe(before);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminação' }));
    });
    expect(JSON.parse(screen.getByTestId('probe').textContent).e).toBe(before - 1);
  });

  it('meta: primeiro toque não apaga, segundo apaga', async () => {
    await renderWithStore(<><GoalModal /><Probe /></>, { fixture: richFixture(), openModal: 'goal', payload: { id: 'g1' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Eliminar meta'));
    });
    expect(JSON.parse(screen.getByTestId('probe').textContent).g).toBe(2);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminação' }));
    });
    expect(JSON.parse(screen.getByTestId('probe').textContent).g).toBe(1);
  });
});
