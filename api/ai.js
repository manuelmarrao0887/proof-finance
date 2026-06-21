// Vercel Serverless Function — proxy autenticado para a Anthropic Messages API.
//
// A API key da Anthropic vive SÓ aqui (env ANTHROPIC_API_KEY), nunca no browser.
// Cada pedido tem de trazer um ID-token Firebase válido (Authorization: Bearer
// <token>), verificado com firebase-admin (env FIREBASE_SERVICE_ACCOUNT = JSON
// da service account). Tudo é apanhado em try/catch e devolvido como JSON, para
// nunca rebentar com FUNCTION_INVOCATION_FAILED.

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

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1) Autenticação.
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sem token de sessao' });
    try {
      const auth = await getFirebaseAuth();
      await auth.verifyIdToken(token);
    } catch (e) {
      return res.status(401).json({ error: 'Auth falhou: ' + (e && e.message ? e.message : 'token invalido') });
    }

    // 2) Key da Anthropic (limpa aspas/espacos).
    let apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if ((apiKey.startsWith('"') && apiKey.endsWith('"')) || (apiKey.startsWith("'") && apiKey.endsWith("'"))) {
      apiKey = apiKey.slice(1, -1).trim();
    }
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada' });

    // 3) Proxy.
    const { content, system, model, max_tokens } = readBody(req);
    if (!content) return res.status(400).json({ error: 'Sem content' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5',
        max_tokens: max_tokens || 16000,
        system: system || undefined,
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Falha na funcao: ' + (e && e.message ? e.message : 'erro') });
  }
}
