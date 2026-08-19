# Grupos — despesas partilhadas (inspirado no Splitwise) — Spec

**Data:** 2026-08-19
**Estado:** Aprovado pelo utilizador (decisões D1–D9 validadas via artifact de conceito).
**Artifact de conceito:** https://claude.ai/code/artifact/97c8ddff-591f-4cc3-b070-502cd27e3647
**Âmbito:** Secção nova e autónoma na app ("Grupos") para gerir despesas partilhadas com pessoas
que não usam o Proof. Inclui 3 slices novos, subcoleções Firestore, uma lib pura de matemática de
divisão/saldos, uma view e quatro sheets, mais uma ligação controlada às Despesas pessoais.

---

## 1. Problema

Umas férias com amigos são a maior despesa isolada do ano e hoje ficam fora do Proof: o extrato
mostra 620 € de Airbnb pagos por uma pessoa, o orçamento do mês fica destruído, e a contabilidade
de quem deve a quem vive no Splitwise ou em mensagens. O utilizador quer as duas coisas no mesmo
sítio: gerir o grupo **e** ter as suas finanças pessoais corretas.

Diferenças deliberadas face ao Splitwise:

1. **A tua parte entra nas Despesas pessoais** — não o total pago (D3).
2. **Os amigos não instalam nada** — são contactos locais do utilizador (D2).
3. Vive ao lado do orçamento, recorrentes, metas e património.

---

## 2. Decisões validadas

| # | Decisão | Escolha |
|---|---|---|
| D1 | Nome da secção | **Grupos** |
| D2 | Quem são as pessoas | **Contactos locais** (nome + cor, guardados na conta do utilizador; sem convites, sem dados partilhados entre utilizadores) |
| D3 | Ligação às Despesas pessoais | **Só a tua parte entra** nas Despesas; o resto é "a receber" e aparece no Resumo |
| D4 | Modos de divisão v1 | **Igual + valores exatos + percentagem** |
| D5 | Moeda | **Uma moeda por grupo** (default EUR) |
| D6 | Vários pagadores por despesa | **v2** (v1: um pagador por despesa) |
| D7 | Navegação | **Menu "Mais" + Sidebar + atalho no "Adicionar"** |
| D8 | Categorias | **Lista própria curta**, mapeada para as categorias do orçamento quando reflete |
| D9 | Vista de saldos | **Só simplificado** (plano mínimo de transferências; sem toggle) |

---

## 3. Modelo de dados

Três slices novos no store persistido, cada um com a sua subcoleção Firestore
(padrão existente em `src/firebase/data.js`).

```js
people: [
  { id, name, color, createdAt }
]
// Contactos locais. O próprio utilizador NÃO entra aqui: é o id reservado 'me',
// resolvido na UI para "Tu". `color` é um hex da paleta de avatares.

groups: [
  { id, name, emoji, type: 'trip'|'home'|'event'|'other',
    currency: 'EUR', memberIds: ['me', ...personIds],
    start: 'YYYY-MM-DD'|null, end: 'YYYY-MM-DD'|null,
    reflectMine: true, archived: false, createdAt }
]

groupEntries: [
  // despesa
  { id, groupId, kind: 'expense', desc, amount, date: 'YYYY-MM-DD',
    payerId, splitMode: 'equal'|'exact'|'percent',
    shares: [{ personId, amount }],   // resolvido em euros, soma === amount
    gcat, notes, reflect: true, linkedExpId: null, createdAt },
  // acerto de contas
  { id, groupId, kind: 'settlement', fromId, toId, amount, date,
    method: 'mbway'|'transfer'|'cash', createdAt }
]
```

### Invariantes

- `sum(shares[].amount) === amount`, sempre, ao cêntimo. O resto do arredondamento vai
  primeiro para o pagador e depois pela ordem dos participantes.
- `payerId`, `fromId`, `toId` e cada `shares[].personId` ∈ `group.memberIds`.
- `amount > 0` em despesas e acertos.
- `splitMode` é guardado (para reabrir o formulário no modo certo), mas os **`shares` resolvidos
  são a fonte de verdade** — a matemática de saldos nunca reinterpreta percentagens.
