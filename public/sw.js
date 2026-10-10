const CACHE_NAME = "bharatbeats-shell-v1";
const APP_SCOPE = new URL("./", self.location.href);
const SHELL_URL = APP_SCOPE.href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(SHELL_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("bharatbeats-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(APP_SCOPE.href)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(SHELL_URL).then((cached) => {
        if (!cached) throw new Error("BharatBeats is not available offline yet.");
        return cached;
      })),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && /javascript|text\/css|image\/svg\+xml|application\/manifest\+json/.test(contentType)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    })),
  );
});
