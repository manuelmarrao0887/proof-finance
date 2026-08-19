import { describe, it, expect } from 'vitest';
import { toCents, fromCents, splitEqual, splitExact, splitPercent, resolveShares } from './split.js';

describe('toCents / fromCents', () => {
  it('converte sem erro de vírgula flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(137.35)).toBe(13735);
    expect(fromCents(13735)).toBe(137.35);
  });
});

describe('splitEqual', () => {
  it('divide exatamente quando dá', () => {
    const s = splitEqual(96, ['me', 'a', 'b', 'c'], 'me');
    expect(s.map((x) => x.amount)).toEqual([24, 24, 24, 24]);
  });

  it('o cêntimo que sobra vai para o pagador', () => {
    const s = splitEqual(10, ['me', 'a', 'b'], 'a');
    expect(s.find((x) => x.personId === 'a').amount).toBe(3.34);
    expect(s.find((x) => x.personId === 'me').amount).toBe(3.33);
    expect(s.find((x) => x.personId === 'b').amount).toBe(3.33);
  });

  it('os cêntimos que sobram seguem a ordem quando o pagador não participa', () => {
    const s = splitEqual(10, ['a', 'b', 'c'], 'me'); // pagador fora da lista
    expect(s.map((x) => x.amount)).toEqual([3.34, 3.33, 3.33]);
  });

  it('a soma das partes é sempre igual ao total', () => {
    for (const total of [0.01, 0.05, 7.77, 137.35, 1000.01]) {
      for (const n of [2, 3, 4, 5, 7]) {
        const ids = Array.from({ length: n }, (_, i) => 'p' + i);
        const s = splitEqual(total, ids, 'p0');
        const sum = s.reduce((acc, x) => acc + toCents(x.amount), 0);
        expect(sum).toBe(toCents(total));
      }
    }
  });

  it('sem participantes → lista vazia', () => {
    expect(splitEqual(10, [], 'me')).toEqual([]);
  });
});

describe('splitExact', () => {
  it('aceita valores que somam o total', () => {
    const r = splitExact(100, [{ personId: 'me', amount: 40 }, { personId: 'a', amount: 60 }]);
    expect(r.error).toBeNull();
    expect(r.shares).toEqual([{ personId: 'me', amount: 40 }, { personId: 'a', amount: 60 }]);
  });

  it('rejeita quando falta dinheiro e diz quanto', () => {
    const r = splitExact(100, [{ personId: 'me', amount: 40 }, { personId: 'a', amount: 50 }]);
    expect(r.shares).toBeNull();
    expect(r.error).toBe('Faltam 10,00 € para chegar ao total.');
  });

  it('rejeita quando sobra dinheiro e diz quanto', () => {
    const r = splitExact(100, [{ personId: 'me', amount: 70 }, { personId: 'a', amount: 50 }]);
    expect(r.shares).toBeNull();
    expect(r.error).toBe('Sobram 20,00 € face ao total.');
  });
});

describe('splitPercent', () => {
  it('converte percentagens em euros', () => {
    const r = splitPercent(200, [{ personId: 'me', percent: 25 }, { personId: 'a', percent: 75 }]);
    expect(r.error).toBeNull();
    expect(r.shares).toEqual([{ personId: 'me', amount: 50 }, { personId: 'a', amount: 150 }]);
  });

  it('o arredondamento nunca perde cêntimos', () => {
    const r = splitPercent(100, [
      { personId: 'me', percent: 33.33 },
      { personId: 'a', percent: 33.33 },
      { personId: 'b', percent: 33.34 },
    ]);
    const sum = r.shares.reduce((acc, x) => acc + toCents(x.amount), 0);
    expect(sum).toBe(10000);
  });

  it('rejeita quando não soma 100', () => {
    const r = splitPercent(100, [{ personId: 'me', percent: 30 }, { personId: 'a', percent: 60 }]);
    expect(r.shares).toBeNull();
    expect(r.error).toBe('As percentagens somam 90% — têm de somar 100%.');
  });
});

describe('resolveShares', () => {
  it('encaminha para o modo certo', () => {
    const eq = resolveShares('equal', 10, [{ personId: 'me' }, { personId: 'a' }], 'me');
    expect(eq.shares.map((x) => x.amount)).toEqual([5, 5]);

    const ex = resolveShares('exact', 10, [{ personId: 'me', amount: 4 }, { personId: 'a', amount: 6 }], 'me');
    expect(ex.error).toBeNull();

    const pc = resolveShares('percent', 10, [{ personId: 'me', percent: 50 }, { personId: 'a', percent: 50 }], 'me');
    expect(pc.shares.map((x) => x.amount)).toEqual([5, 5]);
  });

  it('valor não positivo → erro', () => {
    expect(resolveShares('equal', 0, [{ personId: 'me' }], 'me').error).toBe('O valor tem de ser maior que zero.');
  });

  it('sem participantes → erro', () => {
    expect(resolveShares('equal', 10, [], 'me').error).toBe('Escolhe pelo menos uma pessoa.');
  });
});
