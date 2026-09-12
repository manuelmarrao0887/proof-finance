import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { syncT212, cleanupManualPositions, isT212Position, looksLikeT212Manual } from './t212Sync.js';
import { makeFakeDb, fakeT212Fetch } from '../../src/test/fakeFirestore.js';

const SUMMARY = {
  currency: 'EUR',
  totalValue: 1300,
  cash: { availableToTrade: 100 },
  investments: { currentValue: 1200, totalCost: 1000, unrealizedProfitLoss: 200 },
};

const POS = [
  {
    instrument: { ticker: 'VWCE_EQ', name: 'Vanguard All-World', isin: 'IE00BK5BQT80', currency: 'EUR' },
    quantity: 10,
    walletImpact: { currency: 'EUR', currentValue: 1200, totalCost: 1000, unrealizedProfitLoss: 200 },
  },
];

const apiFetch = (o = {}) => fakeT212Fetch({ summary: SUMMARY, positions: POS, ...o });

let saved;
beforeEach(() => {
  saved = process.env.TRADING212_API_KEY;
  process.env.TRADING212_API_KEY = 'chave-de-teste';
});
afterEach(() => {
  if (saved === undefined) delete process.env.TRADING212_API_KEY;
  else process.env.TRADING212_API_KEY = saved;
});

describe('syncT212 — escreve a leitura e as posições', () => {
  it('grava a leitura do dia em t212Log com id determinístico', async () => {
    const f = makeFakeDb();
    await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    expect(f.readings()).toEqual([
      expect.objectContaining({ id: 't212-2026-09-12', baseCusto: 1000, valorAtual: 1200, date: '2026-09-12', source: 't212' }),
    ]);
  });

  it('correr duas vezes no mesmo dia atualiza a leitura em vez de duplicar', async () => {
    const f = makeFakeDb();
    await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    await syncT212(f.db, {
      uid: 'u1',
      date: '2026-09-12',
      fetchImpl: apiFetch({ summary: { ...SUMMARY, investments: { currentValue: 1250, totalCost: 1000 } } }),
    });
    expect(f.readings()).toHaveLength(1);
    expect(f.readings()[0].valorAtual).toBe(1250);
  });

  it('grava as posições com source t212 e preços na moeda da conta', async () => {
    const f = makeFakeDb();
    await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    expect(f.positions()).toEqual([
      expect.objectContaining({ id: 't212-VWCE_EQ', broker: 'Trading212', source: 't212', qty: 10, currentPrice: 120, avgPrice: 100 }),
    ]);
  });

  it('apaga a posição t212 de uma ação que já foi vendida', async () => {
    const f = makeFakeDb({
      positions: [
        { id: 't212-VWCE_EQ', asset: 'Vanguard All-World', source: 't212' },
        { id: 't212-AAPL_US_EQ', asset: 'Apple', source: 't212' },
      ],
    });
    await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    expect(f.positions().map((p) => p.id)).toEqual(['t212-VWCE_EQ']);
  });

  it('não toca nas posições manuais de outras corretoras', async () => {
    const f = makeFakeDb({ positions: [{ id: 'manual1', asset: 'BTC', broker: 'Kraken', qty: 1 }] });
    await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    expect(f.positions().find((p) => p.id === 'manual1')).toBeTruthy();
  });

  it('sinaliza as manuais que parecem ser da T212, para a limpeza da 1ª sync', async () => {
    const f = makeFakeDb({
      positions: [
        { id: 'm1', asset: 'VWCE', broker: 'Trading 212', qty: 5 },
        { id: 'm2', asset: 'Apple', broker: 't212', qty: 1 },
        { id: 'm3', asset: 'BTC', broker: 'Kraken', qty: 1 },
      ],
    });
    const report = await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    expect(report.manualCandidates.map((p) => p.id).sort()).toEqual(['m1', 'm2']);
    expect(f.positions().find((p) => p.id === 'm1')).toBeTruthy(); // sinaliza, não apaga
  });

  it('marca a sync no doc raiz para o cron saber que esta conta está ligada', async () => {
    const f = makeFakeDb();
    await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    expect(f.root().t212Sync.enabled).toBe(true);
    expect(f.root().t212Sync.lastSyncAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('devolve um relatório com o que fez', async () => {
    const f = makeFakeDb({ positions: [{ id: 't212-OLD_EQ', source: 't212' }] });
    const report = await syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch() });
    expect(report).toMatchObject({ date: '2026-09-12', valorAtual: 1200, baseCusto: 1000, positions: 1, removed: 1 });
  });

  it('sem data usa o dia de Lisboa (mesma fronteira de dia dos lembretes)', async () => {
    const f = makeFakeDb();
    const report = await syncT212(f.db, { uid: 'u1', fetchImpl: apiFetch() });
    expect(report.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('se a API falhar, não grava nada (nem leitura, nem meta)', async () => {
    const f = makeFakeDb();
    await expect(syncT212(f.db, { uid: 'u1', date: '2026-09-12', fetchImpl: apiFetch({ status: 401 }), sleep: async () => {} })).rejects.toThrow();
    expect(f.readings()).toEqual([]);
    expect(f.positions()).toEqual([]);
    expect(f.root().t212Sync).toBeUndefined();
    expect(f.commits()).toBe(0);
  });
});

describe('cleanupManualPositions — limpeza opcional da 1ª sync', () => {
  it('apaga só os ids pedidos', async () => {
    const f = makeFakeDb({ positions: [{ id: 'm1', broker: 'Trading 212' }, { id: 'm2', broker: 'Kraken' }] });
    const out = await cleanupManualPositions(f.db, { uid: 'u1', ids: ['m1'] });
    expect(out.removed).toBe(1);
    expect(f.positions().map((p) => p.id)).toEqual(['m2']);
  });

  it('recusa apagar uma posição gerida pela sync (essas são espelho, não lixo)', async () => {
    const f = makeFakeDb({ positions: [{ id: 't212-VWCE_EQ', source: 't212' }] });
    const out = await cleanupManualPositions(f.db, { uid: 'u1', ids: ['t212-VWCE_EQ'] });
    expect(out.removed).toBe(0);
    expect(f.positions()).toHaveLength(1);
  });

  it('ignora ids que não existem em vez de estourar', async () => {
    const f = makeFakeDb({ positions: [{ id: 'm1' }] });
    const out = await cleanupManualPositions(f.db, { uid: 'u1', ids: ['nao-existe'] });
    expect(out.removed).toBe(0);
  });

  it('lista vazia não faz commit nenhum', async () => {
    const f = makeFakeDb({ positions: [{ id: 'm1' }] });
    await cleanupManualPositions(f.db, { uid: 'u1', ids: [] });
    expect(f.commits()).toBe(0);
  });
});

describe('heurísticas de classificação', () => {
  it('reconhece as posições geridas pela sync', () => {
    expect(isT212Position({ source: 't212' })).toBe(true);
    expect(isT212Position({ id: 't212-VWCE_EQ' })).toBe(true);
    expect(isT212Position({ id: 'manual', broker: 'Kraken' })).toBe(false);
  });

  it('reconhece uma manual escrita à mão como sendo da T212', () => {
    expect(looksLikeT212Manual({ broker: 'Trading 212' })).toBe(true);
    expect(looksLikeT212Manual({ broker: 'trading212' })).toBe(true);
    expect(looksLikeT212Manual({ broker: 'T212' })).toBe(true);
    expect(looksLikeT212Manual({ broker: 'Trade Republic' })).toBe(false);
    expect(looksLikeT212Manual({ broker: '' })).toBe(false);
  });
});
