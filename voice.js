var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
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

  function plural(n, a, b, c) { if (typeof I18N !== 'undefined' && I18N.lang === 'en') return Math.abs(n) === 1 ? a : c; var x = Math.abs(n) % 10, y = Math.abs(n) % 100; return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c; }
  /* Число вголос: 12,5 → «12 з половиною», 13,25 → «13 і чверть», 13,75 → «13 і три чверті». */
  function numWords(x) {
    var n = Math.round(Number(x) * 100) / 100, whole = Math.floor(n), fr = Math.round((n - whole) * 100);
    if (fr === 0) return String(whole);
    if (fr === 50) return whole + LL(' з половиною', " and a half");
    if (fr === 25) return (whole ? whole + LL(' і ', " and ") : '') + LL('чверть', "a quarter");
    if (fr === 75) return (whole ? whole + LL(' і ', " and ") : '') + LL('три чверті', "three quarters");
    return typeof I18N !== 'undefined' && I18N.lang === 'en' ? String(n) : String(n).replace('.', ',');
  }
  function kg(x) {
    var n = Math.round(Number(x) * 100) / 100;
    if (n !== Math.floor(n)) return numWords(n) + LL(' кілограма', " kilograms");
    return n + ' ' + plural(n, LL('кілограм', "kilogram"), LL('кілограми', "kilograms"), LL('кілограмів', "kilograms"));
  }
  function secs(n) { return n + ' ' + plural(n, LL('секунда', "second"), LL('секунди', "seconds"), LL('секунд', "seconds")); }
  function reps(n) { return n + ' ' + plural(n, LL('повторення', "rep"), LL('повторення', "reps"), LL('повторень', "reps")); }
  /* Ціль підходу: ex — вправа, s — підхід {load, reps, type}, it — {min, max}. */
  /* Ціль підходу окремими реченнями — кожне речення окремо записується в голосовий пакет. */
  function cap(t) { t = String(t); return t.charAt(0).toUpperCase() + t.slice(1); }
  function target(ex, s, it, side) {
    var out = [], hasLoad = s.load !== null && s.load !== undefined && s.load !== '';
    if (ex.type === 'band') { if (hasLoad) out.push(LL('Рівень ', "Level ") + numWords(s.load) + '.'); }
    else if (ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load)) {
      if (!hasLoad) { if (ex.type === 'dbopt') out.push(LL('Без гантелі.', "No dumbbell.")); }
      else if (Number(s.load) === 0) out.push(LL('Лише гриф.', "Handle only."));
      else { out.push(cap(kg(s.load)) + LL(' дисків.', " of plates.")); if (side && side.length) out.push(LL('На кожен бік — ', "Each side: ") + side.map(numWords).join(LL(' плюс ', " plus ")) + '.'); }
    }
    else if (ex.type === 'mach') { if (hasLoad) out.push(cap(kg(s.load)) + '.'); }  // тренажер чи блок: вага в кг, без дисків
    if (ex.type === 'amrap') out.push(LL('Скільки зможете, із запасом два.', "As many as you can, with two in reserve."));
    else if (s.type === 'M') out.push(LL('До відмови.', "To failure."));
    else if (ex.type === 'time') out.push(it.min === it.max || !it.max ? cap(secs(s.reps || it.max)) + '.' : LL('Від ', "From ") + it.min + LL(' до ', " to ") + secs(it.max) + '.');
    else if (s.type === 'W') { out.push(cap(reps(s.reps || 12)) + '.'); out.push(LL('Легко.', "Keep it light.")); }
    else if (it.max) out.push(it.min === it.max ? cap(reps(it.max)) + '.' : LL('Від ', "From ") + it.min + LL(' до ', " to ") + reps(it.max) + '.');
    if (ex.side) out.push(LL('Для кожної сторони.', "Each side."));
    return out.join(' ');
  }
  /* Коротка порада: перші речення поради, доки не набереться ≈ 50 знаків. */
  function firstSentence(t) {
    var parts = String(t || '').match(/[^.!?]+[.!?]+/g) || [String(t || '')], out = '';
    for (var i = 0; i < parts.length && out.length < 50; i++) out += (out ? ' ' : '') + parts[i].trim();
    return out;
  }

  /* Текст для голосу: символи й скорочення — словами (5 хв → 5 хвилин, 20–30 с → від 20 до 30 секунд). */
  var UNITS = [[/(\d+)\s*хв\.?(?=[\s.,;:!?)]|$)/g, [LL('хвилина', "minute"), LL('хвилини', "minutes"), LL('хвилин', "minutes")]], [/(\d+)\s*с(?=[\s.,;:!?)]|$)/g, [LL('секунда', "second"), LL('секунди', "seconds"), LL('секунд', "seconds")]], [/(\d+)\s*кг(?=[\s.,;:!?)]|$)/g, [LL('кілограм', "kilogram"), LL('кілограми', "kilograms"), LL('кілограмів', "kilograms")]]];
  /* англійською: min / sec / kg / lb → слова; × → times; ≈ → about; 8–12 → 8 to 12 */
  var UNITS_EN = [[/(\d+(?:\.\d+)?)\s*min\b\.?/g, ['minute', 'minutes']], [/(\d+(?:\.\d+)?)\s*(?:sec|s)\b\.?/g, ['second', 'seconds']], [/(\d+(?:\.\d+)?)\s*kg\b\.?/g, ['kilogram', 'kilograms']], [/(\d+(?:\.\d+)?)\s*lbs?\b\.?/g, ['pound', 'pounds']]];
  function normEn(t) {
    var a = String(t).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\s·\s/g, ', ').replace(/\s*×\s*/g, ' times ').replace(/≈\s*/g, 'about ').replace(/(\d)°/g, '$1 degrees').replace(/\s–\s/g, ', ').replace(/(\d+)–(\d+)/g, '$1 to $2');
    UNITS_EN.forEach(function (u) { a = a.replace(u[0], function (m, n) { return n + ' ' + (Number(n) === 1 ? u[1][0] : u[1][1]); }); });
    return a.trim();
  }
  function norm(t) {
    if (typeof I18N !== 'undefined' && I18N.lang === 'en') return normEn(t);
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
  /* голоси мови застосунку: українська — uk; англійська — спершу американські (en-US), потім будь-які англійські */
  function ukVoices() {
    if (typeof I18N !== 'undefined' && I18N.lang === 'en') { var us = voices.filter(function (v) { return /^en[-_]US/i.test(v.lang || ''); }); return us.length ? us : voices.filter(function (v) { return /^en/i.test(v.lang || ''); }); }
    return voices.filter(function (v) { return /^uk/i.test(v.lang || ''); });
  }
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
