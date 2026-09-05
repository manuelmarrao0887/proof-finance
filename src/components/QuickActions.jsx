/* ════════════════════════════════════════════════════════════════════════
   QuickActions — fila de botões circulares de ação rápida (estilo Finany),
   mostrada no topo do "Resumo". Cada botão tem um círculo com a cor da ação a
   ~12% e o ícone na cor cheia, com um label por baixo. Abre os modais reais.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useUI } from '../store/ui.jsx';
import Icon from './Icon.jsx';

/* Ordem por frequência de uso, não por importância abstrata: uma despesa
   lança-se todos os dias, um saldo atualiza-se uma vez por semana. */
const ACTIONS = [
  { key: 'add', label: 'Despesa', icon: 'expense', color: 'var(--danger)' },
  { key: 'income', label: 'Receita', icon: 'income', color: 'var(--success)' },
  { key: 'balanceUpdate', label: 'Saldo', icon: 'balance', color: 'var(--primary)' },
  { key: 'assistant', label: 'IA', icon: 'chat', color: 'var(--blue)' },
  { key: 'more', label: 'Mais', icon: 'dots', color: 'var(--secondary)' },
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
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'color-mix(in srgb, ' + a.color + ' 12%, transparent)', // ~12% tint of the token
              color: a.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={a.icon} size={22} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
