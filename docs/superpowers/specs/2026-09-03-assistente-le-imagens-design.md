# O assistente lê prints — Spec

**Data:** 2026-09-03
**Estado:** Aprovado pelo utilizador ("Aprovado, escreve o spec").
**Âmbito:** Deixar entrar imagens no chat do assistente, para que ele registe despesas e
atualize saldos a partir de prints. Sem dependências novas, sem serviços externos, sem OCR local.

---

## 1. Problema

A app já lê imagens em três sítios — `BalanceUpdateSheet` (print → saldo), `ImportStatementSheet`
(print/PDF/xlsx → extrato) e o importador do `AIView`. Todos usam `callAI` (`src/lib/ai.js:210`),
um motor de tiro único que extrai um JSON por regex e substitui arrays inteiros no estado.

O assistente de chat é outro motor: `runAssistant` (`src/lib/aiChat.js:131`), com tool-calling,
32 ferramentas, gate de confirmação para ações destrutivas e Undo por fatia. Esse **só aceita texto**.

O resultado é que a capacidade de ler prints e a capacidade de agir com precisão vivem em motores
diferentes e nunca se falam. Quem quer registar uma despesa a partir de um talão tem de abrir um
importador que substitui listas inteiras, em vez de pedir ao assistente que acrescente uma despesa.

Falta a ponte. Quase toda a canalização já existe: `resizeImg`/`readFileB64` (`src/lib/ai.js:248-281`),
a tradução de blocos de imagem para o formato OpenAI em `toOpenAIContent` (`src/lib/ai.js:99-109`),
e um `api/ai.js` que reencaminha o conteúdo sem lhe tocar.

Naturezas de print a suportar, todas pela mesma porta: ecrã de saldo do banco, talão de compra,
notificação de pagamento, e lista de movimentos.

---

## 2. Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | Onde entra a imagem | **Só no chat** (`AssistantSheet` e caixa de chat do `AIView`). Os sheets de despesa e de saldo não ganham atalho próprio. |
| D2 | Como entra no motor | `runAssistant(cmd, opts)` passa a aceitar `cmd` como `string` **ou** array de blocos de conteúdo. Com imagem, a mensagem do utilizador é `[{type:'image',source:{type:'base64',media_type,data}}, {type:'text',text}]`. Zero canalização nova: `toOpenAIContent` já traduz, `chat()` já passa, `api/ai.js` já reencaminha. |
| D3 | Extrair primeiro ou ver diretamente | **Ver diretamente.** Rejeitada a alternativa de correr `callAI` para extrair um JSON e injetá-lo como texto no chat: duplica o custo de cada imagem e extrai às cegas, perdendo o contexto que o utilizador escreve por cima ("isto foi no cartão"). |
| D4 | Classificar a natureza do print | **Não há classificador.** O modelo decide que ferramenta usar a partir da imagem e do texto. Um classificador à frente seria uma segunda coisa que erra. |
| D5 | Muitos movimentos num print | Ferramenta nova `add_expenses` (plural) que aceita um array. **Coexiste com `add_expense`**, que fica como está — o singular continua a ser o caminho imediato e sem confirmação para uma despesa avulsa dita por texto. `MAX_TOOL_CALLS = 8` (`api/ai.js:37`) e `MAX_ROUNDS = 4` (`src/lib/aiChat.js:16`) ficam como estão — são o travão contra loops e não se mexe neles para acomodar um caso de uso. |
| D6 | `add_expenses` confirma? | **Sim, é `destructive: true`** — ao contrário do `add_expense` singular, que escreve já. Escrever 15 linhas sem as ver primeiro é mau negócio. O `PendingActionCard` mostra a lista toda antes de gravar. **Sem Undo depois de confirmar** — nenhuma ferramenta confirm-gated tem hoje (`update_balance`, `set_budget` também não: `confirmPendingAction`/`resolvePending` limpam o Undo da conversa em vez de criar um novo, `src/modals/AssistantSheet.jsx:237`). A revisão antes de confirmar é a rede de segurança, a mesma que as outras duas já usam. |
| D7 | Modelo para imagens | Piso `equilibrado`, tal como os documentos já forçam em `TIER_FOR_MODEL` (`src/lib/ai.js:88-91`). O chat usa hoje `o.tier \|\| 'economico'` sem piso (`src/lib/aiChat.js:164`); com imagem passa a subir. Um modelo lite a ler números de um extrato é falsa economia. |
| D8 | Imagem no histórico | A imagem viaja **só na ronda em que é anexada**. No histórico fica um marcador de texto (`[imagem]`). Sem isto cada mensagem seguinte reenvia a imagem, o custo cresce sozinho, e o `aiHistory` — que é persistido no Firestore — engorda com base64. |
| D9 | Quantas imagens | Máximo **3** por mensagem, redimensionadas com `resizeImg(f, 1600)` como nos fluxos que já existem. O `MAX_BODY_CHARS = 3_000_000` (`api/ai.js:38`) continua a ser a rede de segurança do servidor. |
| D10 | `update_balance` e contas personalizadas | **Consertar.** Hoje valida o par `{account_bank, account_type}` contra `ACCT_TEMPLATES` e escreve `custom: false` fixo (`src/lib/aiTools.js:588,612`), por isso devolve `not_found` para qualquer conta criada pelo utilizador — cartões incluídos. A action por baixo (`addBalanceReading`) já suporta contas custom; a ferramenta é que é mais estreita do que ela. **Os argumentos não mudam**: continuam `{account_bank, account_type}`. A resolução passa a procurar, em `listAccounts(state)` (template + personalizadas), uma conta cujo `bank`/`type` normalizados (`normAcct`, o mesmo usado em `resolveAccountRef`) batam com os dois argumentos; o `custom` e o `id` (quando existir) passam a vir dessa conta em vez de `custom: false` fixo. Sem correspondência, `not_found` — igual a hoje. **Sem ramo de ambiguidade**: `listAccounts()` já deduplica por "banco · tipo" normalizado (`src/lib/balances.js:81-83`), por isso um bank+type nunca pode apontar para duas contas ao mesmo tempo — um `ambiguous_account` aqui seria código morto, nunca exercitável. (Isto corrige uma descrição errada de uma revisão anterior deste spec, que propunha esse ramo sem verificar o de-dup.) |
| D11 | `update_balance` e a data | **Consertar.** Hoje a data é `todayISO()` fixa (`src/lib/aiTools.js:615`). Ganha argumento `date` opcional, com hoje por omissão, para o caso do print mostrar outro dia. |
| D12 | Custo | Nada a fazer. `estimateCost` (`src/lib/aiChat.js:47`) lê `prompt_tokens` do `usage` devolvido, portanto os tokens da imagem já entram na conta certa. |

