import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

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

// Monta o StoreProvider real (sem UI visível) e devolve as `actions` do
// store, via o mesmo mecanismo `onReady` usado nos outros testes de fluxo.
async function mountActions() {
  let actions;
  await renderWithStore(<div />, { onReady: (r) => { actions = r.actions; } });
  return actions;
}

describe('slices de grupos', () => {
  it('arrancam vazios e são persistidos', async () => {
    const { initialPersisted, PERSISTED_KEYS } = await import('./store.jsx');
    const st = initialPersisted();
    expect(st.people).toEqual([]);
    expect(st.groups).toEqual([]);
    expect(st.groupEntries).toEqual([]);
    expect(PERSISTED_KEYS).toContain('people');
    expect(PERSISTED_KEYS).toContain('groups');
    expect(PERSISTED_KEYS).toContain('groupEntries');
  });

  it('hydrateFromDoc ignora valores que não são arrays', async () => {
    const { hydrateFromDoc } = await import('./store.jsx');
    const st = hydrateFromDoc({ people: 'lixo', groups: null, groupEntries: [{ id: 'e1' }] });
    expect(st.people).toEqual([]);
    expect(st.groups).toEqual([]);
    expect(st.groupEntries).toEqual([{ id: 'e1' }]);
  });

  it('expõe ME_ID e AVATAR_COLORS', async () => {
    const { AVATAR_COLORS, ME_ID } = await import('./store.jsx');
    expect(ME_ID).toBe('me');
    expect(AVATAR_COLORS.length).toBeGreaterThan(3);
  });

  it('addGroup preenche os valores por defeito', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ name: 'Férias' }));
    const group = actions.getState().groups.at(-1);
    expect(typeof group.id).toBe('string');
    expect(group.id.length).toBeGreaterThan(0);
    expect(group.emoji).toBe('👥');
    expect(group.type).toBe('trip');
    expect(group.currency).toBe('EUR');
    expect(group.memberIds).toEqual(['me']);
    expect(group.reflectMine).toBe(true);
    expect(group.archived).toBe(false);
  });

  it('addGroup garante ME_ID em memberIds, exatamente uma vez e em primeiro', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ name: 'Sem mim', memberIds: ['p1'] }));
    act(() => actions.addGroup({ name: 'Já com mim', memberIds: ['me', 'p1'] }));
    const groups = actions.getState().groups;
    expect(groups[0].memberIds).toEqual(['me', 'p1']);
    expect(groups[1].memberIds).toEqual(['me', 'p1']);
  });

  it('addPerson gera um id não vazio', async () => {
    const actions = await mountActions();
    act(() => actions.addPerson({ name: 'Ana' }));
    const person = actions.getState().people.at(-1);
    expect(typeof person.id).toBe('string');
    expect(person.id.length).toBeGreaterThan(0);
  });
});

describe('ligação às despesas pessoais', () => {
  it('criar despesa de grupo cria só a minha parte nas Despesas', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', name: 'Férias', memberIds: ['me', 'a', 'b', 'c'], reflectMine: true };
    const entry = {
      id: 'e1', groupId: 'g1', kind: 'expense', desc: 'Airbnb', amount: 620,
      date: '2026-08-12', payerId: 'me', gcat: 'stay', reflect: true,
      shares: [
        { personId: 'me', amount: 155 }, { personId: 'a', amount: 155 },
        { personId: 'b', amount: 155 }, { personId: 'c', amount: 155 },
      ],
    };
    const mov = reflectExpenseFor(group, entry);
    expect(mov.amount).toBe(155);
    expect(mov.desc).toBe('Airbnb');
    expect(mov.cat).toBe('cas');
    expect(mov.date).toBe('2026-08-12');
    expect(mov.groupEntryId).toBe('e1');
  });

  it('não cria movimento quando o grupo não reflete', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: false };
    const entry = { id: 'e1', groupId: 'g1', kind: 'expense', amount: 10, reflect: true, shares: [{ personId: 'me', amount: 5 }] };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });

  it('não cria movimento quando a despesa tem o toggle desligado', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: true };
    const entry = { id: 'e1', groupId: 'g1', kind: 'expense', amount: 10, reflect: false, shares: [{ personId: 'me', amount: 5 }] };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });

  it('não cria movimento quando não participo na despesa', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: true };
    const entry = { id: 'e1', groupId: 'g1', kind: 'expense', amount: 10, reflect: true, shares: [{ personId: 'a', amount: 10 }] };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });

  it('acertos nunca geram movimento pessoal', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: true };
    const entry = { id: 's1', groupId: 'g1', kind: 'settlement', fromId: 'a', toId: 'me', amount: 100 };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });
});
