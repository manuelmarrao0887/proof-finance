# Evidence report — Structural + Copy/Honesty audit surface

Repo root: `/Users/manuelmarrao/Library/Mobile Documents/com~apple~CloudDocs/12_Projetos/profissional/Proof Studio/Proof-Finance-React`
All paths below are relative to that root unless given in full. This is a facts-only evidence dump — no scores, no recommendations.

---

## 1. Sources consulted

Full-file reads (entire file):
- `src/views/OverviewView.jsx` (959 lines)
- `src/views/ExpensesView.jsx` (817 lines)
- `src/views/GoalsView.jsx` (246 lines)
- `src/views/CardsView.jsx` (180 lines)
- `src/views/RecurringView.jsx` (183 lines)
- `src/views/GroupsView.jsx` (676 lines)
- `src/views/InvestmentsView.jsx` (99 lines)
- `src/components/Shell.jsx` (336 lines)
- `src/components/Sidebar.jsx` (93 lines)
- `src/components/QuickActions.jsx` (50 lines)
- `src/components/Hero.jsx` (152 lines)
- `src/components/ContextStrip.jsx` (143 lines)
- `src/components/Onboarding.jsx` (92 lines)
- `src/components/Login.jsx` (117 lines)
- `src/lib/format.js` (109 lines)
- `src/modals/MoreMenu.jsx` (137 lines)
- `src/modals/ActionSheet.jsx` (211 lines)
- `src/modals/AddExpenseSheet.jsx` (446 lines)
- `src/modals/RecModal.jsx` (167 lines)
- `src/modals/CardPayModal.jsx` (134 lines)

Partial reads / targeted `grep` (line ranges cited inline where used):
- `src/views/CalendarView.jsx`, `IncomesView.jsx`, `ChartsView.jsx`, `LoanView.jsx`, `AIView.jsx`, `ReportView.jsx`, `TaxView.jsx`, `TransfersView.jsx` (heading/label sample only, per instructions)
- `src/modals/AcctModal.jsx`, `PositionModal.jsx`, `SettingsSheet.jsx`, `BalanceUpdateSheet.jsx`, `ImportStatementSheet.jsx`, `GroupExpenseSheet.jsx`, `IncomeModal.jsx`, `CatManagerModal.jsx`, `PersonSheet.jsx`, `RulesModal.jsx`, `TransferModal.jsx`, `SettleSheet.jsx`, `HousingModal.jsx`
- `src/lib/months.js`, `src/lib/categories.js`
- `src/styles/tokens.css` (`.cd`, `.lb`, `.bar`, `.bar-fill`, `.empty` definitions, lines 140–181)
- `vite.config.js` (JSX runtime), `package.json` (react version)

Tooling: `grep -rn` / small Node scripts run over `src/views`, `src/modals`, `src/components` (test files `*.test.jsx` always excluded), plus comment-stripped counts to avoid false positives from doc-comments that contain code-like strings (e.g. `<select`, `<button`).

---

## 2. Part A — Structural findings

### A1. Interactive-element counts (literal JSX-source occurrences, comment-stripped)

| File | `<button` | `<a` | `<input` | `<select` | `<textarea` | `onClick=` |
|---|---|---|---|---|---|---|
| `src/views/OverviewView.jsx` | 12 | 0 | 0 | 0 | 0 | 12 |
| `src/views/ExpensesView.jsx` | 16 | 0 | 2 | 2 | 0 | 16 |
| `src/views/GoalsView.jsx` | 3 | 0 | 0 | 0 | 0 | 3 |
| `src/views/CardsView.jsx` | 5 | 0 | 0 | 0 | 0 | 5 |
| `src/views/RecurringView.jsx` | 3 | 0 | 0 | 0 | 0 | 3 |
| `src/views/GroupsView.jsx` | 12 | 0 | 0 | 0 | 0 | 12 |
| `src/views/InvestmentsView.jsx` | 2 | 0 | 0 | 0 | 0 | 2 |
| `src/components/Shell.jsx` | 4 | 0 | 0 | 0 | 0 | 4 |
| `src/components/QuickActions.jsx` | 1 | 0 | 0 | 0 | 0 | 1 |

Every `onClick=` in these 9 files sits on a `<button>` (no orphan `onClick` on `<div>`/`<span>` in this surface — verified by matching counts).

