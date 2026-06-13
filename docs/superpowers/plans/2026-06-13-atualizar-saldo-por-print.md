# Atualizar saldo por print + histórico datado + ícones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No assistente IA, carregar um print do saldo de uma conta, escolher manualmente a conta de destino, e gravar o saldo com data — formando um histórico datado por conta; substituir os ícones-emoji por SVG.

**Architecture:** Lógica pura nova em `src/lib/balances.js` (key da conta, leitura mais recente, histórico, parse do valor extraído pela AI, lista de contas, prompt). Novo campo persistido `balanceLog` no store + ação `addBalanceReading` que grava a leitura E atualiza o saldo vivo (`dynAccts` para templates, `customAccts` para custom). UI nova em dois sheets (`BalanceUpdateSheet`, `BalanceHistorySheet`) montados no `Shell`, acionados a partir do `AIView` (botão) e da `OverviewView` (linha de conta). Ícones SVG num novo `components/Icon.jsx`.

**Tech Stack:** React 18, Vite, Vitest, Context+useReducer store, Anthropic Messages API via `lib/ai.js` (`callAI`).

---

## File Structure

**Novos:**
- `src/lib/balances.js` — funções puras + `BALANCE_PROMPT`.
- `src/lib/balances.test.js` — testes Vitest.
- `src/modals/BalanceUpdateSheet.jsx` — fluxo escolher conta → upload → confirmar.
- `src/modals/BalanceHistorySheet.jsx` — lista de leituras datadas de uma conta.
- `src/components/Icon.jsx` — set de ícones SVG (named).

**Alterados:**
- `src/store/store.jsx` — `balanceLog` (default/persist/hydrate/keys) + `setBalanceLog` + `addBalanceReading` + import `uid`.
- `src/store/ui.jsx` — modais `balanceUpdate` e `balanceHistory` em `MODALS`.
- `src/components/Shell.jsx` — montar os dois novos sheets.
- `src/views/AIView.jsx` — card/botão "Atualizar saldo"; `actionLabel` devolve nome de ícone; render via `<Icon>`.
- `src/views/OverviewView.jsx` — botão "histórico" por linha de conta abre `balanceHistory`.

---

## FASE A+B — Atualizar saldo + histórico

### Task 1: `lib/balances.js` — chave, leitura mais recente, histórico, addReading

**Files:**
- Create: `src/lib/balances.js`
- Test: `src/lib/balances.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/balances.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  balanceAcctKey,
  latestReading,
  accountHistory,
  addReading,
  formatReadingDate,
} from './balances.js';

describe('balanceAcctKey', () => {
  it('template account -> bank_type', () => {
    expect(balanceAcctKey({ bank: 'Activobank', type: 'Conta a Ordem', custom: false })).toBe('Activobank_Conta a Ordem');
  });
  it('custom account -> id', () => {
    expect(balanceAcctKey({ bank: 'Revolut', type: 'Conta a Ordem', custom: true, id: 'abc123' })).toBe('abc123');
  });
});

describe('latestReading', () => {
  const log = [
    { acctKey: 'A', value: 100, date: '2026-05-01' },
    { acctKey: 'A', value: 150, date: '2026-05-30' },
    { acctKey: 'B', value: 9, date: '2026-05-15' },
  ];
  it('returns the most recent reading for a key', () => {
    expect(latestReading(log, 'A')).toEqual({ acctKey: 'A', value: 150, date: '2026-05-30' });
  });
  it('returns null when no reading exists', () => {
    expect(latestReading(log, 'Z')).toBeNull();
  });
  it('handles empty/undefined log', () => {
    expect(latestReading(undefined, 'A')).toBeNull();
  });
});

describe('accountHistory', () => {
  const log = [
    { acctKey: 'A', value: 150, date: '2026-05-30' },
    { acctKey: 'B', value: 9, date: '2026-05-15' },
    { acctKey: 'A', value: 100, date: '2026-05-01' },
  ];
  it('returns only the key, ascending by date', () => {
    expect(accountHistory(log, 'A').map((r) => r.value)).toEqual([100, 150]);
  });
  it('empty log -> []', () => {
    expect(accountHistory([], 'A')).toEqual([]);
  });
});

describe('addReading', () => {
  it('appends immutably', () => {
    const log = [{ acctKey: 'A', value: 1, date: '2026-01-01' }];
    const out = addReading(log, { acctKey: 'A', value: 2, date: '2026-02-01' });
    expect(out).toHaveLength(2);
    expect(log).toHaveLength(1); // original untouched
    expect(out[1].value).toBe(2);
  });
  it('handles undefined log', () => {
    expect(addReading(undefined, { acctKey: 'A', value: 2, date: '2026-02-01' })).toHaveLength(1);
  });
});

describe('formatReadingDate', () => {
  it('YYYY-MM-DD -> DD/MM/YYYY', () => {
    expect(formatReadingDate('2026-05-30')).toBe('30/05/2026');
  });
  it('passes through unknown formats', () => {
    expect(formatReadingDate('hoje')).toBe('hoje');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/balances.test.js`
Expected: FAIL — "Failed to resolve import './balances.js'" / functions undefined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/balances.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/balances.test.js`
Expected: PASS (all in this file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/balances.js src/lib/balances.test.js
git commit -m "feat(balances): chave de conta, leitura mais recente, historico, addReading"
```

