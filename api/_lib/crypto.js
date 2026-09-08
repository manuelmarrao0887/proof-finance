// Cifra em repouso dos segredos por-utilizador da Salt Edge (customer_secret,
// connection_secret) — equivalem a um token de sessão que lê a conta
// bancária de alguém, por isso nunca ficam em texto claro no Firestore.
//
// AES-256-GCM: chave de 32 bytes em SALTEDGE_ENC_KEY (base64), IV aleatório
// de 12 bytes por valor, GCM tag de autenticação anexada. Formato gravado:
// base64(iv[12] + tag[16] + ciphertext).
//
// Gerar a chave uma vez: `openssl rand -base64 32` — nunca colar aqui nem
// em nenhuma conversa; definir só via `vercel env add SALTEDGE_ENC_KEY`.

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function loadKey() {
  const raw = (process.env.SALTEDGE_ENC_KEY || '').trim();
  if (!raw) throw new Error('SALTEDGE_ENC_KEY nao configurada');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('SALTEDGE_ENC_KEY tem de ser 32 bytes em base64 (openssl rand -base64 32)');
  }
  return key;
}

export function encryptSecret(plaintext) {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(blob) {
  const key = loadKey();
  const buf = Buffer.from(String(blob), 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('valor cifrado invalido');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
