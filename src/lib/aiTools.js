/* ════════════════════════════════════════════════════════════════════════
   aiTools — registry de tools que o assistente pode chamar.

   Módulo PURO: sem React, sem Firebase. Recebe sempre `ctx = {state, actions}`
   e devolve dados serializáveis. Duas metades:
     - TOOLS / TOOL_SCHEMAS: o que o modelo vê.
     - execTool: o que corre de facto, contra as actions do store.

   Regras:
     - Tudo é endereçado por `id` (nunca por índice).
     - Um id inexistente devolve {error:'not_found'} ao MODELO, sem escrever.
     - update_* e delete_* são destrutivas: primeira chamada devolve
       {pending, preview}; só escrevem com args.confirmed === true.
   ════════════════════════════════════════════════════════════════════════ */

import { compute, getGroupsData, accts as ACCT_TEMPLATES } from './finance.js';
import { monthEffectiveLimits } from './budget.js';
import { computeBalances, simplifyDebts, resolveShares, GROUP_CATS } from './split.js';
import { uid, todayISO, normalizeStmtDate } from './format.js';

const CATS = 'rest,sup,cas,emp,seg,ani,sau,tel,car,sub,gym,cmb,neg,laz,trf,out';

// Espelha ME_ID de store/store.jsx. Não é importado de lá para este módulo
// continuar puro (store.jsx puxa React); um teste (aiTools.test.js) garante
// que as duas constantes não divergem.
export const ME_ID = 'me';

/* ── validação mínima de argumentos ──────────────────────────────────────
   Chega para apanhar campos obrigatórios em falta e tipos trocados; o resto
   é responsabilidade das actions do store. */
function validate(schema, args) {
  const req = schema.required || [];
  for (const k of req) {
    if (args[k] === undefined || args[k] === null || args[k] === '') return 'campo obrigatorio em falta: ' + k;
  }
  const props = schema.properties || {};
  for (const k of Object.keys(args)) {
    const p = props[k];
    if (!p) continue;
    if (p.type === 'number' && args[k] !== undefined && !Number.isFinite(Number(args[k])))
      return k + ' tem de ser um numero';
    if (p.type === 'string' && args[k] !== undefined && typeof args[k] !== 'string')
      return k + ' tem de ser texto';
  }
  return null;
}

const ok = (data) => ({ ok: true, data });
const notFound = () => ({ error: 'not_found' });

function currentYm() {
  return new Date().toISOString().slice(0, 10).slice(0, 7);
}

/* ── Tools de leitura ────────────────────────────────────────────────── */

