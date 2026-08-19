/* ════════════════════════════════════════════════════════════════════════
   PROOF. Finance — pure finance logic, ported VERBATIM from the original
   (lines 256-810, plus chrt at 615) and adapted to read from an explicit
   `state` object instead of module globals. The MATH IS IDENTICAL.

   `state` is the persisted store slice plus a couple of view fields the
   original read from globals:
     {
       currentUser,                 // truthy => authenticated (not preview)
       dynAccts, dynSnaps, addedExp, // persisted user data
       incomes, recurring, goals, bdg, customAccts, rules,
       em,                          // expense-month index 0..4 (default 3)
       forecastMonths,              // cash-flow horizon
     }

   Preview mode (no logged-in user) shows the demo seed arrays below. Once a
   user is authed, everything comes from their own data.

   Functions take the relevant slices explicitly. Where the original called a
   sibling accessor (e.g. getAccts() inside compute()), we call the exported
   equivalent passing `state` through so behaviour is preserved 1:1.
   ════════════════════════════════════════════════════════════════════════ */

/* ══ DEMO / SEED DATA (orig 256-285) — preview mode only ══ */

export const hist = [
  { l: '11/04', liq: 1313.08, poup: 4136.06, inv: 16141.02, div: 77865.69, xP: 9637.56, xT: 476.55, tC: 2073.73 },
  { l: '16/04', liq: 1283.48, poup: 4136.06, inv: 16620.46, div: 77865.69, xP: 10293.54, xT: 495.87, tC: 2175.17 },
  { l: '29/04', liq: 621.57, poup: 7055.85, inv: 16553.68, div: 77555.06, xP: 10429.01, xT: 490.53, tC: 2228.09 },
];

export const accts = [
  { b: 'Bankinter', t: 'Conta a Ordem', v: 292.32, n: '584,64 / 2', c: 'Liquidez' },
  { b: 'Activobank', t: 'Conta a Ordem', v: 325.46, c: 'Liquidez' },
  { b: 'Revolut', t: 'Conta a Ordem', v: 0, c: 'Liquidez' },
  { b: 'Moey', t: 'Conta a Ordem', v: 3.79, n: '3 contas', c: 'Liquidez' },
  { b: 'Trade Republic', t: 'Poupanca', v: 7055.85, n: 'Juros: 82 EUR', c: 'Poupanca' },
  { b: 'Trade Republic', t: 'Corretagem', v: 2228.09, n: '44%', c: 'Investimentos' },
  { b: 'Trade Republic', t: 'Private Markets', v: 2060.8, n: '41%', c: 'Investimentos' },
  { b: 'Trade Republic', t: 'Rend. Fixo', v: 752.24, n: '15%', c: 'Investimentos' },
  { b: 'XTB', t: 'Transações', v: 490.53, n: 'P&L: -8,42', c: 'Investimentos' },
  { b: 'XTB', t: 'Planos Invest.', v: 10429.01, n: 'P&L: +1.228', c: 'Investimentos' },
  { b: 'Goparity', t: 'P2P Lending', v: 555.88, n: 'Juros: 82,24', c: 'Investimentos' },
  { b: 'Raize', t: 'P2P Lending', v: 37.13, c: 'Investimentos' },
];

export const ln = { cap: 90000, out: 77555.06, pay: 485.83 };

export const bdgDefault = [
  { id: 'rest', nm: 'Restauração', lm: 250 }, { id: 'sup', nm: 'Supermercado', lm: 250 }, { id: 'cas', nm: 'Prestação Casa', lm: 350 },
  { id: 'emp', nm: 'Empregada', lm: 360 }, { id: 'seg', nm: 'Seguros', lm: 100 }, { id: 'ani', nm: 'Animais', lm: 105 },
  { id: 'sau', nm: 'Saúde', lm: 40 }, { id: 'tel', nm: 'Telecom', lm: 60 }, { id: 'car', nm: 'Carro', lm: 55 },
  { id: 'sub', nm: 'Subscrições', lm: 50 }, { id: 'gym', nm: 'Ginásio', lm: 36 }, { id: 'cmb', nm: 'Combustível', lm: 90 },
  { id: 'neg', nm: 'Negócio', lm: 50 }, { id: 'laz', nm: 'Lazer', lm: 100 }, { id: 'comp', nm: 'Compras', lm: 100 }, { id: 'bern', nm: 'Despesas Bernardo', lm: 100 }, { id: 'trf', nm: 'Transferências', lm: 100 }, { id: 'out', nm: 'Outros', lm: 30 },
];

