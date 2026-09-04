# Redesign: Resumo, nova despesa, camada de números, sistema e assistente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar as quatro fases do roadmap da auditoria (P0 correções, P1 tarefa primária, P2 sistema, P3 comportamento) e ensinar o assistente de IA a debitar uma despesa na conta que o utilizador nomeia na frase.

**Architecture:** P0 corrige defeitos sem tocar na estrutura (reset CSS, guardas, modo oculto via `mask()`, harness, copy, tool `add_expense` com `acct` resolvido por `resolveAccountRef`). P1 cria `src/lib/metrics.js` como única fonte por indicador, `ConfirmSheet` + toast com "Anular" sobre `actions.patch(snapshot)`, reordena `AddExpenseSheet` (valor primeiro, categorias por frequência) e reduz o Resumo a 5 blocos, movendo o resto para Gráficos e Relatório. P2 introduz tokens de espaçamento/tipo, `Amount`, `ViewHeader` com voltar, "Mais" agrupado, URL com tab e mês, `MonthNav` único, alvos de 44 px e a tab "Transações". P3 muda o enquadramento da copy, o hero, o primário escuro, e adiciona service worker com prompt.

**Tech Stack:** React 18 + Vite, Vitest + Testing Library (jsdom), Firestore (campos opcionais, sem migração), `vite-plugin-pwa` (única dependência nova, em P3).

**Spec:** `docs/superpowers/specs/2026-09-04-redesign-resumo-despesa-numeros-design.md` (decisões D1–D21) e `DESIGN-IS-2026-09-04/03-verdict.md`.

## Global Constraints

- **Sem dependências novas** exceto `vite-plugin-pwa` na Task 19 (D18).
- **Campos novos são opcionais**; `hydrateFromDoc` já tolera ausência; sem migração Firestore.
- **Valores de dados não mudam**: `'Poupanca'`, `'Conta a Ordem'`, ids de categoria, chaves de `C.grp`/`C.cT` ficam como estão (são chaves persistidas). Só copy visível muda.
- **Copy em PT-PT com acentos; sem emoji na UI** (exceto o `emoji` dos grupos). Comentários em português no estilo dos vizinhos.
- **Acessibilidade:** botões só com ícone têm `aria-label`; alvos ≥44 px onde a tarefa o pede; sem `outline:none` sem substituto.
- **Testes:** `npm test` verde no fim de cada tarefa; `npx vitest run <ficheiro>` para iterar; `npm run build` e `node scripts/layout-check.mjs` (vite em 5199) no fim de cada fase.
- **Mocks de Firebase** em cada teste de view/modal: copiar o bloco `vi.mock` de `src/components/hero.test.jsx`. `renderWithStore(<X/>, { fixture, tab, openModal, payload, preview })` de `src/test/renderWithStore.jsx`; `richFixture()`/`emptyFixture()` de `src/test/fixtures.js`.
- **Commits:** `tipo(escopo): mensagem` em PT com trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Push para `origin react` no fim de cada fase e no fim do plano.
- **`testes.html`** ganha uma suite T46 na última tarefa.

Sonda para ler o estado dentro de um teste:
```jsx
function Probe({ pick }) { const { state } = useStore(); return <pre data-testid="probe">{JSON.stringify(pick(state))}</pre>; }
```

---

## P0 — Correções sem redesign

### Task 1: Reset de cor, `color-scheme`, `NaN`, `isNewUser` e harness

**Files:**
- Modify: `src/styles/tokens.css:13` (`color-scheme`), `:114` (`button` reset)
- Modify: `src/views/LoanView.jsx:104-105`
- Modify: `src/components/Shell.jsx:255`
- Modify: `src/test/fixtures.js:110-112`, `src/devPreview.jsx:28-31`, `dev.html` (`<head>`)
- Test: `src/test/p0.fixes.test.jsx`

**Interfaces:** nenhuma nova. `applyTheme` já é exportado de `src/store/store.jsx:107`.

- [ ] **Step 1: Teste que falha**

```jsx
// src/test/p0.fixes.test.jsx
import React from 'react';
import fs from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture, emptyFixture } from './fixtures.js';
import LoanView from '../views/LoanView.jsx';
import Shell from '../components/Shell.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {},
}));
afterEach(() => cleanup());

const css = fs.readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

describe('P0: reset e tema', () => {
  it('button herda a cor do texto (evita branco-sobre-claro em .cd)', () => {
    const rule = css.split('\n').find((l) => /^button\{/.test(l));
    expect(rule).toMatch(/color:inherit/);
  });
  it('color-scheme segue o data-theme, não o sistema', () => {
    expect(css).toMatch(/:root\{[^}]*color-scheme:\s*light/);
    expect(css).not.toMatch(/:root\{[^}]*color-scheme:\s*light dark/);
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*color-scheme:\s*dark/);
  });
});

describe('P0: NaN no crédito', () => {
  it('sem impostos preenchidos mostra "—" e nunca NaN', async () => {
    const fx = richFixture();
    fx.housing = { valorAquisicao: 200000, valorEmprestimo: 150000, taxa: 3, prazoAnos: 30 };
    await renderWithStore(<LoanView />, { fixture: fx });
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('P0: utilizador novo', () => {
  it('não abre as Novidades por cima de um utilizador sem dados', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: { ...emptyFixture(), lastSeenPatchVersion: 0 } });
    expect(screen.queryByRole('dialog', { name: /Novidades/ })).toBeNull();
    expect(screen.getByText('Começa em quatro passos')).toBeTruthy();
  });
  it('emptyFixture não dispara as Novidades no harness', () => {
    expect(emptyFixture().lastSeenPatchVersion).toBe(999);
  });
});
```

- [ ] **Step 2: Correr** `npx vitest run src/test/p0.fixes.test.jsx` → 4 falhas.

- [ ] **Step 3: `tokens.css`** — linha 13: `color-scheme: light dark;` → `color-scheme: light;`. Confirmar que o bloco `html[data-theme="dark"]{` (linha 76) contém `color-scheme: dark;` (o mapa diz que sim; se não tiver, acrescentar como primeira declaração). Linha 114: acrescentar `color:inherit;` logo a seguir a `font-family:var(--font);` na regra `button{…}`.

- [ ] **Step 4: `LoanView.jsx:104-105`** — trocar por:
```jsx
<Row label="Capitais próprios" value={h.capitaisProprios != null && h.capitaisProprios !== '' ? mv(h.capitaisProprios) : '—'} />
<Row label="Impostos na compra (IMT+IS)" value={h.impostos != null && h.impostos !== '' ? mv(h.impostos) : '—'} />
```

- [ ] **Step 5: `Shell.jsx:255`** — `if (!isNewUser(state) && hasUnseenNotes(...))` → `if (!isNewUser({ ...state, currentUser }) && hasUnseenNotes(state.lastSeenPatchVersion))`.

- [ ] **Step 6: harness** — `src/test/fixtures.js`: `export function emptyFixture() { return { lastSeenPatchVersion: 999 }; }`. `src/devPreview.jsx`: importar `applyTheme` de `./store/store.jsx` e, logo depois do `dispatch({ type: 'hydrate', ... })` (ver `renderWithStore`/`Seed` equivalente no ficheiro), chamar `applyTheme(fx.theme || 'light')`. `dev.html`: acrescentar `<link rel="icon" href="data:,">` no `<head>`.

- [ ] **Step 7:** `npx vitest run src/test/p0.fixes.test.jsx src/views/views.render.test.jsx src/components/shell.nav.test.jsx` → PASS. Se `emptyFixture` passar a ter uma chave e algum teste comparar `emptyFixture()` a `{}`, ajustar esse teste para `expect(Object.keys(emptyFixture())).toEqual(['lastSeenPatchVersion'])`.

- [ ] **Step 8: Commit** `fix(base): cor herdada nos botões, color-scheme por tema, NaN no crédito, Novidades só para quem já usa`

---

### Task 2: Modo "saldos ocultos" em toda a app

**Files:**
- Modify: `src/lib/format.js` (novo `mask`, `maskPct`)
- Modify: `src/components/ContextStrip.jsx`, `src/components/Hero.jsx`, `src/views/ExpensesView.jsx`, `TaxView.jsx`, `ReportView.jsx`, `IncomesView.jsx`, `RecurringView.jsx`, `GoalsView.jsx`, `CalendarView.jsx`, `GroupsView.jsx`, `OverviewView.jsx` (insights, chips de %)
- Test: `src/test/hidden.all.test.jsx`

**Interfaces:**
- Produces: `mask(v, hidden, f = fm) → string` (`'••••'` quando `hidden`), `maskPct(p, hidden, digits = 0) → string` (`'••%'` quando `hidden`), `maskText(text, hidden)` (substitui `/\d[\d\s.,]*\s?€/g` por `'••••'`).

- [ ] **Step 1: Teste que falha**

```jsx
// src/test/hidden.all.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture } from './fixtures.js';
import ContextStrip from '../components/ContextStrip.jsx';
import Hero from '../components/Hero.jsx';
import OverviewView from '../views/OverviewView.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import TaxView from '../views/TaxView.jsx';
import ReportView from '../views/ReportView.jsx';
import IncomesView from '../views/IncomesView.jsx';
import RecurringView from '../views/RecurringView.jsx';
import GoalsView from '../views/GoalsView.jsx';
import CalendarView from '../views/CalendarView.jsx';
import GroupsView from '../views/GroupsView.jsx';
import { mask, maskPct, maskText } from '../lib/format.js';

vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());

const EURO = /\d[\d\s.,]*\s?€/;   // qualquer montante em euros
const PCT = /[+-]?\d+([.,]\d+)?\s?%/; // qualquer percentagem

describe('mask helpers', () => {
  it('mask/maskPct/maskText escondem só quando hidden', () => {
    expect(mask(1234.5, false)).toMatch(EURO);
    expect(mask(1234.5, true)).toBe('••••');
    expect(maskPct(12.3, false)).toBe('12%');
    expect(maskPct(12.3, true)).toBe('••%');
    expect(maskText('Netflix · 10,99 € duas vezes', true)).toBe('Netflix · •••• duas vezes');
  });
});

const VIEWS = [
  ['ContextStrip/expenses', () => <ContextStrip tab="expenses" />],
  ['ContextStrip/cards', () => <ContextStrip tab="cards" />],
  ['ContextStrip/groups', () => <ContextStrip tab="groups" />],
  ['Hero', () => <Hero />],
  ['Overview', () => <OverviewView />],
  ['Expenses', () => <ExpensesView />],
  ['Tax', () => <TaxView />],
  ['Report', () => <ReportView />],
  ['Incomes', () => <IncomesView />],
  ['Recurring', () => <RecurringView />],
  ['Goals', () => <GoalsView />],
  ['Calendar', () => <CalendarView />],
  ['Groups', () => <GroupsView />],
];

describe('saldos ocultos em todas as vistas', () => {
  for (const [name, make] of VIEWS) {
    it(name + ' não mostra nenhum montante nem percentagem quando oculto', async () => {
      const { container } = await renderWithStore(make(), { fixture: { ...richFixture(), balancesHidden: true } });
      const text = container.textContent;
      expect(text, name + ' vazou um montante').not.toMatch(EURO);
      expect(text, name + ' vazou uma percentagem').not.toMatch(PCT);
    });
  }
});
```

- [ ] **Step 2: Correr** → falhas nas vistas que ignoram `balancesHidden`.

- [ ] **Step 3: `format.js`** — acrescentar no fim:
```js
// Saldos ocultos: a mesma máscara em toda a app. `f` é o formatador (fm/fc).
export function mask(v, hidden, f = fm) { return hidden ? '••••' : f(v); }
export function maskPct(p, hidden, digits = 0) { return hidden ? '••%' : (Number(p) || 0).toFixed(digits) + '%'; }
export function maskText(text, hidden) { return hidden ? String(text || '').replace(/\d[\d\s.,]*\s?€/g, '••••') : text; }
```

