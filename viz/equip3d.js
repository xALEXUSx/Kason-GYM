/* Бібліотека обладнання для 3D-візуалізації (день 2, 24.10): усе, що є в програмах (app/program.js — дім, app/generator.js — 18 тренажерних вправ).
   Розміри — типові для залу й дому (сидіння 45–50 см, стек плит, шків на 4 висотах, двері 90 × 205 см, килимок 183 × 61 см).
   Система — як у манекена: людина дивиться в +x, сидить біля x = 0. Кожен виріб повертає частини, що рухаються, і move(t) (t: 0 — старт, 1 — крайня точка) —
   для галереї; вправи (ex3d) ставлять рухомі частини самі — за кистями й стопами манекена. */
function EQUIP3D(E) {
  'use strict';
  const { THREE, V, place } = E, RAD = Math.PI / 180;
  /* трос / резинка: циліндр одиничної довжини, що тягнеться між двома точками */
  /* solid — жорсткий важіль (перевіряється на дотик з тілом); інакше трос / резинка (не перевіряється) */
  const wire = (k, r, mat, solid) => { const o = k.cyl(r || 0.005, 1, mat || k.md); o.userData.wire = !solid; return { o, set(a, b) { place(o, a, b); o.scale.y = Math.max(0.001, a.distanceTo(b)); } }; };
  /* опора: основа на підлозі, стійка, сидіння, спинка — усе з подушок і профілю */
  /* основа — тонка плита 1,2 см (до 24.10 — 3,5 см: стопи сидячого заходили в неї) */
  const base = (k, x0, x1, z0, z1) => k.box(x1 - x0, 0.012, z1 - z0, k.md, (x0 + x1) / 2, 0.006, (z0 + z1) / 2);
  const post = (k, x, z, y0, y1, w) => k.box(w || 0.07, y1 - y0, w || 0.07, k.m, x, (y0 + y1) / 2, z);
  /* сидіння: верх на висоті top, на стійці */
  const seat = (k, x, top, z, w, d) => { k.pad(w || 0.4, 0.07, d || 0.4, x, top - 0.035, z || 0); post(k, x, z || 0, 0.012, top - 0.07, 0.06); };
  /* стек плит із рамою: 12 плит; lift(dy) — підняти робочі плити (тягнеш — стек іде вгору) */
  function tower(k, x, z, h, rotY) {
    const t = k.sub(); t.g.position.set(x, 0, z); t.g.rotation.y = (rotY || 0) * RAD;
    t.box(0.34, 0.04, 0.5, t.md, 0, 0.02, 0);
    t.box(0.05, h, 0.5, t.m, -0.15, h / 2, 0);                         // кожух ззаду
    t.box(0.3, 0.05, 0.5, t.m, 0, h - 0.025, 0);                       // верхня планка
    [0.12, -0.12].forEach((zz) => t.rod(V(0, 0.04, zz), V(0, h - 0.05, zz), 0.009));
    for (let i = 0; i < 8; i++) t.box(0.17, 0.026, 0.3, t.md, 0, 0.07 + i * 0.03, 0);
    const up = t.sub(); for (let i = 0; i < 4; i++) up.box(0.17, 0.026, 0.3, up.md, 0, 0.07 + (8 + i) * 0.03, 0);
    up.box(0.19, 0.03, 0.18, up.m, 0, 0.07 + 12 * 0.03 + 0.005, 0); up.rod(V(0, 0.42, 0), V(0, 0.55, 0), 0.008);
    const top = () => t.g.localToWorld(V(0, 0.07 + 12 * 0.03 + 0.12 + up.g.position.y, 0));
    return { g: t.g, lift(dy) { up.g.position.y = Math.max(0, Math.min(h - 0.62, dy)); }, top };
  }

  /* ---------- дім ---------- */
  function chair(k, o) {
    o = o || {}; const s = k.sub(); s.g.position.set(o.x === undefined ? -0.42 : o.x, 0, o.z || 0); s.g.rotation.y = (o.rotY || 0) * RAD;
    s.pad(0.42, 0.045, 0.44, 0, 0.44, 0);                               // сидіння: верх 46 см
    s.pad(0.035, 0.36, 0.42, -0.215, 0.79, 0); s.g.children[1].rotation.z = 0.06;  // спинка, ледь назад
    [[-0.19, 0.19], [-0.19, -0.19], [0.18, 0.19], [0.18, -0.19]].forEach(([x, z]) => s.rod(V(x, 0, z), V(x * 0.97, 0.42, z * 0.97), 0.014));
    [0.19, -0.19].forEach((z) => s.rod(V(-0.2, 0.42, z), V(-0.225, 0.98, z), 0.013));
    return { g: s.g, top: 0.4625, front: (o.x === undefined ? -0.42 : o.x) + 0.21 };
  }
  /* розбірна гантель: гриф із насічкою, 2 диски з кожного боку, замки; вісь — local y, центр — у (0,0,0) */
  function dumbbell(k) {
    const s = k.sub();
    s.cyl(0.0165, 0.14, s.m); s.cyl(0.0125, 0.36, s.md);
    [1, -1].forEach((q) => { s.cyl(0.075, 0.022, s.md).position.y = q * 0.078; s.cyl(0.062, 0.022, s.md).position.y = q * 0.101; s.cyl(0.028, 0.03, s.m).position.y = q * 0.127; s.cyl(0.02, 0.04, s.m).position.y = q * 0.162; });
    k.held(s.g); return { g: s.g, half: 0.18, head: 0.067 };  // head — внутрішня грань диска від центру
  }
  function mat(k, o) { o = o || {}; const m = k.pad(1.83, 0.008, 0.61, o.x || 0, 0.004, o.z || 0, k.mat); m.rotation.y = (o.rotY || 0) * RAD; return { g: m, y: 0.008 }; }
  /* двері з кріпленням для резинки: площина стіни x = wx; кріплення — на висоті h (0,25 низ · 1,1 груди · 1,6 обличчя · 1,98 над дверима) */
  function door(k, o) {
    o = o || {}; const wx = o.x === undefined ? 1.25 : o.x, h = o.h || 1.1, s = k.sub();
    s.box(0.12, 2.4, 0.9, s.wall, wx + 0.06, 1.2, 0.95); s.box(0.12, 2.4, 0.9, s.wall, wx + 0.06, 1.2, -0.95); s.box(0.12, 0.35, 1.0, s.wall, wx + 0.06, 2.225, 0);
    [0.47, -0.47].forEach((z) => s.box(0.14, 2.07, 0.04, s.m, wx + 0.05, 1.035, z)); s.box(0.14, 0.04, 0.98, s.m, wx + 0.05, 2.07, 0);  // коробка
    s.box(0.04, 2.03, 0.88, s.md, wx + 0.02, 1.015, 0);                 // полотно (зачинене)
    s.sph(0.022, s.m, wx - 0.01, 1.0, -0.36);                           // ручка
    const a = V(wx - 0.035, h, o.z || 0); s.box(0.05, 0.03, 0.04, s.band, a.x + 0.01, h, a.z);  // петля кріплення в щілині
    return { g: s.g, anchor: a };
  }
  /* резинка з двома ручками (або одною): set(точки кистей) — тягнеться від кріплення до кожної кисті */
  function band(k, anchor, n) {
    const ws = [], hs = [];
    for (let i = 0; i < (n || 2); i++) { ws.push(wire(k, 0.0065, k.band)); const h = k.sub(); h.cyl(0.016, 0.12, h.soft, 'z'); h.torus(0.06, 0.006, h.band, 'y').position.x = 0.055; k.held(h.g); hs.push(h); }
    /* ручка: хват — у кисті, кільце — до кріплення (+x ручки дивиться на кріплення) */
    return { set(pts) { pts.forEach((p, i) => { if (!ws[i]) return; const h = hs[i].g; h.position.copy(p); h.lookAt(anchor); h.rotateY(-Math.PI / 2); ws[i].set(h.localToWorld(V(0.115, 0, 0)), anchor); }); } };
  }
  /* сходинка-поріг біля стіни (підйом на носок): верх 10 см */
  function step(k, o) { o = o || {}; const s = k.sub(); s.box(0.32, 0.1, 0.5, s.md, o.x || 0.05, 0.05, o.z || 0); if (o.wall !== false) s.box(0.1, 2.4, 2.4, s.wall, (o.wx || 0.75) + 0.05, 1.2, 0); return { g: s.g, top: 0.1 }; }  // wall: false — без стіни (поріг у дверній рамі)

  /* ---------- зал ---------- */
  /* жим ногами 45°: напрямні під 45°, каретка з платформою; set(центр стоп) */
  function legPress(k) {
    const u = V(Math.SQRT1_2, Math.SQRT1_2, 0), p = V(-Math.SQRT1_2, Math.SQRT1_2, 0), ext = V(0.6, 1.03, 0);
    /* сидіння й спинка — під тілом, а не в ньому (до 24.10 таз заходив у сидіння на 5,5 см, корпус у спинку — на 12) */
    const seat0 = k.box(0.42, 0.06, 0.5, k.soft, -0.04, 0.35, 0); seat0.rotation.z = -0.12;
    const back0 = k.box(0.07, 0.72, 0.5, k.soft, -0.434, 0.638, 0); back0.rotation.z = 0.84;
    k.box(1.6, 0.05, 0.62, k.md, 0.3, 0.025, 0);
    k.rod(V(-0.04, 0.05, 0), V(-0.04, 0.32, 0), 0.03); k.rod(V(-0.5, 0.05, 0), V(-0.5, 0.42, 0), 0.03);
    const r0 = ext.clone().addScaledVector(u, -0.75).addScaledVector(p, -0.12), r1 = ext.clone().addScaledVector(u, 0.42).addScaledVector(p, -0.12);
    [0.34, -0.34].forEach((z) => { k.rod(r0.clone().add(V(0, 0, z)), r1.clone().add(V(0, 0, z)), 0.028); k.rod(V(r1.x, 0.05, z), r1.clone().add(V(0, 0, z)), 0.03); });
    const plat = k.box(0.5, 0.05, 0.62, k.md), sled = k.box(0.42, 0.12, 0.72, k.m);
    [0.3, -0.3].forEach((z) => { const h = k.held(k.cyl(0.018, 0.16, k.md)); h.position.set(0.06, 0.47, z); h.rotation.z = Math.PI / 2; });  // бічні ручки
    /* поверхня платформи — під підошвою (до 24.10 щиколотка заходила в неї на 1,5 см) */
    const set = (a0) => { const c = a0.clone().addScaledVector(u, 0.095).addScaledVector(p, 0.07); plat.position.copy(c); plat.quaternion.setFromUnitVectors(V(0, 1, 0), u); sled.position.copy(c).addScaledVector(u, 0.11); sled.quaternion.copy(plat.quaternion); };
    return { u, p, ext, set, move(t) { set(ext.clone().addScaledVector(u, -0.22 * t)); } };
  }
  /* верхній блок: сидіння, валик над стегнами, шків угорі, довгий гриф; set(x, y гриф) */
  function latPull(k) {
    /* верх сидіння 0,435: таз — на ньому, не в ньому */
    k.box(0.4, 0.06, 0.42, k.soft, -0.02, 0.405, 0); k.rod(V(-0.02, 0.05, 0), V(-0.02, 0.375, 0), 0.035); k.box(0.5, 0.04, 0.4, k.md, -0.02, 0.02, 0);
    const r = k.cyl(0.058, 0.5, k.soft, 'z'); r.position.set(0.34, 0.66, 0); k.rod(V(0.2, 0.05, 0), V(0.2, 0.66, 0), 0.025); k.rod(V(0.2, 0.66, 0), V(0.34, 0.66, 0), 0.02);
    k.box(0.1, 2.3, 0.12, k.m, -0.6, 1.15, 0); k.box(0.86, 0.09, 0.12, k.m, -0.2, 2.28, 0);
    const tw = tower(k, -0.86, 0, 1.6, 0); k.rod(V(-0.86, 1.6, 0), V(-0.86, 2.2, 0), 0.012);
    const pul = k.cyl(0.07, 0.05, k.md, 'z'); pul.position.set(0.17, 2.18, 0); const pb = k.cyl(0.05, 0.05, k.md, 'z'); pb.position.set(-0.86, 2.2, 0);
    const cable = wire(k, 0.006), c2 = wire(k, 0.006), c3 = wire(k, 0.006); c2.set(V(0.17, 2.245, 0), V(-0.86, 2.245, 0));
    const bar = k.held(k.cyl(0.017, 1.0, k.m, 'z')), grips = [k.held(k.cyl(0.024, 0.12, k.soft, 'z')), k.held(k.cyl(0.024, 0.12, k.soft, 'z'))];
    const set = (bx, y) => { bar.position.set(bx, y, 0); grips[0].position.set(bx, y, 0.4); grips[1].position.set(bx, y, -0.4); cable.set(V(bx, 2.11, 0), V(bx, y, 0)); tw.lift((1.95 - y) * 0.5); c3.set(V(-0.86, 2.15, 0), tw.top()); };
    return { set, move(t) { set(0.17, 1.49 - 0.5 * t); } };  // гриф: руки вгорі майже прямі (1,49) → верх грудей (0,99)
  }
  /* нижній блок сидячи: довга лава, упор для стоп під кутом, шків між стопами, V-ручка; set(точка ручки) */
  function cableRow(k) {
    /* верх лави 0,42 */
    k.pad(1.2, 0.07, 0.34, 0.05, 0.385, 0); [-0.45, 0.45].forEach((x) => post(k, x, 0, 0.012, 0.35, 0.06)); base(k, -0.55, 1.35, -0.2, 0.2);
    /* упори для стоп — вище лави: гомілки йдуть над нею (до 24.10 упори стояли низько — гомілки проходили крізь лаву) */
    [0.17, -0.17].forEach((z) => { const f = k.box(0.04, 0.3, 0.16, k.md, 0.905, 0.55, z); f.rotation.z = -0.35; k.rod(V(0.95, 0.012, z), V(0.95, 0.42, z), 0.022); });  // упор для стоп — відхилений від людини
    const tw = tower(k, 1.3, 0, 1.9, 180); post(k, 1.06, 0, 0.012, 0.56, 0.09);
    const pul = k.cyl(0.05, 0.05, k.md, 'z'); pul.position.set(1.0, 0.52, 0);
    const cable = wire(k, 0.006), c2 = wire(k, 0.006);
    /* V-ручка: хват ±0,07 */
    const h = k.sub(); h.rod(V(0, 0, 0.085), V(0, 0, -0.085), 0.015, h.soft); h.rod(V(0, 0, 0.085), V(0.12, 0, 0.012), 0.011); h.rod(V(0, 0, -0.085), V(0.12, 0, -0.012), 0.011); h.rod(V(0.12, 0, 0.012), V(0.12, 0, -0.012), 0.011); k.held(h.g);
    const set = (pt) => { h.g.position.copy(pt); const a = V(pt.x + 0.12, pt.y, 0), b = V(0.97, 0.52, 0); cable.set(a, b); h.g.rotation.z = Math.atan2(b.y - a.y, b.x - a.x); tw.lift((0.95 - pt.x) * 0.45); c2.set(V(1.04, 0.52, 0), tw.top()); };
    return { set, move(t) { set(V(0.5 - 0.3 * t, 0.78, 0)); } };  // руки випрямлені (0,5) → ручка за 9 см від живота (0,2)
  }
  /* жорсткі важелі: дві ручки на важелях однакової довжини R, що обертаються навколо осі вздовж z (поперечка між шарнірами) —
     ручка йде по дузі, а не тягнеться. set(кут°) — кут важеля від +x у площині x-y; повертає точки двох ручок (їх беруть кисті манекена).
     Висоти — під сидячого манекена: плече ≈ 1,0 м при сидінні 47 см (до 24.10 ручки стояли на ~25 см вище, важелі були «резинками») */
  function levers(k, pivot, R, inset, vert) {
    const pz = Math.abs(pivot.z);
    k.rod(V(pivot.x, pivot.y, pz + 0.04), V(pivot.x, pivot.y, -pz - 0.04), 0.026, k.md); [pz, -pz].forEach((z) => { k.cyl(0.045, 0.07, k.md, 'z').position.set(pivot.x, pivot.y, z); });
    const arms = [wire(k, 0.022, k.m, true), wire(k, 0.022, k.m, true)], jogs = [wire(k, 0.018, k.m), wire(k, 0.018, k.m)], hs = [0, 1].map(() => k.held(k.cyl(0.02, 0.13, k.soft, vert ? undefined : 'z')));
    return { set(deg) {
      const a = deg * RAD, out = [];
      [1, -1].forEach((q, i) => {
        const e = V(pivot.x + R * Math.cos(a), pivot.y + R * Math.sin(a), q * pz), h = e.clone(); h.z = q * (pz - inset);
        arms[i].set(V(pivot.x, pivot.y, q * pz), e); jogs[i].set(e, h); hs[i].position.copy(h); out.push(h);
      });
      return out;
    } };
  }
  /* жим від грудей сидячи: вісь угорі спереду (важелі звисають обабіч голови), ручки нейтральним хватом на рівні середини грудей;
     дуга майже пласка: старт x 0,2 (біля грудей) → x 0,42 (руки випрямлені), висота 0,86 → 0,85 */
  function chestPress(k) {
    seat(k, 0.02, 0.435, 0, 0.4, 0.4); base(k, -0.5, 0.75, -0.42, 0.42);
    const bk = k.pad(0.08, 0.7, 0.38, -0.255, 0.92, 0); bk.rotation.z = 0.12; post(k, -0.34, 0, 0.012, 1.83);  // спинка — за спиною (до 24.10 груди заходили в неї на 5 см)
    k.box(0.7, 0.06, 0.08, k.m, 0.03, 1.83, 0);
    const P = V(0.35, 1.8, 0.3), R = 0.952, a0 = -99.1, a1 = -85.8,  /* кінець — x 0,42: досяжно випрямленими руками (до 24.10 — 0,6, не діставали на 8 см) */ tw = tower(k, -0.62, 0, 1.75, 0), lv = levers(k, P, R, 0.1, true), c = wire(k, 0.006);
    const set = (deg) => { const h = lv.set(deg); tw.lift((deg - a0) * 0.012); c.set(V(-0.62, 1.73, 0), tw.top()); return h; };
    return { set, a0, a1, move(t) { return set(a0 + (a1 - a0) * t); } };
  }
  /* жим угору сидячи: вісь позаду спинки; ручки на ширині ±0,38 — старт трохи вище плечей і попереду (1,13 м, лікоть ≈ 60°), угорі 1,48 м, ледь назад (до 24.10 старт був на рівні плеча — лікоть складався до 20°) */
  function shoulderPress(k) {
    seat(k, 0.02, 0.435, 0, 0.4, 0.4); base(k, -0.7, 0.45, -0.5, 0.5);
    const bk = k.pad(0.08, 0.75, 0.38, -0.19, 0.95, 0); bk.rotation.z = 0.05; post(k, -0.3, 0, 0.012, 1.14);  // спинка за спиною (до 24.10 — у ній на 2,7 см)
    k.rod(V(-0.3, 1.14, 0), V(-0.53, 1.14, 0), 0.03);  // кронштейн осі від стійки
    const P = V(-0.53, 1.14, 0.47), R = 0.627, a0 = -0.9, a1 = 32.8, tw = tower(k, -0.75, 0, 1.75, 0), lv = levers(k, P, R, 0.09, true), c = wire(k, 0.006);
    const set = (deg) => { const h = lv.set(deg); tw.lift((deg - a0) * 0.008); c.set(V(-0.75, 1.73, 0), tw.top()); return h; };
    return { set, a0, a1, move(t) { return set(a0 + (a1 - a0) * t); } };
  }
  /* розведення ніг: сидіння, спинка з нахилом, упори для стоп, подушки з зовнішнього боку колін на важелях із вертикальною віссю */
  function abduction(k) {
    seat(k, 0.0, 0.435, 0, 0.42, 0.42); base(k, -0.55, 0.85, -0.45, 0.45);
    const bk = k.pad(0.08, 0.7, 0.4, -0.334, 0.812, 0); bk.rotation.z = 0.32;  // спинка паралельна корпусу й за ним (до 24.10 груди заходили в неї на 9,6 см)
    /* осі рук тренажера — під кульшовими суглобами (x −0,08, z ±0,1): подушка йде по тій самій дузі, що й коліно (до 24.10 осі стояли спереду — подушка «їхала» по коліну) */
    const tw = tower(k, -0.6, 0, 1.6, 0), arms = [k.sub(), k.sub()];
    arms.forEach((a, i) => { const q = i ? -1 : 1; a.g.position.set(-0.08, 0, q * 0.1); a.rod(V(0, 0.012, 0), V(0, 0.3, 0), 0.022, a.md); a.rod(V(0, 0.3, 0), V(0.44, 0.3, q * 0.13), 0.018); a.rod(V(0.44, 0.3, q * 0.13), V(0.44, 0.5, q * 0.13), 0.018);
      const p = a.pad(0.2, 0.05, 0.16, 0.44, 0.51, q * 0.095); p.rotation.x = Math.PI / 2; });  // подушка — із зовнішнього боку коліна
    const set = (deg) => { arms.forEach((a, i) => { a.g.rotation.y = (i ? 1 : -1) * deg * RAD; }); tw.lift(deg * 0.006); return deg; };
    return { set, hip: V(-0.08, 0.51, 0.1), move(t) { return set(35 * t); } };
  }
  /* важіль із подушкою, що обертається навколо осі коліна (згинання / розгинання ніг) */
  function kneeLever(k, axis, len, a0, side) {
    /* вісь — лише збоку (маточина), не прутом крізь коліна (до 24.10) */
    const s = k.sub(); s.g.position.copy(axis); s.rod(V(0, 0, 0.36), V(0, 0, 0.26), 0.02, s.md); s.cyl(0.05, 0.08, s.md, 'z').position.z = 0.3;
    s.rod(V(0, 0, 0.3), V(0, -len, 0.3), 0.02); s.rod(V(0, -len, 0.3), V(side * 0.108, -len, 0.3), 0.02); const r = s.cyl(0.05, 0.42, s.soft, 'z'); r.position.set(side * 0.108, -len, 0.05);  // валик — на товщину гомілки від її осі
    /* ank(кут) — де щиколотка: гомілка лежить уздовж важеля, коліно — на осі */
    return { g: s.g, set(deg) { s.g.rotation.z = (a0 + deg) * RAD; }, ank(deg) { const a = (a0 + deg) * RAD; return [0.1, -0.1].map((z) => V(axis.x + 0.43 * Math.sin(a), axis.y - 0.43 * Math.cos(a), z)); } };
  }
  /* згинання ніг сидячи: подушка над колінами притискає стегна, валик за ахіллами йде вниз і назад */
  function legCurl(k) {
    seat(k, -0.05, 0.465, 0, 0.42, 0.44); base(k, -0.5, 0.9, -0.4, 0.4);
    const bk = k.pad(0.08, 0.66, 0.4, -0.26, 0.92, 0); bk.rotation.z = 0.2;  // спинка за спиною (до 24.10 — у ній на 4,8 см)
    const hold = k.pad(0.16, 0.07, 0.4, 0.3, 0.71, 0); post(k, 0.3, 0.32, 0.012, 0.75, 0.05); k.rod(V(0.3, 0.75, 0.32), V(0.3, 0.71, 0.2), 0.02);
    const lv = kneeLever(k, V(0.4, 0.57, 0), 0.36, 90, -1), tw = tower(k, -0.62, 0.15, 1.6, 0); post(k, 0.4, 0.33, 0.012, 0.57, 0.06);
    return { set: (d) => { lv.set(-d); tw.lift(d * 0.005); return lv.ank(-d); }, hold, axis: lv.g.position, move(t) { return this.set(85 * t); } };
  }
  /* розгинання ніг: валик перед гомілками внизу, важіль іде вгору до горизонталі */
  function legExt(k) {
    seat(k, -0.05, 0.465, 0, 0.42, 0.44); base(k, -0.5, 0.75, -0.4, 0.4);
    const bk = k.pad(0.08, 0.66, 0.4, -0.24, 0.92, 0); bk.rotation.z = 0.15;  // спинка за спиною (до 24.10 — у ній на 2,8 см)
    const lv = kneeLever(k, V(0.4, 0.57, 0), 0.36, 0, 1), tw = tower(k, -0.62, 0.15, 1.6, 0); post(k, 0.4, 0.33, 0.012, 0.57, 0.06);
    return { set: (d) => { lv.set(d); tw.lift(d * 0.005); return lv.ank(d); }, axis: lv.g.position, move(t) { return this.set(85 * t); } };
  }
  /* блок (кросовер, одна стійка): шків на висоті low 0,2 · chest 1,15 · face 1,6 · high 2,0; насадки d (D-ручка), rope (канат), bar (прямий гриф);
     x — де стійка (перед людиною), rotY — повернути (паллоф, махи — стійка збоку); set(точки кистей) */
  function cable(k, o) {
    o = o || {}; const H = { low: 0.2, chest: 1.15, face: 1.6, high: 2.0 }, h = H[o.height || 'high'], s = k.sub();
    s.g.position.set(o.x === undefined ? 0.85 : o.x, 0, o.z || 0); s.g.rotation.y = (o.rotY || 0) * RAD;
    s.box(0.45, 0.04, 0.6, s.md, 0.12, 0.02, 0); s.box(0.08, 2.25, 0.12, s.m, 0, 1.125, 0); s.box(0.04, 2.1, 0.03, s.md, -0.055, 1.1, 0.075);
    const tw = tower(s, 0.2, 0, 2.1, 180); s.g.updateMatrixWorld(true);
    const car = s.sub(); car.g.position.set(-0.08, h, 0); car.box(0.07, 0.12, 0.1, car.md, 0, 0, 0); car.cyl(0.045, 0.03, car.m, 'z').position.x = -0.05;
    const wsP = () => s.g.localToWorld(V(-0.14, h, 0));
    /* насадка: початок — у кистях, +x — до шківа; трос — від точки кріплення насадки до шківа */
    const c = wire(k, 0.006), att = o.attach || 'd', A = k.sub(), tails = [], knobs = [];
    if (att === 'd') { A.cyl(0.016, 0.12, A.soft, 'z'); A.torus(0.065, 0.007, A.m, 'y').position.x = 0.06; }
    if (att === 'bar') { A.cyl(0.014, 0.5, A.m, 'z'); [0.13, -0.13].forEach((z) => { A.cyl(0.02, 0.16, A.soft, 'z').position.z = z; }); A.cyl(0.02, 0.05, A.md, 'x').position.x = 0.03; }
    if (att === 'rope') for (let i = 0; i < 2; i++) { tails.push(wire(k, 0.011, k.md)); knobs.push(k.sph(0.024, k.md)); }
    k.held(A.g); knobs.forEach((m) => k.held(m));
    const reach = { d: 0.125, bar: 0.055, rope: 0 }[att];
    const set = (pts) => {
      const m = pts.length > 1 ? pts[0].clone().add(pts[1]).multiplyScalar(0.5) : pts[0].clone(), p = wsP();
      let at;
      if (att === 'rope') { const half = pts.length > 1 ? pts[0].distanceTo(pts[1]) / 2 : 0, d = p.clone().sub(m).normalize(); at = m.clone().addScaledVector(d, Math.sqrt(Math.max(0.0025, 0.3 * 0.3 - half * half))); pts.forEach((q, i) => { tails[i].set(at, q); knobs[i].position.copy(q); }); }
      else { A.g.position.copy(m); A.g.lookAt(p); A.g.rotateY(-Math.PI / 2); at = A.g.localToWorld(V(reach, 0, 0)); }
      c.set(at, p); tw.lift(Math.max(0, at.distanceTo(p) - 0.15) * 0.5);
    };
    /* place(z, rotY) — переставити стійку (вправи на один бік: другий бік — дзеркально) */
    const place = (x, z, rotY) => { s.g.position.set(x, 0, z); s.g.rotation.y = rotY * RAD; s.g.updateMatrixWorld(true); };
    return { set, place, pulley: wsP, move(t) { const p = wsP(), q = p.clone().lerp(V(0.25, 1.1, 0), 0.3 + 0.7 * t); set(att === 'd' ? [q] : [q.clone().add(V(0, 0, 0.1 + 0.15 * t)), q.clone().add(V(0, 0, -0.1 - 0.15 * t))]); } };
  }
  /* пек-дек: висока спинка; дві руки тренажера обертаються навколо вертикальних осей над плечима (z ±0,2), ручки — на рівні плечей (≈ 0,95 м);
     кут 0 — руки розведені (ручки обабіч, на лінії плечей), 105 — зведені перед грудьми. Зворотні розведення — той самий тренажер, сидиш обличчям до спинки */
  function pecDeck(k) {
    seat(k, 0.0, 0.435, 0, 0.4, 0.4); base(k, -0.6, 0.45, -0.5, 0.5);
    k.pad(0.08, 0.85, 0.36, -0.2, 1.0, 0); post(k, -0.3, 0, 0.012, 2.0); k.box(0.12, 0.06, 0.5, k.m, -0.3, 1.97, 0);
    [0.2, -0.2].forEach((z) => k.rod(V(-0.3, 1.97, z), V(0, 1.97, z), 0.025));
    const tw = tower(k, -0.62, 0, 1.85, 0), arms = [k.sub(), k.sub()];
    arms.forEach((a, i) => { const q = i ? -1 : 1; a.g.position.set(0, 1.95, q * 0.2); a.cyl(0.04, 0.06, a.md); a.rod(V(0, 0, 0), V(0, -0.08, 0), 0.02); a.rod(V(0, -0.08, 0), V(0.5, -0.08, 0), 0.02); a.rod(V(0.5, -0.08, 0), V(0.5, -0.92, 0), 0.02); k.held(a.cyl(0.02, 0.14, a.soft)).position.set(0.5, -1.0, 0); });
    const set = (deg) => { const out = []; arms.forEach((a, i) => { const th = (i ? -1 : 1) * (-90 + deg) * RAD; a.g.rotation.y = th; a.g.updateMatrixWorld(true); out.push(a.g.localToWorld(V(0.5, -1.0, 0))); }); tw.lift(Math.abs(deg) * 0.004); return out; };
    /* зворотні розведення (сидиш обличчям до спинки): руки тренажера — позаду спинки; rev(t): 0 — ручки зведені перед людиною (за спинкою), 1 — на лінії плечей (розходяться назовні) */
    const rev = (t) => { const out = []; arms.forEach((a, i) => { const th = (i ? -1 : 1) * (165 + 105 * t) * RAD; a.g.rotation.y = th; a.g.updateMatrixWorld(true); out.push(a.g.localToWorld(V(0.5, -1.0, 0))); }); tw.lift(t * 0.3); return out; };  // 165° — ручки разом перед людиною, 270° — на лінії плечей; до 24.10 дуга йшла всередину й руки перехрещувались
    return { set, rev, move(t) { return set(105 * t); } };
  }
  /* тяга з упором у груди: груди на упорі, ручки на важелях від осі вгорі спереду; дуга пласка: x 0,72 (руки випрямлені) → 0,3 (лікті позаду), висота ≈ 0,9 */
  function chestRow(k) {
    seat(k, -0.05, 0.465, 0, 0.4, 0.4); base(k, -0.4, 0.95, -0.45, 0.45);
    const cp = k.pad(0.09, 0.5, 0.34, 0.22, 0.92, 0); cp.rotation.z = -0.2; post(k, 0.33, 0, 0.012, 0.75);
    post(k, 0.85, 0, 0.012, 1.83); k.box(0.42, 0.06, 0.08, k.m, 0.66, 1.83, 0);
    const P = V(0.5, 1.8, 0.3), R = 0.9055, a0 = -83.7, a1 = -106, lv = levers(k, P, R, 0.08, true);  // ручки: x 0,6 (досяжно випрямленими руками) → 0,25
    const set = (deg) => lv.set(deg);
    return { set, a0, a1, move(t) { return set(a0 + (a1 - a0) * t); } };
  }
  /* подушка-клин для рук (Скотт, трицепс): передня грань під 45° — під плечовою частиною рук, задня — майже вертикальна, у неї впираються груди;
     лікоть висить за краєм — на осі важеля. Розміри — з пози сидячого манекена (сидіння 55 см, корпус уперед ≈ 11°: плече (0,028; 1,058),
     перед тулуба на висоті 0,8 / 0,9 м — x 0,086 / 0,118; з 24.10 усе на 6 см нижче). До 24.10 подушка була бруском і стояла всередині тулуба */
  const ARM = { sh: V(0.028, 0.998, 0), el: V(0.24, 0.786, 0) };  // з 24.10 усе на 6 см нижче: сидіння 45,5 см — стегна вже не впираються в його переднє ребро
  function armPad(k, R, grips) {
    seat(k, -0.05, 0.455, 0, 0.36, 0.36); base(k, -0.4, 0.7, -0.38, 0.38);
    k.wedge([[0.126, 0.827], [0.24, 0.712], [0.24, 0.69], [0.1, 0.69]], 0.46);  // низ клина — над стегнами (до 24.10 — 0,7: стегна в ньому на 4,2 см)
    [0.3, -0.3].forEach((z) => post(k, 0.17, z, 0.012, 0.69, 0.05));  // стійки — обабіч ніг (до 24.10 одна стійка стояла між стегнами)
    /* вісь — маточини обабіч (z ±0,3), не прутом крізь лікті (до 24.10) */
    const el = ARM.el.clone(), s = k.sub(); s.g.position.copy(el); [0.3, -0.3].forEach((z) => s.cyl(0.04, 0.05, s.md, 'z').position.z = z);
    k.rod(V(0.24, 0.69, 0.3), V(el.x, el.y, 0.3), 0.025); k.rod(V(0.24, 0.69, -0.3), V(el.x, el.y, -0.3), 0.025); k.rod(V(0.17, 0.69, 0.3), V(0.17, 0.69, -0.3), 0.025);  // опори осі
    [0.3, -0.3].forEach((z) => s.rod(V(0, 0, z), V(R, 0, z), 0.018)); k.held(s.rod(V(R, 0, 0.3), V(R, 0, -0.3), 0.012, s.md));
    grips.forEach((z) => { k.held(s.cyl(0.02, 0.12, s.soft, 'z')).position.set(R, 0, z); });
    const tw = tower(k, -0.55, 0, 1.5, 0);
    return { s, el, tw };
  }
  /* тренажер для біцепса (Скотт): кут важеля −25° (руки майже прямі, лікті трохи зігнуті) → 80° (передпліччя вгору) */
  function preacher(k) {
    const a = armPad(k, 0.27, [0.19, -0.19]), a0 = -25, a1 = 80;  // ручки трохи ширше плечей; унизу лікті трохи зігнуті (≈ 20°) — як у тренера: «повільно опускай до майже прямих рук»
    const set = (d) => { a.s.g.rotation.z = d * RAD; a.tw.lift((d - a0) * 0.004); return [0.19, -0.19].map((z) => a.s.g.localToWorld(V(0.27, 0, z))); };
    return { set, a0, a1, el: a.el, move(t) { return set(a0 + (a1 - a0) * t); } };
  }
  /* тренажер для трицепса: та сама подушка, кут важеля 100° (передпліччя вгору, біля обличчя) → −25° (руки випрямлені вниз-уперед) */
  function tricepsExt(k) {
    /* ручки на ширині плечей, як у біцепса (до 24.10 — ±0,17: плечі сходились і торкали груди) */
    const a = armPad(k, 0.27, [0.19, -0.19]), a0 = 100, a1 = -25;
    const set = (d) => { a.s.g.rotation.z = d * RAD; a.tw.lift((a0 - d) * 0.004); return [0.19, -0.19].map((z) => a.s.g.localToWorld(V(0.27, 0, z))); };
    return { set, a0, a1, el: a.el, move(t) { return set(a0 + (a1 - a0) * t); } };
  }

  return { ARM, wire, tower, chair, dumbbell, mat, door, band, step, legPress, latPull, cableRow, chestPress, shoulderPress, abduction, legCurl, legExt, cable, pecDeck, chestRow, preacher, tricepsExt };
}
