/* ════════════════════════════════════════════════════════════════════════
   Goal modal (Nova / Editar meta) — React port of rGoalModal (orig 1385-1406)
   + editGoal (1408) / saveGoal (1414) / deleteGoal (1432).

   - Rendered inside the shared <Sheet>.
   - Open via useUI().open('goal', { id }) — payload { id } means edit; no
     payload (true) means create.
   - Local draft holds { name, target, current, deadline, color } as the user
     types; the colour picker mutates draft.color.
   - Save validates (name required, target > 0) then add/update via actions.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useStore } from '../store/store.jsx';
import { useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid } from '../lib/format.js';

const COLORS = ['#0b1220', '#22c55e', '#f59e0b', '#4a5366', '#ef4444', '#8b95a8'];

const EMPTY = { id: null, name: '', target: '', current: '', deadline: '', color: '#0b1220' };

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

export default function GoalModal() {
  const { state, actions } = useStore();
  const { isOpen, payload, close } = useModal('goal');
  const toast = useToast();
  const [draft, setDraft] = useState(EMPTY);

  // Seed the draft when the sheet opens (from the goal being edited, or empty).
  useEffect(() => {
    if (!isOpen) return;
    const id = payload && typeof payload === 'object' ? payload.id : null;
    if (id) {
      const g = (state.goals || []).find((x) => x.id === id);
      if (g) {
        setDraft({
          id: g.id,
          name: g.name,
          target: String(g.target),
          current: String(g.current),
          deadline: g.deadline || '',
          color: g.color || '#0b1220',
        });
        return;
      }
    }
    setDraft(EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payload]);

  const isEdit = !!draft.id;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  function saveGoal() {
    const n = (draft.name || '').trim();
    const t = parseFloat((String(draft.target) || '0').replace(',', '.'));
    let c = parseFloat((String(draft.current) || '0').replace(',', '.'));
    const d = draft.deadline;
    if (!n) {
      toast('Nome obrigatorio', 'error');
      return;
    }
    if (isNaN(t) || t <= 0) {
      toast('Objetivo invalido', 'error');
      return;
    }
    if (isNaN(c) || c < 0) c = 0;
    if (draft.id) {
      actions.updateGoal(draft.id, { name: n, target: t, current: c, deadline: d, color: draft.color });
    } else {
      actions.addGoal({ id: uid(), name: n, target: t, current: c, deadline: d, color: draft.color || '#0b1220', createdAt: Date.now() });
    }
    close();
    toast(draft.id ? 'Meta atualizada' : 'Meta criada', 'success');
  }

  function deleteGoal() {
    if (!draft.id) return;
    actions.deleteGoal(draft.id);
    close();
    toast('Meta eliminada', 'success');
  }

  if (!isOpen) return null;

  const footer = (
    <>
      <button
        type="button"
        onClick={saveGoal}
        style={{ width: '100%', padding: '14px 0', border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontSize: 14, fontWeight: 500, borderRadius: 999 }}
      >
        {isEdit ? 'Guardar alteracoes' : 'Criar meta'}
      </button>
      {isEdit && (
        <button
          type="button"
          onClick={deleteGoal}
          style={{ width: '100%', padding: '12px 0', border: 'none', background: 'transparent', color: 'var(--signal)', fontSize: 13, fontWeight: 600, marginTop: 8 }}
        >
          Eliminar meta
        </button>
      )}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={isEdit ? 'Editar meta' : 'Nova meta'} footer={footer}>
      <div className="lb" style={{ marginBottom: 6 }}>Nome</div>
      <input
        value={draft.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="Ex: Fundo Emergencia"
        style={{ ...inputStyle, marginBottom: 16 }}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Objetivo</div>
          <input value={draft.target} onChange={(e) => set('target', e.target.value)} placeholder="10000" inputMode="decimal" style={numStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Atual</div>
          <input value={draft.current} onChange={(e) => set('current', e.target.value)} placeholder="0" inputMode="decimal" style={numStyle} />
        </div>
      </div>

      <div className="lb" style={{ marginBottom: 6 }}>Data alvo (opcional)</div>
      <input
        type="date"
        value={draft.deadline}
        onChange={(e) => set('deadline', e.target.value)}
        style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 14, marginBottom: 16 }}
      />

      <div className="lb" style={{ marginBottom: 8 }}>Cor</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set('color', c)}
            aria-label={'Cor ' + c}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: draft.color === c ? '3px solid var(--text)' : '3px solid transparent',
              background: c,
              padding: 0,
              transition: 'transform 0.15s',
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}
