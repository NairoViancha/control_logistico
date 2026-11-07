/* ==========================================================================
   MODUGAL · Service worker (solo versión web / PWA instalada)
   --------------------------------------------------------------------------
   - Archivos de la app (index, app.js, estilos, íconos): primero la red, y si
     no hay conexión, la última copia guardada. Así cada push se ve de inmediato.
   - Librerías de CDN (Tailwind, Supabase, FontAwesome): copia guardada y se
     actualiza en segundo plano.
   - NUNCA guarda datos ni archivos de Supabase: siempre van en vivo y con la
     sesión del usuario.
   Al cambiar este archivo, sube VERSION para limpiar las copias viejas.
   ========================================================================== */
const VERSION = 'modugal-v6';
const APP = [
  './',
  './index.html',
  './ciudades.js',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const CDN = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Supabase (datos, sesión, archivos): nunca se toca */
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  /* Librerías de CDN: copia guardada + actualización en segundo plano */
  if (CDN.includes(url.hostname)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const guardada = await cache.match(req);
        const red = fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        }).catch(() => guardada);
        return guardada || red;
      }),
    );
    return;
  }

  /* Archivos propios de la app: primero la red */
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
    );
  }
});
