# O assistente lê prints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o chat do assistente (`AssistantSheet`, caixa de chat do `AIView`) aceitar imagens — print de saldo, talão, notificação de pagamento, extrato — e agir com as ferramentas que já tem (`add_expense`, a nova `add_expenses`, `update_balance` corrigido).

**Architecture:** `runAssistant` passa a aceitar `cmd` como `string` ou array de blocos de conteúdo (o mesmo formato `{type:'image'|'text', ...}` que `toOpenAIContent` já traduz para OpenRouter). Uma imagem sobe o tier ao piso `equilibrado`. Uma ferramenta nova, `add_expenses`, regista várias despesas de um só extrato, com confirmação e pré-visualização da lista. `update_balance` passa a reconhecer contas personalizadas. As duas UIs ganham botão de anexo/câmara, miniaturas, e um marcador de texto no histórico em vez da imagem.

**Tech Stack:** React 18 + Vite, Vitest + Testing Library (jsdom), OpenRouter via `/api/ai` (formato OpenAI), CSS em `src/styles/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-09-03-assistente-le-imagens-design.md`

## Global Constraints

- **Sem dependências novas.** Nada entra no `package.json`.
- **Zero pedidos externos para imagens.** A imagem viaja só para o `/api/ai` já existente — nenhum outro destino.
- **Copy em português de Portugal, sem emoji na UI** (ícones via `components/Icon.jsx`).
- **Comentários de código em português**, no estilo dos ficheiros vizinhos — explicam o "porquê", nunca o "o quê".
- **Acessibilidade:** botões só com ícone têm `aria-label`; miniaturas têm `alt`.
- **Testes:** `npm test` (suite toda, tem de ficar verde no fim de cada tarefa), `npx vitest run <ficheiro>` (um ficheiro), `npm run build`.
- **Layout:** no fim das fatias que tocam UI (D, E), `(npx vite --port 5199 > /dev/null 2>&1 &) ; sleep 4 ; node scripts/layout-check.mjs ; pkill -f "vite --port 5199"` sem problemas.
- **Commits:** `tipo(escopo): mensagem` em PT, com trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Push para `origin react` no fim de cada fatia.
- **Mocks de Firebase** em cada ficheiro de teste de view/modal (copiar o bloco `vi.mock` de `src/components/hero.test.jsx` ou `src/lib/aiTools.test.js:17-30`).
- **Coordenação:** `src/views/AIView.jsx` é o único ficheiro deste plano que outra sessão pode estar a tocar em simultâneo (redesign do Resumo). Antes da Tarefa 8, correr `git pull --ff-only origin react` e confirmar que o ficheiro não tem alterações locais de outra fonte.

Bloco de mocks a copiar para testes novos de view/modal:

```jsx
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
```

---

## Fatia A — `runAssistant` aceita conteúdo multimodal

### Task 1: Conteúdo multimodal, piso de tier, marcador no histórico

**Files:**
- Modify: `src/lib/aiChat.js` (`runAssistant`, linhas 131-146)
- Test: `src/lib/aiChat.test.js`

**Interfaces:**
- Consumes: `toOpenAIContent` (`src/lib/ai.js:99`, já traduz blocos `{type:'image'|'text'}` — não muda).
- Produces: `runAssistant(cmd, opts)` aceita `cmd: string | ContentBlock[]`; `ContentBlock = {type:'text', text} | {type:'image', source:{type:'base64', media_type, data}}`. Continua a devolver `{text, applied, pending, usage, messages, error?}` — a forma não muda.

- [ ] **Step 1: Escrever os testes que falham**

```js
// em src/lib/aiChat.test.js, dentro de describe('runAssistant')

it('aceita cmd como array de blocos multimodais e envia-o tal como está para o chatFn', async () => {
  const chatFn = vi.fn(() => Promise.resolve(say('Vejo um saldo de 584,64 EUR.')));
  const cmd = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
    { type: 'text', text: 'Atualiza o saldo com isto' },
  ];
  const out = await runAssistant(cmd, { ...ctx(), chatFn, tier: 'economico' });
  expect(out.text).toBe('Vejo um saldo de 584,64 EUR.');
  const firstCallMessages = chatFn.mock.calls[0][0];
  const userMsg = firstCallMessages[firstCallMessages.length - 1];
  expect(userMsg.role).toBe('user');
  expect(userMsg.content).toEqual(cmd);
});

it('uma imagem sobe o tier ao piso equilibrado mesmo pedindo economico', async () => {
  const chatFn = vi.fn(() => Promise.resolve(say('ok')));
  const cmd = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }];
  await runAssistant(cmd, { ...ctx(), chatFn, tier: 'economico' });
  expect(chatFn.mock.calls[0][1].tier).toBe('equilibrado');
});

it('avancado nao desce quando ha imagem — o piso e um MINIMO, nao um valor fixo', async () => {
  const chatFn = vi.fn(() => Promise.resolve(say('ok')));
  const cmd = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }];
  await runAssistant(cmd, { ...ctx(), chatFn, tier: 'avancado' });
  expect(chatFn.mock.calls[0][1].tier).toBe('avancado');
});

it('sem imagem, o tier pedido passa tal como esta (sem piso)', async () => {
  const chatFn = vi.fn(() => Promise.resolve(say('ok')));
  const out = await runAssistant('texto normal', { ...ctx(), chatFn, tier: 'economico' });
  expect(chatFn.mock.calls[0][1].tier).toBe('economico');
  expect(out.text).toBe('ok');
});

it('no historico devolvido, uma mensagem com imagem fica reduzida a um marcador de texto', async () => {
  const chatFn = vi.fn(() => Promise.resolve(say('Registei.')));
  const cmd = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
    { type: 'text', text: 'regista isto' },
  ];
  const out = await runAssistant(cmd, { ...ctx(), chatFn, tier: 'economico' });
  const userMsgInHistory = out.messages.find((m) => m.role === 'user');
  expect(userMsgInHistory.content).toBe('[imagem] regista isto');
});

it('marcador sem texto a acompanhar a imagem fica so "[imagem]"', async () => {
  const chatFn = vi.fn(() => Promise.resolve(say('ok')));
  const cmd = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }];
  const out = await runAssistant(cmd, { ...ctx(), chatFn, tier: 'economico' });
  const userMsgInHistory = out.messages.find((m) => m.role === 'user');
  expect(userMsgInHistory.content).toBe('[imagem]');
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/lib/aiChat.test.js`
Expected: FAIL nos 6 testes novos (o array de blocos vai para `content` sem tradução nenhuma hoje; não há piso de tier; não há marcador).

