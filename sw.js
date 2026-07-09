// Ashlyn Brain Service Worker - offline shell + installable PWA
const CACHE_NAME = "ashlyn-brain-v6";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon.png", "./ashlyn-face.png"];

self.addEventListener("install", (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    // Never cache API calls — always network
    if (url.pathname.startsWith("/api/")) {
        e.respondWith(fetch(e.request));
        return;
    }
    e.respondWith(
        caches.match(e.request).then((r) => r || fetch(e.request))
    );
});
