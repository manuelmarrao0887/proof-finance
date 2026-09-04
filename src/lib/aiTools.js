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
import { resolveAccountRef } from './accounts.js';
import { listAccounts } from './balances.js';

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

/* ── Tools de escrita ────────────────────────────────────────────────────
   As add_* criam um registo NOVO (nunca alteram nem apagam um existente) e
   por isso aplicam-se logo, sem confirmação. As duas excepções vivem aqui
   por proximidade temática mas estão marcadas `destructive`: set_budget e
   update_balance substituem um valor existente (limite, saldo) e passam pelo
   mesmo portão de pré-visualização das update_* / delete_*.
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
  // normalizeStmtDate devolve a entrada INTACTA quando não reconhece o formato
  // (lib/format.js, "Unknown formats pass through") — sem esta verificação uma
  // data inventada pelo modelo entrava tal e qual no estado. Datas são
  // comparadas como texto em toda a app (filtros de mês, orçamento, listagens),
  // por isso uma linha assim fica invisível em todos esses sítios. Formato
  // irreconhecível → hoje, a mesma omissão de quando não vem data nenhuma.
  const iso = d ? normalizeStmtDate(d) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayISO();
}
function txt(v, max) {
  return String(v == null ? '' : v).substring(0, max || 60);
}
function eur(n) {
  return (Number(n) || 0).toFixed(2) + ' EUR';
}

/* Fábrica de saneadores: uma tabela campo → função dá origem à MESMA rotina
   (percorrer as chaves presentes em `raw`, aplicar o saneador de cada uma) já
   usada para despesas — só as chaves presentes em `raw` são tratadas, para um
   patch parcial (update) continuar parcial. Cada coleção define a sua tabela
   uma única vez e o resultado serve tanto o caminho de CRIAÇÃO (add_*) como o
   de ALTERAÇÃO (update_*), para os dois nunca voltarem a divergir. */
function makeSanitizer(table) {
  return function sanitize(raw) {
    const out = {};
    Object.keys(raw).forEach((k) => {
      const f = table[k];
      if (f) out[k] = f(raw[k]);
    });
    return out;
  };
}

/* Despesa — antes de existir este saneador partilhado, update_expense fazia
   um Number() nu, e por aí passava um valor negativo (que em vez de somar,
   subtrai ao total da categoria), uma `cat` inexistente (a despesa fica
   invisível em qualquer resumo de orçamento), uma `date` que
   normalizeStmtDate devolve tal e qual quando não a reconhece (lib/format.js)
   e uma `desc` sem limite de tamanho. */
const EXPENSE_FIELD_SANITIZERS = {
  desc: (v) => txt(v),
  amount: (v) => Math.abs(Number(v) || 0),
  cat: (v) => safeCat(v),
  date: (v) => safeDate(v),
  // Guarda o texto tal como o modelo o passou (nome do banco ou "Banco ·
  // Tipo"); resolveAcctArg é que o troca pelo rótulo canónico de uma conta
  // existente antes de chegar a addExpense/updateExpense.
  acct: (v) => (v === undefined ? undefined : txt(v, 80)),
};
const sanitizeExpenseFields = makeSanitizer(EXPENSE_FIELD_SANITIZERS);

// Receita — o mesmo saneamento que add_income já aplicava (valor sempre
// positivo, dia 1-31); update_income vivia sem eles e podia gravar um saldo
// negativo ou um dia 999.
const INCOME_FIELD_SANITIZERS = {
  name: (v) => txt(v),
  amount: (v) => Math.abs(Number(v) || 0),
  day: (v) => safeDay(v),
};
const sanitizeIncomeFields = makeSanitizer(INCOME_FIELD_SANITIZERS);

// Recorrente — idem, espelhando add_recurring (valor positivo, categoria
// conhecida, dia 1-31, nome com limite).
const RECURRING_FIELD_SANITIZERS = {
  name: (v) => txt(v),
  amount: (v) => Math.abs(Number(v) || 0),
  cat: (v) => safeCat(v),
  day: (v) => safeDay(v),
};
const sanitizeRecurringFields = makeSanitizer(RECURRING_FIELD_SANITIZERS);

