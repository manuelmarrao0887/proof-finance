/* ════════════════════════════════════════════════════════════════════════
   AI helpers — ported from the original (callAI 1973-2002, prompts
   2024-2059, resizeImg/readFileB64/parseExcel 1944-1972). Adapted to
   explicit args (no globals).

   Transporte: /api/ai (proxy OpenRouter, formato OpenAI). O cliente nunca
   escolhe o modelo, só um tier ('fast'|'strong'); o servidor resolve-o e
   guarda a key. Ver o bloco de transporte mais abaixo.
   ════════════════════════════════════════════════════════════════════════ */

import * as XLSX from 'xlsx';
import { getIdToken } from '../firebase/client.js';
import { compute } from './finance.js';
import { monthEffectiveLimits } from './budget.js';
import { todayISO } from './format.js';

/* ── Prompt constants (orig 2024-2059, verbatim) ────────────────────────── */

export const STMT_PROMPT =
  'Analisa o extrato bancario. Extrai TODAS as transacoes (movimentos).\n' +
  'DATAS (MUITO IMPORTANTE): muitos extratos (ex: ActivoBank) mostram a data como "M.DD" ou "MM.DD" — o MES vem PRIMEIRO e depois o DIA. Ex: "5.06" = dia 06 do mes 05 (6 de Maio), "5.29" = 29 de Maio. Usa o cabecalho/periodo do extrato (ex: "EXTRATO DE 2026/05/04 A 2026/05/29") para saberes o ANO e confirmar o MES. ' +
  'Se houver duas colunas de data por linha (data movimento e data valor), usa a PRIMEIRA. ' +
  'Devolve SEMPRE a data no formato ISO "YYYY-MM-DD".\n' +
  'Descricoes CURTAS (max 24 chars). Valores: negativos para debitos, positivos para creditos.\n' +
  'JSON: {"bank":"nome","transactions":[{"date":"YYYY-MM-DD","desc":"descricao curta","amount":-0.00,"category":"rest"}]}\n' +
  'Categorias: rest,sup,cas,emp,seg,ani,sau,tel,car,sub,gym,cmb,neg,laz,trf,out';

export const RCPT_PROMPT =
  'Analisa este recibo/fatura. Extrai itens e valores. JSON: {"items":[{"desc":"nome","amount":0.00}],"total":0.00,"suggested_category":"rest"}\nCategorias: rest,sup,cas,emp,seg,ani,sau,tel,car,sub,gym,cmb,neg,laz,trf,out\nSe nao for recibo: {"error":"Nao e um recibo."}';

