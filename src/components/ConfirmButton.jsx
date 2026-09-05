import React, { useEffect, useState } from 'react';
import { SecondaryButton } from './Buttons.jsx';
// Dois toques em 4 s: para eliminar de dentro de uma sheet sem abrir outra
// (as views usam ConfirmSheet — ver ConfirmSheet.jsx — para não empilhar
// duas sheets ao mesmo tempo). danger=false para ações reversíveis (ex.: o
// toggle "Refletir" do GroupSheet), true por omissão para eliminações.
export default function ConfirmButton({ label, confirmLabel = 'Confirmar', onConfirm, danger = true, style }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <SecondaryButton
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
      style={{
        color: danger ? 'var(--danger)' : (armed ? 'var(--primary)' : 'var(--text2)'),
        // 'border' (shorthand) — nunca 'borderColor' sozinho: misturar as
        // duas no mesmo objeto de estilo entre re-renders (armado <-> não
        // armado) dispara o aviso do React "Removing a style property...".
        // A cor armada segue `danger`: sítios não destrutivos (ex. "Ligar" do
        // reflect, "Importar mesmo assim") não devem piscar a vermelho.
        ...(armed
          ? danger
            ? { border: '1px solid var(--danger)', background: 'var(--signal-soft)' }
            : { border: '1px solid var(--primary)', background: 'var(--blue-soft)' }
          : {}),
        ...style,
      }}
      aria-live="polite"
    >
      {armed ? confirmLabel : label}
    </SecondaryButton>
  );
}
