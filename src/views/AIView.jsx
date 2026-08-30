/* ════════════════════════════════════════════════════════════════════════
   AIView — React port of the AI tab (orig rAI 2478-2553 + rAIImportPanel
   2418-2477 + sendAI 2581-2676 + aiImportFile 2677-2712 + applyAIImport
   2728-2784 + actionLabel 2408-2416 + renderMD 2371-2406).

   Three states share the view:
     1. API-key missing  -> prompt to set it in Definições.
     2. Import in flight / pending review -> rAIImportPanel (per-action checkboxes).
     3. Default -> import card + chat textarea + conversation history.

   callAI signature: (content, system, apiKey, onResult). The task prompt is
   appended as a {type:'text', text:PROMPT} block in `content` (STORE_API §4).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback } from 'react';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { useUI } from '../store/ui.jsx';
import Icon from '../components/Icon.jsx';
import { fm, fc, uid, normalizeStmtDate, todayISO } from '../lib/format.js';
import {
  callAI,
  callAIRaw,
  AI_IMPORT_PROMPT,
  readFileB64,
  resizeImg,
  parseExcel,
  buildAIContext,
} from '../lib/ai.js';
import {
  compute,
  getAccts,
  getAllHist,
  getByC,
  getLoan,
  ln as lnSeed,
} from '../lib/finance.js';
import { esc, renderMD } from '../lib/markdown.js';

/* ── actionLabel (orig 2408-2416). Returns icon (emoji entity string), label,
   value, tab, color for a given AI action. Icons stay as HTML entities to match
   the original; rendered via dangerouslySetInnerHTML on the small icon span. ── */
function actionLabel(a) {
  if (a.type === 'update_balance')
    return {
      icon: 'bank',
      lbl: (a.account_bank || '') + ' ' + (a.account_type || ''),
      val: fm(a.value || 0),
      tab: 'Resumo',
      color: 'var(--blue)',
    };
  if (a.type === 'add_expense')
    return {
      icon: 'expense',
      lbl: a.desc || '',
      // a.cat is AI-controlled and val is rendered via dangerouslySetInnerHTML → escape it.
      val: '-' + fm(Math.abs(a.amount || 0)) + ' &middot; ' + esc(a.cat || 'out'),
      tab: 'Despesas',
      color: 'var(--signal)',
    };
  if (a.type === 'add_income')
    return {
      icon: 'income',
      lbl: a.name || '',
      // a.source is AI-controlled and val is rendered via dangerouslySetInnerHTML → escape it.
      val: '+' + fm(a.amount || 0) + ' &middot; ' + esc(a.source || 'other'),
      tab: 'Receitas',
      color: 'var(--success)',
    };
  if (a.type === 'add_goal')
    return {
      icon: 'goal',
      lbl: a.name || '',
      val: 'Meta ' + fm(a.target || 0),
      tab: 'Metas',
      color: 'var(--purple)',
    };
  if (a.type === 'add_recurring')
    return {
      icon: 'recurring',
      lbl: a.name || '',
      // a.day vem da IA e val é renderizado via dangerouslySetInnerHTML → só número.
      val: fm(a.amount || 0) + ' &middot; dia ' + (parseInt(a.day, 10) || 1),
      tab: 'Recor.',
      color: 'var(--orange)',
    };
  if (a.type === 'snapshot')
    return {
      icon: 'chart',
      lbl: 'Snapshot ' + (a.label || ''),
      val: 'Liq ' + fc(a.liq || 0) + ' &middot; Inv ' + fc(a.inv || 0),
      tab: 'Resumo',
      color: 'var(--success)',
    };
  return { icon: 'help', lbl: a.type || 'desconhecido', val: '', tab: '', color: 'var(--text3)' };
}

