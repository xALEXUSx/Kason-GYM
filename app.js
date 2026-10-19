/* Журнал тренувань — інтерфейс. Дані лише в цьому телефоні (localStorage) + резервна копія файлом. */
(() => {
  'use strict';
  const KEY = 'trening_v1';
  const VERSION = '1.0.0';
  const GROUPS = [['legs', 'Ноги й сідниці'], ['chest', 'Груди'], ['back', 'Спина'], ['shoulders', 'Плечі'], ['arms', 'Руки'], ['core', 'Корпус']];
  const app = document.getElementById('app');
  let tab = 'today';
  let DB = load();
  let audio = null, wakeLock = null;

  /* ---------- утиліти ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => isoDate(new Date());
  const dm = (s) => s.slice(8, 10) + '.' + s.slice(5, 7);
  const fmt = (x) => (x === null || x === undefined || x === '' ? '—' : String(Math.round(Number(x) * 100) / 100).replace('.', ','));
  const num = (v) => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const x = Number(s); return isFinite(x) ? x : null; };
  const tms = (s) => new Date(s + 'T12:00:00').getTime();
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many); };

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); if (d && d.profiles) return d; } } catch (e) { /* немає сховища */ }
    return { v: 1, active: null, profiles: {}, lastBackup: null };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); return true; }
    catch (e) { toast('Не вдалося зберегти дані в телефоні. Зробіть резервну копію в «Налаштуваннях».'); return false; }
  }
  function newProfile() { return { handle: 1, offset: 0, sessions: [], draft: null, body: { weight: [], waist: [], tests: [] }, daily: {} }; }
  const P = () => DB.profiles[DB.active];
  const G = () => PROGRAMS[DB.active];
  const nextN = () => P().sessions.length + (P().offset || 0);

  let toastT = null;
  function toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3500);
  }

  /* ---------- таймер відпочинку ---------- */
  const timer = { end: 0, id: null, alarmed: false };
  const tEl = document.getElementById('timer');
  function beep() {
    try {
      if (!audio) return;
      [0, 0.35].forEach((d) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.25, audio.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + d + 0.25);
        o.start(audio.currentTime + d); o.stop(audio.currentTime + d + 0.26);
      });
    } catch (e) { /* без звуку */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  function startTimer(sec) {
    timer.end = Date.now() + sec * 1000; timer.alarmed = false;
    tEl.classList.add('show'); tEl.classList.remove('alarm');
    clearInterval(timer.id); timer.id = setInterval(tick, 250); tick();
  }
  function stopTimer() { clearInterval(timer.id); tEl.classList.remove('show', 'alarm'); }
  function tick() {
    const left = Math.round((timer.end - Date.now()) / 1000);
    if (left <= 0) {
      document.getElementById('timerT').textContent = 'Час!';
      document.getElementById('timerLabel').textContent = 'Наступний підхід';
      tEl.classList.add('alarm');
      if (!timer.alarmed) { timer.alarmed = true; beep(); }
      if (left < -20) stopTimer();
      return;
    }
    document.getElementById('timerLabel').textContent = 'Відпочинок';
    document.getElementById('timerT').textContent = Math.floor(left / 60) + ':' + pad(left % 60);
  }
  document.getElementById('timerPlus').onclick = () => { timer.end = Math.max(timer.end, Date.now()) + 30000; timer.alarmed = false; tEl.classList.remove('alarm'); };
  document.getElementById('timerSkip').onclick = stopTimer;

  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && DB.active && P().draft) keepAwake(true); });

  /* ---------- навігація ---------- */
  document.getElementById('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    tab = b.dataset.tab; render(); window.scrollTo(0, 0);
  });
  function render() {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.getElementById('tabs').style.display = DB.active ? '' : 'none';
    if (!DB.active) return renderPick();
    ({ today: renderToday, daily: renderDaily, progress: renderProgress, body: renderBody, settings: renderSettings }[tab] || renderToday)();
  }

  /* ---------- вибір програми ---------- */
  function renderPick() {
    app.innerHTML = `<h1>Журнал тренувань</h1>
      <p class="muted">Чия це програма? Кожен відкриває журнал на своєму телефоні — дані зберігаються лише в ньому.</p>
      <div class="pick">${Object.values(PROGRAMS).map((p) => `<button type="button" data-act="pick" data-id="${p.id}"><b>${esc(p.title)}</b><span class="muted small">${esc(p.sub)}</span></button>`).join('')}</div>`;
  }

  /* ---------- сьогодні ---------- */
  function exHist(exId) { return ENGINE.history(P(), exId); }
  function defaultVariant(exId, plan) {
    const ex = G().ex[exId]; if (!ex.variants) return null;
    if (DB.active === 'her' && plan.week >= 9 && plan.week <= 11) {
      if (exId === 'splitsquat') return 'l';
      if (exId === 'bridge') return 'c';
    }
    const h = exHist(exId);
    for (let i = h.length - 1; i >= 0; i--) { const s = h[i].sets.find((x) => x.variant); if (s) return s.variant; }
    return ex.variants[0].id;
  }
  function buildDraft(workoutId) {
    const prog = G(), n = nextN(), plan = ENGINE.planFor(prog, n);
    const wid = workoutId || plan.workout;
    const items = prog.workouts[wid].items.map((it) => {
      const nSets = prog.setsFor(it, plan.week);
      const sug = ENGINE.suggest(prog, it.ex, it, nSets, exHist(it.ex), P().handle, plan.deload);
      return { ex: it.ex, variant: defaultVariant(it.ex, plan), skipped: !!it.optional, optional: !!it.optional,
               note: sug.note, sets: sug.sets.map((s) => ({ load: s.load, reps: s.reps, rir: null, done: false, pr: false })) };
    });
    return { n, week: plan.week, cycle: plan.cycle, workout: wid, deload: plan.deload, date: today(), started: Date.now(), items };
  }
  function itemDef(wid, idx) { return G().workouts[wid].items[idx]; }

  function setRow(d, i, j, s, ex) {
    const loadable = ex.type === 'db' || ex.type === 'dbopt' || ex.type === 'band' || (ex.type === 'time' && ex.load);
    const step = ex.type === 'band' ? '1' : '0.5';
    const loadIn = loadable
      ? `<input inputmode="decimal" data-f="load" data-i="${i}" data-j="${j}" value="${s.load === null || s.load === undefined ? '' : fmt(s.load)}" placeholder="${ex.type === 'dbopt' ? 'без' : ''}" aria-label="${ex.type === 'band' ? 'рівень' : 'диски, кг'}" step="${step}">`
      : `<span class="muted small" style="text-align:center">—</span>`;
    const rirOpts = ['', '0', '1', '2', '3', '4'].map((v) => `<option value="${v}"${String(s.rir === null || s.rir === undefined ? '' : s.rir) === v ? ' selected' : ''}>${v === '' ? 'запас' : v === '4' ? '4+' : v}</option>`).join('');
    return `<div class="set${s.done ? ' isdone' : ''}">
      <span class="n">${j + 1}</span>${loadIn}
      <input inputmode="numeric" data-f="reps" data-i="${i}" data-j="${j}" value="${s.reps === null || s.reps === undefined ? '' : s.reps}" aria-label="${ex.type === 'time' ? 'секунди' : 'повторення'}">
      <select data-f="rir" data-i="${i}" data-j="${j}" aria-label="запас повторень">${rirOpts}</select>
      <button type="button" class="done" data-act="done" data-i="${i}" data-j="${j}" aria-label="підхід виконано">${s.done ? '✓' : '○'}</button>
      ${s.pr ? '<span class="pr">🏆 Рекорд у цій вправі</span>' : ''}</div>`;
  }
  function exCard(d, i) {
    const it = d.items[i], prog = G(), ex = prog.ex[it.ex], def = itemDef(d.workout, i);
    const range = ex.type === 'amrap' ? 'скільки зможете, запас 2' : (def.min === def.max ? def.max : def.min + '–' + def.max) + (ex.type === 'time' ? ' с' : '');
    const side = ex.side ? ' · на кожну сторону' : '';
    const hL = ex.type === 'band' ? 'рівень' : (ex.type === 'db' || ex.type === 'dbopt' || (ex.type === 'time' && ex.load)) ? 'диски, кг' : '';
    const hR = ex.type === 'time' ? 'секунди' : 'повтор.';
    const variants = ex.variants ? `<select data-f="variant" data-i="${i}" style="margin:4px 0">${ex.variants.map((v) => `<option value="${v.id}"${v.id === it.variant ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>` : '';
    let note = it.note || '';
    if (it.ex === 'goblet' && it.variant === 'g1' && /максимальна/.test(note) && ex.variants) note += ' Час переходити на «2 гантелі на плечах».';
    const plat = ENGINE.plateau(ex, exHist(it.ex), P().handle)
      ? '<div class="note warn small">Плато: 3 тренування без зростання. Спробуйте опускання 3–4 с, паузу 2 с внизу або +1 підхід.</div>' : '';
    if (it.skipped) {
      return `<div class="card ex skipped"><div class="spread"><h3>${esc(ex.name)}</h3>
        <button type="button" class="small ghost" data-act="unskip" data-i="${i}">${it.optional ? 'Додати' : 'Повернути'}</button></div>
        <div class="meta">${def.sets} × ${range}${side}${it.optional ? ' · за бажанням' : ''}</div></div>`;
    }
    return `<div class="card ex">
      <div class="spread"><h3>${esc(ex.name)}</h3><button type="button" class="small ghost" data-act="skip" data-i="${i}">Пропустити</button></div>
      <div class="meta">${it.sets.length} × ${range}${side} · відпочинок ${def.rest} с</div>
      ${variants}
      ${note ? `<div class="small muted">💡 ${esc(note)}</div>` : ''}${plat}
      <div class="sethead"><span>№</span><span>${hL}</span><span>${hR}</span><span>запас</span><span></span></div>
      ${it.sets.map((s, j) => setRow(d, i, j, s, ex)).join('')}
      <div class="spread"><button type="button" class="small ghost" data-act="addset" data-i="${i}">+ підхід</button>
        <details class="tip"><summary>Як робити</summary><p>${esc(ex.tip || '')}</p></details></div>
    </div>`;
  }
  function headerCard(plan, wid) {
    const prog = G(), title = prog.workouts[wid].title;
    const nt = plan.note;
    return `<div class="card">
      <div class="row"><span class="chip acc">Тиждень ${plan.week}${plan.cycle > 1 ? ' · цикл ' + plan.cycle : ''}</span>
      <span class="chip">${plan.slot + 1} з 3</span>${plan.deload ? '<span class="chip warn">легкий тиждень</span>' : ''}</div>
      <h1>${esc(title)}</h1>
      <p class="small"><b>${esc(nt.phase)}</b> · ${esc(nt.rir)}</p><p class="small muted">${esc(nt.text)}</p></div>`;
  }
  function alerts() {
    const out = [];
    if (ENGINE.fatigue(G(), P(), P().handle)) out.push('<div class="note bad">Два тренування поспіль головні вправи падають. Зробіть легкий тиждень: половина підходів, вага та сама або на крок нижча.</div>');
    const n = nextN(), wk = ENGINE.planFor(G(), n).week;
    if (G().tests && [1, 4, 8, 12].indexOf(wk) >= 0) {
      const recent = (P().body.tests || []).some((t) => Date.now() - tms(t.d) < 21 * 864e5);
      if (!recent) out.push('<div class="note warn">Цього тижня — тести готовності до старіння. Запишіть їх у розділі «Тіло».</div>');
    }
    if (P().sessions.length >= 3 && (!DB.lastBackup || Date.now() - tms(DB.lastBackup) > 14 * 864e5)) out.push('<div class="note warn">Резервної копії не було понад 2 тижні. «Налаштування» → «Зберегти резервну копію».</div>');
    return out.join('');
  }
  function renderToday() {
    const p = P(), prog = G(), d = p.draft;
    if (d) {
      const plan = ENGINE.planFor(prog, d.n);
      const doneSets = d.items.reduce((a, it) => a + (it.skipped ? 0 : it.sets.filter((s) => s.done).length), 0);
      app.innerHTML = headerCard(plan, d.workout) + d.items.map((_, i) => exCard(d, i)).join('') +
        `<div class="card"><p class="small muted">Виконано підходів: ${doneSets}</p>
         <button type="button" class="primary wide" data-act="finish">Завершити тренування</button>
         <p></p><button type="button" class="ghost wide" data-act="cancel">Скасувати це тренування</button></div>`;
      keepAwake(true);
      return;
    }
    const plan = ENGINE.planFor(prog, nextN());
    const preview = prog.workouts[plan.workout].items.map((it) => {
      const ex = prog.ex[it.ex], nS = prog.setsFor(it, plan.week);
      const r = ex.type === 'amrap' ? 'скільки зможете' : (it.min === it.max ? it.max : it.min + '–' + it.max) + (ex.type === 'time' ? ' с' : '');
      return `<tr><td>${esc(ex.name)}${it.optional ? ' <span class="muted small">(за бажанням)</span>' : ''}</td><td>${nS} × ${r}</td></tr>`;
    }).join('');
    const other = Object.keys(prog.workouts).filter((k) => k !== plan.workout).map((k) => `<option value="${k}">${esc(prog.workouts[k].title)}</option>`).join('');
    const last = p.sessions[p.sessions.length - 1];
    app.innerHTML = alerts() + headerCard(plan, plan.workout) +
      `<div class="card"><table class="hist">${preview}</table><p></p>
        <button type="button" class="primary wide" data-act="start">Почати тренування</button>
        <label class="f">Або інше тренування</label>
        <div class="row" style="flex-wrap:nowrap"><select id="otherW"><option value="">—</option>${other}</select>
        <button type="button" data-act="startOther">Почати</button></div></div>` +
      (last ? `<p class="small muted">Останнє тренування: ${dm(last.date)} · ${esc(prog.workouts[last.workout] ? prog.workouts[last.workout].title : last.workout)}</p>` : '<p class="small muted">Перше тренування — підберіть вагу, з якою верхня межа повторень дається із запасом 2–3.</p>');
  }

  function markDone(i, j) {
    const d = P().draft, it = d.items[i], s = it.sets[j], ex = G().ex[it.ex];
    if (s.done) { s.done = false; s.pr = false; save(); renderToday(); return; }
    if (!(Number(s.reps) > 0)) { toast('Вкажіть кількість ' + (ex.type === 'time' ? 'секунд' : 'повторень')); return; }
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } }
    s.done = true;
    const hist = exHist(it.ex);
    const set = { load: s.load, reps: Number(s.reps), variant: it.variant };
    const earlier = it.sets.slice(0, j).filter((x) => x.done).map((x) => ({ load: x.load, reps: Number(x.reps), variant: it.variant }));
    s.pr = ENGINE.isPR(ex, set, hist.concat(earlier.length ? [{ sets: earlier }] : []), P().handle);
    save();
    const def = itemDef(d.workout, i);
    const more = it.sets.some((x) => !x.done) || d.items.slice(i + 1).some((x) => !x.skipped);
    if (more) startTimer(def.rest);
    renderToday();
    if (s.pr) toast('🏆 Новий рекорд: ' + ex.name);
  }
  function finish() {
    const p = P(), d = p.draft, prog = G();
    const sets = [];
    d.items.forEach((it) => { if (it.skipped) return; it.sets.forEach((s) => { if (s.done) sets.push({ ex: it.ex, variant: it.variant || undefined, load: s.load === '' ? null : s.load, reps: Number(s.reps), rir: s.rir === '' || s.rir === null || s.rir === undefined ? null : Number(s.rir) }); }); });
    if (!sets.length) { if (!confirm('Жодного підходу не відмічено. Завершити без збереження?')) return; p.draft = null; save(); stopTimer(); keepAwake(false); renderToday(); return; }
    const prs = d.items.reduce((a, it) => a + it.sets.filter((s) => s.done && s.pr).length, 0);
    p.sessions.push({ id: Date.now(), date: d.date, n: d.n, week: d.week, workout: d.workout, deload: d.deload, mins: Math.round((Date.now() - d.started) / 60000), sets });
    p.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    p.draft = null; save(); stopTimer(); keepAwake(false);
    const np = ENGINE.planFor(prog, nextN());
    toast('Збережено: ' + plural(sets.length, 'підхід', 'підходи', 'підходів') + (prs ? ', рекордів: ' + prs : '') + '. Наступне — ' + prog.workouts[np.workout].title + '.');
    renderToday(); window.scrollTo(0, 0);
  }

  /* ---------- щодня ---------- */
  function renderDaily() {
    const p = P(), prog = G(), t = today(), rec = p.daily[t] || {};
    const wk = ENGINE.planFor(prog, Math.max(0, nextN() - 1)).week;
    const items = prog.daily.map((it) => {
      if (it.jumps) {
        const j = prog.jumpsFor(wk), done = rec.jumps || 0;
        const btns = Array.from({ length: j.times }, (_, k) => `<button type="button" class="small${k < done ? ' primary' : ''}" data-act="jump" data-k="${k + 1}">${k < done ? '✓ ' : ''}${k + 1}-й раз</button>`).join(' ');
        return `<div class="chk" style="flex-wrap:wrap"><div style="flex:1 1 100%"><b>${esc(it.label)}</b><div class="small muted">Тиждень ${wk}: ${j.n} стрибків × ${j.times} на день, 30 с між стрибками (у паузи — вправи на осанку). Лише якщо коліна, стопи й тазове дно без проблем.</div></div><div class="row">${btns}</div></div>`;
      }
      return `<label class="chk"><input type="checkbox" data-act="daily" data-id="${it.id}"${rec[it.id] ? ' checked' : ''}><span>${esc(it.label)}</span></label>`;
    }).join('');
    const days = []; for (let k = 13; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(isoDate(d)); }
    const trained = new Set(p.sessions.map((s) => s.date));
    const dots = days.map((d) => { const r = p.daily[d] || {}; const any = Object.keys(r).some((k) => r[k]); return `<span title="${dm(d)}" style="display:inline-block;width:18px;height:18px;border-radius:5px;margin:2px;background:${trained.has(d) ? 'var(--accent)' : any ? 'var(--ok-soft)' : 'var(--soft)'};${any && !trained.has(d) ? 'outline:1px solid var(--ok)' : ''}"></span>`; }).join('');
    app.innerHTML = `<h1>Щодня</h1><p class="muted small">${dm(t)} · відмітьте, що зроблено сьогодні</p>
      <div class="card">${items}</div>
      <h2>Останні 14 днів</h2><div class="card">${dots}<div class="legend"><span><i style="background:var(--accent)"></i>тренування</span><span><i style="background:var(--ok-soft);outline:1px solid var(--ok)"></i>щоденне</span></div></div>`;
  }

  /* ---------- графіки (SVG) ---------- */
  function niceRange(min, max) { if (min === max) { const d = Math.abs(min) * 0.1 || 1; return [min - d, max + d]; } const p = (max - min) * 0.08; return [min - p, max + p]; }
  function lineChart(series, opt) {
    const W = 340, H = opt.h || 170, L = 36, R = 10, T = 10, B = 22;
    const all = series.flatMap((s) => s.pts); if (!all.length) return '<p class="empty">Ще немає даних</p>';
    let t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t)); if (t0 === t1) { t0 -= 864e5; t1 += 864e5; }
    const [v0, v1] = niceRange(Math.min(...all.map((p) => p.v)), Math.max(...all.map((p) => p.v)));
    const x = (t) => L + (t - t0) / (t1 - t0) * (W - L - R), y = (v) => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B);
    let g = '';
    [v0 + (v1 - v0) * 0.1, (v0 + v1) / 2, v1 - (v1 - v0) * 0.1].forEach((v) => { g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${fmt(Math.round(v * 10) / 10)}</text>`; });
    const d0 = new Date(t0), d1 = new Date(t1);
    g += `<text x="${L}" y="${H - 6}">${pad(d0.getDate())}.${pad(d0.getMonth() + 1)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${pad(d1.getDate())}.${pad(d1.getMonth() + 1)}</text>`;
    series.forEach((s) => {
      if (!s.pts.length) return;
      const path = s.pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ');
      g += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="4 3"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      if (s.dots !== false) s.pts.forEach((p) => { g += `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${p.pr ? 5 : 3}" fill="${p.pr ? 'var(--card)' : s.color}" stroke="${s.color}" stroke-width="${p.pr ? 2.5 : 0}"/>`; });
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || 'графік')}">${g}</svg>`;
  }
  function barStack(weeks) {
    const W = 340, H = 170, L = 26, R = 6, T = 8, B = 22;
    if (!weeks.length) return '<p class="empty">Ще немає даних</p>';
    const tot = weeks.map((w) => GROUPS.reduce((a, [k]) => a + (w.parts[k] || 0), 0));
    const mx = Math.max(1, ...tot); const bw = (W - L - R) / weeks.length;
    let g = `<line class="grid" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><text x="${L - 4}" y="${T + 8}" text-anchor="end">${mx}</text>`;
    weeks.forEach((w, i) => {
      let yy = H - B; const x0 = L + i * bw + bw * 0.18, ww = bw * 0.64;
      GROUPS.forEach(([k]) => { const c = w.parts[k] || 0; if (!c) return; const h = c / mx * (H - T - B); yy -= h; g += `<rect x="${x0.toFixed(1)}" y="${yy.toFixed(1)}" width="${ww.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--g-${k})" rx="2"/>`; });
      g += `<text x="${(x0 + ww / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${dm(w.key)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="підходи на тиждень">${g}</svg>
      <div class="legend">${GROUPS.map(([k, l]) => `<span><i style="background:var(--g-${k})"></i>${l}</span>`).join('')}</div>`;
  }
  function heatmap(p) {
    const now = new Date(); const day = (now.getDay() + 6) % 7;
    const start = new Date(now); start.setDate(now.getDate() - day - 7 * 11);
    const trained = new Set(p.sessions.map((s) => s.date)); const t = today();
    let cols = '';
    for (let w = 0; w < 12; w++) {
      let c = '';
      for (let k = 0; k < 7; k++) {
        const d = new Date(start); d.setDate(start.getDate() + w * 7 + k); const ds = isoDate(d);
        const r = p.daily[ds] || {}; const any = Object.keys(r).some((x) => r[x]);
        c += `<div class="c${ds > t ? ' f' : trained.has(ds) ? ' t' : any ? ' d' : ''}" title="${dm(ds)}"></div>`;
      }
      cols += `<div class="col">${c}</div>`;
    }
    return `<div class="heat">${cols}</div><div class="legend"><span><i style="background:var(--accent)"></i>тренування</span><span><i style="background:var(--ok-soft);outline:1px solid var(--ok)"></i>щоденне</span><span>стовпчик — тиждень, згори — понеділок</span></div>`;
  }

  /* ---------- прогрес ---------- */
  let progressEx = null;
  function renderProgress() {
    const p = P(), prog = G(), h = p.handle;
    const done = p.sessions.length, planned = 36;
    const prs = (() => { let c = 0; const seen = {}; p.sessions.forEach((s) => { const byEx = {}; s.sets.forEach((x) => { (byEx[x.ex] = byEx[x.ex] || []).push(x); });
      Object.keys(byEx).forEach((id) => { const ex = prog.ex[id]; if (!ex) return; const b = ENGINE.bestOf(ex, byEx[id], h); if (seen[id] !== undefined && b > seen[id]) c++; seen[id] = Math.max(seen[id] || 0, b); }); }); return c; })();
    const last28 = p.sessions.filter((s) => Date.now() - tms(s.date) < 28 * 864e5).length;
    const wkSet = new Set(p.sessions.map((s) => ENGINE.weekKey(s.date)));
    let streak = 0; { const d = new Date(); if (!wkSet.has(ENGINE.weekKey(isoDate(d)))) d.setDate(d.getDate() - 7); /* поточний тиждень ще не скінчився — серію не обриваємо */
      for (;;) { const k = ENGINE.weekKey(isoDate(d)); if (wkSet.has(k)) { streak++; d.setDate(d.getDate() - 7); } else break; } }
    const used = {}; p.sessions.forEach((s) => s.sets.forEach((x) => { used[x.ex] = 1; }));
    const ids = Object.keys(prog.ex).filter((id) => used[id]).sort((a, b) => (prog.ex[b].main ? 1 : 0) - (prog.ex[a].main ? 1 : 0));
    if (!progressEx || !used[progressEx]) progressEx = ids[0] || null;
    let exBlock = '<p class="empty">Після першого тренування тут зʼявиться графік кожної вправи.</p>';
    if (progressEx) {
      const ex = prog.ex[progressEx], hist = exHist(progressEx);
      let best = 0; const pts = hist.map((x) => { const v = ENGINE.bestOf(ex, x.sets, h); const pr = best > 0 && v > best; best = Math.max(best, v); return { t: tms(x.date), v, pr }; });
      const rows = hist.slice(-6).reverse().map((x) => {
        let bs = x.sets[0], bv = -1; x.sets.forEach((s) => { const v = ENGINE.metric(ex, s, h); if (v > bv) { bv = v; bs = s; } });
        const ld = (ex.type === 'band') ? 'рівень ' + fmt(bs.load) + ' · ' : (bs.load === null || bs.load === undefined ? '' : 'гриф + ' + fmt(bs.load) + ' · ');
        return `<tr><td>${dm(x.date)}${x.deload ? ' <span class="chip warn">легкий</span>' : ''}</td><td>${ld}${bs.reps}${ex.type === 'time' ? ' с' : ''} · ${x.sets.length} підх.</td></tr>`;
      }).join('');
      const plat = ENGINE.plateau(ex, hist, h) ? '<div class="note warn small">Плато: спробуйте опускання 3–4 с, паузу 2 с або +1 підхід.</div>' : '';
      exBlock = `<select id="exSel">${ids.map((id) => `<option value="${id}"${id === progressEx ? ' selected' : ''}>${esc(prog.ex[id].name)}</option>`).join('')}</select>
        <p class="small muted">${esc(ENGINE.metricLabel(ex))} · кружечок з обводкою — рекорд</p>
        ${lineChart([{ pts, color: 'var(--accent)' }], { label: ex.name })}${plat}
        <table class="hist">${rows}</table>`;
    }
    const ws = ENGINE.weeklySets(prog, p);
    const weeks = Object.keys(ws).sort().slice(-8).map((k) => ({ key: k, parts: ws[k] }));
    const platList = ids.filter((id) => ENGINE.plateau(prog.ex[id], exHist(id), h)).map((id) => esc(prog.ex[id].name));
    app.innerHTML = `<h1>Прогрес</h1>
      <div class="stats">
        <div class="stat"><b>${done} / ${planned}</b><span>тренувань за 12 тижнів</span></div>
        <div class="stat"><b>${last28}</b><span>за 4 тижні (план — 12)</span></div>
        <div class="stat"><b>${streak}</b><span>тижнів поспіль</span></div>
        <div class="stat"><b>${prs}</b><span>рекордів</span></div></div>
      ${platList.length ? `<div class="note warn small">Плато: ${platList.join(', ')}.</div>` : ''}
      <h2>Вправа</h2><div class="card">${exBlock}</div>
      <h2>Підходи на тиждень по групах м'язів</h2><div class="card">${barStack(weeks)}</div>
      <h2>Календар · 12 тижнів</h2><div class="card">${heatmap(p)}</div>
      <h2>Історія тренувань</h2><div class="card">${p.sessions.length ? `<table class="hist">${p.sessions.slice(-10).reverse().map((s) => `<tr><td>${dm(s.date)} · ${esc(prog.workouts[s.workout] ? prog.workouts[s.workout].title : s.workout)}<div class="small muted">тиждень ${s.week} · ${s.sets.length} підх.${s.mins ? ' · ' + s.mins + ' хв' : ''}</div></td><td><button type="button" class="small ghost" data-act="delSession" data-id="${s.id}">Видалити</button></td></tr>`).join('')}</table>` : '<p class="empty">Ще немає тренувань</p>'}</div>`;
    const sel = document.getElementById('exSel'); if (sel) sel.onchange = () => { progressEx = sel.value; renderProgress(); };
  }

  /* ---------- тіло ---------- */
  const TESTS = [['chair', 'Вставання з крісла за 30 с', 'разів'], ['balL', 'Стійка на одній нозі — ліва', 'с'], ['balR', 'Стійка на одній нозі — права', 'с'],
    ['spL', 'Бічна планка — ліворуч', 'с'], ['spR', 'Бічна планка — праворуч', 'с'], ['push', 'Віджимання', 'разів'], ['carL', 'Валізна прогулянка — ліва рука', 'с'], ['carR', 'Валізна прогулянка — права рука', 'с']];
  function renderBody() {
    const p = P(), b = p.body;
    const wPts = b.weight.slice().sort((x, y) => (x.d < y.d ? -1 : 1)).map((q) => ({ t: tms(q.d), v: Number(q.v) }));
    const avg = ENGINE.rolling7(b.weight).map((q) => ({ t: tms(q.d), v: q.v }));
    const waist = b.waist.slice().sort((x, y) => (x.d < y.d ? -1 : 1)).map((q) => ({ t: tms(q.d), v: Number(q.v) }));
    const lastW = b.weight.length ? b.weight.slice().sort((x, y) => (x.d < y.d ? -1 : 1))[b.weight.length - 1] : null;
    const avgLast = avg.length ? avg[avg.length - 1].v : null;
    const avgWeekAgo = (() => { const t0 = Date.now() - 7 * 864e5; const c = avg.filter((q) => q.t <= t0); return c.length ? c[c.length - 1].v : null; })();
    const trend = avgLast !== null && avgWeekAgo !== null ? (avgLast - avgWeekAgo) : null;
    let tests = '';
    if (G().tests) {
      const tl = (b.tests || []).slice().sort((x, y) => (x.d < y.d ? -1 : 1));
      const charts = [['chair', ['chair']], ['bal', ['balL', 'balR']], ['sp', ['spL', 'spR']], ['push', ['push']], ['car', ['carL', 'carR']]].map(([k, keys]) => {
        const ser = keys.map((key, i) => ({ pts: tl.filter((t) => t[key] !== null && t[key] !== undefined && t[key] !== '').map((t) => ({ t: tms(t.d), v: Number(t[key]) })), color: i ? 'var(--g-chest)' : 'var(--accent)', width: 2 }));
        if (!ser.some((x) => x.pts.length)) return '';
        const name = { chair: 'Вставання з крісла за 30 с', bal: 'Стійка на одній нозі, с', sp: 'Бічна планка, с', push: 'Віджимання', car: 'Валізна прогулянка, с' }[k];
        return `<h3>${name}</h3>${lineChart(ser, { h: 130, label: name })}${keys.length > 1 ? '<div class="legend"><span><i style="background:var(--accent)"></i>ліва</span><span><i style="background:var(--g-chest)"></i>права</span></div>' : ''}`;
      }).join('');
      tests = `<h2>Тести готовності до старіння</h2><div class="card"><p class="small muted">Тижні 1, 4, 8, 12. Головне — щоб числа росли від тесту до тесту.</p>
        <div class="grid2">${TESTS.map(([k, l, u]) => `<div><label class="f">${l}, ${u}</label><input inputmode="decimal" id="t_${k}"></div>`).join('')}</div><p></p>
        <button type="button" class="primary wide" data-act="saveTests">Зберегти тести</button>${tl.length ? charts : ''}</div>`;
    }
    app.innerHTML = `<h1>Тіло</h1>
      <h2>Вага</h2><div class="card">
        <div class="row" style="flex-wrap:nowrap"><input inputmode="decimal" id="wIn" placeholder="кг, зранку натщесерце"><button type="button" class="primary" data-act="saveW">Зберегти</button></div>
        <p class="small muted">${lastW ? 'Останній запис: ' + fmt(lastW.v) + ' кг (' + dm(lastW.d) + ')' : 'Зважуйтесь щоранку — дивимось на середню за 7 днів'}${trend !== null ? ' · за тиждень ' + (trend > 0 ? '+' : '') + fmt(Math.round(trend * 10) / 10) + ' кг' : ''}</p>
        ${lineChart([{ pts: wPts, color: 'var(--muted)', width: 1, dots: true }, { pts: avg, color: 'var(--accent)', width: 2.5, dots: false }], { label: 'вага' })}
        <div class="legend"><span><i style="background:var(--muted)"></i>щоденна</span><span><i style="background:var(--accent)"></i>середня за 7 днів</span></div></div>
      <h2>Талія</h2><div class="card">
        <div class="row" style="flex-wrap:nowrap"><input inputmode="decimal" id="waIn" placeholder="см, на рівні пупка, раз на 2 тижні"><button type="button" class="primary" data-act="saveWa">Зберегти</button></div>
        ${lineChart([{ pts: waist, color: 'var(--g-back)' }], { label: 'талія', h: 130 })}</div>
      ${tests}
      <div class="note small">Фото спереду, збоку й ззаду — на тижнях 1, 4, 8, 12, в однаковому світлі. Фото лишайте в «Фото» на телефоні: у журналі їх не зберігаємо.</div>`;
  }
  function addPoint(list, v) { const t = today(); const i = list.findIndex((q) => q.d === t); if (i >= 0) list[i].v = v; else list.push({ d: t, v }); }

  /* ---------- налаштування й резервні копії ---------- */
  async function shareOrDownload(name, text, type) {
    const blob = new Blob([text], { type });
    try {
      const file = new File([blob], name, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return true;
  }
  async function backup() {
    const ok = await shareOrDownload('trenuvannia-' + today() + '.json', JSON.stringify({ app: 'trening', v: 1, exported: new Date().toISOString(), db: DB }), 'application/json');
    if (ok) { DB.lastBackup = today(); save(); toast('Резервну копію створено'); renderSettings(); }
  }
  function csv() {
    const prog = G(), h = P().handle, rows = [['дата', 'тиждень', 'тренування', 'вправа', 'варіант', 'підхід', 'диски_кг', 'на_гантель_кг', 'повторення_або_с', 'запас']];
    P().sessions.forEach((s) => { const cnt = {}; s.sets.forEach((x) => { const ex = prog.ex[x.ex] || { name: x.ex }; cnt[x.ex] = (cnt[x.ex] || 0) + 1;
      const per = (x.load === null || x.load === undefined || ex.type === 'band') ? '' : String(h + Number(x.load));
      rows.push([s.date, s.week, s.workout, ex.name, x.variant || '', cnt[x.ex], x.load === null || x.load === undefined ? '' : x.load, per, x.reps, x.rir === null || x.rir === undefined ? '' : x.rir]); }); });
    const text = String.fromCharCode(65279) + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
    shareOrDownload('trenuvannia-' + today() + '.csv', text, 'text/csv');
  }
  function restore(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        if (!o || o.app !== 'trening' || !o.db || !o.db.profiles) throw new Error('format');
        const cnt = Object.values(o.db.profiles).reduce((a, q) => a + ((q && q.sessions) ? q.sessions.length : 0), 0);
        if (!confirm('Відновити копію від ' + String(o.exported || '').slice(0, 10) + ' (' + cnt + ' тренувань)? Поточні дані на цьому телефоні буде замінено.')) return;
        DB = o.db; if (!DB.active || !DB.profiles[DB.active]) DB.active = Object.keys(DB.profiles)[0] || null;
        save(); toast('Дані відновлено'); tab = 'today'; render();
      } catch (e) { toast('Це не схоже на резервну копію журналу'); }
    };
    r.readAsText(file);
  }
  function renderSettings() {
    const p = P(), prog = G();
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    const curWeek = ENGINE.planFor(prog, nextN()).week;
    app.innerHTML = `<h1>Налаштування</h1>
      ${standalone ? '' : '<div class="note warn small"><b>Встановіть як застосунок:</b> у Safari натисніть «Поділитися» → «На початковий екран» і далі відкривайте журнал лише з іконки. На iPhone в іконки й у Safari окремі сховища: записане в Safari в іконці не зʼявиться (перенести можна резервною копією).</div>'}
      <div class="card"><label class="f">Програма на цьому телефоні</label>
        <select id="progSel">${Object.values(PROGRAMS).map((q) => `<option value="${q.id}"${q.id === DB.active ? ' selected' : ''}>${esc(q.title)}</option>`).join('')}</select>
        <label class="f">Вага грифа без дисків, кг (зважте на кухонних вагах)</label><input inputmode="decimal" id="handleIn" value="${fmt(p.handle)}">
        <label class="f">Наступне тренування — тиждень</label>
        <select id="weekSel" ${p.draft ? 'disabled' : ''}>${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}"${k + 1 === curWeek ? ' selected' : ''}>${k + 1}</option>`).join('')}</select>
        <p class="small muted">Міняйте, лише якщо вже тренувались до журналу або була перерва.</p></div>
      <h2>Резервна копія</h2><div class="card">
        <p class="small">Дані зберігаються лише в цьому телефоні. Раз на тиждень зберігайте копію в iCloud, «Файли» або Telegram — з неї все відновиться на новому телефоні.</p>
        <p class="small muted">Остання копія: ${DB.lastBackup ? dm(DB.lastBackup) : 'ще не було'}</p>
        <button type="button" class="primary wide" data-act="backup">Зберегти резервну копію</button><p></p>
        <label class="btn" style="display:block;text-align:center">Відновити з копії<input type="file" id="restoreIn" accept=".json,application/json" style="display:none"></label><p></p>
        <button type="button" class="wide" data-act="csv">Вивантажити таблицю (CSV)</button></div>
      <h2>Інше</h2><div class="card">
        <p class="small muted">Версія ${VERSION} · <span id="persist">перевіряю сховище…</span></p>
        <button type="button" class="ghost wide" data-act="wipe">Стерти дані цієї програми на цьому телефоні</button></div>`;
    document.getElementById('progSel').onchange = (e) => { DB.active = e.target.value; if (!DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(); save(); render(); };
    document.getElementById('handleIn').onchange = (e) => { const v = num(e.target.value); if (v === null || v < 0 || v > 10) { toast('Вага грифа — від 0 до 10 кг'); e.target.value = fmt(p.handle); return; } p.handle = v; save(); toast('Збережено'); };
    document.getElementById('weekSel').onchange = (e) => { const w = Number(e.target.value); p.offset = (w - 1) * 3 - p.sessions.length; save(); toast('Наступне тренування — тиждень ' + w); };
    document.getElementById('restoreIn').onchange = (e) => { if (e.target.files && e.target.files[0]) restore(e.target.files[0]); };
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((v) => { const el = document.getElementById('persist'); if (el) el.textContent = v ? 'сховище захищене від автоочищення' : 'сховище звичайне — робіть резервні копії'; }).catch(() => {});
    else { const el = document.getElementById('persist'); if (el) el.textContent = 'робіть резервні копії'; }
  }

  /* ---------- події ---------- */
  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, i = Number(b.dataset.i), j = Number(b.dataset.j);
    if (act === 'pick') { DB.active = b.dataset.id; if (!DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile(); save();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); tab = 'today'; render(); return; }
    const p = P();
    if (act === 'start' || act === 'startOther') {
      const wid = act === 'startOther' ? document.getElementById('otherW').value : '';
      if (act === 'startOther' && !wid) { toast('Оберіть тренування'); return; }
      p.draft = buildDraft(wid || null); save(); renderToday(); window.scrollTo(0, 0); return;
    }
    if (act === 'done') return markDone(i, j);
    if (act === 'skip') { p.draft.items[i].skipped = true; save(); renderToday(); return; }
    if (act === 'unskip') { p.draft.items[i].skipped = false; save(); renderToday(); return; }
    if (act === 'addset') { const it = p.draft.items[i], l = it.sets[it.sets.length - 1] || { load: null, reps: null }; it.sets.push({ load: l.load, reps: l.reps, rir: null, done: false, pr: false }); save(); renderToday(); return; }
    if (act === 'finish') return finish();
    if (act === 'cancel') { if (confirm('Скасувати тренування? Відмічені підходи не збережуться.')) { p.draft = null; save(); stopTimer(); keepAwake(false); renderToday(); } return; }
    if (act === 'jump') { const k = Number(b.dataset.k), t = today(); const r = p.daily[t] = p.daily[t] || {}; r.jumps = (r.jumps || 0) >= k ? k - 1 : k; save(); renderDaily(); return; }
    if (act === 'saveW' || act === 'saveWa') {
      const el = document.getElementById(act === 'saveW' ? 'wIn' : 'waIn'), v = num(el.value);
      const okR = act === 'saveW' ? (v !== null && v > 25 && v < 300) : (v !== null && v > 40 && v < 250);
      if (!okR) { toast('Перевірте число'); return; }
      addPoint(act === 'saveW' ? p.body.weight : p.body.waist, v); save(); toast('Збережено'); renderBody(); return;
    }
    if (act === 'saveTests') {
      const rec = { d: today() }; let any = false;
      TESTS.forEach(([k]) => { const v = num(document.getElementById('t_' + k).value); rec[k] = v; if (v !== null) any = true; });
      if (!any) { toast('Заповніть хоча б один тест'); return; }
      const idx = p.body.tests.findIndex((t) => t.d === rec.d); if (idx >= 0) p.body.tests[idx] = rec; else p.body.tests.push(rec);
      save(); toast('Тести збережено'); renderBody(); return;
    }
    if (act === 'delSession') { const id = Number(b.dataset.id); if (!confirm('Видалити це тренування з журналу?')) return; p.sessions = p.sessions.filter((s) => s.id !== id); save(); renderProgress(); return; }
    if (act === 'backup') return backup();
    if (act === 'csv') return csv();
    if (act === 'wipe') { if (confirm('Стерти всі тренування й заміри цієї програми на цьому телефоні?') && confirm('Точно? Відновити можна лише з резервної копії.')) { DB.profiles[DB.active] = newProfile(); save(); toast('Дані стерто'); render(); } }
  });
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.act === 'daily') { const d = today(); const r = P().daily[d] = P().daily[d] || {}; r[t.dataset.id] = t.checked; save(); return; }
    const f = t.dataset && t.dataset.f; if (!f || !P().draft) return;
    const it = P().draft.items[Number(t.dataset.i)];
    if (f === 'variant') { it.variant = t.value; save(); return; }
    const s = it.sets[Number(t.dataset.j)];
    if (f === 'load') { const v = num(t.value); s.load = v; }
    if (f === 'reps') { const v = num(t.value); s.reps = v === null ? null : Math.max(0, Math.round(v)); }
    if (f === 'rir') { s.rir = t.value === '' ? null : Number(t.value); }
    save();
  });

  /* ---------- запуск ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  if (DB.active && !DB.profiles[DB.active]) DB.profiles[DB.active] = newProfile();
  render();
})();
