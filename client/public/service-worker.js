/* eslint-disable no-restricted-globals */
// HoneyChain PWA Service Worker
const CACHE_NAME = 'honeychain-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
  '/honey-logo.png'
];

// Install Event: Pre-cache app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache core shell, don't fail entire install if one optional asset fails
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url).catch((err) => {
          console.warn('[ServiceWorker] Pre-cache skipped for:', url, err);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up legacy caches & take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Smart routing strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Only handle GET requests (POST/PUT/DELETE always go direct to network)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Exclude Web3 RPC, Blockchain nodes, Google Translate, APIs, or Chrome extensions
  if (
    url.port === '7545' || 
    url.port === '8545' || 
    url.pathname.includes('/rpc') || 
    url.pathname.startsWith('/api') ||
    url.hostname.includes('infura') ||
    url.hostname.includes('alchemy') ||
    url.hostname.includes('translate') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return; // Pass through to network unmodified
  }

  // 3. Navigation Requests (User opening pages): Network-First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Update cache with latest page
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // When offline, serve cached index.html
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html') || caches.match('/');
          });
        })
    );
    return;
  }

  // 4. Static Assets (JS, CSS, Images, Fonts): Stale-While-Revalidate / Cache-First
  const isStaticAsset = (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2')
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 5. Default: Network with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
