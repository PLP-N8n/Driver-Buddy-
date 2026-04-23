const CACHE_NAME = 'drivertax-pro-v5';
const APP_SHELL = ['/', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/pwa-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Do NOT call skipWaiting here - UpdateBanner handles user-initiated updates
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) {
        clients.forEach((client) => client.postMessage({ type: 'NEW_VERSION' }));
      }
    }))
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
