/* ════════════════════════════════════════════════════════════════════════
   closing — balanço do mês que acabou.

   Nos primeiros dias de um mês novo mostra-se o fecho do anterior: quanto se
   gastou, quanto sobrou, como foi face à média e onde foi o dinheiro. É o
   momento em que faz sentido olhar para trás — durante o mês o que interessa
   é o "podes gastar".

   monthClosing(state, now?) → null quando não há nada de útil a mostrar.
   ════════════════════════════════════════════════════════════════════════ */

const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function monthTotals(addedExp, key) {
  let total = 0;
  const byCat = {};
  (addedExp || []).forEach((x) => {
    if (String(x.date || '').slice(0, 7) !== key) return;
    const v = Number(x.amount) || 0;
    total += v;
    byCat[x.cat] = (byCat[x.cat] || 0) + v;
  });
  return { total, byCat };
}

/* Balanço do mês anterior. Só devolve algo nos primeiros `windowDays` dias
   (default 7) do mês e se o mês anterior tiver mesmo despesas. */
export function monthClosing(state, now, windowDays) {
  const d = now || new Date();
  const win = windowDays || 7;
  if (d.getDate() > win) return null;

  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const key = ym(prev);
  const addedExp = (state && state.addedExp) || [];
  const { total, byCat } = monthTotals(addedExp, key);
  if (total <= 0) return null;

  // Média dos 3 meses antes desse (para comparar com o hábito, não com um mês).
  const refs = [];
  for (let k = 1; k <= 3; k++) {
    const m = new Date(prev.getFullYear(), prev.getMonth() - k, 1);
    const t = monthTotals(addedExp, ym(m)).total;
    if (t > 0) refs.push(t);
  }
  const avg = refs.length ? refs.reduce((a, b) => a + b, 0) / refs.length : 0;
  const deltaPct = avg > 0 ? ((total - avg) / avg) * 100 : null;

  // Rendimento do mês fechado: receitas datadas nesse mês + recorrentes.
  let income = 0;
  ((state && state.incomes) || []).forEach((i) => {
    if (i.recurring !== false) income += Number(i.amount) || 0;
    else if (String(i.date || '').slice(0, 7) === key) income += Number(i.amount) || 0;
  });

  const bdg = (state && state.bdg) || [];
  const catName = (id) => {
    const b = bdg.find((x) => x.id === id);
    return b ? b.nm : id || 'Outros';
  };
  const top = Object.keys(byCat)
    .map((c) => ({ cat: c, name: catName(c), value: byCat[c] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return {
    monthKey: key,
    monthName: MONTHS_PT[prev.getMonth()],
    total,
    income,
    saved: income > 0 ? income - total : null,
    rate: income > 0 ? ((income - total) / income) * 100 : null,
    avg,
    deltaPct,
    better: deltaPct != null && deltaPct < 0,
    top,
  };
}
