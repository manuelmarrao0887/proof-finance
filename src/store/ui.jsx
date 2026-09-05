// UI context — transient navigation + modal state shared across views/modals.
// Replaces the original global flags (tab, showAdd, showStmt, ...) + render().
// Views OPEN modals via the openers; modal components READ their open-state +
// optional `payload` (e.g. an item being edited) and call close() to dismiss.
import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react'

const UIContext = createContext(null)

// All modal keys (1:1 with the original show* flags).
export const MODALS = [
  'add',        // add/edit expense        (rAddExp)
  'stmt',       // import statement        (rStatement)
  'settings',   // settings sheet          (rSettings)
  'goal',       // goal modal              (rGoalModal)
  'rec',        // recurring modal         (rRecModal)
  'income',     // income modal            (rIncomeModal)
  'cat',        // category manager        (rCatModal)
  'acct',       // custom account modal    (rAcctModal)
  'rules',      // auto-categorize rules   (rRulesModal)
  'action',     // central "+" action sheet(rActionSheet)
  'more',       // "Mais" menu             (rMoreMenu)
  'balanceUpdate',  // atualizar saldo por print
  'balanceHistory', // historico de saldos de uma conta
  'patchNotes',     // novidades / changelog
  'lock',           // desbloquear saldos (PIN / FaceID) + definir PIN
  'housing',        // editar credito a habitacao
  'position',       // adicionar/editar posicao de investimento
  'transfer',       // transferencia entre contas
  'cardpay',        // pagar divida de cartao de credito
  'group',          // criar/editar grupo de despesas partilhadas
  'person',         // criar/editar pessoa (contacto local dos grupos)
  'gexp',           // criar/editar despesa de grupo
  'settle',         // registar acerto de contas num grupo
  'assistant',      // chat do assistente de IA
  'confirm',        // ConfirmSheet — substitui confirm() nativo nas views
]

export const VALID_TABS = ['overview', 'transactions', 'expenses', 'goals', 'groups', 'cal', 'income', 'rec', 'charts', 'loan', 'ai', 'report', 'invest', 'transfers', 'cards', 'tax']
function initialTab() {
  if (typeof location === 'undefined') return 'overview'
  const t = new URLSearchParams(location.search).get('tab')
  return VALID_TABS.includes(t) ? t : 'overview'
}

export function UIProvider({ children }) {
  const [tab, setTab] = useState(initialTab) // overview|expenses|goals|cal|income|rec|charts|loan|ai
  // modal -> payload (null = closed; any value/true = open with that payload)
  const [modals, setModals] = useState(() => Object.fromEntries(MODALS.map((k) => [k, null])))

  // Espelha `tab` numa ref para o goTab (estável, sem depender de `tab`) saber
  // se a navegação é para o mesmo destino, sem empurrar entradas duplicadas
  // no histórico.
  const tabRef = useRef(tab)
  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  // Lê `?tab=` na montagem (cobre navegação sem recarregar a página, ex.: um
  // link externo que já chega com a query) e sincroniza com o botão
  // avançar/recuar do navegador.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const t = new URLSearchParams(window.location.search).get('tab')
    if (VALID_TABS.includes(t)) setTab(t)
    const onPopState = (e) => {
      setTab((e.state && e.state.tab) || 'overview')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const open = useCallback((key, payload = true) => {
    setModals((m) => ({ ...m, [key]: payload }))
  }, [])
  const close = useCallback((key) => {
    setModals((m) => ({ ...m, [key]: null }))
  }, [])
  const closeAll = useCallback(() => {
    setModals(Object.fromEntries(MODALS.map((k) => [k, null])))
  }, [])

  // Navigate to a tab (also closes transient sheets, like the original T()).
  // Also reflects the tab in the URL (`?tab=`, or the bare path for
  // 'overview') so the browser's back/forward buttons work — but only when
  // the tab actually changes, to avoid stacking no-op history entries.
  const goTab = useCallback((t) => {
    if (typeof window !== 'undefined' && tabRef.current !== t) {
      window.history.pushState({ tab: t }, '', t === 'overview' ? window.location.pathname : '?tab=' + t)
    }
    tabRef.current = t
    setTab(t)
    setModals((m) => ({ ...m, action: null, more: null }))
  }, [])

  const value = useMemo(
    () => ({ tab, setTab, goTab, modals, open, close, closeAll }),
    [tab, goTab, modals, open, close, closeAll]
  )
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used within <UIProvider>')
  return ctx
}

// Convenience hook for a single modal:
//   const { isOpen, payload, open, close } = useModal('add')
export function useModal(key) {
  const { modals, open, close } = useUI()
  return {
    isOpen: modals[key] != null,
    payload: modals[key],
    open: (p) => open(key, p),
    close: () => close(key),
  }
}
