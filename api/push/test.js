// Vercel Serverless Function — envia UMA notificação de teste ao utilizador
// autenticado, de imediato, sem passar pelo agendamento/dedupe do cron (ver
// api/cron/reminders.js). Existe só para "Enviar notificação de teste" em
// Definições → Lembretes: confirmar a subscrição de um dispositivo sem ter
// de esperar pela hora de um lembrete real.
//
// Mesma política de acesso dos outros endpoints autenticados (api/saltedge.js):
// token Firebase + allowlist de email — nunca envia para outro uid que não
// seja o do próprio token.

import { verifyRequestToken } from '../ai.js';
import { authenticate } from '../_lib/http.js';
import { getFirebaseAuth, getFirestoreDb } from '../_lib/firebaseAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const decoded = await authenticate(req, verifyRequestToken, getFirebaseAuth);
    const uid = decoded.uid;

    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;
    if (!vapidPublic || !vapidPrivate || !vapidSubject) {
      console.error('[api/push/test] VAPID nao configurado (PUBLIC/PRIVATE/SUBJECT)');
      return res.status(503).json({ error: 'Notificacoes nao configuradas' });
    }

    const db = await getFirestoreDb();
    const subsSnap = await db.collection('users').doc(uid).collection('pushSubs').get();
    if (subsSnap.empty) {
      return res.status(404).json({ error: 'Sem subscricao de notificacoes neste dispositivo — ativa em Definicoes primeiro.' });
    }

    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const payload = JSON.stringify({ type: 'test', title: 'Notificação de teste', body: 'Está a funcionar — as notificações estão prontas.' });
    let sent = 0;
    let failed = 0;
    await Promise.all(
      subsSnap.docs.map(async (doc) => {
        const data = doc.data();
        try {
          await webpush.sendNotification({ endpoint: data.endpoint, keys: data.keys }, payload);
          sent += 1;
        } catch (err) {
          failed += 1;
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            await doc.ref.delete().catch(() => {});
          } else {
            console.error('[api/push/test] envio falhou', uid, err && err.statusCode, err && err.message);
          }
        }
      })
    );

    if (!sent) return res.status(502).json({ error: 'Falha a enviar a todas as subscricoes', failed });
    return res.status(200).json({ ok: true, sent, failed });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Falha a enviar notificacao de teste' });
  }
}
