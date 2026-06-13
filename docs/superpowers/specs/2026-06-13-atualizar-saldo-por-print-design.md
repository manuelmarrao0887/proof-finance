# Atualizar saldo por print + histórico datado + ícones — Design

**Data:** 2026-06-13
**Estado:** Aprovado para implementação

## Objetivo

Permitir, na área do assistente IA, carregar um print do saldo atual de uma
plataforma/banco, **escolher manualmente a conta de destino**, e atualizar o
saldo dessa conta. Cada atualização fica registada com **data**, formando um
histórico datado por conta (ex: 01.05 → 1.000€, 30.05 → 1.500€). Em paralelo,
substituir todos os emojis de sistema por ícones SVG (/ui-ux-pro-max) em toda
a app.

A AI **não** consegue detetar de forma fiável a que conta um print pertence —
por isso a seleção da conta é sempre manual. A AI extrai apenas o **valor** do
saldo.

## Âmbito (e não-âmbito)

**Inclui:**
- Fluxo dedicado "Atualizar saldo" no assistente IA.
- Seleção manual da conta de destino (templates + custom).
- Extração por AI apenas do valor do saldo a partir do print.
- Campo de data por leitura (default hoje, editável).
- Histórico datado de leituras por conta, persistido e visível.
- Substituição app-wide de emojis de sistema por ícones SVG.

**Não inclui (explicitamente fora por agora):**
- Cálculo de despesas/receitas pela diferença de saldos.
- XTB / investimentos: separar investido vs lucro.
- Snapshots patrimoniais automáticos a partir deste fluxo.

> Nota: estes três pontos foram discutidos e adiados de propósito. O modelo de
> dados (`balanceLog`) fica preparado para os suportar mais tarde sem migração.

## Decisões tomadas

1. **Onde vive:** estende o assistente IA (tab AI), com um fluxo dedicado num
   sheet próprio — não uma secção nova, não dentro do import genérico.
2. **Acionamento:** botão "Atualizar saldo" → escolher conta → carregar print →
   AI lê o valor → confirmar (valor + data) → gravar. Determinístico: a conta é
   escolhida, não adivinhada.
3. **Lista de contas no seletor:** contas-template + `customAccts`, agrupadas
   por plataforma.
4. **Data:** cada leitura tem data (default hoje, editável).
5. **Histórico:** guardar todas as leituras datadas E mostrá-las numa lista.
   Como o `AcctModal` só serve contas custom, a lista vive num sheet dedicado
   (`BalanceHistorySheet`) aberto a partir de um botão em cada linha de conta na
   `OverviewView` — cobre contas template e custom de forma uniforme.
6. **Ícones:** remover TODOS os emojis de sistema da app e usar ícones SVG do
   /ui-ux-pro-max.

## Arquitetura

Três peças, separáveis em implementação:

- **A — Fluxo de atualização de saldo** (UI no assistente IA).
- **B — Histórico datado por conta** (modelo de dados + lista de histórico).
- **C — Ícones app-wide** (componente Icon + remoção de emojis).

A+B são uma unidade funcional. C é independente e pode ser feita em paralelo ou
a seguir.

### Modelo de dados

Novo campo persistido no store (Firestore `users/{uid}`):

```
balanceLog: [
  {
    id: string,        // uid()
    acctKey: string,   // template: `${bank}_${type}` ; custom: o id da conta custom
    bank: string,      // nome da plataforma/banco (para display)
    type: string,      // tipo de conta (para display)
    value: number,     // saldo lido (EUR)
    date: string,      // 'YYYY-MM-DD' — data a que o saldo se refere
    createdAt: number, // timestamp de quando foi registado
  }
]
```

- `balanceLog` entra em `PERSISTED_KEYS`, `initialPersisted()`,
  `buildPersistPayload()` e `hydrateFromDoc()` (com guarda `Array.isArray`).
