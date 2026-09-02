# Menos texto, mais cara — logos, avatares e ícones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar identidade visual às listas da app (logos de comerciantes e bancos, avatares, ícones por meta e categoria, cartão de crédito como objeto) e cortar texto redundante, sem dependências novas nem pedidos externos.

**Architecture:** Um pack local de marcas em `src/lib/brands.jsx` (SVG simplificado por marca + aliases) alimenta um componente único `MerchantLogo` que cai para `CategoryIcon` e depois para uma inicial colorida. Campos opcionais novos (`last4`, `network` em cartões; `icon` em metas; `icon`/`color` em categorias) vivem nos itens já persistidos e não precisam de migração. As views trocam texto por `MerchantLogo`/`BankLogo`/`Avatar`/`StatTiles`.

**Tech Stack:** React 18 + Vite, Vitest + Testing Library (jsdom), Firebase Firestore (subcoleções, schema v2), CSS em `src/styles/tokens.css`, ícones SVG inline em `src/components/Icon.jsx`.

**Spec:** `docs/superpowers/specs/2026-09-02-visual-logos-avatares-design.md`

## Global Constraints

- **Sem dependências novas.** Nada entra no `package.json`.
- **Zero pedidos externos para logos.** O pack vai no bundle; nenhuma transação sai do dispositivo.
- **Campos novos são opcionais** (`last4`, `network`, `icon`, `color`). Sem migração Firestore. Todo o código tolera a ausência.
- **Copy em português de Portugal, sem emoji na UI** (ícones via `components/Icon.jsx`; a única exceção é o `emoji` já existente dos grupos).
- **Comentários de código em português**, no estilo dos ficheiros vizinhos.
- **Acessibilidade:** cada logo/avatar tem `role="img"` + `aria-label` com o nome; botões só com ícone têm `aria-label`.
- **Testes:** `npm test` (suite toda, tem de ficar verde no fim de cada tarefa), `npx vitest run <ficheiro>` (um ficheiro), `npm run build`.
- **Layout:** no fim de cada fatia, `npx vite --port 5199 &` e `node scripts/layout-check.mjs` sem problemas.
- **Commits:** `tipo(escopo): mensagem` em PT, com trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Push para `origin react` no fim de cada fatia.
- **Mocks de Firebase** em cada ficheiro de teste de view/modal (copiar o bloco `vi.mock` de `src/components/hero.test.jsx`).
- **Testes de views/modais** usam `renderWithStore` de `src/test/renderWithStore.jsx` e `richFixture()` de `src/test/fixtures.js`.

Bloco de mocks a copiar para cada teste novo de view/modal:

```jsx
vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));
```

Componente sonda para ler o estado do store dentro de um teste (usar quando um modal grava):

```jsx
function Probe({ pick }) {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify(pick(state))}</pre>;
}
// leitura: JSON.parse(screen.getByTestId('probe').textContent)
```

---

## Fatia A — Pack de marcas e logos nas listas

### Task 1: Pack de marcas e `resolveBrand`

**Files:**
- Create: `src/lib/brands.jsx`
- Test: `src/lib/brands.test.js`

**Interfaces:**
- Produces: `BRANDS` (objeto `{ [id]: { name, group: 'merchant'|'bank'|'network'|'asset', bg, fg, node: ReactNode, match: string[] } }`), `normalizeMerchant(text) → string`, `resolveBrand(text) → id|null`, `resolveAsset(ticker) → id|null`, `hashHue(name) → 0..359`, `ASSET_BRANDS`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// src/lib/brands.test.js
import { describe, it, expect } from 'vitest';
import { BRANDS, normalizeMerchant, resolveBrand, resolveAsset, hashHue, ASSET_BRANDS } from './brands.jsx';

describe('brands: pack', () => {
  it('cada marca tem name, group, bg, fg, node e pelo menos um alias', () => {
    Object.entries(BRANDS).forEach(([id, b]) => {
      expect(b.name, id).toBeTruthy();
      expect(['merchant', 'bank', 'network', 'asset'], id).toContain(b.group);
      expect(b.bg, id).toBeTruthy();
      expect(b.fg, id).toBeTruthy();
      expect(b.node, id).toBeTruthy();
      expect(Array.isArray(b.match) && b.match.length > 0, id).toBe(true);
    });
  });
});

describe('brands: normalizeMerchant', () => {
  it('tira dígitos, pontuação, acentos e palavras de ruído', () => {
    expect(normalizeMerchant('COMPRA 4174 PINGO DOCE LISBOA')).toBe('pingo doce');
    expect(normalizeMerchant('NETFLIX.COM AMSTERDAM')).toBe('netflix amsterdam');
    expect(normalizeMerchant('Pagamento MB WAY Galp Alvalade')).toBe('galp alvalade');
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant(null)).toBe('');
  });
});

describe('brands: resolveBrand', () => {
  it('encontra comerciantes por alias, ignorando ruído', () => {
    expect(resolveBrand('COMPRA 4174 PINGO DOCE LISBOA')).toBe('pingodoce');
    expect(resolveBrand('Netflix')).toBe('netflix');
    expect(resolveBrand('NETFLIX.COM')).toBe('netflix');
    expect(resolveBrand('UBER *TRIP')).toBe('uber');
    expect(resolveBrand('UBER EATS')).toBe('ubereats');
    expect(resolveBrand('IKEA')).toBe('ikea');
  });
  it('encontra bancos e corretoras, inclusive em rótulos "Banco · Tipo"', () => {
    expect(resolveBrand('Activobank')).toBe('activobank');
    expect(resolveBrand('Activobank · Conta a Ordem')).toBe('activobank');
    expect(resolveBrand('Trade Republic · Poupanca')).toBe('traderepublic');
    expect(resolveBrand('Revolut · Cartão de Crédito')).toBe('revolut');
    expect(resolveBrand('XTB')).toBe('xtb');
  });
  it('devolve null sem marca conhecida', () => {
    expect(resolveBrand('Padaria Central Lda')).toBeNull();
    expect(resolveBrand('')).toBeNull();
    expect(resolveBrand(undefined)).toBeNull();
  });
  it('BPI não é BP', () => {
    expect(resolveBrand('BPI')).toBe('bpi');
    expect(resolveBrand('BP ALVALADE')).toBe('bp');
  });
});

describe('brands: resolveAsset', () => {
  it('mapeia tickers conhecidos e cai para resolveBrand', () => {
    expect(ASSET_BRANDS.VWCE).toBe('vanguard');
    expect(resolveAsset('VWCE')).toBe('vanguard');
    expect(resolveAsset('aapl')).toBe('apple');
    expect(resolveAsset('MSFT')).toBe('microsoft');
    expect(resolveAsset('Apple')).toBe('apple');
    expect(resolveAsset('ZZZZ')).toBeNull();
  });
});

