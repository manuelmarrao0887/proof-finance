# Evidence — Nielsen heuristics, fintech patterns, platform conventions, Gestalt, behavioural economics, JTBD

**Alvo:** Proof Finance (React 18 + Vite PWA), branch `react`, 390×844 @2×.
**Método:** walkthrough guiado por screenshots, com verificação no código sempre que o screenshot levanta uma pergunta que só o código responde.
**Severidade:** escala de Nielsen 0–4 por observação (0 não é problema · 1 cosmético · 2 menor · 3 maior · 4 catastrófico). **Sem agregados, sem veredicto, sem roadmap** — isso é do orquestrador.

Nota de leitura sobre coordenadas: os screenshots são full-page a 2×. Todas as posições `y≈N` neste documento estão em **px CSS** (px da imagem ÷ 2), medidos a partir do topo da página. A dobra ("fold") do dispositivo está em **y = 844**; a barra de navegação fixa está pintada em **y = 780–844** em todas as capturas full-page, e por isso tapa o conteúdo que caia nessa faixa.

---

## 1. Fontes consultadas

### 1.1 Screenshots vistos (todos)

**Tabs, estado rico** (`scratchpad/audit/`)
`rich-overview.png` (780×7092 — visto em 7 tiles: y0-600, 550-1150, 1100-1700, 1650-2250, 2200-2800, 2750-3350, 3300-3546) · `rich-expenses.png` (3 tiles) · `rich-goals.png` · `rich-cal.png` · `rich-income.png` · `rich-rec.png` · `rich-charts.png` (3 tiles) · `rich-loan.png` (2 tiles) · `rich-report.png` (4 tiles) · `rich-invest.png` (2 tiles + zoom 4× da linha VWCE) · `rich-transfers.png` · `rich-cards.png` (3 tiles) · `rich-tax.png` (3 tiles)

**Modais** `modal-action.png` · `modal-more.png` · `modal-add.png` · `modal-transfer.png` · `modal-cardpay.png` · `modal-stmt.png` · `modal-settings.png`

**Estado vazio** `empty-overview.png` · `empty-expenses.png` (2 tiles) · `empty-cards.png` · `empty-tax.png` (3 tiles)

**Saldos ocultos** `hidden-overview.png` (7 tiles) · `hidden-expenses.png` (3 tiles) · `hidden-cards.png` (3 tiles) · `hidden-tax.png` (3 tiles)

**Tema escuro** `dark-overview.png` (7 tiles) · `dark-expenses.png` (3 tiles) · `dark-cards.png` (3 tiles) · `dark-tax.png` (3 tiles)

**Redesign "depois"** (`scratchpad/depois/`) `groups.png` · `invest.png`

**Verificações de pixel executadas** (para não adivinhar cor a olho):
- `shasum` de `rich-*` vs `hidden-*` vs `dark-*` — ver §2.2g e §3.9.
- amostragem RGB da faixa y 1200–1300 de 8 ficheiros (fundo médio) — ver §3.9.
- ampliação 4× de `rich-invest.png` (40,1060)-(740,1260) e de `rich-expenses.png` (40,1240)-(740,1420) para medir contraste de texto — ver §2.4 e §3.2.

### 1.2 Ficheiros de código abertos

`src/components/Shell.jsx:60-158,186-235,248-336` · `src/components/Sheet.jsx:25-27,42-74,100-142,150-197` · `src/components/AssistantFab.jsx:1-72` · `src/components/Hero.jsx:24-50` · `src/components/ContextStrip.jsx:20-80` · `src/components/Onboarding.jsx:1-60` · `src/styles/tokens.css:1-120,139-260` · `src/store/store.jsx:100-122,147-161,191-241,409-418,449-516` · `src/devPreview.jsx:1-46` · `src/lib/categories.js:1-30` · `src/lib/format.js` (todo) · `src/lib/finance.js:140-156,375-389,651-656,693,714-717` · `src/lib/anomalies.js:21,64,126` · `src/lib/patchNotes.js:98-105` · `src/lib/dedupe.test.js:66-77` · `src/views/OverviewView.jsx:226,246-249,336-342,375,398,451-460,462-500,582,711,763,791,809,935` · `src/views/ExpensesView.jsx:1-40,145,343,439,453,588,596,679,690-733` · `src/views/InvestmentsView.jsx:60-140` · `src/views/GroupsView.jsx:79,343,483-540` · `src/views/LoanView.jsx:1-13,41,98-110,157-174` · `src/views/IncomesView.jsx:4,82,127,134` · `src/views/CardsView.jsx:20,25,34` · `src/views/TransfersView.jsx:17,21` · `src/views/ChartsView.jsx:63` · `src/modals/AddExpenseSheet.jsx:106,188,237,273-274,295-302,341-353,371-440` · `src/modals/GroupSheet.jsx:27,38,97,173,258-266` · `src/modals/GroupExpenseSheet.jsx:2-27,276,381-432` · `src/modals/SettleSheet.jsx:3-14,88,117-184` · `src/modals/SettingsSheet.jsx:91,132-180` · `src/modals/AcctModal.jsx:124` · `src/modals/PositionModal.jsx:50` · `src/modals/HousingModal.jsx:75` · `src/modals/PersonSheet.jsx:90` · `src/modals/ImportStatementSheet.jsx:87,320` · `src/modals/PatchNotesSheet.jsx:2-22` · `src/test/fixtures.js:106,110-112`

### 1.3 Referências de checklist aplicadas

`~/.claude/skills/ui-ux-pro-max/references/pro-rules.md` (integral) e `references/quick-reference.md` §1 Acessibilidade, §2 Toque, §5 Layout, §6 Tipografia/Cor, §8 Formulários, §9 Navegação.

---

## 2. Achados por framework

---

## 2.1 — Nielsen: as 10 heurísticas

### H1 · Visibilidade do estado do sistema

**H1.1 — O número que decide o dia está abaixo da dobra. `rich-overview.png`, "PODES GASTAR" em y≈763. Severidade 3.**
A etiqueta `PODES GASTAR` (`OverviewView.jsx:342`) aparece a y≈763; a barra de navegação fixa está pintada a partir de y=780 e a dobra é a y=844. O valor em si e a projeção nunca são visíveis sem scroll. O primeiro ecrã responde "quanto valho" (Património), não "quanto posso gastar" — que é a tarefa primária declarada no âmbito. Detalhe: em `rich-overview_t1` vê-se o cartão a ser literalmente cortado a meio pela `.bnav`.

**H1.2 — Estado de gravação bem resolvido. `rich-overview.png` y≈30, ponto verde no cabeçalho. Severidade 0.**
`Shell.jsx:141-155` (`SyncChip`): três estados (`saving`/`saved`/`error`), com a palavra "Guardado" escondida visualmente mas exposta a leitores de ecrã (`.vh`) e só o ponto a contar visualmente. É a solução certa: presença permanente, ruído zero.

**H1.3 — "Set parcial · 13% do mês" declara o estado do período. `rich-expenses.png` y≈409. Severidade 0.**
O cartão diz explicitamente que o mês está incompleto, o que impede a leitura errada de "gastei pouco". Poucas apps fazem isto; é um acerto.

**H1.4 — Progresso de mês sem âncora temporal no Relatório. `rich-report.png`, cartão "DESPESA TOTAL 675 €" em y≈295. Severidade 2.**
O cartão não repete o mês selecionado; o utilizador tem de se lembrar do que carregou na grelha acima (y≈145). Contraste com `rich-expenses.png` y≈342 ("DESPESAS SET"), que o faz bem.

---

### H2 · Correspondência com o mundo real

**H2.1 — "Q1" para Jun–Set 2026 é factualmente errado. `rich-income.png` y≈181 (segmento "Q1") vs `rich-expenses.png` y≈279 (segmento "3M"). Severidade 3.**
`IncomesView.jsx:127` escreve `Q1` fixo; `ExpensesView.jsx:588` escreve `{preview ? 'Q1' : '3M'}`. O mesmo segmento, alimentado pelo mesmo `state.em`, tem dois nomes em dois ecrãs — e "Q1" não corresponde a nenhum trimestre que contenha Jun–Set (seria Q2/Q3). `IncomesView.jsx:82` (`periodLabel = isQ ? 'Q1' : ms[em]`) propaga o erro para o cabeçalho ("RECEITA Q1").

**H2.2 — Preços de IA em dólares numa app PT-PT em euros. `modal-settings.png` y≈559, 625, 690. Severidade 2.**
"~$0,003 / mensagem", "~$0,007", "~$0,010" — símbolo americano com separador decimal português, numa app cuja única moeda é o euro (`format.js`, `const EURO = ' €'`).

**H2.3 — "Transferências" é uma categoria de despesa e ao mesmo tempo não é despesa. `modal-add.png` y≈595 (célula "Transferênci-as" na grelha) vs `modal-action.png` y≈645 ("Transferência entre contas — Mover dinheiro entre as tuas contas (não é despesa)"). Severidade 3.**
Os dois textos estão a dois toques um do outro e dizem o contrário. `modal-transfer.png` y≈745 reforça: "Não conta como despesa nem receita." Um recém-chegado que classifique uma transferência na categoria "Transferências" corrompe o próprio orçamento.

**H2.4 — Falta de diacríticos em copy visível. Severidade 1 (cosmético, mas repetido).**
`rich-overview.png` y≈1690 "Adesao ao orcamento" (`finance.js:693`) · y≈1745 "Reve os limites" (`finance.js:717`) · y≈2560 "Liquidez + Poupanca / despesa media" (`OverviewView.jsx:763`) · y≈2755 "PROJECAO 3 MESES" (`OverviewView.jsx:791`) · y≈2835 "discricionario" (`OverviewView.jsx:809`) · `modal-settings.png` y≈316 "APARENCIA" · `modal-action.png` y≈745 "imobiliario". Numa app financeira em PT-PT, isto lê-se como descuido e mina a confiança nos números ao lado.

**H2.5 — Separador decimal inconsistente dentro do mesmo cartão. `rich-report.png` y≈485 vs y≈524. Severidade 2.**
"A maior é Internet (39.90€/mês)" com ponto, e logo abaixo o chip "Internet 39,90 €" com vírgula. O mesmo em `rich-overview.png` y≈2557 ("52.8 meses") contra "17 898,02 €" no hero.

---

### H3 · Controlo e liberdade do utilizador

**H3.1 — Toda a folha modal tem saída completa. `modal-add.png`, `modal-transfer.png`, `modal-cardpay.png`, `modal-settings.png`. Severidade 0 — é um ponto forte real.**
`Sheet.jsx` implementa: grabber visível (`.sheet-grip`, `tokens.css:227`), arrastar-para-fechar com limiar (`Sheet.jsx:100-142`), toque no scrim (`Sheet.jsx:164-167`), `Escape` (`Sheet.jsx:46`), armadilha de foco Tab/Shift+Tab (`Sheet.jsx:42-74`), `role="dialog"` + `aria-modal`, e `padding-bottom: calc(20px + var(--safe-bottom))`. Cumpre HIG e M3 sem atalhos.

**H3.2 — Ações de dinheiro só têm `confirm()` nativo; não há "Anular" em lado nenhum. Severidade 3.**
`ExpensesView.jsx:145` (apagar despesa), `ExpensesView.jsx:453` (apagar as N despesas do mês), `CardsView.jsx:34` (apagar despesa de cartão), `TransfersView.jsx:21` (apagar transferência), `OverviewView.jsx:935` (apagar conta + leituras de saldo), `AcctModal.jsx:124`, `PositionModal.jsx:50`, `HousingModal.jsx:75`, `PersonSheet.jsx:90`, `GroupSheet.jsx:155,207`, `GroupExpenseSheet.jsx:276`. Todas usam o `confirm()` do browser — caixa do sistema, sem estilo, sem nome da app, sem contexto do valor em causa. E o padrão de undo já existe e está construído (`tokens.css:220-221` `.toast.undo`, `AssistantSheet.jsx:56-74` `undoSnapshotFor`): está aplicado **só às escritas do assistente de IA**, e não a nenhuma eliminação manual. A parte mais arriscada da app é a que tem menos rede de segurança.

