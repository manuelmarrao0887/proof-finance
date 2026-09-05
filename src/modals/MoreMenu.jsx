/* ════════════════════════════════════════════════════════════════════════
   MoreMenu — React port of rMoreMenu (orig 3071-3100): the "Mais" menu listing
   extra tabs (income, rec, cal, charts, loan, ai) + a Definições entry.

   Each tab item navigates via useUI().goTab(t) (which also closes this sheet);
   Definições closes the sheet then opens the settings modal. Uses the raw
   .sheet-overlay/.sheet-panel structure (matches the original). useModal('more').
   ════════════════════════════════════════════════════════════════════════ */

import React, { useEffect } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI, useModal } from '../store/ui.jsx';
import { lockScroll, unlockScroll } from '../lib/scrollLock.js';

const Chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// Tab items (orig 3076-3083). svg = inner path markup for a 24x24 stroke icon.
// section agrupa os itens no menu (Registos / Análise / Assistente) — ver
// SECTIONS abaixo, que define a ordem em que as secções aparecem.
const ITEMS = [
  { id: 'groups', section: 'Registos', title: 'Grupos', sub: 'Despesas partilhadas com amigos', svg: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></> },
  { id: 'income', section: 'Registos', title: 'Receitas', sub: 'Salário e rendimentos', svg: <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> },
  { id: 'rec', section: 'Registos', title: 'Recorrentes', sub: 'Subscrições e despesas fixas', svg: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></> },
  { id: 'cal', section: 'Análise', title: 'Calendário', sub: 'Vista mensal de movimentos', svg: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { id: 'charts', section: 'Análise', title: 'Património', sub: 'Evolução, alocação e contas', svg: <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></> },
  { id: 'report', section: 'Análise', title: 'Análise', sub: 'Fecho, saúde financeira e onde poupar', svg: <><path d="M9 17v-6M13 17v-2M17 17v-4" /><rect x="3" y="3" width="18" height="18" rx="2" /></> },
  { id: 'invest', section: 'Análise', title: 'Investimentos', sub: 'Posições, P&L e alocação', svg: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></> },
  { id: 'transfers', section: 'Registos', title: 'Transferências', sub: 'Mover dinheiro entre contas', svg: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></> },
  { id: 'tax', section: 'Análise', title: 'Fiscal (IRS/IMI/IUC)', sub: 'Calendário e deduções estimadas', svg: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
  { id: 'cards', section: 'Registos', title: 'Cartões de crédito', sub: 'Plafond, dívida e pagamentos', svg: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></> },
  { id: 'loan', section: 'Análise', title: 'Crédito', sub: 'Habitação e dividas', svg: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> },
  { id: 'ai', section: 'Assistente', title: 'Assistente IA', sub: 'Chat e importacao inteligente', svg: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /> },
];

// Ordem das secções no menu — ITEMS mantém a ordem original dos destinos
// dentro de cada uma (ver acima), só se reagrupam por secção ao renderizar.
const SECTIONS = ['Registos', 'Análise', 'Assistente'];

export default function MoreMenu() {
  const { state } = useStore();
  const ui = useUI();
  const { isOpen, close } = useModal('more');

  // Trava o scroll do fundo enquanto o menu está aberto (ver lib/scrollLock.js).
  useEffect(() => {
    if (!isOpen) return undefined;
    lockScroll();
    return unlockScroll;
  }, [isOpen]);

  // Escape-to-close while open (a11y).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const openSettings = () => {
    close();
    ui.open('settings');
  };

  return (
    <div
      className="sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Mais opções"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-grip" />
        <div className="rw" style={{ padding: '0 14px 14px' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Mais</div>
          <button type="button" aria-label="Fechar" onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, lineHeight: 1, padding: '4px 8px' }}>
            &times;
          </button>
        </div>

        {SECTIONS.map((section) => (
          <React.Fragment key={section}>
            <div className="lb" style={{ padding: '10px 14px 4px' }}>{section}</div>
            {ITEMS.filter((i) => i.section === section).map((i) => (
              <button key={i.id} className="sheet-item" type="button" onClick={() => ui.goTab(i.id)}>
                <div className="sheet-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {i.svg}
                  </svg>
                </div>
                <div className="sheet-text">
                  <div className="sheet-text-title">{i.title}</div>
                  <div className="sheet-text-sub">{i.sub}</div>
                </div>
                {Chevron}
              </button>
            ))}
          </React.Fragment>
        ))}

        <div style={{ height: 1, background: 'var(--border)', margin: '10px 14px' }} />

        <button className="sheet-item" type="button" onClick={openSettings}>
          <div className="sheet-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div className="sheet-text">
            <div className="sheet-text-title">
              Definições
            </div>
            <div className="sheet-text-sub">Conta, tema, IA, backup</div>
          </div>
          {Chevron}
        </button>

        <button className="sheet-item" type="button" onClick={() => { close(); ui.open('patchNotes'); }}>
          <div className="sheet-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z" />
            </svg>
          </div>
          <div className="sheet-text">
            <div className="sheet-text-title">Novidades</div>
            <div className="sheet-text-sub">O que mudou nesta versao</div>
          </div>
          {Chevron}
        </button>

        <button className="sheet-cancel" type="button" onClick={close} style={{ marginTop: 14 }}>
          Fechar
        </button>
      </div>
    </div>
  );
}
