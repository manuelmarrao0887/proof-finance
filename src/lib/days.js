/* ════════════════════════════════════════════════════════════════════════
   days — agrupar movimentos por dia + rótulos "Hoje"/"Ontem" partilhados
   pela pesquisa de Despesas (Orçamento) e pelo feed de Transações (Task 18).
   Movido de ExpensesView.jsx (era local a essa vista) para ser reutilizável.
   ════════════════════════════════════════════════════════════════════════ */

import { fmDateShort } from './format.js';

// "Hoje" / "Ontem" / "20 ago" para os cabeçalhos de dia. O ISO é partido em
// números: `new Date('2026-01-15')` seria lido como meia-noite UTC e, num
// fuso negativo (Açores, UTC−1), "ontem" caía no dia errado.
export function dayLabel(iso, todayIso) {
  if (!iso) return '—';
  if (iso === todayIso) return 'Hoje';
  const p = String(todayIso || '').split('-');
  const t = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  t.setDate(t.getDate() - 1);
  const y =
    t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  if (iso === y) return 'Ontem';
  return fmDateShort(iso);
}

// Agrupa linhas já ordenadas (mais recente primeiro) por dia, aproveitando a
// adjacência: como `sorted` vem newest-first, basta comparar com o último grupo.
export function groupByDay(rows) {
  const out = [];
  rows.forEach((row) => {
    const d = row.x.date || '';
    const last = out[out.length - 1];
    if (last && last.date === d) last.items.push(row);
    else out.push({ date: d, items: [row] });
  });
  return out;
}
