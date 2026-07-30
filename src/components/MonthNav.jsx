/* ════════════════════════════════════════════════════════════════════════
   MonthNav — setas ← → que deslizam a janela de 4 meses (state.mOff).
   Aparece por cima da barra de meses; desativa-se nos limites (não há futuro,
   nem histórico anterior ao mês mais antigo com dados).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { minMonthOffset, monthLabel, monthKeyAt } from '../lib/months.js';

const Arrow = ({ dir }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
  </svg>
);

export default function MonthNav() {
  const { state, actions } = useStore();
  const mOff = Number(state.mOff) || 0;
  const min = minMonthOffset(state);
  const canBack = mOff > min;
  const canFwd = mOff < 0;
  if (min === 0 && mOff === 0) return null; // sem histórico → nada para navegar

  const from = monthLabel(monthKeyAt(0, mOff));
  const to = monthLabel(monthKeyAt(3, mOff));
  const btn = (enabled) => ({
    width: 30,
    height: 30,
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: enabled ? 'var(--text)' : 'var(--text3)',
    opacity: enabled ? 1 : 0.4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'default',
    flexShrink: 0,
  });

  return (
    <div className="rw" style={{ marginBottom: 8, gap: 10 }}>
      <button
        type="button"
        onClick={() => canBack && actions.setMOff(mOff - 1)}
        disabled={!canBack}
        aria-label="Meses anteriores"
        style={btn(canBack)}
      >
        <Arrow dir="left" />
      </button>
      <span style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {from.split(' ')[0]} – {to}
      </span>
      <button
        type="button"
        onClick={() => canFwd && actions.setMOff(Math.min(0, mOff + 1))}
        disabled={!canFwd}
        aria-label="Meses seguintes"
        style={btn(canFwd)}
      >
        <Arrow dir="right" />
      </button>
    </div>
  );
}
