/* ════════════════════════════════════════════════════════════════════════
   BankLinkSheet — "Contas bancárias ligadas" (Salt Edge). O cliente HTTP
   (src/lib/saltedge.js) é mockado: o que se testa aqui é o comportamento do
   ecrã (carregar, ligar, sincronizar, desligar), não a chamada de rede em si
   (essa tem os seus próprios testes em api/_lib/saltedge.security.test.js e
   api/_lib/saltedgeMap.test.js).
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import BankLinkSheet from './BankLinkSheet.jsx';

vi.mock('../lib/saltedge.js', () => ({
  linkStart: vi.fn(),
  listLinks: vi.fn(),
  syncLink: vi.fn(),
  unlinkLink: vi.fn(),
}));
import { linkStart, listLinks, syncLink, unlinkLink } from '../lib/saltedge.js';

const openSheet = () => renderWithStore(<BankLinkSheet />, { openModal: 'bankLink' });

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
});

describe('BankLinkSheet', () => {
  it('sem nenhuma ligação, mostra o estado vazio e o botão de ligar', async () => {
    listLinks.mockResolvedValue({ links: [] });
    await openSheet();
    await waitFor(() => expect(screen.getByText('Ainda não ligaste nenhum banco.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Ligar um banco/ })).toBeInTheDocument();
  });

  it('quando o servidor não tem a Salt Edge configurada, explica em vez de mostrar um ecrã vazio', async () => {
    listLinks.mockRejectedValue(new Error('Ligação bancária ainda não está configurada.'));
    await openSheet();
    await waitFor(() => expect(screen.getByText(/ainda não está configurada/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Ligar um banco/ })).not.toBeInTheDocument();
  });

  it('lista uma ligação existente com o banco e a última sincronização', async () => {
    listLinks.mockResolvedValue({
      links: [{ connectionId: 'c1', provider: { name: 'ActivoBank' }, status: 'active', lastSyncAt: '2026-09-08T10:00:00.000Z' }],
    });
    await openSheet();
    await waitFor(() => expect(screen.getByText('ActivoBank')).toBeInTheDocument());
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText(/Última sincronização/)).toBeInTheDocument();
  });

  it('"Ligar um banco" abre o connect_url da Salt Edge numa nova janela', async () => {
    listLinks.mockResolvedValue({ links: [] });
    linkStart.mockResolvedValue({ connectUrl: 'https://www.saltedge.com/connect/abc', testEnv: true });
    await openSheet();
    await waitFor(() => screen.getByRole('button', { name: /Ligar um banco/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ligar um banco/ }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://www.saltedge.com/connect/abc', '_blank', 'noopener,noreferrer'));
  });

  it('"Sincronizar agora" chama syncLink com o connectionId certo e recarrega a lista', async () => {
    listLinks.mockResolvedValue({
      links: [{ connectionId: 'c1', provider: { name: 'ActivoBank' }, status: 'active', lastSyncAt: null }],
    });
    syncLink.mockResolvedValue({ report: { newExpenses: 3, newIncomes: 1 } });
    await openSheet();
    await waitFor(() => screen.getByText('ActivoBank'));
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar agora/ }));
    await waitFor(() => expect(syncLink).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(listLinks).toHaveBeenCalledTimes(2)); // 1 ao abrir + 1 ao recarregar
  });

  it('"Desligar" pede confirmação (dois toques) antes de chamar unlinkLink', async () => {
    listLinks.mockResolvedValue({
      links: [{ connectionId: 'c1', provider: { name: 'ActivoBank' }, status: 'active', lastSyncAt: null }],
    });
    await openSheet();
    await waitFor(() => screen.getByText('ActivoBank'));
    const unlinkBtn = screen.getByRole('button', { name: 'Desligar' });
    fireEvent.click(unlinkBtn);
    expect(unlinkLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(unlinkLink).toHaveBeenCalledWith('c1'));
  });
});
