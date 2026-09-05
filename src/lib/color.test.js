// Contraste AA (Task 22): branco sobre --primary-cta e --primary como texto
// sobre --bg têm de atingir ≥4,5:1 nos dois temas. Lê tokens.css do disco em
// vez de fixar os valores, para o teste falhar se a folha de estilos mudar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { contrast } from './color.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.resolve(dir, '../styles/tokens.css'), 'utf8');

const tok = (block, name) => (block.match(new RegExp(name + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
const dark = css.slice(css.indexOf('html[data-theme="dark"]{'));
const light = css.slice(0, css.indexOf('html[data-theme="dark"]{'));

describe('contraste AA', () => {
  it('branco sobre --primary-cta ≥ 4,5 nos dois temas', () => {
    expect(contrast('#ffffff', tok(light, '--primary-cta'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', tok(dark, '--primary-cta'))).toBeGreaterThanOrEqual(4.5);
  });
  it('--primary como texto sobre --bg ≥ 4,5 nos dois temas', () => {
    expect(contrast(tok(light, '--primary'), tok(light, '--bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok(dark, '--primary'), tok(dark, '--bg'))).toBeGreaterThanOrEqual(4.5);
  });
  // Glifo branco do .assistant-fab sobre --secondary no escuro (pedido da
  // revisão da Task 21): era 3,08:1 com #9a82f0, agora ≥4,5:1.
  it('branco sobre --secondary ≥ 4,5 no escuro', () => {
    expect(contrast('#ffffff', tok(dark, '--secondary'))).toBeGreaterThanOrEqual(4.5);
  });
});
