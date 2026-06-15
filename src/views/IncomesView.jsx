/* ════════════════════════════════════════════════════════════════════════
   Incomes (Receitas) view — vista por mês (espelha as Despesas).

   - Seletor de mês (Mar/Abr/Mai/Jun/Q1) partilhado com as Despesas via state.em.
   - Total recebido no mês: recorrentes (contam todos os meses) + pontuais
     (recibos de vencimento) datados nesse mês.
   - Botão "Registar receita de {mês}" → abre o modal já em modo pontual com a
     data no mês selecionado (ideal para lançar o recibo do mês).
   - Lista filtrada ao mês; cada linha edita via open('income', { id }).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { fc, fm } from '../lib/format.js';
import { isPreviewMode } from '../lib/finance.js';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const INCOME_SOURCES = [
  ['salary', 'Salário', 'var(--success)'],
  ['freelance', 'Freelance', 'var(--primary)'],
  ['dividend', 'Dividendos', 'var(--secondary)'],
  ['rental', 'Aluguer', 'var(--warning)'],
  ['bonus', 'Bónus / Prémio', 'var(--danger)'],
  ['other', 'Outro', 'var(--fg-subtle)'],
];
function srcLabel(s) {
  const f = INCOME_SOURCES.find((x) => x[0] === s);
  return f ? f[1] : s;
}
function srcColor(s) {
  const f = INCOME_SOURCES.find((x) => x[0] === s);
  return f ? f[2] : 'var(--fg-subtle)';
}

// YYYY-MM for window index i (0..3 = oldest..current of the 4-month window).
function ymForIdx(i) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export default function IncomesView() {
  const { state, actions, currentUser } = useStore();
  const { open } = useUI();
  const incomes = state.incomes || [];
  const preview = isPreviewMode({ ...state, currentUser });
  const em = typeof state.em === 'number' ? state.em : 3;
  const isQ = em === 4;

  const ms = useMemo(() => {
    if (preview) return ['Jan', 'Fev', 'Mar', 'Abr'];
    const now = new Date();
    const out = [];
    for (let k = 3; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      out.push(MONTH_SHORT[d.getMonth()]);
    }
    return out;
  }, [preview]);

  // Income for the selected period.
  const qMonths = [0, 1, 2];
  const targetYMs = isQ ? qMonths.map(ymForIdx) : [ymForIdx(em)];
  let recTotal = 0;
  let oneTotal = 0;
  incomes.forEach((i) => {
    const amt = i.amount || 0;
    if (i.recurring !== false) {
      recTotal += isQ ? amt * 3 : amt; // recurring counts every month
    } else if (targetYMs.indexOf((i.date || '').slice(0, 7)) > -1) {
      oneTotal += amt;
    }
  });
  const monthTotal = recTotal + oneTotal;

  // Incomes shown for the period: recurring always + one-offs in the period.
  const monthIncomes = incomes.filter((i) => {
    if (i.recurring !== false) return true;
    return targetYMs.indexOf((i.date || '').slice(0, 7)) > -1;
  });
  const sorted = monthIncomes.slice().sort((a, b) => {
    if ((a.recurring !== false) !== (b.recurring !== false)) return a.recurring !== false ? -1 : 1;
    return (b.amount || 0) - (a.amount || 0);
  });

  const periodLabel = isQ ? 'Q1' : ms[em];
  // Default date for a new one-off income in the selected month (payslip).
  const newDefaultDate = isQ ? '' : ymForIdx(em) + '-01';
  const registerIncome = () =>
    open('income', { defaults: { recurring: false, date: newDefaultDate, source: 'salary' } });

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
          <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
            Regista o teu salário (recibo de vencimento),
            <br />
            freelances, dividendos ou rendimentos extra.
          </div>
          <button
            type="button"
            onClick={registerIncome}
            style={{ padding: '10px 18px', border: 'none', background: 'var(--primary)', color: '#fff', borderRadius: 999, fontSize: 13, fontWeight: 600 }}
          >
            Registar receita
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
      {/* Month bar (shared with Expenses via state.em) */}
      <div className="ms-bar">
        {ms.map((m, i) => (
          <button key={m + i} type="button" className={'ms' + (em === i ? ' on' : '')} onClick={() => actions.setEm(i)}>
            {m}
          </button>
        ))}
        <button type="button" className={'ms' + (isQ ? ' on' : '')} onClick={() => actions.setEm(4)}>
          Q1
        </button>
      </div>

      {/* Month total card */}
      <div className="cd" style={{ marginBottom: 14, padding: '18px 20px' }}>
        <div className="rw" style={{ marginBottom: 4 }}>
          <div className="lb">{(isQ ? 'RECEITA Q1' : 'RECEITA ' + (ms[em] || '').toUpperCase())}</div>
        </div>
        <div className="m" style={{ fontSize: 26, fontWeight: 900, color: 'var(--success)' }}>{fc(monthTotal)}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          {fc(recTotal)} recorrente{oneTotal > 0 ? ' · +' + fc(oneTotal) + ' pontual' : ''}
        </div>
      </div>

      {/* Register income for this month */}
      {!isQ && (
        <button
          type="button"
          onClick={registerIncome}
          style={{ width: '100%', marginBottom: 14, padding: '12px 14px', border: '1px solid var(--success)', background: 'var(--success-soft)', color: 'var(--success)', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Registar receita de {periodLabel} (ex: recibo de vencimento)
        </button>
      )}

      {sorted.length === 0 ? (
        <div className="empty" style={{ padding: '24px 0', fontSize: 13 }}>Sem receitas em {periodLabel}.</div>
      ) : (
        sorted.map((i) => {
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
                      : 'pontual' + (i.date ? ' · ' + i.date : '')}
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
        })
      )}
    </div>
  );
}
