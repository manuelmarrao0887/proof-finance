import { describe, it, expect } from 'vitest';
import {
  MODEL_TIERS,
  MAX_TOKENS_CAP,
  MAX_TOOL_CALLS,
  resolveModel,
  capToolCalls,
  sanitizeRequest,
  parseServiceAccount,
  verifyRequestToken,
} from './ai.js';

describe('resolveModel', () => {
  it('resolve os dois tiers conhecidos', () => {
    expect(resolveModel('fast')).toBe('google/gemini-3.5-flash-lite');
    expect(resolveModel('strong')).toBe('google/gemini-3.7-flash');
  });
  it('cai em fast para tier desconhecido, vazio ou ausente', () => {
    expect(resolveModel('gpt-5')).toBe(MODEL_TIERS.fast);
    expect(resolveModel('')).toBe(MODEL_TIERS.fast);
    expect(resolveModel(undefined)).toBe(MODEL_TIERS.fast);
  });
  it('nao aceita um id de modelo cru vindo do cliente', () => {
    expect(resolveModel('google/gemini-3.7-flash')).toBe(MODEL_TIERS.fast);
  });
});

describe('capToolCalls', () => {
  it('corta acima do limite', () => {
    const calls = Array.from({ length: 12 }, (_, i) => ({ id: 't' + i }));
    const out = capToolCalls({ role: 'assistant', tool_calls: calls });
    expect(out.tool_calls).toHaveLength(MAX_TOOL_CALLS);
    expect(out.tool_calls[0].id).toBe('t0');
  });
  it('deixa passar mensagens sem tool_calls', () => {
    const msg = { role: 'assistant', content: 'ola' };
    expect(capToolCalls(msg)).toBe(msg);
  });
});

describe('sanitizeRequest', () => {
  const base = { messages: [{ role: 'user', content: 'ola' }] };

  it('devolve o modelo do tier e as mensagens', () => {
    const out = sanitizeRequest({ ...base, tier: 'strong' });
    expect(out.model).toBe(MODEL_TIERS.strong);
    expect(out.messages).toEqual(base.messages);
  });
  it('limita max_tokens ao teto', () => {
    expect(sanitizeRequest({ ...base, max_tokens: 99999 }).max_tokens).toBe(MAX_TOKENS_CAP);
  });
  it('impoe um minimo de 256 tokens', () => {
    expect(sanitizeRequest({ ...base, max_tokens: 10 }).max_tokens).toBe(256);
  });
  it('rejeita mensagens em falta com status 400', () => {
    expect(() => sanitizeRequest({})).toThrow(/messages/);
    try {
      sanitizeRequest({ messages: [] });
    } catch (e) {
      expect(e.status).toBe(400);
    }
  });
  it('rejeita roles desconhecidos', () => {
    expect(() => sanitizeRequest({ messages: [{ role: 'root', content: 'x' }] })).toThrow();
  });
  it('rejeita corpos gigantes com status 413', () => {
    const huge = { messages: [{ role: 'user', content: 'x'.repeat(3_000_001) }] };
    try {
      sanitizeRequest(huge);
      throw new Error('devia ter rejeitado');
    } catch (e) {
      expect(e.status).toBe(413);
    }
  });
  it('so deixa passar tools quando sao um array', () => {
    expect(sanitizeRequest({ ...base, tools: 'nope' }).tools).toBeUndefined();
    expect(sanitizeRequest({ ...base, tools: [{ type: 'function' }] }).tools).toHaveLength(1);
  });
  it('conta os tools no limite de tamanho do corpo', () => {
    const body = {
      messages: [{ role: 'user', content: 'ola' }],
      tools: [{ type: 'function', function: { name: 'x', description: 'y'.repeat(3_000_001) } }],
    };
    try {
      sanitizeRequest(body);
      throw new Error('devia ter rejeitado');
    } catch (e) {
      expect(e.status).toBe(413);
    }
  });
});

