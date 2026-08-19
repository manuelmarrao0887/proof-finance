/* Verifica o build de produção num Chrome real: página de entrada (sem login),
   erros de consola, Firebase inicializado, métricas de carregamento. */
import puppeteer from 'puppeteer-core';
const URL = process.env.URL || 'http://localhost:5198/';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const t0 = Date.now();
await p.goto(URL, { waitUntil: 'networkidle0' });
const loadMs = Date.now() - t0;
await new Promise((r) => setTimeout(r, 1500));
const perf = await p.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  const fcp = paint.find((x) => x.name === 'first-contentful-paint');
  const res = performance.getEntriesByType('resource').filter((r) => r.name.includes('/assets/'));
  const js = res.filter((r) => r.name.endsWith('.js'));
  return {
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
    load: Math.round(nav.loadEventEnd),
    fcp: fcp ? Math.round(fcp.startTime) : null,
    jsFiles: js.length,
    jsKB: Math.round(js.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
    text: document.body.innerText.slice(0, 200).replace(/\s+/g, ' '),
    hasApp: !!document.getElementById('app') && document.getElementById('app').children.length > 0,
  };
});
await p.screenshot({ path: '/tmp/proof-shots/prod-login.png' });
await b.close();
console.log('URL:', URL);
console.log('carregou em', loadMs, 'ms · DOMContentLoaded', perf.domContentLoaded, 'ms · load', perf.load, 'ms · FCP', perf.fcp, 'ms');
console.log('JS inicial:', perf.jsFiles, 'ficheiros,', perf.jsKB, 'KB transferidos (gzip)');
console.log('app montada:', perf.hasApp, '· texto:', perf.text);
const real = errs.filter((e) => !/favicon|manifest/i.test(e));
console.log('erros de consola:', real.length ? real : 'nenhum');
process.exit(real.length ? 1 : 0);
