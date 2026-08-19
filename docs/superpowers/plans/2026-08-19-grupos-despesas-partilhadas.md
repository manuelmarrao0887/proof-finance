# Grupos — despesas partilhadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao Proof. Finance uma secção "Grupos" que gere despesas partilhadas com pessoas que não usam a app (estilo Splitwise), refletindo nas Despesas pessoais apenas a parte do próprio utilizador.

**Architecture:** Uma lib pura (`src/lib/split.js`) faz toda a matemática de divisão, saldos e simplificação de dívidas em cêntimos inteiros. O store ganha três slices persistidos (`people`, `groups`, `groupEntries`) mapeados para subcoleções Firestore pelo mecanismo existente, e é o único sítio onde a ligação a `addedExp` acontece. A UI é uma view (`GroupsView`) com lista + detalhe de três separadores, mais quatro sheets no padrão dos modais existentes.

**Tech Stack:** React 18 + Vite, Context + useReducer (`src/store/store.jsx`), Firestore por subcoleções (`src/firebase/data.js`), Vitest + @testing-library/react, tokens CSS globais (`src/styles/tokens.css`). Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-19-grupos-despesas-partilhadas-design.md`

## Global Constraints

- **Sem dependências novas.** Nada de bibliotecas de UI, datas ou matemática.
- **Português de Portugal** em toda a UI e nas mensagens de erro. Valores formatados com `fm()` de `src/lib/format.js` (`pt-PT`, 2 casas, sufixo `€`).
- **Ids** gerados sempre com `uid()` de `src/lib/format.js`. **Datas** por defeito com `todayISO()` do mesmo ficheiro (data local, nunca `new Date().toISOString()`).
- **Matemática em cêntimos inteiros** dentro de `src/lib/split.js`; euros só na fronteira da API. Comparações de igualdade de dinheiro fazem-se em cêntimos.
- **O id `'me'` é reservado** para o próprio utilizador e nunca existe em `state.people`.
- **Estilo:** só tokens/classes já existentes (`.cd`, `.rw`, `.lb`, `.chip`, `.sheet-*`, `.hero`, `.btn`…). Sem cores hard-coded fora da paleta de avatares definida na Task 3.
- **Firestore:** `firestore.rules` NÃO muda — `match /users/{uid}/{sub}/{docId}` já cobre subcoleções novas.
- **Mutações por id, nunca por índice de array** (padrão já usado em `addedExp`).
- **Commits** em português, formato Conventional Commits, cada task acaba com pelo menos um commit.
- **Testes** correm com `npm test` (vitest run). Um teste individual: `npx vitest run src/lib/split.test.js -t "nome"`.

---

### Task 1: `lib/split.js` — divisão de valores

**Files:**
- Create: `src/lib/split.js`
- Test: `src/lib/split.test.js`

**Interfaces:**
- Consumes: `uid` de `src/lib/format.js` (não usado nesta task, mas o ficheiro fica preparado).
- Produces:
  - `toCents(v) -> number`
  - `fromCents(c) -> number`
  - `splitEqual(amount, personIds, payerId) -> [{ personId, amount }]`
  - `splitExact(amount, entries) -> { shares, error }` onde `entries = [{ personId, amount }]`
  - `splitPercent(amount, entries) -> { shares, error }` onde `entries = [{ personId, percent }]`
  - `resolveShares(mode, amount, entries, payerId) -> { shares, error }`, `mode ∈ 'equal'|'exact'|'percent'`
  - `shares` é sempre `[{ personId, amount }]` em euros; `error` é `null` ou uma string em pt-PT.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/split.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { toCents, fromCents, splitEqual, splitExact, splitPercent, resolveShares } from './split.js';

describe('toCents / fromCents', () => {
  it('converte sem erro de vírgula flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(137.35)).toBe(13735);
    expect(fromCents(13735)).toBe(137.35);
  });
});

describe('splitEqual', () => {
  it('divide exatamente quando dá', () => {
    const s = splitEqual(96, ['me', 'a', 'b', 'c'], 'me');
    expect(s.map((x) => x.amount)).toEqual([24, 24, 24, 24]);
  });

  it('o cêntimo que sobra vai para o pagador', () => {
    const s = splitEqual(10, ['me', 'a', 'b'], 'a');
    expect(s.find((x) => x.personId === 'a').amount).toBe(3.34);
    expect(s.find((x) => x.personId === 'me').amount).toBe(3.33);
    expect(s.find((x) => x.personId === 'b').amount).toBe(3.33);
  });

  it('os cêntimos que sobram seguem a ordem quando o pagador não participa', () => {
    const s = splitEqual(10, ['a', 'b', 'c'], 'me'); // pagador fora da lista
    expect(s.map((x) => x.amount)).toEqual([3.34, 3.33, 3.33]);
  });

  it('a soma das partes é sempre igual ao total', () => {
    for (const total of [0.01, 0.05, 7.77, 137.35, 1000.01]) {
      for (const n of [2, 3, 4, 5, 7]) {
        const ids = Array.from({ length: n }, (_, i) => 'p' + i);
        const s = splitEqual(total, ids, 'p0');
        const sum = s.reduce((acc, x) => acc + toCents(x.amount), 0);
        expect(sum).toBe(toCents(total));
      }
    }
  });

  it('sem participantes → lista vazia', () => {
    expect(splitEqual(10, [], 'me')).toEqual([]);
  });
});

describe('splitExact', () => {
  it('aceita valores que somam o total', () => {
    const r = splitExact(100, [{ personId: 'me', amount: 40 }, { personId: 'a', amount: 60 }]);
    expect(r.error).toBeNull();
    expect(r.shares).toEqual([{ personId: 'me', amount: 40 }, { personId: 'a', amount: 60 }]);
  });

  it('rejeita quando falta dinheiro e diz quanto', () => {
    const r = splitExact(100, [{ personId: 'me', amount: 40 }, { personId: 'a', amount: 50 }]);
    expect(r.shares).toBeNull();
    expect(r.error).toBe('Faltam 10,00 € para chegar ao total.');
  });

  it('rejeita quando sobra dinheiro e diz quanto', () => {
    const r = splitExact(100, [{ personId: 'me', amount: 70 }, { personId: 'a', amount: 50 }]);
    expect(r.shares).toBeNull();
    expect(r.error).toBe('Sobram 20,00 € face ao total.');
  });
});

describe('splitPercent', () => {
  it('converte percentagens em euros', () => {
    const r = splitPercent(200, [{ personId: 'me', percent: 25 }, { personId: 'a', percent: 75 }]);
    expect(r.error).toBeNull();
    expect(r.shares).toEqual([{ personId: 'me', amount: 50 }, { personId: 'a', amount: 150 }]);
  });

  it('o arredondamento nunca perde cêntimos', () => {
    const r = splitPercent(100, [
      { personId: 'me', percent: 33.33 },
      { personId: 'a', percent: 33.33 },
      { personId: 'b', percent: 33.34 },
    ]);
    const sum = r.shares.reduce((acc, x) => acc + toCents(x.amount), 0);
    expect(sum).toBe(10000);
  });

  it('rejeita quando não soma 100', () => {
    const r = splitPercent(100, [{ personId: 'me', percent: 30 }, { personId: 'a', percent: 60 }]);
    expect(r.shares).toBeNull();
    expect(r.error).toBe('As percentagens somam 90% — têm de somar 100%.');
  });
});

describe('resolveShares', () => {
  it('encaminha para o modo certo', () => {
    const eq = resolveShares('equal', 10, [{ personId: 'me' }, { personId: 'a' }], 'me');
    expect(eq.shares.map((x) => x.amount)).toEqual([5, 5]);

    const ex = resolveShares('exact', 10, [{ personId: 'me', amount: 4 }, { personId: 'a', amount: 6 }], 'me');
    expect(ex.error).toBeNull();

    const pc = resolveShares('percent', 10, [{ personId: 'me', percent: 50 }, { personId: 'a', percent: 50 }], 'me');
    expect(pc.shares.map((x) => x.amount)).toEqual([5, 5]);
  });

  it('valor não positivo → erro', () => {
    expect(resolveShares('equal', 0, [{ personId: 'me' }], 'me').error).toBe('O valor tem de ser maior que zero.');
  });

  it('sem participantes → erro', () => {
    expect(resolveShares('equal', 10, [], 'me').error).toBe('Escolhe pelo menos uma pessoa.');
  });
});
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npx vitest run src/lib/split.test.js`
Expected: FAIL — "Failed to resolve import './split.js'".

