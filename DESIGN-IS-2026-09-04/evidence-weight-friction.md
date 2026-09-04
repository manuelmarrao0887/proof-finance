# Evidence — weight & friction (bytes, requests, TTI, CLS, animation, modals)

Read-only evidence gathering. No scores, no recommendations. All numbers below were measured on 2026-09-04 against branch `react`, working tree as committed except for a `dist/` rebuild (gitignored).

## 1. Sources consulted / commands run (exact)

- `cat package.json`
- `cat vite.config.js`
- `cat index.html` / `cat dev.html`
- `cat src/devPreview.jsx`, `cat src/main.jsx`, `grep -n "^import\|lazy(" src/components/Shell.jsx`
- `grep -o '{' src/styles/tokens.css | wc -l`; `wc -l src/styles/tokens.css`
- `grep -n "font-family\|font-display\|system-ui\|--font" src/styles/tokens.css`; `grep -n -- "--mono" src/styles/tokens.css`
- `grep -rn "serviceWorker\|service-worker\|workbox\|registerType\|sw\.js\|caches\.open\|CACHE_NAME" -i .` (excl. node_modules/dist/.git) — no hits
- `ls public`; `cat public/manifest.json`
- `npm run build` (Vite production build → `dist/`)
- `cat dist/index.html`
- `ls -la dist/assets`; per-file `wc -c` (raw) and `gzip -c file | wc -c` (gzip) for every file in `dist/assets`
- `grep -o 'https\?://[a-zA-Z0-9._-]*' dist/index.html | sort -u`
- `grep -rln "firebase/client\|firebase/data" src` and `grep -rln "from 'firebase" src` to trace which module pulls in the `firebase` chunk
- `curl -sI` / `curl -s` against `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap` (font `@font-face` inspection)
- `cat src/firebase/client.js` (Firebase config, `initializeFirestore` cache options)
- `cat vercel.json`
- Dev server: `npx vite --port 5199` (background), verified with `curl -s -o /dev/null -w "%{http_code}" http://localhost:5199/dev.html`
- Prod-build server: `npx vite preview --port 5200` (background), verified against `http://localhost:5200/index.html?demo=1`
- Puppeteer-core 25.8.0 via Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, headless, viewport 390×844 @2x DPR, custom Node scripts (written to the session scratchpad, not the repo) covering:
  - network-request capture (`request`/`requestfailed`/`response` listeners) on `dev.html?tab=overview` until `networkidle0`
  - `PerformanceObserver` for `layout-shift` (buffered) and `largest-contentful-paint`, injected via `page.evaluateOnNewDocument`
  - `document.getAnimations()` sampled at ~t+1s and ~t+3s after `window.__PROOF_READY__ === true`
  - DOM queries for `.sheet-overlay`, `[role="dialog"]`, `[class*="toast" i]`, `[class*="badge" i]`, `[class*="dot" i]`, `.sync-chip`, `.cd` (with inline-style `border-left:` filter), `.lb`
  - currency-number regex scan of `main` text content, restricted to elements whose bounding rect intersects `[0, 844)` for the viewport count
  - CDP session (`page.target().createCDPSession()`) → `Emulation.setCPUThrottlingRate` (rate 4) and `Network.emulateNetworkConditions` (150 ms latency, 4 Mbps down / 3 Mbps up) for the throttled TTI-proxy runs, 3 runs each for throttled/unthrottled against `http://localhost:5200/index.html?demo=1`
- `git status --short` (before and after) to confirm only the pre-existing untracked files remain and `dist/` produced no tracked diff
- Cleanup: `pkill -f "vite --port 5199"`, `pkill -f "vite preview --port 5200"`

## 2. Findings

### 2.1 Initial JS bytes (production build, `npm run build`)

Every file in `dist/assets`, raw bytes (`wc -c`) and gzip bytes (`gzip -c file | wc -c`), smallest to largest:

| file | raw B | gzip B |
|---|---:|---:|
| budget-Dh-CARg7.js | 540 | 353 |
| Buttons-DcmmcXym.js | 704 | 353 |
| scrollLock-CmkKEf68.js | 934 | 476 |
| PatchNotesSheet-Kx-V5dgS.js | 1,237 | 696 |
| reports-CNLgvHKp.js | 1,320 | 669 |
| BalanceHistorySheet-ChBdZu25.js | 1,399 | 790 |
| MonthNav-BoyfU7ZD.js | 1,401 | 827 |
| balances-D27uM7PX.js | 1,643 | 959 |
| months-b-7Si77f.js | 1,987 | 934 |
| PositionModal-h5gDEK6p.js | 2,325 | 1,271 |
| TransfersView-D-Dwel1a.js | 2,479 | 1,146 |
| ChartsView-BFH0DjKl.js | 2,826 | 1,221 |
| TransferModal-CRzj0SNe.js | 2,989 | 1,321 |
| HousingModal-BiPccPml.js | 3,151 | 1,488 |
| RecModal-Bwi6KlYu.js | 3,274 | 1,436 |
| Sheet-C11sGirk.js | 3,456 | 1,503 |
| InvestmentsView-B-Nx5okS.js | 3,656 | 1,371 |
| RulesModal-CwS2BMbp.js | 3,779 | 1,677 |
| CardPayModal-mcdHm3kY.js | 3,926 | 1,637 |
| PersonSheet-Cbl51hC5.js | 4,214 | 1,742 |
| GoalModal-Cb11rMNg.js | 4,477 | 1,712 |
| BalanceLockSheet-B8_AMfAV.js | 4,549 | 2,181 |
| AssistantSheet-HBgWojW1.js | 4,739 | 2,245 |
| IncomeModal-Dwq_aVdK.js | 5,053 | 2,013 |
| RecurringView-BQff8Gny.js | 5,119 | 2,098 |
| IncomesView-Cxd3FcSg.js | 5,142 | 1,983 |
| SettleSheet-BhmV9n4O.js | 5,152 | 2,100 |
| ActionSheet-B7jrUMPo.js | 5,197 | 1,601 |
| BalanceUpdateSheet-DiW6YONf.js | 5,234 | 2,019 |
| CatManagerModal-CggDeJXQ.js | 5,377 | 2,157 |
| ReportView-CrAVMJT4.js | 5,478 | 1,964 |
| GoalsView-BKR0xzF_.js | 6,066 | 2,459 |
| CardsView-BHZARxmo.js | 6,254 | 2,214 |
| MoreMenu-D4XRB3t5.js | 6,472 | 2,134 |
| AcctModal-zNdy71Hp.js | 6,622 | 2,418 |
| CalendarView-O8BTmWrG.js | 6,709 | 2,063 |
| TaxView-CAWHaU-E.js | 7,485 | 2,642 |
| ai-Ccv2qCi3.js | 8,034 | 3,779 |
| LoanView-CT11Gy3y.js | 8,081 | 2,607 |
| GroupSheet-DS2Ala9s.js | 8,436 | 3,054 |
| AddExpenseSheet-DLsA1dMo.js | 8,863 | 3,216 |
| GroupExpenseSheet-iCbLL2bv.js | 10,473 | 3,896 |
| SettingsSheet-BBmLgRyX.js | 13,803 | 4,364 |
| GroupsView-acOM_wFP.js | 16,101 | 4,544 |
| **index-BwJsBmjK.css** | 20,009 | 5,181 |
| AIView-xVQY8Dnh.js | 21,428 | 6,336 |
| ExpensesView-D6W_nuFZ.js | 21,903 | 6,353 |
| ImportStatementSheet-De_YL3uF.js | 22,074 | 8,124 |
| markdown-f-clNg0c.js | 25,320 | 8,392 |
| **index-DAuqdHhn.js (entry)** | 292,731 | 93,301 |
| **xlsx-BWn1rPqr.js** | 365,691 | 122,455 |
| **firebase-CCZ3rJH_.js** | 758,229 | 188,658 |

52 files total in `dist/assets` (51 JS chunks + 1 CSS file). Sum of everything in `dist/assets`: raw 1,743,541 B (1,702.6 KiB), gzip 522,133 B (509.8 KiB).

**Entry chunk:** `index-DAuqdHhn.js` (bundles `main.jsx`, `App.jsx`, `store/store.jsx`, `Shell.jsx`, `OverviewView.jsx`, and everything imported eagerly).

