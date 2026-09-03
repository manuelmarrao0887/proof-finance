import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
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

describe('Resumo compacto', () => {
  it('insight de anomalia mostra o logo do comerciante e o botão ✓ sem texto', async () => {
    await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'Pingo Doce' }).length).toBeGreaterThan(0);
    const btn = screen.getAllByRole('button', { name: 'Está certo, dispensar aviso' })[0];
    expect(btn.textContent.trim()).toBe('');
    expect(screen.queryByText('Está certo')).toBeNull();
    expect(screen.getByText('Fora do padrão')).toBeTruthy();
  });
  it('o fecho do mês, quando aparece, usa tiles em vez da frase "Onde foi"', async () => {
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.queryByText(/Onde foi/)).toBeNull();
    const closing = Array.from(container.querySelectorAll('.cd')).find((el) => /Fecho de/.test(el.textContent));
    if (closing) expect(closing.querySelectorAll('.tile').length).toBeGreaterThan(0);
  });
});
