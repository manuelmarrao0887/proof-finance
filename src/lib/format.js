/* ════════════════════════════════════════════════════════════════════════
   Number / id formatting — ported verbatim from the original (lines 303-307).
   `e()` (HTML escape) is intentionally dropped: JSX escapes by default.
   ════════════════════════════════════════════════════════════════════════ */

/* Moeda: símbolo "€" depois do número com espaço inseparável — a forma
   portuguesa ("1 234,56 €"). Antes era o código "EUR", misturado com "€" nos
   textos das análises; agora é um só formato em toda a app. */
const EURO = '\u00a0€';

// fm(v) -> "1 234,56 €" (pt-PT, 2 decimals)
export function fm(v) {
  return (
    Number(v).toLocaleString('pt-PT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + EURO
  );
}

// fk(v) -> "12.3k" when >= 10000, else fm(v)
export function fk(v) {
  return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : fm(v);
}

// fc(v) -> "1 234 €" (pt-PT, 0 decimals)
export function fc(v) {
  return (
    Number(v).toLocaleString('pt-PT', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + EURO
  );
}

// uid() -> short random id (orig 307)
export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// todayISO() -> 'YYYY-MM-DD' na data LOCAL (não UTC). Usar SEMPRE para o valor
// por defeito de campos de data. `new Date().toISOString()` dá UTC: em Portugal
// no verão (UTC+1) uma despesa criada entre 00:00–01:00 recuava um dia — e no
// dia 1 recuava para o mês anterior (despesa de julho ficava com data de junho).
export function todayISO(d) {
  const t = d || new Date();
  return (
    t.getFullYear() +
    '-' +
    String(t.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(t.getDate()).padStart(2, '0')
  );
}

// parseLocalDay('2026-08-20') -> Date local à meia-noite (não UTC). Mesmo
// problema do todayISO ao contrário: `new Date('2026-08-20')` é lido como
// meia-noite UTC, que num fuso negativo (ou antes da 1h em Portugal no
// verão) cai no dia anterior local. Usar sempre que se compara uma data ISO
// de despesa com "agora" ou outra data local. Entrada não-ISO cai no
// `new Date(iso)` normal (ex.: já um Date, ou string com hora).
export function parseLocalDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// normalizeStmtDate(d) -> 'YYYY-MM-DD'. Bank statements often give 'DD.MM' (no
// year) or 'DD/MM/YYYY'; the budget buckets expect ISO 'YYYY-MM-DD'. Convert so
// imported transactions land in the right month. Unknown formats pass through.
export function normalizeStmtDate(d) {
  if (!d) return '';
  const s = String(d).trim();
  // ISO-like YYYY-AA-BB. Pad, and FIX day/month swap (YYYY-DD-MM) when the
  // month field is impossible (>12) — e.g. '2025-15-05' -> '2025-05-15'.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    let mon = parseInt(iso[2], 10);
    let day = parseInt(iso[3], 10);
    if (mon > 12 && day <= 12) {
      const t = mon;
      mon = day;
      day = t;
    }
    return iso[1] + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }
  // DD.MM.YYYY or DD/MM/YYYY (also 2-digit year)
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? '20' + m[3] : m[3];
    return yr + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  // DD.MM or DD/MM (no year) -> infer year (last year if the date is in the future)
  m = s.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const now = new Date();
    let yr = now.getFullYear();
    const cand = new Date(yr, mon - 1, day);
    if (cand.getTime() > now.getTime() + 86400000) yr -= 1;
    return yr + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }
  return s; // unknown — keep as-is
}

// fmDate('2026-08-20') -> '20/08/2026' (formato PT). Entrada desconhecida passa
// intacta. Para LISTAS usa-se fmDateShort ('20 ago') que poupa espaço.
const MON_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function fmDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return m[3] + '/' + m[2] + '/' + m[1];
}
export function fmDateShort(iso, withYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const mon = MON_PT[Number(m[2]) - 1] || m[2];
  const thisYear = String(new Date().getFullYear()) === m[1];
  return String(Number(m[3])) + ' ' + mon + (withYear || !thisYear ? ' ' + m[1].slice(2) : '');
}

// Saldos ocultos: a mesma máscara em toda a app. `f` é o formatador (fm/fc).
export function mask(v, hidden, f = fm) { return hidden ? '••••' : f(v); }
export function maskPct(p, hidden, digits = 0) { return hidden ? '••%' : (Number(p) || 0).toFixed(digits) + '%'; }
export function maskText(text, hidden) { return hidden ? String(text || '').replace(/\d[\d\s.,]*\s?€/g, '••••') : text; }
