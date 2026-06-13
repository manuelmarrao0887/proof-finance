import { describe, it, expect } from 'vitest';
import { sortedCats } from './categories.js';

describe('sortedCats', () => {
  it('sorts categories alphabetically by nm (pt collation)', () => {
    const bdg = [
      { id: 'out', nm: 'Outros', lm: 30 },
      { id: 'ani', nm: 'Animais', lm: 105 },
      { id: 'sup', nm: 'Supermercado', lm: 250 },
      { id: 'car', nm: 'Carro', lm: 55 },
    ];
    const out = sortedCats(bdg);
    expect(out.map((c) => c.nm)).toEqual(['Animais', 'Carro', 'Outros', 'Supermercado']);
  });

  it('does not mutate the input array', () => {
    const bdg = [
      { id: 'b', nm: 'Beta', lm: 1 },
      { id: 'a', nm: 'Alpha', lm: 1 },
    ];
    const copy = bdg.slice();
    sortedCats(bdg);
    expect(bdg).toEqual(copy);
  });

  it('handles non-array input gracefully', () => {
    expect(sortedCats(null)).toEqual([]);
    expect(sortedCats(undefined)).toEqual([]);
  });

  it('orders accented Portuguese names correctly (Agua before Beta)', () => {
    const bdg = [
      { id: 'b', nm: 'Beta', lm: 1 },
      { id: 'a', nm: 'Água', lm: 1 },
    ];
    expect(sortedCats(bdg).map((c) => c.nm)).toEqual(['Água', 'Beta']);
  });
});
