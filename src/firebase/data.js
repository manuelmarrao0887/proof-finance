/* ════════════════════════════════════════════════════════════════════════
   Firestore data layer — SUBCOLLECTIONS.

   O modelo em memória (store) mantém-se: arrays por slice (addedExp, customAccts,
   …). Só a PERSISTÊNCIA muda: cada registo passa a ser um documento numa
   subcoleção de users/{uid}. As definições/escalares ficam no doc raiz.

     users/{uid}                     ← definições (theme, fxRates, pin, housing, …)
       accounts/{id}                 ← customAccts (contas + cartões)
       movements/{id}                ← addedExp (despesas/movimentos)
       incomes/{id}                  ← incomes
       balances/{id}                 ← balanceLog (saldos)
       categories/{id}               ← bdg (categorias/orçamento)
       transfers/{id}                ← transfers
       goals/{id} · recurring/{id} · positions/{id} · rules/{id}

   loadUserData(uid)   → objeto com a MESMA forma que o antigo doc (para o
                         hydrateFromDoc não mudar). Faz migração 1× se preciso.
   syncUserData(uid, state, prev) → escreve só o que mudou (diff por id) + apaga
                         o que foi removido. Doc raiz reescrito só quando muda.
   ════════════════════════════════════════════════════════════════════════ */

import { db } from './client.js';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  getDocFromCache,
  writeBatch,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { uid as genId } from '../lib/format.js';

// slice (nome em memória / doc antigo) → nome da subcoleção
export const SUBCOLLECTIONS = {
  addedExp: 'movements',
  customAccts: 'accounts',
  incomes: 'incomes',
  balanceLog: 'balances',
  bdg: 'categories',
  transfers: 'transfers',
  goals: 'goals',
  recurring: 'recurring',
  positions: 'positions',
  rules: 'rules',
};
const SLICE_KEYS = Object.keys(SUBCOLLECTIONS);

// Campos que ficam no doc raiz users/{uid} (definições e singletons).
const ROOT_KEYS = [
  'apiKey', 'aiHistory', 'dynAccts', 'dynSnaps', 'theme', 'forecastMonths',
  'fxRates', 'aiInsights', 'lastSeenPatchVersion', 'dismissedSubs', 'pinHash',
  'faceIdCred', 'balancesHidden', 'housing', 'rolloverOn',
];

const SCHEMA_VERSION = 2;
const BATCH_LIMIT = 450; // < 500 (limite do Firestore), com margem

