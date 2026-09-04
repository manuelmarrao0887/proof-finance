# 01 — Evidência consolidada

Cinco relatórios de evidência, todos com fontes citadas (ficheiro:linha ou screenshot + região). Só factos; a pontuação está em `02-scorecard.md`.

| Ficheiro | Cobre | Alimenta os princípios |
|---|---|---|
| `evidence-structural-copy.md` | contagens de elementos interativos, profundidade JSX, padrões repetidos (9 caixotes, 9 lápis, 2 implementações de barra), código morto, inventário de navegação (15 destinos, 3 a 1 toque), toques por tarefa (despesa 2, "podes gastar" 0 mas abaixo da dobra, cartão 4, recorrente 3), 9 termos de jargão, 2 rótulos que mentem ("Scan recibo" não digitaliza; "requer API key" vs "não precisas de chave"), 9 formatos de data, acentos em falta | #2 #4 #6 #10 |
| `evidence-visual-a11y.md` | 19 valores de espaçamento e 16 tamanhos de letra sem escala declarada, `--mono` não é mono, radius tokens declarados e não usados, 33+24 cores, contraste calculado (só falha branco sobre primário no escuro, 3,45:1), 79 textos ≤11 px, 17 alvos de toque <44 px, estados (disabled nunca usado; erro só por toast), reduced-motion OK, axe: 1 regra (contraste dos avatares), ordem de foco, sheets com dialog/trap/restore, sem skip link, rótulos por `aria-label` em vez de `<label for>` | #3 #5 #8 |
| `evidence-weight-friction.md` | 287 KB gzip no primeiro paint (Firebase 189 KB eager), 1 fonte variável (36 KB), TTI proxy 1 102 ms com CPU 4× + 4G, CLS 0,001, 0 animações em idle, 12 cartões e 4 de alerta no Resumo, 3 546 px de altura, 46 montantes na tab, sem service worker (explica "hard reload após deploy"), 404 só do favicon do harness | #9 |
| `evidence-heuristics-fintech.md` | 10 heurísticas de Nielsen com 9 observações de severidade 4 (5 defeitos distintos) e 58 de severidade 3; benchmark fintech (Monzo, Revolut, N26, Wise, YNAB, Copilot, Finary) em 12 padrões; HIG/M3; Gestalt; economia comportamental; 3 JTBD; lacunas (estados vazios tapados pelas Novidades, tema escuro não aplicado no harness) | #1 #2 #4 #5 #6 #7 #8 #10 |
| `evidence-web-guidelines.md` | 48 findings contra as Vercel Web Interface Guidelines: apagar despesa e meta sem qualquer confirmação, toggle sem foco visível, `confirm()` nativo em 11 sítios, sem skip link, sem deep-linking, `key={i}`, secções sem `<h2>`, `transition:all`, `width` animada | #8 #4 |

## Verificações do orquestrador (para além dos relatórios)
- `theme=dark` no harness deixa `data-theme="light"`: `devPreview.jsx:28` hidrata sem chamar `applyTheme` (só `store.jsx:409,418,505` o fazem). Artefacto do harness, não bug de produção. Todas as capturas "dark" alguma vez tiradas por este harness são inválidas.
- `Shell.jsx:255` passa `state` sem `currentUser` a `isNewUser`; `isPreviewMode(state) = !(state && state.currentUser)` (`finance.js:142`) devolve `true`, logo `isNewUser` é sempre `false` e o changelog abre para utilizadores novos. Bug real.
- `InvestmentsView.jsx:68,75` e `GroupsView.jsx:79`: `<span>` sem `color` dentro de `<button className="cd">`; `tokens.css:13` declara `color-scheme: light dark` no `:root` e o reset de `button` (`tokens.css:114`) não fixa `color`, por isso a cor de sistema do UA para `button` inverte quando o sistema está em escuro e a app em claro. Bug real, visível em Mac com aparência escura.
- Património: `ContextStrip` usa `compute().nW`; `ChartsView` usa `netWorthSeries()`. Duas fórmulas, dois números, mesmo nome, mesmo ecrã.
