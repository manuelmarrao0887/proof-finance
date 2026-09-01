/* Verificação de ESTABILIDADE DE LAYOUT em Chrome real. jsdom não calcula
   layout, por isso nenhum teste unitário apanha estes bugs — foi assim que
   passaram despercebidos:

     1. Scroll horizontal. Varre 15 tabs x 23 modais x 4 larguras de ecrã e
        falha se algum elemento sair do viewport ou se algum contentor ganhar
        scroll horizontal. (Casos reais apanhados: o seletor de meses do
        Relatório com 456px num ecrã de 320; a grelha de categorias da Nova
        Despesa; o par de datas do Grupo.)

     2. Scroll do fundo por trás de uma sheet aberta. Com um popup aberto, a
        roda do rato sobre o backdrop fazia scroll ao conteúdo de trás
        (scrollTop 250 -> 650) e, ao fechar, a página aparecia noutro sítio.
        Ver src/lib/scrollLock.js.

     3. Reflow ao abrir uma sheet: a largura/posição do conteúdo por trás tem
        de ficar exatamente igual (nada de saltos de 8/15px da scrollbar).

   Requer: vite dev a correr (npx vite --port 5199) e Google Chrome instalado.
   Não faz parte do build — harness manual, mesmo padrão de fab-viewport-check.mjs.
   Uso: node scripts/layout-check.mjs                                        */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://localhost:5199/dev.html';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const TABS = ['overview', 'expenses', 'goals', 'groups', 'cal', 'income', 'rec', 'charts', 'loan', 'ai', 'report', 'invest', 'transfers', 'cards', 'tax'];
const MODALS = ['add', 'stmt', 'settings', 'goal', 'rec', 'income', 'cat', 'acct', 'rules', 'action', 'more', 'balanceUpdate', 'patchNotes', 'lock', 'housing', 'position', 'transfer', 'cardpay', 'group', 'person', 'gexp', 'settle', 'assistant'];
const VPS = [
  { name: '320', width: 320, height: 700, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: '390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: '768', width: 768, height: 1024, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: '1440', width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

const label = (el) =>
  el.tagName.toLowerCase() +
  (el.className ? '.' + String(el.className.baseVal ?? el.className).trim().split(/\s+/).slice(0, 3).join('.') : '');

/* Corre no browser: devolve tudo o que provoca scroll horizontal. */
const scanOverflow = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const bad = [];
  const name = (el) =>
    el.tagName.toLowerCase() +
    (el.className ? '.' + String(el.className.baseVal ?? el.className).trim().split(/\s+/).slice(0, 3).join('.') : '');
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const cs = getComputedStyle(el);
    if (r.right > vw + 1 && cs.position !== 'fixed') {
      let p = el.parentElement;
      let clipped = false;
      while (p) {
        if (getComputedStyle(p).overflowX !== 'visible') { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) bad.push(`${name(el)} sai do ecrã (right=${Math.round(r.right)} > ${vw})`);
    }
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) {
      bad.push(`${name(el)} tem scroll horizontal (${el.scrollWidth} > ${el.clientWidth})`);
    }
  });
  if (de.scrollWidth > de.clientWidth + 1) bad.unshift(`documento com scroll horizontal (${de.scrollWidth} > ${de.clientWidth})`);
  return bad.slice(0, 6);
};

/* Corre no browser: fotografia do layout de fundo + posição de scroll. */
const snapshot = () => {
  const de = document.documentElement;
  const pane = document.querySelector('.dcontent');
  const probe = document.querySelector('h1') || document.querySelector('main');
  const r = probe.getBoundingClientRect();
  return {
    probeLeft: Math.round(r.left),
    probeWidth: Math.round(r.width),
    scrollTop: pane ? Math.round(pane.scrollTop) : Math.round(window.scrollY),
    hasOverlay: !!document.querySelector('.sheet-overlay'),
  };
};

const problems = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  /* ── 1 + 2: scroll horizontal em todas as combinações ───────────────── */
  for (const vp of VPS) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    const states = [
      ...TABS.map((t) => ['tab:' + t, `${BASE}?tab=${t}`]),
      ...MODALS.map((m) => ['modal:' + m, `${BASE}?tab=overview&modal=${m}`]),
    ];
    for (const [name, url] of states) {
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__PROOF_READY__ === true, { timeout: 8000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 350));
      const bad = await page.evaluate(scanOverflow);
      bad.forEach((b) => problems.push(`[${vp.name}px ${name}] ${b}`));
    }
    process.stdout.write(`scroll horizontal @${vp.name}px: ${states.length} estados verificados\n`);
    await page.close();
  }

  /* ── 3: fundo travado e sem reflow com a sheet aberta ────────────────── */
  const OPENERS = [
    ['+ da barra inferior', 'button[aria-label="Adicionar"]'],
    ['FAB do assistente', 'button[aria-label="Abrir assistente de IA"]'],
  ];
  for (const vp of VPS) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    for (const [openerName, sel] of OPENERS) {
      await page.goto(`${BASE}?tab=overview`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__PROOF_READY__ === true, { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 450));
      await page.evaluate(() => {
        const pane = document.querySelector('.dcontent');
        if (pane) pane.scrollTop = 250; else window.scrollTo(0, 250);
      });
      await new Promise((r) => setTimeout(r, 200));
      const before = await page.evaluate(snapshot);
      const clicked = await page.evaluate((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
      if (!clicked) continue; // botão não existe neste modo (ex.: barra inferior no desktop)
      await new Promise((r) => setTimeout(r, 550));
      const after = await page.evaluate(snapshot);
      const where = `[${vp.name}px ${openerName}]`;
      if (!after.hasOverlay) { problems.push(`${where} o clique não abriu nenhuma sheet`); continue; }
      if (after.probeLeft !== before.probeLeft || after.probeWidth !== before.probeWidth) {
        problems.push(`${where} o conteúdo de trás mexeu ao abrir (left ${before.probeLeft}->${after.probeLeft}, width ${before.probeWidth}->${after.probeWidth})`);
      }
      if (after.scrollTop !== before.scrollTop) {
        problems.push(`${where} a posição de scroll saltou ao abrir (${before.scrollTop} -> ${after.scrollTop})`);
      }
      await page.mouse.move(vp.width / 2, 40);
      await page.mouse.wheel({ deltaY: 400 });
      await new Promise((r) => setTimeout(r, 400));
      const wheeled = await page.evaluate(snapshot);
      if (wheeled.scrollTop !== after.scrollTop) {
        problems.push(`${where} o fundo faz scroll por trás da sheet (${after.scrollTop} -> ${wheeled.scrollTop})`);
      } else {
        process.stdout.write(`${where} fundo travado, sem reflow: OK\n`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('\n=== PROBLEMAS ===');
if (!problems.length) console.log('nenhum — sem scroll horizontal e layout estável ao abrir sheets');
problems.forEach((p) => console.log('✗ ' + p));
process.exit(problems.length ? 1 : 0);
