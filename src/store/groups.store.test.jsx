import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { initialPersisted } from '../store/store.jsx';

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

describe('actions de movimentos de grupo', () => {
  it('addGroupEntry num grupo que reflete devolve o id e cria só a minha parte em addedExp', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', name: 'Férias', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Jantar', amount: 40, date: '2026-08-12',
        payerId: 'me', gcat: 'food', reflect: true,
        shares: [{ personId: 'me', amount: 20 }, { personId: 'a', amount: 20 }],
      });
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    const st = actions.getState();
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].amount).toBe(20); // a minha parte, não os 40 totais
    expect(st.addedExp[0].groupEntryId).toBe(id);
    const entry = st.groupEntries.find((e) => e.id === id);
    expect(entry.linkedExpId).toBe(st.addedExp[0].id);
  });

  it('addGroupEntry de um acerto não mexe em addedExp', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    act(() => actions.addGroupEntry({ id: 's1', groupId: 'g1', kind: 'settlement', fromId: 'a', toId: 'me', amount: 100 }));
    expect(actions.getState().addedExp).toEqual([]);
  });

  it('addGroupEntry define linkedExpId como null (nunca undefined) quando não há movimento', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', amount: 20, date: '2026-08-01', reflect: false,
        shares: [{ personId: 'me', amount: 10 }],
      });
    });
    const entry = actions.getState().groupEntries.find((e) => e.id === id);
    expect('linkedExpId' in entry).toBe(true);
    expect(entry.linkedExpId).toBeNull();
  });

  it('updateGroupEntry ligado→ligado atualiza o movimento existente mantendo o mesmo id', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Táxi', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    const firstExpId = actions.getState().addedExp[0].id;
    act(() => actions.updateGroupEntry(id, {
      desc: 'Táxi aeroporto',
      shares: [{ personId: 'me', amount: 15 }, { personId: 'a', amount: 5 }],
    }));
    const st = actions.getState();
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].id).toBe(firstExpId);
    expect(st.addedExp[0].amount).toBe(15);
    expect(st.addedExp[0].desc).toBe('Táxi aeroporto');
  });

  it('updateGroupEntry sem ligação→ligado cria o movimento quando a despesa passa a refletir', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', amount: 20, date: '2026-08-01', reflect: false,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    expect(actions.getState().addedExp).toEqual([]);
    act(() => actions.updateGroupEntry(id, { reflect: true }));
    const st = actions.getState();
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].amount).toBe(10);
    const entry = st.groupEntries.find((e) => e.id === id);
    expect(entry.linkedExpId).toBe(st.addedExp[0].id);
  });

  it('updateGroupEntry ligado→sem ligação remove o movimento e limpa linkedExpId', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    expect(actions.getState().addedExp.length).toBe(1);
    act(() => actions.updateGroupEntry(id, { reflect: false }));
    const st = actions.getState();
    expect(st.addedExp).toEqual([]);
    const entry = st.groupEntries.find((e) => e.id === id);
    expect(entry.linkedExpId).toBeNull();
  });

  it('updateGroupEntry cria um movimento novo e repõe linkedExpId quando o alvo já não existe em addedExp (I3, id morto)', async () => {
    let actions;
    let dispatch;
    await renderWithStore(<div />, { onReady: (r) => { actions = r.actions; dispatch = r.dispatch; } });

    // Estado com uma group entry já "ligada" a um addedExp que nunca existiu
    // nesta sessão — simula commit() (firebase/data.js) gravar upserts e
    // deletes em lotes separados: uma falha a meio pode persistir um
    // movimento apagado com linkedExpId ainda a apontar para ele. Hydrata-se
    // o estado diretamente (não via addGroupEntry/deleteExpense, que
    // reconciliam linkedExpId) para reproduzir exatamente esse cenário.
    act(() => {
      dispatch({
        type: 'hydrate',
        persisted: {
          ...initialPersisted(),
          groups: [{ id: 'g1', memberIds: ['me', 'a'], reflectMine: true, archived: false }],
          groupEntries: [{
            id: 'ge1', groupId: 'g1', kind: 'expense', desc: 'Táxi', amount: 20, date: '2026-08-01',
            reflect: true, shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
            linkedExpId: 'ghost-exp',
          }],
          addedExp: [], // "ghost-exp" não existe — o alvo do linkedExpId está morto
        },
      });
    });

    act(() => actions.updateGroupEntry('ge1', { desc: 'Táxi aeroporto' }));

    const st = actions.getState();
    // Antes: o map() sobre addedExp era um no-op silencioso (nenhum x.id batia
    // com 'ghost-exp') — nem movimento novo, nem aviso; o reflexo perdia-se.
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].desc).toBe('Táxi aeroporto');
    expect(st.addedExp[0].amount).toBe(10);
    const entry = st.groupEntries.find((e) => e.id === 'ge1');
    expect(entry.linkedExpId).toBe(st.addedExp[0].id); // repontado para o novo movimento
    expect(entry.linkedExpId).not.toBe('ghost-exp');
  });

  it('updateGroupEntry sem ligação→sem ligação não mexe em addedExp', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', amount: 20, date: '2026-08-01', reflect: false,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    act(() => actions.updateGroupEntry(id, { desc: 'Novo nome' }));
    const st = actions.getState();
    expect(st.addedExp).toEqual([]);
    const entry = st.groupEntries.find((e) => e.id === id);
    expect(entry.linkedExpId).toBeNull();
    expect(entry.desc).toBe('Novo nome');
  });

  it('deleteGroupEntry remove a despesa e o movimento ligado, sem afetar outras despesas', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id1;
    let id2;
    act(() => {
      id1 = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'A', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    act(() => {
      id2 = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'B', amount: 30, date: '2026-08-02', reflect: true,
        shares: [{ personId: 'me', amount: 15 }, { personId: 'a', amount: 15 }],
      });
    });
    expect(actions.getState().addedExp.length).toBe(2);
    act(() => actions.deleteGroupEntry(id1));
    const st = actions.getState();
    expect(st.groupEntries.find((e) => e.id === id1)).toBeUndefined();
    expect(st.groupEntries.find((e) => e.id === id2)).toBeDefined();
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].desc).toBe('B');
  });

  it('setGroupReflect(false) remove só os movimentos do grupo indicado', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    act(() => actions.addGroup({ id: 'g2', memberIds: ['me', 'b'] }));
    let e1;
    act(() => {
      e1 = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'G1', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    act(() => actions.addGroupEntry({
      groupId: 'g2', kind: 'expense', desc: 'G2', amount: 30, date: '2026-08-02', reflect: true,
      shares: [{ personId: 'me', amount: 15 }, { personId: 'b', amount: 15 }],
    }));
    expect(actions.getState().addedExp.length).toBe(2);
    act(() => actions.setGroupReflect('g1', false));
    const st = actions.getState();
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].desc).toBe('G2');
    expect(st.groupEntries.find((e) => e.id === e1).linkedExpId).toBeNull();
    expect(st.groups.find((g) => g.id === 'g1').reflectMine).toBe(false);
  });

  it('setGroupReflect(true) recria os movimentos, ignora reflect=false e acertos, e não duplica em chamadas repetidas', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let e1;
    let e2;
    let e3;
    act(() => {
      e1 = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Reflete', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    act(() => {
      e2 = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Não reflete', amount: 20, date: '2026-08-01', reflect: false,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    act(() => {
      e3 = actions.addGroupEntry({ groupId: 'g1', kind: 'settlement', fromId: 'a', toId: 'me', amount: 5 });
    });
    expect(actions.getState().addedExp.length).toBe(1); // só e1

    act(() => actions.setGroupReflect('g1', false));
    expect(actions.getState().addedExp).toEqual([]);

    act(() => actions.setGroupReflect('g1', true));
    let st = actions.getState();
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].desc).toBe('Reflete');
    expect(st.groupEntries.find((e) => e.id === e2).linkedExpId).toBeNull();
    expect(st.groupEntries.find((e) => e.id === e3).linkedExpId).toBeNull();

    // repetir com o mesmo valor não duplica o movimento
    act(() => actions.setGroupReflect('g1', true));
    st = actions.getState();
    expect(st.addedExp.length).toBe(1);
  });
});

