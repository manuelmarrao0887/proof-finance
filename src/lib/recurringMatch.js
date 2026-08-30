/* ════════════════════════════════════════════════════════════════════════
   Ligação import → recorrentes.

   O modelo já tem o campo: uma despesa que MATERIALIZA uma recorrente carrega
   `recId`. Quem lê esse campo:
     - finance.js monthlySummary  → deixa de somar a recorrente nesse mês
       (senão o mesmo débito conta duas vezes: uma na lista, outra na projeção)
     - lib/reminders.js, lib/pulse.js → não lembram o que já foi pago
     - RecurringView / ExpensesView → mostram a recorrente como "já lançada"

   Até aqui só o AddExpenseSheet ("Registar recorrente") preenchia `recId`. O
   import de extrato — que é por onde entram quase todas as despesas — nunca o
   preenchia, portanto TODA a recorrente importada (Vodafone, MGEN, Cartrack,
   Medis...) ficava a contar a dobrar e eternamente "por lançar".

   Estratégia de match, deliberadamente conservadora — um falso positivo aqui
   apaga silenciosamente uma despesa da projeção, o que é pior do que não ligar:
     1. NOME obrigatório. O nome da recorrente tem de aparecer no descritivo do
        banco com fronteira de palavra (não basta ser substring — "MOTV" contém
        "tv"). Testa-se contra o descritivo limpo e contra o bruto, porque o
        cleanBankDesc corta prefixos que às vezes levam o nome ("DD MGEN ...").
     2. VALOR dentro de tolerância. Só o nome não chega: "VODAFONE LOJA 299€"
        é a compra de um telemóvel, não a mensalidade.
     3. Uma materialização por recorrente e por mês (tagRecurringMatches) — uma
        recorrente mensal só pode ser paga uma vez no mês.
   ════════════════════════════════════════════════════════════════════════ */

// Uma conta de telemóvel/luz varia mês a mês; 30% relativo apanha isso sem
// apanhar uma compra pontual no mesmo comerciante. O piso absoluto de 2€ existe
// para as recorrentes pequenas (Medis 10,90 → 12,40 são 14%, mas iCloud 0,99 →
// 2,99 seriam 200% e não é a mesma coisa).
export const REL_TOLERANCE = 0.3;
export const ABS_TOLERANCE = 2;

// Minúsculas, sem acentos, tudo o que não é alfanumérico vira espaço.
// "Ginásio" → "ginasio"; "monday.com" → "monday com"; assim o descritivo do
// banco e o nome escrito à mão convergem.
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nome presente no descritivo com fronteira de palavra em ambos os lados.
export function nameHits(recName, ...descs) {
  const n = norm(recName);
  // 1 caracter é ruído garantido; a partir de 2 a fronteira de palavra + o
  // gate de valor seguram o falso positivo (uma recorrente chamada "TV" liga a
  // "TV CABO PORTUGAL" mas não a "MOTV MOTORES").
  if (n.length < 2) return false;
  const re = new RegExp('(?:^|[^a-z0-9])' + escapeRe(n) + '(?:$|[^a-z0-9])');
  return descs.some((d) => re.test(norm(d)));
}

export function amountFits(recAmount, txnAmount) {
  const a = Math.abs(Number(recAmount) || 0);
  const b = Math.abs(Number(txnAmount) || 0);
  if (a <= 0 || b <= 0) return false;
  const diff = Math.abs(a - b);
  return diff <= ABS_TOLERANCE || diff / a <= REL_TOLERANCE;
}

// É débito? Com _type (vem do preview do import) manda o _type; sem ele, o
// sinal do valor (convenção do extrato: negativo = débito).
function isDebit(txn) {
  if (txn._type) return txn._type === 'expense';
  return Number(txn.amount) < 0;
}

/* Melhor recorrente para uma transação, ou null. Devolve também o desvio de
   valor para o desempate por mês em tagRecurringMatches. */
export function bestRecurringMatch(recurringList, txn) {
  if (!Array.isArray(recurringList) || !recurringList.length || !txn) return null;
  if (!isDebit(txn)) return null;
  const amt = Math.abs(Number(txn.amount) || 0);
  if (!amt) return null;

  let best = null;
  recurringList.forEach((r) => {
    if (!r || !r.id) return;
    if (!nameHits(r.name, txn.desc, txn.raw)) return;
    if (!amountFits(r.amount, amt)) return;
    const delta = Math.abs((Math.abs(Number(r.amount) || 0)) - amt);
    const nameLen = norm(r.name).length;
    // Menor desvio de valor ganha; empate → nome mais específico (mais longo).
    if (!best || delta < best.delta || (delta === best.delta && nameLen > best.nameLen)) {
      best = { id: r.id, delta, nameLen };
    }
  });
  return best;
}

export function matchRecurring(recurringList, txn) {
  const m = bestRecurringMatch(recurringList, txn);
  return m ? m.id : null;
}

/* Marca `_recId` em cada linha do preview do import. Não muta a lista.
   Uma recorrente mensal só materializa UMA vez por mês: se duas linhas do mesmo
   mês baterem certo com a mesma recorrente, fica ligada a de valor mais próximo
   e a outra entra como despesa normal. */
export function tagRecurringMatches(list, recurringList) {
  if (!Array.isArray(list)) return [];
  const winners = {}; // recId|YYYY-MM → { idx, delta }
  const cand = list.map((t, i) => {
    const m = t ? bestRecurringMatch(recurringList, t) : null;
    if (!m) return null;
    const key = m.id + '|' + String((t && t.date) || '').slice(0, 7);
    const cur = winners[key];
    if (!cur || m.delta < cur.delta) winners[key] = { idx: i, delta: m.delta };
    return { key, id: m.id };
  });
  return list.map((t, i) => {
    const c = cand[i];
    const keep = c && winners[c.key] && winners[c.key].idx === i;
    return { ...t, _recId: keep ? c.id : null };
  });
}