---

### Task 2: `lib/balances.js` — prompt da AI, parse do valor, lista de contas

**Files:**
- Modify: `src/lib/balances.js`
- Test: `src/lib/balances.test.js`

- [ ] **Step 1: Write the failing test (append to balances.test.js)**

Add these imports to the existing import block in `src/lib/balances.test.js`:

```js
import { parseBalanceResult, listAccounts, BALANCE_PROMPT } from './balances.js';
```

Append these describe blocks:

```js
describe('parseBalanceResult', () => {
  it('numeric value passes through', () => {
    expect(parseBalanceResult({ value: 750.5 })).toEqual({ value: 750.5 });
  });
  it('pt string "1.300,00" -> 1300', () => {
    expect(parseBalanceResult({ value: '1.300,00' })).toEqual({ value: 1300 });
  });
  it('us string "1234.56" -> 1234.56', () => {
    expect(parseBalanceResult({ value: '1234.56' })).toEqual({ value: 1234.56 });
  });
  it('string with currency symbol', () => {
    expect(parseBalanceResult({ value: '€ 325,46' })).toEqual({ value: 325.46 });
  });
  it('error passthrough', () => {
    expect(parseBalanceResult({ error: 'Saldo nao encontrado' })).toEqual({ error: 'Saldo nao encontrado' });
  });
  it('junk -> error', () => {
    expect(parseBalanceResult({ value: 'abc' }).error).toBeTruthy();
  });
  it('null -> error', () => {
    expect(parseBalanceResult(null).error).toBeTruthy();
  });
});

describe('listAccounts', () => {
  it('includes template accounts with acctKey', () => {
    const out = listAccounts({ customAccts: [] });
    const acti = out.find((a) => a.bank === 'Activobank');
    expect(acti).toBeTruthy();
    expect(acti.acctKey).toBe('Activobank_Conta a Ordem');
    expect(acti.custom).toBe(false);
  });
  it('appends custom accounts keyed by id', () => {
    const out = listAccounts({ customAccts: [{ id: 'x1', bank: 'Revolut', type: 'Conta a Ordem', category: 'Liquidez' }] });
    const rev = out.find((a) => a.bank === 'Revolut');
    expect(rev.acctKey).toBe('x1');
    expect(rev.custom).toBe(true);
    expect(rev.id).toBe('x1');
  });
});

describe('BALANCE_PROMPT', () => {
  it('asks for a value-only JSON', () => {
    expect(BALANCE_PROMPT).toMatch(/value/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/balances.test.js`
Expected: FAIL — `parseBalanceResult`/`listAccounts`/`BALANCE_PROMPT` undefined.

- [ ] **Step 3: Write minimal implementation (append to balances.js)**

Add at the top of `src/lib/balances.js` (after the header comment), the import:

```js
import { accts } from './finance.js';
```

Append to `src/lib/balances.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/balances.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/balances.js src/lib/balances.test.js
git commit -m "feat(balances): BALANCE_PROMPT, parseBalanceResult, listAccounts"
```

---

### Task 3: store — campo `balanceLog` + ação `addBalanceReading`

**Files:**
- Modify: `src/store/store.jsx`

- [ ] **Step 1: Add `uid` import**

In `src/store/store.jsx`, the existing imports include `loadUserDoc, saveUserDoc` and `bdgDefault`. Add below them:

```js
import { uid } from '../lib/format.js';
```

- [ ] **Step 2: Add `balanceLog` to `initialPersisted()`**

In `initialPersisted()`, add `balanceLog: [],` to the returned object (place it right after `addedExp: [],`):

```js
    addedExp: [],
    balanceLog: [],
```

- [ ] **Step 3: Add to `PERSISTED_KEYS`**

In the `PERSISTED_KEYS` array, add `'balanceLog',` after `'addedExp',`:

```js
  'addedExp',
  'balanceLog',
```

- [ ] **Step 4: Add to `buildPersistPayload`**

In `buildPersistPayload(state)`, add after `addedExp: state.addedExp || [],`:

```js
    addedExp: state.addedExp || [],
    balanceLog: state.balanceLog || [],
```

- [ ] **Step 5: Add to `hydrateFromDoc`**

In `hydrateFromDoc(d)`, add after the `addedExp` line:

```js
    addedExp: Array.isArray(d.addedExp) ? d.addedExp : [],
    balanceLog: Array.isArray(d.balanceLog) ? d.balanceLog : [],
```

- [ ] **Step 6: Add actions `setBalanceLog` + `addBalanceReading`**

In the `actions` `useMemo`, right after the expenses block (after the `deleteExpense:` action), add:

```js
      // balance readings (balanceLog) — dated balance snapshots per account.
      setBalanceLog: (balanceLog) => setField('balanceLog', balanceLog),
      addBalanceReading: ({ account, value, date }) => {
        const st = getState();
        const v = Number(value) || 0;
        const acctKey = account.custom ? account.id : account.bank + '_' + account.type;
        const reading = {
          id: uid(),
          acctKey,
          bank: account.bank,
          type: account.type,
          value: v,
          date,
          createdAt: Date.now(),
        };
        setField('balanceLog', [...(st.balanceLog || []), reading]);
        // Update the live balance so compute()/net worth reflect the new value.
        if (account.custom) {
          setField(
            'customAccts',
            (st.customAccts || []).map((a) =>
              a.id === account.id ? { ...a, value: v, updated: (date || '').replace(/-/g, '.') } : a
            )
          );
        } else {
          const dyn = st.dynAccts ? { ...st.dynAccts } : {};
          const prev = dyn[acctKey] || {};
          dyn[acctKey] = { v, d: (date || '').replace(/-/g, '.'), n: prev.n || null };
          setField('dynAccts', dyn);
        }
      },
```

