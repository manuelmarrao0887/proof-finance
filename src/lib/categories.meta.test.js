import { describe, it, expect } from 'vitest';
import { catMeta, CAT_META, PICKER_ICONS, PICKER_COLORS, GOAL_ICONS, ICON_LABELS, COLOR_LABELS } from './categories.js';

describe('catMeta', () => {
  it('Compras usa saco, Supermercado usa carrinho', () => {
    expect(catMeta('comp').icon).toBe('bag');
    expect(catMeta('sup').icon).toBe('cart');
  });
  it('item com icon/color sobrepõe os defaults; campos vazios não', () => {
    expect(catMeta('rest', { icon: 'plane', color: '#123456' })).toEqual({ icon: 'plane', color: '#123456' });
    expect(catMeta('rest', { icon: '', color: '' })).toEqual(CAT_META.rest);
    expect(catMeta('xyz', { icon: 'person' })).toEqual({ icon: 'person', color: '#9aa3b5' });
  });
  it('listas de seleção não estão vazias e não têm duplicados', () => {
    [PICKER_ICONS, GOAL_ICONS, PICKER_COLORS].forEach((l) => {
      expect(l.length).toBeGreaterThan(5);
      expect(new Set(l).size).toBe(l.length);
    });
  });
  it('cada ícone e cor dos seletores tem rótulo em português', () => {
    // Sem rótulo, o botão anunciava "Ícone shieldCheck" ou "Cor #3b6fee".
    [...PICKER_ICONS, ...GOAL_ICONS].forEach((ic) => {
      expect(ICON_LABELS[ic], ic).toBeTruthy();
      expect(ICON_LABELS[ic], ic).not.toBe(ic); // rótulo PT, não o id interno em inglês
    });
    PICKER_COLORS.forEach((c) => {
      expect(COLOR_LABELS[c], c).toBeTruthy();
      expect(COLOR_LABELS[c], c).not.toContain('#');
    });
    // Dentro de cada seletor os nomes acessíveis têm de ser distintos.
    [PICKER_ICONS, GOAL_ICONS].forEach((l) => {
      const labels = l.map((ic) => ICON_LABELS[ic]);
      expect(new Set(labels).size).toBe(labels.length);
    });
    expect(new Set(PICKER_COLORS.map((c) => COLOR_LABELS[c])).size).toBe(PICKER_COLORS.length);
  });
});