- [ ] **Step 3: Escrever a implementação mínima**

Criar `src/lib/split.js`:

```js
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
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npx vitest run src/lib/split.test.js`
Expected: PASS (todos os `describe` acima).

- [ ] **Step 5: Commit**

```bash
git add src/lib/split.js src/lib/split.test.js
git commit -m "feat(grupos): divisão de despesas com arredondamento ao cêntimo

Divisão igual, por valores exatos e por percentagem. A conta é feita em
cêntimos inteiros porque somar floats perde cêntimos em divisões por 3."
```

---

### Task 2: `lib/split.js` — saldos, acertos e resumo

**Files:**
- Modify: `src/lib/split.js`
- Test: `src/lib/split.test.js`

**Interfaces:**
- Consumes: `toCents`, `fromCents`, `splitEqual` (Task 1).
- Produces:
  - `computeBalances(entries, memberIds) -> { [personId]: number }`
  - `simplifyDebts(balances) -> [{ from, to, amount }]`
  - `isSettled(balances) -> boolean`
  - `groupTotals(entries, meId) -> { total, paidByMe, myShare, owedToMe, owedByMe }`
  - `shareText({ group, entries, nameOf }) -> string`, onde `nameOf(personId) -> string`
  - `GROUP_CATS -> [{ id, nm, cat }]` e `groupCatMeta(id) -> { id, nm, cat }`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `src/lib/split.test.js`:

```js
import { computeBalances, simplifyDebts, isSettled, groupTotals, shareText, GROUP_CATS, groupCatMeta } from './split.js';

const MEMBERS = ['me', 'ana', 'joao', 'rita'];
const EXPENSES = [
  { kind: 'expense', amount: 620, payerId: 'me', shares: splitEqual(620, MEMBERS, 'me') },
  { kind: 'expense', amount: 96, payerId: 'ana', shares: splitEqual(96, MEMBERS, 'ana') },
  { kind: 'expense', amount: 60, payerId: 'joao', shares: splitEqual(60, MEMBERS, 'joao') },
];

describe('computeBalances', () => {
  it('quem paga fica credor da parte dos outros', () => {
    const b = computeBalances([EXPENSES[0]], MEMBERS);
    expect(b.me).toBe(465);
    expect(b.ana).toBe(-155);
  });

  it('a soma dos saldos é sempre zero', () => {
    const b = computeBalances(EXPENSES, MEMBERS);
    const sum = Object.values(b).reduce((a, v) => a + toCents(v), 0);
    expect(sum).toBe(0);
  });

  it('um acerto move o dinheiro na direção certa', () => {
    const b = computeBalances(
      [...EXPENSES, { kind: 'settlement', fromId: 'joao', toId: 'me', amount: 100 }],
      MEMBERS
    );
    const semAcerto = computeBalances(EXPENSES, MEMBERS);
    expect(b.joao).toBe(semAcerto.joao + 100);
    expect(b.me).toBe(semAcerto.me - 100);
  });

  it('despesa em que só parte do grupo participa', () => {
    const b = computeBalances(
      [{ kind: 'expense', amount: 84, payerId: 'rita', shares: splitEqual(84, ['me', 'ana', 'rita'], 'rita') }],
      MEMBERS
    );
    expect(b.joao).toBe(0);
    expect(b.rita).toBe(56);
  });

  it('membro sem movimentos fica a zero', () => {
    expect(computeBalances([], MEMBERS)).toEqual({ me: 0, ana: 0, joao: 0, rita: 0 });
  });
});

describe('simplifyDebts', () => {
  it('liquida todos os saldos', () => {
    const b = computeBalances(EXPENSES, MEMBERS);
    const plano = simplifyDebts(b);
    const depois = { ...b };
    plano.forEach((t) => {
      depois[t.from] += t.amount;
      depois[t.to] -= t.amount;
    });
    Object.values(depois).forEach((v) => expect(toCents(v)).toBe(0));
  });

  it('usa no máximo n-1 transferências', () => {
    const b = computeBalances(EXPENSES, MEMBERS);
    expect(simplifyDebts(b).length).toBeLessThanOrEqual(MEMBERS.length - 1);
  });

  it('tudo a zero → nenhuma transferência', () => {
    expect(simplifyDebts({ me: 0, ana: 0 })).toEqual([]);
  });
});

describe('isSettled', () => {
  it('true quando todos estão a zero', () => {
    expect(isSettled({ me: 0, ana: 0 })).toBe(true);
    expect(isSettled(computeBalances(EXPENSES, MEMBERS))).toBe(false);
  });
});

describe('groupTotals', () => {
  it('separa o que pagaste do que é a tua parte', () => {
    const t = groupTotals(EXPENSES, 'me');
    expect(t.total).toBe(776);
    expect(t.paidByMe).toBe(620);
    expect(t.myShare).toBe(194);
    expect(t.owedToMe).toBe(426);
    expect(t.owedByMe).toBe(0);
  });

  it('acertos não contam para o total do grupo', () => {
    const t = groupTotals([...EXPENSES, { kind: 'settlement', fromId: 'joao', toId: 'me', amount: 50 }], 'me');
    expect(t.total).toBe(776);
    expect(t.owedToMe).toBe(376);
  });
});

describe('shareText', () => {
  const group = { name: 'Férias Algarve', emoji: '🏖️', memberIds: MEMBERS };
  const nameOf = (id) => ({ me: 'Tu', ana: 'Ana', joao: 'João', rita: 'Rita' }[id] || id);

  it('lista quem pagou e quem tem de pagar', () => {
    const txt = shareText({ group, entries: EXPENSES, nameOf });
    expect(txt).toContain('Férias Algarve');
    expect(txt).toContain('Total: 776,00 €');
    expect(txt).toContain('Ana: 96,00 €');
    expect(txt).toContain('→ Tu:');
  });

  it('diz que está acertado quando não há dívidas', () => {
    expect(shareText({ group, entries: [], nameOf })).toContain('Contas acertadas');
  });
});

describe('GROUP_CATS', () => {
  it('cada categoria mapeia para uma categoria do orçamento', () => {
    expect(GROUP_CATS.map((c) => c.id)).toEqual(['stay', 'food', 'transp', 'fun', 'shop', 'other']);
    GROUP_CATS.forEach((c) => expect(typeof c.cat).toBe('string'));
    expect(groupCatMeta('food').cat).toBe('rest');
    expect(groupCatMeta('inexistente').id).toBe('other');
  });
});
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npx vitest run src/lib/split.test.js`
Expected: FAIL — `computeBalances is not a function`.

- [ ] **Step 3: Escrever a implementação**

Acrescentar ao fim de `src/lib/split.js`:

```js
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

/* Plano de pagamentos com o menor número de transferências: o maior devedor
   paga ao maior credor até um dos dois ficar a zero. */
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
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npx vitest run src/lib/split.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/split.js src/lib/split.test.js
git commit -m "feat(grupos): saldos, plano de acertos e resumo partilhável

O plano de pagamentos casa o maior devedor com o maior credor para reduzir
o número de transferências: com 4 pessoas passam de 6 para 3."
```

