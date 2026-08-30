import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
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

  // Cobertura extra (não vem do brief, pedida pela revisão): a conversa é
  // uma live region — sem isto, um leitor de ecrã fica em silêncio quando a
  // resposta do assistente chega.
  it('a conversa é anunciada a leitores de ecrã (aria-live=polite)', async () => {
    const { container } = await openSheet();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
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

  // Cobertura extra (não vem do brief, pedida pela revisão): duas criações
  // seguidas na MESMA slice. Antes do fix, o Anular da 1ª volta ficava vivo
  // depois da 2ª aplicar — clicar nele repunha addedExp para o valor de ANTES
  // da 1ª volta, apagando as duas criações de uma vez. O fix exige duas
  // coisas ao mesmo tempo: (1) só a volta mais recente pode oferecer Anular
  // (o da 1ª desaparece assim que a 2ª aplica algo) e (2) mesmo esse único
  // Anular restante só repõe a slice tal como estava ANTES da 2ª volta — ou
  // seja, já COM a criação da 1ª volta lá dentro.
  it('duas criações seguidas: o Anular da 1ª desaparece e o da 2ª não apaga a 1ª', async () => {
    let capturedActions;
    let call = 0;
    runAssistant.mockImplementation((cmd, opts) => {
      call += 1;
      if (call === 1) {
        opts.actions.addExpense({ id: 'e1', desc: 'Café', amount: 1.2, cat: 'rest', date: '2026-08-28' });
        return Promise.resolve({
          text: 'Registei o café.',
          applied: [{ name: 'add_expense', args: { desc: 'Café', amount: 1.2 }, data: { id: 'e1' } }],
          pending: [],
          usage: {},
        });
      }
      opts.actions.addExpense({ id: 'e2', desc: 'Pastel', amount: 1.1, cat: 'rest', date: '2026-08-29' });
      return Promise.resolve({
        text: 'Registei o pastel.',
        applied: [{ name: 'add_expense', args: { desc: 'Pastel', amount: 1.1 }, data: { id: 'e2' } }],
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
    const input = screen.getByPlaceholderText(/pergunta ou regista/i);
    const sendBtn = () => screen.getByRole('button', { name: /enviar/i });

    fireEvent.change(input, { target: { value: 'cafe' } });
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getAllByRole('button', { name: /anular/i })).toHaveLength(1));

    fireEvent.change(input, { target: { value: 'pastel' } });
    fireEvent.click(sendBtn());
    await waitFor(() => expect(screen.getByText('Registei o pastel.')).toBeInTheDocument());

    // O registo da 2ª volta chegou ao store sem nada o ter apagado.
    expect(capturedActions.getState().addedExp.map((x) => x.id).sort()).toEqual(['e0', 'e1', 'e2']);

    // Só pode haver UM Anular vivo — o da 2ª volta. O da 1ª desapareceu.
    const anularButtons = screen.getAllByRole('button', { name: /anular/i });
    expect(anularButtons).toHaveLength(1);

    // E esse único Anular restante (o da 2ª volta) não pode apagar a
    // criação da 1ª: repõe addedExp para o estado logo antes da 2ª volta,
    // que já tinha e0 e e1 lá dentro.
    fireEvent.click(anularButtons[0]);
    await waitFor(() => expect(screen.queryByRole('button', { name: /anular/i })).toBeNull());
    expect(capturedActions.getState().addedExp.map((x) => x.id).sort()).toEqual(['e0', 'e1']);
  });

  // Cobertura extra (não vem do brief, pedida pela revisão): o Anular só
  // pode repor a slice que a PRÓPRIA volta tocou (addedExp, aqui) — nunca as
  // 11 de uma vez. Simula-se "outra parte da app" a escrever 'people'
  // diretamente (fora do assistente) enquanto o Anular ainda está vivo; se o
  // Anular repusesse o snapshot completo de 11 slices, essa escrita seria
  // apagada silenciosamente mesmo sem ter nada a ver com esta volta.
  it('anular só mexe na slice da própria volta — não apaga outra slice alterada entretanto', async () => {
    let capturedActions;
    runAssistant.mockImplementation((cmd, opts) => {
      opts.actions.addExpense({ id: 'e1', desc: 'Café', amount: 1.2, cat: 'rest', date: '2026-08-28' });
      return Promise.resolve({
        text: 'Registei o café.',
        applied: [{ name: 'add_expense', args: { desc: 'Café', amount: 1.2 }, data: { id: 'e1' } }],
        pending: [],
        usage: {},
      });
    });
    await renderWithStore(<AssistantSheet />, {
      openModal: 'assistant',
      fixture: {
        addedExp: [{ id: 'e0', desc: 'Existente', amount: 5, cat: 'out', date: '2026-08-01' }],
        people: [{ id: 'p0', name: 'Ana' }],
      },
      onReady: (ctx) => {
        capturedActions = ctx.actions;
      },
    });
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'cafe' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument());

    // Outra parte da app (não o assistente) escreve 'people' enquanto o
    // Anular deste turno ainda está no ecrã.
    act(() => {
      capturedActions.addPerson({ id: 'p1', name: 'Bruno' });
    });

    fireEvent.click(screen.getByRole('button', { name: /anular/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /anular/i })).toBeNull());

    // addedExp voltou ao que era antes desta volta (só e0)...
    expect(capturedActions.getState().addedExp.map((x) => x.id).sort()).toEqual(['e0']);
    // ...mas 'people' — slice que esta volta nunca tocou — ficou intacto,
    // com a escrita entretanto feita por fora.
    expect(capturedActions.getState().people.map((p) => p.id).sort()).toEqual(['p0', 'p1']);
  });

  // Cobertura extra (não vem do brief, pedida pela revisão — Minor): um
  // pedido em curso (busy) tem de desativar Confirmar/Cancelar/Anular de
  // voltas anteriores, tal como já desativa o Enviar — nada pode escrever a
  // meio de um pedido.
  it('enquanto está ocupado, Confirmar/Cancelar/Anular ficam desativados', async () => {
    runAssistant.mockResolvedValueOnce({
      text: 'Registei e falta confirmar uma coisa.',
      applied: [{ name: 'add_expense', args: { desc: 'Café', amount: 1.2 }, data: { id: 'e1' } }],
      pending: [{ name: 'delete_expense', args: { id: 'e0' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente' } }],
      usage: {},
    });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument());

    // 2º pedido fica pendurado (nunca resolve) para observar o estado busy.
    let resolveSecond;
    runAssistant.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        })
    );
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /anular/i })).toBeDisabled();

    // Resolve a promise pendurada para não vazar estado para o teste seguinte.
    await act(async () => {
      resolveSecond({ text: 'ok', applied: [], pending: [], usage: {} });
      await Promise.resolve();
    });
  });
});