Caveat — source occurrences ≠ rendered instances, because several `<button>` JSX literals live inside `.map()` calls or are reused helper functions:
- `Shell.jsx` `BottomNav`: the `slot()` helper (1 `<button>` literal, line 194) is called 3× (Resumo/Despesas/Metas) + 1 literal center FAB button (line 210) + 1 literal "Mais" button (line 214) → 4 literal occurrences render **5 buttons** on screen; `Header` adds 1 more (theme toggle, line 184) → **6 buttons total** in the mobile chrome.
- `QuickActions.jsx`: 1 `<button>` literal (line 24) inside `ACTIONS.map()` (5 items) → renders **5 buttons** (Saldo, Despesa, Receita, IA, Mais).
- `GoalsView.jsx`: 3 literals = risk-chip button (line 141, conditional), edit button (line 157), quick-add button (line 221, inside `QUICK_ADD.map`, 4 amounts) → **each goal card renders up to 6 buttons** (1 edit + up to 1 risk chip + 4 quick-add), × number of goals.
- `CardsView.jsx`: literals at lines 49 (empty-state "+ Novo cartão"), 101 ("Editar"), 115 ("+ Despesa no cartão"), 122 ("Pagar dívida"), 167 (delete-expense trash, inside `exps.map()`) → the last is **per expense line**, the other 4 are **per card**.
- `RecurringView.jsx`: literals at lines 43 (`Suggestions`, inside `list.map()`), 151 (edit), 161 (delete) → edit/delete are **per recurring item** (`sorted.map()`).
- `GroupsView.jsx`: 12 literals spread across sub-components (`GroupCard` is itself a `<button>`, `ExpenseRow` is itself a `<button>`, `SettleRow`'s "Acertar", `GroupsHeader`'s "Gerir pessoas", `GroupDetail`'s "Voltar"/"Editar grupo"/segment-tab ×3-rendered-from-1-literal/"Partilhar resumo"/"Acertar"+"Despesa" bottom bar, list-view "Novo grupo") — several are **per group / per entry**.
- `InvestmentsView.jsx`: literal at line 35 ("+ Posição") and line 64 (row-as-button, inside `rows.map()`, **per position**).

### A2. Max JSX nesting depth

**`OverviewView.jsx` — depth 7**, in the "Contas por categoria" expandable account list (lines 850–956). Chain (root return at line 255 = depth 1):
```
div.fadeUp (255) → div key={cat} (859) → div.fadeIn [isX&&] (891) →
div key=a.id .rw (893) → div actions flex (908) → button (910) → <Icon name="history"/> (917)
```
8 elements listed = 7 nested levels below the root's own content, deepest leaf at line 917 (also reachable via the sibling edit button/`<EditIcon/>` at 919-928 and delete/`<TrashIcon/>` at 930-946, same depth).

**`ExpensesView.jsx` — depth 8**, one level deeper, in the budget-mode category row's "transitado" (rollover-carry) badge (lines 490, 686–699). Chain (root return at line 490/491 = depth 1):
```
div style=padding (491) → div key={r.id} (686) → button.exp-btn (687) →
div flex:1 (689) → div.rw (690) → span fontSize13 (691) →
span [r.carried?] (694) → <Icon name="recurring"/> (699)
```
8 elements = the single deepest node found across both ExpensesView render branches (the search-mode branch, lines 198–340, tops out at depth 7).

### A3. Repeated-pattern counts

**Trash-can SVG (delete), same `<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6...`) or the `polyline`-variant of it:**
9 files carry a literal inline copy (not a shared `<TrashIcon/>` import) — `src/views/OverviewView.jsx:61-66` (local `TrashIcon` component), `src/views/ExpensesView.jsx:511-516` and `:808-811` (2 separate inline `<svg>`s in the same file), `src/views/CardsView.jsx:168`, `src/views/RecurringView.jsx:171-174`, `src/views/TransfersView.jsx:58`, `src/modals/CatManagerModal.jsx:141-142`, `src/modals/PersonSheet.jsx:160-161`, `src/modals/RulesModal.jsx:146-147`, `src/modals/SettingsSheet.jsx:399-400`. Each file re-declares the SVG path data locally; there is no shared `TrashIcon` component imported across files.

**Pencil SVG (edit), same `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`:**
9 occurrences, same non-shared pattern — `src/views/OverviewView.jsx:54-59`, `src/views/ExpensesView.jsx:60-65`, `src/views/GoalsView.jsx:158-161`, `src/views/RecurringView.jsx:156-159`, `src/views/GroupsView.jsx:353-356`, `src/views/IncomesView.jsx:187`, `src/views/LoanView.jsx:79`, `src/modals/CatManagerModal.jsx:135`, `src/modals/PersonSheet.jsx:149`.

**"Stat card" (`.cd` card + `.lb` eyebrow + big bold number) — shared CSS classes confirmed in `src/styles/tokens.css:140-141`** (`.lb{font-size:11px;...text-transform:uppercase;font-family:var(--mono)}`, `.cd{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;box-shadow:var(--shadow)}`). Concrete instances in the required surface: `OverviewView.jsx` — "Resumo" card (587-618), "Podes gastar" (338-412), "Saúde financeira" (634-686), "Fundo de emergência" (758-786), "Projecao N meses" (789-846), "Fecho de {mês}" (302-333); `ExpensesView.jsx` — "DESPESAS {mês}" total card (593-607); `GoalsView.jsx` — global progress card (84-94, bar but no `.lb`); `InvestmentsView.jsx` — "Carteira" (32-43); `RecurringView.jsx` — uses the sibling `StatTiles` component (not `.cd`) instead, at line 103; `GroupsView.jsx` — "Total do grupo" (366-377) and the hero variant "Saldo global dos grupos" (613-625, uses `.hero` class, not `.cd`).

**Progress bar — two parallel implementations of the same affordance:**
1. Shared `.bar`/`.bar-fill` CSS class (`tokens.css:151-152`, `height:4px` default): 8 literal call-sites — `OverviewView.jsx:622` (savings-rate), `:651` (health score), `:778` (emergency fund); `ExpensesView.jsx:709` (category budget); `GoalsView.jsx:85` (global progress); `InvestmentsView.jsx:90` (allocation); `LoanView.jsx:92`; `ReportView.jsx:174`.
2. Bespoke inline `height:`+`borderRadius: 999`+`background:` divs that reproduce the same visual without the shared class: `OverviewView.jsx:359-362` (2-segment "Podes gastar" bar, spent+pendingFixed), `:422-426` (3-segment "Plano do mês" envelope bar), `:666-668` (3px-tall per-line health-breakdown bars); `CardsView.jsx:105-106` (plafond usage bar, height 8); `Hero.jsx:127-137` (asset-allocation bar, height 6, multi-segment).

**Empty-state block (`className="empty"`):** 18 occurrences across 14 files — `IncomesView.jsx:91,158`, `CardsView.jsx:42`, `RecurringView.jsx:63`, `ReportView.jsx:151`, `AIView.jsx:785`, `InvestmentsView.jsx:58`, `TransfersView.jsx:37`, `GroupsView.jsx:396,422,448,569`, `ExpensesView.jsx:274,643`, `GoalsView.jsx:54`, `BalanceHistorySheet.jsx:27`, `PersonSheet.jsx:127`, `RulesModal.jsx:120`. One additional use is semantically different: `Shell.jsx:148` reuses the same `.empty` class for the lazy-view loading fallback ("A carregar…"), not an empty-data state.

