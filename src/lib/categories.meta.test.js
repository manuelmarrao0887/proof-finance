import { describe, it, expect } from 'vitest';
import { catMeta, CAT_META, PICKER_ICONS, PICKER_COLORS, GOAL_ICONS } from './categories.js';

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
});
