/* Радіо для тренувань. Звук іде через Web Audio (GainNode), тож його можна плавно притишувати, коли говорить тренер:
   на iPhone гучність аудіоелемента з коду не змінюється. Для цього потрібні станції з дозволом CORS на кожному кроці
   переадресації — усі нижче перевірено 22.10.2026. */
var RADIO = (function () {
  var STATIONS = [
    { id: 'workout', g: 'Для тренувань', name: 'RauteMusik Workout', genre: 'денс, хіп-хоп, хіти без зупинки', url: 'https://workout-high.rautemusik.fm/' },
    { id: 'antenne', g: 'Для тренувань', name: 'Antenne Bayern Workout Hits', genre: 'поп і денс-хіти', url: 'https://mp3channels.webradio.antenne.de/workout-hits' },
    { id: 'fit', g: 'Для тренувань', name: 'FIT Radio High Energy', genre: 'енергійна електроніка', url: 'https://radio.webicdp.com/listen/fmvfitradiohighenergy/radio.mp3' },
    { id: 'hotmix', g: 'Для тренувань', name: 'Hotmix Sport', genre: 'спортивний мікс', url: 'https://streaming.hotmixradio.com/hotmix-sport-plus-en-mp3' },
    { id: 'power', g: 'Українські', name: 'Power FM', genre: 'поп, топ-40', url: 'https://cast.brg.ua/powerfm_main_public_mp3_hq' },
    { id: 'djfm', g: 'Українські', name: 'DJFM Dance', genre: 'денс', url: 'https://cast.brg.ua/djfmdance_main_public_mp3_hq' },
    { id: 'radivo', g: 'Українські', name: 'RadiVo', genre: 'поп і рок', url: 'https://radivo.thx8te.kh.ua/listen/radivo/radio.mp3' },
    { id: 'bob', g: 'Рок і метал', name: 'RADIO BOB! Hardrock', genre: 'хард-рок', url: 'https://streams.radiobob.de/bob-hardrock/mp3-192/streams.radiobob.de/' },
    { id: 'oui', g: 'Рок і метал', name: 'OUI FM', genre: 'рок', url: 'https://ouifm.ice.infomaniak.ch/ouifm-high.mp3' },
    { id: 'metal', g: 'Рок і метал', name: 'RADIO BOB! Metal', genre: 'метал', url: 'https://streams.radiobob.de/bob-metal/mp3-192/streams.radiobob.de/' },
    { id: 'dnb', g: 'Драм-н-бейс', name: 'UK Bass Radio', genre: 'драм-н-бейс, брейкбіт', url: 'https://s2.ssl-stream.com/listen/uk_bass_radio/stream' }
  ];
  var el = null, ctx = null, gain = null, cur = null, state = 'off', duckLevel = 0.5, ducked = false, listeners = [], pausedAt = 0;
  function byId(id) { for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i]; return null; }
  function emit() { listeners.forEach(function (f) { try { f(state, cur); } catch (e) { /* немає */ } }); }
  function setState(s) { state = s; emit(); }
  function ensure(actx) {
    if (!el) {
      el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'none'; el.setAttribute('playsinline', '');
      el.addEventListener('playing', function () { setState('playing'); });
      el.addEventListener('waiting', function () { if (state !== 'off') setState('loading'); });
      el.addEventListener('pause', function () { if (state === 'playing' || state === 'loading') setState('paused'); });
      el.addEventListener('error', function () { if (cur) setState('error'); });
    }
    /* одна звʼязка на весь час: аудіоелемент → гучність → вихід */
    if (!gain && actx && actx.createMediaElementSource) {
      try { var src = actx.createMediaElementSource(el); gain = actx.createGain(); src.connect(gain); gain.connect(actx.destination); ctx = actx; } catch (e) { gain = null; }
    }
  }
  function mediaSession() {
    if (!('mediaSession' in navigator) || !cur) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: cur.name, artist: cur.genre, album: 'Радіо · Тренування' });
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
    cur = st; setState('loading');
    el.src = st.url; ducked = false; applyGain(1, 0);
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
  function stop() { if (el) { el.pause(); el.removeAttribute('src'); try { el.load(); } catch (e) { /* немає */ } } cur = null; setState('off'); }
  function applyGain(v, sec) {
    if (gain && ctx) {
      var t = ctx.currentTime, g = gain.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      if (sec > 0) g.linearRampToValueAtTime(v, t + sec); else g.setValueAtTime(v, t);
    } else if (el) { try { el.volume = v; } catch (e) { /* iOS не дозволяє */ } }
  }
  /* Плавно притишити, поки говорить тренер (0,4 с), і плавно повернути (0,8 с). */
  function duck(on) {
    if (on === ducked) return; ducked = on;
    if (state !== 'playing' && state !== 'loading') return;
    applyGain(on ? duckLevel : 1, on ? 0.4 : 0.8);
  }
  return {
    STATIONS: STATIONS, byId: byId, play: play, pause: pause, resume: resume, stop: stop, duck: duck,
    setDuck: function (v) { duckLevel = v; if (ducked) applyGain(v, 0.3); },
    on: function (f) { listeners.push(f); },
    get state() { return state; }, get cur() { return cur; }, get smooth() { return !!gain; },
    get level() { return gain ? gain.gain.value : (el ? el.volume : 1); }
  };
})();
if (typeof module !== 'undefined') module.exports = RADIO;
