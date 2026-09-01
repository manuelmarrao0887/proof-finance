/* ════════════════════════════════════════════════════════════════════════
   AIView — React port of the AI tab (orig rAI 2478-2553 + rAIImportPanel
   2418-2477 + aiImportFile 2677-2712 + applyAIImport 2728-2784 +
   actionLabel 2408-2416 + renderMD 2371-2406).

   Three states share the view:
     1. Sem sessão -> pede login (a IA corre no servidor).
     2. Import in flight / pending review -> rAIImportPanel (per-action checkboxes).
     3. Default -> import card + chat textarea + conversation history.

   O chat (sendAI) já não monta o próprio prompt nem aplica ações à mão: usa
   runAssistant/confirmPending de lib/aiChat.js, o mesmo motor de tool-calling
   da AssistantSheet — ver Task 12. O painel de import continua a usar callAI
   (lib/ai.js) com a assinatura (content, system, onResult, opts) — o `opts.tier`
   é o tier escolhido em Definições (state.aiTier); o task prompt vai num bloco
   {type:'text', text:PROMPT} em `content` (STORE_API §4).
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback } from 'react';
import { useStore } from '../store/store.jsx';
import { useToast } from '../components/Toast.jsx';
import { useUI } from '../store/ui.jsx';
import Icon from '../components/Icon.jsx';
import PendingActionCard from '../components/PendingActionCard.jsx';
import { fm, fc, uid, normalizeStmtDate, todayISO } from '../lib/format.js';
import {
  callAI,
  AI_IMPORT_PROMPT,
  readFileB64,
  resizeImg,
  parseExcel,
  buildAIContext,
} from '../lib/ai.js';
import { runAssistant, confirmPending, ASSISTANT_SYSTEM } from '../lib/aiChat.js';
import { esc, renderMD } from '../lib/markdown.js';

/* ── actionLabel (orig 2408-2416, ampliada na revisão da Task 12). Devolve
   icon/lbl/val/tab/color para uma ação da IA — usada tanto pelo histórico do
   chat (nomes de tools de `WRITE_TOOL_SLICES`, lib/aiTools.js) como pelo
   painel de import de documentos (vocabulário antigo do AI_IMPORT_PROMPT,
   por isso 'snapshot' e 'add_snapshot' coexistem). `lbl` é texto simples
   (React escapa-o); `val` vai por dangerouslySetInnerHTML — qualquer campo
   controlado pela IA que entre em `val` tem de passar por esc().
   Exportada para o teste de cobertura em aiView.chat.test.jsx: uma tool de
   escrita nova sem branch aqui cai no `help` genérico do fim, e o teste
   falha em vez de deixar o nome bruto da tool aparecer ao utilizador. ── */
export function actionLabel(a) {
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
  if (a.type === 'snapshot' || a.type === 'add_snapshot')
    return {
      icon: 'chart',
      lbl: 'Snapshot ' + (a.label || ''),
      val: 'Liq ' + fc(a.liq || 0) + ' &middot; Inv ' + fc(a.inv || 0),
      tab: 'Resumo',
      color: 'var(--success)',
    };
  if (a.type === 'add_category')
    return {
      icon: 'cart',
      lbl: a.nm || a.id || '',
      val: a.lm ? 'Limite ' + fm(a.lm) : 'Nova categoria',
      tab: 'Despesas',
      color: 'var(--orange)',
    };
  if (a.type === 'add_rule')
    return {
      icon: 'shield',
      lbl: 'Regra: ' + (a.pattern || ''),
      // a.cat é AI-controlado e val é dangerouslySetInnerHTML → escapar.
      val: '&rarr; ' + esc(a.cat || ''),
      tab: 'Despesas',
      color: 'var(--purple)',
    };
  if (a.type === 'set_budget')
    return {
      icon: 'chart',
      lbl: 'Orçamento: ' + (a.cat || ''),
      val: 'Limite ' + fm(a.limit || 0),
      tab: 'Despesas',
      color: 'var(--blue)',
    };
  if (a.type === 'create_group')
    return {
      icon: 'briefcase',
      lbl: a.name || '',
      val: 'Novo grupo',
      tab: 'Grupos',
      color: 'var(--purple)',
    };
  if (a.type === 'add_person')
    return {
      icon: 'sparkle',
      lbl: a.name || '',
      val: 'Nova pessoa',
      tab: 'Grupos',
      color: 'var(--blue)',
    };
  if (a.type === 'add_group_expense')
    return {
      icon: 'expense',
      lbl: a.desc || '',
      val: '-' + fm(Math.abs(a.amount || 0)),
      tab: 'Grupos',
      color: 'var(--signal)',
    };
  if (a.type === 'settle_group')
    return {
      icon: 'transfer',
      lbl: 'Acerto de contas',
      val: fm(Math.abs(a.amount || 0)),
      tab: 'Grupos',
      color: 'var(--blue)',
    };
  return { icon: 'help', lbl: a.type || 'desconhecido', val: '', tab: '', color: 'var(--text3)' };
}