**H3.3 — A única ação primária do Resumo é irreversível e não confirma. `rich-overview.png` y≈1108, botão azul "Reservar 200,00 € para as metas". Severidade 3.**
`OverviewView.jsx:451-456` chama `applyPlan` → `actions.allocateGoals(...)` (`:246-249`) imediatamente, com um toast e nada mais. É o único botão cheio azul do ecrã inicial, está a 24 px abaixo de "Livre 1924,20 €", e move dinheiro. Sem confirmação, sem Anular.

**H3.4 — Voltar de um sub-ecrã de "Mais" não tem afordância no ecrã. `rich-cal.png`, `rich-report.png`, `rich-invest.png` etc. Severidade 3.**
Nenhum dos 12 destinos de `moreTabs` (`Shell.jsx:205`) tem cabeçalho próprio, botão "voltar", ou breadcrumb visível. Existe uma classe `.crumb` em `tokens.css:236-238` que não aparece em nenhum screenshot. A única saída é reabrir a folha "Mais" ou saltar para outra tab.

---

### H4 · Consistência e normas

**H4.1 — Dois botões redondos roxos idênticos, ações diferentes, no mesmo canto. `rich-goals.png` y≈737 (FAB do assistente) e y≈820 (FAB "+" da nav). Severidade 3.**
`tokens.css:203` (`.bnav-center .fab`) e `tokens.css:209` (`.assistant-fab`) são a mesma regra: `54×54`, `border-radius:999px`, `background:var(--grad-hero)`, `box-shadow:var(--shadow-hero)`. O comentário no CSS assume-o ("Mesmo visual do `.fab` do `bnav-center`"). Um adiciona uma despesa, o outro abre um chat de IA. Ficam a ~80 px de distância vertical e são visualmente indistinguíveis à periferia da visão.

**H4.2 — Três padrões distintos de navegação temporal. Severidade 3.**
`rich-expenses.png` y≈237-279: setas `‹ Junho – Setembro 2026 ›` **e** segmento Jun/Jul/Ago/Set/3M, empilhados. · `rich-cal.png` y≈136: só setas `‹ Setembro 2026 ›` + "Mês atual". · `rich-report.png` y≈143-208: grelha de 7 células em 3 colunas (Set 26 … Mar 26). Três gramáticas para a mesma operação em três tabs.
Agravante em `rich-expenses.png`: a etiqueta "Junho – Setembro 2026" descreve o **intervalo do segmento**, não a **seleção** (que é "Set") — as setas e o segmento contradizem-se sobre o que está ativo.

**H4.3 — Semântica de saída de dinheiro inconsistente entre ecrãs. Severidade 3.**
`rich-expenses.png` y≈84: "675 €" a vermelho. · `rich-cards.png` y≈84: "462 €" a vermelho, mas as linhas de despesa do cartão em y≈540 ("-80,00 €") a **escuro** com sinal. · `rich-rec.png` y≈386: "39,90 €" **escuro, sem sinal**. · `rich-transfers.png` y≈229: "120,00 €" **escuro, sem sinal**. · `rich-report.png` y≈1465: "400,00 €" **escuro, sem sinal**. Cinco tratamentos para "dinheiro que saiu".

**H4.4 — O mesmo indicador muda de cor entre tabs. Severidade 2.**
"PATRIMÓNIO LIQUIDO 17 898 €" na `ContextStrip`: escuro em `rich-cal.png` y≈84, escuro em `rich-rec.png` y≈84, escuro em `rich-charts.png` y≈84 — mas **verde** em `rich-loan.png` y≈84. Mesmo componente, mesmo número, cor diferente.

**H4.5 — Linhas de lista com afordâncias diferentes para operações equivalentes. Severidade 2.**
`rich-income.png` y≈455: linha de receita tem só o lápis. · `rich-rec.png` y≈396: linha de recorrente tem lápis **e** caixote. · `rich-transfers.png` y≈229: só caixote. · `rich-cards.png` y≈540: só caixote. Não há regra que o utilizador possa aprender.

**H4.6 — Ícones de navegação são SVG inline, sem emoji. `Shell.jsx:69-110`. Severidade 0.**
Cumpre `pro-rules.md` "No Emoji as Structural Icons". Único uso de emoji é o seletor de avatar de grupo (`GroupSheet.jsx:27`, `EMOJIS = ['🏖️','🏠',…]`) — que é conteúdo escolhido pelo utilizador, não cromo estrutural; é o mesmo que o Monzo faz nos Pots. Aceitável.

---

### H5 · Prevenção de erros

**H5.1 — A folha de nova despesa esconde o campo do valor. `modal-add.png`, campo VALOR fora do ecrã. Severidade 4.**
Ordem no DOM (`AddExpenseSheet.jsx`): `Categoria` (:237) → `Descrição` (:274) → toggle `Despesa partilhada` (:295) → **`Valor (€)` (:383)** → `Data` (:395) → `Conta debitada` (:408) → `Tags` (:425) → `Nota` (:435). No screenshot, a grelha de 18 categorias ocupa y≈285-745, "DESCRIÇÃO" está em y≈662 e o toggle "Despesa partilhada" em y≈755. O campo do valor **não é visível de todo** na folha aberta. O botão "Adicionar despesa" está fixo em baixo (y≈802) e visível — ou seja, o utilizador vê o botão de submeter antes de ver o campo mais importante. Está classificado como 4 porque falha diretamente a tarefa primária do âmbito ("registar uma despesa em menos de 10 segundos") e porque submeter com o valor por preencher é o erro mais provável do ecrã.

**H5.2 — Grelha de categorias com rótulos partidos a meio da palavra. `modal-add.png` y≈517 ("Supermerca-do") e y≈595 ("Transferênci-as"). Severidade 2.**
Duas das 18 células quebram a palavra com hífen automático. Prejudica a varredura visual do único elemento que o utilizador tem de ler antes de tudo o resto.

**H5.3 — "Pagar tudo" e nota semântica no pagamento de cartão. `modal-cardpay.png` y≈477 e y≈745. Severidade 0 — exemplar.**
"Dívida atual: 461,98 € [Pagar tudo]" elimina a transcrição manual do valor (fonte clássica de erro), e o rodapé explica o efeito duplo: "Baixa a dívida do cartão e desce o saldo da conta à ordem escolhida. Fica registado em Transferências." É prevenção de erro no sentido literal de Nielsen.

**H5.4 — Modal de transferência rotula direção de forma inequívoca. `modal-transfer.png` y≈427 ("DE (SAI)") e y≈507 ("PARA (ENTRA)"). Severidade 0.**
Os parênteses removem a ambiguidade que quase todas as apps deixam em pé.

**H5.5 — Reclassificação silenciosa em massa. `ExpensesView.jsx:20-22` + `dedupe.test.js:66-77`. Severidade 2.**
Mudar a categoria de **uma** despesa aplica a mudança a **todas** as despesas com a mesma descrição normalizada (`applySameBeneficiaryCategory`). É um bom comportamento por defeito, mas nada no ecrã avisa que a ação teve alcance retroativo, e não há undo (ver H3.2).

**H5.6 — Botão de submeter ativo com valor a zero. `modal-cardpay.png` y≈576 ("0,00") e y≈802 ("Registar pagamento" ativo). Severidade 2.**
O CTA não está em estado desativado enquanto o valor é 0. `quick-reference.md` §8 `disabled-states`.

---

### H6 · Reconhecer em vez de recordar

**H6.1 — Nenhum ecrã tem título. Severidade 3.**
O cabeçalho é literalmente idêntico em `rich-overview.png`, `rich-expenses.png`, `rich-goals.png`, `rich-cal.png`, `rich-income.png`, `rich-rec.png`, `rich-charts.png`, `rich-loan.png`, `rich-report.png`, `rich-invest.png`, `rich-transfers.png`, `rich-cards.png`, `rich-tax.png`: avatar "PR" + "Setembro 2026 / Olá, Preview" + chip de sync + toggle de tema (todos a y≈20-55). A `ContextStrip` por baixo é a única pista, e é um número, não um nome. Em `rich-cal.png` nada no ecrã diz "Calendário"; em `rich-tax.png` nada diz "Fiscal".

**H6.2 — "MAIS" fica ativo em 12 destinos diferentes. `Shell.jsx:205,214-224`. Severidade 3.**
`moreTabs = ['groups','cal','income','rec','charts','loan','ai','report','invest','transfers','cards','tax']` — 12 ecrãs partilham o mesmo estado ativo da nav, com `aria-current="page"` aplicado ao botão "Mais". Combinado com H6.1, o utilizador em `rich-invest.png` tem exatamente zero sinais no ecrã que digam onde está. `quick-reference.md` §9 `nav-state-active` e `bottom-nav-top-level`.

**H6.3 — Chips de marca conhecidas em Recorrentes. `rich-rec.png` y≈225-330. Severidade 0.**
"COSTUMAS TER? Toca para adicionar com o nome e a categoria já preenchidos" com Netflix/Spotify/EDP/MEO/Vodafone/NOS e logótipos reais. Reconhecimento puro: zero digitação, zero memória, e adaptado a Portugal.

**H6.4 — Grelha de categorias por ordem alfabética. `modal-add.png` y≈285-745. Severidade 3.** (ver §2.2e)

**H6.5 — Legenda do calendário só por cor. `rich-cal.png` y≈592-618. Severidade 3.**
Os marcadores nas células são pontos de ~4 px CSS; a legenda distingue Receita (verde) / Recorrente (ocre) / Despesa (vermelho) apenas por cor. Verde vs vermelho a 4 px é indistinguível em deuteranopia e quase indistinguível ao sol. `quick-reference.md` §1 `color-not-only`, §6 `color-not-decorative-only`.

---

### H7 · Flexibilidade e eficiência

**H7.1 — Quick actions no topo do Resumo. `rich-overview.png` y≈325-400 (Saldo · Despesa · Receita · IA · Mais). Severidade 0.**
Cinco atalhos circulares com rótulo, imediatamente abaixo do hero. É a via rápida certa, e os alvos (~74 px de diâmetro) cumprem 44 pt com folga.

**H7.2 — Chips de reforço rápido nas metas. `rich-goals.png` y≈385 e y≈604 (+10/+50/+100/+500). Severidade 0 no conceito, 3 no alvo de toque** (ver §2.3).

**H7.3 — Folha "Adicionar" com 9 opções todas do mesmo peso. `modal-action.png` y≈150-745. Severidade 2.**
"Nova despesa" (a de longe mais frequente) tem exatamente o mesmo tratamento visual de "Nova conta" ou "Transferência entre contas". Nenhuma é primária. `quick-reference.md` §4 `primary-action`.

**H7.4 — Menu "Mais" é uma lista plana de 12 destinos sem secções. `modal-more.png` y≈170-830+. Severidade 2.**
Grupos, Receitas, Recorrentes, Calendário, Gráficos, Relatórios, Investimentos, Transferências, Fiscal, Cartões (e mais abaixo, fora do ecrã). Sem separadores, sem agrupamento por domínio (registo vs análise vs configuração). `quick-reference.md` §9 `overflow-menu`, `nav-hierarchy`.

**H7.5 — Ícone de "Grupos" é uma pessoa singular. `modal-more.png` y≈390 e `modal-action.png` y≈492. Severidade 1.**
Um contorno de uma só pessoa para "Despesas partilhadas com amigos" e para "Despesa de grupo". O ícone de duas pessoas existe e é usado em `depois/groups.png` y≈344.

---

### H8 · Estética e design minimalista

**H8.1 — O Resumo tem 3 546 px CSS de altura: 4,2 ecrãs. `rich-overview.png`. Severidade 3.**
Cartões contados de cima a baixo: Hero, barra de alocação, QuickActions, Grupos, Fecho de Agosto (+3 mini-tiles), Podes gastar, Plano do mês, 3 insights, Disponível (+3 linhas de conta), Saúde financeira (5 sub-métricas + recomendação), Subscrições detetadas (3 linhas + "+2 outras"), Fundo de emergência, Projeção 3 meses (+3 segmentos +4 linhas), Contas por categoria (4 linhas). **14 blocos, ~40 números distintos.** Nada está errado individualmente; em conjunto, o ecrã não tem tese.

