/* ════════════════════════════════════════════════════════════════════════
   Balances — pure helpers for the "atualizar saldo por print" feature.
   A "reading" is a dated balance snapshot for one account:
     { id, acctKey, bank, type, value, date:'YYYY-MM-DD', createdAt }
   The full log lives in the persisted store field `balanceLog`.
   ════════════════════════════════════════════════════════════════════════ */

import { accts } from './finance.js';

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

/* Prompt focado: a AI extrai APENAS o saldo total. Sem conta, sem transacoes. */
export const BALANCE_PROMPT =
  'Analisa esta imagem do saldo de uma conta financeira (banco, corretora ou app). ' +
  'Extrai APENAS o saldo total atual / valor da carteira (o numero principal em destaque). ' +
  'Retorna APENAS JSON puro, sem markdown: {"value": 0.00}. ' +
  'O value deve ser um numero com ponto decimal, sem simbolo de moeda e sem separador de milhares. ' +
  'Se nao conseguires identificar um saldo: {"error":"Saldo nao encontrado"}.';

// Normaliza o resultado da AI para { value:number } ou { error:string }.
export function parseBalanceResult(res) {
  if (!res || typeof res !== 'object') return { error: 'Resposta invalida' };
  if (res.error) return { error: String(res.error) };
  let v = res.value;
  if (typeof v === 'string') {
    v = v.replace(/[^0-9.,-]/g, ''); // strip currency symbols / spaces
    const hasDot = v.indexOf('.') > -1;
    const hasComma = v.indexOf(',') > -1;
    if (hasDot && hasComma) v = v.replace(/\./g, '').replace(',', '.'); // pt: 1.300,00
    else if (hasComma) v = v.replace(',', '.'); // 1300,00
    v = parseFloat(v);
  }
  if (typeof v !== 'number' || isNaN(v)) return { error: 'Valor invalido' };
  return { value: v };
}

// Lista unificada de contas selecionaveis: templates (de finance.accts) + custom.
// Cada item: { acctKey, bank, type, category, custom, id? }
export function listAccounts(state) {
  // Template banks (Activobank, Bankinter, Revolut, Wise, N26, ...) are real,
  // selectable quick-picks for EVERY user — a user who actually banks with one
  // (e.g. Activobank) needs to allocate expenses and balance readings to it.
  // The demo *values/balances* are gated separately in getAccts(isPreviewMode).
  const out = accts.map((a) => ({
    acctKey: a.b + '_' + a.t,
    bank: a.b,
    type: a.t,
    category: a.c,
    custom: false,
  }));
  const custom = (state && state.customAccts) || [];
  custom.forEach((a) => {
    out.push({
      acctKey: a.id,
      bank: a.bank,
      type: a.type,
      category: a.category || 'Liquidez',
      custom: true,
      id: a.id,
    });
  });
  return out;
}
