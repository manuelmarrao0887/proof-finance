import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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

describe('apagar pede confirmação', () => {
  beforeEach(() => {
    window.confirm = vi.fn(() => false);
  });

  it('despesa: com confirm() recusado nada é apagado', async () => {
    await renderWithStore(<><AddExpenseSheet /><Probe /></>, { fixture: richFixture(), openModal: 'add', payload: { editId: 'out1' } });
    const before = JSON.parse(screen.getByTestId('probe').textContent).e;
    await act(async () => {
      fireEvent.click(screen.getByText('Eliminar despesa'));
    });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(screen.getByTestId('probe').textContent).e).toBe(before);
  });

  it('meta: com confirm() recusado nada é apagado', async () => {
    await renderWithStore(<><GoalModal /><Probe /></>, { fixture: richFixture(), openModal: 'goal', payload: { id: 'g1' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Eliminar meta'));
    });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(screen.getByTestId('probe').textContent).g).toBe(2);
  });
});
