import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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

  it('addGroup preenche os valores por defeito', async () => {
    const { AVATAR_COLORS, ME_ID } = await import('./store.jsx');
    expect(ME_ID).toBe('me');
    expect(AVATAR_COLORS.length).toBeGreaterThan(3);
  });
});
