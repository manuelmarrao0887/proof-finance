# Web Interface Guidelines — review

Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md (fetched live).

## index.html

index.html:18-20 - critical font (Plus Jakarta Sans) loaded via Google Fonts stylesheet with no `<link rel="preload" as="font">`; relies only on the `&display=swap` query param → slower first text paint

## src/styles/tokens.css

tokens.css:147 - `.tb{...transition:all 0.2s;...}` → list properties explicitly
tokens.css:158 - `.ms{...transition:all 0.2s;...}` → list properties explicitly
tokens.css:152 - `.bar-fill{...transition:width 0.5s ease-out}` → animates `width`, not compositor-friendly (transform/opacity only); this class drives every progress bar in the app
tokens.css:179 - `.ring-fg{...transition:stroke-dashoffset 0.8s ease-out}` → animates `stroke-dashoffset`, not compositor-friendly
tokens.css:119 - `input:focus,select:focus,textarea:focus{border-color:var(--blue)!important}` → styles on `:focus` not `:focus-visible` (shows on mouse click too, duplicate of the `:focus-visible` box-shadow already at :184)

✓ reduced-motion is handled globally and correctly (:186-189, incl. `.skel`); safe-area insets used throughout; `overscroll-behavior:contain` on scroll/sheet containers; `color-scheme`/`theme-color` match bg in both themes; `.m` applies `tabular-nums`.

## src/components/Shell.jsx

Shell.jsx:137 - `SyncChip` status (saving/saved/error) changes with no `aria-live` region → screen readers miss save-state updates
Shell.jsx:322 - no skip link to `<main>` (rule requires one for main content)
Shell.jsx:157 - `MONTHS_PT` hardcoded array instead of `Intl.DateTimeFormat`
Shell.jsx:199,330 - tab navigation (`onTab`/`goTab`) is `<button onClick>` + local state only, not reflected in the URL → no deep-linking, no Cmd/Ctrl-click support for any tab

## src/components/Sheet.jsx

Sheet.jsx:96-116 - pointer-drag-to-dismiss doesn't disable text selection or set `inert` on the panel while dragging

✓ otherwise compliant: `role="dialog"` + `aria-modal="true"` + `aria-label`, real focus trap, Escape-to-close, focus restore on close, `overscroll-behavior:contain` on both overlay and scroll body, `dvh` used for max-height (not `vh`).

## src/components/Toast.jsx

✓ pass — `role`/`aria-live` set correctly per type (`alert`/assertive for error, `status`/polite otherwise), icons `aria-hidden="true"`, ellipsis handled correctly elsewhere in the app.

## src/components/QuickActions.jsx

QuickActions.jsx:24-47 - buttons are fully inline-styled with no `:hover` state at all → no hover feedback (rule: buttons/links need a hover state)

## src/components/AssistantFab.jsx

AssistantFab.jsx:69 (className="assistant-fab", see tokens.css:209-210) - no `:hover` state defined, only `:active` → no hover feedback

## src/components/Buttons.jsx

Buttons.jsx:16-38 - `PrimaryButton` inline-styled only, no hover state
Buttons.jsx:40-61 - `SecondaryButton` inline-styled only, no hover state

## src/views/OverviewView.jsx

OverviewView.jsx:676 - `hs.recommendations.map((r, i) => <div key={i}...` → index used as key on a real (non-demo) dynamic list
OverviewView.jsx:934-936 - native `confirm()` gates a destructive delete-account action, not an in-app confirmation modal
OverviewView.jsx:48-51 - `MONTHS_LONG` hardcoded array instead of `Intl.DateTimeFormat`
OverviewView.jsx:279,342,637,761 - section titles ("Grupos", "Podes gastar", "Saúde financeira", "Fundo de emergência") are `<div className="lb">`, not `<h2>`-`<h6>` → invisible to screen-reader heading navigation

## src/views/ExpensesView.jsx

ExpensesView.jsx:52 - `MONTH_SHORT` hardcoded array instead of `Intl.DateTimeFormat`
ExpensesView.jsx:101-114 - search/tag/account filters and month index (`em`/`mOff`) live only in local state, not the URL → no deep-linking of filtered/tabbed state
ExpensesView.jsx:145 - native `confirm()` for delete-expense
ExpensesView.jsx:452-455 - native `confirm()` for a bulk destructive action (remove all expenses in a month)
ExpensesView.jsx:596 - section label ("DESPESAS …") is a `<div className="lb">`, not a heading
ExpensesView.jsx:739 - `hTxn.map((t, i) => <div key={'h' + i}...` → index-based key
ExpensesView.jsx:278,750 - search-result and category-detail expense lists render the full array with no virtualization/`content-visibility` — grows unbounded with months of transactions

