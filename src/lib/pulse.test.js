import { describe, it, expect } from 'vitest';
import { dailyAllowance, savingsPulse, buildInsights, monthPlan, monthForecast } from './pulse.js';

// 10 de julho de 2026 (julho tem 31 dias → faltam 22 dias, incluindo hoje).
const NOW = new Date(2026, 6, 10);

const BASE = {
  currentUser: { uid: 'u1' },
  customAccts: [{ id: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 4000, category: 'Liquidez' }],
  bdg: [
    { id: 'rest', nm: 'Restauração', lm: 250 },
    { id: 'sup', nm: 'Supermercado', lm: 250 },
  ],
  incomes: [{ id: 'i1', name: 'Salário', amount: 2000, recurring: true }],
  recurring: [
    { id: 'r1', name: 'Ginásio', amount: 40, day: 20, cat: 'gym' }, // ainda por pagar
    { id: 'r2', name: 'Netflix', amount: 10, day: 3, cat: 'sub' }, // já passou, não lançada
  ],
  addedExp: [
    { id: 'e1', desc: 'Almoço', amount: 300, cat: 'rest', date: '2026-07-05' },
    { id: 'e2', desc: 'Compras', amount: 200, cat: 'sup', date: '2026-07-06' },
  ],
  transfers: [],
};

describe('dailyAllowance', () => {
  it('left = rendimento − gasto − fixas por pagar; perDay divide pelos dias restantes', () => {
    const r = dailyAllowance(BASE, NOW);
    expect(r.ready).toBe(true);
    expect(r.income).toBe(2000);
    expect(r.spent).toBe(500);
    expect(r.pendingFixed).toBe(40); // só o Ginásio (dia 20 ≥ 10); Netflix (dia 3) já passou
    expect(r.left).toBe(1460);
    expect(r.daysLeft).toBe(22);
    expect(r.perDay).toBeCloseTo(1460 / 22, 5);
  });

  it('sem receitas registadas → ready:false', () => {
    const r = dailyAllowance({ ...BASE, incomes: [] }, NOW);
    expect(r.ready).toBe(false);
    expect(r.income).toBe(0);
  });

  it('fixa já materializada (recId) não é contada duas vezes', () => {
    const s = {
      ...BASE,
      addedExp: [...BASE.addedExp, { id: 'e3', desc: 'Ginásio', amount: 40, cat: 'gym', date: '2026-07-20', recId: 'r1' }],
    };
    const r = dailyAllowance(s, NOW);
    expect(r.pendingFixed).toBe(0); // r1 já lançada
    expect(r.spent).toBe(540);
  });

  it('receita one-off de outro mês não conta', () => {
    const s = { ...BASE, incomes: [{ id: 'i9', name: 'Extra', amount: 500, recurring: false, date: '2026-06-15' }] };
    expect(dailyAllowance(s, NOW).income).toBe(0);
  });
});

describe('savingsPulse', () => {
  it('taxa de poupança do mês', () => {
    const r = savingsPulse(BASE, NOW);
    expect(r.income).toBe(2000);
    expect(r.spent).toBe(500);
    expect(r.saved).toBe(1500);
    expect(r.rate).toBeCloseTo(75, 5);
  });

  it('colchão = liquidez ÷ média real dos 3 meses anteriores', () => {
    const s = {
      ...BASE,
      addedExp: [
        ...BASE.addedExp,
        { id: 'p1', desc: 'x', amount: 1000, cat: 'rest', date: '2026-06-10' },
        { id: 'p2', desc: 'x', amount: 1000, cat: 'rest', date: '2026-05-10' },
      ],
    };
    const r = savingsPulse(s, NOW);
    expect(r.avgMonthly).toBe(1000); // média de junho e maio
    expect(r.safe).toBe(4000);
    expect(r.months).toBe(4);
  });
});

describe('buildInsights', () => {
  it('deteta categoria muito acima da média histórica', () => {
    const s = {
      ...BASE,
      addedExp: [
        { id: 'n1', desc: 'agora', amount: 400, cat: 'rest', date: '2026-07-05' },
        { id: 'h1', desc: 'antes', amount: 100, cat: 'rest', date: '2026-06-05' },
        { id: 'h2', desc: 'antes', amount: 100, cat: 'rest', date: '2026-05-05' },
      ],
    };
    const ins = buildInsights(s, NOW);
    const spike = ins.find((i) => i.id.startsWith('spike-'));
    expect(spike).toBeTruthy();
    expect(spike.tone).toBe('alert');
    expect(spike.title).toContain('Restauração');
  });

  it('deteta categoria acima do limite do orçamento', () => {
    const ins = buildInsights(BASE, NOW); // rest 300 > lm 250
    const over = ins.find((i) => i.id === 'over-budget');
    expect(over).toBeTruthy();
    expect(over.detail).toContain('Restauração');
  });

  it('NÃO duplica o aviso de fixas a pagar (tem cartão próprio no Resumo)', () => {
    const s = { ...BASE, recurring: [{ id: 'r5', name: 'Renda', amount: 500, day: 14, cat: 'cas' }] };
    expect(buildInsights(s, NOW).find((i) => i.id === 'due-soon')).toBeUndefined();
  });

  it('cartão acima do plafond gera alerta', () => {
    const s = {
      ...BASE,
      customAccts: [
        ...BASE.customAccts,
        { id: 'cc', bank: 'Revolut', type: 'Cartão de Crédito', value: 0, category: 'Cartão de crédito', plafond: 100 },
      ],
      addedExp: [{ id: 'c1', desc: 'X', amount: 150, cat: 'out', date: '2026-07-02', acct: 'Revolut · Cartão de Crédito' }],
    };
    const ins = buildInsights(s, NOW);
    const card = ins.find((i) => i.id.startsWith('card-'));
    expect(card).toBeTruthy();
    expect(card.tone).toBe('alert');
  });

  it('máximo 4 insights, alertas primeiro', () => {
    const ins = buildInsights(BASE, NOW);
    expect(ins.length).toBeLessThanOrEqual(4);
    const tones = ins.map((i) => i.tone);
    const order = { alert: 0, warn: 1, info: 2, good: 3 };
    const sorted = [...tones].sort((a, b) => order[a] - order[b]);
    expect(tones).toEqual(sorted);
  });
});

