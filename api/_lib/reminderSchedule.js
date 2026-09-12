/* ════════════════════════════════════════════════════════════════════════
   reminderSchedule — pure logic for api/cron/reminders.js.

   The cron runs every 5 minutes (see vercel.json) and, each time, asks: for
   this user, this reminder, right now — send? Kept pure/testable so the
   timezone/DST/dedupe rules never need a live Firestore or a live clock to
   verify.
   ════════════════════════════════════════════════════════════════════════ */

export const REMINDER_TYPES = ['almoco', 'jantar', 't212'];

export const REMINDER_COPY = {
  almoco: { title: 'Almoço', body: 'Já registaste o almoço de hoje?' },
  jantar: { title: 'Jantar', body: 'Já registaste o jantar de hoje?' },
  t212: { title: 'Trading212', body: 'Valida o valor atual da tua carteira.' },
};

// Corpo do lembrete da carteira. Quando a sync automática já correu HOJE
// (api/cron/t212.js grava t212Sync.lastReport no doc raiz), o push informa o
// valor em vez de pedir para o ires buscar à mão. Só lê o que já vem no doc
// do utilizador — sem pedidos extra ao Firestore a cada 5 minutos.
export function t212ReminderBody(lastReport, today) {
  if (!lastReport || lastReport.date !== today) return REMINDER_COPY.t212.body;
  const valor = Number(lastReport.valorAtual || 0).toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const pos = Number(lastReport.positions || 0);
  return 'Carteira sincronizada hoje: ' + valor + ' € · ' + pos + ' posições.';
}

// 'HH:MM' (Europe/Lisbon, from Intl — always local wall-clock time, immune to
// DST: the cron schedule itself is UTC-fixed, so the offset shifts twice a
// year and a fixed UTC cron would drift by an hour for half of it).
export function lisbonNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return get('hour') + ':' + get('minute');
}

// 'YYYY-MM-DD' in Europe/Lisbon — the dedupe key's day boundary must match
// the user's local day, not UTC's (else a reminder near midnight could fire
// twice, or the dedupe flag could roll over at the wrong moment).
export function lisbonToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

// Minutes since midnight for an 'HH:MM' string (invalid input -> NaN).
function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Should this one reminder fire right now?
//   pref         — { time:'HH:MM', enabled:bool } | null/undefined
//   nowHHMM      — lisbonNow() result
//   lastSentDate — 'YYYY-MM-DD' the reminder last actually sent, or null
//   today        — lisbonToday() result
//   windowMin    — tolerance either side of `time` (cron granularity is 5min;
//                  a default of 5 covers a slow/delayed invocation without
//                  drifting into the next slot)
// Fires once the current time reaches the target minute (within the window)
// and hasn't already fired today — never fires for a time already passed by
// more than the window (a cron that resumes after an outage should not spam
// every missed slot at once).
export function shouldSendReminder(pref, nowHHMM, lastSentDate, today, windowMin = 5) {
  if (!pref || !pref.enabled) return false;
  const target = toMinutes(pref.time);
  const now = toMinutes(nowHHMM);
  if (Number.isNaN(target) || Number.isNaN(now)) return false;
  if (lastSentDate === today) return false;
  const diff = now - target;
  return diff >= 0 && diff <= windowMin;
}
