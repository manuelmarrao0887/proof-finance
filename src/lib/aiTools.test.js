import { describe, it, expect, vi } from 'vitest';
import { TOOLS, TOOL_SCHEMAS, execTool, ME_ID as TOOLS_ME_ID, WRITE_TOOL_SLICES, WRITE_TOOL_NAMES } from './aiTools.js';
import { ME_ID } from '../store/store.jsx';
// toolCtx é o factory partilhado por runAssistant e pelo confirmPending() das
// duas UIs (AssistantSheet, AIView) — nasceu da revisão da Task 5 (Finding 1):
// cada UI construía o ctx de confirmPending() à mão, sem `currentUser`, e uma
// escrita CONFIRMADA (update_expense com "acct") resolvia contra as contas de
// DEMONSTRAÇÃO em produção. Importa-se aqui só para o describe abaixo exercer
// EXACTAMENTE o mesmo par (execTool, ctx) que a UI corrigida agora chama.
import { toolCtx } from './aiChat.js';

// aiTools.js e um modulo puro (sem Firebase). Este ficheiro de testes importa
// ME_ID de store/store.jsx so para comparar com a constante local de
// aiTools.js (ver teste abaixo) — mocka-se Firebase para esse import nao
// inicializar nada a serio, mesmo padrao de groups.store.test.jsx e
// settle.test.jsx.
vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

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
    // Uma despesa e um acerto no mesmo grupo — campos conforme
    // GroupExpenseSheet.jsx e SettleSheet.jsx gravam de facto via
    // actions.addGroupEntry (ver STORE_API.md §1, groupEntries).
    groupEntries: [
      {
        id: 'ge1', groupId: 'gr1', kind: 'expense', desc: 'Jantar', amount: 40, date: '2026-08-10',
        payerId: 'me', shares: [{ personId: 'me', amount: 20 }, { personId: 'p1', amount: 20 }],
      },
      { id: 'ge2', groupId: 'gr1', kind: 'settlement', fromId: 'p1', toId: 'me', amount: 20, date: '2026-08-11', method: 'cash' },
    ],
    // Conta custom (b/t = identidade, n = nota opcional) — ver lib/finance.js getAccts.
    customAccts: [{ id: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 2500, category: 'Liquidez', currency: 'EUR' }],
    dynAccts: null,
    dynSnaps: [],
    rules: [],
    ...overrides,
  };
  return { state, actions: { getState: () => state } };
}

