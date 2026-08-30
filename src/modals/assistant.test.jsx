import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';

const runAssistant = vi.fn();
const confirmPending = vi.fn(() => ({ ok: true, data: { deleted: true } }));
// Preços por tier (mock, não os reais de aiChat.js) — só para distinguir nos
// testes qual tier a folha passou a estimateCost(t.usage, t.tier). Se a
// folha esquecer de passar t.tier (voltar a `estimateCost(t.usage)`), o
// segundo argumento chega undefined e todos os tiers mostram o mesmo custo
// (o de 'economico', aqui).
const MOCK_PRICE = {
  economico: { in: 3e-7, out: 2.5e-6 },
  equilibrado: { in: 6e-7, out: 5e-6 },
  avancado: { in: 1e-6, out: 8e-6 },
};
// O mock tem de exportar TUDO o que a AssistantSheet importa do modulo.
vi.mock('../lib/aiChat.js', () => ({
  runAssistant: (...a) => runAssistant(...a),
  confirmPending: (...a) => confirmPending(...a),
  estimateCost: (u, tier) => {
    const p = MOCK_PRICE[tier] || MOCK_PRICE.economico;
    return ((u && u.prompt_tokens) || 0) * p.in + ((u && u.completion_tokens) || 0) * p.out;
  },
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

  // O seletor de modelo (SettingsSheet) só tem efeito se a folha lê
  // state.aiTier e o passa ao motor de tool-calling — aiChat.js é um módulo
  // puro e não pode ir buscá-lo ao store sozinho. Fixture com um tier não-
  // default prova que a folha lê o STORE, não uma constante local.
  it('passa o tier escolhido pelo utilizador (state.aiTier) ao runAssistant', async () => {
    runAssistant.mockResolvedValue({ text: 'ok', applied: [], pending: [], usage: {} });
    await renderWithStore(<AssistantSheet />, { openModal: 'assistant', fixture: { aiTier: 'avancado' } });
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(runAssistant).toHaveBeenCalled());
    expect(runAssistant.mock.calls[0][1].tier).toBe('avancado');
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

  // O custo mostrado tem de refletir o tier em que a volta correu de facto
  // (state.aiTier no momento do envio), não o tier economico sempre — sem
  // isto, escolher Avançado em Definições não muda nada no rodapé do cartão.
  it('o custo mostrado usa o tier escolhido pelo utilizador, não sempre o economico', async () => {
    runAssistant.mockResolvedValue({
      text: 'ok', applied: [], pending: [],
      usage: { prompt_tokens: 1000, completion_tokens: 0 },
    });
    await renderWithStore(<AssistantSheet />, { openModal: 'assistant', fixture: { aiTier: 'avancado' } });
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    // 1000 * MOCK_PRICE.avancado.in (1e-6) = $0.0010 — o preço economico
    // (3e-7) daria $0.0003. Um valor errado aqui prova que t.tier não chegou
    // a estimateCost.
    await waitFor(() => expect(screen.getByText('$0.0010')).toBeInTheDocument());
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

  /* Revisão final, must-fix 3: o Shell mantém os modais montados depois de
     abertos ("Set only grows"), por isso o Anular de uma volta sobrevive a
     fechar e reabrir a folha. Se, entretanto, o utilizador registar uma
     despesa à mão noutro ecrã, repor o array antigo apaga esse registo em
     silêncio. O botão tem de ficar DESATIVADO (não escondido) e explicar
     porquê. */
  it('uma escrita feita fora do assistente desativa o Anular, com explicação', async () => {
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
      fixture: { addedExp: [{ id: 'e0', desc: 'Existente', amount: 5, cat: 'out', date: '2026-08-01' }] },
      onReady: (ctx) => {
        capturedActions = ctx.actions;
      },
    });
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'cafe' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeEnabled());

    // Outra parte da app escreve na MESMA slice que esta volta escreveu.
    act(() => {
      capturedActions.addExpense({ id: 'manual', desc: 'Feita à mão', amount: 9, cat: 'out', date: '2026-08-30' });
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeDisabled());
    expect(screen.getByText(/já não é possível anular/i)).toBeInTheDocument();

    // E mesmo forçando o clique, nada é reposto: a despesa manual sobrevive.
    fireEvent.click(screen.getByRole('button', { name: /anular/i }));
    expect(capturedActions.getState().addedExp.map((x) => x.id).sort()).toEqual(['e0', 'e1', 'manual']);
  });

  /* Revisão final, also-fix 4: uma volta que rebenta a meio devolve
     error:true com o que ficou aplicado. A folha mostra o erro E continua a
     oferecer o Anular do que chegou a ser escrito. */
  it('uma volta com erro mostra o erro e mantém o Anular do que ficou escrito', async () => {
    let capturedActions;
    runAssistant.mockImplementation((cmd, opts) => {
      opts.actions.addExpense({ id: 'e1', desc: 'Café', amount: 1.2, cat: 'rest', date: '2026-08-28' });
      return Promise.resolve({
        text: 'Erro de rede a falar com o modelo.',
        applied: [{ name: 'add_expense', args: { desc: 'Café', amount: 1.2 }, data: { id: 'e1' } }],
        pending: [],
        usage: {},
        error: true,
      });
    });
    await renderWithStore(<AssistantSheet />, {
      openModal: 'assistant',
      fixture: { addedExp: [] },
      onReady: (ctx) => {
        capturedActions = ctx.actions;
      },
    });
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'cafe' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/Erro de rede/)).toBeInTheDocument();
    // O Anular do que chegou a ser escrito continua lá — e funciona.
    const anular = screen.getByRole('button', { name: /anular/i });
    expect(anular).toBeEnabled();
    fireEvent.click(anular);
    await waitFor(() => expect(screen.queryByRole('button', { name: /anular/i })).toBeNull());
    expect(capturedActions.getState().addedExp).toEqual([]);
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

  // Cobertura extra (não vem do brief, pedida pela revisão — ronda 2, Gap 1):
  // add_group_expense escreve DUAS slices (groupEntries + a despesa pessoal
  // refletida em addedExp, via store.addGroupEntry/reflectExpenseFor quando
  // o grupo tem reflectMine). Chama-se a action REAL (não um mock) para o
  // reflexo em addedExp acontecer de verdade, tal como aconteceria com a
  // tool real — só assim este teste apanha uma tabela tool->slice
  // incompleta (o bug real: mapear só para 'groupEntries').
  it('add_group_expense: anular repõe groupEntries E a despesa pessoal refletida', async () => {
    let capturedActions;
    runAssistant.mockImplementation((cmd, opts) => {
      const entry = {
        groupId: 'gr1',
        kind: 'expense',
        desc: 'Jantar',
        amount: 40,
        date: '2026-08-20',
        payerId: 'me',
        splitMode: 'equal',
        shares: [
          { personId: 'me', amount: 20 },
          { personId: 'p1', amount: 20 },
        ],
        gcat: 'other',
      };
      const id = opts.actions.addGroupEntry(entry);
      return Promise.resolve({
        text: 'Registei o jantar do grupo.',
        applied: [{ name: 'add_group_expense', args: { group_id: 'gr1', desc: 'Jantar', amount: 40 }, data: { id, groupId: 'gr1', amount: 40 } }],
        pending: [],
        usage: {},
      });
    });
    await renderWithStore(<AssistantSheet />, {
      openModal: 'assistant',
      fixture: {
        addedExp: [{ id: 'e0', desc: 'Existente', amount: 5, cat: 'out', date: '2026-08-01' }],
        groups: [{ id: 'gr1', name: 'Ferias', memberIds: ['me', 'p1'], reflectMine: true }],
        people: [{ id: 'p1', name: 'Ana' }],
        groupEntries: [],
      },
      onReady: (ctx) => {
        capturedActions = ctx.actions;
      },
    });
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'jantar de grupo 40' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument());

    // A escrita real fez as duas coisas: a entrada de grupo e a despesa
    // pessoal refletida (a minha parte, 20 EUR, é > 0 e o grupo reflete).
    expect(capturedActions.getState().groupEntries).toHaveLength(1);
    expect(capturedActions.getState().addedExp).toHaveLength(2);
    const reflected = capturedActions.getState().addedExp.find((x) => x.id !== 'e0');
    expect(reflected.groupEntryId).toBe(capturedActions.getState().groupEntries[0].id);

    fireEvent.click(screen.getByRole('button', { name: /anular/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /anular/i })).toBeNull());

    // Anular tem de apagar as DUAS — deixar a despesa refletida para trás
    // (um mapa tool->slice incompleto) era exatamente o Gap 1.
    expect(capturedActions.getState().groupEntries).toEqual([]);
    expect(capturedActions.getState().addedExp).toEqual([
      { id: 'e0', desc: 'Existente', amount: 5, cat: 'out', date: '2026-08-01' },
    ]);
  });

  // Cobertura extra (ronda 2, Gap 2): uma volta puramente de leitura (ex:
  // "quanto gastei este mês?") não pode apagar o Anular de uma criação
  // anterior. Depois do fix em aiChat.js, uma volta assim resolve sempre com
  // applied:[] — é esse o contrato que este teste fixa.
  it('uma volta só de leitura não invalida o Anular da volta anterior', async () => {
    runAssistant
      .mockResolvedValueOnce({
        text: 'Registei o café.',
        applied: [{ name: 'add_expense', args: { desc: 'Café', amount: 1.2 }, data: { id: 'e1' } }],
        pending: [],
        usage: {},
      })
      .mockResolvedValueOnce({
        text: 'Gastaste 1,20 EUR em café este mês.',
        applied: [],
        pending: [],
        usage: {},
      });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'cafe' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'quanto gastei este mes?' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText('Gastaste 1,20 EUR em café este mês.')).toBeInTheDocument());

    // Uma pergunta puramente informativa não pode apagar o Anular da criação.
    expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument();
  });

  // Cobertura extra (ronda 2, Gap 3): confirmar uma ação pendente (apagar/
  // editar) tem de invalidar o Anular de TODAS as voltas — não só da que
  // tinha o pedido pendente. É o mesmo perigo do Gap 1 (undo obsoleto a
  // reescrever a slice errada), agora no caminho de Confirmar.
  it('confirmar uma ação pendente limpa o Anular de todas as voltas', async () => {
    runAssistant
      .mockResolvedValueOnce({
        text: 'Registei o café.',
        applied: [{ name: 'add_expense', args: { desc: 'Café', amount: 1.2 }, data: { id: 'e1' } }],
        pending: [],
        usage: {},
      })
      .mockResolvedValueOnce({
        text: 'Confirmas?',
        applied: [],
        pending: [{ name: 'delete_expense', args: { id: 'e0' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente' } }],
        usage: {},
      });
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'cafe' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/pergunta ou regista/i), { target: { value: 'apaga a do continente' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument());

    // Antes de confirmar, o Anular da 1ª volta continua vivo — a 2ª volta só
    // pediu confirmação, ainda não escreveu nada.
    expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument();

    confirmPending.mockReturnValue({ ok: true, data: { deleted: true } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /anular/i })).toBeNull());
  });
});
