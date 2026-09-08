/* ════════════════════════════════════════════════════════════════════════
   BankLinkSheet — "Contas bancárias ligadas". Liga um banco via Salt Edge
   (widget hospedado por eles: as credenciais do banco nunca passam por nós),
   lista as ligações e permite sincronizar ou desligar.

   Aberta a partir de Definições → Automação → "Contas bancárias".
   ════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useState } from 'react';
import Sheet from '../components/Sheet.jsx';
import { useModal } from '../store/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { PrimaryButton } from '../components/Buttons.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { linkStart, listLinks, syncLink, unlinkLink } from '../lib/saltedge.js';

const rowBtn = {
  padding: '8px 12px',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
};

function statusLabel(s) {
  if (s === 'active') return 'Ativa';
  if (s === 'inactive') return 'Precisa de reautorização';
  if (s === 'error') return 'Erro na última sincronização';
  return s || 'A processar';
}

export default function BankLinkSheet() {
  const { isOpen, close } = useModal('bankLink');
  const toast = useToast();
  const [links, setLinks] = useState(null); // null = a carregar
  const [notConfigured, setNotConfigured] = useState(false);
  const [busy, setBusy] = useState(''); // '' | 'link' | connectionId a sincronizar/desligar

  const load = useCallback(async () => {
    try {
      const r = await listLinks();
      setLinks(r.links || []);
      setNotConfigured(false);
    } catch (e) {
      if (String(e.message || '').includes('não está configurada')) {
        setNotConfigured(true);
        setLinks([]);
      } else {
        toast(e.message || 'Não foi possível carregar as ligações.', 'error');
        setLinks([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const onLink = async () => {
    setBusy('link');
    try {
      const r = await linkStart();
      if (r.connectUrl) {
        window.open(r.connectUrl, '_blank', 'noopener,noreferrer');
        toast(r.testEnv ? 'A abrir a Salt Edge (ambiente de testes, bancos fictícios)' : 'A abrir a Salt Edge…', 'success');
      }
    } catch (e) {
      toast(e.message || 'Não foi possível iniciar a ligação.', 'error');
    } finally {
      setBusy('');
    }
  };

  const onSync = async (connectionId) => {
    setBusy(connectionId);
    try {
      const r = await syncLink(connectionId);
      const rep = r.report || {};
      toast('Sincronizado: ' + (rep.newExpenses || 0) + ' despesas, ' + (rep.newIncomes || 0) + ' receitas novas', 'success');
      load();
    } catch (e) {
      toast(e.message || 'Sincronização falhou.', 'error');
    } finally {
      setBusy('');
    }
  };

  const onUnlink = async (connectionId) => {
    setBusy(connectionId);
    try {
      await unlinkLink(connectionId);
      toast('Banco desligado. As despesas já importadas mantêm-se.', 'success');
      load();
    } catch (e) {
      toast(e.message || 'Não foi possível desligar.', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Sheet open={isOpen} onClose={close} title="Contas bancárias ligadas">
      {notConfigured ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, padding: '8px 0' }}>
          A ligação a bancos ainda não está configurada neste servidor. Fala com quem gere a app sobre a Salt Edge.
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, margin: '0 0 16px' }}>
            As credenciais do teu banco nunca passam pela Proof — abrem-se num ecrã seguro da Salt Edge. Ligamos o banco, trazemos saldo e movimentos, e mantemos tudo sincronizado.
          </p>

          {links === null && <div style={{ fontSize: 13, color: 'var(--text3)' }}>A carregar…</div>}

          {links != null && links.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>Ainda não ligaste nenhum banco.</div>
          )}

          {links != null &&
            links.map((l) => (
              <div
                key={l.connectionId}
                style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{(l.provider && l.provider.name) || 'Banco ligado'}</span>
                  <span style={{ fontSize: 11, color: l.status === 'active' ? 'var(--success)' : 'var(--text3)' }}>{statusLabel(l.status)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, marginBottom: 10 }}>
                  {l.lastSyncAt ? 'Última sincronização: ' + new Date(l.lastSyncAt).toLocaleString('pt-PT') : 'Ainda sem sincronizar'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={rowBtn} disabled={busy === l.connectionId} onClick={() => onSync(l.connectionId)}>
                    {busy === l.connectionId ? 'A sincronizar…' : 'Sincronizar agora'}
                  </button>
                  <ConfirmButton label="Desligar" confirmLabel="Confirmar" onConfirm={() => onUnlink(l.connectionId)} style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }} />
                </div>
              </div>
            ))}

          <PrimaryButton onClick={onLink} disabled={busy === 'link'} style={{ marginTop: 8 }}>
            {busy === 'link' ? 'A abrir…' : '+ Ligar um banco'}
          </PrimaryButton>
        </>
      )}
    </Sheet>
  );
}
