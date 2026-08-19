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
import { loadUserData, syncUserData } from '../firebase/data.js';
import { bdgDefault, snapshotFromState, normAcct } from '../lib/finance.js';
import { uid } from '../lib/format.js';
import { applySameBeneficiaryCategory } from '../lib/dedupe.js';

// Id reservado do próprio utilizador nos grupos (nunca existe em state.people).
export const ME_ID = 'me';
// Paleta dos avatares das pessoas (tokens do sistema visual).
export const AVATAR_COLORS = ['#3b6fee', '#12b3a6', '#f5a623', '#f25592', '#7b5fe0', '#3fc97a', '#f25555'];

// Ensure every addedExp row carries a stable `id` (backfills legacy rows saved
// before ids existed). Used on hydrate and on any whole-array replacement.
export function withExpenseIds(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => (x && x.id ? x : { ...x, id: uid() }));
}

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

/* Junta ao bdg do utilizador as categorias default cujo id ainda não existe
   (para propagar categorias novas como "Compras" a quem já tinha dados). Mantém
   as do utilizador (nomes/limites que personalizou) e anexa as em falta. */
export function mergeMissingCats(userBdg, defaults) {
  const have = new Set((userBdg || []).map((b) => b.id));
  const missing = (defaults || []).filter((b) => !have.has(b.id));
  return missing.length ? [...userBdg, ...missing.map((b) => ({ id: b.id, nm: b.nm, lm: b.lm }))] : userBdg;
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
    dismissedSubs: [],
    pinHash: null, // SHA-256 do PIN de 4 dígitos (proteção dos saldos), ou null
    faceIdCred: null, // id (base64) da credencial WebAuthn (FaceID), ou null
    balancesHidden: false, // saldos ocultos? (default visível)
    housing: null, // crédito à habitação atual { valorAquisicao, valorEmprestimo, ... }
    rolloverOn: false, // orçamento: sobra/falta transita para o mês seguinte
    positions: [], // posições de investimento { id, broker, asset, qty, avgPrice, currentPrice }
    transfers: [], // transferências entre contas { id, from, to, amount, date, note, settledFrom, settledTo }
    taxCfg: null, // config fiscal PT { imiAmount, iucMonths:[], irs, couple } ou null
    dismissedAnomalies: [], // ids de avisos de despesa suspeita já confirmados pelo utilizador
    people: [], // contactos locais para grupos { id, name, color, createdAt }
    groups: [], // grupos de despesas partilhadas { id, name, emoji, type, currency, memberIds, start, end, reflectMine, archived, createdAt }
    groupEntries: [], // despesas e acertos dos grupos (ver lib/split.js)
  };
}

// Full initial reducer state = persisted slice + runtime fields.
function initialState() {
  return {
    ...initialPersisted(),
    em: 3, // expense-month index (orig global `em`), needed by monthlySummary
    mOff: 0, // deslocamento da janela de 4 meses (0 = acaba no mês atual; ver lib/months.js)
  };
}

// The exact field names that get written to Firestore (map §3).
export const PERSISTED_KEYS = [
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
  'dismissedSubs',
  'pinHash',
  'faceIdCred',
  'balancesHidden',
  'housing',
  'rolloverOn',
  'positions',
  'transfers',
  'taxCfg',
  'dismissedAnomalies',
  'people',
  'groups',
  'groupEntries',
];

/* Build the persisted payload from state, applying the original guards
   (aiHistory capped at last 20; fallbacks identical to persistUser 471-487). */
export function buildPersistPayload(state) {
  return {
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
    dismissedSubs: state.dismissedSubs || [],
    pinHash: state.pinHash || null,
    faceIdCred: state.faceIdCred || null,
    balancesHidden: !!state.balancesHidden,
    housing: state.housing || null,
    rolloverOn: !!state.rolloverOn,
    positions: state.positions || [],
    transfers: state.transfers || [],
    taxCfg: state.taxCfg || null,
    dismissedAnomalies: state.dismissedAnomalies || [],
    people: state.people || [],
    groups: state.groups || [],
    groupEntries: state.groupEntries || [],
  };
}

/* Hydrate state from a loaded Firestore doc with the original type guards
   (orig loadUser 542-558). `d` may be null (no doc) → returns fresh defaults. */
