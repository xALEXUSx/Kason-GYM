/* Голосовий тренер: системний синтез мовлення (українські голоси телефону), без мережі.
   Тексти фраз — чисті функції (перевіряються в node); озвучення — лише в браузері. */
var VOICE = (function () {
  var synth = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;
  var cfg = { on: true, level: 'full', rate: 1, uri: null }, voices = [], unlocked = false;
  var onSpeak = null, watch = null, talking = false;
  /* Стежимо, коли голос замовк, — щоб плавно повернути гучність радіо. */
  function setTalking(v) { if (v === talking) return; talking = v; if (onSpeak) try { onSpeak(v); } catch (e) { /* немає */ } }
  function startWatch() {
    clearInterval(watch); setTalking(true);
    var quiet = 0;
    watch = setInterval(function () {
      if (synth && (synth.speaking || synth.pending)) { quiet = 0; return; }
      if (++quiet >= 2) { clearInterval(watch); watch = null; setTalking(false); }
    }, 200);
  }

  function plural(n, a, b, c) { var x = Math.abs(n) % 10, y = Math.abs(n) % 100; return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c; }
  /* Число вголос: 12,5 → «12 з половиною», 13,25 → «13 і чверть», 13,75 → «13 і три чверті». */
  function numWords(x) {
    var n = Math.round(Number(x) * 100) / 100, whole = Math.floor(n), fr = Math.round((n - whole) * 100);
    if (fr === 0) return String(whole);
    if (fr === 50) return whole + ' з половиною';
    if (fr === 25) return (whole ? whole + ' і ' : '') + 'чверть';
    if (fr === 75) return (whole ? whole + ' і ' : '') + 'три чверті';
    return String(n).replace('.', ',');
  }
  function kg(x) {
    var n = Math.round(Number(x) * 100) / 100;
    if (n !== Math.floor(n)) return numWords(n) + ' кілограма';
    return n + ' ' + plural(n, 'кілограм', 'кілограми', 'кілограмів');
  }
  function secs(n) { return n + ' ' + plural(n, 'секунда', 'секунди', 'секунд'); }
  function reps(n) { return n + ' ' + plural(n, 'повторення', 'повторення', 'повторень'); }
  /* Ціль підходу: ex — вправа, s — підхід {load, reps, type}, it — {min, max}. */
  /* Ціль підходу окремими реченнями — кожне речення окремо записується в голосовий пакет. */
  function cap(t) { t = String(t); return t.charAt(0).toUpperCase() + t.slice(1); }
  function target(ex, s, it, side) {
    var out = [], hasLoad = s.load !== null && s.load !== undefined && s.load !== '';
    if (ex.type === 'band') { if (hasLoad) out.push('Рівень ' + numWords(s.load) + '.'); }
    else if (ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load)) {
      if (!hasLoad) { if (ex.type === 'dbopt') out.push('Без гантелі.'); }
      else if (Number(s.load) === 0) out.push('Лише гриф.');
      else { out.push(cap(kg(s.load)) + ' дисків.'); if (side && side.length) out.push('На кожен бік — ' + side.map(numWords).join(' плюс ') + '.'); }
    }
    if (ex.type === 'amrap') out.push('Скільки зможете, із запасом два.');
    else if (s.type === 'M') out.push('До відмови.');
    else if (ex.type === 'time') out.push(it.min === it.max || !it.max ? cap(secs(s.reps || it.max)) + '.' : 'Від ' + it.min + ' до ' + secs(it.max) + '.');
    else if (s.type === 'W') { out.push(cap(reps(s.reps || 12)) + '.'); out.push('Легко.'); }
    else if (it.max) out.push(it.min === it.max ? cap(reps(it.max)) + '.' : 'Від ' + it.min + ' до ' + reps(it.max) + '.');
    if (ex.side) out.push('Для кожної сторони.');
    return out.join(' ');
  }
  /* Коротка порада: перші речення поради, доки не набереться ≈ 50 знаків. */
  function firstSentence(t) {
    var parts = String(t || '').match(/[^.!?]+[.!?]+/g) || [String(t || '')], out = '';
    for (var i = 0; i < parts.length && out.length < 50; i++) out += (out ? ' ' : '') + parts[i].trim();
    return out;
  }

  /* Текст для голосу: символи й скорочення — словами (5 хв → 5 хвилин, 20–30 с → від 20 до 30 секунд). */
  var UNITS = [[/(\d+)\s*хв\.?(?=[\s.,;:!?)]|$)/g, ['хвилина', 'хвилини', 'хвилин']], [/(\d+)\s*с(?=[\s.,;:!?)]|$)/g, ['секунда', 'секунди', 'секунд']], [/(\d+)\s*кг(?=[\s.,;:!?)]|$)/g, ['кілограм', 'кілограми', 'кілограмів']]];
  function norm(t) {
    var a = String(t).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\s·\s/g, ', ').replace(/×/g, ' на ').replace(/≈\s*/g, 'приблизно ').replace(/(\d)°/g, '$1 градусів').replace(/\s–\s/g, ', ').replace(/по (\d+)–(\d+)/g, 'по $1-$2').replace(/(\d+)–(\d+)/g, 'від $1 до $2');
    UNITS.forEach(function (u) { a = a.replace(u[0], function (m, n) { return n + ' ' + plural(Number(n), u[1][0], u[1][1], u[1][2]); }); });
    return a.trim();
  }
  /* Речення для голосового пакета: кожне — окремий запис. */
  /* новий рядок — теж межа запису (пункти списку без крапок, як-от розминка) */
  function split(text) {
    var out = [];
    norm(text).split(/\n+/).forEach(function (part) { (part.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).forEach(function (x) { x = x.trim(); if (x) out.push(x); }); });
    return out;
  }

  /* ---------- браузер ---------- */
  function ukVoices() { return voices.filter(function (v) { return /^uk/i.test(v.lang || ''); }); }
  function chosen() {
    var uk = ukVoices(); if (!uk.length) return null;
    for (var i = 0; i < uk.length; i++) if (uk[i].voiceURI === cfg.uri) return uk[i];
    return uk[0];
  }
  function loadVoices() { if (synth) { try { voices = synth.getVoices() || []; } catch (e) { voices = []; } } }
  function init(c) {
    if (c) cfg = c;
    if (!synth) return;
    loadVoices();
    try { synth.addEventListener('voiceschanged', loadVoices); } catch (e) { synth.onvoiceschanged = loadVoices; }
  }
  function ready() { loadVoices(); return !!(synth && cfg.on && chosen()); }
  /* iOS дозволяє синтез лише після першого виклику під час дотику; далі — і з таймера. */
  function unlock() {
    if (!synth || unlocked || !cfg.on) return;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); unlocked = true; } catch (e) { /* немає */ }
  }
  function say(text, keep) {
    if (!text || !ready()) return false;
    try {
      if (!keep) synth.cancel();
      var v = chosen(), u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = cfg.rate || 1;
      synth.speak(u); unlocked = true; startWatch();
      return true;
    } catch (e) { return false; }
  }
  function stop() { if (synth) try { synth.cancel(); } catch (e) { /* немає */ } }
  function busy() { return !!(synth && (synth.speaking || synth.pending)); }
  function list() { loadVoices(); return ukVoices().map(function (v) { return { uri: v.voiceURI, name: v.name }; }); }

  return { norm: norm, split: split, cap: cap, plural: plural, numWords: numWords, kg: kg, secs: secs, reps: reps, target: target, firstSentence: firstSentence,
           init: init, ready: ready, unlock: unlock, say: say, stop: stop, list: list, busy: busy,
           onSpeaking: function (f) { onSpeak = f; },
           get supported() { return !!synth; }, get cfg() { return cfg; } };
})();
if (typeof module !== 'undefined') module.exports = VOICE;
