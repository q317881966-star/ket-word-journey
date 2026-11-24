const VERSION = "ket-v11";
const CORE = [
  "./", "index.html", "style.css", "app.js", "buddy.js", "game.js", "words.json",
  "manifest.webmanifest", "fonts/nunito-latin.woff2",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 音频：缓存优先，用过即存
  if (url.pathname.includes("/audio/")) {
    e.respondWith(
      caches.match(req).then(hit => hit ||
        fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => new Response("", { status: 404 }))
      )
    );
    return;
  }

  // 核心资源：网络优先（保证拿到最新代码），离线时回退缓存
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
