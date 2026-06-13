/* ════════════════════════════════════════════════════════════════════════
   PROOF. Finance — global store (React Context + useReducer).

   Holds the PERSISTED slice EXACTLY matching the Firestore doc users/{uid}
   (map §3): apiKey, aiHistory, dynAccts, dynSnaps, addedExp, theme, goals,
   recurring, incomes, bdg, customAccts, rules, forecastMonths, fxRates,
   aiInsights. Plus runtime fields: currentUser, syncStatus, em.

   Public API (see STORE_API.md):
     <StoreProvider>            wraps the app
     useStore() -> { state, dispatch, actions, currentUser, preview, syncStatus }
     useAuth()  -> { currentUser, setCurrentUser }   (thin auth slice)

   Persistence: any change to a persisted slice auto-saves (debounced 400ms)
   to users/{uid} via saveUserDoc, but ONLY when authed. syncStatus mirrors the
   original setSync ('idle'|'saving'|'saved'|'error'; auto-returns to idle 2s
   after 'saved'/'error').
   ════════════════════════════════════════════════════════════════════════ */

import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from 'react';
import { loadUserDoc, saveUserDoc } from '../firebase/client.js';
import { bdgDefault } from '../lib/finance.js';
import { uid } from '../lib/format.js';

/* ── Theme (orig applyTheme 310-316) ─────────────────────────────────────── */
export function applyTheme(t) {
  const actual =
    t === 'system'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : t;
  document.documentElement.setAttribute('data-theme', actual);
  let mc = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!mc) {
    mc = document.createElement('meta');
    mc.name = 'theme-color';
    document.head.appendChild(mc);
  }
  mc.content = actual === 'dark' ? '#0B0B0F' : '#F5F5F7';
}

/* ── Default persisted state (matches Firestore doc shape) ───────────────── */
export function defaultBdg() {
  // The 16 defaults from the original (orig 275-281), fresh copy.
  return bdgDefault.map((b) => ({ id: b.id, nm: b.nm, lm: b.lm }));
}

export function initialPersisted() {
  return {
    apiKey: '',
    aiHistory: [],
    dynAccts: null,
    dynSnaps: [],
    addedExp: [],
    balanceLog: [],
    theme: 'system',
    goals: [],
    recurring: [],
    incomes: [],
    bdg: defaultBdg(),
    customAccts: [],
    rules: [],
    forecastMonths: 3,
    fxRates: { EUR: 1, USD: 1.08, GBP: 0.85, BRL: 5.5 },
    aiInsights: null,
    lastSeenPatchVersion: 0,
  };
}

// Full initial reducer state = persisted slice + runtime fields.
function initialState() {
  return {
    ...initialPersisted(),
    em: 3, // expense-month index (orig global `em`), needed by monthlySummary
  };
}

// The exact field names that get written to Firestore (map §3).
export const PERSISTED_KEYS = [
  'apiKey',
  'aiHistory',
  'dynAccts',
  'dynSnaps',
  'addedExp',
  'balanceLog',
  'theme',
  'goals',
  'recurring',
  'incomes',
  'bdg',
  'customAccts',
  'rules',
  'forecastMonths',
  'fxRates',
  'aiInsights',
  'lastSeenPatchVersion',
];

/* Build the persisted payload from state, applying the original guards
   (aiHistory capped at last 20; fallbacks identical to persistUser 471-487). */
export function buildPersistPayload(state) {
  return {
    apiKey: state.apiKey || '',
    aiHistory: (state.aiHistory || []).slice(-20),
    dynAccts: state.dynAccts || null,
    dynSnaps: state.dynSnaps || [],
    addedExp: state.addedExp || [],
    balanceLog: state.balanceLog || [],
    theme: state.theme || 'system',
    goals: state.goals || [],
    recurring: state.recurring || [],
    incomes: state.incomes || [],
    bdg: state.bdg || [],
    customAccts: state.customAccts || [],
    rules: state.rules || [],
    forecastMonths: state.forecastMonths || 3,
    fxRates: state.fxRates || { EUR: 1 },
    aiInsights: state.aiInsights || null,
    lastSeenPatchVersion: Number(state.lastSeenPatchVersion) || 0,
  };
}

