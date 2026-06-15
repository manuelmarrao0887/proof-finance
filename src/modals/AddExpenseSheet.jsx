/* ════════════════════════════════════════════════════════════════════════
   Add / Edit expense sheet — React port of rAddExp (orig 2124-2189) +
   doAddExp (orig 2327-2367) + editExp (orig 2190-2206).

   Opened via the UI `add` modal (useModal('add')); when editing, the payload is
   `{ editIdx }` (the index into addedExp). Local draft state mirrors the
   original `addData` object. Submit:
     - NEW:  applyRules(state, desc) supplies the category when the user did not
             pick one explicitly (orig 2344-2349); then actions.addExpense(...).
     - EDIT: actions.updateExpense(idx, ...) (replaces the record at idx).

   FIX 3: the category <select> is built from sortedCats(state.bdg) (alphabetical)
   instead of the raw bdg order the original used (orig 2150).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm } from '../lib/format.js';
import { applyRules } from '../lib/finance.js';
import { sortedCats } from '../lib/categories.js';
import { listAccounts } from '../lib/balances.js';
import CategoryIcon from '../components/CategoryIcon.jsx';

// Fresh draft for a brand-new expense (orig addData default 417 / reset 2364).
function freshDraft() {
  return {
    desc: '',
    amount: '',
    cat: 'rest',
    date: new Date().toISOString().slice(0, 10),
    acct: '',
    shared: false,
    total: '',
    split: '2',
    tags: [],
    notes: '',
  };
}

// Build the draft for an edit (orig editExp 2190-2206).
function draftFromExpense(x) {
  return {
    desc: x.desc || '',
    amount: String(x.amount || '').replace('.', ','),
    cat: x.cat || 'rest',
    date: x.date || new Date().toISOString().slice(0, 10),
    acct: x.acct || '',
    shared: !!x.shared,
    total: x.shared && x.total != null ? String(x.total).replace('.', ',') : '',
    split: x.shared && x.split ? String(x.split) : '2',
    tags: x.tags || [],
    notes: x.notes || '',
  };
}

export default function AddExpenseSheet() {
  const { isOpen, payload, close } = useModal('add');
  const { state, actions, currentUser } = useStore();
  const toast = useToast();

  // editId comes from the open payload ({editId}); null/true = new expense.
  // (Stable id, not array index, so the right record is edited even if the list
  // reordered since the sheet was opened.)
  const editId =
    payload && typeof payload === 'object' && payload.editId != null ? payload.editId : null;
  const editExp = editId != null ? (state.addedExp || []).find((x) => x.id === editId) : null;
  const isEdit = !!editExp;
  // prefill comes from the open payload ({prefill}); used to materialise a
  // recurring expense into a dated list item (carries recId).
  const prefill =
    payload && typeof payload === 'object' && payload.prefill ? payload.prefill : null;

  const [d, setD] = useState(freshDraft);

  // (Re)seed the draft whenever the sheet opens (edit -> record; prefill -> seed;
  // otherwise fresh).
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit) {
      setD(draftFromExpense(editExp));
    } else if (prefill) {
      setD({
        ...freshDraft(),
        desc: prefill.desc || '',
        amount: prefill.amount != null ? String(prefill.amount).replace('.', ',') : '',
        cat: prefill.cat || 'rest',
        date: prefill.date || new Date().toISOString().slice(0, 10),
        recId: prefill.recId || null,
      });
    } else {
      setD(freshDraft());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId, prefill]);

  const cats = useMemo(() => sortedCats(state.bdg), [state.bdg]); // FIX 3
  const accounts = useMemo(() => listAccounts({ ...state, currentUser }), [state, currentUser]);

  if (!isOpen) return null;

  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));

  // Shared-split derived "your part" (orig 2160-2169).
  const totVal = parseFloat((d.total || '0').toString().replace(',', '.')) || 0;
  let splitVal = parseInt(d.split || '2', 10) || 2;
  if (splitVal < 2) splitVal = 2;
  const calc = totVal > 0 ? totVal / splitVal : 0;

  const onClose = () => {
    close();
  };

  const submit = () => {
    const desc = (d.desc || '').trim();
    let cat = d.cat;
    const date = d.date;
    let amt;
    let total = null;
    let split = null;
    if (d.shared) {
      total = parseFloat((d.total || '0').toString().replace(',', '.'));
      split = parseInt(d.split || '2', 10);
      if (isNaN(split) || split < 2) split = 2;
      if (isNaN(total) || total <= 0) {
        toast('Total inválido', 'error');
        return;
      }
      amt = total / split;
    } else {
      amt = parseFloat((d.amount || '0').toString().replace(',', '.'));
    }
    if (!desc || isNaN(amt) || amt <= 0) {
      toast('Preenche descrição e valor', 'error');
      return;
    }
    // Tags: comma-split -> trimmed, lowercased, kebab; cap 5 (orig 2342).
    const tags = (Array.isArray(d.tags) ? d.tags.join(', ') : d.tags || '')
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter((t) => t.length > 0)
      .slice(0, 5);
    // Auto-categorize new expenses via rules (orig 2344-2349); never on edit, and
    // never when materialising a recurring (keep the recurring's own category).
    if (!isEdit && !d.recId) {
      const autoCat = applyRules({ ...state }, desc);
      if (autoCat && autoCat !== cat && (state.bdg || []).find((b) => b.id === autoCat)) {
        cat = autoCat;
      }
    }
    const notes = (d.notes || '').trim();
    const exp = { desc, amount: amt, cat, date };
    if (d.recId) exp.recId = d.recId;
    if (d.acct) exp.acct = d.acct;
    if (d.shared) {
      exp.shared = true;
      exp.total = total;
      exp.split = split;
    }
    if (tags.length > 0) exp.tags = tags;
    if (notes) exp.notes = notes;

    let msg;
    if (isEdit) {
      actions.updateExpense(editId, exp);
      msg = 'Despesa atualizada';
    } else {
      actions.addExpense(exp);
      msg = d.shared ? 'Despesa partilhada adicionada (' + fm(amt) + ' tua parte)' : 'Despesa adicionada';
    }
    close();
    toast(msg, 'success');
  };

  const remove = () => {
    if (!isEdit) return;
    actions.deleteExpense(editId);
    close();
    toast('Despesa eliminada', 'success');
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid var(--border)',
    background: 'var(--elevated)',
    color: 'var(--fg)',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
  };
  const monoBig = {
    ...inputStyle,
    fontFamily: 'var(--mono)',
    fontSize: 17,
    fontWeight: 700,
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={submit}
        style={{
          width: '100%',
          padding: '14px 0',
          border: 'none',
          background: 'var(--primary)',
          color: 'var(--bg)',
          fontSize: 14,
          fontWeight: 500,
          borderRadius: 999,
        }}
      >
        {isEdit ? 'Guardar alterações' : d.recId ? 'Registar despesa' : 'Adicionar despesa'}
      </button>
      {isEdit && (
        <button
          type="button"
          onClick={remove}
          style={{
            width: '100%',
            padding: '10px 0',
            border: 'none',
            background: 'transparent',
            color: 'var(--signal)',
            fontSize: 12,
            fontWeight: 600,
            marginTop: 8,
          }}
        >
          Eliminar despesa
        </button>
      )}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={onClose} title={isEdit ? 'Editar despesa' : d.recId ? 'Registar recorrente' : 'Nova despesa'} footer={footer}>
      {/* Categoria — grelha de ícones (estilo Finany), alfabética (FIX 3) */}
      <div className="lb" style={{ marginBottom: 8 }}>Categoria</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {cats.map((b) => {
          const on = d.cat === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => set('cat', b.id)}
              aria-pressed={on}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '10px 4px',
                borderRadius: 14,
                border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border)'),
                background: on ? 'var(--blue-soft)' : 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              <CategoryIcon id={b.id} size={34} />
              <span style={{ fontSize: 9, fontWeight: 600, color: on ? 'var(--primary)' : 'var(--text2)', textAlign: 'center', lineHeight: 1.15 }}>
                {b.nm}
              </span>
            </button>
          );
        })}
      </div>

      {/* Descrição */}
      <div className="lb" style={{ marginBottom: 6 }}>Descrição</div>
      <input
        value={d.desc}
        onChange={(e) => set('desc', e.target.value)}
        placeholder="Ex: Pingo Doce"
        style={{ ...inputStyle, fontSize: 15, marginBottom: 14 }}
      />

      {/* Shared toggle */}
      <div className="rw" style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 'var(--r2)', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Despesa partilhada</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>Divide o valor por outras pessoas</div>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26 }}>
          <input
            type="checkbox"
            checked={d.shared}
            onChange={(e) => {
              const on = e.target.checked;
              // Seed total from the single-amount field when turning on (orig 2156).
              setD((p) => ({ ...p, shared: on, total: on && !p.total ? p.amount || p.total : p.total }));
            }}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: 'absolute',
              cursor: 'pointer',
              inset: 0,
              background: d.shared ? 'var(--blue)' : 'var(--border)',
              borderRadius: 26,
              transition: '0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                height: 20,
                width: 20,
                left: d.shared ? 21 : 3,
                bottom: 3,
                background: '#fff',
                borderRadius: '50%',
                transition: '0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </span>
        </label>
      </div>

      {d.shared ? (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div className="lb" style={{ marginBottom: 6 }}>Total (EUR)</div>
              <input
                value={d.total}
                onChange={(e) => set('total', e.target.value)}
                placeholder="100,00"
                inputMode="decimal"
                style={{ ...monoBig, fontSize: 15, padding: '11px 14px' }}
              />
            </div>
            <div style={{ width: 80 }}>
              <div className="lb" style={{ marginBottom: 6 }}>Pessoas</div>
              <input
                value={d.split}
                onChange={(e) => set('split', e.target.value)}
                type="number"
                min="2"
                max="10"
                style={{ ...monoBig, fontSize: 15, padding: '11px 12px', textAlign: 'center' }}
              />
            </div>
          </div>
          <div className="cd" style={{ padding: '12px 14px', marginBottom: 14, background: 'var(--blue-soft)', borderLeft: '3px solid var(--blue)' }}>
            <div className="rw">
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>A tua parte ({splitVal}x split)</div>
              <div className="m" style={{ fontSize: 16, fontWeight: 800, color: 'var(--blue)' }}>{fm(calc)}</div>
            </div>
          </div>
          <div className="lb" style={{ marginBottom: 6 }}>Data</div>
          <input
            type="date"
            value={d.date}
            onChange={(e) => set('date', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 13, marginBottom: 14 }}
          />
        </>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Valor (EUR)</div>
            <input
              value={d.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              style={monoBig}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Data</div>
            <input
              type="date"
              value={d.date}
              onChange={(e) => set('date', e.target.value)}
              style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 13 }}
            />
          </div>
        </div>
      )}

      {/* Conta debitada (opcional) */}
      <div className="lb" style={{ marginBottom: 6 }}>Conta debitada (opcional)</div>
      <select
        value={d.acct}
        onChange={(e) => set('acct', e.target.value)}
        style={{ ...inputStyle, appearance: 'none', marginBottom: 14, fontSize: 14 }}
      >
        <option value="">— sem conta —</option>
        {accounts.map((a) => {
          const label = a.bank + ' · ' + a.type;
          return (
            <option key={a.acctKey} value={label}>{label}</option>
          );
        })}
      </select>

      {/* Tags */}
      <div className="lb" style={{ marginBottom: 6 }}>Tags (opcional)</div>
      <input
        value={Array.isArray(d.tags) ? d.tags.join(', ') : d.tags || ''}
        onChange={(e) => set('tags', e.target.value)}
        placeholder="Ex: viagem-acores, casa, presente"
        style={{ ...inputStyle, fontSize: 13, marginBottom: 14 }}
      />

      {/* Notes */}
      <div className="lb" style={{ marginBottom: 6 }}>Nota (opcional)</div>
      <textarea
        value={d.notes || ''}
        onChange={(e) => set('notes', e.target.value)}
        placeholder="Detalhes ou contexto"
        rows={2}
        style={{ ...inputStyle, fontSize: 13, marginBottom: 4, resize: 'vertical', fontFamily: 'var(--font)' }}
      />
    </Sheet>
  );
}
