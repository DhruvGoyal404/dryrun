// DryRun service worker, generated at build time by vite.config.ts from this template.
// The site (HTML, JS, CSS, fonts) is precached at install. Python (the pinned Pyodide
// runtime, about 12 MB) is cached the first time the app loads it, under its versioned path,
// so it is downloaded once. Pages go to the network first and fall back to the cache;
// everything else is cache-first. Cached responses keep their original headers (the CSP).
const CACHE = "dryrun-__VERSION__";
const PYODIDE = "__PYODIDE__";
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const hit = await caches.match(request, { cacheName: CACHE, ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  // Only Python's files are added at runtime; everything else was precached.
  if (response.ok && new URL(request.url).pathname.startsWith(PYODIDE)) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    const page = url.pathname === "/app" || url.pathname === "/app.html" ? "/app" : url.pathname === "/" ? "/" : null;
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(page ?? "/", { cacheName: CACHE })) ?? Response.error()),
    );
    return;
  }
  event.respondWith(cacheFirst(request));
});
