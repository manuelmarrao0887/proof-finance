/* ════════════════════════════════════════════════════════════════════════
   taxpt — calendário fiscal português (pessoa singular).

   Datas-regra estáveis (AT/Portal das Finanças):
     e-Fatura   · validar faturas pendentes            até 25 fev
     e-Fatura   · consultar despesas dedutíveis apuradas  15 mar
     IRS        · entrega da declaração               1 abr – 30 jun
     IRS        · pagamento/reembolso                 até 31 ago
     IMI        · 1 prestação (ou única)              maio
                  2 prestação (se > 100 EUR)          agosto
                  3 prestação (se > 500 EUR)          novembro
     IUC        · mês da matrícula do veículo         (config)

   Config do utilizador (state.taxCfg), tudo opcional:
     { imiAmount:number, iucMonths:number[], irs:boolean }
   Sem config mostra apenas o que se aplica a toda a gente (e-Fatura + IRS).
   ════════════════════════════════════════════════════════════════════════ */

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);

export const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/* Eventos fiscais de um ano civil. `cfg` opcional.
   Cada evento: { id, date:'YYYY-MM-DD', title, detail, kind, amount? }
   kind: 'efatura' | 'irs' | 'imi' | 'iuc' */
export function taxCalendarPT(year, cfg) {
  const c = cfg || {};
  const out = [];

  // ── e-Fatura ──
  out.push({
    id: 'efatura-validar-' + year,
    date: iso(year, 2, 25),
    title: 'Validar faturas no e-Fatura',
    detail: 'Último dia para validar faturas pendentes do ano anterior. Faturas por validar não contam para as deduções.',
    kind: 'efatura',
  });
  out.push({
    id: 'efatura-despesas-' + year,
    date: iso(year, 3, 15),
    title: 'Deduções apuradas disponíveis',
    detail: 'A AT publica o total de despesas dedutíveis. Confirma e reclama até 31 de março se houver erros.',
    kind: 'efatura',
  });

  // ── IRS ──
  if (c.irs !== false) {
    out.push({
      id: 'irs-inicio-' + year,
      date: iso(year, 4, 1),
      title: 'Abre a entrega do IRS',
      detail: 'Prazo de entrega da declaração de rendimentos: 1 de abril a 30 de junho.',
      kind: 'irs',
    });
    out.push({
      id: 'irs-fim-' + year,
      date: iso(year, 6, 30),
      title: 'Último dia para entregar o IRS',
      detail: 'Entrega fora de prazo tem coima. Submete no Portal das Finanças.',
      kind: 'irs',
    });
    out.push({
      id: 'irs-pagamento-' + year,
      date: iso(year, 8, 31),
      title: 'Pagamento / reembolso do IRS',
      detail: 'Data limite de pagamento do IRS (e prazo legal do reembolso).',
      kind: 'irs',
    });
  }

  // ── IMI (número de prestações depende do valor anual) ──
  const imi = Number(c.imiAmount) || 0;
  if (imi > 0) {
    const parts = imi > 500 ? 3 : imi > 100 ? 2 : 1;
    const months = parts === 3 ? [5, 8, 11] : parts === 2 ? [5, 11] : [5];
    const each = imi / parts;
    months.forEach((m, i) => {
      out.push({
        id: 'imi-' + year + '-' + m,
        date: iso(year, m, 31 - (m === 11 ? 1 : 0)), // maio/ago 31; nov 30
        title: parts === 1 ? 'IMI (prestação única)' : 'IMI · ' + (i + 1) + '.ª de ' + parts,
        detail: 'Imposto Municipal sobre Imóveis' + (parts > 1 ? ' — prestação de ' + each.toFixed(2) + ' EUR' : ''),
        kind: 'imi',
        amount: each,
      });
    });
  }

  // ── IUC (mês da matrícula de cada veículo) ──
  const iucMonths = Array.isArray(c.iucMonths) ? c.iucMonths : [];
  iucMonths.forEach((m, i) => {
    const mm = Math.min(Math.max(parseInt(m, 10) || 1, 1), 12);
    out.push({
      id: 'iuc-' + year + '-' + i + '-' + mm,
      date: iso(year, mm, new Date(year, mm, 0).getDate()),
      title: 'IUC' + (iucMonths.length > 1 ? ' (veículo ' + (i + 1) + ')' : ''),
      detail: 'Imposto Único de Circulação — pago no mês da matrícula (' + MONTH_NAMES_PT[mm - 1] + ').',
      kind: 'iuc',
    });
  });

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* Próximos eventos fiscais a partir de `now`, dentro de `days` (default 60).
   Atravessa a fronteira do ano (dezembro → janeiro seguinte).
   Cada item ganha `daysLeft`. */
export function upcomingTaxEvents(cfg, now, days) {
  const d = now || new Date();
  const horizon = days || 60;
  const y = d.getFullYear();
  const all = taxCalendarPT(y, cfg).concat(taxCalendarPT(y + 1, cfg));
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return all
    .map((e) => {
      const [ey, em, ed] = e.date.split('-').map(Number);
      const dt = new Date(ey, em - 1, ed);
      return { ...e, daysLeft: Math.round((dt - today) / 86400000) };
    })
    .filter((e) => e.daysLeft >= 0 && e.daysLeft <= horizon)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