- [ ] **Step 7: Verify build (no test for store wiring; run the suite)**

Run: `npx vitest run`
Expected: PASS (existing suite unaffected; no new failures).

- [ ] **Step 8: Commit**

```bash
git add src/store/store.jsx
git commit -m "feat(store): balanceLog persistido + addBalanceReading"
```

---

### Task 4: registar modais no `ui.jsx`

**Files:**
- Modify: `src/store/ui.jsx:13-25` (the `MODALS` array)

- [ ] **Step 1: Add modal keys**

In `src/store/ui.jsx`, in the `MODALS` array, add two entries after `'more',`:

```js
  'more',       // "Mais" menu             (rMoreMenu)
  'balanceUpdate',  // atualizar saldo por print
  'balanceHistory', // historico de saldos de uma conta
```

- [ ] **Step 2: Commit**

```bash
git add src/store/ui.jsx
git commit -m "feat(ui): registar modais balanceUpdate e balanceHistory"
```

---

### Task 5: `BalanceUpdateSheet.jsx` — fluxo escolher conta → upload → confirmar

**Files:**
- Create: `src/modals/BalanceUpdateSheet.jsx`

- [ ] **Step 1: Create the component**

Create `src/modals/BalanceUpdateSheet.jsx`:

```jsx
/* ════════════════════════════════════════════════════════════════════════
   BalanceUpdateSheet — atualizar o saldo de UMA conta a partir de um print.
   Fluxo: escolher conta (manual) -> upload print -> a AI le SO o valor ->
   confirmar valor + data -> grava leitura (balanceLog) + saldo vivo.
   useModal('balanceUpdate'). A conta NUNCA e adivinhada — e sempre escolhida.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo, useCallback } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm } from '../lib/format.js';
import { callAI, resizeImg } from '../lib/ai.js';
import {
  listAccounts,
  latestReading,
  parseBalanceResult,
  formatReadingDate,
  BALANCE_PROMPT,
} from '../lib/balances.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function BalanceUpdateSheet() {
  const { isOpen, close } = useModal('balanceUpdate');
  const { state, actions } = useStore();
  const toast = useToast();

  const accounts = useMemo(() => listAccounts(state), [state]);
  const [acctKey, setAcctKey] = useState('');
  const [step, setStep] = useState('pick'); // pick | scanning | confirm
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');

  const account = useMemo(() => accounts.find((a) => a.acctKey === acctKey) || null, [accounts, acctKey]);
  const prev = useMemo(
    () => (account ? latestReading(state.balanceLog, account.acctKey) : null),
    [account, state.balanceLog]
  );

  const reset = useCallback(() => {
    setAcctKey('');
    setStep('pick');
    setValue('');
    setDate(todayISO());
    setError('');
  }, []);

  const onClose = useCallback(() => {
    reset();
    close();
  }, [reset, close]);

  const scan = useCallback(
    (el) => {
      const f = el.files && el.files[0];
      el.value = '';
      if (!f || !account) return;
      setStep('scanning');
      setError('');
      resizeImg(f, 1600).then((b64) => {
        callAI(
          [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: BALANCE_PROMPT },
          ],
          undefined,
          state.apiKey,
          (res) => {
            const parsed = parseBalanceResult(res);
            if (parsed.error) {
              setError(parsed.error + ' — introduz o valor manualmente.');
              setValue('');
            } else {
              setValue(String(parsed.value).replace('.', ','));
            }
            setStep('confirm');
          }
        );
      });
    },
    [account, state.apiKey]
  );

  const confirm = useCallback(() => {
    if (!account) return;
    const v = parseFloat(String(value).replace(',', '.'));
    if (isNaN(v)) {
      setError('Valor invalido');
      return;
    }
    actions.addBalanceReading({ account, value: v, date });
    toast('Saldo de ' + account.bank + ' atualizado', 'success');
    reset();
    close();
  }, [account, value, date, actions, toast, reset, close]);

  if (!isOpen) return null;

  // Group accounts by bank for the <select> optgroups.
  const groups = accounts.reduce((m, a) => {
    (m[a.bank] = m[a.bank] || []).push(a);
    return m;
  }, {});

  const selStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 14, marginBottom: 14 };
  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', marginBottom: 14 };
  const btnPrimary = (enabled) => ({ width: '100%', padding: '14px 0', border: 'none', background: enabled ? 'var(--fg)' : 'var(--bg3)', color: enabled ? 'var(--bg)' : 'var(--text3)', fontSize: 14, fontWeight: 600, borderRadius: 999 });

  return (
    <Sheet open={isOpen} onClose={onClose} title="Atualizar saldo">
      {/* Step 1: choose account */}
      <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="buAcct">Conta a atualizar</label>
      <select id="buAcct" value={acctKey} onChange={(e) => { setAcctKey(e.target.value); setStep('pick'); setValue(''); setError(''); }} style={selStyle}>
        <option value="">— escolhe a conta —</option>
        {Object.keys(groups).map((bank) => (
          <optgroup key={bank} label={bank}>
            {groups[bank].map((a) => (
              <option key={a.acctKey} value={a.acctKey}>{a.bank} · {a.type}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {account && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          {prev
            ? 'Leitura anterior: ' + formatReadingDate(prev.date) + ' — ' + fm(prev.value)
            : 'Sem leitura anterior (primeira atualizacao).'}
        </div>
      )}

      {/* Step 1b: upload (only after an account is chosen) */}
      {account && step === 'pick' && (
        <>
          {!state.apiKey && (
            <div style={{ borderLeft: '3px solid var(--signal)', padding: 12, marginBottom: 14 }}>
              <div className="lb" style={{ color: 'var(--signal)' }}>Sem API key — usa "Introduzir manualmente"</div>
            </div>
          )}
          <input id="buCam" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => scan(e.target)} />
          <input id="buFile" type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => scan(e.target)} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" disabled={!state.apiKey} onClick={() => document.getElementById('buCam').click()} style={{ flex: 1, padding: 14, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>Camara</button>
            <button type="button" disabled={!state.apiKey} onClick={() => document.getElementById('buFile').click()} style={{ flex: 1, padding: 14, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>Ficheiro</button>
          </div>
          <button type="button" onClick={() => { setValue(''); setStep('confirm'); }} style={{ width: '100%', padding: '10px 0', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>Introduzir manualmente</button>
        </>
      )}

      {step === 'scanning' && (
        <div style={{ border: '1px solid var(--border)', padding: 24, textAlign: 'center', borderRadius: 'var(--r2)' }}>
          <div className="lb">A ler saldo...</div>
        </div>
      )}

      {/* Step 2: confirm value + date */}
      {account && step === 'confirm' && (
        <>
          {error && (
            <div style={{ borderLeft: '3px solid var(--signal)', padding: 12, marginBottom: 14 }}>
              <div className="lb" style={{ color: 'var(--signal)' }}>{error}</div>
            </div>
          )}
          <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="buVal">Saldo novo</label>
          <input id="buVal" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600 }} />
          <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="buDate">Data do saldo</label>
          <input id="buDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle }} />
          <button type="button" onClick={confirm} disabled={!value} style={btnPrimary(!!value)}>Confirmar e gravar</button>
        </>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Mount in Shell + verify the suite still passes**

(Mounting happens in Task 7; here just confirm nothing breaks.)
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modals/BalanceUpdateSheet.jsx
git commit -m "feat(modals): BalanceUpdateSheet — atualizar saldo por print"
```

