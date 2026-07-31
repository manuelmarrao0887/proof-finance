/* ════════════════════════════════════════════════════════════════════════
   exportcsv — exportação das despesas/receitas para CSV (Excel PT).

   Separador `;` e decimal com vírgula: é o que o Excel em português abre
   directamente sem assistente de importação. BOM UTF-8 para os acentos.
   ════════════════════════════════════════════════════════════════════════ */

// Escapa um campo para CSV: aspas duplicadas e envolve quando necessário.
function cell(v) {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 12.5 → "12,50" (decimal PT, sempre 2 casas, sem separador de milhares).
function num(v) {
  return (Number(v) || 0).toFixed(2).replace('.', ',');
}

/* CSV das despesas. `year` opcional filtra por ano ('2026').
   Colunas: Data · Descrição · Categoria · Valor · Conta · Origem · Tags · Notas */
export function expensesToCSV(addedExp, bdg, year) {
  const catName = (id) => {
    const b = (bdg || []).find((x) => x.id === id);
    return b ? b.nm : id || '';
  };
  const rows = (addedExp || [])
    .filter((x) => !year || String(x.date || '').slice(0, 4) === String(year))
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const head = ['Data', 'Descrição', 'Categoria', 'Valor', 'Conta', 'Origem', 'Tags', 'Notas'];
  const body = rows.map((x) =>
    [
      x.date || '',
      x.desc || '',
      catName(x.cat),
      num(x.amount),
      x.acct || '',
      x.imported ? 'importada' : 'manual',
      Array.isArray(x.tags) ? x.tags.join(' ') : '',
      x.notes || '',
    ]
      .map(cell)
      .join(';')
  );
  return [head.join(';')].concat(body).join('\r\n');
}

/* CSV das receitas. Colunas: Data · Nome · Fonte · Valor · Recorrente · Conta */
export function incomesToCSV(incomes, year) {
  const rows = (incomes || [])
    .filter((i) => !year || String(i.date || '').slice(0, 4) === String(year))
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const head = ['Data', 'Nome', 'Fonte', 'Valor', 'Recorrente', 'Conta'];
  const body = rows.map((i) =>
    [i.date || '', i.name || '', i.source || '', num(i.amount), i.recurring !== false ? 'sim' : 'não', i.acct || '']
      .map(cell)
      .join(';')
  );
  return [head.join(';')].concat(body).join('\r\n');
}

// Descarrega um texto como ficheiro (BOM UTF-8 para o Excel ler os acentos).
export function downloadCSV(filename, csv) {
  if (typeof document === 'undefined') return;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
