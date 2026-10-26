// Service worker de Decodeny: la aplicación funciona sin conexión.
// El build inserta la versión de la caché y la lista de archivos (ver `serviceWorker()` en vite.config.ts).
const CACHE = 'decodeny-__VERSION__';
/** @type {string[]} */
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('decodeny-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// La página pide activar la versión nueva cuando el usuario acepta actualizar.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Documento: red primero (versión al día) y, sin conexión, la copia guardada.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('index.html').then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }
  // Recursos con hash en el nombre: inmutables, la caché primero.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
