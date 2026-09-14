// Century Glass Art — Accounts & Billing: service worker
//
// Scope is deliberately narrow: this only exists to (a) make the app
// installable as a PWA and (b) let the app shell (HTML/JS/CSS/fonts/
// icons) launch instantly and survive a flaky connection. It NEVER
// caches anything from Supabase (customers, invoices, stock, etc.) —
// that must always be a live network request, or the person could end
// up looking at stale business data without knowing it. Bump CACHE_NAME
// whenever this file (or what it should precache) changes, so old
// caches get cleaned up on the next activate.
const CACHE_NAME = 'cga-shell-v1';
const PRECACHE_URLS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url) {
  return url.hostname.endsWith('.supabase.co');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Supabase API, Google Fonts, etc.) — never intercept.
  // Business data must always be live; fonts already have their own
  // long-lived browser HTTP cache from Google's CDN.
  if (url.origin !== self.location.origin) return;
  if (isSupabaseRequest(url)) return;

  // Navigations (opening the app / refreshing) — network first, so
  // there's never a stale app shell shown while online, with a cached
  // fallback for offline/flaky-connection launches.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/', { ignoreSearch: true }))
    );
    return;
  }

  // Built assets under /assets/ are content-hashed by Vite — safe to
  // treat as immutable and serve cache-first, populating the cache the
  // first time each one is actually requested.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Anything else same-origin — just pass through to the network.
});