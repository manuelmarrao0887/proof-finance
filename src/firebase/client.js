/* ════════════════════════════════════════════════════════════════════════
   Firebase client — modular firebase@10 (replaces the compat init + auth
   handlers + Firestore load/save of the original, lines ~234-252, 466-575,
   2821-2847, 3176-3213).

   Exports:
     auth, db                         — Firebase instances (or null on file://)
     IS_FILE                          — true when opened as a local file
     initError                        — fatal init message (or null)
     signInEmail(email, pwd)
     registerEmail(email, pwd)        — enforces min 6 chars (orig 2834)
     signInGoogle()                   — GoogleAuthProvider popup
     signOutUser()
     setAuthPersistenceLocal()        — browserLocalPersistence (orig 3178)
     onAuth(cb)                       — onAuthStateChanged wrapper
     loadUserDoc(uid)                 — getDoc users/{uid} -> data | null
     saveUserDoc(uid, data)           — setDoc merge:true + serverTimestamp
   ════════════════════════════════════════════════════════════════════════ */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

// EXACT config from the original (map §3, lines 234-241).
const firebaseConfig = {
  apiKey: 'AIzaSyDemHPODFA07zSIA31O8qQ2mjB_4mLzvJg',
  authDomain: 'personal-finance-9c979.firebaseapp.com',
  projectId: 'personal-finance-9c979',
  storageBucket: 'personal-finance-9c979.firebasestorage.app',
  messagingSenderId: '439427628821',
  appId: '1:439427628821:web:08f756917777856ca2731c',
};

// Firebase Auth + Firestore require HTTPS; block on file:// (orig 233/242).
export const IS_FILE =
  typeof location !== 'undefined' && location.protocol === 'file:';

let _app = null;
let _auth = null;
let _db = null;
let _initError = null;

if (IS_FILE) {
  _initError =
    'A app esta a ser aberta em modo ficheiro local (file://). Firebase Auth e Firestore exigem HTTPS.';
} else {
  try {
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = initializeFirestore(_app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Firebase init falhou', e);
    _initError =
      'Falha a inicializar Firebase: ' + (e && e.message ? e.message : String(e));
  }
}

export const auth = _auth;
export const db = _db;
export const initError = _initError;

/* ── Auth helpers ────────────────────────────────────────────────────── */

export function setAuthPersistenceLocal() {
  if (!auth) return Promise.resolve();
  // Best-effort; never reject (matches orig swallow on 3178).
  return setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export function signInEmail(email, pwd) {
  if (!auth) return Promise.reject(new Error('Firebase indisponivel'));
  return signInWithEmailAndPassword(auth, email, pwd);
}

export function registerEmail(email, pwd) {
  if (!auth) return Promise.reject(new Error('Firebase indisponivel'));
  if (!pwd || pwd.length < 6) {
    return Promise.reject(
      new Error('Password tem de ter pelo menos 6 caracteres.')
    );
  }
  return createUserWithEmailAndPassword(auth, email, pwd);
}

export function signInGoogle() {
  if (!auth) return Promise.reject(new Error('Firebase indisponivel'));
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

export function onAuth(cb) {
  if (!auth) {
    // No auth (file:// or init failure): report "no user" once, async.
    if (typeof cb === 'function') Promise.resolve().then(() => cb(null));
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

/* ── Firestore document (users/{uid}) ────────────────────────────────── */

export function loadUserDoc(uid) {
  if (!db || !uid) return Promise.resolve(null);
  const ref = doc(db, 'users', uid);
  // Server-first: always read the freshest document from Firestore so a stale
  // local cache can never resurface data the user deleted on another session.
  // Fall back to the IndexedDB cache only when the network read fails (offline).
  return getDoc(ref)
    .then((snap) => (snap.exists() ? snap.data() : null))
    .catch(() =>
      getDocFromCache(ref)
        .then((snap) => (snap.exists() ? snap.data() : null))
        .catch(() => null)
    );
}

export function saveUserDoc(uid, data) {
  if (!db || !uid) return Promise.resolve();
  return setDoc(
    doc(db, 'users', uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
