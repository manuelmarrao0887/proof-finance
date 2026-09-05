/* ════════════════════════════════════════════════════════════════════════
   ChartsView — "Património" tab (ex-"Gráficos"). Ported from rCharts
   (orig 993-1004); Task 11 mounts Hero (net-worth hero + alocação) and two
   blocks extracted from the Resumo on Task 10 (AccountsByCategory,
   EmergencyFundCard) above the original evolution charts.

   Stacks chrt() sparklines over getAllHist(state). chrt(...) returns an SVG
   HTML string, so each card's series are concatenated and rendered with
   dangerouslySetInnerHTML (kept identical to the original markup/math).
   chrt is passed getAllHist(s) as histData and fm as the number formatter.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { getAllHist, chrt } from '../lib/finance.js';
import { netWorthHistory } from '../lib/metrics.js';
import { fm } from '../lib/format.js';
import Hero from '../components/Hero.jsx';
import AccountsByCategory from '../components/overview/AccountsByCategory.jsx';
import EmergencyFundCard from '../components/overview/EmergencyFundCard.jsx';

export default function ChartsView() {
  const { state, currentUser } = useStore();
  const s = { ...state, currentUser };
  const ah = getAllHist(s);

  // Charts plot evolution over time — chrt() needs >= 2 dated snapshots to draw.
  // With 0 or 1 snapshot every series returns '' and the cards look empty, so
  // show an explicit empty state instead of blank cards. Hero/AccountsByCategory/
  // EmergencyFundCard read live balances (não dependem do histórico), por isso
  // aparecem sempre, mesmo sem 2 snapshots.
  if (ah.length < 2) {
    return (
      <div style={{ padding: '0 20px 40px' }}>
        <Hero />
        <AccountsByCategory />
        <EmergencyFundCard />
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

  // Histórico do património: o headline (valor atual) já vive na Hero, que
  // usa a MESMA fórmula de contas ao vivo (netWorth(s) === compute(s).nW) —
  // por isso este cartão já não repete o número, só o sparkline do
  // HISTÓRICO de snapshots (netWorthHistory), que é uma fonte diferente por
  // natureza e pode divergir do valor ao vivo (ver testes.html T46.3).
  const nws = netWorthHistory(s);
  const hidden = !!state.balancesHidden;

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <Hero />
      <AccountsByCategory />
      <EmergencyFundCard />
      {!hidden && nws.length > 1 && (
        <div className="cd" style={{ marginBottom: 12 }}>
          <div className="lb" style={{ marginBottom: 8 }}>Histórico do património</div>
          <div dangerouslySetInnerHTML={{ __html: chrt(nws.map((p) => p.net), 'var(--primary)', 'histórico de snapshots', nws, fm) }} />
        </div>
      )}
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
