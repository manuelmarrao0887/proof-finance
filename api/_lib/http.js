// Pequenos auxiliares partilhados pelas funções serverless (api/*.js).
// Extraídos para não duplicar em cada função — mas sem tocar em api/ai.js,
// que já está em produção e tem os seus próprios equivalentes locais.

export function bad(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function readBody(req) {
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

export function allowedEmails() {
  return new Set(
    (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Autenticação partilhada: token Firebase (Authorization: Bearer) + email na
// allowlist. Mesma política do api/ai.js (fechado por omissão sem
// ALLOWED_EMAILS). `verifyRequestToken`/`getFirebaseAuth` são injetados para
// poderem ser trocados por duplos nos testes sem tocar em firebase-admin.
export async function authenticate(req, verifyRequestToken, getFirebaseAuth) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) throw bad(401, 'Sem token de sessao');
  const decoded = await verifyRequestToken(token, getFirebaseAuth);
  const allow = allowedEmails();
  if (!allow.size) {
    console.error('[api/saltedge] ALLOWED_EMAILS nao configurada — fechado');
    throw bad(503, 'Funcionalidade nao configurada (ALLOWED_EMAILS)');
  }
  const email = String(decoded.email || '').toLowerCase();
  if (!decoded.email_verified || !allow.has(email)) {
    throw bad(403, 'Sem acesso');
  }
  return decoded;
}
