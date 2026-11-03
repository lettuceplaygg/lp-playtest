// VOP offline support. Keeps what the player has already loaded so the app opens and plays
// without a connection: the page (network first, cached copy when offline), built scripts
// and styles (cache first; their names change with every build), game content (cached copy
// at once, refreshed in the background) and the fonts. Never caches the community API or
// the party relay.

const CACHE = 'vop-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;
  if (sameOrigin && (url.pathname.includes('/api/') || url.pathname.endsWith('/mp'))) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const c = await caches.open(CACHE);
          await c.put(new URL('./', self.registration.scope).href, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(new URL('./', self.registration.scope).href)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  const immutable = sameOrigin && url.pathname.includes('/assets/');
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit && immutable) return hit;
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') void c.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        e.waitUntil(refresh);
        return hit;
      }
      return (await refresh) ?? Response.error();
    })(),
  );
});