- `id`s gerados com `uid()` de `src/lib/format.js`, como o resto da app.
- `date` com `todayISO()` por defeito (data local, não UTC — mesmo motivo documentado em `format.js`).

### Saldos

```
saldo(p) = Σ despesas pagas por p
         − Σ shares de p
         + Σ acertos pagos por p        (pagar reduz a dívida)
         − Σ acertos recebidos por p
```

A soma de todos os saldos de um grupo é sempre 0. Grupo "acertado" quando todos os saldos
estão a 0,00 (comparação em cêntimos, não em floats).

### Categorias de grupo (D8)

Lista fixa em `src/lib/split.js`, com mapeamento para os ids do orçamento (`bdgDefault`):

| `gcat` | Nome | Mapeia para |
|---|---|---|
| `stay` | Alojamento | `cas` (Prestação Casa) |
| `food` | Comida e bebida | `rest` (Restauração) |
| `transp` | Transporte | `cmb` (Combustível) |
| `fun` | Atividades | `laz` (Lazer) |
| `shop` | Compras | `comp` (Compras) |
| `other` | Outro | `out` (Outros) |

O mapeamento é o **valor por defeito** do movimento pessoal criado; o utilizador pode trocar a
categoria na sheet antes de guardar.

---

## 4. `src/lib/split.js` — lógica pura (TDD)

Sem React, sem Firebase. Tudo em cêntimos internamente (`Math.round(v*100)`), euros na fronteira.

```js
splitEqual(amount, personIds, payerId) -> [{ personId, amount }]
splitExact(amount, entries) -> { shares, error }        // valida soma === amount
splitPercent(amount, entries) -> { shares, error }      // valida soma === 100
resolveShares(mode, amount, participants, payerId) -> { shares, error }

computeBalances(entries, memberIds) -> { [personId]: number }
simplifyDebts(balances) -> [{ from, to, amount }]       // greedy maior credor ↔ maior devedor
groupTotals(entries, meId) -> { total, paidByMe, myShare, owedToMe, owedByMe }
isSettled(balances) -> bool
shareText(group, entries, people) -> string             // resumo para WhatsApp
```

**Testes (`split.test.js`), no mínimo:**

- divisão igual por 3 de 10,00 € → 3,34 / 3,33 / 3,33, com o cêntimo extra no pagador;
- divisão igual quando o pagador não participa (paga mas não consome);
- valores exatos que não somam → erro com a diferença;
- percentagens que não somam 100 → erro;
- saldos somam sempre 0 num conjunto aleatório de despesas;
- acerto parcial reduz o saldo na proporção certa;
- `simplifyDebts` produz ≤ n−1 transferências e liquida todos os saldos;
- grupo sem despesas → saldos a 0 e `isSettled` true;
- despesa em que só parte do grupo participa;
- `shareText` com e sem dívidas por acertar.

---

## 5. Store (`src/store/store.jsx`)

- `initialPersisted()`: `people: []`, `groups: []`, `groupEntries: []`.
- `PERSISTED_KEYS`: mais `'people'`, `'groups'`, `'groupEntries'`.
- `hydrateFromDoc`: `Array.isArray` guard para os três (mesmo padrão dos existentes).
- Actions novas:
  - `addPerson(p)`, `updatePerson(id, partial)`, `deletePerson(id)`
    — apagar só é permitido quando a pessoa não pertence a nenhum grupo com movimentos;
      caso contrário a UI oferece apenas "arquivar" (remover do grupo).
  - `addGroup(g)`, `updateGroup(id, partial)`, `archiveGroup(id)`, `deleteGroup(id)`
    — **arquivar** só marca `archived: true` (nada é apagado, os movimentos pessoais mantêm-se);
      **apagar** remove o grupo, as suas `groupEntries` e os movimentos pessoais ligados,
      com confirmação explícita.
  - `addGroupEntry(e)`, `updateGroupEntry(id, partial)`, `deleteGroupEntry(id)`.
