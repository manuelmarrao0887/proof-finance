/* ════════════════════════════════════════════════════════════════════════
   renderWithStore — monta qualquer view/modal com os providers reais da app e
   um estado de utilizador AUTENTICADO já hidratado (sem Firebase).

   Uso:
     const { container } = await renderWithStore(<OverviewView />, { fixture });
     // fixture: parte do slice persistido a sobrepor aos defaults
     // opts.tab / opts.openModal: navegação inicial do UIProvider
     // opts.preview: true → sem login (Seed não chama setCurrentUser)

   O Firebase é mockado nos testes (ver vi.mock em cada ficheiro de teste ou
   em setup): aqui só se assume que loadUserData/syncUserData não tocam na rede.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useRef } from 'react';
import { render, act } from '@testing-library/react';
import { StoreProvider, useStore, useAuth, initialPersisted } from '../store/store.jsx';
import { ToastProvider } from '../components/Toast.jsx';
import { UIProvider, useUI } from '../store/ui.jsx';
import { DeviceProvider } from '../store/device.jsx';

// Faz o que o App faz depois do login: define o utilizador e hidrata o estado.
function Seed({ fixture, tab, openModal, payload, onReady, children, preview }) {
  const { dispatch, actions } = useStore();
  const { setCurrentUser } = useAuth();
  const ui = useUI();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (!preview) setCurrentUser({ uid: 'test-user', email: 'test@example.com' });
    dispatch({ type: 'hydrate', persisted: { ...initialPersisted(), ...(fixture || {}) } });
    if (tab) ui.goTab(tab);
    if (openModal) ui.open(openModal, payload === undefined ? true : payload);
    if (onReady) onReady({ dispatch, ui, actions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children;
}

export async function renderWithStore(element, opts = {}) {
  let utils;
  await act(async () => {
    utils = render(
      <StoreProvider>
        <ToastProvider>
          <UIProvider>
            <DeviceProvider>
              <Seed fixture={opts.fixture} tab={opts.tab} openModal={opts.openModal} payload={opts.payload} onReady={opts.onReady} preview={opts.preview}>
                {element}
              </Seed>
            </DeviceProvider>
          </UIProvider>
        </ToastProvider>
      </StoreProvider>
    );
  });
  // Deixa os efeitos de hidratação/lazy assentarem.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return utils;
}

/* Espia console.error/warn durante um teste e devolve as mensagens — para
   falhar em avisos do React (keys, act, props inválidas) que no browser passam
   despercebidos mas indicam bugs. */
export function captureConsole() {
  const errors = [];
  const warns = [];
  const e0 = console.error;
  const w0 = console.warn;
  console.error = (...a) => errors.push(a.map(String).join(' '));
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  return {
    errors,
    warns,
    restore() {
      console.error = e0;
      console.warn = w0;
    },
  };
}
