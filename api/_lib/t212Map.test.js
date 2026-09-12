import { describe, it, expect } from 'vitest';
import { mapSummaryToReading, mapPositions, t212PositionId } from './t212Map.js';

/* Respostas reais da API v0 da Trading212 (formas confirmadas nos docs a
   2026-09-12). AccountSummary: valores na moeda primária da conta.
   Position: averagePricePaid/currentPrice na moeda do INSTRUMENTO,
   walletImpact.* na moeda da conta. */

const SUMMARY = {
  id: 12345678,
  currency: 'EUR',
  totalValue: 5321.4,
  cash: { availableToTrade: 120.5, inPies: 0, reservedForOrders: 0 },
  investments: { currentValue: 5200.9, totalCost: 4800.25, unrealizedProfitLoss: 400.65, realizedProfitLoss: 12.3 },
};

describe('mapSummaryToReading — account/summary → leitura do t212Log', () => {
  it('usa totalCost como base de custo e currentValue como valor atual', () => {
    const r = mapSummaryToReading(SUMMARY, '2026-09-12');
    expect(r.baseCusto).toBe(4800.25);
    expect(r.valorAtual).toBe(5200.9);
    expect(r.date).toBe('2026-09-12');
  });

  it('marca a leitura como vinda da sync (source t212)', () => {
    expect(mapSummaryToReading(SUMMARY, '2026-09-12').source).toBe('t212');
  });

  it('dá o mesmo id para a mesma data — a sync diária faz upsert, não duplica', () => {
    const a = mapSummaryToReading(SUMMARY, '2026-09-12');
    const b = mapSummaryToReading({ ...SUMMARY, investments: { currentValue: 5999, totalCost: 4800.25 } }, '2026-09-12');
    expect(a.id).toBe(b.id);
    expect(mapSummaryToReading(SUMMARY, '2026-09-13').id).not.toBe(a.id);
  });

  it('sem bloco investments, devolve zeros em vez de NaN', () => {
    const r = mapSummaryToReading({ currency: 'EUR' }, '2026-09-12');
    expect(r.baseCusto).toBe(0);
    expect(r.valorAtual).toBe(0);
  });
});

const POS_EUR = {
  instrument: { ticker: 'VWCE_EQ', name: 'Vanguard FTSE All-World', isin: 'IE00BK5BQT80', currency: 'EUR' },
  quantity: 10,
  quantityAvailableForTrading: 10,
  quantityInPies: 0,
  averagePricePaid: 100,
  currentPrice: 120,
  createdAt: '2026-01-05T10:00:00Z',
  walletImpact: { currency: 'EUR', currentValue: 1200, totalCost: 1000, unrealizedProfitLoss: 200, fxImpact: 0 },
};

// Instrumento em USD numa conta em EUR: os preços por ação vêm em USD, mas
// o valor/custo na carteira vêm em EUR. Guardar o preço em USD faria
// qty × currentPrice dar um total em moeda errada nos gráficos.
const POS_USD = {
  instrument: { ticker: 'AAPL_US_EQ', name: 'Apple', isin: 'US0378331005', currency: 'USD' },
  quantity: 2,
  averagePricePaid: 150,
  currentPrice: 200,
  walletImpact: { currency: 'EUR', currentValue: 368, totalCost: 276, unrealizedProfitLoss: 92, fxImpact: -4 },
};

describe('mapPositions — positions → posições da vista Investimentos', () => {
  it('mapeia ticker, nome, quantidade e corretora', () => {
    const [p] = mapPositions([POS_EUR]);
    expect(p.asset).toBe('Vanguard FTSE All-World');
    expect(p.ticker).toBe('VWCE_EQ');
    expect(p.qty).toBe(10);
    expect(p.broker).toBe('Trading212');
    expect(p.source).toBe('t212');
  });

  it('grava preços na moeda da CONTA, para qty × currentPrice dar o valor real', () => {
    const [p] = mapPositions([POS_USD]);
    expect(p.avgPrice).toBe(138); // 276 EUR / 2
    expect(p.currentPrice).toBe(184); // 368 EUR / 2
    expect(p.qty * p.currentPrice).toBe(368);
    expect(p.qty * p.avgPrice).toBe(276);
    expect(p.currency).toBe('EUR');
  });

  it('sem walletImpact, cai para os preços por ação da API', () => {
    const [p] = mapPositions([{ ...POS_EUR, walletImpact: undefined }]);
    expect(p.avgPrice).toBe(100);
    expect(p.currentPrice).toBe(120);
  });

  it('quantidade 0 não gera NaN nem Infinity', () => {
    const [p] = mapPositions([{ ...POS_EUR, quantity: 0, walletImpact: { currency: 'EUR', currentValue: 0, totalCost: 0 } }]);
    expect(p.qty).toBe(0);
    expect(p.avgPrice).toBe(0);
    expect(p.currentPrice).toBe(0);
  });

  it('dá ids estáveis por ticker — a sync seguinte atualiza a mesma linha', () => {
    const a = mapPositions([POS_EUR])[0];
    const b = mapPositions([{ ...POS_EUR, quantity: 11, walletImpact: { ...POS_EUR.walletImpact, currentValue: 1320 } }])[0];
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(t212PositionId('VWCE_EQ'));
  });

  it('sanitiza caracteres inválidos num id de documento Firestore', () => {
    expect(t212PositionId('A/B_US_EQ')).not.toContain('/');
  });

  it('ignora entradas sem instrumento e aceita lista vazia', () => {
    expect(mapPositions([])).toEqual([]);
    expect(mapPositions(undefined)).toEqual([]);
    expect(mapPositions([null, { quantity: 1 }, POS_EUR])).toHaveLength(1);
  });

  it('arredonda o preço derivado para não arrastar ruído de vírgula flutuante', () => {
    const [p] = mapPositions([
      { instrument: { ticker: 'X_EQ', name: 'X', currency: 'EUR' }, quantity: 3, walletImpact: { currency: 'EUR', currentValue: 10, totalCost: 10 } },
    ]);
    expect(p.currentPrice).toBe(3.333333);
  });
});
