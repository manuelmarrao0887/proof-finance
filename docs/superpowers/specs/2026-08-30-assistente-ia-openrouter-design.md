# Assistente IA sobre OpenRouter — design

**Data:** 2026-08-30
**Estado:** implementado (2026-08-30)

---

## 1. Objetivo

Dar ao utilizador um assistente que regista e gere finanças por linguagem
natural, a partir de qualquer ecrã da app, com custo por mensagem na ordem dos
milésimos de euro.

Três frentes, decididas com o utilizador:

1. **Trocar o provider** de Anthropic para OpenRouter.
2. **Tornar a IA acessível** — botão nas Quick Actions do Resumo, em vez de
   estar enterrada no menu "Mais".
3. **Alargar capacidades** — editar/apagar, grupos, orçamentos/categorias e
   contexto completo nas análises.

## 2. Ponto de partida

A app já tem IA a funcionar:

| peça | o que faz hoje |
|---|---|
| `api/ai.js` | proxy Vercel → Anthropic Messages API; auth por ID-token Firebase + allowlist `ALLOWED_EMAILS`; whitelist de modelos e teto de `max_tokens` |
| `src/lib/ai.js` | `callAI` (parse de JSON) e `callAIRaw` (JSON cru); prompts de extrato/recibo/import; helpers de ficheiro (`readFileB64`, `resizeImg`, `parseExcel`) |
| `src/views/AIView.jsx` | tab "Assistente IA" (1027 linhas): chat com ações + painel de import de documentos com revisão por checkbox |
| `src/modals/ImportStatementSheet.jsx`, `BalanceUpdateSheet.jsx` | consumidores de `callAI` |

Limitações que este trabalho resolve:

- O chat só **cria** (`add_expense`, `add_income`, `add_goal`, `add_recurring`,
  `update_balance`, `snapshot`). Não edita, não apaga, não toca em grupos nem
  em orçamentos.
- O contrato é "responde JSON com um array `actions`": o system prompt cresce
  com cada capacidade nova e a fiabilidade cai.
- `buildAIContext` em `lib/ai.js` é um **stub**; o contexto real é montado
  dentro do `AIView` e cortado a 15 000 caracteres, o que dá respostas
  aproximadas em vez de certas.
- Só se chega ao assistente por Mais → Assistente IA.

## 3. Decisões

| decisão | escolha | porquê |
|---|---|---|
| Provider | OpenRouter (`/api/v1/chat/completions`) | conta já existente; catálogo com modelos baratos e visão |
| Modelo por defeito | `google/gemini-3.5-flash-lite` ($0,30/M in, $2,50/M out) | mais barato dos capazes; 1M de contexto; visão + tool-calling |
| Modelo forte | `google/gemini-3.7-flash` ($0,75/M in, $3,75/M out) | só para import de documentos e análise pesada |
| Protocolo de ações | tool-calling nativo (abordagem A) | fiável com >20 operações; o modelo preenche schemas em vez de inventar JSON |
| Confirmação | só nas destrutivas | criar aplica direto com Anular; apagar/editar pedem confirmação |
| Ponto de entrada | botão ✦ nas Quick Actions | acesso de um toque a partir do Resumo |

Abordagens rejeitadas: manter o blob JSON e só acrescentar tipos de ação
(prompt de 4-5k tokens em cada mensagem, e editar/apagar exigiria despejar os
IDs de todas as despesas no contexto); e enviar snapshot completo do estado no
system prompt (30-60k tokens por mensagem — incompatível com o objetivo de
custo).

## 4. Arquitetura

```
AssistantSheet / AIView
        │  texto do utilizador
        ▼
  lib/aiChat.js ── loop de tool-calling (máx. 4 voltas)
        │                 │
        │                 ├─ lib/aiTools.js  TOOL_SCHEMAS + execTool(state, actions)
        │                 │        └─ store actions / lib/finance / lib/split / lib/budget
        ▼
  lib/ai.js  chat(messages, {tools, tier})
        │  POST /api/ai  (Bearer ID-token Firebase)
        ▼
  api/ai.js  auth + allowlist + whitelist de modelo + tetos
        │
        ▼
  openrouter.ai/api/v1/chat/completions
```

As tools executam **no cliente**, porque é lá que vive o store. O proxy é
stateless: recebe `messages` e `tools`, devolve a resposta do modelo.

### 4.1 `api/ai.js` (reescrito)

Contrato:

```
POST /api/ai
  { messages: [...], tools?: [...], tier?: 'fast'|'strong', max_tokens?: number }
  → { choices: [{ message: { content, tool_calls } }], usage: {...} }
```