export const AI_IMPORT_PROMPT =
  'Analisa o documento financeiro e extrai informacao para popular a app. Retorna APENAS JSON puro (sem markdown, sem backticks):\n\n' +
  '{"docType":"...","summary":"...","actions":[...]}\n\n' +
  'docType: extrato_bancario | recibo | recibo_vencimento | contrato_credito | extrato_investimento | factura | outro\n' +
  'summary: 1-2 frases (PT) descrevendo o documento\n\n' +
  'ACOES DISPONIVEIS:\n\n' +
  '1) Atualizar saldo de conta:\n' +
  '{"type":"update_balance","account_bank":"Bankinter","account_type":"Conta a Ordem","value":584.64,"note":""}\n' +
  '   account_bank: Bankinter | Activobank | Moey | Trade Republic | XTB | Goparity | Raize\n' +
  '   account_type: Conta a Ordem | Poupanca | Corretagem | Private Markets | Rend. Fixo | Transacoes | Planos Invest. | P2P Lending\n' +
  '   Para Bankinter: dividir saldo total por 2 (conta partilhada) e por o total na note\n\n' +
  '2) Adicionar despesa:\n' +
  '{"type":"add_expense","desc":"Pingo Doce","amount":45.67,"cat":"sup","date":"YYYY-MM-DD"}\n' +
  '   amount sempre POSITIVO. cat: rest,sup,cas,emp,seg,ani,sau,tel,car,sub,gym,cmb,neg,laz,trf,out\n\n' +
  '3) Adicionar meta de poupanca:\n' +
  '{"type":"add_goal","name":"Fundo Emergencia","target":10000,"current":0,"deadline":"YYYY-MM-DD","color":"#0b1220"}\n\n' +
  '4) Adicionar subscricao recorrente:\n' +
  '{"type":"add_recurring","name":"Netflix","amount":9.99,"cat":"sub","day":1}\n\n' +
  '5) Adicionar receita/rendimento:\n' +
  '{"type":"add_income","name":"Salario","amount":1500,"source":"salary","recurring":true,"day":25}\n' +
  '   source: salary | freelance | dividend | rental | bonus | other\n' +
  '   Se recurring=false, em vez de "day" usar "date":"YYYY-MM-DD"\n\n' +
  '6) Snapshot patrimonial:\n' +
  '{"type":"snapshot","label":"DD.MM","liq":0,"poup":0,"inv":0,"div":77555.06,"xP":0,"xT":0,"tC":0}\n\n' +
  'REGRAS:\n' +
  '- Extrato com transacoes -> gerar add_expense para cada DEBITO (ignorar creditos a nao ser que sejam reembolsos)\n' +
  '- Ignorar transferencias para contas proprias (TRF Bankinter, etc.)\n' +
  '- Extrato com saldo final claro -> gerar update_balance\n' +
  '- Recibo simples (compra unica) -> 1 add_expense\n' +
  '- Contrato de credito -> apenas summary (nao temos accao especifica)\n' +
  '- Recibo de vencimento -> gerar add_income (recurring=true) com o valor liquido e source=salary\n' +
  '- Datas YYYY-MM-DD; se ano nao explicito assume ' +
  new Date().getFullYear() +
  '\n' +
  '- Maximo 60 acoes por documento\n' +
  '- Categoriza com base nas descricoes (ex: "PINGO DOCE"->sup, "MCDONALDS"->rest, "FIDELIDADE"->seg, "GALP"->cmb)\n' +
  '- Se nao reconheceres NADA: {"docType":"outro","summary":"Documento nao reconhecido","actions":[]}';

// Default system prompt the original used (orig 1979).
export const JSON_SYSTEM = 'Responde APENAS JSON puro. Sem markdown, sem backticks.';

/* ── Transporte (OpenRouter, formato OpenAI) ───────────────────────────────
   O proxy /api/ai resolve o modelo a partir do tier; o cliente nunca envia um
   id de modelo. A tradução de conteúdo vive aqui para que os chamadores
   antigos (import de extrato, atualizar saldo) continuem a montar blocos no
   formato Anthropic sem saberem que o provider mudou. */

const DOC_MODELS = new Set(['claude-sonnet-5', 'claude-opus-5', 'strong']);

export function TIER_FOR_MODEL(model) {
  return DOC_MODELS.has(model) ? 'strong' : 'fast';
}

function dataUri(source) {
  const mt = (source && source.media_type) || 'application/octet-stream';
  const data = (source && source.data) || '';
  return 'data:' + mt + ';base64,' + data;
}

export function toOpenAIContent(parts) {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return String(parts == null ? '' : parts);
  return parts.map(function (p) {
    if (!p || typeof p !== 'object') return { type: 'text', text: String(p == null ? '' : p) };
    if (p.type === 'image') return { type: 'image_url', image_url: { url: dataUri(p.source) } };
    if (p.type === 'document')
      return { type: 'file', file: { filename: p.filename || 'documento.pdf', file_data: dataUri(p.source) } };
    return { type: 'text', text: p.text || '' };
  });
}

const ERRORS = {
  401: 'Precisas de iniciar sessao para usar a IA.',
  403: 'Sem acesso ao assistente.',
  402: 'Sem creditos no OpenRouter.',
  413: 'Documento demasiado grande para a IA.',
  429: 'Demasiados pedidos. Tenta daqui a pouco.',
  503: 'Modelo indisponivel de momento.',
};

