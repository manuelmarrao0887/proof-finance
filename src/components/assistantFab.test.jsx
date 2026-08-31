/* AssistantFab — botão flutuante do assistente de IA, presente em todas as
   páginas do Shell (canto inferior direito, estilo "chat bubble").

   O ponto crítico validado aqui é o motivo do bug reportado pelo utilizador:
   ".fadeUp" (usado por 14 views) anima `transform`, e com
   `animation-fill-mode: both` o elemento fica com um transform não-`none`
   permanentemente — o que o torna containing block de qualquer descendente
   `position: fixed`, fazendo esse elemento saltar de posição quando a view
   re-anima (ex.: ao voltar de um sheet). Por isso o botão TEM de viver fora
   de qualquer `.fadeUp`, montado uma única vez, sem condicionar a sua
   montagem/desmontagem ao estado dos modais (é isso que garante estabilidade
   quando um sheet abre/fecha). Estes testes replicam essa garantia. */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, act, screen, fireEvent } from '@testing-library/react';
import { renderWithStore, captureConsole } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useUI, VALID_TABS } from '../store/ui.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));
vi.mock('../lib/lock.js', () => ({
  sha256Hex: () => Promise.resolve('abc'),
  isValidPin: (p) => /^\d{4}$/.test(String(p || '')),
  faceIdSupported: () => false,
  registerFaceId: () => Promise.resolve(null),
  verifyFaceId: () => Promise.resolve(false),
}));

import Shell from './Shell.jsx';

const FAB_LABEL = 'Abrir assistente de IA';
const IGNORE = [/not wrapped in act/i];
const realMsgs = (list) => list.filter((m) => !IGNORE.some((re) => re.test(m)));

// Lê o z-index real de .sheet-overlay em tokens.css em vez de o fixar a 150
// — se a folha de estilos mudar, este teste falha em vez de ficar obsoleto.
function readSheetOverlayZIndex() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const css = fs.readFileSync(path.resolve(dir, '../styles/tokens.css'), 'utf8');
  const m = css.match(/\.sheet-overlay\{[^}]*z-index:\s*(\d+)/);
  if (!m) throw new Error('Não encontrei z-index de .sheet-overlay em tokens.css — a regra mudou de forma.');
  return Number(m[1]);
}
const SHEET_OVERLAY_Z = readSheetOverlayZIndex();

// Espera que os chunks lazy (views/modais) resolvam — mesmo padrão do
// shell.nav.test.jsx (era flaky com um número fixo de ticks).
const settle = async () => {
  for (let i = 0; i < 40; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    if (i >= 2 && !document.body.textContent.includes('A carregar…')) return;
  }
};

function setViewportWidth(w) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  window.dispatchEvent(new Event('resize'));
}

let probeModals = null;
function ModalsProbe() {
  const { modals } = useUI();
  probeModals = modals;
  return null;
}

beforeEach(() => {
  // Desktop por omissão (>= breakpoint de 900px do DeviceProvider); os
  // testes de layout mobile forçam a largura explicitamente.
  setViewportWidth(1200);
});

afterEach(() => {
  cleanup();
  probeModals = null;
});

