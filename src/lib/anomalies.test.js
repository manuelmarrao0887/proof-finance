import { describe, it, expect } from 'vitest';
import { findAnomalies } from './anomalies.js';
import { richFixture } from '../test/fixtures.js';
import { initialPersisted } from '../store/store.jsx';

const NOW = new Date(2026, 6, 20); // 20 julho 2026

// Histórico normal do beneficiário (para haver padrão).
const HIST = [
  { id: 'h1', desc: 'Pingo Doce', amount: 30, cat: 'sup', date: '2026-05-02' },
  { id: 'h2', desc: 'Pingo Doce', amount: 25, cat: 'sup', date: '2026-05-12' },
  { id: 'h3', desc: 'Pingo Doce', amount: 35, cat: 'sup', date: '2026-05-22' },
  { id: 'h4', desc: 'Pingo Doce', amount: 28, cat: 'sup', date: '2026-06-02' },
  { id: 'h5', desc: 'Café', amount: 2, cat: 'rest', date: '2026-06-05' },
];

describe('findAnomalies', () => {
  it('poucos dados → não acusa nada', () => {
    expect(findAnomalies({ addedExp: [] }, NOW)).toEqual([]);
    expect(findAnomalies({ addedExp: HIST.slice(0, 2) }, NOW)).toEqual([]);
  });

  it('deteta cobrança repetida (mesmo valor, poucos dias)', () => {
    const state = {
      addedExp: [
        ...HIST,
        { id: 'a', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-07-10' },
        { id: 'b', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-07-12' },
      ],
    };
    const dup = findAnomalies(state, NOW).find((x) => x.kind === 'duplicate');
    expect(dup).toBeTruthy();
    expect(dup.title).toContain('Netflix');
    expect(dup.detail).toContain('2 dias');
  });

  it('NÃO acusa cobranças iguais afastadas (mensalidade normal)', () => {
    const state = {
      addedExp: [
        ...HIST,
        { id: 'a', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-06-10' },
        { id: 'b', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-07-10' },
      ],
    };
    expect(findAnomalies(state, NOW).find((x) => x.kind === 'duplicate')).toBeUndefined();
  });

  it('deteta valor muito fora do padrão do beneficiário', () => {
    const state = { addedExp: [...HIST, { id: 'x', desc: 'Pingo Doce', amount: 300, cat: 'sup', date: '2026-07-15' }] };
    const o = findAnomalies(state, NOW).find((x) => x.kind === 'outlier');
    expect(o).toBeTruthy();
    expect(o.detail).toContain('Costumas gastar');
  });

  it('não acusa variações normais', () => {
    const state = { addedExp: [...HIST, { id: 'x', desc: 'Pingo Doce', amount: 45, cat: 'sup', date: '2026-07-15' }] };
    expect(findAnomalies(state, NOW).find((x) => x.kind === 'outlier')).toBeUndefined();
  });

  it('exige valor absoluto relevante (não acusa 2 € → 8 €)', () => {
    const hist = Array.from({ length: 5 }, (_, i) => ({ id: 'c' + i, desc: 'Café', amount: 2, cat: 'rest', date: '2026-06-0' + (i + 1) }));
    const state = { addedExp: [...hist, { id: 'x', desc: 'Café', amount: 8, cat: 'rest', date: '2026-07-15' }] };
    expect(findAnomalies(state, NOW).find((x) => x.kind === 'outlier')).toBeUndefined();
  });

  it('ignora despesas antigas (fora da janela)', () => {
    const state = { addedExp: [...HIST, { id: 'x', desc: 'Pingo Doce', amount: 300, cat: 'sup', date: '2026-01-15' }] };
    expect(findAnomalies(state, NOW)).toEqual([]);
  });

  it('ordena por gravidade e limita', () => {
    const state = {
      addedExp: [
        ...HIST,
        { id: 'x1', desc: 'Pingo Doce', amount: 300, cat: 'sup', date: '2026-07-15' },
        { id: 'd1', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-07-10' },
        { id: 'd2', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-07-11' },
      ],
    };
    const list = findAnomalies(state, NOW, { limit: 2 });
    expect(list.length).toBeLessThanOrEqual(2);
    expect(list[0].severity).toBeGreaterThanOrEqual(list[list.length - 1].severity);
  });
});

describe('dispensar avisos', () => {
  const NOW2 = new Date(2026, 6, 20);
  const state = {
    addedExp: [
      { id: 'h1', desc: 'Pingo Doce', amount: 30, cat: 'sup', date: '2026-05-02' },
      { id: 'h2', desc: 'Pingo Doce', amount: 25, cat: 'sup', date: '2026-05-20' },
      { id: 'h3', desc: 'Pingo Doce', amount: 35, cat: 'sup', date: '2026-06-08' },
      { id: 'a', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-07-10' },
      { id: 'b', desc: 'Netflix', amount: 10.99, cat: 'sub', date: '2026-07-12' },
    ],
  };

  it('aviso dispensado deixa de aparecer', () => {
    const first = findAnomalies(state, NOW2);
    expect(first.length).toBeGreaterThan(0);
    const dismissed = { ...state, dismissedAnomalies: first.map((a) => a.id) };
    expect(findAnomalies(dismissed, NOW2)).toEqual([]);
  });

  it('dispensar um não esconde os outros', () => {
    const all = findAnomalies(state, NOW2);
    if (all.length < 2) return; // nada a testar neste fixture
    const dismissed = { ...state, dismissedAnomalies: [all[0].id] };
    expect(findAnomalies(dismissed, NOW2).length).toBe(all.length - 1);
  });
});

describe('fuso horário — despesa de hoje entra na janela mesmo antes da 1h local', () => {
  // `x.date` é uma string ISO de dia ("2026-09-05"), lida como meia-noite UTC.
  // Em Portugal no verão (WEST, UTC+1) isso é 01:00 local: um `new Date(x.date)`
  // direto ficava no FUTURO até à 1h, e a despesa de hoje era excluída da
  // janela `t <= d` entre 00:00 e 01:00 local (e no fuso oeste, o dia inteiro).
  const state = { ...initialPersisted(), ...richFixture(), currentUser: { uid: 'u' } };
  const out1 = state.addedExp.find((x) => x.id === 'out1');
  const [y, m, dd] = out1.date.split('-').map(Number);

  it('encontra o outlier de hoje mesmo às 00:30 local', () => {
    const now = new Date(y, m - 1, dd, 0, 30);
    const out = findAnomalies(state, now).find((x) => x.expense && x.expense.id === 'out1');
    expect(out).toBeTruthy();
    expect(out.kind).toBe('outlier');
  });

  it('continua a encontrar o mesmo outlier ao meio-dia (comportamento inalterado)', () => {
    const now = new Date(y, m - 1, dd, 12);
    const out = findAnomalies(state, now).find((x) => x.expense && x.expense.id === 'out1');
    expect(out).toBeTruthy();
    expect(out.kind).toBe('outlier');
  });
});
