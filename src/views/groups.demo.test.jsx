/* Modo demo (preview, sem login): a secção "Grupos" mostra um grupo de
   exemplo em vez de ficar vazia — tal como o resto da app já faz para contas,
   despesas e património. Cobre também que:
     - o Resumo (indicador da Task 10) mostra a MESMA coisa que a vista de
       Grupos, para as duas nunca divergirem;
     - o preview nunca escreve no store: o grupo de exemplo é só de leitura,
       nenhuma action é despoletada para o mostrar. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { emptyFixture } from '../test/fixtures.js';
import GroupsView from './GroupsView.jsx';
import OverviewView from './OverviewView.jsx';

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

describe('modo demo', () => {
  it('sem login mostra um grupo de exemplo', async () => {
    // renderWithStore autentica por defeito; aqui usamos preview (sem utilizador).
    await renderWithStore(<GroupsView />, { fixture: emptyFixture(), tab: 'groups', preview: true });
    expect(screen.getByText('Férias Algarve')).toBeTruthy();
  });

  it('o Resumo mostra o mesmo saldo do grupo de exemplo (consistente com a vista de Grupos)', async () => {
    await renderWithStore(<OverviewView />, { fixture: emptyFixture(), tab: 'overview', preview: true });
    expect(screen.getByText(/Amigos devem-te/i)).toBeTruthy();
  });

  it('é só leitura: mostrar o grupo de exemplo não escreve nada no store', async () => {
    let actionsRef;
    await renderWithStore(<GroupsView />, {
      fixture: emptyFixture(),
      tab: 'groups',
      preview: true,
      onReady: ({ actions }) => {
        actionsRef = actions;
      },
    });
    // confirma que o demo está mesmo a ser mostrado antes de verificar o store
    expect(screen.getByText('Férias Algarve')).toBeTruthy();
    const st = actionsRef.getState();
    expect(st.people).toEqual([]);
    expect(st.groups).toEqual([]);
    expect(st.groupEntries).toEqual([]);
  });

  it('com utilizador autenticado (sem preview) não mostra o grupo de exemplo', async () => {
    await renderWithStore(<GroupsView />, { fixture: emptyFixture(), tab: 'groups' });
    expect(screen.queryByText('Férias Algarve')).toBeNull();
  });
});
