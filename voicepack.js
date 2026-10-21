/* Записані голоси тренера: кожне речення озвучене нейроголосом один раз.
   Пакет: voices/<id>/bundle.json { name, gender, clips: { "речення": [зсув, довжина] } } + voices/<id>/clips.bin —
   усі записи (MP3) одним файлом. Відтворення — через Web Audio, речення йдуть одне за одним;
   поки звучить голос, радіо притишується. Файл голосу зберігається в кеші телефону — працює без інтернету. */
var VOICEPACK = (function () {
  var packs = {}, bins = {}, loading = {}, ctx = null, gen = 0, playing = false, sources = [], onSpeak = null, buffers = {};
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
  function binUrl(id) { return 'voices/' + id + '/clips.bin'; }
  /* Увесь файл голосу: з кешу телефону, інакше з мережі (і в кеш). progress(отримано, усього) — під час завантаження. */
  /* одне завантаження на голос, навіть якщо його водночас просять кілька місць */
  function bin(id, progress) {
    if (bins[id]) return Promise.resolve(bins[id]);
    if (!loading[id]) loading[id] = binLoad(id, progress).finally(function () { delete loading[id]; });
    return loading[id];
  }
  async function binLoad(id, progress) {
    var url = binUrl(id), c = null;
    try { c = window.caches ? await caches.open(CACHE) : null; if (c) { var hit = await c.match(url); if (hit) return (bins[id] = await hit.arrayBuffer()); } } catch (e) { c = null; }
    var res = await fetch(url); if (!res.ok) throw new Error('немає файлу голосу');
    var total = Number(res.headers.get('content-length')) || (packs[id] && packs[id].bytes) || 0, data;
    if (progress && res.body && res.body.getReader) {
      var rd = res.body.getReader(), parts = [], got = 0;
      for (;;) { var x = await rd.read(); if (x.done) break; parts.push(x.value); got += x.value.length; progress(got, total); }
      var all = new Uint8Array(got), o = 0; parts.forEach(function (u) { all.set(u, o); o += u.length; }); data = all.buffer;
    } else data = await res.arrayBuffer();
    try { if (c) await c.put(url, new Response(data.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) { /* без кешу */ }
    return (bins[id] = data);
  }
  function decode(data) { return new Promise(function (ok, bad) { var p = ctx.decodeAudioData(data, ok, bad); if (p && p.then) p.then(ok, bad); }); }
  async function buffer(id, seg) {
    var key = id + '|' + seg; if (buffers[key]) return buffers[key];
    var at = packs[id].clips[seg], all = await bin(id);
    var b = await decode(all.slice(at[0], at[0] + at[1])); buffers[key] = b; return b;
  }
  function stop() { gen++; sources.forEach(function (s) { try { s.stop(); } catch (e) { /* уже */ } }); sources = []; setPlaying(false); }
  /* Програти речення підряд. actx — спільний AudioContext застосунку (розблокований дотиком). */
  async function play(id, segs, actx) {
    ctx = actx; stop(); var my = gen;
    if (!ctx) return false;
    if (ctx.state === 'suspended') try { await ctx.resume(); } catch (e) { /* немає */ }
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
    } catch (e) { if (my === gen) setPlaying(false); return false; }
  }
  async function download(id, progress) { await load(id); var b = await bin(id, progress); return b.byteLength; }
  async function cached(id) {
    if (!window.caches) return false;
    try { var c = await caches.open(CACHE); return !!(await c.match(binUrl(id))); } catch (e) { return false; }
  }
  return { split: split, load: load, has: has, missing: missing, play: play, stop: stop, download: download, cached: cached,
    get busy() { return playing; }, onSpeaking: function (f) { onSpeak = f; }, get packs() { return packs; } };
})();
if (typeof module !== 'undefined') module.exports = VOICEPACK;
