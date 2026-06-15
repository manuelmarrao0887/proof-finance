/* ════════════════════════════════════════════════════════════════════════
   Income modal (Nova / Editar receita) — React port of rIncomeModal
   (orig 1596-1622) + editIncome (1624) / saveIncome (1630) / deleteIncome
   (1650).

   - Rendered inside the shared <Sheet>.
   - Open via useUI().open('income', { id }) — payload { id } means edit.
   - Recurring vs one-off toggle: recurring shows a "Dia" field, one-off shows
     a "Data" date field.
   - Source <select> driven by INCOME_SOURCES (copied locally).
   - Save validates (name required, amount > 0) then add/update.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useStore } from '../store/store.jsx';
import { useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid } from '../lib/format.js';
import { listAccounts } from '../lib/balances.js';

// INCOME_SOURCES (orig 1541) — copied into this file.
const INCOME_SOURCES = [
  ['salary', 'Salário', '#3fc97a'],
  ['freelance', 'Freelance', '#3b6fee'],
  ['dividend', 'Dividendos', '#7b5fe0'],
  ['rental', 'Aluguer', '#f5a623'],
  ['bonus', 'Bónus / Prémio', '#f25555'],
  ['other', 'Outro', '#9aa3b5'],
];

const EMPTY = { id: null, name: '', amount: '', source: 'salary', day: '1', recurring: true, date: '', acct: '' };

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  borderRadius: 'var(--r2)',
  fontSize: 15,
  boxSizing: 'border-box',
};
const numStyle = {
  width: '100%',
  padding: '12px 16px',
  border: '1px solid var(--border)',
  background: 'var(--elevated)',
  color: 'var(--fg)',
  borderRadius: 8,
  fontFamily: 'var(--mono)',
  fontSize: 15,
  fontWeight: 600,
  boxSizing: 'border-box',
};

export default function IncomeModal() {
  const { state, actions, currentUser } = useStore();
  const { isOpen, payload, close } = useModal('income');
  const toast = useToast();
  const [draft, setDraft] = useState(EMPTY);

  useEffect(() => {
    if (!isOpen) return;
    const id = payload && typeof payload === 'object' ? payload.id : null;
    if (id) {
      const i = (state.incomes || []).find((x) => x.id === id);
      if (i) {
        setDraft({
          id: i.id,
          name: i.name,
          amount: String(i.amount),
          source: i.source || 'salary',
          day: String(i.day || 1),
          recurring: i.recurring !== false,
          date: i.date || '',
          acct: i.acct || '',
        });
        return;
      }
    }
    // New income: seed from EMPTY, optionally overridden by payload.defaults
    // (used by "Registar receita de {mês}" to pre-fill one-off + month date).
    const defaults = payload && typeof payload === 'object' && payload.defaults ? payload.defaults : null;
    setDraft(defaults ? { ...EMPTY, ...defaults, recurring: defaults.recurring !== false } : EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payload]);

  const isEdit = !!draft.id;
  const isRec = draft.recurring !== false;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  function saveIncome() {
    const n = (draft.name || '').trim();
    const a = parseFloat((String(draft.amount) || '0').replace(',', '.'));
    const s = draft.source;
    let day = 1;
    let date = '';
    if (isRec) {
      day = parseInt(String(draft.day) || '1');
      if (isNaN(day) || day < 1 || day > 31) day = 1;
    } else {
      // A one-off with no date would never land in any month bucket (silently
      // uncounted — happens from the Q1 view where the seed date is empty).
      // Fall back to today so it always counts somewhere.
      date = draft.date || new Date().toISOString().slice(0, 10);
    }
    if (!n) {
      toast('Nome obrigatório', 'error');
      return;
    }
    if (isNaN(a) || a <= 0) {
      toast('Valor inválido', 'error');
      return;
    }
    const acct = draft.acct || '';
    if (draft.id) {
      actions.updateIncome(draft.id, { name: n, amount: a, source: s, recurring: isRec, day, date, acct });
    } else {
      actions.addIncome({ id: uid(), name: n, amount: a, source: s, recurring: isRec, day, date, acct, createdAt: Date.now() });
    }
    close();
    toast(draft.id ? 'Receita atualizada' : 'Receita adicionada', 'success');
  }

  function deleteIncome() {
    if (!draft.id) return;
    actions.deleteIncome(draft.id);
    close();
    toast('Receita eliminada', 'success');
  }

  if (!isOpen) return null;

  const footer = (
    <>
      <button
        type="button"
        onClick={saveIncome}
        style={{ width: '100%', padding: '14px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', fontSize: 14, fontWeight: 500, borderRadius: 999 }}
      >
        {isEdit ? 'Guardar alterações' : 'Adicionar receita'}
      </button>
      {isEdit && (
        <button
          type="button"
          onClick={deleteIncome}
          style={{ width: '100%', padding: '10px 0', border: 'none', background: 'transparent', color: 'var(--signal)', fontSize: 12, fontWeight: 600, marginTop: 8 }}
        >
          Eliminar
        </button>
      )}
    </>
  );

  const toggleBtn = (label, active, onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 0',
        border: 'none',
        borderRadius: 9,
        background: active ? 'var(--bg2)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
        fontSize: 12,
        fontWeight: 600,
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
      }}
    >
      {label}
    </button>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={isEdit ? 'Editar receita' : 'Nova receita'} footer={footer}>
      {/* Toggle recurring vs one-off */}
      <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 'var(--r2)', padding: 3, marginBottom: 16, gap: 2 }}>
        {toggleBtn('Recorrente', isRec, () => set('recurring', true))}
        {toggleBtn('Pontual', !isRec, () => set('recurring', false))}
      </div>

      <div className="lb" style={{ marginBottom: 6 }}>Nome</div>
      <input
        value={draft.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="Ex: Salário, Aluguer, Bónus"
        aria-label="Nome"
        style={{ ...inputStyle, marginBottom: 16 }}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Valor (EUR)</div>
          <input value={draft.amount} onChange={(e) => set('amount', e.target.value)} placeholder="1500,00" inputMode="decimal" aria-label="Valor (EUR)" style={numStyle} />
        </div>
        {isRec ? (
          <div style={{ width: 90 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Dia</div>
            <input value={draft.day} onChange={(e) => set('day', e.target.value)} placeholder="1" inputMode="numeric" aria-label="Dia" style={{ ...numStyle, textAlign: 'center' }} />
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Data</div>
            <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} aria-label="Data" style={{ ...numStyle, fontSize: 13, fontWeight: 400 }} />
          </div>
        )}
      </div>

      <div className="lb" style={{ marginBottom: 6 }}>Origem</div>
      <select
        value={draft.source}
        onChange={(e) => set('source', e.target.value)}
        aria-label="Origem"
        style={{
          width: '100%',
          padding: '12px 16px',
          border: '1px solid var(--border)',
          background: 'var(--elevated)',
          color: 'var(--fg)',
          borderRadius: 8,
          fontSize: 14,
          appearance: 'none',
          marginBottom: 4,
        }}
      >
        {INCOME_SOURCES.map((s) => (
          <option key={s[0]} value={s[0]}>
            {s[1]}
          </option>
        ))}
      </select>

      {/* Conta creditada (opcional) */}
      <div className="lb" style={{ margin: '16px 0 6px' }}>Conta creditada (opcional)</div>
      <select
        value={draft.acct}
        onChange={(e) => set('acct', e.target.value)}
        aria-label="Conta creditada (opcional)"
        style={{
          width: '100%',
          padding: '12px 16px',
          border: '1px solid var(--border)',
          background: 'var(--elevated)',
          color: 'var(--fg)',
          borderRadius: 8,
          fontSize: 14,
          appearance: 'none',
          marginBottom: 4,
        }}
      >
        <option value="">— sem conta —</option>
        {listAccounts({ ...state, currentUser }).map((a) => {
          const label = a.bank + ' · ' + a.type;
          return (
            <option key={a.acctKey} value={label}>{label}</option>
          );
        })}
      </select>
    </Sheet>
  );
}
