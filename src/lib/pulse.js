/* ════════════════════════════════════════════════════════════════════════
   pulse — as métricas de decisão do Resumo (puras, sem React).

   dailyAllowance(state, now?) → quanto POSSO GASTAR por dia até fim do mês,
     já descontando o que falta pagar das despesas fixas.
   savingsPulse(state, now?)   → taxa de poupança do mês + colchão (meses).
   buildInsights(state, now?)  → 2-4 avisos acionáveis, ordenados por urgência.

   Todas aceitam `now` (Date) para testes determinísticos.
   ════════════════════════════════════════════════════════════════════════ */

import { getAcctsLive, cardUsage, CARD_CAT } from './finance.js';
import { upcomingTaxEvents } from './taxpt.js';

const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

// Despesas do mês de `now` (todas: manuais + importadas).
function monthExpenses(state, now) {
  const key = ym(now);
  return ((state && state.addedExp) || []).filter((x) => (x.date || '').slice(0, 7) === key);
}

// Rendimento esperado do mês: recorrentes + one-off datados neste mês.
function monthIncome(state, now) {
  const key = ym(now);
  let inc = 0;
  ((state && state.incomes) || []).forEach((i) => {
    if (i.recurring !== false) inc += Number(i.amount) || 0;
    else if ((i.date || '').slice(0, 7) === key) inc += Number(i.amount) || 0;
  });
  return inc;
}

/* Despesas fixas (recorrentes) que AINDA faltam pagar este mês: as que têm dia
   >= hoje e ainda não foram materializadas numa despesa deste mês (recId). */
function pendingRecurring(state, now) {
  const key = ym(now);
  const today = now.getDate();
  const materialised = new Set(
    monthExpenses(state, now)
      .filter((x) => x.recId)
      .map((x) => x.recId)
  );
  let total = 0;
  const items = [];
  ((state && state.recurring) || []).forEach((r) => {
    if (materialised.has(r.id)) return;
    const day = Math.min(Math.max(parseInt(r.day, 10) || 1, 1), daysInMonth(now));
    if (day < today) return; // já passou e não foi lançada → não a projetamos
    total += Number(r.amount) || 0;
    items.push({ id: r.id, name: r.name, amount: Number(r.amount) || 0, day, daysLeft: day - today });
  });
  items.sort((a, b) => a.day - b.day);
  return { total, items, monthKey: key };
}

/* ── dailyAllowance ──────────────────────────────────────────────────────
   left  = rendimento − já gasto − fixas por pagar
   perDay= left / dias que faltam (inclui hoje)
   Nunca inventa rendimento: se não houver receitas registadas, income=0 e o
   resultado vem `ready:false` (a UI mostra convite a registar o rendimento). */
export function dailyAllowance(state, now) {
  const d = now || new Date();
  const income = monthIncome(state, d);
  const spent = monthExpenses(state, d).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const pend = pendingRecurring(state, d);
  const total = daysInMonth(d);
  const daysLeft = Math.max(1, total - d.getDate() + 1);
  const left = income - spent - pend.total;
  return {
    ready: income > 0,
    income,
    spent,
    pendingFixed: pend.total,
    left,
    daysLeft,
    perDay: left / daysLeft,
    monthProgress: d.getDate() / total,
  };
}

/* ── savingsPulse ────────────────────────────────────────────────────────
   Taxa de poupança do mês corrente + colchão de emergência em meses, com a
   despesa média mensal calculada a partir do histórico REAL (últimos 3 meses
   fechados), não de estimativas. */
