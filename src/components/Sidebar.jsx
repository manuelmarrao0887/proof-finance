/* ════════════════════════════════════════════════════════════════════════
   Sidebar — navegação vertical do modo desktop. Substitui a BottomNav.
   Marca + DeviceToggle + botão Adicionar + separadores + Definições + tema.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useUI } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import DeviceToggle from './DeviceToggle.jsx';

const I = {
  overview: (<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>),
  expenses: (<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>),
  goals: (<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
  cal: (<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  income: (<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>),
  rec: (<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  charts: (<><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></>),
  loan: (<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  ai: (<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  plus: (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  theme: (<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" /></>),
};

const NAV = [
  ['overview', 'Resumo'],
  ['expenses', 'Despesas'],
  ['goals', 'Metas'],
  ['income', 'Receitas'],
  ['rec', 'Recorrentes'],
  ['cal', 'Calendário'],
  ['charts', 'Gráficos'],
  ['loan', 'Crédito'],
  ['ai', 'Assistente IA'],
];

function NavIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {I[name]}
    </svg>
  );
}

export default function Sidebar() {
  const { tab, goTab, open } = useUI();
  const { state, actions } = useStore();

  const toggleTheme = () => {
    const cur = state.theme || 'system';
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
    actions.setTheme(next);
  };

  return (
    <aside className="dsidebar">
      <div className="dbrand">
        <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>Proof.</span>
        <span style={{ fontSize: 19, fontWeight: 400, color: 'var(--fg-muted)', letterSpacing: '-0.02em' }}>Finance</span>
      </div>

      <DeviceToggle />

      <button type="button" className="dnav-item dnav-add" onClick={() => open('action')}>
        <NavIcon name="plus" /> Adicionar
      </button>

      {NAV.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={'dnav-item' + (tab === key ? ' on' : '')}
          onClick={() => goTab(key)}
          aria-current={tab === key ? 'page' : undefined}
        >
          <NavIcon name={key} /> {label}
        </button>
      ))}

      <div className="dspacer" />

      <button type="button" className="dnav-item" onClick={() => open('settings')}>
        <NavIcon name="settings" /> Definições
      </button>
      <button type="button" className="dnav-item" onClick={toggleTheme}>
        <NavIcon name="theme" /> Tema: {state.theme || 'system'}
      </button>
    </aside>
  );
}
