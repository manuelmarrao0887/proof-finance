/* ════════════════════════════════════════════════════════════════════════
   ProjectionCard — "Projeção N meses": o saldo projetado mês a mês (barras
   até 6 linhas, sparkline acima disso) com o seletor 3M/6M/12M.

   Extraído do OverviewView na Task 10 sem alterar o JSX nem as derivações
   (cashFlowProjection + a pré-computação do mini-gráfico).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore } from '../../store/store.jsx';
import { cashFlowProjection, isNewUser } from '../../lib/finance.js';
import { fc, mask } from '../../lib/format.js';

export default function ProjectionCard() {
  const { state, actions, currentUser } = useStore();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const newU = useMemo(() => isNewUser(s), [s]);
  const cf = useMemo(() => (!newU ? cashFlowProjection(s) : null), [s, newU]);
  const hidden = !!state.balancesHidden;
  const forecastMonths = state.forecastMonths || 3;

  // Pré-computação do mini-gráfico: barras quando <= 6 linhas, sparkline acima.
  let cfMaxAbs = 0;
  let cfStartPct = 0;
  let cfSparkPts = '';
  let cfZeroY = 0;
  let cfRowsToShow = [];
  if (cf) {
    if (cf.rows.length <= 6) {
      cfMaxAbs = Math.max.apply(
        null,
        cf.rows.map((r) => Math.abs(r.balance)).concat([Math.abs(cf.startBalance)])
      );
      cfStartPct = cf.startBalance > 0 ? (Math.abs(cf.startBalance) / cfMaxAbs) * 100 : 0;
    } else {
      const allVals = [cf.startBalance].concat(cf.rows.map((r) => r.balance));
      const mnv = Math.min.apply(null, allVals);
      const mxv = Math.max.apply(null, allVals);
      const rgv = mxv - mnv || 1;
      cfSparkPts = allVals
        .map((v, i) => ((i / (allVals.length - 1)) * 100).toFixed(1) + ',' + (50 - ((v - mnv) / rgv) * 45).toFixed(1))
        .join(' ');
      cfZeroY = Number((50 - ((0 - mnv) / rgv) * 45).toFixed(1));
    }
    cfRowsToShow =
      cf.rows.length > 6
        ? [cf.rows[0], cf.rows[Math.floor(cf.rows.length / 2)], cf.rows[cf.rows.length - 1]]
        : cf.rows;
  }

  if (newU || !cf) return null;
  const lastBal = cf.rows[cf.rows.length - 1].balance;

  return (
    <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
      <div className="rw" style={{ marginBottom: 12 }}>
        <div className="lb">Projeção {forecastMonths} meses</div>
        <div className={'chip ' + (lastBal >= cf.startBalance ? 'up-solid' : 'down-solid')}>
          {mask(lastBal - cf.startBalance, hidden, (v) => (v >= 0 ? '+' : '') + fc(v))}
        </div>
      </div>
      <div className="ms-bar" style={{ marginBottom: 14 }}>
        {[3, 6, 12].map((m) => (
          <button
            key={m}
            type="button"
            className={'ms' + (forecastMonths === m ? ' on' : '')}
            onClick={() => actions.setForecastMonths(m)}
          >
            {m}M
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 14, lineHeight: 1.5 }}>
        Receitas {mask(cf.monthlyIncome, hidden, fc)}/mês · recorrentes {mask(cf.monthlyRecExpense, hidden, fc)} · crédito {mask(cf.loanPay, hidden, fc)} · discricionário {mask(cf.avgDiscretionary, hidden, fc)}
      </div>

      {cf.rows.length <= 6 ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginBottom: 10 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', background: 'var(--elevated)', borderRadius: '4px 4px 0 0', height: cfStartPct + '%', minHeight: 4 }} />
            <div className="m" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Hoje</div>
          </div>
          {cf.rows.map((r, i) => {
            const pct = (Math.abs(r.balance) / cfMaxAbs) * 100;
            const col = r.balance >= 0 ? 'var(--fg)' : 'var(--danger)';
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', background: col, borderRadius: '4px 4px 0 0', height: pct + '%', minHeight: 4 }} />
                <div className="m" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{r.label.split(' ')[0]}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <svg viewBox="0 0 100 55" preserveAspectRatio="none" style={{ width: '100%', height: 80, marginBottom: 10 }} aria-hidden="true">
          <polyline points={cfSparkPts} fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="0" y1={cfZeroY} x2="100" y2={cfZeroY} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 2" />
        </svg>
      )}

      <div className="rw m" style={{ fontSize: 11, color: 'var(--fg)' }}>
        <span style={{ color: 'var(--fg-muted)' }}>Hoje</span>
        <span style={{ fontWeight: 600 }}>{mask(cf.startBalance, hidden, fc)}</span>
      </div>
      {cfRowsToShow.map((r, i) => (
        <div key={i} className="rw m" style={{ fontSize: 11, paddingTop: 4 }}>
          <span style={{ color: 'var(--fg-muted)' }}>{r.label}</span>
          <span style={{ fontWeight: 600, color: r.balance >= 0 ? 'var(--fg)' : 'var(--danger)' }}>{mask(r.balance, hidden, fc)}</span>
        </div>
      ))}
    </div>
  );
}
