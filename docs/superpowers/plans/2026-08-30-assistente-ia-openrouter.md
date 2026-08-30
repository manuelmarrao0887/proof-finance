# Assistente IA sobre OpenRouter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o assistente de IA da app de Anthropic para OpenRouter com tool-calling nativo, dando-lhe capacidade de criar, editar e apagar despesas, receitas, metas, recorrentes, orçamentos e despesas de grupo por linguagem natural, acessível num toque a partir do Resumo.

**Architecture:** `api/ai.js` passa a ser um proxy stateless para `openrouter.ai/api/v1/chat/completions` que mantém a autenticação Firebase e a allowlist de emails já existentes, e resolve o modelo a partir de um `tier` (`fast`/`strong`) — o cliente nunca escolhe um id de modelo. No cliente, `lib/aiTools.js` declara os schemas das tools e executa-as contra as actions do store, `lib/aiChat.js` corre o loop de tool-calling (máx. 4 voltas) e `lib/ai.js` trata do transporte e da tradução de ficheiros para o formato OpenAI. A UI ganha uma `AssistantSheet` aberta por um botão nas Quick Actions.

**Tech Stack:** React 18 + Vite, Vitest + Testing Library, Vercel Serverless Functions (ESM), Firebase Auth/Firestore, OpenRouter (API compatível com OpenAI).

**Spec:** `docs/superpowers/specs/2026-08-30-assistente-ia-openrouter-design.md`

## Global Constraints

- **Sem dependências novas.** Tudo com `fetch` nativo e o que já está no `package.json`.
- **Modelos resolvidos no servidor.** O cliente envia `tier: 'fast' | 'strong'`; nunca um id de modelo. `fast → google/gemini-3.5-flash-lite`, `strong → google/gemini-3.7-flash`.
- **A allowlist não é tocada.** `ALLOWED_EMAILS` continua obrigatória e o proxy fecha por omissão; `email_verified` continua a ser exigido.
- **Nenhum detalhe interno de erro sai para o cliente.** Erros do upstream vão para `console.error`; o cliente recebe uma mensagem PT-PT genérica.
- **Registos são endereçados por `id`**, nunca por índice — inclusive despesas (`actions.updateExpense(id, partial)`, `actions.deleteExpense(id)`).
- **Copy da UI em português de Portugal**, sem emoji (o projeto usa SVG inline via `components/Icon.jsx`).
- **Comentários de código em português**, a acompanhar o estilo dos ficheiros vizinhos.
- **Ações destrutivas** (`update_*`, `delete_*`) exigem `confirmed: true`; o bloqueio vive em `execTool`, não na UI.
- Comandos: `npm test` (suite toda), `npx vitest run <ficheiro>` (um ficheiro), `npm run build` (build de produção).
- A suite existente (518 testes) tem de ficar verde no fim de cada tarefa.

---

### Task 1: Proxy OpenRouter em `api/ai.js`

Substitui o proxy Anthropic por um proxy OpenRouter, mantendo auth e allowlist. Os helpers puros são exportados para poderem ser testados sem servidor.

**Files:**
- Modify: `api/ai.js` (ficheiro inteiro)
- Test: `api/ai.test.js` (criar)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `MODEL_TIERS`, `DEFAULT_TIER`, `MAX_TOKENS_CAP`, `MAX_TOOL_CALLS`, `MAX_BODY_CHARS`, `resolveModel(tier) -> string`, `capToolCalls(message, max?) -> message`, `sanitizeRequest(body) -> { model, messages, tools, max_tokens }` (lança `Error` com `.status` em input inválido). Contrato HTTP: `POST /api/ai { messages, tools?, tier?, max_tokens? }` → `{ choices: [{ message: { content, tool_calls } }], usage }`.

- [ ] **Step 1: Write the failing test**

Criar `api/ai.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  MODEL_TIERS,
  MAX_TOKENS_CAP,
  MAX_TOOL_CALLS,
  resolveModel,
  capToolCalls,
  sanitizeRequest,
} from './ai.js';

describe('resolveModel', () => {
  it('resolve os dois tiers conhecidos', () => {
    expect(resolveModel('fast')).toBe('google/gemini-3.5-flash-lite');
    expect(resolveModel('strong')).toBe('google/gemini-3.7-flash');
  });
  it('cai em fast para tier desconhecido, vazio ou ausente', () => {
    expect(resolveModel('gpt-5')).toBe(MODEL_TIERS.fast);
    expect(resolveModel('')).toBe(MODEL_TIERS.fast);
    expect(resolveModel(undefined)).toBe(MODEL_TIERS.fast);
  });
  it('nao aceita um id de modelo cru vindo do cliente', () => {
    expect(resolveModel('google/gemini-3.7-flash')).toBe(MODEL_TIERS.fast);
  });
});

describe('capToolCalls', () => {
  it('corta acima do limite', () => {
    const calls = Array.from({ length: 12 }, (_, i) => ({ id: 't' + i }));
    const out = capToolCalls({ role: 'assistant', tool_calls: calls });
    expect(out.tool_calls).toHaveLength(MAX_TOOL_CALLS);
    expect(out.tool_calls[0].id).toBe('t0');
  });
  it('deixa passar mensagens sem tool_calls', () => {
    const msg = { role: 'assistant', content: 'ola' };
    expect(capToolCalls(msg)).toBe(msg);
  });
});

describe('sanitizeRequest', () => {
  const base = { messages: [{ role: 'user', content: 'ola' }] };

  it('devolve o modelo do tier e as mensagens', () => {
    const out = sanitizeRequest({ ...base, tier: 'strong' });
    expect(out.model).toBe(MODEL_TIERS.strong);
    expect(out.messages).toEqual(base.messages);
  });
  it('limita max_tokens ao teto', () => {
    expect(sanitizeRequest({ ...base, max_tokens: 99999 }).max_tokens).toBe(MAX_TOKENS_CAP);
  });
  it('impoe um minimo de 256 tokens', () => {
    expect(sanitizeRequest({ ...base, max_tokens: 10 }).max_tokens).toBe(256);
  });
  it('rejeita mensagens em falta com status 400', () => {
    expect(() => sanitizeRequest({})).toThrow(/messages/);
    try {
      sanitizeRequest({ messages: [] });
    } catch (e) {
      expect(e.status).toBe(400);
    }
  });
  it('rejeita roles desconhecidos', () => {
    expect(() => sanitizeRequest({ messages: [{ role: 'root', content: 'x' }] })).toThrow();
  });
  it('rejeita corpos gigantes com status 413', () => {
    const huge = { messages: [{ role: 'user', content: 'x'.repeat(3_000_001) }] };
    try {
      sanitizeRequest(huge);
      throw new Error('devia ter rejeitado');
    } catch (e) {
      expect(e.status).toBe(413);
    }
  });
  it('so deixa passar tools quando sao um array', () => {
    expect(sanitizeRequest({ ...base, tools: 'nope' }).tools).toBeUndefined();
    expect(sanitizeRequest({ ...base, tools: [{ type: 'function' }] }).tools).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/ai.test.js`
Expected: FAIL — `resolveModel`, `capToolCalls` e `sanitizeRequest` não existem em `api/ai.js`.

- [ ] **Step 3: Write the implementation**

Substituir `api/ai.js` inteiro por:

```js
// Vercel Serverless Function — proxy autenticado para a API do OpenRouter
// (compatível com OpenAI: /v1/chat/completions).
//
// A key vive SÓ aqui (env OPENROUTER_API_KEY), nunca no browser. Cada pedido
// tem de trazer um ID-token Firebase válido (Authorization: Bearer <token>),
// verificado com firebase-admin (env FIREBASE_SERVICE_ACCOUNT).
//
// SEGURANÇA:
//   - O sign-up Google está aberto, portanto "qualquer token válido" não chega:
//     só os emails em ALLOWED_EMAILS podem usar a key. Sem essa env o proxy
//     recusa tudo (fechado por omissão).
//   - O cliente NÃO escolhe o modelo: envia um `tier` e o servidor resolve.
//   - Tetos em max_tokens, tamanho do corpo e número de tool_calls por resposta.
//   - Mensagens de erro internas nunca saem para o cliente (só para o log).

export const MODEL_TIERS = {
  fast: 'google/gemini-3.5-flash-lite',
  strong: 'google/gemini-3.7-flash',
};
export const DEFAULT_TIER = 'fast';
export const MAX_TOKENS_CAP = 8000;
export const MIN_TOKENS = 256;
export const MAX_TOOL_CALLS = 8;
export const MAX_BODY_CHARS = 3_000_000; // ~2,2 MB base64 → chega para um extrato

const ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const REFERER = 'https://proof-finance.vercel.app';
const TITLE = 'PROOF. Finance';

function bad(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// O cliente manda um tier, não um id de modelo. Qualquer coisa fora da tabela
// cai no tier barato — nunca num modelo caro por engano.
export function resolveModel(tier) {
  return MODEL_TIERS[tier] || MODEL_TIERS[DEFAULT_TIER];
}

// Um modelo em ciclo pode pedir dezenas de tools numa só resposta; cortamos
// antes de o cliente as executar.
export function capToolCalls(message, max = MAX_TOOL_CALLS) {
  if (!message || !Array.isArray(message.tool_calls)) return message;
  if (message.tool_calls.length <= max) return message;
  return { ...message, tool_calls: message.tool_calls.slice(0, max) };
}

export function sanitizeRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const messages = b.messages;
  if (!Array.isArray(messages) || messages.length === 0) throw bad(400, 'Sem messages');
  messages.forEach((m) => {
    if (!m || !ROLES.has(m.role)) throw bad(400, 'Role invalido');
  });
  if (JSON.stringify(messages).length > MAX_BODY_CHARS) throw bad(413, 'Pedido demasiado grande');
  const parsed = parseInt(b.max_tokens, 10);
  const max_tokens = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 4000, MIN_TOKENS), MAX_TOKENS_CAP);
  return {
    model: resolveModel(b.tier),
    messages,
    tools: Array.isArray(b.tools) && b.tools.length ? b.tools : undefined,
    max_tokens,
  };
}

let _auth = null;
async function getFirebaseAuth() {
  if (_auth) return _auth;
  // Import dinâmico: se firebase-admin falhar a carregar, devolvemos erro JSON
  // em vez de a função inteira rebentar no load.
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT nao configurada');
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const svc = JSON.parse(json);
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  _auth = getAuth();
  return _auth;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function allowedEmails() {
  return new Set(
    (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function cleanKey(v) {
  let k = (v || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1) Autenticação + autorização (allowlist).
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sem token de sessao' });
    let decoded;
    try {
      const auth = await getFirebaseAuth();
      decoded = await auth.verifyIdToken(token);
    } catch (e) {
      console.error('[api/ai] auth', e && e.message);
      return res.status(401).json({ error: 'Sessao invalida' });
    }
    const allow = allowedEmails();
    if (!allow.size) {
      console.error('[api/ai] ALLOWED_EMAILS nao configurada — proxy fechado');
      return res.status(503).json({ error: 'Assistente nao configurado (ALLOWED_EMAILS)' });
    }
    const email = String(decoded.email || '').toLowerCase();
    if (!decoded.email_verified || !allow.has(email)) {
      return res.status(403).json({ error: 'Sem acesso ao assistente' });
    }

    // 2) Key do OpenRouter.
    const apiKey = cleanKey(process.env.OPENROUTER_API_KEY);
    if (!apiKey) return res.status(503).json({ error: 'Assistente nao configurado (OPENROUTER_API_KEY)' });

    // 3) Pedido saneado.
    let payload;
    try {
      payload = sanitizeRequest(readBody(req));
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    // 4) Proxy.
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
        'HTTP-Referer': REFERER,
        'X-Title': TITLE,
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[api/ai] upstream', r.status, JSON.stringify(data).slice(0, 300));
      return res.status(r.status).json({ error: 'upstream', status: r.status });
    }
    const choices = Array.isArray(data.choices)
      ? data.choices.map((c) => ({ ...c, message: capToolCalls(c.message) }))
      : [];
    return res.status(200).json({ choices, usage: data.usage || null, model: data.model || payload.model });
  } catch (e) {
    console.error('[api/ai]', e && e.message);
    return res.status(500).json({ error: 'Falha no assistente' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/ai.test.js`
Expected: PASS (todos os `describe` verdes).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: a suite existente continua verde. `src/lib/ai.js` ainda envia o formato antigo — isso é a Task 2; nenhum teste atual bate no proxy, por isso não deve haver falhas aqui. Se houver, parar e resolver antes de commitar.

- [ ] **Step 6: Commit**

```bash
git add api/ai.js api/ai.test.js
git commit -m "feat(ia): proxy /api/ai passa a falar com o OpenRouter

Tiers fast/strong resolvidos no servidor, teto de tool_calls por resposta e
validacao das mensagens antes de sair. Auth Firebase e allowlist inalteradas."
```

---

### Task 2: `chat()` e tradução de conteúdo em `src/lib/ai.js`

Dá ao cliente uma função de transporte no formato OpenAI e mantém `callAI`/`callAIRaw` a funcionar com a assinatura de hoje, para `ImportStatementSheet` e `BalanceUpdateSheet` não mudarem.

**Files:**
- Modify: `src/lib/ai.js`
- Test: `src/lib/ai.test.js` (criar)

**Interfaces:**
- Consumes: contrato HTTP da Task 1.
- Produces:
  - `toOpenAIContent(parts) -> Array` — traduz blocos estilo Anthropic (`{type:'text'|'image'|'document'}`) para o formato OpenAI (`text`/`image_url`/`file`).
  - `chat(messages, { tools, tier, maxTokens }) -> Promise<{ choices, usage, model }>`
  - `callAIRaw(content, system, model, maxTokens) -> Promise<{ content: [{type:'text', text}], usage }>` — forma compatível com o que os chamadores já esperam.
  - `callAI(content, system, apiKey, onResult)` — inalterado do ponto de vista de quem chama.
  - `TIER_FOR_MODEL(model) -> 'fast'|'strong'`

- [ ] **Step 1: Write the failing test**