### A4. Dead code (unused imports/exports, comment-false-positives excluded)

- `React` default-imported but never referenced as `React.xxx` in-file (JSX needs no explicit import under the automatic runtime; confirmed via `vite.config.js` using `@vitejs/plugin-react` and no other `React.` usage in each file): `src/views/OverviewView.jsx:19`, `src/views/CardsView.jsx:7`, `src/views/GroupsView.jsx:16`, `src/views/InvestmentsView.jsx:6`, plus the same pattern in essentially every file under `src/modals/*.jsx` (23 of the 24 non-test modal files checked: `AcctModal`, `ActionSheet`, `AddExpenseSheet`, `AssistantSheet`, `BalanceHistorySheet`, `BalanceLockSheet`, `BalanceUpdateSheet`, `CardPayModal`, `CatManagerModal`, `GoalModal`, `GroupExpenseSheet`, `GroupSheet`, `HousingModal`, `ImportStatementSheet`, `IncomeModal`, `MoreMenu`, `PatchNotesSheet`, `PersonSheet`, `PositionModal`, `RecModal`, `RulesModal`, `SettingsSheet`, `SettleSheet`, `TransferModal`). `ExpensesView.jsx` and `GoalsView.jsx` are the only two of the 7 required views where `React` is imported and genuinely unused-but-flagged-clean (their grep hits on "React" were doc-comment text, not code) — actually confirmed clean of this pattern.
- `PrimaryButton` imported but never used: `src/modals/BalanceUpdateSheet.jsx:22` (`import { PrimaryButton } from '../components/Buttons.jsx';` — no JSX reference anywhere else in the file).
- `useState` imported but never called: `src/modals/SettingsSheet.jsx:10` (`import React, { useState, useCallback } from 'react';` — no `useState(` call in the file).
- `fmDate` exported from `src/lib/format.js:98` (produces `"20/08/2026"`) is never imported anywhere in `src` outside its own test file — confirmed via a whole-repo grep for `\bfmDate\b` excluding `fmDateShort`. Dead export.
- Duplicate/near-duplicate constant arrays instead of importing the shared one: `src/lib/months.js:16` already exports `MONTH_SHORT = ['Jan','Fev',...,'Dez']` (capitalized), yet `src/views/ExpensesView.jsx:52` re-declares an identical local `const MONTH_SHORT = [...]` instead of importing it; `src/views/RecurringView.jsx:22` declares a third, lowercase variant `MONTHS_SHORT = ['jan','fev',...]`; `src/views/OverviewView.jsx:48-51` and `src/components/Shell.jsx:157` each independently declare a full-month-name array (`MONTHS_LONG` / `MONTHS_PT`, both capitalized, identical content).

### A5. Navigation inventory

**Bottom nav (`Shell.jsx` `BottomNav`, lines 193-225, mobile layout only):** 4 fixed slots — Resumo (`overview`), Despesas (`expenses`), central "+" (opens the `action` modal, not a view), Metas (`goals`), Mais (opens the `more` modal). 3 of these are direct 1-tap view destinations.

**"Mais" sheet (`src/modals/MoreMenu.jsx`, `ITEMS` array lines 22-35):** 12 destinations — Grupos, Receitas, Recorrentes, Calendário, Gráficos, Relatórios, Investimentos, Transferências, "Fiscal (IRS/IMI/IUC)", "Cartões de crédito", Crédito, "Assistente IA" — plus 2 non-tab entries below a divider: Definições (opens `settings` modal) and Novidades (opens `patchNotes` modal).

**Desktop sidebar (`src/components/Sidebar.jsx`, `NAV` array lines 27-38):** 10 entries — Resumo, Despesas, Grupos, Metas, Receitas, Recorrentes, Calendário, Gráficos, Crédito, "Assistente IA" — all 1-tap from the sidebar, plus a separate "Adicionar" action button (line 67-69) and, below a spacer, Definições and a theme-cycle button.

**Total distinct tab/view destinations:** 15, matching the `VIEWS` map in `Shell.jsx:112-128` (`overview, expenses, goals, groups, cal, income, rec, charts, loan, ai, report, invest, transfers, cards, tax`) and the 15 `.jsx` files under `src/views/`.

**Mobile reachability:** 3 views in 1 tap (overview/expenses/goals via `BottomNav`); the other 12 in 2 taps (tap "Mais", then the item).

**Desktop reachability — gap found:** the Sidebar `NAV` array (10 keys) is missing 5 of the 15 view keys that exist in `VIEWS`/`MoreMenu.ITEMS`: `report`, `invest`, `transfers`, `cards`, `tax`. A whole-repo grep for `goTab(` (`grep -rn "goTab(" src --include="*.jsx"`) shows the only call sites are `Sidebar.jsx:76`, `MoreMenu.jsx:86`, `OverviewView.jsx:265` (a "Grupos" shortcut, already in `NAV`) and `ActionSheet.jsx:75` (falls back to `groups`, already in `NAV`). A whole-repo grep for `open('more')` / `open("more")` shows the only call site is `Shell.jsx:330`, inside the function's `mode === 'desktop'` branch is never reached — that call lives in the **mobile-layout return** only (the desktop-layout return at lines 282-314 renders `<Sidebar/>` and never renders `<BottomNav/>` nor calls `open('more')`). Consequently, in desktop layout (`useDevice()` `mode === 'desktop'`), there is no UI control that opens the "Mais" sheet or otherwise reaches `report`, `invest`, `transfers`, `cards`, or `tax` — the only path found is via `DeviceToggle` (`src/components/DeviceToggle.jsx`, rendered inside `Sidebar.jsx:65`), switching `mode` to `'mobile'` (a "Telemóvel" preview), which re-renders the mobile Shell branch with its `BottomNav`/"Mais", from which those 5 views become reachable in 2 taps. On an actual phone (`canToggle` false, mode forced to `mobile` per the comment at `DeviceToggle.jsx:3`), all 15 views are reachable within 2 taps as described above.

