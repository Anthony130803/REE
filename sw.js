/* ============================================
   DeliveryTrack v2 — Service Worker (PWA)
   ============================================ */

const CACHE_NAME = 'repartofacil-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/maps.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700;800&display=swap',
];

// Instalar — cachear assets principales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.filter(u => !u.startsWith('https://fonts')));
    })
  );
  self.skipWaiting();
});

// Activar — limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache-first para assets, network-first para Maps API
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Google Maps siempre online
  if (url.includes('maps.googleapis.com') || url.includes('maps.gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para todo lo demás: cache primero, luego red
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