export const byC = {
  rest: [509.52, 328.65, 383, 135.66], sup: [157.57, 348.81, 333.48, 50.5], cas: [350, 350, 350, 0], emp: [0, 360, 360, 0],
  seg: [285.82, 121.58, 95.26, 115.94], ani: [20, 224.98, 0, 0], sau: [0, 0, 75.92, 17], tel: [57.88, 59.71, 118.38, 0],
  car: [56.19, 13.53, 95.53, 13.53], sub: [34.46, 34.46, 76.95, 26.03], gym: [0, 0, 0, 35.9], cmb: [58.62, 0, 208.57, 0],
  neg: [61.66, 83.28, 2.25, 12], laz: [22.3, 77.7, 134.67, 79.99], trf: [183.87, 76.7, 178.68, 110], out: [77.89, 35.4, 9.46, 0.36],
};

export const txn = {
  rest: [[['McDonalds', 42.35], ['Adega Lampeira', 54.5], ['Rest Browers', 69.5], ['Outros', 343.17]], [['McDonalds', 43.65], ['Pare e Prove', 60.5], ['Outros', 224.5]], [['O Tradicional', 51.2], ['Kanto Fusion', 55], ['Outros', 276.8]], [['O Tradicional', 36.7], ['Uber Eats', 16.81], ['H3', 12.95], ['Outros', 69.2]]],
  sup: [[['Pingo Doce', 118.27], ['Continente', 31.06], ['Lidl', 8.24]], [['Continente', 179.83], ['Pingo Doce', 155.69]], [['Pingo Doce', 250.33], ['Continente', 83.15]], [['Pingo Doce', 29.15], ['Continente', 21.35]]],
  seg: [[['Fidelidade', 190.56], ['MGEN', 67.64], ['Medis', 10.9], ['Barkibu', 16.72]], [['Seg.Social', 26.32], ['MGEN', 67.64], ['Medis', 10.9], ['Barkibu', 16.72]], [['MGEN', 67.64], ['Medis', 10.9], ['Barkibu', 16.72]], [['Seg.Social', 31.58], ['MGEN', 67.64], ['Barkibu', 16.72]]],
  cas: [[['TRF Bankinter', 350]], [['TRF Bankinter', 350]], [['TRF Bankinter', 350]], []],
  emp: [[], [['Atilio Gregorio', 360]], [['Ana Gregorio', 360]], []],
};

export const sal = [1923.54, 1849.33, 1898.89, null];

export const cCol = {
  Liquidez: '#3b6fee',
  Poupanca: '#3fc97a',
  Investimentos: '#7b5fe0',
  Cripto: '#f5a623',
  Imobiliario: '#f25592',
  'Cartão de crédito': '#e5533d',
  Outros: '#9aa3b5',
};

// Rótulo legível das categorias de conta (as chaves internas ficam sem acento
// por compatibilidade com os dados já guardados).
export const ACCT_CAT_LABEL = {
  Liquidez: 'Liquidez',
  Poupanca: 'Poupança',
  Investimentos: 'Investimentos',
  Cripto: 'Cripto',
  Imobiliario: 'Imobiliário',
  'Cartão de crédito': 'Cartão de crédito',
  Outros: 'Outros',
};
export const acctCatLabel = (c) => ACCT_CAT_LABEL[c] || c;

// Categoria reservada para cartões de crédito. O "saldo" de um cartão é DÍVIDA:
// contribui NEGATIVAMENTE para o património. Ver cardUsage / getAcctsLive.
export const CARD_CAT = 'Cartão de crédito';

/* ══ MODE ACCESSORS (orig 582-610) ══
   In the original isPreviewMode() === !currentUser. Here we read state.currentUser. */

export function isPreviewMode(state) {
  return !(state && state.currentUser);
}

export function getByC(state) {
  return isPreviewMode(state) ? byC : {};
}

export function getSal(state) {
  return isPreviewMode(state) ? sal : [null, null, null, null];
}

export function getLoan(state) {
  return isPreviewMode(state) ? ln : { cap: 0, out: 0, pay: 0 };
}

