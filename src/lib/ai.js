/* ════════════════════════════════════════════════════════════════════════
   AI / Anthropic Messages API helpers — ported from the original
   (callAI 1973-2002, prompts 2024-2059, resizeImg/readFileB64/parseExcel
   1944-1972). Adapted to explicit args (no globals).

   Model: claude-haiku-4-5. Direct browser calls require the dangerous header
   + HTTPS (CORS fails on file://). The API key is user-supplied.
   ════════════════════════════════════════════════════════════════════════ */

import * as XLSX from 'xlsx';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

/* ── Prompt constants (orig 2024-2059, verbatim) ────────────────────────── */

export const STMT_PROMPT =
  'Analisa extracto bancario. Extrai TODAS as transacoes. Descricoes CURTAS (max 20 chars). Valores negativos para debitos, positivos para creditos. JSON: {"bank":"nome","transactions":[{"date":"DD.MM","desc":"descricao curta","amount":-0.00,"category":"rest"}]}\nCategorias: rest,sup,cas,emp,seg,ani,sau,tel,car,sub,gym,cmb,neg,laz,trf,out';

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

/* ── callAI (orig 1973-2002, adapted) ────────────────────────────────────
   content: array of Anthropic content blocks for the user message
            (e.g. [{type:'document',...}] or [{type:'text', text:'...'}, {type:'text', text:PROMPT}]).
   system:  system prompt string (defaults to JSON_SYSTEM).
   apiKey:  user-supplied x-api-key.
   onResult: callback receiving the parsed JSON object, or {error} on failure.

   NOTE: the original appended the task prompt as a text block to `content`.
   Callers should do the same (push {type:'text', text: STMT_PROMPT} etc.) so
   the model receives the instructions. */
export function callAI(content, system, apiKey, onResult) {
  const cb = typeof onResult === 'function' ? onResult : () => {};
  if (!apiKey) {
    cb({ error: 'API key nao configurada. Abre Definicoes.' });
    return;
  }
  const msgs = [{ role: 'user', content: content }];
  fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: system || JSON_SYSTEM,
      messages: msgs,
    }),
  })
    .then(function (r) {
      if (!r.ok)
        return r.text().then(function (body) {
          throw new Error('API ' + r.status + ': ' + body.substring(0, 200));
        });
      return r.json();
    })
    .then(function (d) {
      const txt = (d.content || [])
        .filter(function (i) {
          return i.type === 'text';
        })
        .map(function (i) {
          return i.text;
        })
        .join('');
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Sem JSON.');
      try {
        cb(JSON.parse(m[0]));
      } catch (pe) {
        // Try to fix truncated JSON (orig 1986-1996)
        let fix = m[0];
        const li = fix.lastIndexOf('},');
        if (li > -1) fix = fix.substring(0, li + 1);
        let ob = 0,
          oa = 0;
        for (let ci = 0; ci < fix.length; ci++) {
          if (fix[ci] === '{') ob++;
          if (fix[ci] === '}') ob--;
          if (fix[ci] === '[') oa++;
          if (fix[ci] === ']') oa--;
        }
        while (oa > 0) {
          fix += ']';
          oa--;
        }
        while (ob > 0) {
          fix += '}';
          ob--;
        }
        try {
          cb(JSON.parse(fix));
        } catch (pe2) {
          throw pe;
        }
      }
    })
    .catch(function (err) {
      let msg = err.message || 'Erro desconhecido';
      if (msg === 'Failed to fetch' || msg.indexOf('NetworkError') > -1 || msg.indexOf('CORS') > -1)
        msg = 'Erro de rede/CORS. Testa a partir de HTTPS (GitHub Pages), nao de file://.';
      cb({ error: msg });
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

/* ── buildAIContext (stub — orig 2554; to be filled in a later stage) ──────
   Will snapshot compute()/accounts/incomes/recurring/goals/bdg/addedExp/byC/
   history into a context object for the chat sysPrompt. Returns a minimal
   object for now so callers can wire it without errors. */
export function buildAIContext(state) {
  return {
    todo: 'buildAIContext not yet implemented (map §10).',
    hasState: !!state,
  };
}
