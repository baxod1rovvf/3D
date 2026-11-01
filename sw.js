/* Oila Uchun service worker: offline app shell, plus Web Push display. All URLs are relative to the SW scope. */
const CACHE = "oila-v4";
const SHELL = [
  "./", "index.html", "rozgor.html", "taomlar.html", "xotiralar.html", "uy-ishlari.html", "kirish.html",
  "css/app.css", "js/stickers.js", "js/catalog.js", "js/messages.js", "js/reminders.js", "js/store.js", "js/app.js",
  "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png", "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k.startsWith("oila-v")).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Pinned third-party files (Lucide, supabase-js, Google Fonts): versioned URLs, so cache-first forever.
const CDN = /^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (CDN.test(req.url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return; // supabase: straight to network
  if (url.pathname.endsWith("/js/config.js")) return; // deployment config: never cached

  // Pages, code and styles: answer instantly from the cache and refresh it in the background, so
  // switching sections doesn't wait for the network. A new deploy shows up on the next open.
  const key = req.mode === "navigate" ? new Request(url.origin + url.pathname) : req;
  e.respondWith(caches.match(key, { ignoreSearch: req.mode === "navigate" }).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
      return res;
    }).catch(() => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()));
    e.waitUntil(net.then(() => {}, () => {}));
    return hit || net;
  }));
});

// Quiet hours ("Tinch soatlar", set per phone in Settings): the notification still arrives,
// but silently — no sound, no vibration.
async function inQuietHours(now = new Date()) {
  try {
    const res = await (await caches.open("oila-prefs")).match("prefs/quiet");
    const q = res ? await res.json() : null;
    if (!q || !q.on) return false;
    const mins = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };
    const t = now.getHours() * 60 + now.getMinutes(), from = mins(q.from), to = mins(q.to);
    return from <= to ? t >= from && t < to : t >= from || t < to; // e.g. 23:00–07:00 wraps midnight
  } catch (e) { return false; }
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  d = d || {}; // a literal JSON null payload
  e.waitUntil(inQuietHours().then((quiet) => self.registration.showNotification(d.title || "Oila Uchun", {
    body: d.body || "",
    tag: d.tag,
    renotify: !!d.tag && !quiet, // a repeated tag still buzzes (except in quiet hours)
    silent: quiet,
    vibrate: quiet ? [] : d.vibrate,
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    data: { url: d.url || "index.html" },
  })));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "index.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { // focus first (needs the click's user activation), then move it to the notification's page
      return open.focus().then((c) => {
        const w = c || open;
        return w.url !== target && "navigate" in w ? w.navigate(target).catch(() => w) : w;
      });
    }
    return self.clients.openWindow(target);
  }));
});
