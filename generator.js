/* Індивідуальна програма за анкетою.
   Вправи, підходи, повторення й відпочинок — з двох перевірених програм (усі ці фрази вже озвучено записаним голосом);
   добір — за обладнанням, обмеженнями, метою, досвідом, віком і днями. Відповіді анкети зберігаються в акаунті,
   програма щоразу відтворюється з них однаково (VER — версія правил добору). */
var GEN = (function () {
  var VER = 1;

  /* ---------- анкета: усі поля обовʼязкові ---------- */
  var GOALS = { loss: 'Схуднути', muscle: 'Набрати мʼязи', health: 'Сила й здоровʼя', posture: 'Спина й осанка' };
  var EQUIP = { db: 'Гантелі з дисками', band: 'Петля-еспандер (резинка з кріпленням до дверей)' };
  /* Здоровʼя — лише те, що справді змінює програму: кожен пункт прибирає або полегшує певні вправи */
  var LIMITS = { back: 'Грижа або біль у спині', knees: 'Коліна: біль або травма', shoulders: 'Плечі: біль або травма', heart: 'Тиск або серце', pregnant: 'Вагітність', none: 'Нічого з цього' };
  var DAYS = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Нд']];

  /* Перевірка відповідей: { ok, errors: {поле: текст}, block: текст — коли програму скласти не можна } */
  function check(a) {
    var e = {};
    a = a || {};
    if (!a.name || !String(a.name).trim()) e.name = 'Вкажіть імʼя';
    else if (String(a.name).trim().length > 24) e.name = 'До 24 знаків';
    if (a.sex !== 'm' && a.sex !== 'f') e.sex = 'Оберіть стать';
    var age = Number(a.age), h = Number(a.height), w = Number(a.weight);
    if (!(age >= 16 && age <= 85)) e.age = 'Вік — від 16 до 85';
    if (!(h >= 130 && h <= 220)) e.height = 'Зріст — від 130 до 220 см';
    if (!(w >= 40 && w <= 200)) e.weight = 'Вага — від 40 до 200 кг';
    if (!GOALS[a.goal]) e.goal = 'Оберіть мету';
    if (a.level !== 'new' && a.level !== 'exp') e.level = 'Оберіть досвід';
    var eq = a.equip || [];
    if (!eq.length) e.equip = 'Потрібні гантелі або петля-еспандер';
    var lim = a.limits || [];
    if (a.sex === 'm') lim = lim.filter(function (x) { return x !== 'pregnant'; });
    if (!lim.length) e.limits = 'Позначте, що у вас є, або «Нічого з цього»';
    var d = a.days || [];
    if (d.length < 2 || d.length > 4) e.days = 'Оберіть від 2 до 4 днів';
    if (!a.agree) e.agree = 'Підтвердіть, щоб продовжити';
    var block = '';
    if (lim.indexOf('pregnant') >= 0) block = 'Під час вагітності програму тренувань складає лікар. Застосунок не складатиме її автоматично.';
    return { ok: !Object.keys(e).length && !block, errors: e, block: block };
  }

  /* ---------- вправи ---------- */
  /* Шаблон кожної вправи — з програми-джерела (перше входження): підходи, повторення, відпочинок. */
  function templates(src) {
    var out = {}, P = PROGRAMS[src];
    Object.keys(P.workouts).forEach(function (w) { P.workouts[w].items.forEach(function (it) { if (!out[it.ex]) out[it.ex] = it; }); });
    return out;
  }
  /* Що потрібно для вправи: гантелі, петля або нічого. */
  function needs(e) { if (e.type === 'band') return 'band'; if (e.type === 'db') return 'db'; if (e.type === 'time' && e.db) return 'db'; return null; }
  /* Чого уникаємо при обмеженнях (консервативно: краще замінити, ніж ризикнути). */
  var AVOID = {
    back: ['rdl', 'slrdl', 'shrug', 'farmer', 'pullover', 'crunch', 'crunchw', 'bentrow'],
    knees: ['splitsquat', 'slrdl'],
    shoulders: ['seatedpress', 'ohext', 'pullover', 'skull', 'lateral'],
    heart: ['farmer', 'suitcase', 'sideplank']
  };
  /* Варіант вправи з однієї з програм, що не годиться при обмеженні (жіноча тяга зверху — на колінах). */
  var AVOID_DEF = { knees: { her: ['pulldown'] } };
  /* Тренування на все тіло: місце в тренуванні → вправи за перевагою. */
  var FULL = {
    A: [['squat', ['goblet', 'splitsquat']], ['push', ['floorpress', 'pushup']], ['row', ['row1', 'bandrow']], ['vpull', ['pulldown', 'pullover']],
      ['press', ['seatedpress', 'facepull', 'reardelt']], ['glute', ['bridge', 'abduct']], ['core', ['deadbug', 'sideplank']], ['arms', ['curl', 'hammer']]],
    B: [['hinge', ['rdl', 'bridge', 'abduct']], ['single', ['splitsquat', 'calf']], ['row', ['row1', 'bandrow']], ['side', ['lateral', 'extrot', 'facepull']],
      ['rear', ['facepull', 'reardelt', 'extrot']], ['chest', ['floorfly', 'pushup']], ['tri', ['ohext', 'closegrip']], ['core', ['pallof', 'sideplank', 'deadbug']]]
  };
  var PAIRS = { A: [['push', 'row'], ['press', 'vpull'], ['glute', 'arms']], B: [['side', 'rear'], ['chest', 'tri'], ['single', 'core']] };

  function build(a) {
    var sex = a.sex === 'f' ? 'f' : 'm', src = sex === 'f' ? 'her' : 'him', alt = sex === 'f' ? 'him' : 'her';
    var has = { db: (a.equip || []).indexOf('db') >= 0, band: (a.equip || []).indexOf('band') >= 0 };
    var lim = (a.limits || []).filter(function (x) { return x !== 'none'; });
    var avoid = {}; lim.forEach(function (l) { (AVOID[l] || []).forEach(function (id) { avoid[id] = true; }); });
    var age = Number(a.age), older = age >= 55, novice = a.level !== 'exp', heart = lim.indexOf('heart') >= 0, back = lim.indexOf('back') >= 0;
    var perWeek = Math.min(4, Math.max(2, (a.days || []).length || 3));

    /* визначення вправ: своєї статі, інакше — з другої програми; лише ті, що можна з цим обладнанням і цими обмеженнями */
    var ex = {}, coachFrom = {}, T = {}, ts = templates(src), ta = templates(alt);
    var badDef = function (p, id) { return lim.some(function (l) { return ((AVOID_DEF[l] || {})[p] || []).indexOf(id) >= 0; }); };
    /* для мети «мʼязи» руки — повноцінні вправи: беремо варіант без позначки «за бажанням» */
    var mainArms = function (p, id) { return a.goal === 'muscle' && /за бажанням/.test(PROGRAMS[p].ex[id].name); };
    [alt, src].forEach(function (p) {
      Object.keys(PROGRAMS[p].ex).forEach(function (id) {
        var e = PROGRAMS[p].ex[id], n = needs(e);
        if (avoid[id] || (n && !has[n]) || badDef(p, id)) return;
        if (ex[id] && mainArms(p, id)) return;
        /* обережність «поперек: запас 2, без міо й дропів» — лише для тих, хто позначив спину */
        var e2 = (!back && e.spine) ? Object.assign({}, e, { spine: false }) : e;
        /* підказка без конкретного набору: «T15, кріплення вгорі…» → «Кріплення вгорі…», «гриф + 20» → ваш набір */
        var tip = (e2.tip || '').replace(/^T15, (.)/, function (m, c) { return c.toUpperCase(); })
          .replace('Коли «гриф + 20» біля грудей × 15 даються легко', 'Коли найважча гантель з вашого набору біля грудей × 15 дається легко');
        if (tip !== (e2.tip || '')) e2 = Object.assign({}, e2, { tip: tip });
        ex[id] = e2; coachFrom[id] = p;
      });
    });
    Object.keys(ex).forEach(function (id) { T[id] = coachFrom[id] === src ? (ts[id] || ta[id]) : (ta[id] || ts[id]); });

    /* тренування: на кожне місце — перша доступна вправа, без повторів у межах тренування */
    var workouts = {}, slotEx = {};
    ['A', 'B'].forEach(function (w) {
      var used = {}, items = []; slotEx[w] = {};
      FULL[w].forEach(function (slot) {
        var pick = slot[1].filter(function (id) { return ex[id] && T[id] && !used[id]; })[0];
        if (!pick) return;
        used[pick] = true; slotEx[w][slot[0]] = pick;
        var t = T[pick], it = { ex: pick, sets: t.sets, min: t.min, max: t.max, rest: t.rest };
        if (older || heart) it.sets = Math.min(it.sets, 3);
        if ((slot[0] === 'arms' && a.goal !== 'muscle') || (perWeek >= 4 && (slot[0] === 'arms' || slot[0] === 'tri'))) it.optional = true;
        if (/за бажанням/.test(ex[pick].name)) it.optional = true;  // назва вже каже «за бажанням» — так і показуємо
        items.push(it);
      });
      workouts[w] = { title: PROGRAMS.him.workouts[w].title, items: items };
    });
    /* досвідченим із гантелями й петлею, 3 дні, без обмежень — з тижня 5 спліт Д1–Д3 (як у програмі з гантелями) */
    var split = !novice && perWeek === 3 && has.db && has.band && !lim.length && (a.goal === 'muscle' || a.goal === 'loss') && !older;
    if (split) ['D1', 'D2', 'D3'].forEach(function (w) {
      var Pw = PROGRAMS.him.workouts[w];
      workouts[w] = { title: Pw.title, items: Pw.items.filter(function (it) { return ex[it.ex]; }).map(function (it) {
        var o = Object.assign({}, it), t = T[it.ex];
        /* «скільки зможете» (0–0) лише для вправ такого типу; інакше — повторення з шаблону цієї вправи */
        if (!o.max && ex[it.ex].type !== 'amrap' && t) { o.min = t.min; o.max = t.max; }
        return o;
      }) };
    });

    var goalTxt = GOALS[a.goal] || '';
    var dayTxt = (a.days || []).slice().sort(function (x, y) { return ((x + 6) % 7) - ((y + 6) % 7); }).map(function (d) { return (DAYS.filter(function (x) { return x[0] === d; })[0] || [0, ''])[1].toLowerCase(); }).join(' / ');
    var rirHard = heart ? 'запас 3' : (back ? 'запас 2' : 'запас 1–2');
    var prog = {
      id: 'me', custom: true, ver: VER, title: 'Моя програма', sub: goalTxt + ' · ' + dayTxt, backCare: back,
      cap: has.db ? 20 : 0, ex: ex, workouts: workouts, coachFrom: coachFrom, perWeek: perWeek, deload: [8, 12],
      days: (a.days || []).slice(), sex: sex, askReady: back,
      ready: { swap: back ? { rdl: 'bridge' } : {} },
      myoFrom: (heart || older) ? 0 : 5,
      tests: older || a.goal === 'posture',
      warm: has.db ? PROGRAMS.him.warm : PROGRAMS.her.warm, heavy: Number(a.weight) >= 100,
      week: function (wk) {
        if (split && wk >= 5) return ['D1', 'D2', 'D3'];
        if (perWeek === 2) return ['A', 'B'];
        if (perWeek === 4) return ['A', 'B', 'A', 'B'];
        return wk % 2 ? ['A', 'B', 'A'] : ['B', 'A', 'B'];
      },
      setsFor: function (item, wk) {
        if (this.deload.indexOf(wk) >= 0) return Math.ceil(item.sets / 2);
        if (novice && wk <= 2) return Math.min(item.sets, 2);
        return item.sets;
      },
      supersets: function (wk, wid) {
        if (novice && wk <= 2) return [];
        if (wid === 'D1' || wid === 'D2' || wid === 'D3') return PROGRAMS.him.supersets(wk, wid).filter(function (p) { return ex[p[0]] && ex[p[1]]; });
        return (PAIRS[wid] || []).map(function (p) { return [slotEx[wid][p[0]], slotEx[wid][p[1]]]; }).filter(function (p) { return p[0] && p[1]; });
      },
      note: function (wk) {
        var ss = ' Суперсети: дві вправи поспіль, відпочинок — після пари.';
        if (wk <= 2) return { phase: 'Фаза 1 · техніка', rir: 'запас 3', text: 'Опускання 2–3 с, підйом 1–2 с, без ривків. Вагу підбирайте так, щоб останні повторення давались із запасом.' };
        if (wk <= 4) return { phase: 'Фаза 1 · техніка', rir: heart ? 'запас 3' : 'запас 2', text: 'Спершу більше повторень, потім вага.' + ss };
        if (wk === 8) return { phase: 'Легкий тиждень', rir: 'запас 3–4', text: 'Підходів удвічі менше, вага та сама або на крок нижча. Без міо-підходів.' };
        if (wk === 12) return { phase: 'Легкий тиждень і заміри', rir: 'запас 3–4', text: 'Підходів удвічі менше. Заміри: вага, талія, фото — розділ «Тіло».' };
        if (wk <= 7) return { phase: 'Фаза 2 · обʼєм', rir: heart ? 'запас 3' : 'запас 2', text: (this.myoFrom ? 'Нове — міо-підходи в останньому підході ізоляції. ' : '') + 'Не затримуйте дихання: видих на зусиллі.' + ss };
        return { phase: 'Фаза 3 · інтенсивність', rir: rirHard, text: 'Опускання 3–4 с, пауза внизу. Техніка важливіша за вагу.' + ss };
      },
      /* осанка щодня: без еспандера — без розведення петлі (решта вправ — без обладнання) */
      daily: [].concat(back ? [PROGRAMS.him.daily[0]] : [], a.goal === 'posture' ? [has.band ? PROGRAMS.her.daily[0] : Object.assign({}, PROGRAMS.her.daily[0], { label: 'Осанка 5 хв (підборіддя, ангел, розтяжки)' })] : [], [{ id: 'walk', label: 'Ходьба 30–45 хв або 7–10 тис. кроків' }]),
      posture: PROGRAMS.her.posture.filter(function (r) { return has.band || !/петл/i.test(r[0] + r[2]); }),
      testsHow: PROGRAMS.her.testsHow,
      food: food(a),
      guide: guides(has, back, a.goal, sex, ex, !(heart || older), workouts)
    };
    return prog;
  }

  function food(a) {
    var base = { water: a.sex === 'f' ? '2–2,5 л' : '2,5–3 л', notes: PROGRAMS.him.food.notes.slice(0, 1).concat(['Білок — мʼясо, риба, яйця, сир, бобові; по порції в кожному прийомі їжі.', 'Сон — 7–9 годин.']) };
    if (a.goal === 'loss') return Object.assign(base, { goal: 'loss', deficit: 0.2, protein: [1.6, 2], basis: 'target' });
    if (a.goal === 'muscle') return Object.assign(base, { goal: 'gain', deficit: -0.1, protein: [1.6, 2.2], basis: 'current' });
    return Object.assign(base, { goal: 'maintain', deficit: 0, protein: [1.4, 1.8], basis: 'current' });
  }
  /* Тексти з базових програм — без прив'язки до конкретного набору (еспандер T15, гантелі «гриф + 20») і до родини.
     Ключ — точний текст пункту; null — пункт прибрати. */
  var NEUTRAL = {
    'Диски й T15': 'Диски й еспандер',
    'Налаштування T15': 'Налаштування еспандера',
    '#Еспандер T15 (спільний з дружиною)': '#Еспандер',
    '5 джгутів по 160 см (разом до 45 кг), 2 ручки, кріплення для дверей. У вашій програмі — тяга зверху сидячи (кріплення вгорі), тяга до обличчя й паллоф-жим (на рівні плечей), тяга до пояса сидячи (на рівні ліктя).':
      'Потрібні: кілька джгутів різного опору, 2 ручки й кріплення для дверей.',
    'Опір кольорів виробник не вказує — розкладіть джгути від легкого до важкого. «Рівень» у журналі — сума номерів джгутів (1 — найлегший … 5 — найважчий).':
      'Розкладіть джгути від легкого до важкого й пронумеруйте: 1 — найлегший. «Рівень» у журналі — номер джгута (сума, якщо кілька разом).',
    'Розтягніть кожен із 5 джгутів і розкладіть від найлегшого до найважчого: це рівні 1–5. «Рівень» у журналі — номер джгута (сума, якщо два разом).':
      'Розтягніть кожен джгут і розкладіть від найлегшого до найважчого: це рівні 1, 2, 3 і далі. «Рівень» у журналі — номер джгута (сума, якщо кілька разом).',
    'Алергія на латекс — еспандери T15 і петля латексні; з алергією не використовувати.':
      'Алергія на латекс — перевірте матеріал еспандера й петлі: латексні з алергією не використовувати.',
    /* розділ про гантелі в налаштуванні еспандера: без гантелей він зайвий, з гантелями — повтор розділу «Диски» */
    '#Гантелі спільні з чоловіком': null,
    'Тренуйтеся в різний час: ваги дуже різні, спільне тренування перетвориться на перекручування дисків.': null,
    'Порядок дисків на грифі: 5 кг — до хвату, далі 2,5, зовні 1,25. Так більшість змін — один зовнішній диск.': null,
    /* безпека з програми з петлею — її беруть лише тим, у кого немає гантелей */
    'Крісло — міцне, без коліщат, спинкою до стіни. Гайки гантелей підтягуйте перед вправами, де гантель над обличчям.': 'Крісло — міцне, без коліщат, спинкою до стіни.',
    'Вага вже максимальна («гриф + 20») і легко: повільний темп 4 с, пауза внизу, +1 підхід, одна нога чи рука, до 20–25 повторень на ногах.':
      'Усі ваші диски вже на грифі, а вага легка: повільний темп 4 с, пауза внизу, +1 підхід, одна нога чи рука, до 20–25 повторень на ногах.',
    'Спершу повторення. Коли в усіх підходах вийшла верхня межа із запасом 1–2 — наступного разу +2,5 кг на гантель.':
      'Спершу повторення. Коли в усіх підходах вийшла верхня межа із запасом 1–2 — наступного разу вага на крок більша. Крок залежить від найменших дисків, яких у вас хоча б 4: по 1,25 кг — крок 2,5 кг на гантель, по 2,5 кг — 5 кг, лише по 5 кг — 10 кг.',
    /* «Як росте навантаження» з програми з петлею — її беруть лише тим, у кого немає гантелей */
    'Спершу повторення: коли в усіх підходах вийшла верхня межа із запасом 1–2 — наступного разу важче: +2,5 кг на гантель, крок від дверей або наступний колір еспандера.':
      'Спершу повторення: коли в усіх підходах вийшла верхня межа із запасом 1–2 — наступного разу важче: крок від дверей або наступний колір еспандера.',
    'Великі мʼязи — можна +5 кг: у присіданнях, румунській тязі й тязі однією рукою, якщо в усіх підходах вийшло на 2+ повторення понад верхню межу.':
      'Великі мʼязи — можна на два кроки: у присіданнях і тягах, якщо в усіх підходах вийшло на 2+ повторення понад верхню межу.',
    'Вправи з однією гантеллю (тяга однією рукою, гоблет, розгинання з-за голови, пуловер, міст, скручування з вагою, носки): збирайте вагу на одному грифі, другий не чіпайте.':
      'Вправи з однією гантеллю (наприклад, тяга однією рукою чи гоблет): збирайте вагу на одному грифі, другий не чіпайте.'
  };
  var MEN = {
    'Були пологи — перед планками, стрибками й важкими присіданнями перевірте в лікаря чи фізіотерапевта розходження мʼязів живота й тазове дно.': null,
    'Вагітність або її планування, грижі чи протрузії, недавні травми — спершу порада лікаря.': 'Грижі чи протрузії, недавні травми — спершу порада лікаря.'
  };
  /* пункти безпеки про еспандер — лише тим, у кого він є */
  var BAND = ['Еспандер на дверях: кріплення — з боку дверних петель; тягніть у той бік, куди двері зачиняються, тоді тяга притискає їх до рами. Двері міцні, не скляні; замкніть або попередьте домашніх.',
    'Перед тренуванням огляньте джгути: тріщина — у смітник. Натягнутий еспандер не відпускайте. Еспандери латексні — при алергії на латекс не використовувати.',
    'Еспандер: верхня межа із запасом 1–2 — відсуньтеся далі від дверей або додайте джгут; повертайте повільніше (3 с).'];
  function neutral(t, sex, band) {
    if (!band && BAND.indexOf(t) >= 0) return null;
    if (sex === 'm' && Object.prototype.hasOwnProperty.call(MEN, t)) return MEN[t];
    return Object.prototype.hasOwnProperty.call(NEUTRAL, t) ? NEUTRAL[t] : t;
  }
  /* Спина в анкеті позначена: що саме застосунок робить у ЦІЙ програмі (за правилами engine.readyAction і AVOID.back) */
  function backGuide(ex, workouts) {
    var src = PROGRAMS.him.guide.filter(function (g) { return g.id === 'back'; })[0].items, used = {};
    /* лише вправи з тренувань (не запасні для заміни) */
    Object.keys(workouts).forEach(function (w) { workouts[w].items.forEach(function (it) { used[it.ex] = 1; }); });
    var spine = Object.keys(used).filter(function (id) { return ex[id] && ex[id].spine; }).map(function (id) { return ex[id].name.toLowerCase(); });
    return { id: 'back', title: 'Спина й грижі', items: [
      '#Як це працює в застосунку',
      'Перед кожним тренуванням — одне питання: як спина. Зелений — тренування за планом. Жовтий (ниє) — вправи з навантаженням на поперек на крок легше, запас 3. Червоний (болить або віддає в ногу) — ці вправи сьогодні пропускаються.'
    ].concat(spine.length ? ['Вправи з навантаженням на поперек у вашій програмі: ' + spine.join(', ') + '. У них завжди запас 2 — без відмови, міо- і дроп-сетів. Причина: з утомою поперек згинається сильніше, і навантаження на нього зростає.'] : [])
      .concat(['Вправи, що найбільше навантажують поперек чи згинають хребет під вагою (румунська тяга, шраги, фермерська прогулянка, тяга в нахилі, пуловер, скручування), у програму не входять.'])
      .concat(src.slice(src.indexOf('#Правило болю'))) };
  }
  function guides(has, back, goal, sex, ex, myo, workouts) {
    /* пункти про грижі й питання про спину — лише тим, хто позначив спину */
    var clean = function (g) {
      if (!g) return g;
      var items = g.items.map(function (x) { return neutral(x, sex, has.band); }).filter(function (x) { return x !== null && (back || !/гриж|питання про самопочуття|спитає про самопочуття/i.test(x)) && (myo || !/^Міо-підхід/.test(x)); });
      /* без еспандера — розділ про диски без частини про еспандер */
      if (g.id === 'gear' && !has.band && items.indexOf('#Еспандер') >= 0) return { id: g.id, title: 'Диски', items: items.slice(0, items.indexOf('#Еспандер')) };
      return { id: g.id, title: neutral(g.title, sex), items: items };
    };
    var pick = function (p, id) { return clean(PROGRAMS[p].guide.filter(function (g) { return g.id === id; })[0]); };
    var out = [];
    out.push(pick(has.db ? 'him' : 'her', 'safety'));
    /* розминка — та, що відповідає розминковому підходу програми (з гантелями 1 × 12, з петлею 1 × 10) */
    out.push(pick(has.db ? 'him' : 'her', 'warm'));
    if (back) out.push(backGuide(ex, workouts));
    if (has.db) out.push(pick('him', 'gear'));
    if (has.band) { var g = pick('her', 'gear'); if (g && !has.db) out.push(g); else if (g) out.push({ id: 'gear2', title: g.title, items: g.items }); }
    if (goal === 'posture') out.push(pick('her', 'posture'));
    out.push(pick(has.db ? 'him' : 'her', 'prog'));
    return out.filter(Boolean);
  }

  return { VER: VER, GOALS: GOALS, EQUIP: EQUIP, LIMITS: LIMITS, DAYS: DAYS, check: check, build: build, needs: needs, AVOID: AVOID };
})();
if (typeof module !== 'undefined') module.exports = GEN;
