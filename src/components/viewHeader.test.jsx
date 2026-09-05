import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import Shell from './Shell.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
beforeEach(() => { history.replaceState(null, '', '/'); });
afterEach(() => cleanup());

// MoreMenu (como todos os modais) é montado via lazy()/Suspense (ver
// MODAL_COMPONENTS em Shell.jsx) — o chunk resolve num microtask/macrotask
// depois do render inicial, por isso esperamos até o texto aparecer em vez
// de assumir que um único tick chega (mesmo padrão de shell.nav.test.jsx).
async function waitForText(text) {
  for (let i = 0; i < 40; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    if (document.body.textContent.includes(text)) return;
  }
}

describe('cabeçalho de vista e URL', () => {
  it('um destino de "Mais" tem título, voltar leva ao Resumo e a URL reflete a tab', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: richFixture(), tab: 'cal' });
    expect(screen.getByRole('heading', { level: 1, name: 'Calendário' })).toBeTruthy();
    expect(window.location.search).toContain('tab=cal');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Voltar' })); });
    expect(screen.queryByRole('heading', { level: 1, name: 'Calendário' })).toBeNull();
    expect(window.location.search).not.toContain('tab=cal');
  });
  it('"Mais" tem secções', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: richFixture(), openModal: 'more' });
    await waitForText('Registos');
    // getAllByText (não getByText): a secção "Análise" tem um item chamado
    // "Análise" (Relatório, Task 11) lá dentro — o texto aparece 2x de
    // propósito (rótulo da secção + título do destino).
    for (const s of ['Registos', 'Análise', 'Assistente']) expect(screen.getAllByText(s).length).toBeGreaterThan(0);
  });
});
