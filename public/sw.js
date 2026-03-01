const CACHE_VERSION = 'dealcooker-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_FALLBACK_URL = '/offline';

const PRECACHE_URLS = ['/', OFFLINE_FALLBACK_URL, '/manifest.webmanifest', '/icon.png', '/pwa-192.png', '/pwa-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((cacheKey) => !cacheKey.startsWith(CACHE_VERSION))
          .map((cacheKey) => caches.delete(cacheKey))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          const runtimeCache = await caches.open(RUNTIME_CACHE);
          runtimeCache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          const offlineResponse = await caches.match(OFFLINE_FALLBACK_URL);
          if (offlineResponse) return offlineResponse;
          return Response.error();
        }
      })()
    );
    return;
  }

  const isStaticAsset =
    requestUrl.pathname.startsWith('/_next/static/') ||
    /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|json|woff|woff2)$/.test(requestUrl.pathname);

  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetch(event.request);
        const runtimeCache = await caches.open(RUNTIME_CACHE);
        runtimeCache.put(event.request, networkResponse.clone());
        return networkResponse;
      } catch {
        return Response.error();
      }
    })()
  );
});
