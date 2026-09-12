import { describe, it, expect, vi } from 'vitest';
import { syncEnabledUsers, isAuthorizedCron } from './t212.js';
import { makeFakeDb } from '../../src/test/fakeFirestore.js';

describe('syncEnabledUsers — o cron só toca em quem ligou a sync', () => {
  it('sincroniza apenas os utilizadores com t212Sync.enabled', async () => {
    const f = makeFakeDb({
      users: [
        { id: 'u1', t212Sync: { enabled: true } },
        { id: 'u2' },
        { id: 'u3', t212Sync: { enabled: false } },
      ],
    });
    const seen = [];
    const out = await syncEnabledUsers(f.db, { syncImpl: async (_db, { uid }) => (seen.push(uid), { positions: 1 }) });
    expect(seen).toEqual(['u1']);
    expect(out).toMatchObject({ users: 1, synced: 1, failed: 0 });
  });

  it('uma conta que falha não impede as outras', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = makeFakeDb({
      users: [
        { id: 'u1', t212Sync: { enabled: true } },
        { id: 'u2', t212Sync: { enabled: true } },
      ],
    });
    const ok = [];
    const out = await syncEnabledUsers(f.db, {
      syncImpl: async (_db, { uid }) => {
        if (uid === 'u1') throw new Error('429 da T212');
        ok.push(uid);
        return { positions: 2 };
      },
    });
    expect(ok).toEqual(['u2']);
    expect(out).toMatchObject({ users: 2, synced: 1, failed: 1 });
    expect(quiet).toHaveBeenCalled(); // a falha é registada, não engolida
    quiet.mockRestore();
  });

  it('sem ninguém ligado, não chama a API nem falha', async () => {
    const f = makeFakeDb({ users: [{ id: 'u1' }] });
    let called = 0;
    const out = await syncEnabledUsers(f.db, { syncImpl: async () => (called++, {}) });
    expect(called).toBe(0);
    expect(out).toMatchObject({ users: 0, synced: 0, failed: 0 });
  });
});

describe('autorização do cron', () => {
  it('reutiliza a verificação do CRON_SECRET dos lembretes (mesma função)', async () => {
    const reminders = await import('./reminders.js');
    expect(isAuthorizedCron).toBe(reminders.isAuthorizedCron);
  });
});
