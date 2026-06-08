/* ════════════════════════════════════════════════════════════════════════
   Hero — net-worth hero + asset-allocation bar.

   Ported from the overview branch of renderInternal (orig 2892-2919): the big
   "Patrimonio Liquido" number, the up/down delta chip, a mini net-worth
   sparkline, and the compact asset-allocation bar (by category, coloured via
   `cCol`). Default export, reads everything from the store (no props).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { compute, isNewUser, cCol } from '../lib/finance.js';
import { fm, fc } from '../lib/format.js';

export default function Hero() {
  const { state, currentUser } = useStore();
  const s = { ...state, currentUser };
  const C = compute(s);
  const newU = isNewUser(s);

  // Delta percentage relative to the base net worth (orig 2894-2896).
  const lastH = C.hist[C.hist.length - 1] || { liq: 0, poup: 0, inv: 0, div: 0 };
  const baseNW = lastH.liq + lastH.poup + lastH.inv - C.aD || 1;
  const heroPct =
    (C.aD >= 0 ? '+' : '') +
    (C.tA > 0 ? ((C.aD / Math.abs(baseNW)) * 100).toFixed(1) : '0') +
    '%';

  // Mini net-worth sparkline points (orig 2904-2908).
  const nwSeries = C.hist.map((x) => x.liq + x.poup + x.inv - x.div);
  let sparkPts = '';
  if (nwSeries.length > 1) {
    const mn = Math.min.apply(null, nwSeries);
    const mx = Math.max.apply(null, nwSeries);
    const rg = mx - mn || 1;
    sparkPts = nwSeries
      .map(
        (v, i) =>
          ((i / (nwSeries.length - 1)) * 100).toFixed(1) +
          ',' +
          (24 - ((v - mn) / rg) * 22).toFixed(1)
      )
      .join(' ');
  }

  const cats = Object.keys(C.cT);

  return (
    <>
      <div className="hero fadeUp" style={{ margin: '6px 16px 16px' }}>
        <div className="rw" style={{ marginBottom: 10, position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            Patrimonio Liquido
          </div>
          {!newU && (
            <div className={'chip ' + (C.aD >= 0 ? 'up' : 'down')} aria-label={'Variacao ' + heroPct}>
              {C.aD >= 0 ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
              {heroPct}
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {fm(C.nW)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6, position: 'relative', zIndex: 1 }}>
          Ativos {fc(C.tA)}
          {C.loan.out > 0 ? ' · Divida ' + fc(C.loan.out) : ''}
        </div>
        {nwSeries.length > 1 && (
          <svg
            viewBox="0 0 100 28"
            preserveAspectRatio="none"
            style={{ width: '100%', height: 32, marginTop: 14, position: 'relative', zIndex: 1 }}
            aria-hidden="true"
          >
            <polyline
              points={sparkPts}
              fill="none"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Asset allocation bar (compact) — only when there are assets. */}
      {C.tA > 0 && (
        <div style={{ padding: '0 20px 16px' }}>
          <div
            style={{ display: 'flex', height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}
            aria-hidden="true"
          >
            {cats.map((c) => (
              <div
                key={c}
                style={{ width: (C.cT[c] / C.tA) * 100 + '%', background: cCol[c] || '#8A8E99' }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
            {cats.map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cCol[c] || '#8A8E99' }} />
                <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>
                  {c} {((C.cT[c] / C.tA) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
