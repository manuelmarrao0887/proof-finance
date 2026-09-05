/* ════════════════════════════════════════════════════════════════════════
   Fumo dos seis blocos extraídos do Resumo (Task 10). Ainda não estão
   montados em lado nenhum — a Task 11 põe-nos em Gráficos e Relatório —, mas
   têm de montar sozinhos, com o estado real, e mostrar o seu título.

   Cada um lê o store por si (useStore) e recalcula o que precisa: o teste
   monta-os isolados, sem OverviewView, para provar exatamente isso.
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithStore } from '../../test/renderWithStore.jsx';
import { richFixture } from '../../test/fixtures.js';
import ClosingCard from './ClosingCard.jsx';
import HealthCard from './HealthCard.jsx';
import SubscriptionsCard from './SubscriptionsCard.jsx';
import EmergencyFundCard from './EmergencyFundCard.jsx';
import ProjectionCard from './ProjectionCard.jsx';
import AccountsByCategory from './AccountsByCategory.jsx';
import SpendHero from '../SpendHero.jsx';

vi.mock('../../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const CARDS = [
  ['HealthCard', () => <HealthCard />, /Saúde financeira/],
  ['SubscriptionsCard', () => <SubscriptionsCard />, /Subscrições detectadas/],
  ['EmergencyFundCard', () => <EmergencyFundCard />, /Fundo de emergência/],
  ['ProjectionCard', () => <ProjectionCard />, /Projeção/],
  ['AccountsByCategory', () => <AccountsByCategory />, /Contas por categoria/],
  ['ClosingCard', () => <ClosingCard />, null],
];

describe('blocos extraídos do Resumo', () => {
  for (const [name, make, title] of CARDS) {
    it(name + ' monta sozinho e mostra o seu título', async () => {
      const { container } = await renderWithStore(make(), { fixture: richFixture() });
      if (title) {
        expect(container.textContent, name).toMatch(title);
      } else if (name === 'ClosingCard') {
        // ClosingCard only renders in the first 7 days of the month
        const dayOfMonth = new Date().getDate();
        if (dayOfMonth <= 7) {
          expect(container.textContent).toMatch(/Fecho de/);
        } else {
          expect(container.textContent).not.toMatch(/Fecho de/);
        }
      }
    });
  }

  it('ClosingCard monta sozinho e mostra o fecho do mês anterior', async () => {
    /* monthClosing() só devolve algo nos primeiros 7 dias do mês — sem fixar a
       data o teste passaria ou falharia consoante o dia em que corresse. Só o
       Date é falsificado: o renderWithStore precisa de setTimeout real. */
    vi.useFakeTimers({ toFake: ['Date'] });
    const n = new Date();
    vi.setSystemTime(new Date(n.getFullYear(), n.getMonth(), 3, 10, 0, 0));
    const { container } = await renderWithStore(<ClosingCard />, { fixture: richFixture() });
    expect(container.textContent).toMatch(/Fecho de/);
  });

  it('os seis blocos e o SpendHero mascaram tudo com saldos ocultos', async () => {
    const EURO = /\d[\d\s.,]*\s?€/;
    const PCT = /[+-]?\d+([.,]\d+)?\s?%/;
    for (const [name, make] of CARDS.concat([['SpendHero', () => <SpendHero />]])) {
      const { container } = await renderWithStore(make(), { fixture: { ...richFixture(), balancesHidden: true } });
      expect(container.textContent, name + ' vazou um montante').not.toMatch(EURO);
      expect(container.textContent, name + ' vazou uma percentagem').not.toMatch(PCT);
      cleanup();
    }
  });

  it('a barra do SpendHero não revela a proporção quando oculta', async () => {
    // Mesma regra da Hero e das barras do Resumo (ver hidden.all.test.jsx): a
    // largura dos segmentos revela a distribuição sem passar por texto nenhum.
    const { container } = await renderWithStore(<SpendHero />, { fixture: { ...richFixture(), balancesHidden: true } });
    const bars = Array.from(container.querySelectorAll('div')).filter(
      (el) => el.style.display === 'flex' && el.style.overflow === 'hidden' && /borderRadius|border-radius/.test(el.getAttribute('style') || '')
    );
    bars.forEach((bar) => expect(bar.children.length).toBeLessThanOrEqual(1));
  });
});