describe('deleteGroup', () => {
  it('apaga só os movimentos ligados ao grupo apagado, deixando os de outros grupos intactos (M7)', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    act(() => actions.addGroup({ id: 'g2', memberIds: ['me', 'b'] }));
    act(() => actions.addGroupEntry({
      groupId: 'g1', kind: 'expense', desc: 'G1', amount: 20, date: '2026-08-01', reflect: true,
      shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
    }));
    act(() => actions.addGroupEntry({
      groupId: 'g2', kind: 'expense', desc: 'G2', amount: 30, date: '2026-08-02', reflect: true,
      shares: [{ personId: 'me', amount: 15 }, { personId: 'b', amount: 15 }],
    }));
    expect(actions.getState().addedExp.length).toBe(2);

    act(() => actions.deleteGroup('g1'));

    const st = actions.getState();
    expect(st.groups.find((g) => g.id === 'g1')).toBeUndefined();
    expect(st.groups.find((g) => g.id === 'g2')).toBeDefined();
    expect(st.groupEntries.some((e) => e.groupId === 'g1')).toBe(false);
    expect(st.addedExp.length).toBe(1);
    expect(st.addedExp[0].desc).toBe('G2');
  });
});

describe('reconciliação de linkedExpId quando o movimento ligado desaparece de addedExp', () => {
  it('deleteExpense limpa o linkedExpId da group entry quando apaga o movimento ligado', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Táxi', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    const linkedId = actions.getState().addedExp[0].id;
    act(() => actions.deleteExpense(linkedId));
    const st = actions.getState();
    expect(st.addedExp).toEqual([]);
    expect(st.groupEntries.find((e) => e.id === id).linkedExpId).toBeNull();
  });

  it('deleteExpense de um movimento sem groupEntryId não mexe nas group entries', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Táxi', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    act(() => actions.addExpense({ id: 'solo', desc: 'Café', amount: 3, cat: 'rest', date: '2026-08-02' }));
    act(() => actions.deleteExpense('solo'));
    const st = actions.getState();
    expect(st.addedExp.length).toBe(1);
    expect(st.groupEntries.find((e) => e.id === id).linkedExpId).toBe(st.addedExp[0].id);
  });

  it('setAddedExp limpa o linkedExpId das group entries cujo movimento saiu numa substituição em bloco', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Táxi', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    act(() => actions.addExpense({ id: 'solo', desc: 'Café', amount: 3, cat: 'rest', date: '2026-08-02' }));
    expect(actions.getState().addedExp.length).toBe(2);
    // Simula uma substituição em bloco (ex.: "remover mês", dedupe) que
    // descarta o movimento ligado sem passar por deleteExpense.
    act(() => actions.setAddedExp(actions.getState().addedExp.filter((x) => x.id === 'solo')));
    const st = actions.getState();
    expect(st.addedExp.map((x) => x.id)).toEqual(['solo']);
    expect(st.groupEntries.find((e) => e.id === id).linkedExpId).toBeNull();
  });

  it('setAddedExp não mexe nas group entries quando o movimento ligado se mantém na lista', async () => {
    const actions = await mountActions();
    act(() => actions.addGroup({ id: 'g1', memberIds: ['me', 'a'] }));
    let id;
    act(() => {
      id = actions.addGroupEntry({
        groupId: 'g1', kind: 'expense', desc: 'Táxi', amount: 20, date: '2026-08-01', reflect: true,
        shares: [{ personId: 'me', amount: 10 }, { personId: 'a', amount: 10 }],
      });
    });
    const linkedId = actions.getState().addedExp[0].id;
    act(() => actions.setAddedExp(actions.getState().addedExp.map((x) => ({ ...x, desc: 'Táxi (editado)' }))));
    const st = actions.getState();
    expect(st.addedExp[0].id).toBe(linkedId);
    expect(st.groupEntries.find((e) => e.id === id).linkedExpId).toBe(linkedId);
  });
});