Criar `src/lib/ai.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../firebase/client.js', () => ({
  getIdToken: () => Promise.resolve('tok-123'),
}));

import { toOpenAIContent, chat, callAIRaw, TIER_FOR_MODEL } from './ai.js';

function mockFetchOnce(payload, ok = true, status = 200) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    })
  );
}

beforeEach(() => {
  global.fetch = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('toOpenAIContent', () => {
  it('passa texto por uma string simples quando e o unico bloco', () => {
    expect(toOpenAIContent('ola')).toBe('ola');
  });
  it('traduz um bloco de texto', () => {
    expect(toOpenAIContent([{ type: 'text', text: 'ola' }])).toEqual([{ type: 'text', text: 'ola' }]);
  });
  it('traduz uma imagem base64 para image_url com data URI', () => {
    const out = toOpenAIContent([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } },
    ]);
    expect(out[0].type).toBe('image_url');
    expect(out[0].image_url.url).toBe('data:image/jpeg;base64,AAA');
  });
  it('traduz um PDF para o bloco file', () => {
    const out = toOpenAIContent([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' } },
    ]);
    expect(out[0].type).toBe('file');
    expect(out[0].file.file_data).toBe('data:application/pdf;base64,BBB');
    expect(out[0].file.filename).toBe('documento.pdf');
  });
});

describe('TIER_FOR_MODEL', () => {
  it('manda modelos de documento para strong', () => {
    expect(TIER_FOR_MODEL('claude-sonnet-5')).toBe('strong');
    expect(TIER_FOR_MODEL('claude-opus-5')).toBe('strong');
  });
  it('manda o resto para fast', () => {
    expect(TIER_FOR_MODEL('claude-haiku-4-5')).toBe('fast');
    expect(TIER_FOR_MODEL(undefined)).toBe('fast');
  });
});

describe('chat', () => {
  it('envia messages, tools e tier com o ID-token', async () => {
    mockFetchOnce({ choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 5 } });
    const msgs = [{ role: 'user', content: 'ola' }];
    const out = await chat(msgs, { tools: [{ type: 'function' }], tier: 'strong', maxTokens: 1000 });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/ai');
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
    const body = JSON.parse(opts.body);
    expect(body.messages).toEqual(msgs);
    expect(body.tier).toBe('strong');
    expect(body.tools).toHaveLength(1);
    expect(body.max_tokens).toBe(1000);
    expect(out.usage.total_tokens).toBe(5);
  });

  it('traduz erros conhecidos do upstream para PT', async () => {
    mockFetchOnce({ error: 'upstream', status: 402 }, false, 402);
    await expect(chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/creditos/i);
  });

  it('traduz 429 para uma mensagem de excesso de pedidos', async () => {
    mockFetchOnce({ error: 'upstream', status: 429 }, false, 429);
    await expect(chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/pedidos/i);
  });
});

describe('callAIRaw (compatibilidade)', () => {
  it('devolve a forma antiga com content[] de blocos de texto', async () => {
    mockFetchOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { total_tokens: 9 },
    });
    const d = await callAIRaw('analisa isto', 'sys', 'claude-haiku-4-5', 2000);
    expect(d.content).toEqual([{ type: 'text', text: '{"ok":true}' }]);
    expect(d.usage.total_tokens).toBe(9);
  });

  it('poe o system prompt como primeira mensagem', async () => {
    mockFetchOnce({ choices: [{ message: { content: 'x' } }] });
    await callAIRaw('cmd', 'as instrucoes', 'claude-haiku-4-5', 500);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'as instrucoes' });
    expect(body.messages[1].role).toBe('user');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai.test.js`
Expected: FAIL — `toOpenAIContent`, `chat` e `TIER_FOR_MODEL` não existem.

- [ ] **Step 3: Write the implementation**

Em `src/lib/ai.js`, manter as constantes de prompt (`STMT_PROMPT`, `RCPT_PROMPT`, `AI_IMPORT_PROMPT`, `JSON_SYSTEM`) e os helpers de ficheiro (`resizeImg`, `readFileB64`, `parseExcel`, `readExcelRows`) exatamente como estão. Substituir o bloco de transporte (`callAIRaw` e `callAI`) por:

```js
/* ── Transporte (OpenRouter, formato OpenAI) ───────────────────────────────
   O proxy /api/ai resolve o modelo a partir do tier; o cliente nunca envia um
   id de modelo. A tradução de conteúdo vive aqui para que os chamadores
   antigos (import de extrato, atualizar saldo) continuem a montar blocos no
   formato Anthropic sem saberem que o provider mudou. */

const DOC_MODELS = new Set(['claude-sonnet-5', 'claude-opus-5', 'strong']);

export function TIER_FOR_MODEL(model) {
  return DOC_MODELS.has(model) ? 'strong' : 'fast';
}

function dataUri(source) {
  const mt = (source && source.media_type) || 'application/octet-stream';
  const data = (source && source.data) || '';
  return 'data:' + mt + ';base64,' + data;
}

export function toOpenAIContent(parts) {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return String(parts == null ? '' : parts);
  return parts.map(function (p) {
    if (!p || typeof p !== 'object') return { type: 'text', text: String(p == null ? '' : p) };
    if (p.type === 'image') return { type: 'image_url', image_url: { url: dataUri(p.source) } };
    if (p.type === 'document')
      return { type: 'file', file: { filename: p.filename || 'documento.pdf', file_data: dataUri(p.source) } };
    return { type: 'text', text: p.text || '' };
  });
}

const ERRORS = {
  401: 'Precisas de iniciar sessao para usar a IA.',
  403: 'Sem acesso ao assistente.',
  402: 'Sem creditos no OpenRouter.',
  413: 'Documento demasiado grande para a IA.',
  429: 'Demasiados pedidos. Tenta daqui a pouco.',
  503: 'Modelo indisponivel de momento.',
};

export function chat(messages, opts) {
  const o = opts || {};
  return getIdToken().then(function (token) {
    if (!token) throw new Error('Precisas de iniciar sessao para usar a IA.');
    return fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        messages: messages,
        tools: o.tools && o.tools.length ? o.tools : undefined,
        tier: o.tier || 'fast',
        max_tokens: o.maxTokens || 4000,
      }),
    })
      .then(function (r) {
        if (r.ok) return r.json();
        // O corpo do upstream nunca é mostrado ao utilizador; só o código.
        return r.json().then(
          function (b) {
            throw new Error(ERRORS[b && b.status] || ERRORS[r.status] || 'Falha no assistente.');
          },
          function () {
            throw new Error(ERRORS[r.status] || 'Falha no assistente.');
          }
        );
      })
      .catch(function (err) {
        const msg = err && err.message ? err.message : 'Erro desconhecido';
        if (msg === 'Failed to fetch' || msg.indexOf('NetworkError') > -1)
          throw new Error('Erro de rede ao contactar a IA. Tenta novamente.');
        throw err;
      });
  });
}

function firstText(res) {
  const c = res && res.choices && res.choices[0];
  const m = c && c.message;
  if (!m) return '';
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.content))
    return m.content.map(function (b) { return b && b.text ? b.text : ''; }).join('');
  return '';
}

/* callAIRaw — mantém a assinatura e a FORMA de resposta antigas
   ({content:[{type:'text',text}]}) para os chamadores existentes não mudarem.
   Por dentro já é OpenRouter. */
export function callAIRaw(content, system, model, maxTokens) {
  const messages = [
    { role: 'system', content: system || JSON_SYSTEM },
    { role: 'user', content: toOpenAIContent(content) },
  ];
  return chat(messages, { tier: TIER_FOR_MODEL(model), maxTokens: maxTokens || 4000 }).then(function (res) {
    return { content: [{ type: 'text', text: firstText(res) }], usage: res.usage || null };
  });
}
```

E `callAI` passa a ser um wrapper de `callAIRaw`, mantendo o parsing de JSON truncado que já existe:

```js
export function callAI(content, system, _apiKey, onResult) {
  const cb = typeof onResult === 'function' ? onResult : function () {};
  callAIRaw(content, system, 'strong', 16000)
    .then(function (d) {
      const txt = (d.content || []).map(function (i) { return i.text; }).join('');
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Sem JSON.');
      try {
        cb(JSON.parse(m[0]));
      } catch (pe) {
        // Tentar reparar JSON truncado (comportamento original).
        let fix = m[0];
        const li = fix.lastIndexOf('},');
        if (li > -1) fix = fix.substring(0, li + 1);
        let ob = 0, oa = 0;
        for (let ci = 0; ci < fix.length; ci++) {
          if (fix[ci] === '{') ob++;
          if (fix[ci] === '}') ob--;
          if (fix[ci] === '[') oa++;
          if (fix[ci] === ']') oa--;
        }
        while (oa > 0) { fix += ']'; oa--; }
        while (ob > 0) { fix += '}'; ob--; }
        try {
          cb(JSON.parse(fix));
        } catch (pe2) {
          throw pe;
        }
      }
    })
    .catch(function (err) {
      cb({ error: (err && err.message) || 'Erro desconhecido' });
    });
}
```

`callAI` usa `'strong'` porque os seus chamadores são sempre documentos (extrato, recibo, print de saldo).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai.test.js`
Expected: PASS.

- [ ] **Step 5: Verify existing consumers still pass**

Run: `npx vitest run src/modals src/views`
Expected: PASS — `ImportStatementSheet` e `BalanceUpdateSheet` não foram tocados e continuam a receber a mesma forma de resposta.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai.js src/lib/ai.test.js
git commit -m "feat(ia): transporte do cliente passa a OpenRouter

chat() fala o formato OpenAI e toOpenAIContent traduz PDFs e imagens.
callAI/callAIRaw mantem a assinatura e a forma de resposta, por isso o
import de extrato e a atualizacao de saldo nao mudam."
```

---

### Task 3: Tools de leitura em `src/lib/aiTools.js`

Primeira metade do registry: schemas e execução das tools que só leem.

**Files:**
- Create: `src/lib/aiTools.js`
- Test: `src/lib/aiTools.test.js` (criar)

**Interfaces:**
- Consumes: `compute`, `getGroupsData` de `lib/finance.js`; `monthEffectiveLimits` de `lib/budget.js`; `computeBalances`, `simplifyDebts` de `lib/split.js`.
- Produces:
  - `TOOLS` — objeto `{ [name]: { schema, destructive?, run(args, ctx), preview?(args, ctx) } }`
  - `TOOL_SCHEMAS` — array pronto a enviar ao modelo (`[{ type:'function', function:{ name, description, parameters } }]`)
  - `execTool(name, args, ctx) -> { ok, data } | { error, detail? } | { pending, preview, call }`
  - `ctx` é `{ state, actions }`.

- [ ] **Step 1: Write the failing test**

Criar `src/lib/aiTools.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TOOLS, TOOL_SCHEMAS, execTool } from './aiTools.js';

function ctx(overrides = {}) {
  const state = {
    currentUser: { uid: 'u1' },
    addedExp: [
      { id: 'e1', desc: 'Pingo Doce', amount: 45.2, cat: 'sup', date: '2026-08-03' },
      { id: 'e2', desc: 'Cafe do Ponto', amount: 3.5, cat: 'rest', date: '2026-08-05' },
      { id: 'e3', desc: 'Uber Eats', amount: 24.9, cat: 'rest', date: '2026-07-08' },
    ],
    bdg: [{ id: 'sup', nm: 'Supermercado', lm: 300 }, { id: 'rest', nm: 'Restaurantes', lm: 120 }],
    goals: [{ id: 'g1', name: 'Fundo', target: 10000, current: 2500, deadline: '2027-01-01' }],
    incomes: [{ id: 'i1', name: 'Salario', amount: 1800, source: 'salary', recurring: true, day: 25 }],
    recurring: [{ id: 'r1', name: 'Netflix', amount: 10.99, cat: 'sub', day: 1 }],
    people: [{ id: 'p1', name: 'Ana' }],
    groups: [{ id: 'gr1', name: 'Algarve', memberIds: ['me', 'p1'] }],
    groupEntries: [],
    customAccts: [],
    dynAccts: null,
    dynSnaps: [],
    rules: [],
    ...overrides,
  };
  return { state, actions: { getState: () => state } };
}

describe('TOOL_SCHEMAS', () => {
  it('tem uma entrada por tool, no formato de function-calling', () => {
    expect(TOOL_SCHEMAS).toHaveLength(Object.keys(TOOLS).length);
    TOOL_SCHEMAS.forEach((s) => {
      expect(s.type).toBe('function');
      expect(typeof s.function.name).toBe('string');
      expect(typeof s.function.description).toBe('string');
      expect(s.function.parameters.type).toBe('object');
    });
  });
  it('nao tem nomes duplicados', () => {
    const names = TOOL_SCHEMAS.map((s) => s.function.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('execTool — guardas gerais', () => {
  it('rejeita uma tool desconhecida', () => {
    expect(execTool('rm_rf', {}, ctx())).toEqual({ error: 'unknown_tool' });
  });
  it('rejeita argumentos em falta', () => {
    const r = execTool('get_group', {}, ctx());
    expect(r.error).toBe('invalid_args');
  });
});

describe('query_expenses', () => {
  it('devolve id, data, descricao, valor e categoria', () => {
    const r = execTool('query_expenses', {}, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.total).toBe(3);
    expect(Object.keys(r.data.rows[0]).sort()).toEqual(['amount', 'cat', 'date', 'desc', 'id']);
  });
  it('ordena da mais recente para a mais antiga', () => {
    const r = execTool('query_expenses', {}, ctx());
    expect(r.data.rows.map((x) => x.id)).toEqual(['e2', 'e1', 'e3']);
  });
  it('filtra por intervalo de datas', () => {
    const r = execTool('query_expenses', { from: '2026-08-01', to: '2026-08-31' }, ctx());
    expect(r.data.rows.map((x) => x.id)).toEqual(['e2', 'e1']);
  });
  it('filtra por categoria', () => {
    const r = execTool('query_expenses', { cat: 'rest' }, ctx());
    expect(r.data.total).toBe(2);
  });
  it('filtra por texto, sem distinguir maiusculas', () => {
    const r = execTool('query_expenses', { text: 'pingo' }, ctx());
    expect(r.data.rows[0].id).toBe('e1');
  });
  it('filtra por valor minimo e maximo', () => {
    const r = execTool('query_expenses', { min: 10, max: 30 }, ctx());
    expect(r.data.rows.map((x) => x.id)).toEqual(['e3']);
  });
  it('limita as linhas devolvidas mas conta o total', () => {
    const r = execTool('query_expenses', { limit: 1 }, ctx());
    expect(r.data.rows).toHaveLength(1);
    expect(r.data.total).toBe(3);
  });
});

describe('outras tools de leitura', () => {
  it('get_budget devolve limite e gasto por categoria', () => {
    const r = execTool('get_budget', { month: '2026-08' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.month).toBe('2026-08');
    expect(r.data.categories.find((c) => c.id === 'sup').spent).toBe(45.2);
  });
  it('list_goals devolve os ids', () => {
    const r = execTool('list_goals', {}, ctx());
    expect(r.data[0].id).toBe('g1');
  });
  it('list_categories devolve id, nome e limite', () => {
    const r = execTool('list_categories', {}, ctx());
    expect(r.data).toContainEqual({ id: 'sup', nm: 'Supermercado', lm: 300 });
  });
  it('list_groups devolve nome e numero de membros', () => {
    const r = execTool('list_groups', {}, ctx());
    expect(r.data[0]).toMatchObject({ id: 'gr1', name: 'Algarve', members: 2 });
  });
  it('get_group devolve not_found para um id que nao existe', () => {
    expect(execTool('get_group', { group_id: 'nope' }, ctx())).toEqual({ error: 'not_found' });
  });
  it('get_group devolve membros e saldos', () => {
    const r = execTool('get_group', { group_id: 'gr1' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.members.map((m) => m.id)).toContain('p1');
    expect(Array.isArray(r.data.settlements)).toBe(true);
  });
  it('get_overview devolve patrimonio e total de ativos', () => {
    const r = execTool('get_overview', {}, ctx());
    expect(typeof r.data.netWorth).toBe('number');
    expect(typeof r.data.totalAssets).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: FAIL — `src/lib/aiTools.js` não existe.

- [ ] **Step 3: Write the implementation**

Criar `src/lib/aiTools.js` com a infraestrutura e as tools de leitura:

```js
/* ════════════════════════════════════════════════════════════════════════
   aiTools — registry de tools que o assistente pode chamar.

   Módulo PURO: sem React, sem Firebase. Recebe sempre `ctx = {state, actions}`
   e devolve dados serializáveis. Duas metades:
     - TOOLS / TOOL_SCHEMAS: o que o modelo vê.
     - execTool: o que corre de facto, contra as actions do store.

   Regras:
     - Tudo é endereçado por `id` (nunca por índice).
     - Um id inexistente devolve {error:'not_found'} ao MODELO, sem escrever.
     - update_* e delete_* são destrutivas: primeira chamada devolve
       {pending, preview}; só escrevem com args.confirmed === true.
   ════════════════════════════════════════════════════════════════════════ */

