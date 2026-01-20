const CACHE_NAME = 'plin-v1.1.0';
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/ui.js',
  '/js/firebase.js',
  '/js/map.js',
  '/js/logger.js',
  '/js/performance.js',
  '/js/lazy-load.js',
  '/manifest.json',
  '/favicon.ico'
];

// 캐시할 API 응답 패턴
const API_CACHE_PATTERNS = [
  /api\.open-meteo\.com/,
  /maps\.googleapis\.com/,
];

// 설치 이벤트 - 정적 리소스 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 일부 파일이 없어도 설치가 실패하지 않도록 개별적으로 추가하거나
      // 중요 파일만 먼저 캐싱
      return cache.addAll(STATIC_CACHE).catch(err => {
        console.warn('일부 리소스 캐싱 실패:', err);
      });
    })
  );
  self.skipWaiting();
});

// 활성화 이벤트 - 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch 이벤트 - 캐싱 전략 적용
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase API 및 브라우저 확장 프로그램 요청은 캐시하지 않음
  if (url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com/firestore') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.protocol === 'chrome-extension:') {
    return;
  }

  // 정적 리소스: Cache First
  if (request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // API 요청: Network First (날씨, 지도 등)
  const isApiRequest = API_CACHE_PATTERNS.some(pattern => pattern.test(url.href));

  if (isApiRequest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // 기본 전략: Stale While Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (request.method === 'GET' && response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // 네트워크 실패 시 조용히 실패
      });

      return cached || networkFetch;
    })
  );
});