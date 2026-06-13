/* ════════════════════════════════════════════════════════════════════════
   ContextStrip — compact strip shown above NON-overview tabs (replaces the
   hero). Ported from renderContextStrip (orig 2968-2989).

   Picks a single headline label + value based on the active tab. Returns just
   an 8px spacer for new users or tabs with nothing to show.

   Props: { tab? } — the active tab string. When omitted, falls back to
   useUI().tab (the spec's source of truth for navigation).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { compute, monthlySummary, isNewUser } from '../lib/finance.js';
import { fc } from '../lib/format.js';

export default function ContextStrip({ tab: tabProp }) {
  const { state, currentUser } = useStore();
  const ui = useUI();
  const tab = tabProp != null ? tabProp : ui.tab;
  const s = { ...state, currentUser };
  const C = compute(s);
  const newU = isNewUser(s);

  let label = '';
  let val = '';
  let col = 'var(--text)';

  if (tab === 'expenses') {
    const ms = monthlySummary(s);
    label = 'Gastos do mês';
    val = fc(ms.exp);
    col = 'var(--signal)';
  } else if (tab === 'income') {
    let tot = 0;
    (state.incomes || []).forEach((i) => {
      if (i.recurring !== false) tot += i.amount || 0;
    });
    label = 'Receita mensal recorrente';
    val = fc(tot);
    col = 'var(--success)';
  } else if (tab === 'goals') {
    let tt = 0;
    let tc = 0;
    (state.goals || []).forEach((g) => {
      tt += g.target || 0;
      tc += g.current || 0;
    });
    const p = tt > 0 ? (tc / tt) * 100 : 0;
    label = 'Progresso global';
    val = p.toFixed(0) + '%';
    col = 'var(--blue)';
  } else if (tab === 'loan') {
    label = 'Património liquido';
    val = fc(C.nW);
    col = C.nW >= 0 ? 'var(--success)' : 'var(--signal)';
  } else if (tab === 'cal' || tab === 'charts' || tab === 'rec' || tab === 'ai') {
    label = 'Património liquido';
    val = fc(C.nW);
    col = 'var(--text)';
  }

  if (!label || newU) return <div style={{ height: 8 }} />;

  return (
    <div style={{ padding: '0 20px 14px' }}>
      <div
        className="cd"
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div className="lb">{label}</div>
        <div className="m" style={{ fontSize: 16, fontWeight: 800, color: col }}>
          {val}
        </div>
      </div>
    </div>
  );
}
