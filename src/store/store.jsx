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
import { groupCatMeta } from '../lib/split.js';

// Tiers do assistente de IA que o utilizador pode escolher (SettingsSheet),
// do mais barato ao mais caro. Espelham os tiers de api/ai.js — mas NÃO os
// importam: api/ (Vercel serverless) e src/ (bundle do cliente) são builds
// separados, e este array é só o whitelist do lado do cliente para validar
// o que fica persistido (ver hydrateFromDoc/buildPersistPayload abaixo). O
// servidor continua a ser a única autoridade sobre que modelo cada tier
// resolve — mudar aqui não muda o que /api/ai aceita.
export const AI_TIERS = ['economico', 'equilibrado', 'avancado'];
const DEFAULT_AI_TIER = 'economico';

// Id reservado do próprio utilizador nos grupos (nunca existe em state.people).
export const ME_ID = 'me';
// Paleta dos avatares das pessoas (tokens do sistema visual).
export const AVATAR_COLORS = ['#3b6fee', '#12b3a6', '#f5a623', '#f25592', '#7b5fe0', '#3fc97a', '#f25555'];

// Cor cíclica seguinte da paleta, dada a lista atual de pessoas. Única fonte
// desta fórmula: addPerson usa-a para gravar, PersonSheet usa-a para
// pré-visualizar antes de gravar — assim as duas nunca podem divergir.
export function nextAvatarColor(people) {
  const n = Array.isArray(people) ? people.length : 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// Garante o invariante memberIds = ['me', ...pessoas]: ME_ID presente exatamente
// uma vez e sempre em primeiro. Nunca confiar no chamador (UI ou dados vindos
// de fora) para manter isto — reforçado aqui, não na UI.
function withMe(ids) {
  const rest = (Array.isArray(ids) ? ids : []).filter((id) => id !== ME_ID);
  return [ME_ID, ...rest];
}

/* Movimento pessoal correspondente à MINHA parte de uma despesa de grupo, ou
   null quando não deve existir. Só a minha parte entra nas Despesas: lançar o
   total pago inflaciona o orçamento do mês com dinheiro que é dos outros. */
export function reflectExpenseFor(group, entry) {
  if (!group || !entry || entry.kind === 'settlement') return null;
  if (!group.reflectMine || entry.reflect === false) return null;
  const mine = (entry.shares || []).find((s) => s.personId === ME_ID);
  const amount = Number(mine && mine.amount) || 0;
  if (amount <= 0) return null;
  return {
    desc: entry.desc || 'Despesa de grupo',
    amount,
    cat: entry.cat || groupCatMeta(entry.gcat).cat,
    date: entry.date,
    groupEntryId: entry.id,
  };
}

// Ensure every addedExp row carries a stable `id` (backfills legacy rows saved
// before ids existed). Used on hydrate and on any whole-array replacement.
export function withExpenseIds(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => (x && x.id ? x : { ...x, id: uid() }));
}

/* Uma despesa pessoal ligada a uma entry de grupo (`groupEntryId`) pode sair
   de addedExp por duas vias: apagada a solo (deleteExpense) ou arrastada numa
   substituição em bloco (setAddedExp — limpar duplicadas, apagar o mês,
   reaplicar regras, importações). Nos dois casos a group entry ficava com
   linkedExpId a apontar para um id morto, e editá-la mais tarde falhava a
   repor o movimento em silêncio (ver updateGroupEntry). Devolve as
   groupEntries com linkedExpId limpo para quem perdeu o movimento ligado, ou
   null quando nada muda (evita um setField a mais). */