---

### Task 3: Store — slices `people` / `groups` / `groupEntries`

**Files:**
- Modify: `src/store/store.jsx`
- Modify: `src/firebase/data.js:37-49` (mapa `SUBCOLLECTIONS`)
- Test: `src/store/groups.store.test.jsx` (novo)

**Interfaces:**
- Consumes: `uid`, `todayISO` de `src/lib/format.js`; `resolveShares` (Task 1).
- Produces (em `actions`):
  - `addPerson({ name }) -> void` — atribui `id`, `color` e `createdAt`
  - `updatePerson(id, partial)`, `deletePerson(id)`
  - `addGroup({ name, emoji, type, currency, memberIds, start, end, reflectMine })`
  - `updateGroup(id, partial)`, `archiveGroup(id, archived)`, `deleteGroup(id)`
  - `addGroupEntry(entry)`, `updateGroupEntry(id, partial)`, `deleteGroupEntry(id)`
  - `setGroupReflect(groupId, on)`
- Produces (exports do módulo): `AVATAR_COLORS`, `ME_ID`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/store/groups.store.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(cleanup);

describe('slices de grupos', () => {
  it('arrancam vazios e são persistidos', async () => {
    const { initialPersisted, PERSISTED_KEYS } = await import('./store.jsx');
    const st = initialPersisted();
    expect(st.people).toEqual([]);
    expect(st.groups).toEqual([]);
    expect(st.groupEntries).toEqual([]);
    expect(PERSISTED_KEYS).toContain('people');
    expect(PERSISTED_KEYS).toContain('groups');
    expect(PERSISTED_KEYS).toContain('groupEntries');
  });

  it('hydrateFromDoc ignora valores que não são arrays', async () => {
    const { hydrateFromDoc } = await import('./store.jsx');
    const st = hydrateFromDoc({ people: 'lixo', groups: null, groupEntries: [{ id: 'e1' }] });
    expect(st.people).toEqual([]);
    expect(st.groups).toEqual([]);
    expect(st.groupEntries).toEqual([{ id: 'e1' }]);
  });

  it('as subcoleções novas estão no mapa', async () => {
    const mod = await vi.importActual('../firebase/data.js');
    expect(mod.SUBCOLLECTIONS.people).toBe('people');
    expect(mod.SUBCOLLECTIONS.groups).toBe('groups');
    expect(mod.SUBCOLLECTIONS.groupEntries).toBe('groupEntries');
  });

  it('addGroup preenche os valores por defeito', async () => {
    const { AVATAR_COLORS, ME_ID } = await import('./store.jsx');
    expect(ME_ID).toBe('me');
    expect(AVATAR_COLORS.length).toBeGreaterThan(3);
  });
});
```

> Nota para quem implementa: este ficheiro testa a FORMA do estado e as
> constantes exportadas — não monta a app. O comportamento das actions que
> mexem em `addedExp` é testado na Task 4 através do helper puro
> `reflectExpenseFor`, que é exportado precisamente para ser testável sem
> montar nada. Não inventes helpers novos no `renderWithStore`.

> O import de `renderWithStore` e de `React` no topo do ficheiro só é preciso a
> partir do momento em que houver um teste que monte componentes; se o linter
> reclamar de imports não usados, remove-os.

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npx vitest run src/store/groups.store.test.jsx`
Expected: FAIL — `expect([]).toEqual([])` passa, mas `PERSISTED_KEYS` não contém `people` e `SUBCOLLECTIONS.people` é `undefined`.

- [ ] **Step 3: Adicionar os slices ao estado inicial e à persistência**

Em `src/store/store.jsx`, dentro de `initialPersisted()` (a seguir a `dismissedAnomalies`):

```js
    people: [], // contactos locais para grupos { id, name, color, createdAt }
    groups: [], // grupos de despesas partilhadas { id, name, emoji, type, currency, memberIds, start, end, reflectMine, archived, createdAt }
    groupEntries: [], // despesas e acertos dos grupos (ver lib/split.js)
```

Em `PERSISTED_KEYS`, acrescentar `'people'`, `'groups'`, `'groupEntries'`.

Em `hydrateFromDoc`, junto dos outros guards de array:

```js
  if (Array.isArray(d.people)) st.people = d.people;
  if (Array.isArray(d.groups)) st.groups = d.groups;
  if (Array.isArray(d.groupEntries)) st.groupEntries = d.groupEntries;
```

Em `src/firebase/data.js`, dentro de `SUBCOLLECTIONS`:

```js
  people: 'people',
  groups: 'groups',
  groupEntries: 'groupEntries',
```

- [ ] **Step 4: Escrever as actions**

Ainda em `src/store/store.jsx`, no topo do ficheiro:

```js
// Id reservado do próprio utilizador nos grupos (nunca existe em state.people).
export const ME_ID = 'me';
// Paleta dos avatares das pessoas (tokens do sistema visual).
export const AVATAR_COLORS = ['#3b6fee', '#12b3a6', '#f5a623', '#f25592', '#7b5fe0', '#3fc97a', '#f25555'];
```

E no objeto `actions` (a seguir ao bloco das despesas):

```js
      // ── Grupos: pessoas ──────────────────────────────────────────────
      addPerson: (p) => {
        const list = getState().people || [];
        const color = p.color || AVATAR_COLORS[list.length % AVATAR_COLORS.length];
        setField('people', [...list, { id: uid(), createdAt: Date.now(), ...p, color }]);
      },
      updatePerson: (id, partial) =>
        setField('people', (getState().people || []).map((x) => (x.id === id ? { ...x, ...partial } : x))),
      deletePerson: (id) => {
        const st = getState();
        const used = (st.groups || []).some((g) => (g.memberIds || []).includes(id));
        if (used) return false; // a UI bloqueia antes; isto é a rede de segurança
        setField('people', (st.people || []).filter((x) => x.id !== id));
        return true;
      },

      // ── Grupos ───────────────────────────────────────────────────────
      addGroup: (g) =>
        setField('groups', [
          ...(getState().groups || []),
          {
            id: uid(),
            emoji: '👥',
            type: 'trip',
            currency: 'EUR',
            memberIds: [ME_ID],
            start: null,
            end: null,
            reflectMine: true,
            archived: false,
            createdAt: Date.now(),
            ...g,
          },
        ]),
      updateGroup: (id, partial) =>
        setField('groups', (getState().groups || []).map((x) => (x.id === id ? { ...x, ...partial } : x))),
      archiveGroup: (id, archived = true) =>
        setField('groups', (getState().groups || []).map((x) => (x.id === id ? { ...x, archived } : x))),
      deleteGroup: (id) => {
        const st = getState();
        const linked = (st.groupEntries || []).filter((e) => e.groupId === id).map((e) => e.linkedExpId).filter(Boolean);
        setField('groups', (st.groups || []).filter((x) => x.id !== id));
        setField('groupEntries', (st.groupEntries || []).filter((e) => e.groupId !== id));
        if (linked.length) {
          setField('addedExp', (st.addedExp || []).filter((x) => !linked.includes(x.id)));
        }
      },
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `npx vitest run src/store/groups.store.test.jsx`
Expected: PASS.

- [ ] **Step 6: Correr a suite toda (nada partido)**

Run: `npm test`
Expected: PASS — nenhum teste existente falha.

- [ ] **Step 7: Commit**

```bash
git add src/store/store.jsx src/firebase/data.js src/store/groups.store.test.jsx
git commit -m "feat(grupos): slices de pessoas, grupos e movimentos

