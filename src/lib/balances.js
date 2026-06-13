/* ════════════════════════════════════════════════════════════════════════
   Balances — pure helpers for the "atualizar saldo por print" feature.
   A "reading" is a dated balance snapshot for one account:
     { id, acctKey, bank, type, value, date:'YYYY-MM-DD', createdAt }
   The full log lives in the persisted store field `balanceLog`.
   ════════════════════════════════════════════════════════════════════════ */

// Stable key per account: template accounts use `${bank}_${type}` (same
// convention as dynAccts keys); custom accounts use their own id.
export function balanceAcctKey(account) {
  if (account && account.custom) return account.id;
  return (account.bank || '') + '_' + (account.type || '');
}

// Most recent reading for a key (by date string, ISO sorts lexically), or null.
export function latestReading(log, acctKey) {
  const rows = (log || []).filter((r) => r.acctKey === acctKey);
  if (!rows.length) return null;
  return rows.reduce((a, b) => (b.date > a.date ? b : a));
}

// All readings for a key, ascending by date.
export function accountHistory(log, acctKey) {
  return (log || [])
    .filter((r) => r.acctKey === acctKey)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Append a reading immutably.
export function addReading(log, reading) {
  return [...(log || []), reading];
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'; unknown formats pass through unchanged.
export function formatReadingDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return m[3] + '/' + m[2] + '/' + m[1];
}
