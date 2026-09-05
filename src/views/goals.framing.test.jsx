// src/views/goals.framing.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import GoalsView from './GoalsView.jsx';
import { fc } from '../lib/format.js';

vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));

afterEach(() => cleanup());

function Probe() { const { state } = useStore(); return <pre data-testid="probe">{JSON.stringify(state.goals.map((g) => [g.id, g.current]))}</pre>; }

describe('metas com agência', () => {
  it('a meta em risco diz quanto falta por mês em vez de "atrasada"', async () => {
    const { container } = await renderWithStore(<GoalsView />, { fixture: richFixture() });
    expect(container.textContent).not.toMatch(/atrasada/);
    expect(container.textContent).toMatch(/\+\s?\d[\d\s.,]*\s?€\/mês para chegar a tempo/);
  });
  it('a meta a 98% oferece fechar agora e o botão reforça o resto', async () => {
    await renderWithStore(<><GoalsView /><Probe /></>, { fixture: richFixture() });
    expect(screen.getByText(/Faltam 100 € — fecha agora/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Fechar meta/ })); });
    const goals = JSON.parse(screen.getByTestId('probe').textContent);
    expect(goals.find((g) => g[0] === 'g2')[1]).toBe(6000);
  });
});
