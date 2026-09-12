import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t212Configured, t212BaseUrl, t212AuthHeader, t212Get, getAccountSummary, getPositions } from './t212Client.js';

const ENV_KEYS = ['TRADING212_API_KEY', 'TRADING212_API_SECRET', 'TRADING212_ENV'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
});
afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

// Resposta mínima com a forma que o fetch devolve (ok/status/headers/text).
function res(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

// fetch falso que devolve as respostas em sequência e grava as chamadas.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  fn.calls = calls;
  return fn;
}

describe('t212Configured — fail-closed sem chave', () => {
  it('falso sem TRADING212_API_KEY', () => {
    expect(t212Configured()).toBe(false);
  });

  it('verdadeiro só com a chave (o Secret é opcional — auth legacy)', () => {
    process.env.TRADING212_API_KEY = 'abc123';
    expect(t212Configured()).toBe(true);
  });

  it('ignora espaços e aspas colados por engano na variável', () => {
    process.env.TRADING212_API_KEY = '  "abc123"  ';
    expect(t212Configured()).toBe(true);
    expect(t212AuthHeader()).toBe('abc123');
  });
});

describe('t212BaseUrl — ambiente live vs demo', () => {
  it('demo quando TRADING212_ENV=demo', () => {
    process.env.TRADING212_ENV = 'demo';
    expect(t212BaseUrl()).toBe('https://demo.trading212.com/api/v0');
  });

  it('live por omissão', () => {
    expect(t212BaseUrl()).toBe('https://live.trading212.com/api/v0');
  });
});

describe('t212AuthHeader — os dois esquemas do spec', () => {
  it('sem Secret, manda a chave direta (legacyApiKeyHeader)', () => {
    process.env.TRADING212_API_KEY = 'chave-sozinha';
    expect(t212AuthHeader()).toBe('chave-sozinha');
  });

  it('com Secret, manda Basic base64(key:secret) — sem newline', () => {
    process.env.TRADING212_API_KEY = 'k';
    process.env.TRADING212_API_SECRET = 's';
    const h = t212AuthHeader();
    expect(h).toBe('Basic ' + Buffer.from('k:s').toString('base64'));
    expect(h).not.toContain('\n');
  });

  it('sem chave nenhuma, falha com 503 e diz qual a variável', () => {
    expect(() => t212AuthHeader()).toThrow(/TRADING212_API_KEY/);
  });
});

describe('t212Get — pedido, retries e erros', () => {
  beforeEach(() => {
    process.env.TRADING212_API_KEY = 'k';
  });

  it('chama o URL base + path com o header Authorization', async () => {
    const f = fakeFetch(res(200, { ok: true }));
    await t212Get('/equity/positions', { fetchImpl: f });
    expect(f.calls[0].url).toBe('https://live.trading212.com/api/v0/equity/positions');
    expect(f.calls[0].opts.headers.Authorization).toBe('k');
  });

  it('repete depois de um 429 e devolve os dados da segunda tentativa', async () => {
    const reset = Math.floor(Date.now() / 1000) + 2;
    const f = fakeFetch(res(429, 'Limited: 1 / 5s', { 'x-ratelimit-reset': String(reset) }), res(200, [{ a: 1 }]));
    const waited = [];
    const out = await t212Get('/equity/positions', { fetchImpl: f, sleep: async (ms) => waited.push(ms) });
    expect(out).toEqual([{ a: 1 }]);
    expect(f.calls).toHaveLength(2);
    expect(waited[0]).toBeGreaterThan(0);
  });

  it('espera o tempo indicado por x-ratelimit-reset, com teto de 10s', async () => {
    const reset = Math.floor(Date.now() / 1000) + 3600; // servidor a pedir uma hora
    const f = fakeFetch(res(429, '', { 'x-ratelimit-reset': String(reset) }), res(200, {}));
    const waited = [];
    await t212Get('/equity/positions', { fetchImpl: f, sleep: async (ms) => waited.push(ms) });
    expect(waited[0]).toBeLessThanOrEqual(10000);
  });

  it('repete um 408 — o timeout é um resultado normal documentado', async () => {
    const f = fakeFetch(res(408, 'Timed-out'), res(200, { ok: 1 }));
    const out = await t212Get('/equity/account/summary', { fetchImpl: f, sleep: async () => {} });
    expect(out).toEqual({ ok: 1 });
    expect(f.calls).toHaveLength(2);
  });

  it('desiste depois das tentativas e diz que a T212 não respondeu', async () => {
    const f = fakeFetch(res(408, 'Timed-out'));
    await expect(t212Get('/equity/positions', { fetchImpl: f, sleep: async () => {} })).rejects.toThrow(/Trading212/i);
    expect(f.calls.length).toBeGreaterThan(1);
  });

  it('não repete um 401 e diz que a chave foi recusada', async () => {
    const f = fakeFetch(res(401, 'Bad API key'));
    await expect(t212Get('/equity/positions', { fetchImpl: f, sleep: async () => {} })).rejects.toThrow(/chave/i);
    expect(f.calls).toHaveLength(1);
  });

  it('num 403 explica que falta um scope à chave', async () => {
    const f = fakeFetch(res(403, 'Scope( portfolio ) missing for API key'));
    await expect(t212Get('/equity/positions', { fetchImpl: f, sleep: async () => {} })).rejects.toThrow(/permiss|scope/i);
  });

  it('nunca deixa passar o corpo cru da T212 para a mensagem de erro', async () => {
    const f = fakeFetch(res(500, 'stacktrace interna da trading212'));
    await expect(t212Get('/equity/positions', { fetchImpl: f, sleep: async () => {} })).rejects.toThrow(
      /^(?!.*stacktrace).*$/
    );
  });

  it('corpo vazio devolve objeto vazio em vez de estourar no JSON.parse', async () => {
    const f = fakeFetch(res(200, ''));
    await expect(t212Get('/equity/positions', { fetchImpl: f })).resolves.toEqual({});
  });
});

describe('endpoints usados pela sync', () => {
  beforeEach(() => {
    process.env.TRADING212_API_KEY = 'k';
  });

  it('getAccountSummary bate em /equity/account/summary', async () => {
    const f = fakeFetch(res(200, { currency: 'EUR' }));
    await getAccountSummary({ fetchImpl: f });
    expect(f.calls[0].url).toContain('/equity/account/summary');
  });

  it('getPositions bate em /equity/positions e devolve sempre um array', async () => {
    const f = fakeFetch(res(200, { nao: 'array' }));
    const out = await getPositions({ fetchImpl: f });
    expect(f.calls[0].url).toContain('/equity/positions');
    expect(Array.isArray(out)).toBe(true);
  });
});
