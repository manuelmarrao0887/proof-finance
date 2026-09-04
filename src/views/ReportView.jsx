/* ════════════════════════════════════════════════════════════════════════
   ReportView — relatório & insights do mês: total, top categorias, variação
   vs mês anterior e maiores despesas. Seletor de mês.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store.jsx';
import { fm, fc, mask, maskPct, maskText } from '../lib/format.js';
import { categoryTotals, monthTotal, monthComparison, topExpenses, prevMonth, yearSummary } from '../lib/reports.js';
import { monthsWithData, monthLabelShort, MONTH_SHORT as MS } from '../lib/months.js';
import { savingsOpportunities, totalSavings } from '../lib/savings.js';
import CategoryIcon from '../components/CategoryIcon.jsx';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function ReportView() {
  const { state } = useStore();
  const addedExp = state.addedExp || [];
  const bdg = state.bdg || [];
  const hidden = !!state.balancesHidden;
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
  // Visão anual do ano do mês selecionado.
  const yearNum = ym.slice(0, 4);
  const ySum = useMemo(() => yearSummary(addedExp, yearNum), [addedExp, yearNum]);
  const curMonthIdx = Number(ym.slice(5, 7)) - 1;
  // Oportunidades de poupança (6 meses fechados) — independentes do mês escolhido.
  const opps = useMemo(() => savingsOpportunities(state), [state]);
  const oppTotal = totalSavings(opps);
  const maxCat = comp.length ? Math.max.apply(null, comp.map((c) => c.cur)) : 0;

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      {/* Seletor de mês */}
      {/* ms-wrap: grelha 3xN em vez de uma tira com scroll horizontal — os 6
          meses somavam 456px de conteúdo e não cabiam em nenhum telemóvel. */}
      <div className="ms-bar ms-wrap" style={{ marginBottom: 16 }}>
        {months.map((m) => (
          <button
            key={m.ym}
            type="button"
            className={'ms' + (ym === m.ym ? ' on' : '')}
            onClick={() => setYm(m.ym)}
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Total */}
      <div className="cd" style={{ marginBottom: 16 }}>
        <div className="lb">Despesa total</div>
        <div className="m" style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{mask(total, hidden, fc)}</div>
      </div>

      {/* Onde posso poupar — oportunidades concretas com impacto anual */}
      {opps.length > 0 && (
        <div className="cd" style={{ marginBottom: 16, padding: 16 }}>
          <div className="rw" style={{ marginBottom: 4 }}>
            <div className="lb">Onde podes poupar</div>
            <span className="m" style={{ fontSize: 13, fontWeight: 800, color: 'var(--success)' }}>
              até {mask(oppTotal, hidden, fc)}/ano
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 12 }}>
            Com base nos últimos 6 meses fechados. São estimativas — decides tu o que faz sentido.
          </div>
          {opps.map((o) => (
            <div key={o.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div className="rw" style={{ marginBottom: 2, gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 0 }}>{o.title}</span>
                <span className="m" style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                  {mask(o.yearly, hidden, fc)}/ano
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 }}>{maskText(o.detail, hidden)}</div>
              {o.evidence && o.evidence.length > 0 && o.kind === 'subscriptions' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {o.evidence.map((e) => (
                    <span key={e.name} className="m" style={{ fontSize: 9, color: 'var(--text3)', background: 'var(--elevated)', padding: '2px 7px', borderRadius: 999 }}>
                      {e.name} {mask(e.amount, hidden, fm)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Visão anual — barras por mês do ano selecionado */}
      {ySum.monthsWithData > 1 && (
        <div className="cd" style={{ marginBottom: 16 }}>
          <div className="rw" style={{ marginBottom: 12 }}>
            <div className="lb">Ano {yearNum}</div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {mask(ySum.total, hidden, fc)} · média {mask(ySum.avg, hidden, fc)}/mês
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 72 }}>
            {ySum.totals.map((v, i) => {
              // Altura em px: dentro de uma coluna flex sem altura fixa, '%' resolve a 0.
              const h = ySum.max > 0 ? Math.max(2, Math.round((v / ySum.max) * 56)) : 2;
              const isCur = i === curMonthIdx;
              const isMax = i === ySum.maxMonth;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' }}>
                  <div
                    title={MS[i] + ': ' + mask(v, hidden, fc)}
                    style={{
                      width: '100%',
                      height: h + 'px',
                      borderRadius: 3,
                      background: isCur ? 'var(--primary)' : isMax ? 'var(--signal)' : 'var(--bg3)',
                      opacity: v > 0 ? 1 : 0.45,
                      transition: 'height .3s',
                    }}
                  />
                  <span style={{ fontSize: 8, color: isCur ? 'var(--primary)' : 'var(--text3)', fontWeight: isCur ? 700 : 400 }}>
                    {MS[i].slice(0, 1)}
                  </span>
                </div>
              );
            })}
          </div>
          {ySum.maxMonth >= 0 && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
              Mês mais caro: {MS[ySum.maxMonth]} ({mask(ySum.max, hidden, fc)})
              {curMonthIdx === ySum.maxMonth ? ' — é este.' : ''}
            </div>
          )}
        </div>
      )}

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
                    <span className="m" style={{ fontSize: 14, fontWeight: 600 }}>{mask(c.cur, hidden, fm)}</span>
                    {c.prev > 0 && (
                      <span className="m" style={{ fontSize: 11, fontWeight: 600, color: c.delta > 0 ? 'var(--signal)' : 'var(--success)' }}>
                        {c.delta > 0 ? '▲' : '▼'} {maskPct(Math.abs(c.pct), hidden)}
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
                <span className="m" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{mask(x.amount, hidden, fm)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
