/* ════════════════════════════════════════════════════════════════════════
   EmergencyFundCard — "Fundo de emergência": meses de despesa cobertos pela
   liquidez + poupança, com a régua até aos 6 meses.

   Extraído do OverviewView na Task 10 sem alterar o JSX nem as derivações
   (emergencyFund + escalões de cor/etiqueta).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore } from '../../store/store.jsx';
import { emergencyFund, isNewUser } from '../../lib/finance.js';
import { fc, mask } from '../../lib/format.js';

export default function EmergencyFundCard() {
  const { state, currentUser } = useStore();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const newU = useMemo(() => isNewUser(s), [s]);
  const ef = useMemo(() => (!newU ? emergencyFund(s) : null), [s, newU]);
  const hidden = !!state.balancesHidden;

  if (newU || !ef) return null;
  const efPct = Math.min((ef.months / 6) * 100, 100);
  const efColor = ef.months >= 6 ? 'var(--success)' : ef.months >= 3 ? 'var(--orange)' : 'var(--signal)';
  const efLabel = ef.months >= 6 ? 'Sólido' : ef.months >= 3 ? 'Razoável' : ef.months >= 1 ? 'Fraco' : 'Crítico';

  return (
    <div className="cd" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-5) var(--space-5)' }}>
      <div className="rw" style={{ marginBottom: 'var(--space-3)' }}>
        <div>
          <div className="lb">Fundo de emergência</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-1)' }}>
            Liquidez + Poupança / despesa média
          </div>
        </div>
        <div className="chip" style={{ background: efColor, color: '#fff' }}>{efLabel}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <div className="m" style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: efColor, letterSpacing: '-0.02em' }}>
          {ef.months.toFixed(1)}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text2)', fontWeight: 600 }}>meses cobertos</div>
      </div>
      <div className="rw m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-2)' }}>
        <span>Reserva: {mask(ef.safe, hidden, fc)}</span>
        <span>Despesa/mês: {mask(ef.avgMonthly, hidden, fc)}</span>
      </div>
      <div className="bar" style={{ height: 6, marginTop: 'var(--space-3)' }}>
        <div className="bar-fill" style={{ width: efPct + '%', background: efColor }} />
      </div>
      <div className="rw m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-2)' }}>
        <span>0</span>
        <span>3 meses</span>
        <span>6 meses (ideal)</span>
      </div>
    </div>
  );
}
