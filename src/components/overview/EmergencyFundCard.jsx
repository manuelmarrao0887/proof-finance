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
    <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
      <div className="rw" style={{ marginBottom: 10 }}>
        <div>
          <div className="lb">Fundo de emergência</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            Liquidez + Poupança / despesa média
          </div>
        </div>
        <div className="chip" style={{ background: efColor, color: '#fff' }}>{efLabel}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div className="m" style={{ fontSize: 30, fontWeight: 600, color: efColor, letterSpacing: '-0.02em' }}>
          {ef.months.toFixed(1)}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>meses cobertos</div>
      </div>
      <div className="rw m" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
        <span>Reserva: {mask(ef.safe, hidden, fc)}</span>
        <span>Despesa/mês: {mask(ef.avgMonthly, hidden, fc)}</span>
      </div>
      <div className="bar" style={{ height: 6, marginTop: 10 }}>
        <div className="bar-fill" style={{ width: efPct + '%', background: efColor }} />
      </div>
      <div className="rw m" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        <span>0</span>
        <span>3 meses</span>
        <span>6 meses (ideal)</span>
      </div>
    </div>
  );
}