export function getAccts(state) {
  // Preview mode: show demo accounts.
  // Authenticated mode: user's custom accounts (customAccts[]) + any dynAccts overrides on templates.
  if (isPreviewMode(state)) return accts;
  const dynAccts = state.dynAccts;
  const customAccts = state.customAccts || [];
  const out = [];
  // Dynamic overrides on template accounts
  if (dynAccts && Object.keys(dynAccts).length > 0) {
    accts.forEach(function (a) {
      const key = a.b + '_' + a.t;
      if (dynAccts[key] !== undefined) {
        out.push(
          Object.assign({}, a, {
            v: dynAccts[key].v,
            updated: dynAccts[key].d,
            n: dynAccts[key].n || a.n,
          })
        );
      }
    });
  }
  // Custom user-created accounts
  if (customAccts && customAccts.length) {
    customAccts.forEach(function (a) {
      out.push({
        id: a.id,
        b: a.bank,
        t: a.type,
        v: a.value || 0,
        n: a.note || '',
        c: a.category || 'Liquidez',
        currency: a.currency || 'EUR',
        custom: true,
        updated: a.updated || null,
        plafond: a.plafond != null ? Number(a.plafond) || 0 : 0,
      });
    });
  }
  return out;
}

/* ══ getAcctsLive ══
   Transaction-adjusted account values for DISPLAY/totals.

   The adjustment is by SOURCE, not date:
   - A MANUAL expense/income allocated to an account ALWAYS moves its balance
     (the user is tracking something the bank balance doesn't yet reflect).
   - An IMPORTED transaction (extrato / IA, flagged `imported`) NEVER moves it —
     it already came from the bank, so it is part of the latest reading.

   Snapshots/history keep using the raw getAccts so the past is never rewritten.
   Match is by the picker label "banco · tipo" stored on exp.acct / income.acct,
   compared normalised (accents/case/spacing tolerant). */
export function getAcctsLive(state) {
  const ca = getAccts(state);
  if (isPreviewMode(state)) return ca; // demo accounts: no live adjust
  const addedExp = (state && state.addedExp) || [];
  const incomes = (state && state.incomes) || [];
  const transfers = (state && state.transfers) || [];
  return ca.map(function (a) {
    const labelNorm = normAcct(a.b + ' · ' + a.t);
    // Cartão de crédito: o valor exibido é a DÍVIDA em negativo (−used). As
    // despesas do cartão e os pagamentos entram via cardUsage, não pelo delta
    // normal (uma despesa no cartão não desconta de nenhuma conta à ordem).
    if (a.c === CARD_CAT) {
      const u = cardUsage(state, a.b + ' · ' + a.t);
      return Object.assign({}, a, { v: u.used ? -u.used : 0, used: u.used, spent: u.spent, paid: u.paid, plafond: a.plafond || 0 });
    }
    let delta = 0;
    addedExp.forEach(function (x) {
      if (x.imported || x.settled) return; // imported (extrato/IA) or already settled into a reading → não desconta
      if (normAcct(x.acct) !== labelNorm) return;
      delta -= Number(x.amount) || 0; // manual → desconta sempre (ignora data)
    });
    incomes.forEach(function (i) {
      // Only one-off, manual, unsettled incomes move a specific account's balance;
      // recurring incomes are modelled in the cash-flow projection instead.
      if (i.imported || i.settled || i.recurring !== false) return;
      if (normAcct(i.acct) !== labelNorm) return;
      delta += Number(i.amount) || 0;
    });
    // Transferências entre contas: saem de `from` (−), entram em `to` (+). Cada
    // lado tem o seu settle (fica "saldado" quando a respetiva conta é lida).
    transfers.forEach(function (tr) {
      const amt = Number(tr.amount) || 0;
      if (!tr.settledFrom && normAcct(tr.from) === labelNorm) delta -= amt;
      if (!tr.settledTo && normAcct(tr.to) === labelNorm) delta += amt;
    });
    return delta ? Object.assign({}, a, { v: a.v + delta }) : a;
  });
}

/* ══ cardUsage ══
   Estado da dívida de um cartão de crédito, por label "banco · tipo":
   - spent: soma de TODAS as despesas alocadas ao cartão (manuais + importadas)
   - paid:  soma dos pagamentos ao cartão (transferências cujo `to` é o cartão)
   - used:  dívida em aberto = spent − paid (pode ser <0 se houver pagamento a mais)
   O plafond disponível = plafond − used (calculado onde há acesso ao plafond). */
export function cardUsage(state, cardLabel) {
  const norm = normAcct(cardLabel);
  let spent = 0;
  let paid = 0;
  ((state && state.addedExp) || []).forEach(function (x) {
    if (normAcct(x.acct) === norm) spent += Number(x.amount) || 0;
  });
  ((state && state.transfers) || []).forEach(function (t) {
    if (normAcct(t.to) === norm) paid += Number(t.amount) || 0;
  });
  return { spent: spent, paid: paid, used: spent - paid };
}