**H8.2 — O mesmo total aparece duas vezes com arredondamentos diferentes, a 340 px de distância. `rich-expenses.png` y≈84 ("675 €") e y≈342-375 ("DESPESAS SET / 674,98 €"). Severidade 2.**
A `ContextStrip` (`ContextStrip.jsx:33-40`) e o cartão da vista mostram a mesma quantidade. O comentário no código diz que isto foi deliberado para *evitar* uma discrepância anterior (715 vs 675) — resolveu-se o conflito mas manteve-se a duplicação.

**H8.3 — O FAB do assistente tapa conteúdo em 6 dos 13 ecrãs. Severidade 3.**
`rich-overview.png` y≈2467 (tapa "+ 2 outras"), `rich-report.png` y≈937 (tapa o canto do gráfico "ANO 2026"), `rich-invest.png` y≈1265 (tapa a linha AAPL), `rich-charts.png` y≈740 (tapa "INVESTIMENTOS"), `rich-expenses.png` y≈737, `rich-tax.png` y≈737. Está posicionado em `bottom: calc(var(--nav-h) + var(--safe-bottom) + 16px)` (`AssistantFab.jsx:60-61`) e o `.has-bnav` só reserva `--nav-h + safe + 16` (`tokens.css:241`) — ou seja, reserva espaço para a nav mas não para o FAB que está por cima dela.

**H8.4 — Sparklines decorativas sem eixo, sem rótulo, sem escala. `rich-expenses.png` y≈262 (linha vermelha na linha Supermercado), y≈445, y≈556. Severidade 2.**
Um traço de ~50×14 px sem qualquer âncora. Ocupa espaço horizontal na linha mais densa da app sem ser legível.

---

### H9 · Reconhecer, diagnosticar e recuperar de erros

**H9.1 — "NaN €" em duas linhas de um ecrã de crédito à habitação. `rich-loan.png` y≈295 ("Capitais próprios NaN €") e y≈335 ("Impostos na compra (IMT+IS) NaN €"). Severidade 4.**
`LoanView.jsx:104-105` renderizam `mv(h.capitaisProprios)` e `mv(h.impostos)` incondicionalmente; `mv = (v) => (hidden ? '••••' : fm(v))` (`:41`) e `fm` faz `Number(undefined).toLocaleString(...)` → `"NaN"`. As linhas seguintes (`:106-109`) **estão** protegidas por guardas (`h.dataAquisicao && …`), estas duas não. É catastrófico no sentido de Nielsen: uma app de dinheiro a mostrar "NaN" ao lado de "200 000,00 €" destrói a confiança em todos os outros números do ecrã, e o utilizador não tem qualquer caminho de recuperação indicado.

**H9.2 — Texto invisível: nome do ativo e valor da posição. `rich-invest.png` y≈1105-1125 ("VWCE" e "2200 €") e y≈1220-1240 ("AAPL" e "750 €"); confirmado por ampliação 4×. Severidade 4.**
Na ampliação, "VWCE" e "2200 €" estão a branco quase puro sobre a superfície `#f4f6fa` do cartão — contraste ≈ 1,05:1 — enquanto todos os irmãos na mesma linha ("20 un.", "+200 €", "+10.0%", "62% da carteira") estão perfeitamente legíveis. No código, `InvestmentsView.jsx:68` (`{p.asset}`) e `:75` (`{mv(p.value)}`) são exatamente **os dois únicos `<span>` da linha sem `color` explícito**, dentro de um `<button className="cd">`; todos os outros declaram `var(--text3)`, `var(--success)` ou `var(--signal)`. Herdam por isso a cor de sistema do UA para `button`, que inverte porque `tokens.css:13` declara `color-scheme: light dark` em `:root` enquanto a paleta só troca via `html[data-theme="dark"]`.
O mesmo padrão em `GroupsView.jsx:79` (`{group.name}`, também sem `color`): em `depois/groups.png` y≈497 o nome "Férias Algarve" está branco sobre claro. São os dois dados mais importantes de cada linha (que ativo, quanto vale / que grupo) e são os únicos que desaparecem.

**H9.3 — Gráficos vazios apresentados como gráficos, não como estado vazio. `rich-charts.png` y≈905 ("XTB Transações 0,00 € +0%") e y≈1030 ("TR Corretagem 0,00 € +0%"). Severidade 2.**
Linhas rectas com dois pontos e um chip "+0%" **a verde**. Zero variação apresentado como variação positiva; e um gráfico de duas amostras não é um gráfico. `quick-reference.md` §8 `empty-states`.

**H9.4 — Rótulo colide com o valor. `rich-report.png` y≈1520 ("COMPRA 4174 PINGO DOCE LISBOA45,20 €"). Severidade 3.**
Na mesma lista, a linha 1 (y≈1315) trunca com reticências ("COMPRA 4174 PINGO DOCE LIS…") e a linha 4 não trunca e encosta ao valor sem espaço. Duas estratégias de overflow na mesma lista, uma delas produzindo texto ilegível. `quick-reference.md` §6 `truncation-strategy`.

**H9.5 — Barra de progresso contradiz a sua própria legenda. `rich-tax.png` y≈486-517 ("Exigência de fatura (IVA) — 13,31 €", barra a ~5%, legenda "Gasto 474,60 € · teto 250,00 €"). Severidade 3.**
A barra mede a dedução contra o teto (13,31/250) mas a legenda por baixo fala de gasto contra teto (474,60/250 = 190%). Duas leituras possíveis do mesmo par de números, e a que a barra mostra é a menos intuitiva. A linha acima ("Despesas gerais familiares", y≈406) tem barra cheia e chip "NO LIMITE", o que sugere que a barra *devia* medir gasto/teto.

---

### H10 · Ajuda e documentação

**H10.1 — O ecrã Fiscal é o padrão-ouro da app. `rich-tax.png` y≈305-345 e y≈900-935. Severidade 0.**
"Com base nas despesas de 2026 registadas nesta app. Só contam faturas comunicadas à AT com o teu NIF — os valores oficiais são os do e-Fatura." e "Estimativa indicativa, não é aconselhamento fiscal. Confirma sempre no Portal das Finanças." Declara a fonte, declara o limite e declara o que não é. Nenhum outro ecrã da app faz isto.

**H10.2 — "Onde podes poupar" declara a base e devolve a decisão ao utilizador. `rich-report.png` y≈410-425. Severidade 0.**
"Com base nos últimos 6 meses fechados. São estimativas — decides tu o que faz sentido." E cada linha explica-se: "Média de 60€ contra um limite de 40€ (6 de 6 meses). Voltar ao limite poupa 240€/ano."

**H10.3 — Ajuda contextual concentrada nos modais, ausente das vistas. Severidade 2.**
`modal-transfer.png` y≈745, `modal-cardpay.png` y≈745, `modal-settings.png` y≈460 e y≈740 têm todos texto explicativo. As vistas não: nada explica o que é "Podes gastar", "Plano do mês", "Rollover do orçamento" (`rich-expenses.png` y≈557, com apenas o subtítulo "O que sobra/falta transita para o mês seguinte") ou "Saúde financeira 86/100".

**H10.4 — Não há ajuda de primeiro uso acessível depois do onboarding. Severidade 2.**
`modal-more.png` (visível até y≈830) não mostra nenhuma entrada de "Ajuda"/"Como funciona"; a única entrada meta é "Novidades" (`MoreMenu.jsx:118-125`), que é um changelog, não documentação.

---

## 2.2 — Padrões fintech

### (a) Hierarquia "saldo primeiro"

**Estado da arte.** O Monzo abre com o saldo da conta e "Left to spend" logo abaixo; o N26 abre com o saldo disponível; o Revolut abre com o saldo da conta ativa; o YNAB abre com "Ready to Assign"; o Copilot Money abre com "Safe to spend". Em todos, o primeiro número grande responde a **"posso gastar?"**. O Finary é a exceção deliberada — abre com património líquido — porque é uma app de *wealth tracking*, não de gestão de mês.

**Proof.** `rich-overview.png`:
- y≈0-55 · cabeçalho (avatar, "Setembro 2026 / Olá, Preview", chip de sync, toggle de tema)
- y≈65-275 · **hero: "PATRIMÓNIO LIQUIDO / 17 898,02 €"** ← primeiro número grande, a ~130 px do topo
- y≈278-312 · barra e legenda de alocação (Liquidez 28% · Poupança 45% · Investimentos 27%)
- y≈325-405 · QuickActions
- y≈420-495 · cartão Grupos
- y≈510-720 · "FECHO DE AGOSTO / 253 € gastos" + 3 mini-tiles
- y≈763 · **"PODES GASTAR"** ← a etiqueta; o valor cai atrás da nav fixa (780) e abaixo da dobra (844)

**Observação. Severidade 3.** A app adotou a hierarquia do Finary para servir a tarefa do Monzo. Antes do "podes gastar" o utilizador atravessa 5 blocos, incluindo o balanço do **mês passado** ("Fecho de Agosto"). O número de decisão do dia nunca é visível sem scroll a 390×844.

---

### (b) Anatomia da linha de transação

**Estado da arte.** Monzo/Revolut/N26: logótipo do comerciante · nome a peso forte · categoria+hora a peso fraco · montante alinhado à direita, com sinal, algarismos tabulares · estado "pending" explícito. Wise acrescenta a conta/moeda. Splitwise acrescenta o indicador de divisão.

**Proof — onde existem linhas de transação de facto:** só em `rich-cards.png` (y≈500-1105) e em `rich-report.png` "MAIORES DESPESAS" (y≈1290-1560).

| Elemento | Cartões (`rich-cards.png`) | Relatório (`rich-report.png`) | Recorrentes (`rich-rec.png`) | Transferências (`rich-transfers.png`) | Despesas (`rich-expenses.png`) |
|---|---|---|---|---|---|
| Logo do comerciante | sim (IKEA, Netflix), y≈540 | ícone de categoria, y≈1315 | ícone de categoria, y≈386 | logo do banco, y≈206 | ícone de categoria (na **categoria**) |
| Nome | 14 px forte | 13 px normal | 14 px forte | nome da conta | nome da **categoria** |
| Categoria | sim ("Compras") | não | sim ("Telecom") | não | — |
| Data | sim ("20 set") | **não** | sim ("28 set") | sim ("4 set") | — |
| Conta | não | não | não | sim (origem→destino) | filtro global "Todas as contas" |
| Montante | direita, com `-`, **escuro** | direita, **sem sinal**, escuro | direita, **sem sinal**, escuro | direita, **sem sinal**, escuro | — |
| Algarismos tabulares | sim (`.m`, `tokens.css:139`) | sim | sim | sim | sim |
| Estado pendente | não existe | não existe | chip "PAGA" (y≈388) | não | chip "Registar" (y≈494) |
| Indicador de divisão | não | não | não | não | não visível na lista |

**Observação b.1 — Não existe um feed de transações. Severidade 3.**
A tab "Despesas" é uma lista de **orçamentos por categoria** (`rich-expenses.png` y≈590-1160), não de despesas. Confirmado no código: `ExpensesView.jsx:4-10` documenta apenas dois modos — SEARCH/TAG (ativo só quando há query ou filtro) e BUDGET (por defeito). Para ver transações é preciso **escrever no campo de pesquisa** ou **expandir uma categoria**. Monzo, Revolut, N26 e Wise põem todos o feed cronológico como ecrã principal.

**Observação b.2 — Algarismos tabulares aplicados, alinhamento à direita quase sempre. Severidade 0 / 2.**
`.m { font-variant-numeric: tabular-nums }` (`tokens.css:139`) está aplicado a praticamente todos os valores — é o detalhe que a maioria das apps falha. A exceção: as três stat-tiles de `rich-rec.png` y≈246-345 ("76 € por mês", "910 € por ano", "40 € por pagar") têm o valor **alinhado à esquerda**, ao contrário de todo o resto da app. Severidade 2.

