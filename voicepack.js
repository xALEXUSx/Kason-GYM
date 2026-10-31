var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Записані голоси тренера: кожне речення озвучене нейроголосом один раз.
   Пакет: voices/<id>/bundle.json { name, gender, files: [файли], clips: { "речення": [зсув, довжина, № файлу] } } +
   самі файли записів (AAC) до 20 МБ кожен; старі пакети без files — один clips.bin. Відтворення — через Web Audio, речення йдуть одне за одним;
   поки звучить голос, радіо притишується. Файл голосу зберігається в кеші телефону — працює без інтернету. */
var VOICEPACK = (function () {
  var lastError = '', packs = {}, bins = {}, loading = {}, ctx = null, gen = 0, playing = false, sources = [], onSpeak = null, buffers = {};
  /* тиша (з 3.27.11; слово Alexа 31.10: «це точно баг, бо навіть коли я натискав кнопки повторити голосом вправу то тренер мовчав. а коли я перезапустив додаток і тренер заговорив»):
     файл голосу вантажився без межі часу, а всі фрази файлу чекали те саме завантаження — зависло на слабкому інтернеті, і вони мовчали, без голосу телефона, до перезапуску.
     Тепер: запис не готовий за READY_MS — фраза звучить голосом телефона, файл вантажиться далі; нових даних немає STALL_MS — завантаження обривається, наступна фраза пробує знову.
     Web Audio «працює», а час не йде (WATCH_MS) — той самий запис через <audio> */
  var READY_MS = 4000, STALL_MS = 20000, WHOLE_MS = 120000, WATCH_MS = 700;
  function within(p, ms, what) { return new Promise(function (ok, bad) { var t = setTimeout(function () { bad(new Error(what)); }, ms); p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); bad(e); }); }); }
  function notReady() { return LL('запис ще завантажується', "the recording is still loading"); }
  /* швидкість голосу (з 3.27.4; слово Alexа 26.10: «потрібно в налаштуваннях у блок з Голосовий тренер додати зміну швидкості говоріння тренера х1.2, х1.5, х2»):
     Web Audio прискорює запис лише разом із тоном (playbackRate — «мультяшний» голос), тож запис стискаємо в часі без зміни тону — WSOLA:
     вікна Ганна ≈ 25 мс з кроком виходу в пів вікна, кожне наступне вікно входу береться там, де воно найсхожіше на природне продовження попереднього
     (пошук ±6 мс: спершу грубо на сітці ≈ 8 кГц, потім точно поруч). <audio> (запасний шлях) — playbackRate, тон браузер зберігає сам (preservesPitch) */
  var rate = 1, stretched = {};
  function Stretch(sr, r) {
    var N = 2 * Math.round(sr * 0.0125), H = N / 2, tol = Math.round(sr * 0.006), q = Math.max(1, Math.round(sr / 8000)), w = new Float32Array(N), i;
    for (i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);  // періодичне вікно Ганна: два сусідні з кроком H дають у сумі 1
    var x = new Float32Array(Math.max(N, sr)), xl = 0, y = new Float32Array(Math.max(N, sr)), k = 0, prev = -1, out = 0;
    function need(a, n) { if (a.length >= n) return a; var b = new Float32Array(Math.max(n, 2 * a.length)); b.set(a); return b; }
    function corr(tp, st, n) { var c = 0; for (var j = 0; j < n; j += q) c += x[tp + j] * x[st + j]; return c; }
    function step(fin) {
      var nom = Math.round(k * H * r), st = nom, j;
      if (nom >= xl) return false;  // вхід скінчився (fin) або ще не прийшов
      if (prev >= 0) {
        var tp = prev + H, lo = Math.max(0, nom - tol), hi = nom + tol;
        if (!fin && (hi + N > xl || tp + N > xl)) return false;  // чекаємо ще вхід
        var best = -Infinity, s0 = nom, n = Math.min(N, xl - tp), lim;
        for (var s = lo; s <= hi; s += q) { lim = Math.min(n, xl - s); if (lim <= 0) break; var c = corr(tp, s, lim); if (c > best) { best = c; s0 = s; } }
        st = s0; for (s = Math.max(lo, s0 - q + 1); s <= Math.min(hi, s0 + q - 1); s++) { lim = Math.min(n, xl - s); if (lim <= 0) break; c = corr(tp, s, lim); if (c > best) { best = c; st = s; } }
      } else if (!fin && nom + N > xl) return false;
      y = need(y, k * H + N);
      for (j = 0; j < N; j++) y[k * H + j] += w[j] * (st + j < xl ? x[st + j] : 0);
      prev = st; k++; return true;
    }
    /* push — шматок входу, повертає готовий вихід (усе, що вже не зміниться); flush — решта наприкінці */
    return {
      push: function (d) { x = need(x, xl + d.length); x.set(d, xl); xl += d.length; while (step(false)); var end = k * H, o = y.slice(out, end); out = end; return o; },
      flush: function () { while (step(true)); var end = k ? (k - 1) * H + N : 0, o = y.slice(out, Math.max(out, end)); out = Math.max(out, end); return o; }
    };
  }
  /* AudioBuffer → стиснутий AudioBuffer (кожен канал окремо; фрази й відповіді — моно) */
  function stretchBuf(b) {
    if (rate === 1 || !ctx) return b;
    var chans = [], len = 0;
    for (var c = 0; c < b.numberOfChannels; c++) { var st = Stretch(b.sampleRate, rate), a = st.push(b.getChannelData(c)), z = st.flush(), o = new Float32Array(a.length + z.length); o.set(a); o.set(z, a.length); chans.push(o); len = Math.max(len, o.length); }
    var nb = ctx.createBuffer(b.numberOfChannels, Math.max(1, len), b.sampleRate);
    chans.forEach(function (o, c) { nb.getChannelData(c).set(o); });
    return nb;
  }
  function setRate(r) { r = Number(r) || 1; if (r !== rate) { rate = r; stretched = {}; } }
  var CACHE = 'trening-voices';
  function split(text) { return VOICE.split(text); }
  function setPlaying(v) { if (v === playing) return; playing = v; if (onSpeak) try { onSpeak(v); } catch (e) { /* немає */ } }
  async function load(id) {
    if (packs[id]) return packs[id];
    var r = await fetch('voices/' + id + '/bundle.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(LL('немає пакета ', "no pack ") + id);
    var p = await r.json(); p.id = id; packs[id] = p; return p;
  }
  function has(id, segs) { var p = packs[id]; if (!p) return false; for (var i = 0; i < segs.length; i++) if (!p.clips[segs[i]]) return false; return true; }
  function missing(id, segs) { var p = packs[id]; return p ? segs.filter(function (s) { return !p.clips[s]; }) : segs; }
  function files(id) { return (packs[id] && packs[id].files) || ['clips.bin']; }
  function binUrl(id, k) { return 'voices/' + id + '/' + files(id)[k || 0]; }
  /* Файл голосу: з кешу телефону, інакше з мережі (і в кеш). progress(отримано, усього) — під час завантаження. */
  /* одне завантаження на файл, навіть якщо його водночас просять кілька місць */
  function bin(id, k, progress) {
    var key = id + '#' + (k || 0);
    if (bins[key]) return Promise.resolve(bins[key]);
    if (!loading[key]) loading[key] = binLoad(id, k || 0, progress).then(function (d) { bins[key] = d; return d; }).finally(function () { delete loading[key]; });
    return loading[key];
  }
  async function binLoad(id, k, progress) {
    var url = binUrl(id, k), c = null;
    try { c = window.caches ? await caches.open(CACHE) : null; if (c) { var hit = await c.match(url); if (hit) return await hit.arrayBuffer(); } } catch (e) { c = null; }
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, st = null, data;
    var arm = function (ms) { clearTimeout(st); st = setTimeout(function () { if (ctl) ctl.abort(); }, ms); };
    try {
      arm(STALL_MS);
      var res = await fetch(url, ctl ? { signal: ctl.signal } : undefined); if (!res.ok) throw new Error(LL('немає файлу голосу', "no voice file"));
      var total = Number(res.headers.get('content-length')) || 0;
      if (res.body && res.body.getReader) {
        var rd = res.body.getReader(), parts = [], got = 0;
        for (;;) { arm(STALL_MS); var x = await rd.read(); if (x.done) break; parts.push(x.value); got += x.value.length; if (progress) progress(got, total); }
        var all = new Uint8Array(got), o = 0; parts.forEach(function (u) { all.set(u, o); o += u.length; }); data = all.buffer;
      } else { arm(WHOLE_MS); data = await res.arrayBuffer(); }
    } finally { clearTimeout(st); }
    try { if (c) await c.put(url, new Response(data.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) { /* без кешу */ }
    return data;
  }
  /* Прибрати з кешу старі файли цього голосу (після переходу на нову якість запису). */
  async function prune(id) {
    try {
      var c = await caches.open(CACHE), keep = files(id).map(function (f, k) { return new URL(binUrl(id, k), location.href).href; });
      (await c.keys()).forEach(function (r) { if (r.url.indexOf('/voices/' + id + '/') >= 0 && /\.bin$/.test(r.url) && keep.indexOf(r.url) < 0) c.delete(r); });
    } catch (e) { /* немає кешу */ }
  }
  /* Прибрати з телефону файли голосів, яких більше немає у списку (keep — id голосів, що лишаються),
     і старі версії файлів тих, що лишаються (після перезапису голосу файл має нову назву). */
  async function forget(keep) {
    var stale = {};
    try {
      var c = await caches.open(CACHE);
      (await c.keys()).forEach(function (r) {
        var m = r.url.match(/\/voices\/([^/]+)\//); if (!m) return;
        if (keep.indexOf(m[1]) < 0) c.delete(r); else if (/\.bin$/.test(r.url)) stale[m[1]] = 1;
      });
    } catch (e) { /* немає кешу */ }
    Object.keys(packs).forEach(function (id) { if (keep.indexOf(id) < 0) delete packs[id]; });
    for (var id in stale) { try { await load(id); await prune(id); } catch (e) { /* без мережі — наступного разу */ } }
  }
  function decode(data) { return new Promise(function (ok, bad) { var p = ctx.decodeAudioData(data, ok, bad); if (p && p.then) p.then(ok, bad); }); }
  /* розкодовані фрази — лише останні BUF_MAX (≈ 0,5 МБ кожна): без межі за тренування набігали сотні МБ, і iPhone зависав */
  var BUF_MAX = 40, order = [];
  async function buffer(id, seg) {
    var key = id + '|' + seg;
    if (buffers[key]) { order.splice(order.indexOf(key), 1); order.push(key); return buffers[key]; }
    var at = packs[id].clips[seg], all = await bin(id, at[2] || 0);
    var b = await decode(all.slice(at[0], at[0] + at[1]));
    buffers[key] = b; order.push(key);
    while (order.length > BUF_MAX) delete buffers[order.shift()];
    return b;
  }
  function stop() {
    gen++; sources.forEach(function (s) { try { s.stop(); } catch (e) { /* уже */ } }); sources = [];
    if (el) { try { el.pause(); } catch (e) { /* немає */ } if (el.onended) el.onended(); }
    setPlaying(false);
  }
  /* Запасний шлях без Web Audio: один <audio>, «розблокований» першим дотиком. iOS дозволяє йому грати й без дотику —
     тож фраза після відпочинку звучить записаним голосом, навіть коли Web Audio телефон приспав (раніше тут вмикався системний голос). */
  var el = null, SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  function media() { if (!el && typeof Audio !== 'undefined') { el = new Audio(); el.preload = 'auto'; el.setAttribute('playsinline', ''); } return el; }
  function unlock() {
    /* поки грає запис (фраза чи відповідь тренера) — не чіпати: дотик до екрана (прокрутка) інакше підміняв звук тишею й обривав голос */
    var m = media(); if (!m || m.dataset.ok || playing || !m.paused) return;
    try { m.src = SILENT; m.dataset.ok = '1'; var p = m.play(); if (p && p.catch) p.catch(function () { delete m.dataset.ok; }); } catch (e) { /* немає */ }
  }
  async function playMedia(id, segs, my) {
    var m = media(); if (!m) return false;
    setPlaying(true);
    try {
      for (var i = 0; i < segs.length; i++) {
        if (my !== gen) return true;
        var at = packs[id].clips[segs[i]], all = await within(bin(id, at[2] || 0), READY_MS, notReady());
        if (my !== gen) return true;
        var url = URL.createObjectURL(new Blob([all.slice(at[0], at[0] + at[1])], { type: 'audio/mp4' }));
        var done = new Promise(function (ok) { m.onended = ok; m.onerror = ok; });
        m.src = url; m.playbackRate = rate; m.preservesPitch = true; await within(m.play(), READY_MS, notReady()); await done; m.onended = m.onerror = null;
        URL.revokeObjectURL(url);
        if (i < segs.length - 1) await new Promise(function (ok) { setTimeout(ok, 120 / rate); });
      }
      if (my === gen) setPlaying(false);
      return true;
    } catch (e) {
      /* накладання (з 3.27.11; слово Alexа 31.10: «чи не накладаються та смішуються голоси різних вправ»): нова фраза перебила цю на старті — браузер відхиляє її play() (AbortError).
         Це не збій: без цієї умови застосунок проговорював стару фразу голосом телефона поверх нового запису */
      if (my !== gen) return true;
      lastError = String(e && (e.message || e.name) || e); try { m.pause(); } catch (x) { /* немає */ } setPlaying(false); return false;
    }
  }
  /* Програти речення підряд. actx — спільний AudioContext застосунку (розблокований дотиком). */
  async function play(id, segs, actx) {
    ctx = actx; stop(); var my = gen;
    if (!ctx) return playMedia(id, segs, my);
    /* без дотику iOS може ніколи не відповісти на resume() — чекаємо не довше 0,3 с, далі запасний шлях */
    if (ctx.state !== 'running' && ctx.resume && !ctx.startRendering) try { await Promise.race([ctx.resume(), new Promise(function (ok) { setTimeout(ok, 300); })]); } catch (e) { /* немає */ }
    /* iOS «приспав» Web Audio (згортання, дзвінок, без дотику) — граємо той самий запис через <audio> */
    if (ctx.state !== 'running' && !ctx.startRendering) { lastError = LL('Web Audio приспано — граю через <audio>', "Web Audio is suspended — playing via <audio>"); return playMedia(id, segs, my); }
    setPlaying(true);
    try {
      var bufs = [];
      for (var i = 0; i < segs.length; i++) { var key = id + '|' + segs[i] + '|' + rate, b0 = stretched[key] || (stretched[key] = stretchBuf(await within(buffer(id, segs[i]), READY_MS, notReady()))); bufs.push(b0); }
      if (Object.keys(stretched).length > 300) stretched = {};
      if (my !== gen) return true;
      var t0 = ctx.currentTime, t = t0 + 0.05;
      bufs.forEach(function (b, k) {
        var src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(t); sources.push(src);
        t += b.duration + 0.12 / rate;
        if (k === bufs.length - 1) src.onended = function () { if (my === gen) { sources = []; setPlaying(false); } };
      });
      await new Promise(function (ok) { setTimeout(ok, WATCH_MS); });
      /* час Web Audio стоїть — звуку немає (після дзвінка чи іншого звуку iPhone може лишити його таким до перезапуску) */
      if (my === gen && playing && !ctx.startRendering && ctx.currentTime === t0) {
        lastError = LL('Web Audio не грає — граю через <audio>', "Web Audio isn’t playing — playing via <audio>");
        sources.forEach(function (s) { s.onended = null; try { s.stop(); } catch (e) { /* уже */ } }); sources = [];
        return playMedia(id, segs, my);
      }
      return true;
    } catch (e) { if (my !== gen) return true; lastError = String(e && (e.message || e.name) || e); setPlaying(false); return false; }
  }
  /* Готовий запис цілком (відповідь тренера-співрозмовника, WAV із сервера): той самий шлях, що й фрази, —
     Web Audio або <audio>; «говорить» (onSpeaking) так само притишує радіо, stop() так само зупиняє. */
  async function playData(bytes, type, actx) {
    ctx = actx; stop(); var my = gen;
    if (ctx && ctx.state !== 'running' && ctx.resume) try { await Promise.race([ctx.resume(), new Promise(function (ok) { setTimeout(ok, 300); })]); } catch (e) { /* немає */ }
    if (!ctx || ctx.state !== 'running') {
      var m = media(); if (!m) return false;
      setPlaying(true);
      try {
        var url = URL.createObjectURL(new Blob([bytes], { type: type || 'audio/wav' }));
        var done = new Promise(function (ok) { m.onended = ok; m.onerror = ok; });
        m.src = url; m.playbackRate = rate; m.preservesPitch = true; await within(m.play(), READY_MS, notReady()); await done; m.onended = m.onerror = null; URL.revokeObjectURL(url);
        if (my === gen) setPlaying(false);
        return true;
      } catch (e) { if (my !== gen) return true; lastError = String(e && (e.message || e.name) || e); try { m.pause(); } catch (x) { /* немає */ } setPlaying(false); return false; }
    }
    setPlaying(true);
    try {
      var b = stretchBuf(await ctx.decodeAudioData(bytes.slice(0)));
      if (my !== gen) return true;
      var src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(ctx.currentTime + 0.05); sources.push(src);
      src.onended = function () { if (my === gen) { sources = []; setPlaying(false); } };
      return true;
    } catch (e) { if (my !== gen) return true; lastError = String(e && (e.message || e.name) || e); setPlaying(false); return false; }
  }
  /* Увесь голос у телефон: файли по черзі, прогрес — сумарний. */
  async function download(id, progress) {
    var p = await load(id), done = 0;
    for (var k = 0; k < files(id).length; k++) {
      var b = await bin(id, k, progress && function (got) { progress(done + got, p.bytes || 0); });
      done += b.byteLength;
    }
    if (window.caches) prune(id);
    return done;
  }
  async function cached(id) {
    if (!window.caches) return false;
    try {
      var c = await caches.open(CACHE);
      for (var k = 0; k < files(id).length; k++) if (!(await c.match(binUrl(id, k)))) return false;
      return true;
    } catch (e) { return false; }
  }
  return { unlock: unlock, split: split, load: load, has: has, missing: missing, play: play, playData: playData, stop: stop, download: download, cached: cached, forget: forget, setRate: setRate, Stretch: Stretch, get rate() { return rate; },
    _limits: function (o) { READY_MS = o.ready || READY_MS; STALL_MS = o.stall || STALL_MS; WATCH_MS = o.watch || WATCH_MS; }, get busy() { return playing; }, get lastError() { return lastError; }, onSpeaking: function (f) { onSpeak = f; }, get packs() { return packs; } };
})();
if (typeof module !== 'undefined') module.exports = VOICEPACK;
