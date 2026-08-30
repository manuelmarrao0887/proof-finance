/* ════════════════════════════════════════════════════════════════════════
   AIView — chat. O separador "Assistente IA" deixa de montar o seu próprio
   prompt/JSON e passa a usar o mesmo motor de tool-calling da AssistantSheet
   (runAssistant). Este ficheiro cobre só a metade do chat — o painel de
   import de documentos (callAI) fica noutro ficheiro, intocado.
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { WRITE_TOOL_SLICES } from '../lib/aiTools.js';

const runAssistant = vi.fn();
const confirmPending = vi.fn(() => ({ ok: true, data: {} }));
vi.mock('../lib/aiChat.js', () => ({
  runAssistant: (...a) => runAssistant(...a),
  confirmPending: (...a) => confirmPending(...a),
  estimateCost: () => 0,
  ASSISTANT_SYSTEM: 'sistema-de-teste',
  MAX_ROUNDS: 4,
}));

import AIView, { actionLabel } from './AIView.jsx';

beforeEach(() => {
  runAssistant.mockReset();
  confirmPending.mockReset();
  confirmPending.mockReturnValue({ ok: true, data: {} });
});

describe('AIView — chat', () => {
  it('envia o comando pelo runAssistant e guarda no historico', async () => {
    runAssistant.mockResolvedValue({ text: 'Gastaste 45,20 EUR.', applied: [], pending: [], usage: {} });
    await renderWithStore(<AIView />);
    const box = screen.getByPlaceholderText(/pergunta|regista|comando/i);
    fireEvent.change(box, { target: { value: 'quanto gastei em supermercado?' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(runAssistant).toHaveBeenCalledTimes(1));
    expect(runAssistant.mock.calls[0][0]).toBe('quanto gastei em supermercado?');
    await waitFor(() => expect(screen.getByText(/45,20/)).toBeInTheDocument());
  });

  it('mostra o erro sem rebentar a view', async () => {
    runAssistant.mockRejectedValue(new Error('Demasiados pedidos. Tenta daqui a pouco.'));
    await renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/Demasiados pedidos/)).toBeInTheDocument());
  });

  /* Revisão final, also-fix 4: runAssistant já não rejeita quando uma volta
     rebenta a meio — devolve error:true com o que ficou aplicado. A view tem
     de mostrar isso como ERRO (não como uma análise bem sucedida) e continuar
     a listar o que chegou a ser escrito, para o utilizador ver o que já lhe
     mexeu nos dados. */
  it('uma volta com erro a meio aparece como erro e ainda lista o que foi escrito', async () => {
    runAssistant.mockResolvedValue({
      text: 'Erro de rede a falar com o modelo.',
      applied: [{ name: 'add_expense', args: { desc: 'Café', amount: 1.2, cat: 'rest' }, data: { id: 'e1' } }],
      pending: [],
      usage: {},
      error: true,
    });
    await renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'cafe 1,20' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByText(/Erro de rede/)).toBeInTheDocument());
    // Etiqueta de erro, nunca "Executado"/"Análise".
    expect(screen.getByText('Erro')).toBeInTheDocument();
    expect(screen.queryByText('Executado')).toBeNull();
    // ...e a despesa que chegou a ser escrita continua listada.
    expect(screen.getByText(/Café/)).toBeInTheDocument();
  });

  // Prova de que a view já não monta o próprio prompt: o system prompt tem
  // de vir do ASSISTANT_SYSTEM partilhado (aqui mockado como uma string
  // reconhecível), nunca de um texto local escrito à mão em AIView.jsx.
  it('usa o ASSISTANT_SYSTEM partilhado, não um prompt local', async () => {
    runAssistant.mockResolvedValue({ text: 'ok', applied: [], pending: [], usage: {} });
    await renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(runAssistant).toHaveBeenCalledTimes(1));
    const opts = runAssistant.mock.calls[0][1];
    expect(opts.systemPrompt.startsWith('sistema-de-teste')).toBe(true);
    expect(opts.systemPrompt).toContain('CONTEXTO');
  });

  // Uma entrada antiga, persistida antes desta refactorização, com
  // mode:'analysis' continua a renderizar (regressão).
  it('renderiza uma entrada antiga com mode "analysis"', async () => {
    await renderWithStore(<AIView />, {
      fixture: {
        aiHistory: [
          { date: '01/01/2026, 10:00:00', cmd: 'pergunta antiga', analysis: 'Resposta antiga em markdown.', ok: true, mode: 'analysis' },
        ],
      },
    });
    expect(screen.getByText('Resposta antiga em markdown.')).toBeInTheDocument();
    expect(screen.getByText('Análise')).toBeInTheDocument();
  });

  // Uma entrada nova, escrita pelo runAssistant (mode:'chat' + analysis),
  // tem de renderizar exatamente como a antiga — mesmo texto, mesmo badge.
  it('renderiza uma entrada nova com mode "chat" como uma análise', async () => {
    await renderWithStore(<AIView />, {
      fixture: {
        aiHistory: [
          { date: '01/01/2026, 10:00:00', cmd: 'pergunta nova', analysis: 'Resposta via runAssistant.', ok: true, mode: 'chat' },
        ],
      },
    });
    expect(screen.getByText('Resposta via runAssistant.')).toBeInTheDocument();
    expect(screen.getByText('Análise')).toBeInTheDocument();
  });

  // O caminho `pending`: runAssistant pode devolver ações destrutivas por
  // confirmar. A view NUNCA pode confirmar sozinha — mas também não pode
  // engolir o pedido em silêncio. Tem de avisar e dar forma de confirmar.
  it('avisa quando há uma ação pendente e não a executa sozinha', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente · 45,67 EUR' } }],
      usage: {},
    });
    await renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'apaga a do continente' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/Continente/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    // Nunca auto-confirma.
    expect(confirmPending).not.toHaveBeenCalled();
  });

  it('confirmar uma ação pendente chama confirmPending e remove o cartão', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente · 45,67 EUR' } }],
      usage: {},
    });
    await renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'apaga a do continente' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(confirmPending).toHaveBeenCalledTimes(1));
    expect(confirmPending.mock.calls[0][0]).toEqual({ name: 'delete_expense', args: { id: 'e1' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /confirmar/i })).toBeNull());
  });

  it('cancelar uma ação pendente não chama confirmPending', async () => {
    runAssistant.mockResolvedValue({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente · 45,67 EUR' } }],
      usage: {},
    });
    await renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'apaga a do continente' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /confirmar/i })).toBeNull());
    expect(confirmPending).not.toHaveBeenCalled();
  });

  // Finding 2 da revisão: o cartão de pendente partilhado (PendingActionCard)
  // tem de desativar Confirmar/Cancelar enquanto há um pedido em curso — o
  // mesmo guard que a AssistantSheet já tinha e que faltava aqui. Sem o
  // `busy={aiLoading}` na chamada ao componente partilhado, estes botões
  // ficariam sempre clicáveis e este teste falharia.
  it('enquanto processa um novo pedido, Confirmar/Cancelar do pendente anterior ficam desativados', async () => {
    runAssistant.mockResolvedValueOnce({
      text: 'Confirmas?',
      applied: [],
      pending: [{ name: 'delete_expense', args: { id: 'e1' }, preview: { action: 'delete', kind: 'despesa', label: 'Continente' } }],
      usage: {},
    });
    await renderWithStore(<AIView />);
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'apaga a do continente' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));

    // 2º pedido fica pendurado (nunca resolve) para observar aiLoading=true.
    let resolveSecond;
    runAssistant.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        })
    );
    fireEvent.change(screen.getByPlaceholderText(/pergunta|regista|comando/i), { target: { value: 'outro pedido' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeDisabled();

    // Resolve a promise pendurada para não vazar estado para o teste seguinte.
    await act(async () => {
      resolveSecond({ text: 'ok', applied: [], pending: [], usage: {} });
      await Promise.resolve();
    });
  });

  // Finding 1 da revisão: settle_group é uma transferência de dinheiro real
  // entre pessoas — tem de aparecer no histórico com etiqueta em PT-PT e o
  // valor do acerto, nunca como a string em bruto do nome da tool.
  it('settle_group aparece no historico com etiqueta PT-PT e o valor, nunca a string em bruto', async () => {
    await renderWithStore(<AIView />, {
      fixture: {
        aiHistory: [
          {
            date: '01/01/2026, 10:00:00',
            cmd: 'acerta contas com a Ana',
            analysis: 'Acerto registado.',
            actions: [{ type: 'settle_group', group_id: 'g1', from_id: 'me', to_id: 'p1', amount: 12.5 }],
            ok: true,
            mode: 'chat',
          },
        ],
      },
    });
    expect(screen.queryByText('settle_group')).toBeNull();
    expect(screen.getByText(/12,50/)).toBeInTheDocument();
  });
});

// Finding 1 da revisão: actionLabel tinha de reconhecer só 5 nomes de tools
// (o vocabulário do prompt manual antigo). Agora que o chat passa por
// runAssistant, res.applied pode trazer qualquer tool de escrita — uma sem
// branch cai no {icon:'help', lbl: a.type} genérico e mostra o nome bruto da
// tool (em inglês) ao utilizador. Este teste itera WRITE_TOOL_SLICES (a
// fonte única do que é uma tool de escrita, lib/aiTools.js) e falha assim
// que uma tool nova for adicionada lá sem um branch correspondente aqui.
describe('actionLabel — cobertura das tools de escrita', () => {
  it('tem um label reconhecido (nao "help") para cada tool em WRITE_TOOL_SLICES', () => {
    Object.keys(WRITE_TOOL_SLICES).forEach((name) => {
      const info = actionLabel({ type: name });
      expect(info.icon, name + ' nao deveria cair no icon "help" generico').not.toBe('help');
    });
  });
});
