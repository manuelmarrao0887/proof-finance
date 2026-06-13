/* ════════════════════════════════════════════════════════════════════════
   ChartsView — "Graficos" tab. Ported from rCharts (orig 993-1004).

   Stacks chrt() sparklines over getAllHist(state). chrt(...) returns an SVG
   HTML string, so each card's series are concatenated and rendered with
   dangerouslySetInnerHTML (kept identical to the original markup/math).
   chrt is passed getAllHist(s) as histData and fm as the number formatter.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { getAllHist, chrt } from '../lib/finance.js';
import { fm } from '../lib/format.js';

export default function ChartsView() {
  const { state, currentUser } = useStore();
  const s = { ...state, currentUser };
  const ah = getAllHist(s);

  // Net-worth evolution card (orig 996-998).
  const evoHtml =
    chrt(ah.map((x) => x.liq + x.poup + x.inv), '#22c55e', 'Ativos Totais', ah, fm) +
    chrt(ah.map((x) => x.liq + x.poup + x.inv - x.div), 'var(--text)', 'Patrimonio Liquido', ah, fm);

  // Investments card (orig 999-1002).
  const invHtml =
    chrt(ah.map((x) => x.xP), '#22c55e', 'XTB Planos', ah, fm) +
    chrt(ah.map((x) => x.xT), '#F59E0B', 'XTB Transacoes', ah, fm) +
    chrt(ah.map((x) => x.tC), '#0b1220', 'TR Corretagem', ah, fm);

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <div className="cd" style={{ marginBottom: 12 }}>
        <div className="lb" style={{ marginBottom: 16 }}>
          Evolucao patrimonial
        </div>
        <div dangerouslySetInnerHTML={{ __html: evoHtml }} />
      </div>
      <div className="cd">
        <div className="lb" style={{ marginBottom: 16 }}>
          Investimentos
        </div>
        <div dangerouslySetInnerHTML={{ __html: invHtml }} />
      </div>
    </div>
  );
}
