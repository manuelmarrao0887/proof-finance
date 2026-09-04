# Evidence — Visual + Accessibility Audit (Proof Finance)

Scope: `src/styles/tokens.css`, `src/views/OverviewView.jsx`, `ExpensesView.jsx`, `GoalsView.jsx`, `CardsView.jsx` (Part A). Part B additionally touches `src/components/Sheet.jsx`, `src/modals/AddExpenseSheet.jsx`, `AcctModal.jsx`, `GoalModal.jsx`, `RecModal.jsx`, `src/modals/MoreMenu.jsx`, `ActionSheet.jsx`, `index.html`, `scripts/a11y.mjs`.

---

## 1. Sources consulted

- `src/styles/tokens.css` (full file, 316 lines)
- `src/views/OverviewView.jsx` (959 lines), `ExpensesView.jsx` (817 lines), `GoalsView.jsx` (246 lines), `CardsView.jsx` (180 lines) — full files scanned via grep + manual line reads
- `index.html` (full file)
- `scripts/a11y.mjs` (full file) — executed
- `src/components/Sheet.jsx` (full file)
- `src/components/Avatar.jsx`, `src/components/MerchantLogo.jsx`, `src/components/CategoryIcon.jsx`, `src/components/Icon.jsx` (full files)
- `src/components/Shell.jsx` (relevant sections: 140-330)
- `src/store/store.jsx` (relevant section: 100-120, `applyTheme`)
- `src/modals/AddExpenseSheet.jsx`, `AcctModal.jsx`, `GoalModal.jsx`, `RecModal.jsx`, `MoreMenu.jsx`, `ActionSheet.jsx` (targeted line reads)
- `dev.html`, `src/devPreview.jsx` (full files)
- Commands run:
  - `grep -n`/`grep -oE` sweeps for `padding`/`margin`/`gap`/`fontSize`/`borderRadius`/color literals across the four views and `tokens.css`
  - Two custom Node scripts (`extract.mjs`, `contrast.mjs`) written to the scratchpad to tabulate numeric spacing/type/radius values and compute WCAG contrast ratios from the literal token hex values
  - `npx vite --port 5199` (background dev server), then `node scripts/a11y.mjs` (axe-core via puppeteer-core + local Chrome)
  - Two ad-hoc puppeteer scripts (run from inside the repo so `node_modules` resolved): one for focus-order/landmark inspection on `?tab=overview`
  - Static regex scan (`iconbuttons_all.mjs`) across `src/views`, `src/components`, `src/modals` for `<button>` blocks containing only an SVG/`<Icon>` with no `aria-label`/`title`

---

## 2. Part A findings

### A1. Spacing scale observed (padding/margin/gap, px, four views + tokens.css)

No `--space-*` (or `--spacing-*`/`--gap-*`) custom-property scale exists anywhere in `tokens.css` (grep for `--space|--spacing|--gap` → 0 matches). All spacing is literal per-declaration.

Distinct **px** values found in `padding*/margin*/gap` across the four views (19 distinct values):

| px | count | example |
|---|---|---|
| 0 | 25 | `OverviewView.jsx:255` `padding:'0 20px 24px'` |
| 1 | 8 | `ExpensesView.jsx:291` `padding:'1px 5px'` |
| 2 | 13 | `OverviewView.jsx:285` `gap:2` |
| 3 | 2 | `ExpensesView.jsx:697` `gap:3`; `GoalsView.jsx:121` `padding:'3px 9px'` |
| 4 | 32 | `OverviewView.jsx:347` `marginBottom:4` |
| 5 | 7 | `ExpensesView.jsx:229` `padding:'5px 10px'` |
| 6 | 35 | `OverviewView.jsx:311` `marginBottom:6` |
| 7 | 2 | `OverviewView.jsx:434` `gap:7`; `ExpensesView.jsx:630` `padding:'7px 12px'` |
| 8 | 38 | `OverviewView.jsx:280` `gap:8` |
| 9 | 2 | `OverviewView.jsx:559` `padding:'9px 0'`; `GoalsView.jsx:121` `padding:'3px 9px'` |
| 10 | 45 | `OverviewView.jsx:318` `marginBottom:10` |
| 11 | 1 | `OverviewView.jsx:453` `padding:'11px 0'` |
| 12 | 27 | `OverviewView.jsx:384` `gap:12` |
| 14 | 28 | `OverviewView.jsx:276` `padding:'14px 18px'` |
| 16 | 25 | `OverviewView.jsx:302` `marginBottom:16` |
| 18 | 14 | `OverviewView.jsx:338` `padding:'18px 20px'` |
| 20 | 17 | `OverviewView.jsx:255` `padding:'0 20px 24px'` |
| 24 | 5 | `OverviewView.jsx:255` `padding:'0 20px 24px'` |
| 40 | 5 | `ExpensesView.jsx:209` `padding:'12px 40px'` |

Same scan of `tokens.css` utility classes yields the same kind of unstructured literal set (3, 4, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24 px all present, e.g. `.cd{padding:20px}` line 141, `.tb{padding:9px 4px}` line 147, `.hero{padding:24px}` line 160). No token abstracts this scale; every rule hardcodes its own numbers. Values are not consistently on a 4pt or 8pt grid — 1, 3, 5, 7, 9, 11, 14, 18 all occur, breaking any implied 2/4/8 base grid.

