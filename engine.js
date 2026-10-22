/* Рушій: розклад, метрики, підказки прогресії, рекорди, плато, втома. Без DOM — перевіряється в node. */
var ENGINE = (function () {
  var STEP = 2.5;

  function round1(x) { return Math.round(x * 10) / 10; }

  /* Сесія n (0, 1, 2…) → тиждень і тренування. Після 12 тижнів цикл повторюється з тижня 5. */
  function planFor(prog, n) {
    var pw = prog.perWeek || 3;  // тренувань на тиждень (індивідуальна програма — 2…4)
    var wIdx = Math.floor(n / pw), cycle = 1, wk;
    if (wIdx < 12) wk = wIdx + 1;
    else { var r = wIdx - 12; cycle = 2 + Math.floor(r / 8); wk = 5 + (r % 8); }
    var slot = n % pw;
    var order = prog.week(wk);
    var wid = order[slot];
    return { n: n, week: wk, cycle: cycle, slot: slot, workout: wid, deload: prog.deload.indexOf(wk) >= 0, note: prog.note(wk) };
  }

  /* Навантаження на гантель у кг: гриф + диски. plates === null — без гантелі. */
  function totalLoad(ex, plates, handle, variant) {
    if (plates === null || plates === undefined || plates === '') return 0;
    if (ex.type === 'mach') return Number(plates);  // тренажер чи блок: вага одразу в кг, без грифа
    var db = ex.db || 1;
    if (ex.variants && variant) for (var i = 0; i < ex.variants.length; i++) if (ex.variants[i].id === variant && ex.variants[i].db) db = ex.variants[i].db;
    return db * ((handle || 0) + Number(plates));
  }

  /* Показник підходу для графіка й рекордів — чесний для кожного типу:
     db — розрахунковий максимум (Епплі), band — рівень × повторення, решта — повторення або секунди. */
  function metric(ex, set, handle) {
    if (!set || !(set.reps > 0)) return 0;
    if (ex.type === 'db' || ex.type === 'mach') { var L = totalLoad(ex, set.load, handle, set.variant); return round1(L * (1 + set.reps / 30)); }
    if (ex.type === 'band') return (Number(set.load) || 0) * set.reps;
    return set.reps;
  }
  function metricLabel(ex) {
    if (ex.type === 'db' || ex.type === 'mach') return 'розрахунковий максимум, кг';
    if (ex.type === 'band') return 'рівень × повторення';
    if (ex.type === 'time') return 'секунди, кращий підхід';
    return 'повторення, кращий підхід';
  }

  /* Історія вправи: [{date, n, deload, sets:[…]}] за зростанням дати. */
  function isWork(x) { return !x.type || x.type === 'N' || x.type === 'F' || x.type === 'M'; }
  function history(profile, exId, kind) {
    var out = [];
    (profile.sessions || []).forEach(function (s) {
      var sets = (s.sets || []).filter(function (x) { return x.ex === exId && x.reps > 0 && (kind === 'all' ? x.type !== 'W' : isWork(x)); });
      if (sets.length) out.push({ date: s.date, n: s.n, deload: !!s.deload, place: s.place, sets: sets });  // place — де було (дім / зал)
    });
    return out;
  }
  function bestOf(ex, sets, handle) {
    var b = 0; sets.forEach(function (s) { var m = metric(ex, s, handle); if (m > b) b = m; }); return b;
  }

  /* Крок тренажера в залі людини — з її власних ваг на ньому (робочі підходи історії):
     найменша різниця між різними вагами, якщо всі різниці їй кратні (±0,15 кг — перераховані з фунтів таблички).
     Крок, не кратний типовому (2,5 замість 5, 4,5 замість 5), — з 2 різних ваг; грубіший кратний (5 замість 2,5) —
     лише з 3 і більше (дві ваги можуть бути просто стрибком на два кроки) і не на великих вправах: там застосунок сам
     дає подвійний крок, тож 40 → 50 → 60 — ще не доказ кроку 10. Від 1,25 до 20 кг; інакше — типовий крок. */
  function machStep(ex, hist) {
    var def = ex.step || 5, seen = {};
    (hist || []).forEach(function (h) { (h.sets || []).forEach(function (s) { var v = Number(s.load); if (s.type !== 'W' && v > 0) seen[Math.round(v * 10)] = 1; }); });
    var xs = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    if (xs.length < 2) return def;
    var d = [], i;
    for (i = 1; i < xs.length; i++) d.push((xs[i] - xs[i - 1]) / 10);
    var g = Math.min.apply(null, d);
    if (g < 1.25 || g > 20 || d.some(function (x) { return Math.abs(x / g - Math.round(x / g)) * g > 0.15; })) return def;
    g = Math.round(g * 10) / 10;
    if (Math.abs(g - def) < 0.05) return def;
    var mult = Math.abs(g / def - Math.round(g / def)) * def < 0.05;
    if (mult && (xs.length < 3 || ex.big)) return def;
    return g;
  }
  /* Підказка на сьогодні за правилами прогресії програми. */
  function suggest(prog, exId, item, nSets, hist, handle, deload, stepIn) {
    var ex = prog.ex[exId];
    /* тренажер чи блок: крок — з ваг людини на ньому (machStep), межа — власна; гантелі — крок дисків і межа набору */
    var STEP = ex.type === 'mach' ? machStep(ex, hist) : (stepIn || 2.5), cap = ex.type === 'mach' ? (ex.cap || 300) : (prog.cap || 20);
    var min = item.min, max = item.max;
    var out = { sets: [], note: '' };
    var last = hist.length ? hist[hist.length - 1].sets : null;
    var i;
    function fill(load, reps) { for (i = 0; i < nSets; i++) out.sets.push({ load: load, reps: reps }); }

    if (ex.type === 'amrap') {
      var bestA = 0; if (last) last.forEach(function (s) { if (s.reps > bestA) bestA = s.reps; });
      fill(null, bestA ? bestA + 1 : null);
      out.note = 'Скільки зможете, запас 2' + (bestA ? ' · минулого разу найкраще ' + bestA : '');
      return out;
    }
    if (!last) {
      var startLoad = (ex.type === 'bw' || (ex.type === 'time' && !ex.load)) ? null : (ex.start === undefined ? null : ex.start);
      /* стартова вага — не більша за межу набору й кратна кроку дисків (інакше її не зібрати) */
      if (startLoad !== null && (ex.type === 'db' || ex.type === 'mach' || ex.type === 'time')) startLoad = Math.max(0, Math.floor(Math.min(startLoad, cap) / STEP + 1e-9) * STEP);
      fill(startLoad, max);
      var aim = ex.type === 'time' ? max + ' с' : max + ' повторень';
      out.note = startLoad === null ? 'Перший раз: ' + aim + ' із запасом 2–3' + (ex.type === 'dbopt' ? ', без гантелі' : '') + '; важко — легший варіант.'
        : 'Перший раз: підберіть ' + (ex.type === 'band' ? 'опір' : 'вагу') + ', щоб ' + aim + ' давались із запасом 2–3.';
      return out;
    }
    var loads = last.map(function (s) { return s.load === undefined ? null : s.load; });
    var numeric = loads.filter(function (x) { return x !== null && x !== ''; }).map(Number);
    var Lmax = numeric.length ? Math.max.apply(null, numeric) : null;
    var atMax = last.filter(function (s) { return (s.load === null || s.load === undefined || s.load === '') ? Lmax === null : Number(s.load) === Lmax; });
    var allTop = last.length >= 1 && last.every(function (s) {
      /* міо-підхід іде до відмови за задумом — його запас не гальмує прогрес */
      var ok = s.reps >= max && (s.type === 'M' || s.rir === undefined || s.rir === null || s.rir >= 1);
      return ok && ((s.load === null || s.load === undefined || s.load === '') ? Lmax === null : Number(s.load) === Lmax);
    });

    if (deload) {
      fill(Lmax, min);
      out.note = 'Легкий тиждень: та сама вага (або на крок нижча), запас 3–4.';
      return out;
    }

    if (ex.type === 'band') {
      if (allTop) { fill(Lmax, min); out.note = 'Верхня межа взята: відступіть далі від дверей або +1 рівень.'; }
      else { for (i = 0; i < nSets; i++) out.sets.push({ load: Lmax, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 1) }); out.note = 'Той самий опір, +1 повторення.'; }
      return out;
    }
    if (ex.type === 'bw') {
      if (allTop) { fill(null, max); out.note = 'Верхня межа взята: переходьте на складніший варіант.'; }
      else { for (i = 0; i < nSets; i++) out.sets.push({ load: null, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 1) }); out.note = '+1 повторення.'; }
      return out;
    }
    if (ex.type === 'time') {
      if (allTop) {
        if (ex.load && Lmax !== null) { var nl = Math.min(cap, Lmax + STEP); fill(nl, min); out.note = nl > Lmax ? 'Верхня межа взята: +2,5 кг.' : 'Вага максимальна: довше або повільніше.'; }
        else { fill(Lmax, max); out.note = 'Верхня межа взята: складніший варіант.'; }
      } else { for (i = 0; i < nSets; i++) out.sets.push({ load: Lmax, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 5) }); out.note = '+5 секунд.'; }
      return out;
    }
    /* db і dbopt */
    if (ex.type === 'dbopt' && Lmax === null) {
      if (allTop) { fill(0, min); out.note = 'Без ваги вже легко: візьміть гриф без дисків в іншу руку.'; }
      else { for (i = 0; i < nSets; i++) out.sets.push({ load: null, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 1) }); out.note = '+1 повторення.'; }
      return out;
    }
    if (allTop) {
      var step = (ex.big && last.every(function (s) { return s.reps >= max + 2; })) ? 2 * STEP : STEP;
      var newL = Math.round(Math.min(cap, Lmax + step) * 100) / 100;  // крок 4,5 чи 6,8 — без хвостів 18,099999
      if (newL === Lmax) { fill(Lmax, max); out.note = 'Вага максимальна: темп 4 с, пауза внизу, +1 підхід або одна рука / нога.'; }
      else { fill(newL, min); out.note = 'Верхня межа взята: +' + String(Math.round((newL - Lmax) * 100) / 100).replace('.', ',') + (ex.type === 'mach' ? ' кг.' : ' кг на гантель.'); }
      return out;
    }
    /* Змішані підходи: на новій вазі менше нижньої межі — перший підхід нова вага, решта стара;
       щоразу, коли підходи на новій вазі вдалися, на неї переходить ще один підхід. */
    var weak = atMax.filter(function (s) { return s.reps < min; }).length;
    var strong = atMax.length - weak;
    var lower = numeric.filter(function (x) { return x < Lmax; });
    if (weak > 0 || lower.length) {
      var prevL = lower.length ? Math.max.apply(null, lower) : Math.max(0, Math.round((Lmax - STEP) * 100) / 100);
      var keep = weak > 0 ? Math.max(1, strong) : strong + 1;
      if (keep >= nSets) {
        for (i = 0; i < nSets; i++) out.sets.push({ load: Lmax, reps: min });
        out.note = 'Усі підходи — на новій вазі.';
      } else {
        for (i = 0; i < nSets; i++) {
          var r0 = last[i] || last[last.length - 1];
          out.sets.push(i < keep ? { load: Lmax, reps: min } : { load: prevL, reps: Math.min(max, (r0.reps || min) + 1) });
        }
        out.note = 'Змішані підходи: ' + keep + ' — нова вага, решта — попередня.';
      }
      return out;
    }
    for (i = 0; i < nSets; i++) {
      var ref = last[i] || last[last.length - 1];
      var L = (ref.load === null || ref.load === undefined || ref.load === '') ? Lmax : Number(ref.load);
      out.sets.push({ load: L, reps: Math.min(max, (ref.reps || min) + 1) });
    }
    out.note = 'Та сама вага, +1 повторення в кожному підході.';
    return out;
  }

  /* Рекорд: показник підходу більший за все, що було раніше (потрібна хоча б одна попередня сесія). */
  function isPR(ex, set, hist, handle) {
    if (!hist.length) return false;
    var prev = 0; hist.forEach(function (h) { var b = bestOf(ex, h.sets, handle); if (b > prev) prev = b; });
    return metric(ex, set, handle) > prev;
  }

  /* Плато: 4+ сесій, останні 3 не перевищили найкращого до них. */
  function plateau(ex, hist, handle) {
    var h = hist.filter(function (x) { return !x.deload; });
    if (h.length < 4) return false;
    var before = 0, recent = 0;
    h.slice(0, h.length - 3).forEach(function (x) { before = Math.max(before, bestOf(ex, x.sets, handle)); });
    h.slice(-3).forEach(function (x) { recent = Math.max(recent, bestOf(ex, x.sets, handle)); });
    return before > 0 && recent <= before;
  }

  /* Втома: у кожній з двох останніх (не легких) сесій ≥ 2 головні вправи гірші, ніж минулого разу. */
  function fatigue(prog, profile, handle) {
    var ss = (profile.sessions || []).filter(function (s) { return !s.deload; });
    if (ss.length < 3) return false;
    function drops(idx) {
      var s = ss[idx], cnt = 0;
      var exIds = {}; (s.sets || []).forEach(function (x) { exIds[x.ex] = 1; });
      Object.keys(exIds).forEach(function (id) {
        var ex = prog.ex[id]; if (!ex || !ex.main) return;
        var cur = bestOf(ex, s.sets.filter(function (x) { return x.ex === id; }), handle);
        for (var j = idx - 1; j >= 0; j--) {
          /* тренажер — порівнюємо з тим самим місцем: удома й у залі це різні тренажери (100 кг у залі й 60 удома — не спад) */
          if (ex.gym && s.place && ss[j].place && ss[j].place !== s.place) continue;
          var p = ss[j].sets.filter(function (x) { return x.ex === id && x.reps > 0; });
          if (p.length) { if (cur < bestOf(ex, p, handle)) cnt++; break; }
        }
      });
      return cnt;
    }
    return drops(ss.length - 1) >= 2 && drops(ss.length - 2) >= 2;
  }

  /* Тиждень за датою (понеділок, YYYY-MM-DD). */
  function weekKey(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }
  /* Підходи по групах м'язів за тижнями. */
  function weeklySets(prog, profile) {
    var map = {};
    (profile.sessions || []).forEach(function (s) {
      var k = weekKey(s.date); map[k] = map[k] || {};
      (s.sets || []).forEach(function (x) { if (!(x.reps > 0) || x.type === 'W') return; var g = (prog.ex[x.ex] || {}).group || 'other'; map[k][g] = (map[k][g] || 0) + 1; });
    });
    return map;
  }
  /* Ковзне середнє за 7 днів для ваги тіла. */
  function rolling7(points) {
    var sorted = points.slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    return sorted.map(function (p) {
      var t = new Date(p.d + 'T12:00:00').getTime(), sum = 0, c = 0;
      sorted.forEach(function (q) { var u = new Date(q.d + 'T12:00:00').getTime(); if (u <= t && t - u < 7 * 864e5) { sum += Number(q.v); c++; } });
      return { d: p.d, v: round1(sum / c) };
    });
  }

  /* ---------- v2 ---------- */
  var INV = { 5: 4, 2.5: 8, 1.25: 4 };
  /* Крок ваги на гантель — подвоєний найменший диск, якого вистачає на обидва боки обох гантелей (4 шт.);
     з дисками 1,25 — 2,5 кг, з 2,5 — 5 кг, лише з 5 — 10 кг. Без жодної четвірки — за парою (одна гантель). */
  function stepFor(inv) {
    inv = inv || {};
    var four = [1.25, 2.5, 5].filter(function (s) { return inv[s] >= 4; })[0], two = [1.25, 2.5, 5].filter(function (s) { return inv[s] >= 2; })[0];
    return 2 * (four || two || 2.5);
  }
  /* Найбільша вага дисків на гриф, яку можна зібрати з набору: для двох гантелей (а якщо на дві дисків не вистачає — для однієї). */
  function capOf(inv) {
    var two = 0, one = 0;
    [5, 2.5, 1.25].forEach(function (s) { var n = Number((inv || {})[s]) || 0; two += Math.floor(n / 4) * 2 * s; one += Math.floor(n / 2) * 2 * s; });
    return two || one;
  }
  function dbCountOf(ex, variant) {
    var db = ex.db || 1;
    if (ex.variants && variant) ex.variants.forEach(function (v) { if (v.id === variant && v.db) db = v.db; });
    return db;
  }
  /* Обсяг підходу, кг: усі гантелі × повторення (еспандер і без ваги — 0). */
  function setVolume(ex, set, handle) {
    if (!set || !(set.reps > 0) || set.type === 'W') return 0;
    var reps = set.reps + (set.mini || []).reduce(function (a, r) { return a + (Number(r) || 0); }, 0);
    if (ex.type === 'db' || ex.type === 'mach' || (ex.type === 'dbopt' && set.load !== null && set.load !== undefined && set.load !== '')) return round1(totalLoad(ex, set.load, handle, set.variant) * reps);
    return 0;
  }
  function sessionVolume(prog, session, handle) {
    var v = 0; (session.sets || []).forEach(function (x) { var ex = prog.ex[x.ex]; if (ex) v += setVolume(ex, x, handle); }); return round1(v);
  }
  /* Диски на кожен бік з урахуванням набору: dbCount гантелей заряджаються однаково. */
  function plates(load, inv, dbCount, cap) {
    inv = inv || INV; cap = cap || 20;
    if (load === null || load === undefined || load === '') return { ok: true, side: [], text: 'без гантелі' };
    load = Number(load);
    if (load === 0) return { ok: true, side: [], text: 'лише гриф' };
    if (load > cap) return { ok: false, side: [], text: 'понад межу ' + cap + ' кг на гриф' };
    /* рахуємо в чвертях кілограма, щоб не було похибок заокруглення */
    var per = Math.round(load * 2), sizes = [[5, 20], [2.5, 10], [1.25, 5]], side = [], k = 2 * (dbCount || 1);
    sizes.forEach(function (z) {
      var avail = Math.floor((inv[z[0]] || 0) / k);
      while (avail > 0 && per >= z[1]) { side.push(z[0]); per -= z[1]; avail--; }
    });
    if (per > 0) return { ok: false, side: side, text: 'не зібрати з вашого набору' };
    return { ok: true, side: side, text: side.map(function (x) { return String(x).replace('.', ','); }).join(' + ') };
  }
  /* Розминка для головних вправ з гантелями — за схемою програми (наприклад, 1 × 12 з половинною вагою).
     mstep — крок тренажера в залі людини (machStep); без нього — типовий крок тренажера. */
  function warmups(ex, workLoad, step, scheme, mstep) {
    if ((ex.type !== 'db' && ex.type !== 'mach') || !(ex.main || ex.big) || workLoad === null || workLoad === undefined) return [];
    var w = Number(workLoad), st = ex.type === 'mach' ? (mstep || ex.step || 5) : (step || 2.5), sc = scheme || { pct: [0.5], reps: [12] };
    if (w <= 0) return [];
    var down = function (x) { return Math.max(0, Math.round(Math.floor(x / st + 1e-9) * st * 100) / 100); };
    var out = [];
    sc.pct.forEach(function (pc, i) { var L = down(w * pc); if (!out.length || L > out[out.length - 1].load) out.push({ load: L, reps: sc.reps[i] }); });
    return out;
  }
  /* Харчування: Міффлін — Сан Жеор × 1,45; мета «схуднення» — мінус дефіцит; білок — від цільової або поточної ваги. */
  function nutrition(food, me, weight) {
    if (!food || !me || !(me.age > 0) || !(me.height > 0) || !(weight > 0)) return null;
    var bmr = 10 * weight + 6.25 * me.height - 5 * me.age + (me.sex === 'f' ? -161 : 5);
    var tdee = bmr * 1.45, mid = tdee * (1 - (food.deficit || 0));
    var r50 = function (x) { return Math.round(x / 50) * 50; }, r10 = function (x) { return Math.round(x / 10) * 10; };
    var target = me.target > 0 ? me.target : Math.round(27.5 * Math.pow(me.height / 100, 2));
    var base = food.basis === 'target' ? target : weight;
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kLo: r50(mid - 100), kHi: r50(mid + 100), pLo: r10(food.protein[0] * base), pHi: r10(food.protein[1] * base), base: base, target: target };
  }
  /* Темп зміни ваги за середньою за 7 днів, кг на тиждень (потрібно ≥ 14 днів даних). */
  function weightTrend(points) {
    var avg = rolling7(points);
    if (avg.length < 2) return null;
    var last = avg[avg.length - 1], tl = new Date(last.d + 'T12:00:00').getTime(), prev = null;
    for (var i = avg.length - 2; i >= 0; i--) { var t = new Date(avg[i].d + 'T12:00:00').getTime(); if (tl - t >= 14 * 864e5) { prev = avg[i]; break; } }
    if (!prev) return { rate: null, now: last.v };
    var days = (tl - new Date(prev.d + 'T12:00:00').getTime()) / 864e5;
    return { rate: round1((last.v - prev.v) / (days / 7)), now: last.v, then: prev.v, days: Math.round(days) };
  }
  /* Підказка за темпом: схуднення −0,5…−1 кг/тиж; швидше за 1 кг — +200 ккал; 2 тижні стоїть — −200 ккал. Підтримка — ±0,25 кг/тиж. */
  function foodAdvice(food, trend) {
    if (!trend || trend.rate === null) return { k: 'wait', text: 'Для підказки потрібні зважування за 2 тижні.' };
    var r = trend.rate;
    if (food.goal === 'loss') {
      if (r < -1) return { k: 'more', text: 'Худнете швидше за 1 кг на тиждень — додайте ≈ 200 ккал на день.' };
      if (r > -0.2) return { k: 'less', text: 'Вага стоїть 2 тижні — заберіть ≈ 200 ккал на день.' };
      if (r > -0.5) return { k: 'slow', text: 'Худнете повільніше за план (−0,5…−1 кг на тиждень). Якщо так ще тиждень — заберіть ≈ 200 ккал.' };
      return { k: 'ok', text: 'Темп у нормі (−0,5…−1 кг на тиждень) — нічого не міняйте.' };
    }
    if (r > 0.25) return { k: 'less', text: 'Вага росте — заберіть ≈ 150–200 ккал на день.' };
    if (r < -0.25) return { k: 'more', text: 'Вага падає — додайте ≈ 150–200 ккал на день.' };
    return { k: 'ok', text: 'Вага стабільна — калорії підходять.' };
  }
  /* Рекорди вправи: найкращий розрахунковий максимум, найважчий підхід, найбільший обсяг за тренування, повторення на кожній вазі. */
  function records(ex, histAll, handle) {
    var r = { e1rm: null, heavy: null, vol: null, reps: {} };
    histAll.forEach(function (h) {
      var vol = 0;
      h.sets.forEach(function (x) {
        var m = metric(ex, x, handle);
        if (!r.e1rm || m > r.e1rm.v) r.e1rm = { v: m, date: h.date, set: x };
        if (ex.type === 'db' || ex.type === 'dbopt' || ex.type === 'mach' || (ex.type === 'time' && ex.load)) {
          var L = x.load === null || x.load === undefined || x.load === '' ? null : Number(x.load);
          if (L !== null) {
            var tot = totalLoad(ex, L, handle, x.variant);
            if (!r.heavy || tot > r.heavy.total || (tot === r.heavy.total && x.reps > r.heavy.set.reps)) r.heavy = { total: tot, date: h.date, set: x };
            var key = String(L);
            if (!r.reps[key] || x.reps > r.reps[key].reps) r.reps[key] = { reps: x.reps, date: h.date };
          }
        }
        vol += setVolume(ex, x, handle);
      });
      if (vol > 0 && (!r.vol || vol > r.vol.v)) r.vol = { v: round1(vol), date: h.date };
    });
    return r;
  }
  /* Які рекорди дає новий підхід (порівняння з усіма попередніми тренуваннями і ранішими підходами цього). */
  function prTypes(ex, set, histAll, handle) {
    if (!histAll.length || set.type === 'W') return [];
    var rec = records(ex, histAll, handle), out = [];
    var m = metric(ex, set, handle);
    if (rec.e1rm && m > rec.e1rm.v) out.push('e1rm');
    if ((ex.type === 'db' || ex.type === 'dbopt' || ex.type === 'mach') && set.load !== null && set.load !== undefined && set.load !== '') {
      var tot = totalLoad(ex, set.load, handle, set.variant);
      if (rec.heavy && tot > rec.heavy.total) out.push('weight');
      var prev = rec.reps[String(Number(set.load))];
      if (prev && set.reps > prev.reps) out.push('reps');
    }
    return out;
  }
  /* Підходи на м'яз: основні — 1, допоміжні — 0,5; розминка не рахується. */
  function muscleSets(prog, sessions, fromTs, toTs) {
    var out = {};
    (sessions || []).forEach(function (s) {
      var t = new Date(s.date + 'T12:00:00').getTime();
      if (t < fromTs || t > toTs) return;
      (s.sets || []).forEach(function (x) {
        if (!(x.reps > 0) || x.type === 'W') return;
        var ex = prog.ex[x.ex]; if (!ex || !ex.m) return;
        ex.m.p.forEach(function (k) { out[k] = (out[k] || 0) + 1; });
        ex.m.s.forEach(function (k) { out[k] = (out[k] || 0) + 0.5; });
      });
    });
    return out;
  }
  /* Серія тижнів поспіль із тренуванням (поточний тиждень не обриває серію, доки не скінчився). */
  function streakWeeks(sessions, todayStr) {
    var set = {}; (sessions || []).forEach(function (s) { set[weekKey(s.date)] = 1; });
    var d = new Date(todayStr + 'T12:00:00'), n = 0;
    if (!set[weekKey(todayStr)]) d.setDate(d.getDate() - 7);
    for (;;) { var k = weekKey(d.toISOString().slice(0, 10)); if (set[k]) { n++; d.setDate(d.getDate() - 7); } else break; }
    return n;
  }
  /* Місячний звіт. */
  function monthReport(prog, profile, ym, handle) {
    var r = { sessions: 0, mins: 0, volume: 0, sets: 0, prs: 0, best: null };
    var ss = (profile.sessions || []).filter(function (s) { return s.date.slice(0, 7) === ym; });
    r.sessions = ss.length;
    ss.forEach(function (s) { r.mins += s.mins || 0; r.volume += sessionVolume(prog, s, handle); r.sets += (s.sets || []).filter(function (x) { return x.reps > 0 && x.type !== 'W'; }).length; r.prs += s.prs || 0; });
    r.volume = round1(r.volume);
    var gains = [];
    Object.keys(prog.ex).forEach(function (id) {
      var ex = prog.ex[id], h = history(profile, id);
      var before = h.filter(function (x) { return x.date.slice(0, 7) < ym; }), inM = h.filter(function (x) { return x.date.slice(0, 7) === ym; });
      if (!before.length || !inM.length) return;
      var b0 = 0; before.forEach(function (x) { b0 = Math.max(b0, bestOf(ex, x.sets, handle)); });
      var b1 = 0; inM.forEach(function (x) { b1 = Math.max(b1, bestOf(ex, x.sets, handle)); });
      if (b0 > 0 && b1 > b0) gains.push({ id: id, pct: Math.round((b1 / b0 - 1) * 100) });
    });
    gains.sort(function (a, b) { return b.pct - a.pct; });
    r.best = gains[0] || null; r.gains = gains;
    return r;
  }
  /* Порядок вправ із суперсетами: друга вправа пари стає одразу за першою; мітки А1/А2. */
  function orderItems(items, pairs) {
    var list = items.map(function (it, i) { return { it: it, idx: i, ss: null }; });
    (pairs || []).forEach(function (pr, gi) {
      var a = -1, b = -1;
      list.forEach(function (x, i) { if (x.it.ex === pr[0]) a = i; if (x.it.ex === pr[1]) b = i; });
      if (a < 0 || b < 0) return;
      var B = list.splice(b, 1)[0]; if (b < a) a--;
      list.splice(a + 1, 0, B);
      list[a].ss = { g: '', k: 1, pair: pr[1] }; list[a + 1].ss = { g: '', k: 2, pair: pr[0] };
    });
    var letters = 'АБВГДЕ', li = 0;
    list.forEach(function (x, i) { if (x.ss && x.ss.k === 1) { x.ss.g = letters[li]; list[i + 1].ss.g = letters[li]; li++; } });
    return list;
  }
  /* ---------- v3 ---------- */
  /* Порядок кроків тренування: у суперсеті підходи чергуються (А1, А2, А1, А2…), розминка — перед першим підходом своєї вправи.
     items — [{ss, skipped, sets:[…]}]; повертає [{i, j}]. */
  function stepOrder(items) {
    var out = [], i = 0;
    while (i < items.length) {
      var a = items[i];
      if (a.ss && a.ss.k === 1 && items[i + 1] && items[i + 1].ss && items[i + 1].ss.k === 2) {
        var b = items[i + 1];
        var aw = [], an = [], bw = [], bn = [];
        a.sets.forEach(function (s, j) { (s.type === 'W' ? aw : an).push(j); });
        b.sets.forEach(function (s, j) { (s.type === 'W' ? bw : bn).push(j); });
        if (!a.skipped) aw.forEach(function (j) { out.push({ i: i, j: j }); });
        if (!b.skipped) bw.forEach(function (j) { out.push({ i: i + 1, j: j }); });
        for (var k = 0; k < Math.max(an.length, bn.length); k++) {
          if (!a.skipped && k < an.length) out.push({ i: i, j: an[k] });
          if (!b.skipped && k < bn.length) out.push({ i: i + 1, j: bn[k] });
        }
        i += 2;
      } else {
        if (!a.skipped) a.sets.forEach(function (s, j) { out.push({ i: i, j: j }); });
        i++;
      }
    }
    return out;
  }
  /* Відпочинок після кроку: між вправами пари — 0; після пари — більший з двох; розминка — 45 с. */
  function restAfter(items, i, j) {
    var it = items[i], s = it.sets[j];
    if (s.type === 'W') return 45;
    if (it.ss && it.ss.k === 1) {
      var b = items[i + 1];
      if (b && !b.skipped) {
        var nW = it.sets.slice(0, j + 1).filter(function (x) { return x.type !== 'W'; }).length;
        if (b.sets.filter(function (x) { return x.type !== 'W'; }).length >= nW) return 0;
      }
      return it.rest;
    }
    if (it.ss && it.ss.k === 2) { var a = items[i - 1]; return Math.max(it.rest, a && !a.skipped ? a.rest : 0); }
    return it.rest;
  }
  /* Оцінка тривалості, хв: підхід ≈ 45 с (на бік — 75 с), міо — ще 60 с, плюс відпочинок за правилами. */
  function estimateMins(prog, items) {
    var sec = 0;
    stepOrder(items).forEach(function (st, k, arr) {
      var it = items[st.i], ex = prog.ex[it.ex] || {}, s = it.sets[st.j];
      sec += ex.side ? 75 : 45;
      if (s.type === 'M') sec += 60;
      if (k < arr.length - 1) sec += restAfter(items, st.i, st.j);
    });
    return Math.round(sec / 60);
  }
  /* Самопочуття: g — за планом; y — заміна (якщо задана й такої вправи ще немає) або легше; r — поперекові вправи пропускаються. */
  function readyAction(prog, exId, level, present) {
    var ex = prog.ex[exId];
    if (!ex || !ex.spine || level === 'g' || !level) return null;
    if (level === 'r') return { act: 'skip' };
    var to = prog.ready && prog.ready.swap ? prog.ready.swap[exId] : null;
    if (to) return present.indexOf(to) >= 0 ? { act: 'skip' } : { act: 'swap', to: to };
    return { act: 'light' };
  }
  /* Рівноцінні заміни: спершу вправи тієї самої групи, що зачіпають ті самі мʼязи; якщо таких немає —
     з інших груп, але з тим самим головним мʼязом. Не вибувші, не ті, що вже є; при болю в спині — без поперекових. */
  /* Де можна зробити вправу: у залі (тренажер чи блок), удома (гантелі чи петля) або будь-де (власна вага) */
  function kit(e) { return e.gym ? 'gym' : (e.type === 'db' || e.type === 'band' || (e.type === 'time' && e.db)) ? 'home' : 'any'; }
  function alternatives(prog, exId, noSpine, present, place) {
    var ex = prog.ex[exId]; if (!ex) return [];
    var main = ex.m.p[0];
    function pick(sameGroup) {
      var out = [];
      Object.keys(prog.ex).forEach(function (id) {
        var e = prog.ex[id];
        if (id === exId || e.retired || (noSpine && e.spine) || (present && present.indexOf(id) >= 0)) return;
        /* заміна — з того самого місця: у залі тренажер, удома — гантелі, петля чи тренажер, що є вдома (prog.homeMach) */
        if (place && kit(e) !== 'any' && kit(e) !== place && !(place === 'home' && e.gym && prog.homeMach && prog.homeMach[id])) return;
        if (sameGroup ? e.group !== ex.group : (e.group === ex.group || e.m.p.indexOf(main) < 0)) return;
        var score = (e.m.p.indexOf(main) >= 0 ? 3 : 0)
          + e.m.p.filter(function (m) { return m !== main && ex.m.p.indexOf(m) >= 0; }).length * 2
          + e.m.p.filter(function (m) { return ex.m.s.indexOf(m) >= 0; }).length
          + e.m.s.filter(function (m) { return ex.m.p.indexOf(m) >= 0; }).length;
        if (score > 0) out.push({ id: id, score: score });
      });
      out.sort(function (a, b) { return b.score - a.score; });
      return out.map(function (x) { return x.id; });
    }
    var same = pick(true);
    return same.length ? same : pick(false);
  }
  /* Перехід даних з версій 1–2. */
  function migrate(db) {
    if (!db || !db.profiles) return db;
    db.v = 3;
    db.settings = db.settings || {};
    ['sound', 'haptics', 'awake'].forEach(function (k) { if (db.settings[k] === undefined) db.settings[k] = true; });
    if (!db.settings.voice) db.settings.voice = { on: true, level: 'full', rate: 1, uri: null };
    if (!db.settings.voice.tone) db.settings.voice.tone = 'hard';
    if (!db.settings.radio) db.settings.radio = { id: null, duck: 0.5 };
    if (!db.settings.tour) db.settings.tour = {};
    if (!db.settings.mode) db.settings.mode = 'coach';
    Object.keys(db.profiles).forEach(function (id) {
      var p = db.profiles[id];
      if (!p.inv) p.inv = { 5: 4, 2.5: 8, 1.25: 4 };
      if (!p.notes) p.notes = {};
      if (!p.body) p.body = { weight: [], waist: [], tests: [] };
      ['weight', 'waist', 'chest', 'hips', 'arm', 'tests'].forEach(function (k) { if (!p.body[k]) p.body[k] = []; });
      if (!p.daily) p.daily = {};
      (p.sessions || []).forEach(function (s) { (s.sets || []).forEach(function (x) { if (!x.type) x.type = 'N'; }); });
    });
    return db;
  }

  return { stepOrder: stepOrder, restAfter: restAfter, estimateMins: estimateMins, readyAction: readyAction, alternatives: alternatives, nutrition: nutrition, weightTrend: weightTrend, foodAdvice: foodAdvice, isWork: isWork, INV: INV, stepFor: stepFor, capOf: capOf, dbCountOf: dbCountOf, setVolume: setVolume, sessionVolume: sessionVolume, plates: plates, warmups: warmups, records: records, prTypes: prTypes, muscleSets: muscleSets, streakWeeks: streakWeeks, monthReport: monthReport, orderItems: orderItems, migrate: migrate,
           planFor: planFor, totalLoad: totalLoad, metric: metric, metricLabel: metricLabel, history: history, bestOf: bestOf,
           suggest: suggest, machStep: machStep, isPR: isPR, plateau: plateau, fatigue: fatigue, weekKey: weekKey, weeklySets: weeklySets, rolling7: rolling7, STEP: STEP };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