const readTools = {
  query_expenses: {
    schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'data inicial YYYY-MM-DD (inclusive)' },
        to: { type: 'string', description: 'data final YYYY-MM-DD (inclusive)' },
        cat: { type: 'string', description: 'categoria: ' + CATS },
        text: { type: 'string', description: 'procura na descricao, sem distinguir maiusculas' },
        min: { type: 'number', description: 'valor minimo' },
        max: { type: 'number', description: 'valor maximo' },
        limit: { type: 'number', description: 'maximo de linhas a devolver (1-200, por omissao 50)' },
      },
      required: [],
    },
    description:
      'Procura despesas do utilizador. Devolve o id de cada despesa — usa esse id em update_expense e delete_expense.',
    run(args, { state }) {
      const list = state.addedExp || [];
      const from = args.from || '0000-00-00';
      const to = args.to || '9999-99-99';
      const text = args.text ? String(args.text).toLowerCase() : null;
      const rows = list.filter((x) => {
        const d = x.date || '';
        if (d < from || d > to) return false;
        if (args.cat && x.cat !== args.cat) return false;
        if (text && String(x.desc || '').toLowerCase().indexOf(text) === -1) return false;
        const a = Math.abs(Number(x.amount) || 0);
        if (args.min != null && a < Number(args.min)) return false;
        if (args.max != null && a > Number(args.max)) return false;
        return true;
      });
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const rawLimit = parseInt(args.limit, 10);
      const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);
      return ok({
        total: rows.length,
        rows: rows.slice(0, limit).map((e) => ({
          id: e.id,
          date: e.date,
          desc: e.desc,
          amount: e.amount,
          cat: e.cat,
        })),
      });
    },
  },

  get_overview: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Resumo patrimonial: saldos por conta, total de ativos, divida e patrimonio liquido.',
    run(_args, { state }) {
      const c = compute(state);
      return ok({
        totalAssets: c.tA,
        netWorth: c.nW,
        grossAssets: c.gross,
        cardDebt: c.cardDebt,
        loanOutstanding: c.loan ? c.loan.out : 0,
        byCategory: c.cT,
        // a.n é uma nota opcional, não a identidade da conta — o nome é
        // "banco · tipo" (a.b/a.t), como a UI mostra e como update_balance
        // (Task 4) vai pedir de volta em account_bank/account_type.
        accounts: (c.accts || []).map((a) => ({ name: a.b + ' · ' + a.t, category: a.c, value: a.v })),
      });
    },
  },

  get_budget: {
    schema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'mes YYYY-MM; por omissao o mes corrente' } },
      required: [],
    },
    description: 'Orcamento vs gasto real por categoria num mes.',
    run(args, { state }) {
      const month = args.month || currentYm();
      const m = monthEffectiveLimits(state.addedExp || [], state.bdg || [], month, !!state.rolloverOn);
      const categories = (state.bdg || []).map((b) => ({
        id: b.id,
        nm: b.nm,
        limit: b.lm,
        effective: m[b.id] ? m[b.id].eff : b.lm,
        spent: m[b.id] ? m[b.id].spent : 0,
      }));
      return ok({ month, categories });
    },
  },

  list_categories: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Categorias de despesa do utilizador, com o limite mensal de cada uma.',
    run(_args, { state }) {
      return ok((state.bdg || []).map((b) => ({ id: b.id, nm: b.nm, lm: b.lm })));
    },
  },

  list_goals: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Metas de poupanca com id, valor alvo, valor atual e prazo.',
    run(_args, { state }) {
      return ok((state.goals || []).map((g) => ({
        id: g.id, name: g.name, target: g.target, current: g.current, deadline: g.deadline,
      })));
    },
  },

  list_recurring: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Despesas recorrentes / subscricoes com id, valor, categoria e dia do mes.',
    run(_args, { state }) {
      return ok((state.recurring || []).map((r) => ({
        id: r.id, name: r.name, amount: r.amount, cat: r.cat, day: r.day,
      })));
    },
  },

  list_incomes: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Receitas com id, valor, origem e se sao recorrentes.',
    run(_args, { state }) {
      return ok((state.incomes || []).map((i) => ({
        id: i.id, name: i.name, amount: i.amount, source: i.source, recurring: i.recurring, day: i.day, date: i.date,
      })));
    },
  },

  list_people: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Pessoas registadas para despesas partilhadas.',
    run(_args, { state }) {
      const g = getGroupsData(state, false);
      return ok((g.people || []).map((p) => ({ id: p.id, name: p.name })));
    },
  },

  list_groups: {
    schema: { type: 'object', properties: {}, required: [] },
    description: 'Grupos de despesas partilhadas, com numero de membros.',
    run(_args, { state }) {
      const g = getGroupsData(state, false);
      return ok((g.groups || []).map((x) => ({
        id: x.id, name: x.name, members: (x.memberIds || []).length, archived: !!x.archived,
      })));
    },
  },

  get_group: {
    schema: {
      type: 'object',
      properties: { group_id: { type: 'string', description: 'id do grupo (ver list_groups)' } },
      required: ['group_id'],
    },
    description: 'Detalhe de um grupo: membros, saldo de cada um e transferencias sugeridas para acertar.',
    run(args, { state }) {
      const data = getGroupsData(state, false);
      const group = (data.groups || []).find((g) => g.id === args.group_id);
      if (!group) return notFound();
      const entries = (data.groupEntries || []).filter((e) => e.groupId === group.id);
      const memberIds = group.memberIds || [];
      const balances = computeBalances(entries, memberIds);
      const nameOf = (id) =>
        id === 'me' ? 'Eu' : ((data.people || []).find((p) => p.id === id) || {}).name || id;
      return ok({
        id: group.id,
        name: group.name,
        members: memberIds.map((id) => ({ id, name: nameOf(id), balance: balances[id] || 0 })),
        // Uma entrada de grupo é uma despesa (desc/payerId/shares) OU um
        // acerto (fromId/toId/method) — nunca as duas coisas. Mapear os dois
        // como se fossem despesa perdia quem pagou a quem num acerto.
        entries: entries.map((e) =>
          e.kind === 'settlement'
            ? { id: e.id, kind: e.kind, amount: e.amount, date: e.date, fromId: e.fromId, toId: e.toId, method: e.method }
            : { id: e.id, kind: e.kind, amount: e.amount, date: e.date, desc: e.desc, payerId: e.payerId }
        ),
        settlements: simplifyDebts(balances).map((s) => ({
          from: nameOf(s.from), to: nameOf(s.to), amount: s.amount,
        })),
      });
    },
  },
};

