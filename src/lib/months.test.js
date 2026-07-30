import { describe, it, expect } from 'vitest';
import {
  monthKeyAt,
  windowMonthKeys,
  windowLabels,
  monthLabel,
  monthLabelShort,
  minMonthOffset,
  clampOffset,
  monthsWithData,
} from './months.js';

const NOW = new Date(2026, 6, 15); // 15 julho 2026

describe('janela de meses', () => {
  it('mOff=0 → janela acaba no mês atual', () => {
    expect(windowMonthKeys(0, NOW)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    expect(monthKeyAt(3, 0, NOW)).toBe('2026-07'); // em=3 = mês atual
    expect(monthKeyAt(0, 0, NOW)).toBe('2026-04');
  });

  it('mOff negativo desliza a janela para trás', () => {
    expect(windowMonthKeys(-4, NOW)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
    expect(monthKeyAt(3, -4, NOW)).toBe('2026-03');
  });

  it('atravessa a fronteira do ano', () => {
    expect(monthKeyAt(3, -7, NOW)).toBe('2025-12');
    expect(monthKeyAt(0, -7, NOW)).toBe('2025-09');
  });

  it('etiquetas curtas acompanham a janela', () => {
    expect(windowLabels(0, NOW)).toEqual(['Abr', 'Mai', 'Jun', 'Jul']);
    expect(windowLabels(-6, NOW)).toEqual(['Out', 'Nov', 'Dez', 'Jan']);
  });
});

describe('etiquetas', () => {
  it('monthLabel', () => {
    expect(monthLabel('2026-07')).toBe('Julho 2026');
    expect(monthLabel('2025-12')).toBe('Dezembro 2025');
    expect(monthLabel('lixo')).toBe('');
  });
  it('monthLabelShort', () => {
    expect(monthLabelShort('2026-07')).toBe('Jul 26');
  });
});

describe('limites de navegação', () => {
  it('sem dados → não navega para trás', () => {
    expect(minMonthOffset({}, NOW)).toBe(0);
    expect(minMonthOffset({ addedExp: [] }, NOW)).toBe(0);
  });

  it('offset mínimo chega ao mês mais antigo com dados', () => {
    const state = {
      addedExp: [
        { date: '2026-01-10', amount: 5 },
        { date: '2026-05-02', amount: 5 },
      ],
    };
    expect(minMonthOffset(state, NOW)).toBe(-6); // julho → janeiro
  });

  it('considera também as receitas', () => {
    const state = {
      addedExp: [{ date: '2026-06-01', amount: 1 }],
      incomes: [{ date: '2025-11-30', amount: 100 }],
    };
    expect(minMonthOffset(state, NOW)).toBe(-8); // julho 2026 → novembro 2025
  });

  it('clampOffset trava no passado e nunca vai ao futuro', () => {
    const state = { addedExp: [{ date: '2026-05-01', amount: 1 }] };
    expect(clampOffset(-99, state, NOW)).toBe(-2); // só até maio
    expect(clampOffset(5, state, NOW)).toBe(0); // sem futuro
    expect(clampOffset(-1, state, NOW)).toBe(-1);
  });
});

describe('monthsWithData', () => {
  it('meses com despesas, mais recente primeiro, incluindo o atual', () => {
    const exp = [
      { date: '2026-01-10', amount: 1 },
      { date: '2026-05-02', amount: 1 },
      { date: '2026-05-20', amount: 1 },
    ];
    expect(monthsWithData(exp, NOW)).toEqual(['2026-07', '2026-05', '2026-01']);
  });
  it('sem dados → só o mês atual', () => {
    expect(monthsWithData([], NOW)).toEqual(['2026-07']);
  });
  it('ignora datas inválidas e respeita o limite', () => {
    const exp = [{ date: 'lixo', amount: 1 }, { date: '2026-06-01', amount: 1 }];
    expect(monthsWithData(exp, NOW)).toEqual(['2026-07', '2026-06']);
    expect(monthsWithData(exp, NOW, 1)).toEqual(['2026-07']);
  });
});
