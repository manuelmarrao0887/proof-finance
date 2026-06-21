// Vercel Serverless Function — proxy autenticado para a Anthropic Messages API.
//
// A API key da Anthropic vive SÓ aqui (env ANTHROPIC_API_KEY), nunca no browser.
// Cada pedido tem de trazer um ID-token Firebase válido (Authorization: Bearer
// <token>), verificado com firebase-admin (env FIREBASE_SERVICE_ACCOUNT = JSON
// da service account). Sem token válido → 401, sem chamar a Anthropic.
//
// Body esperado: { content, system, model, max_tokens } — `content` são os
// blocos de conteúdo da mensagem do utilizador (texto / imagem / documento).
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function firebaseAuth() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
    // Aceita JSON direto ou base64 do JSON.
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    initializeApp({ credential: cert(JSON.parse(json)) });
  }
  return getAuth();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1) Autenticação: verificar o ID-token Firebase.
  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sem token' });
    await firebaseAuth().verifyIdToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Auth falhou: ' + (e && e.message ? e.message : 'token invalido') });
  }

  // 2) Proxy para a Anthropic com a key do servidor.
  try {
    const { content, system, model, max_tokens } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Sem content' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
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
    return res.status(502).json({ error: 'Erro a contactar a IA: ' + (e && e.message ? e.message : 'erro') });
  }
}
