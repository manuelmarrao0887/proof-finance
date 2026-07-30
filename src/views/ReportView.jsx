/* ════════════════════════════════════════════════════════════════════════
   ReportView — relatório & insights do mês: total, top categorias, variação
   vs mês anterior e maiores despesas. Seletor de mês.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store.jsx';
import { fm, fc } from '../lib/format.js';
import { categoryTotals, monthTotal, monthComparison, topExpenses, prevMonth } from '../lib/reports.js';
import { monthsWithData, monthLabelShort } from '../lib/months.js';
import CategoryIcon from '../components/CategoryIcon.jsx';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function ReportView() {
  const { state } = useStore();
  const addedExp = state.addedExp || [];
  const bdg = state.bdg || [];
  const catName = (id) => {
    const b = bdg.find((x) => x.id === id);
    return b ? b.nm : id;
  };

  // Todos os meses COM DADOS (mais recente primeiro) — dá acesso ao histórico
  // importado, em vez de uma janela fixa de 6 meses.
  const months = useMemo(
    () => monthsWithData(addedExp).map((k) => ({ ym: k, label: monthLabelShort(k) })),
    [addedExp]
  );
  const [ym, setYm] = useState(months[0].ym);

  const totals = categoryTotals(addedExp, ym);
  const total = monthTotal(addedExp, ym);
  const comp = monthComparison(addedExp, ym, prevMonth(ym));
  const top = topExpenses(addedExp, ym, 5);
  const maxCat = comp.length ? Math.max.apply(null, comp.map((c) => c.cur)) : 0;

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      {/* Seletor de mês */}
      <div className="ms-bar" style={{ marginBottom: 16, overflowX: 'auto' }}>
        {months.map((m) => (
          <button
            key={m.ym}
            type="button"
            className={'ms' + (ym === m.ym ? ' on' : '')}
            onClick={() => setYm(m.ym)}
            style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Total */}
      <div className="cd" style={{ marginBottom: 16 }}>
        <div className="lb">Despesa total</div>
        <div className="m" style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{fc(total)}</div>
      </div>

      {total === 0 ? (
        <div className="empty" style={{ padding: '40px 20px' }}>
          <div style={{ fontSize: 13 }}>Sem despesas neste mês.</div>
        </div>
      ) : (
        <>
          {/* Top categorias + variação */}
          <div className="cd" style={{ marginBottom: 16 }}>
            <div className="lb" style={{ marginBottom: 12 }}>Por categoria · vs mês anterior</div>
            {comp.filter((c) => c.cur > 0).map((c) => (
              <div key={c.cat} style={{ marginBottom: 12 }}>
                <div className="rw" style={{ marginBottom: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <CategoryIcon id={c.cat} size={26} /> {catName(c.cat)}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="m" style={{ fontSize: 14, fontWeight: 600 }}>{fm(c.cur)}</span>
                    {c.prev > 0 && (
                      <span className="m" style={{ fontSize: 11, fontWeight: 600, color: c.delta > 0 ? 'var(--signal)' : 'var(--success)' }}>
                        {c.delta > 0 ? '▲' : '▼'} {Math.abs(c.pct).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="bar" style={{ height: 6 }}>
                  <div className="bar-fill" style={{ width: (maxCat > 0 ? (c.cur / maxCat) * 100 : 0) + '%', background: 'var(--primary)' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Maiores despesas */}
          <div className="cd">
            <div className="lb" style={{ marginBottom: 10 }}>Maiores despesas</div>
            {top.map((x, i) => (
              <div key={(x.id || x.desc) + '_' + i} className="rw" style={{ padding: '9px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13 }}>
                  <CategoryIcon id={x.cat} size={26} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.desc}</span>
                </span>
                <span className="m" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{fm(x.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
