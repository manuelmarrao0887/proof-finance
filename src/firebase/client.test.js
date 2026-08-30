/* getIdToken() — regressão do incidente de 2026-08-30.
 *
 * `getIdToken()` engolia QUALQUER falha a ir buscar o token (`.catch(() =>
 * null)`), tornando indistinguível "ninguém tem sessão iniciada" de "havia
 * sessão mas a renovação do token falhou" (ex: rede em baixo). chat() via um
 * `null` em ambos os casos e mostrava sempre "Precisas de iniciar sessao",
 * mesmo quando o utilizador estava autenticado.
 *
 * Estes testes isolam o SDK do Firebase (firebase/app, firebase/auth,
 * firebase/firestore) para controlar `auth.currentUser` diretamente e
 * verificar as duas saídas de getIdToken() na fonte, sem depender do
 * consumidor (chat(), já coberto em src/lib/ai.test.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `vi.mock` é hoisted para o topo do módulo (antes de qualquer `const`), por
// isso a variável partilhada com as factories tem de nascer dentro de
// `vi.hoisted()` — caso contrário `mockAuthObj` ainda está na temporal dead
// zone quando a factory de 'firebase/auth' corre.
const { mockAuthObj } = vi.hoisted(() => ({ mockAuthObj: { currentUser: null } }));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuthObj),
  setPersistence: vi.fn(() => Promise.resolve()),
  browserLocalPersistence: {},
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocFromCache: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

import { getIdToken } from './client.js';

beforeEach(() => {
  mockAuthObj.currentUser = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('getIdToken', () => {
  it('sem utilizador autenticado, resolve null (caso genuino de "sem sessao")', async () => {
    mockAuthObj.currentUser = null;
    await expect(getIdToken()).resolves.toBeNull();
  });

  it('com utilizador autenticado e getIdToken() do SDK a funcionar, devolve o token', async () => {
    mockAuthObj.currentUser = { getIdToken: () => Promise.resolve('tok-abc') };
    await expect(getIdToken()).resolves.toBe('tok-abc');
  });

  it('quando ha utilizador mas a renovacao do token falha, REJEITA (nao devolve null)', async () => {
    mockAuthObj.currentUser = { getIdToken: () => Promise.reject(new Error('network error')) };
    let caught;
    try {
      await getIdToken();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    expect(caught).not.toBeNull();
  });

  it('regista a falha de renovacao na consola (nao desaparece silenciosamente)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAuthObj.currentUser = { getIdToken: () => Promise.reject(new Error('boom')) };
    try {
      await getIdToken();
    } catch (e) {
      // esperado
    }
    expect(spy).toHaveBeenCalled();
  });
});
