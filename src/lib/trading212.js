/* ════════════════════════════════════════════════════════════════════════
   Trading212 — pure helpers for the "carteira" tracker.
   A "reading" is a dated snapshot of the whole portfolio:
     { id, baseCusto, valorAtual, date:'YYYY-MM-DD', createdAt }
   The full log lives in the persisted store field `t212Log`. There is only
   one portfolio (no per-account keying, unlike balances.js) — same shape,
   simpler because there is nothing to disambiguate.
   ════════════════════════════════════════════════════════════════════════ */

// Most recent reading (by date string, ISO sorts lexically), or null.
export function latestT212(log) {
  const rows = log || [];
  if (!rows.length) return null;
  return rows.reduce((a, b) => (b.date > a.date ? b : a));
}

// All readings, ascending by date.
export function t212History(log) {
  return (log || [])
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Append a reading immutably.
export function addT212Reading(log, reading) {
  return [...(log || []), reading];
}

// Ganho total acumulado = valor atual − base de custo (não é "do dia": é o
// retorno desde que a base de custo foi definida). null quando não há leitura.
export function t212Gain(reading) {
  if (!reading) return null;
  return (Number(reading.valorAtual) || 0) - (Number(reading.baseCusto) || 0);
}

// Ganho em percentagem da base de custo. null quando não há leitura ou a
// base de custo é 0 (divisão indefinida).
export function t212GainPct(reading) {
  if (!reading) return null;
  const base = Number(reading.baseCusto) || 0;
  if (base === 0) return null;
  return (t212Gain(reading) / base) * 100;
}
