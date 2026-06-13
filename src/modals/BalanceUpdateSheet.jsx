/* ════════════════════════════════════════════════════════════════════════
   BalanceUpdateSheet — atualizar o saldo de UMA conta a partir de um print.
   Fluxo: escolher conta (manual) -> upload print -> a AI le SO o valor ->
   confirmar valor + data -> grava leitura (balanceLog) + saldo vivo.
   useModal('balanceUpdate'). A conta NUNCA e adivinhada — e sempre escolhida.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo, useCallback } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { fm } from '../lib/format.js';
import { callAI, resizeImg } from '../lib/ai.js';
import {
  listAccounts,
  latestReading,
  parseBalanceResult,
  formatReadingDate,
  BALANCE_PROMPT,
} from '../lib/balances.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function BalanceUpdateSheet() {
  const { isOpen, close } = useModal('balanceUpdate');
  const { state, actions } = useStore();
  const toast = useToast();

  const accounts = useMemo(() => listAccounts(state), [state]);
  const [acctKey, setAcctKey] = useState('');
  const [step, setStep] = useState('pick'); // pick | scanning | confirm
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');

  const account = useMemo(() => accounts.find((a) => a.acctKey === acctKey) || null, [accounts, acctKey]);
  const prev = useMemo(
    () => (account ? latestReading(state.balanceLog, account.acctKey) : null),
    [account, state.balanceLog]
  );

  const reset = useCallback(() => {
    setAcctKey('');
    setStep('pick');
    setValue('');
    setDate(todayISO());
    setError('');
  }, []);

  const onClose = useCallback(() => {
    reset();
    close();
  }, [reset, close]);

  const scan = useCallback(
    (el) => {
      const f = el.files && el.files[0];
      el.value = '';
      if (!f || !account) return;
      setStep('scanning');
      setError('');
      resizeImg(f, 1600).then((b64) => {
        callAI(
          [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: BALANCE_PROMPT },
          ],
          undefined,
          state.apiKey,
          (res) => {
            const parsed = parseBalanceResult(res);
            if (parsed.error) {
              setError(parsed.error + ' — introduz o valor manualmente.');
              setValue('');
            } else {
              setValue(String(parsed.value).replace('.', ','));
            }
            setStep('confirm');
          }
        );
      });
    },
    [account, state.apiKey]
  );

  const confirm = useCallback(() => {
    if (!account) return;
    const v = parseFloat(String(value).replace(',', '.'));
    if (isNaN(v)) {
      setError('Valor invalido');
      return;
    }
    actions.addBalanceReading({ account, value: v, date });
    toast('Saldo de ' + account.bank + ' atualizado', 'success');
    reset();
    close();
  }, [account, value, date, actions, toast, reset, close]);

  if (!isOpen) return null;

  // Group accounts by bank for the <select> optgroups.
  const groups = accounts.reduce((m, a) => {
    (m[a.bank] = m[a.bank] || []).push(a);
    return m;
  }, {});

  const selStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 14, marginBottom: 14 };
  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', marginBottom: 14 };
  const btnPrimary = (enabled) => ({ width: '100%', padding: '14px 0', border: 'none', background: enabled ? 'var(--fg)' : 'var(--bg3)', color: enabled ? 'var(--bg)' : 'var(--text3)', fontSize: 14, fontWeight: 600, borderRadius: 999 });

  return (
    <Sheet open={isOpen} onClose={onClose} title="Atualizar saldo">
      {/* Step 1: choose account */}
      <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="buAcct">Conta a atualizar</label>
      <select id="buAcct" value={acctKey} onChange={(e) => { setAcctKey(e.target.value); setStep('pick'); setValue(''); setError(''); }} style={selStyle}>
        <option value="">— escolhe a conta —</option>
        {Object.keys(groups).map((bank) => (
          <optgroup key={bank} label={bank}>
            {groups[bank].map((a) => (
              <option key={a.acctKey} value={a.acctKey}>{a.bank} · {a.type}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {account && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          {prev
            ? 'Leitura anterior: ' + formatReadingDate(prev.date) + ' — ' + fm(prev.value)
            : 'Sem leitura anterior (primeira atualizacao).'}
        </div>
      )}

      {/* Step 1b: upload (only after an account is chosen) */}
      {account && step === 'pick' && (
        <>
          {!state.apiKey && (
            <div style={{ borderLeft: '3px solid var(--signal)', padding: 12, marginBottom: 14 }}>
              <div className="lb" style={{ color: 'var(--signal)' }}>Sem API key — usa "Introduzir manualmente"</div>
            </div>
          )}
          <input id="buCam" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => scan(e.target)} />
          <input id="buFile" type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => scan(e.target)} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" disabled={!state.apiKey} onClick={() => document.getElementById('buCam').click()} style={{ flex: 1, padding: 14, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>Câmara</button>
            <button type="button" disabled={!state.apiKey} onClick={() => document.getElementById('buFile').click()} style={{ flex: 1, padding: 14, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>Ficheiro</button>
          </div>
          <button type="button" onClick={() => { setValue(''); setStep('confirm'); }} style={{ width: '100%', padding: '10px 0', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>Introduzir manualmente</button>
        </>
      )}

      {step === 'scanning' && (
        <div style={{ border: '1px solid var(--border)', padding: 24, textAlign: 'center', borderRadius: 'var(--r2)' }}>
          <div className="lb">A ler saldo...</div>
        </div>
      )}

      {/* Step 2: confirm value + date */}
      {account && step === 'confirm' && (
        <>
          {error && (
            <div style={{ borderLeft: '3px solid var(--signal)', padding: 12, marginBottom: 14 }}>
              <div className="lb" style={{ color: 'var(--signal)' }}>{error}</div>
            </div>
          )}
          <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="buVal">Saldo novo</label>
          <input id="buVal" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600 }} />
          <label className="lb" style={{ display: 'block', marginBottom: 6 }} htmlFor="buDate">Data do saldo</label>
          <input id="buDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle }} />
          <button type="button" onClick={confirm} disabled={!value} style={btnPrimary(!!value)}>Confirmar e gravar</button>
        </>
      )}
    </Sheet>
  );
}
