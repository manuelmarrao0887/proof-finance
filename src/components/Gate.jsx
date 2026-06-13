/* ════════════════════════════════════════════════════════════════════════
   Access gate — a soft password barrier shown BEFORE anything else (including
   demo). Deters casual access to the app from the public portfolio. Stores
   only the SHA-256 of the passphrase (not the plaintext) and keeps a per-tab
   sessionStorage flag once passed.

   NOTE: this is a client-side deterrent, not strong security. Real data stays
   protected by the Firebase login inside the app.
   ════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';

// SHA-256 of the passphrase. To change it: run `printf 'NEWPASS' | shasum -a 256`.
const GATE_HASH = 'f35de205509e93ab41fedea5057c0e068a7ecf1d62766c9d2a0870c6d5a91827';
export const GATE_KEY = 'pf_gate_ok';

export function gatePassed() {
  try { return sessionStorage.getItem(GATE_KEY) === '1'; } catch { return false; }
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function Gate({ onPass }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const hex = await sha256Hex(pw);
      if (hex === GATE_HASH) {
        try { sessionStorage.setItem(GATE_KEY, '1'); } catch { /* ignore */ }
        onPass();
      } else {
        setErr('Password incorreta.');
        setPw('');
      }
    } catch {
      setErr('Não foi possível validar. Tenta novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: 360, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r2, 16px)',
          padding: 28, display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          style={{
            width: 48, height: 48, borderRadius: 14, background: 'var(--blue-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>Proof.</span>
            <span style={{ fontSize: 20, fontWeight: 400, color: 'var(--fg-muted)', letterSpacing: '-0.02em' }}>Finance</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>Área restrita. Introduz a password para continuar.</div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="lb">Password</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            autoComplete="current-password"
            aria-label="Password"
            style={{
              background: 'var(--elevated)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '11px 13px', color: 'var(--fg)', width: '100%',
            }}
          />
        </label>

        {err ? <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span> : null}

        <button
          type="submit"
          disabled={busy || !pw}
          style={{
            background: 'var(--primary)', color: 'var(--bg)', border: 'none',
            borderRadius: 999, padding: '13px 20px', fontSize: 14, fontWeight: 600,
          }}
        >
          {busy ? 'A validar…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