import { compute, getGroupsData } from './finance.js';
import { monthEffectiveLimits } from './budget.js';
import { computeBalances, simplifyDebts } from './split.js';

const CATS = 'rest,sup,cas,emp,seg,ani,sau,tel,car,sub,gym,cmb,neg,laz,trf,out';

/* ── validação mínima de argumentos ──────────────────────────────────────
   Chega para apanhar campos obrigatórios em falta e tipos trocados; o resto
   é responsabilidade das actions do store. */
function validate(schema, args) {
  const req = schema.required || [];
  for (const k of req) {
    if (args[k] === undefined || args[k] === null || args[k] === '') return 'campo obrigatorio em falta: ' + k;
  }
  const props = schema.properties || {};
  for (const k of Object.keys(args)) {
    const p = props[k];
    if (!p) continue;
    if (p.type === 'number' && args[k] !== undefined && !Number.isFinite(Number(args[k])))
      return k + ' tem de ser um numero';
    if (p.type === 'string' && args[k] !== undefined && typeof args[k] !== 'string')
      return k + ' tem de ser texto';
  }
  return null;
}

const ok = (data) => ({ ok: true, data });
const notFound = () => ({ error: 'not_found' });

function currentYm() {
  return new Date().toISOString().slice(0, 10).slice(0, 7);
}

/* ── Tools de leitura ────────────────────────────────────────────────── */

const readTools = {
  query_expenses: {
    schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'data inicial YYYY-MM-DD (inclusive)' },
        to: { type: 'string', description: 'data final YYYY-MM-DD (inclusive)' },
        cat: { type: 'string', description: 'categoria: ' + CATS },
        text: { type: 'string', description: 'procura na descricao, sem distinguir maiusculas' },
        min: { type: 'number', description: 'valor minimo' },
        max: { type: 'number', description: 'valor maximo' },
        limit: { type: 'number', description: 'maximo de linhas a devolver (1-200, por omissao 50)' },
      },
      required: [],
    },
    description:
      'Procura despesas do utilizador. Devolve o id de cada despesa — usa esse id em update_expense e delete_expense.',
    run(args, { state }) {
      const list = state.addedExp || [];
      const from = args.from || '0000-00-00';
      const to = args.to || '9999-99-99';
      const text = args.text ? String(args.text).toLowerCase() : null;
      const rows = list.filter((x) => {
        const d = x.date || '';
        if (d < from || d > to) return false;
        if (args.cat && x.cat !== args.cat) return false;
        if (text && String(x.desc || '').toLowerCase().indexOf(text) === -1) return false;
        const a = Math.abs(Number(x.amount) || 0);
        if (args.min != null && a < Number(args.min)) return false;
        if (args.max != null && a > Number(args.max)) return false;
        return true;
      });
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 50, 1), 200);
      return ok({
        total: rows.length,
        rows: rows.slice(0, limit).map((e) => ({
          id: e.id,
          date: e.date,
          desc: e.desc,
          amount: e.amount,
          cat: e.cat,
        })),
      });
    },
  },

  get_overview: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Resumo patrimonial: saldos por conta, total de ativos, divida e patrimonio liquido.',
    run(_args, { state }) {
      const c = compute(state);
      return ok({
        totalAssets: c.tA,
        netWorth: c.nW,
        grossAssets: c.gross,
        cardDebt: c.cardDebt,
        loanOutstanding: c.loan ? c.loan.out : 0,
        byCategory: c.cT,
        accounts: (c.accts || []).map((a) => ({ name: a.n, category: a.c, value: a.v })),
      });
    },
  },

  get_budget: {
    schema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'mes YYYY-MM; por omissao o mes corrente' } },
      required: [],
    },
    description: 'Orcamento vs gasto real por categoria num mes.',
    run(args, { state }) {
      const month = args.month || currentYm();
      const m = monthEffectiveLimits(state.addedExp || [], state.bdg || [], month, !!state.rolloverOn);
      const categories = (state.bdg || []).map((b) => ({
        id: b.id,
        nm: b.nm,
        limit: b.lm,
        effective: m[b.id] ? m[b.id].eff : b.lm,
        spent: m[b.id] ? m[b.id].spent : 0,
      }));
      return ok({ month, categories });
    },
  },

  list_categories: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Categorias de despesa do utilizador, com o limite mensal de cada uma.',
    run(_args, { state }) {
      return ok((state.bdg || []).map((b) => ({ id: b.id, nm: b.nm, lm: b.lm })));
    },
  },

  list_goals: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Metas de poupanca com id, valor alvo, valor atual e prazo.',
    run(_args, { state }) {
      return ok((state.goals || []).map((g) => ({
        id: g.id, name: g.name, target: g.target, current: g.current, deadline: g.deadline,
      })));
    },
  },

  list_recurring: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Despesas recorrentes / subscricoes com id, valor, categoria e dia do mes.',
    run(_args, { state }) {
      return ok((state.recurring || []).map((r) => ({
        id: r.id, name: r.name, amount: r.amount, cat: r.cat, day: r.day,
      })));
    },
  },

  list_incomes: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Receitas com id, valor, origem e se sao recorrentes.',
    run(_args, { state }) {
      return ok((state.incomes || []).map((i) => ({
        id: i.id, name: i.name, amount: i.amount, source: i.source, recurring: i.recurring, day: i.day, date: i.date,
      })));
    },
  },

  list_people: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Pessoas registadas para despesas partilhadas.',
    run(_args, { state }) {
      const g = getGroupsData(state, false);
      return ok((g.people || []).map((p) => ({ id: p.id, name: p.name })));
    },
  },

  list_groups: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Grupos de despesas partilhadas, com numero de membros.',
    run(_args, { state }) {
      const g = getGroupsData(state, false);
      return ok((g.groups || []).map((x) => ({
        id: x.id, name: x.name, members: (x.memberIds || []).length, archived: !!x.archived,
      })));
    },
  },

  get_group: {
    schema: {
      type: 'object',
      properties: { group_id: { type: 'string', description: 'id do grupo (ver list_groups)' } },
      required: ['group_id'],
    },
    description: 'Detalhe de um grupo: membros, saldo de cada um e transferencias sugeridas para acertar.',
    run(args, { state }) {
      const data = getGroupsData(state, false);
      const group = (data.groups || []).find((g) => g.id === args.group_id);
      if (!group) return notFound();
      const entries = (data.groupEntries || []).filter((e) => e.groupId === group.id);
      const memberIds = group.memberIds || [];
      const balances = computeBalances(entries, memberIds);
      const nameOf = (id) =>
        id === 'me' ? 'Eu' : ((data.people || []).find((p) => p.id === id) || {}).name || id;
      return ok({
        id: group.id,
        name: group.name,
        members: memberIds.map((id) => ({ id, name: nameOf(id), balance: balances[id] || 0 })),
        entries: entries.map((e) => ({
          id: e.id, desc: e.desc, amount: e.amount, date: e.date, payerId: e.payerId, kind: e.kind,
        })),
        settlements: simplifyDebts(balances).map((s) => ({
          from: nameOf(s.from), to: nameOf(s.to), amount: s.amount,
        })),
      });
    },
  },
};

/* ── Registry + execução ─────────────────────────────────────────────── */

export const TOOLS = { ...readTools };

export const TOOL_SCHEMAS = Object.keys(TOOLS).map((name) => ({
  type: 'function',
  function: {
    name,
    description: TOOLS[name].description,
    parameters: TOOLS[name].schema,
  },
}));

export function execTool(name, args, ctx) {
  const t = TOOLS[name];
  if (!t) return { error: 'unknown_tool' };
  const a = args && typeof args === 'object' ? args : {};
  const bad = validate(t.schema, a);
  if (bad) return { error: 'invalid_args', detail: bad };
  try {
    return t.run(a, ctx);
  } catch (e) {
    return { error: 'tool_failed', detail: (e && e.message) || 'erro' };
  }
}
```

> Nota para quem implementa: confirmar os nomes dos campos devolvidos por `simplifyDebts` (`from`/`to`/`amount`) e por `computeBalances` lendo `src/lib/split.js` antes de correr os testes; se diferirem, ajustar o mapeamento acima e o teste em conformidade — a forma que interessa é a que o `split.js` já produz.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiTools.js src/lib/aiTools.test.js
git commit -m "feat(ia): tools de leitura do assistente

query_expenses, get_overview, get_budget, listas e get_group, com validacao
de argumentos e registry pronto para function-calling."
```

---

### Task 4: Tools de escrita não destrutivas

Criar despesas, receitas, metas, recorrentes, categorias, regras, saldos e snapshots.

**Files:**
- Modify: `src/lib/aiTools.js`
- Test: `src/lib/aiTools.test.js`

**Interfaces:**
- Consumes: `TOOLS`, `execTool`, `validate` da Task 3; `uid`, `todayISO`, `normalizeStmtDate` de `lib/format.js`.
- Produces: tools `add_expense`, `add_income`, `add_goal`, `add_recurring`, `add_category`, `add_rule`, `set_budget`, `update_balance`, `add_snapshot`. Cada uma devolve `{ ok: true, data: { id } }` (ou `{ ok: true, data: {...} }` quando não gera id).

- [ ] **Step 1: Write the failing test**

Acrescentar a `src/lib/aiTools.test.js`:

