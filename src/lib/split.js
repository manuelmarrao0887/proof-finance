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

/* Categorias próprias das despesas de grupo (lista curta) + mapeamento para os
   ids do orçamento (ver bdgDefault em lib/finance.js) usado quando a despesa
   se reflete nas Despesas pessoais. */
export const GROUP_CATS = [
  { id: 'stay', nm: 'Alojamento', cat: 'cas' },
  { id: 'food', nm: 'Comida e bebida', cat: 'rest' },
  { id: 'transp', nm: 'Transporte', cat: 'cmb' },
  { id: 'fun', nm: 'Atividades', cat: 'laz' },
  { id: 'shop', nm: 'Compras', cat: 'comp' },
  { id: 'other', nm: 'Outro', cat: 'out' },
];

export function groupCatMeta(id) {
  return GROUP_CATS.find((c) => c.id === id) || GROUP_CATS[GROUP_CATS.length - 1];
}

/* Saldo de cada membro: o que pagou, menos a sua parte, mais/menos acertos.
   Positivo = tem dinheiro a receber. A soma de todos dá sempre 0. */
export function computeBalances(entries, memberIds) {
  const ids = Array.isArray(memberIds) ? memberIds : [];
  const cents = Object.fromEntries(ids.map((id) => [id, 0]));
  const bump = (id, c) => {
    if (id in cents) cents[id] += c;
  };
  (entries || []).forEach((e) => {
    if (!e) return;
    if (e.kind === 'settlement') {
      bump(e.fromId, toCents(e.amount)); // pagar reduz a dívida
      bump(e.toId, -toCents(e.amount)); // receber reduz o que tinha a haver
      return;
    }
    bump(e.payerId, toCents(e.amount));
    (e.shares || []).forEach((s) => bump(s.personId, -toCents(s.amount)));
  });
  return Object.fromEntries(ids.map((id) => [id, fromCents(cents[id])]));
}

/* Plano de pagamentos guloso: o maior devedor paga ao maior credor até um dos
   dois ficar a zero. Garante no máximo n-1 transferências para n pessoas, mas
   NÃO garante o mínimo global possível (esse é NP-difícil de calcular). */
export function simplifyDebts(balances) {
  const credit = Object.entries(balances || {})
    .map(([id, v]) => ({ id, c: toCents(v) }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c || a.id.localeCompare(b.id));
  const debt = Object.entries(balances || {})
    .map(([id, v]) => ({ id, c: -toCents(v) }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c || a.id.localeCompare(b.id));
  const out = [];
  let i = 0;
  let j = 0;
  while (i < credit.length && j < debt.length) {
    const move = Math.min(credit[i].c, debt[j].c);
    out.push({ from: debt[j].id, to: credit[i].id, amount: fromCents(move) });
    credit[i].c -= move;
    debt[j].c -= move;
    if (credit[i].c === 0) i += 1;
    if (debt[j].c === 0) j += 1;
  }
  return out;
}

export function isSettled(balances) {
  return Object.values(balances || {}).every((v) => toCents(v) === 0);
}

/* Totais do grupo do ponto de vista do utilizador (`meId`, normalmente 'me'). */
export function groupTotals(entries, meId) {
  const list = entries || [];
  const expenses = list.filter((e) => e && e.kind !== 'settlement');
  const total = expenses.reduce((a, e) => a + toCents(e.amount), 0);
  const paidByMe = expenses.filter((e) => e.payerId === meId).reduce((a, e) => a + toCents(e.amount), 0);
  const myShare = expenses.reduce(
    (a, e) => a + toCents((e.shares || []).find((s) => s.personId === meId)?.amount || 0),
    0
  );
  const settleIn = list
    .filter((e) => e && e.kind === 'settlement' && e.toId === meId)
    .reduce((a, e) => a + toCents(e.amount), 0);
  const settleOut = list
    .filter((e) => e && e.kind === 'settlement' && e.fromId === meId)
    .reduce((a, e) => a + toCents(e.amount), 0);
  const net = paidByMe - myShare + settleOut - settleIn;
  return {
    total: fromCents(total),
    paidByMe: fromCents(paidByMe),
    myShare: fromCents(myShare),
    owedToMe: fromCents(Math.max(0, net)),
    owedByMe: fromCents(Math.max(0, -net)),
  };
}

/* Resumo em texto para partilhar (WhatsApp e afins). */
export function shareText({ group, entries, nameOf }) {
  const list = entries || [];
  const expenses = list.filter((e) => e && e.kind !== 'settlement');
  const total = expenses.reduce((a, e) => a + toCents(e.amount), 0);
  const ids = (group && group.memberIds) || [];
  const lines = [
    `${group.emoji ? group.emoji + ' ' : ''}${group.name} — resumo`,
    `Total: ${fm(fromCents(total))} · ${ids.length} pessoas`,
    '',
    'Quem pagou:',
  ];
  ids.forEach((id) => {
    const paid = expenses.filter((e) => e.payerId === id).reduce((a, e) => a + toCents(e.amount), 0);
    if (paid > 0) lines.push(`• ${nameOf(id)}: ${fm(fromCents(paid))}`);
  });
  const plano = simplifyDebts(computeBalances(list, ids));
  lines.push('', plano.length ? 'Para acertar:' : '✓ Contas acertadas');
  plano.forEach((t) => lines.push(`• ${nameOf(t.from)} → ${nameOf(t.to)}: ${fm(t.amount)}`));
  lines.push('', '— Proof. Finance');
  return lines.join('\n');
}
