/* ════════════════════════════════════════════════════════════════════════
   aiChat contra o STORE REAL.

   aiChat.test.js corre sobre actions falsas (vi.fn() inertes por cima de um
   objeto mutável partilhado): aí `state` e `actions.getState()` devolvem a
   MESMA referência e as escritas não fazem nada. Foi exatamente isso que
   escondeu dois bugs reais:

     1. duas tool_calls de escrita na mesma volta — cada uma fazia
        setField('addedExp', [...getState().addedExp, x]) e, como getState()
        devolve stateRef.current (só reatribuído no render seguinte), a
        segunda apagava a primeira. O utilizador era informado das duas.
     2. as tools de LEITURA liam um `state` capturado no início do send() —
        um retrato congelado que nunca via as escritas feitas entretanto.

   Estes testes montam o StoreProvider verdadeiro (renderWithStore) e passam
   as actions reais ao runAssistant. Não substituem aiChat.test.js: cobrem a
   metade que os mocks não conseguem cobrir.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { runAssistant } from './aiChat.js';

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

const USAGE = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
const say = (content) => ({ choices: [{ message: { role: 'assistant', content } }], usage: USAGE });
const calls = (...list) => ({
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: list.map(([id, name, args]) => ({
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        })),
      },
    },
  ],
  usage: USAGE,
});

/* Uma volta ao modelo demora tempo real — o `setTimeout` reproduz isso e dá ao
   React a oportunidade de fazer commit das escritas da volta anterior, tal
   como acontece na app entre duas idas ao OpenRouter. */
const slow = (res) => async () => {
  await new Promise((r) => setTimeout(r, 0));
  return res;
};

// Monta a store real e devolve as actions verdadeiras.
async function realStore(fixture) {
  let actions = null;
  await renderWithStore(<div data-testid="host" />, {
    fixture,
    onReady: (c) => {
      actions = c.actions;
    },
  });
  return actions;
}

describe('runAssistant sobre o store real', () => {
  it('duas escritas na MESMA volta ficam ambas gravadas', async () => {
    const chatFn = vi
      .fn()
      .mockImplementationOnce(
        slow(
          calls(
            ['a', 'add_expense', { desc: 'Cafe', amount: 1.2, cat: 'rest', date: '2026-08-28' }],
            ['b', 'add_expense', { desc: 'Pao', amount: 0.9, cat: 'sup', date: '2026-08-28' }]
          )
        )
      )
      .mockImplementationOnce(slow(say('Registei o cafe e o pao.')));

    const actions = await realStore({ addedExp: [] });
    let out;
    await act(async () => {
      out = await runAssistant('regista o cafe 1,20 e o pao 0,90', {
        state: actions.getState(),
        actions,
        chatFn,
      });
    });

    // O que a UI diz ao utilizador...
    expect(out.applied).toHaveLength(2);
    // ...tem de bater certo com o que ficou de facto no store.
    expect(actions.getState().addedExp.map((x) => x.desc).sort()).toEqual(['Cafe', 'Pao']);
  });

  it('uma tool de leitura numa volta seguinte vê a escrita da volta anterior', async () => {
    const chatFn = vi
      .fn()
      .mockImplementationOnce(slow(calls(['w', 'add_expense', { desc: 'Jantar', amount: 30, cat: 'rest', date: '2026-08-28' }])))
      .mockImplementationOnce(slow(calls(['r', 'query_expenses', {}])))
      .mockImplementationOnce(slow(say('Gastaste 30,00 EUR.')));

    const actions = await realStore({ addedExp: [] });
    await act(async () => {
      await runAssistant('regista o jantar e diz-me quanto gastei este mes', {
        state: actions.getState(),
        actions,
        chatFn,
      });
    });

    // A 3.ª ida ao modelo leva o resultado do query_expenses da 2.ª volta.
    const third = chatFn.mock.calls[2][0];
    const toolMsg = third[third.length - 1];
    expect(toolMsg.role).toBe('tool');
    const payload = JSON.parse(toolMsg.content);
    expect(payload.ok).toBe(true);
    // Sem o getter em ctx.state, o modelo recebia total:0 e dizia ao
    // utilizador que não tinha gasto nada — logo a seguir a ter registado.
    expect(payload.data.total).toBe(1);
    expect(payload.data.rows[0].desc).toBe('Jantar');
  });

  /* Encontrado ao verificar o must-fix 2 (pré-existente, não introduzido por
     ele): `currentUser` não vive no estado do reducer — é um useState à parte
     no provider, e cada sítio da UI junta-o quando precisa (ver
     BalanceUpdateSheet). Sem essa junção, isPreviewMode(state) dá true e
     get_overview devolve as contas de DEMONSTRAÇÃO de lib/finance.js (640,
     1250, ...) em vez das do utilizador — o assistente reportava ao
     utilizador um património inventado. */
  it('get_overview devolve as contas do utilizador, nunca as de demonstracao', async () => {
    const chatFn = vi
      .fn()
      .mockImplementationOnce(slow(calls(['o', 'get_overview', {}])))
      .mockImplementationOnce(slow(say('Tens 111,11 EUR.')));

    const actions = await realStore({
      dynAccts: { 'Bankinter_Conta a Ordem': { v: 111.11, d: '2026.08.30', n: null } },
      customAccts: [],
    });
    await act(async () => {
      await runAssistant('qual e o meu patrimonio?', {
        state: actions.getState(),
        actions,
        currentUser: { uid: 'test-user' },
        chatFn,
      });
    });

    const second = chatFn.mock.calls[1][0];
    const payload = JSON.parse(second[second.length - 1].content);
    expect(payload.ok).toBe(true);
    expect(payload.data.accounts).toEqual([
      { name: 'Bankinter · Conta a Ordem', category: 'Liquidez', value: 111.11 },
    ]);
    expect(payload.data.totalAssets).toBeCloseTo(111.11, 2);
  });

  it('uma tool de escrita numa volta seguinte vê o grupo criado na volta anterior', async () => {
    const chatFn = vi
      .fn()
      .mockImplementationOnce(slow(calls(['g', 'create_group', { name: 'Ferias' }])))
      .mockImplementationOnce(slow(calls(['l', 'list_groups', {}])))
      .mockImplementationOnce(slow(say('Criei o grupo Ferias.')));

    const actions = await realStore({ groups: [], people: [], groupEntries: [] });
    await act(async () => {
      await runAssistant('cria o grupo Ferias', { state: actions.getState(), actions, chatFn });
    });

    const third = chatFn.mock.calls[2][0];
    const payload = JSON.parse(third[third.length - 1].content);
    expect(payload.ok).toBe(true);
    expect(payload.data.map((g) => g.name)).toEqual(['Ferias']);
  });
});
