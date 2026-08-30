/* ════════════════════════════════════════════════════════════════════════
   aiChat — o loop de tool-calling do assistente.

   Uma volta = uma ida ao modelo. Se ele pedir tools, executamos, devolvemos
   os resultados como mensagens role:'tool' e voltamos a ir. Máximo de
   MAX_ROUNDS voltas para nenhum modelo em ciclo queimar créditos.

   Ações destrutivas nunca escrevem aqui: o executor devolve {pending} e nós
   dizemos ao modelo que ficou à espera do utilizador. A UI mostra o cartão de
   confirmação e chama confirmPending() quando o utilizador aceitar.
   ════════════════════════════════════════════════════════════════════════ */

import { chat as defaultChat } from './ai.js';
import { TOOL_SCHEMAS, execTool, WRITE_TOOL_SLICES } from './aiTools.js';

export const MAX_ROUNDS = 4;

// Preço do tier `fast` (google/gemini-3.5-flash-lite), USD por token.
const PRICE_IN = 0.3 / 1_000_000;
const PRICE_OUT = 2.5 / 1_000_000;

export const ASSISTANT_SYSTEM = [
  'Es o assistente financeiro da app PROOF. FINANCE. Respondes em portugues de Portugal.',
  'Tens tools para ler e escrever nos dados do utilizador — usa-as em vez de adivinhar.',
  'Para alterar ou apagar um registo, procura-o primeiro com uma tool de leitura e usa o id que ela devolver.',
  'Nunca preenchas o campo "confirmed": e o utilizador que confirma na app.',
  'Respostas curtas e diretas, com markdown simples. Valores em formato europeu (1.234,56 EUR).',
].join('\n');

// Custo em DÓLARES (USD) — é assim que o OpenRouter cobra. Não há conversão
// para euros aqui: precisaria de uma taxa de câmbio ao vivo e o valor é só
// informativo, não vale o modo de falha extra. A UI mostra-o com prefixo "$".
export function estimateCost(usage) {
  if (!usage) return 0;
  return (usage.prompt_tokens || 0) * PRICE_IN + (usage.completion_tokens || 0) * PRICE_OUT;
}

function addUsage(acc, u) {
  if (!u) return acc;
  return {
    prompt_tokens: (acc.prompt_tokens || 0) + (u.prompt_tokens || 0),
    completion_tokens: (acc.completion_tokens || 0) + (u.completion_tokens || 0),
    total_tokens: (acc.total_tokens || 0) + (u.total_tokens || 0),
  };
}

function messageOf(res) {
  const c = res && res.choices && res.choices[0];
  return (c && c.message) || {};
}

// Resposta sem `choices` (ou com `choices` vazio): o proxy respondeu 200 mas o
// modelo nao devolveu nada. Sem isto a UI mostrava um cartao em branco, sem
// texto nem erro — o utilizador nao sabia se tinha corrido bem.
export const EMPTY_ANSWER = 'O modelo nao devolveu resposta. Tenta outra vez.';
// Ultimo recurso quando uma volta rebenta a meio (rede, 429, JSON invalido do
// proxy). Ver runAssistant: o que ja foi escrito NAO se perde.
const FALLBACK_ERROR = 'Falha no assistente.';

export function confirmPending(call, ctx) {
  return execTool(call.name, { ...call.args, confirmed: true }, ctx);
}

