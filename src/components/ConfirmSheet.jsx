/* ════════════════════════════════════════════════════════════════════════
   ConfirmSheet — substitui o confirm() nativo nas VIEWS (dentro de sheets/
   modais usa-se antes ConfirmButton, para não empilhar duas sheets — ver
   ConfirmButton.jsx). Registado como modal `confirm` (Shell.jsx).

   useConfirm() devolve a função que abre esta sheet: confirm({ title,
   message, amount?, confirmLabel?, onConfirm }). onConfirm corre DEPOIS de
   fechar a sheet — quem chama trata do snapshot + toast "Anular" (ver
   src/lib/snapshot.js e as views que chamam useConfirm()).
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import Sheet from './Sheet.jsx';
import { useModal, useUI } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { PrimaryButton, SecondaryButton } from './Buttons.jsx';
import { fm, mask } from '../lib/format.js';

export function useConfirm() { const { open } = useUI(); return (payload) => open('confirm', payload); }

export default function ConfirmSheet() {
  const { isOpen, payload, close } = useModal('confirm');
  const { state } = useStore();
  // Payload true por omissão (harness/testes que abrem modais genericamente
  // sem payload) — não é um objeto de confirmação válido, não renderiza nada.
  if (!isOpen || !payload || typeof payload !== 'object') return null;
  const { title, message, amount, confirmLabel = 'Remover', onConfirm } = payload;
  // Saldos ocultos (Hero.jsx): o valor a remover segue a mesma máscara.
  const hidden = !!state.balancesHidden;
  const footer = (
    <>
      <PrimaryButton onClick={() => { close(); onConfirm && onConfirm(); }} style={{ background: 'var(--danger)' }}>{confirmLabel}</PrimaryButton>
      <SecondaryButton onClick={close} style={{ marginTop: 8 }}>Cancelar</SecondaryButton>
    </>
  );
  return (
    <Sheet open={isOpen} onClose={close} title={title} footer={footer}>
      {amount != null && <div className="m" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>{mask(amount, hidden, fm)}</div>}
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{message}</p>
    </Sheet>
  );
}
