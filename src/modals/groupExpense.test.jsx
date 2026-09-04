/* Testes de GroupExpenseSheet (Task 8) — os 4 do brief (pré-visualização em
   tempo real, validação de descrição, erro verbatim do resolveShares em modo
   "Valores", redistribuição ao remover um participante) + os que o brief
   deixa por cobrir: gravar cria mesmo a entry com as shares certas, edição
   pré-preenche a partir da entry gravada, o erro de percentagens (verbatim),
   e apagar pede confirmação antes de remover. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import GroupExpenseSheet from './GroupExpenseSheet.jsx';

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

afterEach(cleanup);

// NOTA: o brief da task tem `fixture: richFixture` (a função em si, sem
// chamar) — spread de uma função dá `{}` (ver renderWithStore.jsx: apenas
// espalha `fixture`), pelo que nenhum grupo seria semeado e a sheet nunca
// encontrava "g-ferias". Todos os outros ficheiros de teste do repo chamam
// `richFixture()`; corrige-se aqui o mesmo (typo óbvio, não uma diferença de
// comportamento contratual).
const open = { openModal: 'gexp', payload: { groupId: 'g-ferias' }, fixture: richFixture() };

describe('GroupExpenseSheet', () => {
  it('mostra a parte de cada pessoa em tempo real', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    // 3 membros → 30,00 cada
    expect(screen.getAllByText('30,00').length).toBe(3);
  });

  it('bloqueia guardar sem descrição', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByText('Preenche a descrição.')).toBeTruthy();
  });

  it('em valores exatos avisa quando a soma não bate certo', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Jantar' } });
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /^valores$/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByText(/Faltam .* para chegar ao total\./)).toBeTruthy();
  });

  it('tirar uma pessoa redistribui a despesa pelos restantes', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /participação de joão/i }));
    expect(screen.getAllByText('45,00').length).toBe(2);
  });

  it('guardar cria uma despesa nova com as shares calculadas por resolveShares', async () => {
    let actionsRef;
    await renderWithStore(<GroupExpenseSheet />, {
      ...open,
      onReady: ({ actions }) => { actionsRef = actions; },
    });
    fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Jantar' } });
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    const saved = actionsRef.getState().groupEntries.find((e) => e.desc === 'Jantar');
    expect(saved).toBeTruthy();
    expect(saved.groupId).toBe('g-ferias');
    expect(saved.kind).toBe('expense');
    expect(saved.payerId).toBe('me');
    expect(saved.splitMode).toBe('equal');
    expect(saved.shares).toEqual([
      { personId: 'me', amount: 30 },
      { personId: 'p-ana', amount: 30 },
      { personId: 'p-joao', amount: 30 },
    ]);
  });

  it('edição pré-preenche descrição, valor e categoria a partir da entry gravada', async () => {
    const fixture = richFixture();
    const entry = fixture.groupEntries[0]; // ge-1: Airbnb, 300€, equal, stay
    await renderWithStore(<GroupExpenseSheet />, { openModal: 'gexp', payload: entry, fixture });

    expect(screen.getByText('Editar despesa')).toBeTruthy();
    expect(screen.getByLabelText('Descrição').value).toBe('Airbnb');
    expect(screen.getByLabelText('Valor').value).toBe('300');
    expect(screen.getByRole('button', { name: 'Alojamento' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /participação de ana/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /apagar despesa/i })).toBeTruthy();
  });

  it('percentagens que não somam 100% mostram o erro do resolveShares tal como vem', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Jantar' } });
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: '%' }));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByText('As percentagens somam 0% — têm de somar 100%.')).toBeTruthy();
  });

  it('arredonda o valor ao cêntimo ao guardar (M3): "10,005" não deixa o total a divergir da soma das partes', async () => {
    let actionsRef;
    await renderWithStore(<GroupExpenseSheet />, {
      ...open,
      onReady: ({ actions }) => { actionsRef = actions; },
    });
    fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Arredondamento' } });
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '10,005' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    const saved = actionsRef.getState().groupEntries.find((e) => e.desc === 'Arredondamento');
    expect(saved.amount).toBe(10.01); // não 10.005 — fm(entry.amount) já não podia mostrar 10,01 com as partes a somar 10,00
    const shareCents = saved.shares.reduce((a, s) => a + Math.round(s.amount * 100), 0);
    expect(shareCents).toBe(Math.round(saved.amount * 100));
  });

  it('avisa, junto do toggle "Refletir", que importar o extrato duplica a despesa se a linha não for apagada (I6)', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    expect(
      screen.getByText(/importares o extrato do banco.*valor total.*entra nas Despesas/i)
    ).toBeTruthy();
  });

  it('apagar despesa pede confirmação (dois toques, ConfirmButton) e remove-a do grupo', async () => {
    const fixture = richFixture();
    const entry = fixture.groupEntries[0];
    let actionsRef;
    await renderWithStore(<GroupExpenseSheet />, {
      openModal: 'gexp',
      payload: entry,
      fixture,
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    // Primeiro toque só arma o botão — nada apagado ainda.
    fireEvent.click(screen.getByRole('button', { name: /apagar despesa/i }));
    expect(actionsRef.getState().groupEntries.find((e) => e.id === entry.id)).toBeTruthy();

    // Segundo toque (mesmo botão, agora "Confirmar") apaga mesmo.
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(actionsRef.getState().groupEntries.find((e) => e.id === entry.id)).toBeUndefined();
  });
});
