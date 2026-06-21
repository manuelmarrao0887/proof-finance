/* ════════════════════════════════════════════════════════════════════════
   Goals (Metas) view — React port of rGoals (orig 1337-1383) + addToGoal
   (orig 1442-1449).

   - Empty state when no goals.
   - Global progress card (sum of targets/currents).
   - Per-goal card: colour strip, deadline, progress ring, current/target,
     ~monthly suggestion, and quick-add buttons (+10/+50/+100/+500).
   - Edit opens the goal modal via useUI().open('goal', { id }).
   - Quick-add writes through actions.updateGoal (read-modify-write, matching
     the original cap: never exceed target*1.5 → snap to target).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { fc } from '../lib/format.js';
import { monthsToTarget, etaDate, ymLabel } from '../lib/goals.js';

const QUICK_ADD = [10, 50, 100, 500];

export default function GoalsView() {
  const { state, actions } = useStore();
  const { open } = useUI();
  const toast = useToast();
  const goals = state.goals || [];

  function addToGoal(id, amt) {
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    let current = (g.current || 0) + amt;
    if (current > (g.target || 0) * 1.5) current = g.target;
    actions.updateGoal(id, { current });
    toast('+' + amt + ' EUR', 'success');
  }

  if (goals.length === 0) {
    return (
      <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
        <div className="empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Ainda não tens metas
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Cria a tua primeira meta de poupança:
            <br />
            fundo de emergência, ferias, casa nova...
          </div>
        </div>
      </div>
    );
  }

  let totalTarget = 0;
  let totalCurrent = 0;
  goals.forEach((g) => {
    totalTarget += g.target || 0;
    totalCurrent += g.current || 0;
  });
  const overall = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  return (
    <div className="fadeUp" style={{ padding: '0 20px 24px' }}>
      {/* Global progress */}
      <div className="cd" style={{ marginBottom: 16, padding: '18px 20px' }}>
        <div className="rw" style={{ marginBottom: 10 }}>
          <div className="lb">Progresso global</div>
          <div className="m" style={{ fontSize: 13, fontWeight: 700 }}>
            {overall.toFixed(0)}%
          </div>
        </div>
        <div className="bar" style={{ height: 8 }}>
          <div className="bar-fill" style={{ width: Math.min(overall, 100) + '%', background: 'var(--primary)' }} />
        </div>
        <div className="rw m" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          <span>
            {fc(totalCurrent)} de {fc(totalTarget)}
          </span>
          <span>{fc(Math.max(totalTarget - totalCurrent, 0))} restantes</span>
        </div>
      </div>

      {/* Per-goal cards */}
      {goals.map((g) => {
        const pct = g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0;
        const pctAbs = g.target > 0 ? (g.current / g.target) * 100 : 0;
        const c = g.color || '#3b6fee';
        const rem = Math.max(g.target - g.current, 0);
        let daysLeft = null;
        if (g.deadline) {
          const dl = new Date(g.deadline);
          if (!isNaN(dl)) daysLeft = Math.ceil((dl - new Date()) / 86400000);
        }
        let monthly = null;
        if (daysLeft && daysLeft > 0 && rem > 0) monthly = rem / (daysLeft / 30);

        const R = 28;
        const C2 = 2 * Math.PI * R;

        return (
          <div key={g.id} className="cd fadeUp" style={{ marginBottom: 12, padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: c }} />
            <div className="rw" style={{ marginBottom: 12, marginLeft: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{g.name}</div>
                {g.deadline && (
                  <div
                    style={{
                      fontSize: 11,
                      color: daysLeft != null && daysLeft < 30 ? 'var(--orange)' : 'var(--text3)',
                      marginTop: 2,
                      fontWeight: 500,
                    }}
                  >
                    {daysLeft != null
                      ? daysLeft > 0
                        ? daysLeft + ' dias restantes'
                        : 'Prazo passado'
                      : g.deadline}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => open('goal', { id: g.id })}
                className="icon-btn"
                style={{ width: 32, height: 32 }}
                aria-label="Editar meta"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 8 }}>
              {/* Ring */}
              <div className="ring-wrap">
                <svg width="72" height="72" viewBox="0 0 72 72">
                  <circle className="ring-bg" cx="36" cy="36" r={R} />
                  <circle
                    className="ring-fg"
                    cx="36"
                    cy="36"
                    r={R}
                    stroke={c}
                    strokeDasharray={C2}
                    strokeDashoffset={C2 - (pct / 100) * C2}
                  />
                </svg>
                <div style={{ position: 'absolute', fontSize: 13, fontWeight: 700, color: c }}>
                  {pctAbs.toFixed(0)}%
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="m" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {fc(g.current)}
                </div>
                <div className="m" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  de {fc(g.target)}
                </div>
                {g.monthly > 0 && rem > 0 ? (
                  <div style={{ fontSize: 11, color: c, marginTop: 6, fontWeight: 700 }}>
                    {fc(g.monthly)}/mês · conclui {ymLabel(etaDate(rem, g.monthly))} ({monthsToTarget(rem, g.monthly)} {monthsToTarget(rem, g.monthly) === 1 ? 'mês' : 'meses'})
                  </div>
                ) : monthly != null ? (
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, fontWeight: 600 }}>
                    Sugestão: ~ {fc(monthly)}/mês para o prazo
                  </div>
                ) : null}
              </div>
            </div>

            {/* Quick add buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14, marginLeft: 8 }}>
              {QUICK_ADD.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => addToGoal(g.id, amt)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text2)',
                    borderRadius: 8,
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
