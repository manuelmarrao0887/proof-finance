/* ════════════════════════════════════════════════════════════════════════
   irs — ESTIMATIVA das deduções à coleta do IRS (Portugal), a partir das
   despesas já registadas na app.

   ⚠️ Estimativa indicativa, NÃO é aconselhamento fiscal. Só contam despesas
   com fatura comunicada à AT com o NIF do titular; a AT usa os seus próprios
   valores apurados no e-Fatura.

   Regimes cobertos (regras estáveis do CIRS):
     Despesas gerais familiares   35% do valor      · limite 250 EUR/sujeito
     Saúde                        15% do valor      · limite 1 000 EUR
     Educação e formação          30% do valor      · limite 800 EUR
     Exigência de fatura (IVA)    15% do IVA pago   · limite 250 EUR
       nos setores: restauração, oficinas/automóvel, cabeleireiros,
       veterinário e ginásios/atividade física.

   Mapa categoria da app → regime. Categorias não mapeadas caem em "gerais".
   ════════════════════════════════════════════════════════════════════════ */

export const IRS_LIMITS = {
  gerais: { rate: 0.35, cap: 250, label: 'Despesas gerais familiares' },
  saude: { rate: 0.15, cap: 1000, label: 'Saúde' },
  educacao: { rate: 0.3, cap: 800, label: 'Educação' },
  iva: { rate: 0.15, cap: 250, label: 'Exigência de fatura (IVA)' },
};

// Categoria da app → regime de dedução.
// `ivaRate` = taxa de IVA típica do setor, para calcular o IVA suportado.
export const CATEGORY_REGIME = {
  sau: { regime: 'saude' },
  bern: { regime: 'educacao' }, // escola do Bernardo
  rest: { regime: 'iva', ivaRate: 0.23 },
  car: { regime: 'iva', ivaRate: 0.23 }, // oficinas / manutenção
  ani: { regime: 'iva', ivaRate: 0.23 }, // veterinário
  gym: { regime: 'iva', ivaRate: 0.23 },
  sup: { regime: 'gerais' },
  comp: { regime: 'gerais' },
  tel: { regime: 'gerais' },
  laz: { regime: 'gerais' },
  out: { regime: 'gerais' },
  // Não dedutíveis / fora do âmbito destas regras:
  cas: null, // prestação de casa (capital) não é dedutível
  seg: null, // seguros: regime próprio, fora desta estimativa
  emp: null,
  cmb: null, // combustível não confere dedução por exigência de fatura
  neg: null, // despesas de negócio: categoria B, fora do IRS pessoal
  sub: null,
  trf: null,
};

const yearOf = (d) => String(d || '').slice(0, 4);

/* Estimativa das deduções para um ano civil.
   Devolve { year, total, regimes:[{key,label,spent,deduction,cap,capped}], byCat }
   `spent`     — despesa elegível somada
   `deduction` — dedução estimada JÁ limitada pelo teto legal */
export function estimateDeductions(addedExp, year, opts) {
  const y = String(year || new Date().getFullYear());
  const couple = !!(opts && opts.couple); // casal → tetos de "gerais" a dobrar
  const acc = {
    gerais: { spent: 0, raw: 0 },
    saude: { spent: 0, raw: 0 },
    educacao: { spent: 0, raw: 0 },
    iva: { spent: 0, raw: 0 },
  };
  const byCat = {};

  (addedExp || []).forEach((x) => {
    if (yearOf(x && x.date) !== y) return;
    const map = Object.prototype.hasOwnProperty.call(CATEGORY_REGIME, x.cat)
      ? CATEGORY_REGIME[x.cat]
      : { regime: 'gerais' };
    if (!map) return; // categoria não dedutível
    const amount = Number(x.amount) || 0;
    if (amount <= 0) return;
    const r = map.regime;
    acc[r].spent += amount;
    // IVA: benefício = 15% do IVA suportado (valor já inclui IVA)
    if (r === 'iva') {
      const rate = map.ivaRate || 0.23;
      acc[r].raw += (amount * (rate / (1 + rate))) * IRS_LIMITS.iva.rate;
    } else {
      acc[r].raw += amount * IRS_LIMITS[r].rate;
    }
    byCat[x.cat] = (byCat[x.cat] || 0) + amount;
  });

  const regimes = Object.keys(acc).map((k) => {
    const cap = IRS_LIMITS[k].cap * (couple && k === 'gerais' ? 2 : 1);
    const deduction = Math.min(acc[k].raw, cap);
    return {
      key: k,
      label: IRS_LIMITS[k].label,
      spent: acc[k].spent,
      raw: acc[k].raw,
      deduction,
      cap,
      capped: acc[k].raw > cap,
    };
  });

  return {
    year: y,
    total: regimes.reduce((s, r) => s + r.deduction, 0),
    regimes: regimes.sort((a, b) => b.deduction - a.deduction),
    byCat,
  };
}

// Categorias cujas despesas contam para alguma dedução (para marcar na UI).
export function isDeductible(cat) {
  if (!Object.prototype.hasOwnProperty.call(CATEGORY_REGIME, cat)) return true; // default: gerais
  return !!CATEGORY_REGIME[cat];
}
