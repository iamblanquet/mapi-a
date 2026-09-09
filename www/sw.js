const CACHE_NAME = 'gps-pwa-v2';
const TILE_CACHE_NAME = 'gps-pwa-tiles-v1';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/silence.wav',
  './lib/leaflet/leaflet.css',
  './lib/leaflet/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Las peticiones al API nunca se interceptan aquí (se gestionan en la cola offline de la app)
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Cachear mosaicos de mapas de OpenStreetMap para que se vean SIN INTERNET
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          // Si no hay internet y no está en caché
          return cached || new Response('', { status: 404 });
        }
      })
    );
    return;
  }

  // Para el resto de archivos (HTML, CSS, JS, audio): Cache First con fallback a red
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        // En modo offline total
        return cachedResponse;
      });
    })
  );
});