// Regressão do incidente de 2026-08-30: um `jwks-rsa` que rebenta a carregar
// (require('jose') em ESM-only) era apanhado pelo mesmo catch que trata um
// token inválido, e o proxy respondia sempre 401 "Sessao invalida" — o
// utilizador via "precisas de iniciar sessao" com o servidor completamente
// avariado. verifyRequestToken() separa as duas causas: getAuth() a rebentar
// é uma falha do servidor (503); verifyIdToken() a rejeitar é um token mau
// (401, comportamento inalterado).
describe('verifyRequestToken', () => {
  it('getAuth() a rebentar (ex: dependencia ESM-only) devolve 503, nao 401', async () => {
    const getAuth = () => Promise.reject(new Error('ERR_REQUIRE_ESM: require() of ES Module jose'));
    let caught;
    try {
      await verifyRequestToken('qualquer-token', getAuth);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    expect(caught.status).toBe(503);
  });

  it('a mensagem do erro 503 nao contem o detalhe interno (nao leaka para o cliente)', async () => {
    const getAuth = () => Promise.reject(new Error('ERR_REQUIRE_ESM: require() of ES Module jose'));
    try {
      await verifyRequestToken('qualquer-token', getAuth);
      throw new Error('devia ter rejeitado');
    } catch (e) {
      expect(e.message).not.toMatch(/ERR_REQUIRE_ESM|jose/);
    }
  });

  it('verifyIdToken() a rejeitar (token mau) continua 401 "Sessao invalida"', async () => {
    const getAuth = () => Promise.resolve({ verifyIdToken: () => Promise.reject(new Error('token expirado')) });
    let caught;
    try {
      await verifyRequestToken('token-mau', getAuth);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    expect(caught.status).toBe(401);
    expect(caught.message).toBe('Sessao invalida');
  });

  it('devolve o token decodificado quando tudo corre bem', async () => {
    const decoded = { email: 'x@y.pt', email_verified: true };
    const getAuth = () => Promise.resolve({ verifyIdToken: () => Promise.resolve(decoded) });
    await expect(verifyRequestToken('bom-token', getAuth)).resolves.toEqual(decoded);
  });
});

/* ── parseServiceAccount ──────────────────────────────────────────────────
   Regressao do incidente de 2026-08-30: a FIREBASE_SERVICE_ACCOUNT vinha com
   aspas a volta, o ramo `startsWith('{')` falhava, e o Buffer.from(...,'base64')
   "descodificava" JSON valido para binario em silencio. O JSON.parse rebentava
   e o proxy respondia 401 a toda a gente. */
describe('parseServiceAccount', () => {
  const svc = { project_id: 'p', client_email: 'a@b.c', private_key: '-----BEGIN...' };
  const json = JSON.stringify(svc);

  it('le JSON cru', () => {
    expect(parseServiceAccount(json)).toMatchObject(svc);
  });
  it('le JSON com aspas a volta (o caso que partiu a producao)', () => {
    expect(parseServiceAccount('"' + json + '"')).toMatchObject(svc);
    expect(parseServiceAccount("'" + json + "'")).toMatchObject(svc);
  });
  it('le JSON com espacos e quebras de linha a volta', () => {
    expect(parseServiceAccount('\n  ' + json + '  \n')).toMatchObject(svc);
  });
  it('le base64', () => {
    expect(parseServiceAccount(Buffer.from(json).toString('base64'))).toMatchObject(svc);
  });
  it('le base64 partido por quebras de linha', () => {
    const b64 = Buffer.from(json).toString('base64');
    const quebrado = b64.replace(/(.{10})/g, '$1\n');
    expect(parseServiceAccount(quebrado)).toMatchObject(svc);
  });
  it('recusa um valor vazio', () => {
    expect(() => parseServiceAccount('')).toThrow(/nao configurada/);
    expect(() => parseServiceAccount(null)).toThrow(/nao configurada/);
  });
  it('recusa lixo que nao e JSON nem base64, em vez de o descodificar em silencio', () => {
    expect(() => parseServiceAccount('isto nao e nada @@@')).toThrow(/nao e JSON nem base64/);
  });
  it('recusa um JSON valido a que falte um campo obrigatorio', () => {
    expect(() => parseServiceAccount(JSON.stringify({ project_id: 'p' }))).toThrow(/sem o campo client_email/);
  });
  it('nunca poe o conteudo da credencial na mensagem de erro', () => {
    const segredo = 'CHAVE-SUPER-SECRETA-123';
    const mau = JSON.stringify({ project_id: 'p', private_key: segredo });
    try {
      parseServiceAccount(mau);
      throw new Error('devia ter rejeitado');
    } catch (e) {
      expect(e.message).not.toContain(segredo);
    }
  });
});

/* ── Privacidade ──────────────────────────────────────────────────────────
   Os pedidos levam dados financeiros reais do utilizador (saldos, despesas,
   nomes de pessoas e, no import, extratos inteiros). O `data_collection` da
   OpenRouter e "allow" por OMISSAO — encaminha para fornecedores que podem
   registar os prompts e treinar com eles. O proxy tem de o negar sempre, e o
   cliente nao pode ter voto nisso. */
describe('sanitizeRequest — privacidade', () => {
  const base = { messages: [{ role: 'user', content: 'ola' }] };

  it('nega sempre a recolha de dados pelo fornecedor', () => {
    expect(sanitizeRequest(base).provider).toEqual({ data_collection: 'deny' });
  });

  it('ignora um bloco provider vindo do cliente — a decisao e do servidor', () => {
    const out = sanitizeRequest({
      ...base,
      provider: { data_collection: 'allow', order: ['qualquer-coisa'], sort: 'price' },
    });
    expect(out.provider).toEqual({ data_collection: 'deny' });
  });

  it('nao deixa passar o provider nem por outro nome de campo', () => {
    const out = sanitizeRequest({ ...base, provider: 'allow', data_collection: 'allow' });
    expect(out.provider).toEqual({ data_collection: 'deny' });
    expect(out.data_collection).toBeUndefined();
  });
});