export async function runAssistant(userText, opts) {
  const o = opts || {};
  const chatFn = o.chatFn || defaultChat;
  /* `state` é um GETTER, não um retrato. As tools de leitura desestruturam
     `{ state }` e as de escrita passam por `actions`; com um objeto capturado
     no início da conversa, uma leitura feita DEPOIS de uma escrita da mesma
     conversa via sempre o estado anterior (o reducer cria um objeto novo a
     cada update, o capturado nunca muda). Resultado: "regista o jantar e
     diz-me quanto gastei" respondia sem contar o jantar. `o.state` fica só
     como recurso para quem chame sem actions (testes puros). */
  const ctx = {
    get state() {
      const s = (o.actions && o.actions.getState ? o.actions.getState() : o.state) || {};
      /* `currentUser` NAO vive no estado do reducer (e um useState a parte no
         provider) — e a UI junta-o em cada sitio que precisa dele (ver
         BalanceUpdateSheet: listAccounts({...state, currentUser})). Sem esta
         juncao, isPreviewMode(state) da true e get_overview devolve as contas
         de DEMONSTRACAO de lib/finance.js como se fossem as do utilizador: o
         assistente reportava um patrimonio inventado. */
      return o.currentUser ? { ...s, currentUser: o.currentUser } : s;
    },
    actions: o.actions,
  };
  const messages = [
    ...(o.systemPrompt ? [{ role: 'system', content: o.systemPrompt }] : []),
    ...(o.history || []),
    { role: 'user', content: userText },
  ];

  let usage = {};
  const applied = [];
  const pending = [];

  /* O try/catch envolve TODAS as voltas de propósito. Se a volta 2 rebentar
     depois de a volta 1 já ter escrito, rejeitar a promise deitava fora
     `applied` — o utilizador via um erro para uma mensagem que já lhe tinha
     mexido nos registos, e sem Anular. Aqui devolve-se sempre o que foi
     aplicado, com error:true para as duas UIs mostrarem como erro. */
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await chatFn(messages, { tools: TOOL_SCHEMAS, tier: 'fast', maxTokens: 2000 });
      usage = addUsage(usage, res && res.usage);
      const msg = messageOf(res);
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      if (!calls.length) {
        const text = msg.content || EMPTY_ANSWER;
        return {
          text,
          applied,
          pending,
          usage,
          messages: [...messages, msg.content ? msg : { role: 'assistant', content: text }],
        };
      }

      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: calls });

      calls.forEach((call) => {
        const name = call.function && call.function.name;
        let args = {};
        try {
          args = JSON.parse((call.function && call.function.arguments) || '{}');
        } catch (e) {
          args = { __parse_error: true };
        }
        let result;
        if (args.__parse_error) {
          result = { error: 'invalid_args', detail: 'argumentos nao sao JSON valido' };
        } else {
          // Barreira de confiança: um `confirmed` que venha do modelo é
          // DESCARTADO aqui. A confirmação só entra por confirmPending(), que a
          // UI chama depois de o utilizador ver a pré-visualização. O campo nem
          // sequer aparece nos schemas enviados ao modelo, mas um modelo pode
          // sempre inventar um argumento — por isso o corte é aqui, e não numa
          // instrução em linguagem natural.
          const { confirmed: _ignored, ...safeArgs } = args;
          result = execTool(name, safeArgs, ctx);
        }
        if (result && result.pending) {
          pending.push({ name, args, preview: result.preview });
          result = { status: 'awaiting_user_confirmation', preview: result.preview };
        } else if (result && result.ok && WRITE_TOOL_SLICES[name]) {
          // Só tools de ESCRITA entram em `applied` — uma tool de leitura
          // também devolve {ok:true,data}, mas não mexe em nada. Sem este
          // filtro, uma volta que só consultou dados (ex: query_expenses antes
          // de decidir o que fazer) contava como "aplicou algo": a UI perdia o
          // Anular de uma criação na MESMA volta (nome não reconhecido) e
          // invalidava o Anular de uma volta anterior só por ter perguntado
          // algo, sem ter escrito nada.
          applied.push({ name, args, data: result.data });
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      });
    }

    // Ao esgotar as voltas, a ultima mensagem em `messages` e sempre um
    // role:'tool' que responde ao ultimo tool_calls do assistant (nunca fica
    // um tool_call por responder) — por isso e seguro acrescentar aqui uma
    // mensagem assistant normal com o texto de desistencia. Sem isto, um
    // caller que reenvie `messages` como `history` na proxima chamada perdia o
    // registo de que o assistente ja tinha desistido, e podia contradizer-se.
    const giveUpText = 'Nao consegui concluir o pedido em ' + MAX_ROUNDS + ' passos. Tenta ser mais especifico.';
    return {
      text: giveUpText,
      applied,
      pending,
      usage,
      messages: [...messages, { role: 'assistant', content: giveUpText }],
    };
  } catch (err) {
    const text = (err && err.message) || FALLBACK_ERROR;
    return {
      text,
      applied,
      pending,
      usage,
      error: true,
      messages: [...messages, { role: 'assistant', content: text }],
    };
  }
}
