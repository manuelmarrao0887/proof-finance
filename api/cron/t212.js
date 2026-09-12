// Vercel Cron — sincroniza a carteira Trading212 uma vez por dia (ver
// vercel.json), para o histórico crescer sozinho em vez de depender de te
// lembrares de tocar em "Sincronizar".
//
// SEGURANÇA: mesma porta do cron dos lembretes — só a Vercel pode chamar
// (Authorization: Bearer $CRON_SECRET), e sem o segredo devolve 404 para não
// revelar que o endpoint existe. A função de verificação é IMPORTADA do
// cron/reminders.js (não copiada) para as duas portas nunca divergirem.
//
// Só sincroniza quem tem t212Sync.enabled no doc raiz — ou seja, quem já
// sincronizou à mão pelo menos uma vez a partir da app.

import { getFirestoreDb } from '../_lib/firebaseAdmin.js';
import { syncT212 } from '../_lib/t212Sync.js';
import { isAuthorizedCron } from './reminders.js';

export { isAuthorizedCron };

// `syncImpl` é injetável para os testes correrem sem rede.
export async function syncEnabledUsers(db, { syncImpl, fetchImpl, sleep } = {}) {
  const doSync = syncImpl || syncT212;
  const snap = await db.collection('users').get();
  const targets = snap.docs.filter((d) => {
    const meta = (d.data() && d.data().t212Sync) || {};
    return !!meta.enabled;
  });

  let synced = 0;
  let failed = 0;
  const errors = [];
  for (const d of targets) {
    try {
      await doSync(db, { uid: d.id, fetchImpl, sleep });
      synced++;
    } catch (e) {
      failed++;
      errors.push({ uid: d.id, message: (e && e.message) || 'erro' });
      console.error('[cron/t212] sync falhou', d.id, e && e.message);
    }
  }
  return { users: targets.length, synced, failed, errors };
}

export default async function handler(req, res) {
  try {
    if (!isAuthorizedCron(req)) return res.status(404).end();

    const db = await getFirestoreDb();
    const out = await syncEnabledUsers(db);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    console.error('[cron/t212]', e && e.message);
    return res.status(500).json({ error: 'Falha no cron da Trading212' });
  }
}