/* ── Tools de escrita não destrutivas ────────────────────────────────────
   Todas criam um registo novo (nunca alteram nem apagam um existente), por
   isso não pedem confirmação — ao contrário de update_* / delete_* (Task 5).
   Saneamento na fronteira: categoria desconhecida cai em 'out', dia fora de
   1-31 cai em 1, o valor de uma despesa é sempre guardado positivo. */

const CAT_IDS = new Set(CATS.split(','));
const SOURCES = new Set(['salary', 'freelance', 'dividend', 'rental', 'bonus', 'other']);

function safeCat(c) {
  return CAT_IDS.has(c) ? c : 'out';
}
function safeDay(d) {
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1;
}
function safeDate(d) {
  return d ? normalizeStmtDate(d) : todayISO();
}
function txt(v, max) {
  return String(v == null ? '' : v).substring(0, max || 60);
}

// Bancos/tipos válidos para update_balance vêm de ACCT_TEMPLATES (a MESMA
// lista que getAccts usa para expor dynAccts) — nunca reescrever à mão aqui,
// senão o schema desalinha da lista real e o modelo grava chaves órfãs
// (dynAccts[banco_tipo] que getAccts nunca lê de volta).
function uniq(arr) {
  return Array.from(new Set(arr));
}
const ACCT_BANKS = uniq(ACCT_TEMPLATES.map((a) => a.b));
const ACCT_TYPES = uniq(ACCT_TEMPLATES.map((a) => a.t));

