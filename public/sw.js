const CACHE = "cri-blo-shell-v1";
const SAME_ORIGIN = self.location.origin;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== SAME_ORIGIN) return;

  // Keep the app shell and already-used chunks available offline. Network-first
  // keeps deployments fresh while the cache provides a fallback when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("./") || await caches.match("/")) || new Response("Offline", { status: 503 });
        }
        return new Response("Offline", { status: 503 });
      }),
  );
});
