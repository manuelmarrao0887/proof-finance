/* ════════════════════════════════════════════════════════════════════════
   SettleSheet — registar que uma pessoa pagou a outra dentro de um grupo:
   move saldos ENTRE MEMBROS do grupo, nunca sai daí. É um `kind: 'settlement'`
   gravado via addGroupEntry — a própria store garante que isto nunca gera uma
   despesa pessoal (reflectExpenseFor devolve null para settlements, ver
   store/store.jsx): o dinheiro já tinha sido contabilizado quando a despesa
   original foi lançada, por isso um acerto não é nem despesa nem receita.

   Sheet no padrão de src/modals/GroupExpenseSheet.jsx (nameOf local, erro
   inline) e de src/modals/TransferModal.jsx (forma "de X para Y" com dois
   selects + valor + data). useModal('settle'):
     payload `{ groupId, from?, to?, amount? }` — from/to/amount pré-
     preenchem quando vêm de uma dívida já calculada (Saldos -> "Acertar"
     nessa linha do plano); em falta (atalho genérico "Acertar" no fundo do
     detalhe do grupo), a sheet propõe o primeiro par devedor/credor a partir
     dos saldos atuais.

   A pré-visualização "antes/depois" usa SEMPRE computeBalances() (lib/split.js)
   sobre as entries reais do grupo + o acerto proposto — nunca um cálculo
   paralelo — a mesma disciplina de "fonte única" que GroupExpenseSheet aplica
   ao resolveShares().
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore, ME_ID } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm, todayISO } from '../lib/format.js';
import { computeBalances } from '../lib/split.js';
import { PrimaryButton } from '../components/Buttons.jsx';

const METHODS = [
  { id: 'mbway', label: 'MB WAY' },
  { id: 'transfer', label: 'Transferência' },
  { id: 'cash', label: 'Dinheiro' },
];

// Mesma fórmula de GroupExpenseSheet.jsx (não exportada de lá) — 'me' é
// sempre "Tu".
function nameOfFactory(people) {
  return (id) => (id === ME_ID ? 'Tu' : (people.find((p) => p.id === id) || {}).name || '—');
}

// Aceita vírgula como separador decimal (app pt-PT), tal como as outras sheets.
function parseNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// "Dívida" sugerida entre duas pessoas a partir dos saldos atuais: quanto é
// que `from` pode pagar a `to` para os aproximar de zero. Só faz sentido
// quando `from` deve (saldo negativo) e `to` tem a receber (saldo positivo);
// nos outros casos não há dívida clara nessa direção — sugere-se 0.
function debtBetween(balances, from, to) {
  const owes = -(balances[from] || 0);
  const owed = balances[to] || 0;
  return Math.max(0, Math.min(owes, owed));
}

const sel = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid var(--border)',
  background: 'var(--elevated)',
  color: 'var(--fg)',
  borderRadius: 12,
  fontSize: 15,
  marginBottom: 14,
  appearance: 'none',
};
const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  border: '1px solid var(--border)',
  background: 'var(--elevated)',
  color: 'var(--fg)',
  borderRadius: 8,
  fontSize: 14,
  boxSizing: 'border-box',
};
const monoBig = { ...inputStyle, fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 600 };
const errText = (msg) =>
  msg ? <div style={{ color: 'var(--signal)', fontSize: 11, margin: '4px 0 10px' }}>{msg}</div> : null;

export default function SettleSheet() {
  const { isOpen, payload, close } = useModal('settle');
  const { state, actions } = useStore();
  const toast = useToast();

  const groupId = payload && typeof payload === 'object' ? payload.groupId : null;
  const group = (state.groups || []).find((g) => g.id === groupId) || null;
  const people = state.people || [];
  const nameOf = useMemo(() => nameOfFactory(people), [people]);
  const memberIds = (group && group.memberIds) || [];
  const entries = useMemo(
    () => (state.groupEntries || []).filter((e) => e.groupId === groupId),
    [state.groupEntries, groupId]
  );

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('mbway');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');

  // (Re)seed sempre que a sheet abre: from/to/valor vêm do payload quando
  // dados (ex: "Acertar" numa linha do plano já calculado); em falta,
  // propõe-se o primeiro par devedor/credor a partir dos saldos atuais.
  useEffect(() => {
    if (!isOpen || !group) return;
    const now = computeBalances(entries, memberIds);
    const p = payload && typeof payload === 'object' ? payload : {};
    const initFrom = p.from || memberIds.find((id) => (now[id] || 0) < 0) || memberIds[0] || '';
    const initTo =
      p.to ||
      memberIds.find((id) => id !== initFrom && (now[id] || 0) > 0) ||
      memberIds.find((id) => id !== initFrom) ||
      initFrom;
    setFrom(initFrom);
    setTo(initTo);
    setAmount(
      p.amount != null ? String(p.amount).replace('.', ',') : String(debtBetween(now, initFrom, initTo)).replace('.', ',')
    );
    setMethod('mbway');
    setDate(todayISO());
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, groupId]);

  if (!isOpen || !group) return null;

  const balancesNow = computeBalances(entries, memberIds);

  // Trocar "de" ou "para" reavalia a sugestão de valor a partir dos saldos
  // atuais do novo par — não é preciso reabrir a sheet para acertar outra dívida.
  const changeFrom = (id) => {
    setFrom(id);
    setAmount(String(debtBetween(balancesNow, id, to)).replace('.', ','));
    setError('');
  };
  const changeTo = (id) => {
    setTo(id);
    setAmount(String(debtBetween(balancesNow, from, id)).replace('.', ','));
    setError('');
  };

  const amountNum = parseNum(amount);
  const debtNow = debtBetween(balancesNow, from, to);
  const overpaying = amountNum > 0 && debtNow > 0 && amountNum > debtNow;

  // Pré-visualização: sempre via computeBalances, nunca aritmética paralela.
  const afterEntries = [...entries, { kind: 'settlement', fromId: from, toId: to, amount: amountNum }];
  const balancesAfter = computeBalances(afterEntries, memberIds);

  function submit() {
    if (from === to) {
      setError('Escolhe duas pessoas diferentes.');
      return;
    }
    if (amountNum <= 0) {
      setError('O valor tem de ser maior que zero.');
      return;
    }
    setError('');
    actions.addGroupEntry({ groupId, kind: 'settlement', fromId: from, toId: to, amount: amountNum, date, method });
    toast('Acerto registado', 'success');
    close();
  }

  return (
    <Sheet
      open={isOpen}
      onClose={close}
      title="Acertar contas"
      footer={<PrimaryButton onClick={submit}>Marcar como pago</PrimaryButton>}
    >
      <div className="lb" style={{ marginBottom: 6 }}>
        De (paga)
      </div>
      <select value={from} onChange={(e) => changeFrom(e.target.value)} aria-label="De" style={sel}>
        {memberIds.map((id) => (
          <option key={'f' + id} value={id}>
            {nameOf(id)}
          </option>
        ))}
      </select>

      <div className="lb" style={{ marginBottom: 6 }}>
        Para (recebe)
      </div>
      <select value={to} onChange={(e) => changeTo(e.target.value)} aria-label="Para" style={sel}>
        {memberIds.map((id) => (
          <option key={'t' + id} value={id}>
            {nameOf(id)}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>
            Valor (€)
          </div>
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError('');
            }}
            placeholder="0,00"
            inputMode="decimal"
            aria-label="Valor"
            style={monoBig}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div className="lb" style={{ marginBottom: 6 }}>
            Data
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Data"
            style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 13 }}
          />
        </div>
      </div>
      {errText(error)}

      {overpaying && (
        <div
          style={{
            borderLeft: '3px solid var(--warning)',
            background: 'var(--orange-soft)',
            padding: '8px 12px',
            borderRadius: 8,
            marginBottom: 14,
          }}
        >
          <div className="lb" style={{ color: 'var(--warning)' }}>
            Estás a registar mais do que a dívida atual.
          </div>
        </div>
      )}

      <div className="lb" style={{ marginBottom: 8 }}>
        Como pagaste
      </div>
      <div className="ms-bar">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={'ms' + (method === m.id ? ' on' : '')}
            aria-pressed={method === m.id}
            onClick={() => setMethod(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="lb" style={{ margin: '4px 0 8px' }}>
        Pré-visualização
      </div>
      <div className="cd" style={{ padding: 0, marginBottom: 12 }}>
        {[from, to].map((id, i) => (
          <div
            key={i + '-' + (id || 'vazio')}
            className="rw"
            style={{ padding: '10px 14px', borderBottom: i === 0 ? '1px solid var(--border)' : 'none' }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>{nameOf(id)}</span>
            <span style={{ display: 'flex', gap: 14 }}>
              <span style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Saldo do {nameOf(id)} antes</div>
                <div className="m" style={{ fontSize: 13, fontWeight: 700 }}>{fm(balancesNow[id] || 0)}</div>
              </span>
              <span style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Saldo do {nameOf(id)} depois</div>
                <div className="m" style={{ fontSize: 13, fontWeight: 700 }}>{fm(balancesAfter[id] || 0)}</div>
              </span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
        Impacto nas tuas finanças: nenhum · recuperação
      </div>
    </Sheet>
  );
}