- [ ] **Step 3: Implementar em `aiChat.js`**

No topo do ficheiro, a seguir aos imports existentes:

```js
// Piso de tier quando a mensagem do utilizador leva imagem — o MESMO
// raciocinio do chao de documentos em lib/ai.js (TIER_FOR_MODEL): um modelo
// barato a ler um print e falsa economia. So 'avancado', escolhido pelo
// utilizador, sobe acima do piso; qualquer outra coisa cai em 'equilibrado'.
const IMAGE_TIER_FLOOR = 'equilibrado';
function tierForContent(tier, hasImage) {
  if (!hasImage) return tier || 'economico';
  return tier === 'avancado' ? 'avancado' : IMAGE_TIER_FLOOR;
}

function hasImageBlock(content) {
  return Array.isArray(content) && content.some((b) => b && b.type === 'image');
}

// Reduz uma mensagem com imagem a um marcador de texto para o historico da
// PROXIMA chamada — sem isto, cada volta seguinte reenviava a imagem
// (custo cresce sozinho) e o aiHistory persistido no Firestore engordava
// com base64. So se aplica a mensagens role:'user' com content em array;
// o resto (assistant, tool) passa tal como esta.
function markerFor(content) {
  if (!Array.isArray(content)) return content;
  const text = content
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join(' ')
    .trim();
  return text ? '[imagem] ' + text : '[imagem]';
}
```

Alterar a assinatura e o corpo de `runAssistant` (substituir as linhas que constroem `messages` e a chamada a `chatFn`):

```js
export async function runAssistant(cmd, opts) {
  const o = opts || {};
  const chatFn = o.chatFn || defaultChat;
  const ctx = toolCtx(o.actions, o.currentUser, o.state);
  const messages = [
    ...(o.systemPrompt ? [{ role: 'system', content: o.systemPrompt }] : []),
    ...(o.history || []),
    { role: 'user', content: cmd },
  ];
  const tier = tierForContent(o.tier, hasImageBlock(cmd));

  let usage = {};
  const applied = [];
  const pending = [];

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await chatFn(messages, { tools: TOOL_SCHEMAS, tier, maxTokens: 2000 });
```

(o resto do corpo do `for` não muda). No fim de cada `return` que devolve `messages: [...]`, a mensagem `user` original (com imagem) tem de sair reduzida ao marcador — a forma mais simples e sem duplicar os três pontos de retorno é mapear `messages` uma vez, no fim, antes de cada `return`. Substituir as três ocorrências de `messages: [...messages, ...]` (a de resposta sem tools, a de fim de rondas, e a do `catch`) para passarem primeiro por um mapeamento:

```js
function withMarkers(msgs) {
  return msgs.map((m) => (m.role === 'user' && Array.isArray(m.content) ? { ...m, content: markerFor(m.content) } : m));
}
```

E trocar cada `messages: [...messages, X]` por `messages: withMarkers([...messages, X])` nos três `return` (resposta final sem tool_calls, fim de `MAX_ROUNDS`, e o `catch`). `o.tier || 'economico'` na chamada a `chatFn` já não é necessário — `tier` já cobre isso (ver `tierForContent`).

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/lib/aiChat.test.js`
Expected: PASS — todos os testes, incluindo os pré-existentes (a mudança de `userText` para `cmd` é só de nome, a forma de `messages` não muda para chamadores de string).

- [ ] **Step 5: Suite completa e commit**

Run: `npm test`
Expected: tudo verde.

```bash
git add src/lib/aiChat.js src/lib/aiChat.test.js
git commit -m "feat(assistente): runAssistant aceita imagem, sobe o tier e reduz a marcador no historico

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 2: Fecho da fatia A — build, push

**Files:** nenhum a modificar.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `✓ built in …`, sem avisos novos (o aviso do chunk firebase de 500kB é pré-existente).

- [ ] **Step 2: Push**

```bash
git push origin react
```

---

## Fatia B — `update_balance` com contas personalizadas e data

### Task 3: Resolver a conta por `listAccounts()`, aceitar `date`

**Files:**
- Modify: `src/lib/aiTools.js` (`update_balance`, linhas 567-624)
- Test: `src/lib/aiTools.test.js`

**Interfaces:**
- Consumes: `listAccounts(state)` (`src/lib/balances.js:71`, já importado em `aiTools.js:21`); `normAcct` (`src/lib/finance.js`, já usado por `resolveAccountRef`); `safeDate` (`aiTools.js:261`, já existe).
- Produces: `update_balance` mantém a assinatura `{account_bank, account_type, value, note?, date?, confirmed?}`. `preview()`/`run()` continuam a devolver a mesma forma (`{action, kind, label, before, after}` / `{error:'not_found'}`).

- [ ] **Step 1: Escrever os testes que falham**

