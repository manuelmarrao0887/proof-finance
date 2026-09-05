/* ════════════════════════════════════════════════════════════════════════
   SpendHero — o hero do Resumo: "Podes gastar hoje".

   O património líquido é um número que não se decide; o que se decide é
   quanto gastar hoje. Por isso o topo do Resumo passa a ser o allowance
   diário (dailyAllowance), com UMA frase de agência a fechar — o que fazer
   com o ritmo atual (monthForecast) — em vez de três indicadores mudos.

   O património continua a existir: a Hero antiga fica para os Gráficos
   (Task 11). O `.hero` é a mesma superfície (Task 21 volta a estilizá-la).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { dailyAllowance, monthForecast } from '../lib/pulse.js';
import { fm, fc, mask } from '../lib/format.js';

const MONTHS_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function SpendHero() {
  const { state, currentUser } = useStore();
  const { open } = useUI();
  const s = useMemo(() => ({ ...state, currentUser }), [state, currentUser]);
  const allow = useMemo(() => dailyAllowance(s), [s]);
  const forecast = useMemo(() => monthForecast(s), [s]);
  const hidden = !!state.balancesHidden;
  const month = MONTHS_LONG[new Date().getMonth()];

  return (
    <div className="hero fadeUp" style={{ margin: '6px 20px 16px' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.85,
          position: 'relative',
          zIndex: 1,
        }}
      >
        Podes gastar hoje
      </div>

      {allow.ready ? (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="m" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 6 }}>
            {mask(Math.max(0, allow.perDay), hidden, fm)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
            por dia · {allow.daysLeft} {allow.daysLeft === 1 ? 'dia' : 'dias'} até ao fim de {month}
          </div>

          {/* Barra: gasto + fixas por pagar vs rendimento. Com saldos ocultos
              colapsa numa faixa única — a largura dos segmentos revelaria a
              distribuição do orçamento sem passar por texto nenhum. */}
          <div
            style={{ display: 'flex', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.22)', overflow: 'hidden', marginTop: 14 }}
            aria-hidden="true"
          >
            {hidden ? (
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.4)' }} />
            ) : (
              <>
                <div style={{ width: Math.min(100, (allow.spent / Math.max(1, allow.income)) * 100) + '%', background: '#fff' }} />
                <div style={{ width: Math.min(100, (allow.pendingFixed / Math.max(1, allow.income)) * 100) + '%', background: 'rgba(255,255,255,0.55)' }} />
              </>
            )}
          </div>

          {/* UMA frase, e com agência: diz o que muda se o ritmo continuar. */}
          {forecast.dailyBurn > 0 && (
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10, lineHeight: 1.45 }}>
              {forecast.overBudget
                ? 'Faltam-te ' + mask(-forecast.projectedEnd, hidden, fc) +
                  ' para fechar dentro do rendimento a este ritmo (' + mask(forecast.dailyBurn, hidden, fc) + '/dia)'
                : 'A este ritmo fechas o mês com ' + mask(forecast.projectedEnd, hidden, fc) + ' de sobra'}
            </div>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, opacity: 0.9, margin: '10px 0 14px', lineHeight: 1.45 }}>
            Regista o teu rendimento mensal para saber quanto podes gastar por dia.
          </div>
          <button
            type="button"
            onClick={() => open('income')}
            style={{
              padding: '9px 18px',
              border: 'none',
              background: 'rgba(255,255,255,0.9)',
              color: 'var(--primary)',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            + Adicionar rendimento
          </button>
        </div>
      )}
    </div>
  );
}
