/* BloomBody — offline cache for SPA (v4: public Pages root + network-first HTML) */
const CACHE = 'bloombody-spa-v4-pages-20261030';
const PRECACHE = [
  './',
  './index.html',
  './BloomBody_Chat_Tracker.html',
  './BloomBody_chart.js',
  './BloomBody_app.js',
  './manifest.webmanifest',
  './IMPORT_TEMPLATE.csv',
  './assets/BloomBody_logo_nobg.png',
  './assets/BloomBody_icon_nobg.png',
  './assets/BloomBody_icon_192.png',
  './assets/BloomBody_icon_512.png'
];
const CDN_ALLOW = [
  'cdn.jsdelivr.net/npm/xlsx',
  'cdn.jsdelivr.net/npm/mammoth',
  'cdn.jsdelivr.net/npm/pdfjs-dist'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE.filter(Boolean)).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCdn(url) {
  try {
    const u = new URL(url);
    return CDN_ALLOW.some((p) => (u.hostname + u.pathname).includes(p.replace(/^https?:\/\//, '')) || u.href.includes(p));
  } catch (_) {
    return false;
  }
}

function isHtmlNavigation(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  try {
    const p = new URL(req.url).pathname;
    return /\.html?$/i.test(p) || p.endsWith('/');
  } catch (_) {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (url.includes('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ ok: false, offline: true }), { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  if (isHtmlNavigation(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match('./BloomBody_Chat_Tracker.html')) ||
            (await cache.match('./index.html')) ||
            new Response('Offline', { status: 503, statusText: 'Offline' })
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) {
        fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
        }).catch(() => {});
        return hit;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok && (req.url.startsWith(self.location.origin) || isCdn(req.url))) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        const shell =
          (await cache.match('./BloomBody_Chat_Tracker.html')) ||
          (await cache.match('./index.html'));
        if (shell) return shell;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })
  );
});
