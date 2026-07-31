/* ════════════════════════════════════════════════════════════════════════
   Sparkline — mini-gráfico de tendência (SVG puro, sem dependências).
   `values` do mais ANTIGO para o mais RECENTE. Desenha a linha + o último
   ponto. Sem eixos nem legenda: é um sinal, não um gráfico de análise.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export default function Sparkline({ values, width = 52, height = 18, color = 'var(--text3)', strokeWidth = 1.5 }) {
  const v = (values || []).map((x) => Number(x) || 0);
  if (v.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  const max = Math.max.apply(null, v);
  const min = Math.min.apply(null, v);
  const range = max - min || 1;
  const pad = strokeWidth;
  const stepX = (width - pad * 2) / (v.length - 1);
  const y = (val) => pad + (1 - (val - min) / range) * (height - pad * 2);

  const pts = v.map((val, i) => [pad + i * stepX, y(val)]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} viewBox={'0 0 ' + width + ' ' + height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.6} fill={color} />
    </svg>
  );
}
