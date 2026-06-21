/* ════════════════════════════════════════════════════════════════════════
   Metas — auto-alocação: nº de meses e data estimada para atingir o objetivo
   ao reservar `monthly` por mês.
   ════════════════════════════════════════════════════════════════════════ */

// Meses necessários para cobrir `remaining` reservando `monthly`/mês.
export function monthsToTarget(remaining, monthly) {
  const r = Number(remaining) || 0;
  const m = Number(monthly) || 0;
  if (m <= 0 || r <= 0) return 0;
  return Math.ceil(r / m);
}

// Data estimada de conclusão (ou null se não aplicável).
export function etaDate(remaining, monthly, today) {
  const n = monthsToTarget(remaining, monthly);
  if (!n) return null;
  today = today || new Date();
  return new Date(today.getFullYear(), today.getMonth() + n, today.getDate());
}

// "mmm/aaaa" de uma data.
export function ymLabel(d) {
  if (!d) return '';
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