export function savingsPulse(state, now) {
  const d = now || new Date();
  const income = monthIncome(state, d);
  const spent = monthExpenses(state, d).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const saved = income - spent;
  const rate = income > 0 ? (saved / income) * 100 : 0;

  // Média dos 3 meses anteriores (fechados). Ignora meses sem dados.
  const totals = [];
  for (let k = 1; k <= 3; k++) {
    const m = new Date(d.getFullYear(), d.getMonth() - k, 1);
    const key = ym(m);
    const t = ((state && state.addedExp) || [])
      .filter((x) => (x.date || '').slice(0, 7) === key)
      .reduce((s, x) => s + (Number(x.amount) || 0), 0);
    if (t > 0) totals.push(t);
  }
  const avgMonthly = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : spent;

  // Colchão = liquidez + poupança (exclui investimentos e cartões de crédito).
  let safe = 0;
  getAcctsLive(state).forEach((a) => {
    if (a.c === 'Liquidez' || a.c === 'Poupanca') safe += a.v;
  });
  return {
    income,
    spent,
    saved,
    rate,
    safe,
    avgMonthly,
    months: avgMonthly > 0 ? safe / avgMonthly : 0,
  };
}

/* ── buildInsights ───────────────────────────────────────────────────────
   Avisos gerados localmente (sem IA). Cada um: { id, tone, title, detail }.
   tone: 'alert' (mau) | 'warn' | 'good' | 'info'. Ordenados por urgência. */
export function buildInsights(state, now) {
  const d = now || new Date();
  const out = [];
  const exps = monthExpenses(state, d);
  const bdg = (state && state.bdg) || [];
  const catName = (id) => {
    const b = bdg.find((x) => x.id === id);
    return b ? b.nm : id;
  };

  // 1. Categoria muito acima da média dos 3 meses anteriores.
  const byCatNow = {};
  exps.forEach((x) => {
    byCatNow[x.cat] = (byCatNow[x.cat] || 0) + (Number(x.amount) || 0);
  });
  const prevMonths = [1, 2, 3].map((k) => ym(new Date(d.getFullYear(), d.getMonth() - k, 1)));
  const byCatPrev = {};
  ((state && state.addedExp) || []).forEach((x) => {
    const key = (x.date || '').slice(0, 7);
    if (prevMonths.indexOf(key) < 0) return;
    if (!byCatPrev[x.cat]) byCatPrev[x.cat] = {};
    byCatPrev[x.cat][key] = (byCatPrev[x.cat][key] || 0) + (Number(x.amount) || 0);
  });
  let worst = null;
  Object.keys(byCatNow).forEach((cat) => {
    const hist = byCatPrev[cat];
    if (!hist) return;
    const vals = Object.keys(hist).map((k) => hist[k]);
    if (vals.length < 2) return; // precisa de histórico credível
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg < 20) return; // ignora categorias residuais
    const delta = ((byCatNow[cat] - avg) / avg) * 100;
    if (delta > 30 && (!worst || delta > worst.delta)) worst = { cat, delta, now: byCatNow[cat], avg };
  });
  if (worst) {
    out.push({
      id: 'spike-' + worst.cat,
      tone: 'alert',
      title: catName(worst.cat) + ' +' + Math.round(worst.delta) + '% vs média',
      detail: 'Este mês ' + worst.now.toFixed(0) + '€ · média dos últimos meses ' + worst.avg.toFixed(0) + '€.',
    });
  }

  // 2. Categorias que já estouraram o orçamento.
  const over = [];
  bdg.forEach((b) => {
    const lm = Number(b.lm) || 0;
    if (lm <= 0) return;
    const v = byCatNow[b.id] || 0;
    if (v > lm) over.push({ nm: b.nm, v, lm });
  });
  if (over.length) {
    over.sort((a, b) => b.v - b.lm - (a.v - a.lm));
    const t = over[0];
    out.push({
      id: 'over-budget',
      tone: 'warn',
      title:
        over.length === 1
          ? t.nm + ' passou o limite'
          : over.length + ' categorias acima do limite',
      detail: t.nm + ': ' + t.v.toFixed(0) + '€ de ' + t.lm.toFixed(0) + '€.',
    });
  }

  // (As fixas a pagar em breve têm cartão próprio no Resumo — não duplicar aqui.)

  // 4. Dívida de cartão de crédito perto/acima do plafond.
  getAcctsLive(state)
    .filter((a) => a.c === CARD_CAT && (a.plafond || 0) > 0)
    .forEach((a) => {
      const used = a.used != null ? a.used : cardUsage(state, a.b + ' · ' + a.t).used;
      const pct = (used / a.plafond) * 100;
      if (pct >= 80) {
        out.push({
          id: 'card-' + (a.id || a.b),
          tone: pct > 100 ? 'alert' : 'warn',
          title: a.b + (pct > 100 ? ' passou o plafond' : ' a ' + Math.round(pct) + '% do plafond'),
          detail: 'Dívida ' + used.toFixed(0) + '€ de ' + Number(a.plafond).toFixed(0) + '€.',
        });
      }
    });

  // 5. Obrigação fiscal PT a menos de 30 dias (IRS, IMI, IUC, e-Fatura).
  const tax = upcomingTaxEvents(state && state.taxCfg, d, 30);
  if (tax.length) {
    const t = tax[0];
    out.push({
      id: 'tax-' + t.id,
      tone: t.daysLeft <= 7 ? 'warn' : 'info',
      title: t.title,
      detail: (t.daysLeft === 0 ? 'É hoje' : t.daysLeft === 1 ? 'É amanhã' : 'Faltam ' + t.daysLeft + ' dias') + ' · ver em Mais → Fiscal.',
    });
  }

  // 6. Boa notícia: poupança saudável (só se não houver alertas).
  const sp = savingsPulse(state, d);
  if (!out.some((o) => o.tone === 'alert') && sp.income > 0 && sp.rate >= 20) {
    out.push({
      id: 'good-rate',
      tone: 'good',
      title: 'Poupas ' + Math.round(sp.rate) + '% este mês',
      detail: 'Sobram ' + sp.saved.toFixed(0) + '€ face ao rendimento registado.',
    });
  }

  const order = { alert: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4);
}

