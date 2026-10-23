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
  /* вода, л на день: те саме, що генератор програми (food.water) — чоловіки 2,5–3, жінки 2–2,5; у день тренування — верхня межа */
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

  /* вода: норма на сьогодні, мл — день тренування — верхня межа, інакше нижня */
  function waterTarget(sex, training) { var w = WATER[sex === 'f' ? 'f' : 'm']; return Math.round((training ? w[1] : w[0]) * 1000); }
  var hm = function (s) { var m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmtT = function (m) { m = ((Math.round(m / 5) * 5) % 1440 + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  /* розклад нагадувань: склянок n = норма ÷ склянка (вгору); перша — через 15 хв після пробудження («після сну»), остання — за 2 год
     до сну (щоб не прокидатись уночі); між ними — рівно; у день тренування одна — за 1,5 год до нього. Повертає [{ t, k: 'wake'|'train'|'' }]. */
  function waterTimes(wake, bed, target, glass, trainAt) {
    var w = hm(wake), b = hm(bed); if (w === null) w = 7 * 60; if (b === null) b = 23 * 60;
    if (b <= w) b += 1440;
    var n = Math.max(1, Math.ceil(target / Math.max(100, glass || 350)));
    var first = w + 15, last = Math.max(first, b - 120), out = [];
    for (var i = 0; i < n; i++) out.push({ m: n === 1 ? first : first + (last - first) * i / (n - 1), k: i === 0 ? 'wake' : '' });
    var ta = hm(trainAt);
    if (ta !== null && n > 1) {
      var want = ta - 90; if (want < w) want += 1440;
      if (want > first && want <= last) {
        var j = 1; for (var q = 1; q < n; q++) if (Math.abs(out[q].m - want) < Math.abs(out[j].m - want)) j = q;
        out[j] = { m: want, k: 'train' };
        out.sort(function (a, c) { return a.m - c.m; });
      }
    }
    return out.map(function (x) { return { t: fmtT(x.m), k: x.k }; }).filter(function (x, i, a) { return !i || x.t !== a[i - 1].t; });
  }

  /* пошук продуктів: назва українською чи англійською; спершу — ті, що починаються з запиту */
  function search(q, lang) {
    q = String(q || '').trim().toLowerCase(); if (!q) return [];
    var key = lang === 'en' ? 'en' : 'uk', a = [], b = [];
    DB.items.forEach(function (it) {
      var n = it[key].toLowerCase(), o = it[key === 'uk' ? 'en' : 'uk'].toLowerCase();
      if (n.indexOf(q) === 0) a.push(it); else if (n.indexOf(q) > 0 || o.indexOf(q) >= 0) b.push(it);
    });
    return a.concat(b);
  }

  return { DB: DB, HANDS: HANDS, HAND_KEYS: HAND_KEYS, WATER: WATER, item: item, variant: variant, needsState: needsState, macros: macros, dayTotals: dayTotals,
    plate: plate, recipe: recipe, proteinGap: proteinGap, waterTarget: waterTarget, waterTimes: waterTimes, search: search, worse: worse };
})();
if (typeof module !== 'undefined') module.exports = KITCHEN;
