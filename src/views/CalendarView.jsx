/* ════════════════════════════════════════════════════════════════════════
   Calendar (Calendário) view — React port of rCalendar (orig 1198-1312).

   Builds an events map { day: [{ type, name, amount, color }] } for the
   displayed month (current month + calOffset) from:
     - the loan payment (day 28, only when the user has a loan),
     - recurring expenses (negative),
     - recurring incomes (+ one-off incomes whose date falls in the month),
     - addedExp entries whose date falls in the month.

   - Month navigator (prev / "back to today" / next), Income/Expense/Net
     summary, the month grid (Monday-first) with per-day income/expense
     markers, the selected-day detail panel, and a legend.
   - calOffset (months from current) and showCalDay (selected day | null) are
     component-local state, matching the map's guidance.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { fc, fm, mask } from '../lib/format.js';
import { getLoan } from '../lib/finance.js';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // Monday-first labels

export default function CalendarView() {
  const { state, currentUser } = useStore();
  const hidden = !!state.balancesHidden;
  const [calOffset, setCalOffset] = useState(0); // months from current
  const [showCalDay, setShowCalDay] = useState(null);

  const recurring = state.recurring || [];
  const incomes = state.incomes || [];
  const addedExp = state.addedExp || [];

  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday-first

  // Build events map: day -> [{ type, name, amount, color }]
  const events = {};
  const push = (day, ev) => {
    events[day] = events[day] || [];
    events[day].push(ev);
  };

  // Loan payment (only if user has loan)
  const lnC = getLoan({ ...state, currentUser });
  if (lnC.pay > 0) {
    push(28, { type: 'loan', name: 'Crédito Habitação', amount: -lnC.pay, color: 'var(--signal)' });
  }
  // Recurring expenses
  recurring.forEach((r) => {
    const day = Math.min(parseInt(r.day) || 1, daysInMonth);
    push(day, { type: 'rec_out', name: r.name, amount: -(r.amount || 0), color: 'var(--orange)' });
  });
  // Incomes — recurring monthly, or one-offs landing in this month
  incomes.forEach((i) => {
    if (i.recurring !== false) {
      const day = Math.min(parseInt(i.day) || 1, daysInMonth);
      push(day, { type: 'income', name: i.name, amount: i.amount || 0, color: 'var(--success)' });
    } else if (i.date) {
      const dt = new Date(i.date);
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        push(dt.getDate(), { type: 'income_one', name: i.name, amount: i.amount || 0, color: 'var(--success)' });
      }
    }
  });
  // Added expenses with dates in this month
  addedExp.forEach((x) => {
    if (!x.date) return;
    const dt = new Date(x.date);
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      push(dt.getDate(), { type: 'exp', name: x.desc, amount: -x.amount, color: 'var(--signal)' });
    }
  });

  // Totals
  let totalIn = 0;
  let totalOut = 0;
  Object.keys(events).forEach((k) => {
    events[k].forEach((ev) => {
      if (ev.amount > 0) totalIn += ev.amount;
      else totalOut += Math.abs(ev.amount);
    });
  });
  const net = totalIn - totalOut;
  const todayDate = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Build day cells
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const ev = events[day] || [];
    const hasIn = ev.some((e) => e.amount > 0);
    const hasOut = ev.some((e) => e.amount < 0);
    const isToday = isCurrentMonth && day === todayDate;
    const bg = isToday ? 'var(--blue)' : ev.length > 0 ? 'var(--bg3)' : 'transparent';
    const col = isToday ? '#fff' : ev.length > 0 ? 'var(--text)' : 'var(--text2)';
    cells.push(
      <button
        key={day}
        type="button"
        onClick={() => setShowCalDay(day)}
        style={{
          aspectRatio: '1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: showCalDay === day ? '2px solid var(--blue)' : 'none',
          background: bg,
          color: col,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: isToday ? 700 : 500,
          position: 'relative',
          padding: 2,
        }}
      >
        <span>{day}</span>
        {ev.length > 0 && (
          <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
            {hasIn && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--success)' }} />}
            {hasOut && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--signal)' }} />}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
      {/* Header navigator */}
      <div className="rw" style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setCalOffset((o) => o - 1)} className="icon-btn" aria-label="Mês anterior">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {MONTH_NAMES[month]} {year}
          </div>
          {calOffset !== 0 ? (
            <button
              type="button"
              onClick={() => setCalOffset(0)}
              style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 11, fontWeight: 700, marginTop: 2, cursor: 'pointer', padding: '2px 6px' }}
            >
              Voltar a hoje
            </button>
          ) : (
            <button
              type="button"
              disabled
              style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 11, fontWeight: 500, marginTop: 2, padding: '2px 6px', opacity: 0.6 }}
              aria-label="Ja estas no mês atual"
            >
              Mês atual
            </button>
          )}
        </div>
        <button type="button" onClick={() => setCalOffset((o) => o + 1)} className="icon-btn" aria-label="Mês seguinte">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Summary */}
      <div className="g3" style={{ marginBottom: 16 }}>
        <div className="cd" style={{ padding: 12 }}>
          <div className="lb" style={{ fontSize: 11 }}>Receita</div>
          <div className="m" style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)', marginTop: 2 }}>{hidden ? '••••' : '+' + fc(totalIn)}</div>
        </div>
        <div className="cd" style={{ padding: 12 }}>
          <div className="lb" style={{ fontSize: 11 }}>Despesa</div>
          <div className="m" style={{ fontSize: 14, fontWeight: 600, color: 'var(--signal)', marginTop: 2 }}>{hidden ? '••••' : '-' + fc(totalOut)}</div>
        </div>
        <div className="cd" style={{ padding: 12, borderLeft: '3px solid ' + (net >= 0 ? 'var(--success)' : 'var(--signal)') }}>
          <div className="lb" style={{ fontSize: 11 }}>Net</div>
          <div className="m" style={{ fontSize: 14, fontWeight: 800, color: net >= 0 ? 'var(--success)' : 'var(--signal)', marginTop: 2 }}>
            {hidden ? '••••' : (net >= 0 ? '+' : '') + fc(net)}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="cd" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 2, marginBottom: 6 }}>
          {DOW.map((dn, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', fontWeight: 700, padding: '4px 0' }}>
              {dn}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 2 }}>{cells}</div>
      </div>

      {/* Selected day details */}
      {showCalDay && events[showCalDay] && (
        <div className="cd fadeUp" style={{ padding: 16, marginBottom: 16 }}>
          <div className="rw" style={{ marginBottom: 10 }}>
            <div className="lb">Dia {showCalDay}</div>
            <button
              type="button"
              onClick={() => setShowCalDay(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}
              aria-label="Fechar"
            >
              &times;
            </button>
          </div>
          {events[showCalDay].map((ev, idx) => (
            <div key={idx} className="rw" style={{ padding: '8px 0', borderTop: '1px solid var(--bg3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color }} />
                <span style={{ fontSize: 13 }}>{ev.name}</span>
              </div>
              <span className="m" style={{ fontSize: 13, fontWeight: 600, color: ev.color }}>
                {hidden ? '••••' : (ev.amount > 0 ? '+' : '') + fm(ev.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="cd" style={{ padding: '12px 14px' }}>
        <div className="lb" style={{ marginBottom: 8 }}>Legenda</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'var(--text2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            Receita
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)' }} />
            Recorrente
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--signal)' }} />
            Despesa
          </div>
        </div>
      </div>
    </div>
  );
}
