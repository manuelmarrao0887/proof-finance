/* ════════════════════════════════════════════════════════════════════════
   Orçamentos — limite efetivo por categoria com rollover (sobra/falta transita
   para o mês seguinte). Funções puras.
   ════════════════════════════════════════════════════════════════════════ */

import { categoryTotals } from './reports.js';

// Limite efetivo por mês = limite base + saldo acumulado (sobra/falta) dos
// meses anteriores, quando rollover ligado.
// O transitado tem TETO de ±1× o limite base: sem teto, seis meses de sobra
// numa categoria davam um limite efetivo de 1 478 EUR para um orçamento de 250
// (visto em teste), o que esvazia o sentido de "orçamento". Um mês de folga é
// a convenção das apps de envelope budgeting.
// bdg: [{id, lm}]. gastosPorMes: {ym: {cat: total}}. yms: ordenados asc.
// Devolve { ym: { cat: {base, eff, spent, rem} } }.
export function effectiveLimits(bdg, gastosPorMes, yms, rolloverOn) {
  const carry = {}; // cat -> saldo acumulado (limitado a ±base)
  const result = {};
  (yms || []).forEach(function (ym) {
    const g = (gastosPorMes && gastosPorMes[ym]) || {};
    result[ym] = {};
    (bdg || []).forEach(function (b) {
      const base = b.lm || 0;
      const eff = rolloverOn ? base + (carry[b.id] || 0) : base;
      const spent = g[b.id] || 0;
      const rem = eff - spent;
      result[ym][b.id] = { base: base, eff: eff, spent: spent, rem: rem };
      if (rolloverOn) carry[b.id] = Math.max(-base, Math.min(base, rem));
    });
  });
  return result;
}

// Conveniência: limites efetivos do mês `selYm`, considerando todos os meses
// com despesas até esse mês (inclusive). Devolve { cat: {base, eff, spent, rem} }.
export function monthEffectiveLimits(addedExp, bdg, selYm, rolloverOn) {
  const set = {};
  (addedExp || []).forEach(function (x) {
    const ym = (x.date || '').slice(0, 7);
    if (ym && ym <= selYm) set[ym] = 1;
  });
  set[selYm] = 1;
  const yms = Object.keys(set).sort();
  const gastos = {};
  yms.forEach(function (ym) {
    gastos[ym] = categoryTotals(addedExp, ym);
  });
  const res = effectiveLimits(bdg, gastos, yms, rolloverOn);
  return res[selYm] || {};
}
