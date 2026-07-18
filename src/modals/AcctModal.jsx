/* ════════════════════════════════════════════════════════════════════════
   AcctModal — React port of rAcctModal (orig 1672-1708) + saveAcct/editAcct/
   deleteAcct (1709-1739).

   Custom account create/edit sheet. useModal('acct'); payload {id} opens in edit
   mode (preloads the account fields). Uses addCustomAcct/updateCustomAcct/
   deleteCustomAcct. ACCT_CATEGORIES/ACCT_TYPES/CURRENCIES copied locally
   (orig 1668-1670).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useStore } from '../store/store.jsx';
import { useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid, todayISO, fm } from '../lib/format.js';
import { getAcctsLive, cardUsage, CARD_CAT } from '../lib/finance.js';
import { PrimaryButton, SecondaryButton } from '../components/Buttons.jsx';

const ACCT_CATEGORIES = ['Liquidez', 'Poupanca', 'Investimentos', 'Cripto', 'Imobiliario', CARD_CAT, 'Outros'];
const ACCT_TYPES = ['Conta a Ordem', 'Poupanca', 'Corretagem', 'Planos de Investimento', 'P2P Lending', 'Rend. Fixo', 'Crypto Wallet', 'Cartão de Crédito', 'Imobiliario', 'Outros'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'BRL', 'CHF'];

const EMPTY = { id: null, bank: '', type: 'Conta a Ordem', category: 'Liquidez', value: '', currency: 'EUR', note: '', plafond: '' };

export default function AcctModal() {
  const { state, actions, currentUser } = useStore();
  const { isOpen, payload, close } = useModal('acct');
  const toast = useToast();

  const [draft, setDraft] = useState(EMPTY);

  // When the sheet opens, seed the draft from the edited account (payload {id})
  // or reset to a blank new-account draft.
  useEffect(() => {
    if (!isOpen) return;
    const id = payload && typeof payload === 'object' ? payload.id : null;
    if (id) {
      const a = (state.customAccts || []).find((x) => x.id === id);
      if (a) {
        // Show the LIVE balance (base − manual expenses already counted), so the
        // edit field matches what the Resumo shows. Saving rebaselines to it.
        const live = getAcctsLive({ ...state, currentUser }).find((x) => x.id === id);
        const shown = live ? live.v : a.value || 0;
        setDraft({
          id: a.id,
          bank: a.bank || '',
          type: a.type || 'Conta a Ordem',
          category: a.category || 'Liquidez',
          value: String(shown).replace('.', ','),
          currency: a.currency || 'EUR',
          note: a.note || '',
          plafond: a.plafond != null ? String(a.plafond).replace('.', ',') : '',
        });
        return;
      }
    }
    setDraft(EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payload]);

  const isEdit = !!draft.id;
  const isCard = draft.category === CARD_CAT;
  // Ao escolher a categoria "Cartão de crédito" define logo o tipo adequado.
  const set = (k, v) =>
    setDraft((d) => {
      const next = { ...d, [k]: v };
      if (k === 'category' && v === CARD_CAT && d.type !== 'Cartão de Crédito') next.type = 'Cartão de Crédito';
      return next;
    });

  // Dívida atual do cartão (derivada) — mostrada em modo edição.
  const cardDebt = isEdit && isCard ? cardUsage({ ...state, currentUser }, draft.bank + ' · ' + draft.type).used : 0;

  const saveAcct = () => {
    const bank = draft.bank.trim();
    const type = draft.type;
    const cat = draft.category;
    let val = parseFloat((draft.value || '0').replace(',', '.'));
    const cur = draft.currency;
    const note = (draft.note || '').trim();
    if (!bank) {
      toast('Banco obrigatório', 'error');
      return;
    }
    if (isNaN(val)) val = 0;
    const today = todayISO().replace(/-/g, '.');
    if (cat === CARD_CAT) {
      // Cartão: o saldo é DÍVIDA derivada (despesas − pagamentos); não se
      // introduz à mão. Guarda o plafond; value fica 0.
      let plafond = parseFloat((draft.plafond || '0').replace(',', '.'));
      if (isNaN(plafond) || plafond < 0) plafond = 0;
      if (draft.id) {
        actions.updateCustomAcct(draft.id, { bank, type, category: cat, value: 0, currency: cur, note, plafond, updated: today });
      } else {
        actions.addCustomAcct({ id: uid(), bank, type, category: cat, value: 0, currency: cur, note, plafond, updated: today, createdAt: Date.now() });
      }
      close();
      toast(draft.id ? 'Cartão atualizado' : 'Cartão adicionado', 'success');
      return;
    }
    if (draft.id) {
      // Saving a balance = a fresh reading: settle the manual expenses already
      // baked into `val` (the shown live value) so they don't subtract again.
      const orig = (state.customAccts || []).find((x) => x.id === draft.id);
      if (orig) actions.settleAccount(orig.bank + ' · ' + orig.type);
      actions.updateCustomAcct(draft.id, { bank, type, category: cat, value: val, currency: cur, note, updated: today });
    } else {
      actions.addCustomAcct({ id: uid(), bank, type, category: cat, value: val, currency: cur, note, updated: today, createdAt: Date.now() });
    }
    close();
    toast(draft.id ? 'Conta atualizada' : 'Conta adicionada', 'success');
  };

  const deleteAcct = () => {
    if (!draft.id) return;
    // Original used scheduleUndo (toast-based undo); React port deletes after a
    // confirm (no undo host yet).
    if (!confirm('Eliminar esta conta?')) return;
    actions.deleteCustomAcct(draft.id);
    close();
    toast('Conta eliminada', 'success');
  };

  if (!isOpen) return null;

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', marginBottom: 14 };
  const selectStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 14, marginBottom: 14 };
  const labelStyle = { display: 'block', marginBottom: 6 };

  return (
    <Sheet open={isOpen} onClose={close} title={isEdit ? 'Editar conta' : 'Nova conta'}>
      {/* Bank name */}
      <label className="lb" style={labelStyle} htmlFor="acBank">Banco / Instituição</label>
      <input id="acBank" value={draft.bank} onChange={(e) => set('bank', e.target.value)} placeholder="Ex: Revolut, N26, Coinbase" style={inputStyle} />

      {/* Type */}
      <label className="lb" style={labelStyle} htmlFor="acType">Tipo</label>
      <select id="acType" value={draft.type} onChange={(e) => set('type', e.target.value)} style={selectStyle}>
        {ACCT_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {/* Category */}
      <label className="lb" style={labelStyle} htmlFor="acCat">Categoria</label>
      <select id="acCat" value={draft.category} onChange={(e) => set('category', e.target.value)} style={selectStyle}>
        {ACCT_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Value/Plafond + currency */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="lb" style={labelStyle} htmlFor="acVal">{isCard ? 'Plafond mensal' : 'Saldo'}</label>
          <input
            id="acVal"
            value={isCard ? draft.plafond : draft.value}
            onChange={(e) => set(isCard ? 'plafond' : 'value', e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 500, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ width: 96 }}>
          <label className="lb" style={labelStyle} htmlFor="acCur">Moeda</label>
          <select
            id="acCur"
            value={draft.currency}
            onChange={(e) => set('currency', e.target.value)}
            style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 14, textAlign: 'center' }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      {isCard && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
          O saldo do cartão é a <b>dívida</b> — calculada pelas despesas do cartão menos os pagamentos. Não a introduzes aqui.
          {isEdit && (
            <> Dívida atual: <b style={{ color: 'var(--text)' }}>{fm(cardDebt)}</b> · disponível ~{fm(Math.max(0, (parseFloat((draft.plafond || '0').replace(',', '.')) || 0) - cardDebt))}.</>
          )}
        </div>
      )}

      {/* Note */}
      <label className="lb" style={labelStyle} htmlFor="acNote">Nota (opcional)</label>
      <input id="acNote" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Juros, IBAN parcial, etc." style={{ ...inputStyle, fontSize: 14, marginBottom: 22 }} />

      {/* Save */}
      <PrimaryButton onClick={saveAcct}>
        {isEdit ? 'Guardar alterações' : 'Adicionar conta'}
      </PrimaryButton>
      {isEdit && (
        <SecondaryButton onClick={deleteAcct} style={{ color: 'var(--danger)', marginTop: 8 }}>
          Eliminar conta
        </SecondaryButton>
      )}
    </Sheet>
  );
}
