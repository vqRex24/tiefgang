// Offline-Unterstützung: App-Hülle und gesehene Bilder bleiben auf dem Gerät.
const VERSION = "tiefgang-1";
const HUELLE = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "inhalte.json", "icons/icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((alle) => Promise.all(alle.filter((n) => n !== VERSION && n !== "tiefgang-bilder").map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Bilder: einmal geladen, danach aus dem Speicher.
  if (url.hostname === "upload.wikimedia.org") {
    e.respondWith(caches.open("tiefgang-bilder").then(async (c) => {
      const treffer = await c.match(e.request);
      if (treffer) return treffer;
      const antwort = await fetch(e.request);
      c.put(e.request, antwort.clone());
      return antwort;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Eigene Dateien: erst Netz für frische Inhalte, sonst Speicher.
  e.respondWith(fetch(e.request).then((antwort) => {
    if (antwort.ok) {
      const kopie = antwort.clone();
      caches.open(VERSION).then((c) => c.put(e.request, kopie));
    }
    return antwort;
  }).catch(() => caches.match(e.request)));
});
