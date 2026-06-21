/* ════════════════════════════════════════════════════════════════════════
   Login screen — apenas Google. Sem palavra-passe inicial nem email/password.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback } from 'react';
import { signInGoogle } from '../firebase/client.js';
import { useToast } from './Toast.jsx';

export default function Login() {
  const toast = useToast();
  const [info, setInfo] = useState(null); // {msg, error}
  const [busy, setBusy] = useState(false);

  const doGoogleLogin = useCallback(() => {
    setInfo({ msg: 'A autenticar com Google...', error: false });
    setBusy(true);
    signInGoogle().catch((err) => {
      const msg = (err && err.message) || 'Falha no login Google';
      setInfo({ msg, error: true });
      toast(msg, 'error');
      setBusy(false);
    });
  }, [toast]);

  return (
    <div
      className="fadeIn"
      style={{
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(20px + var(--safe-top)) 20px calc(20px + var(--safe-bottom))',
        background: 'var(--bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: 'var(--primary)',
              color: 'var(--bg)',
              borderRadius: 16,
              margin: '0 auto 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.025em', lineHeight: 1.05 }}>
            Proof. Finance
          </h1>
          <div style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 10, lineHeight: 1.5 }}>
            As tuas finanças, num só lugar.
          </div>
        </div>

        <div className="cd" style={{ padding: 24 }}>
          <button
            type="button"
            onClick={doGoogleLogin}
            disabled={busy}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px 0',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--fg)',
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
            </svg>
            Entrar com Google
          </button>

          {info ? (
            <div
              role="status"
              aria-live="polite"
              style={
                info.error
                  ? { borderLeft: '3px solid var(--signal)', padding: 10, marginTop: 16 }
                  : { marginTop: 16, textAlign: 'center' }
              }
            >
              <div className="lb" style={info.error ? { color: 'var(--signal)' } : undefined}>
                {info.msg}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fg-subtle)', marginTop: 18 }}>
          Ao entrar concordas com o tratamento dos teus dados financeiros nesta conta.
        </div>
      </div>
    </div>
  );
}
