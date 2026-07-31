import { describe, it, expect } from 'vitest';
import { expensesToCSV, incomesToCSV } from './exportcsv.js';

const BDG = [{ id: 'rest', nm: 'Restauração' }, { id: 'sup', nm: 'Supermercado' }];
const EXP = [
  { date: '2026-07-05', desc: 'Almoço', cat: 'rest', amount: 12.5, acct: 'Activobank · Conta a Ordem' },
  { date: '2026-06-01', desc: 'Compras', cat: 'sup', amount: 100, imported: true, tags: ['casa'] },
  { date: '2025-12-01', desc: 'Antiga', cat: 'sup', amount: 5 },
];

describe('expensesToCSV', () => {
  it('cabeçalho e separador ; (Excel PT)', () => {
    const csv = expensesToCSV(EXP, BDG);
    expect(csv.split('\r\n')[0]).toBe('Data;Descrição;Categoria;Valor;Conta;Origem;Tags;Notas');
  });

  it('ordena por data e traduz a categoria', () => {
    const lines = expensesToCSV(EXP, BDG).split('\r\n');
    expect(lines[1]).toContain('2025-12-01');
    expect(lines[3]).toContain('Restauração');
  });

  it('decimal com vírgula e 2 casas', () => {
    expect(expensesToCSV([{ date: '2026-01-01', desc: 'x', cat: 'rest', amount: 12.5 }], BDG)).toContain(';12,50;');
  });

  it('filtra por ano', () => {
    const csv = expensesToCSV(EXP, BDG, '2026');
    expect(csv).not.toContain('Antiga');
    expect(csv.split('\r\n')).toHaveLength(3); // cabeçalho + 2
  });

  it('marca origem importada/manual', () => {
    const csv = expensesToCSV(EXP, BDG, '2026');
    expect(csv).toContain(';importada;');
    expect(csv).toContain(';manual;');
  });

  it('escapa aspas e ponto-e-vírgula', () => {
    const csv = expensesToCSV([{ date: '2026-01-01', desc: 'A;B "c"', cat: 'rest', amount: 1 }], BDG);
    expect(csv).toContain('"A;B ""c"""');
  });
});

describe('incomesToCSV', () => {
  it('cabeçalho e recorrência legível', () => {
    const csv = incomesToCSV([
      { date: '2026-07-01', name: 'Salário', source: 'salary', amount: 1800, recurring: false },
      { name: 'Renda', source: 'other', amount: 500 },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Data;Nome;Fonte;Valor;Recorrente;Conta');
    expect(csv).toContain('não');
    expect(csv).toContain('sim');
  });
});
