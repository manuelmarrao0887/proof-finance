/* ════════════════════════════════════════════════════════════════════════
   Probe local da API Trading 212 — SÓ LEITURA. Corre no teu computador (Node),
   não no browser (evita CORS) e não toca na app. Valida auth + endpoints +
   formato da resposta antes de construir a integração.

   USO (não partilhes a key em lado nenhum):
     T212_API_KEY=AQUI_A_TUA_KEY node scripts/t212-probe.mjs
     # ambiente (default live):
     T212_API_KEY=... T212_ENV=demo node scripts/t212-probe.mjs

   Gera a key na app Trading 212: Definições → API (Beta) → cria uma key
   READ-ONLY (só leitura). Cola só na variável de ambiente, nunca no chat.
   ════════════════════════════════════════════════════════════════════════ */

const KEY = process.env.T212_API_KEY;
const ENV = (process.env.T212_ENV || 'live').toLowerCase();
const BASE = ENV === 'demo' ? 'https://demo.trading212.com/api/v0' : 'https://live.trading212.com/api/v0';

if (!KEY) {
  console.error('Falta T212_API_KEY. Ex.: T212_API_KEY=xxxx node scripts/t212-probe.mjs');
  process.exit(1);
}

// Endpoints de leitura mais úteis. Sequencial + pausa por causa dos rate limits.
const ENDPOINTS = [
  '/equity/account/info',
  '/equity/account/cash',
  '/equity/portfolio',
  '/equity/pies',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Mascara valores sensíveis (a key) caso apareçam em mensagens de erro.
function redact(s) {
  if (!KEY) return s;
  return String(s).split(KEY).join('***KEY***');
}

async function call(path) {
  const url = BASE + path;
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { Authorization: KEY, 'Content-Type': 'application/json' },
    });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = text;
    }
    return { path, status: r.status, ok: r.ok, body };
  } catch (e) {
    return { path, status: 0, ok: false, body: 'ERRO REDE: ' + (e && e.message) };
  }
}

// Mostra só a FORMA (chaves + tipos), não os valores, para poderes colar sem
// expor montantes. Arrays mostram o 1º elemento como amostra de forma.
function shapeOf(v, depth = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? '[' + shapeOf(v[0], depth + 1) + '] (n=' + v.length + ')' : '[] (vazio)';
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    return '{ ' + keys.map((k) => k + ': ' + shapeOf(v[k], depth + 1)).join(', ') + ' }';
  }
  return typeof v;
}

(async () => {
  console.log('Trading 212 probe — ambiente:', ENV, '· base:', BASE, '\n');
  for (const ep of ENDPOINTS) {
    const res = await call(ep);
    console.log('── ' + ep + ' → HTTP ' + res.status + (res.ok ? ' OK' : ' FALHOU'));
    if (res.ok) {
      console.log('   forma: ' + redact(shapeOf(res.body)));
    } else {
      console.log('   resposta: ' + redact(typeof res.body === 'string' ? res.body : JSON.stringify(res.body)).slice(0, 300));
    }
    console.log('');
    await sleep(2500); // respeitar rate limits (beta)
  }
  console.log('Feito. Cola a saída (são só nomes de campos + tipos, sem valores).');
})();
