const CACHE_NAME = 'drivertax-pro-v5';
const APP_CACHE_PREFIX = 'drivertax-pro-';
const ACTIVATION_MARKER = '/__driver-buddy-sw-activated';
const INSTALL_CONTEXT_MARKER = '/__driver-buddy-had-app-cache-before-install';
const DAILY_REMINDER_NOTIFICATION_TAG = 'driver-buddy-daily-log-reminder';
const DAILY_REMINDER_ACTION_URL = '/?action=add-shift';
const APP_SHELL = ['/', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/pwa-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const hadAppCacheBeforeInstall =
          Boolean(self.registration.active) || keys.some((key) => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE_NAME);

        return caches.open(CACHE_NAME).then((cache) =>
          cache.put(INSTALL_CONTEXT_MARKER, new Response(hadAppCacheBeforeInstall ? 'true' : 'false'))
            .then(() => cache.addAll(APP_SHELL))
        );
      })
  );
  // Do NOT call skipWaiting here - UpdateBanner handles user-initiated updates
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const hadPreviousVersionCache = keys.some((key) => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE_NAME);

      return caches.open(CACHE_NAME)
        .then((cache) =>
          Promise.all([
            cache.match(ACTIVATION_MARKER),
            cache.match(INSTALL_CONTEXT_MARKER)
              .then((response) => response?.text())
              .then((value) => value === 'true'),
          ]).then(([marker, hadAppCacheBeforeInstall]) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
              .then(() => cache.put(ACTIVATION_MARKER, new Response('activated')))
              .then(() => ({ shouldNotify: hadPreviousVersionCache || hadAppCacheBeforeInstall || Boolean(marker) }))
          )
        );
    }).then(({ shouldNotify }) => {
      if (!shouldNotify) return undefined;

      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        if (clients.length > 0) {
          clients.forEach((client) => client.postMessage({ type: 'NEW_VERSION' }));
        }
      });
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Fonts: cache-first
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open('google-fonts-cache').then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // HTML navigation: network-first so deploys are always picked up
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // App assets: network-first so new deployments are not masked by stale caches.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (request.method === 'GET' && response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== DAILY_REMINDER_NOTIFICATION_TAG) return;

  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || DAILY_REMINDER_ACTION_URL, self.location.origin).href;
  const openTargetWindow = () => (self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const sameOriginClient = clients.find((client) => new URL(client.url).origin === self.location.origin);

      if (!sameOriginClient) {
        return openTargetWindow();
      }

      if (sameOriginClient.navigate) {
        return sameOriginClient.navigate(targetUrl)
          .then((client) => (client ? client.focus() : sameOriginClient.focus()))
          .catch(openTargetWindow);
      }

      return sameOriginClient.focus();
    })
  );
});
