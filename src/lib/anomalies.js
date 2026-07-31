/* ════════════════════════════════════════════════════════════════════════
   anomalies — despesas que merecem uma segunda vista.

   Apanha três coisas que custam dinheiro real:
     1. COBRANÇA REPETIDA — mesmo beneficiário, mesmo valor, poucos dias de
        intervalo (cobrança dupla do comerciante ou lançamento a dobrar).
     2. VALOR FORA DO PADRÃO — muito acima do que costumas gastar naquele
        beneficiário (erro a escrever o valor, ou cobrança indevida).
     3. PRIMEIRA VEZ CARA — beneficiário novo com um valor alto face ao
        teu padrão de despesa.

   Conservador de propósito: sem histórico não acusa nada. Devolve no máximo
   `limit` (default 5) itens, mais graves primeiro.
   ════════════════════════════════════════════════════════════════════════ */

const key = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);

const daysBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;

/* Analisa as despesas dos últimos `days` dias (default 45).
   Cada anomalia: { id, kind, severity, title, detail, expense, amount } */
export function findAnomalies(state, now, opts) {
  const d = now || new Date();
  const days = (opts && opts.days) || 45;
  const limit = (opts && opts.limit) || 5;
  const all = (state && state.addedExp) || [];
  if (all.length < 5) return [];

  const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);
  const recent = all.filter((x) => {
    const t = new Date(x.date);
    return !isNaN(t) && t >= cutoff && t <= d;
  });
  if (!recent.length) return [];

  // Histórico por beneficiário (tudo, para ter padrão).
  const hist = {};
  all.forEach((x) => {
    const k = key(x.desc);
    if (!k) return;
    if (!hist[k]) hist[k] = [];
    hist[k].push(Number(x.amount) || 0);
  });

  const out = [];
  const seen = new Set();

  // ── 1. Cobrança repetida (mesmo valor, ≤ 5 dias) ──
  const byKey = {};
  recent.forEach((x) => {
    const k = key(x.desc);
    if (!k) return;
    if (!byKey[k]) byKey[k] = [];
    byKey[k].push(x);
  });
  Object.keys(byKey).forEach((k) => {
    const rows = byKey[k].slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      const av = Number(a.amount) || 0;
      const bv = Number(b.amount) || 0;
      if (av <= 0 || Math.abs(av - bv) > 0.01) continue;
      const gap = daysBetween(a.date, b.date);
      if (gap > 5) continue;
      const id = 'dup-' + (b.id || k + b.date);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        kind: 'duplicate',
        severity: 2,
        title: 'Cobrança repetida: ' + b.desc,
        detail:
          bv.toFixed(2) +
          '€ duas vezes em ' +
          (gap === 0 ? 'no mesmo dia' : Math.round(gap) + ' dia' + (gap >= 2 ? 's' : '')) +
          ' (' + a.date + ' e ' + b.date + '). Confirma se não é cobrança dupla.',
        expense: b,
        amount: bv,
      });
    }
  });

  // ── 2. Valor muito fora do padrão do beneficiário ──
  recent.forEach((x) => {
    const k = key(x.desc);
    const v = Number(x.amount) || 0;
    if (!k || v <= 0) return;
    const others = (hist[k] || []).filter((h) => h !== v);
    if (others.length < 3) return; // sem padrão credível
    const avg = others.reduce((a, b) => a + b, 0) / others.length;
    if (avg < 5) return;
    const ratio = v / avg;
    if (ratio < 3 || v - avg < 30) return; // tem de ser grande em % E em valor
    const id = 'out-' + (x.id || k + x.date);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      kind: 'outlier',
      severity: ratio >= 8 ? 3 : 1,
      title: x.desc + ': ' + v.toFixed(2) + '€',
      detail:
        'Costumas gastar ~' +
        avg.toFixed(2) +
        '€ aqui (' +
        others.length +
        ' registos). Este é ' +
        ratio.toFixed(1) +
        '× maior — confirma o valor.',
      expense: x,
      amount: v,
    });
  });

  return out.sort((a, b) => b.severity - a.severity || b.amount - a.amount).slice(0, limit);
}
