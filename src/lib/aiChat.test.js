import { describe, it, expect, vi } from 'vitest';
import { runAssistant, confirmPending, estimateCost, ASSISTANT_SYSTEM, MAX_ROUNDS, EMPTY_ANSWER } from './aiChat.js';

function ctx(seed = {}) {
  const state = { addedExp: [{ id: 'e1', desc: 'Continente', amount: 45.67, cat: 'sup', date: '2026-08-28' }], ...seed };
  const actions = {
    getState: () => state,
    addExpense: vi.fn(),
    deleteExpense: vi.fn(),
  };
  return { state, actions };
}

const say = (content) => ({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
const callTool = (name, args, id = 'c1') => ({
  choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
});

describe('runAssistant', () => {
  it('devolve o texto quando o modelo nao chama tools', async () => {
    const chatFn = vi.fn(() => Promise.resolve(say('Gastaste 45,67 EUR.')));
    const out = await runAssistant('quanto gastei?', { ...ctx(), chatFn });
    expect(out.text).toBe('Gastaste 45,67 EUR.');
    expect(chatFn).toHaveBeenCalledTimes(1);
    expect(out.applied).toEqual([]);
  });

  it('executa a tool e volta a chamar o modelo com o resultado', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('add_expense', { desc: 'Cafe', amount: 1.2, cat: 'rest' }))
      .mockResolvedValueOnce(say('Registei o cafe.'));
    const c = ctx();
    const out = await runAssistant('regista um cafe de 1,20', { ...c, chatFn });
    expect(c.actions.addExpense).toHaveBeenCalledTimes(1);
    expect(out.text).toBe('Registei o cafe.');
    expect(out.applied[0].name).toBe('add_expense');
    // a segunda chamada leva a mensagem de tool com o tool_call_id certo
    const second = chatFn.mock.calls[1][0];
    const toolMsg = second[second.length - 1];
    expect(toolMsg.role).toBe('tool');
    expect(toolMsg.tool_call_id).toBe('c1');
  });

  it('soma o usage de todas as voltas', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('add_expense', { desc: 'X', amount: 1 }))
      .mockResolvedValueOnce(say('feito'));
    const out = await runAssistant('x', { ...ctx(), chatFn });
    expect(out.usage.total_tokens).toBe(28 + 15);
  });

  it('para nas MAX_ROUNDS voltas mesmo que o modelo continue a pedir tools', async () => {
    // O teto é uma garantia de despesa (nenhum modelo em ciclo queima
    // creditos sem limite) — o valor em si faz parte do contrato, nao só o
    // facto de existir um teto.
    expect(MAX_ROUNDS).toBe(4);
    const chatFn = vi.fn(() => Promise.resolve(callTool('add_expense', { desc: 'loop', amount: 1 })));
    const out = await runAssistant('x', { ...ctx(), chatFn });
    expect(chatFn).toHaveBeenCalledTimes(MAX_ROUNDS);
    expect(out.text).toMatch(/nao consegui concluir/i);
    // A desistencia fica registada no historico devolvido — um caller que
    // reenvie `out.messages` como `history` na proxima chamada tem de ver que
    // o assistente ja avisou o utilizador, e a sequencia continua valida
    // (a ultima mensagem antes desta e a resposta ao ultimo tool_call, nunca
    // um tool_calls por responder).
    const last = out.messages[out.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.content).toBe(out.text);
    expect(out.messages[out.messages.length - 2].role).toBe('tool');
  });

  it('regista duas tool_calls do mesmo assistant message, cada uma com a sua mensagem tool na ordem certa', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call-a', type: 'function', function: { name: 'add_expense', arguments: JSON.stringify({ desc: 'Cafe', amount: 1.2 }) } },
                { id: 'call-b', type: 'function', function: { name: 'add_expense', arguments: JSON.stringify({ desc: 'Pao', amount: 0.9 }) } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      })
      .mockResolvedValueOnce(say('Registei os dois.'));
    const c = ctx();
    const out = await runAssistant('regista cafe e pao', { ...c, chatFn });
    expect(c.actions.addExpense).toHaveBeenCalledTimes(2);
    expect(out.text).toBe('Registei os dois.');
    expect(out.applied).toHaveLength(2);

    const second = chatFn.mock.calls[1][0];
    // as duas ultimas mensagens antes da chamada seguinte sao as respostas
    // das tools, na mesma ordem dos tool_calls do assistant message.
    const toolMsgs = second.slice(-2);
    expect(toolMsgs[0].role).toBe('tool');
    expect(toolMsgs[0].tool_call_id).toBe('call-a');
    expect(toolMsgs[1].role).toBe('tool');
    expect(toolMsgs[1].tool_call_id).toBe('call-b');
  });

  it('junta uma accao destrutiva a pending e nao escreve', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('delete_expense', { id: 'e1' }))
      .mockResolvedValueOnce(say('Confirmas?'));
    const c = ctx();
    const out = await runAssistant('apaga a do continente', { ...c, chatFn });
    expect(c.actions.deleteExpense).not.toHaveBeenCalled();
    expect(out.pending).toHaveLength(1);
    expect(out.pending[0].preview.label).toContain('Continente');
  });

  it('ignora um confirmed vindo do modelo e continua a pedir confirmacao', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('delete_expense', { id: 'e1', confirmed: true }))
      .mockResolvedValueOnce(say('Confirmas?'));
    const c = ctx();
    const out = await runAssistant('apaga ja', { ...c, chatFn });
    expect(c.actions.deleteExpense).not.toHaveBeenCalled();
    expect(out.pending).toHaveLength(1);
  });

  it('devolve o erro da tool ao modelo em vez de rebentar', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('delete_expense', { id: 'nao-existe' }))
      .mockResolvedValueOnce(say('Nao encontrei essa despesa.'));
    const out = await runAssistant('apaga', { ...ctx(), chatFn });
    expect(out.text).toBe('Nao encontrei essa despesa.');
    expect(out.pending).toEqual([]);
  });

  it('uma tool de leitura nao entra em applied, mesmo devolvendo {ok:true}', async () => {
    // query_expenses devolve {ok:true,data} tal como add_expense — sem o
    // filtro por WRITE_TOOL_SLICES isto contava como "aplicou algo" e a UI
    // (AssistantSheet) invalidava o Anular de uma volta anterior só por o
    // modelo ter ido consultar dados antes de responder.
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('query_expenses', {}))
      .mockResolvedValueOnce(say('Gastaste 45,67 EUR no Continente.'));
    const out = await runAssistant('quanto gastei?', { ...ctx(), chatFn });
    expect(out.applied).toEqual([]);
  });

  it('uma volta que le e cria só conta a criação em applied', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'r1', type: 'function', function: { name: 'query_expenses', arguments: '{}' } },
                { id: 'c1', type: 'function', function: { name: 'add_expense', arguments: JSON.stringify({ desc: 'Cafe', amount: 1.2 }) } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      })
      .mockResolvedValueOnce(say('Vi as tuas despesas e registei o cafe.'));
    const c = ctx();
    const out = await runAssistant('o que gastei e regista um cafe', { ...c, chatFn });
    expect(c.actions.addExpense).toHaveBeenCalledTimes(1);
    expect(out.applied).toHaveLength(1);
    expect(out.applied[0].name).toBe('add_expense');
  });

  /* Atomicidade entre voltas. Se a volta 2 rebentar depois de a volta 1 ja
     ter escrito, rejeitar a promise deitava fora `applied`: o utilizador via
     um erro para uma mensagem que JA lhe tinha mexido nos registos, e sem
     Anular nenhum. runAssistant devolve sempre o que foi aplicado. */
  it('uma volta que rebenta a meio nao esconde o que ja foi escrito', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('add_expense', { desc: 'Cafe', amount: 1.2 }))
      .mockRejectedValueOnce(new Error('Erro de rede a falar com o modelo.'));
    const c = ctx();
    const out = await runAssistant('regista o cafe', { ...c, chatFn });
    expect(c.actions.addExpense).toHaveBeenCalledTimes(1);
    // Nao rejeita: devolve o erro em banda...
    expect(out.error).toBe(true);
    expect(out.text).toMatch(/rede/i);
    // ...com a escrita que chegou a acontecer, para a UI poder oferecer Anular.
    expect(out.applied).toHaveLength(1);
    expect(out.applied[0].name).toBe('add_expense');
  });

  it('uma accao por confirmar sobrevive a uma volta seguinte que rebenta', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('delete_expense', { id: 'e1' }))
      .mockRejectedValueOnce(new Error('429'));
    const out = await runAssistant('apaga a do continente', { ...ctx(), chatFn });
    expect(out.error).toBe(true);
    expect(out.pending).toHaveLength(1);
  });

  it('devolve uma mensagem legivel quando a resposta vem sem choices', async () => {
    // O proxy respondeu 200 mas o modelo nao devolveu nada: sem isto a UI
    // desenhava um cartao vazio, sem texto nem erro.
    const chatFn = vi.fn(() => Promise.resolve({ choices: [], usage: { total_tokens: 3 } }));
    const out = await runAssistant('x', { ...ctx(), chatFn });
    expect(out.text).toBe(EMPTY_ANSWER);
    expect(out.text.trim().length).toBeGreaterThan(0);
    // A mensagem tambem entra no historico devolvido — um caller que reenvie
    // `messages` nao pode ficar com um assistant sem conteudo.
    const last = out.messages[out.messages.length - 1];
    expect(last).toEqual({ role: 'assistant', content: EMPTY_ANSWER });
  });

  /* Antes desta correcao, `text = msg.content || EMPTY_ANSWER` disparava
     sempre que a volta final vinha com conteudo vazio — mesmo quando uma
     volta anterior JA tinha escrito. O utilizador via "tenta outra vez" a
     seguir a um registo que ja tinha sido gravado, e repetir o pedido
     duplicava-o. Com `applied` preenchido, a mensagem tem de dizer o que foi
     feito, nunca convidar a repetir. */
  it('quando ja escreveu algo e a volta final vem vazia, diz o que foi feito em vez de "tenta outra vez"', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(callTool('add_expense', { desc: 'Cafe', amount: 1.2, cat: 'rest' }))
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: '' } }], usage: { total_tokens: 3 } });
    const c = ctx();
    const out = await runAssistant('regista um cafe', { ...c, chatFn });
    expect(c.actions.addExpense).toHaveBeenCalledTimes(1);
    expect(out.applied).toHaveLength(1);
    expect(out.text).not.toBe(EMPTY_ANSWER);
    expect(out.text).not.toMatch(/tenta outra vez/i);
    expect(out.text).toMatch(/nao devolveu um resumo/i);
    expect(out.text).toMatch(/despesa/i);
    // A mensagem devolvida tambem entra no historico, tal como no caso vazio.
    const last = out.messages[out.messages.length - 1];
    expect(last).toEqual({ role: 'assistant', content: out.text });
  });

  it('sem nenhuma escrita, uma resposta vazia continua a devolver EMPTY_ANSWER', async () => {
    const chatFn = vi.fn(() => Promise.resolve({ choices: [{ message: { role: 'assistant', content: '' } }] }));
    const out = await runAssistant('ola', { ...ctx(), chatFn });
    expect(out.applied).toEqual([]);
    expect(out.text).toBe(EMPTY_ANSWER);
  });

  it('sobrevive a argumentos que nao sao JSON valido', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'add_expense', arguments: '{oops' } }] } }] })
      .mockResolvedValueOnce(say('desculpa'));
    const out = await runAssistant('x', { ...ctx(), chatFn });
    expect(out.text).toBe('desculpa');
  });
});

