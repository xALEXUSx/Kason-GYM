var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Рушій: розклад, метрики, підказки прогресії, рекорди, плато, втома. Без DOM — перевіряється в node. */
var ENGINE = (function () {
  var STEP = 2.5;
  /* десятковий знак підказок: 2,5 — українською, 2.5 — англійською (у node — українська) */
  function dec(s) { return typeof I18N !== 'undefined' && I18N.lang === 'en' ? String(s) : String(s).replace('.', ','); }

  function round1(x) { return Math.round(x * 10) / 10; }

  /* Сесія n (0, 1, 2…) → тиждень і тренування. Після 12 тижнів цикл повторюється з тижня 5. */
  function planFor(prog, n) {
    /* номер тренування не буває відʼємним: тиждень назад («Більше») + видалене тренування з журналу давали n < 0 — і головний екран падав (до 3.13.1) */
    n = Math.max(0, Math.floor(Number(n)) || 0);
    var pw = prog.perWeek || 3;  // тренувань на тиждень (індивідуальна програма — 2…6; 5–6 — «верх / низ», з 3.27.0)
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
  function metricLabel(ex, units) { return unitize(units, metricLabel0(ex)); }
  function metricLabel0(ex) {
    if (ex.type === 'db' || ex.type === 'mach') return LL('розрахунковий максимум, кг', "estimated 1RM, kg");
    if (ex.type === 'band') return LL('рівень × повторення', "level × reps");
    if (ex.type === 'time') return LL('секунди, кращий підхід', "seconds, best set");
    return LL('повторення, кращий підхід', "reps, best set");
  }

  /* Історія вправи: [{date, n, deload, sets:[…]}] за зростанням дати. */
  function isWork(x) { return !x.type || x.type === 'N' || x.type === 'F' || x.type === 'M'; }
  function history(profile, exId, kind) {
    var out = [];
    (profile.sessions || []).forEach(function (s) {
      var sets = (s.sets || []).filter(function (x) { return x.ex === exId && x.reps > 0 && (kind === 'all' ? x.type !== 'W' : isWork(x)); });
      if (sets.length) out.push({ date: s.date, n: s.n, deload: !!s.deload, back: s.back || 0, short: !!s.short, place: s.place, sets: sets });  // short — коротка версія (з 3.25.0)  // place — де було (дім / зал); back — частка ваги тренування повернення після перерви
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
     дає подвійний крок, тож 40 → 50 → 60 — ще не доказ кроку 10. Від 1,25 до 20 кг; інакше — типовий крок.
     Тренування повернення після перерви не рахуються: їхню вагу підбирає застосунок частками від колишньої (25 → 5 → 15 — не крок 10). */
  function machStep(ex, hist) {
    var def = ex.step || 5, seen = {};
    (hist || []).forEach(function (h) { if (h.back) return; (h.sets || []).forEach(function (s) { var v = Number(s.load); if (s.type !== 'W' && v > 0) seen[Math.round(v * 10)] = 1; }); });
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
  /* ---------- повернення після перерви ----------
     Правила — Stronger by Science «Detraining» (Г. Нукольс; мета-аналіз Bosquet 2013):
     перерва коротша за місяць — «як довгий легкий тиждень»: вага на ≈ 20 % менша, далі — як звично;
     довша — 1-й тиждень ≈ третина колишньої ваги з тими самими підходами й повтореннями, без відмови (запас 3–4 і більше),
     далі щотижня більше; до колишньої ваги — за половину тривалості перерви.
     Молодші «можуть дозволити собі» близько місяця без тренувань, старші (60+, у джерелі — 60–65+) — близько двох тижнів:
     для них довге правило — вже з двох тижнів. Перерва — від 14 днів без жодного тренування (пропущений тиждень — ще ні).
     Перерва понад пів року рахується як пів року (в анкеті вона вже «новачок»): повернення — 13 тижнів, темп — як у новачка.
     Між 1-м тижнем і колишньою вагою — рівні щотижневі кроки (джерело радить 2-й тиждень «помацати» вагу із запасом 5,
     застосунок цього не бачить — бере рівний крок; узяли важче й упорались — наступного разу не менше за це). */
  function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
  function comeback(sessions, todayStr, age) {
    var seen = {};
    (sessions || []).forEach(function (x) { if (x && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') && x.date <= todayStr) seen[x.date] = 1; });
    var ds = Object.keys(seen).sort();
    if (!ds.length) return null;
    if (ds[ds.length - 1] < todayStr) ds.push(todayStr);  // сьогодні — день наступного тренування
    var older = Number(age) >= 60;
    for (var i = ds.length - 1; i >= 1; i--) {
      var off = dayDiff(ds[i - 1], ds[i]) - 1;  // днів без тренування
      if (off < 14) continue;
      var since = ds[i], k = Math.floor(dayDiff(since, todayStr) / 7) + 1, b;
      if (off < (older ? 14 : 30)) b = { kind: 'short', N: 1, f: 0.8 };
      else { var N = Math.max(2, Math.ceil(Math.min(off, 182) / 7 / 2)); b = { kind: 'long', N: N, f: Math.round((1 / 3 + (2 / 3) * (k - 1) / N) * 100) / 100 }; }
      if (k > b.N) return null;  // остання перерва вже позаду (раніші — тим паче)
      b.off = off; b.pre = ds[i - 1]; b.since = since; b.k = k; b.pct = Math.round(b.f * 100);
      return b;
    }
    return null;
  }
  /* База підказки: останнє тренування вправи; якщо воно — повернення, а до перерви було сильніше — те, що до перерви
     (після повернення — «далі як звично» від колишньої ваги). hold — так, підказка «як до перерви». */
  function baseOf(ex, hist, handle) {
    if (!hist.length) return { sets: null };
    var t = hist[hist.length - 1];
    if (!t.back) return { sets: t.sets };
    for (var j = hist.length - 2; j >= 0; j--) if (!hist[j].back) return bestOf(ex, hist[j].sets, handle) > bestOf(ex, t.sets, handle) ? { sets: hist[j].sets, hold: true } : { sets: t.sets };
    return { sets: t.sets };
  }
  /* Підказка тренування повернення: від останнього тренування до перерви (не тренування повернення — воно вже легше). */
  function backSuggest(ex, item, nSets, hist, handle, STEP, cap, back) {
    var pre = null, ret = null, i;
    for (i = hist.length - 1; i >= 0 && !pre; i--) if (hist[i].date <= back.pre && !hist[i].back) pre = hist[i];
    for (i = hist.length - 1; i >= 0 && !pre; i--) if (hist[i].date <= back.pre) pre = hist[i];
    if (!pre) return null;  // до перерви цієї вправи не було — звичайна підказка
    for (i = hist.length - 1; i >= 0; i--) if (hist[i].date >= back.since && hist[i].date > back.pre) { ret = hist[i]; break; }
    var min = item.min, max = item.max, out = { sets: [], note: '' }, ps = pre.sets;
    var head = back.kind === 'short' ? LL('Перший тиждень після перерви: ', "First week after a break: ") : LL('Повернення після перерви, тиждень ', "Back after a break, week ") + back.k + LL(' з ', " of ") + back.N + ': ';
    var nOf = function (s) { return s.load === null || s.load === undefined || s.load === '' ? null : Number(s.load); };
    if (ex.type === 'amrap') {
      for (i = 0; i < nSets; i++) out.sets.push({ load: null, reps: null });
      out.note = head + LL('скільки зможете, але без відмови — запас 3–4.', "as many as you can, but not to failure — RIR 3–4.");
      return out;
    }
    var heavy = ex.type === 'db' || ex.type === 'mach' || (ex.type === 'time' && ex.load) || ex.type === 'dbopt';
    var anyLoad = ps.some(function (s) { return nOf(s) !== null; });
    if (!heavy || !anyLoad) {
      /* без ваги (власна вага, петля, час, «без гантелі»): той самий варіант і рівень, нижня межа повторень */
      var Lb = null; ps.forEach(function (s) { var v = nOf(s); if (v !== null && (Lb === null || v > Lb)) Lb = v; });
      for (i = 0; i < nSets; i++) out.sets.push({ load: Lb, reps: min });
      out.note = head + LL('той самий ', "same ") + (ex.type === 'band' ? LL('опір', "resistance") : LL('варіант', "variation")) + LL(', нижня межа ', ", bottom of the ") + (ex.type === 'time' ? LL('часу', "time range") : LL('повторень', "rep range")) + LL(', запас 3–4.', ", RIR 3–4.");
      return out;
    }
    var hd = ex.type === 'mach' ? 0 : (Number(handle) || 0);
    for (i = 0; i < nSets; i++) {
      var r = ps[i] || ps[ps.length - 1], L = nOf(r);
      if (L === null) { out.sets.push({ load: null, reps: Math.max(min, Math.min(max, r.reps || min)) }); continue; }
      /* частка — від усієї ваги снаряда (гантель — разом із грифом), назад у диски на гриф; донизу на крок дисків чи тренажера */
      var x = back.f * (hd + L) - hd;
      x = Math.max(0, Math.round(Math.floor(Math.min(x, cap) / STEP + 1e-9) * STEP * 100) / 100);
      /* у попередньому тренуванні повернення взяли важче й упорались — не менше за те (до колишньої ваги) */
      var rs = ret && (ret.sets[i] || ret.sets[ret.sets.length - 1]), rl = rs ? nOf(rs) : null;
      if (rl !== null && rl > x && rl <= L && rs.reps >= min) x = rl;
      out.sets.push({ load: x, reps: Math.max(min, Math.min(max, r.reps || min)) });
    }
    out.note = head + (back.kind === 'short' ? LL('вага на ≈ 20 % менша', "weight ≈ 20% lower") : '≈ ' + back.pct + LL(' % колишньої ваги', " % of your previous weight")) + ', ' + (ex.type === 'time' ? LL('той самий час', "same time") : LL('ті самі повторення', "same reps")) + LL(', запас 3–4.', ", RIR 3–4.");
    return out;
  }
  /* кг із даних і текстів → «круглі» фунти: диски 1,25 → 2,5, 2,5 → 5, 5 → 10, 20 → 45; мале (темп ваги тіла) — до 0,5 lb */
  function lbNum(kg) { kg = Number(kg); if (!(kg > 0)) return 0; if (kg < 1.25) return Math.round(kg * LB * 2) / 2; if (kg < 2.5) return 2.5; return Math.round(kg * LB / 5) * 5; }
  /* текст із кілограмами й сантиметрами числами → фунти й дюйми: «5 кг» → «10 lb», «2,5–5 кг» → «5–10 lb», «гриф + 20» → «гриф + 45», «160 см» → «63 in» */
  function lbText(t) {
    if (typeof t !== 'string') return t;
    var num = function (x) { return Number(String(x).replace(',', '.')); }, show = function (x, comma) { var s = String(x); return comma ? s.replace('.', ',') : s; };
    return t.replace(/(\d+(?:[.,]\d+)?)\s?([–…-])\s?(−?)(\d+(?:[.,]\d+)?)(\s?)(кг|kg)(?![A-Za-zА-Яа-яІіЇїЄєҐґ])/g, function (m, a, dash, minus, b, sp) { var c = /,/.test(a + b); return show(lbNum(num(a)), c) + dash + minus + show(lbNum(num(b)), c) + sp + 'lb'; })
      .replace(/(\d+(?:[.,]\d+)?)(\s?)(кг|kg)(?![A-Za-zА-Яа-яІіЇїЄєҐґ])/g, function (m, a, sp) { return show(lbNum(num(a)), /,/.test(a)) + sp + 'lb'; })
      .replace(/(гриф|handle) \+ 20/g, '$1 + 45')
      .replace(/(\d+(?:[.,]\d+)?)(\s?)(см|cm)(?![A-Za-zА-Яа-яІіЇїЄєҐґ])/g, function (m, a, sp) { return Math.round(num(a) / 2.54) + sp + 'in'; });
  }
  /* одиниця ваги в текстах: програма у фунтах (prog.units === 'lb') — «кг»/«kg» → «lb» (числа вже у фунтах) */
  function unitize(units, t) { return units === 'lb' && typeof t === 'string' ? t.replace(/кг/g, 'lb').replace(/\bkg\b/g, 'lb') : t; }
  function suggest(prog, exId, item, nSets, hist, handle, deload, stepIn, back) {
    var r = suggest0(prog, exId, item, nSets, hist, handle, deload, stepIn, back);
    if (prog && prog.units === 'lb' && r && r.note) r.note = unitize('lb', r.note);
    return r;
  }
  /* Підказка на сьогодні за правилами прогресії програми. back — повернення після перерви (comeback), інакше нічого. */
  function suggest0(prog, exId, item, nSets, hist, handle, deload, stepIn, back) {
    var ex = prog.ex[exId];
    /* тренажер чи блок: крок — з ваг людини на ньому (machStep), межа — власна; гантелі — крок дисків і межа набору */
    var STEP = ex.type === 'mach' ? machStep(ex, hist) : (stepIn || 2.5), cap = ex.type === 'mach' ? (ex.cap || 300) : (prog.cap || 20);
    var min = item.min, max = item.max;
    var out = { sets: [], note: '' };
    if (back && back.f) { var bs = backSuggest(ex, item, nSets, hist, handle, STEP, cap, back); if (bs) return bs; }
    var base = baseOf(ex, hist, handle), last = base.sets;
    var i;
    function fill(load, reps) { for (i = 0; i < nSets; i++) out.sets.push({ load: load, reps: reps }); }

    if (ex.type === 'amrap') {
      var bestA = 0; if (last) last.forEach(function (s) { if (s.reps > bestA) bestA = s.reps; });
      fill(null, bestA ? bestA + 1 : null);
      out.note = LL('Скільки зможете, запас 2', "As many as you can, 2 RIR") + (bestA ? LL(' · минулого разу найкраще ', " · best last time: ") + bestA : '');
      return out;
    }
    if (!last) {
      var startLoad = (ex.type === 'bw' || (ex.type === 'time' && !ex.load)) ? null : (ex.start === undefined ? null : ex.start);
      /* стартова вага — не більша за межу набору й кратна кроку дисків (інакше її не зібрати) */
      if (startLoad !== null && (ex.type === 'db' || ex.type === 'mach' || ex.type === 'time')) startLoad = Math.max(0, Math.floor(Math.min(startLoad, cap) / STEP + 1e-9) * STEP);
      fill(startLoad, max);
      var aim = ex.type === 'time' ? max + LL(' с', " sec") : max + LL(' повторень', " reps");
      out.note = startLoad === null ? LL('Перший раз: ', "First time: ") + aim + LL(' із запасом 2–3', " with 2–3 in reserve") + (ex.type === 'dbopt' ? LL(', без гантелі', ", no dumbbell") : '') + LL('; важко — легший варіант.', "; too hard — use an easier variation.")
        : LL('Перший раз: підберіть ', "First time: pick a ") + (ex.type === 'band' ? LL('опір', "resistance") : LL('вагу', "weight")) + LL(', щоб ', " so ") + aim + LL(' давались із запасом 2–3.', " leave 2–3 in reserve.");
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
      out.note = LL('Легкий тиждень: та сама вага (або на крок нижча), запас 3–4.', "Deload week: same weight (or one step lower), RIR 3–4.");
      return out;
    }
    /* повернення позаду — знову як до перерви: ті самі вага й повторення, далі прогресія як звично */
    if (base.hold) {
      for (i = 0; i < nSets; i++) { var h0 = last[i] || last[last.length - 1]; out.sets.push({ load: h0.load === undefined ? null : h0.load, reps: Math.max(min, Math.min(max, h0.reps || min)) }); }
      out.note = LL('Повернення після перерви позаду: вага й повторення — як до перерви.', "Comeback after the break is done: weight and reps — same as before the break.");
      return out;
    }

    if (ex.type === 'band') {
      if (allTop) { fill(Lmax, min); out.note = LL('Верхня межа взята: відступіть далі від дверей або +1 рівень.', "Top of the range reached: step farther from the door or go up 1 level."); }
      else { for (i = 0; i < nSets; i++) out.sets.push({ load: Lmax, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 1) }); out.note = LL('Той самий опір, +1 повторення.', "Same resistance, +1 rep."); }
      return out;
    }
    if (ex.type === 'bw') {
      if (allTop) { fill(null, max); out.note = LL('Верхня межа взята: переходьте на складніший варіант.', "Top of the range reached: move to a harder variation."); }
      else { for (i = 0; i < nSets; i++) out.sets.push({ load: null, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 1) }); out.note = LL('+1 повторення.', "+1 rep."); }
      return out;
    }
    if (ex.type === 'time') {
      if (allTop) {
        if (ex.load && Lmax !== null) { var nl = Math.min(cap, Lmax + STEP); fill(nl, min); out.note = nl > Lmax ? LL('Верхня межа взята: +2,5 кг.', "Top of the range reached: +2.5 kg.") : LL('Вага максимальна: довше або повільніше.', "Max weight: go longer or slower."); }
        else { fill(Lmax, max); out.note = LL('Верхня межа взята: складніший варіант.', "Top of the range reached: harder variation."); }
      } else { for (i = 0; i < nSets; i++) out.sets.push({ load: Lmax, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 5) }); out.note = LL('+5 секунд.', "+5 seconds."); }
      return out;
    }
    /* db і dbopt */
    if (ex.type === 'dbopt' && Lmax === null) {
      if (allTop) { fill(0, min); out.note = LL('Без ваги вже легко: візьміть гриф без дисків в іншу руку.', "Bodyweight is easy now: hold a bare handle (no plates) in your other hand."); }
      else { for (i = 0; i < nSets; i++) out.sets.push({ load: null, reps: Math.min(max, ((last[i] || last[last.length - 1]).reps || min) + 1) }); out.note = LL('+1 повторення.', "+1 rep."); }
      return out;
    }
    if (allTop) {
      var step = (ex.big && last.every(function (s) { return s.reps >= max + 2; })) ? 2 * STEP : STEP;
      var newL = Math.round(Math.min(cap, Lmax + step) * 100) / 100;  // крок 4,5 чи 6,8 — без хвостів 18,099999
      if (newL === Lmax) { fill(Lmax, max); out.note = LL('Вага максимальна: темп 4 с, пауза внизу, +1 підхід або одна рука / нога.', "Max weight: 4-sec tempo, pause at the bottom, +1 set, or one arm / leg."); }
      else { fill(newL, min); out.note = LL('Верхня межа взята: +', "Top of the range reached: +") + dec(Math.round((newL - Lmax) * 100) / 100) + (ex.type === 'mach' ? LL(' кг.', " kg.") : LL(' кг на гантель.', " kg per dumbbell.")); }
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
        out.note = LL('Усі підходи — на новій вазі.', "All sets at the new weight.");
      } else {
        for (i = 0; i < nSets; i++) {
          var r0 = last[i] || last[last.length - 1];
          out.sets.push(i < keep ? { load: Lmax, reps: min } : { load: prevL, reps: Math.min(max, (r0.reps || min) + 1) });
        }
        out.note = LL('Змішані підходи: ', "Mixed sets: ") + keep + LL(' — нова вага, решта — попередня.', " at the new weight, the rest at the previous one.");
      }
      return out;
    }
    for (i = 0; i < nSets; i++) {
      var ref = last[i] || last[last.length - 1];
      var L = (ref.load === null || ref.load === undefined || ref.load === '') ? Lmax : Number(ref.load);
      out.sets.push({ load: L, reps: Math.min(max, (ref.reps || min) + 1) });
    }
    out.note = LL('Та сама вага, +1 повторення в кожному підході.', "Same weight, +1 rep in every set.");
    return out;
  }

  /* Рекорд: показник підходу більший за все, що було раніше (потрібна хоча б одна попередня сесія). */
  function isPR(ex, set, hist, handle) {
    if (!hist.length) return false;
    var prev = 0; hist.forEach(function (h) { var b = bestOf(ex, h.sets, handle); if (b > prev) prev = b; });
    return metric(ex, set, handle) > prev;
  }

  /* Плато: 4+ сесій (без легких і повернення), останні 3 не перевищили найкращого до них. */
  function plateau(ex, hist, handle) {
    var h = hist.filter(function (x) { return !x.deload && !x.back && !x.short; });  // з 3.25.0 — і коротка версія (1–2 підходи); легкі тижні й повернення після перерви — легші за задумом
    if (h.length < 4) return false;
    var before = 0, recent = 0;
    h.slice(0, h.length - 3).forEach(function (x) { before = Math.max(before, bestOf(ex, x.sets, handle)); });
    h.slice(-3).forEach(function (x) { recent = Math.max(recent, bestOf(ex, x.sets, handle)); });
    return before > 0 && recent <= before;
  }

  /* Втома: у кожній з двох останніх (не легких і не повернення) сесій ≥ 2 головні вправи гірші, ніж минулого разу. */
  function fatigue(prog, profile, handle) {
    var ss = (profile.sessions || []).filter(function (s) { return !s.deload && !s.back && !s.short; });  // коротка версія (з 3.25.0) — 1–2 підходи, не рівня
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
  /* Привітання за годиною на годиннику телефона (місцевий час): ніч 23:00–4:59, ранок 5:00–11:59, день 12:00–17:59, вечір 18:00–22:59.
     До 3.12.2 ночі не було — о 2-й ночі писало «Доброго ранку». */
  function greeting(h) { return h >= 23 || h < 5 ? LL('Доброї ночі', "Good evening") : h < 12 ? LL('Доброго ранку', "Good morning") : h < 18 ? LL('Доброго дня', "Good afternoon") : LL('Доброго вечора', "Good evening"); }
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
  /* фунти (з 3.18.0, слово Alexа 23.10: «має бути і те і те, давати на вибір»): диски 10 / 5 / 2,5 lb — набір у тих самих кількостях;
     уся вага тренувань профілю — у його одиницях (lb), тож рушій рахує ті самі числа, лише розміри дисків — з набору людини */
  var INV_LB = { 10: 4, 5: 8, 2.5: 4 };
  var LB = 2.20462262;
  /* розміри дисків набору (за зростанням); порожній набір — кілограмові */
  function sizesOf(inv) { var k = Object.keys(inv || {}).map(Number).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; }); return k.length ? k : [1.25, 2.5, 5]; }
  /* Крок ваги на гантель — подвоєний найменший диск, якого вистачає на обидва боки обох гантелей (4 шт.);
     з дисками 1,25 — 2,5 кг, з 2,5 — 5 кг, лише з 5 — 10 кг (фунти: 2,5 → 5 lb, 5 → 10 lb). Без жодної четвірки — за парою (одна гантель);
     без пари — подвоєний середній диск набору. */
  function stepFor(inv) {
    inv = inv || {};
    var z = sizesOf(inv), four = z.filter(function (s) { return inv[s] >= 4; })[0], two = z.filter(function (s) { return inv[s] >= 2; })[0];
    return 2 * (four || two || z[Math.min(1, z.length - 1)]);
  }
  /* Найбільша вага дисків на гриф, яку можна зібрати з набору: для двох гантелей (а якщо на дві дисків не вистачає — для однієї). */
  function capOf(inv) {
    var two = 0, one = 0;
    sizesOf(inv).slice().reverse().forEach(function (s) { var n = Number((inv || {})[s]) || 0; two += Math.floor(n / 4) * 2 * s; one += Math.floor(n / 2) * 2 * s; });
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
  function plates(load, inv, dbCount, cap, units) {
    inv = inv || INV; cap = cap || 20;
    if (load === null || load === undefined || load === '') return { ok: true, side: [], text: LL('без гантелі', "no dumbbell") };
    load = Number(load);
    if (load === 0) return { ok: true, side: [], text: LL('лише гриф', "handle only") };
    if (load > cap) return { ok: false, side: [], text: LL('понад межу ', "over the limit of ") + cap + unitize(units, LL(' кг на гриф', " kg per handle")) };
    /* рахуємо в чвертях кілограма, щоб не було похибок заокруглення */
    var per = Math.round(load * 2), sizes = sizesOf(inv).slice().reverse().map(function (s) { return [s, Math.round(s * 4)]; }), side = [], k = 2 * (dbCount || 1);
    sizes.forEach(function (z) {
      var avail = Math.floor((inv[z[0]] || 0) / k);
      while (avail > 0 && per >= z[1]) { side.push(z[0]); per -= z[1]; avail--; }
    });
    if (per > 0) return { ok: false, side: side, text: LL('не зібрати з вашого набору', "can’t be made with your plates") };
    return { ok: true, side: side, text: side.map(function (x) { return dec(x); }).join(' + ') };
  }
  /* Розминка для головних вправ з гантелями — за схемою програми (наприклад, 1 × 12 з половинною вагою).
     mstep — крок тренажера в залі людини (machStep); без нього — типовий крок тренажера. */
  function warmups(ex, workLoad, step, scheme, mstep) {
    if ((ex.type !== 'db' && ex.type !== 'mach') || !(ex.main || ex.big) || workLoad === null || workLoad === undefined) return [];
    var w = Number(workLoad), st = ex.type === 'mach' ? (mstep || ex.step || 5) : (step || 2.5), sc = scheme || { pct: [0.5], reps: [12] };
    if (w <= 0) return [];
    var down = function (x) { return Math.max(0, Math.round(Math.floor(x / st + 1e-9) * st * 100) / 100); };
    var out = [];
    /* 0 на гантелі — сам гриф; на тренажері 0 кг не буває — такої розминки немає (легка вага повернення після перерви) */
    sc.pct.forEach(function (pc, i) { var L = down(w * pc); if (ex.type === 'mach' && L <= 0) return; if (!out.length || L > out[out.length - 1].load) out.push({ load: L, reps: sc.reps[i] }); });
    return out;
  }
  /* Харчування: Міффлін — Сан Жеор × 1,45; мета «схуднення» — мінус дефіцит; білок — від вказаної цільової ваги, інакше — від поточної,
     але не вище ваги для ІМТ 30 (огляд Amsterdam UMC «Protein requirement in obesity»: надлишок жиру понад ІМТ 30 у розрахунку білка не враховують).
     До 3.20.0 без цільової ваги брали вагу для ІМТ 27,5 — без джерела, і людям зі звичайною вагою білок виходив більшим, ніж від власної ваги
     (жінка 170 см і 60 кг — від 79,5 кг). */
  function nutrition(food, me, weight) {
    if (!food || !me || !(me.age > 0) || !(me.height > 0) || !(weight > 0)) return null;
    var bmr = 10 * weight + 6.25 * me.height - 5 * me.age + (me.sex === 'f' ? -161 : 5);
    /* межі безпеки (з 3.20.0, контрольний аудит 23.10): ІМТ < 18,5 (недостатня вага, ВООЗ) — без дефіциту; зі схудненням калорії — не нижче
       1200 на день для жінок і 1500 для чоловіків без нагляду лікаря (Harvard Health, «Calorie counting made easy») — дефіцит зменшується
       до цієї межі, а якщо й так нижче — калорії підтримки. До аудиту жінка 70 років, 150 см, 45 кг з метою «схуднути» отримувала 900–1100 ккал. */
    var tdee = bmr * 1.45, def = food.deficit || 0, guard = '', bmi = weight / Math.pow(me.height / 100, 2), floor = me.sex === 'f' ? 1200 : 1500;
    if (def > 0 && bmi < 18.5) { def = 0; guard = 'under'; }
    if (def > 0 && tdee * (1 - def) - 100 < floor) { def = Math.max(0, 1 - (floor + 100) / tdee); guard = def > 0 ? 'floor' : 'floor0'; }
    var mid = tdee * (1 - def);
    var r50 = function (x) { return Math.round(x / 50) * 50; }, r10 = function (x) { return Math.round(x / 10) * 10; };
    var cap = Math.round(30 * Math.pow(me.height / 100, 2) * 10) / 10, capped = weight > cap;
    var own = food.basis === 'target' && me.target > 0;
    var base = own ? me.target : Math.min(weight, cap);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kLo: r50(mid - 100), kHi: r50(mid + 100), pLo: r10(food.protein[0] * base), pHi: r10(food.protein[1] * base), base: base, target: own ? me.target : null, cap: cap, capped: !own && capped, def: Math.round(def * 1000) / 1000, guard: guard, floor: floor };
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
  /* Підказка за темпом: схуднення −0,5…−1 кг/тиж; швидше за 1 кг — +200 ккал; 2 тижні стоїть — −200 ккал. Підтримка — ±0,25 кг/тиж.
     З 3.19.0: набір мʼязів — +0,25…0,5 % ваги на тиждень (Iraki та ін. 2019, новачки й середній рівень); до 3.19.0 набір ішов гілкою
     підтримки — і на +0,3 кг/тиж радив «заберіть». Рекомпозиція (схуднути + мʼязи) — до −0,5 % на тиждень (нижня межа Helms та ін. 2014):
     швидше — +150–200 ккал; вага стоїть чи повільно йде — норма (жир іде, мʼязи ростуть — дивитися талію); росте — −150–200 ккал. */
  function foodAdvice(food, trend) {
    if (!trend || trend.rate === null) return { k: 'wait', text: LL('Для підказки потрібні зважування за 2 тижні.', "A tip needs 2 weeks of weigh-ins.") };
    var r = trend.rate, pct = trend.now > 0 ? r / trend.now * 100 : null;  // темп у % ваги на тиждень
    if (food.goal === 'gain' && pct !== null) {
      if (pct > 0.5) return { k: 'less', text: LL('Набираєте швидше за 0,5 % ваги на тиждень — більше піде в жир: заберіть ≈ 150–200 ккал на день.', "You’re gaining more than 0.5% of your weight a week — more of it goes to fat: cut ≈ 150–200 kcal a day.") };
      if (pct < 0.25) return { k: 'more', text: LL('Набираєте повільніше за план (+0,25…0,5 % ваги на тиждень) — додайте ≈ 150–200 ккал на день.', "You’re gaining slower than planned (+0.25…0.5% of your weight a week) — add ≈ 150–200 kcal a day.") };
      return { k: 'ok', text: LL('Темп набору в нормі (+0,25…0,5 % ваги на тиждень) — нічого не міняйте.', "Your rate of gain is on track (+0.25…0.5% of your weight a week) — don’t change anything.") };
    }
    if (food.goal === 'recomp' && pct !== null) {
      if (pct < -0.5) return { k: 'more', text: LL('Худнете швидше за 0,5 % ваги на тиждень — мʼязам бракує енергії: додайте ≈ 150–200 ккал на день.', "You’re losing more than 0.5% of your weight a week — your muscles are short on energy: add ≈ 150–200 kcal a day.") };
      if (r > 0.25) return { k: 'less', text: LL('Вага росте — заберіть ≈ 150–200 ккал на день.', "Weight is going up — cut ≈ 150–200 kcal a day.") };
      return { k: 'ok', text: LL('Вага стоїть або повільно йде — для «менше жиру й більше мʼязів» це норма. Стежте за талією в «Замірах».', "Your weight is steady or dropping slowly — that’s normal when losing fat and building muscle. Keep an eye on your waist in “Measurements.”") };
    }
    if (food.goal === 'loss' && pct !== null) {  // з 3.20.0 — у % ваги (Helms та ін. 2014: −0,5…−1 % на тиждень); до того −0,5…−1 кг для всіх
      if (pct < -1) return { k: 'more', text: LL('Худнете швидше за 1 % ваги на тиждень — мʼязам бракує енергії: додайте ≈ 200 ккал на день.', "You’re losing more than 1% of your weight a week — your muscles are short on energy: add ≈ 200 kcal a day.") };
      if (pct > 0.2) return { k: 'less', text: LL('Вага росте, а мета — схуднути: заберіть ≈ 200 ккал на день.', "Your weight is going up, but your goal is to lose weight — cut ≈ 200 kcal a day.") };  // до 3.20.0 тут казало «стоїть»
      if (pct > -0.2) return { k: 'less', text: LL('Вага стоїть 2 тижні — заберіть ≈ 200 ккал на день.', "Weight hasn’t moved in 2 weeks — cut ≈ 200 kcal a day.") };
      if (pct > -0.5) return { k: 'slow', text: LL('Худнете повільніше за план (−0,5…−1 % ваги на тиждень). Якщо так ще тиждень — заберіть ≈ 200 ккал.', "You’re losing slower than planned (−0.5…−1% of your weight a week). If it stays like this another week, cut ≈ 200 kcal.") };
      return { k: 'ok', text: LL('Темп у нормі (−0,5…−1 % ваги на тиждень) — нічого не міняйте.', "Rate is on track (−0.5…−1% of your weight a week) — don’t change anything.") };
    }
    if (food.goal === 'loss') {
      if (r < -1) return { k: 'more', text: LL('Худнете швидше за 1 кг на тиждень — додайте ≈ 200 ккал на день.', "You’re losing more than 1 kg a week — add ≈ 200 kcal a day.") };
      if (r > 0.2) return { k: 'less', text: LL('Вага росте, а мета — схуднути: заберіть ≈ 200 ккал на день.', "Your weight is going up, but your goal is to lose weight — cut ≈ 200 kcal a day.") };
      if (r > -0.2) return { k: 'less', text: LL('Вага стоїть 2 тижні — заберіть ≈ 200 ккал на день.', "Weight hasn’t moved in 2 weeks — cut ≈ 200 kcal a day.") };
      if (r > -0.5) return { k: 'slow', text: LL('Худнете повільніше за план (−0,5…−1 кг на тиждень). Якщо так ще тиждень — заберіть ≈ 200 ккал.', "You’re losing slower than planned (−0.5…−1 kg a week). If it stays that way another week, cut ≈ 200 kcal.") };
      return { k: 'ok', text: LL('Темп у нормі (−0,5…−1 кг на тиждень) — нічого не міняйте.', "Rate is on track (−0.5…−1 kg a week) — don’t change anything.") };
    }
    if (r > 0.25) return { k: 'less', text: LL('Вага росте — заберіть ≈ 150–200 ккал на день.', "Weight is going up — cut ≈ 150–200 kcal a day.") };
    if (r < -0.25) return { k: 'more', text: LL('Вага падає — додайте ≈ 150–200 ккал на день.', "Weight is dropping — add ≈ 150–200 kcal a day.") };
    return { k: 'ok', text: LL('Вага стабільна — калорії підходять.', "Weight is stable — your calories are right.") };
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
  /* ---------- залучення (з 3.24.0; слово Alexа 25.10: «Роби в такому порядку: А → Б → В → Г»; план тренувань ці функції не змінюють) ---------- */
  var noonKey = function (d) { return d.toISOString().slice(0, 10); };  // дата з полудня місцевого часу (як weekKey)
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  /* Серія тижнів поспіль із тренуванням (поточний тиждень не обриває серію, доки не скінчився). З 3.24.0 (пункт 2) — запасний тиждень:
     кожні 4 тижні поспіль з тренуванням дають 1 запасний (не більше 1 у запасі); тиждень без тренувань забирає запасний, і серія не рветься,
     без запасного — рветься. Обірвана серія знижує охоту продовжувати, менше — коли її можна «полагодити» (Silverman, Barasch, JCR 2023);
     «амулет вихідних» Duolingo: +4 % повернень через тиждень, −5 % втрат серії (блог Duolingo).
     → { run — тижнів з тренуванням у серії, spare — запасних (0 або 1), saved — тижні, які врятував запасний, since — перший тиждень серії } */
  var SPARE_EVERY = 4, SPARE_MAX = 1;
  function streakInfo(sessions, todayStr) {
    var set = {}; (sessions || []).forEach(function (s) { if (s && s.date && s.date <= todayStr) set[weekKey(s.date)] = 1; });
    var keys = Object.keys(set).sort(), out = { run: 0, spare: 0, saved: [], since: null };
    if (!keys.length) return out;
    var cur = weekKey(todayStr), d = new Date(keys[0] + 'T12:00:00');
    for (var k = noonKey(d); k <= cur; d.setDate(d.getDate() + 7), k = noonKey(d)) {
      if (set[k]) { if (!out.run) out.since = k; out.run++; if (out.run % SPARE_EVERY === 0 && out.spare < SPARE_MAX) out.spare++; }
      else if (k !== cur) { if (out.run && out.spare) { out.spare--; out.saved.push(k); } else out = { run: 0, spare: 0, saved: [], since: null }; }
    }
    return out;
  }
  function streakWeeks(sessions, todayStr) { return streakInfo(sessions, todayStr).run; }
  /* крок серії за тренуваннями в порядку дат (віхи й підсумок року): st = { wk, run, spare }, k — тиждень тренування.
     Тижні без тренувань між цим і попереднім забирають запасні; не вистачило — серія з 1. Те саме правило, що в streakInfo. → false, коли тиждень той самий */
  function runStep(st, k) {
    if (k === st.wk) return false;
    var gap = st.wk ? Math.round((new Date(k + 'T12:00:00').getTime() - new Date(st.wk + 'T12:00:00').getTime()) / 864e5 / 7) - 1 : -1;
    if (gap === 0 || (gap > 0 && st.spare >= gap)) { if (gap > 0) st.spare -= gap; st.run++; } else { st.run = 1; st.spare = 0; }
    if (st.run % SPARE_EVERY === 0 && st.spare < SPARE_MAX) st.spare++;
    st.wk = k; return true;
  }
  /* Пропуск (пункт 14): заплановані дні тренувань (дні людини) після останнього тренування й до сьогодні, коли тренування не було.
     Найкращою з 54 програм мегадослідження (Milkman та ін., Nature 2021; 61 293 відвідувачі залів) була мікровинагорода саме за повернення
     після пропущеного тренування. → { missed — скільки пропущено, last — дата останнього тренування } або null */
  function missedDays(sessions, days, todayStr) {
    var all = (sessions || []).map(function (s) { return s && s.date; }), ds = all.filter(function (x) { return x && x < todayStr; }).sort();
    if (!ds.length || !days || !days.length || all.indexOf(todayStr) >= 0) return null;  // сьогодні вже тренувались — повернення вже зараховане
    var last = ds[ds.length - 1], n = 0, d = new Date(last + 'T12:00:00');
    for (var i = 0; i < 400; i++) { d.setDate(d.getDate() + 1); if (noonKey(d) >= todayStr) break; if (days.indexOf(d.getDay()) >= 0) n++; }
    return n ? { missed: n, last: last } : null;
  }
  /* Відновлення мʼязів (пункт 1): години від останнього тренування, де мʼяз отримав ≥ 1 «дробовий» підхід (основний мʼяз 1, допоміжний 0,5;
     розминкові не рахуються). До 48 год — «відпочиває» (ACSM 2011, Garber та ін., MSSE 43(7): основні групи мʼязів — 2–3 дні на тиждень,
     щонайменше 48 год між тренуваннями тих самих груп), далі — «готовий». Орієнтир, не діагноз; план від цього не змінюється.
     Час тренування — мітка збереження (id), якщо вона того самого дня, інакше 18:00 дня тренування. → { мʼяз: { h, rest, left } } */
  var REST_H = 48;
  function sessTime(s) { var d = new Date(s.id || 0); return s.id && noonKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)) === s.date ? s.id : new Date(s.date + 'T18:00:00').getTime(); }
  function recovery(prog, sessions, nowMs) {
    var last = {}, out = {};
    (sessions || []).forEach(function (s) {
      if (!s || !s.date) return;
      var t = sessTime(s), f = {};
      if (t > nowMs) return;
      (s.sets || []).forEach(function (x) { if (!(x.reps > 0) || x.type === 'W') return; var e = prog.ex[x.ex]; if (!e || !e.m) return;
        (e.m.p || []).forEach(function (m) { f[m] = (f[m] || 0) + 1; }); (e.m.s || []).forEach(function (m) { f[m] = (f[m] || 0) + 0.5; }); });
      Object.keys(f).forEach(function (m) { if (f[m] >= 1 && (!last[m] || last[m] < t)) last[m] = t; });
    });
    Object.keys(last).forEach(function (m) { var h = Math.max(0, (nowMs - last[m]) / 36e5); out[m] = { h: Math.floor(h), rest: h < REST_H, left: Math.max(0, Math.ceil(REST_H - h)) }; });
    return out;
  }
  /* Виклик місяця (пункт 4) з власної історії — як щомісячні виклики Apple Fitness (за спільнотою Apple — під історію людини), але не більше
     за план: ціль = минулий місяць + 1 (минулого не було — половина запланованого), не більше запланованих днів місяця (від першого
     тренування, якщо воно цього місяця). Подарований старт (пункт 18; Nunes, Drèze 2006: 34 % проти 19 %): тренування, зроблені цього місяця до появи виклику, —
     уже зараховані (справжні, не вигадані). → { target, done, planned, prev, left, met } або null */
  function monthPlanned(days, ym, fromStr) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1, n = 0, nd = new Date(y, m + 1, 0).getDate();
    for (var d = 1; d <= nd; d++) { var dt = new Date(y, m, d, 12), k = noonKey(dt); if (fromStr && k < fromStr) continue; if (days.indexOf(dt.getDay()) >= 0) n++; }
    return n;
  }
  function prevYm(ym) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1; var d = new Date(y, m - 1, 15); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthChallenge(sessions, days, ym) {
    if (!days || !days.length) return null;
    var ss = (sessions || []).filter(function (s) { return s && s.date; }), first = ss.map(function (s) { return s.date; }).sort()[0];
    var planned = monthPlanned(days, ym, first && first.slice(0, 7) === ym ? first : null);
    if (!planned) return null;
    var done = ss.filter(function (s) { return s.date.slice(0, 7) === ym; }).length, prev = ss.filter(function (s) { return s.date.slice(0, 7) === prevYm(ym); }).length;
    var target = Math.min(planned, prev ? prev + 1 : Math.ceil(planned / 2));
    return { target: target, done: done, planned: planned, prev: prev, left: Math.max(0, target - done), met: done >= target };
  }
  /* Підсумок минулого тижня (пункт 5): тренування з запланованих, рекорди, хвилини, ккал (як у підсумку тренування). → об'єкт або null */
  function weekSummary(profile, prog, todayStr) {
    var cur = weekKey(todayStr), d = new Date(cur + 'T12:00:00'); d.setDate(d.getDate() - 7); var wk = noonKey(d);
    var ss = (profile.sessions || []).filter(function (s) { return s && s.date && weekKey(s.date) === wk; });
    var kc = kcalSum(profile, ss);  // як «Цього тижня» на головній (до 3.24.0-чернетки тут додавався обʼєкт — ккал виходили порожніми)
    return { week: wk, n: ss.length, planned: prog.perWeek || (profile.days || []).length || 3, prs: ss.reduce(function (a, s) { return a + (s.prs || 0); }, 0),
      mins: ss.reduce(function (a, s) { return a + (s.mins || 0); }, 0), kcal: kc ? kc.total : null, streak: streakInfo(profile.sessions, todayStr) };  // хвилини — тривалість, як «Цього тижня» на головній
  }
  /* Коротка версія тренування (з 3.25.0, пункт 15; слово Alexа 25.10: «Роби в такому порядку: А → Б → В → Г», група В — «коротка версія 20 хв
     (кожна велика група ≥ 1 вправа)»; план «якщо — то»: метааналіз 26 досліджень — ефект 0,31 одразу і 0,24 згодом, сильніший, коли план
     враховує перешкоди): з сьогоднішнього тренування й іншого (А ↔ Б) — найменше вправ, щоб кожна велика група мʼязів, яка є в програмі
     (квадрицепс, задня поверхня стегна, сідниці, спина, груди, плечі, біцепс, трицепс, прес — як у сторожі основи), мала ≥ 1 вправу як основний мʼяз.
     Спершу — вправи сьогоднішнього тренування, що покривають найбільше груп; чого в ньому немає — з іншого. Порядок — як у тренуваннях. → вправи (it) */
  var SHORT_GROUPS = { quads: ['quads'], hams: ['hams'], glutes: ['glutes'], back: ['lats'], chest: ['chest'], shoulders: ['delts'], biceps: ['biceps'], triceps: ['triceps'], abs: ['abs', 'obliques'] };
  function shortPick(prog, wid, W) {
    /* «верх / низ» (з 3.27.0): іншої половини не додаємо — вона наступна в розкладі, а тим самим мʼязам потрібно ≥ 48 год */
    var other = wid === 'A' ? 'B' : wid === 'B' ? 'A' : null, today = ((W || {})[wid] || {}).items || [], alt = other ? ((W[other] || {}).items || []) : [];
    var gOf = function (it) { var m = (prog.ex[it.ex] || {}).m || {}; return Object.keys(SHORT_GROUPS).filter(function (g) { return (m.p || []).some(function (x) { return SHORT_GROUPS[g].indexOf(x) >= 0; }); }); };
    var left = [], out = [];
    today.concat(alt).forEach(function (it) { gOf(it).forEach(function (g) { if (left.indexOf(g) < 0) left.push(g); }); });
    [today, alt].forEach(function (pool) {
      for (;;) {
        var best = null, bn = 0;
        pool.forEach(function (it) { if (out.indexOf(it) >= 0 || out.some(function (o) { return o.ex === it.ex; })) return; var n = gOf(it).filter(function (g) { return left.indexOf(g) >= 0; }).length; if (n > bn) { bn = n; best = it; } });
        if (!best) break;
        out.push(best); left = left.filter(function (g) { return gOf(best).indexOf(g) < 0; });
      }
    });
    return out;
  }
  /* підходи короткої версії: кожній вправі 1, другий — спершу базовим (не ізоляція), потім решті — поки оцінка тривалості (estimateMins, без розминки)
     ≤ SHORT_MIN хв; легкий тиждень — по 1. Замір на всіх анкетах (25.10): медіана 19 хв, найдовша 20, найкоротша 14. → { id вправи: підходів } */
  var SHORT_MIN = 20;
  function shortSets(prog, picks, pairs, deload) {
    var items = orderItems(picks, pairs || []).map(function (o) { return { ex: o.it.ex, ss: o.ss, rest: o.it.rest, sets: [{ type: 'N' }] }; });
    if (!deload) items.map(function (x, i) { return i; }).sort(function (i, j) { return ((prog.ex[items[i].ex] || {}).iso ? 1 : 0) - ((prog.ex[items[j].ex] || {}).iso ? 1 : 0) || i - j; })
      .forEach(function (i) { items[i].sets.push({ type: 'N' }); if (estimateMins(prog, items) > SHORT_MIN) items[i].sets.pop(); });
    var n = {}; items.forEach(function (x) { n[x.ex] = x.sets.length; }); return n;
  }
  /* Підсумок року (пункт 20; як Spotify Wrapped — історія з картками, якою діляться): усе з історії тренувань, без збереженого стану.
     y — 'YYYY'. Приріст — як у звіті місяця: найкраще до року проти найкращого в році; почали цього року — перший місяць тренувань проти решти року.
     → { year, sessions, mins, kcal, prs, sets, volume, weeks, bestRun, months, rets, top: [{ id, sets }], gains: [{ id, pct }], muscles: [[мʼяз, підходи]] } або null */
  function yearSummary(profile, prog, y, handle) {
    var all = (profile.sessions || []).filter(function (s) { return s && s.date; }).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    var ss = all.filter(function (s) { return s.date.slice(0, 4) === y; }); if (!ss.length) return null;
    var r = { year: y, sessions: ss.length, mins: 0, kcal: null, prs: 0, sets: 0, volume: 0, weeks: 0, bestRun: 0, months: 0, rets: 0, top: [], gains: [], muscles: [] };
    var wks = {}, mos = {}, per = {}, st = { wk: null, run: 0, spare: 0 };
    ss.forEach(function (s) {
      r.mins += s.mins || 0; r.prs += s.prs || 0; r.volume += sessionVolume(prog, s, handle); if (s.ret) r.rets++;
      wks[weekKey(s.date)] = 1; mos[s.date.slice(0, 7)] = 1;
      (s.sets || []).forEach(function (x) { if (x.reps > 0 && x.type !== 'W') { r.sets++; per[x.ex] = (per[x.ex] || 0) + 1; } });
      if (runStep(st, weekKey(s.date)) && st.run > r.bestRun) r.bestRun = st.run;
    });
    var ks = kcalSum(profile, ss); r.kcal = ks ? ks.total : null; r.volume = round1(r.volume);
    r.weeks = Object.keys(wks).length; r.months = Object.keys(mos).length;
    r.top = Object.keys(per).filter(function (id) { return prog.ex[id]; }).map(function (id) { return { id: id, sets: per[id] }; }).sort(function (a, b) { return b.sets - a.sets; }).slice(0, 3);
    var m0 = ss[0].date.slice(0, 7);
    Object.keys(prog.ex).forEach(function (id) {
      var ex = prog.ex[id], h = history(profile, id), pre = h.filter(function (x) { return x.date.slice(0, 4) < y; });
      var a = pre.length ? pre : h.filter(function (x) { return x.date.slice(0, 7) === m0; }), b = h.filter(function (x) { return x.date.slice(0, 4) === y && (pre.length || x.date.slice(0, 7) > m0); });
      if (!a.length || !b.length) return;
      var b0 = 0; a.forEach(function (x) { b0 = Math.max(b0, bestOf(ex, x.sets, handle)); });
      var b1 = 0; b.forEach(function (x) { b1 = Math.max(b1, bestOf(ex, x.sets, handle)); });
      if (b0 > 0 && b1 > b0) r.gains.push({ id: id, pct: Math.round((b1 / b0 - 1) * 100) });
    });
    r.gains.sort(function (a, b) { return b.pct - a.pct; }); r.gains = r.gains.slice(0, 3);
    var mu = muscleSets(prog, ss, 0, 9e15); r.muscles = Object.keys(mu).map(function (k) { return [k, round1(mu[k])]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
    return r;
  }
  /* «Новий старт» (пункт 3; Dai, Milkman, Riis 2014 — на початку тижня й місяця люди частіше беруться за цілі): сьогодні день тренування й
     у цьому місяці / тижні ще не тренувались — 'month' / 'week'; пропустили заплановане — 'back' (пропущене не надолужуємо). Інакше null */
  function freshStart(sessions, days, todayStr) {
    var ss = (sessions || []).filter(function (s) { return s && s.date; });
    if (!ss.length) return null;  // ще жодного тренування — веде «за руку», не «новий старт»
    if (missedDays(ss, days, todayStr)) return 'back';
    if (!days || days.indexOf(new Date(todayStr + 'T12:00:00').getDay()) < 0) return null;
    if (!ss.some(function (s) { return s.date.slice(0, 7) === todayStr.slice(0, 7) && s.date <= todayStr; })) return 'month';
    if (!ss.some(function (s) { return weekKey(s.date) === weekKey(todayStr) && s.date <= todayStr; })) return 'week';
    return null;
  }
  /* ---------- калорії тренування (з 3.21.9; слово Alexа 24.10: «Скільки калорій за тренування я спалив? Це потрібно правильно вираховувати і показувати
     після тренування та в додатку … + за тиждень в цілому за всі тренування які зробив») ----------
     2024 Adult Compendium of Physical Activities (J Sport Health Sci, 2024; pacompendium.com — «Conditioning Exercise»), код 02054 «Resistance (weight) training,
     multiple exercises, 8-15 reps at varied resistance» — 3,5 MET; визначення там же: 1 MET = 1 ккал на кг ваги за годину. Значення MET не міняємо й не змішуємо (правило Compendium).
     ккал = 3,5 × вага × години тренування — від старту до останнього виконаного підходу (kmins), разом із відпочинками (так міряли й у Compendium);
     понад спокій — (3,5 − 1) × вага × години. Вага — останнє зважування до дня тренування, якщо його немає — найближче після, інакше з анкети. Compendium — середнє, не вимір окремої людини (пише сам сайт) — показуємо «≈». */
  var KCAL_MET = 3.5;
  function weightAt(profile, date) {
    var all = ((profile.body || {}).weight || []).filter(function (x) { return x.v > 0; }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    var before = all.filter(function (x) { return x.d <= date; });
    if (before.length) return Number(before[before.length - 1].v);
    if (all.length) return Number(all[0].v);  // тренування раніше за перше зважування (анкета записує вагу днем заповнення) — найближче відоме
    return (profile.me || {}).weight > 0 ? Number(profile.me.weight) : null;
  }
  function sessionKcal(profile, s) {
    var m = s.kmins || s.mins, kg = weightAt(profile, s.date);
    if (!(m > 0) || !(kg > 0)) return null;
    return { total: Math.round(KCAL_MET * kg * m / 60), active: Math.round((KCAL_MET - 1) * kg * m / 60), kg: round1(kg), mins: m };
  }
  function kcalSum(profile, sessions) {
    var t = 0, a = 0, n = 0;
    sessions.forEach(function (s) { var k = sessionKcal(profile, s); if (k) { t += k.total; a += k.active; n++; } });
    return n ? { total: t, active: a, n: n } : null;
  }
  /* ---------- варіанти вправи (з 3.21.9; слово Alexа 24.10: «чому не змінюються к-сть підходів та кг при натисканні різних кнопок?») ----------
     історія й порада — окремо для кожного варіанта; записи без варіанта — перший варіант (так було до варіантів).
     Варіанта ще не було — старт від найближчого варіанта, що був (variantStart): легший → складніший — на крок легше (опційна гантель — аж до «без гантелі»),
     складніший → легший — та сама вага; інша кількість гантелей (гоблет 1 ↔ 2 на плечах) — та сама вага в руках, униз до дисків, що збираються. */
  function variantOf(ex, x) { return x.variant || (ex.variants ? ex.variants[0].id : undefined); }
  function histVariant(ex, hist, v) {
    if (!ex.variants || !v) return hist;
    return hist.map(function (h) { return Object.assign({}, h, { sets: h.sets.filter(function (x) { return variantOf(ex, x) === v; }) }); }).filter(function (h) { return h.sets.length; });
  }
  /* на крок легше / важче: d = −1 | +1; опційна гантель (dbopt): «без гантелі» (null) ↔ «лише гриф» (0) ↔ диски */
  function shiftLoad(ex, L, d, step, cap) {
    if (d < 0) { if (L === null || L === undefined || L === '') return null; L = Number(L); return L - step >= 0 ? Math.round((L - step) * 100) / 100 : L > 0 ? 0 : (ex.type === 'dbopt' ? null : 0); }
    if (L === null || L === undefined || L === '') return ex.type === 'dbopt' ? 0 : null;
    return Math.min(cap, Math.round((Number(L) + step) * 100) / 100);
  }
  function variantStart(ex, hist, v, handle, step, cap) {
    if (!ex.variants || !v || histVariant(ex, hist, v).length) return null;
    var idx = function (id) { for (var i = 0; i < ex.variants.length; i++) if (ex.variants[i].id === id) return i; return -1; };
    var me = idx(v); if (me < 0) return null;
    for (var j = hist.length - 1; j >= 0; j--) {
      var u = null, L = null, has = false;
      hist[j].sets.forEach(function (x) { var w = variantOf(ex, x); if (w === v || idx(w) < 0) return; if (u === null || Math.abs(idx(w) - me) < Math.abs(idx(u) - me)) u = w; });
      if (u === null) continue;
      hist[j].sets.forEach(function (x) { if (variantOf(ex, x) !== u || x.load === null || x.load === undefined || x.load === '') return; has = true; if (L === null || Number(x.load) > L) L = Number(x.load); });
      var harder = me > idx(u), load;
      if (!has) load = null;
      else if (dbCountOf(ex, u) !== dbCountOf(ex, v)) { var per = totalLoad(ex, L, handle, u) / dbCountOf(ex, v) - (handle || 0); load = Math.max(0, Math.min(cap, Math.floor(per / step + 1e-9) * step)); }
      else load = harder ? shiftLoad(ex, L, -1, step, cap) : L;
      return { from: u, harder: harder, load: load };
    }
    return null;
  }
  /* перший раз (вправи чи варіанта ще не було): після першого робочого підходу вага решти — за відповіддю «скільки ще могли б» (ідея Джарвіса, прийнята Alexом 24.10;
     ціль першого разу — запас 2–3): 0 у запасі або менше за нижню межу повторень — на крок легше; «3+» і верхня межа — на крок важче; інакше — та сама. Без відповіді — без змін. */
  function calibrate(set, min, max) {
    if (set.rir === null || set.rir === undefined) return 0;
    var r = Number(set.reps);
    if (set.rir <= 0 || r < min) return -1;
    if (set.rir >= 3 && r >= max) return 1;
    return 0;
  }
  /* Місячний звіт. */
  function monthReport(prog, profile, ym, handle) {
    var r = { sessions: 0, mins: 0, volume: 0, sets: 0, prs: 0, best: null, kcal: null };
    var ss = (profile.sessions || []).filter(function (s) { return s.date.slice(0, 7) === ym; });
    r.sessions = ss.length; r.kcal = kcalSum(profile, ss);
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
    var letters = LL('АБВГДЕ', "ABCDEF"), li = 0;
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
        /* дроп-сет (D) — одразу після свого підходу, без відпочинку: у суперсеті він іде разом із ним, а не після вправи пари */
        var aw = [], an = [], bw = [], bn = [];
        var grp = function (sets, w, n) { sets.forEach(function (s, j) { if (s.type === 'W') w.push(j); else if (s.type === 'D' && n.length) n[n.length - 1].push(j); else n.push([j]); }); };
        grp(a.sets, aw, an); grp(b.sets, bw, bn);
        if (!a.skipped) aw.forEach(function (j) { out.push({ i: i, j: j }); });
        if (!b.skipped) bw.forEach(function (j) { out.push({ i: i + 1, j: j }); });
        for (var k = 0; k < Math.max(an.length, bn.length); k++) {
          if (!a.skipped && k < an.length) an[k].forEach(function (j) { out.push({ i: i, j: j }); });
          if (!b.skipped && k < bn.length) bn[k].forEach(function (j) { out.push({ i: i + 1, j: j }); });
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
    if (it.sets[j + 1] && it.sets[j + 1].type === 'D') return 0;  // далі дроп-сет — одразу, без відпочинку
    if (it.ss && it.ss.k === 1) {
      var b = items[i + 1];
      if (b && !b.skipped) {
        var work = function (x) { return x.type !== 'W' && x.type !== 'D'; };
        var nW = it.sets.slice(0, j + 1).filter(work).length;
        if (b.sets.filter(work).length >= nW) return 0;
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
  /* вага з анкети — перше зважування (з 3.21.4; слово Alexа 24.10: «вага з анкети — перше зважування»; «я вже встановив додаток, щоб не
     видаляти профіль то застосуй уже записані данні як перше зважування»): лише коли зважувань ще немає — і для тих, хто вже заповнив анкету
     (дата — дата анкети); раз (p.wSeed). Зважування вже є — перше справжнє й так старт, нічого не додаємо */
  function seedWeight(p, kg, date) {
    var w = Number(kg);
    if (!p || !p.body || p.wSeed || (p.body.weight || []).length || !(w >= 25 && w <= 300)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { var t = new Date(); date = t.getFullYear() + '-' + (t.getMonth() < 9 ? '0' : '') + (t.getMonth() + 1) + '-' + (t.getDate() < 10 ? '0' : '') + t.getDate(); }
    p.body.weight = [{ d: date, v: round1(w), src: 'q' }]; p.wSeed = 1;
    return true;
  }
  /* пора знову зважитись чи заміряти обʼєми (з 3.21.4; слово Alexа 24.10: «обєми тіла потрібно відслідковувати раз на тиждень»): днів від
     останнього запису; пора — від 7 днів або записів ще немає */
  function measureDue(points, today) {
    var last = null;
    (points || []).forEach(function (q) { if (q && q.d && (!last || q.d > last)) last = q.d; });
    if (!last) return { due: true, days: null };
    var days = Math.round((new Date(today + 'T12:00:00').getTime() - new Date(last + 'T12:00:00').getTime()) / 864e5);
    return { due: days >= 7, days: days };
  }
  /* Тіло за місяць (з 3.21.5; слово Alexа 24.10, пункт 2: «місячний звіт — зміна ваги й талії»): вага — за середньою за 7 днів
     (вага щодня коливається), обʼєми — самі заміри; «було» — останнє значення до місяця (немає — перше в місяці), «стало» — останнє
     в місяці. У місяці записів немає — null; один запис і нічого раніше — лише «стало» (ch: null). */
  function bodyMonth(points, ym, smooth) {
    var all = smooth ? rolling7(points || []) : (points || []).slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; }).map(function (q) { return { d: q.d, v: Number(q.v) }; });
    var inM = all.filter(function (q) { return q.d.slice(0, 7) === ym; }), before = all.filter(function (q) { return q.d < ym + '-01'; });
    if (!inM.length) return null;
    var end = inM[inM.length - 1], start = before.length ? before[before.length - 1] : inM[0];
    if (start === end) return { from: null, fromD: null, to: end.v, toD: end.d, ch: null };
    return { from: start.v, fromD: start.d, to: end.v, toD: end.d, ch: round1(end.v - start.v) };
  }
  /* Скільки останніх тренувань поспіль із цією вправою людина позначала «Болить суглоб» (з 3.21.5; слово Alexа 24.10, пункт 7).
     Тренування з вправою — де є її робочі підходи або позначка (позначили й замінили до першого підходу — підходів немає, а біль був). */
  function painRun(sessions, exId) {
    var ss = (sessions || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; }), n = 0;
    for (var i = ss.length - 1; i >= 0; i--) {
      var hurt = (ss[i].pain || []).indexOf(exId) >= 0;
      if (!hurt && !(ss[i].sets || []).some(function (x) { return x.ex === exId && x.type !== 'W'; })) continue;
      if (hurt) n++; else break;
    }
    return n;
  }
  /* Віхи (з 3.21.5; слово Alexа 24.10, пункт 3): тренування за весь час, тижні поспіль із тренуванням, рекорди; вага — за середньою
     за 7 днів від першого зважування (мета «менше жиру» чи «рекомпозиція» — вниз, «набрати мʼязи» — вгору, підтримка — без віх ваги);
     талія — лише вниз (менше жиру, рекомпозиція). Крок: вага 2 кг / 5 lb, талія 2 см / 1 in; уже досягнуте не повторюється, навіть
     якщо вага повернулась. Усе — з історії, без збереженого стану. o: { sessions, weight, waist, goal, lb, today }
     → { got: [{ k: 'n'|'st'|'pr'|'w'|'c', v, d }] (новіші першими), next: [{ k, v, left }] }; v ваги й талії — в одиницях профілю, зі знаком */
  var MS_N = [10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000], MS_ST = [4, 8, 12, 26, 52, 104], MS_PR = [10, 25, 50, 100, 250, 500, 1000];
  var MS_RET = [1, 3, 5, 10, 25, 50];  // з 3.24.0 — повернень після пропуску (пункт 14)
  function milestones(o) {
    var ss = (o.sessions || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    var got = [], next = [], prs = 0, best = 0, rets = 0, st = { wk: null, run: 0, spare: 0 };
    ss.forEach(function (s, i) {
      if (MS_N.indexOf(i + 1) >= 0) got.push({ k: 'n', v: i + 1, d: s.date });
      var p0 = prs; prs += s.prs || 0;
      MS_PR.forEach(function (t) { if (p0 < t && prs >= t) got.push({ k: 'pr', v: t, d: s.date }); });
      if (s.ret) { rets++; if (MS_RET.indexOf(rets) >= 0) got.push({ k: 'ret', v: rets, d: s.date }); }  // з 3.24.0 — повернення після пропуску (пункт 14)
      if (!runStep(st, weekKey(s.date))) return;  // з 3.24.0 — з запасним тижнем, як streakInfo
      MS_ST.forEach(function (t) { if (st.run === t && t > best) { best = t; got.push({ k: 'st', v: t, d: s.date }); } });
    });
    var dir = o.goal === 'gain' ? 1 : o.goal === 'loss' || o.goal === 'recomp' ? -1 : 0;
    var wStep = o.lb ? 5 / LB : 2, wShow = o.lb ? 5 : 2, avg = dir ? rolling7(o.weight || []) : [], wBest = 0;
    avg.forEach(function (q) { var m = Math.floor((q.v - avg[0].v) * dir / wStep + 1e-6); while (wBest < m) { wBest++; got.push({ k: 'w', v: dir * wBest * wShow, d: q.d }); } });
    var cStep = o.lb ? 2.54 : 2, cShow = o.lb ? 1 : 2, cBest = 0;
    var wa = dir === -1 ? (o.waist || []).slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; }) : [];
    wa.forEach(function (q) { var m = Math.floor((Number(wa[0].v) - Number(q.v)) / cStep + 1e-6); while (cBest < m) { cBest++; got.push({ k: 'c', v: -cBest * cShow, d: q.d }); } });
    /* з 3.24.0 — виклик місяця виконано (пункт 4): місяці з першого тренування; дата — тренування, яким досягнуто ціль */
    if (o.days && o.days.length && ss.length) {
      var ym0 = ss[0].date.slice(0, 7), ymT = (o.today || ss[ss.length - 1].date).slice(0, 7);
      for (var ym = ym0, guard = 0; ym <= ymT && guard < 240; guard++) {
        var mc = monthChallenge(ss, o.days, ym);
        if (mc && mc.met) { var inM = ss.filter(function (s) { return s.date.slice(0, 7) === ym; }); got.push({ k: 'mc', v: ym, d: inM[mc.target - 1].date }); }
        var y2 = Number(ym.slice(0, 4)), m2 = Number(ym.slice(5, 7)); ym = (m2 === 12 ? y2 + 1 : y2) + '-' + pad(m2 === 12 ? 1 : m2 + 1);
      }
    }
    var nN = MS_N.filter(function (t) { return t > ss.length; })[0]; if (nN) next.push({ k: 'n', v: nN, left: nN - ss.length });
    var cur = ss.length ? streakWeeks(ss, o.today || ss[ss.length - 1].date) : 0, nS = MS_ST.filter(function (t) { return t > cur; })[0]; if (nS) next.push({ k: 'st', v: nS, left: nS - cur });
    var nP = MS_PR.filter(function (t) { return t > prs; })[0]; if (nP) next.push({ k: 'pr', v: nP, left: nP - prs });
    if (avg.length) { var wl = (wBest + 1) * wStep - (avg[avg.length - 1].v - avg[0].v) * dir; next.push({ k: 'w', v: dir * (wBest + 1) * wShow, left: round1(o.lb ? wl * LB : wl) }); }
    if (wa.length) { var cl = (cBest + 1) * cStep - (Number(wa[0].v) - Number(wa[wa.length - 1].v)); next.push({ k: 'c', v: -(cBest + 1) * cShow, left: round1(o.lb ? cl / 2.54 : cl) }); }
    got.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
    return { got: got, next: next };
  }
  function migrate(db) {
    if (!db || !db.profiles) return db;
    db.v = 3;
    db.settings = db.settings || {};
    ['sound', 'haptics', 'awake'].forEach(function (k) { if (db.settings[k] === undefined) db.settings[k] = true; });
    /* «за руку» (з 3.21.7): новим і тим, у кого ще немає 3 тренувань; досвідченим — вимкнено (увімкнути — «Більше» → «Тренування») */
    if (db.settings.guide === undefined) db.settings.guide = !Object.keys(db.profiles).some(function (id) { return (db.profiles[id].sessions || []).length >= 3; });
    if (!db.settings.voice) db.settings.voice = { on: true, level: 'full', rate: 1, uri: null };
    if (!db.settings.voice.tone) db.settings.voice.tone = 'hard';
    /* з 3.21.8: «Голос тренера під час тренування» — full / part / off; старий перемикач (on: false) → off, а on — знову загальний вимикач */
    if (!db.settings.voice.auto) { db.settings.voice.auto = db.settings.voice.on === false ? 'off' : 'full'; db.settings.voice.on = true; }
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
    if (db.profiles.me && db.custom && db.custom.answers) seedWeight(db.profiles.me, db.custom.answers.weight, db.custom.date);  // з 3.21.4
    return db;
  }

  return { stepOrder: stepOrder, restAfter: restAfter, estimateMins: estimateMins, readyAction: readyAction, alternatives: alternatives, nutrition: nutrition, weightTrend: weightTrend, bodyMonth: bodyMonth, painRun: painRun, milestones: milestones, seedWeight: seedWeight, measureDue: measureDue, foodAdvice: foodAdvice, isWork: isWork, INV: INV, stepFor: stepFor, capOf: capOf, dbCountOf: dbCountOf, setVolume: setVolume, sessionVolume: sessionVolume, plates: plates, warmups: warmups, records: records, prTypes: prTypes, muscleSets: muscleSets, streakWeeks: streakWeeks, streakInfo: streakInfo, missedDays: missedDays, recovery: recovery, REST_H: REST_H, monthChallenge: monthChallenge, weekSummary: weekSummary, yearSummary: yearSummary, shortPick: shortPick, shortSets: shortSets, SHORT_GROUPS: SHORT_GROUPS, SHORT_MIN: SHORT_MIN, freshStart: freshStart, monthReport: monthReport, orderItems: orderItems, migrate: migrate,
           planFor: planFor, totalLoad: totalLoad, metric: metric, metricLabel: metricLabel, history: history, bestOf: bestOf,
           suggest: suggest, comeback: comeback, machStep: machStep, INV_LB: INV_LB, LB: LB, sizesOf: sizesOf, unitize: unitize, lbNum: lbNum, lbText: lbText, isPR: isPR, plateau: plateau, fatigue: fatigue, weekKey: weekKey, greeting: greeting, weeklySets: weeklySets, rolling7: rolling7, STEP: STEP,
           KCAL_MET: KCAL_MET, weightAt: weightAt, sessionKcal: sessionKcal, kcalSum: kcalSum, variantOf: variantOf, histVariant: histVariant, shiftLoad: shiftLoad, variantStart: variantStart, calibrate: calibrate };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
