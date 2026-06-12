/* Service Worker — Reparto Facil
   Solo cachea los assets propios de la app.
   Todo lo externo (GPS, mapas, rutas, geocoding) va directo a la red.
*/

const CACHE = 'repartofacil-v3';

const ASSETS_PROPIOS = [
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/maps.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Dominios externos que NUNCA se cachean
const RED_SIEMPRE = [
  'nominatim.openstreetmap.org',   // búsqueda de direcciones
  'photon.komoot.io',              // búsqueda de direcciones (respaldo)
  'router.project-osrm.org',       // cálculo de rutas
  'stadiamaps.com',                // tiles del mapa
  'tile.openstreetmap.org',        // tiles fallback
  'unpkg.com',                     // Leaflet CDN
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS_PROPIOS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar cachés viejos ──────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Peticiones externas (mapas, geocoding, rutas) → siempre red
  const esExterno = RED_SIEMPRE.some(dominio => url.hostname.includes(dominio));
  if (esExterno) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 2. Assets propios → caché primero, red como fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Solo cachear respuestas válidas de nuestro propio origen
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clon = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clon));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
