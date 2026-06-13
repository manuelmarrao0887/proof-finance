/* ════════════════════════════════════════════════════════════════════════
   QuickActions — fila de botões circulares de ação rápida (estilo Finany),
   mostrada no topo do "Resumo". Cada botão tem um círculo com a cor da ação a
   ~12% e o ícone na cor cheia, com um label por baixo. Abre os modais reais.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useUI } from '../store/ui.jsx';
import Icon from './Icon.jsx';

const ACTIONS = [
  { key: 'balanceUpdate', label: 'Saldo', icon: 'balance', color: '#3b6fee' },
  { key: 'add', label: 'Despesa', icon: 'expense', color: '#f25555' },
  { key: 'income', label: 'Receita', icon: 'income', color: '#3fc97a' },
  { key: 'more', label: 'Mais', icon: 'dots', color: '#7b5fe0' },
];

export default function QuickActions() {
  const { open } = useUI();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, margin: '2px 4px 18px' }}>
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => open(a.key)}
          aria-label={a.label}
          style={{ flex: 1, background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 0, cursor: 'pointer' }}
        >
          <span
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: a.color + '1f', // hex alpha ~12%
              color: a.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={a.icon} size={24} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