- **Ligação a `addedExp` (D3)** — encapsulada no store, não nas views:
  - ao criar uma despesa de grupo com `group.reflectMine === true` e com share do `'me'` > 0:
    cria em `addedExp` `{ desc, amount: myShare, cat, date, groupEntryId: <id>, id: uid() }`
    e guarda o id resultante em `entry.linkedExpId`;
  - editar a despesa de grupo atualiza o movimento ligado (valor/descrição/data/categoria);
  - apagar a despesa de grupo apaga o movimento ligado;
  - cada despesa guarda `reflect: true|false` (default = `group.reflectMine`), para o toggle
    por despesa ser respeitado;
  - desligar `reflectMine` num grupo apaga os movimentos ligados desse grupo; voltar a ligar
    cria-os apenas para as despesas com `reflect !== false`. Ambas as operações pedem confirmação
    e indicam quantos movimentos serão afetados;
  - **acertos nunca tocam em `addedExp`** — recuperar dinheiro emprestado não é receita, e pagar
    o que se deve já foi contabilizado como a tua parte.
  - o campo extra `groupEntryId` em `addedExp` é opcional e ignorado por todo o código existente;
    protege contra edição/apagar dessincronizados (a `ExpensesView` mostra um selo "grupo" e
    remete a edição para a sheet do grupo).

---

## 6. Persistência (`src/firebase/data.js`)

`SUBCOLLECTIONS` ganha:

```js
people: 'people',
groups: 'groups',
groupEntries: 'groupEntries',
```

`firestore.rules` **não muda** — o bloco `match /users/{uid}/{sub}/{docId}` já cobre subcoleções
novas, e nada é partilhado entre utilizadores nesta versão. A migração `schemaVersion:2` não é
afetada: slices novos começam vazios e são escritos pelo `computeDiff` normal.

---

## 7. UI

### 7.1 Navegação (D7)

- `Shell.jsx`: rota `groups` → `GroupsView` (lazy, como as outras).
- `Sidebar.jsx`: entrada "Grupos" com ícone de pessoas.
- `MoreMenu.jsx`: item "Grupos — Despesas partilhadas com amigos".
- `ActionSheet.jsx`: "Despesa de grupo" (abre o seletor de grupo, ou o grupo único se só houver um).
- `ContextStrip.jsx`: linha de contexto para o tab `groups`.
- A barra inferior de 4 separadores **não muda**.

### 7.2 `GroupsView.jsx`

Duas telas na mesma view, com estado local (`selectedGroupId`), sem router:

**Lista** — hero com saldo global (a receber / a pagar somados sobre todos os grupos ativos),
grupos ativos, grupos acertados/arquivados em baixo, botão "Novo grupo", acesso a "Pessoas".

**Detalhe** — cabeçalho com total do grupo, "tu pagaste X · a tua parte Y", avatares dos membros,
e um segmented control com três separadores:

- **Despesas** — cronologia agrupada por dia; cada linha diz quem pagou e o impacto para ti
  ("deves 24,00 €" / "emprestaste 465,00 €"). Toque abre edição.
- **Saldos** — barra por pessoa (positivo/negativo em relação a zero) + lista "quem paga a quem"
  simplificada (D9), cada uma com botão "Acertar". Botão "Partilhar resumo" (`navigator.share`
  com fallback para clipboard).
- **Atividade** — despesas e acertos por ordem cronológica inversa.

### 7.3 Sheets (padrão dos existentes em `src/modals/`)

- **`GroupSheet.jsx`** — criar/editar grupo: nome, emoji (grelha curta), tipo, membros
  (chips com toggle + "Nova pessoa"), datas opcionais, toggle `reflectMine`, arquivar/apagar.
- **`PersonSheet.jsx`** — gerir contactos: lista, criar (nome + cor automática da paleta), editar, apagar.
- **`GroupExpenseSheet.jsx`** — descrição, valor, quem pagou, data, modo de divisão
  (Igual / Valores / %), participantes com pré-visualização por pessoa em tempo real,
  categoria de grupo, notas, e o toggle "Refletir a minha parte nas Despesas"
  (default = `group.reflectMine`, editável por despesa). Validação inline no padrão do
  `AddExpenseSheet` (erros por campo, sem alerts).