describe('monthPlan (envelope budgeting)', () => {
  const S = {
    ...BASE,
    incomes: [{ id: 'i1', name: 'Salário', amount: 2000, recurring: false, source: 'salary', date: '2026-07-01' }],
    goals: [
      { id: 'g1', name: 'Férias', target: 3000, current: 1000, monthly: 200 },
      { id: 'g2', name: 'Feita', target: 500, current: 500, monthly: 50 },
      { id: 'g3', name: 'Sem reserva', target: 900, current: 0 },
    ],
  };

  it('deteta entrada de salário no mês', () => {
    expect(monthPlan(S, NOW).salaryIn).toBe(true);
    expect(monthPlan({ ...S, incomes: [] }, NOW).salaryIn).toBe(false);
  });

  it('soma fixas e metas; livre = rendimento − fixas − metas', () => {
    const p = monthPlan(S, NOW);
    expect(p.income).toBe(2000);
    expect(p.fixedTotal).toBe(50); // Ginásio 40 + Netflix 10
    expect(p.goalsTotal).toBe(200); // só a meta com reserva por concluir
    expect(p.free).toBe(2000 - 50 - 200);
  });

  it('só metas com reserva mensal e por concluir', () => {
    const p = monthPlan(S, NOW);
    expect(p.goalItems.map((g) => g.id)).toEqual(['g1']);
  });

  it('limita a reserva ao que falta para a meta', () => {
    const s = { ...S, goals: [{ id: 'g', name: 'Quase', target: 100, current: 80, monthly: 200 }] };
    expect(monthPlan(s, NOW).goalsTotal).toBe(20);
  });

  it('marca metas já reforçadas neste mês', () => {
    const s = { ...S, goals: [{ id: 'g1', name: 'F', target: 3000, current: 1000, monthly: 200, lastAlloc: '2026-07' }] };
    const p = monthPlan(s, NOW);
    expect(p.goalItems[0].done).toBe(true);
    expect(p.allocatedGoals).toBe(true);
  });
});

describe('monthForecast', () => {
  it('extrapola só a despesa variável e soma as fixas por pagar', () => {
    // dia 10 de julho (31 dias): 300 variáveis em 10 dias = 30/dia → 930 no mês
    // + fixas por pagar (Ginásio 40, dia 20)
    const f = monthForecast(BASE, NOW);
    expect(f.ready).toBe(true);
    expect(f.variableSpent).toBe(500);
    expect(f.dailyBurn).toBeCloseTo(50, 5);
    expect(f.projectedSpend).toBeCloseTo(50 * 31 + 40, 5);
  });

  it('não extrapola as fixas já lançadas', () => {
    const s = {
      ...BASE,
      recurring: [{ id: 'r1', name: 'Renda', amount: 350, day: 1 }],
      addedExp: [
        { id: 'f', desc: 'Renda', amount: 350, cat: 'cas', date: '2026-07-01', recId: 'r1' },
        { id: 'v', desc: 'Café', amount: 100, cat: 'rest', date: '2026-07-05' },
      ],
    };
    const f = monthForecast(s, NOW);
    expect(f.fixedSpent).toBe(350);
    expect(f.variableSpent).toBe(100);
    // 100/10 = 10/dia → 310 variáveis + 350 fixas já pagas = 660 (não 1550)
    expect(f.projectedSpend).toBeCloseTo(310 + 350, 5);
  });

  it('avisa quando a projeção passa o rendimento', () => {
    const s = { ...BASE, incomes: [{ id: 'i', name: 'S', amount: 800, recurring: true }] };
    const f = monthForecast(s, NOW);
    expect(f.overBudget).toBe(true);
    expect(f.projectedEnd).toBeLessThan(0);
  });

  it('nos primeiros dias não projeta (amostra insuficiente)', () => {
    expect(monthForecast(BASE, new Date(2026, 6, 2)).ready).toBe(false);
  });
});

describe('insight de poupança', () => {
  it('mostra a maior oportunidade quando vale ≥200 €/ano', () => {
    // 6 meses fechados de restauração muito acima do limite
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
    const addedExp = months.flatMap((m, i) =>
      Array.from({ length: 3 }, (_, j) => ({ id: m + j + i, desc: 'X', cat: 'rest', amount: 100, date: m + '-0' + (j + 1) }))
    );
    const ins = buildInsights({ ...BASE, addedExp }, NOW);
    const sav = ins.find((x) => x.id.startsWith('saving-'));
    expect(sav).toBeTruthy();
    expect(sav.title).toContain('Podias poupar');
  });

  it('não mostra quando não há histórico', () => {
    expect(buildInsights(BASE, NOW).find((x) => x.id.startsWith('saving-'))).toBeUndefined();
  });
});
