import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { initialPersisted } from '../store/store.jsx';
import ExpensesView from './ExpensesView.jsx';
import { dayLabel as dayLabelForTest } from '../lib/days.js';

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

describe('Despesas: pesquisa agrupada por dia', () => {
  it('mostra cabeçalhos de dia e tira a data ISO de cada linha', async () => {
    const { container } = await renderWithStore(<ExpensesView />, { fixture: richFixture() });
    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText(/Pesquisar/)[0], { target: { value: 'pingo' } });
    });
    expect(container.querySelectorAll('.day-lb').length).toBeGreaterThan(1);
    expect(screen.getByText('Hoje')).toBeTruthy();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
  });

  it('"Ontem" é calculado em hora local, não UTC', () => {
    expect(dayLabelForTest('2026-01-14', '2026-01-15')).toBe('Ontem');
    expect(dayLabelForTest('2026-01-13', '2026-01-15')).not.toBe('Ontem');
    expect(dayLabelForTest('2026-03-01', '2026-03-01')).toBe('Hoje');
    expect(dayLabelForTest('2026-02-28', '2026-03-01')).toBe('Ontem'); // fronteira de mês
    expect(dayLabelForTest('2025-12-31', '2026-01-01')).toBe('Ontem'); // fronteira de ano
  });

  it('a linha de resultados usa a cor de uma categoria personalizada', async () => {
    // Sem bdg no MerchantLogo, o CategoryIcon caía no cinzento por defeito.
    const fx = richFixture();
    fx.bdg = initialPersisted().bdg.concat([{ id: 'viagens', nm: 'Viagens', lm: 200, icon: 'plane', color: '#f5a623' }]);
    fx.addedExp = fx.addedExp.concat([
      { id: 'viag1', desc: 'Bilhete comboio Porto', amount: 22.5, cat: 'viagens', date: fx.addedExp[0].date },
    ]);
    const { container } = await renderWithStore(<ExpensesView />, { fixture: fx });
    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText(/Pesquisar/)[0], { target: { value: 'Bilhete comboio' } });
    });
    const row = screen.getByText('Bilhete comboio Porto').closest('.cd');
    expect(row).toBeTruthy();
    expect(row.querySelector('.rw > div').style.color).toBe('rgb(245, 166, 35)');
  });
});