function orphanedGroupEntries(groupEntries, removedExps) {
  const ids = new Set((removedExps || []).filter((x) => x && x.groupEntryId).map((x) => x.groupEntryId));
  if (!ids.size) return null;
  return (groupEntries || []).map((e) => (ids.has(e.id) ? { ...e, linkedExpId: null } : e));
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
    aiTier: DEFAULT_AI_TIER, // tier do assistente escolhido pelo utilizador — ver AI_TIERS
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
  'aiTier',
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
    // Guardado (não só `|| default`): um estado com um tier inválido nunca
    // deve chegar a escrever lixo no Firestore — só o whitelist AI_TIERS.
    aiTier: AI_TIERS.includes(state.aiTier) ? state.aiTier : DEFAULT_AI_TIER,
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
    // Guardado contra o whitelist: um tier desconhecido no doc (lixo, campo
    // corrompido, ou o alias 'fast'/'strong' do SERVIDOR — que nunca é um
    // tier válido do lado do cliente) cai no default em vez de seguir tal e
    // qual até ao corpo do pedido a /api/ai.
    aiTier: AI_TIERS.includes(d.aiTier) ? d.aiTier : DEFAULT_AI_TIER,
  };
}

/* ── Reducer ─────────────────────────────────────────────────────────────
   Generic `patch` merges a partial; `hydrate` replaces the whole persisted
   slice; `reset` clears to defaults (used on sign-out). Everything else is a
   thin slice setter expressed via PATCH-style actions.

   `setField` aceita DOIS formatos de valor:
     setField('addedExp', arrayNovo)          // valor literal (como sempre)
     setField('addedExp', (prev) => [...])    // atualizador funcional

   O atualizador funcional existe porque getState() devolve stateRef.current, e
   esse ref só é reatribuído no render seguinte: duas escritas na MESMA slice
   dentro do mesmo tick (ex.: o assistente a registar duas despesas de uma vez,
   ou dois cliques rápidos) liam ambas o mesmo "antes" e a segunda apagava a
   primeira. Com a função, a transformação corre DENTRO do reducer, sobre o
   valor mais recente da slice, e os dois dispatches somam-se.

   O atualizador tem de ser PURO (o React em StrictMode invoca o reducer duas
   vezes): nunca gerar ids nem Date.now() lá dentro — gerar antes e fechar
   sobre o valor. */