- **Saldo "vivo"** (o que `compute()`/património usam) continua a vir de
  `dynAccts` (templates) e `customAccts` (custom). Ao gravar uma leitura,
  atualiza-se também o saldo vivo para a leitura mais recente:
  - Template → `dynAccts[acctKey] = { v: value, d: date, n: (nota existente) }`.
  - Custom → `updateCustomAcct(id, { value, updated: date })`.
- O histórico de uma conta = `balanceLog` filtrado por `acctKey`, ordenado por
  `date` (asc para a lista cronológica).

> A "leitura anterior" mostrada na confirmação é a entrada mais recente do
> `balanceLog` para aquele `acctKey` (ou, se não houver nenhuma, o saldo vivo
> atual da conta, se existir).

### Componentes / módulos

**Novos:**

- `src/lib/balances.js` — lógica pura, **com testes** (`balances.test.js`):
  - `balanceAcctKey(account)` → deriva `acctKey` a partir de uma conta
    (template ou custom).
  - `latestReading(balanceLog, acctKey)` → última leitura datada, ou null.
  - `accountHistory(balanceLog, acctKey)` → leituras ordenadas por data.
  - `addReading(balanceLog, reading)` → novo array com a leitura acrescentada.
  - `BALANCE_PROMPT` — prompt focado que instrui a AI a devolver APENAS o saldo:
    `{"value": 0.00}` (ou `{"error":"..."}` se não conseguir ler). Sem conta,
    sem transações, sem categorias.
  - `parseBalanceResult(res)` → extrai/valida o número do resultado da AI.
  - Lista de contas-template disponíveis para o seletor (derivada de `accts`
    de `lib/finance.js`), agrupadas por plataforma.

- `src/modals/BalanceUpdateSheet.jsx` — o fluxo dedicado:
  - Passo 1: seletor de conta (templates + custom, agrupado por plataforma).
  - Passo 2: upload (câmara/ficheiro) → `resizeImg`/`readFileB64` → `callAI`
    com `BALANCE_PROMPT`.
  - Passo 3: confirmação — conta escolhida, leitura anterior (data + valor),
    valor novo (editável), data (default hoje, editável), botão Confirmar.
  - Ao confirmar: chama a nova ação do store `addBalanceReading(...)`, toast,
    fecha.

- `src/components/Icon.jsx` — conjunto de ícones SVG (set /ui-ux-pro-max) com
  API `<Icon name="..." size={...} />`. Mapa nome → SVG. Cobre, no mínimo, os
  conceitos atualmente representados por emojis (banco, dinheiro/saldo, meta,
  recorrente, gráfico/análise, despesa, etc.).

**Alterados:**

- `src/store/store.jsx`:
  - `balanceLog` em `initialPersisted`, `PERSISTED_KEYS`, `buildPersistPayload`,
    `hydrateFromDoc`.
  - Ação `addBalanceReading({ account, value, date })` que: deriva `acctKey`,
    acrescenta ao `balanceLog`, e atualiza o saldo vivo (`dynAccts` ou
    `customAccts`) conforme o tipo de conta.
  - Setter `setBalanceLog`.

- `src/store/ui.jsx` — registar os modais `balanceUpdate` e `balanceHistory`.

- `src/views/AIView.jsx`:
  - Botão "Atualizar saldo" que abre o `balanceUpdate` modal.
  - Substituir os ícones-emoji de `actionLabel` por `<Icon>`.

- `src/views/OverviewView.jsx` — botão "histórico" em cada linha de conta que
  abre o `BalanceHistorySheet` para aquela conta.

- `src/components/Shell.jsx` — montar `<BalanceUpdateSheet />` e
  `<BalanceHistorySheet />`.

- Emojis de sistema: a única ocorrência renderizada na UI são os 6 ícones-emoji
  do `actionLabel` no `AIView.jsx` (🏦 💰 🧾 🎯 🔁 📊). São substituídos por
  `<Icon>`. (Os `→`/`•` noutros ficheiros são setas/bullets em comentários de
  código, não emojis de UI — não são tocados.)