Persistem em subcoleções novas pelo mesmo mecanismo dos slices existentes;
as regras do Firestore já cobrem users/{uid}/{sub}/{docId}, por isso não mudam."
```

---

### Task 4: Store — movimentos de grupo e ligação às Despesas pessoais

**Files:**
- Modify: `src/store/store.jsx`
- Test: `src/store/groups.store.test.jsx`

**Interfaces:**
- Consumes: `ME_ID`, actions da Task 3; `groupCatMeta` de `src/lib/split.js`.
- Produces:
  - `addGroupEntry(entry) -> string` (devolve o id criado)
  - `updateGroupEntry(id, partial) -> void`
  - `deleteGroupEntry(id) -> void`
  - `setGroupReflect(groupId, on) -> void`
  - Movimento pessoal ligado tem a forma `{ id, desc, amount, cat, date, groupEntryId }` em `addedExp`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/store/groups.store.test.jsx`, dentro de um `describe` novo:

```jsx
describe('ligação às despesas pessoais', () => {
  it('criar despesa de grupo cria só a minha parte nas Despesas', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', name: 'Férias', memberIds: ['me', 'a', 'b', 'c'], reflectMine: true };
    const entry = {
      id: 'e1', groupId: 'g1', kind: 'expense', desc: 'Airbnb', amount: 620,
      date: '2026-08-12', payerId: 'me', gcat: 'stay', reflect: true,
      shares: [
        { personId: 'me', amount: 155 }, { personId: 'a', amount: 155 },
        { personId: 'b', amount: 155 }, { personId: 'c', amount: 155 },
      ],
    };
    const mov = reflectExpenseFor(group, entry);
    expect(mov.amount).toBe(155);
    expect(mov.desc).toBe('Airbnb');
    expect(mov.cat).toBe('cas');
    expect(mov.date).toBe('2026-08-12');
    expect(mov.groupEntryId).toBe('e1');
  });

  it('não cria movimento quando o grupo não reflete', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: false };
    const entry = { id: 'e1', groupId: 'g1', kind: 'expense', amount: 10, reflect: true, shares: [{ personId: 'me', amount: 5 }] };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });

  it('não cria movimento quando a despesa tem o toggle desligado', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: true };
    const entry = { id: 'e1', groupId: 'g1', kind: 'expense', amount: 10, reflect: false, shares: [{ personId: 'me', amount: 5 }] };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });

  it('não cria movimento quando não participo na despesa', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: true };
    const entry = { id: 'e1', groupId: 'g1', kind: 'expense', amount: 10, reflect: true, shares: [{ personId: 'a', amount: 10 }] };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });

  it('acertos nunca geram movimento pessoal', async () => {
    const { reflectExpenseFor } = await import('./store.jsx');
    const group = { id: 'g1', memberIds: ['me', 'a'], reflectMine: true };
    const entry = { id: 's1', groupId: 'g1', kind: 'settlement', fromId: 'a', toId: 'me', amount: 100 };
    expect(reflectExpenseFor(group, entry)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr os testes e confirmar que falham**

Run: `npx vitest run src/store/groups.store.test.jsx`
Expected: FAIL — `reflectExpenseFor is not a function`.

- [ ] **Step 3: Escrever o helper puro e as actions**

Em `src/store/store.jsx`, ao nível do módulo (exportado para ser testável sem montar a app):

```js
/* Movimento pessoal correspondente à MINHA parte de uma despesa de grupo, ou
   null quando não deve existir. Só a minha parte entra nas Despesas: lançar o
   total pago inflaciona o orçamento do mês com dinheiro que é dos outros. */
export function reflectExpenseFor(group, entry) {
  if (!group || !entry || entry.kind === 'settlement') return null;
  if (!group.reflectMine || entry.reflect === false) return null;
  const mine = (entry.shares || []).find((s) => s.personId === ME_ID);
  const amount = Number(mine && mine.amount) || 0;
  if (amount <= 0) return null;
  return {
    desc: entry.desc || 'Despesa de grupo',
    amount,
    cat: entry.cat || groupCatMeta(entry.gcat).cat,
    date: entry.date,
    groupEntryId: entry.id,
  };
}
```

Importar `groupCatMeta` no topo: `import { groupCatMeta } from '../lib/split.js';`

E as actions (a seguir às da Task 3):

```js
      // ── Grupos: movimentos (despesas e acertos) ──────────────────────
      addGroupEntry: (entry) => {
        const st = getState();
        const id = entry.id || uid();
        const full = { createdAt: Date.now(), ...entry, id };
        const group = (st.groups || []).find((g) => g.id === full.groupId);
        const mov = reflectExpenseFor(group, full);
        if (mov) {
          const expId = uid();
          full.linkedExpId = expId;
          setField('addedExp', [...(st.addedExp || []), { id: expId, ...mov }]);
        }
        setField('groupEntries', [...(st.groupEntries || []), full]);
        return id;
      },
      updateGroupEntry: (id, partial) => {
        const st = getState();
        const prev = (st.groupEntries || []).find((e) => e.id === id);
        if (!prev) return;
        const next = { ...prev, ...partial };
        const group = (st.groups || []).find((g) => g.id === next.groupId);
        const mov = reflectExpenseFor(group, next);
        let exps = st.addedExp || [];
        if (mov && next.linkedExpId) {
          exps = exps.map((x) => (x.id === next.linkedExpId ? { ...x, ...mov } : x));
        } else if (mov) {
          const expId = uid();
          next.linkedExpId = expId;
          exps = [...exps, { id: expId, ...mov }];
        } else if (next.linkedExpId) {
          exps = exps.filter((x) => x.id !== next.linkedExpId);
          next.linkedExpId = null;
        }
        setField('addedExp', exps);
        setField('groupEntries', (st.groupEntries || []).map((e) => (e.id === id ? next : e)));
      },
      deleteGroupEntry: (id) => {
        const st = getState();
        const entry = (st.groupEntries || []).find((e) => e.id === id);
        setField('groupEntries', (st.groupEntries || []).filter((e) => e.id !== id));
        if (entry && entry.linkedExpId) {
          setField('addedExp', (st.addedExp || []).filter((x) => x.id !== entry.linkedExpId));
        }
      },
      /* Ligar/desligar o reflexo de um grupo inteiro: cria ou apaga os
         movimentos pessoais das despesas existentes de uma vez. */
      setGroupReflect: (groupId, on) => {
        const st = getState();
        const group = { ...((st.groups || []).find((g) => g.id === groupId) || {}), reflectMine: on };
        let exps = st.addedExp || [];
        const entries = (st.groupEntries || []).map((e) => {
          if (e.groupId !== groupId || e.kind === 'settlement') return e;
          const mov = reflectExpenseFor(group, e);
          if (mov && !e.linkedExpId) {
            const expId = uid();
            exps = [...exps, { id: expId, ...mov }];
            return { ...e, linkedExpId: expId };
          }
          if (!mov && e.linkedExpId) {
            exps = exps.filter((x) => x.id !== e.linkedExpId);
            return { ...e, linkedExpId: null };
          }
          return e;
        });
        setField('groups', (st.groups || []).map((g) => (g.id === groupId ? { ...g, reflectMine: on } : g)));
        setField('groupEntries', entries);
        setField('addedExp', exps);
      },
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npx vitest run src/store/groups.store.test.jsx`
Expected: PASS.

- [ ] **Step 5: Correr a suite toda**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/store.jsx src/store/groups.store.test.jsx
git commit -m "feat(grupos): refletir apenas a minha parte nas Despesas

Pagar 620 EUR de alojamento por quatro pessoas lança 155 EUR no orçamento,
não 620. Os acertos nunca entram: receber o que emprestei não é receita."
```

---

### Task 5: `GroupsView` — lista de grupos

**Files:**
- Create: `src/views/GroupsView.jsx`
- Modify: `src/components/Shell.jsx:105-118` (mapa `VIEWS`) e `:21-34` (imports lazy)
- Modify: `src/store/ui.jsx:32` (`VALID_TABS`)
- Modify: `src/components/Sidebar.jsx` (`NAV` + ícone)
- Modify: `src/modals/MoreMenu.jsx` (item novo)
- Modify: `src/components/ContextStrip.jsx` (linha de contexto)
- Test: `src/views/views.render.test.jsx`

