/* ════════════════════════════════════════════════════════════════════════
   SubscriptionsCard — "Subscrições detectadas": despesas que se repetem e
   podem virar recorrentes (ou ser dispensadas com "Não é").

   Extraído do OverviewView na Task 10 sem alterar o JSX nem as ações
   (actions.addRecurring / actions.dismissSub, com os mesmos toasts).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore } from '../../store/store.jsx';
import { detectSubscriptions, isNewUser } from '../../lib/finance.js';
import { fc, uid, mask } from '../../lib/format.js';
import { useToast } from '../Toast.jsx';

export default function SubscriptionsCard() {
  const { state, actions, currentUser } = useStore();
  const toast = useToast();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const newU = useMemo(() => isNewUser(s), [s]);
  const subs = useMemo(() => (!newU ? detectSubscriptions(s) : []), [s, newU]);
  const hidden = !!state.balancesHidden;

  // orig addSubFromSuggestion: cria a recorrente a partir da sugestão.
  const addSub = (sub) => {
    actions.addRecurring({
      id: uid(),
      name: sub.desc,
      amount: Number(sub.monthlyEstimate.toFixed(2)),
      day: 1,
      cat: sub.cat || 'sub',
      createdAt: Date.now(),
    });
    toast('Recorrência criada', 'success');
  };

  // Marca a chave para o detectSubscriptions parar de a sugerir.
  const dismissSub = (sub) => {
    actions.dismissSub(sub.key);
    toast('Sugestão dispensada', 'success');
  };

  if (newU || subs.length === 0) return null;

  return (
    <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
      <div className="rw" style={{ marginBottom: 6 }}>
        <div className="lb">Subscrições detectadas</div>
        <div className="chip" style={{ background: 'transparent', color: 'var(--fg-muted)', border: '1px solid var(--border)' }}>
          {subs.length}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, marginBottom: 14 }}>
        Estas despesas repetem-se. Queres registá-las como recorrentes?
      </div>
      {subs.slice(0, 3).map((sub, i) => (
        <div key={sub.key} className="rw" style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{sub.desc}</div>
            <div className="m" style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>
              {sub.count} vezes · ~{mask(sub.monthlyEstimate, hidden, fc)}/mês
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => dismissSub(sub)}
              aria-label={'Não é subscrição: ' + sub.desc}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--fg-muted)',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                fontFamily: 'inherit',
              }}
            >
              Não é
            </button>
            <button
              type="button"
              onClick={() => addSub(sub)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--primary)',
                background: 'var(--primary)',
                color: '#fff',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              Adicionar
            </button>
          </div>
        </div>
      ))}
      {subs.length > 3 && (
        <div style={{ fontSize: 11, color: 'var(--fg-subtle)', padding: '8px 0 0', textAlign: 'center' }}>
          + {subs.length - 3} outras
        </div>
      )}
    </div>
  );
}