```js
import { vi } from 'vitest';

// ctx com espiões: cada action regista o que recebeu e devolve o próprio store.
function writeCtx(seed = {}) {
  const state = {
    addedExp: [], goals: [], incomes: [], recurring: [], bdg: [{ id: 'sup', nm: 'Supermercado', lm: 300 }],
    rules: [], people: [], groups: [], groupEntries: [], dynAccts: null, dynSnaps: [],
    ...seed,
  };
  const actions = {
    getState: () => state,
    addExpense: vi.fn((e) => { state.addedExp = [...state.addedExp, e]; }),
    updateExpense: vi.fn((id, p) => { state.addedExp = state.addedExp.map((x) => (x.id === id ? { ...x, ...p } : x)); }),
    deleteExpense: vi.fn((id) => { state.addedExp = state.addedExp.filter((x) => x.id !== id); }),
    addIncome: vi.fn(), updateIncome: vi.fn(), deleteIncome: vi.fn(),
    addGoal: vi.fn(), updateGoal: vi.fn(), deleteGoal: vi.fn(),
    addRecurring: vi.fn(), updateRecurring: vi.fn(), deleteRecurring: vi.fn(),
    addCategory: vi.fn(), setBdg: vi.fn(), addRule: vi.fn(),
    setDynAccts: vi.fn(), setDynSnaps: vi.fn(),
    addPerson: vi.fn(), addGroup: vi.fn(), addGroupEntry: vi.fn(() => 'ge1'), deleteGroupEntry: vi.fn(),
  };
  return { state, actions };
}

describe('add_expense', () => {
  it('cria a despesa com id, valor positivo e data normalizada', () => {
    const c = writeCtx();
    const r = execTool('add_expense', { desc: 'Continente', amount: -45.67, cat: 'sup', date: '2026-08-28' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addExpense).toHaveBeenCalledTimes(1);
    const arg = c.actions.addExpense.mock.calls[0][0];
    expect(arg.amount).toBe(45.67);
    expect(arg.date).toBe('2026-08-28');
    expect(arg.id).toBeTruthy();
    expect(r.data.id).toBe(arg.id);
  });
  it('usa a data de hoje quando nao vem data', () => {
    const c = writeCtx();
    execTool('add_expense', { desc: 'Cafe', amount: 1.2, cat: 'rest' }, c);
    expect(c.actions.addExpense.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('cai em "out" para uma categoria desconhecida', () => {
    const c = writeCtx();
    execTool('add_expense', { desc: 'X', amount: 1, cat: 'inventada' }, c);
    expect(c.actions.addExpense.mock.calls[0][0].cat).toBe('out');
  });
  it('exige descricao e valor', () => {
    expect(execTool('add_expense', { amount: 1 }, writeCtx()).error).toBe('invalid_args');
    expect(execTool('add_expense', { desc: 'X' }, writeCtx()).error).toBe('invalid_args');
  });
});

describe('add_income / add_goal / add_recurring', () => {
  it('add_income normaliza o dia para 1-31', () => {
    const c = writeCtx();
    execTool('add_income', { name: 'Salario', amount: 1800, source: 'salary', recurring: true, day: 99 }, c);
    expect(c.actions.addIncome.mock.calls[0][0].day).toBe(1);
  });
  it('add_goal aceita alvo e prazo', () => {
    const c = writeCtx();
    const r = execTool('add_goal', { name: 'Fundo', target: 10000, deadline: '2027-01-01' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addGoal.mock.calls[0][0]).toMatchObject({ name: 'Fundo', target: 10000, current: 0 });
  });
  it('add_recurring guarda categoria e dia', () => {
    const c = writeCtx();
    execTool('add_recurring', { name: 'Netflix', amount: 10.99, cat: 'sub', day: 3 }, c);
    expect(c.actions.addRecurring.mock.calls[0][0]).toMatchObject({ name: 'Netflix', cat: 'sub', day: 3 });
  });
});

describe('set_budget', () => {
  it('altera o limite de uma categoria existente', () => {
    const c = writeCtx();
    const r = execTool('set_budget', { cat: 'sup', limit: 250 }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.setBdg.mock.calls[0][0].find((b) => b.id === 'sup').lm).toBe(250);
  });
  it('devolve not_found para uma categoria que nao existe', () => {
    expect(execTool('set_budget', { cat: 'zzz', limit: 10 }, writeCtx())).toEqual({ error: 'not_found' });
  });
});

describe('update_balance e add_snapshot', () => {
  it('update_balance grava a chave banco_tipo em dynAccts', () => {
    const c = writeCtx();
    const r = execTool('update_balance', { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 584.64 }, c);
    expect(r.ok).toBe(true);
    const arg = c.actions.setDynAccts.mock.calls[0][0];
    expect(arg['Bankinter_Conta a Ordem'].v).toBe(584.64);
  });
  it('add_snapshot acrescenta ao fim da lista', () => {
    const c = writeCtx({ dynSnaps: [{ l: '01.08' }] });
    execTool('add_snapshot', { label: '30.08', liq: 100, poup: 200, inv: 300 }, c);
    const arg = c.actions.setDynSnaps.mock.calls[0][0];
    expect(arg).toHaveLength(2);
    expect(arg[1].l).toBe('30.08');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: FAIL — `unknown_tool` para `add_expense` e restantes.

- [ ] **Step 3: Write the implementation**

Em `src/lib/aiTools.js`, acrescentar o import e o bloco de tools de escrita, e juntá-lo ao registry:

```js
import { uid, todayISO, normalizeStmtDate } from './format.js';

const CAT_IDS = new Set(CATS.split(','));
const SOURCES = new Set(['salary', 'freelance', 'dividend', 'rental', 'bonus', 'other']);

function safeCat(c) {
  return CAT_IDS.has(c) ? c : 'out';
}
function safeDay(d) {
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1;
}
function safeDate(d) {
  return d ? normalizeStmtDate(d) : todayISO();
}
function txt(v, max) {
  return String(v == null ? '' : v).substring(0, max || 60);
}

const writeTools = {
  add_expense: {
    schema: {
      type: 'object',
      properties: {
        desc: { type: 'string', description: 'descricao curta' },
        amount: { type: 'number', description: 'valor em euros; o sinal e ignorado (guardado positivo)' },
        cat: { type: 'string', description: 'categoria: ' + CATS },
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
      },
      required: ['desc', 'amount'],
    },
    description: 'Regista uma despesa nova.',
    run(args, { actions }) {
      const exp = {
        id: uid(),
        desc: txt(args.desc),
        amount: Math.abs(Number(args.amount) || 0),
        cat: safeCat(args.cat),
        date: safeDate(args.date),
      };
      actions.addExpense(exp);
      return ok({ id: exp.id, ...exp });
    },
  },

  add_income: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        source: { type: 'string', description: 'salary | freelance | dividend | rental | bonus | other' },
        recurring: { type: 'boolean', description: 'true = todos os meses' },
        day: { type: 'number', description: 'dia do mes 1-31 quando recurring' },
        date: { type: 'string', description: 'data YYYY-MM-DD quando NAO e recorrente' },
      },
      required: ['name', 'amount'],
    },
    description: 'Regista uma receita (salario, freelance, dividendos...).',
    run(args, { actions }) {
      const inc = {
        id: uid(),
        name: txt(args.name),
        amount: Math.abs(Number(args.amount) || 0),
        source: SOURCES.has(args.source) ? args.source : 'other',
        recurring: args.recurring !== false,
        day: safeDay(args.day),
        date: args.date ? normalizeStmtDate(args.date) : undefined,
        createdAt: Date.now(),
      };
      actions.addIncome(inc);
      return ok({ id: inc.id });
    },
  },

  add_goal: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target: { type: 'number', description: 'valor alvo em euros' },
        current: { type: 'number', description: 'valor ja poupado' },
        deadline: { type: 'string', description: 'prazo YYYY-MM-DD' },
      },
      required: ['name', 'target'],
    },
    description: 'Cria uma meta de poupanca.',
    run(args, { actions }) {
      const g = {
        id: uid(),
        name: txt(args.name),
        target: Number(args.target) || 0,
        current: Number(args.current) || 0,
        deadline: args.deadline || '',
        color: '#3b6fee',
        createdAt: Date.now(),
      };
      actions.addGoal(g);
      return ok({ id: g.id });
    },
  },

  add_recurring: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        cat: { type: 'string', description: 'categoria: ' + CATS },
        day: { type: 'number', description: 'dia do mes 1-31' },
      },
      required: ['name', 'amount'],
    },
    description: 'Cria uma despesa recorrente (subscricao, mensalidade...).',
    run(args, { actions }) {
      const r = {
        id: uid(),
        name: txt(args.name),
        amount: Number(args.amount) || 0,
        cat: safeCat(args.cat || 'sub'),
        day: safeDay(args.day),
        createdAt: Date.now(),
      };
      actions.addRecurring(r);
      return ok({ id: r.id });
    },
  },

  add_category: {
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id curto, minusculas, sem espacos' },
        nm: { type: 'string', description: 'nome visivel' },
        lm: { type: 'number', description: 'limite mensal em euros' },
      },
      required: ['id', 'nm'],
    },
    description: 'Cria uma categoria de despesa nova.',
    run(args, { actions }) {
      const id = String(args.id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
      if (!id) return { error: 'invalid_args', detail: 'id vazio depois de normalizar' };
      const cat = { id, nm: txt(args.nm, 30), lm: Number(args.lm) || 0 };
      actions.addCategory(cat);
      return ok(cat);
    },
  },

  add_rule: {
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'texto a procurar na descricao' },
        cat: { type: 'string', description: 'categoria a aplicar: ' + CATS },
      },
      required: ['pattern', 'cat'],
    },
    description: 'Cria uma regra de categorizacao automatica.',
    run(args, { actions }) {
      const rule = { id: uid(), pattern: txt(args.pattern, 40), cat: safeCat(args.cat) };
      actions.addRule(rule);
      return ok({ id: rule.id });
    },
  },

  set_budget: {
    schema: {
      type: 'object',
      properties: {
        cat: { type: 'string', description: 'id da categoria (ver list_categories)' },
        limit: { type: 'number', description: 'novo limite mensal em euros' },
      },
      required: ['cat', 'limit'],
    },
    description: 'Define o orcamento mensal de uma categoria.',
    run(args, { actions }) {
      const bdg = actions.getState().bdg || [];
      if (!bdg.some((b) => b.id === args.cat)) return notFound();
      actions.setBdg(bdg.map((b) => (b.id === args.cat ? { ...b, lm: Number(args.limit) || 0 } : b)));
      return ok({ cat: args.cat, limit: Number(args.limit) || 0 });
    },
  },

  update_balance: {
    schema: {
      type: 'object',
      properties: {
        account_bank: { type: 'string', description: 'Bankinter | Activobank | Moey | Trade Republic | XTB | Goparity | Raize' },
        account_type: { type: 'string', description: 'Conta a Ordem | Poupanca | Corretagem | Private Markets | Rend. Fixo | Transacoes | Planos Invest. | P2P Lending' },
        value: { type: 'number', description: 'saldo em euros' },
        note: { type: 'string', description: 'nota opcional (ex: total antes de dividir)' },
      },
      required: ['account_bank', 'account_type', 'value'],
    },
    description: 'Atualiza o saldo de uma conta.',
    run(args, { actions }) {
      const st = actions.getState();
      const key = args.account_bank + '_' + args.account_type;
      const dyn = { ...(st.dynAccts || {}) };
      dyn[key] = { v: Number(args.value) || 0, d: todayISO().replace(/-/g, '.'), n: args.note || null };
      actions.setDynAccts(dyn);
      return ok({ key, value: dyn[key].v });
    },
  },

  add_snapshot: {
    schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'etiqueta DD.MM' },
        liq: { type: 'number' }, poup: { type: 'number' }, inv: { type: 'number' },
        div: { type: 'number' }, xP: { type: 'number' }, xT: { type: 'number' }, tC: { type: 'number' },
      },
      required: ['label'],
    },
    description: 'Grava um snapshot patrimonial no historico.',
    run(args, { actions }) {
      const st = actions.getState();
      const snap = {
        l: txt(args.label, 8),
        liq: Number(args.liq) || 0, poup: Number(args.poup) || 0, inv: Number(args.inv) || 0,
        div: Number(args.div) || 0, xP: Number(args.xP) || 0, xT: Number(args.xT) || 0, tC: Number(args.tC) || 0,
      };
      actions.setDynSnaps([...(st.dynSnaps || []), snap]);
      return ok(snap);
    },
  },
};
```

E atualizar o registry:

```js
export const TOOLS = { ...readTools, ...writeTools };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiTools.js src/lib/aiTools.test.js
git commit -m "feat(ia): tools de criacao (despesa, receita, meta, recorrente, orcamento, saldo)

