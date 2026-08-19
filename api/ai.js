// Vercel Serverless Function — proxy autenticado para a Anthropic Messages API.
//
// A API key da Anthropic vive SÓ aqui (env ANTHROPIC_API_KEY), nunca no browser.
// Cada pedido tem de trazer um ID-token Firebase válido (Authorization: Bearer
// <token>), verificado com firebase-admin (env FIREBASE_SERVICE_ACCOUNT = JSON
// da service account).
//
// SEGURANÇA (revisão 2026-08):
//   - O sign-up Google está aberto, portanto "qualquer token válido" não chega:
//     só os emails em ALLOWED_EMAILS (env, separados por vírgula) podem usar a
//     key. Sem essa env o proxy recusa tudo (fechado por omissão).
//   - O cliente NÃO escolhe o modelo (whitelist no servidor) nem pode pedir
//     max_tokens ilimitado (teto).
//   - Mensagens de erro internas nunca saem para o cliente (só para o log).
// Tudo é apanhado em try/catch e devolvido como JSON, para nunca rebentar com
// FUNCTION_INVOCATION_FAILED.

const MODELS = new Set(['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5']);
const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS_CAP = 8000;
const MAX_BODY_CHARS = 3_000_000; // ~2,2 MB base64 → chega para um PDF de extrato

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

    // 2) Key da Anthropic (limpa aspas/espacos).
    let apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if ((apiKey.startsWith('"') && apiKey.endsWith('"')) || (apiKey.startsWith("'") && apiKey.endsWith("'"))) {
      apiKey = apiKey.slice(1, -1).trim();
    }
    if (!apiKey) return res.status(503).json({ error: 'Assistente nao configurado (ANTHROPIC_API_KEY)' });

    // 3) Pedido saneado.
    const body = readBody(req);
    const { content, system, model, max_tokens } = body;
    if (!content) return res.status(400).json({ error: 'Sem content' });
    if (JSON.stringify(content).length > MAX_BODY_CHARS) return res.status(413).json({ error: 'Pedido demasiado grande' });
    const chosenModel = MODELS.has(model) ? model : DEFAULT_MODEL;
    const tokens = Math.min(Math.max(parseInt(max_tokens, 10) || 4000, 256), MAX_TOKENS_CAP);

    // 4) Proxy.
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: tokens,
        system: typeof system === 'string' ? system : undefined,
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    console.error('[api/ai]', e && e.message);
    return res.status(500).json({ error: 'Falha no assistente' });
  }
}
