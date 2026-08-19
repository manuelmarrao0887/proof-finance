import { describe, it, expect } from 'vitest';
import { computeDiff, SUBCOLLECTIONS } from './data.js';

describe('computeDiff (sync de subcoleções)', () => {
  it('prev=null → tudo é upsert; root escrito', () => {
    const state = {
      addedExp: [{ id: 'm1', amount: 10 }],
      customAccts: [{ id: 'a1', bank: 'X' }],
      theme: 'dark',
    };
    const { upserts, deletes, root } = computeDiff(state, null);
    expect(deletes).toHaveLength(0);
    expect(upserts).toEqual(
      expect.arrayContaining([
        { key: 'addedExp', id: 'm1', data: { id: 'm1', amount: 10 } },
        { key: 'customAccts', id: 'a1', data: { id: 'a1', bank: 'X' } },
      ])
    );
    expect(root).toBeTruthy();
    expect(root.theme).toBe('dark');
  });

  it('registo inalterado → não escreve; alterado → upsert', () => {
    const prev = { addedExp: [{ id: 'm1', amount: 10 }, { id: 'm2', amount: 5 }] };
    const state = { addedExp: [{ id: 'm1', amount: 10 }, { id: 'm2', amount: 7 }] };
    const { upserts, deletes } = computeDiff(state, prev);
    expect(upserts).toEqual([{ key: 'addedExp', id: 'm2', data: { id: 'm2', amount: 7 } }]);
    expect(deletes).toHaveLength(0);
  });

  it('registo removido → delete', () => {
    const prev = { addedExp: [{ id: 'm1', amount: 10 }, { id: 'm2', amount: 5 }] };
    const state = { addedExp: [{ id: 'm1', amount: 10 }] };
    const { upserts, deletes } = computeDiff(state, prev);
    expect(upserts).toHaveLength(0);
    expect(deletes).toEqual([{ key: 'addedExp', id: 'm2' }]);
  });

  it('novo registo → upsert; sem alteração no root → root null', () => {
    const prev = { addedExp: [{ id: 'm1', amount: 10 }], theme: 'dark' };
    const state = { addedExp: [{ id: 'm1', amount: 10 }, { id: 'm3', amount: 3 }], theme: 'dark' };
    const { upserts, deletes, root } = computeDiff(state, prev);
    expect(upserts).toEqual([{ key: 'addedExp', id: 'm3', data: { id: 'm3', amount: 3 } }]);
    expect(deletes).toHaveLength(0);
    expect(root).toBeNull();
  });

  it('mudança só no root (theme) → root escrito, sem upserts', () => {
    const prev = { addedExp: [{ id: 'm1', amount: 10 }], theme: 'dark' };
    const state = { addedExp: [{ id: 'm1', amount: 10 }], theme: 'light' };
    const { upserts, deletes, root } = computeDiff(state, prev);
    expect(upserts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
    expect(root.theme).toBe('light');
  });

  it('mapa slice→subcoleção correto', () => {
    expect(SUBCOLLECTIONS.addedExp).toBe('movements');
    expect(SUBCOLLECTIONS.customAccts).toBe('accounts');
    expect(SUBCOLLECTIONS.balanceLog).toBe('balances');
    expect(SUBCOLLECTIONS.bdg).toBe('categories');
  });
});

describe('SUBCOLLECTIONS', () => {
  it('cobre os slices de grupos', () => {
    expect(SUBCOLLECTIONS.people).toBe('people');
    expect(SUBCOLLECTIONS.groups).toBe('groups');
    expect(SUBCOLLECTIONS.groupEntries).toBe('groupEntries');
  });
});
