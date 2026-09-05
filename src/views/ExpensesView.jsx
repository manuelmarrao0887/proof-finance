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
import { fm, fc, mask, maskPct, normalizeStmtDate, fmDateShort, todayISO } from '../lib/format.js';
import CategoryIcon from '../components/CategoryIcon.jsx';
import MerchantLogo from '../components/MerchantLogo.jsx';
import Icon from '../components/Icon.jsx';
import Amount from '../components/Amount.jsx';
import { dedupeAddedExp } from '../lib/dedupe.js';
import { monthSpend } from '../lib/metrics.js';
import { monthEffectiveLimits } from '../lib/budget.js';
import { windowLabels, windowMonthKeys, monthKeyAt, categorySeries, seriesTrend } from '../lib/months.js';
import Sparkline from '../components/Sparkline.jsx';
import MonthNav from '../components/MonthNav.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmSheet.jsx';
import { snapshotSlices } from '../lib/snapshot.js';
import { dayLabel, groupByDay } from '../lib/days.js';
import {
  isPreviewMode,
  isNewUser,
  getByC,
  getSal,
  txn,
  normAcct,
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
  const confirm = useConfirm();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const hidden = !!state.balancesHidden;

  const [searchQuery, setSearchQuery] = useState('');
  const [acctFilter, setAcctFilter] = useState(''); // '' = todas as contas
  const [tagFilter, setTagFilter] = useState([]);
  const [xExp, setXExp] = useState(null); // expanded budget-category id

  const preview = isPreviewMode(s);
  // Um só seletor de tempo (Task 16, D12): o mês selecionado é sempre o
  // último da janela de 4 meses (em=3, ver MonthNav/setMOff em lib/months.js
  // e store.jsx). O modo "3M" deixa de mexer no `em` global partilhado com
  // outras vistas (Receitas) e passa a um toggle local mostrado como chip.
  const em = 3;
  const [range3, setRange3] = useState(false);
  const isQ = range3;

  const addedExp = state.addedExp || [];
  const bdg = state.bdg || [];

  // Deslocamento da janela de 4 meses (0 = acaba no mês atual) — ver lib/months.
  const mOff = Number(state.mOff) || 0;

  // Month labels (orig 1007-1020): preview = Jan-Abr; auth = janela de 4 meses.
  const ms = useMemo(() => {
    if (preview) return ['Jan', 'Fev', 'Mar', 'Abr'];
    return windowLabels(mOff);
  }, [preview, mOff]);

  const openAdd = (editId) => ui.open('add', editId != null ? { editId } : true);

  // Editar um movimento: se veio de um grupo (`groupEntryId`), abre a sheet de
  // despesa de grupo com a entry correspondente (procurada em state.groupEntries,
  // nunca confiada ao próprio movimento) — assim a edição mexe na divisão pelas
  // pessoas, não só na minha parte. Sem entry correspondente (apagada entretanto,
  // dado legado), cai no comportamento normal.
  const openExpEdit = (x) => {
    if (x.groupEntryId) {
      const entry = (state.groupEntries || []).find((e) => e.id === x.groupEntryId);
      if (entry) {
        ui.open('gexp', entry);
        return;
      }
    }
    openAdd(x.id);
  };

  const toggleTagFilter = (t) =>
    setTagFilter((tf) => (tf.indexOf(t) > -1 ? tf.filter((x) => x !== t) : [...tf, t]));
  const clearTagFilter = () => setTagFilter([]);

  const deleteExp = (x) => {
    confirm({
      title: 'Remover despesa',
      message: (x.desc || '') + ' · ' + fmDateShort(x.date),
      amount: x.amount,
      onConfirm: () => {
        // groupEntries também vai no snapshot: deleteExpense (store.jsx) põe
        // linkedExpId a null na entry do grupo quando a despesa apagada tinha
        // groupEntryId (orphanedGroupEntries) — sem repor essa fatia, o
        // Anular ressuscita a despesa mas a entry fica "sem reflexo", e a
        // próxima edição da entry cria uma SEGUNDA despesa pessoal (Task 8,
        // review "Fix round 1", finding 1).
        const snap = snapshotSlices(actions.getState(), ['addedExp', 'groupEntries']);
        actions.deleteExpense(x.id);
        toast('Despesa removida', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
      },
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // SEARCH / TAG MODE (orig 1026-1071)
  // ════════════════════════════════════════════════════════════════════════
  const q = (searchQuery || '').toLowerCase().trim();
  const hasTagFilter = tagFilter && tagFilter.length > 0;
  // Contas/cartões que têm mesmo despesas — evita um seletor cheio de opções vazias.
  const acctsWithExp = Array.from(
    new Set(addedExp.map((x) => (x.acct || '').trim()).filter(Boolean))
  ).sort();
  const hasAcctFilter = !!acctFilter;

  if (q || hasTagFilter || hasAcctFilter) {
    const matches = addedExp
      .map((x, idx) => ({ x, idx }))
      .filter(({ x }) => {
        if (hasAcctFilter && normAcct(x.acct) !== normAcct(acctFilter)) return false;
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
    /* Evolução dos resultados nos últimos 6 meses + média mensal: responde a
       "quanto gasto neste sítio?" sem obrigar a somar à mão. */
    const searchKeys = [];
    for (let k = 5; k >= 0; k--) {
      const dd = new Date();
      searchKeys.push(
        new Date(dd.getFullYear(), dd.getMonth() - k, 1).getFullYear() +
          '-' +
          String(new Date(dd.getFullYear(), dd.getMonth() - k, 1).getMonth() + 1).padStart(2, '0')
      );
    }
    const searchSeries = searchKeys.map((k) =>
      matches.reduce((acc, { x }) => ((x.date || '').slice(0, 7) === k ? acc + (Number(x.amount) || 0) : acc), 0)
    );
    const activeMonths = searchSeries.filter((v) => v > 0).length;
    const searchAvg = activeMonths ? searchSeries.reduce((a, b) => a + b, 0) / activeMonths : 0;
    // Sorted by date desc (orig 1056) — keyed by expense identity so reconciles in place.
    const sorted = [...matches].sort((a, b) => (b.x.date || '').localeCompare(a.x.date || ''));
    // Calculado uma única vez (não a cada grupo) para os cabeçalhos "Hoje"/"Ontem".
    const today = todayISO();

    return (
      <div className="fadeUp" style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingBottom: 'var(--space-5)' }}>
        <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
          <SearchIcon />
          <input
            id="exSearch"
            type="search"
            aria-label="Pesquisar despesas"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar…"
            style={{ width: '100%', padding: 'var(--space-4) var(--space-7)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 'var(--fs-lg)', boxSizing: 'border-box' }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg-subtle)', fontSize: 'var(--fs-lg)', lineHeight: 1, padding: 'var(--space-4)', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="Limpar pesquisa"
            >
              &times;
            </button>
          )}
        </div>
        {hasTagFilter && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', paddingLeft: 'var(--space-2)', paddingRight: 'var(--space-2)' }}>
            {tagFilter.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTagFilter(t)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--fg)', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 'var(--fs-xs)', fontWeight: 500, fontFamily: 'var(--mono)' }}
              >
                #{t} &times;
              </button>
            ))}
          </div>
        )}
        {/* Filtro por conta/cartão — "quanto saiu deste cartão?" */}
        {acctsWithExp.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', paddingLeft: 'var(--space-2)', paddingRight: 'var(--space-2)' }}>
            <select
              value={acctFilter}
              onChange={(e) => setAcctFilter(e.target.value)}
              aria-label="Filtrar por conta"
              style={{ flex: 1, minWidth: 0, padding: 'var(--space-3) var(--space-3)', border: '1px solid ' + (hasAcctFilter ? 'var(--primary)' : 'var(--border)'), background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, fontSize: 'var(--fs-input)' }}
            >
              <option value="">Todas as contas</option>
              {acctsWithExp.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {hasAcctFilter && (
              <button
                type="button"
                onClick={() => setAcctFilter('')}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 999, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--fs-xs)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Limpar
              </button>
            )}
          </div>
        )}
        <div className="rw" style={{ marginBottom: 'var(--space-3)', paddingLeft: 'var(--space-2)', paddingRight: 'var(--space-2)' }}>
          <div className="lb">{matches.length + ' resultado' + (matches.length === 1 ? '' : 's')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {!hidden && activeMonths > 1 && (
              <>
                <Sparkline values={searchSeries} width={44} height={16} />
                <span className="m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)' }}>~{mask(searchAvg, hidden, fm)}/mês</span>
              </>
            )}
            <div className="m" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{mask(tot, hidden, fm)}</div>
          </div>
        </div>
        {sorted.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 'var(--fs-sm)' }}>{'Sem resultados para "' + searchQuery + '"'}</div>
          </div>
        ) : (
          groupByDay(sorted).map((g) => (
            <div key={g.date || 'sem-data'}>
              <div className="day-lb">{dayLabel(g.date, today)}</div>
              {g.items.map(({ x }) => {
                const b = bdg.find((bb) => bb.id === x.cat);
                return (
                  <div key={x.id} className="cd" style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-4) var(--space-4)' }}>
                    <div className="rw" style={{ gap: 'var(--space-4)' }}>
                      <MerchantLogo text={x.desc} cat={x.cat} size={40} bdg={bdg} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>
                          {x.desc}
                          {x.shared && (
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--blue)', background: 'var(--blue-soft)', padding: 'var(--space-1) var(--space-2)', borderRadius: 8, fontWeight: 600, marginLeft: 'var(--space-2)' }}>
                              /{x.split || 2}
                            </span>
                          )}
                          {x.groupEntryId && (
                            <span className="chip" style={{ background: 'var(--blue-soft)', color: 'var(--blue)', border: 'none', padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--fs-xs)', marginLeft: 'var(--space-2)' }}>
                              grupo
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-1)' }}>
                          {(b ? b.nm : '-') + (x.acct ? ' · ' + x.acct : '')}
                        </div>
                        {x.tags && x.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
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
                                  style={{ fontSize: 'var(--fs-xs)', background: on ? 'var(--fg)' : 'var(--elevated)', color: on ? 'var(--bg)' : 'var(--fg-muted)', padding: 'var(--space-1) var(--space-3)', borderRadius: 999, fontWeight: 500, border: '1px solid ' + (on ? 'var(--fg)' : 'var(--border)'), fontFamily: 'var(--mono)', cursor: 'pointer' }}
                                >
                                  #{t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <Amount value={x.amount} kind="out" hidden={hidden} style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }} />
                        <button type="button" onClick={() => openExpEdit(x)} className="icon-btn" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Editar despesa">
                          <EditIcon />
                        </button>
                        <button type="button" onClick={() => deleteExp(x)} className="icon-btn" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--signal)' }} aria-label="Remover despesa">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
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
    const monthKeys = windowMonthKeys(mOff);
    addedExp.forEach((x) => {
      if (!x.date) return;
      const ym = x.date.slice(0, 7);
      const idx = monthKeys.indexOf(ym);
      if (idx < 0) return;
      if (!eByC[x.cat]) eByC[x.cat] = [0, 0, 0, 0];
      eByC[x.cat][idx] += x.amount;
    });
  }

  // Orçamento com rollover: limite efetivo = base + sobra/falta transitada.
  const rolloverOn = !!state.rolloverOn;
  let selYm = null;
  if (!preview && em >= 0 && em <= 3) selYm = monthKeyAt(em, mOff);
  const effLims = rolloverOn && selYm ? monthEffectiveLimits(addedExp, bdg, selYm, true) : null;

  const rows = [];
  bdg.forEach((b) => {
    const vs = eByC[b.id] || [0, 0, 0, 0];
    const val = isQ ? vs[0] + vs[1] + vs[2] : vs[em];
    const base = isQ ? b.lm * 3 : b.lm;
    const eff = effLims && !isQ && effLims[b.id] ? effLims[b.id].eff : base;
    if (val > 0) {
      // Tendência de 6 meses até ao mês selecionado (sparkline + variação).
      const series = preview || isQ ? null : categorySeries(addedExp, b.id, 6, monthKeyAt(em, mOff));
      rows.push({ id: b.id, nm: b.nm, val, lm: eff, carried: eff - base, pct: eff > 0 ? (val / eff) * 100 : 0, vs, series, trend: series ? seriesTrend(series) : null });
    }
  });
  // By-value ordering for the budget summary (orig 1103). Rows carry stable
  // `id` keys (FIX 2) so React reconciles them in place instead of rebuilding.
  rows.sort((a, b) => b.val - a.val);
  // Total do cartão "DESPESAS {mês}": SEMPRE monthSpend (a mesma fórmula da
  // faixa/Relatório/Calendário) — nunca a soma dos rows do orçamento, que
  // ficava aquém quando havia despesas em categorias fora de state.bdg.
  // Preview usa os buckets sintéticos (sem datas reais para monthSpend).
  // No modo 3M soma monthSpend dos 3 meses mais antigos da janela (os mesmos
  // que os rows por categoria já somavam com vs[0]+vs[1]+vs[2]).
  const tE = preview
    ? rows.reduce((acc, r) => acc + r.val, 0)
    : isQ
      ? windowMonthKeys(mOff).slice(0, 3).reduce((acc, key) => acc + monthSpend(s, key), 0)
      : monthSpend(s, selYm);

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
  const today = new Date();
  const todayMonth = todayISO().slice(0, 7);
  const selectedMonth = !preview && em >= 0 && em <= 3 ? monthKeyAt(em, mOff) : null;
  const isCurrentMonth = selectedMonth === todayMonth;
  if (em === 3 && !newUser && !preview && isCurrentMonth) {
    const dToday = new Date();
    const dEnd = new Date(dToday.getFullYear(), dToday.getMonth() + 1, 0).getDate();
    const pct = Math.round((dToday.getDate() / dEnd) * 100);
    partialNote = (
      <div className="m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-3)' }}>
        {ms[3] + ' parcial · ' + maskPct(pct, hidden) + ' do mês'}
      </div>
    );
  } else if (em === 3 && preview) {
    partialNote = (
      <div className="m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--signal)', marginTop: 'var(--space-3)' }}>Abril parcial</div>
    );
  }

  // Imported-expense cleanup: remove duplicates AND fix wrong/legacy dates
  // (DD.MM → ISO and YYYY-DD-MM day/month swaps). One button, only when needed.
  const dupCount = addedExp.length - dedupeAddedExp(addedExp).length;
  const dateBad = addedExp.filter((x) => (x.date || '') !== normalizeStmtDate(x.date)).length;
  const needsClean = dupCount > 0 || dateBad > 0;
  const cleanExpenses = () => {
    // groupEntries também vai no snapshot: setAddedExp (store.jsx) reconcilia
    // groupEntries quando o dedupe descarta uma linha ligada a um grupo — ver
    // a mesma nota em deleteExp (Task 8, review "Fix round 1", finding 1/5).
    const snap = snapshotSlices(actions.getState(), ['addedExp', 'groupEntries']);
    actions.setAddedExp(dedupeAddedExp(addedExp));
    const parts = [];
    if (dupCount > 0) parts.push(dupCount + ' duplicada' + (dupCount === 1 ? '' : 's') + ' removida' + (dupCount === 1 ? '' : 's'));
    if (dateBad > 0) parts.push(dateBad + ' data' + (dateBad === 1 ? '' : 's') + ' corrigida' + (dateBad === 1 ? '' : 's'));
    toast(parts.join(' · ') || 'Despesas importadas limpas', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
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
    selMonthKey = monthKeyAt(em, mOff);
    selMonthLabel = ms[em];
  }
  const monthExpCount = selMonthKey
    ? addedExp.filter((x) => (x.date || '').slice(0, 7) === selMonthKey).length
    : 0;
  const removeMonthExpenses = () => {
    if (!selMonthKey) return;
    confirm({
      title: 'Remover despesas do mês',
      message: 'Remover as ' + monthExpCount + ' despesas de ' + selMonthLabel + '? Inclui manuais e importadas. Depois podes reimportar o extrato.',
      onConfirm: () => {
        // Estado fresco no momento de confirmar, não o `addedExp` capturado
        // no closure do render: a ConfirmSheet é assíncrona (fica aberta
        // segundos, ao contrário do confirm() nativo que bloqueava a thread)
        // — uma re-hidratação ou escrita do assistente nesse intervalo seria
        // descartada em silêncio pelo write-back de um array desatualizado
        // (Task 8, review "Fix round 1", finding 3).
        const cur = actions.getState().addedExp || [];
        const snap = snapshotSlices(actions.getState(), ['addedExp', 'groupEntries']);
        const curCount = cur.filter((x) => (x.date || '').slice(0, 7) === selMonthKey).length;
        actions.setAddedExp(cur.filter((x) => (x.date || '').slice(0, 7) !== selMonthKey));
        toast(curCount + ' despesa' + (curCount === 1 ? '' : 's') + ' de ' + selMonthLabel + ' removida' + (curCount === 1 ? '' : 's'), 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
      },
    });
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
    <div style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingBottom: 'var(--space-5)' }}>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
        <SearchIcon />
        <input
          id="exSearch"
          type="search"
          aria-label="Pesquisar despesas"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar…"
          style={{ width: '100%', padding: 'var(--space-4) var(--space-4) var(--space-4) var(--space-7)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 'var(--fs-lg)', boxSizing: 'border-box' }}
        />
      </div>

      {/* Imported-expense cleanup (only when duplicates or wrong dates exist) */}
      {needsClean && (
        <button
          type="button"
          onClick={cleanExpenses}
          style={{ width: '100%', marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--warning)', background: 'var(--orange-soft)', color: 'var(--warning)', borderRadius: 12, fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          {cleanLabel}
        </button>
      )}

      {/* Tag chips */}
      {tagList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
          {tagList.map((t) => {
            const on = tagFilter.indexOf(t) > -1;
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTagFilter(t)}
                style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid ' + (on ? 'var(--fg)' : 'var(--border)'), background: on ? 'var(--fg)' : 'transparent', color: on ? 'var(--bg)' : 'var(--fg-muted)', borderRadius: 999, fontSize: 'var(--fs-xs)', fontWeight: 500, fontFamily: 'var(--mono)', cursor: 'pointer' }}
              >
                #{t}
              </button>
            );
          })}
          {tagFilter.length > 0 && (
            <button
              type="button"
              onClick={clearTagFilter}
              style={{ padding: 'var(--space-2) var(--space-3)', border: 'none', background: 'transparent', color: 'var(--fg-subtle)', borderRadius: 999, fontSize: 'var(--fs-xs)', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Filtro por conta (entra no modo de pesquisa filtrada) */}
      {!preview && acctsWithExp.length > 1 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <select
            value={acctFilter}
            onChange={(e) => setAcctFilter(e.target.value)}
            aria-label="Filtrar despesas por conta"
            style={{ width: '100%', padding: 'var(--space-3) var(--space-3)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, fontSize: 'var(--fs-input)' }}
          >
            <option value="">Todas as contas</option>
            {acctsWithExp.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      {/* Navegação de meses (histórico, único seletor de tempo — Task 16) +
          chip "3M" (soma os 3 meses mais antigos da janela) */}
      {!preview && (
        <MonthNav
          extra={
            <button
              type="button"
              onClick={() => setRange3((v) => !v)}
              aria-pressed={isQ}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid ' + (isQ ? 'var(--primary)' : 'var(--border)'),
                background: isQ ? 'var(--primary)' : 'var(--surface)',
                color: isQ ? '#fff' : 'var(--text2)',
                borderRadius: 999,
                fontSize: 'var(--fs-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              3M
            </button>
          }
        />
      )}

      {/* Total card */}
      <div className="cd" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="rw">
          <div>
            <div className="lb">{isQ ? 'Despesas 3M (últimos 3 meses)' : 'DESPESAS ' + ms[em]}</div>
            {/* fc (0 decimais): o MESMO formato do número em todas as vistas. */}
            <div className="m" style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, marginTop: 'var(--space-2)' }}>{mask(tE, hidden, fc)}</div>
          </div>
          {!isQ && em < 3 && salP[em] != null && (
            <div style={{ textAlign: 'right' }}>
              <div className="lb">Salário</div>
              <div className="m" style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--success)', marginTop: 'var(--space-2)' }}>{mask(salP[em], hidden, fm)}</div>
            </div>
          )}
        </div>
        {partialNote}
      </div>

      {/* Recorrentes pendentes do mês selecionado — registar com o dia da cobrança */}
      {pendingRec.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div className="lb" style={{ marginBottom: 'var(--space-2)', paddingLeft: 'var(--space-2)', paddingRight: 'var(--space-2)' }}>
            Recorrentes de {selMonthLabel} ({pendingRec.length})
          </div>
          {pendingRec.map((r) => {
            const b = bdg.find((bb) => bb.id === r.cat);
            return (
              <div key={r.id} className="cd" style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' }}>
                <div className="rw" style={{ gap: 'var(--space-4)' }}>
                  <MerchantLogo text={r.name} cat={r.cat} size={36} bdg={bdg} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginTop: 'var(--space-1)' }}>
                      {(b ? b.nm : '-') + ' · dia ' + (r.day || '?') + ' · ' + mask(r.amount, hidden, fm)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => registerRec(r)}
                    style={{ padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--primary)', background: 'var(--blue-soft)', color: 'var(--primary)', borderRadius: 999, fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
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
        <div className="empty fadeUp" style={{ padding: 'var(--space-7) var(--space-5)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 'var(--space-2)' }}>Sem despesas neste período</div>
          <div style={{ fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
            Toca no <span style={{ color: 'var(--blue)', fontWeight: 700 }}>+</span> em baixo
            <br />
            para adicionar a primeira.
          </div>
        </div>
      )}

      {/* Transportar saldo do orçamento (só em meses, autenticado) */}
      {!preview && !isQ && rows.length > 0 && (
        <button
          type="button"
          onClick={() => actions.setRolloverOn(!rolloverOn)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 12, cursor: 'pointer' }}
          aria-pressed={rolloverOn}
        >
          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Transportar saldo</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)' }}>O que sobra ou falta passa para o mês seguinte</span>
          </span>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: rolloverOn ? 'var(--success)' : 'var(--text3)' }}>{rolloverOn ? 'ON' : 'OFF'}</span>
        </button>
      )}

      {/* Category rows (FIX 2 — stable `r.id` keys) */}
      {rows.map((r) => {
        const isE = xExp === r.id;
        const ov = r.pct > 100;
        const bc = ov ? 'var(--signal)' : r.pct > 75 ? '#f5a623' : 'var(--text)';
        const op = ov ? '1' : '0.6';
        // Historical demo transactions (orig 1161) — ONLY in preview/demo mode.
        // For an authenticated user these are phantom rows (not their data, can't
        // be deleted, don't match the real total), so they must never show.
        const hTxn = preview && txn[r.id] && txn[r.id][em] ? txn[r.id][em] : [];
        // Imported/added expenses in this category (orig 1168) — carry stable id.
        const aTxn = addedExp.filter((x) => x.cat === r.id);
        return (
          <div key={r.id} style={{ marginBottom: 'var(--space-2)' }}>
            <button type="button" className="exp-btn" style={{ alignItems: 'center', gap: 'var(--space-4)' }} onClick={() => setXExp(isE ? null : r.id)}>
              <CategoryIcon id={r.id} size={40} bdg={bdg} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rw">
                  <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    {r.nm}
                    {r.carried ? (
                      <span
                        title={'Transitado do mês anterior: ' + mask(r.carried, hidden, (v) => (v > 0 ? '+' : '') + fm(v))}
                        aria-label={'Transitado do mês anterior: ' + mask(r.carried, hidden, (v) => (v > 0 ? '+' : '') + fm(v))}
                        style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: r.carried > 0 ? 'var(--success)' : 'var(--signal)', background: r.carried > 0 ? 'var(--success-soft)' : 'var(--signal-soft)', padding: 'var(--space-1) var(--space-2)', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
                      >
                        <Icon name="recurring" size={9} />
                        {mask(r.carried, hidden, (v) => (v > 0 ? '+' : '') + fm(v))}
                      </span>
                    ) : null}
                  </span>
                  <div style={{ flexShrink: 0 }}>
                    <Amount value={r.val} kind="out" hidden={hidden} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }} />
                    <span className="m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginLeft: 'var(--space-2)' }}>/ {mask(r.lm, hidden, fm)}</span>
                  </div>
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: Math.min(r.pct, 100) + '%', background: bc, opacity: op }} />
                </div>
                <div className="rw" style={{ marginTop: 'var(--space-2)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, overflow: 'hidden' }}>
                    <span className="m" style={{ fontSize: 'var(--fs-xs)', color: ov ? 'var(--signal)' : 'var(--text3)', flexShrink: 0 }}>{maskPct(r.pct, hidden)}</span>
                    {!hidden && r.series && (
                      <>
                        <Sparkline values={r.series} color={r.trend > 25 ? 'var(--signal)' : r.trend < -25 ? 'var(--success)' : 'var(--text3)'} />
                        {r.trend != null && Math.abs(r.trend) >= 25 && (
                          <span className="m" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: r.trend > 0 ? 'var(--signal)' : 'var(--success)', flexShrink: 0 }}>
                            {(r.trend > 0 ? '+' : '') + Math.round(r.trend)}%
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  {ov ? (
                    <Amount value={r.val - r.lm} kind="alert" hidden={hidden} style={{ fontSize: 'var(--fs-xs)', flexShrink: 0 }} />
                  ) : (
                    <span className="m" style={{ fontSize: 'var(--fs-xs)', flexShrink: 0 }}>Resta <Amount value={r.lm - r.val} kind="neutral" hidden={hidden} style={{ color: 'var(--success)' }} /></span>
                  )}
                </div>
              </div>
            </button>

            {isE && !isQ && (
              <div className="exp-detail">
                {/* Historical transactions */}
                {hTxn.map((t, i) => (
                  <div key={'h' + i} className="rw" style={{ padding: 'var(--space-2) 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text2)' }}>{t[0]}</span>
                    <Amount value={t[1]} kind="out" hidden={hidden} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }} />
                  </div>
                ))}

                {/* Imported / added (editable) */}
                {aTxn.length > 0 && (
                  <>
                    {hTxn.length > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: 'var(--space-3) 0' }} />}
                    <div className="lb" style={{ fontSize: 'var(--fs-xs)', marginBottom: 'var(--space-2)' }}>Importadas</div>
                    {aTxn.map((x, i) => {
                      return (
                        <div key={'a' + x.id} style={{ padding: 'var(--space-2) 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                          <div className="rw" style={{ gap: 'var(--space-3)' }}>
                            <MerchantLogo text={x.desc} cat={x.cat} size={26} bdg={bdg} />
                            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', flex: 1, minWidth: 0 }}>
                              {x.desc}
                              {x.shared && (
                                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--blue)', background: 'var(--blue-soft)', padding: 'var(--space-1) var(--space-2)', borderRadius: 8, fontWeight: 600, marginLeft: 'var(--space-2)' }}>
                                  /{x.split || 2}
                                </span>
                              )}
                              {x.groupEntryId && (
                                <span className="chip" style={{ background: 'var(--blue-soft)', color: 'var(--blue)', border: 'none', padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--fs-xs)', marginLeft: 'var(--space-2)' }}>
                                  grupo
                                </span>
                              )}
                            </span>
                            <span>
                              <Amount value={x.amount} kind="out" hidden={hidden} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }} />
                              {x.shared && x.total != null && (
                                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', marginLeft: 'var(--space-2)' }}>de {mask(x.total, hidden, fm)}</span>
                              )}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                            <span className="m" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text3)', flex: 1 }}>{fmDateShort(x.date)}</span>
                            {/* Categoria muda-se via Editar (sheet) — sem seletor por linha. */}
                            <button type="button" onClick={() => openExpEdit(x)} className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Editar despesa">
                              <EditIcon />
                            </button>
                            <button type="button" onClick={() => deleteExp(x)} aria-label="Remover despesa" style={{ background: 'none', border: 'none', color: 'var(--signal)', fontFamily: 'var(--mono)', fontSize: 'var(--fs-xs)', cursor: 'pointer', padding: 'var(--space-3) var(--space-3)', minHeight: 36 }}>
                              Remover
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {hTxn.length === 0 && aTxn.length === 0 && (
                  <div className="lb" style={{ padding: 'var(--space-3) 0', color: 'var(--text3)' }}>Sem transações detalhadas</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Remover o mês inteiro (limpar p/ reimportar) — ação destrutiva, por isso
          discreta e no FIM da lista, não no topo do ecrã. */}
      {monthExpCount > 0 && (
        <button
          type="button"
          onClick={removeMonthExpenses}
          style={{ width: '100%', marginTop: 'var(--space-5)', padding: 'var(--space-3) var(--space-4)', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text3)', borderRadius: 12, fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Remover as {monthExpCount} despesas de {selMonthLabel} (para reimportar o extrato)
        </button>
      )}
    </div>
  );
}
