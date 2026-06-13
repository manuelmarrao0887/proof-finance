/* ════════════════════════════════════════════════════════════════════════
   Same-beneficiary de-dup helpers (FIX 1 — map §6c / §"WHERE THE 4 FIXES GO").

   normalizeDesc mirrors the original detectSubscriptions key normalization
   (orig line 693): lowercase, trim, collapse internal whitespace.

   applySameBeneficiaryCategory: given a list and the index of a row the user
   just classified, return a NEW list where EVERY item whose normalizeDesc(desc)
   matches the target row's is set to the chosen category. Supports both `cat`
   and `category` key names via `keyName` (default 'category', used by the
   import-statement list; pass 'cat' for the addedExp expense list).
   ════════════════════════════════════════════════════════════════════════ */

import { normalizeStmtDate } from './format.js';

export function normalizeDesc(desc) {
  return String(desc || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Stable identity for an expense: normalized beneficiary + cents + ISO date.
// Using the normalized date merges legacy 'DD.MM' entries with their ISO twins.
export function expenseKey(x) {
  return (
    normalizeDesc(x && x.desc) +
    '|' +
    Math.round((Number(x && x.amount) || 0) * 100) +
    '|' +
    normalizeStmtDate(x && x.date)
  );
}

// Remove duplicate expenses (keep first occurrence) AND normalize each kept
// entry's date to ISO 'YYYY-MM-DD' so it buckets into the right month.
export function dedupeAddedExp(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const k = expenseKey(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...x, date: normalizeStmtDate(x.date) });
  }
  return out;
}

export function applySameBeneficiaryCategory(list, idx, cat, keyName = 'category') {
  if (!Array.isArray(list) || idx < 0 || idx >= list.length) return list;
  const target = list[idx];
  if (!target) return list;
  const targetKey = normalizeDesc(target.desc);
  return list.map((item) => {
    if (normalizeDesc(item.desc) === targetKey) {
      return { ...item, [keyName]: cat };
    }
    return item;
  });
}
