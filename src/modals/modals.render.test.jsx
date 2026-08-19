/* Abre TODOS os modais (em modo criar e, quando aplicável, em modo editar) com
   um utilizador autenticado cheio de dados e falha em qualquer erro/aviso. */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithStore, captureConsole } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';

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
// lib/lock usa WebCrypto/WebAuthn — não existe no jsdom.
vi.mock('../lib/lock.js', () => ({
  sha256Hex: () => Promise.resolve('abc'),
  isValidPin: (p) => /^\d{4}$/.test(String(p || '')),
  faceIdSupported: () => false,
  registerFaceId: () => Promise.resolve(null),
  verifyFaceId: () => Promise.resolve(false),
}));

import AcctModal from './AcctModal.jsx';
import ActionSheet from './ActionSheet.jsx';
import AddExpenseSheet from './AddExpenseSheet.jsx';
import BalanceHistorySheet from './BalanceHistorySheet.jsx';
import BalanceLockSheet from './BalanceLockSheet.jsx';
import BalanceUpdateSheet from './BalanceUpdateSheet.jsx';
import CardPayModal from './CardPayModal.jsx';
import CatManagerModal from './CatManagerModal.jsx';
import GoalModal from './GoalModal.jsx';
import HousingModal from './HousingModal.jsx';
import ImportStatementSheet from './ImportStatementSheet.jsx';
import IncomeModal from './IncomeModal.jsx';
import MoreMenu from './MoreMenu.jsx';
import PatchNotesSheet from './PatchNotesSheet.jsx';
import PositionModal from './PositionModal.jsx';
import RecModal from './RecModal.jsx';
import RulesModal from './RulesModal.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import TransferModal from './TransferModal.jsx';

// [nome, Componente, chave do modal, payloads a testar]
const MODALS = [
  ['AcctModal', AcctModal, 'acct', [true, { id: 'a1' }, { id: 'cc' }]],
  ['ActionSheet', ActionSheet, 'action', [true]],
  ['AddExpenseSheet', AddExpenseSheet, 'add', [true, { editId: 'out1' }, { prefill: { acct: 'Revolut · Cartão de Crédito' } }, { scan: true }]],
  ['BalanceHistorySheet', BalanceHistorySheet, 'balanceHistory', [{ acctKey: 'a1', bank: 'Activobank', type: 'Conta a Ordem' }]],
  ['BalanceLockSheet', BalanceLockSheet, 'lock', [true]],
  ['BalanceUpdateSheet', BalanceUpdateSheet, 'balanceUpdate', [true]],
  ['CardPayModal', CardPayModal, 'cardpay', [true, { cardLabel: 'Revolut · Cartão de Crédito' }]],
  ['CatManagerModal', CatManagerModal, 'cat', [true]],
  ['GoalModal', GoalModal, 'goal', [true, { id: 'g1' }]],
  ['HousingModal', HousingModal, 'housing', [true]],
  ['ImportStatementSheet', ImportStatementSheet, 'stmt', [true]],
  ['IncomeModal', IncomeModal, 'income', [true, { id: 'sal' }]],
  ['MoreMenu', MoreMenu, 'more', [true]],
  ['PatchNotesSheet', PatchNotesSheet, 'patchNotes', [true]],
  ['PositionModal', PositionModal, 'position', [true, { id: 'p1' }]],
  ['RecModal', RecModal, 'rec', [true, { id: 'rec-gym' }]],
  ['RulesModal', RulesModal, 'rules', [true]],
  ['SettingsSheet', SettingsSheet, 'settings', [true]],
  ['TransferModal', TransferModal, 'transfer', [true]],
];

const IGNORE = [/not wrapped in act/i];
const realErrors = (list) => list.filter((m) => !IGNORE.some((re) => re.test(m)));

afterEach(() => cleanup());

describe.each(MODALS)('%s', (name, Comp, key, payloads) => {
  payloads.forEach((payload, i) => {
    it('abre com payload #' + i + ' (' + JSON.stringify(payload).slice(0, 40) + ') sem erros', async () => {
      const cap = captureConsole();
      let container;
      try {
        ({ container } = await renderWithStore(<Comp />, { fixture: richFixture(), openModal: key, payload }));
      } finally {
        cap.restore();
      }
      expect(realErrors(cap.errors), name + ' console.error').toEqual([]);
      expect(realErrors(cap.warns), name + ' console.warn').toEqual([]);
      // Aberto → tem de renderizar algo (os modais devolvem null quando fechados).
      expect(container.textContent.length).toBeGreaterThan(0);
    });
  });

  it('fechado → não renderiza nada', async () => {
    const { container } = await renderWithStore(<Comp />, { fixture: richFixture() });
    expect(container.textContent).toBe('');
  });
});
