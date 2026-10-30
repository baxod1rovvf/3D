/* Oila Uchun service worker: offline app shell, plus Web Push display. All URLs are relative to the SW scope. */
const CACHE = "oila-v1";
const SHELL = [
  "./", "index.html", "rozgor.html", "taomlar.html", "xotiralar.html", "uy-ishlari.html", "kirish.html",
  "css/app.css", "js/stickers.js", "js/messages.js", "js/reminders.js", "js/store.js", "js/app.js",
  "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png", "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // supabase, CDNs, fonts: straight to network
  if (url.pathname.endsWith("/js/config.js")) return; // deployment config: never cached

  const put = (res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  };
  if (req.mode === "navigate") { // network-first so updates arrive; cache when offline
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
    return;
  }
  // Cache-first, refreshed in the background for the next visit.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then(put).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Oila Uchun", {
    body: d.body || "",
    tag: d.tag,
    vibrate: d.vibrate,
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    data: { url: d.url || "index.html" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "index.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) return open.focus();
    return self.clients.openWindow(target);
  }));
});