**Observação b.3 — Sinal negativo sem cor, ou cor sem sinal, consoante o ecrã. Severidade 3.** Ver H4.3.

---

### (c) Semântica entrada vs saída de dinheiro

**Estado da arte.** Monzo e N26: entradas a verde, saídas em tom neutro (o vermelho fica reservado para alertas e saldos negativos). Revolut: idem. YNAB: vermelho **só** para categorias em défice. A regra partilhada é *o vermelho tem um dono só*.

**Proof — entradas.** Consistentemente verdes: `rich-income.png` y≈447/545 ("+300,00 €", "+1900,00 €"), `rich-cal.png` y≈206 ("RECEITA +2200 €"), `rich-cards.png` y≈464 ("+120,00 €"), `rich-overview.png` y≈470 ("Amigos devem-te 150,00 €"). **Severidade 0.**

**Proof — saídas.** Ver H4.3: vermelho na ContextStrip de Despesas e Cartões, escuro em Cartões/Recorrentes/Relatório/Transferências. **Severidade 3.**

**Observação c.1 — O vermelho tem quatro donos ao mesmo tempo. Severidade 3.**
No mesmo Resumo o vermelho significa: (i) despesa — "675 €" na tab Despesas; (ii) alerta de anomalia — "Fora do padrão", "Cobrança repetida", "Supermercado +885% vs média" (`rich-overview.png` y≈1230, 1315, 1400); (iii) aviso de ritmo — o painel rosa "A este ritmo (160 €/dia) fechas o mês em 4869 €" (y≈865); (iv) sub-score mau — a barra vermelha de "Adesao ao orcamento" (y≈1690). Um leitor não consegue inferir a gravidade a partir da cor.

**Observação c.2 — Verde aplicado a um valor negativo. `rich-expenses.png`, linha imediatamente acima da nav, "Resta -60,00 €" a verde. Severidade 3.**
`ExpensesView.jsx:726-730`: o ramo `ov` (gasto > limite) usa `var(--signal)`, mas o ramo `else` usa **sempre** `var(--success)` — inclusive quando `r.lm - r.val` é negativo, o que acontece quando o rollover trouxe um défice. Resultado: "gastaste 0 %" e "Resta -60,00 €" em verde, lado a lado.

**Observação c.3 — Verde aplicado a zero. `rich-report.png` y≈1090, 1195, 1300, 1405 ("▼ 0%" a verde com seta descendente). Severidade 3.**
Categorias sem mês anterior comparável recebem uma seta para baixo e cor de sucesso. Sugere uma poupança que não existe.

---

### (d) Modelo mental de orçamento

**Estado da arte.** YNAB: envelopes com atribuição explícita e rollover. Monzo: "Left to spend" e "Summary" com ritmo diário. Copilot: "Safe to spend" com projeção. Cada uma dessas apps ensina **um** modelo e é fiel a ele.

**Proof usa três modelos em simultâneo, todos no primeiro scroll do Resumo:**
1. **Ritmo / safe-to-spend** — "PODES GASTAR" (y≈763) com barra de progresso, "27 dias até fim do mes" e a projeção "A este ritmo (160 €/dia) fechas o mês em 4869 € — 2669 € acima do rendimento" (y≈865).
2. **Alocação por baldes** — "PLANO DO MÊS" (y≈975) com barra empilhada Fixas 75,80 € / Metas 200,00 € / Livre 1924,20 € e o botão "Reservar 200,00 € para as metas".
3. **Envelopes com rollover** — `rich-expenses.png` y≈557 ("Rollover do orçamento — O que sobra/falta transita para o mês seguinte · ON") e os chips `⇄ +250,00 €` por categoria (y≈645, 740, 855, 928, 1040).

**Observação d.1 — Os três não são reconciliados em lado nenhum. Severidade 3.**
"Livre 1924,20 €" (modelo 2) e a projeção "2669 € acima do rendimento" (modelo 1) são derivados do mesmo mês e apontam em direções opostas, a 110 px de distância. O chip de rollover `⇄ +250,00 €` (modelo 3) nunca é explicado — o símbolo `⇄` não tem legenda visível (existe um `title`/`aria-label` em `ExpensesView.jsx:694-696`, invisível num PWA de toque).

**Observação d.2 — "27 dias até fim do mes" sem acento circunflexo. `rich-overview.png` y≈765. Severidade 1.**

**Observação d.3 — Os números de poupança do mesmo mês não batem certo. Severidade 3.**
No mesmo Resumo: "Poupaste 1947 € (**89%** do rendimento)" (y≈540) · "Poupança **69%**" (y≈940) · "Taxa de poupanca 25/25 · **68%**" (y≈1625). Três taxas de poupança, três valores, sem qualquer indicação de que medem coisas diferentes.

---

### (e) Fluxo de categorização

**Estado da arte.** Monzo: a transação chega já categorizada, e mudar é 2 toques (transação → categoria), com a categoria mais usada em primeiro. Revolut: idem. Copilot: propõe regras automáticas explícitas depois de 2-3 correções.

**Proof — número de toques para mudar a categoria de uma transação já registada:**
1. Tocar na linha da categoria em `rich-expenses.png` (para expandir e revelar as transações lá dentro) — **mas só se souber em que categoria a despesa caiu**. Se não souber, tem primeiro de escrever no campo de pesquisa (y≈146).
2. Tocar no `<select>` nativo da linha da transação.
3. Escolher na lista alfabética.
**Mínimo 3 toques, com um pré-requisito de conhecimento.** Severidade 3.

**Observação e.1 — Ordenação alfabética, confirmada no código e no ecrã. Severidade 3.**
`categories.js:9-12`: `sortedCats` faz `[...bdg].sort((a,b) => a.nm.localeCompare(b.nm,'pt'))` — sempre alfabético, sem exceção. É usado em todos os seletores: `AddExpenseSheet.jsx:106`, `CatManagerModal.jsx:48`, `RecModal.jsx:73`, `RulesModal.jsx:29`, `ImportStatementSheet.jsx:87`, `CardsView.jsx:25`. O comentário de topo do ficheiro (`categories.js:1-7`) trata "alfabético" como a correção de um bug (FIX 3), ou seja, foi uma escolha deliberada.
Consequência visível em `modal-add.png`: a ordem é Animais, Carro, Combustível, Compras, Despesas Bernardo, Empregada, Ginásio, Lazer, Negócio, Outros, Prestação Casa, Restauração, Saúde, Seguros, Subscrições, Supermercado, Telecom, Transferências. As duas categorias que dominam os dados deste utilizador — **Supermercado** (445,20 €) e **Restauração** — estão nas posições 16 e 12 de 18. "Animais" e "Carro", que não têm despesas nenhumas, ocupam as duas primeiras células.

**Observação e.2 — Existem regras automáticas, mas escondidas. Severidade 2.**
`RulesModal.jsx` existe e funciona, e `applySameBeneficiaryCategory` (`dedupe.test.js:66-77`) propaga retroativamente a categoria a todas as linhas do mesmo beneficiário. Nenhum dos dois aparece em `modal-more.png` nem em `modal-settings.png` (visíveis até y≈830 e y≈800 respetivamente).

---

### (f) Navegação temporal

Ver H4.2 (severidade 3) para os três padrões, e H2.1 (severidade 3) para "Q1" vs "3M".

**Observação f.1 — Tabs sem qualquer navegação temporal, embora mostrem dados datados. Severidade 2.**
`rich-cards.png` y≈490-1105: "DESPESAS DO CARTÃO (9)" lista despesas de **20 mar a 20 set** numa app cujo cabeçalho diz "Setembro 2026", sem seletor de período. `rich-transfers.png`, `rich-rec.png`, `rich-invest.png`, `rich-goals.png`: idem, sem seletor.

**Observação f.2 — O mesmo mês tem dois totais de despesa. Severidade 3.**
`rich-cal.png` y≈206: "DESPESA **-751 €**" para Setembro. `rich-expenses.png` y≈84 e y≈375: "**675 €**" / "674,98 €" para Setembro. `rich-report.png` y≈295: "DESPESA TOTAL **675 €**" para Set 26. Dois ecrãs concordam, um discorda em 76 €, e nada no ecrã explica a diferença (presumivelmente recorrentes por lançar, mas o utilizador não o pode saber).

---

### (g) Privacidade — modo "saldos ocultos"

**Estado da arte.** Monzo, Revolut e N26 mascaram o saldo **e** achatam ou removem o gráfico; a ideia é que o ecrã não deixe inferir a situação a quem esteja a olhar por cima do ombro. O Finary mascara valores e percentagens.

**Observação g.1 — O modo oculto não tem efeito nenhum em Despesas e em Fiscal. Severidade 4.**
`shasum` de `hidden-expenses.png` = `shasum` de `rich-expenses.png` = `b60373609d74e55226a24b4e21a544c831f91f50`. `shasum` de `hidden-tax.png` = `shasum` de `rich-tax.png` = `adb1d7f6fdba922002f30b55ab6d86e132e9016c`. **Ficheiros byte-a-byte idênticos.** Confirmado no código: `state.balancesHidden` só é lido por `Hero.jsx:26`, `ChartsView.jsx:63`, `TransfersView.jsx:17`, `CardsView.jsx:20`, `OverviewView.jsx:226`, `LoanView.jsx:40`, `InvestmentsView.jsx:17` — **e por mais nenhum ficheiro**. Ficam de fora `ExpensesView`, `TaxView`, `ReportView`, `IncomesView`, `RecurringView`, `GoalsView`, `CalendarView`, `GroupsView`. Com o modo ativo, `hidden-expenses.png` continua a mostrar "GASTOS DO MÊS 675 €" (y≈84), "674,98 €" (y≈375) e os 6 orçamentos com valores; `hidden-tax.png` continua a mostrar "326,31 €", "Gasto 1276,40 €", "Gasto 420,00 €", "Gasto 474,60 €".

**Observação g.2 — A ContextStrip nunca mascara. `hidden-cards.png` y≈84: "DÍVIDA DOS CARTÕES **462 €**". Severidade 3.**
`ContextStrip.jsx` não contém uma única referência a `balancesHidden` (verificado por `grep -c` = 0). O resultado é visualmente absurdo: em `hidden-cards.png` o cartão está mascarado ("DÍVIDA ATUAL ••••", y≈256; "•••• de •••• de plafond", y≈314) e o valor exato está impresso 170 px acima.

**Observação g.3 — Os cartões de insight vazam montantes brutos. `hidden-overview.png` y≈1230-1400. Severidade 3.**
"COMPRA 4174 PINGO DOCE LISBOA · **400,00 €** · 8.8× o habitual (**45,20 €**)" · "Netflix · **10,99 €** duas vezes" · "Este mês **445€** · média dos últimos meses **45€**." Todos legíveis com o modo oculto ativo.

**Observação g.4 — Rácios, percentagens e formas de gráfico continuam todos expostos. Severidade 3.**
`hidden-overview.png` y≈0-500: o chip "+10.0%" no hero (y≈103), a sparkline do património (y≈205-235), a barra de alocação e a legenda completa "Liquidez 28% · Poupança 45% · Investimentos 27%" (y≈285-307), "0% vs média" (y≈534), "(89% do rendimento)" (y≈591). Mais abaixo: "Poupança **69%**" (y≈935), a barra empilhada do Plano do Mês com as proporções intactas (y≈1027), a barra de progresso do "Podes gastar" (y≈855), e a barra de utilização do plafond em `hidden-cards.png` y≈332. O mascaramento é apenas ao nível do numeral: a situação financeira continua inteiramente inferível.

**Observação g.5 — O que funciona. Severidade 0.**
Onde está implementado, está bem feito: `••••` mantém a linha de base e a largura, os rótulos ("gastos", "liquidez", "de plafond") continuam visíveis para dar contexto, e o botão do olho tem `aria-label` que descreve a ação e o custo ("Mostrar saldos (PIN/FaceID)", `OverviewView.jsx:540`).

---

### (h) Confiança e honestidade — números sem base declarada

