import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import Shell from './Shell.jsx';

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

// DeviceProvider usa 'desktop' por omissão em ecrãs >= 900px (ver
// src/store/device.jsx) — o cabeçalho com avatar é só do layout mobile,
// por isso força-se a largura, tal como o assistantFab.test.jsx faz.
function setViewportWidth(w) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => cleanup());

describe('Shell: cabeçalho com avatar e saudação', () => {
  it('sauda pelo nome derivado do email de teste e mostra o avatar', async () => {
    setViewportWidth(500);
    await renderWithStore(<Shell />, { fixture: richFixture() });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Olá, Test');
    expect(screen.getByRole('img', { name: 'test@example.com' })).toBeTruthy();
  });
});
