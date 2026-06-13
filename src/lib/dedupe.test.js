import { describe, it, expect } from 'vitest';
import { normalizeDesc, applySameBeneficiaryCategory } from './dedupe.js';

describe('normalizeDesc', () => {
  it('lowercases, trims, and collapses internal whitespace', () => {
    expect(normalizeDesc('  Pingo   Doce  ')).toBe('pingo doce');
    expect(normalizeDesc('MCDONALDS')).toBe('mcdonalds');
    expect(normalizeDesc('Café\tCentral')).toBe('café central');
  });

  it('handles null/undefined safely', () => {
    expect(normalizeDesc(null)).toBe('');
    expect(normalizeDesc(undefined)).toBe('');
  });
});

describe('applySameBeneficiaryCategory', () => {
  it('sets the chosen category on every row sharing the normalized desc (category key)', () => {
    const list = [
      { desc: 'Pingo Doce', category: 'out' },
      { desc: 'pingo  doce', category: 'rest' },
      { desc: 'Galp', category: 'out' },
    ];
    const out = applySameBeneficiaryCategory(list, 0, 'sup');
    expect(out[0].category).toBe('sup');
    expect(out[1].category).toBe('sup'); // same beneficiary, normalized match
    expect(out[2].category).toBe('out'); // different beneficiary untouched
  });

  it('supports the cat key name (addedExp list)', () => {
    const list = [
      { desc: 'Netflix', cat: 'out' },
      { desc: 'NETFLIX', cat: 'out' },
      { desc: 'Spotify', cat: 'sub' },
    ];
    const out = applySameBeneficiaryCategory(list, 0, 'sub', 'cat');
    expect(out[0].cat).toBe('sub');
    expect(out[1].cat).toBe('sub');
    expect(out[2].cat).toBe('sub'); // unchanged but already sub
  });

  it('returns a NEW list and does not mutate the input', () => {
    const list = [
      { desc: 'A', category: 'x' },
      { desc: 'A', category: 'x' },
    ];
    const out = applySameBeneficiaryCategory(list, 0, 'y');
    expect(out).not.toBe(list);
    expect(list[0].category).toBe('x'); // original untouched
    expect(out[0].category).toBe('y');
    expect(out[1].category).toBe('y');
  });

  it('returns the original list for out-of-range idx', () => {
    const list = [{ desc: 'A', category: 'x' }];
    expect(applySameBeneficiaryCategory(list, 5, 'y')).toBe(list);
    expect(applySameBeneficiaryCategory(list, -1, 'y')).toBe(list);
  });
});
