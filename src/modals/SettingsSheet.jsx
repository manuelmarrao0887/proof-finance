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

export default function SettingsSheet() {
  const { state, actions, currentUser } = useStore();
  const { resetUser } = useAuth();
  const ui = useUI();
  const { isOpen, close } = useModal('settings');
  const toast = useToast();

  const [keyInput, setKeyInput] = useState(state.apiKey || '');
  const [keyVisible, setKeyVisible] = useState(false);
  const [testResult, setTestResult] = useState(null); // {kind:'info'|'ok'|'err', label, detail}

  // Keep local key input in sync when the sheet (re)opens.
  React.useEffect(() => {
    if (isOpen) setKeyInput(state.apiKey || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const curTheme = state.theme || 'system';

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

  /* ── testAPI (orig 2004-2023). ─────────────────────────────────────────── */
  const testAPI = useCallback(() => {
    if (!state.apiKey) {
      setTestResult({ kind: 'err', label: 'COLA A KEY PRIMEIRO' });
      return;
    }
    setTestResult({ kind: 'info', label: 'A testar...' });
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 50, messages: [{ role: 'user', content: 'Responde apenas: OK' }] }),
    })
      .then((r) =>
        r.text().then((body) => {
          if (r.ok) setTestResult({ kind: 'ok', label: 'API OK — STATUS ' + r.status, detail: body.substring(0, 150) });
          else setTestResult({ kind: 'err', label: 'Erro ' + r.status, detail: body.substring(0, 300) });
        })
      )
      .catch((err) => {
        let msg = err.message || 'Erro';
        let hint = '';
        if (msg === 'Failed to fetch') hint = ' — CAUSA PROVAVEL: CORS bloqueado (file://). Tem de ser via HTTPS.';
        setTestResult({ kind: 'err', label: 'Erro DE REDE', detail: msg + hint + ' | URL: ' + location.protocol + '//' + location.host });
      });
  }, [state.apiKey]);

  const onSaveKey = useCallback(() => {
    actions.setApiKey(keyInput);
    close();
    toast('Key guardada', 'success');
  }, [actions, keyInput, close, toast]);

  const onRemoveKey = useCallback(() => {
    actions.setApiKey('');
    setKeyInput('');
    close();
    toast('Key removida', 'success');
  }, [actions, close, toast]);

  /* ── exportData (orig 1918-1941). ──────────────────────────────────────── */
  const exportData = useCallback(() => {
    if (!confirm('Exportar todos os dados para JSON?')) return;
    const data = {
      exportedAt: new Date().toISOString(),
      user: currentUser ? currentUser.email : null,
      apiKey: state.apiKey,
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
            apiKey: typeof d.apiKey === 'string' ? d.apiKey : state.apiKey,
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
    [actions, state.apiKey, toast]
  );

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
      <div className="lb" style={{ marginBottom: 10 }}>Aparencia</div>
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

      {/* ── IA / API key ── */}
      <div className="lb" style={{ marginBottom: 10 }}>Assistente IA</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
        API key da Anthropic para o scanner e assistente. Obtem em console.anthropic.com.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          id="ki"
          type={keyVisible ? 'text' : 'password'}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="sk-ant-..."
          style={{ flex: 1, padding: '12px 16px', border: '1px solid var(--border)', background: 'var(--elevated)', color: 'var(--fg)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 12, boxSizing: 'border-box' }}
        />
        <button type="button" onClick={() => setKeyVisible((v) => !v)} style={{ padding: '0 14px', border: 'none', background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 'var(--r2)', fontSize: 11, fontWeight: 600 }}>
          Ver
        </button>
      </div>
      {state.apiKey ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, padding: '6px 12px', background: 'var(--success-soft)', borderRadius: 14 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>Configurada</div>
        </div>
      ) : (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, padding: '6px 12px', background: 'var(--signal-soft)', borderRadius: 14 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--signal)' }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--signal)' }}>Sem key</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button type="button" onClick={onSaveKey} style={{ flex: 1, padding: '12px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', fontSize: 13, fontWeight: 500, borderRadius: 999 }}>
          Guardar
        </button>
        <button type="button" onClick={testAPI} style={{ padding: '12px 16px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', borderRadius: 'var(--r2)', fontSize: 11, fontWeight: 600 }}>
          Testar
        </button>
        {state.apiKey && (
          <button type="button" onClick={onRemoveKey} style={{ padding: '12px 14px', border: '1px solid var(--signal)', background: 'transparent', color: 'var(--signal)', borderRadius: 'var(--r2)', fontSize: 11, fontWeight: 600 }}>
            Remover
          </button>
        )}
      </div>
      {testResult && (
        <div id="testResult" style={{ marginBottom: 16 }}>
          <div className="lb" style={{ color: testResult.kind === 'ok' ? 'var(--success)' : testResult.kind === 'err' ? 'var(--signal)' : undefined }}>
            {testResult.label}
          </div>
          {testResult.detail && (
            <div className="m" style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4, wordBreak: 'break-all' }}>{testResult.detail}</div>
          )}
        </div>
      )}

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
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
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
        style={{ ...dataBtn, marginBottom: 24 }}
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

      {/* ── About ── */}
      <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.05em' }}>
        PROOF &middot; FINANCE &middot; v2.1
      </div>
    </Sheet>
  );
}
