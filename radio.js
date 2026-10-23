var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Радіо для тренувань. Звук іде через Web Audio (GainNode), тож його можна плавно притишувати, коли говорить тренер:
   на iPhone гучність аудіоелемента з коду не змінюється. Для цього потрібні станції з дозволом CORS на кожному кроці
   переадресації — усі нижче перевірено 22.10.2026. */
var RADIO = (function () {
  var STATIONS = [
    { id: 'workout', g: LL('Для тренувань', "Workout"), name: 'RauteMusik Workout', genre: LL('денс, хіп-хоп, хіти без зупинки', "dance, hip-hop, nonstop hits"), url: 'https://workout-high.rautemusik.fm/' },
    { id: 'antenne', g: LL('Для тренувань', "Workout"), name: 'Antenne Bayern Workout Hits', genre: LL('поп і денс-хіти', "pop and dance hits"), url: 'https://mp3channels.webradio.antenne.de/workout-hits' },
    { id: 'fit', g: LL('Для тренувань', "Workout"), name: 'FIT Radio High Energy', genre: LL('енергійна електроніка', "high-energy electronic"), url: 'https://radio.webicdp.com/listen/fmvfitradiohighenergy/radio.mp3' },
    { id: 'hotmix', g: LL('Для тренувань', "Workout"), name: 'Hotmix Sport', genre: LL('спортивний мікс', "sports mix"), url: 'https://streaming.hotmixradio.com/hotmix-sport-plus-en-mp3' },
    { id: 'power', g: LL('Українські', "Ukrainian"), name: 'Power FM', genre: LL('поп, топ-40', "pop, top 40"), url: 'https://cast.brg.ua/powerfm_main_public_mp3_hq' },
    { id: 'djfm', g: LL('Українські', "Ukrainian"), name: 'DJFM Dance', genre: LL('денс', "dance"), url: 'https://cast.brg.ua/djfmdance_main_public_mp3_hq' },
    { id: 'radivo', g: LL('Українські', "Ukrainian"), name: 'RadiVo', genre: LL('поп і рок', "pop and rock"), url: 'https://radivo.thx8te.kh.ua/listen/radivo/radio.mp3' },
    { id: 'bob', g: LL('Рок і метал', "Rock & metal"), name: 'RADIO BOB! Hardrock', genre: LL('хард-рок', "hard rock"), url: 'https://streams.radiobob.de/bob-hardrock/mp3-192/streams.radiobob.de/' },
    { id: 'oui', g: LL('Рок і метал', "Rock & metal"), name: 'OUI FM', genre: LL('рок', "rock"), url: 'https://ouifm.ice.infomaniak.ch/ouifm-high.mp3' },
    { id: 'metal', g: LL('Рок і метал', "Rock & metal"), name: 'RADIO BOB! Metal', genre: LL('метал', "metal"), url: 'https://streams.radiobob.de/bob-metal/mp3-192/streams.radiobob.de/' },
    { id: 'dnb', g: LL('Драм-н-бейс', "Drum and bass"), name: 'UK Bass Radio', genre: LL('драм-н-бейс, брейкбіт', "drum and bass, breakbeat"), url: 'https://s2.ssl-stream.com/listen/uk_bass_radio/stream' }
  ];
  var el = null, ctx = null, gain = null, cur = null, state = 'off', duckLevel = 0.5, ducked = false, listeners = [], pausedAt = 0;
  /* Safari на iPhone часто пускає звук потоку повз Web Audio (вади WebKit 151589, 180696): музика грає, а гучність з коду не діє.
     Тому заміряємо, чи доходить звук до вузла гучності: так — плавне притишення; ні — на час фрази тренера музику вимикаємо (muted). */
  var an = null, abuf = null, routed = null, heardAt = 0, playingSince = 0, probeT = 0;
  function level() { if (!an) return 0; an.getFloatTimeDomainData(abuf); var s = 0; for (var i = 0; i < abuf.length; i++) s += abuf[i] * abuf[i]; return Math.sqrt(s / abuf.length); }
  function probe() {
    clearInterval(probeT); routed = null; heardAt = 0;
    if (!an) { routed = false; return; }
    probeT = setInterval(function () {
      if (state !== 'playing') return;
      if (!playingSince) playingSince = Date.now();
      if (level() > 0.0005) { routed = true; clearInterval(probeT); }
      else if (Date.now() - playingSince > 4000 && ctx && ctx.state === 'running') { routed = false; clearInterval(probeT); }
    }, 250);
  }
  function byId(id) { for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i]; return null; }
  function emit() { listeners.forEach(function (f) { try { f(state, cur); } catch (e) { /* немає */ } }); }
  function setState(s) { if (s === state) return; state = s; emit(); }  // подія потоку без зміни стану — нічого не перемальовуємо
  function ensure(actx) {
    if (!el) {
      el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'none'; el.setAttribute('playsinline', '');
      el.addEventListener('playing', function () { if (!playingSince) playingSince = Date.now(); setState('playing'); });
      el.addEventListener('waiting', function () { if (state !== 'off') setState('loading'); });
      el.addEventListener('pause', function () { if (state === 'playing' || state === 'loading') setState('paused'); });
      el.addEventListener('error', function () { if (cur) setState('error'); });
    }
    /* одна звʼязка на весь час: аудіоелемент → гучність → вихід */
    if (!gain && actx && actx.createMediaElementSource) {
      try {
        var src = actx.createMediaElementSource(el); gain = actx.createGain(); src.connect(gain); gain.connect(actx.destination); ctx = actx;
        an = actx.createAnalyser(); an.fftSize = 1024; abuf = new Float32Array(an.fftSize); gain.connect(an);
      } catch (e) { gain = null; }
    }
  }
  function mediaSession() {
    if (!('mediaSession' in navigator) || !cur) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: cur.name, artist: cur.genre, album: LL('Радіо · Тренування', "Radio · Workouts") });
      navigator.mediaSession.setActionHandler('play', function () { resume(); });
      navigator.mediaSession.setActionHandler('pause', function () { pause(); });
      navigator.mediaSession.setActionHandler('stop', function () { stop(); });
    } catch (e) { /* немає */ }
  }
  /* Викликати лише з дотику: iOS дозволяє звук після жесту. */
  function play(id, actx) {
    var st = byId(id); if (!st) return;
    ensure(actx);
    if (ctx && ctx.state === 'suspended') ctx.resume();
    var changed = cur !== st; cur = st; if (changed && state === 'loading') emit(); else setState('loading');  // нова станція — оновити назву
    el.src = st.url; ducked = false; hushed = false; el.muted = false; applyGain(1, 0); playingSince = 0; probe();
    var p = el.play(); if (p && p.catch) p.catch(function () { setState('error'); });
    mediaSession();
  }
  function pause() { if (el && cur) { el.pause(); pausedAt = Date.now(); } }
  function resume() {
    if (!el || !cur) return;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    /* живий ефір: після довгої паузи — заново, щоб не грати старий буфер */
    if (Date.now() - pausedAt > 20000) el.src = cur.url;
    setState('loading'); var p = el.play(); if (p && p.catch) p.catch(function () { setState('error'); });
  }
  function stop() { clearInterval(probeT); if (el) { el.pause(); el.muted = false; el.removeAttribute('src'); try { el.load(); } catch (e) { /* немає */ } } cur = null; setState('off'); }
  /* системний голос телефону: музику на час фрази вимикаємо завжди (поверх неї його не чути) */
  function hush(on) { hushed = !!on; applyMute(); }
  function applyGain(v, sec) {
    if (gain && ctx) {
      var t = ctx.currentTime, g = gain.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      if (sec > 0) g.linearRampToValueAtTime(v, t + sec); else g.setValueAtTime(v, t);
    } else if (el) { try { el.volume = v; } catch (e) { /* iOS не дозволяє */ } }
  }
  /* Плавно притишити, поки говорить тренер (0,4 с), і плавно повернути (0,8 с). */
  var hushed = false;
  /* звук іде повз Web Audio (iPhone) або ще не відомо — вимикаємо на час фрази; потік не зупиняється, повертається миттєво */
  function applyMute() { if (el) el.muted = hushed || (ducked && routed !== true); }
  function duck(on) {
    if (on === ducked) return; ducked = on; applyMute();
    if (routed === true && (state === 'playing' || state === 'loading')) applyGain(on ? duckLevel : 1, on ? 0.4 : 0.8);
  }
  return {
    STATIONS: STATIONS, byId: byId, play: play, pause: pause, resume: resume, stop: stop, duck: duck, hush: hush,
    setDuck: function (v) { duckLevel = v; if (ducked) applyGain(v, 0.3); },
    on: function (f) { listeners.push(f); },
    get state() { return state; }, get cur() { return cur; }, get smooth() { return routed === true; }, get routed() { return routed; }, get node() { return gain; }, get media() { return el; },
    get level() { return gain ? gain.gain.value : (el ? el.volume : 1); }
  };
})();
if (typeof module !== 'undefined') module.exports = RADIO;
