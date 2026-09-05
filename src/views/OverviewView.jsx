/* ════════════════════════════════════════════════════════════════════════
   OverviewView — "Resumo". UMA tese: quanto podes gastar, e o que fazer a
   seguir. O hero ("Podes gastar hoje", SpendHero) vive no Shell; aqui ficam
   cinco blocos, por esta ordem:

     • QuickActions                    (Despesa, Receita, Saldo, IA, Mais)
     • Faixa de Grupos                 (só quando há saldos por acertar)
     • Plano do mês                    (envelopes + a barra de ritmo do mês)
     • UM insight — o mais grave       (rankInsights; "Ver mais (N)" → Relatório)
     • Disponível                      (liquidez por conta + investimentos)

   Os blocos analíticos que aqui viviam (fecho do mês, saúde financeira,
   subscrições detectadas, fundo de emergência, projeção e contas por
   categoria) foram extraídos sem alterações para `components/overview/*` na
   Task 10 e são montados em Gráficos/Relatório na Task 11. "A vencer em
   breve" deixou de ser bloco: é um candidato a insight (ver rankInsights).

   Todos os cálculos recebem { ...state, currentUser }.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore, ME_ID } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import Icon from '../components/Icon.jsx';
import QuickActions from '../components/QuickActions.jsx';
import { useToast } from '../components/Toast.jsx';
import { compute, monthlySummary, isNewUser, getGroupsData } from '../lib/finance.js';
import { investmentAccountsValue } from '../lib/metrics.js';
import { groupTotals } from '../lib/split.js';
import { fm, fc, mask, maskPct, maskText } from '../lib/format.js';
import { dailyAllowance, savingsPulse, monthPlan, rankInsights } from '../lib/pulse.js';
import MerchantLogo, { BankLogo } from '../components/MerchantLogo.jsx';
import { AvatarStack } from '../components/Avatar.jsx';

const MONTHS_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
);

export default function OverviewView() {
  const { state, actions, currentUser, preview } = useStore();
  const { open, goTab } = useUI();
  const toast = useToast();

  // ── Grupos: quanto os amigos te devem / quanto deves (soma dos grupos não
  //    arquivados). É só informação — nunca entra no património nem no
  //    orçamento do mês. getGroupsData() troca para o grupo de exemplo em
  //    preview sem dados próprios — a MESMA fonte que a vista de Grupos usa.
  const groupsData = useMemo(() => getGroupsData(state, preview), [state.people, state.groups, state.groupEntries, preview]);

  const groupsSummary = useMemo(() => {
    const { groups, groupEntries } = groupsData;
    const activeGroups = groups.filter((g) => !g.archived);
    if (!activeGroups.length) return null;
    let owedToMe = 0;
    let owedByMe = 0;
    activeGroups.forEach((g) => {
      const entries = groupEntries.filter((e) => e.groupId === g.id);
      const t = groupTotals(entries, ME_ID);
      owedToMe += t.owedToMe;
      owedByMe += t.owedByMe;
    });
    if (owedToMe <= 0 && owedByMe <= 0) return null; // tudo acertado — nada a mostrar
    return { owedToMe, owedByMe };
  }, [groupsData]);

  /* Pessoas dos grupos ativos (sem o próprio), para a faixa de Grupos. Sai do
     MESMO getGroupsData() do indicador acima: em preview sem dados próprios as
     pessoas têm de ser as do grupo de exemplo, senão o cartão mostrava saldos
     de demo com a pilha de avatares vazia. */
  const groupPeople = useMemo(() => {
    const ids = new Set();
    (groupsData.groups || []).filter((g) => !g.archived).forEach((g) => (g.memberIds || []).forEach((id) => id !== ME_ID && ids.add(id)));
    return (groupsData.people || []).filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name, color: p.color }));
  }, [groupsData]);

  /* Todos os cálculos do Resumo dependem só de (state, currentUser). Sem memo
     corriam de novo a cada render — com centenas de despesas nota-se ao abrir
     modais ou ao mudar de tema. */
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const C = useMemo(() => compute(s), [s]);
  const ms = useMemo(() => monthlySummary(s), [s]);
  const newU = useMemo(() => isNewUser(s), [s]);
  const curMonth = MONTHS_LONG[new Date().getMonth()];

  const ratePct = Math.min(Math.max(ms.rate, 0), 100);

  // Liquidez (disponível) vs Investimentos — o utilizador quer ver a liquidez,
  // não o detalhe de ativos (esse está em Contas por categoria / Gráficos).
  const liquidez = (C.cT['Liquidez'] || 0) + (C.cT['Poupanca'] || 0);
  const investimentos = investmentAccountsValue(s);
  const liqAccounts = (C.grp['Liquidez'] || []).concat(C.grp['Poupanca'] || []);

  // Saldos protegidos: ocultar é livre; mostrar pede PIN/FaceID (modal 'lock').
  const hidden = !!state.balancesHidden;
  const mv = (v) => mask(v, hidden, fc);
  const toggleHide = () => {
    if (hidden) open('lock');
    else actions.setBalancesHidden(true);
  };
  // Insights combinam texto livre com montantes e percentagens (ex.: "Supermercado
  // +885% vs média", "Este mês 445€ · média dos últimos meses 45€."). maskText só
  // cobre euros — aqui aplica-se também sobre percentagens.
  const maskInsight = (t) => (hidden ? maskText(t, true).replace(/[+-]?\d+([.,]\d+)?\s?%/g, '••%') : t);

  // ── Pulso do mês: quanto posso gastar/dia, poupança e o aviso a mostrar ──
  const allow = useMemo(() => (!newU ? dailyAllowance(s) : null), [s, newU]);
  const pulse = useMemo(() => (!newU ? savingsPulse(s) : null), [s, newU]);
  const plan = useMemo(() => (!newU ? monthPlan(s) : null), [s, newU]);
  const ranked = useMemo(() => (!newU ? rankInsights(s) : []), [s, newU]);
  const top = ranked[0] || null;
  const applyPlan = () => {
    const total = actions.allocateGoals(plan.monthKey);
    toast(total > 0 ? 'Reservado ' + mask(total, hidden, fm) + ' para as metas' : 'Nada a reservar', total > 0 ? 'success' : 'error');
  };
  const INS_COLOR = { alert: 'var(--signal)', warn: 'var(--warning)', good: 'var(--success)', info: 'var(--primary)' };
  const INS_ICON = { alert: 'bell', warn: 'bell', good: 'check', info: 'sparkle' };
  const topTone = top ? INS_COLOR[top.tone] || 'var(--primary)' : '';

  return (
    <div className="fadeUp" style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingBottom: 'var(--space-5)' }}>
      {/* ── Quick actions (Finany-style) ── */}
      <QuickActions />

      {/* ── Grupos: amigos devem-te / deves — informação, não entra no património
            nem no orçamento. Some invisível quando não há grupos ativos ou tudo
            está acertado. ── */}
      {groupsSummary && (
        <button
          type="button"
          onClick={() => goTab('groups')}
          className="cd"
          aria-label={
            'Grupos — ' +
            [
              groupsSummary.owedToMe > 0 ? 'amigos devem-te ' + mask(groupsSummary.owedToMe, hidden, fm) : null,
              groupsSummary.owedByMe > 0 ? 'deves ' + mask(groupsSummary.owedByMe, hidden, fm) : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          style={{ width: '100%', display: 'block', textAlign: 'left', marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          <span className="rw">
            <div className="lb">Grupos</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <AvatarStack items={groupPeople} size={22} max={4} />
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)' }}>ver</span>
            </span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
            {groupsSummary.owedToMe > 0 && (
              <span className="m" style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--success)' }}>
                Amigos devem-te {mask(groupsSummary.owedToMe, hidden, fm)}
              </span>
            )}
            {groupsSummary.owedByMe > 0 && (
              <span className="m" style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--signal)' }}>
                Deves {mask(groupsSummary.owedByMe, hidden, fm)}
              </span>
            )}
          </div>
        </button>
      )}

      {/* ── Plano do mês (envelope budgeting) — aparece quando o salário entra.
            Por baixo, a barra de ritmo que vivia no cartão "Podes gastar": o
            plano diz o que estava previsto, o ritmo diz o que está a acontecer.
            Os dois lado a lado é a única leitura que se faz durante o mês. ── */}
      {!newU && plan && plan.salaryIn && plan.income > 0 && (
        <div className="cd" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}>
          <div className="rw" style={{ marginBottom: 'var(--space-3)' }}>
            <div className="lb">Plano do mês</div>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)' }}>salário recebido</span>
          </div>
          {/* Barra de envelopes: fixas · metas · livre */}
          <div style={{ height: 10, borderRadius: 999, overflow: 'hidden', display: 'flex', marginBottom: 'var(--space-3)', background: 'var(--bg3)' }}>
            {hidden ? (
              <div style={{ width: '100%', background: 'var(--elevated)' }} />
            ) : (
              <>
                <div style={{ width: Math.max(0, (plan.fixedTotal / plan.income) * 100) + '%', background: 'var(--warning)' }} />
                <div style={{ width: Math.max(0, (plan.goalsTotal / plan.income) * 100) + '%', background: 'var(--purple, #7b5fe0)' }} />
                <div style={{ width: Math.max(0, (Math.max(0, plan.free) / plan.income) * 100) + '%', background: 'var(--success)' }} />
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            {[
              { c: 'var(--warning)', l: 'Fixas', v: plan.fixedTotal },
              { c: 'var(--purple, #7b5fe0)', l: 'Metas', v: plan.goalsTotal },
              { c: 'var(--success)', l: 'Livre', v: plan.free },
            ].map((row) => (
              <div key={row.l} className="rw">
                <span style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: row.c, display: 'inline-block' }} />
                  {row.l}
                </span>
                <span className="m" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: row.v < 0 ? 'var(--signal)' : 'var(--text)' }}>
                  {mask(row.v, hidden, fm)}
                </span>
              </div>
            ))}
          </div>
          {plan.goalItems.length > 0 && (
            plan.allocatedGoals ? (
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--success)', fontWeight: 600 }}>
                Metas já reforçadas este mês.
              </div>
            ) : (
              <button
                type="button"
                onClick={applyPlan}
                style={{ width: '100%', padding: 'var(--space-4) 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 12, fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer' }}
              >
                Reservar {mask(plan.goalsTotal, hidden, fm)} para as metas
              </button>
            )
          )}

          {/* Ritmo real do mês: gasto + fixas por pagar vs rendimento. */}
          {allow && allow.ready && (
            <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
              <div className="rw" style={{ marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Ritmo</span>
                {pulse && (
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)' }}>
                    Poupança <b style={{ color: pulse.rate >= 20 ? 'var(--success)' : 'var(--text2)' }}>{maskPct(pulse.rate, hidden)}</b>
                  </span>
                )}
              </div>
              <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', display: 'flex', background: 'var(--bg3)' }}>
                {hidden ? (
                  <div style={{ width: '100%', background: 'var(--elevated)' }} />
                ) : (
                  <>
                    <div style={{ width: Math.min(100, (allow.spent / Math.max(1, allow.income)) * 100) + '%', background: 'var(--primary)' }} />
                    <div style={{ width: Math.min(100, (allow.pendingFixed / Math.max(1, allow.income)) * 100) + '%', background: 'var(--warning)', opacity: 0.55 }} />
                  </>
                )}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-2)' }}>
                Rendimento {mask(allow.income, hidden, fc)} · gasto {mask(allow.spent, hidden, fc)}
                {allow.pendingFixed > 0 && ' · fixas por pagar ' + mask(allow.pendingFixed, hidden, fc)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── UM insight: o mais grave de todos (rankInsights ordena avisos de
            despesa, ritmo do mês, metas em risco e fixas a vencer na mesma
            lista). Os restantes ficam a um toque, no Relatório. ── */}
      {!newU && top && (
        <div className="cd" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', borderLeft: '3px solid ' + topTone }}>
          <div className="rw" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
            {top.subject ? (
              <MerchantLogo text={top.subject.desc} cat={top.subject.cat} size={36} bdg={state.bdg} />
            ) : (
              <span className="cat" style={{ width: 36, height: 36, background: 'color-mix(in srgb, ' + topTone + ' 14%, transparent)', color: topTone }} aria-hidden="true">
                <Icon name={INS_ICON[top.tone] || 'sparkle'} size={18} />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: topTone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{maskInsight(top.title)}</div>
              {/* Duas linhas em vez de uma: num telemóvel o texto mais longo
                  (rácio da anomalia) cabia só no title, e num PWA de toque não
                  há hover para o ler. */}
              <div
                style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                title={maskInsight(top.long || top.detail)}
              >
                {maskInsight(top.detail)}
              </div>
            </div>
            {/* Avisos de despesa suspeita podem ser falsos positivos → dispensar.
                Os outros (ritmo, metas, fixas) não se dispensam: resolvem-se. */}
            {top.dismissId && (
              <button
                type="button"
                onClick={() => {
                  actions.dismissAnomaly(top.dismissId);
                  toast('Aviso dispensado', 'success');
                }}
                aria-label="Está certo, dispensar aviso"
                title="Está certo"
                className="icon-btn"
                style={{ width: 32, height: 32, color: 'var(--success)', flexShrink: 0 }}
              >
                <Icon name="check" size={16} />
              </button>
            )}
          </div>
          {ranked.length > 1 && (
            <button
              type="button"
              onClick={() => goTab('report')}
              style={{ marginTop: 'var(--space-2)', border: 'none', background: 'none', color: 'var(--primary)', fontSize: 'var(--fs-xs)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Ver mais ({ranked.length - 1})
            </button>
          )}
        </div>
      )}

      {/* ── Liquidez (disponível) por conta + Investimentos — protegido por
            PIN/FaceID (o olho fecha sozinho, abrir pede autenticação). ── */}
      {!newU && (liquidez > 0 || investimentos > 0) && (
        <div className="cd" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-5) var(--space-5)' }}>
          <div className="rw" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="lb">Disponível</div>
            <button
              type="button"
              onClick={toggleHide}
              className="icon-btn"
              style={{ width: 34, height: 34 }}
              aria-label={hidden ? 'Mostrar saldos (PIN/FaceID)' : 'Ocultar saldos'}
            >
              {hidden ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
            <span className="m" style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {mv(liquidez)}
            </span>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text3)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>liquidez</span>
          </div>

          {/* Detalhe por conta de liquidez */}
          {liqAccounts.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              {liqAccounts.map((a, i) => (
                <div
                  key={(a.id || a.b + '_' + a.t) + '_' + i}
                  className="rw"
                  style={{ padding: 'var(--space-3) 0', borderTop: i > 0 ? '1px solid var(--border)' : '1px solid var(--border)' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                    <BankLogo bank={a.b} size={32} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.b}</span>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)' }}>{a.t}</span>
                    </span>
                  </span>
                  <span className="m" style={{ fontSize: 'var(--fs-md)', fontWeight: 600, whiteSpace: 'nowrap' }}>{mv(a.v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Contas de investimento (resumido) — nome explícito porque não é o
              mesmo número que as posições detalhadas mostram em Investimentos
              (ver investmentAccountsValue vs positionsValue em lib/metrics.js). */}
          <div className="rw" style={{ marginTop: 'var(--space-4)', background: 'var(--elevated)', borderRadius: 14, padding: 'var(--space-3) var(--space-4)' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Contas de investimento</span>
            <span className="m" style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--secondary)' }}>{mv(investimentos)}</span>
          </div>
        </div>
      )}

      {/* ── Resumo do mês — só sem rendimento registado, que é quando o hero
            "Podes gastar hoje" não tem números para dar. Com rendimento seria
            a mesma informação com outra definição de despesa. ── */}
      {!(allow && allow.ready) && (!newU || (state.addedExp || []).length > 0 || (state.incomes || []).length > 0) && (
        <div className="cd" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-5) var(--space-5)' }}>
          <div className="rw" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="lb">Resumo · {curMonth}</div>
            {ms.rate > 0 ? (
              <div className="chip up-solid">{maskPct(ms.rate, hidden)} poupado</div>
            ) : ms.inc > 0 ? (
              <div className="chip down-solid">{maskPct(ms.rate, hidden)}</div>
            ) : null}
          </div>
          <div className="g3">
            <div style={{ background: 'var(--success-soft)', borderRadius: 14, padding: 'var(--space-4) var(--space-4)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Receita
              </div>
              <div className="m" style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--success)', marginTop: 'var(--space-2)' }}>
                {ms.inc > 0 ? mask(ms.inc, hidden, fc) : '—'}
              </div>
            </div>
            <div style={{ background: 'var(--signal-soft)', borderRadius: 14, padding: 'var(--space-4) var(--space-4)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Despesa
              </div>
              <div className="m" style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--signal)', marginTop: 'var(--space-2)' }}>
                {mask(ms.exp, hidden, fc)}
              </div>
            </div>
            <div style={{ background: 'var(--blue-soft)', borderRadius: 14, padding: 'var(--space-4) var(--space-4)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Saldo
              </div>
              <div className="m" style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: ms.saved >= 0 ? 'var(--success)' : 'var(--signal)', marginTop: 'var(--space-2)' }}>
                {mask(ms.saved, hidden, (v) => (v >= 0 ? '+' : '') + fc(v))}
              </div>
            </div>
          </div>
          {ms.inc > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <div className="bar" style={{ height: 6 }}>
                <div className="bar-fill" style={{ width: ratePct + '%', background: 'var(--success)' }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
