/* 3D-рух вправи на картці підходу «Тренер» (з 3.22.0; слово Alexа 24.10: «Роби день 5 візуалізації: у застосунок, лише картка підходу «Тренер»»).
   План дня 5 (CLAUDE.md §11): лише картка підходу в режимі «Тренер»; розгорнута на першому підході нової вправи (чи нового варіанта), далі згорнута;
   «Зменшити рух» у системі — без анімації (кадр крайньої точки й ▶); обидві теми; українська й англійська; без інтернету.
   Рушій — viz/engine3d.js, обладнання — viz/equip3d.js, вправи — viz/ex3d.js (60 анімацій; ті самі файли збирають атлас tools/viz/atlas3d.html),
   three.js 0.180.0 (MIT) — vendor/three/. Вантажиться лише тоді, коли блок розгорнули (≈ 790 КБ; у кеші застосунку — sw.js — для роботи без інтернету).
   Одне WebGL-полотно на весь застосунок: картка малюється заново після кожної дії, полотно переноситься в нову; не видно (прокрутили, згорнули,
   відпочинок, інша вкладка, телефон заблоковано) — не малює; 30 кадрів за секунду — береже батарею на тренуванні.
   З 3.24.0 те саме полотно показує й мапу відновлення мʼязів на головній (rec, внизу файла) — статичну, без анімації; з 3.27.3 — завжди відкриту.
   З 3.27.3 — і тести форми в «Тіло» → «Тести» → «Як виконувати тести»: кожен тест — свій блок, відкритий — один. */
