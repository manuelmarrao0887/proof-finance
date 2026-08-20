/* Testes de SettleSheet (Task 9) — os 4 do brief (pré-preenchimento do valor,
   saldo antes/depois via computeBalances, valor zero, pagar a si próprio) +
   os que o brief deixa por cobrir: gravar cria mesmo o "settlement" com os
   campos certos e não mexe em addedExp, o aviso de "mais do que a dívida"
   não bloqueia o registo, e trocar a pessoa em "de" recalcula o valor
   sugerido a partir dos saldos atuais. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { todayISO } from '../lib/format.js';
import SettleSheet from './SettleSheet.jsx';

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

// NOTA (mesma do groupExpense.test.jsx): `fixture` tem de ser o resultado de
// chamar richFixture(), não a função em si — senão nenhum grupo é semeado.
const open = { openModal: 'settle', payload: { groupId: 'g-ferias', from: 'p-joao', to: 'me', amount: 100 }, fixture: richFixture() };

describe('SettleSheet', () => {
  it('pré-preenche o valor sugerido', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByLabelText(/valor/i).value).toBe('100');
  });

  it('mostra o saldo antes e depois', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByText(/saldo do joão depois/i)).toBeTruthy();
    expect(screen.getByText('0,00 €')).toBeTruthy();
  });

  it('recusa valor zero', async () => {
    await renderWithStore(<SettleSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));
    expect(screen.getByText('O valor tem de ser maior que zero.')).toBeTruthy();
  });

  it('recusa pagar a si próprio', async () => {
    await renderWithStore(<SettleSheet />, { ...open, payload: { groupId: 'g-ferias', from: 'me', to: 'me', amount: 10 } });
    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));
    expect(screen.getByText('Escolhe duas pessoas diferentes.')).toBeTruthy();
  });

  it('gravar regista o acerto com os campos certos e não mexe em addedExp', async () => {
    let actionsRef;
    await renderWithStore(<SettleSheet />, { ...open, onReady: ({ actions }) => { actionsRef = actions; } });
    const addedExpBefore = actionsRef.getState().addedExp.length;

    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));

    const state = actionsRef.getState();
    const saved = state.groupEntries.find((e) => e.kind === 'settlement' && e.id !== 'ge-2');
    expect(saved).toBeTruthy();
    expect(saved.groupId).toBe('g-ferias');
    expect(saved.fromId).toBe('p-joao');
    expect(saved.toId).toBe('me');
    expect(saved.amount).toBe(100);
    expect(saved.method).toBe('mbway');
    expect(saved.date).toBe(todayISO());
    // Um acerto move saldos dentro do grupo — nunca cria uma despesa pessoal.
    expect(state.addedExp.length).toBe(addedExpBefore);
  });

  it('aviso de valor acima da dívida não bloqueia o registo', async () => {
    let actionsRef;
    await renderWithStore(<SettleSheet />, { ...open, onReady: ({ actions }) => { actionsRef = actions; } });

    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '150' } });
    expect(screen.getByText('Estás a registar mais do que a dívida atual.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));

    const saved = actionsRef.getState().groupEntries.find((e) => e.kind === 'settlement' && e.id !== 'ge-2');
    expect(saved).toBeTruthy();
    expect(saved.amount).toBe(150);
  });

  it('trocar a pessoa em "de" recalcula o valor sugerido', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByLabelText('Valor').value).toBe('100');

    // p-ana deve 50 (saldo -50), me tem 150 a receber -> sugestão min(50,150)=50.
    fireEvent.change(screen.getByLabelText('De'), { target: { value: 'p-ana' } });

    expect(screen.getByLabelText('Valor').value).toBe('50');
  });
});
