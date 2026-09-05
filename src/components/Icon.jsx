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
  // ── Category icons (used by CategoryIcon) ──────────────────────────────
  food: (
    <>
      <path d="M4 8h13a3 3 0 0 1 0 6h-1" />
      <path d="M4 8v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8z" />
      <line x1="6" y1="2" x2="6" y2="5" />
      <line x1="10" y1="2" x2="10" y2="5" />
      <line x1="14" y1="2" x2="14" y2="5" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.2 11a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </>
  ),
  home: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />
  ),
  chat: (
    <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z" />
  ),
  shield: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  ),
  paw: (
    <>
      <circle cx="5.5" cy="12" r="1.5" />
      <circle cx="9.5" cy="7.5" r="1.5" />
      <circle cx="14.5" cy="7.5" r="1.5" />
      <circle cx="18.5" cy="12" r="1.5" />
      <path d="M12 13.5c-2.5 0-4.5 1.8-4.5 3.8A2.7 2.7 0 0 0 10.2 21h3.6a2.7 2.7 0 0 0 2.7-3.7c0-2-2-3.8-4.5-3.8z" />
    </>
  ),
  health: (
    <polyline points="3 12 8 12 10 6 14 18 16 12 21 12" />
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </>
  ),
  car: (
    <>
      <path d="M5 13l1.4-4.2A2 2 0 0 1 8.3 7.5h7.4a2 2 0 0 1 1.9 1.3L19 13" />
      <path d="M3 13h18v4a1 1 0 0 1-1 1h-1.2a2 2 0 0 1-3.6 0H8.8a2 2 0 0 1-3.6 0H4a1 1 0 0 1-1-1z" />
    </>
  ),
  dumbbell: (
    <path d="M6 7v10M3.5 9.5v5M18 7v10M20.5 9.5v5M6 12h12" />
  ),
  fuel: (
    <>
      <path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18" />
      <line x1="2" y1="22" x2="15" y2="22" />
      <path d="M13 9h3a2 2 0 0 1 2 2v6a2 2 0 0 0 4 0V8l-3-3" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  ticket: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
    </>
  ),
  transfer: (
    <>
      <polyline points="16 3 20 7 16 11" />
      <line x1="20" y1="7" x2="4" y2="7" />
      <polyline points="8 13 4 17 8 21" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l1 13H5z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  landmark: (
    <>
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  umbrella: (
    <>
      <path d="M22 12a10 10 0 0 0-20 0z" />
      <path d="M12 12v7a2 2 0 0 0 4 0" />
      <line x1="12" y1="2" x2="12" y2="3" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </>
  ),
  plane: (
    <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  ),
  gift: (
    <>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </>
  ),
  graduation: (
    <>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </>
  ),
  piggy: (
    <>
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 6.5 0 3 2 5 4 5.5V21h2v-2h4v2h2v-2c1.5 0 2.5-1.5 2.5-3H21v-5h-1.5c-.2-1-.7-1.8-1.5-2.5V5z" />
      <circle cx="15.5" cy="11.5" r="1" />
      <path d="M2 12.5c0-1.5 1-2.5 2-2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  bell: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
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
