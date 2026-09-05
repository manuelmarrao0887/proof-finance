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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm, todayISO } from '../lib/format.js';
import { applyRules } from '../lib/finance.js';
import { sortedCats } from '../lib/categories.js';
import { listAccounts } from '../lib/balances.js';
import { topCategories, lastUsedAccount } from '../lib/categoryUsage.js';
import CategoryIcon from '../components/CategoryIcon.jsx';
import MerchantLogo from '../components/MerchantLogo.jsx';
import { resolveBrand } from '../lib/brands.jsx';
import { PrimaryButton } from '../components/Buttons.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { snapshotSlices } from '../lib/snapshot.js';

// Fresh draft for a brand-new expense (orig addData default 417 / reset 2364).
// D5 (Task 9): a conta vem pré-preenchida com a última usada — poupa um toque
// no caso comum; nunca se aplica a uma edição (ver draftFromExpense).
function freshDraft(state) {
  return {
    desc: '',
    amount: '',
    cat: 'rest',
    date: todayISO(),
    acct: lastUsedAccount(state),
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
    date: x.date || todayISO(),
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
  // Inline validation errors keyed by field (desc / amount / total).
  const [errors, setErrors] = useState({});
  // D5 (Task 9): grelha de categorias reduzida às mais usadas até "Mais
  // categorias" ser tocado; "Mais opções" esconde partilhada/tags/nota.
  const [allCats, setAllCats] = useState(false);
  const [more, setMore] = useState(false);
  // Foco automático no valor ao abrir (ver useEffect abaixo — a sheet anima).
  const amountRef = useRef(null);

  // (Re)seed the draft whenever the sheet opens (edit -> record; prefill -> seed;
  // otherwise fresh).
  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setAllCats(false);
    if (isEdit) {
      const nd = draftFromExpense(editExp);
      setD(nd);
      // Em edição, "Mais opções" começa aberta se já houver algo lá dentro
      // (senão o utilizador nem vê que a despesa é partilhada / tem tags/nota).
      setMore(!!(nd.shared || (nd.tags && nd.tags.length > 0) || nd.notes));
    } else if (prefill) {
      setD({
        ...freshDraft(state),
        desc: prefill.desc || '',
        amount: prefill.amount != null ? String(prefill.amount).replace('.', ',') : '',
        cat: prefill.cat || 'rest',
        date: prefill.date || todayISO(),
        acct: prefill.acct || '',
        recId: prefill.recId || null,
      });
      setMore(false);
    } else {
      setD(freshDraft(state));
      setMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId, prefill]);

  // Foco no valor ao abrir: a sheet ainda está a animar, por isso o pequeno
  // atraso (jsdom honra .focus() de qualquer forma, o timeout é só para o
  // browser real não roubar o foco a meio da transição).
  useEffect(() => {
    if (!isOpen) return undefined;
    const t = setTimeout(() => {
      if (amountRef.current) amountRef.current.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  const cats = useMemo(() => sortedCats(state.bdg), [state.bdg]); // FIX 3
  const accounts = useMemo(() => listAccounts({ ...state, currentUser }), [state, currentUser]);
  // D5: as 6 categorias mais usadas nos últimos 90 dias (com fallback aos
  // defaults) — só recalcula quando os dados de origem mudam.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const top = useMemo(() => topCategories(state), [state.addedExp, state.bdg]);
  const shownCats = useMemo(() => {
    if (allCats) return cats;
    let list = cats.filter((b) => top.includes(b.id));
    if (!top.includes(d.cat)) {
      const own = cats.find((b) => b.id === d.cat);
      if (own) list = [...list, own];
    }
    return list.slice().sort((a, b) => {
      const ai = top.indexOf(a.id);
      const bi = top.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [allCats, cats, top, d.cat]);

  if (!isOpen) return null;

  const set = (k, v) => {
    setD((p) => ({ ...p, [k]: v }));
    // Clear the inline error for the field as the user edits it.
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

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
        setErrors({ total: 'Total inválido' });
        toast('Total inválido', 'error');
        return;
      }
      amt = total / split;
    } else {
      amt = parseFloat((d.amount || '0').toString().replace(',', '.'));
    }
    const fieldErrs = {};
    if (!desc) fieldErrs.desc = 'Preenche a descrição';
    if (!d.shared && (isNaN(amt) || amt <= 0)) fieldErrs.amount = 'Preenche o valor';
    if (Object.keys(fieldErrs).length > 0) {
      setErrors(fieldErrs);
      toast('Preenche descrição e valor', 'error');
      return;
    }
    setErrors({});
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
    // groupEntries também vai no snapshot — ver a mesma nota em
    // ExpensesView.jsx deleteExp (Task 8, review "Fix round 1", finding 1).
    const snap = snapshotSlices(actions.getState(), ['addedExp', 'groupEntries']);
    actions.deleteExpense(editId);
    close();
    toast('Despesa eliminada', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
  };

  const inputStyle = {
    width: '100%',
    padding: 'var(--space-4) var(--space-4)',
    border: '1px solid var(--border)',
    background: 'var(--elevated)',
    color: 'var(--fg)',
    borderRadius: 8,
    fontSize: 'var(--fs-md)',
    boxSizing: 'border-box',
  };
  const monoBig = {
    ...inputStyle,
    fontFamily: 'var(--mono)',
    fontSize: 'var(--fs-lg)',
    fontWeight: 600,
  };
  // Inline error helper text (orig had only a toast).
  const errText = (msg) =>
    msg ? <div style={{ color: 'var(--signal)', fontSize: 'var(--fs-xs)', marginTop: 'var(--space-2)' }}>{msg}</div> : null;

  const footer = (
    <>
      <PrimaryButton onClick={submit}>
        {isEdit ? 'Guardar alterações' : d.recId ? 'Registar despesa' : 'Adicionar despesa'}
      </PrimaryButton>
      {isEdit && (
        <ConfirmButton label="Eliminar despesa" confirmLabel="Confirmar eliminação" onConfirm={remove} style={{ marginTop: 'var(--space-3)' }} />
      )}
    </>
  );

  // Estilo do botão "Mais categorias" / "Mais opções" — link discreto, sem
  // competir com o valor (o campo que realmente importa nos 5 segundos).
  const moreBtnStyle = {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    border: '1px dashed var(--border)',
    background: 'transparent',
    color: 'var(--primary)',
    borderRadius: 8,
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 'var(--space-4)',
  };

  return (
    <Sheet open={isOpen} onClose={onClose} title={isEdit ? 'Editar despesa' : d.recId ? 'Registar recorrente' : 'Nova despesa'} footer={footer}>
      {/* D5: valor primeiro — o campo que decide 90% dos casos, com foco
          automático (ver useEffect). Só aparece quando não é partilhada: com
          d.shared o valor vem do Total/Pessoas dentro de "Mais opções". */}
      {!d.shared && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Valor (€)</div>
          <input
            ref={amountRef}
            autoFocus
            value={d.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            aria-label="Valor (€)"
            style={{ ...monoBig, fontSize: 'var(--fs-2xl)' }}
          />
          {errText(errors.amount)}
        </div>
      )}

      {/* Categoria — grelha de ícones (estilo Finany): as mais usadas nos
          últimos 90 dias primeiro, com "Mais categorias" para a lista alfabética
          completa (FIX 3). */}
      <div role="group" aria-label="Categoria">
        <div className="lb" style={{ marginBottom: 'var(--space-3)' }}>Categoria</div>
        {/* minmax(0,1fr) e não 1fr: o chão de 1fr é min-content, por isso nomes
            longos ("Combustível") empurravam a grelha para lá do ecrã a 320px. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          {shownCats.map((b) => {
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
                  gap: 'var(--space-2)',
                  minWidth: 0,
                  padding: 'var(--space-3) var(--space-2)',
                  borderRadius: 14,
                  border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border)'),
                  background: on ? 'var(--blue-soft)' : 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <CategoryIcon id={b.id} size={34} bdg={cats} />
                {/* minWidth:0 + hyphens: "Supermercado" (77px) não cabia numa
                    célula de 65px a 320px e empurrava a grelha para fora. */}
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: on ? 'var(--primary)' : 'var(--text2)', textAlign: 'center', lineHeight: 1.15, minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', hyphens: 'auto' }}>
                  {b.nm}
                </span>
              </button>
            );
          })}
        </div>
        {!allCats && (
          <button type="button" onClick={() => setAllCats(true)} style={moreBtnStyle}>
            Mais categorias
          </button>
        )}
      </div>

      {/* Descrição */}
      <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Descrição</div>
      <div style={{ position: 'relative', marginBottom: errors.desc ? 0 : 14 }}>
        {resolveBrand(d.desc) && (
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex' }}>
            <MerchantLogo text={d.desc} size={26} />
          </span>
        )}
        <input
          value={d.desc}
          onChange={(e) => set('desc', e.target.value)}
          placeholder="Ex: Pingo Doce"
          aria-label="Descrição"
          style={{ ...inputStyle, fontSize: 'var(--fs-md)', paddingLeft: resolveBrand(d.desc) ? 'var(--space-7)' : 'var(--space-4)' }}
        />
      </div>
      {errText(errors.desc)}
      {errors.desc && <div style={{ height: 14 }} />}

      {/* Conta debitada (opcional) — pré-selecionada com a última usada */}
      <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Conta debitada (opcional)</div>
      <select
        value={d.acct}
        onChange={(e) => set('acct', e.target.value)}
        aria-label="Conta debitada (opcional)"
        style={{ ...inputStyle, appearance: 'none', marginBottom: 'var(--space-4)', fontSize: 'var(--fs-md)' }}
      >
        <option value="">— sem conta —</option>
        {accounts.map((a) => {
          const label = a.bank + ' · ' + a.type;
          return (
            <option key={a.acctKey} value={label}>{label}</option>
          );
        })}
      </select>

      {/* Data */}
      <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Data</div>
      <input
        type="date"
        value={d.date}
        onChange={(e) => set('date', e.target.value)}
        aria-label="Data"
        style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-4)' }}
      />

      {/* Mais opções — partilhada / tags / nota, fora do caminho dos 5 segundos */}
      <button type="button" aria-expanded={more} onClick={() => setMore(!more)} style={moreBtnStyle}>
        Mais opções
      </button>
      {more && (
        <>
          {/* Shared toggle */}
          <div className="rw" style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--bg3)', borderRadius: 'var(--r2)', marginBottom: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Despesa partilhada</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-1)' }}>Divide o valor por outras pessoas</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26 }}>
              <input
                type="checkbox"
                checked={d.shared}
                aria-label="Despesa partilhada"
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

          {d.shared && (
            <>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <div style={{ flex: 1 }}>
                  <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Total (€)</div>
                  <input
                    value={d.total}
                    onChange={(e) => set('total', e.target.value)}
                    placeholder="100,00"
                    inputMode="decimal"
                    aria-label="Total (€)"
                    style={{ ...monoBig, fontSize: 'var(--fs-md)', padding: 'var(--space-4) var(--space-4)' }}
                  />
                  {errText(errors.total)}
                </div>
                <div style={{ width: 80 }}>
                  <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Pessoas</div>
                  <input
                    value={d.split}
                    onChange={(e) => set('split', e.target.value)}
                    type="number"
                    min="2"
                    max="10"
                    aria-label="Pessoas"
                    style={{ ...monoBig, fontSize: 'var(--fs-md)', padding: 'var(--space-4) var(--space-4)', textAlign: 'center' }}
                  />
                </div>
              </div>
              <div className="cd" style={{ padding: 'var(--space-4) var(--space-4)', marginBottom: 'var(--space-4)', background: 'var(--blue-soft)', borderLeft: '3px solid var(--blue)' }}>
                <div className="rw">
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text2)' }}>A tua parte ({splitVal}x split)</div>
                  <div className="m" style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--blue)' }}>{fm(calc)}</div>
                </div>
              </div>
            </>
          )}

          {/* Tags */}
          <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Tags (opcional)</div>
          <input
            value={Array.isArray(d.tags) ? d.tags.join(', ') : d.tags || ''}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="Ex: viagem-acores, casa, presente"
            aria-label="Tags (opcional)"
            style={{ ...inputStyle, fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-4)' }}
          />

          {/* Notes */}
          <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Nota (opcional)</div>
          <textarea
            value={d.notes || ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Detalhes ou contexto"
            aria-label="Nota (opcional)"
            rows={2}
            style={{ ...inputStyle, fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-2)', resize: 'vertical', fontFamily: 'var(--font)' }}
          />
        </>
      )}
    </Sheet>
  );
}
