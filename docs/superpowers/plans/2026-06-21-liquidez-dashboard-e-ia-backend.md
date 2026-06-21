# Liquidez no Dashboard + IA via Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Mostrar Liquidez (em destaque) e Investimentos no topo do Resumo; (B) tirar a API key da Anthropic do cliente, chamando a IA por uma função Vercel autenticada com token Firebase.

**Architecture:** (A) cartão novo no topo do `OverviewView`, alimentado pelos totais por categoria que `compute()` já devolve (`C.cT`). (B) função serverless `api/ai.js` no mesmo deploy Vercel guarda `ANTHROPIC_API_KEY`; verifica o ID-token Firebase do utilizador (firebase-admin) e faz proxy para a Anthropic. O cliente (`lib/ai.js`) passa a enviar o token em vez da key; o campo da key sai das Definições e deixa de ser persistido.

**Tech Stack:** React + Vite, Firebase Auth/Firestore, Vercel Serverless Functions (Node), firebase-admin, fetch para a Anthropic. Testes: vitest.

**As duas partes são independentes** — podem ser implementadas e deployadas em separado. A é pequena; B é multi-passo e exige config tua (env vars + service account).

---

## Decisões já tomadas (B)

- Infra: **Vercel Serverless Function** (`/api/ai`).
- Auth do proxy: **verificar ID-token Firebase** (firebase-admin).
- Campo da API key nas Definições: **remover** (key só no servidor).

## Pré-requisitos do utilizador (B) — fazer no painel, não no código

1. Firebase Console → Project settings → Service accounts → **Generate new private key** → guarda o JSON.
2. Vercel → Project → Settings → Environment Variables, adicionar:
   - `ANTHROPIC_API_KEY` = a nova key `sk-ant-…`.
   - `FIREBASE_SERVICE_ACCOUNT` = o JSON da service account **numa linha** (ou base64).
3. Redeploy após adicionar as env vars.

---

# Parte A — Liquidez/Investimentos no topo do Resumo

### Task A1: Cartão de Liquidez + Investimentos no topo do OverviewView

**Files:**
- Modify: `src/views/OverviewView.jsx` (inserir após `<QuickActions />`, antes do "Monthly summary card")

`compute(s)` já devolve `C.cT` (totais por categoria: `'Liquidez'`, `'Poupanca'`, `'Investimentos'`, `'Cripto'`, …). Liquidez = `Liquidez` + `Poupanca` (dinheiro disponível/quase-disponível); Investimentos = `Investimentos` + `Cripto`.

- [ ] **Step 1: Calcular os totais (perto das outras derivações, ~linha 156)**

Adiciona depois de `const cats = Object.keys(C.grp);`:

```jsx
  // Liquidez (disponível) vs Investimentos — destaque no topo (o utilizador quer
  // ver a liquidez, não o detalhe de ativos).
  const liquidez = (C.cT['Liquidez'] || 0) + (C.cT['Poupanca'] || 0);
  const investimentos = (C.cT['Investimentos'] || 0) + (C.cT['Cripto'] || 0);
```

- [ ] **Step 2: Inserir o cartão logo a seguir a `<QuickActions />`**

Substitui:

```jsx
      {/* ── Quick actions (Finany-style) ── */}
      <QuickActions />
```

por:

```jsx
      {/* ── Quick actions (Finany-style) ── */}
      <QuickActions />

      {/* ── Liquidez em destaque + Investimentos (topo, sempre visível) ── */}
      {!newU && (liquidez > 0 || investimentos > 0) && (
        <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
          <div className="lb" style={{ marginBottom: 12 }}>Disponível</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <span className="m" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fc(liquidez)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>liquidez</span>
          </div>
          <div className="rw" style={{ marginTop: 14, gap: 10 }}>
            <div style={{ flex: 1, background: 'var(--blue-soft)', borderRadius: 14, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Liquidez</div>
              <div className="m" style={{ fontSize: 16, fontWeight: 600, marginTop: 3 }}>{fc(liquidez)}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--elevated)', borderRadius: 14, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Investimentos</div>
              <div className="m" style={{ fontSize: 16, fontWeight: 600, marginTop: 3, color: 'var(--secondary)' }}>{fc(investimentos)}</div>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Build + verificar visual**

Run: `npm run build` → Expected: build ok.
Verificação manual: abrir o Resumo → o cartão "Disponível" aparece logo abaixo das quick actions, com a liquidez grande e os dois tiles (Liquidez / Investimentos). O acordeão de contas continua em baixo.

- [ ] **Step 4: Atualizar testes.html (regra do projeto)**

Em `testes.html`, no grupo `T8` (Resumo & património), adicionar:

```js
    { id: 'T8.4', title: 'Liquidez em destaque no topo', steps: ['Abrir Resumo'], expect: 'Logo abaixo das quick actions aparece o cartão "Disponível" com a liquidez (Liquidez+Poupança) em grande e os tiles Liquidez/Investimentos. Acordeão de contas mantém-se em baixo.' },
