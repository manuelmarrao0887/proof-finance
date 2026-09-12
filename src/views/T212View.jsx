/* ════════════════════════════════════════════════════════════════════════
   T212View — carteira Trading212: base de custo, valor atual, ganho total
   acumulado (valorAtual − baseCusto) + histórico de leituras. Área simples e
   separada da tab "Investimentos" (que tem posições por ativo) — aqui há uma
   carteira só, sem sub-contas a desambiguar. Respeita o ocultar-saldos.

   "Sincronizar" chama /api/t212, que lê a API v0 da Trading212 no servidor e
   grava a leitura do dia + as posições por ativo. Como o servidor escreve com
   a Admin SDK e o store carrega uma vez só (sem onSnapshot), depois de
   sincronizar recarregamos os dados com loadUser(). O botão "Manual" continua
   lá para quando a API estiver em baixo ou a conta não for Invest/ISA.
   ════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { fc, fmDateShort } from '../lib/format.js';
import { latestT212, t212History, t212Gain, t212GainPct } from '../lib/trading212.js';
import { t212Status, t212Sync, t212CleanupManual } from '../lib/trading212Api.js';

// '2026-09-11T18:30:00.000Z' → '11 set 26, 19:30' (hora local).
function fmSyncedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return fmDateShort(d.toISOString().slice(0, 10), true) + ', ' + hh + ':' + mm;
}

export default function T212View() {
  const { state, actions, currentUser } = useStore();
  const { open } = useUI();
  const toast = useToast();

  const [status, setStatus] = useState(null); // null = ainda a saber
  const [busy, setBusy] = useState(false);
  const [dupes, setDupes] = useState(null); // manuais que parecem ser da T212

  // Estado da integração (configurada? que ambiente? última sync?). Vive no
  // doc raiz escrito pelo servidor, fora do slice persistido do cliente — por
  // isso vem por API, não do store. Falhar aqui não bloqueia nada.
  const refreshStatus = useCallback(() => {
    t212Status()
      .then(setStatus)
      .catch(() => setStatus((s) => s || { configured: true, env: 'live', enabled: false, lastSyncAt: null }));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // `?quick=1` (deep-link do toque/ação numa notificação de lembrete — ver
  // src/sw.js DEEP_LINKS) abre logo o sheet de atualizar, sem precisar de
  // tocar em "Atualizar" outra vez. Removido do URL para não reabrir numa
  // troca de tab.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('quick') !== '1') return;
    params.delete('quick');
    const next = params.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (next ? '?' + next : ''));
    open('t212Update');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSync = useCallback(async () => {
    setBusy(true);
    try {
      const { report } = await t212Sync();
      if (currentUser && currentUser.uid) await actions.loadUser(currentUser.uid);
      const parts = [fc(report.valorAtual), report.positions + ' posições'];
      if (report.removed) parts.push(report.removed + ' fechadas');
      toast('Carteira sincronizada: ' + parts.join(' · '), 'success');
      setDupes(report.manualCandidates && report.manualCandidates.length ? report.manualCandidates : null);
      refreshStatus();
    } catch (e) {
      toast((e && e.message) || 'Sincronização falhou.', 'error');
    } finally {
      setBusy(false);
    }
  }, [actions, currentUser, toast, refreshStatus]);

  const onCleanup = useCallback(async () => {
    const ids = (dupes || []).map((p) => p.id);
    setBusy(true);
    try {
      const out = await t212CleanupManual(ids);
      if (currentUser && currentUser.uid) await actions.loadUser(currentUser.uid);
      toast((out.removed || 0) + ' posições manuais apagadas', 'success');
      setDupes(null);
    } catch (e) {
      toast((e && e.message) || 'Não foi possível apagar.', 'error');
    } finally {
      setBusy(false);
    }
  }, [dupes, actions, currentUser, toast]);

  const log = state.t212Log || [];
  const hidden = !!state.balancesHidden;
  const mv = (v) => (hidden ? '••••' : fc(v));

  const latest = latestT212(log);
  const gain = t212Gain(latest);
  const gainPct = t212GainPct(latest);
  const history = t212History(log).reverse(); // mais recente primeiro
  const gainColor = gain == null ? 'var(--text2)' : gain >= 0 ? 'var(--success)' : 'var(--signal)';

  const notConfigured = status && status.configured === false;
  const isDemo = !!(status && status.env === 'demo');

  const btn = (primary) => ({
    padding: '7px 12px',
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--primary)' : 'var(--surface)',
    color: primary ? 'var(--bg)' : 'var(--fg)',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  });

  return (
    <div className="fadeUp" style={{ padding: '0 20px calc(40px + var(--safe-bottom))' }}>
      <div className="cd" style={{ marginBottom: 16 }}>
        <div className="rw">
          <div className="lb">Valor atual</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={onSync} disabled={busy || notConfigured} style={{ ...btn(true), opacity: busy || notConfigured ? 0.6 : 1 }}>
              {busy ? 'A sincronizar…' : 'Sincronizar'}
            </button>
            <button type="button" onClick={() => open('t212Update')} style={btn(false)}>
              Manual
            </button>
          </div>
        </div>
        <div className="m" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>
          {latest ? mv(latest.valorAtual) : '—'}
        </div>
        {latest && !hidden && (
          <div className="m" style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: gainColor }}>
            {(gain >= 0 ? '+' : '') + fc(gain)}
            {gainPct != null ? ' (' + (gain >= 0 ? '+' : '') + gainPct.toFixed(1) + '%)' : ''}
          </div>
        )}
        {latest && (
          <div className="lb" style={{ marginTop: 6 }}>
            Base de custo: {mv(latest.baseCusto)} · atualizado {fmDateShort(latest.date, true)}
          </div>
        )}
        {notConfigured ? (
          <div className="lb" style={{ marginTop: 8, color: 'var(--signal)' }}>
            A sync automática não está configurada no servidor (falta TRADING212_API_KEY). Usa "Manual" entretanto.
          </div>
        ) : (
          <div className="lb" style={{ marginTop: 8, color: 'var(--text3)' }}>
            {status && status.lastSyncAt
              ? 'Última sincronização: ' + fmSyncedAt(status.lastSyncAt)
              : 'Sem sincronizações ainda — toca em Sincronizar para ligar a sync diária.'}
            {isDemo ? ' · conta demo (dinheiro fictício)' : ''}
          </div>
        )}
      </div>

      {dupes && (
        <div className="cd" style={{ marginBottom: 16, borderLeft: '3px solid var(--warn, var(--signal))' }}>
          <div className="lb" style={{ marginBottom: 6 }}>
            {dupes.length === 1 ? 'Há 1 posição manual' : 'Há ' + dupes.length + ' posições manuais'} que parecem ser da Trading212 — agora
            duplicam as que a sync traz.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
            {dupes.map((p) => p.asset || p.id).join(', ')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onCleanup} disabled={busy} style={btn(true)}>
              Apagar duplicados
            </button>
            <button type="button" onClick={() => setDupes(null)} style={btn(false)}>
              Manter
            </button>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <div className="empty" style={{ padding: '40px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sem leituras</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Toca em "Sincronizar" para ler a carteira da Trading212, ou em "Manual" para introduzires os valores à mão.</div>
        </div>
      ) : (
        <>
          <div className="lb" style={{ marginBottom: 8 }}>Histórico</div>
          {history.map((r) => {
            const g = t212Gain(r);
            const gPct = t212GainPct(r);
            return (
              <div key={r.id} className="cd" style={{ marginBottom: 8, padding: '12px 16px' }}>
                <div className="rw">
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {fmDateShort(r.date, true)}
                    {r.source === 't212' ? ' · auto' : ''}
                  </span>
                  <span className="m" style={{ fontSize: 14, fontWeight: 700 }}>{mv(r.valorAtual)}</span>
                </div>
                {!hidden && (
                  <div className="rw" style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>Base: {mv(r.baseCusto)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: g >= 0 ? 'var(--success)' : 'var(--signal)' }}>
                      {(g >= 0 ? '+' : '') + fc(g)}
                      {gPct != null ? ' (' + (g >= 0 ? '+' : '') + gPct.toFixed(1) + '%)' : ''}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
