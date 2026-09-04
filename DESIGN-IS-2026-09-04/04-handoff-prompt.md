````
/make-plan Redesign o Resumo, o fluxo de nova despesa e a camada de números da Proof Finance. Current design failed audit at 12/30 with critical gaps in principles #2 útil, #4 compreensível, #6 honesto, #8 minucioso.

Verdict paragraph (quoted from 03-verdict.md):
> REDESIGN. Total 12/30, abaixo do limiar de 20, com os três princípios load-bearing (útil, compreensível, honesto) a 1. As fundações técnicas são boas e ficam; a arquitetura de informação do primeiro ecrã, o fluxo de registar despesa e a reconciliação dos números têm de nascer de novo a partir do propósito, não de um retoque.

Why redesign and not refine: o Resumo responde à pergunta errada (património em vez de "posso gastar?"), a ação mais frequente esconde o campo mais importante, e os indicadores têm duas ou três fórmulas cada — é estrutura, não polimento.

Preserve from current design (MUST be non-empty):
- Sistema de cor com contraste documentado: `src/styles/tokens.css:12-105` (claro e escuro), incluindo `--success/--warning/--danger` ≥4,6:1.
- `src/components/Sheet.jsx` inteiro: dialog + aria-modal, focus trap, restore, Escape, arrastar para fechar, `dvh`, safe-area.
- Barra de navegação inferior `src/components/Shell.jsx:193-225` (5 slots, ícone+rótulo, aria-current) e `.has-bnav` em `tokens.css:241`.
- Pack de marcas e `MerchantLogo`/`BankLogo`/`AssetLogo` (`src/lib/brands.jsx`, `src/components/MerchantLogo.jsx`), `Avatar`/`AvatarStack`, `StatTiles`, cartão-objeto `.ccard` (`src/views/CardsView.jsx:80-95`).
- Conteúdo dos insights de anomalia (`src/lib/anomalies.js`, `src/lib/pulse.js:140-160`): rácio, média, dispensar com ✓.
- Ecrã Fiscal (`src/views/TaxView.jsx`) e "Onde podes poupar" (`src/views/ReportView.jsx:390-560`): base declarada, €/ano, limites declarados.
- Modelo Splitwise dos Grupos (`src/lib/split.js`, `SettleSheet.jsx`) e a regra "só a tua parte entra nas Despesas".
- "Pagar tudo" e rodapé explicativo do `CardPayModal.jsx`; rótulos "DE (SAI) / PARA (ENTRA)" do `TransferModal.jsx`.
- Onboarding em 4 passos (`src/components/Onboarding.jsx:29-49`).
- `input,select,textarea{font-size:16px}` e `inputMode="decimal"`.

Discard (MUST be non-empty):
- Resumo como pilha de 14 cartões `.cd` idênticos com margem uniforme. Evidence: `src/views/OverviewView.jsx:255-956`, H8.1, G.1, G.3. Caused failure on principle #10 e #5.
- Hero "Património Líquido" em gradiente como primeiro elemento (`src/components/Hero.jsx`, `--grad-hero`). Evidence: H1.1, G.5. Caused failure on principle #2 e #7.
- Ordem Categoria → Descrição → Partilhada → Valor no `AddExpenseSheet.jsx:237-440` e grelha alfabética `sortedCats` (`src/lib/categories.js:9-12`). Evidence: H5.1, e.1. Caused failure on principle #2.
- Três modelos de orçamento não reconciliados no mesmo scroll (ritmo, plano por baldes, envelopes com rollover). Evidence: d.1, k.6. Caused failure on principle #4.
- Fórmulas duplicadas por vista: `compute().nW` vs `netWorthSeries()`, total do mês do Calendário vs Despesas, três taxas de poupança. Evidence: h.3, f.2, d.3. Caused failure on principle #6.
- `confirm()` nativo e ausência de undo em ações de dinheiro (11 sítios) e apagar sem confirmação (`AddExpenseSheet.jsx:194`, `GoalModal.jsx:108`). Evidence: H3.2, web-guidelines. Caused failure on principle #8.
- Valores literais de espaçamento/tipo/radius em `style={{}}` (19 espaçamentos, 16 tamanhos). Evidence: visual A1–A3. Caused failure on principle #3.
- "Mais" como lista plana de 12 destinos sem título de ecrã nem "voltar". Evidence: H6.1, H6.2, H7.4. Caused failure on principle #4.

