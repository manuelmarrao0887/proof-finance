import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import CatManagerModal from './CatManagerModal.jsx';

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
  return <pre data-testid="probe">{JSON.stringify(state.bdg)}</pre>;
}

describe('CatManagerModal: ícone e cor', () => {
  it('cria uma categoria com o ícone e a cor escolhidos', async () => {
    await renderWithStore(<><CatManagerModal /><Probe /></>, { fixture: richFixture(), openModal: 'cat' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Viagens' } });
      fireEvent.click(screen.getByRole('button', { name: 'Ícone avião' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cor laranja' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Adicionar'));
    });
    const bdg = JSON.parse(screen.getByTestId('probe').textContent);
    const v = bdg.find((b) => b.nm === 'Viagens');
    expect(v.icon).toBe('plane');
    expect(v.color).toBe('#f5a623');
  });
  it('o seletor marca o ícone escolhido com aria-pressed', async () => {
    await renderWithStore(<CatManagerModal />, { fixture: richFixture(), openModal: 'cat' });
    const btn = screen.getByRole('button', { name: 'Ícone presente' });
    await act(async () => { fireEvent.click(btn); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
