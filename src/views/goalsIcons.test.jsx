// src/views/goalsIcons.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import GoalsView from './GoalsView.jsx';
import GoalModal from '../modals/GoalModal.jsx';

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

function Probe() {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify(state.goals)}</pre>;
}

describe('Metas com ícone', () => {
  it('cada meta mostra um tile de ícone e um chip de estado; o progresso global aparece uma vez', async () => {
    const fx = richFixture();
    fx.goals = fx.goals.map((g) => (g.id === 'g1' ? { ...g, icon: 'umbrella' } : g));
    const { container } = await renderWithStore(<GoalsView />, { fixture: fx });
    expect(container.querySelectorAll('.goal-icon').length).toBe(2);
    expect(screen.getByText('atrasada')).toBeTruthy();
    expect(screen.getByText('no ritmo')).toBeTruthy();
    expect(screen.queryByText('Progresso global')).toBeNull();
    expect(screen.queryByText(/Não chega para o prazo/)).toBeNull();
  });
  it('o chip "atrasada" é um botão que abre a explicação do risco numa linha visível', async () => {
    // A frase vivia só no title de um <span> — sem hover num telemóvel não havia
    // como a ler.
    await renderWithStore(<GoalsView />, { fixture: richFixture() });
    const chip = screen.getByRole('button', { name: 'atrasada' });
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Não chega para o prazo/)).toBeNull();
    await act(async () => { fireEvent.click(chip); });
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Não chega para o prazo/)).toBeTruthy();
    // "no ritmo" não tem risco: continua um span sem botão.
    expect(screen.queryByRole('button', { name: 'no ritmo' })).toBeNull();
    await act(async () => { fireEvent.click(chip); });
    expect(screen.queryByText(/Não chega para o prazo/)).toBeNull();
  });
  it('o modal grava o ícone escolhido', async () => {
    await renderWithStore(<><GoalModal /><Probe /></>, { fixture: richFixture(), openModal: 'goal', payload: { id: 'g2' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ícone escudo' })); });
    await act(async () => { fireEvent.click(screen.getByText('Guardar alterações')); });
    const g2 = JSON.parse(screen.getByTestId('probe').textContent).find((g) => g.id === 'g2');
    expect(g2.icon).toBe('shieldCheck');
  });
});