export function chat(messages, opts) {
  const o = opts || {};
  return getIdToken()
    .then(function (token) {
      if (!token) throw new Error('Precisas de iniciar sessao para usar a IA.');
      return fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          messages: messages,
          tools: o.tools && o.tools.length ? o.tools : undefined,
          tier: o.tier || 'fast',
          max_tokens: o.maxTokens || 4000,
        }),
      }).then(function (r) {
        if (r.ok) return r.json();
        return r.json().then(
          function (b) {
            // O proxy distingue as duas origens do erro no proprio corpo:
            //   - reencaminhado do upstream (OpenRouter): { error, status: <numero> }
            //     -> mapeia-se pela tabela ERRORS, como sempre.
            //   - levantado pelo proprio proxy: { error } sem `status`, já uma
            //     mensagem PT-PT pronta para o utilizador (nunca leva detalhe
            //     interno) -> mostra-se tal e qual, sem adivinhar pelo código HTTP.
            if (b && typeof b.status === 'number') {
              throw new Error(ERRORS[b.status] || ERRORS[r.status] || 'Falha no assistente.');
            }
            if (b && typeof b.error === 'string' && b.error) {
              throw new Error(b.error);
            }
            throw new Error(ERRORS[r.status] || 'Falha no assistente.');
          },
          function () {
            throw new Error(ERRORS[r.status] || 'Falha no assistente.');
          }
        );
      });
    })
    .catch(function (err) {
      // getIdToken() rejeitou (renovação do token falhou) — diferente de
      // "ninguém tem sessão iniciada": ha sessao, so nao foi possivel
      // confirma-la agora. Conselho diferente: reabrir a app / verificar
      // ligação, em vez de iniciar sessão.
      if (err && err.tokenRefreshFailed) {
        throw new Error('Nao foi possivel renovar a sessao. Verifica a ligacao ou reabre a app.');
      }
      const msg = err && err.message ? err.message : 'Erro desconhecido';
      if (msg === 'Failed to fetch' || msg.indexOf('NetworkError') > -1)
        throw new Error('Erro de rede ao contactar a IA. Tenta novamente.');
      throw err;
    });
}

function firstText(res) {
  const c = res && res.choices && res.choices[0];
  const m = c && c.message;
  if (!m) return '';
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.content))
    return m.content.map(function (b) { return b && b.text ? b.text : ''; }).join('');
  return '';
}

/* callAIRaw — mantém a assinatura e a FORMA de resposta antigas
   ({content:[{type:'text',text}]}) para os chamadores existentes não mudarem.
   Por dentro já é OpenRouter. */
export function callAIRaw(content, system, model, maxTokens) {
  const messages = [
    { role: 'system', content: system || JSON_SYSTEM },
    { role: 'user', content: toOpenAIContent(content) },
  ];
  return chat(messages, { tier: TIER_FOR_MODEL(model), maxTokens: maxTokens || 4000 }).then(function (res) {
    return { content: [{ type: 'text', text: firstText(res) }], usage: res.usage || null };
  });
}

export function callAI(content, system, _apiKey, onResult) {
  const cb = typeof onResult === 'function' ? onResult : function () {};
  // callAI usa 'strong' porque os seus chamadores são sempre documentos
  // (extrato bancário, recibo, print de saldo).
  callAIRaw(content, system, 'strong', 16000)
    .then(function (d) {
      const txt = (d.content || []).map(function (i) { return i.text; }).join('');
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Sem JSON.');
      try {
        cb(JSON.parse(m[0]));
      } catch (pe) {
        // Tentar reparar JSON truncado (comportamento original).
        let fix = m[0];
        const li = fix.lastIndexOf('},');
        if (li > -1) fix = fix.substring(0, li + 1);
        let ob = 0, oa = 0;
        for (let ci = 0; ci < fix.length; ci++) {
          if (fix[ci] === '{') ob++;
          if (fix[ci] === '}') ob--;
          if (fix[ci] === '[') oa++;
          if (fix[ci] === ']') oa--;
        }
        while (oa > 0) { fix += ']'; oa--; }
        while (ob > 0) { fix += '}'; ob--; }
        try {
          cb(JSON.parse(fix));
        } catch (pe2) {
          throw pe;
        }
      }
    })
    .catch(function (err) {
      cb({ error: (err && err.message) || 'Erro desconhecido' });
    });
}

