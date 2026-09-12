import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAuthorizedCron, sendToUser } from './reminders.js';

describe('isAuthorizedCron', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('accepts the exact bearer secret', () => {
    process.env.CRON_SECRET = 's3cr3t';
    expect(isAuthorizedCron({ headers: { authorization: 'Bearer s3cr3t' } })).toBe(true);
  });
  it('rejects a wrong secret', () => {
    process.env.CRON_SECRET = 's3cr3t';
    expect(isAuthorizedCron({ headers: { authorization: 'Bearer nope' } })).toBe(false);
  });
  it('rejects a missing header', () => {
    process.env.CRON_SECRET = 's3cr3t';
    expect(isAuthorizedCron({ headers: {} })).toBe(false);
  });
  it('rejects everything when CRON_SECRET is unset (fails closed)', () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron({ headers: { authorization: 'Bearer anything' } })).toBe(false);
  });
});

// Fake Firestore Admin SDK surface: only the chained calls sendToUser uses.
function fakeDb({ subs = [], setMock = vi.fn() } = {}) {
  const subDocs = subs.map((s, i) => ({ id: 's' + i, data: () => s, ref: { delete: vi.fn().mockResolvedValue() } }));
  return {
    collection: () => ({
      doc: () => ({
        collection: () => ({ get: async () => ({ docs: subDocs }) }),
        set: setMock,
      }),
    }),
    _subDocs: subDocs,
  };
}

describe('sendToUser', () => {
  it('sends nothing and does not touch Firestore when no reminder is due', async () => {
    const webpush = { sendNotification: vi.fn() };
    const setMock = vi.fn();
    const db = fakeDb({ setMock });
    const userDoc = { reminderPrefs: { almoco: { time: '13:45', enabled: false } } };
    const result = await sendToUser(webpush, db, 'u1', userDoc);
    expect(result.sent).toEqual([]);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('sends to every subscription for a due reminder and marks it sent', async () => {
    const webpush = { sendNotification: vi.fn().mockResolvedValue() };
    const setMock = vi.fn().mockResolvedValue();
    const subs = [{ endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } }];
    const db = fakeDb({ subs, setMock });
    // 't212' pref time equal to "now" is awkward to control since sendToUser
    // calls lisbonNow() internally with no override — use a wide-open pref
    // (00:00, enabled) which is virtually always "due" is fragile near
    // midnight; instead assert via the reminder that's realistically always
    // in-window is not possible without injecting the clock. So this test
    // pins lisbonNow/lisbonToday behavior indirectly: it only asserts the
    // shape of what happens when shouldSendReminder is forced true by
    // reusing today's actual Lisbon time as the pref target.
    const { lisbonNow, lisbonToday } = await import('../_lib/reminderSchedule.js');
    const now = lisbonNow();
    const userDoc = { reminderPrefs: { t212: { time: now, enabled: true } } };
    const result = await sendToUser(webpush, db, 'u1', userDoc);
    expect(result.sent).toEqual(['t212']);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(webpush.sendNotification.mock.calls[0][0]).toEqual({ endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } });
    expect(setMock).toHaveBeenCalledWith({ reminderLastSent: { t212: lisbonToday() } }, { merge: true });
  });

  it('deletes a subscription that the push service reports gone (410)', async () => {
    const err = Object.assign(new Error('gone'), { statusCode: 410 });
    const webpush = { sendNotification: vi.fn().mockRejectedValue(err) };
    const setMock = vi.fn().mockResolvedValue();
    const subs = [{ endpoint: 'https://push.example/dead', keys: { p256dh: 'x', auth: 'y' } }];
    const db = fakeDb({ subs, setMock });
    const { lisbonNow } = await import('../_lib/reminderSchedule.js');
    const userDoc = { reminderPrefs: { almoco: { time: lisbonNow(), enabled: true } } };
    await sendToUser(webpush, db, 'u1', userDoc);
    expect(db._subDocs[0].ref.delete).toHaveBeenCalled();
  });

  it('keeps a subscription on a non-410/404 error (transient failure)', async () => {
    const err = Object.assign(new Error('server error'), { statusCode: 500 });
    const webpush = { sendNotification: vi.fn().mockRejectedValue(err) };
    const setMock = vi.fn().mockResolvedValue();
    const subs = [{ endpoint: 'https://push.example/flaky', keys: { p256dh: 'x', auth: 'y' } }];
    const db = fakeDb({ subs, setMock });
    const { lisbonNow } = await import('../_lib/reminderSchedule.js');
    const userDoc = { reminderPrefs: { jantar: { time: lisbonNow(), enabled: true } } };
    await sendToUser(webpush, db, 'u1', userDoc);
    expect(db._subDocs[0].ref.delete).not.toHaveBeenCalled();
  });

  it('o push da carteira leva o valor já sincronizado hoje', async () => {
    const webpush = { sendNotification: vi.fn().mockResolvedValue() };
    const setMock = vi.fn().mockResolvedValue();
    const subs = [{ endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } }];
    const db = fakeDb({ subs, setMock });
    const { lisbonNow, lisbonToday } = await import('../_lib/reminderSchedule.js');
    const userDoc = {
      reminderPrefs: { t212: { time: lisbonNow(), enabled: true } },
      t212Sync: { enabled: true, lastReport: { date: lisbonToday(), valorAtual: 1200, positions: 3 } },
    };
    await sendToUser(webpush, db, 'u1', userDoc);
    const payload = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
    expect(payload.body).toMatch(/1[\s.]?200/);
  });
});
