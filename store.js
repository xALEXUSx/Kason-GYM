var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Дані: журнал — localStorage (ключ версії 1, дані переносяться), фото — IndexedDB. Усе лише в цьому телефоні. */
var STORE = (function () {
  /* Акаунти на одному телефоні: реєстр (імена, замок) і окремий журнал кожного.
     Перший акаунт лишається на старому ключі 'trening_v1' — наявні дані нікуди не переносяться. */
  var LEGACY = 'trening_v1', REG = 'trening_accounts', acc = null;
  function keyOf(id) { return id === 'a1' ? LEGACY : LEGACY + '@' + id; }
  function readReg() {
    try { var r = JSON.parse(localStorage.getItem(REG) || 'null'); if (r && Array.isArray(r.list)) return r; } catch (e) { /* немає */ }
    var r0 = { v: 1, list: [], last: null };
    try { if (localStorage.getItem(LEGACY)) { r0.list.push({ id: 'a1', name: LL('Мій акаунт', "My account"), created: Date.now() }); r0.last = 'a1'; writeReg(r0); } } catch (e) { /* немає сховища */ }
    return r0;
  }
  function writeReg(r) { try { localStorage.setItem(REG, JSON.stringify(r)); return true; } catch (e) { return false; } }
  function accounts() { return readReg().list; }
  function account(id) { return accounts().filter(function (a) { return a.id === id; })[0] || null; }
  function use(id) { acc = id; var r = readReg(); r.last = id; writeReg(r); }
  function update(id, fields) { var r = readReg(); r.list.forEach(function (a) { if (a.id === id) Object.keys(fields).forEach(function (k) { if (fields[k] === undefined) delete a[k]; else a[k] = fields[k]; }); }); writeReg(r); }
  function create(name) {
    var r = readReg(), id = r.list.length || localStorage.getItem(LEGACY) ? 'a' + Date.now().toString(36) : 'a1';
    r.list.push({ id: id, name: name, created: Date.now() }); writeReg(r); return id;
  }
  function remove(id) {
    var r = readReg(); r.list = r.list.filter(function (a) { return a.id !== id; }); if (r.last === id) r.last = r.list.length ? r.list[0].id : null; writeReg(r);
    try { localStorage.removeItem(keyOf(id)); } catch (e) { /* немає */ }
    return tx('readonly', function (st) { return st.getAll(); }).then(function (all) {
      return Promise.all((all || []).filter(function (p) { return (p.acc || 'a1') === id; }).map(function (p) { return delPhoto(p.id); }));
    }).catch(function () { /* фото немає */ });
  }
  function loadOf(id) {
    try { var raw = localStorage.getItem(keyOf(id)); if (raw) { var d = JSON.parse(raw); if (d && d.profiles) return ENGINE.migrate(d); } } catch (e) { /* немає сховища */ }
    return ENGINE.migrate({ v: 2, active: null, profiles: {}, lastBackup: null, settings: {} });
  }
  function saveOf(id, db) { try { localStorage.setItem(keyOf(id), JSON.stringify(db)); return true; } catch (e) { return false; } }
  function load() { return loadOf(acc || 'a1'); }
  function save(db) { return saveOf(acc || 'a1', db); }

  var dbp = null;
  function idb() {
    return new Promise(function (res, rej) {
      if (dbp) return res(dbp);
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      var r = indexedDB.open('trening_photos', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('photos', { keyPath: 'id' }); };
      r.onsuccess = function () { dbp = r.result; res(dbp); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('photos', mode), st = t.objectStore('photos'), out = fn(st);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function putPhoto(rec) { if (!rec.acc) rec.acc = acc || 'a1'; return tx('readwrite', function (st) { st.put(rec); }); }
  function delPhoto(id) { return tx('readwrite', function (st) { st.delete(id); }); }
  function listPhotos(profileId) {
    return tx('readonly', function (st) { return st.getAll(); }).then(function (all) {
      return (all || []).filter(function (p) { return p.profile === profileId && (p.acc || 'a1') === (acc || 'a1'); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    });
  }
  /* Стискання фото до 1080 px по довшій стороні, JPEG 0,82. */
  function compress(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1080 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }
  function blobToData(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(b); }); }
  function dataToBlob(d) { var parts = d.split(','), bin = atob(parts[1]), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg' }); }
  function allPhotos() { return tx('readonly', function (st) { return st.getAll(); }).then(function (all) { return (all || []).filter(function (p) { return (p.acc || 'a1') === (acc || 'a1'); }); }); }
  return { accounts: accounts, account: account, use: use, update: update, create: create, remove: remove, loadOf: loadOf, saveOf: saveOf, get current() { return acc; },
    load: load, save: save, putPhoto: putPhoto, delPhoto: delPhoto, listPhotos: listPhotos, allPhotos: allPhotos, compress: compress, blobToData: blobToData, dataToBlob: dataToBlob };
})();