- Autenticação e allowlist ficam exatamente como estão (ID-token Firebase
  verificado com `firebase-admin`; `ALLOWED_EMAILS` obrigatório, fecha por
  omissão; `email_verified` exigido).
- Env nova `OPENROUTER_API_KEY`. `ANTHROPIC_API_KEY` mantém-se durante a
  transição e é removida depois de produção validada.
- Headers `HTTP-Referer: https://proof-finance.vercel.app` e
  `X-Title: PROOF. Finance` (atribuição OpenRouter).
- O cliente envia `tier`, não um id de modelo. O servidor resolve
  `fast → google/gemini-3.5-flash-lite`, `strong → google/gemini-3.7-flash`.
  Qualquer outro valor cai em `fast`.
- Tetos: `max_tokens` mantém o cap de 8000; `MAX_BODY_CHARS` de 3 000 000
  mantém-se; **máximo de 8 `tool_calls` numa resposta** (excedente é cortado
  antes de voltar ao cliente).
- `usage` é devolvido ao cliente para mostrar o custo.
- Mensagens de erro internas continuam a ficar só no log.

### 4.2 `src/lib/ai.js`

Ganha `chat(messages, { tools, tier, maxTokens })` e o tradutor de conteúdo
para o formato OpenAI:

- PDF → `{ type:'file', file:{ filename, file_data:'data:application/pdf;base64,…' } }`
- imagem → `{ type:'image_url', image_url:{ url:'data:image/jpeg;base64,…' } }`
- texto → `{ type:'text', text }`

`callAI` e `callAIRaw` passam a ser wrappers finos por cima de `chat()`, **com
a assinatura atual intacta**, para `ImportStatementSheet` e
`BalanceUpdateSheet` não mudarem. O argumento `model` que os chamadores atuais
passam (`'claude-haiku-4-5'`) é traduzido para `tier` no wrapper: ids de
documento/análise vão a `strong`, o resto a `fast`. Nenhum id de modelo
atravessa o proxy. Os helpers de ficheiro e as constantes de
prompt (`STMT_PROMPT`, `RCPT_PROMPT`, `AI_IMPORT_PROMPT`) ficam como estão.

`buildAIContext(state)` deixa de ser stub e devolve contexto **compacto**
(~1-2k tokens): data de hoje, saldos por conta, património, gasto do mês por
categoria vs. orçamento, nomes de grupos e pessoas, contagens de despesas /
receitas / metas / recorrentes. O detalhe vem das tools de leitura.

### 4.3 `src/lib/aiTools.js` (novo, puro)

Sem React e sem Firebase, para ser testável isoladamente. Exporta
`TOOL_SCHEMAS` e `execTool(name, args, { state, actions })`.

**Leitura** — `query_expenses` (intervalo de datas, categoria, texto, min/max,
limite), `get_overview` (via `compute`), `get_budget` (via
`monthEffectiveLimits`), `list_goals`, `list_recurring`, `list_incomes`,
`list_categories`, `list_groups`, `get_group` (membros + saldos via
`computeBalances`/`simplifyDebts`), `list_people`.

**Escrita** — `add_expense`, `update_expense`, `delete_expense`;
`add_income`/`update_income`/`delete_income`; o mesmo trio para metas e
recorrentes; `set_budget`, `add_category`, `add_rule`; `update_balance`,
`add_snapshot`; e nos grupos `create_group`, `add_person`,
`add_group_expense`, `settle_group`, `delete_group_entry`.

As tools são casca fina sobre `actions.*`. Nada de matemática nova: os splits
vêm de `resolveShares` e os invariantes de grupos continuam a ser aplicados
pelo store (`addGroupEntry` decide o reflexo em `addedExp` via
`reflectExpenseFor`).

#### Identificação de registos

Todas as coleções são endereçadas por `id`. `actions.updateExpense(id, partial)`
e `actions.deleteExpense(id)` recebem **ids**, não índices, e
`withExpenseIds` garante que toda a linha de `addedExp` tem um `id` estável
(backfill na hidratação e em qualquer substituição em bloco). Metas,
recorrentes, receitas, contas, regras, pessoas, grupos e movimentos de grupo já
usam `id`.

Logo, as tools de leitura devolvem o `id` de cada registo e as de escrita
recebem-no tal e qual. Se o `id` não existir no estado atual, `execTool`
devolve `{ error: 'not_found' }` ao modelo, sem escrever, para ele voltar a
consultar em vez de adivinhar.

