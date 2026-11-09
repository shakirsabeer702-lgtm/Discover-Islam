/* Discover Islam service worker
   - Caches the app so it opens offline
   - Keeps the last Quran, hadith and prayer-time responses for offline reading
   - Opens the app when a prayer notification is tapped */

const VERSION = "v1";
const CORE = "core-" + VERSION;
const RUNTIME = "runtime-" + VERSION;

const CORE_FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "favicon-48.png"
];

const API_HOSTS = ["api.aladhan.com", "api.alquran.cloud", "cdn.jsdelivr.net"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE).then((cache) =>
      cache.addAll(CORE_FILES).then(() =>
        // Optional Azan file: cache it if the owner added one.
        cache.add("azan.mp3").catch(() => {})
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CORE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  return fetch(request).then((response) => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(RUNTIME).then((c) => c.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then((hit) => hit || Promise.reject(new Error("offline"))));
}

function cacheFirst(request) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    return fetch(request).then((response) => {
      if (response && (response.ok || response.type === "opaque")) {
        const copy = response.clone();
        caches.open(RUNTIME).then((c) => c.put(request, copy));
      }
      return response;
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request, { ignoreSearch: true }).then((hit) => {
    const refresh = fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CORE).then((c) => c.put(request, copy));
      }
      return response;
    }).catch(() => hit);
    return hit || refresh;
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return; // audio streaming is left to the network

  const url = new URL(request.url);
  if (url.hostname === "cdn.islamic.network") return; // Quran recitation audio is not cached

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CORE).then((c) => c.put("index.html", copy));
        }
        return response;
      }).catch(() => caches.match("index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (API_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || "./#/salah", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          return client.focus().then((c) => { if (c && "navigate" in c) return c.navigate(target).catch(() => {}); });
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
