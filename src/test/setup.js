/* Setup global do vitest para testes de UI (jsdom). */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom não tem matchMedia; a app guarda-se com `window.matchMedia &&` mas
// alguns componentes chamam-no directamente.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
// confirm() nos testes: aceita sempre (remoções etc.)
if (typeof window !== 'undefined') window.confirm = vi.fn(() => true);
// scrollTo / scrollIntoView não existem no jsdom
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn();
  if (window.HTMLElement && !window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  }
}
