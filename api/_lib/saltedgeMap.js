// Traduz o que a Salt Edge devolve (accounts/transactions) para a forma que
// a app já usa (customAccts / addedExp / incomes) — reaproveitando o MESMO
// pipeline de dedupe/categorização do import manual de extrato, para nunca
// haver duas fórmulas de "que despesa é esta".
//
// NOTA de confiança: o valor exato de `account.nature` devolvido pela Salt
// Edge (ex.: 'account', 'card', 'credit_card', 'savings'...) não foi
// confirmado ao pormenor nos docs consultados — o mapeamento abaixo é
// defensivo (por substring) e assume 'Conta a Ordem' quando não reconhece.

export function mapSaltedgeAccountToCustomAcct(acc, providerName) {
  const nature = String((acc && acc.nature) || '').toLowerCase();
  const isCard = nature.includes('card');
  const isSavings = nature.includes('saving');
  const type = isCard ? 'Cartão de Crédito' : isSavings ? 'Poupanca' : 'Conta a Ordem';
  const category = isCard ? 'Cartão de crédito' : isSavings ? 'Poupanca' : 'Liquidez';
  const out = {
    bank: providerName || (acc && acc.provider_name) || 'Banco ligado',
    type,
    category,
    value: Number((acc && acc.balance) || 0),
    currency: (acc && acc.currency_code) || 'EUR',
    custom: true,
    saltedgeAccountId: acc && acc.id,
    linkedBank: true,
    updated: new Date().toISOString(),
  };
  if (isCard && acc && acc.extra && acc.extra.credit_limit != null) {
    out.plafond = Number(acc.extra.credit_limit) || 0;
  }
  return out;
}

// Uma transação Salt Edge → o mesmo formato de linha que o import de extrato
// produz ANTES de entrar em dedupeAddedExp/applyRules/guessCategory
// (ver src/modals/ImportStatementSheet.jsx:328) — desconto (`made_on`
// negativo em `amount`) vira despesa positiva; crédito vira receita.
export function mapSaltedgeTransaction(tx) {
  const amount = Number((tx && tx.amount) || 0);
  const date = (tx && (tx.made_on || tx.processed_at || '')).toString().slice(0, 10);
  const desc = String((tx && (tx.description || tx.extra?.original_amount ? tx.description : tx.description)) || '').trim() || 'Movimento';
  return { raw: tx, desc, amount, date, isIncome: amount > 0, saltedgeTxId: tx && tx.id };
}
