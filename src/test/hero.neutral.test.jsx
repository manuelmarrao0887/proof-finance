/* Task 21: Hero neutro, FAB do assistente distinto e glifo próprio
 *
 * Validações:
 * 1. `.hero` usa `background:var(--surface)` e `color:var(--fg)`, não `--grad-hero`
 * 2. `.assistant-fab` usa `background:var(--secondary)`
 * 3. `Icon.jsx` define o ícone `chat:`
 * 4. `QuickActions.jsx` usa `'chat'` em vez de `'sparkle'` para a IA
 * 5. `<Hero/>` e `<SpendHero/>` não contêm `rgba(255,255,255` nos estilos inline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import React from 'react';
import { renderWithStore } from './renderWithStore.jsx';
import { richFixture } from './fixtures.js';
import Hero from '../components/Hero.jsx';
import SpendHero from '../components/SpendHero.jsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readFile(relPath) {
  return fs.readFileSync(path.resolve(__dirname, relPath), 'utf8');
}

afterEach(() => {
  cleanup();
});

describe('Task 21: Hero neutro, FAB distinto e glifo chat', () => {
  describe('Arquivo: src/styles/tokens.css', () => {
    it('.hero deve usar background:var(--surface) em vez de --grad-hero', () => {
      const css = readFile('../styles/tokens.css');
      expect(css).toContain('.hero{position:relative;background:var(--surface)');
      expect(css).not.toContain('.hero{position:relative;background:var(--grad-hero)');
    });

    it('.hero deve ter color:var(--fg)', () => {
      const css = readFile('../styles/tokens.css');
      expect(css).toContain('background:var(--surface);color:var(--fg)');
    });

    it('.assistant-fab deve usar background:var(--secondary)', () => {
      const css = readFile('../styles/tokens.css');
      expect(css).toContain('.assistant-fab{width:54px;height:54px;border-radius:999px;background:var(--secondary)');
    });

    it('tokens.css deve definir --secondary em modo light', () => {
      const css = readFile('../styles/tokens.css');
      expect(css).toContain('--secondary:');
    });

    it('tokens.css deve definir --secondary em modo dark', () => {
      const css = readFile('../styles/tokens.css');
      const matches = css.match(/--secondary:/g);
      expect(matches).toBeTruthy();
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Arquivo: src/components/Icon.jsx', () => {
    it('Icon.jsx deve definir o ícone chat:', () => {
      const src = readFile('../components/Icon.jsx');
      expect(src).toContain('chat:');
    });

    it('o ícone chat deve conter a path com o SVG correto', () => {
      const src = readFile('../components/Icon.jsx');
      expect(src).toContain('M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z');
    });
  });

  describe('Arquivo: src/components/QuickActions.jsx', () => {
    it('QuickActions deve usar chat para a ação assistant', () => {
      const src = readFile('../components/QuickActions.jsx');
      expect(src).toContain("icon: 'chat'");
    });

    it('QuickActions não deve usar sparkle para a ação assistant', () => {
      const src = readFile('../components/QuickActions.jsx');
      const assistantLine = src.split('\n').find(line => line.includes("key: 'assistant'"));
      expect(assistantLine).toBeTruthy();
      expect(assistantLine).toContain("icon: 'chat'");
      expect(assistantLine).not.toContain("icon: 'sparkle'");
    });
  });

  describe('Arquivo: src/components/AssistantFab.jsx', () => {
    it('AssistantFab deve usar o ícone chat', () => {
      const src = readFile('../components/AssistantFab.jsx');
      expect(src).toContain('name="chat"');
    });
  });

  describe('Renderização: componentes sem rgba(255,255,255', () => {
    it('<Hero/> não deve conter rgba(255,255,255 nos estilos inline', async () => {
      const { container } = await renderWithStore(<Hero />, {
        fixture: richFixture(),
      });
      const html = container.innerHTML;
      expect(html).not.toContain('rgba(255,255,255');
      expect(html).not.toContain('rgba(255, 255, 255');
    });

    it('<SpendHero/> não deve conter rgba(255,255,255 nos estilos inline', async () => {
      const { container } = await renderWithStore(<SpendHero />, {
        fixture: richFixture(),
      });
      const html = container.innerHTML;
      expect(html).not.toContain('rgba(255,255,255');
      expect(html).not.toContain('rgba(255, 255, 255');
    });
  });
});
