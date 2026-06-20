const CACHE = 'hw-v0.2';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css',
  './js/app.js', './js/wayfinding.js', './js/mapData.js', './js/places.js',
  './js/render.js', './js/platform.js', './js/pwa.js',
  './data/nodes.json', './data/edges.json', './data/pois.json',
  './icon-192.svg', './icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match('./index.html'))),
  );
});
