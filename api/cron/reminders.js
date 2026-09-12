// Vercel Cron — corre a cada 5 min (ver vercel.json), varre todos os
// utilizadores e manda um Web Push a quem tiver um lembrete (almoço/jantar/
// carteira Trading212) a bater a hora, na timezone Europe/Lisbon.
//
// SEGURANÇA: só o Vercel Scheduler pode chamar isto. Quando a env
// CRON_SECRET está definida, a Vercel manda automaticamente
// `Authorization: Bearer $CRON_SECRET` nas invocações do cron — verificamos
// isso aqui; sem a env (ou sem o header certo) o pedido é recusado (404, não
// 401 — não revela que o endpoint existe).
//
// Estado de dedupe (reminderLastSent) é escrito com a Admin SDK diretamente
// no doc raiz, fora do fluxo normal do cliente (nunca entra em
// PERSISTED_KEYS/ROOT_KEYS do lado do cliente) — não há corrida entre o
// cliente a sincronizar e o cron a marcar "já enviado hoje".

import { getFirestoreDb } from '../_lib/firebaseAdmin.js';
import { REMINDER_TYPES, REMINDER_COPY, lisbonNow, lisbonToday, shouldSendReminder, t212ReminderBody } from '../_lib/reminderSchedule.js';

// Extraído para ser testável sem montar um req/res falso: só a Vercel deve
// conseguir chamar o cron. 404 (não 401) nos dois casos de falha — não
// revela se o endpoint existe a quem não tem o segredo.
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === 'Bearer ' + secret;
}

export async function sendToUser(webpush, db, uid, userDoc) {
  const prefs = userDoc.reminderPrefs || {};
  const lastSent = userDoc.reminderLastSent || {};
  const now = lisbonNow();
  const today = lisbonToday();

  const due = REMINDER_TYPES.filter((type) => shouldSendReminder(prefs[type], now, lastSent[type], today));
  if (!due.length) return { uid, sent: [] };

  const subsSnap = await db.collection('users').doc(uid).collection('pushSubs').get();
  const subs = subsSnap.docs.map((d) => ({ ref: d.ref, data: d.data() }));

  for (const type of due) {
    const copy = REMINDER_COPY[type];
    // A carteira já pode ter sido lida pelo cron da T212 hoje — nesse caso o
    // lembrete informa o valor em vez de pedir para o inserires.
    const body = type === 't212' ? t212ReminderBody(userDoc.t212Sync && userDoc.t212Sync.lastReport, today) : copy.body;
    const payload = JSON.stringify({ type, title: copy.title, body });
    await Promise.all(
      subs.map(async ({ ref, data }) => {
        const subscription = { endpoint: data.endpoint, keys: data.keys };
        try {
          await webpush.sendNotification(subscription, payload);
        } catch (err) {
          // Subscrição morta (utilizador desinstalou/revogou) — o browser
          // nunca mais vai aceitar pushes nela, apagar evita tentar para
          // sempre a cada 5 min.
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            await ref.delete().catch(() => {});
          } else {
            // eslint-disable-next-line no-console
            console.error('[cron/reminders] envio falhou', uid, type, err && err.statusCode, err && err.message);
          }
        }
      })
    );
  }

  await db
    .collection('users')
    .doc(uid)
    .set({ reminderLastSent: Object.fromEntries(due.map((t) => [t, today])) }, { merge: true });

  return { uid, sent: due };
}

export default async function handler(req, res) {
  try {
    if (!isAuthorizedCron(req)) {
      return res.status(404).end();
    }

    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;
    if (!vapidPublic || !vapidPrivate || !vapidSubject) {
      console.error('[cron/reminders] VAPID nao configurado (PUBLIC/PRIVATE/SUBJECT)');
      return res.status(503).json({ error: 'VAPID nao configurado' });
    }

    // web-push é CommonJS puro — `.default` é sempre o module.exports inteiro,
    // ao contrário dos named exports (dependem de deteção estática que nem
    // todo pacote CJS ativa). Import dinâmico: mantém a função testável sem
    // depender do módulo real carregado no topo do ficheiro.
    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const db = await getFirestoreDb();
    const usersSnap = await db.collection('users').get();
    const results = await Promise.all(usersSnap.docs.map((d) => sendToUser(webpush, db, d.id, d.data())));

    const sentCount = results.reduce((n, r) => n + r.sent.length, 0);
    return res.status(200).json({ ok: true, users: usersSnap.size, remindersSent: sentCount });
  } catch (e) {
    console.error('[cron/reminders]', e && e.message);
    return res.status(500).json({ error: 'Falha no cron de lembretes' });
  }
}
