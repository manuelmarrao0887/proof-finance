import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent, within, act } from '@testing-library/react';
import { renderWithStore, captureConsole } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import GroupsView from './GroupsView.jsx';

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

describe('GroupsView — detalhe', () => {
  it('abre o grupo e mostra as despesas', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    expect(screen.getByText('Airbnb')).toBeTruthy();
  });

  it('o separador Saldos mostra quem paga a quem', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /saldos/i }));
    // Ana pagou 50 dos 100 que devia → falta 50; João deve 100. O nome de
    // cada pessoa aparece em mais do que um sítio (linha de saldo + plano de
    // acertos), por isso a asserção fica presa à região "Saldo de cada
    // pessoa" — assim continua a falhar se essa lista deixar de mostrar o
    // nome, em vez de ficar satisfeita por qualquer menção a "João" no ecrã.
    const balances = screen.getByRole('region', { name: /saldo de cada pessoa/i });
    expect(within(balances).getByText(/João/)).toBeTruthy();
    expect(screen.getAllByText(/100,00 €/).length).toBeGreaterThan(0);
  });

  it('o separador Atividade lista despesas e acertos', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /atividade/i }));
    expect(screen.getByText(/acerto/i)).toBeTruthy();
  });

  it('voltar regressa à lista', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(screen.getByText(/Novo grupo/i)).toBeTruthy();
  });

  it('grupo apagado noutro sítio enquanto o detalhe está aberto cai de volta na lista, sem crash', async () => {
    const cap = captureConsole();
    let actionsRef;
    await renderWithStore(<GroupsView />, {
      fixture: richFixture(),
      tab: 'groups',
      onReady: ({ actions }) => {
        actionsRef = actions;
      },
    });
    fireEvent.click(screen.getByText('Férias Algarve'));
    expect(screen.getByText('Airbnb')).toBeTruthy();

    // Simula o grupo a ser apagado por outra via (ex.: outro separador, outro
    // dispositivo a sincronizar) enquanto o utilizador ainda está no detalhe.
    act(() => {
      actionsRef.deleteGroup('g-ferias');
    });

    cap.restore();
    expect(screen.getByText(/Novo grupo/i)).toBeTruthy();
    expect(cap.errors).toEqual([]);
  });
});
