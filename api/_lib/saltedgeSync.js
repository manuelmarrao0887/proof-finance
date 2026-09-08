// Sincroniza UMA ligação (connection) da Salt Edge para o Firestore do
// utilizador dono dela — chamado tanto pela ação manual 'sync' (api/saltedge.js)
// como pelo webhook (api/saltedge-webhook.js) quando a Salt Edge avisa que há
// dados novos. Nunca lança para fora: falhas por conta ficam no relatório
// devolvido, para uma conta problemática não impedir as outras de sincronizar.
//
// Reaproveita EXATAMENTE o pipeline do import manual de extrato — a mesma
// deduplicação e as mesmas regras de categoria (D8 da spec) — para nunca
// haver dois caminhos a decidir "que despesa é esta".

import { listAccounts, listTransactions } from './saltedgeClient.js';
import { decryptSecret } from './crypto.js';
import { mapSaltedgeAccountToCustomAcct, mapSaltedgeTransaction } from './saltedgeMap.js';
import { dedupeAddedExp, expenseKey } from '../../src/lib/dedupe.js';
import { applyRules } from '../../src/lib/finance.js';
import { guessCategory } from '../../src/lib/categorize.js';

// Janela de leitura para deduplicar contra despesas já existentes — não lê a
// coleção inteira a cada sincronização, só o que pode colidir. 120 dias cobre
// largamente o "background fetch" da Salt Edge (até 4x/24h, histórico curto).
const DEDUPE_WINDOW_DAYS = 120;

function acctLabel(bank, type) {
  return bank + ' · ' + type;
}

export async function syncConnection(db, { uid, connectionId, connectionSecretEnc, providerName }) {
  const connectionSecret = decryptSecret(connectionSecretEnc);
  const report = { accounts: 0, newExpenses: 0, newIncomes: 0, errors: [] };

  const accounts = await listAccounts(connectionId, connectionSecret);
  if (!accounts.length) return report;

  const userRef = db.collection('users').doc(uid);
  const rulesSnap = await userRef.collection('rules').get();
  const rulesState = { rules: rulesSnap.docs.map((d) => d.data()) };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEDUPE_WINDOW_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const existingSnap = await userRef.collection('movements').where('date', '>=', cutoffIso).get();
  const existingExpenses = existingSnap.docs.map((d) => d.data());
  const existingKeys = new Set(existingExpenses.map(expenseKey));
  const existingSaltedgeIds = new Set(existingExpenses.filter((x) => x.saltedgeTxId).map((x) => x.saltedgeTxId));

  const batch = db.batch();
  let batchOps = 0;
  const commitIfFull = async () => {
    if (batchOps >= 400) {
      await batch.commit();
      batchOps = 0;
    }
  };

  for (const acc of accounts) {
    try {
      const mapped = mapSaltedgeAccountToCustomAcct(acc, providerName);
      const acctDocId = 'se_' + acc.id;
      batch.set(userRef.collection('accounts').doc(acctDocId), { id: acctDocId, ...mapped }, { merge: true });
      batchOps++;
      report.accounts++;

      const label = acctLabel(mapped.bank, mapped.type);
      const txs = await listTransactions(connectionId, acc.id, connectionSecret);
      for (const tx of txs) {
        if (!tx || tx.id == null) continue;
        if (existingSaltedgeIds.has(String(tx.id))) continue; // já sincronizada
        const m = mapSaltedgeTransaction(tx);
        if (!m.date || !m.amount) continue;
        if (m.isIncome) {
          const doc = {
            id: 'se_' + tx.id,
            name: m.desc,
            amount: Math.abs(m.amount),
            date: m.date,
            source: 'other',
            recurring: false,
            acct: label,
            imported: true,
            saltedgeTxId: String(tx.id),
          };
          batch.set(userRef.collection('incomes').doc(doc.id), doc, { merge: true });
          batchOps++;
          report.newIncomes++;
        } else {
          const cat = applyRules(rulesState, m.desc) || guessCategory(m.desc) || 'out';
          const row = {
            id: 'se_' + tx.id,
            desc: m.desc,
            amount: Math.abs(m.amount),
            cat,
            date: m.date,
            acct: label,
            imported: true,
            saltedgeTxId: String(tx.id),
          };
          const key = expenseKey(row);
          if (existingKeys.has(key)) continue; // mesma despesa já lançada à mão
          existingKeys.add(key);
          batch.set(userRef.collection('movements').doc(row.id), row, { merge: true });
          batchOps++;
          report.newExpenses++;
        }
      }
      await commitIfFull();
    } catch (e) {
      console.error('[saltedge-sync] conta', acc && acc.id, e && e.message);
      report.errors.push({ accountId: acc && acc.id, message: e && e.message });
    }
  }

  batch.set(
    db.collection('saltedge_customers').doc(uid).collection('connections').doc(connectionId),
    { lastSyncAt: new Date().toISOString(), lastSyncReport: { accounts: report.accounts, newExpenses: report.newExpenses, newIncomes: report.newIncomes } },
    { merge: true }
  );
  batchOps++;
  if (batchOps > 0) await batch.commit();

  return report;
}

// dedupeAddedExp é reexportado só para os testes confirmarem que este
// ficheiro usa mesmo a função partilhada (e não uma cópia local).
export { dedupeAddedExp };
