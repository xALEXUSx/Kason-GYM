var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Журнал тренувань 3.0 — інтерфейс: режим «Тренер» з голосом, список, план, прогрес, тіло. Дані лише в цьому телефоні + резервна копія файлом. */
/* Запускає ACC (accounts.js) після вибору користувача й входу. */
window.APP_START = () => {
  'use strict';
  window.APP_STARTED = true;
  document.body.classList.add('started');
  const VERSION = '3.20.0';
  /* знак застосунку: штанга на плашці бренду (замість K), середина грифа — охра */
  const MARK = window.MARK_SVG;
  const app = document.getElementById('app');
  const sheetEl = document.getElementById('sheet'), sheetBg = document.getElementById('sheetBg');
  let DB = STORE.load();
  /* індивідуальна програма цього користувача — відтворюється з відповідей анкети;
     межа ваги на гриф — з його власного набору дисків (змінюється в «Більше» → «Гантелі») */
  function buildMe(answers) {
    const g = GEN.build(answers), base = g.cap;
    Object.defineProperty(g, 'cap', { configurable: true, enumerable: true, get: () => { const p = DB && DB.profiles && DB.profiles.me; return base && p && p.inv ? ENGINE.capOf(p.inv) || base : base; } });
    /* вправи з історії, яких уже немає в програмі (змінили місце, обладнання чи обмеження), — «вибулі»: назва в історії,
       графіки й рекорди в «Прогресі», обсяг у звітах лишаються; у тренування й заміни вони не потрапляють */
    const pr = DB && DB.profiles && DB.profiles.me, first = answers.sex === 'f' ? 'her' : 'him', other = first === 'her' ? 'him' : 'her';
    ((pr && pr.sessions) || []).forEach((s) => (s.sets || []).forEach((x) => {
      if (g.ex[x.ex]) return;
      const def = PROGRAMS[first].ex[x.ex] || PROGRAMS[other].ex[x.ex] || GEN.GYM.ex[x.ex];
      if (def) { g.ex[x.ex] = Object.assign({}, def, { retired: true }); g.coachFrom[x.ex] = def.gym ? 'gym' : PROGRAMS[first].ex[x.ex] ? first : other; }
    }));
    return g;
  }
  if (DB.custom && DB.custom.answers) PROGRAMS.me = buildMe(DB.custom.answers);
  DB = fixProfiles(DB);
  /* інша кількість тренувань на тиждень — той самий тиждень і місце в ньому (номер тренування n рахується від неї) */
  /* …і по черзі: наступне — не те саме тренування, що останнє (А після А), якщо в цьому тижні є інше */
  function keepWeek(p, oldPw, prog) {
    const newPw = prog && prog.perWeek;
    if (!p || !(oldPw > 0) || !(newPw > 0) || oldPw === newPw) return;
    const n = p.sessions.length + (p.offset || 0), w = Math.floor(n / oldPw), last = (p.sessions[p.sessions.length - 1] || {}).workout;
    let s = Math.min(n % oldPw, newPw - 1);
    for (let k = s; k < newPw; k++) if (ENGINE.planFor(prog, w * newPw + k).workout !== last) { s = k; break; }
    p.offset = (p.offset || 0) + w * newPw + s - n;
  }
  /* анкета — єдине джерело програми: правки поза нею (дні, гриф і диски в «Більше», зріст і вік у «Харчуванні») пишемо й туди,
     інакше програма їх не бачить, а «Змінити анкету» повертає старі значення */
  function syncAnswers(patch) {
    const a = DB.custom && DB.custom.answers; if (!a) return;
    const oldPw = PROGRAMS.me && PROGRAMS.me.perWeek;
    Object.assign(a, JSON.parse(JSON.stringify(patch)));
    PROGRAMS.me = buildMe(a); keepWeek(DB.profiles.me, oldPw, PROGRAMS.me);
    if (STORE.current) STORE.update(STORE.current, { sub: PROGRAMS.me.sub });
  }
  /* до 3.9.3 ці правки в анкету не потрапляли — зводимо при запуску й після відновлення старої копії (далі вони однакові) */
  function syncLegacy() {
    const a = DB.custom && DB.custom.answers, p = DB.profiles && DB.profiles.me; if (!a || !p) return;
    const patch = {}, me = p.me || {}, srt = (x) => (x || []).slice().sort().join();
    if (Array.isArray(p.days) && p.days.length >= 2 && p.days.length <= 4 && srt(p.days) !== srt(a.days)) patch.days = p.days.slice().sort();
    if (p.handle !== undefined && p.handle !== a.handle) patch.handle = p.handle;
    const ks = p.units === 'lb' ? ['10', '5', '2.5'] : ['5', '2.5', '1.25'];  // набір у фунтах — свої розміри (з 3.18.0)
    if (p.inv && ks.some((k) => Number(p.inv[k]) !== Number((a.inv || {})[k]))) patch.inv = Object.assign({}, p.inv);
    if (me.age >= 16 && me.age <= 85 && me.age !== Number(a.age)) patch.age = me.age;
    if (me.height >= 130 && me.height <= 220 && me.height !== Number(a.height)) patch.height = me.height;
    if (Object.keys(patch).length) { syncAnswers(patch); STORE.save(DB); }
  }
  syncLegacy();
  /* підпис у списку «Хто тренується?» — назва програми (для старих журналів — одразу) */
  { const acc = STORE.account(STORE.current); if (acc && !acc.sub && DB.active && PROGRAMS[DB.active]) STORE.update(STORE.current, { sub: PROGRAMS[DB.active].title }); }
  function fixProfiles(db) { Object.keys(db.profiles || {}).forEach((id) => { const p = db.profiles[id]; if (p && !Array.isArray(p.days) && PROGRAMS[id]) p.days = PROGRAMS[id].days.slice(); }); return db; }
  VOICE.init(DB.settings.voice);
  RADIO.setDuck(DB.settings.radio.duck);
  let view = DB.active ? 'home' : 'onboard';
  const ui = { ob: 1, obProg: null, progTab: 'ex', progEx: null, metric: 'e1rm', range: 'all', musDays: 7, repMonth: null, bodyTab: 'm', planTab: 'w', calMonth: null, summary: null, photoPose: 'front', cmp: 50 };
  let audio = null, wakeLock = null, kp = null;
  /* голосовий тренер-співрозмовник: розмова, запис, сеанс Gemini Live, потоковий звук; gen — номер дії: нова дія глушить усі попередні */
  const ASK = { chat: [], st: 'idle', msg: '', rec: null, t0: 0, tick: null, i: -1, gen: 0, help: false, warn: false, photo: null };  // photo — фото до наступного питання { b64, src }
  const LIVE = { ws: null, ready: null, turn: null, prog: '' };
  const PLAY = { t: 0, srcs: [] };
  /* телефон: Android чи iPhone — лише для підказок «як встановити / дозволити» (поведінка застосунку однакова, кроки різні).
     Ні те, ні те (компʼютер) — підказки iPhone. TX(айфон, андроїд) — текст для цього телефона. */
  const PLAT = { android: /Android/i.test(navigator.userAgent || '') };
  const TX = (ios, android) => (PLAT.android ? android : ios);
  /* Android (Chrome): кнопка «Установити» — системне віконце встановлення; немає події — підказка через меню Chrome */
  let installEv = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEv = e; if (!document.body.classList.contains('sheet') && (view === 'home' || view === 'more')) render(); });
  window.addEventListener('appinstalled', () => { installEv = null; });
  const installNote = (head) => TX(`<div class="note w small"><b>${head}${LL(`:</b> Safari → «Поділитися» → «На початковий екран» і відкривайте лише з іконки (в іконки й у Safari окремі сховища).</div>`, `:</b> Safari → “Share” → “Add to Home Screen,” then open it only from the icon (the icon and Safari keep separate storage).</div>`)}`,
    installEv ? `<div class="note w small sp"><span><b>${head}${LL(`</b> — відкриватиметься з іконки на весь екран.</span><button type="button" class="sm pri" data-act="install">Установити</button></div>`, `</b> — it will open full screen from the icon.</span><button type="button" class="sm pri" data-act="install">Install</button></div>`)}`
      : `<div class="note w small"><b>${head}${LL(`:</b> Chrome → меню ⋮ → «Додати на головний екран» (або «Установити застосунок») і відкривайте з іконки.</div>`, `:</b> Chrome → menu ⋮ → “Add to Home screen” (or “Install app”), then open it from the icon.</div>`)}`);

  /* ---------- утиліти ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => iso(new Date());
  const tms = (s) => new Date(s + 'T12:00:00').getTime();
  const dm = (s) => s.slice(8, 10) + '.' + s.slice(5, 7);
  const DEC = I18N.lang === 'en' ? '.' : ',';  // десятковий знак: 2,5 — українською, 2.5 — англійською
  const fmt = (x) => (x === null || x === undefined || x === '' ? '—' : String(Math.round(Number(x) * 100) / 100).replace('.', DEC));
  const num = (v) => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const x = Number(s); return isFinite(x) ? x : null; };
  const plural = (n, a, b, c) => { if (I18N.lang === 'en') return n + ' ' + (Math.abs(n) === 1 ? a : c); const x = Math.abs(n) % 10, y = Math.abs(n) % 100; return n + ' ' + (x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c); };
  const MONTHS = [LL('січень', "January"), LL('лютий', "February"), LL('березень', "March"), LL('квітень', "April"), LL('травень', "May"), LL('червень', "June"), LL('липень', "July"), LL('серпень', "August"), LL('вересень', "September"), LL('жовтень', "October"), LL('листопад', "November"), LL('грудень', "December")];
  const DAYS = [LL('нд', "Sun"), LL('пн', "Mon"), LL('вт', "Tue"), LL('ср', "Wed"), LL('чт', "Thu"), LL('пт', "Fri"), LL('сб', "Sat")];
  const DAYS_FULL = [LL('неділю', "Sunday"), LL('понеділок', "Monday"), LL('вівторок', "Tuesday"), LL('середу', "Wednesday"), LL('четвер', "Thursday"), LL('пʼятницю', "Friday"), LL('суботу', "Saturday")];
  const P = () => DB.profiles[DB.active];
  const isNewAcc = (n) => n === 'Новий акаунт' || n === 'New account';  // назва нерозпочатого акаунта — будь-якою мовою (з 3.17.0)
  /* одиниці (з 3.18.0, слово Alexа 23.10: «має бути і те і те, давати на вибір»): «кг · см» або «lb · in» — для профілю (p.units).
     Вага тренувань — в одиницях профілю (диски й тренажери фізично фунтові: рушій рахує ті самі числа); вага тіла, зріст і заміри
     зберігаються метрично (формули харчування) — показ і введення перераховуються. */
  const isLb = () => !!(P() && P().units === 'lb');
  const KG = (t) => (isLb() ? ENGINE.unitize('lb', t) : t);
  const LBT = (t) => (isLb() ? ENGINE.lbText(t) : t);
  const r1 = (x) => Math.round(x * 10) / 10;
  const BW = (kg, lb) => (kg === null || kg === undefined || kg === '' ? kg : (lb === undefined ? isLb() : lb) ? r1(Number(kg) * ENGINE.LB) : kg);
  const BWin = (v, lb) => (v === null || v === undefined || !(lb === undefined ? isLb() : lb) ? v : Math.round(v / ENGINE.LB * 100) / 100);
  const HD = (cm, lb) => (cm === null || cm === undefined || cm === '' ? cm : (lb === undefined ? isLb() : lb) ? Math.round(Number(cm) / 2.54) : cm);
  const HDin = (v, lb) => (v === null || v === undefined || !(lb === undefined ? isLb() : lb) ? v : Math.round(v * 2.54));
  const MV = (k, v) => (k === 'weight' ? BW(v) : isLb() && v !== null && v !== undefined && v !== '' ? r1(Number(v) / 2.54) : v);
  const MI = (k, v) => (v === null ? v : k === 'weight' ? BWin(v) : isLb() ? Math.round(v * 2.54 * 10) / 10 : v);
  const MU = (k, lb) => (k === 'weight' ? ((lb === undefined ? isLb() : lb) ? 'lb' : LL('кг', 'kg')) : (lb === undefined ? isLb() : lb) ? 'in' : LL('см', 'cm'));
  const PLATES = (lb) => (lb ? ['10', '5', '2.5'] : ['5', '2.5', '1.25']);  // розміри дисків набору, від більшого
  /* гриф (з 3.19.1, слово Alexа 23.10: «вага грифа … варто змінити на грами і щоб програма правильно враховувала грамовку»):
     у кг-профілі поле — у грамах (як на кухонних вагах), зберігається в кг (рушій: у руках = гантелей × (гриф + диски));
     0 — без грифа, інакше 50–10 000 г: «0,5» чи «2» — це кілограми в полі грамів, тож помилка, а не гриф на пів грама. У фунтах — lb, 0–25. */
  const gripOk = (g) => g !== null && g !== undefined && isFinite(g) && Math.abs(g - Math.round(g)) < 1e-6 && (Math.round(g) === 0 || (g >= 50 && g <= 10000));
  const gripTo = (h, toLb) => (toLb ? Math.round((Number(h) || 0) * ENGINE.LB * 2) / 2 : Math.round((Number(h) || 0) / ENGINE.LB * 100) / 100);  // кг → lb до 0,5; lb → кг до 10 г
  const GRIP_ERR = () => LL('Вага грифа — у грамах: 0 або від 50 до 10 000 (0,5 кг — це 500)', 'Handle weight is in grams: 0 or 50 to 10,000 (0.5 kg is 500)');
  const QINV = (lb) => (lb ? ['qIL0', 'qIL1', 'qIL2'] : ['qI5', 'qI25', 'qI125']);  // поля дисків анкети: у кг — колишні id (їхні підказки в tips.js)
  /* поле зросту в «Харчуванні» у фунтах: підпис і підказка — дюйми (у кг — як було, підказка з tips.js) */
  /* підказка поля диска у фунтах (у кг — з tips.js): найменший — ще й про крок */
  const invTip = (k, i) => (i < 2 ? LL(`Скільки у вас дисків по ${fmt(k)} lb — на обидві гантелі разом.`, `How many ${k} lb plates you have — for both dumbbells combined.`)
    : LL(`Скільки дисків по ${fmt(k)} lb. Від 4 штук вага росте кроком 5 lb, інакше — 10 lb.`, `How many ${k} lb plates. With 4 or more, the weight goes up in 5 lb steps; otherwise in 10 lb steps.`));
  window.__lb = isLb;  // підказки (tips.js) — кілограми в тексті → фунти
  /* програма у фунтах для екранів і рушія: крок і межа тренажерів, стартові ваги, кілограми й сантиметри в текстах; набір дисків і межа гантелі власної програми — уже у фунтах */
  const lbCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function unitsView(prog) {
    if (!isLb() || !prog || typeof prog !== 'object') return prog;
    const c = lbCache && lbCache.get(prog); if (c) return c;
    const deep = (x, d) => {
      if (typeof x === 'string') return ENGINE.lbText(x);
      if (!x || typeof x !== 'object' || d > 12) return x;
      if (Array.isArray(x)) return x.map((y) => deep(y, d + 1));
      const o = {}; Object.keys(x).forEach((k) => { const v = x[k]; o[k] = typeof v === 'function' ? function () { return deep(v.apply(x, arguments), 0); } : deep(v, d + 1); }); return o;
    };
    const r = deep(prog, 0);
    Object.keys(r.ex || {}).forEach((id) => {
      const e = r.ex[id];
      if (e.type === 'mach') { e.step = (e.step || 5) * 2; e.cap = Math.round((e.cap || 300) * ENGINE.LB / 10) * 10; if (typeof e.start === 'number') e.start = Math.round(e.start * ENGINE.LB / e.step) * e.step; }
      else if (typeof e.start === 'number' && (e.type === 'db' || e.type === 'dbopt' || (e.type === 'time' && e.load))) e.start = ENGINE.lbNum(e.start);  // еспандер (рівень) і вага тіла — без перерахунку
    });
    if (!prog.custom && typeof r.cap === 'number') r.cap = ENGINE.lbNum(r.cap);
    r.units = 'lb';
    if (lbCache) lbCache.set(prog, r);
    return r;
  }
  /* програма для екранів — мовою застосунку (I18N.view: перекладена копія); генератор і рушій працюють з українським оригіналом PROGRAMS */
  const G = () => unitsView(I18N.view(PROGRAMS[DB.active]));  // фунти — поверх мови (кілограми в текстах перераховуються вже перекладеними)
  const S = () => DB.settings;
  const nextN = () => Math.max(0, P().sessions.length + (P().offset || 0));  // не нижче нуля (див. ENGINE.planFor)
  /* назва тренування — і для старих записів, яких у програмі вже немає (Д1–Д3 після зміни днів чи анкети) */
  const woTitle = (w) => ((G().workouts || {})[w] || PROGRAMS.him.workouts[w] || {}).title || w;
  /* де було тренування — в історії, коли це не очевидно: «і вдома, і в залі» або місце інше, ніж у програмі зараз
     (змінили анкету: був зал — тепер дім); до 3.9.3 місце не зберігалось */
  const placeTag = (s) => (s.place && (G().gymWorkouts || s.place !== G().place) ? (s.place === 'gym' ? LL(' · зал', " · gym") : LL(' · дім', " · home")) : '');
  const mName = (id) => TR((MUSCLES.find((m) => m[0] === id) || [id, id])[1]);  // назва мʼяза — мовою застосунку
  function save() { if (!STORE.save(DB)) toast(LL('Не вдалося зберегти в телефоні. Зробіть резервну копію в «Більше».', "Couldn’t save to your phone. Make a backup in “More.”")); }
  function newProfile(id) { return { handle: 1, offset: 0, inv: { 5: 4, 2.5: 8, 1.25: 4 }, days: PROGRAMS[id].days.slice(), sessions: [], draft: null, notes: {}, body: { weight: [], waist: [], chest: [], hips: [], arm: [], tests: [] }, daily: {} }; }

  let toastT = null;
  function toast(msg, gold) {
    const t = document.getElementById('toast'); t.textContent = msg; t.className = 'on' + (gold ? ' gold' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 3200);
  }
  function haptic() {
    if (!S().haptics) return;
    try { document.getElementById('hapLb').click(); } catch (e) { /* немає */ }
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(12);
  }
  /* iOS: звук Web Audio за замовчуванням вимикається перемикачем беззвучного режиму; тип «playback» — грає й тоді. */
  /* iOS (Safari 17+): «playback» — тренер говорить і в беззвучному режимі; але з ним WebKit одразу відмовляє мікрофону (навіть без віконця дозволу),
     тож поки тренер-співрозмовник слухає — «play-and-record» */
  function audioMode() { try { if ('audioSession' in navigator) navigator.audioSession.type = ASK.rec || ASK.mic ? 'play-and-record' : S().voice.silent === false ? 'auto' : 'playback'; } catch (e) { /* немає */ } }
  function ensureAudio() { audioMode(); if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } } if (audio && audio.state === 'suspended') audio.resume(); }
  function beep() {
    if (!S().sound || !audio) return;
    try { [0, 0.3, 0.6].forEach((d, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = i === 2 ? 1175 : 880; o.connect(g); g.connect(audio.destination);
      const t0 = audio.currentTime + d; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22); o.start(t0); o.stop(t0 + 0.24); }); } catch (e) { /* без звуку */ }
  }
  async function keepAwake(on) {
    try {
      if (on && S().awake && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (view === 'workout' && P() && P().draft) keepAwake(true); if (audio && audio.state === 'suspended' && RADIO.state === 'playing') audio.resume(); tickTimer(); } });

  /* ---------- шторка ---------- */
  function openSheet(html) { sheetEl.style.transform = ''; sheetEl.style.transition = ''; sheetEl.innerHTML = '<div class="grab"></div>' + html; document.body.classList.add('sheet'); }
  sheetEl.addEventListener('input', (e) => { const t = e.target; if (t && t.dataset && t.dataset.kin) kInput(t); });  // кухня: пошук і числа без перемальовування шторки
  sheetEl.addEventListener('change', (e) => { const t = e.target; if (t && t.id === 'kPhIn') { const f = t.files && t.files[0]; t.value = ''; if (f) kPhotoLoad(f); } });  // кухня: фото тарілки
  function closeSheet() { document.body.classList.remove('sheet'); kp = null; if (ASK.rec) askCancel(); }
  sheetBg.addEventListener('click', closeSheet);
  /* жест iPhone: потягнути шторку вниз — закрити (слово Alexа 23.10: «не згортаються вікна, коли я сильно тягну пальцем вниз»).
     Шторка йде за пальцем; відпустили нижче 110 px або різким рухом — закривається, інакше — повертається на місце.
     Тягнути можна, лише коли вміст під пальцем уже прокручено до верху (прокрутка чату й списків не ламається), не з поля вводу
     і не вбік (горизонтальні рядки кнопок). */
  (function sheetSwipe() {
    let y0 = 0, x0 = 0, dy = 0, t0 = 0, drag = false, from = null, hideT = 0;
    const atTop = (el) => { for (let n = el; n; n = n.parentNode) { if (n.scrollTop > 0) return false; if (n === sheetEl) return true; } return true; };
    const field = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable]'));
    sheetEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { drag = false; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; t0 = Date.now(); drag = false; from = e.target;
    }, { passive: true });
    sheetEl.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1 || !document.body.classList.contains('sheet')) return;
      const d = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
      if (!drag) {
        if (d < 8 || dx > d || field(from) || !atTop(from)) return;
        drag = true; clearTimeout(hideT); sheetEl.style.transition = 'none';
      }
      dy = Math.max(0, d); sheetEl.style.transform = 'translateY(' + dy + 'px)'; e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!drag) return; drag = false;
      sheetEl.style.transition = '';
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      if (dy > 110 || (fast && dy > 40)) {
        sheetEl.style.transform = 'translateY(105%)'; closeSheet();
        hideT = setTimeout(() => { sheetEl.style.transform = ''; }, 300);
      } else sheetEl.style.transform = '';
    };
    sheetEl.addEventListener('touchend', end); sheetEl.addEventListener('touchcancel', end);
  })();

  /* ---------- таймер відпочинку ---------- */
  const timerEl = document.getElementById('timer');
  const T = { end: 0, total: 0, id: null, alarmed: false, next: '', kind: 'rest', said10: false };
  function startTimer(sec, next, kind) {
    if (!(sec > 0)) { stopTimer(); return; }
    T.end = Date.now() + sec * 1000; T.total = sec; T.alarmed = false; T.said10 = false; T.next = next || ''; T.kind = kind || 'rest'; T.view = '';
    timerEl.className = 'on'; clearInterval(T.id); T.id = setInterval(tickTimer, 250); tickTimer();
  }
  function stopTimer() { clearInterval(T.id); T.id = null; T.view = ''; timerEl.className = ''; }
  const coachOn = () => view === 'workout' && S().mode !== 'list' && P() && P().draft;
  function tickTimer() {
    if (!T.id) return;
    const left = Math.ceil((T.end - Date.now()) / 1000);
    if (left === 10 && T.total >= 30 && !T.said10 && T.kind === 'rest') { T.said10 = true; if (!speaking()) talk(LL('Десять секунд.', "Ten seconds.")); }
    if (coachOn()) {
      if (left <= 0) { if (!T.alarmed) { T.alarmed = true; const k = T.kind; beep(); haptic(); stopTimer(); onTimerEnd(k); } return; }
      const tEl = document.getElementById('cTime'), arc = document.getElementById('cArc');
      if (tEl) tEl.textContent = Math.floor(left / 60) + ':' + pad(left % 60);
      if (arc) { const c = 2 * Math.PI * 52, f = Math.max(0, Math.min(1, left / T.total)); arc.setAttribute('stroke-dasharray', (c * f).toFixed(1) + ' ' + c.toFixed(1)); }
      return;
    }
    const f = Math.max(0, Math.min(1, left / T.total)), r = 22, c = 2 * Math.PI * r, state = left <= 0 ? 'al' : 'run';
    /* розмітку будуємо лише при зміні стану: кнопки не перемальовуються під пальцем (раніше — 4 рази на секунду, натискання губились) */
    if (T.view !== state + '|' + T.next) {
      T.view = state + '|' + T.next;
      const ring = `<svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="${r}" fill="none" style="stroke:color-mix(in srgb,currentColor 25%,transparent)" stroke-width="5"/><circle id="tArc" cx="27" cy="27" r="${r}" fill="none" style="stroke:currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 ${c.toFixed(1)}" transform="rotate(-90 27 27)"/></svg>`;
      timerEl.innerHTML = state === 'al'
        ? ring + `${LL(`<div><div class="tt">Час!</div><div class="tn">`, `<div><div class="tt">Time’s up!</div><div class="tn">`)}${esc(T.next || LL('Наступний підхід', "Next set"))}${LL(`</div></div><div class="tb2"><button type="button" data-t="x">Готово</button></div>`, `</div></div><div class="tb2"><button type="button" data-t="x">Done</button></div>`)}`
        : ring + `<div><div class="tt" id="tLeft"></div><div class="tn">${esc(T.next ? LL('Далі: ', "Next: ") + T.next : LL('Відпочинок', "Rest"))}</div></div>
      <div class="tb2"><button type="button" data-t="-15">−15</button><button type="button" data-t="+15">+15</button><button type="button" data-t="x">✕</button></div>`;
    }
    const arc = document.getElementById('tArc'); if (arc) arc.setAttribute('stroke-dasharray', (c * f).toFixed(1) + ' ' + c.toFixed(1));
    if (state === 'al') {
      if (!T.alarmed) { T.alarmed = true; beep(); haptic(); if (T.kind === 'myo') talk(LL('Ще від трьох до пʼяти повторень.', "Three to five more reps.")); else talk(T.next ? LL('Час! ', "Time! ") + T.next.split(' · ')[0] + '.' : LL('Час!', "Time!")); }
      timerEl.className = 'on al';
      if (left < -30) stopTimer();
      return;
    }
    if (timerEl.className !== 'on') timerEl.className = 'on';
    const lt = document.getElementById('tLeft'); if (lt) lt.textContent = Math.floor(left / 60) + ':' + pad(left % 60);
  }
  function addTime(sec) { T.end = Math.max(Date.now() + 1000, T.end + sec * 1000); T.total = Math.max(T.total, Math.ceil((T.end - Date.now()) / 1000)); T.alarmed = false; T.said10 = false; tickTimer(); }
  timerEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'x') return stopTimer();
    addTime(b.dataset.t === '+15' ? 15 : -15);
  });

  /* ---------- навігація ---------- */
  document.getElementById('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    const go = () => { view = b.dataset.tab; if (view === 'kitchen') ui.kDate = null; render(); window.scrollTo(0, 0); };  // «Кухня» з панелі — завжди сьогодні (інший день — стрілками)
    /* та сама вкладка — як і раніше: оновити й нагору, без переходу */
    if (b.dataset.tab === view) return go();
    /* плавний перехід між вкладками (iOS 18+); «Зменшити рух» чи старіший iPhone — одразу, як раніше */
    if (!document.startViewTransition || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return go();
    /* швидке натискання іншої вкладки скасовує попередній перехід — це нормально, не помилка */
    const t = document.startViewTransition(go); [t.ready, t.finished, t.updateCallbackDone].forEach((p) => p.catch(() => {}));
  });
  let elapsedT = null;
  function render() {
    closeSheet();
    const nav = document.getElementById('tabs');
    nav.style.display = (view === 'onboard' || view === 'workout' || view === 'summary') ? 'none' : '';
    document.body.classList.toggle('wkv', view === 'workout');
    document.body.classList.toggle('coachv', view === 'workout' && S().mode !== 'list');
    app.classList.toggle('wv', view === 'workout');
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === view));
    clearInterval(elapsedT);
    if (view !== 'workout') keepAwake(false);
    if (!I18N.chosen) { nav.style.display = 'none'; return rLang(); }  // перший запуск — спершу мова
    if (VOICE.setUnits) VOICE.setUnits(isLb() ? 'lb' : 'kg');  // голос: кілограми чи фунти
    ({ onboard: rOnboard, home: rHome, workout: rWorkout, summary: rSummary, plan: rPlan, kitchen: rKitchen, progress: rProgress, body: rBody, more: rMore }[view] || rHome)();
    updateRadio();
  }

  /* ---------- мова (з 3.17.0): перший запуск і «Більше»; зміна — перезапуск сторінки ---------- */
  function rLang() {
    app.innerHTML = `<div class="brand">${MARK}<b>Тренування · Workouts</b></div><h1 style="margin-top:18px">Мова · Language</h1>
      <div class="pick"><button type="button" class="wide big" data-act="langPick" data-v="uk"><b>🇺🇦 Українська</b><span class="small muted">Тексти, голос і тренер — українською</span></button>
      <button type="button" class="wide big" data-act="langPick" data-v="en"><b>🇺🇸 English (US)</b><span class="small muted">Texts, voice and coach in American English</span></button></div>
      <p class="small muted">Змінити можна в «Більше» · You can change it later in “More”.</p>`;
  }
  function langPick(v) { const was = I18N.lang; I18N.set(v); if (v !== was) { location.reload(); return; } render(); }
  /* одиниці (з 3.18.0): перемкнути — перевести журнал цього профілю (вага тренувань, диски, гриф) з округленням до дисків нового набору;
     вага тіла й заміри зберігаються метрично — лише показ */
  function unitsCard() {
    if (!P()) return '';
    return `<h2>${LL('Одиниці', 'Units')}</h2><div class="card"><div class="seg"><button type="button" class="${isLb() ? '' : 'on'}" data-act="unitsSet" data-v="kg">${LL('кг · см', 'kg · cm')}</button><button type="button" class="${isLb() ? 'on' : ''}" data-act="unitsSet" data-v="lb">${LL('фунти · дюйми', 'lb · in')}</button></div>
      <p class="tiny muted" style="margin-top:8px">${LL('Вага тренувань і набір дисків переводяться й округлюються до ваших дисків; вага тіла й заміри — лише показ.', 'Workout weights and your plate set are converted and rounded to your plates; body weight and measurements just display differently.')}</p></div>`;
  }
  function unitsSet(v) {
    const p = P(); if (!p || v === (p.units || 'kg') || (v !== 'kg' && v !== 'lb')) return;
    if (p.draft) { toast(LL('Спершу завершіть тренування', 'Finish your workout first')); return; }
    if (!confirm(LL('Перевести ваги журналу? Вага округлиться до дисків нового набору.', 'Convert the weights in your log? They will be rounded to the plates of the new set.'))) return;
    const toLb = v === 'lb', f = toLb ? ENGINE.LB : 1 / ENGINE.LB, from = PLATES(!toLb), to = PLATES(toLb), prog = PROGRAMS[DB.active];
    const inv = {}; to.forEach((k, i) => { inv[k] = (p.inv || {})[from[i]] || 0; });
    const step = ENGINE.stepFor(inv), snap = (x, st) => Math.max(0, Math.round(Math.round(x / st) * st * 100) / 100);
    (p.sessions || []).forEach((s) => (s.sets || []).forEach((x) => {
      const ex = prog && prog.ex[x.ex]; if (!ex || x.load === null || x.load === undefined || x.load === '' || !(Number(x.load) >= 0)) return;
      if (ex.type === 'mach') x.load = snap(Number(x.load) * f, (ex.step || 5) * (toLb ? 2 : 1));
      else if (ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load)) x.load = snap(Number(x.load) * f, step);
    }));
    p.inv = inv; p.handle = gripTo(p.handle, toLb); p.units = v;
    if (DB.active === 'me' && DB.custom && DB.custom.answers) { DB.custom.answers.units = v; DB.custom.answers.inv = Object.assign({}, inv); DB.custom.answers.handle = p.handle; }
    save(); location.reload();
  }
  function langCard() {
    return `<h2>${LL('Мова', 'Language')}</h2><div class="card"><div class="seg"><button type="button" class="${I18N.lang === 'uk' ? 'on' : ''}" data-act="langSet" data-v="uk">Українська</button><button type="button" class="${I18N.lang === 'en' ? 'on' : ''}" data-act="langSet" data-v="en">English (US)</button></div>
      <p class="tiny muted" style="margin-top:8px">${LL('Тексти, голос і тренер. Застосунок перезапуститься.', 'Texts, voice and coach. The app will restart.')}</p></div>`;
  }

  /* ---------- знайомство: анкета (усі поля обовʼязкові) ---------- */
  const QALL = ['who', 'body', 'goal', 'level', 'place', 'equip', 'limits', 'days', 'agree'];
  /* лише зал — без кроку «Що є вдома» */
  const qSteps = (a) => QALL.filter((x) => x !== 'equip' || a.place !== 'gym');
  const QFIELDS = { who: ['name', 'sex'], body: ['age', 'height', 'weight'], goal: ['goal'], level: ['level'], place: ['place'], equip: ['equip'], limits: ['limits'], days: ['days'], agree: ['agree'] };
  function qState() {
    if (!ui.q) {
      const acc = STORE.account(STORE.current) || {}, old = DB.custom && DB.custom.answers;
      ui.q = { step: 0, err: false, edit: !!old, a: old ? JSON.parse(JSON.stringify(old)) : { name: acc.name && !isNewAcc(acc.name) ? acc.name : '', goals: [], equip: [], limits: [], days: [], agree: false, units: I18N.lang === 'en' ? 'lb' : 'kg' } };
      if (!ui.q.a.units) ui.q.a.units = 'kg';  // відповіді до 3.18.0 — у кілограмах
      const p = P(); if (!ui.q.a.inv) {  // набір з поточного профілю — у розмірах одиниць анкети (ті самі кількості), гриф — перерахований
        const lb = ui.q.a.units === 'lb', plb = !!(p && p.units === 'lb'), src = p ? p.inv : { 5: 4, 2.5: 8, 1.25: 4 }, from = PLATES(plb), to = PLATES(lb), h = p ? p.handle : 1;
        ui.q.a.inv = {}; to.forEach((k, i) => { ui.q.a.inv[k] = Number(src[from[i]]) || 0; });
        ui.q.a.handle = plb === lb ? h : gripTo(h, lb);
      }
    }
    return ui.q;
  }
  /* поточні значення полів вводу — у відповіді (і під час набору, і перед «Далі») */
  function qRead() {
    const q = qState(), a = q.a, v = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; };
    if (v('qName') !== undefined) a.name = v('qName').trim();
    const lb = a.units === 'lb';
    ['age', 'height', 'weight'].forEach((k) => { const x = v('q' + k); if (x !== undefined) a[k] = k === 'height' ? HDin(num(x), lb) : k === 'weight' ? BWin(num(x), lb) : num(x); });  // зріст і вага — завжди метрично
    if (v('qHandle') !== undefined) { const x = num(v('qHandle')); a.handle = x === null ? null : lb ? x : x / 1000; }  // кг-профіль: поле в грамах
    PLATES(lb).forEach((k, i) => { const x = v(QINV(lb)[i]); if (x !== undefined) a.inv[k] = num(x); });
  }
  function qErrors(step) {
    const a = qState().a, e = GEN.check(a).errors, out = {};
    QFIELDS[step].forEach((k) => { if (e[k]) out[k] = TR(e[k]); });
    if (a.units === 'lb') { if (out.height) out.height = LL('Зріст — від 51 до 86 дюймів', 'Height — 51 to 86 in'); if (out.weight) out.weight = LL('Вага — від 89 до 440 lb', 'Weight — 89 to 440 lb'); }  // межі 130–220 см і 40–200 кг після перерахунку
    if (step === 'equip' && a.equip.indexOf('db') >= 0) {
      if (a.units === 'lb' ? !(a.handle >= 0 && a.handle <= 25) : !gripOk(a.handle === null || a.handle === undefined ? null : a.handle * 1000)) out.handle = a.units === 'lb' ? LL('Вага грифа — від 0 до 25 lb', "Handle weight must be between 0 and 25 lb") : GRIP_ERR();
      if (PLATES(a.units === 'lb').some((k) => !(a.inv[k] >= 0 && a.inv[k] <= 40 && Number.isInteger(a.inv[k])))) out.inv = LL('Кількість дисків — ціле число від 0 до 40', "Number of plates must be a whole number from 0 to 40");
      else if (!(PLATES(a.units === 'lb').reduce((t, k) => t + (a.inv[k] || 0), 0) > 0)) out.inv = LL('Вкажіть, скільки дисків є', "Enter how many plates you have");
      else if (!ENGINE.capOf(a.inv)) out.inv = LL('Потрібна хоча б пара однакових дисків — по одному на кожен бік грифа', "You need at least one pair of matching plates — one for each side of the handle");
    }
    return out;
  }
  function rOnboard() {
    const q = qState(), a = q.a, QS = qSteps(a), step = QS[q.step], errs = q.err ? qErrors(step) : {};
    /* кілька відповідей (обладнання, здоровʼя) — з галочкою */
    const opt = (act, v, label, sub, on, dis) => { const m = act === 'qLimit' || act === 'qEquip' || act === 'qGoal';  // dis — причина, чому варіант зараз недоступний
      return `<button type="button" class="qopt${m ? ' multi' : ''}${on ? ' on' : ''}${dis ? ' dis' : ''}" data-act="${act}" data-v="${v}" ${m ? `role="checkbox" aria-checked="${on}"` : `aria-pressed="${on}"`}${dis ? ` aria-disabled="true" data-tip="${esc(dis)}"` : ''}><b>${label}</b>${dis ? `<span class="small muted">${esc(dis)}</span>` : sub ? `<span class="small muted">${sub}</span>` : ''}</button>`; };
    const err = (k) => (errs[k] ? `<p class="qerr">${esc(errs[k])}</p>` : '');
    const numIn = (id, label, val, mode, tip) => `<label class="f" for="${id}">${label}</label><input id="${id}"${tip ? ` data-tip="${esc(tip)}"` : ''} inputmode="${mode || 'numeric'}" autocomplete="off" value="${val === null || val === undefined || isNaN(val) ? '' : fmt(val)}">`;
    let body = '';
    if (step === 'who') body = `${LL(`<h1>Як вас звати?</h1><p class="muted small">Імʼя бачитимете на екрані входу.</p>
      <label class="f" for="qName">Імʼя</label><input id="qName" maxlength="24" autocomplete="given-name" value="`, `<h1>What’s your name?</h1><p class="muted small">You’ll see it on the start screen.</p>
      <label class="f" for="qName">Name</label><input id="qName" maxlength="24" autocomplete="given-name" value="`)}${esc(a.name || '')}">${err('name')}${LL(`
      <h2>Стать</h2><div class="grid2">`, `
      <h2>Sex</h2><div class="grid2">`)}${opt('qSex', 'm', LL('Чоловік', "Male"), '', a.sex === 'm')}${opt('qSex', 'f', LL('Жінка', "Female"), '', a.sex === 'f')}</div>${err('sex')}`;
    else if (step === 'body') body = `${LL(`<h1>Про вас</h1><p class="muted small">Потрібно, щоб розрахувати навантаження й харчування.</p>
      `, `<h1>About you</h1><p class="muted small">We need this to calculate your training load and nutrition.</p>
      `)}<div class="seg" style="margin:4px 0 10px"><button type="button" class="${a.units !== 'lb' ? 'on' : ''}" data-act="qUnits" data-v="kg">${LL('кг · см', 'kg · cm')}</button><button type="button" class="${a.units === 'lb' ? 'on' : ''}" data-act="qUnits" data-v="lb">${LL('фунти · дюйми', 'lb · in')}</button></div>${numIn('qage', LL('Вік, років', "Age, years"), a.age)}${err('age')}${numIn('qheight', a.units === 'lb' ? LL('Зріст, дюймів', 'Height, in') : LL('Зріст, см', "Height, cm"), HD(a.height, a.units === 'lb'), undefined, a.units === 'lb' ? LL('Зріст у дюймах — для норми калорій.', 'Height in inches — for your calorie target.') : '')}${err('height')}${numIn('qweight', a.units === 'lb' ? LL('Вага, lb', 'Weight, lb') : LL('Вага, кг', "Weight, kg"), BW(a.weight, a.units === 'lb'), 'decimal', a.units === 'lb' ? LL('Вага у фунтах — для навантаження й норми білка.', 'Weight in pounds — for your training load and protein target.') : '')}${err('weight')}`;
    else if (step === 'goal') { const gs = GEN.goalsOf(a), why = (v) => (gs.indexOf(v) >= 0 || !GEN.GOAL_CLASH[v].some((x) => gs.indexOf(x) >= 0) ? '' : v === 'health' ? LL('не поєднується зі схудненням і набором мʼязів', "can’t be combined with losing weight or building muscle") : LL('не поєднується з «Сила й здоровʼя»', "can’t be combined with “Strength and health”"));
      body = `${LL(`<h1>Ваша мета</h1><p class="muted small">Можна кілька. «Схуднути» й «Набрати мʼязи» разом — менше жиру й більше мʼязів; «Спина й осанка» — з будь-якою.</p><div class="pick">`, `<h1>Your goals</h1><p class="muted small">You can pick more than one. “Lose weight” and “Build muscle” together means less fat and more muscle; “Back and posture” goes with any goal.</p><div class="pick">`)}${[['loss', LL('Схуднути', "Lose weight"), LL('менше жиру, більше сил', "less fat, more energy")], ['muscle', LL('Набрати мʼязи', "Build muscle"), LL('більше обʼєму й сили', "more size and strength")], ['health', LL('Сила й здоровʼя', "Strength and health"), LL('міцне тіло без крайнощів', "a strong body, no extremes")], ['posture', LL('Спина й осанка', "Back and posture"), LL('рівна спина, менше болю від сидіння', "a straight back, less pain from sitting")]].map(([v, l, d]) => opt('qGoal', v, l, d, gs.indexOf(v) >= 0, why(v))).join('')}</div>${err('goal')}`; }
    else if (step === 'level') body = `${LL(`<h1>Досвід тренувань</h1><div class="pick">`, `<h1>Training experience</h1><div class="pick">`)}${opt('qLevel', 'new', LL('Новачок', "Beginner"), LL('або перерва понад пів року', "or a break of more than six months"), a.level === 'new')}${opt('qLevel', 'exp', LL('Тренуюсь регулярно', "I train regularly"), LL('пів року й більше без перерв', "six months or more without a break"), a.level === 'exp')}</div>${err('level')}`;
    else if (step === 'equip') {
      const db = a.equip.indexOf('db') >= 0, mk = Object.keys(GEN.MACH), allM = mk.every((k) => a.equip.indexOf(k) >= 0);
      body = `${LL(`<h1>Що є вдома</h1><p class="muted small">Можна обрати кілька. Для тяг (спина) потрібні гантелі, петля або блок.</p>
      <div class="pick">`, `<h1>What you have at home</h1><p class="muted small">Pick all that apply. For rows (back), you need dumbbells, a resistance band, or a cable machine.</p>
      <div class="pick">`)}${opt('qEquip', 'db', LL('Гантелі з дисками', "Plate-loaded dumbbells"), LL('розбірні: гриф + диски', "adjustable: handle + plates"), db)}${opt('qEquip', 'band', LL('Петля-еспандер', "Resistance band"), LL('резинка з кріпленням до дверей', "band with a door anchor"), a.equip.indexOf('band') >= 0)}</div>${err('equip')}
      ${db ? `${LL(`<div class="card"><b>Ваші гантелі</b>`, `<div class="card"><b>Your dumbbells</b>`)}${(a.units === 'lb' ? numIn('qHandle', LL('Вага одного грифа без дисків, lb', 'Weight of one handle without plates, lb'), a.handle, 'decimal') : numIn('qHandle', LL('Вага одного грифа без дисків, г', 'Weight of one handle without plates, g'), a.handle === null || a.handle === undefined ? a.handle : a.handle * 1000, 'numeric'))}${err('handle')}${LL(`
        <label class="f">Скільки дисків разом на обидві гантелі</label><div class="grid3"><div>`, `
        <label class="f">Total plates for both dumbbells</label><div class="grid3"><div>`)}${PLATES(a.units === 'lb').map((k, i) => numIn(QINV(a.units === 'lb')[i], fmt(k) + ' ' + MU('weight', a.units === 'lb'), a.inv[k], undefined, a.units === 'lb' ? invTip(k, i) : '')).join('</div><div>')}</div></div>${err('inv')}</div>` : ''}${LL(`
      <h2>Тренажери вдома</h2><p class="muted small">Ті самі вправи, що в залі: історія й рекорди спільні, вагу застосунок рахує окремо для дому й залу. Додати чи прибрати можна будь-коли: «Більше» → «Обладнання вдома».</p>
      <button type="button" class="wide`, `
      <h2>Machines at home</h2><p class="muted small">Same exercises as at the gym: history and PRs are shared, but the app tracks weights separately for home and gym. You can add or remove machines anytime: “More” → “Home equipment.”</p>
      <button type="button" class="wide`)}${allM ? ' pri' : ''}" data-act="qEquipAll" aria-pressed="${allM}">${allM ? '✓ ' : ''}${LL(`Усе, як у залі</button><p></p>
      <div class="grid2">`, `Full gym setup</button><p></p>
      <div class="grid2">`)}${mk.map((k) => opt('qEquip', k, TR(GEN.MACH[k][0]), TR(GEN.MACH[k][1]), a.equip.indexOf(k) >= 0)).join('')}</div>`;
    } else if (step === 'place') body = `${LL(`<h1>Де тренуєтесь?</h1><p class="muted small">Програма підбере вправи під місце. «І вдома, і в залі» — перед кожним тренуванням застосунок спитає, де ви сьогодні.</p>
      <div class="pick">`, `<h1>Where do you train?</h1><p class="muted small">The program picks exercises for your location. With “Both home and gym,” the app will ask where you are before each workout.</p>
      <div class="pick">`)}${[['home', LL('Вдома', "At home"), LL('гантелі, петля або тренажери', "dumbbells, band, or machines")], ['gym', LL('У тренажерному залі', "At the gym"), LL('тренажери й блоки', "machines and cables")], ['both', LL('І вдома, і в залі', "Both home and gym"), LL('програма для обох місць', "a program for both places")]].map(([v, l, d]) => opt('qPlace', v, l, d, a.place === v)).join('')}</div>${err('place')}`;
    else if (step === 'limits') body = `${LL(`<h1>Здоровʼя</h1><p class="muted small">Позначте все, що у вас є. Програма прибере або полегшить вправи, які можуть зашкодити.</p>
      <div class="pick">`, `<h1>Health</h1><p class="muted small">Check everything that applies to you. The program will remove exercises that could hurt you or make them easier.</p>
      <div class="pick">`)}${[['back', LL('Грижа або біль у спині', "Herniated disc or back pain"), LL('грижа, протрузія, часто болить поперек', "herniated or bulging disc, frequent lower back pain")], ['knees', LL('Коліна', "Knees"), LL('біль або травма коліна', "knee pain or injury")], ['shoulders', LL('Плечі', "Shoulders"), LL('біль або травма плеча', "shoulder pain or injury")], ['heart', LL('Тиск або серце', "Blood pressure or heart"), LL('гіпертонія, хвороби серця', "hypertension, heart disease")], ['pregnant', LL('Вагітність', "Pregnancy"), ''], ['none', LL('Нічого з цього', "None of these"), '']].filter(([v]) => v !== 'pregnant' || a.sex !== 'm').map(([v, l, d]) => opt('qLimit', v, l, d, a.limits.indexOf(v) >= 0)).join('')}</div>${err('limits')}`;
    else if (step === 'days') body = `${LL(`<h1>Дні тренувань</h1><p class="muted small">Оберіть від 2 до 4 днів. Краще з днем відпочинку між ними.</p>
      <div class="qdays">`, `<h1>Workout days</h1><p class="muted small">Pick 2 to 4 days, ideally with a rest day in between.</p>
      <div class="qdays">`)}${GEN.DAYS.map(([d, l]) => opt('qDay', d, l, '', a.days.indexOf(d) >= 0)).join('')}</div>${err('days')}`;
    else {
      const blk = GEN.check(a).block, lim = a.limits.filter((x) => x !== 'none');
      body = `${LL(`<h1>Майже готово</h1><div class="card"><ul class="list">
        <li><span>Імʼя</span><b>`, `<h1>Almost done</h1><div class="card"><ul class="list">
        <li><span>Name</span><b>`)}${esc(a.name)}${LL(`</b></li><li><span>Вік · зріст · вага</span><b>`, `</b></li><li><span>Age · height · weight</span><b>`)}${fmt(a.age)} · ${fmt(HD(a.height, a.units === 'lb'))} ${MU('height', a.units === 'lb')} · ${fmt(BW(a.weight, a.units === 'lb'))}${(a.units === 'lb' ? (t) => ENGINE.unitize('lb', t) : (t) => t)(LL(` кг</b></li>
        <li><span>Мета</span><b>`, ` kg</b></li>
        <li><span>Goal</span><b>`))}${esc(TR(GEN.goalText(a)))}${LL(`</b></li><li><span>Де</span><b>`, `</b></li><li><span>Where</span><b>`)}${esc(TR(GEN.PLACES[a.place] || '').toLowerCase())}</b></li>${a.place === 'gym' ? '' : `${LL(`<li><span>Обладнання вдома</span><b>`, `<li><span>Home equipment</span><b>`)}${esc(kitText(a.equip))}</b></li>`}${LL(`
        <li><span>Здоровʼя</span><b>`, `
        <li><span>Health</span><b>`)}${lim.length ? lim.map((x) => ({ back: LL('спина', "back"), knees: LL('коліна', "knees"), shoulders: LL('плечі', "shoulders"), heart: LL('тиск/серце', "blood pressure/heart"), pregnant: LL('вагітність', "pregnancy") }[x])).join(', ') : LL('без обмежень', "no limitations")}${LL(`</b></li>
        <li><span>Дні</span><b>`, `</b></li>
        <li><span>Days</span><b>`)}${GEN.DAYS.filter(([d]) => a.days.indexOf(d) >= 0).map(([, l]) => l).join(', ')}</b></li></ul></div>
        ${blk ? `<div class="note b small">${esc(blk)}</div>` : ''}
        ${lim.some((x) => x === 'back' || x === 'heart') && !blk ? LL('<div class="note w small">Перед стартом покажіть програму лікарю: при болю в спині чи проблемах із тиском це розумна страховка.</div>', "<div class=\"note w small\">Before you start, show the program to your doctor: with back pain or blood pressure issues, it’s a smart precaution.</div>") : ''}
        <label class="chk"><input type="checkbox" id="qAgree"${a.agree ? ' checked' : ''}${LL(`><span>Розумію: застосунок не замінює лікаря. При болю під час вправи — зупиняюсь.</span></label>`, `><span>I understand: this app doesn’t replace a doctor. If I feel pain during an exercise, I’ll stop.</span></label>`)}${err('agree')}`;
    }
    const last = q.step === QS.length - 1;
    app.innerHTML = `<div class="brand">${MARK}${LL(`<b>Тренування</b></div>
      <div class="qprog" aria-hidden="true"><i style="width:`, `<b>Workouts</b></div>
      <div class="qprog" aria-hidden="true"><i style="width:`)}${Math.round((q.step + 1) / QS.length * 100)}${LL(`%"></i></div><p class="tiny muted">Крок `, `%"></i></div><p class="tiny muted">Step `)}${q.step + 1}${LL(` з `, ` of `)}${QS.length}${q.edit ? LL(' · зміна анкети', " · editing questionnaire") : ''}</p>
      ${body}
      ${(() => { const left = q.step ? LL('<button type="button" class="ghost" data-act="qBack">Назад</button>', "<button type=\"button\" class=\"ghost\" data-act=\"qBack\">Back</button>") : q.edit ? LL('<button type="button" class="ghost" data-act="qCancel">Скасувати</button>', "<button type=\"button\" class=\"ghost\" data-act=\"qCancel\">Cancel</button>") : '';
        /* без «Назад» (перший крок) — «Далі» на всю ширину, як «Відновити» під нею (до 3.12.2 стояла праворуч несиметрично) */
        return `<div class="qnav${left ? '' : ' one'}">${left}`; })()}
      <button type="button" class="pri big" data-act="qNext">${last ? (q.edit ? LL('Оновити програму', "Update program") : LL('Скласти програму', "Build my program")) : LL('Далі', "Next")}</button></div>
      ${q.step || q.edit ? '' : LL('<p></p><label class="btn ghost" style="display:block;text-align:center">Є резервна копія? Відновити<input type="file" id="restoreIn" accept=".json,application/json" style="display:none"></label>', "<p></p><label class=\"btn ghost\" style=\"display:block;text-align:center\">Have a backup? Restore<input type=\"file\" id=\"restoreIn\" accept=\".json,application/json\" style=\"display:none\"></label>")}`;
    const ri = document.getElementById('restoreIn'); if (ri) ri.onchange = (e) => { if (e.target.files && e.target.files[0]) restore(e.target.files[0]); };
  }
  /* усі тренажери разом: усі є — зняти всі, інакше — додати відсутні */
  function allMach(list) { const mk = Object.keys(GEN.MACH), all = mk.every((k) => list.indexOf(k) >= 0); mk.forEach((k) => { const i = list.indexOf(k); if (all && i >= 0) list.splice(i, 1); else if (!all && i < 0) list.push(k); }); }
  function qToggle(list, v, max) { const k = list.indexOf(v); if (k >= 0) list.splice(k, 1); else { if (max && list.length >= max) return false; list.push(v); } return true; }
  /* завершення анкети: програма, профіль, імʼя акаунта */
  function qFinish() {
    const q = qState(), a = q.a, c = GEN.check(a);
    if (!c.ok) { q.err = true; return rOnboard(); }
    a.name = a.name.trim();
    const oldPw = DB.custom && PROGRAMS.me ? PROGRAMS.me.perWeek : null;
    DB.custom = { answers: JSON.parse(JSON.stringify(a)), ver: GEN.VER, date: today() };
    PROGRAMS.me = buildMe(DB.custom.answers);
    const fresh = !DB.profiles.me;
    if (fresh) DB.profiles.me = newProfile('me');
    const p = DB.profiles.me;
    p.days = a.days.slice().sort(); p.handle = a.handle; p.units = a.units === 'lb' ? 'lb' : 'kg'; p.inv = {}; PLATES(p.units === 'lb').forEach((k) => { p.inv[k] = a.inv[k] || 0; });
    p.me = Object.assign({}, p.me || {}, { height: a.height, age: a.age });
    if (!fresh) keepWeek(p, oldPw, PROGRAMS.me);
    if (p.draft) p.draft = null;
    /* новому користувачеві картка «Нове» ні до чого — для нього все нове */
    if (fresh && Object.keys(DB.profiles).length === 1) { S().tour.v3 = true; S().tour.v4 = true; }
    DB.active = 'me'; ENGINE.migrate(DB); save();
    STORE.update(STORE.current, { name: a.name, sub: PROGRAMS.me.sub });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    ui.q = null; view = 'home'; render(); initPacks();
    toast(fresh ? LL('Програму складено', "Program created") : LL('Програму оновлено — історія тренувань збережена', "Program updated — your workout history is saved"));
    /* захист після анкети не пропонуємо: код необовʼязковий, вмикається в «Більше» → «Профіль» */
  }

  /* ---------- допоміжне до вправ ---------- */
  const isLoad = (ex) => ex.type === 'db' || ex.type === 'dbopt' || ex.type === 'band' || ex.type === 'mach' || (ex.type === 'time' && ex.load);
  /* тренажер чи блок: вага в кг на тренажері, свій крок, без грифа й дисків */
  const isMach = (ex) => ex.type === 'mach';
  /* підказка ваги, крок і «минулого» для тренажера — з разів на тому самому місці: удома й у залі це різні тренажери
     (інші плити й важелі); рекорди й історія — спільні. На цьому місці ще не було — з будь-якого (з чого почати) */
  function histAt(id, place) {
    const all = ENGINE.history(P(), id), ex = G().ex[id];
    if (!ex || !ex.gym || (place !== 'home' && place !== 'gym')) return all;
    const at = all.filter((h) => h.place === place);
    return at.length ? at : all;
  }
  /* домашнє обладнання словами; short — коротко (тренажерів — числом) */
  const kitText = (eq, short) => {
    const mk = Object.keys(GEN.MACH).filter((k) => eq.indexOf(k) >= 0), parts = [eq.indexOf('db') >= 0 ? LL('гантелі з дисками', "plate-loaded dumbbells") : '', eq.indexOf('band') >= 0 ? LL('петля', "resistance band") : ''];
    if (mk.length === Object.keys(GEN.MACH).length) parts.push(LL('усі тренажери, як у залі', "all gym machines"));
    else if (mk.length) parts.push(short ? plural(mk.length, LL('тренажер', "machine"), LL('тренажери', "machines"), LL('тренажерів', "machines")) : mk.map((k) => TR(GEN.MACH[k][0]).toLowerCase()).join(', '));
    return parts.filter(Boolean).join(', ');
  };
  /* підказка-хмарка до числа ваги: на тренажері й еспандері — своя (загальна в tips.js — про диски на гантель) */
  const loadTip = (ex, what) => (isMach(ex) ? `${KG(LL(` data-tip="Вага на тренажері чи блоці, кг`, ` data-tip="Weight on the machine or cable, kg`))}${what}"` : ex.type === 'band' ? `${LL(` data-tip="Рівень еспандера: номер джгута або сума, якщо кілька разом`, ` data-tip="Band resistance level: band number, or the sum if using several together`)}${what}"` : '');
  /* крок ваги: тренажер — з ваг людини на ньому (ENGINE.machStep: її зал може мати 2,5 чи 4,5 замість 5), еспандер — рівень, гантелі — диски */
  /* place — де тренування (поки воно складається, чернетки ще немає — місце передають явно) */
  const loadStep = (ex, id, place) => (isMach(ex) ? ENGINE.machStep(ex, histAt(id, place || (P().draft || {}).place)) : ex.type === 'band' ? 1 : ENGINE.stepFor(P().inv));
  const loadCap = (ex) => (isMach(ex) ? ex.cap || 300 : hasKg(ex) ? G().cap : 99);
  const hasKg = (ex) => ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load);
  function loadText(ex, v) {
    if (ex.type === 'band') return v === null || v === undefined ? '—' : LL('рів. ', "lvl ") + fmt(v);
    if (v === null || v === undefined || v === '') return ex.type === 'dbopt' ? LL('без', "none") : '—';
    return fmt(v);
  }
  function setText(ex, s) {
    if (!s) return '—';
    const r = s.reps === null || s.reps === undefined ? '—' : s.reps + (ex.type === 'time' ? LL('с', "s") : '');
    if (!isLoad(ex)) return r;
    return loadText(ex, s.load) + '×' + r;
  }
  function defaultVariant(exId, plan) {
    const ex = G().ex[exId]; if (!ex.variants) return null;
    if (DB.active === 'her' && plan.week >= 9 && plan.week <= 11) { if (exId === 'splitsquat') return 'l'; if (exId === 'bridge') return 'c'; }
    const h = ENGINE.history(P(), exId);
    for (let i = h.length - 1; i >= 0; i--) { const s = h[i].sets.find((x) => x.variant); if (s) return s.variant; }
    return ex.variants[0].id;
  }
  /* малюнок дисків: фунтові 10 / 5 / 2,5 lb — ті самі три розміри, що 5 / 2,5 / 1,25 кг (з 3.18.0) */
  const DISC_LB = { 10: '5', 5: '25', 2.5: '125' };
  function discs(side) { if (!side.length) return ''; return '<span class="disc"><b></b>' + side.map((x) => `<i class="d${isLb() ? DISC_LB[x] || '125' : String(x).replace('.', '')}"></i>`).join('') + '</span>'; }
  function plateLine(ex, it, load) {
    if (!hasKg(ex) || load === null || load === undefined || load === '') return '';
    const pl = ENGINE.plates(load, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap, isLb() ? 'lb' : 'kg');
    return `<span class="plt">${pl.ok ? (pl.side.length ? LL('на кожен бік: ', "per side: ") + esc(pl.text) + ' ' + discs(pl.side) : LL('лише гриф', "handle only")) : '⚠ ' + esc(pl.text)}</span>`;
  }

  /* ---------- чернетка тренування ---------- */
  function plateSide(ex, it, load) {
    if (!hasKg(ex) || load === null || load === undefined || load === '') return null;
    const pl = ENGINE.plates(load, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap, isLb() ? 'lb' : 'kg');
    return pl.ok ? pl.side : null;
  }
  function makeItem(it, ss, plan, step, o) {
    const prog = G(), p = P(), ex = prog.ex[it.ex];
    const nS = prog.setsFor(it, plan.week), hist = histAt(it.ex, o.where);
    const sug = ENGINE.suggest(prog, it.ex, it, nS, hist, p.handle, plan.deload, step, o.back);
    const last = hist.length ? hist[hist.length - 1].sets : [];
    const sets = sug.sets.map((s, j) => { const pv = last[j] || last[last.length - 1] || null; return { type: 'N', load: s.load, reps: s.reps, rir: null, done: false, pr: [], prev: pv ? { load: pv.load, reps: pv.reps } : null, touched: false }; });
    let note = sug.note, skipped = !!it.optional;
    if (o.ra && o.ra.act === 'skip') { skipped = true; note = LL('Сьогодні без цієї вправи — бережемо поперек.', "Skipping this exercise today — protecting your lower back."); }
    if (o.ra && o.ra.act === 'light') {
      const st = isMach(ex) ? loadStep(ex, it.ex, o.where) : step;
      let less = false; sets.forEach((s) => { if (typeof s.load === 'number' && s.load > 0) { s.load = Math.max(0, Math.round((s.load - st) * 100) / 100); less = true; } });
      note = (less ? LL('Спина ниє: вага на крок нижча, запас 3. ', "Back feels achy: one step lighter, 3 RIR. ") : LL('Спина ниє: запас 3, рух повільний і плавний. ', "Back feels achy: 3 RIR, slow and smooth reps. ")) + note;
    }
    if (o.from) note = LL('Замість «', "Instead of “") + prog.ex[o.from].name + LL('». ', '.” ') + note;
    if (o.myo && ex.iso && ex.type !== 'amrap' && sets.length) sets[sets.length - 1].type = 'M';
    return { ex: it.ex, variant: defaultVariant(it.ex, plan), skipped, optional: !!it.optional, note, ss, min: it.min, max: it.max, rest: it.rest, from: o.from || null, sets };
  }
  function buildDraft(wid, ready, place) {
    const prog = G(), p = P(), n = nextN(), plan = ENGINE.planFor(prog, n);
    wid = wid || plan.workout;
    /* місце: обране перед тренуванням («і вдома, і в залі») або єдине місце програми */
    const where = place || prog.place || 'home', W = where === 'gym' && prog.gymWorkouts ? prog.gymWorkouts : prog.workouts;
    const items = W[wid].items.slice();
    const pairs = prog.supersets(plan.week, wid, where === 'gym' ? 'gym' : undefined);
    const step = ENGINE.stepFor(p.inv);
    const ordered = ENGINE.orderItems(items, pairs);
    const present = ordered.map((o) => o.it.ex);
    /* повернення після перерви (ENGINE.comeback): вага частками від колишньої, без міо й дропів — до відмови не ходимо */
    const back = ENGINE.comeback(p.sessions, today(), (p.me || {}).age);
    const myo = !!prog.myoFrom && plan.week >= prog.myoFrom && !plan.deload && !back;
    const list = ordered.map((o) => {
      const ra = ENGINE.readyAction(prog, o.it.ex, ready, present);
      const it = Object.assign({}, o.it); let from = null;
      if (ra && ra.act === 'swap') { from = it.ex; it.ex = ra.to; }
      return makeItem(it, o.ss, plan, step, { ra: ra && ra.act !== 'swap' ? ra : null, from, myo, where, back });
    });
    /* розминковий підхід — перед першою базовою вправою з вагою */
    for (const st of ENGINE.stepOrder(list)) {
      const it = list[st.i], ex = prog.ex[it.ex], fw = it.sets.find((s) => s.type !== 'W');
      const ws = ENGINE.warmups(ex, fw ? fw.load : null, step, prog.warm, isMach(ex) ? loadStep(ex, it.ex, where) : 0);
      if (ws.length) { it.sets = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true })).concat(it.sets); break; }
    }
    return { n, week: plan.week, cycle: plan.cycle, workout: wid, place: where, deload: plan.deload, back, date: today(), started: Date.now(), ready: ready || 'g', items: list, coach: { warm: false, myo: null, half: false, last: null } };
  }
  /* Текст для голосу: символи й скорочення — словами (5 хв → 5 хвилин, 20–30 с → від 20 до 30 секунд). */
  const sp = (t) => VOICE.norm(t);
  /* Голос: якщо для профілю є записаний пакет і в ньому є всі речення — грає запис; інакше системний голос. */
  const missedSegs = new Set();
  /* речення-вага з voice.target: «40 кілограмів.», «13 з половиною кілограма.», «6,8 кілограма.», «… дисків.» */
  const KG_SAY = /^\d+(,\d+)?( з половиною)? (кілограм|фунт)(а|и|ів)?( дисків)?\.$/, ON_SCREEN = LL('Вага — на екрані.', "The weight is on the screen.");
  const packId = () => { const v = S().voice; return v.packs && DB.active ? v.packs[DB.active] || '' : ''; };
  /* Хто зараз говорить і чому — видно в «Більше» → «Голосовий тренер» (щоб не гадати, чому звучить системний голос). */
  const voiceInfo = { mode: '', why: '' };
  function sysSay(text, why) { voiceInfo.mode = 'system'; voiceInfo.why = why; return VOICE.say(text); }
  function talk(t) {
    if (!S().voice.on || ASK.st === 'talk' || ASK.rec) return false;  // говорить тренер-співрозмовник або людина — фразу тренування пропускаємо
    const text = sp(t), id = I18N.lang === 'en' ? '' : packId();  // англійською — голос телефона: записані голоси українські
    if (I18N.lang === 'en') return sysSay(text, 'English: phone voice');
    if (!id) return sysSay(text, VPACKS.length ? LL('у налаштуваннях обрано системний голос', "system voice is selected in settings") : LL('записані голоси ще не завантажились', "recorded voices haven’t loaded yet"));
    /* опис голосу ще не завантажився (перші секунди після запуску) — дочекатися, а не перемикатися на системний */
    if (!VOICEPACK.packs[id]) { VOICEPACK.load(id).then(() => talk(t), () => sysSay(text, LL('записаний голос не завантажився — перевірте інтернет', "recorded voice didn’t load — check your internet connection"))); return true; }
    let segs = VOICE.split(text);
    /* вага, якої немає в записі (крок тренажера вашого залу 4,5 чи 6,8 кг, своя вага цифрами), не переводить усю фразу
       на системний голос: число видно на екрані — тренер каже «Вага — на екрані.» (поки її немає в записі — пропускає) */
    const miss = VOICEPACK.missing(id, segs);
    if (miss.length && miss.every((x) => KG_SAY.test(x))) {
      const alt = VOICEPACK.has(id, [ON_SCREEN]) ? ON_SCREEN : null;
      segs = segs.map((x) => (miss.indexOf(x) >= 0 ? alt : x)).filter((x, k, arr) => x && !(x === ON_SCREEN && arr[k - 1] === ON_SCREEN));
      if (!segs.length) return false;
    }
    if (!VOICEPACK.has(id, segs)) { VOICEPACK.missing(id, segs).forEach((x) => missedSegs.add(x)); VOICEPACK.stop(); return sysSay(text, LL('цієї фрази немає в записі', "this phrase isn’t in the recording")); }
    VOICE.stop(); ensureAudio();
    VOICEPACK.play(id, segs, audio).then((ok) => { if (ok) { voiceInfo.mode = 'pack'; voiceInfo.why = ''; } else sysSay(text, VOICEPACK.lastError || LL('запис не програвся', "recording didn’t play")); });
    return true;
  }
  const speaking = () => VOICE.busy() || VOICEPACK.busy;
  /* Записані голоси: список у voices/packs.json; для кожного профілю — свій (чоловічий / жіночий). */
  let VPACKS = [];
  async function initPacks() {
    try { const r = await fetch('voices/packs.json', { cache: 'no-cache' }); if (r.ok) VPACKS = await r.json(); } catch (e) { VPACKS = []; }
    const v = S().voice; if (!v.packs) v.packs = {}; if (!v.packsManual) v.packsManual = {};
    /* голосів лише два (чоловічий і жіночий): файли прибраних голосів — геть із телефону */
    if (VPACKS.length) VOICEPACK.forget(VPACKS.map((x) => x.id));
    /* за замовчуванням — найкращий голос своєї статі; з'явився кращий — переходимо, якщо людина не обирала сама */
    Object.keys(PROGRAMS).forEach((id) => {
      const sex = PROGRAMS[id].sex, best = VPACKS.filter((x) => x.gender === sex).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
      /* обраний голос прибрано або обрано системний (його більше немає у виборі) — знову найкращий своєї статі */
      if ((v.packs[id] && !VPACKS.some((x) => x.id === v.packs[id])) || (v.packs[id] === '' && VPACKS.length)) { v.packs[id] = undefined; v.packsManual[id] = false; }
      if (v.packs[id] === undefined || (!v.packsManual[id] && best && v.packs[id] !== best.id)) v.packs[id] = best ? best.id : '';
    });
    save();
    const id = I18N.lang === 'en' ? '' : packId();  // англійською записані (українські) голоси не завантажуємо
    if (id) {
      try {
        await VOICEPACK.load(id);
        /* тихо зберегти весь голос у телефоні, щоб тренер говорив і без інтернету */
        if (!(await VOICEPACK.cached(id))) VOICEPACK.download(id).catch(() => {});
      } catch (e) { /* лишається системний голос */ }
    }
    if (view === 'more') rMore();
  }
  /* початок тренування: «і вдома, і в залі» — спершу «Де сьогодні?», зі спиною — питання про самопочуття */
  function beginWorkout(wid, place) {
    const prog = G();
    if (prog.gymWorkouts && !place) return placeSheet(wid);
    if (prog.custom && !prog.askReady) return startWorkout(wid, 'g', place);
    return readySheet(wid, place);
  }
  function placeSheet(wid) {
    /* удома — саме те обладнання, що вказане в анкеті */
    const eq = (DB.custom && DB.custom.answers && DB.custom.answers.equip) || [], kit = kitText(eq, true);
    openSheet(`${LL(`<b>Де тренуєтесь сьогодні?</b><p class="small muted">Від цього залежать вправи тренування.</p>
      <div class="pick">`, `<b>Where are you training today?</b><p class="small muted">This decides which exercises are in your workout.</p>
      <div class="pick">`)}${[['home', LL('Вдома', "At home"), kit], ['gym', LL('У залі', "At the gym"), LL('тренажери й блоки', "machines and cables")]].map(([v, l, d]) => `<button type="button" data-act="place" data-v="${v}" data-w="${wid || ''}"><b>${l}</b><span class="small muted">${d}</span></button>`).join('')}</div>`);
  }
  function startWorkout(wid, ready, place) {
    ensureAudio(); VOICE.unlock(); stopTimer();  // таймер від попереднього тренування не переносимо в нове
    P().draft = buildDraft(wid, ready, place); save(); view = 'workout'; render(); window.scrollTo(0, 0);
    badgeSync(); remindSync(false);  // почали — значок геть, сьогодні нагадування не прийде
    const d = P().draft, prog = G(), mins = ENGINE.estimateMins(prog, d.items), nEx = d.items.filter((x) => !x.skipped).length;
    talk(woTitle(d.workout) + '. ' + nEx + ' ' + VOICE.plural(nEx, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises")) + LL('. Приблизно ', ". About ") + mins + ' ' + VOICE.plural(mins, LL('хвилина', "minute"), LL('хвилини', "minutes"), LL('хвилин', "minutes")) + '.'
      + (ready === 'r' ? LL(' Сьогодні без вправ на поперек. ', " No lower back exercises today. ") + L('r', 0) : ready === 'y' ? LL(' Вправи на поперек сьогодні легші. ', " Lower back exercises are lighter today. ") + L('y', 0) : ' ') + (hard() ? L('start', d.n) : LL('Починаємо.', "Let’s get started.")) + (S().mode === 'list' ? '' : LL(' Спершу розминка.', " Warm-up first.")));
  }
  function draftStats(d) {
    let done = 0, total = 0;
    d.items.forEach((it) => { if (it.skipped) return; it.sets.forEach((s) => { total++; if (s.done) done++; }); });
    return { done, total };
  }
  function setName(it, k) {
    const s = it.sets[k]; if (!s) return '';
    return s.type === 'W' ? LL('розминка', "warm-up") : s.type === 'D' ? LL('дроп-сет', "drop set") : LL('підхід ', "set ") + it.sets.slice(0, k + 1).filter((x) => x.type !== 'W' && x.type !== 'D').length;
  }
  /* робочі підходи — без розминкових і дроп-сетів (дроп — продовження свого підходу) */
  const workCount = (it) => it.sets.filter((x) => x.type !== 'W' && x.type !== 'D').length;
  const curStep = (d) => ENGINE.stepOrder(d.items).find((st) => !d.items[st.i].sets[st.j].done) || null;
  function stepTitle(d, st) {
    const it = d.items[st.i], s = it.sets[st.j];
    return s.type === 'W' ? LL('Розминковий підхід', "Warm-up set") : s.type === 'D' ? LL('Дроп-сет', "Drop set") : LL('Підхід ', "Set ") + it.sets.slice(0, st.j + 1).filter((x) => x.type !== 'W' && x.type !== 'D').length + LL(' з ', " of ") + workCount(it);
  }
  function nextLabel(d) {
    const st = curStep(d); if (!st) return '';
    const it = d.items[st.i]; return G().ex[it.ex].name + ' · ' + setName(it, st.j);
  }
  /* Тренер: характер (жорсткий з гумором або спокійний) і сценарій вправи. */
  const hard = () => S().voice.tone !== 'calm';
  const L = (kind, seed) => (hard() ? COACH.line(kind, G().sex, seed) + ' ' : '');
  /* сценарій тренера: у власній програмі — з тієї програми, звідки взято вправу */
  /* орієнтир обʼєму: мʼязи (10–20 підходів) чи сила й тонус (6–12) */
  const volHi = () => DB.active === 'him' || (G().custom && DB.custom && GEN.goalsOf(DB.custom.answers).indexOf('muscle') >= 0);
  const script = (exId) => {
    const g = G(), sc = COACH.get((g.coachFrom && g.coachFrom[exId]) || DB.active, exId);
    /* спину в анкеті не позначено — «Чого не робити» без згадки про грижу */
    return sc && sc.dontGen && g.custom && !g.backCare ? Object.assign({}, sc, { dont: sc.dontGen }) : sc;
  };
  /* Фраза про наступний підхід. Перший раз у вправі — навіщо, положення, рух і дихання; другий — чого не робити й чому;
     останній робочий — характер. brief — лише ціль (для «Почати раніше» й повтору). */
  function setSpeech(d, st, brief) {
    const it = d.items[st.i], ex = G().ex[it.ex], s = it.sets[st.j], full = S().voice.level !== 'short', sc = script(it.ex);
    let t = ex.name + '. ' + stepTitle(d, st) + '. ' + VOICE.target(ex, s, it, full ? plateSide(ex, it, s.load) : null);
    if (s.type === 'M') t += LL(' Міо-підхід: до відмови, далі короткі паузи.', " Myo-rep set: go to failure, then short rests.");
    if (s.type === 'D') t += LL(' Одразу.', " No rest.");
    if (ex.spine && s.type !== 'W') t += LL(' Запас два.', " Two reps in reserve.");
    if (it.ss && it.ss.k === 1) { const b = d.items[st.i + 1]; if (b && !b.skipped) t += LL(' Суперсет: одразу після — ', " Superset: then straight into ") + G().ex[b.ex].name + '.'; }
    if (brief) return sp(t);
    const doneN = it.sets.filter((x) => x.done).length, lastWork = s.type !== 'W' && !it.sets.slice(st.j + 1).some((x) => x.type !== 'W');
    if (ex.spine && s.type !== 'W' && !it.sets.some((x) => x.done && x.type !== 'W')) t += ' ' + COACH.line('spine', G().sex);
    if (doneN === 0) {
      if (sc) t += ' ' + (full ? COACH.howText(sc) : LL('Як: ', "How: ") + sc.move);
      else t += ' ' + VOICE.firstSentence(ex.tip);
    } else if (doneN === 1 && sc && sc.dont) {
      t += ' ' + (full ? COACH.dontText(sc) : sc.dont[0][0] + ' — ' + sc.dont[0][1] + '.');
    } else if (lastWork && workCount(it) > 1) t += ' ' + L('last', d.n + st.i);
    else if (sc && sc.breath && full) t += ' ' + sc.breath;
    return sp(t);
  }
  /* розминка й заминка: для «і вдома, і в залі» в день залу — залу (без квартири й крісла), інакше — з довідки програми */
  /* raw — український оригінал (у ньому позначки «#Заминка», «Перед першою…»); без raw — мовою застосунку, рядок у рядок */
  function warmSrc(raw) { const d = P() && P().draft, prog = raw ? PROGRAMS[DB.active] : G(); const w = d && d.place === 'gym' && prog.gymWorkouts ? { id: 'warm', items: prog.gymWarm || GEN.GYM_WARM } : (prog.guide || []).find((g) => g.id === 'warm'); return w && !raw && w.items === (PROGRAMS[DB.active].gymWarm || GEN.GYM_WARM) ? { id: w.id, items: w.items.map(TR) } : w; }
  function coolText() {
    const r = warmSrc(true), w = warmSrc(); if (!r || !w) return '';
    const k = r.items.findIndex((x) => /^#Заминка/.test(x)); if (k < 0) return '';
    return w.items.slice(k + 1).join(' ');
  }
  function warmList() {
    const r = warmSrc(true), w = warmSrc(); if (!r || !w) return { title: LL('Розминка', "Warm-up"), items: [] };
    let title = LL('Розминка', "Warm-up"); const items = [];
    for (let i = 0; i < r.items.length; i++) {
      const x = r.items[i], y = w.items[i] === undefined ? x : w.items[i];
      if (x.charAt(0) === '#') { if (/^#Заминка/.test(x)) break; title = y.slice(1); continue; }
      if (/^(У залі п|П)еред першою/.test(x)) continue;  // про розминковий підхід — лише на екрані, не голосом
      items.push(y);
    }
    return { title, items };
  }

  /* ---------- позначка підходу ---------- */
  function markDone(i, j) {
    const p = P(), d = p.draft, it = d.items[i], s = it.sets[j], ex = G().ex[it.ex];
    ensureAudio(); s.done = true; haptic(); s.pr = [];
    const histAll = ENGINE.history(p, it.ex, 'all');
    /* рекорд — лише коли вправа вже була в попередніх тренуваннях */
    if (s.type !== 'W' && histAll.length) {
      const earlier = it.sets.slice(0, j).filter((x) => x.done && x.type !== 'W').map((x) => ({ load: x.load, reps: x.reps, variant: it.variant, type: x.type }));
      s.pr = ENGINE.prTypes(ex, { load: s.load, reps: Number(s.reps), variant: it.variant, type: s.type }, histAll.concat(earlier.length ? [{ date: d.date, sets: earlier }] : []), p.handle);
    }
    const nx = it.sets[j + 1]; if (nx && !nx.done && !nx.touched && (nx.type === s.type || (s.type === 'N' && nx.type === 'M'))) nx.load = s.load;
    if (d.coach) d.coach.last = { i, j };
    save();
    if (s.pr.length) toast(LL('🏆 Рекорд: ', "🏆 PR: ") + ex.name, true);
    return s;
  }
  /* Список: позначка будь-якого підходу. */
  function toggleDone(i, j) {
    const d = P().draft, s = d.items[i].sets[j];
    if (s.done) { s.done = false; s.pr = []; save(); rWorkout(); return; }
    if (!(Number(s.reps) > 0)) { openKp(i, j, 'reps'); return; }
    VOICE.unlock(); markDone(i, j);
    const st = draftStats(d);
    if (st.done < st.total) { const rest = ENGINE.restAfter(d.items, i, j); if (rest > 0) startTimer(rest, nextLabel(d), 'rest'); else stopTimer(); }
    else stopTimer();
    rWorkout();
    if (s.pr.length) talk(hard() ? COACH.line('pr', G().sex, d.n + i) : LL('Новий рекорд!', "New PR!"));
  }
  /* Тренер: позначка поточного підходу й наступний крок. */
  function coachDone() {
    const d = P().draft, cs = curStep(d); if (!cs) return;
    const s = d.items[cs.i].sets[cs.j];
    if (!(Number(s.reps) > 0)) { openKp(cs.i, cs.j, 'reps'); return; }
    VOICE.unlock(); markDone(cs.i, cs.j);
    const pr = s.pr.length ? (hard() ? COACH.line('pr', G().sex, d.n + cs.i) + ' ' : LL('Новий рекорд! ', "New PR! ")) : '';
    if (s.type === 'M') { d.coach.myo = { i: cs.i, j: cs.j, k: 0 }; s.mini = []; save(); startTimer(15, LL('Міо: пауза', "Myo: rest"), 'myo'); rWorkout(); talk(pr + L('myo', 0) + LL('Пауза 15 секунд. Глибоко дихай.', "Rest 15 seconds. Breathe deep.")); return; }
    afterSet(d, cs.i, cs.j, pr);
  }
  function afterSet(d, i, j, pre) {
    const st = draftStats(d), nx = curStep(d);
    let t = pre || '';
    if (!d.coach.half && st.total >= 6 && st.done * 2 >= st.total && nx) { d.coach.half = true; t += hard() ? L('half', 0) : LL('Половина тренування позаду. ', "Halfway there. "); }
    save();
    if (!nx) { stopTimer(); rWorkout(); talk(t + LL('Усі підходи зроблено. ', "All sets done. ") + (coolText() ? LL('Заминка. ', "Cool-down. ") + coolText() : LL('Можна завершувати.', "You can wrap up now."))); return; }
    const left = ENGINE.stepOrder(d.items).filter((x) => !d.items[x.i].sets[x.j].done).length;
    const rest = ENGINE.restAfter(d.items, i, j), lastTxt = left === 1 ? LL('Останній підхід тренування. ', "Last set of the workout. ") : '';
    const nIt = d.items[nx.i], restLine = nIt.sets.filter((x) => x.done).length >= 2 ? L('rest', d.n + i + j) : '';
    if (rest > 0) { startTimer(rest, nextLabel(d), 'rest'); rWorkout(); talk(t + LL('Відпочинок ', "Rest ") + VOICE.secs(rest) + '. ' + restLine + LL('Далі. ', "Next. ") + lastTxt + setSpeech(d, nx)); }
    else { stopTimer(); rWorkout(); talk(t + LL('Одразу. ', "No rest. ") + lastTxt + setSpeech(d, nx)); }
  }
  function myoRep(r) {
    const d = P().draft, m = d.coach.myo; if (!m) return;
    const s = d.items[m.i].sets[m.j]; s.mini = (s.mini || []).concat([r]); m.k++; haptic(); save();
    if (m.k >= 3 || r < 3) return myoEnd();
    startTimer(15, LL('Міо: пауза', "Myo: rest"), 'myo'); rWorkout(); talk(LL('Пауза 15 секунд.', "Rest 15 seconds."));
  }
  function myoEnd() {
    const d = P().draft, m = d.coach.myo; if (!m) return;
    d.coach.myo = null; stopTimer();
    const s = d.items[m.i].sets[m.j], tot = (s.mini || []).reduce((a, x) => a + x, 0);
    afterSet(d, m.i, m.j, LL('Міо-підхід завершено. ', "Myo-rep set done. ") + (tot ? LL('У міні-підходах — ', "Mini-sets total: ") + VOICE.reps(tot) + '. ' : ''));
  }
  function onTimerEnd(kind) {
    const d = P() && P().draft; if (!d) return;
    if (kind === 'myo') { talk(LL('Ще від трьох до пʼяти повторень.', "Three to five more reps.")); rWorkout(); return; }
    const cs = curStep(d);
    talk(cs ? LL('Час! ', "Time! ") + G().ex[d.items[cs.i].ex].name + '.' : LL('Час!', "Time!"));
    if (view === 'workout') rWorkout();
  }

  /* ---------- екран тренування ---------- */
  function rWorkout() { if (!P() || !P().draft) { view = 'home'; return render(); } document.body.classList.toggle('coachv', S().mode !== 'list'); return S().mode === 'list' ? rList() : rCoach(); }
  const ICON = {
    themeAuto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" style="fill:currentColor"/></svg>',
    themeLight: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    themeDark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    coach: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    radio: '<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };
  function wbar(d, prog, st) {
    const list = S().mode === 'list';
    return `${LL(`<div class="wbar"><button type="button" class="ghost" data-act="minimize" aria-label="згорнути">⌄</button>
      <div class="t"><b>`, `<div class="wbar"><button type="button" class="ghost" data-act="minimize" aria-label="minimize">⌄</button>
      <div class="t"><b>`)}${esc(woTitle(d.workout))}</b><span id="elapsed">0:00</span> · <span>${st.done}/${st.total}${LL(`</span></div>
      <div class="wbr"><button type="button" class="ic" data-act="ask" aria-label="запитати тренера">`, `</span></div>
      <div class="wbr"><button type="button" class="ic" data-act="ask" aria-label="ask the coach">`)}${ICON.mic}</button><button type="button" class="ic${RADIO.state === 'playing' || RADIO.state === 'loading' ? ' rad' : ''}${LL(`" id="radBtn" data-act="radio" aria-label="радіо">`, `" id="radBtn" data-act="radio" aria-label="radio">`)}${ICON.radio}</button><button type="button" class="ic" id="modeBtn" data-act="mode" aria-label="${list ? LL('режим тренера', "coach mode") : LL('список усіх вправ', "list of all exercises")}">${list ? ICON.coach : ICON.list}${LL(`</button><button type="button" class="pri" data-act="finish">Готово</button></div>
      <div class="wradio" id="wRadio">`, `</button><button type="button" class="pri" data-act="finish">Finish</button></div>
      <div class="wradio" id="wRadio">`)}${radioRow()}</div></div>
      <div class="prog"><i style="width:${st.total ? Math.round(st.done / st.total * 100) : 0}%"></i></div>`;
  }
  function startElapsed(d) {
    const el = () => { const e = document.getElementById('elapsed'); if (!e) return; const s = Math.floor((Date.now() - d.started) / 1000); e.textContent = (s >= 3600 ? Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) : Math.floor(s / 60)) + ':' + pad(s % 60); };
    el(); clearInterval(elapsedT); elapsedT = setInterval(el, 1000);
  }
  const q = (k) => `<button type="button" class="q" data-act="gl" data-k="${k}${LL(`" aria-label="що це">?</button>`, `" aria-label="what’s this">?</button>`)}`;
  /* повернення після перерви — одним реченням */
  function backText(b) {
    if (!b) return '';
    const off = b.off >= 14 && b.off < 60 ? plural(b.off, LL('день', "day"), LL('дні', "days"), LL('днів', "days")) : plural(Math.round(b.off / 7), LL('тиждень', "week"), LL('тижні', "weeks"), LL('тижнів', "weeks"));
    return b.kind === 'short' ? `${LL(`Перерва `, `Break of `)}${off}${LL(`: перший тиждень вага на ≈ 20 % менша, без відмови. Далі — як звично.`, `: first week ≈ 20% lighter, no failure. Then back to normal.`)}`
      : `${LL(`Перерва `, `Break of `)}${off}${LL(`: повертаємось за `, `: ramping back up over `)}${plural(b.N, LL('тиждень', "week"), LL('тижні', "weeks"), LL('тижнів', "weeks"))}${LL(`, зараз `, `, now on week `)}${b.k}${LL(`-й — ≈ `, ` — ≈ `)}${b.pct}${LL(` % колишньої ваги, без відмови.`, `% of your previous weight, no failure.`)}`;
  }
  function phaseBox(d) {
    const plan = ENGINE.planFor(G(), d.n);
    return `${LL(`<details class="card"><summary class="sp" style="list-style:none;cursor:pointer"><span><span class="chip a">Тиждень `, `<details class="card"><summary class="sp" style="list-style:none;cursor:pointer"><span><span class="chip a">Week `)}${plan.week}${plan.cycle > 1 ? LL(' · цикл ', " · cycle ") + plan.cycle : ''}</span> <span class="chip">${esc(d.back ? LL('запас 3–4', "RIR 3–4") : plan.note.rir)}</span>${d.back ? LL(' <span class="chip w">після перерви</span>', " <span class=\"chip w\">after a break</span>") : plan.deload ? LL(' <span class="chip w">легкий</span>', " <span class=\"chip w\">deload</span>") : ''}${d.ready && d.ready !== 'g' ? LL(' <span class="chip b">спина ', " <span class=\"chip b\">back ") + (d.ready === 'y' ? '🟡' : '🔴') + '</span>' : ''}</span><span class="muted small">ⓘ</span></summary>
      ${d.back ? `<p class="small"><b>↩ ${esc(backText(d.back))}</b></p>` : ''}<p class="small"><b>${esc(plan.note.phase)}.</b> ${esc(plan.note.text)}</p></details>`;
  }

  /* --- режим «Тренер»: один крок на екрані --- */
  function rCoach() {
    const d = P().draft, prog = G(), st = draftStats(d);
    if (!d.coach) d.coach = { warm: true, myo: null, half: false, last: null };
    let body;
    if (!d.coach.warm) body = warmCard();
    else if (T.id && T.kind === 'myo') body = myoPauseCard(d);
    else if (d.coach.myo) body = myoMiniCard(d);
    else if (T.id && T.kind === 'rest') body = restCard(d);
    else { const cs = curStep(d); body = cs ? setCard(d, cs) : coolCard(); }
    app.innerHTML = wbar(d, prog, st) + body;
    startElapsed(d); keepAwake(true);
    if (T.id) tickTimer();
    if (document.querySelector('.cdone')) tourMaybe('coach');
  }
  function chipsFor(d, cs) {
    const it = d.items[cs.i], ex = G().ex[it.ex], s = it.sets[cs.j];
    const order = d.items.filter((x) => !x.skipped), out = [`${LL(`<span class="chip">Вправа `, `<span class="chip">Exercise `)}${order.indexOf(it) + 1}${LL(` з `, ` of `)}${order.length}</span>`,
      s.type === 'W' ? `<button type="button" class="chip w" data-act="gl" data-k="warm">${esc(stepTitle(d, cs))} · ?</button>` : `<span class="chip a">${esc(stepTitle(d, cs))}</span>`];
    if (it.ss) out.push(`${LL(`<button type="button" class="chip p" data-act="gl" data-k="ss">Суперсет `, `<button type="button" class="chip p" data-act="gl" data-k="ss">Superset `)}${it.ss.g}${it.ss.k} · ?</button>`);
    if (s.type === 'M') out.push(LL('<button type="button" class="chip g" data-act="gl" data-k="myo">Міо-підхід · ?</button>', "<button type=\"button\" class=\"chip g\" data-act=\"gl\" data-k=\"myo\">Myo-rep set · ?</button>"));
    if (ex.spine && s.type !== 'W') out.push(LL('<button type="button" class="chip b" data-act="gl" data-k="spine">Поперек · запас 2 · ?</button>', "<button type=\"button\" class=\"chip b\" data-act=\"gl\" data-k=\"spine\">Lower back · 2 RIR · ?</button>"));
    return `<div class="cchips">${out.join('')}</div>`;
  }
  function setCard(d, cs) {
    const prog = G(), it = d.items[cs.i], ex = prog.ex[it.ex], s = it.sets[cs.j], ij = `data-i="${cs.i}" data-j="${cs.j}"`;
    const vsel = ex.variants ? `<div class="seg">${ex.variants.map((v) => `<button type="button" class="${v.id === it.variant ? 'on' : ''}" data-act="variant" data-i="${cs.i}" data-v="${v.id}">${esc(v.label)}</button>`).join('')}</div>` : '';
    const tgt = ex.type === 'amrap' ? LL('скільки зможете', "as many as you can") : s.type === 'M' ? LL('до відмови', "to failure") : s.type === 'W' ? LL('легко', "easy") : (it.min === it.max ? it.max : it.min + '–' + it.max) + (ex.type === 'time' ? LL(' с', " sec") : '');
    const mt = (w) => (isMach(ex) ? ` data-tip="${w}${LL(` на крок тренажера: `, ` one machine step: `)}${fmt(loadStep(ex, it.ex))}${KG(LL(` кг."`, ` kg."`))}` : '');
    const pm = (f) => `<div class="cpm"><button type="button" data-act="cstep" data-f="${f}" data-d="-1" ${ij}${LL(` aria-label="менше"`, ` aria-label="decrease"`)}${f === 'load' ? mt(LL('Менше', "Down")) : ''}>−</button><button type="button" data-act="cstep" data-f="${f}" data-d="1" ${ij}${LL(` aria-label="більше"`, ` aria-label="increase"`)}${f === 'load' ? mt(LL('Більше', "Up")) : ''}>+</button></div>`;
    const kgOn = hasKg(ex) && s.load !== null && s.load !== undefined && s.load !== '';
    const boxL = isLoad(ex) ? `<div class="cbox"><span class="cl2">${ex.type === 'band' ? LL('рівень еспандера', "band level") : isMach(ex) ? KG(LL('вага, кг', "weight, kg")) : KG(LL('диски на гантель, кг', "plates per dumbbell, kg"))}</span>
      <button type="button" class="cval" data-act="kp" data-f="load" ${ij}${loadTip(ex, LL('. Торкніться, щоб ввести інше число.', ". Tap to enter a different number."))}>${esc(loadText(ex, s.load))}</button>${pm('load')}
      <span class="tiny muted"${isMach(ex) ? KG(LL(' data-tip="Крок цього тренажера: на стільки кг змінюють вагу кнопки − і +. На вашому тренажері інший — введіть свою вагу цифрами: застосунок підхопить крок."', " data-tip=\"This machine’s step: the − and + buttons change the weight by this many kg. If your machine’s step is different, type in your weight and the app will pick it up.\"")) : ex.type === 'band' ? LL(' data-tip="Рівень — сума номерів джгутів, якщо їх кілька."', " data-tip=\"Level is the sum of the band numbers if you use more than one.\"") : ''}>${kgOn ? LL('у руках ', "total ") + fmt(ENGINE.totalLoad(ex, s.load, P().handle, it.variant)) + KG(LL(' кг', " kg")) : ex.type === 'band' ? LL('сума номерів джгутів', "sum of band numbers") : isMach(ex) ? LL('на тренажері · крок ', "on machine · step ") + fmt(loadStep(ex, it.ex)) : '&nbsp;'}</span></div>` : '';
    const boxR = `<div class="cbox"><span class="cl2">${ex.type === 'time' ? LL('секунди', "seconds") : LL('повторення', "reps")}${ex.side ? LL(' · на бік', " · per side") : ''}</span>
      <button type="button" class="cval" data-act="kp" data-f="reps" ${ij}>${s.reps === null || s.reps === undefined ? '—' : s.reps}</button>${pm('reps')}${LL(`
      <span class="tiny muted">ціль: `, `
      <span class="tiny muted">target: `)}${esc(tgt)}</span></div>`;
    const plat = ENGINE.plateau(ex, histAt(it.ex, (P().draft || {}).place), P().handle) ? LL('<div class="note w small">Плато: 3 тренування без зростання — опускання 3–4 с, пауза 2 с внизу або +1 підхід.</div>', "<div class=\"note w small\">Plateau: 3 workouts with no progress — try a 3–4 sec lowering, a 2 sec pause at the bottom, or +1 set.</div>") : '';
    const userNote = P().notes[it.ex] ? `<div class="hint">📝 ${esc(P().notes[it.ex])}</div>` : '';
    const rir = (s.type === 'W' || ex.type === 'amrap') ? '' : `${LL(`<div class="crir"><span class="small muted">Скільки ще могли б зробити? `, `<div class="crir"><span class="small muted">How many more could you have done? `)}${q('rir')}</span>
      <div class="seg">${[[0, '0'], [1, '1'], [2, '2'], [3, '3+']].map(([x, l]) => `<button type="button" class="${s.rir === x || (x === 3 && s.rir > 3) ? 'on' : ''}" data-act="crir" data-v="${x}" ${ij}>${l}</button>`).join('')}</div></div>`;
    return `<div class="coach">${chipsFor(d, cs)}
      <h1 class="cname">${esc(ex.name)}</h1><div class="cmus">${esc(ex.m.p.map(mName).join(' · '))}${ex.side ? LL(' · кожен бік', " · each side") : ''}</div>
      ${vsel}${it.note ? `<div class="hint">💡 ${esc(it.note)}</div>` : ''}${plat}${userNote}
      <div class="ctarget${isLoad(ex) ? '' : ' one'}">${boxL}${boxR}</div>
      ${plateLine(ex, it, s.load)}
      ${s.prev && s.type !== 'W' ? `<button type="button" class="ghost cprev" data-act="copyprev" ${ij}${LL(`>Минулого: `, `>Last time: `)}${esc(setText(ex, s.prev))}${LL(` — повторити</button>`, ` — repeat</button>`)}` : ''}
      ${rir}
      <button type="button" class="pri wide big cdone" data-act="cdone">✓ ${s.type === 'W' ? LL('Розминковий підхід зроблено', "Warm-up set done") : LL('Підхід виконано', "Set done")}</button>
      ${techHtml(it.ex, !it.sets.some((x) => x.done))}${LL(`
      <div class="grid3 cacts"><button type="button" data-act="say" data-what="tip">🔊 Як робити</button><button type="button" data-act="say" data-what="set">🔁 Повторити</button><button type="button" id="cMore" data-act="exmenu" data-i="`, `
      <div class="grid3 cacts"><button type="button" data-act="say" data-what="tip">🔊 How to do it</button><button type="button" data-act="say" data-what="set">🔁 Repeat</button><button type="button" id="cMore" data-act="exmenu" data-i="`)}${cs.i}${LL(`">⋯ Ще</button></div>
      </div>`, `">⋯ More</button></div>
      </div>`)}${upcoming(d, cs)}${phaseBox(d)}`;
  }
  function skippedBox(d) {
    const sk = d.items.map((it, i) => ({ it, i })).filter((x) => x.it.skipped); if (!sk.length) return '';
    return `${LL(`<h2>Пропущено й за бажанням</h2><div class="card"><ul class="list">`, `<h2>Skipped and optional</h2><div class="card"><ul class="list">`)}${sk.map(({ it, i }) => `<li><span>${esc(G().ex[it.ex].name)}<div class="tiny muted">${it.optional ? LL('за бажанням', "optional") : esc(it.note || LL('пропущено', "skipped"))}</div></span><button type="button" class="sm" data-act="unskip" data-i="${i}">${it.optional ? LL('Додати', "Add") : LL('Повернути', "Bring back")}</button></li>`).join('')}</ul></div>`;
  }
  /* Техніка на екрані: навіщо, положення, рух, дихання, чого не робити й чому. */
  function techHtml(exId, open) {
    const sc = script(exId), ex = G().ex[exId];
    if (!sc) return ex.tip ? `<div class="note small">${esc(ex.tip)}</div>` : '';
    return `<details class="tech"${open ? ' open' : ''}${LL(`><summary><b>Як робити й чого не робити</b><span class="small muted">`, `><summary><b>How to do it and what to avoid</b><span class="small muted">`)}${esc(sc.why)}${LL(`</span></summary>
      <p><b>Положення.</b> `, `</span></summary>
      <p><b>Setup.</b> `)}${esc(sc.setup)}${LL(`</p><p><b>Рух.</b> `, `</p><p><b>Movement.</b> `)}${esc(sc.move)}</p>${sc.breath ? `${LL(`<p><b>Дихання.</b> `, `<p><b>Breathing.</b> `)}${esc(sc.breath)}</p>` : ''}
      ${sc.dont && sc.dont.length ? `${LL(`<p><b>Чого не робити:</b></p><ul>`, `<p><b>What to avoid:</b></p><ul>`)}${sc.dont.map((x) => `<li><b>${esc(x[0])}</b> — ${esc(x[1])}.</li>`).join('')}</ul>` : ''}
      ${ex.tip ? `${LL(`<p class="tiny muted"><b>З програми:</b> `, `<p class="tiny muted"><b>From your program:</b> `)}${esc(ex.tip)}</p>` : ''}</details>`;
  }
  function upcoming(d, cs) {
    const all = ENGINE.stepOrder(d.items).filter((x) => !d.items[x.i].sets[x.j].done), k = all.findIndex((x) => x.i === cs.i && x.j === cs.j);
    const nx = all.slice(k + 1, k + 4); if (!nx.length) return skippedBox(d);
    return `${LL(`<h2>Далі</h2><div class="card"><ul class="list">`, `<h2>Up next</h2><div class="card"><ul class="list">`)}${nx.map((x) => { const it = d.items[x.i], ex = G().ex[it.ex], s = it.sets[x.j]; return `<li><span>${esc(ex.name)}<div class="tiny muted">${esc(stepTitle(d, x))}${it.ss ? LL(' · суперсет ', " · superset ") + it.ss.g : ''}</div></span><span class="small">${esc(setText(ex, s))}</span></li>`; }).join('')}</ul></div>` + skippedBox(d);
  }
  function ringSvg() {
    const r = 52, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" style="stroke:var(--soft)" stroke-width="9"/><circle id="cArc" cx="60" cy="60" r="${r}" fill="none" style="stroke:var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>`;
  }
  function restCard(d) {
    const nx = curStep(d), prog = G(), last = d.coach.last;
    let nxt = '';
    if (nx) { const it = d.items[nx.i], ex = prog.ex[it.ex], s = it.sets[nx.j]; nxt = `${LL(`<div class="cnext"><span class="tiny muted">Далі`, `<div class="cnext"><span class="tiny muted">Up next`)}${it.ss ? LL(' · суперсет ', " · superset ") + it.ss.g : ''}</span><b>${esc(ex.name)}</b><span class="small">${esc(stepTitle(d, nx))} · ${esc(setText(ex, s))}${ex.side ? LL(' на бік', " per side") : ''}</span>${plateLine(ex, it, s.load)}</div>`; }
    return `<div class="coach crest"><div class="cring">${ringSvg()}${LL(`<div class="ctime"><b id="cTime">0:00</b><span>відпочинок</span></div></div>
      <div class="grid3"><button type="button" data-act="tadd" data-v="-15">−15 с</button><button type="button" data-act="tadd" data-v="15">+15 с</button><button type="button" class="pri" data-act="tskip">Почати</button></div>
      `, `<div class="ctime"><b id="cTime">0:00</b><span>rest</span></div></div>
      <div class="grid3"><button type="button" data-act="tadd" data-v="-15">−15 sec</button><button type="button" data-act="tadd" data-v="15">+15 sec</button><button type="button" class="pri" data-act="tskip">Start</button></div>
      `)}${nxt}${last ? `<button type="button" class="ghost wide" data-act="kp" data-f="reps" data-i="${last.i}" data-j="${last.j}${LL(`">✎ Виправити щойно зроблений підхід</button>`, `">✎ Edit the set you just did</button>`)}` : ''}${LL(`
      <div class="grid2 cacts"><button type="button" data-act="say" data-what="set">🔊 Що далі</button><button type="button" data-act="mode">☰ Усі вправи</button></div></div>`, `
      <div class="grid2 cacts"><button type="button" data-act="say" data-what="set">🔊 What’s next</button><button type="button" data-act="mode">☰ All exercises</button></div></div>`)}`;
  }
  function myoPauseCard(d) {
    const m = d.coach.myo, k = m ? m.k : 0;
    return `<div class="coach crest">${LL('<div class="cchips"><button type="button" class="chip g" data-act="gl" data-k="myo">Міо-підхід · ?</button></div>', "<div class=\"cchips\"><button type=\"button\" class=\"chip g\" data-act=\"gl\" data-k=\"myo\">Myo-rep set · ?</button></div>")}
      <div class="cring">${ringSvg()}${LL(`<div class="ctime"><b id="cTime">0:15</b><span>пауза</span></div></div>
      <p class="center">Глибоко вдихніть 3–5 разів. Далі — 3–5 повторень тією самою вагою.</p><p class="center small muted">Міні-підходів: `, `<div class="ctime"><b id="cTime">0:15</b><span>rest</span></div></div>
      <p class="center">Take 3–5 deep breaths. Then do 3–5 reps with the same weight.</p><p class="center small muted">Mini-sets: `)}${k}${LL(` з 3</p>
      <button type="button" class="pri wide big" data-act="tskip">Почати раніше</button><p></p><button type="button" class="ghost wide" data-act="myoEnd">Досить — завершити міо</button></div>`, ` of 3</p>
      <button type="button" class="pri wide big" data-act="tskip">Start early</button><p></p><button type="button" class="ghost wide" data-act="myoEnd">That’s enough — end myo set</button></div>`)}`;
  }
  function myoMiniCard(d) {
    const m = d.coach.myo, s = d.items[m.i].sets[m.j], ex = G().ex[d.items[m.i].ex];
    return `<div class="coach">${LL('<div class="cchips"><button type="button" class="chip g" data-act="gl" data-k="myo">Міо-підхід · ?</button></div>', "<div class=\"cchips\"><button type=\"button\" class=\"chip g\" data-act=\"gl\" data-k=\"myo\">Myo-rep set · ?</button></div>")}
      <h1 class="cname">${esc(ex.name)}${LL(`</h1><div class="cmus">Міні-підхід `, `</h1><div class="cmus">Mini-set `)}${m.k + 1}${LL(` з 3 · та сама вага`, ` of 3 · same weight`)}${(s.mini || []).length ? LL(' · вже: ', " · so far: ") + s.mini.join(' + ') : ''}${LL(`</div>
      <p class="small">Скільки повторень вийшло? Торкніться числа.</p>
      <div class="cnums">`, `</div>
      <p class="small">How many reps did you get? Tap a number.</p>
      <div class="cnums">`)}${[1, 2, 3, 4, 5, 6].map((r) => `<button type="button" data-act="myoRep" data-v="${r}">${r}</button>`).join('')}${LL(`</div>
      <p class="tiny muted">Менше трьох — міо-підхід завершується сам: мʼяз уже втомлений достатньо.</p>
      <button type="button" class="ghost wide" data-act="myoEnd">Досить — завершити міо</button></div>`, `</div>
      <p class="tiny muted">Fewer than three and the myo-rep set ends on its own: the muscle is tired enough.</p>
      <button type="button" class="ghost wide" data-act="myoEnd">That’s enough — end myo set</button></div>`)}`;
  }
  function warmCard() {
    const w = warmList();
    return `${LL(`<div class="coach"><div class="cchips"><span class="chip a">Крок 1 · розминка</span></div><h1 class="cname">`, `<div class="coach"><div class="cchips"><span class="chip a">Step 1 · warm-up</span></div><h1 class="cname">`)}${esc(w.title)}</h1>
      <ul class="clist">${w.items.map((x) => `<li>${esc(x)}</li>`).join('')}${LL(`</ul>
      <button type="button" class="pri wide big" data-act="cwarm">✓ Розминку зроблено</button>
      <div class="grid2 cacts"><button type="button" data-act="say" data-what="warm">🔊 Прослухати</button><button type="button" data-act="cwarm" data-skip="1">Пропустити</button></div></div>`, `</ul>
      <button type="button" class="pri wide big" data-act="cwarm">✓ Warm-up done</button>
      <div class="grid2 cacts"><button type="button" data-act="say" data-what="warm">🔊 Listen</button><button type="button" data-act="cwarm" data-skip="1">Skip</button></div></div>`)}${phaseBox(P().draft)}`;
  }
  function coolCard() {
    const c = coolText();
    return `${LL(`<div class="coach"><div class="cchips"><span class="chip ok">Усі підходи зроблено</span></div><h1 class="cname">Майже все 🎉</h1>
      `, `<div class="coach"><div class="cchips"><span class="chip ok">All sets done</span></div><h1 class="cname">Almost done 🎉</h1>
      `)}${c ? `${LL(`<p><b>Заминка.</b> `, `<p><b>Cool-down.</b> `)}${esc(c)}</p>` : LL('<p>Можна завершувати тренування.</p>', "<p>You can finish your workout now.</p>")}${LL(`
      <button type="button" class="pri wide big" data-act="finish">Завершити тренування</button><p></p>
      <button type="button" class="ghost wide" data-act="mode">☰ Переглянути всі підходи</button></div>`, `
      <button type="button" class="pri wide big" data-act="finish">Finish workout</button><p></p>
      <button type="button" class="ghost wide" data-act="mode">☰ View all sets</button></div>`)}`;
  }

  /* --- режим «Список»: усі вправи й підходи --- */
  function exCard(d, i) {
    const it = d.items[i], prog = G(), ex = prog.ex[it.ex];
    const range = ex.type === 'amrap' ? LL('скільки зможете, запас 2', "as many as you can, 2 RIR") : (it.min === it.max ? it.max : it.min + '–' + it.max) + (ex.type === 'time' ? LL(' с', " sec") : '');
    const mus = ex.m.p.map(mName).join(' · ');
    const ssb = it.ss ? `<span class="ssb">${it.ss.g}${it.ss.k}</span>` : '';
    if (it.skipped) {
      return `<div class="exc skip"><div class="exh"><div>${ssb}<h3 style="display:inline">${esc(ex.name)}</h3><div class="mus">${workCount(it)} × ${range}${it.optional ? LL(' · за бажанням', " · optional") : ''}</div>${it.note && !it.optional ? `<div class="hint">${esc(it.note)}</div>` : ''}</div>
        <button type="button" class="sm" data-act="unskip" data-i="${i}">${it.optional ? LL('Додати', "Add") : LL('Повернути', "Bring back")}</button></div></div>`;
    }
    const plat = ENGINE.plateau(ex, histAt(it.ex, (P().draft || {}).place), P().handle) ? LL('<div class="note w small">Плато: 3 тренування без зростання — опускання 3–4 с, пауза 2 с внизу або +1 підхід.</div>', "<div class=\"note w small\">Plateau: 3 workouts with no progress — try a 3–4 sec lowering, a 2 sec pause at the bottom, or +1 set.</div>") : '';
    let note = it.note || '';
    if (it.ex === 'goblet' && it.variant === 'g1' && /максимальна|^Max weight/.test(note)) note += LL(' Час переходити на «2 гантелі на плечах».', " Time to move up to “2 dumbbells on shoulders.”");
    const vsel = ex.variants ? `<div class="seg">${ex.variants.map((v) => `<button type="button" class="${v.id === it.variant ? 'on' : ''}" data-act="variant" data-i="${i}" data-v="${v.id}">${esc(v.label)}</button>`).join('')}</div>` : '';
    const hdr = `${LL(`<div class="tr h"><span>підхід</span><span>минулого</span><span`, `<div class="tr h"><span>set</span><span>previous</span><span`)}${loadTip(ex, '.')}>${ex.type === 'band' ? LL('рівень', "level") : hasKg(ex) ? KG(LL('диски, кг', "plates, kg")) : isMach(ex) ? KG(LL('вага, кг', "weight, kg")) : ''}</span><span>${ex.type === 'time' ? LL('секунди', "seconds") : LL('повтор.', "reps")}</span><span></span></div>`;
    const rows = it.sets.map((s, j) => {
      const lab = s.type === 'N' ? String(it.sets.slice(0, j + 1).filter((x) => x.type !== 'W').length) : ({ W: LL('Р', "W"), D: LL('Д', "D"), F: LL('В', "F"), M: LL('М', "M") }[s.type]);
      const loadCell = isLoad(ex) ? `<button type="button" class="cl" data-act="kp" data-f="load" data-i="${i}" data-j="${j}"${loadTip(ex, LL('. Торкніться, щоб ввести інше число.', ". Tap to enter a different number."))}>${esc(loadText(ex, s.load))}${hasKg(ex) && s.load !== null && s.load !== undefined && s.load !== '' ? LL('<small>+ гриф</small>', "<small>+ handle</small>") : ''}</button>` : '<span class="cl na">—</span>';
      const repCell = `<button type="button" class="cl" data-act="kp" data-f="reps" data-i="${i}" data-j="${j}">${s.reps === null || s.reps === undefined ? '—' : s.reps + (ex.type === 'time' ? LL(' с', " sec") : '')}${s.rir !== null && s.rir !== undefined ? `${LL(`<small>запас `, `<small>RIR `)}${s.rir >= 4 ? '4+' : s.rir}</small>` : ''}</button>`;
      const pr = s.pr && s.pr.length ? `<div class="prb">🏆 ${s.pr.map((t) => ({ e1rm: LL('рекорд максимуму', "est. 1RM PR"), weight: LL('рекорд ваги', "weight PR"), reps: LL('рекорд повторень', "rep PR") }[t])).join(' · ')}</div>` : '';
      const mini = s.type === 'M' ? `<div class="prb mi"><button type="button" class="sm" data-act="minis" data-i="${i}" data-j="${j}${LL(`">міні-підходи: `, `">mini-sets: `)}${(s.mini || []).length ? s.mini.join(' + ') : LL('записати', "log")}</button></div>` : '';
      return `<div class="tr${s.done ? ' dn' : ''}${s.pr && s.pr.length ? ' pr' : ''}"><button type="button" class="st ${s.type}" data-act="stype" data-i="${i}" data-j="${j}${LL(`" aria-label="тип підходу">`, `" aria-label="set type">`)}${lab}</button>
        <button type="button" class="pv" data-act="copyprev" data-i="${i}" data-j="${j}">${s.type === 'W' ? '' : esc(setText(ex, s.prev))}</button>${loadCell}${repCell}
        <button type="button" class="ck" data-act="done" data-i="${i}" data-j="${j}${LL(`" aria-label="виконано">✓</button>`, `" aria-label="done">✓</button>`)}${pr}${mini}</div>`;
    }).join('');
    const userNote = P().notes[it.ex] ? `<div class="hint">📝 ${esc(P().notes[it.ex])}</div>` : '';
    const firstWork = it.sets.find((s) => s.type !== 'W');
    return `<div class="exc${it.ss ? ' ss' : ''}">
      <div class="exh"><div>${ssb}<h3 style="display:inline">${esc(ex.name)}</h3><div class="mus">${esc(mus)} · ${workCount(it)} × ${range}${ex.side ? LL(' · на бік', " · per side") : ''} · ${it.ss && it.ss.k === 1 ? LL('одразу в пару', "straight into its pair") : LL('відпочинок ', "rest ") + it.rest + LL(' с', " sec")}${ex.spine ? LL(' · поперек: запас 2', " · lower back: 2 RIR") : ''}</div></div>
      <button type="button" class="dots" data-act="exmenu" data-i="${i}${LL(`" aria-label="меню вправи">⋯</button></div>
      `, `" aria-label="exercise menu">⋯</button></div>
      `)}${vsel}${note ? `<div class="hint">💡 ${esc(note)}</div>` : ''}${plat}${userNote}
      <div class="tb">${hdr}${rows}</div>
      <div class="exf"><div class="row"><button type="button" class="sm" data-act="addset" data-i="${i}${LL(`">+ Підхід</button></div>
      `, `">+ Add set</button></div>
      `)}${plateLine(ex, it, firstWork ? firstWork.load : null)}</div></div>`;
  }
  function rList() {
    const d = P().draft, prog = G(), st = draftStats(d);
    app.innerHTML = `${wbar(d, prog, st)}${phaseBox(d)}${LL(`
      <p class="small muted">Літери підходів: <b>Р</b> розминка · <b>Д</b> дроп · <b>В</b> до відмови · <b>М</b> міо; цифра — робочий підхід.<br>💡 Незрозуміло, що це? Затисніть будь-яку кнопку чи напис — зʼявиться підказка.</p>
      `, `
      <p class="small muted">Set letters: <b>W</b> warm-up · <b>D</b> drop · <b>F</b> to failure · <b>M</b> myo; a number means a working set.<br>💡 Not sure what something means? Press and hold any button or label to see a tip.</p>
      `)}${d.items.map((_, i) => exCard(d, i)).join('')}
      ${coolText() ? `${LL(`<div class="note ok small"><b>Заминка:</b> `, `<div class="note ok small"><b>Cool-down:</b> `)}${esc(coolText())}</div>` : ''}${LL(`
      <button type="button" class="pri wide big" data-act="finish">Завершити тренування</button><p></p>
      <button type="button" class="ghost wide" data-act="discard">Скасувати тренування</button>`, `
      <button type="button" class="pri wide big" data-act="finish">Finish workout</button><p></p>
      <button type="button" class="ghost wide" data-act="discard">Discard workout</button>`)}`;
    startElapsed(d); keepAwake(true);
  }
  /* Тип підходу: вибір зі зрозумілим поясненням замість перемикання букв наосліп */
  const SET_TYPES = [
    ['N', LL('Робочий (цифра)', "Working (number)"), LL('Звичайний підхід — саме він рахується в прогрес.', "A regular set — this is the one that counts toward your progress.")],
    ['W', LL('Р — розминка', "W — warm-up"), LL('Легка вага, щоб розігріти мʼязи й суглоби. У прогрес не йде.', "Light weight to warm up your muscles and joints. Doesn’t count toward progress.")],
    ['D', LL('Д — дроп', "D — drop"), LL('Одразу після підходу — ще один у легшому варіанті тією самою вагою (напр., з колін), без відпочинку.', "Right after the set — one more in an easier variation with the same weight (e.g., from your knees), no rest.")],
    ['F', LL('В — до відмови', "F — to failure"), LL('Робите, доки виходить із правильною технікою, без запасу.', "Keep going as long as your form stays good, with no reps in reserve.")],
    ['M', LL('М — міо', "M — myo"), LL('Підхід до відмови, далі 2–3 міні-підходи по 3–5 повторень з паузою 15 с.', "A set to failure, then 2–3 mini-sets of 3–5 reps with 15 sec rests.")]];
  /* дроп-сет: одразу після підходу, без відпочинку, легше — як саме, залежить від обладнання */
  function dropHow(ex) {
    if (isMach(ex)) return LL('Одразу після підходу, без відпочинку — ще один із легшою вагою: фіксатор на 1–2 кроки нижче (приблизно на чверть легше).', "Right after the set, with no rest — one more with a lighter weight: move the pin 1–2 steps down (about a quarter lighter).");
    if (ex.type === 'band') return LL('Одразу після підходу, без відпочинку — ще один із легшим опором: на рівень нижче або ближче до дверей.', "Right after the set, with no rest — one more with lighter resistance: one level down or closer to the door.");
    return SET_TYPES.find((t) => t[0] === 'D')[2];
  }
  /* «Дроп-сет» у меню вправи — у фазі 3 (тижні 9–11), як у затвердженій програмі; не для вправ на поперек, не там, де програма без відмови,
     і не у вправах з міо-підходом (ізоляція вже має свій підхід до відмови) */
  function dropOk(it) {
    const prog = G(), ex = prog.ex[it.ex], d = P().draft, plan = ENGINE.planFor(prog, d.n);
    return !!prog.myoFrom && !ex.spine && plan.week >= 9 && plan.week <= 11 && !plan.deload && !d.back && ex.type !== 'time'
      && !it.skipped && it.sets.some((x) => x.type !== 'W') && ['D', 'M'].indexOf((it.sets[it.sets.length - 1] || {}).type) < 0;  // після міо — ні: два підходи до відмови на одну вправу
  }
  function dropLoad(it) {
    const ex = G().ex[it.ex], last = it.sets.filter((x) => x.type !== 'W' && x.type !== 'D').slice(-1)[0] || {}, L = Number(last.load);
    if (last.load === null || last.load === undefined || last.load === '' || !(L > 0)) return last.load === undefined ? null : last.load;
    if (isMach(ex)) { const st = loadStep(ex, it.ex); return Math.max(st, Math.round(Math.floor(L * 0.75 / st + 1e-9) * st * 100) / 100); }
    if (ex.type === 'band') return Math.max(1, L - 1);
    return L;  // гантелі — легший варіант тією самою вагою
  }
  function typeSheet(i, j) {
    const it = P().draft.items[i], s = it.sets[j], ex = G().ex[it.ex], spine = ex.spine, noFail = !G().myoFrom;
    /* поперек — без відмови (як у програмі); тиск чи серце або вік від 55 (програма без міо) — теж без підходів до відмови */
    const list = SET_TYPES.filter((t) => !(spine || noFail) || t[0] === 'N' || t[0] === 'W');
    openSheet(`${LL(`<div class="sp"><b>Тип підходу</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      `, `<div class="sp"><b>Set type</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      `)}${spine ? LL('<p class="small muted">Вправа навантажує поперек — лише звичайні й розминкові підходи, щоб берегти спину.</p>', "<p class=\"small muted\">This exercise loads your lower back — regular and warm-up sets only, to protect your back.</p>") : noFail ? LL('<p class="small muted">Ваша програма — без підходів до відмови (тиск чи серце або вік від 55): лише звичайні й розминкові.</p>', "<p class=\"small muted\">Your program has no sets to failure (blood pressure, heart, or age 55+): regular and warm-up sets only.</p>") : ''}
      ${list.map((t) => `<button type="button" class="wide tsel${(s.type || 'N') === t[0] ? ' on' : ''}" data-act="stypeSet" data-i="${i}" data-j="${j}" data-t="${t[0]}"><b>${t[1]}</b><span class="small muted">${t[0] === 'D' ? dropHow(ex) : t[2]}</span></button>`).join('')}`);
  }
  function minisSheet(i, j, keep) {
    /* keep — перемальовуємо після вибору: беремо вже вибране, а не збережене */
    const s = P().draft.items[i].sets[j], m = keep && ui.minis ? ui.minis.m : (s.mini || []).slice();
    ui.minis = { i, j, m };
    const row = (k) => `${LL(`<div class="sp" style="margin:8px 0"><span>Міні-підхід `, `<div class="sp" style="margin:8px 0"><span>Mini-set `)}${k + 1}</span><div class="row">${[0, 1, 2, 3, 4, 5, 6].map((r) => `<button type="button" class="sm${m[k] === r ? ' pri' : ''}" data-act="miniSet" data-k="${k}" data-v="${r}">${r}</button>`).join('')}</div></div>`;
    openSheet(`${LL(`<div class="sp"><b>Міо: міні-підходи</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div><p class="small muted">Після основного підходу — пауза 15 с і 3–5 повторень; до трьох разів. 0 — не робили.</p>`, `<div class="sp"><b>Myo: mini-sets</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div><p class="small muted">After the main set — rest 15 sec, then 3–5 reps; up to three times. 0 means you didn’t do it.</p>`)}${[0, 1, 2].map(row).join('')}${LL(`
      <button type="button" class="pri wide" data-act="miniSave">Зберегти</button>`, `
      <button type="button" class="pri wide" data-act="miniSave">Save</button>`)}`);
  }
  function finishWorkout() {
    stopTimer();
    const p = P(), d = p.draft, prog = G();
    const sets = [], prList = [];
    d.items.forEach((it) => {
      if (it.skipped) return;
      const types = new Set();
      it.sets.forEach((s) => { if (!s.done || !(Number(s.reps) > 0)) return; const x = { ex: it.ex, variant: it.variant || undefined, type: s.type || 'N', load: s.load === '' ? null : s.load, reps: Number(s.reps), rir: s.rir === null || s.rir === undefined ? null : Number(s.rir) }; if (s.mini && s.mini.length) x.mini = s.mini.filter((r) => r > 0); sets.push(x); (s.pr || []).forEach((t) => types.add(t)); });
      if (types.size) prList.push({ ex: it.ex, types: Array.from(types) });
    });
    if (!sets.length) { if (confirm(LL('Жодного підходу не відмічено. Закрити тренування без збереження?', "No sets checked off. Close the workout without saving?"))) { p.draft = null; save(); stopTimer(); view = 'home'; render(); remindSync(false); } return; }
    const st = draftStats(d);
    if (st.done < st.total && !confirm(LL('Відмічено ', "Checked off ") + st.done + LL(' з ', " of ") + st.total + LL(' підходів. Завершити тренування?', " sets. Finish the workout?"))) return;
    const sess = { id: Date.now(), date: d.date, n: d.n, week: d.week, workout: d.workout, place: d.place === 'gym' || d.place === 'home' ? d.place : undefined, deload: d.deload, back: d.back && d.back.f ? d.back.f : undefined, ready: d.ready || 'g', mins: Math.max(1, Math.round((Date.now() - d.started) / 60000)), sets, prs: prList.reduce((a, x) => a + x.types.length, 0), prList };
    p.sessions.push(sess); p.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    p.draft = null; save(); stopTimer(); keepAwake(false);
    ui.summary = sess.id; view = 'summary'; render(); window.scrollTo(0, 0);
    badgeSync(); remindSync(false);  // сьогодні вже тренувались: значок геть, нагадування сьогодні не прийде
    talk(LL('Тренування завершено. ', "Workout complete. ") + VOICE.cap(sess.mins + ' ' + VOICE.plural(sess.mins, LL('хвилина', "minute"), LL('хвилини', "minutes"), LL('хвилин', "minutes"))) + '. ' + (sess.prs ? LL('Рекордів: ', "PRs: ") + sess.prs + '. ' : '') + (hard() ? COACH.line('end', G().sex, sess.n) : LL('Гарна робота!', "Great work!")));
  }

  /* ---------- клавіатура (шторка) ---------- */
  function openKp(i, j, f) {
    const d = P().draft, it = d.items[i], s = it.sets[j], ex = G().ex[it.ex];
    const isRep = f === 'reps';
    const cur = isRep ? s.reps : s.load;
    kp = { i, j, f, str: cur === null || cur === undefined ? '' : String(cur).replace('.', DEC), rir: s.rir, fresh: true };
    drawKp();
  }
  function drawKp() {
    const d = P().draft, it = d.items[kp.i], s = it.sets[kp.j], ex = G().ex[it.ex], isRep = kp.f === 'reps';
    const step = isRep ? (ex.type === 'time' ? 5 : 1) : loadStep(ex, it.ex);
    const unit = isRep ? (ex.type === 'time' ? LL('с', "sec") : LL('повт.', "reps")) : (ex.type === 'band' ? LL('рівень', "level") : isMach(ex) ? KG(LL('кг', "kg")) : KG(LL('кг дисків на гантель', "kg of plates per dumbbell")));
    const title = esc(G().ex[it.ex].name) + ' · ' + setName(it, kp.j);
    const v = num(kp.str);
    let extra = '';
    if (!isRep && hasKg(ex)) {
      const pl = v === null ? null : ENGINE.plates(v, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap, isLb() ? 'lb' : 'kg');
      const tot = v === null ? 0 : ENGINE.totalLoad(ex, v, P().handle, it.variant);
      extra = `<p class="small muted" style="text-align:center">${v === null ? (ex.type === 'dbopt' ? LL('без гантелі', "no dumbbell") : '') : LL('усього в руках: ', "total in hand: ") + fmt(tot) + KG(LL(' кг', " kg"))}${pl ? ' · ' + (pl.ok ? (pl.side.length ? LL('на бік: ', "per side: ") + esc(pl.text) + ' ' + discs(pl.side) : LL('лише гриф', "handle only")) : '⚠ ' + esc(pl.text)) : ''}</p>`;
    }
    const quick = [];
    if (s.prev) quick.push([LL('минулого: ', "last time: ") + (isRep ? s.prev.reps : loadText(ex, s.prev.load)), isRep ? s.prev.reps : s.prev.load]);
    if (!isRep && ex.type === 'dbopt') quick.push([LL('без гантелі', "no dumbbell"), '']);
    if (!isRep && hasKg(ex)) quick.push([LL('лише гриф', "handle only"), 0]);
    if (isRep && it.max > 0) { for (let r = Math.max(1, it.min - 2); r <= it.max + 2 && quick.length < 9; r++) quick.push([String(r), r]); }
    const rir = isRep ? `${LL(`<label class="f">Запас повторень (скільки ще могли б)</label><div class="seg">`, `<label class="f">Reps in reserve (how many more you could do)</label><div class="seg">`)}${[[null, '—'], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']].map(([x, l]) => `<button type="button" class="${kp.rir === x ? 'on' : ''}" data-k="rir" data-v="${x === null ? '' : x}">${l}</button>`).join('')}</div>` : '';
    openSheet(`<div class="sp"><b class="small">${title}${LL(`</b><button type="button" class="sm ghost" data-k="close">Закрити</button></div>
      <div class="kv"`, `</b><button type="button" class="sm ghost" data-k="close">Close</button></div>
      <div class="kv"`)}${!isRep && isMach(ex) ? KG(LL(' data-tip="Число, яке ви вводите: вага на тренажері чи блоці, кг."', " data-tip=\"The number you enter: weight on the machine or cable, kg.\"")) : ''}>${kp.str === '' ? (isRep ? '—' : ex.type === 'dbopt' ? LL('без', "none") : '—') : esc(kp.str)} <small>${unit}</small></div>${extra}
      <div class="quick">${quick.map(([l, x]) => `<button type="button" class="sm" data-k="set" data-v="${x === null || x === undefined ? '' : x}">${esc(l)}</button>`).join('')}</div>${rir}
      <div class="keys">${['1', '2', '3', '−', '4', '5', '6', '+', '7', '8', '9', '⌫', isRep ? '' : ',', '0', '', 'ok'].map((k) => {
        if (k === '') return '<span></span>';
        if (k === 'ok') return LL('<button type="button" class="ok" data-k="ok">Готово</button>', "<button type=\"button\" class=\"ok\" data-k=\"ok\">Done</button>");
        if (k === '−' || k === '+') return `<button type="button" class="op" data-k="${k === '+' ? 'inc' : 'dec'}">${k}${fmt(step)}</button>`;
        if (k === '⌫') return LL('<button type="button" class="op" data-k="bs" aria-label="стерти">⌫</button>', "<button type=\"button\" class=\"op\" data-k=\"bs\" aria-label=\"delete\">⌫</button>");
        return `<button type="button" data-k="d" data-v="${k}">${k}</button>`;
      }).join('')}</div>`);
    kp.step = step;
  }
  function kpApply(close) {
    const d = P().draft, it = d.items[kp.i], s = it.sets[kp.j], ex = G().ex[it.ex];
    const v = num(kp.str);
    if (kp.f === 'reps') { s.reps = v === null ? null : Math.max(0, Math.round(v)); s.rir = kp.rir; }
    else {
      let L = v; if (L !== null && (hasKg(ex) || isMach(ex))) L = Math.min(loadCap(ex), Math.max(0, L)); if (L !== null && ex.type === 'band') L = Math.max(0, Math.round(L));
      s.load = (L === null && ex.type !== 'dbopt' && ex.type !== 'band') ? s.load : L;
    }
    s.touched = true; save();
    if (close) { closeSheet(); rWorkout(); }
  }
  sheetEl.addEventListener('click', (e) => {
    /* кнопки з дією (міні-підходи, «?») мають власний обробник; data-k без дії — клавіші цифрової клавіатури */
    const b = e.target.closest('[data-k]'); if (!b || b.dataset.act) return sheetAct(e);
    if (!kp) return;
    const k = b.dataset.k;
    if (k === 'close') { closeSheet(); return; }
    if (k === 'd') { if (kp.fresh) { kp.str = ''; kp.fresh = false; } const ch = b.dataset.v; if (ch === ',' && (kp.str.indexOf(',') >= 0 || kp.f === 'reps')) return; if (kp.str.length < 5) kp.str += ch; }
    if (k === 'bs') { kp.str = kp.fresh ? '' : kp.str.slice(0, -1); kp.fresh = false; }
    if (k === 'inc' || k === 'dec') { const v = num(kp.str) || 0; const nv = Math.max(0, Math.round((v + (k === 'inc' ? kp.step : -kp.step)) * 100) / 100); kp.str = String(nv).replace('.', DEC); kp.fresh = false; }
    if (k === 'set') { kp.str = b.dataset.v === '' ? '' : String(b.dataset.v).replace('.', DEC); kp.fresh = false; }
    if (k === 'rir') { kp.rir = b.dataset.v === '' ? null : Number(b.dataset.v); }
    if (k === 'ok') { kpApply(true); return; }
    drawKp();
  });

  /* ---------- підсумок ---------- */
  function rSummary() {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === ui.summary); if (!s) { view = 'home'; return render(); }
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    const work = s.sets.filter((x) => x.type !== 'W').length;
    const prevSame = p.sessions.filter((x) => x.workout === s.workout && x.id !== s.id && x.date <= s.date).slice(-1)[0];
    const pvol = prevSame ? ENGINE.sessionVolume(prog, prevSame, p.handle) : 0;
    const dv = prevSame && pvol ? Math.round((vol / pvol - 1) * 100) : null;
    const ms = ENGINE.muscleSets(prog, [s], 0, 9e15);
    const np = ENGINE.planFor(prog, nextN());
    app.innerHTML = `${LL(`<div class="card hero" style="margin-top:calc(14px + env(safe-area-inset-top))"><div class="chip">Тиждень `, `<div class="card hero" style="margin-top:calc(14px + env(safe-area-inset-top))"><div class="chip">Week `)}${s.week}${LL(`</div><h1>Тренування завершено 🎉</h1><p class="muted">`, `</div><h1>Workout complete 🎉</h1><p class="muted">`)}${esc(woTitle(s.workout))} · ${dm(s.date)}</p></div>
      <div class="grid2"><div class="stat"><b>${s.mins}${LL(` хв</b><span>тривалість</span></div><div class="stat"><b>`, ` min</b><span>duration</span></div><div class="stat"><b>`)}${work}${LL(`</b><span>робочих підходів</span></div>
      <div class="stat"><b>`, `</b><span>working sets</span></div>
      <div class="stat"><b>`)}${vol ? fmt(Math.round(vol)) + KG(LL(' кг', " kg")) : '—'}${LL(`</b><span>обсяг`, `</b><span>volume`)}${dv !== null ? ' · ' + (dv >= 0 ? '+' : '') + dv + LL(' % до минулого', "% vs. last time") : ''}</span></div><div class="stat"><b>${s.prs || 0}${LL(`</b><span>рекордів</span></div></div>
      `, `</b><span>PRs</span></div></div>
      `)}${s.prList && s.prList.length ? `${LL(`<h2>🏆 Рекорди</h2><div class="card"><ul class="list">`, `<h2>🏆 PRs</h2><div class="card"><ul class="list">`)}${s.prList.map((x) => `<li><span>${esc(prog.ex[x.ex].name)}</span><span class="chip g">${x.types.map((t) => ({ e1rm: LL('максимум', "est. 1RM"), weight: LL('вага', "weight"), reps: LL('повторення', "reps") }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''}${LL(`
      <h2>Що попрацювало</h2><div class="card">`, `
      <h2>Muscles worked</h2><div class="card">`)}${CHARTS.bodyMap(ms, 6, G().sex)}${LL(`</div>
      <p class="small muted">Наступне: `, `</div>
      <p class="small muted">Next up: `)}${esc(woTitle(np.workout))}${LL(` (тиждень `, ` (week `)}${np.week}${LL(`).</p>
      <button type="button" class="wide" data-act="shareSum">Поділитися підсумком</button><p></p>
      <button type="button" class="pri wide big" data-act="sumDone">Готово</button>`, `).</p>
      <button type="button" class="wide" data-act="shareSum">Share summary</button><p></p>
      <button type="button" class="pri wide big" data-act="sumDone">Done</button>`)}`;
  }
  function shareSummary() {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === ui.summary); if (!s) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    const F = (w, px) => w + ' ' + px + 'px Manrope, -apple-system, Arial';
    g.fillStyle = '#14514f'; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#c8a96a'; g.fillRect(80, 200, 140, 6);
    g.fillStyle = '#fff'; g.font = F(700, 64); g.fillText(LL('Тренування завершено', "Workout complete"), 80, 170);
    g.font = F(400, 40); g.globalAlpha = 0.9; g.fillText(woTitle(s.workout) + ' · ' + dm(s.date), 80, 240); g.globalAlpha = 1;
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    [[s.mins + LL(' хв', " min"), LL('тривалість', "duration")], [String(s.sets.filter((x) => x.type !== 'W').length), LL('підходів', "sets")], [vol ? Math.round(vol) + KG(LL(' кг', " kg")) : '—', LL('обсяг', "volume")], [String(s.prs || 0), LL('рекордів', "PRs")]].forEach((x, k) => {
      const X = 80 + (k % 2) * 480, Y = 380 + Math.floor(k / 2) * 240;
      g.fillStyle = '#0d3937'; g.fillRect(X, Y, 440, 200); g.fillStyle = '#1c4b49'; g.fillRect(X, Y, 6, 200);
      g.fillStyle = '#fff'; g.font = F(700, 84); g.fillText(x[0], X + 36, Y + 110); g.fillStyle = '#e8f0ef'; g.font = F(400, 34); g.fillText(x[1], X + 36, Y + 165); g.fillStyle = '#fff';
    });
    g.font = F(500, 40); let y = 920;
    (s.prList || []).slice(0, 5).forEach((x) => { g.fillText('🏆 ' + prog.ex[x.ex].name, 80, y); y += 64; });
    g.font = F(700, 32); g.globalAlpha = 0.85; g.fillText(LL('Тренування', "Workouts"), 80, 1280);
    c.toBlob((b) => { if (b) shareFile('trenuvannia-' + s.date + '.png', b, 'image/png'); }, 'image/png');
  }

  /* ---------- порадник ---------- */
  function guideBody(sec) {
    const prog = G();
    return sec.items.map((x) => {
      if (x === '@posture') return '<ul class="list">' + prog.posture.map((r) => `<li style="display:block"><b>${esc(r[0])}</b> <span class="chip">${esc(r[1])}</span><div class="small muted" style="margin-top:3px">${esc(r[2])}</div></li>`).join('') + '</ul>';
      if (x.charAt(0) === '#') return `<h3 style="margin:14px 0 4px">${esc(x.slice(1))}</h3>`;
      return `<p class="small" style="margin:6px 0">• ${esc(x)}</p>`;
    }).join('');
  }
  function guideSheet(id) {
    const sec = (G().guide || []).find((g) => g.id === id); if (!sec) return;
    openSheet(`<div class="sp"><b>${esc(sec.title)}${LL(`</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>`, `</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>`)}${guideBody(sec)}`);
  }
  function guideChips(ids) {
    const list = (G().guide || []).filter((g) => !ids || ids.indexOf(g.id) >= 0);
    return '<div class="quick">' + list.map((g) => `<button type="button" class="sm" data-act="guide" data-id="${g.id}">${esc(g.title)}</button>`).join('') + '</div>';
  }

  /* ---------- словник і навчання ---------- */
  function glSheet(k) {
    const g = GLOSSARY[k]; if (!g) return;
    openSheet(`<div class="sp"><b>${esc(g[0])}${LL(`</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div><p>`, `</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div><p>`)}${esc(g[1])}</p>
      <button type="button" class="wide" data-act="say" data-what="gl" data-k="${k}${LL(`">🔊 Прослухати</button>`, `">🔊 Listen</button>`)}`);
  }
  function glAll() {
    openSheet(`${LL(`<div class="sp"><b>Словник</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <ul class="list">`, `<div class="sp"><b>Glossary</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <ul class="list">`)}${Object.keys(GLOSSARY).map((k) => `<li style="display:block"><b>${esc(GLOSSARY[k][0])}</b><div class="small muted" style="margin-top:3px">${esc(GLOSSARY[k][1])}</div></li>`).join('')}</ul>`);
  }
  const TOURS = {
    home: [['.hero .pri', LL('Почніть тут. Застосунок спитає про спину, підставить вагу й поведе тренування голосом — крок за кроком.', "Start here. The app will ask about your back, fill in your weights, and guide your workout by voice — step by step.")],
      ['.dly', LL('Щоденні звички: відмічайте галочкою. «Як робити» — коротка інструкція.', "Daily habits: check them off. “How to do it” is a short guide.")],
      ['#tabs', LL('План — 12 тижнів і історія. Прогрес — графіки й рекорди. Тіло — заміри, харчування, фото. Більше — голос і налаштування.', "Plan: 12 weeks and your history. Progress: charts and PRs. Body: measurements, nutrition, photos. More: voice and settings.")]],
    /* текст про вагу — за тим, що в рамці: диски, тренажер, еспандер чи лише повторення */
    coach: [['.ctarget', () => { const l = (document.querySelector('.ctarget .cl2') || {}).textContent || '', t = LL(' Міняйте кнопками − і + або торкніться числа.', " Adjust with the − and + buttons, or tap the number.");
      return /диски|plates/.test(l) ? LL('Ціль підходу. Вага — скільки дисків на гантель; поруч — повторення.', "Set target. Weight is the plates per dumbbell; next to it, reps.") + t : /вага/.test(l) ? KG(LL('Ціль підходу. Вага на тренажері чи блоці, кг; поруч — повторення.', "Set target. Weight on the machine or cable, kg; next to it, reps.")) + t
        : /еспандер|band/.test(l) ? LL('Ціль підходу. Рівень еспандера; поруч — повторення.', "Set target. Band level; next to it, reps.") + t : LL('Ціль підходу: ', "Set target: ") + (/секунди/.test(l) ? LL('секунди.', "seconds.") : LL('повторення.', "reps.")) + t; }],
      ['.coach .plt', LL('Скільки дисків надіти з кожного боку гантелі.', "How many plates to put on each side of the dumbbell.")],
      ['.cdone', LL('Зробили підхід — натисніть. Тренер сам запустить відпочинок і скаже, що далі.', "Finished the set? Tap here. The coach will start your rest and tell you what’s next.")],
      ['#cMore', LL('Тут — як робити, заміна вправи, пропуск, нотатка.', "Here: how to do it, swap exercise, skip, add a note.")],
      ['#modeBtn', LL('Перемикач: усі вправи списком, як у класичному журналі. Повернутися — тією самою кнопкою.', "Toggle: all exercises in one list, like a classic workout log. Tap the same button to switch back.")]]
  };
  /* поворот екрана посеред навчання — підсвітка зсувається; прибираємо, навчання покажеться знову */
  window.addEventListener('resize', () => { const t = document.getElementById('tour'); if (t) t.remove(); });
  function tourMaybe(id) { if (S().tour[id] || document.getElementById('tour') || document.body.classList.contains('sheet')) return; setTimeout(() => { if (!S().tour[id]) tour(id, 0); }, 400); }
  function tour(id, k) {
    const old = document.getElementById('tour'); if (old) old.remove();
    const steps = TOURS[id];
    if (!steps || k >= steps.length) { S().tour[id] = true; save(); return; }
    const t = document.querySelector(steps[k][0]);
    if (!t || !t.getClientRects().length) return tour(id, k + 1);
    /* нумерація — лише видимих кроків (на тренажері немає рядка дисків, у вправі без ваги — рамки ваги) */
    const vis = steps.filter((s) => { const e = document.querySelector(s[0]); return e && e.getClientRects().length; }), pos = vis.indexOf(steps[k]) + 1;
    t.scrollIntoView({ block: 'center' });
    const r = t.getBoundingClientRect(), H = window.innerHeight, below = r.bottom + 170 < H;
    const ov = document.createElement('div'); ov.id = 'tour';
    ov.innerHTML = `<div class="th" style="left:${Math.max(4, r.left - 6)}px;top:${r.top - 6}px;width:${Math.min(window.innerWidth - 8, r.width + 12)}px;height:${r.height + 12}px"></div>
      <div class="tbx" style="${below ? 'top:' + Math.round(r.bottom + 14) + 'px' : 'bottom:' + Math.round(H - r.top + 14) + 'px'}"><p>${esc(typeof steps[k][1] === 'function' ? steps[k][1]() : steps[k][1])}</p>
      <div class="sp"><span class="tiny">${pos}${LL(` з `, ` of `)}${vis.length}${LL(`</span><span class="row"><button type="button" class="sm ghost" data-tour="skip">Пропустити</button><button type="button" class="sm pri" data-tour="next">`, `</span><span class="row"><button type="button" class="sm ghost" data-tour="skip">Skip</button><button type="button" class="sm pri" data-tour="next">`)}${pos === vis.length ? LL('Зрозуміло', "Got it") : LL('Далі', "Next")}</button></span></div></div>`;
    document.body.appendChild(ov);
    /* дотик повз підказку теж закриває навчання — щоб екран ніколи не «завис» під затемненням */
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-tour]'); if (!b) { if (!e.target.closest('.tbx')) { ov.remove(); S().tour[id] = true; save(); } return; } if (b.dataset.tour === 'skip') { ov.remove(); S().tour[id] = true; save(); } else tour(id, k + 1); });
  }
  function whatsNew() {
    openSheet(`${LL(`<div class="sp"><b>Що вміє застосунок</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <ul class="list">
        <li style="display:block"><b>🍴 Кухня</b><div class="small muted">Нова вкладка: норма калорій і білка за вашою метою; їжа — точно (грами, база USDA), швидко (штука, ложка, чашка) чи руками (долоня, кулак); свої продукти з етикетки й страви за рецептом; «Зберегти прийом» — одним дотиком наступного разу; фото тарілки підказує продукти, а кількість вказуєте ви; «Чим добрати білок» — спершу з того, що ви вже їсте; вода з нагадуваннями.</div></li>
        <li style="display:block"><b>🌓 Тема</b><div class="small muted">Кнопка вгорі праворуч на головній: як у телефоні → світла → темна.</div></li>
        <li style="display:block"><b>🎯 Кілька цілей</b><div class="small muted">В анкеті можна позначити кілька: «Схуднути» й «Набрати мʼязи» разом — менше жиру й більше мʼязів (невеликий дефіцит, більше білка); «Спина й осанка» — з будь-якою. «Сила й здоровʼя» — окремо від схуднення й набору мʼязів: несумісна мета стає неактивною. Обмеження здоровʼя діють завжди, хоч які цілі обрано.</div></li>
        <li style="display:block"><b>⚖️ Кілограми або фунти</b><div class="small muted">В анкеті й у «Більше» → «Одиниці»: кг і см або фунти й дюйми. Набір дисків у фунтах — 10 · 5 · 2,5 lb. Перемкнули — вага тренувань переводиться й округлюється до ваших дисків; вага тіла й заміри просто показуються в нових одиницях.</div></li>
        <li style="display:block"><b>↩ Повернення після перерви</b><div class="small muted">Не тренувались 2 тижні й більше — застосунок сам зменшує вагу: перерва до місяця — перший тиждень на ≈ 20 % легше; довша (або від 60 років — від 2 тижнів) — перший тиждень третина колишньої ваги, далі щотижня більше, до колишньої — за половину часу перерви. Без відмови, міо й дропів.</div></li>
        <li style="display:block"><b>🔔 Нагадування</b><div class="small muted">`, `<div class="sp"><b>What the app can do</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <ul class="list">
        <li style="display:block"><b>🍴 Kitchen</b><div class="small muted">A new tab: calorie and protein targets for your goal; log food exactly (grams, USDA database), quickly (piece, spoon, cup), or by hand (palm, fist); your own foods from labels and recipes; “Save meal” — one tap next time; a photo of your plate suggests the foods, and you enter the amounts; “How to reach your protein” starts with what you already eat; water with reminders.</div></li>
        <li style="display:block"><b>🌓 Theme</b><div class="small muted">The button at the top right of Home: same as your phone → light → dark.</div></li>
        <li style="display:block"><b>🎯 Several goals</b><div class="small muted">In the questionnaire you can check more than one: “Lose weight” and “Build muscle” together means less fat and more muscle (a small deficit, more protein); “Back and posture” goes with any goal. “Strength and health” stays separate from losing weight and building muscle: a goal that clashes is grayed out. Health limits always apply, whatever goals you choose.</div></li>
        <li style="display:block"><b>⚖️ Kilograms or pounds</b><div class="small muted">In the questionnaire and in “More” → “Units”: kg and cm, or pounds and inches. Plates in pounds — 10 · 5 · 2.5 lb. When you switch, workout weights are converted and rounded to your plates; body weight and measurements simply display in the new units.</div></li>
        <li style="display:block"><b>↩ Coming back after a break</b><div class="small muted">Haven’t trained for 2 weeks or more? The app lowers your weights automatically: after a break of up to a month, the first week is ≈ 20% lighter; after a longer one (or 2+ weeks if you’re 60 or older), the first week is a third of your previous weight, then more each week, back to your previous weight in half the length of the break. No failure, myo-reps, or drop sets.</div></li>
        <li style="display:block"><b>🔔 Reminders</b><div class="small muted">`)}${TX(LL('«Більше» → «Нагадування»: у дні тренувань в обраний час — сповіщення, а на іконці «1», поки тренування не почато. Працює в застосунку з іконки на початковому екрані.', "“More” → “Reminders”: on workout days, a notification at the time you choose, plus a “1” badge on the app icon until you start your workout. Works in the app opened from the Home Screen icon."), LL('«Більше» → «Нагадування»: у дні тренувань в обраний час — сповіщення, поки тренування не почато. Працює і в Chrome, і в застосунку з іконки.', "“More” → “Reminders”: on workout days, a notification at the time you choose until you start your workout. Works both in Chrome and in the app opened from the icon."))}${LL(`</div></li>
        <li style="display:block"><b>🗣 Запитайте тренера</b><div class="small muted">Кнопка з мікрофоном на головному екрані й у тренуванні: питайте голосом або текстом — тренер відповідає за вашою програмою (тиждень, вага, техніка, застосунок) і своїм голосом. Потрібен інтернет.</div></li>
        <li style="display:block"><b>📷 Фото тренеру</b><div class="small muted">У чаті тренера — кнопка з камерою: сфотографуйте тренажер, гантелі чи табличку тренажера й запитайте — тренер скаже, що це і як воно у вашій програмі.</div></li>
        <li style="display:block"><b>📝 Програма за анкетою</b><div class="small muted">Складається під вас: мета, досвід, обладнання, здоровʼя, дні тренувань. Змінити відповіді — «Більше» → «Змінити анкету й оновити програму»; історія тренувань лишається.</div></li>
        <li style="display:block"><b>🏋️ Удома й у залі</b><div class="small muted">В анкеті — де тренуєтесь. У залі ті самі тренування на тренажерах і блоках; «і вдома, і в залі» — перед тренуванням застосунок спитає, де ви сьогодні. Тренажер зайнятий — «Ще» → «Замінити». Інший крок ваги у вашому залі (2,5 чи 4,5 кг) застосунок підхоплює з ваших ваг.</div></li>
        <li style="display:block"><b>⬇ Дроп-сет і розминка за станом</b><div class="small muted">У фазі 3 (тижні 9–11) — «⋯ Ще» → «Дроп-сет»: одразу після останнього підходу, без відпочинку, легше (на тренажері — фіксатор на 1–2 кроки нижче). Розминка: без обмежень, до 55 років і до 100 кг — 3 хв (тіло розігріває перший легкий підхід), інакше — повні 10 хв.</div></li>
        <li style="display:block"><b>🏠 Тренажери вдома</b><div class="small muted">У «Що є вдома» — ті самі тренажери, що в залі (або «Усе, як у залі»): удома програма бере їх першими; історія й рекорди спільні з залом, вага — окремо для дому й залу. Додати чи прибрати — будь-коли: «Більше» → «Обладнання вдома»; історія й рекорди лишаються.</div></li>
        <li style="display:block"><b>⚙️ Одне джерело</b><div class="small muted">Дні тренувань, гриф і диски («Більше»), зріст і вік («Кухня» → «Налаштування кухні») одразу йдуть у програму й в анкету; поточний тиждень зберігається.</div></li>
        <li style="display:block"><b>🍽 Норма одразу</b><div class="small muted">Норма калорій і білка — одразу за вагою з анкети; після зважувань у «Замірах» — за ними.</div></li>
        <li style="display:block"><b>🔓 Без коду й Face ID</b><div class="small muted">Застосунок відкривається одразу: дані лише в цьому телефоні, а телефон захищений своїм Face ID чи кодом.</div></li>
        <li style="display:block"><b>🎙 Тренер голосом</b><div class="small muted">Веде тренування крок за кроком: навіщо вправа, як робити, чого не робити, вага й диски, відпочинок, «Час!», рекорди. Характер — жорсткий з гумором. Природний записаний голос: чоловічий і жіночий («Більше» → «Голосовий тренер»).</div></li>
        <li style="display:block"><b>📻 Радіо для тренувань</b><div class="small muted">Кнопка «♪»: 11 станцій. Коли говорить тренер, музика плавно притихає.</div></li>
        <li style="display:block"><b>🟢🟡🔴 Питання про спину</b><div class="small muted">Якщо в анкеті позначено спину: перед тренуванням застосунок питає, як вона, і сам полегшує або прибирає вправи на поперек.</div></li>
        <li style="display:block"><b>⚡ Коротші тренування</b><div class="small muted">Суперсети — дві вправи поспіль, відпочинок після пари; у частині програм ще й міо-підходи в ізоляції. Менше часу, та сама робота.</div></li>
        <li style="display:block"><b>🔄 Заміна вправи</b><div class="small muted">«⋯ Ще» → «Замінити»: рівноцінні вправи на ті самі мʼязи.</div></li>
        <li style="display:block"><b>🎨 Новий вигляд</b><div class="small muted">Мʼякі заокруглені форми, легкі тіні, «скляні» панелі й плавні переходи. Світла й темна тема — за налаштуванням телефона.</div></li>
        <li style="display:block"><b>💡 Підказки</b><div class="small muted">Затисніть будь-яку кнопку чи напис на 1,5 секунди — зʼявиться пояснення простою мовою. А ще: кнопки «?» біля термінів, навчання на першому запуску, словник у «Більше».</div></li>
      </ul><button type="button" class="pri wide" data-act="closeSheet">Зрозуміло</button>`, `</div></li>
        <li style="display:block"><b>🗣 Ask the coach</b><div class="small muted">The microphone button on the Home screen and during a workout: ask by voice or text — the coach answers based on your program (week, weights, form, the app) in its own voice. Requires internet.</div></li>
        <li style="display:block"><b>📷 Photo to the coach</b><div class="small muted">In the coach chat, tap the camera button: snap a photo of a machine, dumbbells, or a machine’s label and ask — the coach will tell you what it is and how it fits into your program.</div></li>
        <li style="display:block"><b>📝 Program from your questionnaire</b><div class="small muted">Built around you: goal, experience, equipment, health, workout days. To change your answers: “More” → “Edit questionnaire and update program”; your workout history stays.</div></li>
        <li style="display:block"><b>🏋️ At home and at the gym</b><div class="small muted">In the questionnaire, choose where you train. At the gym, you get the same workouts on machines and cables; with “Both home and gym,” the app asks where you are before each workout. Machine taken? “More” → “Swap.” If your gym uses a different weight step (2.5 or 4.5 kg), the app picks it up from the weights you enter.</div></li>
        <li style="display:block"><b>⬇ Drop sets and a warm-up that fits you</b><div class="small muted">In phase 3 (weeks 9–11): “⋯ More” → “Drop set” — right after the last set, with no rest, lighter (on a machine, move the pin 1–2 steps down). Warm-up: with no limitations, under 55, and under 100 kg — 3 min (the first light set warms up your body); otherwise, a full 10 min.</div></li>
        <li style="display:block"><b>🏠 Machines at home</b><div class="small muted">In “What you have at home,” pick the same machines as at the gym (or “Full gym setup”): at home, the program uses them first; history and PRs are shared with the gym, while weights are tracked separately for home and gym. Add or remove anytime: “More” → “Home equipment”; your history and PRs stay.</div></li>
        <li style="display:block"><b>⚙️ One source of truth</b><div class="small muted">Workout days, handle, and plates (“More”), plus height and age (“Kitchen” → “Kitchen settings”), go straight into your program and questionnaire; your current week is kept.</div></li>
        <li style="display:block"><b>🍽 Targets right away</b><div class="small muted">Calorie and protein targets are based on your questionnaire weight right away; once you weigh in under “Measurements,” they use those numbers.</div></li>
        <li style="display:block"><b>🔓 No passcode or Face ID</b><div class="small muted">The app opens right away: your data stays only on this phone, and the phone is protected by its own Face ID or passcode.</div></li>
        <li style="display:block"><b>🎙 Voice coach</b><div class="small muted">Guides your workout step by step: why the exercise matters, how to do it, what to avoid, weights and plates, rest, “Time!”, PRs. Personality: tough, with a sense of humor. Natural recorded voice, male or female (“More” → “Voice coach”).</div></li>
        <li style="display:block"><b>📻 Workout radio</b><div class="small muted">The “♪” button: 11 stations. When the coach talks, the music smoothly fades down.</div></li>
        <li style="display:block"><b>🟢🟡🔴 Back check-in</b><div class="small muted">If you checked your back in the questionnaire, the app asks how it feels before each workout and automatically eases or removes lower back exercises.</div></li>
        <li style="display:block"><b>⚡ Shorter workouts</b><div class="small muted">Supersets — two exercises back to back, with rest after the pair; some programs also use myo-rep sets on isolation exercises. Less time, same work.</div></li>
        <li style="display:block"><b>🔄 Exercise swap</b><div class="small muted">“⋯ More” → “Swap”: equivalent exercises for the same muscles.</div></li>
        <li style="display:block"><b>🎨 New look</b><div class="small muted">Soft rounded shapes, light shadows, “glass” panels, and smooth transitions. Light and dark themes follow your phone’s setting.</div></li>
        <li style="display:block"><b>💡 Tips</b><div class="small muted">Press and hold any button or label for 1.5 seconds to see a plain-language explanation. Plus: “?” buttons next to terms, a tutorial on first launch, and a glossary in “More.”</div></li>
      </ul><button type="button" class="pri wide" data-act="closeSheet">Got it</button>`)}`);
    S().tour.v3 = true; S().tour.v4 = true; save();
  }
  function readySheet(wid, place) {
    const her = DB.active === 'her', sw = G().ready && G().ready.swap && G().ready.swap.rdl && G().ex.rdl;
    openSheet(`<b>${her ? LL('Як спина й суглоби сьогодні?', "How are your back and joints today?") : LL('Як спина сьогодні?', "How’s your back today?")}</b> ${q('ready')}${LL(`
      <p class="small muted">Від відповіді залежать вправи на поперек.</p>
      <div class="pick rd">
        <button type="button" data-act="go" data-r="g" data-w="`, `
      <p class="small muted">Your answer decides the lower back exercises.</p>
      <div class="pick rd">
        <button type="button" data-act="go" data-r="g" data-w="`)}${wid || ''}" data-p="${place || ''}${LL(`"><b>🟢 Добре</b><span class="small muted">тренування за планом</span></button>
        <button type="button" data-act="go" data-r="y" data-w="`, `"><b>🟢 Good</b><span class="small muted">workout as planned</span></button>
        <button type="button" data-act="go" data-r="y" data-w="`)}${wid || ''}" data-p="${place || ''}${LL(`"><b>🟡 Ниє, але терпимо</b><span class="small muted">`, `"><b>🟡 Achy, but manageable</b><span class="small muted">`)}${sw ? LL('румунська тяга → міст, решта вправ на поперек — на крок легше', "Romanian deadlift → glute bridge, other lower back exercises one step lighter") : LL('вправи на поперек — на крок легше, запас 3', "lower back exercises one step lighter, 3 RIR")}</span></button>
        <button type="button" data-act="go" data-r="r" data-w="${wid || ''}" data-p="${place || ''}${LL(`"><b>🔴 Болить або віддає в ногу</b><span class="small muted">сьогодні без вправ на поперек</span></button>
      </div>
      <div class="note b small"><b>Негайно до лікаря:</b> оніміння в паху чи між ногами, порушення сечовипускання чи стільця, слабкість у нозі, що наростає.</div>`, `"><b>🔴 Hurts or radiates down my leg</b><span class="small muted">no lower back exercises today</span></button>
      </div>
      <div class="note b small"><b>See a doctor right away if you have:</b> numbness in the groin or between the legs, bladder or bowel problems, or leg weakness that’s getting worse.</div>`)}`);
  }

  /* ---------- радіо ---------- */
  /* ---------- Голосовий тренер-співрозмовник (з 3.12.0; швидкий голос — 3.12.1) ----------
     Питання голосом чи текстом → відповідь тренера голосом потоком (Gemini Live, перший звук ≈ 1 с) і текстом.
     Голос людини розпізнає Whisper на нашому сервері (server/, Cloudflare) — у Google він не потрапляє; Gemini отримує лише текст питання
     і зріз програми (coachctx.js) — без імені, віку, ваги тіла, здоровʼя, замірів і фото. Ключ Gemini — лише на сервері: застосунок
     бере одноразовий токен (/live), у якому вже закріплено модель, голос і базу знань. Немає звуку за 5 с — запасний шлях (/ask).
     Будь-яка нова дія (питання, мікрофон, «Прослухати», «Нова розмова») глушить усі попередні (ASK.gen) — двох голосів одночасно не буває.
     Розмова живе до закриття застосунку. ⏭ Захист доступу до сервера — окрема сесія (CLAUDE.md §11). */
  const COACH_URL = 'https://kason-gym-coach.kason-tech.workers.dev';
  const ASK_EX = [LL('Яку вагу брати сьогодні?', "What weight should I use today?"), LL('Як правильно робити першу вправу?', "How do I do the first exercise correctly?"), LL('Що таке міо-підхід?', "What’s a myo-rep set?"), LL('Навіщо легкий тиждень?', "Why do a deload week?")];
  /* що тренер знає про програму: триває тренування — його стан; ні — наступне тренування з підказками ваги */
  function coachProgram() {
    const p = P(), prog = G(), d = p.draft;
    if (d) {
      const st = draftStats(d), cs = curStep(d);
      return COACHCTX.text({ prog, plan: ENGINE.planFor(prog, d.n), items: d.items, workout: d.workout, place: d.place, inProgress: true, cur: cs ? { i: cs.i, j: cs.j } : null, done: st.done, total: st.total, back: backText(d.back), kitchen: kitchenCtx() });
    }
    const last = p.sessions[p.sessions.length - 1];
    const place = prog.gymWorkouts ? (last && last.place) || 'home' : (prog.place === 'gym' ? 'gym' : 'home');
    const pv = buildDraft(null, 'g', place);
    return COACHCTX.text({ prog, plan: ENGINE.planFor(prog, nextN()), items: pv.items, workout: pv.workout, place: pv.place, inProgress: false, back: backText(pv.back), kitchen: kitchenCtx() });
  }
  const coachIds = () => Object.keys(G().ex).filter((id) => !G().ex[id].retired);
  function askStateText() {
    if (ASK.st === 'mic') return LL('<b>Зараз ', "<b>Your ") + TX('iPhone', LL('телефон', "phone")) + LL(' спитає дозвіл на мікрофон — натисніть «Дозволити».</b>', " will now ask for microphone access — tap “Allow.”</b>");
    if (ASK.st === 'rec') { const s = Math.floor((Date.now() - ASK.t0) / 1000); return `${LL(`<b>Слухаю… 0:`, `<b>Listening… 0:`)}${pad(s)}${LL(`</b> · торкніться, щоб надіслати`, `</b> · tap to send`)}`; }
    if (ASK.st === 'think') return LL('<b>Думаю…</b>', "<b>Thinking…</b>");
    if (ASK.st === 'talk') return LL('<b>Говорю…</b> · торкніться, щоб зупинити', "<b>Speaking…</b> · tap to stop");
    if (ASK.st === 'err') return `<span class="bad">${esc(ASK.msg)}</span>`;
    if (ASK.photo) return LL('<b>Фото додано</b> — запитайте голосом, напишіть або просто «Надіслати».', "<b>Photo added</b> — ask by voice, type a question, or just tap “Send.”");
    return ASK.chat.length ? LL('Торкніться, щоб уточнити.', "Tap to ask a follow-up.") : LL('Торкніться й запитайте: програма, вага, техніка, застосунок.', "Tap and ask: program, weights, form, the app.");
  }
  /* мікрофон заборонено — прості кроки, як дозволити (віконце iPhone більше не зʼявиться само) */
  const MIC_HELP = () => LL('<div class="note w" id="askHelp"><b>Дозвольте мікрофон — один раз</b><ol class="small" style="margin:6px 0 4px;padding-left:20px">', "<div class=\"note w\" id=\"askHelp\"><b>Allow the microphone — just once</b><ol class=\"small\" style=\"margin:6px 0 4px;padding-left:20px\">") +
    TX(LL('<li>Відкрийте «Параметри» iPhone.</li><li>«Програми» → «Safari» → «Мікрофон» → «Запитувати» (на старіших iOS — одразу «Safari» → «Мікрофон»).</li>', "<li>Open “Settings” on your iPhone.</li><li>“Apps” → “Safari” → “Microphone” → “Ask” (on older iOS, go straight to “Safari” → “Microphone”).</li>") +
      LL('<li>Повністю закрийте цей застосунок і відкрийте знову, торкніться 🎙 — iPhone спитає дозвіл, натисніть «Дозволити».</li>', "<li>Fully close this app, open it again, and tap 🎙 — your iPhone will ask for permission; tap “Allow.”</li>"),
      LL('<li>Chrome → меню ⋮ → «Налаштування» → «Налаштування сайтів» → «Мікрофон».</li><li>Знайдіть цей сайт у списку заблокованих і дозвольте мікрофон.</li>', "<li>Chrome → menu ⋮ → “Settings” → “Site settings” → “Microphone.”</li><li>Find this site in the blocked list and allow the microphone.</li>") +
      LL('<li>Поверніться сюди й торкніться 🎙 — телефон спитає дозвіл, натисніть «Дозволити».</li>', "<li>Come back here and tap 🎙 — your phone will ask for permission; tap “Allow.”</li>")) + '</ol>' +
    LL('<div class="small muted">Поки що можна написати питання нижче.</div><button type="button" class="sm" data-act="askMic">Спробувати ще раз</button></div>', "<div class=\"small muted\">For now, you can type your question below.</div><button type=\"button\" class=\"sm\" data-act=\"askMic\">Try again</button></div>");
  function askChatHtml() {
    const help = ASK.help ? MIC_HELP() : '';
    if (!ASK.chat.length) return help + `<div class="askex">${ASK_EX.map((q) => `<button type="button" class="chip" data-act="askEx" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
    const last = ASK.chat.length - 1;
    return ASK.chat.map((t, k) => `<div class="bub q">${t.img ? `<img class="qimg" src="${t.img.src}${LL(`" alt="фото до питання">`, `" alt="photo for the question">`)}` : ''}${esc(t.q)}</div>` + (t.a
      ? `<div class="bub a">${esc(t.a)}${t.done ? `<div><button type="button" class="sm ghost" data-act="askSay" data-i="${k}${LL(`" aria-label="прослухати відповідь">▶ Прослухати</button></div>`, `" aria-label="play the answer">▶ Listen</button></div>`)}` : ''}</div>`
      : k === last && (ASK.st === 'think' || ASK.st === 'talk') ? '<div class="bub a muted">…</div>' : '')).join('') + help;
  }
  function askDraw() {
    const ch = document.getElementById('askChat'), stEl = document.getElementById('askState'), mic = document.getElementById('askMic');
    if (!ch) return;
    ch.innerHTML = askChatHtml(); ch.scrollTop = ch.scrollHeight;
    stEl.innerHTML = askStateText();
    mic.className = 'mic' + (ASK.st === 'rec' ? ' rec' : ASK.st === 'think' || ASK.st === 'mic' ? ' busy' : '');
    mic.setAttribute('aria-label', ASK.st === 'rec' ? LL('надіслати питання', "send question") : ASK.st === 'talk' ? LL('зупинити відповідь', "stop the answer") : LL('говорити', "speak"));
    const nw = document.getElementById('askNew'); if (nw) nw.hidden = !ASK.chat.length;
    const ph = document.getElementById('askPh');
    if (ph) { ph.hidden = !ASK.photo; ph.innerHTML = ASK.photo ? `<img src="${ASK.photo.src}${LL(`" alt="фото до питання"><button type="button" class="sm ghost" data-act="askPhotoDel" aria-label="прибрати фото">✕ Прибрати</button>`, `" alt="photo for the question"><button type="button" class="sm ghost" data-act="askPhotoDel" aria-label="remove photo">✕ Remove</button>`)}` : ''; }
  }
  function askSheet() {
    openSheet(`${LL(`<div class="sp"><b>Запитати тренера</b><div class="row" style="gap:6px;flex-wrap:nowrap"><button type="button" class="sm ghost" id="askNew" data-act="askNew" hidden>Нова розмова</button><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div></div>
      <div class="chat" id="askChat"></div>
      <div class="askbar"><button type="button" class="mic" id="askMic" data-act="askMic" aria-label="говорити">`, `<div class="sp"><b>Ask the coach</b><div class="row" style="gap:6px;flex-wrap:nowrap"><button type="button" class="sm ghost" id="askNew" data-act="askNew" hidden>New chat</button><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div></div>
      <div class="chat" id="askChat"></div>
      <div class="askbar"><button type="button" class="mic" id="askMic" data-act="askMic" aria-label="speak">`)}${ICON.mic}${LL(`</button><div class="small" id="askState" aria-live="polite"></div></div>
      <div class="askph" id="askPh" hidden></div>
      <div class="row askrow"><button type="button" class="ic" data-act="askPhoto" aria-label="додати фото">`, `</button><div class="small" id="askState" aria-live="polite"></div></div>
      <div class="askph" id="askPh" hidden></div>
      <div class="row askrow"><button type="button" class="ic" data-act="askPhoto" aria-label="add photo">`)}${ICON.cam}${LL(`</button><input id="askFile" type="file" accept="image/*" hidden><input id="askText" type="text" maxlength="600" placeholder="Або напишіть питання" enterkeyhint="send" autocomplete="off"><button type="button" class="sm" data-act="askSend">Надіслати</button></div>`, `</button><input id="askFile" type="file" accept="image/*" hidden><input id="askText" type="text" maxlength="600" placeholder="Or type your question" enterkeyhint="send" autocomplete="off"><button type="button" class="sm" data-act="askSend">Send</button></div>`)}`);  // пояснення про дані — потім окремим посиланням (слово Alexа 23.10), не в чаті
    const fi = document.getElementById('askFile');
    fi.addEventListener('change', () => { const f = fi.files && fi.files[0]; fi.value = ''; if (f) askPhotoLoad(f); });
    const inp = document.getElementById('askText');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); askSend({ text: inp.value }); } });
    askDraw();
  }
  /* фото до питання (з 3.15.0, слово Alexа 23.10: «Так, будуй фото в чаті тренера»): камера чи галерея iPhone → до 1024 px по довшому боку,
     JPEG — Gemini бачить тренажер, табличку чи вправу, а запит легкий для мобільного інтернету. Фото живе лише в цій розмові (памʼять
     застосунку): ні в телефоні, ні на сервері не зберігається; йде разом із питанням до Gemini. */
  const PHOTO_Q = LL('Що на фото і як це стосується моєї програми?', "What’s in this photo, and how does it relate to my program?");
  /* фото → JPEG до 1024 px (за потреби 768) і до 900 тис. знаків base64 — для тренера й для «фото тарілки» */
  async function jpegOf(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const W = img.naturalWidth, H = img.naturalHeight; if (!(W > 0 && H > 0)) throw new Error(LL('розмір', "size"));
      let side = 1024, b64 = '', src = '';
      for (const q of [0.82, 0.65, 0.5]) {
        const k = Math.min(1, side / Math.max(W, H)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        src = c.toDataURL('image/jpeg', q); b64 = src.slice(src.indexOf(',') + 1);
        if (b64.length <= 900000) break;
        side = 768;
      }
      if (!/^\/9j\//.test(b64)) throw new Error(LL('не JPEG', "not a JPEG"));
      return { b64, src };
    } finally { URL.revokeObjectURL(url); }
  }
  async function askPhotoLoad(file) {
    try {
      ASK.photo = await jpegOf(file);
      if (ASK.st === 'err') { ASK.st = 'idle'; ASK.msg = ''; }
    } catch (e) { ASK.photo = null; ASK.st = 'err'; ASK.msg = LL('Не вдалося відкрити фото — спробуйте інше.', "Couldn’t open the photo — try another one."); }
    askDraw();
  }
  /* тиша: зупинити все, що говорить чи грає (і все, що ще в дорозі, — через новий номер дії) */
  function askHush() {
    ASK.gen++;
    PLAY.srcs.forEach((s) => { try { s.stop(); } catch (e) { /* уже */ } }); PLAY.srcs = []; PLAY.t = 0;
    RADIO.duck(false); VOICEPACK.stop(); VOICE.stop();
    if (ASK.st === 'talk') ASK.st = 'idle';
  }
  async function askMic() {
    if (ASK.st === 'rec') return askStop();
    if (ASK.st === 'think' || ASK.st === 'mic') return;
    if (ASK.st === 'talk') { askHush(); return askDraw(); }
    askHush();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') { ASK.st = 'err'; ASK.msg = LL('Тут не вдається записати голос — напишіть питання.', "Voice recording doesn’t work here — type your question."); return askDraw(); }
    ensureAudio(); VOICEPACK.unlock();
    /* стан дозволу — лише щоб підказати «натисніть «Дозволити»»; сам запит мікрофона — завжди (лише він показує віконце iPhone),
       прості кроки «як дозволити» — тільки після справжньої відмови */
    let perm = '';
    try { if (navigator.permissions && navigator.permissions.query) perm = (await navigator.permissions.query({ name: 'microphone' })).state; } catch (e) { perm = ''; }
    ASK.mic = true; audioMode();  // iOS: «запис і відтворення» ДО запиту мікрофона — інакше відмова без віконця
    if (perm !== 'granted') { ASK.st = 'mic'; askDraw(); }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) {
      ASK.mic = false; audioMode();
      const n = e && e.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') { ASK.help = true; ASK.st = 'err'; ASK.msg = LL('Немає дозволу на мікрофон.', "No microphone permission."); }
      else { ASK.st = 'err'; ASK.msg = n === 'NotReadableError' || n === 'AbortError' ? LL('Мікрофон зайнятий (дзвінок чи інша програма) — спробуйте ще раз.', "The microphone is busy (a call or another app) — try again.") : n === 'NotFoundError' ? LL('Мікрофон не знайдено — напишіть питання.', "No microphone found — type your question.") : LL('Не вдалося увімкнути мікрофон — спробуйте ще раз або напишіть питання.', "Couldn’t turn on the microphone — try again or type your question."); }
      return askDraw();
    }
    ASK.help = false;
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    let mr;
    try { mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch (e) { stream.getTracks().forEach((t) => t.stop()); ASK.mic = false; audioMode(); ASK.st = 'err'; ASK.msg = LL('Тут не вдається записати голос — напишіть питання.', "Voice recording doesn’t work here — type your question."); return askDraw(); }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    ASK.rec = { mr, stream, chunks, type: mr.mimeType || type };
    RADIO.hush(true);
    mr.start(); ASK.st = 'rec'; ASK.msg = ''; ASK.t0 = Date.now();
    ASK.tick = setInterval(() => { if (Date.now() - ASK.t0 >= 30000) askStop(); else askDraw(); }, 500);
    liveOpen().catch(() => {});  // поки людина говорить — розмова з Gemini Live уже налаштовується (≈ 1,5 с)
    askDraw();
  }
  /* зупинити запис; send — повернути запис (інакше — просто викинути) */
  async function askEnd(send) {
    const r = ASK.rec; if (!r) return null; ASK.rec = null; clearInterval(ASK.tick);
    const done = new Promise((ok) => { r.mr.onstop = ok; setTimeout(ok, 1500); });
    try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) { /* уже */ }
    await done; r.stream.getTracks().forEach((t) => t.stop()); ASK.mic = false; audioMode(); RADIO.hush(false);
    return send ? new Blob(r.chunks, { type: r.type || 'audio/mp4' }) : null;
  }
  function askCancel() { askEnd(false); ASK.st = 'idle'; }
  async function askStop() {
    const g = ASK.gen;
    ASK.st = 'think'; askDraw();
    const blob = await askEnd(true);
    let wav = null;
    try { wav = blob && blob.size ? await toWav16k(await blob.arrayBuffer()) : null; } catch (e) { wav = null; }
    if (g !== ASK.gen) return;
    if (!wav) { ASK.st = 'err'; ASK.msg = LL('Не почув — скажіть ще раз, ближче до телефону.', "Didn’t catch that — say it again, closer to the phone."); return askDraw(); }
    const j = await post('/hear', { audio: wav, lang: I18N.lang }, 8000);
    if (g !== ASK.gen) return;
    if (!j || !j.q) { ASK.st = 'err'; ASK.msg = askErr(j); return askDraw(); }
    askTurn(j.q);
  }
  /* запис → WAV 16 кГц моно (так його найкраще чує розпізнавання), base64; тиша чи коротше 0,4 с — null */
  async function toWav16k(buf) {
    ensureAudio();
    const src = await new Promise((ok, bad) => { const pr = audio.decodeAudioData(buf.slice(0), ok, bad); if (pr && pr.then) pr.then(ok, bad); });
    if (src.duration < 0.4) return null;
    const n = Math.ceil(src.duration * 16000), Off = window.OfflineAudioContext || window.webkitOfflineAudioContext, off = new Off(1, n, 16000), s = off.createBufferSource();
    s.buffer = src; s.connect(off.destination); s.start(0);
    const x = (await off.startRendering()).getChannelData(0);
    let peak = 0; for (let k = 0; k < x.length; k++) { const v = Math.abs(x[k]); if (v > peak) peak = v; }
    if (peak < 0.02) return null;
    const g = Math.min(4, 0.9 / peak), dv = new DataView(new ArrayBuffer(44 + x.length * 2)), w = (o, t) => { for (let k = 0; k < t.length; k++) dv.setUint8(o + k, t.charCodeAt(k)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, x.length * 2, true);
    for (let k = 0; k < x.length; k++) dv.setInt16(44 + k * 2, Math.max(-32768, Math.min(32767, Math.round(x[k] * g * 32767))), true);
    const u = new Uint8Array(dv.buffer); let bin = '';
    for (let k = 0; k < u.length; k += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
    return btoa(bin);
  }
  function askSend(o) {
    const q = String(o.text || '').trim().slice(0, 600) || (ASK.photo ? PHOTO_Q : '');  // лише фото — тренер каже, що на ньому
    if (!q || ASK.st === 'think' || ASK.st === 'rec' || ASK.st === 'mic') return;
    ensureAudio(); VOICEPACK.unlock();
    const inp = document.getElementById('askText'); if (inp) inp.value = '';
    askTurn(q);
  }
  async function post(path, body, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
    try {
      const r = await fetch(COACH_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      return await r.json().catch(() => ({}));
    } catch (e) { return null; } finally { clearTimeout(to); }
  }
  function askErr(j) {
    if (!j) return navigator.onLine === false ? LL('Немає інтернету — тренер відповідає лише онлайн.', "No internet — the coach only answers online.") : LL('Тренер не відповів — спробуйте ще раз.', "The coach didn’t answer — try again.");
    return ({ empty: LL('Не почув питання — скажіть ще раз.', "Didn’t catch the question — say it again."), busy: LL('Тренер зараз зайнятий — спробуйте за хвилину.', "The coach is busy right now — try again in a minute."), big: LL('Запис задовгий — до 30 секунд.', "Recording too long — 30 seconds max.") })[j.error] || LL('Тренер не відповів — спробуйте ще раз.', "The coach didn’t answer — try again.");
  }
  /* Одне питання. Головний шлях — Gemini Live: голос тренера йде потоком. Немає звуку за 5 с (слово Alexа 23.10: «має бути 5 сек») —
     запасний шлях: текстова відповідь сервера (кожна модель — до 5 с) і голос телефона. */
  async function askTurn(q) {
    askHush();
    /* попередня відповідь ще йшла — її обриваємо (текст лишається з «…» і кнопкою «Прослухати»), нова розмова з Live, щоб шматки не змішались */
    if (LIVE.turn) { const pt = LIVE.turn.t; if (pt) { pt.a = String(pt.a).replace(/\s+/g, ' ').trim() + (pt.a ? ' …' : ''); pt.done = !!pt.a; } liveClose(); }
    const g = ASK.gen, t = { q, a: '', pcm: [], done: false, heard: false, img: ASK.photo || null };
    ASK.photo = null;
    ASK.chat.push(t); ASK.st = 'think'; ASK.msg = ''; ASK.help = false; askDraw();
    let ok = false;
    try { ok = await liveTurn(t, g); } catch (e) { ok = false; }
    if (ok || g !== ASK.gen) return;
    liveClose(); t.a = ''; t.pcm = [];
    const prog = G();
    const j = await post('/ask', { text: q, lang: I18N.lang, image: t.img ? t.img.b64 : undefined, sex: prog.sex === 'f' ? 'f' : 'm', pack: packId(), ids: coachIds(), program: coachProgram(), history: ASK.chat.slice(0, -1).slice(-6).filter((x) => x.a).map((x) => ({ q: qText(x), a: x.a })) }, 32000);
    if (g !== ASK.gen) return;
    if (!j || !j.a) { ASK.chat.splice(ASK.chat.indexOf(t), 1); if (t.img && !ASK.photo) ASK.photo = t.img; ASK.st = 'err'; ASK.msg = askErr(j); return askDraw(); }
    t.a = j.a; t.done = true; ASK.st = 'idle'; askDraw();
    if (!S().voice.on) return;
    ASK.st = 'talk'; ASK.i = ASK.chat.indexOf(t); askDraw();
    sysSay(sp(t.a), LL('відповідь тренера — системним голосом (запасний шлях)', "coach reply — system voice (fallback)")); askWaitQuiet(ASK.i, g);
  }
  /* питання в історії розмови — текстом; фото раніших питань не пересилаємо (відповідь тренера вже каже, що на ньому) */
  const qText = (x) => x.q + (x.img ? LL(' (до питання було фото)', " (a photo was attached to the question)") : '');
  /* ---------- Gemini Live: одноразовий токен із сервера, голос — потоком ---------- */
  function liveOpen() {
    if (LIVE.ready) return LIVE.ready;
    const p = (async () => {
      const prog = G(), j = await post('/live', { sex: prog.sex === 'f' ? 'f' : 'm', pack: packId(), ids: coachIds(), lang: I18N.lang }, 5000);
      if (!j || !j.token) throw new Error(LL('немає токена', "no token"));
      return new Promise((ok, no) => {
        const ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(j.token));
        const to = setTimeout(() => { no(new Error(LL('налаштування', "setup"))); try { ws.close(); } catch (e) { /* уже */ } }, 8000);
        LIVE.ws = ws; LIVE.prog = '';
        ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/' + j.model } }));
        ws.onmessage = async (ev) => {
          let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch (e) { return; }
          if (m.setupComplete) { clearTimeout(to); return ok(ws); }
          const sc = m.serverContent, tr = LIVE.turn; if (!sc || !tr || LIVE.ws !== ws) return;
          ((sc.modelTurn || {}).parts || []).forEach((x) => { if (x.inlineData && x.inlineData.data) tr.audio(x.inlineData.data); });
          if (sc.outputTranscription && sc.outputTranscription.text) tr.text(sc.outputTranscription.text);
          if (sc.turnComplete) tr.done();
        };
        ws.onclose = () => {
          clearTimeout(to); no(new Error(LL('закрито', "closed")));
          if (LIVE.ws === ws) { const tr = LIVE.turn; LIVE.ws = null; LIVE.ready = null; LIVE.turn = null; if (tr) tr.fail(); }
        };
      });
    })();
    LIVE.ready = p;
    p.catch(() => { if (LIVE.ready === p) { LIVE.ready = null; LIVE.ws = null; } });
    return p;
  }
  function liveClose() { const ws = LIVE.ws; LIVE.ws = null; LIVE.ready = null; LIVE.turn = null; if (ws) try { ws.close(); } catch (e) { /* уже */ } }
  /* true — тренер заговорив (звук прийшов за 5 с); false — ні: тоді запасний шлях */
  function liveTurn(t, g) {
    return new Promise((resolve) => {
      let settled = false, got = false;
      const fin = (v) => { if (!settled) { settled = true; resolve(v); } };
      const wait = setTimeout(() => { if (!got) { if (LIVE.turn && LIVE.turn.t === t) LIVE.turn = null; fin(false); } }, 5000);
      Promise.race([liveOpen(), new Promise((no, bad) => setTimeout(() => bad(new Error(LL('5 с', "5 sec"))), 5000))]).then((ws) => {
        if (settled || g !== ASK.gen) return fin(false);
        const turns = [], prog = coachProgram();
        /* програма — у першому питанні розмови й щоразу, як змінилась (зроблені підходи, інший тиждень) */
        if (prog !== LIVE.prog) {
          turns.push({ role: 'user', parts: [{ text: LL('МОЯ ПРОГРАМА ЗАРАЗ (найвищий пріоритет):\n', "MY CURRENT PROGRAM (top priority):\n") + prog }] }, { role: 'model', parts: [{ text: LL('Бачу твою програму. Відповідаю за нею.', "Got your program. I’ll answer based on it.") }] });
          if (!LIVE.prog) ASK.chat.slice(0, -1).slice(-6).forEach((x) => { if (x.a) turns.push({ role: 'user', parts: [{ text: qText(x) }] }, { role: 'model', parts: [{ text: x.a }] }); });
          LIVE.prog = prog;
        }
        /* фото — частиною питання (inlineData у clientContent; кадр realtimeInput.video Live не бачить — стенд tools/photo_test.mjs 23.10) */
        turns.push({ role: 'user', parts: (t.img ? [{ inlineData: { mimeType: 'image/jpeg', data: t.img.b64 } }] : []).concat([{ text: t.q }]) });
        const k = () => ASK.chat.indexOf(t);
        LIVE.turn = {
          t,
          audio(b64) {
            t.pcm.push(b64);
            if (!got) { got = true; clearTimeout(wait); if (g === ASK.gen) { ASK.st = 'talk'; ASK.i = k(); askDraw(); } fin(true); }
            if (g === ASK.gen && livePlay(b64)) t.heard = true;
          },
          text(s) { t.a += s; if (g === ASK.gen) askDraw(); },
          done() { clearTimeout(wait); LIVE.turn = null; t.a = String(t.a).replace(/\s+/g, ' ').trim(); t.done = true; askDraw(); if (got) liveEnded(k(), g); else fin(false); },
          fail() { clearTimeout(wait); LIVE.turn = null; t.done = !!t.a; askDraw(); if (got) liveEnded(k(), g); else fin(false); }
        };
        try { ws.send(JSON.stringify({ clientContent: { turns, turnComplete: true } })); } catch (e) { LIVE.turn.fail(); }
      }, () => { clearTimeout(wait); fin(false); });
    });
  }
  /* потоковий звук: шматки PCM 24 кГц стають у чергу Web Audio один за одним; true — шматок поставлено */
  function livePlay(b64) {
    if (!S().voice.on || !audio || audio.state !== 'running') return false;
    const bin = atob(b64), n = bin.length >> 1; if (!n) return false;
    const buf = audio.createBuffer(1, n, 24000), d = buf.getChannelData(0);
    for (let k = 0; k < n; k++) { const v = bin.charCodeAt(2 * k) | (bin.charCodeAt(2 * k + 1) << 8); d[k] = (v > 32767 ? v - 65536 : v) / 32768; }
    const s = audio.createBufferSource(); s.buffer = buf; s.connect(audio.destination);
    const now = audio.currentTime; if (PLAY.t < now + 0.03) PLAY.t = now + 0.06;
    s.start(PLAY.t); PLAY.t += buf.duration; PLAY.srcs.push(s);
    s.onended = () => { PLAY.srcs = PLAY.srcs.filter((x) => x !== s); };
    RADIO.duck(true);
    return true;
  }
  /* відповідь прийшла вся: дочекатися, доки дограє; не грало зовсім (Web Audio приспано) — програти цілим записом. Лише якщо це досі поточна дія. */
  function liveEnded(k, g) {
    if (g !== ASK.gen) return;
    const t = ASK.chat[k];
    if (t && S().voice.on && !t.heard) return askSpeak(k, true);
    /* запобіжник: iPhone може приспати звук посеред відповіді — тоді «говорю» не висить вічно (поки воно є, фрази тренера тренування мовчать) */
    const until = Date.now() + 90000;
    const w = setInterval(() => {
      if (g !== ASK.gen) return clearInterval(w);
      if (!PLAY.srcs.length || !audio || audio.currentTime >= PLAY.t - 0.02 || Date.now() > until) { clearInterval(w); PLAY.t = 0; RADIO.duck(false); ASK.st = 'idle'; askDraw(); }
    }, 250);
  }
  function askWaitQuiet(k, g) { const until = Date.now() + 90000; const w = setInterval(() => { if (g !== ASK.gen || ASK.st !== 'talk') return clearInterval(w); if (!speaking() || Date.now() > until) { clearInterval(w); ASK.st = 'idle'; askDraw(); } }, 300); }
  function pcmWav(chunks) {
    const parts = chunks.map((b) => { const s = atob(b), u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u; });
    const n = parts.reduce((a, u) => a + u.length, 0), out = new Uint8Array(44 + n), dv = new DataView(out.buffer), w = (o, x) => { for (let k = 0; k < x.length; k++) dv.setUint8(o + k, x.charCodeAt(k)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 24000, true); dv.setUint32(28, 48000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n, true);
    let o = 44; parts.forEach((u) => { out.set(u, o); o += u.length; });
    return out.buffer;
  }
  /* «▶ Прослухати»: голос цієї ж відповіді; відповідь запасного шляху — голосом тренера з сервера, не вийшло — голосом телефона */
  async function askSpeak(k, force) {
    const t = ASK.chat[k]; if (!t || !t.a || (!force && !S().voice.on)) return;
    askHush(); ensureAudio();
    const g = ASK.gen;
    ASK.st = 'talk'; ASK.i = k; askDraw();
    if (!t.wav && t.pcm && t.pcm.length) t.wav = pcmWav(t.pcm);
    if (!t.wav && packId()) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
      try { const r = await fetch(COACH_URL + '/say', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: I18N.lang, text: sp(t.a), pack: packId() }), signal: ctl ? ctl.signal : undefined }); if (r.ok) t.wav = await r.arrayBuffer(); } catch (e) { /* голос телефона */ }
      clearTimeout(to);
    }
    if (g !== ASK.gen) return;  // поки чекали — людина зробила іншу дію: мовчимо
    if (t.wav && (await VOICEPACK.playData(t.wav, 'audio/wav', audio))) return askWaitQuiet(k, g);
    if (g !== ASK.gen) return;
    sysSay(sp(t.a), LL('відповідь тренера — системним голосом', "coach reply — system voice")); askWaitQuiet(k, g);
  }
  /* ---------- Нагадування про тренування й значок на іконці (з 3.13.0) ----------
     Сповіщення приходить у дні тренувань в обраний час (сервер `kason-gym-coach`, Web Push; розклад — кожні 5 хв), якщо сьогодні ще
     не тренувались. Значок «1» на іконці — поки сьогоднішнє тренування за планом не почато. На iPhone — лише застосунок з іконки
     (iOS 16.4+), дозвіл — один раз «Дозволити». Підписки iPhone іноді злітають — на кожному запуску тихо поновлюємо (remindSync). */
  const VAPID_PUBLIC = 'BKnsTFnbMRHmlcsz7_rGnaOUMspG72jcNeLL0auLEYadR9aQKqxoozL27zWTr-AG_ZyvEMG0T-azWrBCk7JS4Cc';
  const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const trainDays = () => { const p = P(), prog = G(); return (p.days && p.days.length ? p.days : prog.days) || []; };
  const dayNames = (ds) => ds.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => [LL('нд', "Sun"), LL('пн', "Mon"), LL('вт', "Tue"), LL('ср', "Wed"), LL('чт', "Thu"), LL('пт', "Fri"), LL('сб', "Sat")][d]).join(' / ');
  function vapidKey() { const s = atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((VAPID_PUBLIC.length + 3) % 4)), u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u; }
  /* сьогодні вже тренувались або тренування почато (чернетка сьогоднішня) — значок і нагадування більше не потрібні */
  const trainedToday = () => { const p = P(); return !!p && (p.sessions.some((s) => s.date === today()) || !!(p.draft && p.draft.date === today())); };
  /* значок: сьогодні день тренування й ще не почали — «1», інакше — прибрати (слово Alexа 23.10: крапка має зникати, коли запускаю тренування) */
  function badgeSync() {
    try {
      if (!('setAppBadge' in navigator) || !P()) return;
      /* значок — частина нагадувань (до 3.16.1 горів у кожен день тренувань і без нагадувань — слово Alexа 23.10: «червона крапочка
         горить постійно, хоча повідомлень не було»): лише коли нагадування ввімкнені й дозволені, у день тренувань після часу нагадування,
         поки сьогодні не почали тренування; інакше — знімаємо */
      const r = S().remind || {}, now = new Date(), hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
      const on = !!r.on && typeof Notification !== 'undefined' && Notification.permission === 'granted';
      const todo = on && trainDays().indexOf(now.getDay()) >= 0 && hm >= (r.time || '18:00') && !trainedToday();
      (todo ? navigator.setAppBadge(1) : navigator.clearAppBadge()).catch(() => {});
    } catch (e) { /* немає */ }
  }
  /* надіслати серверу підписку й розклад (дні, час, часовий пояс, наступне тренування, чи вже тренувались) */
  async function remindSync(test) {
    const r = S().remind || {}, kw = P() ? kit().set : {};
    if (!(r.on || kw.water) || !pushOk() || Notification.permission !== 'granted') return false;  // з 3.20.0 — ще й вода
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() });  // злетіла — поновити
      const p = P(), prog = G(), plan = ENGINE.planFor(prog, nextN()), wo = prog.workouts[plan.workout];
      const body = { sub: sub.toJSON(), on: true, lang: I18N.lang, days: trainDays(), time: r.time || '18:00', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv',
        next: wo ? wo.title + ' · ' + plural(wo.items.length, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises")) : '', done: trainedToday() ? today() : '', test: !!test };
      body.on = !!r.on;
      /* вода (з 3.20.0): розклад на день тренування й на звичайний, склянка, випите сьогодні — сервер пропускає склянки, які вже відмічено */
      const sx = ksex(), mk = (tr) => KITCHEN.waterTimes(kw.wake, kw.bed, KITCHEN.waterTarget(sx, tr), kw.glass, tr && r.on ? (r.time || '18:00') : null);
      body.water = kw.water ? { on: true, glass: kw.glass, rest: mk(false), train: mk(true), done: { date: kWaterDay(), ml: kday(kWaterDay()).water || 0 }, wake: kw.wake, cross: kWaterCross() } : { on: false };  // день води — від підйому (нічна зміна)
      const res = await fetch(COACH_URL + '/push/sub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return res.ok;
    } catch (e) { return false; }
  }
  /* увімкнути — лише з дотику: iPhone питає дозвіл тільки у відповідь на натискання */
  async function remindOn() {
    if (!pushOk()) return rMore();
    let perm = Notification.permission;
    if (perm !== 'granted') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
    if (perm !== 'granted') return rMore();
    S().remind = { on: true, time: (S().remind && S().remind.time) || '18:00' }; save();
    const ok = await remindSync(true);
    if (!ok) { S().remind.on = false; save(); }
    toast(ok ? LL('Нагадування увімкнено — пробне вже летить', "Reminders on — a test one is on its way") : LL('Не вдалося увімкнути — перевірте інтернет і спробуйте ще раз', "Couldn’t turn them on — check your internet and try again"));
    badgeSync(); rMore();
  }
  async function remindOff() {
    S().remind = Object.assign({}, S().remind, { on: false }); save(); badgeSync();  // без нагадувань — без значка
    /* вода ще нагадує (з 3.20.0) — підписку лишаємо, сервер лише вимикає тренування; до виправлення 23.10 вода тихо замовкала */
    if (P() && kit().set.water) { await remindSync(false); try { if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (e) { /* немає */ } toast(LL('Нагадування про тренування вимкнено (про воду — лишились)', 'Workout reminders off (water reminders stay on)')); return rMore(); }
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (sub) { await fetch(COACH_URL + '/push/unsub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
    } catch (e) { /* немає */ }
    try { if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (e) { /* немає */ }
    toast(LL('Нагадування вимкнено', "Reminders off")); rMore();
  }
  function remindCard() {
    const r = S().remind || {}, ds = trainDays(), standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    let body;
    /* значок «1» на іконці — лише iPhone (iOS 16.4+, застосунок з іконки); Chrome на Android значків-цифр не вміє (MDN, setAppBadge) */
    if (!pushOk()) body = `<p class="small muted">${TX(standalone ? LL('Нагадуванням потрібен iOS 16.4 або новіший.', "Reminders need iOS 16.4 or later.") : LL('Нагадування працюють, коли застосунок відкрито з іконки на початковому екрані (Safari → «Поділитися» → «На початковий екран»).', "Reminders work when the app is opened from its Home Screen icon (Safari → “Share” → “Add to Home Screen”)."), LL('Цей браузер не вміє нагадувань — відкрийте застосунок у Chrome.', "This browser doesn’t support reminders — open the app in Chrome."))}</p>`;
    else if (Notification.permission === 'denied') body = LL('<div class="note w small"><b>Сповіщення заборонено.</b> Увімкнути: ', "<div class=\"note w small\"><b>Notifications are blocked.</b> To turn them on: ") + TX(LL('«Параметри» iPhone → «Сповіщення» → «Тренування» → «Дозволити сповіщення».', "iPhone “Settings” → “Notifications” → “Workouts” → “Allow Notifications”."), LL('«Налаштування» Android → «Додатки» → «Тренування» (або Chrome, якщо відкриваєте в браузері) → «Сповіщення» → увімкнути.', "Android “Settings” → “Apps” → “Workouts” (or Chrome, if you use it in the browser) → “Notifications” → turn on.")) + '</div>';
    else if (r.on) body = `${LL(`<p class="small"><b>✓ Увімкнено</b> · `, `<p class="small"><b>✓ On</b> · `)}${ds.length ? dayNames(ds) : LL('дні тренувань', "workout days")}${LL(`, якщо ще не тренувались.`, `, if you haven’t worked out yet.`)}${TX(LL(' Значок «1» на іконці — поки сьогодні не почали тренування.', " A “1” badge on the app icon until you start today’s workout."), '')}${LL(`</p>
      <label class="f" for="remindTime">Час нагадування</label><input type="time" id="remindTime" value="`, `</p>
      <label class="f" for="remindTime">Reminder time</label><input type="time" id="remindTime" value="`)}${esc(r.time || '18:00')}${LL(`" step="300">
      <div class="row" style="gap:8px;margin-top:10px"><button type="button" class="sm" data-act="remindTest">Надіслати пробне</button><button type="button" class="sm ghost" data-act="remindOff">Вимкнути</button></div>`, `" step="300">
      <div class="row" style="gap:8px;margin-top:10px"><button type="button" class="sm" data-act="remindTest">Send a test</button><button type="button" class="sm ghost" data-act="remindOff">Turn off</button></div>`)}`;
    else body = `${LL(`<p class="small muted">Сповіщення в дні тренувань (`, `<p class="small muted">Notifications on workout days (`)}${ds.length ? dayNames(ds) : LL('за планом', "per your plan")}${LL(`) в обраний час`, `) at the time you choose`)}${TX(LL(' і значок «1» на іконці', " and a “1” badge on the app icon"), '')}${LL(`, поки сьогодні не почали тренування. `, `, until you start today’s workout. `)}${TX('iPhone', LL('Телефон', "Your phone"))}${LL(` один раз спитає дозвіл — натисніть «Дозволити».</p>
      <button type="button" class="pri wide" data-act="remindOn">Увімкнути нагадування</button>`, ` will ask for permission once — tap “Allow”.</p>
      <button type="button" class="pri wide" data-act="remindOn">Turn on reminders</button>`)}`;
    return `${LL(`<h2>Нагадування</h2><div class="card">`, `<h2>Reminders</h2><div class="card">`)}${body}</div>`;
  }
  function radioSheet() {
    const cur = RADIO.cur, st = RADIO.state, R = S().radio;
    const groups = []; RADIO.STATIONS.forEach((x) => { let g = groups.find((y) => y.g === x.g); if (!g) { g = { g: x.g, list: [] }; groups.push(g); } g.list.push(x); });
    const stTxt = { off: LL('вимкнено', "off"), loading: LL('підключаюся…', "connecting…"), playing: LL('грає', "playing"), paused: LL('пауза', "paused"), error: LL('станція не відповідає — оберіть іншу', "station not responding — pick another one") }[st] || '';
    openSheet(`${LL(`<div class="sp"><b>Радіо для тренувань</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      `, `<div class="sp"><b>Workout radio</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      `)}${cur ? `<div class="card rnow"><div class="sp"><div><b>${esc(cur.name)}</b><div class="small muted">${esc(cur.genre)} · ${stTxt}</div></div>
        <div class="row" style="flex-wrap:nowrap">${st === 'playing' || st === 'loading' ? LL('<button type="button" class="ic" data-act="rpause" aria-label="пауза">⏸</button>', "<button type=\"button\" class=\"ic\" data-act=\"rpause\" aria-label=\"pause\">⏸</button>") : LL('<button type="button" class="ic" data-act="rresume" aria-label="грати">▶</button>', "<button type=\"button\" class=\"ic\" data-act=\"rresume\" aria-label=\"play\">▶</button>")}${LL(`<button type="button" class="ic" data-act="rstop" aria-label="вимкнути">✕</button></div></div></div>`, `<button type="button" class="ic" data-act="rstop" aria-label="turn off">✕</button></div></div></div>`)}` : ''}
      ${groups.map((g) => `<h3 class="rg">${esc(g.g)}</h3><div class="rlist">${g.list.map((x) => `<button type="button" class="rst${cur && cur.id === x.id ? ' on' : ''}" data-act="rplay" data-id="${x.id}"><b>${esc(x.name)}</b><span class="small muted">${esc(x.genre)}</span></button>`).join('')}</div>`).join('')}
      ${RADIO.routed === false ? LL('<div class="note small">На цьому телефоні браузер не дає змінювати гучність радіо', "<div class=\"note small\">On this phone, the browser doesn’t let the app change the radio volume") + TX(LL(' (вада Safari)', " (a Safari bug)"), '') + LL(' — поки говорить тренер, музика на мить вимикається і одразу повертається.</div>', " — while the coach is talking, the music cuts out for a moment and comes right back.</div>") : ''}${LL(`
      <label class="f">Коли говорить тренер, радіо тихіше на</label>
      <div class="seg">`, `
      <label class="f">When the coach talks, lower the radio by</label>
      <div class="seg">`)}${[[0.7, '30 %'], [0.5, '50 %'], [0.3, '70 %']].map(([v, l]) => `<button type="button" class="${R.duck === v ? 'on' : ''}" data-act="rduck" data-v="${v}">${l}</button>`).join('')}${LL(`</div>
      <p class="tiny muted">Притишення плавне, звук повертається, щойно тренер замовк. Що радять науковці: улюблена енергійна музика зі швидким темпом (120+ ударів на хвилину) покращує настрій і трохи — результат, а втома відчувається менше. Найкраще працює та, яку обираєте самі, — тому можна вмикати й свою з іншого застосунку. Радіо потребує інтернету.</p>`, `</div>
      <p class="tiny muted">The volume dips smoothly and comes back as soon as the coach stops talking. What research says: upbeat music you love with a fast tempo (120+ beats per minute) lifts your mood, slightly improves performance, and makes fatigue feel lighter. Music you pick yourself works best — so you can also play your own from another app. The radio needs an internet connection.</p>`)}`);
  }
  const rbar = document.getElementById('rbar');
  /* Радіо в шапці тренування: назва, пауза / грати, стоп — завжди на виду. */
  function radioRow() {
    const st = RADIO.state, cur = RADIO.cur, on = st === 'playing' || st === 'loading';
    if (!cur || st === 'off') return '';
    return `<button type="button" class="rbt" data-act="radio"><span class="rdot2${on ? ' p' : ''}"></span><b>${esc(cur.name)}</b><span class="small muted">${st === 'error' ? LL('не відповідає', "not responding") : st === 'loading' ? LL('підключаюся…', "connecting…") : st === 'paused' ? LL('пауза', "paused") : esc(cur.genre)}</span></button>
      ${on ? LL('<button type="button" class="ic" data-act="rpause" aria-label="пауза">⏸</button>', "<button type=\"button\" class=\"ic\" data-act=\"rpause\" aria-label=\"pause\">⏸</button>") : LL('<button type="button" class="ic" data-act="rresume" aria-label="грати">▶</button>', "<button type=\"button\" class=\"ic\" data-act=\"rresume\" aria-label=\"play\">▶</button>")}${LL(`<button type="button" class="ic" data-act="rstop" aria-label="вимкнути радіо">■</button>`, `<button type="button" class="ic" data-act="rstop" aria-label="turn off radio">■</button>`)}`;
  }
  function updateRadio() {
    const st = RADIO.state, cur = RADIO.cur, on = st === 'playing' || st === 'loading';
    const wr = document.getElementById('wRadio'), row = radioRow(); if (wr && wr.dataset.h !== row) { wr.innerHTML = row; wr.dataset.h = row; }
    document.querySelectorAll('[data-act="radio"]').forEach((b) => b.classList.toggle('rad', on));
    const show = cur && st !== 'off' && view !== 'workout' && view !== 'onboard' && view !== 'summary';
    rbar.className = show ? 'on' : '';
    if (show) rbar.dataset.h = rbar.innerHTML = `<button type="button" class="rbt" data-r="open"><span class="rdot2${on ? ' p' : ''}"></span><b>${esc(cur.name)}</b><span class="small muted">${st === 'error' ? LL('не відповідає', "not responding") : st === 'loading' ? LL('підключаюся…', "connecting…") : st === 'paused' ? LL('пауза', "paused") : esc(cur.genre)}</span></button>
      ${on ? LL('<button type="button" class="ic" data-r="pause" aria-label="пауза">⏸</button>', "<button type=\"button\" class=\"ic\" data-r=\"pause\" aria-label=\"pause\">⏸</button>") : LL('<button type="button" class="ic" data-r="resume" aria-label="грати">▶</button>', "<button type=\"button\" class=\"ic\" data-r=\"resume\" aria-label=\"play\">▶</button>")}${LL(`<button type="button" class="ic" data-r="stop" aria-label="вимкнути">✕</button>`, `<button type="button" class="ic" data-r="stop" aria-label="turn off">✕</button>`)}`;
    if (document.body.classList.contains('sheet') && document.querySelector('#sheet .rlist')) radioSheet();
  }
  RADIO.on(updateRadio);
  rbar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'open') return radioSheet();
    if (b.dataset.r === 'pause') RADIO.pause(); else if (b.dataset.r === 'resume') { ensureAudio(); RADIO.resume(); } else RADIO.stop();
  });
  /* Поки говорить тренер: де браузер пускає радіо через Web Audio — плавно притишуємо (RADIO.duck),
     де ні (Safari на iPhone) — радіо вимикається на час фрази й одразу повертається. Системний голос — завжди без музики. */
  let sysTalk = false, packTalk = false;
  VOICE.onSpeaking((on) => { sysTalk = on; RADIO.hush(on); RADIO.duck(sysTalk || packTalk); });
  VOICEPACK.onSpeaking((on) => { packTalk = on; RADIO.duck(sysTalk || packTalk); });

  /* ---------- головна ---------- */
  function nextDayText(days) {
    if (!days || !days.length) return '';
    const now = new Date();
    for (let k = 0; k < 8; k++) { const d = new Date(now); d.setDate(now.getDate() + k); if (days.indexOf(d.getDay()) >= 0) return k === 0 ? LL('сьогодні', "today") : k === 1 ? LL('завтра', "tomorrow") : LL('у ', "on ") + DAYS_FULL[d.getDay()]; }
    return '';
  }
  /* головна: кухня сьогодні й вода з наступним нагадуванням (слово Alexа 23.10: «на головній було нагадування про воду») */
  function kHomeCard() {
    const k = kit(), day = kday(today()), sx = ksex(), N = kNorm(), t = KITCHEN.dayTotals(day, sx, kctx()), wd = kWaterDay(), wday = kday(wd);
    const wT = KITCHEN.waterTarget(sx, kTrain(wd)), now = pad(new Date().getHours()) + ':' + pad(new Date().getMinutes());
    const rel = (t) => { const [h, m] = t.split(':').map(Number), [wh, wm] = k.set.wake.split(':').map(Number); return (h * 60 + m - wh * 60 - wm + 1440) % 1440; };  // від підйому — і для нічної зміни
    const next = k.set.water ? kWaterTimes(wd).find((x) => rel(x.t) > rel(now)) : null, left = Math.max(0, wT - (wday.water || 0));
    return `<div class="card"><div class="sp"><b>${LL('Кухня сьогодні', 'Kitchen today')}</b><button type="button" class="sm" data-act="goKitchen">${LL('Відкрити', 'Open')}</button></div>
      <div class="grid2"><div class="stat"><b>${t.kcal}</b><span>${N.nu ? LL('ккал з ', 'kcal of ') + N.nu.kLo + '–' + N.nu.kHi : LL('ккал', 'kcal')}</span></div><div class="stat"><b>${fmt(t.p)}</b><span>${N.nu ? LL('г білка з ', 'g protein of ') + N.nu.pLo : LL('г білка', 'g protein')}</span></div></div>
      <div class="sp" style="margin-top:10px"><span class="small">${LL('Вода: ', 'Water: ')}<b>${fmt((wday.water || 0) / 1000)}</b>${LL(' з ', ' of ')}${fmt(wT / 1000)}${LL(' л', ' L')}${left > 0 && next ? LL(' · наступна склянка о ', ' · next glass at ') + next.t : ''}</span>
        <button type="button" class="sm pri" data-act="kWaterHome">+ ${k.set.glass}${LL(' мл', ' ml')}</button></div>
      ${k.set.water || !pushOk() ? '' : `<button type="button" class="sm ghost wide" data-act="kWaterRemind">${LL('Нагадувати пити воду', 'Remind me to drink water')}</button>`}</div>`;
  }
  function dailyCard() {
    const p = P(), prog = G(), t = today(), rec = p.daily[t] || {};
    const wk = ENGINE.planFor(prog, Math.max(0, nextN() - 1)).week;
    /* «Виконано» — кнопка замість галочки (слово Alexа 23.10: з галочками незрозуміло, чи треба натискати й чи це зарахується);
       ще раз — скасувати; відмітка лише на сьогодні, такі дні зеленіють у «План» → «Історія» */
    const isDone = (it) => (it.jumps ? (rec.jumps || 0) >= prog.jumpsFor(wk).times : !!rec[it.id]);
    const nDone = prog.daily.filter(isDone).length;
    return `${LL(`<div class="sp"><h2>Щодня</h2><span class="small muted">зроблено `, `<div class="sp"><h2>Daily</h2><span class="small muted">done `)}${nDone}${LL(` з `, ` of `)}${prog.daily.length}</span></div><div class="card dly">${prog.daily.map((it) => {
      if (it.jumps) {
        const j = prog.jumpsFor(wk), done = rec.jumps || 0;
        return `<div class="chk" style="flex-wrap:wrap"><div style="flex:1 1 100%"><b>${esc(it.label)}${LL(`</b><div class="tiny muted">Тиждень `, `</b><div class="tiny muted">Week `)}${wk}: ${j.n}${LL(` стрибків × `, ` jumps × `)}${j.times}${LL(` на день, 30 с між стрибками. Лише якщо коліна, стопи й тазове дно без проблем. <button type="button" class="sm ghost" style="min-height:40px;padding:0 6px" data-act="guide" data-id="jumps">як стрибати</button></div></div>
          <div class="row">`, ` a day, 30 sec between jumps. Only if your knees, feet, and pelvic floor are problem-free. <button type="button" class="sm ghost" style="min-height:40px;padding:0 6px" data-act="guide" data-id="jumps">how to jump</button></div></div>
          <div class="row">`)}${Array.from({ length: j.times }, (_, k) => `<button type="button" class="sm${k < done ? ' pri' : ''}" data-act="jump" data-k="${k + 1}">${k < done ? '✓ ' : ''}${LL(`${k + 1}-й раз`, `Round ${k + 1}`)}</button>`).join('')}</div></div>`;
      }
      const how = it.how && (G().guide || []).some((g) => g.id === it.how) ? ` <button type="button" class="sm ghost" data-act="guide" data-id="${it.how}${LL(`">як робити</button>`, `">how to do it</button>`)}` : '';
      const ok = !!rec[it.id];
      return `<div class="chk"><div style="flex:1;min-width:0"><span>${esc(it.label)}</span>${how ? '<div>' + how + '</div>' : ''}</div><button type="button" class="sm${ok ? ' done' : ' pri'}" data-act="dailyDone" data-id="${it.id}" aria-pressed="${ok}">${ok ? LL('✓ Зроблено', "✓ Done") : LL('Виконано', "Mark done")}</button></div>`;
    }).join('')}${LL(`</div><p class="tiny muted">Відмітка — на сьогодні; ще раз торкніться, щоб скасувати. Дні з відмітками зеленіють у «План» → «Історія».</p>`, `</div><p class="tiny muted">The check mark is for today; tap again to undo. Days with check marks turn green in “Plan” → “History”.</p>`)}`;
  }
  function alerts() {
    const out = [], p = P(), prog = G();
    if (ENGINE.fatigue(prog, p, p.handle)) out.push(LL('<div class="note b">Два тренування поспіль головні вправи падають. Зробіть легкий тиждень: половина підходів, вага та сама або на крок нижча.</div>', "<div class=\"note b\">Your main lifts have dropped two workouts in a row. Take a deload week: half the sets, same weight or one step lower.</div>"));
    const reds = p.sessions.slice(-3).filter((s) => s.ready === 'r').length;
    if (reds >= 2) out.push(LL('<div class="note b">Спина болить уже кілька тренувань поспіль. Варто показатися неврологу чи ортопеду — з МРТ.</div>', "<div class=\"note b\">Your back has hurt for several workouts in a row. It’s worth seeing a neurologist or an orthopedist — with an MRI.</div>"));
    const wk = ENGINE.planFor(prog, nextN()).week;
    if (prog.tests && [1, 4, 8, 12].indexOf(wk) >= 0 && !(p.body.tests || []).some((t) => Date.now() - tms(t.d) < 21 * 864e5)) out.push(LL('<div class="note w">Цього тижня — тести готовності до старіння: «Тіло» → «Тести».</div>', "<div class=\"note w\">This week — aging-readiness tests: “Body” → “Tests”.</div>"));
    if (p.sessions.length >= 3 && (!DB.lastBackup || Date.now() - tms(DB.lastBackup) > 14 * 864e5)) out.push(LL('<div class="note w">Резервної копії не було понад 2 тижні — «Більше» → «Зберегти резервну копію».</div>', "<div class=\"note w\">No backup in over 2 weeks — “More” → “Save backup”.</div>"));
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (!standalone && !p.sessions.length) out.push(installNote(LL('Спершу встановіть', "Install it first")));
    return out.join('');
  }
  /* тема (з 3.20.0, слово Alexа 23.10: «кнопку перемикання теми … на головній в правому верхньому куті маленькою кнопкою з іконкою»):
     три стани — авто (як у телефоні; за замовчуванням: Apple радить не ламати системний вибір), світла, темна (Android радить саме ці три).
     Зберігається на телефоні (як мова) — для всіх акаунтів; ставиться ще до першого малювання (скрипт у index.html). */
  const themeNow = () => { try { const t = localStorage.getItem('trening-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { return 'auto'; } };
  function themeApply(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    /* рядок стану: за вибором — один колір; авто — як у системі */
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { if (!m.dataset.orig) m.dataset.orig = m.content; m.content = t === 'light' ? '#f4f6f5' : t === 'dark' ? '#08201f' : m.dataset.orig; });
  }
  function themeNext() {
    const t = { auto: 'light', light: 'dark', dark: 'auto' }[themeNow()];
    try { if (t === 'auto') localStorage.removeItem('trening-theme'); else localStorage.setItem('trening-theme', t); } catch (e) { /* немає сховища — лише до перезапуску */ }
    themeApply(t); haptic();
    toast({ auto: LL('Тема: як у телефоні', 'Theme: same as your phone'), light: LL('Тема: світла', 'Theme: light'), dark: LL('Тема: темна', 'Theme: dark') }[t]);
    if (view === 'home') rHome();
  }
  const themeBtn = () => { const t = themeNow(); return `<button type="button" class="ic thm" data-act="theme" aria-label="${{ auto: LL('тема: як у телефоні', 'theme: same as phone'), light: LL('тема: світла', 'theme: light'), dark: LL('тема: темна', 'theme: dark') }[t]}">${{ auto: ICON.themeAuto, light: ICON.themeLight, dark: ICON.themeDark }[t]}</button>`; };
  function rHome() {
    const p = P(), prog = G(), d = p.draft, plan = ENGINE.planFor(prog, nextN()), wo = prog.workouts[plan.workout];
    const greet = ENGINE.greeting(new Date().getHours());  // година — з годинника телефона
    const wkKey = ENGINE.weekKey(today()), thisWeek = p.sessions.filter((s) => ENGINE.weekKey(s.date) === wkKey).length;
    const streak = ENGINE.streakWeeks(p.sessions, today());
    const ym = today().slice(0, 7), mprs = p.sessions.filter((s) => s.date.slice(0, 7) === ym).reduce((a, s) => a + (s.prs || 0), 0);
    const pv = buildDraft(null, 'g'), est = ENGINE.estimateMins(prog, pv.items), nEx = pv.items.filter((x) => !x.skipped).length;
    const warmMin = (warmList().title.match(/(\d+)\s*(?:хв|min)/) || [])[1];
    const nd = nextDayText(p.days);
    app.innerHTML = `<div class="brand">${MARK}${LL(`<b>Тренування</b>`, `<b>Workouts</b>`)}${themeBtn()}${LL(`</div><p class="muted small" style="margin-top:4px">`, `</div><p class="muted small" style="margin-top:4px">`)}${new Date().toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</p><div class="sp"><h1>${greet}${LL(`!</h1><div class="row" style="gap:8px;flex-wrap:nowrap"><button type="button" class="ic" data-act="ask" aria-label="запитати тренера">`, `!</h1><div class="row" style="gap:8px;flex-wrap:nowrap"><button type="button" class="ic" data-act="ask" aria-label="ask the coach">`)}${ICON.mic}</button><button type="button" class="ic${RADIO.state === 'playing' || RADIO.state === 'loading' ? ' rad' : ''}${LL(`" data-act="radio" aria-label="радіо">`, `" data-act="radio" aria-label="radio">`)}${ICON.radio}</button></div></div>
      ${alerts()}
      ${d ? `${LL(`<div class="card"><div class="sp"><div><b>Тренування триває</b><div class="small muted">`, `<div class="card"><div class="sp"><div><b>Workout in progress</b><div class="small muted">`)}${esc(woTitle(d.workout))} · ${draftStats(d).done}/${draftStats(d).total}${LL(` підходів</div></div><button type="button" class="pri" data-act="resume">Продовжити</button></div></div>`, ` sets</div></div><button type="button" class="pri" data-act="resume">Resume</button></div></div>`)}` : ''}${LL(`
      <div class="card hero"><div class="row"><span class="chip">Тиждень `, `
      <div class="card hero"><div class="row"><span class="chip">Week `)}${plan.week}${plan.cycle > 1 ? LL(' · цикл ', " · cycle ") + plan.cycle : ''}</span><span class="chip">${plan.slot + 1}${LL(` з `, ` of `)}${prog.perWeek || 3}</span>${pv.back ? LL('<span class="chip">після перерви</span>', "<span class=\"chip\">after a break</span>") : plan.deload ? LL('<span class="chip">легкий тиждень</span>', "<span class=\"chip\">deload week</span>") : ''}</div>
        <h1 style="margin-top:10px">${esc(wo.title)}</h1><p class="muted small">${plural(nEx, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises"))} · ≈ ${est}${LL(` хв`, ` min`)}${warmMin ? LL(' + розминка ', " + warm-up ") + warmMin + LL(' хв', " min") : ''} · ${esc(pv.back ? LL('запас 3–4', "RIR 3–4") : plan.note.rir)}${nd ? LL(' · за планом ', " · scheduled ") + nd : ''}</p>
        <p class="small" style="opacity:.92">${pv.back ? '↩ ' + esc(backText(pv.back)) : esc(plan.note.phase)}</p>
        ${d ? '' : LL('<button type="button" class="pri wide big" data-act="start">Почати тренування</button><button type="button" class="ghost wide hlink" data-act="other">Інше тренування</button>', "<button type=\"button\" class=\"pri wide big\" data-act=\"start\">Start workout</button><button type=\"button\" class=\"ghost wide hlink\" data-act=\"other\">Different workout</button>")}</div>
      ${S().tour.tips ? '' : LL('<div class="card"><div class="sp"><div><b>💡 Підказка на кожній кнопці</b><div class="small muted">Затисніть будь-яку кнопку чи напис на 1,5 секунди — зʼявиться коротке пояснення.</div></div><button type="button" class="sm pri" data-act="tipsOk">Зрозуміло</button></div></div>', "<div class=\"card\"><div class=\"sp\"><div><b>💡 Tips on every button</b><div class=\"small muted\">Press and hold any button or label for 1.5 seconds to see a short explanation.</div></div><button type=\"button\" class=\"sm pri\" data-act=\"tipsOk\">Got it</button></div></div>")}
      ${S().tour.v4 ? '' : LL('<div class="card"><div class="sp"><div><b>Нове: запитайте тренера</b><div class="small muted">Кнопка з мікрофоном угорі: питання голосом, текстом чи з фото — про вашу програму, вагу й техніку.</div></div><button type="button" class="sm pri" data-act="whatsnew">Що нового</button></div></div>', "<div class=\"card\"><div class=\"sp\"><div><b>New: ask the coach</b><div class=\"small muted\">Tap the mic button at the top to ask by voice, text, or photo — about your program, weights, and form.</div></div><button type=\"button\" class=\"sm pri\" data-act=\"whatsnew\">What’s new</button></div></div>")}
      <div class="grid3"><div class="stat" style="display:flex;justify-content:center">${CHARTS.ring(thisWeek, prog.perWeek || 3, thisWeek + '/' + (prog.perWeek || 3), LL('тиждень', "week"))}</div>
        <div class="stat"><b>${streak}${LL(`</b><span>тижнів поспіль</span></div><div class="stat"><b>`, `</b><span>weeks in a row</span></div><div class="stat"><b>`)}${mprs}${LL(`</b><span>рекордів за місяць</span></div></div>
      `, `</b><span>PRs this month</span></div></div>
      `)}${kHomeCard()}${dailyCard()}`;
    tourMaybe('home');
    badgeSync();
  }
  function otherSheet() {
    const prog = G();
    openSheet(`${LL(`<b>Інше тренування</b><p class="small muted">Тиждень і підказки лишаються за планом.</p><div class="pick">`, `<b>Different workout</b><p class="small muted">The week and hints stay as planned.</p><div class="pick">`)}${Object.keys(prog.workouts).map((k) => `<button type="button" data-act="startW" data-w="${k}"><b>${esc(prog.workouts[k].title)}</b><span class="small muted">${plural(prog.workouts[k].items.length, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises"))}${prog.gymWorkouts && prog.gymWorkouts[k] ? LL(' удома · ', " at home · ") + prog.gymWorkouts[k].items.length + LL(' у залі', " at the gym") : ''}</span></button>`).join('')}</div>`);
  }

  /* ---------- план та історія ---------- */
  function sessionByN() { const m = {}; P().sessions.forEach((s) => { m[s.n] = s; }); return m; }
  function rPlan() {
    const p = P(), prog = G(), nn = nextN(), cur = ENGINE.planFor(prog, nn), byN = sessionByN();
    let body = '';
    if (ui.planTab === 'w') {
      const weeks = cur.cycle === 1 ? Array.from({ length: 12 }, (_, k) => k + 1) : Array.from({ length: 8 }, (_, k) => k + 5);
      body = `<div class="card">${weeks.map((w) => {
        const pw = prog.perWeek || 3, base = cur.cycle === 1 ? (w - 1) * pw : 12 * pw + (cur.cycle - 2) * 8 * pw + (w - 5) * pw;
        const order = prog.week(w);
        return `<div class="wk${prog.deload.indexOf(w) >= 0 ? ' dl' : ''}" style="grid-template-columns:58px repeat(${prog.perWeek || 3},1fr)"><div class="wl"><b>${w}${LL(`</b>тиждень</div>`, `</b>week</div>`)}${order.map((wid, s) => {
          const n = base + s, done = byN[n], isNext = n === nn;
          const short = { A: LL('А', "A"), B: LL('Б', "B"), D1: LL('Д1', "D1"), D2: LL('Д2', "D2"), D3: LL('Д3', "D3") }[wid] || wid;
          return `<button type="button" class="slot${done ? ' done' : isNext ? ' next' : ''}" data-act="${done ? 'sess' : isNext ? 'start' : 'noop'}" data-id="${done ? done.id : ''}">${done ? '✓ ' : ''}${esc(short)}<small>${done ? dm(done.date) : isNext ? LL('наступне', "next") : ''}</small></button>`;
        }).join('')}</div>`;
      }).join('')}</div><p class="tiny muted">${weeks.some((w) => prog.week(w).some((x) => /^D/.test(x))) ? LL('А / Б — тренування фази 1, Д1–Д3 — дні фаз 2–3.', "A / B — phase 1 workouts, D1–D3 — phase 2–3 days.") : LL('А / Б — два тренування на все тіло, по черзі.', "A / B — two full-body workouts, alternating.")}${LL(` Легкий тиждень — підходів удвічі менше.</p>`, ` Deload week — half the sets.</p>`)}`;
    } else {
      const ym = ui.calMonth || today().slice(0, 7);
      const marks = {}; p.sessions.forEach((s) => { marks[s.date] = 't'; });
      Object.keys(p.daily).forEach((d) => { if (!marks[d] && Object.values(p.daily[d]).some(Boolean)) marks[d] = 'd'; });
      const list = p.sessions.filter((s) => s.date.slice(0, 7) === ym).slice().reverse();
      body = `<div class="card"><div class="sp"><button type="button" class="sm" data-act="calPrev">‹</button><b>${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}</b><button type="button" class="sm" data-act="calNext">›</button></div><p></p>${CHARTS.month(ym, marks, today())}${LL(`
        <div class="legend"><span><i></i>тренування</span><span><i style="background:var(--ok-soft)"></i>щоденне</span></div></div>
        <div class="card">`, `
        <div class="legend"><span><i></i>workout</span><span><i style="background:var(--ok-soft)"></i>daily</span></div></div>
        <div class="card">`)}${list.length ? `<ul class="list">${list.map((s) => `<li data-act="sess" data-id="${s.id}" style="cursor:pointer"><span><b>${esc(woTitle(s.workout))}${placeTag(s)}</b><div class="tiny muted">${dm(s.date)}${LL(` · тиждень `, ` · week `)}${s.week} · ${s.mins || '?'}${LL(` хв · `, ` min · `)}${plural(s.sets.filter((x) => x.type !== 'W').length, LL('підхід', "set"), LL('підходи', "sets"), LL('підходів', "sets"))}</div></span><span>${s.prs ? '<span class="chip g">🏆 ' + s.prs + '</span>' : '›'}</span></li>`).join('')}</ul>` : LL('<div class="empty">У цьому місяці тренувань немає</div>', "<div class=\"empty\">No workouts this month</div>")}</div>`;
    }
    app.innerHTML = `${LL(`<h1>План</h1><div class="seg"><button type="button" class="`, `<h1>Plan</h1><div class="seg"><button type="button" class="`)}${ui.planTab === 'w' ? 'on' : ''}${LL(`" data-act="planTab" data-v="w">12 тижнів</button><button type="button" class="`, `" data-act="planTab" data-v="w">12 weeks</button><button type="button" class="`)}${ui.planTab === 'h' ? 'on' : ''}${LL(`" data-act="planTab" data-v="h">Історія</button></div>`, `" data-act="planTab" data-v="h">History</button></div>`)}${body}`;
  }
  function sessSheet(id, edit) {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === id); if (!s) return;
    const groups = []; s.sets.forEach((x, k) => { let g = groups.find((y) => y.ex === x.ex); if (!g) { g = { ex: x.ex, sets: [] }; groups.push(g); } g.sets.push({ x, k }); });
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    openSheet(`<div class="sp"><b>${esc(woTitle(s.workout))}${placeTag(s)}${LL(`</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">`, `</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <p class="small muted">`)}${dm(s.date)}${LL(` · тиждень `, ` · week `)}${s.week} · ${s.mins || '?'}${LL(` хв`, ` min`)}${vol ? LL(' · обсяг ', " · volume ") + fmt(Math.round(vol)) + KG(LL(' кг', " kg")) : ''}${s.ready ? LL(' · спина ', " · back ") + ({ g: '🟢', y: '🟡', r: '🔴' }[s.ready] || '') : ''}</p>
      ${groups.map((g) => { const ex = prog.ex[g.ex] || { name: g.ex, type: 'bw' }; return `<div class="card" style="padding:10px 12px"><b class="small">${esc(ex.name)}</b>${g.sets.map(({ x, k }) => edit
        ? `<div class="row" style="flex-wrap:nowrap;margin-top:6px"><span class="tiny muted" style="width:22px">${x.type === 'W' ? LL('Р', "W") : x.type === 'D' ? LL('Д', "D") : x.type === 'F' ? LL('В', "F") : '•'}</span>${isLoad(ex) ? `<input inputmode="decimal" data-ed="load" data-sk="${k}"${loadTip(ex, LL(' у цьому підході. Порожньо — без ваги.', " in this set. Leave blank for no weight."))} value="${x.load === null || x.load === undefined ? '' : fmt(x.load)}" placeholder="${ex.type === 'band' ? LL('рівень', "level") : KG(LL('кг', "kg"))}">` : ''}<input inputmode="numeric" data-ed="reps" data-sk="${k}" value="${x.reps}"></div>`
        : `<div class="small" style="margin-top:4px">${x.type === 'W' ? LL('<span class="chip w">Р</span> ', "<span class=\"chip w\">W</span> ") : x.type === 'D' ? LL('<span class="chip">Д</span> ', "<span class=\"chip\">D</span> ") : x.type === 'F' ? LL('<span class="chip">В</span> ', "<span class=\"chip\">F</span> ") : x.type === 'M' ? LL('<span class="chip g">М</span> ', "<span class=\"chip g\">M</span> ") : ''}${esc(setText(ex, x))}${x.mini && x.mini.length ? ' + ' + x.mini.join(' + ') : ''}${x.rir !== null && x.rir !== undefined ? LL(' · запас ', " · RIR ") + x.rir : ''}</div>`).join('')}</div>`; }).join('')}
      ${edit ? `<button type="button" class="pri wide" data-act="sessSave" data-id="${s.id}${LL(`">Зберегти зміни</button>`, `">Save changes</button>`)}` : `<button type="button" class="wide" data-act="sessEdit" data-id="${s.id}${LL(`">Редагувати</button>`, `">Edit</button>`)}`}<p></p>
      <button type="button" class="ghost wide" style="color:var(--bad)" data-act="sessDel" data-id="${s.id}${LL(`">Видалити тренування</button>`, `">Delete workout</button>`)}`);
  }

  /* ---------- прогрес ---------- */
  function rProgress() {
    const p = P(), prog = G(), h = p.handle;
    const seg = `<div class="seg">${[['ex', LL('Вправи', "Exercises")], ['mu', LL('Мʼязи', "Muscles")], ['rep', LL('Звіт', "Report")]].map(([k, l]) => `<button type="button" class="${ui.progTab === k ? 'on' : ''}" data-act="progTab" data-v="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (ui.progTab === 'ex') {
      const used = {}; p.sessions.forEach((s) => s.sets.forEach((x) => { if (x.type !== 'W') used[x.ex] = 1; }));
      const ids = Object.keys(prog.ex).filter((id) => !prog.ex[id].retired || used[id]).sort((a, b) => (used[b] ? 1 : 0) - (used[a] ? 1 : 0) || (prog.ex[b].main ? 1 : 0) - (prog.ex[a].main ? 1 : 0));
      if (!ui.progEx || !prog.ex[ui.progEx]) ui.progEx = ids[0];
      const ex = prog.ex[ui.progEx], histAll = ENGINE.history(p, ui.progEx, 'all');
      const metrics = ex.type === 'db' || isMach(ex) ? [['e1rm', LL('Максимум', "Est. 1RM")], ['heavy', LL('Вага', "Weight")], ['vol', LL('Обсяг', "Volume")]] : ex.type === 'dbopt' ? [['reps', LL('Повторення', "Reps")], ['heavy', LL('Вага', "Weight")]] : ex.type === 'band' ? [['e1rm', LL('Рівень × повт.', "Level × reps")]] : ex.type === 'time' ? [['e1rm', LL('Секунди', "Seconds")]] : [['e1rm', LL('Повторення', "Reps")]];
      if (!metrics.some((m) => m[0] === ui.metric)) ui.metric = metrics[0][0];
      const cut = ui.range === '4' ? Date.now() - 28 * 864e5 : ui.range === '12' ? Date.now() - 84 * 864e5 : 0;
      let best = -Infinity;
      const pts = histAll.map((x) => {
        let v;
        if (ui.metric === 'heavy') v = Math.max(...x.sets.map((s) => ENGINE.totalLoad(ex, s.load, h, s.variant)));
        else if (ui.metric === 'vol') v = x.sets.reduce((a, s) => a + ENGINE.setVolume(ex, s, h), 0);
        else if (ui.metric === 'reps') v = Math.max(...x.sets.map((s) => s.reps));
        else v = ENGINE.bestOf(ex, x.sets, h);
        const pr = best > -Infinity && v > best; best = Math.max(best, v);
        return { t: tms(x.date), v: Math.round(v * 10) / 10, pr };
      }).filter((q) => q.t >= cut);
      const rec = ENGINE.records(ex, histAll, h);
      const unit = ui.metric === 'vol' ? KG(LL('кг за тренування', "kg per workout")) : ui.metric === 'heavy' ? (isMach(ex) ? KG(LL('кг на тренажері', "kg on the machine")) : KG(LL('кг у руках', "kg in hand"))) : ui.metric === 'reps' ? LL('повторень', "reps") : ENGINE.metricLabel(ex, isLb() ? 'lb' : 'kg');
      const repRows = Object.keys(rec.reps).map(Number).sort((a, b) => b - a).slice(0, 8);
      body = `<select id="exSel">${ids.map((id) => `<option value="${id}"${id === ui.progEx ? ' selected' : ''}>${esc(prog.ex[id].name)}${used[id] ? '' : LL(' (ще не виконували)', " (not done yet)")}</option>`).join('')}</select>
        <div class="seg">${metrics.map(([k, l]) => `<button type="button" class="${ui.metric === k ? 'on' : ''}" data-act="metric" data-v="${k}"${k === 'heavy' && isMach(ex) ? LL(' data-tip="Найбільша вага на тренажері за кожне тренування."', " data-tip=\"Heaviest weight on the machine in each workout.\"") : ''}>${l}</button>`).join('')}</div>
        <div class="card"><div class="sp"><span class="tiny muted">${esc(unit)}${LL(` · ◎ — рекорд</span><span class="seg" style="margin:0;padding:2px">`, ` · ◎ — PR</span><span class="seg" style="margin:0;padding:2px">`)}${[['4', LL('4 т', "4 wk")], ['12', LL('12 т', "12 wk")], ['all', LL('усе', "all")]].map(([k, l]) => `<button type="button" class="${ui.range === k ? 'on' : ''}" style="min-height:40px;min-width:44px;padding:4px 10px" data-act="range" data-v="${k}">${l}</button>`).join('')}</span></div>
        ${CHARTS.line([{ pts, color: 'var(--accent)', area: true }], { label: ex.name, empty: LL('Ще немає підходів у цій вправі', "No sets for this exercise yet") })}</div>
        ${histAll.length ? `<div class="grid3">
          <div class="stat"><b>${rec.e1rm ? fmt(rec.e1rm.v) : '—'}</b><span>${ex.type === 'db' || isMach(ex) ? KG(LL('рекорд максимуму, кг', "best est. 1RM, kg")) : LL('найкращий показник', "best result")}</span></div>
          <div class="stat"><b>${rec.heavy ? fmt(rec.heavy.total) : '—'}</b><span>${isMach(ex) ? LL('найбільша вага', "heaviest weight") : LL('найважче в руках', "heaviest in hand")}${KG(LL(`, кг`, `, kg`))}${rec.heavy ? ' × ' + rec.heavy.set.reps : ''}</span></div>
          <div class="stat"><b>${rec.vol ? fmt(Math.round(rec.vol.v)) : '—'}${KG(LL(`</b><span>найбільший обсяг, кг</span></div></div>
          `, `</b><span>biggest volume, kg</span></div></div>
          `))}${repRows.length ? `${LL(`<h2>Рекорди повторень</h2><div class="card"><ul class="list">`, `<h2>Rep PRs</h2><div class="card"><ul class="list">`)}${repRows.map((L) => `<li><span>${ex.type === 'band' ? LL('рівень ', "level ") + fmt(L) : isMach(ex) ? fmt(L) + KG(LL(' кг', " kg")) : LL('гриф + ', "handle + ") + fmt(L) + KG(LL(' кг', " kg"))}</span><span><b>${rec.reps[String(L)].reps}</b> <span class="tiny muted">${dm(rec.reps[String(L)].date)}</span></span></li>`).join('')}</ul></div>` : ''}${LL(`
          <h2>Останні тренування</h2><div class="card"><ul class="list">`, `
          <h2>Recent workouts</h2><div class="card"><ul class="list">`)}${histAll.slice(-6).reverse().map((x) => `<li><span>${dm(x.date)}</span><span class="small">${x.sets.map((s) => esc(setText(ex, s))).join(', ')}</span></li>`).join('')}</ul></div>` : ''}
        ${ex.tip ? `<div class="note small">${esc(ex.tip)}</div>` : ''}`;
    } else if (ui.progTab === 'mu') {
      const days = ui.musDays, to = Date.now() + 864e5, from = Date.now() - days * 864e5;
      const raw = ENGINE.muscleSets(prog, p.sessions, from, to), wkv = {};
      Object.keys(raw).forEach((k) => { wkv[k] = Math.round(raw[k] / (days / 7) * 10) / 10; });
      const present = MUSCLES.filter((m) => Object.values(prog.ex).some((e) => e.m.p.indexOf(m[0]) >= 0));
      body = `<div class="seg">${[[7, LL('7 днів', "7 days")], [28, LL('28 днів (сер. за тиждень)', "28 days (weekly avg.)")]].map(([k, l]) => `<button type="button" class="${ui.musDays === k ? 'on' : ''}" data-act="musDays" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="card">${CHARTS.bodyMap(wkv, volHi() ? 12 : 8, G().sex)}${LL(`<p class="tiny muted" style="text-align:center">Що темніше — то більше підходів на тиждень. Основний мʼяз вправи — 1 підхід, допоміжний — 0,5.</p></div>
        <h2>Підходи на тиждень</h2><div class="card">`, `<p class="tiny muted" style="text-align:center">The darker the color, the more sets per week. An exercise’s main muscle counts as 1 set, a secondary one as 0.5.</p></div>
        <h2>Sets per week</h2><div class="card">`)}${CHARTS.hbars(present.map(([k, l]) => ({ label: TR(l), v: wkv[k] || 0 })), volHi() ? { lo: 10, hi: 20, zoneLabel: LL('наукові огляди: 10–20 робочих підходів на тиждень для росту мʼязів', "research reviews: 10–20 working sets per week for muscle growth") } : { lo: 6, hi: 12, zoneLabel: LL('орієнтир для сили й тонусу: 6–12 підходів на тиждень', "guideline for strength and tone: 6–12 sets per week") })}</div>`;
    } else {
      const ym = ui.repMonth || today().slice(0, 7);
      const [Y, M] = ym.split('-').map(Number); const prevYm = M === 1 ? (Y - 1) + '-12' : Y + '-' + pad(M - 1);
      const r = ENGINE.monthReport(prog, p, ym, h), r0 = ENGINE.monthReport(prog, p, prevYm, h);
      const delta = (a, b) => (b ? ' <span class="tiny muted">(' + (a - b >= 0 ? '+' : '−') + fmt(Math.abs(Math.round((a - b) * 10) / 10)) + ')</span>' : '');
      const marks = {}; p.sessions.forEach((s) => { marks[s.date] = 't'; });
      body = `<div class="card"><div class="sp"><button type="button" class="sm" data-act="repPrev">‹</button><b>${MONTHS[M - 1]} ${Y}</b><button type="button" class="sm" data-act="repNext">›</button></div></div>
        <div class="grid2"><div class="stat"><b>${r.sessions}${delta(r.sessions, r0.sessions)}${LL(`</b><span>тренувань</span></div><div class="stat"><b>`, `</b><span>workouts</span></div><div class="stat"><b>`)}${r.mins}${delta(r.mins, r0.mins)}${LL(`</b><span>хвилин</span></div>
        <div class="stat"><b>`, `</b><span>minutes</span></div>
        <div class="stat"><b>`)}${r.volume ? fmt(Math.round(r.volume / 100) / 10) + LL(' т', " t") : '—'}${LL(`</b><span>обсяг</span></div><div class="stat"><b>`, `</b><span>volume</span></div><div class="stat"><b>`)}${r.prs}${delta(r.prs, r0.prs)}${LL(`</b><span>рекордів</span></div></div>
        `, `</b><span>PRs</span></div></div>
        `)}${r.gains && r.gains.length ? `${LL(`<h2>Найбільший приріст</h2><div class="card"><ul class="list">`, `<h2>Biggest gains</h2><div class="card"><ul class="list">`)}${r.gains.slice(0, 5).map((g) => `<li><span>${esc(prog.ex[g.id].name)}</span><span class="chip ok">+${g.pct} %</span></li>`).join('')}</ul></div>` : ''}
        ${(() => { const ms = p.sessions.filter((s) => s.date.slice(0, 7) === ym && s.ready); if (!ms.length) return ''; const c = { g: 0, y: 0, r: 0 }; ms.forEach((s) => { c[s.ready] = (c[s.ready] || 0) + 1; });
          return `${LL(`<h2>Самопочуття перед тренуваннями</h2><div class="card"><div class="row" style="gap:6px">`, `<h2>How you felt before workouts</h2><div class="card"><div class="row" style="gap:6px">`)}${ms.map((s) => `<span class="rdot ${s.ready}" title="${dm(s.date)}"></span>`).join('')}</div><p class="small muted">🟢 ${c.g} · 🟡 ${c.y} · 🔴 ${c.r}${c.r >= 2 ? LL(' — болить часто: варто до лікаря з МРТ.', " — it hurts often: worth seeing a doctor and getting an MRI.") : ''}</p></div>`; })()}
        ${(() => { const rc = []; p.sessions.slice().reverse().forEach((s) => (s.prList || []).forEach((x) => { if (rc.length < 6) rc.push({ d: s.date, ex: x.ex, t: x.types }); })); return rc.length ? `${LL(`<h2>Останні рекорди</h2><div class="card"><ul class="list">`, `<h2>Recent PRs</h2><div class="card"><ul class="list">`)}${rc.map((r) => `<li><span>${esc((prog.ex[r.ex] || { name: r.ex }).name)}<div class="tiny muted">${dm(r.d)}</div></span><span class="chip g">🏆 ${r.t.map((t) => ({ e1rm: LL('максимум', "est. 1RM"), weight: LL('вага', "weight"), reps: LL('повторення', "reps") }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''; })()}${LL(`
        <h2>Календар</h2><div class="card">`, `
        <h2>Calendar</h2><div class="card">`)}${CHARTS.month(ym, marks, today())}${LL(`</div>
        <p class="tiny muted">Порівняння — з попереднім місяцем. Приріст — найкращий показник вправи в цьому місяці проти всього, що було раніше.</p>`, `</div>
        <p class="tiny muted">Compared with the previous month. Gain — the exercise’s best result this month vs. everything before.</p>`)}`;
    }
    app.innerHTML = `${LL(`<h1>Прогрес</h1>`, `<h1>Progress</h1>`)}${seg}${body}`;
    const sel = document.getElementById('exSel'); if (sel) sel.onchange = () => { ui.progEx = sel.value; rProgress(); };
  }

  /* ---------- тіло ---------- */
  const MEAS = [['weight', LL('Вага', "Weight"), LL('кг', "kg"), 25, 300], ['waist', LL('Талія', "Waist"), LL('см', "cm"), 40, 250], ['chest', LL('Груди', "Chest"), LL('см', "cm"), 50, 250], ['hips', LL('Стегна', "Hips"), LL('см', "cm"), 50, 250], ['arm', LL('Рука', "Arm"), LL('см', "cm"), 15, 80]];
  const TESTS = [['chair', LL('Вставання з крісла за 30 с', "30-second chair stand"), LL('разів', "reps")], ['balL', LL('Стійка на одній нозі — ліва', "Single-leg stand — left"), LL('с', "sec")], ['balR', LL('Стійка на одній нозі — права', "Single-leg stand — right"), LL('с', "sec")],
    ['spL', LL('Бічна планка — ліворуч', "Side plank — left"), LL('с', "sec")], ['spR', LL('Бічна планка — праворуч', "Side plank — right"), LL('с', "sec")], ['push', LL('Віджимання', "Push-ups"), LL('разів', "reps")], ['carL', LL('Валізна прогулянка — ліва рука', "Suitcase carry — left hand"), LL('с', "sec")], ['carR', LL('Валізна прогулянка — права рука', "Suitcase carry — right hand"), LL('с', "sec")]];
  let photoUrls = [];
  /* ---------- Кухня (з 3.20.0, слово Alexа 23.10: «щоб це була моя кухня всередині додатку»; «не брехала та не заводила в оману») ----------
     Розрахунки — KITCHEN (app/kitchen.js), склад — лише база USDA (app/food_db.js, звірка tools/food_check.py) або етикетка людини.
     Три способи запису: точно (грами), швидко (мірка USDA), руками (Precision Nutrition — орієнтир); біля кожного запису — точність.
     Дані — у профілі: p.kitchen = { days: { дата: { items: [запис + m (прийом) + at (час)], water: мл } }, products, dishes, recent, set }. */
  const KQ = () => ({ exact: LL('зважено', 'weighed'), label: LL('етикетка', 'label'), measure: LL('мірка', 'measure'), hand: LL('орієнтир', 'estimate') });
  const KSTATE = () => ({ raw: LL('сирий', 'raw'), cooked: LL('готовий', 'cooked'), dry: LL('сухий', 'dry'), '': '' });
  /* стан у назві продукту — без узгодження з родом («Гречка, у готовому вигляді», а не «Гречка, готовий»; роду в базі немає) */
  const KSTATE_IN = () => ({ raw: LL('у сирому вигляді', 'raw'), cooked: LL('у готовому вигляді', 'cooked'), dry: LL('у сухому вигляді', 'dry'), '': '' });
  function kit() {
    const p = P();
    if (!p.kitchen) p.kitchen = {};
    const k = p.kitchen;
    k.days = k.days || {}; k.products = k.products || {}; k.dishes = k.dishes || {}; k.recent = k.recent || []; k.combos = k.combos || {};
    k.set = Object.assign({ meals: 4, glass: 350, wake: '07:00', bed: '23:00', water: false }, k.set || {});
    return k;
  }
  const kday = (d) => kit().days[d] || { items: [], water: 0 };
  const kdayW = (d) => { const k = kit(); if (!k.days[d]) k.days[d] = { items: [], water: 0 }; return k.days[d]; };
  const kctx = () => { const k = kit(); return { products: k.products, dishes: k.dishes, recent: k.recent }; };
  const ksex = () => (G().sex === 'f' ? 'f' : 'm');
  /* «Тиск або серце» в анкеті: скільки пити — з лікарем (при серцевій недостатності рідину можуть обмежувати — рекомендації ESC 2021) */
  const kHeart = () => ((((DB.custom || {}).answers || {}).limits) || []).indexOf('heart') >= 0;
  const kHeartNote = () => (kHeart() ? `<p class="tiny" style="color:var(--bad)">${LL('Тиск або серце: скільки пити — узгодьте з лікарем (при серцевій недостатності рідину можуть обмежувати).', 'Blood pressure or heart condition: check with your doctor how much to drink (with heart failure, fluids may be limited).')}</p>` : '');
  const kTrain = (d) => trainDays().indexOf(new Date(d + 'T12:00:00').getDay()) >= 0;
  const kMeals = () => { const n = kit().set.meals; return n === 3 ? [LL('Сніданок', 'Breakfast'), LL('Обід', 'Lunch'), LL('Вечеря', 'Dinner')]
    : n === 5 ? [LL('Сніданок', 'Breakfast'), LL('Перекус', 'Snack'), LL('Обід', 'Lunch'), LL('Перекус 2', 'Snack 2'), LL('Вечеря', 'Dinner')]
      : [LL('Сніданок', 'Breakfast'), LL('Обід', 'Lunch'), LL('Перекус', 'Snack'), LL('Вечеря', 'Dinner')]; };
  /* прийом за годиною телефона: до 11 — сніданок, до 16 — обід, далі — перекус (якщо є), з 19 — вечеря */
  const kMealNow = () => { const h = new Date().getHours(), n = kMeals().length; return h < 11 ? 0 : h < 16 ? (n === 5 ? 2 : 1) : h < 19 && n >= 4 ? (n === 5 ? 3 : 2) : n - 1; };
  /* норма на сьогодні: як було в «Тіло → Харчування» — вага з «Замірів» (середня за 7 днів), без зважувань — з анкети */
  function kNorm() {
    const p = P(), prog = G(), food = prog.food, me = Object.assign({ sex: prog.sex }, p.me || {});
    const wts = (p.body.weight || []), avg = ENGINE.rolling7(wts), wMeas = avg.length ? avg[avg.length - 1].v : null;
    const wAns = Number(((DB.custom || {}).answers || {}).weight) || null, wNow = wMeas || wAns;
    return { food, me, wts, wMeas, wAns, wNow, nu: ENGINE.nutrition(food, me, wNow), tr: ENGINE.weightTrend(wts) };
  }
  /* мета харчування й розрахунок норми з числами (до 3.20.0 — у «Тіло → Харчування»; тексти без змін) */
  /* дефіцит — справжній, після меж безпеки (nu.def, engine.nutrition); межа спрацювала — пояснення (kGuardTxt) */
  const kGoalTxt = (food, nu) => { const dp = Math.round((nu && nu.def !== undefined ? nu.def : food.deficit) * 100); if (nu && (nu.guard === 'under' || nu.guard === 'floor0')) return LL('калорії на рівні підтримки, без дефіциту', 'maintenance calories, no deficit');
    return food.goal === 'loss' ? LL('мета — менше жиру, мʼязи зберегти: дефіцит ≈ ', "goal — lose fat, keep your muscle: deficit ≈ ") + dp + LL(' % від витрат', " % of TDEE")
        : food.goal === 'recomp' ? LL('мета — менше жиру й більше мʼязів одночасно: невеликий дефіцит ≈ ', "goal — lose fat and build muscle at the same time: a small deficit of ≈ ") + dp + LL(' % від витрат', " % of TDEE")
        : food.goal === 'gain' ? LL('мета — набрати мʼязи: надлишок ≈ ', "goal — build muscle: a surplus of ≈ ") + Math.round(-food.deficit * 100) + LL(' % від витрат', " % of TDEE") : LL('мета — без схуднення й набору мʼязів: калорії на рівні підтримки, без дієт', "goal — no weight loss or muscle gain: maintenance calories, no dieting"); };
  const kGuardTxt = (nu) => !nu || !nu.guard ? '' : nu.guard === 'under' ? LL('ІМТ нижче 18,5 (недостатня вага за ВООЗ) — схуднення не радимо: калорії на рівні підтримки. Порадьтеся з лікарем.', 'BMI below 18.5 (underweight per the WHO) — we don’t recommend losing weight: maintenance calories. Talk to your doctor.')
    : nu.guard === 'floor0' ? (nu.floor === 1200 ? LL('Будь-який дефіцит опустив би калорії нижче 1200 на день — так худнуть лише під наглядом лікаря (Harvard Health). Тому калорії — на рівні підтримки; худнути — рухом і кроками.', 'Any deficit would take you below 1,200 calories a day — that’s only done under a doctor’s supervision (Harvard Health). So: maintenance calories; lose weight through activity and steps.') : LL('Будь-який дефіцит опустив би калорії нижче 1500 на день — так худнуть лише під наглядом лікаря (Harvard Health). Тому калорії — на рівні підтримки; худнути — рухом і кроками.', 'Any deficit would take you below 1,500 calories a day — that’s only done under a doctor’s supervision (Harvard Health). So: maintenance calories; lose weight through activity and steps.'))
    : (nu.floor === 1200 ? LL('Дефіцит менший за звичайний: без нагляду лікаря калорії — не нижче 1200 на день (Harvard Health).', 'A smaller deficit than usual: without a doctor’s supervision, calories stay at 1,200 a day or more (Harvard Health).') : LL('Дефіцит менший за звичайний: без нагляду лікаря калорії — не нижче 1500 на день (Harvard Health).', 'A smaller deficit than usual: without a doctor’s supervision, calories stay at 1,500 a day or more (Harvard Health).'));
  function kCalcTxt(N) {
    const nu = N.nu, food = N.food; if (!nu) return '';
    const pk = (v) => fmt(isLb() ? Math.round(v / ENGINE.LB * 100) / 100 : v);
    return kGoalTxt(food, nu) + LL('. Розрахунок: формула Міффліна — Сан Жеора × 1,45 (основний обмін ≈ ', '. Calculation: Mifflin–St Jeor formula × 1.45 (BMR ≈ ') + fmt(nu.bmr) + LL(', витрати ≈ ', ', TDEE ≈ ') + fmt(nu.tdee)
      + LL(' ккал); білок — ', ' kcal); protein — ') + pk(food.protein[0]) + '–' + pk(food.protein[1]) + KG(LL(' г на кг ', ' g per kg of '))
      + (nu.target ? LL('цільової ваги ', 'target weight ') + fmt(BW(nu.target)) + KG(LL(' кг', ' kg')) : nu.capped ? LL('ваги для ІМТ 30 (', 'the weight for BMI 30 (') + fmt(BW(nu.base)) + KG(LL(' кг)', ' kg)')) : LL('поточної ваги', 'current weight')) + '.';
  }
  /* назва й кількість запису для списку */
  function kName(e) {
    const k = kit();
    if (e.t === 'food') { const it = KITCHEN.item(e.id); if (!it) return '?'; const st = KITCHEN.needsState(e.id) ? KSTATE_IN()[e.s] : ''; return (I18N.lang === 'en' ? it.en : it.uk) + (st ? ', ' + st : ''); }
    if (e.t === 'my') return (k.products[e.pid] || {}).name || e.nm || '?';  // продукт видалили — назва зі знімка в записі
    if (e.t === 'dish') return (k.dishes[e.did] || {}).name || e.nm || '?';
    if (e.t === 'quick') return e.name || LL('Цифрами з етикетки', 'From a label');
    if (e.t === 'hand') return LL('Руками', 'By hand');
    return '?';
  }
  function kAmount(e) {
    if (e.t === 'hand') return KITCHEN.HAND_KEYS.filter((h) => e[h] > 0).map((h) => fmt(e[h]) + ' ' + kHandName(h, e[h])).join(', ');
    if (e.t === 'quick') return '';
    if (e.how === 'm' && e.ml) {
      /* підпис мірки — з бази поточною мовою, якщо мірка та сама (грами збігаються); інакше — збережений текст */
      const m = e.id && e.mi !== undefined ? kMeasOf(e.id, e.s)[e.mi] : null;
      const lab = m && e.mq > 0 && Math.round(m.g * e.mq * 10) / 10 === e.g ? fmt(e.mq) + ' × ' + m.l : e.ml;
      return lab + ' (' + fmt(e.g) + LL(' г)', ' g)');
    }
    return fmt(e.g) + LL(' г', ' g');
  }
  const kHandName = (h, n) => { const one = n === 1, few = n > 1 && n < 5 && n === Math.round(n);
    return { palm: one ? LL('долоня', 'palm') : few ? LL('долоні', 'palms') : LL('долонь', 'palms'), fist: one ? LL('кулак', 'fist') : few ? LL('кулаки', 'fists') : LL('кулаків', 'fists'),
      cup: one ? LL('жменя', 'cupped hand') : few ? LL('жмені', 'cupped hands') : LL('жмень', 'cupped hands'), thumb: one ? LL('палець', 'thumb') : few ? LL('пальці', 'thumbs') : LL('пальців', 'thumbs') }[h]; };
  const kHandWhat = () => ({ palm: LL('білок: мʼясо, риба, яйця, сир', 'protein: meat, fish, eggs, cheese'), fist: LL('овочі', 'vegetables'),
    cup: LL('вуглеводи: каша, картопля, хліб, фрукти', 'carbs: grains, potatoes, bread, fruit'), thumb: LL('жири: олія, горіхи, масло', 'fats: oil, nuts, butter') });

  function rKitchen() {
    const p = P(), k = kit(), d = ui.kDate || today(), day = kday(d), isToday = d === today();
    const N = kNorm(), nu = N.nu, sx = ksex(), tot = KITCHEN.dayTotals(day, sx, kctx()), meals = kMeals(), train = kTrain(d);
    const wd = isToday ? kWaterDay() : d, wday = kday(wd), wTrain = kTrain(wd);  // вода — за днем води (нічна зміна)
    const wTarget = KITCHEN.waterTarget(sx, wTrain), glass = k.set.glass, nGlass = Math.ceil(wTarget / glass), gDone = Math.floor((wday.water || 0) / glass + 1e-9);
    const kMid = nu ? (nu.kLo + nu.kHi) / 2 : 0;
    const head = `<div class="sp"><h1>${LL('Кухня', 'Kitchen')}</h1><div class="row" style="gap:4px"><button type="button" class="sm ghost" data-act="kDay" data-v="-1" aria-label="${LL('попередній день', 'previous day')}">‹</button>
      <span class="small" style="min-width:74px;text-align:center">${isToday ? LL('сьогодні', 'today') : dm(d)}</span><button type="button" class="sm ghost" data-act="kDay" data-v="1"${isToday ? ' disabled' : ''} aria-label="${LL('наступний день', 'next day')}">›</button></div></div>`;
    const setup = !nu ? `<div class="note w">${!N.wNow ? LL('Додайте вагу нижче — і зʼявиться норма калорій і білка.', 'Add your weight below and your calorie and protein targets will appear.') : LL('Вкажіть зріст і вік у «Налаштування кухні» — і зʼявиться норма.', 'Enter your height and age in “Kitchen settings” and your targets will appear.')}</div>` : '';
    const sum = `<div class="card"><div class="row" style="gap:14px;align-items:center">
        <div style="flex:0 0 96px">${CHARTS.ring(tot.kcal, kMid || 1, String(tot.kcal), nu ? LL('з ', 'of ') + nu.kLo + '–' + nu.kHi : LL('ккал', 'kcal'))}</div>
        <div style="flex:1;min-width:0">${kBar(LL('Білок', 'Protein'), tot.p, nu ? nu.pLo : 0, nu ? nu.pHi : 0, LL(' г', ' g'))}
          <div class="tiny muted" style="margin-top:6px">${LL('Жири ', 'Fat ')}${fmt(tot.f)}${LL(' г · вуглеводи ', ' g · carbs ')}${fmt(tot.c)}${LL(' г · клітковина ', ' g · fiber ')}${fmt(tot.fib)}${LL(' г', ' g')}</div>
          ${tot.n ? `<div class="tiny muted" style="margin-top:4px">${LL('Точно записано (зважено чи з етикетки): ', 'Recorded exactly (weighed or from a label): ')}<b>${tot.sure}%</b></div>` : ''}</div></div>
        ${nu ? `<p class="tiny muted" style="margin:8px 0 0">${esc(kGoalTxt(N.food, nu).replace(/^./, (c) => c.toUpperCase()))}.</p>${nu.guard ? `<div class="note w" style="margin-top:8px">${esc(kGuardTxt(nu))}</div>` : ''}` : ''}</div>`;
    const tday = train ? `<div class="note">${LL('День тренування: прийом з білком за 1–2 год до тренування і після нього.', 'Training day: have a protein-rich meal 1–2 hours before your workout and one after it.')}</div>` : '';
    const pl = nu ? KITCHEN.plate(nu, sx, meals.length) : null;
    const plate = pl ? `<div class="card"><div class="sp"><b>${LL('Ваша тарілка на прийом', 'Your plate per meal')}</b><span class="tiny muted">≈ ${pl.kMeal}${LL(' ккал', ' kcal')}</span></div>
      <div class="grid4 plate">${KITCHEN.HAND_KEYS.map((h) => `<div class="stat"><b>${fmt(pl[h])}</b><span>${kHandName(h, pl[h])}</span></div>`).join('')}</div>
      <p class="tiny muted">${LL('Білок — ', 'Protein — ')}${pl.pMeal}${(isLb() ? LL(' г на прийом (0,18 г на lb ваги, щонайменше ', ' g per meal (0.18 g per lb of body weight, at least ') : LL(' г на прийом (0,4 г/кг, щонайменше ', ' g per meal (0.4 g/kg, at least '))}${meals.length}${LL(' прийоми). Порції руками — орієнтир Precision Nutrition.', ' meals). Hand portions are a Precision Nutrition estimate.')}</p></div>` : '';
    const list = meals.map((name, mi) => {
      const its = day.items.map((e, i) => ({ e, i })).filter((x) => Math.min(x.e.m || 0, meals.length - 1) === mi);
      const mt = KITCHEN.dayTotals({ items: its.map((x) => x.e) }, sx, kctx());
      return `<div class="sp" style="margin-top:6px"><b>${esc(name)}</b><span class="small muted">${its.length ? mt.kcal + LL(' ккал · білок ', ' kcal · protein ') + fmt(mt.p) + LL(' г', ' g') : ''}</span></div>
        ${its.map((x) => { const m = KITCHEN.macros(x.e, sx, kctx()); return `<div class="krow" data-act="kEdit" data-i="${x.i}"><div style="flex:1;min-width:0"><div class="small">${esc(kName(x.e))}</div><div class="tiny muted">${esc(kAmount(x.e))}${kAmount(x.e) ? ' · ' : ''}<span class="kq ${m ? m.q : ''}">${m ? KQ()[m.q] : ''}</span></div></div>
          <div class="small" style="text-align:right">${m ? m.kcal : '—'}<div class="tiny muted">${m ? LL('б ', 'p ') + fmt(m.p) : ''}</div></div></div>`; }).join('')}
        <div class="row" style="gap:6px"><button type="button" class="sm ghost" style="flex:1" data-act="kAdd" data-m="${mi}">+ ${LL('Додати', 'Add')}</button>${its.length >= 2 ? `<button type="button" class="sm ghost" data-act="kCombo" data-m="${mi}">${LL('Зберегти прийом', 'Save meal')}</button>` : ''}</div>`;
    }).join('');
    const yd = iso(new Date(tms(d) - 864e5)), yday = kday(yd);
    const copy = yday.items.length && !day.items.length ? `<button type="button" class="wide" data-act="kCopy">${LL('Як учора', 'Same as yesterday')} (${KITCHEN.dayTotals(yday, sx, kctx()).kcal}${LL(' ккал)', ' kcal)')}</button>` : '';
    const gap = nu && isToday && day.items.length ? KITCHEN.proteinGap(tot, nu.pLo, kctx(), 3) : null;
    const gapCard = gap && gap.need > 0 ? `<div class="card"><b>${LL('Чим добрати білок', 'How to reach your protein')}</b><p class="small muted">${LL('Бракує ', 'You need ')}${gap.need}${LL(' г до норми. Одне з:', ' g more. One of:')}</p>
      ${gap.list.map((x, j) => `<div class="krow"><div style="flex:1;min-width:0"><div class="small">${esc(kName(x.e))}</div><div class="tiny muted">${x.mine ? `<span class="kq exact">${LL('з ваших', 'yours')}</span> · ` : ''}${fmt(x.e.g)}${LL(' г · ', ' g · ')}${x.kcal}${LL(' ккал · білок ', ' kcal · protein ')}${fmt(x.p)}${LL(' г', ' g')}</div></div>
        <button type="button" class="sm" data-act="kGapAdd" data-j="${j}">+</button></div>`).join('')}<p class="tiny muted">${LL('Спершу — те, що ви вже їсте. Склад — з бази USDA чи ваших етикеток.', 'What you already eat comes first. Composition comes from the USDA database or your own labels.')}</p></div>` : '';
    const water = `<div class="card"><div class="sp"><b>${LL('Вода', 'Water')}</b><span class="small muted">${fmt((wday.water || 0) / 1000)} ${LL('з', 'of')} ${fmt(wTarget / 1000)}${LL(' л', ' L')}</span></div>
      <div class="glasses">${Array.from({ length: nGlass }, (_, j) => `<i class="${j < gDone ? 'on' : ''}"></i>`).join('')}</div>
      <div class="row"><button type="button" class="pri" style="flex:1" data-act="kWater" data-v="1">+ ${LL('склянка', 'glass')} ${glass}${LL(' мл', ' ml')}</button><button type="button" class="ghost" style="min-width:48px" data-act="kWater" data-v="-1" aria-label="${LL('прибрати склянку', 'remove a glass')}">−</button></div>
      <p class="tiny muted">${wTrain ? LL('День тренування — верхня межа норми.', 'Training day — the upper end of your target.') : LL('Норма програми: ', 'Your program’s target: ') + (sx === 'f' ? LL('2–2,5 л', '2–2.5 L') : LL('2,5–3 л', '2.5–3 L')) + LL(' на день, у дні тренувань — більше.', ' a day, more on training days.')}</p>
      ${wd !== d ? `<p class="tiny muted">${LL('Нічна зміна: вода рахується від підйому о ', 'Night shift: water counts from your wake-up at ')}${k.set.wake}.</p>` : ''}${kHeartNote()}${kWaterRemindHtml()}</div>`;
    const wNow = N.wts.find((x) => x.d === d);
    const weight = `<div class="card"><div class="sp"><b>${LL('Вага', 'Weight')}${isToday ? LL(' сьогодні', ' today') : ''}</b>${N.wMeas ? `<span class="small muted">${LL('середня ', 'average ')}${fmt(BW(N.wMeas))} ${MU('weight')}</span>` : ''}</div>
      <div class="row"><input inputmode="decimal" id="kW" placeholder="${MU('weight')}" value="${wNow ? fmt(MV('weight', wNow.v)) : ''}" style="flex:1"><button type="button" data-act="kWSave">${LL('Зберегти', 'Save')}</button></div>
      ${!N.wMeas && N.wAns ? `<p class="tiny muted">${LL('Поки зважувань немає — норма за вагою з анкети (', 'No weigh-ins yet — your targets use the weight from your questionnaire (')}${fmt(BW(N.wAns))} ${MU('weight')}${LL('). Зважтеся — норма стане точнішою.', '). Weigh yourself and your targets will get more accurate.')}</p>` : ''}
      ${N.tr && N.tr.rate !== null ? (() => { const tr = N.tr, g = nu && nu.guard;
        let adv = ENGINE.foodAdvice(g === 'under' || g === 'floor0' ? Object.assign({}, N.food, { goal: 'maintain' }) : N.food, tr);  // межа безпеки — порада як для підтримки
        if (g === 'floor' && adv.k === 'less') adv = { k: 'w', text: LL('Калорії вже на межі без нагляду лікаря — не зменшуйте їжу: додайте кроки й рух.', 'Your calories are already at the limit without a doctor’s supervision — don’t eat less: add steps and activity.') }; return `<div class="note ${adv.k === 'ok' ? 'ok' : adv.k === 'wait' ? '' : 'w'}" style="margin-top:8px">${LL('<b>За вашою вагою:</b> ', '<b>Based on your weight:</b> ')}${esc(LBT(adv.text))} <span class="tiny muted">(${LL('темп ', 'rate ')}${tr.rate > 0 ? '+' : tr.rate < 0 ? '−' : ''}${fmt(Math.abs(BW(tr.rate)))}${KG(LL(' кг на тиждень', ' kg per week'))})</span></div>`; })() : `<p class="tiny muted">${LL('Зважуйтесь зранку натщесерце. Порада за темпом — після 2 тижнів зважувань.', 'Weigh yourself in the morning before eating. Advice on your rate comes after 2 weeks of weigh-ins.')}</p>`}</div>`;
    const wk = kWeek(d, N);
    app.innerHTML = `${head}${setup}${sum}${tday}${plate}<div class="card">${list}${copy}</div>${gapCard}${water}${weight}${wk}
      <div class="quick"><button type="button" class="sm" data-act="kMine">${LL('Мої продукти й страви', 'My foods and dishes')}</button><button type="button" class="sm" data-act="kSet">${LL('Налаштування кухні', 'Kitchen settings')}</button><button type="button" class="sm" data-act="kAbout">${LL('Як рахує кухня', 'How the kitchen counts')}</button></div>`;
    tourMaybe('kitchen');
  }
  function kBar(label, v, lo, hi, unit) {
    const f = hi ? Math.min(1, v / hi) : 0, ok = lo && v >= lo;
    return `<div class="sp small"><span>${label}</span><span class="muted">${fmt(v)}${lo ? LL(' з ', ' of ') + lo + '–' + hi : ''}${unit}</span></div><div class="kbar"><i style="width:${Math.round(f * 100)}%"${ok ? ' class="ok"' : ''}></i></div>`;
  }
  /* тиждень: дні з записами, середні калорії й білок на ці дні — проти норми */
  function kWeek(d, N) {
    const days = Array.from({ length: 7 }, (_, j) => iso(new Date(tms(d) - j * 864e5))).filter((x) => kday(x).items.length);
    if (days.length < 2 || !N.nu) return '';
    const sx = ksex(), t = days.map((x) => KITCHEN.dayTotals(kday(x), sx, kctx()));
    const ak = Math.round(t.reduce((a, x) => a + x.kcal, 0) / t.length), ap = Math.round(t.reduce((a, x) => a + x.p, 0) / t.length);
    return `<div class="card"><div class="sp"><b>${LL('Тиждень', 'This week')}</b><span class="small muted">${LL('записано днів: ', 'days logged: ')}${days.length}${LL(' з 7', ' of 7')}</span></div>
      <p class="small">${LL('У середньому ', 'Average ')}${ak}${LL(' ккал (норма ', ' kcal (target ')}${N.nu.kLo}–${N.nu.kHi}${LL('), білок ', '), protein ')}${ap}${LL(' г (норма ', ' g (target ')}${N.nu.pLo}–${N.nu.pHi}${LL(').', ').')}</p>
      <p class="tiny muted">${LL('Середні — лише за дні з записами. Записуйте якомога більше днів: так і порада за вагою точніша.', 'Averages use only the days you logged. Log as many days as you can — the weight-based advice gets more accurate too.')}</p></div>`;
  }
  function kWaterRemindHtml() {
    const k = kit(), on = !!k.set.water;
    if (!pushOk()) return `<p class="tiny muted">${LL('Нагадування про воду — у встановленому застосунку (з іконки на екрані).', 'Water reminders work in the installed app (from the home screen icon).')}</p>`;
    const tt = kWaterTimes(kWaterDay());
    return `<div class="sp" style="margin-top:8px"><span class="small">${LL('Нагадування про воду', 'Water reminders')}</span><button type="button" class="sm${on ? ' done' : ' pri'}" data-act="kWaterRemind">${on ? LL('Увімкнено', 'On') : LL('Увімкнути', 'Turn on')}</button></div>
      ${on ? `<p class="tiny muted">${LL('Сьогодні о ', 'Today at ')}${tt.map((x) => x.t).join(', ')}. ${LL('Зранку — склянка після сну, тепла чи кімнатна, як приємніше. Відмічені склянки — без зайвих нагадувань.', 'In the morning — a glass after you wake up, warm or room temperature, whatever you like. Glasses you’ve logged skip extra reminders.')}</p>` : ''}`;
  }
  /* день води (з 3.20.0, 💡 слово Alexа «Спершу зроби 💡 «день води від підйому» для нічної зміни»): якщо сон закінчується пізніше
     за годинником, ніж підйом (нічна зміна — розклад переходить через північ), день води триває від підйому до наступного підйому: після
     опівночі й до підйому — ще вчорашній. Звичайний розклад — календарний день, як було. Той самий день рахує сервер (push.js waterDay). */
  const kHM = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const kWaterCross = () => { const k = kit(); return kHM(k.set.bed) <= kHM(k.set.wake); };
  const kWaterDay = () => { const n = new Date(); return kWaterCross() && n.getHours() * 60 + n.getMinutes() < kHM(kit().set.wake) ? iso(new Date(tms(today()) - 864e5)) : today(); };
  /* розклад води на день: норма програми, склянка, підйом і сон з налаштувань; у день тренування — ще за 1,5 год до нього (час нагадування про тренування) */
  function kWaterTimes(d) {
    const k = kit(), train = kTrain(d), r = S().remind || {};
    return KITCHEN.waterTimes(k.set.wake, k.set.bed, KITCHEN.waterTarget(ksex(), train), k.set.glass, train && r.on ? (r.time || '18:00') : null);
  }

  /* ---- додати запис: шторка з чотирма способами ---- */
  function kAddOpen(m, edit) {
    ui.kAdd = edit !== undefined ? Object.assign({ mode: 'edit', i: edit }, JSON.parse(JSON.stringify(kday(ui.kDate || today()).items[edit]))) : { mode: 'new', m: m === undefined ? kMealNow() : m, tab: 'food', q: '' };
    if (ui.kAdd.mode === 'edit') ui.kAdd.tab = { food: 'food', my: 'my', dish: 'my', hand: 'hand', quick: 'num' }[ui.kAdd.t] || 'food';
    kAddDraw();
  }
  function kAddDraw() {
    const a = ui.kAdd, meals = kMeals(), k = kit();
    const tabs = [['food', LL('Продукт', 'Food')], ['hand', LL('Руками', 'By hand')], ['num', LL('Цифрами', 'Numbers')], ['my', LL('Мої', 'Mine')]];
    let body = '';
    if (a.tab === 'food' && !a.id) {
      body = `${kPhotoHtml()}<input id="kQ" data-kin="q" placeholder="${LL('Пошук: курка, гречка, банан…', 'Search: chicken, rice, banana…')}" value="${esc(a.q)}" autocomplete="off"><div id="kRes">${kResHtml()}</div>`;
    } else if (a.tab === 'food' || a.tab === 'my') {
      body = kAmountForm();
    } else if (a.tab === 'hand') {
      const W = kHandWhat();
      body = `${KITCHEN.HAND_KEYS.map((h) => `<div class="krow"><div style="flex:1"><div class="small">${kHandName(h, 1)[0].toUpperCase() + kHandName(h, 1).slice(1)}</div><div class="tiny muted">${W[h]}</div></div>
        <div class="row" style="gap:6px"><button type="button" class="sm" data-act="kHand" data-h="${h}" data-v="-0.5" aria-label="${LL('менше', 'less')}">−</button><b style="min-width:28px;text-align:center">${fmt(a[h] || 0)}</b><button type="button" class="sm" data-act="kHand" data-h="${h}" data-v="0.5" aria-label="${LL('більше', 'more')}">+</button></div></div>`).join('')}
        <p class="tiny muted">${LL('Долоня — завтовшки й завширшки як ваша долоня; кулак; жменя — скільки вміщує долоня човником; палець — великий палець. Це орієнтир (Precision Nutrition), не точний підрахунок.', 'Palm — as thick and wide as your palm; fist; cupped hand — what fits in your cupped palm; thumb — your whole thumb. This is an estimate (Precision Nutrition), not an exact count.')}</p>`;
    } else if (a.tab === 'num') {
      body = `<label class="f">${LL('Назва (необовʼязково)', 'Name (optional)')}</label><input id="kNName" data-kin="name" value="${esc(a.name || '')}">
        <div class="grid2"><div><label class="f">${LL('Калорії, ккал', 'Calories, kcal')}</label><input inputmode="decimal" data-kin="kcal" value="${a.kcal === undefined ? '' : esc(a.kcal)}"></div><div><label class="f">${LL('Білок, г', 'Protein, g')}</label><input inputmode="decimal" data-kin="p" value="${a.p === undefined ? '' : esc(a.p)}"></div>
        <div><label class="f">${LL('Жири, г', 'Fat, g')}</label><input inputmode="decimal" data-kin="f" value="${a.f === undefined ? '' : esc(a.f)}"></div><div><label class="f">${LL('Вуглеводи, г', 'Carbs, g')}</label><input inputmode="decimal" data-kin="c" value="${a.c === undefined ? '' : esc(a.c)}"></div></div>
        <p class="tiny muted">${LL('Числа з етикетки на з’їдену порцію.', 'Numbers from the label for the portion you ate.')}</p>`;
    }
    if (a.tab === 'my' && !a.pid && !a.did) {
      const P2 = Object.keys(k.products).map((id) => ['pid', id, k.products[id].name]), D2 = Object.keys(k.dishes).map((id) => ['did', id, k.dishes[id].name]);
      body = `${a.mode === 'new' ? kComboList() : ''}${P2.concat(D2).length ? `<div class="klist">${P2.concat(D2).map(([t, id, n]) => `<button type="button" class="krow" data-act="kPickMy" data-t="${t}" data-id="${id}"><span style="flex:1;text-align:left">${esc(n)}</span><span class="tiny muted">${t === 'did' ? LL('страва', 'dish') : LL('етикетка', 'label')}</span></button>`).join('')}</div>` : Object.keys(k.combos).length ? '' : `<p class="small muted">${LL('Тут будуть ваші продукти з етикеток і страви за рецептом.', 'Your foods from labels and your recipes will appear here.')}</p>`}
        <div class="row"><button type="button" style="flex:1" data-act="kNewProd">${LL('+ Продукт з етикетки', '+ Food from a label')}</button><button type="button" style="flex:1" data-act="kNewDish">${LL('+ Страва за рецептом', '+ Recipe')}</button></div>`;
    }
    const pv = kPreview();
    openSheet(`<div class="sp"><b>${a.mode === 'edit' ? LL('Змінити запис', 'Edit entry') : LL('Додати', 'Add')}</b><select data-kin="m" aria-label="${LL('прийом їжі', 'meal')}">${meals.map((n, mi) => `<option value="${mi}"${Math.min(a.m || 0, meals.length - 1) === mi ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      ${a.mode === 'edit' ? '' : `<div class="seg" style="margin:8px 0">${tabs.map(([t, l]) => `<button type="button" class="${a.tab === t ? 'on' : ''}" data-act="kTab" data-v="${t}">${l}</button>`).join('')}</div>`}
      <div id="kBody">${body}</div><div id="kPv">${pv}</div>
      ${(a.tab === 'food' && a.id) || ((a.tab === 'my') && (a.pid || a.did)) || a.tab === 'hand' || a.tab === 'num' ? `<div class="row" style="margin-top:10px">${a.mode === 'edit' ? `<button type="button" class="ghost" data-act="kDel">${LL('Видалити', 'Delete')}</button>` : `<button type="button" class="ghost" data-act="kBack">${LL('Назад', 'Back')}</button>`}<button type="button" class="pri" style="flex:1" data-act="kSave">${a.mode === 'edit' ? LL('Зберегти', 'Save') : LL('Додати', 'Add')}</button></div>` : ''}`);
    const q = document.getElementById('kQ'); if (q && a.tab === 'food' && !a.id && !(a.ph && a.ph.st)) setTimeout(() => { try { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } catch (e) { /* немає */ } }, 60);
  }
  /* результати пошуку (оновлюються без перемальовування шторки — клавіатура на iPhone не злітає); калорії — на 100 г кожного стану */
  function kResHtml() {
    const a = ui.kAdd, res = a.q ? KITCHEN.search(a.q, I18N.lang).slice(0, 30) : kRecentFoods();
    const kc = (it) => it.v.map((v) => (it.v.length > 1 ? KSTATE()[v.s] + ' ' : '') + v.kcal).join(' · ');  // 💡2: калорії кожного стану — з назвою стану
    return `${a.q ? '' : `<div class="tiny muted" style="margin:8px 0 4px">${res.length ? LL('Нещодавні', 'Recent') : LL('Почніть вводити назву', 'Start typing a name')}</div>`}
      <div class="klist">${res.map((it) => `<button type="button" class="krow" data-act="kPick" data-id="${it.id}"><span style="flex:1;text-align:left">${esc(I18N.lang === 'en' ? it.en : it.uk)}</span><span class="tiny muted">${kc(it)}${LL(' ккал/100 г', ' kcal/100 g')}</span></button>`).join('')}</div>
      ${a.q && !res.length ? `<p class="small muted">${LL('Немає в базі. Додайте як «Мій продукт» з етикетки.', 'Not in the database. Add it as “My food” from the label.')}</p><button type="button" class="wide" data-act="kNewProd">${LL('+ Мій продукт з етикетки', '+ My food from a label')}</button>` : ''}`;
  }
  /* фото тарілки (з 3.20.0): сервер лише впізнає продукти бази (без ваги й калорій); кожен людина відкриває звичайною формою —
     стан і кількість вказує сама, склад — з бази USDA. Фото не зберігається ні в телефоні, ні на сервері застосунку. */
  function kPhotoHtml() {
    const a = ui.kAdd, ph = a.ph;
    if (a.mode !== 'new') return '';
    const btn = (t) => `<button type="button" class="wide kph" data-act="kPhoto">${ICON.cam}${t}</button><input id="kPhIn" type="file" accept="image/*" hidden>`;
    if (!ph) return btn(LL('Продукти з фото тарілки', 'Foods from a photo of your plate'));
    if (ph.st === 'wait') return `<p class="small muted" data-kph aria-live="polite">${LL('Шукаю на фото продукти з бази… (до пів хвилини)', 'Looking for database foods in the photo… (up to 30 seconds)')}</p>`;
    if (ph.st === 'err') return `<div class="note w">${esc(ph.msg)}</div>${btn(LL('Інше фото', 'Another photo'))}`;
    return `<div class="card"><b>${LL('На фото', 'In the photo')}</b><p class="tiny muted">${LL('Торкніться продукту й вкажіть стан і кількість. Фото лише підказує, що на тарілці; склад — з бази USDA.', 'Tap a food and enter its state and amount. The photo only suggests what’s on the plate; composition comes from the USDA database.')}</p>
      ${ph.items.length ? `<div class="klist">${ph.items.map((x, j) => `<button type="button" class="krow" data-act="kPhPick" data-j="${j}"><span style="flex:1;text-align:left">${x.done ? '✓ ' : ''}${esc(kName({ t: 'food', id: x.id }))}</span><span class="tiny muted">${x.done ? LL('додано', 'added') : x.sure === 'low' ? LL('можливо', 'maybe') : ''}</span></button>`).join('')}</div>`
        : `<p class="small muted">${LL('Продуктів з бази на фото не знайшов — знайдіть пошуком нижче.', 'No database foods found in the photo — search below.')}</p>`}
      <p class="tiny muted">${LL('Фото надсилається лише для розпізнавання (Gemini) і не зберігається ні в телефоні, ні на сервері застосунку.', 'The photo is sent only for recognition (Gemini) and isn’t stored on your phone or on the app’s server.')}</p></div>${btn(LL('Інше фото', 'Another photo'))}`;
  }
  async function kPhotoLoad(file) {
    const a = ui.kAdd; if (!a) return;
    const ph = a.ph = { st: 'wait' }; kAddDraw();
    const live = () => ui.kAdd === a && a.ph === ph && document.body.classList.contains('sheet') && sheetEl.querySelector('[data-kph]');
    let img = null; try { img = await jpegOf(file); } catch (e) { img = null; }
    const j = img ? await post('/food', { image: img.b64, lang: I18N.lang }, 40000) : null;  // сервер: до 3 моделей × 8 с + передача фото (живий замір 23.10 — 26,7 с у пік)
    if (!live()) return;  // шторку закрили чи відкрили іншу — нічого не малюємо
    a.ph = kPhotoResult(img, j);
    kAddDraw();
  }
  /* відповідь сервера → список: лише продукти бази застосунку; помилка — пояснення й пошук */
  function kPhotoResult(img, j) {
    if (!img) return { st: 'err', msg: LL('Не вдалося відкрити фото — спробуйте інше.', 'Couldn’t open the photo — try another one.') };
    if (j && Array.isArray(j.items)) return { st: 'ok', items: j.items.filter((x) => x && KITCHEN.item(x.id)).map((x) => ({ id: x.id, sure: x.sure === 'high' ? 'high' : 'low' })).sort((x, y) => (x.sure === 'low') - (y.sure === 'low')) };  // «можливо» — унизу (💡, слово Alexа 23.10: «Приймаю»)
    return { st: 'err', msg: !j && navigator.onLine === false ? LL('Немає інтернету — фото розпізнається лише онлайн. Знайдіть продукт пошуком.', 'No internet — photos are recognized online only. Search for the food instead.') : LL('Розпізнавання зараз недоступне — знайдіть продукт пошуком.', 'Recognition is unavailable right now — search for the food instead.') };
  }
  /* нещодавні продукти бази (останні 12 різних) */
  function kRecentFoods() { const seen = {}; return kit().recent.filter((r) => r.t === 'food' && !seen[r.id] && (seen[r.id] = 1)).slice(0, 12).map((r) => KITCHEN.item(r.id)).filter(Boolean); }
  /* кількість: стан (💡2 — суха чи варена, з калоріями на 100 г кожного), грами (точно) або мірка (швидко) */
  function kAmountForm() {
    const a = ui.kAdd, k = kit();
    let st = '', ms = [], name = '', per = null;
    if (a.t === 'food' || (a.tab === 'food' && a.id)) {
      const it = KITCHEN.item(a.id); name = I18N.lang === 'en' ? it.en : it.uk;
      if (it.v.length > 1) {
        st = `<div class="tiny muted" style="margin:8px 0 4px">${LL('Як важите — так і обирайте: суху крупу чи сире мʼясо — «сухий» / «сирий», уже приготоване — «готовий».', 'Pick how you weigh it: dry grains or raw meat — “dry” / “raw”; already cooked — “cooked”.')}</div>
          <div class="seg">${it.v.map((v) => `<button type="button" class="${a.s === v.s ? 'on' : ''}" data-act="kState" data-v="${v.s}">${KSTATE()[v.s]}<span class="tiny" style="display:block;opacity:.8">${v.kcal}${LL(' ккал/100 г', ' kcal/100 g')}</span></button>`).join('')}</div>`;
      }
      per = a.s !== undefined || it.v.length === 1 ? KITCHEN.variant(a.id, a.s) : null; ms = per ? kMeasList() : [];
      if (!per) return `<div class="small" style="margin-top:4px"><b>${esc(name)}</b></div>${st}`;
    } else if (a.pid) { const pr = k.products[a.pid]; name = pr ? pr.name : a.nm || '?'; per = a.mode === 'edit' && a.x ? a.x : pr ? pr.per100 : null; }  // запис дня — зі своїм знімком складу
    else if (a.did) { const dd = k.dishes[a.did]; name = dd ? dd.name : a.nm || '?'; per = a.mode === 'edit' && a.x ? a.x : dd ? dd.per100 : null; }
    if (!per) return '';
    const how = a.how || 'g';
    return `<div class="small" style="margin-top:4px"><b>${esc(name)}</b> <span class="tiny muted">${LL('на 100 г: ', 'per 100 g: ')}${Math.round(per.kcal)}${LL(' ккал · білок ', ' kcal · protein ')}${fmt(per.p)}${LL(' г', ' g')}</span></div>${st}
      ${ms.length ? `<div class="seg" style="margin:8px 0"><button type="button" class="${how === 'g' ? 'on' : ''}" data-act="kHow" data-v="g">${LL('Точно, г', 'Exact, g')}</button><button type="button" class="${how === 'm' ? 'on' : ''}" data-act="kHow" data-v="m">${LL('Швидко: мірка', 'Quick: measure')}</button></div>` : ''}
      ${how === 'm' && ms.length ? `<div class="pick">${ms.map((m, j) => `<button type="button" class="qopt${a.mi === j ? ' on' : ''}" data-act="kMeas" data-j="${j}"><b>${esc(m.l)}</b><span class="small muted">${fmt(m.g)}${LL(' г', ' g')}</span></button>`).join('')}</div>
        <div class="row" style="margin-top:8px"><span class="small" style="flex:1">${LL('Скільки', 'How many')}</span><button type="button" class="sm" data-act="kMq" data-v="-0.5" aria-label="${LL('менше', 'less')}">−</button><b style="min-width:30px;text-align:center">${fmt(a.mq || 1)}</b><button type="button" class="sm" data-act="kMq" data-v="0.5" aria-label="${LL('більше', 'more')}">+</button></div>`
        : `<label class="f">${LL('Вага, г', 'Weight, g')}</label><input inputmode="decimal" id="kG" data-kin="g" value="${a.g ? fmt(a.g) : ''}" placeholder="${LL('напр. 150', 'e.g. 150')}">`}`;
  }
  /* запис з поточного стану шторки (або null, якщо даних замало) */
  function kEntry() {
    const a = ui.kAdd, k = kit(); let e = null;
    if (a.tab === 'hand') { e = { t: 'hand' }; KITCHEN.HAND_KEYS.forEach((h) => { if (a[h] > 0) e[h] = a[h]; }); if (Object.keys(e).length === 1) return null; }
    else if (a.tab === 'num') { const kc = num(a.kcal), pp = num(a.p); if (kc === null || kc < 0 || kc > 5000) return null; e = { t: 'quick', kcal: kc, p: pp === null ? 0 : pp, f: num(a.f) || 0, c: num(a.c) || 0 }; if (a.name) e.name = String(a.name).slice(0, 60); if (e.p < 0 || e.p > 300 || e.f < 0 || e.f > 300 || e.c < 0 || e.c > 1000) return null;
      if (kQuickOver(e)) return null; }
    else {
      if (a.id && KITCHEN.needsState(a.id) && a.s === undefined) return null;  // 💡2: «сирий / готовий / сухий» — лише свідомим вибором
      const base = a.id ? { t: 'food', id: a.id, s: a.s } : a.pid ? { t: 'my', pid: a.pid } : a.did ? { t: 'dish', did: a.did } : null;
      if (!base) return null;
      if ((a.how || 'g') === 'm') {
        const ms = kMeasList(); const m = ms[a.mi]; if (!m) return null;
        const q = a.mq || 1; e = Object.assign(base, { how: 'm', g: Math.round(m.g * q * 10) / 10, ml: fmt(q) + ' × ' + m.l, mi: a.mi, mq: q });
      } else { const g = num(a.g); if (g === null || !(g > 0) || g > 3000) return null; e = Object.assign(base, { how: 'g', g }); }
      if (e.t === 'my' && !k.products[e.pid] && !(a.mode === 'edit' && a.x)) return null;
      if (e.t === 'dish' && !k.dishes[e.did] && !(a.mode === 'edit' && a.x)) return null;
      if (a.mode === 'edit' && a.x && (e.t === 'my' || e.t === 'dish')) { e.x = a.x; if (a.dq) e.dq = a.dq; }  // правка ваги — склад запису той самий, що був
    }
    e.m = Math.min(Number(a.m) || 0, kMeals().length - 1);
    return e;
  }
  /* цифри з етикетки: білок, жири й вуглеводи не можуть дати більше калорій, ніж указано (4·Б + 4·В + 9·Ж, допуск 25 % і 20 ккал) */
  const kQuickOver = (e) => 4 * e.p + 4 * e.c + 9 * e.f > e.kcal * 1.25 + 20;
  function kMeasList() { const a = ui.kAdd; return a.id ? kMeasOf(a.id, a.s) : []; }
  function kMeasOf(id, s) {
    const v = KITCHEN.variant(id, s); if (!v) return [];
    let ms = (v.m || []).map((m) => ({ l: I18N.lang === 'en' ? m[1] : m[0], g: m[2] }));
    if (v.gml) ms = ms.concat([100, 250, 330, 500].map((ml) => ({ l: ml + LL(' мл', ' ml'), g: Math.round(ml * v.gml * 10) / 10 })));
    return ms;
  }
  function kPreview() {
    const e = kEntry(); if (!e) return '';
    const m = KITCHEN.macros(e, ksex(), kctx()); if (!m) return '';
    return `<div class="note" style="margin-top:10px"><b>${m.kcal}${LL(' ккал', ' kcal')}</b> · ${LL('білок ', 'protein ')}${fmt(m.p)}${LL(' г · жири ', ' g · fat ')}${fmt(m.f)}${LL(' г · вуглеводи ', ' g · carbs ')}${fmt(m.c)}${LL(' г', ' g')} <span class="kq ${m.q}">${KQ()[m.q]}</span></div>`;
  }
  function kSave() {
    const a = ui.kAdd, e = kEntry();
    if (!e) { const qn = a.tab === 'num' ? { kcal: num(a.kcal) || 0, p: num(a.p) || 0, f: num(a.f) || 0, c: num(a.c) || 0 } : null;
      toast(qn && num(a.kcal) !== null && kQuickOver(qn) ? LL('Білок, жири й вуглеводи дають більше калорій, ніж указано, — перевірте числа', 'Protein, fat, and carbs add up to more calories than entered — check the numbers') : a.tab === 'num' ? LL('Вкажіть калорії (0–5000) і білок (0–300 г)', 'Enter calories (0–5000) and protein (0–300 g)') : a.id && KITCHEN.needsState(a.id) && a.s === undefined ? LL('Оберіть: сирий, готовий чи сухий', 'Choose: raw, cooked, or dry') : (a.how || 'g') === 'm' ? LL('Оберіть мірку', 'Choose a measure') : LL('Вкажіть вагу: від 1 г до 3 кг', 'Enter a weight: 1 g to 3 kg')); return; }
    const d = ui.kDate || today(), day = kdayW(d), k = kit();
    /* склад і назва — у запис: правка чи видалення етикетки або рецепта не міняє минулих днів; у правці запису — той самий знімок */
    if (e.t === 'my') { if (!e.x) e.x = Object.assign({}, k.products[e.pid].per100); e.nm = k.products[e.pid] ? k.products[e.pid].name : a.nm; }
    if (e.t === 'dish') { if (!e.x) { e.x = Object.assign({}, k.dishes[e.did].per100); e.dq = k.dishes[e.did].q; } e.nm = k.dishes[e.did] ? k.dishes[e.did].name : a.nm; }
    e.at = a.mode === 'edit' ? (day.items[a.i] || {}).at || Date.now() : Date.now();
    if (a.mode === 'edit') day.items[a.i] = e; else day.items.push(e);
    if (e.t === 'food') { const k = kit(); k.recent = [{ t: 'food', id: e.id, s: e.s }].concat(k.recent.filter((r) => !(r.t === 'food' && r.id === e.id))).slice(0, 30); }
    save(); haptic(); rKitchen();
    if (a.mode === 'new' && a.ph && a.ph.st === 'ok') {
      if (a.phj !== undefined && a.ph.items[a.phj]) a.ph.items[a.phj].done = true;
      if (a.ph.items.some((x) => !x.done)) { ui.kAdd = { mode: 'new', m: a.m, tab: 'food', q: '', ph: a.ph }; toast(LL('Додано', 'Added')); return kAddDraw(); }
    }
    closeSheet();
  }

  /* мій продукт з етикетки: на 100 г; страва за рецептом (💡1): інгредієнти сирими/сухими + вага готової страви */
  function kNewProd(edit) {
    const pr = edit ? kit().products[edit] : null;
    ui.kProd = { id: edit || null, back: !!sheetEl.querySelector('#kBody') };  // відкрито зі шторки «Додати» — після збереження туди й повертаємось
    openSheet(`<b>${LL('Продукт з етикетки', 'Food from a label')}</b><p class="small muted">${LL('Перепишіть з упаковки значення «на 100 г».', 'Copy the “per 100 g” values from the package.')}</p>
      <label class="f">${LL('Назва', 'Name')}</label><input id="kpN" value="${pr ? esc(pr.name) : ''}" placeholder="${LL('напр. Сир кисломолочний 5 %', 'e.g. Cottage cheese 5%')}">
      <div class="grid2"><div><label class="f">${LL('Калорії, ккал', 'Calories, kcal')}</label><input inputmode="decimal" id="kpK" value="${pr ? fmt(pr.per100.kcal) : ''}"></div><div><label class="f">${LL('Білок, г', 'Protein, g')}</label><input inputmode="decimal" id="kpP" value="${pr ? fmt(pr.per100.p) : ''}"></div>
      <div><label class="f">${LL('Жири, г', 'Fat, g')}</label><input inputmode="decimal" id="kpF" value="${pr ? fmt(pr.per100.f) : ''}"></div><div><label class="f">${LL('Вуглеводи, г', 'Carbs, g')}</label><input inputmode="decimal" id="kpC" value="${pr ? fmt(pr.per100.c) : ''}"></div></div>
      <div class="row" style="margin-top:10px">${edit ? `<button type="button" class="ghost" data-act="kProdDel">${LL('Видалити', 'Delete')}</button>` : ''}<button type="button" class="pri" style="flex:1" data-act="kProdSave">${LL('Зберегти', 'Save')}</button></div>`);
  }
  function kProdSave() {
    const g = (id) => num(document.getElementById(id).value), name = document.getElementById('kpN').value.trim().slice(0, 60);
    const x = { kcal: g('kpK'), p: g('kpP'), f: g('kpF') || 0, c: g('kpC') || 0, fib: 0 };
    /* перевірка етикетки: числа в межах, а білок, жири й вуглеводи не важать більше за 100 г, і калорії сходяться з ними (4·Б + 4·В + 9·Ж ± 25 %, але щонайменше ± 20 ккал) */
    if (!name || x.kcal === null || x.p === null || x.kcal < 0 || x.kcal > 900 || x.p < 0 || x.f < 0 || x.c < 0 || x.p + x.f + x.c > 100.5) { toast(LL('Перевірте назву й числа на 100 г', 'Check the name and the per-100 g numbers')); return; }
    const calc = 4 * x.p + 4 * x.c + 9 * x.f;
    if ((x.f || x.c) && Math.abs(calc - x.kcal) > Math.max(20, x.kcal * 0.25) && !confirm(LL('Калорії не сходяться з білками, жирами й вуглеводами (≈ ', 'The calories don’t match protein, fat and carbs (≈ ') + Math.round(calc) + LL(' ккал). Все одно зберегти?', ' kcal). Save anyway?'))) return;
    const k = kit(), id = ui.kProd.id || 'p' + Date.now().toString(36);
    k.products[id] = { name, per100: x };
    save(); closeSheet(); toast(LL('Збережено', 'Saved'));
    if (ui.kProd.back && ui.kAdd && view === 'kitchen') { ui.kAdd = Object.assign(ui.kAdd, { tab: 'my', pid: id, did: null, how: 'g' }); return kAddDraw(); }
    return rKitchen();
  }
  function kNewDish(edit) {
    const dd = edit ? kit().dishes[edit] : null;
    const back = !!sheetEl.querySelector('#kBody');  // відкрито зі шторки «Додати»
    ui.kDish = dd ? { id: edit, name: dd.name, ings: JSON.parse(JSON.stringify(dd.ings)), cooked: dd.cooked, q: '', back } : { id: null, name: '', ings: [], cooked: null, q: '', back };
    kDishDraw();
  }
  function kDishDraw() {
    const D2 = ui.kDish, sx = ksex(), r = KITCHEN.recipe(D2.ings, D2.cooked, sx, kctx());
    openSheet(`<b>${LL('Страва за рецептом', 'Recipe')}</b><p class="small muted">${LL('Зважте кожен інгредієнт сирим чи сухим, потім — усю готову страву. Склад на 100 г = склад інгредієнтів ÷ вага готової.', 'Weigh each ingredient raw or dry, then the whole finished dish. Per 100 g = ingredients ÷ cooked weight.')}</p>
      <label class="f">${LL('Назва', 'Name')}</label><input id="kdN" data-kin="dname" value="${esc(D2.name)}" placeholder="${LL('напр. Борщ', 'e.g. Chili')}">
      ${D2.ings.map((e, j) => { const m = KITCHEN.macros(e, sx, kctx()); return `<div class="krow"><div style="flex:1;min-width:0"><div class="small">${esc(kName(e))}</div><div class="tiny muted">${fmt(e.g)}${LL(' г · ', ' g · ')}${m ? m.kcal : '—'}${LL(' ккал', ' kcal')}</div></div><button type="button" class="sm ghost" data-act="kIngDel" data-j="${j}" aria-label="${LL('прибрати', 'remove')}">✕</button></div>`; }).join('')}
      ${D2.pick ? `<div class="small" style="margin-top:6px"><b>${esc(kName(D2.pick))}</b></div><div class="row"><input inputmode="decimal" id="kdG" placeholder="${LL('грами (сирим чи сухим)', 'grams (raw or dry)')}" style="flex:1"><button type="button" data-act="kIngAdd">${LL('Додати', 'Add')}</button></div>`
        : `<input id="kdQ" data-kin="dq" placeholder="${LL('+ інгредієнт: пошук', '+ ingredient: search')}" value="${esc(D2.q)}" autocomplete="off"><div id="kdRes">${kDishResHtml()}</div>`}
      <label class="f">${LL('Вага готової страви, г', 'Cooked weight of the whole dish, g')}</label><input inputmode="decimal" data-kin="cooked" value="${D2.cooked ? fmt(D2.cooked) : ''}">
      <div id="kdPv">${kDishPv(r)}</div>
      <div class="row" style="margin-top:10px">${D2.id ? `<button type="button" class="ghost" data-act="kDishDel">${LL('Видалити', 'Delete')}</button>` : ''}<button type="button" class="pri" style="flex:1" data-act="kDishSave">${LL('Зберегти страву', 'Save recipe')}</button></div>`);
  }
  function kDishResHtml() {
    const D2 = ui.kDish; if (!D2.q) return '';
    const q = D2.q.toLowerCase(), mine = Object.keys(kit().products).filter((id) => kit().products[id].name.toLowerCase().indexOf(q) >= 0);
    const res = KITCHEN.search(D2.q, I18N.lang).slice(0, 8);
    return `<div class="klist">${mine.map((id) => `<button type="button" class="krow" data-act="kIngPick" data-pid="${id}"><span style="flex:1;text-align:left">${esc(kit().products[id].name)}</span><span class="tiny muted">${LL('етикетка', 'label')}</span></button>`).join('')}
      ${res.map((it) => it.v.map((v) => `<button type="button" class="krow" data-act="kIngPick" data-id="${it.id}" data-s="${v.s}"><span style="flex:1;text-align:left">${esc(I18N.lang === 'en' ? it.en : it.uk)}${it.v.length > 1 ? ', ' + KSTATE_IN()[v.s] : ''}</span><span class="tiny muted">${v.kcal}${LL(' ккал/100 г', ' kcal/100 g')}</span></button>`).join('')).join('')}</div>`;
  }
  const kDishPv = (r) => (r ? `<div class="note">${LL('На 100 г: ', 'Per 100 g: ')}<b>${r.per100.kcal}${LL(' ккал', ' kcal')}</b> · ${LL('білок ', 'protein ')}${fmt(r.per100.p)}${LL(' г · жири ', ' g · fat ')}${fmt(r.per100.f)}${LL(' г · вуглеводи ', ' g · carbs ')}${fmt(r.per100.c)}${LL(' г', ' g')} <span class="kq ${r.q}">${KQ()[r.q]}</span></div>` : '');
  /* поле шторки кухні змінилось — лише стан і потрібний шматок, без перемальовування (фокус і клавіатура лишаються) */
  function kInput(el) {
    const f = el.dataset.kin, v = el.value;
    if (ui.kDish && document.getElementById('kdN')) {
      if (f === 'dname') ui.kDish.name = v;
      if (f === 'dq') { ui.kDish.q = v; const r = document.getElementById('kdRes'); if (r) r.innerHTML = kDishResHtml(); }
      if (f === 'cooked') { ui.kDish.cooked = num(v); const pv = document.getElementById('kdPv'); if (pv) pv.innerHTML = kDishPv(KITCHEN.recipe(ui.kDish.ings, ui.kDish.cooked, ksex(), kctx())); }
      return;
    }
    const a = ui.kAdd; if (!a) return;
    if (f === 'q') { a.q = v; const r = document.getElementById('kRes'); if (r) r.innerHTML = kResHtml(); return; }
    if (f === 'm') a.m = Number(v); else a[f] = v;
    const pv = document.getElementById('kPv'); if (pv) pv.innerHTML = kPreview();
  }
  function kDishSave() {
    const D2 = ui.kDish, r = KITCHEN.recipe(D2.ings, D2.cooked, ksex(), kctx());
    if (!D2.name.trim() || !r) { toast(LL('Вкажіть назву, інгредієнти й вагу готової страви', 'Enter a name, ingredients, and the cooked weight')); return; }
    if (D2.cooked < 10 || D2.cooked > 20000) { toast(LL('Вага готової страви — від 10 г до 20 кг', 'Cooked weight — 10 g to 20 kg')); return; }
    const k = kit(), id = D2.id || 'd' + Date.now().toString(36);
    k.dishes[id] = { name: D2.name.trim().slice(0, 60), ings: D2.ings, cooked: D2.cooked, per100: r.per100, q: r.q };
    save(); closeSheet(); toast(LL('Збережено', 'Saved'));
    if (D2.back && ui.kAdd && view === 'kitchen') { ui.kAdd = Object.assign(ui.kAdd, { tab: 'my', did: id, pid: null, how: 'g' }); return kAddDraw(); }
    return rKitchen();
  }
  /* збережені прийоми (з 3.20.0, ідея Джарвіса, слово Alexа «зберегти прийом як страву»): набір записів одного прийому під назвою;
     додається одним дотиком у вибраний прийом. Склад своїх продуктів і страв — знімком на час збереження (як у записі дня). */
  const kComboTot = (c) => KITCHEN.dayTotals({ items: c.items }, ksex(), kctx());
  function kComboList() {
    const k = kit(), C = Object.keys(k.combos);
    if (!C.length) return '';
    return `<p class="tiny muted" style="margin:0 0 4px">${LL('Збережені прийоми — одним дотиком', 'Saved meals — one tap')}</p><div class="klist">${C.map((id) => { const c = k.combos[id], t = kComboTot(c);
      return `<div class="krow"><div style="flex:1;min-width:0"><div class="small">${esc(c.name)}</div><div class="tiny muted">${plural(c.items.length, LL('продукт', 'item'), LL('продукти', 'items'), LL('продуктів', 'items'))} · ${t.kcal}${LL(' ккал · білок ', ' kcal · protein ')}${fmt(t.p)}${LL(' г', ' g')}</div></div><button type="button" class="sm" data-act="kComboAdd" data-id="${id}" aria-label="${LL('додати прийом', 'add meal')}">+</button></div>`; }).join('')}</div>`;
  }
  function kCombo(mi) {
    const d = ui.kDate || today(), meals = kMeals(), its = kday(d).items.filter((e) => Math.min(e.m || 0, meals.length - 1) === mi);
    if (its.length < 2) return;
    const k = kit(), items = its.map((e) => { const c = JSON.parse(JSON.stringify(e)); delete c.at; delete c.m;
      if (c.t === 'my' && !c.x && k.products[c.pid]) c.x = Object.assign({}, k.products[c.pid].per100);
      if (c.t === 'dish' && !c.x && k.dishes[c.did]) c.x = Object.assign({}, k.dishes[c.did].per100);
      if ((c.t === 'my' || c.t === 'dish') && !c.nm) c.nm = kName(c);
      return c; }).filter((c) => KITCHEN.macros(c, ksex(), kctx()));
    /* назва за замовчуванням — лише назви продуктів (без стану й без «Руками» / «Цифрами з етикетки»); немає — назва прийому */
    const base = (e) => { const it = e.t === 'food' ? KITCHEN.item(e.id) : null; return it ? (I18N.lang === 'en' ? it.en : it.uk) : e.t === 'my' || e.t === 'dish' ? kName(e) : e.t === 'quick' && e.name ? e.name : ''; };
    const nm = [...new Set(items.map(base).filter(Boolean))].join(', ') || meals[mi];
    ui.kCombo = { items };
    const t = kComboTot({ items });
    openSheet(`<b>${LL('Зберегти прийом', 'Save meal')}</b><p class="small muted">${plural(items.length, LL('продукт', 'item'), LL('продукти', 'items'), LL('продуктів', 'items'))}${LL(' · ', ' · ')}${t.kcal}${LL(' ккал · білок ', ' kcal · protein ')}${fmt(t.p)}${LL(' г. Наступного разу — одним дотиком у «Мої».', ' g. Next time — one tap in Mine.')}</p>
      <label class="f">${LL('Назва', 'Name')}</label><input id="kcN" maxlength="40" value="${esc(nm.length > 40 ? nm.slice(0, 39) + '…' : nm)}">
      <div class="klist" style="margin-top:8px">${items.map((e) => `<div class="krow"><span class="small" style="flex:1">${esc(kName(e))}</span><span class="tiny muted">${esc(kAmount(e))}</span></div>`).join('')}</div>
      <button type="button" class="pri wide" style="margin-top:10px" data-act="kComboSave">${LL('Зберегти', 'Save')}</button>`);
  }
  function kComboSave() {
    const name = (document.getElementById('kcN').value || '').trim().slice(0, 40);
    if (!name) return toast(LL('Дайте назву прийому', 'Give the meal a name'));
    const k = kit(); k.combos['c' + Date.now().toString(36)] = { name, items: ui.kCombo.items }; save(); closeSheet();
    toast(LL('Прийом збережено — він у «Мої»', 'Meal saved — find it in Mine')); return rKitchen();
  }
  function kComboAdd(id) {
    const k = kit(), c = k.combos[id]; if (!c || !ui.kAdd) return;
    const day = kdayW(ui.kDate || today()), m = Math.min(ui.kAdd.m || 0, kMeals().length - 1);
    c.items.forEach((e) => day.items.push(Object.assign(JSON.parse(JSON.stringify(e)), { m, at: Date.now() })));
    save(); closeSheet(); toast(LL('Додано: ', 'Added: ') + c.name); return rKitchen();
  }
  function kMine() {
    const k = kit(), P2 = Object.keys(k.products), D2 = Object.keys(k.dishes);
    const C2 = Object.keys(k.combos);
    openSheet(`<b>${LL('Мої продукти й страви', 'My foods and dishes')}</b>
      ${C2.length ? `<p class="tiny muted" style="margin:6px 0 4px">${LL('Збережені прийоми', 'Saved meals')}</p><div class="klist">${C2.map((id) => { const t = kComboTot(k.combos[id]); return `<div class="krow"><div style="flex:1;min-width:0"><div class="small">${esc(k.combos[id].name)}</div><div class="tiny muted">${plural(k.combos[id].items.length, LL('продукт', 'item'), LL('продукти', 'items'), LL('продуктів', 'items'))} · ${t.kcal}${LL(' ккал', ' kcal')}</div></div><button type="button" class="sm ghost" data-act="kComboDel" data-id="${id}" aria-label="${LL('видалити прийом', 'delete meal')}">✕</button></div>`; }).join('')}</div>` : ''}
      ${P2.length || D2.length ? `<div class="klist">${P2.map((id) => `<button type="button" class="krow" data-act="kProdEdit" data-id="${id}"><span style="flex:1;text-align:left">${esc(k.products[id].name)}</span><span class="tiny muted">${Math.round(k.products[id].per100.kcal)}${LL(' ккал/100 г', ' kcal/100 g')}</span></button>`).join('')}
        ${D2.map((id) => `<button type="button" class="krow" data-act="kDishEdit" data-id="${id}"><span style="flex:1;text-align:left">${esc(k.dishes[id].name)}</span><span class="tiny muted">${Math.round(k.dishes[id].per100.kcal)}${LL(' ккал/100 г', ' kcal/100 g')}</span></button>`).join('')}</div>` : C2.length ? '' : `<p class="small muted">${LL('Поки порожньо.', 'Nothing here yet.')}</p>`}
      <div class="row"><button type="button" style="flex:1" data-act="kNewProd">${LL('+ Продукт з етикетки', '+ Food from a label')}</button><button type="button" style="flex:1" data-act="kNewDish">${LL('+ Страва за рецептом', '+ Recipe')}</button></div>`);
  }
  function kSettings() {
    const p = P(), k = kit(), me = p.me || {}, food = G().food;
    openSheet(`<b>${LL('Налаштування кухні', 'Kitchen settings')}</b>
      <div class="grid2"><div><label class="f">${isLb() ? LL('Зріст, дюймів', 'Height, in') : LL('Зріст, см', 'Height, cm')}</label><input inputmode="numeric" id="meH"${isLb() ? ` data-tip="${esc(LL('Ваш зріст у дюймах — потрібен для розрахунку калорій.', 'Your height in inches — needed to calculate calories.'))}"` : ''} value="${me.height ? HD(me.height) : ''}"></div><div><label class="f">${LL('Вік, років', 'Age, years')}</label><input inputmode="numeric" id="meA" value="${me.age || ''}"></div></div>
      ${food.basis === 'target' ? `<label class="f">${KG(LL('Цільова вага, кг (для білка; порожньо — від поточної ваги)', 'Target weight, kg (for protein; leave blank to use your current weight)'))}</label><input inputmode="decimal" id="meT" value="${me.target ? BW(me.target) : ''}">` : ''}
      <label class="f">${LL('Прийомів їжі на день', 'Meals per day')}</label><div class="seg">${[3, 4, 5].map((n) => `<button type="button" class="${k.set.meals === n ? 'on' : ''}" data-act="kSetMeals" data-v="${n}">${n}</button>`).join('')}</div>
      <label class="f">${LL('Склянка води, мл', 'Glass of water, ml')}</label><div class="seg">${[250, 300, 350, 500].map((n) => `<button type="button" class="${k.set.glass === n ? 'on' : ''}" data-act="kSetGlass" data-v="${n}">${n}</button>`).join('')}</div>
      <div class="grid2"><div><label class="f">${LL('Прокидаюсь о', 'I wake up at')}</label><input type="time" id="kWake" value="${k.set.wake}"></div><div><label class="f">${LL('Лягаю о', 'I go to bed at')}</label><input type="time" id="kBed" value="${k.set.bed}"></div></div>
      <p class="tiny muted">${LL('Остання склянка — за 2 год до сну, щоб не прокидатись уночі.', 'The last glass is 2 hours before bed so you don’t wake up at night.')}</p>
      <button type="button" class="pri wide" data-act="kSetSave">${LL('Зберегти', 'Save')}</button>`);
  }
  function kAbout() {
    const N = kNorm();
    openSheet(`<b>${LL('Як рахує кухня', 'How the kitchen counts')}</b>
      ${N.nu ? `<p class="small">${LL('<b>Ваша норма.</b> ', '<b>Your targets.</b> ')}${esc(kCalcTxt(N).replace(/^./, (c) => c.toUpperCase()))}</p>` : ''}
      <p class="small">${LL('<b>Норма.</b> Калорії — формула Міффліна — Сан Жеора × 1,45 і мета програми. Білок — від цільової ваги, якщо її вказано, інакше від поточної (за ожиріння — не вище ваги для ІМТ 30).', '<b>Targets.</b> Calories — Mifflin–St Jeor × 1.45 and your program goal. Protein — from your target weight if you set one, otherwise from your current weight (with obesity, capped at the weight for BMI 30).')}</p>
      <p class="small">${LL('<b>Склад.</b> База USDA FoodData Central (SR Legacy): числа на 100 г і мірки — без змін з першоджерела. Ваші продукти — з етикетки, страви — з вашого рецепта.', '<b>Composition.</b> USDA FoodData Central (SR Legacy): per-100 g numbers and measures exactly as published. Your foods — from the label; your dishes — from your recipe.')}</p>
      <p class="small">${LL('<b>Точність.</b> «зважено» і «етикетка» — найточніше; «мірка» — склад точний, а вага залежить від повноти ложки чи склянки; «орієнтир» — порції руками Precision Nutrition.', '<b>Accuracy.</b> “weighed” and “label” are the most accurate; “measure” — the composition is exact, the weight depends on how full the spoon or cup is; “estimate” — Precision Nutrition hand portions.')}</p>
      <p class="small">${(isLb() ? LL('<b>Тарілка й білок.</b> 0,18 г білка на lb ваги на прийом, щонайменше 4 прийоми (огляд Schoenfeld і Aragon, 2018). У день тренування — прийом з білком до й після.', '<b>Plate and protein.</b> 0.18 g of protein per lb of body weight per meal, at least 4 meals (Schoenfeld and Aragon, 2018). On training days — a protein-rich meal before and after.') : LL('<b>Тарілка й білок.</b> 0,4 г білка на кг на прийом, щонайменше 4 прийоми (огляд Schoenfeld і Aragon, 2018). У день тренування — прийом з білком до й після.', '<b>Plate and protein.</b> 0.4 g of protein per kg per meal, at least 4 meals (Schoenfeld and Aragon, 2018). On training days — a protein-rich meal before and after.'))}</p>
      <p class="small">${LL('<b>Вода.</b> Норма програми; зранку — склянка після сну. Температура — як приємніше: досліджень, що гаряча вода прискорює обмін, немає.', '<b>Water.</b> Your program’s target; a glass after you wake up. Temperature is up to you: there’s no research showing hot water speeds up your metabolism.')}</p>${kHeartNote()}
      ${(N.food.notes || []).length ? `<p class="small"><b>${LL('Поради програми', 'Program tips')}</b></p>${N.food.notes.map((x) => `<p class="small" style="margin:6px 0">• ${esc(x)}</p>`).join('')}` : ''}
      <p class="tiny muted">${LL('Це орієнтир, а не медичний план; при хронічних хворобах узгодьте з лікарем.', 'This is guidance, not a medical plan; if you have a chronic condition, check with your doctor.')}</p>`);
  }
  /* вода: + / − склянка; нагадування — підписка й розклад на сервер (remindSync) */
  function kWater(dir) {
    const d = ui.kDate || kWaterDay(), day = kdayW(d), g = kit().set.glass;  // сьогодні — день води (нічна зміна)
    day.water = Math.max(0, (day.water || 0) + dir * g);
    save(); haptic(); rKitchen();
    if (d === kWaterDay() && kit().set.water) remindSync(false);
  }
  /* вода вимкнена, а нагадувань про тренування немає — прибрати підписку й на сервері (інакше сервер і далі нагадує про воду) */
  async function waterUnsub() {
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (sub) { await fetch(COACH_URL + '/push/unsub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
    } catch (e) { /* немає */ }
  }
  async function kWaterRemind() {
    const k = kit();
    if (k.set.water) { k.set.water = false; save(); rKitchen(); if ((S().remind || {}).on) remindSync(false); else waterUnsub(); toast(LL('Нагадування про воду вимкнено', 'Water reminders off')); return; }
    if (!pushOk()) return rKitchen();
    let perm = Notification.permission;
    if (perm !== 'granted') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
    if (perm !== 'granted') { toast(LL('Сповіщення не дозволено', 'Notifications aren’t allowed')); return rKitchen(); }
    k.set.water = true; save(); rKitchen();
    const ok = await remindSync(false);
    toast(ok ? LL('Нагадування про воду увімкнено', 'Water reminders are on') : LL('Не вдалося звʼязатися з сервером — спробуйте пізніше', 'Couldn’t reach the server — try again later'));
  }
  /* для тренера: що з'їдено сьогодні й норма (числа — з бази й записів людини) */
  function kitchenCtx() {
    try {
      const N = kNorm(), day = kday(today()), sx = ksex(), t = KITCHEN.dayTotals(day, sx, kctx());
      const out = [];
      out.push(LL('Кухня сьогодні: ', 'Kitchen today: ') + t.kcal + LL(' ккал, білок ', ' kcal, protein ') + fmt(t.p) + LL(' г, жири ', ' g, fat ') + fmt(t.f) + LL(' г, вуглеводи ', ' g, carbs ') + fmt(t.c) + LL(' г', ' g') +
        (N.nu ? LL('; норма: ', '; targets: ') + N.nu.kLo + '–' + N.nu.kHi + LL(' ккал, білок ', ' kcal, protein ') + N.nu.pLo + '–' + N.nu.pHi + LL(' г', ' g') : LL('; норму ще не налаштовано', '; targets not set up yet')) +
        LL('; вода: ', '; water: ') + (kday(kWaterDay()).water || 0) + LL(' мл з ', ' ml of ') + KITCHEN.waterTarget(sx, kTrain(kWaterDay())) + LL(' мл.', ' ml.'));
      if (N.nu && N.nu.guard) out.push(kGuardTxt(N.nu));  // межа безпеки норми — тренер не радитиме їсти менше
      if (kHeart()) out.push(LL('Тиск або серце: скільки пити — узгодити з лікарем.', 'Blood pressure or heart condition: how much to drink — check with the doctor.'));
      day.items.slice(-12).forEach((e) => { const m = KITCHEN.macros(e, sx, kctx()); if (m) out.push('- ' + kName(e) + (kAmount(e) ? ' (' + kAmount(e) + ')' : '') + ': ' + m.kcal + LL(' ккал, білок ', ' kcal, protein ') + fmt(m.p) + LL(' г [', ' g [') + KQ()[m.q] + ']'); });
      return out.join('\n');
    } catch (e) { return ''; }
  }

  function rBody() {
    const p = P(), prog = G();
    const tabs = [['m', LL('Заміри', "Measurements")], ['f', LL('Фото', "Photos")]].concat(prog.tests ? [['t', LL('Тести', "Tests")]] : []);  // харчування — у «Кухні» (з 3.20.0)
    if (!tabs.some((t) => t[0] === ui.bodyTab)) ui.bodyTab = 'm';
    let body = '';
    if (ui.bodyTab === 'm') {
      body = MEAS.map(([k, l]) => {
        const u = MU(k), arr = (p.body[k] || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1)).map((q) => ({ d: q.d, v: MV(k, q.v) }));  // показ — у одиницях профілю
        const last = arr[arr.length - 1], first = arr[0];
        const avg = k === 'weight' ? ENGINE.rolling7(arr) : null;
        const series = k === 'weight' ? [{ pts: arr.map((q) => ({ t: tms(q.d), v: Number(q.v) })), color: 'var(--muted)', width: 1 }, { pts: avg.map((q) => ({ t: tms(q.d), v: q.v })), color: 'var(--accent)', width: 2.5, dots: false, area: true }] : [{ pts: arr.map((q) => ({ t: tms(q.d), v: Number(q.v) })), color: 'var(--accent)', area: true }];
        return `<div class="card"><div class="sp"><div><b>${l}</b><div class="small muted">${last ? fmt(last.v) + ' ' + u + ' · ' + dm(last.d) + (first && first !== last ? ' · ' + (last.v - first.v >= 0 ? '+' : '') + fmt(Math.round((last.v - first.v) * 10) / 10) + LL(' від першого', " since the first") : '') : LL('ще немає', "none yet")}</div></div><button type="button" class="sm" data-act="measAdd" data-m="${k}${LL(`">+ Додати</button></div>
          `, `">+ Add</button></div>
          `)}${arr.length >= 2 ? CHARTS.line(series, { h: 130, label: l }) : ''}${k === 'weight' && arr.length ? LL('<p class="tiny muted">Зважуйтесь зранку натщесерце; дивіться на середню за 7 днів (лінія).</p>', "<p class=\"tiny muted\">Weigh yourself in the morning on an empty stomach; watch the 7-day average (the line).</p>") : ''}</div>`;
      }).join('');
    } else if (ui.bodyTab === 'f') {
      body = `<div class="seg">${[['front', LL('Спереду', "Front")], ['side', LL('Збоку', "Side")], ['back', LL('Ззаду', "Back")]].map(([k, l]) => `<button type="button" class="${ui.photoPose === k ? 'on' : ''}" data-act="pose" data-v="${k}">${l}</button>`).join('')}${LL(`</div>
        <label class="btn pri" style="display:block;text-align:center;color:var(--accent-ink);border:1px solid var(--accent);background:var(--accent);font-weight:500">Додати фото<input type="file" id="photoIn" accept="image/*" style="display:none"></label>
        <div id="cmpBox"></div><h2>Усі фото</h2><div class="ph" id="phGrid"><div class="empty" style="grid-column:1/-1">Завантаження…</div></div>
        <p class="tiny muted">Фото зберігаються лише в цьому телефоні (стиснені до 1080 px). Тижні 1, 4, 8, 12 — однакове світло й місце.</p>`, `</div>
        <label class="btn pri" style="display:block;text-align:center;color:var(--accent-ink);border:1px solid var(--accent);background:var(--accent);font-weight:500">Add photo<input type="file" id="photoIn" accept="image/*" style="display:none"></label>
        <div id="cmpBox"></div><h2>All photos</h2><div class="ph" id="phGrid"><div class="empty" style="grid-column:1/-1">Loading…</div></div>
        <p class="tiny muted">Photos are stored only on this phone (compressed to 1080 px). Weeks 1, 4, 8, 12 — same lighting and same spot.</p>`)}`;
    } else {
      const tl = (p.body.tests || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
      body = `${LL(`<details class="card"><summary style="cursor:pointer;font-weight:650">Як виконувати тести</summary>`, `<details class="card"><summary style="cursor:pointer;font-weight:650">How to do the tests</summary>`)}${(prog.testsHow || []).map((r) => `<p class="small" style="margin:8px 0"><b>${esc(r[0])}.</b> ${esc(r[1])}</p>`).join('')}${LL(`</details><div class="card"><p class="small muted">Тижні 1, 4, 8, 12. Головне — щоб числа росли.</p><div class="grid2">`, `</details><div class="card"><p class="small muted">Weeks 1, 4, 8, 12. What matters is that the numbers go up.</p><div class="grid2">`)}${TESTS.map(([k, l, u]) => `<div><label class="f">${l}, ${u}</label><input inputmode="decimal" id="t_${k}"></div>`).join('')}${LL(`</div><p></p><button type="button" class="pri wide" data-act="saveTests">Зберегти тести</button></div>
        `, `</div><p></p><button type="button" class="pri wide" data-act="saveTests">Save tests</button></div>
        `)}${[['chair', ['chair'], LL('Вставання з крісла за 30 с', "30-second chair stand")], ['bal', ['balL', 'balR'], LL('Стійка на одній нозі, с', "Single-leg stand, sec")], ['sp', ['spL', 'spR'], LL('Бічна планка, с', "Side plank, sec")], ['push', ['push'], LL('Віджимання', "Push-ups")], ['car', ['carL', 'carR'], LL('Валізна прогулянка, с', "Suitcase carry, sec")]].map(([id, keys, name]) => {
          const ser = keys.map((key, i) => ({ pts: tl.filter((t) => t[key] !== null && t[key] !== undefined && t[key] !== '').map((t) => ({ t: tms(t.d), v: Number(t[key]) })), color: i ? 'var(--d)' : 'var(--accent)' }));
          if (!ser.some((x) => x.pts.length)) return '';
          return `<div class="card"><b class="small">${name}</b>${CHARTS.line(ser, { h: 120, label: name })}${keys.length > 1 ? LL('<div class="legend"><span><i></i>ліва</span><span><i style="background:var(--d)"></i>права</span></div>', "<div class=\"legend\"><span><i></i>left</span><span><i style=\"background:var(--d)\"></i>right</span></div>") : ''}</div>`;
        }).join('')}`;
    }
    app.innerHTML = `${LL(`<h1>Тіло</h1><div class="seg">`, `<h1>Body</h1><div class="seg">`)}${tabs.map(([k, l]) => `<button type="button" class="${ui.bodyTab === k ? 'on' : ''}" data-act="bodyTab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
    if (ui.bodyTab === 'f') loadPhotos();
  }
  function loadPhotos() {
    photoUrls.forEach((u) => URL.revokeObjectURL(u)); photoUrls = [];
    const inp = document.getElementById('photoIn');
    if (inp) inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try { const blob = await STORE.compress(f); await STORE.putPhoto({ id: Date.now(), profile: DB.active, date: today(), pose: ui.photoPose, blob }); toast(LL('Фото збережено', "Photo saved")); rBody(); }
      catch (e) { toast(LL('Не вдалося зберегти фото', "Couldn’t save the photo")); }
    };
    STORE.listPhotos(DB.active).then((all) => {
      const grid = document.getElementById('phGrid'); if (!grid) return;
      const mine = all.filter((x) => x.pose === ui.photoPose);
      grid.innerHTML = mine.length ? mine.slice().reverse().map((x) => { const u = URL.createObjectURL(x.blob); photoUrls.push(u); return `<div data-act="photo" data-id="${x.id}" style="position:relative"><img src="${u}${LL(`" alt="фото `, `" alt="photo `)}${dm(x.date)}"><span class="tiny" style="position:absolute;left:6px;bottom:6px;background:rgba(8,32,31,.7);color:#fff;padding:1px 6px">${dm(x.date)}</span></div>`; }).join('') : LL('<div class="empty" style="grid-column:1/-1">Ще немає фото в цьому ракурсі</div>', "<div class=\"empty\" style=\"grid-column:1/-1\">No photos from this angle yet</div>");
      const box = document.getElementById('cmpBox');
      if (box && mine.length >= 2) {
        const a = URL.createObjectURL(mine[0].blob), b = URL.createObjectURL(mine[mine.length - 1].blob); photoUrls.push(a, b);
        box.innerHTML = `${LL(`<h2>Було → стало</h2><div class="cmp" id="cmp"><img src="`, `<h2>Before → after</h2><div class="cmp" id="cmp"><img src="`)}${b}${LL(`" alt="останнє"><img class="top" id="cmpTop" src="`, `" alt="latest"><img class="top" id="cmpTop" src="`)}${a}${LL(`" alt="перше" style="clip-path:inset(0 `, `" alt="first" style="clip-path:inset(0 `)}${100 - ui.cmp}% 0 0)"><div class="bar" id="cmpBar" style="left:${ui.cmp}%"></div><span class="lb l">${dm(mine[0].date)}</span><span class="lb r">${dm(mine[mine.length - 1].date)}</span></div>
          <input type="range" min="0" max="100" value="${ui.cmp}" id="cmpRange" style="margin-top:8px;padding:0;min-height:30px;background:transparent;border:0">`;
        const rg = document.getElementById('cmpRange');
        rg.oninput = () => { ui.cmp = Number(rg.value); document.getElementById('cmpTop').style.clipPath = 'inset(0 ' + (100 - ui.cmp) + '% 0 0)'; document.getElementById('cmpBar').style.left = ui.cmp + '%'; };
      }
    }).catch(() => { const grid = document.getElementById('phGrid'); if (grid) grid.innerHTML = LL('<div class="empty" style="grid-column:1/-1">Фото недоступні в цьому браузері</div>', "<div class=\"empty\" style=\"grid-column:1/-1\">Photos aren’t available in this browser</div>"); });
  }
  function measSheet(k) {
    const m = MEAS.find((x) => x[0] === k);
    openSheet(`<b>${m[1]}, ${MU(k)}${LL(`</b><p class="small muted">Сьогодні, `, `</b><p class="small muted">Today, `)}${dm(today())}</p><input inputmode="decimal" id="measIn" placeholder="${MU(k)}" style="font-size:1.6rem;text-align:center"><p></p><button type="button" class="pri wide big" data-act="measSave" data-m="${k}${LL(`">Зберегти</button>`, `">Save</button>`)}`);
    setTimeout(() => { const i = document.getElementById('measIn'); if (i) i.focus(); }, 250);
  }

  /* ---------- більше ---------- */
  function packBox() {
    if (!VPACKS.length) return LL('<div class="note small">Записаних голосів ще немає — зараз говорить системний голос телефону.</div>', "<div class=\"note small\">No recorded voices yet — for now, the phone’s system voice is speaking.</div>");
    const cur = packId(), sex = G().sex;
    const byP = (a, b) => (b.priority || 0) - (a.priority || 0), list = VPACKS.filter((x) => x.gender === sex).sort(byP).concat(VPACKS.filter((x) => x.gender !== sex).sort(byP));
    return `${LL(`<label class="f">Голос тренера</label><div class="pick vp">`, `<label class="f">Coach voice</label><div class="pick vp">`)}${list.map((x) => `<button type="button" class="rst${x.id === cur ? ' on' : ''}" data-act="vpack" data-id="${x.id}"><b>${esc(x.name)}</b><span class="small muted">${esc(x.note || '')}</span></button>`).join('')}
</div>
      ${voiceInfo.mode ? `<div class="note small ${voiceInfo.mode === 'pack' ? 'ok' : 'w'}">${voiceInfo.mode === 'pack' ? LL('Зараз говорить записаний голос.', "The recorded voice is speaking now.") : LL('Остання фраза прозвучала системним голосом: ', "The last phrase was spoken in the system voice: ") + esc(voiceInfo.why) + '.'}</div>` : ''}
      ${cur ? `${LL(`<p class="small muted" id="vpState">Перевіряю, чи збережено в телефоні…</p><button type="button" class="wide" data-act="vdl">Зберегти голос у телефоні (для роботи без інтернету)</button>`, `<p class="small muted" id="vpState">Checking whether it’s saved on this phone…</p><button type="button" class="wide" data-act="vdl">Save the voice on this phone (works offline)</button>`)}` : ''}`;
  }
  async function packState() {
    const el = document.getElementById('vpState'), id = packId(); if (!el || !id) return;
    try { const p = await VOICEPACK.load(id), have = await VOICEPACK.cached(id); el.textContent = have ? LL('Голос збережено в телефоні: працює без інтернету.', "Voice saved on this phone: works offline.") : LL('Голос ще не збережено в телефоні (', "Voice not saved on this phone yet (") + (p.bytes ? Math.round(p.bytes / 1e6) + LL(' МБ', " MB") : LL('кілька МБ', "a few MB")) + LL('). Без інтернету тренер говоритиме системним голосом.', "). Offline, the coach will use the system voice."); }
    catch (e) { el.textContent = LL('Не вдалося завантажити голос — перевірте інтернет.', "Couldn’t download the voice — check your internet."); }
  }
  /* ---------- користувач і захист ---------- */
  function accountCard() {
    const a = STORE.account(STORE.current) || {}, many = STORE.accounts().length > 1;
    return `${LL(`<h2>Профіль</h2><div class="card"><div class="sp"><div><b>`, `<h2>Profile</h2><div class="card"><div class="sp"><div><b>`)}${esc(a.name || '')}${LL(`</b><div class="small muted">дані лише в цьому телефоні</div></div>`, `</b><div class="small muted">data stays on this phone only</div></div>`)}${many ? LL('<button type="button" class="sm" data-act="accSwitch">Змінити</button>', "<button type=\"button\" class=\"sm\" data-act=\"accSwitch\">Switch</button>") : ''}${LL(`</div>
      <div class="row" style="margin-top:10px"><button type="button" class="sm ghost" data-act="accRename">Змінити імʼя</button></div>
      <button type="button" class="danger wide" style="margin-top:10px" data-act="accDelete">Видалити мої дані й почати заново</button></div>`, `</div>
      <div class="row" style="margin-top:10px"><button type="button" class="sm ghost" data-act="accRename">Rename</button></div>
      <button type="button" class="danger wide" style="margin-top:10px" data-act="accDelete">Delete my data and start over</button></div>`)}`;
  }
  /* вибір програми — лише якщо з попередньої версії лишилось кілька журналів */
  function progCard() {
    const own = Object.keys(DB.profiles).filter((k) => PROGRAMS[k]), g = G();
    return own.length > 1
      ? `${LL(`<label class="f">Програма</label><select id="progSel">`, `<label class="f">Program</label><select id="progSel">`)}${own.map((k) => `<option value="${k}"${k === DB.active ? ' selected' : ''}>${esc(PROGRAMS[k].title)}</option>`).join('')}</select>`
      : `<div><b>${esc(g.title)}</b>${g.sub ? `<div class="small muted">${esc(g.sub)}</div>` : ''}</div>`;
  }
  /* обладнання вдома — будь-коли додати чи прибрати; програма перебудовується, історія й рекорди лишаються */
  function eqCard(p) {
    const a = DB.custom && DB.custom.answers; if (!a || a.place === 'gym') return '';
    const eq = a.equip || [], mk = Object.keys(GEN.MACH), allM = mk.every((k) => eq.indexOf(k) >= 0), dis = p.draft ? ' disabled' : '';
    const btn = (k, l) => `<button type="button" class="sm${eq.indexOf(k) >= 0 ? ' pri' : ''}" data-act="homeEq" data-v="${k}" aria-pressed="${eq.indexOf(k) >= 0}"${dis}>${esc(l)}</button>`;
    return `${LL(`<h2>Обладнання вдома</h2><div class="card"><p class="small muted">Додали чи прибрали — програма перебудується під те, що є; історія й рекорди лишаються.</p>
      <div class="row">`, `<h2>Home equipment</h2><div class="card"><p class="small muted">Added or removed something? The program rebuilds around what you have; your history and PRs stay.</p>
      <div class="row">`)}${btn('db', LL('Гантелі', "Dumbbells"))}${btn('band', LL('Петля', "Loop band"))}${LL(`</div>
      <label class="f">Тренажери (ті самі, що в залі)</label><button type="button" class="sm wide`, `</div>
      <label class="f">Machines (same as at the gym)</label><button type="button" class="sm wide`)}${allM ? ' pri' : ''}" data-act="homeEqAll" aria-pressed="${allM}"${dis}>${allM ? '✓ ' : ''}${LL(`Усе, як у залі</button>
      <div class="row" style="margin-top:8px">`, `Everything the gym has</button>
      <div class="row" style="margin-top:8px">`)}${mk.map((k) => btn(k, TR(GEN.MACH[k][0]))).join('')}</div>${p.draft ? LL('<p class="tiny muted">Обладнання — після завершення тренування.</p>', "<p class=\"tiny muted\">Equipment can be changed after you finish the workout.</p>") : ''}</div>`;
  }
  function rMore() {
    const p = P(), prog = G(), V = S().voice, hasDb = Object.values(prog.ex).some((ex) => !ex.retired && GEN.needs(ex) === 'db');  // вибулі (з історії) — не рахуються
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    /* після 12 тижнів — цикли з тижнів 5–12 (як у «Плані»): вибір тижня — у поточному циклі */
    const cp = ENGINE.planFor(prog, nextN()), curWeek = cp.week, wks = cp.cycle === 1 ? Array.from({ length: 12 }, (_, k) => k + 1) : Array.from({ length: 8 }, (_, k) => k + 5);
    const sw = (k, l, d) => `<label class="sw"><span>${l}<div class="tiny muted">${d}</div></span><input type="checkbox" data-set="${k}"${S()[k] ? ' checked' : ''}></label>`;
    const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-act="vset" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const vl = VOICE.list();
    const voiceBox = !VOICE.supported ? LL('<div class="note w small">Цей браузер не вміє озвучувати текст. ', "<div class=\"note w small\">This browser can’t read text aloud. ") + TX(LL('На iPhone голос працює в Safari й у встановленому застосунку.', "On iPhone, the voice works in Safari and in the installed app."), LL('На Android голос працює в Chrome й у встановленому застосунку.', "On Android, the voice works in Chrome and in the installed app.")) + '</div>'
      : !vl.length ? LL('<div class="note w small"><b>Українського голосу не знайдено.</b> ', "<div class=\"note w small\"><b>No English voice found.</b> ") + TX(LL('На iPhone: Параметри → Доступність → розділ про озвучення вмісту (англ. Spoken Content) → Голоси → Українська — завантажте голос і перезапустіть застосунок.', "On iPhone: Settings → Accessibility → Spoken Content → Voices → English — download a voice and restart the app."), LL('На Android: «Налаштування» → «Спеціальні можливості» → «Синтез мовлення» (або «Перетворення тексту в мовлення») → система Google → встановіть українську й перезапустіть застосунок. Назви пунктів у різних телефонів трохи різні.', "On Android: “Settings” → “Accessibility” → “Text-to-speech output” (or “Text-to-speech”) → Google engine → install English and restart the app. Menu names vary slightly from phone to phone.")) + '</div>'
      : `${LL(`<label class="f">Голос</label><select id="voiceSel">`, `<label class="f">Voice</label><select id="voiceSel">`)}${vl.map((v) => `<option value="${esc(v.uri)}"${v.uri === V.uri ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`;
    app.innerHTML = `${LL(`<h1>Більше</h1>
      `, `<h1>More</h1>
      `)}${accountCard()}
      ${standalone ? '' : installNote(LL('Встановіть як застосунок', "Install as an app"))}
      ${langCard()}${unitsCard()}${remindCard()}${LL(`
      <h2>Голосовий тренер</h2><div class="card"><label class="sw"><span>Голос під час тренування<div class="tiny muted">`, `
      <h2>Voice coach</h2><div class="card"><label class="sw"><span>Voice during workouts<div class="tiny muted">`)}${hasDb ? LL('вага й диски', "weight and plates") : LL('вага', "weight")}${LL(`, відпочинок, «10 секунд», «Час!», рекорди</div></span><input type="checkbox" id="voiceOn"`, `, rest, “10 seconds”, “Time!”, PRs</div></span><input type="checkbox" id="voiceOn"`)}${V.on ? ' checked' : ''}></label>
        ${I18N.lang === 'en' ? '<div class="note small">During workouts the coach speaks with your phone’s English voice — the recorded coach voices are in Ukrainian.</div>' : packBox()}
        ${packId() && I18N.lang !== 'en' ? '' : voiceBox}${LL(`
        <label class="sw"><span>Говорити й у беззвучному режимі<div class="tiny muted">вимкніть, якщо слухаєте музику в іншому застосунку і вона ставатиме на паузу</div></span><input type="checkbox" id="voiceSilent"`, `
        <label class="sw"><span>Speak even in silent mode<div class="tiny muted">turn this off if you listen to music in another app and it keeps pausing</div></span><input type="checkbox" id="voiceSilent"`)}${V.silent === false ? '' : ' checked'}${LL(`></label>
        <label class="f">Характер тренера</label>`, `></label>
        <label class="f">Coach personality</label>`)}${seg('tone', [['hard', LL('Жорсткий з гумором', "Tough, with humor")], ['calm', LL('Спокійний', "Calm")]], V.tone || 'hard')}${LL(`
        <label class="f">Скільки говорити</label>`, `
        <label class="f">How much to talk</label>`)}${seg('level', [['full', LL('Детально', "Detailed")], ['short', LL('Коротко', "Brief")]], V.level)}
        ${packId() ? '' : `${LL(`<label class="f">Темп</label>`, `<label class="f">Speed</label>`)}${seg('rate', [[0.9, LL('Повільніше', "Slower")], [1, LL('Звичайно', "Normal")], [1.1, LL('Швидше', "Faster")]], V.rate)}`}${LL(`
        <button type="button" class="wide" data-act="say" data-what="test">🔊 Перевірити голос</button>
        <p class="tiny muted">Голос звучить, коли застосунок відкритий і екран увімкнений («Не гасити екран» нижче). Не чути — перевірте гучність і перемикач беззвучного режиму.</p></div>
      <h2>Музика</h2><div class="card"><div class="sp"><div><b>Радіо для тренувань</b><div class="small muted">`, `
        <button type="button" class="wide" data-act="say" data-what="test">🔊 Test voice</button>
        <p class="tiny muted">The voice plays when the app is open and the screen is on (“Keep screen on” below). Can’t hear it? Check the volume and the silent mode switch.</p></div>
      <h2>Music</h2><div class="card"><div class="sp"><div><b>Workout radio</b><div class="small muted">`)}${RADIO.cur ? esc(RADIO.cur.name) + ' · ' + ({ playing: LL('грає', "playing"), loading: LL('підключаюся', "connecting"), paused: LL('пауза', "paused"), error: LL('не відповідає', "not responding") }[RADIO.state] || '') : RADIO.STATIONS.length + LL(' станцій: денс, хіти, українські, рок, метал, драм-н-бейс', " stations: dance, hits, Ukrainian, rock, metal, drum and bass")}${LL(`</div></div><button type="button" class="sm pri" data-act="radio">Відкрити</button></div></div>
      <h2>Тренування</h2><div class="card"><label class="f">Екран тренування</label>`, `</div></div><button type="button" class="sm pri" data-act="radio">Open</button></div></div>
      <h2>Workout</h2><div class="card"><label class="f">Workout screen</label>`)}${seg('mode', [['coach', LL('Тренер · крок за кроком', "Coach · step by step")], ['list', LL('Список вправ', "Exercise list")]], S().mode)}
        ${sw('sound', LL('Звук таймера', "Timer sound"), LL('сигнал, коли відпочинок скінчився', "a beep when rest is over"))}${sw('haptics', LL('Вібровідгук', "Haptics"), TX(LL('на iPhone з iOS 18+, якщо підтримується', "on iPhone with iOS 18+, if supported"), LL('коротка вібрація на дотиках', "a short vibration on taps")))}${sw('awake', LL('Не гасити екран', "Keep screen on"), LL('під час тренування', "during workouts"))}${LL(`</div>
      <h2>Програма</h2><div class="card">`, `</div>
      <h2>Program</h2><div class="card">`)}${progCard()}
        <button type="button" class="wide" style="margin-top:10px" data-act="qEdit"${p.draft ? ' disabled' : ''}>${DB.custom ? LL('Змінити анкету й оновити програму', "Edit questionnaire and update program") : LL('Скласти програму за анкетою', "Build a program from the questionnaire")}${LL(`</button>
        <label class="f">Наступне тренування — тиждень</label><select id="weekSel"`, `</button>
        <label class="f">Next workout — week</label><select id="weekSel"`)}${p.draft ? ' disabled' : ''}>${wks.map((w) => `<option value="${w}"${w === curWeek ? ' selected' : ''}>${w}${cp.cycle > 1 ? LL(' · цикл ', " · cycle ") + cp.cycle : ''}</option>`).join('')}${LL(`</select>
        <label class="f">Дні тренувань</label><div class="row">`, `</select>
        <label class="f">Workout days</label><div class="row">`)}${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="sm${p.days.indexOf(d) >= 0 ? ' pri' : ''}" data-act="day" data-d="${d}"${p.draft ? ' disabled' : ''}>${DAYS[d]}</button>`).join('')}</div>${p.draft ? LL('<p class="tiny muted">Анкета, дні й тиждень — після завершення тренування.</p>', "<p class=\"tiny muted\">Questionnaire, days, and week can be changed after you finish the workout.</p>") : ''}</div>
      ${eqCard(p)}
      ${hasDb ? `${isLb() ? KG(LL(`<h2>Гантелі</h2><div class="card"><label class="f">Вага грифа без дисків, кг</label><input inputmode="decimal" id="handleIn" value="`, `<h2>Dumbbells</h2><div class="card"><label class="f">Handle weight without plates, kg</label><input inputmode="decimal" id="handleIn" value="`)) : LL(`<h2>Гантелі</h2><div class="card"><label class="f">Вага грифа без дисків, г</label><input inputmode="numeric" id="handleIn" value="`, `<h2>Dumbbells</h2><div class="card"><label class="f">Handle weight without plates, g</label><input inputmode="numeric" id="handleIn" value="`)}${fmt(isLb() ? p.handle : p.handle * 1000)}${LL(`">
        <label class="f">`, `">
        <label class="f">`)}${LL('Диски на обидві гантелі: ', 'Plates for both dumbbells: ')}${PLATES(isLb()).map(fmt).join(' · ')} ${MU('weight')}${LL(' (штук)', ' (count)')}</label><div class="grid3">${PLATES(isLb()).map((k, i) => `<input inputmode="numeric" data-inv="${k}"${isLb() ? ` data-tip="${esc(invTip(k, i))}"` : ''} value="${p.inv[k] || 0}">`).join('')}${LL(`</div>
        <p class="tiny muted">Крок ваги зараз: `, `"></div>
        <p class="tiny muted">Current weight step: `)}${fmt(ENGINE.stepFor(p.inv))}${KG(LL(` кг на гантель.</p></div>`, ` kg per dumbbell.</p></div>`))}` : ''}${LL(`
      <h2>Порадник і підказки</h2><div class="card" style="padding:10px 12px">`, `
      <h2>Guide and tips</h2><div class="card" style="padding:10px 12px">`)}${guideChips()}${LL(`<div class="quick"><button type="button" class="sm" data-act="food">Кухня</button><button type="button" class="sm" data-act="glAll">Словник термінів</button><button type="button" class="sm" data-act="whatsnew">Можливості</button><button type="button" class="sm" data-act="tourReset">Показати навчання знову</button></div></div>
      <h2>Резервна копія</h2><div class="card"><p class="small">Дані лише в цьому телефоні. Раз на тиждень зберігайте копію в iCloud, «Файли» чи Telegram.</p><p class="tiny muted">Остання копія: `, `<div class="quick"><button type="button" class="sm" data-act="food">Kitchen</button><button type="button" class="sm" data-act="glAll">Glossary</button><button type="button" class="sm" data-act="whatsnew">Features</button><button type="button" class="sm" data-act="tourReset">Show the tutorial again</button></div></div>
      <h2>Backup</h2><div class="card"><p class="small">Data stays on this phone only. Once a week, save a copy to iCloud, “Files”, or Telegram.</p><p class="tiny muted">Last backup: `)}${DB.lastBackup ? dm(DB.lastBackup) : LL('ще не було', "none yet")}${LL(`</p>
        <label class="sw"><span>Разом із фото<div class="tiny muted">файл буде більшим</div></span><input type="checkbox" id="bkPhotos"></label>
        <button type="button" class="pri wide" data-act="backup">Зберегти резервну копію</button><p></p>
        <label class="btn" style="display:block;text-align:center">Відновити з копії<input type="file" id="restoreIn" accept=".json,application/json" style="display:none"></label><p></p>
        <button type="button" class="wide" data-act="csv">Вивантажити таблицю (CSV)</button></div>
      <h2>Про застосунок</h2><div class="card"><p class="small muted">Версія `, `</p>
        <label class="sw"><span>Include photos<div class="tiny muted">the file will be bigger</div></span><input type="checkbox" id="bkPhotos"></label>
        <button type="button" class="pri wide" data-act="backup">Save backup</button><p></p>
        <label class="btn" style="display:block;text-align:center">Restore from backup<input type="file" id="restoreIn" accept=".json,application/json" style="display:none"></label><p></p>
        <button type="button" class="wide" data-act="csv">Export spreadsheet (CSV)</button></div>
      <h2>About</h2><div class="card"><p class="small muted">Version `)}${VERSION}${LL(` · <span id="persist">перевіряю сховище…</span></p><p class="tiny muted">Без реєстрації й реклами: ваші дані не залишають телефон. Голос тренера — записані фрази; збережені в телефоні, вони працюють без інтернету. `, ` · <span id="persist">checking storage…</span></p><p class="tiny muted">No sign-up, no ads: your data never leaves your phone. The coach’s voice is recorded phrases; once saved on the phone, they work offline. `)}${TX(LL('Apple Health, віджети й Live Activity веб-застосункам на iPhone недоступні.', "Apple Health, widgets, and Live Activities aren’t available to web apps on iPhone."), LL('Health Connect і віджети веб-застосункам на Android недоступні.', "Health Connect and widgets aren’t available to web apps on Android."))}</p></div>`;
    document.getElementById('voiceOn').onchange = (e) => { V.on = e.target.checked; save(); if (V.on) { VOICE.unlock(); talk(LL('Голос увімкнено.', "Voice is on.")); } else { VOICE.stop(); VOICEPACK.stop(); } };
    document.getElementById('voiceSilent').onchange = (e) => { V.silent = e.target.checked; save(); audioMode(); };
    const vs = document.getElementById('voiceSel'); if (vs) vs.onchange = () => { V.uri = vs.value; save(); talk(LL('Так звучить цей голос.', "This is how this voice sounds.")); };
    if (document.getElementById('progSel')) document.getElementById('progSel').onchange = (e) => { DB.active = e.target.value; if (!DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(DB.active); fixProfiles(ENGINE.migrate(DB)); save(); render(); initPacks(); };
    document.getElementById('weekSel').onchange = (e) => {
      const w = Number(e.target.value), pw = G().perWeek || 3, base = cp.cycle === 1 ? (w - 1) * pw : 12 * pw + (cp.cycle - 2) * 8 * pw + (w - 5) * pw;
      p.offset = base - p.sessions.length; save(); toast(LL('Наступне тренування — тиждень ', "Next workout — week ") + w + (cp.cycle > 1 ? LL(' · цикл ', " · cycle ") + cp.cycle : ''));
    };
    if (hasDb) document.getElementById('handleIn').onchange = (e) => {  // кг-профіль — грами (з 3.19.1)
      const x = num(e.target.value), lb = isLb();
      if (lb ? (x === null || x < 0 || x > 25) : !gripOk(x)) { toast(lb ? LL('Вага грифа — від 0 до 25 lb', 'Handle weight — 0 to 25 lb') : GRIP_ERR()); e.target.value = fmt(lb ? p.handle : p.handle * 1000); return; }
      const v = lb ? x : x / 1000; p.handle = v; syncAnswers({ handle: v }); save(); toast(LL('Збережено', "Saved"));
    };
    app.querySelectorAll('[data-inv]').forEach((el) => { el.onchange = () => { const v = num(el.value); if (v === null || v < 0 || v > 40) { el.value = p.inv[el.dataset.inv]; return; } p.inv[el.dataset.inv] = Math.round(v); syncAnswers({ inv: Object.assign({}, p.inv) }); save(); rMore(); }; });
    app.querySelectorAll('[data-set]').forEach((el) => { el.onchange = () => { S()[el.dataset.set] = el.checked; save(); if (el.dataset.set === 'haptics' && el.checked) haptic(); }; });
    document.getElementById('restoreIn').onchange = (e) => { if (e.target.files && e.target.files[0]) restore(e.target.files[0]); };
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((v) => { const el = document.getElementById('persist'); if (el) el.textContent = v ? LL('сховище захищене від автоочищення', "storage protected from auto-clearing") : LL('робіть резервні копії', "make backups"); }).catch(() => {});
    if (VOICE.supported && !vl.length) setTimeout(() => { if (view === 'more' && VOICE.list().length) rMore(); }, 800);
    packState();
  }
  async function shareFile(name, blob, type) {
    try { const file = new File([blob], name, { type }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; } }
    catch (e) { if (e && e.name === 'AbortError') return false; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return true;
  }
  async function backup() {
    const withPhotos = document.getElementById('bkPhotos') && document.getElementById('bkPhotos').checked;
    const out = { app: 'trening', v: 2, exported: new Date().toISOString(), db: DB };
    if (withPhotos) { try { const all = await STORE.allPhotos(); out.photos = await Promise.all(all.map(async (x) => ({ id: x.id, profile: x.profile, date: x.date, pose: x.pose, data: await STORE.blobToData(x.blob) }))); } catch (e) { out.photos = []; } }
    const ok = await shareFile('trenuvannia-' + today() + '.json', new Blob([JSON.stringify(out)], { type: 'application/json' }), 'application/json');
    if (ok) { DB.lastBackup = today(); save(); toast(LL('Резервну копію створено', "Backup created")); rMore(); }
  }
  function csv() {
    const prog = G(), h = P().handle, rows = [[LL('дата', "date"), LL('тиждень', "week"), LL('тренування', "workout"), LL('місце', "location"), LL('спина', "back"), LL('вправа', "exercise"), LL('варіант', "variant"), LL('тип', "type"), LL('підхід', "set"), KG(LL('вага_кг', "weight_kg")), KG(LL('разом_кг', "total_kg")), LL('повторення_або_с', "reps_or_sec"), LL('запас', "rir"), LL('міні_підходи', "mini_sets")]];
    P().sessions.forEach((s) => { const cnt = {}; s.sets.forEach((x) => { const ex = prog.ex[x.ex] || { name: x.ex }; cnt[x.ex] = (cnt[x.ex] || 0) + 1;
      const tot = (x.load === null || x.load === undefined || ex.type === 'band') ? '' : String(ENGINE.totalLoad(ex, x.load, h, x.variant));
      rows.push([s.date, s.week, s.workout, s.place === 'gym' ? LL('зал', "gym") : s.place === 'home' ? LL('дім', "home") : '', s.ready || '', ex.name, x.variant || '', x.type || 'N', cnt[x.ex], x.load === null || x.load === undefined ? '' : x.load, tot, x.reps, x.rir === null || x.rir === undefined ? '' : x.rir, (x.mini || []).join('+')]); }); });
    const text = String.fromCharCode(65279) + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
    shareFile('trenuvannia-' + today() + '.csv', new Blob([text], { type: 'text/csv' }), 'text/csv');
  }
  function restore(file) {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const o = JSON.parse(r.result);
        if (!o || o.app !== 'trening' || !o.db || !o.db.profiles) throw new Error('format');
        const cnt = Object.values(o.db.profiles).reduce((a, q) => a + ((q && q.sessions) ? q.sessions.length : 0), 0);
        if (!confirm(LL('Відновити копію від ', "Restore the backup from ") + String(o.exported || '').slice(0, 10) + ' (' + plural(cnt, LL('тренування', "workout"), LL('тренування', "workouts"), LL('тренувань', "workouts")) + LL(')? Поточні дані на цьому телефоні буде замінено.', ")? The current data on this phone will be replaced."))) return;
        if (o.db.custom && o.db.custom.answers) { PROGRAMS.me = buildMe(o.db.custom.answers); STORE.update(STORE.current, { name: o.db.custom.answers.name, sub: PROGRAMS.me.sub }); }
        else if (isNewAcc((STORE.account(STORE.current) || {}).name)) STORE.update(STORE.current, { name: LL('Мій профіль', "My profile") });
        ui.q = null;
        DB = fixProfiles(ENGINE.migrate(o.db)); if (DB.custom && DB.custom.answers) PROGRAMS.me = buildMe(DB.custom.answers);  // вибулі вправи — з відновленої історії
        if (!DB.active || !DB.profiles[DB.active] || !PROGRAMS[DB.active]) DB.active = Object.keys(DB.profiles).filter((k) => PROGRAMS[k])[0] || null;
        VOICE.init(DB.settings.voice); RADIO.setDuck(DB.settings.radio.duck); syncLegacy();
        if (o.photos && o.photos.length) { for (const x of o.photos) { try { await STORE.putPhoto({ id: x.id, profile: x.profile, date: x.date, pose: x.pose, blob: STORE.dataToBlob(x.data) }); } catch (e) { /* пропуск */ } } }
        save(); toast(LL('Дані відновлено', "Data restored")); view = DB.active ? 'home' : 'onboard'; render(); initPacks();
      } catch (e) { toast(LL('Це не схоже на резервну копію журналу', "This doesn’t look like a workout log backup")); }
    };
    r.readAsText(file);
  }

  /* ---------- дії ---------- */
  function exMenu(i) {
    const d = P().draft, it = d.items[i], ex = G().ex[it.ex];
    const fw = it.sets.find((s) => s.type !== 'W');
    const canWarm = ENGINE.warmups(ex, fw ? fw.load : null, ENGINE.stepFor(P().inv), G().warm, isMach(ex) ? loadStep(ex, it.ex) : 0).length && !it.sets.some((s) => s.type === 'W');
    const started = it.sets.some((s) => s.done);
    openSheet(`<div class="sp"><b>${esc(ex.name)}${LL(`</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">`, `</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <p class="small muted">`)}${esc(ex.m.p.map(mName).join(' · '))}${ex.m.s.length ? LL(' · допоміжні: ', " · secondary: ") + esc(ex.m.s.map(mName).join(', ')) : ''}</p>
      ${techHtml(it.ex, true)}
      <button type="button" class="wide" data-act="say" data-what="exTip" data-ex="${it.ex}${LL(`">🔊 Прослухати техніку</button>
      <div class="grid2" style="margin-top:10px">
        <button type="button" data-act="swap" data-i="`, `">🔊 Listen to form cues</button>
      <div class="grid2" style="margin-top:10px">
        <button type="button" data-act="swap" data-i="`)}${i}"${started ? ' disabled' : ''}${LL(`>🔄 Замінити</button>
        <button type="button" data-act="skip" data-i="`, `>🔄 Swap</button>
        <button type="button" data-act="skip" data-i="`)}${i}${LL(`">⏭ Пропустити</button>
        <button type="button" data-act="addset" data-i="`, `">⏭ Skip</button>
        <button type="button" data-act="addset" data-i="`)}${i}${LL(`">+ Підхід</button>
        <button type="button" data-act="delset" data-i="`, `">+ Set</button>
        <button type="button" data-act="delset" data-i="`)}${i}${LL(`">− Останній підхід</button>
        `, `">− Last set</button>
        `)}${dropOk(it) ? `<button type="button" data-act="dropset" data-i="${i}${LL(`">⬇ Дроп-сет</button>`, `">⬇ Drop set</button>`)}` : ''}
        ${canWarm ? `<button type="button" data-act="warm" data-i="${i}${LL(`">Розминковий підхід</button>`, `">Warm-up set</button>`)}` : ''}
      </div>${started ? LL('<p class="tiny muted">Заміна — лише до першого підходу вправи.</p>', "<p class=\"tiny muted\">You can only swap before the exercise’s first set.</p>") : ''}${LL(`
      <label class="f">Моя нотатка до вправи (видно щоразу)</label><textarea id="exNote" placeholder="наприклад: крісло біля стіни, хват ширший">`, `
      <label class="f">My note for this exercise (shown every time)</label><textarea id="exNote" placeholder="e.g., chair by the wall, wider grip">`)}${esc(P().notes[it.ex] || '')}</textarea><p></p>
      <button type="button" class="pri wide" data-act="noteSave" data-i="${i}${LL(`">Зберегти нотатку</button>`, `">Save note</button>`)}`);
  }
  function swapSheet(i) {
    const d = P().draft, it = d.items[i], prog = G();
    const alts = ENGINE.alternatives(prog, it.ex, d.ready && d.ready !== 'g', d.items.map((x) => x.ex), d.place).slice(0, 6);
    openSheet(`${LL(`<div class="sp"><b>Замінити «`, `<div class="sp"><b>Swap “`)}${esc(prog.ex[it.ex].name)}${LL(`»</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">Вправи на ті самі мʼязи з вашої програми`, `”</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <p class="small muted">Exercises from your program for the same muscles`)}${d.ready && d.ready !== 'g' ? LL(', без навантаження на поперек', ", without loading the lower back") : ''}.</p>
      ${alts.length ? `<div class="pick">${alts.map((id) => `<button type="button" data-act="swapTo" data-i="${i}" data-ex="${id}"><b>${esc(prog.ex[id].name)}</b><span class="small muted">${esc(prog.ex[id].m.p.map(mName).join(' · '))}</span></button>`).join('')}</div>` : LL('<div class="empty">Рівноцінної заміни в програмі немає — можна пропустити вправу.</div>', "<div class=\"empty\">No equivalent swap in your program — you can skip this exercise.</div>")}`);
  }
  function doSwap(i, to) {
    const p = P(), d = p.draft, old = d.items[i], prog = G(), plan = ENGINE.planFor(prog, d.n);
    const base = { ex: to, sets: workCount(old), min: old.min, max: old.max, rest: old.rest };
    const myo = !!prog.myoFrom && plan.week >= prog.myoFrom && !plan.deload && !d.back;
    /* повернули на вправу з програми — це вже не заміна (раніше писало «Замість „Присідання до крісла“» про саму себе) */
    const from = old.from || old.ex;
    const nw = makeItem(base, old.ss, plan, ENGINE.stepFor(p.inv), { from: from === to ? null : from, myo, where: d.place, back: d.back || null });
    nw.skipped = false; d.items[i] = nw; save(); closeSheet(); rWorkout();
    talk(LL('Заміна. ', "Switching to ") + prog.ex[to].name + '.');
  }
  function sayWhat(b) {
    const w = b.dataset.what, d = P() && P().draft;
    if (w === 'gl') { const g = GLOSSARY[b.dataset.k]; if (g) say1(g[0] + '. ' + g[1]); return; }
    if (w === 'exTip') { const ex = G().ex[b.dataset.ex], sc = script(b.dataset.ex); if (ex) say1(ex.name + '. ' + (sc ? COACH.howText(sc) + ' ' + COACH.dontText(sc) : ex.tip)); return; }
    if (w === 'test') { say1(LL('Привіт! Я твій тренер. Так звучатиме голос під час тренування.', "Hi! I’m your coach. This is how I’ll sound during your workout.")); return; }
    if (!d) return;
    if (w === 'warm') { const wl = warmList(); say1(wl.title + '.\n' + wl.items.join('\n')); return; }
    const cs = curStep(d); if (!cs) { say1(coolText() ? LL('Заминка: ', "Cool-down: ") + coolText() : LL('Усі підходи зроблено.', "All sets done.")); return; }
    if (w === 'tip') { const id = d.items[cs.i].ex, sc = script(id); say1(G().ex[id].name + '. ' + (sc ? COACH.howText(sc) + ' ' + COACH.dontText(sc) : G().ex[id].tip)); return; }
    say1((T.id && T.kind === 'rest' ? LL('Далі. ', "Next up. ") : '') + setSpeech(d, cs, true));
  }
  function say1(t) {
    if (!S().voice.on) { toast(LL('Голос вимкнено: «Більше» → «Голосовий тренер»', "Voice is off: “More” → “Voice coach”")); return; }
    if (!talk(t)) toast(VOICE.supported ? LL('Українського голосу в телефоні не знайдено — див. «Більше» → «Голосовий тренер»', "No English voice found on this phone — see “More” → “Voice coach”") : LL('Цей браузер не вміє озвучувати текст', "This browser can’t read text aloud"));
  }
  function sheetAct(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    handle(b, e);
  }
  function handle(b) {
    const act = b.dataset.act, i = Number(b.dataset.i), j = Number(b.dataset.j);
    if (act === 'noop') return;
    if (act === 'closeSheet') return closeSheet();
    if (act === 'guide') return guideSheet(b.dataset.id);
    if (act === 'gl') return glSheet(b.dataset.k);
    if (act === 'glAll') return glAll();
    if (act === 'say') return sayWhat(b);
    if (act === 'whatsnew') return whatsNew();
    if (act === 'tipsOk') { S().tour.tips = true; save(); return render(); }
    if (act === 'radio') return radioSheet();
    if (act === 'ask') return askSheet();
    if (act === 'askMic') return askMic();
    if (act === 'askSend') { const inp = document.getElementById('askText'); return askSend({ text: inp ? inp.value : '' }); }
    if (act === 'askEx') return askSend({ text: b.dataset.v || '' });
    if (act === 'askSay') return askSpeak(Number(b.dataset.i), true);
    if (act === 'askNew') { askHush(); liveClose(); ASK.chat = []; ASK.photo = null; ASK.st = 'idle'; ASK.msg = ''; ASK.help = false; return askDraw(); }
    if (act === 'install') { const ev = installEv; installEv = null; if (ev) { try { ev.prompt(); ev.userChoice.finally(() => render()); } catch (e) { render(); } } else render(); return; }
    if (act === 'langPick') return langPick(b.dataset.v);
    if (act === 'unitsSet') return unitsSet(b.dataset.v);
    if (act === 'qUnits') {
      qRead(); const a = qState().a, v = b.dataset.v === 'lb' ? 'lb' : 'kg';
      if (v !== a.units) {  // диски тієї самої кількості — у розмірах нових одиниць; гриф — перерахований
        const from = PLATES(a.units === 'lb'), to = PLATES(v === 'lb'), inv = {}; to.forEach((k, i) => { inv[k] = (a.inv || {})[from[i]]; }); a.inv = inv;
        if (typeof a.handle === 'number') a.handle = gripTo(a.handle, v === 'lb');
        a.units = v;
      }
      return rOnboard();
    }
    if (act === 'langSet') { if (b.dataset.v !== I18N.lang && I18N.set(b.dataset.v)) location.reload(); return; }
    if (act === 'askPhoto') { const fi = document.getElementById('askFile'); if (fi) fi.click(); return; }  // у тому самому дотику — інакше iPhone не відкриє камеру
    if (act === 'askPhotoDel') { ASK.photo = null; return askDraw(); }
    if (act === 'rplay') { ensureAudio(); VOICE.unlock(); S().radio.id = b.dataset.id; save(); RADIO.play(b.dataset.id, audio); return radioSheet(); }
    if (act === 'rpause') { RADIO.pause(); return; }
    if (act === 'rresume') { ensureAudio(); RADIO.resume(); return; }
    if (act === 'rstop') { RADIO.stop(); if (document.body.classList.contains('sheet')) radioSheet(); return; }
    if (act === 'rduck') { S().radio.duck = Number(b.dataset.v); RADIO.setDuck(S().radio.duck); save(); return radioSheet(); }
    if (act === 'food' || act === 'goKitchen') { view = 'kitchen'; ui.kDate = null; render(); window.scrollTo(0, 0); return; }
    /* знайомство */
    /* користувач і захист */
    if (act === 'accSwitch') return ACC.leave();
    if (act === 'accRename') {
      const cur = (STORE.account(STORE.current) || {}).name || '', nm = (prompt(LL('Нове імʼя', "New name"), cur) || '').trim();
      if (!nm || nm === cur) return; if (nm.length > 24) { toast(LL('Імʼя — до 24 знаків', "Name — up to 24 characters")); return; }
      STORE.update(STORE.current, { name: nm }); if (DB.custom) { DB.custom.answers.name = nm; save(); } rMore(); return;
    }
    if (act === 'accDelete') {
      if (!confirm(LL('Видалити всі ваші тренування, заміри й фото на цьому телефоні й почати з анкети?', "Delete all your workouts, measurements, and photos on this phone and start over from the questionnaire?"))) return;
      if (!confirm(LL('Точно? Повернути можна лише з резервної копії.', "Are you sure? You can only get it back from a backup."))) return;
      ACC.wipe(STORE.current); return;
    }
    /* під час тренування анкета не змінюється: нова програма скасувала б незавершене тренування */
    if (act === 'qEdit') { if (P() && P().draft) return; ui.q = null; qState(); view = 'onboard'; render(); window.scrollTo(0, 0); return; }
    /* анкета */
    if (act === 'qGoal') {  // кілька цілей (з 3.19.0); несумісна з обраною — неактивна: натиск лише пояснює
      qRead(); const a = qState().a, v = b.dataset.v, gs = GEN.goalsOf(a);
      if (!GEN.GOALS[v]) return;
      if (gs.indexOf(v) < 0 && GEN.GOAL_CLASH[v].some((x) => gs.indexOf(x) >= 0)) { toast(v === 'health' ? LL('«Сила й здоровʼя» не поєднується зі схудненням і набором мʼязів — спершу зніміть їх', "“Strength and health” can’t be combined with losing weight or building muscle — uncheck those first") : LL('Не поєднується з «Сила й здоровʼя» — спершу зніміть її', "Can’t be combined with “Strength and health” — uncheck it first")); return; }
      a.goals = gs.indexOf(v) >= 0 ? gs.filter((x) => x !== v) : GEN.goalsOf({ goals: gs.concat([v]) }); a.goal = a.goals[0];  // goal — перша мета, для копій до 3.19.0
      haptic(); return rOnboard();
    }
    if (act === 'qSex' || act === 'qLevel' || act === 'qPlace') {
      qRead(); const a = qState().a; a[{ qSex: 'sex', qLevel: 'level', qPlace: 'place' }[act]] = b.dataset.v;
      if (a.sex === 'm') a.limits = a.limits.filter((x) => x !== 'pregnant');
      haptic(); return rOnboard();
    }
    if (act === 'qEquip') { qRead(); qToggle(qState().a.equip, b.dataset.v); haptic(); return rOnboard(); }
    if (act === 'qEquipAll') { qRead(); allMach(qState().a.equip); haptic(); return rOnboard(); }
    /* обладнання вдома — будь-коли: програма перебудовується, історія й рекорди лишаються (вибулі вправи) */
    if (act === 'homeEq' || act === 'homeEqAll') {
      if (!DB.custom || (P() && P().draft)) return;  // під час тренування — ні (як дні й анкета)
      const a0 = DB.custom.answers, eq = (a0.equip || []).slice();
      if (act === 'homeEqAll') allMach(eq); else qToggle(eq, b.dataset.v);
      const c = GEN.check(Object.assign({}, a0, { equip: eq }));
      if (c.errors.equip) { toast(c.errors.equip); return; }
      syncAnswers({ equip: eq }); save(); toast(LL('Програму оновлено під обладнання — історія й рекорди лишаються', "Program updated for your equipment — history and PRs stay")); return rMore();
    }
    if (act === 'qLimit') {
      qRead(); const L = qState().a.limits, v = b.dataset.v;
      if (v === 'none') { const had = L.indexOf('none') >= 0; L.length = 0; if (!had) L.push('none'); }
      else { const k = L.indexOf('none'); if (k >= 0) L.splice(k, 1); qToggle(L, v); }
      haptic(); return rOnboard();
    }
    if (act === 'qDay') { qRead(); if (!qToggle(qState().a.days, Number(b.dataset.v), 4)) toast(LL('Максимум 4 дні — оберіть, який прибрати', "4 days max — pick one to remove")); haptic(); return rOnboard(); }
    if (act === 'qBack') { qRead(); const q = qState(); q.err = false; q.step = Math.max(0, q.step - 1); rOnboard(); window.scrollTo(0, 0); return; }
    if (act === 'qCancel') { ui.q = null; view = 'more'; render(); return; }
    if (act === 'qNext') {
      qRead(); const q = qState(), QS = qSteps(q.a), step = QS[q.step];
      if (Object.keys(qErrors(step)).length) { q.err = true; rOnboard(); const e = document.querySelector('.qerr'); if (e) e.scrollIntoView({ block: 'center' }); return; }
      if (step === 'agree' && GEN.check(q.a).block) { q.err = true; return rOnboard(); }
      q.err = false;
      if (q.step === QS.length - 1) return qFinish();
      q.step++; rOnboard(); window.scrollTo(0, 0); return;
    }
    const p = P();
    /* головна */
    /* питання про спину — лише там, де від нього щось залежить */
    if (act === 'start') { VOICE.unlock(); return beginWorkout(null); }
    if (act === 'place') { closeSheet(); return beginWorkout(b.dataset.w || null, b.dataset.v); }
    if (act === 'go') { closeSheet(); return startWorkout(b.dataset.w || null, b.dataset.r, b.dataset.p || undefined); }
    if (act === 'other') return otherSheet();
    if (act === 'startW') { VOICE.unlock(); return beginWorkout(b.dataset.w); }
    if (act === 'resume') { view = 'workout'; return render(); }
    if (act === 'remindOn') return remindOn();
    if (act === 'remindOff') return remindOff();
    if (act === 'remindTest') { return remindSync(true).then((ok) => toast(ok ? LL('Пробне нагадування вже летить', "Test reminder is on its way") : LL('Не вдалося — перевірте інтернет', "Didn’t work — check your internet"))); }
    if (act === 'dailyDone') { const t = today(), r = p.daily[t] = p.daily[t] || {}; r[b.dataset.id] = !r[b.dataset.id]; save(); haptic(); return rHome(); }
    if (act === 'jump') { const k = Number(b.dataset.k), t = today(); const r = p.daily[t] = p.daily[t] || {}; r.jumps = (r.jumps || 0) >= k ? k - 1 : k; save(); haptic(); return rHome(); }
    /* тренування */
    if (act === 'minimize') { view = 'home'; return render(); }
    if (act === 'finish') return finishWorkout();
    if (act === 'discard') { if (confirm(LL('Скасувати тренування? Відмічені підходи не збережуться.', "Cancel the workout? Checked-off sets won’t be saved."))) { p.draft = null; save(); stopTimer(); view = 'home'; render(); remindSync(false); } return; }  // скасували — сьогодні ще не тренувались: значок (rHome) і нагадування повертаються
    if (act === 'done') return toggleDone(i, j);
    if (act === 'kp') return openKp(i, j, b.dataset.f);
    if (act === 'stype') { if (p.draft.items[i].sets[j].done) return toast(LL('Підхід уже позначено ✓ — спершу зніміть позначку', "Set already checked off ✓ — uncheck it first")); return typeSheet(i, j); }
    if (act === 'stypeSet') { const s = p.draft.items[i].sets[j]; s.type = b.dataset.t; save(); haptic(); closeSheet(); return rWorkout(); }
    if (act === 'mode') { S().mode = S().mode === 'list' ? 'coach' : 'list'; if (S().mode === 'coach' && p.draft && p.draft.coach) p.draft.coach.warm = true; save(); render(); window.scrollTo(0, 0); return; }
    if (act === 'cdone') return coachDone();
    if (act === 'cwarm') { p.draft.coach.warm = true; save(); rWorkout(); window.scrollTo(0, 0); const cs = curStep(p.draft); if (cs) talk((b.dataset.skip ? '' : L('warmDone', p.draft.n) || LL('Добре. ', "Good. ")) + LL('Перша вправа. ', "First exercise. ") + setSpeech(p.draft, cs)); return; }
    if (act === 'cstep') {
      const it = p.draft.items[i], s = it.sets[j], ex = G().ex[it.ex], dir = Number(b.dataset.d);
      if (b.dataset.f === 'reps') { const stp = ex.type === 'time' ? 5 : 1; s.reps = Math.max(0, (Number(s.reps) || 0) + stp * dir); }
      else {
        const stp = loadStep(ex, it.ex), cur = (s.load === null || s.load === undefined || s.load === '') ? null : Number(s.load);
        let v;
        if (cur === null) v = dir > 0 ? (ex.type === 'band' ? 1 : isMach(ex) ? stp : 0) : null;
        else if (cur === 0 && dir < 0 && ex.type === 'dbopt') v = null;
        else v = Math.max(0, Math.min(loadCap(ex), Math.round((cur + stp * dir) * 100) / 100));
        s.load = v;
      }
      s.touched = true; save(); haptic(); return rWorkout();
    }
    if (act === 'crir') { const s = p.draft.items[i].sets[j], v = Number(b.dataset.v); s.rir = s.rir === v ? null : v; save(); haptic(); return rWorkout(); }
    if (act === 'tadd') { addTime(Number(b.dataset.v)); return; }
    if (act === 'tskip') { const k = T.kind; stopTimer(); if (k === 'myo') { talk(LL('Ще від трьох до пʼяти повторень.', "Three to five more reps.")); return rWorkout(); } const cs = curStep(p.draft); if (cs) talk(setSpeech(p.draft, cs, true)); return rWorkout(); }
    if (act === 'myoRep') return myoRep(Number(b.dataset.v));
    if (act === 'myoEnd') return myoEnd();
    if (act === 'minis') return minisSheet(i, j);
    if (act === 'miniSet') { ui.minis.m[Number(b.dataset.k)] = Number(b.dataset.v); return minisSheet(ui.minis.i, ui.minis.j, true); }
    if (act === 'miniSave') { const s = p.draft.items[ui.minis.i].sets[ui.minis.j]; s.mini = ui.minis.m.filter((r) => r > 0); save(); closeSheet(); return rWorkout(); }
    if (act === 'swap') return swapSheet(i);
    if (act === 'swapTo') return doSwap(i, b.dataset.ex);
    if (act === 'copyprev') { const s = p.draft.items[i].sets[j]; if (!s.prev || s.done) return; s.load = s.prev.load; s.reps = s.prev.reps; s.touched = true; save(); haptic(); return rWorkout(); }
    if (act === 'variant') { p.draft.items[i].variant = b.dataset.v; save(); return rWorkout(); }
    if (act === 'dropset') {
      const it = p.draft.items[i]; if (!dropOk(it)) return;
      it.sets.push({ type: 'D', load: dropLoad(it), reps: it.min || null, rir: null, done: false, pr: [], prev: null, touched: true });
      save(); haptic(); closeSheet(); toast(LL('Дроп-сет додано — одразу після останнього підходу, без відпочинку', "Drop set added — right after the last set, no rest")); return rWorkout();
    }
    if (act === 'addset') { const it = p.draft.items[i], l = it.sets.filter((x) => x.type !== 'W').slice(-1)[0] || it.sets[it.sets.length - 1] || {}; it.sets.push({ type: 'N', load: l.load === undefined ? null : l.load, reps: l.reps === undefined ? null : l.reps, rir: null, done: false, pr: [], prev: null, touched: false }); save(); closeSheet(); return rWorkout(); }
    if (act === 'warm') { const it = p.draft.items[i], ex = G().ex[it.ex], fw = it.sets.find((s) => s.type !== 'W'); const ws = ENGINE.warmups(ex, fw ? fw.load : null, ENGINE.stepFor(p.inv), G().warm, isMach(ex) ? loadStep(ex, it.ex) : 0); it.sets = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true })).concat(it.sets); save(); closeSheet(); return rWorkout(); }
    if (act === 'exmenu') return exMenu(i);
    if (act === 'noteSave') { const it = p.draft.items[i]; const v = document.getElementById('exNote').value.trim(); if (v) p.notes[it.ex] = v; else delete p.notes[it.ex]; save(); closeSheet(); toast(LL('Нотатку збережено', "Note saved")); return rWorkout(); }
    if (act === 'delset') { const it = p.draft.items[i]; if (it.sets.length > 1 && !it.sets[it.sets.length - 1].done) it.sets.pop(); save(); closeSheet(); return rWorkout(); }
    if (act === 'skip') { p.draft.items[i].skipped = true; save(); closeSheet(); rWorkout(); const cs = curStep(p.draft); if (cs && S().mode !== 'list' && !T.id) talk((hard() ? COACH.line('skip', G().sex, 0) + ' ' : LL('Пропускаємо. ', "Skipping. ")) + LL('Далі. ', "Next up. ") + setSpeech(p.draft, cs)); return; }
    if (act === 'unskip') { p.draft.items[i].skipped = false; save(); return rWorkout(); }
    /* підсумок */
    if (act === 'shareSum') return shareSummary();
    if (act === 'sumDone') { view = 'home'; return render(); }
    /* план */
    if (act === 'planTab') { ui.planTab = b.dataset.v; return rPlan(); }
    if (act === 'calPrev' || act === 'calNext') { const ym = ui.calMonth || today().slice(0, 7); let [Y, M] = ym.split('-').map(Number); M += act === 'calNext' ? 1 : -1; if (M < 1) { M = 12; Y--; } if (M > 12) { M = 1; Y++; } ui.calMonth = Y + '-' + pad(M); return rPlan(); }
    if (act === 'sess') return sessSheet(Number(b.dataset.id), false);
    if (act === 'sessEdit') return sessSheet(Number(b.dataset.id), true);
    if (act === 'sessSave') {
      const s = p.sessions.find((x) => x.id === Number(b.dataset.id)); if (!s) return;
      sheetEl.querySelectorAll('[data-ed]').forEach((el) => { const x = s.sets[Number(el.dataset.sk)], v = num(el.value); if (el.dataset.ed === 'reps') { if (v !== null && v > 0) x.reps = Math.round(v); } else x.load = v; });
      save(); toast(LL('Зміни збережено', "Changes saved")); return sessSheet(s.id, false);
    }
    if (act === 'sessDel') { if (!confirm(LL('Видалити це тренування з журналу?', "Delete this workout from the log?"))) return; p.sessions = p.sessions.filter((x) => x.id !== Number(b.dataset.id)); save(); closeSheet(); return render(); }
    /* прогрес */
    if (act === 'progTab') { ui.progTab = b.dataset.v; return rProgress(); }
    if (act === 'metric') { ui.metric = b.dataset.v; return rProgress(); }
    if (act === 'range') { ui.range = b.dataset.v; return rProgress(); }
    if (act === 'musDays') { ui.musDays = Number(b.dataset.v); return rProgress(); }
    if (act === 'repPrev' || act === 'repNext') { const ym = ui.repMonth || today().slice(0, 7); let [Y, M] = ym.split('-').map(Number); M += act === 'repNext' ? 1 : -1; if (M < 1) { M = 12; Y--; } if (M > 12) { M = 1; Y++; } ui.repMonth = Y + '-' + pad(M); return rProgress(); }
    /* тіло */
    /* ---- кухня (з 3.20.0) ---- */
    if (act === 'theme') return themeNext();
    if (act === 'kDay') { const d = iso(new Date(tms(ui.kDate || today()) + Number(b.dataset.v) * 864e5)); if (d > today()) return; ui.kDate = d === today() ? null : d; return rKitchen(); }
    if (act === 'kAdd') return kAddOpen(Number(b.dataset.m));
    if (act === 'kEdit') return kAddOpen(undefined, Number(b.dataset.i));
    if (act === 'kTab') { const a = ui.kAdd; ui.kAdd = { mode: 'new', m: a.m, tab: b.dataset.v, q: '', ph: a.ph }; return kAddDraw(); }
    if (act === 'kPhoto') { const fi = document.getElementById('kPhIn'); if (fi) fi.click(); return; }
    if (act === 'kPhPick') { const a = ui.kAdd, x = a.ph && a.ph.items && a.ph.items[Number(b.dataset.j)], it = x && KITCHEN.item(x.id); if (!it) return;
      Object.assign(a, { id: it.id, s: it.v.length === 1 ? it.v[0].s : undefined, how: 'g', g: null, mi: undefined, mq: 1, phj: Number(b.dataset.j) }); return kAddDraw(); }
    if (act === 'kPick') { const it = KITCHEN.item(b.dataset.id); if (!it) return; Object.assign(ui.kAdd, { id: it.id, s: it.v.length === 1 ? it.v[0].s : undefined, how: 'g', g: null, mi: undefined, mq: 1 }); return kAddDraw(); }
    if (act === 'kPickMy') { Object.assign(ui.kAdd, b.dataset.t === 'pid' ? { pid: b.dataset.id, did: null } : { did: b.dataset.id, pid: null }, { how: 'g', g: null }); return kAddDraw(); }
    if (act === 'kBack') { const a = ui.kAdd; ui.kAdd = { mode: 'new', m: a.m, tab: a.tab, q: a.q || '', ph: a.ph }; return kAddDraw(); }
    if (act === 'kState') { ui.kAdd.s = b.dataset.v; ui.kAdd.mi = undefined; return kAddDraw(); }
    if (act === 'kHow') { ui.kAdd.how = b.dataset.v; return kAddDraw(); }
    if (act === 'kMeas') { ui.kAdd.mi = Number(b.dataset.j); ui.kAdd.mq = ui.kAdd.mq || 1; return kAddDraw(); }
    if (act === 'kMq') { ui.kAdd.mq = Math.max(0.5, Math.min(20, (ui.kAdd.mq || 1) + Number(b.dataset.v))); return kAddDraw(); }
    if (act === 'kHand') { const h = b.dataset.h; if (KITCHEN.HAND_KEYS.indexOf(h) < 0) return; ui.kAdd[h] = Math.max(0, Math.min(10, (ui.kAdd[h] || 0) + Number(b.dataset.v))); return kAddDraw(); }
    if (act === 'kSave') return kSave();
    if (act === 'kDel') { if (!confirm(LL('Видалити запис?', 'Delete this entry?'))) return; kdayW(ui.kDate || today()).items.splice(ui.kAdd.i, 1); save(); closeSheet(); return rKitchen(); }
    if (act === 'kCopy') { const d = ui.kDate || today(), yd = iso(new Date(tms(d) - 864e5)), day = kdayW(d); kday(yd).items.forEach((e) => day.items.push(Object.assign(JSON.parse(JSON.stringify(e)), { at: Date.now() }))); save(); toast(LL('Скопійовано з учора', 'Copied from yesterday')); return rKitchen(); }
    if (act === 'kGapAdd') {
      const N = kNorm(), d = today(), t = KITCHEN.dayTotals(kday(d), ksex(), kctx()), g = KITCHEN.proteinGap(t, N.nu ? N.nu.pLo : 0, kctx(), 3), x = g.list[Number(b.dataset.j)];
      if (!x) return;
      const e = Object.assign({}, x.e, { m: kMealNow(), at: Date.now() }), k = kit();
      if (e.t === 'my') { e.x = Object.assign({}, k.products[e.pid].per100); e.nm = k.products[e.pid].name; }
      if (e.t === 'dish') { e.x = Object.assign({}, k.dishes[e.did].per100); e.dq = k.dishes[e.did].q; e.nm = k.dishes[e.did].name; }
      kdayW(d).items.push(e); save(); toast(LL('Додано', 'Added')); return rKitchen();
    }
    if (act === 'kWater') return kWater(Number(b.dataset.v));
    if (act === 'kWaterHome') { const day = kdayW(kWaterDay()); day.water = (day.water || 0) + kit().set.glass; save(); haptic(); rHome(); if (kit().set.water) remindSync(false); return; }
    if (act === 'kWaterRemind') return kWaterRemind();
    if (act === 'kWSave') {
      const d = ui.kDate || today(), v = MI('weight', num(document.getElementById('kW').value));
      if (v === null || v < 25 || v > 300) { toast(isLb() ? LL('Вага — від 55 до 661 lb', 'Weight — 55 to 661 lb') : LL('Вага — від 25 до 300 кг', 'Weight — 25 to 300 kg')); return; }
      const arr = P().body.weight = P().body.weight || [], j = arr.findIndex((q) => q.d === d);
      if (j >= 0) arr[j].v = v; else arr.push({ d, v });
      save(); toast(LL('Збережено', 'Saved')); return rKitchen();
    }
    if (act === 'kMine') return kMine();
    if (act === 'kCombo') return kCombo(Number(b.dataset.m));
    if (act === 'kComboSave') return kComboSave();
    if (act === 'kComboAdd') return kComboAdd(b.dataset.id);
    if (act === 'kComboDel') { if (!confirm(LL('Видалити збережений прийом? Записи днів лишаться.', 'Delete this saved meal? Logged days stay.'))) return; delete kit().combos[b.dataset.id]; save(); return kMine(); }
    if (act === 'kSet') return kSettings();
    if (act === 'kAbout') return kAbout();
    /* прийоми й склянка — одразу, але без перемальовування шторки: набране в полях зросту, віку й часу не губиться */
    if (act === 'kSetMeals') { const n = Number(b.dataset.v); if ([3, 4, 5].indexOf(n) < 0) return; kit().set.meals = n; save(); sheetEl.querySelectorAll('[data-act="kSetMeals"]').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) === n)); return; }
    if (act === 'kSetGlass') { const n = Number(b.dataset.v); if ([250, 300, 350, 500].indexOf(n) < 0) return; kit().set.glass = n; save(); if (kit().set.water) remindSync(false); sheetEl.querySelectorAll('[data-act="kSetGlass"]').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) === n)); return; }
    if (act === 'kSetSave') {
      const p = P(), h = HDin(num(document.getElementById('meH').value)), a = num(document.getElementById('meA').value), te = document.getElementById('meT') ? BWin(num(document.getElementById('meT').value)) : null;
      if (h !== null && (h < 130 || h > 220)) { toast(isLb() ? LL('Зріст — від 51 до 86 дюймів', 'Height — 51 to 86 in') : LL('Зріст — від 130 до 220 см', "Height — 130 to 220 cm")); return; }
      if (a !== null && (a < 16 || a > 85)) { toast(LL('Вік — від 16 до 85', "Age — 16 to 85")); return; }
      if (te !== null && (te < 35 || te > 250)) { toast(isLb() ? LL('Цільова вага — від 78 до 551 lb', 'Target weight — 78 to 551 lb') : LL('Цільова вага — від 35 до 250 кг', "Target weight — 35 to 250 kg")); return; }
      const wk = document.getElementById('kWake').value, bd = document.getElementById('kBed').value, ok = (x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x || '');
      if (!ok(wk) || !ok(bd) || wk === bd) { toast(LL('Вкажіть час підйому й сну', 'Enter your wake-up and bed times')); return; }
      p.me = Object.assign({}, p.me || {}, { height: h, age: a, target: te });
      const sa = {}; if (h !== null) sa.height = h; if (a !== null) sa.age = a; if (Object.keys(sa).length) syncAnswers(sa);
      const k = kit(); k.set.wake = wk; k.set.bed = bd;
      save(); closeSheet(); toast(LL('Збережено', "Saved")); if (k.set.water) remindSync(false); return view === 'kitchen' ? rKitchen() : render();
    }
    if (act === 'kNewProd') return kNewProd();
    if (act === 'kProdEdit') return kNewProd(b.dataset.id);
    if (act === 'kProdSave') return kProdSave();
    if (act === 'kProdDel') { if (!confirm(LL('Видалити продукт? Записи минулих днів лишаться.', 'Delete this food? Past entries stay.'))) return; delete kit().products[ui.kProd.id]; save(); closeSheet(); return rKitchen(); }
    if (act === 'kNewDish') return kNewDish();
    if (act === 'kDishEdit') return kNewDish(b.dataset.id);
    if (act === 'kIngPick') { ui.kDish.pick = b.dataset.pid ? { t: 'my', pid: b.dataset.pid, x: Object.assign({}, kit().products[b.dataset.pid].per100) } : { t: 'food', id: b.dataset.id, s: b.dataset.s }; ui.kDish.q = ''; return kDishDraw(); }
    if (act === 'kIngAdd') { const g = num(document.getElementById('kdG').value); if (g === null || !(g > 0) || g > 20000) { toast(LL('Вкажіть грами: від 1 г до 20 кг', 'Enter grams: 1 g to 20 kg')); return; } ui.kDish.ings.push(Object.assign({}, ui.kDish.pick, { g, how: 'g' })); ui.kDish.pick = null; return kDishDraw(); }
    if (act === 'kIngDel') { ui.kDish.ings.splice(Number(b.dataset.j), 1); return kDishDraw(); }
    if (act === 'kDishSave') return kDishSave();
    if (act === 'kDishDel') { if (!confirm(LL('Видалити страву? Записи минулих днів лишаться.', 'Delete this recipe? Past entries stay.'))) return; delete kit().dishes[ui.kDish.id]; save(); closeSheet(); return rKitchen(); }
    if (act === 'bodyTab') { ui.bodyTab = b.dataset.v; return rBody(); }
    if (act === 'pose') { ui.photoPose = b.dataset.v; return rBody(); }
    if (act === 'measAdd') return measSheet(b.dataset.m);
    if (act === 'measSave') {
      const m = MEAS.find((x) => x[0] === b.dataset.m), v = MI(m[0], num(document.getElementById('measIn').value));  // введене в одиницях профілю → метрично
      if (v === null || v < m[3] || v > m[4]) { toast(LL('Перевірте число', "Check the number")); return; }
      const arr = p.body[m[0]] = p.body[m[0]] || [], t = today(), k = arr.findIndex((q) => q.d === t);
      if (k >= 0) arr[k].v = v; else arr.push({ d: t, v }); save(); closeSheet(); toast(LL('Збережено', "Saved")); return rBody();
    }
    if (act === 'photo') {
      const id = Number(b.dataset.id); const img = b.querySelector('img');
      openSheet(`<img src="${img ? img.src : ''}${LL(`" style="width:100%" alt="фото"><p></p><button type="button" class="ghost wide" style="color:var(--bad);border-color:var(--bad)" data-act="photoDel" data-id="`, `" style="width:100%" alt="photo"><p></p><button type="button" class="ghost wide" style="color:var(--bad);border-color:var(--bad)" data-act="photoDel" data-id="`)}${id}${LL(`">Видалити фото</button>`, `">Delete photo</button>`)}`); return;
    }
    if (act === 'photoDel') { if (!confirm(LL('Видалити фото?', "Delete photo?"))) return; STORE.delPhoto(Number(b.dataset.id)).then(() => { closeSheet(); rBody(); }); return; }
    if (act === 'saveTests') {
      const rec = { d: today() }; let any = false;
      TESTS.forEach(([k]) => { const v = num(document.getElementById('t_' + k).value); rec[k] = v; if (v !== null) any = true; });
      if (!any) { toast(LL('Заповніть хоча б один тест', "Fill in at least one test")); return; }
      const idx = p.body.tests.findIndex((t) => t.d === rec.d); if (idx >= 0) p.body.tests[idx] = rec; else p.body.tests.push(rec);
      save(); toast(LL('Тести збережено', "Tests saved")); return rBody();
    }
    /* більше */
    if (act === 'vset') { const k = b.dataset.k, v = b.dataset.v; if (k === 'mode') S().mode = v; else S().voice[k] = k === 'rate' ? Number(v) : v; save(); rMore(); if (k !== 'mode') { VOICE.unlock(); talk(k === 'rate' ? LL('Такий темп.', "Speaking at this pace.") : k === 'tone' ? (v === 'calm' ? LL('Добре, говоритиму спокійно.', "Okay, I’ll keep it calm.") : LL('Жарти лишаються. Скінчилось лише філонство.', "The jokes stay. The slacking is over.")) : v === 'short' ? LL('Говоритиму коротко.', "I’ll keep it short.") : LL('Говоритиму детально.', "I’ll go into detail.")); } return; }
    if (act === 'vpack') { ensureAudio(); S().voice.packs[DB.active] = b.dataset.id; S().voice.packsManual = S().voice.packsManual || {}; S().voice.packsManual[DB.active] = true; save(); const id = b.dataset.id;
      if (id) VOICEPACK.load(id).then(() => { rMore(); talk(LL('Привіт! Я твій тренер. Так звучатиме голос під час тренування.', "Hi! I’m your coach. This is how I’ll sound during your workout.")); VOICEPACK.download(id).then(() => packState()).catch(() => {}); }).catch(() => toast(LL('Не вдалося завантажити голос — перевірте інтернет', "Couldn’t download the voice — check your internet")));
      else { rMore(); talk(LL('Так звучить системний голос.', "This is the system voice.")); }
      return; }
    if (act === 'vdl') { const id = packId(), el = document.getElementById('vpState'); b.disabled = true;
      VOICEPACK.download(id, (d, t) => { if (el) el.textContent = LL('Зберігаю: ', "Saving: ") + (t ? Math.round(d / t * 100) + ' %' : Math.round(d / 1e6) + LL(' МБ', " MB")) + '…'; }).then(() => { toast(LL('Голос збережено в телефоні', "Voice saved on this phone")); packState(); b.disabled = false; }).catch(() => { toast(LL('Не вдалося — перевірте інтернет', "Didn’t work — check your internet")); b.disabled = false; });
      return; }
    if (act === 'tourReset') { S().tour = { v3: true }; save(); toast(LL('Навчання покажеться на головній і в першому тренуванні', "The tutorial will show on the home screen and in your first workout")); view = 'home'; return render(); }
    if (act === 'day') {
      if (p.draft) return;
      const dd = Number(b.dataset.d), nd = p.days.slice(), k = nd.indexOf(dd); if (k >= 0) nd.splice(k, 1); else nd.push(dd); nd.sort();
      /* програма за анкетою — від 2 до 4 днів, як в анкеті; дні йдуть і в програму (скільки тренувань на тиждень) */
      if (DB.custom && (nd.length < 2 || nd.length > 4)) { toast(LL('Від 2 до 4 днів на тиждень', "2 to 4 days a week")); return; }
      p.days = nd; syncAnswers({ days: nd }); save(); badgeSync(); remindSync(false); return rMore();  // нові дні — і в нагадування
    }
    if (act === 'backup') return backup();
    if (act === 'csv') return csv();
  }
  app.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) handle(b, e); });
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'qAgree') { qState().a.agree = t.checked; return; }
    if (t.id === 'remindTime' && /^\d{2}:\d{2}$/.test(t.value)) { S().remind = Object.assign({}, S().remind, { time: t.value }); save(); badgeSync(); remindSync(false).then((ok) => toast(ok ? LL('Нагадування — о ', "Reminder set for ") + t.value : LL('Не вдалося зберегти час — перевірте інтернет', "Couldn’t save the time — check your internet"))); }
  });

  /* ---------- запуск ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {}); });
    /* нова версія взяла керування — один раз перезавантажитись, щоб не лишатися на старих файлах.
       Перший запуск (керування ще не було) — без перезавантаження: файли вже нові, а анкета не має губитися. */
    const hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadCtl) return; try { if (sessionStorage.getItem('swReloaded') !== VERSION) { sessionStorage.setItem('swReloaded', VERSION); location.reload(); } } catch (e) { /* немає */ } });
  }
  /* сторінка й код різних версій (недокачане оновлення) — чистимо кеш файлів і перезавантажуємось один раз */
  (function () {
    const m = document.querySelector('meta[name="app-version"]'), want = m ? m.content : VERSION;
    let tried = ''; try { tried = sessionStorage.getItem('verFix') || ''; } catch (e) { /* немає */ }
    if (want !== VERSION && tried !== want && window.caches) {
      try { sessionStorage.setItem('verFix', want); } catch (e) { /* немає */ }
      caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== 'trening-voices').map((k) => caches.delete(k)))).then(() => location.reload());
    }
  })();
  /* Поворот (слово Alexа 23.10: «зафіксувати вертикальне положення … якщо це не можливо — розблокуй»): Android, застосунок з іконки, —
     лише вертикально (manifest «orientation: portrait», Chrome 39+); Safari на iPhone зафіксувати поворот вебзастосунку не дає
     (ні orientation у маніфесті, ні screen.orientation.lock — MDN/BCD), тож на iPhone застосунок працює й горизонтально
     (бічні відступи під виріз екрана — safe-area-inset-left/right). Заслінку «Поверніть телефон» 3.16.0 прибрано в 3.16.1. */
  /* iOS «присипляє» звук після згортання — будь-який дотик його будить */
  document.addEventListener('pointerdown', () => { VOICEPACK.unlock(); if (audio && audio.state !== 'running') { try { audio.resume(); } catch (e) { /* немає */ } } }, { passive: true });
  if (DB.active && !DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(DB.active);
  if (DB.active) ENGINE.migrate(DB);
  themeApply(themeNow());
  render();
  initPacks();
  document.title = LL('Тренування', 'Workouts');
  { const TABS = { home: LL('Головна', 'Home'), plan: LL('План', 'Plan'), kitchen: LL('Кухня', 'Kitchen'), body: LL('Тіло', 'Body'), progress: LL('Прогрес', 'Progress'), more: LL('Більше', 'More') };
    document.querySelectorAll('#tabs button').forEach((b) => { const t = TABS[b.dataset.tab], n = [...b.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim()); if (t && n) n.textContent = t; }); }
  badgeSync(); setTimeout(() => remindSync(false), 1500);  // підписка iPhone могла злетіти — тихо поновити й оновити розклад
  window.__app = { PLAT, get installEv() { return installEv; }, set installEv(v) { installEv = v; }, askFake: (q, a, help) => { if (q) ASK.chat.push({ q, a, pcm: [], done: true, heard: false }); ASK.help = !!help; ASK.st = 'idle'; askDraw(); }, get ASK() { return ASK; }, get PLAY() { return PLAY; }, askHush: () => askHush(), askTurn: (q) => askTurn(q), liveEnded: (k, g) => liveEnded(k, g), get DB() { return DB; }, get T() { return T; }, get missed() { return Array.from(missedSegs); }, talk: (t) => talk(t), kPhotoFake: (items) => { if (!ui.kAdd) return; ui.kAdd.ph = kPhotoResult({}, items ? { items } : null); kAddDraw(); }, initPacks: () => initPacks(), render: () => render(), set view(v) { view = v; } };
};