const writeTools = {
  add_expense: {
    schema: {
      type: 'object',
      properties: {
        desc: { type: 'string', description: 'descricao curta' },
        amount: { type: 'number', description: 'valor em euros; o sinal e ignorado (guardado positivo)' },
        cat: { type: 'string', description: 'categoria: ' + CATS },
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
      },
      required: ['desc', 'amount'],
    },
    description: 'Regista uma despesa nova.',
    run(args, { actions }) {
      const exp = {
        id: uid(),
        desc: txt(args.desc),
        amount: Math.abs(Number(args.amount) || 0),
        cat: safeCat(args.cat),
        date: safeDate(args.date),
      };
      actions.addExpense(exp);
      return ok({ id: exp.id, ...exp });
    },
  },

  add_income: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        source: { type: 'string', description: 'salary | freelance | dividend | rental | bonus | other' },
        recurring: { type: 'boolean', description: 'true = todos os meses' },
        day: { type: 'number', description: 'dia do mes 1-31 quando recurring' },
        date: { type: 'string', description: 'data YYYY-MM-DD quando NAO e recorrente' },
      },
      required: ['name', 'amount'],
    },
    description: 'Regista uma receita (salario, freelance, dividendos...).',
    run(args, { actions }) {
      const inc = {
        id: uid(),
        name: txt(args.name),
        amount: Math.abs(Number(args.amount) || 0),
        source: SOURCES.has(args.source) ? args.source : 'other',
        recurring: args.recurring !== false,
        day: safeDay(args.day),
        date: args.date ? normalizeStmtDate(args.date) : undefined,
        createdAt: Date.now(),
      };
      actions.addIncome(inc);
      return ok({ id: inc.id });
    },
  },

  add_goal: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target: { type: 'number', description: 'valor alvo em euros' },
        current: { type: 'number', description: 'valor ja poupado' },
        deadline: { type: 'string', description: 'prazo YYYY-MM-DD' },
      },
      required: ['name', 'target'],
    },
    description: 'Cria uma meta de poupanca.',
    run(args, { actions }) {
      const g = {
        id: uid(),
        name: txt(args.name),
        target: Number(args.target) || 0,
        current: Number(args.current) || 0,
        deadline: args.deadline || '',
        color: '#3b6fee',
        createdAt: Date.now(),
      };
      actions.addGoal(g);
      return ok({ id: g.id });
    },
  },

  add_recurring: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        cat: { type: 'string', description: 'categoria: ' + CATS },
        day: { type: 'number', description: 'dia do mes 1-31' },
      },
      required: ['name', 'amount'],
    },
    description: 'Cria uma despesa recorrente (subscricao, mensalidade...).',
    run(args, { actions }) {
      const r = {
        id: uid(),
        name: txt(args.name),
        amount: Math.abs(Number(args.amount) || 0),
        cat: safeCat(args.cat || 'sub'),
        day: safeDay(args.day),
        createdAt: Date.now(),
      };
      actions.addRecurring(r);
      return ok({ id: r.id });
    },
  },

  add_category: {
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id curto, minusculas, sem espacos' },
        nm: { type: 'string', description: 'nome visivel' },
        lm: { type: 'number', description: 'limite mensal em euros' },
      },
      required: ['id', 'nm'],
    },
    description: 'Cria uma categoria de despesa nova.',
    run(args, { actions }) {
      const id = String(args.id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
      if (!id) return { error: 'invalid_args', detail: 'id vazio depois de normalizar' };
      const bdg = actions.getState().bdg || [];
      // Um id repetido faria set_budget (bdg.map por id) atualizar as duas
      // categorias ao mesmo tempo — rejeitar aqui, antes de escrever.
      if (bdg.some((b) => b.id === id)) return { error: 'invalid_args', detail: 'ja existe uma categoria com esse id' };
      const cat = { id, nm: txt(args.nm, 30), lm: Number(args.lm) || 0 };
      actions.addCategory(cat);
      return ok(cat);
    },
  },

  add_rule: {
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'texto a procurar na descricao' },
        cat: { type: 'string', description: 'categoria a aplicar: ' + CATS },
      },
      required: ['pattern', 'cat'],
    },
    description: 'Cria uma regra de categorizacao automatica.',
    run(args, { actions }) {
      const rule = { id: uid(), pattern: txt(args.pattern, 40), cat: safeCat(args.cat) };
      actions.addRule(rule);
      return ok({ id: rule.id });
    },
  },

  set_budget: {
    schema: {
      type: 'object',
      properties: {
        cat: { type: 'string', description: 'id da categoria (ver list_categories)' },
        limit: { type: 'number', description: 'novo limite mensal em euros' },
      },
      required: ['cat', 'limit'],
    },
    description: 'Define o orcamento mensal de uma categoria.',
    run(args, { actions }) {
      const bdg = actions.getState().bdg || [];
      if (!bdg.some((b) => b.id === args.cat)) return notFound();
      actions.setBdg(bdg.map((b) => (b.id === args.cat ? { ...b, lm: Number(args.limit) || 0 } : b)));
      return ok({ cat: args.cat, limit: Number(args.limit) || 0 });
    },
  },

  update_balance: {
    schema: {
      type: 'object',
      properties: {
        account_bank: { type: 'string', description: ACCT_BANKS.join(' | ') },
        account_type: { type: 'string', description: ACCT_TYPES.join(' | ') },
        value: { type: 'number', description: 'saldo em euros' },
        note: { type: 'string', description: 'nota opcional (ex: total antes de dividir)' },
      },
      required: ['account_bank', 'account_type', 'value'],
    },
    description: 'Atualiza o saldo de uma conta.',
    run(args, { actions }) {
      // O par banco/tipo tem de existir em ACCT_TEMPLATES: getAccts só expõe
      // dynAccts['Banco_Tipo'] para pares que reconhece — uma chave que não
      // bate certo com nenhum par fica órfã (nunca entra no património,
      // get_overview ou UI) mesmo que a escrita "tenha sucesso".
      const valid = ACCT_TEMPLATES.some((a) => a.b === args.account_bank && a.t === args.account_type);
      if (!valid) return notFound();
      const st = actions.getState();
      const key = args.account_bank + '_' + args.account_type;
      const dyn = { ...(st.dynAccts || {}) };
      dyn[key] = { v: Number(args.value) || 0, d: todayISO().replace(/-/g, '.'), n: args.note || null };
      actions.setDynAccts(dyn);
      return ok({ key, value: dyn[key].v });
    },
  },

  add_snapshot: {
    schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'etiqueta DD.MM' },
        liq: { type: 'number' }, poup: { type: 'number' }, inv: { type: 'number' },
        div: { type: 'number' }, xP: { type: 'number' }, xT: { type: 'number' }, tC: { type: 'number' },
      },
      required: ['label'],
    },
    description: 'Grava um snapshot patrimonial no historico.',
    run(args, { actions }) {
      const st = actions.getState();
      const snap = {
        l: txt(args.label, 8),
        liq: Number(args.liq) || 0, poup: Number(args.poup) || 0, inv: Number(args.inv) || 0,
        div: Number(args.div) || 0, xP: Number(args.xP) || 0, xT: Number(args.xT) || 0, tC: Number(args.tC) || 0,
      };
      actions.setDynSnaps([...(st.dynSnaps || []), snap]);
      return ok(snap);
    },
  },
};

