import { describe, it, expect } from 'vitest';
import { nextDueDate, upcomingRecurring } from './reminders.js';

describe('nextDueDate', () => {
  it('dia futuro neste mês', () => {
    const due = nextDueDate(20, new Date(2026, 5, 10));
    expect(due.getMonth()).toBe(5);
    expect(due.getDate()).toBe(20);
  });
  it('dia já passou → mês seguinte', () => {
    const due = nextDueDate(5, new Date(2026, 5, 10));
    expect(due.getMonth()).toBe(6);
    expect(due.getDate()).toBe(5);
  });
  it('dia 31 em mês curto → último dia', () => {
    const due = nextDueDate(31, new Date(2026, 1, 10));
    expect(due.getDate()).toBe(28);
  });
});

describe('upcomingRecurring', () => {
  const today = new Date(2026, 5, 18);
  const rec = [
    { id: 'r1', name: 'Netflix', amount: 10, day: 20 },
    { id: 'r2', name: 'Ginásio', amount: 30, day: 25 },
    { id: 'r3', name: 'Longe', amount: 5, day: 17 },
  ];
  it('lista as a vencer em N dias, ordenadas', () => {
    const u = upcomingRecurring(rec, 5, today);
    expect(u.map((x) => x.rec.id)).toEqual(['r1']);
  });
  it('janela maior apanha mais', () => {
    const u = upcomingRecurring(rec, 10, today);
    expect(u.map((x) => x.rec.id)).toEqual(['r1', 'r2']);
  });
  it('exclui as já materializadas este mês', () => {
    const addedExp = [{ recId: 'r1', date: '2026-06-15', amount: 10 }];
    const u = upcomingRecurring(rec, 5, today, addedExp);
    expect(u.length).toBe(0);
  });
});
