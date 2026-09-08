// Firebase Admin partilhado (auth + Firestore) para as funções da Salt Edge.
// Reutiliza parseServiceAccount de api/ai.js (mesma env FIREBASE_SERVICE_ACCOUNT,
// mesma tolerância a JSON/base64/aspas) em vez de duplicar essa lógica — não
// toca em api/ai.js, só importa a função pura já exportada de lá.

import { parseServiceAccount } from '../ai.js';

let _auth = null;
let _db = null;

async function initApp() {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  if (!getApps().length) {
    const svc = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(svc) });
  }
}

export async function getFirebaseAuth() {
  if (_auth) return _auth;
  await initApp();
  const { getAuth } = await import('firebase-admin/auth');
  _auth = getAuth();
  return _auth;
}

export async function getFirestoreDb() {
  if (_db) return _db;
  await initApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  _db = getFirestore();
  return _db;
}
