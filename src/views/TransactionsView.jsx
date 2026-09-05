/* ════════════════════════════════════════════════════════════════════════
   TransactionsView — feed cronológico de movimentos (Task 18, D14).

   Substitui o antigo destino da tab inferior "Despesas": em vez de abrir
   logo o orçamento por categoria (agora em Mais → Orçamento, ExpensesView),
   a tab passa a mostrar os movimentos do mês selecionado (MonthNav,
   state.mOff) por ordem cronológica, agrupados por dia (groupByDay/dayLabel
   — lib/days.js, movido de ExpensesView para ser partilhado).

   Cada linha: logo do comerciante, descrição, categoria como <select> inline
   (2 toques para reclassificar: abrir o <select> + escolher — sem passar
   pela sheet de edição) e um botão "Editar" que abre a sheet de despesa em
   modo edição (mesmo payload {editId} que ExpensesView usa).

   É uma tab da barra inferior (não um destino de "Mais"), por isso não leva
   <ViewHeader> (sem botão "Voltar") — mas continua a precisar de UM <h1>
   acessível na página; a Header do Shell mostra a saudação como <h1> só
   quando a tab não é desta vista nem de "Mais" (ver Shell.jsx `plain`), por
   isso este <h1> "Transações" é o único da página quando esta tab está ativa.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { todayISO } from '../lib/format.js';
import { monthKeyAt, monthLabel } from '../lib/months.js';
import { dayLabel, groupByDay } from '../lib/days.js';
import { sortedCats } from '../lib/categories.js';
import MerchantLogo from '../components/MerchantLogo.jsx';
import Amount from '../components/Amount.jsx';
import MonthNav from '../components/MonthNav.jsx';

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" strokeLinecap="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export default function TransactionsView() {
  const { state, actions } = useStore();
  const ui = useUI();
  const hidden = !!state.balancesHidden;

  const [query, setQuery] = useState('');

  const bdg = state.bdg || [];
  const addedExp = state.addedExp || [];
  const mOff = Number(state.mOff) || 0;
  // Mês selecionado = o último da janela de 4 meses (em=3), o mesmo que
  // MonthNav mostra — único seletor de tempo partilhado (Task 16).
  const ym = monthKeyAt(3, mOff);
  const monthRows = addedExp.filter((x) => (x.date || '').slice(0, 7) === ym);

  const q = query.toLowerCase().trim();
  const filtered = q
    ? monthRows.filter((x) => {
        if ((x.desc || '').toLowerCase().indexOf(q) > -1) return true;
        if ((x.cat || '').toLowerCase().indexOf(q) > -1) return true;
        const b = bdg.find((bb) => bb.id === x.cat);
        if (b && b.nm.toLowerCase().indexOf(q) > -1) return true;
        if (x.tags && x.tags.some((t) => t.toLowerCase().indexOf(q) > -1)) return true;
        return false;
      })
    : monthRows;

  // Mais recente primeiro (orig 1056) — agrupado por dia com groupByDay.
  const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const today = todayISO();
  const cats = sortedCats(bdg);

  // Editar um movimento: se veio de um grupo (groupEntryId), abre a sheet de
  // despesa de grupo com a entry correspondente — mesma lógica de
  // ExpensesView.openExpEdit, para a edição mexer na divisão pelas pessoas
  // e não só na minha parte. Sem entry (apagada entretanto) cai no normal.
  const openEdit = (x) => {
    if (x.groupEntryId) {
      const entry = (state.groupEntries || []).find((e) => e.id === x.groupEntryId);
      if (entry) {
        ui.open('gexp', entry);
        return;
      }
    }
    ui.open('add', { editId: x.id });
  };

  return (
    <div className="fadeUp" style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingBottom: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Transações</h1>

      <MonthNav />

      <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
        <SearchIcon />
        <input
          type="search"
          aria-label="Pesquisar transações"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar…"
          style={{ width: '100%', padding: 'var(--space-4) var(--space-4) var(--space-4) var(--space-7)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 'var(--fs-lg)', boxSizing: 'border-box' }}
        />
      </div>

      {sorted.length === 0 ? (
        <div className="empty fadeUp">
          <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-4)' }}>{'Sem movimentos em ' + monthLabel(ym)}</div>
          <button
            type="button"
            onClick={() => ui.open('add')}
            style={{ padding: 'var(--space-3) var(--space-5)', border: '1px solid var(--primary)', background: 'var(--blue-soft)', color: 'var(--primary)', borderRadius: 999, fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer' }}
          >
            + Nova despesa
          </button>
        </div>
      ) : (
        groupByDay(sorted.map((x) => ({ x }))).map((g) => (
          <div key={g.date || 'sem-data'}>
            <div className="day-lb">{dayLabel(g.date, today)}</div>
            {g.items.map(({ x }) => (
              <div key={x.id} className="cd" style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-4)' }}>
                <div className="rw" style={{ gap: 'var(--space-4)' }}>
                  <MerchantLogo text={x.desc} cat={x.cat} size={40} bdg={bdg} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {x.desc}
                    </div>
                    <select
                      aria-label={'Categoria de ' + x.desc}
                      value={x.cat || ''}
                      onChange={(e) => actions.updateExpense(x.id, { cat: e.target.value })}
                      style={{ marginTop: 'var(--space-1)', maxWidth: '100%', border: 'none', background: 'transparent', color: 'var(--text3)', fontSize: 'var(--fs-input)' }}
                    >
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>{c.nm}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Amount value={x.amount} kind="out" hidden={hidden} style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }} />
                    <button
                      type="button"
                      onClick={() => openEdit(x)}
                      className="icon-btn"
                      style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      aria-label="Editar despesa"
                    >
                      <EditIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
