/* ════════════════════════════════════════════════════════════════════════
   T212View — carteira Trading212: base de custo, valor atual, ganho total
   acumulado (valorAtual − baseCusto) + histórico de leituras. Área simples e
   separada da tab "Investimentos" (que tem posições por ativo) — aqui há uma
   carteira só, sem sub-contas a desambiguar. Respeita o ocultar-saldos.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { fc, fmDateShort } from '../lib/format.js';
import { latestT212, t212History, t212Gain, t212GainPct } from '../lib/trading212.js';

export default function T212View() {
  const { state } = useStore();
  const { open } = useUI();
  const log = state.t212Log || [];
  const hidden = !!state.balancesHidden;
  const mv = (v) => (hidden ? '••••' : fc(v));

  const latest = latestT212(log);
  const gain = t212Gain(latest);
  const gainPct = t212GainPct(latest);
  const history = t212History(log).reverse(); // mais recente primeiro
  const gainColor = gain == null ? 'var(--text2)' : gain >= 0 ? 'var(--success)' : 'var(--signal)';

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      <div className="cd" style={{ marginBottom: 16 }}>
        <div className="rw">
          <div className="lb">Valor atual</div>
          <button
            type="button"
            onClick={() => open('t212Update')}
            style={{ padding: '7px 12px', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Atualizar
          </button>
        </div>
        <div className="m" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>
          {latest ? mv(latest.valorAtual) : '—'}
        </div>
        {latest && !hidden && (
          <div className="m" style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: gainColor }}>
            {(gain >= 0 ? '+' : '') + fc(gain)}
            {gainPct != null ? ' (' + (gain >= 0 ? '+' : '') + gainPct.toFixed(1) + '%)' : ''}
          </div>
        )}
        {latest && (
          <div className="lb" style={{ marginTop: 6 }}>
            Base de custo: {mv(latest.baseCusto)} · atualizado {fmDateShort(latest.date, true)}
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div className="empty" style={{ padding: '40px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sem leituras</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Toca em "Atualizar" e introduz a base de custo e o valor atual da carteira.</div>
        </div>
      ) : (
        <>
          <div className="lb" style={{ marginBottom: 8 }}>Histórico</div>
          {history.map((r) => {
            const g = t212Gain(r);
            const gPct = t212GainPct(r);
            return (
              <div key={r.id} className="cd" style={{ marginBottom: 8, padding: '12px 16px' }}>
                <div className="rw">
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{fmDateShort(r.date, true)}</span>
                  <span className="m" style={{ fontSize: 14, fontWeight: 700 }}>{mv(r.valorAtual)}</span>
                </div>
                {!hidden && (
                  <div className="rw" style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>Base: {mv(r.baseCusto)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: g >= 0 ? 'var(--success)' : 'var(--signal)' }}>
                      {(g >= 0 ? '+' : '') + fc(g)}
                      {gPct != null ? ' (' + (g >= 0 ? '+' : '') + gPct.toFixed(1) + '%)' : ''}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
