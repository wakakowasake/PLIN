const SW_VERSION = '2026-05-03-01';
const STATIC_CACHE = `plin-static-${SW_VERSION}`;
const PAGE_CACHE = `plin-pages-${SW_VERSION}`;
const RUNTIME_CACHE = `plin-runtime-${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';

const APP_SHELL = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/manifest.json',
  '/images/icon-180.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

const NO_CACHE_HOSTS = new Set([
  'maps.googleapis.com',
  'maps.gstatic.com',
  'firebase.googleapis.com',
  'firestore.googleapis.com',
  'www.googletagmanager.com',
  'analytics.google.com',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
]);

const DEV_PATH_PREFIXES = ['/__vite_ping', '/@vite', '/@fs/', '/node_modules/.vite/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch((error) => {
      console.warn('[SW] 앱 셸 캐시 실패:', error);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const allowList = new Set([STATIC_CACHE, PAGE_CACHE, RUNTIME_CACHE]);
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) => {
        if (!allowList.has(cacheName)) {
          return caches.delete(cacheName);
        }
        return Promise.resolve();
      })
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isBypassRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

  if (NO_CACHE_HOSTS.has(url.hostname)) return true;

  if (url.hostname === self.location.hostname) {
    return DEV_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  }

  return false;
}

function isMobileWebRequest(url) {
  return url.origin === self.location.origin && (url.pathname === '/m' || url.pathname.startsWith('/m/'));
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  return networkPromise;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  const networkResponse = await fetch(request);
  if (networkResponse && networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isBypassRequest(request, url)) {
    return;
  }

  if (isMobileWebRequest(url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGE_CACHE, OFFLINE_URL));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(networkFirst(request, RUNTIME_CACHE));
      return;
    }

    if (request.destination === 'image') {
      event.respondWith(cacheFirst(request, RUNTIME_CACHE).catch(() => caches.match('/images/icon-180.png')));
      return;
    }

    if (
      request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font' ||
      request.destination === 'worker'
    ) {
      event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
      return;
    }
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});
