// Service worker de Decodeny: la aplicación funciona sin conexión.
// El build inserta la versión de la caché y la lista de archivos (ver `serviceWorker()` en vite.config.ts).
const CACHE = 'decodeny-d8ee3a512a16';
/** @type {string[]} */
const PRECACHE = ["index.html","assets/PersonMode-DB7hN2mF.js","assets/app-BCq1XrmU.js","assets/canvas-D_RY7u_x.js","assets/cloud-V9f72Hlm.js","assets/firebase-backend-zOPrnJgC.js","assets/index-CdU2qeMx.js","assets/index-Cpt3teN7.css","assets/item-thumbnails-s6NjFEZq.js","assets/part-geometry-BKygNyY9.js","assets/r3f-CLcHxA2U.js","assets/rooms-jR4jrYzo.js","assets/three-DvdRK6n5.js","assets/vendor-BznljI30.js","favicon.svg","manifest.webmanifest"];

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
