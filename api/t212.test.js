import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleT212, assertT212Owner } from './t212.js';
import { makeFakeDb, fakeT212Fetch } from '../src/test/fakeFirestore.js';

const SUMMARY = { currency: 'EUR', cash: { availableToTrade: 50 }, investments: { currentValue: 900, totalCost: 800 } };
const POS = [{ instrument: { ticker: 'VWCE_EQ', name: 'Vanguard All-World', currency: 'EUR' }, quantity: 5, walletImpact: { currency: 'EUR', currentValue: 900, totalCost: 800 } }];
const apiFetch = (o = {}) => fakeT212Fetch({ summary: SUMMARY, positions: POS, ...o });

const ENV = ['TRADING212_API_KEY', 'TRADING212_API_SECRET', 'TRADING212_ENV', 'TRADING212_OWNER_EMAIL'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  ENV.forEach((k) => delete process.env[k]);
  process.env.TRADING212_API_KEY = 'chave-de-teste';
});
afterEach(() => {
  ENV.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

const ctx = (f, extra) => ({ uid: 'u1', email: 'eu@exemplo.pt', db: f.db, fetchImpl: apiFetch(), sleep: async () => {}, ...(extra || {}) });

describe('handleT212 — ações do endpoint', () => {
  it('action desconhecida é recusada com 400', async () => {
    const f = makeFakeDb();
    await expect(handleT212('apagar_tudo', {}, ctx(f))).rejects.toMatchObject({ status: 400 });
  });

  it('status diz se está configurada, em que ambiente, e quando foi a última sync', async () => {
    process.env.TRADING212_ENV = 'demo';
    const f = makeFakeDb({ root: { t212Sync: { enabled: true, lastSyncAt: '2026-09-11T18:00:00.000Z' } } });
    const out = await handleT212('status', {}, ctx(f));
    expect(out).toMatchObject({ configured: true, env: 'demo', enabled: true, lastSyncAt: '2026-09-11T18:00:00.000Z' });
  });

  it('status funciona sem chave configurada, em vez de estourar', async () => {
    delete process.env.TRADING212_API_KEY;
    const f = makeFakeDb();
    const out = await handleT212('status', {}, ctx(f));
    expect(out.configured).toBe(false);
    expect(out.enabled).toBe(false);
  });

  it('sync devolve o relatório e grava a leitura', async () => {
    const f = makeFakeDb();
    const out = await handleT212('sync', {}, ctx(f));
    expect(out.report).toMatchObject({ valorAtual: 900, baseCusto: 800, positions: 1 });
    expect(f.readings()).toHaveLength(1);
  });

  it('sync sem chave configurada devolve 503 e não escreve', async () => {
    delete process.env.TRADING212_API_KEY;
    const f = makeFakeDb();
    await expect(handleT212('sync', {}, ctx(f))).rejects.toMatchObject({ status: 503 });
    expect(f.readings()).toEqual([]);
  });

  it('cleanup_manual apaga as manuais escolhidas', async () => {
    const f = makeFakeDb({ positions: [{ id: 'm1', broker: 'Trading 212' }] });
    const out = await handleT212('cleanup_manual', { ids: ['m1'] }, ctx(f));
    expect(out.removed).toBe(1);
    expect(f.positions()).toEqual([]);
  });

  it('cleanup_manual sem ids é recusado com 400', async () => {
    const f = makeFakeDb();
    await expect(handleT212('cleanup_manual', {}, ctx(f))).rejects.toMatchObject({ status: 400 });
  });
});

describe('assertT212Owner — a chave é de uma conta só', () => {
  it('sem TRADING212_OWNER_EMAIL, qualquer email da allowlist passa', () => {
    expect(() => assertT212Owner('qualquer@exemplo.pt')).not.toThrow();
  });

  it('com o dono definido, outro email da allowlist é recusado com 403', () => {
    process.env.TRADING212_OWNER_EMAIL = 'dono@exemplo.pt';
    expect(() => assertT212Owner('outro@exemplo.pt')).toThrow(/carteira|acesso/i);
    try {
      assertT212Owner('outro@exemplo.pt');
    } catch (e) {
      expect(e.status).toBe(403);
    }
  });

  it('compara sem distinguir maiúsculas nem espaços', () => {
    process.env.TRADING212_OWNER_EMAIL = ' Dono@Exemplo.PT ';
    expect(() => assertT212Owner('dono@exemplo.pt')).not.toThrow();
  });
});
