/* ════════════════════════════════════════════════════════════════════════
   Importador determinístico de extrato bancário (Excel/CSV) — sem IA.
   Formato validado: ActivoBank "Histórico de conta" (folha única):
     linhas de cabeçalho, depois header: Data Lanc. | Data Valor | Descrição | Valor | Saldo
     Valor: US-style (vírgula=milhares, ponto=decimal). Negativo = débito.
   `rows` = matriz (sheet_to_json header:1). Devolve transações normalizadas.
   ════════════════════════════════════════════════════════════════════════ */

// "DD/MM/YYYY" → "YYYY-MM-DD" (ou '' se não reconhecer).
export function normBankDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return '';
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// "-15.00" / "1,036.54" / "689.00" → número (negativo = débito). NaN se inválido.
export function parseBankAmount(s) {
  const v = String(s == null ? '' : s).replace(/\s/g, '').replace(/,/g, '');
  if (v === '' || !/[0-9]/.test(v)) return NaN;
  return parseFloat(v);
}

// Limpa a descrição do banco (prefixos de cartão, sufixos contactless, etc.).
export function cleanBankDesc(s) {
  let d = String(s || '').trim();
  d = d.replace(/^COMPRA\s+\d+\s+/i, ''); // "COMPRA 4174 X" → "X"
  d = d.replace(/^ELE\s+\d+\s+/i, '');
  d = d.replace(/^DD\s+/i, ''); // débito direto
  d = d.replace(/\s+(T\s+)?CONTACTLESS$/i, '');
  d = d.replace(/\s{2,}/g, ' ').trim();
  return d.slice(0, 40) || String(s || '').trim().slice(0, 40);
}

// Deteta transferências entre contas próprias / MB WAY (não são despesas de consumo).
export function isTransferDesc(s) {
  return /\bTRF\b|TRANSFER|MB\s*WAY|P\/\s*O\b/i.test(String(s || ''));
}

// Parseia a matriz do Excel. Devolve { header, txns:[{date, desc, raw, amount, isTransfer}] }.
export function parseBankStatement(rows) {
  rows = rows || [];
  let hi = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] || []).map((c) => String(c).toLowerCase());
    if (r.some((c) => c.indexOf('descri') > -1) && r.some((c) => c.indexOf('valor') > -1)) {
      hi = i;
      break;
    }
  }
  if (hi < 0) return { header: false, txns: [] };
  const hdr = (rows[hi] || []).map((c) => String(c).toLowerCase());
  const idxDate = Math.max(0, hdr.findIndex((c) => c.indexOf('data lanc') > -1));
  const idxDesc = hdr.findIndex((c) => c.indexOf('descri') > -1);
  const idxAmt = hdr.findIndex((c) => c.indexOf('valor') > -1 && c.indexOf('data') < 0);

  const txns = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawDesc = row[idxDesc];
    const amount = parseBankAmount(row[idxAmt]);
    const date = normBankDate(row[idxDate]);
    if (!rawDesc || isNaN(amount) || !date) continue;
    txns.push({ date, desc: cleanBankDesc(rawDesc), raw: String(rawDesc).trim(), amount, isTransfer: isTransferDesc(rawDesc) });
  }
  return { header: true, txns };
}

// Candidatos a DESPESA: só débitos (amount < 0), valor absoluto, marcados como
// importados (não mexem no saldo vivo). Transferências ficam marcadas para o
// utilizador poder desmarcar. `categorize(desc)` opcional → categoria.
export function bankExpenseCandidates(parsed, categorize) {
  const cat = typeof categorize === 'function' ? categorize : () => 'out';
  return (parsed.txns || [])
    .filter((t) => t.amount < 0)
    .map((t) => ({
      desc: t.desc,
      amount: Math.abs(t.amount),
      date: t.date,
      cat: cat(t.raw) || 'out',
      imported: true,
      isTransfer: t.isTransfer,
    }));
}
