import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

const runAssistant = vi.fn();
const confirmPending = vi.fn(() => ({ ok: true, data: { deleted: true } }));
// O mock tem de exportar TUDO o que a AssistantSheet importa do modulo.
vi.mock('../lib/aiChat.js', () => ({
  runAssistant: (...a) => runAssistant(...a),
  confirmPending: (...a) => confirmPending(...a),
  estimateCost: (u) => ((u && u.prompt_tokens) || 0) * 3e-7 + ((u && u.completion_tokens) || 0) * 2.5e-6,
  ASSISTANT_SYSTEM: 'sistema-de-teste',
  MAX_ROUNDS: 4,
}));

import AssistantSheet from './AssistantSheet.jsx';

beforeEach(() => {
  runAssistant.mockReset();
  confirmPending.mockClear();
});

// renderWithStore e assincrono e abre modais por `openModal`.
const openSheet = () => renderWithStore(<AssistantSheet />, { openModal: 'assistant' });

describe('AssistantSheet', () => {
  it('mostra o campo de escrita', async () => {
    await openSheet();
    expect(screen.getByPlaceholderText(/pergunta ou regista/i)).toBeInTheDocument();
  });

  it('envia o texto e mostra a resposta', async () => {
    runAssistant.mockResolvedValue({ text: 'Registei o cafe.', applied: [], pending: [], usage: {} });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'cafe 1,20' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText('Registei o cafe.')).toBeInTheDocument());
    expect(runAssistant).toHaveBeenCalledWith('cafe 1,20', expect.objectContaining({ state: expect.any(Object) }));
  });

  it('nao envia texto vazio', async () => {
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(runAssistant).not.toHaveBeenCalled();
  });

  it('mostra o cartao de confirmacao para uma accao destrutiva', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente · 45.67 EUR · 2026-08-28' } }],
      usage: {},
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'apaga' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/Continente/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(confirmPending).not.toHaveBeenCalled();
  });

  it('confirmar executa a accao pendente', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente' } }],
      usage: {},
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'apaga' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(confirmPending).toHaveBeenCalledTimes(1));
    expect(confirmPending.mock.calls[0][0]).toEqual({ name: 'delete_expense', args: { id: 'e1' } });
  });

  it('cancelar descarta a accao pendente sem executar', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente' } }],
      usage: {},
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'apaga' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /confirmar/i })).toBeNull());
    expect(confirmPending).not.toHaveBeenCalled();
  });

  it('mostra o custo estimado do pedido', async () => {
    runAssistant.mockResolvedValue({
      text: 'ok', applied: [], pending: [],
      usage: { prompt_tokens: 5000, completion_tokens: 600 },
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    // O OpenRouter cobra em USD — o rodape mostra dolares, nao euros.
    await waitFor(() => expect(screen.getByText(/^\$\d/)).toBeInTheDocument());
  });

  it('mostra o erro quando o pedido falha', async () => {
    runAssistant.mockRejectedValue(new Error('Sem creditos no OpenRouter.'));
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/Sem creditos/)).toBeInTheDocument());
  });

  // Cobertura extra (não vem do brief): a criação aplica-se logo e fica com
  // Anular no cartão da resposta — clicar tem de repor o array anterior da
  // slice tocada. runAssistant está mockado, por isso simula-se aqui o efeito
  // que o execTool real teria (escrever via actions) antes de resolver.
  it('anular repõe o addedExp anterior depois de uma criacao aplicada', async () => {
    let capturedActions;
    runAssistant.mockImplementation((cmd, opts) => {
      opts.actions.addExpense({ id: 'novo', desc: 'Pastel de nata', amount: 1.1, cat: 'rest', date: '2026-08-29' });
      return Promise.resolve({
        text: 'Registei o pastel.',
        applied: [{ name: 'add_expense', args: { desc: 'Pastel de nata', amount: 1.1 }, data: { id: 'novo' } }],
        pending: [],
        usage: {},
      });
    });
    await renderWithStore(<AssistantSheet />, {
      openModal: 'assistant',
      fixture: { addedExp: [{ id: 'e0', desc: 'Existente', amount: 5, cat: 'out', date: '2026-08-01' }] },
      onReady: (ctx) => {
        capturedActions = ctx.actions;
      },
    });
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'pastel 1,10' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument());
    expect(capturedActions.getState().addedExp).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /anular/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /anular/i })).toBeNull());
    expect(capturedActions.getState().addedExp).toEqual([
      { id: 'e0', desc: 'Existente', amount: 5, cat: 'out', date: '2026-08-01' },
    ]);
  });
});