function reducer(state, action) {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.partial };
    case 'hydrate':
      return { ...state, ...action.persisted };
    case 'reset':
      return { ...initialState(), em: state.em };
    case 'setField': {
      const next = typeof action.value === 'function' ? action.value(state[action.key]) : action.value;
      return { ...state, [action.key]: next };
    }
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
     manually — but it is exposed for parity / explicit flushes.

     patch/setField adiantam também o stateRef ("fast-forward"): sem isso,
     getState() só via a escrita depois de o React fazer commit, e QUALQUER
     leitura feita no mesmo tick (outra action a seguir, uma tool de leitura do
     assistente logo a seguir a uma de escrita) via o estado antigo. É essa
     leitura antiga que fazia "cria o grupo Férias e lança lá o jantar"
     responder not_found para o grupo acabado de criar.

     O dispatch continua a levar o VALOR ORIGINAL (função incluída): a verdade
     é sempre o que o reducer calcula sobre o estado real do React; o stateRef
     é só um adiantamento, e o render seguinte reescreve-o com o valor
     oficial (stateRef.current = state). Como o reducer e o adiantamento
     aplicam a mesma função pura pela mesma ordem, convergem. */
  const actions = useMemo(() => {
    const patch = (partial) => {
      stateRef.current = { ...stateRef.current, ...partial };
      dispatch({ type: 'patch', partial });
    };
    const setField = (key, value) => {
      stateRef.current = {
        ...stateRef.current,
        [key]: typeof value === 'function' ? value(stateRef.current[key]) : value,
      };
      dispatch({ type: 'setField', key, value });
    };
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
      // Tier do assistente de IA — guardado contra AI_TIERS, tal como a
      // leitura do Firestore (hydrateFromDoc): um valor fora do whitelist
      // nunca fica gravado no estado, mesmo que um chamador passe lixo.
      setAiTier: (t) => setField('aiTier', AI_TIERS.includes(t) ? t : DEFAULT_AI_TIER),
      // posições de investimento
      addPosition: (p) => setField('positions', (prev) => [...(prev || []), p]),
      updatePosition: (id, p) =>
        setField('positions', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...p } : x))),
      deletePosition: (id) => setField('positions', (prev) => (prev || []).filter((x) => x.id !== id)),
      // transferências entre contas
      addTransfer: (t) => setField('transfers', (prev) => [...(prev || []), t]),
      deleteTransfer: (id) => setField('transfers', (prev) => (prev || []).filter((x) => x.id !== id)),
      dismissSub: (key) => setField('dismissedSubs', (prev) => [...(prev || []), key]),
      setAiHistory: (aiHistory) => setField('aiHistory', aiHistory),
      pushAiHistory: (entry) => setField('aiHistory', (prev) => [...(prev || []), entry].slice(-20)),

      // expenses (addedExp) — mutated by STABLE id, never array index, so that
      // edits/deletes survive list reordering (clean-imported, remove-month) and
      // background re-hydrates. setAddedExp backfills ids defensively.
      setAddedExp: (addedExp) => {
        const st = getState();
        const next = withExpenseIds(addedExp);
        const nextIds = new Set(next.map((x) => x.id));
        // Bulk replaces (dedupe, apagar o mês, reaplicar regras, importações)
        // podem descartar linhas ligadas a um grupo — reconciliar aqui, não em
        // cada chamador.
        const removed = (st.addedExp || []).filter((x) => !nextIds.has(x.id));
        setField('addedExp', next);
        const reconciled = orphanedGroupEntries(st.groupEntries, removed);
        if (reconciled) setField('groupEntries', reconciled);
      },
      addExpense: (exp) => {
        // id gerado FORA do atualizador: o reducer tem de ser puro.
        const row = exp.id ? exp : { ...exp, id: uid() };
        setField('addedExp', (prev) => [...(prev || []), row]);
      },
      updateExpense: (id, exp) =>
        setField('addedExp', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...exp } : x))),
      deleteExpense: (id) => {
        const st = getState();
        const removed = (st.addedExp || []).find((x) => x.id === id);
        setField('addedExp', (prev) => (prev || []).filter((x) => x.id !== id));
        // Só reconcilia quando a linha apagada estava mesmo ligada a um grupo —
        // orphanedGroupEntries devolveria null nos restantes casos.
        if (removed && removed.groupEntryId) {
          setField('groupEntries', (prev) => orphanedGroupEntries(prev, [removed]) || prev);
        }
      },
      // Classify by id, applying the chosen category to every same-beneficiary
      // row (resolves the index fresh against current state — no stale closure).
      classifyExpense: (id, cat) =>
        setField('addedExp', (prev) => {
          const list = prev || [];
          const idx = list.findIndex((x) => x.id === id);
          return idx < 0 ? list : applySameBeneficiaryCategory(list, idx, cat, 'cat');
        }),

      // ── Grupos: pessoas ──────────────────────────────────────────────
      addPerson: (p) => {
        // id gerado nunca é anulado por um id vindo do chamador (mesma regra
        // de addExpense): mantém o id se vier definido, senão gera um novo.
        // uid()/Date.now() ficam FORA do atualizador (reducer puro); só a cor
        // cíclica depende da lista, e nextAvatarColor é pura.
        const withId = p.id ? p : { ...p, id: uid() };
        const createdAt = Date.now();
        setField('people', (prev) => {
          const list = prev || [];
          return [...list, { createdAt, ...withId, color: p.color || nextAvatarColor(list) }];
        });
      },
      updatePerson: (id, partial) =>
        setField('people', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...partial } : x))),
      deletePerson: (id) => {
        const st = getState();
        const used = (st.groups || []).some((g) => (g.memberIds || []).includes(id));
        if (used) return false; // a UI bloqueia antes; isto é a rede de segurança
        setField('people', (prev) => (prev || []).filter((x) => x.id !== id));
        return true;
      },

      // ── Grupos ───────────────────────────────────────────────────────
      addGroup: (g) => {
        const row = {
          emoji: '👥',
          type: 'trip',
          currency: 'EUR',
          start: null,
          end: null,
          reflectMine: true,
          archived: false,
          createdAt: Date.now(),
          ...g,
          // id gerado nunca é anulado pelo spread (mesma regra de addExpense);
          // memberIds sempre inclui ME_ID uma única vez, em primeiro (spec).
          id: g.id || uid(),
          memberIds: withMe(g.memberIds),
        };
        setField('groups', (prev) => [...(prev || []), row]);
      },
      updateGroup: (id, partial) =>
        setField('groups', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...partial } : x))),
      archiveGroup: (id, archived = true) =>
        setField('groups', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, archived } : x))),
      deleteGroup: (id) => {
        const st = getState();
        const linked = new Set((st.groupEntries || []).filter((e) => e.groupId === id).map((e) => e.linkedExpId).filter(Boolean));
        setField('groups', (prev) => (prev || []).filter((x) => x.id !== id));
        setField('groupEntries', (prev) => (prev || []).filter((e) => e.groupId !== id));
        if (linked.size) {
          setField('addedExp', (prev) => (prev || []).filter((x) => !linked.has(x.id)));
        }
      },

      // ── Grupos: movimentos (despesas e acertos) ──────────────────────
      addGroupEntry: (entry) => {
        const st = getState();
        const id = entry.id || uid();
        const full = { createdAt: Date.now(), ...entry, id };
        const group = (st.groups || []).find((g) => g.id === full.groupId);
        const mov = reflectExpenseFor(group, full);
        if (mov) {
          const expId = uid();
          full.linkedExpId = expId;
          setField('addedExp', (prev) => [...(prev || []), { id: expId, ...mov }]);
        } else {
          full.linkedExpId = null;
        }
        setField('groupEntries', (prev) => [...(prev || []), full]);
        return id;
      },
      updateGroupEntry: (id, partial) => {
        const st = getState();
        const prev = (st.groupEntries || []).find((e) => e.id === id);
        if (!prev) return;
        const next = { ...prev, ...partial };
        const group = (st.groups || []).find((g) => g.id === next.groupId);
        const mov = reflectExpenseFor(group, next);
        let exps = st.addedExp || [];
        // O alvo de linkedExpId pode ter desaparecido de addedExp sem passar
        // por deleteExpense/setAddedExp (ex.: commit() em firebase/data.js
        // grava upserts e deletes em lotes separados — uma falha a meio pode
        // persistir um movimento apagado com linkedExpId ainda a apontar para
        // ele). Sem esta verificação o map() abaixo era um no-op silencioso:
        // nenhum movimento novo, nenhum aviso — o reflexo perdia-se de vez.
        const linkedExists = next.linkedExpId && exps.some((x) => x.id === next.linkedExpId);
        if (mov && linkedExists) {
          exps = exps.map((x) => (x.id === next.linkedExpId ? { ...x, ...mov } : x));
        } else if (mov) {
          const expId = uid();
          next.linkedExpId = expId;
          exps = [...exps, { id: expId, ...mov }];
        } else if (next.linkedExpId) {
          exps = exps.filter((x) => x.id !== next.linkedExpId);
          next.linkedExpId = null;
        }
        setField('addedExp', exps);
        setField('groupEntries', (st.groupEntries || []).map((e) => (e.id === id ? next : e)));
      },
      deleteGroupEntry: (id) => {
        const st = getState();
        const entry = (st.groupEntries || []).find((e) => e.id === id);
        setField('groupEntries', (prev) => (prev || []).filter((e) => e.id !== id));
        if (entry && entry.linkedExpId) {
          setField('addedExp', (prev) => (prev || []).filter((x) => x.id !== entry.linkedExpId));
        }
      },
      /* Ligar/desligar o reflexo de um grupo inteiro: cria ou apaga os
         movimentos pessoais das despesas existentes de uma vez. */
      setGroupReflect: (groupId, on) => {
        const st = getState();
        const group = { ...((st.groups || []).find((g) => g.id === groupId) || {}), reflectMine: on };
        let exps = st.addedExp || [];
        const entries = (st.groupEntries || []).map((e) => {
          if (e.groupId !== groupId || e.kind === 'settlement') return e;
          const mov = reflectExpenseFor(group, e);
          if (mov && !e.linkedExpId) {
            const expId = uid();
            exps = [...exps, { id: expId, ...mov }];
            return { ...e, linkedExpId: expId };
          }
          if (!mov && e.linkedExpId) {
            exps = exps.filter((x) => x.id !== e.linkedExpId);
            return { ...e, linkedExpId: null };
          }
          return e;
        });
        setField('groups', (st.groups || []).map((g) => (g.id === groupId ? { ...g, reflectMine: on } : g)));
        setField('groupEntries', entries);
        setField('addedExp', exps);
      },

      // balance readings (balanceLog) — dated balance snapshots per account.
      setBalanceLog: (balanceLog) => setField('balanceLog', balanceLog),
      /* `note` é OPCIONAL e aditivo: sem ele (o caminho manual,
         BalanceUpdateSheet) a nota anterior da conta mantém-se, exactamente
         como antes. Com ele (update_balance do assistente) a nota nova
         substitui a anterior. O resto desta action continua a ler getState()
         uma vez: o snapshot patrimonial precisa do estado COMBINADO (saldos
         novos + o resto), coisa que um atualizador por slice não vê. */
      addBalanceReading: ({ account, value, date, note }) => {
        const st = getState();
        const v = Number(value) || 0;
        const hasNote = note != null && note !== '';
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
        setField('balanceLog', (prev) => [...(prev || []), reading]);
        // Update the live balance so compute()/net worth reflect the new value.
        const dDot = (date || '').replace(/-/g, '.');
        let nextDyn = st.dynAccts ? { ...st.dynAccts } : {};
        let nextCustom = st.customAccts || [];
        if (account.custom) {
          nextCustom = (st.customAccts || []).map((a) =>
            a.id === account.id ? { ...a, value: v, updated: dDot, ...(hasNote ? { note } : {}) } : a
          );
          setField('customAccts', nextCustom);
        } else {
          const prev = nextDyn[acctKey] || {};
          nextDyn[acctKey] = { v, d: dDot, n: hasNote ? note : prev.n || null };
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
      addCategory: (cat) => setField('bdg', (prev) => [...(prev || []), cat]),
      updateCategory: (id, cat) =>
        setField('bdg', (prev) => (prev || []).map((b) => (b.id === id ? { ...b, ...cat } : b))),
      deleteCategory: (id) => setField('bdg', (prev) => (prev || []).filter((b) => b.id !== id)),

      // goals
      setGoals: (goals) => setField('goals', goals),
      addGoal: (goal) => setField('goals', (prev) => [...(prev || []), goal]),
      updateGoal: (id, goal) =>
        setField('goals', (prev) => (prev || []).map((g) => (g.id === id ? { ...g, ...goal } : g))),
      deleteGoal: (id) => setField('goals', (prev) => (prev || []).filter((g) => g.id !== id)),

      // recurring
      setRecurring: (recurring) => setField('recurring', recurring),
      addRecurring: (r) => setField('recurring', (prev) => [...(prev || []), r]),
      updateRecurring: (id, r) =>
        setField('recurring', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...r } : x))),
      deleteRecurring: (id) => setField('recurring', (prev) => (prev || []).filter((x) => x.id !== id)),

      // incomes
      setIncomes: (incomes) => setField('incomes', incomes),
      addIncome: (i) => setField('incomes', (prev) => [...(prev || []), i]),
      updateIncome: (id, i) =>
        setField('incomes', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...i } : x))),
      deleteIncome: (id) => setField('incomes', (prev) => (prev || []).filter((x) => x.id !== id)),

      // custom accounts
      setCustomAccts: (customAccts) => setField('customAccts', customAccts),
      addCustomAcct: (a) => setField('customAccts', (prev) => [...(prev || []), a]),
      updateCustomAcct: (id, a) =>
        setField('customAccts', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...a } : x))),
      // Delete a custom account AND purge its balance readings (acctKey === id).
      deleteCustomAcct: (id) => {
        setField('customAccts', (prev) => (prev || []).filter((x) => x.id !== id));
        setField('balanceLog', (prev) => (prev || []).filter((r) => r.acctKey !== id));
      },
      // Settle all manual, unsettled transactions allocated to an account label
      // ("banco · tipo"). Called when the user sets a fresh balance (edit/reading)
      // so those expenses/incomes stop re-adjusting the new base going forward.
      settleAccount: (label) => {
        const ln = normAcct(label);
        // Cada slice devolve o MESMO array quando não há nada a saldar — o
        // reducer guarda a referência tal e qual, por isso não há re-persist
        // nem re-render por uma slice intocada (era o que o `if (some(...))`
        // de fora garantia antes).
        setField('addedExp', (prev) => {
          const exp = prev || [];
          const hit = (x) => !x.imported && !x.settled && normAcct(x.acct) === ln;
          return exp.some(hit) ? exp.map((x) => (hit(x) ? { ...x, settled: true } : x)) : exp;
        });
        setField('incomes', (prev) => {
          const inc = prev || [];
          const hit = (i) => !i.imported && !i.settled && i.recurring === false && normAcct(i.acct) === ln;
          return inc.some(hit) ? inc.map((i) => (hit(i) ? { ...i, settled: true } : i)) : inc;
        });
        // Saldar o lado da transferência que toca nesta conta (per-side).
        setField('transfers', (prev) => {
          const trs = prev || [];
          const hit = (t) => (!t.settledFrom && normAcct(t.from) === ln) || (!t.settledTo && normAcct(t.to) === ln);
          if (!trs.some(hit)) return trs;
          return trs.map((t) => {
            let n = t;
            if (!t.settledFrom && normAcct(t.from) === ln) n = { ...n, settledFrom: true };
            if (!t.settledTo && normAcct(t.to) === ln) n = { ...n, settledTo: true };
            return n;
          });
        });
      },
      // Remove a TEMPLATE account that was activated via a balance reading: drop
      // its dynAccts override AND its balance readings (acctKey === "bank_type").
      removeDynAcct: (key) => {
        setField('dynAccts', (prev) => {
          const dyn = prev ? { ...prev } : {};
          delete dyn[key];
          return dyn;
        });
        setField('balanceLog', (prev) => (prev || []).filter((r) => r.acctKey !== key));
      },

      // rules
      setRules: (rules) => setField('rules', rules),
      addRule: (r) => setField('rules', (prev) => [...(prev || []), r]),
      updateRule: (id, r) => setField('rules', (prev) => (prev || []).map((x) => (x.id === id ? { ...x, ...r, id } : x))),
      deleteRule: (id) => setField('rules', (prev) => (prev || []).filter((x) => x.id !== id)),

      // runtime (NOT persisted) — expense-month index used by monthlySummary
      setEm: (em) => setField('em', em),
      // Desliza a janela de meses (mOff ≤ 0). Ao mudar de janela o mês
      // selecionado passa a ser o último da nova janela (em=3).
      setTaxCfg: (taxCfg) => setField('taxCfg', taxCfg),
      dismissAnomaly: (id) =>
        setField('dismissedAnomalies', (prev) => {
          const cur = prev || [];
          return cur.indexOf(id) > -1 ? cur : [...cur, id];
        }),
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
