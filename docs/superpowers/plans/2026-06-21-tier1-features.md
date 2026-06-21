# Tier-1 Features Implementation Plan (Net Worth · Relatórios · Orçamentos · Lembretes+Push iPhone)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Adicionar 4 funcionalidades de topo + notificações Web Push reais no iPhone.

**Architecture:** Maioria é client-side (React + dados já no Firestore). Os Lembretes em tempo real usam Web Push (service worker + PushManager + VAPID) com um Vercel Cron a enviar via `web-push`. Cada fase é independente e deployável; ordem = ROI/risco.

**Tech Stack:** React+Vite, Firebase, Vercel (functions + cron), web-push (VAPID), Notifications/Push API + Service Worker.

**Fases (cada uma deployável):** 1 Net worth timeline (S) → 2 Relatórios do mês (M) → 3 Orçamentos com rollover+alertas (M) → 4 Lembretes + Web Push iPhone (L, requer config).

---

## Fase 1 — Net worth timeline

**Files:** Modify `src/views/ChartsView.jsx` (ou novo `src/views/NetWorthView.jsx`), `src/lib/finance.js` (helper).

- [ ] **1.1 Helper série de património** — em finance.js:
```js
// Série mensal de património (ativos − dívida) a partir dos snapshots.
export function netWorthSeries(state) {
  const snaps = getAllHist(state); // já existe; {l, liq, poup, inv, div}
  return snaps.map((s) => ({
    label: s.l,
    assets: (s.liq || 0) + (s.poup || 0) + (s.inv || 0),
    debt: s.div || 0,
    net: (s.liq || 0) + (s.poup || 0) + (s.inv || 0) - (s.div || 0),
  }));
}
```
- [ ] **1.2 Teste** finance.test.js: `netWorthSeries({dynSnaps:[{l:'x',liq:100,poup:0,inv:0,div:40}], currentUser:{}}) → net=60`.
- [ ] **1.3 UI** em ChartsView: secção "Património" com `chrt(serie.map(p=>p.net), 'var(--primary)', 'Património', serie)` + variação (último − primeiro) e tabela curta (3 pontos). Reusa o `chrt` existente.
- [ ] **1.4 Máscara** — respeitar `state.balancesHidden` (mostrar •••• como no Resumo).
- [ ] **1.5 testes.html** grupo T7.5; build+commit+deploy.

## Fase 2 — Relatórios & insights do mês

**Files:** `src/views/ReportView.jsx` (novo), `src/lib/reports.js` (novo), `src/components/Shell.jsx` (rota+nav "Mais"), `src/lib/reports.test.js`.

- [ ] **2.1 lib/reports.js** — funções puras:
```js
// Total por categoria num mês (YYYY-MM), só addedExp datadas nesse mês.
export function categoryTotals(addedExp, ym) {
  const out = {};
  (addedExp || []).forEach((x) => {
    if ((x.date || '').slice(0, 7) !== ym) return;
    out[x.cat] = (out[x.cat] || 0) + (Number(x.amount) || 0);
  });
  return out; // { cat: total }
}
// Variação por categoria vs mês anterior. Devolve [{cat, cur, prev, delta, pct}] desc por cur.
export function monthComparison(addedExp, ym, prevYm) { /* usa categoryTotals; ordena */ }
```
- [ ] **2.2 Testes** reports.test.js para categoryTotals + monthComparison (datas fixas).
- [ ] **2.3 ReportView** — seletor de mês; top categorias (barras), variação vs mês anterior (▲/▼ + %), maiores despesas (top 5 addedExp), total do mês. Cores via tokens. Estados vazios.
- [ ] **2.4 Nav** — adicionar "Relatórios" ao menu "Mais" (Shell VIEWS + MoreMenu) e lazy import.
- [ ] **2.5 testes.html** grupo novo T16; build+commit+deploy.

## Fase 3 — Orçamentos mensais com rollover + alertas

Conceito: cada categoria (`bdg[i]`) já tem `lm` (limite). Adicionar **rollover**: o que sobra/falta de um mês soma ao limite efetivo do mês seguinte. Persistir o estado por mês.

**Files:** `src/lib/budget.js` (novo), `src/store/store.jsx` (campo `budgetRollover` opcional + flag `rolloverOn`), `src/views/ExpensesView.jsx` (mostrar limite efetivo + alerta), `src/lib/budget.test.js`.

