/* ════════════════════════════════════════════════════════════════════════
   Toast host + useToast() hook — React port of the original toast(msg,type)
   (orig 388-402). Auto-dismiss after 2.4s. success/error show an inline SVG
   icon (no emoji). Mount <ToastHost/> once near the app root.
   ════════════════════════════════════════════════════════════════════════ */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(() => {});

const SuccessIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const ErrorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  // toast(msg, type, opts) — opts.action = { label, onClick } mostra um botão
  // no toast (ex.: "Anular") em vez de o deixar apenas informativo; dura
  // 6000ms nesse caso (2400ms nos toasts normais) para dar tempo de reagir.
  const toast = useCallback((msg, type, opts = {}) => {
    const id = ++idRef.current;
    const action = opts.action || null;
    setToasts((list) => [...list, { id, msg, type, action }]);
    setTimeout(() => dismiss(id), opts.duration || (action ? 6000 : 2400));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast-wrap" className="toast-wrap">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={'toast' + (t.type ? ' ' + t.type : '') + (t.action ? ' undo' : '')}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
          >
            {t.type === 'success' && <SuccessIcon />}
            {t.type === 'error' && <ErrorIcon />}
            <span>{t.msg}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Mounting the provider already renders the host; <ToastHost/> is an alias for
// readability in trees that want an explicit host marker.
export function ToastHost() {
  return null;
}

export function useToast() {
  return useContext(ToastContext);
}
