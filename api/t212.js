// Vercel Serverless Function — sincronizar a carteira Trading212
// (API v0, docs.trading212.com/api, confirmados 2026-09-12 — ver
// docs/superpowers/specs/2026-09-12-trading212-sync.md).
//
// Autenticado como api/saltedge.js: token Firebase + ALLOWED_EMAILS. A chave
// da T212 vive só aqui (env TRADING212_API_KEY, opcionalmente
// TRADING212_API_SECRET para o esquema Basic) e nunca chega ao browser.
//
// Ações (POST { action, ... }):
//   status         → { configured, env, enabled, lastSyncAt, lastReport }
//   sync           → lê a T212 e escreve leitura + posições; devolve relatório
//   cleanup_manual → apaga as posições manuais duplicadas que o utilizador
//                    escolher na 1ª sync (nunca as geridas pela sync)

import { verifyRequestToken } from './ai.js';
import { authenticate, bad, readBody } from './_lib/http.js';
import { getFirebaseAuth, getFirestoreDb } from './_lib/firebaseAdmin.js';
import { t212Configured } from './_lib/t212Client.js';
import { syncT212, cleanupManualPositions } from './_lib/t212Sync.js';

// A chave da T212 é de UMA conta. Se a allowlist tiver mais que um email,
// TRADING212_OWNER_EMAIL garante que só o dono da carteira a lê — sem isso,
// qualquer email autorizado veria o património de quem configurou a chave.
export function assertT212Owner(email) {
  const owner = (process.env.TRADING212_OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner) return;
  if (String(email || '').trim().toLowerCase() !== owner) {
    throw bad(403, 'Esta carteira Trading212 não é desta conta.');
  }
}

async function actionStatus(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  const meta = (snap.exists && snap.data() && snap.data().t212Sync) || {};
  return {
    configured: t212Configured(),
    env: (process.env.TRADING212_ENV || 'live').trim().toLowerCase(),
    enabled: !!meta.enabled,
    lastSyncAt: meta.lastSyncAt || null,
    lastReport: meta.lastReport || null,
  };
}

// Despachante das ações, separado do handler HTTP para ser testável sem
// firebase-admin nem req/res falsos.
export async function handleT212(action, body, { uid, email, db, fetchImpl, sleep } = {}) {
  if (action === 'status') return actionStatus(db, uid);

  if (action === 'sync') {
    if (!t212Configured()) throw bad(503, 'Trading212 não configurada (TRADING212_API_KEY).');
    assertT212Owner(email);
    const report = await syncT212(db, { uid, fetchImpl, sleep });
    return { report };
  }

  if (action === 'cleanup_manual') {
    const ids = (body && body.ids) || [];
    if (!Array.isArray(ids) || !ids.length) throw bad(400, 'ids em falta');
    assertT212Owner(email);
    return cleanupManualPositions(db, { uid, ids });
  }

  throw bad(400, 'action inválida');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const decoded = await authenticate(req, verifyRequestToken, getFirebaseAuth);
    const body = readBody(req);
    const db = await getFirestoreDb();

    const out = await handleT212(body && body.action, body, { uid: decoded.uid, email: decoded.email, db });
    return res.status(200).json(out);
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    if (status >= 500) console.error('[api/t212]', e && e.stack ? e.stack : e);
    return res.status(status).json({ error: (e && e.message) || 'Erro interno' });
  }
}
