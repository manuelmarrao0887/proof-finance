import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai.js', () => ({ verifyRequestToken: vi.fn() }));
vi.mock('../_lib/http.js', () => ({ authenticate: vi.fn() }));
vi.mock('../_lib/firebaseAdmin.js', () => ({ getFirebaseAuth: vi.fn(), getFirestoreDb: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

import handler from './test.js';
import { authenticate } from '../_lib/http.js';
import { getFirestoreDb } from '../_lib/firebaseAdmin.js';
import webpush from 'web-push';

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
}

function fakeDb(subs) {
  const docs = subs.map((s, i) => ({ id: 's' + i, data: () => s, ref: { delete: vi.fn().mockResolvedValue() } }));
  return { collection: () => ({ doc: () => ({ collection: () => ({ get: async () => ({ empty: docs.length === 0, docs }) }) }) }), _docs: docs };
}

describe('POST /api/push/test', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.com' };
    vi.clearAllMocks();
  });

  it('rejects non-POST', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('propagates an auth failure (bad/expired token) as its status', async () => {
    authenticate.mockRejectedValue(Object.assign(new Error('Sessao invalida'), { status: 401 }));
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Sessao invalida');
  });

  it('404s when the user has no push subscription on this device', async () => {
    authenticate.mockResolvedValue({ uid: 'u1' });
    getFirestoreDb.mockResolvedValue(fakeDb([]));
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' } }, res);
    expect(res.statusCode).toBe(404);
  });

  it('sends to every subscription and reports the count', async () => {
    authenticate.mockResolvedValue({ uid: 'u1' });
    const db = fakeDb([{ endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } }]);
    getFirestoreDb.mockResolvedValue(db);
    webpush.sendNotification.mockResolvedValue();
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('deletes a dead subscription (410) and still reports success if another sub worked', async () => {
    authenticate.mockResolvedValue({ uid: 'u1' });
    const db = fakeDb([
      { endpoint: 'https://push.example/dead', keys: { p256dh: 'x', auth: 'y' } },
      { endpoint: 'https://push.example/live', keys: { p256dh: 'x', auth: 'y' } },
    ]);
    getFirestoreDb.mockResolvedValue(db);
    webpush.sendNotification.mockImplementation(async (sub) => {
      if (sub.endpoint.endsWith('dead')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    });
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, sent: 1, failed: 1 });
    expect(db._docs[0].ref.delete).toHaveBeenCalled();
    expect(db._docs[1].ref.delete).not.toHaveBeenCalled();
  });

  it('502s when every subscription fails', async () => {
    authenticate.mockResolvedValue({ uid: 'u1' });
    const db = fakeDb([{ endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } }]);
    getFirestoreDb.mockResolvedValue(db);
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error('server error'), { statusCode: 500 }));
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' } }, res);
    expect(res.statusCode).toBe(502);
  });

  it('503s when VAPID env is missing', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    authenticate.mockResolvedValue({ uid: 'u1' });
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' } }, res);
    expect(res.statusCode).toBe(503);
  });
});
