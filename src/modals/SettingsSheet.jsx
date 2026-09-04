/* ════════════════════════════════════════════════════════════════════════
   SettingsSheet — React port of rSettings (orig 2062-2123) + exportData
   (1918-1941) + restoreData (1885-1915) + testAPI (2004-2023).

   Sections: account row + sign-out, theme picker (light/dark/system), API-key
   input + test/save/remove, Rules + Categorias openers, backup/restore JSON,
   version footer. Uses the shared <Sheet> shell and useModal('settings').
   ════════════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useStore, useAuth } from '../store/store.jsx';
import { useUI, useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { expensesToCSV, incomesToCSV, downloadCSV } from '../lib/exportcsv.js';
import { todayISO } from '../lib/format.js';
import { signOutUser } from '../firebase/client.js';
import { applyTheme } from '../store/store.jsx';

const THEME_OPTIONS = [
  {
    id: 'light',
    label: 'Claro',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Escuro',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    id: 'system',
    label: 'Auto',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

// Tiers do assistente que o utilizador pode escolher, do mais barato ao mais
// caro — espelha AI_TIERS/api/ai.js MODEL_TIERS (o servidor é sempre a
// autoridade sobre o que cada nome resolve; isto é só a apresentação PT-PT).
// Custo por mensagem é uma estimativa aproximada (conversa curta, tool-
// calling típico), não uma medição — serve para o utilizador comparar os
// três níveis entre si.
const AI_TIER_OPTIONS = [
  { id: 'economico', label: 'Económico', model: 'Gemini 3.5 Flash Lite', cost: '≈ 0,003 USD / mensagem' },
  { id: 'equilibrado', label: 'Equilibrado', model: 'Gemini 3.7 Flash', cost: '≈ 0,007 USD / mensagem' },
  { id: 'avancado', label: 'Avançado', model: 'Claude Haiku 4.5', cost: '≈ 0,010 USD / mensagem' },
];

export default function SettingsSheet() {
  const { state, actions, currentUser } = useStore();
  const { resetUser } = useAuth();
  const ui = useUI();
  const { isOpen, close } = useModal('settings');
  const toast = useToast();

  const curTheme = state.theme || 'system';
  const curTier = state.aiTier || 'economico';

  /* ── sign-out (orig doLogout): signOutUser() then resetUser(). ──────────── */
  const onSignOut = useCallback(() => {
    signOutUser()
      .then(() => {
        resetUser();
        close();
      })
      .catch(() => {
        // Even on failure, reset local state (best-effort, matches original).
        resetUser();
        close();
      });
  }, [resetUser, close]);

  /* ── exportData (orig 1918-1941). ──────────────────────────────────────── */
  const exportData = useCallback(() => {
    if (!confirm('Exportar todos os dados para JSON?')) return;
    const data = {
      exportedAt: new Date().toISOString(),
      user: currentUser ? currentUser.email : null,
      aiHistory: state.aiHistory,
      dynAccts: state.dynAccts,
      dynSnaps: state.dynSnaps,
      addedExp: state.addedExp,
      theme: state.theme,
      goals: state.goals,
      recurring: state.recurring,
      incomes: state.incomes,
      bdg: state.bdg,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proof-finance-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup gerado', 'success');
  }, [currentUser, state, toast]);

  /* ── exportCSV — despesas + receitas em CSV (Excel PT: ; e vírgula decimal),
     úteis para contabilidade/IRS. Um ficheiro de cada. ───────────────────── */
  const exportCSV = useCallback(() => {
    const stamp = todayISO();
    const exps = state.addedExp || [];
    const incs = state.incomes || [];
    if (!exps.length && !incs.length) {
      toast('Sem dados para exportar', 'error');
      return;
    }
    if (exps.length) downloadCSV('proof-despesas-' + stamp + '.csv', expensesToCSV(exps, state.bdg));
    if (incs.length) downloadCSV('proof-receitas-' + stamp + '.csv', incomesToCSV(incs));
    toast('CSV exportado', 'success');
  }, [state.addedExp, state.incomes, state.bdg, toast]);

  /* ── restoreData (orig 1885-1915) — hydrate via actions.patch. ─────────── */
  const restoreData = useCallback(
    (file) => {
      if (!file) return;
      const rd = new FileReader();
      rd.onload = (ev) => {
        try {
          const d = JSON.parse(ev.target.result);
          if (typeof d !== 'object' || d === null) throw new Error('formato inválido');
          if (!confirm('Restaurar substitui TODOS os dados atuais. Continuar?')) return;
          const theme = typeof d.theme === 'string' ? d.theme : 'system';
          const partial = {
            aiHistory: Array.isArray(d.aiHistory) ? d.aiHistory : [],
            dynAccts: d.dynAccts && typeof d.dynAccts === 'object' ? d.dynAccts : null,
            dynSnaps: Array.isArray(d.dynSnaps) ? d.dynSnaps : [],
            addedExp: Array.isArray(d.addedExp) ? d.addedExp : [],
            theme: theme,
            goals: Array.isArray(d.goals) ? d.goals : [],
            recurring: Array.isArray(d.recurring) ? d.recurring : [],
            incomes: Array.isArray(d.incomes) ? d.incomes : [],
          };
          if (Array.isArray(d.bdg) && d.bdg.length > 0) partial.bdg = d.bdg;
          actions.patch(partial);
          applyTheme(theme);
          toast('Dados restaurados', 'success');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Restore falhou', err);
          toast('Ficheiro inválido: ' + (err.message || 'erro'), 'error');
        }
      };
      rd.readAsText(file);
    },
    [actions, toast]
  );

  /* ── wipeData — apaga TODOS os dados financeiros, mantém tema /
     categorias. actions.patch dispara o auto-save → limpa também o documento
     no Firestore (e a cache local). Irreversível, por isso duplo-confirm. ─── */
  const wipeData = useCallback(() => {
    if (typeof confirm !== 'function') return;
    if (
      !confirm(
        'Apagar TODOS os dados financeiros? Despesas, receitas, recorrentes, contas, saldos, metas e regras são removidos. As definições (tema, categorias) mantêm-se. Esta ação NÃO pode ser desfeita.'
      )
    )
      return;
    if (!confirm('Tens mesmo a certeza? Faz "Backup JSON" primeiro se quiseres guardar uma cópia.')) return;
    actions.patch({
      addedExp: [],
      recurring: [],
      incomes: [],
      balanceLog: [],
      customAccts: [],
      dynAccts: null,
      dynSnaps: [],
      goals: [],
      rules: [],
      aiHistory: [],
      aiInsights: null,
      dismissedSubs: [],
    });
    toast('Todos os dados apagados', 'success');
    close();
  }, [actions, toast, close]);

  if (!isOpen) return null;

  const ph = currentUser && currentUser.photoURL;
  const init = currentUser && currentUser.email ? currentUser.email[0].toUpperCase() : 'U';
  const accountName = (currentUser && currentUser.displayName) || (currentUser && currentUser.email) || 'Sessao';
  const showEmailSub = currentUser && currentUser.displayName && currentUser.email;

  const dataBtn = { width: '100%', padding: '14px 16px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 };

  return (
    <Sheet open={isOpen} onClose={close} title="Definições">
      {/* ── Account ── */}
      <div className="lb" style={{ marginBottom: 10 }}>Conta</div>
      <div className="cd" style={{ marginBottom: 24, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, overflow: 'hidden' }}>
          {ph ? (
            <img src={ph} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" alt="" />
          ) : (
            init
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{accountName}</div>
          {showEmailSub && (
            <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.email}</div>
          )}
        </div>
        <button type="button" onClick={onSignOut} style={{ padding: '8px 14px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--signal)', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
          Sair
        </button>
      </div>

      {/* ── Theme ── */}
      <div className="lb" style={{ marginBottom: 10 }}>Aparência</div>
      <div className="g3" style={{ marginBottom: 24 }}>
        {THEME_OPTIONS.map((t) => {
          const on = curTheme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => actions.setTheme(t.id)}
              style={{ padding: '12px 8px', border: on ? '2px solid var(--blue)' : '1px solid var(--border)', background: on ? 'var(--blue-soft)' : 'var(--bg2)', color: on ? 'var(--blue)' : 'var(--text2)', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Assistente IA — a chave vive só no servidor (proxy /api/ai); nada a
            configurar aqui. (A key do utilizador guardada em claro foi removida:
            ver revisão de segurança 2026-08.) ── */}
      <div className="lb" style={{ marginBottom: 10 }}>Assistente IA</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.5 }}>
        O assistente e o scanner de recibos correm através de um serviço seguro da app — não precisas de nenhuma chave. Se estiverem indisponíveis, é configuração do lado do servidor.
      </div>
      <div style={{ marginBottom: 10 }}>
        {AI_TIER_OPTIONS.map((t) => {
          const on = curTier === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => actions.setAiTier(t.id)}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: on ? '2px solid var(--blue)' : '1px solid var(--border)',
                background: on ? 'var(--blue-soft)' : 'var(--surface)',
                color: on ? 'var(--blue)' : 'var(--fg)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 8,
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{t.label}</span>
                <span className="m" style={{ display: 'block', fontSize: 11, fontWeight: 400, color: on ? 'var(--blue)' : 'var(--text3)', marginTop: 2 }}>
                  {t.model} &middot; {t.cost}
                </span>
              </span>
              {on && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.5 }}>
        A importação de documentos (extratos, recibos, prints de saldo) usa sempre, pelo menos, o nível Equilibrado — um valor mal lido entra errado nas tuas contas, por isso a precisão importa mais do que a poupança nesses casos, mesmo com o Económico escolhido acima.
      </div>

      {/* ── Automacao ── */}
      <div className="lb" style={{ marginBottom: 10, marginTop: 8 }}>Automacao</div>
      <button
        type="button"
        onClick={() => {
          close();
          ui.open('rules');
        }}
        style={{ width: '100%', padding: '14px 16px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontFamily: 'inherit' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
            <path d="M14 6l5 5" />
          </svg>
          Regras de categorizacao
        </span>
        <span className="m" style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>{(state.rules || []).length} &rsaquo;</span>
      </button>

      {/* ── Dados ── */}
      <div className="lb" style={{ marginBottom: 10, marginTop: 16 }}>Dados</div>
      <button
        type="button"
        onClick={() => {
          close();
          ui.open('cat');
        }}
        style={{ width: '100%', padding: '14px 16px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 8, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontFamily: 'inherit' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.8" />
            <rect x="14" y="3" width="7" height="7" rx="1.8" />
            <rect x="14" y="14" width="7" height="7" rx="1.8" />
            <rect x="3" y="14" width="7" height="7" rx="1.8" />
          </svg>
          Gerir categorias
        </span>
        <span className="m" style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>{(state.bdg || []).length} &rsaquo;</span>
      </button>
      <button type="button" onClick={exportData} style={dataBtn}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Backup JSON
        </span>
        <span style={{ color: 'var(--text3)' }}>&rsaquo;</span>
      </button>
      <button type="button" onClick={exportCSV} style={dataBtn}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
          Exportar CSV (Excel)
        </span>
        <span style={{ color: 'var(--text3)' }}>&rsaquo;</span>
      </button>
      <input
        id="restoreFile"
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          restoreData(f);
        }}
      />
      <button
        type="button"
        onClick={() => document.getElementById('restoreFile').click()}
        style={dataBtn}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Restaurar JSON
        </span>
        <span style={{ color: 'var(--text3)' }}>&rsaquo;</span>
      </button>

      {/* Apagar todos os dados (irreversivel) — mantem tema e categorias. */}
      <button
        type="button"
        onClick={wipeData}
        style={{ ...dataBtn, marginBottom: 24, borderColor: 'var(--danger)', color: 'var(--danger)', background: 'transparent' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Apagar todos os dados
        </span>
        <span style={{ color: 'var(--danger)' }}>&rsaquo;</span>
      </button>

      {/* ── About ── */}
      <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.05em' }}>
        PROOF &middot; FINANCE &middot; v2.1
      </div>
    </Sheet>
  );
}
