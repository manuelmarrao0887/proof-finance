import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../firebase/client.js', () => ({ getIdToken: vi.fn() }));
import { getIdToken } from '../firebase/client.js';
import { t212Status, t212Sync, t212CleanupManual } from './trading212Api.js';

function mockFetch(status, body) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

let realFetch;
beforeEach(() => {
  realFetch = global.fetch;
  getIdToken.mockResolvedValue('token-de-teste');
});
afterEach(() => {
  global.fetch = realFetch;
  vi.clearAllMocks();
});

describe('cliente /api/t212', () => {
  it('manda o token Firebase e a action no corpo', async () => {
    global.fetch = mockFetch(200, { configured: true });
    await t212Status();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/t212');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer token-de-teste');
    expect(JSON.parse(opts.body)).toEqual({ action: 'status' });
  });

  it('t212Sync devolve o relatório do servidor', async () => {
    global.fetch = mockFetch(200, { report: { valorAtual: 1200, positions: 3 } });
    const out = await t212Sync();
    expect(out.report).toMatchObject({ valorAtual: 1200, positions: 3 });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: 'sync' });
  });

  it('t212CleanupManual leva os ids escolhidos', async () => {
    global.fetch = mockFetch(200, { removed: 2 });
    await t212CleanupManual(['a', 'b']);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: 'cleanup_manual', ids: ['a', 'b'] });
  });

  it('sem sessão não chega a chamar a API', async () => {
    getIdToken.mockResolvedValue(null);
    global.fetch = mockFetch(200, {});
    await expect(t212Sync()).rejects.toThrow(/sessão/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('usa a mensagem de erro do servidor quando ela vem', async () => {
    global.fetch = mockFetch(502, { error: 'Chave da Trading212 recusada (401)' });
    await expect(t212Sync()).rejects.toThrow(/recusada/);
  });

  it('num 503 explica que a integração ainda não está configurada', async () => {
    global.fetch = mockFetch(503, {});
    await expect(t212Sync()).rejects.toThrow(/configurada/i);
  });

  it('num 403 diz que a carteira não é desta conta', async () => {
    global.fetch = mockFetch(403, {});
    await expect(t212Sync()).rejects.toThrow(/acesso|conta/i);
  });

  it('corpo ilegível não rebenta — cai numa mensagem genérica', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    }));
    await expect(t212Sync()).rejects.toThrow(/Trading212/i);
  });
});
