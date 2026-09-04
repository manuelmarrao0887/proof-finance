# Redesign: Resumo, nova despesa, camada de números, sistema e assistente — Spec

**Data:** 2026-09-04
**Estado:** Aprovado pelo utilizador ("avança com tudo por agentes") após a auditoria `DESIGN-IS-2026-09-04/` (Rams 12/30, veredicto REDESIGN).
**Auditoria:** `DESIGN-IS-2026-09-04/02-scorecard.md`, `03-verdict.md`, `04-handoff-prompt.md`; relatório publicado em https://claude.ai/code/artifact/65538e55-075f-46db-ba02-6246c5d29ff1
**Âmbito:** as quatro fases do roadmap (P0 correções, P1 tarefa primária, P2 sistema, P3 comportamento) menos Web Push, mais uma correção pedida à parte: o assistente de IA tem de reconhecer a conta nomeada na frase ("pago pelo Activobank") e ligá-la à conta existente.

---

## 1. Problema

Ver `03-verdict.md`. Em resumo: o Resumo responde "quanto valho" antes de "posso gastar?"; a nova despesa esconde o valor atrás de 18 categorias alfabéticas; o mesmo indicador tem duas ou três fórmulas; não há undo em ações de dinheiro; não há escala de espaçamento nem de tipo; cinco defeitos de severidade máxima (texto invisível, modo oculto parcial, valor fora do ecrã, números contraditórios e NaN, changelog sobre utilizadores novos). E o assistente não sabe a que conta debitar uma despesa porque o tool `add_expense` não tem campo de conta.

---