/* ── Tools destrutivas ───────────────────────────────────────────────────
   Fábrica: cada coleção tem a mesma forma (encontrar por id, pré-visualizar,
   escrever só com confirmed). Evita repetir oito vezes o mesmo código. */

const COLLECTIONS = {
  expense: {
    kind: 'despesa',
    slice: 'addedExp',
    update: (a) => a.updateExpense,
    remove: (a) => a.deleteExpense,
    label: (x) => x.desc + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR · ' + (x.date || ''),
    fields: {
      desc: { type: 'string' },
      amount: { type: 'number' },
      cat: { type: 'string', description: 'categoria: ' + CATS },
      date: { type: 'string', description: 'data YYYY-MM-DD' },
    },
  },
  income: {
    kind: 'receita',
    slice: 'incomes',
    update: (a) => a.updateIncome,
    remove: (a) => a.deleteIncome,
    label: (x) => x.name + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR',
    fields: { name: { type: 'string' }, amount: { type: 'number' }, day: { type: 'number' } },
  },
  goal: {
    kind: 'meta',
    slice: 'goals',
    update: (a) => a.updateGoal,
    remove: (a) => a.deleteGoal,
    label: (x) => x.name + ' · alvo ' + (Number(x.target) || 0).toFixed(2) + ' EUR',
    fields: { name: { type: 'string' }, target: { type: 'number' }, current: { type: 'number' }, deadline: { type: 'string' } },
  },
  recurring: {
    kind: 'recorrente',
    slice: 'recurring',
    update: (a) => a.updateRecurring,
    remove: (a) => a.deleteRecurring,
    label: (x) => x.name + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR/mes',
    fields: { name: { type: 'string' }, amount: { type: 'number' }, cat: { type: 'string' }, day: { type: 'number' } },
  },
};

// Campos que nunca são escritos a partir dos argumentos do modelo.
const RESERVED = new Set(['id', 'confirmed']);

function findIn(ctx, slice, id) {
  return ((ctx.actions.getState() || {})[slice] || []).find((x) => x.id === id) || null;
}

function makeUpdateTool(key) {
  const c = COLLECTIONS[key];
  return {
    destructive: true,
    description: 'Altera uma ' + c.kind + ' existente. Usa o id devolvido pelas tools de leitura.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do registo' },
        ...c.fields,
        confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
      },
      required: ['id'],
    },
    preview(args, ctx) {
      const cur = findIn(ctx, c.slice, args.id);
      if (!cur) return notFound();
      const patch = {};
      Object.keys(args).forEach((k) => {
        if (!RESERVED.has(k) && c.fields[k]) patch[k] = k === 'amount' || k === 'target' || k === 'current' || k === 'day' ? Number(args[k]) : args[k];
      });
      return { action: 'update', kind: c.kind, label: c.label(cur), before: cur, after: { ...cur, ...patch }, patch };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      c.update(ctx.actions)(args.id, p.patch);
      return ok({ id: args.id, patch: p.patch });
    },
  };
}

