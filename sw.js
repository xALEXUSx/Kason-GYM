/* Робота без інтернету. Файли застосунку — спершу з мережі (щоб одразу бачити оновлення), без мережі — з кешу.
   Голоси тренера — в окремому кеші й не стираються з оновленням. */
const CACHE = 'trening-3.27.11', VCACHE = 'trening-voices';
const FILES = ['./', 'index.html', 'i18n.js', 'i18n_en.js', 'program.js', 'engine.js', 'voice.js', 'coach.js', 'radio.js', 'voicepack.js', 'tips.js', 'charts.js', 'store.js', 'generator.js', 'food_db.js', 'kitchen.js', 'coachctx.js', 'stretch.js', 'app.js', 'accounts.js', 'manifest.webmanifest', 'icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/manrope-cyrillic.woff2', 'fonts/manrope-latin.woff2',
  /* 3D-рух на картці підходу (з 3.22.0) — у кеші одразу: у залі без звʼязку відкриється й уперше */
  'viz.js', 'viz/engine3d.js', 'viz/equip3d.js', 'viz/ex3d.js', 'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js'];
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
/* Нагадування про тренування (Web Push, сервер kason-gym-coach): показати сповіщення й поставити «1» на іконку;
   торкнулися сповіщення — відкрити застосунок (або вивести вже відкритий наперед). */
self.addEventListener('push', (e) => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (x) { m = { body: e.data ? e.data.text() : '' }; }
  /* renotify (з 3.27.1; слово Alexа 25.10 «Так, зроби 3.27.1: renotify для повторних нагадувань на Android»): нове нагадування з тим самим tag замінює попереднє в шторці —
     без renotify Chrome / Android робить це без звуку й вібрації (web.dev «Notification behavior»); Safari на iPhone tag і renotify не підтримує (MDN) — там без змін */
  const shown = self.registration.showNotification(m.title || 'FORTES', { body: m.body || '', icon: 'icon-192.png', tag: m.tag || 'trening-remind', renotify: true, data: { url: m.url || './' } });
  const badge = m.badge && self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge(m.badge).catch(() => {}) : Promise.resolve();
  e.waitUntil(Promise.all([shown, badge]));
});
/* нагадування про воду — одразу «Кухня» (з 3.27.1; слово Alexа 25.10: «…дотик до нагадування про воду відкриває Кухню»): застосунок відкритий — повідомлення
   { go: 'kitchen' }, ні — адреса з #kitchen. Пізнаємо за tag, а на iPhone (Safari не підтримує tag — MDN) — за текстом сервера: у нагадуванні про воду
   завжди є «склянк…» / «glass» (push.js waterMessage), у нагадуванні про тренування — ні */
const isWater = (n) => n.tag === 'trening-water' || /склянк|glass/i.test(String(n.body || ''));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const water = isWater(e.notification);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs.length) { if (water) cs[0].postMessage({ go: 'kitchen' }); return cs[0].focus(); }
    return self.clients.openWindow(water ? './#kitchen' : (e.notification.data && e.notification.data.url) || './');
  }));
});
