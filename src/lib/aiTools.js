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

import { compute, getGroupsData } from './finance.js';
import { monthEffectiveLimits } from './budget.js';
import { computeBalances, simplifyDebts } from './split.js';

const CATS = 'rest,sup,cas,emp,seg,ani,sau,tel,car,sub,gym,cmb,neg,laz,trf,out';

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

/* ── Registry + execução ─────────────────────────────────────────────── */

export const TOOLS = { ...readTools };

export const TOOL_SCHEMAS = Object.keys(TOOLS).map((name) => ({
  type: 'function',
  function: {
    name,
    description: TOOLS[name].description,
    parameters: TOOLS[name].schema,
  },
}));

export function execTool(name, args, ctx) {
  const t = TOOLS[name];
  if (!t) return { error: 'unknown_tool' };
  const a = args && typeof args === 'object' ? args : {};
  const bad = validate(t.schema, a);
  if (bad) return { error: 'invalid_args', detail: bad };
  try {
    return t.run(a, ctx);
  } catch (e) {
    return { error: 'tool_failed', detail: (e && e.message) || 'erro' };
  }
}
