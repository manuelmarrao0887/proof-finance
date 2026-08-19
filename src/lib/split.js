/* ════════════════════════════════════════════════════════════════════════
   split.js — matemática das despesas partilhadas (secção "Grupos").
   Lógica pura: sem React, sem Firebase. Tudo em cêntimos INTEIROS por
   dentro (dinheiro em float perde cêntimos), euros só na fronteira.
   ════════════════════════════════════════════════════════════════════════ */

import { fm } from './format.js';

export function toCents(v) {
  return Math.round((Number(v) || 0) * 100);
}

export function fromCents(c) {
  return Math.round(c) / 100;
}

/* Divide `amount` em partes iguais pelos `personIds`. Os cêntimos que sobram
   vão primeiro para o pagador (é quem adiantou o dinheiro) e depois pela
   ordem da lista, para a soma bater certo ao cêntimo. */
export function splitEqual(amount, personIds, payerId) {
  const ids = Array.isArray(personIds) ? personIds : [];
  if (!ids.length) return [];
  const total = toCents(amount);
  const base = Math.floor(total / ids.length);
  let rest = total - base * ids.length;
  const cents = Object.fromEntries(ids.map((id) => [id, base]));
  const order = ids.includes(payerId) ? [payerId, ...ids.filter((id) => id !== payerId)] : ids;
  for (const id of order) {
    if (rest <= 0) break;
    cents[id] += 1;
    rest -= 1;
  }
  return ids.map((id) => ({ personId: id, amount: fromCents(cents[id]) }));
}

export function splitExact(amount, entries) {
  const list = Array.isArray(entries) ? entries : [];
  const total = toCents(amount);
  const sum = list.reduce((acc, e) => acc + toCents(e.amount), 0);
  if (sum !== total) {
    const diff = fromCents(Math.abs(total - sum));
    return {
      shares: null,
      error: sum < total ? `Faltam ${fm(diff)} para chegar ao total.` : `Sobram ${fm(diff)} face ao total.`,
    };
  }
  return { shares: list.map((e) => ({ personId: e.personId, amount: fromCents(toCents(e.amount)) })), error: null };
}

export function splitPercent(amount, entries) {
  const list = Array.isArray(entries) ? entries : [];
  const pct = list.reduce((acc, e) => acc + Math.round((Number(e.percent) || 0) * 100), 0);
  if (pct !== 10000) {
    const shown = String(Math.round(pct / 100 * 100) / 100).replace('.', ',');
    return { shares: null, error: `As percentagens somam ${shown}% — têm de somar 100%.` };
  }
  const total = toCents(amount);
  const cents = list.map((e) => Math.floor((total * Math.round((Number(e.percent) || 0) * 100)) / 10000));
  let rest = total - cents.reduce((a, c) => a + c, 0);
  for (let i = 0; rest > 0; i = (i + 1) % cents.length) {
    cents[i] += 1;
    rest -= 1;
  }
  return { shares: list.map((e, i) => ({ personId: e.personId, amount: fromCents(cents[i]) })), error: null };
}

/* Fronteira única usada pela UI: valida e devolve shares resolvidos em euros. */
export function resolveShares(mode, amount, entries, payerId) {
  const list = Array.isArray(entries) ? entries : [];
  if (toCents(amount) <= 0) return { shares: null, error: 'O valor tem de ser maior que zero.' };
  if (!list.length) return { shares: null, error: 'Escolhe pelo menos uma pessoa.' };
  if (mode === 'exact') return splitExact(amount, list);
  if (mode === 'percent') return splitPercent(amount, list);
  return { shares: splitEqual(amount, list.map((e) => e.personId), payerId), error: null };
}