var VIZ = (function () {
  'use strict';
  /* ключі анімацій = ex3d.js (перевіряє test_engine.js): id вправи, варіант — після «:» (перший варіант — без суфікса) */
  var KEYS = ['floorpress', 'floorfly', 'pullover', 'skull', 'closegrip', 'crunch', 'crunchw', 'curlup', 'deadbug', 'bridge', 'bridge:c', 'pushup', 'pushup:t',
    'birddog', 'sideplank', 'sideplank:f', 'goblet', 'goblet:s2', 'rdl', 'slrdl', 'shrug', 'lateral', 'hammer', 'bentrow', 'calf', 'splitsquat', 'splitsquat:l',
    'splitsquat:b', 'farmer', 'suitcase', 'curl', 'seatedpress', 'ohext', 'reardelt', 'row1', 'bandrow', 'pulldown', 'pulldown:k', 'facepull', 'pallof', 'extrot',
    'abduct', 'g_legpress', 'g_latpull', 'g_cablerow', 'g_chestpress', 'g_shpress', 'g_abduct', 'g_legcurl', 'g_legext', 'g_pecdeck', 'g_revfly', 'g_machrow',
    'g_machcurl', 'g_triext', 'g_cablelat', 'g_facepull', 'g_pushdown', 'g_cablecurl', 'g_pallof',
    't_chair', 't_bal', 't_srt', 't_walk'];  // тести форми (з 3.27.3): «Тіло» → «Тести» → «Як виконувати тести»
  /* вправа програми → анімація. raw — опис вправи з програми мовою оригіналу (до перекладу): тяга зверху в жіночій програмі — на колінах (той самий id) */
  function keyFor(id, variant, raw) {
    raw = raw || {};
    if (id === 'pulldown' && /на колінах/.test(raw.name || '')) return 'pulldown:k';
    var vs = raw.variants, k = id + (vs && vs.length && variant && variant !== vs[0].id ? ':' + variant : '');
    return KEYS.indexOf(k) >= 0 ? k : null;
  }
  var st = { lib: null, wait: null, R: null, X: null, ex: null, key: null, det: null, box: null, o: null, raf: 0, t0: 0, tp: 0, last: 0, play: true, v: 'move', yaw: 0, vis: true, w: 0, h: 0, broken: false, io: null, theme: false, dk: null, mode: 'ex' };
  /* мапа відновлення (з 3.24.0): своя сцена на тому самому полотні; mode — чия зараз картинка на полотні ('ex' — вправа, 'rec' — відновлення) */
  var rs = { X: null, det: null, yaw: 0.35, dk: null, key: null };
  /* блок відновлення з 3.27.3 — завжди відкритий <div>; <details> — як було (закритий — не малюємо) */
  var shown = function (d) { return d.tagName !== 'DETAILS' || d.open; };
  var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var ver = function () { var m = document.querySelector('meta[name="app-version"]'); return m ? m.content : ''; };
  function script(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function load() {
    if (st.lib) return Promise.resolve(st.lib);
    if (!st.wait) {
      var v = '?v=' + ver();
      st.wait = script('viz/engine3d.js' + v).then(function () { return script('viz/equip3d.js' + v); }).then(function () { return script('viz/ex3d.js' + v); })
        .then(function () { return import('./vendor/three/three.module.min.js'); })
        .then(function (T) { var E = VIZ3D(T), Q = EQUIP3D(E); st.lib = { E: E, EX: EX3D(E, Q) }; return st.lib; })
        .catch(function (e) { st.wait = null; throw e; });
    }
    return st.wait;
  }
  /* звільнити памʼять відеокарти попередньої вправи: геометрії, матеріали й карту тіней світла (вона своя в кожній сцені; до дня 6 лишалась —
     у Safari симулятора +1 текстура 1024 × 1024 на кожну вправу, за тренування — десятки) */
  function dispose(X) {
    if (!X) return;
    X.scene.traverse(function (m) {
      if (m.geometry) m.geometry.dispose(); var ms = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; ms.forEach(function (x) { x.dispose(); });
      if (m.isLight && m.shadow && m.shadow.map) { m.shadow.map.dispose(); m.shadow.map = null; }
    });
  }
  function stop() { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; if (st.io) { st.io.disconnect(); st.io = null; } }
  function size() {
    if (!st.box || !st.R) return;
    var w = Math.round(st.box.clientWidth) || 320, h = Math.round(w * 0.75);
    if (w !== st.w || h !== st.h) { st.w = w; st.h = h; st.R.setSize(w, h, false); }
  }
  function draw() {
    var X = st.X, ex = st.ex, o = st.o; if (!X || !ex || !o || st.mode !== 'ex') return;
    var f = X.draw(st.tp / 1000, st.v, o.style(), st.yaw);
    X.camera.aspect = st.w / st.h; X.camera.updateProjectionMatrix(); st.R.render(X.scene, X.camera);
    var ph = st.det.querySelector('.vzph'), n = st.det.querySelector('.vznote');
    if (ph) ph.innerHTML = '<b>' + o.esc(o.t(ex.loop || f.ph === 1 ? ex.c1 : ex.c2)) + '</b>' + (ex.sides ? ' · ' + o.esc(f.side ? o.L.left : o.L.right) : '');
    if (n) { n.className = 'vznote' + (st.v === 'bad' ? ' bad' : ''); n.textContent = st.v === 'mus' ? o.L.work + o.mus(ex.work.p) : st.v === 'bad' ? o.t(ex.bad) + o.L.red : ''; }
  }
  function frame(now) {
    st.raf = requestAnimationFrame(frame);
    if (!st.det || !st.det.isConnected || !st.det.open) { stop(); return; }
    if (document.hidden || !st.vis || now - st.last < 24) return;  // ≈ 30 кадрів за секунду: на 60 Гц — кожен другий кадр (з порогом 32 мс тремтіння таймера губило ще й наступний — у Safari 16–21)
    st.last = now; if (st.play) st.tp = now - st.t0; draw();
  }
  /* кнопки блоку (картка нова після кожного малювання — обробники ставимо щоразу) */
  function wire(det, o) {
    det.querySelectorAll('[data-vzm]').forEach(function (b) { b.classList.toggle('on', b.dataset.vzm === st.v); b.onclick = function () { st.v = b.dataset.vzm; wire(det, o); if (st.X) draw(); }; });
    det.querySelectorAll('[data-vzs]').forEach(function (b) { b.classList.toggle('on', b.dataset.vzs === o.style()); b.onclick = function () { o.setStyle(b.dataset.vzs); wire(det, o); if (st.X) draw(); }; });
    var pp = det.querySelector('[data-vz="pp"]');
    if (pp) { pp.textContent = st.play ? '⏸' : '▶'; pp.setAttribute('aria-label', st.play ? o.L.pause : o.L.play); pp.onclick = function () { st.play = !st.play; if (st.play) st.t0 = performance.now() - st.tp; wire(det, o); }; }
  }
  function drag(cv) {
    var d = null;
    cv.onpointerdown = function (e) { d = { x: e.clientX, yaw: st.mode === 'rec' ? rs.yaw : st.yaw }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* немає */ } };
    cv.onpointermove = function (e) {
      if (!d) return; var y = d.yaw - (e.clientX - d.x) * 0.01;
      if (st.mode === 'rec') { rs.yaw = y; recDraw(); return; }  // відновлення — обертається повністю
      st.yaw = Math.max(-1.4, Math.min(1.4, y)); if (!st.play) draw();
    };
    cv.onpointerup = cv.onpointercancel = function () { d = null; };
  }
  function theme() {
    if (st.theme) return; st.theme = true;
    /* лише коли тема справді змінилась (застосунок перезаписує data-theme і тим самим значенням); старі деталі — звільнити: до 3.22.0 (день 6)
       кожна перебудова лишала попередню сцену у відеопамʼяті — +70 геометрій */
    var re = function () {
      if (!st.lib) return;
      if (rs.X && st.lib.E.dark() !== rs.dk) { rs.dk = st.lib.E.dark(); dispose(rs.X); rs.X.rebuild(); recDraw(); }
      if (!st.X || st.lib.E.dark() === st.dk) return; st.dk = st.lib.E.dark(); dispose(st.X); st.X.rebuild(); if (st.det && st.det.open) draw();
    };
    try { new MutationObserver(re).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* немає */ }
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', re); } catch (e) { /* старий Safari */ }
    window.addEventListener('resize', function () { size(); if (st.mode === 'rec') recDraw(); else if (st.X && st.det && st.det.open) draw(); });
  }
  /* одне полотно на весь застосунок — створюється за першої потреби (вправа чи відновлення); false — WebGL недоступний */
  function renderer(lib) {
    if (st.R) return true;
    try { st.R = lib.E.renderer3(null); } catch (e) { st.broken = true; return false; }
    st.R.domElement.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });  // iOS забирає відеокарту у фоні — повернеться сам
    drag(st.R.domElement); theme(); return true;
  }
  function start(det, o) {
    var key = det.dataset.k, box = det.querySelector('.vzc'); if (!box) return;
    if (st.broken) { box.textContent = o.L.fail; return; }
    if (!box.firstChild) box.innerHTML = '<span class="vzwait">' + o.esc(o.L.wait) + '</span>';
    load().then(function (lib) {
      if (st.det !== det || !det.open) return;
      if (!renderer(lib)) { box.textContent = o.L.fail; return; }
      st.mode = 'ex';
      if (st.key !== key) {
        dispose(st.X); st.ex = lib.EX.filter(function (x) { return x.key === key; })[0] || null; st.X = st.ex ? lib.E.exScene(st.ex) : null; st.key = key; st.dk = lib.E.dark();
        st.play = !reduce(); st.t0 = performance.now(); st.yaw = 0;
        /* «Зменшити рух» — кадр крайньої точки руху (ходьба — середина кроку); за мить до кінця першої фази — підпис тоді саме про цю позу */
        st.tp = st.play ? 0 : (st.ex ? (st.ex.loop ? st.ex.t1 * 0.25 : 0.5 + st.ex.t1 - 0.01) * 1000 : 0);
      }
      if (!st.X) { box.textContent = o.L.fail; return; }
      st.box = box; st.w = 0; box.textContent = ''; box.appendChild(st.R.domElement); size(); wire(det, o); draw();
      if (window.IntersectionObserver) { if (st.io) st.io.disconnect(); st.io = new IntersectionObserver(function (es) { st.vis = es[0].isIntersecting; }); st.io.observe(box); }
      if (!st.raf) st.raf = requestAnimationFrame(frame);
    }, function () { box.textContent = o.L.fail; });
  }
  /* після кожного малювання картки: det — <details class="vz3" data-k> або null (картки немає — не малюємо);
     o: t — переклад даних (TR), mus(ids) — назви мʼязів, esc, style() / setStyle(v) — «clay» | «xray», onToggle(open), L — підписи */
  function attach(det, o) {
    stop(); st.det = det || null; st.o = o || st.o;
    if (!det) return;
    /* toggle приходить і тоді, коли картку щойно намалювали розгорнутою, — зважаємо лише на справжню зміну */
    var was = det.open;
    /* у «Тестах» (з 3.27.3) блоків кілька, полотно одне: розгорнули блок — полотно переходить до нього; згорнули — зупинити, лише якщо полотно ще його
       (відкрили інший — цей згортається, а toggle приходить пізніше) */
    det.addEventListener('toggle', function () { if (det.open === was) return; was = det.open; if (o.onToggle) o.onToggle(det.open); if (det.open) { stop(); st.det = det; st.o = o; wire(det, o); start(det, o); } else if (st.det === det) stop(); });
    wire(det, o);
    if (det.open) start(det, o);
  }
  /* ---------- мапа відновлення мʼязів (з 3.24.0, пункт 1; слово Alexа 25.10: «… включаючи нові записи та 3д візуалізації») ----------
     det — <details class="vz3 vzr"> на головній; o: { rec — ENGINE.recovery, restH, esc, onToggle(open), L: { wait, fail } }.
     Без анімації: кадр — коли розгорнули, повернули пальцем, змінилась тема чи розмір (батарею не їсть) */
  function recDraw() {
    if (!rs.X || !st.R || st.mode !== 'rec' || !rs.det || !rs.det.isConnected || !shown(rs.det)) return;
    rs.X.draw(rs.yaw); rs.X.camera.aspect = st.w / st.h; rs.X.camera.updateProjectionMatrix(); st.R.render(rs.X.scene, rs.X.camera);
  }
  function recStart(det, o) {
    var box = det.querySelector('.vzc'); if (!box) return;
    if (st.broken) { box.textContent = o.L.fail; return; }
    if (!box.firstChild) box.innerHTML = '<span class="vzwait">' + o.esc(o.L.wait) + '</span>';
    load().then(function (lib) {
      if (rs.det !== det || !shown(det)) return;
      if (!renderer(lib)) { box.textContent = o.L.fail; return; }
      /* головна перемальовується після кожної дії (+ склянка, «Щодня»…) — сцену будуємо заново лише тоді, коли змінилось відновлення чи тема (з 3.27.3) */
      var key = JSON.stringify(o.rec) + '|' + o.restH;
      stop(); if (!rs.X || rs.key !== key || rs.dk !== lib.E.dark()) { dispose(rs.X); rs.X = lib.E.recScene(o.rec, o.restH); rs.key = key; rs.dk = lib.E.dark(); }
      st.mode = 'rec'; st.box = box; st.w = 0; box.textContent = ''; box.appendChild(st.R.domElement); size(); recDraw();
    }, function () { box.textContent = o.L.fail; });
  }
  function rec(det, o) {
    rs.det = det || null;
    if (!det) return;
    if (det.tagName === 'DETAILS') {
      var was = det.open;
      det.addEventListener('toggle', function () { if (det.open === was) return; was = det.open; if (o.onToggle) o.onToggle(det.open); if (det.open) recStart(det, o); });
    }
    if (shown(det)) recStart(det, o);
  }
  /* _draw(sec) — для перевірок: кадр на секунді sec (у прихованій вкладці браузер не дає кадрів анімації) */
  return { KEYS: KEYS, keyFor: keyFor, attach: attach, rec: rec, has: function (k) { return KEYS.indexOf(k) >= 0; }, _st: st, _rs: rs, _draw: function (sec) { if (sec !== undefined) st.tp = sec * 1000; draw(); }, _recDraw: recDraw };
})();
if (typeof module !== 'undefined') module.exports = VIZ;