describe('AssistantFab — botão flutuante do assistente (presente em toda a app)', () => {
  it.each(VALID_TABS)('aparece na tab "%s"', async (tab) => {
    await renderWithStore(<Shell />, { fixture: richFixture(), tab });
    await settle();
    expect(screen.getByRole('button', { name: FAB_LABEL })).toBeInTheDocument();
  });

  it('clicar abre o assistente — verifica o estado do store, não só o handler', async () => {
    await renderWithStore(
      <>
        <Shell />
        <ModalsProbe />
      </>,
      { fixture: richFixture() }
    );
    await settle();
    expect(probeModals.assistant == null).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: FAB_LABEL }));

    expect(probeModals.assistant).toBeTruthy();
  });

  it('mantém-se estável — mesmo nó DOM, mesmo pai, mesma posição — depois de abrir e fechar um sheet', async () => {
    let uiRef;
    const cap = captureConsole();
    try {
      await renderWithStore(<Shell />, { fixture: richFixture(), onReady: ({ ui }) => (uiRef = ui) });
      await settle();

      const before = screen.getByRole('button', { name: FAB_LABEL });
      const parentBefore = before.parentElement;
      const indexBefore = Array.from(parentBefore.children).indexOf(before);

      await act(async () => uiRef.open('add'));
      await settle();
      await act(async () => uiRef.close('add'));
      await settle();

      const after = screen.getByRole('button', { name: FAB_LABEL });
      expect(after).toBe(before); // nó DOM idêntico: nunca foi desmontado/remontado
      expect(after.parentElement).toBe(parentBefore);
      expect(Array.from(parentBefore.children).indexOf(after)).toBe(indexBefore);
    } finally {
      cap.restore();
    }
    // Abrir/fechar o sheet não deve gerar avisos do React (keys, act, props
    // inválidas) — confirmaria uma desmontagem/remontagem mal-feita mesmo
    // quando a asserção de identidade acima, por alguma razão, não a apanhasse.
    expect(realMsgs(cap.errors)).toEqual([]);
    expect(realMsgs(cap.warns)).toEqual([]);
  });

  it('nunca é descendente de um elemento com a classe "fadeUp" (guarda estrutural)', async () => {
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await settle();
    const btn = screen.getByRole('button', { name: FAB_LABEL });
    let el = btn.parentElement;
    let sawAncestors = false;
    while (el) {
      sawAncestors = true;
      const cls = typeof el.className === 'string' ? el.className : '';
      expect(cls).not.toMatch(/\bfadeUp\b/);
      el = el.parentElement;
    }
    expect(sawAncestors).toBe(true); // garante que o loop realmente correu
  });

  it('o wrapper fica sempre abaixo do sheet-overlay (z-index 70 < valor real de .sheet-overlay)', async () => {
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await settle();
    const btn = screen.getByRole('button', { name: FAB_LABEL });
    const wrap = btn.parentElement;
    expect(wrap.style.zIndex).toBe('70');
    expect(Number(wrap.style.zIndex)).toBeLessThan(SHEET_OVERLAY_Z);
  });

  it('o wrapper cobre o viewport (position:fixed com top/bottom, não só left/right)', async () => {
    // Um fixed sem top/bottom colapsa a altura a 0 (o único filho é
    // position:absolute e não contribui para a altura do pai) e cai no
    // algoritmo de "static position" — o wrapper (e o botão lá dentro)
    // rendeririam fora do ecrã. Ver AssistantFab.jsx.
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await settle();
    const btn = screen.getByRole('button', { name: FAB_LABEL });
    const wrap = btn.parentElement;
    expect(wrap.style.position).toBe('fixed');
    expect(wrap.style.top).toBe('0px');
    expect(wrap.style.bottom).toBe('0px');
    expect(wrap.style.left).toBe('0px');
    expect(wrap.style.right).toBe('0px');
    expect(btn.style.position).toBe('absolute');
  });

  it('layout mobile: afasta-se da bottom nav e usa a coluna de 480px', async () => {
    setViewportWidth(500);
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await settle();
    const btn = screen.getByRole('button', { name: FAB_LABEL });
    const wrap = btn.parentElement;
    expect(wrap.style.position).toBe('fixed');
    expect(wrap.style.top).toBe('0px');
    expect(btn.style.position).toBe('absolute');
    expect(btn.style.bottom).toMatch(/--nav-h/);
    expect(wrap.style.maxWidth).toBe('480px');
  });

  it('layout desktop: sem o clamp de 480px e com offset de fundo menor (sem bottom nav)', async () => {
    setViewportWidth(1200);
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await settle();
    const btn = screen.getByRole('button', { name: FAB_LABEL });
    const wrap = btn.parentElement;
    expect(wrap.style.position).toBe('fixed');
    expect(wrap.style.top).toBe('0px');
    expect(btn.style.position).toBe('absolute');
    expect(btn.style.bottom).not.toMatch(/--nav-h/);
    expect(wrap.style.maxWidth === 'none' || wrap.style.maxWidth === '').toBe(true);
  });

  it('tem nome acessível em português', async () => {
    await renderWithStore(<Shell />, { fixture: richFixture() });
    await settle();
    const btn = screen.getByRole('button', { name: FAB_LABEL });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('aria-label')).toBe(FAB_LABEL);
  });
});
