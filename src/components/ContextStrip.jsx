/* ════════════════════════════════════════════════════════════════════════
   ContextStrip — compact strip shown above NON-overview tabs (replaces the
   hero). Ported from renderContextStrip (orig 2968-2989).

   Picks a single headline label + value based on the active tab. Returns just
   an 8px spacer for new users or tabs with nothing to show.

   Props: { tab? } — the active tab string. When omitted, falls back to
   useUI().tab (the spec's source of truth for navigation).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore, ME_ID } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { compute, monthlySummary, isNewUser, getAcctsLive, CARD_CAT, getGroupsData } from '../lib/finance.js';
import { estimateDeductions } from '../lib/irs.js';
import { totalValue } from '../lib/investments.js';
import { monthSpend } from '../lib/metrics.js';
import { computeBalances, groupTotals, isSettled } from '../lib/split.js';
import { fm, fc, mask, maskPct, todayISO } from '../lib/format.js';
import { monthKeyAt } from '../lib/months.js';
import Amount from './Amount.jsx';

export default function ContextStrip({ tab: tabProp }) {
  const { state, currentUser } = useStore();
  const ui = useUI();
  const tab = tabProp != null ? tabProp : ui.tab;
  const s = { ...state, currentUser };
  const C = compute(s);
  const newU = isNewUser(s);
  const hidden = !!state.balancesHidden;

  let label = '';
  let val = '';
  let col = 'var(--text)';
  let valKind = 'neutral';
  let valAmount = null;
  let valFmt = fc;

  if (tab === 'expenses' || tab === 'transactions') {
    // O mesmo número que a vista mostra: monthSpend, a ÚNICA fórmula de
    // despesas do mês (ver src/lib/metrics.js) — antes cada vista somava por
    // sua conta e os números divergiam (715 no topo, 675 em baixo).
    const key = monthKeyAt(3, state.mOff);
    const spent = monthSpend(state, key);
    label = 'Gastos do mês';
    valAmount = spent;
    valKind = 'neutral';
    col = 'var(--signal)';
  } else if (tab === 'income') {
    let tot = 0;
    (state.incomes || []).forEach((i) => {
      if (i.recurring !== false) tot += i.amount || 0;
    });
    label = 'Receita mensal recorrente';
    val = mask(tot, hidden, fc);
    col = 'var(--success)';
  } else if (tab === 'goals') {
    let tt = 0;
    let tc = 0;
    (state.goals || []).forEach((g) => {
      tt += g.target || 0;
      tc += g.current || 0;
    });
    const p = tt > 0 ? (tc / tt) * 100 : 0;
    label = 'Progresso global';
    val = maskPct(p, hidden);
    col = 'var(--blue)';
  } else if (tab === 'groups') {
    // Mesma definição de "ativo" e os mesmos totais que a GroupsView mostra
    // no hero: soma de owedToMe/owedByMe de todos os grupos não arquivados.
    // getGroupsData() troca para o grupo de exemplo em preview sem dados
    // próprios — a MESMA fonte que o Resumo e a vista de Grupos usam, para
    // esta faixa nunca dessincronizar do que a lista mostra por baixo.
    const { groups, groupEntries } = getGroupsData(state, !currentUser);
    let activeCount = 0;
    let owedToMe = 0;
    let owedByMe = 0;
    groups.forEach((g) => {
      if (g.archived) return;
      const entries = groupEntries.filter((e) => e.groupId === g.id);
      const t = groupTotals(entries, ME_ID);
      owedToMe += t.owedToMe;
      owedByMe += t.owedByMe;
      if (!isSettled(computeBalances(entries, g.memberIds))) activeCount += 1;
    });
    label = activeCount + (activeCount === 1 ? ' grupo ativo' : ' grupos ativos');
    val = 'a receber ' + mask(owedToMe, hidden, fc) + ' · a pagar ' + mask(owedByMe, hidden, fc);
    col = 'var(--text)';
  } else if (tab === 'loan') {
    label = 'Património líquido';
    val = mask(C.nW, hidden, fc);
    col = C.nW >= 0 ? 'var(--success)' : 'var(--signal)';
  } else if (tab === 'cards') {
    // Dívida total dos cartões de crédito (soma do que está por pagar).
    let debt = 0;
    getAcctsLive(s).forEach((a) => {
      if (a.c === CARD_CAT) debt += a.used || 0;
    });
    label = 'Dívida dos cartões';
    valAmount = debt;
    valKind = 'neutral';
    col = debt > 0 ? 'var(--signal)' : 'var(--success)';
  } else if (tab === 'tax') {
    const ded = estimateDeductions(state.addedExp, new Date().getFullYear());
    label = 'Deduções estimadas';
    val = mask(ded.total, hidden, fc);
    col = 'var(--success)';
  } else if (tab === 'transfers') {
    const n = (state.transfers || []).length;
    label = 'Transferências registadas';
    val = String(n);
    col = 'var(--text)';
  } else if (tab === 'invest') {
    /* Mostrar o MESMO número que a vista: se há posições detalhadas, é o valor
       delas; senão, o saldo das contas de investimento. (Antes a faixa somava
       sempre as contas e ficava 5000 € por cima de um cartão de 3570 €.) */
    const positions = state.positions || [];
    if (positions.length) {
      label = 'Posições';
      val = mask(totalValue(positions), hidden, fc);
    } else {
      let inv = 0;
      getAcctsLive(s).forEach((a) => {
        if (a.c === 'Investimentos' || a.c === 'Cripto') inv += a.v;
      });
      label = 'Carteira de investimentos';
      val = mask(inv, hidden, fc);
    }
    col = 'var(--text)';
  } else if (tab === 'cal' || tab === 'charts' || tab === 'rec' || tab === 'ai' || tab === 'report') {
    label = 'Património líquido';
    val = mask(C.nW, hidden, fc);
    col = 'var(--text)';
  }

  if (!label || newU) return <div style={{ height: 8 }} />;

  return (
    <div style={{ padding: '0 20px 14px' }}>
      <div
        className="cd"
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div className="lb">{label}</div>
        {valAmount != null ? (
          <Amount value={valAmount} kind={valKind} hidden={hidden} fmt={valFmt} style={{ fontSize: 16, fontWeight: 800, color: col }} />
        ) : (
          <div className="m" style={{ fontSize: 16, fontWeight: 800, color: col }}>
            {val}
          </div>
        )}
      </div>
    </div>
  );
}
