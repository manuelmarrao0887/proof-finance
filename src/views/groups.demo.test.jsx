/* Modo demo (preview, sem login): a secção "Grupos" mostra um grupo de
   exemplo em vez de ficar vazia — tal como o resto da app já faz para contas,
   despesas e património. Cobre também que:
     - o Resumo (indicador da Task 10) mostra a MESMA coisa que a vista de
       Grupos, para as duas nunca divergirem;
     - o preview nunca escreve no store: o grupo de exemplo é só de leitura,
       nenhuma action é despoletada para o mostrar — incluindo no DETALHE do
       grupo, cujas sheets (GroupSheet/GroupExpenseSheet/SettleSheet) resolvem
       sempre o grupo por `state.groups` e nunca encontrariam o de exemplo;
       por isso as ações que abririam essas sheets ficam desativadas
       (atributo `disabled` real) com uma explicação visível, e o teste
       "só leitura" carrega em cada uma para provar que nada acontece. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
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

  it('é só leitura: mostrar o grupo de exemplo (lista E detalhe) não escreve nada no store, e as ações que abririam sheets ficam desativadas', async () => {
    let actionsRef;
    await renderWithStore(<GroupsView />, {
      fixture: emptyFixture(),
      tab: 'groups',
      preview: true,
      onReady: ({ actions }) => {
        actionsRef = actions;
      },
    });
    const assertNothingPersisted = () => {
      const st = actionsRef.getState();
      expect(st.people).toEqual([]);
      expect(st.groups).toEqual([]);
      expect(st.groupEntries).toEqual([]);
    };

    // Lista: confirma que o demo está mesmo a ser mostrado, sem nada no store.
    expect(screen.getByText('Férias Algarve')).toBeTruthy();
    assertNothingPersisted();

    // Abre o detalhe do grupo de exemplo — é o ecrã que as sheets (GroupSheet/
    // GroupExpenseSheet/SettleSheet) resolvem por `state.groups`, onde o
    // "demo-ferias" não existe.
    fireEvent.click(screen.getByText('Férias Algarve'));

    // Explicação visível (não só um tooltip).
    expect(screen.getByText(/Dados de exemplo/i)).toBeTruthy();

    // "Editar grupo": disabled de verdade, e carregar não faz nada.
    const editBtn = screen.getByRole('button', { name: 'Editar grupo (indisponível para dados de exemplo)' });
    expect(editBtn).toBeDisabled();
    fireEvent.click(editBtn);
    assertNothingPersisted();

    // Separador "Despesas" (default): a linha da despesa também fica desativada.
    const expenseRowBtn = screen.getByText('Airbnb · 7 noites').closest('button');
    expect(expenseRowBtn).toBeDisabled();
    fireEvent.click(expenseRowBtn);
    assertNothingPersisted();

    // Atalhos fixos no fundo: "Acertar" e "Despesa".
    const bottomAcertar = screen.getByRole('button', { name: 'Acertar' });
    const bottomDespesa = screen.getByRole('button', { name: 'Despesa' });
    expect(bottomAcertar).toBeDisabled();
    expect(bottomDespesa).toBeDisabled();
    fireEvent.click(bottomAcertar);
    fireEvent.click(bottomDespesa);
    assertNothingPersisted();

    // Separador "Saldos": os "Acertar" por linha do plano também ficam desativados.
    fireEvent.click(screen.getByText('Saldos'));
    const planAcertarBtns = screen.getAllByRole('button', { name: /^Acertar / });
    expect(planAcertarBtns.length).toBeGreaterThan(0);
    planAcertarBtns.forEach((btn) => expect(btn).toBeDisabled());
    planAcertarBtns.forEach((btn) => fireEvent.click(btn));
    assertNothingPersisted();
  });

  it('com utilizador autenticado (sem preview) não mostra o grupo de exemplo', async () => {
    await renderWithStore(<GroupsView />, { fixture: emptyFixture(), tab: 'groups' });
    expect(screen.queryByText('Férias Algarve')).toBeNull();
  });
});
