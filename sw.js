// FairBill offline cache. Pages: network first (always the newest app when online, cached copy offline).
// App files (hashed bundles, bill reader, icons): cache first, they never change under the same name.
const CACHE = 'fairbill-v1';
const INDEX = new URL('./', self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API calls go straight to the server
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(INDEX, copy));
      return res;
    }).catch(() => caches.match(INDEX)));
    return;
  }
  if (/\/(_expo|ocr|assets)\//.test(url.pathname) || /\.(png|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