// ctx com espiões: cada action regista o que recebeu e devolve o próprio store.
function writeCtx(seed = {}) {
  const state = {
    addedExp: [], goals: [], incomes: [], recurring: [], bdg: [{ id: 'sup', nm: 'Supermercado', lm: 300 }],
    rules: [], people: [], groups: [], groupEntries: [], dynAccts: null, dynSnaps: [],
    ...seed,
  };
  const actions = {
    getState: () => state,
    addExpense: vi.fn((e) => { state.addedExp = [...state.addedExp, e]; }),
    updateExpense: vi.fn((id, p) => { state.addedExp = state.addedExp.map((x) => (x.id === id ? { ...x, ...p } : x)); }),
    deleteExpense: vi.fn((id) => { state.addedExp = state.addedExp.filter((x) => x.id !== id); }),
    addIncome: vi.fn(), updateIncome: vi.fn(), deleteIncome: vi.fn(),
    addGoal: vi.fn(), updateGoal: vi.fn(), deleteGoal: vi.fn(),
    addRecurring: vi.fn(), updateRecurring: vi.fn(), deleteRecurring: vi.fn(),
    addCategory: vi.fn(), updateCategory: vi.fn(), setBdg: vi.fn(), addRule: vi.fn(),
    setDynAccts: vi.fn(), setDynSnaps: vi.fn(), addBalanceReading: vi.fn(),
    addPerson: vi.fn(), addGroup: vi.fn(), addGroupEntry: vi.fn(() => 'ge1'), deleteGroupEntry: vi.fn(),
  };
  return { state, actions };
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
  it('nunca expoe "confirmed" ao modelo, em nenhuma tool', () => {
    TOOL_SCHEMAS.forEach((s) => {
      expect(s.function.parameters.properties).not.toHaveProperty('confirmed');
    });
  });
  it('o schema interno de uma tool destrutiva mantem "confirmed" (o validador precisa dele)', () => {
    expect(TOOLS.delete_expense.schema.properties).toHaveProperty('confirmed');
    expect(TOOLS.update_expense.schema.properties).toHaveProperty('confirmed');
  });
  it('esconder "confirmed" do modelo nao quebra o caminho de confirmacao da UI', () => {
    const c = writeCtx({ addedExp: [{ id: 'e1', desc: 'Continente', amount: 45.67, cat: 'sup', date: '2026-08-28' }] });
    const r = execTool('delete_expense', { id: 'e1', confirmed: true }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.deleteExpense).toHaveBeenCalledWith('e1');
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
  it('get_group preserva desc/payerId numa despesa e fromId/toId/method num acerto', () => {
    const r = execTool('get_group', { group_id: 'gr1' }, ctx());
    expect(r.ok).toBe(true);
    const expense = r.data.entries.find((e) => e.id === 'ge1');
    expect(expense).toMatchObject({ kind: 'expense', desc: 'Jantar', payerId: 'me' });
    const settlement = r.data.entries.find((e) => e.id === 'ge2');
    expect(settlement).toMatchObject({ kind: 'settlement', fromId: 'p1', toId: 'me', method: 'cash' });
    expect(settlement.desc).toBeUndefined();
    expect(settlement.payerId).toBeUndefined();
  });
  it('get_overview devolve patrimonio e total de ativos', () => {
    const r = execTool('get_overview', {}, ctx());
    expect(typeof r.data.netWorth).toBe('number');
    expect(typeof r.data.totalAssets).toBe('number');
  });
  it('get_overview nomeia a conta por banco e tipo, nao pela nota', () => {
    const r = execTool('get_overview', {}, ctx());
    expect(r.data.accounts).toContainEqual({ name: 'Activobank · Conta a Ordem', category: 'Liquidez', value: 2500 });
  });
});

describe('add_expense', () => {
  it('cria a despesa com id, valor positivo e data normalizada', () => {
    const c = writeCtx();
    const r = execTool('add_expense', { desc: 'Continente', amount: -45.67, cat: 'sup', date: '2026-08-28' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addExpense).toHaveBeenCalledTimes(1);
    const arg = c.actions.addExpense.mock.calls[0][0];
    expect(arg.amount).toBe(45.67);
    expect(arg.date).toBe('2026-08-28');
    expect(arg.id).toBeTruthy();
    expect(r.data.id).toBe(arg.id);
  });
  it('usa a data de hoje quando nao vem data', () => {
    const c = writeCtx();
    execTool('add_expense', { desc: 'Cafe', amount: 1.2, cat: 'rest' }, c);
    expect(c.actions.addExpense.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('cai em "out" para uma categoria desconhecida', () => {
    const c = writeCtx();
    execTool('add_expense', { desc: 'X', amount: 1, cat: 'inventada' }, c);
    expect(c.actions.addExpense.mock.calls[0][0].cat).toBe('out');
  });
  it('exige descricao e valor', () => {
    expect(execTool('add_expense', { amount: 1 }, writeCtx()).error).toBe('invalid_args');
    expect(execTool('add_expense', { desc: 'X' }, writeCtx()).error).toBe('invalid_args');
  });
});

describe('add_expense com conta', () => {
  function ctxWithAccts() {
    const c = writeCtx();
    c.state.customAccts = [
      { id: 'a1', bank: 'Activobank', type: 'Conta a Ordem', value: 1000, category: 'Liquidez', currency: 'EUR' },
      { id: 'cc', bank: 'Revolut', type: 'Cartão de Crédito', value: 0, category: 'Cartão de crédito', plafond: 500, currency: 'EUR' },
    ];
    c.state.currentUser = { uid: 'u' }; // fora de preview, listAccounts lê customAccts
    return c;
  }
  it('"pago pelo Activobank" liga à conta existente', () => {
    const c = ctxWithAccts();
    const r = execTool('add_expense', { desc: 'Restaurante X', amount: 15, cat: 'rest', acct: 'Activobank' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addExpense.mock.calls[0][0].acct).toBe('Activobank · Conta a Ordem');
    expect(r.data.acct).toBe('Activobank · Conta a Ordem');
  });
  it('conta desconhecida → despesa sem conta, sem erro', () => {
    const c = ctxWithAccts();
    const r = execTool('add_expense', { desc: 'Café', amount: 2, acct: 'Millennium' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addExpense.mock.calls[0][0].acct).toBeUndefined();
  });
  it('conta ambígua → erro com opções, nada é escrito', () => {
    const c = ctxWithAccts();
    c.state.customAccts.push({ id: 'r2', bank: 'Revolut', type: 'Poupanca', value: 10, category: 'Outros', currency: 'EUR' });
    c.state.customAccts[1].category = 'Outros';
    const r = execTool('add_expense', { desc: 'Café', amount: 2, acct: 'Revolut' }, c);
    expect(r.error).toBe('ambiguous_account');
    expect(r.detail).toMatch(/Revolut · Cartão de Crédito/);
    expect(c.actions.addExpense).not.toHaveBeenCalled();
  });
  it('update_expense também aceita acct', () => {
    const c = ctxWithAccts();
    c.state.addedExp = [{ id: 'e1', desc: 'Café', amount: 2, cat: 'rest', date: '2026-09-01' }];
    const r = execTool('update_expense', { id: 'e1', acct: 'activobank', confirmed: true }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.updateExpense.mock.calls[0][1].acct).toBe('Activobank · Conta a Ordem');
  });
  it('update_expense ambíguo: o erro já sai na 1a chamada (sem confirmed) — o modelo recebe a pergunta antes do gate destrutivo pedir confirmação (revisão, SHOULD-FIX 2)', () => {
    const c = ctxWithAccts();
    c.state.customAccts.push({ id: 'r2', bank: 'Revolut', type: 'Poupanca', value: 10, category: 'Outros', currency: 'EUR' });
    c.state.customAccts[1].category = 'Outros';
    c.state.addedExp = [{ id: 'e1', desc: 'Café', amount: 2, cat: 'rest', date: '2026-09-01' }];
    const r = execTool('update_expense', { id: 'e1', acct: 'Revolut' }, c); // SEM confirmed
    expect(r.pending).toBeUndefined();
    expect(r.error).toBe('ambiguous_account');
    expect(r.detail).toMatch(/Revolut · Cartão de Crédito/);
    expect(c.actions.updateExpense).not.toHaveBeenCalled();
  });
  it('update_expense pendente: preview.after.acct e preview.patch.acct guardam o rótulo RESOLVIDO, não o texto em bruto que o modelo passou (revisão, NIT 6)', () => {
    const c = ctxWithAccts();
    c.state.addedExp = [{ id: 'e1', desc: 'Café', amount: 2, cat: 'rest', date: '2026-09-01' }];
    const r = execTool('update_expense', { id: 'e1', acct: 'activobank' }, c); // SEM confirmed
    expect(r.pending).toBe(true);
    expect(r.preview.after.acct).toBe('Activobank · Conta a Ordem');
    expect(r.preview.patch.acct).toBe('Activobank · Conta a Ordem');
  });
  it('acct vazia (string explícita) limpa a conta gravada; acct ausente não mexe no que já lá estava (revisão, NIT 5)', () => {
    const c = ctxWithAccts();
    c.state.addedExp = [{ id: 'e1', desc: 'Café', amount: 2, cat: 'rest', date: '2026-09-01', acct: 'Activobank · Conta a Ordem' }];
    const r1 = execTool('update_expense', { id: 'e1', acct: '', confirmed: true }, c);
    expect(r1.ok).toBe(true);
    expect(c.actions.updateExpense.mock.calls[0][1].acct).toBe('');
    const r2 = execTool('update_expense', { id: 'e1', desc: 'Almoço', confirmed: true }, c);
    expect(r2.ok).toBe(true);
    expect(c.actions.updateExpense.mock.calls[1][1]).not.toHaveProperty('acct');
  });
  it('Finding 1 (revisão): toolCtx(actions, currentUser) — o ctx que confirmPending() usa agora em AssistantSheet/AIView — resolve contra as contas REAIS do utilizador', () => {
    const c = ctxWithAccts();
    c.state.addedExp = [{ id: 'e1', desc: 'Café', amount: 2, cat: 'rest', date: '2026-09-01' }];
    // O MESMO par (execTool, ctx) que o clique em "Confirmar" agora produz —
    // ver toolCtx() em aiChat.js e o call-site em AssistantSheet.jsx/AIView.jsx.
    const ctx = toolCtx(c.actions, c.state.currentUser);
    const r = execTool('update_expense', { id: 'e1', acct: 'cartão revolut', confirmed: true }, ctx);
    expect(r.ok).toBe(true);
    expect(c.actions.updateExpense.mock.calls[0][1].acct).toBe('Revolut · Cartão de Crédito');
  });
  it('Finding 1 (revisão): sem currentUser no ctx (o bug de antes da correção), a MESMA chamada resolvia contra uma conta de DEMONSTRAÇÃO em vez da conta real do utilizador', () => {
    const c = ctxWithAccts();
    c.state.addedExp = [{ id: 'e1', desc: 'Café', amount: 2, cat: 'rest', date: '2026-09-01' }];
    // ctxWithAccts() põe currentUser diretamente no `state` (para os outros
    // testes deste describe, que passam `c` tal e qual como ctx). Aqui
    // simula-se o ctx que AssistantSheet.jsx/AIView.jsx construíam à mão
    // ANTES desta correção — sem currentUser nenhures, nem no `state` nem no
    // ctx — por isso remove-se também do `state` (senão actions.getState()
    // devolvia-o de qualquer forma, e o teste não provava nada).
    delete c.state.currentUser;
    const brokenCtx = toolCtx(c.actions, undefined);
    const r = execTool('update_expense', { id: 'e1', acct: 'cartão revolut', confirmed: true }, brokenCtx);
    expect(r.ok).toBe(true);
    // isPreviewMode(state) dá true sem currentUser (finance.js) — listAccounts
    // ignora customAccts e usa só os 12 bancos de DEMONSTRAÇÃO (finance.js
    // `accts`); lá o único Revolut é "Conta a Ordem", nunca "Cartão de
    // Crédito" (a conta real que o utilizador tem via customAccts). A escrita
    // "tem sucesso" mas fica ligada a uma conta que o utilizador não possui —
    // exactamente o Finding 1 da revisão da Task 5, agora inatingível a
    // partir de toolCtx() porque as duas UIs passam sempre currentUser.
    expect(c.actions.updateExpense.mock.calls[0][1].acct).toBe('Revolut · Conta a Ordem');
    expect(c.actions.updateExpense.mock.calls[0][1].acct).not.toBe('Revolut · Cartão de Crédito');
  });
});

describe('add_income / add_goal / add_recurring', () => {
  it('add_income normaliza o dia para 1-31', () => {
    const c = writeCtx();
    execTool('add_income', { name: 'Salario', amount: 1800, source: 'salary', recurring: true, day: 99 }, c);
    expect(c.actions.addIncome.mock.calls[0][0].day).toBe(1);
  });
  it('add_goal aceita alvo e prazo', () => {
    const c = writeCtx();
    const r = execTool('add_goal', { name: 'Fundo', target: 10000, deadline: '2027-01-01' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addGoal.mock.calls[0][0]).toMatchObject({ name: 'Fundo', target: 10000, current: 0 });
  });
  it('add_recurring guarda categoria e dia', () => {
    const c = writeCtx();
    execTool('add_recurring', { name: 'Netflix', amount: 10.99, cat: 'sub', day: 3 }, c);
    expect(c.actions.addRecurring.mock.calls[0][0]).toMatchObject({ name: 'Netflix', cat: 'sub', day: 3 });
  });
  it('add_recurring guarda o valor sempre positivo', () => {
    const c = writeCtx();
    execTool('add_recurring', { name: 'Ginasio', amount: -25 }, c);
    expect(c.actions.addRecurring.mock.calls[0][0].amount).toBe(25);
  });
});

describe('add_category', () => {
  it('normaliza o id: minusculas, sem pontuacao/espacos', () => {
    const c = writeCtx();
    const r = execTool('add_category', { id: 'Casa-Nova!', nm: 'Casa Nova' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addCategory.mock.calls[0][0].id).toBe('casanova');
  });
  it('trunca o id normalizado a 12 caracteres', () => {
    const c = writeCtx();
    execTool('add_category', { id: 'umidentificadormuitocomprido', nm: 'Longo' }, c);
    expect(c.actions.addCategory.mock.calls[0][0].id).toHaveLength(12);
  });
  it('rejeita um id que fica vazio depois de normalizar, sem escrever', () => {
    const c1 = writeCtx();
    expect(execTool('add_category', { id: '!!!', nm: 'X' }, c1).error).toBe('invalid_args');
    expect(c1.actions.addCategory).not.toHaveBeenCalled();
    const c2 = writeCtx();
    expect(execTool('add_category', { id: '   ', nm: 'X' }, c2).error).toBe('invalid_args');
    expect(c2.actions.addCategory).not.toHaveBeenCalled();
  });
  it('rejeita um id ja usado por outra categoria, sem escrever', () => {
    const c = writeCtx();
    const r = execTool('add_category', { id: 'sup', nm: 'Duplicada' }, c);
    expect(r.error).toBe('invalid_args');
    expect(c.actions.addCategory).not.toHaveBeenCalled();
  });
});

describe('add_rule', () => {
  it('cai em "out" para uma categoria desconhecida e devolve o id da regra', () => {
    const c = writeCtx();
    const r = execTool('add_rule', { pattern: 'Uber', cat: 'inventada' }, c);
    expect(r.ok).toBe(true);
    expect(r.data.id).toBeTruthy();
    expect(c.actions.addRule.mock.calls[0][0]).toMatchObject({ pattern: 'Uber', cat: 'out' });
  });
});

/* set_budget e update_balance substituem um valor que já existia (limite,
   saldo) e o antigo não se recupera — a regra do produto é "criar aplica-se
   logo; alterar e apagar pedem confirmação". Passaram por isso a destrutivas,
   com a mesma pré-visualização das update_*. */
describe('set_budget (destrutiva)', () => {
  it('NAO altera nada na primeira chamada — devolve o antes e o depois', () => {
    const c = writeCtx();
    const r = execTool('set_budget', { cat: 'sup', limit: 250 }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.action).toBe('update');
    expect(r.preview.before.lm).toBe(300);
    expect(r.preview.after.lm).toBe(250);
    // O cartao partilhado (PendingActionCard) mostra `label` — tem de dizer
    // ao utilizador o valor antigo E o novo, senao confirma as cegas.
    expect(r.preview.label).toContain('300.00 EUR');
    expect(r.preview.label).toContain('250.00 EUR');
    expect(c.actions.updateCategory).not.toHaveBeenCalled();
    expect(c.actions.setBdg).not.toHaveBeenCalled();
  });
  it('altera o limite com confirmed: true', () => {
    const c = writeCtx();
    const r = execTool('set_budget', { cat: 'sup', limit: 250, confirmed: true }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.updateCategory).toHaveBeenCalledWith('sup', { lm: 250 });
  });
  it('devolve not_found para uma categoria que nao existe, sem pedir confirmacao', () => {
    expect(execTool('set_budget', { cat: 'zzz', limit: 10 }, writeCtx())).toEqual({ error: 'not_found' });
  });
});

describe('update_balance (destrutiva) e add_snapshot', () => {
  it('NAO grava nada na primeira chamada — pre-visualiza o saldo antigo e o novo', () => {
    const c = writeCtx({ dynAccts: { 'Bankinter_Conta a Ordem': { v: 100, d: '2026.08.01', n: 'nota antiga' } } });
    const r = execTool('update_balance', { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 584.64 }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.action).toBe('update');
    expect(r.preview.before.value).toBe(100);
    expect(r.preview.after.value).toBe(584.64);
    expect(r.preview.label).toContain('100.00 EUR');
    expect(r.preview.label).toContain('584.64 EUR');
    expect(c.actions.addBalanceReading).not.toHaveBeenCalled();
  });

  it('sem leitura anterior, a pre-visualizacao diz "sem leitura" em vez de inventar um valor', () => {
    const c = writeCtx();
    const r = execTool('update_balance', { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 584.64 }, c);
    expect(r.preview.before.value).toBeNull();
    expect(r.preview.label).toContain('sem leitura');
  });

  // O bug: escrever dynAccts a mao perdia o historico (balanceLog, o que o
  // BalanceHistorySheet mostra), o snapshot patrimonial do dia e a nota
  // anterior da conta. addBalanceReading e o MESMO caminho do fluxo manual
  // (BalanceUpdateSheet) e faz as tres coisas.
  it('com confirmed grava pela mesma action do fluxo manual (addBalanceReading), nao por setDynAccts', () => {
    const c = writeCtx();
    const r = execTool(
      'update_balance',
      { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 584.64, confirmed: true },
      c
    );
    expect(r.ok).toBe(true);
    expect(c.actions.setDynAccts).not.toHaveBeenCalled();
    expect(c.actions.addBalanceReading).toHaveBeenCalledTimes(1);
    const arg = c.actions.addBalanceReading.mock.calls[0][0];
    expect(arg.account).toEqual({ bank: 'Bankinter', type: 'Conta a Ordem', custom: false });
    expect(arg.value).toBe(584.64);
    expect(arg.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Sem nota nova, `note` fica indefinida — a action mantem a que la estava.
    expect(arg.note).toBeUndefined();
  });

  it('trunca a nota (era o unico campo desta tool que ia em bruto para o estado)', () => {
    const c = writeCtx();
    execTool(
      'update_balance',
      { account_bank: 'Bankinter', account_type: 'Conta a Ordem', value: 10, note: 'x'.repeat(500), confirmed: true },
      c
    );
    expect(c.actions.addBalanceReading.mock.calls[0][0].note).toHaveLength(60);
  });

  it('update_balance devolve not_found para um par banco/tipo que nao existe no template, sem escrever', () => {
    const c = writeCtx();
    // 'Transacoes' (sem acentos) é precisamente a falha realista: o par real
    // no template é 'Transações' — um par que não bate certo fica órfão em
    // dynAccts (getAccts nunca o volta a ler).
    const r = execTool('update_balance', { account_bank: 'Bankinter', account_type: 'Transacoes', value: 100 }, c);
    expect(r).toEqual({ error: 'not_found' });
    expect(c.actions.addBalanceReading).not.toHaveBeenCalled();
    expect(c.actions.setDynAccts).not.toHaveBeenCalled();
  });
  it('add_snapshot acrescenta ao fim da lista', () => {
    const c = writeCtx({ dynSnaps: [{ l: '01.08' }] });
    execTool('add_snapshot', { label: '30.08', liq: 100, poup: 200, inv: 300 }, c);
    const arg = c.actions.setDynSnaps.mock.calls[0][0];
    expect(arg).toHaveLength(2);
    expect(arg[1].l).toBe('30.08');
  });
});

describe('gate das accoes destrutivas', () => {
  const seed = () => ({
    addedExp: [{ id: 'e1', desc: 'Continente', amount: 45.67, cat: 'sup', date: '2026-08-28' }],
    goals: [{ id: 'g1', name: 'Fundo', target: 10000, current: 2500 }],
    incomes: [{ id: 'i1', name: 'Salario', amount: 1800 }],
    recurring: [{ id: 'r1', name: 'Netflix', amount: 10.99, cat: 'sub', day: 1 }],
  });

  it('delete_expense NAO apaga na primeira chamada', () => {
    const c = writeCtx(seed());
    const r = execTool('delete_expense', { id: 'e1' }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.action).toBe('delete');
    expect(r.preview.label).toContain('Continente');
    expect(r.call).toEqual({ name: 'delete_expense', args: { id: 'e1' } });
    expect(c.actions.deleteExpense).not.toHaveBeenCalled();
  });

  it('delete_expense apaga com confirmed: true', () => {
    const c = writeCtx(seed());
    const r = execTool('delete_expense', { id: 'e1', confirmed: true }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.deleteExpense).toHaveBeenCalledWith('e1');
  });

  it('delete_expense devolve not_found para id inexistente, sem pedir confirmacao', () => {
    const c = writeCtx(seed());
    expect(execTool('delete_expense', { id: 'nao-existe' }, c)).toEqual({ error: 'not_found' });
    expect(c.actions.deleteExpense).not.toHaveBeenCalled();
  });

  it('update_expense mostra antes e depois na pre-visualizacao', () => {
    const c = writeCtx(seed());
    const r = execTool('update_expense', { id: 'e1', amount: 50 }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.before.amount).toBe(45.67);
    expect(r.preview.after.amount).toBe(50);
    expect(c.actions.updateExpense).not.toHaveBeenCalled();
  });

  it('update_expense escreve so os campos enviados, com confirmed', () => {
    const c = writeCtx(seed());
    execTool('update_expense', { id: 'e1', amount: 50, confirmed: true }, c);
    expect(c.actions.updateExpense).toHaveBeenCalledWith('e1', { amount: 50 });
  });

  /* O caminho de ALTERAR tem de aplicar exactamente os mesmos saneadores do
     caminho de CRIAR (sanitizeExpenseFields, partilhado). Antes, update_expense
     fazia um Number() nu e deixava passar: valor negativo (subtrai ao total da
     categoria em vez de somar), categoria inexistente (a despesa desaparece de
     qualquer resumo de orçamento), data que normalizeStmtDate devolve intacta
     por não a reconhecer, e descrição sem limite. */
  it('update_expense guarda o valor positivo, tal como add_expense', () => {
    const c = writeCtx(seed());
    const r = execTool('update_expense', { id: 'e1', amount: -50 }, c);
    expect(r.preview.after.amount).toBe(50);
    execTool('update_expense', { id: 'e1', amount: -50, confirmed: true }, c);
    expect(c.actions.updateExpense).toHaveBeenCalledWith('e1', { amount: 50 });
  });

  it('update_expense cai em "out" para uma categoria desconhecida, tal como add_expense', () => {
    const c = writeCtx(seed());
    execTool('update_expense', { id: 'e1', cat: 'inventada', confirmed: true }, c);
    expect(c.actions.updateExpense).toHaveBeenCalledWith('e1', { cat: 'out' });
  });

  it('update_expense normaliza a data e nunca guarda uma que nao percebe', () => {
    const c = writeCtx(seed());
    execTool('update_expense', { id: 'e1', date: '03/09/2026', confirmed: true }, c);
    expect(c.actions.updateExpense).toHaveBeenCalledWith('e1', { date: '2026-09-03' });

    const c2 = writeCtx(seed());
    execTool('update_expense', { id: 'e1', date: 'amanha talvez', confirmed: true }, c2);
    expect(c2.actions.updateExpense.mock.calls[0][1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('update_expense trunca a descricao, tal como add_expense', () => {
    const c = writeCtx(seed());
    execTool('update_expense', { id: 'e1', desc: 'x'.repeat(500), confirmed: true }, c);
    expect(c.actions.updateExpense.mock.calls[0][1].desc).toHaveLength(60);
  });

  it('update_goal continua a converter uma string numerica no alvo', () => {
    const c = writeCtx(seed());
    execTool('update_goal', { id: 'g1', target: '12000', confirmed: true }, c);
    expect(c.actions.updateGoal).toHaveBeenCalledWith('g1', { target: 12000 });
  });

  /* coerceNumericFields (o fallback generico anterior) so tratava campos
     NUMERICOS — 'name' passava tal e qual, sem limite: update_goal deixava
     gravar um nome de qualquer tamanho, ao contrario de add_goal (txt()) e de
     update_expense (que ja tinha o seu proprio saneador). Agora update_goal
     usa o MESMO saneador de add_goal (GOAL_FIELD_SANITIZERS), tal como
     update_expense ja usa o de add_expense. */
  it('update_goal trunca o nome, tal como add_goal e update_expense', () => {
    const c = writeCtx(seed());
    execTool('update_goal', { id: 'g1', name: 'x'.repeat(500), confirmed: true }, c);
    expect(c.actions.updateGoal.mock.calls[0][1].name).toHaveLength(60);
  });

  /* update_income vivia sem o saneador de add_income: um valor negativo
     escrevia direto no estado (subtraindo do total em vez de somar) e um dia
     fora de 1-31 tambem. Agora e o MESMO saneador dos dois lados
     (INCOME_FIELD_SANITIZERS) — ver sanitizeIncomeFields. */
  it('update_income aplica o mesmo saneador de add_income: valor sempre positivo, dia 1-31', () => {
    const c = writeCtx(seed());
    execTool('update_income', { id: 'i1', amount: -2000, day: 999, confirmed: true }, c);
    expect(c.actions.updateIncome).toHaveBeenCalledWith('i1', { amount: 2000, day: 1 });
  });

  /* Mesma correcao para update_recurring: valor negativo, categoria
     desconhecida e nome sem limite passavam direto. Agora o MESMO saneador de
     add_recurring (RECURRING_FIELD_SANITIZERS). */
  it('update_recurring aplica o mesmo saneador de add_recurring: valor positivo, categoria conhecida, nome limitado', () => {
    const c = writeCtx(seed());
    execTool('update_recurring', { id: 'r1', amount: -25, cat: 'inventada', name: 'x'.repeat(500), confirmed: true }, c);
    const patch = c.actions.updateRecurring.mock.calls[0][1];
    expect(patch.amount).toBe(25);
    expect(patch.cat).toBe('out');
    expect(patch.name).toHaveLength(60);
  });

  /* O cartao de confirmacao (PendingActionCard) so mostra `label` — se
     ficasse so com o registo ANTIGO, confirmar uma alteracao para -2000
     mostrava "Salario · 2000.00 EUR" (o valor ANTIGO, coincidindo por azar
     com o |amount| do pedido) e nunca deixava ver o valor de facto gravado.
     Agora o label mostra "antes → depois", com o `after` ja saneado. */
  it('a pre-visualizacao de uma alteracao mostra o valor novo, saneado, nao so o antigo', () => {
    const c = writeCtx(seed());
    const r = execTool('update_income', { id: 'i1', amount: -2000 }, c);
    expect(r.pending).toBe(true);
    expect(r.preview.label).toContain('1800.00 EUR');
    expect(r.preview.label).toContain('2000.00 EUR');
    expect(r.preview.label).not.toContain('-2000.00 EUR');
    expect(r.preview.label).toMatch(/→/);
  });

  it('cobre as restantes coleccoes', () => {
    const c = writeCtx(seed());
    expect(execTool('delete_goal', { id: 'g1' }, c).pending).toBe(true);
    expect(execTool('delete_income', { id: 'i1' }, c).pending).toBe(true);
    expect(execTool('delete_recurring', { id: 'r1' }, c).pending).toBe(true);
    expect(execTool('update_goal', { id: 'g1', target: 12000 }, c).pending).toBe(true);
    execTool('delete_goal', { id: 'g1', confirmed: true }, c);
    expect(c.actions.deleteGoal).toHaveBeenCalledWith('g1');
  });

  // As quatro tools acima so verificam `.pending` para incomes/recurring — um
  // ponteiro errado em COLLECTIONS (ex.: update_income a chamar deleteIncome)
  // passaria nesses testes na mesma. Aqui confirmamos o caminho ate ao fim:
  // a action certa e chamada, com o id certo (e, no update, o patch certo).
  it('update_income escreve na action certa, com o patch certo, quando confirmado', () => {
    const c = writeCtx(seed());
    execTool('update_income', { id: 'i1', amount: 2000, confirmed: true }, c);
    expect(c.actions.updateIncome).toHaveBeenCalledWith('i1', { amount: 2000 });
    expect(c.actions.deleteIncome).not.toHaveBeenCalled();
  });

  it('delete_income apaga na action certa, com o id certo, quando confirmado', () => {
    const c = writeCtx(seed());
    execTool('delete_income', { id: 'i1', confirmed: true }, c);
    expect(c.actions.deleteIncome).toHaveBeenCalledWith('i1');
    expect(c.actions.updateIncome).not.toHaveBeenCalled();
  });

  it('update_recurring escreve na action certa, com o patch certo, quando confirmado', () => {
    const c = writeCtx(seed());
    execTool('update_recurring', { id: 'r1', amount: 12.99, confirmed: true }, c);
    expect(c.actions.updateRecurring).toHaveBeenCalledWith('r1', { amount: 12.99 });
    expect(c.actions.deleteRecurring).not.toHaveBeenCalled();
  });

  it('delete_recurring apaga na action certa, com o id certo, quando confirmado', () => {
    const c = writeCtx(seed());
    execTool('delete_recurring', { id: 'r1', confirmed: true }, c);
    expect(c.actions.deleteRecurring).toHaveBeenCalledWith('r1');
    expect(c.actions.updateRecurring).not.toHaveBeenCalled();
  });

  it('nenhuma tool de criacao pede confirmacao', () => {
    const c = writeCtx(seed());
    expect(execTool('add_expense', { desc: 'X', amount: 1 }, c).ok).toBe(true);
  });
});

describe('tools de grupos', () => {
  const seed = () => ({
    people: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bruno' }],
    groups: [{ id: 'gr1', name: 'Algarve', memberIds: ['me', 'p1', 'p2'] }],
    groupEntries: [],
  });

  it('o ME_ID local acompanha o do store', () => {
    expect(TOOLS_ME_ID).toBe(ME_ID);
  });

  it('create_group cria com o proprio incluido', () => {
    const c = writeCtx(seed());
    const r = execTool('create_group', { name: 'Ferias', person_ids: ['p1'] }, c);
    expect(r.ok).toBe(true);
    const arg = c.actions.addGroup.mock.calls[0][0];
    expect(arg.name).toBe('Ferias');
    // ME_ID vem sempre em primeiro (convencao do store, ver withMe em
    // store.jsx) — 'p1' sozinho nao apanhava um prefixo ME_ID em falta.
    expect(arg.memberIds[0]).toBe(ME_ID);
    expect(arg.memberIds).toContain('p1');
  });

  it('add_person cria uma pessoa e devolve o id', () => {
    const c = writeCtx(seed());
    const r = execTool('add_person', { name: 'Carla' }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.addPerson.mock.calls[0][0].name).toBe('Carla');
    expect(r.data.id).toBeTruthy();
  });

  it('add_group_expense divide por igual por omissao e usa o proprio como pagador', () => {
    const c = writeCtx(seed());
    const r = execTool('add_group_expense', { group_id: 'gr1', desc: 'Jantar', amount: 60 }, c);
    expect(r.ok).toBe(true);
    const entry = c.actions.addGroupEntry.mock.calls[0][0];
    expect(entry.groupId).toBe('gr1');
    expect(entry.payerId).toBe('me');
    expect(entry.amount).toBe(60);
    expect(entry.kind).toBe('expense');
    expect(entry.splitMode).toBe('equal');
    expect(entry.shares.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(60, 2);
    expect(entry.shares).toHaveLength(3);
  });

  it('add_group_expense aceita um pagador diferente', () => {
    const c = writeCtx(seed());
    execTool('add_group_expense', { group_id: 'gr1', desc: 'Hotel', amount: 300, payer_id: 'p1' }, c);
    expect(c.actions.addGroupEntry.mock.calls[0][0].payerId).toBe('p1');
  });

  it('add_group_expense rejeita um grupo que nao existe', () => {
    expect(execTool('add_group_expense', { group_id: 'zz', desc: 'X', amount: 1 }, writeCtx(seed())))
      .toEqual({ error: 'not_found' });
  });

  it('add_group_expense rejeita um pagador que nao e membro', () => {
    const r = execTool('add_group_expense', { group_id: 'gr1', desc: 'X', amount: 1, payer_id: 'p9' }, writeCtx(seed()));
    expect(r.error).toBe('invalid_args');
  });

  it('add_group_expense cai em gcat "other" quando a categoria falta ou e desconhecida', () => {
    const c1 = writeCtx(seed());
    execTool('add_group_expense', { group_id: 'gr1', desc: 'X', amount: 1 }, c1);
    expect(c1.actions.addGroupEntry.mock.calls[0][0].gcat).toBe('other');

    const c2 = writeCtx(seed());
    execTool('add_group_expense', { group_id: 'gr1', desc: 'X', amount: 1, gcat: 'inventada' }, c2);
    expect(c2.actions.addGroupEntry.mock.calls[0][0].gcat).toBe('other');
  });

  it('settle_group regista um acerto entre dois membros', () => {
    const c = writeCtx(seed());
    const r = execTool('settle_group', { group_id: 'gr1', from_id: 'p1', to_id: 'me', amount: 20 }, c);
    expect(r.ok).toBe(true);
    const entry = c.actions.addGroupEntry.mock.calls[0][0];
    expect(entry.kind).toBe('settlement');
    expect(entry.fromId).toBe('p1');
    expect(entry.toId).toBe('me');
    expect(entry.shares).toBeUndefined();
  });

  it('settle_group rejeita um grupo que nao existe', () => {
    expect(execTool('settle_group', { group_id: 'zz', from_id: 'p1', to_id: 'me', amount: 20 }, writeCtx(seed())))
      .toEqual({ error: 'not_found' });
  });

  it('settle_group rejeita from_id/to_id que nao sao membros', () => {
    const c1 = writeCtx(seed());
    expect(execTool('settle_group', { group_id: 'gr1', from_id: 'p9', to_id: 'me', amount: 20 }, c1).error).toBe('invalid_args');
    expect(c1.actions.addGroupEntry).not.toHaveBeenCalled();

    const c2 = writeCtx(seed());
    expect(execTool('settle_group', { group_id: 'gr1', from_id: 'p1', to_id: 'p9', amount: 20 }, c2).error).toBe('invalid_args');
    expect(c2.actions.addGroupEntry).not.toHaveBeenCalled();
  });

  it('settle_group rejeita from_id igual a to_id, sem escrever', () => {
    const c = writeCtx(seed());
    const r = execTool('settle_group', { group_id: 'gr1', from_id: 'p1', to_id: 'p1', amount: 20 }, c);
    expect(r.error).toBe('invalid_args');
    expect(c.actions.addGroupEntry).not.toHaveBeenCalled();
  });

  it('delete_group_entry pede confirmacao antes de apagar', () => {
    const c = writeCtx({ ...seed(), groupEntries: [{ id: 'ge1', groupId: 'gr1', desc: 'Jantar', amount: 60 }] });
    const r = execTool('delete_group_entry', { id: 'ge1' }, c);
    expect(r.pending).toBe(true);
    expect(c.actions.deleteGroupEntry).not.toHaveBeenCalled();
    execTool('delete_group_entry', { id: 'ge1', confirmed: true }, c);
    expect(c.actions.deleteGroupEntry).toHaveBeenCalledWith('ge1');
  });
});

describe('WRITE_TOOL_SLICES', () => {
  it('cobre exatamente as tools de escrita nao-destrutivas — nem falta nenhuma, nem sobra nenhuma obsoleta', () => {
    // Bidirecional: uma tool nova em writeTools/groupTools sem entrada aqui
    // falha (falta), e uma entrada cuja tool foi removida/renomeada tambem
    // falha (sobra) — impede exatamente o desvio que causou o Gap 1.
    expect(new Set(Object.keys(WRITE_TOOL_SLICES))).toEqual(new Set(WRITE_TOOL_NAMES));
  });

  it('nunca lista uma tool destrutiva (essas nunca entram em `applied`)', () => {
    Object.keys(WRITE_TOOL_SLICES).forEach((name) => {
      expect(TOOLS[name]).toBeDefined();
      expect(TOOLS[name].destructive).not.toBe(true);
    });
  });

  it('add_group_expense mapeia para groupEntries E addedExp — addGroupEntry tambem reflete a minha parte', () => {
    expect(new Set(WRITE_TOOL_SLICES.add_group_expense)).toEqual(new Set(['groupEntries', 'addedExp']));
  });

  it('settle_group mapeia so para groupEntries — reflectExpenseFor devolve null para settlements', () => {
    expect(WRITE_TOOL_SLICES.settle_group).toEqual(['groupEntries']);
  });
});
