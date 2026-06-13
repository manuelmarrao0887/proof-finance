/* ════════════════════════════════════════════════════════════════════════
   Icon — set de ícones SVG inline (stroke currentColor, viewBox 24), no estilo
   de linha minimal usado no resto da app. Substitui os emojis de sistema.
   Uso: <Icon name="bank" size={16} /> ; herda a cor via currentColor.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

const PATHS = {
  // 🏦 update_balance
  bank: (
    <>
      <line x1="3" y1="21" x2="21" y2="21" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="5 6 12 3 19 6" />
      <line x1="5" y1="10" x2="5" y2="21" />
      <line x1="12" y1="10" x2="12" y2="21" />
      <line x1="19" y1="10" x2="19" y2="21" />
    </>
  ),
  // 💰 add_expense
  expense: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  // 🧾 add_income
  income: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  // 🎯 add_goal
  goal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  // 🔁 add_recurring
  recurring: (
    <>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  // 📊 snapshot
  chart: (
    <>
      <line x1="4" y1="20" x2="4" y2="10" />
      <line x1="10" y1="20" x2="10" y2="4" />
      <line x1="16" y1="20" x2="16" y2="14" />
      <line x1="20" y1="20" x2="4" y2="20" />
    </>
  ),
  // histórico de saldos
  history: (
    <>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <polyline points="12 7 12 12 15 14" />
    </>
  ),
  // botão "atualizar saldo" (wallet)
  balance: (
    <>
      <path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
      <circle cx="16" cy="13" r="1.5" />
    </>
  ),
  // fallback
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </>
  ),
};

export default function Icon({ name, size = 16, style, ...rest }) {
  const body = PATHS[name] || PATHS.help;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: 'middle', ...style }}
      {...rest}
    >
      {body}
    </svg>
  );
}
