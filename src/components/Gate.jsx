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

// Pure-JS SHA-256 — does NOT require a secure context, so it works over http
// (the site is served over http; window.crypto.subtle is undefined there).
// Produces the same hex digest as `shasum -a 256` for UTF-8 input.
function sha256Hex(str) {
  const utf8 = unescape(encodeURIComponent(str)); // -> UTF-8 byte string
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const maxWord = Math.pow(2, 32);
  const words = [];
  const bitLen = utf8.length * 8;
  const h = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      h[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  let msg = utf8 + '\x80';
  while (msg.length % 64 - 56) msg += '\x00';
  for (let i = 0; i < msg.length; i++) {
    const c = msg.charCodeAt(i);
    words[i >> 2] |= c << ((3 - i) % 4) * 8;
  }
  words[words.length] = (bitLen / maxWord) | 0;
  words[words.length] = bitLen;
  let hash = h.slice(0, 8);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = (hash[7]
        + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            (w[i - 16]
              + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0
          ))) | 0;
      const temp2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
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