/* ── File helpers (orig 1944-1972, verbatim) ─────────────────────────────── */

export function resizeImg(file, maxW) {
  maxW = maxW || 1024;
  return new Promise(function (resolve) {
    const img = new Image(),
      cnv = document.createElement('canvas'),
      rd = new FileReader();
    rd.onload = function (ev) {
      img.onload = function () {
        let w = img.width,
          h = img.height;
        if (w > maxW) {
          h = (h * maxW) / w;
          w = maxW;
        }
        cnv.width = w;
        cnv.height = h;
        cnv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cnv.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.src = ev.target.result;
    };
    rd.readAsDataURL(file);
  });
}

export function readFileB64(file) {
  return new Promise(function (resolve) {
    const rd = new FileReader();
    rd.onload = function (ev) {
      resolve(ev.target.result.split(',')[1]);
    };
    rd.readAsDataURL(file);
  });
}

export function parseExcel(file) {
  return new Promise(function (resolve) {
    const rd = new FileReader();
    rd.onload = function (ev) {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        resolve(csv);
      } catch (e) {
        resolve(null);
      }
    };
    rd.readAsArrayBuffer(file);
  });
}

// Lê a 1ª folha como matriz (array de arrays) para parsing determinístico.
export function readExcelRows(file) {
  return new Promise(function (resolve) {
    const rd = new FileReader();
    rd.onload = function (ev) {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }));
      } catch (e) {
        resolve(null);
      }
    };
    rd.readAsArrayBuffer(file);
  });
}

/* buildAIContext (orig 2554) — retrato COMPACTO do estado para o system
   prompt. Só agregados, contagens e nomes (com os respetivos ids); as
   listas (despesas, movimentos de grupo) vêm das tools de leitura
   (aiTools.js), a pedido do modelo. É isto que mantém o custo por
   mensagem nos milésimos de euro em vez de embutir tudo no prompt. */
export function buildAIContext(state) {
  const s = state || {};
  const today = todayISO();
  const month = today.slice(0, 7);
  let c = { tA: 0, nW: 0, cardDebt: 0, loan: { out: 0 }, accts: [] };
  try {
    c = compute(s);
  } catch (e) {
    // Estado incompleto (ex: utilizador novo sem dados ainda) — seguimos com zeros.
  }
  const lim = monthEffectiveLimits(s.addedExp || [], s.bdg || [], month, !!s.rolloverOn);
  return {
    today,
    month,
    netWorth: c.nW || 0,
    totalAssets: c.tA || 0,
    cardDebt: c.cardDebt || 0,
    loanOutstanding: (c.loan && c.loan.out) || 0,
    // Nome = "banco · tipo", a mesma convenção do get_overview (aiTools.js):
    // a.n é uma nota opcional, não a identidade da conta.
    accounts: (c.accts || []).map((a) => ({ name: a.b + ' · ' + a.t, value: a.v })),
    budget: (s.bdg || []).map((b) => ({
      id: b.id,
      nm: b.nm,
      lm: b.lm,
      spent: lim[b.id] ? lim[b.id].spent : 0,
    })),
    counts: {
      expenses: (s.addedExp || []).length,
      incomes: (s.incomes || []).length,
      goals: (s.goals || []).length,
      recurring: (s.recurring || []).length,
      groupEntries: (s.groupEntries || []).length,
    },
    groups: (s.groups || []).map((g) => ({ id: g.id, name: g.name })),
    people: (s.people || []).map((p) => ({ id: p.id, name: p.name })),
  };
}
