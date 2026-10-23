/* Робота без інтернету. Файли застосунку — спершу з мережі (щоб одразу бачити оновлення), без мережі — з кешу.
   Голоси тренера — в окремому кеші й не стираються з оновленням. */
const CACHE = 'trening-3.12.2', VCACHE = 'trening-voices';
const FILES = ['./', 'index.html', 'program.js', 'engine.js', 'voice.js', 'coach.js', 'radio.js', 'voicepack.js', 'tips.js', 'charts.js', 'store.js', 'generator.js', 'coachctx.js', 'app.js', 'accounts.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/manrope-cyrillic.woff2', 'fonts/manrope-latin.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'no-cache' })))).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== VCACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* мережа не довше 3 с — у залі зі слабким звʼязком застосунок відкривається з кешу */
/* cache: 'no-cache' — перепитати сервер (304, якщо не змінилось), а не брати старий файл з кешу браузера:
   інакше після оновлення частина файлів лишалась старою й нова версія працювала зі старими шматками коду */
function fresh(req) {
  return new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('timeout')), 3000);
    fetch(req, { cache: 'no-cache' }).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); bad(e); });
  });
}
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.indexOf('/voices/') >= 0) {
    /* списки голосів — спершу з мережі (щоб бачити нові), записи фраз — спершу з кешу */
    if (url.pathname.endsWith('.json')) {
      e.respondWith(fresh(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(VCACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
    } else {
      e.respondWith(caches.open(VCACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    }
    return;
  }
  e.respondWith(fresh(e.request).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
