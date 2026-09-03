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

/* ── Category visual meta (Finany redesign): icon name (see components/Icon)
   + accent colour per default budget id. Custom/unknown ids fall back. ──── */
export const CAT_META = {
  rest: { icon: 'food', color: '#f5a623' },
  sup: { icon: 'cart', color: '#3fc97a' },
  cas: { icon: 'home', color: '#3b6fee' },
  emp: { icon: 'sparkle', color: '#7b5fe0' },
  seg: { icon: 'shield', color: '#12b3a6' },
  ani: { icon: 'paw', color: '#f25592' },
  sau: { icon: 'health', color: '#f25555' },
  tel: { icon: 'phone', color: '#3b6fee' },
  car: { icon: 'car', color: '#6b7280' },
  sub: { icon: 'recurring', color: '#7b5fe0' },
  gym: { icon: 'dumbbell', color: '#f5a623' },
  cmb: { icon: 'fuel', color: '#f25555' },
  neg: { icon: 'briefcase', color: '#3b6fee' },
  laz: { icon: 'ticket', color: '#f5a623' },
  comp: { icon: 'bag', color: '#12b3a6' },
  trf: { icon: 'transfer', color: '#6b7280' },
  out: { icon: 'dots', color: '#9aa3b5' },
};

// Meta visual: defaults por id, com override opcional do próprio item (icon/color
// escolhidos pelo utilizador em categorias personalizadas).
export function catMeta(id, item) {
  const base = CAT_META[id] || { icon: 'dots', color: '#9aa3b5' };
  if (!item) return base;
  return { icon: item.icon || base.icon, color: item.color || base.color };
}

// Seletores (gestor de categorias e modal de meta).
export const PICKER_ICONS = ['food', 'cart', 'bag', 'home', 'landmark', 'sparkle', 'shield', 'paw', 'health', 'phone', 'car', 'dumbbell', 'fuel', 'briefcase', 'ticket', 'transfer', 'person', 'gift', 'plane', 'umbrella', 'graduation', 'piggy', 'recurring', 'dots'];
export const PICKER_COLORS = ['#3b6fee', '#3fc97a', '#f5a623', '#7b5fe0', '#f25555', '#12b3a6', '#f25592', '#6b7280'];
export const GOAL_ICONS = ['goal', 'umbrella', 'shieldCheck', 'car', 'plane', 'home', 'gift', 'graduation', 'piggy'];