- [ ] **Step 4: vistas** — em cada ficheiro da lista, ler `const hidden = !!state.balancesHidden;` (criar onde não existe) e passar todos os `fm(`/`fc(` de montantes visíveis por `mask(v, hidden)` / `mask(v, hidden, fc)`, todas as percentagens visíveis por `maskPct(p, hidden)`, e textos compostos (insights `ins.detail`/`ins.title`, "Poupaste X (Y% do rendimento)", "Este mês 445€ · média 45€") por `maskText`. Regras específicas:
  - `ContextStrip.jsx`: `val` passa sempre por `mask`/`maskPct` conforme o caso; "a receber X · a pagar Y" com `mask` nos dois.
  - `Hero.jsx`: chip `heroPct` → `maskPct(…, hidden, 1)`; a sparkline não renderiza quando `hidden`; a barra de alocação renderiza uma única faixa `var(--elevated)` e a legenda mostra só os nomes das categorias.
  - `OverviewView.jsx`: barras de "Podes gastar" e "Plano do mês" ficam a `var(--elevated)` sem segmentos quando `hidden`; percentagens de "Saúde financeira" e "Contas por categoria" por `maskPct`.
  - `ExpensesView.jsx`: totais, `fm(r.val)`, `fm(r.lm)`, "Resta", chip transitado (`title`/`aria-label` também), sparklines não renderizam, "% do mês" por `maskPct`.
  - `GoalsView.jsx`: valores, "restantes", chip de estado mantém-se; anel mostra "••%".
  - `CalendarView.jsx`: totais e pontos com valor.
  - `GroupsView.jsx`: saldos, totais, barras de saldo (largura 0 quando oculto).
  - `TaxView.jsx`, `ReportView.jsx`, `IncomesView.jsx`, `RecurringView.jsx`: todos os montantes e percentagens.

- [ ] **Step 5:** `npx vitest run src/test/hidden.all.test.jsx src/views/views.render.test.jsx` → PASS. Repetir a leitura do texto de cada vista falhada para encontrar o montante que sobrou.

- [ ] **Step 6: Commit** `fix(privacidade): saldos ocultos em todas as vistas, percentagens e gráficos`

---

### Task 3: Confirmação em apagar despesa e apagar meta

**Files:**
- Modify: `src/modals/AddExpenseSheet.jsx:194-199` (`remove`), `src/modals/GoalModal.jsx:108-113` (`deleteGoal`)
- Test: `src/modals/deleteConfirm.test.jsx`

- [ ] **Step 1: Teste que falha**
```jsx
// src/modals/deleteConfirm.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import AddExpenseSheet from './AddExpenseSheet.jsx';
import GoalModal from './GoalModal.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
function Probe() { const { state } = useStore(); return <pre data-testid="probe">{JSON.stringify({ e: state.addedExp.length, g: state.goals.length })}</pre>; }

describe('apagar pede confirmação', () => {
  beforeEach(() => { window.confirm = vi.fn(() => false); });
  it('despesa: com confirm() recusado nada é apagado', async () => {
    await renderWithStore(<><AddExpenseSheet /><Probe /></>, { fixture: richFixture(), openModal: 'add', payload: { editId: 'out1' } });
    const before = JSON.parse(screen.getByTestId('probe').textContent).e;
    await act(async () => { fireEvent.click(screen.getByText('Eliminar despesa')); });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(screen.getByTestId('probe').textContent).e).toBe(before);
  });
  it('meta: com confirm() recusado nada é apagado', async () => {
    await renderWithStore(<><GoalModal /><Probe /></>, { fixture: richFixture(), openModal: 'goal', payload: { id: 'g1' } });
    await act(async () => { fireEvent.click(screen.getByText('Eliminar meta')); });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(screen.getByTestId('probe').textContent).g).toBe(2);
  });
});
```
(`src/test/setup.js` força `confirm()` a `true`; o `beforeEach` sobrepõe-o com `false` neste ficheiro.)

- [ ] **Step 2:** correr → 2 falhas (apaga sem chamar `confirm`).
- [ ] **Step 3:** em `AddExpenseSheet.remove()` primeira linha: `if (typeof confirm === 'function' && !confirm('Remover esta despesa? ' + (d.desc || '') + ' · ' + (d.amount || '') + ' €')) return;`. Em `GoalModal.deleteGoal()`: `if (typeof confirm === 'function' && !confirm('Eliminar a meta "' + draft.name + '"? O valor poupado não é devolvido a nenhuma conta.')) return;`. (A Task 7 substitui todos os `confirm()` por `ConfirmSheet`; aqui é só fechar a porta.)
- [ ] **Step 4:** `npx vitest run src/modals/deleteConfirm.test.jsx src/modals/modals.render.test.jsx` → PASS.
- [ ] **Step 5: Commit** `fix(seguranca): apagar despesa e meta pedem confirmação`

---

### Task 4: Copy — acentos, rótulos, "Não é", "3M", USD explícito, limite

**Files:** `src/components/Hero.jsx:72,75`, `src/components/ContextStrip.jsx:83,123`, `src/views/ChartsView.jsx:50`, `src/views/OverviewView.jsx` (~763 "Poupanca"/"media", ~791 "Projecao", ~809 "discricionario", ~350 "fim do mes", ~720-741 "Não e"), `src/lib/finance.js:693,717`, `src/views/RecurringView.jsx:77`, `src/views/AIView.jsx:523`, `src/modals/SettingsSheet.jsx` ("APARENCIA", custos "~$0,003"), `src/modals/ActionSheet.jsx` ("imobiliario"), `src/views/IncomesView.jsx:82,127,134` e `src/views/ExpensesView.jsx:588,596` ("Q1"), `src/views/CardsView.jsx:45,98,99` e `src/modals/AcctModal.jsx:160` ("plafond"), `src/views/ExpensesView.jsx:666` ("Rollover do orçamento")
- Test: `src/test/copy.pt.test.js`

- [ ] **Step 1: Teste que falha**
```js
// src/test/copy.pt.test.js
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
const ROOT = new URL('../', import.meta.url).pathname;
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
// Só strings JSX/JS visíveis: ignoramos comentários removendo-os antes de procurar.
function code(p) { return read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
const BAD = [
  ['components/Hero.jsx', /Património Liquido|Variacao/],
  ['components/ContextStrip.jsx', /Património liquido/],
  ['views/ChartsView.jsx', /Património Liquido/],
  ['views/OverviewView.jsx', /Poupanca \/|despesa media|Projecao|discricionario|fim do mes|Não e\b/],
  ['lib/finance.js', /Adesao ao orcamento|Reve os limites/],
  ['views/RecurringView.jsx', /visao clara/],
  ['views/AIView.jsx', /informacao/],
  ['modals/SettingsSheet.jsx', /APARENCIA|~\$0,/],
  ['modals/ActionSheet.jsx', /imobiliario/],
  ['views/IncomesView.jsx', /'Q1'/],
  ['views/ExpensesView.jsx', /'Q1'|Rollover do orçamento/],
  ['views/CardsView.jsx', /plafond/],
  ['modals/AcctModal.jsx', /Plafond mensal/],
];
describe('copy PT-PT', () => {
  for (const [file, re] of BAD) {
    it(file + ' sem ' + re, () => { expect(code(file)).not.toMatch(re); });
  }
  it('custos de IA dizem USD por extenso', () => { expect(read('modals/SettingsSheet.jsx')).toMatch(/USD\s*\/\s*mensagem|USD por mensagem/); });
});
```

- [ ] **Step 2:** correr → falhas.
- [ ] **Step 3: substituições (só strings visíveis; nunca chaves de dados):** "Património Liquido"→"Património Líquido" (Hero:72, ChartsView:50), "Variacao"→"Variação" (Hero:75), "Património liquido"→"Património líquido" (ContextStrip:83,123), "Liquidez + Poupanca / despesa media"→"Liquidez + Poupança / despesa média" (OverviewView ~763), "Projecao"→"Projeção", "discricionario"→"discricionário", "fim do mes"→"fim do mês", "Não e"→"Não é" (aria-label e botão), "Adesao ao orcamento"→"Adesão ao orçamento", "Reve os limites"→"Revê os limites", "visao clara"→"visão clara", "informacao"→"informação", "APARENCIA"→"APARÊNCIA", "imobiliario"→"imobiliário", `'Q1'`→`'3M'` em IncomesView (82, 127, 134; `periodLabel = isQ ? '3M' : ms[em]`) e ExpensesView (588: `'3M'` sem ternário; 596 idem), "plafond"→"limite" em CardsView (45: "define o limite", 98: "de limite", 99: "limite excedido") e "Plafond mensal"→"Limite mensal" em AcctModal:160 (o campo `plafond` do modelo não muda), "Rollover do orçamento"→"Transportar saldo" e subtítulo "O que sobra ou falta passa para o mês seguinte". Custos de IA em `SettingsSheet.jsx` (~60-62): `'~$0,003 / mensagem'` → `'≈ 0,003 USD por mensagem'` (idem 0,007 e 0,010); manter o comentário que explica o USD.
- [ ] **Step 4:** `npx vitest run src/test/copy.pt.test.js src/views/views.render.test.jsx src/lib/finance.test.js src/lib/pulse.test.js` → PASS; se um teste procurar a string antiga (ex.: "Adesao"), atualizar para a nova.
- [ ] **Step 5: Commit** `fix(copy): acentos, "Não é", 3M, USD explícito e "limite" em vez de plafond`

---

### Task 5: Assistente reconhece a conta nomeada na frase (D21)

**Files:**
- Create: `src/lib/accounts.js` (`resolveAccountRef`)
- Modify: `src/lib/aiTools.js:299-305` (`EXPENSE_FIELD_SANITIZERS`), `:349-370` (`add_expense`), `COLLECTIONS.expense.fields` (~640-650)
- Modify: `src/lib/aiChat.js:31-37` (`ASSISTANT_SYSTEM`)
- Test: `src/lib/accounts.test.js`, `src/lib/aiTools.test.js` (novo `describe`)

**Interfaces:**
- Produces: `resolveAccountRef(text, accounts) → { label } | { ambiguous: string[] } | null`, onde `accounts` é o retorno de `listAccounts(state)` (`[{ bank, type, category, custom, acctKey }]`).
- `add_expense.schema.properties.acct: { type: 'string', description: 'conta que pagou: nome do banco ou rótulo "Banco · Tipo" tal como aparece em accounts no contexto (ex.: "Activobank", "Revolut · Cartão de Crédito"); omitir se o utilizador não disser' }`.
- `run` resolve com `listAccounts(ctx.state)`; 1 match → `exp.acct = label`; ambíguo → `{ error: 'ambiguous_account', detail: 'Qual conta? ' + opções.join(' | ') }`; 0 → sem `acct`.

