# Open Banking PSD2 — sincronização automática de movimentos

**Estado:** STANDBY — precisa de credenciais do agregador (ver §5).
**Objetivo:** substituir o import manual de Excel por sincronização automática dos movimentos bancários.

---

## 1. Porquê

Hoje o fluxo é: exportar Excel do ActivoBank → importar → classificar → confirmar duplicados.
Com PSD2 passa a: autorizar o banco uma vez (90 dias) → movimentos entram sozinhos, já classificados.

O importador determinístico atual **mantém-se** como fallback (bancos não suportados, extratos antigos, PDF).

## 2. Agregador recomendado: GoCardless Bank Account Data

Antiga Nordigen. Escolhido por:

- **Grátis** até 50 contas ligadas (chega e sobra para uso pessoal)
- Cobre a **banca portuguesa** (ActivoBank, Millennium BCP, CGD, Santander, Novobanco, Bankinter, Revolut)
- API REST simples, sem contrato empresarial
- Devolve até **24 meses** de histórico

Alternativas: Tink (Visa) e Plaid — ambas exigem contrato comercial; não compensam neste contexto.

## 3. Fluxo técnico

```
1. POST /api/bank/token          → access token (server-side, chave nunca no browser)
2. GET  /api/bank/institutions   → lista de bancos PT (id, nome, logo)
3. POST /api/bank/link           → cria requisition → devolve URL do banco
4. (utilizador autentica no banco, volta ao redirect)
5. GET  /api/bank/accounts       → contas autorizadas (IBAN, moeda)
6. GET  /api/bank/transactions   → movimentos (booked + pending)
```

**Consentimento válido 90 dias** — depois é preciso repetir o passo 3. A app deve avisar
7 dias antes de expirar (encaixa no sistema de lembretes existente).

## 4. Integração na app (o que muda e o que NÃO muda)

O modelo de dados **não muda**. Os movimentos do agregador entram exatamente pelo mesmo
caminho do importador de Excel:

| Peça existente | Reutilizada como |
|---|---|
| `parseBankStatement` | substituído por um mapper `gcTxToBankTx` (mesma forma de saída) |
| `categorize.guessCategory` | igual — classificação automática |
| `importBank.isTransferDesc` | igual — transferência entre contas próprias |
| `dedupe.dayAmountKey` / `expenseKey` | igual — evita duplicados na re-sincronização |
| `ImportStatementSheet` (preview) | igual — o utilizador confirma antes de gravar |

Mapper (formato GoCardless → formato interno):

```js
// transactionAmount.amount vem como string com sinal; débito negativo
{
  date: t.bookingDate || t.valueDate,                  // 'YYYY-MM-DD' (já ISO)
  desc: cleanBankDesc(t.remittanceInformationUnstructured || t.creditorName || ''),
  raw:  t.remittanceInformationUnstructured || '',
  amount: Number(t.transactionAmount.amount),
  isTransfer: isTransferDesc(raw),
}
```

Chave de deduplicação preferida: `transactionId` do agregador (estável). Quando ausente,
cai no `dayAmountKey` já usado.

## 5. O que falta (bloqueio actual)

1. Criar conta em <https://bankaccountdata.gocardless.com> (grátis)
2. Gerar `SECRET_ID` e `SECRET_KEY`
3. Adicionar às env vars do Vercel: `GC_SECRET_ID`, `GC_SECRET_KEY`
4. Configurar o redirect URI: `https://proof-finance.vercel.app/?bank=callback`

**A chave nunca pode ir para o browser** — todas as chamadas passam por funções
serverless em `api/bank/*`, com verificação do Firebase ID token (mesmo padrão do
`api/ai.js` já existente).

## 6. Ordem de implementação (quando houver credenciais)

1. `api/bank/[action].js` — proxy serverless (token, institutions, link, accounts, transactions)
2. `src/lib/openbanking.js` — cliente + `gcTxToBankTx` (puro, testável)
3. `src/modals/BankLinkSheet.jsx` — escolher banco → abrir consentimento → guardar `requisitionId`
4. Ligar ao `ImportStatementSheet`: novo botão "Sincronizar banco" a par de "Ficheiro"
5. Sincronização automática ao abrir a app (1×/dia), com o mesmo preview de confirmação
6. Aviso de consentimento a expirar (7 dias antes)

## 7. Riscos

- **Consentimento de 90 dias** é fricção real; mitigar com aviso antecipado
- Alguns bancos PT devolvem descritivos mais pobres que o extrato Excel — a classificação
  por comerciante pode perder precisão; manter o import de Excel como alternativa
- Rate limits: 4 pedidos/dia por conta no plano grátis → sincronizar no máximo 1×/dia
