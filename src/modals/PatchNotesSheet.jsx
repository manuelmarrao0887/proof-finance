/* ════════════════════════════════════════════════════════════════════════
   PatchNotesSheet — "Novidades". Lista PATCH_NOTES; ao fechar marca a versao
   mais recente como vista (lastSeenPatchVersion). useModal('patchNotes').
   ════════════════════════════════════════════════════════════════════════ */

import React, { useCallback } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { PATCH_NOTES, LATEST_PATCH_VERSION } from '../lib/patchNotes.js';
import { formatReadingDate } from '../lib/balances.js';

export default function PatchNotesSheet() {
  const { isOpen, close } = useModal('patchNotes');
  const { state, actions } = useStore();

  const onClose = useCallback(() => {
    if ((Number(state.lastSeenPatchVersion) || 0) < LATEST_PATCH_VERSION) {
      actions.setLastSeenPatchVersion(LATEST_PATCH_VERSION);
    }
    close();
  }, [state.lastSeenPatchVersion, actions, close]);

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onClose={onClose} title="Novidades">
      {PATCH_NOTES.map((n) => (
        <div key={n.version} style={{ marginBottom: 18 }}>
          <div className="rw" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{n.title}</div>
            <span className="m" style={{ fontSize: 10, color: 'var(--text3)' }}>{formatReadingDate(n.date)}</span>
          </div>
          {n.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 13, color: 'var(--text)' }}>
              <span style={{ color: 'var(--blue)' }}>&bull;</span>
              <span>{it}</span>
            </div>
          ))}
        </div>
      ))}
      <button type="button" onClick={onClose} style={{ width: '100%', padding: '14px 0', border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontSize: 14, fontWeight: 600, borderRadius: 999, marginTop: 6 }}>
        Percebido
      </button>
    </Sheet>
  );
}