- [ ] **Step 1: Testes que falham**
```js
// src/lib/accounts.test.js
import { describe, it, expect } from 'vitest';
import { resolveAccountRef } from './accounts.js';
const A = [
  { bank: 'Activobank', type: 'Conta a Ordem', category: 'Liquidez', custom: true, acctKey: 'a1' },
  { bank: 'Trade Republic', type: 'Poupanca', category: 'Poupanca', custom: true, acctKey: 'a2' },
  { bank: 'Revolut', type: 'Cartão de Crédito', category: 'Cartão de crédito', custom: true, acctKey: 'cc' },
  { bank: 'Revolut', type: 'Conta a Ordem', category: 'Liquidez', custom: false, acctKey: 'Revolut_Conta a Ordem' },
];
describe('resolveAccountRef', () => {
  it('nome do banco, sem acentos nem maiúsculas → rótulo canónico', () => {
    expect(resolveAccountRef('activobank', A)).toEqual({ label: 'Activobank · Conta a Ordem' });
    expect(resolveAccountRef('pago pelo ActivoBank', A)).toEqual({ label: 'Activobank · Conta a Ordem' });
  });
  it('rótulo completo bate diretamente', () => {
    expect(resolveAccountRef('Revolut · Cartão de Crédito', A)).toEqual({ label: 'Revolut · Cartão de Crédito' });
    expect(resolveAccountRef('revolut cartao de credito', A)).toEqual({ label: 'Revolut · Cartão de Crédito' });
  });
  it('banco com várias contas: prefere Liquidez; se pedirem o tipo, usa-o', () => {
    expect(resolveAccountRef('Revolut', A)).toEqual({ label: 'Revolut · Conta a Ordem' });
    expect(resolveAccountRef('cartão revolut', A)).toEqual({ label: 'Revolut · Cartão de Crédito' });
  });
  it('ambíguo sem preferência → lista de opções', () => {
    const B = A.filter((a) => a.bank === 'Revolut').map((a) => ({ ...a, category: 'Outros' }));
    expect(resolveAccountRef('revolut', B)).toEqual({ ambiguous: ['Revolut · Cartão de Crédito', 'Revolut · Conta a Ordem'] });
  });
  it('sem match → null; vazio → null', () => {
    expect(resolveAccountRef('Millennium', A)).toBeNull();
    expect(resolveAccountRef('', A)).toBeNull();
    expect(resolveAccountRef(undefined, A)).toBeNull();
  });
});
```
E em `src/lib/aiTools.test.js`, depois do `describe('add_expense', …)` existente (linhas ~205-231), um novo bloco que usa o `writeCtx()` do ficheiro:
```js
describe('add_expense com conta', () => {
  function ctxWithAccts() {
    const c = writeCtx();
    c.state.customAccts = [
      { id: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 1000, category: 'Liquidez', currency: 'EUR' },
      { id: 'cc', bank: 'Revolut', type: 'Cartão de Crédito', value: 0, category: 'Cartão de crédito', plafond: 500, currency: 'EUR' },
    ];
    c.state.currentUser = { uid: 'u' }; // fora de preview, listAccounts lê customAccts
    return c;
  }
  it('"pago pelo Activobank" liga à conta existente', () => {
    const c = ctxWithAccts();
    const r = execTool('add_expense', { desc: 'Restaurante X', amount: 15, cat: 'rest', acct: 'Activobank' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addExpense.mock.calls[0][0].acct).toBe('Activobank · Conta a Ordem');
    expect(r.data.acct).toBe('Activobank · Conta a Ordem');
  });
  it('conta desconhecida → despesa sem conta, sem erro', () => {
    const c = ctxWithAccts();
    const r = execTool('add_expense', { desc: 'Café', amount: 2, acct: 'Millennium' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addExpense.mock.calls[0][0].acct).toBeUndefined();
  });
  it('conta ambígua → erro com opções, nada é escrito', () => {
    const c = ctxWithAccts();
    c.state.customAccts.push({ id: 'r2', bank: 'Revolut', type: 'Poupanca', value: 10, category: 'Outros', currency: 'EUR' });
    c.state.customAccts[1].category = 'Outros';
    const r = execTool('add_expense', { desc: 'Café', amount: 2, acct: 'Revolut' }, c);
    expect(r.error).toBe('ambiguous_account');
    expect(r.detail).toMatch(/Revolut · Cartão de Crédito/);
    expect(c.actions.addExpense).not.toHaveBeenCalled();
  });
  it('update_expense também aceita acct', () => {
    const c = ctxWithAccts();
    c.state.addedExp = [{ id: 'e1', desc: 'Café', amount: 2, cat: 'rest', date: '2026-09-01' }];
    const r = execTool('update_expense', { id: 'e1', acct: 'activobank', confirmed: true }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.updateExpense.mock.calls[0][1].acct).toBe('Activobank · Conta a Ordem');
  });
});
```
Se `writeCtx()` não expuser `state` num getter compatível com `ctx.state` (o `execTool` de produção recebe `ctx.state` via `aiChat.js:118-128`), acrescentar ao objeto devolvido por `writeCtx()`: `get state() { return this._state; }` ou equivalente, mantendo os testes existentes verdes.

- [ ] **Step 2:** correr os dois ficheiros → falhas.

- [ ] **Step 3: `src/lib/accounts.js`**
```js
/* ════════════════════════════════════════════════════════════════════════
   accounts — resolve a conta que o utilizador nomeia numa frase ("pago pelo
   Activobank", "cartão revolut") para o rótulo canónico "Banco · Tipo" de
   uma conta existente. Puro; usado pelo assistente de IA.
   ════════════════════════════════════════════════════════════════════════ */
import { normAcct } from './finance.js';

const label = (a) => a.bank + ' · ' + a.type;

export function resolveAccountRef(text, accounts) {
  const q = normAcct(text);
  if (!q) return null;
  const list = (accounts || []).map((a) => ({ a, lab: label(a), nl: normAcct(label(a)), nb: normAcct(a.bank), nt: normAcct(a.type) }));
  if (!list.length) return null;
  // 1) rótulo completo (com ou sem " · ")
  const full = list.filter((x) => q === x.nl || q === x.nb + ' ' + x.nt || q.indexOf(x.nl) > -1);
  if (full.length === 1) return { label: full[0].lab };
  // 2) banco mencionado
  const byBank = list.filter((x) => x.nb && q.indexOf(x.nb) > -1);
  if (byBank.length === 0) return null;
  if (byBank.length === 1) return { label: byBank[0].lab };
  // 3) mesmo banco, vários tipos: o tipo (ou uma palavra dele, ex. "cartao") desempata
  const byType = byBank.filter((x) => x.nt.split(' ').some((w) => w.length > 3 && q.indexOf(w) > -1));
  if (byType.length === 1) return { label: byType[0].lab };
  // 4) preferência por Liquidez / conta à ordem
  const liq = byBank.filter((x) => normAcct(x.a.category) === 'liquidez' || x.nt.indexOf('ordem') > -1);
  if (liq.length === 1) return { label: liq[0].lab };
  return { ambiguous: byBank.map((x) => x.lab).sort() };
}
```

- [ ] **Step 4: `aiTools.js`** — importar `resolveAccountRef` de `./accounts.js` e `listAccounts` de `./balances.js`. Em `EXPENSE_FIELD_SANITIZERS` acrescentar `acct: (v) => (v === undefined ? undefined : txt(v, 80))`. Em `add_expense.schema.properties` acrescentar `acct` com a descrição da secção Interfaces. Novo helper acima de `writeTools`:
```js
// Conta nomeada pelo utilizador → rótulo de uma conta existente, ou erro
// amigável quando há várias. Devolve { acct } (pode ser undefined) ou { error }.
function resolveAcctArg(args, ctx) {
  if (!args.acct) return { acct: undefined };
  const r = resolveAccountRef(args.acct, listAccounts(ctx.state || {}));
  if (!r) return { acct: undefined };
  if (r.ambiguous) return { error: 'ambiguous_account', detail: 'Qual conta? ' + r.ambiguous.join(' | ') };
  return { acct: r.label };
}
```
Em `add_expense.run(args, ctx)`: `const ra = resolveAcctArg(args, ctx); if (ra.error) return ra;` e incluir `acct: ra.acct` no objeto `exp` (só quando definido: `...(ra.acct ? { acct: ra.acct } : {})`). Em `COLLECTIONS.expense.fields` acrescentar `acct: { type: 'string', description: 'conta que pagou (nome do banco ou "Banco · Tipo")' }` e, no caminho de `update_expense` (a fábrica de destrutivas que aplica `sanitize`), resolver `acct` da mesma forma antes de chamar `update(actions)(id, partial)`: ler o código da fábrica (procurar `sanitize:` e onde `fields` é usado) e, se `partial.acct` existir, substituir por `resolveAcctArg({ acct: partial.acct }, ctx)` com o mesmo tratamento de erro.

- [ ] **Step 5: `aiChat.js` `ASSISTANT_SYSTEM`** — acrescentar a linha: `'Quando o utilizador diz com que conta ou banco pagou ("pago pelo Activobank", "no cartão Revolut"), passa esse nome em "acct" de add_expense/update_expense; o nome exato das contas está em "accounts" no contexto.'`. Atualizar o teste de `aiChat` se comparar o prompt inteiro.

- [ ] **Step 6:** `npx vitest run src/lib/accounts.test.js src/lib/aiTools.test.js src/lib/aiChat.test.js` → PASS.
- [ ] **Step 7: Commit** `feat(assistente): despesa fica na conta que o utilizador nomeia na frase`

---

### Task 6: Fecho de P0

- [ ] `npm test` verde · `npm run build` · `(npx vite --port 5199 > /dev/null 2>&1 &) ; sleep 5 ; node scripts/layout-check.mjs ; pkill -f "vite --port 5199"` sem problemas · `git push origin react`.

---

## P1 — A tarefa primária

### Task 7: `src/lib/metrics.js` — um número, uma fórmula (D7)

**Files:**
- Create: `src/lib/metrics.js`
- Modify: `src/components/ContextStrip.jsx:33-40` (expenses), `src/views/ExpensesView.jsx` (total do mês no cartão "DESPESAS {mês}", ~593-607), `src/views/ReportView.jsx:34` (`monthTotal`), `src/views/CalendarView.jsx` (total "DESPESA" do mês), `src/views/ChartsView.jsx:58-80` (valor atual do património), `src/views/OverviewView.jsx:222,571-577` (rótulo "Contas de investimento"), `src/views/InvestmentsView.jsx:32-43` (linha de reconciliação)
- Test: `src/lib/metrics.test.js`, `src/test/metrics.views.test.jsx`

**Interfaces:**
- Produces: `netWorth(state) → number` (= `compute(state).nW`), `netWorthHistory(state) → [{label, assets, debt, net}]` (= `netWorthSeries`), `investmentAccountsValue(state) → number` (contas de categoria Investimentos+Cripto), `positionsValue(state) → number` (= `totalValue(positions)`), `monthSpend(state, ym) → number` (soma de `addedExp` do mês, sempre positiva), `monthPendingFixed(state, ym) → number` (recorrentes ainda sem despesa `recId` nesse mês), `savingsRate(income, spend) → number|null`.

- [ ] **Step 1: Testes que falham**
```js
// src/lib/metrics.test.js
import { describe, it, expect } from 'vitest';
import { netWorth, netWorthHistory, investmentAccountsValue, positionsValue, monthSpend, monthPendingFixed, savingsRate } from './metrics.js';
import { compute, netWorthSeries } from './finance.js';
import { totalValue } from './investments.js';
import { initialPersisted } from '../store/store.jsx';
import { richFixture } from '../test/fixtures.js';
const S = () => ({ ...initialPersisted(), ...richFixture(), currentUser: { uid: 'u' } });
describe('metrics', () => {
  it('netWorth é o nW do compute e o histórico é o netWorthSeries', () => {
    const s = S();
    expect(netWorth(s)).toBe(compute(s).nW);
    expect(netWorthHistory(s)).toEqual(netWorthSeries(s));
  });
  it('contas de investimento e posições são coisas diferentes e ambas existem', () => {
    const s = S();
    expect(investmentAccountsValue(s)).toBe(5000);
    expect(positionsValue(s)).toBe(totalValue(s.positions));
    expect(positionsValue(s)).toBe(3570);
  });
  it('monthSpend soma só as despesas do mês, em valor absoluto', () => {
    const s = { addedExp: [{ amount: 10, date: '2026-09-01' }, { amount: -5, date: '2026-09-30' }, { amount: 99, date: '2026-08-31' }] };
    expect(monthSpend(s, '2026-09')).toBe(15);
    expect(monthSpend(s, '2026-07')).toBe(0);
  });
  it('monthPendingFixed é a soma das recorrentes ainda não lançadas no mês', () => {
    const s = { recurring: [{ id: 'r1', amount: 40 }, { id: 'r2', amount: 36 }], addedExp: [{ recId: 'r2', amount: 36, date: '2026-09-06' }] };
    expect(monthPendingFixed(s, '2026-09')).toBe(40);
    expect(monthPendingFixed(s, '2026-10')).toBe(76);
  });
  it('savingsRate', () => {
    expect(savingsRate(2000, 500)).toBe(75);
    expect(savingsRate(0, 500)).toBeNull();
  });
});
```
```jsx
// src/test/metrics.views.test.jsx — as vistas mostram o MESMO número
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture } from './fixtures.js';
import { initialPersisted } from '../store/store.jsx';
import { monthSpend, netWorth } from '../lib/metrics.js';
import { fc } from '../lib/format.js';
import { todayISO } from '../lib/format.js';
import ContextStrip from '../components/ContextStrip.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import ReportView from '../views/ReportView.jsx';
import CalendarView from '../views/CalendarView.jsx';
import ChartsView from '../views/ChartsView.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
const state = () => ({ ...initialPersisted(), ...richFixture(), currentUser: { uid: 'test-user' } });
const ym = todayISO().slice(0, 7);

describe('um número, uma fórmula', () => {
  it('o total do mês é igual na faixa, em Despesas, no Relatório e no Calendário', async () => {
    const expected = fc(monthSpend(state(), ym));
    for (const el of [<ContextStrip tab="expenses" />, <ExpensesView />, <ReportView />, <CalendarView />]) {
      const { container } = await renderWithStore(el, { fixture: richFixture() });
      expect(container.textContent, el.type.name).toContain(expected);
      cleanup();
    }
  });
  it('o património é igual na faixa e no cartão de Gráficos', async () => {
    const expected = fc(netWorth(state()));
    const a = await renderWithStore(<ContextStrip tab="charts" />, { fixture: richFixture() });
    expect(a.container.textContent).toContain(expected);
    cleanup();
    const b = await renderWithStore(<ChartsView />, { fixture: richFixture() });
    expect(b.container.textContent).toContain(expected);
  });
});
```