---

### Task 6: `BalanceHistorySheet.jsx` — lista de leituras datadas

**Files:**
- Create: `src/modals/BalanceHistorySheet.jsx`

- [ ] **Step 1: Create the component**

Create `src/modals/BalanceHistorySheet.jsx`:

```jsx
/* ════════════════════════════════════════════════════════════════════════
   BalanceHistorySheet — lista de leituras datadas de UMA conta.
   useModal('balanceHistory'); payload = { acctKey, bank, type }.
   Mostra cada leitura (data + valor) e a variacao face a leitura anterior.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { fm } from '../lib/format.js';
import { accountHistory, formatReadingDate } from '../lib/balances.js';

export default function BalanceHistorySheet() {
  const { isOpen, payload, close } = useModal('balanceHistory');
  const { state } = useStore();
  if (!isOpen) return null;

  const acctKey = payload && payload.acctKey;
  const rows = accountHistory(state.balanceLog, acctKey); // ascending by date
  const title = payload ? (payload.bank || '') + ' · ' + (payload.type || '') : 'Historico';

  return (
    <Sheet open={isOpen} onClose={close} title="Historico de saldos">
      <div className="lb" style={{ marginBottom: 12 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="empty" style={{ padding: '24px 0' }}>Sem leituras registadas para esta conta.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r2)', overflow: 'hidden' }}>
          {[...rows].reverse().map((r, i, arr) => {
            // arr is reversed (most recent first); previous chronological row is arr[i+1].
            const prev = arr[i + 1];
            const delta = prev ? r.value - prev.value : null;
            return (
              <div key={r.id || r.date + '_' + i} className="rw" style={{ padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <span className="m" style={{ fontSize: 12, color: 'var(--text2)' }}>{formatReadingDate(r.date)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {delta != null && (
                    <span className="m" style={{ fontSize: 11, color: delta < 0 ? 'var(--signal)' : 'var(--success)' }}>
                      {(delta >= 0 ? '+' : '') + fm(delta)}
                    </span>
                  )}
                  <span className="m" style={{ fontSize: 13, fontWeight: 600 }}>{fm(r.value)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify the suite still passes**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modals/BalanceHistorySheet.jsx
git commit -m "feat(modals): BalanceHistorySheet — lista de leituras datadas"
```

---

### Task 7: montar sheets no Shell + acionar a partir de AIView e OverviewView

**Files:**
- Modify: `src/components/Shell.jsx` (imports ~25-33; render ~179-189)
- Modify: `src/views/AIView.jsx` (import + card/botão na zona de import, ~745)
- Modify: `src/views/OverviewView.jsx` (botão por linha de conta, ~466-480)

