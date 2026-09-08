// Verificação da assinatura dos callbacks (webhooks) da Salt Edge.
//
// Confirmado em docs.saltedge.com/general/v5 a 2026-09-09: o header
// `Signature` é base64(RSA-SHA256(callback_url + '|' + corpo_bruto)),
// assinado com a CHAVE PRIVADA da Salt Edge; verifica-se com a chave pública
// abaixo (publicada nos docs, versão indicada no header
// `Signature-key-version`, hoje "5.0"). A chave é estável e pública — não é
// segredo, mas se a Salt Edge a rodar, o header de versão muda e há que
// atualizar este ficheiro.
//
// `callback_url` é a URL EXATA registada no painel da Salt Edge para este
// endpoint (https://proof-finance.vercel.app/api/saltedge-webhook) — usar
// aqui exatamente essa string, não `req.url` (que pode vir sem o domínio).

import { createVerify } from 'node:crypto';

export const SALTEDGE_SIGNATURE_KEY_VERSION = '5.0';

export const SALTEDGE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvL/Xxdmj7/cpZgvDMvxr
nTTU/vkHGM/qkJ0Q+rmfYLru0Z/rSWthPDEK3orY5BTa0sAe2wUV5Fes677X6+Ib
roCF8nODW5hSVTrqWcrQ55I7InpFkpTxyMkiFN8XPS7qmYXl/xofbYq0olcwE/aw
9lfHlZD7iwOpVJqTsYiXzSMRu92ZdECV895kYS/ggymSEtoMSW3405dQ6OfnK53x
7AJPdkAp0Wa2Lk4BNBMd24uu2tasO1bTYBsHpxonwbA+o8BXffdTEloloJgW7pV+
TWvxB/Uxil4yhZZJaFmvTCefxWFovyzLdjn2aSAEI7D1y4IYOdByMOPYQ6Mn7J9A
9wIDAQAB
-----END PUBLIC KEY-----`;

// Permite injetar outra chave pública nos testes (ou uma rotação futura via
// env, sem precisar de novo deploy do código) sem mudar a assinatura da
// função — `verifyCallback` continua a chamar-se sempre da mesma forma.
function publicKey() {
  return (process.env.SALTEDGE_PUBLIC_KEY_OVERRIDE || '').trim() || SALTEDGE_PUBLIC_KEY;
}

export function verifyCallbackSignature(callbackUrl, rawBody, signatureB64) {
  if (!signatureB64 || typeof signatureB64 !== 'string') return false;
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(callbackUrl + '|' + rawBody, 'utf8');
    verifier.end();
    return verifier.verify(publicKey(), signatureB64, 'base64');
  } catch (e) {
    console.error('[saltedge-webhook] assinatura invalida', e && e.message);
    return false;
  }
}