**Firebase chunk:** `firebase-CCZ3rJH_.js` — the largest file in `dist/assets` (758,229 B raw / 188,658 B gzip). Produced by the explicit `manualChunks: { firebase: ['firebase/app','firebase/auth','firebase/firestore'] }` in `vite.config.js`. It is **not** lazy: `src/store/store.jsx` (imported eagerly from `App.jsx` → `main.jsx`) imports `src/firebase/client.js` and `src/firebase/data.js`, both of which import from `firebase/*` at module top level. `dist/index.html` reflects this — the firebase chunk is referenced via `<link rel="modulepreload" crossorigin href="./assets/firebase-CCZ3rJH_.js">`, i.e. fetched eagerly alongside the entry script, not on demand.

**Lazy view chunks** (per `grep -n "lazy(" src/components/Shell.jsx`): `ExpensesView`, `GoalsView`, `GroupsView`, `CalendarView`, `IncomesView`, `RecurringView`, `ChartsView`, `LoanView`, `AIView`, `ReportView`, `InvestmentsView`, `TransfersView`, `CardsView`, `TaxView` — 14 of 15 views are `lazy(() => import(...))`. Only `OverviewView` (the Resumo tab) is a static top-level import in `Shell.jsx` (`import OverviewView from '../views/OverviewView.jsx'`) and therefore ships inside the entry chunk rather than as a separate file. 27 of the 28 modals listed in `Shell.jsx` are also `lazy()`-wrapped (all except none — every modal entry in the `MODALS` map uses `lazy()`).

**xlsx chunk** (`xlsx-BWn1rPqr.js`, 365,691 B raw / 122,455 B gzip): per the comment in `vite.config.js` ("xlsx (~400kB) only loads when the AI/import features that use it open (those views/modals are lazy)"), this is not part of the first-paint load — it is pulled in only by the lazy `ImportStatementSheet`/`AIView` code paths.

**Largest chunk overall:** `firebase-CCZ3rJH_.js` (758,229 B raw / 188,658 B gzip), ahead of `xlsx-BWn1rPqr.js` (365,691 B / 122,455 B) and the entry `index-DAuqdHhn.js` (292,731 B / 93,301 B).

**What `dist/index.html` loads for first paint of the Resumo tab** (traced from its `<script type="module">` / `<link rel="modulepreload">` / `<link rel="stylesheet">` tags):
```html
<script type="module" crossorigin src="./assets/index-DAuqdHhn.js"></script>
<link rel="modulepreload" crossorigin href="./assets/firebase-CCZ3rJH_.js">
<link rel="stylesheet" crossorigin href="./assets/index-BwJsBmjK.css">
```
Sum of these three files:
- **Raw: 1,070,969 B = 1,045.9 KiB ≈ 1.07 MB**
- **Gzip: 287,140 B = 280.4 KiB ≈ 287 KB**

(`xlsx` is excluded — it is not referenced by any tag in `dist/index.html` and is not modulepreloaded.)

### 2.2 CSS bytes

`dist/assets/index-BwJsBmjK.css`: raw 20,009 B (19.5 KiB), gzip 5,181 B (5.06 KiB). (Vite's own build-time report says 20.01 kB / gzip 5.17 kB — the 10-byte gzip delta is due to gzip level/library differences between Vite's reporter and `gzip -c`.) This is the only CSS file emitted; it is a single bundle (tokens.css plus all component/view CSS Vite collected).

`src/styles/tokens.css`: 315 lines; `grep -o '{' src/styles/tokens.css | wc -l` → **185** occurrences of `{` (includes rule blocks, at-rule blocks such as `@keyframes`/`@media`, and their nested keyframe-step blocks — this is a literal brace count, not a deduplicated selector-rule count).

### 2.3 Network request count — `dev.html?tab=overview` (dev mode, unbundled)

Puppeteer against `http://localhost:5199/dev.html?tab=overview`, counting `request` events until `networkidle0` plus `window.__PROOF_READY__ === true`:

- **Total requests: 54** (1 `document`, 52 `script`, 1 `other`)
- **Requests to non-localhost hosts: 0** — `dev.html` (unlike `index.html`) has no Google Fonts `<link>` and makes no Firebase calls (Firebase writes are disabled via `window.__PROOF_NO_SYNC__ = true` in `devPreview.jsx`, and the harness never calls Firebase client code). This count is dev-mode-specific: Vite serves every module as a separate unbundled ESM file (`react.js`, `react-dom_client.js`, `src/store/store.jsx`, `src/styles/tokens.css`, etc., each as its own request), so 54 is not representative of production request count.