Valores sao saneados na fronteira: categoria desconhecida cai em out, dia
fora de 1-31 cai em 1 e o valor da despesa e sempre guardado positivo."
```

---

### Task 5: Tools destrutivas com gate de confirmação

`update_*` e `delete_*` só escrevem depois de o utilizador confirmar.

**Files:**
- Modify: `src/lib/aiTools.js`
- Test: `src/lib/aiTools.test.js`

**Interfaces:**
- Consumes: registry e `execTool` das Tasks 3-4.
- Produces: tools `update_expense`, `delete_expense`, `update_income`, `delete_income`, `update_goal`, `delete_goal`, `update_recurring`, `delete_recurring`. `execTool` passa a devolver `{ pending: true, preview, call: { name, args } }` na primeira chamada a uma destrutiva. `preview` tem a forma `{ action: 'update'|'delete', kind: string, label: string, before?: object, after?: object }`.

- [ ] **Step 1: Write the failing test**

Acrescentar a `src/lib/aiTools.test.js`:

```js
describe('gate das accoes destrutivas', () => {
  const seed = () => ({
    addedExp: [{ id: 'e1', desc: 'Continente', amount: 45.67, cat: 'sup', date: '2026-08-28' }],
    goals: [{ id: 'g1', name: 'Fundo', target: 10000, current: 2500 }],
    incomes: [{ id: 'i1', name: 'Salario', amount: 1800 }],
    recurring: [{ id: 'r1', name: 'Netflix', amount: 10.99, cat: 'sub', day: 1 }],
  });

  it('delete_expense NAO apaga na primeira chamada', () => {
    const c = writeCtx(seed());
    const r = execTool('delete_expense', { id: 'e1' }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.action).toBe('delete');
    expect(r.preview.label).toContain('Continente');
    expect(r.call).toEqual({ name: 'delete_expense', args: { id: 'e1' } });
    expect(c.actions.deleteExpense).not.toHaveBeenCalled();
  });

  it('delete_expense apaga com confirmed: true', () => {
    const c = writeCtx(seed());
    const r = execTool('delete_expense', { id: 'e1', confirmed: true }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.deleteExpense).toHaveBeenCalledWith('e1');
  });

  it('delete_expense devolve not_found para id inexistente, sem pedir confirmacao', () => {
    const c = writeCtx(seed());
    expect(execTool('delete_expense', { id: 'nao-existe' }, c)).toEqual({ error: 'not_found' });
    expect(c.actions.deleteExpense).not.toHaveBeenCalled();
  });

  it('update_expense mostra antes e depois na pre-visualizacao', () => {
    const c = writeCtx(seed());
    const r = execTool('update_expense', { id: 'e1', amount: 50 }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.before.amount).toBe(45.67);
    expect(r.preview.after.amount).toBe(50);
    expect(c.actions.updateExpense).not.toHaveBeenCalled();
  });

  it('update_expense escreve so os campos enviados, com confirmed', () => {
    const c = writeCtx(seed());
    execTool('update_expense', { id: 'e1', amount: 50, confirmed: true }, c);
    expect(c.actions.updateExpense).toHaveBeenCalledWith('e1', { amount: 50 });
  });

  it('cobre as restantes coleccoes', () => {
    const c = writeCtx(seed());
    expect(execTool('delete_goal', { id: 'g1' }, c).pending).toBe(true);
    expect(execTool('delete_income', { id: 'i1' }, c).pending).toBe(true);
    expect(execTool('delete_recurring', { id: 'r1' }, c).pending).toBe(true);
    expect(execTool('update_goal', { id: 'g1', target: 12000 }, c).pending).toBe(true);
    execTool('delete_goal', { id: 'g1', confirmed: true }, c);
    expect(c.actions.deleteGoal).toHaveBeenCalledWith('g1');
  });

  it('nenhuma tool de criacao pede confirmacao', () => {
    const c = writeCtx(seed());
    expect(execTool('add_expense', { desc: 'X', amount: 1 }, c).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: FAIL — `unknown_tool` para `delete_expense` e restantes.

- [ ] **Step 3: Write the implementation**

Em `src/lib/aiTools.js`, acrescentar um construtor de tools destrutivas e o gate em `execTool`:

```js
/* ── Tools destrutivas ───────────────────────────────────────────────────
   Fábrica: cada coleção tem a mesma forma (encontrar por id, pré-visualizar,
   escrever só com confirmed). Evita repetir oito vezes o mesmo código. */

const COLLECTIONS = {
  expense: {
    kind: 'despesa',
    slice: 'addedExp',
    update: (a) => a.updateExpense,
    remove: (a) => a.deleteExpense,
    label: (x) => x.desc + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR · ' + (x.date || ''),
    fields: {
      desc: { type: 'string' },
      amount: { type: 'number' },
      cat: { type: 'string', description: 'categoria: ' + CATS },
      date: { type: 'string', description: 'data YYYY-MM-DD' },
    },
  },
  income: {
    kind: 'receita',
    slice: 'incomes',
    update: (a) => a.updateIncome,
    remove: (a) => a.deleteIncome,
    label: (x) => x.name + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR',
    fields: { name: { type: 'string' }, amount: { type: 'number' }, day: { type: 'number' } },
  },
  goal: {
    kind: 'meta',
    slice: 'goals',
    update: (a) => a.updateGoal,
    remove: (a) => a.deleteGoal,
    label: (x) => x.name + ' · alvo ' + (Number(x.target) || 0).toFixed(2) + ' EUR',
    fields: { name: { type: 'string' }, target: { type: 'number' }, current: { type: 'number' }, deadline: { type: 'string' } },
  },
  recurring: {
    kind: 'recorrente',
    slice: 'recurring',
    update: (a) => a.updateRecurring,
    remove: (a) => a.deleteRecurring,
    label: (x) => x.name + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR/mes',
    fields: { name: { type: 'string' }, amount: { type: 'number' }, cat: { type: 'string' }, day: { type: 'number' } },
  },
};

// Campos que nunca são escritos a partir dos argumentos do modelo.
const RESERVED = new Set(['id', 'confirmed']);

function findIn(ctx, slice, id) {
  return ((ctx.actions.getState() || {})[slice] || []).find((x) => x.id === id) || null;
}

function makeUpdateTool(key) {
  const c = COLLECTIONS[key];
  return {
    destructive: true,
    description: 'Altera uma ' + c.kind + ' existente. Usa o id devolvido pelas tools de leitura.',
    schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'id do registo' }, ...c.fields },
      required: ['id'],
    },
    preview(args, ctx) {
      const cur = findIn(ctx, c.slice, args.id);
      if (!cur) return notFound();
      const patch = {};
      Object.keys(args).forEach((k) => {
        if (!RESERVED.has(k) && c.fields[k]) patch[k] = k === 'amount' || k === 'target' || k === 'current' || k === 'day' ? Number(args[k]) : args[k];
      });
      return { action: 'update', kind: c.kind, label: c.label(cur), before: cur, after: { ...cur, ...patch }, patch };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      c.update(ctx.actions)(args.id, p.patch);
      return ok({ id: args.id, patch: p.patch });
    },
  };
}

function makeDeleteTool(key) {
  const c = COLLECTIONS[key];
  return {
    destructive: true,
    description: 'Apaga uma ' + c.kind + '. Usa o id devolvido pelas tools de leitura.',
    schema: { type: 'object', properties: { id: { type: 'string', description: 'id do registo' } }, required: ['id'] },
    preview(args, ctx) {
      const cur = findIn(ctx, c.slice, args.id);
      if (!cur) return notFound();
      return { action: 'delete', kind: c.kind, label: c.label(cur), before: cur };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      c.remove(ctx.actions)(args.id);
      return ok({ id: args.id, deleted: true });
    },
  };
}

const destructiveTools = Object.keys(COLLECTIONS).reduce((acc, key) => {
  acc['update_' + key] = makeUpdateTool(key);
  acc['delete_' + key] = makeDeleteTool(key);
  return acc;
}, {});
```

`confirmed` tem de estar declarado no schema das destrutivas para o validador não o rejeitar — acrescentar em `makeUpdateTool` e `makeDeleteTool`, dentro de `properties`:

```js
confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
```

Atualizar o registry e o `execTool`:

```js
export const TOOLS = { ...readTools, ...writeTools, ...destructiveTools };
```

```js
export function execTool(name, args, ctx) {
  const t = TOOLS[name];
  if (!t) return { error: 'unknown_tool' };
  const a = args && typeof args === 'object' ? args : {};
  const bad = validate(t.schema, a);
  if (bad) return { error: 'invalid_args', detail: bad };
  try {
    // Gate destrutivo: primeira chamada só pré-visualiza. O bloqueio vive aqui
    // e não na UI, para nenhum caminho de chamada o contornar.
    if (t.destructive && a.confirmed !== true) {
      const preview = t.preview(a, ctx);
      if (preview.error) return preview;
      return { pending: true, preview, call: { name, args: a } };
    }
    return t.run(a, ctx);
  } catch (e) {
    return { error: 'tool_failed', detail: (e && e.message) || 'erro' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiTools.js src/lib/aiTools.test.js
git commit -m "feat(ia): editar e apagar com confirmacao obrigatoria

update_* e delete_* devolvem uma pre-visualizacao na primeira chamada e so
escrevem com confirmed:true. O gate vive no executor, nao na UI."
```

---

### Task 6: Tools de grupos

Criar grupos, pessoas, despesas partilhadas e acertos, sempre por cima das actions do store (nada de matemática nova).

**Files:**
- Modify: `src/lib/aiTools.js`
- Test: `src/lib/aiTools.test.js`

**Interfaces:**
- Consumes: `resolveShares`, `GROUP_CATS` de `lib/split.js`; `ME_ID` de `store/store.jsx`.
- Produces: tools `create_group`, `add_person`, `add_group_expense`, `settle_group`, `delete_group_entry` (esta última destrutiva).

> `ME_ID` é exportado de `src/store/store.jsx`. Importar uma constante do módulo do store para um lib puro puxaria React para dentro de `aiTools.js`; por isso define-se aqui `const ME_ID = 'me'` com um comentário a apontar para a fonte, e a Task acrescenta um teste que garante que os dois valores continuam iguais.

- [ ] **Step 1: Write the failing test**

Acrescentar a `src/lib/aiTools.test.js`:

```js
import { ME_ID } from '../store/store.jsx';
import { ME_ID as TOOLS_ME_ID } from './aiTools.js';

describe('tools de grupos', () => {
  const seed = () => ({
    people: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bruno' }],
    groups: [{ id: 'gr1', name: 'Algarve', memberIds: ['me', 'p1', 'p2'] }],
    groupEntries: [],
  });

  it('o ME_ID local acompanha o do store', () => {
    expect(TOOLS_ME_ID).toBe(ME_ID);
  });

  it('create_group cria com o proprio incluido', () => {
    const c = writeCtx(seed());
    const r = execTool('create_group', { name: 'Ferias', person_ids: ['p1'] }, c);
    expect(r.ok).toBe(true);
    const arg = c.actions.addGroup.mock.calls[0][0];
    expect(arg.name).toBe('Ferias');
    expect(arg.memberIds).toContain('p1');
  });

  it('add_person cria uma pessoa e devolve o id', () => {
    const c = writeCtx(seed());
    const r = execTool('add_person', { name: 'Carla' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addPerson.mock.calls[0][0].name).toBe('Carla');
    expect(r.data.id).toBeTruthy();
  });

  it('add_group_expense divide por igual por omissao e usa o proprio como pagador', () => {
    const c = writeCtx(seed());
    const r = execTool('add_group_expense', { group_id: 'gr1', desc: 'Jantar', amount: 60 }, c);
    expect(r.ok).toBe(true);
    const entry = c.actions.addGroupEntry.mock.calls[0][0];
    expect(entry.groupId).toBe('gr1');
    expect(entry.payerId).toBe('me');
    expect(entry.amount).toBe(60);
    expect(entry.kind).toBe('expense');
    expect(entry.splitMode).toBe('equal');
    expect(entry.shares.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(60, 2);
    expect(entry.shares).toHaveLength(3);
  });

  it('add_group_expense aceita um pagador diferente', () => {
    const c = writeCtx(seed());
    execTool('add_group_expense', { group_id: 'gr1', desc: 'Hotel', amount: 300, payer_id: 'p1' }, c);
    expect(c.actions.addGroupEntry.mock.calls[0][0].payerId).toBe('p1');
  });

  it('add_group_expense rejeita um grupo que nao existe', () => {
    expect(execTool('add_group_expense', { group_id: 'zz', desc: 'X', amount: 1 }, writeCtx(seed())))
      .toEqual({ error: 'not_found' });
  });

  it('add_group_expense rejeita um pagador que nao e membro', () => {
    const r = execTool('add_group_expense', { group_id: 'gr1', desc: 'X', amount: 1, payer_id: 'p9' }, writeCtx(seed()));
    expect(r.error).toBe('invalid_args');
  });

  it('settle_group regista um acerto entre dois membros', () => {
    const c = writeCtx(seed());
    const r = execTool('settle_group', { group_id: 'gr1', from_id: 'p1', to_id: 'me', amount: 20 }, c);
    expect(r.ok).toBe(true);
    const entry = c.actions.addGroupEntry.mock.calls[0][0];
    expect(entry.kind).toBe('settlement');
    expect(entry.fromId).toBe('p1');
    expect(entry.toId).toBe('me');
    expect(entry.shares).toBeUndefined();
  });

  it('delete_group_entry pede confirmacao antes de apagar', () => {
    const c = writeCtx({ ...seed(), groupEntries: [{ id: 'ge1', groupId: 'gr1', desc: 'Jantar', amount: 60 }] });
    const r = execTool('delete_group_entry', { id: 'ge1' }, c);
    expect(r.pending).toBe(true);
    expect(c.actions.deleteGroupEntry).not.toHaveBeenCalled();
    execTool('delete_group_entry', { id: 'ge1', confirmed: true }, c);
    expect(c.actions.deleteGroupEntry).toHaveBeenCalledWith('ge1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: FAIL — `unknown_tool` para `create_group` e restantes.

- [ ] **Step 3: Write the implementation**

Em `src/lib/aiTools.js`:

```js
import { resolveShares, GROUP_CATS } from './split.js';

// Espelha ME_ID de store/store.jsx. Não é importado de lá para este módulo
// continuar puro (store.jsx puxa React); um teste garante que não divergem.
export const ME_ID = 'me';

const groupTools = {
  create_group: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'nome do grupo' },
        person_ids: { type: 'array', items: { type: 'string' }, description: 'ids de pessoas (ver list_people); o proprio entra sempre' },
      },
      required: ['name'],
    },
    description: 'Cria um grupo de despesas partilhadas.',
    run(args, { actions }) {
      const people = actions.getState().people || [];
      const known = new Set(people.map((p) => p.id));
      const ids = (Array.isArray(args.person_ids) ? args.person_ids : []).filter((id) => known.has(id));
      const g = { id: uid(), name: txt(args.name, 40), memberIds: [ME_ID, ...ids], createdAt: Date.now() };
      actions.addGroup(g);
      return ok({ id: g.id, memberIds: g.memberIds });
    },
  },

  add_person: {
    schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'nome da pessoa' } },
      required: ['name'],
    },
    description: 'Cria uma pessoa para usar em grupos de despesas partilhadas.',
    run(args, { actions }) {
      const p = { id: uid(), name: txt(args.name, 40) };
      actions.addPerson(p);
      return ok({ id: p.id, name: p.name });
    },
  },

  add_group_expense: {
    schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'id do grupo (ver list_groups)' },
        desc: { type: 'string' },
        amount: { type: 'number', description: 'valor total da despesa' },
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
        payer_id: { type: 'string', description: 'quem pagou; por omissao o proprio ("me")' },
        member_ids: { type: 'array', items: { type: 'string' }, description: 'quem divide; por omissao todos os membros' },
        gcat: { type: 'string', description: 'categoria da despesa de grupo (ver GROUP_CATS em lib/split.js)' },
      },
      required: ['group_id', 'desc', 'amount'],
    },
    description: 'Lanca uma despesa partilhada num grupo, dividida por igual.',
    run(args, { actions }) {
      const st = actions.getState();
      const group = (st.groups || []).find((g) => g.id === args.group_id);
      if (!group) return notFound();
      const members = group.memberIds || [];
      const payerId = args.payer_id || ME_ID;
      if (members.indexOf(payerId) === -1) return { error: 'invalid_args', detail: 'payer_id nao e membro do grupo' };
      const chosen = Array.isArray(args.member_ids) && args.member_ids.length
        ? args.member_ids.filter((id) => members.indexOf(id) !== -1)
        : members;
      if (!chosen.length) return { error: 'invalid_args', detail: 'nenhum membro valido para dividir' };
      const amount = Math.abs(Number(args.amount) || 0);
      // resolveShares devolve {shares, error} — nunca um array.
      const { shares, error } = resolveShares(
        'equal',
        amount,
        chosen.map((id) => ({ personId: id })),
        payerId
      );
      if (error) return { error: 'invalid_args', detail: error };
      const entry = {
        groupId: group.id,
        kind: 'expense',
        desc: txt(args.desc),
        amount,
        date: safeDate(args.date),
        payerId,
        splitMode: 'equal',
        shares,
        gcat: GROUP_CATS.some((c) => c.id === args.gcat) ? args.gcat : 'other',
      };
      const id = actions.addGroupEntry(entry);
      return ok({ id, groupId: group.id, amount });
    },
  },

  settle_group: {
    schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        from_id: { type: 'string', description: 'quem paga' },
        to_id: { type: 'string', description: 'quem recebe' },
        amount: { type: 'number' },
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
      },
      required: ['group_id', 'from_id', 'to_id', 'amount'],
    },
    description: 'Regista um acerto de contas entre dois membros de um grupo.',
    run(args, { actions }) {
      const st = actions.getState();
      const group = (st.groups || []).find((g) => g.id === args.group_id);
      if (!group) return notFound();
      const members = group.memberIds || [];
      if (members.indexOf(args.from_id) === -1 || members.indexOf(args.to_id) === -1)
        return { error: 'invalid_args', detail: 'from_id ou to_id nao sao membros do grupo' };
      const amount = Math.abs(Number(args.amount) || 0);
      // Um acerto NAO e uma despesa: kind 'settlement', com fromId/toId e sem
      // shares (ver split.js:114 e modals/SettleSheet.jsx). O store nunca
      // reflecte um settlement em addedExp.
      const entry = {
        groupId: group.id,
        kind: 'settlement',
        fromId: args.from_id,
        toId: args.to_id,
        amount,
        date: safeDate(args.date),
      };
      const id = actions.addGroupEntry(entry);
      return ok({ id, amount });
    },
  },

  delete_group_entry: {
    destructive: true,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do movimento (ver get_group)' },
        confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
      },
      required: ['id'],
    },
    description: 'Apaga uma despesa ou acerto de um grupo.',
    preview(args, { actions }) {
      const e = ((actions.getState() || {}).groupEntries || []).find((x) => x.id === args.id);
      if (!e) return notFound();
      return {
        action: 'delete',
        kind: 'movimento de grupo',
        label: (e.desc || 'Movimento') + ' · ' + (Number(e.amount) || 0).toFixed(2) + ' EUR',
        before: e,
      };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      ctx.actions.deleteGroupEntry(args.id);
      return ok({ id: args.id, deleted: true });
    },
  },
};
```

Atualizar o registry:

```js
export const TOOLS = { ...readTools, ...writeTools, ...destructiveTools, ...groupTools };
```

> Formas já confirmadas contra o código (não voltar a adivinhar): `resolveShares(mode, amount, entries, payerId)` devolve `{ shares, error }`, com `shares` no formato `[{ personId, amount }]`; uma despesa de grupo é `{ groupId, kind:'expense', desc, amount, date, payerId, splitMode, shares, gcat }` (ver `modals/GroupExpenseSheet.jsx:270-281`); um acerto é `{ groupId, kind:'settlement', fromId, toId, amount, date }` (ver `modals/SettleSheet.jsx:184`). `reflectExpenseFor` ignora `kind === 'settlement'`, por isso um acerto nunca gera movimento pessoal. Os invariantes continuam a ser do store, não destas tools.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiTools.test.js`
Expected: PASS.