// Meta — nome com limite e os dois valores nunca NaN, tal como add_goal.
// `deadline` fica de fora de propósito: continua uma string livre, sem
// validação de formato (fora do âmbito desta ronda de correções).
const GOAL_FIELD_SANITIZERS = {
  name: (v) => txt(v),
  target: (v) => Number(v) || 0,
  current: (v) => Number(v) || 0,
  deadline: (v) => v,
};
const sanitizeGoalFields = makeSanitizer(GOAL_FIELD_SANITIZERS);

// Bancos/tipos válidos para update_balance vêm de ACCT_TEMPLATES (a MESMA
// lista que getAccts usa para expor dynAccts) — nunca reescrever à mão aqui,
// senão o schema desalinha da lista real e o modelo grava chaves órfãs
// (dynAccts[banco_tipo] que getAccts nunca lê de volta).
function uniq(arr) {
  return Array.from(new Set(arr));
}
const ACCT_BANKS = uniq(ACCT_TEMPLATES.map((a) => a.b));
const ACCT_TYPES = uniq(ACCT_TEMPLATES.map((a) => a.t));

// Conta nomeada pelo utilizador → rótulo de uma conta existente, ou erro
// amigável quando há várias. Devolve { acct } (pode ser undefined) ou { error }.
function resolveAcctArg(args, ctx) {
  if (!args.acct) return { acct: undefined };
  const r = resolveAccountRef(args.acct, listAccounts(ctx.state || {}));
  if (!r) return { acct: undefined };
  if (r.ambiguous) return { error: 'ambiguous_account', detail: 'Qual conta? ' + r.ambiguous.join(' | ') };
  return { acct: r.label };
}