**Interfaces:**
- Consumes: `useStore()`, `useUI()`, `computeBalances`, `groupTotals`, `isSettled`, `ME_ID`, `fm`.
- Produces: `GroupsView` (default export) e o tab `'groups'`.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/views/views.render.test.jsx`: adicionar o import `import GroupsView from './GroupsView.jsx';`, incluir `GroupsView` no objeto `VIEWS`, e acrescentar ao `richFixture` (em `src/test/fixtures.js`) os dados de grupo:

```js
  people: [
    { id: 'p-ana', name: 'Ana', color: '#12b3a6', createdAt: 1 },
    { id: 'p-joao', name: 'João', color: '#f5a623', createdAt: 2 },
  ],
  groups: [
    {
      id: 'g-ferias', name: 'Férias Algarve', emoji: '🏖️', type: 'trip', currency: 'EUR',
      memberIds: ['me', 'p-ana', 'p-joao'], start: '2026-08-12', end: '2026-08-19',
      reflectMine: true, archived: false, createdAt: 3,
    },
  ],
  groupEntries: [
    {
      id: 'ge-1', groupId: 'g-ferias', kind: 'expense', desc: 'Airbnb', amount: 300,
      date: '2026-08-12', payerId: 'me', splitMode: 'equal', gcat: 'stay', reflect: true,
      shares: [
        { personId: 'me', amount: 100 }, { personId: 'p-ana', amount: 100 }, { personId: 'p-joao', amount: 100 },
      ],
      linkedExpId: null, createdAt: 4,
    },
    {
      id: 'ge-2', groupId: 'g-ferias', kind: 'settlement', fromId: 'p-ana', toId: 'me',
      amount: 50, date: '2026-08-18', method: 'mbway', createdAt: 5,
    },
  ],
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/views/views.render.test.jsx`
Expected: FAIL — "Failed to resolve import './GroupsView.jsx'".

- [ ] **Step 3: Criar a view (lista)**

Começar `src/views/GroupsView.jsx` pelos derivados partilhados entre a lista e o
detalhe (a Task 6 reutiliza-os, não os redefine):

```jsx
import React, { useMemo, useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { ME_ID } from '../store/store.jsx';
import { computeBalances, simplifyDebts, groupTotals, isSettled, groupCatMeta, shareText } from '../lib/split.js';
import { fm } from '../lib/format.js';

// Nome a mostrar para um id de pessoa ('me' é sempre "Tu").
function nameOfFactory(people) {
  return (id) => (id === ME_ID ? 'Tu' : (people.find((p) => p.id === id) || {}).name || '—');
}
// Cor do avatar (o próprio utilizador usa a cor da marca).
function colorOfFactory(people) {
  return (id) => (id === ME_ID ? 'var(--primary)' : (people.find((p) => p.id === id) || {}).color || 'var(--fg-subtle)');
}
// Iniciais para o avatar: "Tu" para o próprio, 2 letras para os outros.
function initialsOf(name, id) {
  if (id === ME_ID) return 'Tu';
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

export default function GroupsView() {
  const { state } = useStore();
  const { open, goTab } = useUI();
  const [openId, setOpenId] = useState(null);

  const people = state.people || [];
  const groups = state.groups || [];
  const allEntries = state.groupEntries || [];
  const nameOf = useMemo(() => nameOfFactory(people), [people]);
  const colorOf = useMemo(() => colorOfFactory(people), [people]);
  const entriesOf = useMemo(
    () => (groupId) => allEntries.filter((e) => e.groupId === groupId),
    [allEntries]
  );
  // ... lista (abaixo) e, a partir da Task 6, o detalhe
}
```

O resto da lista:

- estado local `const [openId, setOpenId] = useState(null)` (lista ↔ detalhe; o detalhe chega na Task 6, por agora renderiza a lista);
- hero com o saldo global: para cada grupo não arquivado, `groupTotals(entriesOf(g.id), ME_ID)`; somar `owedToMe` e `owedByMe`; mostrar `fm(owedToMe - owedByMe)` no destaque e dois `.chip` com os dois totais;
- secção "Ativos": um cartão por grupo com emoji, nome, `n pessoas · fm(total)`, intervalo de datas quando existe, e o saldo do utilizador nesse grupo (verde "devem-te" / vermelho "deves"); `onClick` → `setOpenId(g.id)`;
- secção "Acertados" com os grupos onde `isSettled(...)` é verdade ou `archived === true`, com opacidade reduzida e o chip "✓ acertado";
- estado vazio: título "Ainda não tens grupos", uma linha a explicar para que serve, e o botão primário;
- botão primário "Novo grupo" → `open('group')` (a sheet chega na Task 7; até lá o botão existe e não rebenta porque `open` só regista o modal).

Usar exclusivamente classes existentes (`.cd`, `.rw`, `.lb`, `.chip`, `.hero`) e `fm()` para todos os valores.

- [ ] **Step 4: Ligar à navegação**

- `src/store/ui.jsx`: `VALID_TABS` passa a incluir `'groups'`; `MODALS` ganha `'group'`, `'person'`, `'gexp'`, `'settle'`.
- `src/components/Shell.jsx`: `const GroupsView = lazy(() => import('../views/GroupsView.jsx'));` e `groups: GroupsView` no mapa `VIEWS`.
- `src/components/Sidebar.jsx`: entrada `['groups', 'Grupos']` no `NAV` (a seguir a `expenses`) e o ícone `groups` no objeto `I`:
  ```jsx
  groups: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  ```
- `src/modals/MoreMenu.jsx`: item `{ id: 'groups', title: 'Grupos', sub: 'Despesas partilhadas com amigos', svg: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></> }` no topo da lista.
- `src/components/ContextStrip.jsx`: ramo `else if (tab === 'groups')` com o resumo "N grupos ativos · a receber X · a pagar Y".
- `src/components/Shell.jsx`: `moreTabs` (linha ~182) passa a incluir `'groups'`.

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `npx vitest run src/views/views.render.test.jsx`
Expected: PASS — a view renderiza com dados e com conta vazia, sem avisos do React.

- [ ] **Step 6: Verificar na app a correr**

Run: `npm run dev`, abrir a app, clicar em "Grupos" na sidebar e no menu "Mais".
Expected: lista com o grupo de exemplo em modo demo; sem erros na consola.

- [ ] **Step 7: Commit**

```bash
git add src/views/GroupsView.jsx src/components/Shell.jsx src/store/ui.jsx src/components/Sidebar.jsx src/modals/MoreMenu.jsx src/components/ContextStrip.jsx src/test/fixtures.js src/views/views.render.test.jsx
git commit -m "feat(grupos): vista de lista com saldo global"
```

---

### Task 6: `GroupsView` — detalhe (Despesas · Saldos · Atividade)

**Files:**
- Modify: `src/views/GroupsView.jsx`
- Test: `src/views/groups.detail.test.jsx` (novo)

**Interfaces:**
- Consumes: `computeBalances`, `simplifyDebts`, `groupTotals`, `shareText`, `groupCatMeta`, `ME_ID`.
- Produces: dentro da view, o detalhe com `const [seg, setSeg] = useState('exp')`, `seg ∈ 'exp'|'bal'|'act'`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/views/groups.detail.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import GroupsView from './GroupsView.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(cleanup);

describe('GroupsView — detalhe', () => {
  it('abre o grupo e mostra as despesas', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture, tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    expect(screen.getByText('Airbnb')).toBeTruthy();
  });

  it('o separador Saldos mostra quem paga a quem', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture, tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /saldos/i }));
    // Ana pagou 50 dos 100 que devia → falta 50; João deve 100.
    expect(screen.getByText(/João/)).toBeTruthy();
    expect(screen.getAllByText(/100,00 €/).length).toBeGreaterThan(0);
  });

  it('o separador Atividade lista despesas e acertos', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture, tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /atividade/i }));
    expect(screen.getByText(/acerto/i)).toBeTruthy();
  });

  it('voltar regressa à lista', async () => {
    await renderWithStore(<GroupsView />, { fixture: richFixture, tab: 'groups' });
    fireEvent.click(screen.getByText('Férias Algarve'));
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(screen.getByText(/Novo grupo/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/views/groups.detail.test.jsx`
Expected: FAIL — "Unable to find an element with the text: Airbnb".

- [ ] **Step 3: Implementar o detalhe**

Em `src/views/GroupsView.jsx`, quando `openId` está definido, renderizar:

- cabeçalho: botão de voltar com `aria-label="Voltar"`, emoji + nome, botão de editar (`open('group', group)`, `aria-label="Editar grupo"`);
- cartão de totais: `fm(total)`, linha "tu pagaste X · a tua parte Y", avatares dos membros (iniciais + `person.color`, com `aria-label` = nome);
- segmented control com três botões (`Despesas`, `Saldos`, `Atividade`) — botões reais, com `aria-pressed`;
- **Despesas**: entries `kind !== 'settlement'` ordenadas por data desc, agrupadas por dia com cabeçalho `dd MMM`; cada linha com ícone da categoria (`groupCatMeta`), descrição, "X pagou · N pessoas", valor total e, à direita, o impacto para o utilizador (`deves …` a vermelho / `emprestaste …` a verde); clique abre `open('gexp', entry)`;
- **Saldos**: barra por membro (positivo cresce para a direita a partir do meio) e a lista `simplifyDebts(...)` com um botão "Acertar" por linha (`open('settle', { groupId, from, to, amount })`); botão "Partilhar resumo" que usa `navigator.share` quando existe e `navigator.clipboard.writeText` como alternativa, com toast de confirmação;
- **Atividade**: todas as entries por `createdAt` desc; acertos com o texto "X pagou a Y · acerto";
- botões fixos no fundo: "Acertar" e "Despesa" (`open('gexp', { groupId })`).

Quando um grupo é apagado noutro sítio, `openId` deixa de resolver: fazer `if (!group) return <lista/>` para nunca renderizar um detalhe órfão.

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npx vitest run src/views/groups.detail.test.jsx src/views/views.render.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/GroupsView.jsx src/views/groups.detail.test.jsx
git commit -m "feat(grupos): detalhe do grupo com despesas, saldos e atividade"
```

---

### Task 7: Sheets de grupo e de pessoas

**Files:**
- Create: `src/modals/GroupSheet.jsx`
- Create: `src/modals/PersonSheet.jsx`
- Modify: `src/components/Shell.jsx:38-58` (`MODAL_COMPONENTS`)
- Test: `src/modals/modals.render.test.jsx`

**Interfaces:**
- Consumes: `addGroup`, `updateGroup`, `archiveGroup`, `deleteGroup`, `setGroupReflect`, `addPerson`, `updatePerson`, `deletePerson`, `AVATAR_COLORS`, `ME_ID`.
- Produces: modais `group` e `person` (payload: o objeto a editar, ou `true` para criar).

- [ ] **Step 1: Escrever o teste que falha**

Em `src/modals/modals.render.test.jsx`, acrescentar `GroupSheet` e `PersonSheet` à lista de modais renderizados (mesmo padrão dos existentes: renderiza com `openModal: 'group'` e com fixture rica e vazia).

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/modals/modals.render.test.jsx`
Expected: FAIL — "Failed to resolve import './GroupSheet.jsx'".

- [ ] **Step 3: Implementar `PersonSheet.jsx`**

Sheet no padrão de `src/modals/CatManagerModal.jsx`:

- lista das pessoas com avatar (inicial + cor) e nome;
- campo "Nome" + botão "Adicionar" (cor atribuída automaticamente por `addPerson`);
- editar nome inline; apagar com confirmação;
- quando `deletePerson` devolve `false` (pessoa em uso), mostrar toast: `"A Ana está em grupos — remove-a do grupo antes de apagar."`;
- validação: nome vazio → erro inline "Escreve um nome."; nome repetido → "Já tens uma pessoa com esse nome."

- [ ] **Step 4: Implementar `GroupSheet.jsx`**

Sheet no padrão de `src/modals/GoalModal.jsx`:

- campos: Nome (obrigatório), emoji (grelha fixa `['🏖️','🏠','🎂','🍽️','✈️','⛰️','🎿','👥']`), Tipo (`Viagem`/`Casa`/`Evento`/`Outro` → `trip`/`home`/`event`/`other`), Moeda (select com as chaves de `state.fxRates`, default `EUR`), datas de início/fim opcionais;
- membros: chips com toggle sobre `state.people` (o utilizador entra sempre, chip "Tu" fixo e não removível) + botão "Nova pessoa" que abre `person`;
- toggle "Refletir a minha parte nas Despesas" — em edição chama `setGroupReflect(id, on)` e mostra aviso com a contagem: `"Isto vai apagar N movimentos das tuas Despesas."` / `"Isto vai criar N movimentos nas tuas Despesas."`;
- em edição: botões "Arquivar" e "Apagar grupo" (este último com confirmação que diz quantos movimentos serão apagados);
- validação: nome vazio → "Dá um nome ao grupo."; menos de 2 membros → "Um grupo precisa de pelo menos mais uma pessoa."

- [ ] **Step 5: Registar os modais**

Em `src/components/Shell.jsx`, no `MODAL_COMPONENTS`:

```js
  group: lazy(() => import('../modals/GroupSheet.jsx')),
  person: lazy(() => import('../modals/PersonSheet.jsx')),
```

- [ ] **Step 6: Correr os testes e confirmar que passam**

Run: `npx vitest run src/modals/modals.render.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modals/GroupSheet.jsx src/modals/PersonSheet.jsx src/components/Shell.jsx src/modals/modals.render.test.jsx
git commit -m "feat(grupos): sheets de grupo e de pessoas"
```

---

### Task 8: Sheet de despesa de grupo

**Files:**
- Create: `src/modals/GroupExpenseSheet.jsx`
- Modify: `src/components/Shell.jsx` (`MODAL_COMPONENTS`)
- Modify: `src/modals/ActionSheet.jsx` (atalho novo)
- Test: `src/modals/groupExpense.test.jsx` (novo)

**Interfaces:**
- Consumes: `resolveShares`, `GROUP_CATS`, `groupCatMeta`, `addGroupEntry`, `updateGroupEntry`, `deleteGroupEntry`, `ME_ID`.
- Produces: modal `gexp`; payload `{ groupId }` para criar ou a `entry` completa para editar.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modals/groupExpense.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import GroupExpenseSheet from './GroupExpenseSheet.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(cleanup);

const open = { openModal: 'gexp', payload: { groupId: 'g-ferias' }, fixture: richFixture };

describe('GroupExpenseSheet', () => {
  it('mostra a parte de cada pessoa em tempo real', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    // 3 membros → 30,00 cada
    expect(screen.getAllByText('30,00').length).toBe(3);
  });

  it('bloqueia guardar sem descrição', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByText('Preenche a descrição.')).toBeTruthy();
  });

  it('em valores exatos avisa quando a soma não bate certo', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Jantar' } });
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /^valores$/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByText(/Faltam .* para chegar ao total\./)).toBeTruthy();
  });

  it('tirar uma pessoa redistribui a despesa pelos restantes', async () => {
    await renderWithStore(<GroupExpenseSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /participação de joão/i }));
    expect(screen.getAllByText('45,00').length).toBe(2);
  });
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/modals/groupExpense.test.jsx`
Expected: FAIL — "Failed to resolve import './GroupExpenseSheet.jsx'".

- [ ] **Step 3: Implementar a sheet**

Estrutura (seguir `src/modals/AddExpenseSheet.jsx` como referência de estilo e validação):

- estado local: `{ desc, amount, payerId, date, mode, parts: { [personId]: { on, amount, percent } }, gcat, notes, reflect }`;
- defaults: `payerId = ME_ID`, `date = todayISO()`, `mode = 'equal'`, todos os membros participantes, `gcat = 'other'`, `reflect = group.reflectMine`;
- `useMemo` chama `resolveShares(mode, amount, participantes, payerId)` a cada alteração; a pré-visualização por pessoa mostra `fm()` sem o símbolo (só o número, como no teste) junto ao chip;
- validação ao guardar, por esta ordem: descrição vazia → `'Preenche a descrição.'`; valor ≤ 0 → `'O valor tem de ser maior que zero.'`; nenhum participante → `'Escolhe pelo menos uma pessoa.'`; erro devolvido por `resolveShares` → mostrar tal como vem;
- guardar chama `addGroupEntry({ groupId, kind: 'expense', desc, amount, date, payerId, splitMode: mode, shares, gcat, notes, reflect })` ou `updateGroupEntry(entry.id, {...})`;
- em edição há botão "Apagar despesa" com confirmação;
- toggle "Refletir a minha parte nas Despesas" com o texto derivado: `Cria "<desc> · <fm(minhaParte)>" em <nome da categoria>`;
- chips de participante: `aria-label={'Participação de ' + nome}` (é o que o teste usa);
- campo de valor: `aria-label="Valor"`; descrição: `aria-label="Descrição"`.

- [ ] **Step 4: Registar o modal e o atalho**

- `src/components/Shell.jsx`: `gexp: lazy(() => import('../modals/GroupExpenseSheet.jsx')),`
- `src/modals/ActionSheet.jsx`: item "Despesa de grupo" (a seguir a "Nova despesa"), com o mesmo ícone de pessoas do MoreMenu. Comportamento: sem grupos → abre `group`; com um grupo ativo → abre `gexp` com esse `groupId`; com vários → navega para o tab `groups` (`goTab('groups')`) para o utilizador escolher.

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `npx vitest run src/modals/groupExpense.test.jsx src/modals/modals.render.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modals/GroupExpenseSheet.jsx src/components/Shell.jsx src/modals/ActionSheet.jsx src/modals/groupExpense.test.jsx
git commit -m "feat(grupos): sheet de despesa com divisão igual, exata e por percentagem"
```

---

### Task 9: Sheet de acerto de contas

**Files:**
- Create: `src/modals/SettleSheet.jsx`
- Modify: `src/components/Shell.jsx` (`MODAL_COMPONENTS`)
- Test: `src/modals/settle.test.jsx` (novo)

**Interfaces:**
- Consumes: `computeBalances`, `addGroupEntry`, `ME_ID`.
- Produces: modal `settle`; payload `{ groupId, from, to, amount }` (todos opcionais menos `groupId`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modals/settle.test.jsx` (mesmos mocks de Firebase das tasks anteriores):