// Normalise an account label for matching: strip accents, lowercase, collapse
// spaces. Empty string for null/undefined (never matches a real label).
export function normAcct(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* ══ snapshotFromState ══
   Build a patrimonial snapshot {l,liq,poup,inv,div,xP,xT,tC} from the current
   accounts, used to feed the evolution charts (dynSnaps) when a balance is
   updated. xP/xT/tC are investment sub-series we don't break down here → 0. */
export function snapshotFromState(state, label) {
  const ca = getAccts(state);
  let liq = 0,
    poup = 0,
    inv = 0;
  ca.forEach(function (a) {
    if (a.c === 'Liquidez') liq += a.v;
    else if (a.c === 'Poupanca') poup += a.v;
    else if (a.c === 'Investimentos') inv += a.v;
  });
  const loan = getLoan(state);
  return { l: label, liq: liq, poup: poup, inv: inv, div: loan.out || 0, xP: 0, xT: 0, tC: 0 };
}

// Série mensal de património a partir dos snapshots: {label, assets, debt, net}.
export function netWorthSeries(state) {
  const snaps = getAllHist(state);
  return (snaps || []).map(function (s) {
    const assets = (s.liq || 0) + (s.poup || 0) + (s.inv || 0);
    return { label: s.l, assets: assets, debt: s.div || 0, net: assets - (s.div || 0) };
  });
}

export function getAllHist(state) {
  const dynSnaps = (state && state.dynSnaps) || [];
  if (isPreviewMode(state)) return hist.concat(dynSnaps);
  if (dynSnaps && dynSnaps.length > 0) return dynSnaps.slice();
  return [{ l: 'hoje', liq: 0, poup: 0, inv: 0, div: 0, xP: 0, xT: 0, tC: 0 }];
}

/* ══ COMPUTE (orig 288-300) ══ */

export function compute(state) {
  const ca = getAcctsLive(state); // display totals reflect live (txn-adjusted) balances
  const ah = getAllHist(state);
  const _ln = getLoan(state);
  const g = {};
  ca.forEach(function (a) {
    if (!g[a.c]) g[a.c] = [];
    g[a.c].push(a);
  });
  const ct = {};
  Object.keys(g).forEach(function (c) {
    ct[c] = g[c].reduce(function (s, i) {
      return s + i.v;
    }, 0);
  });
  let ta = 0;
  Object.keys(ct).forEach(function (k) {
    ta += ct[k];
  });
  // Ativos brutos (só o que é positivo) e dívida de cartões — para mostrar
  // "Ativos X · Dívida Y" em vez de um total já líquido da dívida.
  let gross = 0;
  let cardDebt = 0;
  ca.forEach(function (a) {
    if (a.c === CARD_CAT) cardDebt += Math.max(0, -(a.v || 0));
    else gross += a.v || 0;
  });
  const nw = ta - _ln.out;
  const pp = _ln.cap > 0 ? ((_ln.cap - _ln.out) / _ln.cap) * 100 : 0;
  const h0 = ah[0] || { liq: 0, poup: 0, inv: 0, div: 0 };
  const hL = ah[ah.length - 1] || { liq: 0, poup: 0, inv: 0, div: 0 };
  const ad = hL.liq + hL.poup + hL.inv - (h0.liq + h0.poup + h0.inv);
  return { accts: ca, hist: ah, grp: g, cT: ct, tA: ta, nW: nw, pp: pp, aD: ad, loan: _ln, gross: gross, cardDebt: cardDebt, debt: cardDebt + (_ln.out || 0) };
}

/* ══ isNewUser (orig 493-502) ══ */

export function isNewUser(state) {
  if (isPreviewMode(state)) return false;
  const { dynSnaps, addedExp, goals, incomes, recurring, customAccts, dynAccts } = state;
  return (
    (!dynSnaps || dynSnaps.length === 0) &&
    (!addedExp || addedExp.length === 0) &&
    (!goals || goals.length === 0) &&
    (!incomes || incomes.length === 0) &&
    (!recurring || recurring.length === 0) &&
    (!customAccts || customAccts.length === 0) &&
    (!dynAccts || Object.keys(dynAccts).length === 0)
  );
}

/* ══ cashFlowProjection (orig 642-682) ══ */

export function cashFlowProjection(state, months) {
  months = months || (state && state.forecastMonths) || 3;
  const now = new Date();
  const incomes = (state && state.incomes) || [];
  const recurring = (state && state.recurring) || [];
  // Starting liquid: categoria "Liquidez" (live, txn-adjusted)
  const ca = getAcctsLive(state);
  let liquid = 0;
  ca.forEach(function (a) {
    if (a.c === 'Liquidez') liquid += a.v;
  });
  // Recurring monthly income (only the recurring ones)
  let monthlyIncome = 0;
  incomes.forEach(function (i) {
    if (i.recurring !== false) monthlyIncome += i.amount || 0;
  });
  // Recurring monthly expenses + loan payment
  let monthlyRecExpense = 0;
  recurring.forEach(function (r) {
    monthlyRecExpense += r.amount || 0;
  });
  const loanPay = getLoan(state).pay || 0;
  // Average non-recurring expense from history (per month)
  const nonRecExpenses = [];
  const _byC = getByC(state);
  for (let mIdx = 0; mIdx < 4; mIdx++) {
    let t = 0;
    Object.keys(_byC).forEach(function (k) {
      if (_byC[k] && _byC[k][mIdx] != null) t += _byC[k][mIdx];
    });
    nonRecExpenses.push(t);
  }
  const avgNonRec =
    nonRecExpenses.slice(0, 3).reduce(function (s, v) {
      return s + v;
    }, 0) / 3;
  const discretionary = Math.max(avgNonRec - monthlyRecExpense - loanPay, 200);
  const rows = [];
  let bal = liquid;
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  for (let m = 1; m <= months; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    let inc = monthlyIncome;
    // One-off incomes in this month
    const ymStr = d.toISOString().slice(0, 7);
    incomes.forEach(function (i) {
      if (i.recurring === false && i.date && i.date.indexOf(ymStr) === 0) inc += i.amount || 0;
    });
    const exp = monthlyRecExpense + loanPay + discretionary;
    bal = bal + inc - exp;
    rows.push({
      label: monthNames[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2),
      income: inc,
      expense: exp,
      balance: bal,
    });
  }
  return {
    startBalance: liquid,
    monthlyIncome: monthlyIncome,
    monthlyRecExpense: monthlyRecExpense,
    loanPay: loanPay,
    avgDiscretionary: discretionary,
    rows: rows,
  };
}

/* ══ detectSubscriptions (orig 685-710) ══ */

export function detectSubscriptions(state) {
  const addedExp = (state && state.addedExp) || [];
  const recurring = (state && state.recurring) || [];
  const dismissed = (state && state.dismissedSubs) || [];
  const now = Date.now();
  const dayMs = 86400000;
  const byKey = {};
  addedExp.forEach(function (x) {
    if (!x.date || !x.desc) return;
    const d = new Date(x.date);
    if (now - d.getTime() > 90 * dayMs) return;
    const key = x.desc.toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 40);
    if (!byKey[key]) byKey[key] = { desc: x.desc, occurrences: [], totalAmount: 0, cat: x.cat };
    byKey[key].occurrences.push({ date: x.date, amount: x.amount });
    byKey[key].totalAmount += x.amount;
  });
  const suggestions = [];
  Object.keys(byKey).forEach(function (k) {
    const g = byKey[k];
    if (g.occurrences.length < 2) return;
    /* Só sugerir o que se PARECE mesmo com uma subscrição, para não propor
       "2 idas ao mesmo restaurante". Aceita quando:
         a) os valores são praticamente iguais (± 5%), ou
         b) o intervalo entre cobranças é compatível com mensal (25-35 dias)
            ou semanal (6-8 dias). */
    const amounts = g.occurrences.map(function (o) { return Number(o.amount) || 0; });
    const maxAmt = Math.max.apply(null, amounts);
    const minAmt = Math.min.apply(null, amounts);
    const sameAmount = maxAmt > 0 && (maxAmt - minAmt) / maxAmt <= 0.05;

    const times = g.occurrences
      .map(function (o) { return new Date(o.date).getTime(); })
      .filter(function (t) { return !isNaN(t); })
      .sort(function (a, b) { return a - b; });
    let regular = false;
    if (times.length >= 2) {
      const gaps = [];
      for (let gi = 1; gi < times.length; gi++) gaps.push((times[gi] - times[gi - 1]) / dayMs);
      regular = gaps.every(function (gp) {
        return (gp >= 25 && gp <= 35) || (gp >= 6 && gp <= 8);
      });
    }
    if (!sameAmount && !regular) return;
    // Skip suggestions the user has dismissed ("não e subscrição").
    if (dismissed.indexOf(k) > -1) return;
    // Check if already in recurring — normalize the recurring name the SAME way
    // the key was built (lowercase, collapse spaces, cap 40) so long names match.
    const existing = recurring.find(function (r) {
      return (r.name || '').toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 40) === k;
    });
    if (existing) return;
    const avg = g.totalAmount / g.occurrences.length;
    suggestions.push({
      desc: g.desc,
      count: g.occurrences.length,
      avgAmount: avg,
      monthlyEstimate: avg,
      cat: g.cat,
      key: k,
    });
  });
  return suggestions
    .sort(function (a, b) {
      return b.count - a.count;
    })
    .slice(0, 5);
}

