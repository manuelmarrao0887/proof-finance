/* Testes de ContextStrip para a faixa "groups" — finding I2 da revisão final:
   a faixa lia state.groups/state.groupEntries diretamente, sem passar por
   getGroupsData(state, preview) como OverviewView e GroupsView fazem. Sem
   login (preview), isso dava "0 grupos ativos · a receber 0,00 € · a pagar
   0,00 €" mesmo com o grupo de exemplo (demoGroups, lib/finance.js) a
   mostrar dados reais logo por baixo, na lista de Grupos. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { emptyFixture, richFixture } from '../test/fixtures.js';
import { demoGroups } from '../lib/finance.js';
import { computeBalances, groupTotals, isSettled } from '../lib/split.js';
import ContextStrip from './ContextStrip.jsx';

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

afterEach(cleanup);

// Mesmo cálculo que a faixa faz (e que GroupsView/OverviewView fazem) sobre o
// grupo de exemplo — fonte independente para a asserção não ficar presa a
// números copiados à mão que poderiam divergir de demoGroups() no futuro.
function expectedDemoStrip() {
  const { groups, groupEntries } = demoGroups();
  let activeCount = 0;
  let owedToMe = 0;
  let owedByMe = 0;
  groups.forEach((g) => {
    if (g.archived) return;
    const entries = groupEntries.filter((e) => e.groupId === g.id);
    const t = groupTotals(entries, 'me');
    owedToMe += t.owedToMe;
    owedByMe += t.owedByMe;
    if (!isSettled(computeBalances(entries, g.memberIds))) activeCount += 1;
  });
  return { activeCount, owedToMe, owedByMe };
}

describe('ContextStrip — faixa "groups"', () => {
  it('sem login (preview) e sem grupos próprios, mostra os totais do grupo de exemplo — não "0 grupos ativos" (I2)', async () => {
    const { activeCount, owedToMe, owedByMe } = expectedDemoStrip();
    expect(activeCount).toBeGreaterThan(0); // pré-condição: o demo tem mesmo saldo por acertar

    await renderWithStore(<ContextStrip tab="groups" />, { fixture: emptyFixture(), preview: true });

    expect(screen.getByText(activeCount + ' grupo' + (activeCount === 1 ? ' ativo' : 's ativos'))).toBeTruthy();
    const val = 'a receber ' + owedToMe.toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' € · a pagar ' + owedByMe.toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' €';
    expect(screen.getByText(val)).toBeTruthy();
    expect(screen.queryByText('0 grupos ativos')).toBeNull();
  });

  it('autenticado (sem preview) e sem grupos próprios, mostra mesmo "0 grupos ativos" — o demo nunca aparece a quem tem sessão', async () => {
    // emptyFixture() sozinho conta como "utilizador novo" (isNewUser) e a
    // faixa não mostra nada nesse caso, para qualquer separador — por isso
    // parte-se de richFixture() e esvazia-se só people/groups/groupEntries.
    const fixture = { ...richFixture(), people: [], groups: [], groupEntries: [] };
    await renderWithStore(<ContextStrip tab="groups" />, { fixture });
    expect(screen.getByText('0 grupos ativos')).toBeTruthy();
    expect(screen.getByText('a receber 0 € · a pagar 0 €')).toBeTruthy();
  });

  it('autenticado com grupos próprios continua a mostrar os grupos do próprio, não o demo', async () => {
    await renderWithStore(<ContextStrip tab="groups" />, { fixture: richFixture() });
    // g-ferias (richFixture): 1 grupo, por acertar -> ativo.
    expect(screen.getByText('1 grupo ativo')).toBeTruthy();
  });
});
