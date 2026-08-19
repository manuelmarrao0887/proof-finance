/* Auditoria de acessibilidade com axe-core em todas as tabs (harness local).
   Requer vite dev na porta 5199. Reporta violações únicas por regra. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE = 'http://localhost:5199/dev.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const AXE = 'node_modules/axe-core/axe.min.js';
const TABS = ['overview', 'expenses', 'goals', 'cal', 'income', 'rec', 'charts', 'loan', 'report', 'invest', 'transfers', 'cards', 'tax'];
const MODALS = ['add', 'transfer', 'cardpay', 'stmt', 'settings', 'acct'];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
const byRule = {};
async function audit(label, url) {
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__PROOF_READY__ === true, { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.addScriptTag({ content: fs.readFileSync(AXE, 'utf8') });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  });
  res.forEach((v) => {
    const k = v.id;
    if (!byRule[k]) byRule[k] = { impact: v.impact, help: v.help, where: new Set(), nodes: new Set() };
    byRule[k].where.add(label);
    v.nodes.forEach((n) => byRule[k].nodes.add(n));
  });
  process.stdout.write(label + ': ' + res.length + ' violações\n');
}
for (const t of TABS) await audit('tab:' + t, BASE + '?tab=' + t);
for (const m of MODALS) await audit('modal:' + m, BASE + '?modal=' + m);
await audit('empty:overview', BASE + '?fixture=empty');
await browser.close();

console.log('\n=== VIOLAÇÕES POR REGRA (únicas) ===');
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
Object.entries(byRule)
  .sort((a, b) => order[a[1].impact] - order[b[1].impact])
  .forEach(([id, v]) => {
    console.log('\n[' + v.impact + '] ' + id + ' — ' + v.help);
    console.log('  onde: ' + [...v.where].slice(0, 6).join(', ') + ([...v.where].length > 6 ? ' (+' + ([...v.where].length - 6) + ')' : ''));
    console.log('  ex.: ' + [...v.nodes].slice(0, 3).join(' | '));
  });
if (!Object.keys(byRule).length) console.log('nenhuma');