export function hydrateFromDoc(d) {
  const base = initialPersisted();
  if (!d) return base;
  return {
    apiKey: '', // nunca mais se lê/guarda a key do utilizador (proxy no servidor)
    aiHistory: Array.isArray(d.aiHistory) ? d.aiHistory : [],
    dynAccts: d.dynAccts || null,
    dynSnaps: Array.isArray(d.dynSnaps) ? d.dynSnaps : [],
    addedExp: withExpenseIds(Array.isArray(d.addedExp) ? d.addedExp : []),
    balanceLog: Array.isArray(d.balanceLog) ? d.balanceLog : [],
    theme: d.theme || 'system',
    goals: Array.isArray(d.goals) ? d.goals : [],
    recurring: Array.isArray(d.recurring) ? d.recurring : [],
    incomes: Array.isArray(d.incomes) ? d.incomes : [],
    // bdg: usa o do utilizador, mas GARANTE que categorias default novas
    // (ex.: "Compras") aparecem — anexa as que faltam por id. Vazio → defaults.
    bdg: Array.isArray(d.bdg) && d.bdg.length > 0 ? mergeMissingCats(d.bdg, base.bdg) : base.bdg,
    customAccts: Array.isArray(d.customAccts) ? d.customAccts : [],
    rules: Array.isArray(d.rules) ? d.rules : [],
    forecastMonths: Number(d.forecastMonths) || 3,
    // fxRates merged onto {EUR:1} (orig 557).
    fxRates: d.fxRates && typeof d.fxRates === 'object' ? Object.assign({ EUR: 1 }, d.fxRates) : base.fxRates,
    aiInsights: d.aiInsights || null,
    lastSeenPatchVersion: Number(d.lastSeenPatchVersion) || 0,
    dismissedSubs: Array.isArray(d.dismissedSubs) ? d.dismissedSubs : [],
    pinHash: typeof d.pinHash === 'string' ? d.pinHash : null,
    faceIdCred: typeof d.faceIdCred === 'string' ? d.faceIdCred : null,
    balancesHidden: !!d.balancesHidden,
    housing: d.housing && typeof d.housing === 'object' ? d.housing : null,
    rolloverOn: !!d.rolloverOn,
    positions: Array.isArray(d.positions) ? d.positions : [],
    transfers: Array.isArray(d.transfers) ? d.transfers : [],
    taxCfg: d.taxCfg && typeof d.taxCfg === 'object' ? d.taxCfg : null,
    dismissedAnomalies: Array.isArray(d.dismissedAnomalies) ? d.dismissedAnomalies : [],
    people: Array.isArray(d.people) ? d.people : [],
    groups: Array.isArray(d.groups) ? d.groups : [],
    groupEntries: Array.isArray(d.groupEntries) ? d.groupEntries : [],
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
  const lastSynced = useRef(null); // último payload sincronizado (diff das subcoleções)
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
      // Diff contra o último estado sincronizado → escreve só o que mudou nas
      // subcoleções (e apaga o removido). prev=null no 1.º save escreve tudo.
      syncUserData(user.uid, payload, lastSynced.current)
        .then(() => {
          lastSynced.current = payload;
          setSync('saved');
        })
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
      return loadUserData(uid)
        .then((d) => {
          const persisted = hydrateFromDoc(d);
          // Base do diff: se já havia doc, o que ficou nas subcoleções == persisted;
          // se é novo (d==null), prev=null → primeiro save escreve tudo.
          lastSynced.current = d ? buildPersistPayload(persisted) : null;
          skipNextPersist.current = true;
          dispatch({ type: 'hydrate', persisted });
          applyTheme(persisted.theme);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Firestore load falhou', err);
          const persisted = hydrateFromDoc(null);
          lastSynced.current = null;
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
    lastSynced.current = null;
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
      // Balance lock (saldos protegidos por PIN/FaceID)
      setPinHash: (h) => setField('pinHash', h || null),
      setFaceIdCred: (c) => setField('faceIdCred', c || null),
      setBalancesHidden: (b) => setField('balancesHidden', !!b),
      setHousing: (h) => setField('housing', h || null),
      setRolloverOn: (b) => setField('rolloverOn', !!b),
      // posições de investimento
      addPosition: (p) => setField('positions', [...(getState().positions || []), p]),
      updatePosition: (id, p) =>
        setField('positions', (getState().positions || []).map((x) => (x.id === id ? { ...x, ...p } : x))),
      deletePosition: (id) => setField('positions', (getState().positions || []).filter((x) => x.id !== id)),
      // transferências entre contas
      addTransfer: (t) => setField('transfers', [...(getState().transfers || []), t]),
      deleteTransfer: (id) => setField('transfers', (getState().transfers || []).filter((x) => x.id !== id)),
      dismissSub: (key) => setField('dismissedSubs', [...(getState().dismissedSubs || []), key]),
      setAiHistory: (aiHistory) => setField('aiHistory', aiHistory),
      pushAiHistory: (entry) =>
        setField('aiHistory', [...(getState().aiHistory || []), entry].slice(-20)),

      // expenses (addedExp) — mutated by STABLE id, never array index, so that
      // edits/deletes survive list reordering (clean-imported, remove-month) and
      // background re-hydrates. setAddedExp backfills ids defensively.
      setAddedExp: (addedExp) => setField('addedExp', withExpenseIds(addedExp)),
      addExpense: (exp) =>
        setField('addedExp', [...(getState().addedExp || []), exp.id ? exp : { ...exp, id: uid() }]),
      updateExpense: (id, exp) =>
        setField(
          'addedExp',
          (getState().addedExp || []).map((x) => (x.id === id ? { ...x, ...exp } : x))
        ),
      deleteExpense: (id) =>
        setField('addedExp', (getState().addedExp || []).filter((x) => x.id !== id)),
      // Classify by id, applying the chosen category to every same-beneficiary
      // row (resolves the index fresh against current state — no stale closure).
      classifyExpense: (id, cat) => {
        const list = getState().addedExp || [];
        const idx = list.findIndex((x) => x.id === id);
        if (idx < 0) return;
        setField('addedExp', applySameBeneficiaryCategory(list, idx, cat, 'cat'));
      },

      // ── Grupos: pessoas ──────────────────────────────────────────────
      addPerson: (p) => {
        const list = getState().people || [];
        const color = p.color || AVATAR_COLORS[list.length % AVATAR_COLORS.length];
        setField('people', [...list, { id: uid(), createdAt: Date.now(), ...p, color }]);
      },
      updatePerson: (id, partial) =>
        setField('people', (getState().people || []).map((x) => (x.id === id ? { ...x, ...partial } : x))),
      deletePerson: (id) => {
        const st = getState();
        const used = (st.groups || []).some((g) => (g.memberIds || []).includes(id));
        if (used) return false; // a UI bloqueia antes; isto é a rede de segurança
        setField('people', (st.people || []).filter((x) => x.id !== id));
        return true;
      },

      // ── Grupos ───────────────────────────────────────────────────────
      addGroup: (g) =>
        setField('groups', [
          ...(getState().groups || []),
          {
            id: uid(),
            emoji: '👥',
            type: 'trip',
            currency: 'EUR',
            memberIds: [ME_ID],
            start: null,
            end: null,
            reflectMine: true,
            archived: false,
            createdAt: Date.now(),
            ...g,
          },
        ]),
      updateGroup: (id, partial) =>
        setField('groups', (getState().groups || []).map((x) => (x.id === id ? { ...x, ...partial } : x))),
      archiveGroup: (id, archived = true) =>
        setField('groups', (getState().groups || []).map((x) => (x.id === id ? { ...x, archived } : x))),
      deleteGroup: (id) => {
        const st = getState();
        const linked = (st.groupEntries || []).filter((e) => e.groupId === id).map((e) => e.linkedExpId).filter(Boolean);
        setField('groups', (st.groups || []).filter((x) => x.id !== id));
        setField('groupEntries', (st.groupEntries || []).filter((e) => e.groupId !== id));
        if (linked.length) {
          setField('addedExp', (st.addedExp || []).filter((x) => !linked.includes(x.id)));
        }
      },

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
        const dDot = (date || '').replace(/-/g, '.');
        let nextDyn = st.dynAccts ? { ...st.dynAccts } : {};
        let nextCustom = st.customAccts || [];
        if (account.custom) {
          nextCustom = (st.customAccts || []).map((a) =>
            a.id === account.id ? { ...a, value: v, updated: dDot } : a
          );
          setField('customAccts', nextCustom);
        } else {
          const prev = nextDyn[acctKey] || {};
          nextDyn[acctKey] = { v, d: dDot, n: prev.n || null };
          setField('dynAccts', nextDyn);
        }
        // Upsert a patrimonial snapshot for this date so the evolution charts
        // populate over time (one snapshot per date label, latest values win).
        const nextState = { ...st, currentUser: true, dynAccts: nextDyn, customAccts: nextCustom };
        const label = date && date.length >= 10 ? date.slice(8, 10) + '.' + date.slice(5, 7) : dDot;
        const snap = snapshotFromState(nextState, label);
        const snaps = [...(st.dynSnaps || [])];
        const li = snaps.findIndex((x) => x.l === snap.l);
        if (li > -1) snaps[li] = snap;
        else snaps.push(snap);
        setField('dynSnaps', snaps);
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
      // Delete a custom account AND purge its balance readings (acctKey === id).
      deleteCustomAcct: (id) => {
        const st = getState();
        setField('customAccts', (st.customAccts || []).filter((x) => x.id !== id));
        setField('balanceLog', (st.balanceLog || []).filter((r) => r.acctKey !== id));
      },
      // Settle all manual, unsettled transactions allocated to an account label
      // ("banco · tipo"). Called when the user sets a fresh balance (edit/reading)
      // so those expenses/incomes stop re-adjusting the new base going forward.
      settleAccount: (label) => {
        const st = getState();
        const ln = normAcct(label);
        const exp = st.addedExp || [];
        if (exp.some((x) => !x.imported && !x.settled && normAcct(x.acct) === ln)) {
          setField(
            'addedExp',
            exp.map((x) => (!x.imported && !x.settled && normAcct(x.acct) === ln ? { ...x, settled: true } : x))
          );
        }
        const inc = st.incomes || [];
        if (inc.some((i) => !i.imported && !i.settled && i.recurring === false && normAcct(i.acct) === ln)) {
          setField(
            'incomes',
            inc.map((i) =>
              !i.imported && !i.settled && i.recurring === false && normAcct(i.acct) === ln ? { ...i, settled: true } : i
            )
          );
        }
        // Saldar o lado da transferência que toca nesta conta (per-side).
        const trs = st.transfers || [];
        if (trs.some((t) => (!t.settledFrom && normAcct(t.from) === ln) || (!t.settledTo && normAcct(t.to) === ln))) {
          setField(
            'transfers',
            trs.map((t) => {
              let n = t;
              if (!t.settledFrom && normAcct(t.from) === ln) n = { ...n, settledFrom: true };
              if (!t.settledTo && normAcct(t.to) === ln) n = { ...n, settledTo: true };
              return n;
            })
          );
        }
      },
      // Remove a TEMPLATE account that was activated via a balance reading: drop
      // its dynAccts override AND its balance readings (acctKey === "bank_type").
      removeDynAcct: (key) => {
        const st = getState();
        const dyn = st.dynAccts ? { ...st.dynAccts } : {};
        delete dyn[key];
        setField('dynAccts', dyn);
        setField('balanceLog', (st.balanceLog || []).filter((r) => r.acctKey !== key));
      },

      // rules
      setRules: (rules) => setField('rules', rules),
      addRule: (r) => setField('rules', [...(getState().rules || []), r]),
      updateRule: (id, r) => setField('rules', (getState().rules || []).map((x) => (x.id === id ? { ...x, ...r, id } : x))),
      deleteRule: (id) => setField('rules', (getState().rules || []).filter((x) => x.id !== id)),

      // runtime (NOT persisted) — expense-month index used by monthlySummary
      setEm: (em) => setField('em', em),
      // Desliza a janela de meses (mOff ≤ 0). Ao mudar de janela o mês
      // selecionado passa a ser o último da nova janela (em=3).
      setTaxCfg: (taxCfg) => setField('taxCfg', taxCfg),
      dismissAnomaly: (id) => {
        const cur = getState().dismissedAnomalies || [];
        if (cur.indexOf(id) > -1) return;
        setField('dismissedAnomalies', [...cur, id]);
      },
      /* Reforça de uma vez todas as metas com reserva mensal definida:
         current += min(monthly, o que falta) e marca lastAlloc com o mês, para
         não reforçar duas vezes no mesmo mês. Devolve o total alocado. */
      allocateGoals: (monthKey) => {
        const goals = getState().goals || [];
        let total = 0;
        const next = goals.map((g) => {
          const monthly = Number(g.monthly) || 0;
          const target = Number(g.target) || 0;
          const current = Number(g.current) || 0;
          if (monthly <= 0 || current >= target || g.lastAlloc === monthKey) return g;
          const add = Math.min(monthly, target - current);
          total += add;
          return { ...g, current: current + add, lastAlloc: monthKey };
        });
        if (total > 0) setField('goals', next);
        return total;
      },
      setMOff: (mOff) => {
        setField('mOff', Number(mOff) || 0);
        setField('em', 3);
      },

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
