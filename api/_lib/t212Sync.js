/* ════════════════════════════════════════════════════════════════════════
   t212Sync — lê a Trading212 e escreve o resultado no Firestore com a Admin
   SDK. É o ÚNICO caminho de escrita destes dados: o botão "Sincronizar"
   (api/t212.js) e o cron diário (api/cron/t212.js) chamam esta mesma função,
   por isso a regra de mapeamento existe uma vez só.

   As posições da T212 são um ESPELHO: a cada sync, as que existem são
   atualizadas (id estável por ticker) e as que já não existem na carteira
   são apagadas. As manuais de outras corretoras nunca são tocadas.

   O cliente (src/firebase/data.js) carrega uma vez e grava por diff de ids;
   como estas linhas não estão no `prev` dele, nunca as apaga por engano —
   mas também não as vê até recarregar, e por isso a UI faz loadUser() depois
   de sincronizar.
   ════════════════════════════════════════════════════════════════════════ */

import { getAccountSummary, getPositions } from './t212Client.js';
import { mapSummaryToReading, mapPositions } from './t212Map.js';
import { lisbonToday } from './reminderSchedule.js';

// Uma posição é gerida pela sync se veio dela. O prefixo do id cobre linhas
// gravadas antes de `source` existir.
export function isT212Position(p) {
  if (!p) return false;
  return p.source === 't212' || String(p.id || '').startsWith('t212-');
}

// Manual escrita à mão que parece ser da mesma corretora ("Trading 212",
// "trading212", "T212") — candidata a duplicado depois de ligar a sync.
export function looksLikeT212Manual(p) {
  if (!p || isT212Position(p)) return false;
  return /t(rading)?\s*212/i.test(String(p.broker || ''));
}

export async function syncT212(db, { uid, date, fetchImpl, sleep } = {}) {
  const day = date || lisbonToday();
  const opts = { fetchImpl, sleep };

  // Rede primeiro, escrita depois: se a T212 falhar, nada é gravado.
  const summary = await getAccountSummary(opts);
  const rawPositions = await getPositions(opts);

  const reading = mapSummaryToReading(summary, day);
  const mapped = mapPositions(rawPositions);
  const mappedIds = new Set(mapped.map((p) => p.id));

  const userRef = db.collection('users').doc(uid);
  const existing = (await userRef.collection('positions').get()).docs.map((d) => ({ ...d.data(), id: d.id, __ref: d.ref }));

  const stale = existing.filter((p) => isT212Position(p) && !mappedIds.has(p.id));
  const manualCandidates = existing.filter(looksLikeT212Manual).map((p) => ({ id: p.id, asset: p.asset || '', broker: p.broker || '', qty: p.qty || 0 }));

  const batch = db.batch();
  batch.set(userRef.collection('t212Log').doc(reading.id), reading, { merge: true });
  mapped.forEach((p) => batch.set(userRef.collection('positions').doc(p.id), p, { merge: true }));
  stale.forEach((p) => batch.delete(p.__ref));

  const report = {
    date: day,
    baseCusto: reading.baseCusto,
    valorAtual: reading.valorAtual,
    currency: (summary && summary.currency) || 'EUR',
    cash: (summary && summary.cash && Number(summary.cash.availableToTrade)) || 0,
    positions: mapped.length,
    removed: stale.length,
    manualCandidates,
  };

  batch.set(
    userRef,
    { t212Sync: { enabled: true, lastSyncAt: new Date().toISOString(), lastReport: { date: day, valorAtual: report.valorAtual, positions: report.positions, removed: report.removed } } },
    { merge: true }
  );

  await batch.commit();
  return report;
}

// Limpeza opcional oferecida na 1ª sync: apaga as manuais duplicadas que o
// utilizador escolher. Nunca apaga uma posição gerida pela sync — essas são
// espelho e voltariam na sync seguinte.
export async function cleanupManualPositions(db, { uid, ids } = {}) {
  const wanted = new Set((ids || []).map(String));
  if (!wanted.size) return { removed: 0 };

  const userRef = db.collection('users').doc(uid);
  const docs = (await userRef.collection('positions').get()).docs;
  const targets = docs.filter((d) => wanted.has(d.id) && !isT212Position({ ...d.data(), id: d.id }));
  if (!targets.length) return { removed: 0 };

  const batch = db.batch();
  targets.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { removed: targets.length };
}
