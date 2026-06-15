/* ════════════════════════════════════════════════════════════════════════
   Expenses view — React port of rExpenses (orig 1006-1196).

   Two modes:
   - SEARCH / TAG mode (active when there is a searchQuery or any tagFilter):
     filters addedExp, shows result cards with an edit button. Tag chips toggle
     the active filter. (orig 1026-1071)
   - BUDGET mode (default): a month bar (T('em',i)/Q1), a per-category bucket
     list built from getByC()+addedExp, each row expandable to show historical
     `txn` rows + imported addedExp with a per-row category <select> + edit/delete.
     (orig 1072-1193)

   Data is read via useStore() + lib/finance with the state object threaded with
   currentUser (so preview/auth branching matches the original).

   Add / edit an expense by opening the UI `add` modal:
     - new:  open('add')
     - edit: open('add', { editIdx })

   FIX 1: the expanded-row category <select> change applies the chosen category
          to EVERY expense with the same normalized beneficiary description, via
          applySameBeneficiaryCategory(list, idx, cat, 'cat').
   FIX 2: lists render with STABLE React keys (category id for rows; a stable
          per-expense key for inner rows) so classifying does not rebuild the DOM
          or yank focus / scroll. The budget summary keeps its by-value ordering
          (the product's intent) but reconciles in place thanks to stable keys.
   FIX 3: every category <select> uses sortedCats(state.bdg) (alphabetical).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { fm, normalizeStmtDate } from '../lib/format.js';
import { sortedCats } from '../lib/categories.js';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { dedupeAddedExp } from '../lib/dedupe.js';
import { useToast } from '../components/Toast.jsx';
import {
  isPreviewMode,
  isNewUser,
  getByC,
  getSal,
  txn,
} from '../lib/finance.js';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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

export default function ExpensesView() {
  const { state, actions, currentUser } = useStore();
  const ui = useUI();
  const toast = useToast();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);

  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState([]);
  const [xExp, setXExp] = useState(null); // expanded budget-category id

  const preview = isPreviewMode(s);
  const em = state.em;
  const isQ = em === 4;

  const addedExp = state.addedExp || [];
  const bdg = state.bdg || [];
  const cats = useMemo(() => sortedCats(bdg), [bdg]); // FIX 3

  // Month labels (orig 1007-1020): preview = Jan-Abr; auth = last 4 ending now.
  const ms = useMemo(() => {
    if (preview) return ['Jan', 'Fev', 'Mar', 'Abr'];
    const now = new Date();
    const out = [];
    for (let k = 3; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      out.push(MONTH_SHORT[d.getMonth()]);
    }
    return out;
  }, [preview]);

  const openAdd = (editId) => ui.open('add', editId != null ? { editId } : true);

  const toggleTagFilter = (t) =>
    setTagFilter((tf) => (tf.indexOf(t) > -1 ? tf.filter((x) => x !== t) : [...tf, t]));
  const clearTagFilter = () => setTagFilter([]);

  // ── Expanded-row category change — FIX 1 (same beneficiary), by stable id ───
  const changeExpCat = (id, cat) => {
    // Apply the chosen category to every expense sharing the normalized desc.
    actions.classifyExpense(id, cat);
  };
  const deleteExp = (id) => {
    if (typeof confirm === 'function' && !confirm('Remover esta despesa?')) return;
    actions.deleteExpense(id);
  };

  // ════════════════════════════════════════════════════════════════════════
  // SEARCH / TAG MODE (orig 1026-1071)
  // ════════════════════════════════════════════════════════════════════════
  const q = (searchQuery || '').toLowerCase().trim();
  const hasTagFilter = tagFilter && tagFilter.length > 0;

  if (q || hasTagFilter) {
    const matches = addedExp
      .map((x, idx) => ({ x, idx }))
      .filter(({ x }) => {
        if (hasTagFilter) {
          if (!x.tags || !tagFilter.every((t) => x.tags.indexOf(t) > -1)) return false;
        }
        if (!q) return true;
        if ((x.desc || '').toLowerCase().indexOf(q) > -1) return true;
        if ((x.cat || '').toLowerCase().indexOf(q) > -1) return true;
        if (x.tags && x.tags.some((t) => t.toLowerCase().indexOf(q) > -1)) return true;
        const b = bdg.find((bb) => bb.id === x.cat);
        if (b && b.nm.toLowerCase().indexOf(q) > -1) return true;
        return false;
      });
    const tot = matches.reduce((acc, { x }) => acc + x.amount, 0);
    // Sorted by date desc (orig 1056) — keyed by expense identity so reconciles in place.
    const sorted = [...matches].sort((a, b) => (b.x.date || '').localeCompare(a.x.date || ''));

    return (
      <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <SearchIcon />
          <input
            id="exSearch"
            type="search"
            aria-label="Pesquisar despesas"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar…"
            style={{ width: '100%', padding: '12px 40px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg-subtle)', fontSize: 18, lineHeight: 1, padding: 12, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="Limpar pesquisa"
            >
              &times;
            </button>
          )}
        </div>
        {hasTagFilter && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, padding: '0 4px' }}>
            {tagFilter.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTagFilter(t)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid var(--fg)', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 11, fontWeight: 500, fontFamily: 'var(--mono)' }}
              >
                #{t} &times;
              </button>
            ))}
          </div>
        )}
        <div className="rw" style={{ marginBottom: 10, padding: '0 4px' }}>
          <div className="lb">{matches.length + ' resultado' + (matches.length === 1 ? '' : 's')}</div>
          <div className="m" style={{ fontSize: 13, fontWeight: 500 }}>{fm(tot)}</div>
        </div>
        {sorted.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 13 }}>{'Sem resultados para "' + searchQuery + '"'}</div>
          </div>
        ) : (
          sorted.map(({ x }) => {
            const b = bdg.find((bb) => bb.id === x.cat);
            return (
              <div key={x.id} className="cd" style={{ marginBottom: 8, padding: '12px 16px' }}>
                <div className="rw" style={{ gap: 12 }}>
                  <CategoryIcon id={x.cat} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {x.desc}
                      {x.shared && (
                        <span style={{ fontSize: 9, color: 'var(--blue)', background: 'var(--blue-soft)', padding: '1px 6px', borderRadius: 8, fontWeight: 600, marginLeft: 4 }}>
                          /{x.split || 2}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {(b ? b.nm : '-') + ' · ' + (x.date || '') + (x.acct ? ' · ' + x.acct : '')}
                    </div>
                    {x.tags && x.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {x.tags.map((t) => {
                          const on = tagFilter.indexOf(t) > -1;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                toggleTagFilter(t);
                              }}
                              style={{ fontSize: 10, background: on ? 'var(--fg)' : 'var(--elevated)', color: on ? 'var(--bg)' : 'var(--fg-muted)', padding: '2px 8px', borderRadius: 999, fontWeight: 500, border: '1px solid ' + (on ? 'var(--fg)' : 'var(--border)'), fontFamily: 'var(--mono)', cursor: 'pointer' }}
                            >
                              #{t}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="m" style={{ fontSize: 14, fontWeight: 700 }}>{fm(x.amount)}</div>
                    <button type="button" onClick={() => openAdd(x.id)} className="icon-btn" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Editar despesa">
                      <EditIcon />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // BUDGET MODE (orig 1072-1193)
  // ════════════════════════════════════════════════════════════════════════
  // Build per-category month buckets (0..3 = oldest..newest).
  const eByC = {};
  if (preview) {
    const _byCe = getByC(s);
    Object.keys(_byCe).forEach((k) => {
      eByC[k] = _byCe[k].slice();
    });
    // In preview, all addedExp land in month 3 (current/latest).
    addedExp.forEach((x) => {
      if (!eByC[x.cat]) eByC[x.cat] = [0, 0, 0, 0];
      eByC[x.cat][3] += x.amount;
    });
  } else {
    const nowA = new Date();
    const monthKeys = [];
    for (let kk = 3; kk >= 0; kk--) {
      const dd = new Date(nowA.getFullYear(), nowA.getMonth() - kk, 1);
      monthKeys.push(dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0'));
    }
    addedExp.forEach((x) => {
      if (!x.date) return;
      const ym = x.date.slice(0, 7);
      const idx = monthKeys.indexOf(ym);
      if (idx < 0) return;
      if (!eByC[x.cat]) eByC[x.cat] = [0, 0, 0, 0];
      eByC[x.cat][idx] += x.amount;
    });
  }

  const rows = [];
  bdg.forEach((b) => {
    const vs = eByC[b.id] || [0, 0, 0, 0];
    const val = isQ ? vs[0] + vs[1] + vs[2] : vs[em];
    const lm = isQ ? b.lm * 3 : b.lm;
    if (val > 0) rows.push({ id: b.id, nm: b.nm, val, lm, pct: lm > 0 ? (val / lm) * 100 : 0, vs });
  });
  // By-value ordering for the budget summary (orig 1103). Rows carry stable
  // `id` keys (FIX 2) so React reconciles them in place instead of rebuilding.
  rows.sort((a, b) => b.val - a.val);
  const tE = rows.reduce((acc, r) => acc + r.val, 0);

  // Tag chip cloud (orig 1110-1121).
  const allTags = {};
  addedExp.forEach((x) => {
    if (x.tags) x.tags.forEach((t) => { allTags[t] = (allTags[t] || 0) + 1; });
  });
  const tagList = Object.keys(allTags).sort((a, b) => allTags[b] - allTags[a]).slice(0, 12);

  const salP = getSal(s);
  const newUser = isNewUser(s);

  // Partial-month note (orig 1132-1139).
  let partialNote = null;
  if (em === 3 && !newUser && !preview) {
    const dToday = new Date();
    const dEnd = new Date(dToday.getFullYear(), dToday.getMonth() + 1, 0).getDate();
    const pct = Math.round((dToday.getDate() / dEnd) * 100);
    partialNote = (
      <div className="m" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 10 }}>
        {ms[3] + ' parcial · ' + pct + '% do mês'}
      </div>
    );
  } else if (em === 3 && preview) {
    partialNote = (
      <div className="m" style={{ fontSize: 10, color: 'var(--signal)', marginTop: 10 }}>Abril parcial</div>
    );
  }

  // Imported-expense cleanup: remove duplicates AND fix wrong/legacy dates
  // (DD.MM → ISO and YYYY-DD-MM day/month swaps). One button, only when needed.
  const dupCount = addedExp.length - dedupeAddedExp(addedExp).length;
  const dateBad = addedExp.filter((x) => (x.date || '') !== normalizeStmtDate(x.date)).length;
  const needsClean = dupCount > 0 || dateBad > 0;
  const cleanExpenses = () => {
    actions.setAddedExp(dedupeAddedExp(addedExp));
    const parts = [];
    if (dupCount > 0) parts.push(dupCount + ' duplicada' + (dupCount === 1 ? '' : 's') + ' removida' + (dupCount === 1 ? '' : 's'));
    if (dateBad > 0) parts.push(dateBad + ' data' + (dateBad === 1 ? '' : 's') + ' corrigida' + (dateBad === 1 ? '' : 's'));
    toast(parts.join(' · ') || 'Despesas importadas limpas', 'success');
  };
  const cleanLabel =
    dupCount > 0 && dateBad > 0
      ? 'Limpar importadas: ' + dupCount + ' duplicada' + (dupCount === 1 ? '' : 's') + ' + ' + dateBad + ' data' + (dateBad === 1 ? '' : 's')
      : dupCount > 0
        ? 'Remover ' + dupCount + ' despesa' + (dupCount === 1 ? '' : 's') + ' duplicada' + (dupCount === 1 ? '' : 's')
        : 'Corrigir ' + dateBad + ' data' + (dateBad === 1 ? '' : 's') + ' errada' + (dateBad === 1 ? '' : 's');

  // Remove every expense in the currently-selected month (em 0..3) so the user
  // can wipe a bad statement and re-import it. Q1 view (em === 4) is excluded.
  let selMonthKey = null;
  let selMonthLabel = '';
  if (!preview && em >= 0 && em <= 3) {
    const now = new Date();
    const dd = new Date(now.getFullYear(), now.getMonth() - (3 - em), 1);
    selMonthKey = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');
    selMonthLabel = ms[em];
  }
  const monthExpCount = selMonthKey
    ? addedExp.filter((x) => (x.date || '').slice(0, 7) === selMonthKey).length
    : 0;
  const removeMonthExpenses = () => {
    if (!selMonthKey) return;
    if (
      typeof confirm === 'function' &&
      !confirm('Remover as ' + monthExpCount + ' despesas de ' + selMonthLabel + '? Inclui manuais e importadas. Depois podes reimportar o extrato.')
    )
      return;
    actions.setAddedExp(addedExp.filter((x) => (x.date || '').slice(0, 7) !== selMonthKey));
    toast(monthExpCount + ' despesa' + (monthExpCount === 1 ? '' : 's') + ' de ' + selMonthLabel + ' removida' + (monthExpCount === 1 ? '' : 's'), 'success');
  };

  // Recurring expenses pending for the selected month: those not yet materialised
  // into addedExp (no addedExp carrying their recId this month). Registering one
  // opens the add sheet pre-filled so the user can set the day it was charged.
  const recurring = state.recurring || [];
  let pendingRec = [];
  if (selMonthKey) {
    const matRecIds = new Set(
      addedExp
        .filter((x) => x.recId && (x.date || '').slice(0, 7) === selMonthKey)
        .map((x) => x.recId)
    );
    pendingRec = recurring.filter((r) => (r.amount || 0) > 0 && !matRecIds.has(r.id));
  }
  const daysInSelMonth = selMonthKey
    ? new Date(Number(selMonthKey.slice(0, 4)), Number(selMonthKey.slice(5, 7)), 0).getDate()
    : 31;
  const registerRec = (r) => {
    if (!selMonthKey) return;
    const day = Math.min(Math.max(parseInt(r.day, 10) || 1, 1), daysInSelMonth);
    ui.open('add', {
      prefill: {
        desc: r.name,
        amount: r.amount,
        cat: r.cat,
        date: selMonthKey + '-' + String(day).padStart(2, '0'),
        recId: r.id,
      },
    });
  };

  return (
    <div style={{ padding: '0 20px 24px' }}>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <SearchIcon />
        <input
          id="exSearch"
          type="search"
          aria-label="Pesquisar despesas"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar…"
          style={{ width: '100%', padding: '12px 16px 12px 40px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }}
        />
      </div>

      {/* Imported-expense cleanup (only when duplicates or wrong dates exist) */}
      {needsClean && (
        <button
          type="button"
          onClick={cleanExpenses}
          style={{ width: '100%', marginBottom: 12, padding: '10px 14px', border: '1px solid var(--warning)', background: 'var(--orange-soft)', color: 'var(--warning)', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          {cleanLabel}
        </button>
      )}

      {/* Remove all expenses in the selected month (wipe & re-import) */}
      {monthExpCount > 0 && (
        <button
          type="button"
          onClick={removeMonthExpenses}
          style={{ width: '100%', marginBottom: 12, padding: '10px 14px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--signal)', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Remover as {monthExpCount} despesas de {selMonthLabel} (limpar p/ reimportar)
        </button>
      )}

      {/* Tag chips */}
      {tagList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, alignItems: 'center' }}>
          {tagList.map((t) => {
            const on = tagFilter.indexOf(t) > -1;
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTagFilter(t)}
                style={{ padding: '5px 10px', border: '1px solid ' + (on ? 'var(--fg)' : 'var(--border)'), background: on ? 'var(--fg)' : 'transparent', color: on ? 'var(--bg)' : 'var(--fg-muted)', borderRadius: 999, fontSize: 11, fontWeight: 500, fontFamily: 'var(--mono)', cursor: 'pointer' }}
              >
                #{t}
              </button>
            );
          })}
          {tagFilter.length > 0 && (
            <button
              type="button"
              onClick={clearTagFilter}
              style={{ padding: '5px 10px', border: 'none', background: 'transparent', color: 'var(--fg-subtle)', borderRadius: 999, fontSize: 11, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Month bar */}
      <div className="ms-bar">
        {ms.map((m, i) => (
          <button
            key={i}
            type="button"
            className={'ms' + (em === i ? ' on' : '')}
            aria-current={em === i ? 'true' : undefined}
            onClick={() => actions.setEm(i)}
            style={i < 3 ? { borderRight: '1px solid var(--border)' } : undefined}
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          className={'ms' + (em === 4 ? ' on' : '')}
          aria-current={em === 4 ? 'true' : undefined}
          onClick={() => actions.setEm(4)}
          style={{ borderLeft: '1px solid var(--border)' }}
        >
          {preview ? 'Q1' : '3M'}
        </button>
      </div>

      {/* Total card */}
      <div className="cd" style={{ marginBottom: 16 }}>
        <div className="rw">
          <div>
            <div className="lb">{isQ ? (preview ? 'Despesas Q1' : 'Despesas 3M (últimos 3 meses)') : 'DESPESAS ' + ms[em]}</div>
            <div className="m" style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{fm(tE)}</div>
          </div>
          {!isQ && em < 3 && salP[em] != null && (
            <div style={{ textAlign: 'right' }}>
              <div className="lb">Salário</div>
              <div className="m" style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>{fm(salP[em])}</div>
            </div>
          )}
        </div>
        {partialNote}
      </div>

      {/* Recorrentes pendentes do mês selecionado — registar com o dia da cobrança */}
      {pendingRec.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="lb" style={{ marginBottom: 8, padding: '0 4px' }}>
            Recorrentes de {selMonthLabel} ({pendingRec.length})
          </div>
          {pendingRec.map((r) => {
            const b = bdg.find((bb) => bb.id === r.cat);
            return (
              <div key={r.id} className="cd" style={{ marginBottom: 8, padding: '10px 14px' }}>
                <div className="rw" style={{ gap: 12 }}>
                  <CategoryIcon id={r.cat} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                      {(b ? b.nm : '-') + ' · dia ' + (r.day || '?') + ' · ' + fm(r.amount)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => registerRec(r)}
                    style={{ padding: '7px 12px', border: '1px solid var(--primary)', background: 'var(--blue-soft)', color: 'var(--primary)', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Registar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="empty fadeUp" style={{ padding: '40px 20px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Sem despesas neste período</div>
          <div style={{ fontSize: 11, lineHeight: 1.5 }}>
            Toca no <span style={{ color: 'var(--blue)', fontWeight: 700 }}>+</span> em baixo
            <br />
            para adicionar a primeira.
          </div>
        </div>
      )}

      {/* Category rows (FIX 2 — stable `r.id` keys) */}
      {rows.map((r) => {
        const isE = xExp === r.id;
        const ov = r.pct > 100;
        const bc = ov ? 'var(--signal)' : r.pct > 75 ? '#f5a623' : 'var(--text)';
        const op = ov ? '1' : '0.6';
        // Historical demo transactions (orig 1161).
        const hTxn = (txn[r.id] && txn[r.id][em]) ? txn[r.id][em] : [];
        // Imported/added expenses in this category (orig 1168) — carry stable id.
        const aTxn = addedExp.filter((x) => x.cat === r.id);
        return (
          <div key={r.id} style={{ marginBottom: 4 }}>
            <button type="button" className="exp-btn" style={{ alignItems: 'center', gap: 12 }} onClick={() => setXExp(isE ? null : r.id)}>
              <CategoryIcon id={r.id} size={40} />
              <div style={{ flex: 1 }}>
                <div className="rw">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.nm}</span>
                  <div>
                    <span className="m" style={{ fontSize: 13, fontWeight: 600 }}>{fm(r.val)}</span>
                    <span className="m" style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>/ {fm(r.lm)}</span>
                  </div>
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: Math.min(r.pct, 100) + '%', background: bc, opacity: op }} />
                </div>
                <div className="rw" style={{ marginTop: 4 }}>
                  <span className="m" style={{ fontSize: 10, color: ov ? 'var(--signal)' : 'var(--text3)' }}>{r.pct.toFixed(0)}%</span>
                  {ov ? (
                    <span className="m" style={{ fontSize: 10, color: 'var(--signal)' }}>+{fm(r.val - r.lm)}</span>
                  ) : (
                    <span className="m" style={{ fontSize: 10, color: 'var(--success)' }}>Resta {fm(r.lm - r.val)}</span>
                  )}
                </div>
              </div>
            </button>

            {isE && !isQ && (
              <div className="exp-detail">
                {/* Historical transactions */}
                {hTxn.map((t, i) => (
                  <div key={'h' + i} className="rw" style={{ padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t[0]}</span>
                    <span className="m" style={{ fontSize: 12, fontWeight: 500 }}>{fm(t[1])}</span>
                  </div>
                ))}

                {/* Imported / added (editable) */}
                {aTxn.length > 0 && (
                  <>
                    {hTxn.length > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />}
                    <div className="lb" style={{ fontSize: 9, marginBottom: 6 }}>Importadas</div>
                    {aTxn.map((x, i) => {
                      return (
                        <div key={'a' + x.id} style={{ padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                          <div className="rw">
                            <span style={{ fontSize: 12, color: 'var(--text)' }}>
                              {x.desc}
                              {x.shared && (
                                <span style={{ fontSize: 9, color: 'var(--blue)', background: 'var(--blue-soft)', padding: '1px 6px', borderRadius: 8, fontWeight: 600, marginLeft: 4 }}>
                                  /{x.split || 2}
                                </span>
                              )}
                            </span>
                            <span className="m" style={{ fontSize: 12, fontWeight: 500 }}>
                              {fm(x.amount)}
                              {x.shared && x.total != null && (
                                <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 4 }}>de {fm(x.total)}</span>
                              )}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span className="m" style={{ fontSize: 9, color: 'var(--text3)' }}>{x.date}</span>
                            {/* FIX 3: alphabetical picker · FIX 1 applied in changeExpCat */}
                            <select
                              value={x.cat}
                              onChange={(e) => changeExpCat(x.id, e.target.value)}
                              aria-label={'Categoria de ' + x.desc}
                              style={{ padding: '8px 6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', borderRadius: 'var(--r2)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.05em', appearance: 'none', minHeight: 40 }}
                            >
                              {cats.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.nm}
                                </option>
                              ))}
                            </select>
                            <button type="button" onClick={() => openAdd(x.id)} aria-label="Editar despesa" style={{ background: 'none', border: 'none', color: 'var(--blue)', fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', fontWeight: 600, padding: '10px 10px', minHeight: 40 }}>
                              Editar
                            </button>
                            <button type="button" onClick={() => deleteExp(x.id)} aria-label="Remover despesa" style={{ background: 'none', border: 'none', color: 'var(--signal)', fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', padding: '10px 10px', minHeight: 40 }}>
                              Remover
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {hTxn.length === 0 && aTxn.length === 0 && (
                  <div className="lb" style={{ padding: '8px 0', color: 'var(--text3)' }}>Sem transações detalhadas</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
