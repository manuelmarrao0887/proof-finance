// Vercel Serverless Function — ligar contas bancárias via Salt Edge
// (Account Information API v5, docs.saltedge.com/account_information/v5,
// confirmados 2026-09-09 — ver docs/superpowers/specs/2026-09-09-saltedge-bank-link.md).
//
// Autenticado como api/ai.js: token Firebase + ALLOWED_EMAILS. App-id/Secret
// da Salt Edge só existem aqui (env SALTEDGE_APP_ID/SALTEDGE_SECRET); os
// segredos por-utilizador (customer/connection secret) ficam cifrados numa
// coleção Firestore que o cliente NUNCA lê (sem regra a autorizá-la — negada
// por omissão) e só a Admin SDK toca.
//
// Ações (POST { action, ... }):
//   link_start  → cria customer (1ª vez) + connect_session, devolve connect_url
//                 para abrir o widget hospedado pela Salt Edge (nunca vemos
//                 as credenciais do banco do utilizador).
//   list_links  → lista as ligações do utilizador e o último sync.
//   sync        → sincroniza uma ligação agora (chama refresh + importa o que
//                 já estiver disponível).
//   unlink      → remove a ligação na Salt Edge; NÃO apaga despesas já importadas.

import { verifyRequestToken } from './ai.js';
import { authenticate, bad, readBody } from './_lib/http.js';
import { getFirebaseAuth, getFirestoreDb } from './_lib/firebaseAdmin.js';
import { encryptSecret, decryptSecret } from './_lib/crypto.js';
import * as se from './_lib/saltedgeClient.js';
import { syncConnection } from './_lib/saltedgeSync.js';

const ALLOWED_ORIGIN_RE = /^https:\/\/proof-finance(-[a-z0-9]+)?(-proof-team)?\.vercel\.app$|^https?:\/\/localhost(:\d+)?$/;

function safeReturnTo(req) {
  const origin = req.headers.origin || '';
  const base = ALLOWED_ORIGIN_RE.test(origin) ? origin : 'https://proof-finance.vercel.app';
  return base + '/?tab=overview&bank=linked';
}

async function ensureCustomer(db, uid) {
  const ref = db.collection('saltedge_customers').doc(uid);
  const snap = await ref.get();
  if (snap.exists && snap.data().customerId) {
    const d = snap.data();
    return { customerId: d.customerId, customerSecret: decryptSecret(d.customerSecretEnc) };
  }
  const customer = await se.createCustomer(uid);
  await ref.set(
    { customerId: customer.id, customerSecretEnc: encryptSecret(customer.secret), createdAt: new Date().toISOString() },
    { merge: true }
  );
  await db.collection('saltedge_customer_index').doc(String(customer.id)).set({ uid });
  return { customerId: customer.id, customerSecret: customer.secret };
}

async function actionLinkStart(db, uid, req) {
  const { customerId, customerSecret } = await ensureCustomer(db, uid);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const session = await se.createConnectSession({
    customerId,
    customerSecret,
    returnTo: safeReturnTo(req),
    fromDate: oneYearAgo.toISOString().slice(0, 10),
  });
  return { connectUrl: session.connect_url, testEnv: se.isTestEnv() };
}

async function actionListLinks(db, uid) {
  const custSnap = await db.collection('saltedge_customers').doc(uid).get();
  if (!custSnap.exists) return { links: [] };
  const connSnap = await db.collection('saltedge_customers').doc(uid).collection('connections').get();
  const links = connSnap.docs.map((d) => {
    const c = d.data();
    return {
      connectionId: d.id,
      provider: c.provider || null,
      status: c.status || 'unknown',
      lastSyncAt: c.lastSyncAt || null,
      lastSyncReport: c.lastSyncReport || null,
    };
  });
  return { links };
}

async function actionSync(db, uid, connectionId) {
  if (!connectionId) throw bad(400, 'connectionId em falta');
  const connRef = db.collection('saltedge_customers').doc(uid).collection('connections').doc(connectionId);
  const snap = await connRef.get();
  if (!snap.exists) throw bad(404, 'Ligação não encontrada');
  const c = snap.data();
  try {
    await se.refreshConnection(connectionId, decryptSecret(c.connectionSecretEnc));
  } catch (e) {
    console.error('[api/saltedge] refresh falhou (segue com o que já houver)', e && e.message);
  }
  const report = await syncConnection(db, {
    uid,
    connectionId,
    connectionSecretEnc: c.connectionSecretEnc,
    providerName: c.provider && c.provider.name,
  });
  return { report };
}

async function actionUnlink(db, uid, connectionId) {
  if (!connectionId) throw bad(400, 'connectionId em falta');
  const connRef = db.collection('saltedge_customers').doc(uid).collection('connections').doc(connectionId);
  const snap = await connRef.get();
  if (!snap.exists) throw bad(404, 'Ligação não encontrada');
  const c = snap.data();
  try {
    await se.removeConnection(connectionId, decryptSecret(c.connectionSecretEnc));
  } catch (e) {
    console.error('[api/saltedge] remover na Salt Edge falhou (apagamos localmente na mesma)', e && e.message);
  }
  await connRef.delete();
  return { ok: true };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const decoded = await authenticate(req, verifyRequestToken, getFirebaseAuth);
    const uid = decoded.uid;

    if (!se.saltedgeConfigured()) {
      return res.status(503).json({ error: 'Ligação bancária não configurada (SALTEDGE_APP_ID/SALTEDGE_SECRET)' });
    }

    const body = readBody(req);
    const action = body && body.action;
    const db = await getFirestoreDb();

    let out;
    switch (action) {
      case 'link_start':
        out = await actionLinkStart(db, uid, req);
        break;
      case 'list_links':
        out = await actionListLinks(db, uid);
        break;
      case 'sync':
        out = await actionSync(db, uid, body.connectionId);
        break;
      case 'unlink':
        out = await actionUnlink(db, uid, body.connectionId);
        break;
      default:
        throw bad(400, 'action inválida');
    }
    return res.status(200).json(out);
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    if (status >= 500) console.error('[api/saltedge]', e && e.stack ? e.stack : e);
    return res.status(status).json({ error: (e && e.message) || 'Erro interno' });
  }
}
