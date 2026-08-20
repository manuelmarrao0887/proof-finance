/* Testes de comportamento de GroupSheet e PersonSheet (Task 7) — para além do
   smoke test em modals.render.test.jsx, cobre o que realmente importa:
   - as duas validações de cada sheet (mensagens exatas do brief);
   - o bloqueio de remover um membro com movimentos no grupo — uma cláusula de
     cada vez (ver `fixtureWithLockCases` abaixo), para que apagar qualquer
     condição de personLockedIn (GroupSheet.jsx) faça pelo menos um teste
     falhar, e não só quando várias condições coincidem na mesma pessoa;
   - o bloqueio de apagar uma pessoa em uso, com o toast exato;
   - o aviso do toggle "Refletir a minha parte nas Despesas" com a contagem
     certa, nos dois sentidos, e que cancelar a confirmação não muda nada;
   - a cor de pré-visualização de uma nova pessoa nunca diverge da que fica
     realmente gravada (as duas usam o mesmo helper `nextAvatarColor`). */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { nextAvatarColor } from '../store/store.jsx';

// jsdom normaliza `style.background` de "#rrggbb" para "rgb(r, g, b)" ao lê-lo
// de volta — converte-se a cor esperada da mesma forma antes de comparar.
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ') + ')';
}

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

    expect(screen.getByText('Ana está em grupos — tira essa pessoa do grupo antes de apagar.')).toBeTruthy();
    expect(actionsRef.getState().people.some((p) => p.name === 'Ana')).toBe(true);
  });

  it('a cor de pré-visualização da próxima pessoa é a mesma que fica gravada', async () => {
    const fixture = richFixture();
    let actionsRef;
    const { container } = await renderWithStore(<PersonSheet />, {
      fixture,
      openModal: 'person',
      payload: true,
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    // Ambos calculados por nextAvatarColor (store.jsx) — a pré-visualização
    // (Avatar do formulário "Nova pessoa", o último span aria-hidden do DOM,
    // depois dos avatares da lista) usa o mesmo helper que addPerson vai usar
    // para gravar, por isso não podem divergir.
    const expected = nextAvatarColor(fixture.people);
    const avatars = container.querySelectorAll('span[aria-hidden="true"]');
    const preview = avatars[avatars.length - 1];
    expect(preview.style.background).toBe(hexToRgb(expected));

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Carla' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    const saved = actionsRef.getState().people.find((p) => p.name === 'Carla');
    expect(saved.color).toBe(expected);
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

  // Cada teste de remoção abaixo isola UMA cláusula de personLockedIn
  // (GroupSheet.jsx): Rui só é pagador, Sofia só está num acerto, Mia não
  // tem nenhuma entrada. João (fixture base, sem alterações) só está nas
  // shares. Nenhuma destas pessoas está presa por mais do que uma condição —
  // ao contrário da Ana da fixture, que é simultaneamente uma share e a
  // origem de um acerto, por isso não serve para testar as cláusulas em
  // isolado (apagar qualquer uma delas continuaria a bloqueá-la).
  function fixtureWithLockCases() {
    const fixture = richFixture();
    fixture.people = [
      ...fixture.people,
      { id: 'p-rui', name: 'Rui', color: '#7b5fe0', createdAt: 10 },
      { id: 'p-sofia', name: 'Sofia', color: '#f25592', createdAt: 11 },
      { id: 'p-mia', name: 'Mia', color: '#3fc97a', createdAt: 12 },
    ];
    fixture.groups = fixture.groups.map((g) =>
      g.id === 'g-ferias' ? { ...g, memberIds: [...g.memberIds, 'p-rui', 'p-sofia', 'p-mia'] } : g
    );
    fixture.groupEntries = [
      ...fixture.groupEntries,
      // Rui pagou "Presente surpresa" mas não está nas próprias shares dela
      // (nem de nenhuma outra) — pina isoladamente `e.payerId === personId`.
      {
        id: 'ge-payer-only', groupId: 'g-ferias', kind: 'expense', desc: 'Presente surpresa',
        amount: 40, date: '2026-08-13', payerId: 'p-rui', splitMode: 'equal', gcat: 'other', reflect: true,
        shares: [{ personId: 'me', amount: 20 }, { personId: 'p-ana', amount: 20 }],
        linkedExpId: null, createdAt: 6,
      },
      // Sofia só é o destino de um acerto — nenhuma despesa, nenhuma share —
      // pina isoladamente `e.fromId === personId || e.toId === personId`.
      {
        id: 'ge-settlement-only', groupId: 'g-ferias', kind: 'settlement',
        fromId: 'me', toId: 'p-sofia', amount: 30, date: '2026-08-19', method: 'cash', createdAt: 7,
      },
    ];
    return fixture;
  }

  it('bloqueia remover quem só está nas shares de uma despesa (João) — pina a cláusula shares', async () => {
    await renderWithStore(<GroupSheet />, {
      fixture: richFixture(),
      openModal: 'group',
      payload: { id: 'g-ferias' },
    });

    // João (p-joao): só está em ge-1.shares — nunca pagador, nunca num acerto.
    const chip = screen.getByRole('button', { name: 'João' });
    fireEvent.click(chip);

    expect(screen.getByText(/já tem movimentos neste grupo/)).toBeTruthy();
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('bloqueia remover um pagador que não está nas próprias shares (Rui) — pina a cláusula payerId', async () => {
    await renderWithStore(<GroupSheet />, {
      fixture: fixtureWithLockCases(),
      openModal: 'group',
      payload: { id: 'g-ferias' },
    });

    const chip = screen.getByRole('button', { name: 'Rui' });
    fireEvent.click(chip);

    expect(screen.getByText(/já tem movimentos neste grupo/)).toBeTruthy();
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('bloqueia remover quem só está num acerto, sem despesas (Sofia) — pina a cláusula fromId/toId', async () => {
    await renderWithStore(<GroupSheet />, {
      fixture: fixtureWithLockCases(),
      openModal: 'group',
      payload: { id: 'g-ferias' },
    });

    const chip = screen.getByRole('button', { name: 'Sofia' });
    fireEvent.click(chip);

    expect(screen.getByText(/já tem movimentos neste grupo/)).toBeTruthy();
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('permite remover livremente um membro sem nenhuma entrada (Mia) — caso positivo', async () => {
    let actionsRef;
    await renderWithStore(<GroupSheet />, {
      fixture: fixtureWithLockCases(),
      openModal: 'group',
      payload: { id: 'g-ferias' },
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    const chip = screen.getByRole('button', { name: 'Mia' });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /guardar alterações/i }));
    const saved = actionsRef.getState().groups.find((g) => g.id === 'g-ferias');
    expect(saved.memberIds).not.toContain('p-mia');
    // Só a Mia saiu — a remoção livre de um membro não mexe nos outros.
    expect(saved.memberIds).toContain('p-ana');
  });

  // A fixture "crua" (richFixture) tem "Airbnb" com reflect:true e uma parte
  // de 'me' > 0, mas SEM linkedExpId (nunca passou por addGroupEntry) — serve
  // para provar a contagem no sentido ON (que ainda se baseia em reflect+share)
  // sem interferência de um movimento já ligado.
  //
  // Para o sentido OFF a contagem certa é por linkedExpId (setGroupReflect só
  // apaga o que já está ligado) — por isso este describe liga "Airbnb" a um
  // movimento real em addedExp antes de testar o desligar.
  function fixtureWithLinkedAirbnb() {
    const fixture = richFixture();
    fixture.addedExp = [
      ...fixture.addedExp,
      { id: 'exp-airbnb', desc: 'Airbnb', amount: 100, cat: 'cas', date: '2026-08-12', groupEntryId: 'ge-1' },
    ];
    fixture.groupEntries = fixture.groupEntries.map((e) => (e.id === 'ge-1' ? { ...e, linkedExpId: 'exp-airbnb' } : e));
    return fixture;
  }

  it('toggle "Refletir a minha parte nas Despesas" avisa quantos movimentos apaga, e cancelar não muda nada', async () => {
    let actionsRef;
    await renderWithStore(<GroupSheet />, {
      fixture: fixtureWithLinkedAirbnb(),
      openModal: 'group',
      payload: { id: 'g-ferias' },
      onReady: ({ actions }) => { actionsRef = actions; },
    });

    const toggle = screen.getByLabelText('Refletir a minha parte nas Despesas');
    expect(toggle.checked).toBe(true);

    // Só "Airbnb" tem linkedExpId (o acerto da fixture nunca teria um) — N = 1.
    window.confirm = vi.fn(() => false);
    fireEvent.click(toggle);
    expect(window.confirm).toHaveBeenCalledWith('Isto vai apagar 1 movimento das tuas Despesas.');
    expect(actionsRef.getState().groups.find((g) => g.id === 'g-ferias').reflectMine).toBe(true);

    window.confirm = vi.fn(() => true);
    fireEvent.click(toggle);
    expect(window.confirm).toHaveBeenCalledWith('Isto vai apagar 1 movimento das tuas Despesas.');
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

    expect(window.confirm).toHaveBeenCalledWith('Isto vai criar 1 movimento nas tuas Despesas.');
    expect(actionsRef.getState().groups.find((g) => g.id === 'g-ferias').reflectMine).toBe(true);
  });

  it('desligar não promete apagar uma despesa que refletia mas cujo movimento ligado já desapareceu (M6)', async () => {
    // richFixture "crua": "Airbnb" tem reflect:true e parte de 'me' > 0, mas
    // linkedExpId é null (não há movimento nenhum para apagar). A contagem
    // antiga (reflect+share) dizia "1" aqui e prometia um apagão que
    // setGroupReflect nunca fazia — a correta conta por linkedExpId e dá 0.
    let actionsRef;
    await renderWithStore(<GroupSheet />, {
      fixture: richFixture(),
      openModal: 'group',
      payload: { id: 'g-ferias' },
      onReady: ({ actions }) => { actionsRef = actions; },
    });
    const before = actionsRef.getState().addedExp.length;

    const toggle = screen.getByLabelText('Refletir a minha parte nas Despesas');
    window.confirm = vi.fn(() => true);
    fireEvent.click(toggle);

    expect(window.confirm).toHaveBeenCalledWith('Isto vai apagar 0 movimentos das tuas Despesas.');
    expect(actionsRef.getState().addedExp.length).toBe(before); // nada para apagar, e nada apagado
  });
});
