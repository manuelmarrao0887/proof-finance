/* ════════════════════════════════════════════════════════════════════════
   CardPayModal — pagar a dívida de um cartão de crédito a partir de uma conta
   à ordem. É modelado como uma transferência conta→cartão (slice `transfers`):
   a conta à ordem desce e a dívida do cartão baixa (cardUsage conta o `to`).
   useModal('cardpay'); payload { cardLabel }.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo, useEffect } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { uid, todayISO, fm } from '../lib/format.js';
import { listAccounts } from '../lib/balances.js';
import { cardUsage, CARD_CAT } from '../lib/finance.js';
import { PrimaryButton } from '../components/Buttons.jsx';

const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0;

export default function CardPayModal() {
  const { isOpen, payload, close } = useModal('cardpay');
  const { state, actions, currentUser } = useStore();
  const toast = useToast();

  const accounts = useMemo(() => listAccounts({ ...state, currentUser }), [state, currentUser]);
  // Cartões (destino) e contas pagadoras (origem, nunca um cartão).
  const cards = accounts.filter((a) => a.category === CARD_CAT).map((a) => a.bank + ' · ' + a.type);
  const payers = accounts.filter((a) => a.category !== CARD_CAT).map((a) => a.bank + ' · ' + a.type);

  const [card, setCard] = useState('');
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');

  const debt = useMemo(
    () => (card ? cardUsage({ ...state, currentUser }, card).used : 0),
    [card, state, currentUser]
  );

  useEffect(() => {
    if (!isOpen) return;
    const pre = payload && typeof payload === 'object' ? payload.cardLabel : null;
    const c = pre || cards[0] || '';
    setCard(c);
    setFrom(payers[0] || '');
    setAmount('');
    setDate(todayISO());
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const save = () => {
    const amt = num(amount);
    if (!card) {
      toast('Sem cartão', 'error');
      return;
    }
    if (!from) {
      toast('Escolhe a conta de onde pagas', 'error');
      return;
    }
    if (from === card) {
      toast('A conta de origem não pode ser o cartão', 'error');
      return;
    }
    if (amt <= 0) {
      toast('Valor inválido', 'error');
      return;
    }
    actions.addTransfer({
      id: uid(),
      from,
      to: card,
      amount: amt,
      date,
      note: (note || '').trim() || ('Pagamento ' + card),
      cardPayment: true,
      createdAt: Date.now(),
    });
    close();
    toast('Pagamento registado', 'success');
  };

  const sel = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 'var(--fs-input)', marginBottom: 14, appearance: 'none' };
  const input = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 16, boxSizing: 'border-box', fontFamily: 'var(--mono)' };

  return (
    <Sheet open={isOpen} onClose={close} title="Pagar dívida do cartão" footer={<PrimaryButton onClick={save}>Registar pagamento</PrimaryButton>}>
      <div className="lb" style={{ marginBottom: 6 }}>Cartão</div>
      <select value={card} onChange={(e) => setCard(e.target.value)} aria-label="Cartão" style={sel}>
        {cards.length === 0 && <option value="">— sem cartões —</option>}
        {cards.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

      {card && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -8, marginBottom: 14 }}>
          Dívida atual: <b style={{ color: debt > 0 ? 'var(--signal)' : 'var(--success)' }}>{fm(debt)}</b>
          {debt > 0 && (
            <button type="button" onClick={() => setAmount(String(debt.toFixed(2)).replace('.', ','))} style={{ marginLeft: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--primary)', borderRadius: 999, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
              Pagar tudo
            </button>
          )}
        </div>
      )}

      <div className="lb" style={{ marginBottom: 6 }}>Pagar a partir de (conta à ordem)</div>
      <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Conta de origem" style={sel}>
        {payers.length === 0 && <option value="">— sem contas —</option>}
        {payers.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Valor (€)</div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" aria-label="Valor" style={input} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Data</div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" style={{ ...input, fontSize: 'var(--fs-input)' }} />
        </div>
      </div>

      <div className="lb" style={{ marginBottom: 6 }}>Nota (opcional)</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: pagamento fatura junho" aria-label="Nota" style={{ ...input, fontFamily: 'var(--font)', fontSize: 'var(--fs-input)' }} />

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
        Baixa a dívida do cartão e desce o saldo da conta à ordem escolhida. Fica registado em Transferências.
      </div>
    </Sheet>
  );
}
