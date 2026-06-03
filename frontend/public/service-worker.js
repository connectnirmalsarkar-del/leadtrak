// Leadtrak Service Worker
// IMPORTANT: Bump CACHE_NAME on every release to force the browser to fetch fresh CSS/JS
const CACHE_NAME = 'leadtrak-v101-attachment-proxy';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  // Activate this worker immediately, skipping the "waiting" phase
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete every old cache (anything not matching current CACHE_NAME)
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      // Take control of all open tabs immediately
      await self.clients.claim();
      // Tell every client a new version is active so it can reload once
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', cache: CACHE_NAME });
      });
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for HTML / navigation so the app shell always updates
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Network-first for JS/CSS bundles so new builds load immediately
  if (
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (images, fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
          return res;
        })
        .catch(() => cached);
    })
  );
});


// ==================== Web Push handlers ====================
// Receive a push from the server, show a native OS notification.
// `event.waitUntil` is critical on iOS — without it the worker can be killed
// before showNotification resolves.
self.addEventListener('push', (event) => {
  let payload = { title: 'Leadtrak', body: '', url: '/', tag: 'default' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (e) {
      payload.body = event.data.text();
    }
  }
  const options = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag,
    renotify: true,
    requireInteraction: false,
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Open / focus the app at the deep link when the notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Try to focus an existing client of the same origin and navigate it.
      for (const c of all) {
        try {
          if (new URL(c.url).origin === self.location.origin) {
            await c.focus();
            if ('navigate' in c) {
              try { await c.navigate(target); } catch (e) { /* ignore — some browsers block */ }
            }
            return;
          }
        } catch (e) { /* ignore url parse */ }
      }
      // No window — open a new one
      if (clients.openWindow) await clients.openWindow(target);
    })(),
  );
});
