/* ════════════════════════════════════════════════════════════════════════
   Lembretes — despesas recorrentes a vencer nos próximos dias.
   ════════════════════════════════════════════════════════════════════════ */

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysInMonth(year, monthIdx0) {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

// Próxima ocorrência (>= hoje) de uma recorrente com dia-do-mês `day`.
export function nextDueDate(day, today) {
  today = today || new Date();
  const t0 = startOfDay(today);
  let y = today.getFullYear();
  let m = today.getMonth();
  let d = Math.min(Math.max(parseInt(day, 10) || 1, 1), daysInMonth(y, m));
  let due = new Date(y, m, d);
  if (due < t0) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    d = Math.min(Math.max(parseInt(day, 10) || 1, 1), daysInMonth(y, m));
    due = new Date(y, m, d);
  }
  return due;
}

// Recorrentes a vencer dentro de `days` dias. Opcionalmente exclui as já
// materializadas no mês corrente (addedExp com recId nesse mês).
// Devolve [{ rec, due, daysLeft }] ordenado por daysLeft asc.
export function upcomingRecurring(recurring, days, today, addedExp) {
  today = today || new Date();
  const t0 = startOfDay(today);
  const ym = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  const materialised = {};
  (addedExp || []).forEach((x) => {
    if (x.recId && (x.date || '').slice(0, 7) === ym) materialised[x.recId] = 1;
  });
  const out = [];
  (recurring || []).forEach((r) => {
    if ((r.amount || 0) <= 0) return;
    if (r.id && materialised[r.id]) return; // já registada este mês
    const due = nextDueDate(r.day, today);
    const daysLeft = Math.round((startOfDay(due) - t0) / 86400000);
    if (daysLeft >= 0 && daysLeft <= days) out.push({ rec: r, due, daysLeft });
  });
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
