/* ════════════════════════════════════════════════════════════════════════
   aiTier — o tier de IA escolhido pelo utilizador ('economico'|'equilibrado'
   |'avancado'), persistido no doc users/{uid}. Espelha exatamente como
   rolloverOn/balancesHidden estão ligados (STORE_API.md §1/§3): default no
   estado inicial, chave na lista persistida, escrita no mapeamento
   to-persist, leitura no mapeamento from-persist (guardada — um valor
   desconhecido guardado no Firestore tem de cair no default, nunca ser
   passado tal e qual ao proxy /api/ai) e um setter em actions.*.
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { initialPersisted, PERSISTED_KEYS, buildPersistPayload, hydrateFromDoc, AI_TIERS } from './store.jsx';

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

describe('aiTier — default e lista persistida', () => {
  it('arranca em "economico"', () => {
    expect(initialPersisted().aiTier).toBe('economico');
  });
  it('está na lista de chaves persistidas', () => {
    expect(PERSISTED_KEYS).toContain('aiTier');
  });
  it('AI_TIERS lista exatamente os tres tiers, pela mesma ordem de custo', () => {
    expect(AI_TIERS).toEqual(['economico', 'equilibrado', 'avancado']);
  });
});

describe('aiTier — buildPersistPayload (escrita)', () => {
  it('escreve o tier escolhido', () => {
    expect(buildPersistPayload({ aiTier: 'avancado' }).aiTier).toBe('avancado');
    expect(buildPersistPayload({ aiTier: 'equilibrado' }).aiTier).toBe('equilibrado');
  });
  it('cai no default quando o estado nao tem um tier valido', () => {
    expect(buildPersistPayload({ aiTier: 'gpt-5' }).aiTier).toBe('economico');
    expect(buildPersistPayload({}).aiTier).toBe('economico');
  });
});

describe('aiTier — hydrateFromDoc (leitura, guardada)', () => {
  it('lê um tier valido do documento', () => {
    expect(hydrateFromDoc({ aiTier: 'avancado' }).aiTier).toBe('avancado');
    expect(hydrateFromDoc({ aiTier: 'equilibrado' }).aiTier).toBe('equilibrado');
    expect(hydrateFromDoc({ aiTier: 'economico' }).aiTier).toBe('economico');
  });
  // O caso que importa: um valor desconhecido guardado (lixo escrito por uma
  // versão antiga/futura, ou corrompido) tem de cair no default — nunca
  // sobreviver tal e qual até ao pedido que sai para /api/ai. Um teste que só
  // verificasse "é uma string" passaria aqui e contra a implementação errada
  // (`d.aiTier || 'economico'`, que deixa passar qualquer lixo verdadeiro).
  it('um tier desconhecido guardado cai no default, nao passa tal e qual', () => {
    expect(hydrateFromDoc({ aiTier: 'gpt-5-turbo' }).aiTier).toBe('economico');
    expect(hydrateFromDoc({ aiTier: 'fast' }).aiTier).toBe('economico'); // alias antigo do servidor, nao um tier do cliente
    expect(hydrateFromDoc({ aiTier: '' }).aiTier).toBe('economico');
    expect(hydrateFromDoc({ aiTier: 123 }).aiTier).toBe('economico');
  });
  it('doc nulo (utilizador novo) cai no default', () => {
    expect(hydrateFromDoc(null).aiTier).toBe('economico');
  });
});

describe('aiTier — actions.setAiTier (store real)', () => {
  async function mountActions() {
    let actions;
    await renderWithStore(<div />, { onReady: (r) => { actions = r.actions; } });
    return actions;
  }

  it('escreve o tier escolhido no estado', async () => {
    const actions = await mountActions();
    await act(async () => actions.setAiTier('avancado'));
    expect(actions.getState().aiTier).toBe('avancado');
  });

  it('um valor invalido nao é escrito tal e qual', async () => {
    const actions = await mountActions();
    await act(async () => actions.setAiTier('modelo-inventado'));
    expect(actions.getState().aiTier).toBe('economico');
  });

  it('faz round-trip por buildPersistPayload/hydrateFromDoc (o caminho real do Firestore)', async () => {
    const actions = await mountActions();
    await act(async () => actions.setAiTier('equilibrado'));
    const payload = buildPersistPayload(actions.getState());
    expect(hydrateFromDoc(payload).aiTier).toBe('equilibrado');
  });
});