Top 5 moves from the audit (verbatim):
1. #2 Útil, #10 Mínimo — Resumo com uma tese: "Podes gastar" passa a hero (primeiro pixel, sem gradiente a competir), seguido de no máximo 4 blocos: hoje/ritmo, plano do mês, o insight nº1, Disponível; o resto sai para Património e Análise. Evidence: H1.1, H8.1, G.5, k.5.
2. #2 Útil — Nova despesa em 5 segundos: valor primeiro (teclado numérico, focado ao abrir) → 6 categorias mais usadas + "mais" → descrição com autocomplete de marca → guardar. Evidence: H5.1, e.1, H5.2, B.9.
3. #6 Honesto, #8 Minucioso — um número, uma fórmula: uma função por indicador usada por todas as vistas e pela ContextStrip; base e período ao lado de cada percentagem; NaN, texto invisível e modo oculto parcial corrigidos. Evidence: h.1–h.7, f.2, d.3, H9.1, H9.2, g.1–g.4.
4. #3 Estético, #4 Compreensível — um sistema: tokens de espaçamento e tipo; uma semântica de saída de dinheiro; um padrão de navegação temporal; título em cada ecrã e "voltar" nos 12 destinos de "Mais". Evidence: visual A1–A3, H4.2, H4.3, H6.1, H6.2.
5. #8 Minucioso — reversível por defeito: confirmação in-app com valor + "Anular" em todas as ações de dinheiro; alvos 44 px; botões desativados até válido. Evidence: H3.2, H3.3, AddExpenseSheet:194, GoalModal:108, visual A7, A8.

Redesign principles in priority order:
1. #2 Útil — a pergunta "posso gastar hoje?" respondida no pixel zero; despesa registada em ≤5 s sem scroll.
2. #6 Honesto — cada número tem uma fórmula, uma base e um período visíveis; nunca dois valores para o mesmo nome.
3. #4 Compreensível — um utilizador novo sabe onde está (título), como voltar, e o que cada chip quer dizer sem tooltip.
4. #8 Minucioso — nenhuma ação de dinheiro é irreversível; todos os estados (vazio, erro inline, desativado, foco) existem.
5. #10 Mínimo — cada bloco do Resumo justifica a sua presença; nada é mostrado duas vezes.

Deliverables for the plan:
- Nova arquitetura de informação (mapa dos 15 destinos reagrupado em Hoje / Registos / Análise / Configuração), não derivada da atual.
- Novo fluxo primário (Resumo → Nova despesa) em wireframe low-fi, lado a lado com o atual.
- Módulo `src/lib/metrics.js` com uma função por indicador e testes que provam igualdade entre vistas.
- Tokens `--space-*` e `--fs-*` e migração dos `style={{}}` das 4 vistas principais.
- Checklist de estados (vazio, a carregar, erro inline, sucesso, foco, desativado) por ecrã.
- Componente `ConfirmSheet` + toast "Anular" e migração dos 11 `confirm()`.
- Correção do harness: `applyTheme` em `devPreview.jsx`, `lastSeenPatchVersion` no `emptyFixture`, favicon em `dev.html`; recaptura de `dark-*` e `empty-*`.
- Caminho de migração: feature flag `resumoV2` por utilizador; cutover quando 2 semanas sem regressões nos testes de igualdade de métricas.
- Critério de retirada do design antigo: `OverviewView` antigo apagado no commit de cutover.

Anti-patterns to guard against (specific to REDESIGN):
- Porting old structure under new styling
- Keeping both designs behind a flag indefinitely
- Redesigning to follow a trend rather than the principles above
- Treating the Preserve list as optional — it must be filled before this handoff is valid
````
