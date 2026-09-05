/* ════════════════════════════════════════════════════════════════════════
   HealthCard — "Saúde financeira": score /100, o detalhe por dimensão e as
   recomendações para o subir.

   Extraído do OverviewView na Task 10 sem alterar o JSX nem as derivações
   (healthScore + a cor por escalão). Vai para o Relatório na Task 11.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore } from '../../store/store.jsx';
import { healthScore, isNewUser } from '../../lib/finance.js';

export default function HealthCard() {
  const { state, currentUser } = useStore();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const newU = useMemo(() => isNewUser(s), [s]);
  const hs = useMemo(() => (!newU ? healthScore(s) : null), [s, newU]);
  const hidden = !!state.balancesHidden;
  // b.detail vem pré-formatado do finance.js (ex.: "68%") — só há a mascarar.
  const maskDetail = (d) => (hidden ? String(d).replace(/-?\d+(\.\d+)?%/g, '••%') : d);

  if (newU || !hs) return null;
  const hsCol = hs.score >= 70 ? 'var(--success)' : hs.score >= 50 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="cd" style={{ marginBottom: 16, padding: 20 }}>
      <div className="rw" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
        <div>
          <div className="lb">Saúde financeira</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <div className="m" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', color: hsCol }}>
              {hs.score}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              / 100
            </div>
          </div>
        </div>
        <div className="chip" style={{ background: 'transparent', color: hsCol, border: '1px solid ' + hsCol }}>
          {hs.grade}
        </div>
      </div>
      <div className="bar" style={{ height: 6, background: 'var(--elevated)', marginBottom: 14 }}>
        <div className="bar-fill" style={{ width: hs.score + '%', background: hsCol }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {hs.breakdown.map((b) => {
          const pct = b.max > 0 ? (b.pts / b.max) * 100 : 0;
          const col = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
          return (
            <div key={b.label}>
              <div className="rw" style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{b.label}</div>
                <div className="m" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                  {b.pts}/{b.max} · {maskDetail(b.detail)}
                </div>
              </div>
              <div style={{ height: 3, background: 'var(--elevated)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: col, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
      {hs.recommendations.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="lb" style={{ marginBottom: 8 }}>Para subir o score</div>
          {hs.recommendations.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              <span className="m" style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>
                {'0' + (i + 1)}
              </span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
