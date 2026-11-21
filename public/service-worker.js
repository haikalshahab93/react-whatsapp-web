/*
 * ChatEasy service worker.
 * Keeps the app shell available offline and lets the browser offer "install app".
 * API and Socket.IO traffic is never cached — chat data must always be live.
 */
const CACHE = "chateasy-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "ChatEasy", body: "", url: "/chats", tag: undefined };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* keep the defaults */
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // The app is open and visible: its own UI already shows the notification.
      if (clients.some((client) => client.visibilityState === "visible")) return undefined;
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: payload.tag,
        data: { url: payload.url || "/chats" },
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/chats";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            client.navigate(target).catch(() => {});
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  // Navigations: always try the network first so a deploy is picked up immediately,
  // and fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  // Static assets are content-hashed by the build, so cache-first is safe here.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
