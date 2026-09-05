/* ════════════════════════════════════════════════════════════════════════
   Cor — utilitários WCAG: luminância relativa e razão de contraste.
   Usado para escolher a cor do texto sobre um fundo dinâmico (avatares) e
   para os testes de contraste AA dos tokens (Task 22).
   ════════════════════════════════════════════════════════════════════════ */

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Luminância relativa (0..1) de uma cor hex (#rgb ou #rrggbb), fórmula WCAG. */
export function luminance(hex) {
  const h = String(hex || '').trim().replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste WCAG entre duas cores hex (1..21). */
export function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
