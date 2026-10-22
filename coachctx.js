/* Зріз програми для голосового тренера (сервер, server/src/coach.js): лише тренувальні дані.
   Без імені, віку, зросту, ваги тіла, галочок здоровʼя, замірів, фото, харчування й самопочуття — слово Alexа 23.10:
   тренер консультує «на базі створених завчасно програм тренувань», не на особистих даних. */
var COACHCTX = (function () {
  var TYPE = { W: 'розминковий', N: 'робочий', F: 'до відмови', M: 'міо-підхід', D: 'дроп-сет' };
  var PLACE = { home: 'вдома', gym: 'у залі' };
  function num(x) { return String(Math.round(Number(x) * 100) / 100).replace('.', ','); }
  function reps(it) { return it.min === it.max ? String(it.min) : it.min + '–' + it.max; }
  /* вага підходу словами, як її показує застосунок */
  function load(ex, v) {
    if (ex.type === 'band') return v === null || v === undefined || v === '' ? '' : 'опір рівня ' + num(v);
    if (v === null || v === undefined || v === '') return ex.type === 'dbopt' ? 'без гантелі' : '';
    if (ex.type === 'mach') return num(v) + ' кг на тренажері';
    if (ex.type === 'db' || ex.type === 'dbopt') return 'диски ' + num(v) + ' кг на гантель (гриф окремо)';
    return num(v) + ' кг';
  }
  function setLine(ex, s, k) {
    var r = s.reps === null || s.reps === undefined ? '?' : s.reps + (ex.type === 'time' ? ' с' : ' повторень');
    var l = load(ex, s.load);
    return (k + 1) + ') ' + (TYPE[s.type] || 'робочий') + ': ' + (l ? l + ' × ' : '') + r + (s.done ? ' — зроблено' : '');
  }
  /* Текст для моделі. o: { prog, plan, items, place, inProgress, cur: { i, j } | null, done, total } */
  function text(o) {
    var prog = o.prog, plan = o.plan, out = [];
    var name = function (id) { return (prog.ex[id] || {}).name || id; };
    out.push('Версія програми: ' + (prog.sex === 'f' ? 'жіноча' : 'чоловіча') + ' база' + (prog.custom ? ', індивідуальна програма за анкетою' : ' «' + prog.title + '»') + (prog.sub ? ' (' + prog.sub + ')' : '') + '.');
    out.push('Тренувань на тиждень: ' + (prog.perWeek || 3) + '. Легкі тижні: ' + (prog.deload || []).join(' і ') + '. Міо-підходи: ' + (prog.myoFrom ? 'з тижня ' + prog.myoFrom : 'немає') + '.');
    var n = plan.note || {};
    out.push('Зараз: тиждень ' + plan.week + (plan.cycle > 1 ? ', цикл ' + plan.cycle : '') + '; ' + (n.phase || '') + '; ' + (n.rir || '') + (plan.deload ? '; легкий тиждень' : '') + '. ' + (n.text || ''));
    var W = (o.place === 'gym' && prog.gymWorkouts ? prog.gymWorkouts : prog.workouts) || {};
    var wt = (W[o.workout] || {}).title || o.workout;
    out.push((o.inProgress ? 'Тренування триває' : 'Наступне тренування') + ': ' + wt + (o.place ? ', ' + (PLACE[o.place] || o.place) : '') + (o.inProgress && o.total ? '; зроблено ' + o.done + ' з ' + o.total + ' підходів' : '') + '.');
    (o.items || []).forEach(function (it, i) {
      var ex = prog.ex[it.ex] || {};
      var head = '- ' + name(it.ex) + (it.skipped ? ' (пропущено)' : '') + ': ' + reps(it) + (ex.type === 'time' ? ' с' : ' повторень') + ', відпочинок ' + it.rest + ' с' +
        (it.ss && it.ss.pair ? ', суперсет ' + (it.ss.g || '') + ' з «' + name(it.ss.pair) + '»' : '') + (it.from ? ', замість «' + name(it.from) + '»' : '') + '.';
      var cur = o.cur && o.cur.i === i ? ' ← зараз підхід ' + (o.cur.j + 1) : '';
      out.push(head + cur + ' Підходи: ' + it.sets.map(function (s, k) { return setLine(ex, s, k); }).join('; ') + '.' + (it.note ? ' Підказка застосунку: ' + it.note : ''));
    });
    out.push('Розклад програми (тиждень: тренування — фаза):');
    for (var wk = 1; wk <= 12; wk++) {
      var nn = prog.note(wk) || {};
      out.push('- ' + wk + ': ' + prog.week(wk).join(' · ') + ' — ' + (nn.phase || '') + (prog.deload && prog.deload.indexOf(wk) >= 0 ? ', легкий' : ''));
    }
    [['workouts', prog.place === 'gym' ? 'у залі' : 'основне місце'], ['gymWorkouts', 'у залі']].forEach(function (p) {
      var ws = prog[p[0]]; if (!ws) return;
      Object.keys(ws).forEach(function (w) {
        out.push('Тренування ' + w + ' (' + p[1] + '): ' + ws[w].items.map(function (it) { return name(it.ex) + ' ' + it.sets + '×' + reps(it); }).join('; ') + '.');
      });
    });
    return out.join('\n');
  }
  return { text: text };
})();
if (typeof module !== 'undefined') module.exports = COACHCTX;
