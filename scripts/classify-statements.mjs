#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   classify-statements — abre os extratos em BD/ e mostra o que a app JÁ sabe
   classificar e o que ainda NÃO sabe (beneficiários desconhecidos).

   Uso:
     node scripts/classify-statements.mjs            # ficheiro mais recente
     node scripts/classify-statements.mjs --all      # todos os ficheiros
     node scripts/classify-statements.mjs --csv      # grava BD/classificado.csv
     node scripts/classify-statements.mjs --json     # saída JSON (para o skill)

   NUNCA imprime números de conta nem escreve fora de BD/ (que está no
   .gitignore). Corre com a MESMA lógica que a app usa ao importar:
   applyRules (regras do utilizador não existem aqui) → guessCategory → 'out'.
   ════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { parseBankStatement, isTransferDesc, incomeSource } from '../src/lib/importBank.js';
import { guessCategory, rulePatternFor } from '../src/lib/categorize.js';
import { bdgDefault } from '../src/lib/finance.js';

const args = new Set(process.argv.slice(2));
const ALL = args.has('--all');
const CSV = args.has('--csv');
const JSON_OUT = args.has('--json');
const BD = path.resolve(process.cwd(), 'BD');

if (!fs.existsSync(BD)) {
  console.error('Pasta BD/ não existe. Coloca lá os extratos (xlsx/csv).');
  process.exit(1);
}
const files = fs
  .readdirSync(BD)
  .filter((f) => /\.(xlsx|xls|csv)$/i.test(f))
  .map((f) => ({ f, t: fs.statSync(path.join(BD, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .map((x) => x.f);
if (!files.length) {
  console.error('Sem ficheiros xlsx/csv em BD/.');
  process.exit(1);
}
const targets = ALL ? files : [files[0]];

const CAT = Object.fromEntries(bdgDefault.map((b) => [b.id, b.nm]));
const seen = new Set();
const txns = [];
for (const f of targets) {
  const wb = XLSX.read(fs.readFileSync(path.join(BD, f)), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const p = parseBankStatement(rows);
  if (!p.header) {
    console.error('Formato não reconhecido:', f);
    continue;
  }
  p.txns.forEach((t) => {
    const k = t.date + '|' + t.raw + '|' + t.amount;
    if (seen.has(k)) return; // ficheiros sobrepostos
    seen.add(k);
    txns.push({ ...t, file: f });
  });
}

// Classificação com a MESMA regra da app.
const classified = txns.map((t) => {
  const kind = t.isTransfer ? 'transfer' : t.amount > 0 ? 'income' : 'expense';
  const cat = kind === 'expense' ? guessCategory(t.desc) || guessCategory(t.raw) || 'out' : null;
  return { ...t, kind, cat, known: kind !== 'expense' || cat !== 'out', source: kind === 'income' ? incomeSource(t.raw) : null };
});

const expenses = classified.filter((x) => x.kind === 'expense');
const unknown = expenses.filter((x) => !x.known);

// Agrupa desconhecidos por padrão de comerciante.
const groups = {};
unknown.forEach((x) => {
  const pat = rulePatternFor(x.raw) || rulePatternFor(x.desc) || x.desc.toLowerCase();
  if (!groups[pat]) groups[pat] = { pattern: pat, sample: x.desc, raw: x.raw, n: 0, total: 0, dates: [] };
  groups[pat].n += 1;
  groups[pat].total += Math.abs(x.amount);
  groups[pat].dates.push(x.date);
});
const unknownList = Object.values(groups).sort((a, b) => b.total - a.total);

// Totais por categoria (conhecidas).
const byCat = {};
expenses.forEach((x) => {
  byCat[x.cat] = byCat[x.cat] || { n: 0, total: 0 };
  byCat[x.cat].n += 1;
  byCat[x.cat].total += Math.abs(x.amount);
});

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        files: targets,
        counts: {
          movements: txns.length,
          expenses: expenses.length,
          incomes: classified.filter((x) => x.kind === 'income').length,
          transfers: classified.filter((x) => x.kind === 'transfer').length,
          unknownExpenses: unknown.length,
          coveragePct: expenses.length ? Math.round(((expenses.length - unknown.length) / expenses.length) * 100) : 100,
        },
        unknown: unknownList,
        categories: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [CAT[k] || k, v])),
      },
      null,
      2
    )
  );
} else {
  console.log('Ficheiros:', targets.join(', '));
  console.log(
    'Movimentos:',
    txns.length,
    '· despesas',
    expenses.length,
    '· receitas',
    classified.filter((x) => x.kind === 'income').length,
    '· transferências próprias',
    classified.filter((x) => x.kind === 'transfer').length
  );
  const cov = expenses.length ? Math.round(((expenses.length - unknown.length) / expenses.length) * 100) : 100;
  console.log('Cobertura da classificação automática:', cov + '%', '(' + unknown.length + ' despesas sem categoria)');
  console.log('\n=== Por categoria ===');
  Object.entries(byCat)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([k, v]) => console.log('  ' + (CAT[k] || k).padEnd(20) + String(v.n).padStart(4) + 'x' + v.total.toFixed(2).padStart(11)));
  console.log('\n=== BENEFICIÁRIOS DESCONHECIDOS (a pesquisar) ===');
  if (!unknownList.length) console.log('  nenhum — tudo classificado');
  unknownList.forEach((g) => console.log('  ' + String(g.n).padStart(3) + 'x ' + g.total.toFixed(2).padStart(9) + '  padrão="' + g.pattern + '"  ex: ' + g.sample));
}

if (CSV) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = ['Data;Tipo;Descrição;Valor;Categoria;Fonte;Ficheiro'];
  classified.forEach((x) =>
    lines.push(
      [x.date, x.kind, x.desc, x.amount.toFixed(2).replace('.', ','), x.cat ? CAT[x.cat] || x.cat : '', x.source || '', x.file].map(cell).join(';')
    )
  );
  const out = path.join(BD, 'classificado.csv');
  fs.writeFileSync(out, '﻿' + lines.join('\r\n'));
  console.log('\nCSV gravado em', out, '(dentro de BD/, fora do git)');
}
