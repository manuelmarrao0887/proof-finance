/* ════════════════════════════════════════════════════════════════════════
   Investimentos — posições detalhadas. Posição:
   { id, broker, asset, qty, avgPrice, currentPrice }. Funções puras.
   ════════════════════════════════════════════════════════════════════════ */

const n = (v) => Number(v) || 0;

export function positionValue(p) {
  return n(p && p.qty) * n(p && p.currentPrice);
}
export function positionCost(p) {
  return n(p && p.qty) * n(p && p.avgPrice);
}
export function positionPL(p) {
  return positionValue(p) - positionCost(p);
}
export function positionPLPct(p) {
  const c = positionCost(p);
  return c > 0 ? (positionPL(p) / c) * 100 : 0;
}

export function totalValue(positions) {
  return (positions || []).reduce((s, p) => s + positionValue(p), 0);
}
export function totalCost(positions) {
  return (positions || []).reduce((s, p) => s + positionCost(p), 0);
}
export function totalPL(positions) {
  return totalValue(positions) - totalCost(positions);
}
export function totalPLPct(positions) {
  const c = totalCost(positions);
  return c > 0 ? (totalPL(positions) / c) * 100 : 0;
}

// Posições com value/pct (alocação), ordenadas por valor desc.
export function withAllocation(positions) {
  const t = totalValue(positions);
  return (positions || [])
    .map((p) => ({ ...p, value: positionValue(p), pl: positionPL(p), plPct: positionPLPct(p), pct: t > 0 ? (positionValue(p) / t) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}
