/* ════════════════════════════════════════════════════════════════════════
   InvestmentsView — posições de investimento detalhadas: valor total, P&L e
   alocação por ativo. Respeita o ocultar-saldos.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { fc } from '../lib/format.js';
import { totalValue, totalPL, totalPLPct, withAllocation, portfolioWarnings } from '../lib/investments.js';
import { AssetLogo } from '../components/MerchantLogo.jsx';

export default function InvestmentsView() {
  const { state } = useStore();
  const { open } = useUI();
  const positions = state.positions || [];
  const hidden = !!state.balancesHidden;
  const mv = (v) => (hidden ? '••••' : fc(v));

  const tv = totalValue(positions);
  const tpl = totalPL(positions);
  const tplPct = totalPLPct(positions);
  const rows = withAllocation(positions);
  // Riscos visíveis na composição (concentração, corretora única, quedas fortes).
  const warnings = portfolioWarnings(positions);
  const WTONE = { alert: 'var(--signal)', warn: 'var(--warning)', info: 'var(--primary)' };
  const plColor = tpl >= 0 ? 'var(--success)' : 'var(--signal)';

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      {/* Total */}
      <div className="cd" style={{ marginBottom: 16 }}>
        <div className="rw">
          <div className="lb">Carteira</div>
          <button type="button" onClick={() => open('position')} style={{ padding: '7px 12px', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Posição</button>
        </div>
        <div className="m" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>{mv(tv)}</div>
        {!hidden && positions.length > 0 && (
          <div className="m" style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: plColor }}>
            {(tpl >= 0 ? '+' : '') + fc(tpl)} ({(tpl >= 0 ? '+' : '') + tplPct.toFixed(1)}%)
          </div>
        )}
      </div>

      {/* Avisos de carteira */}
      {warnings.length > 0 && !hidden && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {warnings.map((w) => (
            <div key={w.id} className="cd" style={{ padding: '11px 13px', borderLeft: '3px solid ' + WTONE[w.tone] }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: WTONE[w.tone], marginBottom: 2 }}>{w.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 }}>{w.detail}</div>
            </div>
          ))}
        </div>
      )}

      {positions.length === 0 ? (
        <div className="empty" style={{ padding: '40px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sem posições</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Adiciona ações, ETFs ou cripto com quantidade, preço médio e preço atual.</div>
        </div>
      ) : (
        rows.map((p) => (
          <button key={p.id} type="button" onClick={() => open('position', { id: p.id })} className="cd" style={{ width: '100%', textAlign: 'left', marginBottom: 8, padding: '14px 16px', display: 'block', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <div className="rw" style={{ gap: 10 }}>
              <AssetLogo ticker={p.asset} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, display: 'block' }}>{p.asset}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  {p.qty} un.
                  {p.broker ? <span className="chip" style={{ padding: '0 7px', fontSize: 10, background: 'var(--elevated)', color: 'var(--text2)', border: 'none' }}>{p.broker}</span> : null}
                </span>
              </span>
              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                <span className="m" style={{ fontSize: 14, fontWeight: 700, display: 'block' }}>{mv(p.value)}</span>
                {!hidden && (
                  <>
                    {/* O ganho/perda em euros — a percentagem sozinha não diz
                        quanto dinheiro está em jogo. Escondido com os saldos. */}
                    <span className="m" style={{ display: 'block', fontSize: 11, fontWeight: 700, marginTop: 2, color: p.pl >= 0 ? 'var(--success)' : 'var(--signal)' }}>
                      {(p.pl >= 0 ? '+' : '') + fc(p.pl)}
                    </span>
                    <span className="chip" style={{ marginTop: 3, padding: '1px 7px', fontSize: 10, fontWeight: 700, border: 'none', background: p.pl >= 0 ? 'var(--success-soft)' : 'var(--signal-soft)', color: p.pl >= 0 ? 'var(--success)' : 'var(--signal)' }}>
                      {(p.pl >= 0 ? '+' : '') + p.plPct.toFixed(1) + '%'}
                    </span>
                  </>
                )}
              </span>
            </div>
            <div className="bar" style={{ height: 5, marginTop: 10 }}>
              <div className="bar-fill" style={{ width: Math.min(p.pct, 100) + '%', background: 'var(--secondary)' }} />
            </div>
            <div className="m" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{p.pct.toFixed(0)}% da carteira</div>
          </button>
        ))
      )}
    </div>
  );
}