/* Hydrate state from a loaded Firestore doc with the original type guards
   (orig loadUser 542-558). `d` may be null (no doc) → returns fresh defaults. */
export function hydrateFromDoc(d) {
  const base = initialPersisted();
  if (!d) return base;
  return {
    apiKey: d.apiKey || '',
    aiHistory: Array.isArray(d.aiHistory) ? d.aiHistory : [],
    dynAccts: d.dynAccts || null,
    dynSnaps: Array.isArray(d.dynSnaps) ? d.dynSnaps : [],
    addedExp: Array.isArray(d.addedExp) ? d.addedExp : [],
    balanceLog: Array.isArray(d.balanceLog) ? d.balanceLog : [],
    theme: d.theme || 'system',
    goals: Array.isArray(d.goals) ? d.goals : [],
    recurring: Array.isArray(d.recurring) ? d.recurring : [],
    incomes: Array.isArray(d.incomes) ? d.incomes : [],
    // bdg only replaced if saved array is non-empty (orig 553), else defaults.
    bdg: Array.isArray(d.bdg) && d.bdg.length > 0 ? d.bdg : base.bdg,
    customAccts: Array.isArray(d.customAccts) ? d.customAccts : [],
    rules: Array.isArray(d.rules) ? d.rules : [],
    forecastMonths: Number(d.forecastMonths) || 3,
    // fxRates merged onto {EUR:1} (orig 557).
    fxRates: d.fxRates && typeof d.fxRates === 'object' ? Object.assign({ EUR: 1 }, d.fxRates) : base.fxRates,
    aiInsights: d.aiInsights || null,
    lastSeenPatchVersion: Number(d.lastSeenPatchVersion) || 0,
  };
}

/* ── Reducer ─────────────────────────────────────────────────────────────
   Generic `patch` merges a partial; `hydrate` replaces the whole persisted
   slice; `reset` clears to defaults (used on sign-out). Everything else is a
   thin slice setter expressed via PATCH-style actions. */
function reducer(state, action) {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.partial };
    case 'hydrate':
      return { ...state, ...action.persisted };
    case 'reset':
      return { ...initialState(), em: state.em };
    case 'setField':
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

/* ── Contexts ────────────────────────────────────────────────────────────── */
const StoreContext = createContext(null);
const AuthContext = createContext(null);

/* ════════════════════════════════════════════════════════════════════════
   Provider
   ════════════════════════════════════════════════════════════════════════ */
