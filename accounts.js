var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Вхід у застосунок: один користувач на телефоні, без коду й Face ID — застосунок відкривається одразу
   (рішення Alexа 23.10: «взагалі цей захист зайвий»; кому потрібно — захист самого iPhone). Дані лишаються лише в телефоні.
   Код і Face ID, увімкнені до 3.11.1, знімаються під час запуску — дані не зачіпаються.
   Список «Хто тренується?» показується лише тим, у кого з попередньої версії лишилося кілька користувачів.
   Після входу запускає застосунок (APP_START). Уся розмітка — у #app, стилі — з index.html. */
/* знак застосунку (штанга) — спільний для екрана вибору й застосунку */
window.MARK_SVG = '<svg class="mark" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" style="fill:var(--mark-tile)"/><g fill="#fff"><rect x="88" y="240" width="336" height="32"/><rect x="110" y="196" width="28" height="120"/><rect x="146" y="160" width="40" height="192"/><rect x="326" y="160" width="40" height="192"/><rect x="374" y="196" width="28" height="120"/></g><rect x="186" y="240" width="140" height="32" fill="#c8a96a"/></svg>';
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
    app.innerHTML = '<div class="brand">' + window.MARK_SVG + LL('<b>Тренування</b></div><h1>Хто тренується?</h1>', "<b>Workouts</b></div><h1>Who’s training?</h1>") +
      '<div class="pick acc">' + list.map(function (a) {
        return '<button type="button" data-acc="' + esc(a.id) + '">' + tile(a.name) + '<span><b>' + esc(a.name) + '</b><span class="small muted">' + esc((a.sub && typeof I18N !== 'undefined' ? I18N.tr(a.sub) : a.sub) || (a.id === 'a1' ? LL('Наявні тренування', "Existing workouts") : LL('Програму ще не складено', "No program yet"))) + '</span></span></button>';
      }).join('') + LL('</div><p class="tiny muted">Дані зберігаються лише в цьому телефоні.</p>', "</div><p class=\"tiny muted\">Data is stored only on this phone.</p>");
  }
  /* стерти користувача й почати з анкети */
  function wipe(id) { return STORE.remove(id).then(function () { ss(OK, null); ss('trening_pick', null); location.reload(); }); }

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
