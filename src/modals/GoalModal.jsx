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
import Icon from '../components/Icon.jsx';
import { useStore } from '../store/store.jsx';
import { useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid } from '../lib/format.js';
import { GOAL_ICONS, ICON_LABELS, COLOR_LABELS } from '../lib/categories.js';
import { PrimaryButton } from '../components/Buttons.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { snapshotSlices } from '../lib/snapshot.js';

const COLORS = ['#3b6fee', '#3fc97a', '#f5a623', '#7b5fe0', '#f25555', '#12b3a6'];

const EMPTY = { id: null, name: '', target: '', current: '', deadline: '', monthly: '', color: '#3b6fee', icon: 'goal' };

const inputStyle = {
  width: '100%',
  padding: 'var(--space-4) var(--space-4)',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  borderRadius: 'var(--r2)',
  fontSize: 'var(--fs-md)',
  boxSizing: 'border-box',
};
const numStyle = {
  width: '100%',
  padding: 'var(--space-4) var(--space-4)',
  border: '1px solid var(--border)',
  background: 'var(--elevated)',
  color: 'var(--fg)',
  borderRadius: 8,
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-md)',
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
          monthly: g.monthly ? String(g.monthly) : '',
          color: g.color || '#3b6fee',
          icon: g.icon || 'goal',
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
    let mo = parseFloat((String(draft.monthly) || '0').replace(',', '.'));
    if (isNaN(mo) || mo < 0) mo = 0;
    if (!n) {
      toast('Nome obrigatório', 'error');
      return;
    }
    if (isNaN(t) || t <= 0) {
      toast('Objetivo inválido', 'error');
      return;
    }
    if (isNaN(c) || c < 0) c = 0;
    if (draft.id) {
      actions.updateGoal(draft.id, { name: n, target: t, current: c, deadline: d, monthly: mo, color: draft.color, icon: draft.icon || 'goal' });
    } else {
      actions.addGoal({ id: uid(), name: n, target: t, current: c, deadline: d, monthly: mo, color: draft.color || '#3b6fee', icon: draft.icon || 'goal', createdAt: Date.now() });
    }
    close();
    toast(draft.id ? 'Meta atualizada' : 'Meta criada', 'success');
  }

  function deleteGoal() {
    if (!draft.id) return;
    const snap = snapshotSlices(actions.getState(), ['goals']);
    actions.deleteGoal(draft.id);
    close();
    toast('Meta eliminada', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
  }

  if (!isOpen) return null;

  const footer = (
    <>
      <PrimaryButton onClick={saveGoal}>
        {isEdit ? 'Guardar alterações' : 'Criar meta'}
      </PrimaryButton>
      {isEdit && (
        <>
          <ConfirmButton label="Eliminar meta" confirmLabel="Confirmar eliminação" onConfirm={deleteGoal} style={{ marginTop: 'var(--space-3)' }} />
          {parseFloat((String(draft.current) || '0').replace(',', '.')) > 0 && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', textAlign: 'center', marginTop: 'var(--space-2)' }}>
              O valor poupado não é devolvido a nenhuma conta.
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={isEdit ? 'Editar meta' : 'Nova meta'} footer={footer}>
      <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Nome</div>
      <input
        value={draft.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="Ex: Fundo Emergência"
        aria-label="Nome"
        style={{ ...inputStyle, marginBottom: 'var(--space-4)' }}
      />

      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Objetivo</div>
          <input value={draft.target} onChange={(e) => set('target', e.target.value)} placeholder="10000" inputMode="decimal" aria-label="Objetivo" style={numStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Atual</div>
          <input value={draft.current} onChange={(e) => set('current', e.target.value)} placeholder="0" inputMode="decimal" aria-label="Atual" style={numStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Data alvo (opcional)</div>
          <input
            type="date"
            value={draft.deadline}
            onChange={(e) => set('deadline', e.target.value)}
            aria-label="Data alvo (opcional)"
            style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 'var(--fs-md)' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 'var(--space-2)' }}>Reservar/mês (opcional)</div>
          <input value={draft.monthly} onChange={(e) => set('monthly', e.target.value)} placeholder="200" inputMode="decimal" aria-label="Reservar por mês" style={numStyle} />
        </div>
      </div>

      <div className="lb" style={{ marginBottom: 'var(--space-3)' }}>Ícone</div>
      <div className="icon-grid">
        {GOAL_ICONS.map((ic) => (
          <button key={ic} type="button" aria-label={'Ícone ' + (ICON_LABELS[ic] || ic)} aria-pressed={draft.icon === ic} onClick={() => set('icon', ic)}>
            <Icon name={ic} size={18} />
          </button>
        ))}
      </div>

      <div className="lb" style={{ marginBottom: 'var(--space-3)' }}>Cor</div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set('color', c)}
            aria-label={'Cor ' + (COLOR_LABELS[c] || c)}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: draft.color === c ? '3px solid var(--text)' : '3px solid transparent',
              background: c,
              transition: 'transform 0.15s',
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}
