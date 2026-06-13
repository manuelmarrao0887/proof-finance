/* ════════════════════════════════════════════════════════════════════════
   ChartsView — "Gráficos" tab. Ported from rCharts (orig 993-1004).

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

  // Charts plot evolution over time — chrt() needs >= 2 dated snapshots to draw.
  // With 0 or 1 snapshot every series returns '' and the cards look empty, so
  // show an explicit empty state instead of blank cards.
  if (ah.length < 2) {
    return (
      <div style={{ padding: '0 20px 40px' }}>
        <div className="cd" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: 'var(--blue-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="4" y1="20" x2="4" y2="10" />
              <line x1="10" y1="20" x2="10" y2="4" />
              <line x1="16" y1="20" x2="16" y2="14" />
              <line x1="20" y1="20" x2="4" y2="20" />
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Sem dados suficientes</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
            Os gráficos mostram a evolução do teu património ao longo do tempo.
            Precisas de pelo menos <b>2 registos</b> em datas diferentes.
            Atualiza os teus saldos algumas vezes (no assistente IA) e a evolução
            aparece aqui.
          </div>
        </div>
      </div>
    );
  }

  // Net-worth evolution card (orig 996-998).
  const evoHtml =
    chrt(ah.map((x) => x.liq + x.poup + x.inv), '#3fc97a', 'Ativos Totais', ah, fm) +
    chrt(ah.map((x) => x.liq + x.poup + x.inv - x.div), '#3b6fee', 'Património Liquido', ah, fm);

  // Investments card (orig 999-1002).
  const invHtml =
    chrt(ah.map((x) => x.xP), '#3fc97a', 'XTB Planos', ah, fm) +
    chrt(ah.map((x) => x.xT), '#f5a623', 'XTB Transações', ah, fm) +
    chrt(ah.map((x) => x.tC), '#7b5fe0', 'TR Corretagem', ah, fm);

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <div className="cd" style={{ marginBottom: 12 }}>
        <div className="lb" style={{ marginBottom: 16 }}>
          Evolução patrimonial
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
