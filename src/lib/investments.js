/* ════════════════════════════════════════════════════════════════════════
   Investimentos — posições detalhadas. Posição:
   { id, broker, asset, qty, avgPrice, currentPrice }. Funções puras.
   ════════════════════════════════════════════════════════════════════════ */

const n = (v) => Number(v) || 0;

export function positionValue(p) {
  return n(p && p.qty) * n(p && p.currentPrice);
}
export function positionCost(p) {
  return n(p && p.qty) * n(p && p.avgPrice);
}
export function positionPL(p) {
  return positionValue(p) - positionCost(p);
}
export function positionPLPct(p) {
  const c = positionCost(p);
  return c > 0 ? (positionPL(p) / c) * 100 : 0;
}

export function totalValue(positions) {
  return (positions || []).reduce((s, p) => s + positionValue(p), 0);
}
export function totalCost(positions) {
  return (positions || []).reduce((s, p) => s + positionCost(p), 0);
}
export function totalPL(positions) {
  return totalValue(positions) - totalCost(positions);
}
export function totalPLPct(positions) {
  const c = totalCost(positions);
  return c > 0 ? (totalPL(positions) / c) * 100 : 0;
}

// Posições com value/pct (alocação), ordenadas por valor desc.
export function withAllocation(positions) {
  const t = totalValue(positions);
  return (positions || [])
    .map((p) => ({ ...p, value: positionValue(p), pl: positionPL(p), plPct: positionPLPct(p), pct: t > 0 ? (positionValue(p) / t) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* ── Avisos de carteira ──────────────────────────────────────────────────
   Riscos que se veem só olhando para a composição. Cada aviso:
   { id, tone:'alert'|'warn'|'info', title, detail }

   Limiares: uma posição acima de 40% do total é concentração relevante;
   acima de 60% é grave. Um único ativo, ou um único broker, também conta. */
export function portfolioWarnings(positions) {
  const list = withAllocation(positions);
  if (list.length === 0) return [];
  const total = totalValue(positions);
  if (total <= 0) return [];
  const out = [];

  // Concentração numa posição.
  const top = list[0];
  if (list.length > 1 && top.pct >= 40) {
    out.push({
      id: 'conc-' + (top.id || top.asset),
      tone: top.pct >= 60 ? 'alert' : 'warn',
      title: top.asset + ' é ' + Math.round(top.pct) + '% da carteira',
      detail: 'Concentração elevada: uma queda deste ativo arrasta a carteira toda. Diversificar reduz o risco.',
    });
  }

  // Carteira com uma única posição.
  if (list.length === 1) {
    out.push({
      id: 'single',
      tone: 'warn',
      title: 'Só tens uma posição',
      detail: 'Toda a carteira está em ' + list[0].asset + '. Considera diversificar por mais ativos.',
    });
  }

  // Tudo no mesmo broker (risco de contraparte/operacional).
  const brokers = Array.from(new Set(list.map((p) => (p.broker || '').trim()).filter(Boolean)));
  if (brokers.length === 1 && list.length > 2) {
    out.push({
      id: 'broker-' + brokers[0],
      tone: 'info',
      title: 'Tudo em ' + brokers[0],
      detail: 'Todas as posições estão na mesma corretora. Repartir por duas reduz o risco operacional.',
    });
  }

  // Posições muito abaixo de água (para decidir com dados, não com emoção).
  const deep = list.filter((p) => p.plPct <= -25);
  if (deep.length) {
    const worst = deep.sort((a, b) => a.plPct - b.plPct)[0];
    out.push({
      id: 'down-' + (worst.id || worst.asset),
      tone: 'info',
      title: worst.asset + ' está ' + Math.round(worst.plPct) + '%',
      detail:
        deep.length === 1
          ? 'Perda não realizada de ' + Math.abs(worst.pl).toFixed(0) + '€. Revê a tese de investimento.'
          : deep.length + ' posições abaixo de −25%. Revê as teses de investimento.',
    });
  }

  return out;
}
