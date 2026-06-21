/* ════════════════════════════════════════════════════════════════════════
   Balance lock — helpers para ocultar/mostrar saldos com PIN (4 dígitos) ou
   FaceID/biometria (WebAuthn platform authenticator, gate local sem servidor).
   ════════════════════════════════════════════════════════════════════════ */

// SHA-256 hex de uma string (para guardar o hash do PIN, nunca o PIN).
export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

// ── WebAuthn (FaceID / Touch ID / biometria do dispositivo) ────────────────
function b64FromBuf(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function bufFromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}
function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

// Biometria disponível neste browser/dispositivo (secure context + WebAuthn).
export function faceIdSupported() {
  return typeof window !== 'undefined' && !!(window.PublicKeyCredential && navigator.credentials);
}

// Regista uma credencial de plataforma (pede FaceID/biometria uma vez).
// Devolve o id da credencial em base64 (para guardar), ou lança em caso de falha.
export async function registerFaceId() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Proof. Finance' },
      user: { id: randomBytes(16), name: 'proof-finance', displayName: 'Proof Finance' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    },
  });
  if (!cred) throw new Error('Sem credencial');
  return b64FromBuf(cred.rawId);
}

// Pede a biometria para a credencial guardada. Resolve true se passou.
export async function verifyFaceId(credIdB64) {
  if (!credIdB64) return false;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: bufFromB64(credIdB64) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return !!assertion;
}
