/* ════════════════════════════════════════════════════════════════════════
   ActionSheet — React port of rActionSheet (orig 3037-3068): the central "+"
   bottom sheet. Each option opens another modal/flow via useUI().open(...) and
   closes itself first.

   Uses the raw .sheet-overlay/.sheet-panel structure (matches the original;
   the original ActionSheet did not use the titled Sheet shell). useModal('action').

   Mapping (orig fn payloads -> modal opens):
     - Nova despesa      -> open('add')               (blank expense)
     - Nova receita      -> open('income')
     - Scan recibo       -> open('add', {scan:true})  (AddExp auto-triggers camera)
     - Importar extrato -> open('stmt')
     - Nova meta         -> open('goal')
     - Nova recorrência  -> open('rec')
     - Nova conta        -> open('acct')
     - Despesa de grupo  -> depende de quantos grupos ativos existem:
       nenhum -> open('group') (não há para onde lançar a despesa, cria-se um
       primeiro); exatamente um -> open('gexp', {groupId}) direto para esse
       grupo; vários -> não há grupo óbvio, navega para o tab Grupos para o
       utilizador escolher.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useEffect } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI, useModal } from '../store/ui.jsx';
import { lockScroll, unlockScroll } from '../lib/scrollLock.js';

const Chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default function ActionSheet() {
  const { state } = useStore();
  const ui = useUI();
  const { isOpen, close } = useModal('action');

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

  // Open another modal/flow, closing this sheet first (orig: showAction=false).
  const go = (key, payload) => {
    close();
    ui.open(key, payload === undefined ? true : payload);
  };

  // Despesa de grupo não tem um destino óbvio como as outras opções — depende
  // de quantos grupos ativos (não arquivados) o utilizador já tem.
  const goGroupExpense = () => {
    close();
    const active = (state.groups || []).filter((g) => !g.archived);
    if (active.length === 0) {
      ui.open('group');
    } else if (active.length === 1) {
      ui.open('gexp', { groupId: active[0].id });
    } else {
      ui.goTab('groups');
    }
  };

  const items = [
    {
      title: 'Nova despesa',
      sub: 'Registar gasto manualmente',
      onClick: () => go('add'),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
    },
    {
      title: 'Despesa de grupo',
      sub: 'Dividir com amigos ou família',
      onClick: goGroupExpense,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      ),
    },
    {
      title: 'Nova receita',
      sub: 'Salário, freelance, dividendos',
      onClick: () => go('income'),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      ),
    },
    {
      title: 'Scan recibo',
      sub: 'IA extrai e classifica (requer API key)',
      onClick: () => go('add', { scan: true }),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      ),
    },
    {
      title: 'Importar extrato',
      sub: 'PDF, imagem, Excel ou CSV',
      onClick: () => go('stmt'),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      title: 'Nova meta',
      sub: 'Definir objectivo de poupança',
      onClick: () => go('goal'),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
    },
    {
      title: 'Nova recorrência',
      sub: 'Subscrições e despesas fixas',
      onClick: () => go('rec'),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      title: 'Transferência entre contas',
      sub: 'Mover dinheiro entre as tuas contas (não é despesa)',
      onClick: () => go('transfer'),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      ),
    },
    {
      title: 'Nova conta',
      sub: 'Banco, corretora, cripto, imobiliário',
      onClick: () => go('acct'),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="14" rx="2" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-grip" />
        <div className="lb" style={{ padding: '0 14px 10px' }}>Adicionar</div>
        {items.map((it) => (
          <button key={it.title} className="sheet-item" type="button" onClick={it.onClick}>
            <div className="sheet-icon">{it.icon}</div>
            <div className="sheet-text">
              <div className="sheet-text-title">{it.title}</div>
              <div className="sheet-text-sub">{it.sub}</div>
            </div>
            {Chevron}
          </button>
        ))}
        <button className="sheet-cancel" type="button" onClick={close}>Cancelar</button>
      </div>
    </div>
  );
}
