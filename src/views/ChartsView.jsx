/* ════════════════════════════════════════════════════════════════════════
   ChartsView — "Gráficos" tab. Ported from rCharts (orig 993-1004).

   Stacks chrt() sparklines over getAllHist(state). chrt(...) returns an SVG
   HTML string, so each card's series are concatenated and rendered with
   dangerouslySetInnerHTML (kept identical to the original markup/math).
   chrt is passed getAllHist(s) as histData and fm as the number formatter.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { getAllHist, chrt, netWorthSeries } from '../lib/finance.js';
import { fm, fc } from '../lib/format.js';

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
    chrt(ah.map((x) => x.liq + x.poup + x.inv), 'var(--success)', 'Ativos Totais', ah, fm) +
    chrt(ah.map((x) => x.liq + x.poup + x.inv - x.div), 'var(--primary)', 'Património Líquido', ah, fm);

  // Investments card (orig 999-1002).
  const invHtml =
    chrt(ah.map((x) => x.xP), 'var(--success)', 'XTB Planos', ah, fm) +
    chrt(ah.map((x) => x.xT), 'var(--warning)', 'XTB Transações', ah, fm) +
    chrt(ah.map((x) => x.tC), 'var(--secondary)', 'TR Corretagem', ah, fm);

  // Património (net worth) timeline — valor atual + variação desde o início.
  const nws = netWorthSeries(s);
  const curNet = nws.length ? nws[nws.length - 1].net : 0;
  const firstNet = nws.length ? nws[0].net : 0;
  const delta = curNet - firstNet;
  const hidden = !!state.balancesHidden;

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <div className="cd" style={{ marginBottom: 12 }}>
        <div className="lb" style={{ marginBottom: 8 }}>Património</div>
        <div className="m" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {hidden ? '••••' : fc(curNet)}
        </div>
        {!hidden && (
          <div className="m" style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: delta >= 0 ? 'var(--success)' : 'var(--signal)' }}>
            {(delta >= 0 ? '+' : '') + fc(delta)} desde o início
          </div>
        )}
        {!hidden && (
          <div style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: chrt(nws.map((p) => p.net), 'var(--primary)', 'Património líquido', nws, fm) }} />
        )}
      </div>
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