/* ══ applyRules (orig 713-722) ══ */

export function applyRules(state, desc) {
  const rules = (state && state.rules) || [];
  if (!rules || !rules.length || !desc) return null;
  const d = desc.toLowerCase();
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r.pattern) continue;
    if (d.indexOf(r.pattern.toLowerCase()) > -1) return r.cat;
  }
  return null;
}

/* ══ emergencyFund (orig 775-792) ══ */

export function emergencyFund(state) {
  const recurring = (state && state.recurring) || [];
  // Colchão = liquidez + poupança VIVAS (o que há mesmo hoje), sem cartões.
  let safe = 0;
  getAcctsLive(state).forEach(function (a) {
    if (a.c === 'Liquidez' || a.c === 'Poupanca') safe += a.v;
  });
  /* Despesa média mensal: a partir do HISTÓRICO REAL (média dos 3 meses
     fechados anteriores com dados). Só sem histórico nenhum se cai na
     estimativa antiga (recorrentes + crédito + 300 EUR de variáveis) — a
     antiga fórmula dava números absurdos a quem já tinha meses importados. */
  const addedExp = (state && state.addedExp) || [];
  const now = new Date();
  const totals = [];
  for (let k = 1; k <= 3; k++) {
    const m = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
    let t = 0;
    addedExp.forEach(function (x) {
      if ((x.date || '').slice(0, 7) === key) t += Number(x.amount) || 0;
    });
    if (t > 0) totals.push(t);
  }
  let avgMonthly;
  let basis;
  if (totals.length) {
    avgMonthly = totals.reduce(function (a, b) { return a + b; }, 0) / totals.length;
    basis = 'history';
  } else {
    let monthlyRec = 0;
    recurring.forEach(function (r) { monthlyRec += r.amount || 0; });
    const loanPay = getLoan(state).pay || 0;
    const nonRec = [];
    const _byC = getByC(state);
    for (let mIdx = 0; mIdx < 4; mIdx++) {
      let t = 0;
      Object.keys(_byC).forEach(function (k) {
        if (_byC[k] && _byC[k][mIdx] != null) t += _byC[k][mIdx];
      });
      nonRec.push(t);
    }
    const avgNonRec = nonRec.slice(0, 3).reduce(function (s2, v) { return s2 + v; }, 0) / 3;
    avgMonthly = Math.max(avgNonRec, monthlyRec + loanPay + 300);
    basis = 'estimate';
  }
  const months = avgMonthly > 0 ? safe / avgMonthly : 0;
  return { safe: safe, avgMonthly: avgMonthly, months: months, basis: basis };
}

