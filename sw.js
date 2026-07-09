// Moof simple shell — network-first HTML so return/refresh isn't stale
const CACHE_NAME = 'moof-simple-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icon.png', './icon.svg', './ashlyn-face.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req));
    return;
  }

  // Always try network first for navigations / app shell so return feels fresh
  const isNav = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');
  if (isNav) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (req.method === 'GET' && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
