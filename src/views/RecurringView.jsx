/* ════════════════════════════════════════════════════════════════════════
   Recurring (Subscrições / Despesas Recorrentes) view — React port of
   rRecurring (orig 1452-1485).

   - Empty state when no recurring entries.
   - Hero card: fixed monthly cost + yearly + count.
   - List sorted by amount DESC (explicit display sort — kept verbatim).
   - Each row: name, category name + day + days-until-next, amount, edit +
     delete. Edit/delete open the rec modal via useUI().open('rec', { id }).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { fc, fm } from '../lib/format.js';

export default function RecurringView() {
  const { state, actions } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const recurring = state.recurring || [];
  const bdg = state.bdg || [];

  if (recurring.length === 0) {
    return (
      <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
        <div className="empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Sem despesas recorrentes
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Regista subscrições (Netflix, ginásio,
            <br />
            seguros, telecom...) para teres uma
            <br />
            visao clara do gasto mensal fixo.
          </div>
        </div>
      </div>
    );
  }

  // Explicit display sort: amount descending (kept from the original).
  const sorted = recurring.slice().sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, r) => s + r.amount, 0);
  const yearly = total * 12;
  const now = new Date();

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
      <div className="cd" style={{ marginBottom: 16, padding: '18px 20px', background: 'var(--primary)', color: '#fff', boxShadow: 'var(--shadow-hero)' }}>
        <div className="lb" style={{ marginBottom: 6, color: 'rgba(255,255,255,0.85)' }}>Custo Mensal Fixo</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{fc(total)}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
          {fc(yearly)} por ano &middot; {recurring.length} {recurring.length === 1 ? 'subscrição' : 'subscrições'}
        </div>
      </div>

      {sorted.map((r) => {
        let bI = null;
        bdg.forEach((b) => {
          if (b.id === r.cat) bI = b;
        });
        const nextDay = parseInt(r.day) || 1;
        let next = new Date(now.getFullYear(), now.getMonth(), nextDay);
        if (next < now) next = new Date(now.getFullYear(), now.getMonth() + 1, nextDay);
        const dleft = Math.ceil((next - now) / 86400000);

        return (
          <div key={r.id} className="cd fadeUp" style={{ marginBottom: 10, padding: '14px 18px' }}>
            <div className="rw">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                  {bI ? bI.nm : '—'} &middot; dia {nextDay} &middot;{' '}
                  {dleft === 0 ? 'hoje' : dleft === 1 ? 'amanha' : dleft + ' dias'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="m" style={{ fontSize: 15, fontWeight: 600 }}>{fm(r.amount)}</div>
                <button
                  type="button"
                  onClick={() => open('rec', { id: r.id })}
                  className="icon-btn"
                  style={{ width: 30, height: 30 }}
                  aria-label="Editar recorrência"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    actions.deleteRecurring(r.id);
                    toast('Recorrente eliminada', 'success');
                  }}
                  className="icon-btn"
                  style={{ width: 30, height: 30, color: 'var(--signal)' }}
                  aria-label="Eliminar recorrência"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
