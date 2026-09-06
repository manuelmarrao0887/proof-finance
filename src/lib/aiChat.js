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

// Preço por tier, USD por token (in/out) — verificado na API viva da
// OpenRouter, mesmos valores de api/ai.js MODEL_TIERS. Um tier mais caro
// custa 2-3x o economico; sem uma tabela por tier, a estimativa mostrada
// ficava sempre ao preço barato mesmo quando a conversa corria noutro tier
// (SettingsSheet já anuncia os três preços lado a lado — mostrar sempre o
// mesmo número aqui contradizia isso).
const TIER_PRICES = {
  economico: { in: 0.3 / 1_000_000, out: 2.5 / 1_000_000 },
  equilibrado: { in: 0.75 / 1_000_000, out: 3.75 / 1_000_000 },
  avancado: { in: 1.0 / 1_000_000, out: 5.0 / 1_000_000 },
};
const DEFAULT_PRICE_TIER = 'economico';

export const ASSISTANT_SYSTEM = [
  'Es o assistente financeiro da app PROOF. FINANCE. Respondes em portugues de Portugal.',
  'Tens tools para ler e escrever nos dados do utilizador — usa-as em vez de adivinhar.',
  'Para alterar ou apagar um registo, procura-o primeiro com uma tool de leitura e usa o id que ela devolver.',
  'Quando o utilizador diz com que conta ou banco pagou ("pago pelo Activobank", "no cartão Revolut"), passa esse nome em "acct" de add_expense/update_expense; o nome exato das contas está em "accounts" no contexto. Se uma tool devolver "ambiguous_account", faz ao utilizador exatamente a pergunta que vem em "detail", sem escolher tu a conta, e espera pela resposta antes de tentares outra vez.',
  'Nunca preenchas o campo "confirmed": e o utilizador que confirma na app.',
  'Respostas curtas e diretas, com markdown simples. Valores em formato europeu (1.234,56 EUR).',
].join('\n');