| # | Número | Onde | Falta | Sev. |
|---|---|---|---|---|
| h.1 | **"+10.0%"** no hero | `rich-overview.png` y≈103 | Nenhum período. `Hero.jsx:35` calcula `(C.aD/|baseNW|)*100`, mas o chip não diz sobre o quê nem desde quando. Repetido 5× em `rich-charts.png` (y≈260, 455, 578, 905, 1030), sempre "+10.0%", inclusive em séries com valor 0,00 €. | 3 |
| h.2 | **"0% vs média"** | `rich-overview.png` y≈534 | A média não é mostrada em lado nenhum, nem o número de meses que a compõem. Compare-se com o cartão de anomalia 900 px abaixo, que **mostra**: "Este mês 445€ · média dos últimos meses 45€." | 3 |
| h.3 | **Património: 17 898 € vs 14 300 €** | `rich-charts.png` y≈84 ("PATRIMÓNIO LIQUIDO 17 898 €" na ContextStrip) vs y≈192 ("PATRIMÓNIO 14 300 €") e y≈260 ("Património líquido 14 300,00 €") | Dois valores para o mesmo indicador, com o mesmo nome, **no mesmo ecrã, a 108 px de distância**. Nada explica a diferença de 3 598 €. | 4 |
| h.4 | **Investimentos: 5000 € vs 3570 €** | `rich-overview.png` y≈1450 ("INVESTIMENTOS 5000 €") e y≈3105 ("Investimentos · 1 contas · 28% · 5000 €") vs `rich-invest.png` y≈84 e y≈202 ("POSIÇÕES / CARTEIRA 3570 €") | Diferença de 1 430 € entre a conta de investimento e a soma das posições, sem reconciliação. | 3 |
| h.5 | **Percentagens que não somam 100** | `rich-overview.png` y≈307 (28+45+27 = 100) vs y≈2900-3110 ("Liquidez 28%", "Poupança 46%", "Investimentos 28%" = **102%**) | Arredondamentos calculados por caminhos diferentes sobre os mesmos 18 360 €. | 2 |
| h.6 | **"Ativos Totais" = "Património Liquido"** | `rich-charts.png` y≈455 e y≈578, ambos "14 300,00 € +10.0%" | Dois nomes distintos com valor idêntico, quando o Resumo diz "Ativos 18 360 € · Dívida 462 €" (y≈180) — ou seja, ativos e património **não** são iguais. | 3 |
| h.7 | **"52.8 meses cobertos"** | `rich-overview.png` y≈2600 | A base **é** declarada ("Reserva: 13 360 € · Despesa/mês: 253 €", y≈2645), e isso é bom. Mas 253 € é o total de **Agosto**, um mês atípico, e o cartão do ritmo 1 700 px acima projeta 4 869 €/mês para Setembro. Com esse valor a reserva cobre 2,7 meses, não 52,8. O número está tecnicamente fundamentado e materialmente enganador. | 3 |
| h.8 | **"Saúde financeira 86/100"** | `rich-overview.png` y≈1490 | **É explicado, e bem.** Cinco sub-scores com pontuação e evidência ("Fundo de emergência 30/30 · 52.8 meses", "Adesao ao orcamento 5/15 · 2/6 categorias") e uma recomendação acionável ("PARA SUBIR O SCORE · 01 Reve os limites das categorias que ultrapassaste este mês"). O que não é explicado é a **ponderação** (porque vale o fundo de emergência 30 pontos e as metas 10) nem o que separa "Excelente" de "Bom". | 1 |
| h.9 | **"ANO 2026 · 2193 € · média 313 €/mês"** | `rich-report.png` y≈870 | 2193/313 = 7,0 meses. O ano tem 8 meses decorridos e o gráfico mostra 7 barras cinzentas e 1 azul. Não é dito se a média divide por meses decorridos, meses com dados, ou meses fechados. | 2 |
| h.10 | **"▼ 0%" a verde** | `rich-report.png` y≈1090, 1195, 1300, 1405 | Ver observação c.3. | 3 |
| h.11 | **Séries de 2 pontos rotuladas "Jan"/"Fev"** | `rich-charts.png` y≈360-1130 (5 gráficos) | A app está em Setembro de 2026 e todos os gráficos de evolução mostram apenas Jan→Fev. | 3 |

---

### (i) Estados vazios e primeira utilização

**Observação i.1 — Não é possível avaliar os estados vazios a partir destas capturas. Ver §3.1.**
`empty-overview.png`, `empty-expenses.png`, `empty-cards.png` e `empty-tax.png` mostram todos a folha **"Novidades"** (changelog) a cobrir o ecrã de y≈100 até ao fundo. O conteúdo vazio por baixo é ilegível.

**Observação i.2 — O changelog abre por cima de utilizadores genuinamente novos. `empty-*.png`, os quatro. Severidade 3.**
`Shell.jsx:252-257` tem a guarda certa na intenção — `if (!isNewUser(state) && hasUnseenNotes(...)) open('patchNotes')` — mas passa `state` **sem** `currentUser`. E `isNewUser` (`finance.js:377-378`) começa por `if (isPreviewMode(state)) return false;`, com `isPreviewMode = (state) => !(state && state.currentUser)` (`finance.js:142-143`). Sem `currentUser` no objeto, `isPreviewMode` é sempre `true`, `isNewUser` devolve sempre `false`, e a guarda nunca dispara. Compare-se com `Onboarding.jsx:20-22`, que faz a coisa certa: `const s = { ...state, currentUser }; if (!isNewUser(s)) return null;`.
O efeito é o que os screenshots mostram: um utilizador sem um único dado é recebido por uma lista de alterações que descreve funcionalidades que nunca viu e ecrãs onde nunca esteve — "nas tuas Despesas entra só a tua parte das despesas de grupo", "aparecem no topo do Resumo", "se também importares o extrato do banco… apaga essa linha para não contar a despesa duas vezes".

**Observação i.3 — O onboarding que existe por baixo é bom. `Onboarding.jsx:29-49`. Severidade 0 (no design), mas não observável nas capturas.**
Quatro passos numerados com uma ação primária clara e ordem justificada em comentário: 01 "Regista o teu rendimento mensal" → 02 "Importa o extrato do banco (Excel ou CSV)" → 03 "Adiciona as tuas contas e cartões" → 04 "Cria uma meta de poupança", com a explicação "Com o rendimento e o extrato, a app diz-te quanto podes gastar por dia e classifica as despesas sozinha. Tu defines o ritmo." A ordem está pensada (sem rendimento o "Podes gastar" não funciona, por isso é o passo 1).

**Observação i.4 — Posição do onboarding relativa à dobra. `Shell.jsx:322-324`. Severidade 2.**
No layout móvel a ordem é `<Hero />` → `<Onboarding />` → `<View />`. O Hero de um utilizador vazio ainda ocupa y≈65-312 (hero + barra de alocação), logo o cartão "Começa em quatro passos" arranca em torno de y≈325 — acima da dobra, mas o **passo 04** cai provavelmente por baixo dela. Não confirmável nestas capturas.

---

### (j) Confirmação e reversibilidade em ações de dinheiro

| Ação | Confirmação | Undo | Ficheiro:linha | Sev. |
|---|---|---|---|---|
| Apagar despesa | `confirm()` nativo — "Remover esta despesa?" | não | `ExpensesView.jsx:145` | 3 |
| Apagar **todas** as despesas do mês | `confirm()` nativo com contagem e explicação | não | `ExpensesView.jsx:453` | 3 |
| Apagar despesa de cartão | `confirm()` nativo | não | `CardsView.jsx:34` | 3 |
| Apagar transferência | `confirm()` nativo — menciona a reversão dos saldos | não | `TransfersView.jsx:21` | 3 |
| Apagar conta | `confirm()` nativo — menciona as leituras de saldo | não | `OverviewView.jsx:935`, `AcctModal.jsx:124` | 3 |
| Apagar posição / crédito / pessoa / grupo / despesa de grupo | `confirm()` nativo | não | `PositionModal.jsx:50`, `HousingModal.jsx:75`, `PersonSheet.jsx:90`, `GroupSheet.jsx:155,207`, `GroupExpenseSheet.jsx:276` | 3 |
| **Reservar N € para as metas** | **nenhuma** | **não** | `OverviewView.jsx:451-456` → `:246-249` | 3 |
| Pagar dívida do cartão | nenhuma (o modal é a confirmação) | não | `CardPayModal.jsx` | 2 |
| Apagar tudo / restaurar backup | `confirm()` **duplo** | não | `SettingsSheet.jsx:141,174,179` | 1 |
| Importar linhas duplicadas | `confirm()` com contagem | não | `ImportStatementSheet.jsx:320` | 0 |
| Escritas do assistente de IA | não | **sim — "Anular"** | `AssistantSheet.jsx:56-74`, `tokens.css:220-221` | 0 |

**Observação j.1 — Severidade 3.** O único fluxo com undo é o do assistente de IA. Todas as eliminações manuais de dinheiro real dependem de uma caixa `confirm()` do sistema operativo, sem estilo e sem contexto visual do que vai desaparecer. O componente `.toast.undo` já está escrito e estilizado em `tokens.css:220-221` — a infraestrutura existe e não está a ser usada onde mais importa.

**Observação j.2 — O texto de alguns `confirm()` é exemplar. Severidade 0.**
`ExpensesView.jsx:453`: "Remover as N despesas de Set? Inclui manuais e importadas. Depois podes reimportar o extrato." Diz o quantos, o quê, e o caminho de recuperação. `TransfersView.jsx:21` e `OverviewView.jsx:935` fazem o mesmo. É o conteúdo certo no recipiente errado.

**Observação j.3 — O botão destrutivo em massa não é destrutivo à vista. `rich-expenses.png` y≈1180. Severidade 2.**
"Remover as 10 despesas de Set (para reimportar o extrato)" tem contorno tracejado cinzento e texto azul-escuro, no fluxo normal da página. `quick-reference.md` §8 `destructive-emphasis` pede cor semântica de perigo e separação visual.

---

### (k) Insights e alertas

**Estado da arte.** Copilot e Monzo mostram **um** insight de cada vez, explicam o "porquê" em linguagem natural e permitem dispensar.

**Proof — quantos aparecem de uma vez no Resumo:** 3 cartões de anomalia (`rich-overview.png` y≈1195-1445), mas o ecrã tem no total **7 blocos de natureza consultiva**: Fecho de Agosto (y≈510), aviso de ritmo em painel rosa (y≈865), os 3 insights, Saúde financeira com recomendação (y≈1490), Subscrições detetadas com 5 propostas (y≈2180), Fundo de emergência (y≈2530), Projeção 3 meses (y≈2755).

**Observação k.1 — Estão ranqueados. `anomalies.js:126`. Severidade 0.**
`out.sort((a,b) => b.severity - a.severity || b.amount - a.amount).slice(0, limit)` — ordenados por severidade e depois por montante, com limite. É exatamente o que o padrão pede.

**Observação k.2 — Explicam o porquê com evidência. `rich-overview.png` y≈1230-1445. Severidade 0.**
"COMPRA 4174 PINGO DOCE LISBOA · 400,00 € · **8.8× o habitual (45,20 €)**" · "Netflix · 10,99 € **duas vezes**" · "Supermercado +885% vs média — **Este mês 445€ · média dos últimos meses 45€**". Cada um traz o número, o comparador e o rácio. É melhor do que a maioria das apps de referência.

**Observação k.3 — São dispensáveis, com o rótulo certo. `OverviewView.jsx:489-500`. Severidade 0.**
Botão ✓ com `aria-label="Está certo, dispensar aviso"` e toast de confirmação. O rótulo enquadra a ação como "isto é um falso positivo", que é a leitura correta.

**Observação k.4 — Alvo de toque do botão de dispensar. `OverviewView.jsx:500`: `width: 32, height: 32`. Severidade 3.** Ver §2.3.

**Observação k.5 — Sete conselhos a competir pela mesma atenção. Severidade 3.**
Os 3 insights estão ranqueados entre si, mas não estão ranqueados contra os outros 4 blocos consultivos. Nada diz ao utilizador qual dos sete é o que importa hoje. É o oposto do "um insight de cada vez" do Copilot.

