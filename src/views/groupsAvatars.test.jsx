import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
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

afterEach(() => cleanup());

describe('avatares nos grupos', () => {
  it('o card do grupo mostra os membros como avatares sobrepostos', async () => {
    const { container } = await renderWithStore(<GroupsView />, { fixture: richFixture() });
    const card = container.querySelector('.cd .avatar-stack');
    expect(card).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Ana' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'João' }).length).toBeGreaterThan(0);
  });
  it('a faixa Grupos do Resumo mostra as pessoas dos grupos ativos', async () => {
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    const strip = Array.from(container.querySelectorAll('button.cd')).find((b) => /Grupos/.test(b.getAttribute('aria-label') || ''));
    expect(strip).toBeTruthy();
    expect(strip.querySelector('.avatar-stack')).toBeTruthy();
  });
});