- [ ] **Step 1: Mount the two sheets in Shell**

In `src/components/Shell.jsx`, add imports after the `AcctModal` import line:

```js
import AcctModal from '../modals/AcctModal.jsx';
import BalanceUpdateSheet from '../modals/BalanceUpdateSheet.jsx';
import BalanceHistorySheet from '../modals/BalanceHistorySheet.jsx';
```

And in the render block, after `<AcctModal />`, add:

```jsx
      <AcctModal />
      <BalanceUpdateSheet />
      <BalanceHistorySheet />
```

- [ ] **Step 2: Add the "Atualizar saldo" card/button in AIView**

In `src/views/AIView.jsx`, locate the closing `</div>` of the "Importar documento" card (the block that ends right after the camera/file buttons row, before the `{/* Chat / text input */}` comment). Immediately AFTER that import card's closing `</div>` and BEFORE the `{/* Chat / text input */}` comment, insert:

```jsx
      {/* Atualizar saldo por print — conta escolhida manualmente */}
      <div className="cd" style={{ marginBottom: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, background: 'var(--bg3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="balance" size={16} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Atualizar saldo</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
          Carrega um print do saldo, escolhe a conta e a IA le o valor. Fica registado com data.
        </div>
        <button type="button" onClick={() => ui.open('balanceUpdate')} style={{ width: '100%', padding: '12px 0', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>
          Atualizar saldo de uma conta
        </button>
      </div>
```

Then add the `Icon` import at the top of `src/views/AIView.jsx` (after the `useUI` import line):

```js
import { useUI } from '../store/ui.jsx';
import Icon from '../components/Icon.jsx';
```

> Note: `Icon` is created in Task 8. If executing strictly in order, do Task 8 first OR temporarily replace `<Icon name="balance" size={16} />` with the text `€` and the import, then restore in Task 8. Recommended: run Task 8 before this step's `npm run`/manual check.

- [ ] **Step 3: Add the history button per account row in OverviewView**

In `src/views/OverviewView.jsx`, inside the account row (the `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` that holds `{fm(a.v)}` and the custom edit button, ~467-480), add a history button BEFORE the `{a.custom && (...)}` edit button:

```jsx
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="m" style={{ fontSize: 14, fontWeight: 500 }}>{fm(a.v)}</div>
                          <button
                            type="button"
                            onClick={() => open('balanceHistory', { acctKey: a.custom ? a.id : a.b + '_' + a.t, bank: a.b, type: a.t })}
                            className="icon-btn"
                            style={{ width: 28, height: 28 }}
                            aria-label="Historico de saldos"
                          >
                            <Icon name="history" size={15} />
                          </button>
                          {a.custom && (
```

Then add the `Icon` import at the top of `src/views/OverviewView.jsx` (next to the other component imports):

```js
import Icon from '../components/Icon.jsx';
```

- [ ] **Step 4: Verify**

Run: `npx vitest run` → Expected: PASS.
Run: `npm run build` → Expected: build succeeds (no unresolved imports).

- [ ] **Step 5: Commit**

```bash
git add src/components/Shell.jsx src/views/AIView.jsx src/views/OverviewView.jsx
git commit -m "feat: acionar atualizar-saldo (AIView) e historico (OverviewView); montar sheets"
```

---

## FASE C — Ícones (substituir emojis)

### Task 8: `components/Icon.jsx` — set de ícones SVG

**Files:**
- Create: `src/components/Icon.jsx`

> O codebase já usa SVGs inline em linha (stroke `currentColor`, viewBox 24, ex.: `EditIcon`/`Chevron` na OverviewView, ícones do card de import no AIView). Este componente segue esse estilo. Estilo informado pelo /ui-ux-pro-max (linha minimal, 1.8 stroke). Nomes cobrem os 6 conceitos do `actionLabel` + `history` + `balance`.

- [ ] **Step 1: Create the component**

Create `src/components/Icon.jsx`:

```jsx
/* ════════════════════════════════════════════════════════════════════════
   Icon — set de ícones SVG inline (stroke currentColor, viewBox 24), no estilo
   de linha minimal usado no resto da app. Substitui os emojis de sistema.
   Uso: <Icon name="bank" size={16} /> ; herda a cor via currentColor.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

const PATHS = {
  // 🏦 update_balance
  bank: (
    <>
      <line x1="3" y1="21" x2="21" y2="21" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="5 6 12 3 19 6" />
      <line x1="5" y1="10" x2="5" y2="21" />
      <line x1="12" y1="10" x2="12" y2="21" />
      <line x1="19" y1="10" x2="19" y2="21" />
    </>
  ),
  // 💰 add_expense
  expense: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  // 🧾 add_income
  income: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  // 🎯 add_goal
  goal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  // 🔁 add_recurring
  recurring: (
    <>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  // 📊 snapshot
  chart: (
    <>
      <line x1="4" y1="20" x2="4" y2="10" />
      <line x1="10" y1="20" x2="10" y2="4" />
      <line x1="16" y1="20" x2="16" y2="14" />
      <line x1="20" y1="20" x2="4" y2="20" />
    </>
  ),
  // histórico de saldos
  history: (
    <>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <polyline points="12 7 12 12 15 14" />
    </>
  ),
  // botão "atualizar saldo" (wallet)
  balance: (
    <>
      <path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
      <circle cx="16" cy="13" r="1.5" />
    </>
  ),
  // fallback
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </>
  ),
};

export default function Icon({ name, size = 16, style, ...rest }) {
  const body = PATHS[name] || PATHS.help;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: 'middle', ...style }}
      {...rest}
    >
      {body}
    </svg>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/Icon.jsx
git commit -m "feat(components): Icon — set de icones SVG (substitui emojis)"
```

