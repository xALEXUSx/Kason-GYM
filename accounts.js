var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Вхід у застосунок: один користувач на телефоні, без коду й Face ID — застосунок відкривається одразу
   (рішення Alexа 23.10: «взагалі цей захист зайвий»; кому потрібно — захист самого iPhone). Дані лишаються лише в телефоні.
   Код і Face ID, увімкнені до 3.11.1, знімаються під час запуску — дані не зачіпаються.
   Список «Хто тренується?» показується лише тим, у кого з попередньої версії лишилося кілька користувачів.
   Після входу запускає застосунок (APP_START). Уся розмітка — у #app, стилі — з index.html. */
/* BRAND — згенеровано tools/logo/build.mjs (не правити руками). Логотип FORTES з 3.27.2: знак «F-стрілка» (сітка 3 × 3 — верхній ряд і лівий
   стовпчик, центр охровий; читається як «F» і стрілка ↖) і назва кривими Satoshi Bold — шрифт бренду Kason для латиниці; design/logo/README.md */
window.MARK_SVG = '<svg class="mark" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" style="fill:var(--mark-tile)"/><g fill="#fff"><rect x="124" y="124" width="84" height="84"/><rect x="226" y="124" width="84" height="84"/><rect x="328" y="124" width="84" height="84"/><rect x="124" y="226" width="84" height="84"/><rect x="124" y="328" width="84" height="84"/></g><rect x="226" y="226" width="84" height="84" fill="#c8a96a"/></svg>';
window.WORD_SVG = '<svg class="word" viewBox="81 -744 4088.67 757" width="62.64" height="11.60" role="img" aria-label="FORTES"><g fill="currentColor" transform="scale(1,-1)"><path transform="translate(0,0)" d="M481 299L481 414L209 414L209 613L533 613L533 731L81 731L81 0L209 0L209 299Z"/><path transform="translate(650.33,0)" d="M748 366C748 589 602 744 393 744C184 744 39 588 39 366C39 143 183 -12 392 -12C602 -12 748 144 748 366ZM613 366C613 212 527 111 393 111C259 111 173 210 173 366C173 522 259 621 393 621C527 621 613 522 613 366Z"/><path transform="translate(1519.67,0)" d="M209 0L209 273L366 273L490 0L630 0L491 300C577 335 623 405 623 503C623 647 526 731 360 731L81 731L81 0ZM209 617L360 617C441 617 489 576 489 503C489 429 441 386 360 386L209 386Z"/><path transform="translate(2263,0)" d="M17 613L231 613L231 0L359 0L359 613L573 613L573 731L17 731Z"/><path transform="translate(2936.33,0)" d="M535 0L535 118L209 118L209 312L501 312L501 425L209 425L209 613L535 613L535 731L81 731L81 0Z"/><path transform="translate(3612.67,0)" d="M39 527C39 415 104 344 228 317L344 291C404 278 429 249 429 200C429 139 375 102 290 102C208 102 158 139 157 201L29 201C32 70 134 -13 290 -13C451 -13 557 75 557 211C557 320 496 384 371 411L256 436C195 450 167 479 167 531C167 592 218 630 297 630C369 630 414 593 417 530L545 530C541 662 447 744 299 744C145 744 39 655 39 527Z"/></g></svg>';
/* знак і назва на полотні (картинка «Поділитися»): x — лівий край, base — базова лінія, cap — висота великої літери (= висоті знака), fg / ac — колір і охра */
window.BRAND_DRAW = function (g, x, base, cap, fg, ac) {
  var W = [[0,"M481 299L481 414L209 414L209 613L533 613L533 731L81 731L81 0L209 0L209 299Z"],[650.33,"M748 366C748 589 602 744 393 744C184 744 39 588 39 366C39 143 183 -12 392 -12C602 -12 748 144 748 366ZM613 366C613 212 527 111 393 111C259 111 173 210 173 366C173 522 259 621 393 621C527 621 613 522 613 366Z"],[1519.67,"M209 0L209 273L366 273L490 0L630 0L491 300C577 335 623 405 623 503C623 647 526 731 360 731L81 731L81 0ZM209 617L360 617C441 617 489 576 489 503C489 429 441 386 360 386L209 386Z"],[2263,"M17 613L231 613L231 0L359 0L359 613L573 613L573 731L17 731Z"],[2936.33,"M535 0L535 118L209 118L209 312L501 312L501 425L209 425L209 613L535 613L535 731L81 731L81 0Z"],[3612.67,"M39 527C39 415 104 344 228 317L344 291C404 278 429 249 429 200C429 139 375 102 290 102C208 102 158 139 157 201L29 201C32 70 134 -13 290 -13C451 -13 557 75 557 211C557 320 496 384 371 411L256 436C195 450 167 479 167 531C167 592 218 630 297 630C369 630 414 593 417 530L545 530C541 662 447 744 299 744C145 744 39 655 39 527Z"]], k = cap / 48, s = cap / 731;
  g.save(); g.fillStyle = fg;
  [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 1]].forEach(function (p, i) { if (i === 5) g.fillStyle = ac; g.fillRect(x + p[0] * 17 * k, base - cap + p[1] * 17 * k, 14 * k, 14 * k); });
  g.fillStyle = fg; g.translate(x + 48 * k + cap * 0.5 - 81 * s, base); g.scale(s, -s);
  W.forEach(function (w) { g.save(); g.translate(w[0], 0); g.fill(new Path2D(w[1])); g.restore(); });
  g.restore();
};
/* /BRAND */
var ACC = (function () {
  var OK = 'trening_acc_ok', app = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } return null; }

  /* старі код і Face ID (до 3.11.1) — знімаємо: захисту в застосунку більше немає */
  function unlock(id) { var a = STORE.account(id); if (a && (a.pin || a.cred || a.fails || a.waitUntil)) STORE.update(id, { cred: undefined, pin: undefined, fails: undefined, waitUntil: undefined }); }
  function open(id) { unlock(id); STORE.use(id); ss(OK, id); try { localStorage.setItem('trening_seen', String(Date.now())); } catch (e) { /* немає */ } app.innerHTML = ''; window.APP_START(); }

  /* ---------- вибір користувача (лише якщо з попередньої версії їх кілька) ---------- */
  function tile(name) { return '<span class="acct">' + esc((String(name || '?').trim()[0] || '?').toUpperCase()) + '</span>'; }
  /* «Новий акаунт» — і англійською («New account», з 3.17.0): нерозпочатий акаунт будь-якою мовою */
  function isNewName(n) { return n === 'Новий акаунт' || n === 'New account'; }
  function isEmpty(a) { var db = STORE.loadOf(a.id); return isNewName(a.name) && !db.active && !Object.keys(db.profiles || {}).length; }
  function picker() {
    /* порожніх «Новий акаунт» (кинута анкета) лишаємо щонайбільше один */
    var empties = STORE.accounts().filter(isEmpty);
    empties.slice(0, -1).forEach(function (a) { STORE.remove(a.id); });
    var list = STORE.accounts();
    if (list.length === 1) return open(list[0].id);
    app.innerHTML = '<div class="brand">' + window.MARK_SVG + window.WORD_SVG + LL('</div><h1>Хто тренується?</h1>', "</div><h1>Who’s training?</h1>") +
      '<div class="pick acc">' + list.map(function (a) {
        return '<button type="button" data-acc="' + esc(a.id) + '">' + tile(a.name) + '<span><b>' + esc(a.name) + '</b><span class="small muted">' + esc((a.sub && typeof I18N !== 'undefined' ? I18N.tr(a.sub) : a.sub) || (a.id === 'a1' ? LL('Наявні тренування', "Existing workouts") : LL('Програму ще не складено', "No program yet"))) + '</span></span></button>';
      }).join('') + LL('</div><p class="tiny muted">Дані зберігаються лише в цьому телефоні.</p>', "</div><p class=\"tiny muted\">Data is stored only on this phone.</p>");
  }
  /* стерти користувача й почати з анкети; це був останній користувач — знову вибір мови (до 3.19.0 мова лишалась від стертого:
     слово Alexа 23.10 «видалив данні та почав реєстрацію заново чомусь знову не пропонує вибрати мову») */
  function wipe(id) { return STORE.remove(id).then(function () { ss(OK, null); ss('trening_pick', null); if (!STORE.accounts().length && typeof I18N !== 'undefined' && I18N.forget) I18N.forget(); location.reload(); }); }

  /* ---------- запуск ---------- */
  function boot() {
    app = document.getElementById('app');
    app.addEventListener('click', function (e) { if (window.APP_STARTED) return; var b = e.target.closest('[data-acc]'); if (b) open(b.dataset.acc); });
    STORE.accounts().forEach(function (a) { unlock(a.id); });
    var list = STORE.accounts(), want = ss('trening_pick');
    ss('trening_pick', null);
    /* перший запуск — одразу анкета */
    if (!list.length) return open(STORE.create(LL('Новий акаунт', "New account")));
    /* та сама сесія (оновлення сторінки) — той самий користувач, якщо не просили змінити */
    var okId = ss(OK);
    if (okId && STORE.account(okId) && want !== 'pick') return open(okId);
    if (list.length === 1) return open(list[0].id);
    picker();
  }
  /* Змінити користувача — через перезапуск сторінки, щоб стан застосунку не змішувався. */
  function leave() { ss(OK, null); ss('trening_pick', 'pick'); location.reload(); }

  return { boot: boot, leave: leave, wipe: wipe };
})();
ACC.boot();