- [ ] **3.1 lib/budget.js**:
```js
// Limite efetivo do mês = limite base + saldo acumulado (sobra/falta) dos meses anteriores.
// gastos: {ym: {cat: total}} (de reports.categoryTotals por mês). bdg: [{id, lm}].
export function effectiveLimits(bdg, gastosPorMes, ymsOrdenados, rolloverOn) {
  const carry = {}; // cat -> saldo acumulado
  const result = {}; // ym -> { cat: {base, eff, spent, rem} }
  ymsOrdenados.forEach((ym) => {
    const g = gastosPorMes[ym] || {};
    result[ym] = {};
    bdg.forEach((b) => {
      const base = b.lm || 0;
      const eff = rolloverOn ? base + (carry[b.id] || 0) : base;
      const spent = g[b.id] || 0;
      const rem = eff - spent;
      result[ym][b.id] = { base, eff, spent, rem };
      if (rolloverOn) carry[b.id] = rem; // sobra (+) ou falta (−) transita
    });
  });
  return result;
}
```
- [ ] **3.2 Testes** budget.test.js: 2 meses, rollover on → mês 2 eff = lm + sobra do mês 1; off → eff = lm.
- [ ] **3.3 Store** — flag `rolloverOn` (persistida, default false) + ação `setRolloverOn`. Adicionar a PERSISTED_KEYS/initialPersisted/build/hydrate.
- [ ] **3.4 UI ExpensesView** — nas barras de categoria usar o limite EFETIVO do mês selecionado (não `b.lm`); badge "+X transitado" quando rollover; **alerta** visual quando `spent > eff` (já há cor de over) + chip "Ultrapassado". Toggle "Rollover" nas Definições/orçamento.
- [ ] **3.5 testes.html** T17; build+commit+deploy.

## Fase 4 — Lembretes de contas + Web Push no iPhone

**Pré-requisitos do utilizador (config):**
1. Gerar chaves VAPID: `npx web-push generate-vapid-keys` → guarda public + private.
2. Vercel env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:teu@email). (Reusa `FIREBASE_SERVICE_ACCOUNT` já configurado.)
3. A push real no iPhone **só funciona com a app instalada no ecrã principal** (iOS 16.4+).

**Files:** `public/sw.js` (service worker, novo), `src/lib/push.js` (novo), `api/push-subscribe.js` (guardar subscription), `api/cron-bills.js` (envia pushes), `vercel.json` (cron), `src/components/Shell.jsx` ou Settings (botão "Ativar notificações"), `package.json` (+web-push).

- [ ] **4.1 Service worker** `public/sw.js`:
```js
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'Proof. Finance', {
    body: d.body || '', icon: '/icon.svg', badge: '/icon.svg', data: d.url || '/',
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data || '/'));
});
```
- [ ] **4.2 Registo + subscrição** `src/lib/push.js`:
```js
export async function enablePush(vapidPublicKey, idToken) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Sem suporte');
  const reg = await navigator.serviceWorker.register('/sw.js');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão negada');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  await fetch('/api/push-subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken }, body: JSON.stringify({ subscription: sub }) });
}
// urlBase64ToUint8Array: helper standard (incluir).
```
- [ ] **4.3 Guardar subscription** `api/push-subscribe.js` — verifica ID-token Firebase (como /api/ai), grava `subscription` no doc `users/{uid}` (campo `pushSub`). Reusa o padrão firebase-admin de api/ai.js.
- [ ] **4.4 Cron diário** `api/cron-bills.js` — protegido por `CRON_SECRET` (header) OU Vercel Cron. Lê todos os users, calcula recorrentes/leituras a vencer nos próximos 3 dias (a partir de `recurring[].day` vs hoje), e envia Web Push via `web-push` (setVapidDetails). Mensagem: "Netflix (9,99€) vence em 3 dias".
```js
import webpush from 'web-push';
webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
// para cada user com pushSub + recorrente a vencer: webpush.sendNotification(sub, JSON.stringify({title, body, url}))
```
- [ ] **4.5 vercel.json cron**:
```json
{ "crons": [ { "path": "/api/cron-bills", "schedule": "0 9 * * *" } ] }
```
- [ ] **4.6 UI** — Definições: botão "Ativar notificações de contas" → `enablePush(VAPID_PUBLIC, idToken)` (VAPID public exposta via `import.meta.env.VITE_VAPID_PUBLIC_KEY` ou /api). Mostrar estado (ativadas/negadas/sem suporte). Aviso: iPhone só com app no ecrã principal.
- [ ] **4.7 testes.html** grupo T18 (lembretes/push) + nota de limitação iOS.
- [ ] **4.8** package.json +web-push; build; commit; deploy; verificação manual (instalar PWA → ativar → cron/teste manual envia push).