- [ ] **Step 2:** correr → falhas (módulo em falta; Calendário mostra 751 vs 675; Gráficos mostra 14 300 vs 17 898).

- [ ] **Step 3: `src/lib/metrics.js`**
```js
/* ════════════════════════════════════════════════════════════════════════
   metrics — UMA fórmula por indicador. Todas as vistas e a ContextStrip
   leem daqui; nenhuma vista volta a somar despesas por sua conta.
   ════════════════════════════════════════════════════════════════════════ */
import { compute, netWorthSeries } from './finance.js';
import { totalValue } from './investments.js';

export function netWorth(state) { return compute(state).nW; }
export function netWorthHistory(state) { return netWorthSeries(state); }
export function investmentAccountsValue(state) {
  const C = compute(state);
  return (C.cT['Investimentos'] || 0) + (C.cT['Cripto'] || 0);
}
export function positionsValue(state) { return totalValue((state && state.positions) || []); }
// Despesas registadas (manuais e importadas) do mês YYYY-MM, sempre positivas.
export function monthSpend(state, ym) {
  return ((state && state.addedExp) || []).reduce((t, x) => ((x.date || '').slice(0, 7) === ym ? t + Math.abs(Number(x.amount) || 0) : t), 0);
}
// Recorrentes que ainda não geraram despesa (recId) nesse mês.
export function monthPendingFixed(state, ym) {
  const done = new Set(((state && state.addedExp) || []).filter((x) => x.recId && (x.date || '').slice(0, 7) === ym).map((x) => x.recId));
  return ((state && state.recurring) || []).reduce((t, r) => (done.has(r.id) ? t : t + (Number(r.amount) || 0)), 0);
}
export function savingsRate(income, spend) {
  return income > 0 ? ((income - spend) / income) * 100 : null;
}
```

- [ ] **Step 4: ligar as vistas**
  - `ContextStrip.jsx` (expenses): `spent = monthSpend(state, key)`.
  - `ExpensesView.jsx`: onde o cartão "DESPESAS {mês}" calcula o total (procurar `selMonthKey` e a soma usada no `fm(...)` desse cartão, ~593-607), substituir por `monthSpend(s, selMonthKey)`; no modo 3M, somar `monthSpend` dos 3 meses.
  - `ReportView.jsx:34`: `monthTotal(addedExp, ym)` → `monthSpend(s, ym)` (manter `categoryTotals` para o gráfico).
  - `CalendarView.jsx`: o total "DESPESA" passa a `monthSpend(s, ym)`; acrescentar por baixo, só quando `monthPendingFixed(s, ym) > 0`: `<div className="lb">+ {fc(pending)} previstas</div>` (rótulo "previstas", não somadas ao total).
  - `ChartsView.jsx:58-80`: o valor atual do cartão "Património" passa a `netWorth(s)`; o gráfico continua com `netWorthHistory(s)`; a legenda diz "histórico de snapshots" e o delta "+10.0%" só aparece se `nws.length >= 2` e passa a "vs primeiro snapshot".
  - `OverviewView.jsx:571-577`: rótulo "Investimentos" → "Contas de investimento", valor `investmentAccountsValue(s)`.
  - `InvestmentsView.jsx:32-43`: quando `investmentAccountsValue(s) !== positionsValue(s)`, linha pequena sob o total: "Contas de investimento: {fc(accounts)} · posições registadas: {fc(positions)}".

- [ ] **Step 5:** `npx vitest run src/lib/metrics.test.js src/test/metrics.views.test.jsx src/views/views.render.test.jsx src/test/flows.test.jsx` → PASS (ajustar asserções que esperem 751 no Calendário ou 14 300 em Gráficos).
- [ ] **Step 6: Commit** `feat(metricas): uma fórmula por indicador partilhada por todas as vistas`

---

### Task 8: `ConfirmSheet`, toast com "Anular" e fim dos `confirm()` (D8)

**Files:**
- Create: `src/lib/snapshot.js`, `src/components/ConfirmSheet.jsx`, `src/components/ConfirmButton.jsx`
- Modify: `src/components/Toast.jsx` (ação), `src/components/Shell.jsx:41-66` (`confirm` em `MODAL_COMPONENTS`), `src/modals/AssistantSheet.jsx` (usar `snapshotSlices` da lib), e os 13 sítios: `ExpensesView.jsx:145,453`, `CardsView.jsx:34`, `TransfersView.jsx:21`, `OverviewView.jsx:935`, `AcctModal.jsx:124`, `PositionModal.jsx:50`, `HousingModal.jsx:75`, `PersonSheet.jsx:90`, `GroupSheet.jsx:155,207`, `GroupExpenseSheet.jsx:276`, `AddExpenseSheet.jsx` (`remove`), `GoalModal.jsx` (`deleteGoal`)
- Test: `src/components/confirm.test.jsx`

**Interfaces:**
- `snapshotSlices(state, keys?) → object`; `SLICES` (lista das fatias persistidas de dados).
- `toast(msg, type, { action: { label, onClick }, duration })` — com `action`, duração 6000 ms e botão `.toast button`.
- `ConfirmSheet` registado como modal `confirm`; payload `{ title, message, amount?, confirmLabel = 'Remover', onConfirm }`; hook `useConfirm() → (payload) => void`.
- `ConfirmButton({ label, confirmLabel = 'Confirmar', onConfirm, danger = true })` — dois toques em 4 s (para dentro de sheets, evita empilhar sheets).

- [ ] **Step 1: Teste que falha**
```jsx
// src/components/confirm.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import ConfirmSheet from './ConfirmSheet.jsx';
import ConfirmButton from './ConfirmButton.jsx';
import { snapshotSlices } from '../lib/snapshot.js';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
function Probe() { const { state } = useStore(); return <pre data-testid="probe">{state.addedExp.length}</pre>; }

describe('snapshotSlices', () => {
  it('copia só as fatias pedidas', () => {
    const s = { addedExp: [1], goals: [2], theme: 'dark' };
    expect(snapshotSlices(s, ['addedExp'])).toEqual({ addedExp: [1] });
  });
});

describe('ConfirmSheet + Anular', () => {
  it('remover despesa abre a sheet, mostra o valor, apaga só ao confirmar e o toast anula', async () => {
    window.confirm = vi.fn(() => { throw new Error('confirm() nativo não deve ser chamado'); });
    await renderWithStore(<><ExpensesView /><ConfirmSheet /><Probe /></>, { fixture: richFixture() });
    const before = Number(screen.getByTestId('probe').textContent);
    await act(async () => { fireEvent.change(screen.getAllByLabelText(/Pesquisar despesas/)[0], { target: { value: 'ikea' } }); });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /Remover despesa/ })[0]); });
    const dlg = screen.getByRole('dialog', { name: /Remover despesa/ });
    expect(dlg.textContent).toMatch(/80,00 €/);
    expect(Number(screen.getByTestId('probe').textContent)).toBe(before);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remover' })); });
    expect(Number(screen.getByTestId('probe').textContent)).toBe(before - 1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Anular' })); });
    expect(Number(screen.getByTestId('probe').textContent)).toBe(before);
  });
});

describe('ConfirmButton', () => {
  it('só executa ao segundo toque', async () => {
    const onConfirm = vi.fn();
    const { getByRole } = await renderWithStore(<ConfirmButton label="Eliminar meta" confirmLabel="Confirmar eliminação" onConfirm={onConfirm} />, { fixture: {} });
    await act(async () => { fireEvent.click(getByRole('button', { name: 'Eliminar meta' })); });
    expect(onConfirm).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(getByRole('button', { name: 'Confirmar eliminação' })); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2:** correr → falhas.

- [ ] **Step 3: `src/lib/snapshot.js`**
```js
// Fatias de dados que uma ação pode alterar; um snapshot delas + actions.patch(snap) = "Anular".
export const SLICES = ['addedExp', 'incomes', 'goals', 'recurring', 'bdg', 'transfers', 'positions', 'customAccts', 'dynAccts', 'balanceLog', 'people', 'groups', 'groupEntries', 'housing', 'rules'];
export function snapshotSlices(state, keys = SLICES) {
  const snap = {};
  keys.forEach((k) => { snap[k] = state ? state[k] : undefined; });
  return snap;
}
```
Em `AssistantSheet.jsx` apagar a `snapshotSlices` local e importar esta (manter `undoSnapshotFor`).

- [ ] **Step 4: `Toast.jsx`** — `toast(msg, type, opts = {})`: guardar `action: opts.action || null` no item; timeout `opts.duration || (opts.action ? 6000 : 2400)`; no render, quando `t.action`: `<div className={'toast ' + t.type + (t.action ? ' undo' : '')}>…<button type="button" onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button></div>`. O `.toast.undo button` já tem estilo em `tokens.css:220-222`.

- [ ] **Step 5: `ConfirmSheet.jsx`**
```jsx
import React from 'react';
import Sheet from './Sheet.jsx';
import { useModal, useUI } from '../store/ui.jsx';
import { PrimaryButton, SecondaryButton } from './Buttons.jsx';
import { fm } from '../lib/format.js';

export function useConfirm() { const { open } = useUI(); return (payload) => open('confirm', payload); }

