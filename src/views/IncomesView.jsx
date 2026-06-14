/* ════════════════════════════════════════════════════════════════════════
   Incomes (Receitas) view — React port of rIncomes (orig 1552-1593).

   - Empty state when no incomes.
   - Estimated monthly income card (recurring + this-month one-offs) + yearly.
   - List sorted: recurring first, then by amount DESC (explicit display sort —
     kept verbatim from the original).
   - Each row: source colour strip, name, source label + cadence, amount, edit.
     Edit opens the income modal via useUI().open('income', { id }).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { fc, fm } from '../lib/format.js';

// INCOME_SOURCES + helpers (orig 1541-1550) — copied locally.
const INCOME_SOURCES = [
  ['salary', 'Salário', '#3fc97a'],
  ['freelance', 'Freelance', '#3b6fee'],
  ['dividend', 'Dividendos', '#7b5fe0'],
  ['rental', 'Aluguer', '#f5a623'],
  ['bonus', 'Bónus / Prémio', '#f25555'],
  ['other', 'Outro', '#9aa3b5'],
];
function srcLabel(s) {
  const f = INCOME_SOURCES.find((x) => x[0] === s);
  return f ? f[1] : s;
}
function srcColor(s) {
  const f = INCOME_SOURCES.find((x) => x[0] === s);
  return f ? f[2] : '#9aa3b5';
}

export default function IncomesView() {
  const { state } = useStore();
  const { open } = useUI();
  const incomes = state.incomes || [];

  // Totals
  let totRec = 0;
  let totOne = 0;
  const nowISO = new Date().toISOString().slice(0, 7);
  incomes.forEach((i) => {
    const amt = i.amount || 0;
    if (i.recurring !== false) {
      totRec += amt;
    } else if (i.date && i.date.indexOf(nowISO) === 0) {
      totOne += amt;
    }
  });
  const totMonth = totRec + totOne;
  const yearly = totRec * 12;

  if (incomes.length === 0) {
    return (
      <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
        <div className="empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Sem rendimentos registados
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Adiciona o teu salário, freelances,
            <br />
            dividendos ou rendimentos extra
            <br />
            para teres uma vista completa do teu fluxo.
          </div>
        </div>
      </div>
    );
  }

  // Explicit display sort: recurring first, then amount descending.
  const sorted = incomes.slice().sort((a, b) => {
    if ((a.recurring !== false) !== (b.recurring !== false)) return a.recurring !== false ? -1 : 1;
    return (b.amount || 0) - (a.amount || 0);
  });

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
      <div className="cd" style={{ marginBottom: 16, padding: '18px 20px', background: 'transparent', color: 'var(--success)', border: '1px solid var(--border)' }}>
        <div className="lb" style={{ marginBottom: 6, color: 'rgba(255,255,255,0.9)' }}>Receita Mensal Estimada</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{fc(totMonth)}</div>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
          {fc(yearly)} por ano (recorrente)
          {totOne > 0 && <> &middot; +{fc(totOne)} extra este mês</>}
        </div>
      </div>

      {sorted.map((i) => {
        const col = srcColor(i.source);
        return (
          <div key={i.id} className="cd fadeUp" style={{ marginBottom: 10, padding: '14px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 3, height: '100%', background: col }} />
            <div className="rw" style={{ marginLeft: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{i.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                  {srcLabel(i.source)} &middot;{' '}
                  {i.recurring !== false
                    ? 'mensal · dia ' + (i.day || 1)
                    : 'único' + (i.date ? ' · ' + i.date : '')}
                  {i.acct ? ' · ' + i.acct : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="m" style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)' }}>+{fm(i.amount || 0)}</div>
                <button
                  type="button"
                  onClick={() => open('income', { id: i.id })}
                  className="icon-btn"
                  style={{ width: 30, height: 30 }}
                  aria-label="Editar receita"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
