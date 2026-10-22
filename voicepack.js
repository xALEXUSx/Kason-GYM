/* Записані голоси тренера: кожне речення озвучене нейроголосом один раз.
   Пакет: voices/<id>/bundle.json { name, gender, files: [файли], clips: { "речення": [зсув, довжина, № файлу] } } +
   самі файли записів (AAC) до 20 МБ кожен; старі пакети без files — один clips.bin. Відтворення — через Web Audio, речення йдуть одне за одним;
   поки звучить голос, радіо притишується. Файл голосу зберігається в кеші телефону — працює без інтернету. */
var VOICEPACK = (function () {
  var lastError = '', packs = {}, bins = {}, loading = {}, ctx = null, gen = 0, playing = false, sources = [], onSpeak = null, buffers = {};
  var CACHE = 'trening-voices';
  function split(text) { return VOICE.split(text); }
  function setPlaying(v) { if (v === playing) return; playing = v; if (onSpeak) try { onSpeak(v); } catch (e) { /* немає */ } }
  async function load(id) {
    if (packs[id]) return packs[id];
    var r = await fetch('voices/' + id + '/bundle.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('немає пакета ' + id);
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
    var res = await fetch(url); if (!res.ok) throw new Error('немає файлу голосу');
    var total = Number(res.headers.get('content-length')) || 0, data;
    if (progress && res.body && res.body.getReader) {
      var rd = res.body.getReader(), parts = [], got = 0;
      for (;;) { var x = await rd.read(); if (x.done) break; parts.push(x.value); got += x.value.length; progress(got, total); }
      var all = new Uint8Array(got), o = 0; parts.forEach(function (u) { all.set(u, o); o += u.length; }); data = all.buffer;
    } else data = await res.arrayBuffer();
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
    var m = media(); if (!m || m.dataset.ok) return;
    try { m.src = SILENT; m.dataset.ok = '1'; var p = m.play(); if (p && p.catch) p.catch(function () { delete m.dataset.ok; }); } catch (e) { /* немає */ }
  }
  async function playMedia(id, segs, my) {
    var m = media(); if (!m) return false;
    setPlaying(true);
    try {
      for (var i = 0; i < segs.length; i++) {
        if (my !== gen) return true;
        var at = packs[id].clips[segs[i]], all = await bin(id, at[2] || 0);
        var url = URL.createObjectURL(new Blob([all.slice(at[0], at[0] + at[1])], { type: 'audio/mp4' }));
        var done = new Promise(function (ok) { m.onended = ok; m.onerror = ok; });
        m.src = url; await m.play(); await done; m.onended = m.onerror = null;
        URL.revokeObjectURL(url);
        if (i < segs.length - 1) await new Promise(function (ok) { setTimeout(ok, 120); });
      }
      if (my === gen) setPlaying(false);
      return true;
    } catch (e) { lastError = String(e && (e.message || e.name) || e); if (my === gen) setPlaying(false); return false; }
  }
  /* Програти речення підряд. actx — спільний AudioContext застосунку (розблокований дотиком). */
  async function play(id, segs, actx) {
    ctx = actx; stop(); var my = gen;
    if (!ctx) return playMedia(id, segs, my);
    /* без дотику iOS може ніколи не відповісти на resume() — чекаємо не довше 0,3 с, далі запасний шлях */
    if (ctx.state !== 'running' && ctx.resume && !ctx.startRendering) try { await Promise.race([ctx.resume(), new Promise(function (ok) { setTimeout(ok, 300); })]); } catch (e) { /* немає */ }
    /* iOS «приспав» Web Audio (згортання, дзвінок, без дотику) — граємо той самий запис через <audio> */
    if (ctx.state !== 'running' && !ctx.startRendering) { lastError = 'Web Audio приспано — граю через <audio>'; return playMedia(id, segs, my); }
    setPlaying(true);
    try {
      var bufs = [];
      for (var i = 0; i < segs.length; i++) bufs.push(await buffer(id, segs[i]));
      if (my !== gen) return true;
      var t = ctx.currentTime + 0.05;
      bufs.forEach(function (b, k) {
        var src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(t); sources.push(src);
        t += b.duration + 0.12;
        if (k === bufs.length - 1) src.onended = function () { if (my === gen) { sources = []; setPlaying(false); } };
      });
      return true;
    } catch (e) { lastError = String(e && (e.message || e.name) || e); if (my === gen) setPlaying(false); return false; }
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
        m.src = url; await m.play(); await done; m.onended = m.onerror = null; URL.revokeObjectURL(url);
        if (my === gen) setPlaying(false);
        return true;
      } catch (e) { lastError = String(e && (e.message || e.name) || e); if (my === gen) setPlaying(false); return false; }
    }
    setPlaying(true);
    try {
      var b = await ctx.decodeAudioData(bytes.slice(0));
      if (my !== gen) return true;
      var src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(ctx.currentTime + 0.05); sources.push(src);
      src.onended = function () { if (my === gen) { sources = []; setPlaying(false); } };
      return true;
    } catch (e) { lastError = String(e && (e.message || e.name) || e); if (my === gen) setPlaying(false); return false; }
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
  return { unlock: unlock, split: split, load: load, has: has, missing: missing, play: play, playData: playData, stop: stop, download: download, cached: cached, forget: forget,
    get busy() { return playing; }, get lastError() { return lastError; }, onSpeaking: function (f) { onSpeak = f; }, get packs() { return packs; } };
})();
if (typeof module !== 'undefined') module.exports = VOICEPACK;
