// Service worker: makes Kaido Maps installable and quick to open.
// - App code files (/assets/…, named by content) and 3D car models never change, so they come
//   straight from the phone's cache: no network wait on reopen.
// - Pages try the network first (so updates show up), but fall back to the cached copy after
//   2.5 s or when offline.
const STATIC = 'dz-static-v2';
const PAGES = 'dz-pages-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== STATIC && k !== PAGES) await caches.delete(k);
  await self.clients.claim();
})()));

// Keep the static cache from growing forever (old builds' files pile up).
async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.endsWith('.apk')) return;

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/models/')) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(e.request, copy)).then(() => trim(STATIC, 120)); }
      return res;
    })());
    return;
  }

  e.respondWith((async () => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(PAGES).then((c) => c.put(e.request.mode === 'navigate' ? '/' : e.request, copy)); }
      return res;
    });
    const cached = await caches.match(e.request.mode === 'navigate' ? '/' : e.request);
    if (!cached) return net.catch(() => caches.match('/'));
    const timeout = new Promise((r) => setTimeout(() => r(cached), 2500));
    return Promise.race([net.catch(() => cached), timeout]);
  })());
});
