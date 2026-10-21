// Offline support: the app shell is cached on install; fonts are cached the first time they load.
const CACHE = "salary-meter-v7";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // Network first, skipping the browser's HTTP cache, so updates show up right away; cache when offline
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
    );
  } else if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
    e.respondWith(
      caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
      }))
    );
  }
});
