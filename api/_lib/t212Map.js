/* ════════════════════════════════════════════════════════════════════════
   t212Map — traduz as respostas da API v0 da Trading212 para a forma que a
   app já usa. Funções PURAS (sem rede, sem Firestore) → testáveis sozinhas.

   Duas regras não-óbvias, ambas dos docs (confirmados 2026-09-12):

   1. Ids determinísticos. A leitura é `t212-<data>` e a posição
      `t212-<ticker>`: a sync diária faz upsert na mesma linha em vez de
      empilhar duplicados, e uma posição que se mantém conserva o id entre
      syncs (o diff do cliente em src/firebase/data.js compara por id).

   2. Preços na moeda da CONTA. `averagePricePaid`/`currentPrice` vêm na
      moeda do instrumento, mas `walletImpact.*` vem na moeda da conta. A
      app calcula valor como qty × currentPrice (src/lib/investments.js), por
      isso guardamos o preço derivado de walletImpact — senão uma posição em
      USD numa conta em EUR somaria dólares ao património em euros.
   ════════════════════════════════════════════════════════════════════════ */

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// 6 casas: precisão suficiente para preços por ação derivados de uma divisão
// e sem arrastar o ruído binário (10/3 → 3.333333, não 3.3333333333333335).
const round6 = (v) => Math.round(n(v) * 1e6) / 1e6;

// Ids de documento Firestore não podem conter '/' (nem ser '.'/'..'). Os
// tickers da T212 são alfanuméricos com '_' e '.', mas não confiamos nisso.
export function t212PositionId(ticker) {
  return 't212-' + String(ticker || 'sem-ticker').replace(/[^A-Za-z0-9._-]/g, '_');
}

export function t212ReadingId(date) {
  return 't212-' + String(date || '').slice(0, 10);
}

// GET /api/v0/equity/account/summary → leitura do t212Log
// { id, baseCusto, valorAtual, date, createdAt, source }
export function mapSummaryToReading(summary, date) {
  const inv = (summary && summary.investments) || {};
  return {
    id: t212ReadingId(date),
    baseCusto: round6(inv.totalCost),
    valorAtual: round6(inv.currentValue),
    date,
    createdAt: Date.now(),
    source: 't212',
  };
}

// GET /api/v0/equity/positions → posições da vista Investimentos
// { id, broker, asset, qty, avgPrice, currentPrice, source, ticker, isin, currency }
export function mapPositions(positions) {
  return (positions || [])
    .filter((p) => p && p.instrument && p.instrument.ticker)
    .map((p) => {
      const inst = p.instrument;
      const w = p.walletImpact || null;
      const qty = n(p.quantity);
      // Preço por ação na moeda da conta. Sem walletImpact (conta e
      // instrumento na mesma moeda), os preços da API já servem.
      const derive = (walletTotal, perShare) => {
        if (!w) return round6(perShare);
        if (qty === 0) return 0;
        return round6(n(walletTotal) / qty);
      };
      return {
        id: t212PositionId(inst.ticker),
        broker: 'Trading212',
        asset: inst.name || inst.ticker,
        qty,
        avgPrice: derive(w && w.totalCost, p.averagePricePaid),
        currentPrice: derive(w && w.currentValue, p.currentPrice),
        source: 't212',
        ticker: inst.ticker,
        isin: inst.isin || '',
        currency: (w && w.currency) || inst.currency || '',
      };
    });
}
