/* ════════════════════════════════════════════════════════════════════════
   ExtraRepaymentSimulator — dado o crédito habitação atual (state.housing),
   simula o impacto de uma amortização extra (pagamento único): quanto tempo
   e quantos juros se poupam mantendo a prestação (reduz prazo), ou qual a
   nova prestação mantendo o prazo (reduz prestação).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { fm } from '../lib/format.js';
import { monthsElapsed, remainingBalance, simulateExtraRepayment } from '../lib/mortgage.js';

const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0;

const cardStyle = { flex: '1 1 200px', background: 'var(--elevated)', borderRadius: 14, padding: '14px 16px' };
const inputStyle = { width: '100%', padding: '11px 12px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 16, boxSizing: 'border-box', fontFamily: 'var(--mono)' };

export default function ExtraRepaymentSimulator() {
  const { state } = useStore();
  const h = state.housing;
  const [extra, setExtra] = useState('');
  const hidden = !!state.balancesHidden;
  const mv = (v) => (hidden ? '••••' : fm(v));

  const ready = !!(h && h.valorEmprestimo > 0 && h.taxaJuro > 0 && h.prazoAnos > 0 && h.prestacao > 0 && h.dataAquisicao);
  if (!ready) return null;

  const elapsed = monthsElapsed(h.dataAquisicao);
  const balance = remainingBalance(h.valorEmprestimo, h.taxaJuro, h.prazoAnos, elapsed);
  const extraValue = num(extra);
  const sim = simulateExtraRepayment({
    principal: h.valorEmprestimo,
    annualRatePct: h.taxaJuro,
    years: h.prazoAnos,
    monthsElapsed: elapsed,
    payment: h.prestacao,
    extra: extraValue,
  });

  return (
    <div className="cd" style={{ marginBottom: 16, padding: 20 }}>
      <div className="lb" style={{ marginBottom: 4 }}>Simulador · amortização extra</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
        Saldo em dívida estimado: <strong>{mv(balance)}</strong>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="lb" style={{ marginBottom: 6 }}>Valor extra a abater (€)</div>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" placeholder="5000" aria-label="Valor extra a abater" style={inputStyle} />
      </div>

      {extraValue > 0 && sim.payoff && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--success)' }}>Quitas o crédito!</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Poupas <strong>{mv(sim.reduceTerm.interestSaved)}</strong> de juros e {sim.reduceTerm.monthsSaved} meses de prestações.
          </div>
        </div>
      )}

      {extraValue > 0 && !sim.payoff && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={cardStyle}>
            <div className="lb" style={{ marginBottom: 8 }}>Reduzir prazo</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Mantendo a prestação de {mv(h.prestacao)}</div>
            <div className="m" style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>−{sim.reduceTerm.monthsSaved} meses</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Juros poupados: <strong>{mv(sim.reduceTerm.interestSaved)}</strong></div>
          </div>
          <div style={cardStyle}>
            <div className="lb" style={{ marginBottom: 8 }}>Reduzir prestação</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Mantendo o prazo</div>
            <div className="m" style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>{mv(sim.reducePayment.newPayment)}/mês</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Juros poupados: <strong>{mv(sim.reducePayment.interestSaved)}</strong></div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 12 }}>Estimativa com base no saldo em dívida calculado a partir da taxa e prazo atuais. Confirma o valor real com o banco.</div>
    </div>
  );
}