/* tiny helper: render an HTML entity / small html string inline. */
function H({ html, ...rest }) {
  return <span {...rest} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ── buildAIContext (orig 2554-2579) — local because the lib export is a stub.
   Threads {...state, currentUser} into the finance fns so mode-branching works. */
function buildAIContextLocal(state, currentUser) {
  const s = { ...state, currentUser };
  const C = compute(s);
  const byCData = getByC(s);
  const loanData = getLoan(s);
  const today = todayISO();
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr'];
  const ctx = {
    today: today,
    currentMonth: today.slice(0, 7),
    accounts: getAccts(s).map((a) => ({ bank: a.b, type: a.t, balance: a.v, note: a.n || null, category: a.c })),
    totalAssets: C.tA,
    netWorth: C.nW,
    loan: {
      capital: loanData.cap,
      outstanding: loanData.out,
      payment: loanData.pay,
      rate: 2.7,
      nextPayment: '28.' + (new Date().getMonth() + 2).toString().padStart(2, '0'),
    },
    incomes: (state.incomes || []).map((i) => ({
      name: i.name,
      amount: i.amount,
      source: i.source,
      recurring: i.recurring !== false,
      day: i.day,
      date: i.date || null,
    })),
    recurring: (state.recurring || []).map((r) => ({ name: r.name, amount: r.amount, day: r.day, category: r.cat })),
    goals: (state.goals || []).map((g) => ({
      name: g.name,
      target: g.target,
      current: g.current,
      deadline: g.deadline || null,
      progress: g.target > 0 ? ((g.current / g.target) * 100).toFixed(0) + '%' : '0%',
    })),
    budgetCategories: (state.bdg || []).map((b) => ({ id: b.id, name: b.nm, monthlyLimit: b.lm })),
    historicalExpensesByCategory: {},
    addedExpenses: (state.addedExp || []).slice(-100).map((x) => ({
      desc: x.desc,
      amount: x.amount,
      category: x.cat,
      date: x.date,
      shared: !!x.shared,
      total: x.total || null,
      tags: x.tags || null,
    })),
    netWorthHistory: getAllHist(s).slice(-12),
  };
  Object.keys(byCData).forEach((k) => {
    const arr = {};
    byCData[k].forEach((v, i) => {
      arr[monthNames[i] || 'M' + i] = v;
    });
    ctx.historicalExpensesByCategory[k] = arr;
  });
  return ctx;
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function AIView() {
  const { state, actions, currentUser } = useStore();
  const toast = useToast();
  const ui = useUI();

  const [aiLoading, setAiLoading] = useState(false);
  const [aiImport, setAiImport] = useState(null); // {docType,summary,actions} | {error} | null
  const [aiImportLoading, setAiImportLoading] = useState(false);
  const [aiImportSel, setAiImportSel] = useState({}); // {idx: true}
  const [chat, setChat] = useState('');

  const apiKey = state.apiKey;
  const aiHistory = state.aiHistory || [];

  /* ── sendAI (orig 2581-2676) — chat / command. ─────────────────────────── */
  const sendAI = useCallback(() => {
    const cmd = chat.trim();
    if (!cmd || aiLoading) return;
    setAiLoading(true);

    const ctx = buildAIContextLocal(state, currentUser);
    const today = ctx.today;
    const dd = today.slice(8, 10) + '.' + today.slice(5, 7);
    const lnOut = (getLoan({ ...state, currentUser }) || lnSeed).out;

    const sysPrompt =
      'Es o assistente financeiro PROOF. FINANCE. Tens acesso aos dados do utilizador (em CONTEXTO) e respondes em portugues (PT-PT).\n\n' +
      'O utilizador pode pedir:\n\n' +
      'A) PERGUNTA / ANALISE (mostra-me, quais, quantos, procura, compara, lista, analisa, top, sugere, audita)\n' +
      '   Responde com TEXTO em portugues, usando markdown simples:\n' +
      '   - **negrito** para destaques\n' +
      '   - Listas com - item\n' +
      '   - Tabelas markdown (| col | col |) quando ajuda a leitura\n' +
      '   - Valores em formato europeu: 1.234,56 EUR\n' +
      '   - Se a resposta tem dados financeiros, da contexto e conclusoes acionaveis\n' +
      '   - Conciso (max ~250 palavras), direto, sem preambulos\n\n' +
      'B) ACAO (registar, adicionar, atualizar, guardar, criar, eliminar, snapshot)\n' +
      '   Responde APENAS JSON puro (sem markdown):\n' +
      '   {"actions":[...],"message":"resumo do que fizeste"}\n\n' +
      '   Tipos de actions:\n' +
      '   - update_balance: {"type":"update_balance","account_bank":"Bankinter","account_type":"Conta a Ordem","value":584.64,"note":""}\n' +
      '     account_bank EXACTO: Bankinter, Activobank, Moey, Trade Republic, XTB, Goparity, Raize\n' +
      '     account_type EXACTO: Conta a Ordem, Poupanca, Corretagem, Private Markets, Rend. Fixo, Transações, Planos Invest., P2P Lending\n' +
      '     Bankinter: dividir total por 2 (conta partilhada), por o total na note\n' +
      '   - add_expense: {"type":"add_expense","desc":"...","amount":0.00,"cat":"rest","date":"YYYY-MM-DD","tags":["tag1"]}\n' +
      '   - add_income: {"type":"add_income","name":"...","amount":0,"source":"salary","recurring":true,"day":25}\n' +
      '   - add_goal: {"type":"add_goal","name":"...","target":0,"current":0,"deadline":"YYYY-MM-DD"}\n' +
      '   - add_recurring: {"type":"add_recurring","name":"...","amount":0,"cat":"sub","day":1}\n' +
      '   - snapshot: {"type":"snapshot","label":"' +
      dd +
      '","liq":0,"poup":0,"inv":0,"div":' +
      lnOut +
      ',"xP":0,"xT":0,"tC":0}\n\n' +
      'COMO DECIDIR? Verbos imperativos (adiciona/regista/atualiza/cria/guarda) -> ACAO. Verbos interrogativos ou análise (quanto/quais/lista/mostra/procura/compara/audita/sugere) -> ANALISE.\n\n' +
      'CONTEXTO (dados atuais do utilizador):\n' +
      JSON.stringify(ctx).substring(0, 15000);

    // Chat via /api/ai (key no servidor): o comando é o conteúdo do utilizador;
    // sysPrompt leva as instruções. Devolve o JSON cru da Anthropic.
    callAIRaw(cmd, sysPrompt, 'claude-haiku-4-5', 4000)
      .then((d) => {
        const txt = (d.content || [])
          .filter((i) => i.type === 'text')
          .map((i) => i.text)
          .join('')
          .trim();
        let isJSON = false;
        const jsonMatch = txt.match(/^\s*(\{[\s\S]*\})\s*$/);
        let res = null;
        if (jsonMatch) {
          try {
            res = JSON.parse(jsonMatch[1]);
            isJSON = Array.isArray(res.actions);
          } catch (_e) {
            /* not JSON */
          }
        }
        let entry;
        if (isJSON) {
          // ACTION mode — apply via store actions (read-modify-write on latest).
          entry = {
            date: new Date().toLocaleString('pt-PT'),
            cmd: cmd,
            actions: res.actions || [],
            msg: res.message || '',
            ok: true,
            mode: 'action',
          };
          const st = actions.getState();
          let dyn = st.dynAccts ? { ...st.dynAccts } : {};
          let snaps = [...(st.dynSnaps || [])];
          let exps = [...(st.addedExp || [])];
          let incs = [...(st.incomes || [])];
          let gls = [...(st.goals || [])];
          let recs = [...(st.recurring || [])];
          let dynTouched = false,
            snapTouched = false,
            expTouched = false,
            incTouched = false,
            goalTouched = false,
            recTouched = false;
          (res.actions || []).forEach((a) => {
            try {
              if (a.type === 'update_balance' && a.account_bank && a.account_type) {
                const key = a.account_bank + '_' + a.account_type;
                dyn[key] = {
                  v: Number(a.value) || 0,
                  d: todayISO().replace(/-/g, '.'),
                  n: a.note || null,
                };
                dynTouched = true;
              } else if (a.type === 'snapshot' && a.label) {
                snaps.push({
                  l: a.label,
                  liq: Number(a.liq) || 0,
                  poup: Number(a.poup) || 0,
                  inv: Number(a.inv) || 0,
                  div: Number(a.div) || 77555.06,
                  xP: Number(a.xP) || 0,
                  xT: Number(a.xT) || 0,
                  tC: Number(a.tC) || 0,
                });
                snapTouched = true;
              } else if (a.type === 'add_expense' && a.desc) {
                exps.push({
                  desc: String(a.desc).substring(0, 60),
                  amount: Math.abs(Number(a.amount) || 0),
                  cat: a.cat || 'out',
                  date: normalizeStmtDate(a.date),
                  tags: Array.isArray(a.tags) ? a.tags.slice(0, 5) : undefined,
                });
                expTouched = true;
              } else if (a.type === 'add_income' && a.name) {
                const rec = a.recurring !== false;
                let day = parseInt(a.day, 10);
                if (isNaN(day) || day < 1 || day > 31) day = 1;
                incs.push({
                  id: uid(),
                  name: String(a.name).substring(0, 60),
                  amount: Math.abs(Number(a.amount) || 0),
                  source: a.source || 'salary',
                  recurring: rec,
                  day: day,
                  date: normalizeStmtDate(a.date),
                  createdAt: Date.now(),
                });
                incTouched = true;
              } else if (a.type === 'add_goal' && a.name) {
                gls.push({
                  id: uid(),
                  name: String(a.name).substring(0, 60),
                  target: Number(a.target) || 0,
                  current: Number(a.current) || 0,
                  deadline: a.deadline || '',
                  color: a.color || '#3b6fee',
                  createdAt: Date.now(),
                });
                goalTouched = true;
              } else if (a.type === 'add_recurring' && a.name) {
                let rd = parseInt(a.day, 10);
                if (isNaN(rd) || rd < 1 || rd > 31) rd = 1;
                recs.push({
                  id: uid(),
                  name: String(a.name).substring(0, 60),
                  amount: Number(a.amount) || 0,
                  day: rd,
                  cat: a.cat || 'sub',
                  createdAt: Date.now(),
                });
                recTouched = true;
              }
            } catch (_e) {
              /* skip bad action */
            }
          });
          if (dynTouched) actions.setDynAccts(dyn);
          if (snapTouched) actions.setDynSnaps(snaps);
          if (expTouched) actions.setAddedExp(exps);
          if (incTouched) actions.setIncomes(incs);
          if (goalTouched) actions.setGoals(gls);
          if (recTouched) actions.setRecurring(recs);
        } else {
          // ANALYSIS mode
          entry = { date: new Date().toLocaleString('pt-PT'), cmd: cmd, analysis: txt, ok: true, mode: 'analysis' };
        }
        actions.pushAiHistory(entry);
        setAiLoading(false);
        setChat('');
      })
      .catch((err) => {
        actions.pushAiHistory({ date: new Date().toLocaleString('pt-PT'), cmd: cmd, err: err.message });
        setAiLoading(false);
      });
  }, [chat, aiLoading, state, currentUser, apiKey, actions]);

  /* ── aiImportFile (orig 2677-2712). ────────────────────────────────────── */
  const aiImportFile = useCallback(
    (file) => {
      if (!file) return;
      if (!currentUser) {
        toast('Inicia sessão para usar a IA', 'error');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast('Ficheiro demasiado grande (max 20MB)', 'error');
        return;
      }
      const name = (file.name || '').toLowerCase();
      const isPDF = file.type === 'application/pdf' || name.endsWith('.pdf');
      const isXLS =
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.endsWith('.csv') ||
        (file.type || '').indexOf('spreadsheet') > -1 ||
        (file.type || '').indexOf('excel') > -1;
      setAiImportLoading(true);
      setAiImport(null);
      setAiImportSel({});
      const handler = (res) => {
        setAiImportLoading(false);
        if (res.error) {
          setAiImport({ error: res.error });
        } else {
          setAiImport(res);
          const sel = {};
          (res.actions || []).forEach((_, i) => {
            sel[i] = true;
          });
          setAiImportSel(sel);
        }
      };
      if (isPDF) {
        readFileB64(file).then((b64) => {
          callAI(
            [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
              { type: 'text', text: AI_IMPORT_PROMPT },
            ],
            undefined,
            apiKey,
            handler
          );
        });
      } else if (isXLS) {
        parseExcel(file).then((csv) => {
          if (!csv) {
            setAiImportLoading(false);
            setAiImport({ error: 'Não consegui ler o ficheiro Excel/CSV.' });
            return;
          }
          callAI(
            [{ type: 'text', text: 'Dados do ficheiro (' + (file.name || '') + '):\n\n' + csv + '\n\n' + AI_IMPORT_PROMPT }],
            undefined,
            apiKey,
            handler
          );
        });
      } else {
        resizeImg(file, 1600).then((b64) => {
          callAI(
            [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
              { type: 'text', text: AI_IMPORT_PROMPT },
            ],
            undefined,
            apiKey,
            handler
          );
        });
      }
    },
    [apiKey, toast]
  );

  /* ── selection helpers (orig 2714-2726). ───────────────────────────────── */
  const toggleAIImportSel = useCallback((i) => {
    setAiImportSel((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      else next[i] = true;
      return next;
    });
  }, []);
  const selectAllAI = useCallback(
    (on) => {
      setAiImportSel(() => {
        const sel = {};
        if (on && aiImport && aiImport.actions) aiImport.actions.forEach((_, i) => (sel[i] = true));
        return sel;
      });
    },
    [aiImport]
  );
  const cancelAIImport = useCallback(() => {
    setAiImport(null);
    setAiImportSel({});
    setAiImportLoading(false);
  }, []);

  /* ── applyAIImport (orig 2728-2784) — dispatch store actions per type. ──── */
  const applyAIImport = useCallback(() => {
    if (!aiImport || !aiImport.actions) return;
    const actList = aiImport.actions;
    const applied = { balance: 0, expense: 0, income: 0, goal: 0, recurring: 0, snapshot: 0 };
    const st = actions.getState();
    let dyn = st.dynAccts ? { ...st.dynAccts } : {};
    let snaps = [...(st.dynSnaps || [])];
    let exps = [...(st.addedExp || [])];
    let incs = [...(st.incomes || [])];
    let gls = [...(st.goals || [])];
    let recs = [...(st.recurring || [])];
    const todayD = todayISO().replace(/-/g, '.');
    actList.forEach((a, i) => {
      if (!aiImportSel[i]) return;
      try {
        if (a.type === 'update_balance' && a.account_bank && a.account_type) {
          const key = a.account_bank + '_' + a.account_type;
          dyn[key] = { v: Number(a.value) || 0, d: todayD, n: a.note || null };
          applied.balance++;
        } else if (a.type === 'add_expense' && a.desc) {
          exps.push({
            desc: String(a.desc).substring(0, 60),
            amount: Math.abs(Number(a.amount) || 0),
            cat: a.cat || 'out',
            date: normalizeStmtDate(a.date),
          });
          applied.expense++;
        } else if (a.type === 'add_income' && a.name) {
          const rec = a.recurring !== false;
          let d = parseInt(a.day, 10);
          if (isNaN(d) || d < 1 || d > 31) d = 1;
          incs.push({
            id: uid(),
            name: String(a.name).substring(0, 60),
            amount: Math.abs(Number(a.amount) || 0),
            source: a.source || 'salary',
            recurring: rec,
            day: d,
            date: normalizeStmtDate(a.date),
            createdAt: Date.now(),
          });
          applied.income++;
        } else if (a.type === 'add_goal' && a.name) {
          gls.push({
            id: uid(),
            name: String(a.name).substring(0, 60),
            target: Number(a.target) || 0,
            current: Number(a.current) || 0,
            deadline: a.deadline || '',
            color: a.color || '#3b6fee',
            createdAt: Date.now(),
          });
          applied.goal++;
        } else if (a.type === 'add_recurring' && a.name) {
          let day = parseInt(a.day, 10);
          if (isNaN(day) || day < 1 || day > 31) day = 1;
          recs.push({
            id: uid(),
            name: String(a.name).substring(0, 60),
            amount: Number(a.amount) || 0,
            day: day,
            cat: a.cat || 'sub',
            createdAt: Date.now(),
          });
          applied.recurring++;
        } else if (a.type === 'snapshot' && a.label) {
          snaps.push({
            l: String(a.label).substring(0, 8),
            liq: Number(a.liq) || 0,
            poup: Number(a.poup) || 0,
            inv: Number(a.inv) || 0,
            div: Number(a.div) || 77555.06,
            xP: Number(a.xP) || 0,
            xT: Number(a.xT) || 0,
            tC: Number(a.tC) || 0,
          });
          applied.snapshot++;
        }
      } catch (_e) {
        // eslint-disable-next-line no-console
        console.warn('Falha a aplicar accao', a, _e);
      }
    });
    if (applied.balance) actions.setDynAccts(dyn);
    if (applied.snapshot) actions.setDynSnaps(snaps);
    if (applied.expense) actions.setAddedExp(exps);
    if (applied.income) actions.setIncomes(incs);
    if (applied.goal) actions.setGoals(gls);
    if (applied.recurring) actions.setRecurring(recs);

    const totalApplied =
      applied.balance + applied.expense + applied.income + applied.goal + applied.recurring + applied.snapshot;
    actions.pushAiHistory({
      date: new Date().toLocaleString('pt-PT'),
      cmd: 'Documento: ' + (aiImport.docType || 'importado'),
      actions: actList.filter((_, i) => aiImportSel[i]),
      msg: (aiImport.summary || '') + ' (' + totalApplied + ' aplicada' + (totalApplied === 1 ? '' : 's') + ')',
      ok: true,
    });
    setAiImport(null);
    setAiImportSel({});
    const bits = [];
    if (applied.expense) bits.push(applied.expense + ' despesa' + (applied.expense === 1 ? '' : 's'));
    if (applied.income) bits.push(applied.income + ' receita' + (applied.income === 1 ? '' : 's'));
    if (applied.balance) bits.push(applied.balance + ' saldo' + (applied.balance === 1 ? '' : 's'));
    if (applied.goal) bits.push(applied.goal + ' meta' + (applied.goal === 1 ? '' : 's'));
    if (applied.recurring) bits.push(applied.recurring + ' subscri' + (applied.recurring === 1 ? 'cao' : 'coes'));
    if (applied.snapshot) bits.push(applied.snapshot + ' snapshot');
    toast(
      bits.length ? bits.join(' + ') + ' aplicado' + (totalApplied === 1 ? '' : 's') : 'Nada aplicado',
      'success'
    );
  }, [aiImport, aiImportSel, actions, toast]);

  const onFileInput = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    aiImportFile(f);
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  const wrap = { padding: '0 20px calc(40px + var(--safe-bottom))' };

  // 1) Sessão necessária (a IA corre no servidor; precisa de login).
  if (!currentUser) {
    return (
      <div className="fadeUp" style={wrap}>
        <div className="cd" style={{ padding: 18, marginBottom: 16, borderLeft: '3px solid var(--signal)' }}>
          <div className="lb" style={{ color: 'var(--signal)', marginBottom: 4 }}>Sessão necessária</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
            Inicia sessão para usar o assistente e o importador.
          </div>
        </div>
      </div>
    );
  }

  // 2) Import review panel takes over.
  if (aiImport) {
    return (
      <div className="fadeUp" style={wrap}>
        <AIImportPanel
          aiImport={aiImport}
          aiImportSel={aiImportSel}
          onToggle={toggleAIImportSel}
          onSelectAll={selectAllAI}
          onCancel={cancelAIImport}
          onApply={applyAIImport}
        />
      </div>
    );
  }

  // 2b) Import loading state.
  if (aiImportLoading) {
    return (
      <div className="fadeUp" style={wrap}>
        <div className="cd" style={{ padding: '30px 20px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="skel" style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto' }} />
          </div>
          <div className="lb" style={{ marginBottom: 6, color: 'var(--text2)' }}>A analisar documento</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
            A IA esta a ler e extrair informacao.
            <br />
            Pode demorar ate 30 segundos.
          </div>
        </div>
      </div>
    );
  }

  // 3) Default — import card + chat + history.
  return (
    <div className="fadeUp" style={wrap}>
      {/* Import card */}
      <div
        className="cd"
        style={{
          marginBottom: 16,
          padding: 18,
          background: 'linear-gradient(135deg,var(--blue-soft) 0%,transparent 100%)',
          borderLeft: '3px solid var(--blue)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--blue)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Importar documento</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
          Carrega PDF, imagem ou Excel. A IA classifica e preenche automaticamente saldos, despesas, metas, subscrições ou snapshots.
        </div>
        <input id="aiFile" type="file" accept="image/*,.pdf,.xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFileInput} />
        <input id="aiCam" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFileInput} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => document.getElementById('aiCam').click()}
            style={{ flex: 1, padding: '12px 0', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Câmara
          </button>
          <button
            type="button"
            onClick={() => document.getElementById('aiFile').click()}
            style={{ flex: 1, padding: '12px 0', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            PDF / Imagem / Excel
          </button>
        </div>
      </div>

      {/* Atualizar saldo por print — conta escolhida manualmente */}
      <div className="cd" style={{ marginBottom: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, background: 'var(--bg3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="balance" size={16} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Atualizar saldo</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
          Carrega um print do saldo, escolhe a conta e a IA le o valor. Fica registado com data.
        </div>
        <button type="button" onClick={() => ui.open('balanceUpdate')} style={{ width: '100%', padding: '12px 0', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>
          Atualizar saldo de uma conta
        </button>
      </div>

      {/* Chat / text input */}
      <div className="cd" style={{ marginBottom: 16, padding: 16 }}>
        <div className="lb" style={{ marginBottom: 8 }}>
          Chat &middot; pergunta ou comanda
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 4 }}>
            <b style={{ color: 'var(--text2)' }}>Perguntas:</b>
          </div>
          <span className="m" style={{ fontSize: 10 }}>&bull; "Procura despesas repetidas em Abril"</span>
          <br />
          <span className="m" style={{ fontSize: 10 }}>&bull; "Quanto gastei em restauracao vs media?"</span>
          <br />
          <span className="m" style={{ fontSize: 10 }}>&bull; "Quais as 3 subscrições mais caras?"</span>
          <br />
          <span className="m" style={{ fontSize: 10 }}>&bull; "Quantos meses de fundo emergência tenho?"</span>
          <br />
          <div style={{ margin: '6px 0 4px' }}>
            <b style={{ color: 'var(--text2)' }}>Ações:</b>
          </div>
          <span className="m" style={{ fontSize: 10 }}>&bull; "Bankinter 584&euro;, Activobank 325&euro;"</span>
          <br />
          <span className="m" style={{ fontSize: 10 }}>&bull; "Adiciona despesa 45,67 supermercado hoje"</span>
          <br />
          <span className="m" style={{ fontSize: 10 }}>&bull; "Registar snapshot com data de hoje"</span>
        </div>
        <textarea
          id="aiInput"
          rows={3}
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder="Pergunta ou comanda..."
          style={{ width: '100%', padding: 12, border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font)' }}
        />
        <button
          type="button"
          onClick={sendAI}
          disabled={aiLoading}
          style={{ width: '100%', padding: '12px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', fontSize: 14, fontWeight: 500, borderRadius: 999, marginTop: 8 }}
        >
          {aiLoading ? 'A processar...' : 'Enviar'}
        </button>
      </div>

      {/* History */}
      {aiHistory.length > 0 && (
        <>
          <div className="lb" style={{ marginBottom: 8 }}>Conversa</div>
          {[...aiHistory].reverse().map((h, ri) => {
            const isAnalysis = h.mode === 'analysis' || h.analysis;
            return (
              <div key={aiHistory.length - 1 - ri} className="cd fadeUp" style={{ marginBottom: 8, padding: '14px 16px' }}>
                <div className="rw" style={{ marginBottom: 8 }}>
                  <span className="m" style={{ fontSize: 10, color: 'var(--text3)' }}>{h.date}</span>
                  {h.err ? (
                    <span className="m" style={{ fontSize: 9, color: 'var(--signal)' }}>Erro</span>
                  ) : isAnalysis ? (
                    <span className="m" style={{ fontSize: 9, color: 'var(--blue)', background: 'var(--blue-soft)', padding: '2px 8px', borderRadius: 8 }}>Análise</span>
                  ) : h.ok ? (
                    <span className="m" style={{ fontSize: 9, color: 'var(--success)', background: 'var(--success-soft)', padding: '2px 8px', borderRadius: 8 }}>Executado</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10, fontWeight: 600 }}>{h.cmd}</div>
                {isAnalysis && h.analysis && (
                  <div
                    style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, padding: 12, background: 'var(--bg)', borderRadius: 'var(--r2)', borderLeft: '3px solid var(--blue)' }}
                    dangerouslySetInnerHTML={{ __html: renderMD(h.analysis) }}
                  />
                )}
                {h.actions && h.actions.length > 0 && (
                  <>
                    {h.actions.slice(0, 8).map((a, ai) => {
                      const info = actionLabel(a);
                      return (
                        <div key={ai} className="rw" style={{ padding: '4px 0' }}>
                          <span style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                            <Icon name={info.icon} size={12} /> {info.lbl}
                          </span>
                          <H className="m" style={{ fontSize: 11, fontWeight: 600, color: info.color }} html={info.val} />
                        </div>
                      );
                    })}
                    {h.actions.length > 8 && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 0', fontStyle: 'italic' }}>
                        + {h.actions.length - 8} outras
                      </div>
                    )}
                  </>
                )}
                {h.msg && !isAnalysis && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{h.msg}</div>
                )}
                {h.err && <div style={{ fontSize: 11, color: 'var(--signal)', marginTop: 4 }}>{h.err}</div>}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => actions.setAiHistory([])}
            style={{ width: '100%', padding: '10px 0', border: 'none', background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 'var(--r2)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', marginTop: 8 }}
          >
            LIMPAR Histórico
          </button>
        </>
      )}
    </div>
  );
}

/* ── rAIImportPanel (orig 2418-2477) — the import review UI. ──────────────── */
function AIImportPanel({ aiImport, aiImportSel, onToggle, onSelectAll, onCancel, onApply }) {
  if (aiImport.error) {
    return (
      <div className="cd fadeUp" style={{ marginBottom: 16, padding: 18, borderLeft: '3px solid var(--signal)' }}>
        <div className="lb" style={{ color: 'var(--signal)', marginBottom: 6 }}>Erro a analisar</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{aiImport.error}</div>
        <button
          type="button"
          onClick={onCancel}
          style={{ marginTop: 12, padding: '10px 16px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}
        >
          Fechar
        </button>
      </div>
    );
  }
  const actList = aiImport.actions || [];
  const docLabel =
    {
      extrato_bancário: 'Extrato bancário',
      recibo: 'Recibo',
      recibo_vencimento: 'Recibo de vencimento',
      contrato_crédito: 'Contrato de crédito',
      extrato_investimento: 'Extrato de investimento',
      factura: 'Factura',
      outro: 'Documento',
    }[aiImport.docType] || 'Documento';
  let selCount = 0,
    selDebit = 0;
  actList.forEach((a, i) => {
    if (aiImportSel[i]) {
      selCount++;
      if (a.type === 'add_expense') selDebit += Math.abs(a.amount || 0);
    }
  });

  return (
    <div className="cd fadeUp" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <div style={{ background: 'var(--primary)', color: 'var(--bg)', padding: '18px 20px' }}>
        <div className="lb" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>{docLabel}</div>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{aiImport.summary || 'Análise concluida'}</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 14, fontSize: 11, opacity: 0.9 }}>
          <span>
            <b>{actList.length}</b> {actList.length === 1 ? 'accao' : 'accoes'}
          </span>
          {selDebit > 0 && (
            <span>
              Despesa: <b>{fc(selDebit)}</b>
            </span>
          )}
        </div>
      </div>

      {actList.length === 0 ? (
        <>
          <div className="empty" style={{ padding: '30px 20px' }}>Nada para importar deste documento</div>
          <div style={{ padding: '0 16px 16px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{ width: '100%', padding: '12px 0', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 600 }}
            >
              Fechar
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Selection toolbar */}
          <div className="rw" style={{ padding: '10px 16px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>
              <b>{selCount}</b> de {actList.length} seleccionadas
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => onSelectAll(true)} style={{ padding: '4px 10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', borderRadius: 14, fontSize: 10, fontWeight: 600 }}>
                Todas
              </button>
              <button type="button" onClick={() => onSelectAll(false)} style={{ padding: '4px 10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', borderRadius: 14, fontSize: 10, fontWeight: 600 }}>
                Nenhuma
              </button>
            </div>
          </div>

          {/* Action list */}
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {actList.map((a, i) => {
              const info = actionLabel(a);
              const sel = !!aiImportSel[i];
              return (
                <div
                  key={i}
                  onClick={() => onToggle(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border)', cursor: 'pointer', background: sel ? 'var(--blue-soft)' : 'transparent' }}
                >
                  <div style={{ width: 18, height: 18, border: '2px solid ' + (sel ? 'var(--blue)' : 'var(--border2)'), borderRadius: 5, background: sel ? 'var(--blue)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {sel && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <Icon name={info.icon} size={18} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rw">
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{info.lbl}</span>
                      <H className="m" style={{ fontSize: 11, fontWeight: 700, color: info.color }} html={info.val} />
                    </div>
                    {(a.date || a.deadline) && (
                      <div className="m" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{a.date || a.deadline || ''}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer buttons */}
          <div style={{ padding: '14px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={onCancel} style={{ padding: '12px 16px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600 }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={selCount === 0}
              style={{ flex: 1, padding: '12px 0', border: '1px solid ' + (selCount > 0 ? 'var(--fg)' : 'var(--border)'), background: selCount > 0 ? 'var(--fg)' : 'transparent', color: selCount > 0 ? 'var(--bg)' : 'var(--fg-subtle)', fontSize: 13, fontWeight: 500, borderRadius: 999 }}
            >
              Aplicar {selCount}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
