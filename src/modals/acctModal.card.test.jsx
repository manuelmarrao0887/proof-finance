import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import AcctModal from './AcctModal.jsx';

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

function Probe() {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify(state.customAccts)}</pre>;
}

describe('AcctModal: cartão com últimos 4 dígitos e rede', () => {
  it('mostra os campos só para cartões e grava-os', async () => {
    await renderWithStore(<><AcctModal /><Probe /></>, { fixture: richFixture(), openModal: 'acct', payload: { id: 'cc' } });
    const last4 = screen.getByLabelText('Últimos 4 dígitos');
    const network = screen.getByLabelText('Rede');
    await act(async () => {
      fireEvent.change(last4, { target: { value: '2872' } });
      fireEvent.change(network, { target: { value: 'mastercard' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guardar alterações'));
    });
    const accts = JSON.parse(screen.getByTestId('probe').textContent);
    const cc = accts.find((a) => a.id === 'cc');
    expect(cc.last4).toBe('2872');
    expect(cc.network).toBe('mastercard');
    expect(cc.plafond).toBe(1500);
  });

  it('numa conta normal os campos não aparecem', async () => {
    await renderWithStore(<AcctModal />, { fixture: richFixture(), openModal: 'acct', payload: { id: 'a1' } });
    expect(screen.queryByLabelText('Últimos 4 dígitos')).toBeNull();
    expect(screen.queryByLabelText('Rede')).toBeNull();
  });

  it('guarda só dígitos e no máximo 4', async () => {
    await renderWithStore(<><AcctModal /><Probe /></>, { fixture: richFixture(), openModal: 'acct', payload: { id: 'cc' } });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), { target: { value: '12-3456' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guardar alterações'));
    });
    const cc = JSON.parse(screen.getByTestId('probe').textContent).find((a) => a.id === 'cc');
    expect(cc.last4).toBe('3456');
  });
});
