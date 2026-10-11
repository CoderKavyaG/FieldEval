// FieldEval Service Worker (Offline PWA Caching)
const CACHE_NAME = 'fieldeval-cache-v1';

const PRECACHE_ASSETS = [
  '/',
  '/field',
  '/results',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/samples/leaves.jpg',
  '/samples/tag.jpg',
  '/samples/blank.jpg',
  '/samples/water.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('PWA precache warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Never intercept server API calls (/api/infer)
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Navigation: Network first, fallback to cached page or root
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const root = await caches.match('/');
        return root || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // Static files: Cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, cloned);
        });
        return response;
      });
    })
  );
});