### A2. Type scale observed

Distinct `fontSize` values across the four views (16 distinct values):

| px | count | example |
|---|---|---|
| 9 | 2 | `ExpensesView.jsx:697`; `GoalsView.jsx:198` |
| 10 | 11 | `OverviewView.jsx:704`; `ExpensesView.jsx:267` |
| 10.5 | 1 | `CardsView.jsx:83` |
| 11 | 65 | `OverviewView.jsx:282` (dominant "small text" size) |
| 12 | 27 | `OverviewView.jsx:315` |
| 13 | 19 | `OverviewView.jsx:351` |
| 14 | 8 | `OverviewView.jsx:287` |
| 15 | 5 | `OverviewView.jsx:599` |
| 16 | 3 | `OverviewView.jsx:577`; `ExpensesView.jsx:209` (input font-size, iOS zoom-safe) |
| 17 | 1 | `OverviewView.jsx:886` |
| 18 | 3 | `ExpensesView.jsx:215`; `GoalsView.jsx:185` |
| 24 | 2 | `ExpensesView.jsx:597`; `CardsView.jsx:89` |
| 26 | 1 | `OverviewView.jsx:312` |
| 30 | 1 | `OverviewView.jsx:769` |
| 32 | 1 | `OverviewView.jsx:639` |
| 34 | 2 | `OverviewView.jsx:348`; `OverviewView.jsx:546` |

`tokens.css` itself declares 8 distinct literal font-sizes in utility classes (10, 10.5, 11, 12, 13, 14, 15, 16px) plus the global `input,select,textarea{font-size:16px}` rule (`tokens.css:117-118`, kept at 16px specifically to block iOS auto-zoom). No `--fs-*`/`--text-*`/`--h1` etc. custom-property type scale exists anywhere (grep for `--fs|--text-|--type|--h[1-6]|--title|--body|--caption` → only unrelated aliases `--text`/`--text2`/`--text3`, which are color aliases, not size tokens). Every fontSize is a hand-picked literal.

**Font families** (`tokens.css:59-60`):
```
--font:'Plus Jakarta Sans','Inter',-apple-system,'Helvetica Neue',sans-serif;
--mono:'Plus Jakarta Sans','Inter',-apple-system,sans-serif;
```
`--mono` is **not** a monospace typeface — it resolves to the identical primary face (`Plus Jakarta Sans`) as `--font`, with no `monospace` generic fallback and no actual mono font (e.g. SF Mono/Roboto Mono/ui-monospace) anywhere in the stack. The `.m` utility class that uses `--mono` (`tokens.css:139`) relies on `font-variant-numeric:tabular-nums` for digit alignment rather than true character-width monospacing.

### A3. Radius scale observed

Declared token scale exists (`tokens.css:62`): `--r:20px;--r2:16px;--r3:12px;--r4:8px;` — but it is barely used. Only one usage of the tokens found in the four views: `OverviewView.jsx:870` `borderRadius: isX ? 'var(--r) var(--r) 0 0' : 'var(--r)'`. Everywhere else (including inside `tokens.css` itself) radii are hardcoded literals that don't map onto `--r/--r2/--r3/--r4`.

Distinct literal `borderRadius` px values found in the four views: **0, 2, 4, 8, 10, 12, 14, 999** (8 distinct values; `999` used ~17 times as the "pill" idiom). `tokens.css` itself additionally uses 3, 6, 11, 16, 18, 24px and `50%` in various rules (e.g. `.tb{border-radius:11px}` line 147, `.hero{border-radius:24px}` line 160, `.sheet-panel{border-radius:18px 18px 0 0}` line 226) — none of which equal 20/16/12/8 (the declared `--r*` values), so the declared scale and the values actually shipped diverge.

### A4. Distinct colour count

**Light block** (`tokens.css:12-75`, `:root`): **33** distinct literal colours (19 hex + 11 rgba + `rgba(255,255,255,0.82)` etc.):
`#0a1633 #12b3a6 #137845 #2149c4 #2a5be0 #3b6fee #3fc97a #535c6d #5f6a81 #6b4fd6 #7b5fe0 #9aa3b5 #9c5e00 #c42a2a #d5dae6 #e6e9f0 #eef1f8 #f25555 #f25592 #f4f6fa #f5a623 #ffffff` + 11 `rgba(...)` literals.

**Dark block** (`tokens.css:76-105`, `html[data-theme="dark"]`): **24** distinct literal colours: `#0a1024 #121a33 #1a2440 #26314f #344063 #3b6fee #4cd98a #5b85f2 #5f6b89 #7b5fe0 #8792b0 #9a82f0 #9aa6c0 #eef2fb #f47878 #f7b955` + 8 `rgba(...)` literals.

Rest of `tokens.css` (utility classes, lines 106-316, theme-independent): `#1B1F2E #2D3453 #fff` plus 6 more `rgba(...)` literals (e.g. `rgba(0,0,0,.7)`, `rgba(11,18,32,0.40)`).

