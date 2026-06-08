/* ════════════════════════════════════════════════════════════════════════
   Category ordering helper (FIX 3 — map §7).

   The original iterated `bdg` in raw array order in every category picker
   (orig lines 1179, 1501, 1761, 1827, 2150, 2248). Use sortedCats(bdg) in
   ALL pickers so categories appear alphabetically by name (pt collation).
   ════════════════════════════════════════════════════════════════════════ */

export function sortedCats(bdg) {
  if (!Array.isArray(bdg)) return [];
  return [...bdg].sort((a, b) => a.nm.localeCompare(b.nm, 'pt'));
}
