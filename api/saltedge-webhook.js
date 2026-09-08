// Vercel Serverless Function — recebe os callbacks (webhooks) da Salt Edge.
//
// Endpoint PÚBLICO: é a Salt Edge a chamar, não há como mandar um token
// Firebase. Autentica-se pela assinatura RSA no header `Signature`
// (api/_lib/saltedgeSignature.js) — qualquer pedido sem assinatura válida é
// recusado com 401 e nunca chega a tocar no Firestore.
//
// Passo manual do utilizador (D10 da spec): registar esta URL
// (https://<domínio>/api/saltedge-webhook) no painel da Salt Edge para a app,
// e definir a mesma URL em SALTEDGE_WEBHOOK_URL — tem de ser byte-a-byte a
// que a Salt Edge usa para assinar, ou a verificação falha sempre.
//
// bodyParser desligado de propósito: a assinatura é sobre os BYTES exatos do
// corpo recebido, não sobre uma reserialização do JSON (que pode diferir em
// espaços/ordem de chaves e invalidar a assinatura).

import { verifyCallbackSignature } from './_lib/saltedgeSignature.js';
import { getFirestoreDb } from './_lib/firebaseAdmin.js';
import { encryptSecret } from './_lib/crypto.js';
import * as se from './_lib/saltedgeClient.js';
import { syncConnection } from './_lib/saltedgeSync.js';

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const FAIL_STAGES = new Set(['error', 'fail', 'failed']);

async function findUid(db, customerId) {
  if (!customerId) return null;
  const snap = await db.collection('saltedge_customer_index').doc(String(customerId)).get();
  return snap.exists ? snap.data().uid : null;
}

// Confirma o connection_id junto da Salt Edge (lista de connections do
// customer, autenticada só com App-id/Secret — service key) e grava/atualiza
// a ligação local com o connection_secret cifrado. A Salt Edge não manda o
// secret no próprio callback, só o connection_id.
async function upsertConnectionFromRemote(db, uid, customerId, connectionId) {
  const conns = await se.listConnections(customerId);
  const remote = conns.find((c) => String(c.id) === String(connectionId));
  if (!remote) return null;
  const doc = {
    connectionSecretEnc: encryptSecret(remote.secret),
    provider: { code: remote.provider_code, name: remote.provider_name },
    status: remote.status,
    updatedAt: new Date().toISOString(),
  };
  await db.collection('saltedge_customers').doc(uid).collection('connections').doc(String(connectionId)).set(doc, { merge: true });
  return doc;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await readRawBody(req);
  const signature = req.headers['signature'];
  const callbackUrl = (process.env.SALTEDGE_WEBHOOK_URL || 'https://proof-finance.vercel.app/api/saltedge-webhook').trim();

  if (!verifyCallbackSignature(callbackUrl, rawBody, signature)) {
    console.error('[saltedge-webhook] assinatura invalida ou em falta');
    return res.status(401).json({ error: 'assinatura invalida' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    return res.status(400).json({ error: 'corpo invalido' });
  }

  // Responde já 200 — o processamento não pode fazer a Salt Edge repetir o
  // callback indefinidamente por lentidão nossa. Falhas ficam só no log.
  res.status(200).json({ ok: true });

  try {
    const data = (body && body.data) || {};
    const stage = String(data.stage || '').toLowerCase();
    const customerId = data.customer_id;
    const connectionId = data.connection_id;
    if (!customerId || !connectionId) return; // callback sem os IDs que precisamos — nada a fazer

    const db = await getFirestoreDb();
    const uid = await findUid(db, customerId);
    if (!uid) {
      console.error('[saltedge-webhook] customer_id sem utilizador correspondente', customerId);
      return;
    }

    if (stage === 'destroy') {
      await db.collection('saltedge_customers').doc(uid).collection('connections').doc(String(connectionId)).delete();
      return;
    }
    if (FAIL_STAGES.has(stage)) {
      await db
        .collection('saltedge_customers')
        .doc(uid)
        .collection('connections')
        .doc(String(connectionId))
        .set({ status: 'error', lastErrorAt: new Date().toISOString() }, { merge: true });
      return;
    }

    const conn = await upsertConnectionFromRemote(db, uid, customerId, connectionId);
    if (!conn) {
      console.error('[saltedge-webhook] connection_id nao encontrado na lista remota', connectionId);
      return;
    }
    await syncConnection(db, {
      uid,
      connectionId: String(connectionId),
      connectionSecretEnc: conn.connectionSecretEnc,
      providerName: conn.provider && conn.provider.name,
    });
  } catch (e) {
    console.error('[saltedge-webhook] processamento falhou', e && e.stack ? e.stack : e);
  }
}
