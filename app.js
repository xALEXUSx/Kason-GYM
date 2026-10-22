/* Журнал тренувань 3.0 — інтерфейс: режим «Тренер» з голосом, список, план, прогрес, тіло. Дані лише в цьому телефоні + резервна копія файлом. */
/* Запускає ACC (accounts.js) після вибору користувача й входу. */
window.APP_START = () => {
  'use strict';
  window.APP_STARTED = true;
  document.body.classList.add('started');
  const VERSION = '3.11.1';
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
    if (p.inv && ['5', '2.5', '1.25'].some((k) => Number(p.inv[k]) !== Number((a.inv || {})[k]))) patch.inv = { 5: p.inv[5], 2.5: p.inv[2.5], 1.25: p.inv[1.25] };
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

  /* ---------- утиліти ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => iso(new Date());
  const tms = (s) => new Date(s + 'T12:00:00').getTime();
  const dm = (s) => s.slice(8, 10) + '.' + s.slice(5, 7);
  const fmt = (x) => (x === null || x === undefined || x === '' ? '—' : String(Math.round(Number(x) * 100) / 100).replace('.', ','));
  const num = (v) => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const x = Number(s); return isFinite(x) ? x : null; };
  const plural = (n, a, b, c) => { const x = Math.abs(n) % 10, y = Math.abs(n) % 100; return n + ' ' + (x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c); };
  const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
  const DAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const DAYS_FULL = ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', 'пʼятницю', 'суботу'];
  const P = () => DB.profiles[DB.active];
  const G = () => PROGRAMS[DB.active];
  const S = () => DB.settings;
  const nextN = () => P().sessions.length + (P().offset || 0);
  /* назва тренування — і для старих записів, яких у програмі вже немає (Д1–Д3 після зміни днів чи анкети) */
  const woTitle = (w) => ((G().workouts || {})[w] || PROGRAMS.him.workouts[w] || {}).title || w;
  /* де було тренування — в історії, коли це не очевидно: «і вдома, і в залі» або місце інше, ніж у програмі зараз
     (змінили анкету: був зал — тепер дім); до 3.9.3 місце не зберігалось */
  const placeTag = (s) => (s.place && (G().gymWorkouts || s.place !== G().place) ? (s.place === 'gym' ? ' · зал' : ' · дім') : '');
  const mName = (id) => (MUSCLES.find((m) => m[0] === id) || [id, id])[1];
  function save() { if (!STORE.save(DB)) toast('Не вдалося зберегти в телефоні. Зробіть резервну копію в «Більше».'); }
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
  function audioMode() { try { if ('audioSession' in navigator) navigator.audioSession.type = S().voice.silent === false ? 'auto' : 'playback'; } catch (e) { /* немає */ } }
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
  function openSheet(html) { sheetEl.innerHTML = '<div class="grab"></div>' + html; document.body.classList.add('sheet'); }
  function closeSheet() { document.body.classList.remove('sheet'); kp = null; }
  sheetBg.addEventListener('click', closeSheet);

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
    if (left === 10 && T.total >= 30 && !T.said10 && T.kind === 'rest') { T.said10 = true; if (!speaking()) talk('Десять секунд.'); }
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
        ? ring + `<div><div class="tt">Час!</div><div class="tn">${esc(T.next || 'Наступний підхід')}</div></div><div class="tb2"><button type="button" data-t="x">Готово</button></div>`
        : ring + `<div><div class="tt" id="tLeft"></div><div class="tn">${esc(T.next ? 'Далі: ' + T.next : 'Відпочинок')}</div></div>
      <div class="tb2"><button type="button" data-t="-15">−15</button><button type="button" data-t="+15">+15</button><button type="button" data-t="x">✕</button></div>`;
    }
    const arc = document.getElementById('tArc'); if (arc) arc.setAttribute('stroke-dasharray', (c * f).toFixed(1) + ' ' + c.toFixed(1));
    if (state === 'al') {
      if (!T.alarmed) { T.alarmed = true; beep(); haptic(); if (T.kind === 'myo') talk('Ще від трьох до пʼяти повторень.'); else talk(T.next ? 'Час! ' + T.next.split(' · ')[0] + '.' : 'Час!'); }
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
    const go = () => { view = b.dataset.tab; render(); window.scrollTo(0, 0); };
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
    ({ onboard: rOnboard, home: rHome, workout: rWorkout, summary: rSummary, plan: rPlan, progress: rProgress, body: rBody, more: rMore }[view] || rHome)();
    updateRadio();
  }

  /* ---------- знайомство: анкета (усі поля обовʼязкові) ---------- */
  const QALL = ['who', 'body', 'goal', 'level', 'place', 'equip', 'limits', 'days', 'agree'];
  /* лише зал — без кроку «Що є вдома» */
  const qSteps = (a) => QALL.filter((x) => x !== 'equip' || a.place !== 'gym');
  const QFIELDS = { who: ['name', 'sex'], body: ['age', 'height', 'weight'], goal: ['goal'], level: ['level'], place: ['place'], equip: ['equip'], limits: ['limits'], days: ['days'], agree: ['agree'] };
  function qState() {
    if (!ui.q) {
      const acc = STORE.account(STORE.current) || {}, old = DB.custom && DB.custom.answers;
      ui.q = { step: 0, err: false, edit: !!old, a: old ? JSON.parse(JSON.stringify(old)) : { name: acc.name && acc.name !== 'Новий акаунт' ? acc.name : '', equip: [], limits: [], days: [], agree: false } };
      const p = P(); if (!ui.q.a.inv) { ui.q.a.handle = p ? p.handle : 1; ui.q.a.inv = p ? Object.assign({}, p.inv) : { 5: 4, 2.5: 8, 1.25: 4 }; }
    }
    return ui.q;
  }
  /* поточні значення полів вводу — у відповіді (і під час набору, і перед «Далі») */
  function qRead() {
    const q = qState(), a = q.a, v = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; };
    if (v('qName') !== undefined) a.name = v('qName').trim();
    ['age', 'height', 'weight'].forEach((k) => { const x = v('q' + k); if (x !== undefined) a[k] = num(x); });
    if (v('qHandle') !== undefined) a.handle = num(v('qHandle'));
    [['5', 'qI5'], ['2.5', 'qI25'], ['1.25', 'qI125']].forEach(([k, id]) => { const x = v(id); if (x !== undefined) a.inv[k] = num(x); });
  }
  function qErrors(step) {
    const a = qState().a, e = GEN.check(a).errors, out = {};
    QFIELDS[step].forEach((k) => { if (e[k]) out[k] = e[k]; });
    if (step === 'equip' && a.equip.indexOf('db') >= 0) {
      if (!(a.handle >= 0 && a.handle <= 10)) out.handle = 'Вага грифа — від 0 до 10 кг';
      if (['5', '2.5', '1.25'].some((k) => !(a.inv[k] >= 0 && a.inv[k] <= 40 && Number.isInteger(a.inv[k])))) out.inv = 'Кількість дисків — ціле число від 0 до 40';
      else if (!(a.inv['5'] + a.inv['2.5'] + a.inv['1.25'] > 0)) out.inv = 'Вкажіть, скільки дисків є';
      else if (!ENGINE.capOf(a.inv)) out.inv = 'Потрібна хоча б пара однакових дисків — по одному на кожен бік грифа';
    }
    return out;
  }
  function rOnboard() {
    const q = qState(), a = q.a, QS = qSteps(a), step = QS[q.step], errs = q.err ? qErrors(step) : {};
    /* кілька відповідей (обладнання, здоровʼя) — з галочкою */
    const opt = (act, v, label, sub, on) => { const m = act === 'qLimit' || act === 'qEquip';
      return `<button type="button" class="qopt${m ? ' multi' : ''}${on ? ' on' : ''}" data-act="${act}" data-v="${v}" ${m ? `role="checkbox" aria-checked="${on}"` : `aria-pressed="${on}"`}><b>${label}</b>${sub ? `<span class="small muted">${sub}</span>` : ''}</button>`; };
    const err = (k) => (errs[k] ? `<p class="qerr">${esc(errs[k])}</p>` : '');
    const numIn = (id, label, val, mode) => `<label class="f" for="${id}">${label}</label><input id="${id}" inputmode="${mode || 'numeric'}" autocomplete="off" value="${val === null || val === undefined || isNaN(val) ? '' : fmt(val)}">`;
    let body = '';
    if (step === 'who') body = `<h1>Як вас звати?</h1><p class="muted small">Імʼя бачитимете на екрані входу.</p>
      <label class="f" for="qName">Імʼя</label><input id="qName" maxlength="24" autocomplete="given-name" value="${esc(a.name || '')}">${err('name')}
      <h2>Стать</h2><div class="grid2">${opt('qSex', 'm', 'Чоловік', '', a.sex === 'm')}${opt('qSex', 'f', 'Жінка', '', a.sex === 'f')}</div>${err('sex')}`;
    else if (step === 'body') body = `<h1>Про вас</h1><p class="muted small">Потрібно, щоб розрахувати навантаження й харчування.</p>
      ${numIn('qage', 'Вік, років', a.age)}${err('age')}${numIn('qheight', 'Зріст, см', a.height)}${err('height')}${numIn('qweight', 'Вага, кг', a.weight, 'decimal')}${err('weight')}`;
    else if (step === 'goal') body = `<h1>Ваша мета</h1><div class="pick">${[['loss', 'Схуднути', 'менше жиру, більше сил'], ['muscle', 'Набрати мʼязи', 'більше обʼєму й сили'], ['health', 'Сила й здоровʼя', 'міцне тіло без крайнощів'], ['posture', 'Спина й осанка', 'рівна спина, менше болю від сидіння']].map(([v, l, d]) => opt('qGoal', v, l, d, a.goal === v)).join('')}</div>${err('goal')}`;
    else if (step === 'level') body = `<h1>Досвід тренувань</h1><div class="pick">${opt('qLevel', 'new', 'Новачок', 'або перерва понад пів року', a.level === 'new')}${opt('qLevel', 'exp', 'Тренуюсь регулярно', 'пів року й більше без перерв', a.level === 'exp')}</div>${err('level')}`;
    else if (step === 'equip') {
      const db = a.equip.indexOf('db') >= 0, mk = Object.keys(GEN.MACH), allM = mk.every((k) => a.equip.indexOf(k) >= 0);
      body = `<h1>Що є вдома</h1><p class="muted small">Можна обрати кілька. Для тяг (спина) потрібні гантелі, петля або блок.</p>
      <div class="pick">${opt('qEquip', 'db', 'Гантелі з дисками', 'розбірні: гриф + диски', db)}${opt('qEquip', 'band', 'Петля-еспандер', 'резинка з кріпленням до дверей', a.equip.indexOf('band') >= 0)}</div>${err('equip')}
      ${db ? `<div class="card"><b>Ваші гантелі</b>${numIn('qHandle', 'Вага одного грифа без дисків, кг', a.handle, 'decimal')}${err('handle')}
        <label class="f">Скільки дисків разом на обидві гантелі</label><div class="grid3"><div>${numIn('qI5', '5 кг', a.inv['5'])}</div><div>${numIn('qI25', '2,5 кг', a.inv['2.5'])}</div><div>${numIn('qI125', '1,25 кг', a.inv['1.25'])}</div></div>${err('inv')}</div>` : ''}
      <h2>Тренажери вдома</h2><p class="muted small">Ті самі вправи, що в залі: історія й рекорди спільні, вагу застосунок рахує окремо для дому й залу. Додати чи прибрати можна будь-коли: «Більше» → «Обладнання вдома».</p>
      <button type="button" class="wide${allM ? ' pri' : ''}" data-act="qEquipAll" aria-pressed="${allM}">${allM ? '✓ ' : ''}Усе, як у залі</button><p></p>
      <div class="grid2">${mk.map((k) => opt('qEquip', k, GEN.MACH[k][0], GEN.MACH[k][1], a.equip.indexOf(k) >= 0)).join('')}</div>`;
    } else if (step === 'place') body = `<h1>Де тренуєтесь?</h1><p class="muted small">Програма підбере вправи під місце. «І вдома, і в залі» — перед кожним тренуванням застосунок спитає, де ви сьогодні.</p>
      <div class="pick">${[['home', 'Вдома', 'гантелі, петля або тренажери'], ['gym', 'У тренажерному залі', 'тренажери й блоки'], ['both', 'І вдома, і в залі', 'програма для обох місць']].map(([v, l, d]) => opt('qPlace', v, l, d, a.place === v)).join('')}</div>${err('place')}`;
    else if (step === 'limits') body = `<h1>Здоровʼя</h1><p class="muted small">Позначте все, що у вас є. Програма прибере або полегшить вправи, які можуть зашкодити.</p>
      <div class="pick">${[['back', 'Грижа або біль у спині', 'грижа, протрузія, часто болить поперек'], ['knees', 'Коліна', 'біль або травма коліна'], ['shoulders', 'Плечі', 'біль або травма плеча'], ['heart', 'Тиск або серце', 'гіпертонія, хвороби серця'], ['pregnant', 'Вагітність', ''], ['none', 'Нічого з цього', '']].filter(([v]) => v !== 'pregnant' || a.sex !== 'm').map(([v, l, d]) => opt('qLimit', v, l, d, a.limits.indexOf(v) >= 0)).join('')}</div>${err('limits')}`;
    else if (step === 'days') body = `<h1>Дні тренувань</h1><p class="muted small">Оберіть від 2 до 4 днів. Краще з днем відпочинку між ними.</p>
      <div class="qdays">${GEN.DAYS.map(([d, l]) => opt('qDay', d, l, '', a.days.indexOf(d) >= 0)).join('')}</div>${err('days')}`;
    else {
      const blk = GEN.check(a).block, lim = a.limits.filter((x) => x !== 'none');
      body = `<h1>Майже готово</h1><div class="card"><ul class="list">
        <li><span>Імʼя</span><b>${esc(a.name)}</b></li><li><span>Вік · зріст · вага</span><b>${fmt(a.age)} · ${fmt(a.height)} см · ${fmt(a.weight)} кг</b></li>
        <li><span>Мета</span><b>${esc(GEN.GOALS[a.goal] || '')}</b></li><li><span>Де</span><b>${esc((GEN.PLACES[a.place] || '').toLowerCase())}</b></li>${a.place === 'gym' ? '' : `<li><span>Обладнання вдома</span><b>${esc(kitText(a.equip))}</b></li>`}
        <li><span>Здоровʼя</span><b>${lim.length ? lim.map((x) => ({ back: 'спина', knees: 'коліна', shoulders: 'плечі', heart: 'тиск/серце', pregnant: 'вагітність' }[x])).join(', ') : 'без обмежень'}</b></li>
        <li><span>Дні</span><b>${GEN.DAYS.filter(([d]) => a.days.indexOf(d) >= 0).map(([, l]) => l).join(', ')}</b></li></ul></div>
        ${blk ? `<div class="note b small">${esc(blk)}</div>` : ''}
        ${lim.some((x) => x === 'back' || x === 'heart') && !blk ? '<div class="note w small">Перед стартом покажіть програму лікарю: при болю в спині чи проблемах із тиском це розумна страховка.</div>' : ''}
        <label class="chk"><input type="checkbox" id="qAgree"${a.agree ? ' checked' : ''}><span>Розумію: застосунок не замінює лікаря. При болю під час вправи — зупиняюсь.</span></label>${err('agree')}`;
    }
    const last = q.step === QS.length - 1;
    app.innerHTML = `<div class="brand">${MARK}<b>Тренування</b></div>
      <div class="qprog" aria-hidden="true"><i style="width:${Math.round((q.step + 1) / QS.length * 100)}%"></i></div><p class="tiny muted">Крок ${q.step + 1} з ${QS.length}${q.edit ? ' · зміна анкети' : ''}</p>
      ${body}
      <div class="qnav">${q.step ? '<button type="button" class="ghost" data-act="qBack">Назад</button>' : (q.edit ? '<button type="button" class="ghost" data-act="qCancel">Скасувати</button>' : '<span></span>')}
      <button type="button" class="pri big" data-act="qNext">${last ? (q.edit ? 'Оновити програму' : 'Скласти програму') : 'Далі'}</button></div>
      ${q.step || q.edit ? '' : '<p></p><label class="btn ghost" style="display:block;text-align:center">Є резервна копія? Відновити<input type="file" id="restoreIn" accept=".json,application/json" style="display:none"></label>'}`;
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
    p.days = a.days.slice().sort(); p.handle = a.handle; p.inv = { 5: a.inv['5'], 2.5: a.inv['2.5'], 1.25: a.inv['1.25'] };
    p.me = Object.assign({}, p.me || {}, { height: a.height, age: a.age });
    if (!fresh) keepWeek(p, oldPw, PROGRAMS.me);
    if (p.draft) p.draft = null;
    /* новому користувачеві картка «Нове» ні до чого — для нього все нове */
    if (fresh && Object.keys(DB.profiles).length === 1) S().tour.v3 = true;
    DB.active = 'me'; ENGINE.migrate(DB); save();
    STORE.update(STORE.current, { name: a.name, sub: PROGRAMS.me.sub });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    ui.q = null; view = 'home'; render(); initPacks();
    toast(fresh ? 'Програму складено' : 'Програму оновлено — історія тренувань збережена');
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
    const mk = Object.keys(GEN.MACH).filter((k) => eq.indexOf(k) >= 0), parts = [eq.indexOf('db') >= 0 ? 'гантелі з дисками' : '', eq.indexOf('band') >= 0 ? 'петля' : ''];
    if (mk.length === Object.keys(GEN.MACH).length) parts.push('усі тренажери, як у залі');
    else if (mk.length) parts.push(short ? plural(mk.length, 'тренажер', 'тренажери', 'тренажерів') : mk.map((k) => GEN.MACH[k][0].toLowerCase()).join(', '));
    return parts.filter(Boolean).join(', ');
  };
  /* підказка-хмарка до числа ваги: на тренажері й еспандері — своя (загальна в tips.js — про диски на гантель) */
  const loadTip = (ex, what) => (isMach(ex) ? ` data-tip="Вага на тренажері чи блоці, кг${what}"` : ex.type === 'band' ? ` data-tip="Рівень еспандера: номер джгута або сума, якщо кілька разом${what}"` : '');
  /* крок ваги: тренажер — з ваг людини на ньому (ENGINE.machStep: її зал може мати 2,5 чи 4,5 замість 5), еспандер — рівень, гантелі — диски */
  /* place — де тренування (поки воно складається, чернетки ще немає — місце передають явно) */
  const loadStep = (ex, id, place) => (isMach(ex) ? ENGINE.machStep(ex, histAt(id, place || (P().draft || {}).place)) : ex.type === 'band' ? 1 : ENGINE.stepFor(P().inv));
  const loadCap = (ex) => (isMach(ex) ? ex.cap || 300 : hasKg(ex) ? G().cap : 99);
  const hasKg = (ex) => ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load);
  function loadText(ex, v) {
    if (ex.type === 'band') return v === null || v === undefined ? '—' : 'рів. ' + fmt(v);
    if (v === null || v === undefined || v === '') return ex.type === 'dbopt' ? 'без' : '—';
    return fmt(v);
  }
  function setText(ex, s) {
    if (!s) return '—';
    const r = s.reps === null || s.reps === undefined ? '—' : s.reps + (ex.type === 'time' ? 'с' : '');
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
  function discs(side) { if (!side.length) return ''; return '<span class="disc"><b></b>' + side.map((x) => `<i class="d${String(x).replace('.', '')}"></i>`).join('') + '</span>'; }
  function plateLine(ex, it, load) {
    if (!hasKg(ex) || load === null || load === undefined || load === '') return '';
    const pl = ENGINE.plates(load, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap);
    return `<span class="plt">${pl.ok ? (pl.side.length ? 'на кожен бік: ' + esc(pl.text) + ' ' + discs(pl.side) : 'лише гриф') : '⚠ ' + esc(pl.text)}</span>`;
  }

  /* ---------- чернетка тренування ---------- */
  function plateSide(ex, it, load) {
    if (!hasKg(ex) || load === null || load === undefined || load === '') return null;
    const pl = ENGINE.plates(load, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap);
    return pl.ok ? pl.side : null;
  }
  function makeItem(it, ss, plan, step, o) {
    const prog = G(), p = P(), ex = prog.ex[it.ex];
    const nS = prog.setsFor(it, plan.week), hist = histAt(it.ex, o.where);
    const sug = ENGINE.suggest(prog, it.ex, it, nS, hist, p.handle, plan.deload, step);
    const last = hist.length ? hist[hist.length - 1].sets : [];
    const sets = sug.sets.map((s, j) => { const pv = last[j] || last[last.length - 1] || null; return { type: 'N', load: s.load, reps: s.reps, rir: null, done: false, pr: [], prev: pv ? { load: pv.load, reps: pv.reps } : null, touched: false }; });
    let note = sug.note, skipped = !!it.optional;
    if (o.ra && o.ra.act === 'skip') { skipped = true; note = 'Сьогодні без цієї вправи — бережемо поперек.'; }
    if (o.ra && o.ra.act === 'light') {
      const st = isMach(ex) ? loadStep(ex, it.ex, o.where) : step;
      let less = false; sets.forEach((s) => { if (typeof s.load === 'number' && s.load > 0) { s.load = Math.max(0, Math.round((s.load - st) * 100) / 100); less = true; } });
      note = (less ? 'Спина ниє: вага на крок нижча, запас 3. ' : 'Спина ниє: запас 3, рух повільний і плавний. ') + note;
    }
    if (o.from) note = 'Замість «' + prog.ex[o.from].name + '». ' + note;
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
    const myo = !!prog.myoFrom && plan.week >= prog.myoFrom && !plan.deload;
    const list = ordered.map((o) => {
      const ra = ENGINE.readyAction(prog, o.it.ex, ready, present);
      const it = Object.assign({}, o.it); let from = null;
      if (ra && ra.act === 'swap') { from = it.ex; it.ex = ra.to; }
      return makeItem(it, o.ss, plan, step, { ra: ra && ra.act !== 'swap' ? ra : null, from, myo, where });
    });
    /* розминковий підхід — перед першою базовою вправою з вагою */
    for (const st of ENGINE.stepOrder(list)) {
      const it = list[st.i], ex = prog.ex[it.ex], fw = it.sets.find((s) => s.type !== 'W');
      const ws = ENGINE.warmups(ex, fw ? fw.load : null, step, prog.warm, isMach(ex) ? loadStep(ex, it.ex, where) : 0);
      if (ws.length) { it.sets = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true })).concat(it.sets); break; }
    }
    return { n, week: plan.week, cycle: plan.cycle, workout: wid, place: where, deload: plan.deload, date: today(), started: Date.now(), ready: ready || 'g', items: list, coach: { warm: false, myo: null, half: false, last: null } };
  }
  /* Текст для голосу: символи й скорочення — словами (5 хв → 5 хвилин, 20–30 с → від 20 до 30 секунд). */
  const sp = (t) => VOICE.norm(t);
  /* Голос: якщо для профілю є записаний пакет і в ньому є всі речення — грає запис; інакше системний голос. */
  const missedSegs = new Set();
  /* речення-вага з voice.target: «40 кілограмів.», «13 з половиною кілограма.», «6,8 кілограма.», «… дисків.» */
  const KG_SAY = /^\d+(,\d+)?( з половиною)? кілограм(а|и|ів)?( дисків)?\.$/, ON_SCREEN = 'Вага — на екрані.';
  const packId = () => { const v = S().voice; return v.packs && DB.active ? v.packs[DB.active] || '' : ''; };
  /* Хто зараз говорить і чому — видно в «Більше» → «Голосовий тренер» (щоб не гадати, чому звучить системний голос). */
  const voiceInfo = { mode: '', why: '' };
  function sysSay(text, why) { voiceInfo.mode = 'system'; voiceInfo.why = why; return VOICE.say(text); }
  function talk(t) {
    if (!S().voice.on) return false;
    const text = sp(t), id = packId();
    if (!id) return sysSay(text, VPACKS.length ? 'у налаштуваннях обрано системний голос' : 'записані голоси ще не завантажились');
    /* опис голосу ще не завантажився (перші секунди після запуску) — дочекатися, а не перемикатися на системний */
    if (!VOICEPACK.packs[id]) { VOICEPACK.load(id).then(() => talk(t), () => sysSay(text, 'записаний голос не завантажився — перевірте інтернет')); return true; }
    let segs = VOICE.split(text);
    /* вага, якої немає в записі (крок тренажера вашого залу 4,5 чи 6,8 кг, своя вага цифрами), не переводить усю фразу
       на системний голос: число видно на екрані — тренер каже «Вага — на екрані.» (поки її немає в записі — пропускає) */
    const miss = VOICEPACK.missing(id, segs);
    if (miss.length && miss.every((x) => KG_SAY.test(x))) {
      const alt = VOICEPACK.has(id, [ON_SCREEN]) ? ON_SCREEN : null;
      segs = segs.map((x) => (miss.indexOf(x) >= 0 ? alt : x)).filter((x, k, arr) => x && !(x === ON_SCREEN && arr[k - 1] === ON_SCREEN));
      if (!segs.length) return false;
    }
    if (!VOICEPACK.has(id, segs)) { VOICEPACK.missing(id, segs).forEach((x) => missedSegs.add(x)); VOICEPACK.stop(); return sysSay(text, 'цієї фрази немає в записі'); }
    VOICE.stop(); ensureAudio();
    VOICEPACK.play(id, segs, audio).then((ok) => { if (ok) { voiceInfo.mode = 'pack'; voiceInfo.why = ''; } else sysSay(text, VOICEPACK.lastError || 'запис не програвся'); });
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
    const id = packId();
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
    openSheet(`<b>Де тренуєтесь сьогодні?</b><p class="small muted">Від цього залежать вправи тренування.</p>
      <div class="pick">${[['home', 'Вдома', kit], ['gym', 'У залі', 'тренажери й блоки']].map(([v, l, d]) => `<button type="button" data-act="place" data-v="${v}" data-w="${wid || ''}"><b>${l}</b><span class="small muted">${d}</span></button>`).join('')}</div>`);
  }
  function startWorkout(wid, ready, place) {
    ensureAudio(); VOICE.unlock(); stopTimer();  // таймер від попереднього тренування не переносимо в нове
    P().draft = buildDraft(wid, ready, place); save(); view = 'workout'; render(); window.scrollTo(0, 0);
    const d = P().draft, prog = G(), mins = ENGINE.estimateMins(prog, d.items), nEx = d.items.filter((x) => !x.skipped).length;
    talk(woTitle(d.workout) + '. ' + nEx + ' ' + VOICE.plural(nEx, 'вправа', 'вправи', 'вправ') + '. Приблизно ' + mins + ' ' + VOICE.plural(mins, 'хвилина', 'хвилини', 'хвилин') + '.'
      + (ready === 'r' ? ' Сьогодні без вправ на поперек. ' + L('r', 0) : ready === 'y' ? ' Вправи на поперек сьогодні легше. ' + L('y', 0) : ' ') + (hard() ? L('start', d.n) : 'Починаємо.') + (S().mode === 'list' ? '' : ' Спершу розминка.'));
  }
  function draftStats(d) {
    let done = 0, total = 0;
    d.items.forEach((it) => { if (it.skipped) return; it.sets.forEach((s) => { total++; if (s.done) done++; }); });
    return { done, total };
  }
  function setName(it, k) {
    const s = it.sets[k]; if (!s) return '';
    return s.type === 'W' ? 'розминка' : s.type === 'D' ? 'дроп-сет' : 'підхід ' + it.sets.slice(0, k + 1).filter((x) => x.type !== 'W' && x.type !== 'D').length;
  }
  /* робочі підходи — без розминкових і дроп-сетів (дроп — продовження свого підходу) */
  const workCount = (it) => it.sets.filter((x) => x.type !== 'W' && x.type !== 'D').length;
  const curStep = (d) => ENGINE.stepOrder(d.items).find((st) => !d.items[st.i].sets[st.j].done) || null;
  function stepTitle(d, st) {
    const it = d.items[st.i], s = it.sets[st.j];
    return s.type === 'W' ? 'Розминковий підхід' : s.type === 'D' ? 'Дроп-сет' : 'Підхід ' + it.sets.slice(0, st.j + 1).filter((x) => x.type !== 'W' && x.type !== 'D').length + ' з ' + workCount(it);
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
  const volHi = () => DB.active === 'him' || (G().custom && DB.custom && DB.custom.answers.goal === 'muscle');
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
    if (s.type === 'M') t += ' Міо-підхід: до відмови, далі короткі паузи.';
    if (s.type === 'D') t += ' Одразу.';
    if (ex.spine && s.type !== 'W') t += ' Запас два.';
    if (it.ss && it.ss.k === 1) { const b = d.items[st.i + 1]; if (b && !b.skipped) t += ' Суперсет: одразу після — ' + G().ex[b.ex].name + '.'; }
    if (brief) return sp(t);
    const doneN = it.sets.filter((x) => x.done).length, lastWork = s.type !== 'W' && !it.sets.slice(st.j + 1).some((x) => x.type !== 'W');
    if (ex.spine && s.type !== 'W' && !it.sets.some((x) => x.done && x.type !== 'W')) t += ' ' + COACH.line('spine', G().sex);
    if (doneN === 0) {
      if (sc) t += ' ' + (full ? COACH.howText(sc) : 'Як: ' + sc.move);
      else t += ' ' + VOICE.firstSentence(ex.tip);
    } else if (doneN === 1 && sc && sc.dont) {
      t += ' ' + (full ? COACH.dontText(sc) : sc.dont[0][0] + ' — ' + sc.dont[0][1] + '.');
    } else if (lastWork && workCount(it) > 1) t += ' ' + L('last', d.n + st.i);
    else if (sc && sc.breath && full) t += ' ' + sc.breath;
    return sp(t);
  }
  /* розминка й заминка: для «і вдома, і в залі» в день залу — залу (без квартири й крісла), інакше — з довідки програми */
  function warmSrc() { const d = P() && P().draft, prog = G(); return d && d.place === 'gym' && prog.gymWorkouts ? { id: 'warm', items: prog.gymWarm || GEN.GYM_WARM } : (prog.guide || []).find((g) => g.id === 'warm'); }
  function coolText() {
    const w = warmSrc(); if (!w) return '';
    const k = w.items.findIndex((x) => /^#Заминка/.test(x)); if (k < 0) return '';
    return w.items.slice(k + 1).join(' ');
  }
  function warmList() {
    const w = warmSrc(); if (!w) return { title: 'Розминка', items: [] };
    let title = 'Розминка'; const items = [];
    for (const x of w.items) {
      if (x.charAt(0) === '#') { if (/^#Заминка/.test(x)) break; title = x.slice(1); continue; }
      if (/^(У залі п|П)еред першою/.test(x)) continue;  // про розминковий підхід — лише на екрані, не голосом
      items.push(x);
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
    if (s.pr.length) toast('🏆 Рекорд: ' + ex.name, true);
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
    if (s.pr.length) talk(hard() ? COACH.line('pr', G().sex, d.n + i) : 'Новий рекорд!');
  }
  /* Тренер: позначка поточного підходу й наступний крок. */
  function coachDone() {
    const d = P().draft, cs = curStep(d); if (!cs) return;
    const s = d.items[cs.i].sets[cs.j];
    if (!(Number(s.reps) > 0)) { openKp(cs.i, cs.j, 'reps'); return; }
    VOICE.unlock(); markDone(cs.i, cs.j);
    const pr = s.pr.length ? (hard() ? COACH.line('pr', G().sex, d.n + cs.i) + ' ' : 'Новий рекорд! ') : '';
    if (s.type === 'M') { d.coach.myo = { i: cs.i, j: cs.j, k: 0 }; s.mini = []; save(); startTimer(15, 'Міо: пауза', 'myo'); rWorkout(); talk(pr + L('myo', 0) + 'Пауза 15 секунд. Глибоко дихай.'); return; }
    afterSet(d, cs.i, cs.j, pr);
  }
  function afterSet(d, i, j, pre) {
    const st = draftStats(d), nx = curStep(d);
    let t = pre || '';
    if (!d.coach.half && st.total >= 6 && st.done * 2 >= st.total && nx) { d.coach.half = true; t += hard() ? L('half', 0) : 'Половина тренування позаду. '; }
    save();
    if (!nx) { stopTimer(); rWorkout(); talk(t + 'Усі підходи зроблено. ' + (coolText() ? 'Заминка. ' + coolText() : 'Можна завершувати.')); return; }
    const left = ENGINE.stepOrder(d.items).filter((x) => !d.items[x.i].sets[x.j].done).length;
    const rest = ENGINE.restAfter(d.items, i, j), lastTxt = left === 1 ? 'Останній підхід тренування. ' : '';
    const nIt = d.items[nx.i], restLine = nIt.sets.filter((x) => x.done).length >= 2 ? L('rest', d.n + i + j) : '';
    if (rest > 0) { startTimer(rest, nextLabel(d), 'rest'); rWorkout(); talk(t + 'Відпочинок ' + VOICE.secs(rest) + '. ' + restLine + 'Далі. ' + lastTxt + setSpeech(d, nx)); }
    else { stopTimer(); rWorkout(); talk(t + 'Одразу. ' + lastTxt + setSpeech(d, nx)); }
  }
  function myoRep(r) {
    const d = P().draft, m = d.coach.myo; if (!m) return;
    const s = d.items[m.i].sets[m.j]; s.mini = (s.mini || []).concat([r]); m.k++; haptic(); save();
    if (m.k >= 3 || r < 3) return myoEnd();
    startTimer(15, 'Міо: пауза', 'myo'); rWorkout(); talk('Пауза 15 секунд.');
  }
  function myoEnd() {
    const d = P().draft, m = d.coach.myo; if (!m) return;
    d.coach.myo = null; stopTimer();
    const s = d.items[m.i].sets[m.j], tot = (s.mini || []).reduce((a, x) => a + x, 0);
    afterSet(d, m.i, m.j, 'Міо-підхід завершено. ' + (tot ? 'У міні-підходах — ' + VOICE.reps(tot) + '. ' : ''));
  }
  function onTimerEnd(kind) {
    const d = P() && P().draft; if (!d) return;
    if (kind === 'myo') { talk('Ще від трьох до пʼяти повторень.'); rWorkout(); return; }
    const cs = curStep(d);
    talk(cs ? 'Час! ' + G().ex[d.items[cs.i].ex].name + '.' : 'Час!');
    if (view === 'workout') rWorkout();
  }

  /* ---------- екран тренування ---------- */
  function rWorkout() { if (!P() || !P().draft) { view = 'home'; return render(); } document.body.classList.toggle('coachv', S().mode !== 'list'); return S().mode === 'list' ? rList() : rCoach(); }
  const ICON = {
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    coach: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    radio: '<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>'
  };
  function wbar(d, prog, st) {
    const list = S().mode === 'list';
    return `<div class="wbar"><button type="button" class="ghost" data-act="minimize" aria-label="згорнути">⌄</button>
      <div class="t"><b>${esc(woTitle(d.workout))}</b><span id="elapsed">0:00</span> · <span>${st.done}/${st.total}</span></div>
      <div class="wbr"><button type="button" class="ic${RADIO.state === 'playing' || RADIO.state === 'loading' ? ' rad' : ''}" id="radBtn" data-act="radio" aria-label="радіо">${ICON.radio}</button><button type="button" class="ic" id="modeBtn" data-act="mode" aria-label="${list ? 'режим тренера' : 'список усіх вправ'}">${list ? ICON.coach : ICON.list}</button><button type="button" class="pri" data-act="finish">Готово</button></div>
      <div class="wradio" id="wRadio">${radioRow()}</div></div>
      <div class="prog"><i style="width:${st.total ? Math.round(st.done / st.total * 100) : 0}%"></i></div>`;
  }
  function startElapsed(d) {
    const el = () => { const e = document.getElementById('elapsed'); if (!e) return; const s = Math.floor((Date.now() - d.started) / 1000); e.textContent = (s >= 3600 ? Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) : Math.floor(s / 60)) + ':' + pad(s % 60); };
    el(); clearInterval(elapsedT); elapsedT = setInterval(el, 1000);
  }
  const q = (k) => `<button type="button" class="q" data-act="gl" data-k="${k}" aria-label="що це">?</button>`;
  function phaseBox(d) {
    const plan = ENGINE.planFor(G(), d.n);
    return `<details class="card"><summary class="sp" style="list-style:none;cursor:pointer"><span><span class="chip a">Тиждень ${plan.week}${plan.cycle > 1 ? ' · цикл ' + plan.cycle : ''}</span> <span class="chip">${esc(plan.note.rir)}</span>${plan.deload ? ' <span class="chip w">легкий</span>' : ''}${d.ready && d.ready !== 'g' ? ' <span class="chip b">спина ' + (d.ready === 'y' ? '🟡' : '🔴') + '</span>' : ''}</span><span class="muted small">ⓘ</span></summary>
      <p class="small"><b>${esc(plan.note.phase)}.</b> ${esc(plan.note.text)}</p></details>`;
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
    const order = d.items.filter((x) => !x.skipped), out = [`<span class="chip">Вправа ${order.indexOf(it) + 1} з ${order.length}</span>`,
      s.type === 'W' ? `<button type="button" class="chip w" data-act="gl" data-k="warm">${esc(stepTitle(d, cs))} · ?</button>` : `<span class="chip a">${esc(stepTitle(d, cs))}</span>`];
    if (it.ss) out.push(`<button type="button" class="chip p" data-act="gl" data-k="ss">Суперсет ${it.ss.g}${it.ss.k} · ?</button>`);
    if (s.type === 'M') out.push('<button type="button" class="chip g" data-act="gl" data-k="myo">Міо-підхід · ?</button>');
    if (ex.spine && s.type !== 'W') out.push('<button type="button" class="chip b" data-act="gl" data-k="spine">Поперек · запас 2 · ?</button>');
    return `<div class="cchips">${out.join('')}</div>`;
  }
  function setCard(d, cs) {
    const prog = G(), it = d.items[cs.i], ex = prog.ex[it.ex], s = it.sets[cs.j], ij = `data-i="${cs.i}" data-j="${cs.j}"`;
    const vsel = ex.variants ? `<div class="seg">${ex.variants.map((v) => `<button type="button" class="${v.id === it.variant ? 'on' : ''}" data-act="variant" data-i="${cs.i}" data-v="${v.id}">${esc(v.label)}</button>`).join('')}</div>` : '';
    const tgt = ex.type === 'amrap' ? 'скільки зможете' : s.type === 'M' ? 'до відмови' : s.type === 'W' ? 'легко' : (it.min === it.max ? it.max : it.min + '–' + it.max) + (ex.type === 'time' ? ' с' : '');
    const mt = (w) => (isMach(ex) ? ` data-tip="${w} на крок тренажера: ${fmt(loadStep(ex, it.ex))} кг."` : '');
    const pm = (f) => `<div class="cpm"><button type="button" data-act="cstep" data-f="${f}" data-d="-1" ${ij} aria-label="менше"${f === 'load' ? mt('Менше') : ''}>−</button><button type="button" data-act="cstep" data-f="${f}" data-d="1" ${ij} aria-label="більше"${f === 'load' ? mt('Більше') : ''}>+</button></div>`;
    const kgOn = hasKg(ex) && s.load !== null && s.load !== undefined && s.load !== '';
    const boxL = isLoad(ex) ? `<div class="cbox"><span class="cl2">${ex.type === 'band' ? 'рівень еспандера' : isMach(ex) ? 'вага, кг' : 'диски на гантель, кг'}</span>
      <button type="button" class="cval" data-act="kp" data-f="load" ${ij}${loadTip(ex, '. Торкніться, щоб ввести інше число.')}>${esc(loadText(ex, s.load))}</button>${pm('load')}
      <span class="tiny muted"${isMach(ex) ? ' data-tip="Крок цього тренажера: на стільки кг змінюють вагу кнопки − і +. На вашому тренажері інший — введіть свою вагу цифрами: застосунок підхопить крок."' : ex.type === 'band' ? ' data-tip="Рівень — сума номерів джгутів, якщо їх кілька."' : ''}>${kgOn ? 'у руках ' + fmt(ENGINE.totalLoad(ex, s.load, P().handle, it.variant)) + ' кг' : ex.type === 'band' ? 'сума номерів джгутів' : isMach(ex) ? 'на тренажері · крок ' + fmt(loadStep(ex, it.ex)) : '&nbsp;'}</span></div>` : '';
    const boxR = `<div class="cbox"><span class="cl2">${ex.type === 'time' ? 'секунди' : 'повторення'}${ex.side ? ' · на бік' : ''}</span>
      <button type="button" class="cval" data-act="kp" data-f="reps" ${ij}>${s.reps === null || s.reps === undefined ? '—' : s.reps}</button>${pm('reps')}
      <span class="tiny muted">ціль: ${esc(tgt)}</span></div>`;
    const plat = ENGINE.plateau(ex, histAt(it.ex, (P().draft || {}).place), P().handle) ? '<div class="note w small">Плато: 3 тренування без зростання — опускання 3–4 с, пауза 2 с внизу або +1 підхід.</div>' : '';
    const userNote = P().notes[it.ex] ? `<div class="hint">📝 ${esc(P().notes[it.ex])}</div>` : '';
    const rir = (s.type === 'W' || ex.type === 'amrap') ? '' : `<div class="crir"><span class="small muted">Скільки ще могли б зробити? ${q('rir')}</span>
      <div class="seg">${[[0, '0'], [1, '1'], [2, '2'], [3, '3+']].map(([x, l]) => `<button type="button" class="${s.rir === x || (x === 3 && s.rir > 3) ? 'on' : ''}" data-act="crir" data-v="${x}" ${ij}>${l}</button>`).join('')}</div></div>`;
    return `<div class="coach">${chipsFor(d, cs)}
      <h1 class="cname">${esc(ex.name)}</h1><div class="cmus">${esc(ex.m.p.map(mName).join(' · '))}${ex.side ? ' · кожен бік' : ''}</div>
      ${vsel}${it.note ? `<div class="hint">💡 ${esc(it.note)}</div>` : ''}${plat}${userNote}
      <div class="ctarget${isLoad(ex) ? '' : ' one'}">${boxL}${boxR}</div>
      ${plateLine(ex, it, s.load)}
      ${s.prev && s.type !== 'W' ? `<button type="button" class="ghost cprev" data-act="copyprev" ${ij}>Минулого: ${esc(setText(ex, s.prev))} — повторити</button>` : ''}
      ${rir}
      <button type="button" class="pri wide big cdone" data-act="cdone">✓ ${s.type === 'W' ? 'Розминковий підхід зроблено' : 'Підхід виконано'}</button>
      ${techHtml(it.ex, !it.sets.some((x) => x.done))}
      <div class="grid3 cacts"><button type="button" data-act="say" data-what="tip">🔊 Як робити</button><button type="button" data-act="say" data-what="set">🔁 Повторити</button><button type="button" id="cMore" data-act="exmenu" data-i="${cs.i}">⋯ Ще</button></div>
      </div>${upcoming(d, cs)}${phaseBox(d)}`;
  }
  function skippedBox(d) {
    const sk = d.items.map((it, i) => ({ it, i })).filter((x) => x.it.skipped); if (!sk.length) return '';
    return `<h2>Пропущено й за бажанням</h2><div class="card"><ul class="list">${sk.map(({ it, i }) => `<li><span>${esc(G().ex[it.ex].name)}<div class="tiny muted">${it.optional ? 'за бажанням' : esc(it.note || 'пропущено')}</div></span><button type="button" class="sm" data-act="unskip" data-i="${i}">${it.optional ? 'Додати' : 'Повернути'}</button></li>`).join('')}</ul></div>`;
  }
  /* Техніка на екрані: навіщо, положення, рух, дихання, чого не робити й чому. */
  function techHtml(exId, open) {
    const sc = script(exId), ex = G().ex[exId];
    if (!sc) return ex.tip ? `<div class="note small">${esc(ex.tip)}</div>` : '';
    return `<details class="tech"${open ? ' open' : ''}><summary><b>Як робити й чого не робити</b><span class="small muted">${esc(sc.why)}</span></summary>
      <p><b>Положення.</b> ${esc(sc.setup)}</p><p><b>Рух.</b> ${esc(sc.move)}</p>${sc.breath ? `<p><b>Дихання.</b> ${esc(sc.breath)}</p>` : ''}
      ${sc.dont && sc.dont.length ? `<p><b>Чого не робити:</b></p><ul>${sc.dont.map((x) => `<li><b>${esc(x[0])}</b> — ${esc(x[1])}.</li>`).join('')}</ul>` : ''}
      ${ex.tip ? `<p class="tiny muted"><b>З програми:</b> ${esc(ex.tip)}</p>` : ''}</details>`;
  }
  function upcoming(d, cs) {
    const all = ENGINE.stepOrder(d.items).filter((x) => !d.items[x.i].sets[x.j].done), k = all.findIndex((x) => x.i === cs.i && x.j === cs.j);
    const nx = all.slice(k + 1, k + 4); if (!nx.length) return skippedBox(d);
    return `<h2>Далі</h2><div class="card"><ul class="list">${nx.map((x) => { const it = d.items[x.i], ex = G().ex[it.ex], s = it.sets[x.j]; return `<li><span>${esc(ex.name)}<div class="tiny muted">${esc(stepTitle(d, x))}${it.ss ? ' · суперсет ' + it.ss.g : ''}</div></span><span class="small">${esc(setText(ex, s))}</span></li>`; }).join('')}</ul></div>` + skippedBox(d);
  }
  function ringSvg() {
    const r = 52, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" style="stroke:var(--soft)" stroke-width="9"/><circle id="cArc" cx="60" cy="60" r="${r}" fill="none" style="stroke:var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>`;
  }
  function restCard(d) {
    const nx = curStep(d), prog = G(), last = d.coach.last;
    let nxt = '';
    if (nx) { const it = d.items[nx.i], ex = prog.ex[it.ex], s = it.sets[nx.j]; nxt = `<div class="cnext"><span class="tiny muted">Далі${it.ss ? ' · суперсет ' + it.ss.g : ''}</span><b>${esc(ex.name)}</b><span class="small">${esc(stepTitle(d, nx))} · ${esc(setText(ex, s))}${ex.side ? ' на бік' : ''}</span>${plateLine(ex, it, s.load)}</div>`; }
    return `<div class="coach crest"><div class="cring">${ringSvg()}<div class="ctime"><b id="cTime">0:00</b><span>відпочинок</span></div></div>
      <div class="grid3"><button type="button" data-act="tadd" data-v="-15">−15 с</button><button type="button" data-act="tadd" data-v="15">+15 с</button><button type="button" class="pri" data-act="tskip">Почати</button></div>
      ${nxt}${last ? `<button type="button" class="ghost wide" data-act="kp" data-f="reps" data-i="${last.i}" data-j="${last.j}">✎ Виправити щойно зроблений підхід</button>` : ''}
      <div class="grid2 cacts"><button type="button" data-act="say" data-what="set">🔊 Що далі</button><button type="button" data-act="mode">☰ Усі вправи</button></div></div>`;
  }
  function myoPauseCard(d) {
    const m = d.coach.myo, k = m ? m.k : 0;
    return `<div class="coach crest">${'<div class="cchips"><button type="button" class="chip g" data-act="gl" data-k="myo">Міо-підхід · ?</button></div>'}
      <div class="cring">${ringSvg()}<div class="ctime"><b id="cTime">0:15</b><span>пауза</span></div></div>
      <p class="center">Глибоко вдихніть 3–5 разів. Далі — 3–5 повторень тією самою вагою.</p><p class="center small muted">Міні-підходів: ${k} з 3</p>
      <button type="button" class="pri wide big" data-act="tskip">Почати раніше</button><p></p><button type="button" class="ghost wide" data-act="myoEnd">Досить — завершити міо</button></div>`;
  }
  function myoMiniCard(d) {
    const m = d.coach.myo, s = d.items[m.i].sets[m.j], ex = G().ex[d.items[m.i].ex];
    return `<div class="coach">${'<div class="cchips"><button type="button" class="chip g" data-act="gl" data-k="myo">Міо-підхід · ?</button></div>'}
      <h1 class="cname">${esc(ex.name)}</h1><div class="cmus">Міні-підхід ${m.k + 1} з 3 · та сама вага${(s.mini || []).length ? ' · вже: ' + s.mini.join(' + ') : ''}</div>
      <p class="small">Скільки повторень вийшло? Торкніться числа.</p>
      <div class="cnums">${[1, 2, 3, 4, 5, 6].map((r) => `<button type="button" data-act="myoRep" data-v="${r}">${r}</button>`).join('')}</div>
      <p class="tiny muted">Менше трьох — міо-підхід завершується сам: мʼяз уже втомлений достатньо.</p>
      <button type="button" class="ghost wide" data-act="myoEnd">Досить — завершити міо</button></div>`;
  }
  function warmCard() {
    const w = warmList();
    return `<div class="coach"><div class="cchips"><span class="chip a">Крок 1 · розминка</span></div><h1 class="cname">${esc(w.title)}</h1>
      <ul class="clist">${w.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button type="button" class="pri wide big" data-act="cwarm">✓ Розминку зроблено</button>
      <div class="grid2 cacts"><button type="button" data-act="say" data-what="warm">🔊 Прослухати</button><button type="button" data-act="cwarm" data-skip="1">Пропустити</button></div></div>${phaseBox(P().draft)}`;
  }
  function coolCard() {
    const c = coolText();
    return `<div class="coach"><div class="cchips"><span class="chip ok">Усі підходи зроблено</span></div><h1 class="cname">Майже все 🎉</h1>
      ${c ? `<p><b>Заминка.</b> ${esc(c)}</p>` : '<p>Можна завершувати тренування.</p>'}
      <button type="button" class="pri wide big" data-act="finish">Завершити тренування</button><p></p>
      <button type="button" class="ghost wide" data-act="mode">☰ Переглянути всі підходи</button></div>`;
  }

  /* --- режим «Список»: усі вправи й підходи --- */
  function exCard(d, i) {
    const it = d.items[i], prog = G(), ex = prog.ex[it.ex];
    const range = ex.type === 'amrap' ? 'скільки зможете, запас 2' : (it.min === it.max ? it.max : it.min + '–' + it.max) + (ex.type === 'time' ? ' с' : '');
    const mus = ex.m.p.map(mName).join(' · ');
    const ssb = it.ss ? `<span class="ssb">${it.ss.g}${it.ss.k}</span>` : '';
    if (it.skipped) {
      return `<div class="exc skip"><div class="exh"><div>${ssb}<h3 style="display:inline">${esc(ex.name)}</h3><div class="mus">${workCount(it)} × ${range}${it.optional ? ' · за бажанням' : ''}</div>${it.note && !it.optional ? `<div class="hint">${esc(it.note)}</div>` : ''}</div>
        <button type="button" class="sm" data-act="unskip" data-i="${i}">${it.optional ? 'Додати' : 'Повернути'}</button></div></div>`;
    }
    const plat = ENGINE.plateau(ex, histAt(it.ex, (P().draft || {}).place), P().handle) ? '<div class="note w small">Плато: 3 тренування без зростання — опускання 3–4 с, пауза 2 с внизу або +1 підхід.</div>' : '';
    let note = it.note || '';
    if (it.ex === 'goblet' && it.variant === 'g1' && /максимальна/.test(note)) note += ' Час переходити на «2 гантелі на плечах».';
    const vsel = ex.variants ? `<div class="seg">${ex.variants.map((v) => `<button type="button" class="${v.id === it.variant ? 'on' : ''}" data-act="variant" data-i="${i}" data-v="${v.id}">${esc(v.label)}</button>`).join('')}</div>` : '';
    const hdr = `<div class="tr h"><span>підхід</span><span>минулого</span><span${loadTip(ex, '.')}>${ex.type === 'band' ? 'рівень' : hasKg(ex) ? 'диски, кг' : isMach(ex) ? 'вага, кг' : ''}</span><span>${ex.type === 'time' ? 'секунди' : 'повтор.'}</span><span></span></div>`;
    const rows = it.sets.map((s, j) => {
      const lab = s.type === 'N' ? String(it.sets.slice(0, j + 1).filter((x) => x.type !== 'W').length) : ({ W: 'Р', D: 'Д', F: 'В', M: 'М' }[s.type]);
      const loadCell = isLoad(ex) ? `<button type="button" class="cl" data-act="kp" data-f="load" data-i="${i}" data-j="${j}"${loadTip(ex, '. Торкніться, щоб ввести інше число.')}>${esc(loadText(ex, s.load))}${hasKg(ex) && s.load !== null && s.load !== undefined && s.load !== '' ? '<small>+ гриф</small>' : ''}</button>` : '<span class="cl na">—</span>';
      const repCell = `<button type="button" class="cl" data-act="kp" data-f="reps" data-i="${i}" data-j="${j}">${s.reps === null || s.reps === undefined ? '—' : s.reps + (ex.type === 'time' ? ' с' : '')}${s.rir !== null && s.rir !== undefined ? `<small>запас ${s.rir >= 4 ? '4+' : s.rir}</small>` : ''}</button>`;
      const pr = s.pr && s.pr.length ? `<div class="prb">🏆 ${s.pr.map((t) => ({ e1rm: 'рекорд максимуму', weight: 'рекорд ваги', reps: 'рекорд повторень' }[t])).join(' · ')}</div>` : '';
      const mini = s.type === 'M' ? `<div class="prb mi"><button type="button" class="sm" data-act="minis" data-i="${i}" data-j="${j}">міні-підходи: ${(s.mini || []).length ? s.mini.join(' + ') : 'записати'}</button></div>` : '';
      return `<div class="tr${s.done ? ' dn' : ''}${s.pr && s.pr.length ? ' pr' : ''}"><button type="button" class="st ${s.type}" data-act="stype" data-i="${i}" data-j="${j}" aria-label="тип підходу">${lab}</button>
        <button type="button" class="pv" data-act="copyprev" data-i="${i}" data-j="${j}">${s.type === 'W' ? '' : esc(setText(ex, s.prev))}</button>${loadCell}${repCell}
        <button type="button" class="ck" data-act="done" data-i="${i}" data-j="${j}" aria-label="виконано">✓</button>${pr}${mini}</div>`;
    }).join('');
    const userNote = P().notes[it.ex] ? `<div class="hint">📝 ${esc(P().notes[it.ex])}</div>` : '';
    const firstWork = it.sets.find((s) => s.type !== 'W');
    return `<div class="exc${it.ss ? ' ss' : ''}">
      <div class="exh"><div>${ssb}<h3 style="display:inline">${esc(ex.name)}</h3><div class="mus">${esc(mus)} · ${workCount(it)} × ${range}${ex.side ? ' · на бік' : ''} · ${it.ss && it.ss.k === 1 ? 'одразу в пару' : 'відпочинок ' + it.rest + ' с'}${ex.spine ? ' · поперек: запас 2' : ''}</div></div>
      <button type="button" class="dots" data-act="exmenu" data-i="${i}" aria-label="меню вправи">⋯</button></div>
      ${vsel}${note ? `<div class="hint">💡 ${esc(note)}</div>` : ''}${plat}${userNote}
      <div class="tb">${hdr}${rows}</div>
      <div class="exf"><div class="row"><button type="button" class="sm" data-act="addset" data-i="${i}">+ Підхід</button></div>
      ${plateLine(ex, it, firstWork ? firstWork.load : null)}</div></div>`;
  }
  function rList() {
    const d = P().draft, prog = G(), st = draftStats(d);
    app.innerHTML = `${wbar(d, prog, st)}${phaseBox(d)}
      <p class="small muted">Літери підходів: <b>Р</b> розминка · <b>Д</b> дроп · <b>В</b> до відмови · <b>М</b> міо; цифра — робочий підхід.<br>💡 Не зрозуміло, що це? Затисніть будь-яку кнопку чи напис — зʼявиться підказка.</p>
      ${d.items.map((_, i) => exCard(d, i)).join('')}
      ${coolText() ? `<div class="note ok small"><b>Заминка:</b> ${esc(coolText())}</div>` : ''}
      <button type="button" class="pri wide big" data-act="finish">Завершити тренування</button><p></p>
      <button type="button" class="ghost wide" data-act="discard">Скасувати тренування</button>`;
    startElapsed(d); keepAwake(true);
  }
  /* Тип підходу: вибір зі зрозумілим поясненням замість перемикання букв наосліп */
  const SET_TYPES = [
    ['N', 'Робочий (цифра)', 'Звичайний підхід — саме він рахується в прогрес.'],
    ['W', 'Р — розминка', 'Легка вага, щоб розігріти мʼязи й суглоби. У прогрес не йде.'],
    ['D', 'Д — дроп', 'Одразу після підходу — ще один у легшому варіанті тією самою вагою (напр., з колін), без відпочинку.'],
    ['F', 'В — до відмови', 'Робите, доки виходить із правильною технікою, без запасу.'],
    ['M', 'М — міо', 'Підхід до відмови, далі 2–3 міні-підходи по 3–5 повторень з паузою 15 с.']];
  /* дроп-сет: одразу після підходу, без відпочинку, легше — як саме, залежить від обладнання */
  function dropHow(ex) {
    if (isMach(ex)) return 'Одразу після підходу, без відпочинку — ще один із легшою вагою: фіксатор на 1–2 кроки нижче (приблизно на чверть легше).';
    if (ex.type === 'band') return 'Одразу після підходу, без відпочинку — ще один із легшим опором: на рівень нижче або ближче до дверей.';
    return SET_TYPES.find((t) => t[0] === 'D')[2];
  }
  /* «Дроп-сет» у меню вправи — у фазі 3 (тижні 9–11), як у затвердженій програмі; не для вправ на поперек, не там, де програма без відмови,
     і не у вправах з міо-підходом (ізоляція вже має свій підхід до відмови) */
  function dropOk(it) {
    const prog = G(), ex = prog.ex[it.ex], d = P().draft, plan = ENGINE.planFor(prog, d.n);
    return !!prog.myoFrom && !ex.spine && plan.week >= 9 && plan.week <= 11 && !plan.deload && ex.type !== 'time'
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
    openSheet(`<div class="sp"><b>Тип підходу</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      ${spine ? '<p class="small muted">Вправа навантажує поперек — лише звичайні й розминкові підходи, щоб берегти спину.</p>' : noFail ? '<p class="small muted">Ваша програма — без підходів до відмови (тиск чи серце або вік від 55): лише звичайні й розминкові.</p>' : ''}
      ${list.map((t) => `<button type="button" class="wide tsel${(s.type || 'N') === t[0] ? ' on' : ''}" data-act="stypeSet" data-i="${i}" data-j="${j}" data-t="${t[0]}"><b>${t[1]}</b><span class="small muted">${t[0] === 'D' ? dropHow(ex) : t[2]}</span></button>`).join('')}`);
  }
  function minisSheet(i, j, keep) {
    /* keep — перемальовуємо після вибору: беремо вже вибране, а не збережене */
    const s = P().draft.items[i].sets[j], m = keep && ui.minis ? ui.minis.m : (s.mini || []).slice();
    ui.minis = { i, j, m };
    const row = (k) => `<div class="sp" style="margin:8px 0"><span>Міні-підхід ${k + 1}</span><div class="row">${[0, 1, 2, 3, 4, 5, 6].map((r) => `<button type="button" class="sm${m[k] === r ? ' pri' : ''}" data-act="miniSet" data-k="${k}" data-v="${r}">${r}</button>`).join('')}</div></div>`;
    openSheet(`<div class="sp"><b>Міо: міні-підходи</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div><p class="small muted">Після основного підходу — пауза 15 с і 3–5 повторень; до трьох разів. 0 — не робили.</p>${[0, 1, 2].map(row).join('')}
      <button type="button" class="pri wide" data-act="miniSave">Зберегти</button>`);
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
    if (!sets.length) { if (confirm('Жодного підходу не відмічено. Закрити тренування без збереження?')) { p.draft = null; save(); stopTimer(); view = 'home'; render(); } return; }
    const st = draftStats(d);
    if (st.done < st.total && !confirm('Відмічено ' + st.done + ' з ' + st.total + ' підходів. Завершити тренування?')) return;
    const sess = { id: Date.now(), date: d.date, n: d.n, week: d.week, workout: d.workout, place: d.place === 'gym' || d.place === 'home' ? d.place : undefined, deload: d.deload, ready: d.ready || 'g', mins: Math.max(1, Math.round((Date.now() - d.started) / 60000)), sets, prs: prList.reduce((a, x) => a + x.types.length, 0), prList };
    p.sessions.push(sess); p.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    p.draft = null; save(); stopTimer(); keepAwake(false);
    ui.summary = sess.id; view = 'summary'; render(); window.scrollTo(0, 0);
    talk('Тренування завершено. ' + VOICE.cap(sess.mins + ' ' + VOICE.plural(sess.mins, 'хвилина', 'хвилини', 'хвилин')) + '. ' + (sess.prs ? 'Рекордів: ' + sess.prs + '. ' : '') + (hard() ? COACH.line('end', G().sex, sess.n) : 'Гарна робота!'));
  }

  /* ---------- клавіатура (шторка) ---------- */
  function openKp(i, j, f) {
    const d = P().draft, it = d.items[i], s = it.sets[j], ex = G().ex[it.ex];
    const isRep = f === 'reps';
    const cur = isRep ? s.reps : s.load;
    kp = { i, j, f, str: cur === null || cur === undefined ? '' : String(cur).replace('.', ','), rir: s.rir, fresh: true };
    drawKp();
  }
  function drawKp() {
    const d = P().draft, it = d.items[kp.i], s = it.sets[kp.j], ex = G().ex[it.ex], isRep = kp.f === 'reps';
    const step = isRep ? (ex.type === 'time' ? 5 : 1) : loadStep(ex, it.ex);
    const unit = isRep ? (ex.type === 'time' ? 'с' : 'повт.') : (ex.type === 'band' ? 'рівень' : isMach(ex) ? 'кг' : 'кг дисків на гантель');
    const title = esc(G().ex[it.ex].name) + ' · ' + setName(it, kp.j);
    const v = num(kp.str);
    let extra = '';
    if (!isRep && hasKg(ex)) {
      const pl = v === null ? null : ENGINE.plates(v, P().inv, ENGINE.dbCountOf(ex, it.variant), G().cap);
      const tot = v === null ? 0 : ENGINE.totalLoad(ex, v, P().handle, it.variant);
      extra = `<p class="small muted" style="text-align:center">${v === null ? (ex.type === 'dbopt' ? 'без гантелі' : '') : 'усього в руках: ' + fmt(tot) + ' кг'}${pl ? ' · ' + (pl.ok ? (pl.side.length ? 'на бік: ' + esc(pl.text) + ' ' + discs(pl.side) : 'лише гриф') : '⚠ ' + esc(pl.text)) : ''}</p>`;
    }
    const quick = [];
    if (s.prev) quick.push(['минулого: ' + (isRep ? s.prev.reps : loadText(ex, s.prev.load)), isRep ? s.prev.reps : s.prev.load]);
    if (!isRep && ex.type === 'dbopt') quick.push(['без гантелі', '']);
    if (!isRep && hasKg(ex)) quick.push(['лише гриф', 0]);
    if (isRep && it.max > 0) { for (let r = Math.max(1, it.min - 2); r <= it.max + 2 && quick.length < 9; r++) quick.push([String(r), r]); }
    const rir = isRep ? `<label class="f">Запас повторень (скільки ще могли б)</label><div class="seg">${[[null, '—'], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']].map(([x, l]) => `<button type="button" class="${kp.rir === x ? 'on' : ''}" data-k="rir" data-v="${x === null ? '' : x}">${l}</button>`).join('')}</div>` : '';
    openSheet(`<div class="sp"><b class="small">${title}</b><button type="button" class="sm ghost" data-k="close">Закрити</button></div>
      <div class="kv"${!isRep && isMach(ex) ? ' data-tip="Число, яке ви вводите: вага на тренажері чи блоці, кг."' : ''}>${kp.str === '' ? (isRep ? '—' : ex.type === 'dbopt' ? 'без' : '—') : esc(kp.str)} <small>${unit}</small></div>${extra}
      <div class="quick">${quick.map(([l, x]) => `<button type="button" class="sm" data-k="set" data-v="${x === null || x === undefined ? '' : x}">${esc(l)}</button>`).join('')}</div>${rir}
      <div class="keys">${['1', '2', '3', '−', '4', '5', '6', '+', '7', '8', '9', '⌫', isRep ? '' : ',', '0', '', 'ok'].map((k) => {
        if (k === '') return '<span></span>';
        if (k === 'ok') return '<button type="button" class="ok" data-k="ok">Готово</button>';
        if (k === '−' || k === '+') return `<button type="button" class="op" data-k="${k === '+' ? 'inc' : 'dec'}">${k}${fmt(step)}</button>`;
        if (k === '⌫') return '<button type="button" class="op" data-k="bs" aria-label="стерти">⌫</button>';
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
    if (k === 'inc' || k === 'dec') { const v = num(kp.str) || 0; const nv = Math.max(0, Math.round((v + (k === 'inc' ? kp.step : -kp.step)) * 100) / 100); kp.str = String(nv).replace('.', ','); kp.fresh = false; }
    if (k === 'set') { kp.str = b.dataset.v === '' ? '' : String(b.dataset.v).replace('.', ','); kp.fresh = false; }
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
    app.innerHTML = `<div class="card hero" style="margin-top:calc(14px + env(safe-area-inset-top))"><div class="chip">Тиждень ${s.week}</div><h1>Тренування завершено 🎉</h1><p class="muted">${esc(woTitle(s.workout))} · ${dm(s.date)}</p></div>
      <div class="grid2"><div class="stat"><b>${s.mins} хв</b><span>тривалість</span></div><div class="stat"><b>${work}</b><span>робочих підходів</span></div>
      <div class="stat"><b>${vol ? fmt(Math.round(vol)) + ' кг' : '—'}</b><span>обсяг${dv !== null ? ' · ' + (dv >= 0 ? '+' : '') + dv + ' % до минулого' : ''}</span></div><div class="stat"><b>${s.prs || 0}</b><span>рекордів</span></div></div>
      ${s.prList && s.prList.length ? `<h2>🏆 Рекорди</h2><div class="card"><ul class="list">${s.prList.map((x) => `<li><span>${esc(prog.ex[x.ex].name)}</span><span class="chip g">${x.types.map((t) => ({ e1rm: 'максимум', weight: 'вага', reps: 'повторення' }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''}
      <h2>Що попрацювало</h2><div class="card">${CHARTS.bodyMap(ms, 6)}</div>
      <p class="small muted">Наступне: ${esc(woTitle(np.workout))} (тиждень ${np.week}).</p>
      <button type="button" class="wide" data-act="shareSum">Поділитися підсумком</button><p></p>
      <button type="button" class="pri wide big" data-act="sumDone">Готово</button>`;
  }
  function shareSummary() {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === ui.summary); if (!s) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    const F = (w, px) => w + ' ' + px + 'px Manrope, -apple-system, Arial';
    g.fillStyle = '#14514f'; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#c8a96a'; g.fillRect(80, 200, 140, 6);
    g.fillStyle = '#fff'; g.font = F(700, 64); g.fillText('Тренування завершено', 80, 170);
    g.font = F(400, 40); g.globalAlpha = 0.9; g.fillText(woTitle(s.workout) + ' · ' + dm(s.date), 80, 240); g.globalAlpha = 1;
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    [[s.mins + ' хв', 'тривалість'], [String(s.sets.filter((x) => x.type !== 'W').length), 'підходів'], [vol ? Math.round(vol) + ' кг' : '—', 'обсяг'], [String(s.prs || 0), 'рекордів']].forEach((x, k) => {
      const X = 80 + (k % 2) * 480, Y = 380 + Math.floor(k / 2) * 240;
      g.fillStyle = '#0d3937'; g.fillRect(X, Y, 440, 200); g.fillStyle = '#1c4b49'; g.fillRect(X, Y, 6, 200);
      g.fillStyle = '#fff'; g.font = F(700, 84); g.fillText(x[0], X + 36, Y + 110); g.fillStyle = '#e8f0ef'; g.font = F(400, 34); g.fillText(x[1], X + 36, Y + 165); g.fillStyle = '#fff';
    });
    g.font = F(500, 40); let y = 920;
    (s.prList || []).slice(0, 5).forEach((x) => { g.fillText('🏆 ' + prog.ex[x.ex].name, 80, y); y += 64; });
    g.font = F(700, 32); g.globalAlpha = 0.85; g.fillText('Тренування', 80, 1280);
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
    openSheet(`<div class="sp"><b>${esc(sec.title)}</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>${guideBody(sec)}`);
  }
  function guideChips(ids) {
    const list = (G().guide || []).filter((g) => !ids || ids.indexOf(g.id) >= 0);
    return '<div class="quick">' + list.map((g) => `<button type="button" class="sm" data-act="guide" data-id="${g.id}">${esc(g.title)}</button>`).join('') + '</div>';
  }

  /* ---------- словник і навчання ---------- */
  function glSheet(k) {
    const g = GLOSSARY[k]; if (!g) return;
    openSheet(`<div class="sp"><b>${esc(g[0])}</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div><p>${esc(g[1])}</p>
      <button type="button" class="wide" data-act="say" data-what="gl" data-k="${k}">🔊 Прослухати</button>`);
  }
  function glAll() {
    openSheet(`<div class="sp"><b>Словник</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <ul class="list">${Object.keys(GLOSSARY).map((k) => `<li style="display:block"><b>${esc(GLOSSARY[k][0])}</b><div class="small muted" style="margin-top:3px">${esc(GLOSSARY[k][1])}</div></li>`).join('')}</ul>`);
  }
  const TOURS = {
    home: [['.hero .pri', 'Почніть тут. Застосунок спитає про спину, підставить вагу й поведе тренування голосом — крок за кроком.'],
      ['.dly', 'Щоденні звички: відмічайте галочкою. «Як робити» — коротка інструкція.'],
      ['#tabs', 'План — 12 тижнів і історія. Прогрес — графіки й рекорди. Тіло — заміри, харчування, фото. Більше — голос і налаштування.']],
    /* текст про вагу — за тим, що в рамці: диски, тренажер, еспандер чи лише повторення */
    coach: [['.ctarget', () => { const l = (document.querySelector('.ctarget .cl2') || {}).textContent || '', t = ' Міняйте кнопками − і + або торкніться числа.';
      return /диски/.test(l) ? 'Ціль підходу. Вага — скільки дисків на гантель; поруч — повторення.' + t : /вага/.test(l) ? 'Ціль підходу. Вага на тренажері чи блоці, кг; поруч — повторення.' + t
        : /еспандер/.test(l) ? 'Ціль підходу. Рівень еспандера; поруч — повторення.' + t : 'Ціль підходу: ' + (/секунди/.test(l) ? 'секунди.' : 'повторення.') + t; }],
      ['.coach .plt', 'Скільки дисків надіти з кожного боку гантелі.'],
      ['.cdone', 'Зробили підхід — натисніть. Тренер сам запустить відпочинок і скаже, що далі.'],
      ['#cMore', 'Тут — як робити, заміна вправи, пропуск, нотатка.'],
      ['#modeBtn', 'Перемикач: усі вправи списком, як у класичному журналі. Повернутися — тією самою кнопкою.']]
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
      <div class="sp"><span class="tiny">${pos} з ${vis.length}</span><span class="row"><button type="button" class="sm ghost" data-tour="skip">Пропустити</button><button type="button" class="sm pri" data-tour="next">${pos === vis.length ? 'Зрозуміло' : 'Далі'}</button></span></div></div>`;
    document.body.appendChild(ov);
    /* дотик повз підказку теж закриває навчання — щоб екран ніколи не «завис» під затемненням */
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-tour]'); if (!b) { if (!e.target.closest('.tbx')) { ov.remove(); S().tour[id] = true; save(); } return; } if (b.dataset.tour === 'skip') { ov.remove(); S().tour[id] = true; save(); } else tour(id, k + 1); });
  }
  function whatsNew() {
    openSheet(`<div class="sp"><b>Що вміє застосунок</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <ul class="list">
        <li style="display:block"><b>📝 Програма за анкетою</b><div class="small muted">Складається під вас: мета, досвід, обладнання, здоровʼя, дні тренувань. Змінити відповіді — «Більше» → «Змінити анкету й оновити програму»; історія тренувань лишається.</div></li>
        <li style="display:block"><b>🏋️ Удома й у залі</b><div class="small muted">В анкеті — де тренуєтесь. У залі ті самі тренування на тренажерах і блоках; «і вдома, і в залі» — перед тренуванням застосунок спитає, де ви сьогодні. Тренажер зайнятий — «Ще» → «Замінити». Інший крок ваги у вашому залі (2,5 чи 4,5 кг) застосунок підхоплює з ваших ваг.</div></li>
        <li style="display:block"><b>⬇ Дроп-сет і розминка за станом</b><div class="small muted">У фазі 3 (тижні 9–11) — «⋯ Ще» → «Дроп-сет»: одразу після останнього підходу, без відпочинку, легше (на тренажері — фіксатор на 1–2 кроки нижче). Розминка: без обмежень, до 55 років і до 100 кг — 3 хв (тіло розігріває перший легкий підхід), інакше — повні 10 хв.</div></li>
        <li style="display:block"><b>🏠 Тренажери вдома</b><div class="small muted">У «Що є вдома» — ті самі тренажери, що в залі (або «Усе, як у залі»): удома програма бере їх першими; історія й рекорди спільні з залом, вага — окремо для дому й залу. Додати чи прибрати — будь-коли: «Більше» → «Обладнання вдома»; історія й рекорди лишаються.</div></li>
        <li style="display:block"><b>⚙️ Одне джерело</b><div class="small muted">Дні тренувань, гриф і диски («Більше»), зріст і вік («Харчування») одразу йдуть у програму й в анкету; поточний тиждень зберігається.</div></li>
        <li style="display:block"><b>🍽 Норма одразу</b><div class="small muted">Норма калорій і білка — одразу за вагою з анкети; після зважувань у «Замірах» — за ними.</div></li>
        <li style="display:block"><b>🔓 Без коду й Face ID</b><div class="small muted">Застосунок відкривається одразу: дані лише в цьому телефоні, а телефон захищений своїм Face ID чи кодом.</div></li>
        <li style="display:block"><b>🎙 Тренер голосом</b><div class="small muted">Веде тренування крок за кроком: навіщо вправа, як робити, чого не робити, вага й диски, відпочинок, «Час!», рекорди. Характер — жорсткий з гумором. Природний записаний голос: чоловічий і жіночий («Більше» → «Голосовий тренер»).</div></li>
        <li style="display:block"><b>📻 Радіо для тренувань</b><div class="small muted">Кнопка «♪»: 11 станцій. Коли говорить тренер, музика плавно притихає.</div></li>
        <li style="display:block"><b>🟢🟡🔴 Питання про спину</b><div class="small muted">Якщо в анкеті позначено спину: перед тренуванням застосунок питає, як вона, і сам полегшує або прибирає вправи на поперек.</div></li>
        <li style="display:block"><b>⚡ Коротші тренування</b><div class="small muted">Суперсети — дві вправи поспіль, відпочинок після пари; у частині програм ще й міо-підходи в ізоляції. Менше часу, та сама робота.</div></li>
        <li style="display:block"><b>🔄 Заміна вправи</b><div class="small muted">«⋯ Ще» → «Замінити»: рівноцінні вправи на ті самі мʼязи.</div></li>
        <li style="display:block"><b>🎨 Новий вигляд</b><div class="small muted">М'які заокруглені форми, легкі тіні, «скляні» панелі й плавні переходи. Світла й темна тема — за налаштуванням телефона.</div></li>
        <li style="display:block"><b>💡 Підказки</b><div class="small muted">Затисніть будь-яку кнопку чи напис на 1,5 секунди — зʼявиться пояснення простою мовою. А ще: кнопки «?» біля термінів, навчання на першому запуску, словник у «Більше».</div></li>
      </ul><button type="button" class="pri wide" data-act="closeSheet">Зрозуміло</button>`);
    S().tour.v3 = true; save();
  }
  function readySheet(wid, place) {
    const her = DB.active === 'her', sw = G().ready && G().ready.swap && G().ready.swap.rdl && G().ex.rdl;
    openSheet(`<b>${her ? 'Як спина й суглоби сьогодні?' : 'Як спина сьогодні?'}</b> ${q('ready')}
      <p class="small muted">Від відповіді залежать вправи на поперек.</p>
      <div class="pick rd">
        <button type="button" data-act="go" data-r="g" data-w="${wid || ''}" data-p="${place || ''}"><b>🟢 Добре</b><span class="small muted">тренування за планом</span></button>
        <button type="button" data-act="go" data-r="y" data-w="${wid || ''}" data-p="${place || ''}"><b>🟡 Ниє, але терпимо</b><span class="small muted">${sw ? 'румунська тяга → міст, решта вправ на поперек — на крок легше' : 'вправи на поперек — на крок легше, запас 3'}</span></button>
        <button type="button" data-act="go" data-r="r" data-w="${wid || ''}" data-p="${place || ''}"><b>🔴 Болить або віддає в ногу</b><span class="small muted">сьогодні без вправ на поперек</span></button>
      </div>
      <div class="note b small"><b>Негайно до лікаря:</b> оніміння в паху чи між ногами, порушення сечовипускання чи стільця, слабкість у нозі, що наростає.</div>`);
  }

  /* ---------- радіо ---------- */
  function radioSheet() {
    const cur = RADIO.cur, st = RADIO.state, R = S().radio;
    const groups = []; RADIO.STATIONS.forEach((x) => { let g = groups.find((y) => y.g === x.g); if (!g) { g = { g: x.g, list: [] }; groups.push(g); } g.list.push(x); });
    const stTxt = { off: 'вимкнено', loading: 'підключаюся…', playing: 'грає', paused: 'пауза', error: 'станція не відповідає — оберіть іншу' }[st] || '';
    openSheet(`<div class="sp"><b>Радіо для тренувань</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      ${cur ? `<div class="card rnow"><div class="sp"><div><b>${esc(cur.name)}</b><div class="small muted">${esc(cur.genre)} · ${stTxt}</div></div>
        <div class="row" style="flex-wrap:nowrap">${st === 'playing' || st === 'loading' ? '<button type="button" class="ic" data-act="rpause" aria-label="пауза">⏸</button>' : '<button type="button" class="ic" data-act="rresume" aria-label="грати">▶</button>'}<button type="button" class="ic" data-act="rstop" aria-label="вимкнути">✕</button></div></div></div>` : ''}
      ${groups.map((g) => `<h3 class="rg">${esc(g.g)}</h3><div class="rlist">${g.list.map((x) => `<button type="button" class="rst${cur && cur.id === x.id ? ' on' : ''}" data-act="rplay" data-id="${x.id}"><b>${esc(x.name)}</b><span class="small muted">${esc(x.genre)}</span></button>`).join('')}</div>`).join('')}
      ${RADIO.routed === false ? '<div class="note small">На цьому телефоні браузер не дає змінювати гучність радіо (вада Safari) — поки говорить тренер, музика на мить вимикається і одразу повертається.</div>' : ''}
      <label class="f">Коли говорить тренер, радіо тихіше на</label>
      <div class="seg">${[[0.7, '30 %'], [0.5, '50 %'], [0.3, '70 %']].map(([v, l]) => `<button type="button" class="${R.duck === v ? 'on' : ''}" data-act="rduck" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="tiny muted">Притишення плавне, звук повертається, щойно тренер замовк. Що радять науковці: улюблена енергійна музика зі швидким темпом (120+ ударів на хвилину) покращує настрій і трохи — результат, а втома відчувається менше. Найкраще працює та, яку обираєте самі, — тому можна вмикати й свою з іншого застосунку. Радіо потребує інтернету.</p>`);
  }
  const rbar = document.getElementById('rbar');
  /* Радіо в шапці тренування: назва, пауза / грати, стоп — завжди на виду. */
  function radioRow() {
    const st = RADIO.state, cur = RADIO.cur, on = st === 'playing' || st === 'loading';
    if (!cur || st === 'off') return '';
    return `<button type="button" class="rbt" data-act="radio"><span class="rdot2${on ? ' p' : ''}"></span><b>${esc(cur.name)}</b><span class="small muted">${st === 'error' ? 'не відповідає' : st === 'loading' ? 'підключаюся…' : st === 'paused' ? 'пауза' : esc(cur.genre)}</span></button>
      ${on ? '<button type="button" class="ic" data-act="rpause" aria-label="пауза">⏸</button>' : '<button type="button" class="ic" data-act="rresume" aria-label="грати">▶</button>'}<button type="button" class="ic" data-act="rstop" aria-label="вимкнути радіо">■</button>`;
  }
  function updateRadio() {
    const st = RADIO.state, cur = RADIO.cur, on = st === 'playing' || st === 'loading';
    const wr = document.getElementById('wRadio'), row = radioRow(); if (wr && wr.dataset.h !== row) { wr.innerHTML = row; wr.dataset.h = row; }
    document.querySelectorAll('[data-act="radio"]').forEach((b) => b.classList.toggle('rad', on));
    const show = cur && st !== 'off' && view !== 'workout' && view !== 'onboard' && view !== 'summary';
    rbar.className = show ? 'on' : '';
    if (show) rbar.dataset.h = rbar.innerHTML = `<button type="button" class="rbt" data-r="open"><span class="rdot2${on ? ' p' : ''}"></span><b>${esc(cur.name)}</b><span class="small muted">${st === 'error' ? 'не відповідає' : st === 'loading' ? 'підключаюся…' : st === 'paused' ? 'пауза' : esc(cur.genre)}</span></button>
      ${on ? '<button type="button" class="ic" data-r="pause" aria-label="пауза">⏸</button>' : '<button type="button" class="ic" data-r="resume" aria-label="грати">▶</button>'}<button type="button" class="ic" data-r="stop" aria-label="вимкнути">✕</button>`;
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
    for (let k = 0; k < 8; k++) { const d = new Date(now); d.setDate(now.getDate() + k); if (days.indexOf(d.getDay()) >= 0) return k === 0 ? 'сьогодні' : k === 1 ? 'завтра' : 'у ' + DAYS_FULL[d.getDay()]; }
    return '';
  }
  function dailyCard() {
    const p = P(), prog = G(), t = today(), rec = p.daily[t] || {};
    const wk = ENGINE.planFor(prog, Math.max(0, nextN() - 1)).week;
    return `<h2>Щодня</h2><div class="card dly">${prog.daily.map((it) => {
      if (it.jumps) {
        const j = prog.jumpsFor(wk), done = rec.jumps || 0;
        return `<div class="chk" style="flex-wrap:wrap"><div style="flex:1 1 100%"><b>${esc(it.label)}</b><div class="tiny muted">Тиждень ${wk}: ${j.n} стрибків × ${j.times} на день, 30 с між стрибками. Лише якщо коліна, стопи й тазове дно без проблем. <button type="button" class="sm ghost" style="min-height:40px;padding:0 6px" data-act="guide" data-id="jumps">як стрибати</button></div></div>
          <div class="row">${Array.from({ length: j.times }, (_, k) => `<button type="button" class="sm${k < done ? ' pri' : ''}" data-act="jump" data-k="${k + 1}">${k < done ? '✓ ' : ''}${k + 1}-й раз</button>`).join('')}</div></div>`;
      }
      const how = it.how && (G().guide || []).some((g) => g.id === it.how) ? ` <button type="button" class="sm ghost" data-act="guide" data-id="${it.how}">як робити</button>` : '';
      return `<div class="chk"><label class="row" style="flex:1;flex-wrap:nowrap;gap:12px"><input type="checkbox" data-act="daily" data-id="${it.id}"${rec[it.id] ? ' checked' : ''}><span>${esc(it.label)}</span></label>${how}</div>`;
    }).join('')}</div>`;
  }
  function alerts() {
    const out = [], p = P(), prog = G();
    if (ENGINE.fatigue(prog, p, p.handle)) out.push('<div class="note b">Два тренування поспіль головні вправи падають. Зробіть легкий тиждень: половина підходів, вага та сама або на крок нижча.</div>');
    const reds = p.sessions.slice(-3).filter((s) => s.ready === 'r').length;
    if (reds >= 2) out.push('<div class="note b">Спина болить уже кілька тренувань поспіль. Варто показатися неврологу чи ортопеду — з МРТ.</div>');
    const wk = ENGINE.planFor(prog, nextN()).week;
    if (prog.tests && [1, 4, 8, 12].indexOf(wk) >= 0 && !(p.body.tests || []).some((t) => Date.now() - tms(t.d) < 21 * 864e5)) out.push('<div class="note w">Цього тижня — тести готовності до старіння: «Тіло» → «Тести».</div>');
    if (p.sessions.length >= 3 && (!DB.lastBackup || Date.now() - tms(DB.lastBackup) > 14 * 864e5)) out.push('<div class="note w">Резервної копії не було понад 2 тижні — «Більше» → «Зберегти резервну копію».</div>');
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (!standalone && !p.sessions.length) out.push('<div class="note w small"><b>Спершу встановіть:</b> Safari → «Поділитися» → «На початковий екран» і відкривайте з іконки. В іконки й у Safari окремі сховища.</div>');
    return out.join('');
  }
  function rHome() {
    const p = P(), prog = G(), d = p.draft, plan = ENGINE.planFor(prog, nextN()), wo = prog.workouts[plan.workout];
    const h = new Date().getHours(), greet = h < 12 ? 'Доброго ранку' : h < 18 ? 'Доброго дня' : 'Доброго вечора';
    const wkKey = ENGINE.weekKey(today()), thisWeek = p.sessions.filter((s) => ENGINE.weekKey(s.date) === wkKey).length;
    const streak = ENGINE.streakWeeks(p.sessions, today());
    const ym = today().slice(0, 7), mprs = p.sessions.filter((s) => s.date.slice(0, 7) === ym).reduce((a, s) => a + (s.prs || 0), 0);
    const pv = buildDraft(null, 'g'), est = ENGINE.estimateMins(prog, pv.items), nEx = pv.items.filter((x) => !x.skipped).length;
    const warmMin = (warmList().title.match(/(\d+)\s*хв/) || [])[1];
    const nd = nextDayText(p.days);
    app.innerHTML = `<div class="brand">${MARK}<b>Тренування</b></div><p class="muted small" style="margin-top:4px">${new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</p><div class="sp"><h1>${greet}!</h1><button type="button" class="ic${RADIO.state === 'playing' || RADIO.state === 'loading' ? ' rad' : ''}" data-act="radio" aria-label="радіо">${ICON.radio}</button></div>
      ${alerts()}
      ${d ? `<div class="card"><div class="sp"><div><b>Тренування триває</b><div class="small muted">${esc(woTitle(d.workout))} · ${draftStats(d).done}/${draftStats(d).total} підходів</div></div><button type="button" class="pri" data-act="resume">Продовжити</button></div></div>` : ''}
      <div class="card hero"><div class="row"><span class="chip">Тиждень ${plan.week}${plan.cycle > 1 ? ' · цикл ' + plan.cycle : ''}</span><span class="chip">${plan.slot + 1} з ${prog.perWeek || 3}</span>${plan.deload ? '<span class="chip">легкий тиждень</span>' : ''}</div>
        <h1 style="margin-top:10px">${esc(wo.title)}</h1><p class="muted small">${plural(nEx, 'вправа', 'вправи', 'вправ')} · ≈ ${est} хв${warmMin ? ' + розминка ' + warmMin + ' хв' : ''} · ${esc(plan.note.rir)}${nd ? ' · за планом ' + nd : ''}</p>
        <p class="small" style="opacity:.92">${esc(plan.note.phase)}</p>
        ${d ? '' : '<button type="button" class="pri wide big" data-act="start">Почати тренування</button><button type="button" class="ghost wide hlink" data-act="other">Інше тренування</button>'}</div>
      ${S().tour.tips ? '' : '<div class="card"><div class="sp"><div><b>💡 Підказка на кожній кнопці</b><div class="small muted">Затисніть будь-яку кнопку чи напис на 1,5 секунди — зʼявиться коротке пояснення.</div></div><button type="button" class="sm pri" data-act="tipsOk">Зрозуміло</button></div></div>'}
      ${S().tour.v3 ? '' : '<div class="card"><div class="sp"><div><b>Нове: тренер голосом</b><div class="small muted">Питання про спину, суперсети, міо-підходи, підказки.</div></div><button type="button" class="sm pri" data-act="whatsnew">Що нового</button></div></div>'}
      <div class="grid3"><div class="stat" style="display:flex;justify-content:center">${CHARTS.ring(thisWeek, prog.perWeek || 3, thisWeek + '/' + (prog.perWeek || 3), 'тиждень')}</div>
        <div class="stat"><b>${streak}</b><span>тижнів поспіль</span></div><div class="stat"><b>${mprs}</b><span>рекордів за місяць</span></div></div>
      ${dailyCard()}`;
    tourMaybe('home');
  }
  function otherSheet() {
    const prog = G();
    openSheet(`<b>Інше тренування</b><p class="small muted">Тиждень і підказки лишаються за планом.</p><div class="pick">${Object.keys(prog.workouts).map((k) => `<button type="button" data-act="startW" data-w="${k}"><b>${esc(prog.workouts[k].title)}</b><span class="small muted">${plural(prog.workouts[k].items.length, 'вправа', 'вправи', 'вправ')}${prog.gymWorkouts && prog.gymWorkouts[k] ? ' удома · ' + prog.gymWorkouts[k].items.length + ' у залі' : ''}</span></button>`).join('')}</div>`);
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
        return `<div class="wk${prog.deload.indexOf(w) >= 0 ? ' dl' : ''}" style="grid-template-columns:58px repeat(${prog.perWeek || 3},1fr)"><div class="wl"><b>${w}</b>тиждень</div>${order.map((wid, s) => {
          const n = base + s, done = byN[n], isNext = n === nn;
          const short = { A: 'А', B: 'Б', D1: 'Д1', D2: 'Д2', D3: 'Д3' }[wid] || wid;
          return `<button type="button" class="slot${done ? ' done' : isNext ? ' next' : ''}" data-act="${done ? 'sess' : isNext ? 'start' : 'noop'}" data-id="${done ? done.id : ''}">${done ? '✓ ' : ''}${esc(short)}<small>${done ? dm(done.date) : isNext ? 'наступне' : ''}</small></button>`;
        }).join('')}</div>`;
      }).join('')}</div><p class="tiny muted">${weeks.some((w) => prog.week(w).some((x) => /^D/.test(x))) ? 'А / Б — тренування фази 1, Д1–Д3 — дні фаз 2–3.' : 'А / Б — два тренування на все тіло, по черзі.'} Легкий тиждень — підходів удвічі менше.</p>`;
    } else {
      const ym = ui.calMonth || today().slice(0, 7);
      const marks = {}; p.sessions.forEach((s) => { marks[s.date] = 't'; });
      Object.keys(p.daily).forEach((d) => { if (!marks[d] && Object.values(p.daily[d]).some(Boolean)) marks[d] = 'd'; });
      const list = p.sessions.filter((s) => s.date.slice(0, 7) === ym).slice().reverse();
      body = `<div class="card"><div class="sp"><button type="button" class="sm" data-act="calPrev">‹</button><b>${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}</b><button type="button" class="sm" data-act="calNext">›</button></div><p></p>${CHARTS.month(ym, marks, today())}
        <div class="legend"><span><i></i>тренування</span><span><i style="background:var(--ok-soft)"></i>щоденне</span></div></div>
        <div class="card">${list.length ? `<ul class="list">${list.map((s) => `<li data-act="sess" data-id="${s.id}" style="cursor:pointer"><span><b>${esc(woTitle(s.workout))}${placeTag(s)}</b><div class="tiny muted">${dm(s.date)} · тиждень ${s.week} · ${s.mins || '?'} хв · ${plural(s.sets.filter((x) => x.type !== 'W').length, 'підхід', 'підходи', 'підходів')}</div></span><span>${s.prs ? '<span class="chip g">🏆 ' + s.prs + '</span>' : '›'}</span></li>`).join('')}</ul>` : '<div class="empty">У цьому місяці тренувань немає</div>'}</div>`;
    }
    app.innerHTML = `<h1>План</h1><div class="seg"><button type="button" class="${ui.planTab === 'w' ? 'on' : ''}" data-act="planTab" data-v="w">12 тижнів</button><button type="button" class="${ui.planTab === 'h' ? 'on' : ''}" data-act="planTab" data-v="h">Історія</button></div>${body}`;
  }
  function sessSheet(id, edit) {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === id); if (!s) return;
    const groups = []; s.sets.forEach((x, k) => { let g = groups.find((y) => y.ex === x.ex); if (!g) { g = { ex: x.ex, sets: [] }; groups.push(g); } g.sets.push({ x, k }); });
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    openSheet(`<div class="sp"><b>${esc(woTitle(s.workout))}${placeTag(s)}</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">${dm(s.date)} · тиждень ${s.week} · ${s.mins || '?'} хв${vol ? ' · обсяг ' + fmt(Math.round(vol)) + ' кг' : ''}${s.ready ? ' · спина ' + ({ g: '🟢', y: '🟡', r: '🔴' }[s.ready] || '') : ''}</p>
      ${groups.map((g) => { const ex = prog.ex[g.ex] || { name: g.ex, type: 'bw' }; return `<div class="card" style="padding:10px 12px"><b class="small">${esc(ex.name)}</b>${g.sets.map(({ x, k }) => edit
        ? `<div class="row" style="flex-wrap:nowrap;margin-top:6px"><span class="tiny muted" style="width:22px">${x.type === 'W' ? 'Р' : x.type === 'D' ? 'Д' : x.type === 'F' ? 'В' : '•'}</span>${isLoad(ex) ? `<input inputmode="decimal" data-ed="load" data-sk="${k}"${loadTip(ex, ' у цьому підході. Порожньо — без ваги.')} value="${x.load === null || x.load === undefined ? '' : fmt(x.load)}" placeholder="${ex.type === 'band' ? 'рівень' : 'кг'}">` : ''}<input inputmode="numeric" data-ed="reps" data-sk="${k}" value="${x.reps}"></div>`
        : `<div class="small" style="margin-top:4px">${x.type === 'W' ? '<span class="chip w">Р</span> ' : x.type === 'D' ? '<span class="chip">Д</span> ' : x.type === 'F' ? '<span class="chip">В</span> ' : x.type === 'M' ? '<span class="chip g">М</span> ' : ''}${esc(setText(ex, x))}${x.mini && x.mini.length ? ' + ' + x.mini.join(' + ') : ''}${x.rir !== null && x.rir !== undefined ? ' · запас ' + x.rir : ''}</div>`).join('')}</div>`; }).join('')}
      ${edit ? `<button type="button" class="pri wide" data-act="sessSave" data-id="${s.id}">Зберегти зміни</button>` : `<button type="button" class="wide" data-act="sessEdit" data-id="${s.id}">Редагувати</button>`}<p></p>
      <button type="button" class="ghost wide" style="color:var(--bad)" data-act="sessDel" data-id="${s.id}">Видалити тренування</button>`);
  }

  /* ---------- прогрес ---------- */
  function rProgress() {
    const p = P(), prog = G(), h = p.handle;
    const seg = `<div class="seg">${[['ex', 'Вправи'], ['mu', 'Мʼязи'], ['rep', 'Звіт']].map(([k, l]) => `<button type="button" class="${ui.progTab === k ? 'on' : ''}" data-act="progTab" data-v="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (ui.progTab === 'ex') {
      const used = {}; p.sessions.forEach((s) => s.sets.forEach((x) => { if (x.type !== 'W') used[x.ex] = 1; }));
      const ids = Object.keys(prog.ex).filter((id) => !prog.ex[id].retired || used[id]).sort((a, b) => (used[b] ? 1 : 0) - (used[a] ? 1 : 0) || (prog.ex[b].main ? 1 : 0) - (prog.ex[a].main ? 1 : 0));
      if (!ui.progEx || !prog.ex[ui.progEx]) ui.progEx = ids[0];
      const ex = prog.ex[ui.progEx], histAll = ENGINE.history(p, ui.progEx, 'all');
      const metrics = ex.type === 'db' || isMach(ex) ? [['e1rm', 'Максимум'], ['heavy', 'Вага'], ['vol', 'Обсяг']] : ex.type === 'dbopt' ? [['reps', 'Повторення'], ['heavy', 'Вага']] : ex.type === 'band' ? [['e1rm', 'Рівень × повт.']] : ex.type === 'time' ? [['e1rm', 'Секунди']] : [['e1rm', 'Повторення']];
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
      const unit = ui.metric === 'vol' ? 'кг за тренування' : ui.metric === 'heavy' ? (isMach(ex) ? 'кг на тренажері' : 'кг у руках') : ui.metric === 'reps' ? 'повторень' : ENGINE.metricLabel(ex);
      const repRows = Object.keys(rec.reps).map(Number).sort((a, b) => b - a).slice(0, 8);
      body = `<select id="exSel">${ids.map((id) => `<option value="${id}"${id === ui.progEx ? ' selected' : ''}>${esc(prog.ex[id].name)}${used[id] ? '' : ' (ще не виконували)'}</option>`).join('')}</select>
        <div class="seg">${metrics.map(([k, l]) => `<button type="button" class="${ui.metric === k ? 'on' : ''}" data-act="metric" data-v="${k}"${k === 'heavy' && isMach(ex) ? ' data-tip="Найбільша вага на тренажері за кожне тренування."' : ''}>${l}</button>`).join('')}</div>
        <div class="card"><div class="sp"><span class="tiny muted">${esc(unit)} · ◎ — рекорд</span><span class="seg" style="margin:0;padding:2px">${[['4', '4 т'], ['12', '12 т'], ['all', 'усе']].map(([k, l]) => `<button type="button" class="${ui.range === k ? 'on' : ''}" style="min-height:40px;min-width:44px;padding:4px 10px" data-act="range" data-v="${k}">${l}</button>`).join('')}</span></div>
        ${CHARTS.line([{ pts, color: 'var(--accent)', area: true }], { label: ex.name, empty: 'Ще немає підходів у цій вправі' })}</div>
        ${histAll.length ? `<div class="grid3">
          <div class="stat"><b>${rec.e1rm ? fmt(rec.e1rm.v) : '—'}</b><span>${ex.type === 'db' || isMach(ex) ? 'рекорд максимуму, кг' : 'найкращий показник'}</span></div>
          <div class="stat"><b>${rec.heavy ? fmt(rec.heavy.total) : '—'}</b><span>${isMach(ex) ? 'найбільша вага' : 'найважче в руках'}, кг${rec.heavy ? ' × ' + rec.heavy.set.reps : ''}</span></div>
          <div class="stat"><b>${rec.vol ? fmt(Math.round(rec.vol.v)) : '—'}</b><span>найбільший обсяг, кг</span></div></div>
          ${repRows.length ? `<h2>Рекорди повторень</h2><div class="card"><ul class="list">${repRows.map((L) => `<li><span>${ex.type === 'band' ? 'рівень ' + fmt(L) : isMach(ex) ? fmt(L) + ' кг' : 'гриф + ' + fmt(L) + ' кг'}</span><span><b>${rec.reps[String(L)].reps}</b> <span class="tiny muted">${dm(rec.reps[String(L)].date)}</span></span></li>`).join('')}</ul></div>` : ''}
          <h2>Останні тренування</h2><div class="card"><ul class="list">${histAll.slice(-6).reverse().map((x) => `<li><span>${dm(x.date)}</span><span class="small">${x.sets.map((s) => esc(setText(ex, s))).join(', ')}</span></li>`).join('')}</ul></div>` : ''}
        ${ex.tip ? `<div class="note small">${esc(ex.tip)}</div>` : ''}`;
    } else if (ui.progTab === 'mu') {
      const days = ui.musDays, to = Date.now() + 864e5, from = Date.now() - days * 864e5;
      const raw = ENGINE.muscleSets(prog, p.sessions, from, to), wkv = {};
      Object.keys(raw).forEach((k) => { wkv[k] = Math.round(raw[k] / (days / 7) * 10) / 10; });
      const present = MUSCLES.filter((m) => Object.values(prog.ex).some((e) => e.m.p.indexOf(m[0]) >= 0));
      body = `<div class="seg">${[[7, '7 днів'], [28, '28 днів (сер. за тиждень)']].map(([k, l]) => `<button type="button" class="${ui.musDays === k ? 'on' : ''}" data-act="musDays" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="card">${CHARTS.bodyMap(wkv, volHi() ? 12 : 8)}<p class="tiny muted" style="text-align:center">Що темніше — то більше підходів на тиждень. Основний мʼяз вправи — 1 підхід, допоміжний — 0,5.</p></div>
        <h2>Підходи на тиждень</h2><div class="card">${CHARTS.hbars(present.map(([k, l]) => ({ label: l, v: wkv[k] || 0 })), volHi() ? { lo: 10, hi: 20, zoneLabel: 'наукові огляди: 10–20 робочих підходів на тиждень для росту мʼязів' } : { lo: 6, hi: 12, zoneLabel: 'орієнтир для сили й тонусу: 6–12 підходів на тиждень' })}</div>`;
    } else {
      const ym = ui.repMonth || today().slice(0, 7);
      const [Y, M] = ym.split('-').map(Number); const prevYm = M === 1 ? (Y - 1) + '-12' : Y + '-' + pad(M - 1);
      const r = ENGINE.monthReport(prog, p, ym, h), r0 = ENGINE.monthReport(prog, p, prevYm, h);
      const delta = (a, b) => (b ? ' <span class="tiny muted">(' + (a - b >= 0 ? '+' : '−') + fmt(Math.abs(Math.round((a - b) * 10) / 10)) + ')</span>' : '');
      const marks = {}; p.sessions.forEach((s) => { marks[s.date] = 't'; });
      body = `<div class="card"><div class="sp"><button type="button" class="sm" data-act="repPrev">‹</button><b>${MONTHS[M - 1]} ${Y}</b><button type="button" class="sm" data-act="repNext">›</button></div></div>
        <div class="grid2"><div class="stat"><b>${r.sessions}${delta(r.sessions, r0.sessions)}</b><span>тренувань</span></div><div class="stat"><b>${r.mins}${delta(r.mins, r0.mins)}</b><span>хвилин</span></div>
        <div class="stat"><b>${r.volume ? fmt(Math.round(r.volume / 100) / 10) + ' т' : '—'}</b><span>обсяг</span></div><div class="stat"><b>${r.prs}${delta(r.prs, r0.prs)}</b><span>рекордів</span></div></div>
        ${r.gains && r.gains.length ? `<h2>Найбільший приріст</h2><div class="card"><ul class="list">${r.gains.slice(0, 5).map((g) => `<li><span>${esc(prog.ex[g.id].name)}</span><span class="chip ok">+${g.pct} %</span></li>`).join('')}</ul></div>` : ''}
        ${(() => { const ms = p.sessions.filter((s) => s.date.slice(0, 7) === ym && s.ready); if (!ms.length) return ''; const c = { g: 0, y: 0, r: 0 }; ms.forEach((s) => { c[s.ready] = (c[s.ready] || 0) + 1; });
          return `<h2>Самопочуття перед тренуваннями</h2><div class="card"><div class="row" style="gap:6px">${ms.map((s) => `<span class="rdot ${s.ready}" title="${dm(s.date)}"></span>`).join('')}</div><p class="small muted">🟢 ${c.g} · 🟡 ${c.y} · 🔴 ${c.r}${c.r >= 2 ? ' — болить часто: варто до лікаря з МРТ.' : ''}</p></div>`; })()}
        ${(() => { const rc = []; p.sessions.slice().reverse().forEach((s) => (s.prList || []).forEach((x) => { if (rc.length < 6) rc.push({ d: s.date, ex: x.ex, t: x.types }); })); return rc.length ? `<h2>Останні рекорди</h2><div class="card"><ul class="list">${rc.map((r) => `<li><span>${esc((prog.ex[r.ex] || { name: r.ex }).name)}<div class="tiny muted">${dm(r.d)}</div></span><span class="chip g">🏆 ${r.t.map((t) => ({ e1rm: 'максимум', weight: 'вага', reps: 'повторення' }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''; })()}
        <h2>Календар</h2><div class="card">${CHARTS.month(ym, marks, today())}</div>
        <p class="tiny muted">Порівняння — з попереднім місяцем. Приріст — найкращий показник вправи в цьому місяці проти всього, що було раніше.</p>`;
    }
    app.innerHTML = `<h1>Прогрес</h1>${seg}${body}`;
    const sel = document.getElementById('exSel'); if (sel) sel.onchange = () => { ui.progEx = sel.value; rProgress(); };
  }

  /* ---------- тіло ---------- */
  const MEAS = [['weight', 'Вага', 'кг', 25, 300], ['waist', 'Талія', 'см', 40, 250], ['chest', 'Груди', 'см', 50, 250], ['hips', 'Стегна', 'см', 50, 250], ['arm', 'Рука', 'см', 15, 80]];
  const TESTS = [['chair', 'Вставання з крісла за 30 с', 'разів'], ['balL', 'Стійка на одній нозі — ліва', 'с'], ['balR', 'Стійка на одній нозі — права', 'с'],
    ['spL', 'Бічна планка — ліворуч', 'с'], ['spR', 'Бічна планка — праворуч', 'с'], ['push', 'Віджимання', 'разів'], ['carL', 'Валізна прогулянка — ліва рука', 'с'], ['carR', 'Валізна прогулянка — права рука', 'с']];
  let photoUrls = [];
  function rBody() {
    const p = P(), prog = G();
    const tabs = [['m', 'Заміри'], ['n', 'Харчування'], ['f', 'Фото']].concat(prog.tests ? [['t', 'Тести']] : []);
    if (!tabs.some((t) => t[0] === ui.bodyTab)) ui.bodyTab = 'm';
    let body = '';
    if (ui.bodyTab === 'm') {
      body = MEAS.map(([k, l, u]) => {
        const arr = (p.body[k] || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
        const last = arr[arr.length - 1], first = arr[0];
        const avg = k === 'weight' ? ENGINE.rolling7(arr) : null;
        const series = k === 'weight' ? [{ pts: arr.map((q) => ({ t: tms(q.d), v: Number(q.v) })), color: 'var(--muted)', width: 1 }, { pts: avg.map((q) => ({ t: tms(q.d), v: q.v })), color: 'var(--accent)', width: 2.5, dots: false, area: true }] : [{ pts: arr.map((q) => ({ t: tms(q.d), v: Number(q.v) })), color: 'var(--accent)', area: true }];
        return `<div class="card"><div class="sp"><div><b>${l}</b><div class="small muted">${last ? fmt(last.v) + ' ' + u + ' · ' + dm(last.d) + (first && first !== last ? ' · ' + (last.v - first.v >= 0 ? '+' : '') + fmt(Math.round((last.v - first.v) * 10) / 10) + ' від першого' : '') : 'ще немає'}</div></div><button type="button" class="sm" data-act="measAdd" data-m="${k}">+ Додати</button></div>
          ${arr.length >= 2 ? CHARTS.line(series, { h: 130, label: l }) : ''}${k === 'weight' && arr.length ? '<p class="tiny muted">Зважуйтесь зранку натщесерце; дивіться на середню за 7 днів (лінія).</p>' : ''}</div>`;
      }).join('');
    } else if (ui.bodyTab === 'n') {
      const food = prog.food, me = Object.assign({ sex: prog.sex }, p.me || {});
      /* вага: середня за 7 днів із «Замірів»; поки зважувань немає — з анкети (її людина вже вказала) */
      const wts = (p.body.weight || []), avg = ENGINE.rolling7(wts), wMeas = avg.length ? avg[avg.length - 1].v : null;
      const wAns = Number(((DB.custom || {}).answers || {}).weight) || null, wNow = wMeas || wAns;
      const nu = ENGINE.nutrition(food, me, wNow);
      const tr = ENGINE.weightTrend(wts), adv = ENGINE.foodAdvice(food, tr);
      const goalTxt = food.goal === 'loss' ? 'мета — менше жиру, більше мʼязів: дефіцит ≈ ' + Math.round(food.deficit * 100) + ' % від витрат' : 'мета — сила й тонус: калорії на рівні підтримки, без дієт';
      body = `<div class="card"><p class="small muted">Дані лише в цьому телефоні. Вага береться із «Замірів» (середня за 7 днів).</p>
        <div class="grid2"><div><label class="f">Зріст, см</label><input inputmode="numeric" id="meH" value="${me.height || ''}"></div><div><label class="f">Вік, років</label><input inputmode="numeric" id="meA" value="${me.age || ''}"></div></div>
        ${food.basis === 'target' ? `<label class="f">Цільова вага, кг (для білка; порожньо — порахую за зростом)</label><input inputmode="decimal" id="meT" value="${me.target || ''}">` : ''}
        <p></p><button type="button" class="wide" data-act="meSave">Зберегти</button></div>
        ${!wMeas && wAns ? `<div class="note">Поки зважувань немає — норма за вагою з анкети (${fmt(wAns)} кг). Зважтеся й додайте вагу у «Заміри» — норма стане точнішою.</div>` : ''}
        ${!wNow ? '<div class="note w">Додайте вагу у «Заміри» — і тут зʼявиться норма.</div>' : !nu ? '<div class="note w">Вкажіть зріст і вік — і тут зʼявиться норма.</div>' : `
        <div class="grid2"><div class="stat"><b>${fmt(nu.kLo)}–${fmt(nu.kHi)}</b><span>ккал на день</span></div><div class="stat"><b>${nu.pLo}–${nu.pHi} г</b><span>білка на день</span></div></div>
        <p class="tiny muted">${esc(goalTxt)}. Розрахунок: формула Міффліна — Сан Жеора × 1,45 (основний обмін ≈ ${fmt(nu.bmr)}, витрати ≈ ${fmt(nu.tdee)} ккал); білок — ${fmt(food.protein[0])}–${fmt(food.protein[1])} г на кг ${food.basis === 'target' ? 'цільової ваги ' + fmt(nu.target) + ' кг' : 'поточної ваги'}.</p>
        <div class="note ${adv.k === 'ok' ? 'ok' : adv.k === 'wait' ? '' : 'w'}"><b>За вашою вагою:</b> ${esc(adv.text)}${tr && tr.rate !== null ? ' <span class="tiny muted">(темп ' + (tr.rate > 0 ? '+' : tr.rate < 0 ? '−' : '') + fmt(Math.abs(tr.rate)) + ' кг на тиждень)</span>' : ''}</div>`}
        <div class="card">${food.notes.map((x) => `<p class="small" style="margin:6px 0">• ${esc(x)}</p>`).join('')}</div>`;
    } else if (ui.bodyTab === 'f') {
      body = `<div class="seg">${[['front', 'Спереду'], ['side', 'Збоку'], ['back', 'Ззаду']].map(([k, l]) => `<button type="button" class="${ui.photoPose === k ? 'on' : ''}" data-act="pose" data-v="${k}">${l}</button>`).join('')}</div>
        <label class="btn pri" style="display:block;text-align:center;color:var(--accent-ink);border:1px solid var(--accent);background:var(--accent);font-weight:500">Додати фото<input type="file" id="photoIn" accept="image/*" style="display:none"></label>
        <div id="cmpBox"></div><h2>Усі фото</h2><div class="ph" id="phGrid"><div class="empty" style="grid-column:1/-1">Завантаження…</div></div>
        <p class="tiny muted">Фото зберігаються лише в цьому телефоні (стиснені до 1080 px). Тижні 1, 4, 8, 12 — однакове світло й місце.</p>`;
    } else {
      const tl = (p.body.tests || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
      body = `<details class="card"><summary style="cursor:pointer;font-weight:650">Як виконувати тести</summary>${(prog.testsHow || []).map((r) => `<p class="small" style="margin:8px 0"><b>${esc(r[0])}.</b> ${esc(r[1])}</p>`).join('')}</details><div class="card"><p class="small muted">Тижні 1, 4, 8, 12. Головне — щоб числа росли.</p><div class="grid2">${TESTS.map(([k, l, u]) => `<div><label class="f">${l}, ${u}</label><input inputmode="decimal" id="t_${k}"></div>`).join('')}</div><p></p><button type="button" class="pri wide" data-act="saveTests">Зберегти тести</button></div>
        ${[['chair', ['chair'], 'Вставання з крісла за 30 с'], ['bal', ['balL', 'balR'], 'Стійка на одній нозі, с'], ['sp', ['spL', 'spR'], 'Бічна планка, с'], ['push', ['push'], 'Віджимання'], ['car', ['carL', 'carR'], 'Валізна прогулянка, с']].map(([id, keys, name]) => {
          const ser = keys.map((key, i) => ({ pts: tl.filter((t) => t[key] !== null && t[key] !== undefined && t[key] !== '').map((t) => ({ t: tms(t.d), v: Number(t[key]) })), color: i ? 'var(--d)' : 'var(--accent)' }));
          if (!ser.some((x) => x.pts.length)) return '';
          return `<div class="card"><b class="small">${name}</b>${CHARTS.line(ser, { h: 120, label: name })}${keys.length > 1 ? '<div class="legend"><span><i></i>ліва</span><span><i style="background:var(--d)"></i>права</span></div>' : ''}</div>`;
        }).join('')}`;
    }
    app.innerHTML = `<h1>Тіло</h1><div class="seg">${tabs.map(([k, l]) => `<button type="button" class="${ui.bodyTab === k ? 'on' : ''}" data-act="bodyTab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
    if (ui.bodyTab === 'f') loadPhotos();
  }
  function loadPhotos() {
    photoUrls.forEach((u) => URL.revokeObjectURL(u)); photoUrls = [];
    const inp = document.getElementById('photoIn');
    if (inp) inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try { const blob = await STORE.compress(f); await STORE.putPhoto({ id: Date.now(), profile: DB.active, date: today(), pose: ui.photoPose, blob }); toast('Фото збережено'); rBody(); }
      catch (e) { toast('Не вдалося зберегти фото'); }
    };
    STORE.listPhotos(DB.active).then((all) => {
      const grid = document.getElementById('phGrid'); if (!grid) return;
      const mine = all.filter((x) => x.pose === ui.photoPose);
      grid.innerHTML = mine.length ? mine.slice().reverse().map((x) => { const u = URL.createObjectURL(x.blob); photoUrls.push(u); return `<div data-act="photo" data-id="${x.id}" style="position:relative"><img src="${u}" alt="фото ${dm(x.date)}"><span class="tiny" style="position:absolute;left:6px;bottom:6px;background:rgba(8,32,31,.7);color:#fff;padding:1px 6px">${dm(x.date)}</span></div>`; }).join('') : '<div class="empty" style="grid-column:1/-1">Ще немає фото в цьому ракурсі</div>';
      const box = document.getElementById('cmpBox');
      if (box && mine.length >= 2) {
        const a = URL.createObjectURL(mine[0].blob), b = URL.createObjectURL(mine[mine.length - 1].blob); photoUrls.push(a, b);
        box.innerHTML = `<h2>Було → стало</h2><div class="cmp" id="cmp"><img src="${b}" alt="останнє"><img class="top" id="cmpTop" src="${a}" alt="перше" style="clip-path:inset(0 ${100 - ui.cmp}% 0 0)"><div class="bar" id="cmpBar" style="left:${ui.cmp}%"></div><span class="lb l">${dm(mine[0].date)}</span><span class="lb r">${dm(mine[mine.length - 1].date)}</span></div>
          <input type="range" min="0" max="100" value="${ui.cmp}" id="cmpRange" style="margin-top:8px;padding:0;min-height:30px;background:transparent;border:0">`;
        const rg = document.getElementById('cmpRange');
        rg.oninput = () => { ui.cmp = Number(rg.value); document.getElementById('cmpTop').style.clipPath = 'inset(0 ' + (100 - ui.cmp) + '% 0 0)'; document.getElementById('cmpBar').style.left = ui.cmp + '%'; };
      }
    }).catch(() => { const grid = document.getElementById('phGrid'); if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Фото недоступні в цьому браузері</div>'; });
  }
  function measSheet(k) {
    const m = MEAS.find((x) => x[0] === k);
    openSheet(`<b>${m[1]}, ${m[2]}</b><p class="small muted">Сьогодні, ${dm(today())}</p><input inputmode="decimal" id="measIn" placeholder="${m[2]}" style="font-size:1.6rem;text-align:center"><p></p><button type="button" class="pri wide big" data-act="measSave" data-m="${k}">Зберегти</button>`);
    setTimeout(() => { const i = document.getElementById('measIn'); if (i) i.focus(); }, 250);
  }

  /* ---------- більше ---------- */
  function packBox() {
    if (!VPACKS.length) return '<div class="note small">Записаних голосів ще немає — зараз говорить системний голос телефону.</div>';
    const cur = packId(), sex = G().sex;
    const byP = (a, b) => (b.priority || 0) - (a.priority || 0), list = VPACKS.filter((x) => x.gender === sex).sort(byP).concat(VPACKS.filter((x) => x.gender !== sex).sort(byP));
    return `<label class="f">Голос тренера</label><div class="pick vp">${list.map((x) => `<button type="button" class="rst${x.id === cur ? ' on' : ''}" data-act="vpack" data-id="${x.id}"><b>${esc(x.name)}</b><span class="small muted">${esc(x.note || '')}</span></button>`).join('')}
</div>
      ${voiceInfo.mode ? `<div class="note small ${voiceInfo.mode === 'pack' ? 'ok' : 'w'}">${voiceInfo.mode === 'pack' ? 'Зараз говорить записаний голос.' : 'Остання фраза прозвучала системним голосом: ' + esc(voiceInfo.why) + '.'}</div>` : ''}
      ${cur ? `<p class="small muted" id="vpState">Перевіряю, чи збережено в телефоні…</p><button type="button" class="wide" data-act="vdl">Зберегти голос у телефоні (для роботи без інтернету)</button>` : ''}`;
  }
  async function packState() {
    const el = document.getElementById('vpState'), id = packId(); if (!el || !id) return;
    try { const p = await VOICEPACK.load(id), have = await VOICEPACK.cached(id); el.textContent = have ? 'Голос збережено в телефоні: працює без інтернету.' : 'Голос ще не збережено в телефоні (' + (p.bytes ? Math.round(p.bytes / 1e6) + ' МБ' : 'кілька МБ') + '). Без інтернету тренер говоритиме системним голосом.'; }
    catch (e) { el.textContent = 'Не вдалося завантажити голос — перевірте інтернет.'; }
  }
  /* ---------- користувач і захист ---------- */
  function accountCard() {
    const a = STORE.account(STORE.current) || {}, many = STORE.accounts().length > 1;
    return `<h2>Профіль</h2><div class="card"><div class="sp"><div><b>${esc(a.name || '')}</b><div class="small muted">дані лише в цьому телефоні</div></div>${many ? '<button type="button" class="sm" data-act="accSwitch">Змінити</button>' : ''}</div>
      <div class="row" style="margin-top:10px"><button type="button" class="sm ghost" data-act="accRename">Змінити імʼя</button></div>
      <button type="button" class="danger wide" style="margin-top:10px" data-act="accDelete">Видалити мої дані й почати заново</button></div>`;
  }
  /* вибір програми — лише якщо з попередньої версії лишилось кілька журналів */
  function progCard() {
    const own = Object.keys(DB.profiles).filter((k) => PROGRAMS[k]), g = G();
    return own.length > 1
      ? `<label class="f">Програма</label><select id="progSel">${own.map((k) => `<option value="${k}"${k === DB.active ? ' selected' : ''}>${esc(PROGRAMS[k].title)}</option>`).join('')}</select>`
      : `<div><b>${esc(g.title)}</b>${g.sub ? `<div class="small muted">${esc(g.sub)}</div>` : ''}</div>`;
  }
  /* обладнання вдома — будь-коли додати чи прибрати; програма перебудовується, історія й рекорди лишаються */
  function eqCard(p) {
    const a = DB.custom && DB.custom.answers; if (!a || a.place === 'gym') return '';
    const eq = a.equip || [], mk = Object.keys(GEN.MACH), allM = mk.every((k) => eq.indexOf(k) >= 0), dis = p.draft ? ' disabled' : '';
    const btn = (k, l) => `<button type="button" class="sm${eq.indexOf(k) >= 0 ? ' pri' : ''}" data-act="homeEq" data-v="${k}" aria-pressed="${eq.indexOf(k) >= 0}"${dis}>${esc(l)}</button>`;
    return `<h2>Обладнання вдома</h2><div class="card"><p class="small muted">Додали чи прибрали — програма перебудується під те, що є; історія й рекорди лишаються.</p>
      <div class="row">${btn('db', 'Гантелі')}${btn('band', 'Петля')}</div>
      <label class="f">Тренажери (ті самі, що в залі)</label><button type="button" class="sm wide${allM ? ' pri' : ''}" data-act="homeEqAll" aria-pressed="${allM}"${dis}>${allM ? '✓ ' : ''}Усе, як у залі</button>
      <div class="row" style="margin-top:8px">${mk.map((k) => btn(k, GEN.MACH[k][0])).join('')}</div>${p.draft ? '<p class="tiny muted">Обладнання — після завершення тренування.</p>' : ''}</div>`;
  }
  function rMore() {
    const p = P(), prog = G(), V = S().voice, hasDb = Object.values(prog.ex).some((ex) => !ex.retired && GEN.needs(ex) === 'db');  // вибулі (з історії) — не рахуються
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    /* після 12 тижнів — цикли з тижнів 5–12 (як у «Плані»): вибір тижня — у поточному циклі */
    const cp = ENGINE.planFor(prog, nextN()), curWeek = cp.week, wks = cp.cycle === 1 ? Array.from({ length: 12 }, (_, k) => k + 1) : Array.from({ length: 8 }, (_, k) => k + 5);
    const sw = (k, l, d) => `<label class="sw"><span>${l}<div class="tiny muted">${d}</div></span><input type="checkbox" data-set="${k}"${S()[k] ? ' checked' : ''}></label>`;
    const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-act="vset" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const vl = VOICE.list();
    const voiceBox = !VOICE.supported ? '<div class="note w small">Цей браузер не вміє озвучувати текст. На iPhone голос працює в Safari й у встановленому застосунку.</div>'
      : !vl.length ? '<div class="note w small"><b>Українського голосу не знайдено.</b> На iPhone: Параметри → Доступність → розділ про озвучення вмісту (англ. Spoken Content) → Голоси → Українська — завантажте голос і перезапустіть застосунок.</div>'
      : `<label class="f">Голос</label><select id="voiceSel">${vl.map((v) => `<option value="${esc(v.uri)}"${v.uri === V.uri ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`;
    app.innerHTML = `<h1>Більше</h1>
      ${accountCard()}
      ${standalone ? '' : '<div class="note w small"><b>Встановіть як застосунок:</b> Safari → «Поділитися» → «На початковий екран» і відкривайте лише з іконки (в іконки й у Safari окремі сховища).</div>'}
      <h2>Голосовий тренер</h2><div class="card"><label class="sw"><span>Голос під час тренування<div class="tiny muted">${hasDb ? 'вага й диски' : 'вага'}, відпочинок, «10 секунд», «Час!», рекорди</div></span><input type="checkbox" id="voiceOn"${V.on ? ' checked' : ''}></label>
        ${packBox()}
        ${packId() ? '' : voiceBox}
        <label class="sw"><span>Говорити й у беззвучному режимі<div class="tiny muted">вимкніть, якщо слухаєте музику в іншому застосунку і вона ставатиме на паузу</div></span><input type="checkbox" id="voiceSilent"${V.silent === false ? '' : ' checked'}></label>
        <label class="f">Характер тренера</label>${seg('tone', [['hard', 'Жорсткий з гумором'], ['calm', 'Спокійний']], V.tone || 'hard')}
        <label class="f">Скільки говорити</label>${seg('level', [['full', 'Детально'], ['short', 'Коротко']], V.level)}
        ${packId() ? '' : `<label class="f">Темп</label>${seg('rate', [[0.9, 'Повільніше'], [1, 'Звичайно'], [1.1, 'Швидше']], V.rate)}`}
        <button type="button" class="wide" data-act="say" data-what="test">🔊 Перевірити голос</button>
        <p class="tiny muted">Голос звучить, коли застосунок відкритий і екран увімкнений («Не гасити екран» нижче). Не чути — перевірте гучність і перемикач беззвучного режиму.</p></div>
      <h2>Музика</h2><div class="card"><div class="sp"><div><b>Радіо для тренувань</b><div class="small muted">${RADIO.cur ? esc(RADIO.cur.name) + ' · ' + ({ playing: 'грає', loading: 'підключаюся', paused: 'пауза', error: 'не відповідає' }[RADIO.state] || '') : RADIO.STATIONS.length + ' станцій: денс, хіти, українські, рок, метал, драм-н-бейс'}</div></div><button type="button" class="sm pri" data-act="radio">Відкрити</button></div></div>
      <h2>Тренування</h2><div class="card"><label class="f">Екран тренування</label>${seg('mode', [['coach', 'Тренер · крок за кроком'], ['list', 'Список вправ']], S().mode)}
        ${sw('sound', 'Звук таймера', 'сигнал, коли відпочинок скінчився')}${sw('haptics', 'Вібровідгук', 'на iPhone з iOS 18+, якщо підтримується')}${sw('awake', 'Не гасити екран', 'під час тренування')}</div>
      <h2>Програма</h2><div class="card">${progCard()}
        <button type="button" class="wide" style="margin-top:10px" data-act="qEdit"${p.draft ? ' disabled' : ''}>${DB.custom ? 'Змінити анкету й оновити програму' : 'Скласти програму за анкетою'}</button>
        <label class="f">Наступне тренування — тиждень</label><select id="weekSel"${p.draft ? ' disabled' : ''}>${wks.map((w) => `<option value="${w}"${w === curWeek ? ' selected' : ''}>${w}${cp.cycle > 1 ? ' · цикл ' + cp.cycle : ''}</option>`).join('')}</select>
        <label class="f">Дні тренувань</label><div class="row">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="sm${p.days.indexOf(d) >= 0 ? ' pri' : ''}" data-act="day" data-d="${d}"${p.draft ? ' disabled' : ''}>${DAYS[d]}</button>`).join('')}</div>${p.draft ? '<p class="tiny muted">Анкета, дні й тиждень — після завершення тренування.</p>' : ''}</div>
      ${eqCard(p)}
      ${hasDb ? `<h2>Гантелі</h2><div class="card"><label class="f">Вага грифа без дисків, кг</label><input inputmode="decimal" id="handleIn" value="${fmt(p.handle)}">
        <label class="f">Диски на обидві гантелі: 5 · 2,5 · 1,25 кг (штук)</label><div class="grid3"><input inputmode="numeric" data-inv="5" value="${p.inv[5]}"><input inputmode="numeric" data-inv="2.5" value="${p.inv[2.5]}"><input inputmode="numeric" data-inv="1.25" value="${p.inv[1.25]}"></div>
        <p class="tiny muted">Крок ваги зараз: ${fmt(ENGINE.stepFor(p.inv))} кг на гантель.</p></div>` : ''}
      <h2>Порадник і підказки</h2><div class="card" style="padding:10px 12px">${guideChips()}<div class="quick"><button type="button" class="sm" data-act="food">Харчування</button><button type="button" class="sm" data-act="glAll">Словник термінів</button><button type="button" class="sm" data-act="whatsnew">Можливості</button><button type="button" class="sm" data-act="tourReset">Показати навчання знову</button></div></div>
      <h2>Резервна копія</h2><div class="card"><p class="small">Дані лише в цьому телефоні. Раз на тиждень зберігайте копію в iCloud, «Файли» чи Telegram.</p><p class="tiny muted">Остання копія: ${DB.lastBackup ? dm(DB.lastBackup) : 'ще не було'}</p>
        <label class="sw"><span>Разом із фото<div class="tiny muted">файл буде більшим</div></span><input type="checkbox" id="bkPhotos"></label>
        <button type="button" class="pri wide" data-act="backup">Зберегти резервну копію</button><p></p>
        <label class="btn" style="display:block;text-align:center">Відновити з копії<input type="file" id="restoreIn" accept=".json,application/json" style="display:none"></label><p></p>
        <button type="button" class="wide" data-act="csv">Вивантажити таблицю (CSV)</button></div>
      <h2>Про застосунок</h2><div class="card"><p class="small muted">Версія ${VERSION} · <span id="persist">перевіряю сховище…</span></p><p class="tiny muted">Без реєстрації й реклами: ваші дані не залишають телефон. Голос тренера — записані фрази; збережені в телефоні, вони працюють без інтернету. Apple Health, віджети й Live Activity веб-застосункам на iPhone недоступні.</p></div>`;
    document.getElementById('voiceOn').onchange = (e) => { V.on = e.target.checked; save(); if (V.on) { VOICE.unlock(); talk('Голос увімкнено.'); } else { VOICE.stop(); VOICEPACK.stop(); } };
    document.getElementById('voiceSilent').onchange = (e) => { V.silent = e.target.checked; save(); audioMode(); };
    const vs = document.getElementById('voiceSel'); if (vs) vs.onchange = () => { V.uri = vs.value; save(); talk('Так звучить цей голос.'); };
    if (document.getElementById('progSel')) document.getElementById('progSel').onchange = (e) => { DB.active = e.target.value; if (!DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(DB.active); fixProfiles(ENGINE.migrate(DB)); save(); render(); initPacks(); };
    document.getElementById('weekSel').onchange = (e) => {
      const w = Number(e.target.value), pw = G().perWeek || 3, base = cp.cycle === 1 ? (w - 1) * pw : 12 * pw + (cp.cycle - 2) * 8 * pw + (w - 5) * pw;
      p.offset = base - p.sessions.length; save(); toast('Наступне тренування — тиждень ' + w + (cp.cycle > 1 ? ' · цикл ' + cp.cycle : ''));
    };
    if (hasDb) document.getElementById('handleIn').onchange = (e) => { const v = num(e.target.value); if (v === null || v < 0 || v > 10) { toast('Вага грифа — від 0 до 10 кг'); e.target.value = fmt(p.handle); return; } p.handle = v; syncAnswers({ handle: v }); save(); toast('Збережено'); };
    app.querySelectorAll('[data-inv]').forEach((el) => { el.onchange = () => { const v = num(el.value); if (v === null || v < 0 || v > 40) { el.value = p.inv[el.dataset.inv]; return; } p.inv[el.dataset.inv] = Math.round(v); syncAnswers({ inv: { 5: p.inv[5], 2.5: p.inv[2.5], 1.25: p.inv[1.25] } }); save(); rMore(); }; });
    app.querySelectorAll('[data-set]').forEach((el) => { el.onchange = () => { S()[el.dataset.set] = el.checked; save(); if (el.dataset.set === 'haptics' && el.checked) haptic(); }; });
    document.getElementById('restoreIn').onchange = (e) => { if (e.target.files && e.target.files[0]) restore(e.target.files[0]); };
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((v) => { const el = document.getElementById('persist'); if (el) el.textContent = v ? 'сховище захищене від автоочищення' : 'робіть резервні копії'; }).catch(() => {});
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
    if (ok) { DB.lastBackup = today(); save(); toast('Резервну копію створено'); rMore(); }
  }
  function csv() {
    const prog = G(), h = P().handle, rows = [['дата', 'тиждень', 'тренування', 'місце', 'спина', 'вправа', 'варіант', 'тип', 'підхід', 'вага_кг', 'разом_кг', 'повторення_або_с', 'запас', 'міні_підходи']];
    P().sessions.forEach((s) => { const cnt = {}; s.sets.forEach((x) => { const ex = prog.ex[x.ex] || { name: x.ex }; cnt[x.ex] = (cnt[x.ex] || 0) + 1;
      const tot = (x.load === null || x.load === undefined || ex.type === 'band') ? '' : String(ENGINE.totalLoad(ex, x.load, h, x.variant));
      rows.push([s.date, s.week, s.workout, s.place === 'gym' ? 'зал' : s.place === 'home' ? 'дім' : '', s.ready || '', ex.name, x.variant || '', x.type || 'N', cnt[x.ex], x.load === null || x.load === undefined ? '' : x.load, tot, x.reps, x.rir === null || x.rir === undefined ? '' : x.rir, (x.mini || []).join('+')]); }); });
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
        if (!confirm('Відновити копію від ' + String(o.exported || '').slice(0, 10) + ' (' + plural(cnt, 'тренування', 'тренування', 'тренувань') + ')? Поточні дані на цьому телефоні буде замінено.')) return;
        if (o.db.custom && o.db.custom.answers) { PROGRAMS.me = buildMe(o.db.custom.answers); STORE.update(STORE.current, { name: o.db.custom.answers.name, sub: PROGRAMS.me.sub }); }
        else if ((STORE.account(STORE.current) || {}).name === 'Новий акаунт') STORE.update(STORE.current, { name: 'Мій профіль' });
        ui.q = null;
        DB = fixProfiles(ENGINE.migrate(o.db)); if (DB.custom && DB.custom.answers) PROGRAMS.me = buildMe(DB.custom.answers);  // вибулі вправи — з відновленої історії
        if (!DB.active || !DB.profiles[DB.active] || !PROGRAMS[DB.active]) DB.active = Object.keys(DB.profiles).filter((k) => PROGRAMS[k])[0] || null;
        VOICE.init(DB.settings.voice); RADIO.setDuck(DB.settings.radio.duck); syncLegacy();
        if (o.photos && o.photos.length) { for (const x of o.photos) { try { await STORE.putPhoto({ id: x.id, profile: x.profile, date: x.date, pose: x.pose, blob: STORE.dataToBlob(x.data) }); } catch (e) { /* пропуск */ } } }
        save(); toast('Дані відновлено'); view = DB.active ? 'home' : 'onboard'; render(); initPacks();
      } catch (e) { toast('Це не схоже на резервну копію журналу'); }
    };
    r.readAsText(file);
  }

  /* ---------- дії ---------- */
  function exMenu(i) {
    const d = P().draft, it = d.items[i], ex = G().ex[it.ex];
    const fw = it.sets.find((s) => s.type !== 'W');
    const canWarm = ENGINE.warmups(ex, fw ? fw.load : null, ENGINE.stepFor(P().inv), G().warm, isMach(ex) ? loadStep(ex, it.ex) : 0).length && !it.sets.some((s) => s.type === 'W');
    const started = it.sets.some((s) => s.done);
    openSheet(`<div class="sp"><b>${esc(ex.name)}</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">${esc(ex.m.p.map(mName).join(' · '))}${ex.m.s.length ? ' · допоміжні: ' + esc(ex.m.s.map(mName).join(', ')) : ''}</p>
      ${techHtml(it.ex, true)}
      <button type="button" class="wide" data-act="say" data-what="exTip" data-ex="${it.ex}">🔊 Прослухати техніку</button>
      <div class="grid2" style="margin-top:10px">
        <button type="button" data-act="swap" data-i="${i}"${started ? ' disabled' : ''}>🔄 Замінити</button>
        <button type="button" data-act="skip" data-i="${i}">⏭ Пропустити</button>
        <button type="button" data-act="addset" data-i="${i}">+ Підхід</button>
        <button type="button" data-act="delset" data-i="${i}">− Останній підхід</button>
        ${dropOk(it) ? `<button type="button" data-act="dropset" data-i="${i}">⬇ Дроп-сет</button>` : ''}
        ${canWarm ? `<button type="button" data-act="warm" data-i="${i}">Розминковий підхід</button>` : ''}
      </div>${started ? '<p class="tiny muted">Заміна — лише до першого підходу вправи.</p>' : ''}
      <label class="f">Моя нотатка до вправи (видно щоразу)</label><textarea id="exNote" placeholder="наприклад: крісло біля стіни, хват ширший">${esc(P().notes[it.ex] || '')}</textarea><p></p>
      <button type="button" class="pri wide" data-act="noteSave" data-i="${i}">Зберегти нотатку</button>`);
  }
  function swapSheet(i) {
    const d = P().draft, it = d.items[i], prog = G();
    const alts = ENGINE.alternatives(prog, it.ex, d.ready && d.ready !== 'g', d.items.map((x) => x.ex), d.place).slice(0, 6);
    openSheet(`<div class="sp"><b>Замінити «${esc(prog.ex[it.ex].name)}»</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">Вправи на ті самі мʼязи з вашої програми${d.ready && d.ready !== 'g' ? ', без навантаження на поперек' : ''}.</p>
      ${alts.length ? `<div class="pick">${alts.map((id) => `<button type="button" data-act="swapTo" data-i="${i}" data-ex="${id}"><b>${esc(prog.ex[id].name)}</b><span class="small muted">${esc(prog.ex[id].m.p.map(mName).join(' · '))}</span></button>`).join('')}</div>` : '<div class="empty">Рівноцінної заміни в програмі немає — можна пропустити вправу.</div>'}`);
  }
  function doSwap(i, to) {
    const p = P(), d = p.draft, old = d.items[i], prog = G(), plan = ENGINE.planFor(prog, d.n);
    const base = { ex: to, sets: workCount(old), min: old.min, max: old.max, rest: old.rest };
    const myo = !!prog.myoFrom && plan.week >= prog.myoFrom && !plan.deload;
    const nw = makeItem(base, old.ss, plan, ENGINE.stepFor(p.inv), { from: old.from || old.ex, myo, where: d.place });
    nw.skipped = false; d.items[i] = nw; save(); closeSheet(); rWorkout();
    talk('Заміна. ' + prog.ex[to].name + '.');
  }
  function sayWhat(b) {
    const w = b.dataset.what, d = P() && P().draft;
    if (w === 'gl') { const g = GLOSSARY[b.dataset.k]; if (g) say1(g[0] + '. ' + g[1]); return; }
    if (w === 'exTip') { const ex = G().ex[b.dataset.ex], sc = script(b.dataset.ex); if (ex) say1(ex.name + '. ' + (sc ? COACH.howText(sc) + ' ' + COACH.dontText(sc) : ex.tip)); return; }
    if (w === 'test') { say1('Привіт! Я твій тренер. Так звучатиме голос під час тренування.'); return; }
    if (!d) return;
    if (w === 'warm') { const wl = warmList(); say1(wl.title + '.\n' + wl.items.join('\n')); return; }
    const cs = curStep(d); if (!cs) { say1(coolText() ? 'Заминка: ' + coolText() : 'Усі підходи зроблено.'); return; }
    if (w === 'tip') { const id = d.items[cs.i].ex, sc = script(id); say1(G().ex[id].name + '. ' + (sc ? COACH.howText(sc) + ' ' + COACH.dontText(sc) : G().ex[id].tip)); return; }
    say1((T.id && T.kind === 'rest' ? 'Далі. ' : '') + setSpeech(d, cs, true));
  }
  function say1(t) {
    if (!S().voice.on) { toast('Голос вимкнено: «Більше» → «Голосовий тренер»'); return; }
    if (!talk(t)) toast(VOICE.supported ? 'Українського голосу в телефоні не знайдено — див. «Більше» → «Голосовий тренер»' : 'Цей браузер не вміє озвучувати текст');
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
    if (act === 'rplay') { ensureAudio(); VOICE.unlock(); S().radio.id = b.dataset.id; save(); RADIO.play(b.dataset.id, audio); return radioSheet(); }
    if (act === 'rpause') { RADIO.pause(); return; }
    if (act === 'rresume') { ensureAudio(); RADIO.resume(); return; }
    if (act === 'rstop') { RADIO.stop(); if (document.body.classList.contains('sheet')) radioSheet(); return; }
    if (act === 'rduck') { S().radio.duck = Number(b.dataset.v); RADIO.setDuck(S().radio.duck); save(); return radioSheet(); }
    if (act === 'food') { view = 'body'; ui.bodyTab = 'n'; render(); window.scrollTo(0, 0); return; }
    /* знайомство */
    /* користувач і захист */
    if (act === 'accSwitch') return ACC.leave();
    if (act === 'accRename') {
      const cur = (STORE.account(STORE.current) || {}).name || '', nm = (prompt('Нове імʼя', cur) || '').trim();
      if (!nm || nm === cur) return; if (nm.length > 24) { toast('Імʼя — до 24 знаків'); return; }
      STORE.update(STORE.current, { name: nm }); if (DB.custom) { DB.custom.answers.name = nm; save(); } rMore(); return;
    }
    if (act === 'accDelete') {
      if (!confirm('Видалити всі ваші тренування, заміри й фото на цьому телефоні й почати з анкети?')) return;
      if (!confirm('Точно? Повернути можна лише з резервної копії.')) return;
      ACC.wipe(STORE.current); return;
    }
    /* під час тренування анкета не змінюється: нова програма скасувала б незавершене тренування */
    if (act === 'qEdit') { if (P() && P().draft) return; ui.q = null; qState(); view = 'onboard'; render(); window.scrollTo(0, 0); return; }
    /* анкета */
    if (act === 'qSex' || act === 'qGoal' || act === 'qLevel' || act === 'qPlace') {
      qRead(); const a = qState().a; a[{ qSex: 'sex', qGoal: 'goal', qLevel: 'level', qPlace: 'place' }[act]] = b.dataset.v;
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
      syncAnswers({ equip: eq }); save(); toast('Програму оновлено під обладнання — історія й рекорди лишаються'); return rMore();
    }
    if (act === 'qLimit') {
      qRead(); const L = qState().a.limits, v = b.dataset.v;
      if (v === 'none') { const had = L.indexOf('none') >= 0; L.length = 0; if (!had) L.push('none'); }
      else { const k = L.indexOf('none'); if (k >= 0) L.splice(k, 1); qToggle(L, v); }
      haptic(); return rOnboard();
    }
    if (act === 'qDay') { qRead(); if (!qToggle(qState().a.days, Number(b.dataset.v), 4)) toast('Максимум 4 дні — оберіть, який прибрати'); haptic(); return rOnboard(); }
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
    if (act === 'jump') { const k = Number(b.dataset.k), t = today(); const r = p.daily[t] = p.daily[t] || {}; r.jumps = (r.jumps || 0) >= k ? k - 1 : k; save(); haptic(); return rHome(); }
    /* тренування */
    if (act === 'minimize') { view = 'home'; return render(); }
    if (act === 'finish') return finishWorkout();
    if (act === 'discard') { if (confirm('Скасувати тренування? Відмічені підходи не збережуться.')) { p.draft = null; save(); stopTimer(); view = 'home'; render(); } return; }
    if (act === 'done') return toggleDone(i, j);
    if (act === 'kp') return openKp(i, j, b.dataset.f);
    if (act === 'stype') { if (p.draft.items[i].sets[j].done) return toast('Підхід уже позначено ✓ — спершу зніміть позначку'); return typeSheet(i, j); }
    if (act === 'stypeSet') { const s = p.draft.items[i].sets[j]; s.type = b.dataset.t; save(); haptic(); closeSheet(); return rWorkout(); }
    if (act === 'mode') { S().mode = S().mode === 'list' ? 'coach' : 'list'; if (S().mode === 'coach' && p.draft && p.draft.coach) p.draft.coach.warm = true; save(); render(); window.scrollTo(0, 0); return; }
    if (act === 'cdone') return coachDone();
    if (act === 'cwarm') { p.draft.coach.warm = true; save(); rWorkout(); window.scrollTo(0, 0); const cs = curStep(p.draft); if (cs) talk((b.dataset.skip ? '' : L('warmDone', p.draft.n) || 'Добре. ') + 'Перша вправа. ' + setSpeech(p.draft, cs)); return; }
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
    if (act === 'tskip') { const k = T.kind; stopTimer(); if (k === 'myo') { talk('Ще від трьох до пʼяти повторень.'); return rWorkout(); } const cs = curStep(p.draft); if (cs) talk(setSpeech(p.draft, cs, true)); return rWorkout(); }
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
      save(); haptic(); closeSheet(); toast('Дроп-сет додано — одразу після останнього підходу, без відпочинку'); return rWorkout();
    }
    if (act === 'addset') { const it = p.draft.items[i], l = it.sets.filter((x) => x.type !== 'W').slice(-1)[0] || it.sets[it.sets.length - 1] || {}; it.sets.push({ type: 'N', load: l.load === undefined ? null : l.load, reps: l.reps === undefined ? null : l.reps, rir: null, done: false, pr: [], prev: null, touched: false }); save(); closeSheet(); return rWorkout(); }
    if (act === 'warm') { const it = p.draft.items[i], ex = G().ex[it.ex], fw = it.sets.find((s) => s.type !== 'W'); const ws = ENGINE.warmups(ex, fw ? fw.load : null, ENGINE.stepFor(p.inv), G().warm, isMach(ex) ? loadStep(ex, it.ex) : 0); it.sets = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true })).concat(it.sets); save(); closeSheet(); return rWorkout(); }
    if (act === 'exmenu') return exMenu(i);
    if (act === 'noteSave') { const it = p.draft.items[i]; const v = document.getElementById('exNote').value.trim(); if (v) p.notes[it.ex] = v; else delete p.notes[it.ex]; save(); closeSheet(); toast('Нотатку збережено'); return rWorkout(); }
    if (act === 'delset') { const it = p.draft.items[i]; if (it.sets.length > 1 && !it.sets[it.sets.length - 1].done) it.sets.pop(); save(); closeSheet(); return rWorkout(); }
    if (act === 'skip') { p.draft.items[i].skipped = true; save(); closeSheet(); rWorkout(); const cs = curStep(p.draft); if (cs && S().mode !== 'list' && !T.id) talk((hard() ? COACH.line('skip', G().sex, 0) + ' ' : 'Пропускаємо. ') + 'Далі. ' + setSpeech(p.draft, cs)); return; }
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
      save(); toast('Зміни збережено'); return sessSheet(s.id, false);
    }
    if (act === 'sessDel') { if (!confirm('Видалити це тренування з журналу?')) return; p.sessions = p.sessions.filter((x) => x.id !== Number(b.dataset.id)); save(); closeSheet(); return render(); }
    /* прогрес */
    if (act === 'progTab') { ui.progTab = b.dataset.v; return rProgress(); }
    if (act === 'metric') { ui.metric = b.dataset.v; return rProgress(); }
    if (act === 'range') { ui.range = b.dataset.v; return rProgress(); }
    if (act === 'musDays') { ui.musDays = Number(b.dataset.v); return rProgress(); }
    if (act === 'repPrev' || act === 'repNext') { const ym = ui.repMonth || today().slice(0, 7); let [Y, M] = ym.split('-').map(Number); M += act === 'repNext' ? 1 : -1; if (M < 1) { M = 12; Y--; } if (M > 12) { M = 1; Y++; } ui.repMonth = Y + '-' + pad(M); return rProgress(); }
    /* тіло */
    if (act === 'bodyTab') { ui.bodyTab = b.dataset.v; return rBody(); }
    if (act === 'pose') { ui.photoPose = b.dataset.v; return rBody(); }
    if (act === 'measAdd') return measSheet(b.dataset.m);
    if (act === 'measSave') {
      const m = MEAS.find((x) => x[0] === b.dataset.m), v = num(document.getElementById('measIn').value);
      if (v === null || v < m[3] || v > m[4]) { toast('Перевірте число'); return; }
      const arr = p.body[m[0]] = p.body[m[0]] || [], t = today(), k = arr.findIndex((q) => q.d === t);
      if (k >= 0) arr[k].v = v; else arr.push({ d: t, v }); save(); closeSheet(); toast('Збережено'); return rBody();
    }
    if (act === 'photo') {
      const id = Number(b.dataset.id); const img = b.querySelector('img');
      openSheet(`<img src="${img ? img.src : ''}" style="width:100%" alt="фото"><p></p><button type="button" class="ghost wide" style="color:var(--bad);border-color:var(--bad)" data-act="photoDel" data-id="${id}">Видалити фото</button>`); return;
    }
    if (act === 'photoDel') { if (!confirm('Видалити фото?')) return; STORE.delPhoto(Number(b.dataset.id)).then(() => { closeSheet(); rBody(); }); return; }
    if (act === 'meSave') {
      const h = num(document.getElementById('meH').value), a = num(document.getElementById('meA').value), te = document.getElementById('meT') ? num(document.getElementById('meT').value) : null;
      /* межі — як в анкеті: зріст і вік ідуть і в програму (вік від 55 — інший обсяг) */
      if (h !== null && (h < 130 || h > 220)) { toast('Зріст — від 130 до 220 см'); return; }
      if (a !== null && (a < 16 || a > 85)) { toast('Вік — від 16 до 85'); return; }
      if (te !== null && (te < 35 || te > 250)) { toast('Цільова вага — від 35 до 250 кг'); return; }
      p.me = { height: h, age: a, target: te };
      const sa = {}; if (h !== null) sa.height = h; if (a !== null) sa.age = a; if (Object.keys(sa).length) syncAnswers(sa);
      save(); toast('Збережено'); return rBody();
    }
    if (act === 'saveTests') {
      const rec = { d: today() }; let any = false;
      TESTS.forEach(([k]) => { const v = num(document.getElementById('t_' + k).value); rec[k] = v; if (v !== null) any = true; });
      if (!any) { toast('Заповніть хоча б один тест'); return; }
      const idx = p.body.tests.findIndex((t) => t.d === rec.d); if (idx >= 0) p.body.tests[idx] = rec; else p.body.tests.push(rec);
      save(); toast('Тести збережено'); return rBody();
    }
    /* більше */
    if (act === 'vset') { const k = b.dataset.k, v = b.dataset.v; if (k === 'mode') S().mode = v; else S().voice[k] = k === 'rate' ? Number(v) : v; save(); rMore(); if (k !== 'mode') { VOICE.unlock(); talk(k === 'rate' ? 'Такий темп.' : k === 'tone' ? (v === 'calm' ? 'Добре, говоритиму спокійно.' : 'Жарти лишаються. Скінчилось лише філонство.') : v === 'short' ? 'Говоритиму коротко.' : 'Говоритиму детально.'); } return; }
    if (act === 'vpack') { ensureAudio(); S().voice.packs[DB.active] = b.dataset.id; S().voice.packsManual = S().voice.packsManual || {}; S().voice.packsManual[DB.active] = true; save(); const id = b.dataset.id;
      if (id) VOICEPACK.load(id).then(() => { rMore(); talk('Привіт! Я твій тренер. Так звучатиме голос під час тренування.'); VOICEPACK.download(id).then(() => packState()).catch(() => {}); }).catch(() => toast('Не вдалося завантажити голос — перевірте інтернет'));
      else { rMore(); talk('Так звучить системний голос.'); }
      return; }
    if (act === 'vdl') { const id = packId(), el = document.getElementById('vpState'); b.disabled = true;
      VOICEPACK.download(id, (d, t) => { if (el) el.textContent = 'Зберігаю: ' + (t ? Math.round(d / t * 100) + ' %' : Math.round(d / 1e6) + ' МБ') + '…'; }).then(() => { toast('Голос збережено в телефоні'); packState(); b.disabled = false; }).catch(() => { toast('Не вдалося — перевірте інтернет'); b.disabled = false; });
      return; }
    if (act === 'tourReset') { S().tour = { v3: true }; save(); toast('Навчання покажеться на головній і в першому тренуванні'); view = 'home'; return render(); }
    if (act === 'day') {
      if (p.draft) return;
      const dd = Number(b.dataset.d), nd = p.days.slice(), k = nd.indexOf(dd); if (k >= 0) nd.splice(k, 1); else nd.push(dd); nd.sort();
      /* програма за анкетою — від 2 до 4 днів, як в анкеті; дні йдуть і в програму (скільки тренувань на тиждень) */
      if (DB.custom && (nd.length < 2 || nd.length > 4)) { toast('Від 2 до 4 днів на тиждень'); return; }
      p.days = nd; syncAnswers({ days: nd }); save(); return rMore();
    }
    if (act === 'backup') return backup();
    if (act === 'csv') return csv();
  }
  app.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) handle(b, e); });
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'qAgree') { qState().a.agree = t.checked; return; }
    if (t.dataset && t.dataset.act === 'daily') { const d = today(); const r = P().daily[d] = P().daily[d] || {}; r[t.dataset.id] = t.checked; save(); haptic(); }
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
  /* iOS «присипляє» звук після згортання — будь-який дотик його будить */
  document.addEventListener('pointerdown', () => { VOICEPACK.unlock(); if (audio && audio.state !== 'running') { try { audio.resume(); } catch (e) { /* немає */ } } }, { passive: true });
  if (DB.active && !DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(DB.active);
  if (DB.active) ENGINE.migrate(DB);
  render();
  initPacks();
  window.__app = { get DB() { return DB; }, get T() { return T; }, get missed() { return Array.from(missedSegs); }, talk: (t) => talk(t), initPacks: () => initPacks(), render: () => render(), set view(v) { view = v; } };
};
