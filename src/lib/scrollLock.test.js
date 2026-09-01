/* ════════════════════════════════════════════════════════════════════════
   Regressão do bloqueio de scroll (bug "a página desformata quando abro um
   popup"). Comprovado em Chrome real: com uma sheet aberta a roda do rato
   sobre o backdrop continuava a fazer scroll ao conteúdo de trás
   (scrollTop 250 -> 650), e ao fechar a sheet o utilizador ficava noutro
   sítio da página.

   Requisitos que estes testes fixam:
   1. lockScroll() trava o scroller da raiz E o scroller do modo desktop
      (.dcontent).
   2. É contado por referência: sheets empilhadas só desbloqueiam na última.
   3. Repõe EXATAMENTE os estilos inline que existiam antes (não inventa).
   4. Compensa a largura da scrollbar clássica para o conteúdo não saltar —
      mas NÃO compensa quando o browser suporta scrollbar-gutter:stable
      (aí a goteira já está reservada e compensar seria o próprio salto).
   ════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { lockScroll, unlockScroll, isScrollLocked, __resetScrollLock } from './scrollLock.js';

const html = () => document.documentElement;
const body = () => document.body;

// jsdom não implementa CSS.supports — instalamos um duplo controlável.
function stubGutterSupport(value) {
  Object.defineProperty(globalThis, 'CSS', {
    value: { ...(globalThis.CSS || {}), supports: () => value },
    configurable: true,
    writable: true,
  });
}

function setScrollbarWidth(px) {
  // window.innerWidth - documentElement.clientWidth = largura da scrollbar clássica
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true, writable: true });
  Object.defineProperty(html(), 'clientWidth', { value: 1000 - px, configurable: true });
}

describe('scrollLock', () => {
  beforeEach(() => {
    __resetScrollLock();
    html().style.overflow = '';
    body().style.overflow = '';
    body().style.paddingRight = '';
    document.querySelectorAll('.dcontent').forEach((el) => el.remove());
    setScrollbarWidth(0);
  });

  afterEach(() => {
    __resetScrollLock();
    vi.restoreAllMocks();
  });

  it('trava e destrava o scroller da raiz', () => {
    expect(isScrollLocked()).toBe(false);
    lockScroll();
    expect(isScrollLocked()).toBe(true);
    expect(html().style.overflow).toBe('hidden');
    expect(body().style.overflow).toBe('hidden');
    unlockScroll();
    expect(isScrollLocked()).toBe(false);
    expect(html().style.overflow).toBe('');
    expect(body().style.overflow).toBe('');
  });

  it('trava também o scroller do modo desktop (.dcontent)', () => {
    const d = document.createElement('div');
    d.className = 'dcontent';
    body().appendChild(d);
    lockScroll();
    expect(d.style.overflow).toBe('hidden');
    unlockScroll();
    expect(d.style.overflow).toBe('');
    d.remove();
  });

  it('conta referências: duas sheets abertas, só a última destrava', () => {
    lockScroll();
    lockScroll();
    unlockScroll();
    expect(isScrollLocked()).toBe(true);
    expect(html().style.overflow).toBe('hidden');
    unlockScroll();
    expect(isScrollLocked()).toBe(false);
    expect(html().style.overflow).toBe('');
  });

  it('unlock a mais não deixa o contador negativo nem desfaz um lock seguinte', () => {
    unlockScroll();
    unlockScroll();
    expect(isScrollLocked()).toBe(false);
    lockScroll();
    expect(html().style.overflow).toBe('hidden');
    unlockScroll();
    expect(html().style.overflow).toBe('');
  });

  it('repõe estilos inline que já existiam antes do lock', () => {
    html().style.overflow = 'scroll';
    body().style.overflow = 'visible';
    body().style.paddingRight = '7px';
    lockScroll();
    unlockScroll();
    expect(html().style.overflow).toBe('scroll');
    expect(body().style.overflow).toBe('visible');
    expect(body().style.paddingRight).toBe('7px');
  });

  it('compensa a scrollbar clássica quando scrollbar-gutter não é suportado', () => {
    stubGutterSupport(false);
    setScrollbarWidth(15);
    lockScroll();
    expect(body().style.paddingRight).toContain('15px');
    unlockScroll();
    expect(body().style.paddingRight).toBe('');
  });

  it('NÃO compensa quando scrollbar-gutter:stable é suportado (a goteira já existe)', () => {
    stubGutterSupport(true);
    setScrollbarWidth(15);
    lockScroll();
    expect(body().style.paddingRight).toBe('');
    unlockScroll();
  });

  it('não compensa em ecrãs sem scrollbar clássica (telemóvel)', () => {
    stubGutterSupport(false);
    setScrollbarWidth(0);
    lockScroll();
    expect(body().style.paddingRight).toBe('');
    unlockScroll();
  });
});
