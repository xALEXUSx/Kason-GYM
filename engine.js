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
  function isWork(x) { return !x.type || x.type === 'N' || x.type === 'F'; }
  function history(profile, exId, kind) {
    var out = [];
    (profile.sessions || []).forEach(function (s) {
      var sets = (s.sets || []).filter(function (x) { return x.ex === exId && x.reps > 0 && (kind === 'all' ? x.type !== 'W' : isWork(x)); });
      if (sets.length) out.push({ date: s.date, n: s.n, deload: !!s.deload, sets: sets });
    });
    return out;
  }
  function bestOf(ex, sets, handle) {
    var b = 0; sets.forEach(function (s) { var m = metric(ex, s, handle); if (m > b) b = m; }); return b;
  }

  /* Підказка на сьогодні за правилами прогресії програми. */
  function suggest(prog, exId, item, nSets, hist, handle, deload, stepIn) {
    var STEP = stepIn || 2.5;
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
  function stepFor(inv) { return (inv && inv[1.25] >= 4) ? 2.5 : 5; }
  function dbCountOf(ex, variant) {
    var db = ex.db || 1;
    if (ex.variants && variant) ex.variants.forEach(function (v) { if (v.id === variant && v.db) db = v.db; });
    return db;
  }
  /* Обсяг підходу, кг: усі гантелі × повторення (еспандер і без ваги — 0). */
  function setVolume(ex, set, handle) {
    if (!set || !(set.reps > 0) || set.type === 'W') return 0;
    if (ex.type === 'db' || (ex.type === 'dbopt' && set.load !== null && set.load !== undefined && set.load !== '')) return round1(totalLoad(ex, set.load, handle, set.variant) * set.reps);
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
  /* Розминка для головних вправ з гантелями: 50 % × 10 і 75 % × 5, вниз до кроку дисків. */
  function warmups(ex, workLoad, step) {
    if (ex.type !== 'db' || !(ex.main || ex.big) || workLoad === null || workLoad === undefined) return [];
    var w = Number(workLoad), st = step || 2.5;
    if (w <= 0) return [];
    var down = function (x) { return Math.max(0, Math.floor(x / st + 1e-9) * st); };
    if (w < 7.5) return [{ load: 0, reps: 10 }];
    var a = down(w * 0.5), b = down(w * 0.75);
    var out = [{ load: a, reps: 10 }];
    if (b > a && b < w) out.push({ load: b, reps: 5 });
    return out;
  }
  /* Рекорди вправи: найкращий розрахунковий максимум, найважчий підхід, найбільший обсяг за тренування, повторення на кожній вазі. */
  function records(ex, histAll, handle) {
    var r = { e1rm: null, heavy: null, vol: null, reps: {} };
    histAll.forEach(function (h) {
      var vol = 0;
      h.sets.forEach(function (x) {
        var m = metric(ex, x, handle);
        if (!r.e1rm || m > r.e1rm.v) r.e1rm = { v: m, date: h.date, set: x };
        if (ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load)) {
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
    if ((ex.type === 'db' || ex.type === 'dbopt') && set.load !== null && set.load !== undefined && set.load !== '') {
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
  /* Перехід даних з версії 1. */
  function migrate(db) {
    if (!db || !db.profiles) return db;
    db.v = 2;
    db.settings = db.settings || {};
    ['sound', 'haptics', 'awake'].forEach(function (k) { if (db.settings[k] === undefined) db.settings[k] = true; });
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

  return { isWork: isWork, INV: INV, stepFor: stepFor, dbCountOf: dbCountOf, setVolume: setVolume, sessionVolume: sessionVolume, plates: plates, warmups: warmups, records: records, prTypes: prTypes, muscleSets: muscleSets, streakWeeks: streakWeeks, monthReport: monthReport, orderItems: orderItems, migrate: migrate,
           planFor: planFor, totalLoad: totalLoad, metric: metric, metricLabel: metricLabel, history: history, bestOf: bestOf,
           suggest: suggest, isPR: isPR, plateau: plateau, fatigue: fatigue, weekKey: weekKey, weeklySets: weeklySets, rolling7: rolling7, STEP: STEP };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
