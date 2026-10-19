/* Рушій: розклад, метрики, підказки прогресії, рекорди, плато, втома. Без DOM — перевіряється в node. */
var ENGINE = (function () {
  var STEP = 2.5;

  function round1(x) { return Math.round(x * 10) / 10; }

  /* Сесія n (0, 1, 2…) → тиждень і тренування. Після 12 тижнів цикл повторюється з тижня 5. */
  function planFor(prog, n) {
    var wIdx = Math.floor(n / 3), cycle = 1, wk;
    if (wIdx < 12) wk = wIdx + 1;
    else { var r = wIdx - 12; cycle = 2 + Math.floor(r / 8); wk = 5 + (r % 8); }
    var slot = n % 3;
    var order = prog.week(wk);
    var wid = order[slot];
    return { n: n, week: wk, cycle: cycle, slot: slot, workout: wid, deload: prog.deload.indexOf(wk) >= 0, note: prog.note(wk) };
  }

  /* Навантаження на гантель у кг: гриф + диски. plates === null — без гантелі. */
  function totalLoad(ex, plates, handle, variant) {
    if (plates === null || plates === undefined || plates === '') return 0;
    var db = ex.db || 1;
    if (ex.variants && variant) for (var i = 0; i < ex.variants.length; i++) if (ex.variants[i].id === variant && ex.variants[i].db) db = ex.variants[i].db;
    return db * ((handle || 0) + Number(plates));
  }

  /* Показник підходу для графіка й рекордів — чесний для кожного типу:
     db — розрахунковий максимум (Епплі), band — рівень × повторення, решта — повторення або секунди. */
  function metric(ex, set, handle) {
    if (!set || !(set.reps > 0)) return 0;
    if (ex.type === 'db') { var L = totalLoad(ex, set.load, handle, set.variant); return round1(L * (1 + set.reps / 30)); }
    if (ex.type === 'band') return (Number(set.load) || 0) * set.reps;
    return set.reps;
  }
  function metricLabel(ex) {
    if (ex.type === 'db') return 'розрахунковий максимум, кг';
    if (ex.type === 'band') return 'рівень × повторення';
    if (ex.type === 'time') return 'секунди, кращий підхід';
    return 'повторення, кращий підхід';
  }

  /* Історія вправи: [{date, n, deload, sets:[…]}] за зростанням дати. */
  function history(profile, exId) {
    var out = [];
    (profile.sessions || []).forEach(function (s) {
      var sets = (s.sets || []).filter(function (x) { return x.ex === exId && x.reps > 0; });
      if (sets.length) out.push({ date: s.date, n: s.n, deload: !!s.deload, sets: sets });
    });
    return out;
  }
  function bestOf(ex, sets, handle) {
    var b = 0; sets.forEach(function (s) { var m = metric(ex, s, handle); if (m > b) b = m; }); return b;
  }

  /* Підказка на сьогодні за правилами прогресії програми. */
  function suggest(prog, exId, item, nSets, hist, handle, deload) {
    var ex = prog.ex[exId], cap = prog.cap || 20;
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
      fill(startLoad, max);
      out.note = 'Перший раз: підберіть ' + (ex.type === 'band' ? 'опір' : 'вагу') + ', щоб ' + (ex.type === 'time' ? max + ' с' : max + ' повторень') + ' давались із запасом 2–3.';
      return out;
    }
    var loads = last.map(function (s) { return s.load === undefined ? null : s.load; });
    var numeric = loads.filter(function (x) { return x !== null && x !== ''; }).map(Number);
    var Lmax = numeric.length ? Math.max.apply(null, numeric) : null;
    var atMax = last.filter(function (s) { return (s.load === null || s.load === undefined || s.load === '') ? Lmax === null : Number(s.load) === Lmax; });
    var allTop = last.length >= 1 && last.every(function (s) {
      var ok = s.reps >= max && (s.rir === undefined || s.rir === null || s.rir >= 1);
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
      var newL = Math.min(cap, Lmax + step);
      if (newL === Lmax) { fill(Lmax, max); out.note = 'Вага максимальна: темп 4 с, пауза внизу, +1 підхід або одна рука / нога.'; }
      else { fill(newL, min); out.note = 'Верхня межа взята: +' + String(newL - Lmax).replace('.', ',') + ' кг на гантель.'; }
      return out;
    }
    /* Змішані підходи: на новій вазі менше нижньої межі — перший підхід нова вага, решта стара;
       щоразу, коли підходи на новій вазі вдалися, на неї переходить ще один підхід. */
    var weak = atMax.filter(function (s) { return s.reps < min; }).length;
    var strong = atMax.length - weak;
    var lower = numeric.filter(function (x) { return x < Lmax; });
    if (weak > 0 || lower.length) {
      var prevL = lower.length ? Math.max.apply(null, lower) : Math.max(0, Lmax - STEP);
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
      (s.sets || []).forEach(function (x) { if (!(x.reps > 0)) return; var g = (prog.ex[x.ex] || {}).group || 'other'; map[k][g] = (map[k][g] || 0) + 1; });
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
  return { planFor: planFor, totalLoad: totalLoad, metric: metric, metricLabel: metricLabel, history: history, bestOf: bestOf,
           suggest: suggest, isPR: isPR, plateau: plateau, fatigue: fatigue, weekKey: weekKey, weeklySets: weeklySets, rolling7: rolling7, STEP: STEP };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