/* ══ monthlySummary (orig 794-821) ══ */

export function monthlySummary(state) {
  const incomes = (state && state.incomes) || [];
  const recurring = (state && state.recurring) || [];
  const addedExp = (state && state.addedExp) || [];
  const em = state && typeof state.em === 'number' ? state.em : 3;
  // Compute current period (em=3 = current month partial)
  const monthIdx = em >= 3 ? 3 : em;
  const nowISO = new Date().toISOString().slice(0, 7); // YYYY-MM
  let inc = 0;
  if (incomes.length > 0) {
    // Recurring incomes always count
    incomes.forEach(function (i) {
      if (i.recurring !== false) inc += i.amount || 0;
      else if (i.date && i.date.indexOf(nowISO) === 0) inc += i.amount || 0;
    });
  } else {
    // Fallback to hardcoded salary (empty if new user)
    const _sal = getSal(state);
    inc = _sal[em] || 0;
  }
  // Sum expenses for the month from byC + addedExp
  let exp = 0;
  const _byCm = getByC(state);
  Object.keys(_byCm).forEach(function (k) {
    if (_byCm[k] && _byCm[k][monthIdx] != null) exp += _byCm[k][monthIdx];
  });
  // Only count addedExp dated in the month being summarised (NOT every expense).
  const _nowM = new Date();
  const _target = new Date(_nowM.getFullYear(), _nowM.getMonth() - (3 - monthIdx), 1);
  const _targetYM = _target.getFullYear() + '-' + String(_target.getMonth() + 1).padStart(2, '0');
  addedExp.forEach(function (x) {
    if ((x.date || '').slice(0, 7) === _targetYM) exp += x.amount;
  });
  // Add recurring expenses (monthly fixed) only when there is no demo byC data,
  // to avoid double-counting against the seed series in preview mode.
  // Skip a recurring expense once it has been materialised into addedExp for this
  // month (an addedExp carrying its recId) — the list item replaces the auto-sum.
  if (Object.keys(_byCm).length === 0) {
    var _matRec = {};
    addedExp.forEach(function (x) {
      if (x.recId && (x.date || '').slice(0, 7) === _targetYM) _matRec[x.recId] = 1;
    });
    recurring.forEach(function (r) {
      if (!_matRec[r.id]) exp += r.amount || 0;
    });
  }
  const saved = inc - exp;
  const rate = inc > 0 ? (saved / inc) * 100 : 0;
  return { inc: inc, exp: exp, saved: saved, rate: rate };
}

