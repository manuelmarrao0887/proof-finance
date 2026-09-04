import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture } from './fixtures.js';
import ContextStrip from '../components/ContextStrip.jsx';
import Hero from '../components/Hero.jsx';
import OverviewView from '../views/OverviewView.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import TaxView from '../views/TaxView.jsx';
import ReportView from '../views/ReportView.jsx';
import IncomesView from '../views/IncomesView.jsx';
import RecurringView from '../views/RecurringView.jsx';
import GoalsView from '../views/GoalsView.jsx';
import CalendarView from '../views/CalendarView.jsx';
import GroupsView from '../views/GroupsView.jsx';
import { mask, maskPct, maskText } from '../lib/format.js';

vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());

const EURO = /\d[\d\s.,]*\s?€/;   // qualquer montante em euros
const PCT = /[+-]?\d+([.,]\d+)?\s?%/; // qualquer percentagem

describe('mask helpers', () => {
  it('mask/maskPct/maskText escondem só quando hidden', () => {
    expect(mask(1234.5, false)).toMatch(EURO);
    expect(mask(1234.5, true)).toBe('••••');
    expect(maskPct(12.3, false)).toBe('12%');
    expect(maskPct(12.3, true)).toBe('••%');
    expect(maskText('Netflix · 10,99 € duas vezes', true)).toBe('Netflix · •••• duas vezes');
  });
});

const VIEWS = [
  ['ContextStrip/expenses', () => <ContextStrip tab="expenses" />],
  ['ContextStrip/cards', () => <ContextStrip tab="cards" />],
  ['ContextStrip/groups', () => <ContextStrip tab="groups" />],
  ['Hero', () => <Hero />],
  ['Overview', () => <OverviewView />],
  ['Expenses', () => <ExpensesView />],
  ['Tax', () => <TaxView />],
  ['Report', () => <ReportView />],
  ['Incomes', () => <IncomesView />],
  ['Recurring', () => <RecurringView />],
  ['Goals', () => <GoalsView />],
  ['Calendar', () => <CalendarView />],
  ['Groups', () => <GroupsView />],
];

describe('saldos ocultos em todas as vistas', () => {
  for (const [name, make] of VIEWS) {
    it(name + ' não mostra nenhum montante nem percentagem quando oculto', async () => {
      const { container } = await renderWithStore(make(), { fixture: { ...richFixture(), balancesHidden: true } });
      const text = container.textContent;
      expect(text, name + ' vazou um montante').not.toMatch(EURO);
      expect(text, name + ' vazou uma percentagem').not.toMatch(PCT);
    });
  }
});

// Fix round 1 — as barras "Podes gastar" (gasto+fixas vs rendimento) e "Plano
// do mês" (Fixas/Metas/Livre) desenhavam segmentos proporcionais reais mesmo
// com balancesHidden — a largura de cada `<div>` revelava a distribuição do
// orçamento sem passar por texto nenhum, por isso o teste de texto acima
// nunca apanhava a fuga. As duas barras partilham o mesmo estilo-base
// (background: 'var(--bg3)', display: 'flex', overflow: 'hidden') — quando
// ocultas devem colapsar para uma única faixa neutra (var(--elevated)), tal
// como a barra de alocação da Hero.
describe('Overview — barras não revelam proporção quando oculto', () => {
  it('"Podes gastar" e "Plano do mês" colapsam para uma faixa única sem segmentos proporcionais', async () => {
    const { container } = await renderWithStore(<OverviewView />, {
      fixture: { ...richFixture(), balancesHidden: true },
    });
    const bars = Array.from(container.querySelectorAll('div')).filter(
      (el) => el.style.display === 'flex' && el.style.overflow === 'hidden' && el.style.background === 'var(--bg3)'
    );
    // As duas barras (Podes gastar + Plano do mês) têm de estar presentes com
    // esta fixture — senão o teste passaria vazio sem testar nada.
    expect(bars.length).toBe(2);
    bars.forEach((bar) => {
      // Antes da correção: 2 e 3 filhos respetivamente, cada um com uma
      // largura % proporcional ao gasto/plano real. Depois: no máximo 1 filho
      // (a faixa neutra), sem geometria que denuncie a distribuição.
      expect(bar.children.length).toBeLessThanOrEqual(1);
    });
  });
});
