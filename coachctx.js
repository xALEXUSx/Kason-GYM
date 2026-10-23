var LL = typeof LL === 'function' ? LL : (typeof I18N !== 'undefined' ? I18N.L : function (u) { return u; });  // мова (i18n.js); у node — українська
/* Зріз програми для голосового тренера (сервер, server/src/coach.js): лише тренувальні дані.
   Без імені, віку, зросту, ваги тіла, галочок здоровʼя, замірів, фото, харчування й самопочуття — слово Alexа 23.10:
   тренер консультує «на базі створених завчасно програм тренувань», не на особистих даних. */
var COACHCTX = (function () {
  var TYPE = { W: LL('розминковий', "warm-up"), N: LL('робочий', "working"), F: LL('до відмови', "to failure"), M: LL('міо-підхід', "myo-rep set"), D: LL('дроп-сет', "drop set") };
  var PLACE = { home: LL('вдома', "at home"), gym: LL('у залі', "at the gym") };
  function num(x) { var s = String(Math.round(Number(x) * 100) / 100); return typeof I18N !== 'undefined' && I18N.lang === 'en' ? s : s.replace('.', ','); }
  function reps(it) { return it.min === it.max ? String(it.min) : it.min + '–' + it.max; }
  /* вага підходу словами, як її показує застосунок */
  function load(ex, v) {
    if (ex.type === 'band') return v === null || v === undefined || v === '' ? '' : LL('опір рівня ', "resistance level ") + num(v);
    if (v === null || v === undefined || v === '') return ex.type === 'dbopt' ? LL('без гантелі', "no dumbbell") : '';
    if (ex.type === 'mach') return num(v) + LL(' кг на тренажері', " kg on the machine");
    if (ex.type === 'db' || ex.type === 'dbopt') return LL('диски ', "plates ") + num(v) + LL(' кг на гантель (гриф окремо)', " kg per dumbbell (handle not included)");
    return num(v) + LL(' кг', " kg");
  }
  function setLine(ex, s, k) {
    var r = s.reps === null || s.reps === undefined ? '?' : s.reps + (ex.type === 'time' ? LL(' с', " sec") : LL(' повторень', " reps"));
    var l = load(ex, s.load);
    return (k + 1) + ') ' + (TYPE[s.type] || LL('робочий', "working")) + ': ' + (l ? l + ' × ' : '') + r + (s.done ? LL(' — зроблено', " — done") : '');
  }
  /* Текст для моделі. o: { prog, plan, items, place, inProgress, cur: { i, j } | null, done, total, back: речення про повернення після перерви | '' } */
  function text(o) {
    var prog = o.prog, plan = o.plan, out = [];
    var name = function (id) { return (prog.ex[id] || {}).name || id; };
    out.push(LL('Версія програми: ', "Program version: ") + (prog.sex === 'f' ? LL('жіноча', "female") : LL('чоловіча', "male")) + LL(' база', " base") + (prog.custom ? LL(', індивідуальна програма за анкетою', ", custom program from the questionnaire") : ' «' + prog.title + LL('»', '”')) + (prog.sub ? ' (' + prog.sub + ')' : '') + '.');
    out.push(LL('Тренувань на тиждень: ', "Workouts per week: ") + (prog.perWeek || 3) + LL('. Легкі тижні: ', ". Deload weeks: ") + (prog.deload || []).join(LL(' і ', " and ")) + LL('. Міо-підходи: ', ". Myo-rep sets: ") + (prog.myoFrom ? LL('з тижня ', "from week ") + prog.myoFrom : LL('немає', "none")) + '.');
    if (prog.units === 'lb') out.push(LL('Одиниці ваги: фунти (lb), диски 10 · 5 · 2,5 lb; усі ваги нижче — у фунтах.', 'Weight units: pounds (lb), plates 10 · 5 · 2.5 lb; all weights below are in pounds.'));  // з 3.18.0
    var n = plan.note || {};
    out.push(LL('Зараз: тиждень ', "Now: week ") + plan.week + (plan.cycle > 1 ? LL(', цикл ', ", cycle ") + plan.cycle : '') + '; ' + (n.phase || '') + '; ' + (n.rir || '') + (plan.deload ? LL('; легкий тиждень', "; deload week") : '') + '. ' + (n.text || ''));
    if (o.back) out.push(LL('Повернення після перерви (застосунок сам зменшив вагу; до відмови не ходимо, міо й дропів немає): ', "Back after a break (the app lowered the weights automatically; no sets to failure, no myo-reps or drop sets): ") + o.back);
    var W = (o.place === 'gym' && prog.gymWorkouts ? prog.gymWorkouts : prog.workouts) || {};
    var wt = (W[o.workout] || {}).title || o.workout;
    out.push((o.inProgress ? LL('Тренування триває', "Workout in progress") : LL('Наступне тренування', "Next workout")) + ': ' + wt + (o.place ? ', ' + (PLACE[o.place] || o.place) : '') + (o.inProgress && o.total ? LL('; зроблено ', "; completed ") + o.done + LL(' з ', " of ") + o.total + LL(' підходів', " sets") : '') + '.');
    (o.items || []).forEach(function (it, i) {
      var ex = prog.ex[it.ex] || {};
      var head = '- ' + name(it.ex) + (it.skipped ? LL(' (пропущено)', " (skipped)") : '') + ': ' + reps(it) + (ex.type === 'time' ? LL(' с', " sec") : LL(' повторень', " reps")) + LL(', відпочинок ', ", rest ") + it.rest + LL(' с', " sec") +
        (it.ss && it.ss.pair ? LL(', суперсет ', ", superset ") + (it.ss.g || '') + LL(' з «', " with “") + name(it.ss.pair) + LL('»', '”') : '') + (it.from ? LL(', замість «', ", instead of “") + name(it.from) + LL('»', '”') : '') + '.';
      var cur = o.cur && o.cur.i === i ? LL(' ← зараз підхід ', " ← current set ") + (o.cur.j + 1) : '';
      out.push(head + cur + LL(' Підходи: ', " Sets: ") + it.sets.map(function (s, k) { return setLine(ex, s, k); }).join('; ') + '.' + (it.note ? LL(' Підказка застосунку: ', " App hint: ") + it.note : ''));
    });
    out.push(LL('Розклад програми (тиждень: тренування — фаза):', "Program schedule (week: workouts — phase):"));
    for (var wk = 1; wk <= 12; wk++) {
      var nn = prog.note(wk) || {};
      out.push('- ' + wk + ': ' + prog.week(wk).join(' · ') + ' — ' + (nn.phase || '') + (prog.deload && prog.deload.indexOf(wk) >= 0 ? LL(', легкий', ", deload") : ''));
    }
    [['workouts', prog.place === 'gym' ? LL('у залі', "at the gym") : LL('основне місце', "main location")], ['gymWorkouts', LL('у залі', "at the gym")]].forEach(function (p) {
      var ws = prog[p[0]]; if (!ws) return;
      Object.keys(ws).forEach(function (w) {
        out.push(LL('Тренування ', "Workout ") + w + ' (' + p[1] + '): ' + ws[w].items.map(function (it) { return name(it.ex) + ' ' + it.sets + '×' + reps(it); }).join('; ') + '.');
      });
    });
    if (o.prog && o.prog.units === 'lb') out = out.map(function (l) { return String(l).replace(/кг/g, 'lb').replace(/\bkg\b/g, 'lb'); });  // програма у фунтах (з 3.18.0)
    if (o.kitchen) out.push(o.kitchen);  // кухня сьогодні (з 3.20.0): записане й норма — числа з бази USDA й записів людини
    return out.join('\n');
  }
  return { text: text };
})();
if (typeof module !== 'undefined') module.exports = COACHCTX;
