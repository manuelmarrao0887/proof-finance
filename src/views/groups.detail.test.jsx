import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent, within, act } from '@testing-library/react';
import { renderWithStore, captureConsole } from '../test/renderWithStore.jsx';
import { richFixture, emptyFixture } from '../test/fixtures.js';
import GroupsView from './GroupsView.jsx';
import PersonSheet from '../modals/PersonSheet.jsx';

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

  // Finding M11 (revisão final): GroupsView troca TODA a subárvore ao abrir/
  // fechar o detalhe (a lista/o detalhe desmonta por completo) — sem gerir o
  // foco explicitamente, ele cai para <body> em ambos os sentidos, deixando
  // quem navega por teclado ou leitor de ecrã sem contexto de onde está.
  describe('gestão de foco (M11)', () => {
    it('abrir um grupo move o foco para o título do detalhe', async () => {
      await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
      fireEvent.click(screen.getByText('Férias Algarve'));
      expect(document.activeElement.textContent).toContain('Férias Algarve');
      expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
    });

    it('"Voltar" devolve o foco ao cartão do grupo na lista', async () => {
      await renderWithStore(<GroupsView />, { fixture: richFixture(), tab: 'groups' });
      const card = screen.getByText('Férias Algarve').closest('button');
      fireEvent.click(card);
      fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
      expect(document.activeElement).toBe(screen.getByText('Férias Algarve').closest('button'));
    });

    it('grupo apagado noutro sítio enquanto o detalhe está aberto devolve o foco ao título da lista', async () => {
      let actionsRef;
      await renderWithStore(<GroupsView />, {
        fixture: richFixture(),
        tab: 'groups',
        onReady: ({ actions }) => { actionsRef = actions; },
      });
      fireEvent.click(screen.getByText('Férias Algarve'));
      // O cartão já não existe para onde voltar — cai para o título "Grupos".
      act(() => {
        actionsRef.deleteGroup('g-ferias');
      });
      expect(document.activeElement).toBe(screen.getByText('Grupos'));
      expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
    });
  });
});

// Finding 1 (revisão da Task 12): "Gerir pessoas" só era alcançável a partir
// de dentro do GroupSheet ("+ Nova pessoa"), nunca a partir da lista de
// grupos — apesar de a Task 5 prever "acesso a Pessoas" a partir daqui.
// GroupsView monta o botão; quem confirma que ele abre a sheet a sério é este
// teste, renderizando os dois juntos (como o Shell faz na app real).
describe('GroupsView — lista', () => {
  it('o cabeçalho da lista tem um controlo "Pessoas" que abre a sheet de gestão de pessoas', async () => {
    await renderWithStore(
      <>
        <GroupsView />
        <PersonSheet />
      </>,
      { fixture: richFixture(), tab: 'groups' }
    );
    // Ainda não há nenhuma sheet aberta.
    expect(screen.queryByText('Gerir pessoas')).toBeNull();

    // Nome exato: um GroupCard (ex.: "Férias Algarve · 3 pessoas · ...") também
    // é um <button> cujo texto contém "pessoas" — /pessoas/i sozinho apanhava
    // os dois. "Gerir pessoas" (o aria-label do controlo novo) é inequívoco.
    fireEvent.click(screen.getByRole('button', { name: 'Gerir pessoas' }));

    // O título da sheet real (PersonSheet) confirma que abriu a sheet certa,
    // não só que algum estado interno mudou.
    expect(screen.getByText('Gerir pessoas')).toBeTruthy();
  });

  it('o controlo "Pessoas" também está disponível no estado vazio (sem grupos ainda)', async () => {
    await renderWithStore(
      <>
        <GroupsView />
        <PersonSheet />
      </>,
      { fixture: emptyFixture(), tab: 'groups' }
    );
    expect(screen.getByText('Ainda não tens grupos')).toBeTruthy();
    // Nome exato: um GroupCard (ex.: "Férias Algarve · 3 pessoas · ...") também
    // é um <button> cujo texto contém "pessoas" — /pessoas/i sozinho apanhava
    // os dois. "Gerir pessoas" (o aria-label do controlo novo) é inequívoco.
    fireEvent.click(screen.getByRole('button', { name: 'Gerir pessoas' }));
    expect(screen.getByText('Gerir pessoas')).toBeTruthy();
  });
});
