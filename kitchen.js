/* «Кухня» (з 3.20.0, слово Alexа 23.10: «щоб це була моя кухня всередині додатку … без збоїв, багів, розбіжностей, щоб не брехала»).
   Чисті функції без DOM — усе перевіряється тестами. Склад продуктів — лише FOOD_DB (USDA SR Legacy, CC0; звіряє tools/food_check.py)
   або етикетка людини; жодного числа складу тут немає, крім таблиці порцій руками Precision Nutrition («hand portion math», approximations).
   Запис: food — продукт бази + грами (how 'g' — зважено, 'm' — мірка); my — свій продукт з етикетки; dish — своя страва за рецептом;
   hand — порції руками (орієнтир); quick — числа з етикетки на порцію. Точність запису (q): exact · label · measure · hand. */
var KITCHEN = (function () {
  var DB = typeof FOOD_DB !== 'undefined' ? FOOD_DB : require('./food_db.js');
  /* Precision Nutrition: 1 долоня білка · 1 кулак овочів · 1 жменя вуглеводів · 1 палець жирів — окремо для чоловіків і жінок */
  var HANDS = {
    m: { palm: { p: 24, c: 2, f: 4.5, kcal: 145 }, fist: { p: 1.5, c: 5, f: 0, kcal: 25 }, cup: { p: 3, c: 25, f: 1, kcal: 120 }, thumb: { p: 2, c: 2, f: 9, kcal: 100 } },
    f: { palm: { p: 22, c: 2, f: 4, kcal: 130 }, fist: { p: 1.5, c: 5, f: 0, kcal: 25 }, cup: { p: 3, c: 22, f: 1, kcal: 110 }, thumb: { p: 2, c: 2, f: 8, kcal: 90 } }
  };
  var HAND_KEYS = ['palm', 'fist', 'cup', 'thumb'];
  /* вода, л на день: те саме, що генератор програми (food.water) — чоловіки 2,5–3, жінки 2–2,5; у день тренування — верхня межа.
     З 3.21.2 — лише запасна норма, коли немає ваги чи віку для особистої (waterNeed) */
  var WATER = { m: [2.5, 3], f: [2, 2.5] };
  var Q_RANK = { exact: 0, label: 1, measure: 2, hand: 3 };
  var BY = {};
  DB.items.forEach(function (it) { BY[it.id] = it; });

  var r1 = function (x) { return Math.round(x * 10) / 10; };
  var zero = function () { return { kcal: 0, p: 0, f: 0, c: 0, fib: 0 }; };
  function add(t, x, k) { k = k === undefined ? 1 : k; t.kcal += x.kcal * k; t.p += x.p * k; t.f += x.f * k; t.c += x.c * k; t.fib += (x.fib || 0) * k; return t; }
  function round(t) { return { kcal: Math.round(t.kcal), p: r1(t.p), f: r1(t.f), c: r1(t.c), fib: r1(t.fib) }; }
  function worse(a, b) { return Q_RANK[a] >= Q_RANK[b] ? a : b; }

  function item(id) { return BY[id] || null; }
  /* стан продукту: s — 'raw' / 'cooked' / 'dry' / ''; немає такого — перший */
  function variant(id, s) { var it = BY[id]; if (!it) return null; for (var i = 0; i < it.v.length; i++) if (it.v[i].s === s) return it.v[i]; return it.v[0]; }
  /* чи треба питати «сирий / готовий / сухий» — у продукту кілька станів */
  function needsState(id) { var it = BY[id]; return !!it && it.v.length > 1; }

  /* склад на 100 г запису (food / my / dish) і точність; ctx: { products, dishes } */
  function per100(e, ctx) {
    ctx = ctx || {};
    if (e.t === 'food') { var v = variant(e.id, e.s); return v ? { x: v, q: e.how === 'm' ? 'measure' : 'exact' } : null; }
    /* свій продукт і страва: склад запамʼятовано в записі (x) — зміна етикетки чи рецепта, видалення не переписують минулі дні */
    if (e.t === 'my') { var pr = e.x ? { per100: e.x } : (ctx.products || {})[e.pid]; return pr ? { x: pr.per100, q: e.how === 'm' ? 'measure' : 'label' } : null; }
    if (e.t === 'dish') { var d = e.x ? { per100: e.x, q: e.dq || 'measure' } : (ctx.dishes || {})[e.did]; return d && d.per100 ? { x: d.per100, q: e.how === 'm' ? worse('measure', d.q) : d.q } : null; }
    return null;
  }
  /* склад одного запису: { kcal, p, f, c, fib, q } або null (немає продукту / страви) */
  function macros(e, sex, ctx) {
    if (!e) return null;
    if (e.t === 'hand') {
      var H = HANDS[sex === 'f' ? 'f' : 'm'], t = zero();
      HAND_KEYS.forEach(function (k) { var n = Number(e[k]) || 0; if (n > 0) add(t, H[k], n); });
      var o = round(t); o.q = 'hand'; return o;
    }
    if (e.t === 'quick') return { kcal: Math.round(Number(e.kcal) || 0), p: r1(Number(e.p) || 0), f: r1(Number(e.f) || 0), c: r1(Number(e.c) || 0), fib: 0, q: 'label' };
    var b = per100(e, ctx), g = Number(e.g);
    if (!b || !(g > 0)) return null;
    var r = round(add(zero(), b.x, g / 100)); r.q = b.q; return r;
  }
  /* підсумок дня: числа, кількість записів і скільки калорій якої точності */
  function dayTotals(day, sex, ctx) {
    var t = zero(), byQ = { exact: 0, label: 0, measure: 0, hand: 0 }, n = 0;
    ((day && day.items) || []).forEach(function (e) {
      var m = macros(e, sex, ctx); if (!m) return;
      add(t, m); byQ[m.q] += m.kcal; n++;
    });
    var o = round(t); o.n = n; o.byQ = byQ;
    o.sure = o.kcal > 0 ? Math.round((byQ.exact + byQ.label) / o.kcal * 100) : 0;  // % калорій, записаних точно (зважено чи з етикетки)
    return o;
  }

  /* вітаміни й мінерали (з 3.21.6; слово Alexа 24.10, пункт 4: «кальцій, залізо, вітаміни C і D») — лише з продуктів бази (USDA SR
     Legacy, mi на 100 г) і рецептів з них; свій продукт з етикетки, порції «руками» й швидкий запис — даних немає (невідомо, не нуль).
     Норма — NIH ODS (Recommended Dietary Allowances, сторінки Consumer, звірено 24.10): кальцій 1000 мг (14–18 — 1300; жінки 51+ і всі
     71+ — 1200), залізо 8 мг (жінки 19–50 — 18; 14–18 — 11 / 15), вітамін C 90 / 75 мг (14–18 — 75 / 65), вітамін D 15 мкг (71+ — 20). */
  var MI_KEYS = ['ca', 'fe', 'vc', 'vd'];
  function microNorm(sex, age) {
    var f = sex === 'f', a = Number(age) || 30, teen = a < 19;
    return { ca: teen ? 1300 : a >= 71 || (f && a >= 51) ? 1200 : 1000, fe: teen ? (f ? 15 : 11) : f && a <= 50 ? 18 : 8,
             vc: teen ? (f ? 65 : 75) : f ? 75 : 90, vd: a >= 71 ? 20 : 15 };
  }
  /* одного запису: { ca, fe, vc, vd } — лише відомі, на його грами; даних немає — null */
  function microsOf(e, ctx) {
    if (!e || (e.t !== 'food' && e.t !== 'dish')) return null;
    var b = per100(e, ctx), g = Number(e.g), mi = b && b.x && b.x.mi;
    if (!mi || !(g > 0)) return null;
    var o = {}, any = false;
    MI_KEYS.forEach(function (k) { if (typeof mi[k] === 'number') { o[k] = mi[k] * g / 100; any = true; } });
    return any ? o : null;
  }
  /* за день: суми відомого; n — записів із складом, none — без жодного числа, miss[k] — записів без числа k */
  function dayMicros(day, sex, ctx) {
    var t = { ca: 0, fe: 0, vc: 0, vd: 0 }, miss = { ca: 0, fe: 0, vc: 0, vd: 0 }, n = 0, none = 0;
    ((day && day.items) || []).forEach(function (e) {
      if (!macros(e, sex, ctx)) return;
      n++;
      var m = microsOf(e, ctx); if (!m) none++;
      MI_KEYS.forEach(function (k) { if (m && typeof m[k] === 'number') t[k] += m[k]; else miss[k]++; });
    });
    return { ca: Math.round(t.ca), fe: r1(t.fe), vc: Math.round(t.vc), vd: r1(t.vd), n: n, none: none, miss: miss };
  }

  /* справжні витрати з журналу й ваги (з 3.21.6; слово Alexа 24.10, пункт 5: «як MacroFactor; лише для тих, хто записує їжу щодня ≥ 2 тижні»):
     рівняння енергетичного балансу — витрати = середнє зʼїдене − 7700 ккал × зміна ваги за день (7700 ккал на кг — наближення: для
     худорлявих воно завищує енергію втраченої ваги, Hall, Int J Obes 2008). days — [{ d, kcal }] днів із записами, w — зважування (кг),
     end — останній повний день (учора). Вікно — 21 день; рахуються дні, де записано ≥ min ккал (половина нижньої межі норми — щоб не брати
     явно неповні дні); треба ≥ 14 таких днів і зважування в перший і останній тиждень вікна (≥ 10 днів між ними). Інакше — null.
     Результат поза 1000–6000 ккал — дані не сходяться, теж null. */
  var BURN = { win: 21, need: 14, kcalKg: 7700 };
  function realBurn(days, w, end, min) {
    var t = function (s) { return new Date(s + 'T12:00:00').getTime(); }, te = t(end), ts = te - (BURN.win - 1) * 864e5;
    var full = (days || []).filter(function (x) { var u = t(x.d); return u >= ts && u <= te && x.kcal >= (min || 0); });
    if (full.length < BURN.need) return null;
    var pts = (w || []).filter(function (q) { var u = t(q.d); return u >= ts && u <= te; });
    var a = pts.filter(function (q) { return t(q.d) < ts + 7 * 864e5; }), b = pts.filter(function (q) { return t(q.d) > te - 7 * 864e5; });
    if (!a.length || !b.length) return null;
    var mean = function (l, f) { return l.reduce(function (s, x) { return s + f(x); }, 0) / l.length; };
    var span = (mean(b, function (q) { return t(q.d); }) - mean(a, function (q) { return t(q.d); })) / 864e5;
    if (span < 10) return null;
    var dW = mean(b, function (q) { return Number(q.v); }) - mean(a, function (q) { return Number(q.v); }), intake = mean(full, function (x) { return x.kcal; });
    var kcal = intake - BURN.kcalKg * dW / span;
    if (!(kcal >= 1000 && kcal <= 6000)) return null;
    return { kcal: Math.round(kcal / 50) * 50, intake: Math.round(intake), days: full.length, dW: r1(dW), span: Math.round(span) };
  }

  /* Open Food Facts → етикетка на 100 г (з 3.21.6; слово Alexа 24.10, пункт 6: «як помічник етикетки»): лише те, що є у відповіді;
     ккал — з кДж (÷ 4,184), якщо ккал немає; назва — українська, інакше основна чи англійська, і марка; товару немає — null */
  function offLabel(j) {
    if (!j || j.status !== 1 || !j.product) return null;
    var p = j.product, n = p.nutriments || {}, num = function (v) { var x = v === '' || v === null || v === undefined ? NaN : Number(v); return isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : null; };
    var kcal = num(n['energy-kcal_100g']), kj = num(n['energy-kj_100g']) !== null ? num(n['energy-kj_100g']) : num(n.energy_100g);
    if (kcal === null && kj !== null) kcal = Math.round(kj / 4.184);
    var nm = String(p.product_name_uk || p.product_name || p.product_name_en || '').trim(), br = String(p.brands || '').split(',')[0].trim();
    var name = (br && nm.toLowerCase().indexOf(br.toLowerCase()) < 0 ? [nm, br].filter(Boolean).join(' · ') : nm || br).slice(0, 60);  // марка — якщо її ще немає в назві
    var o = { name: name, kcal: kcal, p: num(n.proteins_100g), f: num(n.fat_100g), c: num(n.carbohydrates_100g) };
    o.missing = ['kcal', 'p', 'f', 'c'].filter(function (k) { return o[k] === null; });
    return o;
  }

  /* «Твоя тарілка»: на один прийом. Білок — 0,4 г/кг на прийом (Schoenfeld, Aragon 2018: ≥ 4 прийоми, ≥ 1,6 г/кг на день);
     овочі — шаблон Precision Nutrition (чоловіки 2 кулаки, жінки 1); вуглеводи й жири — порівну жменями й пальцями до калорій прийому.
     nu — ENGINE.nutrition(…), base — вага для білка (nu.base), meals — прийомів на день. Порції — кроком 0,5, це орієнтир. */
  function plate(nu, sex, meals) {
    if (!nu || !(meals > 0)) return null;
    var H = HANDS[sex === 'f' ? 'f' : 'm'], half = function (x) { return Math.max(0, Math.round(x * 2) / 2); };
    var pMeal = 0.4 * nu.base, palm = Math.max(1, half(pMeal / H.palm.p)), fist = sex === 'f' ? 1 : 2;
    var kMeal = (nu.kLo + nu.kHi) / 2 / meals, rest = kMeal - palm * H.palm.kcal - fist * H.fist.kcal;
    var n = half(rest / (H.cup.kcal + H.thumb.kcal));
    var o = { palm: palm, fist: fist, cup: n, thumb: n, pMeal: Math.round(pMeal), kMeal: Math.round(kMeal) };
    o.est = macros({ t: 'hand', palm: palm, fist: fist, cup: n, thumb: n }, sex);
    return o;
  }

  /* своя страва (💡1, метод Eurofir): склад сирих інгредієнтів ÷ вага готової страви → склад на 100 г.
     ings — записи (food / my / hand / quick), cooked — вага готової страви, г. Точність — найгірша з інгредієнтів. */
  function recipe(ings, cooked, sex, ctx) {
    var t = zero(), q = 'exact', ok = 0;
    (ings || []).forEach(function (e) { var m = macros(e, sex, ctx); if (!m) return; add(t, m); q = worse(q, m.q); ok++; });
    if (!ok || !(cooked > 0)) return null;
    var k = 100 / cooked, per = round({ kcal: t.kcal * k, p: t.p * k, f: t.f * k, c: t.c * k, fib: t.fib * k });
    /* вітаміни й мінерали страви (з 3.21.6): число — лише коли воно відоме для кожного інгредієнта (частина — занизила б) */
    var mi = {}, ms = (ings || []).filter(function (e) { return macros(e, sex, ctx); }).map(function (e) { return microsOf(e, ctx) || {}; });
    MI_KEYS.forEach(function (x) { if (ms.length && ms.every(function (m) { return typeof m[x] === 'number'; })) mi[x] = r1(ms.reduce(function (a, m) { return a + m[x]; }, 0) * k); });
    if (Object.keys(mi).length) per.mi = mi;
    return { per100: per, total: round(t), q: q, n: ok };
  }

  /* «чим добрати білок» (💡3): скільки бракує до нижньої межі норми й чим. Спершу — те, що людина вже їсть (з 3.20.0, ідея Джарвіса,
     слово Alexа «білок — спершу з того, що я їм»): нещодавні продукти бази (у готовому вигляді), свої продукти й страви; далі — продукти бази
     з білкових груп. Лише готове до їжі: готове, без стану, сирі фрукти й овочі; грами — щоб закрити нестачу (вгору до 10 г, не більше 400 г).
     ctx: { products, dishes, recent: [{ id, s }] }. У списку mine — «з ваших». */
  var ready = function (it, v) { return v.s === 'cooked' || v.s === '' || (v.s === 'raw' && (it.g === 'fruit' || it.g === 'veg')); };
  function proteinGap(totals, pLo, ctx, limit) {
    var need = Math.round((pLo || 0) - ((totals && totals.p) || 0));
    if (need <= 0) return { need: 0, list: [] };
    ctx = ctx || {};
    var cand = [], seen = {};
    (ctx.recent || []).forEach(function (r) {
      var it = BY[r.id]; if (!it || seen[it.id]) return;
      var v = variant(it.id, r.s); if (!ready(it, v)) v = variant(it.id, 'cooked'); if (!v || !ready(it, v) || !(v.p > 0)) return;
      seen[it.id] = 1; cand.push({ t: 'food', id: it.id, s: v.s, x: v, mine: true });
    });
    var P = ctx.products || {};
    Object.keys(P).forEach(function (k) { if (P[k].per100 && P[k].per100.p > 0) cand.push({ t: 'my', pid: k, x: P[k].per100, mine: true }); });
    var Dd = ctx.dishes || {};
    Object.keys(Dd).forEach(function (k) { if (Dd[k].per100 && Dd[k].per100.p > 0) cand.push({ t: 'dish', did: k, x: Dd[k].per100, mine: true }); });
    DB.items.forEach(function (it) {
      if ((it.g !== 'protein' && it.g !== 'dairy') || seen[it.id]) return;
      it.v.forEach(function (v) { if (!ready(it, v) || !(v.p > 0)) return; cand.push({ t: 'food', id: it.id, s: v.s, x: v }); });
    });
    var list = cand.map(function (c) {
      var g = Math.ceil(need / c.x.p * 100 / 10) * 10;
      if (g > 400) return null;
      var e = { t: c.t, g: g, how: 'g' }; if (c.id) { e.id = c.id; e.s = c.s; } if (c.pid) e.pid = c.pid; if (c.did) e.did = c.did;
      return { e: e, kcal: Math.round(c.x.kcal * g / 100), p: r1(c.x.p * g / 100), dens: c.x.p / Math.max(1, c.x.kcal), mine: !!c.mine };
    }).filter(Boolean).sort(function (a, b) { return (b.mine - a.mine) || b.dens - a.dens || a.kcal - b.kcal; });
    return { need: need, list: list.slice(0, limit || 4) };
  }

  /* особиста норма води (з 3.21.2; слово Alexа 23.10: «особиста норма води за рівнянням Yamada 2022 (вага, стать, вік, активність як у
     калоріях, +0,5 л у день тренування)»). Yamada Y. та ін., «Variation in human water turnover associated with environmental and lifestyle
     factors», Science 2022; 378: 909–915 (5 604 людини з 23 країн, обмін води виміряно ізотопами), рівняння 1:
     обмін (мл/добу) = 1076·PAL + 14,34·вага(кг) + 374,9·стать (чоловік — 1) + 5,823·вологість(%) + 1070·спортсмен + 104,6·HDI + 0,4726·висота(м)
       − 0,3529·вік² + 24,78·вік − 19,66·T + 1,865·T² − 713,1.
     Умови — як у прикладах статті (помірні): 10 °C, вологість 50 %, висота 0, країна з високим HDI (0), не професійний спортсмен;
     PAL 1,45 — той самий, що в калоріях (engine.nutrition: tdee = bmr × 1,45). Питво: з їжею й питвом надходить ~85 % обміну (решта — вода
     обміну речовин і з повітря, та сама стаття), з них ~20 % — з їжею (EFSA 2010: 20–30 %; NASEM 2004: питво ≈ 81 %) → питво = 0,68 обміну.
     Округлення — до 50 мл; не менше 2 л чоловікам і 1,6 л жінкам (WATER_MIN). Немає ваги чи віку — null (тоді — норма програми). Перевірка — усі 4 приклади статті: 3,2 · 2,7 · 7,3 · 6,8 л обміну (test_engine). */
  var WATER_PAL = 1.45;
  /* нижня межа питва (контрольний аудит 24.10): рівняння описує, скільки людина обмінює, а не скільки їй треба — з віком обмін падає, а літні
     люди частіше зневоднюються (слабша спрага — та сама стаття); ESPEN (Volkert та ін., «ESPEN guideline on clinical nutrition and hydration
     in geriatrics», Clin Nutr 2019): літнім жінкам — щонайменше 1,6 л напоїв на день, чоловікам — 2,0 л; це ж EFSA для дорослих (2 / 2,5 л з
     усіх джерел × 0,8 питва). Без межі 70-річному чоловікові 70 кг вийшло б 1,6 л, легкій літній жінці — 0,8 л */
  var WATER_MIN = { m: 2000, f: 1600 };
  /* обмін води, мл/добу — рівняння 1 повністю; o: { sex, weight, age, pal, temp (°C), hum (%), athlete (0/1), hdi (0 — високий), alt (м) } */
  function waterTurnover(o) {
    var t = o.temp === undefined ? 10 : o.temp, h = o.hum === undefined ? 50 : o.hum, a = o.age;
    return 1076 * (o.pal || WATER_PAL) + 14.34 * o.weight + 374.9 * (o.sex === 'f' ? 0 : 1) + 5.823 * h + 1070 * (o.athlete ? 1 : 0) + 104.6 * (o.hdi || 0) + 0.4726 * (o.alt || 0)
      - 0.3529 * a * a + 24.78 * a + 1.865 * t * t - 19.66 * t - 713.1;
  }
  function waterNeed(sex, weight, age) {
    var w = Number(weight), a = Number(age);
    if (!(w >= 30 && w <= 300) || !(a >= 14 && a <= 100)) return null;
    return Math.max(WATER_MIN[sex === 'f' ? 'f' : 'm'], Math.round(waterTurnover({ sex: sex, weight: w, age: a }) * 0.85 * 0.8 / 50) * 50);
  }
  /* норма на день, мл: свій обʼєм на звичайний день (vol, «Налаштування кухні», з 3.21.0) → особиста (rec, waterNeed, з 3.21.2) → норма
     програми (чоловіки 2,5 л, жінки 2 л); у день тренування — ще 0,5 л (як у програмі: 2,5–3 / 2–2,5 л) */
  function waterTarget(sex, training, vol, rec) {
    var w = WATER[sex === 'f' ? 'f' : 'm'], base = vol > 0 ? vol : rec > 0 ? rec : w[0] * 1000;
    return Math.round(base + (training ? (w[1] - w[0]) * 1000 : 0));
  }
  var hm = function (s) { var m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmtT = function (m) { m = ((Math.round(m / 5) * 5) % 1440 + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  /* розклад між першою (f) і останньою (l) склянкою, хвилини (l ≥ f; через північ — l > 1440): прийомів n — 4 на день (з 3.21.1, слово Alexа
     23.10: «пити 4 рази на день при умові що не пропустив прийом»; «частіше ніж 4 рази на день не можна заставляти»), більше — лише коли
     норма не вміщається в 4 прийоми по 0,8 л (waterPortions); рівно між першою й останньою; у день тренування один — за 1,5 год до нього
     (trainAt), якщо це між першою й останньою. [{ t, k: 'wake'|'train'|'' }] */
  function plan(f, l, target, glass, trainAt, per) {
    var n = waterIntakes(target, glass, per, l - f), out = [];
    for (var i = 0; i < n; i++) out.push({ m: n === 1 ? f : f + (l - f) * i / (n - 1), k: i === 0 ? 'wake' : '' });
    var ta = hm(trainAt);
    if (ta !== null && n > 1) {
      var want = ta - 90; if (want < f) want += 1440;
      if (want > f && want <= l) {
        var j = 1; for (var q = 1; q < n; q++) if (Math.abs(out[q].m - want) < Math.abs(out[j].m - want)) j = q;
        /* з 3.21.1: перша й остання склянка — свої (налаштування людини), їх не зсуваємо; найближча — остання, то вона й стає склянкою перед тренуванням */
        if (j === n - 1) out[j].k = 'train';
        else { out[j] = { m: want, k: 'train' }; out.sort(function (a, c) { return a.m - c.m; }); }
      }
    }
    return out.map(function (x) { return { t: fmtT(x.m), k: x.k }; }).filter(function (x, i, a) { return !i || x.t !== a[i - 1].t; });
  }
  /* з 3.21.0: перша й остання склянка — свої (налаштування «Кухні»); остання раніше першої за годинником — розклад через північ (нічна зміна) */
  function waterPlan(first, last, target, glass, trainAt, per) {
    var f = hm(first), l = hm(last); if (f === null) f = 7 * 60 + 15; if (l === null) l = 21 * 60;
    if (l <= f) l += 1440;
    return plan(f, l, target, glass, trainAt, per);
  }
  /* до 3.21.0: від підйому й сну — перша через 15 хв після підйому, остання за 2 год до сну (так рахуються перша й остання за замовчуванням) */
  function waterTimes(wake, bed, target, glass, trainAt, per) {
    var w = hm(wake), b = hm(bed); if (w === null) w = 7 * 60; if (b === null) b = 23 * 60;
    if (b <= w) b += 1440;
    var first = w + 15;
    return plan(first, Math.max(first, b - 120), target, glass, trainAt, per);
  }

  /* вода прийомами (з 3.21.1). Слово Alexа 23.10: «коли приходить чергове нагадування і я не випив … додаток має перерахувати для слідуючого
     нагадування більший обєм»; «ніхто міряти грамовку не буде. потрібно додавати або пів стакана або цілий стакан»; «дати можливість самому
     обирати обєм склянок 250/300/350/500 просто для зручності але пити 4 рази на день при умові що не пропустив прийом»; «якщо пропустив то
     наступна більша але в рамках безпечної норми …, якщо пропустив так що пити потрібно більше норми то зміщувати графік так щоб пити потрібно
     було частіше … але бажано на ніч не давати великий обєм якщо це графік дозволяє»; межа за раз — 0,8 л (вибір Alexа 23.10: здорові нирки
     в спокої виводять 0,8–1 л на годину — J. Verbalis, Scientific American, «Strange but True: Drinking Too Much Water Can Kill»).
     Порції — у половинках склянки (h = склянка ÷ 2). Той самий розрахунок — у нагадуваннях (server/src/push.js; рівність — tests/push_unit.mjs). */
  var WATER_RATE = 800, WATER_GAP = 60;  // мл за раз (і на годину) · хв між додатковим прийомом і сусідніми
  var halvesCap = function (glass) { return Math.max(1, Math.floor(WATER_RATE / (glass / 2) + 1e-9)); };
  var spread = function (H, n) { var q = Math.floor(H / n), r = H - q * n, out = []; for (var i = 0; i < n; i++) out.push(q + (i < r ? 1 : 0)); return out; };
  /* з 3.22.1 — скільки пити за раз: per — 1 чи 2 склянки (слово Alexа 25.10: «потрібно давати вибір налаштовувати пити 1 стакан чи 2, бо не усім
     хочеться багато пити»), але не більше 0,8 л; per не задано — лише 0,8 л, як до 3.22.1 (так сервер рахує для застосунку, що ще не оновився) */
  var perCap = function (glass, per) { var c = halvesCap(glass); return per ? Math.min(c, 2 * per) : c; };
  /* скільки прийомів на день: 4, а якщо норма не вміщається в 4 по обраній порції (у половинках цієї склянки) — більше; з порцією (per) — не частіше
     ніж раз на годину між першою й останньою склянкою (span, хв): не вміщається — порції більші, до 0,8 л */
  function waterIntakes(target, glass, per, span) {
    var g = Math.max(100, glass || 350), H = Math.ceil(target / (g / 2) - 1e-9), old = Math.max(4, Math.ceil(H / halvesCap(g)));
    if (!per) return old;
    var want = Math.ceil(H / perCap(g, per)), most = span > 0 ? Math.floor(span / WATER_GAP + 1e-9) + 1 : want;
    return Math.max(old, Math.min(want, most));
  }
  /* план дня води: times — базовий розклад [{ t, k }], target і ml — мл, at — час останньої відмітки ('' — невідомо), now — 'HH:MM'.
     Прийом зроблено: відмічено стільки, скільки за планом до нього включно, або остання відмітка належить саме йому — це останній прийом,
     чиє вікно (за годину до його часу) уже почалося на час відмітки; раніший, не покритий обсягом, — пропущений (він уже минув) (додатковий — не раніше ніж за годину
     після останньої відмітки: не більше 0,8 л на годину).
     До 3.21.9 відмітка зараховувала й усі раніші прийоми: одна склянка о 21:47 — і всі 4 прийоми дня «зроблено» (слово Alexа 24.10: «пізній прийом
     не має позначати всі попередні прийоми виконаними»). Прийом, час якого
     настав, чекає 30 хв (вікно нагадування на сервері), далі — пропущений. Решта норми (у половинках, вгору) — на прийоми, що лишились:
     спершу рівно; пропустили — додаток до найближчих прийомів, крім останнього, кожен до межі; не вміщається — додаткові прийоми посередині
     між прийомами, що лишились (не ближче години до сусідніх), раніші першими, потім — перед найближчим; далі — останній; що й так не вміщається —
     не надолужуємо.
     → { items: [{ t, h — половинок, k: 'wake'|'train'|''|'extra', st: 'done'|'missed'|'plan', up — більше за план }], turn — перший 'plan'
     або null: { i — номер прийому (з 1), n — прийомів сьогодні, t, k, p — склянок, ml, up, capped — решту не надолужуємо, now — час настав },
     short — половинок, які не вмістились }.
     З 3.22.1 (per — 1 чи 2 склянки за раз; слово Alexа 25.10: «щоб додаток автоматично перераховував час та обєм якщо я випив більше чи менше а також
     раніше чи пізніше за сповіщення по графіку пиття»): після відмітки прийоми, що лишились, — рівно між нею й останньою склянкою (прийом за 1,5 год
     до тренування — на своєму місці; не ближче години між прийомами, інакше — як у розкладі); прийоми, які випите вже покрило наперед, зникають
     (випили більше — прийомів менше); випили менше — решта переходить у наступні, як за пропущеного. Без per — як до 3.22.1. */
  function waterDayPlan(times, target, glass, ml, at, now, per) {
    var n = (times || []).length; ml = Number(ml) || 0;
    if (!n || !(target > 0) || !(glass > 0)) return null;
    var h = glass / 2, H = Math.ceil(target / h - 1e-9), cap = per ? Math.min(halvesCap(glass), Math.max(2 * per, Math.ceil(H / n))) : halvesCap(glass), base = spread(H, n);
    var f = hm(times[0].t), cross = times.some(function (x) { return hm(x.t) < f; });
    var rel = function (t) { var m = hm(t); return m === null ? null : cross ? (m - f + 1440) % 1440 : m - f; };
    var abs = function (m) { return fmtT(f + m); };
    var r = times.map(function (x) { return rel(x.t); }), rn = rel(now), ra = rel(at), i, k, sum = 0;
    if (rn === null) return null;
    var own = -1; for (i = 0; i < n; i++) if (ra !== null && r[i] - WATER_GAP <= ra) own = i;
    var cum = [], m = r.slice(), skip = [];
    for (i = 0; i < n; i++) { sum += base[i]; cum.push(sum); }
    var doneV = function (j) { return ml >= Math.min(target, cum[j] * h) - 1e-6; };
    if (per && ra !== null) {
      var R = [], seg = [], prev = ra, out = {}, ok = true;
      for (i = own + 1; i < n; i++) { if (!doneV(i)) R.push(i); else if (own < 0 && i === 0) m[0] = ra; else skip[i] = true; }  // випите до першого вікна — прийом о часі відмітки
      for (k = 0; k < R.length; k++) {
        var j = R[k];
        if (k < R.length - 1 && times[j].k !== 'train') { seg.push(j); continue; }
        var step = (r[j] - prev) / (seg.length + 1);
        if (seg.length && step < WATER_GAP) ok = false;
        seg.forEach(function (s, z) { var x = prev + step * (z + 1), v = Math.round((f + x) / 5) * 5 - f; out[s] = v - prev < WATER_GAP ? Math.ceil((f + x) / 5) * 5 - f : v; });
        prev = r[j]; seg = [];
      }
      if (ok) Object.keys(out).forEach(function (s) { m[s] = out[s]; });
    }
    var c = -1; for (i = 0; i < n; i++) if (!skip[i] && m[i] <= rn) c = i;
    var items = [], pend = [];
    for (i = 0; i < n; i++) {
      if (skip[i]) continue;
      var done = doneV(i) || i === own, open = i > own && (i > c || (i === c && rn < m[i] + 30));  // прийом до відмітки — уже минув
      var it = { m: m[i], t: m[i] === r[i] ? times[i].t : abs(m[i]), h: base[i], k: times[i].k || '', st: done ? 'done' : open ? 'plan' : 'missed', up: false };
      items.push(it); if (it.st === 'plan') pend.push(it);
    }
    var left = Math.max(0, Math.ceil((target - ml) / h - 1e-9)), short = 0;
    if (!left) pend.forEach(function (x) { x.st = 'done'; });
    else if (pend.length) {
      var due = 0; pend.forEach(function (x) { due += x.h; });
      if (left <= due) { var sp = spread(left, pend.length); pend.forEach(function (x, q) { x.h = sp[q]; }); }
      else {
        var e = left - due, add;
        for (k = 0; k < pend.length - 1 && e > 0; k++) { add = Math.min(e, cap - pend[k].h); if (add > 0) { pend[k].h += add; pend[k].up = true; e -= add; } }
        if (e > 0) {  // додаткові прийоми — посередині: спершу між прийомами, що лишились (наступний уже більший), потім — перед найближчим
          var p0 = items.indexOf(pend[0]), gaps = [], extra = [];
          for (k = 0; k + 1 < pend.length; k++) gaps.push([pend[k].m, pend[k + 1].m]);
          if (p0 > 0) gaps.push([items[p0 - 1].m, pend[0].m]);
          for (k = 0; k < gaps.length && e > 0; k++) {
            var mid = Math.round((gaps[k][0] + gaps[k][1]) / 10) * 5;
            if (mid + 30 > rn && mid - gaps[k][0] >= WATER_GAP && gaps[k][1] - mid >= WATER_GAP && (ra === null || mid - ra >= WATER_GAP)) { add = Math.min(e, cap); extra.push({ m: mid, t: abs(mid), h: add, k: 'extra', st: 'plan', up: true }); e -= add; }
          }
          items = items.concat(extra).sort(function (x, y) { return x.m - y.m; });
        }
        /* останній прийом — не більший за попередній (слово Alexа 24.10: «останній прийом води має бути не більший ніж попередній, щоб на ніч пити менше»):
           до 3.21.8 він ріс, коли решта ніде не вміщалась, а додатковий прийом перед ним міг бути меншим за нього; тепер — вирівнюємо з додатковим, решту не надолужуємо */
        var last = pend[pend.length - 1], pv = items[items.indexOf(last) - 1];
        if (e > 0) { add = Math.min(e, Math.min(cap, pv ? Math.max(last.h, pv.h) : last.h) - last.h); if (add > 0) { last.h += add; last.up = true; e -= add; } }
        if (pv && pv.st === 'plan') while (last.h > pv.h && pv.h < cap) { last.h--; pv.h++; pv.up = true; }
        short = e;
      }
    }
    items = items.filter(function (x) { return x.st !== 'plan' || x.h > 0; });
    var tu = null;
    for (i = 0; i < items.length; i++) if (items[i].st === 'plan') { var x = items[i]; tu = { i: i + 1, n: items.length, t: x.t, k: x.k, p: x.h / 2, ml: Math.round(x.h * h), up: x.up, capped: short > 0, now: x.m <= rn }; break; }
    return { items: items.map(function (x) { return { t: x.t, h: x.h, k: x.k, st: x.st, up: x.up }; }), turn: tu, short: short };
  }
  function waterTurn(times, target, glass, ml, at, now, per) { var p = waterDayPlan(times, target, glass, ml, at, now, per); return p && p.turn; }

  /* пошук звичними словами (з 3.20.1; жива перевірка 23.10: «курка» з підказки поля не знаходила нічого — у базі «Куряче філе»):
     основа слова → продукти бази. Лише для запитів від 3 літер; спершу — назви, що починаються з запиту, далі ці слова, далі решта збігів. */
  var FISH = ['salmon', 'cod', 'pollock', 'mackerel', 'herring', 'tuna_can'], MEAT = ['chicken_breast', 'chicken_thigh', 'turkey_breast', 'beef_lean', 'beef_mince_5', 'beef_mince_15', 'pork_tender', 'pork_loin'];
  var ALIAS = [
    [['курк', 'курят', 'курин', 'куроч', 'chick'], ['chicken_breast', 'chicken_thigh', 'chicken_liver']],
    [['яйц', 'яєч', 'egg'], ['egg', 'egg_white']],
    [['риб', 'fish'], FISH], [['мʼяс', "м'яс", 'мяс', 'meat'], MEAT],
    [['свин', 'pork'], ['pork_tender', 'pork_loin', 'salo']], [['індич', 'індик', 'turkey'], ['turkey_breast']],
    [['ялович', 'beef'], ['beef_lean', 'beef_mince_5', 'beef_mince_15']], [['фарш', 'mince', 'ground'], ['beef_mince_5', 'beef_mince_15']],
    [['овес', 'вівс', 'геркулес', 'oatmeal', 'porridge'], ['oats']], [['сир', 'cheese'], ['gouda', 'mozzarella', 'feta', 'parmesan']],
    [['каш', 'круп', 'grain'], ['buckwheat', 'rice_white', 'rice_brown', 'oats', 'bulgur', 'millet', 'barley', 'quinoa', 'couscous']],
    [['картоп', 'potat'], ['potato', 'potato_baked']], [['томат', 'tomat'], ['tomato']], [['гриб', 'mushroom'], ['mushrooms']],
    [['горіх', 'nut'], ['walnuts', 'almonds', 'peanuts']], [['ягід', 'ягод', 'berr'], ['strawberry', 'blueberry']],
    [['масло', 'oil'], ['butter', 'oil_sunflower', 'oil_olive']], [['шоколад', 'chocol'], ['dark_choc']], [['сік', 'juice'], ['orange_juice']]
  ];
  /* пошук продуктів: назва українською чи англійською; спершу — ті, що починаються з запиту */
  function search(q, lang) {
    q = String(q || '').trim().toLowerCase().replace(/[’'`]/g, 'ʼ'); if (!q) return [];
    var key = lang === 'en' ? 'en' : 'uk', a = [], al = [], b = [], seen = {};
    if (q.length >= 3) ALIAS.forEach(function (x) { if (x[0].some(function (st) { st = st.replace(/[’'`]/g, 'ʼ'); return q.indexOf(st) === 0 || (q.length >= 3 && st.indexOf(q) === 0); })) x[1].forEach(function (id) { if (BY[id] && al.indexOf(BY[id]) < 0) al.push(BY[id]); }); });
    DB.items.forEach(function (it) {
      var n = it[key].toLowerCase(), o = it[key === 'uk' ? 'en' : 'uk'].toLowerCase();
      if (n.indexOf(q) === 0) a.push(it); else if (n.indexOf(q) > 0 || o.indexOf(q) >= 0) b.push(it);
    });
    return a.concat(al, b).filter(function (it) { if (seen[it.id]) return false; seen[it.id] = 1; return true; });
  }

  return { DB: DB, HANDS: HANDS, HAND_KEYS: HAND_KEYS, WATER: WATER, item: item, variant: variant, needsState: needsState, macros: macros, dayTotals: dayTotals,
    plate: plate, recipe: recipe, proteinGap: proteinGap, MI_KEYS: MI_KEYS, microNorm: microNorm, microsOf: microsOf, dayMicros: dayMicros, BURN: BURN, realBurn: realBurn, offLabel: offLabel, waterTarget: waterTarget, waterNeed: waterNeed, waterTurnover: waterTurnover, WATER_PAL: WATER_PAL, WATER_MIN: WATER_MIN, waterTimes: waterTimes, waterPlan: waterPlan, waterTurn: waterTurn, waterDayPlan: waterDayPlan, waterIntakes: waterIntakes, WATER_RATE: WATER_RATE, search: search, worse: worse };
})();
if (typeof module !== 'undefined') module.exports = KITCHEN;
