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
      if (sets.length) out.push({ date: s.date, n: s.n, deload: !!s.deload, back: s.back || 0, place: s.place, sets: sets });  // place — де було (дім / зал); back — частка ваги тренування повернення після перерви
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
    var h = hist.filter(function (x) { return !x.deload && !x.back; });  // легкі тижні й повернення після перерви — легші за задумом
    if (h.length < 4) return false;
    var before = 0, recent = 0;
    h.slice(0, h.length - 3).forEach(function (x) { before = Math.max(before, bestOf(ex, x.sets, handle)); });
    h.slice(-3).forEach(function (x) { recent = Math.max(recent, bestOf(ex, x.sets, handle)); });
    return before > 0 && recent <= before;
  }

  /* Втома: у кожній з двох останніх (не легких і не повернення) сесій ≥ 2 головні вправи гірші, ніж минулого разу. */
  function fatigue(prog, profile, handle) {
    var ss = (profile.sessions || []).filter(function (s) { return !s.deload && !s.back; });
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
    if (db.profiles.me && db.custom && db.custom.answers) seedWeight(db.profiles.me, db.custom.answers.weight, db.custom.date);  // з 3.21.4
    return db;
  }

  return { stepOrder: stepOrder, restAfter: restAfter, estimateMins: estimateMins, readyAction: readyAction, alternatives: alternatives, nutrition: nutrition, weightTrend: weightTrend, seedWeight: seedWeight, measureDue: measureDue, foodAdvice: foodAdvice, isWork: isWork, INV: INV, stepFor: stepFor, capOf: capOf, dbCountOf: dbCountOf, setVolume: setVolume, sessionVolume: sessionVolume, plates: plates, warmups: warmups, records: records, prTypes: prTypes, muscleSets: muscleSets, streakWeeks: streakWeeks, monthReport: monthReport, orderItems: orderItems, migrate: migrate,
           planFor: planFor, totalLoad: totalLoad, metric: metric, metricLabel: metricLabel, history: history, bestOf: bestOf,
           suggest: suggest, comeback: comeback, machStep: machStep, INV_LB: INV_LB, LB: LB, sizesOf: sizesOf, unitize: unitize, lbNum: lbNum, lbText: lbText, isPR: isPR, plateau: plateau, fatigue: fatigue, weekKey: weekKey, greeting: greeting, weeklySets: weeklySets, rolling7: rolling7, STEP: STEP };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
