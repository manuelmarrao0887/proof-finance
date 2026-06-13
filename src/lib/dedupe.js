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

export function normalizeDesc(desc) {
  return String(desc || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
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
