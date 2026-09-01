/* ════════════════════════════════════════════════════════════════════════
   Shared bottom-sheet shell (map deliverable 10).

   - Fixed overlay (.sheet-overlay); backdrop click closes.
   - Panel (.sheet-panel) with a single DEDICATED scroll body
     (<div className="scroll-body">) that owns the scroll. Because that element
     is the one under the pointer, the MOUSE WHEEL scrolls it (FIX 4 — the
     original only scrolled .sheet-panel while the fixed overlay ate the wheel).
   - Drag-to-dismiss from the top area / grip, only when scrolled to top.
     Ported from attachSheetDrag (orig 324-373) but using React POINTER events
     so it works with mouse as well as touch.

   Props: { open, onClose, title, children, footer }
   ════════════════════════════════════════════════════════════════════════ */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { lockScroll, unlockScroll } from '../lib/scrollLock.js';

export default function Sheet({ open, onClose, title, children, footer }) {
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const gripRef = useRef(null);
  const closeBtnRef = useRef(null);
  const prevFocusRef = useRef(null);
  const drag = useRef({ active: false, startY: 0, curY: 0, pointerId: null });
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const close = useCallback(() => {
    if (typeof onClose === 'function') onClose();
  }, [onClose]);

  // Trava o scroll do conteúdo por trás enquanto a sheet está aberta. Sem
  // isto a roda do rato / o dedo sobre o backdrop continuava a fazer scroll ao
  // fundo e, ao fechar, a página aparecia noutro sítio (ver lib/scrollLock.js).
  useEffect(() => {
    if (!open) return undefined;
    lockScroll();
    return unlockScroll;
  }, [open]);

  // Keyboard a11y: Escape to close + a minimal focus trap (Tab/Shift+Tab cycle).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
        return;
      }
      if (ev.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (ev.shiftKey) {
          if (document.activeElement === first || !panel.contains(document.activeElement)) {
            ev.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !panel.contains(document.activeElement)) {
          ev.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Move focus into the dialog on open; restore it to the previous element on close.
  useEffect(() => {
    if (!open) return undefined;
    prevFocusRef.current = document.activeElement;
    const panel = panelRef.current;
    const target =
      closeBtnRef.current ||
      (panel &&
        panel.querySelector(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )) ||
      panel;
    if (target && typeof target.focus === 'function') target.focus();
    return () => {
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open]);

  const onPointerDown = useCallback((ev) => {
    const panel = panelRef.current;
    const scrollEl = scrollRef.current;
    if (!panel) return;
    // Only start drag from the top 80px of the panel OR from the grip,
    // and only when the scroll body is at the top (orig 337-339).
    const rect = panel.getBoundingClientRect();
    const fromGrip = gripRef.current && gripRef.current.contains(ev.target);
    if (ev.clientY - rect.top > 80 && !fromGrip) return;
    if (scrollEl && scrollEl.scrollTop > 0) return;
    drag.current.active = true;
    drag.current.startY = ev.clientY;
    drag.current.curY = ev.clientY;
    drag.current.pointerId = ev.pointerId;
    setDragging(true);
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch (x) {
      /* ignore */
    }
  }, []);

  const onPointerMove = useCallback((ev) => {
    if (!drag.current.active) return;
    drag.current.curY = ev.clientY;
    const dy = Math.max(0, drag.current.curY - drag.current.startY);
    setDragY(dy);
  }, []);

  const endDrag = useCallback(() => {
    if (!drag.current.active) return;
    const dy = drag.current.curY - drag.current.startY;
    drag.current.active = false;
    setDragging(false);
    if (dy > 120) {
      // dismiss (orig 356-364)
      setDragY(0);
      close();
    } else {
      setDragY(0); // snap back
    }
  }, [close]);

  if (!open) return null;

  const panelStyle = {
    transform: dragY ? `translate3d(0, ${dragY}px, 0)` : undefined,
    transition: dragging ? 'none' : 'transform 0.28s var(--ease-ios)',
    display: 'flex',
    flexDirection: 'column',
  };

  // The scroll body owns the scroll; cap its height so the panel + footer fit.
  const scrollStyle = {
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    // dvh (não vh): no iOS o vh conta com a barra de endereço recolhida e a
    // sheet ficava mais alta do que o ecrã visível, cortando o rodapé.
    maxHeight: 'calc(90dvh - 120px)',
    flex: '1 1 auto',
  };

  return (
    <div
      className="sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Painel'}
      onMouseDown={(e) => {
        // Backdrop click closes (only when the overlay itself is the target).
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className="sheet-panel"
        style={panelStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div ref={gripRef} className="sheet-grip" />
        {title ? (
          <div className="rw" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>{title}</h2>
            <button ref={closeBtnRef} type="button" className="icon-btn" onClick={close} aria-label="Fechar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : null}
        <div ref={scrollRef} className="scroll-body" style={scrollStyle}>
          {children}
        </div>
        {footer ? <div style={{ paddingTop: 12 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
