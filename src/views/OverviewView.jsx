/* ════════════════════════════════════════════════════════════════════════
   OverviewView — "Resumo" tab. Ported from rOverview (orig 823-991).

   Sections (each gated exactly as the original):
     • Monthly summary card           (monthlySummary; só sem "Podes gastar")
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

import React, { useState, useMemo } from 'react';
import { useStore, ME_ID } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import Icon from '../components/Icon.jsx';
import QuickActions from '../components/QuickActions.jsx';
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
  acctCatLabel,
  getGroupsData,
} from '../lib/finance.js';
import { groupTotals } from '../lib/split.js';
import { fm, fc, uid, mask, maskPct, maskText } from '../lib/format.js';
import { upcomingRecurring } from '../lib/reminders.js';
import { dailyAllowance, savingsPulse, buildInsights, monthPlan, monthForecast } from '../lib/pulse.js';
import { monthClosing } from '../lib/closing.js';
import MerchantLogo, { BankLogo } from '../components/MerchantLogo.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import StatTiles from '../components/StatTiles.jsx';
import { catMeta } from '../lib/categories.js';
import { AvatarStack } from '../components/Avatar.jsx';

const MONTHS_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/* ── Edit (pencil) icon for custom accounts ──────────────────────────────── */
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

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
  const { state, actions, currentUser, preview } = useStore();
  const { open, goTab } = useUI();
  const toast = useToast();
  const [xCat, setXCat] = useState(null); // expanded account category (orig global xCat)

  // ── Grupos: quanto os amigos te devem / quanto deves (soma dos grupos não
  //    arquivados). É só informação — nunca entra no património nem no
  //    orçamento do mês (ver compute()/monthlySummary() acima, intocados).
  //    getGroupsData() troca para o grupo de exemplo em preview sem dados
  //    próprios — a MESMA fonte que a vista de Grupos usa, para este
  //    indicador nunca dessincronizar da lista.
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
    toast('Recorrência criada', 'success');
  };

  // Dismiss a suggestion: mark its key so detectSubscriptions stops suggesting it.
  const dismissSub = (sub) => {
    actions.dismissSub(sub.key);
    toast('Sugestão dispensada', 'success');
  };

  // ── Health score (only when not new) ──────────────────────────────────
  const hs = useMemo(() => (!newU ? healthScore(s) : null), [s, newU]);
  const hsCol = hs ? (hs.score >= 70 ? 'var(--success)' : hs.score >= 50 ? 'var(--warning)' : 'var(--danger)') : '';
  const subs = useMemo(() => (!newU ? detectSubscriptions(s) : []), [s, newU]);

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
    efLabel = ef.months >= 6 ? 'Sólido' : ef.months >= 3 ? 'Razoável' : ef.months >= 1 ? 'Fraco' : 'Crítico';
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

  // Liquidez (disponível) vs Investimentos — destaque no topo (o utilizador quer
  // ver a liquidez, não o detalhe de ativos).
  const liquidez = (C.cT['Liquidez'] || 0) + (C.cT['Poupanca'] || 0);
  const investimentos = (C.cT['Investimentos'] || 0) + (C.cT['Cripto'] || 0);
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
  // b.detail (saúde financeira) é uma string pré-formatada pelo finance.js (ex.: "68%").
  const maskDetail = (d) => (hidden ? String(d).replace(/-?\d+(\.\d+)?%/g, '••%') : d);

  // Recorrentes a vencer nos próximos 5 dias (lembrete na app).
  const upcoming = useMemo(
    () => (!newU ? upcomingRecurring(state.recurring, 5, undefined, state.addedExp) : []),
    [state.recurring, state.addedExp, newU]
  );

  // ── Pulso do mês: quanto posso gastar/dia, poupança e avisos acionáveis ──
  const allow = useMemo(() => (!newU ? dailyAllowance(s) : null), [s, newU]);
  const pulse = useMemo(() => (!newU ? savingsPulse(s) : null), [s, newU]);
  const insights = useMemo(() => (!newU ? buildInsights(s) : []), [s, newU]);
  const plan = useMemo(() => (!newU ? monthPlan(s) : null), [s, newU]);
  const forecast = useMemo(() => (!newU ? monthForecast(s) : null), [s, newU]);
  const closing = useMemo(() => (!newU ? monthClosing(s) : null), [s, newU]);
  const applyPlan = () => {
    const total = actions.allocateGoals(plan.monthKey);
    toast(total > 0 ? 'Reservado ' + fm(total) + ' para as metas' : 'Nada a reservar', total > 0 ? 'success' : 'error');
  };
  const allowTone = allow && allow.perDay < 0 ? 'var(--signal)' : allow && allow.left < allow.income * 0.15 ? 'var(--warning)' : 'var(--success)';
  const INS_COLOR = { alert: 'var(--signal)', warn: 'var(--warning)', good: 'var(--success)', info: 'var(--primary)' };
  const INS_ICON = { alert: 'bell', warn: 'bell', good: 'check', info: 'sparkle' };

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
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
          style={{ width: '100%', display: 'block', textAlign: 'left', marginBottom: 16, padding: '14px 18px', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          <span className="rw">
            <div className="lb">Grupos</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AvatarStack items={groupPeople} size={22} max={4} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>ver</span>
            </span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {groupsSummary.owedToMe > 0 && (
              <span className="m" style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
                Amigos devem-te {mask(groupsSummary.owedToMe, hidden, fm)}
              </span>
            )}
            {groupsSummary.owedByMe > 0 && (
              <span className="m" style={{ fontSize: 14, fontWeight: 700, color: 'var(--signal)' }}>
                Deves {mask(groupsSummary.owedByMe, hidden, fm)}
              </span>
            )}
          </div>
        </button>
      )}

      {/* ── Fecho do mês anterior (só nos primeiros dias) ── */}
      {!newU && closing && (
        <div className="cd" style={{ marginBottom: 16, padding: '16px 18px', borderLeft: '3px solid ' + (closing.better ? 'var(--success)' : 'var(--warning)') }}>
          <div className="rw" style={{ marginBottom: 8 }}>
            <div className="lb">Fecho de {closing.monthName}</div>
            {closing.deltaPct != null && (
              <span className="m" style={{ fontSize: 11, fontWeight: 700, color: closing.better ? 'var(--success)' : 'var(--warning)' }}>
                {hidden ? '••' : (closing.deltaPct > 0 ? '+' : '') + Math.round(closing.deltaPct)}% vs média
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 6 }}>
            <span className="m" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {mask(closing.total, hidden, fc)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 2 }}>gastos</span>
          </div>
          {closing.rate != null && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
              Poupaste {mask(closing.saved, hidden, fc)} ({hidden ? '••' : Math.round(closing.rate)}% do rendimento)
            </div>
          )}
          {closing.top.length > 0 && (
            <StatTiles
              items={closing.top.map((t) => ({
                key: t.cat,
                icon: <CategoryIcon id={t.cat} size={24} bdg={state.bdg} />,
                value: mask(t.value, hidden, fc),
                label: t.name,
                color: catMeta(t.cat, (state.bdg || []).find((b) => b.id === t.cat)).color,
              }))}
            />
          )}
        </div>
      )}

      {/* ── PODES GASTAR — a métrica de decisão do mês ── */}
      {!newU && allow && (
        <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
          {allow.ready ? (
            <>
              <div className="rw" style={{ marginBottom: 10 }}>
                <div className="lb">Podes gastar</div>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {allow.daysLeft} {allow.daysLeft === 1 ? 'dia' : 'dias'} até fim do mês
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
                <span className="m" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: allowTone }}>
                  {mask(Math.max(0, allow.perDay), hidden, fm)}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>/dia</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                {allow.left < 0
                  ? 'Já passaste o rendimento do mês em ' + mask(-allow.left, hidden, fc) + '.'
                  : mask(allow.left, hidden, fc) + ' disponíveis' + (allow.pendingFixed > 0 ? ' (fixas por pagar já descontadas)' : '')}
              </div>
              {/* Barra: gasto + fixas por pagar vs rendimento */}
              <div style={{ height: 6, borderRadius: 999, background: 'var(--bg3)', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: Math.min(100, (allow.spent / Math.max(1, allow.income)) * 100) + '%', background: 'var(--primary)' }} />
                <div style={{ width: Math.min(100, (allow.pendingFixed / Math.max(1, allow.income)) * 100) + '%', background: 'var(--warning)', opacity: 0.55 }} />
              </div>
              {forecast && forecast.ready && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: forecast.overBudget ? 'var(--signal-soft, rgba(229,57,53,0.08))' : 'var(--elevated)',
                    fontSize: 11,
                    color: forecast.overBudget ? 'var(--signal)' : 'var(--text3)',
                    lineHeight: 1.45,
                  }}
                >
                  A este ritmo ({mask(forecast.dailyBurn, hidden, fc)}/dia) fechas o mês em{' '}
                  <b>{mask(forecast.projectedSpend, hidden, fc)}</b>
                  {forecast.overBudget
                    ? ' — ' + mask(-forecast.projectedEnd, hidden, fc) + ' acima do rendimento.'
                    : allow.income > 0
                      ? ', sobrando ' + mask(forecast.projectedEnd, hidden, fc) + '.'
                      : '.'}
                </div>
              )}
              <div className="rw" style={{ marginTop: 10, gap: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  Rendimento {mask(allow.income, hidden, fc)} · gasto {mask(allow.spent, hidden, fc)}
                  {allow.pendingFixed > 0 && ' · fixas ' + mask(allow.pendingFixed, hidden, fc)}
                </span>
                {pulse && (
                  <span style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    Poupança <b style={{ color: pulse.rate >= 20 ? 'var(--success)' : 'var(--text2)' }}>{maskPct(pulse.rate, hidden)}</b>
                  </span>
                )}
              </div>
            </>
          ) : (
            <div>
              <div className="lb" style={{ marginBottom: 6 }}>Podes gastar</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                Regista o teu rendimento mensal para saber quanto podes gastar por dia.
              </div>
              <button
                type="button"
                onClick={() => open('income')}
                style={{ padding: '8px 16px', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                + Adicionar rendimento
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Plano do mês (envelope budgeting) — aparece quando o salário entra ── */}
      {!newU && plan && plan.salaryIn && plan.income > 0 && (
        <div className="cd" style={{ marginBottom: 16, padding: '16px 18px' }}>
          <div className="rw" style={{ marginBottom: 10 }}>
            <div className="lb">Plano do mês</div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>salário recebido</span>
          </div>
          {/* Barra de envelopes: fixas · metas · livre */}
          <div style={{ height: 10, borderRadius: 999, overflow: 'hidden', display: 'flex', marginBottom: 10, background: 'var(--bg3)' }}>
            <div style={{ width: Math.max(0, (plan.fixedTotal / plan.income) * 100) + '%', background: 'var(--warning)' }} />
            <div style={{ width: Math.max(0, (plan.goalsTotal / plan.income) * 100) + '%', background: 'var(--purple, #7b5fe0)' }} />
            <div style={{ width: Math.max(0, (Math.max(0, plan.free) / plan.income) * 100) + '%', background: 'var(--success)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {[
              { c: 'var(--warning)', l: 'Fixas', v: plan.fixedTotal },
              { c: 'var(--purple, #7b5fe0)', l: 'Metas', v: plan.goalsTotal },
              { c: 'var(--success)', l: 'Livre', v: plan.free },
            ].map((row) => (
              <div key={row.l} className="rw">
                <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: row.c, display: 'inline-block' }} />
                  {row.l}
                </span>
                <span className="m" style={{ fontSize: 12, fontWeight: 600, color: row.v < 0 ? 'var(--signal)' : 'var(--text)' }}>
                  {mask(row.v, hidden, fm)}
                </span>
              </div>
            ))}
          </div>
          {plan.goalItems.length > 0 && (
            plan.allocatedGoals ? (
              <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
                Metas já reforçadas este mês.
              </div>
            ) : (
              <button
                type="button"
                onClick={applyPlan}
                style={{ width: '100%', padding: '11px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Reservar {mask(plan.goalsTotal, hidden, fm)} para as metas
              </button>
            )
          )}
        </div>
      )}

      {/* ── Insights automáticos (gerados localmente, sem IA) ── */}
      {!newU && insights.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insights.map((ins) => {
            const tone = INS_COLOR[ins.tone] || 'var(--primary)';
            return (
              <div key={ins.id} className="cd" style={{ padding: '10px 12px', borderLeft: '3px solid ' + tone }}>
                <div className="rw" style={{ gap: 10, alignItems: 'center' }}>
                  {ins.subject ? (
                    <MerchantLogo text={ins.subject.desc} cat={ins.subject.cat} size={36} bdg={state.bdg} />
                  ) : (
                    <span className="cat" style={{ width: 36, height: 36, background: 'color-mix(in srgb, ' + tone + ' 14%, transparent)', color: tone }} aria-hidden="true">
                      <Icon name={INS_ICON[ins.tone] || 'sparkle'} size={18} />
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{maskInsight(ins.title)}</div>
                    {/* Duas linhas em vez de uma: num telemóvel o texto mais
                        longo (rácio da anomalia) cabia só no title, e num PWA
                        de toque não há hover para o ler. */}
                    <div
                      style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      title={maskInsight(ins.long || ins.detail)}
                    >
                      {maskInsight(ins.detail)}
                    </div>
                  </div>
                  {/* Avisos de despesa suspeita podem ser falsos positivos → dispensar. */}
                  {ins.dismissId && (
                    <button
                      type="button"
                      onClick={() => {
                        actions.dismissAnomaly(ins.dismissId);
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
              </div>
            );
          })}
        </div>
      )}

      {/* ── Recorrentes a vencer em breve (lembrete na app) ── */}
      {!newU && upcoming.length > 0 && (
        <div className="cd" style={{ marginBottom: 16, padding: '14px 16px', borderLeft: '3px solid var(--warning)' }}>
          <div className="lb" style={{ marginBottom: 8, color: 'var(--warning)' }}>A vencer em breve</div>
          {upcoming.slice(0, 4).map((u) => (
            <div key={u.rec.id} className="rw" style={{ padding: '6px 0' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{u.rec.name}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span className="m" style={{ fontSize: 13, fontWeight: 600 }}>{mask(u.rec.amount, hidden, fm)}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {u.daysLeft === 0 ? 'hoje' : u.daysLeft === 1 ? 'amanhã' : 'em ' + u.daysLeft + ' dias'}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Liquidez (por conta) + Investimentos — topo, protegido por PIN/FaceID ── */}
      {!newU && (liquidez > 0 || investimentos > 0) && (
        <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
          <div className="rw" style={{ marginBottom: 12 }}>
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
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <span className="m" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {mv(liquidez)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>liquidez</span>
          </div>

          {/* Detalhe por conta de liquidez */}
          {liqAccounts.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {liqAccounts.map((a, i) => (
                <div
                  key={(a.id || a.b + '_' + a.t) + '_' + i}
                  className="rw"
                  style={{ padding: '9px 0', borderTop: i > 0 ? '1px solid var(--border)' : '1px solid var(--border)' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <BankLogo bank={a.b} size={32} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.b}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.t}</span>
                    </span>
                  </span>
                  <span className="m" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{mv(a.v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Investimentos (resumido) */}
          <div className="rw" style={{ marginTop: 14, background: 'var(--elevated)', borderRadius: 14, padding: '10px 14px' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Investimentos</span>
            <span className="m" style={{ fontSize: 16, fontWeight: 600, color: 'var(--secondary)' }}>{mv(investimentos)}</span>
          </div>
        </div>
      )}

      {/* ── Resumo do mês — só quando o "Podes gastar" não está ativo (sem rendimento
            registado); com ele ativo era a mesma informação com outra definição de despesa ── */}
      {!(allow && allow.ready) && (!newU || (state.addedExp || []).length > 0 || (state.incomes || []).length > 0) && (
        <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
          <div className="rw" style={{ marginBottom: 14 }}>
            <div className="lb">Resumo · {curMonth}</div>
            {ms.rate > 0 ? (
              <div className="chip up-solid">{maskPct(ms.rate, hidden)} poupado</div>
            ) : ms.inc > 0 ? (
              <div className="chip down-solid">{maskPct(ms.rate, hidden)}</div>
            ) : null}
          </div>
          <div className="g3">
            <div style={{ background: 'var(--success-soft)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Receita
              </div>
              <div className="m" style={{ fontSize: 15, fontWeight: 600, color: 'var(--success)', marginTop: 4 }}>
                {ms.inc > 0 ? mask(ms.inc, hidden, fc) : '—'}
              </div>
            </div>
            <div style={{ background: 'var(--signal-soft)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Despesa
              </div>
              <div className="m" style={{ fontSize: 15, fontWeight: 600, color: 'var(--signal)', marginTop: 4 }}>
                {mask(ms.exp, hidden, fc)}
              </div>
            </div>
            <div style={{ background: 'var(--blue-soft)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Saldo
              </div>
              <div className="m" style={{ fontSize: 15, fontWeight: 600, color: ms.saved >= 0 ? 'var(--success)' : 'var(--signal)', marginTop: 4 }}>
                {hidden ? '••••' : (ms.saved >= 0 ? '+' : '') + fc(ms.saved)}
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
          {/* Financial health score */}
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

          {/* Subscription suggestions */}
          {subs.length > 0 && (
            <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
              <div className="rw" style={{ marginBottom: 6 }}>
                <div className="lb">Subscrições detectadas</div>
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
                      {sub.count} vezes · ~{mask(sub.monthlyEstimate, hidden, fc)}/mês
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => dismissSub(sub)}
                      aria-label={'Não e subscrição: ' + sub.desc}
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
                      Não e
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
                <div className="lb">Fundo de emergência</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  Liquidez + Poupanca / despesa media
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

          {/* Cash-flow projection */}
          <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
            <div className="rw" style={{ marginBottom: 12 }}>
              <div className="lb">Projecao {forecastMonths} meses</div>
              <div className={'chip ' + (lastBal >= cf.startBalance ? 'up-solid' : 'down-solid')}>
                {hidden ? '••••' : (lastBal >= cf.startBalance ? '+' : '') + fc(lastBal - cf.startBalance)}
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
              Receitas {mask(cf.monthlyIncome, hidden, fc)}/mês · recorrentes {mask(cf.monthlyRecExpense, hidden, fc)} · crédito {mask(cf.loanPay, hidden, fc)} · discricionario {mask(cf.avgDiscretionary, hidden, fc)}
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
                    <div style={{ width: 8, height: 40, borderRadius: 4, background: cCol[cat] || 'var(--fg-subtle)' }} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{acctCatLabel(cat)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        {items.length} contas · {maskPct(pctOfAssets, hidden)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{mv(C.cT[cat])}</span>
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
                          {a.updated && <div className="m" style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>Atualizado {a.updated}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="m" style={{ fontSize: 14, fontWeight: 600 }}>{mask(a.v, hidden, fm)}</div>
                          <button
                            type="button"
                            onClick={() => open('balanceHistory', { acctKey: a.custom ? a.id : a.b + '_' + a.t, bank: a.b, type: a.t })}
                            className="icon-btn"
                            style={{ width: 28, height: 28 }}
                            aria-label="Histórico de saldos"
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
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                typeof confirm === 'function' &&
                                !confirm('Remover a conta ' + a.b + ' · ' + a.t + '? As leituras de saldo desta conta também são removidas.')
                              )
                                return;
                              if (a.custom) actions.deleteCustomAcct(a.id);
                              else actions.removeDynAcct(a.b + '_' + a.t);
                            }}
                            className="icon-btn"
                            style={{ width: 28, height: 28, color: 'var(--danger)' }}
                            aria-label="Remover conta"
                          >
                            <TrashIcon />
                          </button>
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