From static analysis of `dist/index.html` (`grep -o 'https\?://[a-zA-Z0-9._-]*' dist/index.html | sort -u`), the only external hosts referenced are:
```
https://fonts.googleapis.com
https://fonts.gstatic.com
```
No analytics, telemetry, or other third-party script/link tags are present in `dist/index.html`. Firebase project config (`personal-finance-9c979`) is hard-coded inside `src/firebase/client.js` (bundled into the JS, not referenced as a `<script src>` host in the HTML), so its hosts (e.g. `identitytoolkit.googleapis.com`, `firestore.googleapis.com`) don't show up in the HTML host scan — they'd only appear as runtime XHR/fetch calls once Firebase Auth/Firestore actually contact the network. Measuring `http://localhost:5200/index.html` (production build, real Firebase config, no `?demo=1`, cold browser profile with no stored auth session) with `networkidle0` + 2.5 s extra wait showed **0 Firebase network calls** — only the 2 font requests. This matches `onAuthStateChanged` resolving to `null` synchronously from local absence of any cached session, without a network round trip, before showing the login screen. A warm/logged-in session was not tested (out of scope — would require real credentials) and might show different host traffic.

### 2.4 Fonts

Declared in `dist/index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```
One web font family requested: **Plus Jakarta Sans**, 5 weights (400/500/600/700/800) × 4 Unicode-range subsets (cyrillic-ext, vietnamese, latin-ext, latin) = 20 `@font-face` declarations in the Google Fonts CSS response (`curl` + `grep -c "font-weight"` → 20).

`font-display: swap` — **present**, quoted directly from the fetched Google Fonts CSS (`curl -s "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"`):
```css
@font-face {
  font-family: 'Plus Jakarta Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(...) format('woff2');
  ...
}
```

Measured bytes via Puppeteer response capture, loading `http://localhost:5200/index.html?demo=1` to `networkidle0` + scroll-to-bottom + 1.5 s settle (to force any below-the-fold text to paint and trigger any remaining font subsets):
- `fonts.googleapis.com/css2?...` stylesheet: 8,460 B (gzip-encoded on the wire, per `content-encoding: gzip` response header)
- **Exactly 1** `.woff2` file downloaded: `https://fonts.gstatic.com/s/plusjakartasans/v12/LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko20yygg_vb.woff2`, 27,272 B
- **Total font-related network bytes: 35,732 B** (8,460 + 27,272), across 2 requests, despite 5 distinct `wght` values requested and used in the app's CSS.

Reason (confirmed by `curl`-diffing the CSS response for weights 400/500/600/700/800 within the "latin" unicode-range block): all 5 weight declarations for a given subset point to the **identical** woff2 URL — Google Fonts serves Plus Jakarta Sans as a variable font under a single file when multiple discrete `wght` values are requested via `:wght@400;500;600;700;800`, so the browser fetches one file and instances every weight from it rather than 5 separate static files.

System-font fallback — **declared**, quoted from `src/styles/tokens.css:59-60`:
```css
--font:'Plus Jakarta Sans','Inter',-apple-system,'Helvetica Neue',sans-serif;
--mono:'Plus Jakarta Sans','Inter',-apple-system,sans-serif;
```
Both the body-text and mono/numeric-tabular font stacks resolve to the same actual family (Plus Jakarta Sans) with the same fallback chain; `'Inter'` is listed as a fallback but is never fetched (no such `<link>`/`@font-face` exists) so it is a no-op unless a system-installed Inter is present, before falling through to `-apple-system`/`Helvetica Neue`/`sans-serif`.

### 2.5 Time-to-interactive proxy (production build)

`index.html` requires Firebase Auth in its normal flow, so it was measured via **`index.html?demo=1`** — a code path documented in `src/App.jsx` ("Demo mode: `?demo=1` ... renders the app with seed data and no auth. `currentUser` stays null ... nothing is saved") that renders `<Shell/>` directly, skipping the `loading`/`login` auth-gate states. This is noted as the substitution made.