// Custo em DÓLARES (USD) — é assim que o OpenRouter cobra. Não há conversão
// para euros aqui: precisaria de uma taxa de câmbio ao vivo e o valor é só
// informativo, não vale o modo de falha extra. A UI mostra-o com prefixo "$".
// `tier` é o tier em que a volta correu de facto (o chamador guarda-o por
// turno — ver AssistantSheet — em vez de reler o tier ATUAL da store, que
// pode já ter mudado desde essa volta). Um tier desconhecido/ausente cai no
// preço economico, nunca em NaN nem a rebentar.
export function estimateCost(usage, tier) {
  if (!usage) return 0;
  const price = TIER_PRICES[tier] || TIER_PRICES[DEFAULT_PRICE_TIER];
  return (usage.prompt_tokens || 0) * price.in + (usage.completion_tokens || 0) * price.out;
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

// Nome pt-PT (singular) de cada tool de escrita nao-destrutiva, para resumir
// `applied` quando o modelo escreve e depois nao devolve texto nenhum.
const APPLIED_NOUN = {
  add_expense: 'uma despesa',
  add_income: 'uma receita',
  add_goal: 'uma meta',
  add_recurring: 'uma despesa recorrente',
  add_category: 'uma categoria',
  add_rule: 'uma regra',
  add_snapshot: 'um snapshot',
  create_group: 'um grupo',
  add_person: 'uma pessoa',
  add_group_expense: 'uma despesa de grupo',
  settle_group: 'um acerto de grupo',
};

// "tenta outra vez" (EMPTY_ANSWER) so faz sentido quando NADA foi escrito.
// Quando o modelo ja aplicou escritas nesta conversa (applied nao vazio) e a
// volta final vem sem texto, convidar a repetir o pedido arriscava duplicar
// uma escrita que ja tinha ficado gravada — este texto diz o que foi feito
// em vez disso, sem sugerir repetir.
function noSummaryAfterWrite(applied) {
  const items = applied.map((a) => APPLIED_NOUN[a.name] || 'uma alteracao');
  const list =
    items.length === 1
      ? items[0]
      : items.slice(0, -1).join(', ') + ' e ' + items[items.length - 1];
  return 'Ja tratei disto: ' + list + '. O modelo nao devolveu um resumo desta vez.';
}

export function confirmPending(call, ctx) {
  return execTool(call.name, { ...call.args, confirmed: true }, ctx);
}

/* toolCtx — a MESMA forma de ctx para as tools em qualquer sítio que as
   chame: runAssistant (voltas normais) e o confirmPending() das duas UIs
   (AssistantSheet, AIView), no clique em "Confirmar" de uma tool destrutiva.
   `state` é um GETTER, não um retrato — ver runAssistant abaixo para o
   porquê. `currentUser` NAO vive no estado do reducer (é um useState à parte
   no provider) — sem o juntar aqui, isPreviewMode(state) dá true e
   listAccounts/getAccts devolvem as contas de DEMONSTRAÇÃO em vez das do
   utilizador. Nasceu porque cada UI construía o ctx de confirmPending() à
   mão, sem currentUser — uma escrita CONFIRMADA (update_expense com `acct`,
   Task 5) resolvia contra bancos de demonstração em produção, silenciosamente
   (revisão da Task 5, Finding 1). `fallbackState` só serve testes puros sem
   `actions` (ver comentário antigo, preservado aqui). */
export function toolCtx(actions, currentUser, fallbackState) {
  return {
    get state() {
      const s = (actions && actions.getState ? actions.getState() : fallbackState) || {};
      return currentUser ? { ...s, currentUser } : s;
    },
    actions,
  };
}

// Piso de tier quando a mensagem do utilizador leva imagem — o MESMO
// raciocinio do chao de documentos em lib/ai.js (TIER_FOR_MODEL): um modelo
// barato a ler um print e falsa economia. So 'avancado', escolhido pelo
// utilizador, sobe acima do piso; qualquer outra coisa cai em 'equilibrado'.
const IMAGE_TIER_FLOOR = 'equilibrado';
function tierForContent(tier, hasImage) {
  if (!hasImage) return tier || 'economico';
  return tier === 'avancado' ? 'avancado' : IMAGE_TIER_FLOOR;
}

function hasImageBlock(content) {
  return Array.isArray(content) && content.some((b) => b && b.type === 'image');
}

// Reduz uma mensagem com imagem a um marcador de texto para o historico da
// PROXIMA chamada — sem isto, cada volta seguinte reenviava a imagem
// (custo cresce sozinho) e o aiHistory persistido no Firestore engordava
// com base64. So se aplica a mensagens role:'user' com content em array;
// o resto (assistant, tool) passa tal como esta.
function markerFor(content) {
  if (!Array.isArray(content)) return content;
  const text = content
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join(' ')
    .trim();
  return text ? '[imagem] ' + text : '[imagem]';
}

function withMarkers(msgs) {
  return msgs.map((m) => (m.role === 'user' && Array.isArray(m.content) ? { ...m, content: markerFor(m.content) } : m));
}

export async function runAssistant(cmd, opts) {
  const o = opts || {};
  const chatFn = o.chatFn || defaultChat;
  /* `state` é um GETTER, não um retrato. As tools de leitura desestruturam
     `{ state }` e as de escrita passam por `actions`; com um objeto capturado
     no início da conversa, uma leitura feita DEPOIS de uma escrita da mesma
     conversa via sempre o estado anterior (o reducer cria um objeto novo a
     cada update, o capturado nunca muda). Resultado: "regista o jantar e
     diz-me quanto gastei" respondia sem contar o jantar. `o.state` fica só
     como recurso para quem chame sem actions (testes puros). */
  const ctx = toolCtx(o.actions, o.currentUser, o.state);
  const messages = [
    ...(o.systemPrompt ? [{ role: 'system', content: o.systemPrompt }] : []),
    ...(o.history || []),
    { role: 'user', content: cmd },
  ];
  const tier = tierForContent(o.tier, hasImageBlock(cmd));

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
      const res = await chatFn(messages, { tools: TOOL_SCHEMAS, tier, maxTokens: 2000 });
      usage = addUsage(usage, res && res.usage);
      const msg = messageOf(res);
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      if (!calls.length) {
        // EMPTY_ANSWER ("tenta outra vez") so quando NADA foi escrito nesta
        // conversa — com `applied` ja preenchido, convidar a repetir o pedido
        // arriscava duplicar uma escrita que ja tinha ficado gravada.
        const text = msg.content || (applied.length ? noSummaryAfterWrite(applied) : EMPTY_ANSWER);
        return {
          text,
          applied,
          pending,
          usage,
          messages: withMarkers([...messages, msg.content ? msg : { role: 'assistant', content: text }]),
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
      messages: withMarkers([...messages, { role: 'assistant', content: giveUpText }]),
    };
  } catch (err) {
    const text = (err && err.message) || FALLBACK_ERROR;
    return {
      text,
      applied,
      pending,
      usage,
      error: true,
      messages: withMarkers([...messages, { role: 'assistant', content: text }]),
    };
  }
}
