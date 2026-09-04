/* ════════════════════════════════════════════════════════════════════════
   metrics — UMA fórmula por indicador. Todas as vistas e a ContextStrip
   leem daqui; nenhuma vista volta a somar despesas por sua conta.
   ════════════════════════════════════════════════════════════════════════ */
import { compute, netWorthSeries } from './finance.js';
import { totalValue } from './investments.js';

export function netWorth(state) { return compute(state).nW; }
export function netWorthHistory(state) { return netWorthSeries(state); }
export function investmentAccountsValue(state) {
  const C = compute(state);
  return (C.cT['Investimentos'] || 0) + (C.cT['Cripto'] || 0);
}
export function positionsValue(state) { return totalValue((state && state.positions) || []); }
// Despesas registadas (manuais e importadas) do mês YYYY-MM, sempre positivas.
export function monthSpend(state, ym) {
  return ((state && state.addedExp) || []).reduce((t, x) => ((x.date || '').slice(0, 7) === ym ? t + Math.abs(Number(x.amount) || 0) : t), 0);
}
// Recorrentes que ainda não geraram despesa (recId) nesse mês.
export function monthPendingFixed(state, ym) {
  const done = new Set(((state && state.addedExp) || []).filter((x) => x.recId && (x.date || '').slice(0, 7) === ym).map((x) => x.recId));
  return ((state && state.recurring) || []).reduce((t, r) => (done.has(r.id) ? t : t + (Number(r.amount) || 0)), 0);
}
export function savingsRate(income, spend) {
  return income > 0 ? ((income - spend) / income) * 100 : null;
}
