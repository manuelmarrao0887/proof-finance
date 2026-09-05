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
    <div className="cd" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-5) var(--space-5)' }}>
      <div className="rw" style={{ marginBottom: 'var(--space-2)' }}>
        <div className="lb">Subscrições detectadas</div>
        <div className="chip" style={{ background: 'transparent', color: 'var(--fg-muted)', border: '1px solid var(--border)' }}>
          {subs.length}
        </div>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
        Estas despesas repetem-se. Queres registá-las como recorrentes?
      </div>
      {subs.slice(0, 3).map((sub, i) => (
        <div key={sub.key} className="rw" style={{ padding: 'var(--space-3) 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>{sub.desc}</div>
            <div className="m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)', marginTop: 'var(--space-1)' }}>
              {sub.count} vezes · ~{mask(sub.monthlyEstimate, hidden, fc)}/mês
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => dismissSub(sub)}
              aria-label={'Não é subscrição: ' + sub.desc}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--fg-muted)',
                borderRadius: 999,
                fontSize: 'var(--fs-xs)',
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
                padding: 'var(--space-2) var(--space-4)',
                border: '1px solid var(--primary)',
                background: 'var(--primary)',
                color: '#fff',
                borderRadius: 999,
                fontSize: 'var(--fs-xs)',
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
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)', padding: 'var(--space-3) 0 0', textAlign: 'center' }}>
          + {subs.length - 3} outras
        </div>
      )}
    </div>
  );
}
