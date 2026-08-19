import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
const url = process.argv[2]; const out = process.argv[3]; const scrollY = Number(process.argv[4] || 0);
await p.goto(url, { waitUntil: 'networkidle0' });
await p.waitForFunction(() => window.__PROOF_READY__ === true, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 500));
if (scrollY) { await p.evaluate((y) => window.scrollTo(0, y), scrollY); await new Promise((r) => setTimeout(r, 300)); }
await p.screenshot({ path: out });
await b.close();
