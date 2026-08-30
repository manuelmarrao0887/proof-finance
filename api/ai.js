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
// Politica de fornecedor aplicada a TODOS os pedidos (ver sanitizeRequest).
export const PROVIDER_POLICY = { data_collection: 'deny' };

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
  const parsed = parseInt(b.max_tokens, 10);
  const max_tokens = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 4000, MIN_TOKENS), MAX_TOKENS_CAP);
  const tools = Array.isArray(b.tools) && b.tools.length ? b.tools : undefined;

  // Validar tamanho total do payload (messages + tools).
  const payload = { messages, tools, model: 'temp', max_tokens };
  if (JSON.stringify(payload).length > MAX_BODY_CHARS) throw bad(413, 'Pedido demasiado grande');

  return {
    model: resolveModel(b.tier),
    messages,
    tools,
    max_tokens,
    // Privacidade: o pedido leva dados financeiros reais (saldos, despesas,
    // nomes de pessoas e, no import, extratos inteiros). O `data_collection` da
    // OpenRouter e "allow" por OMISSAO, o que permite encaminhar para
    // fornecedores que registam prompts e treinam com eles. Negamos sempre, e
    // aqui: o payload e construido de raiz, portanto um `provider` vindo do
    // cliente nunca sobrevive.
    provider: { ...PROVIDER_POLICY },
  };
}

let _auth = null;
/* parseServiceAccount — le a FIREBASE_SERVICE_ACCOUNT, que pode chegar em JSON
   cru ou em base64, e em qualquer dos casos com aspas a volta ou com quebras de
   linha (conforme como foi colada no painel).

   A versao anterior fazia `raw.startsWith('{') ? raw : base64`. O
   `Buffer.from(x,'base64')` ignora caracteres invalidos em SILENCIO, portanto
   um JSON valido com aspas a volta era "descodificado" para binario e o
   JSON.parse rebentava com "Unexpected token '\ufffd'" — o erro que apanhamos
   em producao a 2026-08-30, mascarado como sessao invalida.

   A mensagem de erro descreve a FORMA do valor (comprimento, primeiro caracter)
   e nunca o seu conteudo: e uma credencial. */
export function parseServiceAccount(rawInput) {
  let raw = String(rawInput == null ? '' : rawInput).trim();
  // BOM que sobrevive a um copy-paste de ficheiro.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1).trim();
  // Aspas a volta, como o cleanKey faz para a API key.
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT nao configurada');

  const shape = 'len=' + raw.length + ' inicio=' + JSON.stringify(raw[0]);
  let json;
  if (raw.startsWith('{')) {
    json = raw;
  } else {
    // base64 — tolera quebras de linha e espacos, que o painel costuma inserir.
    const compact = raw.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT nao e JSON nem base64 (' + shape + ')');
    }
    json = Buffer.from(compact, 'base64').toString('utf8');
  }

  let svc;
  try {
    svc = JSON.parse(json);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT ilegivel: ' + e.message.slice(0, 60) + ' (' + shape + ')');
  }
  for (const k of ['project_id', 'client_email', 'private_key']) {
    if (!svc || !svc[k]) throw new Error('FIREBASE_SERVICE_ACCOUNT sem o campo ' + k + ' (' + shape + ')');
  }
  return svc;
}

async function getFirebaseAuth() {
  if (_auth) return _auth;
  // Import dinâmico: se firebase-admin falhar a carregar, devolvemos erro JSON
  // em vez de a função inteira rebentar no load.
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const svc = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  _auth = getAuth();
  return _auth;
}

// Duas falhas muito diferentes partilhavam o mesmo catch (incidente de
// 2026-08-30): getAuth() a rebentar (ex: dependencia que deixou de carregar
// por require(), como o jose>=6 ESM-only) significa que o servidor nao
// consegue verificar NINGUEM — falha do servidor, 503. verifyIdToken() a
// rejeitar significa que este token em concreto e mau — 401, como sempre.
// Extraido para ser testavel sem depender do firebase-admin real: os testes
// injetam getAuth diretamente.
export async function verifyRequestToken(token, getAuth) {
  let auth;
  try {
    auth = await getAuth();
  } catch (e) {
    console.error('[api/ai] auth-init', e && e.message);
    throw bad(503, 'Assistente indisponivel de momento (erro no servidor).');
  }
  try {
    return await auth.verifyIdToken(token);
  } catch (e) {
    console.error('[api/ai] auth', e && e.message);
    throw bad(401, 'Sessao invalida');
  }
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
      decoded = await verifyRequestToken(token, getFirebaseAuth);
    } catch (e) {
      return res.status(e.status || 401).json({ error: e.message });
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
      return res.status(r.status).json({ error: 'Falha no assistente', status: r.status });
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
