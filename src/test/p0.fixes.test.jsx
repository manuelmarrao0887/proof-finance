import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture, emptyFixture } from './fixtures.js';
import LoanView from '../views/LoanView.jsx';
import Shell from '../components/Shell.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {},
}));
afterEach(() => cleanup());

// new URL(..., import.meta.url) parte com "TypeError: The URL must be of
// scheme file" neste ambiente (caminho com espaços); mesmo padrão do
// assistantFab.test.jsx para ler tokens.css relativo ao ficheiro de teste.
const tokensDir = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.resolve(tokensDir, '../styles/tokens.css'), 'utf8');

describe('P0: reset e tema', () => {
  it('button herda a cor do texto (evita branco-sobre-claro em .cd)', () => {
    const rule = css.split('\n').find((l) => /^button\{/.test(l));
    expect(rule).toMatch(/color:inherit/);
  });
  it('color-scheme segue o data-theme, não o sistema', () => {
    expect(css).toMatch(/:root\{[^}]*color-scheme:\s*light/);
    expect(css).not.toMatch(/:root\{[^}]*color-scheme:\s*light dark/);
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*color-scheme:\s*dark/);
  });
});

describe('P0: NaN no crédito', () => {
  it('sem impostos preenchidos mostra "—" e nunca NaN', async () => {
    const fx = richFixture();
    fx.housing = { valorAquisicao: 200000, valorEmprestimo: 150000, taxa: 3, prazoAnos: 30 };
    await renderWithStore(<LoanView />, { fixture: fx });
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('P0: utilizador novo', () => {
  it('não abre as Novidades por cima de um utilizador sem dados', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: { ...emptyFixture(), lastSeenPatchVersion: 0 } });
    expect(screen.queryByRole('dialog', { name: /Novidades/ })).toBeNull();
    expect(screen.getByText('Começa em quatro passos')).toBeTruthy();
  });
  it('emptyFixture não dispara as Novidades no harness', () => {
    expect(emptyFixture().lastSeenPatchVersion).toBe(999);
  });
});
