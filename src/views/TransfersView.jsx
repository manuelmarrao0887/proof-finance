/* ════════════════════════════════════════════════════════════════════════
   TransfersView — transferências entre contas: lista + criar + remover.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmSheet.jsx';
import { snapshotSlices } from '../lib/snapshot.js';
import { fm, fmDateShort } from '../lib/format.js';
import { monthKeyAt, monthLabel } from '../lib/months.js';
import MonthNav from '../components/MonthNav.jsx';
import { BankLogo } from '../components/MerchantLogo.jsx';
import Amount from '../components/Amount.jsx';

export default function TransfersView() {
  const { state, actions } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const confirm = useConfirm();
  // Um só seletor de tempo (Task 16, D12): filtra pelo mês selecionado no
  // MonthNav (o último da janela). "Ver todos" desliga o filtro.
  const [showAll, setShowAll] = useState(false);
  const ym = monthKeyAt(3, state.mOff);
  const allTransfers = (state.transfers || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const transfers = showAll ? allTransfers : allTransfers.filter((t) => (t.date || '').slice(0, 7) === ym);
  const hidden = !!state.balancesHidden;
  const mv = (v) => (hidden ? '••••' : fm(v));

  const remove = (t) => {
    confirm({
      title: 'Remover transferência',
      message: t.from + ' → ' + t.to + ' · ' + fmDateShort(t.date) + '. Os saldos das contas voltam ao anterior.',
      amount: t.amount,
      onConfirm: () => {
        const snap = snapshotSlices(actions.getState(), ['transfers', 'customAccts', 'dynAccts']);
        actions.deleteTransfer(t.id);
        toast('Transferência removida', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
      },
    });
  };

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      <button
        type="button"
        onClick={() => open('transfer')}
        style={{ width: '100%', marginBottom: 16, padding: '12px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        + Nova transferência
      </button>

      <MonthNav
        extra={
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-pressed={showAll}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {showAll ? 'Filtrar por mês' : 'Ver todos'}
          </button>
        }
      />

      {transfers.length === 0 ? (
        <div className="empty" style={{ padding: '40px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {showAll ? 'Sem transferências' : 'Sem movimentos em ' + monthLabel(ym)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Move dinheiro entre as tuas contas sem contar como despesa.</div>
        </div>
      ) : (
        transfers.map((t) => (
          <div key={t.id} className="cd" style={{ marginBottom: 8, padding: '14px 16px' }}>
            <div className="rw">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <BankLogo bank={t.from} size={22} />
                  <span>{t.from}</span>
                  <span style={{ color: 'var(--text3)' }}>→</span>
                  <BankLogo bank={t.to} size={22} />
                  <span>{t.to}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmDateShort(t.date)}{t.note ? ' · ' + t.note : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Amount value={t.amount} kind="neutral" hidden={hidden} style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }} />
                <button type="button" onClick={() => remove(t)} aria-label="Remover transferência" style={{ background: 'none', border: 'none', color: 'var(--signal)', cursor: 'pointer', padding: 4 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
