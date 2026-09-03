import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import RecurringView from './RecurringView.jsx';
import RecModal from '../modals/RecModal.jsx';

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

describe('Recorrentes compacto', () => {
  it('resumo em três tiles e sem a frase longa', async () => {
    const { container } = await renderWithStore(<RecurringView />, { fixture: richFixture() });
    expect(container.querySelectorAll('.tile').length).toBe(3);
    expect(screen.getByText('por mês')).toBeTruthy();
    expect(screen.getByText('por ano')).toBeTruthy();
    expect(screen.queryByText(/subscrições ·/)).toBeNull();
    expect(screen.queryByText(/daqui a/)).toBeNull();
  });
  it('com menos de 3 recorrentes sugere marcas e o toque pré-preenche o modal', async () => {
    await renderWithStore(<><RecurringView /><RecModal /></>, { fixture: richFixture() });
    const sug = screen.getByRole('button', { name: 'Adicionar Netflix' });
    await act(async () => { fireEvent.click(sug); });
    expect(screen.getByLabelText('Nome').value).toBe('Netflix');
  });
  it('com 3 ou mais recorrentes não há sugestões', async () => {
    const fx = richFixture();
    fx.recurring = fx.recurring.concat([{ id: 'r3', name: 'Seguro', amount: 20, day: 10, cat: 'seg' }]);
    await renderWithStore(<RecurringView />, { fixture: fx });
    expect(screen.queryByRole('button', { name: /^Adicionar / })).toBeNull();
  });
});
