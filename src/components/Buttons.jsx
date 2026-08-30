/* ════════════════════════════════════════════════════════════════════════
   Shared modal buttons — presentational only, no external deps.

   - PrimaryButton: the full-width pill used by every modal footer (the submit
     action). Background var(--primary)/text var(--bg) when enabled; var(--bg3)/
     var(--text3) when disabled.
   - SecondaryButton: full-width transparent text button used for destructive /
     secondary actions (e.g. "Eliminar"), coloured var(--signal). Text dims to
     var(--text3) when disabled, same treatment as PrimaryButton.

   Optional `style` is merged LAST so callers can tweak spacing (e.g. marginTop).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export function PrimaryButton({ children, onClick, disabled, type = 'button', style }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '14px 0',
        border: 'none',
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        background: disabled ? 'var(--bg3)' : 'var(--primary)',
        color: disabled ? 'var(--text3)' : 'var(--bg)',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, type = 'button', style }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '10px 0',
        border: 'none',
        background: 'transparent',
        color: disabled ? 'var(--text3)' : 'var(--signal)',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
