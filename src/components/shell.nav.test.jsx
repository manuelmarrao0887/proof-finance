/* O Shell inteiro: cabeçalho, faixa de contexto, nav inferior, TODAS as tabs
   (com lazy loading real) e abertura de modais via UI — como um utilizador. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, act, screen } from '@testing-library/react';
import { renderWithStore, captureConsole } from '../test/renderWithStore.jsx';
import { richFixture, emptyFixture } from '../test/fixtures.js';
import { VALID_TABS } from '../store/ui.jsx';

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
vi.mock('../lib/lock.js', () => ({
  sha256Hex: () => Promise.resolve('abc'),
  isValidPin: (p) => /^\d{4}$/.test(String(p || '')),
  faceIdSupported: () => false,
  registerFaceId: () => Promise.resolve(null),
  verifyFaceId: () => Promise.resolve(false),
}));

import Shell from './Shell.jsx';

// Lista real de ../store/ui.jsx (antes estava copiada à mão aqui e tinha
// derivado — faltava 'groups', pelo que esta suite nunca exercia essa tab).
const TABS = VALID_TABS;
const MODALS = ['action', 'more', 'add', 'income', 'goal', 'rec', 'acct', 'transfer', 'cardpay', 'stmt', 'settings', 'position', 'housing', 'rules', 'cat', 'patchNotes', 'lock'];
const IGNORE = [/not wrapped in act/i];
const realErrors = (list) => list.filter((m) => !IGNORE.some((re) => re.test(m)));

// Espera que os chunks lazy (views/modais) resolvam: até o "A carregar…"
// desaparecer (máx. ~1s), em vez de um número fixo de ticks (era flaky).
const settle = async () => {
  for (let i = 0; i < 40; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    if (i >= 2 && !document.body.textContent.includes('A carregar…')) return;
  }
};

afterEach(() => cleanup());

describe('Shell — navegação completa', () => {
  it('percorre todas as tabs com dados ricos sem erros', async () => {
    const cap = captureConsole();
    let uiRef;
    try {
      await renderWithStore(<Shell />, { fixture: richFixture(), onReady: ({ ui }) => (uiRef = ui) });
      await settle();
      for (const t of TABS) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => uiRef.goTab(t));
        // eslint-disable-next-line no-await-in-loop
        await settle();
        expect(document.body.textContent.length, 'tab ' + t).toBeGreaterThan(50);
        expect(document.body.textContent, 'tab ' + t).not.toMatch(/A carregar…/);
      }
    } finally {
      cap.restore();
    }
    expect(realErrors(cap.errors)).toEqual([]);
    expect(realErrors(cap.warns)).toEqual([]);
  });

  it('percorre todas as tabs com conta vazia (onboarding)', async () => {
    const cap = captureConsole();
    let uiRef;
    try {
      await renderWithStore(<Shell />, { fixture: emptyFixture(), onReady: ({ ui }) => (uiRef = ui) });
      await settle();
      expect(document.body.textContent).toMatch(/Começa em quatro passos/);
      for (const t of TABS) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => uiRef.goTab(t));
        // eslint-disable-next-line no-await-in-loop
        await settle();
      }
    } finally {
      cap.restore();
    }
    expect(realErrors(cap.errors)).toEqual([]);
  });

  it('abre e fecha todos os modais a partir do Shell', async () => {
    const cap = captureConsole();
    let uiRef;
    try {
      await renderWithStore(<Shell />, { fixture: richFixture(), onReady: ({ ui }) => (uiRef = ui) });
      await settle();
      for (const m of MODALS) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => uiRef.open(m));
        // eslint-disable-next-line no-await-in-loop
        await settle();
        // eslint-disable-next-line no-await-in-loop
        await act(async () => uiRef.close(m));
      }
    } finally {
      cap.restore();
    }
    expect(realErrors(cap.errors)).toEqual([]);
  });

  it('nav inferior tem os 4 destinos + botão de adicionar', async () => {
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await settle();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(4);
    expect(document.body.textContent).toMatch(/Resumo|Despesas|Metas|Mais/);
  });
});