D10 e D11 não são alargamento de âmbito: sem eles o caso principal — print do saldo de um cartão —
falha, e falha com uma mensagem que não explica porquê.

---

## 3. Arquitetura

```
src/lib/ai.js          toOpenAIContent, resizeImg, readFileB64  (já existem, não mudam)
src/lib/aiChat.js      runAssistant aceita cmd: string | ContentBlock[]
                       piso de tier quando há bloco de imagem
src/lib/aiTools.js     + add_expenses (array, destructive)
                       update_balance: contas custom + date opcional
src/modals/AssistantSheet.jsx   anexo, miniaturas, marcador no turn
src/views/AIView.jsx            o mesmo na caixa de chat
```

Nada muda no `api/ai.js`. Nada muda no Firestore: o marcador de histórico é texto, e as ações
escrevem pelas mesmas store actions de sempre.

**Contrato de conteúdo.** Um bloco de imagem é `{type:'image', source:{type:'base64',
media_type:'image/jpeg', data:'<b64 sem prefixo>'}}` — a forma que `toOpenAIContent` já espera
(`src/lib/ai.js:99-109`) e que os três fluxos existentes já produzem.

---

## 4. Por ficheiro

| Ficheiro | Muda |
|---|---|
| `src/lib/aiChat.js` | `runAssistant` normaliza `cmd`: string → `[{type:'text'}]`; array passa tal como está. Deteta bloco de imagem e sobe o tier para `equilibrado` se estiver abaixo. Ao empurrar para `history`, substitui blocos de imagem pelo marcador. |
| `src/lib/aiTools.js` | `add_expenses`: schema com `expenses: array` de `{desc, amount, cat?, date?, acct?}`, `destructive: true`, `preview` devolve a lista para o cartão, `run` chama `actions.addExpense` por item. Entra em `WRITE_TOOL_SLICES` com `['addedExp']`. `update_balance`: resolve a conta por `listAccounts()` (custom incluídas), aceita `date` opcional. |
| `src/modals/AssistantSheet.jsx` | Rodapé ganha botão de anexo e de câmara. Miniaturas por cima da textarea, com × para remover. `send()` compõe o array de blocos. O `turn` guarda o marcador, não a imagem. |
| `src/views/AIView.jsx` | O mesmo na caixa de chat (`:633-648`). O importador de ficheiros que já lá está (`aiImportFile`) **não muda** — continua a ser o caminho para PDF e xlsx. |
| `src/components/PendingActionCard.jsx` | Aceita uma lista de linhas, para o preview do `add_expenses`. Hoje mostra uma linha só. |

---

## 5. Fatias de entrega

Cada fatia: testes verdes, `npm run build`, `layout-check.mjs` limpo, commit + push.

- **A.** `runAssistant` aceita conteúdo multimodal; piso de tier com imagem; marcador no histórico. Sem UI ainda — testado por `aiChat.test.js`.
- **B.** `update_balance` com contas personalizadas e `date` opcional (D10, D11).
- **C.** `add_expenses` e o `PendingActionCard` com lista (D5, D6).
- **D.** Anexo no `AssistantSheet`: botões, miniaturas, remover, envio.
- **E.** O mesmo na caixa de chat do `AIView`.
- **F.** `testes.html`: casos manuais das quatro naturezas de print.

A fatia E toca `src/views/AIView.jsx`, que é o único ponto de colisão possível com o plano
`2026-09-04-redesign-resumo-despesa-numeros` a correr noutra sessão. Verificar o LOCK antes.

---

## 6. Fora de âmbito

- Colar do clipboard e arrastar-largar. Só botão de anexo e câmara.
- PDF e xlsx no chat — o `ImportStatementSheet` já faz isso e continua a ser o sítio.
- OCR local ou qualquer biblioteca de visão. O modelo lê a imagem.
- Reconhecer a natureza do print antes de a mandar ao modelo (D4).
- Limites de gasto ou quota por utilizador. Não existem hoje e não é este o trabalho que os traz.
