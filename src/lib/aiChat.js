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
import { TOOL_SCHEMAS, execTool } from './aiTools.js';

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

export function confirmPending(call, ctx) {
  return execTool(call.name, { ...call.args, confirmed: true }, ctx);
}

export async function runAssistant(userText, opts) {
  const o = opts || {};
  const chatFn = o.chatFn || defaultChat;
  const ctx = { state: o.state, actions: o.actions };
  const messages = [
    ...(o.systemPrompt ? [{ role: 'system', content: o.systemPrompt }] : []),
    ...(o.history || []),
    { role: 'user', content: userText },
  ];

  let usage = {};
  const applied = [];
  const pending = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await chatFn(messages, { tools: TOOL_SCHEMAS, tier: 'fast', maxTokens: 2000 });
    usage = addUsage(usage, res && res.usage);
    const msg = messageOf(res);
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    if (!calls.length) {
      return { text: msg.content || '', applied, pending, usage, messages: [...messages, msg] };
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
      } else if (result && result.ok) {
        applied.push({ name, args, data: result.data });
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    });
  }

  return {
    text: 'Nao consegui concluir o pedido em ' + MAX_ROUNDS + ' passos. Tenta ser mais especifico.',
    applied,
    pending,
    usage,
    messages,
  };
}