---

### Task 9: substituir os emojis do `actionLabel` por nomes de ícone + render `<Icon>`

**Files:**
- Modify: `src/views/AIView.jsx` (`actionLabel` ~117-165; render sites ~867 e ~1002)

- [ ] **Step 1: Change `actionLabel` to return icon NAMES**

In `src/views/AIView.jsx`, in `actionLabel(a)`, replace each `icon: '&#...;'` with the icon name:

- `update_balance`: `icon: 'bank',`
- `add_expense`: `icon: 'expense',`
- `add_income`: `icon: 'income',`
- `add_goal`: `icon: 'goal',`
- `add_recurring`: `icon: 'recurring',`
- `snapshot`: `icon: 'chart',`
- fallback `return { icon: 'help', lbl: ... }` (replace `icon: '?'` with `icon: 'help'`).

- [ ] **Step 2: Replace render site 1 (history list, ~867)**

Find:

```jsx
                            <H html={info.icon} /> {info.lbl}
```

Replace with:

```jsx
                            <Icon name={info.icon} size={12} /> {info.lbl}
```

- [ ] **Step 3: Replace render site 2 (import review panel, ~1002)**

Find:

```jsx
                  <H style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }} html={info.icon} />
```

Replace with:

```jsx
                  <Icon name={info.icon} size={18} style={{ flexShrink: 0 }} />
```

(The `Icon` import was added in Task 7 Step 2. If not present, add `import Icon from '../components/Icon.jsx';` near the top.)

- [ ] **Step 4: Verify**

Run: `npx vitest run` → Expected: PASS.
Run: `npm run build` → Expected: build succeeds. Grep to confirm no emoji entities remain:
`grep -n "&#1" src/views/AIView.jsx` → Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/views/AIView.jsx
git commit -m "refactor(ai): actionLabel usa nomes de icone + render via <Icon>"
```

---

## FASE D — Otimização de leituras Firebase (cache)

### Task 10: Firestore cache persistente + load cache-first

**Files:**
- Modify: `src/firebase/client.js` (imports do firestore; init do `_db`; `loadUserDoc`)

- [ ] **Step 1: Trocar a init do Firestore para cache persistente**

In `src/firebase/client.js`, replace the firestore import block:

```js
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
```

with:

```js
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
```

- [ ] **Step 2: Use `initializeFirestore` with persistent cache**

In the init `try` block, replace:

```js
    _db = getFirestore(_app);
