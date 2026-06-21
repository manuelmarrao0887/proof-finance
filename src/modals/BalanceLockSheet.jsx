/* ════════════════════════════════════════════════════════════════════════
   BalanceLockSheet — desbloquear (mostrar) os saldos. Dois modos:
   - Sem PIN definido → SETUP: define um PIN de 4 dígitos (com confirmação).
   - Com PIN → UNLOCK: introduz o PIN ou usa FaceID/biometria.
   Sucesso → setBalancesHidden(false) e fecha. useModal('lock').
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { sha256Hex, faceIdSupported, registerFaceId, verifyFaceId } from '../lib/lock.js';

export default function BalanceLockSheet() {
  const { isOpen, close } = useModal('lock');
  const { state, actions } = useStore();
  const toast = useToast();

  const hasPin = !!state.pinHash;
  const hasFace = !!state.faceIdCred;
  const faceOk = faceIdSupported();

  const [entry, setEntry] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setEntry('');
      setFirstPin('');
      setErr('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const reveal = () => {
    actions.setBalancesHidden(false);
    close();
  };

  async function submit(pin) {
    if (!hasPin) {
      if (!firstPin) {
        setFirstPin(pin);
        setEntry('');
        return;
      }
      if (pin !== firstPin) {
        setErr('Os PINs não coincidem. Recomeça.');
        setFirstPin('');
        setEntry('');
        return;
      }
      const h = await sha256Hex(pin);
      actions.setPinHash(h);
      toast('PIN definido', 'success');
      reveal();
      return;
    }
    const h = await sha256Hex(pin);
    if (h === state.pinHash) reveal();
    else {
      setErr('PIN errado.');
      setEntry('');
    }
  }

  const onDigit = (d) => {
    if (entry.length >= 4) return;
    const next = entry + d;
    setEntry(next);
    setErr('');
    if (next.length === 4) setTimeout(() => submit(next), 100);
  };
  const onBack = () => {
    setErr('');
    setEntry((e) => e.slice(0, -1));
  };

  const useFace = async () => {
    setErr('');
    try {
      const ok = await verifyFaceId(state.faceIdCred);
      if (ok) reveal();
      else setErr('Biometria falhou.');
    } catch (e) {
      setErr('Biometria cancelada ou indisponível.');
    }
  };
  const enableFace = async () => {
    setErr('');
    try {
      const id = await registerFaceId();
      actions.setFaceIdCred(id);
      toast('FaceID ativado', 'success');
    } catch (e) {
      toast('Não foi possível ativar o FaceID', 'error');
    }
  };

  const title = !hasPin ? 'Proteger saldos' : 'Mostrar saldos';
  const sub = !hasPin
    ? firstPin
      ? 'Confirma o PIN de 4 dígitos'
      : 'Define um PIN de 4 dígitos'
    : 'Introduz o PIN ou usa FaceID';

  const keyBtn = (label, onClick, faded) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        height: 60,
        borderRadius: 16,
        border: 'none',
        background: onClick ? 'var(--elevated)' : 'transparent',
        color: faded ? 'var(--fg-muted)' : 'var(--fg)',
        fontSize: 22,
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'var(--mono)',
      }}
    >
      {label}
    </button>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={title}>
      <div style={{ textAlign: 'center', paddingBottom: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 18 }}>{sub}</div>

        {/* dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: i < entry.length ? 'var(--primary)' : 'var(--border)',
                transition: 'background 0.15s',
              }}
            />
          ))}
        </div>

        {err && <div className="lb" style={{ color: 'var(--signal)', marginBottom: 12 }}>{err}</div>}

        {/* FaceID (unlock com credencial) */}
        {hasPin && hasFace && faceOk && (
          <button
            type="button"
            onClick={useFace}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, border: '1px solid var(--primary)', background: 'var(--blue-soft)', color: 'var(--primary)', fontSize: 14, fontWeight: 600, marginBottom: 16, cursor: 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
              <path d="M9 9v1M15 9v1M9.5 15a3.5 3.5 0 0 0 5 0M12 9v4h-1" />
            </svg>
            Usar FaceID
          </button>
        )}

        {/* keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 280, margin: '0 auto' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <div key={d}>{keyBtn(d, () => onDigit(d))}</div>
          ))}
          <div>{keyBtn('', null)}</div>
          <div>{keyBtn('0', () => onDigit('0'))}</div>
          <div>{keyBtn('⌫', entry.length ? onBack : null, true)}</div>
        </div>

        {/* ativar FaceID (quando há PIN mas ainda sem biometria) */}
        {hasPin && !hasFace && faceOk && (
          <button
            type="button"
            onClick={enableFace}
            style={{ marginTop: 18, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Ativar FaceID para a próxima vez
          </button>
        )}
      </div>
    </Sheet>
  );
}