**Observação k.6 — Os insights contradizem-se com os cartões vizinhos. Severidade 3.**
O painel rosa diz "2669 € acima do rendimento" (y≈880) e o cartão 60 px acima diz "Poupança **69%**" a verde (y≈940). Um alerta e um elogio sobre o mesmo mês, adjacentes.

**Observação k.7 — "Não e". `rich-overview.png` y≈2280, 2340, 2400. Severidade 2.**
O botão secundário de cada subscrição detetada diz "Não e" — sem acento e semanticamente pouco claro (não é o quê?). Ao lado de "Adicionar", que é um verbo, a assimetria confunde.

---

### (l) Grupos (modelo Splitwise)

**Estado da arte (Splitwise).** grupo → despesa com **quem pagou** → **como se divide** (igual / valores exatos / percentagens) → **saldos por pessoa** → **plano de acerto com o mínimo de transferências** → **registar o acerto**.

**Proof — os seis passos existem, todos.**
- Grupo com avatar, membros e datas: `depois/groups.png` y≈490-540.
- Quem pagou: `GroupExpenseSheet.jsx:381-383` ("Quem pagou").
- Modos de divisão: `GroupExpenseSheet.jsx:112` (`mode: entry.splitMode || 'equal'`) com igual / valores exatos / percentagens (`:2-3`, `:432`), matemática isolada em `lib/split.js` (`resolveShares`).
- Saldos por pessoa: `GroupsView.jsx:415` (`BalanceBar` por membro).
- Plano de acerto: `SettleSheet.jsx:117-118` refere explicitamente "uma linha do plano já calculado em Saldos".
- Registar acerto: `SettleSheet.jsx:184` cria `{ kind: 'settlement', fromId, toId, amount, date, method }`, e `:3-5` garante que um acerto **não** entra nas despesas pessoais.

**Observação l.1 — O modelo mental está completo e correto. Severidade 0.** Não falta nenhum passo do modelo Splitwise.

**Observação l.2 — A reconciliação com o extrato bancário é a peça em falta, e a app sabe-o. Severidade 3.**
`empty-overview.png` y≈445 (nota das Novidades): "se também importares o extrato do banco, o valor total que pagaste entra nas Despesas — apaga essa linha para não contar a despesa duas vezes." O problema é reconhecido, mas a solução oferecida é uma instrução manual escondida num changelog. Nada no ecrã de Despesas nem no de importação avisa sobre a dupla contagem no momento em que ela acontece.

**Observação l.3 — Nome do grupo invisível. `depois/groups.png` y≈497 ("Férias Algarve" a branco sobre claro). Severidade 4.** Ver H9.2 — mesmo padrão de `GroupsView.jsx:79`.

**Observação l.4 — Sobreposição de avatares e texto. `depois/groups.png` y≈505-530. Severidade 3.**
A pilha de avatares (T/A/JO) está inline e colide com "300,00 € · 12 ago – 19 ago", que por sua vez quebra em duas linhas e encosta a "Devem-te 150,00 €".

**Observação l.5 — A ContextStrip de Grupos transborda. `depois/groups.png` y≈75-115. Severidade 2.**
"1 GRUPO ATIVO" quebra em duas linhas à esquerda e "a receber 150 € · a pagar 0 €" quebra em duas linhas à direita, dentro de uma faixa desenhada para uma linha. Fonte: `ContextStrip.jsx:78-80`, que concatena dois valores num único campo `val`.

**Observação l.6 — Sem indicador de divisão nas despesas pessoais. Severidade 2.**
`AddExpenseSheet.jsx:188` confirma que a app guarda a distinção (`d.shared ? 'Despesa partilhada adicionada (… tua parte)' : 'Despesa adicionada'`), mas nenhuma linha em `rich-expenses.png` ou `rich-cards.png` mostra um marcador de "esta é a tua parte de uma despesa de grupo".

---

## 2.3 — Convenções de plataforma (Apple HIG + Material 3)

### Barra de navegação inferior

**Conforme. Severidade 0.** `Shell.jsx:193-224`: 4 tabs rotuladas (Resumo · Despesas · Metas · Mais) + botão central. Cinco slots, dentro do limite M3 de 5 (`quick-reference.md` §9 `bottom-nav-limit`). Ícone **e** rótulo em todos (`nav-label-icon`). `aria-current="page"` no ativo. Altura `calc(var(--nav-h) + var(--safe-bottom))` = 64 px + safe area (`tokens.css:196`), com `padding` lateral que soma `--safe-left`/`--safe-right`. O conteúdo reserva espaço com `.has-bnav { padding-bottom: calc(var(--nav-h) + var(--safe-bottom) + 16px) }` (`tokens.css:241`) — `fixed-element-offset` cumprido.

**Violação 3.1 — Rótulos da nav a 10 px. `tokens.css:197` (`font-size:10px`), visível em todos os screenshots a y≈824. Severidade 3.**
Maiúsculas com `letter-spacing:0.06em`. O mínimo do HIG para rótulos de tab bar é 10 pt / 11 pt e o piso geral de `quick-reference.md` §6 é 12 px. Não há suporte a Dynamic Type: o tamanho é fixo em px e a `.bnav` tem altura fixa, pelo que texto ampliado pelo sistema transborda ou trunca (`quick-reference.md` §1 `dynamic-type`).

**Violação 3.2 — Sub-navegação dentro do slot de nav de topo. `Shell.jsx:205`. Severidade 3.**
`bottom-nav-top-level` de M3: a nav inferior é só para ecrãs de topo. Aqui 12 destinos estão aninhados atrás de "Mais", que fica com `.on` em todos eles. Ver H6.2.

**Violação 3.3 — Dois FABs sobrepostos verticalmente. `rich-goals.png` y≈737 e y≈820. Severidade 3.** Ver H4.1.

### Folhas (sheets)

**Conforme. Severidade 0.** Grabber (`tokens.css:227`, visível em `modal-action.png` y≈101, `modal-add.png` y≈101, `modal-more.png` y≈101), arrastar para fechar (`Sheet.jsx:100-142`), toque no scrim (`Sheet.jsx:164-167`), `Escape` (`:46`), safe-area no fundo (`tokens.css:226`: `padding: 14px 16px calc(20px + var(--safe-bottom))`), `max-height: 90dvh` — com um comentário explícito a explicar porque não é `vh` (`Sheet.jsx:152-153`). Scrim `rgba(11,18,32,0.40)` + `blur(8px)` no claro e `rgba(0,0,0,0.55)` no escuro (`tokens.css:224-225`), dentro da banda 40-60% de `pro-rules.md`.

**Violação 3.4 — Duas linguagens de dispensa entre folhas. `modal-action.png` y≈802 ("Cancelar" de largura total) vs `modal-add.png` y≈133 (X no canto). Severidade 2.**
`ActionSheet` e `MoreMenu` usam padrões diferentes de fecho entre si (`modal-more.png` tem X, `modal-action.png` tem "Cancelar"), apesar de serem o mesmo tipo de folha de escolha.

**Violação 3.5 — Sem confirmação ao dispensar uma folha com dados por gravar. Severidade 2.**
`Sheet.jsx:164-167` fecha imediatamente ao toque no scrim, e `:46` ao `Escape`. Com o `AddExpenseSheet` meio preenchido, o rascunho perde-se. `quick-reference.md` §8 `sheet-dismiss-confirm` e `form-autosave`.

### Alvos de toque

**Violação 3.6 — `.icon-btn` a 36×36 px, sem expansão de área. `tokens.css:167`. Severidade 3.**
Aplica-se a: toggle de tema (`rich-overview.png` y≈26), botão do olho de privacidade (`rich-overview.png` y≈1372), lápis de editar meta (`rich-goals.png` y≈258 e y≈478), lápis de receita (`rich-income.png` y≈456), lápis+caixote de recorrente (`rich-rec.png` y≈396), caixote de transferência (`rich-transfers.png` y≈229), caixote de despesa de cartão (`rich-cards.png` y≈540), X de fecho das folhas (`modal-add.png` y≈133). Mínimo HIG 44×44 pt, M3 48×48 dp.

**Violação 3.7 — Botão de dispensar insight a 32×32 px. `OverviewView.jsx:500`; `rich-overview.png` y≈1230, 1315. Severidade 3.**
Ainda menor que o `.icon-btn` base, e é o alvo mais consequente da lista (dispensa um alerta financeiro).

**Violação 3.8 — Chips de reforço rápido de meta a ~32 px de altura. `GoalsView.jsx:227` (`padding: '8px 0'`); `rich-goals.png` y≈378-406 e y≈597-625. Severidade 3.**
Quatro alvos lado a lado, cada um com ~85×32 px, e cada toque move dinheiro real para uma meta. É simultaneamente o melhor atalho da app (§2.5) e um dos seus piores alvos.

**Violação 3.9 — Pontos do calendário a ~4 px. `rich-cal.png` y≈340-530. Severidade 2 (como alvo) / 3 (como sinal — ver H6.5).**

### Tipografia

**Violação 3.10 — Sem suporte a Dynamic Type. Severidade 3.**
Todos os tamanhos em `tokens.css` e nos estilos inline são `px` fixos: `.lb` 11 px (`:140`), `.m` 13 px (`:139`), `.chip` 11 px (`:162`), `.sheet-text-sub` 12 px (`:232`), `.bnav-btn` 10 px (`:197`), `.crumb` 11 px (`:236`), e dezenas de `fontSize: 10/11/12/13` inline nas vistas. `pro-rules.md` exige verificação com Dynamic Type no maior tamanho; `quick-reference.md` §1 `dynamic-type` pede que não haja truncagem à medida que o texto cresce. Vários contentores têm altura fixa (`.bnav`, `.icon-btn`, `.sheet-icon`).

**Violação 3.11 — Etiquetas de secção a 11 px maiúsculas com `letter-spacing: 0.1em`. `tokens.css:140`. Severidade 2.**
`.lb` é a classe de todos os cabeçalhos de cartão ("PODES GASTAR", "DISPONÍVEL", "SAÚDE FINANCEIRA", "PROJECAO 3 MESES", "CATEGORIA", "VALOR (€)"). Onze pixéis, em maiúsculas, com tracking alargado, em `--fg-subtle` — é o texto estrutural mais pequeno e menos contrastado da app.

**Positivo — inputs a 16 px. `tokens.css:113-114`. Severidade 0.**
`input, select, textarea { font-size: 16px }` e a repetição explícita para todos os `type` relevantes. Evita o auto-zoom do iOS (`quick-reference.md` §5 `readable-font-size`). Bem visto.

**Positivo — `inputMode="decimal"` nos campos de valor. `AddExpenseSheet.jsx:346,388`. Severidade 0.** Teclado numérico correto (`quick-reference.md` §8 `input-type-keyboard`).

### Contraste e temas

**Positivo — a paleta foi auditada e corrigida, com o raciocínio no ficheiro. `tokens.css:20-35, 84-89`. Severidade 0.**
Comentários explícitos: "`--fg-subtle`: era `#9aa3b5` = 2,3:1 — ilegível ao sol; agora ≥4,6:1"; "os valores antigos (`#3b6fee`/`#7b5fe0`) ficavam a 4,1:1"; "eram `#3fc97a` (2,0:1), `#f5a623` (1,9:1) e `#f25555` (3,1:1) usados como texto; agora todos ≥4,6:1". Existe um conjunto completo de tokens escuros (`:76-104`), incluindo uma correção documentada para `--fg-subtle` no escuro.

**Violação 3.12 — `color-scheme: light dark` em `:root` sem tokens condicionais. `tokens.css:13`. Severidade 4 (por via do efeito observado em H9.2).**
A declaração autoriza o UA a resolver cores de sistema (como `buttontext`) na variante escura, mas a paleta de autor só troca via `html[data-theme="dark"]`. Qualquer elemento que dependa da cor herdada do UA — `<button>` sem `color` explícito — pode renderizar claro sobre claro. É a causa provável do texto invisível em `InvestmentsView.jsx:68,75` e `GroupsView.jsx:79`.

### Movimento