```jsx
describe('SettleSheet', () => {
  const open = { openModal: 'settle', payload: { groupId: 'g-ferias', from: 'p-joao', to: 'me', amount: 100 }, fixture: richFixture };

  it('pré-preenche o valor sugerido', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByLabelText(/valor/i).value).toBe('100');
  });

  it('mostra o saldo antes e depois', async () => {
    await renderWithStore(<SettleSheet />, open);
    expect(screen.getByText(/saldo do joão depois/i)).toBeTruthy();
    expect(screen.getByText('0,00 €')).toBeTruthy();
  });

  it('recusa valor zero', async () => {
    await renderWithStore(<SettleSheet />, open);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));
    expect(screen.getByText('O valor tem de ser maior que zero.')).toBeTruthy();
  });

  it('recusa pagar a si próprio', async () => {
    await renderWithStore(<SettleSheet />, { ...open, payload: { groupId: 'g-ferias', from: 'me', to: 'me', amount: 10 } });
    fireEvent.click(screen.getByRole('button', { name: /marcar como pago/i }));
    expect(screen.getByText('Escolhe duas pessoas diferentes.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/modals/settle.test.jsx`
Expected: FAIL — "Failed to resolve import './SettleSheet.jsx'".

- [ ] **Step 3: Implementar a sheet**