export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [currentUser, setCurrentUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle|saving|saved|error

  // Refs so timers/effects read fresh values without re-subscribing.
  const saveTimer = useRef(null);
  const idleTimer = useRef(null);
  const userRef = useRef(null);
  const skipNextPersist = useRef(false); // suppress auto-save right after load/reset
  const stateRef = useRef(state);
  stateRef.current = state;
  userRef.current = currentUser;

  /* setSync (orig 455-465): drive chip + auto-return to idle after 2s. */
  const setSync = useCallback((s) => {
    setSyncStatus(s);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (s === 'saved' || s === 'error') {
      idleTimer.current = setTimeout(() => setSyncStatus('idle'), 2000);
    }
  }, []);

  /* persistUser (orig 466-490): debounced 400ms save of the persisted fields.
     No-op when not authed. */
  const persistUser = useCallback(() => {
    const user = userRef.current;
    if (!user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSync('saving');
    saveTimer.current = setTimeout(() => {
      const payload = buildPersistPayload(stateRef.current);
      saveUserDoc(user.uid, payload)
        .then(() => setSync('saved'))
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Firestore save falhou', err);
          setSync('error');
        });
    }, 400);
  }, [setSync]);

  /* loadUser thunk (orig 539-575): getDoc, hydrate with guards, applyTheme.
     On error → reset to defaults + applyTheme. Suppresses the immediate
     auto-save that the resulting state change would otherwise trigger. */
  const loadUser = useCallback(
    (uid) => {
      if (!uid) return Promise.resolve();
      return loadUserDoc(uid)
        .then((d) => {
          const persisted = hydrateFromDoc(d);
          skipNextPersist.current = true;
          dispatch({ type: 'hydrate', persisted });
          applyTheme(persisted.theme);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Firestore load falhou', err);
          const persisted = hydrateFromDoc(null);
          skipNextPersist.current = true;
          dispatch({ type: 'hydrate', persisted });
          applyTheme(persisted.theme);
        });
    },
    []
  );

  /* Reset all persisted state (orig sign-out path 3191-3193). */
  const resetUser = useCallback(() => {
    skipNextPersist.current = true;
    dispatch({ type: 'reset' });
    applyTheme('system');
  }, []);

  /* Auto-persist effect: when any persisted slice changes AND we're authed,
     debounce a save. Skipped once right after load/reset (those are not edits). */
  const persistSignature = useMemo(
    () => PERSISTED_KEYS.map((k) => state[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    PERSISTED_KEYS.map((k) => state[k])
  );
  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (!userRef.current) return;
    persistUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistSignature]);

  /* System theme change listener (orig 318-320). */
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (stateRef.current.theme === 'system') applyTheme('system');
    };
    try {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } catch (x) {
      return undefined;
    }
  }, []);

  /* ── Action creators ──────────────────────────────────────────────────
     Each mutates a slice via dispatch. Because the auto-persist effect runs
     on persisted-slice changes, callers do NOT need to call persistUser()
     manually — but it is exposed for parity / explicit flushes. */
  const actions = useMemo(() => {
    const patch = (partial) => dispatch({ type: 'patch', partial });
    const setField = (key, value) => dispatch({ type: 'setField', key, value });
    const getState = () => stateRef.current;

    return {
      // generic
      patch,
      setField,
      getState,

      // simple scalar/array setters
      setApiKey: (apiKey) => setField('apiKey', apiKey),
      setTheme: (theme) => {
        setField('theme', theme);
        applyTheme(theme); // immediate, like the original setTheme (317)
      },
      setForecastMonths: (n) => setField('forecastMonths', Number(n) || 3),
      setDynAccts: (dynAccts) => setField('dynAccts', dynAccts),
      setDynSnaps: (dynSnaps) => setField('dynSnaps', dynSnaps),
      setFxRates: (fxRates) => setField('fxRates', fxRates),
      setAiInsights: (aiInsights) => setField('aiInsights', aiInsights),
      setLastSeenPatchVersion: (v) => setField('lastSeenPatchVersion', Number(v) || 0),
      setAiHistory: (aiHistory) => setField('aiHistory', aiHistory),
      pushAiHistory: (entry) =>
        setField('aiHistory', [...(getState().aiHistory || []), entry].slice(-20)),

      // expenses (addedExp)
      setAddedExp: (addedExp) => setField('addedExp', addedExp),
      addExpense: (exp) => setField('addedExp', [...(getState().addedExp || []), exp]),
      updateExpense: (idx, exp) =>
        setField(
          'addedExp',
          (getState().addedExp || []).map((x, i) => (i === idx ? { ...x, ...exp } : x))
        ),
      deleteExpense: (idx) =>
        setField('addedExp', (getState().addedExp || []).filter((_, i) => i !== idx)),

      // balance readings (balanceLog) — dated balance snapshots per account.
      setBalanceLog: (balanceLog) => setField('balanceLog', balanceLog),
      addBalanceReading: ({ account, value, date }) => {
        const st = getState();
        const v = Number(value) || 0;
        const acctKey = account.custom ? account.id : account.bank + '_' + account.type;
        const reading = {
          id: uid(),
          acctKey,
          bank: account.bank,
          type: account.type,
          value: v,
          date,
          createdAt: Date.now(),
        };
        setField('balanceLog', [...(st.balanceLog || []), reading]);
        // Update the live balance so compute()/net worth reflect the new value.
        if (account.custom) {
          setField(
            'customAccts',
            (st.customAccts || []).map((a) =>
              a.id === account.id ? { ...a, value: v, updated: (date || '').replace(/-/g, '.') } : a
            )
          );
        } else {
          const dyn = st.dynAccts ? { ...st.dynAccts } : {};
          const prev = dyn[acctKey] || {};
          dyn[acctKey] = { v, d: (date || '').replace(/-/g, '.'), n: prev.n || null };
          setField('dynAccts', dyn);
        }
      },

      // categories (bdg)
      setBdg: (bdg) => setField('bdg', bdg),
      addCategory: (cat) => setField('bdg', [...(getState().bdg || []), cat]),
      updateCategory: (id, cat) =>
        setField('bdg', (getState().bdg || []).map((b) => (b.id === id ? { ...b, ...cat } : b))),
      deleteCategory: (id) => setField('bdg', (getState().bdg || []).filter((b) => b.id !== id)),

      // goals
      setGoals: (goals) => setField('goals', goals),
      addGoal: (goal) => setField('goals', [...(getState().goals || []), goal]),
      updateGoal: (id, goal) =>
        setField('goals', (getState().goals || []).map((g) => (g.id === id ? { ...g, ...goal } : g))),
      deleteGoal: (id) => setField('goals', (getState().goals || []).filter((g) => g.id !== id)),

      // recurring
      setRecurring: (recurring) => setField('recurring', recurring),
      addRecurring: (r) => setField('recurring', [...(getState().recurring || []), r]),
      updateRecurring: (id, r) =>
        setField('recurring', (getState().recurring || []).map((x) => (x.id === id ? { ...x, ...r } : x))),
      deleteRecurring: (id) => setField('recurring', (getState().recurring || []).filter((x) => x.id !== id)),

      // incomes
      setIncomes: (incomes) => setField('incomes', incomes),
      addIncome: (i) => setField('incomes', [...(getState().incomes || []), i]),
      updateIncome: (id, i) =>
        setField('incomes', (getState().incomes || []).map((x) => (x.id === id ? { ...x, ...i } : x))),
      deleteIncome: (id) => setField('incomes', (getState().incomes || []).filter((x) => x.id !== id)),

      // custom accounts
      setCustomAccts: (customAccts) => setField('customAccts', customAccts),
      addCustomAcct: (a) => setField('customAccts', [...(getState().customAccts || []), a]),
      updateCustomAcct: (id, a) =>
        setField('customAccts', (getState().customAccts || []).map((x) => (x.id === id ? { ...x, ...a } : x))),
      deleteCustomAcct: (id) => setField('customAccts', (getState().customAccts || []).filter((x) => x.id !== id)),

      // rules
      setRules: (rules) => setField('rules', rules),
      addRule: (r) => setField('rules', [...(getState().rules || []), r]),
      deleteRule: (id) => setField('rules', (getState().rules || []).filter((x) => x.id !== id)),

      // runtime (NOT persisted) — expense-month index used by monthlySummary
      setEm: (em) => setField('em', em),

      // persistence control
      persistUser,
      loadUser,
      resetUser,
    };
  }, [persistUser, loadUser, resetUser]);

  const storeValue = useMemo(
    () => ({
      state,
      dispatch,
      actions,
      currentUser,
      preview: !currentUser,
      syncStatus,
    }),
    [state, actions, currentUser, syncStatus]
  );

  const authValue = useMemo(
    () => ({ currentUser, setCurrentUser, loadUser, resetUser }),
    [currentUser, loadUser, resetUser]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <StoreContext.Provider value={storeValue}>{children}</StoreContext.Provider>
    </AuthContext.Provider>
  );
}

/* ── Hooks ───────────────────────────────────────────────────────────────── */
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>');
  return ctx;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <StoreProvider>');
  return ctx;
}
