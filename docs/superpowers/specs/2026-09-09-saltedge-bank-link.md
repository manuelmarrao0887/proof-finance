# Ligar contas bancárias via Salt Edge — spec

**Pedido do utilizador:** "quero que integres com os bancos então via Saltedge. ja tenho a API Key app id e secret key" (2026-09-09).

**Autoridade dos factos de API:** confirmados ao vivo em docs.saltedge.com/account_information/v5 e general/v5 nesta data (não de memória). Ver "Factos Salt Edge" abaixo.

## Decisões (D1–D10)

- **D1 — Onde vivem os segredos.** `App-id`/`Secret` da Salt Edge só existem em variáveis de ambiente do servidor (`SALTEDGE_APP_ID`, `SALTEDGE_SECRET`), nunca no browser — mesmo padrão de `OPENROUTER_API_KEY` (`api/ai.js`). O utilizador define-as via `vercel env add`, nunca as cola nesta conversa.
- **D2 — Segredos por utilizador (customer/connection secret).** A Salt Edge devolve um `secret` por customer e por connection — equivalem a um token de sessão que lê a conta bancária. Guardados cifrados (AES-256-GCM, chave `SALTEDGE_ENC_KEY`) numa coleção Firestore de topo `saltedge_customers/{uid}`, nunca na árvore `users/{uid}` que o cliente lê. As regras do Firestore já negam por omissão qualquer coleção sem `match` explícito — não precisam de alteração.
- **D3 — Autenticação dos pedidos ao Proof.** Mesmo padrão do `api/ai.js`: token Firebase (`Authorization: Bearer`) + `ALLOWED_EMAILS`. Reutiliza `parseServiceAccount`/`verifyRequestToken` exportados de `api/ai.js` (não duplica a lógica do `jose`/`jwks-rsa`).
- **D4 — Webhook público.** `api/saltedge-webhook.js` não tem token Firebase (é a Salt Edge a chamar); autentica-se pela assinatura RSA-SHA256 no header `Signature`, verificada com a chave pública fixa da Salt Edge (`Signature-key-version: 5.0`) sobre a string `callback_url|corpo_bruto`. Callback assinado mas com `customer_id` desconhecido é ignorado (200, sem efeito) — nunca 500 (a Salt Edge reencaminha em erro).
- **D5 — Índice customer→utilizador.** `saltedge_customer_index/{customerId} → { uid }`, escrito ao criar o customer, para o webhook (que só recebe `customer_id`) encontrar o utilizador em O(1).
- **D6 — Ambiente de testes por omissão.** `SALTEDGE_ENV` (`test` por omissão, `live` depois de aprovação da Salt Edge) controla `include_fake_providers` no `connect_session`. Em `test`, o widget mostra bancos fictícios (Fakebank) — fluxo completo sem tocar em dados reais até o utilizador validar.
- **D7 — Contas ligadas entram como contas normais.** Cada `account` da Salt Edge cria/atualiza UM registo na subcoleção `accounts` do utilizador (mesma forma de `customAccts`), com campos extra opcionais `saltedgeAccountId`, `saltedgeConnectionId`, `linkedBank: true` — nenhuma migração necessária (campos opcionais).
- **D8 — Transações reutilizam o import existente.** As transações da Salt Edge passam pelo MESMO caminho do import de extrato manual: `dedupeAddedExp`/`expenseKey` (`src/lib/dedupe.js`), `applyRules`/`guessCategory` (`finance.js`/`categorize.js`), gravadas com `imported: true` + `saltedgeTxId` (idempotência no resync).
- **D9 — Disparo de sincronização.** MVP não tem cron próprio (Vercel functions são on-demand). A própria Salt Edge atualiza a ligação em segundo plano (até 4×/dia por PSD2) e chama o callback `notify`/`finish`; o webhook processa nessa altura. Existe também `action: 'sync'` manual no ecrã de contas ligadas.
- **D10 — Passo manual fora do código.** A Salt Edge exige a URL do callback configurada no painel da app (`https://proof-finance.vercel.app/api/saltedge-webhook`) — não é definível por API com a confiança que tenho nos docs consultados. Documentado como passo manual do utilizador, não assumido como feito.

## Factos Salt Edge (confirmados 2026-09-09)

- Base única: `https://www.saltedge.com/api/v5` (sem host de sandbox separado).
- Auth de serviço: headers `App-id` + `Secret`. Pedidos de customer: `Customer-secret`. Pedidos de connection: `Connection-secret`.
- Assinatura de pedidos SAÍDA (RSA da app) só é obrigatória para clientes "live"; em "Test" é opcional — não implementado nesta fase.
- `POST /customers` `{data:{identifier}}` → `{id, secret}`.
- `POST /connect_sessions/create` `{data:{customer_id, consent:{scopes, from_date}, attempt:{return_to}}}` → `{connect_url}`.
- `GET /connections?customer_id=`, `GET /accounts?connection_id=`, `GET /transactions?connection_id=&account_id=` (paginado).
- `PUT /connections/{id}/refresh` (ligação válida), `PUT /connections/{id}/reconnect` (credenciais inválidas).
- Callback assinado: header `Signature` = base64(RSA-SHA256("callback_url|corpo_bruto")), chave pública fixa publicada nos docs (embutida em `api/_lib/saltedgePublicKey.js`).
- Fakebank de teste: `fakebank_simple_xf`, `fakebank_interactive_xf`, `fake_oauth_client_xf` — via `include_fake_providers: true`.

## Fora de âmbito nesta fase

Assinatura de pedidos de saída (cliente "live"), multi-moeda com câmbio aplicado, mapeamento de cartão de crédito com ciclo de faturação a partir da Salt Edge, reconexão automática por UI (fica para quando houver um utilizador "live" a testar).
