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
