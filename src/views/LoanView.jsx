/* ════════════════════════════════════════════════════════════════════════
   LoanView — "Crédito" tab → Crédito à habitação.
   - Preview: cartão demo (ilustrativo).
   - Autenticado: a casa do utilizador (state.housing) com taxa de esforço, ou
     estado vazio para adicionar.
   - Simulador de crédito habitação (nova casa): prestação, juros, custo total,
     IMT+IS estimados e taxa de esforço.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { isPreviewMode } from '../lib/finance.js';
import { fm, fc } from '../lib/format.js';
import { monthlyPayment, totalInterest, effortRate, purchaseTaxes } from '../lib/mortgage.js';

const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0;

function effortColor(pct) {
  return pct >= 50 ? 'var(--danger)' : pct >= 35 ? 'var(--warning)' : 'var(--success)';
}
function effortLabel(pct) {
  return pct >= 50 ? 'Crítica' : pct >= 35 ? 'Alta' : 'Saudável';
}

function Row({ label, value }) {
  return (
    <div className="rw" style={{ padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text3)' }}>{label}</span>
      <span className="m" style={{ fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default function LoanView() {
  const { state, currentUser } = useStore();
  const { open } = useUI();
  const s = { ...state, currentUser };
  const preview = isPreviewMode(s);
  const hidden = !!state.balancesHidden;
  const mv = (v) => (hidden ? '••••' : fm(v));

  const h = state.housing;

  // ── Simulador (local) ──────────────────────────────────────────────────
  const [sim, setSim] = useState({ preco: '', entrada: '', taxa: '3,3', prazo: '30', rend: h ? String(h.rendimentoAgregado || '') : '' });
  const setS = (k, v) => setSim((p) => ({ ...p, [k]: v }));
  const preco = num(sim.preco);
  const entrada = num(sim.entrada);
  const financiado = Math.max(0, preco - entrada);
  const simPrest = monthlyPayment(financiado, num(sim.taxa), num(sim.prazo));
  const simJuros = totalInterest(financiado, num(sim.taxa), num(sim.prazo));
  const simImpostos = purchaseTaxes(preco);
  const simEsforco = effortRate(simPrest, num(sim.rend));

  const simInput = { width: '100%', padding: '11px 12px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 12, fontSize: 16, boxSizing: 'border-box', fontFamily: 'var(--mono)' };

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      {/* ── Preview: cartão demo ── */}
      {preview && (
        <div className="cd" style={{ marginBottom: 16, padding: 22, borderLeft: '3px solid var(--signal)' }}>
          <div className="rw" style={{ marginBottom: 6 }}>
            <div className="lb">Crédito Habitação (exemplo)</div>
            <div className="chip down-solid">13,8%</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18 }}>Bankinter · Taxa Fixa 2,7%</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--signal)', letterSpacing: '-0.02em' }}>{fm(77555.06)}</div>
          <div className="lb" style={{ marginTop: 4 }}>Capital em dívida</div>
        </div>
      )}

      {/* ── A minha casa (autenticado) ── */}
      {!preview && h && (
        <div className="cd" style={{ marginBottom: 16, padding: 22 }}>
          <div className="rw" style={{ marginBottom: 14 }}>
            <div className="lb">A minha casa</div>
            <button type="button" onClick={() => open('housing')} className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Editar crédito habitação">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
            </button>
          </div>

          {/* Taxa de esforço */}
          {h.rendimentoAgregado > 0 && h.prestacao > 0 && (() => {
            const pct = effortRate(h.prestacao, h.rendimentoAgregado);
            return (
              <div style={{ marginBottom: 16 }}>
                <div className="rw" style={{ marginBottom: 6 }}>
                  <span className="lb">Taxa de esforço</span>
                  <span className="m" style={{ fontSize: 14, fontWeight: 700, color: effortColor(pct) }}>{pct.toFixed(0)}% · {effortLabel(pct)}</span>
                </div>
                <div className="bar" style={{ height: 8, background: 'var(--bg3)' }}>
                  <div className="bar-fill" style={{ width: Math.min(pct, 100) + '%', background: effortColor(pct) }} />
                </div>
                <div className="m" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5 }}>
                  {mv(h.prestacao)}/mês de {mv(h.rendimentoAgregado)} de rendimento
                </div>
              </div>
            );
          })()}

          <Row label="Valor de aquisição" value={mv(h.valorAquisicao)} />
          <Row label="Empréstimo bancário" value={mv(h.valorEmprestimo)} />
          <Row label="Capitais próprios" value={mv(h.capitaisProprios)} />
          <Row label="Impostos na compra (IMT+IS)" value={mv(h.impostos)} />
          {h.dataAquisicao && <Row label="Data de aquisição" value={h.dataAquisicao} />}
          {h.taxaJuro > 0 && <Row label="Taxa de juro" value={(h.taxaJuro).toString().replace('.', ',') + '%'} />}
          {h.prazoAnos > 0 && <Row label="Prazo" value={h.prazoAnos + ' anos'} />}
          {h.prestacao > 0 && <Row label="Prestação mensal" value={mv(h.prestacao)} />}
        </div>
      )}

      {/* ── Autenticado sem casa → adicionar ── */}
      {!preview && !h && (
        <div className="cd" style={{ marginBottom: 16, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Sem crédito à habitação</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Regista a tua casa: aquisição, empréstimo, impostos, prestação e taxa de esforço.</div>
          <button type="button" onClick={() => open('housing')} style={{ padding: '12px 20px', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Adicionar crédito habitação
          </button>
        </div>
      )}

      {/* ── Simulador ── */}
      <div className="cd" style={{ padding: 20 }}>
        <div className="lb" style={{ marginBottom: 4 }}>Simulador · nova casa</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Estima prestação, juros e impostos de uma compra.</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Preço (EUR)</div>
            <input value={sim.preco} onChange={(e) => setS('preco', e.target.value)} inputMode="decimal" placeholder="300000" aria-label="Preço" style={simInput} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Entrada (EUR)</div>
            <input value={sim.entrada} onChange={(e) => setS('entrada', e.target.value)} inputMode="decimal" placeholder="60000" aria-label="Entrada" style={simInput} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Taxa juro (%)</div>
            <input value={sim.taxa} onChange={(e) => setS('taxa', e.target.value)} inputMode="decimal" placeholder="3,3" aria-label="Taxa de juro" style={simInput} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="lb" style={{ marginBottom: 6 }}>Prazo (anos)</div>
            <input value={sim.prazo} onChange={(e) => setS('prazo', e.target.value)} inputMode="decimal" placeholder="30" aria-label="Prazo" style={simInput} />
          </div>
        </div>
        <div style={{ marginBottom: 6 }}>
          <div className="lb" style={{ marginBottom: 6 }}>Rendimento do agregado / mês (EUR)</div>
          <input value={sim.rend} onChange={(e) => setS('rend', e.target.value)} inputMode="decimal" placeholder="3000" aria-label="Rendimento do agregado" style={simInput} />
        </div>

        {preco > 0 && (
          <div style={{ marginTop: 14, background: 'var(--elevated)', borderRadius: 14, padding: '14px 16px' }}>
            <div className="rw" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text3)' }}>Prestação mensal</span>
              <span className="m" style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{fm(simPrest)}</span>
            </div>
            <Row label="Montante a financiar" value={fm(financiado)} />
            <Row label="Total de juros" value={fm(simJuros)} />
            <Row label="Custo total do crédito" value={fm(financiado + simJuros)} />
            <Row label="Impostos na compra (IMT+IS)" value={fm(simImpostos)} />
            <Row label="Necessário à cabeça (entrada+impostos)" value={fm(entrada + simImpostos)} />
            {num(sim.rend) > 0 && (
              <div className="rw" style={{ padding: '9px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>Taxa de esforço</span>
                <span className="m" style={{ fontSize: 14, fontWeight: 700, color: effortColor(simEsforco) }}>{simEsforco.toFixed(0)}% · {effortLabel(simEsforco)}</span>
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>IMT estimado (HPP continente). Confirma os valores reais com o banco/notário.</div>
          </div>
        )}
      </div>
    </div>
  );
}
