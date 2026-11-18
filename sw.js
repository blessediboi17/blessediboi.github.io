// Service worker: caches the app shell only. Supabase calls (orders, library, files) are never cached.
const V = "bds-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.json", "icons/icon-192.png", "offline.html"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => Promise.allSettled(SHELL.map(u => c.add(u))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;           // let Supabase and CDN pass through
  if (r.mode === "navigate") { e.respondWith(fetch(r).catch(() => caches.match(r).then(m => m || caches.match("offline.html")))); return; }
  e.respondWith(caches.match(r).then(m => { const n = fetch(r).then(res => { caches.open(V).then(c => c.put(r, res.clone())); return res; }).catch(() => m); return m || n; }));
});
