/* ════════════════════════════════════════════════════════════════════════
   Service worker (Workbox injectManifest) — precache + navigation fallback
   (same behaviour the previous generateSW config had) PLUS push notification
   handling, which generateSW cannot host (no room for custom code).

   registerType:'prompt' (see App.jsx) means a new SW installs but waits: it
   only takes over when the user taps "Atualizar" (registerSW's update(true))
   → postMessage('SKIP_WAITING') → the listener below calls self.skipWaiting().
   ════════════════════════════════════════════════════════════════════════ */

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ── Push notifications ──────────────────────────────────────────────────
   Payload shape sent by api/cron/reminders.js: { type, title, body }. `type`
   drives notificationclick's deep link — see DEEP_LINKS below. */
const DEEP_LINKS = {
  t212: './?tab=t212',
  almoco: './?tab=ai&draft=Almo%C3%A7o',
  jantar: './?tab=ai&draft=Jantar',
};

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || 'Proof. Finance';
  const body = data.body || '';
  const type = data.type || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: 'icon.svg',
      tag: type || 'proof-finance',
      // Substitui uma notificação do MESMO tipo ainda por ler em vez de
      // empilhar (ex.: o lembrete de almoço de ontem que nunca se tocou).
      renotify: true,
      data: { type },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const type = event.notification.data && event.notification.data.type;
  const url = DEEP_LINKS[type] || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((allClients) => {
      const existing = allClients.find((c) => c.url.startsWith(self.registration.scope));
      if (existing) {
        return existing.navigate(url).then((c) => c && c.focus());
      }
      return self.clients.openWindow(url);
    })
  );
});
