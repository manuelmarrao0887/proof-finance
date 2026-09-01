/* ════════════════════════════════════════════════════════════════════════
   Bloqueio de scroll do fundo enquanto há sheets / menus abertos.

   PORQUÊ: sem isto, com uma sheet aberta a roda do rato (ou o dedo) sobre o
   backdrop continuava a fazer scroll ao conteúdo por baixo — verificado em
   Chrome real, scrollTop 250 -> 650 com a sheet aberta. Ao fechar, o
   utilizador aparecia noutro ponto da página: é o efeito de "a app
   desformatar quando abre um popup".

   COMO: overflow:hidden nos dois scrollers possíveis — a raiz (modo
   telemóvel) e .dcontent (modo desktop). overflow:hidden preserva a posição
   de scroll (ao contrário do truque body{position:fixed}), por isso não há
   salto nem ao abrir nem ao fechar.

   SEM SALTO LATERAL: esconder a barra de scroll clássica alarga o conteúdo
   em ~15px. Quando o browser suporta `scrollbar-gutter: stable` (aplicado em
   tokens.css) a goteira já está sempre reservada e não há nada a compensar;
   nos browsers antigos compensa-se com padding-right — somado ao safe-area
   para não o apagar.

   Contagem por referência: sheets empilhadas (ex.: Grupos -> Despesa de
   grupo) só desbloqueiam na última a fechar.
   ════════════════════════════════════════════════════════════════════════ */

let depth = 0;
let restore = null;

function supportsGutter() {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('scrollbar-gutter', 'stable');
  } catch {
    return false;
  }
}

export function lockScroll() {
  if (typeof document === 'undefined') return;
  depth += 1;
  if (depth > 1) return; // já bloqueado por uma sheet de baixo

  const html = document.documentElement;
  const body = document.body;
  const panes = Array.from(document.querySelectorAll('.dcontent'));

  restore = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPadRight: body.style.paddingRight,
    panes: panes.map((el) => [el, el.style.overflow]),
  };

  // Largura da barra de scroll clássica (0 em telemóvel e em barras overlay).
  const gap = window.innerWidth - html.clientWidth;
  if (gap > 0 && !supportsGutter()) {
    body.style.paddingRight = `calc(var(--safe-right) + ${gap}px)`;
  }

  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  panes.forEach((el) => {
    el.style.overflow = 'hidden';
  });
}

export function unlockScroll() {
  if (typeof document === 'undefined') return;
  if (depth === 0) return; // unlock a mais: ignorar (não deixar contador negativo)
  depth -= 1;
  if (depth > 0) return; // ainda há sheets abertas por baixo

  const html = document.documentElement;
  const body = document.body;
  if (restore) {
    html.style.overflow = restore.htmlOverflow;
    body.style.overflow = restore.bodyOverflow;
    body.style.paddingRight = restore.bodyPadRight;
    restore.panes.forEach(([el, ov]) => {
      el.style.overflow = ov;
    });
  }
  restore = null;
}

export function isScrollLocked() {
  return depth > 0;
}

// Só para testes: repõe o contador entre casos.
export function __resetScrollLock() {
  depth = 0;
  restore = null;
}