describe('estimateCost', () => {
  it('calcula o custo do tier fast em dolares', () => {
    // OpenRouter cobra em USD, sem conversao para euros — 1M tokens de
    // entrada = 0,30 USD; 1M de saida = 2,50 USD.
    const c = estimateCost({ prompt_tokens: 1_000_000, completion_tokens: 0 });
    expect(c).toBeCloseTo(0.3, 6);
    const c2 = estimateCost({ prompt_tokens: 0, completion_tokens: 1_000_000 });
    expect(c2).toBeCloseTo(2.5, 6);
  });
  it('devolve 0 sem usage', () => {
    expect(estimateCost(null)).toBe(0);
    expect(estimateCost({})).toBe(0);
  });
});

describe('ASSISTANT_SYSTEM', () => {
  it('diz ao modelo para nao preencher o campo confirmed', () => {
    // Um simples /confirmed/ passaria mesmo que a instrucao dissesse o
    // contrario ("preenche sempre confirmed") — tem de verificar a instrucao
    // real, nao so a presenca da palavra.
    expect(ASSISTANT_SYSTEM).toMatch(/Nunca preenchas o campo "confirmed"/);
  });
});

describe('confirmPending', () => {
  it('executa a chamada com confirmed e escreve', () => {
    const c = ctx();
    const r = confirmPending({ name: 'delete_expense', args: { id: 'e1' } }, c);
    expect(r.ok).toBe(true);
    expect(c.actions.deleteExpense).toHaveBeenCalledWith('e1');
  });
});