### Fluxo de dados (atualizar saldo)

```
[Escolher conta] -> [Upload print] -> callAI(BALANCE_PROMPT) -> {value}
   -> [Confirmação: valor (editável) + data (editável) + leitura anterior]
   -> addBalanceReading({account, value, date})
        -> balanceLog.push(reading)            (histórico)
        -> dynAccts[key] | customAccts update  (saldo vivo)
   -> toast + fecha sheet
```

### Tratamento de erros

- API key em falta → mensagem a remeter para Definições (como nos fluxos
  existentes).
- AI devolve `{error}` ou valor não numérico → mostrar erro na confirmação,
  permitir reintroduzir manualmente o valor (o campo é editável de qualquer
  forma).
- Erro de rede/CORS → mensagem idêntica à de `callAI` existente.
- Conta não selecionada → botão de confirmar desativado.
- Primeira leitura de uma conta (sem leitura anterior) → mostra "sem leitura
  anterior" e apenas inicializa o saldo.

### Testes

- `src/lib/balances.test.js` (TDD): `balanceAcctKey`, `latestReading`,
  `accountHistory` (ordenação), `addReading` (imutabilidade), `parseBalanceResult`
  (número válido, string com símbolos, erro).
- Verificação manual do fluxo no sheet e da lista no `BalanceHistorySheet`.

## Faseamento

1. **Fase A+B** — modelo `balanceLog` + ação do store + `lib/balances.js` (+
   testes) + `BalanceUpdateSheet` + botão no AIView + `BalanceHistorySheet`.
2. **Fase C** — `Icon.jsx` + remoção app-wide de emojis.

Ambas avançam neste ciclo ("avança com tudo de uma vez"), mas são planeadas e
verificadas como blocos distintos.

## Adendas (pedidos posteriores)

### D — Otimização de leituras Firebase (cache)

- Ativar **cache persistente do Firestore** (IndexedDB) na init via
  `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager:
  persistentMultipleTabManager() }) })`.
- `loadUserDoc` passa a **cache-first**: tenta `getDocFromCache` e só vai ao
  servidor (`getDoc`) em cache-miss. Resultado: após o primeiro carregamento,
  cargas seguintes servem da cache (0 leituras de servidor até nova escrita).
- Caveat assumido (app pessoal): alterações feitas noutro dispositivo só são
  lidas em cache-miss; aceitável para o uso single-user.

### E — Modelo de patch notes

- Lista de notas versionada **em código** (`src/lib/patchNotes.js`):
  `PATCH_NOTES = [{ version:int, date, title, items:[] }]` (mais recente
  primeiro); `LATEST_PATCH_VERSION` e `hasUnseenNotes(lastSeen)`.
- "Versão vista" guardada no **perfil Firestore** (novo campo persistido
  `lastSeenPatchVersion`, sincroniza entre dispositivos via o save já existente).
- **Auto-abre** um sheet `PatchNotesSheet` quando `LATEST_PATCH_VERSION >
  lastSeenPatchVersion` (gancho no `Shell`, só para utilizadores com dados —
  `!isNewUser` — para não interromper o onboarding). Ao fechar, grava
  `lastSeenPatchVersion = LATEST_PATCH_VERSION`.
- **Acesso pelo menu:** entrada "Novidades" no `MoreMenu`.

## Riscos / notas

- O delta de saldo é líquido; o cálculo de despesa foi deliberadamente deixado
  de fora — não inferir despesas neste fluxo para não dar números errados.
- O set exato de ícones /ui-ux-pro-max é resolvido na implementação (skill
  invocado então); o design fixa o contrato `<Icon name>` e a lista de
  conceitos a cobrir.
- `balanceLog` cresce com o tempo; sem cap por agora (volume baixo, uma leitura
  por conta por período). Rever se necessário.
