/* Журнал тренувань 2.0 — інтерфейс. Дані лише в цьому телефоні + резервна копія файлом. */
(() => {
  'use strict';
  const VERSION = '2.2.0';
  const app = document.getElementById('app');
  const sheetEl = document.getElementById('sheet'), sheetBg = document.getElementById('sheetBg');
  let DB = fixProfiles(STORE.load());
  function fixProfiles(db) { Object.keys(db.profiles || {}).forEach((id) => { const p = db.profiles[id]; if (p && !Array.isArray(p.days) && PROGRAMS[id]) p.days = PROGRAMS[id].days.slice(); }); return db; }
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
  function ensureAudio() { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } } if (audio && audio.state === 'suspended') audio.resume(); }
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (view === 'workout' && P() && P().draft) keepAwake(true); tickTimer(); } });

  /* ---------- шторка ---------- */
  function openSheet(html) { sheetEl.innerHTML = '<div class="grab"></div>' + html; document.body.classList.add('sheet'); }
  function closeSheet() { document.body.classList.remove('sheet'); kp = null; }
  sheetBg.addEventListener('click', closeSheet);

  /* ---------- таймер відпочинку ---------- */
  const timerEl = document.getElementById('timer');
  const T = { end: 0, total: 0, id: null, alarmed: false, next: '' };
  function startTimer(sec, next) {
    if (!(sec > 0)) { stopTimer(); return; }
    T.end = Date.now() + sec * 1000; T.total = sec; T.alarmed = false; T.next = next || '';
    timerEl.className = 'on'; clearInterval(T.id); T.id = setInterval(tickTimer, 250); tickTimer();
  }
  function stopTimer() { clearInterval(T.id); T.id = null; timerEl.className = ''; }
  function tickTimer() {
    if (!T.id) return;
    const left = Math.ceil((T.end - Date.now()) / 1000);
    const f = Math.max(0, Math.min(1, left / T.total)), r = 22, c = 2 * Math.PI * r;
    const ring = `<svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="${r}" fill="none" style="stroke:rgba(127,127,127,.35)" stroke-width="5"/><circle cx="27" cy="27" r="${r}" fill="none" style="stroke:currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 27 27)"/></svg>`;
    if (left <= 0) {
      if (!T.alarmed) { T.alarmed = true; beep(); haptic(); }
      timerEl.className = 'on al';
      timerEl.innerHTML = ring + `<div><div class="tt">Час!</div><div class="tn">${esc(T.next || 'Наступний підхід')}</div></div><div class="tb2"><button type="button" data-t="x">Готово</button></div>`;
      if (left < -30) stopTimer();
      return;
    }
    timerEl.innerHTML = ring + `<div><div class="tt">${Math.floor(left / 60)}:${pad(left % 60)}</div><div class="tn">${esc(T.next ? 'Далі: ' + T.next : 'Відпочинок')}</div></div>
      <div class="tb2"><button type="button" data-t="-15">−15</button><button type="button" data-t="+15">+15</button><button type="button" data-t="x">✕</button></div>`;
  }
  timerEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'x') return stopTimer();
    const d = b.dataset.t === '+15' ? 15000 : -15000; T.end = Math.max(Date.now() + 1000, T.end + d); T.total = Math.max(T.total, Math.ceil((T.end - Date.now()) / 1000)); T.alarmed = false; tickTimer();
  });

  /* ---------- навігація ---------- */
  document.getElementById('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]'); if (!b) return; view = b.dataset.tab; render(); window.scrollTo(0, 0);
  });
  let elapsedT = null;
  function render() {
    closeSheet();
    const nav = document.getElementById('tabs');
    nav.style.display = (view === 'onboard' || view === 'workout' || view === 'summary') ? 'none' : '';
    document.body.classList.toggle('wkv', view === 'workout');
    app.classList.toggle('wv', view === 'workout');
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === view));
    clearInterval(elapsedT);
    if (view !== 'workout') keepAwake(false);
    ({ onboard: rOnboard, home: rHome, workout: rWorkout, summary: rSummary, plan: rPlan, progress: rProgress, body: rBody, more: rMore }[view] || rHome)();
  }

  /* ---------- знайомство ---------- */
  function rOnboard() {
    if (ui.ob === 1) {
      app.innerHTML = `<h1>Журнал тренувань</h1><p class="muted">Ваші програми, підказки ваги за правилами прогресії, рекорди, графіки, карта мʼязів і фото — усе в телефоні, без реєстрації й підписок.</p>
        <h2>Чия це програма?</h2><div class="pick">${Object.values(PROGRAMS).map((p) => `<button type="button" data-act="obProg" data-id="${p.id}"><b>${esc(p.title)}</b><span class="muted small">${esc(p.sub)}</span></button>`).join('')}</div>`;
      return;
    }
    const id = ui.obProg, pr = newProfile(id);
    app.innerHTML = `<h1>Налаштування</h1><p class="muted small">Можна змінити пізніше в «Більше».</p>
      <div class="card"><label class="f">Вага грифа без дисків, кг (зважте на кухонних вагах)</label><input inputmode="decimal" id="obHandle" value="1">
      <label class="f">Диски на обидві гантелі: 5 кг · 2,5 кг · 1,25 кг (штук)</label>
      <div class="grid3"><input inputmode="numeric" id="obI5" value="4"><input inputmode="numeric" id="obI25" value="8"><input inputmode="numeric" id="obI125" value="4"></div>
      <p class="tiny muted">Без дисків 1,25 кг крок ваги — 5 кг; з ними — 2,5 кг.</p>
      <label class="f">Дні тренувань</label><div class="row" id="obDays">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="sm${pr.days.indexOf(d) >= 0 ? ' pri' : ''}" data-act="obDay" data-d="${d}">${DAYS[d]}</button>`).join('')}</div>
      <label class="f">Почати з тижня</label><select id="obWeek">${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('')}</select></div>
      <button type="button" class="pri wide big" data-act="obDone">Почати</button><p></p><button type="button" class="ghost wide" data-act="obBack">Назад</button>`;
    ui.obDays = pr.days.slice();
  }

  /* ---------- допоміжне до вправ ---------- */
  const isLoad = (ex) => ex.type === 'db' || ex.type === 'dbopt' || ex.type === 'band' || (ex.type === 'time' && ex.load);
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
  function buildDraft(wid) {
    const prog = G(), p = P(), n = nextN(), plan = ENGINE.planFor(prog, n);
    wid = wid || plan.workout;
    const items = prog.workouts[wid].items.slice();
    const pairs = prog.supersets(plan.week, wid);
    pairs.forEach((pr) => {
      if (items.some((i) => i.ex === pr[0]) && !items.some((i) => i.ex === pr[1]) && prog.ex[pr[1]]) {
        const a = items.find((i) => i.ex === pr[0]); items.push({ ex: pr[1], sets: a.sets, min: 0, max: 0, rest: a.rest });
      }
    });
    const step = ENGINE.stepFor(p.inv);
    const ordered = ENGINE.orderItems(items, pairs);
    return {
      n, week: plan.week, cycle: plan.cycle, workout: wid, deload: plan.deload, date: today(), started: Date.now(),
      items: ordered.map((o) => {
        const it = o.it, nS = prog.setsFor(it, plan.week), hist = ENGINE.history(p, it.ex);
        const sug = ENGINE.suggest(prog, it.ex, it, nS, hist, p.handle, plan.deload, step);
        const last = hist.length ? hist[hist.length - 1].sets : [];
        return { ex: it.ex, variant: defaultVariant(it.ex, plan), skipped: !!it.optional, optional: !!it.optional, note: sug.note, ss: o.ss, min: it.min, max: it.max, rest: it.rest,
          sets: sug.sets.map((s, j) => { const pv = last[j] || last[last.length - 1] || null; return { type: 'N', load: s.load, reps: s.reps, rir: null, done: false, pr: [], prev: pv ? { load: pv.load, reps: pv.reps } : null, touched: false }; }) };
      })
    };
  }
  function startWorkout(wid) {
    ensureAudio();
    P().draft = buildDraft(wid); save(); view = 'workout'; render(); window.scrollTo(0, 0);
  }
  function draftStats(d) {
    let done = 0, total = 0;
    d.items.forEach((it) => { if (it.skipped) return; it.sets.forEach((s) => { total++; if (s.done) done++; }); });
    return { done, total };
  }
  function setName(it, k) {
    const s = it.sets[k]; if (!s) return '';
    return s.type === 'W' ? 'розминка' : 'підхід ' + it.sets.slice(0, k + 1).filter((x) => x.type !== 'W').length;
  }
  function nextLabel(d, i, j) {
    const it = d.items[i], nm = (x) => G().ex[x.ex].name;
    const firstOpen = (x) => x.sets.findIndex((s) => !s.done);
    if (it.ss && it.ss.k === 1) { const b = d.items[i + 1]; if (b && !b.skipped) { const k = firstOpen(b); if (k >= 0) return nm(b) + ' · ' + setName(b, k); } }
    if (it.ss && it.ss.k === 2) { const a = d.items[i - 1]; const k = firstOpen(a); if (k >= 0) return nm(a) + ' · ' + setName(a, k); }
    const k = firstOpen(it); if (k >= 0) return nm(it) + ' · ' + setName(it, k);
    for (let x = i + 1; x < d.items.length; x++) { const y = d.items[x]; if (y.skipped) continue; const q = firstOpen(y); if (q >= 0) return nm(y) + ' · ' + setName(y, q); }
    return '';
  }

  /* ---------- екран тренування ---------- */
  function exCard(d, i) {
    const it = d.items[i], prog = G(), ex = prog.ex[it.ex];
    const range = ex.type === 'amrap' ? 'скільки зможете, запас 2' : (it.min === it.max ? it.max : it.min + '–' + it.max) + (ex.type === 'time' ? ' с' : '');
    const mus = ex.m.p.map(mName).join(' · ');
    const ssb = it.ss ? `<span class="ssb">${it.ss.g}${it.ss.k}</span>` : '';
    if (it.skipped) {
      return `<div class="exc skip"><div class="exh"><div>${ssb}<h3 style="display:inline">${esc(ex.name)}</h3><div class="mus">${it.sets.length} × ${range}${it.optional ? ' · за бажанням' : ''}</div></div>
        <button type="button" class="sm" data-act="unskip" data-i="${i}">${it.optional ? 'Додати' : 'Повернути'}</button></div></div>`;
    }
    const plat = ENGINE.plateau(ex, ENGINE.history(P(), it.ex), P().handle) ? '<div class="note w small">Плато: 3 тренування без зростання — опускання 3–4 с, пауза 2 с внизу або +1 підхід.</div>' : '';
    let note = it.note || '';
    if (it.ex === 'goblet' && it.variant === 'g1' && /максимальна/.test(note)) note += ' Час переходити на «2 гантелі на плечах».';
    const vsel = ex.variants ? `<div class="seg">${ex.variants.map((v) => `<button type="button" class="${v.id === it.variant ? 'on' : ''}" data-act="variant" data-i="${i}" data-v="${v.id}">${esc(v.label)}</button>`).join('')}</div>` : '';
    const hdr = `<div class="tr h"><span>підхід</span><span>минулого</span><span>${ex.type === 'band' ? 'рівень' : hasKg(ex) ? 'диски, кг' : ''}</span><span>${ex.type === 'time' ? 'секунди' : 'повтор.'}</span><span></span></div>`;
    const rows = it.sets.map((s, j) => {
      const lab = s.type === 'N' ? String(it.sets.slice(0, j + 1).filter((x) => x.type !== 'W').length) : ({ W: 'Р', D: 'Д', F: 'В' }[s.type]);
      const loadCell = isLoad(ex) ? `<button type="button" class="cl" data-act="kp" data-f="load" data-i="${i}" data-j="${j}">${esc(loadText(ex, s.load))}${hasKg(ex) && s.load !== null && s.load !== undefined && s.load !== '' ? '<small>+ гриф</small>' : ''}</button>` : '<span class="cl na">—</span>';
      const repCell = `<button type="button" class="cl" data-act="kp" data-f="reps" data-i="${i}" data-j="${j}">${s.reps === null || s.reps === undefined ? '—' : s.reps + (ex.type === 'time' ? ' с' : '')}${s.rir !== null && s.rir !== undefined ? `<small>запас ${s.rir === 4 ? '4+' : s.rir}</small>` : ''}</button>`;
      const pr = s.pr && s.pr.length ? `<div class="prb">🏆 ${s.pr.map((t) => ({ e1rm: 'рекорд максимуму', weight: 'рекорд ваги', reps: 'рекорд повторень' }[t])).join(' · ')}</div>` : '';
      return `<div class="tr${s.done ? ' dn' : ''}${s.pr && s.pr.length ? ' pr' : ''}"><button type="button" class="st ${s.type}" data-act="stype" data-i="${i}" data-j="${j}" aria-label="тип підходу">${lab}</button>
        <button type="button" class="pv" data-act="copyprev" data-i="${i}" data-j="${j}">${s.type === 'W' ? '' : esc(setText(ex, s.prev))}</button>${loadCell}${repCell}
        <button type="button" class="ck" data-act="done" data-i="${i}" data-j="${j}" aria-label="виконано">✓</button>${pr}</div>`;
    }).join('');
    const firstWork = it.sets.find((s) => s.type !== 'W');
    const canWarm = ENGINE.warmups(ex, firstWork ? firstWork.load : null, ENGINE.stepFor(P().inv), G().warm).length && !it.sets.some((s) => s.type === 'W');
    const userNote = P().notes[it.ex] ? `<div class="hint">📝 ${esc(P().notes[it.ex])}</div>` : '';
    return `<div class="exc${it.ss ? ' ss' : ''}">
      <div class="exh"><div>${ssb}<h3 style="display:inline">${esc(ex.name)}</h3><div class="mus">${esc(mus)} · ${it.sets.filter((s) => s.type !== 'W').length} × ${range}${ex.side ? ' · на бік' : ''} · ${it.ss && it.ss.k === 1 ? 'одразу в пару' : 'відпочинок ' + it.rest + ' с'}</div></div>
      <button type="button" class="dots" data-act="exmenu" data-i="${i}" aria-label="меню вправи">⋯</button></div>
      ${vsel}${note ? `<div class="hint">💡 ${esc(note)}</div>` : ''}${plat}${userNote}
      <div class="tb">${hdr}${rows}</div>
      <div class="exf"><div class="row"><button type="button" class="sm" data-act="addset" data-i="${i}">+ Підхід</button>${canWarm ? `<button type="button" class="sm" data-act="warm" data-i="${i}">+ Розминка</button>` : ''}</div>
      ${plateLine(ex, it, firstWork ? firstWork.load : null)}</div></div>`;
  }
  function rWorkout() {
    const p = P(), d = p.draft; if (!d) { view = 'home'; return render(); }
    const prog = G(), plan = ENGINE.planFor(prog, d.n), st = draftStats(d);
    app.innerHTML = `<div class="wbar"><button type="button" class="ghost" data-act="minimize" aria-label="згорнути">⌄</button>
      <div class="t"><b>${esc(prog.workouts[d.workout].title)}</b><span id="elapsed">0:00</span> · <span>${st.done}/${st.total}</span></div>
      <button type="button" class="pri" data-act="finish">Готово</button></div>
      <div class="prog"><i style="width:${st.total ? Math.round(st.done / st.total * 100) : 0}%"></i></div>
      <details class="card"><summary class="sp" style="list-style:none;cursor:pointer"><span><span class="chip a">Тиждень ${plan.week}${plan.cycle > 1 ? ' · цикл ' + plan.cycle : ''}</span> <span class="chip">${esc(plan.note.rir)}</span>${plan.deload ? ' <span class="chip w">легкий</span>' : ''}</span><span class="muted small">ⓘ</span></summary>
      <p class="small"><b>${esc(plan.note.phase)}.</b> ${esc(plan.note.text)}</p><p class="tiny muted">Типи підходів: торкніться номера — Р (розминка), Д (дроп), В (до відмови). Колонка «минулого» — торкніться, щоб повторити.</p></details>
      ${guideChips(['warm', 'safety', 'gear'])}
      ${d.items.map((_, i) => exCard(d, i)).join('')}
      ${cooldownNote()}
      <button type="button" class="pri wide big" data-act="finish">Завершити тренування</button><p></p>
      <button type="button" class="ghost wide" data-act="discard">Скасувати тренування</button>`;
    const el = () => { const e = document.getElementById('elapsed'); if (!e) return; const s = Math.floor((Date.now() - d.started) / 1000); e.textContent = (s >= 3600 ? Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) : Math.floor(s / 60)) + ':' + pad(s % 60); };
    el(); elapsedT = setInterval(el, 1000);
    keepAwake(true);
  }
  function cooldownNote() {
    const w = (G().guide || []).find((g) => g.id === 'warm'); if (!w) return '';
    const k = w.items.findIndex((x) => /^#Заминка/.test(x)); if (k < 0) return '';
    return `<div class="note ok small"><b>${esc(w.items[k].slice(1))}:</b> ${esc(w.items.slice(k + 1).join(' '))}</div>`;
  }
  function toggleDone(i, j) {
    const p = P(), d = p.draft, it = d.items[i], s = it.sets[j], ex = G().ex[it.ex];
    if (s.done) { s.done = false; s.pr = []; save(); rWorkout(); return; }
    if (!(Number(s.reps) > 0)) { openKp(i, j, 'reps'); return; }
    ensureAudio(); s.done = true; haptic();
    s.pr = [];
    if (s.type !== 'W') {
      const histAll = ENGINE.history(p, it.ex, 'all');
      const earlier = it.sets.slice(0, j).filter((x) => x.done && x.type !== 'W').map((x) => ({ load: x.load, reps: x.reps, variant: it.variant, type: x.type }));
      s.pr = ENGINE.prTypes(ex, { load: s.load, reps: Number(s.reps), variant: it.variant, type: s.type }, histAll.concat(earlier.length ? [{ date: d.date, sets: earlier }] : []), p.handle);
    }
    const nx = it.sets[j + 1]; if (nx && !nx.done && !nx.touched && nx.type === s.type) nx.load = s.load;
    save();
    const st = draftStats(d);
    if (st.done < st.total) {
      const rest = s.type === 'W' ? 45 : (it.ss && it.ss.k === 1 ? 0 : it.rest);
      if (rest > 0) startTimer(rest, nextLabel(d, i, j)); else stopTimer();
    } else stopTimer();
    rWorkout();
    if (s.pr.length) toast('🏆 Рекорд: ' + ex.name, true);
  }
  function finishWorkout() {
    const p = P(), d = p.draft, prog = G();
    const sets = [], prList = [];
    d.items.forEach((it) => {
      if (it.skipped) return;
      const types = new Set();
      it.sets.forEach((s) => { if (!s.done || !(Number(s.reps) > 0)) return; sets.push({ ex: it.ex, variant: it.variant || undefined, type: s.type || 'N', load: s.load === '' ? null : s.load, reps: Number(s.reps), rir: s.rir === null || s.rir === undefined ? null : Number(s.rir) }); (s.pr || []).forEach((t) => types.add(t)); });
      if (types.size) prList.push({ ex: it.ex, types: Array.from(types) });
    });
    if (!sets.length) { if (confirm('Жодного підходу не відмічено. Закрити тренування без збереження?')) { p.draft = null; save(); stopTimer(); view = 'home'; render(); } return; }
    const st = draftStats(d);
    if (st.done < st.total && !confirm('Відмічено ' + st.done + ' з ' + st.total + ' підходів. Завершити тренування?')) return;
    const sess = { id: Date.now(), date: d.date, n: d.n, week: d.week, workout: d.workout, deload: d.deload, mins: Math.max(1, Math.round((Date.now() - d.started) / 60000)), sets, prs: prList.reduce((a, x) => a + x.types.length, 0), prList };
    p.sessions.push(sess); p.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    p.draft = null; save(); stopTimer(); keepAwake(false);
    ui.summary = sess.id; view = 'summary'; render(); window.scrollTo(0, 0);
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
    const step = isRep ? (ex.type === 'time' ? 5 : 1) : (ex.type === 'band' ? 1 : ENGINE.stepFor(P().inv));
    const unit = isRep ? (ex.type === 'time' ? 'с' : 'повт.') : (ex.type === 'band' ? 'рівень' : 'кг дисків на гантель');
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
      <div class="kv">${kp.str === '' ? (isRep ? '—' : ex.type === 'dbopt' ? 'без' : '—') : esc(kp.str)} <small>${unit}</small></div>${extra}
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
      let L = v; if (L !== null && hasKg(ex)) L = Math.min(G().cap, Math.max(0, L)); if (L !== null && ex.type === 'band') L = Math.max(0, Math.round(L));
      s.load = (L === null && ex.type !== 'dbopt' && ex.type !== 'band') ? s.load : L;
    }
    s.touched = true; save();
    if (close) { closeSheet(); rWorkout(); }
  }
  sheetEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return sheetAct(e);
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
    app.innerHTML = `<div class="card hero" style="margin-top:calc(14px + env(safe-area-inset-top))"><div class="chip">Тиждень ${s.week}</div><h1>Тренування завершено 🎉</h1><p class="muted">${esc(prog.workouts[s.workout].title)} · ${dm(s.date)}</p></div>
      <div class="grid2"><div class="stat"><b>${s.mins} хв</b><span>тривалість</span></div><div class="stat"><b>${work}</b><span>робочих підходів</span></div>
      <div class="stat"><b>${vol ? fmt(Math.round(vol)) + ' кг' : '—'}</b><span>обсяг${dv !== null ? ' · ' + (dv >= 0 ? '+' : '') + dv + ' % до минулого' : ''}</span></div><div class="stat"><b>${s.prs || 0}</b><span>рекордів</span></div></div>
      ${s.prList && s.prList.length ? `<h2>🏆 Рекорди</h2><div class="card"><ul class="list">${s.prList.map((x) => `<li><span>${esc(prog.ex[x.ex].name)}</span><span class="chip g">${x.types.map((t) => ({ e1rm: 'максимум', weight: 'вага', reps: 'повторення' }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''}
      <h2>Що попрацювало</h2><div class="card">${CHARTS.bodyMap(ms, 6)}</div>
      <p class="small muted">Наступне: ${esc(prog.workouts[np.workout].title)} (тиждень ${np.week}).</p>
      <button type="button" class="wide" data-act="shareSum">Поділитися підсумком</button><p></p>
      <button type="button" class="pri wide big" data-act="sumDone">Готово</button>`;
  }
  function shareSummary() {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === ui.summary); if (!s) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1080, 1350); gr.addColorStop(0, '#d2541f'); gr.addColorStop(1, '#ff7a3d'); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#fff'; g.font = '700 64px -apple-system, Arial'; g.fillText('Тренування завершено', 80, 170);
    g.font = '400 40px -apple-system, Arial'; g.globalAlpha = 0.9; g.fillText(prog.workouts[s.workout].title + ' · ' + dm(s.date), 80, 240); g.globalAlpha = 1;
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    [[s.mins + ' хв', 'тривалість'], [String(s.sets.filter((x) => x.type !== 'W').length), 'підходів'], [vol ? Math.round(vol) + ' кг' : '—', 'обсяг'], [String(s.prs || 0), 'рекордів']].forEach((x, k) => {
      const X = 80 + (k % 2) * 480, Y = 380 + Math.floor(k / 2) * 240;
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); if (g.roundRect) g.roundRect(X, Y, 440, 200, 32); else g.rect(X, Y, 440, 200); g.fill();
      g.fillStyle = '#fff'; g.font = '800 84px -apple-system, Arial'; g.fillText(x[0], X + 36, Y + 110); g.font = '400 34px -apple-system, Arial'; g.fillText(x[1], X + 36, Y + 165);
    });
    g.font = '600 40px -apple-system, Arial'; let y = 920;
    (s.prList || []).slice(0, 5).forEach((x) => { g.fillText('🏆 ' + prog.ex[x.ex].name, 80, y); y += 64; });
    g.font = '400 32px -apple-system, Arial'; g.globalAlpha = 0.85; g.fillText('Журнал тренувань', 80, 1280);
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
    return `<h2>Щодня</h2><div class="card">${prog.daily.map((it) => {
      if (it.jumps) {
        const j = prog.jumpsFor(wk), done = rec.jumps || 0;
        return `<div class="chk" style="flex-wrap:wrap"><div style="flex:1 1 100%"><b>${esc(it.label)}</b><div class="tiny muted">Тиждень ${wk}: ${j.n} стрибків × ${j.times} на день, 30 с між стрибками. Лише якщо коліна, стопи й тазове дно без проблем. <button type="button" class="sm ghost" style="min-height:40px;padding:0 6px" data-act="guide" data-id="jumps">як стрибати</button></div></div>
          <div class="row">${Array.from({ length: j.times }, (_, k) => `<button type="button" class="sm${k < done ? ' pri' : ''}" data-act="jump" data-k="${k + 1}">${k < done ? '✓ ' : ''}${k + 1}-й раз</button>`).join('')}</div></div>`;
      }
      const how = it.id === 'posture' && prog.posture ? ' <button type="button" class="sm ghost" data-act="guide" data-id="posture">як робити</button>' : '';
      return `<div class="chk"><label class="row" style="flex:1;flex-wrap:nowrap;gap:12px"><input type="checkbox" data-act="daily" data-id="${it.id}"${rec[it.id] ? ' checked' : ''}><span>${esc(it.label)}</span></label>${how}</div>`;
    }).join('')}</div>`;
  }
  function alerts() {
    const out = [], p = P(), prog = G();
    if (ENGINE.fatigue(prog, p, p.handle)) out.push('<div class="note b">Два тренування поспіль головні вправи падають. Зробіть легкий тиждень: половина підходів, вага та сама або на крок нижча.</div>');
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
    const est = Math.round(wo.items.reduce((a, it) => a + prog.setsFor(it, plan.week) * (it.rest + 45), 0) / 60);
    const nd = nextDayText(p.days);
    const recent = []; p.sessions.slice().reverse().forEach((s) => (s.prList || []).forEach((x) => { if (recent.length < 5) recent.push({ d: s.date, ex: x.ex, t: x.types }); }));
    const w = p.body.weight.slice().sort((a, b) => (a.d < b.d ? -1 : 1));
    const avg = ENGINE.rolling7(w);
    app.innerHTML = `<p class="muted small" style="margin-top:4px">${new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>${greet}!</h1>
      ${alerts()}
      ${d ? `<div class="card"><div class="sp"><div><b>Тренування триває</b><div class="small muted">${esc(prog.workouts[d.workout].title)} · ${draftStats(d).done}/${draftStats(d).total} підходів</div></div><button type="button" class="pri" data-act="resume">Продовжити</button></div></div>` : ''}
      <div class="card hero"><div class="row"><span class="chip">Тиждень ${plan.week}${plan.cycle > 1 ? ' · цикл ' + plan.cycle : ''}</span><span class="chip">${plan.slot + 1} з 3</span>${plan.deload ? '<span class="chip">легкий тиждень</span>' : ''}</div>
        <h1 style="margin-top:10px">${esc(wo.title)}</h1><p class="muted small">${wo.items.filter((x) => !x.optional).length} вправ · ≈ ${est} хв · ${esc(plan.note.rir)}${nd ? ' · за планом ' + nd : ''}</p>
        <p class="small" style="opacity:.92">${esc(plan.note.phase)}</p>
        ${d ? '' : '<button type="button" class="pri wide big" data-act="start">Почати тренування</button><p></p><button type="button" class="wide" style="background:rgba(255,255,255,.15);color:#fff;border:0" data-act="other">Інше тренування</button>'}</div>
      <div class="grid3"><div class="stat" style="display:flex;justify-content:center">${CHARTS.ring(thisWeek, 3, thisWeek + '/3', 'тиждень')}</div>
        <div class="stat"><b>${streak}</b><span>тижнів поспіль</span></div><div class="stat"><b>${mprs}</b><span>рекордів за місяць</span></div></div>
      ${dailyCard()}
      <h2>Порадник</h2><div class="card" style="padding:10px 12px">${guideChips()}<button type="button" class="sm" style="margin-top:6px" data-act="food">Харчування</button></div>
      ${recent.length ? `<h2>Останні рекорди</h2><div class="card"><ul class="list">${recent.map((r) => `<li><span>${esc(prog.ex[r.ex].name)}<div class="tiny muted">${dm(r.d)}</div></span><span class="chip g">🏆 ${r.t.map((t) => ({ e1rm: 'максимум', weight: 'вага', reps: 'повторення' }[t])).join(' · ')}</span></li>`).join('')}</ul></div>` : ''}
      ${w.length >= 2 ? `<h2>Вага тіла</h2><div class="card">${CHARTS.line([{ pts: avg.map((q) => ({ t: tms(q.d), v: q.v })), color: 'var(--accent)', area: true, dots: false }], { h: 120, label: 'вага' })}<p class="tiny muted">Середня за 7 днів: ${fmt(avg[avg.length - 1].v)} кг</p></div>` : ''}`;
  }
  function otherSheet() {
    const prog = G();
    openSheet(`<b>Інше тренування</b><p class="small muted">Тиждень і підказки лишаються за планом.</p><div class="pick">${Object.keys(prog.workouts).map((k) => `<button type="button" data-act="startW" data-w="${k}"><b>${esc(prog.workouts[k].title)}</b><span class="small muted">${prog.workouts[k].items.length} вправ</span></button>`).join('')}</div>`);
  }

  /* ---------- план та історія ---------- */
  function sessionByN() { const m = {}; P().sessions.forEach((s) => { m[s.n] = s; }); return m; }
  function rPlan() {
    const p = P(), prog = G(), nn = nextN(), cur = ENGINE.planFor(prog, nn), byN = sessionByN();
    let body = '';
    if (ui.planTab === 'w') {
      const weeks = cur.cycle === 1 ? Array.from({ length: 12 }, (_, k) => k + 1) : Array.from({ length: 8 }, (_, k) => k + 5);
      body = `<div class="card">${weeks.map((w) => {
        const base = cur.cycle === 1 ? (w - 1) * 3 : 36 + (cur.cycle - 2) * 24 + (w - 5) * 3;
        const order = prog.week(w);
        return `<div class="wk${prog.deload.indexOf(w) >= 0 ? ' dl' : ''}"><div class="wl"><b>${w}</b>тиждень</div>${order.map((wid, s) => {
          const n = base + s, done = byN[n], isNext = n === nn;
          const short = { A: 'А', B: 'Б', D1: 'Д1', D2: 'Д2', D3: 'Д3' }[wid] || wid;
          return `<button type="button" class="slot${done ? ' done' : isNext ? ' next' : ''}" data-act="${done ? 'sess' : isNext ? 'start' : 'noop'}" data-id="${done ? done.id : ''}">${done ? '✓ ' : ''}${esc(short)}<small>${done ? dm(done.date) : isNext ? 'наступне' : ''}</small></button>`;
        }).join('')}</div>`;
      }).join('')}</div><p class="tiny muted">А / Б — тренування фази 1, Д1–Д3 — дні фаз 2–3. Легкий тиждень — підходів удвічі менше.</p>`;
    } else {
      const ym = ui.calMonth || today().slice(0, 7);
      const marks = {}; p.sessions.forEach((s) => { marks[s.date] = 't'; });
      Object.keys(p.daily).forEach((d) => { if (!marks[d] && Object.values(p.daily[d]).some(Boolean)) marks[d] = 'd'; });
      const list = p.sessions.filter((s) => s.date.slice(0, 7) === ym).slice().reverse();
      body = `<div class="card"><div class="sp"><button type="button" class="sm" data-act="calPrev">‹</button><b>${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}</b><button type="button" class="sm" data-act="calNext">›</button></div><p></p>${CHARTS.month(ym, marks, today())}
        <div class="legend"><span><i></i>тренування</span><span><i style="background:var(--ok-soft)"></i>щоденне</span></div></div>
        <div class="card">${list.length ? `<ul class="list">${list.map((s) => `<li data-act="sess" data-id="${s.id}" style="cursor:pointer"><span><b>${esc(prog.workouts[s.workout] ? prog.workouts[s.workout].title : s.workout)}</b><div class="tiny muted">${dm(s.date)} · тиждень ${s.week} · ${s.mins || '?'} хв · ${plural(s.sets.filter((x) => x.type !== 'W').length, 'підхід', 'підходи', 'підходів')}</div></span><span>${s.prs ? '<span class="chip g">🏆 ' + s.prs + '</span>' : '›'}</span></li>`).join('')}</ul>` : '<div class="empty">У цьому місяці тренувань немає</div>'}</div>`;
    }
    app.innerHTML = `<h1>План</h1><div class="seg"><button type="button" class="${ui.planTab === 'w' ? 'on' : ''}" data-act="planTab" data-v="w">12 тижнів</button><button type="button" class="${ui.planTab === 'h' ? 'on' : ''}" data-act="planTab" data-v="h">Історія</button></div>${body}`;
  }
  function sessSheet(id, edit) {
    const p = P(), prog = G(), s = p.sessions.find((x) => x.id === id); if (!s) return;
    const groups = []; s.sets.forEach((x, k) => { let g = groups.find((y) => y.ex === x.ex); if (!g) { g = { ex: x.ex, sets: [] }; groups.push(g); } g.sets.push({ x, k }); });
    const vol = ENGINE.sessionVolume(prog, s, p.handle);
    openSheet(`<div class="sp"><b>${esc(prog.workouts[s.workout] ? prog.workouts[s.workout].title : s.workout)}</b><button type="button" class="sm ghost" data-act="closeSheet">Закрити</button></div>
      <p class="small muted">${dm(s.date)} · тиждень ${s.week} · ${s.mins || '?'} хв${vol ? ' · обсяг ' + fmt(Math.round(vol)) + ' кг' : ''}</p>
      ${groups.map((g) => { const ex = prog.ex[g.ex] || { name: g.ex, type: 'bw' }; return `<div class="card" style="padding:10px 12px"><b class="small">${esc(ex.name)}</b>${g.sets.map(({ x, k }) => edit
        ? `<div class="row" style="flex-wrap:nowrap;margin-top:6px"><span class="tiny muted" style="width:22px">${x.type === 'W' ? 'Р' : x.type === 'D' ? 'Д' : x.type === 'F' ? 'В' : '•'}</span>${isLoad(ex) ? `<input inputmode="decimal" data-ed="load" data-sk="${k}" value="${x.load === null || x.load === undefined ? '' : fmt(x.load)}" placeholder="${ex.type === 'band' ? 'рівень' : 'кг'}">` : ''}<input inputmode="numeric" data-ed="reps" data-sk="${k}" value="${x.reps}"></div>`
        : `<div class="small" style="margin-top:4px">${x.type === 'W' ? '<span class="chip w">Р</span> ' : x.type === 'D' ? '<span class="chip">Д</span> ' : x.type === 'F' ? '<span class="chip">В</span> ' : ''}${esc(setText(ex, x))}${x.rir !== null && x.rir !== undefined ? ' · запас ' + x.rir : ''}</div>`).join('')}</div>`; }).join('')}
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
      const ids = Object.keys(prog.ex).sort((a, b) => (used[b] ? 1 : 0) - (used[a] ? 1 : 0) || (prog.ex[b].main ? 1 : 0) - (prog.ex[a].main ? 1 : 0));
      if (!ui.progEx || !prog.ex[ui.progEx]) ui.progEx = ids[0];
      const ex = prog.ex[ui.progEx], histAll = ENGINE.history(p, ui.progEx, 'all');
      const metrics = ex.type === 'db' ? [['e1rm', 'Максимум'], ['heavy', 'Вага'], ['vol', 'Обсяг']] : ex.type === 'dbopt' ? [['reps', 'Повторення'], ['heavy', 'Вага']] : ex.type === 'band' ? [['e1rm', 'Рівень × повт.']] : ex.type === 'time' ? [['e1rm', 'Секунди']] : [['e1rm', 'Повторення']];
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
      const unit = ui.metric === 'vol' ? 'кг за тренування' : ui.metric === 'heavy' ? 'кг у руках' : ui.metric === 'reps' ? 'повторень' : ENGINE.metricLabel(ex);
      const repRows = Object.keys(rec.reps).map(Number).sort((a, b) => b - a).slice(0, 8);
      body = `<select id="exSel">${ids.map((id) => `<option value="${id}"${id === ui.progEx ? ' selected' : ''}>${esc(prog.ex[id].name)}${used[id] ? '' : ' (ще не виконували)'}</option>`).join('')}</select>
        <div class="seg">${metrics.map(([k, l]) => `<button type="button" class="${ui.metric === k ? 'on' : ''}" data-act="metric" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="card"><div class="sp"><span class="tiny muted">${esc(unit)} · ◎ — рекорд</span><span class="seg" style="margin:0;padding:2px">${[['4', '4 т'], ['12', '12 т'], ['all', 'усе']].map(([k, l]) => `<button type="button" class="${ui.range === k ? 'on' : ''}" style="min-height:40px;padding:4px 10px" data-act="range" data-v="${k}">${l}</button>`).join('')}</span></div>
        ${CHARTS.line([{ pts, color: 'var(--accent)', area: true }], { label: ex.name, empty: 'Ще немає підходів у цій вправі' })}</div>
        ${histAll.length ? `<div class="grid3">
          <div class="stat"><b>${rec.e1rm ? fmt(rec.e1rm.v) : '—'}</b><span>${ex.type === 'db' ? 'рекорд максимуму, кг' : 'найкращий показник'}</span></div>
          <div class="stat"><b>${rec.heavy ? fmt(rec.heavy.total) : '—'}</b><span>найважче в руках, кг${rec.heavy ? ' × ' + rec.heavy.set.reps : ''}</span></div>
          <div class="stat"><b>${rec.vol ? fmt(Math.round(rec.vol.v)) : '—'}</b><span>найбільший обсяг, кг</span></div></div>
          ${repRows.length ? `<h2>Рекорди повторень</h2><div class="card"><ul class="list">${repRows.map((L) => `<li><span>${ex.type === 'band' ? 'рівень ' + fmt(L) : 'гриф + ' + fmt(L) + ' кг'}</span><span><b>${rec.reps[String(L)].reps}</b> <span class="tiny muted">${dm(rec.reps[String(L)].date)}</span></span></li>`).join('')}</ul></div>` : ''}
          <h2>Останні тренування</h2><div class="card"><ul class="list">${histAll.slice(-6).reverse().map((x) => `<li><span>${dm(x.date)}</span><span class="small">${x.sets.map((s) => esc(setText(ex, s))).join(', ')}</span></li>`).join('')}</ul></div>` : ''}
        ${ex.tip ? `<div class="note small">${esc(ex.tip)}</div>` : ''}`;
    } else if (ui.progTab === 'mu') {
      const days = ui.musDays, to = Date.now() + 864e5, from = Date.now() - days * 864e5;
      const raw = ENGINE.muscleSets(prog, p.sessions, from, to), wkv = {};
      Object.keys(raw).forEach((k) => { wkv[k] = Math.round(raw[k] / (days / 7) * 10) / 10; });
      const present = MUSCLES.filter((m) => Object.values(prog.ex).some((e) => e.m.p.indexOf(m[0]) >= 0));
      body = `<div class="seg">${[[7, '7 днів'], [28, '28 днів (сер. за тиждень)']].map(([k, l]) => `<button type="button" class="${ui.musDays === k ? 'on' : ''}" data-act="musDays" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="card">${CHARTS.bodyMap(wkv, DB.active === 'him' ? 12 : 8)}<p class="tiny muted" style="text-align:center">Що темніше — то більше підходів на тиждень. Основний мʼяз вправи — 1 підхід, допоміжний — 0,5.</p></div>
        <h2>Підходи на тиждень</h2><div class="card">${CHARTS.hbars(present.map(([k, l]) => ({ label: l, v: wkv[k] || 0 })), DB.active === 'him' ? { lo: 10, hi: 20, zoneLabel: 'наукові огляди: 10–20 робочих підходів на тиждень для росту мʼязів' } : { lo: 6, hi: 12, zoneLabel: 'орієнтир для сили й тонусу: 6–12 підходів на тиждень' })}</div>`;
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
      const wts = (p.body.weight || []), avg = ENGINE.rolling7(wts), wNow = avg.length ? avg[avg.length - 1].v : null;
      const nu = ENGINE.nutrition(food, me, wNow);
      const tr = ENGINE.weightTrend(wts), adv = ENGINE.foodAdvice(food, tr);
      const goalTxt = food.goal === 'loss' ? 'мета — менше жиру, більше мʼязів: дефіцит ≈ ' + Math.round(food.deficit * 100) + ' % від витрат' : 'мета — сила й тонус: калорії на рівні підтримки, без дієт';
      body = `<div class="card"><p class="small muted">Дані лише в цьому телефоні. Вага береться із «Замірів» (середня за 7 днів).</p>
        <div class="grid2"><div><label class="f">Зріст, см</label><input inputmode="numeric" id="meH" value="${me.height || ''}"></div><div><label class="f">Вік, років</label><input inputmode="numeric" id="meA" value="${me.age || ''}"></div></div>
        ${food.basis === 'target' ? `<label class="f">Цільова вага, кг (для білка; порожньо — порахую за зростом)</label><input inputmode="decimal" id="meT" value="${me.target || ''}">` : ''}
        <p></p><button type="button" class="wide" data-act="meSave">Зберегти</button></div>
        ${!wNow ? '<div class="note w">Додайте вагу у «Заміри» — і тут зʼявиться норма.</div>' : !nu ? '<div class="note w">Вкажіть зріст і вік — і тут зʼявиться норма.</div>' : `
        <div class="grid2"><div class="stat"><b>${fmt(nu.kLo)}–${fmt(nu.kHi)}</b><span>ккал на день</span></div><div class="stat"><b>${nu.pLo}–${nu.pHi} г</b><span>білка на день</span></div></div>
        <p class="tiny muted">${esc(goalTxt)}. Розрахунок: формула Міффліна — Сан Жеора × 1,45 (основний обмін ≈ ${fmt(nu.bmr)}, витрати ≈ ${fmt(nu.tdee)} ккал); білок — ${fmt(food.protein[0])}–${fmt(food.protein[1])} г на кг ${food.basis === 'target' ? 'цільової ваги ' + fmt(nu.target) + ' кг' : 'поточної ваги'}.</p>
        <div class="note ${adv.k === 'ok' ? 'ok' : adv.k === 'wait' ? '' : 'w'}"><b>За вашою вагою:</b> ${esc(adv.text)}${tr && tr.rate !== null ? ' <span class="tiny muted">(темп ' + (tr.rate > 0 ? '+' : tr.rate < 0 ? '−' : '') + fmt(Math.abs(tr.rate)) + ' кг на тиждень)</span>' : ''}</div>`}
        <div class="card">${food.notes.map((x) => `<p class="small" style="margin:6px 0">• ${esc(x)}</p>`).join('')}</div>`;
    } else if (ui.bodyTab === 'f') {
      body = `<div class="seg">${[['front', 'Спереду'], ['side', 'Збоку'], ['back', 'Ззаду']].map(([k, l]) => `<button type="button" class="${ui.photoPose === k ? 'on' : ''}" data-act="pose" data-v="${k}">${l}</button>`).join('')}</div>
        <label class="btn pri" style="display:block;text-align:center;color:#fff;border:0;background:linear-gradient(135deg,var(--accent),var(--accent2));font-weight:700">Додати фото<input type="file" id="photoIn" accept="image/*" style="display:none"></label>
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
      grid.innerHTML = mine.length ? mine.slice().reverse().map((x) => { const u = URL.createObjectURL(x.blob); photoUrls.push(u); return `<div data-act="photo" data-id="${x.id}" style="position:relative"><img src="${u}" alt="фото ${dm(x.date)}"><span class="tiny" style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:6px;padding:1px 6px">${dm(x.date)}</span></div>`; }).join('') : '<div class="empty" style="grid-column:1/-1">Ще немає фото в цьому ракурсі</div>';
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
  function rMore() {
    const p = P(), prog = G();
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    const curWeek = ENGINE.planFor(prog, nextN()).week;
    const sw = (k, l, d) => `<label class="sw"><span>${l}<div class="tiny muted">${d}</div></span><input type="checkbox" data-set="${k}"${S()[k] ? ' checked' : ''}></label>`;
    app.innerHTML = `<h1>Більше</h1>
      ${standalone ? '' : '<div class="note w small"><b>Встановіть як застосунок:</b> Safari → «Поділитися» → «На початковий екран» і відкривайте лише з іконки (в іконки й у Safari окремі сховища).</div>'}
      <h2>Програма</h2><div class="card"><label class="f">Програма на цьому телефоні</label><select id="progSel">${Object.values(PROGRAMS).map((q) => `<option value="${q.id}"${q.id === DB.active ? ' selected' : ''}>${esc(q.title)}</option>`).join('')}</select>
        <label class="f">Наступне тренування — тиждень</label><select id="weekSel"${p.draft ? ' disabled' : ''}>${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}"${k + 1 === curWeek ? ' selected' : ''}>${k + 1}</option>`).join('')}</select>
        <label class="f">Дні тренувань</label><div class="row">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="sm${p.days.indexOf(d) >= 0 ? ' pri' : ''}" data-act="day" data-d="${d}">${DAYS[d]}</button>`).join('')}</div></div>
      <h2>Гантелі</h2><div class="card"><label class="f">Вага грифа без дисків, кг</label><input inputmode="decimal" id="handleIn" value="${fmt(p.handle)}">
        <label class="f">Диски на обидві гантелі: 5 · 2,5 · 1,25 кг (штук)</label><div class="grid3"><input inputmode="numeric" data-inv="5" value="${p.inv[5]}"><input inputmode="numeric" data-inv="2.5" value="${p.inv[2.5]}"><input inputmode="numeric" data-inv="1.25" value="${p.inv[1.25]}"></div>
        <p class="tiny muted">Крок ваги зараз: ${fmt(ENGINE.stepFor(p.inv))} кг на гантель.</p></div>
      <h2>Тренування</h2><div class="card">${sw('sound', 'Звук таймера', 'сигнал, коли відпочинок скінчився')}${sw('haptics', 'Вібровідгук', 'на iPhone з iOS 18+, якщо підтримується')}${sw('awake', 'Не гасити екран', 'під час тренування')}</div>
      <h2>Порадник</h2><div class="card" style="padding:10px 12px">${guideChips()}<button type="button" class="sm" style="margin-top:6px" data-act="food">Харчування</button></div>
      <h2>Резервна копія</h2><div class="card"><p class="small">Дані лише в цьому телефоні. Раз на тиждень зберігайте копію в iCloud, «Файли» чи Telegram.</p><p class="tiny muted">Остання копія: ${DB.lastBackup ? dm(DB.lastBackup) : 'ще не було'}</p>
        <label class="sw"><span>Разом із фото<div class="tiny muted">файл буде більшим</div></span><input type="checkbox" id="bkPhotos"></label>
        <button type="button" class="pri wide" data-act="backup">Зберегти резервну копію</button><p></p>
        <label class="btn" style="display:block;text-align:center">Відновити з копії<input type="file" id="restoreIn" accept=".json,application/json" style="display:none"></label><p></p>
        <button type="button" class="wide" data-act="csv">Вивантажити таблицю (CSV)</button></div>
      <h2>Про застосунок</h2><div class="card"><p class="small muted">Версія ${VERSION} · <span id="persist">перевіряю сховище…</span></p><p class="tiny muted">Без реєстрації, реклами й передачі даних. Apple Health, віджети й Live Activity веб-застосункам на iPhone недоступні.</p>
        <button type="button" class="ghost wide" style="color:var(--bad)" data-act="wipe">Стерти дані цієї програми</button></div>`;
    document.getElementById('progSel').onchange = (e) => { DB.active = e.target.value; if (!DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(DB.active); fixProfiles(ENGINE.migrate(DB)); save(); render(); };
    document.getElementById('weekSel').onchange = (e) => { const w = Number(e.target.value); p.offset = (w - 1) * 3 - p.sessions.length; save(); toast('Наступне тренування — тиждень ' + w); };
    document.getElementById('handleIn').onchange = (e) => { const v = num(e.target.value); if (v === null || v < 0 || v > 10) { toast('Вага грифа — від 0 до 10 кг'); e.target.value = fmt(p.handle); return; } p.handle = v; save(); toast('Збережено'); };
    app.querySelectorAll('[data-inv]').forEach((el) => { el.onchange = () => { const v = num(el.value); if (v === null || v < 0 || v > 40) { el.value = p.inv[el.dataset.inv]; return; } p.inv[el.dataset.inv] = Math.round(v); save(); rMore(); }; });
    app.querySelectorAll('[data-set]').forEach((el) => { el.onchange = () => { S()[el.dataset.set] = el.checked; save(); if (el.dataset.set === 'haptics' && el.checked) haptic(); }; });
    document.getElementById('restoreIn').onchange = (e) => { if (e.target.files && e.target.files[0]) restore(e.target.files[0]); };
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((v) => { const el = document.getElementById('persist'); if (el) el.textContent = v ? 'сховище захищене від автоочищення' : 'робіть резервні копії'; }).catch(() => {});
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
    const prog = G(), h = P().handle, rows = [['дата', 'тиждень', 'тренування', 'вправа', 'варіант', 'тип', 'підхід', 'диски_кг', 'у_руках_кг', 'повторення_або_с', 'запас']];
    P().sessions.forEach((s) => { const cnt = {}; s.sets.forEach((x) => { const ex = prog.ex[x.ex] || { name: x.ex }; cnt[x.ex] = (cnt[x.ex] || 0) + 1;
      const tot = (x.load === null || x.load === undefined || ex.type === 'band') ? '' : String(ENGINE.totalLoad(ex, x.load, h, x.variant));
      rows.push([s.date, s.week, s.workout, ex.name, x.variant || '', x.type || 'N', cnt[x.ex], x.load === null || x.load === undefined ? '' : x.load, tot, x.reps, x.rir === null || x.rir === undefined ? '' : x.rir]); }); });
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
        DB = fixProfiles(ENGINE.migrate(o.db)); if (!DB.active || !DB.profiles[DB.active]) DB.active = Object.keys(DB.profiles)[0] || null;
        if (o.photos && o.photos.length) { for (const x of o.photos) { try { await STORE.putPhoto({ id: x.id, profile: x.profile, date: x.date, pose: x.pose, blob: STORE.dataToBlob(x.data) }); } catch (e) { /* пропуск */ } } }
        save(); toast('Дані відновлено'); view = DB.active ? 'home' : 'onboard'; render();
      } catch (e) { toast('Це не схоже на резервну копію журналу'); }
    };
    r.readAsText(file);
  }

  /* ---------- дії ---------- */
  function exMenu(i) {
    const d = P().draft, it = d.items[i], ex = G().ex[it.ex];
    openSheet(`<b>${esc(ex.name)}</b><p class="small muted">${esc(ex.m.p.map(mName).join(' · '))}${ex.m.s.length ? ' · допоміжні: ' + esc(ex.m.s.map(mName).join(', ')) : ''}</p>
      <div class="note small">${esc(ex.tip || '')}</div>
      <label class="f">Моя нотатка до вправи (видно щоразу)</label><textarea id="exNote" placeholder="наприклад: крісло біля стіни, хват ширший">${esc(P().notes[it.ex] || '')}</textarea><p></p>
      <button type="button" class="pri wide" data-act="noteSave" data-i="${i}">Зберегти нотатку</button><p></p>
      <div class="grid2"><button type="button" data-act="delset" data-i="${i}">Прибрати останній підхід</button><button type="button" data-act="skip" data-i="${i}">Пропустити вправу</button></div>`);
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
    if (act === 'food') { view = 'body'; ui.bodyTab = 'n'; render(); window.scrollTo(0, 0); return; }
    /* знайомство */
    if (act === 'obProg') { ui.obProg = b.dataset.id; ui.ob = 2; return rOnboard(); }
    if (act === 'obBack') { ui.ob = 1; return rOnboard(); }
    if (act === 'obDay') { const dd = Number(b.dataset.d), k = ui.obDays.indexOf(dd); if (k >= 0) ui.obDays.splice(k, 1); else ui.obDays.push(dd); b.classList.toggle('pri'); return; }
    if (act === 'obDone') {
      const id = ui.obProg; DB.active = id; if (!DB.profiles[id]) DB.profiles[id] = newProfile(id);
      const p = DB.profiles[id], hv = num(document.getElementById('obHandle').value);
      p.handle = hv !== null && hv >= 0 && hv <= 10 ? hv : 1;
      p.inv = { 5: Math.round(num(document.getElementById('obI5').value) || 0), 2.5: Math.round(num(document.getElementById('obI25').value) || 0), 1.25: Math.round(num(document.getElementById('obI125').value) || 0) };
      p.days = ui.obDays.slice().sort();
      const w = Number(document.getElementById('obWeek').value); p.offset = (w - 1) * 3 - p.sessions.length;
      ENGINE.migrate(DB); save();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      view = 'home'; return render();
    }
    const p = P();
    /* головна */
    if (act === 'start') return startWorkout(null);
    if (act === 'other') return otherSheet();
    if (act === 'startW') return startWorkout(b.dataset.w);
    if (act === 'resume') { view = 'workout'; return render(); }
    if (act === 'jump') { const k = Number(b.dataset.k), t = today(); const r = p.daily[t] = p.daily[t] || {}; r.jumps = (r.jumps || 0) >= k ? k - 1 : k; save(); haptic(); return rHome(); }
    /* тренування */
    if (act === 'minimize') { view = 'home'; return render(); }
    if (act === 'finish') return finishWorkout();
    if (act === 'discard') { if (confirm('Скасувати тренування? Відмічені підходи не збережуться.')) { p.draft = null; save(); stopTimer(); view = 'home'; render(); } return; }
    if (act === 'done') return toggleDone(i, j);
    if (act === 'kp') return openKp(i, j, b.dataset.f);
    if (act === 'stype') { const s = p.draft.items[i].sets[j]; if (s.done) return; s.type = { N: 'W', W: 'D', D: 'F', F: 'N' }[s.type || 'N']; save(); haptic(); return rWorkout(); }
    if (act === 'copyprev') { const s = p.draft.items[i].sets[j]; if (!s.prev || s.done) return; s.load = s.prev.load; s.reps = s.prev.reps; s.touched = true; save(); haptic(); return rWorkout(); }
    if (act === 'variant') { p.draft.items[i].variant = b.dataset.v; save(); return rWorkout(); }
    if (act === 'addset') { const it = p.draft.items[i], l = it.sets.filter((x) => x.type !== 'W').slice(-1)[0] || it.sets[it.sets.length - 1] || {}; it.sets.push({ type: 'N', load: l.load === undefined ? null : l.load, reps: l.reps === undefined ? null : l.reps, rir: null, done: false, pr: [], prev: null, touched: false }); save(); return rWorkout(); }
    if (act === 'warm') { const it = p.draft.items[i], ex = G().ex[it.ex], fw = it.sets.find((s) => s.type !== 'W'); const ws = ENGINE.warmups(ex, fw ? fw.load : null, ENGINE.stepFor(p.inv), G().warm); it.sets = ws.map((w) => ({ type: 'W', load: w.load, reps: w.reps, rir: null, done: false, pr: [], prev: null, touched: true })).concat(it.sets); save(); return rWorkout(); }
    if (act === 'exmenu') return exMenu(i);
    if (act === 'noteSave') { const it = p.draft.items[i]; const v = document.getElementById('exNote').value.trim(); if (v) p.notes[it.ex] = v; else delete p.notes[it.ex]; save(); closeSheet(); toast('Нотатку збережено'); return rWorkout(); }
    if (act === 'delset') { const it = p.draft.items[i]; if (it.sets.length > 1) it.sets.pop(); save(); closeSheet(); return rWorkout(); }
    if (act === 'skip') { p.draft.items[i].skipped = true; save(); closeSheet(); return rWorkout(); }
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
      openSheet(`<img src="${img ? img.src : ''}" style="width:100%;border-radius:16px" alt="фото"><p></p><button type="button" class="ghost wide" style="color:var(--bad)" data-act="photoDel" data-id="${id}">Видалити фото</button>`); return;
    }
    if (act === 'photoDel') { if (!confirm('Видалити фото?')) return; STORE.delPhoto(Number(b.dataset.id)).then(() => { closeSheet(); rBody(); }); return; }
    if (act === 'meSave') {
      const h = num(document.getElementById('meH').value), a = num(document.getElementById('meA').value), te = document.getElementById('meT') ? num(document.getElementById('meT').value) : null;
      if ((h !== null && (h < 120 || h > 230)) || (a !== null && (a < 14 || a > 100)) || (te !== null && (te < 35 || te > 250))) { toast('Перевірте числа'); return; }
      p.me = { height: h, age: a, target: te }; save(); toast('Збережено'); return rBody();
    }
    if (act === 'saveTests') {
      const rec = { d: today() }; let any = false;
      TESTS.forEach(([k]) => { const v = num(document.getElementById('t_' + k).value); rec[k] = v; if (v !== null) any = true; });
      if (!any) { toast('Заповніть хоча б один тест'); return; }
      const idx = p.body.tests.findIndex((t) => t.d === rec.d); if (idx >= 0) p.body.tests[idx] = rec; else p.body.tests.push(rec);
      save(); toast('Тести збережено'); return rBody();
    }
    /* більше */
    if (act === 'day') { const dd = Number(b.dataset.d), k = p.days.indexOf(dd); if (k >= 0) p.days.splice(k, 1); else p.days.push(dd); p.days.sort(); save(); return rMore(); }
    if (act === 'backup') return backup();
    if (act === 'csv') return csv();
    if (act === 'wipe') { if (confirm('Стерти всі тренування й заміри цієї програми на цьому телефоні?') && confirm('Точно? Відновити можна лише з резервної копії.')) { DB.profiles[DB.active] = newProfile(DB.active); save(); toast('Дані стерто'); render(); } }
  }
  app.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) handle(b, e); });
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.act === 'daily') { const d = today(); const r = P().daily[d] = P().daily[d] || {}; r[t.dataset.id] = t.checked; save(); haptic(); }
  });

  /* ---------- запуск ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  if (DB.active && !DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(DB.active);
  if (DB.active) ENGINE.migrate(DB);
  render();
  window.__app = { get DB() { return DB; }, render: () => render(), set view(v) { view = v; } };
})();
