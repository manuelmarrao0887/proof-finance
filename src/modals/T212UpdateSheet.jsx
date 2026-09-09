/* ════════════════════════════════════════════════════════════════════════
   T212UpdateSheet — atualizar a base de custo e o valor atual da carteira
   Trading212. Pré-preenchido com a última leitura (só o campo que mudou
   precisa de ser editado). useModal('t212Update').
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo, useCallback } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { todayISO } from '../lib/format.js';
import { latestT212 } from '../lib/trading212.js';

export default function T212UpdateSheet() {
  const { isOpen, close, payload } = useModal('t212Update');
  const { state, actions } = useStore();
  const toast = useToast();

  const latest = useMemo(() => latestT212(state.t212Log), [state.t212Log]);
  const [baseCusto, setBaseCusto] = useState('');
  const [valorAtual, setValorAtual] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const [primed, setPrimed] = useState(false);

  // Pré-preenche com a última leitura na primeira abertura (não a cada
  // re-render, para não apagar o que o utilizador já escreveu).
  if (isOpen && !primed) {
    setBaseCusto(latest ? String(latest.baseCusto).replace('.', ',') : '');
    setValorAtual(latest && payload !== 'notification' ? String(latest.valorAtual).replace('.', ',') : '');
    setPrimed(true);
  }

  const reset = useCallback(() => {
    setBaseCusto('');
    setValorAtual('');
    setDate(todayISO());
    setError('');
    setPrimed(false);
  }, []);

  const onClose = useCallback(() => {
    reset();
    close();
  }, [reset, close]);

  const confirm = useCallback(() => {
    const bc = parseFloat(String(baseCusto).replace(',', '.'));
    const va = parseFloat(String(valorAtual).replace(',', '.'));
    if (isNaN(bc) || isNaN(va)) {
      setError('Valores inválidos');
      return;
    }
    actions.addT212Reading({ baseCusto: bc, valorAtual: va, date });
    toast('Carteira Trading212 atualizada', 'success');
    reset();
    close();
  }, [baseCusto, valorAtual, date, actions, toast, reset, close]);

  if (!isOpen) return null;

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', marginBottom: 14 };
  const btnPrimary = (enabled) => ({ width: '100%', padding: '14px 0', border: 'none', background: enabled ? 'var(--primary)' : 'var(--bg3)', color: enabled ? 'var(--bg)' : 'var(--text3)', fontSize: 14, fontWeight: 600, borderRadius: 999 });

  return (
    <Sheet open={isOpen} onClose={onClose} title="Atualizar carteira Trading212">
      {error && (
        <div style={{ borderLeft: '3px solid var(--signal)', padding: 12, marginBottom: 14 }}>
          <div className="lb" style={{ color: 'var(--signal)' }}>{error}</div>
        </div>
      )}
      <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="t212Base">Base de custo (investido)</label>
      <input id="t212Base" value={baseCusto} onChange={(e) => setBaseCusto(e.target.value)} inputMode="decimal" placeholder="0,00" style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600 }} />

      <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="t212Val">Valor atual da carteira</label>
      <input id="t212Val" value={valorAtual} onChange={(e) => setValorAtual(e.target.value)} inputMode="decimal" placeholder="0,00" style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600 }} />

      <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="t212Date">Data</label>
      <input id="t212Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />

      <button type="button" onClick={confirm} disabled={!baseCusto || !valorAtual} style={btnPrimary(!!baseCusto && !!valorAtual)}>
        Confirmar e gravar
      </button>
    </Sheet>
  );
}