**Positivo. `tokens.css:112,198,204,210`. Severidade 0.**
`button:active { transform: scale(0.96) }`, `.bnav-btn:active { scale(0.92) }`, `.fab`/`assistant-fab :active { scale(0.88) }` — feedback de pressão sem deslocar o layout (`pro-rules.md` "Stable Interaction States"). Durações 0,15-0,3 s com `--ease-ios: cubic-bezier(0.32,0.72,0,1)` (`tokens.css:73`), dentro da banda 150-300 ms.

**Violação 3.13 — Sem `prefers-reduced-motion`. Severidade 2.**
`grep` a `tokens.css` não devolve nenhuma media query de movimento reduzido, apesar de existirem `animation: fadeIn`, `slideUp`, `.fadeUp`, `pulse` (`tokens.css:219,226`, `SyncChip`). `quick-reference.md` §1 `reduced-motion`.

---

## 2.4 — Gestalt e hierarquia visual (Refactoring UI)

### Proximidade

**G.1 — O agrupamento por cartão funciona; o agrupamento **entre** cartões não. `rich-overview.png`, todo o scroll. Severidade 3.**
Os 14 blocos estão separados por um `margin-bottom` uniforme de 16 px. "Podes gastar" (decisão de hoje), "Plano do mês" (alocação deste mês) e "Fecho de Agosto" (retrospetiva do mês passado) — três horizontes temporais diferentes — estão à mesma distância um do outro que "Saúde financeira" está de "Subscrições detetadas". Não há nenhum ritmo vertical em camadas (`pro-rules.md` "Section spacing hierarchy": 16/24/32/48).

**G.2 — Excelente proximidade dentro da linha de categoria. `rich-expenses.png` y≈600-690 (Supermercado). Severidade 0.**
Ícone → nome → chip de rollover → gasto/limite; depois barra; depois %+sparkline à esquerda e "Resta" à direita. Três faixas horizontais bem definidas dentro de 90 px.

### Semelhança

**G.3 — Nove `.cd` visualmente idênticos com nove papéis diferentes no Resumo. Severidade 3.**
`tokens.css:141`: `.cd { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: var(--shadow) }` — uma só receita. No Resumo carrega: **Grupos** (y≈420, informação sobre terceiros), **Podes gastar** (y≈740, decisão), **Plano do mês** (y≈960, ação), **Disponível** (y≈1350, factual), **Saúde financeira** (y≈1440, avaliação), **Subscrições detetadas** (y≈2160, proposta), **Fundo de emergência** (y≈2500, avaliação), **Projeção 3 meses** (y≈2740, previsão), **Contas por categoria** (y≈3130, factual). Nove papéis, um único tratamento visual.
As únicas exceções que quebram o padrão — e funcionam — são a barra ocre à esquerda de "Fecho de Agosto" (y≈510-720) e as barras verticais vermelhas dos três insights (y≈1195-1445).

**G.4 — Barras verticais coloridas usadas com duas gramáticas diferentes. Severidade 2.**
`rich-overview.png` y≈1195: barra **vermelha à esquerda do cartão inteiro** = severidade do alerta. `rich-overview.png` y≈3130: barra **azul/verde/roxa à esquerda da linha** = identidade da categoria. `rich-income.png` y≈420: barra à esquerda = tipo de receita. Mesmo elemento gráfico, três significados.

### Figura/fundo

**G.5 — O gradiente do hero é o elemento mais forte do ecrã e não contém a informação mais importante. `rich-overview.png` y≈65-275. Severidade 3.**
`--grad-hero: linear-gradient(135deg,#3b6fee,#7b5fe0)` com `--shadow-hero: 0 12px 30px rgba(59,111,238,0.26)` (`tokens.css:55,66`), 210 px de altura, número a ~44 px, branco sobre saturado. É a única superfície colorida acima da dobra. Ganha a competição de atenção contra "Podes gastar", que está 490 px abaixo, em texto escuro sobre `#f4f6fa`.

**G.6 — Cartão de cartão de crédito com figura/fundo correto. `rich-cards.png` y≈125-290. Severidade 0.**
Superfície escura, dígitos mascarados, "DÍVIDA ATUAL / 461,98 €" a branco. A metáfora física do cartão está bem executada e distingue-se imediatamente de tudo o resto na app.

### Uma ação primária por ecrã

| Ecrã | CTA cheio azul | Severidade |
|---|---|---|
| `rich-overview.png` | 1 — "Reservar 200,00 € para as metas" (y≈1108). Mas é irreversível e não confirma (H3.3). | 3 |
| `rich-transfers.png` | 1 — "+ Nova transferência" (y≈145) | 0 |
| `rich-cards.png` | 1 — "Pagar dívida" (y≈393), com "+ Despesa no cartão" corretamente secundário | 0 |
| `rich-invest.png` | 1 — "+ Posição" (y≈160) | 0 |
| `depois/groups.png` | 1 — "+ Novo grupo" (y≈413) | 0 |
| `rich-goals.png` | **0** — 8 chips de reforço, nenhum CTA para criar meta | 2 |
| `rich-expenses.png` | **0** — nenhuma ação primária; a única ação de largura total é destrutiva (y≈1180) | 3 |
| `rich-report.png`, `rich-charts.png`, `rich-cal.png` | 0 (são ecrãs de leitura) | 0 |
| `rich-income.png` | 1 — mas em **verde** (y≈377), não no azul primário da app | 2 |
| `rich-tax.png` | 1 — "Configurar IMI / IUC" (y≈907) mas em cinzento, indistinguível de um cartão | 2 |

**G.7 — Severidade 2.** Cinco tratamentos diferentes para "a ação principal deste ecrã": azul cheio, verde cheio, cinzento cheio, tracejado cinzento, e ausência.

### Cor como único sinal

**G.8 — Severidade 3.** Ver H6.5 (pontos do calendário), c.2 ("Resta" negativo a verde) e c.3 ("0%" a verde).
**Contra-exemplo positivo:** `rich-report.png` y≈1090-1405 usa **seta + cor + número** (▲ vermelho 885%, ▼ verde 0%) — a redundância certa, ainda que o valor seja o errado. E `rich-tax.png` y≈406 acrescenta o texto "NO LIMITE" à barra ocre.

### Hierarquia de texto

**G.9 — Doze tamanhos e cinco pesos numa só janela de 844 px. `rich-overview.png` y≈0-844. Severidade 3.**
Tamanhos legíveis no screenshot: 44 (hero), 24 (253 €), 18, 15, 14, 13, 12, 11 (`.lb`), 10 (`.bnav-btn`), 9 (chip de rollover), mais 13 e 11 na `.m`. Pesos: 400, 500, 600, 700, 800 (`LoanView.jsx:158` usa `fontWeight: 800`). `quick-reference.md` §6 `font-scale` pede uma escala consistente (12 14 16 18 24 32) e `weight-hierarchy` pede três pesos, não cinco.

**G.10 — A hierarquia dentro da linha de posição está invertida. `rich-invest.png`, zoom 4× da linha VWCE. Severidade 4.**
Na linha: "VWCE" (o quê) e "2200 €" (quanto) são invisíveis; "20 un.", "+200 €", "+10.0%" e "62% da carteira" são perfeitamente legíveis. Os dois dados menos importantes ganham a linha inteira. Ver H9.2.

---

## 2.5 — Economia comportamental

### Aversão à perda (Kahneman) — o Resumo enquadra ganhos ou perdas?

**B.1 — O primeiro ecrã enquadra ganho; o segundo enquadra perda; os dois falam do mesmo mês. Severidade 3.**
Acima da dobra é tudo ganho: "PATRIMÓNIO LIQUIDO 17 898,02 €" com "▲ +10.0%" (y≈103-165), "Amigos devem-te 150,00 €" a verde (y≈470), "Poupaste 1947 € (89% do rendimento)" (y≈540).
Logo abaixo da dobra é tudo perda, num painel de fundo rosa: "A este ritmo (160 €/dia) fechas o mês em 4869 € — 2669 € **acima do rendimento**" (y≈865). O enquadramento é o do défice, não o do controlo. "2669 € acima do rendimento" ativa aversão à perda máxima; "faltam-te 2669 € para fechar o mês dentro do rendimento" descreveria o mesmo facto com agência.
E as duas mensagens estão em contradição direta (ver k.6).

### Contabilidade mental (Thaler)

**B.2 — Os baldes existem e estão bem nomeados. `rich-overview.png` y≈975-1090. Severidade 0.**
"PLANO DO MÊS": Fixas (ocre) / Metas (roxo) / Livre (verde), com barra empilhada e valores. É contabilidade mental correta: cada euro tem uma casa antes de ser gasto.

**B.3 — O rollover é o mecanismo certo com a explicação errada de lugar. `rich-expenses.png` y≈545-570. Severidade 2.**
"Rollover do orçamento — O que sobra/falta transita para o mês seguinte · ON". A explicação está lá, mas o estado é a palavra "ON" a verde, não um interruptor — não parece controlável. E os chips `⇄ +250,00 €` que são a sua consequência visível (y≈645 em diante) não têm legenda no ecrã.

**B.4 — Transferências corretamente fora da contabilidade de despesa. `modal-transfer.png` y≈745. Severidade 0.**
"Não conta como despesa nem receita. Ajusta o saldo das duas contas (o património total não muda)." Impede a dupla contagem que quebra a contabilidade mental de quase todas as apps caseiras.

**B.5 — Grupos corretamente fora do património. `OverviewView.jsx:259-261`. Severidade 0.**
Comentário no código: "informação, não entra no património nem no orçamento. Some invisível quando não há grupos ativos ou tudo está acertado." Balde separado, e desaparece quando está resolvido.

### B = MAP (Fogg) — capacidade

**B.6 — Chips de reforço de meta: capacidade máxima. `rich-goals.png` y≈378-406, 597-625. Severidade 0 (design) / 3 (alvo — ver 3.8).**
+10 / +50 / +100 / +500 num toque, no ponto exato da motivação. É o melhor exemplo de "make it easy" da app.

**B.7 — Chips de marcas em Recorrentes. `rich-rec.png` y≈225-330. Severidade 0.** Ver H6.3.

**B.8 — "Pagar tudo". `modal-cardpay.png` y≈477. Severidade 0.**

**B.9 — Registar uma despesa contradiz todos os anteriores. `modal-add.png`. Severidade 4.**
A ação mais frequente da app é a que tem a maior barreira de capacidade: 18 células alfabéticas antes de qualquer coisa, e o campo do valor fora do ecrã. Ver H5.1.

### Gancho (Hooked) — gatilho → ação → recompensa → investimento

**B.10 — Não há gatilho externo. Severidade 3.**
`grep` a `src/` não devolve `Notification`, `showNotification` nem `push`. O ficheiro `lib/reminders.js` existe mas nada em `modal-settings.png` (visível até y≈800) oferece configuração de lembretes. Sem gatilho, o utilizador tem de se lembrar de abrir a app — que é exatamente o que Fogg diz que não acontece.

**B.11 — A recompensa por abrir a app existe e é variável. Severidade 0.**
"FECHO DE AGOSTO" só aparece nos primeiros dias do mês (`patchNotes.js`: "nos primeiros dias vês o balanço do mês anterior"); os insights de anomalia mudam consoante os dados. Recompensa variável, no sentido de Eyal.

**B.12 — A fase de investimento é forte. Severidade 0.**
Metas, orçamentos por categoria, regras, contas e grupos são todos dados que o utilizador constrói e que aumentam o custo de sair. A app tem investimento a sério.

**B.13 — A ação a seguir ao gatilho é ambígua. Severidade 3.**
Abrir a app apresenta 14 blocos e 7 conselhos (H8.1, k.5). Um ciclo de gancho precisa de **uma** ação óbvia por visita; aqui não há nenhuma indicada.

### "Podes gastar N €/dia" — ajuda ou envergonha?

