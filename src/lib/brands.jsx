/* ════════════════════════════════════════════════════════════════════════
   brands — pack LOCAL de marcas (comerciantes PT, bancos, redes de cartão,
   ativos) + resolução de marca a partir de uma descrição de extrato.

   Cada marca é um SVG simplificado (letra/forma + cor da marca), embebido no
   bundle. Nenhum pedido externo: nenhuma transação sai do dispositivo para
   ir buscar um logo. `node` pode ser trocado por um SVG oficial mais tarde
   sem mudar a API.

   resolveBrand("COMPRA 4174 PINGO DOCE LISBOA") → 'pingodoce'
   resolveBrand("Padaria Central")               → null
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

const F = "'Plus Jakarta Sans', system-ui, sans-serif";
// Letra(s) centradas no viewBox 24×24, na cor `fg` da marca.
const T = (txt, size = 9, weight = 800, extra = {}) => (
  <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={weight} fontFamily={F} fill="currentColor" style={extra}>
    {txt}
  </text>
);

export const BRANDS = {
  // ── comerciantes ──
  netflix: { name: 'Netflix', group: 'merchant', bg: '#141414', fg: '#E50914', node: T('N', 15, 900), match: ['netflix'] },
  spotify: { name: 'Spotify', group: 'merchant', bg: '#1DB954', fg: '#fff', match: ['spotify'], node: (
    <g fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
      <path d="M6.2 9.6c4-1.2 8.6-.9 12 1.1" /><path d="M7.2 13c3.3-1 7-.7 10 .9" /><path d="M8.2 16.3c2.5-.7 5.3-.5 7.6.7" />
    </g>) },
  ikea: { name: 'IKEA', group: 'merchant', bg: '#0058A3', fg: '#FFDA1A', node: T('IKEA', 7.2, 900), match: ['ikea'] },
  pingodoce: { name: 'Pingo Doce', group: 'merchant', bg: '#00953B', fg: '#fff', node: T('PD', 9.5, 800), match: ['pingo doce', 'pingodoce'] },
  continente: { name: 'Continente', group: 'merchant', bg: '#E4002B', fg: '#fff', node: T('C', 14, 900), match: ['continente', 'modelo continente'] },
  lidl: { name: 'Lidl', group: 'merchant', bg: '#0050AA', fg: '#0050AA', match: ['lidl'], node: (<><circle cx="12" cy="12" r="8" fill="#FFF000" stroke="#E60A14" strokeWidth="1.6" />{T('L', 11, 900)}</>) },
  auchan: { name: 'Auchan', group: 'merchant', bg: '#E30613', fg: '#fff', node: T('A', 14, 900), match: ['auchan', 'jumbo'] },
  uber: { name: 'Uber', group: 'merchant', bg: '#000', fg: '#fff', node: T('Uber', 7.6, 700), match: ['uber', 'uber trip'] },
  ubereats: { name: 'Uber Eats', group: 'merchant', bg: '#06C167', fg: '#fff', node: T('UE', 9.5, 900), match: ['uber eats', 'ubereats'] },
  bolt: { name: 'Bolt', group: 'merchant', bg: '#34D186', fg: '#fff', node: T('B', 14, 900), match: ['bolt'] },
  glovo: { name: 'Glovo', group: 'merchant', bg: '#FFC244', fg: '#111', node: T('G', 14, 900), match: ['glovo'] },
  galp: { name: 'Galp', group: 'merchant', bg: '#F26522', fg: '#fff', node: T('G', 14, 900), match: ['galp'] },
  bp: { name: 'BP', group: 'merchant', bg: '#009900', fg: '#FFE600', node: T('bp', 10, 900), match: ['bp'] },
  edp: { name: 'EDP', group: 'merchant', bg: '#E30046', fg: '#fff', node: T('edp', 8.4, 800), match: ['edp'] },
  meo: { name: 'MEO', group: 'merchant', bg: '#0093D0', fg: '#fff', node: T('meo', 8.4, 800), match: ['meo', 'altice'] },
  nos: { name: 'NOS', group: 'merchant', bg: '#111', fg: '#fff', node: T('NOS', 7.8, 900), match: ['nos'] },
  vodafone: { name: 'Vodafone', group: 'merchant', bg: '#E60000', fg: '#fff', match: ['vodafone'], node: (
    <><circle cx="12" cy="12" r="8" fill="#fff" /><path d="M13.6 7.4c-2.7.6-4.4 2.5-4.4 4.9 0 2.2 1.5 3.8 3.5 3.8 1.7 0 3.1-1.3 3.1-3.1 0-1.4-.9-2.4-2.3-2.7 0-1.1.8-2.1 2.1-2.5z" fill="#E60000" /></>) },
  amazon: { name: 'Amazon', group: 'merchant', bg: '#232F3E', fg: '#fff', match: ['amazon', 'amzn', 'amazon prime'], node: (<>{T('a', 13, 800)}<path d="M6.5 17c3.5 2.1 8 2.1 11 0" fill="none" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" /></>) },
  apple: { name: 'Apple', group: 'asset', bg: '#000', fg: '#fff', match: ['apple', 'itunes', 'app store'], node: (
    <><path d="M15.6 12.5c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6.1 1 8.1.7 1 1.5 2.1 2.5 2 1 0 1.4-.6 2.6-.6s1.6.6 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.2z" fill="currentColor" /><path d="M13.5 6.6c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1z" fill="currentColor" /></>) },
  google: { name: 'Google', group: 'asset', bg: '#fff', fg: '#4285F4', node: T('G', 14, 900), match: ['google', 'youtube', 'google play'] },
  microsoft: { name: 'Microsoft', group: 'asset', bg: '#fff', fg: '#000', match: ['microsoft', 'xbox'], node: (
    <><rect x="5" y="5" width="6.4" height="6.4" fill="#F25022" /><rect x="12.6" y="5" width="6.4" height="6.4" fill="#7FBA00" /><rect x="5" y="12.6" width="6.4" height="6.4" fill="#00A4EF" /><rect x="12.6" y="12.6" width="6.4" height="6.4" fill="#FFB900" /></>) },
  zara: { name: 'Zara', group: 'merchant', bg: '#000', fg: '#fff', node: T('ZARA', 6.4, 700, { fontFamily: 'Georgia, serif', letterSpacing: 0.4 }), match: ['zara'] },
  worten: { name: 'Worten', group: 'merchant', bg: '#E30613', fg: '#fff', node: T('W', 14, 900), match: ['worten'] },
  fnac: { name: 'FNAC', group: 'merchant', bg: '#F5B800', fg: '#111', node: T('fnac', 7.6, 900), match: ['fnac'] },
  decathlon: { name: 'Decathlon', group: 'merchant', bg: '#0082C3', fg: '#fff', node: T('D', 14, 900), match: ['decathlon'] },
  fitnesshut: { name: 'Fitness Hut', group: 'merchant', bg: '#C8FF00', fg: '#111', node: T('FH', 9.5, 900), match: ['fitness hut', 'fitnesshut'] },
  // ── bancos e corretoras ──
  activobank: { name: 'ActivoBank', group: 'bank', bg: '#0B3D91', fg: '#fff', node: T('A', 14, 900), match: ['activobank', 'activo bank'] },
  millennium: { name: 'Millennium bcp', group: 'bank', bg: '#D0006F', fg: '#fff', node: T('M', 14, 900), match: ['millennium', 'millennium bcp', 'bcp'] },
  cgd: { name: 'CGD', group: 'bank', bg: '#0067B1', fg: '#fff', node: T('CGD', 7.4, 900), match: ['cgd', 'caixa geral'] },
  santander: { name: 'Santander', group: 'bank', bg: '#EC0000', fg: '#fff', node: T('S', 14, 900), match: ['santander'] },
  bpi: { name: 'BPI', group: 'bank', bg: '#FF7B00', fg: '#fff', node: T('BPI', 7.8, 900), match: ['bpi'] },
  novobanco: { name: 'Novo Banco', group: 'bank', bg: '#00A89C', fg: '#fff', node: T('NB', 9.5, 900), match: ['novo banco', 'novobanco'] },
  bankinter: { name: 'Bankinter', group: 'bank', bg: '#FF6600', fg: '#fff', node: T('B', 14, 900), match: ['bankinter'] },
  montepio: { name: 'Montepio', group: 'bank', bg: '#2B6C3F', fg: '#fff', node: T('M', 14, 900), match: ['montepio'] },
  revolut: { name: 'Revolut', group: 'bank', bg: '#000', fg: '#fff', node: T('R', 14, 900), match: ['revolut'] },
  wise: { name: 'Wise', group: 'bank', bg: '#9FE870', fg: '#163300', node: T('W', 13, 900), match: ['wise', 'transferwise'] },
  n26: { name: 'N26', group: 'bank', bg: '#36A18B', fg: '#fff', node: T('N26', 8, 900), match: ['n26'] },
  traderepublic: { name: 'Trade Republic', group: 'bank', bg: '#111', fg: '#fff', node: T('TR', 9.5, 800), match: ['trade republic', 'traderepublic'] },
  xtb: { name: 'XTB', group: 'bank', bg: '#D5232B', fg: '#fff', node: T('xtb', 8.4, 900), match: ['xtb'] },
  degiro: { name: 'DEGIRO', group: 'bank', bg: '#009DE0', fg: '#fff', node: T('D', 14, 900), match: ['degiro'] },
  t212: { name: 'Trading 212', group: 'bank', bg: '#00A3E0', fg: '#fff', node: T('212', 7.8, 900), match: ['trading 212', 'trading212', 't212'] },
  // ── redes de cartão ──
  mastercard: { name: 'Mastercard', group: 'network', bg: 'transparent', fg: '#fff', match: ['mastercard'], node: (<><circle cx="9" cy="12" r="6.6" fill="#EB001B" /><circle cx="15" cy="12" r="6.6" fill="#F79E1B" fillOpacity="0.92" /></>) },
  visa: { name: 'Visa', group: 'network', bg: '#1A1F71', fg: '#fff', node: T('VISA', 7.2, 900, { fontStyle: 'italic' }), match: ['visa'] },
  // ── ativos ──
  vanguard: { name: 'Vanguard', group: 'asset', bg: '#96151D', fg: '#fff', node: T('V', 14, 900), match: ['vanguard'] },
  ishares: { name: 'iShares', group: 'asset', bg: '#000', fg: '#fff', node: T('iS', 10, 800), match: ['ishares'] },
  tesla: { name: 'Tesla', group: 'asset', bg: '#CC0000', fg: '#fff', node: T('T', 15, 900), match: ['tesla'] },
  nvidia: { name: 'Nvidia', group: 'asset', bg: '#76B900', fg: '#fff', node: T('N', 15, 900), match: ['nvidia'] },
};

// Tickers → marca. O resto cai para resolveBrand(ticker) (ex.: "Apple").
export const ASSET_BRANDS = {
  VWCE: 'vanguard', VWRL: 'vanguard', VUAA: 'vanguard', VUSA: 'vanguard', VOO: 'vanguard', VTI: 'vanguard',
  IWDA: 'ishares', SWDA: 'ishares', EIMI: 'ishares', CSPX: 'ishares',
  AAPL: 'apple', MSFT: 'microsoft', GOOGL: 'google', GOOG: 'google', AMZN: 'amazon', TSLA: 'tesla', NVDA: 'nvidia', NFLX: 'netflix',
};

// Palavras que aparecem em descrições de extrato e não identificam a marca.
const NOISE = new Set([
  'compra', 'compras', 'pagamento', 'pag', 'pgto', 'servicos', 'servico', 'lda', 'sa', 'unip', 'unipessoal',
  'lisboa', 'porto', 'amadora', 'sintra', 'cascais', 'braga', 'coimbra', 'faro', 'setubal', 'pt', 'portugal',
  'com', 'www', 'net', 'online', 'debito', 'credito', 'cartao', 'mb', 'way', 'mbway', 'ref', 'transf', 'transferencia',
  'conta', 'a', 'ordem', 'poupanca', 'corretagem', 'de', 'do', 'da', 'e', 'o', 'the',
]);

export function normalizeMerchant(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    // descarta tokens vazios, ruído e números de referência tipo extrato
    // (4+ dígitos seguidos, ex.: "4174"), mas mantém dígitos curtos que
    // fazem parte do nome da marca (ex.: "212" em "Trading 212") e
    // tokens alfanuméricos como "n26" e "t212".
    .filter((w) => w && !NOISE.has(w) && !/^\d{4,}$/.test(w))
    .join(' ')
    .trim();
}

// Alias mais longo ganha (ex.: "uber eats" antes de "uber").
export function resolveBrand(text) {
  const n = normalizeMerchant(text);
  if (!n) return null;
  const padded = ' ' + n + ' ';
  let best = null;
  Object.keys(BRANDS).forEach((id) => {
    BRANDS[id].match.forEach((alias) => {
      if (padded.indexOf(' ' + alias + ' ') > -1 && (!best || alias.length > best.len)) best = { id, len: alias.length };
    });
  });
  return best ? best.id : null;
}

export function resolveAsset(ticker) {
  const k = String(ticker || '').toUpperCase().trim();
  return ASSET_BRANDS[k] || resolveBrand(ticker);
}

// Tom estável por nome, para a inicial colorida de quem não tem marca.
export function hashHue(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
