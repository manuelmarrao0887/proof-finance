/* ════════════════════════════════════════════════════════════════════════
   ClosingCard — "Fecho de {mês}": o balanço do mês que acabou, só nos
   primeiros dias do mês novo (monthClosing devolve null fora dessa janela).

   Extraído do OverviewView na Task 10 sem alterar uma linha do JSX nem uma
   das derivações: o Resumo passou a ter uma tese só ("podes gastar hoje") e
   este bloco vai para o Relatório na Task 11. Lê o store por si.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore } from '../../store/store.jsx';
import { isNewUser } from '../../lib/finance.js';
import { monthClosing } from '../../lib/closing.js';
import { fc, mask, maskPct } from '../../lib/format.js';
import { catMeta } from '../../lib/categories.js';
import CategoryIcon from '../CategoryIcon.jsx';
import StatTiles from '../StatTiles.jsx';

export default function ClosingCard() {
  const { state, currentUser } = useStore();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const newU = useMemo(() => isNewUser(s), [s]);
  const closing = useMemo(() => (!newU ? monthClosing(s) : null), [s, newU]);
  const hidden = !!state.balancesHidden;

  if (newU || !closing) return null;

  return (
    <div className="cd" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', borderLeft: '3px solid ' + (closing.better ? 'var(--success)' : 'var(--warning)') }}>
      <div className="rw" style={{ marginBottom: 'var(--space-3)' }}>
        <div className="lb">Fecho de {closing.monthName}</div>
        {closing.deltaPct != null && (
          <span className="m" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: closing.better ? 'var(--success)' : 'var(--warning)' }}>
            {hidden ? maskPct(closing.deltaPct, hidden) : (closing.deltaPct > 0 ? '+' : '') + Math.round(closing.deltaPct) + '%'} vs média
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span className="m" style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {mask(closing.total, hidden, fc)}
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text3)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>gastos</span>
      </div>
      {closing.rate != null && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginBottom: 'var(--space-3)' }}>
          Poupaste {mask(closing.saved, hidden, fc)} ({maskPct(closing.rate, hidden)} do rendimento)
        </div>
      )}
      {closing.top.length > 0 && (
        <StatTiles
          items={closing.top.map((t) => ({
            key: t.cat,
            icon: <CategoryIcon id={t.cat} size={24} bdg={state.bdg} />,
            value: mask(t.value, hidden, fc),
            label: t.name,
            color: catMeta(t.cat, (state.bdg || []).find((b) => b.id === t.cat)).color,
          }))}
        />
      )}
    </div>
  );
}
