/* ════════════════════════════════════════════════════════════════════════
   MonthNav — setas ← → que deslizam a janela de 4 meses (state.mOff) e
   mostram o mês selecionado (o último da janela, em=3). Único seletor de
   tempo partilhado por Despesas, Cartões e Transferências (Task 16).
   Desativa-se nos limites (não há futuro, nem histórico anterior ao mês
   mais antigo com dados) mas NUNCA deixa de renderizar — sem histórico
   mostra o mês atual com as duas setas desativadas.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { minMonthOffset, monthLabel, monthKeyAt } from '../lib/months.js';

const Arrow = ({ dir }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
  </svg>
);

// `extra`: nó opcional renderizado à direita das setas (ex.: chip "3M" em Despesas).
export default function MonthNav({ extra }) {
  const { state, actions } = useStore();
  const mOff = Number(state.mOff) || 0;
  const min = minMonthOffset(state);
  const canBack = mOff > min;
  const canFwd = mOff < 0;

  // Mês selecionado = o último da janela (em=3, ver lib/months.js e setMOff).
  const label = monthLabel(monthKeyAt(3, mOff));
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
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'center', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
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
      {extra}
    </div>
  );
}
