/* Tira screenshots da app (harness local dev.html) em viewport iPhone, para
   todas as tabs e alguns modais, e regista erros de consola/página.
   Requer: vite dev a correr (npx vite --port 5199) e Google Chrome instalado.
   Saída: /tmp/proof-shots/*.png + relatório no stdout. Não faz parte do build. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5199/dev.html';
const OUT = process.env.OUT || '/tmp/proof-shots';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const TABS = ['overview', 'transactions', 'expenses', 'goals', 'cal', 'income', 'rec', 'charts', 'loan', 'report', 'invest', 'transfers', 'cards', 'tax'];
const MODALS = ['action', 'more', 'add', 'transfer', 'cardpay', 'stmt', 'settings'];
const VARIANTS = [
  { name: 'rich', q: '' },
  { name: 'empty', q: 'fixture=empty' },
  { name: 'hidden', q: 'hidden=1' },
  { name: 'dark', q: 'theme=dark' },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const problems = [];
try {
  for (const v of VARIANTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('[' + m.type() + '] ' + m.text()); });
    page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
    page.on('requestfailed', (r) => errs.push('[requestfailed] ' + r.url()));

    const tabs = v.name === 'rich' ? TABS : ['overview', 'expenses', 'cards', 'tax'];
    for (const t of tabs) {
      await page.goto(BASE + '?' + [v.q, 'tab=' + t].filter(Boolean).join('&'), { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__PROOF_READY__ === true, { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 400)); // lazy chunk + fadeUp
      // Scroll horizontal = bug de layout em mobile.
      const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (hscroll) problems.push(v.name + '/' + t + ': SCROLL HORIZONTAL (conteúdo sai do ecrã)');
      const fullH = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: OUT + '/' + v.name + '-' + t + '.png', fullPage: true });
      process.stdout.write(v.name + '/' + t + ' ✓ (' + fullH + 'px)\n');
    }
    if (v.name === 'rich') {
      for (const m of MODALS) {
        await page.goto(BASE + '?modal=' + m, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => window.__PROOF_READY__ === true, { timeout: 8000 });
        await new Promise((r) => setTimeout(r, 500));
        await page.screenshot({ path: OUT + '/modal-' + m + '.png' });
        process.stdout.write('modal/' + m + ' ✓\n');
      }
    }
    const real = errs.filter((e) => !/favicon|manifest|Download the React DevTools|firebase|Firebase|identitytoolkit|googleapis/i.test(e));
    real.forEach((e) => problems.push(v.name + ': ' + e));
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('\n=== PROBLEMAS ===');
if (!problems.length) console.log('nenhum');
problems.forEach((p) => console.log('✗ ' + p));
process.exit(problems.length ? 1 : 0);
