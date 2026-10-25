/* Індивідуальна програма за анкетою.
   Вправи, підходи, повторення й відпочинок — з двох перевірених програм (усі ці фрази вже озвучено записаним голосом);
   добір — за обладнанням, обмеженнями, метою, досвідом, віком і днями. Відповіді анкети зберігаються в акаунті,
   програма щоразу відтворюється з них однаково (VER — версія правил добору). */
var GEN = (function () {
  var VER = 1;

  /* ---------- анкета: усі поля обовʼязкові ---------- */
  var GOALS = { loss: 'Схуднути', muscle: 'Набрати мʼязи', health: 'Сила й здоровʼя', posture: 'Сильна спина й осанка' };  // до 3.27.0 — «Спина й осанка» (слово Alexа 25.10: «змінюй на „Сильна спина й осанка“»)
  /* кілька цілей (з 3.19.0, слово Alexа 23.10: «потрібно надавати обрати декілька варіантів … тільки те що логічне»):
     «Схуднути» й «Набрати мʼязи» — разом (рекомпозиція: менше жиру й більше мʼязів); «Сильна спина й осанка» — з будь-якою;
     «Сила й здоровʼя» — без перших двох: її калорії підтримки й обʼєм 6–12 підходів суперечать дефіциту, надлишку й обʼєму 10–20.
     Несумісна мета в анкеті — неактивна кнопка (слово Alexа 23.10). */
  var GOAL_CLASH = { loss: ['health'], muscle: ['health'], health: ['loss', 'muscle'], posture: [] };
  /* цілі анкети — у сталому порядку GOALS; анкети до 3.19.0 мали одну мету в полі goal */
  function goalsOf(a) {
    a = a || {};
    var g = Array.isArray(a.goals) ? a.goals : (a.goal ? [a.goal] : []);
    return Object.keys(GOALS).filter(function (k) { return g.indexOf(k) >= 0; });
  }
  /* назва цілей: перша — з великої, решта — з малої, через кому («Схуднути, набрати мʼязи») */
  function goalText(a) {
    return goalsOf(a).map(function (g, i) { var t = GOALS[g]; return i ? t.charAt(0).toLowerCase() + t.slice(1) : t; }).join(', ');
  }
  var EQUIP = { db: 'Гантелі з дисками', band: 'Петля-еспандер (резинка з кріпленням до дверей)' };
  /* Тренажери вдома — те саме обладнання, що в залі: ті самі вправи, тож історія й рекорди спільні з залом (вагу застосунок
     підказує з разів на тому самому місці — app.js, histAt).
     Ключ — обладнання так, як його купують; значення — [назва, підпис, вправи залу на ньому]. Додати чи прибрати можна будь-коли:
     програма перебудовується, вправи, що вибули, лишаються в історії. */
  var MACH = {
    cable: ['Блок (верхній і нижній)', 'тяги зверху й знизу, руки, тяга каната, паллоф', ['g_latpull', 'g_cablerow', 'g_pushdown', 'g_cablecurl', 'g_facepull', 'g_cablelat', 'g_pallof']],
    legpress: ['Жим ногами', '', ['g_legpress']],
    legcurl: ['Згинання й розгинання ніг', 'один тренажер або два', ['g_legcurl', 'g_legext']],
    chestpress: ['Жим від грудей', '', ['g_chestpress']],
    shpress: ['Жим угору сидячи', '', ['g_shpress']],
    pecdeck: ['Зведення рук (пек-дек)', 'і зворотні розведення', ['g_pecdeck', 'g_revfly']],
    abduct: ['Розведення ніг', '', ['g_abduct']],
    machrow: ['Тяга з упором у груди', '', ['g_machrow']],
    bicep: ['Тренажер для біцепса', '', ['g_machcurl']],
    tricep: ['Тренажер для трицепса', '', ['g_triext']]
  };
  /* без чого вдома немає тяг зверху й знизу (спини): гантелі, петля або блок. Тяга з упором у груди — лише тяга знизу:
     сама по собі (навіть з іншими тренажерами) дає тренування з 3–4 вправ — перевірено на всіх наборах */
  var PULL = ['db', 'band', 'cable'];
  /* Де тренуються: удома (гантелі, петля), у залі (тренажери й блоки) або і там, і там — тоді перед тренуванням застосунок питає «Де сьогодні?» */
  var PLACES = { home: 'Вдома', gym: 'У тренажерному залі', both: 'І вдома, і в залі' };
  /* Здоровʼя — лише те, що справді змінює програму: кожен пункт прибирає або полегшує певні вправи */
  var LIMITS = { back: 'Грижа або біль у спині', knees: 'Коліна: біль або травма', shoulders: 'Плечі: біль або травма', heart: 'Тиск або серце', pregnant: 'Вагітність', none: 'Нічого з цього' };
  var DAYS = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Нд']];

  /* Перевірка відповідей: { ok, errors: {поле: текст}, block: текст — коли програму скласти не можна } */
  /* найбільше днів (з 3.27.0): 55+ і тиск / серце — 4, решта — 6 (рішення Claude 25.10 за дорученням Alexа: «приймай сам рішення як експерт»).
     Чому: у них стеля 3 підходи на вправу, а «верх / низ» збирає в одне тренування вправу, що в А і Б стоїть двічі, — обсяг падає (замір на всіх анкетах:
     5 днів — до −17 % проти плану на 3 дні, 6 днів — до −25 % проти 4 днів); а поради для людей із серцем (AHA 2023, Circulation) стоять на дослідженнях
     з 2–3 силовими тренуваннями на тиждень — про 5–6 даних немає. Тож тут — як було до 3.27.0: від 2 до 4 */
  function maxDays(a) { a = a || {}; return Number(a.age) >= 55 || (a.limits || []).indexOf('heart') >= 0 ? 4 : 6; }
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
    var gs = goalsOf(a);
    if (!gs.length) e.goal = 'Оберіть мету';
    else if (gs.some(function (g) { return GOAL_CLASH[g].some(function (x) { return gs.indexOf(x) >= 0; }); })) e.goal = '«Сила й здоровʼя» не поєднується зі схудненням і набором мʼязів';
    if (a.level !== 'new' && a.level !== 'exp') e.level = 'Оберіть досвід';
    if (!PLACES[a.place]) e.place = 'Оберіть, де тренуєтесь';
    var eq = a.equip || [];
    if (a.place !== 'gym' && !eq.some(function (x) { return PULL.indexOf(x) >= 0; })) e.equip = 'Для тяг (спина) потрібні гантелі, петля або блок';
    var lim = a.limits || [];
    if (a.sex === 'm') lim = lim.filter(function (x) { return x !== 'pregnant'; });
    if (!lim.length) e.limits = 'Позначте, що у вас є, або «Нічого з цього»';
    var d = a.days || [];
    if (d.length < 2 || d.length > maxDays(a)) e.days = maxDays(a) === 4 ? 'Для 55+ і з тиском чи серцем — від 2 до 4 днів' : 'Оберіть від 2 до 6 днів';  // 5–6 — «верх / низ» (з 3.27.0, Г-25)
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
  /* Тренування на все тіло: місце в тренуванні → вправи за перевагою.
     З 3.23.0 (сторож «кожна велика група мʼязів ≥ 2 дні на тиждень», ВООЗ 2020, ACSM 2026): у Б «одна нога» — після розщепленого присіду
     присідання до крісла (обмеження «коліна» прибирає розщеплений присід, і квадрицепс лишався лише в А); у залі — жим ногами
     (квадрицепс і сідниці, як розщеплений присід удома; з розгинанням ніг сідниці в Б не працювали) */
  var FULL = {
    A: [['squat', ['goblet', 'splitsquat']], ['push', ['floorpress', 'pushup']], ['row', ['row1', 'bandrow']], ['vpull', ['pulldown', 'pullover']],
      ['press', ['seatedpress', 'facepull', 'reardelt']], ['glute', ['bridge', 'abduct']], ['core', ['deadbug', 'sideplank']], ['arms', ['curl', 'hammer']]],
    B: [['hinge', ['rdl', 'bridge', 'abduct']], ['single', ['splitsquat', 'goblet', 'calf']], ['row', ['row1', 'bandrow']], ['side', ['lateral', 'extrot', 'facepull']],
      ['rear', ['facepull', 'reardelt', 'extrot']], ['chest', ['floorfly', 'pushup']], ['tri', ['ohext', 'closegrip']], ['core', ['pallof', 'sideplank', 'deadbug']]]
  };
  var PAIRS = { A: [['push', 'row'], ['press', 'vpull'], ['glute', 'arms']], B: [['side', 'rear'], ['chest', 'tri'], ['single', 'core']],
    /* «верх / низ» (з 3.27.0): ті самі пари протилежних мʼязів, що в А / Б; прес — два різні місця (з А і з Б) */
    U: [['push', 'row'], ['press', 'vpull'], ['chest', 'tri'], ['side', 'rear']], L: [['glute', 'coreA'], ['single', 'coreB']] };

  /* ---------- тренажерний зал ---------- */
  /* Ті самі місця в тренуванні, що й удома; на кожне — тренажер чи блок для того самого руху й тих самих мʼязів.
     Тип mach: вага — кг на тренажері чи блоці (без грифа й дисків), крок step, межа cap. Шаблон (підходи, повторення,
     відпочинок) — від домашньої вправи того самого місця в затвердженій програмі. start — стартова підказка для чоловіків
     (для жінок — 60 %, униз до кроку): точну вагу людина підбирає сама за підказкою «Перший раз». */
  var G = function (o) { return Object.assign({ type: 'mach', gym: true, step: 5, cap: 300 }, o); };
  var GYM = {
    ex: {
      g_legpress: G({ name: 'Жим ногами в тренажері', group: 'legs', main: true, big: true, spine: true, start: 40,
        tip: 'Поперек і таз притиснуті до спинки. Опускайте платформу, доки таз не почне відриватися, і без замикання колін угорі.', m: { p: ['quads', 'glutes'], s: ['hams'] } }),
      g_chestpress: G({ name: 'Жим від грудей у тренажері', group: 'chest', main: true, start: 20,
        tip: 'Сидіння — так, щоб ручки були на рівні середини грудей. Лопатки зведені, жміть без замикання ліктів.', m: { p: ['chest'], s: ['triceps', 'delts'] } }),
      g_cablerow: G({ name: 'Тяга нижнього блока сидячи', group: 'back', main: true, big: true, start: 30,
        tip: 'Спина рівна, корпус майже вертикально. Тягніть руківʼя до живота, зводячи лопатки, без відхилення назад.', m: { p: ['lats'], s: ['biceps', 'reardelts'] } }),
      g_latpull: G({ name: 'Тяга верхнього блока до грудей', group: 'back', main: true, start: 30,
        tip: 'Хват трохи ширший за плечі. Тягніть до верху грудей, не за голову; лопатки — вниз і разом.', m: { p: ['lats'], s: ['biceps'] } }),
      g_shpress: G({ name: 'Жим угору в тренажері сидячи', group: 'shoulders', main: true, start: 15,
        tip: 'Спина притиснута до спинки, ручки на рівні плечей. Жміть угору без прогину в попереку.', m: { p: ['delts'], s: ['triceps'] } }),
      g_abduct: G({ name: 'Розведення ніг у тренажері', group: 'legs', iso: true, start: 25,
        tip: 'Спина на спинці. Розводьте ноги плавно, коротка пауза, повертайте повільно, не кидаючи вагу.', m: { p: ['glutes'], s: [] } }),
      g_legcurl: G({ name: 'Згинання ніг у тренажері', group: 'legs', iso: true, start: 20,
        tip: 'Валик — над пʼятами, коліна на рівні осі тренажера. Згинайте плавно, таз притиснутий.', m: { p: ['hams'], s: ['calves'] } }),
      g_legext: G({ name: 'Розгинання ніг у тренажері', group: 'legs', iso: true, start: 20,
        tip: 'Валик — над щиколотками, коліна на рівні осі тренажера. Розгинайте плавно, без ривка, і повільно опускайте.', m: { p: ['quads'], s: [] } }),
      g_cablelat: G({ name: 'Відведення руки в сторону на блоці', group: 'shoulders', iso: true, side: true, step: 2.5, start: 2.5,
        tip: 'Нижній блок, стати боком. Ведіть руку в сторону до рівня плеча, лікоть трохи зігнутий, корпус нерухомий.', m: { p: ['delts'], s: [] } }),
      g_facepull: G({ name: 'Тяга каната до обличчя', group: 'shoulders', iso: true, step: 2.5, start: 10,
        tip: 'Блок на рівні обличчя, канат. Тягніть до лоба, розводячи лікті високо в сторони, пауза 1–2 с.', m: { p: ['reardelts'], s: ['traps'] } }),
      g_pecdeck: G({ name: 'Зведення рук у тренажері', group: 'chest', iso: true, start: 15,
        tip: 'Ручки на рівні грудей, лікті трохи зігнуті. Зводьте плавно, назад — лише до лінії плечей.', m: { p: ['chest'], s: ['delts'] } }),
      g_pushdown: G({ name: 'Розгинання рук на блоці', group: 'arms', iso: true, step: 2.5, start: 15,
        tip: 'Верхній блок. Лікті притиснуті до боків і нерухомі, розгинайте руки до кінця вниз.', m: { p: ['triceps'], s: [] } }),
      g_cablecurl: G({ name: 'Згинання рук на блоці', group: 'arms', step: 2.5, start: 10,
        tip: 'Нижній блок. Лікті біля боків, згинайте без розгойдування корпусу, опускайте повільно.', m: { p: ['biceps'], s: ['forearms'] } }),
      g_pallof: G({ name: 'Паллоф-жим на блоці', group: 'core', side: true, step: 2.5, start: 5,
        tip: 'Блок на рівні грудей, стати боком. Випряміть руки вперед і втримайте 2 с — корпус не повертається за тросом.', m: { p: ['obliques', 'abs'], s: [] } }),
      /* заміни, коли тренажер зайнятий («Ще» → «Замінити»): у шаблонах тренувань їх немає */
      g_machrow: G({ name: 'Тяга в тренажері з упором у груди', group: 'back', main: true, start: 30,
        tip: 'Груди на упорі, сидіння — так, щоб ручки були на рівні грудей. Тягніть лікті назад, зводячи лопатки, і повільно віддавайте.', m: { p: ['lats'], s: ['biceps', 'reardelts'] } }),
      g_machcurl: G({ name: 'Згинання рук у тренажері', group: 'arms', iso: true, start: 10,
        tip: 'Плечі на подушці, вісь тренажера — навпроти ліктів. Згинайте руки плавно й повільно опускайте до майже прямих рук.', m: { p: ['biceps'], s: ['forearms'] } }),
      g_triext: G({ name: 'Розгинання рук у тренажері', group: 'arms', iso: true, start: 15,
        tip: 'Лікті на подушці, вісь тренажера — навпроти ліктів. Розгинайте руки до кінця, коротка пауза, повільно повертайте.', m: { p: ['triceps'], s: [] } }),
      g_revfly: G({ name: 'Зворотні розведення в тренажері', group: 'shoulders', iso: true, start: 15,
        tip: 'Грудьми до спинки, ручки на рівні плечей. Розводьте руки назад до лінії плечей, пауза, повільно повертайте.', m: { p: ['reardelts'], s: ['traps'] } })
    },
    tpl: {
      g_legpress: [3, 12, 15, 90], g_chestpress: [3, 12, 15, 90], g_cablerow: [3, 12, 15, 90], g_latpull: [2, 12, 15, 90], g_shpress: [2, 12, 15, 90],
      g_abduct: [2, 12, 15, 60], g_legcurl: [3, 12, 15, 90], g_legext: [2, 10, 12, 60], g_cablelat: [2, 15, 20, 60], g_facepull: [2, 15, 15, 60],
      g_pecdeck: [2, 12, 15, 60], g_pushdown: [2, 12, 15, 60], g_cablecurl: [2, 12, 15, 60], g_pallof: [2, 10, 10, 60],
      g_machrow: [3, 12, 15, 90], g_machcurl: [2, 12, 15, 60], g_triext: [2, 12, 15, 60], g_revfly: [2, 15, 15, 60]
    }
  };
  /* Місця тренування в залі: тренажери першими, далі вправи з власною вагою */
  var GFULL = {
    A: [['squat', ['g_legpress']], ['push', ['g_chestpress', 'pushup']], ['row', ['g_cablerow']], ['vpull', ['g_latpull']],
      ['press', ['g_shpress', 'g_facepull']], ['glute', ['g_abduct']], ['core', ['deadbug', 'sideplank']], ['arms', ['g_cablecurl']]],
    B: [['hinge', ['g_legcurl']], ['single', ['g_legpress', 'g_legext', 'splitsquat', 'calf']], ['row', ['g_cablerow']], ['side', ['g_cablelat', 'g_facepull']],
      ['rear', ['g_facepull', 'g_cablelat']], ['chest', ['g_pecdeck', 'pushup']], ['tri', ['g_pushdown']], ['core', ['g_pallof', 'sideplank', 'deadbug']]]
  };
  /* Вдома з тренажерами: на кожне місце — спершу тренажер того самого руху (як у залі; є вдома — вдома як у залі),
     далі затверджені домашні вправи (FULL), далі запасні вправи залу. Без тренажерів удома — рівно FULL, як і раніше. */
  var HM = {
    A: { squat: ['g_legpress'], push: ['g_chestpress'], row: ['g_cablerow', 'g_machrow'], vpull: ['g_latpull'], press: ['g_shpress'], glute: ['g_abduct'], arms: ['g_cablecurl', 'g_machcurl'] },
    B: { hinge: ['g_legcurl'], single: ['g_legpress', 'g_legext'], row: ['g_cablerow', 'g_machrow'], side: ['g_cablelat'], rear: ['g_facepull'], chest: ['g_pecdeck'], tri: ['g_pushdown', 'g_triext'], core: ['g_pallof'] }
  };
  var HFULL = {};
  ['A', 'B'].forEach(function (w) {
    HFULL[w] = FULL[w].map(function (slot) {
      var g = (GFULL[w].filter(function (x) { return x[0] === slot[0]; })[0] || [0, []])[1], list = [].concat(HM[w][slot[0]] || [], slot[1], g);
      return [slot[0], list.filter(function (id, i) { return list.indexOf(id) === i; })];
    });
  });
  /* Обмеження для тренажерів — як для домашніх вправ того самого руху */
  var GAVOID = { back: [], knees: ['g_legext'], shoulders: ['g_shpress', 'g_pecdeck', 'g_cablelat'], heart: [] };

  function build(a) {
    var sex = a.sex === 'f' ? 'f' : 'm', src = sex === 'f' ? 'her' : 'him', alt = sex === 'f' ? 'him' : 'her';
    var goals = goalsOf(a), hasG = function (g) { return goals.indexOf(g) >= 0; };  // кілька цілей (з 3.19.0)
    /* старі анкети (до 3.9) місця не мали — це вдома */
    var place = PLACES[a.place] ? a.place : 'home', home = place !== 'gym';
    var has = { db: home && (a.equip || []).indexOf('db') >= 0, band: home && (a.equip || []).indexOf('band') >= 0, gym: place !== 'home' };
    /* тренажери вдома: вправи залу на обладнанні, яке є вдома */
    var homeMach = {}; if (home) Object.keys(MACH).forEach(function (k) { if ((a.equip || []).indexOf(k) >= 0) MACH[k][2].forEach(function (id) { homeMach[id] = true; }); });
    has.mach = Object.keys(homeMach).length > 0;
    var lim = (a.limits || []).filter(function (x) { return x !== 'none'; });
    var avoid = {}; lim.forEach(function (l) { (AVOID[l] || []).concat(GAVOID[l] || []).forEach(function (id) { avoid[id] = true; }); });
    var age = Number(a.age), older = age >= 55, novice = a.level !== 'exp', heart = lim.indexOf('heart') >= 0, back = lim.indexOf('back') >= 0;
    /* коротка розминка (3 хв) — лише без обмежень, до 55 і до 100 кг: тіло розігріває перший легкий підхід вправи;
       з тиском чи серцем, спиною, суглобами, від 55 або від 100 кг — повна, 10 хв (поступово, як радить ACSM) */
    var shortWarm = !lim.length && !older && !(Number(a.weight) >= 100);
    var perWeek = Math.min(6, Math.max(2, (a.days || []).length || 3));  // 5–6 — «верх / низ» (з 3.27.0)

    /* визначення вправ: своєї статі, інакше — з другої програми; лише ті, що можна з цим обладнанням і цими обмеженнями */
    var ex = {}, coachFrom = {}, T = {}, ts = templates(src), ta = templates(alt);
    var badDef = function (p, id) { return lim.some(function (l) { return ((AVOID_DEF[l] || {})[p] || []).indexOf(id) >= 0; }); };
    /* для мети «мʼязи» руки — повноцінні вправи: беремо варіант без позначки «за бажанням» */
    var mainArms = function (p, id) { return hasG('muscle') && /за бажанням/.test(PROGRAMS[p].ex[id].name); };
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
    /* тренажери залу: стартова вага для жінок — 60 % (униз до кроку тренажера) */
    if (has.gym || has.mach) Object.keys(GYM.ex).forEach(function (id) {
      if (avoid[id] || (!has.gym && !homeMach[id])) return;
      var e = GYM.ex[id], st = sex === 'f' ? Math.max(e.step, Math.floor(e.start * 0.6 / e.step) * e.step) : e.start;
      ex[id] = (!back && e.spine) ? Object.assign({}, e, { spine: false, start: st }) : Object.assign({}, e, { start: st });
      coachFrom[id] = 'gym'; var t = GYM.tpl[id]; T[id] = { ex: id, sets: t[0], min: t[1], max: t[2], rest: t[3] };
    });

    /* тренування: на кожне місце — перша доступна вправа, без повторів у межах тренування */
    /* домашні вправи (dumbbell/band/власна вага) — лише вдома; тренажери — лише в залі */
    var homeOk = function (id) { return !ex[id].gym || !!homeMach[id]; }, gymOk = function (id) { var e = ex[id]; return !!e.gym || !needs(e); };
    var build1 = function (plan, ok, slots) {
      var out = {};
      ['A', 'B'].forEach(function (w) {
        var used = {}, items = []; slots[w] = {};
        plan[w].forEach(function (slot) {
          var pick = slot[1].filter(function (id) { return ex[id] && T[id] && !used[id] && ok(id); })[0];
          if (!pick) return;
          used[pick] = true; slots[w][slot[0]] = pick;
          var t = T[pick], it = { ex: pick, sets: t.sets, min: t.min, max: t.max, rest: t.rest };
          if (older || heart) it.sets = Math.min(it.sets, 3);
          if ((slot[0] === 'arms' && !hasG('muscle')) || (perWeek === 4 && (slot[0] === 'arms' || slot[0] === 'tri'))) it.optional = true;
          if (/за бажанням/.test(ex[pick].name)) it.optional = true;  // назва вже каже «за бажанням» — так і показуємо
          items.push(it);
        });
        out[w] = { title: PROGRAMS.him.workouts[w].title, items: items };
      });
      return out;
    };
    /* пункт 24 (з 3.23.0; слово Alexа 25.10 «Роби в такому порядку: А → Б → В → Г»): для мети «мʼязи» з тижня 5 — +1 підхід вправам, чий основний мʼяз
       за звичайний тиждень (3 дні — середнє А,Б,А і Б,А,Б; 2 дні — А+Б; 4 — 2А+2Б) отримує менше 10 «дробових» підходів (основний мʼяз — 1,
       допоміжний — 0,5): доза-відповідь — більше росту до 10+ підходів на тиждень (Schoenfeld, Ogborn, Krieger 2016), ACSM 2026 — ≈ 10+.
       Не для 55+ і тиску / серця (там підходів не більше 3) і не для вправ на поперек, коли позначено спину; лише +1 на вправу */
    var BIG = ['chest', 'lats', 'delts', 'quads', 'hams', 'glutes', 'biceps', 'triceps'];
    function markPlus(wos, kForce) {
      var ws = Object.keys(wos);
      if (!hasG('muscle') || older || heart || ws.length < 2) return;
      /* скільки разів на тиждень кожне тренування; kForce — 5–6 днів: +1 рахуємо як у плані на 4 дні (А / Б по 2 рази), далі «верх / низ» бере той самий обсяг */
      var k = kForce || (perWeek === 2 ? 1 : perWeek === 4 ? 2 : 1.5), f = {};
      ws.forEach(function (w) { wos[w].items.forEach(function (it) { var m = ex[it.ex].m || { p: [], s: [] };
        (m.p || []).forEach(function (x) { f[x] = (f[x] || 0) + it.sets * k; }); (m.s || []).forEach(function (x) { f[x] = (f[x] || 0) + it.sets * k * 0.5; }); }); });
      ws.forEach(function (w) { wos[w].items.forEach(function (it) { var e = ex[it.ex];
        if (back && e.spine) return;
        if (((e.m || {}).p || []).some(function (x) { return BIG.indexOf(x) >= 0 && (f[x] || 0) < 10; })) it.plus = 1; }); });
    }
    /* Г-25 (з 3.27.0; слово Alexа 25.10: «Роби Г-25 за уточненою рекомендацією: 5 і 6 днів «верх / низ» усім, обсяг не менший, ніж зараз, обмеження здоровʼя як зараз»):
       5–6 днів — «верх / низ» з тих самих місць і вправ, що й А / Б: кожне тренування «верху» — усі місця верху з А і Б, «низу» — усі місця низу,
       тож кожна велика група мʼязів є в кожному тренуванні своєї половини — 2–3 дні на тиждень, а тренування тієї самої половини поспіль не йдуть
       (щонайменше 48 год між тренуваннями тих самих мʼязів — ACSM 2011, Garber та ін.). Підходи на тренування — від тижневого обсягу плану на 4 дні
       (А, Б, А, Б: підходи вправи × 2 на кожне її місце), поділеного на тренування цієї половини за тиждень (6 днів — 3; 5 днів — 2,5: тижні чергуються
       3 / 2, обсяг — за 2 тижні, як і в плані на 3 дні), з округленням угору — обсяг не менший; 55+ і тиск / серце — не більше 3 підходів, як в А / Б.
       Частота за рівного обсягу не змінює росту мʼязів (ACSM 2026 — Currier та ін., MSSE 58(4):851–872; Schoenfeld 2019), сила трохи росте з частотою
       (Pelland та ін., Sports Med 2026). Нових вправ немає — техніка, 3D, голос і заміни ті самі */
    var UPPER = ['push', 'row', 'vpull', 'press', 'chest', 'side', 'rear', 'tri', 'arms'], LOWER = ['squat', 'hinge', 'single', 'glute', 'core'];
    /* підходи на тренування для трьох станів — звичайний тиждень (base), з +1 підходом для «мʼязи» з тижня 5 (plus; як у плані на 4 дні) і перші
       2 тижні новачка (nov — до 2 підходів, як в А / Б): ceil(тижневі ÷ тренувань половини); понад стелю (новачок — 2, 55+ і тиск / серце — 3, решта — 4,
       як найбільше в затвердженій програмі) — віддаємо іншій вправі цієї половини на той самий основний мʼяз (тяга → тяга зверху); немає такої — новачку,
       55+ і тиску / серцю стеля сувора (правило безпеки важливіше за обсяг), решті — лишаємо (обсяг не менший) */
    /* «дробовий» внесок вправи в мʼяз: основний — 1, допоміжний — 0,5 (як рахує сторож) */
    var share = function (id, mu) { var m = ex[id].m || {}; return (m.p || []).indexOf(mu) >= 0 ? 1 : (m.s || []).indexOf(mu) >= 0 ? 0.5 : 0; };
    var GROUPS = ['quads', 'hams', 'glutes', 'lats', 'chest', 'delts', 'biceps', 'triceps', 'abs', 'obliques'];
    var fitSets = function (rows, key, cap, strict, per) {
      var n = rows.map(function (r) { return Math.max(1, Math.ceil(r[key] / per - 1e-9)); });
      rows.forEach(function (r, i) {
        var main = ((ex[r.id].m || {}).p || [])[0];
        while (n[i] > cap) {
          /* суворо — будь-яка вправа з тим самим основним мʼязом; м'яко — лише та, що дає кожній групі не менше (тяга → тяга зверху), інакше обсяг упав би */
          var j = rows.map(function (q, k) { return k; }).filter(function (k) { return k !== i && n[k] < cap && share(rows[k].id, main) === 1 &&
              (strict || GROUPS.every(function (mu) { return share(rows[k].id, mu) >= share(r.id, mu); })); })
            .sort(function (x, y) { return n[x] - n[y]; })[0];
          if (j === undefined) { if (strict) n[i] = cap; else if (n[i] > cap + 1) n[i] = cap + 1; break; }  // м'яко — щонайбільше на 1 понад стелю (5 підходів)
          n[j]++; n[i]--;
        }
      });
      return n;
    };
    var toUL = function (wos, slots) {
      var per = perWeek / 2, out = {}, cap = (older || heart) ? 3 : 4;
      ['U', 'L'].forEach(function (w) {
        var rows = [], byId = {}, sl = {};
        (w === 'U' ? UPPER : LOWER).forEach(function (name) {
          ['A', 'B'].forEach(function (ab) {
            var id = (slots[ab] || {})[name], it = id && wos[ab] ? wos[ab].items.filter(function (x) { return x.ex === id; })[0] : null;
            if (!it) return;
            var key = name === 'core' ? 'core' + ab : name;
            if (!sl[key] && !Object.keys(sl).some(function (k) { return sl[k] === id; })) sl[key] = id;  // одна вправа — одне місце (і одна пара суперсету)
            var add = { base: it.sets * 2, plus: (it.sets + (it.plus ? 1 : 0)) * 2, nov: Math.min(it.sets, 2) * 2 };  // × 2 — так часто в плані на 4 дні
            if (byId[id]) { ['base', 'plus', 'nov'].forEach(function (k) { byId[id][k] += add[k]; }); return; }
            byId[id] = Object.assign({ id: id, it: it }, add); rows.push(byId[id]);
          });
        });
        slots[w] = sl;
        var nb = fitSets(rows, 'base', cap, older || heart, per), np = fitSets(rows, 'plus', cap, older || heart, per), nn = fitSets(rows, 'nov', 2, true, per);
        out[w] = { title: w === 'U' ? 'Верх тіла' : 'Низ тіла', items: rows.map(function (r, i) {
          var it = Object.assign({}, r.it, { sets: nb[i], nov: nn[i] });  // повторення, відпочинок і «за бажанням» — як в А / Б
          delete it.plus; if (np[i] > nb[i]) it.plus = np[i] - nb[i];
          return it;
        }) };
      });
      return out;
    };
    var slotEx = {}, slotGym = {};
    var workouts = home ? build1(HFULL, homeOk, slotEx) : {}, gymWorkouts = has.gym ? build1(GFULL, gymOk, slotGym) : null;
    /* 5–6 днів: спершу +1 підхід — як у плані на 4 дні (А / Б), тоді «верх / низ» з тим самим тижневим обсягом */
    if (perWeek >= 5) { if (home) { markPlus(workouts, 2); workouts = toUL(workouts, slotEx); } if (gymWorkouts) { markPlus(gymWorkouts, 2); gymWorkouts = toUL(gymWorkouts, slotGym); } }
    /* до 3.23.0 досвідченим із гантелями й петлею (3 дні, без обмежень) з тижня 5 був спліт Д1–Д3: ноги й руки — 1 день на тиждень.
       Знято (пункт 23; ВООЗ 2020, ACSM 2026 — кожна велика група мʼязів щонайменше 2 дні): усім — усе тіло А / Б, обʼєм для мети «мʼязи» — пункт 24 */
    else { markPlus(workouts); if (gymWorkouts) markPlus(gymWorkouts); }

    var goalTxt = goalText(a);
    var dayTxt = (a.days || []).slice().sort(function (x, y) { return ((x + 6) % 7) - ((y + 6) % 7); }).map(function (d) { return (DAYS.filter(function (x) { return x[0] === d; })[0] || [0, ''])[1].toLowerCase(); }).join(' / ');
    var rirHard = heart ? 'запас 3' : (back ? 'запас 2' : 'запас 1–2');
    var prog = {
      id: 'me', custom: true, ver: VER, title: 'Моя програма', sub: goalTxt + ' · ' + dayTxt + (place === 'gym' ? ' · зал' : place === 'both' ? ' · дім і зал' : ''), backCare: back,
      cap: has.db ? 20 : 0, ex: ex, coachFrom: coachFrom, perWeek: perWeek, deload: [8, 12],
      /* workouts — основне місце (удома, а без дому — зал); gymWorkouts — друге місце для «і вдома, і в залі» */
      workouts: home ? workouts : gymWorkouts, gymWorkouts: home && has.gym ? gymWorkouts : null, place: place, homeMach: homeMach,
      days: (a.days || []).slice(), sex: sex, askReady: back,
      ready: { swap: back ? { rdl: 'bridge' } : {} },
      myoFrom: (heart || older) ? 0 : 5,
      /* тести форми (тижні 1, 4, 8, 12 — приблизно раз на місяць): 55+ і «осанка» — повний набір; решті з 3.25.0 — віджимання (пункт 19, слово Alexа 25.10: «Роби в такому порядку: А → Б → В → Г»;
         1 104 активні чоловіки, 10 років: понад 40 віджимань за раз — на 96 % менше серцевих подій, ніж менше 10; звʼязок, не доказ причини — Yang 2019).
         Тиск / серце — без тестів «до відмови» (віджимання, бічна планка, валізна прогулянка: цих вправ і в тренуваннях немає) */
      tests: older || hasG('posture') ? ['chair', 'bal', 'sp', 'push', 'car'].filter(function (k) { return !heart || ['sp', 'push', 'car'].indexOf(k) < 0; }) : heart ? false : ['push'],
      gymWarm: has.gym ? (shortWarm ? GYM_WARM_SHORT : GYM_WARM).slice() : null,
      warm: (has.db || has.gym || has.mach) ? PROGRAMS.him.warm : PROGRAMS.her.warm, heavy: Number(a.weight) >= 100,
      week: function (wk) {
        /* «верх / низ» (з 3.27.0): по черзі, тож та сама половина двічі поспіль не йде; 5 днів — тижні чергуються (кінець тижня 12 — «низ», початок 5 — «верх») */
        if (perWeek === 6) return ['U', 'L', 'U', 'L', 'U', 'L'];
        if (perWeek === 5) return wk % 2 ? ['U', 'L', 'U', 'L', 'U'] : ['L', 'U', 'L', 'U', 'L'];
        if (perWeek === 2) return ['A', 'B'];
        if (perWeek === 4) return ['A', 'B', 'A', 'B'];
        return wk % 2 ? ['A', 'B', 'A'] : ['B', 'A', 'B'];
      },
      setsFor: function (item, wk) {
        if (this.deload.indexOf(wk) >= 0) return Math.ceil(item.sets / 2);
        if (novice && wk <= 2) return item.nov || Math.min(item.sets, 2);  // nov — «верх / низ» (з 3.27.0): уже з урахуванням двох місць вправи
        return item.sets + (item.plus && wk >= 5 ? item.plus : 0);  // з 3.23.0 — пункт 24: +1 підхід для мети «мʼязи» з фази 2 («верх / низ» — скільки треба, з 3.27.0)
      },
      /* where: 'gym' — тренування в залі (для «і вдома, і в залі»); без нього — основне місце */
      supersets: function (wk, wid, where) {
        if (novice && wk <= 2) return [];
        if (wid === 'D1' || wid === 'D2' || wid === 'D3') return PROGRAMS.him.supersets(wk, wid).filter(function (p) { return ex[p[0]] && ex[p[1]]; });  // чернетка Д1–Д3, почата до 3.23.0
        var sl = (where === 'gym' || !home) ? slotGym : slotEx;
        return (PAIRS[wid] || []).map(function (p) { return [(sl[wid] || {})[p[0]], (sl[wid] || {})[p[1]]]; }).filter(function (p) { return p[0] && p[1]; });
      },
      note: function (wk) {
        var ss = ' Суперсети: дві вправи поспіль, відпочинок — після пари.';
        if (wk <= 2) return { phase: 'Фаза 1 · техніка', rir: 'запас 3', text: 'Опускання 2–3 с, підйом 1–2 с, без ривків. Вагу підбирайте так, щоб останні повторення давались із запасом.' };
        if (wk <= 4) return { phase: 'Фаза 1 · техніка', rir: heart ? 'запас 3' : 'запас 2', text: 'Спершу більше повторень, потім вага.' + ss };
        if (wk === 8) return { phase: 'Легкий тиждень', rir: 'запас 3–4', text: 'Підходів удвічі менше, вага та сама або на крок нижча. Без міо-підходів.' };
        if (wk === 12) return { phase: 'Легкий тиждень і заміри', rir: 'запас 3–4', text: 'Підходів удвічі менше. Заміри: вага, талія, фото — розділ «Тіло».' };
        if (wk <= 7) return { phase: 'Фаза 2 · обʼєм', rir: heart ? 'запас 3' : 'запас 2', text: (this.myoFrom ? 'Нове — міо-підходи в останньому підході ізоляції. ' : '') + 'Не затримуйте дихання: видих на зусиллі.' + ss };
        return { phase: 'Фаза 3 · інтенсивність', rir: rirHard, text: 'Опускання 3–4 с, пауза внизу. Техніка важливіша за вагу.' + (this.myoFrom ? ' Дроп-сет за бажанням — у базових вправах (в ізоляції вже є міо-підхід): після останнього підходу «⋯ Ще» → «Дроп-сет»' + (back ? ', не для вправ на поперек' : '') + '.' : '') + ss };
      },
      /* осанка щодня: без еспандера — без розведення петлі (решта вправ — без обладнання) */
      daily: [].concat(back ? [PROGRAMS.him.daily[0]] : [], hasG('posture') ? [has.band ? PROGRAMS.her.daily[0] : Object.assign({}, PROGRAMS.her.daily[0], { label: 'Осанка 5 хв (підборіддя, ангел, розтяжки)' })] : [], [{ id: 'walk', label: 'Ходьба 30–45 хв або 7–10 тис. кроків' }]),
      posture: PROGRAMS.her.posture.filter(function (r) { return has.band || !/петл/i.test(r[0] + r[2]); }),
      testsHow: PROGRAMS.her.testsHow,
      food: food(a),
      guide: guides(has, back, hasG('posture'), sex, ex, !(heart || older), [workouts, gymWorkouts || {}], home, shortWarm)
    };
    return prog;
  }

  function food(a) {
    var base = { water: a.sex === 'f' ? '2–2,5 л' : '2,5–3 л', notes: PROGRAMS.him.food.notes.slice(0, 1).concat(['Білок — мʼясо, риба, яйця, сир, бобові; по порції в кожному прийомі їжі.', 'Сон — 7–9 годин.']) };
    var gs = goalsOf(a), loss = gs.indexOf('loss') >= 0, muscle = gs.indexOf('muscle') >= 0;
    /* схуднути й набрати мʼязи разом (рекомпозиція, з 3.19.0): дефіцит удвічі менший, ніж для схуднення, — великий дефіцит гальмує
       приріст мʼязів (метааналіз Murphy, Koehler, Scand J Med Sci Sports 2022); білок — як для набору (1,6–2,2 г/кг, Iraki та ін. 2019),
       від цільової ваги, як для схуднення; темп — до 0,5 % ваги на тиждень (нижня межа Helms та ін. 2014) — engine.foodAdvice */
    if (loss && muscle) return Object.assign(base, { goal: 'recomp', deficit: 0.1, protein: [1.6, 2.2], basis: 'target' });
    if (loss) return Object.assign(base, { goal: 'loss', deficit: 0.2, protein: [1.6, 2], basis: 'target' });
    if (muscle) return Object.assign(base, { goal: 'gain', deficit: -0.1, protein: [1.6, 2.2], basis: 'current' });
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
  /* Довідки для залу: розминка (озвучується), безпека, налаштування тренажерів, ріст навантаження */
  var GYM_WARM = ['#Розминка · 10 хв', 'Велотренажер або доріжка — 5 хв у легкому темпі.', 'Суглоби: кола плечима, ліктями, кистями, тазом, коліньми — по 10 разів.',
    'Перед першою базовою вправою — 1 підхід × 12 з половинною вагою: застосунок додає його сам. До інших вправ — «Ще» → «Розминковий підхід».',
    '#Заминка · 5 хв', '5 хв повільної ходьби та легка розтяжка грудей, задньої поверхні стегна, литок — по 20–30 с.'];
  /* Коротка розминка — без обмежень, до 55 і до 100 кг: суглоби й рух без ваги, далі тіло розігріває перший легкий підхід
     (його застосунок додає сам). Фрази — ті самі, що в повній розминці, нові лише заголовок і «2 хв» у залі. */
  var HOME_WARM_SHORT = ['#Розминка · 3 хв', 'Суглоби: кола плечима, ліктями, кистями, тазом, коліньми — по 10 разів.', '10 присідань до крісла без ваги + 10 нахилів «відвести таз назад» без ваги.',
    'Перед першою базовою вправою — 1 підхід × 12 з половинною вагою: застосунок додає його сам. До інших вправ — «Ще» → «Розминковий підхід».',
    '#Заминка · 5 хв', '5 хв повільної ходьби та легка розтяжка грудей, задньої поверхні стегна, литок — по 20–30 с.'];
  var GYM_WARM_SHORT = ['#Розминка · 3 хв', 'Велотренажер або доріжка — 2 хв у легкому темпі.', 'Суглоби: кола плечима, ліктями, кистями, тазом, коліньми — по 10 разів.',
    'Перед першою базовою вправою — 1 підхід × 12 з половинною вагою: застосунок додає його сам. До інших вправ — «Ще» → «Розминковий підхід».',
    '#Заминка · 5 хв', '5 хв повільної ходьби та легка розтяжка грудей, задньої поверхні стегна, литок — по 20–30 с.'];
  var GYM_SAFETY = ['Тренажер: перед підходом підлаштуйте сидіння й упори під свій зріст; фіксатор ваги — у блок до кінця.', 'Вагу не кидайте: опускайте плавно до кінця руху.'];
  var GYM_GEAR = ['#Налаштування', 'Сидіння, валики й упори — під свій зріст, перш ніж брати вагу. Вісь обертання тренажера — навпроти суглоба, що працює.',
    'Фіксатор ваги — у блок до кінця. Трос і ручка цілі — тоді працюйте.', '#Вага', 'Застосунок пропонує вагу кроком: на тренажерах — 5 кг, на блоках — 2,5 кг. Інший крок на вашому тренажері — вводьте свою вагу цифрами: застосунок підхопить крок цього тренажера з ваших ваг і далі пропонуватиме вагу на ньому. Удома й у залі вага рахується окремо: це різні тренажери.',
    '#Тренажер зайнятий чи його немає', '«⋯ Ще» → «Замінити»: застосунок запропонує іншу вправу на ті самі мʼязи з того, що є під рукою.'];
  var GYM_PROG = {
    /* ключі — тексти після neutral(): pick() уже прибрав «+2,5 кг на гантель» і «гриф + 20» на нейтральні */
    'Спершу повторення. Коли в усіх підходах вийшла верхня межа із запасом 1–2 — наступного разу вага на крок більша. Крок залежить від найменших дисків, яких у вас хоча б 4: по 1,25 кг — крок 2,5 кг на гантель, по 2,5 кг — 5 кг, лише по 5 кг — 10 кг.':
      'Спершу повторення. Коли в усіх підходах вийшла верхня межа із запасом 1–2 — наступного разу вага на один крок тренажера більша.',
    'Великі мʼязи — можна на два кроки: у присіданнях і тягах, якщо в усіх підходах вийшло на 2+ повторення понад верхню межу.':
      'Великі мʼязи — можна на два кроки: у жимі ногами й тязі нижнього блока, якщо в усіх підходах вийшло на 2+ повторення понад верхню межу.',
    'Усі ваші диски вже на грифі, а вага легка: повільний темп 4 с, пауза внизу, +1 підхід, одна нога чи рука, до 20–25 повторень на ногах.': null,
    'Еспандер: верхня межа із запасом 1–2 — відсуньтеся далі від дверей або додайте джгут; повертайте повільніше (3 с).': null
  };
  function backGuide(ex, lists) {
    var src = PROGRAMS.him.guide.filter(function (g) { return g.id === 'back'; })[0].items, used = {};
    /* лише вправи з тренувань (не запасні для заміни) — удома й у залі */
    lists.forEach(function (workouts) { Object.keys(workouts).forEach(function (w) { workouts[w].items.forEach(function (it) { used[it.ex] = 1; }); }); });
    var spine = Object.keys(used).filter(function (id) { return ex[id] && ex[id].spine; }).map(function (id) { return ex[id].name.toLowerCase(); });
    return { id: 'back', title: 'Спина й грижі', items: [
      '#Як це працює в застосунку',
      'Перед кожним тренуванням — одне питання: як спина. Зелений — тренування за планом. Жовтий (ниє) — вправи з навантаженням на поперек на крок легше, запас 3. Червоний (болить або віддає в ногу) — ці вправи сьогодні пропускаються.'
    ].concat(spine.length ? ['Вправи з навантаженням на поперек у вашій програмі: ' + spine.join(', ') + '. У них завжди запас 2 — без відмови, міо- і дроп-сетів. Причина: з утомою поперек згинається сильніше, і навантаження на нього зростає.'] : [])
      .concat(['Вправи, що найбільше навантажують поперек чи згинають хребет під вагою (румунська тяга, шраги, фермерська прогулянка, тяга в нахилі, пуловер, скручування), у програму не входять.'])
      .concat(src.slice(src.indexOf('#Правило болю'))) };
  }
  function guides(has, back, posture, sex, ex, myo, lists, home, shortWarm) {
    /* пункти про грижі й питання про спину — лише тим, хто позначив спину */
    var clean = function (g) {
      if (!g) return g;
      var items = g.items.map(function (x) { return neutral(x, sex, has.band); }).filter(function (x) { return x !== null && (back || !/гриж|питання про самопочуття|спитає про самопочуття/i.test(x)) && (myo || !/^Міо-підхід/.test(x)); });
      /* без еспандера — розділ про диски без частини про еспандер */
      if (g.id === 'gear' && !has.band && items.indexOf('#Еспандер') >= 0) return { id: g.id, title: 'Диски', items: items.slice(0, items.indexOf('#Еспандер')) };
      return { id: g.id, title: neutral(g.title, sex), items: items };
    };
    var pick = function (p, id) { return clean(PROGRAMS[p].guide.filter(function (g) { return g.id === id; })[0]); };
    /* noKit — без гантелей і петлі: лише тренажери (у залі чи вдома) — ріст навантаження як у залі */
    var out = [], gymOnly = has.gym && !home, loadWarm = has.db || has.gym || has.mach, noKit = !has.db && !has.band;
    /* безпека: у залі без порад про крісло, гайки гантелей, підлогу й двері */
    /* лише тренажери (зал чи вдома без гантелей і петлі): лікар, дихання, грижі, стоп-сигнали (+ підлога вдома) і пункти тренажерів */
    var safe = pick(has.db || noKit ? 'him' : 'her', 'safety');
    if (noKit) safe = { id: 'safety', title: safe.title, items: safe.items.filter(function (x) { return (home ? /^(Лікар\.|Дихання:|Стоп-сигнали:|Грижі хребта|Підлога)/ : /^(Лікар\.|Дихання:|Стоп-сигнали:|Грижі хребта)/).test(x); }).concat(GYM_SAFETY) };
    /* і вдома, і в залі, або тренажери вдома: домашні пункти + пункти тренажерів (перед стоп-сигналами) */
    else if (has.gym || has.mach) { var stop = safe.items.filter(function (x) { return /^Стоп-сигнали:/.test(x); }); safe = { id: 'safety', title: safe.title, items: safe.items.filter(function (x) { return stop.indexOf(x) < 0; }).concat(GYM_SAFETY, stop) }; }
    out.push(safe);
    /* розминка — та, що відповідає розминковому підходу програми (гантелі чи тренажери — 1 × 12; лише петля — підходу немає) */
    var warm = gymOnly ? { id: 'warm', title: 'Розминка й заминка', items: (shortWarm ? GYM_WARM_SHORT : GYM_WARM).slice() }
      : shortWarm ? { id: 'warm', title: 'Розминка й заминка', items: HOME_WARM_SHORT.slice() } : pick(loadWarm ? 'him' : 'her', 'warm');
    warm = { id: warm.id, title: warm.title, items: warm.items.map(function (x) {
      if (!/^Перед першою/.test(x)) return x;
      if (!loadWarm) return null;                                            // лише петля: розминковий підхід застосунок не додає
      return has.gym && !has.db && !has.mach ? 'У залі п' + x.slice(1) : x;   // удома з петлею — лише в залі
    }).filter(function (x) { return x !== null; }) };
    out.push(warm);
    if (back) out.push(backGuide(ex, lists));
    if (has.db) out.push(pick('him', 'gear'));
    if (has.band) { var g = pick('her', 'gear'); if (g && !has.db) out.push(g); else if (g) out.push({ id: 'gear2', title: g.title, items: g.items }); }
    if (has.gym || has.mach) out.push({ id: 'gymgear', title: 'Тренажери й блоки', items: GYM_GEAR.slice() });
    if (posture) out.push(pick('her', 'posture'));
    var pr = pick(has.db || noKit ? 'him' : 'her', 'prog');
    if (noKit) pr = { id: 'prog', title: pr.title, items: pr.items.map(function (x) { return Object.prototype.hasOwnProperty.call(GYM_PROG, x) ? GYM_PROG[x] : x; }).filter(function (x) { return x !== null; }) };
    out.push(pr);
    return out.filter(Boolean);
  }

  return { VER: VER, maxDays: maxDays, GOALS: GOALS, GOAL_CLASH: GOAL_CLASH, goalsOf: goalsOf, goalText: goalText, EQUIP: EQUIP, MACH: MACH, PULL: PULL, PLACES: PLACES, LIMITS: LIMITS, DAYS: DAYS, check: check, build: build, needs: needs, AVOID: AVOID, GAVOID: GAVOID, GYM: GYM, GYM_WARM: GYM_WARM, GYM_WARM_SHORT: GYM_WARM_SHORT, HOME_WARM_SHORT: HOME_WARM_SHORT };
})();
if (typeof module !== 'undefined') module.exports = GEN;
