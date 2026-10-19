/* Програми тренувань — дзеркало документів «Гантелі 2×20» (ред. 5) і «Спина, осанка, ноги» (ред. 2).
   type: db — гантелі (db: скільки гантелей), dbopt — вага за бажанням, band — еспандер (рівень),
   bw — повторення без ваги, amrap — скільки зможете, time — секунди (load — якщо з гантеллю). */
var PROGRAMS = (function () {
  function w(ex, sets, min, max, rest, extra) {
    var o = { ex: ex, sets: sets, min: min, max: max, rest: rest };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  var him = {
    id: 'him',
    title: 'Гантелі 2×20',
    sub: 'Сила й маса · пн / ср / пт',
    cap: 20,
    ex: {
      goblet:     { name: 'Присідання до крісла', type: 'db', db: 1, group: 'legs', big: true, main: true, start: 10,
                    variants: [{ id: 'g1', label: 'гоблет · 1 гантель', db: 1 }, { id: 's2', label: '2 гантелі на плечах', db: 2 }],
                    tip: 'Сідницями торкніться крісла й одразу вставайте. Коліна — за носками, п’яти на підлозі. Дві гантелі на плечах — коли гоблет «гриф + 20» × 15 легко.' },
      floorpress: { name: 'Жим лежачи на підлозі', type: 'db', db: 2, group: 'chest', main: true, start: 10,
                    tip: 'Коліна зігнуті, лікті ≈ 45° до тулуба, опускайте до легкого дотику ліктями до підлоги. Підтягніть гайки.' },
      bridge:     { name: 'Сідничний міст з гантеллю', type: 'db', db: 1, group: 'legs', start: 10,
                    tip: 'Гантель на тазі. Пауза 1–2 с угорі, поперек не прогинати.' },
      row1:       { name: 'Тяга однією рукою з упором на крісло', type: 'db', db: 1, group: 'back', big: true, main: true, side: true, start: 15,
                    tip: 'Спина рівна, лікоть тягніть до кишені, а не до плеча.' },
      pulldown:   { name: 'Тяга еспандера зверху сидячи', type: 'band', group: 'back', main: true, start: 5,
                    tip: 'T15, кріплення вгорі. Крісло обличчям до дверей, лікті вниз до боків, пауза 1 с, повернення 2–3 с.' },
      seatedpress:{ name: 'Жим сидячи на кріслі', type: 'db', db: 2, group: 'shoulders', main: true, start: 5,
                    tip: 'Спина щільно до спинки, лікті трохи попереду, без поштовху ногами.' },
      curl:       { name: 'Згинання на біцепс сидячи', type: 'db', db: 2, group: 'arms', start: 5,
                    tip: 'Лікті притиснуті, без розгойдування, долоні розвертаються вгору.' },
      farmer:     { name: 'Фермерська прогулянка', type: 'time', db: 2, load: true, group: 'core', start: 20,
                    tip: 'Важкі гантелі в опущених руках, плечі донизу, корпус рівно.' },
      rdl:        { name: 'Румунська тяга', type: 'db', db: 2, group: 'legs', big: true, main: true, start: 10,
                    tip: 'Коліна злегка зігнуті, таз назад, спина рівна, гантелі ковзають уздовж ніг. Запас 2 завжди.' },
      splitsquat: { name: 'Розщеплений присід з опорою', type: 'dbopt', db: 1, group: 'legs', side: true, start: null,
                    variants: [{ id: 'r', label: 'розщеплений присід' }, { id: 'l', label: 'зворотні випади' }, { id: 'b', label: 'болгарський (фаза 3)' }],
                    tip: 'Широкий крок, рукою за стіну, опускайтеся вертикально. Гантель — коли без неї легко.' },
      lateral:    { name: 'Махи в сторони стоячи', type: 'db', db: 2, group: 'shoulders', start: 2.5,
                    tip: 'Лікті трохи зігнуті, до рівня плечей, без ривка.' },
      facepull:   { name: 'Тяга до обличчя', type: 'band', group: 'shoulders', start: 3,
                    tip: 'T15, кріплення на рівні плечей. Тягніть до лоба, лікті високо в сторони, пауза 2 с.' },
      ohext:      { name: 'Розгинання з-за голови сидячи', type: 'db', db: 1, group: 'arms', start: 10,
                    tip: 'Одна гантель двома руками, лікті дивляться вперед.' },
      floorfly:   { name: 'Розведення лежачи на підлозі', type: 'db', db: 2, group: 'chest', start: 5,
                    tip: 'Руки трохи зігнуті, плечі до дотику з підлогою, пауза 1 с внизу.' },
      pullover:   { name: 'Пуловер лежачи на підлозі', type: 'db', db: 1, group: 'back', start: 10,
                    tip: 'Гантель над грудьми, по дузі за голову до розтягнення.' },
      crunch:     { name: 'Скручування на підлозі', type: 'bw', group: 'core', tip: 'Підіймайте лопатки, поперек притиснутий.' },
      closegrip:  { name: 'Жим вузьким хватом лежачи', type: 'db', db: 2, group: 'arms', start: 10,
                    tip: 'Гантелі паралельно, лікті вздовж тіла.' },
      skull:      { name: 'Французький жим лежачи', type: 'db', db: 2, group: 'arms', start: 5,
                    tip: 'Згинайте лише в ліктях, гантелі до скронь.' },
      calf:       { name: 'Підйом на носок однією ногою', type: 'dbopt', db: 1, group: 'legs', side: true, start: null,
                    tip: 'На порозі, другою рукою за стіну, п’ята нижче порога.' },
      crunchw:    { name: 'Скручування з гантеллю на грудях', type: 'db', db: 1, group: 'core', start: 5,
                    tip: 'Поперек притиснутий до підлоги.' },
      bentrow:    { name: 'Тяга двох гантелей у нахилі', type: 'db', db: 2, group: 'back', start: 10,
                    tip: 'Лише якщо поперек не болить; інакше — ще 3 підходи тяги однією рукою.' },
      reardelt:   { name: 'Розведення в нахилі сидячи (задня дельта)', type: 'db', db: 2, group: 'shoulders', start: 2.5,
                    tip: 'Сядьте на край крісла, нахиліться вперед, розводьте ліктями.' },
      shrug:      { name: 'Шраги стоячи', type: 'db', db: 2, group: 'back', start: 15,
                    tip: 'Плечі вгору до вух, пауза 1 с, без обертань.' },
      hammer:     { name: 'Молотки', type: 'db', db: 2, group: 'arms', start: 5, tip: 'Долоні дивляться одна на одну.' },
      pushup:     { name: 'Віджимання', type: 'amrap', group: 'chest',
                    variants: [{ id: 'k', label: 'з колін' }, { id: 't', label: 'з носків' }],
                    tip: 'Скільки зможете, залишаючи запас 2. Не впирайтеся в гантелі — диски котяться.' }
    },
    workouts: {
      A:  { title: 'Тренування А', items: [w('goblet',3,12,15,90), w('floorpress',3,12,15,90), w('bridge',2,15,15,60), w('row1',3,12,15,90),
            w('pulldown',2,12,15,90), w('seatedpress',2,12,15,90), w('curl',2,12,15,60), w('farmer',2,30,40,60)] },
      B:  { title: 'Тренування Б', items: [w('rdl',3,12,15,90), w('splitsquat',2,10,12,90), w('row1',3,12,15,90), w('lateral',2,15,20,60),
            w('facepull',2,15,15,60), w('ohext',2,12,15,60), w('floorfly',2,12,15,60), w('pullover',2,12,15,60), w('crunch',2,15,20,60)] },
      D1: { title: 'День 1 · груди, плечі, трицепс', items: [w('floorpress',4,8,12,120), w('floorfly',3,12,15,60), w('closegrip',3,10,15,90),
            w('skull',2,12,15,60), w('row1',4,10,12,90), w('seatedpress',3,10,12,90), w('lateral',3,12,20,60), w('facepull',3,12,15,60)] },
      D2: { title: 'День 2 · ноги, сідниці, прес', items: [w('goblet',4,10,15,120), w('rdl',4,10,15,120), w('splitsquat',3,10,12,90),
            w('calf',3,12,20,60), w('farmer',3,40,40,60), w('bridge',3,12,15,60), w('crunchw',3,12,20,60)] },
      D3: { title: 'День 3 · спина, задня дельта, біцепс', items: [w('row1',4,8,12,90), w('pulldown',3,10,15,90), w('bentrow',3,10,12,90),
            w('seatedpress',3,8,12,120), w('reardelt',3,15,20,60), w('shrug',3,12,15,60), w('curl',3,10,12,60), w('hammer',2,10,12,60),
            w('pullover',3,12,15,60), w('pushup',2,0,0,60)] }
    },
    week: function (wk) { return wk <= 4 ? (wk % 2 ? ['A','B','A'] : ['B','A','B']) : ['D1','D2','D3']; },
    deload: [8, 12],
    days: [1, 3, 5],
    /* Фаза 3 (тижні 9–11): суперсети без зміни дисків — друга вправа йде одразу за першою, відпочинок після пари. */
    supersets: function (wk, wid) {
      if (wk < 9 || wk > 11) return [];
      return ({ D1: [['floorfly', 'closegrip'], ['skull', 'pushup']], D2: [['bridge', 'crunchw']], D3: [['curl', 'hammer'], ['bentrow', 'shrug']] })[wid] || [];
    },
    setsFor: function (item, wk) { return this.deload.indexOf(wk) >= 0 ? Math.ceil(item.sets / 2) : item.sets; },
    note: function (wk) {
      if (wk <= 2) return { phase: 'Фаза 1 · техніка', rir: 'запас 3', text: 'Опускання 2–3 с, підйом 1–2 с, без ривків.' };
      if (wk <= 4) return { phase: 'Фаза 1 · техніка', rir: 'запас 2', text: 'Опускання 2–3 с, підйом 1–2 с, без ривків.' };
      if (wk === 5) return { phase: 'Фаза 2 · обʼєм', rir: 'запас 2', text: 'Присідання й румунська тяга — завжди із запасом 2.' };
      if (wk <= 7) return { phase: 'Фаза 2 · обʼєм', rir: 'запас 1 (ноги й поперек — 2)', text: 'Присідання й румунська тяга — завжди із запасом 2.' };
      if (wk === 8) return { phase: 'Легкий тиждень', rir: 'запас 3–4', text: 'Підходів удвічі менше, вага та сама або на крок нижча.' };
      if (wk <= 11) return { phase: 'Фаза 3 · інтенсивність', rir: 'запас 1; ізоляція — останній підхід до відмови',
        text: 'Опускання 3–4 с, пауза 2 с внизу. Суперсети без зміни дисків: розведення + жим вузьким; французький + віджимання з колін; згинання + молотки; тяга в нахилі + шраги; міст + скручування. Дроп-сет — легший варіант тією самою вагою.' };
      return { phase: 'Легкий тиждень і заміри', rir: 'запас 3–4', text: 'Підходів удвічі менше. Заміри: вага, талія, фото — розділ «Тіло».' };
    },
    daily: [{ id: 'walk', label: 'Ходьба 30–45 хв або 7–10 тис. кроків' }],
    tests: false
  };

  var her = {
    id: 'her',
    title: 'Спина, осанка, ноги',
    sub: 'Усе тіло · вт / чт / сб',
    cap: 20,
    ex: {
      goblet:     { name: 'Присідання до крісла з гантеллю', type: 'db', db: 1, group: 'legs', big: true, main: true, start: 5,
                    tip: 'Опускання 2–3 с, сідницями до сидіння — і швидко вгору. Коліна за носками.' },
      pulldown:   { name: 'Тяга зверху на колінах', type: 'band', group: 'back', main: true, start: 2,
                    tip: 'T15, кріплення вгорі. Лікті вниз до боків, лопатки вниз, пауза 1 с.' },
      rdl:        { name: 'Румунська тяга', type: 'db', db: 2, group: 'legs', big: true, main: true, start: 5,
                    tip: 'Спина рівна, таз назад, гантелі до середини гомілки. Вгору — швидко.' },
      pushup:     { name: 'Віджимання', type: 'bw', group: 'chest',
                    variants: [{ id: 'k', label: 'з колін' }, { id: 't', label: 'з носків' }],
                    tip: 'Тіло — рівна лінія, лікті ≈ 45°.' },
      facepull:   { name: 'Тяга до обличчя', type: 'band', group: 'shoulders', start: 1,
                    tip: 'T15, кріплення на рівні плечей. До лоба, лікті високо, пауза 2 с.' },
      pallof:     { name: 'Паллоф-жим', type: 'band', group: 'core', side: true, start: 1,
                    tip: 'Боком до дверей, руки вперед, утримати 2 с — корпус не повертається.' },
      suitcase:   { name: 'Валізна прогулянка', type: 'time', db: 1, load: true, group: 'core', side: true, start: 7.5,
                    tip: 'Одна гантель в одній руці, корпус рівно, не нахилятися вбік.' },
      splitsquat: { name: 'Розщеплений присід з опорою', type: 'dbopt', db: 1, group: 'legs', side: true, start: null,
                    variants: [{ id: 'r', label: 'розщеплений присід' }, { id: 'l', label: 'зворотні випади (з тижня 9)' }],
                    tip: 'Широкий крок, рукою за стіну, опускайтеся вертикально, вгору — швидко.' },
      bridge:     { name: 'Сідничний міст з гантеллю', type: 'db', db: 1, group: 'legs', start: 10,
                    variants: [{ id: 'f', label: 'з підлоги' }, { id: 'c', label: 'плечі на кріслі (з тижня 9)' }],
                    tip: 'Пауза 2 с угорі, сідниці стиснути, поперек не прогинати.' },
      row1:       { name: 'Тяга однією рукою з упором на крісло', type: 'db', db: 1, group: 'back', main: true, side: true, start: 5,
                    tip: 'Спершу лопатку назад і вниз, потім лікоть до кишені.' },
      seatedpress:{ name: 'Жим сидячи на кріслі', type: 'db', db: 2, group: 'shoulders', main: true, start: 0,
                    tip: 'Спина притиснута до спинки, ребра не виходять уперед.' },
      abduct:     { name: 'Відведення ноги в сторону', type: 'band', group: 'legs', side: true, start: 1,
                    tip: 'T15, ремінець на щиколотці, кріплення внизу. Без нахилу корпусу.' },
      slrdl:      { name: 'Румунська тяга на одній нозі', type: 'dbopt', db: 1, group: 'legs', side: true, start: null,
                    tip: 'Рукою об стіну, таз рівний, вільна нога відходить назад.' },
      extrot:     { name: 'Зовнішня ротація плеча', type: 'band', group: 'shoulders', side: true, start: 1,
                    tip: 'T15, кріплення на рівні ліктя, двері з боку вільної руки, лікоть притиснутий.' },
      sideplank:  { name: 'Бічна планка', type: 'time', group: 'core', side: true,
                    variants: [{ id: 'k', label: 'з колін' }, { id: 'f', label: 'з ніг' }],
                    tip: 'Тіло — одна лінія, таз не провисає.' },
      curl:       { name: 'Згинання на біцепс (за бажанням)', type: 'db', db: 2, group: 'arms', start: 2.5, tip: 'Лікті притиснуті.' },
      ohext:      { name: 'Розгинання з-за голови (за бажанням)', type: 'db', db: 1, group: 'arms', start: 5, tip: 'Лікті дивляться вперед.' }
    },
    workouts: {
      A: { title: 'Тренування А · ноги, спина, корпус', items: [w('goblet',3,10,15,90), w('pulldown',3,12,15,90), w('rdl',3,10,12,90),
           w('pushup',3,6,12,90), w('facepull',3,12,15,60), w('pallof',2,10,10,60), w('suitcase',2,30,40,60),
           w('curl',2,12,15,60,{ optional: true }), w('ohext',2,12,15,60,{ optional: true })] },
      B: { title: 'Тренування Б · сідниці, плечі, баланс', items: [w('splitsquat',3,8,12,90), w('bridge',3,12,15,90), w('row1',3,10,12,90),
           w('seatedpress',3,8,12,90), w('abduct',2,12,15,60), w('slrdl',2,8,10,60), w('extrot',2,12,15,45), w('sideplank',2,20,40,45)] }
    },
    week: function (wk) { return wk % 2 ? ['A','B','A'] : ['B','A','B']; },
    deload: [8, 12],
    days: [2, 4, 6],
    supersets: function () { return []; },
    setsFor: function (item, wk) {
      if (this.deload.indexOf(wk) >= 0) return Math.ceil(item.sets / 2);
      if (wk <= 2) return Math.min(item.sets, 2);
      return item.sets;
    },
    note: function (wk) {
      if (wk <= 2) return { phase: 'Техніка й звичка', rir: 'запас 3', text: 'Налаштуйте T15: кольори від легкого до важкого, 4 висоти кріплення.' };
      if (wk <= 4) return { phase: 'Техніка й звичка', rir: 'запас 2', text: 'Підйом швидко, опускання повільно.' };
      if (wk <= 7) return { phase: 'Прогрес', rir: wk === 5 ? 'запас 2' : 'запас 1', text: 'Спершу повторення, потім вага або колір еспандера.' };
      if (wk === 8) return { phase: 'Легкий тиждень', rir: 'запас 3–4', text: 'Підходів удвічі менше.' };
      if (wk <= 11) return { phase: 'Прогрес', rir: 'запас 1–2', text: 'Міст — плечима на кріслі, зворотні випади замість розщепленого присіду.' };
      return { phase: 'Легкий тиждень і тести', rir: 'запас 3–4', text: 'Підходів удвічі менше. Тести — розділ «Тіло».' };
    },
    daily: [{ id: 'posture', label: 'Осанка 5 хв (петля, підборіддя, ангел, розтяжки)' },
            { id: 'jumps', label: 'Стрибки для кісток', jumps: true },
            { id: 'walk', label: 'Ходьба 30–40 хв або 7–10 тис. кроків' }],
    jumpsFor: function (wk) { return wk <= 2 ? { n: 10, times: 1 } : (wk <= 8 ? { n: 10, times: 2 } : { n: 20, times: 2 }); },
    tests: true
  };
  /* М'язи: p — основні (1 підхід), s — допоміжні (0,5 підходу). */
  var M = {
    goblet: { p: ['quads', 'glutes'], s: ['abs'] }, floorpress: { p: ['chest'], s: ['triceps', 'delts'] },
    bridge: { p: ['glutes'], s: ['hams'] }, row1: { p: ['lats'], s: ['biceps', 'reardelts'] },
    pulldown: { p: ['lats'], s: ['biceps'] }, seatedpress: { p: ['delts'], s: ['triceps'] },
    curl: { p: ['biceps'], s: ['forearms'] }, farmer: { p: ['forearms', 'traps'], s: ['abs'] },
    rdl: { p: ['hams', 'glutes'], s: ['lowback'] }, splitsquat: { p: ['quads', 'glutes'], s: ['hams'] },
    lateral: { p: ['delts'], s: [] }, facepull: { p: ['reardelts'], s: ['traps'] },
    ohext: { p: ['triceps'], s: [] }, floorfly: { p: ['chest'], s: ['delts'] },
    pullover: { p: ['lats'], s: ['chest'] }, crunch: { p: ['abs'], s: [] },
    closegrip: { p: ['triceps'], s: ['chest'] }, skull: { p: ['triceps'], s: [] },
    calf: { p: ['calves'], s: [] }, crunchw: { p: ['abs'], s: [] },
    bentrow: { p: ['lats', 'reardelts'], s: ['biceps', 'lowback'] }, reardelt: { p: ['reardelts'], s: ['traps'] },
    shrug: { p: ['traps'], s: ['forearms'] }, hammer: { p: ['biceps', 'forearms'], s: [] },
    pushup: { p: ['chest'], s: ['triceps', 'delts', 'abs'] }, pallof: { p: ['obliques', 'abs'], s: [] },
    suitcase: { p: ['obliques', 'forearms'], s: ['traps'] }, abduct: { p: ['glutes'], s: [] },
    slrdl: { p: ['hams', 'glutes'], s: ['lowback'] }, extrot: { p: ['reardelts'], s: [] },
    sideplank: { p: ['obliques'], s: ['abs'] }
  };
  [him, her].forEach(function (pr) { Object.keys(pr.ex).forEach(function (id) { pr.ex[id].m = M[id] || { p: [], s: [] }; }); });
  return { him: him, her: her };
})();
var MUSCLES = [['chest', 'Груди'], ['delts', 'Плечі'], ['reardelts', 'Задні дельти'], ['biceps', 'Біцепс'], ['triceps', 'Трицепс'],
  ['forearms', 'Передпліччя'], ['traps', 'Трапеції'], ['lats', 'Спина'], ['lowback', 'Поперек'], ['abs', 'Прес'], ['obliques', 'Косі'],
  ['glutes', 'Сідниці'], ['quads', 'Квадрицепс'], ['hams', 'Задня поверхня стегна'], ['calves', 'Литки']];
if (typeof module !== 'undefined') module.exports = { PROGRAMS: PROGRAMS, MUSCLES: MUSCLES };
