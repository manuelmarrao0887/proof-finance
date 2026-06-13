# PROOF. Finance (React) — Store & Lib API

Handoff reference for the stages that port the views/modals. It documents the
store shape, the `useStore()` API, every action creator, the `lib/*` exports,
and the className conventions. **Read this before writing any view.**

The original vanilla-JS app is mirrored 1:1 where possible: class names match,
finance math is verbatim, and the persisted Firestore field list is identical.

---

## 1. Store shape

The store lives in `src/store/store.jsx` (React Context + `useReducer`). It holds
the **persisted slice** (exactly the Firestore `users/{uid}` doc) plus a couple
of runtime fields.

### Persisted slice (auto-saved to Firestore)
```js
{
  apiKey: '',                                  // Anthropic API key (user-supplied)
  aiHistory: [],                               // chat/import log; capped at last 20 on save
  dynAccts: null,                              // {"Bank_Type": {v,d,n}} balance overrides | null
  dynSnaps: [],                                // net-worth snapshots {l,liq,poup,inv,div,xP,xT,tC}
  addedExp: [],                                // expenses {desc,amount(+),cat,date,shared?,total?,split?,tags?,notes?}
  theme: 'system',                             // 'light' | 'dark' | 'system'
  goals: [],                                   // {id,name,target,current,deadline,color,createdAt}
  recurring: [],                               // {id,name,amount,day,cat,createdAt}
  incomes: [],                                 // {id,name,amount,source,recurring,day,date,createdAt}
  bdg: [...16 defaults...],                    // categories {id,nm,lm}; defaults seeded when empty
  customAccts: [],                             // {id,bank,type,category,value,currency,note,updated,createdAt}
  rules: [],                                   // {id,pattern,cat,createdAt}
  forecastMonths: 3,                           // cash-flow horizon (1|3|6|12)
  fxRates: { EUR:1, USD:1.08, GBP:0.85, BRL:5.5 },
  aiInsights: null,
}
```
`PERSISTED_KEYS` (exported) is the canonical list of the 15 persisted field names.

### Runtime fields (NOT persisted — live in the store but never written)
```js
{ em: 3 }   // expense-month index 0..4 (default 3 = current partial month).
            // Used by finance.monthlySummary. Set via actions.setEm(n).
```

