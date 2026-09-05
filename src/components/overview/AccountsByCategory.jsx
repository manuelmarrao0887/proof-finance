/* ════════════════════════════════════════════════════════════════════════
   AccountsByCategory — "Contas por categoria": um acordeão por categoria de
   conta com o detalhe (histórico de saldos, editar, remover).

   Extraído do OverviewView na Task 10 sem alterar o JSX nem as ações. A
   remoção mantém-se como na Task 8: ConfirmSheet + snapshot das fatias
   afetadas + toast com "Anular".
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo, useState } from 'react';
import { useStore } from '../../store/store.jsx';
import { useUI } from '../../store/ui.jsx';
import { compute, cCol, acctCatLabel } from '../../lib/finance.js';
import { fc, fm, mask, maskPct } from '../../lib/format.js';
import { snapshotSlices } from '../../lib/snapshot.js';
import { useToast } from '../Toast.jsx';
import { useConfirm } from '../ConfirmSheet.jsx';
import Icon from '../Icon.jsx';

/* ── Edit (pencil) icon for custom accounts ──────────────────────────────── */
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const Chevron = ({ open }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--text3)"
    strokeWidth="2.2"
    strokeLinecap="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function AccountsByCategory() {
  const { state, actions, currentUser } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const confirm = useConfirm();
  const [xCat, setXCat] = useState(null); // categoria expandida (orig xCat global)

  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const C = useMemo(() => compute(s), [s]);
  const cats = Object.keys(C.grp);
  const hidden = !!state.balancesHidden;

  if (cats.length === 0) return null;

  return (
    <>
      <div className="lb" style={{ marginBottom: 'var(--space-3)', paddingLeft: 'var(--space-2)' }}>Contas por categoria</div>
      {cats.map((cat) => {
        const items = C.grp[cat];
        const isX = xCat === cat;
        const pctOfAssets = C.tA > 0 ? (C.cT[cat] / C.tA) * 100 : 0;
        return (
          <div key={cat} style={{ marginBottom: 'var(--space-3)' }}>
            <button
              type="button"
              onClick={() => setXCat(isX ? null : cat)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg2)',
                border: 'none',
                borderRadius: isX ? 'var(--r) var(--r) 0 0' : 'var(--r)',
                padding: 'var(--space-4) var(--space-5)',
                color: 'var(--text)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', textAlign: 'left' }}>
                <div style={{ width: 8, height: 40, borderRadius: 4, background: cCol[cat] || 'var(--fg-subtle)' }} />
                <div>
                  <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{acctCatLabel(cat)}</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text3)', marginTop: 'var(--space-1)' }}>
                    {items.length} contas · {maskPct(pctOfAssets, hidden)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>{mask(C.cT[cat], hidden, fc)}</span>
                <Chevron open={isX} />
              </div>
            </button>
            {isX && (
              <div className="fadeIn" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
                {items.map((a, i) => (
                  <div key={a.id || a.b + '_' + a.t + '_' + i} className="rw" style={{ padding: 'var(--space-4) var(--space-5)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 500 }}>{a.b}</div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-subtle)', marginTop: 'var(--space-1)' }}>
                        {a.t}
                        {a.currency && a.currency !== 'EUR' ? (
                          <>
                            {' · '}
                            <span className="m" style={{ fontSize: 'var(--fs-xs)' }}>{a.currency}</span>
                          </>
                        ) : null}
                      </div>
                      {a.n && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)', marginTop: 'var(--space-1)' }}>{a.n}</div>}
                      {a.updated && <div className="m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--success)', marginTop: 'var(--space-1)' }}>Atualizado {a.updated}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="m" style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{mask(a.v, hidden, fm)}</div>
                      <button
                        type="button"
                        onClick={() => open('balanceHistory', { acctKey: a.custom ? a.id : a.b + '_' + a.t, bank: a.b, type: a.t })}
                        className="icon-btn"
                        style={{ width: 28, height: 28 }}
                        aria-label="Histórico de saldos"
                      >
                        <Icon name="history" size={15} />
                      </button>
                      {a.custom && (
                        <button
                          type="button"
                          onClick={() => open('acct', { id: a.id })}
                          className="icon-btn"
                          style={{ width: 28, height: 28 }}
                          aria-label="Editar conta"
                        >
                          <EditIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          confirm({
                            title: 'Remover conta',
                            message: a.b + ' · ' + a.t + '. As leituras de saldo desta conta também são removidas.',
                            amount: a.v,
                            onConfirm: () => {
                              const snap = snapshotSlices(actions.getState(), ['customAccts', 'dynAccts', 'balanceLog']);
                              if (a.custom) actions.deleteCustomAcct(a.id);
                              else actions.removeDynAcct(a.b + '_' + a.t);
                              toast('Conta removida', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
                            },
                          });
                        }}
                        className="icon-btn"
                        style={{ width: 28, height: 28, color: 'var(--danger)' }}
                        aria-label="Remover conta"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