- [ ] **Step 5: Run the group suites to check nothing regressed**

Run: `npx vitest run src/store/groups.store.test.jsx src/views/groups.integration.test.jsx src/modals/settle.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiTools.js src/lib/aiTools.test.js
git commit -m "feat(ia): tools de grupos e despesas partilhadas

create_group, add_person, add_group_expense, settle_group e
delete_group_entry, com a divisao a vir de split.js e os invariantes a
continuarem no store."
```

---

### Task 7: Loop de tool-calling em `src/lib/aiChat.js`

**Files:**
- Create: `src/lib/aiChat.js`
- Test: `src/lib/aiChat.test.js` (criar)

**Interfaces:**
- Consumes: `chat` de `lib/ai.js` (injetável); `TOOL_SCHEMAS`, `execTool` de `lib/aiTools.js`.
- Produces:
  - `MAX_ROUNDS = 4`
  - `runAssistant(userText, { state, actions, history, systemPrompt, chatFn }) -> Promise<{ text, applied, pending, usage, messages }>`
    - `applied`: `[{ name, args, data }]`
    - `pending`: `[{ name, args, preview }]`
    - `usage`: `{ prompt_tokens, completion_tokens, total_tokens }` somado de todas as voltas
  - `confirmPending(call, ctx) -> { ok, data } | { error }` — executa uma chamada pendente com `confirmed: true`.
  - `ASSISTANT_SYSTEM` — o system prompt do assistente, numa constante só (usado pela `AssistantSheet` e pelo `AIView`).
  - `estimateCost(usage) -> number` — custo em euros do pedido, a partir do preço do tier `fast`.

- [ ] **Step 1: Write the failing test**

Criar `src/lib/aiChat.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { runAssistant, confirmPending, estimateCost, ASSISTANT_SYSTEM, MAX_ROUNDS } from './aiChat.js';

function ctx(seed = {}) {
  const state = { addedExp: [{ id: 'e1', desc: 'Continente', amount: 45.67, cat: 'sup', date: '2026-08-28' }], ...seed };
  const actions = {
    getState: () => state,
    addExpense: vi.fn(),
    deleteExpense: vi.fn(),
  };
  return { state, actions };
}

const say = (content) => ({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
const callTool = (name, args, id = 'c1') => ({
  choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
});

describe('runAssistant', () => {
  it('devolve o texto quando o modelo nao chama tools', async () => {
    const chatFn = vi.fn(() => Promise.resolve(say('Gastaste 45,67 EUR.')));
    const out = await runAssistant('quanto gastei?', { ...ctx(), chatFn });
    expect(out.text).toBe('Gastaste 45,67 EUR.');
    expect(chatFn).toHaveBeenCalledTimes(1);
    expect(out.applied).toEqual([]);
  });

  it('executa a tool e volta a chamar o modelo com o resultado', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('add_expense', { desc: 'Cafe', amount: 1.2, cat: 'rest' }))
      .mockResolvedValueOnce(say('Registei o cafe.'));
    const c = ctx();
    const out = await runAssistant('regista um cafe de 1,20', { ...c, chatFn });
    expect(c.actions.addExpense).toHaveBeenCalledTimes(1);
    expect(out.text).toBe('Registei o cafe.');
    expect(out.applied[0].name).toBe('add_expense');
    // a segunda chamada leva a mensagem de tool com o tool_call_id certo
    const second = chatFn.mock.calls[1][0];
    const toolMsg = second[second.length - 1];
    expect(toolMsg.role).toBe('tool');
    expect(toolMsg.tool_call_id).toBe('c1');
  });

  it('soma o usage de todas as voltas', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('add_expense', { desc: 'X', amount: 1 }))
      .mockResolvedValueOnce(say('feito'));
    const out = await runAssistant('x', { ...ctx(), chatFn });
    expect(out.usage.total_tokens).toBe(28 + 15);
  });

  it('para nas MAX_ROUNDS voltas mesmo que o modelo continue a pedir tools', async () => {
    const chatFn = vi.fn(() => Promise.resolve(callTool('add_expense', { desc: 'loop', amount: 1 })));
    const out = await runAssistant('x', { ...ctx(), chatFn });
    expect(chatFn).toHaveBeenCalledTimes(MAX_ROUNDS);
    expect(out.text).toMatch(/nao consegui concluir/i);
  });

  it('junta uma accao destrutiva a pending e nao escreve', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('delete_expense', { id: 'e1' }))
      .mockResolvedValueOnce(say('Confirmas?'));
    const c = ctx();
    const out = await runAssistant('apaga a do continente', { ...c, chatFn });
    expect(c.actions.deleteExpense).not.toHaveBeenCalled();
    expect(out.pending).toHaveLength(1);
    expect(out.pending[0].preview.label).toContain('Continente');
  });

  it('devolve o erro da tool ao modelo em vez de rebentar', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('delete_expense', { id: 'nao-existe' }))
      .mockResolvedValueOnce(say('Nao encontrei essa despesa.'));
    const out = await runAssistant('apaga', { ...ctx(), chatFn });
    expect(out.text).toBe('Nao encontrei essa despesa.');
    expect(out.pending).toEqual([]);
  });

  it('sobrevive a argumentos que nao sao JSON valido', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'add_expense', arguments: '{oops' } }] } }] })
      .mockResolvedValueOnce(say('desculpa'));
    const out = await runAssistant('x', { ...ctx(), chatFn });
    expect(out.text).toBe('desculpa');
  });
});

describe('estimateCost', () => {
  it('calcula o custo do tier fast em euros', () => {
    // 1M tokens de entrada = 0,30 USD; 1M de saida = 2,50 USD.
    const c = estimateCost({ prompt_tokens: 1_000_000, completion_tokens: 0 });
    expect(c).toBeCloseTo(0.3, 6);
    const c2 = estimateCost({ prompt_tokens: 0, completion_tokens: 1_000_000 });
    expect(c2).toBeCloseTo(2.5, 6);
  });
  it('devolve 0 sem usage', () => {
    expect(estimateCost(null)).toBe(0);
    expect(estimateCost({})).toBe(0);
  });
});

describe('ASSISTANT_SYSTEM', () => {
  it('diz ao modelo para nao preencher o campo confirmed', () => {
    expect(ASSISTANT_SYSTEM).toMatch(/confirmed/);
  });
});

describe('confirmPending', () => {
  it('executa a chamada com confirmed e escreve', () => {
    const c = ctx();
    const r = confirmPending({ name: 'delete_expense', args: { id: 'e1' } }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.deleteExpense).toHaveBeenCalledWith('e1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiChat.test.js`
Expected: FAIL — `src/lib/aiChat.js` não existe.

- [ ] **Step 3: Write the implementation**

Criar `src/lib/aiChat.js`:

```js
/* ════════════════════════════════════════════════════════════════════════
   aiChat — o loop de tool-calling do assistente.

   Uma volta = uma ida ao modelo. Se ele pedir tools, executamos, devolvemos
   os resultados como mensagens role:'tool' e voltamos a ir. Máximo de
   MAX_ROUNDS voltas para nenhum modelo em ciclo queimar créditos.

   Ações destrutivas nunca escrevem aqui: o executor devolve {pending} e nós
   dizemos ao modelo que ficou à espera do utilizador. A UI mostra o cartão de
   confirmação e chama confirmPending() quando o utilizador aceitar.
   ════════════════════════════════════════════════════════════════════════ */

import { chat as defaultChat } from './ai.js';
import { TOOL_SCHEMAS, execTool } from './aiTools.js';

export const MAX_ROUNDS = 4;

// Preço do tier `fast` (google/gemini-3.5-flash-lite), USD por token.
const PRICE_IN = 0.3 / 1_000_000;
const PRICE_OUT = 2.5 / 1_000_000;

export const ASSISTANT_SYSTEM = [
  'Es o assistente financeiro da app PROOF. FINANCE. Respondes em portugues de Portugal.',
  'Tens tools para ler e escrever nos dados do utilizador — usa-as em vez de adivinhar.',
  'Para alterar ou apagar um registo, procura-o primeiro com uma tool de leitura e usa o id que ela devolver.',
  'Nunca preenchas o campo "confirmed": e o utilizador que confirma na app.',
  'Respostas curtas e diretas, com markdown simples. Valores em formato europeu (1.234,56 EUR).',
].join('\n');

export function estimateCost(usage) {
  if (!usage) return 0;
  return (usage.prompt_tokens || 0) * PRICE_IN + (usage.completion_tokens || 0) * PRICE_OUT;
}

function addUsage(acc, u) {
  if (!u) return acc;
  return {
    prompt_tokens: (acc.prompt_tokens || 0) + (u.prompt_tokens || 0),
    completion_tokens: (acc.completion_tokens || 0) + (u.completion_tokens || 0),
    total_tokens: (acc.total_tokens || 0) + (u.total_tokens || 0),
  };
}

function messageOf(res) {
  const c = res && res.choices && res.choices[0];
  return (c && c.message) || {};
}

export function confirmPending(call, ctx) {
  return execTool(call.name, { ...call.args, confirmed: true }, ctx);
}

export async function runAssistant(userText, opts) {
  const o = opts || {};
  const chatFn = o.chatFn || defaultChat;
  const ctx = { state: o.state, actions: o.actions };
  const messages = [
    ...(o.systemPrompt ? [{ role: 'system', content: o.systemPrompt }] : []),
    ...(o.history || []),
    { role: 'user', content: userText },
  ];

  let usage = {};
  const applied = [];
  const pending = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await chatFn(messages, { tools: TOOL_SCHEMAS, tier: 'fast', maxTokens: 2000 });
    usage = addUsage(usage, res && res.usage);
    const msg = messageOf(res);
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    if (!calls.length) {
      return { text: msg.content || '', applied, pending, usage, messages: [...messages, msg] };
    }

    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: calls });

    calls.forEach((call) => {
      const name = call.function && call.function.name;
      let args = {};
      try {
        args = JSON.parse((call.function && call.function.arguments) || '{}');
      } catch (e) {
        args = { __parse_error: true };
      }
      let result;
      if (args.__parse_error) {
        result = { error: 'invalid_args', detail: 'argumentos nao sao JSON valido' };
      } else {
        result = execTool(name, args, ctx);
      }
      if (result && result.pending) {
        pending.push({ name, args, preview: result.preview });
        result = { status: 'awaiting_user_confirmation', preview: result.preview };
      } else if (result && result.ok) {
        applied.push({ name, args, data: result.data });
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    });
  }

  return {
    text: 'Nao consegui concluir o pedido em ' + MAX_ROUNDS + ' passos. Tenta ser mais especifico.',
    applied,
    pending,
    usage,
    messages,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiChat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiChat.js src/lib/aiChat.test.js
git commit -m "feat(ia): loop de tool-calling com teto de 4 voltas

Executa as tools no cliente, devolve os resultados ao modelo e acumula o
usage. Accoes destrutivas ficam em pending a espera do utilizador."
```

---

### Task 8: Contexto compacto em `buildAIContext`

**Files:**
- Modify: `src/lib/ai.js` (substituir o stub `buildAIContext`)
- Test: `src/lib/ai.test.js`

**Interfaces:**
- Consumes: `compute` de `lib/finance.js`; `monthEffectiveLimits` de `lib/budget.js`.
- Produces: `buildAIContext(state) -> { today, netWorth, totalAssets, cardDebt, loanOutstanding, accounts, month, budget, counts, groups, people }`, garantidamente pequeno (só agregados e nomes; nunca listas de despesas).

- [ ] **Step 1: Write the failing test**

Acrescentar a `src/lib/ai.test.js`:

```js
import { buildAIContext } from './ai.js';

describe('buildAIContext', () => {
  const state = {
    addedExp: [
      { id: 'e1', desc: 'Pingo Doce', amount: 45.2, cat: 'sup', date: new Date().toISOString().slice(0, 10) },
    ],
    bdg: [{ id: 'sup', nm: 'Supermercado', lm: 300 }],
    goals: [{ id: 'g1', name: 'Fundo', target: 10000, current: 2500 }],
    incomes: [], recurring: [], customAccts: [], dynAccts: null, dynSnaps: [], rules: [],
    people: [{ id: 'p1', name: 'Ana' }],
    groups: [{ id: 'gr1', name: 'Algarve', memberIds: ['me', 'p1'] }],
    groupEntries: [],
  };

  it('inclui a data de hoje em ISO', () => {
    expect(buildAIContext(state).today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('inclui agregados patrimoniais', () => {
    const c = buildAIContext(state);
    expect(typeof c.netWorth).toBe('number');
    expect(typeof c.totalAssets).toBe('number');
  });
  it('inclui orcamento do mes com gasto', () => {
    const c = buildAIContext(state);
    expect(c.budget.find((b) => b.id === 'sup').spent).toBe(45.2);
  });
  it('inclui contagens em vez de listas de despesas', () => {
    const c = buildAIContext(state);
    expect(c.counts.expenses).toBe(1);
    expect(JSON.stringify(c)).not.toContain('Pingo Doce');
  });
  it('inclui nomes de grupos e pessoas com os ids', () => {
    const c = buildAIContext(state);
    expect(c.groups).toContainEqual({ id: 'gr1', name: 'Algarve' });
    expect(c.people).toContainEqual({ id: 'p1', name: 'Ana' });
  });
  it('fica bem abaixo de 8000 caracteres', () => {
    expect(JSON.stringify(buildAIContext(state)).length).toBeLessThan(8000);
  });
  it('aguenta um estado vazio', () => {
    expect(() => buildAIContext({})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai.test.js`