### A6. Primary-task step counts (from the Resumo/`OverviewView` tab, tracing actual handlers)

**(a) Record an expense with a category and amount.** `QuickActions.jsx:13` "Despesa" button → `open('add')` → mounts `AddExpenseSheet.jsx` (`Shell.jsx:42`). Required fields, per `submit()` validation (`AddExpenseSheet.jsx:127-154`): `desc` (non-empty) and, when not shared, `amount` (>0). Category defaults to `cat: 'rest'` (`freshDraft()`, line 35; `rest` → icon `food`, per `src/lib/categories.js:17`) — no tap required to accept the default. **Minimum: 2 taps** — "Despesa" quick action (open sheet) + "Adicionar despesa" (submit, footer button, `AddExpenseSheet.jsx:223-225`) — plus typing description and amount. Explicitly picking a category adds 1 tap on a category-icon button (grid of `cats.map(...)`, lines 241-270) → **3 taps** if the default category is not accepted. (Alternate route: central "+" → "Nova despesa" in `ActionSheet.jsx:81-90` → same sheet → submit = 3 taps, one more than the QuickActions shortcut.)

**(b) See "how much can I spend today".** The "Podes gastar" card (`OverviewView.jsx:337-412`) renders directly on the Resumo tab (the app's default/landing tab) whenever `allow.ready` is true (i.e. monthly income already registered — `dailyAllowance()` in `src/lib/pulse.js`). **Minimum: 0 taps** beyond being on Resumo. If no income is registered yet, the same card instead shows a "Regista o teu rendimento mensal..." prompt with a "+ Adicionar rendimento" button (line 402-408) that opens the `income` modal — a one-time setup step, not part of the steady-state flow.

**(c) Record a credit-card payment.** No shortcut exists in `ActionSheet.jsx`'s 9 items (`Nova despesa, Despesa de grupo, Nova receita, Scan recibo, Importar extrato, Nova meta, Nova recorrência, Transferência entre contas, Nova conta` — lines 79-182; no card-payment entry). Path: tap "Mais" (`BottomNav`, 1) → tap "Cartões de crédito" (`MoreMenu.ITEMS`, id `cards`, 2) → in `CardsView.jsx`, tap that card's "Pagar dívida" button (line 120-126, 3) → `CardPayModal.jsx` opens pre-filled (`card` = the tapped card, `from` defaults to `payers[0]`, per `useEffect` lines 41-51) → type the amount (required; `save()` validation lines 55-72) → tap "Registar pagamento" (footer button, 4). **Minimum: 4 taps** + 1 required field (amount), assuming the pre-filled origin account is correct; changing it adds a select-tap.

**(d) Add a recurring charge.** Central "+" (`BottomNav`, 1) → "Nova recorrência" (`ActionSheet.jsx:147-157`, 2) → `RecModal.jsx` opens blank (`EMPTY`, line 21: `cat: 'sub'` default) → type Nome (required, `saveRec()` line 80-83) and Valor (required, >0, lines 84-87) → tap "Adicionar" (footer, 3). **Minimum: 3 taps** + 2 required fields (Dia defaults to 1 if blank, line 88; Categoria defaults to `sub`). (Alternate, slower route for known brands: Mais → Recorrentes (2 taps) → tap a suggestion chip in `Suggestions` (`RecurringView.jsx:33-51`, only shown when the user has <3 recurrences, 3 taps) → still opens `RecModal` pre-filled with only name+category → still must type Valor and tap "Adicionar" (4th tap) — one tap slower than the direct route.)

### A7. Modals / sheets inventory (`MODAL_COMPONENTS`, `Shell.jsx:41-66`)

| Key | Component file |
|---|---|
| `add` | `src/modals/AddExpenseSheet.jsx` |
| `stmt` | `src/modals/ImportStatementSheet.jsx` |
| `settings` | `src/modals/SettingsSheet.jsx` |
| `goal` | `src/modals/GoalModal.jsx` |
| `rec` | `src/modals/RecModal.jsx` |
| `income` | `src/modals/IncomeModal.jsx` |
| `cat` | `src/modals/CatManagerModal.jsx` |
| `acct` | `src/modals/AcctModal.jsx` |
| `rules` | `src/modals/RulesModal.jsx` |
| `action` | `src/modals/ActionSheet.jsx` |
| `more` | `src/modals/MoreMenu.jsx` |
| `balanceUpdate` | `src/modals/BalanceUpdateSheet.jsx` |
| `balanceHistory` | `src/modals/BalanceHistorySheet.jsx` |
| `patchNotes` | `src/modals/PatchNotesSheet.jsx` |
| `lock` | `src/modals/BalanceLockSheet.jsx` |
| `housing` | `src/modals/HousingModal.jsx` |
| `position` | `src/modals/PositionModal.jsx` |
| `transfer` | `src/modals/TransferModal.jsx` |
| `cardpay` | `src/modals/CardPayModal.jsx` |
| `group` | `src/modals/GroupSheet.jsx` |
| `person` | `src/modals/PersonSheet.jsx` |
| `gexp` | `src/modals/GroupExpenseSheet.jsx` |
| `settle` | `src/modals/SettleSheet.jsx` |
| `assistant` | `src/modals/AssistantSheet.jsx` |

24 keys, all lazy-loaded (`lazy(() => import(...))`) and mounted once-opened-stays-mounted (`Shell.jsx:231-247`).

---

## 3. Part B — Copy & honesty findings

### B1. User-facing strings inventory (sample; exhaustive for the 7 required views + Shell/QuickActions/ContextStrip/Onboarding)

- **`Shell.jsx`**: header greeting `"Olá, " + name` or fallback `"Proof. Finance"` (178); month/year (`"Setembro 2026"`-style, 174-175); bottom-nav labels "Resumo" / "Despesas" / "Metas" / "Mais" (208-222); sync chip states "A guardar" / "Guardado" / "Erro" (133); theme toggle `aria-label="Mudar tema"` (184); FAB `aria-label="Adicionar"` (210); loading fallback "A carregar…" (152).
- **`QuickActions.jsx`**: "Saldo", "Despesa", "Receita", "IA", "Mais" (12-16).
- **`ContextStrip.jsx`**: "Gastos do mês", "Receita mensal recorrente", "Progresso global", "N grupo(s) ativo(s)", "Património liquido", "Dívida dos cartões", "Deduções estimadas", "Transferências registadas", "Posições" / "Carteira de investimentos" (39-124).
- **`Onboarding.jsx`**: "Começa em quatro passos" (54); body copy (57-58); 4 steps — "Regista o teu rendimento mensal", "Importa o extrato do banco (Excel ou CSV)", "Adiciona as tuas contas e cartões", "Cria uma meta de poupança" (30-48).
- **`OverviewView.jsx`** (sample of ~30 distinct strings): "Grupos" / "Amigos devem-te …" / "Deves …" (279-293); "Fecho de {mês}" / "% vs média" / "gastos" / "Poupaste …" (304-319); "Podes gastar" / "{N} dias até fim do mês" / "/dia" / "disponíveis" / "(fixas por pagar já descontadas)" (342-357); "+ Adicionar rendimento" (407); "Plano do mês" / "salário recebido" / "Fixas" / "Metas" / "Livre" / "Metas já reforçadas este mês." / "Reservar … para as metas" (418-456); "Disponível" / "liquidez" / "Investimentos" (534-577); "Resumo · {mês}" / "% poupado" / "Receita" / "Despesa" / "Saldo" (587-617); "Saúde financeira" / "/ 100" / "Para subir o score" (637-682); "Subscrições detectadas" / "Estas despesas repetem-se. Queres regista-las como recorrentes?" / "Não e" / "Adicionar" (692-741); "Fundo de emergência" / "Sólido" / "Razoável" / "Fraco" / "Crítico" / "meses cobertos" / "Reserva:" / "Despesa/mês:" / "0" / "3 meses" / "6 meses (ideal)" (761-785); "Projecao {N} meses" (791); "Contas por categoria" (853); "Editar conta" / "Remover conta" / "Histórico de saldos" (aria-labels, 915-944).
- **`ExpensesView.jsx`** (sample): "Pesquisar…" placeholder (208, 501); "Limpar pesquisa" (216); "{N} resultado(s)" (262); `'Sem resultados para "…"'` (275); "Todas as contas" / "Limpar" (245, 256); "Limpar importadas: N duplicada(s) + N data(s)" / "Remover N despesa(s) duplicada(s)" / "Corrigir N data(s) errada(s)" (432-436); "DESPESAS {mês}" / "Despesas 3M (últimos 3 meses)" / "Despesas Q1" (596); "Salário" (601); "Recorrentes de {mês} (N)" / "Registar" (612-633); "Sem despesas neste período" / "Toca no + em baixo / para adicionar a primeira." (648-653); "Rollover do orçamento" / "O que sobra/falta transita para o mês seguinte" / "ON"/"OFF" (666-669); "Resta …" / "+…" over budget (727-730); "Transitado do mês anterior: …" (695-696); "Importadas" (749); "Sem transações detalhadas" (792); "Remover" (782); "Remover as N despesas de {mês} (para reimportar o extrato)" (812).
- **`GoalsView.jsx`**: "Ainda não tens metas" / "Cria a tua primeira meta de poupança: / fundo de emergência, ferias, casa nova..." (60-67); "{X} de {Y}" / "{Z} restantes" (89-92); state chips "concluída" / "atrasada" / "no ritmo" / "a começar" (116); "Não chega para o prazo: precisas de …/mês …" (118-120); "{N}/mês · conclui {mês} ({N} mês(es))" / "REFORÇADA ESTE MÊS" (193-201); "Sugestão: ~ …/mês para o prazo" (205); "+10/+50/+100/+500" quick-add buttons (22, 237).
- **`CardsView.jsx`**: "Sem cartões de crédito" / "Adiciona uma conta com categoria "Cartão de crédito" e define o plafond." / "+ Novo cartão" (43-53); "Crédito" (83); "Dívida atual" (88); "… de … de plafond" / "Sem plafond definido — edita o cartão" / "· plafond excedido" (98-99); "Editar" (102); "Disponível …" (109); "+ Despesa no cartão" / "Pagar dívida" (118, 125); "Pagamentos (N) · …" (133); "+ N outros — ver em Mais → Transferências" (147); "Despesas do cartão (N)" / "Ainda sem despesas neste cartão." (154, 156).
- **`RecurringView.jsx`**: "Sem despesas recorrentes" / "Regista subscrições (Netflix, ginásio, / seguros, telecom...) para teres uma / visao clara do gasto mensal fixo." (69-77); "Costumas ter?" / "Toca para adicionar com o nome e a categoria já preenchidos." (39-40); StatTiles "por mês" / "por ano" / "por pagar" (105-107); "PAGA" badge (135); relative day "hoje"/"amanhã"/"em N dias" (144).
- **`GroupsView.jsx`**: "Grupos" header (265); "Gerir pessoas" aria-label (266); "Devem-te …" / "Deves …" / "Sem saldo" (51-54); "✓ acertado" (98); "Ainda não tens grupos" / "Cria um grupo para dividir despesas de viagens, / casa partilhada ou saídas com amigos." (576-583); "Novo grupo" / "+ Novo grupo" (589, 632); "Saldo global dos grupos" / "Tens a receber" / "Tens a pagar" / "Contas equilibradas" / "A receber …" / "A pagar …" (614-624); "Ativos" / "Acertados" (637, 657); detail: "Despesas" / "Saldos" / "Atividade" segments (28-31); "Total do grupo" / "tu pagaste … · a tua parte …" (367-370); "Sem despesas registadas." / "Sem atividade registada." / "✓ Contas acertadas." (396,422,448); "Tens a receber …" / "Deves …" / "Acertado" (197); "Para acertar" / "Acertar" (245-248, 420); "Partilhar resumo" / "Resumo copiado" (322, 439-441); "Dados de exemplo — inicia sessão para criares os teus próprios grupos." (362).
- **`InvestmentsView.jsx`**: "Carteira" / "+ Posição" (34-35); "Sem posições" / "Adiciona ações, ETFs ou cripto com quantidade, preço médio e preço atual." (59-60); "{qty} un." / broker chip (70-71); "% da carteira" (93).

### B2. Flagged jargon / unclear labels

| Term | Location | Plain-PT alternative |
|---|---|---|
| "plafond" (visible field label "Plafond mensal" + card copy "de plafond" / "plafond excedido" / "Sem plafond definido") | `CardsView.jsx:45,98,99`; `AcctModal.jsx:160` (`<label>` text) | "limite mensal" / "limite excedido" |
| "Rollover do orçamento" (feature name shown as a toggle label; subtitle does explain it) | `ExpensesView.jsx:666` | "Transportar saldo para o mês seguinte" |
| "Transitado do mês anterior: …" (badge tooltip/aria-label) | `ExpensesView.jsx:695-696` | "Sobra do mês passado: …" |
| "P2P Lending" (raw English acronym+word, account-type dropdown option) | `AcctModal.jsx:21` (`ACCT_TYPES`) | "Empréstimo entre particulares" |
| "Corretagem" / "Corretora (opcional)" (account type + field label) | `AcctModal.jsx:21`; `PositionModal.jsx:67`; `ChartsView.jsx:56` ("TR Corretagem" chart legend) | "Conta de investimento" / "Instituição / plataforma" |
| "Rend. Fixo" (abbreviated account type) | `AcctModal.jsx:21` | "Rendimento Fixo" (spelled out) |
| "3M" (tab label for the 3-month expense view, only spelled out as "3 meses" in the adjacent total-card heading) | `ExpensesView.jsx:588` vs `:596` | spell out "3M" consistently, or keep "3M" everywhere |
| "Q1" (raw, undexpanded, shown only in preview/demo mode) | `ExpensesView.jsx:588,596`; `IncomesView.jsx:82,127,134` | "1º trimestre" |
| "IUC" / "IMI" / "IRS" (official PT tax acronyms, used unexpanded in nav subtitle and headings) | `MoreMenu.jsx:31` ("Fiscal (IRS/IMI/IUC)"); `TaxView.jsx:66,89,165,171` | acceptable to most adult PT users but never spelled out on first use anywhere in the checked surface |
| Fundo-de-emergência status labels "Sólido" / "Razoável" / "Fraco" / "Crítico" (thresholds not shown anywhere near the label, only inferable from the 0/3/6-month bar underneath) | `OverviewView.jsx:181` (logic), labels rendered at `:766` | keep, but consider surfacing the month thresholds inline |

"materializar" appears only inside a code comment (`ImportStatementSheet.jsx:48`), never in user-facing text — not a real jargon exposure, noted for completeness.

### B3. Label → behaviour mismatches

- **"Scan recibo" does not scan.** `ActionSheet.jsx:113-123` renders an item titled "Scan recibo" with subtitle "IA extrai e classifica (requer API key)" whose `onClick` is `() => go('add', { scan: true })` — i.e. it opens the `add` modal (`AddExpenseSheet.jsx`) with payload `{ scan: true }`. The file's own header comment (`ActionSheet.jsx:12`) documents the intended behaviour as "AddExp auto-triggers camera". However `AddExpenseSheet.jsx` (the component mounted for the `add` key, per `Shell.jsx:42`) only ever reads `payload.editId` and `payload.prefill` (lines 70-77) — there is no reference to `payload.scan` anywhere in the file, and no camera/file `<input>` in it at all (contrast with `BalanceUpdateSheet.jsx:147-148` and `ImportStatementSheet.jsx:420-421`, which do have `<input type="file" capture="environment">` for their own scan flows). Tapping "Scan recibo" opens a blank "Nova despesa" form identical to tapping "Nova despesa" — no scan/camera step occurs.
- **Contradictory claim about needing an API key.** The same "Scan recibo" subtitle says "(requer API key)" (`ActionSheet.jsx:115`), while `SettingsSheet.jsx:254` states "O assistente e o scanner de recibos correm através de um serviço seguro da app — não precisas de nenhuma chave." ("...you don't need any key") — the two visible strings directly contradict each other about the same feature.

### B4. Inflations / marketing language

None found in the required surface. Copy is factual/functional throughout (e.g. "Regista o teu rendimento mensal", "Cria a tua primeira meta de poupança") with no superlatives, no "the best/easiest way to…" framing, and AI-tier costs are disclosed as plain per-message dollar estimates (`SettingsSheet.jsx:60-62`, e.g. `"~$0,003 / mensagem"`) rather than vague/inflated claims.

### B5. Dark patterns

None found. Specifically checked and not present in the required surface:
- **Forced continuity / hidden cost**: no billing or subscription flow exists in the app at all; AI-tier costs are shown transparently as per-message estimates (`SettingsSheet.jsx:60-62,284`).
- **Fake scarcity / confirmshaming**: grepped for common PT scarcity/guilt phrasing ("só hoje", "última chance", "não percas", "de certeza", "oferta", "grátis") — no hits in `src/views`, `src/modals`, `src/components`.
- **Pre-checked options**: grepped for `checked={true}` / `defaultChecked` in `src/views` and `src/modals` — zero hits. The one boolean toggle read in full (`AddExpenseSheet.jsx`'s "Despesa partilhada" switch, lines 293-335) defaults to `false`/off.
- **Disguised ads**: none present; the app has no third-party ad surface.
- Destructive actions (delete expense/account/recurring/etc.) consistently go through a native `confirm()` dialog with a plain question (e.g. `"Remover esta despesa?"` — `ExpensesView.jsx:145`; `"Remover a conta " + a.b + " · " + a.t + "? As leituras de saldo desta conta também são removidas."` — `OverviewView.jsx:935`) rather than a styled/biased custom dialog.

### B6. Tone consistency

**"tu" form used consistently** across every file read; no "você" found anywhere in `src/views`, `src/modals`, `src/components` (whole-surface grep for `\bvocê\b` / `\bVocê\b`: zero hits). Examples: "Ainda não tens metas" (`GoalsView.jsx:61`), "Regista o teu rendimento mensal" (`Onboarding.jsx:30`), "Cria a tua primeira meta" (`GoalsView.jsx:64`), "Toca no + em baixo…" (`ExpensesView.jsx:650`). The handful of "seu/sua" hits found are all inside code comments, not UI text (e.g. `GroupsView.jsx:535`, `ImportStatementSheet.jsx:61`).

**No leaked English UI strings found** (grepped for `"OK"`, `>OK<`, `"Cancel"`, `"Save"`, `"Delete"`, `"Loading"`, `"Submit"`, `"Close"` — zero hits in the required-surface `.jsx` files). Isolated English terms that do appear are domain/brand terms, not UI chrome: "P2P Lending", "Crypto Wallet" (account-type options, `AcctModal.jsx:21`), "ON"/"OFF" toggle state text (`ExpensesView.jsx:669`).

**Inconsistent accenting of the same words, same app, sometimes same file:**
- "Poupanca" (no cedilla) vs "Poupança": unaccented form used as a user-visible subtitle — `OverviewView.jsx:763` ("Liquidez + Poupanca / despesa media", under the "Fundo de emergência" card) and as literal dropdown option text a user reads and picks — `AcctModal.jsx:20-21` (`ACCT_CATEGORIES`/`ACCT_TYPES` both contain `'Poupanca'`) — versus the correctly accented "Poupança" at `OverviewView.jsx:391` (inside the same file's "Podes gastar" card).
- "Património Liquido" (no accent on í) vs "Património líquido": the unaccented form is the single largest/most prominent piece of text in the whole app — the 36px hero headline label on the Resumo tab, `Hero.jsx:72` — and also appears at `ContextStrip.jsx:83` and `:123` (label shown above every non-overview tab) and `ChartsView.jsx:50` (chart legend). The correctly accented "Património líquido" appears in the very same file, `ChartsView.jsx:78`, one chart later.
- Other unaccented instances of the same class: "visao" for "visão" (`RecurringView.jsx:77`, empty-state copy), "Projecao" for "Projeção" (`OverviewView.jsx:791`, card heading), "informacao" for "informação" (`AIView.jsx:523`), "Variacao" for "Variação" (`Hero.jsx:75`, screen-reader-only `aria-label`), "despesa media" for "despesa média" (`OverviewView.jsx:763`).
- **Inconsistent capitalisation of the same 3-letter month abbreviations, defined 3× separately** instead of reusing the one shared export: `src/lib/months.js:16` exports a canonical, capitalized `MONTH_SHORT` (`'Jan','Fev',...`); `ExpensesView.jsx:52` re-declares an identical local copy instead of importing it (used for the month-tab bar, capitalized: "Jan Fev Mar Abr"); `RecurringView.jsx:22` declares a third, **lowercase** variant `MONTHS_SHORT` (`'jan','fev',...`, used for next-charge dates, e.g. "3 out"); `src/lib/format.js`'s internal `MON_PT` (used by `fmDateShort`, producing "20 ago") is also lowercase, matching `RecurringView` but not `ExpensesView`'s tab-bar convention.

### B7. Number/currency formatting (`src/lib/format.js`)

- `fm(v)` (lines 12-19): pt-PT locale, **2 decimals**, comma decimal separator, space thousands separator (via `Intl`/`toLocaleString('pt-PT', ...)`), symbol **after** the number with a non-breaking space (`EURO = ' €'`, line 9) → e.g. `"1 234,56 €"`.
- `fc(v)` (lines 27-34): same locale/format but **0 decimals** → e.g. `"1 234 €"`.
- Negative sign placement: not manually handled — falls through to `Number.prototype.toLocaleString`'s default (minus sign before the number, e.g. `"-1 234,56 €"`); several call sites manually prepend their own `+`/`-` for signed deltas instead of relying on the formatter, e.g. `OverviewView.jsx:376-380` (`(forecast.overBudget ? ' — ' + fc(-forecast.projectedEnd) ... : ...)`), `GroupsView.jsx:152-153` (`impactCents > 0 ? 'emprestaste ' : 'deves ' + fm(fromCents(Math.abs(impactCents)))`), `InvestmentsView.jsx:40,84` (`(tpl >= 0 ? '+' : '') + fc(tpl)`).
- **Bypass check**: grepped the required-surface views/modals for raw `€` template usage and `.toFixed(` calls. Every raw `"…(€)"` occurrence found is an **input-field label** (unit hint next to a numeric `<input>`), e.g. `"Valor (€)"` (`AddExpenseSheet.jsx:383,389`; `CardPayModal.jsx:117`; `IncomeModal.jsx:188-189`; `TransferModal.jsx:79`; `SettleSheet.jsx:221`), `"Total (€)"` (`AddExpenseSheet.jsx:341,347`), `"Preço (€)"` / `"Entrada (€)"` (`LoanView.jsx:131,135`), `"IMI anual (€)"` (`TaxView.jsx:165`) — none of these are a formatted monetary *value* bypassing `fm`/`fc`. Every `.toFixed(` call found in the 7 required views formats a **percentage** or an internal SVG-coordinate calculation, never a currency amount (e.g. `ExpensesView.jsx:714` `r.pct.toFixed(0)+'%'`; `GoalsView.jsx:85,181`; `InvestmentsView.jsx:40,84,93`; `OverviewView.jsx:151,206,208,589,591,770,881`). **No currency-formatting bypass found** in the required surface.

### B8. Date formatting inventory

At least **9 visually distinct date/period representations** found across the required + sampled surface:
1. Full month name + year, capitalized: `"Setembro 2026"` — `Shell.jsx:157,175` (`MONTHS_PT`).
2. `"Resumo · {mês}"` full month name via a **second, independently-declared** array — `OverviewView.jsx:48-51,587` (`MONTHS_LONG`).
3. Capitalized 3-letter month abbreviation for the expense month-tab bar — `ExpensesView.jsx:52,568-590` (local `MONTH_SHORT`, e.g. "Jan Fev Mar Abr").
4. Lowercase 3-letter month abbreviation for "next charge" dates (e.g. `"3 out"`) — `RecurringView.jsx:22,143` (local `MONTHS_SHORT`).
5. `"{day} {mon}"` / `"{day} {mon} {yy}"` via the shared `fmDateShort()` (`format.js:103-109`, lowercase `MON_PT`, year suffix only if not current year) — e.g. `"20 ago"` — used in `ExpensesView.jsx` (search results), `CardsView.jsx` (payments), `GroupsView.jsx` (day headers, `"20 ago – 24 ago"` ranges at line 91), `TransfersView.jsx`.
6. `"Hoje"` / `"Ontem"` / fallback to `fmDateShort` — `dayLabel()`, `ExpensesView.jsx:71-81` (search-mode day-group headers).
7. Lowercase relative countdown `"hoje"` / `"amanhã"` / `"em N dias"` — `OverviewView.jsx:522`, `RecurringView.jsx:144`, `TaxView.jsx:78` (note: lowercase "hoje"/"amanhã" here vs the capitalized "Hoje"/"Ontem" in pattern 6 above, same underlying concept).
8. `"{N} dias restantes"` / `"Prazo passado"` (no "em" prefix, suffix "restantes" instead) — `GoalsView.jsx:136`, a fourth relative-date phrasing distinct from pattern 7.
9. Raw ISO `YYYY-MM-DD` in native `<input type="date">` fields (browser-rendered, locale-dependent display) — `AddExpenseSheet.jsx:372-378,396-402`, `CardPayModal.jsx:122`, `IncomeModal.jsx`, `TransferModal.jsx`, `SettleSheet.jsx`, `GoalModal.jsx`, `GroupSheet.jsx`, `GroupExpenseSheet.jsx`, `BalanceUpdateSheet.jsx`.

Additionally, `fmDate()` (`format.js:98-102`, would render `"20/08/2026"`, DD/MM/YYYY) is exported but **never called anywhere in the app** (confirmed via whole-repo grep) — a 10th format exists in code but is not actually shown to users. "3M"/"Q1" (`ExpensesView.jsx:588`, `IncomesView.jsx:82,127`) are period-range labels rather than single dates, listed for completeness since they sit in the same tab-bar as the month abbreviations.

---

## 4. Known gaps

- **Dead-code/unused-export scan** was run over the 7 required views + all 24 non-test files in `src/modals/*.jsx` for unused *imports*; a full whole-repo unused-*export* audit (e.g. every export of every `src/lib/*.js` file checked against every importer) was not performed — only `fmDate` was spot-checked and confirmed dead because it surfaced naturally while building the date-format inventory (B8). Other library files were not exhaustively cross-checked.
- **Max-nesting-depth counts (A2)** were derived by manual JSX-tree tracing (Fragments and pure logical/conditional wrappers not counted as depth levels, only actual rendered elements), not by an AST tool — depths are for the single deepest branch identified in each file by inspection of the full file content; a different, automated AST-based depth count could differ by ±1 depending on whether Fragments/conditionals are counted.
- **"Stat card" pattern (A3)** was identified qualitatively against the shared `.cd`/`.lb` CSS classes rather than via a single regex, since the pattern is a structural composition (card + eyebrow + big number) rather than a fixed string; the list given is representative for the required surface, not necessarily exhaustive across all 15 views + 24 modals.
- **Part B string inventories** are exhaustive for `Shell.jsx`, `QuickActions.jsx`, `ContextStrip.jsx`, `Onboarding.jsx`, and close to exhaustive for the 7 required views (every conditional branch was read), but long dynamic/computed strings built from multiple template-literal fragments (e.g. multi-part sentences assembled from 3-4 conditional clauses) are summarized as one entry rather than enumerated per literal fragment.
- **CalendarView, IncomesView, ChartsView, LoanView, AIView, ReportView, TaxView, TransfersView** were only spot-sampled for headings (`className="lb"` occurrences) and targeted jargon/format greps, per the instruction that a sample suffices for the non-required views — their interactive-element counts, nesting depth, and full string inventories were not produced.
- No runtime/browser testing was performed (no dev server was started, no screenshots taken) — all findings are static-code evidence only, as instructed.
