/* Liga a secção "Grupos" ao resto da app: o Resumo mostra quanto os amigos
   devem/deves (sem entrar no património nem no orçamento) e as Despesas
   marcam os movimentos que vieram de um grupo, redirigindo a edição para a
   sheet de despesa de grupo. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent, within } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture, emptyFixture } from '../test/fixtures.js';
import { useUI } from '../store/ui.jsx';
import OverviewView from './OverviewView.jsx';
import ExpensesView from './ExpensesView.jsx';

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

// A lista de despesas mostra o MÊS CORRENTE. Uma data fixa ("2026-08-12")
// deixa de aparecer assim que o mês vira e os testes passam a falhar sem que
// nada de código tenha mudado — por isso a data é sempre do mês de hoje,
// como já faz o richFixture (test/fixtures.js).
const thisMonth = (dd) => {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
};

// `onReady` (renderWithStore) só entrega o `ui` do momento do mount — o efeito
// que o chama só corre uma vez. Para ler tab/modais DEPOIS de uma interação
// precisamos de algo que se atualize a cada render; este espião fá-lo através
// de uma ref mutável, sem depender do valor congelado do onReady.
function UISpy({ uiRef }) {
  uiRef.current = useUI();
  return null;
}

describe('integração com o resto da app', () => {
  it('o Resumo mostra quanto os amigos te devem', async () => {
    await renderWithStore(<OverviewView />, { fixture: richFixture(), tab: 'overview' });
    expect(screen.getByText(/devem-te/i)).toBeTruthy();
  });

  it('sem grupos o Resumo não mostra a linha', async () => {
    await renderWithStore(<OverviewView />, { fixture: emptyFixture(), tab: 'overview' });
    expect(screen.queryByText(/devem-te/i)).toBeNull();
  });

  it('grupo com as contas acertadas não mostra a linha no Resumo', async () => {
    const fixture = { ...richFixture(), groupEntries: [] }; // grupo existe, mas sem despesas/acertos → saldo 0
    await renderWithStore(<OverviewView />, { fixture, tab: 'overview' });
    expect(screen.queryByText(/devem-te/i)).toBeNull();
    expect(screen.queryByText(/^Deves /)).toBeNull();
  });

  it('grupo arquivado não conta para a linha no Resumo, mesmo com saldo por acertar', async () => {
    const base = richFixture();
    const fixture = { ...base, groups: base.groups.map((g) => ({ ...g, archived: true })) };
    await renderWithStore(<OverviewView />, { fixture, tab: 'overview' });
    expect(screen.queryByText(/devem-te/i)).toBeNull();
  });

  it('com "Ocultar saldos" ativo, o cartão de Grupos no Resumo mascara os valores, incluindo o aria-label (I1)', async () => {
    // richFixture: ge-1 (300€, "me" pagou, parte de 100€) + ge-2 (acerto de
    // Ana 50€ para "me") -> owedToMe = 300 - 100 - 50 = 150€. Sem a máscara
    // este valor aparecia em claro mesmo com "Ocultar saldos" ativo, ao
    // contrário de todas as outras figuras do Resumo (gastos, orçamento…).
    const fixture = { ...richFixture(), balancesHidden: true };
    await renderWithStore(<OverviewView />, { fixture, tab: 'overview' });

    const card = screen.getByRole('button', { name: /grupos/i });
    // aria-label: protege quem usa leitor de ecrã tanto quanto o texto visível.
    expect(card.getAttribute('aria-label')).toBe('Grupos — amigos devem-te ••••');
    expect(within(card).getByText('Amigos devem-te ••••')).toBeTruthy();
    expect(screen.queryByText(/150,00\s*€/)).toBeNull();
  });

  it('o cartão de Grupos no Resumo navega para o separador Grupos ao tocar', async () => {
    const uiRef = { current: null };
    await renderWithStore(
      <>
        <UISpy uiRef={uiRef} />
        <OverviewView />
      </>,
      { fixture: richFixture(), tab: 'overview' }
    );
    fireEvent.click(screen.getByRole('button', { name: /amigos devem-te/i }));
    expect(uiRef.current.tab).toBe('groups');
  });

  it('um movimento ligado a um grupo mostra o selo', async () => {
    const fixture = {
      ...richFixture(),
      addedExp: [
        ...(richFixture().addedExp || []),
        { id: 'exp-linked', desc: 'Airbnb', amount: 100, cat: 'cas', date: thisMonth(12), groupEntryId: 'ge-1' },
      ],
    };
    await renderWithStore(<ExpensesView />, { fixture, tab: 'expenses' });
    // O movimento só é listado individualmente dentro da categoria expandida
    // (modo orçamento, como o resto do ficheiro) — expande "Prestação Casa".
    fireEvent.click(screen.getByText('Prestação Casa'));
    expect(screen.getAllByText(/grupo/i).length).toBeGreaterThan(0);
  });

  it('editar um movimento ligado a um grupo abre a sheet de despesa de grupo com a entry correspondente', async () => {
    const uiRef = { current: null };
    const fixture = {
      ...richFixture(),
      addedExp: [
        ...(richFixture().addedExp || []),
        { id: 'exp-linked', desc: 'Airbnb', amount: 100, cat: 'cas', date: thisMonth(12), groupEntryId: 'ge-1' },
      ],
    };
    await renderWithStore(
      <>
        <UISpy uiRef={uiRef} />
        <ExpensesView />
      </>,
      { fixture, tab: 'expenses' }
    );
    // Expande a categoria "Prestação Casa" (cat 'cas') para revelar a linha.
    fireEvent.click(screen.getByText('Prestação Casa'));
    fireEvent.click(screen.getByLabelText('Editar despesa'));
    expect(uiRef.current.modals.gexp).toMatchObject({ id: 'ge-1', groupId: 'g-ferias', desc: 'Airbnb' });
    expect(uiRef.current.modals.add).toBeNull();
  });

  it('um movimento com groupEntryId órfão (entry inexistente) cai no comportamento normal de edição', async () => {
    const uiRef = { current: null };
    const fixture = {
      ...richFixture(),
      addedExp: [
        ...(richFixture().addedExp || []),
        { id: 'exp-orphan', desc: 'Estadia', amount: 50, cat: 'cas', date: thisMonth(12), groupEntryId: 'ge-does-not-exist' },
      ],
    };
    await renderWithStore(
      <>
        <UISpy uiRef={uiRef} />
        <ExpensesView />
      </>,
      { fixture, tab: 'expenses' }
    );
    fireEvent.click(screen.getByText('Prestação Casa'));
    fireEvent.click(screen.getByLabelText('Editar despesa'));
    expect(uiRef.current.modals.add).toEqual({ editId: 'exp-orphan' });
    expect(uiRef.current.modals.gexp).toBeNull();
  });
});
