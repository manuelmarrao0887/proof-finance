/* ════════════════════════════════════════════════════════════════════════
   Entry point — mounts <App/> into #app with the global providers.
   data-theme is already set by the pre-paint script in index.html, so there
   is no flash before the store's applyTheme runs after auth/load.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import App from './App.jsx';
import { StoreProvider } from './store/store.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { UIProvider } from './store/ui.jsx';
import { DeviceProvider } from './store/device.jsx';

const container = document.getElementById('app');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <StoreProvider>
      <ToastProvider>
        <UIProvider>
          <DeviceProvider>
            <App />
          </DeviceProvider>
        </UIProvider>
      </ToastProvider>
    </StoreProvider>
  </React.StrictMode>
);