Expected: FAIL — o stub devolve `{ todo, hasState }`.

- [ ] **Step 3: Write the implementation**

Em `src/lib/ai.js`, substituir a função `buildAIContext` (e o comentário do stub) por:

```js
import { compute } from './finance.js';
import { monthEffectiveLimits } from './budget.js';
import { todayISO } from './format.js';

/* buildAIContext — retrato COMPACTO do estado para o system prompt.
   Só agregados e nomes: as listas (despesas, movimentos de grupo) vêm das
   tools de leitura, a pedido do modelo. É isto que mantém o custo por
   mensagem nos milésimos de euro. */
export function buildAIContext(state) {
  const s = state || {};
  const today = todayISO();
  const month = today.slice(0, 7);
  let c = { tA: 0, nW: 0, cardDebt: 0, loan: { out: 0 }, accts: [] };
  try {
    c = compute(s);
  } catch (e) {
    // Estado incompleto (utilizador novo): seguimos com zeros.
  }
  const lim = monthEffectiveLimits(s.addedExp || [], s.bdg || [], month, !!s.rolloverOn);
  return {
    today,
    month,
    netWorth: c.nW || 0,
    totalAssets: c.tA || 0,
    cardDebt: c.cardDebt || 0,
    loanOutstanding: (c.loan && c.loan.out) || 0,
    accounts: (c.accts || []).map((a) => ({ name: a.n, value: a.v })),
    budget: (s.bdg || []).map((b) => ({
      id: b.id,
      nm: b.nm,
      lm: b.lm,
      spent: lim[b.id] ? lim[b.id].spent : 0,
    })),
    counts: {
      expenses: (s.addedExp || []).length,
      incomes: (s.incomes || []).length,
      goals: (s.goals || []).length,
      recurring: (s.recurring || []).length,
      groupEntries: (s.groupEntries || []).length,
    },
    groups: (s.groups || []).map((g) => ({ id: g.id, name: g.name })),
    people: (s.people || []).map((p) => ({ id: p.id, name: p.name })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai.js src/lib/ai.test.js
git commit -m "feat(ia): buildAIContext deixa de ser stub

Retrato compacto (agregados, orcamento do mes, nomes de grupos e pessoas).
As listas passam a vir das tools de leitura, a pedido do modelo."
```

---

### Task 9: Extrair `renderMD` para `src/lib/markdown.js`

Refactor puro, sem mudança de comportamento, para a `AssistantSheet` e o `AIView` partilharem o mesmo renderer.

**Files:**
- Create: `src/lib/markdown.js`
- Create: `src/lib/markdown.test.js`
- Modify: `src/views/AIView.jsx` (remover `esc`/`renderMD` locais, importar do novo módulo)

**Interfaces:**
- Produces: `renderMD(text) -> string` (HTML já escapado, para `dangerouslySetInnerHTML`), `esc(text) -> string`.

- [ ] **Step 1: Write the failing test**

Criar `src/lib/markdown.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderMD, esc } from './markdown.js';

describe('esc', () => {
  it('escapa os caracteres de markup', () => {
    expect(esc('<script>alert("x")&</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&amp;&lt;/script&gt;'
    );
  });
});

describe('renderMD', () => {
  it('devolve vazio para entrada vazia', () => {
    expect(renderMD('')).toBe('');
    expect(renderMD(null)).toBe('');
  });
  it('escapa HTML vindo do modelo antes de formatar', () => {
    expect(renderMD('<img src=x onerror=1>')).not.toContain('<img');
  });
  it('converte negrito', () => {
    expect(renderMD('**total**')).toContain('<b>total</b>');
  });
  it('converte codigo inline', () => {
    expect(renderMD('`sup`')).toContain('<code');
  });
  it('converte tabelas markdown em <table>', () => {
    const md = '| Cat | Valor |\n| --- | --- |\n| sup | 45,20 |';
    const out = renderMD(md);
    expect(out).toContain('<table');
    expect(out).toContain('<th');
    expect(out).toContain('45,20');
  });
  it('converte listas', () => {
    expect(renderMD('- um\n- dois')).toContain('&bull;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/markdown.test.js`
Expected: FAIL — `src/lib/markdown.js` não existe.

- [ ] **Step 3: Write the implementation**

Criar `src/lib/markdown.js` com o cabeçalho abaixo e o corpo das funções `esc` e `renderMD` **copiado tal e qual** de `src/views/AIView.jsx` (linhas 41-120 na versão atual), apenas trocando `function esc` / `function renderMD` por `export function esc` / `export function renderMD`:

```js
/* ════════════════════════════════════════════════════════════════════════
   markdown — renderer mínimo de markdown para HTML, usado nas respostas do
   assistente (via dangerouslySetInnerHTML). O texto do modelo é escapado
   PRIMEIRO com esc(); só depois é que a formatação é aplicada, para nada do
   que o modelo escreva poder injetar markup.

   Extraído de views/AIView.jsx sem alterações de comportamento.
   ════════════════════════════════════════════════════════════════════════ */
```

Depois, em `src/views/AIView.jsx`:
- apagar as funções locais `esc` e `renderMD` (e o comentário de bloco que as antecede);
- acrescentar `import { renderMD } from '../lib/markdown.js';` junto aos restantes imports de `lib`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/markdown.test.js src/views/views.render.test.jsx`
Expected: PASS nos dois.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: verde. Este passo é um refactor puro — qualquer falha significa que o corpo copiado divergiu do original.

- [ ] **Step 6: Commit**

```bash
git add src/lib/markdown.js src/lib/markdown.test.js src/views/AIView.jsx
git commit -m "refactor(ia): renderMD sai do AIView para lib/markdown

Mesmo comportamento, agora partilhado com a sheet do assistente e com
testes proprios (incluindo escape do HTML vindo do modelo)."
```

---

### Task 10: `AssistantSheet` — a UI do assistente

**Files:**
- Create: `src/modals/AssistantSheet.jsx`
- Create: `src/modals/assistant.test.jsx`
- Modify: `src/store/ui.jsx` (acrescentar `'assistant'` a `MODALS`)
- Modify: `src/components/Shell.jsx` (acrescentar a entrada em `MODAL_COMPONENTS`)

**Interfaces:**
- Consumes: `runAssistant`, `confirmPending` de `lib/aiChat.js`; `buildAIContext` de `lib/ai.js`; `renderMD` de `lib/markdown.js`; `useStore`, `useUI`, `useToast`; `Sheet` de `components/Sheet.jsx`.
- Produces: componente `AssistantSheet` (default export), aberto com `ui.open('assistant')`.

- [ ] **Step 1: Write the failing test**

Criar `src/modals/assistant.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

const runAssistant = vi.fn();
const confirmPending = vi.fn(() => ({ ok: true, data: { deleted: true } }));
// O mock tem de exportar TUDO o que a AssistantSheet importa do modulo.
vi.mock('../lib/aiChat.js', () => ({
  runAssistant: (...a) => runAssistant(...a),
  confirmPending: (...a) => confirmPending(...a),
  estimateCost: (u) => ((u && u.prompt_tokens) || 0) * 3e-7 + ((u && u.completion_tokens) || 0) * 2.5e-6,
  ASSISTANT_SYSTEM: 'sistema-de-teste',
  MAX_ROUNDS: 4,
}));

import AssistantSheet from './AssistantSheet.jsx';

beforeEach(() => {
  runAssistant.mockReset();
  confirmPending.mockClear();
});

// renderWithStore e assincrono e abre modais por `openModal`.
const openSheet = () => renderWithStore(<AssistantSheet />, { openModal: 'assistant' });

describe('AssistantSheet', () => {
  it('mostra o campo de escrita', async () => {
    await openSheet();
    expect(screen.getByPlaceholderText(/pergunta ou regista/i)).toBeInTheDocument();
  });

  it('envia o texto e mostra a resposta', async () => {
    runAssistant.mockResolvedValue({ text: 'Registei o cafe.', applied: [], pending: [], usage: {} });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'cafe 1,20' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText('Registei o cafe.')).toBeInTheDocument());
    expect(runAssistant).toHaveBeenCalledWith('cafe 1,20', expect.objectContaining({ state: expect.any(Object) }));
  });

  it('nao envia texto vazio', async () => {
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(runAssistant).not.toHaveBeenCalled();
  });

  it('mostra o cartao de confirmacao para uma accao destrutiva', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente · 45.67 EUR · 2026-08-28' } }],
      usage: {},
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'apaga' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/Continente/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(confirmPending).not.toHaveBeenCalled();
  });

  it('confirmar executa a accao pendente', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente' } }],
      usage: {},
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'apaga' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(confirmPending).toHaveBeenCalledTimes(1));
    expect(confirmPending.mock.calls[0][0]).toEqual({ name: 'delete_expense', args: { id: 'e1' } });
  });

  it('cancelar descarta a accao pendente sem executar', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente' } }],
      usage: {},
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'apaga' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /confirmar/i })).toBeNull());
    expect(confirmPending).not.toHaveBeenCalled();
  });

  it('mostra o custo estimado do pedido', async () => {
    runAssistant.mockResolvedValue({
      text: 'ok', applied: [], pending: [],
      usage: { prompt_tokens: 5000, completion_tokens: 600 },
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/EUR/)).toBeInTheDocument());
  });

  it('mostra o erro quando o pedido falha', async () => {
    runAssistant.mockRejectedValue(new Error('Sem creditos no OpenRouter.'));
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/Sem creditos/)).toBeInTheDocument());
  });
});
```

> `renderWithStore(node, { fixture, tab, openModal, payload, preview })` é **assíncrono** e abre o modal indicado por `openModal` — daí o `await openSheet()`. Ver `src/test/renderWithStore.jsx`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modals/assistant.test.jsx`
Expected: FAIL — `src/modals/AssistantSheet.jsx` não existe.

- [ ] **Step 3: Register the modal key**

Em `src/store/ui.jsx`, dentro do array `MODALS`, acrescentar depois de `'settle'`:

```js
  'assistant',    // chat do assistente de IA
```

Em `src/components/Shell.jsx`, dentro de `MODAL_COMPONENTS`, acrescentar depois de `settle`:

```js
  assistant: lazy(() => import('../modals/AssistantSheet.jsx')),
```

- [ ] **Step 4: Write the implementation**

Criar `src/modals/AssistantSheet.jsx`:

```jsx
/* ════════════════════════════════════════════════════════════════════════
   AssistantSheet — chat do assistente, aberto a partir das Quick Actions.

   Escrever em linguagem natural ("gastei 12 no Pingo Doce", "quanto gastei em
   restaurantes este mes?"). As criações aplicam-se logo, com Anular no cartão
   da resposta; apagar e editar mostram um cartão de confirmação antes de
   tocarem nos dados.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback, useRef } from 'react';
import Sheet from '../components/Sheet.jsx';
import { PrimaryButton, SecondaryButton } from '../components/Buttons.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { renderMD } from '../lib/markdown.js';
import { buildAIContext } from '../lib/ai.js';
import { runAssistant, confirmPending, estimateCost, ASSISTANT_SYSTEM } from '../lib/aiChat.js';

// Guarda o estado anterior das slices tocadas, para o Anular repor.
function snapshotSlices(state) {
  return {
    addedExp: state.addedExp,
    incomes: state.incomes,
    goals: state.goals,
    recurring: state.recurring,
    bdg: state.bdg,
    rules: state.rules,
    dynAccts: state.dynAccts,
    dynSnaps: state.dynSnaps,
    people: state.people,
    groups: state.groups,
    groupEntries: state.groupEntries,
  };
}

export default function AssistantSheet() {
  const { isOpen, close } = useModal('assistant');
  const { actions } = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]); // {cmd, text, applied, pending, error, undo}
  const historyRef = useRef([]);

  const send = useCallback(() => {
    const cmd = text.trim();
    if (!cmd || busy) return;
    setBusy(true);
    const before = snapshotSlices(actions.getState());
    runAssistant(cmd, {
      state: actions.getState(),
      actions,
      history: historyRef.current,
      systemPrompt:
        ASSISTANT_SYSTEM + '\n\nCONTEXTO:\n' + JSON.stringify(buildAIContext(actions.getState())),
    })
      .then((res) => {
        historyRef.current = (res.messages || []).filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content));
        setTurns((t) => [
          ...t,
          {
            cmd,
            text: res.text,
            applied: res.applied || [],
            pending: res.pending || [],
            usage: res.usage,
            undo: (res.applied || []).length ? before : null,
          },
        ]);
        setText('');
      })
      .catch((err) => {
        setTurns((t) => [...t, { cmd, error: (err && err.message) || 'Falha no assistente.' }]);
      })
      .finally(() => setBusy(false));
  }, [text, busy, actions]);

  const undo = useCallback(
    (idx) => {
      const snap = turns[idx] && turns[idx].undo;
      if (!snap) return;
      actions.patch(snap);
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, undo: null, applied: [] } : x)));
      toast('Anulado', 'success');
    },
    [turns, actions, toast]
  );

  const confirm = useCallback(
    (turnIdx, pendIdx) => {
      const p = turns[turnIdx].pending[pendIdx];
      const r = confirmPending({ name: p.name, args: p.args }, { state: actions.getState(), actions });
      if (r && r.ok) toast('Feito', 'success');
      else toast('Nao foi possivel concluir', 'error');
      setTurns((t) =>
        t.map((x, i) => (i === turnIdx ? { ...x, pending: x.pending.filter((_, j) => j !== pendIdx) } : x))
      );
    },
    [turns, actions, toast]
  );

  const cancel = useCallback((turnIdx, pendIdx) => {
    setTurns((t) =>
      t.map((x, i) => (i === turnIdx ? { ...x, pending: x.pending.filter((_, j) => j !== pendIdx) } : x))
    );
  }, []);

  return (
    <Sheet open={isOpen} onClose={close} title="Assistente">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {turns.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ alignSelf: 'flex-end', background: 'var(--bg3)', borderRadius: 12, padding: '8px 12px', fontSize: 13 }}>
              {t.cmd}
            </div>
            {t.error ? (
              <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{t.error}</div>
            ) : (
              <div style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: renderMD(t.text) }} />
            )}
            {(t.pending || []).map((p, j) => (
              <div key={j} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                  {p.preview.action === 'delete' ? 'Apagar' : 'Alterar'} {p.preview.kind}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.preview.label}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <PrimaryButton onClick={() => confirm(i, j)}>Confirmar</PrimaryButton>
                  <SecondaryButton onClick={() => cancel(i, j)}>Cancelar</SecondaryButton>
                </div>
              </div>
            ))}
            {t.undo && (
              <SecondaryButton onClick={() => undo(i)} style={{ alignSelf: 'flex-start' }}>
                Anular
              </SecondaryButton>
            )}
            {t.usage ? (
              <div className="lb" style={{ fontSize: 10, color: 'var(--text3)' }}>
                {estimateCost(t.usage).toFixed(4).replace('.', ',')} EUR
              </div>
            ) : null}
          </div>
        ))}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pergunta ou regista… (ex: gastei 12 no Pingo Doce)"
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
        />
        <PrimaryButton onClick={send} disabled={busy}>
          {busy ? 'A pensar…' : 'Enviar'}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
```

