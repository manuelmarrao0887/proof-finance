import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { initialPersisted } from '../store/store.jsx';
import AddExpenseSheet from './AddExpenseSheet.jsx';

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

describe('Nova despesa: logo ao escrever a descrição', () => {
  it('mostra o logo quando a descrição bate numa marca', async () => {
    await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    expect(screen.queryByRole('img', { name: 'Pingo Doce' })).toBeNull();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Pingo Doce' } });
    });
    expect(screen.getByRole('img', { name: 'Pingo Doce' })).toBeTruthy();
  });
  it('a grelha usa o ícone/cor de uma categoria personalizada', async () => {
    const fx = richFixture();
    // richFixture não traz bdg: parte dos defaults do store e junta a personalizada.
    fx.bdg = initialPersisted().bdg.concat([{ id: 'viagens', nm: 'Viagens', lm: 200, icon: 'plane', color: '#f5a623' }]);
    await renderWithStore(<AddExpenseSheet />, { fixture: fx, openModal: 'add' });
    // "Viagens" é uma categoria pouco usada: não entra nas 6 mais usadas por
    // omissão (D5/Task 9) — é preciso abrir a grelha completa primeiro.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais categorias' })); });
    const cell = screen.getByRole('button', { name: /Viagens/ });
    expect(cell.querySelector('div').style.color).toBe('rgb(245, 166, 35)');
  });
});
