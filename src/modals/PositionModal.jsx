/* ════════════════════════════════════════════════════════════════════════
   PositionModal — adicionar/editar uma posição de investimento.
   useModal('position'); payload {id} = editar.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid } from '../lib/format.js';
import { PrimaryButton } from '../components/Buttons.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { snapshotSlices } from '../lib/snapshot.js';

const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0;
const str = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
const EMPTY = { id: null, broker: '', asset: '', qty: '', avgPrice: '', currentPrice: '' };

export default function PositionModal() {
  const { isOpen, payload, close } = useModal('position');
  const { state, actions } = useStore();
  const toast = useToast();
  const [d, setD] = useState(EMPTY);

  useEffect(() => {
    if (!isOpen) return;
    const id = payload && typeof payload === 'object' ? payload.id : null;
    const p = id ? (state.positions || []).find((x) => x.id === id) : null;
    if (p) setD({ id: p.id, broker: p.broker || '', asset: p.asset || '', qty: str(p.qty), avgPrice: str(p.avgPrice), currentPrice: str(p.currentPrice) });
    else setD(EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payload]);

  if (!isOpen) return null;
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));

  const save = () => {
    const asset = (d.asset || '').trim();
    if (!asset) {
      toast('Indica o ativo', 'error');
      return;
    }
    const p = { broker: (d.broker || '').trim(), asset, qty: num(d.qty), avgPrice: num(d.avgPrice), currentPrice: num(d.currentPrice) };
    if (d.id) actions.updatePosition(d.id, p);
    else actions.addPosition({ id: uid(), ...p });
    close();
    toast(d.id ? 'Posição atualizada' : 'Posição adicionada', 'success');
  };
  const remove = () => {
    if (!d.id) return;
    const snap = snapshotSlices(actions.getState(), ['positions']);
    actions.deletePosition(d.id);
    close();
    toast('Posição removida', 'success', { action: { label: 'Anular', onClick: () => actions.patch(snap) } });
  };

  const input = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 16, boxSizing: 'border-box', fontFamily: 'var(--mono)' };
  const field = (label, k, ph, decimal) => (
    <div style={{ marginBottom: 12 }}>
      <div className="lb" style={{ marginBottom: 6 }}>{label}</div>
      <input value={d[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} inputMode={decimal ? 'decimal' : undefined} aria-label={label} style={input} />
    </div>
  );

  return (
    <Sheet open={isOpen} onClose={close} title={d.id ? 'Editar posição' : 'Nova posição'} footer={<><PrimaryButton onClick={save}>Guardar</PrimaryButton>{d.id && <ConfirmButton label="Remover" confirmLabel="Confirmar remoção" onConfirm={remove} />}</>}>
      {field('Ativo (nome/ticker)', 'asset', 'AAPL, VWCE, BTC…')}
      {field('Corretora (opcional)', 'broker', 'XTB, Trade Republic…')}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>{field('Quantidade', 'qty', '10', true)}</div>
        <div style={{ flex: 1 }}>{field('Preço médio', 'avgPrice', '100', true)}</div>
      </div>
      {field('Preço atual', 'currentPrice', '120', true)}
    </Sheet>
  );
}
