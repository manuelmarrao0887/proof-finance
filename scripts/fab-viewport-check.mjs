/* Verifica em Chrome real que o AssistantFab (botão flutuante do assistente)
   aparece DENTRO do viewport em ecrã de telemóvel — jsdom não consegue
   validar isto (não calcula layout), e foi precisamente aqui que uma
   revisão apanhou um bug crítico: o wrapper position:fixed sem top/bottom
   colapsava a altura a 0 e o browser caía no algoritmo de "static
   position", pondo o botão ~1768px abaixo do fold em vez de ancorado ao
   canto do ecrã.
   Requer: vite dev a correr (npx vite --port 5199) e Google Chrome instalado.
   Não faz parte do build — harness manual, mesmo padrão de shot.mjs/
   a11y.mjs/prodcheck.mjs/screenshots.mjs. Uso: node scripts/fab-viewport-check.mjs */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://localhost:5199/dev.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FAB_LABEL = 'Abrir assistente de IA';

// Overview é a tab de aterragem por omissão — a que o utilizador vê primeiro.
const TABS = ['overview', 'expenses', 'goals', 'groups', 'cal', 'income', 'rec', 'charts', 'loan', 'ai', 'report', 'invest', 'transfers', 'cards', 'tax'];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const problems = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  for (const tab of TABS) {
    await page.goto(BASE + '?tab=' + tab, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__PROOF_READY__ === true, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 500)); // lazy chunk + fadeUp a assentar

    const result = await page.evaluate((label) => {
      const btn = document.querySelector('button[aria-label="' + label + '"]');
      if (!btn) return { found: false };
      const r = btn.getBoundingClientRect();
      return {
        found: true,
        top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        vw: window.innerWidth, vh: window.innerHeight,
      };
    }, FAB_LABEL);

    if (!result.found) {
      problems.push(tab + ': botão do assistente não encontrado no DOM');
      continue;
    }
    const { top, bottom, left, right, vw, vh } = result;
    const inViewport = top >= 0 && left >= 0 && bottom <= vh && right <= vw;
    if (!inViewport) {
      problems.push(
        tab + ': fora do viewport — rect(top=' + Math.round(top) + ', bottom=' + Math.round(bottom) +
        ', left=' + Math.round(left) + ', right=' + Math.round(right) + ') vs viewport ' + vw + 'x' + vh
      );
    } else {
      process.stdout.write(tab + ': OK (bottom=' + Math.round(bottom) + ' de ' + vh + ')\n');
    }
  }
} finally {
  await browser.close();
}

console.log('\n=== PROBLEMAS ===');
if (!problems.length) console.log('nenhum — AssistantFab dentro do viewport em todas as tabs');
problems.forEach((p) => console.log('✗ ' + p));
process.exit(problems.length ? 1 : 0);
