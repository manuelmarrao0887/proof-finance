// Cliente fino da API v5 da Salt Edge (Account Information). Só chamado a
// partir de funções serverless — a App-id/Secret nunca chegam ao browser.
//
// Base única (confirmado nos docs a 2026-09-09): não há host de sandbox
// separado; SALTEDGE_ENV controla só `include_fake_providers` no
// connect_session, para testar com bancos fictícios (Fakebank) antes da
// Salt Edge aprovar a app para bancos reais.

const BASE = 'https://www.saltedge.com/api/v5';

function cleanEnv(v) {
  let k = (v || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

export function saltedgeConfigured() {
  return !!(cleanEnv(process.env.SALTEDGE_APP_ID) && cleanEnv(process.env.SALTEDGE_SECRET));
}

export function isTestEnv() {
  return (process.env.SALTEDGE_ENV || 'test').trim().toLowerCase() !== 'live';
}

function baseHeaders() {
  const appId = cleanEnv(process.env.SALTEDGE_APP_ID);
  const secret = cleanEnv(process.env.SALTEDGE_SECRET);
  if (!appId || !secret) {
    const e = new Error('Salt Edge nao configurada (SALTEDGE_APP_ID/SALTEDGE_SECRET)');
    e.status = 503;
    throw e;
  }
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'App-id': appId,
    Secret: secret,
  };
}

// `extraHeaders` acrescenta Customer-secret / Connection-secret consoante o
// pedido (ver docs.saltedge.com/general/v5 — "Requests that query or modify
// connections should be signed with a Connection-secret header").
async function call(method, path, { body, extraHeaders } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...baseHeaders(), ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = (data && data.error && (data.error.message || data.error.class)) || 'Erro Salt Edge (' + r.status + ')';
    const e = new Error(msg);
    e.status = r.status >= 400 && r.status < 500 ? 502 : 502; // nunca expor o status externo cru ao cliente
    e.saltedgeStatus = r.status;
    e.saltedgeError = data && data.error;
    throw e;
  }
  return data;
}

export async function createCustomer(identifier) {
  const r = await call('POST', '/customers', { body: { data: { identifier } } });
  return r.data; // { id, secret, identifier }
}

export async function createConnectSession({ customerId, customerSecret, returnTo, fromDate, providerCode }) {
  const consent = { scopes: ['account_details', 'transactions_details'] };
  if (fromDate) consent.from_date = fromDate;
  const data = {
    customer_id: customerId,
    consent,
    attempt: { return_to: returnTo },
  };
  if (providerCode) data.provider_code = providerCode;
  if (isTestEnv()) data.include_fake_providers = true;
  const r = await call('POST', '/connect_sessions/create', {
    body: { data },
    extraHeaders: { 'Customer-secret': customerSecret },
  });
  return r.data; // { connect_url, expires_at }
}

export async function listConnections(customerId) {
  const r = await call('GET', '/connections?customer_id=' + encodeURIComponent(customerId));
  return r.data || []; // [{id, provider_code, provider_name, status, secret, ...}]
}

export async function getConnection(connectionId, connectionSecret) {
  const r = await call('GET', '/connections/' + encodeURIComponent(connectionId), {
    extraHeaders: connectionSecret ? { 'Connection-secret': connectionSecret } : undefined,
  });
  return r.data;
}

export async function listAccounts(connectionId, connectionSecret) {
  const r = await call('GET', '/accounts?connection_id=' + encodeURIComponent(connectionId), {
    extraHeaders: { 'Connection-secret': connectionSecret },
  });
  return r.data || [];
}

// Paginado (from_id/next_id) — devolve TODAS as transações da conta, até
// `maxPages` páginas (limite defensivo: nunca ciclar para sempre por um bug
// de paginação do lado da Salt Edge).
export async function listTransactions(connectionId, accountId, connectionSecret, { fromId, maxPages = 20 } = {}) {
  const out = [];
  let cursor = fromId;
  for (let i = 0; i < maxPages; i++) {
    const qs = new URLSearchParams({ connection_id: connectionId, account_id: accountId });
    if (cursor) qs.set('from_id', cursor);
    const r = await call('GET', '/transactions?' + qs.toString(), {
      extraHeaders: { 'Connection-secret': connectionSecret },
    });
    out.push(...(r.data || []));
    const nextId = r.meta && r.meta.next_id;
    if (!nextId) break;
    cursor = nextId;
  }
  return out;
}

export async function refreshConnection(connectionId, connectionSecret) {
  const r = await call('PUT', '/connections/' + encodeURIComponent(connectionId) + '/refresh', {
    body: { data: {} },
    extraHeaders: { 'Connection-secret': connectionSecret },
  });
  return r.data;
}

export async function removeConnection(connectionId, connectionSecret) {
  await call('DELETE', '/connections/' + encodeURIComponent(connectionId), {
    extraHeaders: { 'Connection-secret': connectionSecret },
  });
}
