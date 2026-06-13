/* ════════════════════════════════════════════════════════════════════════
   LoanView — "Credito" tab. Ported from rLoan (orig 1315-1334).

   New users get an empty state; otherwise the mortgage card (Credito
   Habitacao) with the literal values from the original, plus a 6-cell stats
   grid. `pp` (percentage paid) comes from compute() — in preview mode this is
   identical to the original's inline ((ln.cap-ln.out)/ln.cap)*100.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { isNewUser } from '../lib/finance.js';
import { fm, fc } from '../lib/format.js';

const STATS = [
  ['Prestacao', '485,83 EUR', '#3b6fee'],
  ['Proxima', '28.05.2026', '#7b5fe0'],
  ['Taxa', '2,7%', '#f5a623'],
  ['Tipo', 'Taxa Fixa', '#3fc97a'],
  ['Capital', '90.000 EUR', '#12b3a6'],
  ['Prazo', '20 anos', '#f25555'],
];

export default function LoanView() {
  const { state, currentUser } = useStore();
  const s = { ...state, currentUser };

  if (isNewUser(s)) {
    return (
      <div className="empty fadeUp" style={{ padding: '60px 20px' }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          Sem creditos registados
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          Credito habitacao, automovel ou pessoal
          <br />
          podem ser geridos aqui em breve.
        </div>
      </div>
    );
  }

  // Loan figures (literal, as the original). Derive paid % from them so the
  // progress bar fills by the amount already paid out of the total loan,
  // regardless of preview/auth mode (compute().pp is 0 for authed users).
  const TOTAL = 90000;
  const OUT = 77555.06;
  const PAID = TOTAL - OUT;
  const pp = (PAID / TOTAL) * 100;

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      <div className="cd" style={{ marginBottom: 12, padding: 22, borderLeft: '3px solid var(--signal)' }}>
        <div className="rw" style={{ marginBottom: 6 }}>
          <div className="lb">Credito Habitacao</div>
          <div className="chip down-solid">{pp.toFixed(1)}%</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18 }}>
          Bankinter · Taxa Fixa 2,7%
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--signal)', letterSpacing: '-0.02em' }}>
          {fm(OUT)}
        </div>
        <div className="lb" style={{ marginTop: 4 }}>
          Capital em divida
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="rw m" style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            <span>Pago: {fc(PAID)}</span>
            <span>Total: {fc(TOTAL)}</span>
          </div>
          <div className="bar" style={{ height: 6, background: 'var(--bg3)' }}>
            <div className="bar-fill" style={{ width: pp + '%', background: 'var(--success)' }} />
          </div>
          <div className="rw m" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
            <span>28.10.2022</span>
            <span>28.10.2042</span>
          </div>
        </div>
      </div>
      <div className="g2">
        {STATS.map((x) => (
          <div key={x[0]} className="cd" style={{ padding: '16px 18px' }}>
            <div className="lb" style={{ marginBottom: 4, color: x[2] }}>
              {x[0]}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{x[1]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