// Doc id válido a partir do id do registo. Firestore não aceita '/', nem id
// vazio, nem '.'/'..'. Gera um id se em falta/ inválido.
function docId(id) {
  let s = id == null ? '' : String(id).replace(/\//g, '_').trim();
  if (!s || s === '.' || s === '..') s = genId();
  return s.slice(0, 1400); // margem para o limite de 1500 bytes
}

// Igualdade barata para decidir se um registo mudou.
function sameJSON(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
}

// Payload do doc raiz a partir do state/snapshot.
function rootPayload(src) {
  const o = {};
  ROOT_KEYS.forEach((k) => {
    o[k] = src[k] !== undefined ? src[k] : null;
  });
  o.aiHistory = (src.aiHistory || []).slice(-20);
  return o;
}

/* Divide operações em vários writeBatch (≤ BATCH_LIMIT) e faz commit.
   upserts: [{ key, id, data }]  deletes: [{ key, id }]  root: obj|null */
async function commit(uid, upserts, deletes, root) {
  const ops = [];
  upserts.forEach((u) => ops.push({ type: 'set', ref: doc(db, 'users', uid, SUBCOLLECTIONS[u.key], docId(u.id)), data: u.data }));
  deletes.forEach((d) => ops.push({ type: 'del', ref: doc(db, 'users', uid, SUBCOLLECTIONS[d.key], docId(d.id)) }));

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => {
      if (op.type === 'set') batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  if (root) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), { ...root, updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  }
}

/* Migração 1×: copia os arrays embebidos no doc raiz para subcoleções e depois
   remove-os do doc raiz (já estão nas subcoleções). Marca schemaVersion. */
async function migrate(uid, root) {
  const upserts = [];
  SLICE_KEYS.forEach((key) => {
    const arr = Array.isArray(root[key]) ? root[key] : [];
    arr.forEach((rec) => {
      const id = rec && rec.id != null ? rec.id : genId();
      upserts.push({ key, id, data: { ...rec, id } });
    });
  });
  await commit(uid, upserts, [], null);
  // Limpa os arrays antigos do doc raiz + marca versão (só depois do commit acima).
  const clean = writeBatch(db);
  const patch = { schemaVersion: SCHEMA_VERSION, migratedAt: serverTimestamp() };
  SLICE_KEYS.forEach((key) => { patch[key] = deleteField(); });
  clean.set(doc(db, 'users', uid), patch, { merge: true });
  await clean.commit();
  // eslint-disable-next-line no-console
  console.log('[Proof] Migração para subcoleções OK —', upserts.length, 'registos');
}

/* Lê o doc raiz. server-first; fallback à cache local (offline). */
async function readRoot(uid) {
  const ref = doc(db, 'users', uid);
  try {
    const s = await getDoc(ref);
    return s.exists() ? s.data() : null;
  } catch (e) {
    try {
      const s = await getDocFromCache(ref);
      return s.exists() ? s.data() : null;
    } catch (e2) {
      return null;
    }
  }
}

/* Carrega tudo e devolve um objeto com a forma do doc antigo (arrays por slice
   + campos raiz), pronto para hydrateFromDoc. null = utilizador novo. */
export async function loadUserData(uid) {
  if (!db || !uid) return null;
  const root = await readRoot(uid);
  if (!root) return null; // novo utilizador → defaults

  if (!root.schemaVersion || root.schemaVersion < SCHEMA_VERSION) {
    try {
      await migrate(uid, root);
    } catch (e) {
      // Migração falhou → devolve os arrays embebidos (ainda intactos) para não
      // perder nada; tenta migrar de novo no próximo arranque.
      // eslint-disable-next-line no-console
      console.error('Migração para subcoleções falhou', e);
      return root;
    }
  }

  const assembled = { ...root };
  await Promise.all(
    SLICE_KEYS.map(async (key) => {
      try {
        const snap = await getDocs(collection(db, 'users', uid, SUBCOLLECTIONS[key]));
        assembled[key] = snap.docs.map((d) => d.data());
      } catch (e) {
        assembled[key] = Array.isArray(root[key]) ? root[key] : [];
      }
    })
  );
  return assembled;
}

/* Calcula as diferenças entre `state` e `prev` (último estado sincronizado).
   Função PURA (sem Firestore) → testável. prev == null → tudo é upsert.
   Devolve { upserts:[{key,id,data}], deletes:[{key,id}], root:obj|null }. */
export function computeDiff(state, prev) {
  const upserts = [];
  const deletes = [];

  SLICE_KEYS.forEach((key) => {
    const cur = Array.isArray(state[key]) ? state[key] : [];
    const old = prev && Array.isArray(prev[key]) ? prev[key] : [];
    const curById = new Map();
    cur.forEach((rec) => {
      if (rec && rec.id != null) curById.set(String(rec.id), rec);
    });
    const oldById = new Map();
    old.forEach((rec) => {
      if (rec && rec.id != null) oldById.set(String(rec.id), rec);
    });
    curById.forEach((rec, id) => {
      const before = oldById.get(id);
      if (!before || !sameJSON(before, rec)) upserts.push({ key, id, data: rec });
    });
    oldById.forEach((_, id) => {
      if (!curById.has(id)) deletes.push({ key, id });
    });
  });

  const rootNow = rootPayload(state);
  const rootChanged = !prev || !sameJSON(rootNow, rootPayload(prev));
  return { upserts, deletes, root: rootChanged ? rootNow : null };
}

/* Grava as diferenças entre `state` e `prev` no Firestore. */
export async function syncUserData(uid, state, prev) {
  if (!db || !uid) return;
  const { upserts, deletes, root } = computeDiff(state, prev);
  await commit(uid, upserts, deletes, root);
}