**Hard-coded colour literals in the four views** (outside `var(--token)`), 10 occurrences:
- `src/views/CardsView.jsx:88` — `rgba(255,255,255,0.65)` (label "Dívida atual" text on the fixed-dark `.ccard` gradient)
- `src/views/CardsView.jsx:89` — `#fff` (debt amount text, same dark card)
- `src/views/OverviewView.jsx:369` — `rgba(229,57,53,0.08)` as fallback inside `var(--signal-soft, rgba(229,57,53,0.08))`
- `src/views/OverviewView.jsx:424` — `#7b5fe0` as fallback inside `var(--purple, #7b5fe0)`
- `src/views/OverviewView.jsx:430` — same fallback repeated in the breakdown legend array
- `src/views/OverviewView.jsx:733` — `#fff` (chip text on `var(--primary)` background)
- `src/views/OverviewView.jsx:766` — `#fff` (chip text on a dynamic `efColor` background — contrast depends on which tone is picked at runtime, not statically verifiable)
- `src/views/GoalsView.jsx:100` — `#3b6fee` fallback: `const c = g.color || '#3b6fee'`
- `src/views/GoalsView.jsx:198` — `rgba(63,201,122,0.12)` as fallback inside `var(--success-soft, rgba(63,201,122,0.12))`
- `src/views/ExpensesView.jsx:677` — `#f5a623` literal (budget-bar mid-tone: `r.pct > 75 ? '#f5a623' : 'var(--text)'`) — not theme-aware, doesn't shift for dark mode

All `var(--x, #fallback)` fallbacks are effectively dead code (the tokens are always defined in `:root`), but they are still literal colour values living outside the token file.

### A5. Contrast ratios (computed from literal token hex values, sRGB relative luminance)

LIGHT theme:

