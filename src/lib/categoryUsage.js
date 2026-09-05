/* ════════════════════════════════════════════════════════════════════════
   Category usage helpers (Task 9 — "Nova despesa em 5 segundos").

   topCategories: ranks category ids by number of expenses in the last
   `days` (default 90), desc; ties broken alphabetically by category name
   (pt collation). Fills up to `n` with DEFAULTS (in order, no repeats) so
   the picker always has a full row even for a brand-new user.

   lastUsedAccount: the `acct` of the most recent expense that has one, or
   '' when there is none — used to pre-select the account field on a fresh
   draft (never overrides an edit).
   ════════════════════════════════════════════════════════════════════════ */

const DEFAULTS = ['sup', 'rest', 'comp', 'cmb', 'sau', 'laz'];

export function topCategories(state, { days = 90, n = 6 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);
  const bdgIds = new Set(((state && state.bdg) || []).map((b) => b.id));
  // Só conta categorias que ainda existem (bdg do utilizador ou os defaults);
  // ids órfãos de dados antigos (categoria entretanto apagada) são ignorados.
  const isKnown = (id) => bdgIds.has(id) || DEFAULTS.indexOf(id) >= 0;
  const count = {};
  ((state && state.addedExp) || []).forEach((x) => {
    if ((x.date || '') >= sinceIso && x.cat && isKnown(x.cat)) count[x.cat] = (count[x.cat] || 0) + 1;
  });
  const name = (id) => ((((state && state.bdg) || []).find((b) => b.id === id) || {}).nm || id);
  const used = Object.keys(count).sort((a, b) => count[b] - count[a] || name(a).localeCompare(name(b), 'pt'));
  const out = [];
  [...used, ...DEFAULTS].forEach((id) => {
    if (out.length < n && out.indexOf(id) < 0) out.push(id);
  });
  return out;
}

export function lastUsedAccount(state) {
  const withAcct = ((state && state.addedExp) || []).filter((x) => x.acct).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return withAcct.length ? withAcct[0].acct : '';
}
