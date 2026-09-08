import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { encryptSecret, decryptSecret } from './crypto.js';
import { verifyCallbackSignature, SALTEDGE_PUBLIC_KEY } from './saltedgeSignature.js';
import { authenticate } from './http.js';

describe('crypto.js — segredos por-utilizador em repouso', () => {
  const PREV = process.env.SALTEDGE_ENC_KEY;
  beforeAll(() => {
    // Chave de teste, nunca a real — 32 bytes em base64.
    process.env.SALTEDGE_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
  });
  afterAll(() => {
    process.env.SALTEDGE_ENC_KEY = PREV;
  });

  it('cifra e decifra sem perdas', () => {
    const plain = 'connection_secret_de_teste_abc123';
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('cada cifra é diferente (IV aleatório) mesmo para o mesmo valor', () => {
    const a = encryptSecret('mesmo-valor');
    const b = encryptSecret('mesmo-valor');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('mesmo-valor');
    expect(decryptSecret(b)).toBe('mesmo-valor');
  });

  it('rejeita um valor cifrado adulterado (autenticação GCM)', () => {
    const enc = encryptSecret('valor-sensivel');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff; // adultera o último byte do texto cifrado
    expect(() => decryptSecret(buf.toString('base64'))).toThrow();
  });

  it('sem SALTEDGE_ENC_KEY, falha em vez de gravar em claro', () => {
    const saved = process.env.SALTEDGE_ENC_KEY;
    delete process.env.SALTEDGE_ENC_KEY;
    expect(() => encryptSecret('x')).toThrow(/SALTEDGE_ENC_KEY/);
    process.env.SALTEDGE_ENC_KEY = saved;
  });
});

describe('saltedgeSignature.js — verificação dos callbacks da Salt Edge', () => {
  const PREV = process.env.SALTEDGE_PUBLIC_KEY_OVERRIDE;
  let privateKey, publicKey;
  beforeAll(() => {
    // Par de chaves só para o teste (nunca as da Salt Edge, que não temos —
    // só a pública delas, embutida em SALTEDGE_PUBLIC_KEY). O override
    // troca a chave de verificação para esta, exercitando o MESMO código
    // (createVerify/RSA-SHA256) que corre em produção.
    const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = kp.privateKey;
    publicKey = kp.publicKey.export({ type: 'spki', format: 'pem' });
    process.env.SALTEDGE_PUBLIC_KEY_OVERRIDE = publicKey;
  });
  afterAll(() => {
    process.env.SALTEDGE_PUBLIC_KEY_OVERRIDE = PREV;
  });

  function sign(callbackUrl, body) {
    const signer = createSign('RSA-SHA256');
    signer.update(callbackUrl + '|' + body, 'utf8');
    signer.end();
    return signer.sign(privateKey, 'base64');
  }

  const URL = 'https://proof-finance.vercel.app/api/saltedge-webhook';
  const BODY = JSON.stringify({ data: { connection_id: 'c1', customer_id: 'u1', stage: 'finish' } });

  it('aceita uma assinatura genuína para a URL e corpo exatos', () => {
    expect(verifyCallbackSignature(URL, BODY, sign(URL, BODY))).toBe(true);
  });

  it('rejeita quando o corpo foi alterado depois de assinado', () => {
    const sig = sign(URL, BODY);
    const tampered = BODY.replace('c1', 'c2');
    expect(verifyCallbackSignature(URL, tampered, sig)).toBe(false);
  });

  it('rejeita quando a URL não é a registada (ex.: outro domínio)', () => {
    const sig = sign(URL, BODY);
    expect(verifyCallbackSignature('https://outro.dominio/api/saltedge-webhook', BODY, sig)).toBe(false);
  });

  it('rejeita assinatura ausente ou lixo, sem rebentar', () => {
    expect(verifyCallbackSignature(URL, BODY, undefined)).toBe(false);
    expect(verifyCallbackSignature(URL, BODY, 'nao-e-base64-valido!!')).toBe(false);
  });

  it('a chave pública real embutida é um PEM válido (verificável, mesmo sem par de testes)', () => {
    expect(SALTEDGE_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY');
    // Verificar contra ela com uma assinatura de outra chave tem de devolver
    // false de forma limpa (prova que a PEM é utilizável pelo node:crypto).
    delete process.env.SALTEDGE_PUBLIC_KEY_OVERRIDE;
    expect(verifyCallbackSignature(URL, BODY, sign(URL, BODY))).toBe(false);
    process.env.SALTEDGE_PUBLIC_KEY_OVERRIDE = publicKey;
  });
});

describe('http.js — authenticate()', () => {
  const PREV = process.env.ALLOWED_EMAILS;
  beforeAll(() => {
    process.env.ALLOWED_EMAILS = 'dono@example.com';
  });
  afterAll(() => {
    process.env.ALLOWED_EMAILS = PREV;
  });

  const verify = async (token) => ({ 'tok-ok': { uid: 'u1', email: 'dono@example.com', email_verified: true } })[token] || (() => { throw { status: 401, message: 'invalido' }; })();

  it('recusa sem header Authorization', async () => {
    await expect(authenticate({ headers: {} }, verify, async () => {})).rejects.toMatchObject({ status: 401 });
  });

  it('recusa um token que o Firebase rejeita', async () => {
    await expect(authenticate({ headers: { authorization: 'Bearer mau' } }, verify, async () => {})).rejects.toMatchObject({ status: 401 });
  });

  it('recusa email fora da allowlist', async () => {
    const v = async () => ({ uid: 'u2', email: 'outro@example.com', email_verified: true });
    await expect(authenticate({ headers: { authorization: 'Bearer x' } }, v, async () => {})).rejects.toMatchObject({ status: 403 });
  });

  it('recusa email não verificado mesmo na allowlist', async () => {
    const v = async () => ({ uid: 'u1', email: 'dono@example.com', email_verified: false });
    await expect(authenticate({ headers: { authorization: 'Bearer x' } }, v, async () => {})).rejects.toMatchObject({ status: 403 });
  });

  it('aceita um token válido de um email autorizado e verificado', async () => {
    const decoded = await authenticate({ headers: { authorization: 'Bearer tok-ok' } }, verify, async () => {});
    expect(decoded.uid).toBe('u1');
  });

  it('fecha por omissão sem ALLOWED_EMAILS configurada', async () => {
    delete process.env.ALLOWED_EMAILS;
    const v = async () => ({ uid: 'u1', email: 'dono@example.com', email_verified: true });
    await expect(authenticate({ headers: { authorization: 'Bearer x' } }, v, async () => {})).rejects.toMatchObject({ status: 503 });
    process.env.ALLOWED_EMAILS = 'dono@example.com';
  });
});
