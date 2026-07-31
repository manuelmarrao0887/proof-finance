import { describe, it, expect } from 'vitest';
import { taxCalendarPT, upcomingTaxEvents } from './taxpt.js';
import { estimateDeductions, isDeductible, IRS_LIMITS } from './irs.js';

describe('taxCalendarPT', () => {
  it('sem config → e-Fatura + IRS (aplicam-se a todos)', () => {
    const ev = taxCalendarPT(2026, {});
    const kinds = new Set(ev.map((e) => e.kind));
    expect(kinds.has('efatura')).toBe(true);
    expect(kinds.has('irs')).toBe(true);
    expect(kinds.has('imi')).toBe(false);
    expect(kinds.has('iuc')).toBe(false);
  });

  it('datas-chave corretas', () => {
    const ev = taxCalendarPT(2026, {});
    const byId = Object.fromEntries(ev.map((e) => [e.id, e.date]));
    expect(byId['efatura-validar-2026']).toBe('2026-02-25');
    expect(byId['irs-inicio-2026']).toBe('2026-04-01');
    expect(byId['irs-fim-2026']).toBe('2026-06-30');
    expect(byId['irs-pagamento-2026']).toBe('2026-08-31');
  });

  it('IMI: 1 prestação até 100 EUR', () => {
    const imi = taxCalendarPT(2026, { imiAmount: 80 }).filter((e) => e.kind === 'imi');
    expect(imi).toHaveLength(1);
    expect(imi[0].date.slice(0, 7)).toBe('2026-05');
  });

  it('IMI: 2 prestações entre 100 e 500 EUR (maio e novembro)', () => {
    const imi = taxCalendarPT(2026, { imiAmount: 300 }).filter((e) => e.kind === 'imi');
    expect(imi).toHaveLength(2);
    expect(imi.map((e) => e.date.slice(5, 7))).toEqual(['05', '11']);
    expect(imi[0].amount).toBe(150);
  });

  it('IMI: 3 prestações acima de 500 EUR (maio, agosto, novembro)', () => {
    const imi = taxCalendarPT(2026, { imiAmount: 900 }).filter((e) => e.kind === 'imi');
    expect(imi).toHaveLength(3);
    expect(imi.map((e) => e.date.slice(5, 7))).toEqual(['05', '08', '11']);
    expect(imi[0].amount).toBe(300);
  });

  it('IUC no mês da matrícula de cada veículo', () => {
    const iuc = taxCalendarPT(2026, { iucMonths: [3, 9] }).filter((e) => e.kind === 'iuc');
    expect(iuc).toHaveLength(2);
    expect(iuc.map((e) => e.date.slice(5, 7))).toEqual(['03', '09']);
  });

  it('eventos ordenados por data', () => {
    const ev = taxCalendarPT(2026, { imiAmount: 900, iucMonths: [1] });
    const dates = ev.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe('upcomingTaxEvents', () => {
  it('devolve só o que vem a seguir, dentro do horizonte', () => {
    const now = new Date(2026, 3, 15); // 15 abril 2026
    const up = upcomingTaxEvents({}, now, 90);
    expect(up.length).toBeGreaterThan(0);
    expect(up.every((e) => e.daysLeft >= 0 && e.daysLeft <= 90)).toBe(true);
    expect(up[0].id).toBe('irs-fim-2026'); // 30 jun = 76 dias
  });

  it('atravessa a fronteira do ano', () => {
    const now = new Date(2026, 11, 20); // 20 dez 2026
    const up = upcomingTaxEvents({}, now, 90);
    expect(up.some((e) => e.date.startsWith('2027-02'))).toBe(true);
  });

  it('ordenado por proximidade', () => {
    const up = upcomingTaxEvents({ imiAmount: 900 }, new Date(2026, 0, 1), 365);
    const d = up.map((e) => e.daysLeft);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });
});

describe('estimateDeductions', () => {
  const EXP = [
    { cat: 'sau', amount: 1000, date: '2026-03-10' }, // saúde 15% = 150
    { cat: 'bern', amount: 500, date: '2026-04-10' }, // educação 30% = 150
    { cat: 'sup', amount: 400, date: '2026-05-10' }, // gerais 35% = 140
    { cat: 'rest', amount: 123, date: '2026-06-10' }, // IVA
    { cat: 'cas', amount: 350, date: '2026-06-10' }, // não dedutível
    { cat: 'sau', amount: 999, date: '2025-03-10' }, // outro ano → ignorado
  ];

  it('soma por regime e aplica as taxas', () => {
    const r = estimateDeductions(EXP, 2026);
    const get = (k) => r.regimes.find((x) => x.key === k);
    expect(get('saude').spent).toBe(1000);
    expect(get('saude').deduction).toBeCloseTo(150, 5);
    expect(get('educacao').deduction).toBeCloseTo(150, 5);
    expect(get('gerais').deduction).toBeCloseTo(140, 5);
  });

  it('IVA: 15% do IVA suportado (23%)', () => {
    const r = estimateDeductions([{ cat: 'rest', amount: 123, date: '2026-01-01' }], 2026);
    const iva = r.regimes.find((x) => x.key === 'iva');
    const expected = 123 * (0.23 / 1.23) * 0.15;
    expect(iva.deduction).toBeCloseTo(expected, 5);
  });

  it('respeita os tetos legais', () => {
    const big = [{ cat: 'sau', amount: 50000, date: '2026-01-01' }];
    const r = estimateDeductions(big, 2026);
    const s = r.regimes.find((x) => x.key === 'saude');
    expect(s.deduction).toBe(IRS_LIMITS.saude.cap);
    expect(s.capped).toBe(true);
  });

  it('casal duplica o teto das despesas gerais', () => {
    const big = [{ cat: 'sup', amount: 10000, date: '2026-01-01' }];
    expect(estimateDeductions(big, 2026).regimes.find((x) => x.key === 'gerais').deduction).toBe(250);
    expect(estimateDeductions(big, 2026, { couple: true }).regimes.find((x) => x.key === 'gerais').deduction).toBe(500);
  });

  it('ignora despesas de outros anos e categorias não dedutíveis', () => {
    const r = estimateDeductions(EXP, 2026);
    expect(r.byCat.cas).toBeUndefined();
    expect(r.byCat.sau).toBe(1000); // só a de 2026
  });

  it('isDeductible', () => {
    expect(isDeductible('sau')).toBe(true);
    expect(isDeductible('cas')).toBe(false);
    expect(isDeductible('categoria-nova')).toBe(true); // default: gerais
  });
});
