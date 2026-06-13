/* ════════════════════════════════════════════════════════════════════════
   Recurring modal (Nova / Editar subscricao) — React port of rRecModal
   (orig 1487-1506) + editRec (1508) / saveRec (1514) / deleteRec (1532).

   - Rendered inside the shared <Sheet>.
   - Open via useUI().open('rec', { id }) — payload { id } means edit.
   - Local draft { name, amount, day, cat }.
   - FIX 3: the category <select> is ordered with sortedCats(state.bdg).
   - Save validates (name required, amount > 0, day 1..31) then add/update.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useStore } from '../store/store.jsx';
import { useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid } from '../lib/format.js';
import { sortedCats } from '../lib/categories.js';

const EMPTY = { id: null, name: '', amount: '', day: '', cat: 'sub' };

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

export default function RecModal() {
  const { state, actions } = useStore();
  const { isOpen, payload, close } = useModal('rec');
  const toast = useToast();
  const [draft, setDraft] = useState(EMPTY);

  useEffect(() => {
    if (!isOpen) return;
    const id = payload && typeof payload === 'object' ? payload.id : null;
    if (id) {
      const r = (state.recurring || []).find((x) => x.id === id);
      if (r) {
        setDraft({ id: r.id, name: r.name, amount: String(r.amount), day: String(r.day), cat: r.cat || 'sub' });
        return;
      }
    }
    setDraft(EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payload]);

  const isEdit = !!draft.id;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const cats = sortedCats(state.bdg || []);

  function saveRec() {
    const n = (draft.name || '').trim();
    const a = parseFloat((String(draft.amount) || '0').replace(',', '.'));
    let d = parseInt(String(draft.day) || '1');
    const c = draft.cat;
    if (!n) {
      toast('Nome obrigatorio', 'error');
      return;
    }
    if (isNaN(a) || a <= 0) {
      toast('Valor invalido', 'error');
      return;
    }
    if (isNaN(d) || d < 1 || d > 31) d = 1;
    if (draft.id) {
      actions.updateRecurring(draft.id, { name: n, amount: a, day: d, cat: c });
    } else {
      actions.addRecurring({ id: uid(), name: n, amount: a, day: d, cat: c, createdAt: Date.now() });
    }
    close();
    toast(draft.id ? 'Subscricao atualizada' : 'Subscricao adicionada', 'success');
  }

  function deleteRec() {
    if (!draft.id) return;
    actions.deleteRecurring(draft.id);
    close();
    toast('Recorrente eliminada', 'success');
  }

  if (!isOpen) return null;

  const footer = (
    <>
      <button
        type="button"
        onClick={saveRec}
        style={{ width: '100%', padding: '14px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', fontSize: 14, fontWeight: 500, borderRadius: 999 }}
      >
        {isEdit ? 'Guardar alteracoes' : 'Adicionar'}
      </button>
      {isEdit && (
        <button
          type="button"
          onClick={deleteRec}
          style={{ width: '100%', padding: '10px 0', border: 'none', background: 'transparent', color: 'var(--signal)', fontSize: 12, fontWeight: 600, marginTop: 8 }}
        >
          Eliminar
        </button>
      )}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={isEdit ? 'Editar subscricao' : 'Nova subscricao'} footer={footer}>
      <div className="lb" style={{ marginBottom: 6 }}>Nome</div>
      <input
        value={draft.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="Ex: Netflix"
        style={{ ...inputStyle, marginBottom: 16 }}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Valor</div>
          <input value={draft.amount} onChange={(e) => set('amount', e.target.value)} placeholder="9,99" inputMode="decimal" style={numStyle} />
        </div>
        <div style={{ width: 90 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Dia</div>
          <input value={draft.day} onChange={(e) => set('day', e.target.value)} placeholder="1" inputMode="numeric" style={{ ...numStyle, textAlign: 'center' }} />
        </div>
      </div>

      <div className="lb" style={{ marginBottom: 6 }}>Categoria</div>
      <select
        value={draft.cat}
        onChange={(e) => set('cat', e.target.value)}
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
        {cats.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nm}
          </option>
        ))}
      </select>
    </Sheet>
  );
}
