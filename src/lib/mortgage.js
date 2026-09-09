/* ════════════════════════════════════════════════════════════════════════
   Crédito à habitação — matemática (amortização francesa), taxa de esforço e
   impostos de compra em Portugal (IMT + Imposto do Selo). Funções puras.
   ════════════════════════════════════════════════════════════════════════ */

// Prestação mensal — amortização francesa (prestação constante).
export function monthlyPayment(principal, annualRatePct, years) {
  const n = Math.round((Number(years) || 0) * 12);
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  const p = Number(principal) || 0;
  if (p <= 0 || n <= 0) return 0;
  if (r === 0) return p / n;
  return (p * r) / (1 - Math.pow(1 + r, -n));
}

// Total de juros pagos ao longo do crédito.
export function totalInterest(principal, annualRatePct, years) {
  const n = Math.round((Number(years) || 0) * 12);
  return monthlyPayment(principal, annualRatePct, years) * n - (Number(principal) || 0);
}

// Taxa de esforço (%) = prestação / rendimento mensal do agregado.
export function effortRate(payment, monthlyIncome) {
  const inc = Number(monthlyIncome) || 0;
  return inc > 0 ? ((Number(payment) || 0) / inc) * 100 : 0;
}

// IMT — Habitação Própria Permanente, Continente. Escalões (ESTIMATIVA 2024):
// [limite superior, taxa marginal, parcela a abater]. IMT = preço*taxa − abater.
const IMT_HPP = [
  [101917, 0, 0],
  [139412, 0.02, 2038.34],
  [190086, 0.05, 6220.7],
  [316772, 0.07, 10022.42],
  [633453, 0.08, 13190.14],
  [1102920, 0.06, 0], // taxa única
  [Infinity, 0.075, 0], // taxa única
];

export function imtHPP(price) {
  const p = Number(price) || 0;
  if (p <= 0) return 0;
  for (let i = 0; i < IMT_HPP.length; i++) {
    const [lim, tx, ab] = IMT_HPP[i];
    if (p <= lim) return Math.max(0, p * tx - ab);
  }
  return 0;
}

// Imposto do Selo sobre a compra = 0,8% do preço.
export function stampDuty(price) {
  return (Number(price) || 0) * 0.008;
}

// Total de impostos na compra (IMT HPP + IS). Estimativa.
export function purchaseTaxes(price) {
  return imtHPP(price) + stampDuty(price);
}

// Meses inteiros decorridos entre uma data (YYYY-MM-DD) e agora — ignora o dia do mês.
export function monthsElapsed(dateStr, now = new Date()) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return Math.max(0, months);
}

// Saldo em dívida estimado após `elapsedMonths` de amortização francesa.
export function remainingBalance(principal, annualRatePct, years, elapsedMonths) {
  const n = Math.round((Number(years) || 0) * 12);
  const p = Number(principal) || 0;
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  const k = Math.min(Math.max(0, Number(elapsedMonths) || 0), n);
  if (p <= 0 || n <= 0) return 0;
  if (k >= n) return 0;
  if (r === 0) return Math.max(0, p - (p / n) * k);
  return Math.max(0, (p * (Math.pow(1 + r, n) - Math.pow(1 + r, k))) / (Math.pow(1 + r, n) - 1));
}

// Simula uma amortização extra (pagamento único) sobre o saldo em dívida atual,
// nos dois cenários possíveis: manter a prestação (reduz prazo) ou manter o
// prazo (reduz prestação). `payment` é a prestação atualmente paga; se omissa,
// usa-se a prestação calculada pela fórmula da amortização francesa.
export function simulateExtraRepayment({ principal, annualRatePct, years, monthsElapsed: elapsed, payment, extra }) {
  const n = Math.round((Number(years) || 0) * 12);
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  const k = Math.min(Math.max(0, Number(elapsed) || 0), n);
  const remainingMonths = n - k;
  const balance = remainingBalance(principal, annualRatePct, years, k);
  const M = Number(payment) > 0 ? Number(payment) : monthlyPayment(principal, annualRatePct, years);
  const extraAmount = Math.min(Math.max(0, Number(extra) || 0), balance);

  const empty = { newMonths: remainingMonths, monthsSaved: 0, interestSaved: 0, newPayment: M };

  if (balance <= 0 || remainingMonths <= 0 || M <= 0) {
    return { balance, payoff: false, reduceTerm: { ...empty }, reducePayment: { ...empty } };
  }

  if (extraAmount <= 0) {
    return { balance, payoff: false, reduceTerm: { ...empty }, reducePayment: { ...empty } };
  }

  const newBalance = balance - extraAmount;
  const payoff = newBalance <= 0.005;

  if (payoff) {
    const interestSaved = M * remainingMonths - balance;
    return {
      balance,
      payoff: true,
      reduceTerm: { newMonths: 0, monthsSaved: remainingMonths, interestSaved },
      reducePayment: { newPayment: 0, interestSaved },
    };
  }

  // Reduzir prazo: mantém a prestação M, recalcula quantos meses faltam.
  let newMonths = remainingMonths;
  if (r === 0) {
    newMonths = Math.ceil(newBalance / M);
  } else if (M > r * newBalance) {
    newMonths = Math.ceil(-Math.log(1 - (r * newBalance) / M) / Math.log(1 + r));
  }
  const monthsSaved = Math.max(0, remainingMonths - newMonths);
  const interestSavedTerm = M * remainingMonths - balance - (M * newMonths - newBalance);

  // Reduzir prestação: mantém o prazo restante, recalcula a prestação.
  const newPayment = r === 0 ? newBalance / remainingMonths : (newBalance * r) / (1 - Math.pow(1 + r, -remainingMonths));
  const interestSavedPayment = M * remainingMonths - balance - (newPayment * remainingMonths - newBalance);

  return {
    balance,
    payoff: false,
    reduceTerm: { newMonths, monthsSaved, interestSaved: interestSavedTerm },
    reducePayment: { newPayment, interestSaved: interestSavedPayment },
  };
}
