/* ════════════════════════════════════════════════════════════════════════
   DeviceToggle — segmented Telemóvel / Desktop. Só aparece em ecrãs grandes
   (canToggle). Em telemóvel não é mostrado (modo mobile forçado).
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useDevice } from '../store/device.jsx';

const phoneIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <line x1="11" y1="18" x2="13" y2="18" />
  </svg>
);
const desktopIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

export default function DeviceToggle() {
  const { mode, canToggle, setMode } = useDevice();
  if (!canToggle) return null;
  return (
    <div className="dtoggle" role="group" aria-label="Tipo de dispositivo">
      <button type="button" className={mode === 'mobile' ? 'on' : ''} onClick={() => setMode('mobile')}>
        {phoneIcon} Telemóvel
      </button>
      <button type="button" className={mode === 'desktop' ? 'on' : ''} onClick={() => setMode('desktop')}>
        {desktopIcon} Desktop
      </button>
    </div>
  );
}