- **`SettleSheet.jsx`** — de quem, para quem, valor (pré-preenchido com a dívida sugerida,
  parcial permitido), método, data, e pré-visualização "saldo antes → saldo depois".

### 7.4 Resumo (`OverviewView.jsx`)

Uma linha/cartão discreto: "Amigos devem-te 370,00 €" / "Deves 40,00 €", com atalho para Grupos.
**Não entra no património nem no orçamento** — é informação, não saldo de conta. Escondido quando
não há grupos ativos ou quando tudo está acertado.

### 7.5 Modo demo (preview)

Sem login, a app já corre com dados de exemplo. Grupos segue o mesmo padrão: um grupo
"Férias Algarve" com 4 pessoas e as despesas do artifact, para o ecrã não estar vazio.
Sem escrita no Firestore em preview (o gate atual do store trata disso).

---

## 8. Acessibilidade e estilo

- Só tokens existentes (`tokens.css`); sem cores novas e sem dependências novas.
- Avatares com iniciais + cor, `aria-label` com o nome completo (a cor nunca é o único sinal).
- Valores com `font-variant-numeric: tabular-nums` (classe já usada na app).
- Foco visível em todos os controlos; sheets fecham com Escape (padrão existente).
- Formatação `pt-PT` via `src/lib/format.js`.

---

## 9. Fora de âmbito (v2)

Vários pagadores na mesma despesa (D6), divisão por pesos, multi-moeda por despesa (D5),
anexar recibo/foto, partilha por link para os amigos verem saldos, lembretes de dívida,
marcar movimento importado do extrato como despesa de grupo, recorrentes de grupo,
exportar CSV do grupo.

---

## 10. Ficheiros

**Novos:** `src/lib/split.js` · `src/lib/split.test.js` · `src/views/GroupsView.jsx` ·
`src/modals/GroupSheet.jsx` · `src/modals/PersonSheet.jsx` · `src/modals/GroupExpenseSheet.jsx` ·
`src/modals/SettleSheet.jsx`

**Tocados:** `src/store/store.jsx` (slices, actions, ligação a `addedExp`) ·
`src/firebase/data.js` (`SUBCOLLECTIONS`) · `src/components/Shell.jsx` (rota + registo de modais) ·
`src/components/Sidebar.jsx` · `src/components/ContextStrip.jsx` · `src/modals/MoreMenu.jsx` ·
`src/modals/ActionSheet.jsx` · `src/views/OverviewView.jsx` (indicador) ·
`src/views/ExpensesView.jsx` (selo "grupo" nos movimentos ligados, edição remetida para a sheet
do grupo) · `src/lib/finance.js` (seed de demo, se necessário) ·
`src/views/views.render.test.jsx` e `src/modals/modals.render.test.jsx` (smoke tests) ·
`STORE_API.md` · `testes.html` · `src/lib/patchNotes.js`

**Não muda:** `firestore.rules`.

---

## 11. Documentação a atualizar no fim

- `STORE_API.md` — três slices, actions e subcoleções novas.
- `testes.html` — casos de QA/segurança da feature.
- `src/lib/patchNotes.js` — entrada nova (versão 7) para o ecrã de Novidades.

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Arredondamento de cêntimos a falhar em divisões desiguais | Toda a matemática em inteiros; teste que a soma dos shares é igual ao total |
| Movimentos pessoais ligados a ficarem órfãos ou duplicados | `linkedExpId`/`groupEntryId` nos dois sentidos; criar/editar/apagar sempre pelo store, nunca pelas views |
| Utilizador confundir "acertar" com receita | Sheet mostra "Impacto nas tuas finanças: nenhum · recuperação"; acertos nunca escrevem em `addedExp` |
| Apagar uma pessoa com saldo por acertar | Bloqueado; a UI oferece remover do grupo em vez de apagar |
| Volume de escritas no Firestore | `computeDiff` já escreve só o que muda; entries são documentos pequenos |
