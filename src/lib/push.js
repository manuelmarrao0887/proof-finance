/* ════════════════════════════════════════════════════════════════════════
   push — client-side Web Push subscription helpers.

   The VAPID PUBLIC key is not a secret (it identifies the sender to the push
   service, same idea as the Firebase config already hardcoded in
   firebase/client.js) — safe to ship in the bundle. The PRIVATE key never
   leaves the server (see api/cron/reminders.js, env VAPID_PRIVATE_KEY).

   iOS Safari only supports Web Push for a PWA added to the Home Screen
   (`display-mode: standalone`) — a normal Safari tab silently has no
   PushManager AT ALL ('PushManager' in window is false pre-install), which
   is exactly what isPushSupported() checks. Desktop/Android Chrome and
   desktop Safari support Web Push from a plain browser tab, no install
   required — isStandalone() must NEVER gate subscribePush() generally (it
   did once; that blocked desktop Chrome with an iOS-only error message).
   It's kept only so the UI can show the iOS-specific "install first" hint
   ahead of time, on iOS specifically.
   ════════════════════════════════════════════════════════════════════════ */

// Gerada uma única vez para este projeto (ver docs/superpowers — não é
// segredo). Se algum dia for preciso rodar a chave, a rotação obriga a
// re-subscrever todos os dispositivos (subscrições antigas ficam órfãs).
export const VAPID_PUBLIC_KEY =
  'BHDZHcHbG0pgW7PQY345mVQ6e7b4QYePdXXmgLVr2QZu_pFwRcpFNI6zm6JCuqm2nrx-c77LW0NyZ3ppti8nshs';

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

// PWA instalada no ecrã principal? (iOS: só aí o Web Push funciona.)
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari expõe isto em vez de display-mode antes do PWA instalar.
    window.navigator.standalone === true
  );
}

// iPhone/iPad (inclui iPadOS 13+, que se disfarça de "MacIntel" mas tem
// ecrã tátil — um Mac a sério não tem maxTouchPoints > 0).
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Pede permissão (se preciso) + subscreve o push manager do SW ativo.
// Rejeita com uma mensagem PT já pronta para toast — nunca deixa o erro
// nativo do browser (inglês, técnico) chegar à UI.
export async function subscribePush() {
  if (!isPushSupported()) {
    if (isIOS()) throw new Error('Adiciona a app ao ecrã principal primeiro (Partilhar → Adicionar ao Ecrã Principal) — no iPhone/iPad as notificações só funcionam na app instalada.');
    throw new Error('Este navegador não suporta notificações push.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificações recusada.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return sub.toJSON();
}

export async function unsubscribePush() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