/* ══ healthScore (orig 725-772) ══ */

export function healthScore(state) {
  const newU = isNewUser(state);
  if (newU) return { score: 0, grade: '-', breakdown: [], recommendations: [] };
  const bdg = (state && state.bdg) || [];
  const addedExp = (state && state.addedExp) || [];
  const goals = (state && state.goals) || [];
  const C = compute(state);
  const s = monthlySummary(state);
  const ef = emergencyFund(state);
  const br = [];
  // 1. Emergency fund (0-30)
  const efPts = Math.min((ef.months / 6) * 30, 30);
  br.push({ label: 'Fundo de emergência', pts: Math.round(efPts), max: 30, detail: ef.months.toFixed(1) + ' meses' });
  // 2. Savings rate (0-25)
  const srPts = Math.max(0, Math.min((s.rate / 20) * 25, 25));
  br.push({ label: 'Taxa de poupanca', pts: Math.round(srPts), max: 25, detail: s.rate.toFixed(0) + '%' });
  // 3. Debt-to-asset (0-20)
  const totalDebt = (C.loan.out || 0) + (C.cardDebt || 0);
  const dta = C.gross > 0 ? (totalDebt / C.gross) * 100 : totalDebt > 0 ? 100 : 0;
  const dtaPts = Math.max(0, 20 - dta / 5);
  br.push({ label: 'Dívida vs ativos', pts: Math.round(dtaPts), max: 20, detail: totalDebt > 0 ? dta.toFixed(0) + '%' : 'sem dívida' });
  // 4. Budget adherence (0-15)
  const _byCh = getByC(state);
  let totCat = 0,
    okCat = 0;
  bdg.forEach(function (b) {
    const monthIdx = 3;
    const vs = _byCh[b.id] || [0, 0, 0, 0];
    const val =
      vs[monthIdx] +
      addedExp
        .filter(function (x) {
          return x.cat === b.id;
        })
        .reduce(function (s2, x) {
          return s2 + x.amount;
        }, 0);
    if (val > 0) {
      totCat++;
      if (val <= b.lm) okCat++;
    }
  });
  const baPts = totCat > 0 ? (okCat / totCat) * 15 : 15;
  br.push({ label: 'Adesao ao orcamento', pts: Math.round(baPts), max: 15, detail: totCat > 0 ? okCat + '/' + totCat + ' categorias' : 'sem despesas' });
  // 5. Goal progress (0-10)
  let gpPts = 0;
  if (goals.length > 0) {
    let sum = 0;
    goals.forEach(function (g) {
      sum += g.target > 0 ? Math.min(g.current / g.target, 1) : 0;
    });
    gpPts = (sum / goals.length) * 10;
  }
  br.push({ label: 'Progresso de metas', pts: Math.round(gpPts), max: 10, detail: goals.length > 0 ? goals.length + ' metas' : 'sem metas' });
  const score = Math.round(efPts + srPts + dtaPts + baPts + gpPts);
  const grade = score >= 85 ? 'Excelente' : score >= 70 ? 'Bom' : score >= 50 ? 'Razoável' : score >= 30 ? 'Fragil' : 'Crítico';
  // Recommendations: pick 3 lowest scoring areas
  const recs = [];
  br.slice()
    .sort(function (a, b) {
      return a.pts / a.max - b.pts / b.max;
    })
    .slice(0, 3)
    .forEach(function (b) {
      if (b.label === 'Fundo de emergência' && b.pts < 20) recs.push('Aumenta a tua reserva. Objetivo: 6 meses de despesa media.');
      else if (b.label === 'Taxa de poupanca' && b.pts < 15) recs.push('Poupa pelo menos 15% do que ganhas todos os meses.');
      else if (b.label === 'Dívida vs ativos' && b.pts < 10) recs.push('Reduz dívida activa para baixo de 30% dos teus ativos.');
      else if (b.label === 'Adesao ao orcamento' && b.pts < 10) recs.push('Reve os limites das categorias que ultrapassaste este mês.');
      else if (b.label === 'Progresso de metas' && b.pts < 5) recs.push('Cria pelo menos uma meta de poupanca para teres direccao.');
    });
  return { score: score, grade: grade, breakdown: br, recommendations: recs };
}

