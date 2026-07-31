/* ════════════════════════════════════════════════════════════════════════
   savings — "onde posso poupar": oportunidades concretas a partir das
   despesas já registadas. Tudo local, sem IA.

   Cada oportunidade: { id, kind, title, detail, yearly, monthly, evidence }
   `yearly` é a poupança ANUAL estimada se a pessoa agir — é o número que faz
   decidir. Ordenadas por impacto.

   Regras conservadoras de propósito: mais vale sugerir três coisas certas do
   que dez discutíveis.
   ════════════════════════════════════════════════════════════════════════ */

const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

// Normaliza o beneficiário para agrupar (minúsculas, sem espaços a mais).
function merchantKey(desc) {
  return String(desc || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
}

// Chaves dos N meses anteriores ao de `now` (exclui o mês corrente, incompleto).
function closedMonths(now, n) {
  const out = [];
  for (let k = 1; k <= n; k++) out.push(ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  return out;
}

/* Oportunidades de poupança. `months` = janela de análise (default 6 meses
   fechados). Devolve [] quando não há histórico suficiente para ser honesto. */
export function savingsOpportunities(state, now, months) {
  const d = now || new Date();
  const win = months || 6;
  const keys = closedMonths(d, win);
  const keySet = new Set(keys);
  const exps = ((state && state.addedExp) || []).filter((x) => keySet.has(String(x.date || '').slice(0, 7)));
  if (!exps.length) return [];

  const bdg = (state && state.bdg) || [];
  const catName = (id) => {
    const b = bdg.find((x) => x.id === id);
    return b ? b.nm : id || 'Outros';
  };
  // Quantos meses da janela têm mesmo dados (para médias honestas).
  const activeMonths = new Set(exps.map((x) => String(x.date).slice(0, 7))).size || 1;
  const out = [];

  /* 1. SUBSCRIÇÕES — custo anual do que é fixo e recorrente. Cancelar uma é a
        poupança mais fácil de concretizar. */
  const recurring = (state && state.recurring) || [];
  if (recurring.length) {
    const totalMonthly = recurring.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const sorted = recurring
      .slice()
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    if (totalMonthly > 0) {
      out.push({
        id: 'subs-total',
        kind: 'subscriptions',
        title: 'Subscrições custam ' + (totalMonthly * 12).toFixed(0) + '€/ano',
        detail:
          recurring.length +
          ' fixas ativas. A maior é ' +
          sorted[0].name +
          ' (' +
          (Number(sorted[0].amount) || 0).toFixed(2) +
          '€/mês). Cancelar as que não usas é a poupança mais rápida.',
        monthly: totalMonthly,
        yearly: totalMonthly * 12,
        evidence: sorted.slice(0, 4).map((r) => ({ name: r.name, amount: Number(r.amount) || 0 })),
      });
    }
  }

  /* 2. CATEGORIAS ACIMA DO ORÇAMENTO de forma consistente — poupança = trazer
        a média de volta ao limite definido pelo próprio utilizador. */
  const byCatMonth = {};
  exps.forEach((x) => {
    const k = String(x.date).slice(0, 7);
    if (!byCatMonth[x.cat]) byCatMonth[x.cat] = {};
    byCatMonth[x.cat][k] = (byCatMonth[x.cat][k] || 0) + (Number(x.amount) || 0);
  });
  bdg.forEach((b) => {
    const lm = Number(b.lm) || 0;
    if (lm <= 0) return;
    const perMonth = byCatMonth[b.id];
    if (!perMonth) return;
    const vals = keys.map((k) => perMonth[k] || 0).filter((v) => v > 0);
    if (vals.length < 3) return; // precisa de padrão, não de um mês mau
    const overCount = vals.filter((v) => v > lm).length;
    const avg = vals.reduce((a, c) => a + c, 0) / vals.length;
    if (overCount < Math.ceil(vals.length * 0.6) || avg <= lm) return;
    const excess = avg - lm;
    out.push({
      id: 'over-' + b.id,
      kind: 'budget',
      title: catName(b.id) + ' passa o limite quase todos os meses',
      detail:
        'Média de ' +
        avg.toFixed(0) +
        '€ contra um limite de ' +
        lm.toFixed(0) +
        '€ (' +
        overCount +
        ' de ' +
        vals.length +
        ' meses). Voltar ao limite poupa ' +
        (excess * 12).toFixed(0) +
        '€/ano.',
      monthly: excess,
      yearly: excess * 12,
      evidence: [],
    });
  });

  /* 3. GASTOS FORMIGA — beneficiário com muitas compras pequenas. O total
        costuma surpreender e é onde cortar dói menos. */
  const byMerchant = {};
  exps.forEach((x) => {
    const k = merchantKey(x.desc);
    if (!k) return;
    if (!byMerchant[k]) byMerchant[k] = { desc: x.desc, n: 0, total: 0, cat: x.cat };
    byMerchant[k].n += 1;
    byMerchant[k].total += Number(x.amount) || 0;
  });
  const ants = Object.values(byMerchant)
    .filter((m) => m.n >= 8 && m.total / m.n <= 15 && m.total >= 60)
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);
  ants.forEach((m) => {
    const perMonth = m.total / activeMonths;
    out.push({
      id: 'ant-' + merchantKey(m.desc),
      kind: 'ants',
      title: m.desc + ': ' + m.n + ' compras pequenas',
      detail:
        'Média de ' +
        (m.total / m.n).toFixed(2) +
        '€ por compra, ' +
        m.total.toFixed(0) +
        '€ no total (' +
        catName(m.cat) +
        '). Cortar metade poupa ' +
        ((perMonth / 2) * 12).toFixed(0) +
        '€/ano.',
      monthly: perMonth / 2,
      yearly: (perMonth / 2) * 12,
      evidence: [{ name: 'compras', amount: m.n }],
    });
  });

  /* 4. MAIOR CATEGORIA sem limite definido — não dá para controlar o que não
        tem orçamento. */
  const catTotals = {};
  exps.forEach((x) => {
    catTotals[x.cat] = (catTotals[x.cat] || 0) + (Number(x.amount) || 0);
  });
  const noLimit = Object.keys(catTotals)
    .filter((c) => {
      const b = bdg.find((x) => x.id === c);
      return !b || !(Number(b.lm) > 0);
    })
    .sort((a, b) => catTotals[b] - catTotals[a])[0];
  if (noLimit && catTotals[noLimit] / activeMonths >= 50) {
    const perMonth = catTotals[noLimit] / activeMonths;
    out.push({
      id: 'nolimit-' + noLimit,
      kind: 'nolimit',
      title: catName(noLimit) + ' não tem limite definido',
      detail:
        'Gastas em média ' +
        perMonth.toFixed(0) +
        '€/mês nesta categoria sem orçamento. Definir um limite 10% abaixo poupa ' +
        (perMonth * 0.1 * 12).toFixed(0) +
        '€/ano.',
      monthly: perMonth * 0.1,
      yearly: perMonth * 0.1 * 12,
      evidence: [],
    });
  }

  return out.sort((a, b) => b.yearly - a.yearly).slice(0, 5);
}

// Total anual das oportunidades encontradas.
export function totalSavings(list) {
  return (list || []).reduce((s, o) => s + (Number(o.yearly) || 0), 0);
}
