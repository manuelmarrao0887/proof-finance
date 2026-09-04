/* Pré-visualização LOCAL com utilizador autenticado e dados ricos, sem Firebase.
   Abrir em http://localhost:5173/dev.html (vite dev). Não faz parte do build.
   ?fixture=empty → conta vazia · ?hidden=1 → saldos ocultos · ?tab=cards → tab */
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { StoreProvider, useStore, useAuth, initialPersisted, applyTheme } from './store/store.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { UIProvider, useUI } from './store/ui.jsx';
import { DeviceProvider } from './store/device.jsx';
import Shell from './components/Shell.jsx';
import { richFixture, emptyFixture } from './test/fixtures.js';

window.__PROOF_NO_SYNC__ = true; // nunca escrever no Firestore a partir daqui

const q = new URLSearchParams(location.search);

function Seed({ children }) {
  const { dispatch } = useStore();
  const { setCurrentUser } = useAuth();
  const ui = useUI();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const fx = q.get('fixture') === 'empty' ? emptyFixture() : richFixture();
    if (q.get('hidden') === '1') fx.balancesHidden = true;
    if (q.get('theme')) fx.theme = q.get('theme');
    setCurrentUser({ uid: 'preview-user', email: 'preview@local' });
    dispatch({ type: 'hydrate', persisted: { ...initialPersisted(), ...fx } });
    applyTheme(fx.theme || 'light');
    if (q.get('tab')) ui.goTab(q.get('tab'));
    if (q.get('modal')) ui.open(q.get('modal'));
    window.__PROOF_READY__ = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children;
}

createRoot(document.getElementById('app')).render(
  <StoreProvider>
    <ToastProvider>
      <UIProvider>
        <DeviceProvider>
          <Seed>
            <Shell />
          </Seed>
        </DeviceProvider>
      </UIProvider>
    </ToastProvider>
  </StoreProvider>
);
