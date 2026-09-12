/* ════════════════════════════════════════════════════════════════════════
   t212Client — cliente fino da API v0 da Trading212 (docs.trading212.com/api,
   confirmados 2026-09-12). Só corre em funções serverless: a chave é um
   segredo de longa duração e nunca pode chegar ao browser.

   Auth — o spec declara DOIS esquemas e cada operação aceita qualquer um:
     · legacyApiKeyHeader  → `Authorization: <chave>`
     · authWithSecretKey   → `Authorization: Basic base64(chave:secret)`
   Usamos Basic quando TRADING212_API_SECRET existe, senão a chave direta.
   Assim serve tanto uma chave antiga (um valor) como um par novo.

   Rate limits (por conta, não por chave nem por IP): summary 1/5s,
   positions 1/1s. A resposta traz sempre x-ratelimit-reset (epoch em
   segundos) — é o que esperamos num 429 em vez de adivinhar.

   Um 408 ("Timed-out") é um resultado NORMAL documentado, não uma avaria →
   entra no retry como o 429.
   ════════════════════════════════════════════════════════════════════════ */

const ATTEMPTS = 3; // inicial + 2 retries
const MAX_WAIT_MS = 10000; // teto: a função serverless não pode ficar pendurada
const MIN_WAIT_MS = 250;

function cleanEnv(v) {
  let k = (v || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

function bad(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function t212Configured() {
  return !!cleanEnv(process.env.TRADING212_API_KEY);
}

export function t212BaseUrl() {
  const env = (process.env.TRADING212_ENV || 'live').trim().toLowerCase();
  const host = env === 'demo' ? 'demo.trading212.com' : 'live.trading212.com';
  return 'https://' + host + '/api/v0';
}

export function t212AuthHeader() {
  const key = cleanEnv(process.env.TRADING212_API_KEY);
  if (!key) throw bad(503, 'Trading212 não configurada (TRADING212_API_KEY)');
  const secret = cleanEnv(process.env.TRADING212_API_SECRET);
  if (!secret) return key; // legacyApiKeyHeader
  // base64 do Buffer nunca vem com o line-wrap de 76 chars do base64(1) do
  // GNU, que invalidaria a credencial.
  return 'Basic ' + Buffer.from(key + ':' + secret).toString('base64');
}

// Quanto esperar antes de repetir. Prefere o que o servidor diz
// (x-ratelimit-reset, epoch em segundos); sem isso, backoff linear.
function waitMs(response, attempt) {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const delta = reset * 1000 - Date.now();
    if (delta > 0) return Math.min(Math.max(delta + 100, MIN_WAIT_MS), MAX_WAIT_MS);
  }
  const period = Number(response.headers.get('x-ratelimit-period'));
  if (Number.isFinite(period) && period > 0) return Math.min(period * 1000, MAX_WAIT_MS);
  return Math.min(500 * attempt, MAX_WAIT_MS);
}

const RETRYABLE = (status) => status === 429 || status === 408 || status >= 500;

// Mensagens nossas: o corpo de erro da T212 não tem schema no spec e pode
// trazer texto interno — nunca o reencaminhamos ao cliente.
function errorFor(status) {
  if (status === 401) return bad(502, 'Chave da Trading212 recusada (401) — confirma TRADING212_API_KEY.');
  if (status === 403) return bad(502, 'Falta permissão (scope) à chave da Trading212 (403).');
  if (status === 400) return bad(502, 'Pedido recusado pela Trading212 (400).');
  if (status === 429 || status === 408) return bad(502, 'Trading212 ocupada (limite de pedidos) — tenta outra vez daqui a pouco.');
  return bad(502, 'Trading212 indisponível (' + status + ').');
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function t212Get(path, { fetchImpl, sleep, attempts = ATTEMPTS } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const doSleep = sleep || defaultSleep;
  const url = t212BaseUrl() + path;
  const headers = { Accept: 'application/json', Authorization: t212AuthHeader() };

  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = await doFetch(url, { method: 'GET', headers });
    if (r.ok) {
      const text = await r.text();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch (e) {
        throw bad(502, 'Resposta da Trading212 ilegível (não é JSON).');
      }
    }
    last = r.status;
    if (!RETRYABLE(r.status) || attempt === attempts) break;
    await doSleep(waitMs(r, attempt));
  }
  throw errorFor(last);
}

// GET /api/v0/equity/account/summary — 1 req / 5s
export async function getAccountSummary(opts) {
  return t212Get('/equity/account/summary', opts);
}

// GET /api/v0/equity/positions — 1 req / 1s, array sem envelope nem paginação
export async function getPositions(opts) {
  const out = await t212Get('/equity/positions', opts);
  return Array.isArray(out) ? out : [];
}