/* tiny helper: render an HTML entity / small html string inline. */
function H({ html, ...rest }) {
  return <span {...rest} dangerouslySetInnerHTML={{ __html: html }} />;
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

  const aiHistory = state.aiHistory || [];

  /* sendAI — o chat passa a usar o motor de tool-calling partilhado com a
     AssistantSheet. O AIView já não monta prompts nem aplica ações à mão. */
  const sendAI = useCallback(() => {
    const cmd = chat.trim();
    if (!cmd || aiLoading) return;
    setAiLoading(true);
    const st = actions.getState();
    runAssistant(cmd, {
      state: st,
      actions,
      // currentUser nao esta no estado do reducer — sem ele as tools de
      // leitura veem a app em modo de demonstracao (ver aiChat.js).
      currentUser,
      systemPrompt: ASSISTANT_SYSTEM + '\n\nCONTEXTO:\n' + JSON.stringify(buildAIContext(st)),
      // Tier escolhido em Definições (SettingsSheet) — aiChat.js é um módulo
      // puro sem acesso ao store, por isso lê-se aqui e passa-se explícito.
      tier: st.aiTier,
    })
      .then((res) => {
        const applied = res.applied || [];
        const waiting = res.pending || [];
        actions.pushAiHistory({
          date: new Date().toLocaleString('pt-PT'),
          cmd,
          // runAssistant já não rejeita quando uma volta rebenta a meio:
          // devolve error:true com o que ficou aplicado até aí. A entrada
          // mostra-se como erro (h.err) mas continua a listar o que chegou a
          // ser escrito e o que ficou por confirmar — o utilizador tem de ver
          // o que já lhe mexeu nos dados.
          ...(res.error ? { err: res.text } : { analysis: res.text, ok: true }),
          actions: applied.map((a) => ({ type: a.name, ...a.args })),
          pending: waiting.map((p) => ({ name: p.name, args: p.args, preview: p.preview })),
          mode: 'chat',
        });
        setChat('');
      })
      .catch((err) => {
        actions.pushAiHistory({
          date: new Date().toLocaleString('pt-PT'),
          cmd,
          err: (err && err.message) || 'Falha no assistente.',
        });
      })
      .finally(() => setAiLoading(false));
  }, [chat, aiLoading, actions, currentUser]);

  /* ── resolvePending — Confirmar/Cancelar de uma ação destrutiva que ficou
     à espera de confirmação. confirmPending() é o único injector sancionado
     do campo `confirmed`; nunca se chama aqui a tool diretamente nem se
     confirma sozinho — só ao clique explícito em "Confirmar". Cancelar
     limita-se a descartar o pedido do histórico, sem executar nada.

     Lê `actions.getState().aiHistory` em vez do `aiHistory` fechado no
     closure do render: entre o render que desenhou o cartão e o clique pode
     ter chegado uma sincronização do Firestore em segundo plano — escrever
     por cima do array fechado no closure reverteria essa sincronização em
     silêncio (o mesmo padrão que sendAI já segue com actions.getState()). */
  const resolvePending = useCallback(
    (entryIdx, pendIdx, execute) => {
      const hist = actions.getState().aiHistory || [];
      const entry = hist[entryIdx];
      const p = entry && entry.pending && entry.pending[pendIdx];
      if (!p) return;
      if (execute) {
        const r = confirmPending({ name: p.name, args: p.args }, { state: actions.getState(), actions });
        toast(r && r.ok ? 'Feito' : 'Não foi possível concluir', r && r.ok ? 'success' : 'error');
      }
      actions.setAiHistory(
        hist.map((h, i) => (i === entryIdx ? { ...h, pending: h.pending.filter((_, j) => j !== pendIdx) } : h))
      );
    },
    [actions, toast]
  );

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
      // Tier escolhido em Definições (SettingsSheet) — callAI aplica o chão
      // mínimo (equilibrado) por dentro, mesmo com economico aqui.
      const aiOpts = { tier: state.aiTier };
      if (isPDF) {
        readFileB64(file).then((b64) => {
          callAI(
            [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
              { type: 'text', text: AI_IMPORT_PROMPT },
            ],
            undefined,
            handler,
            aiOpts
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
            handler,
            aiOpts
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
            handler,
            aiOpts
          );
        });
      }
    },
    [state.aiTier, toast]
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
            const entryIdx = aiHistory.length - 1 - ri;
            const isAnalysis = h.mode === 'analysis' || h.analysis;
            return (
              <div key={entryIdx} className="cd fadeUp" style={{ marginBottom: 8, padding: '14px 16px' }}>
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
                {/* Ações destrutivas por confirmar (runAssistant devolveu-as em
                    `pending` em vez de as executar) — nunca se confirmam
                    sozinhas: fica aqui o mesmo cartão Confirmar/Cancelar da
                    AssistantSheet (componente partilhado), até o utilizador
                    decidir. `busy=aiLoading` desativa os botões enquanto há
                    um pedido em curso, tal como o "Enviar". */}
                {h.pending &&
                  h.pending.length > 0 &&
                  h.pending.map((p, pi) => (
                    <PendingActionCard
                      key={pi}
                      preview={p.preview}
                      busy={aiLoading}
                      onConfirm={() => resolvePending(entryIdx, pi, true)}
                      onCancel={() => resolvePending(entryIdx, pi, false)}
                    />
                  ))}
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
          <div style={{ maxHeight: '50dvh', overflow: 'auto' }}>
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
