import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import OverviewView from './OverviewView.jsx';
import SpendHero from '../components/SpendHero.jsx';
import { rankInsights } from '../lib/pulse.js';
import { initialPersisted } from '../store/store.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());

describe('Resumo com uma tese', () => {
  it('o hero é "Podes gastar hoje" com €/dia e uma frase com agência', async () => {
    const { container } = await renderWithStore(<SpendHero />, { fixture: richFixture() });
    expect(container.textContent).toMatch(/Podes gastar hoje/);
    expect(container.textContent).toMatch(/\/dia/);
    expect(container.textContent).toMatch(/Faltam-te|de sobra/);
    expect(container.textContent).not.toMatch(/acima do rendimento/);
  });
  it('o Resumo tem no máximo 6 cartões e não repete o que saiu para Gráficos e Relatório', async () => {
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(container.querySelectorAll('.cd').length).toBeLessThanOrEqual(6);
    for (const gone of ['Saúde financeira', 'Fecho de', 'Subscrições detectadas', 'Fundo de emergência', 'Projeção', 'Contas por categoria']) {
      expect(container.textContent, gone).not.toMatch(new RegExp(gone));
    }
    expect(container.textContent).toMatch(/Plano do mês/);
    expect(container.textContent).toMatch(/Disponível/);
  });
  it('mostra um único insight, o mais grave, e "Ver mais"', async () => {
    const s = { ...initialPersisted(), ...richFixture(), currentUser: { uid: 'u' } };
    const ranked = rankInsights(s);
    expect(ranked[0].tone).toBe('alert');
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.getAllByRole('button', { name: 'Está certo, dispensar aviso' }).length).toBe(1);
    expect(screen.getByRole('button', { name: /Ver mais/ })).toBeTruthy();
    expect(container.textContent).toContain(ranked[0].title);
  });
});
