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
