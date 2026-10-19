/* Дані: журнал — localStorage (ключ версії 1, дані переносяться), фото — IndexedDB. Усе лише в цьому телефоні. */
var STORE = (function () {
  var KEY = 'trening_v1';
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); if (d && d.profiles) return ENGINE.migrate(d); } } catch (e) { /* немає сховища */ }
    return ENGINE.migrate({ v: 2, active: null, profiles: {}, lastBackup: null, settings: {} });
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; } }

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
  function putPhoto(rec) { return tx('readwrite', function (st) { st.put(rec); }); }
  function delPhoto(id) { return tx('readwrite', function (st) { st.delete(id); }); }
  function listPhotos(profileId) {
    return tx('readonly', function (st) { return st.getAll(); }).then(function (all) {
      return (all || []).filter(function (p) { return p.profile === profileId; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
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
  function allPhotos() { return tx('readonly', function (st) { return st.getAll(); }); }
  return { load: load, save: save, putPhoto: putPhoto, delPhoto: delPhoto, listPhotos: listPhotos, allPhotos: allPhotos, compress: compress, blobToData: blobToData, dataToBlob: dataToBlob };
})();
