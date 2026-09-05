// Fatias de dados que uma ação pode alterar; um snapshot delas + actions.patch(snap) = "Anular".
export const SLICES = ['addedExp', 'incomes', 'goals', 'recurring', 'bdg', 'transfers', 'positions', 'customAccts', 'dynAccts', 'balanceLog', 'people', 'groups', 'groupEntries', 'housing', 'rules', 'dynSnaps'];
export function snapshotSlices(state, keys = SLICES) {
  const snap = {};
  keys.forEach((k) => { snap[k] = state ? state[k] : undefined; });
  return snap;
}