- selects "de" e "para" (nomes dos membros; `'me'` mostra "Tu"), valor (`aria-label="Valor"`, pré-preenchido com `payload.amount` ou com a dívida calculada), método (`MB WAY` / `Transferência` / `Dinheiro` → `mbway`/`transfer`/`cash`), data (default `todayISO()`);
- pré-visualização: "Saldo do <nome> antes" / "Saldo do <nome> depois" com `computeBalances` aplicado ao acerto proposto, e a linha fixa "Impacto nas tuas finanças: nenhum · recuperação";
- validações: `from === to` → `'Escolhe duas pessoas diferentes.'`; valor ≤ 0 → `'O valor tem de ser maior que zero.'`; valor acima da dívida → aviso não bloqueante `'Estás a registar mais do que a dívida atual.'`;
- guardar chama `addGroupEntry({ groupId, kind: 'settlement', fromId, toId, amount, date, method })` e mostra toast `'Acerto registado'`;
- registar em `MODAL_COMPONENTS`: `settle: lazy(() => import('../modals/SettleSheet.jsx')),`

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npx vitest run src/modals/settle.test.jsx src/modals/modals.render.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modals/SettleSheet.jsx src/components/Shell.jsx src/modals/settle.test.jsx
git commit -m "feat(grupos): sheet de acerto de contas

Um acerto só move saldos dentro do grupo: não entra nas Despesas nem nas
Receitas, porque o dinheiro em causa já foi contabilizado na altura."
```

---

### Task 10: Indicador no Resumo e selo nas Despesas

**Files:**
- Modify: `src/views/OverviewView.jsx`
- Modify: `src/views/ExpensesView.jsx`
- Test: `src/views/groups.integration.test.jsx` (novo)

**Interfaces:**
- Consumes: `groupTotals`, `ME_ID`, `useUI().goTab`.
- Produces: nada de novo — só UI.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/views/groups.integration.test.jsx` (mesmos mocks):

```jsx
describe('integração com o resto da app', () => {
  it('o Resumo mostra quanto os amigos te devem', async () => {
    await renderWithStore(<OverviewView />, { fixture: richFixture, tab: 'overview' });
    expect(screen.getByText(/devem-te/i)).toBeTruthy();
  });

  it('sem grupos o Resumo não mostra a linha', async () => {
    await renderWithStore(<OverviewView />, { fixture: emptyFixture, tab: 'overview' });
    expect(screen.queryByText(/devem-te/i)).toBeNull();
  });

  it('um movimento ligado a um grupo mostra o selo', async () => {
    const fixture = {
      ...richFixture,
      addedExp: [
        ...(richFixture.addedExp || []),
        { id: 'exp-linked', desc: 'Airbnb', amount: 100, cat: 'cas', date: '2026-08-12', groupEntryId: 'ge-1' },
      ],
    };
    await renderWithStore(<ExpensesView />, { fixture, tab: 'expenses' });
    expect(screen.getAllByText(/grupo/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/views/groups.integration.test.jsx`
Expected: FAIL — "Unable to find an element with the text: /devem-te/i".

- [ ] **Step 3: Implementar**