## src/views/GoalsView.jsx

GoalsView.jsx:181 - ring percentage (`{pctAbs.toFixed(0)}%`) rendered without `.m`/`font-variant-numeric:tabular-nums`
GoalsView.jsx:84,127 - "Global progress" and each goal's title block use plain `<div>`s, no heading element

## src/views/CardsView.jsx

CardsView.jsx:34 - native `confirm()` for delete-expense-from-card
CardsView.jsx:88,97 - "Dívida atual" / plafond info are plain text, no heading element for the card section

## src/modals/AddExpenseSheet.jsx

AddExpenseSheet.jsx:194-199 - `remove()` deletes the expense with **no confirmation at all** (not even native `confirm()`) — the strongest destructive-action gap found
AddExpenseSheet.jsx:293-334 - "Despesa partilhada" toggle: the visible label text (294-297) sits outside the `<label>` that wraps only the 44×26 switch → clicking the text does nothing (dead zone)
AddExpenseSheet.jsx:298-309 - the toggle's real `<input type="checkbox">` is sized `0×0` (`opacity:0,width:0,height:0`) and the visible switch has no `:focus-within` style → tabbing to it shows no visible focus indicator at all
AddExpenseSheet.jsx:218-219 - inline validation errors (`errText`) aren't in an `aria-live` region and aren't wired to their input via `aria-describedby`
AddExpenseSheet.jsx:127-154 - `submit()` sets field errors but never moves focus to the first invalid field
AddExpenseSheet.jsx:237,274,383,408 - field labels are plain `<div className="lb">`, not `<label htmlFor>` (AcctModal does this correctly elsewhere) → clicking the label text doesn't focus the control
AddExpenseSheet.jsx:281,342,384,426,436 - `desc`/`total`/`amount`/`tags`/notes inputs have no `autocomplete` or `name` attribute
AddExpenseSheet.jsx - closing the sheet with a filled draft shows no unsaved-changes warning

## src/modals/AcctModal.jsx

AcctModal.jsx:124 - native `confirm()` for delete-account
AcctModal.jsx:84-87 - "Banco obrigatório" validation surfaces only as a toast, not inline next to the field
AcctModal.jsx:140,164,199,220 - bank/value/last4/note inputs have no `autocomplete`/`name`

## src/modals/GoalModal.jsx

GoalModal.jsx:108-113 - `deleteGoal()` deletes with **zero confirmation** — no `confirm()`, no modal, no undo
GoalModal.jsx:91,95 - "Nome obrigatório" / "Objetivo inválido" validation surfaces only as a toast, not inline; no focus moved to the invalid field
GoalModal.jsx:132,143,147,154,164 - field labels are plain `<div className="lb">`, not `<label htmlFor>`
GoalModal.jsx:134,144,148,157,165 - name/target/current/deadline/monthly inputs have no `autocomplete`/`name`

## src/modals/SettingsSheet.jsx

SettingsSheet.jsx:91,141 - native `confirm()` gates export/restore actions
SettingsSheet.jsx:173-179 - `wipeData` double-`confirm()`s an irreversible full data wipe instead of an in-app confirmation modal
SettingsSheet.jsx:214 - avatar `<img>` has no explicit `width`/`height` attributes (only percentage CSS inside a fixed 44×44 wrapper)

## Coverage

Checked statically against every rule in the fetched guideline: accessibility (aria-label/aria-hidden/aria-live/roles/semantic-vs-div/heading hierarchy/skip link), focus states, forms (labels, autocomplete, inputmode, paste, unsaved-changes, error placement), animation (reduced-motion, transition:all, compositor properties), typography (ellipsis, tabular-nums), content handling (min-width:0/truncation/empty states), images (dimensions/alt), performance (virtualization, layout reads, preconnect/preload), navigation/state (URL sync, `<a>` vs `<button>`, destructive-action confirmation), touch/interaction (touch-action, overscroll-behavior, drag), safe areas, dark-mode/theming, i18n (Intl vs hardcoded), hydration safety, hover/focus contrast, and the anti-patterns list. Not checked / not applicable: runtime-measured items (actual Lighthouse/CLS scores, real contrast-ratio measurement, live screen-reader/keyboard walkthrough), hydration-mismatch rules (this is a client-only Vite SPA, no SSR to mismatch against), and exhaustive micro-typography sweeps (curly quotes, `&nbsp;` pairing, sub-12px font sizes — the last has no explicit rule in this guideline version) given the volume of Portuguese copy in-app; Content & Copy casing/voice rules are written for English UI text and were not applied to the PT-PT copy.