**B.14 — Severidade 3.**
O rótulo "Podes gastar" é permissivo e correto (Monzo usa "Left to spend"). Mas o que está imediatamente por baixo é acusatório: "A este ritmo (**160 €/dia**) fechas o mês em **4869 €** — **2669 € acima do rendimento**", em texto vermelho sobre painel rosa. Não há caminho de recuperação: nem "reduz X para voltar ao rumo", nem "isto assume que o resto do mês é como os últimos 3 dias", nem um botão para ajustar. É diagnóstico sem prescrição — o padrão que o YNAB evita deliberadamente com o seu "cobrir o excesso" (roll with the punches).
Agravante estatístico: em `rich-expenses.png` y≈409 lê-se "Set parcial · 13% do mês" — a projeção de 4 869 € é extrapolada a partir de 4 dias, sem que o cartão o diga.

### Metas — progresso ou lacuna?

**B.15 — As metas dão progresso E lacuna, o que é o certo. `rich-goals.png` y≈325 e y≈480. Severidade 0.**
Anel de 27% + "800 € de 3000 €" + "100 €/mês · conclui 07/2028 (22 meses)". O anel é progresso (efeito de progresso dotado), o "de 3000 €" é a lacuna, e a data torna o objetivo concreto. O cartão global (y≈155) faz o mesmo: "6700 € de 9000 €" à esquerda e "2300 € restantes" à direita.

**B.16 — Mas o selo de estado é uma etiqueta de julgamento. `rich-goals.png` y≈258 ("atrasada", ocre). Severidade 3.**
"atrasada" nomeia a pessoa, não o plano, e não oferece saída. "no ritmo" (y≈478) é o oposto e funciona bem. O padrão do YNAB seria "+37 €/mês para chegar a tempo" — o mesmo facto, com uma ação. E o código já calcula esse número: `patchNotes.js` refere "aviso quando uma meta não chega ao prazo, **com o valor mensal que seria preciso**". O dado existe e não está no selo.

**B.17 — A meta "Fundo emergência" está a 98% e a app não celebra. `rich-goals.png` y≈480-560. Severidade 2.**
"5900 € de 6000 € · 200 €/mês · conclui 10/2026 (1 mês)". Um passo de 100 € fecha a meta e os chips +100 e +500 estão logo por baixo. Nenhum destaque, nenhum "faltam 100 € — fecha agora". É o momento de maior motivação da app inteira, tratado como uma linha qualquer.

---

## 2.6 — Jobs-to-be-done

### JTBD 1 — "Quando abro a app de manhã, quero saber se posso gastar hoje sem estragar o mês, para decidir o almoço sem culpa."

*(Este é o job declarado como tarefa primária no `00-scope.md`.)*

**Caminho:** abrir → Resumo → **scroll de ~490 px** → ler "Podes gastar".

**Fricção observada:**
- O número está em y≈763+, atrás da nav fixa e abaixo da dobra (H1.1, severidade 3).
- Antes dele passam 5 blocos, incluindo o balanço do **mês anterior** ("FECHO DE AGOSTO", y≈510-720), que não responde à pergunta de hoje.
- Ao chegar, encontra três respostas simultâneas e incoerentes: o próprio "Podes gastar", o painel vermelho que diz "2669 € acima do rendimento" (y≈880), e "Poupança 69%" a verde (y≈940) (d.1, k.6, severidade 3).
- O primeiro número grande do ecrã (17 898,02 €) responde a um job diferente: "quanto valho".

**Contraste:** no Monzo esta pergunta é respondida no pixel zero, sem scroll.

### JTBD 2 — "Quando acabo de pagar alguma coisa, quero registá-la em segundos, para não ter de me lembrar mais tarde."

**Caminho:** FAB `+` → "Nova despesa" → grelha de 18 categorias → descrição → **scroll** → valor → "Adicionar despesa". **Mínimo 4 toques + 1 scroll + 2 campos de texto.**

**Fricção observada:**
- O campo do **valor** não é visível na folha aberta; o botão de submeter é (H5.1, severidade 4).
- A grelha é alfabética, com "Animais" e "Carro" (zero despesas) antes de "Supermercado" (445 €) e "Restauração" (e.1, severidade 3).
- Dois rótulos partem a meio da palavra: "Supermerca-do", "Transferênci-as" (H5.2).
- A categoria "Transferências" contradiz o próprio ActionSheet (H2.3, severidade 3).
- A rota de menor esforço é, na prática, **outra**: `modal-stmt.png` ("Importar extrato: Câmara / Ficheiro") ou "Scan recibo" (`modal-action.png` y≈565, "IA extrai e classifica"). Ambas resolvem o job muito melhor, e ambas estão enterradas na mesma lista plana de 9 opções sem ação primária (H7.3).

### JTBD 3 — "Quando vejo o extrato ao fim do mês, quero perceber para onde foi o dinheiro, para mudar alguma coisa no mês seguinte."

**Caminho A (Despesas):** tab Despesas → ver 6 orçamentos por categoria → **tocar numa categoria para expandir** → ver as transações lá dentro.
**Caminho B (Relatório):** Mais → Relatórios → "POR CATEGORIA · VS MÊS ANTERIOR" + "MAIORES DESPESAS" + "ONDE PODES POUPAR".

**Fricção observada:**
- Não existe um feed cronológico de transações em lado nenhum (b.1, severidade 3). Para ver o que se passou é preciso saber em que categoria procurar, ou escrever no campo de pesquisa.
- "MAIORES DESPESAS" (`rich-report.png` y≈1290-1560) é a lista mais próxima de um feed e **não tem datas nem sinal**, e uma das cinco linhas tem o rótulo colado ao valor (H9.4, severidade 3).
- As comparações "vs mês anterior" mostram "▼ 0%" a verde para categorias sem mês anterior (c.3, severidade 3).
- Os totais do mês não batem certo entre Despesas (675 €), Calendário (751 €) e Relatório (675 €) (f.2, severidade 3).

**Onde a app ganha, e por larga margem:** `rich-report.png` y≈390-560, "ONDE PODES POUPAR — até 1150 €/ano", com base declarada, três recomendações quantificadas em euros/ano e o valor de cada uma. "Saúde passa o limite quase todos os meses — Média de 60€ contra um limite de 40€ (6 de 6 meses). Voltar ao limite poupa 240€/ano." Isto é melhor do que o equivalente no Revolut ou no N26, e está a três toques de distância dentro de um menu "Mais" sem hierarquia (H7.4).

---

## 3. Lacunas conhecidas

**3.1 — Os quatro estados vazios não são observáveis.**
`empty-overview.png`, `empty-expenses.png`, `empty-cards.png` e `empty-tax.png` estão todos cobertos pela folha "Novidades" de y≈100 até ao fundo do ecrã. Só se lê fragmentos: em `empty-tax.png` y≈865-1000 aparece o calendário fiscal e o botão "Configurar IMI / IUC" por baixo da folha. Todas as observações sobre estados vazios em §2.2i vêm do **código** (`Onboarding.jsx`), não das capturas. **Recomenda-se recapturar** com `?fixture=empty&…` depois de neutralizar o auto-open (o `test/fixtures.js:106` já usa `lastSeenPatchVersion: 999` para o fixture rico, mas `emptyFixture()` devolve `{}` — `fixtures.js:110-112`).

**3.2 — As quatro capturas de tema escuro não estão em tema escuro.**
Verificado: a cor média da faixa y 1200-1300 é **idêntica** entre `rich-*` e `dark-*` — `(243,245,245)` em overview, `(236,239,244)` em tax, `(230,230,234)` em cards, `(238,241,244)` em expenses. A única diferença visível é o glifo do toggle (lua → sol, `rich-overview.png` vs `dark-overview.png` y≈26).
Causa localizada: `devPreview.jsx:28` faz `if (q.get('theme')) fx.theme = q.get('theme')` e despacha `hydrate`, mas **nunca chama `applyTheme`**; e o caminho de `hydrate` no reducer também não o faz — `applyTheme` só é invocado em `store.jsx:409,418` (carregamento do Firestore) e em `store.jsx:505` (`setTheme`). Logo `document.documentElement` fica sem `data-theme="dark"` e o CSS de `tokens.css:76-104` nunca aplica.
**Consequência para esta auditoria: não foi possível avaliar contraste, bordas, estados de interação, scrim ou paridade de tokens em modo escuro.** Os tokens escuros existem e estão comentados com rácios de contraste (`tokens.css:76-104`), mas isso é evidência de código, não de ecrã. **Recomenda-se recapturar** com o tema aplicado.

**3.3 — Regiões tapadas pela barra de navegação fixa em capturas full-page.**
Em todos os `rich-*` a `.bnav` está pintada em y=780-844, ocultando ~64 px de conteúdo real da página. Afeta a leitura de: `rich-overview.png` y≈780-844 (o valor de "Podes gastar" e a sua barra), `rich-expenses.png` y≈780-844 (a linha de orçamento "Saúde"), `rich-report.png` y≈780-844 (o eixo do gráfico "ANO 2026"), `rich-charts.png` y≈780-844 (o cabeçalho de "INVESTIMENTOS"), `rich-cards.png` y≈780-844 (uma linha IKEA), `rich-invest.png` y≈780-844 (a terceira posição), `rich-tax.png` y≈780-844 (duas linhas do calendário fiscal).

**3.4 — Regiões tapadas pelo FAB do assistente.** Ver H8.3: 6 ecrãs, com o conteúdo por baixo perdido.

**3.5 — Fluxos não observáveis a partir de capturas estáticas.**
Não avaliados por falta de evidência: estados de foco visíveis em navegação por teclado (só se vê um anel azul nos botões X de `modal-add.png` y≈133, `modal-transfer.png` y≈500, `modal-cardpay.png` y≈475, `modal-settings.png` y≈205 — não é possível saber se todos os controlos o têm); qualidade real do feedback de pressão; timings de animação e comportamento com `prefers-reduced-motion`; ordem de leitura do VoiceOver; comportamento em landscape; comportamento com Dynamic Type ampliado; estados de carregamento e de erro de rede; comportamento offline do PWA; o interior das folhas `AddExpenseSheet` (campos Valor/Data/Conta/Tags/Nota), `SettingsSheet` (abaixo de y≈800), `MoreMenu` (abaixo de y≈830) e `AssistantSheet` (não capturada); a `AIView` (tab `ai`, sem screenshot); o detalhe de um grupo (`GroupDetail`), o `GroupExpenseSheet` e o `SettleSheet` (sem screenshots — avaliados só por código em §2.2l); e o layout desktop de 1440 px referido no `00-scope.md` (sem capturas na pasta).

**3.6 — Ausência de screenshot da tab `ai`.** É um dos 15 destinos e o maior ficheiro de vista da app (`AIView.jsx`, 864 linhas, 38 KB). Não foi possível avaliá-lo.

**3.7 — Regiões ilegíveis por escala.** Nenhuma: todos os tiles foram gerados a 1200 px de altura (600 px CSS) e lidos a resolução nativa; onde havia dúvida de cor (linha VWCE, linha Supermercado) foi feita ampliação 4× com Lanczos e amostragem RGB direta.

**3.8 — Sobre a atribuição de causa em H9.2 / 3.12.** O facto observado é sólido (texto a ~1:1 de contraste, confirmado por ampliação, exatamente nos dois `<span>` sem `color` explícito). A causa proposta — `color-scheme: light dark` a permitir que a cor de sistema do UA para `<button>` inverta — é a explicação mais consistente com o código e com o facto de as capturas terem sido tiradas num ambiente onde o esquema escuro do sistema estava ativo (§3.2). Não foi possível confirmá-la por inspeção do DOM em execução; **o defeito visual está confirmado, a mecânica exata é inferida.**

**3.9 — Método de verificação usado nas afirmações de identidade de ficheiros.**
`shasum` sobre `rich-expenses.png`/`hidden-expenses.png` (`b60373…`, iguais) e `rich-tax.png`/`hidden-tax.png` (`adb1d7…`, iguais); `rich-cards.png` (`4f90d7…`) e `hidden-cards.png` (`ae5428…`) diferem, tal como `rich-overview.png` (`66f1f3…`) e `hidden-overview.png` (`287df6…`). Para o tema, a comparação foi por cor média amostrada (não por hash, porque o glifo do toggle difere).
