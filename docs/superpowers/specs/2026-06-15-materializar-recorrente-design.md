# Materializar despesa recorrente — design

Data: 2026-06-15

## Problema

As despesas recorrentes (`state.recurring[]`) somam ao total mensal de despesa
(via `monthlySummary` em `src/lib/finance.js`), mas nunca aparecem na lista de
despesas — a lista (`ExpensesView`) mostra apenas `state.addedExp[]`.

O utilizador quer poder registar a recorrente como uma despesa individual:
indicar em que dia foi cobrada nesse mês, e vê-la na lista como qualquer outra.

## Decisões (brainstorming)

1. **Substituir nesse mês** — uma recorrente materializada num mês deixa de
   somar automaticamente nesse mês; o item da lista passa a ser a fonte. Evita
   contar duas vezes. Cada mês é independente.
2. **Entrada na lista de despesas** — a ação parte da `ExpensesView` (mês
   selecionado), que mostra as recorrentes pendentes desse mês.
3. **UI do dia: reusar `AddExpenseSheet`** — o botão "Registar" abre o sheet de
   despesa já preenchido (nome, valor, categoria, data no mês). O utilizador
   ajusta o dia no date-picker existente e grava.

## Mecanismo anti-duplo-contar

A despesa materializada leva um campo novo `recId` = id da recorrente de origem.
O `monthlySummary` salta uma recorrente quando já existe um `addedExp` com esse
`recId` datado nesse mês. Não é preciso novo estado global; o vínculo vive no
próprio `addedExp`.

Reversível: apagar a despesa materializada → a recorrente volta a somar
automaticamente e reaparece como pendente.

## Mudanças

### 1. `src/lib/finance.js` — `monthlySummary` (~linhas 412-416)

Antes de somar as recorrentes, construir o conjunto dos `recId` já
materializados no mês alvo (`_targetYM`) e saltar essas recorrentes:

```js
const _matRec = {};
addedExp.forEach((x) => {
  if (x.recId && (x.date || '').slice(0, 7) === _targetYM) _matRec[x.recId] = 1;
});
if (Object.keys(_byCm).length === 0) {
  recurring.forEach((r) => {
    if (!_matRec[r.id]) exp += r.amount || 0;
  });
}
```

O salto aplica-se só no ramo já existente (`Object.keys(_byCm).length === 0`),
ou seja em modo autenticado/novo utilizador — o mesmo contexto em que a
materialização está disponível.

### 2. `src/modals/AddExpenseSheet.jsx` — aceitar prefill

- Novo formato de payload: `{ prefill: { desc, amount, cat, date, recId } }`
  (coexiste com `{ editIdx }`).
- No `useEffect` de seed: quando há `prefill` e não é edição, semear o draft a
  partir do prefill (`amount` convertido para string com vírgula) e guardar
  `recId` no draft.
- No `submit` (caso novo): `if (d.recId) exp.recId = d.recId;`. Quando há
  `recId`, **não** correr `applyRules` (manter a categoria da recorrente).
- Título do sheet: "Registar recorrente" quando o prefill traz `recId`.

### 3. `src/views/ExpensesView.jsx` — secção "Recorrentes deste mês"

- Visível só em modo autenticado (`!preview`), mês `em` 0..3 (não Q1). Reusa o
  `selMonthKey`/`selMonthLabel` já calculados.
- Pendentes = `state.recurring` com `amount > 0` cujo `id` **não** está
  materializado nesse mês:
  ```js
  const matRecIds = new Set(
    addedExp
      .filter((x) => x.recId && (x.date || '').slice(0, 7) === selMonthKey)
      .map((x) => x.recId)
  );
  const pendingRec = recurring.filter((r) => r.amount > 0 && !matRecIds.has(r.id));
  ```
- Cada linha: ícone da categoria, nome, valor, dia. Botão "Registar":
  ```js
  ui.open('add', {
    prefill: {
      desc: r.name,
      amount: r.amount,
      cat: r.cat,
      date: selMonthKey + '-' + diaClamped, // dia clampado aos dias do mês
      recId: r.id,
    },
  });
  ```
  `diaClamped` = `r.day` limitado entre 1 e o número de dias de `selMonthKey`
  (evita datas inválidas como 31 em fevereiro).
- Materializada → desaparece dos pendentes (já está na lista). Apagar → reaparece.

## Fora de scope

- `runway` / `healthScore` e outros consumidores de recorrentes — não é a queixa.
- Modo preview (usa série `byC`; recorrentes não somam aí).
- `RecurringView` mantém-se inalterada.

## Verificação

- Recorrente pendente aparece na secção do mês selecionado.
- Registar com um dia → some dos pendentes, aparece na lista/categoria, total do
  mês **não** muda (substituição, não soma).
- Apagar a despesa materializada → recorrente volta aos pendentes e ao total.
- Mês diferente continua a mostrar a recorrente como pendente.
- Dia 31 num mês curto → data válida (clampada).
