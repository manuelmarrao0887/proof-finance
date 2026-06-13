/* ════════════════════════════════════════════════════════════════════════
   Device mode — mobile vs desktop layout.

   - Em ecrãs pequenos (< BREAKPOINT) força sempre 'mobile' e esconde o toggle.
   - Em ecrãs grandes o utilizador escolhe ('mobile'|'desktop'), default 'desktop',
     memorizado em localStorage (sem leituras ao Firebase).
   - Reflete o modo em #app[data-mode] para o CSS adaptar o layout.
   ════════════════════════════════════════════════════════════════════════ */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const DeviceContext = createContext(null);
const BREAKPOINT = 900;
const LS_KEY = 'proof-device-mode';

function readPref() {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === 'mobile' || v === 'desktop' ? v : 'desktop';
  } catch (_e) {
    return 'desktop';
  }
}

export function DeviceProvider({ children }) {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
  const [pref, setPref] = useState(readPref);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isSmall = width < BREAKPOINT;
  const canToggle = !isSmall; // toggle só existe em ecrãs grandes
  const mode = isSmall ? 'mobile' : pref;

  const setMode = useCallback((m) => {
    setPref(m === 'mobile' ? 'mobile' : 'desktop');
    try {
      localStorage.setItem(LS_KEY, m);
    } catch (_e) {
      /* ignore */
    }
  }, []);

  // Reflect the active mode on #app so tokens.css can switch layout.
  useEffect(() => {
    const el = typeof document !== 'undefined' && document.getElementById('app');
    if (el) el.setAttribute('data-mode', mode);
  }, [mode]);

  const value = useMemo(() => ({ mode, canToggle, isSmall, setMode }), [mode, canToggle, isSmall, setMode]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within <DeviceProvider>');
  return ctx;
}
