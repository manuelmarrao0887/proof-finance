/* ════════════════════════════════════════════════════════════════════════
   BalanceHistorySheet — lista de leituras datadas de UMA conta.
   useModal('balanceHistory'); payload = { acctKey, bank, type }.
   Mostra cada leitura (data + valor) e a variacao face a leitura anterior.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { fm } from '../lib/format.js';
import { accountHistory, formatReadingDate } from '../lib/balances.js';

export default function BalanceHistorySheet() {
  const { isOpen, payload, close } = useModal('balanceHistory');
  const { state } = useStore();
  if (!isOpen) return null;

  const acctKey = payload && payload.acctKey;
  const rows = accountHistory(state.balanceLog, acctKey); // ascending by date
  const title = payload ? (payload.bank || '') + ' · ' + (payload.type || '') : 'Histórico';

  return (
    <Sheet open={isOpen} onClose={close} title="Histórico de saldos">
      <div className="lb" style={{ marginBottom: 12 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="empty" style={{ padding: '24px 0' }}>Sem leituras registadas para esta conta.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r2)', overflow: 'hidden' }}>
          {[...rows].reverse().map((r, i, arr) => {
            // arr is reversed (most recent first); previous chronological row is arr[i+1].
            const prev = arr[i + 1];
            const delta = prev ? r.value - prev.value : null;
            return (
              <div key={r.id || r.date + '_' + i} className="rw" style={{ padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <span className="m" style={{ fontSize: 12, color: 'var(--text2)' }}>{formatReadingDate(r.date)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {delta != null && (
                    <span className="m" style={{ fontSize: 11, color: delta < 0 ? 'var(--signal)' : 'var(--success)' }}>
                      {(delta >= 0 ? '+' : '') + fm(delta)}
                    </span>
                  )}
                  <span className="m" style={{ fontSize: 13, fontWeight: 600 }}>{fm(r.value)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