/* ══ chrt — SVG sparkline/area (orig 615-638) ══
   Returns an HTML string (kept as the original did). In React, render via a
   small wrapper that sets dangerouslySetInnerHTML, OR reimplement as JSX in a
   later stage. Kept here so the math/markup stay identical for the port.
   `histData` defaults to getAllHist(state). `fm` is injected to avoid a cycle. */

export function chrt(data, color, label, histData, fmFn) {
  const fm =
    fmFn ||
    function (v) {
      return (
        Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
      );
    };
  // Escape ALL HTML-significant chars (incl. quotes) so a user/AI-supplied label
  // or colour can never break out of text OR an attribute in the built SVG.
  const e = function (s) {
    return s == null
      ? ''
      : String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  };
  const ht = 56;
  if (!data || data.length < 2) return '';
  // Additive padding (not multiplicative) so negative series don't invert: a
  // multiplicative *0.95 on a negative min pushes it UP, plotting off the top.
  const rawMn = Math.min.apply(null, data),
    rawMx = Math.max.apply(null, data),
    pad = (rawMx - rawMn) * 0.05 || Math.abs(rawMx) * 0.05 || 1;
  const mn = rawMn - pad,
    mx = rawMx + pad,
    rg = mx - mn || 1,
    w = 100;
  const pts = data
    .map(function (v, i) {
      return ((i / (data.length - 1)) * w).toFixed(1) + ',' + (ht - ((v - mn) / rg) * ht).toFixed(1);
    })
    .join(' ');
  const ar = pts + ' ' + w + ',' + ht + ' 0,' + ht;
  const df = data[data.length - 1] - data[0],
    pc = data[0] > 0 ? ((df / data[0]) * 100).toFixed(1) : '0';
  const dc = df >= 0 ? 'var(--success)' : 'var(--signal)';
  const ec = e(color); // colour goes into SVG attributes → must be escaped too
  const id = 'g' + label.replace(/[^a-zA-Z]/g, '');
  const labels = histData || [];
  let o = '<div style="margin-bottom:16px">';
  o += '<div class="rw" style="margin-bottom:8px"><span style="font-size:13px;font-weight:500">' + e(label) + '</span>';
  o += '<div><span class="m" style="font-size:13px;font-weight:500">' + fm(data[data.length - 1]) + '</span>';
  o += '<span class="m" style="font-size:11px;color:' + dc + ';margin-left:8px">' + (df >= 0 ? '+' : '') + pc + '%</span></div></div>';
  o += '<svg viewBox="0 0 ' + w + ' ' + ht + '" style="width:100%;height:' + ht + 'px;display:block">';
  o += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + ec + '" stop-opacity="0.15"/><stop offset="100%" stop-color="' + ec + '" stop-opacity="0"/></linearGradient></defs>';
  o += '<polygon points="' + ar + '" fill="url(#' + id + ')"/>';
  o += '<polyline points="' + pts + '" fill="none" stroke="' + ec + '" stroke-width="1.5"/>';
  data.forEach(function (v, i) {
    o += '<circle cx="' + ((i / (data.length - 1)) * w).toFixed(1) + '" cy="' + (ht - ((v - mn) / rg) * ht).toFixed(1) + '" r="2.5" fill="' + ec + '" stroke="var(--bg2)" stroke-width="1"/>';
  });
  o += '</svg>';
  o += '<div style="display:flex;justify-content:space-between;margin-top:4px">';
  labels.forEach(function (x) {
    o += '<span class="m" style="font-size:9px;color:var(--text3)">' + e(x.l) + '</span>';
  });
  o += '</div></div>';
  return o;
}