Served via `npx vite preview --port 5200` (serves the built `dist/` output). Puppeteer, viewport 390×844 @2x, 3 runs each:

- `domContentLoadedEventEnd` / `loadEventEnd` from `performance.getEntriesByType('navigation')[0]`
- Interactive proxy: elapsed ms from navigation start to `page.waitForSelector('.cd')` resolving (first Resumo-tab content card painted) — used because `window.__PROOF_READY__` is **not** set anywhere in the production build (`grep -rn "__PROOF_READY__" src/` shows it is only assigned in `src/devPreview.jsx`, which is excluded from the Vite build). Confirmed at runtime: `typeof window.__PROOF_READY__ !== 'undefined'` evaluated to `false` on every production run.
- LCP via `PerformanceObserver({type:'largest-contentful-paint', buffered:true})`, last entry's `renderTime || loadTime`

**Throttled** (CDP `Emulation.setCPUThrottlingRate` rate 4 + `Network.emulateNetworkConditions` 150 ms latency / 4 Mbps down / 3 Mbps up — both APIs applied successfully, confirmed via CDP response, not a fallback):

| run | domContentLoadedEventEnd (ms) | `.cd`-visible proxy (ms) | LCP (ms) |
|---|---:|---:|---:|
| 1 | 951.2 | 1,102 | 1,308 |
| 2 | 951.5 | 1,091 | 1,312 |
| 3 | 959.2 | 1,121 | 1,340 |
| **median** | **951.5** | **1,102** | **1,312** |

**Unthrottled** (same machine, no CPU/network emulation applied):

| run | domContentLoadedEventEnd (ms) | `.cd`-visible proxy (ms) | LCP (ms) |
|---|---:|---:|---:|
| 1 | 185.1 | 220 | 252 |
| 2 | 172.7 | 208 | 240 |
| 3 | 171.8 | 206 | 236 |
| **median** | **172.7** | **208** | **240** |

`loadEventEnd` was numerically equal to `domContentLoadedEventEnd` in every run (both throttled and unthrottled) — expected, since `vite preview` serves all assets from localhost with no additional post-load network activity (no images/fonts fetched from `index.html?demo=1` beyond the module graph already covered by `domContentLoaded`).

**Median TTI-proxy (throttled, CPU 4×/4G-profile network): 1,102 ms**, method = `page.waitForSelector('.cd')` elapsed time from `page.goto` start.

### 2.6 Cumulative Layout Shift proxy

`dev.html?tab=overview`, `PerformanceObserver({type:'layout-shift', buffered:true})` installed via `page.evaluateOnNewDocument` (so it captures shifts from the very first paint), entries with `hadRecentInput` excluded, summed after `window.__PROOF_READY__ === true` + settle:

**CLS-proxy sum: 0.00145** (0.0014511761303654452, reproduced identically across 2 separate runs).

### 2.7 Animation count on idle screen

`document.getAnimations()` on `dev.html?tab=overview`, sampled at ~t+1 s and ~t+3 s after `window.__PROOF_READY__ === true`:

- **t+1s: 3** Animation objects — **t+3s: 3** Animation objects (identical set both times)
- Names/targets: `fadeIn` (on an element with class `fadeIn`), `fadeUp` ×2 (one on an element with classes `hero fadeUp`, one on an element with class `fadeUp`)
- **`playState` for all 3 was `"finished"` at both sample points** — i.e., none was actively animating (running/looping) at t+1s or t+3s; these are one-shot entrance animations (`.fadeUp{animation:fadeUp 0.4s ...}`, `.fadeIn{animation:fadeIn 0.3s ...}` per `src/styles/tokens.css:135-136`) that Chrome keeps as finished `Animation` objects in the list for some time after completion rather than removing them immediately.
- No infinitely-looping animation (`shimmer 1.5s infinite` on `.skel`, `pulse 1.2s infinite` on `.sync-chip.saving .sync-dot`) was present in `getAnimations()` at either sample point, because the rich fixture has already finished loading (no skeleton placeholders) and the sync chip is in `saved` state, not `saving`.

### 2.8 Notifications / modals / badges on initial load

`dev.html?tab=overview`, rich fixture, after `__PROOF_READY__`:

- `.sheet-overlay`: **0**
- `[role="dialog"]`: **0**
- Toasts (`[class*="toast" i]`): 1 matching element in the DOM (`<div class="toast-wrap">`), but its bounding rect is `{w:0,h:0}` and it is not visible — **0 visible toasts**.
- `[class*="dot" i]`: 1 element, `<span class="sync-dot">` (part of `.sync-chip.saved.compact`, text "Guardado"/Saved) — visible, 5×5 px. This is a sync-status indicator, not an alert/notification badge.
- `[class*="badge" i]`: 2 elements, both `<div class="mlogo-badge">` (14×14 px each) — these are small merchant/bank-logo badges on transaction rows, not notification badges.
- `.cd` cards on the Resumo tab: **12 total**.
- Of those 12, **4** carry an explicit `border-left:` in their inline `style` attribute (checked via regex on `el.getAttribute('style')`, not computed style, to exclude the ordinary 1px all-around card border every `.cd` has): "Fecho de agosto..." (`border-left: 3px solid var(--warning)`), "Fora do padrão" (COMPRA Pingo Doce, `border-left: 3px solid var(--signal)`), "Cobrança repetida" (Netflix, `border-left: 3px solid var(--signal)`), "Supermercado +885% vs média" (`border-left: 3px solid var(--signal)`). **Alert-tone card count: 4.**
- Page scroll height at 390×844: **3,546 px** (`document.documentElement.scrollHeight`).
- **Caveat found during measurement:** `src/test/fixtures.js:106` sets `lastSeenPatchVersion: 999` with the code comment "não abrir as Novidades por cima nos testes/screenshots" (don't open Novidades [What's New] over the tests/screenshots). `src/components/Shell.jsx:249-258` auto-opens the `patchNotes` modal on mount for existing users when `hasUnseenNotes(state.lastSeenPatchVersion)` is true. Because the rich fixture deliberately sets a patch version ahead of any real release, this auto-modal is suppressed in the harness. **The 0-modals-on-load finding above is fixture-specific**; a real user session with unseen patch notes would show the `PatchNotesSheet` auto-opened on load.

### 2.9 Cognitive load proxies (Resumo tab, rich fixture)

Currency-number regex scan (`/(?:€\s?-?\d[\d.,\s]*\d|-?\d[\d.,\s]*\d\s?€)/g`) over `main`'s text content:

- Distinct currency-number strings, whole tab: **46** matches (`totalNumbersCount`), including duplicates such as running-balance ticks (e.g. "26\n6984 €" style entries from a chart axis).
- Distinct currency-number strings, first viewport (elements whose bounding rect intersects `y ∈ [0, 844)`): **11** matches — `17 898,02 €`, `18 360 €`, `462 €`, `150,00 €`, `253 €`, `1947 €`, `80 €`, `60 €`, `45 €`, `55,00 €`, `1485 €`.
- Section eyebrows (`.lb` elements): **11**.
- Body word count (`main.textContent`, whitespace-split): **247** words.

### 2.10 Service worker / PWA

- **No `sw.js` and no service-worker registration anywhere in source.** `grep -rn "serviceWorker\|service-worker\|workbox\|registerType\|sw\.js\|caches\.open\|CACHE_NAME" -i` across the whole repo (excl. `node_modules`/`dist`/`.git`) returned **no matches**.
- `public/manifest.json` (a plain Web App Manifest, referenced as `<link rel="manifest" href="manifest.json">` — the file is literally named `manifest.json`, not `manifest.webmanifest`):
```json
{
  "name": "Proof. Finance",
  "short_name": "Finanças",
  "description": "Gestão financeira pessoal",
  "lang": "pt-PT",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a1024",
  "theme_color": "#0a1024",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```