/* ── monthPlan (envelope budgeting) ──────────────────────────────────────
   Plano do mês assim que o rendimento entra: quanto está comprometido com
   despesas fixas, quanto vai para metas, e quanto sobra livre.

   { income, salaryIn, fixedTotal, fixedItems, goalsTotal, goalItems,
     spent, free, allocatedGoals }
   - salaryIn: já entrou salário este mês? (receita source 'salary' datada)
   - goalItems: metas com reserva mensal definida e ainda por concluir
   - allocatedGoals: se as metas já foram reforçadas este mês (marca lastAlloc) */
export function monthPlan(state, now) {
  const d = now || new Date();
  const key = ym(d);
  const income = monthIncome(state, d);
  const spent = monthExpenses(state, d).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const pend = pendingRecurring(state, d);

  // Total das fixas do mês (pagas + por pagar), para mostrar o compromisso real.
  const allRec = ((state && state.recurring) || []).map((r) => ({
    id: r.id,
    name: r.name,
    amount: Number(r.amount) || 0,
    day: parseInt(r.day, 10) || 1,
  }));
  const fixedTotal = allRec.reduce((s, r) => s + r.amount, 0);

  const salaryIn = ((state && state.incomes) || []).some(
    (i) => i.source === 'salary' && (i.date || '').slice(0, 7) === key
  );

  const goalItems = ((state && state.goals) || [])
    .filter((g) => (Number(g.monthly) || 0) > 0 && (Number(g.current) || 0) < (Number(g.target) || 0))
    .map((g) => ({
      id: g.id,
      name: g.name,
      monthly: Number(g.monthly) || 0,
      remaining: Math.max(0, (Number(g.target) || 0) - (Number(g.current) || 0)),
      done: g.lastAlloc === key,
    }));
  const goalsTotal = goalItems.reduce((s, g) => s + Math.min(g.monthly, g.remaining), 0);
  const allocatedGoals = goalItems.length > 0 && goalItems.every((g) => g.done);

  return {
    monthKey: key,
    income,
    salaryIn,
    spent,
    fixedTotal,
    fixedItems: allRec.sort((a, b) => a.day - b.day),
    pendingFixed: pend.total,
    goalsTotal,
    goalItems,
    allocatedGoals,
    free: income - fixedTotal - goalsTotal,
  };
}
