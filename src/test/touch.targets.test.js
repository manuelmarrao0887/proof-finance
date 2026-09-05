import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(dir, '..', p), 'utf8');
describe('alvos de toque', () => {
  it('.icon-btn tem 44px e a barra 11px', () => {
    const css = read('styles/tokens.css');
    expect(css).toMatch(/\.icon-btn\{[^}]*width:44px;height:44px/);
    expect(css).toMatch(/\.bnav-btn\{[^}]*font-size:11px/);
    expect(css).toMatch(/\.sugg button\{[^}]*min-height:40px/);
  });
  for (const f of ['views/GoalsView.jsx', 'views/OverviewView.jsx', 'views/CardsView.jsx']) {
    it(f + ' não encolhe icon-btn abaixo de 44', () => {
      expect(read(f).match(/className="icon-btn"[^>]*style=\{\{[^}]*(width|height):\s*(2\d|3\d)\b/g) || []).toEqual([]);
    });
  }
});