All other transient UI state (active `tab`, modal flags, drafts, `stResult`,
`searchQuery`, `tagFilter`, `calOffset`, etc.) is **NOT** in the store — keep it
in component-local `useState` (matches the map's guidance).

### Hydration / persistence helpers (exported, also used internally)
- `initialPersisted()` → fresh persisted slice with defaults.
- `defaultBdg()` → the 16 default categories (fresh copy).
- `hydrateFromDoc(d)` → persisted slice from a loaded doc (or `null`), applying
  the original type guards: `Array.isArray` checks; **`bdg` only replaced if the
  saved array is non-empty**; **`fxRates` merged onto `{EUR:1}`**.
- `buildPersistPayload(state)` → the exact object written to Firestore
  (`aiHistory` sliced to last 20; same fallbacks as the original `persistUser`).
- `applyTheme(t)` → sets `<html data-theme>` + `<meta theme-color>` (orig 310).

---

## 2. `useStore()` API

```js
import { useStore } from '../store/store.jsx';

const { state, dispatch, actions, currentUser, preview, syncStatus } = useStore();
```

| Field | Type | Notes |
|---|---|---|
| `state` | object | persisted slice + `em`. Read everything from here. |
| `dispatch` | fn | low-level reducer dispatch (rarely needed; prefer `actions`). |
| `actions` | object | the action creators (see §3). |
| `currentUser` | Firebase user \| null | `null` = preview/demo mode. |
| `preview` | bool | `!currentUser`. Pass into `lib/finance` fns that branch on mode. |
| `syncStatus` | string | `'idle'|'saving'|'saved'|'error'` — drive the sync chip. |

### `useAuth()` (thin auth slice, used by `App`)
```js
const { currentUser, setCurrentUser, loadUser, resetUser } = useAuth();
```

### Auto-persistence (important)
A Provider effect watches the persisted slice. **Any mutation via an action
auto-saves (debounced 400 ms) when authed** — you do **not** call `persistUser()`
after every edit (the original had to). It is still exposed for explicit flushes.
The save right after `loadUser`/`resetUser` is intentionally suppressed.

---

## 3. Action creators (`actions.*`)

All are stable (memoized). Slice setters dispatch a patch; the auto-persist
effect handles saving. `actions.getState()` returns the latest state (for
read-modify-write inside a handler without stale closures).

### Generic
- `patch(partial)` — shallow-merge a partial into state.
- `setField(key, value)` — set one field.
- `getState()` — latest state snapshot.
- `persistUser()` — force a debounced save (normally automatic).
- `loadUser(uid)` — thunk: getDoc → hydrate (guards) → `applyTheme`.
- `resetUser()` — reset persisted slice to defaults (sign-out).

### Scalars / misc
- `setApiKey(str)`
- `setTheme(theme)` — also calls `applyTheme` immediately (orig 317).
- `setForecastMonths(n)`
- `setDynAccts(obj)`, `setDynSnaps(arr)`
- `setFxRates(obj)`, `setAiInsights(obj)`
- `setAiHistory(arr)`, `pushAiHistory(entry)` — push + cap at last 20.
- `setEm(n)` — runtime expense-month index (not persisted).

### Expenses (`addedExp`)
- `setAddedExp(arr)` — replace whole list (use for import commit + bulk re-key).
- `addExpense(exp)`
- `updateExpense(idx, partial)` — by index.
- `deleteExpense(idx)` — by index.

> **FIX 1 (same-beneficiary classify):** when a category `<select>` changes on an
> expense/import row, build the new list with
> `applySameBeneficiaryCategory(list, idx, cat, 'cat')` (for `addedExp`) or
> `(list, idx, cat, 'category')` (for the import `stResult.transactions`), then
> `setAddedExp(newList)` / set local state. Do **not** re-sort on classify (FIX 2).

### Categories (`bdg`)
- `setBdg(arr)`
- `addCategory(cat)` / `updateCategory(id, partial)` / `deleteCategory(id)`
- Render pickers with `sortedCats(state.bdg)` (FIX 3 — alphabetical).

### Goals / Recurring / Incomes / Custom accounts / Rules
Each collection has the same trio plus a bulk setter:
- Goals: `setGoals`, `addGoal`, `updateGoal(id,…)`, `deleteGoal(id)`
- Recurring: `setRecurring`, `addRecurring`, `updateRecurring(id,…)`, `deleteRecurring(id)`
- Incomes: `setIncomes`, `addIncome`, `updateIncome(id,…)`, `deleteIncome(id)`
- Custom accounts: `setCustomAccts`, `addCustomAcct`, `updateCustomAcct(id,…)`, `deleteCustomAcct(id)`
- Rules: `setRules`, `addRule`, `deleteRule(id)`

> Generate ids with `uid()` from `lib/format`. Goals/recurring/incomes/accts/rules
> all carry an `id`; update/delete are by `id`. Expenses are by **index** (the
> original keyed them positionally).

---

## 4. `lib/*` module exports

### `lib/format.js` (verbatim, orig 303-307)
- `fm(v)` → `"1.234,56 EUR"` (pt-PT, 2dp)
- `fk(v)` → `"12.3k"` if ≥10000 else `fm(v)`
- `fc(v)` → `"1.234 EUR"` (0dp)
- `uid()` → short random id
- (`e()` dropped — JSX escapes.)

### `lib/finance.js` — **every fn takes an explicit `state` object**
Pass `{ ...state, currentUser }` so mode-branching works. `state.currentUser`
truthy = authenticated; falsy = preview (demo seed data). The relevant slices
read are: `dynAccts, dynSnaps, addedExp, incomes, recurring, goals, bdg,
customAccts, rules, em, forecastMonths`.

- `compute(state)` → `{accts,hist,grp,cT,tA,nW,pp,aD,loan}`
- `getByC(state)`, `getSal(state)`, `getLoan(state)`, `getAccts(state)`, `getAllHist(state)`
- `isPreviewMode(state)`, `isNewUser(state)`
- `cashFlowProjection(state, months?)` (defaults to `state.forecastMonths`)
- `detectSubscriptions(state)` → top-5 candidates
- `applyRules(state, desc)` → catId | null
- `healthScore(state)` → `{score,grade,breakdown[],recommendations[]}`
- `emergencyFund(state)` → `{safe,avgMonthly,months}`
- `monthlySummary(state)` → `{inc,exp,saved,rate}`
- `chrt(data, color, label, histData?, fmFn?)` → **SVG HTML string** (render with
  `dangerouslySetInnerHTML`, or reimplement as JSX later). Pass `getAllHist(state)`
  as `histData` and `fm` as `fmFn`.
- Seed exports: `accts, ln, bdgDefault, byC, txn, sal, hist, cCol`.

> Convenience: `const state = useStore().state; const s = { ...state, currentUser };`
> then call e.g. `compute(s)`. (Or thread `currentUser` into the object you pass.)

### `lib/categories.js`
- `sortedCats(bdg)` → `[...bdg].sort((a,b)=>a.nm.localeCompare(b.nm,'pt'))`. **Use in
  EVERY category picker** (FIX 3).

### `lib/dedupe.js`
- `normalizeDesc(desc)` → lowercase/trim/collapse-whitespace (orig 693).
- `applySameBeneficiaryCategory(list, idx, cat, keyName='category')` → NEW list with
  every row whose `normalizeDesc(desc)` matches `list[idx]` set to `cat`. Use
  `keyName='cat'` for `addedExp`, `'category'` for import transactions (FIX 1).

### `lib/ai.js`
- `callAI(content, system, apiKey, onResult)` → POST to Anthropic Messages,
  model `claude-haiku-4-5`, max_tokens 16000, with JSON extraction + truncation
  repair. `content` is the user message's content-block array; **append the task
  prompt** as a `{type:'text', text: PROMPT}` block (as the original did).
- Prompts: `STMT_PROMPT`, `RCPT_PROMPT`, `AI_IMPORT_PROMPT`, `JSON_SYSTEM`.
- Files: `resizeImg(file,maxW?)`, `readFileB64(file)`, `parseExcel(file)` (xlsx).
- `buildAIContext(state)` — **stub**; fill in a later stage (orig 2554).

### `firebase/client.js`
- `auth`, `db`, `IS_FILE`, `initError`.
- `signInEmail`, `registerEmail` (min 6), `signInGoogle`, `signOutUser`,
  `setAuthPersistenceLocal`, `onAuth(cb)`.
- `loadUserDoc(uid)` → data | null; `saveUserDoc(uid, data)` → setDoc merge:true
  with `serverTimestamp() updatedAt`.

---

## 5. Shared components

- `components/Sheet.jsx` — `<Sheet open onClose title footer>{children}</Sheet>`.
  Bottom-sheet shell with a dedicated `.scroll-body` scroll body (mouse-wheel
  works — FIX 4) and pointer/touch drag-to-dismiss from the top/grip. **Use this
  for every modal/sheet.** Put long content as `children`; sticky actions as `footer`.
- `components/Toast.jsx` — `ToastProvider` (mounted in `main.jsx`) + `useToast()`
  → `toast(msg, type)` where `type ∈ 'success'|'error'|undefined`. Inline SVG icons.
- `components/Login.jsx` — full login screen (done).
- `components/Shell.jsx` — header + tab `<main>` + bottom nav. **Tabs render
  placeholders** (`<div className="empty">Em construção: …</div>`); replace each
  with the real view. The 9 tab keys: `overview, expenses, goals, cal, income,
  rec, charts, loan, ai`. `tab` is local state in `Shell`.
- `App.jsx` — auth gate (`loading` → `<Login/>` → `<Shell/>`), wires `onAuth` +
  `setAuthPersistenceLocal` + `loadUser`, plus the `file://`/init fatal screen.

---

## 6. className / styling conventions

Tokens + utilities live in `src/styles/tokens.css` (copied from the original).
Class names map **1:1** to the original so view HTML ports directly to JSX
`className`. Key ones:

`.m` (mono numeric) · `.lb` (label) · `.cd` (card) · `.cs` (signal card) ·
`.rw` (space-between row) · `.g2` / `.g3` (grids) · `.tab-bar` / `.tb` / `.tb.on` ·
`.exp-btn` / `.exp-detail` · `.bar` / `.bar-fill` · `.ms-bar` / `.ms` / `.ms.on` ·
`.hero` · `.chip` (+`.up`/`.down`/`.up-solid`/`.down-solid`) · `.icon-btn` ·
`.skel` · `.toast*` · `.ring-wrap`/`.ring-bg`/`.ring-fg` · `.empty` ·
`.bnav`/`.bnav-btn`/`.bnav-center`/`.fab` · `.sync-chip*`/`.sync-dot` ·
`.sheet-overlay`/`.sheet-panel`/`.sheet-grip`/`.sheet-item`/`.sheet-icon`/
`.sheet-text*`/`.sheet-cancel` · `.crumb` · `.has-bnav` · `.app-header`.

Animations: `.fadeUp`, `.fadeIn`, `.slideInR`, `.slideInL` (keyframes `fadeUp`,
`fadeIn`, `slideUp`, `slideInRight`, `slideInLeft`, `shimmer`, `pulse`).

**Scroll fix (FIX 4):** `overscroll-behavior`/`touch-action` are NOT on
`html,body`. Use the **`.scroll-body`** helper on any element that should own its
own scroll (the page `<main>` and the `Sheet` scroll body already do). Body keeps
`overflow-x:hidden` and scrolls vertically normally.

**Icons:** inline SVG only — no emoji (matches the original).

CSS variables (Eclipse): `--bg,--surface,--elevated,--border,--border-strong,
--fg,--fg-muted,--fg-subtle,--accent,--bg-glass`; feedback `--success,--warning,
--danger,--info`; legacy aliases `--bg2/3,--text/2/3,--border2,--signal*,--blue*`,
etc.; `--font` (Geist), `--mono` (Geist Mono); radii `--r/--r2/--r3`; shadows;
safe-area `--safe-*`, `--nav-h`; easings `--ease-ios*`. Dark via
`html[data-theme="dark"]`.

---

## 7. The 4 fixes — where they land in later stages

1. **Same-beneficiary auto-classify** — import-statement row + expense-row
   category change: `applySameBeneficiaryCategory(...)` (`lib/dedupe`).
2. **No jump-to-top after classify** — render lists with stable React keys and a
   frozen order; only re-sort on an explicit user control (never on classify).
3. **Alphabetical categories** — every picker uses `sortedCats(state.bdg)`.
4. **Mouse-wheel scroll** — use `<Sheet/>` (its `.scroll-body` owns the scroll)
   and the `.scroll-body` helper on scroll containers.