function makeDeleteTool(key) {
  const c = COLLECTIONS[key];
  return {
    destructive: true,
    description: 'Apaga uma ' + c.kind + '. Usa o id devolvido pelas tools de leitura.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do registo' },
        confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
      },
      required: ['id'],
    },
    preview(args, ctx) {
      const cur = findIn(ctx, c.slice, args.id);
      if (!cur) return notFound();
      return { action: 'delete', kind: c.kind, label: c.label(cur), before: cur };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      c.remove(ctx.actions)(args.id);
      return ok({ id: args.id, deleted: true });
    },
  };
}

const destructiveTools = Object.keys(COLLECTIONS).reduce((acc, key) => {
  acc['update_' + key] = makeUpdateTool(key);
  acc['delete_' + key] = makeDeleteTool(key);
  return acc;
}, {});

/* ── Tools de grupos (despesas partilhadas) ──────────────────────────────
   Casca fina sobre as actions do store: a divisão vem sempre de split.js
   (resolveShares) e os invariantes de grupo (refletir a minha parte nas
   Despesas pessoais, manter linkedExpId consistente) são responsabilidade de
   actions.addGroupEntry — não se repetem aqui. */

const groupTools = {
  create_group: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'nome do grupo' },
        person_ids: { type: 'array', items: { type: 'string' }, description: 'ids de pessoas (ver list_people); o proprio entra sempre' },
      },
      required: ['name'],
    },
    description: 'Cria um grupo de despesas partilhadas.',
    run(args, { actions }) {
      const people = actions.getState().people || [];
      const known = new Set(people.map((p) => p.id));
      const ids = (Array.isArray(args.person_ids) ? args.person_ids : []).filter((id) => known.has(id));
      const g = { id: uid(), name: txt(args.name, 40), memberIds: [ME_ID, ...ids], createdAt: Date.now() };
      actions.addGroup(g);
      return ok({ id: g.id, memberIds: g.memberIds });
    },
  },

  add_person: {
    schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'nome da pessoa' } },
      required: ['name'],
    },
    description: 'Cria uma pessoa para usar em grupos de despesas partilhadas.',
    run(args, { actions }) {
      const p = { id: uid(), name: txt(args.name, 40) };
      actions.addPerson(p);
      return ok({ id: p.id, name: p.name });
    },
  },

  add_group_expense: {
    schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'id do grupo (ver list_groups)' },
        desc: { type: 'string' },
        amount: { type: 'number', description: 'valor total da despesa' },
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
        payer_id: { type: 'string', description: 'quem pagou; por omissao o proprio ("me")' },
        member_ids: { type: 'array', items: { type: 'string' }, description: 'quem divide; por omissao todos os membros' },
        gcat: { type: 'string', description: 'categoria da despesa de grupo (ver GROUP_CATS em lib/split.js)' },
      },
      required: ['group_id', 'desc', 'amount'],
    },
    description: 'Lanca uma despesa partilhada num grupo, dividida por igual.',
    run(args, { actions }) {
      const st = actions.getState();
      const group = (st.groups || []).find((g) => g.id === args.group_id);
      if (!group) return notFound();
      const members = group.memberIds || [];
      const payerId = args.payer_id || ME_ID;
      if (members.indexOf(payerId) === -1) return { error: 'invalid_args', detail: 'payer_id nao e membro do grupo' };
      const chosen = Array.isArray(args.member_ids) && args.member_ids.length
        ? args.member_ids.filter((id) => members.indexOf(id) !== -1)
        : members;
      if (!chosen.length) return { error: 'invalid_args', detail: 'nenhum membro valido para dividir' };
      const amount = Math.abs(Number(args.amount) || 0);
      // resolveShares devolve {shares, error} — nunca um array.
      const { shares, error } = resolveShares(
        'equal',
        amount,
        chosen.map((id) => ({ personId: id })),
        payerId
      );
      if (error) return { error: 'invalid_args', detail: error };
      const entry = {
        groupId: group.id,
        kind: 'expense',
        desc: txt(args.desc),
        amount,
        date: safeDate(args.date),
        payerId,
        splitMode: 'equal',
        shares,
        gcat: GROUP_CATS.some((c) => c.id === args.gcat) ? args.gcat : 'other',
      };
      const id = actions.addGroupEntry(entry);
      return ok({ id, groupId: group.id, amount });
    },
  },

  settle_group: {
    schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        from_id: { type: 'string', description: 'quem paga' },
        to_id: { type: 'string', description: 'quem recebe' },
        amount: { type: 'number' },
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
      },
      required: ['group_id', 'from_id', 'to_id', 'amount'],
    },
    description: 'Regista um acerto de contas entre dois membros de um grupo.',
    run(args, { actions }) {
      const st = actions.getState();
      const group = (st.groups || []).find((g) => g.id === args.group_id);
      if (!group) return notFound();
      const members = group.memberIds || [];
      if (members.indexOf(args.from_id) === -1 || members.indexOf(args.to_id) === -1)
        return { error: 'invalid_args', detail: 'from_id ou to_id nao sao membros do grupo' };
      const amount = Math.abs(Number(args.amount) || 0);
      // Um acerto NAO e uma despesa: kind 'settlement', com fromId/toId e sem
      // shares (ver split.js:114 e modals/SettleSheet.jsx). O store nunca
      // reflecte um settlement em addedExp (reflectExpenseFor).
      const entry = {
        groupId: group.id,
        kind: 'settlement',
        fromId: args.from_id,
        toId: args.to_id,
        amount,
        date: safeDate(args.date),
      };
      const id = actions.addGroupEntry(entry);
      return ok({ id, amount });
    },
  },

  delete_group_entry: {
    destructive: true,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do movimento (ver get_group)' },
        confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
      },
      required: ['id'],
    },
    description: 'Apaga uma despesa ou acerto de um grupo.',
    preview(args, { actions }) {
      const e = ((actions.getState() || {}).groupEntries || []).find((x) => x.id === args.id);
      if (!e) return notFound();
      return {
        action: 'delete',
        kind: 'movimento de grupo',
        label: (e.desc || 'Movimento') + ' · ' + (Number(e.amount) || 0).toFixed(2) + ' EUR',
        before: e,
      };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      ctx.actions.deleteGroupEntry(args.id);
      return ok({ id: args.id, deleted: true });
    },
  },
};

