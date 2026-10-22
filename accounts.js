/* Вхід у застосунок: один користувач на телефоні, захист — Face ID (ключ доступу WebAuthn, без сервера) і запасний PIN.
   Це замок на дверях застосунку, а не шифрування: дані лишаються в телефоні, захищеному його власним блокуванням.
   Список «Хто тренується?» показується лише тим, у кого з попередньої версії лишилося кілька користувачів.
   Після входу запускає застосунок (APP_START). Уся розмітка — у #app, стилі — з index.html. */
/* знак застосунку (штанга) — спільний для екрана входу й застосунку */
window.MARK_SVG = '<svg class="mark" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" style="fill:var(--mark-tile)"/><g fill="#fff"><rect x="88" y="240" width="336" height="32"/><rect x="110" y="196" width="28" height="120"/><rect x="146" y="160" width="40" height="192"/><rect x="326" y="160" width="40" height="192"/><rect x="374" y="196" width="28" height="120"/></g><rect x="186" y="240" width="140" height="32" fill="#c8a96a"/></svg>';
var ACC = (function () {
  var OK = 'trening_acc_ok', LOCK_MIN = 5, app = null, busy = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } return null; }

  /* ---------- Face ID: ключ доступу на цьому телефоні ---------- */
  function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function b64u(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  async function canFace() {
    try { return !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
  }
  /* Створити ключ (iPhone спитає Face ID). Викликати лише з натискання. */
  async function enroll(id) {
    var a = STORE.account(id); if (!a) throw new Error('немає акаунта');
    var cred = await navigator.credentials.create({ publicKey: {
      challenge: rnd(32), rp: { name: 'Тренування', id: location.hostname },
      user: { id: rnd(16), name: a.name + ' · Тренування', displayName: a.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none' } });
    STORE.update(id, { cred: b64u(cred.rawId) });
  }
  /* Перевірити обличчя. true — лише якщо телефон підтвердив особу (прапорець UV). */
  async function faceOk(id) {
    var a = STORE.account(id); if (!a || !a.cred) return false;
    var as = await navigator.credentials.get({ publicKey: {
      challenge: rnd(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: unb64u(a.cred), transports: ['internal', 'hybrid'] }] } });
    var flags = new Uint8Array(as.response.authenticatorData)[32];
    return !!(flags & 0x04);
  }

  /* ---------- PIN: 4 цифри, зберігається лише відбиток (PBKDF2) ---------- */
  async function pinHash(pin, salt) {
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64u(salt), iterations: 60000, hash: 'SHA-256' }, key, 256);
    return b64u(bits);
  }
  async function setPin(id, pin) { var salt = b64u(rnd(16)); STORE.update(id, { pin: { s: salt, h: await pinHash(pin, salt) } }); }
  async function pinOk(id, pin) { var a = STORE.account(id); if (!a || !a.pin) return false; return (await pinHash(pin, a.pin.s)) === a.pin.h; }
  /* 5 помилок поспіль — пауза 30 с (рахунок — у реєстрі, переживає перезапуск) */
  function waitLeft(id) { var a = STORE.account(id) || {}; return Math.max(0, Math.ceil(((a.waitUntil || 0) - Date.now()) / 1000)); }
  function miss(id) { var a = STORE.account(id) || {}, n = (a.fails || 0) + 1; STORE.update(id, n >= 5 ? { fails: 0, waitUntil: Date.now() + 30000 } : { fails: n }); }
  function clearFails(id) { STORE.update(id, { fails: undefined, waitUntil: undefined }); }

  function locked(id) { var a = STORE.account(id); return !!(a && (a.cred || a.pin)); }
  function open(id) { STORE.use(id); ss(OK, id); try { localStorage.setItem('trening_seen', String(Date.now())); } catch (e) { /* немає */ } app.innerHTML = ''; window.APP_START(); }

  /* ---------- екрани ---------- */
  function tile(name) { return '<span class="acct">' + esc((String(name || '?').trim()[0] || '?').toUpperCase()) + '</span>'; }
  function isEmpty(a) { var db = STORE.loadOf(a.id); return a.name === 'Новий акаунт' && !db.active && !Object.keys(db.profiles || {}).length; }
  function picker(msg) {
    /* порожніх «Новий акаунт» (кинута анкета) лишаємо щонайбільше один */
    var empties = STORE.accounts().filter(isEmpty);
    empties.slice(0, -1).forEach(function (a) { STORE.remove(a.id); });
    var list = STORE.accounts();
    if (list.length === 1) return enter(list[0].id);
    app.innerHTML = '<div class="brand">' + window.MARK_SVG + '<b>Тренування</b></div><h1>Хто тренується?</h1>' +
      (msg ? '<div class="note small">' + esc(msg) + '</div>' : '') +
      '<div class="pick acc">' + list.map(function (a) {
        return '<button type="button" data-acc="' + esc(a.id) + '">' + tile(a.name) + '<span><b>' + esc(a.name) + (locked(a.id) ? ' 🔒' : '') + '</b><span class="small muted">' + esc(a.sub || (a.id === 'a1' ? 'Наявні тренування' : 'Програму ще не складено')) + '</span></span></button>';
      }).join('') + '</div><p class="tiny muted">Дані зберігаються лише в цьому телефоні.</p>';
  }
  /* відкрити користувача: із захистом — через екран входу */
  function enter(id) { return locked(id) ? lockScreen(id) : open(id); }
  function lockScreen(id, msg) {
    var a = STORE.account(id); if (!a) return picker();
    var w = waitLeft(id);
    app.innerHTML = '<div class="brand">' + window.MARK_SVG + '<b>Тренування</b></div><div class="lockbox">' + tile(a.name) + '<h1>' + esc(a.name) + '</h1>' +
      (msg ? '<div class="note b small">' + esc(msg) + '</div>' : '') +
      (a.cred ? '<button type="button" class="pri wide big" data-face="' + esc(id) + '">Увійти з Face ID</button><p></p>' : '') +
      (a.pin ? '<label class="f">PIN-код</label><input id="pinIn" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••"' + (w ? ' disabled' : '') + '>' +
        '<button type="button" class="wide" data-pin="' + esc(id) + '"' + (w ? ' disabled' : '') + '>' + (w ? 'Зачекайте ' + w + ' с' : 'Увійти з PIN') + '</button>' : '') +
      (STORE.accounts().length > 1 ? '<p></p><button type="button" class="ghost wide" data-acc-list="1">Інший користувач</button>' : '') +
      '<p></p><button type="button" class="ghost wide" data-reset="' + esc(id) + '">Забули PIN?</button></div>';
    if (w) setTimeout(function () { if (document.querySelector('[data-pin="' + id + '"]')) lockScreen(id); }, w * 1000 + 200);
  }
  /* Забули PIN, а Face ID не працює: почати заново. Нічого не відкриває — лише стирає дані цього користувача. */
  function resetScreen(id) {
    app.innerHTML = '<div class="brand">' + window.MARK_SVG + '<b>Тренування</b></div><div class="lockbox"><h1>Почати заново?</h1>' +
      '<div class="note b small">Без PIN чи Face ID відкрити ці дані не можна. Можна лише видалити їх і пройти анкету знову. Усі тренування, заміри й фото на цьому телефоні буде стерто.</div>' +
      '<p class="small">Є резервна копія? Після анкети відкрийте її: «Більше» → «Відновити з копії».</p>' +
      '<button type="button" class="wide danger" data-reset-yes="' + esc(id) + '">Видалити все й почати заново</button><p></p>' +
      '<button type="button" class="pri wide" data-reset-no="' + esc(id) + '">Назад до входу</button></div>';
  }
  /* стерти користувача й почати з анкети */
  function wipe(id) { return STORE.remove(id).then(function () { ss(OK, null); ss('trening_pick', null); location.reload(); }); }

  async function onClick(e) {
    var b = e.target.closest('[data-acc],[data-acc-list],[data-face],[data-pin],[data-reset],[data-reset-yes],[data-reset-no]'); if (!b) return;
    var d = b.dataset;
    if (d.accList) return picker();
    if (d.reset) return resetScreen(d.reset);
    if (d.resetNo) return lockScreen(d.resetNo);
    if (d.resetYes) { if (busy) return; busy = true; b.disabled = true; return wipe(d.resetYes); }
    if (d.acc) {
      var id = d.acc;
      if (!locked(id)) return open(id);
      lockScreen(id);
      var a = STORE.account(id);
      /* одразу Face ID — дотик до імені вже є жестом користувача */
      if (a.cred) tryFace(id);
      return;
    }
    if (d.face) return tryFace(d.face);
    if (d.pin) {
      if (busy) return;
      var pid = d.pin, inp = document.getElementById('pinIn'), v = inp ? inp.value.trim() : '';
      if (waitLeft(pid)) return lockScreen(pid);
      if (!/^\d{4}$/.test(v)) return lockScreen(pid, 'PIN — 4 цифри');
      /* поки звіряємо — кнопка зайнята: повторні натискання не рахуються як помилки */
      busy = true; b.disabled = true; b.textContent = 'Перевіряю…';
      try {
        if (await pinOk(pid, v)) { clearFails(pid); return open(pid); }
        miss(pid);
        /* поки звіряли, людина могла перейти на інший екран — тоді не повертаємо її назад */
        if (document.querySelector('[data-pin]')) lockScreen(pid, 'Невірний PIN');
      }
      finally { busy = false; }
    }
  }
  async function tryFace(id) {
    try { if (await faceOk(id)) { clearFails(id); return open(id); } lockScreen(id, 'Телефон не підтвердив особу'); }
    catch (e) { lockScreen(id, e && e.name === 'NotAllowedError' ? 'Face ID скасовано або не спрацював — спробуйте ще або введіть PIN' : 'Face ID недоступний — введіть PIN'); }
  }

  /* ---------- запуск ---------- */
  function boot() {
    app = document.getElementById('app');
    app.addEventListener('click', function (e) { if (!window.APP_STARTED) onClick(e); });
    app.addEventListener('keydown', function (e) { if (!window.APP_STARTED && e.key === 'Enter' && e.target.id === 'pinIn') { var b = document.querySelector('[data-pin]'); if (b) b.click(); } });
    var list = STORE.accounts(), want = ss('trening_pick');
    ss('trening_pick', null);
    /* перший запуск — одразу анкета */
    if (!list.length) return open(STORE.create('Новий акаунт'));
    /* та сама сесія (оновлення сторінки) — без повторного входу */
    var okId = ss(OK);
    if (okId && STORE.account(okId) && !want) return open(okId);
    if (want && want.indexOf('lock:') === 0 && STORE.account(want.slice(5))) return lockScreen(want.slice(5));
    if (list.length === 1) return enter(list[0].id);
    picker();
  }
  /* Повернутися до вибору (switch) або заблокувати (lock) — через перезапуск сторінки, щоб стан застосунку не змішувався. */
  function leave(kind) { var id = STORE.current; ss(OK, null); ss('trening_pick', kind === 'lock' ? 'lock:' + id : 'pick'); location.reload(); }
  /* Автоблокування: застосунок не відкривали понад LOCK_MIN хв. */
  function watch() {
    var hidden = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { hidden = Date.now(); return; }
      var id = STORE.current;
      if (hidden && id && locked(id) && Date.now() - hidden > LOCK_MIN * 60000) leave('lock');
    });
  }

  return { boot: boot, leave: leave, watch: watch, wipe: wipe, canFace: canFace, enroll: enroll, faceOk: faceOk, setPin: setPin, pinOk: pinOk, locked: locked,
    disable: function (id) { STORE.update(id, { cred: undefined, pin: undefined, fails: undefined, waitUntil: undefined }); } };
})();
ACC.boot();
ACC.watch();
