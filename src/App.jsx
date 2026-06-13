/* ════════════════════════════════════════════════════════════════════════
   App — auth gate. Replaces the original init block (orig 3149-3213).

   Flow:
     - view='loading' → skeleton loader.
     - IS_FILE / initError → fatal screen (Firebase needs HTTPS).
     - onAuth fires:
         user  → setCurrentUser, loadUser(uid), then view='app'.
         null  → resetUser, view='login'.
     - Hard fallbacks: loadUser hang > 4s forces app; no auth response in 2s
       falls back to login (orig 3188 / 3201).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from './store/store.jsx';
import { onAuth, setAuthPersistenceLocal, IS_FILE, initError } from './firebase/client.js';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
import Gate, { gatePassed } from './components/Gate.jsx';

function Skeleton() {
  return (
    <div style={{ padding: '16px 20px' }}>
      <div className="rw" style={{ marginBottom: 24 }}>
        <div className="skel" style={{ width: 120, height: 24 }} />
        <div className="skel" style={{ width: 60, height: 24 }} />
      </div>
      <div className="skel" style={{ height: 140, borderRadius: 24, marginBottom: 20 }} />
      <div className="skel" style={{ height: 48, borderRadius: 12, marginBottom: 16 }} />
      <div className="skel" style={{ height: 80, marginBottom: 10 }} />
      <div className="skel" style={{ height: 80, marginBottom: 10 }} />
      <div className="skel" style={{ height: 80 }} />
    </div>
  );
}

function Fatal({ title, msg, children }) {
  return (
    <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: 'var(--signal-soft)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>{msg}</div>
        {children}
      </div>
    </div>
  );
}

// Demo mode: ?demo=1 (or #demo) renders the app with seed data and no auth.
// currentUser stays null → finance fns use preview/demo data; nothing is saved.
const DEMO = typeof location !== 'undefined' &&
  (new URLSearchParams(location.search).get('demo') === '1' || location.hash.replace('#', '') === 'demo');

export default function App() {
  const { setCurrentUser, loadUser, resetUser } = useAuth();
  const [view, setView] = useState('loading'); // loading | login | app
  const [gateOk, setGateOk] = useState(gatePassed); // access gate (soft password barrier)
  const viewRef = useRef('loading');
  viewRef.current = view;

  useEffect(() => {
    if (DEMO || IS_FILE || initError) {
      // Demo or fatal init — no auth wiring.
      return undefined;
    }

    let authFired = false;
    setAuthPersistenceLocal();

    const unsub = onAuth((user) => {
      authFired = true;
      if (user) {
        setCurrentUser(user);
        // Always proceed to app, regardless of loadUser success/failure (orig 3185-3186).
        loadUser(user.uid).then(
          () => setView('app'),
          () => setView('app')
        );
        // Hard fallback: if loadUser hangs > 4s, force app anyway (orig 3188).
        setTimeout(() => {
          if (viewRef.current !== 'app') setView('app');
        }, 4000);
      } else {
        setCurrentUser(null);
        resetUser();
        setView('login');
      }
    });

    // Fallback: if auth doesn't respond in 2s, show login (orig 3201).
    const t = setTimeout(() => {
      if (!authFired) {
        // eslint-disable-next-line no-console
        console.warn('Firebase Auth sem resposta em 2s — fallback para login');
        setView('login');
      }
    }, 2000);

    return () => {
      clearTimeout(t);
      if (typeof unsub === 'function') unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Access gate first — blocks everything (incl. demo) until the password is entered.
  if (!gateOk) return <Gate onPass={() => setGateOk(true)} />;

  if (DEMO) return <Shell />;

  if (IS_FILE) {
    return (
      <Fatal
        title="Servir via HTTPS"
        msg="Estas a abrir o ficheiro localmente (file://). Firebase Auth e Firestore nao funcionam neste modo."
      >
        <div className="cd" style={{ padding: 16, marginTop: 12 }}>
          <div className="lb" style={{ marginBottom: 10, color: 'var(--success)' }}>
            Solucoes
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
            Serve localmente:{' '}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>npm run dev</span>{' '}
            e abre{' '}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>localhost:5173</span>
          </div>
        </div>
      </Fatal>
    );
  }
  if (initError) {
    return <Fatal title="Erro de inicializacao" msg={initError} />;
  }

  if (view === 'loading') return <Skeleton />;
  if (view === 'login') return <Login />;
  return <Shell />;
}
