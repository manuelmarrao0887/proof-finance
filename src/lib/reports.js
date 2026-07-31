/* ════════════════════════════════════════════════════════════════════════
   Relatórios — funções puras sobre addedExp para o relatório mensal.
   ════════════════════════════════════════════════════════════════════════ */

// Total por categoria num mês "YYYY-MM" (só despesas datadas nesse mês).
export function categoryTotals(addedExp, ym) {
  const out = {};
  (addedExp || []).forEach(function (x) {
    if ((x.date || '').slice(0, 7) !== ym) return;
    out[x.cat] = (out[x.cat] || 0) + (Number(x.amount) || 0);
  });
  return out;
}

// Total gasto no mês.
export function monthTotal(addedExp, ym) {
  const t = categoryTotals(addedExp, ym);
  return Object.keys(t).reduce(function (s, k) {
    return s + t[k];
  }, 0);
}

// Comparação por categoria vs mês anterior.
// Devolve [{cat, cur, prev, delta, pct}] ordenado por `cur` desc.
export function monthComparison(addedExp, ym, prevYm) {
  const cur = categoryTotals(addedExp, ym);
  const prev = categoryTotals(addedExp, prevYm);
  const cats = {};
  Object.keys(cur).forEach((k) => (cats[k] = 1));
  Object.keys(prev).forEach((k) => (cats[k] = 1));
  return Object.keys(cats)
    .map(function (cat) {
      const c = cur[cat] || 0;
      const p = prev[cat] || 0;
      const delta = c - p;
      const pct = p > 0 ? (delta / p) * 100 : c > 0 ? 100 : 0;
      return { cat: cat, cur: c, prev: p, delta: delta, pct: pct };
    })
    .sort((a, b) => b.cur - a.cur);
}

// Maiores despesas individuais do mês (top N).
export function topExpenses(addedExp, ym, n) {
  return (addedExp || [])
    .filter((x) => (x.date || '').slice(0, 7) === ym)
    .slice()
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    .slice(0, n || 5);
}

// "YYYY-MM" do mês anterior.
export function prevMonth(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const d = new Date(y, m - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/* Totais mensais de um ano civil (12 valores, janeiro→dezembro).
   Meses sem despesas ficam a 0. */
export function yearMonthlyTotals(addedExp, year) {
  const y = String(year);
  const out = new Array(12).fill(0);
  (addedExp || []).forEach((x) => {
    const d = String((x && x.date) || '');
    if (d.slice(0, 4) !== y) return;
    const m = parseInt(d.slice(5, 7), 10);
    if (m >= 1 && m <= 12) out[m - 1] += Number(x.amount) || 0;
  });
  return out;
}

/* Resumo do ano: total, média dos meses COM despesas, e o mês mais caro.
   { total, avg, maxMonth (0-11 ou -1), max, monthsWithData } */
export function yearSummary(addedExp, year) {
  const t = yearMonthlyTotals(addedExp, year);
  const active = t.filter((v) => v > 0);
  const max = active.length ? Math.max.apply(null, t) : 0;
  return {
    totals: t,
    total: t.reduce((a, b) => a + b, 0),
    avg: active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0,
    max,
    maxMonth: max > 0 ? t.indexOf(max) : -1,
    monthsWithData: active.length,
  };
}