describe('brands: hashHue', () => {
  it('é estável e fica em 0..359', () => {
    expect(hashHue('Padaria Central')).toBe(hashHue('Padaria Central'));
    expect(hashHue('Padaria Central')).not.toBe(hashHue('Talho Sousa'));
    for (const n of ['a', 'Padaria', 'x'.repeat(50), '']) {
      const h = hashHue(n);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/lib/brands.test.js`
Expected: FAIL — `Failed to resolve import "./brands.jsx"`.

- [ ] **Step 3: Implementar `src/lib/brands.jsx`**

```jsx
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
  t212: { name: 'Trading 212', group: 'bank', bg: '#00A3E0', fg: '#fff', node: T('212', 7.8, 900), match: ['trading', 'trading212', 't212'] },
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
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .filter((w) => w && !NOISE.has(w))
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
```

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/lib/brands.test.js`
Expected: PASS (6 testes). Se `'NETFLIX.COM AMSTERDAM'` não der `'netflix amsterdam'`, confirmar que `com` está em `NOISE`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brands.jsx src/lib/brands.test.js
git commit -m "feat(marcas): pack local de marcas e resolveBrand a partir da descrição

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `MerchantLogo`, `BankLogo`, `AssetLogo`, `Initial` + CSS

**Files:**
- Create: `src/components/MerchantLogo.jsx`
- Modify: `src/components/CategoryIcon.jsx` (aceitar `className`)
- Modify: `src/styles/tokens.css` (novo bloco no fim)
- Test: `src/components/merchantLogo.test.jsx`

**Interfaces:**
- Consumes: `BRANDS`, `resolveBrand`, `resolveAsset`, `hashHue` de `src/lib/brands.jsx`; `CategoryIcon({ id, size, style, className })`.
- Produces: `default MerchantLogo({ text, cat, size = 40, bdg })`, `BankLogo({ bank, size = 36 })`, `AssetLogo({ ticker, size = 40 })`, `BrandMark({ id, size = 40, radius, title })`, `Initial({ name, size = 40 })`. Classes CSS: `.brand`, `.initial`, `.mlogo`, `.mlogo-badge`, `.cat`, `.avatar`, `.avatar-stack`, `.ccard`, `.ccard-num`, `.tiles`, `.tile`, `.tile-bar`, `.sugg`, `.day-lb`, `.icon-grid`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/components/merchantLogo.test.jsx
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MerchantLogo, { BankLogo, AssetLogo, Initial, BrandMark } from './MerchantLogo.jsx';

afterEach(() => cleanup());

describe('MerchantLogo', () => {
  it('com marca conhecida mostra o logo e a categoria como badge', () => {
    const { container } = render(<MerchantLogo text="COMPRA 4174 PINGO DOCE LISBOA" cat="sup" size={40} />);
    expect(screen.getByRole('img', { name: 'Pingo Doce' })).toBeTruthy();
    expect(container.querySelector('.mlogo-badge')).toBeTruthy();
  });
  it('sem marca mas com categoria cai para o CategoryIcon (sem role img de marca)', () => {
    const { container } = render(<MerchantLogo text="Padaria Central" cat="rest" size={40} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.mlogo')).toBeNull();
    expect(container.firstChild.tagName).toBe('DIV'); // CategoryIcon é um <div> circular
  });
  it('sem marca nem categoria cai para a inicial com o nome acessível', () => {
    render(<MerchantLogo text="Padaria Central" size={40} />);
    const el = screen.getByRole('img', { name: 'Padaria Central' });
    expect(el.textContent).toBe('P');
  });
});

describe('BankLogo / AssetLogo / Initial / BrandMark', () => {
  it('BankLogo resolve o banco a partir do rótulo "Banco · Tipo"', () => {
    render(<BankLogo bank="Activobank · Conta a Ordem" />);
    expect(screen.getByRole('img', { name: 'ActivoBank' })).toBeTruthy();
  });
  it('BankLogo sem marca mostra a inicial', () => {
    render(<BankLogo bank="Banco Teste" />);
    expect(screen.getByRole('img', { name: 'Banco Teste' }).textContent).toBe('B');
  });
  it('AssetLogo resolve tickers', () => {
    render(<AssetLogo ticker="VWCE" />);
    expect(screen.getByRole('img', { name: 'Vanguard' })).toBeTruthy();
  });
  it('Initial usa "?" para nome vazio', () => {
    render(<Initial name="" />);
    expect(screen.getByRole('img').textContent).toBe('?');
  });
  it('BrandMark com id desconhecido não renderiza nada', () => {
    const { container } = render(<BrandMark id="nope" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/components/merchantLogo.test.jsx`
Expected: FAIL — módulo `./MerchantLogo.jsx` não existe.

- [ ] **Step 3: `CategoryIcon` aceita `className`**

Em `src/components/CategoryIcon.jsx` substituir a assinatura e o `div`:

```jsx
export default function CategoryIcon({ id, size = 40, style, className }) {
  const meta = catMeta(id);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: meta.color + '22', // hex alpha ~13%
        color: meta.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={meta.icon} size={Math.round(size * 0.5)} />
    </div>
  );
}
```

- [ ] **Step 4: Criar `src/components/MerchantLogo.jsx`**

```jsx
/* ════════════════════════════════════════════════════════════════════════
   MerchantLogo — o círculo à esquerda de cada linha de lista.

   Cadeia: marca conhecida (pack local) → logo + categoria como badge no
   canto; sem marca → CategoryIcon; sem categoria → inicial num círculo com
   cor estável por nome. BankLogo e AssetLogo usam o mesmo pack.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { BRANDS, resolveBrand, resolveAsset, hashHue } from '../lib/brands.jsx';
import CategoryIcon from './CategoryIcon.jsx';

export function BrandMark({ id, size = 40, radius, title }) {
  const b = BRANDS[id];
  if (!b) return null;
  const label = title || b.name;
  return (
    <span
      className="brand"
      role="img"
      aria-label={label}
      title={label}
      style={{ width: size, height: size, borderRadius: radius != null ? radius : Math.round(size * 0.28), background: b.bg, color: b.fg }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{b.node}</svg>
    </span>
  );
}

export function Initial({ name, size = 40 }) {
  const hue = hashHue(name);
  const ch = String(name || '').trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      className="initial"
      role="img"
      aria-label={name || '?'}
      title={name || undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: 'hsl(' + hue + ' 60% 90%)', color: 'hsl(' + hue + ' 55% 32%)' }}
    >
      {ch}
    </span>
  );
}

export default function MerchantLogo({ text, cat, size = 40, bdg }) {
  const id = resolveBrand(text);
  if (id) {
    return (
      <span className="mlogo" style={{ width: size, height: size }}>
        <BrandMark id={id} size={size} />
        {cat ? <CategoryIcon id={cat} size={Math.round(size * 0.4)} className="mlogo-badge" bdg={bdg} /> : null}
      </span>
    );
  }
  if (cat) return <CategoryIcon id={cat} size={size} bdg={bdg} />;
  return <Initial name={text} size={size} />;
}

export function BankLogo({ bank, size = 36 }) {
  const id = resolveBrand(bank);
  return id ? <BrandMark id={id} size={size} /> : <Initial name={bank} size={size} />;
}

export function AssetLogo({ ticker, size = 40 }) {
  const id = resolveAsset(ticker);
  return id ? <BrandMark id={id} size={size} /> : <Initial name={ticker} size={size} />;
}
```

(`bdg` é ignorado por `CategoryIcon` até à Task 12, que o passa a usar para categorias personalizadas.)

- [ ] **Step 5: CSS — acrescentar no FIM de `src/styles/tokens.css`**

```css
/* ── Logos de marcas, iniciais, avatares, cartão-objeto, tiles (spec 2026-09-02) ── */
.brand{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.brand svg{display:block}
.initial{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0;font-weight:800;font-family:var(--font)}
.cat{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0}
.mlogo{position:relative;display:inline-flex;flex-shrink:0}
.mlogo-badge{position:absolute;right:-4px;bottom:-4px;box-shadow:0 0 0 2px var(--surface)}
.avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0;font-weight:700;color:#fff;overflow:hidden;background:var(--primary)}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.avatar-stack{display:inline-flex;align-items:center}
.avatar-stack .avatar{box-shadow:0 0 0 2px var(--surface)}
.avatar-stack .avatar+.avatar{margin-left:-8px}
.ccard{border-radius:18px;padding:16px;background:linear-gradient(135deg,#1B1F2E 0%,#2D3453 100%);color:#fff;position:relative;min-height:150px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 16px 30px -18px rgba(0,0,0,.7);margin-bottom:12px}
.ccard-num{font-size:14px;letter-spacing:.2em;opacity:.8;font-variant-numeric:tabular-nums;font-family:var(--mono)}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tile{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px 10px 10px;display:flex;flex-direction:column;gap:5px;align-items:flex-start;min-width:0;position:relative;overflow:hidden}
.tile b{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em;font-family:var(--mono)}
.tile span{font-size:10.5px;color:var(--fg-subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.tile-bar{position:absolute;top:0;left:12px;right:12px;height:3px;border-radius:0 0 3px 3px}
.sugg{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.sugg button{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border:1px solid var(--border);border-radius:999px;font-size:11px;font-weight:600;background:var(--bg);color:var(--fg);cursor:pointer;min-height:32px}
.day-lb{font-size:10.5px;font-weight:700;color:var(--fg-subtle);letter-spacing:.07em;text-transform:uppercase;margin:12px 4px 6px;font-family:var(--mono)}
.icon-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:12px}
.icon-grid button{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--fg-muted);cursor:pointer;padding:0;min-height:40px}
.icon-grid button[aria-pressed="true"]{border-color:var(--primary);color:var(--primary);background:var(--blue-soft)}
.sync-chip.compact{padding:4px 6px}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
```

- [ ] **Step 6: Correr para ver passar**

Run: `npx vitest run src/components/merchantLogo.test.jsx`
Expected: PASS (8 testes).

- [ ] **Step 7: Commit**

```bash
git add src/components/MerchantLogo.jsx src/components/CategoryIcon.jsx src/components/merchantLogo.test.jsx src/styles/tokens.css
git commit -m "feat(marcas): MerchantLogo, BankLogo e AssetLogo com fallback para categoria e inicial

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Logos em Despesas, Cartões (lista) e Recorrentes

**Files:**
- Modify: `src/views/ExpensesView.jsx:251` (linha de pesquisa), `:583` (recorrentes do mês), `:713` (linhas dentro da categoria)
- Modify: `src/views/CardsView.jsx:154` (despesas do cartão)
- Modify: `src/views/RecurringView.jsx:91` (linha de recorrente)
- Test: `src/views/logosLists.test.jsx`

**Interfaces:**
- Consumes: `MerchantLogo({ text, cat, size })` de `src/components/MerchantLogo.jsx`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/views/logosLists.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ExpensesView from './ExpensesView.jsx';
import CardsView from './CardsView.jsx';
import RecurringView from './RecurringView.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('logos nas listas', () => {
  it('Despesas: resultados de pesquisa mostram o logo do comerciante', async () => {
    await renderWithStore(<ExpensesView />, { fixture: richFixture() });
    const input = screen.getAllByPlaceholderText(/Pesquisar/)[0];
    await act(async () => {
      fireEvent.change(input, { target: { value: 'pingo' } });
    });
    expect(screen.getAllByRole('img', { name: 'Pingo Doce' }).length).toBeGreaterThan(0);
  });

  it('Cartões: despesas do cartão mostram o logo (IKEA, Netflix)', async () => {
    await renderWithStore(<CardsView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'IKEA' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Netflix' }).length).toBeGreaterThan(0);
  });

  it('Recorrentes: uma recorrente "Netflix" tem logo; "Internet" cai para a categoria', async () => {
    const fx = richFixture();
    fx.recurring = fx.recurring.concat([{ id: 'rec-nf', name: 'Netflix', amount: 10.99, day: 1, cat: 'sub' }]);
    await renderWithStore(<RecurringView />, { fixture: fx });
    expect(screen.getByRole('img', { name: 'Netflix' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Internet' })).toBeNull();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/views/logosLists.test.jsx`
Expected: FAIL — `Unable to find role="img" and name "Pingo Doce"` (e equivalentes).

- [ ] **Step 3: ExpensesView — importar e trocar os três pontos**

No topo (junto de `import CategoryIcon from '../components/CategoryIcon.jsx';`):

```jsx
import MerchantLogo from '../components/MerchantLogo.jsx';
```

Linha ~251 (resultados de pesquisa): trocar `<CategoryIcon id={x.cat} size={40} />` por

```jsx
<MerchantLogo text={x.desc} cat={x.cat} size={40} />
```

Linha ~583 (recorrentes pendentes do mês): trocar `<CategoryIcon id={r.cat} size={36} />` por

```jsx
<MerchantLogo text={r.name} cat={r.cat} size={36} />
```

Linhas ~713 (despesas dentro da categoria expandida, `aTxn.map`): o `<div className="rw">` da linha passa a ter o logo pequeno à esquerda. Substituir

```jsx
<div className="rw">
  <span style={{ fontSize: 12, color: 'var(--text)' }}>
    {x.desc}
```

por

```jsx
<div className="rw" style={{ gap: 8 }}>
  <MerchantLogo text={x.desc} cat={x.cat} size={26} />
  <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, minWidth: 0 }}>
    {x.desc}
```

- [ ] **Step 4: CardsView — logo nas despesas do cartão**

Import no topo:

```jsx
import MerchantLogo from '../components/MerchantLogo.jsx';
```

Em `exps.map((x) => (...))` substituir o bloco da linha por:

```jsx
<div key={x.id} className="rw" style={{ padding: '8px 0', borderTop: '1px solid var(--border)', gap: 10 }}>
  <MerchantLogo text={x.desc} cat={x.cat} size={32} />
  <div style={{ minWidth: 0, flex: 1 }}>
    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.desc}</div>
    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{catName(x.cat)} · {fmDateShort(x.date)}{x.imported ? ' · importada' : ''}</div>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
    <span className="m" style={{ fontSize: 12, fontWeight: 600 }}>-{mv(Math.abs(x.amount))}</span>
    <button type="button" onClick={() => deleteExp(x.id)} aria-label="Remover despesa" style={{ background: 'none', border: 'none', color: 'var(--signal)', cursor: 'pointer', padding: 2 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
    </button>
  </div>
</div>
```

- [ ] **Step 5: RecurringView — logo na linha**

Import no topo:

```jsx
import MerchantLogo from '../components/MerchantLogo.jsx';
```

Dentro de `sorted.map((r) => {...})`, trocar `<div className="rw">` da linha por `<div className="rw" style={{ gap: 12 }}>` e inserir como primeiro filho:

```jsx
<MerchantLogo text={r.name} cat={r.cat} size={40} />
```

- [ ] **Step 6: Correr para ver passar**

Run: `npx vitest run src/views/logosLists.test.jsx src/views/views.render.test.jsx`
Expected: PASS. (Há dois inputs com placeholder "Pesquisar…" no ficheiro, por isso o teste usa `getAllByPlaceholderText(...)[0]`.)

- [ ] **Step 7: Commit**

```bash
git add src/views/ExpensesView.jsx src/views/CardsView.jsx src/views/RecurringView.jsx src/views/logosLists.test.jsx
git commit -m "feat(listas): logo do comerciante em Despesas, Cartões e Recorrentes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Logos de bancos no Resumo e Transferências, ativos em Investimentos

**Files:**
- Modify: `src/views/OverviewView.jsx:510-520` (lista Disponível)
- Modify: `src/views/TransfersView.jsx:46-52` (linha de transferência)
- Modify: `src/views/InvestmentsView.jsx:66-85` (linha de posição)
- Test: `src/views/logosBanks.test.jsx`

**Interfaces:**
- Consumes: `BankLogo({ bank, size })`, `AssetLogo({ ticker, size })` de `src/components/MerchantLogo.jsx`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/views/logosBanks.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import OverviewView from './OverviewView.jsx';
import TransfersView from './TransfersView.jsx';
import InvestmentsView from './InvestmentsView.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('logos de bancos e ativos', () => {
  it('Resumo: cada conta de liquidez/poupança tem o logo do banco', async () => {
    await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'ActivoBank' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Trade Republic' }).length).toBeGreaterThan(0);
  });
  it('Transferências: origem e destino com logo', async () => {
    await renderWithStore(<TransfersView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'ActivoBank' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Revolut' }).length).toBeGreaterThan(0);
  });
  it('Investimentos: logo por ticker e corretora como badge', async () => {
    await renderWithStore(<InvestmentsView />, { fixture: richFixture() });
    expect(screen.getByRole('img', { name: 'Vanguard' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Apple' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Microsoft' })).toBeTruthy();
    expect(screen.getAllByText('XTB').length).toBe(3);
    expect(screen.queryByText(/20 @/)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/views/logosBanks.test.jsx`
Expected: FAIL nos três testes.

- [ ] **Step 3: OverviewView — lista Disponível**

Import (junto dos outros componentes):

```jsx
import { BankLogo } from '../components/MerchantLogo.jsx';
```

Substituir o conteúdo do `liqAccounts.map` (o `<span style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>{a.b}...</span>`) por:

```jsx
<span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
  <BankLogo bank={a.b} size={32} />
  <span style={{ minWidth: 0 }}>
    <span style={{ fontSize: 13, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.b}</span>
    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.t}</span>
  </span>
</span>
```

- [ ] **Step 4: TransfersView — de/para com logo**

Import: `import { BankLogo } from '../components/MerchantLogo.jsx';`

Substituir o `<div style={{ fontSize: 13, fontWeight: 600, display: 'flex', ... }}>` com `{t.from} → {t.to}` por:

```jsx
<div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
  <BankLogo bank={t.from} size={22} />
  <span>{t.from}</span>
  <span style={{ color: 'var(--text3)' }}>→</span>
  <BankLogo bank={t.to} size={22} />
  <span>{t.to}</span>
</div>
```

- [ ] **Step 5: InvestmentsView — linha de posição**

Import: `import { AssetLogo } from '../components/MerchantLogo.jsx';`

Substituir o interior do `<button ... className="cd">` de cada posição por:

```jsx
<div className="rw" style={{ gap: 10 }}>
  <AssetLogo ticker={p.asset} size={40} />
  <span style={{ flex: 1, minWidth: 0 }}>
    <span style={{ fontSize: 14, fontWeight: 700, display: 'block' }}>{p.asset}</span>
    <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
      {p.qty} un.
      {p.broker ? <span className="chip" style={{ padding: '0 7px', fontSize: 10, background: 'var(--elevated)', color: 'var(--text2)', border: 'none' }}>{p.broker}</span> : null}
    </span>
  </span>
  <span style={{ textAlign: 'right', flexShrink: 0 }}>
    <span className="m" style={{ fontSize: 14, fontWeight: 700, display: 'block' }}>{mv(p.value)}</span>
    {!hidden && (
      <span className="chip" style={{ marginTop: 3, padding: '1px 7px', fontSize: 10, fontWeight: 700, border: 'none', background: p.pl >= 0 ? 'var(--success-soft)' : 'var(--signal-soft)', color: p.pl >= 0 ? 'var(--success)' : 'var(--signal)' }}>
        {(p.pl >= 0 ? '+' : '') + p.plPct.toFixed(1) + '%'}
      </span>
    )}
  </span>
</div>
<div className="bar" style={{ height: 5, marginTop: 10 }}>
  <div className="bar-fill" style={{ width: Math.min(p.pct, 100) + '%', background: 'var(--secondary)' }} />
</div>
<div className="m" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{p.pct.toFixed(0)}% da carteira</div>
```

(A linha "20 @ 100,00 € → 110,00 €" sai: o preço médio e atual ficam no modal da posição, que abre ao tocar.)

- [ ] **Step 6: Correr para ver passar**

Run: `npx vitest run src/views/logosBanks.test.jsx src/views/views.render.test.jsx src/test/flows.test.jsx`
Expected: PASS. Se um teste em `flows.test.jsx` procurar "20 @" ou "→ 110", atualizar essa asserção para `getByText('VWCE')`.

- [ ] **Step 7: Commit**

```bash
git add src/views/OverviewView.jsx src/views/TransfersView.jsx src/views/InvestmentsView.jsx src/views/logosBanks.test.jsx
git commit -m "feat(listas): logos de bancos no Resumo e Transferências, ativos em Investimentos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Fecho da fatia A — suite, build, layout, push

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: tudo verde (a contagem sobe face aos 835 anteriores).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built in …` sem avisos novos.

- [ ] **Step 3: Layout**

```bash
(npx vite --port 5199 > /dev/null 2>&1 &) ; sleep 4 ; node scripts/layout-check.mjs ; pkill -f "vite --port 5199"
```
Expected: "0 problemas" (ou equivalente do harness). Qualquer overflow reportado tem de ser corrigido antes do push (normalmente `minWidth: 0` num flex filho).

- [ ] **Step 4: Push**

```bash
git push origin react
```

---

## Fatia B — Cartão como objeto

### Task 6: `last4` e `network` no modal de conta (só cartões)

**Files:**
- Modify: `src/modals/AcctModal.jsx` (EMPTY, seed, saveAcct ramo cartão, UI dentro de `isCard`)
- Test: `src/modals/acctModal.card.test.jsx`

**Interfaces:**
- Produces: item de `customAccts` com categoria `Cartão de crédito` ganha `last4: string` (0 ou 4 dígitos) e `network: '' | 'mastercard' | 'visa'`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/modals/acctModal.card.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import AcctModal from './AcctModal.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

function Probe() {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify(state.customAccts)}</pre>;
}

describe('AcctModal: cartão com últimos 4 dígitos e rede', () => {
  it('mostra os campos só para cartões e grava-os', async () => {
    await renderWithStore(<><AcctModal /><Probe /></>, { fixture: richFixture(), openModal: 'acct', payload: { id: 'cc' } });
    const last4 = screen.getByLabelText('Últimos 4 dígitos');
    const network = screen.getByLabelText('Rede');
    await act(async () => {
      fireEvent.change(last4, { target: { value: '2872' } });
      fireEvent.change(network, { target: { value: 'mastercard' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guardar alterações'));
    });
    const accts = JSON.parse(screen.getByTestId('probe').textContent);
    const cc = accts.find((a) => a.id === 'cc');
    expect(cc.last4).toBe('2872');
    expect(cc.network).toBe('mastercard');
    expect(cc.plafond).toBe(1500);
  });

  it('numa conta normal os campos não aparecem', async () => {
    await renderWithStore(<AcctModal />, { fixture: richFixture(), openModal: 'acct', payload: { id: 'a1' } });
    expect(screen.queryByLabelText('Últimos 4 dígitos')).toBeNull();
    expect(screen.queryByLabelText('Rede')).toBeNull();
  });

  it('guarda só dígitos e no máximo 4', async () => {
    await renderWithStore(<><AcctModal /><Probe /></>, { fixture: richFixture(), openModal: 'acct', payload: { id: 'cc' } });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), { target: { value: '12-3456' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guardar alterações'));
    });
    const cc = JSON.parse(screen.getByTestId('probe').textContent).find((a) => a.id === 'cc');
    expect(cc.last4).toBe('3456');
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/modals/acctModal.card.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Últimos 4 dígitos`.

- [ ] **Step 3: Implementar em `AcctModal.jsx`**

`EMPTY`:

```jsx
const EMPTY = { id: null, bank: '', type: 'Conta a Ordem', category: 'Liquidez', value: '', currency: 'EUR', note: '', plafond: '', last4: '', network: '' };
```

No seed (dentro de `setDraft({...})` do ramo `if (a)`), acrescentar:

```jsx
          last4: a.last4 || '',
          network: a.network || '',
```

No `saveAcct`, ramo `if (cat === CARD_CAT)`, antes de `if (draft.id)`:

```jsx
      // Só dígitos, e só os últimos 4 (o utilizador pode colar o número todo).
      const last4 = String(draft.last4 || '').replace(/\D/g, '').slice(-4);
      const network = draft.network === 'mastercard' || draft.network === 'visa' ? draft.network : '';
```

e incluir `last4, network` nos dois objetos (`updateCustomAcct(..., { bank, type, category: cat, value: 0, currency: cur, note, plafond, last4, network, updated: today })` e `addCustomAcct({ ..., plafond, last4, network, updated: today, createdAt: Date.now() })`).

Na UI, logo a seguir ao bloco `{isCard && (<div style={{ fontSize: 11, ... }}>O saldo do cartão é a <b>dívida</b>...</div>)}`, acrescentar:

```jsx
      {isCard && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label className="lb" style={labelStyle} htmlFor="acLast4">Últimos 4 dígitos</label>
            <input
              id="acLast4"
              value={draft.last4}
              onChange={(e) => set('last4', e.target.value.replace(/\D/g, '').slice(-4))}
              placeholder="2872"
              inputMode="numeric"
              maxLength={4}
              style={{ ...inputStyle, marginBottom: 0, fontFamily: 'var(--mono)', letterSpacing: '0.2em' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="lb" style={labelStyle} htmlFor="acNet">Rede</label>
            <select id="acNet" value={draft.network} onChange={(e) => set('network', e.target.value)} style={{ ...selectStyle, marginBottom: 0 }}>
              <option value="">Sem rede</option>
              <option value="mastercard">Mastercard</option>
              <option value="visa">Visa</option>
            </select>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/modals/acctModal.card.test.jsx src/modals/modals.render.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modals/AcctModal.jsx src/modals/acctModal.card.test.jsx
git commit -m "feat(cartoes): últimos 4 dígitos e rede no modal do cartão

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: CardsView — o cartão como objeto

**Files:**
- Modify: `src/views/CardsView.jsx:77-118` (cabeçalho + dívida + barra + ações)
- Test: `src/views/cardsObject.test.jsx`

**Interfaces:**
- Consumes: `BankLogo`, `BrandMark` de `src/components/MerchantLogo.jsx`; `a.id` para ir buscar `last4`/`network` a `state.customAccts`.
- Mantém os textos `Dívida atual` e `de plafond` (asserções em `src/test/flows.test.jsx:278-279`).

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/views/cardsObject.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import CardsView from './CardsView.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('CardsView: cartão como objeto', () => {
  it('mostra logo do banco, últimos 4 dígitos, rede e dívida', async () => {
    const fx = richFixture();
    fx.customAccts = fx.customAccts.map((a) => (a.id === 'cc' ? { ...a, last4: '2872', network: 'mastercard' } : a));
    const { container } = await renderWithStore(<CardsView />, { fixture: fx });
    expect(container.querySelector('.ccard')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Revolut' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/2872/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeTruthy();
    expect(screen.getByText(/Dívida atual/)).toBeTruthy();
    expect(screen.getByText(/de plafond/)).toBeTruthy();
  });
  it('sem last4 nem rede mostra só pontos e nenhum logo de rede', async () => {
    await renderWithStore(<CardsView />, { fixture: richFixture() });
    expect(screen.getByText(/•••• •••• •••• ••••/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Mastercard' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Visa' })).toBeNull();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/views/cardsObject.test.jsx`
Expected: FAIL — `.ccard` não existe.

- [ ] **Step 3: Implementar em `CardsView.jsx`**

Import: `import { BankLogo, BrandMark } from '../components/MerchantLogo.jsx';`

Dentro de `cards.map((a) => {`, depois de `const pays = ...;`, acrescentar:

```jsx
          // last4/network vivem no customAcct; getAcctsLive não os propaga.
          const raw = (state.customAccts || []).find((x) => x.id === a.id) || {};
          const last4 = raw.last4 || '';
          const network = raw.network || '';
```

Substituir o bloco desde `{/* Cabeçalho */}` até ao fim de `{/* Ações */}` (inclusive) por:

```jsx
              {/* O cartão como objeto: logo do banco, número mascarado, rede e dívida. */}
              <div className="ccard" aria-label={'Cartão ' + a.b}>
                <div className="rw">
                  <BankLogo bank={a.b} size={30} />
                  <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>Crédito</span>
                </div>
                <div className="ccard-num">•••• •••• •••• {last4 || '••••'}</div>
                <div className="rw" style={{ alignItems: 'flex-end' }}>
                  <div>
                    <div className="lb" style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>Dívida atual</div>
                    <div className="m" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>{mv(used)}</div>
                  </div>
                  {network ? <BrandMark id={network} size={36} /> : null}
                </div>
              </div>

              {/* Plafond e ações */}
              <div className="rw" style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {plafond > 0 ? mv(used) + ' de ' + mv(plafond) + ' de plafond' : 'Sem plafond definido — edita o cartão'}
                  {over && <span style={{ color: 'var(--signal)', fontWeight: 600 }}> · plafond excedido</span>}
                </div>
                <button type="button" onClick={() => open('acct', { id: a.id })} aria-label="Editar cartão" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                  Editar
                </button>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--bg3)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: pct + '%', background: over ? 'var(--signal)' : pct > 80 ? 'var(--warning)' : 'var(--primary)', transition: 'width .3s' }} />
              </div>
              <div className="rw" style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 14 }}>
                <span>Disponível {mv(available)}</span>
                <span>{a.t}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => open('add', { prefill: { acct: cardLabel } })}
                  style={{ flex: 1, padding: '10px 0', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  + Despesa no cartão
                </button>
                <button
                  type="button"
                  onClick={() => open('cardpay', { cardLabel })}
                  style={{ flex: 1, padding: '10px 0', border: 'none', background: 'var(--primary)', color: 'var(--bg)', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Pagar dívida
                </button>
              </div>
```

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/views/cardsObject.test.jsx src/test/flows.test.jsx src/views/views.render.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/CardsView.jsx src/views/cardsObject.test.jsx
git commit -m "feat(cartoes): cartão como objeto com logo, últimos 4 dígitos e rede

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Fecho da fatia B

- [ ] **Step 1:** `npm test` → verde.
- [ ] **Step 2:** `npm run build` → ok.
- [ ] **Step 3:** `(npx vite --port 5199 > /dev/null 2>&1 &) ; sleep 4 ; node scripts/layout-check.mjs ; pkill -f "vite --port 5199"` → 0 problemas.
- [ ] **Step 4:** `git push origin react`.

---

## Fatia C — Avatares

### Task 9: `Avatar`, `AvatarStack`, `greetingName`

**Files:**
- Create: `src/components/Avatar.jsx`
- Test: `src/components/avatar.test.jsx`

**Interfaces:**
- Produces: `default Avatar({ name, photoURL, color, size = 32 })`, `AvatarStack({ items: [{ id?, name, color?, photoURL? }], size = 26, max = 4 })`, `initialsFrom(name) → string`, `greetingName(user) → string`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/components/avatar.test.jsx
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Avatar, { AvatarStack, initialsFrom, greetingName } from './Avatar.jsx';

afterEach(() => cleanup());

describe('initialsFrom', () => {
  it('primeira e última inicial; uma palavra → duas letras; vazio → ?', () => {
    expect(initialsFrom('Manuel Sousa Marrão')).toBe('MM');
    expect(initialsFrom('Rita')).toBe('RI');
    expect(initialsFrom('')).toBe('?');
    expect(initialsFrom(null)).toBe('?');
  });
});

describe('greetingName', () => {
  it('displayName → primeiro nome; email → parte local capitalizada; nada → vazio', () => {
    expect(greetingName({ displayName: 'Manuel Marrão' })).toBe('Manuel');
    expect(greetingName({ email: 'manuel.sousa@gmail.com' })).toBe('Manuel');
    expect(greetingName({ email: 'test@example.com' })).toBe('Test');
    expect(greetingName(null)).toBe('');
    expect(greetingName({})).toBe('');
  });
});

describe('Avatar', () => {
  it('sem foto mostra iniciais com o nome acessível', () => {
    render(<Avatar name="Rita Silva" color="#f25592" />);
    const el = screen.getByRole('img', { name: 'Rita Silva' });
    expect(el.textContent).toBe('RS');
    expect(el.style.background).toContain('rgb(242, 85, 146)');
  });
  it('com foto renderiza a imagem sem alt duplicado', () => {
    const { container } = render(<Avatar name="Manuel" photoURL="https://example.com/p.jpg" />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('https://example.com/p.jpg');
    expect(img.getAttribute('alt')).toBe('');
    expect(screen.getByRole('img', { name: 'Manuel' })).toBeTruthy();
  });
});

describe('AvatarStack', () => {
  it('mostra no máximo `max` e um contador com o resto', () => {
    const items = ['Ana', 'Bruno', 'Carla', 'Dinis', 'Eva', 'Filipe'].map((n) => ({ id: n, name: n }));
    render(<AvatarStack items={items} max={4} />);
    expect(screen.getAllByRole('img').length).toBe(5); // 4 avatares + o "+2"
    expect(screen.getByRole('img', { name: '+2 pessoas' }).textContent).toBe('+2');
  });
  it('vazio não renderiza nada', () => {
    const { container } = render(<AvatarStack items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/components/avatar.test.jsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `src/components/Avatar.jsx`**

```jsx
/* ════════════════════════════════════════════════════════════════════════
   Avatar — círculo com foto (Google) ou iniciais sobre a cor da pessoa.
   AvatarStack — avatares sobrepostos, com "+N" quando há mais do que `max`.
   greetingName — primeiro nome para o "Olá, …" do cabeçalho.
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function greetingName(user) {
  if (!user) return '';
  if (user.displayName) return String(user.displayName).trim().split(/\s+/)[0] || '';
  if (user.email) {
    const local = String(user.email).split('@')[0].split(/[._-]/)[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
  }
  return '';
}

export default function Avatar({ name, photoURL, color, size = 32 }) {
  return (
    <span
      className="avatar"
      role="img"
      aria-label={name || 'Utilizador'}
      title={name || undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color || 'var(--primary)' }}
    >
      {photoURL ? <img src={photoURL} alt="" referrerPolicy="no-referrer" /> : initialsFrom(name)}
    </span>
  );
}

export function AvatarStack({ items, size = 26, max = 4 }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p, i) => (
        <Avatar key={p.id || p.name || i} name={p.name} photoURL={p.photoURL} color={p.color} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="avatar"
          role="img"
          aria-label={'+' + extra + ' pessoas'}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: 'var(--elevated)', color: 'var(--fg-muted)' }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/components/avatar.test.jsx`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/Avatar.jsx src/components/avatar.test.jsx
git commit -m "feat(avatares): Avatar, AvatarStack e greetingName

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Cabeçalho móvel com avatar e saudação

**Files:**
- Modify: `src/components/Shell.jsx:129-139` (`SyncChip`), `:153-175` (`Header`), `:305` (chamada de `Header`)
- Test: `src/components/shell.header.test.jsx`

**Interfaces:**
- Consumes: `Avatar`, `greetingName` de `./Avatar.jsx`; `currentUser` de `useStore()` (`{ uid, email, displayName?, photoURL? }`).

- [ ] **Step 1: Escrever o teste que falha**

Ler primeiro `src/components/shell.nav.test.jsx` (linhas 1-40) para copiar exatamente como o `Shell` é montado (mocks e `renderWithStore(<Shell />, { fixture })`). Depois:

```jsx
// src/components/shell.header.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import Shell from './Shell.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('Shell: cabeçalho com avatar e saudação', () => {
  it('sauda pelo nome derivado do email de teste e mostra o avatar', async () => {
    await renderWithStore(<Shell />, { fixture: richFixture() });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Olá, Test');
    expect(screen.getByRole('img', { name: 'test@example.com' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/components/shell.header.test.jsx`
Expected: FAIL — o h1 contém "Proof.Finance".

- [ ] **Step 3: Implementar em `Shell.jsx`**

Import (junto de `import AssistantFab ...`):

```jsx
import Avatar, { greetingName } from './Avatar.jsx';
```

`SyncChip`: quando está "Guardado" o texto fica só para leitores de ecrã.

```jsx
function SyncChip({ status }) {
  if (status === 'idle') return null;
  const label =
    status === 'saving' ? 'A guardar' : status === 'saved' ? 'Guardado' : status === 'error' ? 'Erro' : '';
  const quiet = status === 'saved';
  return (
    <span className={'sync-chip ' + status + (quiet ? ' compact' : '')} id="syncChip" title={label}>
      <span className="sync-dot" />
      <span className={'sync-label' + (quiet ? ' vh' : '')}>{label}</span>
    </span>
  );
}
```

`Header` passa a receber `user`:

```jsx
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function Header({ theme, onToggleTheme, syncStatus, user }) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && document.documentElement.getAttribute('data-theme') === 'dark');
  const now = new Date();
  const name = greetingName(user);
  const label = (user && (user.displayName || user.email)) || 'Utilizador';
  return (
    <header className="app-header" style={{ padding: 'calc(8px + var(--safe-top)) 20px 16px' }}>
      <div className="rw">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 17, lineHeight: 1.2, minWidth: 0 }}>
          <Avatar name={label} photoURL={user && user.photoURL} size={36} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--fg-subtle)', letterSpacing: '0.04em' }}>
              {MONTHS_PT[now.getMonth()] + ' ' + now.getFullYear()}
            </span>
            <span style={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name ? 'Olá, ' + name : 'Proof. Finance'}
            </span>
          </span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <SyncChip status={syncStatus} />
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label="Mudar tema">
            {isDark ? Icon.sun : Icon.moon}
          </button>
        </div>
      </div>
    </header>
  );
}
```

Na chamada (linha ~305): `<Header theme={state.theme} onToggleTheme={toggleTheme} syncStatus={syncStatus} user={currentUser} />`.

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/components/shell.header.test.jsx src/components/shell.nav.test.jsx`
Expected: PASS. Se `shell.nav.test.jsx` procurar o texto "Proof." no cabeçalho, trocar essa asserção por `getByRole('heading', { level: 1 })`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Shell.jsx src/components/shell.header.test.jsx
git commit -m "feat(cabecalho): avatar, saudação e chip de sync discreto

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Avatares em Grupos e na faixa de grupos do Resumo

**Files:**
- Modify: `src/views/GroupsView.jsx:49-104` (`GroupCard`), `:106-128` (`MemberAvatar`), `:240-262` (`SettleRow`), e a chamada de `GroupCard` (procurar com `grep -n "<GroupCard" src/views/GroupsView.jsx`)
- Modify: `src/views/OverviewView.jsx:244-276` (faixa Grupos)
- Test: `src/views/groupsAvatars.test.jsx`

**Interfaces:**
- Consumes: `AvatarStack` de `src/components/Avatar.jsx`; `nameOf`, `colorOf` já existentes em `GroupsView`.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/views/groupsAvatars.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import GroupsView from './GroupsView.jsx';
import OverviewView from './OverviewView.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('avatares nos grupos', () => {
  it('o card do grupo mostra os membros como avatares sobrepostos', async () => {
    const { container } = await renderWithStore(<GroupsView />, { fixture: richFixture() });
    const card = container.querySelector('.cd .avatar-stack');
    expect(card).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Ana' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'João' }).length).toBeGreaterThan(0);
  });
  it('a faixa Grupos do Resumo mostra as pessoas dos grupos ativos', async () => {
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    const strip = Array.from(container.querySelectorAll('button.cd')).find((b) => /Grupos/.test(b.getAttribute('aria-label') || ''));
    expect(strip).toBeTruthy();
    expect(strip.querySelector('.avatar-stack')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/views/groupsAvatars.test.jsx`
Expected: FAIL — `.avatar-stack` não existe.

- [ ] **Step 3: `GroupsView.jsx`**

`MemberAvatar` ganha a classe `avatar` (para o empilhamento):

```jsx
function MemberAvatar({ id, nameOf, colorOf, size = 30 }) {
  return (
    <span
      className="avatar"
      role="img"
      aria-label={nameOf(id)}
      title={nameOf(id)}
      style={{ width: size, height: size, background: colorOf(id), fontSize: size * 0.36 }}
    >
      {initialsOf(nameOf(id), id)}
    </span>
  );
}
```

`GroupCard` recebe `nameOf` e `colorOf` e troca "N pessoas" por avatares. Assinatura: `function GroupCard({ group, totals, settled, onOpen, btnRef, nameOf, colorOf })`. Substituir o `<span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>…</span>` por:

```jsx
<span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
  <span className="cat" style={{ width: 40, height: 40, background: 'var(--elevated)', fontSize: 20 }} aria-hidden="true">
    {group.emoji || '👥'}
  </span>
  <span style={{ minWidth: 0 }}>
    <span style={{ fontSize: 14, fontWeight: 700, display: 'block' }}>{group.name}</span>
    <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
      <span className="avatar-stack">
        {(group.memberIds || []).slice(0, 4).map((id) => (
          <MemberAvatar key={id} id={id} nameOf={nameOf} colorOf={colorOf} size={18} />
        ))}
      </span>
      <span>
        {fm(totals.total)}
        {hasRange ? ' · ' + fmDateShort(group.start) + ' – ' + fmDateShort(group.end) : ''}
      </span>
    </span>
  </span>
</span>
```

e acrescentar ao `<button>` do card `aria-label={group.name + ' · ' + memberCount + ' pessoas'}` para não perder a contagem. Nas DUAS chamadas de `GroupCard` (linhas ~647 e ~665, listas de ativos e arquivados), passar `nameOf={nameOf} colorOf={colorOf}` (ambos já estão definidos no componente `GroupsView`, linhas ~512-513).

`SettleRow` recebe `colorOf` e mostra avatares. Assinatura: `function SettleRow({ debt, nameOf, colorOf, onSettle, disabled })`. Substituir `<span style={{ fontSize: 13, fontWeight: 600 }}>{nameOf(debt.from)} → {nameOf(debt.to)}</span>` por:

```jsx
<span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
  <MemberAvatar id={debt.from} nameOf={nameOf} colorOf={colorOf} size={24} />
  <span>{nameOf(debt.from)}</span>
  <span style={{ color: 'var(--text3)' }}>→</span>
  <MemberAvatar id={debt.to} nameOf={nameOf} colorOf={colorOf} size={24} />
  <span>{nameOf(debt.to)}</span>
</span>
```

e na chamada de `SettleRow` (linha ~432) passar `colorOf={colorOf}`.

- [ ] **Step 4: `OverviewView.jsx` — faixa Grupos**

Import: `import { AvatarStack } from '../components/Avatar.jsx';`

Antes do `return (` do componente, depois de `const groupsSummary = ...`:

```jsx
  // Pessoas dos grupos ativos (sem o próprio), para a faixa de Grupos.
  const groupPeople = useMemo(() => {
    const ids = new Set();
    (state.groups || []).filter((g) => !g.archived).forEach((g) => (g.memberIds || []).forEach((id) => id !== ME_ID && ids.add(id)));
    return (state.people || []).filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name, color: p.color }));
  }, [state.groups, state.people]);
```

Na faixa, substituir `<span className="rw"><div className="lb">Grupos</div><span style={{ fontSize: 11, color: 'var(--text3)' }}>ver</span></span>` por:

```jsx
<span className="rw">
  <div className="lb">Grupos</div>
  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <AvatarStack items={groupPeople} size={22} max={4} />
    <span style={{ fontSize: 11, color: 'var(--text3)' }}>ver</span>
  </span>
</span>
```

- [ ] **Step 5: Correr para ver passar**

Run: `npx vitest run src/views/groupsAvatars.test.jsx src/views/groups.detail.test.jsx src/views/groups.integration.test.jsx src/views/groups.demo.test.jsx src/views/views.render.test.jsx`
Expected: PASS. Se algum teste de grupos procurar `getByText(/3 pessoas/)`, trocar por `getByRole('button', { name: /3 pessoas/ })`.

- [ ] **Step 6: Commit**

```bash
git add src/views/GroupsView.jsx src/views/OverviewView.jsx src/views/groupsAvatars.test.jsx
git commit -m "feat(grupos): avatares dos membros no card, no plano de acertos e no Resumo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Fecho da fatia C

- [ ] `npm test` → verde. `npm run build` → ok. Layout-check → 0 problemas. `git push origin react`.

---

## Fatia D — Ícones por meta e por categoria

### Task 13: Ícones novos e `catMeta` com override

**Files:**
- Modify: `src/components/Icon.jsx` (novos PATHS)
- Modify: `src/lib/categories.js` (`comp` → `bag`, `catMeta(id, item)`, listas de seleção)
- Modify: `src/components/CategoryIcon.jsx` (prop `bdg`)
- Test: `src/lib/categories.meta.test.js`

**Interfaces:**
- Produces: ícones `bag, landmark, person, umbrella, shieldCheck, plane, gift, graduation, piggy, calendar, check, bell`; `catMeta(id, item?) → { icon, color }`; `PICKER_ICONS: string[]`, `PICKER_COLORS: string[]`, `GOAL_ICONS: string[]`; `CategoryIcon({ id, size, style, className, bdg })`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// src/lib/categories.meta.test.js
import { describe, it, expect } from 'vitest';
import { catMeta, CAT_META, PICKER_ICONS, PICKER_COLORS, GOAL_ICONS } from './categories.js';

describe('catMeta', () => {
  it('Compras usa saco, Supermercado usa carrinho', () => {
    expect(catMeta('comp').icon).toBe('bag');
    expect(catMeta('sup').icon).toBe('cart');
  });
  it('item com icon/color sobrepõe os defaults; campos vazios não', () => {
    expect(catMeta('rest', { icon: 'plane', color: '#123456' })).toEqual({ icon: 'plane', color: '#123456' });
    expect(catMeta('rest', { icon: '', color: '' })).toEqual(CAT_META.rest);
    expect(catMeta('xyz', { icon: 'person' })).toEqual({ icon: 'person', color: '#9aa3b5' });
  });
  it('listas de seleção não estão vazias e não têm duplicados', () => {
    [PICKER_ICONS, GOAL_ICONS, PICKER_COLORS].forEach((l) => {
      expect(l.length).toBeGreaterThan(5);
      expect(new Set(l).size).toBe(l.length);
    });
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/lib/categories.meta.test.js`
Expected: FAIL — `catMeta('comp').icon` é `'cart'`; exports em falta.

- [ ] **Step 3: `Icon.jsx` — acrescentar a `PATHS` (antes de `// fallback`)**

```jsx
  bag: (
    <>
      <path d="M6 8h12l1 13H5z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  landmark: (
    <>
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  umbrella: (
    <>
      <path d="M22 12a10 10 0 0 0-20 0z" />
      <path d="M12 12v7a2 2 0 0 0 4 0" />
      <line x1="12" y1="2" x2="12" y2="3" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </>
  ),
  plane: (
    <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  ),
  gift: (
    <>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </>
  ),
  graduation: (
    <>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </>
  ),
  piggy: (
    <>
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 6.5 0 3 2 5 4 5.5V21h2v-2h4v2h2v-2c1.5 0 2.5-1.5 2.5-3H21v-5h-1.5c-.2-1-.7-1.8-1.5-2.5V5z" />
      <circle cx="15.5" cy="11.5" r="1" />
      <path d="M2 12.5c0-1.5 1-2.5 2-2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  bell: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
```

- [ ] **Step 4: `categories.js`**

Em `CAT_META` trocar `comp: { icon: 'cart', color: '#12b3a6' }` por `comp: { icon: 'bag', color: '#12b3a6' }`. Substituir `catMeta` e acrescentar as listas:

```js
// Meta visual: defaults por id, com override opcional do próprio item (icon/color
// escolhidos pelo utilizador em categorias personalizadas).
export function catMeta(id, item) {
  const base = CAT_META[id] || { icon: 'dots', color: '#9aa3b5' };
  if (!item) return base;
  return { icon: item.icon || base.icon, color: item.color || base.color };
}

// Seletores (gestor de categorias e modal de meta).
export const PICKER_ICONS = ['food', 'cart', 'bag', 'home', 'landmark', 'sparkle', 'shield', 'paw', 'health', 'phone', 'car', 'dumbbell', 'fuel', 'briefcase', 'ticket', 'transfer', 'person', 'gift', 'plane', 'umbrella', 'graduation', 'piggy', 'recurring', 'dots'];
export const PICKER_COLORS = ['#3b6fee', '#3fc97a', '#f5a623', '#7b5fe0', '#f25555', '#12b3a6', '#f25592', '#6b7280'];
export const GOAL_ICONS = ['goal', 'umbrella', 'shieldCheck', 'car', 'plane', 'home', 'gift', 'graduation', 'piggy'];
```

- [ ] **Step 5: `CategoryIcon.jsx` — usar `bdg` para o override**

```jsx
export default function CategoryIcon({ id, size = 40, style, className, bdg }) {
  const item = Array.isArray(bdg) ? bdg.find((b) => b.id === id) : null;
  const meta = catMeta(id, item);
  // ... resto igual (div com meta.color / meta.icon)
```

- [ ] **Step 6: Correr para ver passar**

Run: `npx vitest run src/lib/categories.meta.test.js src/components/merchantLogo.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/Icon.jsx src/lib/categories.js src/components/CategoryIcon.jsx src/lib/categories.meta.test.js
git commit -m "feat(categorias): ícones novos, Compras com saco e catMeta com override por item

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Gestor de categorias com seletor de ícone e cor

**Files:**
- Modify: `src/modals/CatManagerModal.jsx` (draft, editCat, saveCat, lista, formulário)
- Test: `src/modals/catManager.icon.test.jsx`

**Interfaces:**
- Consumes: `PICKER_ICONS`, `PICKER_COLORS`, `catMeta` de `src/lib/categories.js`; `Icon` de `src/components/Icon.jsx`; `CategoryIcon` com `bdg`.
- Produces: item de `bdg` com `icon: string` e `color: string` opcionais.

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/modals/catManager.icon.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import CatManagerModal from './CatManagerModal.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

function Probe() {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify(state.bdg)}</pre>;
}

describe('CatManagerModal: ícone e cor', () => {
  it('cria uma categoria com o ícone e a cor escolhidos', async () => {
    await renderWithStore(<><CatManagerModal /><Probe /></>, { fixture: richFixture(), openModal: 'cat' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Viagens' } });
      fireEvent.click(screen.getByRole('button', { name: 'Ícone plane' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cor #f5a623' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Adicionar'));
    });
    const bdg = JSON.parse(screen.getByTestId('probe').textContent);
    const v = bdg.find((b) => b.nm === 'Viagens');
    expect(v.icon).toBe('plane');
    expect(v.color).toBe('#f5a623');
  });
  it('o seletor marca o ícone escolhido com aria-pressed', async () => {
    await renderWithStore(<CatManagerModal />, { fixture: richFixture(), openModal: 'cat' });
    const btn = screen.getByRole('button', { name: 'Ícone gift' });
    await act(async () => { fireEvent.click(btn); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/modals/catManager.icon.test.jsx`
Expected: FAIL — botão "Ícone plane" não existe.

- [ ] **Step 3: Implementar em `CatManagerModal.jsx`**

Imports:

```jsx
import Icon from '../components/Icon.jsx';
import CategoryIcon from '../components/CategoryIcon.jsx';
import { sortedCats, PICKER_ICONS, PICKER_COLORS } from '../lib/categories.js';
```

Todos os `setDraft({ id: '', nm: '', lm: '' })` passam a `setDraft(BLANK)` com `const BLANK = { id: '', nm: '', lm: '', icon: '', color: '' };` no topo do ficheiro; o `useState` inicial também usa `BLANK`.

Em `editCat` (procurar `const editCat =`), ao seedar o draft a partir do item `b`, incluir `icon: b.icon || '', color: b.color || ''`.

Em `saveCat`: `actions.updateCategory(draft.editId, { nm, lm, icon: draft.icon || '', color: draft.color || '' });` e `actions.addCategory({ id: newId, nm, lm, icon: draft.icon || '', color: draft.color || '' });`.

Na lista, o `<div style={{ flex: 1, minWidth: 0 }}>` de cada categoria passa a estar precedido de `<CategoryIcon id={b.id} size={30} bdg={cats} />` e o `.rw` ganha `gap: 10`.

No formulário, depois do `<div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>…</div>` e antes do botão "Adicionar":

```jsx
        <div className="lb" style={{ marginBottom: 8 }}>Ícone</div>
        <div className="icon-grid">
          {PICKER_ICONS.map((ic) => (
            <button key={ic} type="button" aria-label={'Ícone ' + ic} aria-pressed={draft.icon === ic} onClick={() => setDraft((p) => ({ ...p, icon: ic }))}>
              <Icon name={ic} size={18} />
            </button>
          ))}
        </div>
        <div className="lb" style={{ marginBottom: 8 }}>Cor</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {PICKER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={'Cor ' + c}
              aria-pressed={draft.color === c}
              onClick={() => setDraft((p) => ({ ...p, color: c }))}
              style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: draft.color === c ? '3px solid var(--text)' : '3px solid transparent', padding: 0, cursor: 'pointer' }}
            />
          ))}
        </div>
```

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/modals/catManager.icon.test.jsx src/modals/modals.render.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modals/CatManagerModal.jsx src/modals/catManager.icon.test.jsx
git commit -m "feat(categorias): seletor de ícone e cor nas categorias personalizadas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Metas com ícone, chip de estado e progresso global uma vez

**Files:**
- Modify: `src/modals/GoalModal.jsx` (EMPTY, seed, save, seletor)
- Modify: `src/views/GoalsView.jsx:79-95` (progresso global), `:114-190` (card da meta)
- Test: `src/views/goalsIcons.test.jsx`

**Interfaces:**
- Consumes: `GOAL_ICONS` de `src/lib/categories.js`; `Icon`; `riskById` já calculado em `GoalsView`.
- Produces: `goal.icon: string` opcional (default `'goal'`).

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/views/goalsIcons.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { useStore } from '../store/store.jsx';
import GoalsView from './GoalsView.jsx';
import GoalModal from '../modals/GoalModal.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

function Probe() {
  const { state } = useStore();
  return <pre data-testid="probe">{JSON.stringify(state.goals)}</pre>;
}

describe('Metas com ícone', () => {
  it('cada meta mostra um tile de ícone e um chip de estado; o progresso global aparece uma vez', async () => {
    const fx = richFixture();
    fx.goals = fx.goals.map((g) => (g.id === 'g1' ? { ...g, icon: 'umbrella' } : g));
    const { container } = await renderWithStore(<GoalsView />, { fixture: fx });
    expect(container.querySelectorAll('.goal-icon').length).toBe(2);
    expect(screen.getByText('atrasada')).toBeTruthy();
    expect(screen.getByText('no ritmo')).toBeTruthy();
    expect(screen.queryByText('Progresso global')).toBeNull();
    expect(screen.queryByText(/Não chega para o prazo/)).toBeNull();
  });
  it('o modal grava o ícone escolhido', async () => {
    await renderWithStore(<><GoalModal /><Probe /></>, { fixture: richFixture(), openModal: 'goal', payload: { id: 'g2' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ícone shieldCheck' })); });
    await act(async () => { fireEvent.click(screen.getByText('Guardar alterações')); });
    const g2 = JSON.parse(screen.getByTestId('probe').textContent).find((g) => g.id === 'g2');
    expect(g2.icon).toBe('shieldCheck');
  });
});
```

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/views/goalsIcons.test.jsx`
Expected: FAIL — `.goal-icon` não existe; botão "Ícone shieldCheck" não existe.

- [ ] **Step 3: `GoalModal.jsx`**

Imports: `import Icon from '../components/Icon.jsx';` e `import { GOAL_ICONS } from '../lib/categories.js';`

`EMPTY` ganha `icon: 'goal'`. No seed: `icon: g.icon || 'goal'`. Em `saveGoal`, os dois objetos ganham `icon: draft.icon || 'goal'`.

Antes de `<div className="lb" style={{ marginBottom: 8 }}>Cor</div>`:

```jsx
      <div className="lb" style={{ marginBottom: 8 }}>Ícone</div>
      <div className="icon-grid">
        {GOAL_ICONS.map((ic) => (
          <button key={ic} type="button" aria-label={'Ícone ' + ic} aria-pressed={draft.icon === ic} onClick={() => set('icon', ic)}>
            <Icon name={ic} size={18} />
          </button>
        ))}
      </div>
```

- [ ] **Step 4: `GoalsView.jsx`**

Import: `import Icon from '../components/Icon.jsx';`

Progresso global: apagar o `<div className="rw" style={{ marginBottom: 10 }}>` com `Progresso global` + `{overall.toFixed(0)}%` (o `ContextStrip` no topo já mostra os dois). O card fica com a barra e a linha "X de Y / Z restantes"; acrescentar à barra um `aria-label={'Progresso global ' + overall.toFixed(0) + '%'}` e `role="img"`.

Card da meta: substituir a faixa lateral e o cabeçalho (do `<div style={{ position: 'absolute', top: 0, left: 0, width: 4, ... }} />` até ao fecho do `.rw` do cabeçalho) por:

```jsx
            <div className="rw" style={{ marginBottom: 12, gap: 10 }}>
              <span className="cat goal-icon" style={{ width: 40, height: 40, background: c + '22', color: c }} aria-hidden="true">
                <Icon name={g.icon || 'goal'} size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{g.name}</div>
                {g.deadline && (
                  <div style={{ fontSize: 11, color: daysLeft != null && daysLeft < 30 ? 'var(--orange)' : 'var(--text3)', marginTop: 2, fontWeight: 500 }}>
                    {daysLeft != null ? (daysLeft > 0 ? daysLeft + ' dias restantes' : 'Prazo passado') : g.deadline}
                  </div>
                )}
              </div>
              {(() => {
                const risk = riskById[g.id];
                const done = pctAbs >= 100;
                const label = done ? 'concluída' : risk ? 'atrasada' : g.monthly > 0 ? 'no ritmo' : 'a começar';
                const tone = done || label === 'no ritmo' ? 'var(--success)' : risk ? 'var(--warning)' : 'var(--text3)';
                const title = risk
                  ? 'Não chega para o prazo: precisas de ' + fc(risk.needed) + '/mês' + (risk.monthly > 0 ? ' (+' + fc(risk.gap) + ')' : '') + ' nos próximos ' + risk.monthsLeft + (risk.monthsLeft === 1 ? ' mês' : ' meses') + '.'
                  : undefined;
                return (
                  <span className="chip" title={title} style={{ border: 'none', background: 'color-mix(in srgb, ' + tone + ' 14%, transparent)', color: tone, fontWeight: 700, padding: '3px 9px', flexShrink: 0 }}>
                    {label}
                  </span>
                );
              })()}
              <button type="button" onClick={() => open('goal', { id: g.id })} className="icon-btn" style={{ width: 32, height: 32, flexShrink: 0 }} aria-label="Editar meta">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </div>
```

e remover `marginLeft: 8` do `<div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 8 }}>` (já não há faixa lateral). Apagar o bloco `{riskById[g.id] && (<div style={{ fontSize: 11, color: 'var(--warning)' ... }}>Não chega para o prazo …</div>)}` (o texto vive agora no `title` do chip).

- [ ] **Step 5: Correr para ver passar**

Run: `npx vitest run src/views/goalsIcons.test.jsx src/views/views.render.test.jsx src/modals/modals.render.test.jsx`
Expected: PASS. Se outro teste procurar "Não chega para o prazo" na GoalsView, trocar por `getByText('atrasada')`.

- [ ] **Step 6: Commit**

```bash
git add src/modals/GoalModal.jsx src/views/GoalsView.jsx src/views/goalsIcons.test.jsx
git commit -m "feat(metas): ícone por meta, chip de estado e progresso global só uma vez

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Grelha de categorias e logo no campo de descrição

**Files:**
- Modify: `src/modals/AddExpenseSheet.jsx:260` (`CategoryIcon` com `bdg`), `:272-279` (descrição)
- Modify: `src/views/ExpensesView.jsx:651` (`CategoryIcon` com `bdg`)
- Test: `src/modals/addExpense.logo.test.jsx`

- [ ] **Step 1: Escrever o teste que falha**

```jsx
// src/modals/addExpense.logo.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import { initialPersisted } from '../store/store.jsx';
import AddExpenseSheet from './AddExpenseSheet.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('Nova despesa: logo ao escrever a descrição', () => {
  it('mostra o logo quando a descrição bate numa marca', async () => {
    await renderWithStore(<AddExpenseSheet />, { fixture: richFixture(), openModal: 'add' });
    expect(screen.queryByRole('img', { name: 'Pingo Doce' })).toBeNull();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Pingo Doce' } });
    });
    expect(screen.getByRole('img', { name: 'Pingo Doce' })).toBeTruthy();
  });
  it('a grelha usa o ícone/cor de uma categoria personalizada', async () => {
    const fx = richFixture();
    // richFixture não traz bdg: parte dos defaults do store e junta a personalizada.
    fx.bdg = initialPersisted().bdg.concat([{ id: 'viagens', nm: 'Viagens', lm: 200, icon: 'plane', color: '#f5a623' }]);
    await renderWithStore(<AddExpenseSheet />, { fixture: fx, openModal: 'add' });
    const cell = screen.getByRole('button', { name: /Viagens/ });
    expect(cell.querySelector('div').style.color).toBe('rgb(245, 166, 35)');
  });
});
```

(`richFixture()` não traz `bdg`; o store hidrata `defaultBdg()` por omissão, daí o `initialPersisted().bdg.concat(...)`.)

- [ ] **Step 2: Correr para ver falhar**

Run: `npx vitest run src/modals/addExpense.logo.test.jsx`
Expected: FAIL.

- [ ] **Step 3: `AddExpenseSheet.jsx`**

Imports: `import MerchantLogo from '../components/MerchantLogo.jsx';` e `import { resolveBrand } from '../lib/brands.jsx';`

Grelha (linha ~260, dentro de `cats.map((b) => …)`): `<CategoryIcon id={b.id} size={34} />` → `<CategoryIcon id={b.id} size={34} bdg={cats} />`.

Descrição: substituir o `<input value={d.desc} ... />` por:

```jsx
      <div style={{ position: 'relative', marginBottom: errors.desc ? 0 : 14 }}>
        {resolveBrand(d.desc) && (
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex' }}>
            <MerchantLogo text={d.desc} size={26} />
          </span>
        )}
        <input
          value={d.desc}
          onChange={(e) => set('desc', e.target.value)}
          placeholder="Ex: Pingo Doce"
          aria-label="Descrição"
          style={{ ...inputStyle, fontSize: 15, marginBottom: 0, paddingLeft: resolveBrand(d.desc) ? 46 : 16 }}
        />
      </div>
```

(`inputStyle` define `padding: '12px 16px'`; o `paddingLeft` explícito sobrepõe-se ao lado esquerdo.)

`ExpensesView.jsx:651`: `<CategoryIcon id={r.id} size={40} />` → `<CategoryIcon id={r.id} size={40} bdg={bdg} />`.

- [ ] **Step 4: Correr para ver passar**

Run: `npx vitest run src/modals/addExpense.logo.test.jsx src/modals/modals.render.test.jsx src/views/views.render.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modals/AddExpenseSheet.jsx src/views/ExpensesView.jsx src/modals/addExpense.logo.test.jsx
git commit -m "feat(despesas): logo ao escrever a descrição e ícones personalizados na grelha

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Fecho da fatia D

- [ ] `npm test` → verde. `npm run build` → ok. Layout-check → 0 problemas. `git push origin react`.

---

## Fatia E — Menos texto

### Task 18: `StatTiles`

**Files:**
- Create: `src/components/StatTiles.jsx`
- Test: `src/components/statTiles.test.jsx`

**Interfaces:**
- Produces: `default StatTiles({ items: [{ key?, value: string, label: string, icon?: ReactNode, color?: string, title?: string }] })`.

- [ ] **Step 1: Teste**

```jsx
// src/components/statTiles.test.jsx
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StatTiles from './StatTiles.jsx';

afterEach(() => cleanup());

describe('StatTiles', () => {
  it('renderiza um tile por item, com barra de cor quando há color', () => {
    const { container } = render(
      <StatTiles items={[{ value: '76 €', label: 'por mês' }, { value: '910 €', label: 'por ano' }, { value: '40 €', label: 'por pagar', color: '#9c5e00' }]} />
    );
    expect(container.querySelectorAll('.tile').length).toBe(3);
    expect(screen.getByText('76 €')).toBeTruthy();
    expect(screen.getByText('por pagar')).toBeTruthy();
    expect(container.querySelectorAll('.tile-bar').length).toBe(1);
  });
  it('sem items não renderiza nada', () => {
    const { container } = render(<StatTiles items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/statTiles.test.jsx` → FAIL (módulo em falta).

- [ ] **Step 3: Implementar**

```jsx
/* ════════════════════════════════════════════════════════════════════════
   StatTiles — três números lado a lado (eyebrow por baixo, ícone opcional,
   barra de cor opcional no topo). Substitui frases do tipo "910 € por ano ·
   2 subscrições · falta pagar 40 €".
   ════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export default function StatTiles({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  return (
    <div className="tiles">
      {list.map((it, i) => (
        <div key={it.key || i} className="tile" title={it.title}>
          {it.color ? <span className="tile-bar" style={{ background: it.color }} aria-hidden="true" /> : null}
          {it.icon || null}
          <b>{it.value}</b>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4:** `npx vitest run src/components/statTiles.test.jsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/StatTiles.jsx src/components/statTiles.test.jsx
git commit -m "feat(ui): StatTiles para números lado a lado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 19: Resumo — fecho do mês em tiles e insights compactos

**Files:**
- Modify: `src/lib/anomalies.js:102-118` (outlier ganha `avg` e `ratio`)
- Modify: `src/lib/pulse.js:140-148` (insight de anomalia com `subject` e título curto)
- Modify: `src/views/OverviewView.jsx:281-305` (fecho do mês), `:433-462` (insights)
- Test: `src/views/overviewCompact.test.jsx`; atualizar `src/lib/pulse.test.js` se referir os títulos antigos

**Interfaces:**
- Produces: insight `{ id, tone, title, detail, dismissId, subject?: { desc, cat, amount } }`.

- [ ] **Step 1: Teste**

```jsx
// src/views/overviewCompact.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import OverviewView from './OverviewView.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('Resumo compacto', () => {
  it('insight de anomalia mostra o logo do comerciante e o botão ✓ sem texto', async () => {
    await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.getAllByRole('img', { name: 'Pingo Doce' }).length).toBeGreaterThan(0);
    const btn = screen.getAllByRole('button', { name: 'Está certo, dispensar aviso' })[0];
    expect(btn.textContent.trim()).toBe('');
    expect(screen.queryByText('Está certo')).toBeNull();
    expect(screen.getByText('Fora do padrão')).toBeTruthy();
  });
  it('o fecho do mês, quando aparece, usa tiles em vez da frase "Onde foi"', async () => {
    const { container } = await renderWithStore(<OverviewView />, { fixture: richFixture() });
    expect(screen.queryByText(/Onde foi/)).toBeNull();
    const closing = Array.from(container.querySelectorAll('.cd')).find((el) => /Fecho de/.test(el.textContent));
    if (closing) expect(closing.querySelectorAll('.tile').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/views/overviewCompact.test.jsx` → FAIL.

- [ ] **Step 3: `anomalies.js` — outlier com `avg` e `ratio`**

No `out.push({...})` do bloco "Valor muito fora do padrão", acrescentar `avg, ratio,` a seguir a `amount: v,`.

- [ ] **Step 4: `pulse.js` — insight com `subject`**

Substituir o `findAnomalies(...).forEach((a) => { out.push({...}) })` por:

```js
  findAnomalies(state, d, { limit: 2 }).forEach((a) => {
    const x = a.expense || {};
    const eur = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' €';
    out.push({
      id: 'anom-' + a.id,
      tone: 'alert',
      title: a.kind === 'duplicate' ? 'Cobrança repetida' : 'Fora do padrão',
      detail:
        a.kind === 'duplicate'
          ? (x.desc || '') + ' · ' + eur(a.amount) + ' duas vezes'
          : (x.desc || '') + ' · ' + eur(a.amount) + ' · ' + (a.ratio || 0).toFixed(1) + '× o habitual (' + eur(a.avg || 0) + ')',
      long: a.title + ' — ' + a.detail,
      subject: { desc: x.desc || '', cat: x.cat || '', amount: a.amount },
      dismissId: a.id, // permite ao utilizador dizer "está certo"
    });
  });
```

Correr `npx vitest run src/lib/pulse.test.js`. Se um teste esperar `'Possível cobrança repetida'` ou `'Despesa fora do padrão'`, trocar pelos títulos novos `'Cobrança repetida'` / `'Fora do padrão'`; se esperar `detail` a conter o título antigo, apontar para `long`.

- [ ] **Step 5: `OverviewView.jsx` — fecho do mês**

Imports: `import StatTiles from '../components/StatTiles.jsx';`, `import CategoryIcon from '../components/CategoryIcon.jsx';`, `import MerchantLogo from '../components/MerchantLogo.jsx';`, `import { catMeta } from '../lib/categories.js';`

Substituir o `<div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>…Poupaste… Onde foi…</div>` por:

```jsx
          {closing.rate != null && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
              Poupaste {hidden ? '••••' : fc(closing.saved)} ({Math.round(closing.rate)}% do rendimento)
            </div>
          )}
          {closing.top.length > 0 && (
            <StatTiles
              items={closing.top.map((t) => ({
                key: t.cat,
                icon: <CategoryIcon id={t.cat} size={24} bdg={state.bdg} />,
                value: hidden ? '••••' : fc(t.value),
                label: t.name,
                color: catMeta(t.cat, (state.bdg || []).find((b) => b.id === t.cat)).color,
              }))}
            />
          )}
```

- [ ] **Step 6: `OverviewView.jsx` — insights**

Junto de `INS_COLOR` acrescentar `const INS_ICON = { alert: 'bell', warn: 'bell', good: 'check', info: 'sparkle' };`. Substituir o `insights.map((ins) => (...))` por:

```jsx
          {insights.map((ins) => {
            const tone = INS_COLOR[ins.tone] || 'var(--primary)';
            return (
              <div key={ins.id} className="cd" style={{ padding: '10px 12px', borderLeft: '3px solid ' + tone }}>
                <div className="rw" style={{ gap: 10, alignItems: 'center' }}>
                  {ins.subject ? (
                    <MerchantLogo text={ins.subject.desc} cat={ins.subject.cat} size={36} bdg={state.bdg} />
                  ) : (
                    <span className="cat" style={{ width: 36, height: 36, background: 'color-mix(in srgb, ' + tone + ' 14%, transparent)', color: tone }} aria-hidden="true">
                      <Icon name={INS_ICON[ins.tone] || 'sparkle'} size={18} />
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ins.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ins.long || ins.detail}>
                      {ins.detail}
                    </div>
                  </div>
                  {ins.dismissId && (
                    <button
                      type="button"
                      onClick={() => {
                        actions.dismissAnomaly(ins.dismissId);
                        toast('Aviso dispensado', 'success');
                      }}
                      aria-label="Está certo, dispensar aviso"
                      title="Está certo"
                      className="icon-btn"
                      style={{ width: 32, height: 32, color: 'var(--success)', flexShrink: 0 }}
                    >
                      <Icon name="check" size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
```

- [ ] **Step 7:** `npx vitest run src/views/overviewCompact.test.jsx src/lib/pulse.test.js src/lib/anomalies.test.js src/views/views.render.test.jsx` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/anomalies.js src/lib/pulse.js src/lib/pulse.test.js src/views/OverviewView.jsx src/views/overviewCompact.test.jsx
git commit -m "feat(resumo): fecho do mês em tiles e insights compactos com logo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 20: Recorrentes — tiles, datas curtas e sugestões com logo

**Files:**
- Modify: `src/views/RecurringView.jsx` (hero, subtítulo da linha, estado vazio, sugestões)
- Modify: `src/modals/RecModal.jsx:52-64` (aceitar `payload.prefill`)
- Test: `src/views/recurringCompact.test.jsx`

**Interfaces:**
- Consumes: `StatTiles`, `BrandMark`, `resolveBrand`, `Icon`.
- Produces: `open('rec', { prefill: { name, cat } })` abre o modal com nome e categoria preenchidos.

- [ ] **Step 1: Teste**

```jsx
// src/views/recurringCompact.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import RecurringView from './RecurringView.jsx';
import RecModal from '../modals/RecModal.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('Recorrentes compacto', () => {
  it('resumo em três tiles e sem a frase longa', async () => {
    const { container } = await renderWithStore(<RecurringView />, { fixture: richFixture() });
    expect(container.querySelectorAll('.tile').length).toBe(3);
    expect(screen.getByText('por mês')).toBeTruthy();
    expect(screen.getByText('por ano')).toBeTruthy();
    expect(screen.queryByText(/subscrições ·/)).toBeNull();
    expect(screen.queryByText(/daqui a/)).toBeNull();
  });
  it('com menos de 3 recorrentes sugere marcas e o toque pré-preenche o modal', async () => {
    await renderWithStore(<><RecurringView /><RecModal /></>, { fixture: richFixture() });
    const sug = screen.getByRole('button', { name: 'Adicionar Netflix' });
    await act(async () => { fireEvent.click(sug); });
    expect(screen.getByLabelText('Nome').value).toBe('Netflix');
  });
  it('com 3 ou mais recorrentes não há sugestões', async () => {
    const fx = richFixture();
    fx.recurring = fx.recurring.concat([{ id: 'r3', name: 'Seguro', amount: 20, day: 10, cat: 'seg' }]);
    await renderWithStore(<RecurringView />, { fixture: fx });
    expect(screen.queryByRole('button', { name: /^Adicionar / })).toBeNull();
  });
});
```


- [ ] **Step 2:** `npx vitest run src/views/recurringCompact.test.jsx` → FAIL.

- [ ] **Step 3: `RecModal.jsx` — prefill**

No `useEffect` de seed, entre o ramo `if (id) {...}` e `setDraft(EMPTY);`:

```jsx
    const prefill = payload && typeof payload === 'object' && payload.prefill ? payload.prefill : null;
    if (prefill) {
      setDraft({ ...EMPTY, name: prefill.name || '', cat: prefill.cat || 'sub' });
      return;
    }
```

- [ ] **Step 4: `RecurringView.jsx`**

Imports:

```jsx
import StatTiles from '../components/StatTiles.jsx';
import MerchantLogo, { BrandMark } from '../components/MerchantLogo.jsx';
import Icon from '../components/Icon.jsx';
import { resolveBrand } from '../lib/brands.jsx';
```

No topo do ficheiro:

```jsx
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Marcas que quase toda a gente tem; aparecem como sugestão quando a lista é curta.
const SUGGESTIONS = [
  { id: 'netflix', name: 'Netflix', cat: 'sub' },
  { id: 'spotify', name: 'Spotify', cat: 'sub' },
  { id: 'edp', name: 'EDP', cat: 'cas' },
  { id: 'meo', name: 'MEO', cat: 'tel' },
  { id: 'vodafone', name: 'Vodafone', cat: 'tel' },
  { id: 'nos', name: 'NOS', cat: 'tel' },
];

function Suggestions({ recurring, open }) {
  const have = new Set(recurring.map((r) => resolveBrand(r.name)).filter(Boolean));
  const list = SUGGESTIONS.filter((s) => !have.has(s.id));
  if (recurring.length >= 3 || list.length === 0) return null;
  return (
    <div className="cd" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <div className="lb" style={{ marginBottom: 4 }}>Costumas ter?</div>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Toca para adicionar com o nome e a categoria já preenchidos.</div>
      <div className="sugg">
        {list.map((s) => (
          <button key={s.id} type="button" aria-label={'Adicionar ' + s.name} onClick={() => open('rec', { prefill: { name: s.name, cat: s.cat } })}>
            <BrandMark id={s.id} size={20} radius={6} title={s.name} />
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Estado vazio: acrescentar `<Suggestions recurring={recurring} open={open} />` logo a seguir ao `<div className="empty">…</div>` (dentro do mesmo `div.fadeUp`).

Hero: substituir o `<div className="cd" style={{ ..., background: 'var(--primary)', color: '#fff' ... }}>…</div>` por:

```jsx
      <div style={{ marginBottom: 12 }}>
        <StatTiles
          items={[
            { key: 'mes', value: fc(total), label: 'por mês' },
            { key: 'ano', value: fc(yearly), label: 'por ano' },
            { key: 'pend', value: fc(pendingTotal), label: 'por pagar', color: pendingTotal > 0 ? 'var(--warning)' : 'var(--success)' },
          ]}
        />
      </div>
      <Suggestions recurring={recurring} open={open} />
```

Linha: substituir o subtítulo `{bI ? bI.nm : '—'} &middot; dia {nextDay}{paidThisMonth...}` por:

```jsx
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>{bI ? bI.nm : '—'}</span>
                  <span aria-hidden="true">·</span>
                  <Icon name="calendar" size={11} />
                  <span>{next.getDate() + ' ' + MONTHS_SHORT[next.getMonth()]}</span>
                  {!paidThisMonth.has(r.id) && dleft <= 3 && <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{dleft === 0 ? 'hoje' : dleft === 1 ? 'amanhã' : 'em ' + dleft + ' dias'}</span>}
                </div>
```

(O `MerchantLogo` já está na linha desde a Task 3.)

- [ ] **Step 5:** `npx vitest run src/views/recurringCompact.test.jsx src/views/logosLists.test.jsx src/modals/modals.render.test.jsx src/views/views.render.test.jsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/RecurringView.jsx src/modals/RecModal.jsx src/views/recurringCompact.test.jsx
git commit -m "feat(recorrentes): tiles, datas curtas e sugestões com logo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 21: Despesas — resultados agrupados por dia e chip "transitado" curto

**Files:**
- Modify: `src/views/ExpensesView.jsx:246-300` (resultados de pesquisa), `:655-660` (chip transitado)
- Test: `src/views/expensesDays.test.jsx`

- [ ] **Step 1: Teste**

```jsx
// src/views/expensesDays.test.jsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderWithStore } from '../test/renderWithStore.jsx';
import { richFixture } from '../test/fixtures.js';
import ExpensesView from './ExpensesView.jsx';

vi.mock('../firebase/client.js', () => ({
  auth: null, db: null, IS_FILE: false, initError: null,
  onAuth: () => () => {}, setAuthPersistenceLocal: () => Promise.resolve(),
  signInGoogle: () => Promise.resolve(), signOutUser: () => Promise.resolve(),
  signInEmail: () => Promise.resolve(), registerEmail: () => Promise.resolve(),
  getIdToken: () => Promise.resolve(null),
  loadUserDoc: () => Promise.resolve(null), saveUserDoc: () => Promise.resolve(),
}));
vi.mock('../firebase/data.js', () => ({
  loadUserData: () => Promise.resolve(null),
  syncUserData: () => Promise.resolve(),
  computeDiff: () => ({ upserts: [], deletes: [], root: null }),
  SUBCOLLECTIONS: {},
}));

afterEach(() => cleanup());

describe('Despesas: pesquisa agrupada por dia', () => {
  it('mostra cabeçalhos de dia e tira a data ISO de cada linha', async () => {
    const { container } = await renderWithStore(<ExpensesView />, { fixture: richFixture() });
    await act(async () => {
      fireEvent.change(screen.getAllByPlaceholderText(/Pesquisar/)[0], { target: { value: 'pingo' } });
    });
    expect(container.querySelectorAll('.day-lb').length).toBeGreaterThan(1);
    expect(screen.getByText('Hoje')).toBeTruthy();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/views/expensesDays.test.jsx` → FAIL.

- [ ] **Step 3: Implementar**

No topo de `ExpensesView.jsx` (fora do componente):

```jsx
// "Hoje" / "Ontem" / "20 ago" para os cabeçalhos de dia da pesquisa.
function dayLabel(iso, todayIso) {
  if (!iso) return '—';
  if (iso === todayIso) return 'Hoje';
  const t = new Date(todayIso);
  t.setDate(t.getDate() - 1);
  const y = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  if (iso === y) return 'Ontem';
  return fmDateShort(iso);
}
function groupByDay(rows) {
  const out = [];
  rows.forEach((row) => {
    const d = row.x.date || '';
    const last = out[out.length - 1];
    if (last && last.date === d) last.items.push(row);
    else out.push({ date: d, items: [row] });
  });
  return out;
}
```

Acrescentar `todayISO` ao import já existente de `../lib/format.js` (fica `import { fm, normalizeStmtDate, fmDateShort, todayISO } from '../lib/format.js';`) e acrescentar `import Icon from '../components/Icon.jsx';`.

Nos resultados, substituir `sorted.map(({ x }) => { ... })` por:

```jsx
          groupByDay(sorted).map((g) => (
            <div key={g.date || 'sem-data'}>
              <div className="day-lb">{dayLabel(g.date, todayISO())}</div>
              {g.items.map(({ x }) => {
                const b = bdg.find((bb) => bb.id === x.cat);
                return (
                  /* … o mesmo JSX da linha que já existia, sem alterações … */
                );
              })}
            </div>
          ))
```

e, dentro da linha, trocar o subtítulo `{(b ? b.nm : '-') + ' · ' + (x.date || '') + (x.acct ? ' · ' + x.acct : '')}` por `{(b ? b.nm : '-') + (x.acct ? ' · ' + x.acct : '')}`.

Chip "transitado" (~655): substituir o `<span style={{ fontSize: 9, ... }}>{(r.carried > 0 ? '+' : '') + fm(r.carried)} transitado</span>` por:

```jsx
<span
  title={'Transitado do mês anterior: ' + (r.carried > 0 ? '+' : '') + fm(r.carried)}
  aria-label={'Transitado do mês anterior: ' + (r.carried > 0 ? '+' : '') + fm(r.carried)}
  style={{ fontSize: 9, fontWeight: 700, color: r.carried > 0 ? 'var(--success)' : 'var(--signal)', background: r.carried > 0 ? 'var(--success-soft)' : 'var(--signal-soft)', padding: '1px 6px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 3 }}
>
  <Icon name="recurring" size={9} />
  {(r.carried > 0 ? '+' : '') + fm(r.carried)}
</span>
```



- [ ] **Step 4:** `npx vitest run src/views/expensesDays.test.jsx src/views/logosLists.test.jsx src/views/views.render.test.jsx src/test/flows.test.jsx` → PASS. Se `flows.test.jsx` procurar a data ISO numa linha de pesquisa, trocar por `getByText('Hoje')`.

- [ ] **Step 5: Commit**

```bash
git add src/views/ExpensesView.jsx src/views/expensesDays.test.jsx
git commit -m "feat(despesas): resultados agrupados por dia e chip transitado curto

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 22: Fecho da fatia E

- [ ] `npm test` → verde. `npm run build` → ok. Layout-check → 0 problemas. `git push origin react`.

---

## Fatia F — QA manual

### Task 23: `testes.html` — suite T45

**Files:**
- Modify: `testes.html` (array de suites, a seguir a T44; `.meta-row` com data e contagem)

- [ ] **Step 1:** Localizar o fim da suite T44: `grep -n "id: 'T44'" testes.html` e o fecho do seu array `tests`. Inserir a seguir:

```js
  {
    id: 'T45',
    title: 'Visual: logos, avatares e ícones',
    tests: [
      { id: 'T45.1', title: 'Logo do comerciante nas Despesas', steps: ['Importar ou criar uma despesa "COMPRA 4174 PINGO DOCE LISBOA" (cat. Supermercado)', 'Pesquisar "pingo"'], expect: 'A linha mostra o logo verde "PD" com o carrinho da categoria como badge no canto; a data não aparece na linha, só no cabeçalho do dia (Hoje / Ontem / dd mmm).' },
      { id: 'T45.2', title: 'Sem marca cai para categoria e depois para inicial', steps: ['Criar despesa "Padaria Central" com categoria', 'Criar outra sem categoria conhecida'], expect: 'Com categoria: círculo da categoria. Sem categoria: inicial "P" num círculo colorido, sempre com a mesma cor para o mesmo nome.' },
      { id: 'T45.3', title: 'Logo do banco nas contas', steps: ['Resumo → Disponível', 'Transferências'], expect: 'ActivoBank, Trade Republic, Revolut, XTB com logo; banco desconhecido com inicial.' },
      { id: 'T45.4', title: 'Cartão como objeto', steps: ['Cartões → Editar → preencher últimos 4 dígitos "2872" e rede Mastercard → Guardar'], expect: 'Cartão escuro com logo do banco, "•••• •••• •••• 2872", círculos Mastercard e dívida em número grande. Sem dígitos mostra "••••".' },
      { id: 'T45.5', title: 'Cabeçalho com avatar e saudação', steps: ['Entrar com Google', 'Abrir a app em mobile'], expect: '"Olá, <primeiro nome>" com a foto da conta Google; sem foto, iniciais. O chip de sync mostra só o ponto quando está guardado.' },
      { id: 'T45.6', title: 'Avatares nos grupos', steps: ['Grupos → lista', 'Abrir grupo → Saldos'], expect: 'Card do grupo com avatares sobrepostos dos membros; plano de acertos com avatar de quem paga e de quem recebe; faixa Grupos no Resumo com os avatares.' },
      { id: 'T45.7', title: 'Meta com ícone e chip de estado', steps: ['Metas → Nova meta → escolher ícone guarda-sol e cor', 'Guardar'], expect: 'Card com o ícone na cor escolhida, anel e chip "a começar" / "no ritmo" / "atrasada" / "concluída". O aviso longo só aparece ao passar o rato / manter premido no chip. "Progresso global" aparece só na faixa do topo.' },
      { id: 'T45.8', title: 'Categoria personalizada com ícone e cor', steps: ['Mais → Gerir categorias → Nova "Viagens" → ícone avião, cor laranja → Adicionar', 'Nova despesa'], expect: 'A grelha mostra "Viagens" com avião laranja. Compras mostra saco; Supermercado mostra carrinho.' },
      { id: 'T45.9', title: 'Logo ao escrever a descrição', steps: ['Nova despesa → escrever "Netflix"'], expect: 'O logo aparece à esquerda dentro do campo enquanto a descrição bate numa marca; desaparece se apagares.' },
      { id: 'T45.10', title: 'Resumo compacto', steps: ['Ter uma anomalia (ex.: despesa 8× acima do habitual)', 'Nos primeiros dias do mês, ver o Fecho do mês'], expect: 'Insight numa linha: logo, título curto ("Fora do padrão"), detalhe numa linha e botão ✓ (sem texto "Está certo"). Fecho do mês com 3 tiles com ícone e valor, sem a frase "Onde foi".' },
      { id: 'T45.11', title: 'Recorrentes com tiles e sugestões', steps: ['Mais → Recorrentes com menos de 3 entradas', 'Tocar em "Netflix" nas sugestões'], expect: 'Três tiles (por mês, por ano, por pagar). Linhas com logo e "28 set" com ícone de calendário. A sugestão abre o modal com nome e categoria preenchidos. Com 3 ou mais recorrentes as sugestões desaparecem.' },
      { id: 'T45.12', title: 'Investimentos com logo do ativo', steps: ['Mais → Investimentos'], expect: 'VWCE com Vanguard, AAPL com Apple, MSFT com Microsoft; corretora como badge; ganho/perda como chip colorido; a linha "20 @ 100 → 110" só no modal da posição.' },
      { id: 'T45.13', title: 'Sem pedidos externos', steps: ['Abrir DevTools → Network', 'Navegar por Despesas, Cartões, Recorrentes, Investimentos'], expect: 'Nenhum pedido a domínios de logos/favicons. Os logos vêm do bundle.' },
      { id: 'T45.14', title: 'Temas e larguras', steps: ['Alternar tema claro/escuro', 'Testar a 320px e 390px'], expect: 'Logos, avatares, cartão e tiles legíveis nos dois temas; sem scroll horizontal (node scripts/layout-check.mjs limpo).' },
    ],
  },
```

- [ ] **Step 2:** Atualizar a `.meta-row` (data para `2026-09-02` e a contagem total de testes = anterior + 14). Localizar com `grep -n "meta-row" testes.html`.

- [ ] **Step 3:** Abrir `testes.html` no browser (`open testes.html`) e confirmar que a suite T45 aparece com 14 testes e o contador bate certo.

- [ ] **Step 4: Commit + push**

```bash
git add testes.html
git commit -m "docs(qa): suite T45 para logos, avatares e ícones

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin react
```

---

## Verificação final (depois da Task 23)

- [ ] `npm test` verde, `npm run build` ok, `node scripts/layout-check.mjs` limpo.
- [ ] Screenshots de Resumo, Despesas (pesquisa), Cartões, Recorrentes, Metas, Grupos, Investimentos a 390px, tema claro e escuro, com `node scripts/shot.mjs "http://localhost:5199/dev.html?tab=<tab>" out.png` (vite na porta 5199) — comparar com o artifact de conceito.
- [ ] Preview Vercel do branch `react` aberta em telemóvel real: cabeçalho com foto Google, sync chip discreto, sem overflow.
