import { describe, it, expect } from 'vitest';
import { normalizeDesc, applySameBeneficiaryCategory, dedupeAddedExp, dayAmountKey, expenseKey } from './dedupe.js';

describe('dayAmountKey (dup por dia+valor, ignora descrição)', () => {
  it('mesmo dia+valor com descrições diferentes → mesma chave', () => {
    const a = dayAmountKey({ desc: 'PINGO DOCE', amount: 12.5, date: '2026-06-10' });
    const b = dayAmountKey({ desc: 'Supermercado manual', amount: 12.5, date: '2026-06-10' });
    expect(a).toBe(b);
  });
  it('valor ou data diferente → chave diferente', () => {
    const base = dayAmountKey({ desc: 'X', amount: 10, date: '2026-06-10' });
    expect(dayAmountKey({ desc: 'X', amount: 11, date: '2026-06-10' })).not.toBe(base);
    expect(dayAmountKey({ desc: 'X', amount: 10, date: '2026-06-11' })).not.toBe(base);
  });
  it('expenseKey (exato) distingue descrições; dayAmountKey não', () => {
    const x = { desc: 'A', amount: 5, date: '2026-06-10' };
    const y = { desc: 'B', amount: 5, date: '2026-06-10' };
    expect(expenseKey(x)).not.toBe(expenseKey(y));
    expect(dayAmountKey(x)).toBe(dayAmountKey(y));
  });
});

describe('dedupeAddedExp', () => {
  it('removes exact duplicates', () => {
    const list = [
      { desc: 'VivaGym', amount: 35.9, cat: 'gym', date: '2026-06-05' },
      { desc: 'VivaGym', amount: 35.9, cat: 'gym', date: '2026-06-05' },
    ];
    expect(dedupeAddedExp(list)).toHaveLength(1);
  });
  it('merges legacy DD.MM with its ISO twin (same desc/amount/date)', () => {
    const list = [
      { desc: 'VivaGym', amount: 35.9, cat: 'gym', date: '2026-06-05' },
      { desc: 'VIVAGYM', amount: 35.9, cat: 'gym', date: '05.06' },
    ];
    const out = dedupeAddedExp(list);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-06-05'); // kept entry has ISO date
  });
  it('keeps genuinely different dates apart', () => {
    const list = [
      { desc: 'VivaGym', amount: 35.9, cat: 'gym', date: '2026-04-08' },
      { desc: 'VivaGym', amount: 35.9, cat: 'gym', date: '2026-06-05' },
    ];
    expect(dedupeAddedExp(list)).toHaveLength(2);
  });
  it('normalizes dates on kept entries', () => {
    const out = dedupeAddedExp([{ desc: 'X', amount: 1, date: '05.06' }]);
    expect(out[0].date).toMatch(/^\d{4}-06-05$/);
  });
});

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