export default function ConfirmSheet() {
  const { isOpen, payload, close } = useModal('confirm');
  if (!isOpen || !payload || typeof payload !== 'object') return null;
  const { title, message, amount, confirmLabel = 'Remover', onConfirm } = payload;
  const footer = (
    <>
      <PrimaryButton onClick={() => { close(); onConfirm && onConfirm(); }} style={{ background: 'var(--danger)' }}>{confirmLabel}</PrimaryButton>
      <SecondaryButton onClick={close} style={{ marginTop: 8 }}>Cancelar</SecondaryButton>
    </>
  );
  return (
    <Sheet open={isOpen} onClose={close} title={title} footer={footer}>
      {amount != null && <div className="m" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>{fm(amount)}</div>}
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{message}</p>
    </Sheet>
  );
}
```
Registar em `Shell.jsx` `MODAL_COMPONENTS`: `confirm: lazy(() => import('../components/ConfirmSheet.jsx'))`.

- [ ] **Step 6: `ConfirmButton.jsx`**
```jsx
import React, { useEffect, useState } from 'react';
import { SecondaryButton } from './Buttons.jsx';
// Dois toques em 4 s: para eliminar de dentro de uma sheet sem abrir outra.
export default function ConfirmButton({ label, confirmLabel = 'Confirmar', onConfirm, style }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <SecondaryButton onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))} style={{ color: 'var(--danger)', ...(armed ? { borderColor: 'var(--danger)', background: 'var(--signal-soft)' } : {}), ...style }} aria-live="polite">
      {armed ? confirmLabel : label}
    </SecondaryButton>
  );
}
```

- [ ] **Step 7: migrar os sítios.** Vistas (usam `useConfirm` + toast com Anular): `ExpensesView.jsx:145` → `confirm({ title: 'Remover despesa', message: x.desc + ' · ' + fmDateShort(x.date), amount: x.amount, onConfirm: () => { const snap = snapshotSlices(actions.getState(), ['addedExp']); actions.deleteExpense(id); toast('Despesa removida', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } }); } })`; o mesmo padrão em `ExpensesView.jsx:453` (mês inteiro; `message` com a contagem e "Depois podes reimportar o extrato"), `CardsView.jsx:34`, `TransfersView.jsx:21` (fatias `['transfers','customAccts','dynAccts']`), `OverviewView.jsx:935` (fatias `['customAccts','dynAccts','balanceLog']`). Modais (usam `ConfirmButton` no rodapé em vez do botão secundário + toast com Anular): `AddExpenseSheet` (`remove`), `GoalModal` (`deleteGoal`), `AcctModal:124`, `PositionModal:50`, `HousingModal:75`, `PersonSheet:90`, `GroupSheet:207` (apagar grupo; o `:155` de refletir/deixar de refletir mantém uma explicação inline e `ConfirmButton`), `GroupExpenseSheet:276`. Remover todos os `confirm(` de `src/` exceto `SettingsSheet` (apagar tudo / restaurar backup ficam com `confirm()` duplo, decisão da spec D8 não os cobre). O teste da Task 3 (`deleteConfirm.test.jsx`) passa a testar o `ConfirmButton` (primeiro toque não apaga) — atualizar.

- [ ] **Step 8:** `npx vitest run src/components/confirm.test.jsx src/modals/deleteConfirm.test.jsx src/views/views.render.test.jsx src/modals/modals.render.test.jsx src/test/flows.test.jsx` → PASS; `grep -rn "confirm(" src --include=*.jsx | grep -v test | grep -v SettingsSheet | grep -v ConfirmSheet` devolve 0.
- [ ] **Step 9: Commit** `feat(seguranca): ConfirmSheet, ConfirmButton e "Anular" em todas as ações de dinheiro`

---

### Task 9: Nova despesa em 5 segundos (D5)

**Files:**
- Modify: `src/modals/AddExpenseSheet.jsx:31-44` (draft), `:106` (`cats`), `:237-443` (ordem dos campos)
- Create: `src/lib/categoryUsage.js` (`topCategories`)
- Test: `src/lib/categoryUsage.test.js`, `src/modals/addExpense.order.test.jsx`

**Interfaces:**
- `topCategories(state, { days = 90, n = 6 }) → string[]` de ids: por número de despesas nos últimos `days` (desc), desempate alfabético pelo nome; completa até `n` com `['sup','rest','comp','cmb','sau','laz']` na ordem, sem repetir.
- `lastUsedAccount(state) → string` (o `acct` da despesa mais recente com `acct`, ou `''`).

- [ ] **Step 1: Testes que falham**
```js
// src/lib/categoryUsage.test.js
import { describe, it, expect } from 'vitest';
import { topCategories, lastUsedAccount } from './categoryUsage.js';
const today = new Date().toISOString().slice(0, 10);
describe('topCategories', () => {
  it('ordena por frequência nos últimos 90 dias e completa com defaults', () => {
    const s = { bdg: [{ id: 'sup', nm: 'Supermercado' }, { id: 'rest', nm: 'Restauração' }, { id: 'gym', nm: 'Ginásio' }], addedExp: [
      { cat: 'gym', date: today }, { cat: 'gym', date: today }, { cat: 'rest', date: today }, { cat: 'sup', date: '2020-01-01' },
    ] };
    expect(topCategories(s, { n: 4 })).toEqual(['gym', 'rest', 'sup', 'comp']);
  });
  it('sem despesas devolve os defaults', () => {
    expect(topCategories({ bdg: [], addedExp: [] }, { n: 3 })).toEqual(['sup', 'rest', 'comp']);
  });
});
describe('lastUsedAccount', () => {
  it('devolve a conta da despesa mais recente', () => {
    expect(lastUsedAccount({ addedExp: [{ date: '2026-09-01', acct: 'A' }, { date: '2026-09-03', acct: 'B' }, { date: '2026-09-04' }] })).toBe('B');
    expect(lastUsedAccount({ addedExp: [] })).toBe('');
  });
});
```
```jsx
// src/modals/addExpense.order.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import AddExpenseSheet from './AddExpenseSheet.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());

describe('Nova despesa: valor primeiro', () => {
  it('o valor vem antes das categorias e recebe o foco ao abrir', async () => {
    const { container } = await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    const amount = screen.getByLabelText('Valor (€)');
    const firstCat = screen.getByRole('group', { name: 'Categoria' }).querySelector('button');
    expect(amount.compareDocumentPosition(firstCat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(amount);
    expect(container.querySelector('[aria-label="Descrição"]')).toBeTruthy();
  });
  it('mostra 6 categorias mais usadas e "Mais categorias" abre a grelha completa', async () => {
    await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    const grid = screen.getByRole('group', { name: 'Categoria' });
    expect(grid.querySelectorAll('button[aria-pressed]').length).toBe(6);
    expect(grid.textContent).toMatch(/Supermercado/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais categorias' })); });
    expect(grid.querySelectorAll('button[aria-pressed]').length).toBeGreaterThan(10);
  });
  it('a conta vem pré-selecionada com a última usada e as opções extra ficam colapsadas', async () => {
    await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    expect(screen.getByLabelText('Conta debitada (opcional)').value).not.toBe('');
    expect(screen.queryByLabelText('Despesa partilhada')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mais opções' })); });
    expect(screen.getByLabelText('Despesa partilhada')).toBeTruthy();
  });
});
```

- [ ] **Step 2:** correr → falhas.

- [ ] **Step 3: `src/lib/categoryUsage.js`**
```js
const DEFAULTS = ['sup', 'rest', 'comp', 'cmb', 'sau', 'laz'];
export function topCategories(state, { days = 90, n = 6 } = {}) {
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);
  const count = {};
  ((state && state.addedExp) || []).forEach((x) => { if ((x.date || '') >= sinceIso && x.cat) count[x.cat] = (count[x.cat] || 0) + 1; });
  const name = (id) => ((((state && state.bdg) || []).find((b) => b.id === id) || {}).nm || id);
  const used = Object.keys(count).sort((a, b) => count[b] - count[a] || name(a).localeCompare(name(b), 'pt'));
  const out = [];
  [...used, ...DEFAULTS].forEach((id) => { if (out.length < n && out.indexOf(id) < 0) out.push(id); });
  return out;
}
export function lastUsedAccount(state) {
  const withAcct = ((state && state.addedExp) || []).filter((x) => x.acct).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return withAcct.length ? withAcct[0].acct : '';
}
```

- [ ] **Step 4: `AddExpenseSheet.jsx`** — nova ordem no JSX (o resto do ficheiro mantém-se):
  1. **Valor**: o campo `Valor (€)` (o de `!d.shared`, hoje ~381-390) passa a ser o primeiro elemento da sheet, com `ref={amountRef}` e `autoFocus`; num `useEffect([isOpen])` chamar `amountRef.current && amountRef.current.focus()` depois de um `setTimeout(…, 50)` (a sheet anima). Estilo `monoBig` com `fontSize: 28`.
  2. **Categoria**: `<div role="group" aria-label="Categoria">` com `const top = useMemo(() => topCategories(state), [state.addedExp, state.bdg])`, `const [allCats, setAllCats] = useState(false)`, e a grelha existente a mapear `allCats ? cats : cats.filter((b) => top.includes(b.id)).sort((a, b) => top.indexOf(a.id) - top.indexOf(b.id))`. Se `d.cat` não estiver em `top`, incluir também. Botão `<button type="button" onClick={() => setAllCats(true)}>Mais categorias</button>` (só quando `!allCats`).
  3. **Descrição** (bloco existente com o logo).
  4. **Conta debitada (opcional)** (select existente), com `freshDraft()` a usar `acct: lastUsedAccount(state)`.
  5. **Data** (input existente).
  6. `<button type="button" aria-expanded={more} onClick={() => setMore(!more)}>Mais opções</button>` e, só quando `more`: toggle "Despesa partilhada" (e os campos Total/Pessoas quando `d.shared`), Tags, Nota. `more` começa `false`, exceto em edição quando `d.shared || d.tags.length || d.notes` (aí `true`).
  O `submit()` não muda. Manter `aria-label` de todos os campos.

- [ ] **Step 5:** `npx vitest run src/lib/categoryUsage.test.js src/modals/addExpense.order.test.jsx src/modals/addExpense.logo.test.jsx src/modals/modals.render.test.jsx src/test/flows.test.jsx` → PASS (o teste do logo procura `aria-label="Descrição"`, mantém-se; testes que preencham a categoria por texto podem precisar de "Mais categorias" antes).
- [ ] **Step 6: Commit** `feat(despesas): valor primeiro, categorias por frequência, conta pré-selecionada`

---

### Task 10: Resumo com uma tese — cinco blocos e "Podes gastar" como hero (D6)

**Files:**
- Create: `src/components/SpendHero.jsx`, `src/components/overview/ClosingCard.jsx`, `HealthCard.jsx`, `SubscriptionsCard.jsx`, `EmergencyFundCard.jsx`, `ProjectionCard.jsx`, `AccountsByCategory.jsx` (extraídos de `OverviewView.jsx`, sem alterar a lógica)
- Modify: `src/views/OverviewView.jsx` (fica com 5 blocos), `src/components/Shell.jsx:292,323` (`<Hero/>` → `<SpendHero/>` no overview), `src/lib/pulse.js` (`rankInsights`)
- Test: `src/views/overview.thesis.test.jsx`

**Interfaces:**
- `SpendHero()` lê `dailyAllowance`/`monthForecast` e mostra: eyebrow "Podes gastar hoje", número `perDay` (`mask`), "por dia · N dias até {mês}", barra gasto/rendimento, e UMA frase: se `forecast.overBudget`: "Faltam-te {fc(-projectedEnd)} para fechar dentro do rendimento a este ritmo ({fc(dailyBurn)}/dia)"; senão: "A este ritmo fechas o mês com {fc(projectedEnd)} de sobra". Sem rendimento: a chamada "+ Adicionar rendimento" (o bloco existente ~402-408).
- `rankInsights(state) → insight[]` (em `pulse.js`): junta `buildInsights`, aviso de ritmo (`forecast.overBudget` → `{ tone: 'warn', title: 'Ritmo acima do rendimento', detail, long }`), metas em risco (`goalsAtRisk` → `{ tone: 'warn', title: g.name + ' não chega ao prazo', detail: '+' + fc(gap) + '/mês para chegar a tempo' }`), recorrentes a vencer ≤3 dias (`upcomingRecurring`); ordena `alert` > `warn` > `info` > `good`, e por montante; devolve todos, o Resumo mostra o primeiro e "Ver mais (N)" que faz `goTab('report')`.
- Os seis componentes extraídos recebem `s` (estado com `currentUser`) e `hidden` por props e renderizam exatamente o JSX que hoje está em `OverviewView.jsx` (linhas 301-334, 631-753 dividido em Health e Subscriptions, 756-848 dividido em EmergencyFund e Projection, 851-956).

- [ ] **Step 1: Teste que falha**
```jsx
// src/views/overview.thesis.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import OverviewView from './OverviewView.jsx';
import SpendHero from '../components/SpendHero.jsx';
import { rankInsights } from '../lib/pulse.js';
import { initialPersisted } from '../store/store.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());

describe('Resumo com uma tese', () => {
  it('o hero é "Podes gastar hoje" com €/dia e uma frase com agência', async () => {
    const { container } = await renderWithStore(<SpendHero />, { fixture: richFixture() });
    expect(container.textContent).toMatch(/Podes gastar hoje/);
    expect(container.textContent).toMatch(/\/dia/);
    expect(container.textContent).toMatch(/Faltam-te|de sobra/);
    expect(container.textContent).not.toMatch(/acima do rendimento/);
  });
  it('o Resumo tem no máximo 6 cartões e não repete o que saiu para Gráficos e Relatório', async () => {
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(container.querySelectorAll('.cd').length).toBeLessThanOrEqual(6);
    for (const gone of ['Saúde financeira', 'Fecho de', 'Subscrições detectadas', 'Fundo de emergência', 'Projeção', 'Contas por categoria']) {
      expect(container.textContent, gone).not.toMatch(new RegExp(gone));
    }
    expect(container.textContent).toMatch(/Plano do mês/);
    expect(container.textContent).toMatch(/Disponível/);
  });
  it('mostra um único insight, o mais grave, e "Ver mais"', async () => {
    const s = { ...initialPersisted(), ...richFixture(), currentUser: { uid: 'u' } };
    const ranked = rankInsights(s);
    expect(ranked[0].tone).toBe('alert');
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.getAllByRole('button', { name: 'Está certo, dispensar aviso' }).length).toBe(1);
    expect(screen.getByRole('button', { name: /Ver mais/ })).toBeTruthy();
    expect(container.textContent).toContain(ranked[0].title);
  });
});
```

- [ ] **Step 2:** correr → falhas.
- [ ] **Step 3: extrair os seis componentes** para `src/components/overview/*.jsx` copiando o JSX e as derivações que usam (`monthClosing`, `healthScore`, `detectSubscriptions`, `emergencyFund`, `cashFlowProjection`, `C.grp`/`C.cT`) — cada componente chama `useStore()` e recalcula o que precisa com `useMemo`; comportamento idêntico.
- [ ] **Step 4: `SpendHero.jsx`** — reutilizar a lógica de "Podes gastar" (`dailyAllowance`, `monthForecast`) e o markup do cartão atual, dentro de `<div className="hero">` (o `.hero` passa a superfície neutra na Task 21; aqui só troca o conteúdo). `Shell.jsx:292,323`: `<Hero/>` → `<SpendHero/>`. `Hero.jsx` fica para a Task 11.
- [ ] **Step 5: `OverviewView.jsx`** fica com, por esta ordem: `QuickActions` (ordem `Despesa, Receita, Saldo, IA, Mais`); Grupos strip (só `owedToMe > 0 || owedByMe > 0`); "Plano do mês" (bloco 415-460 existente, com a barra de ritmo do "Podes gastar" incorporada por baixo); um cartão de insight com `rankInsights(s)[0]` (markup compacto existente) e botão "Ver mais (N)" → `goTab('report')`; "Disponível" (531-580, com "Contas de investimento"). Apagar do ficheiro os blocos extraídos e o "A vencer em breve" (agora insight). Onboarding mantém-se no Shell.
- [ ] **Step 6: `pulse.js` `rankInsights`** conforme Interfaces; exportar.
- [ ] **Step 7:** `npx vitest run src/views/overview.thesis.test.jsx src/views/overviewCompact.test.jsx src/views/groupsAvatars.test.jsx src/views/logosBanks.test.jsx src/components/hero.test.jsx src/views/views.render.test.jsx src/test/flows.test.jsx` → PASS; asserções de `flows.test.jsx` sobre blocos que saíram do Resumo passam a apontar para `ReportView`/`ChartsView` na Task 11 (marcar `it.skip` com nota até lá é aceitável só dentro desta tarefa).
- [ ] **Step 8: Commit** `feat(resumo): hero "Podes gastar hoje", cinco blocos, um insight ranqueado`

---

### Task 11: Gráficos vira "Património" e Relatório vira "Análise"

**Files:**
- Modify: `src/views/ChartsView.jsx` (topo: `<Hero/>` + `AccountsByCategory` + `EmergencyFundCard`), `src/views/ReportView.jsx` (topo: `ClosingCard` + `HealthCard` + `ProjectionCard` + `SubscriptionsCard`), `src/modals/MoreMenu.jsx:22-35` (títulos "Património" e "Análise"), `src/components/ContextStrip.jsx` (`charts` → "Património líquido" já está)
- Test: `src/views/moved.blocks.test.jsx`

- [ ] **Step 1: Teste que falha**
```jsx
// src/views/moved.blocks.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ChartsView from './ChartsView.jsx';
import ReportView from './ReportView.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
describe('blocos realojados', () => {
  it('Gráficos tem o património, a alocação, as contas por categoria e o fundo de emergência', async () => {
    const { container } = await renderWithStore(<ChartsView />, { fixture: richFixture() });
    for (const t of ['Património Líquido', 'Contas por categoria', 'Fundo de emergência', 'Liquidez']) expect(container.textContent, t).toMatch(new RegExp(t));
  });
  it('Relatório tem saúde financeira, projeção e subscrições detetadas', async () => {
    const { container } = await renderWithStore(<ReportView />, { fixture: richFixture() });
    for (const t of ['Saúde financeira', 'Projeção', 'Subscrições detectadas']) expect(container.textContent, t).toMatch(new RegExp(t));
  });
});
```
- [ ] **Step 2:** correr → falhas.
- [ ] **Step 3:** montar os componentes no topo de cada vista (Charts: `<Hero/>` (o cartão de património com alocação), depois `AccountsByCategory`, `EmergencyFundCard`, depois os gráficos existentes; Report: `ClosingCard` (só nos primeiros dias, como hoje), `HealthCard`, `ProjectionCard`, `SubscriptionsCard`, depois o conteúdo existente). `MoreMenu.ITEMS`: `charts` → title "Património", sub "Evolução, alocação e contas"; `report` → title "Análise", sub "Fecho, saúde financeira e onde poupar".
- [ ] **Step 4:** `npx vitest run src/views/moved.blocks.test.jsx src/views/views.render.test.jsx src/test/flows.test.jsx src/test/hidden.all.test.jsx` → PASS; reativar os `it.skip` da Task 10 apontando para as vistas novas.
- [ ] **Step 5: Commit** `feat(navegacao): Gráficos passa a Património e Relatório a Análise com os blocos do Resumo`

---

### Task 12: Fecho de P1

- [ ] `npm test` · `npm run build` · layout-check · `git push origin react`.

---

## P2 — Um sistema

### Task 13: Tokens de espaçamento e tipo (D9)

**Files:**
- Modify: `src/styles/tokens.css` (`:root`), `src/views/OverviewView.jsx`, `ExpensesView.jsx`, `GoalsView.jsx`, `CardsView.jsx`, `src/modals/AddExpenseSheet.jsx`, `GoalModal.jsx`, `AcctModal.jsx`, `src/components/overview/*.jsx`, `SpendHero.jsx`
- Test: `src/test/tokens.scale.test.js`

**Interfaces:** tokens `--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px; --space-6:32px; --space-7:48px; --space-8:64px; --fs-xs:11px; --fs-sm:13px; --fs-md:15px; --fs-lg:17px; --fs-xl:22px; --fs-2xl:28px; --fs-3xl:34px;`. Mapa de migração: fontSize 9–11→`xs`, 12–13→`sm`, 14–15→`md`, 16–18→`lg`, 20–24→`xl`, 26–30→`2xl`, 32–36→`3xl`; espaçamento 1–3→`space-1`, 4–6→`space-2`, 7–10→`space-3`, 11–16→`space-4`, 18–24→`space-5`, 26–32→`space-6`, 40–48→`space-7`; radius numérico → `--r4`(8) `--r3`(12) `--r2`(16) `--r`(20), `999` fica.

- [ ] **Step 1: Teste que falha**
```js
// src/test/tokens.scale.test.js
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FILES = ['views/OverviewView.jsx', 'views/ExpensesView.jsx', 'views/GoalsView.jsx', 'views/CardsView.jsx', 'modals/AddExpenseSheet.jsx', 'modals/GoalModal.jsx', 'modals/AcctModal.jsx', 'components/SpendHero.jsx'];
describe('escala de design', () => {
  it('tokens declarados', () => {
    const css = read('styles/tokens.css');
    for (const t of ['--space-1', '--space-4', '--space-8', '--fs-xs', '--fs-md', '--fs-3xl']) expect(css).toMatch(t + ':');
  });
  for (const f of FILES) {
    it(f + ' sem fontSize/padding/margin/gap numéricos', () => {
      const src = read(f);
      expect(src.match(/fontSize:\s*\d/g) || [], 'fontSize').toEqual([]);
      expect(src.match(/(padding|margin|gap)(Top|Bottom|Left|Right)?:\s*'?\d/g) || [], 'spacing').toEqual([]);
    });
  }
});
```
- [ ] **Step 2:** correr → falhas.
- [ ] **Step 3:** acrescentar os tokens ao `:root` (uma linha por token, depois de `--r4:8px;`). Migrar os 8 ficheiros com o mapa acima: `fontSize: 11` → `fontSize: 'var(--fs-xs)'`, `padding: '12px 16px'` → `padding: 'var(--space-3) var(--space-4)'`, `marginBottom: 16` → `marginBottom: 'var(--space-4)'`, `gap: 8` → `gap: 'var(--space-2)'`, etc. Onde um valor ficava fora do mapa (ex. `padding: '0 20px 24px'` no contentor de vista), escolher o mais próximo (`'0 var(--space-5) var(--space-5)'`). Não tocar em `width`/`height` de ícones nem em `letterSpacing`.
- [ ] **Step 4:** `npx vitest run src/test/tokens.scale.test.js src/views/views.render.test.jsx src/modals/modals.render.test.jsx` → PASS; `(npx vite --port 5199 > /dev/null 2>&1 &) ; sleep 5 ; node scripts/layout-check.mjs ; pkill -f "vite --port 5199"` → 0 problemas (a escala pode mudar alturas; corrigir overflow com `minWidth: 0`).
- [ ] **Step 5: Commit** `refactor(tokens): escala de espaçamento e de tipo nas vistas e modais principais`

---

### Task 14: `Amount` — uma semântica para dinheiro (D10)

**Files:**
- Create: `src/components/Amount.jsx`
- Modify: `src/views/ExpensesView.jsx` (linhas de pesquisa e detalhe), `CardsView.jsx` (despesas e pagamentos), `RecurringView.jsx`, `TransfersView.jsx`, `ReportView.jsx` ("Maiores despesas"), `InvestmentsView.jsx` (P/L), `IncomesView.jsx`, `ContextStrip.jsx` (expenses/cards deixam de ser vermelhos), `ExpensesView.jsx:726-730` ("Resta" negativo)
- Test: `src/components/amount.test.jsx`

**Interfaces:** `Amount({ value, kind = 'out', hidden = false, fmt = fm, style })` → `<span className="m amount amount-{kind}">` com: `out` → `'−' + fmt(|v|)` cor `--fg`; `in` → `'+' + fmt(|v|)` cor `--success`; `neutral` → `fmt(v)` cor `--fg`; `alert` → `fmt(v)` cor `--danger`. `hidden` → `••••`. O sinal é U+2212 "−", não hífen.

- [ ] **Step 1: Teste que falha**
```jsx
// src/components/amount.test.jsx
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Amount from './Amount.jsx';
afterEach(() => cleanup());
describe('Amount', () => {
  it('saída: sinal menos tipográfico, cor neutra', () => {
    render(<Amount value={80} kind="out" />);
    const el = screen.getByText('−80,00 €');
    expect(el.className).toMatch(/amount-out/);
  });
  it('entrada: mais e verde; neutro sem sinal; alerta vermelho; oculto', () => {
    render(<><Amount value={120} kind="in" /><Amount value={5} kind="neutral" /><Amount value={-60} kind="alert" /><Amount value={9} hidden /></>);
    expect(screen.getByText('+120,00 €').className).toMatch(/amount-in/);
    expect(screen.getByText('5,00 €')).toBeTruthy();
    expect(screen.getByText('-60,00 €').className).toMatch(/amount-alert/);
    expect(screen.getByText('••••')).toBeTruthy();
  });
});
```
- [ ] **Step 2:** correr → falha.
- [ ] **Step 3:** criar o componente e as classes em `tokens.css`: `.amount{font-variant-numeric:tabular-nums;white-space:nowrap}.amount-in{color:var(--success)}.amount-alert{color:var(--danger)}.amount-out,.amount-neutral{color:var(--fg)}`. Aplicar: despesas (`out`), pagamentos ao cartão e receitas (`in`), transferências (`neutral`), P/L (`in` se ≥0, senão `alert`), "Resta" em `ExpensesView:726-730` (`alert` quando `r.lm - r.val < 0`, senão `in` sem sinal → usar `neutral` com cor `--success` via `style`), `ContextStrip` expenses/cards → `neutral`. "▼ 0%" a verde no Relatório: só colorir quando `pct !== 0` (0 → `--fg-subtle`, sem seta).
- [ ] **Step 4:** `npx vitest run src/components/amount.test.jsx src/views/views.render.test.jsx src/views/logosLists.test.jsx src/views/logosBanks.test.jsx src/test/hidden.all.test.jsx` → PASS (testes que procuram "-80,00 €" passam a "−80,00 €").
- [ ] **Step 5: Commit** `feat(ui): Amount com uma semântica de entrada, saída, neutro e alerta`

---

### Task 15: Título em cada ecrã, voltar, "Mais" agrupado, sidebar completa, tab na URL (D11)

**Files:**
- Create: `src/components/ViewHeader.jsx`
- Modify: `src/components/Shell.jsx` (renderiza `ViewHeader` para `moreTabs`; `goTab` sincroniza URL), `src/store/ui.jsx` (`goTab` → `history.pushState`; leitura inicial de `?tab=`; `popstate`), `src/modals/MoreMenu.jsx:22-35` (grupos), `src/components/Sidebar.jsx:27-38` (15 destinos)
- Test: `src/components/viewHeader.test.jsx`

**Interfaces:** `ViewHeader({ title, sub, onBack })` → `<div className="vhead"><button aria-label="Voltar" onClick={onBack}>‹</button><h1>{title}</h1>{sub && <div className="lb">{sub}</div>}</div>`; `TAB_TITLES` em `Shell.jsx`: `{ groups: 'Grupos', cal: 'Calendário', income: 'Receitas', rec: 'Recorrentes', charts: 'Património', loan: 'Crédito', ai: 'Assistente', report: 'Análise', invest: 'Investimentos', transfers: 'Transferências', cards: 'Cartões', tax: 'Fiscal' }`. `MoreMenu` secções: "Registos" (income, rec, transfers, cards, groups), "Análise" (report, charts, cal, invest, loan, tax), "Assistente" (ai). `Sidebar.NAV` passa a ter os 15 (`report, invest, transfers, cards, tax` acrescentados).

- [ ] **Step 1: Teste que falha**
```jsx
// src/components/viewHeader.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import Shell from './Shell.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
describe('cabeçalho de vista e URL', () => {
  it('um destino de "Mais" tem título, voltar leva ao Resumo e a URL reflete a tab', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: richFixture(), tab: 'cal' });
    expect(screen.getByRole('heading', { level: 1, name: 'Calendário' })).toBeTruthy();
    expect(window.location.search).toContain('tab=cal');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Voltar' })); });
    expect(screen.queryByRole('heading', { level: 1, name: 'Calendário' })).toBeNull();
    expect(window.location.search).not.toContain('tab=cal');
  });
  it('"Mais" tem secções', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: richFixture(), openModal: 'more' });
    for (const s of ['Registos', 'Análise', 'Assistente']) expect(screen.getByText(s)).toBeTruthy();
  });
});
```
- [ ] **Step 2:** correr → falhas.
- [ ] **Step 3:** `ui.jsx`: em `goTab(key)`, depois de `setTab`, `if (typeof history !== 'undefined') history.pushState({ tab: key }, '', key === 'overview' ? location.pathname : '?tab=' + key)`; no `UIProvider` um `useEffect` que lê `new URLSearchParams(location.search).get('tab')` na montagem (se existir em `VIEWS`, `setTab`) e regista `popstate` → `setTab((e.state && e.state.tab) || 'overview')`. `Shell.jsx`: no layout móvel, quando `moreTabs.includes(tab)`, renderizar `<ViewHeader title={TAB_TITLES[tab]} onBack={() => goTab('overview')} />` acima da `ContextStrip`; o `<h1>` de saudação passa a `<div>` nessas tabs (só há um `h1` por ecrã). `MoreMenu`: `ITEMS` ganha `section` e o render agrupa com um `<div className="lb">` por secção. `Sidebar.NAV`: 15 entradas.
- [ ] **Step 4:** `npx vitest run src/components/viewHeader.test.jsx src/components/shell.nav.test.jsx src/components/shell.header.test.jsx src/views/views.render.test.jsx` → PASS.
- [ ] **Step 5: Commit** `feat(navegacao): título e voltar em cada ecrã, Mais por secções, sidebar completa, tab na URL`

---

### Task 16: Um só `MonthNav` (D12)

**Files:**
- Modify: `src/views/ExpensesView.jsx` (remover a barra `.tb` Jun/Jul/Ago/Set/3M e o rótulo "Junho – Setembro"; usar `MonthNav` + chip "3M"), `src/views/CardsView.jsx` (filtrar `exps`/`pays` pelo mês de `MonthNav`), `src/views/TransfersView.jsx` (idem), `src/components/MonthNav.jsx` (prop opcional `extra` para o chip "3M")
- Test: `src/views/monthNav.unified.test.jsx`

- [ ] **Step 1: Teste que falha**
```jsx
// src/views/monthNav.unified.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ExpensesView from './ExpensesView.jsx';
import CardsView from './CardsView.jsx';
import TransfersView from './TransfersView.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
describe('navegação temporal única', () => {
  for (const [name, el] of [['Despesas', <ExpensesView />], ['Cartões', <CardsView />], ['Transferências', <TransfersView />]]) {
    it(name + ' usa o MonthNav (mês anterior / seguinte) e não a barra de segmentos', async () => {
      const { container } = await renderWithStore(el, { fixture: richFixture() });
      expect(screen.getByRole('button', { name: /Meses anteriores/ })).toBeTruthy();
      expect(container.querySelector('.tb')).toBeNull();
      expect(container.textContent).not.toMatch(/Junho – Setembro/);
    });
  }
});
```
(Os `aria-label` das setas em `MonthNav.jsx:48,60` são "Meses anteriores" e "Meses seguintes".)
- [ ] **Step 2:** correr → falhas.
- [ ] **Step 3:** `MonthNav` ganha `extra` (nó renderizado à direita) e mantém `state.mOff`. `ExpensesView`: `em` fixa-se no índice do mês selecionado (o último da janela) e o "3M" passa a `useState` local (`range3`) mostrado como chip no `extra`; remover a `.tb` bar e o rótulo de intervalo. `CardsView`/`TransfersView`: `const ym = monthKeyAt(3, state.mOff)` (mês selecionado; ver `months.js`), filtrar listas por `(x.date||'').slice(0,7) === ym`, com "ver todos" que desliga o filtro.
- [ ] **Step 4:** `npx vitest run src/views/monthNav.unified.test.jsx src/views/views.render.test.jsx src/test/flows.test.jsx src/views/expensesDays.test.jsx` → PASS.
- [ ] **Step 5: Commit** `feat(tempo): um só MonthNav em Despesas, Cartões e Transferências`

---

### Task 17: Alvos de toque e rótulos da barra (D13)

**Files:** `src/styles/tokens.css:167` (`.icon-btn`), `:197` (`.bnav-btn`), `:309` (`.sugg button`), `src/views/GoalsView.jsx` (editar 32→ sem override; quick-add `padding:'12px 0'`), `src/views/OverviewView.jsx` (dispensar 32, olho 34, 28/28/28 → sem override), `src/views/CardsView.jsx:101,167` (Editar e apagar ≥44)
- Test: `src/test/touch.targets.test.js`

- [ ] **Step 1: Teste que falha**
```js
// src/test/touch.targets.test.js
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8');
describe('alvos de toque', () => {
  it('.icon-btn tem 44px e a barra 11px', () => {
    const css = read('styles/tokens.css');
    expect(css).toMatch(/\.icon-btn\{[^}]*width:44px;height:44px/);
    expect(css).toMatch(/\.bnav-btn\{[^}]*font-size:11px/);
    expect(css).toMatch(/\.sugg button\{[^}]*min-height:40px/);
  });
  for (const f of ['views/GoalsView.jsx', 'views/OverviewView.jsx', 'views/CardsView.jsx']) {
    it(f + ' não encolhe icon-btn abaixo de 44', () => {
      expect(read(f).match(/className="icon-btn"[^>]*style=\{\{[^}]*(width|height):\s*(2\d|3\d)\b/g) || []).toEqual([]);
    });
  }
});
```
- [ ] **Step 2 e 3:** correr; aplicar (ícone interior 16–18 px para não crescer). `CardsView.jsx:167` passa a `className="icon-btn"`; `:101` "Editar" com `minHeight: 44`.
- [ ] **Step 4:** `npx vitest run src/test/touch.targets.test.js src/views/views.render.test.jsx` e layout-check → PASS.
- [ ] **Step 5: Commit** `fix(toque): alvos de 44px e rótulos da barra legíveis`

---

### Task 18: Tab "Transações" (D14)

**Files:**
- Create: `src/views/TransactionsView.jsx`, `src/lib/days.js` (`dayLabel`, `groupByDay` movidos de `ExpensesView.jsx`)
- Modify: `src/components/Shell.jsx` (`VIEWS.transactions`, bottom nav "Despesas" → `transactions`, `TAB_TITLES`), `src/modals/MoreMenu.jsx` (`expenses` → "Orçamento" em Registos), `src/components/Sidebar.jsx`, `src/views/ExpensesView.jsx` (importa de `days.js`)
- Test: `src/views/transactions.test.jsx`

**Interfaces:** `TransactionsView` = `MonthNav` + pesquisa + feed de `addedExp` do mês, agrupado por dia (`groupByDay`), cada linha `MerchantLogo` + desc + categoria como `<select aria-label="Categoria de {desc}">` inline (muda com `actions.updateExpense(id, { cat })`) + `Amount kind="out"` + botão editar (abre `add` com `editId`). Vazio: "Sem movimentos em {mês}" + botão "+ Nova despesa".

- [ ] **Step 1: Teste que falha**
```jsx
// src/views/transactions.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import TransactionsView from './TransactionsView.jsx';
import Shell from '../components/Shell.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
function Probe() { const { state } = useStore(); return <pre data-testid="probe">{JSON.stringify(state.addedExp.find((x) => x.id === 'out1'))}</pre>; }
describe('Transações', () => {
  it('feed do mês agrupado por dia com logos e categoria em 2 toques', async () => {
    const { container } = await renderWithStore(<><TransactionsView /><Probe /></>, { fixture: richFixture() });
    expect(container.querySelectorAll('.day-lb').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Pingo Doce' }).length).toBeGreaterThan(0);
    const sel = screen.getByLabelText(/Categoria de COMPRA 4174 PINGO DOCE/);
    await act(async () => { fireEvent.change(sel, { target: { value: 'rest' } }); });
    expect(JSON.parse(screen.getByTestId('probe').textContent).cat).toBe('rest');
  });
  it('a tab "Despesas" da barra abre as Transações', async () => {
    window.innerWidth = 500;
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Despesas/ })); });
    expect(screen.getByRole('heading', { level: 1, name: 'Transações' })).toBeTruthy();
  });
});
```
- [ ] **Step 2:** correr → falhas.
- [ ] **Step 3:** mover `dayLabel`/`groupByDay` para `src/lib/days.js` (exportar; `ExpensesView` importa). Criar a vista conforme Interfaces (reutilizar a linha de pesquisa de `ExpensesView` como base). `Shell.jsx`: `VIEWS.transactions`, `slot('transactions', 'Despesas')` na barra, `TAB_TITLES.transactions = 'Transações'`, `expenses` entra em `moreTabs` com título "Orçamento". `MoreMenu`: item `expenses` "Orçamento — limites por categoria e transporte de saldo" na secção Registos. `Sidebar`: `transactions` no lugar de `expenses`, `expenses` mais abaixo.
- [ ] **Step 4:** `npx vitest run src/views/transactions.test.jsx src/components/shell.nav.test.jsx src/views/views.render.test.jsx src/views/expensesDays.test.jsx` → PASS (o `shell.nav.test` pode assumir que "Despesas" abre `expenses`; atualizar para `transactions`).
- [ ] **Step 5: Commit** `feat(transacoes): feed cronológico como tab Despesas; orçamento passa para Mais`

---

### Task 19: Fecho de P2

- [ ] `npm test` · `npm run build` · layout-check (4 larguras) · `git push origin react`.

---

## P3 — Comportamento e brilho

### Task 20: Enquadramento com agência (D15)

**Files:** `src/views/GoalsView.jsx` (chip de estado), `src/lib/goals.js` (`goalsAtRisk` já devolve `needed`/`gap`), `src/views/GoalsView.jsx` (celebração ≥95 %)
- Test: `src/views/goals.framing.test.jsx`

- [ ] **Step 1: Teste que falha**
```jsx
// src/views/goals.framing.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import GoalsView from './GoalsView.jsx';
vi.mock('../firebase/client.js', () => ({ auth: null, db: null, IS_FILE: false, initError: null, onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(), signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(), signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(), getIdToken: () => Promise.resolve(null), loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve() }));
vi.mock('../firebase/data.js', () => ({ loadUserData: () => Promise.resolve(null), syncUserData: () => Promise.resolve(), computeDiff: () => ({ upserts: [], deletes: [], root: null }), SUBCOLLECTIONS: {} }));
afterEach(() => cleanup());
function Probe() { const { state } = useStore(); return <pre data-testid="probe">{JSON.stringify(state.goals.map((g) => [g.id, g.current]))}</pre>; }
describe('metas com agência', () => {
  it('a meta em risco diz quanto falta por mês em vez de "atrasada"', async () => {
    const { container } = await renderWithStore(<GoalsView />, { fixture: richFixture() });
    expect(container.textContent).not.toMatch(/atrasada/);
    expect(container.textContent).toMatch(/\+\s?\d[\d\s.,]*\s?€\/mês para chegar a tempo/);
  });
  it('a meta a 98% oferece fechar agora e o botão reforça o resto', async () => {
    await renderWithStore(<><GoalsView /><Probe /></>, { fixture: richFixture() });
    expect(screen.getByText(/Faltam 100 € — fecha agora/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Fechar meta/ })); });
    const goals = JSON.parse(screen.getByTestId('probe').textContent);
    expect(goals.find((g) => g[0] === 'g2')[1]).toBe(6000);
  });
});
```
- [ ] **Step 2 e 3:** correr; no card da meta: quando `riskById[g.id]`, o chip passa a `'+' + fc(risk.gap > 0 ? risk.gap : risk.needed) + '/mês para chegar a tempo'` (tom `warn`, `title` com a frase completa já existente); quando `pctAbs >= 95 && pctAbs < 100`, linha destacada `Faltam {fc(rem)} — fecha agora` com botão `Fechar meta` que chama a ação de reforço existente (`+N` usa `actions.updateGoal(g.id, { current: g.current + amt })` — usar `rem`).
- [ ] **Step 4:** `npx vitest run src/views/goals.framing.test.jsx src/views/goalsIcons.test.jsx src/views/views.render.test.jsx` → PASS (o teste da Task 15 anterior que procurava "atrasada" passa a procurar "para chegar a tempo").
- [ ] **Step 5: Commit** `feat(metas): "+N €/mês para chegar a tempo" e fechar meta a 95%`

---

### Task 21: Hero neutro, FAB do assistente distinto e glifo próprio (D16)

**Files:** `src/styles/tokens.css:160` (`.hero`), `:209` (`.assistant-fab`), `src/components/Icon.jsx` (ícone `chat`), `src/components/QuickActions.jsx:14` (IA → `chat`), `src/components/AssistantFab.jsx` (ícone), `src/components/Hero.jsx`, `SpendHero.jsx` (cores de texto e sparkline)
- Test: `src/test/hero.neutral.test.js`

- [ ] **Step 1:** teste de fonte: `.hero{` contém `background:var(--surface)` e `color:var(--fg)` e não contém `--grad-hero`; `.assistant-fab{` contém `background:var(--secondary)`; `Icon.jsx` tem `chat:`; `QuickActions.jsx` não contém `'sparkle'`; e um render de `<SpendHero/>` e `<Hero/>` sem `rgba(255,255,255` nos estilos inline (`container.innerHTML` não contém `rgba(255,255,255`).
- [ ] **Step 2 e 3:** `.hero{position:relative;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:24px;padding:24px;overflow:hidden;box-shadow:var(--shadow)}`; `.chip.up/.down` no hero passam a `--success-soft`/`--signal-soft`; sparkline `stroke="var(--primary)"`; texto secundário `var(--fg-subtle)`. `.assistant-fab{background:var(--secondary)}`. Ícone `chat`: `<path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z" />`.
- [ ] **Step 4:** `npx vitest run src/test/hero.neutral.test.js src/components/hero.test.jsx src/views/overview.thesis.test.jsx` → PASS.
- [ ] **Step 5: Commit** `feat(visual): hero neutro, FAB do assistente próprio e ícone de conversa`

---

### Task 22: Primário escuro AA e contraste dos avatares (D17)

**Files:** `src/styles/tokens.css` (`--primary-cta` nos dois temas; `.tb.on`, `.ms.on`, `.dtoggle button.on`, `.bnav-center .fab` usam `--primary-cta`), `src/components/Buttons.jsx` (`PrimaryButton` → `--primary-cta`), `src/components/Avatar.jsx` (cor do texto por luminância), `src/lib/color.js` (novo: `luminance(hex)`, `contrast(a, b)`)
- Test: `src/lib/color.test.js`, `src/components/avatar.contrast.test.jsx`

- [ ] **Step 1: Testes que falham**
```js
// src/lib/color.test.js
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { contrast } from './color.js';
const css = fs.readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const tok = (block, name) => (block.match(new RegExp(name + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
const dark = css.slice(css.indexOf('html[data-theme="dark"]{'));
const light = css.slice(0, css.indexOf('html[data-theme="dark"]{'));
describe('contraste AA', () => {
  it('branco sobre --primary-cta ≥ 4,5 nos dois temas', () => {
    expect(contrast('#ffffff', tok(light, '--primary-cta'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', tok(dark, '--primary-cta'))).toBeGreaterThanOrEqual(4.5);
  });
  it('--primary como texto sobre --bg ≥ 4,5 nos dois temas', () => {
    expect(contrast(tok(light, '--primary'), tok(light, '--bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok(dark, '--primary'), tok(dark, '--bg'))).toBeGreaterThanOrEqual(4.5);
  });
});
```
```jsx
// src/components/avatar.contrast.test.jsx
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Avatar from './Avatar.jsx';
afterEach(() => cleanup());
describe('Avatar escolhe a cor do texto', () => {
  it('cor clara → texto escuro; cor escura → texto branco', () => {
    render(<><Avatar name="Ana" color="#f7b955" /><Avatar name="Bruno" color="#12b3a6" /></>);
    expect(screen.getByRole('img', { name: 'Ana' }).style.color).toBe('rgb(10, 22, 51)');
    expect(screen.getByRole('img', { name: 'Bruno' }).style.color).toBe('rgb(255, 255, 255)');
  });
});
```
- [ ] **Step 2 e 3:** `color.js`: `luminance` (sRGB → linear, 0.2126/0.7152/0.0722) e `contrast(a,b)`. Tokens: claro `--primary-cta:#2a5be0;` (igual ao primário); escuro `--primary-cta:#3d66d9;` (5,1:1 com branco) mantendo `--primary:#5b85f2` para texto. Trocar `background:var(--primary)` por `var(--primary-cta)` nas regras com texto branco listadas e em `PrimaryButton`. `Avatar`: `const light = /^#/.test(color) && luminance(color) > 0.35; style.color = light ? '#0a1633' : '#fff'` (para `var(--primary)` mantém branco).
- [ ] **Step 4:** `npx vitest run src/lib/color.test.js src/components/avatar.contrast.test.jsx src/components/avatar.test.jsx` → PASS; `node scripts/a11y.mjs` (vite em 5199) sem `color-contrast`.
- [ ] **Step 5: Commit** `fix(contraste): primário de botão AA no escuro e texto dos avatares por luminância`

---

### Task 23: Service worker com pedido de atualização (D18)

**Files:** `package.json` (+`vite-plugin-pwa` dev), `vite.config.js` (`VitePWA`), `src/App.jsx` (registo + toast "Atualizar"), `index.html` (manter `manifest.json`)
- Test: `src/test/pwa.config.test.js`

- [ ] **Step 1:** teste de fonte: `vite.config.js` contém `VitePWA(` e `registerType: 'prompt'`; `App.jsx` contém `virtual:pwa-register` dentro de `import.meta.env.PROD`; `package.json` tem `vite-plugin-pwa` em `devDependencies`.
- [ ] **Step 2:** `npm i -D vite-plugin-pwa`; `vite.config.js`: `VitePWA({ registerType: 'prompt', injectRegister: false, manifest: false, workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: '/index.html' }, devOptions: { enabled: false } })`; `App.jsx`: `useEffect(() => { if (!import.meta.env.PROD) return; import('virtual:pwa-register').then(({ registerSW }) => { const update = registerSW({ onNeedRefresh() { toast('Nova versão disponível', 'success', { action: { label: 'Atualizar', onClick: () => update(true) }, duration: 60000 }); } }); }); }, []);`.
- [ ] **Step 3:** `npm run build` gera `dist/sw.js`; `npm test` verde (o import é dinâmico e só em PROD).
- [ ] **Step 4: Commit** `feat(pwa): service worker com pedido de atualização em vez de hard reload`

---

### Task 24: QA manual, verificação final e push

- [ ] `testes.html`: suite **T46 — Redesign (Resumo, nova despesa, números, sistema)** com 16 casos: T46.1 hero "Podes gastar hoje" no pixel zero · T46.2 nova despesa: valor com foco, 6 categorias, "Mais categorias", conta pré-selecionada · T46.3 assistente: "regista despesa de restaurante X de 15€ hoje pago pelo Activobank" fica em `Activobank · Conta a Ordem` e o assistente confirma a conta · T46.4 assistente com conta ambígua pergunta qual · T46.5 modo oculto em todas as tabs (nenhum montante nem %) · T46.6 apagar despesa: ConfirmSheet com valor e "Anular" repõe · T46.7 apagar meta dentro do modal: dois toques · T46.8 total do mês igual em Despesas, Análise, Calendário e faixa · T46.9 património igual na faixa e em Património · T46.10 saída de dinheiro sempre "−" neutro; entradas "+" verdes; vermelho só em alertas · T46.11 título e "voltar" em cada destino de Mais; URL com `?tab=` · T46.12 MonthNav em Despesas, Cartões e Transferências · T46.13 tab Despesas = feed de transações com categoria inline · T46.14 texto invisível corrigido (Mac em aparência escura, app clara: Investimentos e Grupos legíveis) · T46.15 tema escuro: botões azuis com texto branco legível; avatares legíveis · T46.16 atualização: após deploy aparece "Nova versão disponível — Atualizar". Data e contagem na `.meta-row`.
- [ ] `npm test` · `npm run build` · layout-check · `node scripts/a11y.mjs` · screenshots das 7 tabs principais (claro e escuro, com o harness corrigido) para comparação com a auditoria.
- [ ] Commit `docs(qa): suite T46 do redesign` · `git push origin react`.