| Pair | fg | bg | Ratio | AA-normal (4.5:1) | AA-large (3:1) |
|---|---|---|---|---|---|
| `--fg` on `--bg` | #0a1633 | #ffffff | 17.87:1 | PASS | PASS |
| `--fg` on `--surface` | #0a1633 | #f4f6fa | 16.51:1 | PASS | PASS |
| `--fg-muted` on `--surface` | #535c6d | #f4f6fa | 6.22:1 | PASS | PASS |
| `--fg-subtle` on `--surface` | #5f6a81 | #f4f6fa | 5.02:1 | PASS | PASS |
| `--fg-subtle` on `--elevated` | #5f6a81 | #eef1f8 | 4.81:1 | PASS | PASS |
| `--primary` (as text) on `--bg` | #2a5be0 | #ffffff | 5.72:1 | PASS | PASS |
| `#fff` on `--primary` (button text) | #ffffff | #2a5be0 | 5.72:1 | PASS | PASS |
| `--success` on `--surface` | #137845 | #f4f6fa | 5.11:1 | PASS | PASS |
| `--danger` on `--surface` | #c42a2a | #f4f6fa | 5.23:1 | PASS | PASS |
| `--warning` on `--surface` | #9c5e00 | #f4f6fa | 4.83:1 | PASS | PASS |
| white on `.hero` gradient midpoint (#5b67e7) | #ffffff | #5b67e7 | 4.63:1 | PASS | PASS |
| white on `.ccard` gradient midpoint (#242a41) | #ffffff | #242a41 | 14.16:1 | PASS | PASS |

DARK theme:

| Pair | fg | bg | Ratio | AA-normal (4.5:1) | AA-large (3:1) |
|---|---|---|---|---|---|
| `--fg` on `--bg` | #eef2fb | #0a1024 | 16.84:1 | PASS | PASS |
| `--fg` on `--surface` | #eef2fb | #121a33 | 15.34:1 | PASS | PASS |
| `--fg-muted` on `--surface` | #9aa6c0 | #121a33 | 7.03:1 | PASS | PASS |
| `--fg-subtle` on `--surface` | #8792b0 | #121a33 | 5.54:1 | PASS | PASS |
| `--fg-subtle` on `--elevated` | #8792b0 | #1a2440 | 4.94:1 | PASS | PASS |
| `--primary` (as text) on `--bg` | #5b85f2 | #0a1024 | 5.47:1 | PASS | PASS |
| **`#fff` on `--primary` (button text)** | #ffffff | #5b85f2 | **3.45:1** | **FAIL** | PASS |
| `--success` on `--surface` | #4cd98a | #121a33 | 9.50:1 | PASS | PASS |
| `--danger` on `--surface` | #f47878 | #121a33 | 6.39:1 | PASS | PASS |
| `--warning` on `--surface` | #f7b955 | #121a33 | 9.85:1 | PASS | PASS |
| white on `.hero` gradient midpoint (#5b67e7) | #ffffff | #5b67e7 | 4.63:1 | PASS | PASS |
| white on `.ccard` gradient midpoint (#242a41) | #ffffff | #242a41 | 14.16:1 | PASS | PASS |

Only failing pair: **white text on `--primary` in dark mode = 3.45:1**, fails AA-normal (used by e.g. `.tb.on`, `.ms.on` tab-bar/month-selector active labels at 11-12px, and the primary CTA buttons' white label text in the four views, e.g. `OverviewView.jsx:405,453`, `CardsView.jsx:123` — all render below the 18.66px-bold/24px "large text" threshold, so this is a real AA-normal failure in dark mode only). `.hero` gradient white text sits at 4.63:1, just above the 4.5:1 threshold — a low margin, identical in both themes since `--grad-hero` is not re-themed (`tokens.css:55` vs `:101`, same two stops).

### A6. Smallest text sizes in use (≤11px) in the four views

Count ≤11px: **79** occurrences (11px: 65 + 10.5px: 1 + 10px: 11 + 9px: 2 = 79).
Count ≤10px: **13** (10.5px is excluded since 10.5 > 10 ⇒ 10px: 11 + 9px: 2 = 13).
Count ≤9px: **2** — `ExpensesView.jsx:697` (rollover "carried" badge text) and `GoalsView.jsx:198` ("REFORÇADA ESTE MÊS" badge text).

Representative ≤10px labels (file:line — what it labels):
- `GoalsView.jsx:198` (9px) — "REFORÇADA ESTE MÊS" achievement badge
- `ExpensesView.jsx:697` (9px) — rollover carried-amount badge
- `CardsView.jsx:83` (10.5px) — "Crédito" label on the card face
- `CardsView.jsx:88,97,108,132,146,154,163` (10px) — card sub-labels (debt, plafond, payment dates, section labels)
- `OverviewView.jsx:642,704,816,824` (10-11px range) — health-score unit label, subscription sub-date, cashflow chart day labels
- `ExpensesView.jsx:267,296,763` (10px) — search avg/mês note, group-expense chip
- Full 11px list dominates most secondary/meta text across all four views (65 instances) — this is effectively the app's de-facto "caption" size, used for dates, sub-labels, helper text, and badges throughout.

### A7. Touch targets below 44×44px

CSS-class-level declarations in `tokens.css` (apply everywhere the class is used, including the four views):
1. `.icon-btn` — **36×36px** (`tokens.css:167`) — default size for every icon-only button unless overridden
2. `.sugg button` — **min-height 32px**, no min-width (`tokens.css:309`)
3. `.icon-grid button` — **min-height 40px** via `aspect-ratio:1` (`tokens.css:312`)
4. `.tb` (tab-bar tab) — no explicit height; `padding:9px 4px` + 11px font ⇒ computed height ≈ 29-31px (`tokens.css:147`)
5. `.ms` (month selector) — `padding:8px 0` + 12px font ⇒ computed height ≈ 28px (`tokens.css:158`)
6. `.dtoggle button` — `padding:7px 6px` + 11px font ⇒ computed height ≈ 25px (`tokens.css:285`)
7. `.chip` used as a `<button>` (e.g. the "atrasada" risk chip, `GoalsView.jsx:141-152`) — `padding:4px 10px` + 11px font ⇒ computed height ≈ 19px (`tokens.css:162`)

Inline-style overrides found specifically in the four required views (10 sites):
1. `GoalsView.jsx:157` — edit-meta `.icon-btn`, **32×32px**
2. `GoalsView.jsx:219-238` — 4 "quick add" buttons (`QUICK_ADD = [10, 50, 100, 500]`, `GoalsView.jsx:22`), `flex:1, padding:'8px 0'`, 11px font, no explicit height ⇒ computed height ≈ 30px (these are the report's "+10/+50" buttons)
3. `OverviewView.jsx:500` — dismiss-anomaly `.icon-btn`, **32×32px**
4. `OverviewView.jsx:539` — hide-balances `.icon-btn`, **34×34px**
5. `OverviewView.jsx:914` — "histórico de saldos" `.icon-btn`, **28×28px**
6. `OverviewView.jsx:924` — "editar conta" `.icon-btn`, **28×28px**
7. `OverviewView.jsx:942` — "remover conta" `.icon-btn`, **28×28px**
8. `CardsView.jsx:101` — "Editar" text button, `padding:'4px 10px'`, 11px font, no explicit height ⇒ computed height ≈ 22px
9. `CardsView.jsx:167` — delete-expense-on-card icon button, `padding:2`, 14×14 SVG icon, no min size ⇒ computed hit target ≈ 18×18px (smallest touch target found in scope)
10. `ExpensesView.jsx:781` — delete-expense text button, `minHeight:36`, width unconstrained

Compliant counter-examples in the same files (for contrast): `ExpensesView.jsx:215` (clear-search button, explicit `minWidth:44,minHeight:44`) and `ExpensesView.jsx:327` (edit-expense `.icon-btn` override to `width:44,height:44`) — note the same "Editar despesa" action is **44×44px** at `ExpensesView.jsx:327` but only the default **36×36px** (`.icon-btn`, no override) at `ExpensesView.jsx:778` in the recurring-detail expansion — same action, two different sizes in the same file.

**Total declared-size touch targets under 44×44px found in scope: 17** (7 shared `tokens.css` class rules + 10 inline overrides/instances in the four views). This is a static/declared-size count (from source, not a runtime `getBoundingClientRect()` measurement).

### A8. States checklist

- **Empty**: present. `.empty` class used at `CardsView.jsx:42` ("Sem cartões de crédito"), `GoalsView.jsx:54`, `ExpensesView.jsx:274` (search no-results) and `ExpensesView.jsx:643` ("Sem despesas neste período").
- **Loading**: present at two levels — (1) app-boot skeleton `Skeleton()` in `src/App.jsx:20-32` (`.skel` shimmer blocks, shown while `view === 'loading'`, `App.jsx:148`); (2) route-level `ViewFallback()` in `src/components/Shell.jsx:145-154` (`aria-live="polite"`, text "A carregar…"), wired into three `<Suspense fallback={<ViewFallback/>}>` boundaries (`Shell.jsx:294,302,325`) around the lazy-loaded view chunks. No per-view (Overview/Expenses/Goals/Cards) skeleton exists beyond this generic route fallback — once data is hydrated there's no further loading indicator (data is synchronous/local-store driven).
- **Error**: `toast(msg,'error')` exists as a pattern (`Toast.jsx` renders `role="alert" aria-live="assertive"` for `type==='error'`) but within the four required views only **one** call site produces an error toast: `OverviewView.jsx:248` (`total>0 ? ...'success' : ...'error'` when nothing was reservable for goals). No `errText`/inline field-validation error markup found anywhere in the four views (grep for `errText` → 0 matches in scope).
- **Success**: present, multiple sites — `GoalsView.jsx:48`, `ExpensesView.jsx:429,457`, `CardsView.jsx:36`, `OverviewView.jsx:156,162,248,495` all call `toast(msg,'success')`.
- **Focus-visible**: present and specific, `tokens.css:183-184`:
  ```
  button:focus-visible,a:focus-visible,[role="button"]:focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:6px}
  input:focus-visible,select:focus-visible,textarea:focus-visible{box-shadow:0 0 0 3px var(--blue-soft)}
  ```
  No bare `outline:none` without a `:focus-visible` replacement was found anywhere in `tokens.css` (the only `outline:none` is on the base `input,select,textarea` rule at `tokens.css:117`, which is immediately paired with the `:focus-visible` box-shadow rule above).
- **Disabled**: global CSS exists (`tokens.css:116`: `button:disabled{opacity:0.5;cursor:not-allowed}`), but the `disabled` attribute/prop is **not used anywhere** in the four required views (grep for `disabled` in `OverviewView.jsx`, `ExpensesView.jsx`, `GoalsView.jsx`, `CardsView.jsx` → 0 matches). No submit/action buttons in these views are disabled during invalid or pending states.

### A9. Motion

All `animation`/`transition` declarations in `tokens.css`:
- `@keyframes fadeUp/fadeIn/slideUp/slideInRight/slideInLeft/shimmer/pulse` (`tokens.css:128-134`)
- `.fadeUp{animation:fadeUp 0.4s var(--ease-ios) both}` (135), `.fadeIn{...0.3s...}` (136), `.slideInR{...0.32s...}` (137), `.slideInL{...0.32s...}` (138) — all run-once on mount, not looping
- `.skel{...animation:shimmer 1.5s infinite;...}` (169) — loops only while a skeleton is mounted (loading state)
- `.toast{...animation:fadeUp 0.3s ease-out;...}` (171) — run-once
- `.sync-chip.saving .sync-dot{animation:pulse 1.2s infinite}` (219) — loops only while `saving` state is active
- `.sheet-overlay{...animation:fadeIn 0.2s ease-out;...}` (224), `.sheet-panel{...animation:slideUp 0.3s var(--ease-ios);...}` (226) — run-once on sheet open
- Global `button{transition:transform 0.18s var(--ease-ios),opacity 0.15s,background 0.2s,border-color 0.2s,box-shadow 0.2s;...}` (114), `button:active{transform:scale(0.96)}` (115)
- Numerous per-component transitions (`.icon-grid button`, `.bar-fill{transition:width 0.5s ease-out}` line 152, `.bnav-center .fab{transition:transform 0.18s var(--ease-ios)}` line 203, etc.)

`prefers-reduced-motion` is honoured, `tokens.css:186-189`:
```
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}
  .skel{animation:none;background:var(--bg3)}
}
```
The universal selector (`*,*::before,*::after`) covers every animation/transition declared in the file, including the two `infinite` ones (`shimmer`, `pulse`), so coverage is comprehensive.

**Idle-screen animation**: none of the `infinite`-looping animations run on a genuinely idle/settled screen — `shimmer` only exists while a `.skel` node is mounted (pre-hydration), and `pulse` only exists while `.sync-chip.saving` is applied (an active background-sync state, not idle). No animation was found running indefinitely once a view has finished loading and is not syncing.

### A10. Dark mode

Switching mechanism: `html[data-theme="dark"]` attribute selector (`tokens.css:76`). Three code paths set it:
1. Pre-paint flash-avoidance script in `index.html:20-28` — reads `matchMedia('(prefers-color-scheme: dark)')` and sets `data-theme` before React mounts.
2. `applyTheme(t)` in `src/store/store.jsx:107-116` — the app's actual theme state machine; when `t==='system'` it re-checks `matchMedia`, otherwise uses the explicit `'light'|'dark'` value, then calls `document.documentElement.setAttribute('data-theme', actual)` (`store.jsx:114`) and also updates the `<meta name="theme-color">` tag.
3. User toggle: `Shell.jsx:261-265` cycles `light → dark → system → light` via `state.theme`, exposed as a "Mudar tema" icon-button in the header (confirmed reachable as focusable element #1 on the Overview tab, see Part B §2).

Every semantic token used by the four views (`--bg,--surface,--elevated,--border,--border-strong,--fg,--fg-muted,--fg-subtle,--primary,--primary-dark,--secondary,--accent,--success,--warning,--danger,--info,--bg-glass,--shadow*`) is redeclared inside `html[data-theme="dark"]{}` (`tokens.css:76-105`). Two exceptions found:
- `--grad-hero` is defined identically in both blocks (`tokens.css:55` and `:101`, same `linear-gradient(135deg,#3b6fee 0%,#7b5fe0 100%)`) — not a bug, but not re-themed either; contrast for white-on-hero text sits at the same 4.63:1 in both themes (see A5).
- `.ccard{background:linear-gradient(135deg,#1B1F2E 0%,#2D3453 100%)}` (`tokens.css:301`) is a single, theme-independent rule (not inside `:root`/`[data-theme]`) — always the same dark navy gradient regardless of theme, by design (mimics a physical credit card), used in `CardsView.jsx:80`.

Hard-coded light-only or non-themed literal colours found in the four views' inline styles (all listed in A4; re-flagged here for the dark-mode angle):
- `CardsView.jsx:88-89` — `rgba(255,255,255,0.65)` / `#fff` sit on the fixed-dark `.ccard` background (theme-independent by design, so these are safe in both themes — not a light-only bug).
- `OverviewView.jsx:733` — `#fff` on `var(--primary)` background. In dark mode this is the pair that **fails AA-normal contrast** (3.45:1, see A5) — this is the one case where a hard-coded white-on-primary literal is a real dark-mode-specific problem, not just a style-purity nit.
- `OverviewView.jsx:766` — `#fff` on a dynamically computed `efColor` background; not statically verifiable, flagged as a risk (no guarantee `efColor` is always dark enough for white text to pass in either theme).
- `ExpensesView.jsx:677` — `'#f5a623'` literal budget-bar mid-tone color, used identically in both themes (doesn't shift for dark-mode luminance, unlike `var(--warning)` which is separately tuned per theme: light `#9c5e00` vs dark `#f7b955`).

---

## 3. Part B findings

### B1. axe-core audit (`scripts/a11y.mjs`, run successfully against `npx vite --port 5199` + local Chrome)

Total: **9 violations across 19 audited surfaces (13 tabs + 6 modals + 1 empty-state fixture), reducing to 1 unique rule.**

Per-surface counts (only non-zero shown): `tab:overview` 1, `tab:goals` 1, `tab:invest` 1, `modal:add` 1, `modal:transfer` 1, `modal:cardpay` 1, `modal:stmt` 1, `modal:settings` 1, `modal:acct` 1. All other tabs (`expenses, cal, income, rec, charts, loan, report, transfers, cards, tax`) and `empty:overview` returned **0** violations.

Unique rule violated:
- **`color-contrast`** — impact **serious** — "Elements must meet minimum color contrast ratio thresholds" — appears on 9 of the 19 surfaces. Example selectors: `span[aria-label="Ana"]`, `span[aria-label="João"]`, `.fadeUp.cd:nth-child(2) > .rw > .chip`.

Root cause identified by cross-referencing source: `Avatar` (`src/components/Avatar.jsx:38`) renders `background: color || 'var(--primary)'` where `color` is a per-person custom color (e.g. group members "Ana"/"João"), with white initials text forced via `.avatar{color:#fff}` (`tokens.css:296`) — some assigned person-colors are too light for white text to meet 4.5:1, which is what axe is flagging on the `span[aria-label="Ana/João"]` avatars.

### B2. Focus order — Resumo tab (`?tab=overview`), first 15 focusable elements in DOM order

(via puppeteer, querying `a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])`, reading `aria-label || innerText`; 30 focusable elements total on this fixture)

1. button — "Mudar tema"
2. button — "Saldo"
3. button — "Despesa"
4. button — "Receita"
5. button — "IA"
6. button — "Mais"
7. button — "Grupos — amigos devem-te 150,00 €"
8. button — "Reservar 200,00 € para as metas"
9. button — "Está certo, dispensar aviso"
10. button — "Está certo, dispensar aviso"
11. button — "Ocultar saldos"
12. button — "Não e subscrição: CAFE DO PONTO"
13. button — "Adicionar"
14. button — "Não e subscrição: UBER EATS"
15. button — "Adicionar"

Note: elements #1-6 are the header theme toggle + `QuickActions` shortcuts, which visually sit above/among page content but are the first focus stops (consistent with DOM order = header before main). Elements #9/#10 are two consecutive anomaly-dismiss buttons with the **identical** accessible name "Está certo, dispensar aviso" — a screen-reader user tabbing through gets no differentiation between them by name alone.

### B3. Keyboard reachability

Every interactive control found in scope is a native `<button>` (or `<a>`/`<input>`/`<select>`), which is keyboard-operable by default:
- `grep -rn 'role="button"' src/views src/components src/modals` → **0 matches** app-wide (no div-as-button anti-pattern anywhere).
- `grep -n '<div[^>]*onClick' ` on the four views + `Sheet.jsx`/`AssistantFab.jsx`/`QuickActions.jsx`/`Shell.jsx` → **0 matches** (no bare clickable `<div>`s).
- Add-expense FAB: `Shell.jsx:210` — `<button type="button" className="bnav-center" onClick={onPlus} aria-label="Adicionar">`.
- Bottom-nav tabs: `Shell.jsx:195-216` — all rendered as `<button className="bnav-btn"...>`.
- Assistant FAB: `src/components/AssistantFab.jsx:67-72` — `<button ... aria-label="Abrir assistente de IA">`.
- Escape-to-close on sheets: implemented in three places, each via a `window.addEventListener('keydown', ...)` checking `ev.key === 'Escape'`: `Sheet.jsx:45-74` (also implements a Tab/Shift+Tab focus-trap cycle within the panel, `Sheet.jsx:49-70`), `MoreMenu.jsx:49-56`, `ActionSheet.jsx:47-54`.
- Category grid in the add-expense sheet: not the shared `.icon-grid` CSS class (that class is only used by `CatManagerModal.jsx:177` and `GoalModal.jsx:170`) — `AddExpenseSheet.jsx:240-266` implements its own 4-column button grid with native `<button type="button" aria-pressed={on}>` per category, each carrying a visible text label (`b.nm`) plus a `CategoryIcon`.
- Goal "+10/+50/+100/+500" buttons: `GoalsView.jsx:219-238`, native `<button type="button" onClick={...}>+{amt}</button>`.

Gap: `Sheet.jsx`'s focus trap intercepts `Tab`/`Shift+Tab` keydown only (`Sheet.jsx:49-70`); it does not set `aria-hidden`/`inert` on the background content behind the overlay, so a screen-reader's non-Tab virtual-cursor navigation (e.g. VoiceOver rotor / swipe) could still reach elements outside the open sheet even though they're visually covered by the `.sheet-overlay` backdrop.

### B4. ARIA landmarks

On `?tab=overview` (no sheet open): `<main>` = 1, `<nav>` = 1, `<header>` = 1, `<aside>` = 0. `role=` attribute census: only `role="img"` (6 instances on this screen — avatars/brand marks/category progress bar). No skip link found (`hasSkipLink: false` — searched for `a[href^="#"]` containing "skip"/"saltar" text, none exists).

Sheets (`Sheet.jsx:150-158`): `role="dialog"`, `aria-modal="true"`, `aria-label={title || 'Painel'}` (always labelled — falls back to literal "Painel" if no title prop given), with a close `<button aria-label="Fechar">` (`Sheet.jsx:172`). Focus management: on open, focus moves to the close button or first focusable element in the panel (`Sheet.jsx:97-108`); on close, focus is restored to `prevFocusRef.current`, the element that had focus before the sheet opened (`Sheet.jsx:106-108`). `MoreMenu.jsx` and `ActionSheet.jsx` independently implement their own `role="dialog" aria-modal="true"` (`MoreMenu.jsx:69-70`, `ActionSheet.jsx:187-188`) rather than reusing `Sheet.jsx`.

### B5. Icon-only controls without accessible name

Static scan (`<button>` blocks whose only content is an `<svg>`/`<Icon>`, checked for `aria-label`/`title`/`aria-labelledby` on the opening tag) across `src/views/*.jsx`, `src/components/*.jsx`, `src/modals/*.jsx` (production files, tests excluded): **0 found**. One false-positive candidate (`ExpensesView.jsx:508`, the "cleanup" button) was manually verified to have visible text via `{cleanLabel}` and is not actually icon-only.

This is a static/regex-based scan (single-line-collapsed `<button>...</button>` block matching) and is a positive finding subject to the caveats in §4 (Known gaps) — every icon-only button instance checked by hand in the four required views (`OverviewView.jsx:500,539,914,924,942`, `GoalsView.jsx:157`, `CardsView.jsx:101,167`, `ExpensesView.jsx:215,327,778,781`) does carry an explicit `aria-label`.

### B6. Images / logos

`role="img"` usage (informative, explicitly labelled): **4** declaration sites — `Avatar.jsx:59` (`aria-label={name}` unless `decorative`), `MerchantLogo.jsx:20` (`BrandMark`, `aria-label={label}`), `MerchantLogo.jsx:36` (`Initial`, `aria-label={name}`), `GoalsView.jsx:85` (progress bar, `aria-label={'Progresso global ' + pct + '%'}`).

`aria-hidden="true"` usage: **91** instances across `src/views/*.jsx` + `src/components/*.jsx` + `src/modals/*.jsx` (production files). The `Icon` component (`src/components/Icon.jsx:252-269`) hard-codes `aria-hidden="true"` on every rendered `<svg>` by default (line 264), so every plain `<Icon name=.../>` usage is decorative-by-default; components that need an icon to convey meaning wrap it explicitly with `role="img"`+`aria-label` (Avatar/BrandMark/Initial pattern above) or place it inside an already-labelled `<button aria-label>`. `CategoryIcon.jsx` (used heavily across the four views) wraps `<Icon>` with no additional `role`/`aria-label` of its own — it relies on adjacent visible text (category name) for meaning; no case was found where a `CategoryIcon` renders with no nearby visible label.

### B7. Form labels — four required modals

| Modal | Real `<label htmlFor>` | `aria-label`-only | Placeholder-only (no label/aria-label) |
|---|---|---|---|
| `AddExpenseSheet.jsx` | 0 | 10 (Descrição:281-285, Despesa partilhada:298-302, Total(€):342-347, Pessoas:354-360, Data:372-376, Valor(€):384-389, Data:396-400, Conta debitada(opcional):409-412, Tags(opcional):426-430, Nota(opcional):436-440) | 0 |
| `AcctModal.jsx` | **8** (`acBank:139-140, acType:143-144, acCat:151-152, acVal:161-162, acCur:172-173, acLast4:196-197, acNet:208-209, acNote:219-220` — every `<label className="lb" htmlFor="…">` paired 1:1 with a matching `id` on its input/select) | 0 | 0 |
| `GoalModal.jsx` | 0 | 5 (Nome:133-137, Objetivo:144, Atual:148, Data alvo (opcional):155-159, Reservar por mês:165) + 2 more `aria-label` on icon/color pickers (`aria-label={'Ícone '+...}` line 172, `aria-label={'Cor '+...}` line 185) | 0 |
| `RecModal.jsx` | 0 | 4 (Nome:123-127, Valor:134, Dia:138, Categoria:143-146) | 0 |

Pattern note: `AddExpenseSheet.jsx`, `GoalModal.jsx`, `RecModal.jsx` all visually present a `<div className="lb">{Label text}</div>` immediately above each field (e.g. `RecModal.jsx:121` `<div className="lb"...>Nome</div>` right before the `Nome` input) — this gives sighted users a visible label, but it is a plain `<div>`, **not** programmatically associated via `htmlFor`/`id`; the *same* label text is separately duplicated into the input's `aria-label`. So screen-reader users do get a correct accessible name (via `aria-label`), but the visible label and the accessible name are two independent un-linked strings that happen to match today — a future edit to one without the other would silently desync them. `AcctModal.jsx` is the only one of the four using the more robust `<label htmlFor>`/`id` pairing.

### B8. Zoom / viewport

`index.html:5`:
```
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
```
No `maximum-scale`, `minimum-scale`, or `user-scalable=no` present — user pinch-zoom is **not** disabled.

### B9. Language

`index.html:2` — `<html lang="pt-PT">`. (The local dev/preview harness `dev.html:2` uses `<html lang="pt" data-theme="light">` instead — that file is dev-only and is not part of the production build per its own comment, `dev.html:7`.)

---

## 4. Known gaps

- Touch-target sizes (A7) are **declared/source values**, not runtime `getBoundingClientRect()` measurements; no live-DOM box measurement pass was run to confirm rendered sizes match the declared CSS/inline values (padding-derived heights for `.tb`/`.ms`/`.dtoggle button`/`.chip`-as-button/quick-add buttons are computed estimates from `padding + font-size`, not measured).
- The icon-only-button scan (B5) is a single-line-collapsed regex match on `<button>...</button>` blocks; it can miss buttons whose icon child uses a naming convention other than `<svg`/`<Icon`/`<XIcon/>` (e.g. an imported icon component under a different name), and it cannot see truly dynamic `aria-label` values computed only at runtime for edge-case data. Cross-checked by hand for every icon button actually found in the four required views (B5), but not exhaustively hand-verified for every one of the ~30+ other view/modal files it scanned with a 0-match result.
- `OverviewView.jsx:766` (`#fff` on dynamic `efColor` background) could not be statically resolved to a concrete contrast ratio — `efColor` is computed at runtime from data-dependent logic not traced in this pass.
- axe-core (B1) was run only against the local dev/preview harness (`dev.html`, synthetic fixture data) at a single mobile viewport (390×844) and a single ruleset (`wcag2a, wcag2aa, wcag21aa, best-practice`); it was not run at additional viewport sizes, was not run against the production build, and does not cover manual-only checks (e.g. actual screen-reader announcement testing, real device pinch-zoom behavior).
- Keyboard reachability (B3) and dialog focus-trap behavior (B3/B4) were verified by source-code reading (confirmed native semantics, event listeners, `role`/`aria-*` attributes), not by scripted keyboard-driven puppeteer traversal (no automated Tab-key walk was performed to confirm the trap/restore logic executes correctly at runtime).
- Colour/contrast literals (A4, A5) were extracted from `tokens.css` and the four views' `style={{}}` objects only; colours defined in JS logic modules (e.g. category color maps in `src/lib/categories.js`, per-person group colors, `hashHue()` in `brands.jsx`) were not enumerated — these feed the `Avatar`/`chip` contrast failure surfaced by axe (B1) but their concrete hex values were not extracted in this pass.