/* ── Registry + execução ─────────────────────────────────────────────── */

export const TOOLS = { ...readTools, ...writeTools, ...destructiveTools, ...groupTools };

// O `confirmed` existe no schema interno (o validador precisa dele), mas NUNCA
// e mostrado ao modelo: a confirmacao vem da UI, depois de o utilizador ver a
// pre-visualizacao. Se o modelo nao sabe que o campo existe, nao o pode forjar.
function modelParameters(schema) {
  const { confirmed, ...properties } = schema.properties || {};
  return { ...schema, properties };
}

export const TOOL_SCHEMAS = Object.keys(TOOLS).map((name) => ({
  type: 'function',
  function: {
    name,
    description: TOOLS[name].description,
    parameters: modelParameters(TOOLS[name].schema),
  },
}));

export function execTool(name, args, ctx) {
  const t = TOOLS[name];
  if (!t) return { error: 'unknown_tool' };
  const a = args && typeof args === 'object' ? args : {};
  const bad = validate(t.schema, a);
  if (bad) return { error: 'invalid_args', detail: bad };
  try {
    // Gate destrutivo: primeira chamada só pré-visualiza. O bloqueio vive aqui
    // e não na UI, para nenhum caminho de chamada o contornar.
    if (t.destructive && a.confirmed !== true) {
      const preview = t.preview(a, ctx);
      if (preview.error) return preview;
      return { pending: true, preview, call: { name, args: a } };
    }
    return t.run(a, ctx);
  } catch (e) {
    return { error: 'tool_failed', detail: (e && e.message) || 'erro' };
  }
}
