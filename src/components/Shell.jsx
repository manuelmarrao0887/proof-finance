/* ════════════════════════════════════════════════════════════════════════
   App shell — Header + Hero/ContextStrip + tab-switched <main> + BottomNav,
   with all modals/sheets mounted. Navigation + modal state come from useUI().
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';

import Hero from './Hero.jsx';
import ContextStrip from './ContextStrip.jsx';
import Onboarding from './Onboarding.jsx';

import OverviewView from '../views/OverviewView.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import GoalsView from '../views/GoalsView.jsx';
import CalendarView from '../views/CalendarView.jsx';
import IncomesView from '../views/IncomesView.jsx';
import RecurringView from '../views/RecurringView.jsx';
import ChartsView from '../views/ChartsView.jsx';
import LoanView from '../views/LoanView.jsx';
import AIView from '../views/AIView.jsx';

import AddExpenseSheet from '../modals/AddExpenseSheet.jsx';
import ImportStatementSheet from '../modals/ImportStatementSheet.jsx';
import SettingsSheet from '../modals/SettingsSheet.jsx';
import GoalModal from '../modals/GoalModal.jsx';
import RecModal from '../modals/RecModal.jsx';
import IncomeModal from '../modals/IncomeModal.jsx';
import CatManagerModal from '../modals/CatManagerModal.jsx';
import AcctModal from '../modals/AcctModal.jsx';
import RulesModal from '../modals/RulesModal.jsx';
import BalanceUpdateSheet from '../modals/BalanceUpdateSheet.jsx';
import BalanceHistorySheet from '../modals/BalanceHistorySheet.jsx';
import ActionSheet from '../modals/ActionSheet.jsx';
import MoreMenu from '../modals/MoreMenu.jsx';

/* ── Icons (inline SVG, no emoji) ──────────────────────────────────────── */
const Icon = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
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

function Header({ theme, onToggleTheme, syncStatus }) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && document.documentElement.getAttribute('data-theme') === 'dark');
  return (
    <header className="app-header" style={{ padding: '8px 20px 16px' }}>
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
    <button type="button" className={'bnav-btn' + (tab === key ? ' on' : '')} onClick={() => onTab(key)}>
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
      <button type="button" className={'bnav-btn' + (moreTabs.includes(tab) ? ' on' : '')} onClick={onMore}>
        {Icon.more}
        <span>Mais</span>
      </button>
    </nav>
  );
}

export default function Shell() {
  const { state, actions, syncStatus } = useStore();
  const { tab, goTab, open } = useUI();

  const toggleTheme = React.useCallback(() => {
    // light -> dark -> system -> light (orig toggleTheme 3111 cycles theme)
    const cur = state.theme || 'system';
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
    actions.setTheme(next);
  }, [state.theme, actions]);

  const View = VIEWS[tab] || OverviewView;

  return (
    <div className="fadeIn">
      <Header theme={state.theme} onToggleTheme={toggleTheme} syncStatus={syncStatus} />

      {tab === 'overview' ? <Hero /> : <ContextStrip tab={tab} />}
      <Onboarding />

      <main className="has-bnav scroll-body" style={{ minHeight: '60svh' }}>
        <View />
      </main>

      <BottomNav tab={tab} onTab={goTab} onPlus={() => open('action')} onMore={() => open('more')} />

      {/* All modals/sheets — each reads its own open-state via useModal(). */}
      <AddExpenseSheet />
      <ImportStatementSheet />
      <SettingsSheet />
      <GoalModal />
      <RecModal />
      <IncomeModal />
      <CatManagerModal />
      <AcctModal />
      <BalanceUpdateSheet />
      <BalanceHistorySheet />
      <RulesModal />
      <ActionSheet />
      <MoreMenu />
    </div>
  );
}