```

- [ ] **Step 5: Commit + deploy**

```bash
git add src/views/OverviewView.jsx testes.html
git commit -m "feat(resumo): cartao Liquidez/Investimentos em destaque no topo"
git push origin react
# deploy: snapshot react -> main
git checkout -B main origin/main && git read-tree -u --reset react && npm run build && git commit -m "deploy: sync main<-react (liquidez no topo)" && git push origin main && git checkout react
```

---

# Parte B — IA via função Vercel (key fora do cliente)

### Task B1: Função serverless `api/ai.js`

**Files:**
- Create: `api/ai.js`
- Modify: `package.json` (adicionar `firebase-admin`)

- [ ] **Step 1: Instalar firebase-admin**

Run: `npm install firebase-admin`
Expected: adiciona a dependência em `package.json`.

- [ ] **Step 2: Criar `api/ai.js`**

```js
// Vercel Serverless Function — proxy autenticado para a Anthropic.
// A key vive só aqui (env ANTHROPIC_API_KEY). Verifica o ID-token Firebase
// (env FIREBASE_SERVICE_ACCOUNT = JSON da service account) antes de chamar.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function admin() {
  if (!getApps().length) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    initializeApp({ credential: cert(svc) });
  }
  return getAuth();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sem token' });
    await admin().verifyIdToken(token); // lança se inválido

    const { content, system, model, max_tokens } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Sem content' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5',
        max_tokens: max_tokens || 1024,
        system: system || undefined,
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(401).json({ error: 'Auth falhou: ' + (e && e.message ? e.message : 'erro') });
  }
}
```

- [ ] **Step 3: Garantir que o Vercel não ignora `/api`**

Confirmar `vercel.json` (não precisa de mudança — funções em `/api` são detetadas com framework Vite). Não adicionar `rewrites` que apanhem `/api/*`.

- [ ] **Step 4: Commit**

```bash
git add api/ai.js package.json package-lock.json
git commit -m "feat(ai): funcao Vercel /api/ai (proxy Anthropic autenticado por token Firebase)"
```

### Task B2: Cliente chama a função com o ID-token

**Files:**
- Modify: `src/firebase/client.js` (exportar helper de token)
- Modify: `src/lib/ai.js:80-…` (callAI usa `/api/ai` + token)

- [ ] **Step 1: Exportar `getIdToken` em `client.js`**

Adicionar perto dos auth helpers:

```js
export function getIdToken() {
  const u = auth && auth.currentUser;
  if (!u) return Promise.resolve(null);
  return u.getIdToken().catch(() => null);
}
```

- [ ] **Step 2: Reescrever `callAI` em `src/lib/ai.js`**

Substituir o corpo de `callAI(content, system, apiKey, onResult)` (o `apiKey` deixa de ser usado — manter na assinatura para não mexer nos 7 call sites):

```js
import { getIdToken } from '../firebase/client.js';

// callAI(content, system, _ignoredApiKey, onResult)
export function callAI(content, system, _apiKey, onResult) {
  getIdToken().then((token) => {
    if (!token) {
      onResult({ error: 'Precisas de iniciar sessão para usar a IA.' });
      return;
    }
    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ content, system, model: MODEL, max_tokens: 1024 }),
    })
      .then((r) => r.json())
      .then((data) => onResult(data))
      .catch((err) => onResult({ error: String(err && err.message ? err.message : err) }));
  });
}
```

Nota: manter `MODEL` e qualquer parsing de resposta que os call sites esperam (a forma do JSON da Anthropic é a mesma — a função faz passthrough).

- [ ] **Step 3: Build**

Run: `npm run build` → Expected: build ok (sem referências a `x-api-key`/`API_URL` no cliente — remover constantes mortas `API_URL`/`x-api-key`).

- [ ] **Step 4: Commit**

```bash
git add src/firebase/client.js src/lib/ai.js
git commit -m "feat(ai): cliente chama /api/ai com ID-token (sem key no browser)"
```

### Task B3: Remover o campo da API key e parar de a persistir

**Files:**
- Modify: `src/modals/SettingsSheet.jsx` (remover input/save/test/remove da key)
- Modify: `src/store/store.jsx` (tirar `apiKey` de `PERSISTED_KEYS`, `buildPersistPayload`, `hydrateFromDoc`, `initialPersisted`)
- Modify: `src/modals/SettingsSheet.jsx` `exportData` (não exportar `apiKey`)
- Modify: `src/modals/BalanceUpdateSheet.jsx` e `src/modals/ImportStatementSheet.jsx` (gates de `state.apiKey` → gate de sessão iniciada)

- [ ] **Step 1: Tirar `apiKey` da persistência (store.jsx)**

Remover `'apiKey'` de `PERSISTED_KEYS`; em `buildPersistPayload` e `hydrateFromDoc` remover a linha `apiKey: …`; em `initialPersisted` remover `apiKey: ''`. (A key deixa de ir para o Firestore.)

- [ ] **Step 2: Remover a UI da key (SettingsSheet.jsx)**

Apagar a secção do input da API key (label, input `id="ki"`, botões Ver/Guardar/Remover/testar) e as funções `onSaveKey`/`onRemoveKey`/`testAPI` e estados `keyInput`/`keyVisible`/`testResult`. Em `exportData`, remover `apiKey: state.apiKey`.

- [ ] **Step 3: Trocar gates de `state.apiKey` por sessão**

Em `BalanceUpdateSheet.jsx` (linhas ~140-149) e `ImportStatementSheet.jsx`, onde verifica `!state.apiKey` para mostrar "sem API key", trocar por `!currentUser` (precisa de sessão). Os botões Câmara/Ficheiro passam a `disabled={!currentUser}`.

- [ ] **Step 4: Build + testes**

Run: `npm run build && npx vitest run` → Expected: build ok, testes passam (ajustar/remover qualquer teste que referencie `apiKey` na persistência, se existir).

- [ ] **Step 5: Atualizar testes.html**

No grupo de segurança/definições: remover/ajustar T sobre a key; no `SECURITY` (tab Segurança) mudar o estado das 2 entradas CRIT da API key de "Recomendação" para "Corrigido" (key fora do cliente). No grupo funcional, ajustar T6.2 ("Atualizar manual (sem API key)") para "precisa de sessão".

- [ ] **Step 6: Commit + deploy + verificação manual**

```bash
git add -A
git commit -m "security(ai): remover API key do cliente (so no servidor via /api/ai)"
git push origin react
git checkout -B main origin/main && git read-tree -u --reset react && npm run build && git commit -m "deploy: sync main<-react (IA via backend, key fora do cliente)" && git push origin main && git checkout react
```

Verificação manual (após configurares as env vars no Vercel + redeploy):
1. Login → abrir Importar extrato / AIView → a IA responde (a chamada vai a `/api/ai`, ver no Network: sem `x-api-key`, com `Authorization: Bearer`).
2. Definições → já não há campo de API key.
3. Sem sessão → IA indisponível com mensagem clara.

---

## Self-review

- **Cobertura:** A (dashboard liquidez) ✓ Task A1. B (proxy ✓ B1, cliente ✓ B2, remover key ✓ B3).
- **Sem placeholders:** código real em cada passo.
- **Consistência de tipos:** `callAI(content, system, _apiKey, onResult)` mantém a assinatura → os 7 call sites não mudam. `getIdToken()` definido em B2/Step1 e usado em B2/Step2. `/api/ai` body `{content, system, model, max_tokens}` igual no cliente e na função.
- **Risco conhecido:** a função `/api/ai` não pode ser testada localmente sem as env vars; verificação é manual pós-deploy. firebase-admin só corre no servidor (não entra no bundle do cliente).
