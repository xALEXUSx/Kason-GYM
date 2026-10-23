/* Мова застосунку (з 3.17.0, слово Alexа 23.10: «повністю американську версію додатку … змінювати мову при першому запуску та в налаштуваннях»).
   Українська або англійська (американська). Мова — цього телефона, не акаунта: ключ «trening-lang» у сховищі браузера.
   Обирається на першому екрані й у «Більше»; зміна — перезапуск сторінки: тексти програми, підказок і голосу будуються під мову при запуску.
   Два способи перекладу:
   · LL(укр, англ) — текст інтерфейсу в коді поруч із перекладом (app.js, рушій, дрібні модулі);
   · TR(укр) — дані: програма, техніка вправ, підказки (словник EN з i18n_en.js, ключ — точний український текст). Генератор програми
     працює з українськими даними (шукає в них позначки), тож екрани отримують перекладену копію — view(програма). */
var I18N = (function () {
  var KEY = 'trening-lang', lang = 'uk', chosen = false, EN = {}, miss = {}, cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  try { var v = typeof localStorage !== 'undefined' && localStorage.getItem(KEY); if (v === 'en' || v === 'uk') { lang = v; chosen = true; } } catch (e) { /* немає сховища */ }
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
  var CYR = /[А-Яа-яЄєІіЇїҐґ]/;
  function L(uk, en) { return lang === 'en' && en !== undefined && en !== null ? en : uk; }
  /* словник; немає цілого — складений рядок перекладаємо частинами (генератор і програма склеюють речення, підписи «А · пн / чт»):
     краї з пробілами, кінцевий розділовий знак, велика перша літера, кілька речень, роздільники « · », « / », «: », «, ».
     Без lookbehind у регулярках — Safari до 16.4 на них падає. */
  var has = function (k) { return Object.prototype.hasOwnProperty.call(EN, k); };
  function look(s, d) {
    d = d || 0; if (d > 5) return undefined;
    if (has(s)) return EN[s];
    var t = s.trim(); if (!t) return s;
    if (t !== s) { var i0 = s.indexOf(t), e0 = look(t, d + 1); return e0 === undefined ? undefined : s.slice(0, i0) + e0 + s.slice(i0 + t.length); }
    if (has(' ' + t)) return EN[' ' + t].trim();
    if (has(t + ' ')) return EN[t + ' '].trim();
    var pm = t.match(/^([\s\S]*?)([.!?:;…]+)$/);
    if (pm && pm[1] && has(pm[1])) return EN[pm[1]] + pm[2];
    if (pm && pm[1] && has(pm[1] + ':')) return EN[pm[1] + ':'] + pm[2].slice(1);
    var c0 = t.charAt(0), up = c0.toUpperCase() + t.slice(1);
    if (c0 !== c0.toUpperCase() && has(up)) return EN[up];
    if (c0 !== c0.toUpperCase() && pm && pm[1] && has(c0.toUpperCase() + pm[1].slice(1))) return EN[c0.toUpperCase() + pm[1].slice(1)] + pm[2];
    var so = bySent(t, d); if (so !== undefined) return so;
    var seps = [' · ', ' / ', ': ', ', ', ' — '];
    for (var j = 0; j < seps.length; j++) {
      if (t.indexOf(seps[j]) < 0) continue;
      var parts = t.split(seps[j]);
      if (seps[j] === ': ' && parts.length === 2 && (has(parts[0] + ': ') || has(parts[0] + ':'))) {
        var rest = CYR.test(parts[1]) ? look(parts[1], d + 1) : parts[1];
        if (rest !== undefined) return (has(parts[0] + ': ') ? EN[parts[0] + ': '] : EN[parts[0] + ':'] + ' ') + rest;
      }
      var jo = join(parts, seps[j], d); if (jo !== undefined) return jo;
    }
    return undefined;
  }
  /* кілька речень: жадібно — найдовший шматок підряд іде кількох речень, що є в словнику (ключ буває з « » чи «. » на краю: у коді речення
     склеюються з попереднім), інакше — речення окремо */
  function chunk(c) {
    if (has(c)) return EN[c];
    if (has(' ' + c)) return EN[' ' + c].trim();
    if (has(c + ' ')) return EN[c + ' '].trim();
    if (has('. ' + c)) return EN['. ' + c].replace(/^\.\s*/, '');
    if (/\.$/.test(c) && c.length > 1) { var e = chunk(c.slice(0, -1)); if (e !== undefined) return /[.!?]$/.test(e) ? e : e + '.'; }  // крапку код додає окремо
    for (var i = c.lastIndexOf(', '); i > 0; i = c.lastIndexOf(', ', i - 1)) { if (!has(c.slice(i))) continue; var e1 = chunk(c.slice(0, i)); if (e1 !== undefined) return e1 + EN[c.slice(i)]; }  // «…» + «, не для вправ на поперек»
    return undefined;
  }
  function bySent(t, d) {
    var sent = t.replace(/([.!?…])\s+/g, '$1\u0001').split('\u0001');
    if (sent.length < 2) return undefined;
    var out = [], i = 0;
    while (i < sent.length) {
      var e = undefined, j;
      for (j = sent.length; j > i; j--) { e = chunk(sent.slice(i, j).join(' ')); if (e !== undefined) break; }
      if (e === undefined) { j = i + 1; e = CYR.test(sent[i]) ? look(sent[i], d + 1) : sent[i]; if (e === undefined) return undefined; }
      out.push(e); i = j;
    }
    return out.join(' ');
  }
  function join(parts, sep, d) {
    var out = [];
    for (var i = 0; i < parts.length; i++) { var p = parts[i]; if (!CYR.test(p)) { out.push(p); continue; } var e = look(p, d + 1); if (e === undefined && has(sep.trim() ? sep + p : p)) e = EN[sep + p].replace(sep, ''); if (e === undefined) return undefined; out.push(e); }
    return out.join(sep);
  }
  function tr(s) {
    if (lang !== 'en' || typeof s !== 'string' || !CYR.test(s)) return s;
    var e = look(s);
    if (e === undefined) { miss[s] = 1; return s; }
    return e;
  }
  function add(d) { for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) EN[k] = d[k]; }
  function set(v) { if (v !== 'en' && v !== 'uk') return false; try { localStorage.setItem(KEY, v); } catch (e) { return false; } chosen = true; return true; }
  /* перекладена копія даних: рядки — через словник, функції — їхні результати, масиви й обʼєкти — копії; оригінал не міняється */
  function deep(x, depth) {
    if (typeof x === 'string') return tr(x);
    if (!x || typeof x !== 'object' || depth > 12) return x;
    if (Array.isArray(x)) return x.map(function (y) { return deep(y, depth + 1); });
    var o = {};
    Object.keys(x).forEach(function (k) {
      var v = x[k];
      o[k] = typeof v === 'function' ? function () { return deep(v.apply(x, arguments), 0); } : deep(v, depth + 1);
    });
    return o;
  }
  function view(obj) {
    if (lang !== 'en' || !obj || typeof obj !== 'object') return obj;
    if (cache) { var c = cache.get(obj); if (c) return c; }
    var r = deep(obj, 0);
    if (cache) cache.set(obj, r);
    return r;
  }
  return {
    get lang() { return lang; }, get chosen() { return chosen; },
    L: L, tr: tr, add: add, set: set, view: view,
    locale: function () { return lang === 'en' ? 'en-US' : 'uk-UA'; },
    missing: function () { return Object.keys(miss); },
    size: function () { return Object.keys(EN).length; },
    _force: function (v) { lang = v; cache = typeof WeakMap === 'function' ? new WeakMap() : null; }  // лише для тестів
  };
})();
/* глобальні помічники: LL(укр, англ), TR(укр) — назви, яких у коді немає (L і tr там уже зайняті локальними змінними) */
var LL = I18N.L, TR = I18N.tr;
if (typeof module !== 'undefined') module.exports = I18N;
