/* ════════════════════════════════════════════════════════════════════════
   OverviewView — "Resumo" tab. Ported from rOverview (orig 823-991).

   Sections (each gated exactly as the original):
     • Monthly summary card           (monthlySummary)
     • Ativos / Divida quick stats     (compute + getLoan via compute.loan)
     • Financial health score          (healthScore: score/grade/breakdown/recs)
     • Subscriptions detected          (detectSubscriptions; "Adicionar" →
                                        actions.addRecurring like addSubFromSuggestion)
     • Emergency fund widget           (emergencyFund)
     • Cash-flow projection            (cashFlowProjection, 3/6/12 horizon →
                                        actions.setForecastMonths)
     • Accounts grouped by category    (compute.grp; expandable accordions via
                                        local xCat state; custom accounts →
                                        useUI().open('acct', {id}))

   All finance calls receive { ...state, currentUser }.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  compute,
  monthlySummary,
  isNewUser,
  healthScore,
  detectSubscriptions,
  emergencyFund,
  cashFlowProjection,
  cCol,
} from '../lib/finance.js';
import { fm, fc, uid } from '../lib/format.js';

const MONTHS_LONG = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/* ── Edit (pencil) icon for custom accounts ──────────────────────────────── */
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const Chevron = ({ open }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--text3)"
    strokeWidth="2.2"
    strokeLinecap="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function OverviewView() {
  const { state, actions, currentUser } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const [xCat, setXCat] = useState(null); // expanded account category (orig global xCat)

  const s = { ...state, currentUser };
  const C = compute(s);
  const ms = monthlySummary(s);
  const newU = isNewUser(s);
  const curMonth = MONTHS_LONG[new Date().getMonth()];

  const addSub = (sub) => {
    // orig addSubFromSuggestion (1741): push a recurring, toast.
    actions.addRecurring({
      id: uid(),
      name: sub.desc,
      amount: Number(sub.monthlyEstimate.toFixed(2)),
      day: 1,
      cat: sub.cat || 'sub',
      createdAt: Date.now(),
    });
    toast('Recorrencia criada', 'success');
  };

  // Dismiss a suggestion: mark its key so detectSubscriptions stops suggesting it.
  const dismissSub = (sub) => {
    actions.dismissSub(sub.key);
    toast('Sugestao dispensada', 'success');
  };

  // ── Health score (only when not new) ──────────────────────────────────
  const hs = !newU ? healthScore(s) : null;
  const hsCol = hs ? (hs.score >= 70 ? 'var(--success)' : hs.score >= 50 ? 'var(--warning)' : 'var(--danger)') : '';
  const subs = !newU ? detectSubscriptions(s) : [];

  // ── Emergency fund + cash flow (only when not new) ─────────────────────
  let ef = null;
  let efPct = 0;
  let efColor = '';
  let efLabel = '';
  let cf = null;
  let lastBal = 0;
  if (!newU) {
    ef = emergencyFund(s);
    efPct = Math.min((ef.months / 6) * 100, 100);
    efColor = ef.months >= 6 ? 'var(--success)' : ef.months >= 3 ? 'var(--orange)' : 'var(--signal)';
    efLabel = ef.months >= 6 ? 'Solido' : ef.months >= 3 ? 'Razoavel' : ef.months >= 1 ? 'Fraco' : 'Critico';
    cf = cashFlowProjection(s); // defaults to state.forecastMonths
    lastBal = cf.rows[cf.rows.length - 1].balance;
  }
  const forecastMonths = state.forecastMonths || 3;

  // Cash-flow mini chart pre-computation (bars when <=6 rows, sparkline otherwise).
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

  const ratePct = Math.min(Math.max(ms.rate, 0), 100);
  const cats = Object.keys(C.grp);

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
      {/* ── Monthly summary card ── */}
      {(!newU || (state.addedExp || []).length > 0 || (state.incomes || []).length > 0) && (
        <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
          <div className="rw" style={{ marginBottom: 14 }}>
            <div className="lb">Resumo · {curMonth}</div>
            {ms.rate > 0 ? (
              <div className="chip up-solid">{ms.rate.toFixed(0)}% poupado</div>
            ) : ms.inc > 0 ? (
              <div className="chip down-solid">{ms.rate.toFixed(0)}%</div>
            ) : null}
          </div>
          <div className="g3">
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Receita
              </div>
              <div className="m" style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)', marginTop: 2 }}>
                {ms.inc > 0 ? fc(ms.inc) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Despesa
              </div>
              <div className="m" style={{ fontSize: 15, fontWeight: 700, color: 'var(--signal)', marginTop: 2 }}>
                {fc(ms.exp)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Saldo
              </div>
              <div className="m" style={{ fontSize: 15, fontWeight: 700, color: ms.saved >= 0 ? 'var(--success)' : 'var(--signal)', marginTop: 2 }}>
                {(ms.saved >= 0 ? '+' : '') + fc(ms.saved)}
              </div>
            </div>
          </div>
          {ms.inc > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="bar" style={{ height: 6 }}>
                <div className="bar-fill" style={{ width: ratePct + '%', background: 'var(--success)' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick stats + health + subscriptions (only when not new) ── */}
      {!newU && (
        <>
          <div className="g2" style={{ gap: 10, marginBottom: 16 }}>
            <div className="cd" style={{ position: 'relative', overflow: 'hidden' }}>
              <div className="lb" style={{ marginBottom: 6 }}>Ativos</div>
              <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--success)' }}>
                {fc(C.tA)}
              </div>
            </div>
            <div className="cd" style={{ position: 'relative', overflow: 'hidden' }}>
              <div className="lb" style={{ marginBottom: 6 }}>Divida</div>
              <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', color: C.loan.out > 0 ? 'var(--danger)' : 'var(--fg-subtle)' }}>
                {fc(C.loan.out)}
              </div>
            </div>
          </div>

          {/* Financial health score */}
          <div className="cd" style={{ marginBottom: 16, padding: 20 }}>
            <div className="rw" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
              <div>
                <div className="lb">Saude financeira</div>
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
                        {b.pts}/{b.max} · {b.detail}
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

          {/* Subscription suggestions */}
          {subs.length > 0 && (
            <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
              <div className="rw" style={{ marginBottom: 6 }}>
                <div className="lb">Subscricoes detectadas</div>
                <div className="chip" style={{ background: 'transparent', color: 'var(--fg-muted)', border: '1px solid var(--border)' }}>
                  {subs.length}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                Estas despesas repetem-se. Queres regista-las como recorrentes?
              </div>
              {subs.slice(0, 3).map((sub, i) => (
                <div key={sub.key} className="rw" style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{sub.desc}</div>
                    <div className="m" style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>
                      {sub.count} vezes · ~{fc(sub.monthlyEstimate)}/mes
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => dismissSub(sub)}
                      aria-label={'Nao e subscricao: ' + sub.desc}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--fg-muted)',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 500,
                        fontFamily: 'inherit',
                      }}
                    >
                      Nao e
                    </button>
                    <button
                      type="button"
                      onClick={() => addSub(sub)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--primary)',
                        background: 'var(--primary)',
                        color: '#fff',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                      }}
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              ))}
              {subs.length > 3 && (
                <div style={{ fontSize: 11, color: 'var(--fg-subtle)', padding: '8px 0 0', textAlign: 'center' }}>
                  + {subs.length - 3} outras
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Emergency fund + cash flow (only when not new) ── */}
      {!newU && (
        <>
          <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
            <div className="rw" style={{ marginBottom: 10 }}>
              <div>
                <div className="lb">Fundo de emergencia</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  Liquidez + Poupanca / despesa media
                </div>
              </div>
              <div className="chip" style={{ background: efColor, color: '#fff' }}>{efLabel}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div className="m" style={{ fontSize: 30, fontWeight: 800, color: efColor, letterSpacing: '-0.02em' }}>
                {ef.months.toFixed(1)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>meses cobertos</div>
            </div>
            <div className="rw m" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
              <span>Reserva: {fc(ef.safe)}</span>
              <span>Despesa/mes: {fc(ef.avgMonthly)}</span>
            </div>
            <div className="bar" style={{ height: 6, marginTop: 10 }}>
              <div className="bar-fill" style={{ width: efPct + '%', background: efColor }} />
            </div>
            <div className="rw m" style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
              <span>0</span>
              <span>3 meses</span>
              <span>6 meses (ideal)</span>
            </div>
          </div>

          {/* Cash-flow projection */}
          <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
            <div className="rw" style={{ marginBottom: 12 }}>
              <div className="lb">Projecao {forecastMonths} meses</div>
              <div className={'chip ' + (lastBal >= cf.startBalance ? 'up-solid' : 'down-solid')}>
                {(lastBal >= cf.startBalance ? '+' : '') + fc(lastBal - cf.startBalance)}
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
              Receitas {fc(cf.monthlyIncome)}/mes · recorrentes {fc(cf.monthlyRecExpense)} · credito {fc(cf.loanPay)} · discricionario {fc(cf.avgDiscretionary)}
            </div>

            {cf.rows.length <= 6 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginBottom: 10 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', background: 'var(--elevated)', borderRadius: '4px 4px 0 0', height: cfStartPct + '%', minHeight: 4 }} />
                  <div className="m" style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>Hoje</div>
                </div>
                {cf.rows.map((r, i) => {
                  const pct = (Math.abs(r.balance) / cfMaxAbs) * 100;
                  const col = r.balance >= 0 ? 'var(--fg)' : 'var(--danger)';
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', background: col, borderRadius: '4px 4px 0 0', height: pct + '%', minHeight: 4 }} />
                      <div className="m" style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>{r.label.split(' ')[0]}</div>
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
              <span style={{ fontWeight: 500 }}>{fc(cf.startBalance)}</span>
            </div>
            {cfRowsToShow.map((r, i) => (
              <div key={i} className="rw m" style={{ fontSize: 11, paddingTop: 4 }}>
                <span style={{ color: 'var(--fg-muted)' }}>{r.label}</span>
                <span style={{ fontWeight: 500, color: r.balance >= 0 ? 'var(--fg)' : 'var(--danger)' }}>{fc(r.balance)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Accounts grouped by category (only when there are accounts) ── */}
      {cats.length > 0 && (
        <>
          <div className="lb" style={{ marginBottom: 10, paddingLeft: 4 }}>Contas por categoria</div>
          {cats.map((cat) => {
            const items = C.grp[cat];
            const isX = xCat === cat;
            const pctOfAssets = C.tA > 0 ? (C.cT[cat] / C.tA) * 100 : 0;
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setXCat(isX ? null : cat)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg2)',
                    border: 'none',
                    borderRadius: isX ? 'var(--r) var(--r) 0 0' : 'var(--r)',
                    padding: '16px 18px',
                    color: 'var(--text)',
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                    <div style={{ width: 8, height: 40, borderRadius: 4, background: cCol[cat] || '#9aa3b5' }} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{cat}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        {items.length} contas · {pctOfAssets.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{fc(C.cT[cat])}</span>
                    <Chevron open={isX} />
                  </div>
                </button>
                {isX && (
                  <div className="fadeIn" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
                    {items.map((a, i) => (
                      <div key={a.id || a.b + '_' + a.t + '_' + i} className="rw" style={{ padding: '14px 18px', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{a.b}</div>
                          <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 1 }}>
                            {a.t}
                            {a.currency && a.currency !== 'EUR' ? (
                              <>
                                {' · '}
                                <span className="m" style={{ fontSize: 11 }}>{a.currency}</span>
                              </>
                            ) : null}
                          </div>
                          {a.n && <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 1 }}>{a.n}</div>}
                          {a.updated && <div className="m" style={{ fontSize: 10, color: 'var(--success)', marginTop: 2 }}>Atualizado {a.updated}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="m" style={{ fontSize: 14, fontWeight: 500 }}>{fm(a.v)}</div>
                          <button
                            type="button"
                            onClick={() => open('balanceHistory', { acctKey: a.custom ? a.id : a.b + '_' + a.t, bank: a.b, type: a.t })}
                            className="icon-btn"
                            style={{ width: 28, height: 28 }}
                            aria-label="Historico de saldos"
                          >
                            <Icon name="history" size={15} />
                          </button>
                          {a.custom && (
                            <button
                              type="button"
                              onClick={() => open('acct', { id: a.id })}
                              className="icon-btn"
                              style={{ width: 28, height: 28 }}
                              aria-label="Editar conta"
                            >
                              <EditIcon />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
