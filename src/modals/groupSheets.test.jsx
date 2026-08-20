/* Testes de comportamento de GroupSheet e PersonSheet (Task 7) — para além do
   smoke test em modals.render.test.jsx, cobre o que realmente importa:
   - as duas validações de cada sheet (mensagens exatas do brief);
   - o bloqueio de remover um membro com movimentos no grupo (e que um membro
     sem movimentos continua livre para sair);
   - o bloqueio de apagar uma pessoa em uso, com o toast exato;
   - o aviso do toggle "Refletir a minha parte nas Despesas" com a contagem
     certa, nos dois sentidos, e que cancelar a confirmação não muda nada. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';

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

import GroupSheet from './GroupSheet.jsx';
import PersonSheet from './PersonSheet.jsx';

afterEach(() => {
  cleanup();
  // setup.js define o default (aceita sempre) — repor entre testes que o
  // sobrepõem para controlar a resposta da confirmação.
  window.confirm = vi.fn(() => true);
});

describe('PersonSheet', () => {
  it('nome vazio → erro inline "Escreve um nome." e não adiciona ninguém', async () => {
    let actionsRef;
    await renderWithStore(<PersonSheet />, {
      fixture: richFixture(),
      openModal: 'person',
      payload: true,
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByText('Escreve um nome.')).toBeTruthy();
    expect(actionsRef.getState().people.length).toBe(2);
  });

  it('nome repetido → erro inline "Já tens uma pessoa com esse nome." e não duplica', async () => {
    let actionsRef;
    await renderWithStore(<PersonSheet />, {
      fixture: richFixture(),
      openModal: 'person',
      payload: true,
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByText('Já tens uma pessoa com esse nome.')).toBeTruthy();
    expect(actionsRef.getState().people.length).toBe(2);
  });

  it('apagar pessoa em uso é bloqueado pelo store e mostra o toast, sem a remover', async () => {
    let actionsRef;
    await renderWithStore(<PersonSheet />, {
      fixture: richFixture(),
      openModal: 'person',
      payload: true,
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    // Ana (p-ana) está no grupo "Férias Algarve" da fixture.
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Ana' }));

    expect(screen.getByText('A Ana está em grupos — remove-a do grupo antes de apagar.')).toBeTruthy();
    expect(actionsRef.getState().people.some((p) => p.name === 'Ana')).toBe(true);
  });
});

describe('GroupSheet', () => {
  it('nome vazio ao criar → toast "Dá um nome ao grupo." e não cria grupo', async () => {
    let actionsRef;
    await renderWithStore(<GroupSheet />, {
      fixture: richFixture(),
      openModal: 'group',
      payload: true,
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    fireEvent.click(screen.getByRole('button', { name: /criar grupo/i }));

    expect(screen.getByText('Dá um nome ao grupo.')).toBeTruthy();
    expect(actionsRef.getState().groups.length).toBe(1);
  });

  it('menos de 2 membros ao criar → toast "Um grupo precisa de pelo menos mais uma pessoa." e não cria grupo', async () => {
    let actionsRef;
    await renderWithStore(<GroupSheet />, {
      fixture: richFixture(),
      openModal: 'group',
      payload: true,
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    // Nome válido, mas nenhuma pessoa selecionada além de "Tu" (fixo).
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Fim de semana' } });
    fireEvent.click(screen.getByRole('button', { name: /criar grupo/i }));

    expect(screen.getByText('Um grupo precisa de pelo menos mais uma pessoa.')).toBeTruthy();
    expect(actionsRef.getState().groups.length).toBe(1);
  });

  it('remoção de membro: bloqueia quem tem movimentos no grupo, permite quem não tem', async () => {
    const fixture = richFixture();
    // Mia entra no grupo mas nunca aparece em nenhuma entrada — deve poder sair.
    fixture.people = [...fixture.people, { id: 'p-mia', name: 'Mia', color: '#3fc97a', createdAt: 10 }];
    fixture.groups = fixture.groups.map((g) =>
      g.id === 'g-ferias' ? { ...g, memberIds: [...g.memberIds, 'p-mia'] } : g
    );

    let actionsRef;
    await renderWithStore(<GroupSheet />, {
      fixture,
      openModal: 'group',
      payload: { id: 'g-ferias' },
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    // Ana: paga/partilha a despesa "Airbnb" e é origem do acerto — bloqueada.
    const anaChip = screen.getByRole('button', { name: 'Ana' });
    fireEvent.click(anaChip);
    expect(screen.getByText(/já tem movimentos neste grupo/)).toBeTruthy();
    expect(anaChip).toHaveAttribute('aria-pressed', 'true');

    // Mia: sem entradas — sai livremente.
    const miaChip = screen.getByRole('button', { name: 'Mia' });
    fireEvent.click(miaChip);
    expect(miaChip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /guardar alterações/i }));
    const saved = actionsRef.getState().groups.find((g) => g.id === 'g-ferias');
    expect(saved.memberIds).toContain('p-ana');
    expect(saved.memberIds).not.toContain('p-mia');
  });

  it('toggle "Refletir a minha parte nas Despesas" avisa quantos movimentos apaga, e cancelar não muda nada', async () => {
    let actionsRef;
    await renderWithStore(<GroupSheet />, {
      fixture: richFixture(),
      openModal: 'group',
      payload: { id: 'g-ferias' },
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    const toggle = screen.getByLabelText('Refletir a minha parte nas Despesas');
    expect(toggle.checked).toBe(true);

    // Só "Airbnb" (despesa, reflect!==false, com parte de 'me' > 0) conta —
    // o acerto (settlement) da fixture não entra na contagem. N = 1.
    window.confirm = vi.fn(() => false);
    fireEvent.click(toggle);
    expect(window.confirm).toHaveBeenCalledWith('Isto vai apagar 1 movimentos das tuas Despesas.');
    expect(actionsRef.getState().groups.find((g) => g.id === 'g-ferias').reflectMine).toBe(true);

    window.confirm = vi.fn(() => true);
    fireEvent.click(toggle);
    expect(window.confirm).toHaveBeenCalledWith('Isto vai apagar 1 movimentos das tuas Despesas.');
    expect(actionsRef.getState().groups.find((g) => g.id === 'g-ferias').reflectMine).toBe(false);
    expect(screen.getByText('Movimentos removidos das tuas Despesas')).toBeTruthy();
  });

  it('toggle "Refletir a minha parte nas Despesas" avisa quantos movimentos cria, ao ligar', async () => {
    const fixture = richFixture();
    fixture.groups = fixture.groups.map((g) => (g.id === 'g-ferias' ? { ...g, reflectMine: false } : g));

    let actionsRef;
    window.confirm = vi.fn(() => true);
    await renderWithStore(<GroupSheet />, {
      fixture,
      openModal: 'group',
      payload: { id: 'g-ferias' },
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    const toggle = screen.getByLabelText('Refletir a minha parte nas Despesas');
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    expect(window.confirm).toHaveBeenCalledWith('Isto vai criar 1 movimentos nas tuas Despesas.');
    expect(actionsRef.getState().groups.find((g) => g.id === 'g-ferias').reflectMine).toBe(true);
  });
});