- `index.html` also carries `apple-mobile-web-app-capable`, `mobile-web-app-capable`, and `apple-mobile-web-app-status-bar-style: black-translucent` meta tags, i.e. it is add-to-home-screen/standalone capable, but with no service worker there is no offline cache and no `skipWaiting`/update-prompt mechanism of any kind.
- **Cache strategy:** none at the SW level (there is no SW). The only explicit caching-related code is Firestore's local persistence, quoted from `src/firebase/client.js:69-70`:
```js
_db = initializeFirestore(_app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
```
This is Firestore's IndexedDB-backed offline document cache (data layer), unrelated to caching of the JS/CSS bundle itself.
- `vercel.json` sets security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`) for `/(.*)`  and `Cache-Control: no-store` for `/api/(.*)` only — **no explicit `Cache-Control` directive for `/assets/*` or `/index.html`** is present in `vercel.json`. Actual production response headers for hashed JS/CSS bundles and `index.html` were **not measured** (would require a live Vercel deployment; `vite preview`'s local `Cache-Control: no-cache` on both `index.html` and `/assets/*.js` reflects `vite preview`'s own dev-style server, not Vercel's platform defaults, and is not cited as representative of production).
- **Does this correspond to the memory note's "hard reload after deploy" symptom?** The user's own memory note (`firestore-subcollections.md`) states verbatim: *"ao debugar 'dados não aparecem no Firestore' depois dum deploy, causa nº1 é a PWA/browser a servir o bundle antigo — pedir hard reload (Cmd+Shift+R)"* (when debugging "data doesn't show in Firestore" after a deploy, cause #1 is the PWA/browser serving the old bundle — ask for a hard reload). With no service worker to run an update-check/`skipWaiting` flow, and no confirmed long-lived immutable `Cache-Control` on hashed assets either way, a stale `index.html` (which references the old JS filenames) being served from an installed/standalone home-screen icon or plain browser HTTP cache is consistent with — but not proven by local measurement alone — the described symptom. **This is a plausible-but-unverified cause; the live Vercel response headers were not measured (gap).**

### 2.11 Dev harness 404

Puppeteer on `dev.html?tab=overview`, capturing `requestfailed` events and `response` events with `status >= 400`:

- `requestfailed`: **none**
- `status >= 400`: **1** — `http://localhost:5199/favicon.ico` → **404 Not Found**

Root cause (static): `dev.html` (unlike `index.html`) declares no `<link rel="icon">` tag, so the browser's automatic favicon probe hits the Vite dev server's default 404 for `/favicon.ico`. This is dev-harness-only (`dev.html` is explicitly excluded from the production build per its own comment: `<!-- SÓ DESENVOLVIMENTO: não está no build (vite só empacota index.html). -->`).

## 3. Known gaps

- Font-file byte measurement (§2.4) was taken against `index.html?demo=1` served locally via `vite preview`; the real deployed Vercel origin was not measured, though Google Fonts' own CDN response (fonts.googleapis.com / fonts.gstatic.com) is identical regardless of which origin serves the host page.
- Firebase runtime network traffic (§2.3) was only checked for a cold/anonymous browser profile with no cached auth session; a warm session with a previously-signed-in user (real credentials) was not tested and could add requests to `identitytoolkit.googleapis.com` / `firestore.googleapis.com` on load.
- Production `Cache-Control` headers actually served by Vercel for `dist/assets/*` and `index.html` were not measured — `vite preview`'s local headers (`Cache-Control: no-cache`) are not representative of Vercel's platform defaults and were explicitly not cited as such (§2.10).
- TTI-proxy (§2.5) uses `?demo=1` (`App.jsx`'s documented demo mode) rather than a real authenticated session, since `index.html`'s normal flow requires live Firebase Auth credentials not available to this harness; `window.__PROOF_READY__` is dev-harness-only and was confirmed absent (`undefined`) in the production build, so a DOM-visibility proxy (`.cd` selector) was substituted and the substitution is stated wherever the number is used.
- CPU/network throttling (§2.5) used Chrome DevTools Protocol directly (`Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions`) rather than a `page.emulateCPUThrottling()` convenience method (puppeteer-core 25.8.0's `Page` class does not expose one); both CDP calls returned success (no fallback to unthrottled was needed), reported separately from the unthrottled baseline for comparison.
- All measurements were taken on one local machine/network in one session (not a CI-grade repeated-sampling setup); medians are only over the 3 runs specified by the task, not a larger statistical sample.
- `git status --short` after the build showed no changes beyond the two pre-existing untracked paths present before this session started (`DESIGN-IS-2026-09-04/` and the stray spec markdown file); `dist/` is `.gitignore`d and produced no tracked diff, so nothing was reverted.