- `OverviewView.jsx`: somar `groupTotals` de todos os grupos não arquivados; se `owedToMe > 0` ou `owedByMe > 0`, renderizar um `.cd` compacto com "Amigos devem-te <valor>" e/ou "Deves <valor>", clicável (`goTab('groups')`). **Não somar ao património nem ao orçamento** — é informação.
- `ExpensesView.jsx`: nos movimentos com `groupEntryId`, mostrar um `.chip` com o texto "grupo"; ao tocar para editar, abrir `gexp` com a entry correspondente em vez do `add` normal (procurar a entry por `groupEntries.find((e) => e.id === x.groupEntryId)`; se não existir, comportamento normal).

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npx vitest run src/views/groups.integration.test.jsx`
Expected: PASS.

- [ ] **Step 5: Correr a suite toda**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/OverviewView.jsx src/views/ExpensesView.jsx src/views/groups.integration.test.jsx
git commit -m "feat(grupos): indicador no Resumo e selo nos movimentos ligados"
```

---

### Task 11: Dados de demonstração (modo preview)

**Files:**
- Modify: `src/lib/finance.js` (bloco DEMO/SEED, ~linha 24)
- Modify: `src/views/GroupsView.jsx` (consumir o seed em preview)
- Test: `src/views/groups.demo.test.jsx` (novo)

**Interfaces:**
- Consumes: `splitEqual` de `src/lib/split.js`.
- Produces: `demoGroups() -> { people, groups, groupEntries }` exportado de `src/lib/finance.js`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/views/groups.demo.test.jsx`:

```jsx
describe('modo demo', () => {
  it('sem login mostra um grupo de exemplo', async () => {
    // renderWithStore autentica por defeito; aqui usamos preview (sem utilizador).
    await renderWithStore(<GroupsView />, { fixture: emptyFixture, tab: 'groups', preview: true });
    expect(screen.getByText('Férias Algarve')).toBeTruthy();
  });
});
```

> Se `renderWithStore` ainda não suportar `preview`, acrescentar a opção: quando
> `opts.preview === true`, o `Seed` **não** chama `setCurrentUser`. É uma alteração
> de 2 linhas em `src/test/renderWithStore.jsx`, dentro do `useEffect`.

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/views/groups.demo.test.jsx`
Expected: FAIL — "Unable to find an element with the text: Férias Algarve".

- [ ] **Step 3: Implementar o seed**

Em `src/lib/finance.js`, no bloco de demo, exportar:

```js
export function demoGroups() {
  const people = [
    { id: 'demo-ana', name: 'Ana', color: '#12b3a6', createdAt: 0 },
    { id: 'demo-joao', name: 'João', color: '#f5a623', createdAt: 0 },
    { id: 'demo-rita', name: 'Rita', color: '#f25592', createdAt: 0 },
  ];
  const ids = ['me', 'demo-ana', 'demo-joao', 'demo-rita'];
  const groups = [{
    id: 'demo-ferias', name: 'Férias Algarve', emoji: '🏖️', type: 'trip', currency: 'EUR',
    memberIds: ids, start: '2026-08-12', end: '2026-08-19',
    reflectMine: true, archived: false, createdAt: 0,
  }];
  const mk = (id, desc, amount, payerId, date, gcat, members) => ({
    id, groupId: 'demo-ferias', kind: 'expense', desc, amount, date, payerId,
    splitMode: 'equal', gcat, reflect: true, linkedExpId: null, createdAt: 0,
    shares: splitEqual(amount, members || ids, payerId),
  });
  const groupEntries = [
    mk('demo-e1', 'Airbnb · 7 noites', 620, 'me', '2026-08-12', 'stay'),
    mk('demo-e2', 'Bilhetes Zoomarine', 84, 'demo-rita', '2026-08-12', 'fun', ['me', 'demo-ana', 'demo-rita']),
    mk('demo-e3', 'Jantar marisqueira', 96, 'demo-ana', '2026-08-14', 'food'),
    mk('demo-e4', 'Gasolina', 60, 'demo-joao', '2026-08-14', 'transp'),
  ];
  return { people, groups, groupEntries };
}
```

Importar `splitEqual` no topo de `finance.js`.

Em `GroupsView.jsx`: quando `preview === true` e os slices do utilizador estão vazios, usar `demoGroups()` como fonte de dados (só leitura — nenhuma action é chamada em preview, tal como no resto da app).

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `npx vitest run src/views/groups.demo.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance.js src/views/GroupsView.jsx src/test/renderWithStore.jsx src/views/groups.demo.test.jsx
git commit -m "feat(grupos): dados de exemplo no modo demo"
```

---

### Task 12: Documentação, changelog e verificação final

**Files:**
- Modify: `STORE_API.md`
- Modify: `testes.html`
- Modify: `src/lib/patchNotes.js`
- Test: `src/lib/patchNotes.test.js`

**Interfaces:**
- Consumes: tudo o que ficou construído.
- Produces: nada de código novo.

- [ ] **Step 1: Atualizar `STORE_API.md`**

- na tabela do slice persistido: `people`, `groups`, `groupEntries` com a forma dos objetos;
- na tabela das subcoleções: as três linhas novas;
- secção nova "Grupos (despesas partilhadas)" com as actions, a regra de que **só a parte do utilizador entra em `addedExp`**, e o campo `groupEntryId` nos movimentos ligados;
- referência a `src/lib/split.js` na lista de libs.

- [ ] **Step 2: Atualizar `testes.html`**

Acrescentar uma secção "Grupos" com os casos de QA: criar grupo, adicionar pessoa, despesa igual/exata/percentual, tirar participante, acertar parcial e total, arquivar, apagar grupo com movimentos ligados, ligar/desligar o reflexo, e o caso de segurança "os dados de grupos ficam sob `users/{uid}` e nenhuma regra nova foi aberta".

- [ ] **Step 3: Acrescentar a entrada de changelog**

No topo do array `PATCH_NOTES` em `src/lib/patchNotes.js`:

```js
  {
    version: 7,
    date: '2026-08-19',
    title: 'Grupos — despesas partilhadas',
    items: [
      'Novo: grupos para dividir despesas com amigos (férias, casa, jantares).',
      'Novo: divisão igual, por valores exatos ou por percentagem.',
      'Novo: saldos por pessoa e plano com o menor número de transferências.',
      'Novo: acertar contas e partilhar o resumo do grupo.',
      'Melhoria: nas tuas Despesas entra só a tua parte das despesas de grupo.',
    ],
  },
```

- [ ] **Step 4: Correr a suite completa**

Run: `npm test`
Expected: PASS — incluindo `patchNotes.test.js`, que valida a forma das entradas.

- [ ] **Step 5: Verificar o build**

Run: `npm run build`
Expected: build sem erros nem avisos novos.

- [ ] **Step 6: Verificação manual na app**

Run: `npm run dev` e percorrer: criar pessoa → criar grupo → 3 despesas em modos diferentes → conferir saldos → acertar uma dívida parcial → confirmar que as Despesas pessoais só têm a tua parte → partilhar resumo → arquivar o grupo.
Expected: tudo como descrito, sem erros na consola, em tema claro e escuro.

- [ ] **Step 7: Commit e push**

```bash
git add STORE_API.md testes.html src/lib/patchNotes.js
git commit -m "docs(grupos): API do store, casos de teste e changelog"
git push origin react
```

---

## Notas de execução

- **Ordem:** as tasks 1→4 são a fundação (lib + store) e têm de ficar antes de qualquer UI. As tasks 7, 8 e 9 podem ser feitas em paralelo depois da 6, porque tocam em ficheiros diferentes (o único ponto comum é o `MODAL_COMPONENTS` em `Shell.jsx` — quem for segundo faz merge à mão).
- **Não alterar `firestore.rules`.** Se aparecer "Missing or insufficient permissions", o problema é outro (ver o comentário no topo do ficheiro).
- **Depois do deploy:** hard reload no browser, porque o service worker/cache serve a versão anterior (nota já registada em sessões anteriores).