> Nota: `STORE_API.md` §3 descrevia estas ações como sendo por índice. Está
> desatualizado face ao código; corrigido no âmbito deste trabalho.

#### Gate das ações destrutivas

`delete_*` e `update_*` não escrevem na primeira chamada: `execTool` devolve
`{ pending: true, preview: { … } }`. A escrita só acontece quando a UI
reenvia a mesma chamada com `confirmed: true`. O gate vive no executor, não na
UI — qualquer chamador apanha o mesmo bloqueio.

### 4.4 `src/lib/aiChat.js` (novo)

Orquestra o loop: mensagem do utilizador → `chat()` com `TOOL_SCHEMAS` →
se vierem `tool_calls`, executa cada uma com `execTool`, junta os resultados
como mensagens `role:'tool'` e volta a chamar. **Máximo de 4 voltas**; ao
esgotar, devolve o texto que houver e avisa. Acumula `usage` de todas as
voltas para o custo total do pedido.

### 4.5 UI

- `QuickActions`: quinto botão **✦ IA**; círculos de 54 → 48 px para os cinco
  caberem na largura.
- `modals/AssistantSheet.jsx`, chave `assistant` em `MODALS` (`store/ui.jsx`)
  e em `MODAL_COMPONENTS` (`components/Shell.jsx`), carregado com `lazy` como
  os restantes.
- `renderMD` sai de `AIView.jsx` para `src/lib/markdown.js`, partilhado pelas
  duas UIs (e tira ~70 linhas a um ficheiro de 1027).
- Ações não destrutivas: aplica, mostra toast de confirmação e deixa um botão
  **Anular** no cartão da resposta dentro da sheet (guarda o array anterior de
  cada slice tocada; anular restaura-o). O `Toast` partilhado não suporta
  botões de ação e não é alterado por este trabalho.
- Ações destrutivas: cartão de pré-visualização com **Confirmar** / **Cancelar**
  ("Vou apagar *Continente 45,67 EUR · 28.08*").
- `AIView` mantém o painel de import de documentos e o histórico, passando a
  usar o mesmo motor.

## 5. Erros

Traduzidos para PT no cliente, sem expor a key nem o corpo cru da resposta:

| origem | mensagem |
|---|---|
| 402 OpenRouter | "Sem créditos no OpenRouter." |
| 429 | "Demasiados pedidos. Tenta daqui a pouco." |
| 503 / sem provider | "Modelo indisponível de momento." |
| 401/403 do proxy | mensagens atuais de sessão/acesso, inalteradas |
| rede | "Erro de rede ao contactar a IA. Tenta novamente." |

`not_found` e erros de validação de argumentos voltam ao **modelo** como
resultado de tool, não ao utilizador — o modelo corrige-se sozinho.

## 6. Testes

- `aiTools.test.js` — resolução por `id` (existe, não existe → `not_found`),
  gate destrutivo (primeira chamada não escreve; `confirmed` escreve),
  mapeamento de cada tool para a action certa, validação de argumentos.
- `aiChat.test.js` — loop com `chat` mocado: uma volta, várias voltas, corte
  às 4 voltas, acumulação de `usage`.
- `ai.test.js` — tradutor de conteúdo (PDF/imagem/texto) com `fetch` mocado.
- Testes de render para `AssistantSheet` e para o `QuickActions` com cinco
  botões.
- A suite existente (518 testes) tem de continuar verde, com destaque para
  `ImportStatementSheet` e `BalanceUpdateSheet`, cujos contratos não mudam.

## 7. Migração

1. `OPENROUTER_API_KEY` na Vercel (produção **e** preview).
2. Deploy em preview; validar chat, import de extrato e atualização de saldo
   por print.
3. Promover a produção. Hard reload (Cmd+Shift+R) por causa do service worker.
4. Remover `ANTHROPIC_API_KEY` da Vercel depois de produção validada.
5. Atualizar `testes.html` com os casos de QA e as notas de segurança.

## 8. Custo esperado

| pedido | tokens aprox. | custo |
|---|---|---|
| chat simples (contexto + schemas + resposta) | 5k in / 600 out | ~$0,003 |
| chat com 2 voltas de tools | 11k in / 900 out | ~$0,006 |
| import de extrato de 3 páginas (3.7 Flash) | 20k in / 3k out | ~$0,027 |

## 9. Fora de âmbito

- Streaming de respostas.
- Memória entre conversas além do `aiHistory` atual (últimas 20 entradas).
- Voz.
- Escolha de modelo pelo utilizador na app (a whitelist é do servidor).
