/* ════════════════════════════════════════════════════════════════════════
   TransferModal — transferência entre contas próprias. Não é despesa: sai de
   uma conta e entra noutra (património igual). useModal('transfer').
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid, todayISO } from '../lib/format.js';
import { listAccounts } from '../lib/balances.js';
import { PrimaryButton } from '../components/Buttons.jsx';

const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0;

export default function TransferModal() {
  const { isOpen, close } = useModal('transfer');
  const { state, actions, currentUser } = useStore();
  const toast = useToast();
  const accounts = useMemo(() => listAccounts({ ...state, currentUser }), [state, currentUser]);
  const labels = accounts.map((a) => a.bank + ' · ' + a.type);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFrom(labels[0] || '');
      setTo(labels[1] || labels[0] || '');
      setAmount('');
      setDate(todayISO());
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const save = () => {
    const amt = num(amount);
    if (!from || !to) {
      toast('Escolhe as contas', 'error');
      return;
    }
    if (from === to) {
      toast('As contas têm de ser diferentes', 'error');
      return;
    }
    if (amt <= 0) {
      toast('Valor inválido', 'error');
      return;
    }
    actions.addTransfer({ id: uid(), from, to, amount: amt, date, note: (note || '').trim(), createdAt: Date.now() });
    close();
    toast('Transferência registada', 'success');
  };

  const sel = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 'var(--fs-input)', marginBottom: 14, appearance: 'none' };
  const input = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 16, boxSizing: 'border-box', fontFamily: 'var(--mono)' };

  return (
    <Sheet open={isOpen} onClose={close} title="Transferência entre contas" footer={<PrimaryButton onClick={save}>Registar transferência</PrimaryButton>}>
      <div className="lb" style={{ marginBottom: 6 }}>De (sai)</div>
      <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Conta de origem" style={sel}>
        {labels.map((l) => <option key={'f' + l} value={l}>{l}</option>)}
      </select>

      <div className="lb" style={{ marginBottom: 6 }}>Para (entra)</div>
      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Conta de destino" style={sel}>
        {labels.map((l) => <option key={'t' + l} value={l}>{l}</option>)}
      </select>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Valor (€)</div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500,00" inputMode="decimal" aria-label="Valor" style={input} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Data</div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" style={{ ...input, fontSize: 'var(--fs-input)' }} />
        </div>
      </div>

      <div className="lb" style={{ marginBottom: 6 }}>Nota (opcional)</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: reforço poupança" aria-label="Nota" style={{ ...input, fontFamily: 'var(--font)', fontSize: 'var(--fs-input)' }} />

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
        Não conta como despesa nem receita. Ajusta o saldo das duas contas (o património total não muda).
      </div>
    </Sheet>
  );
}