---

## Fase 5 — Crédito à habitação (registo detalhado + simulador)

**Files:** `src/lib/mortgage.js` (math + IMT/IS PT), `src/modals/HousingModal.jsx` (editar), `src/views/LoanView.jsx` (rework → "Crédito Habitação": registo + taxa de esforço + simulador), `src/store/store.jsx` (campo `housing`), `src/lib/mortgage.test.js`.

Modelo `housing` (persistido): `{ valorAquisicao, valorEmprestimo, capitaisProprios, impostos, dataAquisicao, taxaJuro, prazoAnos, prestacao, rendimentoAgregado }`.

- [ ] **5.1 lib/mortgage.js**:
```js
// Prestação mensal (amortização francesa).
export function monthlyPayment(principal, annualRatePct, years) {
  const n = Math.round(years * 12);
  const r = (annualRatePct / 100) / 12;
  if (!principal || n <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}
export function totalInterest(principal, annualRatePct, years) {
  return monthlyPayment(principal, annualRatePct, years) * Math.round(years * 12) - principal;
}
export function effortRate(payment, monthlyIncome) {
  return monthlyIncome > 0 ? (payment / monthlyIncome) * 100 : 0;
}
// IMT — Habitação Própria Permanente, Continente (estimativa 2024). Brackets:
// {limite, taxa, abater}. IMT = max(0, preço*taxa − abater) no escalão.
export function imtHPP(price) {
  const B = [
    [101917, 0, 0], [139412, 0.02, 2038.34], [190086, 0.05, 6220.70],
    [316772, 0.07, 10022.42], [633453, 0.08, 13190.14],
    [1102920, 0.06, 0], [Infinity, 0.075, 0],
  ];
  for (const [lim, tx, ab] of B) if (price <= lim) return Math.max(0, price * tx - ab);
  return 0;
}
export function stampDuty(price) { return price * 0.008; } // IS 0,8%
export function purchaseTaxes(price) { return imtHPP(price) + stampDuty(price); }
```
- [ ] **5.2 Testes** mortgage.test.js: monthlyPayment(100000,3,30)≈421.6; effortRate(500,2500)=20; imtHPP em escalões; stampDuty(200000)=1600.
- [ ] **5.3 Store** — `housing` persistido (default null) + `setHousing` + add a PERSISTED_KEYS/initial/build/hydrate.
- [ ] **5.4 HousingModal** — form: valor aquisição, empréstimo, capitais próprios (auto = aquisição−empréstimo, editável), impostos pagos, data de aquisição, taxa de juro, prazo, prestação, rendimento do agregado (mensal). Gravar → setHousing.
- [ ] **5.5 LoanView (rework)** — secção "A minha casa": valores + **taxa de esforço** = prestação/rendimento (gauge: <35% ok, ≥35% alto), impostos pagos, data. Botão editar (HousingModal). Manter o crédito demo só em preview.
- [ ] **5.6 Simulador** (na LoanView ou modal) — inputs: preço, entrada, taxa juro, prazo → prestação, total juros, custo total, **IMT+IS estimados** (purchaseTaxes), montante a financiar, taxa de esforço (usa rendimento do agregado). Nota: "IMT estimativa HPP continente".
- [ ] **5.7 Máscara** balancesHidden nos valores; testes.html T19; build+commit+deploy.

## Self-review
- Cobertura: Net worth (F1), Relatórios (F2), Orçamentos+rollover+alertas (F3), Lembretes+push iPhone (F4). ✓
- Sem placeholders nas partes críticas (rollover, push subscribe/send têm código).
- Consistência: `categoryTotals` (F2) reutilizada em `effectiveLimits` (F3). `/api/*` reutiliza o padrão de verificação de token de `api/ai.js`.
- Risco: F4 depende de config (VAPID) e de iOS 16.4+ com PWA instalada; verificação é manual pós-deploy. Cada fase é independente — F1-F3 não dependem de F4.