> Os botões vêm de `components/Buttons.jsx` (`PrimaryButton`/`SecondaryButton`) — confirmar que aceitam `disabled` e `style`; se `SecondaryButton` não aceitar `disabled`, acrescentar a prop lá, a acompanhar a assinatura de `PrimaryButton`. As restantes classes (`lb`, `cd`) estão em `src/styles/tokens.css` — ver §6 do `STORE_API.md`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modals/assistant.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the modal render suite**

Run: `npx vitest run src/modals/modals.render.test.jsx src/components/shell.nav.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modals/AssistantSheet.jsx src/modals/assistant.test.jsx src/store/ui.jsx src/components/Shell.jsx
git commit -m "feat(ia): sheet do assistente com confirmacao e anular

Criacoes aplicam logo e ficam com Anular no cartao da resposta; apagar e
editar so escrevem depois de Confirmar."
```

---

### Task 11: Botão do assistente nas Quick Actions

**Files:**
- Modify: `src/components/QuickActions.jsx`
- Test: `src/components/quickActions.test.jsx` (criar)

**Interfaces:**
- Consumes: chave de modal `'assistant'` da Task 10.
- Produces: nenhuma API nova; a fila passa a ter cinco botões.

- [ ] **Step 1: Write the failing test**

Criar `src/components/quickActions.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UIProvider, useUI } from '../store/ui.jsx';
import QuickActions from './QuickActions.jsx';

function Probe({ onState }) {
  const ui = useUI();
  onState(ui);
  return null;
}

describe('QuickActions', () => {
  it('mostra os cinco botoes, incluindo o assistente', () => {
    render(<UIProvider><QuickActions /></UIProvider>);
    ['Saldo', 'Despesa', 'Receita', 'IA', 'Mais'].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('o botao IA abre o modal assistant', () => {
    const seen = vi.fn();
    render(
      <UIProvider>
        <QuickActions />
        <Probe onState={seen} />
      </UIProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'IA' }));
    const last = seen.mock.calls[seen.mock.calls.length - 1][0];
    expect(last.modals.assistant).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/quickActions.test.jsx`
Expected: FAIL — não existe botão com o nome acessível "IA".

- [ ] **Step 3: Write the implementation**

Em `src/components/QuickActions.jsx`, acrescentar a ação e reduzir o círculo para os cinco botões caberem:

```js
const ACTIONS = [
  { key: 'balanceUpdate', label: 'Saldo', icon: 'balance', color: 'var(--primary)' },
  { key: 'add', label: 'Despesa', icon: 'expense', color: 'var(--danger)' },
  { key: 'income', label: 'Receita', icon: 'income', color: 'var(--success)' },
  { key: 'assistant', label: 'IA', icon: 'sparkle', color: 'var(--blue)' },
  { key: 'more', label: 'Mais', icon: 'dots', color: 'var(--secondary)' },
];
```

E no `<span>` do círculo, trocar `width: 54, height: 54` por `width: 48, height: 48`, e `<Icon name={a.icon} size={24} />` por `size={22}`.

Se `components/Icon.jsx` não tiver um ícone `sparkle`, acrescentar um (SVG inline, sem emoji, a acompanhar o estilo dos existentes):

```jsx
sparkle: (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z" />
  </svg>
),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/quickActions.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the overview render suite**

Run: `npx vitest run src/views/views.render.test.jsx src/test/flows.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/QuickActions.jsx src/components/Icon.jsx src/components/quickActions.test.jsx
git commit -m "feat(ia): botao do assistente nas Quick Actions

Quinto botao na fila do Resumo; circulos passam de 54 para 48px para os
cinco caberem na largura."
```

---

### Task 12: `AIView` passa a usar o motor de tool-calling

O chat do separador "Assistente IA" deixa de montar o seu próprio blob JSON e reutiliza `runAssistant`. O painel de import de documentos fica como está.

**Files:**
- Modify: `src/views/AIView.jsx` (substituir `sendAI` e `buildAIContextLocal`)
- Test: `src/views/aiView.chat.test.jsx` (criar)

**Interfaces:**
- Consumes: `runAssistant`, `confirmPending` de `lib/aiChat.js`; `buildAIContext` de `lib/ai.js`.
- Produces: entradas de `aiHistory` com a forma `{ date, cmd, analysis?, actions?, msg?, err?, mode: 'chat' }`.

- [ ] **Step 1: Write the failing test**

Criar `src/views/aiView.chat.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

const runAssistant = vi.fn();
vi.mock('../lib/aiChat.js', () => ({
  runAssistant: (...a) => runAssistant(...a),
  confirmPending: vi.fn(() => ({ ok: true, data: {} })),
  estimateCost: () => 0,
  ASSISTANT_SYSTEM: 'sistema-de-teste',
  MAX_ROUNDS: 4,
}));

import AIView from './AIView.jsx';

beforeEach(() => runAssistant.mockReset());

describe('AIView — chat', () => {
  it('envia o comando pelo runAssistant e guarda no historico', async () => {
    runAssistant.mockResolvedValue({ text: 'Gastaste 45,20 EUR.', applied: [], pending: [], usage: {} });
    renderWithStore(<AIView />);
    const box = screen.getByPlaceholderText(/pergunta|regista|comando/i);
    fireEvent.change(box, { target: { value: 'quanto gastei em supermercado?' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(runAssistant).toHaveBeenCalledTimes(1));
    expect(runAssistant.mock.calls[0][0]).toBe('quanto gastei em supermercado?');
    await waitFor(() => expect(screen.getByText(/45,20/)).toBeInTheDocument());
  });

  it('mostra o erro sem rebentar a view', async () => {
    runAssistant.mockRejectedValue(new Error('Demasiados pedidos. Tenta daqui a pouco.'));
    renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/Demasiados pedidos/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/aiView.chat.test.jsx`
Expected: FAIL — `AIView` ainda chama `callAIRaw` diretamente e não usa `runAssistant`.

- [ ] **Step 3: Write the implementation**

Em `src/views/AIView.jsx`:

1. Remover o import de `callAIRaw` e a função local `buildAIContextLocal`, e importar em vez disso:

```js
import { runAssistant, confirmPending, ASSISTANT_SYSTEM } from '../lib/aiChat.js';
import { buildAIContext } from '../lib/ai.js';
```

2. Substituir toda a `sendAI` (o `useCallback` inteiro, do `const sendAI` até às dependências) por:

```js
  /* sendAI — o chat passa a usar o motor de tool-calling partilhado com a
     AssistantSheet. O AIView já não monta prompts nem aplica ações à mão. */
  const sendAI = useCallback(() => {
    const cmd = chat.trim();
    if (!cmd || aiLoading) return;
    setAiLoading(true);
    const st = actions.getState();
    runAssistant(cmd, {
      state: st,
      actions,
      systemPrompt: ASSISTANT_SYSTEM + '\n\nCONTEXTO:\n' + JSON.stringify(buildAIContext(st)),
    })
      .then((res) => {
        actions.pushAiHistory({
          date: new Date().toLocaleString('pt-PT'),
          cmd,
          analysis: res.text,
          actions: res.applied.map((a) => ({ type: a.name, ...a.args })),
          pending: res.pending.map((p) => ({ name: p.name, args: p.args, preview: p.preview })),
          ok: true,
          mode: 'chat',
        });
        setChat('');
      })
      .catch((err) => {
        actions.pushAiHistory({
          date: new Date().toLocaleString('pt-PT'),
          cmd,
          err: (err && err.message) || 'Falha no assistente.',
        });
      })
      .finally(() => setAiLoading(false));
  }, [chat, aiLoading, actions]);
```

3. `ASSISTANT_SYSTEM` já é exportado de `lib/aiChat.js` (Task 7) e já é usado pela `AssistantSheet` — aqui basta importá-lo:

```js
import { runAssistant, confirmPending, ASSISTANT_SYSTEM } from '../lib/aiChat.js';
```

4. No painel de histórico do `AIView`, as entradas com `mode: 'chat'` renderizam como as de `mode: 'analysis'` (texto por `renderMD`). Se o ramo de render testar `entry.mode === 'analysis'`, passar a testar `entry.analysis` (presença do campo), que cobre os dois.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/aiView.chat.test.jsx src/modals/assistant.test.jsx`
Expected: PASS nos dois.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: verde.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/views/AIView.jsx src/views/aiView.chat.test.jsx
git commit -m "refactor(ia): AIView usa o motor de tool-calling

O chat deixa de montar prompts e de aplicar accoes a mao; passa por
runAssistant, tal como a sheet. System prompt fica num sitio so."
```

---

### Task 13: Configuração, verificação em preview e documentação

**Files:**
- Modify: `testes.html` (secção do assistente)
- Modify: `docs/superpowers/specs/2026-08-30-assistente-ia-openrouter-design.md` (marcar como implementado)

**Interfaces:**
- Consumes: tudo o que foi construído nas Tasks 1-12.
- Produces: ambiente configurado e documentação atualizada.

- [ ] **Step 1: Configure the OpenRouter key on Vercel**

Correr, e colar a key quando for pedida:

```bash
vercel env add OPENROUTER_API_KEY production
vercel env add OPENROUTER_API_KEY preview
```

Confirmar:

```bash
vercel env ls
```

Expected: `OPENROUTER_API_KEY` listada em Production e Preview, além de `ALLOWED_EMAILS`, `ANTHROPIC_API_KEY` e `FIREBASE_SERVICE_ACCOUNT`.

- [ ] **Step 2: Deploy to preview**

```bash
vercel deploy
```

Expected: URL de preview. Guardar a URL para o passo seguinte.

- [ ] **Step 3: Verify by hand in preview**

Abrir a URL de preview, iniciar sessão com o email da allowlist e verificar, um a um:

1. Resumo mostra cinco botões nas Quick Actions; o botão IA abre a sheet.
2. "gastei 12,50 no Pingo Doce hoje" → despesa criada, com Anular no cartão.
3. Clicar em Anular → a despesa desaparece da lista de Despesas.
4. "quanto gastei em restaurantes este mês?" → resposta com valores, sem criar nada.
5. "apaga a despesa do Pingo Doce" → cartão de confirmação; **Cancelar** não apaga; repetir e **Confirmar** apaga.
6. Menu Mais → Assistente IA → import de um PDF de extrato continua a funcionar.
7. Atualizar saldo por print de ecrã continua a funcionar.
8. Sessão com um email fora de `ALLOWED_EMAILS` → mensagem "Sem acesso ao assistente".

Registar qualquer falha e corrigir antes de promover.

- [ ] **Step 4: Promote to production**

```bash
vercel deploy --prod
```

Depois abrir a app com hard reload (Cmd+Shift+R) — o service worker guarda a versão anterior.

- [ ] **Step 5: Remove the Anthropic key**

Só depois de produção validada:

```bash
vercel env rm ANTHROPIC_API_KEY production
```

- [ ] **Step 6: Update `testes.html`**

Acrescentar uma secção "Assistente IA (OpenRouter)" com os casos do Step 3 como checklist de QA, e as notas de segurança: a key vive só no servidor, o proxy exige ID-token Firebase e email verificado na allowlist, o cliente não escolhe o modelo, e ações destrutivas exigem confirmação explícita do utilizador.

- [ ] **Step 7: Mark the spec as implemented**

Em `docs/superpowers/specs/2026-08-30-assistente-ia-openrouter-design.md`, mudar a linha `**Estado:**` para `implementado (2026-XX-XX)` com a data real.

- [ ] **Step 8: Commit and push**

```bash
git add testes.html docs/superpowers/specs/2026-08-30-assistente-ia-openrouter-design.md
git commit -m "docs(ia): QA do assistente e spec marcada como implementada"
git push origin react
```

---

## Notas para quem implementa

- **Ordem importa nas Tasks 3-6:** todas mexem no mesmo ficheiro `src/lib/aiTools.js` e no mesmo ficheiro de teste. Executar em sequência, não em paralelo.
- **Tasks 1, 2 e 9 são independentes** entre si e das restantes; podem ser feitas em qualquer ordem antes da Task 7.
- **Ler antes de escrever:** `src/lib/split.js` (formato de `shares` e de `simplifyDebts`), `src/store/store.jsx` (`addGroupEntry`, `reflectExpenseFor`), `src/modals/GroupSheet.jsx` (padrão de estilo das sheets) e `src/test/renderWithStore.jsx` (helper de render). Os blocos de código deste plano assumem estas formas; se divergirem, ganha o código que já está no repositório.
- **Se um teste deste plano estiver errado quanto ao repositório, corrigir o teste — não dobrar o código para o satisfazer.** O que interessa é o comportamento descrito na spec.