```js
// em src/lib/aiTools.test.js, dentro de describe('update_balance (destrutiva) e add_snapshot')

it('resolve uma conta PERSONALIZADA por bank+type — hoje devolve not_found mesmo existindo', () => {
  const c = writeCtx({ customAccts: [{ id: 'cc1', bank: 'N26', type: 'Cartão de Crédito', value: 0, category: 'Crédito' }] });
  const r = execTool('update_balance', { account_bank: 'N26', account_type: 'Cartão de Crédito', value: 120.5 }, c);
  expect(r.pending).toBe(true);
  expect(r.preview.error).toBeUndefined();
});

it('confirmado, uma conta personalizada grava com custom:true e o id da conta', () => {
  const c = writeCtx({ customAccts: [{ id: 'cc1', bank: 'N26', type: 'Cartão de Crédito', value: 0, category: 'Crédito' }] });
  const r = execTool('update_balance', { account_bank: 'N26', account_type: 'Cartão de Crédito', value: 120.5, confirmed: true }, c);
  expect(r.ok).toBe(true);
  const arg = c.actions.addBalanceReading.mock.calls[0][0];
  expect(arg.account).toEqual({ bank: 'N26', type: 'Cartão de Crédito', custom: true, id: 'cc1' });
});

it('bank/type com capitalizacao ou espacos diferentes ainda encontra a conta (normAcct)', () => {
  const c = writeCtx({ customAccts: [{ id: 'cc1', bank: 'N26', type: 'Cartão de Crédito', value: 0, category: 'Crédito' }] });
  const r = execTool('update_balance', { account_bank: '  n26 ', account_type: 'cartão de crédito', value: 50, confirmed: true }, c);
  expect(r.ok).toBe(true);
  expect(c.actions.addBalanceReading).toHaveBeenCalledTimes(1);
});

it('aceita date opcional; sem date usa hoje como antes', () => {
  const c = writeCtx();
  const r1 = execTool('update_balance', { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 10, date: '2026-08-15', confirmed: true }, c);
  expect(r1.ok).toBe(true);
  expect(c.actions.addBalanceReading.mock.calls[0][0].date).toBe('2026-08-15');
  const c2 = writeCtx();
  execTool('update_balance', { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 10, confirmed: true }, c2);
  expect(c2.actions.addBalanceReading.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('uma data invalida cai em hoje, nunca entra tal e qual (mesma regra de add_expense)', () => {
  const c = writeCtx();
  execTool('update_balance', { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 10, date: 'ontem', confirmed: true }, c);
  expect(c.actions.addBalanceReading.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: FAIL nos 5 testes novos (conta personalizada devolve `not_found`; `date` é ignorada).

- [ ] **Step 3: Implementar em `aiTools.js`**

Adicionar a seguir a `resolveAcctArg` (linha ~362), antes de `const writeTools = {`:

```js
// update_balance recebe {account_bank, account_type} em vez de um "acct"
// livre — o par ja vem exato do contexto (accounts no system prompt), por
// isso comparamos por bank/type normalizados em vez de reutilizar o
// resolveAccountRef em texto livre (esse serve para frases, este para um
// par ja identificado). listAccounts() ja deduplica por "banco · tipo"
// normalizado (balances.js) — um bank+type nunca pode apontar para duas
// contas ao mesmo tempo, por isso este resolvedor nunca devolve ambiguo.
function resolveBalanceAccount(args, state) {
  const nb = normAcct(args.account_bank || '');
  const nt = normAcct(args.account_type || '');
  return (listAccounts(state) || []).find((a) => normAcct(a.bank) === nb && normAcct(a.type) === nt) || null;
}
```

Importar `normAcct` no topo do ficheiro (linha 16, junto a `compute, getGroupsData, accts as ACCT_TEMPLATES`):

```js
import { compute, getGroupsData, accts as ACCT_TEMPLATES, normAcct } from './finance.js';
```

Substituir o `preview()` e o `run()` de `update_balance` (linhas ~581-624):

```js
    preview(args, { actions }) {
      const acc = resolveBalanceAccount(args, actions.getState() || {});
      if (!acc) return notFound();
      const key = acc.custom ? acc.id : acc.bank + '_' + acc.type;
      const cur = ((actions.getState() || {}).dynAccts || {})[key] || null;
      const note = args.note != null && args.note !== '' ? txt(args.note) : null;
      const before = { key, value: cur ? cur.v : null, note: cur ? cur.n || null : null };
      const after = { key, value: Number(args.value) || 0, note: note || before.note };
      return {
        action: 'update',
        kind: 'saldo',
        label:
          acc.bank + ' · ' + acc.type + ' · ' +
          (before.value == null ? 'sem leitura' : eur(before.value)) + ' → ' + eur(after.value),
        before,
        after,
        acc,
      };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      const note = args.note != null && args.note !== '' ? txt(args.note) : undefined;
      ctx.actions.addBalanceReading({
        account: p.acc.custom
          ? { bank: p.acc.bank, type: p.acc.type, custom: true, id: p.acc.id }
          : { bank: p.acc.bank, type: p.acc.type, custom: false },
        value: p.after.value,
        date: args.date ? safeDate(args.date) : todayISO(),
        note,
      });
      return ok({ key: p.after.key, value: p.after.value });
    },
```

No schema (linhas ~570-578), acrescentar `date` a `properties` (sem o pôr em `required` — omitir continua a significar hoje):

```js
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
```

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: PASS — os 5 novos e os 5 pré-existentes de `update_balance` (o teste de `not_found` com `'Transacoes'` sem acento continua a falhar a resolução, porque `normAcct` só colapsa espaços, não acentos — ver `src/lib/accounts.js:10-15`).

- [ ] **Step 5: Suite completa e commit**

Run: `npm test`
Expected: tudo verde.

```bash
git add src/lib/aiTools.js src/lib/aiTools.test.js
git commit -m "fix(assistente): update_balance reconhece contas personalizadas e aceita data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 4: Fecho da fatia B — build, push

- [ ] **Step 1:** `npm run build` — sem avisos novos.
- [ ] **Step 2:** `git push origin react`

---

## Fatia C — `add_expenses` (extrato com várias linhas)

### Task 5: A ferramenta `add_expenses`

**Files:**
- Modify: `src/lib/aiTools.js` (novo tool em `writeTools`, exportar em `TOOLS`)
- Test: `src/lib/aiTools.test.js`

**Interfaces:**
- Consumes: `sanitizeExpenseFields` (`aiTools.js:311`), `resolveAcctArg` (`aiTools.js:356`), `formatReadingDate` (`src/lib/balances.js:38`).
- Produces: tool `add_expenses`, schema `{expenses: Array<{desc, amount, cat?, date?, acct?}>, confirmed?}`, `destructive: true`. `preview()` devolve `{action:'create', kind:'despesas', label, lines: string[], resolved: Array<expense>}` ou `{error}`. `run()` devolve `{ok:true, data:{count, ids}}`.

- [ ] **Step 1: Escrever os testes que falham**

```js
// em src/lib/aiTools.test.js — novo describe, a seguir a 'update_balance (destrutiva) e add_snapshot'

describe('add_expenses (destrutiva, lote de despesas)', () => {
  const lote = [
    { desc: 'Continente', amount: 34.5, cat: 'sup', date: '2026-08-20' },
    { desc: 'Galp', amount: 42, cat: 'cmb' },
  ];

  it('NAO grava nada na primeira chamada — pre-visualiza a lista e o total', () => {
    const c = writeCtx();
    const r = execTool('add_expenses', { expenses: lote }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.action).toBe('create');
    expect(r.preview.kind).toBe('despesas');
    expect(r.preview.label).toContain('2 despesas');
    expect(r.preview.label).toContain('76.50 EUR');
    expect(r.preview.lines).toHaveLength(2);
    expect(r.preview.lines[0]).toContain('Continente');
    expect(r.preview.lines[0]).toContain('34.50 EUR');
    expect(c.actions.addExpense).not.toHaveBeenCalled();
  });

  it('confirmado, grava uma despesa por linha via addExpense', () => {
    const c = writeCtx();
    const r = execTool('add_expenses', { expenses: lote, confirmed: true }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addExpense).toHaveBeenCalledTimes(2);
    expect(r.data.count).toBe(2);
    expect(r.data.ids).toHaveLength(2);
  });

  it('sem data usa hoje, exatamente como add_expense', () => {
    const c = writeCtx();
    execTool('add_expenses', { expenses: [{ desc: 'Galp', amount: 42 }], confirmed: true }, c);
    const exp = c.actions.addExpense.mock.calls[0][0];
    expect(exp.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(exp.cat).toBe('out');
  });

  it('resolve acct por linha, com a mesma logica de add_expense', () => {
    const c = writeCtx({ customAccts: [{ id: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 0 }] });
    execTool('add_expenses', { expenses: [{ desc: 'X', amount: 5, acct: 'Activobank' }], confirmed: true }, c);
    expect(c.actions.addExpense.mock.calls[0][0].acct).toBe('Activobank · Conta a Ordem');
  });

  it('acct ambiguo numa linha rejeita o lote inteiro, sem gravar nenhuma', () => {
    const c = writeCtx({
      customAccts: [
        { id: 'a1', bank: 'Revolut', type: 'Conta', value: 0 },
        { id: 'a2', bank: 'Revolut', type: 'Cartão', value: 0 },
      ],
    });
    const r = execTool('add_expenses', { expenses: [{ desc: 'X', amount: 5, acct: 'Revolut' }] }, c);
    expect(r.error).toBe('ambiguous_account');
    expect(c.actions.addExpense).not.toHaveBeenCalled();
  });

  it('lista vazia e invalid_args, sem escrever', () => {
    const c = writeCtx();
    const r = execTool('add_expenses', { expenses: [] }, c);
    expect(r.error).toBe('invalid_args');
    expect(c.actions.addExpense).not.toHaveBeenCalled();
  });

  it('mais de 60 despesas e invalid_args — o mesmo teto do importador de documentos', () => {
    const c = writeCtx();
    const many = Array.from({ length: 61 }, (_, i) => ({ desc: 'X' + i, amount: 1 }));
    const r = execTool('add_expenses', { expenses: many }, c);
    expect(r.error).toBe('invalid_args');
    expect(c.actions.addExpense).not.toHaveBeenCalled();
  });

  it('nao entra em WRITE_TOOL_SLICES — e destrutiva, nunca aparece em applied', () => {
    expect(WRITE_TOOL_SLICES.add_expenses).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: FAIL — `add_expenses` não existe (`execTool` devolve `{error:'unknown_tool'}` ou equivalente).

- [ ] **Step 3: Implementar em `aiTools.js`**

Importar `formatReadingDate` (linha 21, junto a `listAccounts`):

```js
import { listAccounts, formatReadingDate } from './balances.js';
```

Acrescentar dentro de `writeTools`, a seguir a `add_expense` (depois da linha 396):

```js
  add_expenses: {
    destructive: true,
    schema: {
      type: 'object',
      properties: {
        expenses: {
          type: 'array',
          description: 'lista de despesas a registar de uma vez (ex: linhas de um extrato ou recibo com vários itens)',
          items: {
            type: 'object',
            properties: {
              desc: { type: 'string', description: 'descricao curta' },
              amount: { type: 'number', description: 'valor em euros; o sinal e ignorado (guardado positivo)' },
              cat: { type: 'string', description: 'categoria: ' + CATS },
              date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
              acct: { type: 'string', description: 'conta que pagou — mesma regra de add_expense' },
            },
            required: ['desc', 'amount'],
          },
        },
        confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
      },
      required: ['expenses'],
    },
    description: 'Regista varias despesas de uma vez (ex: todas as linhas de um extrato). O utilizador confirma a lista antes de gravar.',
    preview(args, ctx) {
      const list = Array.isArray(args.expenses) ? args.expenses : [];
      if (!list.length) return { error: 'invalid_args', detail: 'expenses vazio' };
      // Mesmo teto do importador de documentos (AI_IMPORT_PROMPT, lib/ai.js)
      // — um numero, nao dois, para as duas portas de entrada concordarem.
      if (list.length > 60) return { error: 'invalid_args', detail: 'demasiadas despesas (máx 60)' };
      const resolved = [];
      for (const raw of list) {
        const ra = resolveAcctArg(raw, ctx);
        if (ra.error) return ra;
        resolved.push({
          id: uid(),
          ...sanitizeExpenseFields({ desc: raw.desc, amount: raw.amount, cat: raw.cat, date: raw.date }),
          ...(ra.acct ? { acct: ra.acct } : {}),
        });
      }
      const total = resolved.reduce((s, e) => s + e.amount, 0);
      return {
        action: 'create',
        kind: 'despesas',
        label: resolved.length + ' despesas · ' + eur(total),
        lines: resolved.map((e) => formatReadingDate(e.date) + ' · ' + e.desc + ' · ' + eur(e.amount)),
        resolved,
      };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      p.resolved.forEach((exp) => ctx.actions.addExpense(exp));
      return ok({ count: p.resolved.length, ids: p.resolved.map((e) => e.id) });
    },
  },

```

`add_expenses` NÃO entra em `WRITE_TOOL_SLICES` — é destrutiva (confirm-gated), como `update_balance` e `set_budget`; o comentário em `aiTools.js:1004-1009` já documenta a regra.

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: PASS.

- [ ] **Step 5: Suite completa e commit**

Run: `npm test`
Expected: tudo verde.

```bash
git add src/lib/aiTools.js src/lib/aiTools.test.js
git commit -m "feat(assistente): add_expenses regista um extrato inteiro de uma vez

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 6: `PendingActionCard` mostra a lista

**Files:**
- Modify: `src/components/PendingActionCard.jsx`
- Test: novo `src/components/pendingActionCard.test.jsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: `PendingActionCard({preview, onConfirm, onCancel, busy})` continua igual; `preview.action` aceita agora `'create'` além de `'update'`/`'delete'`; `preview.lines?: string[]` opcional — quando presente, renderiza-se uma lista por baixo do `label`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/components/pendingActionCard.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PendingActionCard from './PendingActionCard.jsx';

afterEach(() => cleanup());

describe('PendingActionCard', () => {
  it('acao "create" mostra "Registar", nao "Alterar"', () => {
    render(<PendingActionCard preview={{ action: 'create', kind: 'despesas', label: '2 despesas · 76.50 EUR' }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Registar/)).toBeInTheDocument();
    expect(screen.queryByText(/Alterar/)).toBeNull();
  });

  it('com lines, mostra cada linha', () => {
    render(
      <PendingActionCard
        preview={{ action: 'create', kind: 'despesas', label: '2 despesas · 76.50 EUR', lines: ['20/08/2026 · Continente · 34.50 EUR', '06/09/2026 · Galp · 42.00 EUR'] }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/Continente/)).toBeInTheDocument();
    expect(screen.getByText(/Galp/)).toBeInTheDocument();
  });

  it('sem lines, nao ha lista nenhuma (comportamento antigo preservado)', () => {
    render(<PendingActionCard preview={{ action: 'update', kind: 'saldo', label: 'Bankinter · 100 → 200' }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Alterar/)).toBeInTheDocument();
    expect(screen.getByText('Bankinter · 100 → 200')).toBeInTheDocument();
  });

  it('acao "delete" continua a mostrar "Apagar"', () => {
    render(<PendingActionCard preview={{ action: 'delete', kind: 'despesa', label: 'Continente · 34.50 EUR' }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Apagar/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/components/pendingActionCard.test.jsx`
Expected: FAIL — `action: 'create'` cai no `'Alterar'` por omissão; `lines` não é lido.

- [ ] **Step 3: Implementar em `PendingActionCard.jsx`**

```jsx
import React from 'react';
import { PrimaryButton, SecondaryButton } from './Buttons.jsx';

const ACTION_LABEL = { delete: 'Apagar', create: 'Registar', update: 'Alterar' };

export default function PendingActionCard({ preview, onConfirm, onCancel, busy }) {
  const p = preview || {};
  return (
    <div className="cs" style={{ padding: 14, marginTop: 10 }}>
      <div className="lb" style={{ marginBottom: 6 }}>
        {ACTION_LABEL[p.action] || 'Alterar'} &middot; {p.kind || ''}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: p.lines && p.lines.length ? 8 : 12 }}>{p.label}</div>
      {p.lines && p.lines.length > 0 && (
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          {p.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <PrimaryButton onClick={onConfirm} disabled={busy} style={{ flex: 1 }}>
          Confirmar
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} disabled={busy} style={{ flex: 1, color: 'var(--text2)' }}>
          Cancelar
        </SecondaryButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/components/pendingActionCard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Suite completa, build, commit**

Run: `npm test && npm run build`
Expected: tudo verde, build limpo.

```bash
git add src/components/PendingActionCard.jsx src/components/pendingActionCard.test.jsx
git commit -m "feat(assistente): PendingActionCard mostra lista de linhas e rotulo Registar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 7: Fecho da fatia C — push

```bash
git push origin react
```

---

## Fatia D — Anexo no `AssistantSheet`

### Task 8: Botões de anexo/câmara, miniaturas, envio com imagem

**Files:**
- Modify: `src/modals/AssistantSheet.jsx`
- Modify: `src/test/setup.js` (stub de `URL.createObjectURL`/`revokeObjectURL` — ver aviso de ambiente abaixo)
- Test: `src/modals/assistant.test.jsx` (ficheiro já existente — acrescentar casos)

**Interfaces:**
- Consumes: `resizeImg` (`src/lib/ai.js:248`), `runAssistant` (agora aceita `cmd` multimodal — Task 1).
- Produces: nenhuma interface nova para fora do componente.

**Antes de começar:** confirmar que `src/views/AIView.jsx` não tem alterações locais de outra sessão (`git status` limpo nesse ficheiro) — este plano só o toca na Task 10.

**Avisos de ambiente (dois, ambos verificados por sonda direta ao jsdom desta versão — 25.0.1):**

1. `resizeImg` (`src/lib/ai.js:248`) usa `Image.onload`, que **nunca dispara em jsdom** (sem `resources:'usable'` no `vitest.config.js:9`, `environment: 'jsdom'` puro) — um teste que chame `addImage` sem mockar `resizeImg` fica pendurado até ao timeout. `assistant.test.jsx` já mocka `../lib/aiChat.js` por inteiro (linhas 17-33) mas nunca mockou `../lib/ai.js` — este é o primeiro teste do ficheiro a precisar disso.
2. `URL.createObjectURL`/`revokeObjectURL` **não existem** neste jsdom (`typeof window.URL.createObjectURL === 'undefined'`) — a miniatura (`URL.createObjectURL(file)` em `addImage`) rebentaria em todos os testes desta tarefa e da Task 10 sem um stub. `src/test/setup.js` já stub-a outras APIs em falta no jsdom pela mesma razão (`matchMedia`, `scrollTo`, `scrollIntoView`) — acrescentar mais duas ali, uma única vez, cobre as duas tarefas.

Acrescentar a `src/test/setup.js`, a seguir ao bloco de `scrollTo`/`scrollIntoView` já existente:

```js
// URL.createObjectURL/revokeObjectURL não existem no jsdom — usados para a
// miniatura de uma imagem anexada ao assistente (Task 8/10). Stub
// determinístico: os testes nunca inspecionam o valor, só que existe um
// <img src>.
if (typeof window !== 'undefined' && !window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
}
```

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar este mock parcial a seguir ao `vi.mock('../lib/aiChat.js', ...)` já existente (antes do `import AssistantSheet from './AssistantSheet.jsx';`):

```jsx
// resizeImg nunca resolve em jsdom (Image.onload não dispara sem
// resources:'usable') — mock parcial: mantém buildAIContext real (a folha
// importa os dois de lib/ai.js), stub resizeImg para resolver já.
vi.mock('../lib/ai.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resizeImg: vi.fn(() => Promise.resolve('ZmFrZQ==')) };
});
```

Acrescentar ao `describe('AssistantSheet', ...)` existente:

```jsx
it('anexar uma imagem mostra uma miniatura com botao de remover', async () => {
  await openSheet();
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Anexar imagem');
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  expect(await screen.findByAltText('Imagem anexada 1')).toBeInTheDocument();
  expect(screen.getByLabelText('Remover imagem 1')).toBeInTheDocument();
});

it('remover a miniatura tira a imagem da proxima mensagem', async () => {
  await openSheet();
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Anexar imagem');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await screen.findByAltText('Imagem anexada 1');
  fireEvent.click(screen.getByLabelText('Remover imagem 1'));
  expect(screen.queryByAltText('Imagem anexada 1')).toBeNull();
});

it('no maximo 3 imagens por mensagem — a 4a e recusada', async () => {
  await openSheet();
  const input = screen.getByLabelText('Anexar imagem');
  for (let n = 1; n <= 4; n++) {
    const f = new File(['x'], 'p' + n + '.jpg', { type: 'image/jpeg' });
    await act(async () => { fireEvent.change(input, { target: { files: [f] } }); });
  }
  expect(await screen.findByAltText('Imagem anexada 3')).toBeInTheDocument();
  expect(screen.queryByAltText('Imagem anexada 4')).toBeNull();
});

it('enviar com imagem e texto compoe um cmd multimodal e limpa o anexo depois', async () => {
  runAssistant.mockResolvedValue({ text: 'Registei.', applied: [], pending: [], usage: {} });
  await openSheet();
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Anexar imagem');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await screen.findByAltText('Imagem anexada 1');
  fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'atualiza o saldo' } });
  fireEvent.click(screen.getByText('Enviar'));
  await waitFor(() => expect(runAssistant).toHaveBeenCalledTimes(1));
  const cmd = runAssistant.mock.calls[0][0];
  expect(Array.isArray(cmd)).toBe(true);
  expect(cmd[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'ZmFrZQ==' } });
  expect(cmd[1]).toEqual({ type: 'text', text: 'atualiza o saldo' });
  await waitFor(() => expect(screen.queryByAltText('Imagem anexada 1')).toBeNull());
});

it('enviar só imagem, sem texto, compoe cmd so com o bloco de imagem', async () => {
  runAssistant.mockResolvedValue({ text: 'Vejo um saldo de 100 EUR.', applied: [], pending: [], usage: {} });
  await openSheet();
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Anexar imagem');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await screen.findByAltText('Imagem anexada 1');
  fireEvent.click(screen.getByText('Enviar'));
  await waitFor(() => expect(runAssistant).toHaveBeenCalledTimes(1));
  expect(runAssistant.mock.calls[0][0]).toEqual([
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'ZmFrZQ==' } },
  ]);
});
```

`waitFor` já está importado no topo do ficheiro (linha 3, junto a `screen, fireEvent, act`).

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/modals/assistant.test.jsx`
Expected: FAIL — não há `input` com `aria-label="Anexar imagem"` nem miniaturas.

- [ ] **Step 3: Implementar em `AssistantSheet.jsx`**

Import novo, junto aos existentes:

```jsx
import { resizeImg } from '../lib/ai.js';
```

Novo estado, a seguir a `const historyRef = useRef([]);`:

```jsx
  // Imagens anexadas à PRÓXIMA mensagem: {id, previewUrl, b64}. previewUrl
  // (object URL) é só para a miniatura — nunca vai para o pedido; b64 é o
  // que entra no bloco de conteúdo. Revogado ao remover/enviar (evita fugas
  // de memória de object URLs).
  const [images, setImages] = useState([]);
  const MAX_IMAGES = 3;

  const addImage = useCallback((file) => {
    if (!file) return;
    setImages((prev) => {
      if (prev.length >= MAX_IMAGES) {
        toast('Máximo de 3 imagens por mensagem', 'error');
        return prev;
      }
      const id = Date.now() + '_' + Math.random().toString(36).slice(2);
      const previewUrl = URL.createObjectURL(file);
      resizeImg(file, 1600).then((b64) => {
        setImages((cur) => cur.map((im) => (im.id === id ? { ...im, b64 } : im)));
      });
      return [...prev, { id, previewUrl, b64: null }];
    });
  }, [toast]);

  const removeImage = useCallback((id) => {
    setImages((prev) => {
      const found = prev.find((im) => im.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((im) => im.id !== id);
    });
  }, []);
```

Alterar `send` para compor `cmd` multimodal quando há imagens, e limpar `images` ao enviar. Substituir a linha `const cmd = text.trim();` e a chamada a `runAssistant(cmd, {`:

```jsx
  const send = useCallback(() => {
    const textCmd = text.trim();
    const readyImages = images.filter((im) => im.b64);
    if ((!textCmd && !readyImages.length) || busy) return;
    if (images.length && readyImages.length < images.length) return; // ainda a redimensionar
    setBusy(true);
    const before = snapshotSlices(actions.getState());
    const tierAtSend = actions.getState().aiTier;
    const cmd = readyImages.length
      ? [
          ...readyImages.map((im) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.b64 } })),
          ...(textCmd ? [{ type: 'text', text: textCmd }] : []),
        ]
      : textCmd;
    // Rótulo do turno na UI: o texto, ou "[imagem]" quando só há imagem —
    // nunca o array bruto (o mesmo marcador que o histórico usa, ver aiChat.js).
    const cmdLabel = textCmd || '[imagem]';
    runAssistant(cmd, {
```

(o resto do corpo de `runAssistant(cmd, {...})` não muda). No `.then((res) => {`, trocar a referência a `cmd` usada para o rótulo do turno — o objeto `{cmd, text: res.text, ...}` — por `cmd: cmdLabel`. Revogar as imagens e limpar o anexo no `.finally`:

```jsx
      .finally(() => {
        readyImages.forEach((im) => URL.revokeObjectURL(im.previewUrl));
        setImages([]);
        setBusy(false);
      });
  }, [text, images, busy, actions, currentUser, toast]);
```

Na secção do rodapé (`footer`), antes da `<textarea>`, acrescentar as miniaturas e os inputs de ficheiro:

```jsx
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {images.map((im, i) => (
            <div key={im.id} style={{ position: 'relative', width: 56, height: 56 }}>
              <img
                src={im.previewUrl}
                alt={'Imagem anexada ' + (i + 1)}
                style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                onClick={() => removeImage(im.id)}
                aria-label={'Remover imagem ' + (i + 1)}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--signal)', color: '#fff', fontSize: 12, lineHeight: '20px', padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        id="assistantImgFile"
        type="file"
        accept="image/*"
        aria-label="Anexar imagem"
        style={{ display: 'none' }}
        onChange={(e) => { addImage(e.target.files[0]); e.target.value = ''; }}
      />
      <input
        id="assistantImgCam"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Tirar foto"
        style={{ display: 'none' }}
        onChange={(e) => { addImage(e.target.files[0]); e.target.value = ''; }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => document.getElementById('assistantImgCam').click()}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12 }}
        >
          Câmara
        </button>
        <button
          type="button"
          onClick={() => document.getElementById('assistantImgFile').click()}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12 }}
        >
          Anexar imagem
        </button>
      </div>
```

Os dois botões visíveis **não** levam `aria-label` — o texto próprio ("Câmara", "Anexar imagem") já lhes dá nome acessível, o mesmo padrão dos botões "Câmara"/"PDF / Imagem / Excel" já existentes em `AIView.jsx:566-587`. Só os `<input type="file">` escondidos têm `aria-label`: é o par que os testes da Task 8 encontram via `getByLabelText`; o `<input aria-label="Tirar foto">` da câmara tinha o MESMO texto que o botão que a aciona — `getByLabelText('Tirar foto')` apanharia os dois e rebentava com "found multiple elements" (nenhum teste desta tarefa chama essa combinação, mas ficaria pronto a rebentar no primeiro teste que precisasse dela).

O botão "Enviar" fica `disabled={busy}` — sem exigir texto quando há imagem pronta (já coberto pela condição em `send`).

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/modals/assistant.test.jsx`
Expected: PASS.

- [ ] **Step 5: Suite completa e commit**

Run: `npm test`
Expected: tudo verde.

```bash
git add src/modals/AssistantSheet.jsx src/test/setup.js src/modals/assistant.test.jsx
git commit -m "feat(assistente): anexar imagem no chat, com miniaturas e limite de 3

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 9: Fecho da fatia D — build, layout, push

- [ ] **Step 1:** `npm run build` — sem avisos novos.
- [ ] **Step 2:**

```bash
(npx vite --port 5199 > /dev/null 2>&1 &) ; sleep 4 ; node scripts/layout-check.mjs ; pkill -f "vite --port 5199"
```
Expected: "nenhum" — as miniaturas não introduzem scroll horizontal a 320px.

- [ ] **Step 3:** `git push origin react`

---

## Fatia E — Anexo na caixa de chat do `AIView`

### Task 10: O mesmo em `AIView.jsx`

**Files:**
- Modify: `src/views/AIView.jsx` (`sendAI`, e a secção "Chat / text input", linhas ~180-222 e ~633-648)
- Test: `src/views/aiView.chat.test.jsx` (ficheiro já existente — acrescentar casos)

**Interfaces:**
- Consumes: as mesmas de Task 8 (`resizeImg`, `runAssistant`).
- Produces: nenhuma interface nova.

**Antes de começar:** repetir a verificação de coordenação — `git pull --ff-only origin react` e confirmar `git status` limpo em `src/views/AIView.jsx`.

**Aviso de ambiente:** o mesmo da Task 8 — `resizeImg` nunca resolve em jsdom sem mock. `aiView.chat.test.jsx` não mocka `../lib/ai.js` (só usa a real, porque `sendAI` nunca lhe tocava até agora); este anexo é o primeiro caminho deste ficheiro a precisar do stub.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar este mock a seguir ao `vi.mock('../lib/aiChat.js', ...)` já existente (antes do `import AIView, { actionLabel } from './AIView.jsx';`):

```jsx
// Mesmo motivo da Task 8 (AssistantSheet): Image.onload não dispara em
// jsdom. Mock parcial — o resto de lib/ai.js (AI_IMPORT_PROMPT, callAI,
// readFileB64, parseExcel, buildAIContext) fica real; só o painel de
// import (aiImportFile, testado noutro ficheiro) usa o resto.
vi.mock('../lib/ai.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resizeImg: vi.fn(() => Promise.resolve('ZmFrZQ==')) };
});
```

Acrescentar ao `describe('AIView — chat', ...)` existente:

```jsx
it('anexar uma imagem no chat mostra uma miniatura com botao de remover', async () => {
  await renderWithStore(<AIView />);
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Anexar imagem ao chat');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  expect(await screen.findByAltText('Imagem anexada 1')).toBeInTheDocument();
  expect(screen.getByLabelText('Remover imagem 1')).toBeInTheDocument();
});

it('remover a miniatura tira a imagem da proxima mensagem', async () => {
  await renderWithStore(<AIView />);
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Anexar imagem ao chat');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await screen.findByAltText('Imagem anexada 1');
  fireEvent.click(screen.getByLabelText('Remover imagem 1'));
  expect(screen.queryByAltText('Imagem anexada 1')).toBeNull();
});

it('no maximo 3 imagens por mensagem no chat — a 4a e recusada', async () => {
  await renderWithStore(<AIView />);
  const input = screen.getByLabelText('Anexar imagem ao chat');
  for (let n = 1; n <= 4; n++) {
    const f = new File(['x'], 'p' + n + '.jpg', { type: 'image/jpeg' });
    await act(async () => { fireEvent.change(input, { target: { files: [f] } }); });
  }
  expect(await screen.findByAltText('Imagem anexada 3')).toBeInTheDocument();
  expect(screen.queryByAltText('Imagem anexada 4')).toBeNull();
});

it('enviar com imagem e texto no chat compoe um cmd multimodal e limpa o anexo', async () => {
  runAssistant.mockResolvedValue({ text: 'Registei.', applied: [], pending: [], usage: {} });
  await renderWithStore(<AIView />);
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText('Anexar imagem ao chat');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await screen.findByAltText('Imagem anexada 1');
  fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'atualiza o saldo' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
  await waitFor(() => expect(runAssistant).toHaveBeenCalledTimes(1));
  const cmd = runAssistant.mock.calls[0][0];
  expect(cmd[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'ZmFrZQ==' } });
  expect(cmd[1]).toEqual({ type: 'text', text: 'atualiza o saldo' });
  await waitFor(() => expect(screen.queryByAltText('Imagem anexada 1')).toBeNull());
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/views/aiView.chat.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implementar em `AIView.jsx`**

`resizeImg` já está importado neste ficheiro (linhas 26-33, usado por `aiImportFile`) — não duplicar o import, só reutilizar o mesmo nome.

Novo estado, a seguir a `const [chat, setChat] = useState('');` (linha 174) — mesma forma da Task 8, adaptada aos nomes deste ficheiro:

```jsx
  // Imagens anexadas à PRÓXIMA mensagem do chat: {id, previewUrl, b64}.
  // Mesmo mecanismo da AssistantSheet (Task 8) — previewUrl só para a
  // miniatura, b64 é o que entra no bloco de conteúdo.
  const [images, setImages] = useState([]);
  const MAX_IMAGES = 3;

  const addImage = useCallback((file) => {
    if (!file) return;
    setImages((prev) => {
      if (prev.length >= MAX_IMAGES) {
        toast('Máximo de 3 imagens por mensagem', 'error');
        return prev;
      }
      const id = Date.now() + '_' + Math.random().toString(36).slice(2);
      const previewUrl = URL.createObjectURL(file);
      resizeImg(file, 1600).then((b64) => {
        setImages((cur) => cur.map((im) => (im.id === id ? { ...im, b64 } : im)));
      });
      return [...prev, { id, previewUrl, b64: null }];
    });
  }, [toast]);

  const removeImage = useCallback((id) => {
    setImages((prev) => {
      const found = prev.find((im) => im.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((im) => im.id !== id);
    });
  }, []);
```

Substituir `sendAI` inteiro (linhas 180-222) por:

```jsx
  const sendAI = useCallback(() => {
    const textCmd = chat.trim();
    const readyImages = images.filter((im) => im.b64);
    if ((!textCmd && !readyImages.length) || aiLoading) return;
    if (images.length && readyImages.length < images.length) return; // ainda a redimensionar
    setAiLoading(true);
    const st = actions.getState();
    const cmd = readyImages.length
      ? [
          ...readyImages.map((im) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.b64 } })),
          ...(textCmd ? [{ type: 'text', text: textCmd }] : []),
        ]
      : textCmd;
    // Rótulo do turno no histórico: o texto, ou "[imagem]" sem texto —
    // nunca o array bruto. hist[].cmd é sempre string em todo o resto do
    // ficheiro (renderizado direto em JSX).
    const cmdLabel = textCmd || '[imagem]';
    runAssistant(cmd, {
      state: st,
      actions,
      currentUser,
      systemPrompt: ASSISTANT_SYSTEM + '\n\nCONTEXTO:\n' + JSON.stringify(buildAIContext({ ...st, currentUser })),
      tier: st.aiTier,
    })
      .then((res) => {
        const applied = res.applied || [];
        const waiting = res.pending || [];
        actions.pushAiHistory({
          date: new Date().toLocaleString('pt-PT'),
          cmd: cmdLabel,
          ...(res.error ? { err: res.text } : { analysis: res.text, ok: true }),
          actions: applied.map((a) => ({ type: a.name, ...a.args })),
          pending: waiting.map((p) => ({ name: p.name, args: p.args, preview: p.preview })),
          mode: 'chat',
        });
        setChat('');
      })
      .catch((err) => {
        actions.pushAiHistory({
          date: new Date().toLocaleString('pt-PT'),
          cmd: cmdLabel,
          err: (err && err.message) || 'Falha no assistente.',
        });
      })
      .finally(() => {
        readyImages.forEach((im) => URL.revokeObjectURL(im.previewUrl));
        setImages([]);
        setAiLoading(false);
      });
  }, [chat, images, aiLoading, actions, currentUser, toast]);
```

Na secção "Chat / text input" (linha 607), antes da `<textarea id="aiInput">`, acrescentar as miniaturas e os inputs — mesma markup da Task 8, com ids e `aria-label` próprios (`aiChatImgFile`/`aiChatImgCam`, `"Anexar imagem ao chat"`/`"Tirar foto para o chat"` — **distintos** de `aiFile`/`aiCam` do painel de import, que continuam a servir só `aiImportFile`):

```jsx
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {images.map((im, i) => (
              <div key={im.id} style={{ position: 'relative', width: 56, height: 56 }}>
                <img
                  src={im.previewUrl}
                  alt={'Imagem anexada ' + (i + 1)}
                  style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(im.id)}
                  aria-label={'Remover imagem ' + (i + 1)}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--signal)', color: '#fff', fontSize: 12, lineHeight: '20px', padding: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          id="aiChatImgFile"
          type="file"
          accept="image/*"
          aria-label="Anexar imagem ao chat"
          style={{ display: 'none' }}
          onChange={(e) => { addImage(e.target.files[0]); e.target.value = ''; }}
        />
        <input
          id="aiChatImgCam"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Tirar foto para o chat"
          style={{ display: 'none' }}
          onChange={(e) => { addImage(e.target.files[0]); e.target.value = ''; }}
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => document.getElementById('aiChatImgCam').click()}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12 }}
          >
            Câmara
          </button>
          <button
            type="button"
            onClick={() => document.getElementById('aiChatImgFile').click()}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12 }}
          >
            Anexar imagem
          </button>
        </div>
```

Os dois botões visíveis **não** levam `aria-label` — mesmo raciocínio da Task 8: o texto próprio já lhes dá nome acessível, e um `aria-label` igual ao do `<input>` escondido faria `getByLabelText` apanhar os dois elementos e rebentar com "found multiple elements". Só os `<input type="file">` escondidos têm `aria-label` — são o par que os testes desta tarefa encontram.

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/views/aiView.chat.test.jsx`
Expected: PASS.

- [ ] **Step 5: Suite completa e commit**

Run: `npm test`
Expected: tudo verde.

```bash
git add src/views/AIView.jsx src/views/aiView.chat.test.jsx
git commit -m "feat(assistente): anexar imagem na caixa de chat do AIView

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 11: Fecho da fatia E — build, layout, push

- [ ] **Step 1:** `npm run build`
- [ ] **Step 2:** layout-check (mesmo comando da Task 9) — "nenhum".
- [ ] **Step 3:** `git push origin react`

---

## Fatia F — QA manual

### Task 12: `testes.html` — suite T48

**Files:**
- Modify: `testes.html`

Seguir o padrão das suites T45/T47 já existentes (procurar `T47` no ficheiro para o formato). Casos a cobrir, um por natureza de print da spec (§1):

1. Ecrã de saldo do banco → `update_balance`, conta de template.
2. Ecrã de saldo de um cartão personalizado → `update_balance`, conta custom (Task 3).
3. Talão de compra → `add_expense` (uma linha).
4. Notificação de pagamento (MB Way) → `add_expense`.
5. Lista de movimentos (extrato) → `add_expenses`, confirmação com a lista, total correto.
6. Anexar 4 imagens → a 4ª é recusada.
7. Remover uma miniatura antes de enviar.
8. Enviar imagem sem texto nenhum.
9. Histórico da conversa depois de uma mensagem com imagem: o marcador aparece, não a imagem.

- [ ] **Step 1: Escrever os 9 casos em `testes.html`**, no mesmo formato (passo a passo, resultado esperado) das secções T45/T47.
- [ ] **Step 2: Commit**

```bash
git add testes.html
git commit -m "docs(qa): suite T48 — assistente le prints (saldo, taláo, notificacao, extrato)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin react
```

---

## Verificação final (depois da Task 12)

- [ ] `npm test` — suite toda verde.
- [ ] `npm run build` — sem avisos novos.
- [ ] `layout-check.mjs` — "nenhum".
- [ ] Rever a spec (`docs/superpowers/specs/2026-09-03-assistente-le-imagens-design.md`) contra o que foi implementado, secção a secção — nenhuma decisão (D1-D12) por cobrir.
- [ ] `git push origin react`.
