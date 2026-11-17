/* English Offline – service worker. Wersja 0baa72cc41 (generowana przy każdej zmianie plików). */
const VER = '0baa72cc41';
const CACHE = 'eng-offline-' + VER;
const ASSETS = ["./","./index.html","./checker.js","./db.js","./app.js","./manifest.webmanifest","./icon-180.png","./icon-192.png","./icon-512.png"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('eng-offline-') === 0 && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const idx = await c.match('./index.html'); if (idx) return idx; }
    try { return await fetch(req); } catch (err) { return (await c.match('./index.html')) || Response.error(); }
  })());
});
