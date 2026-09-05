import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import AddExpenseSheet from './AddExpenseSheet.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());

describe('Nova despesa: valor primeiro', () => {
  it('o valor vem antes das categorias e recebe o foco ao abrir', async () => {
    const { container } = await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    const amount = screen.getByLabelText('Valor (€)');
    const firstCat = screen.getByRole('group', { name: 'Categoria' }).querySelector('button');
    expect(amount.compareDocumentPosition(firstCat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O foco no valor acontece num setTimeout(…, 50) (a sheet anima); a Sheet
    // também foca o botão "Fechar" de imediato, por isso é preciso esperar
    // que o temporizador do valor dispare para o substituir (temporizador
    // real — a suite não usa fake timers).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(document.activeElement).toBe(amount);
    expect(container.querySelector('[aria-label="Descrição"]')).toBeTruthy();
  });
  it('mostra 6 categorias mais usadas e "Mais categorias" abre a grelha completa', async () => {
    await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    const grid = screen.getByRole('group', { name: 'Categoria' });
    expect(grid.querySelectorAll('button[aria-pressed]').length).toBe(6);
    expect(grid.textContent).toMatch(/Supermercado/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais categorias' })); });
    expect(grid.querySelectorAll('button[aria-pressed]').length).toBeGreaterThan(10);
  });
  it('a conta vem pré-selecionada com a última usada e as opções extra ficam colapsadas', async () => {
    await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    expect(screen.getByLabelText('Conta debitada (opcional)').value).not.toBe('');
    expect(screen.queryByLabelText('Despesa partilhada')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais opções' })); });
    expect(screen.getByLabelText('Despesa partilhada')).toBeTruthy();
  });
});
