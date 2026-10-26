// Service worker: makes Kaido Maps installable and quick to open.
// - App code files (/assets/…, named by content) and 3D car models never change, so they come
//   straight from the phone's cache: no network wait on reopen.
// - Pages try the network first (so updates show up), but fall back to the cached copy after
//   2.5 s or when offline.
const STATIC = 'dz-static-v2';
const PAGES = 'dz-pages-v2';
// Offline maps: tiles/fonts/style you've loaded (capped), and the tiles along your latest planned route.
const MAP = 'dz-map-v1';
const ROUTE = 'dz-route-tiles-v1';
const MAP_HOST = 'tiles.openfreemap.org';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (![STATIC, PAGES, MAP, ROUTE].includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

// Keep the static cache from growing forever (old builds' files pile up).
async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

// The page sends the tile URLs along a newly planned route; fetch and keep them (replacing the last route's).
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-route-tiles' || !Array.isArray(e.data.urls)) return;
  const urls = e.data.urls.filter((u) => new URL(u).host === MAP_HOST).slice(0, 600);
  e.waitUntil((async () => {
    await caches.delete(ROUTE);
    const c = await caches.open(ROUTE);
    for (let i = 0; i < urls.length; i += 6) {
      await Promise.all(urls.slice(i, i + 6).map(async (u) => {
        if (await caches.match(u)) return;
        try { const res = await fetch(u); if (res.ok) await c.put(u, res); } catch { /* offline: skip */ }
      }));
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Map tiles, style, fonts and icons: network first, saved copy when there's no signal.
  if (e.request.method === 'GET' && url.host === MAP_HOST) {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        if (res.ok) { const copy = res.clone(); caches.open(MAP).then((c) => c.put(e.request, copy)).then(() => trim(MAP, 2500)); }
        return res;
      } catch (err) {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }
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
