// Service Worker for Kelid Static PWA
const CACHE_NAME = 'kelid-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/IMG_5399.PNG',
  '/apple-touch-icon.png',
  '/logo/kelid-logo@1x.webp',
  '/logo/kelid-logo@2x.webp',
  '/logo/kelid-logo@1x.png',
  '/logo/kelid-logo@2x.png',
  '/logo/IMG_5399.PNG',
  '/icons/badge.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/kelarabad-tarh-hadi.jpg',
  '/kelarabad-tarh-hadi-legend.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url)));
      try {
        const res = await fetch('/index.html', { cache: 'no-cache' });
        if (res.ok) {
          const html = await res.text();
          await cache.put('/index.html', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
          await cache.put('/', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
          const assetMatches = html.match(/\/assets\/[^"'\s>]+/g) || [];
          await Promise.allSettled(assetMatches.map((assetUrl) => cache.add(assetUrl)));
        }
      } catch {
        // Ignore if install happens without network
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Do not cache direct Gemini API requests
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // Handle navigation requests (SPA entry point)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex =
            (await caches.match('/index.html')) || (await caches.match('/'));
          return cachedIndex || Response.error();
        })
    );
    return;
  }

  // Cache-first for static assets, network fallback with dynamic caching
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          if (
            response &&
            (response.status === 200 || response.type === 'opaque') &&
            (url.origin === self.location.origin ||
              url.hostname.includes('fonts.googleapis.com') ||
              url.hostname.includes('fonts.gstatic.com') ||
              url.hostname.includes('unpkg.com'))
          ) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});

// Push and Notification Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