## 2. Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | Ordem das fases | P0 → P1 → P2 → P3, cada uma com commit + push + gates (suite, build, layout-check). |
| D2 | Web Push | **Fora**: exige backend, VAPID e permissões que não existem. Fica o lembrete in-app "a vencer" já existente. |
| D3 | Texto invisível | `button{color:inherit}` no reset de `tokens.css`; `color-scheme` passa a seguir `data-theme` (`html[data-theme="dark"]{color-scheme:dark}` e `:root{color-scheme:light}`). |
| D4 | Modo oculto | Um helper `mask(v, hidden)` em `src/lib/format.js` usado por TODAS as vistas e pela `ContextStrip`; quando oculto, percentagens viram "••%" e sparklines/barras de alocação não renderizam a forma (ficam a `--elevated`). |
| D5 | Nova despesa | Ordem: valor (campo grande, `inputMode="decimal"`, foco automático ao abrir) → categoria (as 6 mais usadas nos últimos 90 dias + botão "Mais categorias" que abre a grelha completa) → descrição com o logo inline já existente → conta (select, pré-selecionada com a última usada) → data (hoje) → resto colapsado em "Mais opções" (partilhada, tags, nota). Sem scroll para submeter. |
| D6 | Resumo | Cinco blocos: (1) hero "Podes gastar hoje" sem gradiente, com N €/dia, dias restantes e uma frase com agência; (2) ações rápidas com Despesa em primeiro; (3) plano do mês (um modelo: rendimento − fixas − metas = livre, com o ritmo dentro); (4) o insight nº1 (ranking único entre anomalias, ritmo e metas); (5) Disponível com logos. Grupos só quando há dívida. Tudo o resto sai para Gráficos ("Património": hero atual, alocação, contas por categoria, fundo de emergência) e Relatório ("Análise": fecho do mês, saúde financeira, projeção, subscrições detetadas). |
| D7 | Métricas | `src/lib/metrics.js` com uma função por indicador: `netWorth(state)`, `investmentsValue(state)`, `monthSpend(state, ym)`, `savingsRate(state, ym)`. Todas as vistas e a `ContextStrip` chamam estas; testes de igualdade entre vistas. Cada percentagem no ecrã leva base e período ao lado ("vs média de 3 meses", "desde janeiro"). |
| D8 | Reversível | `ConfirmSheet` (usa `Sheet`) com título, o valor em causa, botão destrutivo vermelho e "Cancelar"; toast com "Anular" que restaura um snapshot (`actions.restoreSnapshot(snap)`, novo, sobre o mesmo mecanismo do assistente). Substitui os 11 `confirm()`. Apagar despesa e apagar meta passam a confirmar. |
| D9 | Tokens | `--space-1..8` = 4/8/12/16/24/32/48/64; `--fs-xs..2xl` = 11/13/15/17/22/28/34; radius usa os `--r*` existentes. Migram-se as 4 vistas principais (Overview, Expenses, Goals, Cards) e os 3 modais principais (AddExpense, Goal, Acct). O resto migra por oportunidade. |
| D10 | Dinheiro | Componente `Amount({ value, kind: 'in'|'out'|'neutral', hidden })`: saída = sinal "−" + `--fg`; entrada = "+" + `--success`; vermelho (`--danger`) só em alertas e em "acima do limite". Aplicado em Despesas, Cartões, Recorrentes, Transferências, Relatório, Investimentos. |
| D11 | Navegação | `ViewHeader({ title, back })` em cada uma das 12 vistas de "Mais", com botão voltar (`goTab('overview')` ou histórico); "Mais" agrupado em Registos (Receitas, Recorrentes, Transferências, Cartões, Grupos) / Análise (Relatório, Gráficos, Calendário, Investimentos, Crédito, Fiscal) / Assistente; tab e mês na URL (`?tab=&m=`) com `history.pushState`. Sidebar desktop passa a listar os 15 destinos. |
| D12 | Tempo | Um só `MonthNav` (setas + mês) em todas as vistas datadas; a barra de segmentos Jun/Jul/Ago/Set/3M sai; "3M" vira opção do `MonthNav`. |
| D13 | Toque | `.icon-btn` 44×44 (ícone 16–18 px); botões de dispensar/editar/apagar sem overrides abaixo de 44; rótulos da barra inferior a 11 px. |
| D14 | Tab Transações | Nova vista `TransactionsView` (feed cronológico com `MerchantLogo`, agrupado por dia, categoria alterável em 2 toques via select inline) passa a ser a tab "Despesas"; a lista de orçamentos por categoria passa a "Orçamento" dentro de "Mais → Registos". |
| D15 | Enquadramento | "Faltam-te X € para fechar dentro do rendimento" em vez de "X € acima"; selo "atrasada" → "+N €/mês para chegar a tempo" (o valor já existe em `goalsAtRisk`); meta ≥95% ganha "Faltam N € — fecha agora" com botão que reforça o resto. |
| D16 | Hero | Superfície `--surface` com borda, número em `--fg`, sem gradiente; `--grad-hero` mantém-se só nos FABs; o FAB do assistente muda para `--secondary` sólido (deixa de ser igual ao "+"). Sparkle da IA substituído por um glifo de balão de conversa. |
| D17 | Dark AA | `--primary` do tema escuro passa de `#5b85f2` para `#4f78ea` (≥4,5:1 com branco); cores de pessoa (`Avatar`) recebem `color: #fff` só se contraste ≥4,5, senão `--fg` sobre a cor. |
| D18 | Service worker | `vite-plugin-pwa` com `registerType: 'prompt'` e toast "Nova versão disponível — Atualizar". Única dependência nova do plano; aprovada por resolver o "hard reload após deploy". |
| D19 | Harness | `devPreview.jsx` chama `applyTheme(fx.theme)`; `emptyFixture()` leva `lastSeenPatchVersion: 999`; `dev.html` ganha `<link rel="icon">`. |
| D20 | Copy | Acentos corrigidos em toda a copy visível ("Património Líquido", "Poupança", "Projeção", "Adesão", "Revê", "visão", "informação"); "Não e" → "Não é"; "Q1" → "3M"; custos de IA em €; "plafond" → "limite"; "Rollover" → "Transportar saldo". |
| **D21** | **Assistente: conta na frase** | O tool `add_expense` (e `update_expense`) ganha `acct: string` com descrição gerada em runtime a partir das contas do utilizador ("Activobank · Conta a Ordem \| Revolut · Cartão de Crédito \| …", incluindo `customAccts` e templates com saldo). `resolveAccountRef(text, accts)` em `src/lib/accounts.js`: normaliza (minúsculas, sem acentos), aceita rótulo completo, nome do banco ou tipo; **1 match** → rótulo canónico `b · t`; **vários** → prefere Liquidez/Conta à Ordem, senão devolve erro `AMBIGUOUS` com as opções para o modelo perguntar; **0** → omite `acct` e a despesa fica sem conta (como hoje). A resposta do tool inclui `acct` resolvido para o modelo confirmar ("registei 15 € em Restaurante X, pago pela Activobank · Conta a Ordem"). O prompt de sistema ganha uma linha: "Quando o utilizador nomeia um banco ou conta, passa-o em `acct`." |

---

## 3. Fatias de entrega (mapa para o plano)

- **P0 (sem redesign):** D3, D4, NaN, `isNewUser`, apagar sem confirmação, D19, D20, **D21**.
- **P1 (tarefa primária):** D5, D6, D7, D8.
- **P2 (sistema):** D9, D10, D11, D12, D13, D14.
- **P3 (comportamento e brilho):** D15, D16, D17, D18.

Cada fase: `npm test` verde, `npm run build`, `node scripts/layout-check.mjs` limpo, `testes.html` atualizado, commit + push `origin react`.

---

## 4. Fora de âmbito

Web Push; redesign do Assistente de IA; landscape; Dynamic Type nativo (fica `clamp` nos rótulos); fotos de membros de grupos; migração de todas as vistas para tokens (só as 7 principais).
