/* ════════════════════════════════════════════════════════════════════════
   PendingActionCard — cartão de Confirmar/Cancelar para uma ação destrutiva
   que o assistente (runAssistant) devolveu em `pending` em vez de a executar.

   Partilhado por AssistantSheet e AIView.jsx (Task 12, revisão): as duas
   vistas chamam confirmPending() da mesma forma — este componente só trata
   da markup, da cópia e do estado `busy`; cada vista mantém o seu próprio
   `onConfirm`/`onCancel` para saber que lista atualizar a seguir.

   `busy` desativa os dois botões enquanto há um pedido em curso — o mesmo
   flag que já desativa o "Enviar", para nunca escrever a meio de um pedido.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { PrimaryButton, SecondaryButton } from './Buttons.jsx';

export default function PendingActionCard({ preview, onConfirm, onCancel, busy }) {
  const p = preview || {};
  return (
    <div className="cs" style={{ padding: 14, marginTop: 10 }}>
      <div className="lb" style={{ marginBottom: 6 }}>
        {p.action === 'delete' ? 'Apagar' : 'Alterar'} &middot; {p.kind || ''}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{p.label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <PrimaryButton onClick={onConfirm} disabled={busy} style={{ flex: 1 }}>
          Confirmar
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} disabled={busy} style={{ flex: 1, color: 'var(--text2)' }}>
          Cancelar
        </SecondaryButton>
      </div>
    </div>
  );
}
