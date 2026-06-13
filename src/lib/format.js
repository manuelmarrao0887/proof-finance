/* ════════════════════════════════════════════════════════════════════════
   Number / id formatting — ported verbatim from the original (lines 303-307).
   `e()` (HTML escape) is intentionally dropped: JSX escapes by default.
   ════════════════════════════════════════════════════════════════════════ */

// fm(v) -> "1.234,56 EUR" (pt-PT, 2 decimals)
export function fm(v) {
  return (
    Number(v).toLocaleString('pt-PT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' EUR'
  );
}

// fk(v) -> "12.3k" when >= 10000, else fm(v)
export function fk(v) {
  return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : fm(v);
}

// fc(v) -> "1.234 EUR" (pt-PT, 0 decimals)
export function fc(v) {
  return (
    Number(v).toLocaleString('pt-PT', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + ' EUR'
  );
}

// uid() -> short random id (orig 307)
export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// normalizeStmtDate(d) -> 'YYYY-MM-DD'. Bank statements often give 'DD.MM' (no
// year) or 'DD/MM/YYYY'; the budget buckets expect ISO 'YYYY-MM-DD'. Convert so
// imported transactions land in the right month. Unknown formats pass through.
export function normalizeStmtDate(d) {
  if (!d) return '';
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
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
