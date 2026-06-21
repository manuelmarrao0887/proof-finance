/* ════════════════════════════════════════════════════════════════════════
   App shell — Header + Hero/ContextStrip + tab-switched <main> + BottomNav,
   with all modals/sheets mounted. Navigation + modal state come from useUI().
   ════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { hasUnseenNotes } from '../lib/patchNotes.js';
import { isNewUser } from '../lib/finance.js';
import { useDevice } from '../store/device.jsx';
import Sidebar from './Sidebar.jsx';
import DeviceToggle from './DeviceToggle.jsx';

import Hero from './Hero.jsx';
import ContextStrip from './ContextStrip.jsx';
import Onboarding from './Onboarding.jsx';

// Overview is the landing view → eager (no flash). The rest load on demand when
// their tab is opened (code-splitting: each becomes its own chunk).
import OverviewView from '../views/OverviewView.jsx';
const ExpensesView = lazy(() => import('../views/ExpensesView.jsx'));
const GoalsView = lazy(() => import('../views/GoalsView.jsx'));
const CalendarView = lazy(() => import('../views/CalendarView.jsx'));
const IncomesView = lazy(() => import('../views/IncomesView.jsx'));
const RecurringView = lazy(() => import('../views/RecurringView.jsx'));
const ChartsView = lazy(() => import('../views/ChartsView.jsx'));
const LoanView = lazy(() => import('../views/LoanView.jsx'));
const AIView = lazy(() => import('../views/AIView.jsx'));

// Modals load on first open (and stay mounted afterwards so the close animation
// still plays). Keyed by their ui modal name (see MODALS in store/ui.jsx).
const MODAL_COMPONENTS = {
  add: lazy(() => import('../modals/AddExpenseSheet.jsx')),
  stmt: lazy(() => import('../modals/ImportStatementSheet.jsx')),
  settings: lazy(() => import('../modals/SettingsSheet.jsx')),
  goal: lazy(() => import('../modals/GoalModal.jsx')),
  rec: lazy(() => import('../modals/RecModal.jsx')),
  income: lazy(() => import('../modals/IncomeModal.jsx')),
  cat: lazy(() => import('../modals/CatManagerModal.jsx')),
  acct: lazy(() => import('../modals/AcctModal.jsx')),
  rules: lazy(() => import('../modals/RulesModal.jsx')),
  action: lazy(() => import('../modals/ActionSheet.jsx')),
  more: lazy(() => import('../modals/MoreMenu.jsx')),
  balanceUpdate: lazy(() => import('../modals/BalanceUpdateSheet.jsx')),
  balanceHistory: lazy(() => import('../modals/BalanceHistorySheet.jsx')),
  patchNotes: lazy(() => import('../modals/PatchNotesSheet.jsx')),
  lock: lazy(() => import('../modals/BalanceLockSheet.jsx')),
  housing: lazy(() => import('../modals/HousingModal.jsx')),
};

/* ── Icons (inline SVG, no emoji) ──────────────────────────────────────── */
const Icon = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" />
    </svg>
  ),
  expenses: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  goals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
    </svg>
  ),
  plus: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  sun: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
};

const VIEWS = {
  overview: OverviewView,
  expenses: ExpensesView,
  goals: GoalsView,
  cal: CalendarView,
  income: IncomesView,
  rec: RecurringView,
  charts: ChartsView,
  loan: LoanView,
  ai: AIView,
};

function SyncChip({ status }) {
  if (status === 'idle') return null;
  const label =
    status === 'saving' ? 'A guardar' : status === 'saved' ? 'Guardado' : status === 'error' ? 'Erro' : '';
  return (
    <span className={'sync-chip ' + status} id="syncChip">
      <span className="sync-dot" />
      <span className="sync-label">{label}</span>
    </span>
  );
}

// Shown while a lazily-loaded view chunk is fetched (usually a few ms).
function ViewFallback() {
  return (
    <div
      className="empty"
      style={{ padding: '48px 20px', display: 'flex', justifyContent: 'center' }}
      aria-live="polite"
    >
      <span className="lb" style={{ color: 'var(--fg-subtle)' }}>A carregar…</span>
    </div>
  );
}