```

with:

```js
    _db = initializeFirestore(_app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
```

- [ ] **Step 3: Make `loadUserDoc` cache-first**

Replace the existing `loadUserDoc`:

```js
export function loadUserDoc(uid) {
  if (!db || !uid) return Promise.resolve(null);
  return getDoc(doc(db, 'users', uid)).then((snap) =>
    snap.exists() ? snap.data() : null
  );
}
```

with:

```js
export function loadUserDoc(uid) {
  if (!db || !uid) return Promise.resolve(null);
  const ref = doc(db, 'users', uid);
  // Cache-first: serve from IndexedDB cache when available (0 server reads),
  // only hit the server on a cache miss. Reduces Firestore read volume.
  return getDocFromCache(ref)
    .then((snap) => (snap.exists() ? snap.data() : null))
    .catch(() => getDoc(ref).then((snap) => (snap.exists() ? snap.data() : null)));
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds (no unresolved firestore exports).

- [ ] **Step 5: Commit**

```bash
git add src/firebase/client.js
git commit -m "perf(firebase): cache persistente do Firestore + loadUserDoc cache-first"
```

---

## FASE E — Modelo de patch notes

### Task 11: `lib/patchNotes.js` + campo `lastSeenPatchVersion` no store

**Files:**
- Create: `src/lib/patchNotes.js`
- Create: `src/lib/patchNotes.test.js`
- Modify: `src/store/store.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/patchNotes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { PATCH_NOTES, LATEST_PATCH_VERSION, hasUnseenNotes } from './patchNotes.js';

describe('PATCH_NOTES', () => {
  it('is non-empty and newest-first (descending version)', () => {
    expect(PATCH_NOTES.length).toBeGreaterThan(0);
    for (let i = 1; i < PATCH_NOTES.length; i++) {
      expect(PATCH_NOTES[i - 1].version).toBeGreaterThan(PATCH_NOTES[i].version);
    }
  });
  it('each note has version, date, title, items[]', () => {
    PATCH_NOTES.forEach((n) => {
      expect(typeof n.version).toBe('number');
      expect(typeof n.date).toBe('string');
      expect(typeof n.title).toBe('string');
      expect(Array.isArray(n.items)).toBe(true);
    });
  });
});

describe('LATEST_PATCH_VERSION', () => {
  it('equals the highest version', () => {
    expect(LATEST_PATCH_VERSION).toBe(PATCH_NOTES[0].version);
  });
});

describe('hasUnseenNotes', () => {
  it('true when lastSeen < latest', () => {
    expect(hasUnseenNotes(LATEST_PATCH_VERSION - 1)).toBe(true);
  });
  it('false when lastSeen >= latest', () => {
    expect(hasUnseenNotes(LATEST_PATCH_VERSION)).toBe(false);
    expect(hasUnseenNotes(LATEST_PATCH_VERSION + 1)).toBe(false);
  });
  it('treats undefined/0 as unseen', () => {
    expect(hasUnseenNotes(undefined)).toBe(true);
    expect(hasUnseenNotes(0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/patchNotes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/patchNotes.js`:

```js
/* ════════════════════════════════════════════════════════════════════════
   Patch notes — changelog versionado em código. `version` é um inteiro
   incremental (não confundir com package.json). Mais recente primeiro.
   Para lançar novas notas: adiciona uma entrada no topo com version+1.
   ════════════════════════════════════════════════════════════════════════ */

export const PATCH_NOTES = [
  {
    version: 1,
    date: '2026-06-13',
    title: 'Atualizar saldo por print + Novidades',
    items: [
      'Novo: atualizar o saldo de uma conta a partir de um print (assistente IA).',
      'Novo: histórico de saldos datado por conta.',
      'Novo: ecrã de Novidades (patch notes).',
      'Melhoria: ícones SVG em vez de emojis.',
      'Melhoria: menos leituras ao Firebase (cache).',
    ],
  },
];

export const LATEST_PATCH_VERSION = PATCH_NOTES.reduce(
  (m, n) => (n.version > m ? n.version : m),
  0
);

// True when the user hasn't seen the latest notes yet.
export function hasUnseenNotes(lastSeenVersion) {
  return (Number(lastSeenVersion) || 0) < LATEST_PATCH_VERSION;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/patchNotes.test.js`
Expected: PASS.

- [ ] **Step 5: Add `lastSeenPatchVersion` to the store**

In `src/store/store.jsx`:

(a) In `initialPersisted()`, add after `aiInsights: null,`:

```js
    aiInsights: null,
    lastSeenPatchVersion: 0,
```

(b) In `PERSISTED_KEYS`, add after `'aiInsights',`:

```js
  'aiInsights',
  'lastSeenPatchVersion',
```

(c) In `buildPersistPayload`, add after `aiInsights: state.aiInsights || null,`:

```js
    aiInsights: state.aiInsights || null,
    lastSeenPatchVersion: Number(state.lastSeenPatchVersion) || 0,
```

(d) In `hydrateFromDoc`, add after the `aiInsights` line:

```js
    aiInsights: d.aiInsights || null,
    lastSeenPatchVersion: Number(d.lastSeenPatchVersion) || 0,
```

(e) In the `actions` useMemo, near the other scalar setters (after `setAiInsights`), add:

```js
      setLastSeenPatchVersion: (v) => setField('lastSeenPatchVersion', Number(v) || 0),
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/patchNotes.js src/lib/patchNotes.test.js src/store/store.jsx
git commit -m "feat(patch-notes): modelo de notas + lastSeenPatchVersion no store"
```

---

### Task 12: `PatchNotesSheet` + registar modal + auto-abrir + entrada no menu

**Files:**
- Create: `src/modals/PatchNotesSheet.jsx`
- Modify: `src/store/ui.jsx` (add `'patchNotes'` modal key)
- Modify: `src/components/Shell.jsx` (mount + auto-open effect)
- Modify: `src/modals/MoreMenu.jsx` (entrada "Novidades")

- [ ] **Step 1: Create the sheet**

Create `src/modals/PatchNotesSheet.jsx`:

```jsx
/* ════════════════════════════════════════════════════════════════════════
   PatchNotesSheet — "Novidades". Lista PATCH_NOTES; ao fechar marca a versao
   mais recente como vista (lastSeenPatchVersion). useModal('patchNotes').
   ════════════════════════════════════════════════════════════════════════ */

import React, { useCallback } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { PATCH_NOTES, LATEST_PATCH_VERSION } from '../lib/patchNotes.js';
import { formatReadingDate } from '../lib/balances.js';

export default function PatchNotesSheet() {
  const { isOpen, close } = useModal('patchNotes');
  const { state, actions } = useStore();

  const onClose = useCallback(() => {
    if ((Number(state.lastSeenPatchVersion) || 0) < LATEST_PATCH_VERSION) {
      actions.setLastSeenPatchVersion(LATEST_PATCH_VERSION);
    }
    close();
  }, [state.lastSeenPatchVersion, actions, close]);

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onClose={onClose} title="Novidades">
      {PATCH_NOTES.map((n) => (
        <div key={n.version} style={{ marginBottom: 18 }}>
          <div className="rw" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{n.title}</div>
            <span className="m" style={{ fontSize: 10, color: 'var(--text3)' }}>{formatReadingDate(n.date)}</span>
          </div>
          {n.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 13, color: 'var(--text)' }}>
              <span style={{ color: 'var(--blue)' }}>&bull;</span>
              <span>{it}</span>
            </div>
          ))}
        </div>
      ))}
      <button type="button" onClick={onClose} style={{ width: '100%', padding: '14px 0', border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontSize: 14, fontWeight: 600, borderRadius: 999, marginTop: 6 }}>
        Percebido
      </button>
    </Sheet>
  );
}
```

- [ ] **Step 2: Register the modal key**

In `src/store/ui.jsx`, in `MODALS`, add after `'balanceHistory',`:

```js
  'balanceHistory', // historico de saldos de uma conta
  'patchNotes',     // novidades / changelog
```

- [ ] **Step 3: Mount + auto-open in Shell**

In `src/components/Shell.jsx`:

(a) Add imports after the `BalanceHistorySheet` import:

```js
import BalanceHistorySheet from '../modals/BalanceHistorySheet.jsx';
import PatchNotesSheet from '../modals/PatchNotesSheet.jsx';
```

(b) Add a `useEffect` that auto-opens patch notes once for users with data. Near the top of the `Shell` component body (after the hooks that obtain `state`, `currentUser`/store and `useUI`), add. First ensure these imports exist at the top of the file:

```js
import { useEffect, useRef } from 'react';
import { hasUnseenNotes } from '../lib/patchNotes.js';
import { isNewUser } from '../lib/finance.js';
```

(If `react` is imported as `import React from 'react';`, change to `import React, { useEffect, useRef } from 'react';`. If `useUI`/`useStore` are already destructured in Shell, reuse them; otherwise add `const { state, currentUser } = useStore();` and `const ui = useUI();` — check existing Shell code and DO NOT duplicate.)

Add the effect:

```js
  const patchChecked = useRef(false);
  useEffect(() => {
    if (patchChecked.current) return;
    if (!currentUser) return;
    patchChecked.current = true;
    if (!isNewUser(state) && hasUnseenNotes(state.lastSeenPatchVersion)) {
      ui.open('patchNotes');
    }
  }, [currentUser, state, ui]);
```

(c) In the render block, after `<BalanceHistorySheet />`, add:

```jsx
      <BalanceHistorySheet />
      <PatchNotesSheet />
```

- [ ] **Step 4: Add "Novidades" entry in MoreMenu**

In `src/modals/MoreMenu.jsx`, add a button between the Definicoes button and the final "Fechar" cancel button (after the `</button>` that closes the Definicoes `sheet-item`):

```jsx
        <button className="sheet-item" type="button" onClick={() => { close(); ui.open('patchNotes'); }}>
          <div className="sheet-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z" />
            </svg>
          </div>
          <div className="sheet-text">
            <div className="sheet-text-title">Novidades</div>
            <div className="sheet-text-sub">O que mudou nesta versao</div>
          </div>
          {Chevron}
        </button>
```

- [ ] **Step 5: Verify**

Run: `npx vitest run` → Expected: PASS.
Run: `npm run build` → Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/modals/PatchNotesSheet.jsx src/store/ui.jsx src/components/Shell.jsx src/modals/MoreMenu.jsx
git commit -m "feat(patch-notes): PatchNotesSheet, auto-abrir e entrada no menu"
```

---

## Verificação manual final (Fase A+B+C+D+E)

- [ ] `npm run dev`, autenticar.
- [ ] Tab IA → "Atualizar saldo de uma conta" → escolher Activobank · Conta a Ordem → "Introduzir manualmente" → valor 1300, data 2026-05-01 → Confirmar. Repetir com 750 / 2026-05-30.
- [ ] Overview → Liquidez → linha Activobank → botão histórico → ver `01/05/2026 — 1.300,00 EUR` e `30/05/2026 — 750,00 EUR` com variação `-550,00 EUR`.
- [ ] Confirmar que o saldo da conta no Overview reflete 750 e "Atualizado 2026.05.30".
- [ ] (Com API key) repetir usando um print real via Câmara/Ficheiro; confirmar que a AI preenche o valor.
- [ ] Tab IA → importar um documento que gere ações → confirmar que os ícones aparecem como SVG (não emoji).
- [ ] Recarregar a app já autenticado → no separador Network/DevTools, confirmar que não há nova leitura de servidor do doc `users/{uid}` (servido da cache).
- [ ] Primeiro arranque após esta versão (com dados) → abre automaticamente "Novidades"; fechar → não reaparece em recargas. Menu "Mais" → "Novidades" reabre.

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- Fluxo dedicado no assistente IA → Task 5 + Task 7 (botão).
- Seleção manual da conta (templates + custom) → Task 2 (`listAccounts`) + Task 5 (select).
- AI lê só o valor → Task 2 (`BALANCE_PROMPT`, `parseBalanceResult`) + Task 5.
- Campo de data por leitura → Task 5 (input date).
- Histórico datado persistido → Task 3 (`balanceLog`, `addBalanceReading`) + Task 1 (`addReading`/`accountHistory`).
- Lista de histórico → Task 6 (`BalanceHistorySheet`) + Task 7 (botão na OverviewView).
- Saldo vivo atualizado (template vs custom) → Task 3 (`addBalanceReading`).
- Remover emojis / usar ícones → Task 8 (`Icon`) + Task 9 (substituição).

**Placeholder scan:** sem TBD/TODO; todo o código está inline.

**Type consistency:** `acctKey` derivado igual em `balanceAcctKey`, `addBalanceReading` e nos botões (`custom ? id : bank+'_'+type`). `account` (shape de `listAccounts`) é o mesmo objeto passado a `addBalanceReading`. `info.icon` passou de entidade HTML para nome de ícone, consumido por `<Icon name>`.
