var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Журнал тренувань 3.0 — інтерфейс: режим «Тренер» з голосом, список, план, прогрес, тіло. Дані лише в цьому телефоні + резервна копія файлом. */
/* Запускає ACC (accounts.js) після вибору користувача й входу. */
window.APP_START = () => {
  'use strict';
  window.APP_STARTED = true;
  document.body.classList.add('started');
  const VERSION = '3.27.10';
  /* знак застосунку: штанга на плашці бренду (замість K), середина грифа — охра */
  const MARK = window.MARK_SVG, WORD = window.WORD_SVG;  // знак і назва FORTES (з 3.27.2 — криві шрифту бренду; tools/logo/build.mjs)
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
  try { const ac = PROGRAMS.me && STORE.current && STORE.account(STORE.current); if (ac && ac.sub !== PROGRAMS.me.sub) STORE.update(STORE.current, { sub: PROGRAMS.me.sub }); } catch (e) { /* без акаунта — нічого */ }  // з 3.27.0
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
    if (Array.isArray(p.days) && p.days.length >= 2 && p.days.length <= GEN.maxDays(a) && srt(p.days) !== srt(a.days)) patch.days = p.days.slice().sort();
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
  const VRATES = [1, 1.2, 1.5, 2];  // швидкість голосу тренера (з 3.27.4)
  VOICE.init(DB.settings.voice);
  /* швидкість голосу (з 3.27.4): ×1 / ×1,2 / ×1,5 / ×2 — для записаного голосу, відповідей тренера й системного голосу (VOICE бере rate з того самого обʼєкта);
     до 3.27.4 «Темп» (0,9 / 1 / 1,1) був лише для системного голосу: 0,9 → ×1, 1,1 → ×1,2 */
  { const r = Number(DB.settings.voice.rate) || 1; DB.settings.voice.rate = VRATES.indexOf(r) >= 0 ? r : (r > 1 ? 1.2 : 1); VOICEPACK.setRate(DB.settings.voice.rate); }
  RADIO.setDuck(DB.settings.radio.duck);
  let view = DB.active ? 'home' : 'onboard';
  /* відкрили з нагадування про воду (з 3.27.1, sw.js → «./#kitchen»): одразу «Кухня» сьогодні; знак з адреси прибираємо, щоб оновлення сторінки не вертало сюди */
  if (location.hash === '#kitchen') { if (view === 'home') view = 'kitchen'; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* без історії */ } }
  const ui = { ob: 1, obProg: null, progTab: 'ex', progEx: null, metric: 'e1rm', range: 'all', musDays: 7, repMonth: null, bodyTab: null, planTab: 'w', calMonth: null, summary: null, photoPose: 'front', cmp: 50 };
  let audio = null, wakeLock = null, kp = null;
  /* голосовий тренер-співрозмовник: розмова, запис, сеанс Gemini Live, потоковий звук; gen — номер дії: нова дія глушить усі попередні */
  const ASK = { chat: [], st: 'idle', msg: '', rec: null, t0: 0, tick: null, i: -1, gen: 0, help: false, warn: false, photo: null };  // photo — фото до наступного питання { b64, src }
  /* kb — розмова в форматі «мінімум» (з 3.27.9): ядро бази в промпті, довідку до питання додає застосунок; kbs — теми, уже надіслані в цій розмові */
  const LIVE = { ws: null, ready: null, turn: null, prog: '', kb: false, kbs: [] };
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
  /* зміна зі знаком, до 0,1 (з 3.21.5 — тіло для тренера, звіт місяця, віхи) */
  const sgn1 = (v) => { const r = Math.round(Number(v) * 10) / 10; return (r > 0 ? '+' : r < 0 ? '−' : '') + fmt(Math.abs(r)); };
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
  /* назва тренування; з історії — і тоді, коли його вже немає в програмі (після 5–6 днів «верх / низ» — А / Б, з 3.27.0): базова назва — перекладом (G() — уже перекладена) */
  const woTitle = (w) => { const own = (G().workouts || {})[w]; return own ? own.title || w : TR((PROGRAMS.him.workouts[w] || {}).title || w); };
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
  function haptic(pattern) {
    if (!S().haptics) return;
    try { document.getElementById('hapLb').click(); } catch (e) { /* немає */ }
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(pattern || 12);
  }
  /* кінець відпочинку й паузи міо-підходу (з 3.27.10; план Google Play, розділ 3а п. 1; слово Alexа 29.10 «Спершу вібрація»): помітна серія замість 12 мс —
     там, де браузер уміє вібрацію (Chrome на Android з 32; лише після дотику людини до сторінки — з Chrome 60, MDN browser-compat-data 29.10);
     iPhone вібрації в Safari не має — там, як і було, дотик перемикача (hapLb); вимкнений «Вібровідгук» — тиша */
  const ALARM_VIB = [200, 100, 200];
  const hapticAlarm = () => haptic(ALARM_VIB);
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
  sheetEl.addEventListener('change', (e) => { const t = e.target; if (t && t.id === 'kpBarIn') { const f = t.files && t.files[0]; t.value = ''; if (f) kBarLoad(f); } });  // з 3.21.6: штрихкод
  function closeSheet() {
    document.body.classList.remove('sheet'); kp = null; if (ASK.rec) askCancel();
    /* 3D «великої трійки» в шторці (з 3.27.8): полотно 3D на застосунок одне — зупинити й повернути «Відновленню мʼязів» на головній */
    const mcg = typeof VIZ !== 'undefined' && sheetEl.querySelector('.mcg:not(.off)'); if (mcg) { mcg.classList.add('off'); VIZ.attach(null); if (view === 'home') render(); }
  }
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
  /* режим екрана тренування (з 3.27.7; слово Alexа 26.10: «Чому під час тренування, коли я перемикаюсь між режимами "крок за кроком" та "список" потім вони змінюються в налаштуваннях Більше?
     Більше для того й існує щоб виставити налаштування які мають бути завжди»): «Більше» → «Екран тренування» — S().mode (завжди); кнопки «☰ Усі вправи» / «Тренер»
     під час тренування — лише це тренування (draft.mode), наступне — знову за налаштуванням. До 3.27.7 перемикач переписував S().mode */
  const wMode = () => { const d = P() && P().draft; return (d && d.mode) || S().mode; };
  const coachOn = () => view === 'workout' && wMode() !== 'list' && P() && P().draft;
  function tickTimer() {
    if (!T.id) return;
    const left = Math.ceil((T.end - Date.now()) / 1000);
    if (left === 10 && T.total >= 30 && !T.said10 && T.kind === 'rest') { T.said10 = true; if (!speaking()) talk(LL('Десять секунд.', "Ten seconds.")); }
    if (coachOn()) {
      if (left <= 0) { if (!T.alarmed) { T.alarmed = true; const k = T.kind; beep(); hapticAlarm(); stopTimer(); onTimerEnd(k); } return; }
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
      if (!T.alarmed) { T.alarmed = true; beep(); hapticAlarm(); if (T.kind === 'myo') talk(LL('Ще від трьох до пʼяти повторень.', "Three to five more reps.")); else talk(T.next ? LL('Час! ', "Time! ") + T.next.split(' · ')[0] + '.' : LL('Час!', "Time!")); }
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
    { const ov = document.getElementById('tour'); if (ov && ov.dataset.view !== view) ov.remove(); }  // навчання іншого екрана — геть (не позначаємо «показано»: покажеться, коли людина повернеться)
    const nav = document.getElementById('tabs');
    nav.style.display = (view === 'onboard' || view === 'workout' || view === 'summary') ? 'none' : '';
    document.body.classList.toggle('wkv', view === 'workout');
    document.body.classList.toggle('coachv', view === 'workout' && wMode() !== 'list');
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
    app.innerHTML = `<div class="brand">${MARK}${WORD}</div><h1 style="margin-top:18px">Мова · Language</h1>
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
  /* вага журналу в інших одиницях: гантелі — з округленням до кроку дисків нового набору (inv — уже в нових одиницях), тренажери — до кроку тренажера;
     еспандер (рівень) і вага тіла — без перерахунку. Одна функція для «Більше» → «Одиниці» і для зміни одиниць у «Змінити відповіді» (з 3.27.7:
     до того анкета міняла лише одиниці, диски й гриф, а числа журналу лишались старими — 27,5 кг ставали «27,5 lb»; знайдено оглядом 26.10) */
  function logToUnits(p, prog, toLb, inv) {
    const f = toLb ? ENGINE.LB : 1 / ENGINE.LB, step = ENGINE.stepFor(inv), snap = (x, st) => Math.max(0, Math.round(Math.round(x / st) * st * 100) / 100);
    (p.sessions || []).forEach((s) => (s.sets || []).forEach((x) => {
      const ex = prog && prog.ex[x.ex]; if (!ex || x.load === null || x.load === undefined || x.load === '' || !(Number(x.load) >= 0)) return;
      if (ex.type === 'mach') x.load = snap(Number(x.load) * f, (ex.step || 5) * (toLb ? 2 : 1));
      else if (ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load)) x.load = snap(Number(x.load) * f, step);
    }));
  }
  function unitsSet(v) {
    const p = P(); if (!p || v === (p.units || 'kg') || (v !== 'kg' && v !== 'lb')) return;
    if (p.draft) { toast(LL('Спершу завершіть тренування', 'Finish your workout first')); return; }
    if (!confirm(LL('Перевести ваги журналу? Вага округлиться до дисків нового набору.', 'Convert the weights in your log? They will be rounded to the plates of the new set.'))) return;
    const toLb = v === 'lb', from = PLATES(!toLb), to = PLATES(toLb);
    const inv = {}; to.forEach((k, i) => { inv[k] = (p.inv || {})[from[i]] || 0; });
    logToUnits(p, PROGRAMS[DB.active], toLb, inv);
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
  /* з 3.27.7: зміна одиниць у відповідях перераховує журнал (qFinish → logToUnits) — людина бачить це до «Оновити програму» */
  function unitsLogNote(a) {
    const p = DB.profiles && DB.profiles.me; if (!p || !(p.sessions || []).length || (p.units === 'lb') === (a.units === 'lb')) return '';
    return `<p class="tiny muted" style="margin:-4px 0 10px">${a.units === 'lb' ? LL('Вага в журналі тренувань перерахується у фунти з округленням до ваших дисків.', 'Weights in your workout log will be converted to pounds, rounded to your plates.')
      : LL('Вага в журналі тренувань перерахується в кілограми з округленням до ваших дисків.', 'Weights in your workout log will be converted to kilograms, rounded to your plates.')}</p>`;
  }
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
      /* зміна анкети (з 3.27.0; слово Alexа 25.10: «приймаю рекомендації»): одразу «Ваші відповіді» — змінити лише потрібне, а не 9 кроків з початку */
      if (ui.q.edit) ui.q.step = qSteps(ui.q.a).length - 1;
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
      `)}<div class="seg" style="margin:4px 0 10px"><button type="button" class="${a.units !== 'lb' ? 'on' : ''}" data-act="qUnits" data-v="kg">${LL('кг · см', 'kg · cm')}</button><button type="button" class="${a.units === 'lb' ? 'on' : ''}" data-act="qUnits" data-v="lb">${LL('фунти · дюйми', 'lb · in')}</button></div>${unitsLogNote(a)}${numIn('qage', LL('Вік, років', "Age, years"), a.age)}${err('age')}${numIn('qheight', a.units === 'lb' ? LL('Зріст, дюймів', 'Height, in') : LL('Зріст, см', "Height, cm"), HD(a.height, a.units === 'lb'), undefined, a.units === 'lb' ? LL('Зріст у дюймах — для норми калорій.', 'Height in inches — for your calorie target.') : '')}${err('height')}${numIn('qweight', a.units === 'lb' ? LL('Вага, lb', 'Weight, lb') : LL('Вага, кг', "Weight, kg"), BW(a.weight, a.units === 'lb'), 'decimal', a.units === 'lb' ? LL('Вага у фунтах — для навантаження й норми білка.', 'Weight in pounds — for your training load and protein target.') : '')}${err('weight')}`;
    else if (step === 'goal') { const gs = GEN.goalsOf(a), why = (v) => (gs.indexOf(v) >= 0 || !GEN.GOAL_CLASH[v].some((x) => gs.indexOf(x) >= 0) ? '' : v === 'health' ? LL('не поєднується зі схудненням і набором мʼязів', "can’t be combined with losing weight or building muscle") : LL('не поєднується з «Сила й здоровʼя»', "can’t be combined with “Strength and health”"));
      body = `${LL(`<h1>Ваша мета</h1><p class="muted small">Можна кілька. «Схуднути» й «Набрати мʼязи» разом — менше жиру й більше мʼязів; «Сильна спина й осанка» — з будь-якою.</p><div class="pick">`, `<h1>Your goals</h1><p class="muted small">You can pick more than one. “Lose weight” and “Build muscle” together means less fat and more muscle; “Strong back and posture” goes with any goal.</p><div class="pick">`)}${[['loss', LL('Схуднути', "Lose weight"), LL('менше жиру, більше сил', "less fat, more energy")], ['muscle', LL('Набрати мʼязи', "Build muscle"), LL('більше обʼєму й сили', "more size and strength")], ['health', LL('Сила й здоровʼя', "Strength and health"), LL('міцне тіло без крайнощів', "a strong body, no extremes")], ['posture', LL('Сильна спина й осанка', "Strong back and posture"), LL('рівна спина, менше болю від сидіння', "a straight back, less pain from sitting")]].map(([v, l, d]) => opt('qGoal', v, l, d, gs.indexOf(v) >= 0, why(v))).join('')}</div>${err('goal')}`; }
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
    else if (step === 'days') body = `${LL(`<h1>Дні тренувань</h1><p class="muted small">${GEN.maxDays(a) === 4 ? 'Оберіть від 2 до 4 днів — усе тіло за тренування, краще з днем відпочинку між ними. Для 55+ і з тиском чи серцем 5–6 днів не пропонуємо: з обережними 3 підходами на вправу «верх / низ» дає менше роботи, ніж 3–4 дні, а поради для серця — про 2–3 силові тренування на тиждень.' : 'Оберіть від 2 до 6 днів. 2–4 дні — усе тіло за тренування, краще з днем відпочинку між ними; 5–6 — по черзі «верх» і «низ» тіла: тренування коротші, кожна група мʼязів 2–3 рази на тиждень.'}</p>
      <div class="qdays">`, `<h1>Workout days</h1><p class="muted small">${GEN.maxDays(a) === 4 ? 'Pick 2 to 4 days — full body each workout, ideally with a rest day in between. For 55+ and with blood pressure or heart issues we don’t offer 5–6 days: with careful 3 sets per exercise, upper/lower gives less work than 3–4 days, and heart guidance is about 2–3 strength workouts a week.' : 'Pick 2 to 6 days. 2–4 days — full body each workout, ideally with a rest day in between; 5–6 — upper and lower body in turn: shorter workouts, each muscle group 2–3 times a week.'}</p>
      <div class="qdays">`)}${GEN.DAYS.map(([d, l]) => opt('qDay', d, TR(l), '', a.days.indexOf(d) >= 0)).join('')}</div>${err('days')}`;
    else {
      const blk = GEN.check(a).block, lim = a.limits.filter((x) => x !== 'none');
      /* підсумок відповідей: біля кожної — «Змінити» (з 3.27.0): відкриває цей крок, «Готово» повертає сюди */
      const lbx = a.units === 'lb', row = (st, l, v) => `<li class="qsum"><span>${l}</span><b>${v}</b><button type="button" class="sm ghost" data-act="qJump" data-v="${st}">${LL('Змінити', "Change")}</button></li>`;
      body = `${q.edit ? LL('<h1>Ваші відповіді</h1><p class="muted small">Змініть потрібне й натисніть «Оновити програму» — історія тренувань збережеться.</p>', "<h1>Your answers</h1><p class=\"muted small\">Change what you need and tap “Update program” — your workout history is kept.</p>") : LL('<h1>Майже готово</h1>', "<h1>Almost done</h1>")}<div class="card"><ul class="list">
        ${row('who', LL('Імʼя', "Name"), esc(a.name) + (a.sex === 'f' ? LL(' · жінка', " · female") : a.sex === 'm' ? LL(' · чоловік', " · male") : ''))}
        ${row('body', LL('Вік · зріст · вага', "Age · height · weight"), `${fmt(a.age)} · ${fmt(HD(a.height, lbx))} ${MU('height', lbx)} · ${fmt(BW(a.weight, lbx))}${(lbx ? (t) => ENGINE.unitize('lb', t) : (t) => t)(LL(' кг', " kg"))}`)}
        ${row('goal', LL('Мета', "Goal"), esc(TR(GEN.goalText(a))))}
        ${row('level', LL('Досвід', "Experience"), a.level === 'exp' ? LL('тренуюсь регулярно', "I train regularly") : a.level === 'new' ? LL('новачок', "beginner") : '—')}
        ${row('place', LL('Де', "Where"), esc(TR(GEN.PLACES[a.place] || '').toLowerCase()))}
        ${a.place === 'gym' ? '' : row('equip', LL('Обладнання вдома', "Home equipment"), esc(kitText(a.equip)))}
        ${row('limits', LL('Здоровʼя', "Health"), lim.length ? lim.map((x) => ({ back: LL('спина', "back"), knees: LL('коліна', "knees"), shoulders: LL('плечі', "shoulders"), heart: LL('тиск/серце', "blood pressure/heart"), pregnant: LL('вагітність', "pregnancy") }[x])).join(', ') : LL('без обмежень', "no limitations"))}
        ${row('days', LL('Дні', "Days"), GEN.DAYS.filter(([d]) => a.days.indexOf(d) >= 0).map(([, l]) => TR(l)).join(', '))}</ul></div>
        ${blk ? `<div class="note b small">${esc(TR(blk))}</div>` : ''}
        ${lim.some((x) => x === 'back' || x === 'heart') && !blk ? LL('<div class="note w small">Перед стартом покажіть програму лікарю: при болю в спині чи проблемах із тиском це розумна страховка.</div>', "<div class=\"note w small\">Before you start, show the program to your doctor: with back pain or blood pressure issues, it’s a smart precaution.</div>") : ''}
        <label class="chk"><input type="checkbox" id="qAgree"${a.agree ? ' checked' : ''}${LL(`><span>Розумію: застосунок не замінює лікаря. При болю під час вправи — зупиняюсь.</span></label>`, `><span>I understand: this app doesn’t replace a doctor. If I feel pain during an exercise, I’ll stop.</span></label>`)}${err('agree')}`;
    }
    const last = q.step === QS.length - 1;
    app.innerHTML = `<div class="brand">${MARK}${WORD}${`</div>
      <div class="qprog" aria-hidden="true"><i style="width:`}${q.edit ? 100 : Math.round((q.step + 1) / QS.length * 100)}${LL(`%"></i></div><p class="tiny muted">`, `%"></i></div><p class="tiny muted">`)}${q.edit ? LL('Зміна анкети', "Editing questionnaire") : LL('Крок ', "Step ") + (q.step + 1) + LL(' з ', " of ") + QS.length}</p>
      ${body}
      ${(() => { const left = q.ret && !last ? LL('<button type="button" class="ghost" data-act="qSum">До відповідей</button>', "<button type=\"button\" class=\"ghost\" data-act=\"qSum\">To answers</button>")
          : q.step && !(q.edit && last) ? LL('<button type="button" class="ghost" data-act="qBack">Назад</button>', "<button type=\"button\" class=\"ghost\" data-act=\"qBack\">Back</button>") : q.edit ? LL('<button type="button" class="ghost" data-act="qCancel">Скасувати</button>', "<button type=\"button\" class=\"ghost\" data-act=\"qCancel\">Cancel</button>") : '';
        /* без «Назад» (перший крок) — «Далі» на всю ширину, як «Відновити» під нею (до 3.12.2 стояла праворуч несиметрично) */
        return `<div class="qnav${left ? '' : ' one'}">${left}`; })()}
      <button type="button" class="pri big" data-act="qNext">${last ? (q.edit ? LL('Оновити програму', "Update program") : LL('Скласти програму', "Build my program")) : q.ret ? LL('Готово', "Done") : LL('Далі', "Next")}</button></div>
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
    const p = DB.profiles.me, was = p.units === 'lb' ? 'lb' : 'kg';
    p.days = a.days.slice().sort(); p.handle = a.handle; p.units = a.units === 'lb' ? 'lb' : 'kg'; p.inv = {}; PLATES(p.units === 'lb').forEach((k) => { p.inv[k] = a.inv[k] || 0; });
    if (!fresh && was !== p.units) logToUnits(p, PROGRAMS.me, p.units === 'lb', p.inv);  // з 3.27.7 — як «Більше» → «Одиниці» (гриф і диски вже в нових одиницях)
    p.me = Object.assign({}, p.me || {}, { height: a.height, age: a.age });
    if (!fresh) keepWeek(p, oldPw, PROGRAMS.me);
    if (p.draft) p.draft = null;
    /* новому користувачеві картка «Нове» ні до чого — для нього все нове */
    if (fresh && Object.keys(DB.profiles).length === 1) { S().tour.v3 = true; S().tour.v4 = true; S().tour.v5 = true; }  // v5 — 3.24.0
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
  /* одна гантель і вага «у руках» (з 3.27.8; слова Alexа 26.10: «Коли вправа з 1 гантелею то правильно писати скільки на 1 бік, бо зараз пише так як для 2 гантель»;
     «Так само в таких місцях все підлаштувати під 1 гантель»): диски — «з кожного боку гантелі» (до 3.27.8 «на кожен бік» читалось як ліва й права рука, тобто дві гантелі);
     де гантель не в руках — сідничний міст, гантель лежить на тазі, — не «у руках 13 кг», а «гантель 13 кг» */
  const ON_BODY = { bridge: 1 };
  const SIDE_TXT = () => LL('з кожного боку гантелі: ', 'each side of the dumbbell: ');
  function plateLine(ex, it, load) {
    if (!hasKg(ex) || load === null || load === undefined || load === '') return '';
    const pl = ENGINE.plates(load, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap, isLb() ? 'lb' : 'kg');
    return `<span class="plt">${pl.ok ? (pl.side.length ? SIDE_TXT() + esc(pl.text) + ' ' + discs(pl.side) : LL('лише гриф', "handle only")) : '⚠ ' + esc(pl.text)}</span>`;
  }

  /* ---------- чернетка тренування ---------- */
  function plateSide(ex, it, load) {
    if (!hasKg(ex) || load === null || load === undefined || load === '') return null;
    const pl = ENGINE.plates(load, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap, isLb() ? 'lb' : 'kg');
    return pl.ok ? pl.side : null;
  }
  function makeItem(it0, ss, plan, step, o) {
    const prog = G(), p = P(), ex = prog.ex[it0.ex];
    /* варіант (з 3.21.9; слово Alexа 24.10: «чому не змінюються к-сть підходів та кг при натисканні різних кнопок?»): свої підходи й межі (болгарський — 3 × 8–10),
       своя історія й порада; варіанта ще не було — старт від найближчого, що був (ENGINE.variantStart), і підбір ваги після першого підходу (first) */
    const variant = o.variant || defaultVariant(it0.ex, plan), vo = ex.variants ? ex.variants.find((v) => v.id === variant) || null : null;
    const it = vo && (vo.sets || vo.min) ? Object.assign({}, it0, { sets: vo.sets || it0.sets, min: vo.min || it0.min, max: vo.max || it0.max }) : it0;
    const nS = prog.setsFor(it, plan.week), all = histAt(it.ex, o.where), hist = ENGINE.histVariant(ex, all, variant);
    const sug = ENGINE.suggest(prog, it.ex, it, nS, hist, p.handle, plan.deload, step, o.back);
    const vs = ex.type === 'amrap' ? null : ENGINE.variantStart(ex, all, variant, p.handle, step, prog.cap || 20);
    if (vs) {
      const lb = (id) => TR((ex.variants.find((v) => v.id === id) || {}).label || ''), withLoad = isLoad(ex) && ex.type !== 'band';
      sug.sets.forEach((x) => { if (withLoad) x.load = vs.load; if (vs.harder && ex.type === 'time') x.reps = it.min; });
      sug.note = LL('Новий варіант «', 'New variation “') + lb(variant) + LL('»: ', '”: ') + (!withLoad ? (vs.harder ? LL('перший раз — нижня межа', 'first time — the bottom of the range') : LL('як раніше', 'as before'))
        : ENGINE.dbCountOf(ex, variant) !== ENGINE.dbCountOf(ex, vs.from) ? LL('майже та сама вага в руках, що в «', 'about the same total weight as in “') + lb(vs.from) + LL('», — на ', '”, split over ') + ENGINE.dbCountOf(ex, variant) + LL(' гантелі (униз до дисків, що збираються)', ' dumbbells (rounded down to plates you can load)')
          : vs.harder ? LL('на крок легше, ніж у «', 'one step lighter than in “') + lb(vs.from) + LL('»', '”') : LL('та сама вага, що в «', 'the same weight as in “') + lb(vs.from) + LL('»', '”'))
        + LL(', запас 2–3.', ', 2–3 in reserve.') + (withLoad ? LL(' Після першого підходу вагу підправлю за відповіддю «скільки ще могли б».', ' After the first set I’ll fine-tune the weight from your “how many more” answer.') : '');
    }
    const last = hist.length ? hist[hist.length - 1].sets : [];
    const sets = sug.sets.map((s, j) => { const pv = last[j] || last[last.length - 1] || null; return { type: 'N', load: s.load, reps: s.reps, rir: null, done: false, pr: [], prev: pv ? { load: pv.load, reps: pv.reps } : null, touched: false }; });
    let note = sug.note, skipped = !!it.optional;
    if (o.ra && o.ra.act === 'skip') { skipped = true; note = LL('Сьогодні без цієї вправи — бережемо поперек.', "Skipping this exercise today — protecting your lower back."); }
    if (o.ra && o.ra.act === 'light') {
      const st = isMach(ex) ? loadStep(ex, it.ex, o.where) : step;
      let less = false; sets.forEach((s) => { if (typeof s.load === 'number' && s.load > 0) { s.load = Math.max(0, Math.round((s.load - st) * 100) / 100); less = true; } });
      note = (less ? LL('Спина ниє: вага на крок нижча, запас 3. ', "Back feels achy: one step lighter, 3 RIR. ") : LL('Спина ниє: запас 3, рух повільний і плавний. ', "Back feels achy: 3 RIR, slow and smooth reps. ")) + note;
    }
    /* «Болить суглоб» у минулих тренуваннях (з 3.21.5; слово Alexа 24.10, пункт 7): раз — вага на крок нижча й запас 3; двічі поспіль
       і більше — ще й порада замінити вправу й показатися лікарю; поперек сьогодні вже полегшено — вдруге вагу не знижуємо */
    const hurt = ENGINE.painRun(p.sessions, it.ex);
    if (hurt) {
      const st = isMach(ex) ? loadStep(ex, it.ex, o.where) : step;
      let less = false; if (!(o.ra && o.ra.act === 'light')) sets.forEach((s) => { if (typeof s.load === 'number' && s.load > 0) { s.load = Math.max(0, Math.round((s.load - st) * 100) / 100); less = true; } });
      note = (hurt >= 2 ? LL('Суглоб болів ', 'Joint pain ') + plural(hurt, LL('тренування', 'workout'), LL('тренування', 'workouts'), LL('тренувань', 'workouts')) + LL(' поспіль: замініть вправу («⋯» → «Замінити») і покажіться лікарю. ', ' in a row: swap the exercise (“⋯” → “Swap”) and see a doctor. ')
        : LL('Минулого разу болів суглоб. ', 'Your joint hurt last time. ')) + (less ? LL('Вага на крок нижча, запас 3. ', 'One step lighter, 3 RIR. ') : LL('Запас 3, рух плавний. ', '3 RIR, smooth reps. ')) + note;
    }
    /* з 3.25.0 — пункт 17 (слово Alexа 25.10: «Роби в такому порядку: А → Б → В → Г»; «обережно, доказ слабкий»): на початку фаз 2 і 3 (тижні 5 і 9) —
       лише порада спробувати наступний варіант вправи (кнопки варіантів — як були; рандомізоване дослідження, 121 людина, 6 тижнів: більше різноманіття —
       трохи краща прихильність). Лише коли поточний варіант зроблено ≥ 3 рази; не при болю в суглобі, «спина ниє», поперекових вправах при позначеній спині,
       55+ і тиску / серці (у них немає міо-підходів — myoFrom 0); у жіночій базовій програмі варіанти фази 3 задано планом */
    if (ex.variants && (plan.week === 5 || plan.week === 9) && !plan.deload && !o.back && !hurt && !o.ra && !o.from && prog.myoFrom && !(prog.backCare && ex.spine) && DB.active !== 'her' && hist.length >= 3) {
      const nx = ex.variants[ex.variants.findIndex((v) => v.id === (vo ? variant : ex.variants[0].id)) + 1];
      if (nx) note = (note ? note + ' ' : '') + LL('Нова фаза — можна спробувати «', 'New phase — you can try “') + TR(nx.label) + LL('» (кнопки варіантів над ціллю): трохи різноманіття підтримує охоту тренуватись.', '” (the variation buttons above the target): a bit of variety helps keep you motivated.');
    }
    if (o.from) note = LL('Замість «', "Instead of “") + prog.ex[o.from].name + LL('». ', '.” ') + note;
    if (o.myo && ex.iso && ex.type !== 'amrap' && sets.length) sets[sets.length - 1].type = 'M';
    /* plan — вага, яку запланував застосунок (з 3.27.8): з нею порівнюємо, чи вагу знизила сама людина (ENGINE.selfLower); easy — сьогодні застосунок сам полегшив вправу */
    sets.forEach((s) => { s.plan = s.load; });
    return { ex: it.ex, variant: vo ? variant : defaultVariant(it.ex, plan), skipped, optional: !!it.optional, note, ss, min: it.min, max: it.max, rest: it.rest, from: o.from || null, sets, first: !hist.length, easy: !!(o.ra && o.ra.act === 'light') || !!hurt };
  }
  /* перемкнули варіант (з 3.21.9): невиконані підходи — заново за порадою цього варіанта (вага, повторення, кількість); виконані лишаються як є;
     розминка — заново, якщо ще нічого не зроблено */
  function switchVariant(i, v) {
    const p = P(), d = p.draft, prog = G(), it = d && d.items[i]; if (!it || it.variant === v) return rWorkout();
    const W = d.place === 'gym' && prog.gymWorkouts ? prog.gymWorkouts : prog.workouts, src = ((W[d.workout] || {}).items || []).find((x) => x.ex === (it.from || it.ex));
    const base = Object.assign({}, src || { sets: it.sets.filter((x) => x.type !== 'W').length, min: it.min, max: it.max, rest: it.rest }, { ex: it.ex, optional: it.optional });
    const plan = ENGINE.planFor(prog, d.n), step = ENGINE.stepFor(p.inv), ra = ENGINE.readyAction(prog, it.ex, d.ready, d.items.map((x) => x.ex));
    const fr = makeItem(base, it.ss, plan, step, { ra: ra && ra.act !== 'swap' ? ra : null, from: it.from, myo: it.sets.some((x) => x.type === 'M'), where: d.place, back: d.back, variant: v });
    const done = it.sets.filter((x) => x.type !== 'W' && x.done), nw = fr.sets.filter((x) => x.type !== 'W');
    const work = nw.map((x, k) => done[k] || x).concat(done.slice(nw.length));
    let warm = it.sets.filter((x) => x.type === 'W');
    if (warm.length && !it.sets.some((x) => x.done)) {
      const fw = work.find((x) => !x.done), ws = ENGINE.warmups(prog.ex[it.ex], fw ? fw.load : null, step, prog.warm, 0);
      warm = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true }));
    }
    Object.assign(it, { variant: v, sets: warm.concat(work), min: fr.min, max: fr.max, note: fr.note, first: fr.first, calib: false });
    save(); haptic(); rWorkout();
  }
  function buildDraft(wid, ready, place, short) {
    const prog = G(), p = P(), n = nextN(), plan = ENGINE.planFor(prog, n);
    wid = wid || plan.workout;
    /* місце: обране перед тренуванням («і вдома, і в залі») або єдине місце програми */
    const where = place || prog.place || 'home', W = where === 'gym' && prog.gymWorkouts ? prog.gymWorkouts : prog.workouts;
    let items = W[wid].items.slice();
    let pairs = prog.supersets(plan.week, wid, where === 'gym' ? 'gym' : undefined);
    /* коротка версія (з 3.25.0, пункт 15): вправи з сьогоднішнього й іншого тренування — кожна велика група мʼязів ≥ 1 вправа (ENGINE.shortPick),
       1–2 підходи, щоб ≈ 20 хв (ENGINE.shortSets); суперсети — лише сьогоднішні пари; без міо- й дроп-підходів */
    if (short) {
      const pick = ENGINE.shortPick(prog, wid, W), ids = pick.map((it) => it.ex);
      pairs = pairs.filter((pr) => ids.indexOf(pr[0]) >= 0 && ids.indexOf(pr[1]) >= 0);
      const ns = ENGINE.shortSets(prog, pick, pairs, plan.deload);
      items = pick.map((it) => Object.assign({}, it, { sets: ns[it.ex] || 1, plus: 0, optional: false }));
    }
    const step = ENGINE.stepFor(p.inv);
    const ordered = ENGINE.orderItems(items, pairs);
    const present = ordered.map((o) => o.it.ex);
    /* повернення після перерви (ENGINE.comeback): вага частками від колишньої, без міо й дропів — до відмови не ходимо */
    const back = ENGINE.comeback(p.sessions, today(), (p.me || {}).age);
    const myo = !!prog.myoFrom && plan.week >= prog.myoFrom && !plan.deload && !back && !short;
    const list = ordered.map((o) => {
      const ra = ENGINE.readyAction(prog, o.it.ex, ready, present);
      const it = Object.assign({}, o.it); let from = null;
      if (ra && ra.act === 'swap') { from = it.ex; it.ex = ra.to; }
      return makeItem(it, o.ss, plan, step, { ra: ra && ra.act !== 'swap' ? ra : null, from, myo, where, back });
    });
    /* удома пара з двох вправ із гантелями — підряд, а не суперсетом: диски перекручують раз на вправу (з 3.27.10, ENGINE.homeStraight) */
    if (where === 'home') ENGINE.homeStraight(prog, list);
    /* розминковий підхід — перед першою базовою вправою з вагою */
    for (const st of ENGINE.stepOrder(list)) {
      const it = list[st.i], ex = prog.ex[it.ex], fw = it.sets.find((s) => s.type !== 'W');
      const ws = ENGINE.warmups(ex, fw ? fw.load : null, step, prog.warm, isMach(ex) ? loadStep(ex, it.ex, where) : 0);
      if (ws.length) { it.sets = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true })).concat(it.sets); break; }
    }
    return { n, week: plan.week, cycle: plan.cycle, workout: wid, short: short ? true : undefined, place: where, deload: plan.deload, back, date: today(), started: Date.now(), ready: ready || 'g', items: list, coach: { warm: false, myo: null, half: false, last: null } };
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
  /* Автоматичний голос тренера (з 3.21.8; слово Alexа 24.10: «потрібна кнопка яка вимикає/вмикає голос тренера під час тренування.
     за замовчування він має бути увімкненим завжди але в налаштуваннях … вимкнути … повністю, частково або не вимикати»):
     налаштування S().voice.auto — full (не вимикати, за замовчуванням) / part (лише головне: що робити, відпочинок, «Час!», рекорди — без техніки й жартів;
     застереження про поперек лишається) / off (сам не говорить). Кнопка з динаміком угорі тренування перемикає лише це тренування (d.vo),
     наступне — знову за налаштуванням. Натиснуте людиною («🔊 Як робити», «🔁 Повторити», перевірка голосу) звучить завжди — talk(t, true).
     S().voice.on лишається загальним вимикачем (ним глушать голос перевірки в браузері, §5). */
  const vAuto = () => { const v = S().voice.auto || 'full', d = P() && P().draft; return d && d.vo ? (d.vo === 'off' ? 'off' : v === 'off' ? 'full' : v) : v; };
  function autoTxt(m, db) {
    const w = db ? LL('вагу й диски', 'weight and plates') : LL('вагу', 'weight');
    return m === 'off' ? LL('Сам не говорить. «🔊 Як робити», «🔁 Повторити» і відповіді на питання звучать. Кнопка з динаміком угорі тренування вмикає голос на одне тренування.', 'Doesn’t speak on its own. “🔊 How to do it,” “🔁 Repeat,” and answers to your questions still play. The speaker button at the top of a workout turns the voice on for that workout.')
      : m === 'part' ? LL('Лише головне: вправа, підхід, ', 'Just the essentials: exercise, set, ') + w + LL(' й повторення, відпочинок, «10 секунд», «Час!», рекорди — без пояснень техніки й жартів. Кнопка з динаміком угорі тренування вимикає голос на одне тренування.', ' and reps, rest, “10 seconds,” “Time!,” PRs — no form explanations or jokes. The speaker button at the top of a workout turns the voice off for that workout.')
      : LL('Говорить усе: що робити, ', 'Says everything: what to do, ') + w + LL(', техніку, відпочинок, «10 секунд», «Час!», рекорди. Кнопка з динаміком угорі тренування вимикає голос на одне тренування.', ', form cues, rest, “10 seconds,” “Time!,” PRs. The speaker button at the top of a workout turns the voice off for that workout.');
  }
  /* номер «тиші» (з 3.22.3): askHush його збільшує — фраза, що чекала на голос (завантаження, запасний голос), після тиші вже не звучить */
  let vEpoch = 0;
  function talk(t, force) {
    const ep = vEpoch;
    if (!S().voice.on || (!force && vAuto() === 'off') || ASK.st === 'talk' || ASK.rec) return false;  // говорить тренер-співрозмовник або людина — фразу тренування пропускаємо
    const text = sp(t), id = I18N.lang === 'en' ? '' : packId();  // англійською — голос телефона: записані голоси українські
    if (I18N.lang === 'en') return sysSay(text, 'English: phone voice');
    if (!id) return sysSay(text, VPACKS.length ? LL('у налаштуваннях обрано системний голос', "system voice is selected in settings") : LL('записані голоси ще не завантажились', "recorded voices haven’t loaded yet"));
    /* опис голосу ще не завантажився (перші секунди після запуску) — дочекатися, а не перемикатися на системний */
    if (!VOICEPACK.packs[id]) { VOICEPACK.load(id).then(() => { if (ep === vEpoch) talk(t, force); }, () => ep === vEpoch && sysSay(text, LL('записаний голос не завантажився — перевірте інтернет', "recorded voice didn’t load — check your internet connection"))); return true; }
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
    VOICEPACK.play(id, segs, audio).then((ok) => { if (ok) { voiceInfo.mode = 'pack'; voiceInfo.why = ''; } else if (ep === vEpoch) sysSay(text, VOICEPACK.lastError || LL('запис не програвся', "recording didn’t play")); });
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
    if (prog.custom && !prog.askReady) return prepCard(wid, place) ? prepSheet(wid, place) : startWorkout(wid, 'g', place);
    return readySheet(wid, place);
  }
  /* «Що підготувати» перед стартом — удома всім (з 3.27.7; слово Alexа 26.10: «показуй «Що підготувати» вдома всім перед стартом»):
     кого питають про спину — блок у «Як спина сьогодні?»; решті — це вікно з «Почати»; без гантелей, еспандера й тренажерів — одразу старт */
  function prepSheet(wid, place) {
    openSheet(`<b>${LL('Що підготувати', 'What to get ready')}</b><p class="small muted">${LL('Підготуйте до старту — і почнемо.', 'Get these ready, then we’ll start.')}</p>${prepCard(wid, place)}
      <button type="button" class="pri wide" data-act="go" data-r="g" data-w="${wid || ''}" data-p="${place || ''}" data-tip="${esc(LL('Почати тренування.', 'Start the workout.'))}">${LL('Почати', 'Start')}</button>`);
  }
  function placeSheet(wid) {
    /* удома — саме те обладнання, що вказане в анкеті */
    const eq = (DB.custom && DB.custom.answers && DB.custom.answers.equip) || [], kit = kitText(eq, true);
    openSheet(`${LL(`<b>Де тренуєтесь сьогодні?</b><p class="small muted">Від цього залежать вправи тренування.</p>
      <div class="pick">`, `<b>Where are you training today?</b><p class="small muted">This decides which exercises are in your workout.</p>
      <div class="pick">`)}${[['home', LL('Вдома', "At home"), kit], ['gym', LL('У залі', "At the gym"), LL('тренажери й блоки', "machines and cables")]].map(([v, l, d]) => `<button type="button" data-act="place" data-v="${v}" data-w="${wid || ''}"><b>${l}</b><span class="small muted">${d}</span></button>`).join('')}</div>`);
  }
  /* «Перший раз у залі» (з 3.21.7; слово Alexа 24.10 — «Роби налаштування тренажерів і «Перший раз у залі» з перевірених джерел»): один раз — на старті першого тренування в залі.
     Джерела: Life Fitness, інструкції до силових тренажерів (штифт — до кінця; не виймати, поки вага піднята); ACE Exercise Library і посібник NSCA-CPT
     (суглоб — навпроти осі тренажера, сидіння й валики — до підходу); поради залів новачкам (Nuffield Health, PureGym, Planet Fitness, Philadelphia Inquirer:
     вода, рушник, взуття, вступне заняття, протерти, повернути на місце, пустити попрацювати, правила залу — на табличках). */
  const gymFirst = (d) => !!d && d.place === 'gym' && !S().tour.gym1 && !P().sessions.some((s) => s.place === 'gym');
  function gymFirstSheet() {
    const L2 = [
      LL('Візьміть воду, рушник і зручне спортивне взуття.', 'Bring water, a towel, and comfortable athletic shoes.'),
      LL('Попросіть працівника залу показати, як налаштовувати тренажери: у багатьох залах для новачків є вступне заняття.', 'Ask a staff member to show you how to adjust the machines — many gyms offer new members an intro session.'),
      LL('Перед підходом налаштуйте тренажер: сидіння, спинку й валики переставляють штифтом чи важелем — так, щоб суглоб, який рухається, був навпроти осі тренажера. Як саме — у «Як робити» на картці вправи.', 'Before your set, adjust the machine: the seat, back pad, and rollers move with a pin or lever — line up the moving joint with the machine’s pivot. The details are in “How to do it” on the exercise card.'),
      LL('Вага на блоці: вставте штифт до кінця в отвір потрібної плитки. Поки вага піднята, штифт не виймайте.', 'Weight stack: push the pin all the way into the hole of the plate you want. Never pull the pin while the weight is lifted.'),
      LL('Числа на вашому тренажері можуть відрізнятися від застосунку — поставте найближче й торкніться ваги на картці, щоб записати своє.', 'The numbers on your machine may differ from the app — pick the closest and tap the weight on the card to enter yours.'),
      LL('Після себе протріть сидіння й ручки, гантелі й диски поверніть на місце; між підходами можна пустити когось попрацювати.', 'Wipe down the seat and handles when you’re done, and put dumbbells and plates back; between sets, you can let someone work in.'),
      LL('Тренажер зайнятий — «⋯ Ще» → «Замінити». Правила саме вашого залу — на табличках у залі.', 'Machine taken? “⋯ More” → “Swap.” Your gym’s own rules are on the signs posted there.')
    ];
    openSheet(`<b>${LL('Перший раз у залі', 'First time at the gym')}</b><ul class="list">${L2.map((t) => `<li style="display:block"><span class="small">${t}</span></li>`).join('')}</ul>
      <button type="button" class="pri wide" data-act="closeSheet">${LL('Зрозуміло, починаємо', 'Got it, let’s start')}</button>`);
  }
  function startWorkout(wid, ready, place) {
    ensureAudio(); VOICE.unlock(); stopTimer();  // таймер від попереднього тренування не переносимо в нове
    P().draft = buildDraft(wid, ready, place, ui.shortNext); ui.shortNext = false; save();  // shortNext — обрано «Коротка версія» (з 3.25.0)
    const gs = gSay(P().draft, P().draft.coach && !P().draft.coach.warm ? 'start' : 'card');  // до малювання — щоб кнопка вже світилась
    const g1 = gymFirst(P().draft);
    view = 'workout'; render(); window.scrollTo(0, 0);
    if (g1) { S().tour.gym1 = true; save(); gymFirstSheet(); }
    badgeSync(); remindSync(false);  // почали — значок геть, сьогодні нагадування не прийде
    const d = P().draft, prog = G(), mins = ENGINE.estimateMins(prog, d.items), nEx = d.items.filter((x) => !x.skipped).length;
    const fs = freshSay(ENGINE.freshStart(P().sessions, trainDays(), d.date));  // з 3.24.0 (пункт 3)
    talk(fs + (d.short ? recOnly(LL('Коротка версія.', 'Short version.')) : '') + recOnly(woTitle(d.workout) + '.') + nEx + ' ' + VOICE.plural(nEx, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises")) + LL('. Приблизно ', ". About ") + mins + ' ' + VOICE.plural(mins, LL('хвилина', "minute"), LL('хвилини', "minutes"), LL('хвилин', "minutes")) + '.'
      + (ready === 'r' ? LL(' Сьогодні без вправ на поперек. ', " No lower back exercises today. ") + L('r', 0) : ready === 'y' ? LL(' Вправи на поперек сьогодні легші. ', " Lower back exercises are lighter today. ") + L('y', 0) : ' ') + (hard() ? L('start', d.n) : LL('Починаємо.', "Let’s get started.")) + (g1 ? COACH.guide('gym', G().sex).say + ' ' : '') + (wMode() === 'list' ? '' : LL(' Спершу розминка.', " Warm-up first.")) + gs);
    if (S().radio.only && S().radio.id && RADIO.state !== 'playing' && RADIO.state !== 'loading') RADIO.play(S().radio.id, audio);  // з 3.24.0 — радіо лише на тренуванні (пункт 16)
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
  const hard = () => S().voice.tone !== 'calm' && vAuto() !== 'part';  // «Частково» — без жартів характеру
  const L = (kind, seed) => (hard() ? COACH.line(kind, G().sex, seed) + ' ' : '');
  /* «Перші 3 тренування — за руку» (з 3.21.7; слово Alexа 24.10: «для перших різних тренеровок потрібен повний голосовий супровід тренера та підсказки що де і як натискати і чому»):
     тренер каже, що натиснути, а кнопка світиться (підказка — і текстом, для тих, хто без голосу). Лише режим «Тренер»; перші 3 тренування
     або 3 після «Показати навчання знову» чи вмикання в «Більше» → «Тренування». Момент — коли тренер і так говорить: start (розминка),
     card (картка підходу), rest (почався відпочинок), cool (усі підходи); за раз — не більше однієї підказки. Фрази — COACH.GUIDE. */
  const guideOn = () => !!S().guide && wMode() !== 'list' && !!P() && P().sessions.length - (S().guideFrom || 0) < 3;
  const backAsk = () => !(G().custom && !G().askReady);  // перед тренуванням питає про спину (beginWorkout)
  const G_AT = { start: ['start'], card: ['set', 'rir'], rest: ['rest', 'edit', 'more', 'ask'], cool: ['finish'] };
  const G_EL = { start: '.coach [data-act="cwarm"]:not([data-skip])', set: '.cdone', rest: '.crest .grid3 [data-act="tskip"]', rir: '.crir', edit: '.crest [data-act="kp"]', more: '#cMore', ask: '.wbar [data-act="ask"]', finish: '.coach [data-act="finish"]' };
  function gOk(k, d, nx) {
    const said = d.guide.said, cs = curStep(d);
    if (k === 'rir') { if (!said.set || !cs) return false; const s = d.items[cs.i].sets[cs.j]; return s.type !== 'W' && G().ex[d.items[cs.i].ex].type !== 'amrap'; }  // рядок «Скільки ще могли б» є на цій картці
    if (k === 'edit') return !!said.rest;
    if (k === 'more') return !!said.edit && !!nx && !d.items[nx.i].sets.some((x) => x.done);  // далі — нова вправа
    if (k === 'ask') return !!said.more;
    return true;
  }
  /* фраза підказки (з пробілом спереду) і що світити; '' — зараз підказки немає */
  function gSay(d, at, nx) {
    if (!d || !guideOn()) return '';
    const g = d.guide = d.guide || { said: {}, cur: null };
    const k = (G_AT[at] || []).find((x) => !g.said[x] && gOk(x, d, nx));
    if (!k) return '';
    g.said[k] = true; g.cur = k; save();
    return ' ' + COACH.guide(k, G().sex).say;
  }
  function guideMark(d) {
    const k = d.guide && d.guide.cur; if (!k || !guideOn()) return;
    /* не під час туру (огляд 24.10, слово Alexа: «без рядка-підказки під час туру»): тур цього екрана ще не пройдено чи він на екрані — рядок каже те саме; зʼявиться після туру */
    const tid = app.querySelector('.cdone') ? 'coach' : app.querySelector('.crest .cring') ? 'rest' : null;
    if (document.getElementById('tour') || (tid && !S().tour[tid])) return;
    const el = app.querySelector(G_EL[k]), host = app.querySelector('.coach'); if (!el || !host) return;
    el.classList.add('gpulse');
    const n = document.createElement('div'); n.className = 'note small gnote';
    n.innerHTML = `<span>👉 ${esc(COACH.guide(k, G().sex).show)}</span><button type="button" class="sm ghost" data-act="guideOff">${LL('Досить', 'Enough')}</button>`;
    const ch = host.querySelector('.cchips'); if (ch) ch.after(n); else host.prepend(n);
  }
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
  /* диски голосом (з 3.27.8, як на екрані): «З кожного боку гантелі — …» замість «На кожен бік — …» (з однією гантеллю звучало як дві) — лише коли нова фраза вже
     записана голосом тренера (без записаного голосу — одразу нова); до запису — стара записана, щоб речення не йшло системним голосом */
  function sideVoice(t) {
    const m = t.match(/На кожен бік — [^.]*\./); if (!m) return t;
    const nt = m[0].replace('На кожен бік — ', 'З кожного боку гантелі — '), id = packId();
    return !id || VOICEPACK.has(id, VOICE.split(nt)) ? t.replace(m[0], nt) : t;
  }
  function setSpeech(d, st, brief) {
    const it = d.items[st.i], ex = G().ex[it.ex], s = it.sets[st.j], full = S().voice.level !== 'short', sc = script(it.ex);
    let t = ex.name + '. ' + stepTitle(d, st) + '. ' + sideVoice(VOICE.target(ex, s, it, full ? plateSide(ex, it, s.load) : null));
    if (s.type === 'M') t += LL(' Міо-підхід: до відмови, далі короткі паузи.', " Myo-rep set: go to failure, then short rests.");
    if (s.type === 'D') t += LL(' Одразу.', " No rest.");
    if (ex.spine && s.type !== 'W') t += LL(' Запас два.', " Two reps in reserve.");
    if (it.ss && it.ss.k === 1) { const b = d.items[st.i + 1]; if (b && !b.skipped) t += LL(' Суперсет: одразу після — ', " Superset: then straight into ") + G().ex[b.ex].name + '.'; }
    const sd = COACH.side(it.ex, ''); if (sd && s.type !== 'W' && !it.sets.some((x) => x.done && x.type !== 'W')) t += ' ' + sd.say;  // один бік — порядок (з 3.21.9)
    if (brief) return sp(t);
    const doneN = it.sets.filter((x) => x.done).length, lastWork = s.type !== 'W' && !it.sets.slice(st.j + 1).some((x) => x.type !== 'W');
    if (ex.spine && s.type !== 'W' && !it.sets.some((x) => x.done && x.type !== 'W')) t += ' ' + COACH.line('spine', G().sex);
    if (vAuto() === 'part') return sp(t);  // «Частково»: без техніки; застереження про поперек — лишається
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
    ensureAudio(); s.done = true; haptic(); s.pr = []; s.variant = it.variant || undefined; d.lastAt = Date.now();  // варіант — свій у кожного підходу; час — для калорій (з 3.21.9)
    const histAll = ENGINE.history(p, it.ex, 'all');
    /* рекорд — лише коли вправа вже була в попередніх тренуваннях */
    if (s.type !== 'W' && histAll.length) {
      const earlier = it.sets.slice(0, j).filter((x) => x.done && x.type !== 'W').map((x) => ({ load: x.load, reps: x.reps, variant: it.variant, type: x.type }));
      s.pr = ENGINE.prTypes(ex, { load: s.load, reps: Number(s.reps), variant: it.variant, type: s.type }, histAll.concat(earlier.length ? [{ date: d.date, sets: earlier }] : []), p.handle);
    }
    const nx = it.sets[j + 1]; if (nx && !nx.done && !nx.touched && (nx.type === s.type || (s.type === 'N' && nx.type === 'M'))) nx.load = s.load;
    /* перший раз (вправи чи варіанта ще не було; з 3.21.9; ідея Джарвіса, прийнята 24.10): вага решти підходів — за відповіддю «скільки ще могли б» після першого робочого */
    if (it.first && !it.calib && s.type === 'N' && (ex.type === 'db' || ex.type === 'dbopt' || ex.type === 'mach' || (ex.type === 'time' && ex.load))) {
      it.calib = true; const dd = ENGINE.calibrate(s, it.min, it.max);
      if (dd) {
        const st = isMach(ex) ? loadStep(ex, it.ex, d.place) : ENGINE.stepFor(p.inv), cap = isMach(ex) ? (ex.cap || 300) : (G().cap || 20), nl = ENGINE.shiftLoad(ex, s.load, dd, st, cap);
        let ch = false; it.sets.forEach((x, k) => { if (k > j && !x.done && !x.touched && x.type !== 'W' && x.load !== nl) { x.load = nl; x.plan = nl; ch = true; } });
        if (ch) s.calib = dd;
      }
    }
    /* вагу знизила сама людина, а запас — 3+ (з 3.27.8): наступні підходи — знову запланована вага (до того вони брали знижену з цього підходу) */
    if (ENGINE.selfLower(s, lowCtx(d, it)) && s.rir >= 3) {
      let up = false; it.sets.forEach((x, k) => { if (k > j && !x.done && !x.touched && (x.type === 'N' || x.type === 'M') && typeof x.plan === 'number' && x.load !== x.plan) { x.load = x.plan; up = true; } });
      if (up) s.lowUp = true;
    }
    if (d.coach) d.coach.last = { i, j };
    save();
    if (s.pr.length) toast(LL('🏆 Рекорд: ', "🏆 PR: ") + ex.name, true);
    else if (s.calib) toast(calibText(s.calib));
    else if (s.lowUp) toast(LOW_UP());
    return s;
  }
  const LOW_UP = () => LL('Запас був 3+ — наступний підхід знову із запланованою вагою.', 'You had 3+ in reserve — the next set goes back to the planned weight.');
  /* що знижує вагу сам застосунок (ENGINE.selfLower не питає): легкий тиждень, повернення після перерви, полегшена сьогодні вправа, біль у суглобі сьогодні, вправа вперше */
  const lowCtx = (d, it) => ({ deload: !!ENGINE.planFor(G(), d.n).deload, back: !!d.back, easy: !!it.easy, pain: (d.pain || []).indexOf(it.ex) >= 0, first: !!it.first, short: !!d.short });
  const calibText = (dd) => (dd < 0 ? LL('Наступні підходи — на крок легше.', 'Next sets: one step lighter.') : LL('Наступні підходи — на крок важче.', 'Next sets: one step heavier.'));
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
    /* вагу знизила сама людина (з 3.27.8): раз на вправу за тренування — «що сталося?» (голосом — лише записана фраза, інакше лише вікно) */
    const it = d.items[cs.i], ask = !it.low && ENGINE.selfLower(s, lowCtx(d, it));
    const q = ask ? recOnly(LL('Вага нижча, ніж минулого разу — що сталося?', 'The weight is lower than last time — what happened?')) : '';
    if (s.type === 'M') { d.coach.myo = { i: cs.i, j: cs.j, k: 0 }; s.mini = []; save(); startTimer(15, LL('Міо: пауза', "Myo: rest"), 'myo'); rWorkout(); talk(pr + L('myo', 0) + LL('Пауза 15 секунд. Глибоко дихай.', "Rest 15 seconds. Breathe deep.")); return; }
    afterSet(d, cs.i, cs.j, pr + (s.calib ? calibText(s.calib) + ' ' : '') + (s.lowUp ? recOnly(LL('Наступний підхід — знову запланована вага.', 'Next set: back to the planned weight.')) : '') + q);
    if (ask) lowSheet(cs.i, cs.j);
  }
  /* «Вага нижча, ніж минулого разу» (з 3.27.8): причина — одним дотиком; «Болить» — правило болю («Болить суглоб»); на останньому підході вправи, коли безпечно
     (ENGINE.extraSetOk), — «＋ Ще один підхід» тією самою вагою, скільки вийде. Відповідь — у вправі тренування (it.low), удруге за тренування не питаємо */
  function lowSheet(i, j) {
    const d = P().draft, it = d.items[i], s = it.sets[j], ex = G().ex[it.ex];
    const last = !it.sets.some((x, k) => k !== j && !x.done && (x.type === 'N' || x.type === 'M')), extra = last && ENGINE.extraSetOk(G(), ex, lowCtx(d, it));
    const why = [['tired', '😮‍💨 ' + LL('Втома', 'Tired'), LL('Втома чи мало сну. Наступного разу застосунок підбере вагу за тим, що вийшло сьогодні.', 'Tired or short on sleep. Next time the app picks the weight from what you did today.')],
      ['pain', '🩹 ' + LL('Болить', 'It hurts'), LL('Відкриє правило болю: легше на крок або досить на сьогодні.', 'Opens the pain rule: one step lighter or enough for today.')],
      ['plan', '👌 ' + LL('Так задумав', 'On purpose'), LL('Свідомо легше — техніка, темп чи самопочуття.', 'Lighter on purpose — technique, tempo, or how you feel.')],
      ['kit', '⚖️ ' + LL('Немає потрібної ваги', 'No matching weight'), LL('Немає потрібних дисків чи тренажер інший.', 'No matching plates, or a different machine.')]];
    openSheet(`<div class="sp"><b>⚖️ ${LL('Вага нижча, ніж минулого разу', 'Lower weight than last time')}</b><button type="button" class="sm ghost" data-act="closeSheet">${LL('Закрити', 'Close')}</button></div>
      <p class="small">${esc(ex.name)}: ${LL('минулого разу', 'last time')} — ${esc(setText(ex, s.prev))}, ${LL('сьогодні', 'today')} — ${esc(setText(ex, s))}. ${LL('Що сталося?', 'What happened?')}</p>
      ${s.lowUp ? `<p class="small muted">${esc(LOW_UP())}</p>` : ''}
      <div class="grid2" style="margin-top:10px">${why.map(([k, t, tip]) => `<button type="button" data-act="lowWhy" data-i="${i}" data-v="${k}" data-tip="${esc(tip)}">${t}</button>`).join('')}</div>
      ${extra ? `<button type="button" class="pri wide" style="margin-top:12px" data-act="lowExtra" data-i="${i}" data-j="${j}" data-tip="${esc(LL('Додає в кінець вправи ще один робочий підхід тією самою вагою: скільки вийде, з тим самим запасом. Більше підходів — більше результату.', 'Adds one more working set at the same weight at the end of the exercise: as many reps as you can, with the same reserve. More sets, more results.'))}">＋ ${LL('Ще один підхід — скільки вийде', 'One more set — as many as you can')}</button>` : ''}`);
  }
  function afterSet(d, i, j, pre) {
    const st = draftStats(d), nx = curStep(d);
    let t = pre || '';
    if (!d.coach.half && st.total >= 6 && st.done * 2 >= st.total && nx) { d.coach.half = true; t += vAuto() === 'part' ? '' : hard() ? L('half', 0) : LL('Половина тренування позаду. ', "Halfway there. "); }
    save();
    if (!nx) { stopTimer(); const gs = gSay(d, 'cool'); rWorkout(); talk(t + LL('Усі підходи зроблено. ', "All sets done. ") + (coolText() ? LL('Заминка. ', "Cool-down. ") + (vAuto() === 'part' ? '' : coolText()) : LL('Можна завершувати.', "You can wrap up now.")) + gs); return; }
    const left = ENGINE.stepOrder(d.items).filter((x) => !d.items[x.i].sets[x.j].done).length;
    const rest = ENGINE.restAfter(d.items, i, j), lastTxt = left === 1 ? LL('Останній підхід тренування. ', "Last set of the workout. ") : '';
    const nIt = d.items[nx.i], restLine = nIt.sets.filter((x) => x.done).length >= 2 ? L('rest', d.n + i + j) : '';
    /* підказка про сам відпочинок — одразу після «Відпочинок N»; решта — у кінці фрази */
    if (rest > 0) { startTimer(rest, nextLabel(d), 'rest'); const gs = gSay(d, 'rest', nx), now = gs && d.guide.cur === 'rest'; rWorkout(); talk(t + LL('Відпочинок ', "Rest ") + VOICE.secs(rest) + '.' + (now ? gs : '') + ' ' + restLine + LL('Далі. ', "Next. ") + lastTxt + setSpeech(d, nx) + (now ? '' : gs)); }
    else { stopTimer(); const gs = gSay(d, 'card'); rWorkout(); talk(t + LL('Одразу. ', "No rest. ") + lastTxt + setSpeech(d, nx) + gs); }
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
    const cs = curStep(d), gs = cs ? gSay(d, 'card') : '';
    talk(cs ? LL('Час! ', "Time! ") + G().ex[d.items[cs.i].ex].name + '.' + gs : LL('Час!', "Time!"));
    if (view === 'workout') rWorkout();
  }

  /* ---------- екран тренування ---------- */
  function rWorkout() { if (!P() || !P().draft) { view = 'home'; return render(); } document.body.classList.toggle('coachv', wMode() !== 'list'); return wMode() === 'list' ? rList() : rCoach(); }
  const ICON = {
    themeAuto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" style="fill:currentColor"/></svg>',
    themeLight: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    themeDark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    coach: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    radio: '<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    spk: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    spkOff: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
  };
  /* голос тренера на це тренування (з 3.21.8) */
  const vBtn = () => { const on = vAuto() !== 'off'; return `<button type="button" class="ic" id="vBtn" data-act="vmute" aria-label="${on ? LL('вимкнути голос тренера', 'turn off the coach voice') : LL('увімкнути голос тренера', 'turn on the coach voice')}">${on ? ICON.spk : ICON.spkOff}</button>`; };
  function wbar(d, prog, st) {
    const list = wMode() === 'list';
    return `${LL(`<div class="wbar"><button type="button" class="ghost" data-act="minimize" aria-label="згорнути">⌄</button>
      <div class="t"><b>`, `<div class="wbar"><button type="button" class="ghost" data-act="minimize" aria-label="minimize">⌄</button>
      <div class="t"><b>`)}${esc(wTitle(d))}</b><span id="elapsed">0:00</span> · <span>${st.done}/${st.total}${LL(`</span></div>
      <div class="wbr"><button type="button" class="ic" data-act="ask" aria-label="запитати тренера">`, `</span></div>
      <div class="wbr"><button type="button" class="ic" data-act="ask" aria-label="ask the coach">`)}${ICON.mic}</button>${vBtn()}<button type="button" class="ic${RADIO.state === 'playing' || RADIO.state === 'loading' ? ' rad' : ''}${LL(`" id="radBtn" data-act="radio" aria-label="радіо">`, `" id="radBtn" data-act="radio" aria-label="radio">`)}${ICON.radio}</button><button type="button" class="ic" id="modeBtn" data-act="mode" aria-label="${list ? LL('режим тренера', "coach mode") : LL('список усіх вправ', "list of all exercises")}">${list ? ICON.coach : ICON.list}${LL(`</button><button type="button" class="pri" data-act="finish">Готово</button></div>
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
    vizAttach(d);
    startElapsed(d); keepAwake(true);
    if (T.id) tickTimer();
    guideMark(d);
    if (document.querySelector('.cdone')) tourMaybe('coach');
    else if (T.id && T.kind === 'rest' && document.querySelector('.crest .cring')) tourMaybe('rest');
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
    const vsel = ex.variants ? `<div class="seg">${ex.variants.map((v) => `<button type="button" class="${v.id === it.variant ? 'on' : ''}" data-act="variant" data-i="${cs.i}" data-v="${v.id}"${v.tip ? ` data-tip="${esc(v.tip)}"` : ''}>${esc(v.label)}</button>`).join('')}</div>` : '';
    const tgt = ex.type === 'amrap' ? LL('скільки зможете', "as many as you can") : s.type === 'M' ? LL('до відмови', "to failure") : s.type === 'W' ? LL('легко', "easy") : (it.min === it.max ? it.max : it.min + '–' + it.max) + (ex.type === 'time' ? LL(' с', " sec") : '');
    /* вправа на один бік (з 3.21.9): один підхід — обидва боки, відпочинок — після обох; ціль — на кожен бік */
    const sd = s.type !== 'W' ? COACH.side(it.ex, s.type === 'M' ? LL('до відмови', 'to failure') : tgt) : null;
    const mt = (w) => (isMach(ex) ? ` data-tip="${w}${LL(` на крок тренажера: `, ` one machine step: `)}${fmt(loadStep(ex, it.ex))}${KG(LL(` кг."`, ` kg."`))}` : '');
    const pm = (f) => `<div class="cpm"><button type="button" data-act="cstep" data-f="${f}" data-d="-1" ${ij}${LL(` aria-label="менше"`, ` aria-label="decrease"`)}${f === 'load' ? mt(LL('Менше', "Down")) : ''}>−</button><button type="button" data-act="cstep" data-f="${f}" data-d="1" ${ij}${LL(` aria-label="більше"`, ` aria-label="increase"`)}${f === 'load' ? mt(LL('Більше', "Up")) : ''}>+</button></div>`;
    const kgOn = hasKg(ex) && s.load !== null && s.load !== undefined && s.load !== '';
    const boxL = isLoad(ex) ? `<div class="cbox"><span class="cl2">${ex.type === 'band' ? LL('рівень еспандера', "band level") : isMach(ex) ? KG(LL('вага, кг', "weight, kg")) : KG(LL('диски на гантель, кг', "plates per dumbbell, kg"))}</span>
      <button type="button" class="cval" data-act="kp" data-f="load" ${ij}${loadTip(ex, LL('. Торкніться, щоб ввести інше число.', ". Tap to enter a different number."))}>${esc(loadText(ex, s.load))}</button>${pm('load')}
      <span class="tiny muted"${isMach(ex) ? KG(LL(' data-tip="Крок цього тренажера: на стільки кг змінюють вагу кнопки − і +. На вашому тренажері інший — введіть свою вагу цифрами: застосунок підхопить крок."', " data-tip=\"This machine’s step: the − and + buttons change the weight by this many kg. If your machine’s step is different, type in your weight and the app will pick it up.\"")) : ex.type === 'band' ? LL(' data-tip="Рівень — сума номерів джгутів, якщо їх кілька."', " data-tip=\"Level is the sum of the band numbers if you use more than one.\"") : ''}>${kgOn ? (ON_BODY[it.ex] ? LL('гантель ', 'dumbbell ') : LL('у руках ', "total ")) + fmt(ENGINE.totalLoad(ex, s.load, P().handle, it.variant)) + KG(LL(' кг', " kg")) : ex.type === 'band' ? LL('сума номерів джгутів', "sum of band numbers") : isMach(ex) ? LL('на тренажері · крок ', "on machine · step ") + fmt(loadStep(ex, it.ex)) : '&nbsp;'}</span></div>` : '';
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
      ${vsel}${sd ? `<div class="hint side">↔ ${esc(sd.card)}</div>` : ''}${it.note ? `<div class="hint">💡 ${esc(it.note)}</div>` : ''}${plat}${painHint(it)}${userNote}
      <div class="ctarget${isLoad(ex) ? '' : ' one'}">${boxL}${boxR}</div>
      ${plateLine(ex, it, s.load)}
      ${s.prev && s.type !== 'W' ? `<button type="button" class="ghost cprev" data-act="copyprev" ${ij}${LL(`>Минулого: `, `>Last time: `)}${esc(setText(ex, s.prev))}${LL(` — повторити</button>`, ` — repeat</button>`)}` : ''}
      ${rir}
      <button type="button" class="pri wide big cdone" data-act="cdone">✓ ${s.type === 'W' ? LL('Розминковий підхід зроблено', "Warm-up set done") : LL('Підхід виконано', "Set done")}</button>
      ${vizBox(d, it)}${techHtml(it.ex, !it.sets.some((x) => x.done) && !vizOpen(d, it))}${LL(`
      <div class="grid3 cacts"><button type="button" data-act="say" data-what="tip">🔊 Як робити</button><button type="button" data-act="say" data-what="set">🔁 Повторити</button><button type="button" id="cMore" data-act="exmenu" data-i="`, `
      <div class="grid3 cacts"><button type="button" data-act="say" data-what="tip">🔊 How to do it</button><button type="button" data-act="say" data-what="set">🔁 Repeat</button><button type="button" id="cMore" data-act="exmenu" data-i="`)}${cs.i}${LL(`">⋯ Ще</button></div>
      </div>`, `">⋯ More</button></div>
      </div>`)}${upcoming(d, cs)}${phaseBox(d)}`;
  }
  /* 3D-рух (з 3.22.0; слово Alexа 24.10: «Роби день 5 візуалізації: у застосунок, лише картка підходу «Тренер»»): лише тут — картка підходу «Тренер».
     Розгорнутий на першому підході нової вправи чи нового варіанта (it.first — історії немає), далі — згорнутий; що людина відкрила чи згорнула — у чернетці (d.vz).
     Місце — під кнопкою «Підхід виконано», над «Як робити» (огляд 24.10, слово Alexа: «3D під кнопку «Підхід виконано»»): над ціллю розгорнутий блок ховав ціль і кнопку
     за край екрана на першому підході кожної нової вправи (кнопка — до 1228 px при екрані 878, у Safari — 699); поки 3D розгорнуте, «Як робити» згорнуте.
     Анімація, тема, «Зменшити рух», кадри — у viz.js; анімація — та сама, що в атласі (tools/viz/atlas3d.html) */
  const vzKey = (it) => VIZ.keyFor(it.ex, it.variant, (PROGRAMS[DB.active] && PROGRAMS[DB.active].ex[it.ex]) || GEN.GYM.ex[it.ex]);
  /* розгорнутий: людина сама відкрила / згорнула (d.vz) — так і лишається; інакше — перший підхід нової вправи чи варіанта */
  /* rest — екран відпочинку (з 3.27.8; слово Alexа 26.10: «Тут теж потрібно показувати 3D модель для кожної вправи»): там 3D наступної вправи
     розгорнутий завжди — відпочинок і є час подивитись, як робити далі; згорнула людина — так і лишається (той самий d.vz, що й на картці) */
  const vizOpen = (d, it, rest) => { if (typeof VIZ === 'undefined') return false; const k = vzKey(it); if (!k) return false; const vz = d.vz || {}; return vz[k] !== undefined ? vz[k] : rest ? true : !!(it.first && !it.sets.some((x) => x.done)); };
  function vizBox(d, it, rest) {
    if (typeof VIZ === 'undefined') return '';
    const k = vzKey(it); if (!k) return '';
    const open = vizOpen(d, it, rest);
    return `<details class="vz3" data-k="${k}"${open ? ' open' : ''}><summary><b>${LL('Як рухатись — 3D', 'How to move — 3D')}</b><span class="small muted">${LL('Пальцем можна повернути вигляд', 'Drag to turn the view')}</span></summary>${vizInner()}</details>`;
  }
  /* начинка блоку 3D: полотно, підпис фази, пауза, режими й стилі (картка «Тренер» і з 3.27.3 — «Як виконувати тести») */
  function vizInner() {
    return `<div class="vzb"><div class="vzc"></div><div class="vzcap"><span class="vzph"></span><button type="button" class="ic" data-vz="pp" data-tip="${esc(LL('Пауза або знову грати. Пальцем по картинці — повернути вигляд.', 'Pause or play again. Drag the picture to turn the view.'))}">⏸</button></div><div class="vznote"></div>
      <div class="seg vzm"><button type="button" data-vzm="move" data-tip="${esc(LL('Рух: як виконувати — підпис показує фазу.', 'Motion: how to do it — the caption shows the phase.'))}">${LL('Рух', 'Motion')}</button><button type="button" data-vzm="mus" data-tip="${esc(LL('Мʼязи, що працюють, — підсвічені охрою.', 'The working muscles are highlighted in ochre.'))}">${LL('Мʼязи', 'Muscles')}</button><button type="button" data-vzm="bad" data-tip="${esc(LL('Найчастіша помилка — червоним поверх правильного руху.', 'The most common mistake — in red over the correct movement.'))}">${LL('Помилка', 'Mistake')}</button></div>
      <div class="seg vzs"><button type="button" data-vzs="clay" data-tip="${esc(LL('Манекен — суцільне тіло, рух видно найчіткіше.', 'Mannequin — a solid body, the movement is easiest to see.'))}">${LL('Манекен', 'Mannequin')}</button><button type="button" data-vzs="xray" data-tip="${esc(LL('Анатомія — напівпрозоре тіло, мʼязи видно всередині.', 'Anatomy — a see-through body with the muscles inside.'))}">${LL('Анатомія', 'Anatomy')}</button></div></div>`;
  }
  function vizAttach(d) {
    if (typeof VIZ === 'undefined') return;
    VIZ.attach(app.querySelector('details.vz3'), {
      t: TR, esc, mus: (ids) => ids.map(mName).join(' · ').toLowerCase(),
      style: () => (S().vz3 === 'xray' ? 'xray' : 'clay'), setStyle: (v) => { S().vz3 = v; save(); },
      onToggle: (open) => { const det = app.querySelector('details.vz3'); if (!det) return; (d.vz = d.vz || {})[det.dataset.k] = open; save(); },
      L: { right: LL('правий бік', 'right side'), left: LL('лівий бік', 'left side'), work: LL('Працюють: ', 'Working: '), red: LL(' — червоним', ' — shown in red'),
        wait: LL('Завантаження…', 'Loading…'), fail: app.querySelector('.crest details.vz3') ? LL('3D недоступне на цьому пристрої.', '3D isn’t available on this device.') : LL('3D недоступне на цьому пристрої — дивіться «Як робити» нижче.', '3D isn’t available on this device — see “How to do it” below.'),  /* на відпочинку «Як робити» немає */
        play: LL('Грати', 'Play'), pause: LL('Пауза', 'Pause') } });
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
      `, `</span></summary>
      `)}${sc.adjust ? `<p><b>${LL('Налаштування.', 'Machine setup.')}</b> ${esc(sc.adjust)}</p>` : ''}${LL(`<p><b>Положення.</b> `, `<p><b>Setup.</b> `)}${esc(sc.setup)}${LL(`</p><p><b>Рух.</b> `, `</p><p><b>Movement.</b> `)}${esc(sc.move)}</p>${sc.breath ? `${LL(`<p><b>Дихання.</b> `, `<p><b>Breathing.</b> `)}${esc(sc.breath)}</p>` : ''}
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
    /* під «Далі» — 3D наступної вправи (з 3.27.8); «✎ Виправити щойно зроблений підхід» — над «Далі»: він про підхід, який щойно зробили, і лишається на першому екрані */
    if (nx) { const it = d.items[nx.i], ex = prog.ex[it.ex], s = it.sets[nx.j]; nxt = `${LL(`<div class="cnext"><span class="tiny muted">Далі`, `<div class="cnext"><span class="tiny muted">Up next`)}${it.ss ? LL(' · суперсет ', " · superset ") + it.ss.g : ''}</span><b>${esc(ex.name)}</b><span class="small">${esc(stepTitle(d, nx))} · ${esc(setText(ex, s))}${ex.side ? LL(' на бік', " per side") : ''}</span>${plateLine(ex, it, s.load)}</div>${vizBox(d, it, true)}`; }
    return `<div class="coach crest"><div class="cring">${ringSvg()}${LL(`<div class="ctime"><b id="cTime">0:00</b><span>відпочинок</span></div></div>
      <div class="grid3"><button type="button" data-act="tadd" data-v="-15">−15 с</button><button type="button" data-act="tadd" data-v="15">+15 с</button><button type="button" class="pri" data-act="tskip">Почати</button></div>
      `, `<div class="ctime"><b id="cTime">0:00</b><span>rest</span></div></div>
      <div class="grid3"><button type="button" data-act="tadd" data-v="-15">−15 sec</button><button type="button" data-act="tadd" data-v="15">+15 sec</button><button type="button" class="pri" data-act="tskip">Start</button></div>
      `)}${last ? `<button type="button" class="ghost wide" data-act="kp" data-f="reps" data-i="${last.i}" data-j="${last.j}${LL(`">✎ Виправити щойно зроблений підхід</button>`, `">✎ Edit the set you just did</button>`)}` : ''}${nxt}${LL(`
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
    const vsel = ex.variants ? `<div class="seg">${ex.variants.map((v) => `<button type="button" class="${v.id === it.variant ? 'on' : ''}" data-act="variant" data-i="${i}" data-v="${v.id}"${v.tip ? ` data-tip="${esc(v.tip)}"` : ''}>${esc(v.label)}</button>`).join('')}</div>` : '';
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
      `)}${vsel}${note ? `<div class="hint">💡 ${esc(note)}</div>` : ''}${plat}${painHint(it)}${userNote}
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
      it.sets.forEach((s) => { if (!s.done || !(Number(s.reps) > 0)) return; const x = { ex: it.ex, variant: s.variant || it.variant || undefined, type: s.type || 'N', load: s.load === '' ? null : s.load, reps: Number(s.reps), rir: s.rir === null || s.rir === undefined ? null : Number(s.rir) }; if (s.mini && s.mini.length) x.mini = s.mini.filter((r) => r > 0); sets.push(x); (s.pr || []).forEach((t) => types.add(t)); });
      if (types.size) prList.push({ ex: it.ex, types: Array.from(types) });
    });
    if (!sets.length) { if (confirm(LL('Жодного підходу не відмічено. Закрити тренування без збереження?', "No sets checked off. Close the workout without saving?"))) { p.draft = null; save(); stopTimer(); view = 'home'; render(); remindSync(false); } return; }
    const st = draftStats(d);
    /* з 3.24.0 (пункт 14; Milkman та ін., Nature 2021 — найкраща з 54 програм: винагорода саме за повернення після пропущеного тренування):
       скільки днів тренувань за планом пропущено до цього — рахується до запису, тренування того самого дня вже не «повернення» */
    const miss = ENGINE.missedDays(p.sessions, trainDays(), d.date);
    if (st.done < st.total && !confirm(LL('Відмічено ', "Checked off ") + st.done + LL(' з ', " of ") + st.total + LL(' підходів. Завершити тренування?', " sets. Finish the workout?"))) return;
    const sess = { id: Date.now(), date: d.date, n: d.n, week: d.week, workout: d.workout, place: d.place === 'gym' || d.place === 'home' ? d.place : undefined, deload: d.deload, back: d.back && d.back.f ? d.back.f : undefined, ready: d.ready || 'g', mins: Math.max(1, Math.round((Date.now() - d.started) / 60000)), kmins: d.lastAt ? Math.max(1, Math.min(Math.round((Date.now() - d.started) / 60000), Math.round((d.lastAt - d.started) / 60000))) : undefined, sets, prs: prList.reduce((a, x) => a + x.types.length, 0), prList, pain: d.pain && d.pain.length ? d.pain.slice() : undefined, ret: miss ? miss.missed : undefined, short: d.short ? true : undefined };  // pain — з 3.21.5; ret — з 3.24.0; short — з 3.25.0
    p.sessions.push(sess); if (S().guide && p.sessions.length - (S().guideFrom || 0) >= 3) S().guide = false;  /* «за руку» — 3 тренування */ p.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    p.draft = null; save(); stopTimer(); keepAwake(false);
    if (S().radio.only) RADIO.stop();  // з 3.24.0 — радіо лише на тренуванні (пункт 16)
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
      extra = `<p class="small muted" style="text-align:center">${v === null ? (ex.type === 'dbopt' ? LL('без гантелі', "no dumbbell") : '') : (ON_BODY[it.ex] ? LL('гантель: ', 'dumbbell: ') : LL('усього в руках: ', "total in hand: ")) + fmt(tot) + KG(LL(' кг', " kg"))}${pl ? ' · ' + (pl.ok ? (pl.side.length ? SIDE_TXT() + esc(pl.text) + ' ' + discs(pl.side) : LL('лише гриф', "handle only")) : '⚠ ' + esc(pl.text)) : ''}</p>`;
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
  /* калорії тренування (з 3.21.9; слово Alexа 24.10) — ENGINE.sessionKcal: Compendium 2024, силове тренування 3,5 MET; пояснення — на затисканні */
  /* приріст у звіті місяця (аудит 25.10: без підказки на затисканні): з чим порівнюємо — ENGINE.monthReport / metric */
  const GAIN_TIP = () => LL('Приріст — найкращий підхід цього місяця проти найкращого до нього: для гантелей і тренажерів — розрахунковий максимум (вага й повторення разом), для петлі — опір × повторення, для власної ваги — повторення.', 'Gain — your best set this month vs your best before it: for dumbbells and machines, estimated 1RM (weight and reps together); for the band, resistance × reps; for bodyweight, reps.');
  const KC_TIP = () => LL('Оцінка за довідником Compendium 2024 (силове тренування, 3,5 MET): 3,5 × вага тіла × години — від старту до останнього підходу, разом із відпочинками. «Понад спокій» — те, що додало саме тренування. Норма калорій у «Кухні» вже враховує тренування — до їжі їх не додавайте.',
    'An estimate from the 2024 Compendium of Physical Activities (strength training, 3.5 MET): 3.5 × body weight × hours, from the start to your last set, rests included. “Above rest” is what the workout itself added. Your calorie target in “Kitchen” already includes training — don’t add these to your food.');
  function kcalTiles(s) {
    const k = ENGINE.sessionKcal(P(), s); if (!k) return '';
    return `<div class="grid2 kcal" style="margin-top:10px" data-tip="${esc(KC_TIP())}"><div class="stat"><b>≈ ${k.total}</b><span>${LL('ккал за тренування', 'kcal this workout')}</span></div><div class="stat"><b>≈ ${k.active}</b><span>${LL('ккал понад спокій', 'kcal above rest')}</span></div></div>`;
  }
  /* тиждень (з 3.21.9): тренування, хвилини й калорії за всі тренування цього тижня — на головній, під кільцем тижня */
  /* з 3.27.3 — без кількості тренувань: її вже показує кільце тижня поруч (слово Alexа 25.10: «Роби усе крім 2D»; дубль — огляд 25.10) */
  function weekKcal() {
    const p = P(), wk = ENGINE.weekKey(today()), ss = p.sessions.filter((x) => ENGINE.weekKey(x.date) === wk); if (!ss.length) return '';
    const k = ENGINE.kcalSum(p, ss), mins = ss.reduce((a, x) => a + (x.mins || 0), 0);
    return `<p class="small muted wkcal" style="text-align:center" data-tip="${esc(KC_TIP())}">${LL('Цього тижня: ', 'This week: ')}${mins}${LL(' хв', ' min')}${k ? ' · ≈ ' + fmt(k.total) + LL(' ккал', ' kcal') : ''}</p>`;
  }
  function rSummary() {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === ui.summary); if (!s) { view = 'home'; return render(); }
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    const work = s.sets.filter((x) => x.type !== 'W').length;
    const prevSame = s.short ? null : p.sessions.filter((x) => x.workout === s.workout && !x.short && x.id !== s.id && x.date <= s.date).slice(-1)[0];  // коротка версія — обсяг не порівнюємо (з 3.25.0)
    const pvol = prevSame ? ENGINE.sessionVolume(prog, prevSame, p.handle) : 0;
    const dv = prevSame && pvol ? Math.round((vol / pvol - 1) * 100) : null;
    const ms = ENGINE.muscleSets(prog, [s], 0, 9e15);
    const np = ENGINE.planFor(prog, nextN());
    app.innerHTML = `${LL(`<div class="card hero" style="margin-top:calc(14px + env(safe-area-inset-top))"><div class="chip">Тиждень `, `<div class="card hero" style="margin-top:calc(14px + env(safe-area-inset-top))"><div class="chip">Week `)}${s.week}${LL(`</div><h1>Тренування завершено 🎉</h1><p class="muted">`, `</div><h1>Workout complete 🎉</h1><p class="muted">`)}${esc(wTitle(s))} · ${dm(s.date)}</p></div>
      <div class="grid2"><div class="stat"><b>${s.mins}${LL(` хв</b><span>тривалість</span></div><div class="stat"><b>`, ` min</b><span>duration</span></div><div class="stat"><b>`)}${work}${LL(`</b><span>робочих підходів</span></div>
      <div class="stat"><b>`, `</b><span>working sets</span></div>
      <div class="stat"><b>`)}${vol ? fmt(Math.round(vol)) + KG(LL(' кг', " kg")) : '—'}${LL(`</b><span>обсяг`, `</b><span>volume`)}${dv !== null ? ' · ' + (dv >= 0 ? '+' : '') + dv + LL(' % до минулого', "% vs. last time") : ''}</span></div><div class="stat"><b>${s.prs || 0}${LL(`</b><span>рекордів</span></div></div>
      `, `</b><span>PRs</span></div></div>
      `)}${kcalTiles(s)}${s.ret ? `<div class="note ok ret" data-tip="${esc(RET_TIP())}">${LL('🔁 <b>З поверненням!</b> Пропущено ', '🔁 <b>Welcome back!</b> You missed ') + plural(s.ret, LL('тренування', 'workout'), LL('тренування', 'workouts'), LL('тренувань', 'workouts')) + LL(' за планом — і ви повернулись. Пропущене не надолужуємо: далі — за планом.', ' on your plan — and you came back. No making up for missed ones: we carry on with the plan.')}</div>` : ''}${mcSum(s)}${(() => { const nw = msNew(s); return nw.length ? `<h2>${LL('🏅 Нова віха', '🏅 New milestone')}</h2><div class="card"><ul class="list">${nw.map((g) => `<li><span>${esc(msText(g))}</span></li>`).join('')}</ul></div>` : ''; })()}${s.prList && s.prList.length ? `${LL(`<h2>🏆 Рекорди</h2><div class="card"><ul class="list">`, `<h2>🏆 PRs</h2><div class="card"><ul class="list">`)}${s.prList.map((x) => `<li><span>${esc(prog.ex[x.ex].name)}</span><span class="chip g">${x.types.map((t) => ({ e1rm: LL('максимум', "est. 1RM"), weight: LL('вага', "weight"), reps: LL('повторення', "reps") }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''}${LL(`
      <h2>Що попрацювало</h2><div class="card smus">`, `
      <h2>Muscles worked</h2><div class="card smus">`)}${CHARTS.bodyMap(ms, 6, G().sex)}${LL(`</div>
      <p class="small muted">Наступне: `, `</div>
      <p class="small muted">Next up: `)}${esc(woTitle(np.workout))}${LL(` (тиждень `, ` (week `)}${np.week}${LL(`).</p>
      <button type="button" class="wide" data-act="shareSum">Поділитися підсумком</button><p></p>
      <button type="button" class="pri wide big" data-act="sumDone">Готово</button>`, `).</p>
      <button type="button" class="wide" data-act="shareSum">Share summary</button><p></p>
      <button type="button" class="pri wide big" data-act="sumDone">Done</button>`)}`;
    tourMaybe('sum');
  }
  function shareSummary() {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === ui.summary); if (!s) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    const F = (w, px) => w + ' ' + px + 'px Manrope, -apple-system, Arial';
    g.fillStyle = '#14514f'; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#c8a96a'; g.fillRect(80, 200, 140, 6);
    g.fillStyle = '#fff'; g.font = F(700, 64); g.fillText(LL('Тренування завершено', "Workout complete"), 80, 170);
    g.font = F(400, 40); g.globalAlpha = 0.9; g.fillText(wTitle(s) + ' · ' + dm(s.date), 80, 240); g.globalAlpha = 1;
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    [[s.mins + LL(' хв', " min"), LL('тривалість', "duration")], [String(s.sets.filter((x) => x.type !== 'W').length), LL('підходів', "sets")], [vol ? Math.round(vol) + KG(LL(' кг', " kg")) : '—', LL('обсяг', "volume")], [String(s.prs || 0), LL('рекордів', "PRs")]].forEach((x, k) => {
      const X = 80 + (k % 2) * 480, Y = 380 + Math.floor(k / 2) * 240;
      g.fillStyle = '#0d3937'; g.fillRect(X, Y, 440, 200); g.fillStyle = '#1c4b49'; g.fillRect(X, Y, 6, 200);
      g.fillStyle = '#fff'; g.font = F(700, 84); g.fillText(x[0], X + 36, Y + 110); g.fillStyle = '#e8f0ef'; g.font = F(400, 34); g.fillText(x[1], X + 36, Y + 165); g.fillStyle = '#fff';
    });
    g.font = F(500, 40); let y = 920;
    (s.prList || []).slice(0, 5).forEach((x) => { g.fillText('🏆 ' + prog.ex[x.ex].name, 80, y); y += 64; });
    window.BRAND_DRAW(g, 80, 1280, 23, '#ffffff', '#c8a96a');  // знак і назва FORTES (з 3.27.2)
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
    const mcg = id === 'back' && sec.items.some((x) => x === MCG_H || x === TR(MCG_H)) && typeof VIZ !== 'undefined';  /* G() — уже перекладений: англійською заголовок інший (огляд 27.10 спіймав) */
    openSheet(`<div class="sp"><b>${esc(sec.title)}${LL(`</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>`, `</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>`)}${mcg ? mcgHtml(ui.mcg || MCG[0][0]) : ''}${guideBody(sec)}`);
    if (mcg) mcgAttach();
  }
  /* «велика трійка» Макгілла — 3D над текстом (з 3.27.8; слово Alexа 26.10: «Натиснув як робити Макгіла - Чому не має 3д моделі? Має бути над текстом»):
     ті самі моделі, що на картці «Тренер» (бічна планка — з колін, як радить текст: «спершу з колін»); перемикач — яку з трьох показати, памʼятає до перезапуску */
  const MCG = [['curlup', 'Скручування', 'Curl-up'], ['sideplank', 'Бічна планка', 'Side plank'], ['birddog', 'Птах-собака', 'Bird dog']], MCG_H = '#«Велика трійка» Макгілла — щодня 5 хв';
  function mcgHtml(k) {
    return `<div class="mcg"><details class="vz3" data-k="${k}" open><summary><b>${LL('«Велика трійка» Макгілла — 3D', 'McGill’s Big Three — 3D')}</b><span class="small muted">${LL('Пальцем можна повернути вигляд', 'Drag to turn the view')}</span></summary>
      <div class="seg mcgs">${MCG.map((x) => `<button type="button" class="${x[0] === k ? 'on' : ''}" data-act="mcg" data-k="${x[0]}" data-tip="${esc(LL('Показати в 3D: ', 'Show in 3D: ') + LL(x[1], x[2]).toLowerCase())}">${LL(x[1], x[2])}</button>`).join('')}</div>${vizInner()}</details></div>`;
  }
  function mcgAttach() {
    const det = sheetEl.querySelector('.mcg details.vz3'); if (!det) return;
    VIZ.attach(det, { t: TR, esc, mus: (ids) => ids.map(mName).join(' · ').toLowerCase(), style: () => (S().vz3 === 'xray' ? 'xray' : 'clay'), setStyle: (v) => { S().vz3 = v; save(); },
      L: { right: LL('правий бік', 'right side'), left: LL('лівий бік', 'left side'), work: LL('Працюють: ', 'Working: '), red: LL(' — червоним', ' — shown in red'),
        wait: LL('Завантаження…', 'Loading…'), fail: LL('3D недоступне на цьому пристрої — опис нижче.', '3D isn’t available on this device — see the description below.'), play: LL('Грати', 'Play'), pause: LL('Пауза', 'Pause') } });
  }
  function guideChips(ids) {
    const list = (G().guide || []).filter((g) => !ids || ids.indexOf(g.id) >= 0);
    return '<div class="quick">' + list.map((g) => `<button type="button" class="sm" data-act="guide" data-id="${g.id}">${esc(g.title)}</button>`).join('') + '</div>';
  }

  /* ---------- словник і навчання ---------- */
  /* термін словника поточною мовою (аудит 25.10: англійською словник, його шторки й «Урок дня» були українською — GLOSSARY без TR) */
  const GL = (k) => { const g = GLOSSARY[k]; return g ? [TR(g[0]), TR(g[1])] : null; };
  function glSheet(k) {
    const g = GL(k); if (!g) return;
    openSheet(`<div class="sp"><b>${esc(g[0])}${LL(`</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div><p>`, `</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div><p>`)}${esc(g[1])}</p>
      <button type="button" class="wide" data-act="say" data-what="gl" data-k="${k}${LL(`">🔊 Прослухати</button>`, `">🔊 Listen</button>`)}`);
  }
  function glAll() {
    openSheet(`${LL(`<div class="sp"><b>Словник</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <ul class="list">`, `<div class="sp"><b>Glossary</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <ul class="list">`)}${Object.keys(GLOSSARY).map((k) => `<li style="display:block"><b>${esc(GL(k)[0])}</b><div class="small muted" style="margin-top:3px">${esc(GL(k)[1])}</div></li>`).join('')}</ul>`);
  }
  const TOURS = {
    /* «Перший погляд» (з 3.21.7; слово Alexа 24.10: «потрібні підсказки для усього що вперше я відкриваю в додатку»): кожен екран і головні шторки — при першому відкритті.
       Вади до 3.21.7: «Кухні» в переліку вкладок не було, а «харчування» — у «Тілі» (з 3.20.0 це окрема вкладка); «спитає про спину» — і тим, кого не питає. */
    home: [['.hero .pri', () => (backAsk() ? LL('Почніть тут. Застосунок спитає, як спина, покаже, що підготувати вдома, підставить вагу', 'Start here. The app will ask about your back, show what to get ready at home, fill in your weights') : (G().place || 'home') !== 'gym' ? LL('Почніть тут. Застосунок покаже, що підготувати вдома, підставить вагу', 'Start here. The app will show what to get ready at home, fill in your weights') : LL('Почніть тут. Застосунок підставить вагу', 'Start here. The app will fill in your weights'))
        + LL(' й поведе тренування голосом — крок за кроком.', ' and guide your workout by voice — step by step.') + (guideOn() ? LL(' Поки ви освоюєтесь, тренування — за руку: тренер скаже й підсвітить, що натиснути.', ' While you’re getting started, workouts are hands-on: the coach tells you what to tap and highlights it.') : '')],
      ['#app > .sp [data-act="ask"]', LL('Запитати тренера — голосом, текстом чи з фото: про вашу програму, техніку, вагу й харчування.', "Ask the coach — by voice, text, or photo: about your program, form, weights, and nutrition.")],
      ['.dly', LL('Щоденні звички: відмічайте галочкою. «Як робити» — коротка інструкція.', "Daily habits: check them off. “How to do it” is a short guide.")],
      ['#tabs', LL('Розділи внизу. Головна — сьогоднішнє тренування. План — 12 тижнів та історія. Кухня — їжа, білок і вода. Тіло — вага, заміри й фото. Прогрес — графіки й рекорди. Більше — голос, налаштування й резервна копія.', "Sections at the bottom. Home: today’s workout. Plan: 12 weeks and your history. Kitchen: food, protein, and water. Body: weight, measurements, and photos. Progress: charts and PRs. More: voice, settings, and backup.")]],
    /* текст про вагу — за тим, що в рамці: диски, тренажер, еспандер чи лише повторення */
    coach: [['.ctarget', () => { const l = (document.querySelector('.ctarget .cl2') || {}).textContent || '', t = LL(' Міняйте кнопками − і + або торкніться числа.', " Adjust with the − and + buttons, or tap the number.");
      return /диски|plates/.test(l) ? LL('Ціль підходу. Вага — скільки дисків на гантель; поруч — повторення.', "Set target. Weight is the plates per dumbbell; next to it, reps.") + t : /вага/.test(l) ? KG(LL('Ціль підходу. Вага на тренажері чи блоці, кг; поруч — повторення.', "Set target. Weight on the machine or cable, kg; next to it, reps.")) + t
        : /еспандер|band/.test(l) ? LL('Ціль підходу. Рівень еспандера; поруч — повторення.', "Set target. Band level; next to it, reps.") + t : LL('Ціль підходу: ', "Set target: ") + (/секунди/.test(l) ? LL('секунди.', "seconds.") : LL('повторення.', "reps.")) + t; }],
      ['.coach .plt', LL('Скільки дисків надіти з кожного боку гантелі.', "How many plates to put on each side of the dumbbell.")],
      ['.cdone', LL('Зробили підхід — натисніть. Тренер сам запустить відпочинок і скаже, що далі.', "Finished the set? Tap here. The coach will start your rest and tell you what’s next.")],
      ['#cMore', LL('Тут — як робити, заміна вправи, пропуск, нотатка, «Болить суглоб».', "Here: how to do it, swap exercise, skip, add a note, “Joint pain.”")],
      ['#modeBtn', LL('Перемикач: усі вправи списком, як у класичному журналі. Повернутися — тією самою кнопкою.', "Toggle: all exercises in one list, like a classic workout log. Tap the same button to switch back.")]],
    kit: [['.ksum', LL('Скільки зʼїли сьогодні: калорії — у колі, білок — смужкою. Норма — за вашою метою з анкети.', "What you’ve eaten today: calories in the ring, protein in the bar. Targets come from the goal in your questionnaire.")],
      ['[data-act="kAdd"]', LL('«+ Додати» — їжа в цей прийом: з «Моїх», продукт з бази грамами, руками (долоня, кулак) чи цифрами з етикетки; можна кілька поспіль, далі — «Готово».', "“+ Add” logs food to this meal: from “Mine,” a food from the database in grams, by hand (palm, fist), or numbers from a label; add several in a row, then tap Done.")],
      ['.kwat .row', LL('Вода: торкніться «+» після кожної склянки. Застосунок розкладає воду на день і може нагадувати.', "Water: tap “+” after each glass. The app spreads your water over the day and can remind you.")],
      ['#app > .quick', LL('Ваші продукти й страви, налаштування кухні й як вона рахує.', "Your foods and dishes, kitchen settings, and how the kitchen counts.")]],
    plan: [['#app > .seg', LL('«12 тижнів» — уся програма; «Історія» — календар і всі тренування.', "“12 weeks” is your whole program; “History” is the calendar and all your workouts.")],
      ['.slot.next', LL('Наступне тренування — торкніться, щоб почати. ✓ — зроблені: торкніться, щоб переглянути чи виправити.', "Your next workout — tap to start. ✓ marks finished ones: tap to view or edit them.")]],
    progress: [['#app > .seg', LL('Вправи — графік кожної вправи. Мʼязи — скільки підходів отримав кожен мʼяз. Тіло — вага й заміри. Звіт — місяць: що змінилось і віхи.', "Exercises: a chart for each exercise. Muscles: how many sets each muscle got. Body: weight and measurements. Report: your month — what changed and milestones.")],
      ['#exSel', LL('Оберіть вправу — графік покаже, як ростуть вага чи повторення; ◎ — рекорд.', "Pick an exercise — the chart shows how your weight or reps grow; ◎ marks a PR.")]],
    body: [['#app > .seg', () => (G().tests ? LL('Тести — раз на місяць: сила, рівновага й витривалість; до кожного — 3D. ', 'Tests: once a month — strength, balance and endurance; each has a 3D guide. ') : '') + LL('Заміри — вага й обʼєми. Фото — фото тіла, лише в цьому телефоні.', "Measurements: weight and body measurements. Photos: body photos, kept only on this phone.")],
      ['[data-act="measAdd"]', LL('«+ Додати» — записати вагу (краще зранку натщесерце, хоч щодня) чи обʼєм (раз на тиждень).', "“+ Add” logs your weight (best in the morning before eating, even daily) or a measurement (once a week).")]],
    more: [['#mVoice label:has(#voiceOn)', LL('Голос тренера: увімкнути чи вимкнути, обрати голос, характер і скільки говорити.', "The coach’s voice: turn it on or off, choose the voice, the personality, and how much it talks.")],
      ['#mWork .seg', LL('Екран тренування: тренер крок за кроком чи список усіх вправ.', "Workout screen: the step-by-step coach or a list of all exercises.")],
      ['#mWork label:has([data-set="guide"])', LL('«Вести за руку» — перші 3 тренування тренер каже й підсвічує, що натиснути.', "“Hands-on guidance” — for your first 3 workouts the coach tells you what to tap and highlights it.")],
      ['#mGuide', LL('Порадник, словник термінів і «Показати навчання знову».', "The guide, the glossary, and “Show the tutorial again.”")],
      ['#mBackup [data-act="backup"]', LL('Дані лише в цьому телефоні — раз на тиждень зберігайте резервну копію.', "Your data lives only on this phone — save a backup once a week.")]],
    ask: [['#askMic', LL('Торкніться й говоріть, ще раз — надіслати (до 30 секунд). Тренер відповість голосом.', "Tap and speak, tap again to send (up to 30 seconds). The coach answers by voice.")],
      ['#askText', LL('Або напишіть питання — про техніку, тренажер, вагу, програму чи харчування.', "Or type your question — about form, a machine, weights, your program, or nutrition.")],
      ['#sheet [data-act="askPhoto"]', LL('Фото тренажера, вправи чи тарілки — тренер скаже, що на фото і як це стосується вашої програми.', "A photo of a machine, an exercise, or your plate — the coach says what’s in it and how it relates to your program.")]],
    exmenu: [['#sheet [data-act="swap"]', LL('«Замінити» — коли тренажер зайнятий чи вправа не підходить: рівноцінна на ті самі мʼязи (лише до першого підходу).', "“Swap” — when the machine is taken or the exercise doesn’t suit you: an equivalent for the same muscles (only before the first set).")],
      ['#sheet [data-act="addset"]', LL('«+ Підхід» і «− Останній підхід» — більше чи менше підходів сьогодні.', "“+ Set” and “− Last set” — more or fewer sets today.")],
      ['#sheet [data-act="pain"]', LL('«Болить суглоб» — полегшити чи зупинити вправу; наступного разу вага буде на крок нижча.', "“Joint pain” — make the exercise easier or stop it; next time the weight will be one step lower.")],
      ['#exNote', LL('Нотатка до вправи — видно щоразу: номер тренажера, висота сидіння, хват.', "A note for this exercise — shown every time: machine number, seat height, grip.")]],
    kadd: [['#sheet .seg', LL('Мої — ваші продукти, страви й збережені прийоми. Продукт — з бази, грамами. Руками — долоня, кулак, жменя. Цифрами — з етикетки. Можна додати кілька поспіль — «Готово», коли все.', "Mine: your foods, dishes, and saved meals. Food: from the database, in grams. By hand: palm, fist, handful. Numbers: from a label. Add several in a row — tap Done when finished.")],
      ['#sheet [data-act="kPhoto"]', LL('Фото тарілки — застосунок підкаже продукти, а кількість вкажете ви.', "Photo of your plate — the app suggests the foods, and you enter the amounts.")],
      ['#kQ', LL('Пошук продукту: «курка», «гречка», «банан» — далі вкажіть грами.', "Search for a food: “chicken,” “rice,” “banana” — then enter the grams.")]],
    rest: [['.crest .cring', LL('Відпочинок: таймер іде сам, наприкінці — сигнал і голос. Телефон можна покласти.', "Rest: the timer runs on its own and ends with a beep and the coach’s voice. You can put your phone down.")],
      ['.crest [data-act="tadd"]', LL('−15 с і +15 с — коротший чи довший відпочинок.', "−15 sec and +15 sec — a shorter or longer rest.")],
      ['.crest .grid3 [data-act="tskip"]', LL('«Почати» — якщо готові раніше.', "“Start” — if you’re ready sooner.")],
      ['.crest .cnext', LL('Що далі: вправа, підхід і вага — можна готувати тренажер.', "What’s next: the exercise, set, and weight — you can set up the machine.")],
      ['.crest [data-act="kp"]', LL('Вийшло інакше, ніж ціль? Виправте щойно зроблений підхід.', "Did it go differently from the target? Edit the set you just did.")]],
    sum: [['#app .grid2', LL('Підсумок: тривалість, робочі підходи, обсяг (вага × повторення разом) і рекорди.', "Summary: duration, working sets, volume (weight × reps combined), and PRs.")],
      ['.smus', LL('Що попрацювало — мʼязи, які отримали навантаження сьогодні.', "Muscles worked — the muscles that got trained today.")],
      ['[data-act="sumDone"]', LL('«Готово» — на головну: там уже наступне тренування.', "“Done” takes you home, where your next workout is waiting.")]]
  };
  /* поворот екрана посеред навчання — підсвітка зсувається; прибираємо, навчання покажеться знову */
  window.addEventListener('resize', () => { const t = document.getElementById('tour'); if (t) t.remove(); });
  /* inSheet — навчання шторки (з 3.21.7): показується над нею; шторку закрили раніше — покажемо наступного разу */
  function tourMaybe(id, inSheet) {
    const busy = () => S().tour[id] || document.getElementById('tour') || document.body.classList.contains('sheet') !== !!inSheet;
    /* шторка ще виїжджає (.25 с) — чекаємо, доки стане на місце (до 2 с), інакше підсвітка ляже нижче за кнопку */
    const moving = () => inSheet && getComputedStyle(sheetEl).transform !== 'none';
    if (busy()) return;
    /* екран змінився за ці 0,4 с (згорнули тренування, перейшли на іншу вкладку) — навчання цього екрана не показуємо на чужому
       (аудит 25.10, Safari iPhone: навчання «Відпочинок» вилізло на головній з рамкою над таймером) */
    const v0 = view, s0 = inSheet ? sheetEl.firstElementChild : null;  // і шторка та сама (openSheet щоразу малює нову): навчання «+ Додати» лягало на «Налаштування кухні»
    let n = 0; const go = () => { if (busy() || view !== v0 || (inSheet && sheetEl.firstElementChild !== s0)) return; if (moving()) { if (n++ < 12) setTimeout(go, 150); return; } tour(id, 0); };
    setTimeout(go, 400);
  }
  function tour(id, k) {
    const old = document.getElementById('tour'); if (old) old.remove();
    const steps = TOURS[id];
    if (!steps || k >= steps.length) { S().tour[id] = true; save(); return; }
    /* жодного кроку не видно (екран ще не намалювався) — не позначати «показано» (до 3.21.7 так тихо «показувалась» «Кухня» без кроків) */
    if (k === 0 && !steps.some((s) => { const e = document.querySelector(s[0]); return e && e.getClientRects().length; })) return;
    const t = document.querySelector(steps[k][0]);
    if (!t || !t.getClientRects().length) return tour(id, k + 1);
    /* нумерація — лише видимих кроків (на тренажері немає рядка дисків, у вправі без ваги — рамки ваги) */
    const vis = steps.filter((s) => { const e = document.querySelector(s[0]); return e && e.getClientRects().length; }), pos = vis.indexOf(steps[k]) + 1;
    t.scrollIntoView({ block: 'center' });
    const r = t.getBoundingClientRect(), H = window.innerHeight, below = r.bottom + 170 < H;
    const ov = document.createElement('div'); ov.id = 'tour'; ov.dataset.view = view;
    ov.innerHTML = `<div class="th" style="left:${Math.max(4, r.left - 6)}px;top:${r.top - 6}px;width:${Math.min(window.innerWidth - 8, r.width + 12)}px;height:${r.height + 12}px"></div>
      <div class="tbx" style="${below ? 'top:' + Math.round(r.bottom + 14) + 'px' : 'bottom:' + Math.round(H - r.top + 14) + 'px'}"><p>${esc(typeof steps[k][1] === 'function' ? steps[k][1]() : steps[k][1])}</p>
      <div class="sp"><span class="tiny">${pos}${LL(` з `, ` of `)}${vis.length}${LL(`</span><span class="row"><button type="button" class="sm ghost" data-tour="skip">Пропустити</button><button type="button" class="sm pri" data-tour="next">`, `</span><span class="row"><button type="button" class="sm ghost" data-tour="skip">Skip</button><button type="button" class="sm pri" data-tour="next">`)}${pos === vis.length ? LL('Зрозуміло', "Got it") : LL('Далі', "Next")}</button></span></div></div>`;
    document.body.appendChild(ov);
    /* з 3.27.3: поки навчання відкрите, сторінка під затемненням не прокручується — рамка рахується раз, і свайп пальцем зсував сторінку під нею
       (Safari iPhone, 25.10: на 389 точок, рамка обвела чуже; tests/browser/iostour.js); поворот чи зміна розміру й так закривають навчання (не позначаючи «показано») */
    const hold = (e) => e.preventDefault();
    ov.addEventListener('touchmove', hold, { passive: false }); ov.addEventListener('wheel', hold, { passive: false });
    /* дотик повз підказку теж закриває навчання — щоб екран ніколи не «завис» під затемненням */
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-tour]'); if (!b) { if (!e.target.closest('.tbx')) { ov.remove(); S().tour[id] = true; save(); } return; } if (b.dataset.tour === 'skip') { ov.remove(); S().tour[id] = true; save(); } else tour(id, k + 1); });
  }
  function whatsNew() {
    openSheet(`${LL(`<div class="sp"><b>Що вміє застосунок</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <ul class="list">
        <li style="display:block"><b>🗣 Швидкість голосу тренера</b><div class="small muted">«Більше» → «Голосовий тренер» → «Швидкість голосу»: ×1, ×1,2, ×1,5 або ×2 — і фрази тренування, і відповіді тренера; тон голосу не змінюється.</div></li>
        <li style="display:block"><b>📏 Тести форми</b><div class="small muted">«Тіло» → «Тести», раз на місяць (тижні 1, 4, 8, 12): свій набір за віком і здоровʼям — віджимання, вставання з крісла, бічна планка, від 51 — рівновага, від 46 — сісти й встати з підлоги, ходьба 2 км чи 6 хв; кожен тест — окрема картка: короткий рядок, 3D, свої поля й кнопка «Зберегти» — робіть ті, що можете, коли зручно. Пульс у спокої й талія / зріст — без дня тестів; у залі — сила з журналу. З тиском чи серцем тестів «до відмови» немає.</div></li>
        <li style="display:block"><b>📅 5–6 днів: «верх / низ»</b><div class="small muted">В анкеті й у «Більше» → «Дні тренувань» можна обрати 5 або 6 днів: тренування «Верх тіла» і «Низ тіла» по черзі, коротші, кожна група мʼязів 2–3 рази на тиждень, тижневий обсяг — не менший, ніж на 4 дні. Вправи ті самі. Для 55+ і з тиском чи серцем — як і було, до 4 днів.</div></li>
        <li style="display:block"><b>☀️ Готовність до тренування</b><div class="small muted">У день тренування, коли відповіли на ранкове питання, — під відповіддю: самопочуття й чи відпочили мʼязи сьогоднішнього тренування. Погано чи так собі — порада «Коротка версія» й правило застуди. Лише показ: план не змінюється.</div></li>
        <li style="display:block"><b>🔀 Новий варіант на початку фази</b><div class="small muted">На тижнях 5 і 9 тренер може запропонувати складніший варіант вправи, яку ви вже впевнено робите, — лише порада, вибір ваш.</div></li>
        <li style="display:block"><b>⏱ Коротка версія ≈ 20 хв</b><div class="small muted">Мало часу — «Інше» → «Коротка версія»: кожна велика група мʼязів — по вправі, 1–2 підходи. Краще коротке тренування, ніж пропуск; план іде далі.</div></li>
        <li style="display:block"><b>🛡 Серія із запасним тижнем</b><div class="small muted">Кожні 4 тижні поспіль з тренуваннями дають запасний (не більше одного): тиждень без тренувань забирає його, і серія не рветься.</div></li>
        <li style="display:block"><b>🔁 Повернення після пропуску</b><div class="small muted">Пропустили тренування за планом і повернулись — «З поверненням!», віха й слово тренера. Пропущене не надолужуємо: далі — за планом.</div></li>
        <li style="display:block"><b>💪 Відновлення мʼязів</b><div class="small muted">На головній — 3D спереду й ззаду: які мʼязи ще відпочивають (до 48 год від тренування) і які готові. Лише показ: план не змінюється.</div></li>
        <li style="display:block"><b>🌱 Новий старт</b><div class="small muted">На початку тижня й місяця та після пропуску — на головній і голосом тренера.</div></li>
        <li style="display:block"><b>☀️ Ранкове питання</b><div class="small muted">Як спали й почуваєтесь — одним дотиком; за місяць — у «Прогрес» → «Звіт». Тренеру не передається, план не змінює.</div></li>
        <li style="display:block"><b>📖 Урок дня</b><div class="small muted">Одна порада з «Порадника» вашої програми або термін зі словника, щодня інша.</div></li>
        <li style="display:block"><b>🎯 Виклик місяця</b><div class="small muted">На одне тренування більше, ніж минулого місяця (не більше днів за планом); зроблені цього місяця вже зараховані.</div></li>
        <li style="display:block"><b>📊 Підсумок тижня й 🎁 року</b><div class="small muted">Тиждень — щопонеділка на головній; рік — у грудні на головній і завжди в «Прогрес» → «Звіт», можна поділитися картинкою.</div></li>
        <li style="display:block"><b>🎧 Радіо лише на тренуванні</b><div class="small muted">За бажанням (радіо → «Лише на тренуванні»): обрана станція заграє сама, щойно почнете тренування, і вимкнеться, коли завершите.</div></li>
        <li style="display:block"><b>🍴 Кухня</b><div class="small muted">Нова вкладка: норма калорій і білка за вашою метою; їжа — точно (грами, бази USDA і BLS), швидко (штука, ложка, чашка) чи руками (долоня, кулак); свої продукти з етикетки й страви за рецептом; «Зберегти прийом» — одним дотиком наступного разу; фото тарілки підказує продукти, а кількість вказуєте ви; «Чим добрати білок» — спершу з того, що ви вже їсте; вода з нагадуваннями.</div></li>
        <li style="display:block"><b>🌓 Тема</b><div class="small muted">Кнопка вгорі праворуч на головній: як у телефоні → світла → темна.</div></li>
        <li style="display:block"><b>🎯 Кілька цілей</b><div class="small muted">В анкеті можна позначити кілька: «Схуднути» й «Набрати мʼязи» разом — менше жиру й більше мʼязів (невеликий дефіцит, більше білка); «Сильна спина й осанка» — з будь-якою. «Сила й здоровʼя» — окремо від схуднення й набору мʼязів: несумісна мета стає неактивною. Обмеження здоровʼя діють завжди, хоч які цілі обрано.</div></li>
        <li style="display:block"><b>⚖️ Кілограми або фунти</b><div class="small muted">В анкеті й у «Більше» → «Одиниці»: кг і см або фунти й дюйми. Набір дисків у фунтах — 10 · 5 · 2,5 lb. Перемкнули — вага тренувань переводиться й округлюється до ваших дисків; вага тіла й заміри просто показуються в нових одиницях.</div></li>
        <li style="display:block"><b>↩ Повернення після перерви</b><div class="small muted">Не тренувались 2 тижні й більше — застосунок сам зменшує вагу: перерва до місяця — перший тиждень на ≈ 20 % легше; довша (або від 60 років — від 2 тижнів) — перший тиждень третина колишньої ваги, далі щотижня більше, до колишньої — за половину часу перерви. Без відмови, міо й дропів.</div></li>
        <li style="display:block"><b>🔔 Нагадування</b><div class="small muted">`, `<div class="sp"><b>What the app can do</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <ul class="list">
        <li style="display:block"><b>🗣 Coach voice speed</b><div class="small muted">“More” → “Voice coach” → “Voice speed”: ×1, ×1.2, ×1.5 or ×2 — both workout phrases and the coach’s answers; the pitch stays the same.</div></li>
        <li style="display:block"><b>📏 Fitness tests</b><div class="small muted">“Body” → “Tests,” once a month (weeks 1, 4, 8, 12): your own set by age and health — push-ups, chair stands, side plank, balance from 51, sitting and rising from the floor from 46, a 2 km or 6-minute walk; each test is its own card with a short line, a 3D guide, its own fields and a Save button — do the ones you can, whenever it suits you. Resting pulse and waist-to-height — no test day needed; at the gym — strength from your log. With blood pressure or heart issues, there are no all-out tests.</div></li>
        <li style="display:block"><b>📅 5–6 days: upper / lower</b><div class="small muted">In the questionnaire and in “More” → “Workout days” you can pick 5 or 6 days: “Upper body” and “Lower body” workouts in turn, shorter, each muscle group 2–3 times a week, weekly volume no less than on 4 days. Same exercises. For 55+ and with blood pressure or heart issues — up to 4 days, as before.</div></li>
        <li style="display:block"><b>☀️ Workout readiness</b><div class="small muted">On a workout day, once you’ve answered the morning check-in — below your answer: how you feel and whether today’s workout muscles have rested. Feeling poorly or so-so — a tip about the short version and the cold rule. Display only: your plan doesn’t change.</div></li>
        <li style="display:block"><b>🔀 A new variation at the start of a phase</b><div class="small muted">In weeks 5 and 9, the coach may suggest a harder variation of an exercise you already do confidently — just a suggestion, the choice is yours.</div></li>
        <li style="display:block"><b>⏱ Short version ≈ 20 min</b><div class="small muted">Short on time — “Other” → “Short version”: one exercise for each major muscle group, 1–2 sets. A short workout beats skipping; the plan carries on.</div></li>
        <li style="display:block"><b>🛡 Streak with a spare week</b><div class="small muted">Every 4 weeks in a row with workouts earn a spare (one at most): a week without workouts uses it up, and the streak doesn’t break.</div></li>
        <li style="display:block"><b>🔁 Comeback after a miss</b><div class="small muted">Missed a planned workout and came back — “Welcome back!”, a milestone, and a word from the coach. Missed workouts aren’t made up: the plan carries on.</div></li>
        <li style="display:block"><b>💪 Muscle recovery</b><div class="small muted">On Home — which muscles are still resting (under 48 hours since a workout) and which are ready; 3D — front and back. Display only: your plan doesn’t change.</div></li>
        <li style="display:block"><b>🌱 Fresh start</b><div class="small muted">At the start of a week or month and after a miss — on Home and in the coach’s voice.</div></li>
        <li style="display:block"><b>☀️ Morning check-in</b><div class="small muted">How you slept and feel — in one tap; the month’s answers are in “Progress” → “Report.” Not sent to the coach, doesn’t change your plan.</div></li>
        <li style="display:block"><b>📖 Today’s lesson</b><div class="small muted">One tip from your program’s guide or a glossary term, different every day.</div></li>
        <li style="display:block"><b>🎯 Monthly challenge</b><div class="small muted">One workout more than last month (no more than your planned days); workouts already done this month count.</div></li>
        <li style="display:block"><b>📊 Weekly and 🎁 yearly summary</b><div class="small muted">The week — every Monday on Home; the year — on Home in December and always in “Progress” → “Report,” and you can share it as an image.</div></li>
        <li style="display:block"><b>🎧 Radio only during workouts</b><div class="small muted">Optional (radio → “Only during workouts”): your station starts by itself when you start a workout and stops when you finish.</div></li>
        <li style="display:block"><b>🍴 Kitchen</b><div class="small muted">A new tab: calorie and protein targets for your goal; log food exactly (grams, USDA and BLS databases), quickly (piece, spoon, cup), or by hand (palm, fist); your own foods from labels and recipes; “Save meal” — one tap next time; a photo of your plate suggests the foods, and you enter the amounts; “How to reach your protein” starts with what you already eat; water with reminders.</div></li>
        <li style="display:block"><b>🌓 Theme</b><div class="small muted">The button at the top right of Home: same as your phone → light → dark.</div></li>
        <li style="display:block"><b>🎯 Several goals</b><div class="small muted">In the questionnaire you can check more than one: “Lose weight” and “Build muscle” together means less fat and more muscle (a small deficit, more protein); “Strong back and posture” goes with any goal. “Strength and health” stays separate from losing weight and building muscle: a goal that clashes is grayed out. Health limits always apply, whatever goals you choose.</div></li>
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
        <li style="display:block"><b>💡 Підказки</b><div class="small muted">Затисніть будь-яку кнопку чи напис на 1 секунду — зʼявиться пояснення простою мовою. А ще: кнопки «?» біля термінів, навчання на першому запуску, словник у «Більше».</div></li>
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
        <li style="display:block"><b>💡 Tips</b><div class="small muted">Press and hold any button or label for 1 second to see a plain-language explanation. Plus: “?” buttons next to terms, a tutorial on first launch, and a glossary in “More.”</div></li>
      </ul><button type="button" class="pri wide" data-act="closeSheet">Got it</button>`)}`);
    S().tour.v3 = true; S().tour.v4 = true; S().tour.v5 = true; save();
  }
  function readySheet(wid, place) {
    const her = DB.active === 'her', sw = G().ready && G().ready.swap && G().ready.swap.rdl && G().ex.rdl;
    /* з 3.27.7 (слово Alexа 26.10: «кнопки відповіді зменшити … 2 верхні (Підпиши "Добре" та "Терпимо") горизонтально кнопками в ряд. Третю не міняй і підпис до неї залиш»):
       що робить відповідь — у підказці на затисканні (data-tip), як і в решті застосунку */
    const pc = prepCard(wid, place);
    const yTip = sw ? LL('Ниє, але терпимо: румунська тяга → міст, решта вправ на поперек — на крок легше.', 'Achy, but manageable: Romanian deadlift → glute bridge, other lower back exercises one step lighter.')
      : LL('Ниє, але терпимо: вправи на поперек — на крок легше, запас 3.', 'Achy, but manageable: lower back exercises one step lighter, 3 RIR.');
    openSheet(`<b>${her ? LL('Як спина й суглоби сьогодні?', "How are your back and joints today?") : LL('Як спина сьогодні?', "How’s your back today?")}</b> ${q('ready')}
      <p class="small muted">${LL('Від відповіді залежать вправи на поперек.', 'Your answer decides the lower back exercises.')}</p>
      <div class="pick rd"><div class="rd2">
        <button type="button" data-act="go" data-r="g" data-w="${wid || ''}" data-p="${place || ''}" data-tip="${esc(LL('Спина в порядку — тренування за планом.', 'Back is fine — workout as planned.'))}"><b>🟢 ${LL('Добре', 'Good')}</b></button>
        <button type="button" data-act="go" data-r="y" data-w="${wid || ''}" data-p="${place || ''}" data-tip="${esc(yTip)}"><b>🟡 ${LL('Терпимо', 'Manageable')}</b></button></div>
        <button type="button" data-act="go" data-r="r" data-w="${wid || ''}" data-p="${place || ''}${LL(`"><b>🔴 Болить або віддає в ногу</b><span class="small muted">сьогодні без вправ на поперек</span></button>
      </div>
      <div class="note b small"><b>Негайно до лікаря:</b> оніміння в паху чи між ногами, порушення сечовипускання чи стільця, слабкість у нозі, що наростає.</div>`, `"><b>🔴 Hurts or radiates down my leg</b><span class="small muted">no lower back exercises today</span></button>
      </div>
      <div class="note b small"><b>See a doctor right away if you have:</b> numbness in the groin or between the legs, bladder or bowel problems, or leg weakness that’s getting worse.</div>`)}${pc ? `<h3 style="margin:14px 0 4px">${LL('Що підготувати', 'What to get ready')}</h3>${pc}<p class="tiny muted" style="margin:6px 0 0">${LL('«Терпимо» — вправи на поперек на крок легше, «Болить» — без них.', '“Manageable” — lower back exercises one step lighter, “Hurts” — none today.')}</p>` : ''}`);
  }
  /* «Що підготувати» (з 3.27.7; слово Alexа 26.10: «для режиму "вдома" нижче блоком додай що підготувати для тренування. Які тренажери, які на них мають бути ваги
     (якщо це гантелі то одразу кажи що потрібно на приклад 3 пари гантель по 10, 15 та 20 кг на кожній) щоб завчасно підготуватись до інтенсивних тренувань»):
     лише вдома; те саме тренування, що почнеться (buildDraft, відповідь «Добре»; «Коротка версія» — теж): гантелі — вага однієї (гриф + диски), скільки штук,
     диски на кожен бік і вправи; розминкова вага позначена; еспандер — рівні; тренажери вдома — вага. Порожньо ('') — у залі чи без обладнання */
  function prepCard(wid, place) {
    const prog = G(), p = P();
    if ((place || prog.place || 'home') !== 'home') return '';
    let d = null; try { d = buildDraft(wid, 'g', place, ui.shortNext); } catch (e) { return ''; }
    const h = Number(p.handle) || 0, dbs = {}, bands = [], machs = [];
    d.items.forEach((it) => {
      const ex = prog.ex[it.ex]; if (!ex) return;
      it.sets.forEach((st) => {
        if (st.load === null || st.load === undefined || st.load === '' || st.type === 'D') return;
        if (hasKg(ex)) {
          const k = String(Number(st.load)), o = dbs[k] = dbs[k] || { load: Number(st.load), n: 0, ex: [], warm: true };
          o.n = Math.max(o.n, ENGINE.dbCountOf(ex, it.variant)); if (o.ex.indexOf(ex.name) < 0) o.ex.push(ex.name); if (st.type !== 'W') o.warm = false;
        } else if (ex.type === 'band' || isMach(ex)) {
          const a = ex.type === 'band' ? bands : machs, f = a.find((x) => x.name === ex.name) || (a.push({ name: ex.name, v: [] }), a[a.length - 1]);
          if (f.v.indexOf(Number(st.load)) < 0) f.v.push(Number(st.load));
        }
      });
    });
    const list = Object.keys(dbs).map((k) => dbs[k]).sort((a, b) => a.load - b.load);
    if (!list.length && !bands.length && !machs.length) return '';
    const kg = KG(LL(' кг', ' kg')), w = (x) => fmt(Math.round((h + x.load) * 100) / 100);
    const rows = list.map((x) => {
      const pl = ENGINE.plates(x.load, p.inv, x.n, prog.cap, isLb() ? 'lb' : 'kg');
      return `<li style="display:block"><div class="sp"><b>${w(x)}${kg} × ${x.n}</b><span class="small muted">${pl.ok ? (pl.side.length ? SIDE_TXT() + esc(pl.text) + ' ' + discs(pl.side) : LL('лише гриф', 'handle only')) : '⚠ ' + esc(pl.text)}</span></div>`
        + `<div class="tiny muted">${esc(x.ex.join(' · '))}${x.warm ? LL(' — розминка', ' — warm-up') : ''}</div></li>`;
    }).join('');
    const ws = list.map(w), sum = ws.length > 1 ? ws.slice(0, -1).join(', ') + LL(' і ', ' and ') + ws[ws.length - 1] : ws[0];
    const ln = (a, unit) => a.map((x) => `<li style="display:block"><div class="sp"><span class="small">${esc(x.name)}</span><b>${x.v.sort((m, n) => m - n).map(fmt).join(' / ')}${unit}</b></div></li>`).join('');
    return `<div class="card prep">`
      + (list.length ? `<p class="small" style="margin:0 0 4px">${LL('Гантелі', 'Dumbbells')}: ${sum}${kg}${LL(' — вага однієї гантелі (гриф і диски); × — скільки штук.', ' — weight of one dumbbell (handle and plates); × — how many.')}</p><ul class="list">${rows}</ul>` : '')
      + (bands.length ? `<p class="small" style="margin:8px 0 4px">${LL('Еспандер — рівень (сума номерів джгутів)', 'Band — level (sum of band numbers)')}</p><ul class="list">${ln(bands, '')}</ul>` : '')
      + (machs.length ? `<p class="small" style="margin:8px 0 4px">${LL('Тренажери', 'Machines')}</p><ul class="list">${ln(machs, kg)}</ul>` : '') + '</div>';
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
      return COACHCTX.text({ prog, plan: ENGINE.planFor(prog, d.n), items: d.items, workout: d.workout, short: !!d.short, place: d.place, inProgress: true, cur: cs ? { i: cs.i, j: cs.j } : null, done: st.done, total: st.total, back: backText(d.back), kitchen: kitchenCtx(), body: bodyCtx() });
    }
    const last = p.sessions[p.sessions.length - 1];
    const place = prog.gymWorkouts ? (last && last.place) || 'home' : (prog.place === 'gym' ? 'gym' : 'home');
    const pv = buildDraft(null, 'g', place);
    return COACHCTX.text({ prog, plan: ENGINE.planFor(prog, nextN()), items: pv.items, workout: pv.workout, place: pv.place, inProgress: false, back: backText(pv.back), kitchen: kitchenCtx(), body: bodyCtx() });
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
      <div class="row askrow"><button type="button" class="ic" data-act="askPhoto" aria-label="add photo">`)}${ICON.cam}${LL(`</button><input id="askFile" type="file" accept="image/*" hidden><input id="askText" type="text" maxlength="1500" placeholder="Або напишіть питання" enterkeyhint="send" autocomplete="off"><button type="button" class="sm" data-act="askSend">Надіслати</button></div>`, `</button><input id="askFile" type="file" accept="image/*" hidden><input id="askText" type="text" maxlength="1500" placeholder="Or type your question" enterkeyhint="send" autocomplete="off"><button type="button" class="sm" data-act="askSend">Send</button></div>`)}`);  // пояснення про дані — потім окремим посиланням (слово Alexа 23.10), не в чаті
    const fi = document.getElementById('askFile');
    fi.addEventListener('change', () => { const f = fi.files && fi.files[0]; fi.value = ''; if (f) askPhotoLoad(f); });
    const inp = document.getElementById('askText');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); askSend({ text: inp.value }); } });
    askDraw();
    tourMaybe('ask', true);
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
    ASK.gen++; vEpoch++;
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
    const j = await post('/hear', { audio: wav, lang: I18N.lang, kb: 'min' }, 8000);
    if (g !== ASK.gen) return;
    if (!j || !j.q) { ASK.st = 'err'; ASK.msg = askErr(j); return askDraw(); }
    askTurn(j.q, Array.isArray(j.kb) ? j.kb : []);
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
  /* kb — теми довідки до питання ([{ id, x, h }] з /hear); немає (питання текстом) — запит /kb одразу, поки налаштовується розмова */
  async function askTurn(q, kb) {
    askHush();
    /* попередня відповідь ще йшла — її обриваємо (текст лишається з «…» і кнопкою «Прослухати»), нова розмова з Live, щоб шматки не змішались */
    if (LIVE.turn) { const pt = LIVE.turn.t; if (pt) { pt.a = String(pt.a).replace(/\s+/g, ' ').trim() + (pt.a ? ' …' : ''); pt.done = !!pt.a; } liveClose(); }
    const g = ASK.gen, t = { q, a: '', pcm: [], done: false, heard: false, img: ASK.photo || null };
    ASK.photo = null;
    t.kbP = Array.isArray(kb) ? Promise.resolve(kb) : post('/kb', { q, lang: I18N.lang, kb: 'min' }, 3000).then((j) => (j && Array.isArray(j.kb) ? j.kb : []));
    ASK.chat.push(t); ASK.st = 'think'; ASK.msg = ''; ASK.help = false; askDraw();
    let ok = false;
    try { ok = await liveTurn(t, g); } catch (e) { ok = false; }
    if (ok || g !== ASK.gen) return;
    liveClose(); t.a = ''; t.pcm = [];
    const prog = G();
    const j = await post('/ask', { text: q, lang: I18N.lang, kb: 'min', image: t.img ? t.img.b64 : undefined, sex: prog.sex === 'f' ? 'f' : 'm', pack: packId(), ids: coachIds(), program: coachProgram(), history: ASK.chat.slice(0, -1).slice(-6).filter((x) => x.a).map((x) => ({ q: qText(x), a: x.a })) }, 32000);
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
      const prog = G(), j = await post('/live', { sex: prog.sex === 'f' ? 'f' : 'm', pack: packId(), ids: coachIds(), lang: I18N.lang, kb: 'min' }, 5000);
      if (!j || !j.token) throw new Error(LL('немає токена', "no token"));
      return new Promise((ok, no) => {
        const ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(j.token));
        const to = setTimeout(() => { no(new Error(LL('налаштування', "setup"))); try { ws.close(); } catch (e) { /* уже */ } }, 8000);
        LIVE.ws = ws; LIVE.prog = ''; LIVE.kb = j.kb === 'min'; LIVE.kbs = [];
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
  /* блок довідки — той самий, що складає сервер для запасного шляху (server/src/topics.js → kbText) */
  function kbText(list) {
    const sec = list.filter((x) => !x.h).map((x) => x.x), tip = list.filter((x) => x.h).map((x) => '- ' + x.x);
    if (!sec.length && !tip.length) return '';
    return LL('ДОВІДКА З НАШИХ ДОКУМЕНТІВ ДО ЦЬОГО ПИТАННЯ (пріоритет 2):\n\n', "REFERENCE FROM OUR DOCUMENTS FOR THIS QUESTION (priority 2; sections in Ukrainian):\n\n") + sec.join('\n\n') +
      (tip.length ? (sec.length ? '\n\n' : '') + LL('Підказки до кнопок застосунку:\n', "App button tips:\n") + tip.join('\n') : '');
  }
  function liveClose() { const ws = LIVE.ws; LIVE.ws = null; LIVE.ready = null; LIVE.turn = null; if (ws) try { ws.close(); } catch (e) { /* уже */ } }
  /* true — тренер заговорив (звук прийшов за 5 с); false — ні: тоді запасний шлях */
  function liveTurn(t, g) {
    return new Promise((resolve) => {
      let settled = false, got = false;
      const fin = (v) => { if (!settled) { settled = true; resolve(v); } };
      const wait = setTimeout(() => { if (!got) { if (LIVE.turn && LIVE.turn.t === t) LIVE.turn = null; fin(false); } }, 5000);
      Promise.race([liveOpen().then((ws) => (LIVE.kb ? t.kbP.then((kb) => [ws, kb]) : [ws, []])), new Promise((no, bad) => setTimeout(() => bad(new Error(LL('5 с', "5 sec"))), 5000))]).then(([ws, kb]) => {
        if (settled || g !== ASK.gen) return fin(false);
        const turns = [], prog = coachProgram();
        /* програма — у першому питанні розмови й щоразу, як змінилась (зроблені підходи, інший тиждень) */
        if (prog !== LIVE.prog) {
          turns.push({ role: 'user', parts: [{ text: LL('МОЯ ПРОГРАМА ЗАРАЗ (найвищий пріоритет):\n', "MY CURRENT PROGRAM (top priority):\n") + prog }] }, { role: 'model', parts: [{ text: LL('Бачу твою програму. Відповідаю за нею.', "Got your program. I’ll answer based on it.") }] });
          if (!LIVE.prog) ASK.chat.slice(0, -1).slice(-6).forEach((x) => { if (x.a) turns.push({ role: 'user', parts: [{ text: qText(x) }] }, { role: 'model', parts: [{ text: x.a }] }); });
          LIVE.prog = prog;
        }
        /* фото — частиною питання (inlineData у clientContent; кадр realtimeInput.video Live не бачить — стенд tools/photo_test.mjs 23.10) */
        /* довідка до питання (формат «мінімум») — лише теми, яких у цій розмові ще не було */
        const kbNew = (kb || []).filter((x) => x && x.id && x.x && LIVE.kbs.indexOf(x.id) < 0), kbT = kbText(kbNew);
        kbNew.forEach((x) => LIVE.kbs.push(x.id));
        turns.push({ role: 'user', parts: (t.img ? [{ inlineData: { mimeType: 'image/jpeg', data: t.img.b64 } }] : []).concat(kbT ? [{ text: kbT }] : [], [{ text: t.q }]) });
        const k = () => ASK.chat.indexOf(t);
        LIVE.turn = {
          t,
          audio(b64) {
            t.pcm.push(b64);
            if (!got) { got = true; clearTimeout(wait); if (g === ASK.gen) { ASK.st = 'talk'; ASK.i = k(); askDraw(); } fin(true); }
            if (g === ASK.gen && livePlay(b64, t)) t.heard = true;
          },
          text(s) { t.a += s; if (g === ASK.gen) askDraw(); },
          done() { clearTimeout(wait); LIVE.turn = null; if (g === ASK.gen) liveFlush(t); t.a = String(t.a).replace(/\s+/g, ' ').trim(); t.done = true; askDraw(); if (got) liveEnded(k(), g); else fin(false); },
          fail() { clearTimeout(wait); LIVE.turn = null; if (g === ASK.gen) liveFlush(t); t.done = !!t.a; askDraw(); if (got) liveEnded(k(), g); else fin(false); }
        };
        try { ws.send(JSON.stringify({ clientContent: { turns, turnComplete: true } })); } catch (e) { LIVE.turn.fail(); }
      }, () => { clearTimeout(wait); fin(false); });
    });
  }
  /* потоковий звук: шматки PCM 24 кГц стають у чергу Web Audio один за одним; true — шматок поставлено */
  /* швидкість (з 3.27.4): t.st — потоковий WSOLA цієї відповіді (VOICEPACK.Stretch), без зміни тону; наприкінці відповіді — liveFlush */
  function livePlay(b64, t) {
    if (!S().voice.on || !audio || audio.state !== 'running') return false;
    const bin = atob(b64), n = bin.length >> 1; if (!n) return false;
    let d = new Float32Array(n);
    for (let k = 0; k < n; k++) { const v = bin.charCodeAt(2 * k) | (bin.charCodeAt(2 * k + 1) << 8); d[k] = (v > 32767 ? v - 65536 : v) / 32768; }
    if (t && VOICEPACK.rate !== 1) { if (!t.st || t.st.r !== VOICEPACK.rate) t.st = Object.assign(VOICEPACK.Stretch(24000, VOICEPACK.rate), { r: VOICEPACK.rate }); d = t.st.push(d); }
    liveQueue(d); return true;
  }
  function liveFlush(t) { if (t && t.st && S().voice.on && audio && audio.state === 'running') liveQueue(t.st.flush()); if (t) t.st = null; }
  function liveQueue(d) {
    if (!d.length) return;
    const buf = audio.createBuffer(1, d.length, 24000); buf.getChannelData(0).set(d);
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
        next: wo ? wo.title + ' · ' + plural(wo.items.length, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises")) : '', done: trainedToday() ? today() : '', test: !!test,
        trained: p.sessions.reduce((a, x) => (x.date > a ? x.date : a), '') };  // з 3.24.0 — дата останнього тренування: «новий старт» у нагадуванні (push.js fresh)
      body.on = !!r.on;
      /* вода (з 3.20.0): розклад на день тренування й на звичайний, склянка, випите сьогодні — сервер пропускає склянки, які вже відмічено */
      const sx = ksex(), wr = kWRec(), mk = (tr) => KITCHEN.waterPlan(kw.first, kw.last, KITCHEN.waterTarget(sx, tr, kw.vol, wr), kw.glass, tr && r.on ? (r.time || '18:00') : null, kw.per);
      const wl = kday(kWaterDay()).wl || [], lw = wl[wl.length - 1];  // з 3.21.1 — норма на день і час останньої відмітки: сервер рахує склянку на черзі так само (push.js waterTurn)
      body.water = kw.water ? { on: true, glass: kw.glass, per: kw.per, rest: mk(false), train: mk(true), tr: { rest: KITCHEN.waterTarget(sx, false, kw.vol, wr), train: KITCHEN.waterTarget(sx, true, kw.vol, wr) },
        done: { date: kWaterDay(), ml: kday(kWaterDay()).water || 0, at: lw ? lw.t : '', f: (lw && lw.f) || '', g: [].concat.apply([], wl.map((x) => x.g || [])) }, wake: kw.first, cross: kWaterCross() } : { on: false };  // день води — від підйому (нічна зміна)
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
    else if (Notification.permission === 'denied') body = LL('<div class="note w small"><b>Сповіщення заборонено.</b> Увімкнути: ', "<div class=\"note w small\"><b>Notifications are blocked.</b> To turn them on: ") + TX(LL('«Параметри» iPhone → «Сповіщення» → назва застосунку (FORTES або «Тренування» — як підписана іконка) → «Дозволити сповіщення».', "iPhone “Settings” → “Notifications” → the app’s name (FORTES or “Workouts” — as under the icon) → “Allow Notifications”."), LL('«Налаштування» Android → «Додатки» → назва застосунку (FORTES або «Тренування» — як підписана іконка; або Chrome, якщо відкриваєте в браузері) → «Сповіщення» → увімкнути.', "Android “Settings” → “Apps” → the app’s name (FORTES or “Workouts” — as under the icon; or Chrome, if you use it in the browser) → “Notifications” → turn on.")) + '</div>';
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
      <p class="tiny muted">The volume dips smoothly and comes back as soon as the coach stops talking. What research says: upbeat music you love with a fast tempo (120+ beats per minute) lifts your mood, slightly improves performance, and makes fatigue feel lighter. Music you pick yourself works best — so you can also play your own from another app. The radio needs an internet connection.</p>`)}${radioOnlyHtml()}`);
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
  /* «Час зважитись» і «Час заміряти обʼєми» (з 3.21.4; слово Alexа 24.10: «Час зважитись» на головній; «обєми тіла потрібно відслідковувати
     раз на тиждень»): від 7 днів без запису — короткий рядок з переходом у «Заміри»; без сповіщень */
  function measureHome() {
    const b = P().body, w = ENGINE.measureDue(b.weight || [], today()), s = ENGINE.measureDue(['waist', 'chest', 'hips', 'arm'].reduce((a, k) => a.concat(b[k] || []), []), today());
    if (!w.due && !s.due) return '';
    const ago = (n) => plural(n, LL('день', 'day'), LL('дні', 'days'), LL('днів', 'days')) + LL(' тому', ' ago');
    const txt = w.due && s.due ? LL('Час зважитись і заміряти обʼєми', 'Time to weigh in and measure') + (w.days !== null ? LL(': останнє зважування ', ': last weigh-in ') + ago(w.days) : '')
      : w.due ? LL('Час зважитись', 'Time to weigh in') + (w.days !== null ? LL(': останнє зважування ', ': last weigh-in ') + ago(w.days) : '')
      : LL('Час заміряти обʼєми (раз на тиждень)', 'Time to measure (once a week)') + (s.days !== null ? LL(': останній замір ', ': last time ') + ago(s.days) : '');
    return `<div class="card"><div class="sp"><span class="small">${txt}</span><button type="button" class="sm" data-act="goMeas">${LL('Заміри', 'Measurements')}</button></div></div>`;
  }
  function kHomeCard() {
    const k = kit(), day = kday(today()), sx = ksex(), N = kNorm(), t = KITCHEN.dayTotals(day, sx, kctx()), wd = kWaterDay(), wday = kday(wd);
    const wT = kWTarget(wd), gl = kGlasses(wT, wday.water || 0, k.set.glass);
    const tu = kTurn();  // з 3.21.1 — склянка на черзі (з доганянням), не просто наступна за часом; кількість — лише в рядку «Вода: … з … л» (огляд 24.10)
    return `<div class="card"><div class="sp"><b>${LL('Кухня сьогодні', 'Kitchen today')}</b><button type="button" class="sm" data-act="goKitchen">${LL('Відкрити', 'Open')}</button></div>
      <div class="sp" style="margin-top:6px"><span class="small">${LL('Вода: ', 'Water: ')}<b>${fmt((wday.water || 0) / 1000)}</b>${LL(' з ', ' of ')}${fmt(wT / 1000)}${LL(' л', ' L')}</span>
        <button type="button" class="sm pri" data-act="kWaterHome">+ ${tu ? kGlW(tu.p) : LL('склянка', 'glass')}</button></div>
      ${gl.icons}<p class="tiny muted" style="margin:0">${(wday.water || 0) >= wT ? gl.line + (tu ? ' · ' + kTurnTxt(tu, true) : '') : tu ? kTurnTxt(tu) : kDayPlan() ? W_NOMORE() : ''}</p>
      ${k.set.water || !pushOk() ? '' : `<button type="button" class="sm ghost wide" data-act="kWaterRemind">${LL('Нагадувати пити воду', 'Remind me to drink water')}</button>`}
      <div class="grid2" style="margin-top:10px"><div class="stat"><b>${t.kcal}</b><span>${N.nu ? LL('ккал з ', 'kcal of ') + N.nu.kLo + '–' + N.nu.kHi : LL('ккал', 'kcal')}</span></div><div class="stat"><b>${fmt(t.p)}</b><span>${N.nu ? LL('г білка з ', 'g protein of ') + N.nu.pLo : LL('г білка', 'g protein')}</span></div></div></div>`;
  }
  function dailyCard() {
    const p = P(), prog = G(), t = today(), rec = p.daily[t] || {};
    const wk = ENGINE.planFor(prog, Math.max(0, nextN() - 1)).week;
    /* відмітка лише на сьогодні, ще раз — скасувати; такі дні зеленіють у «План» → «Історія».
       З 3.27.1 — вигляд колишніх «Завдань дня» (слово Alexа 25.10: «дизайн і формат у картці Щодня … як це було в блоці Завдання дня»): рядок — кнопка з ○ / ✓
       і підписом, угорі — скільки зроблено; до 3.27.1 — окрема кнопка «Виконано» (слово Alexа 23.10: з галочками було незрозуміло, чи натискати), тепер підказка під списком */
    const isDone = (it) => (it.jumps ? (rec.jumps || 0) >= prog.jumpsFor(wk).times : !!rec[it.id]);
    const nDone = prog.daily.filter(isDone).length, all = nDone === prog.daily.length;
    return `<div class="card qst dly${all ? ' all' : ''}" data-tip="${esc(LL('Щоденні звички вашої програми. Торкніться рядка — відмітка на сьогодні; ще раз — скасувати.', 'Daily habits from your program. Tap a row to check it off for today; tap again to undo.'))}"><div class="sp"><b>${all ? '<span class="qmk">✓</span> ' + LL('Щодня — усе зроблено', 'Daily — all done') : LL('☑️ Щодня', '☑️ Daily')}</b><span class="small muted">${nDone} / ${prog.daily.length}</span></div><div class="qlist">${prog.daily.map((it) => {
      if (it.jumps) {
        const j = prog.jumpsFor(wk), done = rec.jumps || 0, ok = done >= j.times;
        return `<div class="qrow qbox${ok ? ' done' : ''}"><span class="qmk">${ok ? '✓' : '○'}</span><div style="flex:1;min-width:0"><span>${esc(it.label)}</span>${LL(`<div class="tiny muted">Тиждень `, `<div class="tiny muted">Week `)}${wk}: ${j.n}${LL(` стрибків × `, ` jumps × `)}${j.times}${LL(` на день, 30 с між стрибками. Лише якщо коліна, стопи й тазове дно без проблем. <button type="button" class="sm ghost" style="min-height:40px;padding:0 6px" data-act="guide" data-id="jumps">як стрибати</button></div>`, ` a day, 30 sec between jumps. Only if your knees, feet, and pelvic floor are problem-free. <button type="button" class="sm ghost" style="min-height:40px;padding:0 6px" data-act="guide" data-id="jumps">how to jump</button></div>`)}
          <div class="row" style="margin-top:6px">${Array.from({ length: j.times }, (_, k) => `<button type="button" class="sm${k < done ? ' pri' : ''}" data-act="jump" data-k="${k + 1}">${k < done ? '✓ ' : ''}${LL(`${k + 1}-й раз`, `Round ${k + 1}`)}</button>`).join('')}</div></div></div>`;
      }
      const how = it.how && (G().guide || []).some((g) => g.id === it.how) ? `<button type="button" class="sm ghost" data-act="guide" data-id="${it.how}${LL(`">як робити</button>`, `">how to do it</button>`)}` : '';
      const ok = !!rec[it.id];
      return `<div class="qline"><button type="button" class="qrow${ok ? ' done' : ''}" data-act="dailyDone" data-id="${it.id}" aria-pressed="${ok}"><span class="qmk">${ok ? '✓' : '○'}</span><span>${esc(it.label)}</span></button>${how}</div>`;
    }).join('')}</div>${LL(`<p class="tiny muted" style="margin:8px 0 0">Торкніться рядка — відмітка на сьогодні; ще раз — скасувати. Дні з відмітками зеленіють у «План» → «Історія».</p></div>`, `<p class="tiny muted" style="margin:8px 0 0">Tap a row to check it off for today; tap again to undo. Days with check marks turn green in “Plan” → “History”.</p></div>`)}`;
  }

  function alerts() {
    const out = [], p = P(), prog = G();
    if (ENGINE.fatigue(prog, p, p.handle)) out.push(LL('<div class="note b">Два тренування поспіль головні вправи падають. Зробіть легкий тиждень: половина підходів, вага та сама або на крок нижча.</div>', "<div class=\"note b\">Your main lifts have dropped two workouts in a row. Take a deload week: half the sets, same weight or one step lower.</div>"));
    /* з 3.24.0 (пункт 2): минулий тиждень без тренувань — серію зберіг запасний; нагадка лише цього тижня */
    const si = ENGINE.streakInfo(p.sessions, today()), prevWk = (() => { const x = new Date(ENGINE.weekKey(today()) + 'T12:00:00'); x.setDate(x.getDate() - 7); return x.toISOString().slice(0, 10); })();
    if (si.saved.indexOf(prevWk) >= 0) out.push(`<div class="note ok spared" data-tip="${esc(SPARE_TIP(si))}">${LL('🛡 Запасний тиждень зберіг вашу серію: минулого тижня тренувань не було. Новий запасний — після 4 тижнів поспіль з тренуваннями.', '🛡 Your spare week saved your streak: there were no workouts last week. You earn a new one after 4 weeks in a row with workouts.')}</div>`);
    const reds = p.sessions.slice(-3).filter((s) => s.ready === 'r').length;
    if (reds >= 2) out.push(LL('<div class="note b">Спина болить уже кілька тренувань поспіль. Варто показатися неврологу чи ортопеду — з МРТ.</div>', "<div class=\"note b\">Your back has hurt for several workouts in a row. It’s worth seeing a neurologist or an orthopedist — with an MRI.</div>"));
    const wk = ENGINE.planFor(prog, nextN()).week;
    if (prog.tests && [1, 4, 8, 12].indexOf(wk) >= 0) { const tl = p.body.tests || [], ks = TEST_HOW().filter(([k]) => testOn(k)).map(([k]) => k), dn = ks.filter((k) => testDone(k, tl)).length;  // з 3.27.4 тести — окремо: нагадка рахує зроблені й зникає, коли зроблено всі
      if (dn < ks.length) out.push(dn ? LL(`<div class="note w">Цього тижня — тести форми: зроблено ${dn} з ${ks.length}. «Тіло» → «Тести».</div>`, `<div class="note w">This week — fitness tests: ${dn} of ${ks.length} done. “Body” → “Tests”.</div>`) : LL('<div class="note w">Цього тижня — тести форми: «Тіло» → «Тести».</div>', '<div class="note w">This week — fitness tests: “Body” → “Tests”.</div>')); }  // з 3.27.3 тестів у кожного кілька (до того — «тест віджимань» / «тести готовності до старіння»)
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
    const si = ENGINE.streakInfo(p.sessions, today()), streak = si.run;  // з 3.24.0 — із запасним тижнем (пункт 2)
    const fsk = d ? null : ENGINE.freshStart(p.sessions, trainDays(), today());  // з 3.24.0 — «новий старт» (пункт 3)
    const ym = today().slice(0, 7), mprs = p.sessions.filter((s) => s.date.slice(0, 7) === ym).reduce((a, s) => a + (s.prs || 0), 0);
    const pv = buildDraft(null, 'g'), est = ENGINE.estimateMins(prog, pv.items), nEx = pv.items.filter((x) => !x.skipped).length;
    const warmMin = (warmList().title.match(/(\d+)\s*(?:хв|min)/) || [])[1];
    const nd = nextDayText(p.days);
    /* порядок головної (з 3.27.1; слово Alexа 25.10: «Так, роби в 3.27.1 як радиш: порядок Тренування → Кухня → Як ви сьогодні → Завдання дня → Щодня → Урок дня,
       вода першим рядком у картці кухні…»; «Завдання дня» прибрано — «Прибери картку «Завдання дня» з головної в 3.27.1»: усі її пункти вже мають свої картки поруч): найчастіше застосунок відкривають відмітити воду — «+ склянка» на першому екрані (замір 390 × 844: було 2 047 px, стало ≈ 570) */
    /* логотип на головній — кнопка «Що вміє застосунок» (з 3.27.4; слово Alexа 26.10: «коли натискаю на логотип має вискакувати вікно що вміє додаток») */
    app.innerHTML = `<div class="brand"><button type="button" class="logo" data-act="whatsnew" aria-label="${esc(LL('FORTES — що вміє застосунок', 'FORTES — what the app can do'))}" data-tip="${esc(LL('Дотик — що вміє застосунок.', 'Tap to see what the app can do.'))}">${MARK}${WORD}</button>${themeBtn()}${LL(`</div><p class="muted small" style="margin-top:4px">`, `</div><p class="muted small" style="margin-top:4px">`)}${new Date().toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</p><div class="sp"><h1>${greet}${LL(`!</h1><div class="row" style="gap:8px;flex-wrap:nowrap"><button type="button" class="ic" data-act="ask" aria-label="запитати тренера">`, `!</h1><div class="row" style="gap:8px;flex-wrap:nowrap"><button type="button" class="ic" data-act="ask" aria-label="ask the coach">`)}${ICON.mic}</button><button type="button" class="ic${RADIO.state === 'playing' || RADIO.state === 'loading' ? ' rad' : ''}${LL(`" data-act="radio" aria-label="радіо">`, `" data-act="radio" aria-label="radio">`)}${ICON.radio}</button></div></div>
      ${alerts()}
      ${d ? `${LL(`<div class="card"><div class="sp"><div><b>Тренування триває</b><div class="small muted">`, `<div class="card"><div class="sp"><div><b>Workout in progress</b><div class="small muted">`)}${esc(wTitle(d))} · ${draftStats(d).done}/${draftStats(d).total}${LL(` підходів</div></div><button type="button" class="pri" data-act="resume">Продовжити</button></div></div>`, ` sets</div></div><button type="button" class="pri" data-act="resume">Resume</button></div></div>`)}` : ''}${LL(`
      <div class="card hero"><div class="row"><span class="chip">Тиждень `, `
      <div class="card hero"><div class="row"><span class="chip">Week `)}${plan.week}${plan.cycle > 1 ? LL(' · цикл ', " · cycle ") + plan.cycle : ''}</span><span class="chip">${plan.slot + 1}${LL(` з `, ` of `)}${prog.perWeek || 3}</span>${pv.back ? LL('<span class="chip">після перерви</span>', "<span class=\"chip\">after a break</span>") : plan.deload ? LL('<span class="chip">легкий тиждень</span>', "<span class=\"chip\">deload week</span>") : ''}</div>
        <h1 style="margin-top:10px">${esc(wo.title)}</h1><p class="muted small">${plural(nEx, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises"))} · ≈ ${est}${LL(` хв`, ` min`)}${warmMin ? LL(' + розминка ', " + warm-up ") + warmMin + LL(' хв', " min") : ''} · ${esc(pv.back ? LL('запас 3–4', "RIR 3–4") : plan.note.rir)}${nd ? LL(' · за планом ', " · scheduled ") + nd : ''}</p>
        <p class="small" style="opacity:.92">${pv.back ? '↩ ' + esc(backText(pv.back)) : esc(plan.note.phase)}</p>
        ${fsk && !(fsk === 'back' && pv.back) ? `<p class="small fsl" style="opacity:.92" data-tip="${esc(FS_TIP())}">${esc(FS_TXT()[fsk])}</p>` : ''}
        ${d ? '' : LL('<div class="hbtn"><button type="button" class="pri big" data-act="start">Почати</button><button type="button" class="ghost big" data-act="other">Інше</button></div>', "<div class=\"hbtn\"><button type=\"button\" class=\"pri big\" data-act=\"start\">Start</button><button type=\"button\" class=\"ghost big\" data-act=\"other\">Other</button></div>")}</div>
      ${kHomeCard()}${moodHome()}${dailyCard()}${lessonHome()}
      ${S().tour.tips ? '' : LL('<div class="card"><div class="sp"><div><b>💡 Підказка на кожній кнопці</b><div class="small muted">Затисніть будь-яку кнопку чи напис на 1 секунду — зʼявиться коротке пояснення.</div></div><button type="button" class="sm pri" data-act="tipsOk">Зрозуміло</button></div></div>', "<div class=\"card\"><div class=\"sp\"><div><b>💡 Tips on every button</b><div class=\"small muted\">Press and hold any button or label for 1 second to see a short explanation.</div></div><button type=\"button\" class=\"sm pri\" data-act=\"tipsOk\">Got it</button></div></div>")}
      ${!S().tour.v5 ? LL('<div class="card"><div class="sp"><div><b>Нове: серія, відновлення, урок дня</b><div class="small muted">Запасний тиждень для серії, відновлення мʼязів у 3D, урок дня, ранкове питання, виклик місяця, підсумок тижня й року.</div></div><button type="button" class="sm pri" data-act="whatsnew">Що нового</button></div></div>', "<div class=\"card\"><div class=\"sp\"><div><b>New: streaks, recovery, daily lesson</b><div class=\"small muted\">A spare week for your streak, muscle recovery in 3D, a daily lesson, a morning check-in, a monthly challenge, weekly and yearly summaries.</div></div><button type=\"button\" class=\"sm pri\" data-act=\"whatsnew\">What’s new</button></div></div>") : S().tour.v4 ? '' : LL('<div class="card"><div class="sp"><div><b>Нове: запитайте тренера</b><div class="small muted">Кнопка з мікрофоном угорі: питання голосом, текстом чи з фото — про вашу програму, вагу й техніку.</div></div><button type="button" class="sm pri" data-act="whatsnew">Що нового</button></div></div>', "<div class=\"card\"><div class=\"sp\"><div><b>New: ask the coach</b><div class=\"small muted\">Tap the mic button at the top to ask by voice, text, or photo — about your program, weights, and form.</div></div><button type=\"button\" class=\"sm pri\" data-act=\"whatsnew\">What’s new</button></div></div>")}
      <div class="grid3"><div class="stat" style="display:flex;justify-content:center">${CHARTS.ring(thisWeek, prog.perWeek || 3, thisWeek + '/' + (prog.perWeek || 3), LL('тиждень', "week"), true)}</div>
        <div class="stat stk" data-tip="${esc(SPARE_TIP(si))}"><b>${streak}${si.spare ? '<small class="spare" aria-label="' + LL('є запасний тиждень', 'spare week saved') + '"> 🛡</small>' : ''}${LL(`</b><span>тижнів поспіль</span></div><div class="stat"><b>`, `</b><span>weeks in a row</span></div><div class="stat"><b>`)}${mprs}${LL(`</b><span>рекордів за місяць</span></div></div>
      `, `</b><span>PRs this month</span></div></div>
      `)}${yearHome()}${weekHome()}${mcHome()}${weekKcal()}${recHome()}${measureHome()}`;
    recAttach();
    tourMaybe('home');
    badgeSync();
  }
  function otherSheet() {
    const prog = G();
    /* з 3.23.0 — лише тренування з розкладу плану: у затвердженій «Гантелі 2×20» лишились Д1–Д3 (історія, шаблони вправ), у розкладі їх уже немає */
    const inPlan = new Set(); for (let w = 1; w <= 12; w++) prog.week(w).forEach((x) => inPlan.add(x));
    const sm = shortMins();
    openSheet(`${LL(`<b>Інше тренування</b><p class="small muted">Тиждень і підказки лишаються за планом.</p><div class="pick">`, `<b>Different workout</b><p class="small muted">The week and hints stay as planned.</p><div class="pick">`)}${sm ? `<button type="button" data-act="startShort" data-tip="${esc(SHORT_TIP())}"><b>${LL('⏱ Коротка версія', '⏱ Short version')}</b><span class="small muted">${LL('≈ ', '≈ ')}${sm}${prog.workouts.U ? LL(' хв + розминка · кожна група мʼязів цього тренування — по вправі, 1–2 підходи', ' min + warm-up · one exercise for each muscle group of this workout, 1–2 sets') : LL(' хв + розминка · кожна велика група мʼязів — по вправі, 1–2 підходи', ' min + warm-up · one exercise for each major muscle group, 1–2 sets')}</span></button>` : ''}${Object.keys(prog.workouts).filter((k) => inPlan.has(k)).map((k) => `<button type="button" data-act="startW" data-w="${k}"><b>${esc(prog.workouts[k].title)}</b><span class="small muted">${plural(prog.workouts[k].items.length, LL('вправа', "exercise"), LL('вправи', "exercises"), LL('вправ', "exercises"))}${prog.gymWorkouts && prog.gymWorkouts[k] ? LL(' удома · ', " at home · ") + prog.gymWorkouts[k].items.length + LL(' у залі', " at the gym") : ''}</span></button>`).join('')}</div>`);
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
        /* 5–6 днів (з 3.27.0) — компактний ряд: інакше клітинки вужчі за 40 px (360 px — 34, 390 — 38); підпис — «5 тиж.» / «8 легк.» */
        const c6 = (prog.perWeek || 3) >= 5, dl = prog.deload.indexOf(w) >= 0;
        return `<div class="wk${dl ? ' dl' : ''}${c6 ? ' c6' : ''}" style="grid-template-columns:${c6 ? 34 : 58}px repeat(${prog.perWeek || 3},1fr)"><div class="wl"><b>${w}${c6 ? '</b>' + (dl ? LL('легк.', 'easy') : LL('тиж.', 'wk')) + '</div>' : '</b>' + (dl ? `<span class="dlm">${LL('легкий', 'deload')}</span>` : '') + LL('тиждень', 'week') + '</div>'}${order.map((wid, s) => {
          const n = base + s, done = byN[n], isNext = n === nn;
          /* зроблене — підпис того тренування, що справді було (з 3.27.0: після зміни днів А / Б ↔ «верх / низ» розклад інший, а історія — ні) */
          const shown = done && done.workout ? done.workout : wid;
          const short = { A: LL('А', "A"), B: LL('Б', "B"), D1: LL('Д1', "D1"), D2: LL('Д2', "D2"), D3: LL('Д3', "D3"), U: LL('Верх', "Up"), L: LL('Низ', "Low") }[shown] || shown;
          return `<button type="button" class="slot${done ? ' done' : isNext ? ' next' : ''}" data-act="${done ? 'sess' : isNext ? 'start' : 'noop'}" data-id="${done ? done.id : ''}">${done ? '✓ ' : ''}${esc(short)}<small>${done ? dm(done.date) : isNext ? (c6 ? LL('далі', "next") : LL('наступне', "next")) : ''}</small></button>`;
        }).join('')}</div>`;
      }).join('')}</div><p class="tiny muted">${weeks.some((w) => prog.week(w).some((x) => /^D/.test(x))) ? LL('А / Б — тренування фази 1, Д1–Д3 — дні фаз 2–3.', "A / B — phase 1 workouts, D1–D3 — phase 2–3 days.") : prog.workouts.U ? LL('Верх / низ — тренування верху й низу тіла по черзі: кожна група мʼязів 2–3 рази на тиждень, ті самі мʼязи — не частіше ніж через день.', "Up / Low — upper- and lower-body workouts in turn: each muscle group 2–3 times a week, the same muscles no more often than every other day.") : LL('А / Б — два тренування на все тіло, по черзі.', "A / B — two full-body workouts, alternating.")}${LL(` Легкий тиждень — підходів удвічі менше.</p>`, ` Deload week — half the sets.</p>`)}`;
    } else {
      const ym = ui.calMonth || today().slice(0, 7);
      const marks = {}; p.sessions.forEach((s) => { marks[s.date] = 't'; });
      Object.keys(p.daily).forEach((d) => { if (!marks[d] && Object.values(p.daily[d]).some(Boolean)) marks[d] = 'd'; });
      const list = p.sessions.filter((s) => s.date.slice(0, 7) === ym).slice().reverse();
      body = `<div class="card"><div class="sp"><button type="button" class="sm" data-act="calPrev">‹</button><b>${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}</b><button type="button" class="sm" data-act="calNext">›</button></div><p></p>${CHARTS.month(ym, marks, today())}${LL(`
        <div class="legend"><span><i></i>тренування</span><span><i style="background:var(--ok-soft)"></i>щоденне</span></div></div>
        <div class="card">`, `
        <div class="legend"><span><i></i>workout</span><span><i style="background:var(--ok-soft)"></i>daily</span></div></div>
        <div class="card">`)}${list.length ? `<ul class="list">${list.map((s) => `<li data-act="sess" data-id="${s.id}" style="cursor:pointer"><span><b>${esc(wTitle(s))}${placeTag(s)}</b><div class="tiny muted">${dm(s.date)}${LL(` · тиждень `, ` · week `)}${s.week} · ${s.mins || '?'}${LL(` хв · `, ` min · `)}${plural(s.sets.filter((x) => x.type !== 'W').length, LL('підхід', "set"), LL('підходи', "sets"), LL('підходів', "sets"))}</div></span><span>${s.prs ? '<span class="chip g">🏆 ' + s.prs + '</span>' : '›'}</span></li>`).join('')}</ul>` : LL('<div class="empty">У цьому місяці тренувань немає</div>', "<div class=\"empty\">No workouts this month</div>")}</div>`;
    }
    app.innerHTML = `${LL(`<h1>План</h1><div class="seg"><button type="button" class="`, `<h1>Plan</h1><div class="seg"><button type="button" class="`)}${ui.planTab === 'w' ? 'on' : ''}${LL(`" data-act="planTab" data-v="w">12 тижнів</button><button type="button" class="`, `" data-act="planTab" data-v="w">12 weeks</button><button type="button" class="`)}${ui.planTab === 'h' ? 'on' : ''}${LL(`" data-act="planTab" data-v="h">Історія</button></div>`, `" data-act="planTab" data-v="h">History</button></div>`)}${body}`;
    tourMaybe('plan');
  }
  function sessSheet(id, edit) {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === id); if (!s) return;
    const groups = []; s.sets.forEach((x, k) => { let g = groups.find((y) => y.ex === x.ex); if (!g) { g = { ex: x.ex, sets: [] }; groups.push(g); } g.sets.push({ x, k }); });
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    openSheet(`<div class="sp"><b>${esc(wTitle(s))}${placeTag(s)}${LL(`</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">`, `</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <p class="small muted">`)}${dm(s.date)}${LL(` · тиждень `, ` · week `)}${s.week} · ${s.mins || '?'}${LL(` хв`, ` min`)}${(() => { const k = ENGINE.sessionKcal(p, s); return k ? ' · ≈ ' + k.total + LL(' ккал', ' kcal') : ''; })()}${vol ? LL(' · обсяг ', " · volume ") + fmt(Math.round(vol)) + KG(LL(' кг', " kg")) : ''}${s.ready ? LL(' · спина ', " · back ") + ({ g: '🟢', y: '🟡', r: '🔴' }[s.ready] || '') : ''}</p>
      ${groups.map((g) => { const ex = prog.ex[g.ex] || { name: g.ex, type: 'bw' }; return `<div class="card" style="padding:10px 12px"><b class="small">${esc(ex.name)}</b>${g.sets.map(({ x, k }) => edit
        ? `<div class="row" style="flex-wrap:nowrap;margin-top:6px"><span class="tiny muted" style="width:22px">${x.type === 'W' ? LL('Р', "W") : x.type === 'D' ? LL('Д', "D") : x.type === 'F' ? LL('В', "F") : '•'}</span>${isLoad(ex) ? `<input inputmode="decimal" data-ed="load" data-sk="${k}"${loadTip(ex, LL(' у цьому підході. Порожньо — без ваги.', " in this set. Leave blank for no weight."))} value="${x.load === null || x.load === undefined ? '' : fmt(x.load)}" placeholder="${ex.type === 'band' ? LL('рівень', "level") : KG(LL('кг', "kg"))}">` : ''}<input inputmode="numeric" data-ed="reps" data-sk="${k}" value="${x.reps}"></div>`
        : `<div class="small" style="margin-top:4px">${x.type === 'W' ? LL('<span class="chip w">Р</span> ', "<span class=\"chip w\">W</span> ") : x.type === 'D' ? LL('<span class="chip">Д</span> ', "<span class=\"chip\">D</span> ") : x.type === 'F' ? LL('<span class="chip">В</span> ', "<span class=\"chip\">F</span> ") : x.type === 'M' ? LL('<span class="chip g">М</span> ', "<span class=\"chip g\">M</span> ") : ''}${esc(setText(ex, x))}${x.mini && x.mini.length ? ' + ' + x.mini.join(' + ') : ''}${x.rir !== null && x.rir !== undefined ? LL(' · запас ', " · RIR ") + x.rir : ''}</div>`).join('')}</div>`; }).join('')}
      ${edit ? `<button type="button" class="pri wide" data-act="sessSave" data-id="${s.id}${LL(`">Зберегти зміни</button>`, `">Save changes</button>`)}` : `<button type="button" class="wide" data-act="sessEdit" data-id="${s.id}${LL(`">Редагувати</button>`, `">Edit</button>`)}`}<p></p>
      <button type="button" class="ghost wide" style="color:var(--bad)" data-act="sessDel" data-id="${s.id}${LL(`">Видалити тренування</button>`, `">Delete workout</button>`)}`);
  }

  /* ---------- прогрес ---------- */
  function rProgress() {
    const p = P(), prog = G(), h = p.handle;
    const seg = `<div class="seg">${[['ex', LL('Вправи', "Exercises")], ['mu', LL('Мʼязи', "Muscles")], ['body', LL('Тіло', 'Body')], ['rep', LL('Звіт', "Report")]].map(([k, l]) => `<button type="button" class="${ui.progTab === k ? 'on' : ''}" data-act="progTab" data-v="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (ui.progTab === 'ex') {
      const used = {}; p.sessions.forEach((s) => s.sets.forEach((x) => { if (x.type !== 'W') used[x.ex] = 1; }));
      /* лише виконані вправи (огляд 24.10, слово Alexа: «у «Прогресі» лише виконані вправи»): до огляду в списку були всі вправи програми з позначкою «(ще не виконували)» */
      const ids = Object.keys(prog.ex).filter((id) => used[id]).sort((a, b) => (prog.ex[b].main ? 1 : 0) - (prog.ex[a].main ? 1 : 0));
      if (!ids.length) body = `<div class="card"><p class="small muted" style="margin:0">${LL('Ще немає виконаних вправ — графік і рекорди зʼявляться після першого тренування.', 'No exercises done yet — charts and records appear after your first workout.')}</p></div>`;
      else {
        if (!ui.progEx || !prog.ex[ui.progEx] || ids.indexOf(ui.progEx) < 0) ui.progEx = ids[0];
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
        const unit = ui.metric === 'vol' ? KG(LL('кг за тренування', "kg per workout")) : ui.metric === 'heavy' ? (isMach(ex) ? KG(LL('кг на тренажері', "kg on the machine")) : ON_BODY[ui.progEx] ? KG(LL('кг — гантель', 'kg — dumbbell')) : KG(LL('кг у руках', "kg in hand"))) : ui.metric === 'reps' ? LL('повторень', "reps") : ENGINE.metricLabel(ex, isLb() ? 'lb' : 'kg');
        const repRows = Object.keys(rec.reps).map(Number).sort((a, b) => b - a).slice(0, 8);
        body = `<select id="exSel">${ids.map((id) => `<option value="${id}"${id === ui.progEx ? ' selected' : ''}>${esc(prog.ex[id].name)}</option>`).join('')}</select>
          <div class="seg">${metrics.map(([k, l]) => `<button type="button" class="${ui.metric === k ? 'on' : ''}" data-act="metric" data-v="${k}"${k === 'heavy' && isMach(ex) ? LL(' data-tip="Найбільша вага на тренажері за кожне тренування."', " data-tip=\"Heaviest weight on the machine in each workout.\"") : ''}>${l}</button>`).join('')}</div>
          <div class="card"><div class="sp"><span class="tiny muted">${esc(unit)}${LL(` · ◎ — рекорд</span><span class="seg" style="margin:0;padding:2px">`, ` · ◎ — PR</span><span class="seg" style="margin:0;padding:2px">`)}${[['4', LL('4 т', "4 wk")], ['12', LL('12 т', "12 wk")], ['all', LL('усе', "all")]].map(([k, l]) => `<button type="button" class="${ui.range === k ? 'on' : ''}" style="min-height:40px;min-width:44px;padding:4px 10px" data-act="range" data-v="${k}">${l}</button>`).join('')}</span></div>
          ${CHARTS.line([{ pts, color: 'var(--accent)', area: true }], { label: ex.name, empty: LL('Ще немає підходів у цій вправі', "No sets for this exercise yet") })}</div>
          ${histAll.length ? `<div class="grid3">
            <div class="stat"><b>${rec.e1rm ? fmt(rec.e1rm.v) : '—'}</b><span>${ex.type === 'db' || isMach(ex) ? KG(LL('рекорд максимуму, кг', "best est. 1RM, kg")) : LL('найкращий показник', "best result")}</span></div>
            <div class="stat"><b>${rec.heavy ? fmt(rec.heavy.total) : '—'}</b><span>${isMach(ex) ? LL('найбільша вага', "heaviest weight") : ON_BODY[ui.progEx] ? LL('найважча гантель', 'heaviest dumbbell') : LL('найважче в руках', "heaviest in hand")}${KG(LL(`, кг`, `, kg`))}${rec.heavy ? ' × ' + rec.heavy.set.reps : ''}</span></div>
            <div class="stat"><b>${rec.vol ? fmt(Math.round(rec.vol.v)) : '—'}${KG(LL(`</b><span>найбільший обсяг, кг</span></div></div>
            `, `</b><span>biggest volume, kg</span></div></div>
            `))}${repRows.length ? `${LL(`<h2>Рекорди повторень</h2><div class="card"><ul class="list">`, `<h2>Rep PRs</h2><div class="card"><ul class="list">`)}${repRows.map((L) => `<li><span>${ex.type === 'band' ? LL('рівень ', "level ") + fmt(L) : isMach(ex) ? fmt(L) + KG(LL(' кг', " kg")) : LL('гриф + ', "handle + ") + fmt(L) + KG(LL(' кг', " kg"))}</span><span><b>${rec.reps[String(L)].reps}</b> <span class="tiny muted">${dm(rec.reps[String(L)].date)}</span></span></li>`).join('')}</ul></div>` : ''}${LL(`
            <h2>Останні тренування</h2><div class="card"><ul class="list">`, `
            <h2>Recent workouts</h2><div class="card"><ul class="list">`)}${histAll.slice(-6).reverse().map((x) => `<li><span>${dm(x.date)}</span><span class="small">${x.sets.map((s) => esc(setText(ex, s))).join(', ')}</span></li>`).join('')}</ul></div>` : ''}
          ${ex.tip ? `<div class="note small">${esc(ex.tip)}</div>` : ''}`;
      }
    } else if (ui.progTab === 'body') {
      body = progBodyHtml();
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
        `)}${r.kcal ? `<p class="small muted" style="text-align:center" data-tip="${esc(KC_TIP())}">≈ ${fmt(r.kcal.total)}${LL(' ккал за тренування місяця', ' kcal from this month’s workouts')}</p>` : ''}${r.gains && r.gains.length ? `${LL(`<h2>Найбільший приріст</h2><div class="card"><ul class="list">`, `<h2>Biggest gains</h2><div class="card"><ul class="list">`)}${r.gains.slice(0, 5).map((g) => `<li><span>${esc(prog.ex[g.id].name)}</span><span class="chip ok" data-tip="${esc(GAIN_TIP())}">+${g.pct} %</span></li>`).join('')}</ul></div>` : ''}
        ${(() => { /* тіло за місяць (з 3.21.5; слово Alexа 24.10, пункт 2): вага — за середньою за 7 днів, талія — самі заміри */
          const rows = [['weight', true, LL('Вага (середня за 7 днів)', 'Weight (7-day average)')], ['waist', false, LL('Талія', 'Waist')]].map(([k, sm, nm]) => {
            const b = ENGINE.bodyMonth(p.body[k] || [], ym, sm); if (!b) return '';
            return `<li><span>${nm}</span><span>${b.ch === null ? fmt(MV(k, b.to)) + ' ' + MU(k) : fmt(MV(k, b.from)) + ' → ' + fmt(MV(k, b.to)) + ' ' + MU(k) + ' (' + sgn1(MV(k, b.to) - MV(k, b.from)) + ')'}</span></li>`; }).filter(Boolean);
          return rows.length ? `<h2>${LL('Тіло за місяць', 'Body this month')}</h2><div class="card"><ul class="list">${rows.join('')}</ul><p class="tiny muted" style="margin:6px 0 0">${LL('Було — останній запис до цього місяця (немає — перший у місяці), стало — останній у місяці.', 'Before — the last entry before this month (or the first one in it); after — the last one in the month.')}</p></div>` : ''; })()}
        ${p.sessions.some((s) => s.date.slice(0, 4) === String(Y)) ? `<button type="button" class="wide" data-act="year" data-v="${Y}" data-tip="${esc(YR_TIP())}">${LL('🎁 Підсумок ', '🎁 ')}${Y}${LL(' року', ' in review')}</button>` : ''}
        ${msHtml()}
        ${(() => { const ms = p.sessions.filter((s) => s.date.slice(0, 7) === ym && s.ready); if (!ms.length) return ''; const c = { g: 0, y: 0, r: 0 }; ms.forEach((s) => { c[s.ready] = (c[s.ready] || 0) + 1; });
          return `${LL(`<h2>Самопочуття перед тренуваннями</h2><div class="card"><div class="row" style="gap:6px">`, `<h2>How you felt before workouts</h2><div class="card"><div class="row" style="gap:6px">`)}${ms.map((s) => `<span class="rdot ${s.ready}" title="${dm(s.date)}"></span>`).join('')}</div><p class="small muted">🟢 ${c.g} · 🟡 ${c.y} · 🔴 ${c.r}${c.r >= 2 ? LL(' — болить часто: варто до лікаря з МРТ.', " — it hurts often: worth seeing a doctor and getting an MRI.") : ''}</p></div>`; })()}
        ${moodMonth(ym)}
        ${(() => { const rc = []; p.sessions.slice().reverse().forEach((s) => (s.prList || []).forEach((x) => { if (rc.length < 6) rc.push({ d: s.date, ex: x.ex, t: x.types }); })); return rc.length ? `${LL(`<h2>Останні рекорди</h2><div class="card"><ul class="list">`, `<h2>Recent PRs</h2><div class="card"><ul class="list">`)}${rc.map((r) => `<li><span>${esc((prog.ex[r.ex] || { name: r.ex }).name)}<div class="tiny muted">${dm(r.d)}</div></span><span class="chip g">🏆 ${r.t.map((t) => ({ e1rm: LL('максимум', "est. 1RM"), weight: LL('вага', "weight"), reps: LL('повторення', "reps") }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''; })()}${LL(`
        <h2>Календар</h2><div class="card">`, `
        <h2>Calendar</h2><div class="card">`)}${CHARTS.month(ym, marks, today())}${LL(`</div>
        <p class="tiny muted">Порівняння — з попереднім місяцем. Приріст — найкращий показник вправи в цьому місяці проти всього, що було раніше.</p>`, `</div>
        <p class="tiny muted">Compared with the previous month. Gain — the exercise’s best result this month vs. everything before.</p>`)}`;
    }
    app.innerHTML = `${LL(`<h1>Прогрес</h1>`, `<h1>Progress</h1>`)}${seg}${body}`;
    const sel = document.getElementById('exSel'); if (sel) sel.onchange = () => { ui.progEx = sel.value; rProgress(); };
    tourMaybe('progress');
  }

  /* ---------- тіло ---------- */
  const MEAS = [['weight', LL('Вага', "Weight"), LL('кг', "kg"), 25, 300], ['waist', LL('Талія', "Waist"), LL('см', "cm"), 40, 250], ['chest', LL('Груди', "Chest"), LL('см', "cm"), 50, 250], ['hips', LL('Стегна', "Hips"), LL('см', "cm"), 50, 250], ['arm', LL('Рука', "Arm"), LL('см', "cm"), 15, 80]];
  /* тести цієї програми (з 3.25.0): true — усі (жіноча база), масив — лише ці; поле — за початком ключа (bal → balL, balR) */
  const testOn = (k) => { const t = G().tests; return t === true || (Array.isArray(t) && t.some((x) => k.indexOf(x) === 0)); };
  /* віджимання за раз (пункт 19): Yang та ін., JAMA Network Open 2019 — 1 104 активні чоловіки, 10 років */
  /* тести форми (з 3.27.3 — набір за віком, здоровʼям і місцем: generator.js → tests; слово Alexа 26.10 «Так» на запропонований набір).
     «Як виконувати тести»: кожен тест — назва й один короткий рядок (слово Alexа 25.10: «максимально короткий опис залишити як зараз для віджимання»), дотик — 3D
     («потрібна 3Д модель для кожного тесту в тому місці де натискаєш „як виконувати тест“») і що означає число. Норми — лише там, де їх дає першоджерело, інакше — особистий ріст.
     Варіант віджимань і бічної планки записується (pushV, spV): інакше числа різних місяців не порівняти */
  const TV = () => {
    if (ui.tv && ui.tv.p === DB.active) return ui.tv;
    const last = (k) => { const t = (P().body.tests || []).filter((x) => x[k]).sort((a, b) => (a.d < b.d ? 1 : -1))[0]; return t ? t[k] : null; };
    ui.tv = { p: DB.active, pushV: last('pushV') || (G().sex === 'f' ? 'k' : 't'), spV: last('spV') || 'f' }; return ui.tv;
  };
  /* 30 с вставань з крісла: менше за поріг — «нижче середнього» для віку й статі, частіше падіння (CDC STEADI за Rikli, Jones 1999; лише 60–94 роки) */
  const CHAIR_CDC = [[60, 14, 12], [65, 12, 11], [70, 12, 10], [75, 11, 10], [80, 10, 9], [85, 8, 8], [90, 7, 4]];
  const chairThr = (age, f) => { if (!(age >= 60 && age <= 94)) return null; const r = CHAIR_CDC.filter((x) => age >= x[0]).pop(); return { from: r[0], to: r[0] + 4, n: f ? r[2] : r[1] }; };
  /* що означає число: віджимання — Yang 2019 (лише чоловіки); крісло — CDC; одна нога — Araújo 2022, BJSM (51–75 років); підлога — Brito 2014 (51–80 років);
     ходьба — Kodama 2009, JAMA (витривалість); формули VO₂max (UKK) і норми 6 хв (Enright 1998) не показуємо — першоджерело формули UKK платне, а відкрита стаття
     застосовує «жіночу» формулу до вибірки з 16 чоловіків; до норм 6 хв у 2020 вийшла поправка, зміст якої не вдалося звірити (CLAUDE.md §11) */
  const testNorm = (k) => {
    const age = Number((P().me || {}).age), f = G().sex === 'f';
    if (k === 'push') return f ? LL('Для вас це особистий показник: дослідження звʼязку віджимань із серцем проводили лише на чоловіках.', 'This is your personal marker: the study linking push-ups to heart health included only men.')
      : LL('Віджимання за раз — простий показник здоровʼя: у 10-річному дослідженні 1 104 активних чоловіків у тих, хто робив понад 40, серцевих подій було на 96 % менше, ніж у тих, хто менше 10 (звʼязок, не доказ причини).', 'Push-ups in one go are a simple health marker: in a 10-year study of 1,104 active men, those who did more than 40 had 96% fewer heart events than those who did fewer than 10 (an association, not proof of cause).');
    if (k === 'chair') { const c = chairThr(age, f); return c ? LL(`Для ${f ? 'жінок' : 'чоловіків'} ${c.from}–${c.to} років менше ${c.n} разів — нижче середнього (CDC): частіше падіння.`, `For ${f ? 'women' : 'men'} aged ${c.from}–${c.to}, fewer than ${c.n} stands is below average (CDC): falls are more likely.`) : LL('Норми CDC — для 60–94 років; для вас це особистий показник.', 'CDC norms are for ages 60–94; for you it’s a personal marker.'); }
    if (k === 'bal') return age >= 51 && age <= 75 ? LL('Поріг — 10 с: серед 1 702 людей 51–75 років ті, хто не встояв 10 с, мали вищий ризик смерті (×1,84; звʼязок, не доказ причини).', 'The threshold is 10 sec: among 1,702 people aged 51–75, those who couldn’t stand 10 sec had a higher risk of death (×1.84; an association, not proof of cause).')
      : LL('Для вас це особистий показник: поріг 10 с перевірено у 51–75 років.', 'For you it’s a personal marker: the 10-sec threshold was studied at ages 51–75.');
    if (k === 'srt') return LL('Серед 2 002 людей 51–80 років кожен бал більше — на 21 % краща виживаність (звʼязок, не доказ причини).', 'Among 2,002 people aged 51–80, each extra point meant 21% better survival (an association, not proof of cause).');
    if (k === 'walk' || k === 'w6') return LL('Витривалість — найсильніший показник здоровʼя: +1 MET — на 13 % нижча смертність (33 дослідження, ≈ 103 тис. людей). Тут — ваш ріст: ', 'Endurance is the strongest health marker: +1 MET means 13% lower mortality (33 studies, ≈ 103,000 people). Here you track your progress: ')
      + (k === 'walk' ? LL('той самий маршрут швидше при тому самому чи нижчому пульсі.', 'the same route faster at the same or a lower pulse.') : LL('далі за ті самі 6 хв.', 'farther in the same 6 minutes.'));
    return '';
  };
  /* плашка праворуч від поля (з 3.27.7; слово Alexа 26.10: «чому в тестах не завжди відображається скільки норма (адаптована під мої данні) маленьким блочком по типу кнопки справа від поля»):
     норма — лише там, де її дає першоджерело для вашого віку й статі (межі ті самі, що в testNorm: віджимання з носків — чоловіки, Yang 2019; крісло — 60–94 роки, CDC STEADI;
     одна нога — 51–75, Araújo 2022; підлога — 51–80, Brito 2014: найнижчий ризик — 8–10 балів, ESC 2012), інакше — ваш рекорд того самого варіанта й боку, інакше — «без норми»;
     дотик — пояснення. Таблиць норм віджимань за віком (канадський тест 1986) у першоджерелі знайти не вдалося, а вторинні джерела дають різні числа — їх не беремо */
  const testChip = (f) => {
    const age = Number((P().me || {}).age), fem = G().sex === 'f', tv = TV(), tl = P().body.tests || [], sec = LL(' с', ' sec');
    const best = (key, sel, low) => { const v = tl.filter((t) => t[key] !== null && t[key] !== undefined && t[key] !== '' && (!sel || sel(t))).map((t) => Number(t[key])); return v.length ? (low ? Math.min : Math.max)(...v) : null; };
    const rec = (v, txt, why, more) => (v === null
      ? { k: 'z', t: LL('без норми', 'no norm'), tip: why + LL(' Після першого запису тут буде ваш рекорд — головне, щоб число росло.', ' After your first result, your best will show here — what matters is that the number goes up.') }
      : { k: 'r', t: LL('рекорд ', 'best ') + txt, tip: why + LL(' Тут — ваш найкращий результат', ' Here is your best result') + (more || '') + LL(': головне, щоб число росло.', ': what matters is that the number goes up.') });
    if (f === 'push') {
      const pv = tv.pushV;
      if (!fem && pv === 't') return { k: 'n', t: LL('ціль > 40', 'goal > 40'), tip: LL('Понад 40 віджимань з носків за раз: у 10-річному дослідженні 1 104 активних чоловіків (середній вік — 40 років) у тих, хто робив понад 40, серцевих подій було на 96 % менше, ніж у тих, хто менше 10 (звʼязок, не доказ причини).', 'More than 40 push-ups from the toes in one go: in a 10-year study of 1,104 active men (average age 40), those who did more than 40 had 96% fewer heart events than those who did fewer than 10 (an association, not proof of cause).') };
      const v = best('push', (t) => (t.pushV || '') === pv);
      return rec(v, fmt(v), fem ? LL('Дослідження звʼязку віджимань із серцем проводили лише на чоловіках.', 'The study linking push-ups to heart health included only men.') : LL('Ціль «понад 40» — для віджимань з носків, як у дослідженні.', 'The “more than 40” goal is for push-ups from the toes, as in the study.'),
        pv === 'k' ? LL(' з колін', ' from the knees') : LL(' з носків', ' from the toes'));
    }
    if (f === 'chair') {
      const c = chairThr(age, fem);
      if (c) return { k: 'n', t: LL('норма ≥ ', 'norm ≥ ') + c.n, tip: testNorm('chair') + LL(` ${c.n} і більше — середній рівень і вище.`, ` ${c.n} or more is average or above.`) };
      const v = best('chair'); return rec(v, fmt(v), LL('Норми CDC — для 60–94 років.', 'CDC norms are for ages 60–94.'));
    }
    if (f === 'balL' || f === 'balR') {
      if (age >= 51 && age <= 75) return { k: 'n', t: LL('норма ≥ 10 с', 'norm ≥ 10 sec'), tip: testNorm('bal') };
      const v = best(f); return rec(v, fmt(v) + sec, LL('Поріг 10 с перевірено у 51–75 років.', 'The 10-sec threshold was studied at ages 51–75.'));
    }
    if (f === 'srt') {
      if (age >= 51 && age <= 80) return { k: 'n', t: LL('ціль 8–10', 'goal 8–10'), tip: LL('Серед 2 002 людей 51–80 років найнижчий ризик смерті був у тих, хто набрав 8–10 балів: у 0–3 бали — у 5–6 разів вищий; кожен бал більше — на 21 % краща виживаність (звʼязок, не доказ причини).', 'Among 2,002 people aged 51–80, the lowest risk of death was in those who scored 8–10 points: at 0–3 points it was 5–6 times higher; each extra point meant 21% better survival (an association, not proof of cause).') };
      const v = best('srt'); return rec(v, fmt(v), LL('Межі перевірено у 51–80 років.', 'The bands were studied at ages 51–80.'));
    }
    if (f === 'spL' || f === 'spR') { const v = best(f, (t) => (t.spV || 'f') === tv.spV); return rec(v, fmt(v) + sec, LL('Перевіреної норми бічної планки немає.', 'There’s no verified side-plank norm.'), tv.spV === 'k' ? LL(' з колін', ' from the knees') : LL(' з ніг', ' from the feet')); }
    if (f === 'carL' || f === 'carR') { const v = best(f); return rec(v, fmt(v) + sec, LL('Перевіреної норми немає: вага в кожного своя.', 'There’s no verified norm: everyone uses their own weight.')); }
    if (f === 'walkM') { const v = best('walkT', null, true); return rec(v, v === null ? '' : mmss(v), LL('Норму часу не показуємо: формулу оцінки не вдалося звірити з першоджерелом.', 'We don’t show a time norm: the estimation formula couldn’t be checked against its original source.')); }
    if (f === 'walkHR') {
      const l = tl.filter((t) => t.walkT && t.walkHR).sort((a, b) => (a.d < b.d ? -1 : 1)).pop();
      const why = LL('Норми пульсу після ходьби немає: порівнюйте з собою — той самий маршрут швидше при тому самому чи нижчому пульсі.', 'There’s no norm for pulse after walking: compare with yourself — the same route faster at the same or a lower pulse.');
      return l ? { k: 'r', t: LL('було ', 'last ') + l.walkHR, tip: why + LL(' Тут — пульс минулого разу.', ' Here is last time’s pulse.') } : { k: 'z', t: LL('без норми', 'no norm'), tip: why };
    }
    if (f === 'w6') { const v = best('w6'); return rec(v, fmt(v) + LL(' м', ' m'), LL('Норму 6 хв не показуємо: до неї вийшла поправка, яку не вдалося звірити.', 'We don’t show a 6-minute norm: a correction to it was published that couldn’t be checked.')); }
    return null;
  };
  const tChip = (f) => { const c = testChip(f); return c ? `<button type="button" class="tch ${c.k}" id="tc_${f}" data-act="tNorm" data-f="${f}" data-tip="${esc(c.tip)}">${esc(c.t)}</button>` : ''; };
  /* [тест, назва, короткий рядок, 3D-анімація] — порядок екрана */
  const TEST_HOW = () => { const tv = TV(); return [
    ['push', LL('Віджимання', 'Push-ups'), LL('З колін або з носків, без провисання.', 'From the knees or the toes, no sagging.'), tv.pushV === 't' ? 'pushup:t' : 'pushup'],
    ['chair', LL('Вставання з крісла за 30 с', '30-second chair stand'), LL('Руки схрещені на грудях; скільки разів повністю встали за 30 с.', 'Arms crossed on your chest; how many full stands in 30 sec.'), 't_chair'],
    ['sp', LL('Бічна планка', 'Side plank'), LL('З колін або з ніг, доки тіло рівне; на кожен бік.', 'From the knees or the feet, while your body stays straight; each side.'), tv.spV === 'k' ? 'sideplank' : 'sideplank:f'],
    ['bal', LL('Стійка на одній нозі', 'Single-leg stand'), LL('Руки на поясі, до 60 с на кожній нозі; поруч — стіна.', 'Hands on hips, up to 60 sec on each leg; a wall nearby.'), 't_bal'],
    ['srt', LL('Сісти й встати з підлоги', 'Sit and rise from the floor'), LL('Поруч — людина. 10 балів: −1 за кожну опору (рука, коліно, лікоть чи бік ноги), −½ за хитання.', 'With someone nearby. 10 points: −1 for each support (hand, knee, forearm or side of the leg), −½ for wobbling.'), 't_srt'],
    ['car', LL('Валізна прогулянка', 'Suitcase carry'), LL('Та сама вага щоразу, секунди на кожну руку.', 'Same weight every time, seconds for each hand.'), 'suitcase'],
    ['walk', LL('2 км ходьби', '2 km walk'), LL('Стадіон — 5 кіл; якомога швидше, не біжучи. Одразу — пульс: удари за 15 с × 4.', 'A track — 5 laps; as fast as you can without running. Right after — your pulse: beats in 15 sec × 4.'), 't_walk'],
    ['w6', LL('Ходьба 6 хв', '6-minute walk'), LL('У своєму темпі по відміряному колу; можна сповільнитись і зупинитись. З тиском чи серцем — з дозволу лікаря.', 'At your own pace on a measured loop; you may slow down and stop. With blood pressure or heart issues — with your doctor’s OK.'), 't_walk']]; };
  /* поля запису (k — поле, l — підпис з одиницею, u — підказка в полі); назва тесту — у заголовку картки, тож у підписі лише що вписати (з 3.27.7; до того — «Бічна планка — ліворуч, с»…);
     2 км — хвилини й секунди одним рядком, у записі — секунди (walkT) */
  const TESTS = [['push', LL('Скільки разів', 'How many'), LL('разів', 'reps')], ['chair', LL('Скільки разів за 30 с', 'How many in 30 sec'), LL('разів', 'stands')],
    ['spL', LL('Лівий бік, с', 'Left side, sec'), LL('с', 'sec')], ['spR', LL('Правий бік, с', 'Right side, sec'), LL('с', 'sec')],
    ['balL', LL('Ліва нога, с', 'Left leg, sec'), LL('с', 'sec')], ['balR', LL('Права нога, с', 'Right leg, sec'), LL('с', 'sec')],
    ['srt', LL('Балів з 10', 'Points out of 10'), LL('балів', 'points')],
    ['carL', LL('Ліва рука, с', 'Left hand, sec'), LL('с', 'sec')], ['carR', LL('Права рука, с', 'Right hand, sec'), LL('с', 'sec')],
    ['walkM', LL('Час: хвилини й секунди', 'Time: minutes and seconds'), LL('хв', 'min')], ['walkS', LL('Секунди', 'Seconds'), LL('с', 'sec')],
    ['walkHR', LL('Пульс одразу після, уд/хв', 'Pulse right after, bpm'), LL('уд/хв', 'bpm')], ['w6', LL('Відстань, м', 'Distance, m'), LL('м', 'm')]];
  /* підказки на затисканні нових полів (з 3.27.3; старі — у tips.js) */
  const TEST_TIP = () => ({ srt: LL('Бали за тест «сісти й встати з підлоги»: 10 мінус 1 за кожну опору, мінус ½ за хитання.', 'Score for sitting and rising from the floor: 10 minus 1 for each support, minus ½ for wobbling.'),
    walkM: LL('Скільки повних хвилин тривали 2 км.', 'How many full minutes the 2 km took.'), walkS: LL('І скільки секунд понад хвилини.', 'And how many seconds beyond the minutes.'),
    walkHR: LL('Пульс одразу після фінішу: удари за 15 с × 4.', 'Pulse right after the finish: beats in 15 sec × 4.'), w6: LL('Скільки метрів пройшли за 6 хвилин.', 'How many meters you walked in 6 minutes.') });
  /* з 3.27.4 кожен тест зберігається окремо: поля картки тесту (TEST_IN) і ключі запису (TEST_KEYS; 2 км — хвилини й секунди → walkT) */
  const TEST_IN = { push: ['push'], chair: ['chair'], sp: ['spL', 'spR'], bal: ['balL', 'balR'], srt: ['srt'], car: ['carL', 'carR'], walk: ['walkM', 'walkS', 'walkHR'], w6: ['w6'] };
  const TEST_KEYS = { push: ['push'], chair: ['chair'], sp: ['spL', 'spR'], bal: ['balL', 'balR'], srt: ['srt'], car: ['carL', 'carR'], walk: ['walkT'], w6: ['w6'] };
  const TEST_U = () => ({ push: LL('разів', 'reps'), chair: LL('разів', 'reps'), sp: LL('с', 'sec'), bal: LL('с', 'sec'), srt: LL('балів', 'points'), car: LL('с', 'sec'), w6: LL('м', 'm') });
  /* «цього разу зроблено» — запис за 21 день, як нагадка на головній (тижні тестів 1, 4, 8, 12) */
  const testDone = (k, tl) => tl.some((t) => Date.now() - tms(t.d) < 21 * 864e5 && TEST_KEYS[k].some((f) => t[f] !== null && t[f] !== undefined && t[f] !== ''));
  const TEST_LIM = { push: [0, 300], chair: [0, 80], spL: [0, 900], spR: [0, 900], balL: [0, 300], balR: [0, 300], srt: [0, 10], carL: [0, 900], carR: [0, 900], walkM: [5, 90], walkS: [0, 59], walkHR: [40, 230], w6: [30, 1500] };
  const mmss = (sec) => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');
  /* 3D у «Як виконувати тести»: кожен тест — свій блок, відкритий — один (полотно одне на застосунок) */
  function testViz() {
    if (typeof VIZ === 'undefined') return;
    const all = [...app.querySelectorAll('details.vzt')];
    const o = { t: TR, esc, mus: (ids) => ids.map(mName).join(' · ').toLowerCase(), style: () => (S().vz3 === 'xray' ? 'xray' : 'clay'), setStyle: (v) => { S().vz3 = v; save(); },
      L: { right: LL('правий бік', 'right side'), left: LL('лівий бік', 'left side'), work: LL('Працюють: ', 'Working: '), red: LL(' — червоним', ' — shown in red'),
        wait: LL('Завантаження…', 'Loading…'), fail: LL('3D недоступне на цьому пристрої — опис вище.', '3D isn’t available on this device — see the description above.'), play: LL('Грати', 'Play'), pause: LL('Пауза', 'Pause') } };
    all.forEach((det) => { VIZ.attach(det, o); det.addEventListener('toggle', () => { if (det.open) all.forEach((x) => { if (x !== det && x.open) x.open = false; }); }); });
  }
  let photoUrls = [];
  /* ---------- Кухня (з 3.20.0, слово Alexа 23.10: «щоб це була моя кухня всередині додатку»; «не брехала та не заводила в оману») ----------
     Розрахунки — KITCHEN (app/kitchen.js), склад — лише бази USDA і, з 3.27.7, BLS 4.0 (app/food_db.js, звірка tools/food_check.py) або етикетка людини.
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
    k.set = Object.assign({ meals: 4, glass: 350, per: 2, wake: '07:00', bed: '23:00', water: false }, k.set || {});  // per — склянок за раз (з 3.22.1)
    /* з 3.21.0 — перша й остання склянка свої; хто налаштовував підйом і сон — той самий розклад: перша через 15 хв після підйому, остання за 2 год до сну */
    if (!k.set.first || !k.set.last) { const t = KITCHEN.waterTimes(k.set.wake, k.set.bed, 2000, 1000); k.set.first = k.set.first || t[0].t; k.set.last = k.set.last || t[t.length - 1].t; }
    /* з 3.21.2 (раз): до особистої норми поле «Скільки пити» заповнювалось нормою програми й «Зберегти» записувало її як свою — така
       (2,5 л чоловікам, 2 л жінкам) стає особистою; інше число — свій вибір людини, лишається */
    if (k.set.wv !== 2) { if (k.set.vol === ((G() || {}).sex === 'f' ? 2000 : 2500)) k.set.vol = null; k.set.wv = 2; }
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
  /* 1 — долоня; 2–4 — долоні; 5+ — долонь; дробові (1,5) — родовий однини: «1,5 долоні», «1,5 кулака» (з 3.20.1; до того «1,5 долонь») */
  const kHandName = (h, n) => { const one = n === 1, few = n > 1 && n < 5 && n === Math.round(n);
    if (n !== Math.round(n)) return { palm: LL('долоні', 'palms'), fist: LL('кулака', 'fists'), cup: LL('жмені', 'cupped hands'), thumb: LL('пальця', 'thumbs') }[h];
    return { palm: one ? LL('долоня', 'palm') : few ? LL('долоні', 'palms') : LL('долонь', 'palms'), fist: one ? LL('кулак', 'fist') : few ? LL('кулаки', 'fists') : LL('кулаків', 'fists'),
      cup: one ? LL('жменя', 'cupped hand') : few ? LL('жмені', 'cupped hands') : LL('жмень', 'cupped hands'), thumb: one ? LL('палець', 'thumb') : few ? LL('пальці', 'thumbs') : LL('пальців', 'thumbs') }[h]; };
  const kHandWhat = () => ({ palm: LL('білок: мʼясо, риба, яйця, сир', 'protein: meat, fish, eggs, cheese'), fist: LL('овочі', 'vegetables'),
    cup: LL('вуглеводи: каша, картопля, хліб, фрукти', 'carbs: grains, potatoes, bread, fruit'), thumb: LL('жири: олія, горіхи, масло', 'fats: oil, nuts, butter') });

  function rKitchen() {
    const p = P(), k = kit(), d = ui.kDate || today(), day = kday(d), isToday = d === today();
    const N = kNorm(), nu = N.nu, sx = ksex(), tot = KITCHEN.dayTotals(day, sx, kctx()), meals = kMeals(), train = kTrain(d);
    const wd = isToday ? kWaterDay() : d, wday = kday(wd), wTrain = kTrain(wd);  // вода — за днем води (нічна зміна)
    const wTarget = kWTarget(wd), glass = k.set.glass, wg = kGlasses(wTarget, wday.water || 0, glass), dp = isToday ? kDayPlan() : null, tu = dp && dp.turn;
    const kMid = nu ? (nu.kLo + nu.kHi) / 2 : 0;
    const head = `<div class="sp"><h1>${LL('Кухня', 'Kitchen')}</h1><div class="row" style="gap:4px"><button type="button" class="sm ghost" data-act="kDay" data-v="-1" aria-label="${LL('попередній день', 'previous day')}">‹</button>
      <span class="small" style="min-width:74px;text-align:center">${isToday ? LL('сьогодні', 'today') : dm(d)}</span><button type="button" class="sm ghost" data-act="kDay" data-v="1"${isToday ? ' disabled' : ''} aria-label="${LL('наступний день', 'next day')}">›</button></div></div>`;
    const setup = !nu ? `<div class="note w">${!N.wNow ? LL('Запишіть вагу в «Тіло → Заміри» — і зʼявиться норма калорій і білка.', 'Log your weight in “Body → Measurements” and your calorie and protein targets will appear.') : LL('Вкажіть зріст і вік у «Налаштування кухні» — і зʼявиться норма.', 'Enter your height and age in “Kitchen settings” and your targets will appear.')}</div>` : '';
    const sum = `<div class="card ksum"><div class="row" style="gap:14px;align-items:center">
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
        <button type="button" class="sm" data-act="kGapAdd" data-j="${j}">+</button></div>`).join('')}<p class="tiny muted">${LL('Спершу — те, що ви вже їсте. Склад — з баз USDA і BLS чи ваших етикеток.', 'What you already eat comes first. Composition comes from the USDA and BLS databases or your own labels.')}</p></div>` : '';
    /* вода одним числом (огляд 24.10, слово Alexа: «вода одним числом»): кількість — лише в заголовку (рядок «Випито … · залишилось …» її повторював — тепер лише «Норму виконано ✓»),
       правила прийомів — у підказці на затискання заголовка (до огляду — постійний абзац ≈ 60 слів) */
    const wPlan = `${LL('Ваш план: ', 'Your plan: ')}${fmt(KITCHEN.waterTarget(sx, false, k.set.vol, kWRec()) / 1000)}${LL(' л на день', ' L a day')}${k.set.vol ? LL(' (своє', ' (your own') + (kWRec() ? LL('; рекомендовано ', '; recommended ') + fmt(kWRec() / 1000) + LL(' л', ' L') : '') + ')' : kWRec() ? LL(' (рекомендовано за вагою, статтю й віком)', ' (recommended for your weight, sex and age)') : LL(' (норма програми)', ' (program target)')}${LL(', у день тренування — +0,5 л', ', +0.5 L on training days')}${wTrain ? LL(' (сьогодні)', ' (today)') : ''}; ${kIntakesTxt(glass, wTrain, k.set.per).txt} ${LL('(склянка — ', '(a glass is ')}${glass}${LL(' мл), з ', ' ml), from ')}${k.set.first}${LL(' до ', ' to ')}${k.set.last}. ${LL('Випили раніше чи пізніше — час наступних прийомів рахується від вашої відмітки; більше — прийомів менше; менше чи пропустили — наступні більші, до обраного за раз; не вміщається — додатковий прийом; останній перед сном — не більший за попередній, а що не вміщається, не надолужуємо. Змінити — «Налаштування кухні».', 'Drank earlier or later — the next drinks are timed from when you logged it; drank more — fewer drinks left; drank less or missed one — the next ones get bigger, up to what you chose at a time; if it doesn’t fit, an extra drink is added; the last one before bed is never bigger than the one before it, and whatever doesn’t fit isn’t made up. Change it in “Kitchen settings.”')}`;
    const water = `<div class="card kwat"><div class="sp" data-tip="${esc(wPlan)}"><b>${LL('Вода', 'Water')}</b><span class="small muted">${fmt((wday.water || 0) / 1000)} ${LL('з', 'of')} ${fmt(wTarget / 1000)}${LL(' л', ' L')}</span></div>
      ${wg.icons}${(wday.water || 0) >= wTarget ? `<p class="tiny muted" style="margin:0 0 8px">${wg.line}</p>` : ''}${tu ? `<p class="small" style="margin:0 0 8px">${kTurnTxt(tu)}</p>` : dp && (wday.water || 0) < wTarget ? `<p class="small" style="margin:0 0 8px">${W_NOMORE()}</p>` : ''}${dp && dp.items.length ? `<p class="tiny muted" style="margin:0 0 8px">${LL('Сьогодні: ', 'Today: ')}${kPlanTxt(dp.items)}</p>` : ''}
      <div class="row"><button type="button" class="pri" style="flex:1" data-act="kWater" data-v="1">+ ${tu ? kGlW(tu.p) : LL('склянка', 'glass')}</button><button type="button" class="ghost" style="min-width:48px" data-act="kWater" data-v="0.5" aria-label="${LL('пів склянки', 'half a glass')}">+ ½</button><button type="button" class="ghost" style="min-width:48px" data-act="kWater" data-v="-1" aria-label="${LL('прибрати останню відмітку', 'remove the last entry')}">−</button></div>
      ${wd !== d ? `<p class="tiny muted">${LL('Нічна зміна: вода рахується від першої склянки о ', 'Night shift: water counts from your first glass at ')}${k.set.first}.</p>` : ''}${kHeartNote()}${kWaterRemindHtml()}</div>`;
    /* вага для норми (з 3.21.0, слово Alexа 23.10: «Прибери поле ваги з «Кухні»: лиши рядок, від якої ваги рахується норма (із «Замірів»), і пораду за темпом»):
       зважування — лише в «Тіло → Заміри» (до 3.21.0 тут було друге поле для тієї самої ваги); тут — від якої ваги норма, порада за темпом і перехід у «Заміри» */
    const weight = N.wNow ? `<div class="card"><div class="sp"><b>${LL('Вага для норми', 'Weight for your targets')}</b><button type="button" class="sm ghost" data-act="goMeas">${LL('Заміри', 'Measurements')}</button></div>
      <p class="small" style="margin:6px 0 0">${N.wMeas && N.wts.every((q) => q.src === 'q') ? fmt(BW(N.wMeas)) + ' ' + MU('weight') + LL(' — з анкети, перше зважування в «Замірах». Зважуйтесь там — норма стане точнішою.', ' — from your questionnaire, your first weigh-in in “Measurements.” Weigh in there and your targets will get more accurate.') : N.wMeas ? fmt(BW(N.wMeas)) + ' ' + MU('weight') + LL(' — середня за 7 днів із «Замірів».', ' — the 7-day average from “Measurements.”') : fmt(BW(N.wAns)) + ' ' + MU('weight') + LL(' — з анкети: зважувань ще немає. Запишіть вагу в «Заміри» — норма стане точнішою.', ' — from your questionnaire: no weigh-ins yet. Log your weight in “Measurements” and your targets will get more accurate.')}</p>
      ${N.tr && N.tr.rate !== null ? (() => { const tr = N.tr, adv = kAdvice(N); return `<div class="note ${adv.k === 'ok' ? 'ok' : adv.k === 'wait' ? '' : 'w'}" style="margin-top:8px">${LL('<b>За вашою вагою:</b> ', '<b>Based on your weight:</b> ')}${esc(LBT(adv.text))} <span class="tiny muted">(${LL('темп ', 'rate ')}${tr.rate > 0 ? '+' : tr.rate < 0 ? '−' : ''}${fmt(Math.abs(BW(tr.rate)))}${KG(LL(' кг на тиждень', ' kg per week'))})</span></div>`; })() : `<p class="tiny muted" style="margin:6px 0 0">${LL('Порада за темпом — після 2 тижнів зважувань у «Замірах» (зранку натщесерце).', 'Advice on your rate comes after 2 weeks of weigh-ins in “Measurements” (in the morning before eating).')}</p>`}${kBurnTxt(N)}</div>` : '';
    const wk = kWeek(d, N);
    app.innerHTML = `${head}${setup}${sum}${tday}${plate}<div class="card">${list}${copy}</div>${gapCard}${kMicroCard(day, sx, N)}${water}${weight}${wk}
      <div class="quick"><button type="button" class="sm" data-act="kMine">${LL('Мої продукти й страви', 'My foods and dishes')}</button><button type="button" class="sm" data-act="kSet">${LL('Налаштування кухні', 'Kitchen settings')}</button><button type="button" class="sm" data-act="kAbout">${LL('Як рахує кухня', 'How the kitchen counts')}</button></div>`;
    tourMaybe('kit');  // з 3.21.7 — новий ключ: стара «kitchen» не мала кроків і тихо позначалась «показано»
  }
  function kBar(label, v, lo, hi, unit) {
    const f = hi ? Math.min(1, v / hi) : 0, ok = lo && v >= lo;
    return `<div class="sp small"><span>${label}</span><span class="muted">${fmt(v)}${lo ? LL(' з ', ' of ') + lo + '–' + hi : ''}${unit}</span></div><div class="kbar"><i style="width:${Math.round(f * 100)}%"${ok ? ' class="ok"' : ''}></i></div>`;
  }
  /* справжні витрати з журналу й ваги (з 3.21.6; слово Alexа 24.10, пункт 5) — KITCHEN.realBurn за 21 останній повний день (до вчора);
     неповні дні (менше половини нижньої межі норми) не рахуються; норму застосунок сам не міняє — лише показує поруч */
  function kBurn(N) {
    const sx = ksex(), end = iso(new Date(tms(today()) - 864e5)), days = [];
    for (let j = 0; j < KITCHEN.BURN.win; j++) { const x = iso(new Date(tms(end) - j * 864e5)), dd = kday(x); if (dd.items.length) days.push({ d: x, kcal: KITCHEN.dayTotals(dd, sx, kctx()).kcal }); }
    return KITCHEN.realBurn(days, N.wts || [], end, N.nu ? N.nu.kLo / 2 : 800);
  }
  function kBurnTxt(N) {
    const b = kBurn(N);
    if (!b) return `<p class="tiny muted" style="margin:6px 0 0">${LL('Справжні витрати — після ', 'Your real expenditure — after ')}${KITCHEN.BURN.need}${LL(' днів повних записів їжі за 3 тижні й зважувань на початку й наприкінці.', ' days of full food logs over 3 weeks plus weigh-ins at the start and the end.')}</p>`;
    return `<div class="note small" style="margin-top:8px">${LL('<b>Справжні витрати:</b> ≈ ', '<b>Real expenditure:</b> ≈ ')}${b.kcal}${LL(' ккал на день', ' kcal a day')}${N.nu ? LL(' (за формулою — ', ' (by the formula — ') + N.nu.tdee + LL(')', ')') : ''}. <span class="tiny muted">${LL('За ', 'Over ')}${b.span}${LL(' днів: зʼїдено в середньому ', ' days: you ate ')}${b.intake}${LL(' ккал (', ' kcal on average (')}${plural(b.days, LL('день', 'day'), LL('дні', 'days'), LL('днів', 'days'))}${LL(' записів), вага ', ' logged), weight ')}${sgn1(BW(b.dW))} ${MU('weight')}. ${LL('Це оцінка: те, що не записали, і вода в тілі її зсувають. Норму застосунок не змінює.', 'It’s an estimate: anything you didn’t log and water in the body shift it. The app doesn’t change your targets.')}</span></div>`;
  }
  /* вітаміни й мінерали за день (з 3.21.6; слово Alexа 24.10, пункт 4) — KITCHEN.dayMicros / microNorm; норма — NIH ODS за статтю й віком */
  const MI_NAMES = () => ({ ca: [LL('Кальцій', 'Calcium'), LL(' мг', ' mg'), LL('кальцій', 'calcium')], fe: [LL('Залізо', 'Iron'), LL(' мг', ' mg'), LL('залізо', 'iron')], vc: [LL('Вітамін C', 'Vitamin C'), LL(' мг', ' mg'), LL('вітамін C', 'vitamin C')], vd: [LL('Вітамін D', 'Vitamin D'), LL(' мкг', ' mcg'), LL('вітамін D', 'vitamin D')] });
  function kMicroCard(day, sx, N) {
    const m = KITCHEN.dayMicros(day, sx, kctx()); if (!m.n) return '';
    const nm = KITCHEN.microNorm(sx, (N.me || {}).age), NM = MI_NAMES(), part = KITCHEN.MI_KEYS.filter((k) => m.miss[k] > m.none);
    const rows = KITCHEN.MI_KEYS.map((k) => { const v = m[k], t = nm[k];
      return `<div class="sp small"><span>${NM[k][0]}${part.indexOf(k) >= 0 ? '*' : ''}</span><span class="muted">${fmt(v)}${LL(' з ', ' of ')}${t}${NM[k][1]}</span></div><div class="kbar"><i style="width:${Math.round(Math.min(1, v / t) * 100)}%"${v >= t ? ' class="ok"' : ''}></i></div>`; }).join('');
    const notes = [m.none ? LL('Без даних — ', 'No data — ') + plural(m.none, LL('запис', 'entry'), LL('записи', 'entries'), LL('записів', 'entries')) + LL(': свої продукти з етикетки, порції «руками» й швидкі записи (складу вітамінів для них немає).', ': your own foods from labels, hand portions and quick entries (there’s no vitamin data for them).') : '',
      part.length ? '* ' + LL('Для частини продуктів у базі (USDA чи BLS) цього числа немає — фактично більше.', 'For some foods the database (USDA or BLS) has no number for this — the real amount is higher.') : '',
      LL('Вітамін D: у їжі його мало, шкіра робить його на сонці; рівень — аналізом у лікаря.', 'Vitamin D: few foods contain it, your skin makes it in the sun; check your level with a blood test at the doctor’s.'),
      LL('Норма — NIH (США) для вашої статі й віку.', 'Targets — NIH (US) for your sex and age.')].filter(Boolean);
    return `<div class="card"><div class="sp"><b>${LL('Вітаміни й мінерали', 'Vitamins and minerals')}</b><span class="tiny muted">${LL('з записаного', 'from what you logged')}</span></div>${rows}<p class="tiny muted" style="margin:6px 0 0">${notes.join(' ')}</p></div>`;
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
    return `<div class="sp" style="margin-top:8px"><span class="small">${LL('Нагадування про воду', 'Water reminders')}</span><button type="button" class="sm${on ? ' done' : ' pri'}" data-act="kWaterRemind">${on ? LL('Увімкнено', 'On') : LL('Увімкнути', 'Turn on')}</button></div>
      ${on ? `<p class="tiny muted">${LL('Нагадування — на кожен прийом за планом дня. Зранку — вода після сну, тепла чи кімнатна, як приємніше. Відмічене — без зайвих нагадувань.', 'A reminder for each drink in today’s plan. In the morning — water after you wake up, warm or room temperature, whatever you like. What you’ve logged skips extra reminders.')}</p>` : ''}`;
  }
  /* день води (з 3.20.0, 💡 слово Alexа «Спершу зроби 💡 «день води від підйому» для нічної зміни»): якщо сон закінчується пізніше
     за годинником, ніж підйом (нічна зміна — розклад переходить через північ), день води триває від підйому до наступного підйому: після
     опівночі й до підйому — ще вчорашній. Звичайний розклад — календарний день, як було. Той самий день рахує сервер (push.js waterDay). */
  const kHM = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const kWaterCross = () => { const k = kit(); return kHM(k.set.last) <= kHM(k.set.first); };  // з 3.21.0 — остання склянка раніше першої за годинником
  const kWaterDay = () => { const n = new Date(); return kWaterCross() && n.getHours() * 60 + n.getMinutes() < kHM(kit().set.first) ? iso(new Date(tms(today()) - 864e5)) : today(); };
  /* склянки: скільки за нормою, скільки випито, рядок «Випито 3 з 8 склянок · залишилось 5 (1,75 л)» (з 3.21.0, слово Alexа 23.10:
     «на головній не видно скільки склянок випив та скільки залишилось, потрібна така ж візуалізація як на кухні») */
  function kGlasses(target, ml, glass) {
    /* з 3.21.3 (жива перевірка 3.21.2: «Випито 0 з 7 склянок · залишилось 6½ склянки»): загальна кількість — теж у половинках, як залишок
       і порції; неповна остання склянка — половинний значок (слово Alexа 24.10: «загальна кількість склянок у половинках, як залишок») */
    const n = Math.ceil(target / (glass / 2) - 1e-9) / 2, done = Math.floor(ml / glass * 2 + 1e-9) / 2, left = Math.max(0, Math.ceil((target - ml) / (glass / 2) - 1e-9)) / 2, leftMl = Math.max(0, target - ml);  // з 3.21.1 — по половинці
    const icons = `<div class="glasses${ml >= target ? ' done' : ''}" data-tip="${esc(LL('Склянки: заповнені — випито. Норму на сьогодні виконано — усі стають охровими.', 'Glasses: filled — drunk. When today’s goal is done, they all turn ochre.'))}" role="img" aria-label="${LL('випито ', 'drank ')}${kGlN(ml >= target ? n : Math.min(done, n))}${LL(' з ', ' of ')}${kGlN(n)}">${Array.from({ length: Math.ceil(n) }, (_, j) => { const cap = Math.min(1, n - j), f = Math.min(cap, Math.max(0, (ml >= target ? n : done) - j)); return `<i class="${[f >= cap ? 'on' : f >= 0.5 ? 'half' : '', cap < 1 ? 'part' : ''].filter(Boolean).join(' ')}"></i>`; }).join('')}</div>`;
    const line = ml < target ? LL('Випито ', 'Drank ') + kGlN(Math.min(done, n)) + LL(' з ', ' of ') + kGlN(n) + (n % 1 ? LL(' склянки', ' glasses') : I18N.lang === 'en' ? (n === 1 ? ' glass' : ' glasses') : (n === 1 ? ' склянки' : ' склянок'))
      + ' · ' + LL('залишилось ', '') + kGlW(left) + LL('', ' left') + ' (' + fmt(leftMl / 1000) + LL(' л)', ' L)')
      : LL('Норму води на сьогодні виконано ✓', 'Today’s water goal is done ✓');
    return { n, done, left, icons, line };
  }
  /* норма води на день (мл): свій обʼєм або норма програми; день тренування — +0,5 л */
  /* особиста норма води на звичайний день, мл (з 3.21.2, KITCHEN.waterNeed — рівняння Yamada 2022): вага для норми — та сама, що в калоріях
     (середня за 7 днів «Замірів» або з анкети), стать, вік; немає ваги чи віку — null (норма програми) */
  const kWRec = () => { const N = kNorm(); return KITCHEN.waterNeed(ksex(), N.wNow, N.me.age); };
  const kWTarget = (d) => KITCHEN.waterTarget(ksex(), kTrain(d), kit().set.vol, kWRec());
  /* звідки норма — словами: «Рекомендовано вам: 2,2 л на звичайний день, 2,7 л у день тренування — за вагою 90 кг, статтю й віком …» */
  function kRecTxt() {
    const N = kNorm(), rec = kWRec();
    if (!rec) return LL('Зараз — норма програми: ', 'For now — the program target: ') + fmt(KITCHEN.waterTarget(ksex(), false) / 1000) + LL(' л на день, у день тренування +0,5 л. Особиста норма зʼявиться, коли будуть вага й вік.', ' L a day, +0.5 L on training days. Your personal target appears once your weight and age are set.');
    return LL('Рекомендовано вам: ', 'Recommended for you: ') + fmt(rec / 1000) + LL(' л на звичайний день, ', ' L on a regular day, ') + fmt((rec + 500) / 1000) + LL(' л у день тренування — за вагою ', ' L on a training day — based on your weight of ') + fmt(BW(N.wNow)) + ' ' + MU('weight') + LL(', статтю й віком ', ', sex and age ') + N.me.age +
      LL(' (обмін води з дослідження 5 604 людей, Science 2022, без води з їжі; не менше 2 л чоловікам і 1,6 л жінкам — настанова ESPEN). У спеку й при сильному поті пийте більше; при тиску чи серці — скільки скаже лікар.', ' (water turnover from a study of 5,604 people, Science 2022, minus water from food; at least 2 L for men and 1.6 L for women — ESPEN guideline). Drink more in hot weather or when you sweat a lot; with blood pressure or heart conditions, follow your doctor.');
  }
  /* розклад води на день: норма програми, склянка, підйом і сон з налаштувань; у день тренування — ще за 1,5 год до нього (час нагадування про тренування) */
  function kWaterTimes(d) {
    const k = kit(), train = kTrain(d), r = S().remind || {};
    return KITCHEN.waterPlan(k.set.first, k.set.last, kWTarget(d), k.set.glass, train && r.on ? (r.time || '18:00') : null, k.set.per);
  }
  /* склянки словами: «½», «1½ склянки», «2 склянки» (з 3.21.1: ніхто не міряє грами — лише склянка й половинка) */
  const kGlN = (x) => { const w = Math.floor(x + 1e-9), h = x - w > 0.25; return (w || !h ? String(w) : '') + (h ? '½' : ''); };
  const kGlW = (x) => (x - Math.floor(x + 1e-9) > 0.25 ? kGlN(x) + (x < 1 ? LL(' склянки', ' glass') : LL(' склянки', ' glasses')) : plural(Math.round(x), LL('склянка', 'glass'), LL('склянки', 'glasses'), LL('склянок', 'glasses')));
  const kNowHM = () => { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); };
  /* прийом на черзі сьогодні (з 3.21.1, KITCHEN.waterTurn; з 3.22.1 — за раз 1 чи 2 склянки, час решти — від останньої відмітки): пропустили — наступні більші, до обраного за раз, не вміщається —
     додатковий прийом; той самий розрахунок — у нагадуваннях на телефон (сервер отримує розклад, норму й останню відмітку) */
  function kTurn() { const p = kDayPlan(); return p && p.turn; }
  /* прийомів на сьогодні вже немає, а норму не виконано (аудит 25.10: головна мовчала, лишалось лише «Вода: 1,23 з 2,2 л») — правило «решту не надолужуємо» (§7) */
  const W_NOMORE = () => LL('Прийомів на сьогодні більше немає — решту не надолужуємо.', 'No more drinks planned for today — the rest isn’t made up.');
  function kTurnTxt(tu, short) {
    if (!tu) return '';
    const why = tu.capped ? LL(' — більше за раз не треба, решту не надолужувати', ' — no more than that at once; don’t chase the rest') : tu.up ? LL(' — доганяємо пропущене', ' — catching up on a missed one') : '';
    return (short ? LL('на черзі ', 'next ') : LL('На черзі ', 'Next ')) + (tu.now ? LL('зараз', 'now') : LL('о ', 'at ') + tu.t) + ' (' + (tu.k === 'extra' ? LL('додатковий, ', 'extra, ') : '') + LL('прийом ', 'drink ') + tu.i + LL(' з ', ' of ') + tu.n + '): ' + kGlW(tu.p) + (short ? '' : why);
  }
  /* план води на сьогодні з урахуванням відміченого (з 3.21.1): «08:00 ✓ · 12:20 пропущено · 16:40 — 3 склянки · 18:50 — 1 склянка (додатковий)» */
  /* відмітки дня для плану (з 3.27.5 — з прийомом, якому кожну зараховано, і злитими перед нею: { t, f, g }; давніші — лише час) і остання з них */
  const kWMarks = (day) => (day.wl || []).filter((x) => x.t).map((x) => (x.f ? { t: x.t, f: x.f, g: x.g || [] } : x.t));
  const kWAt = (day) => { const x = (day.wl || []).slice(-1)[0]; return x ? (x.f ? { t: x.t, f: x.f } : x.t) : ''; };
  function kDayPlan() {
    const wd = kWaterDay(), day = kday(wd);
    return KITCHEN.waterDayPlan(kWaterTimes(wd), kWTarget(wd), kit().set.glass, day.water || 0, kWAt(day), kNowHM(), kit().set.per, kWMarks(day));  // з 3.22.2 — ✓ лише прийомам з відміткою
  }
  /* з 3.27.8 — ✓ з часом, коли людина випила (x.at), а не з часом за розкладом */
  const kPlanTxt = (items) => items.map((x) => (x.st === 'done' && x.at ? x.at : x.t) + (x.st === 'done' ? ' ✓' : x.st === 'missed' ? LL(' пропущено', ' missed') : ' — ' + kGlW(x.h / 2) + (x.k === 'extra' ? LL(' (додатковий)', ' (extra)') : ''))).join(' · ');
  /* прийомів на день і порції — для налаштувань: «4 прийоми по 2 склянки» (у день тренування — свої) */
  /* з 3.22.1 — і порція за раз (per): вийшло більше обраного (вікно коротке або склянка велика) — кажемо чому */
  const kIntWhy = (g, per) => { per = per || kit().set.per; const a = kIntakesTxt(g, false, per), b = kIntakesTxt(g, true, per), over = Math.max(a.hi, b.hi) > per;
    return LL('Звичайний день: ', 'Regular day: ') + a.txt + LL('; день тренування: ', '; training day: ') + b.txt + '.' + (over ? (g * per > KITCHEN.WATER_RATE ? LL(' Дві такі склянки — понад 0,8 л, тому за раз — менше.', ' Two such glasses are over 0.8 L, so less at a time.') : LL(' Щоб за раз пити не більше обраного, потрібно ширше вікно між першою й останньою склянкою: частіше ніж раз на годину застосунок не планує.', ' To drink no more than you chose at a time, widen the window between the first and the last glass: the app doesn’t plan drinks more often than once an hour.')) : ''); };
  function kIntakesTxt(glass, train, per) {
    const k = kit(), t = KITCHEN.waterTarget(ksex(), train, k.set.vol, kWRec()), tt = KITCHEN.waterPlan(k.set.first, k.set.last, t, glass, null, per);
    const ps = KITCHEN.waterDayPlan(tt, t, glass, 0, '', tt[0].t, per).items.map((x) => x.h / 2), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
    return { hi, txt: plural(ps.length, LL('прийом', 'drink'), LL('прийоми', 'drinks'), LL('прийомів', 'drinks')) + LL(' по ', ' of ') + (lo === hi ? (hi === 1 ? LL('1 склянці', '1 glass') : kGlW(hi)) : kGlN(lo) + '–' + (hi === 1 ? LL('1 склянки', '1 glass') : kGlW(hi))) };  // «по 1 склянці», «по ½–1 склянки»
  }
  /* відмітка води: скільки й коли (з 3.21.1 — журнал дня: «−» прибирає саме останню відмітку, час — для склянки на черзі) */
  function kWaterLog(d, ml) {
    const day = kdayW(d), was = day.water || 0, now = d === kWaterDay() ? kNowHM() : '';
    /* з 3.27.5 — якому прийому належить відмітка, вирішуємо зараз, за планом, який людина бачить і про який їй нагадали, і зберігаємо (f): пізніші
       перерахунки (нові відмітки зсувають прийоми, зміна «за раз» чи часу — інший розклад) зараховане не переписують (скриншот Alexа 26.10: «я випив
       вчасно склянку а пише що я пропустив … можливо через те що я змінив в налаштуваннях з 2 склянок на 1 за раз») */
    const fg = now ? KITCHEN.waterMarkFor(kWaterTimes(d), kWTarget(d), kit().set.glass, was, kWAt(day), now, kit().set.per, kWMarks(day)) : { f: '', g: [] };
    day.water = was + ml;
    (day.wl = day.wl || []).push(fg.f ? Object.assign({ ml, t: now, f: fg.f }, fg.g.length ? { g: fg.g } : {}) : { ml, t: now }); if (day.wl.length > 60) day.wl.shift();
    /* охра — досягнення (з 3.27.2; слово Alexа 25.10: «роби пункти 1–4 … охра як досягнення»): норму на сьогодні щойно виконано — одне золоте повідомлення, як рекорд */
    const T = kWTarget(d); if (d === kWaterDay() && was < T && day.water >= T) toast(LL('💧 Норму води на сьогодні виконано', '💧 Today’s water goal is done'), true);
  }

  /* ---- додати запис: шторка з чотирма способами ---- */
  /* з 3.27.6 — «Мої» перша (слово Alexа 26.10: «і вкладка "Мої" має бути першою»): відкривається на «Мої», коли там уже щось є (свої продукти, страви чи збережені прийоми), інакше — «Продукт» (пошук у базі) */
  const kTab0 = () => { const k = kit(); return Object.keys(k.products).length || Object.keys(k.dishes).length || Object.keys(k.combos).length ? 'my' : 'food'; };
  function kAddOpen(m, edit) {
    ui.kAdd = edit !== undefined ? Object.assign({ mode: 'edit', i: edit }, JSON.parse(JSON.stringify(kday(ui.kDate || today()).items[edit]))) : { mode: 'new', m: m === undefined ? kMealNow() : m, tab: kTab0(), q: '' };
    if (ui.kAdd.mode === 'edit') ui.kAdd.tab = { food: 'food', my: 'my', dish: 'my', hand: 'hand', quick: 'num' }[ui.kAdd.t] || 'food';
    kAddDraw();
  }
  function kAddDraw() {
    const a = ui.kAdd, meals = kMeals(), k = kit();
    const tabs = [['my', LL('Мої', 'Mine')], ['food', LL('Продукт', 'Food')], ['hand', LL('Руками', 'By hand')], ['num', LL('Цифрами', 'Numbers')]];  // з 3.27.6 «Мої» — перша
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
      ${a.mode === 'edit' ? '' : `<div class="seg" style="margin:8px 0">${tabs.map(([t, l]) => `<button type="button" class="${a.tab === t ? 'on' : ''}" data-act="kTab" data-v="${t}">${l}</button>`).join('')}</div>`}${kAddedHtml(a)}
      <div id="kBody">${body}</div><div id="kPv">${pv}</div>
      ${(a.tab === 'food' && a.id) || ((a.tab === 'my') && (a.pid || a.did)) || a.tab === 'hand' || a.tab === 'num' ? `<div class="row" style="margin-top:10px">${a.mode === 'edit' ? `<button type="button" class="ghost" data-act="kDel">${LL('Видалити', 'Delete')}</button>` : `<button type="button" class="ghost" data-act="kBack">${LL('Назад', 'Back')}</button>`}<button type="button" class="pri" style="flex:1" data-act="kSave">${a.mode === 'edit' ? LL('Зберегти', 'Save') : LL('Додати', 'Add')}</button></div>` : ''}`);
    const q = document.getElementById('kQ'); if (q && a.tab === 'food' && !a.id && !(a.ph && a.ph.st) && S().tour.kadd) setTimeout(() => { try { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } catch (e) { /* немає */ } }, 60);
    if (ui.kAdd.mode === 'new') tourMaybe('kadd', true);  // перший раз — без клавіатури: спершу навчання
  }
  /* з 3.27.6 — прийом складається з кількох продуктів поспіль (слово Alexа 26.10: «продакти для страви складно додавати, бо коли натискаю сніданок то після того як додаю кожен продукт мене повертає назад в кухню замість того щоб продовжити складати кронструктор сніданку»): після «Додати» шторка
     лишається відкритою на тій самій вкладці, угорі — що вже в цьому прийомі, і «Готово» */
  function kAddedHtml(a) {
    if (a.mode !== 'new' || !a.added) return '';
    const mi = Math.min(Number(a.m) || 0, kMeals().length - 1), its = kday(ui.kDate || today()).items.filter((e) => (e.m || 0) === mi), nm = its.map((e) => kName(e));
    return `<div class="row" style="gap:8px;align-items:center;margin:0 0 8px"><div class="small" style="flex:1;min-width:0">${LL('У «', 'In “')}${esc(kMeals()[mi])}${LL('»: ', '”: ')}${esc(nm.slice(-4).join(', '))}${nm.length > 4 ? ' ' + LL('і ще ', 'and ') + (nm.length - 4) : ''}</div>`
      + `<button type="button" class="sm pri" data-act="kDone" data-tip="${esc(LL('Готово — закрити й повернутись на «Кухню». Додане вже записано.', 'Done — close and return to Kitchen. What you added is already saved.'))}">${LL('Готово', 'Done')}</button></div>`;
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
    const j = img ? await post('/food', { image: img.b64, lang: I18N.lang }, 50000) : null;  // з 3.27.8: сервер відповідає щонайпізніше за 40 с (FOOD_BUDGET) + 10 с на передачу фото; до того — 40 с, а сервер міг шукати до 48
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
    if (a.mode === 'new') {  // з 3.27.6 — шторка лишається: наступний продукт у той самий прийом (фото тарілки — далі його продукти)
      if (a.ph && a.ph.st === 'ok' && a.phj !== undefined && a.ph.items[a.phj]) a.ph.items[a.phj].done = true;
      const left = a.ph && a.ph.st === 'ok' && a.ph.items.some((x) => !x.done);
      ui.kAdd = { mode: 'new', m: a.m, tab: left ? 'food' : a.tab, q: '', ph: a.ph, added: (a.added || 0) + 1 };
      toast(LL('Додано: ', 'Added: ') + kName(e)); return kAddDraw();
    }
    closeSheet();
  }

  /* мій продукт з етикетки: на 100 г; страва за рецептом (💡1): інгредієнти сирими/сухими + вага готової страви */
  function kNewProd(edit) {
    const pr = edit ? kit().products[edit] : null;
    ui.kProd = { id: edit || null, back: !!sheetEl.querySelector('#kBody') };  // відкрито зі шторки «Додати» — після збереження туди й повертаємось
    openSheet(`<b>${LL('Продукт з етикетки', 'Food from a label')}</b><p class="small muted">${LL('Перепишіть з упаковки значення «на 100 г».', 'Copy the “per 100 g” values from the package.')}</p>
      <button type="button" class="wide kph" data-act="kBar">${ICON.cam}${LL('Сфотографувати штрихкод', 'Photograph the barcode')}</button><input id="kpBarIn" type="file" accept="image/*" capture="environment" hidden>
      <p class="tiny muted" id="kpBarSt" style="margin:4px 0 0">${LL('Числа підставляться з Open Food Facts — звірте з етикеткою. Туди йде лише номер коду.', 'The numbers come from Open Food Facts — check them against the label. Only the barcode number is sent there.')}</p>
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
    const k = kit(), id = ui.kProd.id || 'p' + Date.now().toString(36), code = ui.kProd.code || (k.products[id] || {}).code;
    k.products[id] = code ? { name, per100: x, code } : { name, per100: x };  // code — штрихкод (з 3.21.6): наступного разу той самий код — з вашого продукту
    save(); closeSheet(); toast(LL('Збережено', 'Saved'));
    if (ui.kProd.back && ui.kAdd && view === 'kitchen') { ui.kAdd = Object.assign(ui.kAdd, { tab: 'my', pid: id, did: null, how: 'g' }); return kAddDraw(); }
    return rKitchen();
  }
  /* штрихкод → «свій продукт з етикетки» (з 3.21.6; слово Alexа 24.10, пункт 6: «як помічник етикетки»): фото коду читає zxing-wasm
     (MIT, vendor/zxing, вантажиться лише тут), склад — Open Food Facts (безкоштовно, ODbL; дані вносять користувачі — тож лише заповнюємо
     поля, людина звіряє з етикеткою й зберігає сама). На Open Food Facts іде лише номер коду. Свій продукт з тим самим кодом — з нього. */
  let zx = null;
  function zxLoad() {
    if (zx) return zx;
    zx = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'vendor/zxing/zxing-reader.js';
      s.onload = () => { try { window.ZXingWASM.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? 'vendor/zxing/zxing_reader.wasm' : prefix + path) } }); ok(window.ZXingWASM); } catch (e) { no(e); } };
      s.onerror = no; document.head.appendChild(s);
    });
    zx.catch(() => { zx = null; });
    return zx;
  }
  /* фото → ImageData до side px по довшому боці (великі фото iPhone читаються повільно) */
  async function imgData(file, side) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); return g.getImageData(0, 0, c.width, c.height);
    } finally { URL.revokeObjectURL(url); }
  }
  async function kBarLoad(file) {
    const st = (t) => { const el = document.getElementById('kpBarSt'); if (el) el.textContent = t; };
    const fill = (o) => [['kpN', o.name], ['kpK', o.kcal], ['kpP', o.p], ['kpF', o.f], ['kpC', o.c]].forEach(([id, v]) => { const el = document.getElementById(id); if (el && v !== null && v !== undefined && v !== '') el.value = typeof v === 'number' ? String(v).replace('.', DEC) : v; });
    st(LL('Читаю штрихкод…', 'Reading the barcode…'));
    let code = '';
    try {
      const Z = await zxLoad();
      for (const side of [1600, 1000]) {
        const r = await Z.readBarcodes(await imgData(file, side), { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 1 });
        if (r && r[0] && r[0].text && r[0].isValid !== false) { code = r[0].text; break; }
      }
    } catch (e) { st(navigator.onLine === false ? LL('Немає інтернету — читач штрихкоду завантажується лише онлайн. Перепишіть числа з етикетки.', 'No internet — the barcode reader loads online only. Copy the numbers from the label.') : LL('Не вдалося прочитати фото — перепишіть числа з етикетки.', 'Couldn’t read the photo — copy the numbers from the label.')); return; }
    if (!code) { st(LL('Штрихкод не знайдено — сфотографуйте ближче, рівно й при світлі або перепишіть числа з етикетки.', 'No barcode found — take the photo closer, straight on and in good light, or copy the numbers from the label.')); return; }
    if (ui.kProd) ui.kProd.code = code;
    const mine = Object.values(kit().products).find((x) => x && x.code === code);
    if (mine) { fill(Object.assign({ name: mine.name }, mine.per100)); st(LL('Код ', 'Code ') + code + LL(' — це ваш продукт «', ' — it’s your food “') + mine.name + LL('»: числа з нього.', '”: the numbers are from it.')); return; }
    st(LL('Код ', 'Code ') + code + LL(': шукаю в Open Food Facts…', ': looking it up in Open Food Facts…'));
    let j = null;
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
      const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?fields=code,product_name,product_name_uk,product_name_en,brands,nutriments', { signal: ac.signal });
      clearTimeout(t); j = r.ok || r.status === 404 ? await r.json() : null;
    } catch (e) { j = null; }
    if (!document.getElementById('kpN')) return;  // шторку закрили — нічого не заповнюємо
    if (!j) { st(navigator.onLine === false ? LL('Немає інтернету — перепишіть числа з етикетки.', 'No internet — copy the numbers from the label.') : LL('Open Food Facts зараз не відповідає — перепишіть числа з етикетки.', 'Open Food Facts isn’t responding right now — copy the numbers from the label.')); return; }
    const lb = KITCHEN.offLabel(j);
    if (!lb) { st(LL('Код ', 'Code ') + code + LL(': в Open Food Facts цього товару немає — перепишіть числа з етикетки.', ': this product isn’t in Open Food Facts — copy the numbers from the label.')); return; }
    fill(lb);
    const NMS = { kcal: LL('калорії', 'calories'), p: LL('білок', 'protein'), f: LL('жири', 'fat'), c: LL('вуглеводи', 'carbs') };
    st(LL('Заповнено з Open Food Facts (дані вносять користувачі, ліцензія ODbL) — звірте з етикеткою й збережіть.', 'Filled in from Open Food Facts (data added by users, ODbL license) — check it against the label and save.') + (lb.missing.length ? LL(' Бракує: ', ' Missing: ') + lb.missing.map((k) => NMS[k]).join(', ') + '.' : ''));
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
    save(); rKitchen(); toast(LL('Додано: ', 'Added: ') + c.name);  // з 3.27.6 — шторка лишається (можна додати ще)
    const a = ui.kAdd; ui.kAdd = { mode: 'new', m: a.m, tab: a.tab, q: '', ph: a.ph, added: (a.added || 0) + 1 }; return kAddDraw();
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
      <label class="f">${LL('Склянка води, мл', 'Glass of water, ml')}</label><div class="seg">${[250, 300, 350, 400, 450, 500].map((n) => `<button type="button" class="${k.set.glass === n ? 'on' : ''}" data-act="kSetGlass" data-v="${n}">${n}</button>`).join('')}</div>
      <label class="f">${LL('За раз пити', 'Drink at a time')}</label><div class="seg">${[1, 2].map((n) => `<button type="button" class="${k.set.per === n ? 'on' : ''}" data-act="kSetPer" data-v="${n}" data-tip="${esc(n === 1 ? LL('Пити по 1 склянці — прийомів більше, кожен менший.', 'Drink 1 glass at a time — more drinks, each smaller.') : LL('Пити до 2 склянок за раз — прийомів менше (не менше 4 на день).', 'Drink up to 2 glasses at a time — fewer drinks (at least 4 a day).'))}">${n === 1 ? LL('1 склянку', '1 glass') : LL('2 склянки', '2 glasses')}</button>`).join('')}</div>
      <p class="tiny muted" id="kInt">${kIntWhy(k.set.glass)}</p>
      <label class="f">${LL('Скільки пити на день, л', 'How much to drink a day, L')}</label><input inputmode="decimal" id="kVol" value="${fmt(KITCHEN.waterTarget(ksex(), false, k.set.vol, kWRec()) / 1000)}" data-v0="${fmt(KITCHEN.waterTarget(ksex(), false, k.set.vol, kWRec()) / 1000)}">
      <p class="tiny muted" id="kRec">${esc(kRecTxt())}</p>${kWRec() ? `<button type="button" class="sm ghost" data-act="kVolRec">${LL('Як рекомендовано', 'As recommended')}</button>` : ''}
      <div class="grid2"><div><label class="f">${LL('Перша склянка о', 'First glass at')}</label><input type="time" id="kFirst" value="${k.set.first}"></div><div><label class="f">${LL('Остання склянка о', 'Last glass at')}</label><input type="time" id="kLast" value="${k.set.last}"></div></div>
      <p class="tiny muted">${LL('Решту застосунок рахує сам: прийоми — рівно між першою й останньою склянкою, не менше 4 на день, а щоб за раз пити не більше обраного — більше (не частіше ніж раз на годину й не більше 0,8 л за раз); після кожної відмітки час і обʼєм решти прийомів перераховуються від неї; склянка — щоб рахувати порції без грамів; у день тренування — ще 0,5 л і прийом за 1,5 год до тренування (час — з нагадувань). Остання — краще за 1–2 год до сну, щоб не прокидатись уночі.', 'The app works out the rest: drinks evenly between the first and the last glass, at least 4 a day, and more so you never drink more than you chose at a time (no more often than once an hour and no more than 0.8 L at once); after each logged drink, the time and amount of the remaining drinks are recalculated from it; the glass size just lets you count portions without measuring; on training days, 0.5 L more and a drink 1.5 hours before the workout (time from reminders). Best to have the last one 1–2 hours before bed so you don’t wake up at night.')}</p>
      <button type="button" class="pri wide" data-act="kSetSave">${LL('Зберегти', 'Save')}</button>`);
  }
  function kAbout() {
    const N = kNorm();
    openSheet(`<b>${LL('Як рахує кухня', 'How the kitchen counts')}</b>
      ${N.nu ? `<p class="small">${LL('<b>Ваша норма.</b> ', '<b>Your targets.</b> ')}${esc(kCalcTxt(N).replace(/^./, (c) => c.toUpperCase()))}</p>` : ''}
      <p class="small">${LL('<b>Норма.</b> Калорії — формула Міффліна — Сан Жеора × 1,45 і мета програми. Білок — від цільової ваги, якщо її вказано, інакше від поточної (за ожиріння — не вище ваги для ІМТ 30).', '<b>Targets.</b> Calories — Mifflin–St Jeor × 1.45 and your program goal. Protein — from your target weight if you set one, otherwise from your current weight (with obesity, capped at the weight for BMI 30).')}</p>
      <p class="small">${LL('<b>Склад.</b> Дві державні бази: USDA FoodData Central (SR Legacy, США) і BLS 4.0 (Max Rubner-Institut, Німеччина, 2025; CC BY 4.0, doi.org/10.25826/Data20251217-134202-0). Числа на 100 г і мірки — без змін з першоджерела; лише у BLS вуглеводи вказано без клітковини, тут клітковину додано, як у USDA. Мірки (штука, ложка, чашка) є лише в USDA, у продуктів BLS — грами. Страви бази — середній рецепт, ваш може відрізнятися. Кефіру 2,5 % немає в жодній державній базі: його склад — середнє записів BLS для 1,5 % і 3,5 % (білок і вуглеводи кефіру від жирності майже не залежать). Ваші продукти — з етикетки, страви — з вашого рецепта.', '<b>Composition.</b> Two government databases: USDA FoodData Central (SR Legacy, US) and BLS 4.0 (Max Rubner-Institut, Germany, 2025; CC BY 4.0, doi.org/10.25826/Data20251217-134202-0). Per-100 g numbers and measures exactly as published; only BLS lists carbohydrates without fibre — here fibre is added, as in USDA. Measures (piece, spoon, cup) exist only in USDA; BLS foods are in grams. Database dishes are an average recipe, yours may differ. No government database lists 2.5% kefir: its composition is the average of the BLS entries for 1.5% and 3.5% (kefir’s protein and carbs barely depend on fat). Your foods — from the label; your dishes — from your recipe.')}</p>
      <p class="small">${LL('<b>Точність.</b> «зважено» і «етикетка» — найточніше; «мірка» — склад точний, а вага залежить від повноти ложки чи склянки; «орієнтир» — порції руками Precision Nutrition.', '<b>Accuracy.</b> “weighed” and “label” are the most accurate; “measure” — the composition is exact, the weight depends on how full the spoon or cup is; “estimate” — Precision Nutrition hand portions.')}</p>
      <p class="small">${(isLb() ? LL('<b>Тарілка й білок.</b> 0,18 г білка на lb ваги на прийом, щонайменше 4 прийоми (огляд Schoenfeld і Aragon, 2018). У день тренування — прийом з білком до й після.', '<b>Plate and protein.</b> 0.18 g of protein per lb of body weight per meal, at least 4 meals (Schoenfeld and Aragon, 2018). On training days — a protein-rich meal before and after.') : LL('<b>Тарілка й білок.</b> 0,4 г білка на кг на прийом, щонайменше 4 прийоми (огляд Schoenfeld і Aragon, 2018). У день тренування — прийом з білком до й після.', '<b>Plate and protein.</b> 0.4 g of protein per kg per meal, at least 4 meals (Schoenfeld and Aragon, 2018). On training days — a protein-rich meal before and after.'))}</p>
      <p class="small">${LL('<b>Вода.</b> Ваш план — у «Налаштуваннях кухні»: скільки пити на день, перша й остання склянка (за замовчуванням — норма програми: чоловікам 2,5 л, жінкам 2 л); у день тренування застосунок додає 0,5 л. Перша склянка — після сну. Температура — як приємніше: досліджень, що гаряча вода прискорює обмін, немає.', '<b>Water.</b> Your plan is in “Kitchen settings”: how much to drink a day, your first and last glass (by default, the program target: 2.5 L for men, 2 L for women); on training days the app adds 0.5 L. The first glass is after you wake up. Temperature is up to you: there’s no research showing hot water speeds up your metabolism.')}</p>${kHeartNote()}
      ${(N.food.notes || []).length ? `<p class="small"><b>${LL('Поради програми', 'Program tips')}</b></p>${N.food.notes.map((x) => `<p class="small" style="margin:6px 0">• ${esc(x)}</p>`).join('')}` : ''}
      <p class="tiny muted">${LL('Це орієнтир, а не медичний план; при хронічних хворобах узгодьте з лікарем.', 'This is guidance, not a medical plan; if you have a chronic condition, check with your doctor.')}</p>`);
  }
  /* вода: + / − склянка; нагадування — підписка й розклад на сервер (remindSync) */
  function kWater(dir) {
    const d = ui.kDate || kWaterDay(), g = kit().set.glass, tu = dir === 1 && d === kWaterDay() ? kTurn() : null;  // сьогодні — день води (нічна зміна)
    if (dir < 0) { const day = kdayW(d), last = (day.wl || []).pop(); day.water = Math.max(0, (day.water || 0) - (last ? last.ml : g)); }  // до 3.21.1 відміток у журналі не було — склянка
    else kWaterLog(d, dir === 1 ? (tu ? tu.ml : g) : Math.round(g / 2));  // + склянка на черзі (з доганянням) · + пів склянки
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
  /* ---------- залучення (з 3.24.0; слово Alexа 25.10: «Роби в такому порядку: А → Б → В → Г»; план тренувань не змінюють) ---------- */
  /* «новий старт» (пункт 3): початок тижня й місяця — орієнтири, з яких людям легше братися за звичку (Dai, Milkman, Riis 2014, «ефект нового старту») */
  const FS_TXT = () => ({ week: LL('🌱 Новий тиждень — новий старт.', '🌱 New week — fresh start.'), month: LL('🌱 Новий місяць — новий старт.', '🌱 New month — fresh start.'),
    back: LL('🔁 З поверненням! Пропущене не надолужуємо — продовжуємо за планом.', '🔁 Welcome back! No making up for missed workouts — we carry on with the plan.') });
  const FS_TIP = () => LL('Початок тижня й місяця — момент, з якого людям легше братися за звичку (дослідження «ефект нового старту», Dai, Milkman, Riis 2014). Пропущені тренування не надолужуємо: план іде далі.', 'The start of a week or month is a moment when it’s easier to pick up a habit (the “fresh start effect” research, Dai, Milkman, Riis 2014). Missed workouts aren’t made up: the plan simply continues.');
  /* голосом — лише коли фраза вже є в записі голосу (інакше весь привітальний текст пішов би системним голосом) */
  function recOnly(t) { const id = I18N.lang === 'en' ? '' : packId(); return !id || VOICEPACK.has(id, VOICE.split(t)) ? t + ' ' : ''; }
  function freshSay(k) {
    if (!k) return '';
    return recOnly({ week: LL('Новий тиждень — новий старт.', 'New week — fresh start.'), month: LL('Новий місяць — новий старт.', 'New month — fresh start.'), back: LL('З поверненням!', 'Welcome back!') }[k]);
  }
  /* назва тренування в чернетці чи записі — з позначкою «коротка версія» (з 3.25.0) */
  const wTitle = (x) => woTitle(x.workout) + (x.short ? LL(' · коротка версія', ' · short version') : '');
  /* коротка версія (пункт 15; план «якщо — то»: метааналіз 26 досліджень — ефект сильніший, коли план враховує перешкоди) */
  const SHORT_TIP = () => G().workouts.U ? LL('План Б, коли часу мало: кожна група мʼязів сьогоднішнього тренування («верх» чи «низ») — по вправі, 1–2 підходи — ≈ 20 хв без розминки. Другу половину тіла не додаємо: завтра її черга, а тим самим мʼязам потрібно щонайменше 48 год. Тиждень плану йде далі, як після звичайного тренування; вага — з вашої історії. Краще коротке тренування, ніж пропуск.', 'Plan B when you’re short on time: one exercise for each muscle group of today’s workout (upper or lower body), 1–2 sets — about 20 minutes plus warm-up. The other half of the body isn’t added: it’s next in line, and the same muscles need at least 48 hours. The plan moves on as after a regular workout; weights come from your history. A short workout beats skipping.')
    : LL('План Б, коли часу мало: кожна велика група мʼязів — по вправі (з сьогоднішнього тренування й, де бракує, з іншого), 1–2 підходи — ≈ 20 хв без розминки. Тиждень плану йде далі, як після звичайного тренування; вага — з вашої історії. Краще коротке тренування, ніж пропуск.', 'Plan B when you’re short on time: one exercise for each major muscle group (from today’s workout and, where needed, the other one), 1–2 sets — about 20 minutes plus warm-up. The plan moves on as after a regular workout; weights come from your history. A short workout beats skipping.');
  function shortMins() { try { const d = buildDraft(null, 'g', undefined, true); return ENGINE.estimateMins(G(), d.items.filter((x) => !x.skipped)); } catch (e) { return 0; } }
  const RET_TIP = () => LL('Повернення після пропуску — головне в звичці: у найбільшому дослідженні тренувань (61 293 відвідувачі залів, Nature 2021) найкраще спрацювала винагорода саме за повернення після пропущеного тренування. Повернення рахуються у «Віхах».', 'Coming back after a miss is what builds the habit: in the largest workout study (61,293 gym members, Nature 2021), the best-working reward was for returning after a missed workout. Comebacks count toward your milestones.');
  /* запасний тиждень (пункт 2): кожні 4 тижні поспіль з тренуванням — 1 запасний (не більше 1); тиждень без тренувань забирає його, серія не рветься */
  const SPARE_TIP = (si) => LL('Тижні поспіль, коли було хоч одне тренування. 🛡 — запасний тиждень: кожні 4 тижні поспіль дають один (не більше одного); тиждень без тренувань забирає його, і серія не рветься. ', 'Weeks in a row with at least one workout. 🛡 is a spare week: every 4 weeks in a row earn one (one at most); a week without workouts uses it up, and the streak doesn’t break. ')
    + (si && si.spare ? LL('Зараз запасний є.', 'You have a spare week now.') : si && si.run ? LL('Ще ', '') + plural(4 - (si.run % 4), LL('тиждень', 'more week'), LL('тижні', 'more weeks'), LL('тижнів', 'more weeks')) + LL(' поспіль — і буде запасний.', ' in a row — and you’ll have a spare.') : '');
  /* відновлення мʼязів (пункт 1): години від останнього тренування мʼяза (ENGINE.recovery); лише показ — план від цього не змінюється */
  function recHome() {
    const p = P(), prog = G(); if (!p.sessions.length) return '';
    const rec = ENGINE.recovery(prog, p.sessions, Date.now()), rest = Object.keys(rec).filter((m) => rec[m].rest).sort((a, b) => rec[b].left - rec[a].left);
    if (!Object.keys(rec).length) return '';
    const by = {}; rest.forEach((m) => { (by[rec[m].left] = by[rec[m].left] || []).push(mName(m).toLowerCase()); });
    const txt = rest.length ? Object.keys(by).sort((a, b) => b - a).map((h) => LL('ще ≈ ', '≈ ') + h + LL(' год: ', ' h left: ') + by[h].join(', ')).join('; ') + LL('. Решта — готові.', '. The rest are ready.')
      : LL('Усі мʼязи відпочили — від тренувань минуло понад ' + ENGINE.REST_H + ' год.', 'All muscles have rested — over ' + ENGINE.REST_H + ' hours since your workouts.');
    /* з 3.27.3 — лише 3D, завжди відкрите (слово Alexа 25.10: «на головній у блоці "Відновлення мязів" потрібно прибрати мінімалістичну картинку манекена, а 3Д модель
       залишити і щоб була постійно розгорнута без згортання»; «Роби усе крім 2D - воно не потрібне як дубль, зараз у всіх телефони сучасні»): до 3.27.3 — 2D-мапа і 3D за «▾»;
       3D недоступне — лишається список нижче (той самий зміст) */
    return `<div class="card rec"><div class="sp"><b data-tip="${esc(REC_TIP())}">${LL('💪 Відновлення мʼязів', '💪 Muscle recovery')}</b></div>
      ${typeof VIZ === 'undefined' ? '' : `<div class="vz3 vzr"><p class="tiny muted" style="margin:0 0 6px">${LL('Охра — відпочивають (що яскравіше, то свіжіше тренування), решта — готові. Пальцем можна повернути вигляд.', 'Ochre — resting (the brighter, the more recent the workout); the rest are ready. Drag to turn the view.')}</p><div class="vzc"></div></div>`}
      <p class="small" style="margin:6px 0 0">${rest.length ? LL('Відпочивають ', 'Resting, ') : ''}${esc(txt)}</p>
      <p class="tiny muted" style="margin:6px 0 0">${LL('Орієнтир ACSM — щонайменше 48 год між тренуваннями тих самих мʼязів. Лише показ: план не змінюється.', 'ACSM guideline — at least 48 hours between workouts for the same muscles. Display only: your plan doesn’t change.')}</p></div>`;
  }
  const REC_TIP = () => LL('Скільки годин минуло від останнього тренування кожного мʼяза (основний мʼяз вправи — повністю, допоміжний — наполовину). До 48 год — «відпочиває»: ACSM радить щонайменше 48 год між тренуваннями тих самих мʼязів. Це орієнтир, не діагноз: план від цього не змінюється.', 'How many hours have passed since each muscle’s last workout (an exercise’s main muscle fully, a secondary one by half). Under 48 hours — “resting”: ACSM recommends at least 48 hours between workouts for the same muscles. A guideline, not a diagnosis: your plan doesn’t change.');
  function recAttach() {
    if (typeof VIZ === 'undefined' || !VIZ.rec) return;
    const el = app.querySelector('.vzr'); if (!el) { VIZ.rec(null); return; }
    VIZ.rec(el, { rec: ENGINE.recovery(G(), P().sessions, Date.now()), restH: ENGINE.REST_H, esc,
      L: { wait: LL('Завантаження…', 'Loading…'), fail: LL('3D недоступне на цьому пристрої — список нижче показує те саме.', '3D isn’t available on this device — the list below shows the same.') } });
  }
  /* підсумок минулого тижня (пункт 5): щопонеділка на головній — тренування з запланованих, рекорди, хвилини й ккал, дні з нормою води, серія;
     рахується в телефоні (ENGINE.weekSummary, вода — з «Кухні»). Минулого тижня не було ні тренувань, ні відміток води — картки немає */
  function weekHome() {
    const p = P(), prog = G(); if (new Date(today() + 'T12:00:00').getDay() !== 1) return '';
    const w = ENGINE.weekSummary(p, prog, today()), days = [];
    for (let k = 0; k < 7; k++) { const x = new Date(w.week + 'T12:00:00'); x.setDate(x.getDate() + k); days.push(iso(x)); }
    const wd = days.filter((d) => (kday(d).water || 0) > 0), wOk = wd.filter((d) => (kday(d).water || 0) >= kWTarget(d)).length;
    if (!w.n && !wd.length) return '';
    const tiles = [[w.n + ' / ' + w.planned, LL('тренувань', 'workouts')], [w.prs, LL('рекордів', 'PRs')], [w.mins, w.kcal ? LL('хв · ≈ ', 'min · ≈ ') + fmt(w.kcal) + LL(' ккал', ' kcal') : LL('хвилин', 'minutes')]];
    if (wd.length) tiles.push([wOk + ' / 7', LL('днів з нормою води', 'days at your water goal')]);
    const line = w.n >= w.planned ? LL('💪 План тижня виконано.', '💪 You hit your weekly plan.') : w.n ? LL('Новий тиждень — новий старт.', 'New week — fresh start.') : '';
    return `<div class="card wsum" data-tip="${esc(LL('Підсумок минулого тижня — щопонеділка на головній. Рахується в телефоні: тренування з запланованих, рекорди, хвилини (≈ ккал — як у підсумку тренування), дні з нормою води з «Кухні», серія тижнів.', 'Last week’s summary — every Monday on Home. Counted on your phone: workouts out of planned, PRs, minutes (≈ kcal — as in the workout summary), days at your water goal from the Kitchen, and your weekly streak.'))}"><div class="sp"><b>${LL('📊 Минулий тиждень', '📊 Last week')}</b><span class="small muted">${dm(days[0])}–${dm(days[6])}</span></div>
      <div class="${tiles.length === 4 ? 'grid2' : 'grid3'}" style="margin-top:8px">${tiles.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <p class="small" style="margin:8px 0 0">${line ? line + ' ' : ''}${w.streak.run ? LL('Серія — ', 'Streak — ') + plural(w.streak.run, LL('тиждень', 'week'), LL('тижні', 'weeks'), LL('тижнів', 'weeks')) + LL(' поспіль.', ' in a row.') : ''}</p></div>`;
  }
  /* виклик місяця (пункт 4) і подарований старт (пункт 18): ціль — з власної історії (ENGINE.monthChallenge), тренування місяця вже зараховані */
  const monthGen = (ym) => { const x = new Date(ym + '-15T12:00:00'); return LL(x.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, ''), x.toLocaleDateString('en-US', { month: 'long' })); };
  const MC_TIP = () => LL('Виклик місяця — з вашої історії: на одне тренування більше, ніж минулого місяця, але не більше, ніж днів тренувань за планом (першого місяця — половина). Тренування, зроблені цього місяця, уже зараховані. Виконали — віха в «Прогрес» → «Звіт». План від цього не змінюється.', 'The monthly challenge comes from your history: one workout more than last month, but no more than the workout days in your plan (in your first month — half of them). Workouts already done this month count. Done — a milestone in “Progress” → “Report.” Your plan doesn’t change.');
  function mcHome() {
    const p = P(), ym = today().slice(0, 7), mc = p.sessions.length ? ENGINE.monthChallenge(p.sessions, trainDays(), ym) : null; if (!mc) return '';
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1, nd = new Date(y, m + 1, 0).getDate(), td = trainDays();
    let remain = 0; for (let k = Number(today().slice(8, 10)) + (trainedToday() ? 1 : 0); k <= nd; k++) if (td.indexOf(new Date(y, m, k, 12).getDay()) >= 0) remain++;
    const why = !mc.prev ? LL('ціль — половина днів тренувань за планом', 'goal — half of your planned workout days') : mc.prev + 1 > mc.planned ? LL('ціль — усі дні тренувань за планом', 'goal — all of your planned workout days')
      : LL('минулого місяця — ', 'last month — ') + mc.prev + LL(', тепер на одне більше', ', now one more');
    const txt = mc.met ? '<span class="mk">✓</span> ' + LL('Виконано: ', 'Done: ') + mc.done + LL(' з ', ' of ') + mc.target
      : LL('Зроблено ', 'Done ') + mc.done + LL(' з ', ' of ') + mc.target + (mc.left <= remain ? LL(' — ще ', ' — ') + mc.left + LL('', ' to go') : LL(' · днів тренувань до кінця місяця за планом: ', ' · planned workout days left this month: ') + remain);
    return `<div class="card mch${mc.met ? ' met' : ''}" data-tip="${esc(MC_TIP())}"><div class="sp"><b>${LL('🎯 Виклик ', '🎯 ')}${esc(monthGen(ym))}${LL('', ' challenge')}</b><span class="small">${mc.done} / ${mc.target}</span></div>
      <div class="kbar"><i style="width:${Math.min(100, Math.round(mc.done / mc.target * 100))}%"></i></div><p class="small muted" style="margin:6px 0 0">${txt} (${why}).</p></div>`;
  }
  /* у підсумку тренування — поступ виклику (поточний місяць, ще не виконаний: виконаний — це «🏅 Нова віха») */
  function mcSum(s) {
    const p = P(), ym = s.date.slice(0, 7); if (ym !== today().slice(0, 7)) return '';
    const mc = ENGINE.monthChallenge(p.sessions, trainDays(), ym); if (!mc || mc.met) return '';
    return `<p class="small muted" style="text-align:center" data-tip="${esc(MC_TIP())}">${LL('🎯 Виклик ', '🎯 ')}${esc(monthGen(ym))}${LL(': ', ' challenge: ')}${mc.done}${LL(' з ', ' of ')}${mc.target}${LL(' — ще ', ' — ')}${mc.left}${LL('', ' to go')}</p>`;
  }
  /* ранкове питання (пункт 7; «як спали / як почуваєтесь», один дотик) — лише показ: план не змінюється, тренеру не передається (§9 — самопочуття не шлемо) */
  const MOOD = () => [[1, '😴', LL('Погано', 'Poorly')], [2, '😐', LL('Так собі', 'So-so')], [3, '🙂', LL('Добре', 'Good')], [4, '💪', LL('Чудово', 'Great')]];
  const MOOD_TIP = () => LL('Одним дотиком — як спали й почуваєтесь. Лише для вас: відповіді за місяць — у «Прогрес» → «Звіт»; план від цього не змінюється, тренеру не передається.', 'One tap — how you slept and how you feel. Just for you: the month’s answers are in “Progress” → “Report”; your plan doesn’t change, and it isn’t sent to the coach.');
  function moodHome() {
    const p = P(), v = (p.mood || {})[today()];
    if (v) { const m = MOOD().find((x) => x[0] === v) || MOOD()[2]; return `<div class="sp mood1" data-tip="${esc(MOOD_TIP())}"><span class="small muted">${LL('☀️ Сьогодні: ', '☀️ Today: ')}${m[1]} ${esc(m[2].toLowerCase())}</span><button type="button" class="sm ghost" data-act="moodEdit">${LL('Змінити', 'Change')}</button></div>${readyHome(v)}`; }
    return `<div class="card mood" data-tip="${esc(MOOD_TIP())}"><b>${LL('☀️ Як ви сьогодні — сон і самопочуття?', '☀️ How are you today — sleep and how you feel?')}</b>
      <div class="moodb">${MOOD().map(([k, e, l]) => `<button type="button" data-act="mood" data-v="${k}" aria-label="${esc(l)}" data-tip="${esc(e + ' ' + l + '. ' + MOOD_TIP())}"><span>${e}</span></button>`).join('')}</div></div>`;
  }
  function moodMonth(ym) {
    const mo = Object.keys(P().mood || {}).filter((d) => d.slice(0, 7) === ym); if (!mo.length) return '';
    const c = {}; mo.forEach((d) => { const v = P().mood[d]; c[v] = (c[v] || 0) + 1; });
    return `<h2>${LL('☀️ Ранкове самопочуття', '☀️ Morning check-in')}</h2><div class="card" data-tip="${esc(MOOD_TIP())}"><p class="small" style="margin:0">${MOOD().slice().reverse().map(([k, e, l]) => e + ' ' + esc(l.toLowerCase()) + ' — ' + (c[k] || 0)).join(' · ')}</p>
      <p class="tiny muted" style="margin:6px 0 0">${LL('Днів з відповіддю: ', 'Days answered: ')}${mo.length}. ${LL('Лише показ: план від цього не змінюється.', 'Display only: your plan doesn’t change.')}</p></div>`;
  }
  /* оцінка готовності (пункт 8, з 3.26.0; слово Alexа 25.10: «Роби в такому порядку: А → Б → В → Г»; лише показ — план не змінюється, тренеру не передається):
     у день тренування, коли вже відповіли на ранкове питання, — самопочуття (зі слів людини) і чи відпочили основні мʼязи наступного тренування
     (ENGINE.recovery — як картка «Відновлення мʼязів»; 48 год — ACSM 2011, Garber та ін.). Числа «готовності» не рахуємо: у самооцінок готовності
     немає доказів точності (огляд 11 досліджень, IJES 2024). Погано / так собі — «Коротка версія» (ВООЗ 2020: трохи руху — краще, ніж нічого)
     і правило застуди (Mayo Clinic: з температурою, втомою й ломотою в тілі, кашлем з грудей — не тренуватися; лише нежить — можна, легше);
     три дні поспіль погано чи так собі — сон (AASM / SRS 2015: дорослим 7 год і більше щоночі) */
  const READY_TIP = () => LL('Оцінка на сьогодні — з вашої ранкової відповіді й годин відпочинку мʼязів наступного тренування (як на картці «Відновлення мʼязів»: до 48 год — відпочивають, орієнтир ACSM). Числа «готовності» застосунок не рахує: у самооцінок готовності немає доказів точності (огляд досліджень 2024). Порада при застуді — Mayo Clinic; «трохи руху краще, ніж нічого» — ВООЗ 2020; сон 7 год і більше — AASM. Лише показ: план не змінюється, тренеру не передається.', 'Today’s check — from your morning answer and how long the next workout’s muscles have rested (as on the “Muscle recovery” card: under 48 hours — resting, ACSM guideline). The app doesn’t compute a “readiness” number: self-rated readiness has no evidence of accuracy (2024 research review). The cold tip is from Mayo Clinic; “some activity is better than none” — WHO 2020; 7+ hours of sleep — AASM. Display only: your plan doesn’t change, and it isn’t shared with the coach.');
  function readyHome(v) {
    const p = P(), prog = G(), t = today(), out = [], m = MOOD().find((x) => x[0] === v) || MOOD()[2];
    const md = (d) => (p.mood || {})[iso(new Date(tms(t) - d * 864e5))] || 0;
    const plan = ENGINE.planFor(prog, nextN()), W = (prog.place === 'gym' && prog.gymWorkouts ? prog.gymWorkouts : prog.workouts)[plan.workout];
    if (W && !p.draft && !p.sessions.some((s) => s.date === t) && trainDays().indexOf(new Date(t + 'T12:00:00').getDay()) >= 0) {
      const rec = ENGINE.recovery(prog, p.sessions, Date.now()), mus = [];
      W.items.forEach((it) => (((prog.ex[it.ex] || {}).m || {}).p || []).forEach((x) => { if (mus.indexOf(x) < 0) mus.push(x); }));
      const rest = mus.filter((x) => rec[x] && rec[x].rest), left = rest.reduce((a, x) => Math.max(a, rec[x].left), 0);
      out.push(`<p class="small" style="margin:0"><b>${LL('Готовність до тренування', 'Workout readiness')}</b> — ${m[1]} ${esc(LL('самопочуття ', 'feeling ') + { 1: LL('погане', 'poorly'), 2: LL('так собі', 'so-so'), 3: LL('добре', 'good'), 4: LL('чудове', 'great') }[m[0]] + '; ' + (rest.length ? LL('ще відпочивають (до ≈ ', 'still resting (up to ≈ ') + left + LL(' год): ', ' h): ') + rest.map((x) => mName(x).toLowerCase()).join(', ') + LL('. План від цього не змінюється', '. Your plan doesn’t change') : LL('мʼязи цього тренування відпочили', 'this workout’s muscles have rested')))}.</p>`);
      if (v <= 2) {
        const sm = shortMins();
        out.push(`<p class="small" style="margin:6px 0 0">${esc((sm ? LL('Сил мало — можна коротку версію (≈ ' + sm + ' хв + розминка): трохи руху — краще, ніж нічого. ', 'Low on energy — you can do the short version (≈ ' + sm + ' min + warm-up): some activity is better than none. ') : '')
          + LL('Застуда з температурою, ломотою в тілі чи кашлем з грудей — сьогодні відпочинок; лише нежить — можна, легше.', 'A cold with fever, body aches or a chest cough — rest today; just a runny nose — fine, go lighter.'))}</p>${sm ? `<button type="button" class="sm" style="margin-top:8px" data-act="startShort" data-tip="${esc(SHORT_TIP())}">${LL('⏱ Коротка версія', '⏱ Short version')}</button>` : ''}`);
      }
    }
    if (v <= 2 && md(1) && md(1) <= 2 && md(2) && md(2) <= 2) out.push(`<p class="small" style="margin:${out.length ? '6px' : '0'} 0 0">${esc(LL('Третій день поспіль «погано» чи «так собі»: дорослим — щонайменше 7 год сну щоночі; якщо так триває — варто показатися лікарю.', 'Third day in a row “poorly” or “so-so”: adults need at least 7 hours of sleep a night; if it keeps up, see a doctor.'))}</p>`);
    return out.length ? `<div class="card rdy" data-tip="${esc(READY_TIP())}">${out.join('')}</div>` : '';
  }

  /* урок дня (пункт 21; як у Noom — доказ слабкий, тож лише показ): одна порада з «Порадника» вашої програми або термін зі словника, щодня інша, по колу;
     тексти — ті самі, що вже в застосунку; «✓ Прочитано» ховає урок до завтра */
  function lessons() {
    const out = [];
    (G().guide || []).forEach((g) => g.items.forEach((x) => { if (typeof x === 'string' && x && x.charAt(0) !== '#' && x.charAt(0) !== '@') out.push({ t: g.title, x, id: g.id }); }));
    Object.keys(GLOSSARY).forEach((k) => out.push({ t: GL(k)[0], x: GL(k)[1] }));
    return out;
  }
  function lessonHome() {
    const p = P(), t = today(); if (p.lessonSeen === t) return '';
    const L = lessons(); if (!L.length) return '';
    const it = L[Math.floor(tms(t) / 864e5) % L.length];
    return `<div class="card lesson" data-tip="${esc(LL('Урок дня — одна порада з «Порадника» вашої програми або термін зі словника, щодня інша. «Прочитано» — сховати до завтра.', 'Today’s lesson — one tip from your program’s guide or a glossary term, different every day. “Read” hides it until tomorrow.'))}"><div class="sp"><b>${LL('📖 Урок дня', '📖 Today’s lesson')}</b><span class="small muted">${esc(it.t)}</span></div>
      <p class="small" style="margin:6px 0 8px">${esc(it.x)}</p><div class="row" style="gap:8px">${it.id ? `<button type="button" class="sm ghost" data-act="guide" data-id="${it.id}">${LL('Увесь розділ', 'Whole section')}</button>` : ''}<button type="button" class="sm" data-act="lessonOk">${LL('✓ Прочитано', '✓ Read')}</button></div></div>`;
  }
  /* підсумок року (пункт 20; як Spotify Wrapped): на головній — у грудні й до 15 січня (тоді — минулий рік); у «Прогрес» → «Звіт» — завжди */
  const yearOfHome = () => { const t = today(), m = Number(t.slice(5, 7)), d = Number(t.slice(8, 10)); return m === 12 ? t.slice(0, 4) : m === 1 && d <= 15 ? String(Number(t.slice(0, 4)) - 1) : null; };
  const YR_TIP = () => LL('Підсумок року — усе з вашої історії в телефоні: тренування, години, рекорди, найдовша серія, улюблена вправа, приріст, мʼязи, повернення, виклики місяця, самопочуття й вода. Можна поділитися картинкою.', 'Your year in review — all from the history on your phone: workouts, hours, PRs, longest streak, favorite exercise, gains, muscles, comebacks, monthly challenges, check-ins, and water. You can share it as an image.');
  function yearHome() {
    const y = yearOfHome(); if (!y || !P().sessions.some((s) => s.date.slice(0, 4) === y)) return '';
    return `<div class="card yr" data-tip="${esc(YR_TIP())}"><div class="sp"><b>${LL('🎁 Ваш ', '🎁 Your ')}${y}${LL(' рік у тренуваннях', ' in workouts')}</b><button type="button" class="sm pri" data-act="year" data-v="${y}">${LL('Відкрити', 'Open')}</button></div></div>`;
  }
  /* дані року: рушій (ENGINE.yearSummary) + виклики місяця з віх, ранкове самопочуття й вода з «Кухні» (норма — як у підсумку тижня, за сьогоднішніми даними) */
  function yearData(y) {
    const p = P(), r = ENGINE.yearSummary(p, G(), y, p.handle); if (!r) return null;
    const mo = Object.keys(p.mood || {}).filter((d) => d.slice(0, 4) === y), mc = {}; mo.forEach((d) => { mc[p.mood[d]] = (mc[p.mood[d]] || 0) + 1; });
    const k = kit(), wd = Object.keys(k.days || {}).filter((d) => d.slice(0, 4) === y && (k.days[d].water || 0) > 0);
    return Object.assign(r, { mcMet: ENGINE.milestones(msOpts()).got.filter((g) => g.k === 'mc' && String(g.v).slice(0, 4) === y).length,
      mood: mo.length ? mc : null, waterDays: wd.length ? wd.filter((d) => k.days[d].water >= kWTarget(d)).length : null });
  }
  function yearRows(r) {
    const prog = G(), nm = (id) => (prog.ex[id] || { name: id }).name, rows = [];
    rows.push(['🔥', LL('Найдовша серія', 'Longest streak'), plural(r.bestRun, LL('тиждень', 'week'), LL('тижні', 'weeks'), LL('тижнів', 'weeks')) + LL(' поспіль', ' in a row')]);
    rows.push(['📅', LL('Тижнів з тренуванням', 'Weeks with a workout'), r.weeks + LL(' · місяців — ', ' · months — ') + r.months]);
    if (r.top.length) rows.push(['🏋️', LL('Найчастіша вправа', 'Most-done exercise'), nm(r.top[0].id) + ' — ' + plural(r.top[0].sets, LL('підхід', 'set'), LL('підходи', 'sets'), LL('підходів', 'sets'))]);
    if (r.gains.length) rows.push(['📈', LL('Найбільший приріст', 'Biggest gain'), nm(r.gains[0].id) + ' +' + r.gains[0].pct + ' %']);
    if (r.muscles.length) rows.push(['💪', LL('Найбільше працювали', 'Most-trained muscles'), r.muscles.map((m) => mName(m[0]).toLowerCase()).join(', ')]);
    if (r.rets) rows.push(['🔁', LL('Повернень після пропуску', 'Comebacks after a miss'), String(r.rets)]);
    if (r.mcMet) rows.push(['🎯', LL('Викликів місяця виконано', 'Monthly challenges done'), String(r.mcMet)]);
    if (r.mood) rows.push(['☀️', LL('Ранкове самопочуття', 'Morning check-in'), MOOD().slice().reverse().map(([k2, e]) => e + ' ' + (r.mood[k2] || 0)).join(' · ')]);
    if (r.waterDays !== null) rows.push(['💧', LL('Днів з нормою води', 'Days at your water goal'), String(r.waterDays)]);
    return rows;
  }
  const yearTiles = (r) => [[String(r.sessions), LL('тренувань', 'workouts')], [fmt(Math.round(r.mins / 6) / 10), LL('годин', 'hours')], [String(r.prs), LL('рекордів', 'PRs')], [r.kcal ? '≈ ' + fmt(r.kcal) : '—', LL('ккал за тренування', 'kcal from workouts')]];
  function yearSheet(y) {
    const r = yearData(y); if (!r) return;
    openSheet(`<div class="sp"><b>${LL('🎁 Ваш ', '🎁 Your ')}${y}${LL(' рік у тренуваннях', ' in workouts')}</b><button type="button" class="sm ghost" data-act="closeSheet">${LL('Закрити', 'Close')}</button></div>
      <div class="grid2" style="margin-top:10px">${yearTiles(r).map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <ul class="list" style="margin-top:10px">${yearRows(r).map(([e, l, v]) => `<li><span>${e} ${l}</span><b style="text-align:right">${esc(v)}</b></li>`).join('')}</ul>
      <p class="tiny muted">${LL('Усе — з вашої історії в телефоні. Ккал — оцінка (3,5 MET, як у підсумку тренування); приріст — найкраще до цього року (почали цього року — за перший місяць) проти найкращого в році.', 'All from the history on your phone. Kcal is an estimate (3.5 MET, as in the workout summary); gains compare your best before this year (or in your first month, if you started this year) with your best this year.')}</p>
      <button type="button" class="wide pri" data-act="yearShare" data-v="${y}">${LL('Поділитися картинкою', 'Share as an image')}</button>`);
  }
  /* картинка року — як «Поділитися підсумком» тренування: 1080 × 1350, кольори бренду */
  function yearShare(y) {
    const r = yearData(y); if (!r) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    const F = (w, px) => w + ' ' + px + 'px Manrope, -apple-system, Arial';
    g.fillStyle = '#14514f'; g.fillRect(0, 0, 1080, 1350); g.fillStyle = '#c8a96a'; g.fillRect(80, 200, 140, 6);
    g.fillStyle = '#fff'; g.font = F(700, 64); g.fillText(LL('Мій ', 'My ') + y + LL(' рік', ' in workouts'), 80, 170);
    yearTiles(r).forEach((x, k) => {
      const X = 80 + (k % 2) * 480, Y = 260 + Math.floor(k / 2) * 240;
      g.fillStyle = '#0d3937'; g.fillRect(X, Y, 440, 200); g.fillStyle = '#1c4b49'; g.fillRect(X, Y, 6, 200);
      g.fillStyle = '#fff'; g.font = F(700, 84); g.fillText(x[0], X + 36, Y + 110); g.fillStyle = '#e8f0ef'; g.font = F(400, 34); g.fillText(x[1], X + 36, Y + 165);
    });
    g.fillStyle = '#fff'; g.font = F(500, 38); let yy = 800;
    yearRows(r).slice(0, 6).forEach(([e, l, v]) => { let t2 = e + ' ' + l + ': ' + v; while (g.measureText(t2).width > 920 && t2.length > 8) t2 = t2.slice(0, -2) + '…'; g.fillText(t2, 80, yy); yy += 66; });
    window.BRAND_DRAW(g, 80, 1280, 23, '#ffffff', '#c8a96a');  // знак і назва FORTES (з 3.27.2)
    c.toBlob((b) => { if (b) shareFile('trenuvannia-' + y + '.png', b, 'image/png'); }, 'image/png');
  }
  /* радіо лише на тренуванні (пункт 16; «звʼязка спокуси»: Milkman, Minson, Volpp 2014, 226 людей — аудіокниги лише в залі спершу +51 % відвідувань, далі ефект слабшав) */
  function radioOnlyHtml() {
    const R = S().radio;
    return `<label class="f">${LL('Коли грає радіо', 'When the radio plays')}</label><div class="seg">${[[0, LL('Будь-коли', 'Any time')], [1, LL('Лише на тренуванні', 'Only during workouts')]].map(([v, l]) => `<button type="button" class="${(R.only ? 1 : 0) === v ? 'on' : ''}" data-act="ronly" data-v="${v}" data-tip="${esc(v ? LL('Радіо — лише на тренуванні: обрана станція заграє сама на старті тренування й вимкнеться після нього.', 'Radio only during workouts: your station starts by itself when a workout starts and stops after it.') : LL('Радіо можна вмикати будь-коли, як раніше.', 'You can play the radio any time, as before.'))}">${l}</button>`).join('')}</div>
      <p class="tiny muted">${LL('«Лише на тренуванні» — улюблене як нагорода за тренування («звʼязка спокуси»: у дослідженні 226 людей аудіокниги лише в залі спершу дали +51 % відвідувань, далі ефект слабшав — Milkman, Minson, Volpp 2014). Обрана станція заграє сама, щойно почнете тренування, і вимкнеться, коли завершите.', '“Only during workouts” makes your favorite a reward for training (“temptation bundling”: in a study of 226 people, audiobooks available only at the gym first raised visits by 51%, then the effect faded — Milkman, Minson, Volpp 2014). Your station starts by itself when you start a workout and stops when you finish.')}${R.only && !(P() && P().draft) ? LL(' Зараз тренування немає — станція заграє на тренуванні.', ' No workout right now — the station will play during your workout.') : ''}</p>`;
  }
  /* віхи (з 3.21.5; слово Alexа 24.10, пункт 3) — рахує ENGINE.milestones з історії; вага й талія — в одиницях профілю,
     напрям — за метою харчування програми (менше жиру й рекомпозиція — вниз, набір — вгору) */
  const msOpts = () => { const p = P(); return { sessions: p.sessions, weight: p.body.weight || [], waist: p.body.waist || [], goal: (G().food || {}).goal, lb: isLb(), today: today(), days: trainDays() }; };  // days — з 3.24.0 (виклик місяця)
  const msGot = () => ENGINE.milestones(msOpts()).got;
  function msText(g) {
    if (g.k === 'n') return plural(g.v, LL('тренування', 'workout'), LL('тренування', 'workouts'), LL('тренувань', 'workouts'));
    if (g.k === 'st') return plural(g.v, LL('тиждень', 'week'), LL('тижні', 'weeks'), LL('тижнів', 'weeks')) + LL(' поспіль з тренуваннями', ' in a row with workouts');
    if (g.k === 'pr') return plural(g.v, LL('рекорд', 'PR'), LL('рекорди', 'PRs'), LL('рекордів', 'PRs'));
    /* з 3.24.0 (слово Alexа 25.10: «Роби в такому порядку: А → Б → В → Г»): повернення після пропуску (пункт 14) і виконаний виклик місяця (пункт 4) */
    if (g.k === 'ret') return plural(g.v, LL('повернення', 'comeback'), LL('повернення', 'comebacks'), LL('повернень', 'comebacks')) + LL(' після пропуску', ' after a missed workout');
    if (g.k === 'mc') return LL('Виклик місяця виконано — ', 'Monthly challenge done — ') + new Date(g.v + '-15T12:00:00').toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' });
    if (g.k === 'w') return LL('Вага ', 'Weight ') + sgn1(g.v) + ' ' + MU('weight') + LL(' від першого зважування (за середньою)', ' since the first weigh-in (by the average)');
    return LL('Талія ', 'Waist ') + sgn1(g.v) + ' ' + MU('waist') + LL(' від першого заміру', ' since the first measurement');
  }
  function msLeft(x) {
    if (x.k === 'w' || x.k === 'c') return LL('ще ', '') + fmt(x.left) + ' ' + MU(x.k === 'w' ? 'weight' : 'waist') + LL('', ' to go');
    return LL('ще ', '') + x.left + LL('', ' to go');  // одиниця — уже в назві віхи
  }
  /* нові віхи цього тренування: з ним проти без нього (тренування того самого дня до нього — уже в «без») */
  function msNew(s) {
    const all = P().sessions.filter((x) => x.date < s.date || (x.date === s.date && x.id <= s.id)), o = msOpts();
    const a = ENGINE.milestones(Object.assign({}, o, { sessions: all })).got, b = ENGINE.milestones(Object.assign({}, o, { sessions: all.filter((x) => x.id !== s.id) })).got;
    return a.filter((g) => (g.k === 'n' || g.k === 'st' || g.k === 'pr' || g.k === 'ret' || g.k === 'mc') && !b.some((h) => h.k === g.k && h.v === g.v));
  }
  function msHtml() {
    const m = ENGINE.milestones(msOpts()), got = m.got.slice(0, 8);
    return `<h2>${LL('🏅 Віхи', '🏅 Milestones')}</h2><div class="card">${got.length ? `<ul class="list">${got.map((g) => `<li><span>${esc(msText(g))}</span><span class="small muted">${dm(g.d)}</span></li>`).join('')}</ul>` : `<p class="small muted" style="margin:0">${LL('Віх ще немає — перша близько.', 'No milestones yet — the first one is close.')}</p>`}${m.next.length ? `<p class="small" style="margin:8px 0 0"><b>${LL('Далі:', 'Next:')}</b> ${m.next.map((x) => esc(msText(x)) + ' — ' + esc(msLeft(x))).join(' · ')}</p>` : ''}<p class="tiny muted" style="margin:6px 0 0">${LL('За весь час. Вага — за середньою за 7 днів, крок ', 'All time. Weight — by the 7-day average, in steps of ') + (isLb() ? '5 lb' : LL('2 кг', '2 kg')) + LL('; талія — крок ', '; waist — in steps of ') + (isLb() ? '1 in' : LL('2 см', '2 cm')) + LL('; напрям — за метою харчування.', '; direction — by your nutrition goal.')}</p></div>`;
  }
  /* порада за темпом ваги (з 3.21.5 — одна для «Кухні» й тренера, щоб тренер не рахував сам): межа безпеки — як для підтримки;
     калорії вже на нижній межі — не «їжте менше»; темпу ще немає (менше 2 тижнів зважувань) — null */
  function kAdvice(N) {
    if (!(N && N.tr && N.tr.rate !== null)) return null;
    const g = N.nu && N.nu.guard;
    let adv = ENGINE.foodAdvice(g === 'under' || g === 'floor0' ? Object.assign({}, N.food, { goal: 'maintain' }) : N.food, N.tr);  // межа безпеки — порада як для підтримки
    if (g === 'floor' && adv.k === 'less') adv = { k: 'w', text: LL('Калорії вже на межі без нагляду лікаря — не зменшуйте їжу: додайте кроки й рух.', 'Your calories are already at the limit without a doctor’s supervision — don’t eat less: add steps and activity.') };
    return adv;
  }
  /* для тренера: вага, темп і талія (з 3.21.5; слово Alexа 24.10 на питання «що з пункту 1 передавати тренеру»: «Усе з числами»;
     до 3.21.5 тіла в зрізі не було — §9) — ті самі числа, що в «Замірах» і на «Прогресі → Тіло», в одиницях профілю; вага щодня
     коливається, тож висновки — лише з середньої за 7 днів і темпу (тренер їх не рахує сам); порада — та сама, що на «Кухні» */
  function bodyCtx() {
    try {
      const p = P(), uw = MU('weight'), uc = MU('waist'), by = (a, b) => (a.d < b.d ? -1 : 1);
      const w = (p.body.weight || []).slice().sort(by), c = (p.body.waist || []).slice().sort(by), out = [];
      if (w.length) {
        const last = w[w.length - 1], first = w[0], avg = ENGINE.rolling7(w), tr = ENGINE.weightTrend(w), adv = kAdvice(kNorm());
        out.push(LL('Тіло — вага (людина зважується в «Тіло → Заміри»; вага щодня коливається через воду й їжу — висновки лише з середньої за 7 днів і темпу, сам їх не рахуй; чи йде жир і чи ростуть мʼязи, застосунок не знає — він бачить лише вагу й талію, тож про жир і мʼязи не стверджуй): ', 'Body — weight (the person weighs in under Body → Measurements; weight swings daily with water and food — draw conclusions only from the 7-day average and the rate, don’t calculate them yourself; the app doesn’t know whether fat is going or muscle is growing — it only sees weight and waist, so make no claims about fat or muscle): ') +
          LL('останнє зважування ', 'last weigh-in ') + fmt(MV('weight', last.v)) + ' ' + uw + ' (' + dm(last.d) + (last.src === 'q' ? LL(', з анкети', ', from the questionnaire') : '') + ')' +
          (w.length > 1 ? LL('; середня за 7 днів ', '; 7-day average ') + fmt(MV('weight', avg[avg.length - 1].v)) + ' ' + uw : '') +
          (tr && tr.rate !== null ? LL('; темп ', '; rate ') + sgn1(BW(tr.rate)) + ' ' + uw + LL(' на тиждень (за ', ' per week (over ') + tr.days + LL(' дн.)', ' days)') : LL('; темпу ще немає (потрібні зважування за 2 тижні) — про темп висновків не роби', '; no rate yet (needs 2 weeks of weigh-ins) — don’t draw conclusions about the rate')) +
          (w.length > 1 ? LL('; від першого зважування (', '; since the first weigh-in (') + dm(first.d) + ') ' + sgn1(MV('weight', last.v) - MV('weight', first.v)) + ' ' + uw : LL('; інших зважувань немає', '; no other weigh-ins')) +
          (adv ? LL('; порада застосунку за темпом: «', '; the app’s tip from the rate: “') + LBT(adv.text).replace(/\.$/, '') + LL('»', '”') : '') + '.');
      } else out.push(LL('Тіло — вага: зважувань немає; про вагу висновків не роби.', 'Body — weight: no weigh-ins; don’t draw conclusions about weight.'));
      if (c.length) {
        const last = c[c.length - 1], first = c[0];
        out.push(LL('Тіло — талія: ', 'Body — waist: ') + fmt(MV('waist', last.v)) + ' ' + uc + ' (' + dm(last.d) + ')' + (c.length > 1 ? LL('; від першого заміру (', '; since the first measurement (') + dm(first.d) + ') ' + sgn1(MV('waist', last.v) - MV('waist', first.v)) + ' ' + uc : '') + '.');
      } else out.push(LL('Тіло — талія: не міряли.', 'Body — waist: not measured.'));
      return out.join('\n');
    } catch (e) { return ''; }
  }
  /* для тренера: що з'їдено сьогодні й норма (числа — з бази й записів людини) */
  function kitchenCtx() {
    try {
      const N = kNorm(), day = kday(today()), sx = ksex(), t = KITCHEN.dayTotals(day, sx, kctx());
      const out = [];
      /* без записів — не «0 ккал» (з 3.20.2, питання Alexа 23.10: «якщо у вкладці кухня нічого не фіксувати — це якось впливає…»):
         «Кухню» ведуть не всі, і тренер не має казати «ти сьогодні не їв» чи «не пив» */
      const wml = kday(kWaterDay()).water || 0;
      out.push((day.items.length ? LL('Кухня сьогодні: ', 'Kitchen today: ') + t.kcal + LL(' ккал, білок ', ' kcal, protein ') + fmt(t.p) + LL(' г, жири ', ' g, fat ') + fmt(t.f) + LL(' г, вуглеводи ', ' g, carbs ') + fmt(t.c) + LL(' г', ' g')
          : LL('Кухня сьогодні: записів їжі немає — людина може не вести «Кухню»; не роби висновків, що вона не їла чи скільки зʼїла', 'Kitchen today: no food logged — the person may not use the Kitchen; don’t conclude that they haven’t eaten or how much they ate')) +
        (N.nu ? LL('; норма: ', '; targets: ') + N.nu.kLo + '–' + N.nu.kHi + LL(' ккал, білок ', ' kcal, protein ') + N.nu.pLo + '–' + N.nu.pHi + LL(' г', ' g') : LL('; норму ще не налаштовано', '; targets not set up yet')) +
        (wml ? LL('; вода: ', '; water: ') + wml + LL(' мл з ', ' ml of ') + kWTarget(kWaterDay()) + LL(' мл.', ' ml.')
          : LL('; воду не відмічено — не роби висновків, скільки людина випила (норма ', '; no water logged — don’t conclude how much they drank (target ') + kWTarget(kWaterDay()) + LL(' мл).', ' ml).')));
      /* план води (з 3.21.1, слово Alexа 23.10: «передай тренеру план води (літри, склянки, перша й остання)»): ті самі числа, що на «Кухні»
         й головній — тренер їх не рахує (жива перевірка 23.10: рахував сам і помилився); у день тренування — уже з +0,5 л; прийоми дня й
         прийом на черзі — як у нагадуваннях; воду не відмічено — лише розклад, без «пропущено» й «доганяємо» (не висновок, що людина не пила) */
      const wd = kWaterDay(), wt = kWTarget(wd), ks = kit().set, wr = kWRec(), wb = KITCHEN.waterTarget(sx, false, ks.vol, wr), wg = kGlasses(wt, wml, ks.glass), tt = kWaterTimes(wd);
      const base = KITCHEN.waterDayPlan(tt, wt, ks.glass, 0, '', tt[0].t, ks.per), dp = kDayPlan(), tu = dp && dp.turn;
      out.push(LL('Кухня сьогодні — план води (людина задає його в «Кухня» → «Налаштування кухні»): ', 'Kitchen today — water plan (the person sets it in Kitchen → “Kitchen settings”): ') + fmt(wt / 1000) + LL(' л на сьогодні', ' L for today') +
        (ks.vol ? LL(' (свій обʼєм ', ' (their own amount ') : wr ? LL(' (особиста норма — рівняння Yamada 2022 за вагою, статтю й віком: ', ' (personal target — Yamada 2022 equation from weight, sex and age: ') : LL(' (норма програми ', ' (program norm ')) + fmt(wb / 1000) + LL(' л на день', ' L a day') + (wt > wb ? LL(' + ', ' + ') + fmt((wt - wb) / 1000) + LL(' л, бо сьогодні день тренування', ' L because today is a training day') : '') + ')' +
        LL('; склянка ', '; glass ') + ks.glass + LL(' мл, за раз — до ', ' ml, at a time — up to ') + kGlW(ks.per) + LL(' (вибір людини; після кожної відмітки застосунок сам перераховує час і обʼєм решти прийомів); ', ' (their choice; after each logged drink the app recalculates the time and amount of the remaining drinks); ') + plural(base.items.length, LL('прийом', 'drink'), LL('прийоми', 'drinks'), LL('прийомів', 'drinks')) + ': ' + kPlanTxt(base.items) + (kWaterCross() ? LL(' (через північ)', ' (past midnight)') : '') +
        (wml ? '; ' + (wml < wt ? LL('випито ', 'drank ') + kGlW(Math.min(wg.done, wg.n)) + LL(', залишилось ', ', ') + kGlW(wg.left) + LL(' (', ' left (') + fmt(Math.max(0, wt - wml) / 1000) + LL(' л)', ' L)') +
          (dp ? LL('; з урахуванням випитого: ', '; adjusted for what they drank: ') + kPlanTxt(dp.items) : '') : LL('норму води на сьогодні виконано', 'today’s water goal is done')) : '') +
        (tu && (wml || !tu.up) ? '; ' + kTurnTxt(tu, false).replace(/^./, (x) => x.toLowerCase()) : '') + '.');
      { const m = KITCHEN.dayMicros(day, sx, kctx()), nm = KITCHEN.microNorm(sx, (N.me || {}).age), NM = MI_NAMES();  // з 3.21.6 — вітаміни й мінерали
        if (m.n && m.n > m.none) out.push(LL('Кухня сьогодні — вітаміни й мінерали (лише з продуктів бази й рецептів з них; ', 'Kitchen today — vitamins and minerals (only from foods in the database and recipes made of them; ') + (m.none ? plural(m.none, LL('запис', 'entry'), LL('записи', 'entries'), LL('записів', 'entries')) + LL(' без даних — фактично більше', ' without data — the real amount is higher') : LL('усі записи з даними', 'all entries have data')) + LL('; норма NIH за статтю й віком): ', '; NIH targets for sex and age): ') + KITCHEN.MI_KEYS.map((k) => NM[k][2] + ' ' + fmt(m[k]) + LL(' з ', ' of ') + nm[k] + NM[k][1]).join(', ') + '.'); }
      { const b = kBurn(N); if (b) out.push(LL('Справжні витрати з журналу «Кухні» й ваги (оцінка застосунку, норму він не змінює): ≈ ', 'Real expenditure from the Kitchen log and weight (the app’s estimate; it doesn’t change the targets): ≈ ') + b.kcal + LL(' ккал на день за ', ' kcal a day over ') + b.span + LL(' днів', ' days') + (N.nu ? LL('; за формулою — ', '; by the formula — ') + N.nu.tdee : '') + '.'); }  // з 3.21.6
      if (N.nu && N.nu.guard) out.push(kGuardTxt(N.nu));  // межа безпеки норми — тренер не радитиме їсти менше
      if (kHeart()) out.push(LL('Тиск або серце: скільки пити — узгодити з лікарем.', 'Blood pressure or heart condition: how much to drink — check with the doctor.'));
      day.items.slice(-12).forEach((e) => { const m = KITCHEN.macros(e, sx, kctx()); if (m) out.push('- ' + kName(e) + (kAmount(e) ? ' (' + kAmount(e) + ')' : '') + ': ' + m.kcal + LL(' ккал, білок ', ' kcal, protein ') + fmt(m.p) + LL(' г [', ' g [') + KQ()[m.q] + ']'); });
      return out.join('\n');
    } catch (e) { return ''; }
  }

  /* ряд заміру (з 3.21.4 — спільний для «Тіло → Заміри» й «Прогрес → Тіло»): у одиницях профілю; вага — кожне зважування й середня
     за 7 днів (середня — по всіх зважуваннях, потім обрізка за проміжком); cut — мс, з якого показувати (0 — усе) */
  function bodySeries(k, cut) {
    const all = (P().body[k] || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1)).map((q) => ({ d: q.d, v: MV(k, q.v), src: q.src })), inR = (q) => !cut || tms(q.d) >= cut;
    const arr = all.filter(inR), avg = k === 'weight' ? ENGINE.rolling7(all).filter(inR) : null;
    const series = k === 'weight' ? [{ pts: arr.map((q) => ({ t: tms(q.d), v: Number(q.v) })), color: 'var(--muted)', width: 1 }, { pts: avg.map((q) => ({ t: tms(q.d), v: q.v })), color: 'var(--accent)', width: 2.5, dots: false, area: true }] : [{ pts: arr.map((q) => ({ t: tms(q.d), v: Number(q.v) })), color: 'var(--accent)', area: true }];
    /* позначки початку циклу (з 3.21.5; слово Alexа 24.10, пункт 9: «лише позначка на графіку ваги») — лише в телефоні */
    const marks = k === 'weight' ? (P().body.cycle || []).filter((d) => inR({ d })).map(tms) : [];
    return { arr, avg, series, marks };
  }
  /* початок циклу (з 3.21.5; слово Alexа 24.10, пункт 9: «так (лише позначка на графіку ваги)»): лише жінкам (стать програми); позначка —
     сьогодні; на графіку ваги — пунктир. Програму не міняємо: фаза циклу помітно не впливає на силу й результати тренувань (огляд
     Colenso-Semple та ін. 2023); набряк найсильніший у перший день (White та ін. 2011, самооцінка) — звідси й стрибки ваги. Дані — лише
     в телефоні: у тренера (bodyCtx) і в таблиці CSV їх немає */
  function cycBox() {
    if (G().sex !== 'f') return '';
    const cy = (P().body.cycle || []).slice().sort(), on = cy.indexOf(today()) >= 0, last = cy[cy.length - 1];
    return `<div class="sp" style="margin-top:8px"><span class="small muted">${LL('Початок циклу', 'Period start')}${last ? LL(' · остання позначка ', ' · last mark ') + dm(last) : ''}</span><button type="button" class="sm ghost" data-act="${on ? 'cycDel' : 'cycMark'}">${on ? LL('Прибрати сьогоднішню', 'Remove today’s') : LL('Позначити сьогодні', 'Mark today')}</button></div>`;
  }
  const cycLegend = (marks) => (marks && marks.length ? `<p class="tiny muted" style="margin:6px 0 0">${LL('Пунктир — початок циклу: у перші дні тіло частіше затримує воду, вага буває вищою; дивіться на середню за 7 днів.', 'Dashed line — period start: in the first days the body often holds water, so weight can be higher; watch the 7-day average.')}</p>` : '');
  /* «Прогрес → Тіло» (з 3.21.4; слово Alexа 24.10: «графік ваги й талії на «Прогресі»»; «обєми тіла потрібно відслідковувати раз на тиждень
     а в Додати на «Прогрес» графік розмірів»): вага — кожне зважування, середня за 7 днів і темп; обʼєми — графік кожного, що вже міряли */
  function progBodyHtml() {
    const p = P(), cut = ui.range === '4' ? Date.now() - 28 * 864e5 : ui.range === '12' ? Date.now() - 84 * 864e5 : 0, none = [];
    const rng = `<span class="seg" style="margin:0;padding:2px">${[['4', LL('4 т', "4 wk")], ['12', LL('12 т', "12 wk")], ['all', LL('усе', "all")]].map(([k, l]) => `<button type="button" class="${ui.range === k ? 'on' : ''}" style="min-height:40px;min-width:44px;padding:4px 10px" data-act="range" data-v="${k}">${l}</button>`).join('')}</span>`;
    const cards = MEAS.map(([k, l]) => {
      const { arr, series, marks } = bodySeries(k, cut), u = MU(k), first = arr[0], last = arr[arr.length - 1];
      if (!(p.body[k] || []).length) { none.push(l.toLowerCase()); return ''; }
      const ch = last && first && last !== first ? Math.round((last.v - first.v) * 10) / 10 : null;
      const tr = k === 'weight' ? ENGINE.weightTrend(p.body.weight || []) : null;
      const sub = !arr.length ? LL('у цьому проміжку записів немає', 'no entries in this range') : fmt(first.v) + (ch !== null ? ' → ' + fmt(last.v) : '') + ' ' + u + (ch !== null ? ' · ' + (ch > 0 ? '+' : ch < 0 ? '−' : '') + fmt(Math.abs(ch)) : '') + ' · ' + dm(last.d);
      const rate = k !== 'weight' ? '' : tr && tr.rate !== null ? LL('Темп за середньою: ', 'Rate by the average: ') + (tr.rate > 0 ? '+' : tr.rate < 0 ? '−' : '') + fmt(BW(Math.abs(tr.rate))) + ' ' + u + LL(' на тиждень.', ' a week.') : LL('Темп — після 2 тижнів зважувань.', 'Rate — after 2 weeks of weigh-ins.');
      return `<div class="card"><div class="sp"><b>${l}</b><span class="small muted">${sub}</span></div>${arr.length >= 2 ? CHARTS.line(series, { h: 130, label: l, marks }) + cycLegend(marks) : `<p class="tiny muted">${LL('Графік — з другого запису.', 'The chart starts from the second entry.')}</p>`}${rate ? `<p class="tiny muted" style="margin:6px 0 0">${rate}</p>` : ''}</div>`;
    }).join('');
    return `<div class="sp" style="margin:6px 0"><span class="tiny muted">${LL('Вага — тонка лінія кожне зважування, товста — середня за 7 днів', 'Weight — thin line is each weigh-in, thick is the 7-day average')}</span>${rng}</div>${cards}
      ${none.length ? `<div class="card"><p class="small" style="margin:0 0 8px">${LL('Ще не міряли: ', 'Not measured yet: ')}${none.join(', ')}. ${LL('Обʼєми — раз на тиждень, в один день і час. Схуднення з набором мʼязів видно саме тут: вага може стояти, а талія — меншати.', 'Measure once a week, on the same day and time. Losing fat while building muscle shows up here: your weight can stay the same while your waist shrinks.')}</p><button type="button" class="sm" data-act="goMeas">${LL('Заміри', 'Measurements')}</button></div>` : ''}`;
  }
  function rBody() {
    const p = P(), prog = G();
    /* «Тести» — першою вкладкою й відкриті за замовчуванням (з 3.27.3; слово Alexа 25.10: «вкладку тести перенеси першою, перед замірами, бо я пропускав декілька
       разів а це важливий тест»); зважитись — і далі одним дотиком: «Заміри» на головній і в «Кухні» відкривають саме «Заміри» */
    const tabs = (prog.tests ? [['t', LL('Тести', "Tests")]] : []).concat([['m', LL('Заміри', "Measurements")], ['f', LL('Фото', "Photos")]]);  // харчування — у «Кухні» (з 3.20.0)
    if (!tabs.some((t) => t[0] === ui.bodyTab)) ui.bodyTab = tabs[0][0];
    let body = '';
    if (ui.bodyTab === 'm') {
      body = `<p class="tiny muted" style="margin:4px 0 8px">${LL('Вага — частіше, хоч щодня зранку: застосунок рахує середню за 7 днів. Обʼєми — раз на тиждень, в один день і час. Графіки — на «Прогресі» → «Тіло».', 'Weight — more often, even daily in the morning: the app uses the 7-day average. Measurements — once a week, on the same day and time. Charts are in Progress → Body.')}</p>` + MEAS.map(([k, l]) => {
        const u = MU(k), { arr, series, marks } = bodySeries(k);  // показ — у одиницях профілю (з 3.21.4 — спільний ряд, bodySeries)
        const last = arr[arr.length - 1], first = arr[0];
        return `<div class="card"><div class="sp"><div><b>${l}</b><div class="small muted">${last ? fmt(last.v) + ' ' + u + ' · ' + dm(last.d) + (last.src === 'q' ? LL(' (з анкети)', ' (from the questionnaire)') : '') + (first && first !== last ? ' · ' + (last.v - first.v >= 0 ? '+' : '') + fmt(Math.round((last.v - first.v) * 10) / 10) + LL(' від першого', " since the first") : '') : LL('ще немає', "none yet")}</div></div><button type="button" class="sm" data-act="measAdd" data-m="${k}${LL(`">+ Додати</button></div>
          `, `">+ Add</button></div>
          `)}${arr.length >= 2 ? CHARTS.line(series, { h: 130, label: l, marks }) + cycLegend(marks) : ''}${k === 'weight' && arr.length ? LL('<p class="tiny muted">Зважуйтесь зранку натщесерце; дивіться на середню за 7 днів (лінія).</p>', "<p class=\"tiny muted\">Weigh yourself in the morning on an empty stomach; watch the 7-day average (the line).</p>") : ''}${k === 'weight' ? cycBox() : ''}</div>`;
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
      const tl = (p.body.tests || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1)), tv = TV();
      /* з 3.27.4 кожен тест — окрема картка (слово Alexа 26.10: «кожен тест + 3Д має бути окремо, бо не усі тести я кожен раз зможу проходити»): назва й останній результат,
         короткий рядок, 3D і що означає число, свої поля й своя кнопка «Зберегти», графік саме цього тесту; до 3.27.4 — «Як виконувати тести» окремо, одна форма на всі й графіки нижче */
      const seg = (k, opts) => `<div class="seg" style="margin:0 0 8px">${opts.map(([v, l]) => `<button type="button" class="${tv[k] === v ? 'on' : ''}" data-act="tVar" data-k="${k}" data-v="${v}" data-tip="${esc(LL('Як робили — так і запишеться: графік порівнює лише той самий варіант.', 'Mark how you did it: the chart compares only the same version.'))}">${l}</button>`).join('')}</div>`;
      const ttip = TEST_TIP(), tu = TEST_U(), inp = (k, u) => `<input inputmode="${k === 'srt' ? 'decimal' : 'numeric'}" id="t_${k}" placeholder="${esc(u)}" aria-label="${esc((TESTS.find((x) => x[0] === k) || [])[1] || '')}"${ttip[k] ? ` data-tip="${esc(ttip[k])}"` : ''}>`;
      /* з 3.27.7 — кожне поле своїм рядком: підпис, поле й плашка норми чи рекорду праворуч (до того — два стовпчики, поля різної висоти «розкидані», норма — лише в 3D) */
      const field = ([k, l, u]) => (k === 'walkS' ? '' : `<div class="tf"><label class="f" for="t_${k}">${l}</label><div class="tfi">${inp(k, u)}${k === 'walkM' ? `<span class="tsep">:</span>${inp('walkS', LL('с', 'sec'))}` : ''}${tChip(k)}</div></div>`);
      /* графіки: віджимання — окремою лінією на кожен варіант; бічна планка — останній варіант (старі записи без позначки — «з ніг», як радив опис до 3.27.3) */
      const pts = (key, f, sel) => tl.filter((t) => t[key] !== null && t[key] !== undefined && t[key] !== '' && (!sel || sel(t))).map((t) => ({ t: tms(t.d), v: f ? f(Number(t[key])) : Number(t[key]) }));
      const LR = LL('<div class="legend"><span><i></i>ліва</span><span><i style="background:var(--d)"></i>права</span></div>', "<div class=\"legend\"><span><i></i>left</span><span><i style=\"background:var(--d)\"></i>right</span></div>");
      const PV = [['t', 'var(--accent)', LL('з носків', 'from the toes')], ['k', 'var(--d)', LL('з колін', 'from the knees')], ['', 'var(--muted)', LL('без позначки', 'not marked')]].filter(([v]) => tl.some((t) => t.push !== null && t.push !== undefined && (t.pushV || '') === v));
      const spv = (tl.filter((t) => t.spV).pop() || {}).spV || 'f', lastW = tl.filter((t) => t.walkT).pop();
      const plot = (name, ser, legend) => (!ser.some((x) => x.pts.length) ? '' : `<div style="margin-top:10px">${CHARTS.line(ser, { h: 110, label: name })}${legend || ''}</div>`);
      const lastOf = (k) => tl.filter((t) => TEST_KEYS[k].some((f) => t[f] !== null && t[f] !== undefined && t[f] !== '')).pop();
      const lastTxt = (k, r) => {
        if (!r) return LL('ще не робили', 'not done yet');
        const v = k === 'walk' ? mmss(r.walkT) + (r.walkHR ? LL(' · пульс ', ' · pulse ') + r.walkHR : '') : TEST_KEYS[k].map((f) => r[f]).filter((x) => x !== null && x !== undefined && x !== '').map(fmt).join(' / ') + ' ' + tu[k]
          + (k === 'push' && r.pushV ? ' · ' + (r.pushV === 'k' ? LL('з колін', 'from the knees') : LL('з носків', 'from the toes')) : '') + (k === 'sp' && r.spV === 'k' ? ' · ' + LL('з колін', 'from the knees') : '');
        return (testDone(k, tl) ? '✓ ' : '') + v + ' · ' + dm(r.d);
      };
      const chartOf = (k, name) => (k === 'push' ? plot(name, PV.map(([v, c]) => ({ pts: pts('push', null, (t) => (t.pushV || '') === v), color: c })), PV.length > 1 ? `<div class="legend">${PV.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>` : '')
        : k === 'sp' ? plot(name, ['spL', 'spR'].map((f, i) => ({ pts: pts(f, null, (t) => (t.spV || 'f') === spv), color: i ? 'var(--d)' : 'var(--accent)' })), LR)
        : k === 'bal' || k === 'car' ? plot(name, TEST_KEYS[k].map((f, i) => ({ pts: pts(f), color: i ? 'var(--d)' : 'var(--accent)' })), LR)
        : k === 'walk' ? plot(name, [{ pts: pts('walkT', (v) => Math.round(v / 6) / 10), color: 'var(--accent)' }], `<p class="tiny muted" style="margin:4px 0 0">${LL('Графік — хвилини на 2 км.', 'Chart — minutes for 2 km.')}</p>`)
        : plot(name, [{ pts: pts(TEST_KEYS[k][0]), color: 'var(--accent)' }]));
      const cards = TEST_HOW().filter(([k]) => testOn(k) || lastOf(k)).map(([k, name, line, v3]) => {
        const nm = testNorm(k), on = testOn(k);
        const viz = typeof VIZ === 'undefined' || !VIZ.has(v3) ? (nm ? `<p class="tiny muted" style="margin:8px 0 0">${nm}</p>` : '')
          : `<details class="vz3 vzt" data-k="${v3}"><summary data-tip="${esc(LL('Дотик — 3D: як виконувати тест і що означає число.', 'Tap for 3D: how to do the test and what the number means.'))}"><b>${LL('Як виконувати — 3D', 'How to do it — 3D')}</b><span class="small muted">${LL('Пальцем можна повернути вигляд', 'Drag to turn the view')}</span></summary>${vizInner()}${nm ? `<p class="tiny muted" style="margin:8px 0 0">${nm}</p>` : ''}</details>`;
        const form = !on ? `<p class="tiny muted" style="margin:8px 0 0">${LL('Цього тесту вже немає у вашій програмі — лишилась історія.', 'This test is no longer in your program — your history stays.')}</p>`
          : `<div class="tfs">${k === 'push' ? seg('pushV', [['k', LL('з колін', 'from the knees')], ['t', LL('з носків', 'from the toes')]]) : k === 'sp' ? seg('spV', [['k', LL('з колін', 'from the knees')], ['f', LL('з ніг', 'from the feet')]]) : ''}${TESTS.filter(([f]) => TEST_IN[k].indexOf(f) >= 0).map(field).join('')}</div>`
          + `<button type="button" class="pri wide" data-act="saveTest" data-t="${k}" data-tip="${esc(LL('Зберегти результат лише цього тесту за сьогодні; інші — коли зробите.', 'Save the result of this test only for today; the others whenever you do them.'))}">${LL('Зберегти', 'Save')}</button>`;
        return `<div class="card tcard" data-t="${k}"><div class="sp"><b>${name}</b><span class="small muted">${lastTxt(k, lastOf(k))}</span></div><p class="small muted" style="margin:4px 0 0">${line}</p>${viz}${form}${chartOf(k, name)}</div>`;
      }).join('') + (testOn('bal') ? `<div class="card"><b>${LL('Фото осанки збоку', 'Side posture photo')}</b><p class="small muted" style="margin:4px 0 0">${LL('Вухо, плече, таз і кісточка — чи на одній лінії; однакове світло й місце («Тіло» → «Фото» → «Збоку»).', 'Ear, shoulder, hip and ankle — are they in one line; same light and spot (“Body” → “Photos” → “Side”).')}</p></div>` : '');
      /* без дня тестів: пульс у спокої (Zhang 2016, CMAJ: 46 досліджень, 1 246 203 людини — +10 ударів за хвилину, на 9 % вища смертність) і талія / зріст
         (NICE NG246: 0,4–0,49 — здорово, 0,5–0,59 — підвищений ризик, від 0,6 — високий; для ІМТ до 35) — з «Замірів» і анкети, без нового заміру */
      const srt = (a) => (a || []).slice().sort((x, y) => (x.d < y.d ? -1 : 1)), rh = srt(p.body.rhr), rl = rh[rh.length - 1], wa = srt(p.body.waist).pop(), wl = srt(p.body.weight).pop();
      const hgt = Number((p.me || {}).height), wt = wa && hgt ? wa.v / hgt : null, kg = wl ? wl.v : Number(((DB.custom || {}).answers || {}).weight), bmi = hgt && kg ? kg / Math.pow(hgt / 100, 2) : null;
      const whtr = wt === null ? LL('заміряйте талію в «Замірах» — застосунок поділить її на зріст', 'measure your waist in Measurements — the app divides it by your height')
        : fmt(Math.round(wt * 100) / 100) + ' — ' + (bmi >= 35 ? LL('для ІМТ від 35 межі NICE не застосовують', 'NICE bands don’t apply at a BMI of 35+') : wt >= 0.6 ? LL('високий ризик', 'high risk') : wt >= 0.5 ? LL('підвищений ризик', 'increased risk') : wt >= 0.4 ? LL('здорово', 'healthy') : LL('NICE описує межі від 0,4', 'NICE bands start at 0.4'));
      const passive = `<h2>${LL('Без дня тестів', 'No test day needed')}</h2><div class="card"><div class="sp"><div><b>${LL('Пульс у спокої', 'Resting pulse')}</b><div class="small muted">${rl ? rl.v + LL(' уд/хв · ', ' bpm · ') + dm(rl.d) : LL('ще немає', 'none yet')}</div></div><button type="button" class="sm" data-act="rhrAdd" data-tip="${esc(LL('Записати пульс у спокої за сьогодні.', 'Log today’s resting pulse.'))}">${LL('+ Додати', '+ Add')}</button></div>
        ${rh.length >= 2 ? CHARTS.line([{ pts: rh.map((q) => ({ t: tms(q.d), v: q.v })), color: 'var(--accent)' }], { h: 100, label: LL('Пульс у спокої', 'Resting pulse') }) : ''}<p class="tiny muted" style="margin:6px 0 0">${LL('Раз на тиждень зранку, сидячи, до кави: удари за 30 с × 2. +10 ударів — на 9 % вища смертність (46 досліджень, ≈ 1,2 млн людей; звʼязок, не доказ причини).', 'Once a week in the morning, seated, before coffee: beats in 30 sec × 2. +10 beats means 9% higher mortality (46 studies, ≈ 1.2 million people; an association, not proof of cause).')}</p>
        <div class="sp" style="margin-top:10px"><div><b>${LL('Талія / зріст', 'Waist-to-height')}</b><div class="small muted">${whtr}</div></div>${wt === null ? `<button type="button" class="sm" data-act="goMeas">${LL('Заміри', 'Measurements')}</button>` : ''}</div>
        <p class="tiny muted" style="margin:6px 0 0">${LL('NICE: до 0,5 — здорово, 0,5–0,59 — підвищений ризик, від 0,6 — високий.', 'NICE: under 0.5 is healthy, 0.5–0.59 increased risk, 0.6 and above high.')}</p></div>`;
      /* у залі — сила з журналу (без окремого тесту): розрахунковий максимум жиму від грудей і жиму ногами — той самий, що в «Прогрес» → «Вправи» */
      const gym = ['g_chestpress', 'g_legpress'].filter((id) => prog.ex[id]).map((id) => {
        const ex = prog.ex[id], hist = ENGINE.history(p, id, 'all'); if (!hist.length) return '';
        const rec = ENGINE.records(ex, hist, p.handle), last = ENGINE.bestOf(ex, hist[hist.length - 1].sets, p.handle);
        return `<li><span>${esc(ex.name)}<div class="tiny muted">${esc(ENGINE.metricLabel(ex, isLb() ? 'lb' : 'kg'))}: ${LL('останнє ', 'last ')}${fmt(Math.round(last * 10) / 10)} · ${LL('рекорд ', 'best ')}${fmt(rec.e1rm.v)}</div></span></li>`;
      }).filter(Boolean);
      const total = TEST_HOW().filter(([k]) => testOn(k)).length, done = TEST_HOW().filter(([k]) => testOn(k) && testDone(k, tl)).length;
      body = `<p class="small muted" style="margin:4px 0 8px">${LL('Тижні 1, 4, 8, 12. Кожен тест — окремо, коли зручно: зберігайте той, що зробили. Головне — щоб числа росли.', 'Weeks 1, 4, 8, 12. Each test on its own, whenever it suits you: save the one you did. What matters is that the numbers go up.')}${done ? LL(' Цього разу зроблено: ', ' Done this time: ') + done + LL(' з ', ' of ') + total + '.' : ''}</p>${cards}
        ${passive}${gym.length ? `<h2>${LL('Сила з журналу', 'Strength from your log')}</h2><div class="card"><p class="tiny muted" style="margin:0 0 6px">${LL('Окремий тест не потрібен: розрахунковий максимум — з ваги й повторень ваших підходів (графік — «Прогрес» → «Вправи»).', 'No separate test needed: the estimated max comes from the weight and reps of your sets (chart — Progress → Exercises).')}</p><ul class="list">${gym.join('')}</ul></div>` : ''}`;
    }
    app.innerHTML = `${LL(`<h1>Тіло</h1><div class="seg">`, `<h1>Body</h1><div class="seg">`)}${tabs.map(([k, l]) => `<button type="button" class="${ui.bodyTab === k ? 'on' : ''}" data-act="bodyTab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
    if (ui.bodyTab === 'f') loadPhotos();
    if (ui.bodyTab === 't') testViz();
    tourMaybe('body');
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
  /* назва голосу людською мовою (огляд 24.10, слово Alexа: «кнопка збереження голосу й назви голосів»): «Тренер» / «Тренерка» за статтю голосу;
     до огляду — технічна назва з packs.json («Тренер · Algenib») і примітка «природний голос з характером (Gemini)»; двоє однієї статі — з номером */
  const packLabel = (x) => { const same = VPACKS.filter((y) => y.gender === x.gender), base = x.gender === 'f' ? LL('Тренерка', 'Female coach') : LL('Тренер', 'Male coach');
    return same.length > 1 ? base + ' ' + (same.indexOf(x) + 1) : base; };
  function packBox() {
    if (!VPACKS.length) return LL('<div class="note small">Записаних голосів ще немає — зараз говорить системний голос телефону.</div>', "<div class=\"note small\">No recorded voices yet — for now, the phone’s system voice is speaking.</div>");
    const cur = packId(), sex = G().sex;
    const byP = (a, b) => (b.priority || 0) - (a.priority || 0), list = VPACKS.filter((x) => x.gender === sex).sort(byP).concat(VPACKS.filter((x) => x.gender !== sex).sort(byP));
    return `${LL(`<label class="f">Голос тренера</label><div class="pick vp">`, `<label class="f">Coach voice</label><div class="pick vp">`)}${list.map((x) => `<button type="button" class="rst${x.id === cur ? ' on' : ''}" data-act="vpack" data-id="${x.id}"><b>${esc(packLabel(x))}</b></button>`).join('')}
</div>
      ${voiceInfo.mode ? `<div class="note small ${voiceInfo.mode === 'pack' ? 'ok' : 'w'}">${voiceInfo.mode === 'pack' ? LL('Зараз говорить записаний голос.', "The recorded voice is speaking now.") : LL('Остання фраза прозвучала системним голосом: ', "The last phrase was spoken in the system voice: ") + esc(voiceInfo.why) + '.'}</div>` : ''}
      ${cur ? `${LL(`<p class="small muted" id="vpState">Перевіряю, чи збережено в телефоні…</p><button type="button" class="wide" data-act="vdl" style="display:none">Зберегти голос у телефоні (для роботи без інтернету)</button>`, `<p class="small muted" id="vpState">Checking whether it’s saved on this phone…</p><button type="button" class="wide" data-act="vdl" style="display:none">Save the voice on this phone (works offline)</button>`)}` : ''}`;
  }
  async function packState() {
    const el = document.getElementById('vpState'), id = packId(); if (!el || !id) return;
    /* кнопка «Зберегти» — лише коли голос ще не збережено (огляд 24.10: до того була й поруч із «Голос збережено в телефоні») */
    try { const p = await VOICEPACK.load(id), have = await VOICEPACK.cached(id), btn = document.querySelector('[data-act="vdl"]'); if (btn) btn.style.display = have ? 'none' : ''; el.textContent = have ? LL('Голос збережено в телефоні: працює без інтернету.', "Voice saved on this phone: works offline.") : LL('Голос ще не збережено в телефоні (', "Voice not saved on this phone yet (") + (p.bytes ? Math.round(p.bytes / 1e6) + LL(' МБ', " MB") : LL('кілька МБ', "a few MB")) + LL('). Без інтернету тренер говоритиме системним голосом.', "). Offline, the coach will use the system voice."); }
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
    const seg = (key, opts, cur, tip) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-act="vset" data-k="${key}" data-v="${v}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;
    const vl = VOICE.list();
    const voiceBox = !VOICE.supported ? LL('<div class="note w small">Цей браузер не вміє озвучувати текст. ', "<div class=\"note w small\">This browser can’t read text aloud. ") + TX(LL('На iPhone голос працює в Safari й у встановленому застосунку.', "On iPhone, the voice works in Safari and in the installed app."), LL('На Android голос працює в Chrome й у встановленому застосунку.', "On Android, the voice works in Chrome and in the installed app.")) + '</div>'
      : !vl.length ? LL('<div class="note w small"><b>Українського голосу не знайдено.</b> ', "<div class=\"note w small\"><b>No English voice found.</b> ") + TX(LL('На iPhone: Параметри → Доступність → розділ про озвучення вмісту (англ. Spoken Content) → Голоси → Українська — завантажте голос і перезапустіть застосунок.', "On iPhone: Settings → Accessibility → Spoken Content → Voices → English — download a voice and restart the app."), LL('На Android: «Налаштування» → «Спеціальні можливості» → «Синтез мовлення» (або «Перетворення тексту в мовлення») → система Google → встановіть українську й перезапустіть застосунок. Назви пунктів у різних телефонів трохи різні.', "On Android: “Settings” → “Accessibility” → “Text-to-speech output” (or “Text-to-speech”) → Google engine → install English and restart the app. Menu names vary slightly from phone to phone.")) + '</div>'
      : `${LL(`<label class="f">Голос</label><select id="voiceSel">`, `<label class="f">Voice</label><select id="voiceSel">`)}${vl.map((v) => `<option value="${esc(v.uri)}"${v.uri === V.uri ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`;
    app.innerHTML = `${LL(`<h1>Більше</h1>
      `, `<h1>More</h1>
      `)}${accountCard()}
      ${standalone ? '' : installNote(LL('Встановіть як застосунок', "Install as an app"))}
      ${langCard()}${unitsCard()}${remindCard()}${LL(`
      <h2>Голосовий тренер</h2><div class="card" id="mVoice"><label class="f">Голос тренера під час тренування</label>`, `
      <h2>Voice coach</h2><div class="card" id="mVoice"><label class="f">Coach voice during workouts</label>`)}${seg('auto', [['full', LL('Не вимикати', 'Always on')], ['part', LL('Частково', 'Partly')], ['off', LL('Вимкнути', 'Off')]], V.auto || 'full')}<p class="tiny muted" style="margin:6px 0 10px">${autoTxt(V.auto || 'full', hasDb)}</p>
        ${I18N.lang === 'en' ? '<div class="note small">During workouts the coach speaks with your phone’s English voice — the recorded coach voices are in Ukrainian.</div>' : packBox()}
        ${packId() && I18N.lang !== 'en' ? '' : voiceBox}${LL(`
        <label class="sw"><span>Говорити й у беззвучному режимі<div class="tiny muted">вимкніть, якщо слухаєте музику в іншому застосунку і вона ставатиме на паузу</div></span><input type="checkbox" id="voiceSilent"`, `
        <label class="sw"><span>Speak even in silent mode<div class="tiny muted">turn this off if you listen to music in another app and it keeps pausing</div></span><input type="checkbox" id="voiceSilent"`)}${V.silent === false ? '' : ' checked'}${LL(`></label>
        <label class="f">Характер тренера</label>`, `></label>
        <label class="f">Coach personality</label>`)}${seg('tone', [['hard', LL('Жорсткий з гумором', "Tough, with humor")], ['calm', LL('Спокійний', "Calm")]], V.tone || 'hard')}${LL(`
        <label class="f">Скільки говорити</label>`, `
        <label class="f">How much to talk</label>`)}${seg('level', [['full', LL('Детально', "Detailed")], ['short', LL('Коротко', "Brief")]], V.level)}
        ${LL('<label class="f">Швидкість голосу</label>', '<label class="f">Voice speed</label>')}${seg('rate', [[1, '×1'], [1.2, LL('×1,2', '×1.2')], [1.5, LL('×1,5', '×1.5')], [2, '×2']], V.rate || 1, LL('Як швидко говорить тренер: фрази тренування й відповіді. Тон голосу не змінюється.', 'How fast the coach speaks: workout phrases and answers. The pitch stays the same.'))}${LL(`
        <button type="button" class="wide" data-act="say" data-what="test">🔊 Перевірити голос</button>
        <p class="tiny muted">Голос звучить, коли застосунок відкритий і екран увімкнений («Не гасити екран» нижче). Не чути — перевірте гучність і перемикач беззвучного режиму.</p></div>
      <h2>Музика</h2><div class="card"><div class="sp"><div><b>Радіо для тренувань</b><div class="small muted">`, `
        <button type="button" class="wide" data-act="say" data-what="test">🔊 Test voice</button>
        <p class="tiny muted">The voice plays when the app is open and the screen is on (“Keep screen on” below). Can’t hear it? Check the volume and the silent mode switch.</p></div>
      <h2>Music</h2><div class="card"><div class="sp"><div><b>Workout radio</b><div class="small muted">`)}${RADIO.cur ? esc(RADIO.cur.name) + ' · ' + ({ playing: LL('грає', "playing"), loading: LL('підключаюся', "connecting"), paused: LL('пауза', "paused"), error: LL('не відповідає', "not responding") }[RADIO.state] || '') : RADIO.STATIONS.length + LL(' станцій: денс, хіти, українські, рок, метал, драм-н-бейс', " stations: dance, hits, Ukrainian, rock, metal, drum and bass")}${LL(`</div></div><button type="button" class="sm pri" data-act="radio">Відкрити</button></div></div>
      <h2>Тренування</h2><div class="card" id="mWork"><label class="f">Екран тренування</label>`, `</div></div><button type="button" class="sm pri" data-act="radio">Open</button></div></div>
      <h2>Workout</h2><div class="card" id="mWork"><label class="f">Workout screen</label>`)}${seg('mode', [['coach', LL('Тренер · крок за кроком', "Coach · step by step")], ['list', LL('Список вправ', "Exercise list")]], S().mode)}
        ${sw('sound', LL('Звук таймера', "Timer sound"), LL('сигнал, коли відпочинок скінчився', "a beep when rest is over"))}${sw('haptics', LL('Вібровідгук', "Haptics"), TX(LL('на iPhone з iOS 18+, якщо підтримується', "on iPhone with iOS 18+, if supported"), LL('коротка вібрація на дотиках, помітна — коли скінчився відпочинок', "a short vibration on taps, a stronger one when rest is over")))}${sw('awake', LL('Не гасити екран', "Keep screen on"), LL('під час тренування', "during workouts"))}${sw('guide', LL('Вести за руку', "Hands-on guidance"), LL('3 тренування: тренер каже й підсвічує, що натиснути', "3 workouts: the coach tells you what to tap and highlights it"))}${LL(`</div>
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
      <h2>Порадник і підказки</h2><div class="card" id="mGuide" style="padding:10px 12px">`, `
      <h2>Guide and tips</h2><div class="card" id="mGuide" style="padding:10px 12px">`)}${guideChips()}${LL(`<div class="quick"><button type="button" class="sm" data-act="food">Кухня</button><button type="button" class="sm" data-act="glAll">Словник термінів</button><button type="button" class="sm" data-act="whatsnew">Можливості</button><button type="button" class="sm" data-act="tourReset">Показати навчання знову</button></div></div>
      <h2>Резервна копія</h2><div class="card" id="mBackup"><p class="small">Дані лише в цьому телефоні. Раз на тиждень зберігайте копію в iCloud, «Файли» чи Telegram.</p><p class="tiny muted">Остання копія: `, `<div class="quick"><button type="button" class="sm" data-act="food">Kitchen</button><button type="button" class="sm" data-act="glAll">Glossary</button><button type="button" class="sm" data-act="whatsnew">Features</button><button type="button" class="sm" data-act="tourReset">Show the tutorial again</button></div></div>
      <h2>Backup</h2><div class="card" id="mBackup"><p class="small">Data stays on this phone only. Once a week, save a copy to iCloud, “Files”, or Telegram.</p><p class="tiny muted">Last backup: `)}${DB.lastBackup ? dm(DB.lastBackup) : LL('ще не було', "none yet")}${LL(`</p>
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
    app.querySelectorAll('[data-set]').forEach((el) => { el.onchange = () => { S()[el.dataset.set] = el.checked; if (el.dataset.set === 'guide' && el.checked) S().guideFrom = P() ? P().sessions.length : 0; save(); if (el.dataset.set === 'haptics' && el.checked) haptic(); }; });
    tourMaybe('more');
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
        VOICE.init(DB.settings.voice); VOICEPACK.setRate(DB.settings.voice.rate); RADIO.setDuck(DB.settings.radio.duck); syncLegacy();
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
      </div>${started ? LL('<p class="tiny muted">Заміна — лише до першого підходу вправи.</p>', "<p class=\"tiny muted\">You can only swap before the exercise’s first set.</p>") : ''}${painBtn(i)}${LL(`
      <label class="f">Моя нотатка до вправи (видно щоразу)</label><textarea id="exNote" placeholder="наприклад: крісло біля стіни, хват ширший">`, `
      <label class="f">My note for this exercise (shown every time)</label><textarea id="exNote" placeholder="e.g., chair by the wall, wider grip">`)}${esc(P().notes[it.ex] || '')}</textarea><p></p>
      <button type="button" class="pri wide" data-act="noteSave" data-i="${i}${LL(`">Зберегти нотатку</button>`, `">Save note</button>`)}`);
    tourMaybe('exmenu', true);
  }
  /* «Болить суглоб» (з 3.21.5; слово Alexа 24.10, пункт 7): позначка на вправі цього тренування (draft.pain → підсумок тренування pain);
     наступного разу — вага на крок нижча, двічі поспіль — порада замінити вправу й до лікаря (makeItem, ENGINE.painRun). Правило — з програм
     силових вправ при артрозі: біль, що минає після підходу й не посилюється наступного дня, — допустимий; різкий чи наростає — зупинитись.
     «Досить на сьогодні» лишає зроблені підходи (пропуск вправи їх не зберігає), решту прибирає. */
  const painOn = (it) => ((P().draft || {}).pain || []).indexOf(it.ex) >= 0;
  const painHint = (it) => (painOn(it) ? `<div class="note w small">🩹 ${LL('Позначено: болить суглоб. Що робити — «⋯» → «Болить суглоб».', 'Marked: joint pain. What to do — “⋯” → “Joint pain.”')}</div>` : '');
  const painBtn = (i) => `<p></p><button type="button" class="wide" data-act="pain" data-i="${i}">🩹 ${LL('Болить суглоб', 'Joint pain')}${painOn(P().draft.items[i]) ? LL(' — позначено', ' — marked') : ''}</button>`;
  function painSheet(i) {
    const d = P().draft, it = d.items[i], ex = G().ex[it.ex];
    d.pain = d.pain || []; if (d.pain.indexOf(it.ex) < 0) { d.pain.push(it.ex); save(); }
    const lighter = (hasKg(ex) || isMach(ex)) && it.sets.some((s) => !s.done && typeof s.load === 'number' && s.load > 0);
    openSheet(`<div class="sp"><b>🩹 ${esc(ex.name)}</b><button type="button" class="sm ghost" data-act="closeSheet">${LL('Закрити', 'Close')}</button></div>
      <p class="small">${LL('Різкий біль або біль, що наростає, — зупиніться: на сьогодні з цією вправою досить. Біль, що минає після підходу й не посилюється наступного дня, — можна далі з меншою вагою.', 'Sharp pain or pain that keeps growing — stop: that’s enough of this exercise for today. Pain that eases after the set and isn’t worse the next day — you can go on with less weight.')}</p>
      <p class="small muted">${LL('Позначку збережено. Наступного разу застосунок дасть вагу на крок нижчу; болітиме двічі поспіль — порадить замінити вправу й показатися лікарю.', 'Marked. Next time the app will give you one step less weight; if it hurts twice in a row, it will suggest swapping the exercise and seeing a doctor.')}</p>
      <div class="grid2" style="margin-top:10px">${lighter ? `<button type="button" data-act="painLight" data-i="${i}">⬇ ${LL('Легше на крок', 'One step lighter')}</button>` : ''}<button type="button" data-act="painStop" data-i="${i}">⏹ ${LL('Досить на сьогодні', 'Enough for today')}</button></div><p></p>
      <button type="button" class="ghost wide" data-act="painOff" data-i="${i}">${LL('Не болить — прибрати позначку', 'No pain — remove the mark')}</button>`);
  }
  function swapSheet(i) {
    const d = P().draft, it = d.items[i], prog = G();
    const alts = ENGINE.alternatives(prog, it.ex, d.ready && d.ready !== 'g', d.items.map((x) => x.ex), d.place).slice(0, 6);
    openSheet(`${LL(`<div class="sp"><b>Замінити «`, `<div class="sp"><b>Swap “`)}${esc(prog.ex[it.ex].name)}${LL(`»</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">Вправи на ті самі мʼязи з вашої програми`, `”</b><button type="button" class="sm ghost" data-act="closeSheet">Close</button></div>
      <p class="small muted">Exercises from your program for the same muscles`)}${d.ready && d.ready !== 'g' ? LL(', без навантаження на поперек', ", without loading the lower back") : ''}.</p>
      ${alts.length ? `<div class="pick">${alts.map((id) => `<button type="button" data-act="swapTo" data-i="${i}" data-ex="${id}"><b>${esc(prog.ex[id].name)}</b><span class="small muted">${esc(prog.ex[id].m.p.map(mName).join(' · '))}</span></button>`).join('')}</div>` : LL('<div class="empty">Рівноцінної заміни в програмі немає — можна зробити вправу пізніше або пропустити.</div>', "<div class=\"empty\">No equivalent swap in your program — you can do this exercise later or skip it.</div>")}
      ${laterOk(d, i) ? `<div class="pick"><button type="button" data-act="later" data-i="${i}" data-tip="${esc(LATER_TIP())}"><b>${LL('⏭ Зробити пізніше', '⏭ Do it later')}</b><span class="small muted">${LL('Зайнято — спершу наступні вправи, ця (з парою суперсету) — у кінці', 'Busy — do the next exercises first; this one (with its superset pair) moves to the end')}</span></button></div>` : ''}`);
  }
  /* «Зробити пізніше» (з 3.27.0): тренажер зайнятий — вправа разом із парою суперсету йде в кінець тренування (поточна — перша незроблена).
     Потрібне насамперед для «верху / низу» (5–6 днів): там у тренуванні всі вправи половини тіла, і рівноцінна заміна може вже бути в ньому */
  const LATER_TIP = () => LL('Тренажер чи місце зайняте — зробіть спершу наступні вправи, а цю — в кінці. Пара суперсету переїде разом із нею; підходи, вага й відпочинок — ті самі.', 'Machine or spot taken — do the next exercises first and this one at the end. Its superset pair moves with it; sets, weight, and rest stay the same.');
  const laterBlock = (d, i) => { const it = d.items[i], pr = d.items[i - 1], nx = d.items[i + 1];
    if (it.ss && it.ss.k === 2 && pr && pr.ss && pr.ss.k === 1) return [i - 1, 2]; if (it.ss && it.ss.k === 1 && nx && nx.ss && nx.ss.k === 2) return [i, 2]; return [i, 1]; };
  const laterOk = (d, i) => { const [a, n] = laterBlock(d, i), open = (x) => !x.skipped && x.sets.some((s) => !s.done);
    return d.items.slice(a, a + n).some(open) && d.items.some((x, k) => (k < a || k >= a + n) && open(x)); };
  function doLater(i) {
    const d = P().draft; if (!d || !laterOk(d, i)) return;
    const name = G().ex[d.items[i].ex].name, [a, n] = laterBlock(d, i), block = d.items.splice(a, n);
    d.items.push(...block); save(); closeSheet(); rWorkout();
    toast(LL('«', '“') + TR(name) + LL('» — у кінці тренування', '” — moved to the end'));
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
    if (w === 'gl') { const g = GL(b.dataset.k); if (g) say1(g[0] + '. ' + g[1]); return; }
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
    if (!talk(t, true)) toast(VOICE.supported ? LL('Українського голосу в телефоні не знайдено — див. «Більше» → «Голосовий тренер»', "No English voice found on this phone — see “More” → “Voice coach”") : LL('Цей браузер не вміє озвучувати текст', "This browser can’t read text aloud"));
  }
  function sheetAct(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    handle(b, e);
  }
  function handle(b) {
    const act = b.dataset.act, i = Number(b.dataset.i), j = Number(b.dataset.j);
    const gd = view === 'workout' && P() && P().draft && P().draft.guide;
    if (gd && gd.cur && b.closest(G_EL[gd.cur])) gd.cur = null;  // натиснули те, що світилось, — підказку виконано
    else if (gd && gd.cur && (act === 'cdone' || act === 'tskip') && app.querySelector(G_EL[gd.cur])) gd.cur = null;  // побачили й пішли далі — не тягнути підказку (мікрофон є на кожному екрані)
    if (act === 'guideOff') { S().guide = false; save(); toast(LL('Підказки «за руку» вимкнено. Увімкнути — «Більше» → «Тренування».', "Hands-on tips are off. Turn them back on in “More” → “Workout.”")); return rWorkout(); }
    if (act === 'noop') return;
    if (act === 'closeSheet') return closeSheet();
    if (act === 'guide') return guideSheet(b.dataset.id);
    if (act === 'mcg') { const box = sheetEl.querySelector('.mcg'); if (!box || !MCG.some((x) => x[0] === b.dataset.k)) return; ui.mcg = b.dataset.k; box.outerHTML = mcgHtml(ui.mcg); return mcgAttach(); }
    if (act === 'gl') return glSheet(b.dataset.k);
    if (act === 'glAll') return glAll();
    if (act === 'say') return sayWhat(b);
    if (act === 'whatsnew') return whatsNew();
    if (act === 'tipsOk') { S().tour.tips = true; save(); return render(); }
    if (act === 'lessonOk') { P().lessonSeen = today(); save(); return rHome(); }
    if (act === 'year') return yearSheet(b.dataset.v);
    if (act === 'yearShare') return yearShare(b.dataset.v);
    /* ранкове питання (з 3.24.0, пункт 7): одна відповідь на день; зберігаємо 400 днів (для підсумку року) */
    if (act === 'mood') { const p = P(), lim = iso(new Date(tms(today()) - 400 * 864e5)); p.mood = p.mood || {}; p.mood[today()] = Number(b.dataset.v); Object.keys(p.mood).forEach((k) => { if (k < lim) delete p.mood[k]; }); save(); haptic(); return rHome(); }
    if (act === 'moodEdit') { const p = P(); if (p.mood) delete p.mood[today()]; save(); return rHome(); }
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
    if (act === 'rplay') { ensureAudio(); VOICE.unlock(); S().radio.id = b.dataset.id; save(); if (S().radio.only && !(P() && P().draft)) { toast(LL('Станцію обрано — заграє, щойно почнете тренування.', 'Station picked — it’ll play as soon as you start a workout.')); return radioSheet(); } RADIO.play(b.dataset.id, audio); return radioSheet(); }
    if (act === 'ronly') { S().radio.only = b.dataset.v === '1'; save(); return radioSheet(); }  // з 3.24.0 — пункт 16
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
      if (c.errors.equip) { toast(TR(c.errors.equip)); return; }  // англійською — перекладом (до 3.27.0 — українською)
      syncAnswers({ equip: eq }); save(); toast(LL('Програму оновлено під обладнання — історія й рекорди лишаються', "Program updated for your equipment — history and PRs stay")); return rMore();
    }
    if (act === 'qLimit') {
      qRead(); const L = qState().a.limits, v = b.dataset.v;
      if (v === 'none') { const had = L.indexOf('none') >= 0; L.length = 0; if (!had) L.push('none'); }
      else { const k = L.indexOf('none'); if (k >= 0) L.splice(k, 1); qToggle(L, v); }
      haptic(); return rOnboard();
    }
    if (act === 'qDay') { qRead(); const mx = GEN.maxDays(qState().a); if (!qToggle(qState().a.days, Number(b.dataset.v), mx)) toast(mx === 4 ? LL('Для 55+ і з тиском чи серцем — до 4 днів; оберіть, який прибрати', "For 55+ and with blood pressure or heart issues — up to 4 days; pick one to remove") : LL('Максимум 6 днів — оберіть, який прибрати', "6 days max — pick one to remove")); haptic(); return rOnboard(); }
    if (act === 'qBack') { qRead(); const q = qState(); q.err = false; q.step = Math.max(0, q.step - 1); rOnboard(); window.scrollTo(0, 0); return; }
    if (act === 'qCancel') { ui.q = null; view = 'more'; render(); return; }
    /* «Змінити» в підсумку — цей крок; «До відповідей» — назад до підсумку (з 3.27.0) */
    if (act === 'qJump') { qRead(); const q = qState(), k = qSteps(q.a).indexOf(b.dataset.v); if (k < 0) return; q.err = false; q.ret = true; q.step = k; rOnboard(); window.scrollTo(0, 0); return; }
    if (act === 'qSum') { qRead(); const q = qState(); q.err = false; q.ret = false; q.step = qSteps(q.a).length - 1; rOnboard(); window.scrollTo(0, 0); return; }
    if (act === 'qNext') {
      qRead(); const q = qState(), QS = qSteps(q.a), step = QS[q.step];
      if (Object.keys(qErrors(step)).length) { q.err = true; rOnboard(); const e = document.querySelector('.qerr'); if (e) e.scrollIntoView({ block: 'center' }); return; }
      if (step === 'agree' && GEN.check(q.a).block) { q.err = true; return rOnboard(); }
      q.err = false;
      /* з підсумку: «Готово» — назад до відповідей, а якщо зміна потребує ще відповіді (у залі → удома: обладнання) — спершу той крок; перед «Оновити програму» — те саме */
      const QS2 = qSteps(q.a), bad = QS2.findIndex((st) => st !== 'agree' && Object.keys(qErrors(st)).length);
      if ((q.ret || q.step === QS.length - 1) && bad >= 0) { q.step = bad; q.err = true; q.ret = true; rOnboard(); window.scrollTo(0, 0); return; }
      if (q.ret) { q.ret = false; q.step = QS2.length - 1; rOnboard(); window.scrollTo(0, 0); return; }
      if (q.step === QS.length - 1) return qFinish();
      q.step++; rOnboard(); window.scrollTo(0, 0); return;
    }
    const p = P();
    /* головна */
    /* питання про спину — лише там, де від нього щось залежить */
    if (act === 'start') { ui.shortNext = false; VOICE.unlock(); return beginWorkout(null); }
    if (act === 'startShort') { closeSheet(); ui.shortNext = true; VOICE.unlock(); return beginWorkout(null); }  // з 3.25.0 — коротка версія (пункт 15)
    if (act === 'place') { closeSheet(); return beginWorkout(b.dataset.w || null, b.dataset.v); }
    if (act === 'go') { closeSheet(); return startWorkout(b.dataset.w || null, b.dataset.r, b.dataset.p || undefined); }
    if (act === 'other') return otherSheet();
    if (act === 'startW') { ui.shortNext = false; VOICE.unlock(); return beginWorkout(b.dataset.w); }
    if (act === 'resume') { view = 'workout'; return render(); }
    if (act === 'remindOn') return remindOn();
    if (act === 'remindOff') return remindOff();
    if (act === 'remindTest') { return remindSync(true).then((ok) => toast(ok ? LL('Пробне нагадування вже летить', "Test reminder is on its way") : LL('Не вдалося — перевірте інтернет', "Didn’t work — check your internet"))); }
    if (act === 'dailyDone') { const t = today(), r = p.daily[t] = p.daily[t] || {}; r[b.dataset.id] = !r[b.dataset.id]; save(); haptic(); return rHome(); }
    if (act === 'jump') { const k = Number(b.dataset.k), t = today(); const r = p.daily[t] = p.daily[t] || {}; r.jumps = (r.jumps || 0) >= k ? k - 1 : k; save(); haptic(); return rHome(); }
    /* тренування */
    if (act === 'minimize') { view = 'home'; return render(); }
    if (act === 'vmute') { const d = p.draft; if (!d) return; const on = vAuto() !== 'off'; d.vo = on ? 'off' : 'on'; save(); if (on) { VOICEPACK.stop(); VOICE.stop(); toast(LL('Голос тренера вимкнено на це тренування', 'Coach voice off for this workout')); } else { toast(LL('Голос тренера увімкнено', 'Coach voice on')); VOICE.unlock(); talk(LL('Голос увімкнено.', 'Voice is on.'), true); } return rWorkout(); }
    if (act === 'finish') return finishWorkout();
    /* з 3.22.3 — скасували: тренер замовкає одразу (слово Alexа 25.10: «якщо я відміняю тренування то тренер продовжує говорити інструкції до вправи») */
    if (act === 'discard') { if (confirm(LL('Скасувати тренування? Відмічені підходи не збережуться.', "Cancel the workout? Checked-off sets won’t be saved."))) { askHush(); p.draft = null; save(); stopTimer(); if (S().radio.only) RADIO.stop(); view = 'home'; render(); remindSync(false); } return; }  // скасували — сьогодні ще не тренувались: значок (rHome) і нагадування повертаються
    if (act === 'done') return toggleDone(i, j);
    if (act === 'kp') return openKp(i, j, b.dataset.f);
    if (act === 'stype') { if (p.draft.items[i].sets[j].done) return toast(LL('Підхід уже позначено ✓ — спершу зніміть позначку', "Set already checked off ✓ — uncheck it first")); return typeSheet(i, j); }
    if (act === 'stypeSet') { const s = p.draft.items[i].sets[j]; s.type = b.dataset.t; save(); haptic(); closeSheet(); return rWorkout(); }
    if (act === 'mode') { if (!p.draft) return; p.draft.mode = wMode() === 'list' ? 'coach' : 'list'; if (p.draft.mode === 'coach' && p.draft.coach) p.draft.coach.warm = true; save(); render(); window.scrollTo(0, 0); return; }  // лише це тренування (з 3.27.7)
    if (act === 'cdone') return coachDone();
    if (act === 'cwarm') { p.draft.coach.warm = true; save(); const cs = curStep(p.draft), gs = cs ? gSay(p.draft, 'card') : ''; rWorkout(); window.scrollTo(0, 0); if (cs) talk((b.dataset.skip ? '' : L('warmDone', p.draft.n) || LL('Добре. ', "Good. ")) + LL('Перша вправа. ', "First exercise. ") + setSpeech(p.draft, cs) + gs); return; }
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
    if (act === 'tskip') { const k = T.kind; stopTimer(); if (k === 'myo') { talk(LL('Ще від трьох до пʼяти повторень.', "Three to five more reps.")); return rWorkout(); } const cs = curStep(p.draft); if (cs) talk(setSpeech(p.draft, cs, true) + gSay(p.draft, 'card')); return rWorkout(); }
    if (act === 'myoRep') return myoRep(Number(b.dataset.v));
    if (act === 'myoEnd') return myoEnd();
    if (act === 'minis') return minisSheet(i, j);
    if (act === 'miniSet') { ui.minis.m[Number(b.dataset.k)] = Number(b.dataset.v); return minisSheet(ui.minis.i, ui.minis.j, true); }
    if (act === 'miniSave') { const s = p.draft.items[ui.minis.i].sets[ui.minis.j]; s.mini = ui.minis.m.filter((r) => r > 0); save(); closeSheet(); return rWorkout(); }
    if (act === 'swap') return swapSheet(i);
    if (act === 'swapTo') return doSwap(i, b.dataset.ex);
    if (act === 'later') return doLater(i);  // з 3.27.0
    if (act === 'copyprev') { const s = p.draft.items[i].sets[j]; if (!s.prev || s.done) return; s.load = s.prev.load; s.reps = s.prev.reps; s.touched = true; save(); haptic(); return rWorkout(); }
    if (act === 'variant') return switchVariant(i, b.dataset.v);
    if (act === 'dropset') {
      const it = p.draft.items[i]; if (!dropOk(it)) return;
      it.sets.push({ type: 'D', load: dropLoad(it), reps: it.min || null, rir: null, done: false, pr: [], prev: null, touched: true });
      save(); haptic(); closeSheet(); toast(LL('Дроп-сет додано — одразу після останнього підходу, без відпочинку', "Drop set added — right after the last set, no rest")); return rWorkout();
    }
    if (act === 'addset') { const it = p.draft.items[i], l = it.sets.filter((x) => x.type !== 'W').slice(-1)[0] || it.sets[it.sets.length - 1] || {}; it.sets.push({ type: 'N', load: l.load === undefined ? null : l.load, reps: l.reps === undefined ? null : l.reps, rir: null, done: false, pr: [], prev: null, touched: false, plan: l.plan === undefined ? l.load : l.plan }); save(); closeSheet(); return rWorkout(); }
    if (act === 'warm') { const it = p.draft.items[i], ex = G().ex[it.ex], fw = it.sets.find((s) => s.type !== 'W'); const ws = ENGINE.warmups(ex, fw ? fw.load : null, ENGINE.stepFor(p.inv), G().warm, isMach(ex) ? loadStep(ex, it.ex) : 0); it.sets = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true })).concat(it.sets); save(); closeSheet(); return rWorkout(); }
    if (act === 'exmenu') return exMenu(i);
    if (act === 'pain') return painSheet(i);  // з 3.21.5 — «Болить суглоб»
    if (act === 'cycMark') { const c = p.body.cycle = p.body.cycle || [], t = today(); if (c.indexOf(t) < 0) c.push(t); c.sort(); save(); toast(LL('Позначено: початок циклу', 'Marked: period start')); return rBody(); }  // з 3.21.5
    if (act === 'cycDel') { p.body.cycle = (p.body.cycle || []).filter((d) => d !== today()); save(); toast(LL('Позначку прибрано', 'Mark removed')); return rBody(); }
    if (act === 'lowWhy') { const it = p.draft.items[i], v = b.dataset.v; if (['tired', 'pain', 'plan', 'kit'].indexOf(v) < 0) return; it.low = v; save(); closeSheet(); if (v === 'pain') return painSheet(i); return rWorkout(); }
    if (act === 'lowExtra') {
      const it = p.draft.items[i], s0 = it.sets[Number(b.dataset.j)]; if (!s0 || it.low) return closeSheet();
      it.low = 'extra'; it.sets.push({ type: 'N', load: s0.load, reps: it.min || s0.reps, rir: null, done: false, pr: [], prev: null, touched: true, plan: s0.load, extra: true });
      save(); closeSheet(); toast(LL('Додано ще один підхід — скільки вийде', 'One more set added — as many as you can')); return rWorkout();
    }
    if (act === 'painLight') { const it = p.draft.items[i], ex = G().ex[it.ex], st = isMach(ex) ? loadStep(ex, it.ex, p.draft.place) : ENGINE.stepFor(p.inv); it.sets.forEach((s) => { if (!s.done && typeof s.load === 'number' && s.load > 0) { s.load = Math.max(0, Math.round((s.load - st) * 100) / 100); s.plan = s.load; } }); save(); closeSheet(); toast(LL('Решта підходів — на крок легше', 'Remaining sets — one step lighter')); return rWorkout(); }
    if (act === 'painStop') { const it = p.draft.items[i]; if (it.sets.some((s) => s.done)) it.sets = it.sets.filter((s) => s.done); else it.skipped = true; save(); closeSheet(); toast(LL('Вправу завершено — зроблені підходи збережено', 'Exercise finished — the sets you did are saved')); return rWorkout(); }
    if (act === 'painOff') { const ex = p.draft.items[i].ex; p.draft.pain = (p.draft.pain || []).filter((x) => x !== ex); save(); closeSheet(); toast(LL('Позначку прибрано', 'Mark removed')); return rWorkout(); }
    if (act === 'noteSave') { const it = p.draft.items[i]; const v = document.getElementById('exNote').value.trim(); if (v) p.notes[it.ex] = v; else delete p.notes[it.ex]; save(); closeSheet(); toast(LL('Нотатку збережено', "Note saved")); return rWorkout(); }
    if (act === 'delset') { const it = p.draft.items[i]; if (it.sets.length > 1 && !it.sets[it.sets.length - 1].done) it.sets.pop(); save(); closeSheet(); return rWorkout(); }
    if (act === 'skip') { p.draft.items[i].skipped = true; save(); closeSheet(); rWorkout(); const cs = curStep(p.draft); if (cs && wMode() !== 'list' && !T.id) talk((hard() ? COACH.line('skip', G().sex, 0) + ' ' : LL('Пропускаємо. ', "Skipping. ")) + LL('Далі. ', "Next up. ") + setSpeech(p.draft, cs)); return; }
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
    if (act === 'kTab') { const a = ui.kAdd; ui.kAdd = { mode: 'new', m: a.m, tab: b.dataset.v, q: '', ph: a.ph, added: a.added }; return kAddDraw(); }
    if (act === 'kDone') { closeSheet(); return rKitchen(); }
    if (act === 'kPhoto') { const fi = document.getElementById('kPhIn'); if (fi) fi.click(); return; }
    if (act === 'kBar') { const fi = document.getElementById('kpBarIn'); if (fi) fi.click(); return; }  // з 3.21.6
    if (act === 'kPhPick') { const a = ui.kAdd, x = a.ph && a.ph.items && a.ph.items[Number(b.dataset.j)], it = x && KITCHEN.item(x.id); if (!it) return;
      Object.assign(a, { id: it.id, s: it.v.length === 1 ? it.v[0].s : undefined, how: 'g', g: null, mi: undefined, mq: 1, phj: Number(b.dataset.j) }); return kAddDraw(); }
    if (act === 'kPick') { const it = KITCHEN.item(b.dataset.id); if (!it) return; Object.assign(ui.kAdd, { id: it.id, s: it.v.length === 1 ? it.v[0].s : undefined, how: 'g', g: null, mi: undefined, mq: 1 }); return kAddDraw(); }
    if (act === 'kPickMy') { Object.assign(ui.kAdd, b.dataset.t === 'pid' ? { pid: b.dataset.id, did: null } : { did: b.dataset.id, pid: null }, { how: 'g', g: null }); return kAddDraw(); }
    if (act === 'kBack') { const a = ui.kAdd; ui.kAdd = { mode: 'new', m: a.m, tab: a.tab, q: a.q || '', ph: a.ph, added: a.added }; return kAddDraw(); }
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
    if (act === 'kWaterHome') { const tu = kTurn(); kWaterLog(kWaterDay(), tu ? tu.ml : kit().set.glass); save(); haptic(); rHome(); if (kit().set.water) remindSync(false); return; }
    if (act === 'kWaterRemind') return kWaterRemind();
    if (act === 'goMeas') { view = 'body'; ui.bodyTab = 'm'; render(); window.scrollTo(0, 0); return; }  // з «Кухні» — у «Тіло → Заміри» (з 3.21.0)
    if (act === 'kMine') return kMine();
    if (act === 'kCombo') return kCombo(Number(b.dataset.m));
    if (act === 'kComboSave') return kComboSave();
    if (act === 'kComboAdd') return kComboAdd(b.dataset.id);
    if (act === 'kComboDel') { if (!confirm(LL('Видалити збережений прийом? Записи днів лишаться.', 'Delete this saved meal? Logged days stay.'))) return; delete kit().combos[b.dataset.id]; save(); return kMine(); }
    if (act === 'kSet') return kSettings();
    if (act === 'kAbout') return kAbout();
    /* прийоми й склянка — одразу, але без перемальовування шторки: набране в полях зросту, віку й часу не губиться */
    if (act === 'kSetMeals') { const n = Number(b.dataset.v); if ([3, 4, 5].indexOf(n) < 0) return; kit().set.meals = n; save(); sheetEl.querySelectorAll('[data-act="kSetMeals"]').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) === n)); return; }
    if (act === 'kSetPer') { const n = Number(b.dataset.v); if (n !== 1 && n !== 2) return; kit().set.per = n; save(); if (kit().set.water) remindSync(false); sheetEl.querySelectorAll('[data-act="kSetPer"]').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) === n)); const ki = document.getElementById('kInt'); if (ki) ki.textContent = kIntWhy(kit().set.glass, n); return; }  // з 3.22.1 — склянок за раз
    if (act === 'kSetGlass') { const n = Number(b.dataset.v); if ([250, 300, 350, 400, 450, 500].indexOf(n) < 0) return; kit().set.glass = n; save(); if (kit().set.water) remindSync(false); sheetEl.querySelectorAll('[data-act="kSetGlass"]').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) === n)); const ki = document.getElementById('kInt'); if (ki) ki.textContent = kIntWhy(n); return; }
    if (act === 'kVolRec') { const k = kit(), rec = kWRec(); if (!rec) return; k.set.vol = null; save(); if (k.set.water) remindSync(false); const v = document.getElementById('kVol'); if (v) { v.value = fmt(rec / 1000); v.dataset.v0 = v.value; } toast(LL('Норма води — як рекомендовано', 'Water target — as recommended')); return; }
    if (act === 'kSetSave') {
      const p = P(), h = HDin(num(document.getElementById('meH').value)), a = num(document.getElementById('meA').value), te = document.getElementById('meT') ? BWin(num(document.getElementById('meT').value)) : null;
      if (h !== null && (h < 130 || h > 220)) { toast(isLb() ? LL('Зріст — від 51 до 86 дюймів', 'Height — 51 to 86 in') : LL('Зріст — від 130 до 220 см', "Height — 130 to 220 cm")); return; }
      if (a !== null && (a < 16 || a > 85)) { toast(LL('Вік — від 16 до 85', "Age — 16 to 85")); return; }
      if (te !== null && (te < 35 || te > 250)) { toast(isLb() ? LL('Цільова вага — від 78 до 551 lb', 'Target weight — 78 to 551 lb') : LL('Цільова вага — від 35 до 250 кг', "Target weight — 35 to 250 kg")); return; }
      const wf = document.getElementById('kFirst').value, wl = document.getElementById('kLast').value, ok = (x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x || ''), vEl = document.getElementById('kVol'), vol = num(vEl.value);
      const vSame = vEl.value.trim() === (vEl.dataset.v0 || '');  // поле води не чіпали (контрольний аудит 24.10: зміна віку в тому ж «Зберегти» не робить норму «своєю»)
      if (!ok(wf) || !ok(wl) || wf === wl) { toast(LL('Вкажіть час першої й останньої склянки', 'Enter the times of your first and last glass')); return; }
      if (((kHM(wl) - kHM(wf) + 1440) % 1440) < 120) { toast(LL('Між першою й останньою склянкою — щонайменше 2 год', 'Leave at least 2 hours between the first and last glass')); return; }
      if (!vSame && (vol === null || vol < 1 || vol > 5)) { toast(LL('Скільки пити — від 1 до 5 л на день', 'Amount — 1 to 5 L a day')); return; }
      /* з 3.21.1: не більше 0,8 л на годину (здорові нирки в спокої виводять 0,8–1 л) — у день тренування, коли пити найбільше */
      const wMax = KITCHEN.waterTarget(ksex(), true, Math.round(vol * 1000)), wSpan = (kHM(wl) - kHM(wf) + 1440) % 1440;
      if (wMax / wSpan * 60 > KITCHEN.WATER_RATE) { toast(LL('Забагато води за короткий час: понад 0,8 л на годину. Між першою й останньою склянкою — щонайменше ', 'Too much water in too little time: over 0.8 L an hour. Leave at least ') + Math.ceil(wMax / KITCHEN.WATER_RATE) + LL(' год або менше на день', ' hours between the first and last glass, or drink less a day')); return; }
      p.me = Object.assign({}, p.me || {}, { height: h, age: a, target: te });
      const sa = {}; if (h !== null) sa.height = h; if (a !== null) sa.age = a; if (Object.keys(sa).length) syncAnswers(sa);
      const k = kit(), ml = Math.round(vol * 1000), def = KITCHEN.waterTarget(ksex(), false, null, kWRec());
      k.set.first = wf; k.set.last = wl; if (!vSame) k.set.vol = Math.abs(ml - def) < 25 ? null : ml;  // з 3.21.0 — свій план води; з 3.21.2 — не змінене поле лишає рекомендовану норму (вона йде за вагою)
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
      const ms0 = msGot();  // віхи до запису (з 3.21.5): нова віха ваги чи талії — у повідомленні
      const arr = p.body[m[0]] = p.body[m[0]] || [], t = today(), k = arr.findIndex((q) => q.d === t);
      if (k >= 0) arr[k].v = v; else arr.push({ d: t, v }); save(); closeSheet();
      const msN = msGot().filter((g) => (g.k === 'w' || g.k === 'c') && !ms0.some((h) => h.k === g.k && h.v === g.v)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
      toast(msN.length ? '🏅 ' + msText(msN[0]) : LL('Збережено', "Saved"));
      if (m[0] === 'weight' && kit().set.water) remindSync(false);  // з 3.21.2: норма води йде за вагою — нагадування теж (контрольний аудит 24.10)
      return rBody();
    }
    if (act === 'photo') {
      const id = Number(b.dataset.id); const img = b.querySelector('img');
      openSheet(`<img src="${img ? img.src : ''}${LL(`" style="width:100%" alt="фото"><p></p><button type="button" class="ghost wide" style="color:var(--bad);border-color:var(--bad)" data-act="photoDel" data-id="`, `" style="width:100%" alt="photo"><p></p><button type="button" class="ghost wide" style="color:var(--bad);border-color:var(--bad)" data-act="photoDel" data-id="`)}${id}${LL(`">Видалити фото</button>`, `">Delete photo</button>`)}`); return;
    }
    if (act === 'photoDel') { if (!confirm(LL('Видалити фото?', "Delete photo?"))) return; STORE.delPhoto(Number(b.dataset.id)).then(() => { closeSheet(); rBody(); }); return; }
    if (act === 'tVar') { TV()[b.dataset.k] = b.dataset.v; b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));  // без перемальовування — введене лишається
      TEST_IN[b.dataset.k === 'pushV' ? 'push' : 'sp'].forEach((f) => { const el = document.getElementById('tc_' + f); if (el) el.outerHTML = tChip(f); }); return; }  // плашка — свого варіанта (з 3.27.7)
    if (act === 'tNorm') { const f = b.dataset.f, c = testChip(f), tk = Object.keys(TEST_IN).find((x) => TEST_IN[x].indexOf(f) >= 0), nm = (TEST_HOW().find((x) => x[0] === tk) || [])[1] || '';
      if (c) openSheet(`<h2>${esc(nm)} · ${esc(c.t)}</h2><p class="small">${esc(c.tip)}</p><button type="button" class="ghost wide" data-act="closeSheet">${LL('Зрозуміло', 'Got it')}</button>`); return; }
    if (act === 'saveTest') {
      /* один тест — своя кнопка (з 3.27.4): читаємо лише поля цього тесту; той самий день — доповнюємо (інші тести можуть бути окремо): порожнє поле не стирає вже записане */
      const tk = b.dataset.t, rec = { d: today() }; let bad = false; if (!TEST_IN[tk]) return;
      TEST_IN[tk].forEach((k) => { const el = document.getElementById('t_' + k), v = el ? num(el.value) : null, lim = TEST_LIM[k]; if (v !== null && (v < lim[0] || v > lim[1] || (k === 'srt' && v * 2 !== Math.round(v * 2)))) bad = true; rec[k] = v; });
      if (bad) { toast(LL('Перевірте числа', 'Check the numbers')); return; }
      /* 2 км: хвилини й секунди → секунди (walkT); пульс — лише разом із часом */
      if ('walkM' in rec) { rec.walkT = rec.walkM !== null ? Math.round(rec.walkM * 60 + (rec.walkS || 0)) : null; if (rec.walkT === null) rec.walkHR = null; delete rec.walkM; delete rec.walkS; }
      const has = (k) => rec[k] !== null && rec[k] !== undefined;
      if (has('push')) rec.pushV = TV().pushV;
      if (has('spL') || has('spR')) rec.spV = TV().spV;
      if (!Object.keys(rec).some((k) => k !== 'd' && k !== 'pushV' && k !== 'spV' && has(k))) { toast(LL('Впишіть результат', 'Enter the result')); return; }
      const all = p.body.tests = p.body.tests || [], o = all.find((t) => t.d === rec.d);
      if (o) Object.keys(rec).forEach((k) => { if (has(k)) o[k] = rec[k]; }); else all.push(rec);
      const nm = (TEST_HOW().find((x) => x[0] === tk) || [])[1] || '';
      save(); toast(LL('Збережено: ', 'Saved: ') + nm); return rBody();
    }
    /* пульс у спокої (з 3.27.3) — раз на тиждень зранку; один запис на день */
    if (act === 'rhrAdd') { openSheet(`<h2>${LL('Пульс у спокої', 'Resting pulse')}</h2><p class="small muted">${LL('Зранку, сидячи, до кави: удари за 30 с × 2.', 'In the morning, seated, before coffee: beats in 30 sec × 2.')}</p><label class="f">${LL('Ударів за хвилину', 'Beats per minute')}</label><input inputmode="numeric" id="rhrIn" data-tip="${esc(LL('Ударів за хвилину: за 30 с × 2.', 'Beats per minute: in 30 sec × 2.'))}"><p></p><button type="button" class="pri wide" data-act="rhrSave" data-tip="${esc(LL('Зберегти пульс у спокої за сьогодні.', 'Save today’s resting pulse.'))}">${LL('Зберегти', 'Save')}</button>`); return; }
    if (act === 'rhrSave') {
      const v = num(document.getElementById('rhrIn').value); if (v === null || v < 30 || v > 150) { toast(LL('Перевірте число', 'Check the number')); return; }
      const arr = p.body.rhr = p.body.rhr || [], t = today(), k = arr.findIndex((q) => q.d === t); if (k >= 0) arr[k].v = v; else arr.push({ d: t, v });
      save(); closeSheet(); toast(LL('Пульс збережено', 'Pulse saved')); return rBody();
    }
    /* більше */
    if (act === 'vset') { const k = b.dataset.k, v = b.dataset.v; if (k === 'mode') { S().mode = v; if (p && p.draft) delete p.draft.mode; } else S().voice[k] = k === 'rate' ? Number(v) : v; if (k === 'rate') VOICEPACK.setRate(S().voice.rate); save(); rMore(); if (k === 'auto') { if (v === 'off') { VOICE.stop(); VOICEPACK.stop(); } else { VOICE.unlock(); talk(LL('Голос увімкнено.', 'Voice is on.'), true); } return; } if (k !== 'mode') { VOICE.unlock(); talk(k === 'rate' ? LL('Такий темп.', "Speaking at this pace.") : k === 'tone' ? (v === 'calm' ? LL('Добре, говоритиму спокійно.', "Okay, I’ll keep it calm.") : LL('Жарти лишаються. Скінчилось лише філонство.', "The jokes stay. The slacking is over.")) : v === 'short' ? LL('Говоритиму коротко.', "I’ll keep it short.") : LL('Говоритиму детально.', "I’ll go into detail."), true); } return; }
    if (act === 'vpack') { ensureAudio(); S().voice.packs[DB.active] = b.dataset.id; S().voice.packsManual = S().voice.packsManual || {}; S().voice.packsManual[DB.active] = true; save(); const id = b.dataset.id;
      if (id) VOICEPACK.load(id).then(() => { rMore(); talk(LL('Привіт! Я твій тренер. Так звучатиме голос під час тренування.', "Hi! I’m your coach. This is how I’ll sound during your workout."), true); VOICEPACK.download(id).then(() => packState()).catch(() => {}); }).catch(() => toast(LL('Не вдалося завантажити голос — перевірте інтернет', "Couldn’t download the voice — check your internet")));
      else { rMore(); talk(LL('Так звучить системний голос.', "This is the system voice."), true); }
      return; }
    if (act === 'vdl') { const id = packId(), el = document.getElementById('vpState'); b.disabled = true;
      VOICEPACK.download(id, (d, t) => { if (el) el.textContent = LL('Зберігаю: ', "Saving: ") + (t ? Math.round(d / t * 100) + ' %' : Math.round(d / 1e6) + LL(' МБ', " MB")) + '…'; }).then(() => { toast(LL('Голос збережено в телефоні', "Voice saved on this phone")); packState(); b.disabled = false; }).catch(() => { toast(LL('Не вдалося — перевірте інтернет', "Didn’t work — check your internet")); b.disabled = false; });
      return; }
    if (act === 'tourReset') { S().tour = { v3: true }; S().guide = true; S().guideFrom = p ? p.sessions.length : 0; save(); toast(LL('Навчання покажеться на кожному екрані, а наступні 3 тренування тренер поведе за руку', "The tutorial will show on every screen, and the coach will guide your next 3 workouts hands-on")); view = 'home'; return render(); }
    if (act === 'day') {
      if (p.draft) return;
      const dd = Number(b.dataset.d), nd = p.days.slice(), k = nd.indexOf(dd); if (k >= 0) nd.splice(k, 1); else nd.push(dd); nd.sort();
      /* програма за анкетою — від 2 до 6 днів, як в анкеті (5–6 — «верх / низ», з 3.27.0); дні йдуть і в програму (скільки тренувань на тиждень) */
      const mx = DB.custom ? GEN.maxDays(DB.custom.answers) : 6;  // 55+ і тиск / серце — до 4 (з 3.27.0)
      if (DB.custom && (nd.length < 2 || nd.length > mx)) { toast(mx === 4 ? LL('Для 55+ і з тиском чи серцем — від 2 до 4 днів', "For 55+ and with blood pressure or heart issues — 2 to 4 days") : LL('Від 2 до 6 днів на тиждень', "2 to 6 days a week")); return; }
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
    /* дотик до нагадування про воду, коли застосунок уже відкритий (з 3.27.1): «Кухня» сьогодні — але не посеред тренування й анкети */
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.go === 'kitchen' && DB.active && P() && view !== 'workout' && view !== 'onboard') { view = 'kitchen'; ui.kDate = null; render(); window.scrollTo(0, 0); } });
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
  /* швидкий дотик по кнопці (з 3.27.3; слово Alexа 25.10: «Роби усе крім 2D»; дослідження — CLAUDE.md §11): після першого дотику застосунок перемальовує екран,
     і Safari на iPhone другий швидкий дотик (140–270 мс) рахує подвійним і збільшує сторінку (×1,6), хоч у body є touch-action: manipulation (замір 25.10,
     tests/browser/iosdt.js; не допомогли manipulation на кожній кнопці й maximum-scale=1). Короткий дотик одним пальцем по кнопці без зсуву —
     touchend.preventDefault() (Safari тоді не робить ні свого click, ні збільшення) і click() самим: дія та сама й одна (заміряно: 3 дотики — 3 дії, масштаб 1,00).
     Не чіпаємо: поля, списки, посилання, підписи (свої дії браузера), коли відкрито клавіатуру (зміна поля має зберегтись), затискання ≥ 0,6 с (підказка — 1 с),
     дотик, яким зупиняють прокрутку (≤ 0,25 с після неї), зсув > 10 px, кілька пальців */
  (function fastTap() {
    let st = null, scrolled = 0;
    const NATIVE = 'input, select, textarea, label, a[href], [contenteditable], summary';
    const typing = () => { const a = document.activeElement; return !!(a && a.matches && a.matches('input, select, textarea, [contenteditable]')); };
    document.addEventListener('scroll', () => { scrolled = performance.now(); }, { capture: true, passive: true });
    document.addEventListener('touchstart', (e) => {
      st = null; if (e.touches.length !== 1 || typing() || performance.now() - scrolled < 250) return;
      const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled || e.target.closest(NATIVE)) return;
      st = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), b };
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', (e) => { if (st && (e.touches.length !== 1 || Math.hypot(e.touches[0].clientX - st.x, e.touches[0].clientY - st.y) > 10)) st = null; }, { capture: true, passive: true });
    document.addEventListener('touchcancel', () => { st = null; }, { capture: true, passive: true });
    document.addEventListener('touchend', (e) => {
      const s = st; st = null; if (!s || e.touches.length) return;
      const t = e.changedTouches[0]; if (performance.now() - s.t > 600 || Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10 || !s.b.isConnected) return;
      const at = document.elementFromPoint(t.clientX, t.clientY); if (!at || at.closest('button') !== s.b) return;
      e.preventDefault(); s.b.click();
    }, { capture: true, passive: false });
  })();
  if (DB.active && !DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(DB.active);
  if (DB.active) ENGINE.migrate(DB);
  themeApply(themeNow());
  render();
  initPacks();
  document.title = 'FORTES';  // назва застосунку (з 3.27.2; слово Alexа 25.10: «Замість слова Тренування має писатись FORTES. Це буде назва додатку») — однакова обома мовами
  { const TABS = { home: LL('Головна', 'Home'), plan: LL('План', 'Plan'), kitchen: LL('Кухня', 'Kitchen'), body: LL('Тіло', 'Body'), progress: LL('Прогрес', 'Progress'), more: LL('Більше', 'More') };
    document.querySelectorAll('#tabs button').forEach((b) => { const t = TABS[b.dataset.tab], n = [...b.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim()); if (t && n) n.textContent = t; }); }
  badgeSync(); setTimeout(() => remindSync(false), 1500);  // підписка iPhone могла злетіти — тихо поновити й оновити розклад
  window.__app = { PLAT, get installEv() { return installEv; }, set installEv(v) { installEv = v; }, askFake: (q, a, help) => { if (q) ASK.chat.push({ q, a, pcm: [], done: true, heard: false }); ASK.help = !!help; ASK.st = 'idle'; askDraw(); }, get ASK() { return ASK; }, get PLAY() { return PLAY; }, askHush: () => askHush(), askTurn: (q) => askTurn(q), liveEnded: (k, g) => liveEnded(k, g), get DB() { return DB; }, get T() { return T; }, get missed() { return Array.from(missedSegs); }, talk: (t) => talk(t), kPhotoFake: (items) => { if (!ui.kAdd) return; ui.kAdd.ph = kPhotoResult({}, items ? { items } : null); kAddDraw(); }, initPacks: () => initPacks(), render: () => render(), set view(v) { view = v; } };
};