function Header({ theme, onToggleTheme, syncStatus }) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && document.documentElement.getAttribute('data-theme') === 'dark');
  return (
    <header className="app-header" style={{ padding: 'calc(8px + var(--safe-top)) 20px 16px' }}>
      <div className="rw">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>Proof.</span>
          <span style={{ fontSize: 20, fontWeight: 400, color: 'var(--fg-muted)', letterSpacing: '-0.02em' }}>
            Finance
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SyncChip status={syncStatus} />
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label="Mudar tema">
            {isDark ? Icon.sun : Icon.moon}
          </button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ tab, onTab, onPlus, onMore }) {
  const slot = (key, label) => (
    <button
      type="button"
      className={'bnav-btn' + (tab === key ? ' on' : '')}
      aria-current={tab === key ? 'page' : undefined}
      onClick={() => onTab(key)}
    >
      {Icon[key]}
      <span>{label}</span>
    </button>
  );
  const moreTabs = ['cal', 'income', 'rec', 'charts', 'loan', 'ai'];
  return (
    <nav className="bnav">
      {slot('overview', 'Resumo')}
      {slot('expenses', 'Despesas')}
      <button type="button" className="bnav-center" onClick={onPlus} aria-label="Adicionar">
        <span className="fab">{Icon.plus}</span>
      </button>
      {slot('goals', 'Metas')}
      <button
        type="button"
        className={'bnav-btn' + (moreTabs.includes(tab) ? ' on' : '')}
        aria-current={moreTabs.includes(tab) ? 'page' : undefined}
        onClick={onMore}
      >
        {Icon.more}
        <span>Mais</span>
      </button>
    </nav>
  );
}

export default function Shell() {
  const { state, actions, syncStatus, currentUser } = useStore();
  const { tab, goTab, open, modals: modalState } = useUI();

  // Mount a modal's (lazy) component the first time it opens, then keep it
  // mounted so its close/exit animation still plays. Set only grows.
  const [mountedModals, setMountedModals] = useState(() => new Set());
  useEffect(() => {
    const openKeys = Object.keys(modalState).filter((k) => modalState[k] != null);
    if (!openKeys.length) return;
    setMountedModals((prev) => {
      let next = prev;
      openKeys.forEach((k) => {
        if (!next.has(k)) {
          if (next === prev) next = new Set(prev);
          next.add(k);
        }
      });
      return next;
    });
  }, [modalState]);

  // Auto-open "Novidades" once per session for existing users with unseen notes.
  const patchChecked = useRef(false);
  useEffect(() => {
    if (patchChecked.current) return;
    if (!currentUser) return;
    patchChecked.current = true;
    if (!isNewUser(state) && hasUnseenNotes(state.lastSeenPatchVersion)) {
      open('patchNotes');
    }
  }, [currentUser, state, open]);

  const toggleTheme = React.useCallback(() => {
    // light -> dark -> system -> light (orig toggleTheme 3111 cycles theme)
    const cur = state.theme || 'system';
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
    actions.setTheme(next);
  }, [state.theme, actions]);

  const View = VIEWS[tab] || OverviewView;
  const { mode, canToggle } = useDevice();

  // Modals are shared by both layouts. Only mount those that have been opened;
  // each lazy chunk loads on first open. Suspense fallback is null (modals are
  // invisible until their own open transition runs).
  const modals = (
    <Suspense fallback={null}>
      {[...mountedModals].map((k) => {
        const C = MODAL_COMPONENTS[k];
        return C ? <C key={k} /> : null;
      })}
    </Suspense>
  );

  if (mode === 'desktop') {
    return (
      <div className="fadeIn">
        <div className="dshell">
          <Sidebar />
          <div className="dcontent">
            <div className="dmain">
              <Onboarding />
              {tab === 'overview' ? (
                <>
                  <Hero />
                  <div className="dgrid">
                    <Suspense fallback={<ViewFallback />}>
                      <View />
                    </Suspense>
                  </div>
                </>
              ) : (
                <div className="dnarrow">
                  <ContextStrip tab={tab} />
                  <Suspense fallback={<ViewFallback />}>
                    <View />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
        </div>
        {modals}
      </div>
    );
  }

  // Mobile layout (also used to preview mobile on a desktop screen).
  return (
    <div className="fadeIn">
      {canToggle && <DeviceToggle />}
      <Header theme={state.theme} onToggleTheme={toggleTheme} syncStatus={syncStatus} />

      {tab === 'overview' ? <Hero /> : <ContextStrip tab={tab} />}
      <Onboarding />

      <main className="has-bnav scroll-body" style={{ minHeight: '60svh' }}>
        <Suspense fallback={<ViewFallback />}>
          <View />
        </Suspense>
      </main>

      <BottomNav tab={tab} onTab={goTab} onPlus={() => open('action')} onMore={() => open('more')} />

      {modals}
    </div>
  );
}