const writeTools = {
  add_expense: {
    schema: {
      type: 'object',
      properties: {
        desc: { type: 'string', description: 'descricao curta' },
        amount: { type: 'number', description: 'valor em euros; o sinal e ignorado (guardado positivo)' },
        cat: { type: 'string', description: 'categoria: ' + CATS },
        date: { type: 'string', description: 'data YYYY-MM-DD; por omissao hoje' },
        acct: {
          type: 'string',
          description:
            'conta que pagou: nome do banco ou rótulo "Banco · Tipo" tal como aparece em accounts no contexto (ex.: "Activobank", "Revolut · Cartão de Crédito"); omitir se o utilizador não disser',
        },
      },
      required: ['desc', 'amount'],
    },
    description: 'Regista uma despesa nova.',
    run(args, ctx) {
      const ra = resolveAcctArg(args, ctx);
      if (ra.error) return ra;
      // As quatro chaves vão sempre (mesmo indefinidas) para o saneador
      // aplicar os defaults: cat -> 'out', date -> hoje. `acct` só entra
      // quando resolveAcctArg encontrou uma conta existente.
      const exp = {
        id: uid(),
        ...sanitizeExpenseFields({ desc: args.desc, amount: args.amount, cat: args.cat, date: args.date }),
        ...(ra.acct ? { acct: ra.acct } : {}),
      };
      ctx.actions.addExpense(exp);
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
        // O MESMO saneador de update_income (name/amount/day): ver
        // INCOME_FIELD_SANITIZERS. source/recurring/date ficam fora — nao sao
        // campos que update_income aceite (fora do ambito desta correcao).
        ...sanitizeIncomeFields({ name: args.name, amount: args.amount, day: args.day }),
        source: SOURCES.has(args.source) ? args.source : 'other',
        recurring: args.recurring !== false,
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
        // O MESMO saneador de update_goal (name/target/current): ver
        // GOAL_FIELD_SANITIZERS. `deadline` fica de fora aqui tambem — o
        // default '' e proprio da criacao, o saneador so garante o
        // passthrough quando o campo vem numa alteracao.
        ...sanitizeGoalFields({ name: args.name, target: args.target, current: args.current }),
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
        // O MESMO saneador de update_recurring: ver RECURRING_FIELD_SANITIZERS.
        // O default de categoria e 'sub' (nao 'out') so na criacao — aplica-se
        // ANTES do saneador, que so garante que o resultado e um id valido.
        ...sanitizeRecurringFields({ name: args.name, amount: args.amount, cat: args.cat || 'sub', day: args.day }),
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

  /* set_budget e update_balance são DESTRUTIVAS, apesar de viverem entre as
     tools de escrita: cada uma substitui um valor que já lá estava (o limite
     da categoria, o saldo da conta) e o valor antigo não se recupera. A regra
     do produto é "criar aplica-se logo; alterar e apagar pedem confirmação" —
     estas alteram, logo passam pelo mesmo portão de pré-visualização das
     tools update_ e delete_. Nunca entram em `applied` nem em
     WRITE_TOOL_SLICES. */
  set_budget: {
    destructive: true,
    schema: {
      type: 'object',
      properties: {
        cat: { type: 'string', description: 'id da categoria (ver list_categories)' },
        limit: { type: 'number', description: 'novo limite mensal em euros' },
        confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
      },
      required: ['cat', 'limit'],
    },
    description: 'Define o orcamento mensal de uma categoria. Substitui o limite atual — o utilizador confirma na app.',
    preview(args, { actions }) {
      const cur = (actions.getState().bdg || []).find((b) => b.id === args.cat);
      if (!cur) return notFound();
      const lm = Number(args.limit) || 0;
      return {
        action: 'update',
        kind: 'orçamento',
        label: (cur.nm || cur.id) + ' · ' + eur(cur.lm) + ' → ' + eur(lm),
        before: cur,
        after: { ...cur, lm },
        patch: { lm },
      };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      // updateCategory (bdg.map por id, com atualizador funcional) em vez de
      // reescrever o array inteiro lido antes do dispatch.
      ctx.actions.updateCategory(args.cat, p.patch);
      return ok({ cat: args.cat, limit: p.patch.lm });
    },
  },

  update_balance: {
    destructive: true,
    schema: {
      type: 'object',
      properties: {
        account_bank: { type: 'string', description: ACCT_BANKS.join(' | ') },
        account_type: { type: 'string', description: ACCT_TYPES.join(' | ') },
        value: { type: 'number', description: 'saldo em euros' },
        note: { type: 'string', description: 'nota opcional (ex: total antes de dividir)' },
        confirmed: { type: 'boolean', description: 'nao preencher: o utilizador e que confirma na app' },
      },
      required: ['account_bank', 'account_type', 'value'],
    },
    description: 'Atualiza o saldo de uma conta. Substitui o saldo atual — o utilizador confirma na app.',
    preview(args, { actions }) {
      // O par banco/tipo tem de existir em ACCT_TEMPLATES: getAccts só expõe
      // dynAccts['Banco_Tipo'] para pares que reconhece — uma chave que não
      // bate certo com nenhum par fica órfã (nunca entra no património,
      // get_overview ou UI) mesmo que a escrita "tenha sucesso".
      const valid = ACCT_TEMPLATES.some((a) => a.b === args.account_bank && a.t === args.account_type);
      if (!valid) return notFound();
      const key = args.account_bank + '_' + args.account_type;
      const cur = ((actions.getState() || {}).dynAccts || {})[key] || null;
      // Nota sem limite era o único campo desta tool que ia em bruto para o
      // estado — passa pelo mesmo txt() das restantes.
      const note = args.note != null && args.note !== '' ? txt(args.note) : null;
      const before = { key, value: cur ? cur.v : null, note: cur ? cur.n || null : null };
      const after = { key, value: Number(args.value) || 0, note: note || before.note };
      return {
        action: 'update',
        kind: 'saldo',
        label:
          args.account_bank + ' · ' + args.account_type + ' · ' +
          (before.value == null ? 'sem leitura' : eur(before.value)) + ' → ' + eur(after.value),
        before,
        after,
      };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      // MESMO caminho do fluxo manual (BalanceUpdateSheet): addBalanceReading
      // acrescenta ao balanceLog (o histórico que o BalanceHistorySheet mostra),
      // atualiza o saldo vivo e faz upsert do snapshot patrimonial do dia.
      // Escrever dynAccts à mão perdia as três coisas e apagava a nota anterior.
      // `note` indefinida = manter a nota que lá estava (regra da action).
      const note = args.note != null && args.note !== '' ? txt(args.note) : undefined;
      ctx.actions.addBalanceReading({
        account: { bank: args.account_bank, type: args.account_type, custom: false },
        value: p.after.value,
        date: todayISO(),
        note,
      });
      return ok({ key: p.after.key, value: p.after.value });
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
    // O MESMO saneador de add_expense: alterar uma despesa não pode aceitar o
    // que criar uma despesa rejeita (ver sanitizeExpenseFields).
    sanitize: sanitizeExpenseFields,
    fields: {
      desc: { type: 'string' },
      amount: { type: 'number' },
      cat: { type: 'string', description: 'categoria: ' + CATS },
      date: { type: 'string', description: 'data YYYY-MM-DD' },
      acct: { type: 'string', description: 'conta que pagou (nome do banco ou "Banco · Tipo")' },
    },
  },
  income: {
    kind: 'receita',
    slice: 'incomes',
    update: (a) => a.updateIncome,
    remove: (a) => a.deleteIncome,
    label: (x) => x.name + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR',
    // O MESMO saneador de add_income: ver INCOME_FIELD_SANITIZERS.
    sanitize: sanitizeIncomeFields,
    fields: { name: { type: 'string' }, amount: { type: 'number' }, day: { type: 'number' } },
  },
  goal: {
    kind: 'meta',
    slice: 'goals',
    update: (a) => a.updateGoal,
    remove: (a) => a.deleteGoal,
    label: (x) => x.name + ' · alvo ' + (Number(x.target) || 0).toFixed(2) + ' EUR',
    // O MESMO saneador de add_goal: ver GOAL_FIELD_SANITIZERS.
    sanitize: sanitizeGoalFields,
    fields: { name: { type: 'string' }, target: { type: 'number' }, current: { type: 'number' }, deadline: { type: 'string' } },
  },
  recurring: {
    kind: 'recorrente',
    slice: 'recurring',
    update: (a) => a.updateRecurring,
    remove: (a) => a.deleteRecurring,
    label: (x) => x.name + ' · ' + (Number(x.amount) || 0).toFixed(2) + ' EUR/mes',
    // O MESMO saneador de add_recurring: ver RECURRING_FIELD_SANITIZERS.
    sanitize: sanitizeRecurringFields,
    fields: { name: { type: 'string' }, amount: { type: 'number' }, cat: { type: 'string' }, day: { type: 'number' } },
  },
};

// Campos que nunca são escritos a partir dos argumentos do modelo.
const RESERVED = new Set(['id', 'confirmed']);

// Coerção genérica para uma colecção sem saneador próprio (hoje nenhuma:
// expense/income/goal/recurring têm todas a sua tabela — ver makeSanitizer.
// Fica como rede de segurança para uma colecção nova que ainda não defina
// `sanitize`): os campos numéricos passam por Number(), o resto vai como veio.
const NUMERIC_FIELDS = new Set(['amount', 'target', 'current', 'day']);
function coerceNumericFields(raw) {
  const out = {};
  Object.keys(raw).forEach((k) => {
    out[k] = NUMERIC_FIELDS.has(k) ? Number(raw[k]) : raw[k];
  });
  return out;
}

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
      const raw = {};
      Object.keys(args).forEach((k) => {
        if (!RESERVED.has(k) && c.fields[k]) raw[k] = args[k];
      });
      const patch = c.sanitize ? c.sanitize(raw) : coerceNumericFields(raw);
      const after = { ...cur, ...patch };
      // O cartao partilhado (PendingActionCard) so mostra `label` — se ficasse
      // so com c.label(cur) o utilizador confirmava as cegas: via o registo
      // ANTIGO e nunca o valor que estava de facto a aprovar (ex.: um -2000
      // ja saneado para 2000 na escrita, mas invisivel no cartao). Mesmo
      // padrao "antes → depois" de update_balance/set_budget, aqui aplicado
      // ao label completo do registo (as tools desta fabrica podem alterar
      // varios campos de uma vez, ao contrario das duas tools singulares).
      const label = cur === after || c.label(cur) === c.label(after)
        ? c.label(cur)
        : c.label(cur) + ' → ' + c.label(after);
      return { action: 'update', kind: c.kind, label, before: cur, after, patch };
    },
    run(args, ctx) {
      const p = this.preview(args, ctx);
      if (p.error) return p;
      // `acct` só existe em c.fields de 'expense' — para as outras colecções
      // patch.acct nunca está definido e este bloco não faz nada. O texto
      // bruto (já saneado por EXPENSE_FIELD_SANITIZERS) ainda não é um
      // rótulo de conta: resolve-o da MESMA forma que add_expense antes de
      // escrever. Conta desconhecida remove o campo (não apaga um acct já
      // gravado); ambígua devolve o mesmo erro amigável, sem escrever nada.
      let patch = p.patch;
      if (patch.acct !== undefined) {
        const ra = resolveAcctArg({ acct: patch.acct }, ctx);
        if (ra.error) return ra;
        patch = { ...patch };
        if (ra.acct) patch.acct = ra.acct;
        else delete patch.acct;
      }
      c.update(ctx.actions)(args.id, patch);
      return ok({ id: args.id, patch });
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
      // Um acerto de alguem consigo mesmo nao corrompe saldos (anula em
      // computeBalances), mas fica uma linha sem sentido no historico do
      // grupo que o utilizador depois tem de encontrar e apagar — a mesma
      // guarda que SettleSheet.jsx aplica na UI antes de chamar addGroupEntry.
      if (args.from_id === args.to_id)
        return { error: 'invalid_args', detail: 'from_id e to_id tem de ser pessoas diferentes' };
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

/* ── Slices que cada tool de escrita pode tocar ──────────────────────────
   E a fonte unica desta informacao: a UI (AssistantSheet.jsx) usa-a para
   saber o que repor no Anular, e o loop (aiChat.js) usa-a para distinguir
   escritas de leituras ao construir `applied`. Uma tool de escrita nova SEM
   entrada aqui faz falhar o teste de cobertura em aiTools.test.js — e o que
   impede esta tabela de divergir das tools (foi assim, sem teste, que
   add_group_expense ficou mapeada só para 'groupEntries' e o reflexo em
   'addedExp' passou ao lado).

   Verificado ação a ação contra as actions que cada `run()` chama em
   store.jsx — incluindo escritas indiretas, não só o `setField` óbvio:
     - add_group_expense/settle_group chamam ambas actions.addGroupEntry(),
       que escreve SEMPRE 'groupEntries' e, quando reflectExpenseFor()
       devolve um movimento (group.reflectMine — default true em addGroup,
       create_group nunca o define — e a MINHA parte > 0), escreve também
       'addedExp' com a despesa pessoal refletida (ver store.jsx:565-579).
       reflectExpenseFor() devolve sempre null para entry.kind==='settlement'
       (a primeira linha da função, antes de olhar para reflectMine) — por
       isso settle_group nunca toca 'addedExp'.
   Tools destrutivas nunca aparecem aqui: nunca entram em `applied` — só
   escrevem via confirmPending(), fora deste caminho (execTool devolve
   {pending} sem confirmed:true, nunca {ok}). São as update_* / delete_* da
   fábrica, delete_group_entry e — desde que passaram a pedir confirmação —
   set_budget e update_balance, que substituem um valor existente em vez de
   criarem um registo novo. */
export const WRITE_TOOL_SLICES = {
  add_expense: ['addedExp'],
  add_income: ['incomes'],
  add_goal: ['goals'],
  add_recurring: ['recurring'],
  add_category: ['bdg'],
  add_rule: ['rules'],
  add_snapshot: ['dynSnaps'],
  create_group: ['groups'],
  add_person: ['people'],
  add_group_expense: ['groupEntries', 'addedExp'],
  settle_group: ['groupEntries'],
};

// Nomes das tools de escrita não-destrutivas (as que podem legitimamente
// aparecer em `applied`) — exportado só para o teste de cobertura em
// aiTools.test.js confirmar que WRITE_TOOL_SLICES não diverge nem falta nem
// sobra nada face a writeTools/groupTools. Nada no runtime do assistente usa
// isto — só o teste. O filtro `destructive` aplica-se aos DOIS registos:
// writeTools também já tem tools destrutivas (set_budget, update_balance).
export const WRITE_TOOL_NAMES = [
  ...Object.keys(writeTools).filter((name) => !writeTools[name].destructive),
  ...Object.keys(groupTools).filter((name) => !groupTools[name].destructive),
];

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
