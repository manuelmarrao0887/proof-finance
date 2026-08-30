import { describe, it, expect } from 'vitest';
import { TOOLS, TOOL_SCHEMAS, execTool } from './aiTools.js';

function ctx(overrides = {}) {
  const state = {
    currentUser: { uid: 'u1' },
    addedExp: [
      { id: 'e1', desc: 'Pingo Doce', amount: 45.2, cat: 'sup', date: '2026-08-03' },
      { id: 'e2', desc: 'Cafe do Ponto', amount: 3.5, cat: 'rest', date: '2026-08-05' },
      { id: 'e3', desc: 'Uber Eats', amount: 24.9, cat: 'rest', date: '2026-07-08' },
    ],
    bdg: [{ id: 'sup', nm: 'Supermercado', lm: 300 }, { id: 'rest', nm: 'Restaurantes', lm: 120 }],
    goals: [{ id: 'g1', name: 'Fundo', target: 10000, current: 2500, deadline: '2027-01-01' }],
    incomes: [{ id: 'i1', name: 'Salario', amount: 1800, source: 'salary', recurring: true, day: 25 }],
    recurring: [{ id: 'r1', name: 'Netflix', amount: 10.99, cat: 'sub', day: 1 }],
    people: [{ id: 'p1', name: 'Ana' }],
    groups: [{ id: 'gr1', name: 'Algarve', memberIds: ['me', 'p1'] }],
    groupEntries: [],
    customAccts: [],
    dynAccts: null,
    dynSnaps: [],
    rules: [],
    ...overrides,
  };
  return { state, actions: { getState: () => state } };
}

describe('TOOL_SCHEMAS', () => {
  it('tem uma entrada por tool, no formato de function-calling', () => {
    expect(TOOL_SCHEMAS).toHaveLength(Object.keys(TOOLS).length);
    TOOL_SCHEMAS.forEach((s) => {
      expect(s.type).toBe('function');
      expect(typeof s.function.name).toBe('string');
      expect(typeof s.function.description).toBe('string');
      expect(s.function.parameters.type).toBe('object');
    });
  });
  it('nao tem nomes duplicados', () => {
    const names = TOOL_SCHEMAS.map((s) => s.function.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('execTool — guardas gerais', () => {
  it('rejeita uma tool desconhecida', () => {
    expect(execTool('rm_rf', {}, ctx())).toEqual({ error: 'unknown_tool' });
  });
  it('rejeita argumentos em falta', () => {
    const r = execTool('get_group', {}, ctx());
    expect(r.error).toBe('invalid_args');
  });
});

describe('query_expenses', () => {
  it('devolve id, data, descricao, valor e categoria', () => {
    const r = execTool('query_expenses', {}, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.total).toBe(3);
    expect(Object.keys(r.data.rows[0]).sort()).toEqual(['amount', 'cat', 'date', 'desc', 'id']);
  });
  it('ordena da mais recente para a mais antiga', () => {
    const r = execTool('query_expenses', {}, ctx());
    expect(r.data.rows.map((x) => x.id)).toEqual(['e2', 'e1', 'e3']);
  });
  it('filtra por intervalo de datas', () => {
    const r = execTool('query_expenses', { from: '2026-08-01', to: '2026-08-31' }, ctx());
    expect(r.data.rows.map((x) => x.id)).toEqual(['e2', 'e1']);
  });
  it('filtra por categoria', () => {
    const r = execTool('query_expenses', { cat: 'rest' }, ctx());
    expect(r.data.total).toBe(2);
  });
  it('filtra por texto, sem distinguir maiusculas', () => {
    const r = execTool('query_expenses', { text: 'pingo' }, ctx());
    expect(r.data.rows[0].id).toBe('e1');
  });
  it('filtra por valor minimo e maximo', () => {
    const r = execTool('query_expenses', { min: 10, max: 30 }, ctx());
    expect(r.data.rows.map((x) => x.id)).toEqual(['e3']);
  });
  it('limita as linhas devolvidas mas conta o total', () => {
    const r = execTool('query_expenses', { limit: 1 }, ctx());
    expect(r.data.rows).toHaveLength(1);
    expect(r.data.total).toBe(3);
  });
});

describe('outras tools de leitura', () => {
  it('get_budget devolve limite e gasto por categoria', () => {
    const r = execTool('get_budget', { month: '2026-08' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.month).toBe('2026-08');
    expect(r.data.categories.find((c) => c.id === 'sup').spent).toBe(45.2);
  });
  it('list_goals devolve os ids', () => {
    const r = execTool('list_goals', {}, ctx());
    expect(r.data[0].id).toBe('g1');
  });
  it('list_categories devolve id, nome e limite', () => {
    const r = execTool('list_categories', {}, ctx());
    expect(r.data).toContainEqual({ id: 'sup', nm: 'Supermercado', lm: 300 });
  });
  it('list_groups devolve nome e numero de membros', () => {
    const r = execTool('list_groups', {}, ctx());
    expect(r.data[0]).toMatchObject({ id: 'gr1', name: 'Algarve', members: 2 });
  });
  it('get_group devolve not_found para um id que nao existe', () => {
    expect(execTool('get_group', { group_id: 'nope' }, ctx())).toEqual({ error: 'not_found' });
  });
  it('get_group devolve membros e saldos', () => {
    const r = execTool('get_group', { group_id: 'gr1' }, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.members.map((m) => m.id)).toContain('p1');
    expect(Array.isArray(r.data.settlements)).toBe(true);
  });
  it('get_overview devolve patrimonio e total de ativos', () => {
    const r = execTool('get_overview', {}, ctx());
    expect(typeof r.data.netWorth).toBe('number');
    expect(typeof r.data.totalAssets).toBe('number');
  });
});
