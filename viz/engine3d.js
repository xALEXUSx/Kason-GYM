/* Рушій 3D-візуалізації вправ (день 2, 24.10; слово Alexа: «це має бути візуалізація екстра класу, а не примітивні картинки»;
   «кожну модель перевіряй чи дійсно вона реалістична, чи немає багів візуалізації»).
   Спільний для демо, галереї обладнання й (далі) застосунку: манекен — один, нейтральний, для обох статей (слово Alexа 24.10),
   кістяк із розрахунком колін і ліктів (дві ланки + напрям згину), 15 груп мʼязів програми (MUSCLES у app/program.js),
   два стилі («Манекен» / «Анатомія»), перевірка реалістичності кожного кадру (lint) і картка-програвач (mountCard).
   Поза — у системі тіла (обличчям до +x, угору +y, ліворуч +z); P.rot / P.at повертають і зсувають усе тіло (бічна планка тощо). */
function VIZ3D(THREE) {
  'use strict';
  const V = (x, y, z) => new THREE.Vector3(x, y, z || 0), UP = V(0, 1, 0), RAD = Math.PI / 180;
  const lerp = (a, b, t) => a + (b - a) * t, ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
  /* кут від вертикалі в площині руху: + уперед (x), − назад */
  const dir = (a) => V(Math.sin(a * RAD), Math.cos(a * RAD), 0);
  const L = { thigh: 0.44, shin: 0.43, lumb: 0.2, chest: 0.3, neck: 0.1, ua: 0.3, fa: 0.27, hip: 0.1, sh: 0.205 };  // плечі — за межею грудей (до 24.10 стояли на її краю: рука «виростала» з грудей)
  /* дві ланки до цілі з напрямом згину (коліно / лікоть) у просторі; повертає [суглоб, кінець] */
  function ik(A, C, l1, l2, pole) {
    const AC = C.clone().sub(A); let d = AC.length(); const n = AC.normalize();
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    const a = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const p = pole.clone().sub(n.clone().multiplyScalar(pole.dot(n))).normalize();
    return [A.clone().addScaledVector(n, a).addScaledVector(p, h), A.clone().addScaledVector(n, d)];
  }
  const tmp = new THREE.Vector3();
  function place(m, a, b2) { m.position.copy(a).add(b2).multiplyScalar(0.5); tmp.copy(b2).sub(a).normalize(); m.quaternion.setFromUnitVectors(UP, tmp); }

  /* ---------- кольори з теми ---------- */
  const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const PAL = () => dark()
    ? { body: 0x9fbdb9, joint: 0x7fa29e, eq: 0x5f7f7c, eqDark: 0x3f5a57, pad: 0x2c4644, glass: 0xb7d3cf, mus: 0xd29a8a, ochre: 0xd8b878, ochre2: 0xe9d6ac, bad: 0xe08573, floor: 0x0d2b29, mat: 0x2f5a57 }
    : { body: 0x37625e, joint: 0x2a4c49, eq: 0x9aa7a5, eqDark: 0x6f7d7b, pad: 0x3c4746, glass: 0x7f9f9b, mus: 0xc0887a, ochre: 0xc8a96a, ochre2: 0xe4cf9f, bad: 0xb2382c, floor: 0xe8f0ef, mat: 0x5f8d88 };

  /* ---------- манекен ---------- */
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 16);
  function makeBody(scene, kind) {
    const pal = PAL(), ghost = kind === 'ghost';
    const solid = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.02 });
    const glass = new THREE.MeshStandardMaterial({ color: pal.glass, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
    const ghostM = new THREE.MeshStandardMaterial({ color: pal.bad, roughness: 0.5, transparent: true, opacity: 0.34, depthWrite: false });
    const bodyM = ghost ? ghostM : solid(pal.body), jointM = ghost ? ghostM : solid(pal.joint);
    const root = new THREE.Group(); scene.add(root);
    const b = { scene, root, mats: { bodyM, jointM, glass, ghost }, segs: {}, muscles: {}, all: [] };
    const add = (name, geo, mat, cast) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast && !ghost; root.add(m); m.userData.base = mat; m.userData.name = name; b.all.push(m); return m; };
    /* сегменти: [імʼя, радіус, довжина] — довжини сталі, тож капсули не розтягуємо */
    [['thighL', 0.078, L.thigh - 0.12], ['thighR', 0.078, L.thigh - 0.12], ['shinL', 0.058, L.shin - 0.1], ['shinR', 0.058, L.shin - 0.1],
      ['uaL', 0.052, L.ua - 0.09], ['uaR', 0.052, L.ua - 0.09], ['faL', 0.043, L.fa - 0.08], ['faR', 0.043, L.fa - 0.08],
      ['lumb', 0.11, L.lumb - 0.05], ['chest', 0.125, L.chest - 0.12], ['neck', 0.045, L.neck - 0.03], ['footL', 0.042, 0.13], ['footR', 0.042, 0.13]]
      .forEach(([n, r, len]) => { b.segs[n] = add(n, cap(r, len), bodyM, true); b.segs[n].userData.len = len; });
    b.segs.lumb.scale.set(1, 1, 1.32); b.segs.chest.scale.set(0.92, 1, 1.3);  // груди ≈ 32,5 см завширшки (до 24.10 — 37,5: звисла рука лягала в бік)
    b.pelvis = add('pelvis', cap(0.105, 0.16), bodyM, true); b.pelvis.rotation.x = Math.PI / 2;
    b.girdle = add('girdle', cap(0.065, 0.28), bodyM, true); b.girdle.rotation.x = Math.PI / 2;
    b.head = add('head', new THREE.SphereGeometry(0.105, 24, 16), bodyM, true); b.head.scale.set(0.95, 1.12, 0.92);
    ['shoulderL', 'shoulderR', 'kneeL', 'kneeR', 'elbowL', 'elbowR', 'handL', 'handR', 'ankleL', 'ankleR'].forEach((n) => { const r = /shoulder/.test(n) ? 0.066 : /hand/.test(n) ? 0.046 : /knee/.test(n) ? 0.07 : 0.05; b[n] = add(n, new THREE.SphereGeometry(r, 16, 12), jointM, true); });
    /* мʼязи — еліпсоїди на сегментах (у «Анатомії» видно всі, у «Манекені» — лише ті, що працюють).
       Кінцівка: +y — від верхнього суглоба до нижнього, −x — перед (так ставить place). Тулуб: +x — перед, +y — угору.
       Координати дитини множаться на сплюснення батька (lumb z 1,32; chest x 0,92, z 1,3) — числа нижче вже з поправкою. */
    if (!ghost) {
      const sph = new THREE.SphereGeometry(1, 20, 14);
      const mus = (name, parent, off, sc) => { const m = new THREE.Mesh(sph, solid(pal.mus)); m.position.copy(off); m.scale.copy(sc); parent.add(m); (b.muscles[name] = b.muscles[name] || []).push(m); m.visible = false; m.userData.sc = sc.clone(); return m; };
      ['L', 'R'].forEach((s) => {
        const ua = b.segs['ua' + s], fa = b.segs['fa' + s], th = b.segs['thigh' + s], sh = b.segs['shin' + s];
        mus('quads', th, V(-0.042, 0.02, 0), V(0.055, 0.2, 0.068));
        mus('hams', th, V(0.045, 0, 0), V(0.05, 0.19, 0.06));
        mus('calves', sh, V(0.035, -0.05, 0), V(0.04, 0.11, 0.045));  // черевце литки — у верхній половині гомілки (до 24.10 стояло внизу)
        mus('biceps', ua, V(-0.03, 0.01, 0), V(0.035, 0.12, 0.04));
        mus('triceps', ua, V(0.03, 0.01, 0), V(0.035, 0.12, 0.042));
        mus('delts', ua, V(-0.012, -0.095, 0), V(0.058, 0.068, 0.06));
        mus('reardelts', ua, V(0.03, -0.09, 0), V(0.036, 0.055, 0.05));
        mus('forearms', fa, V(0, -0.035, 0), V(0.044, 0.1, 0.047));
      });
      mus('glutes', b.segs.lumb, V(-0.075, -0.1, 0.065), V(0.075, 0.085, 0.075)); mus('glutes', b.segs.lumb, V(-0.075, -0.1, -0.065), V(0.075, 0.085, 0.075));
      mus('abs', b.segs.lumb, V(0.085, 0.03, 0), V(0.04, 0.12, 0.085));
      mus('obliques', b.segs.lumb, V(0.03, 0.01, 0.088), V(0.05, 0.1, 0.03)); mus('obliques', b.segs.lumb, V(0.03, 0.01, -0.088), V(0.05, 0.1, 0.03));
      mus('lowback', b.segs.lumb, V(-0.088, 0.02, 0.028), V(0.032, 0.1, 0.025)); mus('lowback', b.segs.lumb, V(-0.088, 0.02, -0.028), V(0.032, 0.1, 0.025));
      mus('lats', b.segs.chest, V(-0.07, -0.02, 0.105), V(0.05, 0.15, 0.06)); mus('lats', b.segs.chest, V(-0.07, -0.02, -0.105), V(0.05, 0.15, 0.06));
      mus('traps', b.segs.chest, V(-0.07, 0.12, 0), V(0.05, 0.075, 0.1));
      mus('chest', b.segs.chest, V(0.09, 0.05, 0.06), V(0.04, 0.08, 0.07)); mus('chest', b.segs.chest, V(0.09, 0.05, -0.06), V(0.04, 0.08, 0.07));
    }
    return b;
  }
  /* стиль і режим: clay — суцільний манекен; xray — напівпрозоре тіло й мʼязи всередині; showMus — підсвітити робочі.
     work — масив основних або { p: основні, s: допоміжні } (як ex.m у програмі): основні — охра з сяйвом, допоміжні — світла охра */
  function styleBody(b, style, showMus, work) {
    if (b.mats.ghost) return;
    const pal = PAL(), xr = style === 'xray', p = Array.isArray(work) ? work : (work && work.p) || [], s = Array.isArray(work) ? [] : (work && work.s) || [];
    b.all.forEach((m) => { m.material = xr ? b.mats.glass : m.userData.base; m.castShadow = !xr; });
    Object.entries(b.muscles).forEach(([name, list]) => list.forEach((m) => {
      const on = p.indexOf(name) >= 0, half = !on && s.indexOf(name) >= 0, lit = (on || half) && (showMus || xr);
      m.visible = xr || (showMus && (on || half));
      m.material.color.setHex(lit ? (on ? pal.ochre : pal.ochre2) : pal.mus);
      m.material.emissive = new THREE.Color(lit && on ? pal.ochre : 0x000000); m.material.emissiveIntensity = lit && on ? 0.28 : 0;
      m.material.transparent = xr && !lit; m.material.opacity = xr && !lit ? 0.42 : 1;
    }));
  }
  /* напрям сегмента: кут a від вертикалі в площині руху (+ уперед) і нахил убік s (+ ліворуч, до +z) */
  const dir2 = (a, s) => { const v = dir(a); if (!s) return v; const c = Math.cos(s * RAD), si = Math.sin(s * RAD); return V(v.x, v.y * c, v.y * si); };
  const qTw = new THREE.Quaternion();
  /* поза → тіло. P: pelvis, lumb, chest, head (кути), ank[2], foot[2], kneePole[2], hand[2], elbowPole[2]; P.rot [x, y, z]° і P.at — усе тіло;
     P.side — нахил корпусу вбік (°, + ліворуч), P.twist — поворот грудей навколо хребта (°, + груди праворуч, до −z), P.elev[2] — плечі вгору (м, шраги).
     J — у системі тіла; J.w(точка) — у світі (для обладнання, що тримає рука, й перевірки підлоги) */
  function poseBody(b, P) {
    const J = { hip: [], knee: [], ank: [], toe: [], heel: [], shJ: [], elb: [], hand: [] };
    const r = P.rot || [0, 0, 0]; b.root.rotation.set(r[0] * RAD, r[1] * RAD, r[2] * RAD); b.root.position.copy(P.at || V(0, 0, 0)); b.root.updateMatrixWorld(true);
    const side = P.side || 0, waist = P.pelvis.clone().addScaledVector(dir2(P.lumb, side * 0.5), L.lumb), sh = waist.clone().addScaledVector(dir2(P.chest, side), L.chest);
    place(b.segs.lumb, P.pelvis, waist); place(b.segs.chest, waist, sh);
    if (P.twist) b.segs.chest.quaternion.multiply(qTw.setFromAxisAngle(UP, P.twist * RAD));
    /* рамка грудей: уперед, ліворуч, уздовж хребта — з самої капсули (без нахилу й повороту — як до 24.10) */
    const q = b.segs.chest.quaternion, fwdChest = V(1, 0, 0).applyQuaternion(q), lat = V(0, 0, 1).applyQuaternion(q), along = V(0, 1, 0).applyQuaternion(q);
    b.pelvis.position.copy(P.pelvis);
    b.girdle.position.copy(sh).addScaledVector(along, -0.03); b.girdle.quaternion.setFromUnitVectors(UP, lat);
    const neckTop = sh.clone().addScaledVector(dir2(P.head, side), L.neck); place(b.segs.neck, sh, neckTop);
    b.head.position.copy(neckTop).addScaledVector(dir2(P.head, side), 0.1); b.head.rotation.set(side * RAD, 0, -P.head * RAD);
    ['L', 'R'].forEach((s, i) => {
      const z = i ? -1 : 1, hip = P.pelvis.clone().add(V(0, -0.02, z * L.hip));
      const [knee, ank] = ik(hip, P.ank[i], L.thigh, L.shin, P.kneePole[i]);
      place(b.segs['thigh' + s], hip, knee); place(b.segs['shin' + s], knee, ank);
      b['knee' + s].position.copy(knee); b['ankle' + s].position.copy(ank);
      /* стопа — під щиколоткою: зсув на 2,5 см у бік підошви (від коліна, поперек стопи); до 24.10 капсула стопи йшла на висоті щиколотки — підошва висіла на 2,8 см */
      const fd = P.foot[i].clone().normalize(), sd = ank.clone().sub(knee).normalize(); sd.addScaledVector(fd, -sd.dot(fd)).normalize();
      const toe = ank.clone().addScaledVector(fd, 0.16).addScaledVector(sd, 0.025), heel = ank.clone().addScaledVector(fd, -0.03).addScaledVector(sd, 0.025); place(b.segs['foot' + s], heel, toe);
      /* плечовий суглоб: трохи нижче верху грудей, ледь позаду, назовні від них; дельтоподібна «шапка» — сфера */
      const shJ = sh.clone().addScaledVector(along, -0.045 + (P.elev ? P.elev[i] : 0)).addScaledVector(fwdChest, -0.012).addScaledVector(lat, z * L.sh);
      /* лопатка: коли рука тягнеться далеко вперед чи навхрест перед грудьми, плече виходить уперед до 5 см (як у людини; до 24.10 суглоб стояв на місці — рука проходила крізь груди в тягах і жимах) */
      const toH = P.hand[i].clone().sub(shJ), reach = toH.length() / (L.ua + L.fa), fw = Math.max(0, toH.clone().normalize().dot(fwdChest)), cross = Math.max(0, -z * toH.dot(lat) / Math.max(0.05, toH.length()));
      const pro = P.protract ? P.protract[i] : 0.05 * Math.min(1, Math.max(0, (reach - 0.55) / 0.4)) * Math.min(1, fw + cross);
      shJ.addScaledVector(fwdChest, pro); b['shoulder' + s].position.copy(shJ);
      const [elb, hand] = ik(shJ, P.hand[i], L.ua, L.fa, P.elbowPole[i]);
      place(b.segs['ua' + s], shJ, elb); place(b.segs['fa' + s], elb, hand);
      J.hip.push(hip); J.knee.push(knee); J.ank.push(ank); J.toe.push(toe); J.heel.push(heel); J.shJ.push(shJ); J.elb.push(elb); J.hand.push(hand);
      b['elbow' + s].position.copy(elb); b['hand' + s].position.copy(hand);
    });
    b.root.updateMatrixWorld(true);
    J.waist = waist; J.sh = sh; J.head = b.head.position.clone(); J.fwd = fwdChest; J.lat = lat; J.w = (pt) => b.root.localToWorld(pt.clone()); return J;
  }
  /* корпус двома ланками: таз → талія → «плечова точка» sh (система тіла, площина x-y); bend — куди вигинається талія. Повертає { lumb, chest } */
  function torso2(pelvis, sh, bend) {
    const [w] = ik(pelvis, sh, L.lumb, L.chest, bend || V(-1, 0, 0)), a = (u, v) => Math.atan2(v.x - u.x, v.y - u.y) / RAD;
    return { lumb: a(pelvis, w), chest: a(w, sh) };
  }
  /* точку зі світу — в систему тіла (для цілей кистей і стоп, коли тіло повернуте P.rot) */
  const m4 = new THREE.Matrix4(), qE = new THREE.Quaternion(), eE = new THREE.Euler();
  function toLocal(P, w) {
    const r = P.rot || [0, 0, 0]; qE.setFromEuler(eE.set(r[0] * RAD, r[1] * RAD, r[2] * RAD));
    m4.compose(P.at || V(0, 0, 0), qE, V(1, 1, 1)).invert(); return w.clone().applyMatrix4(m4);
  }

  /* ---------- обладнання: примітиви (галерея й вправи — у equip3d.js) ----------
     eqKit(scene) — набір; k.sub() — рухома частина (група) зі своїм набором: k2.g.position / rotation рухають усе в ній.
     Матеріали: m — метал, md — темний, soft — оббивка, mat — килимок, band — резинка, wall — стіна; k.pad(...) — подушка */
  function eqKit(parent, mats) {
    const pal = PAL();
    const M = mats || {
      m: new THREE.MeshStandardMaterial({ color: pal.eq, roughness: 0.38, metalness: 0.45 }),
      md: new THREE.MeshStandardMaterial({ color: pal.eqDark, roughness: 0.6, metalness: 0.2 }),
      soft: new THREE.MeshStandardMaterial({ color: pal.pad, roughness: 0.8 }),  // оббивка (функція pad — подушка з неї)
      mat: new THREE.MeshStandardMaterial({ color: pal.mat, roughness: 0.95 }),
      band: new THREE.MeshStandardMaterial({ color: pal.ochre, roughness: 0.7 }),
      wall: new THREE.MeshStandardMaterial({ color: dark() ? 0x16403d : 0xdfe6e4, roughness: 0.95 })
    };
    const put = (o, cast) => { o.castShadow = cast !== false; o.receiveShadow = true; parent.add(o); return o; };
    const box = (w, h, d, mat, x, y, z) => { const o = put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || M.m)); o.position.set(x || 0, y || 0, z || 0); return o; };
    const cyl = (r, len, mat, axis) => { const o = put(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), mat || M.m)); if (axis === 'z') o.rotation.x = Math.PI / 2; if (axis === 'x') o.rotation.z = Math.PI / 2; return o; };
    const rod = (a, b2, r, mat) => { const o = cyl(r, a.distanceTo(b2), mat); place(o, a, b2); return o; };
    /* мʼяка подушка — коробка із заокругленими кутами й краями (w — по x, h — товщина по y, d — по z) */
    const pad = (w, h, d, x, y, z, mat) => {
      const bs = Math.min(h * 0.4, 0.02), r = Math.max(0.004, Math.min(0.045, Math.min(w, d) / 4) - bs), a = w / 2 - bs - r, c = d / 2 - bs - r, s = new THREE.Shape();
      s.absarc(a, c, r, 0, Math.PI / 2); s.absarc(-a, c, r, Math.PI / 2, Math.PI); s.absarc(-a, -c, r, Math.PI, 1.5 * Math.PI); s.absarc(a, -c, r, 1.5 * Math.PI, 2 * Math.PI);
      const geo = new THREE.ExtrudeGeometry(s, { depth: h - 2 * bs, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 6 });
      geo.translate(0, 0, -(h - 2 * bs) / 2); geo.rotateX(-Math.PI / 2);
      const o = put(new THREE.Mesh(geo, mat || M.soft)); o.position.set(x || 0, y || 0, z || 0); return o;
    };
    /* клин / профіль: багатокутник у площині x-y (точки [x, y]), завширшки d по z (по центру), із заокругленими краями */
    const wedge = (pts, d, mat) => {
      const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
      const bs = 0.012, geo = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * bs, bevelEnabled: true, bevelThickness: bs, bevelSize: bs * 0.6, bevelSegments: 3 });
      geo.translate(0, 0, -(d - 2 * bs) / 2); const o = put(new THREE.Mesh(geo, mat || M.soft)); o.userData.poly = pts; o.userData.half = d / 2; return o;  // для перевірки дотику — точна призма
    };
    const sph = (r, mat, x, y, z) => { const o = put(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat || M.m)); o.position.set(x || 0, y || 0, z || 0); return o; };
    const torus = (R, r, mat, axis) => { const o = put(new THREE.Mesh(new THREE.TorusGeometry(R, r, 10, 28), mat || M.md)); if (axis === 'x') o.rotation.y = Math.PI / 2; if (axis === 'y') o.rotation.x = Math.PI / 2; return o; };
    const sub = () => { const g = new THREE.Group(); parent.add(g); const k2 = eqKit(g, M); k2.g = g; return k2; };
    /* позначки для перевірки дотику: held — тримають руки (гантелі, ручки, грифи); what — назва в повідомленні */
    const held = (o) => { o.traverse((m) => { if (m.isMesh) m.userData.held = true; }); return o; };
    return Object.assign({}, M, { box, cyl, rod, pad, wedge, sph, torus, sub, held, parent });  // новий обʼєкт: M лишається лише матеріалами (до 24.10 sub() перезаписував методи батька)
  }

  /* ---------- перевірка реалістичності кожного кадру (а не лише «на око») ----------
     кути колін і ліктів — у людських межах; руки й стегна не проходять крізь тулуб; кисті й стопи там, де мають бути; стопи не в підлозі */
  function angAt(a, b2, c) { const u = a.clone().sub(b2).normalize(), w = c.clone().sub(b2).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(w)))) / RAD; }
  /* наскільки точка (з радіусом rr) заходить у тіло, м: тулуб — дві капсули зі сплюсненням (scale), голова — сплюснена сфера; 0 — не заходить */
  function inBody(b, pt, rr, parts) {
    let worst = 0, where = '';
    for (const k of parts || ['lumb', 'chest']) {
      const m = k === 'head' ? b.head : b.segs[k], loc = pt.clone().sub(m.position).applyQuaternion(m.quaternion.clone().invert());
      const len = m.userData.len || 0, r = m.geometry.parameters.radius, y = Math.max(-len / 2, Math.min(len / 2, loc.y));
      const q = V(loc.x / m.scale.x, (loc.y - y) / m.scale.y, loc.z / m.scale.z), sMin = Math.min(m.scale.x, m.scale.y, m.scale.z);
      const depth = (r - q.length()) * sMin + rr;
      if (depth > worst) { worst = depth; where = k; }
    }
    return worst > 0 ? { d: worst, k: where } : null;
  }
  const inTorso = (b, pt, rr) => inBody(b, pt, rr, ['lumb', 'chest']);
  /* найнижча точка меша тіла у світі (капсула чи сфера з поворотом і сплюсненням) — для перевірки підлоги */
  const capLen = (g) => g.parameters.height !== undefined ? g.parameters.height : g.parameters.length;  // three.js 0.180: висота капсули — height (раніше length)
  function lowY(m) { const e = m.matrixWorld.elements, pr = m.geometry.parameters, h = m.geometry.type === 'CapsuleGeometry' ? capLen(m.geometry) / 2 : 0; return e[13] - Math.abs(e[5]) * h - pr.radius * Math.hypot(e[1], e[5], e[9]); }
  /* тіло як набір куль (центри у світі): уздовж капсул через 3,5 см, у широких (тулуб) — ще й обабіч; суглоби й голова — по кулі */
  const tv = new THREE.Vector3();
  function bodySpheres(b) {
    const out = [];
    b.all.forEach((m) => {
      const g = m.geometry, pr = g.parameters, r = pr.radius, sx = m.scale.x, sy = m.scale.y, sz = m.scale.z, rr = r * Math.min(sx, sz, g.type === 'CapsuleGeometry' ? 9 : sy), name = m.userData.name;
      const ys = [], h = g.type === 'CapsuleGeometry' ? capLen(g) / 2 : 0; for (let y = -h; y <= h + 1e-6; y += h ? Math.min(0.035, h) : 1) ys.push(y); if (h && ys[ys.length - 1] < h - 1e-6) ys.push(h);
      const ox = sx * r - rr > 0.01 ? [0, (sx * r - rr) / sx, -(sx * r - rr) / sx] : [0], oz = sz * r - rr > 0.01 ? [0, (sz * r - rr) / sz, -(sz * r - rr) / sz] : [0];
      ys.forEach((y) => ox.forEach((x) => oz.forEach((z) => out.push({ p: tv.set(x, y, z).applyMatrix4(m.matrixWorld).clone(), r: rr, name }))));
    });
    return out;
  }
  /* знакова відстань до коробки й до призми-багатокутника (клин) — для перевірки обладнання */
  function sdBox(x, y, z, hx, hy, hz) { const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); }
  function sdPoly(px, py, pts) {
    let d = Infinity, sg = 1;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j], [bx, by] = pts[i], ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay, t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
      d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
      const c1 = py >= ay, c2 = py < by, c3 = ex * wy > ey * wx; if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sg = -sg;
    }
    return sg * Math.sqrt(d);
  }
  /* тіло ↔ обладнання: [{ де (частина тіла), що (меш обладнання), на скільки, м }]. Оббивка й килимок можуть прогнутися до 2,5 см, метал — до 0,8 см;
     те, що тримають руки (held: гантелі, ручки, грифи), — не рахується для кистей, передпліч і ліктів, решті тіла — до 2 см; троси й резинки (wire) — не рахуються */
  const sph3 = new THREE.Sphere(), sc3 = new THREE.Vector3(), q3 = new THREE.Quaternion(), p3 = new THREE.Vector3();
  function hitsEq(b, eqRoot, soft) {
    const meshes = [], out = [];
    eqRoot.updateMatrixWorld(true);
    eqRoot.traverse((o) => {
      if (!o.isMesh || o.userData.wire || !o.visible) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      o.matrixWorld.decompose(p3, q3, sc3); sph3.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      meshes.push({ o, inv: o.matrixWorld.clone().invert(), s: Math.min(Math.abs(sc3.x), Math.abs(sc3.y), Math.abs(sc3.z)), c: sph3.center.clone(), R: sph3.radius, lim: o.userData.held ? 0.02 : (soft || []).indexOf(o.material) >= 0 ? 0.025 : 0.008 });
    });
    bodySpheres(b).forEach((S) => {
      const arm = /^(hand|fa|elbow)/.test(S.name);
      meshes.forEach((M) => {
        if (M.o.userData.held && arm) return;
        if (S.p.distanceTo(M.c) > M.R + S.r) return;
        const lp = S.p.clone().applyMatrix4(M.inv), g = M.o.geometry, T = g.type, pr = g.parameters || {};
        let d;
        if (T === 'CylinderGeometry') { const dr = Math.hypot(lp.x, lp.z) - pr.radiusTop, dy = Math.abs(lp.y) - pr.height / 2; d = Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)); }
        else if (T === 'SphereGeometry') d = lp.length() - pr.radius;
        else if (T === 'BoxGeometry') d = sdBox(lp.x, lp.y, lp.z, pr.width / 2, pr.height / 2, pr.depth / 2);
        else if (M.o.userData.poly) { const d2 = sdPoly(lp.x, lp.y, M.o.userData.poly), dz = Math.abs(lp.z) - M.o.userData.half; d = Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0); }
        else if (T === 'TorusGeometry') return;
        else { if (!g.boundingBox) g.computeBoundingBox(); const c = g.boundingBox.getCenter(V()), e = g.boundingBox.getSize(V()).multiplyScalar(0.5); d = sdBox(lp.x - c.x, lp.y - c.y, lp.z - c.z, e.x, e.y, e.z); }
        const pen = S.r - d * M.s;
        if (pen > M.lim) out.push({ de: S.name, sho: M.o.userData.what || M.o.geometry.type.replace('Geometry', ''), d: pen });
      });
    });
    return out;
  }
  /* перевірка кожного кадру: кути, досяжність цілей, руки й стегна крізь тулуб, руки крізь голову, тіло крізь підлогу й обладнання.
     ex.ground — частини, що мають стояти / лежати на підлозі (стопи тощо) у кожному кадрі; ex.check — власні умови вправи */
  function lint(EX) {
    const out = [], sc = new THREE.Scene();
    EX.forEach((ex0) => {
      const ex = Object.create(ex0);  // власна копія: build пише в this — обладнання на картці не чіпаємо
      const eqG = new THREE.Group(); sc.add(eqG);
      const b = makeBody(sc, 'body'), k = eqKit(eqG); ex.build(k);
      const bad = {}, floor = ex.floorY || 0, fl = (v) => (v * 100).toFixed(1) + ' см';
      for (let t = 0; t <= 1.0001; t += 0.05) for (const g of [false, true]) for (const sd of ex.sides ? [0, 1] : [0]) {
        const P0 = ex.pose(t, g), P = sd ? mirrorP(P0) : P0, J = poseBody(b, P), tag = (g ? 'помилка ' : '') + (sd ? 'лівий ' : '') + 't=' + t.toFixed(2);
        const note = (key, v) => { (bad[key] = bad[key] || []).push(tag + (v ? ' ' + v : '')); };
        [0, 1].forEach((i) => {
          const ka = angAt(J.hip[i], J.knee[i], J.ank[i]), ea = angAt(J.shJ[i], J.elb[i], J.hand[i]);
          if (ka < 35) note('коліно зігнуте понад межу', Math.round(ka) + '°'); if (ea < 30) note('лікоть зігнутий понад межу', Math.round(ea) + '°');
          if (J.hand[i].distanceTo(P.hand[i]) > 0.012) note('кисть не дістає до цілі', fl(J.hand[i].distanceTo(P.hand[i])));
          if (J.ank[i].distanceTo(P.ank[i]) > 0.012) note('стопа не дістає до цілі', fl(J.ank[i].distanceTo(P.ank[i])));
          /* біля суглоба кінцівка й має трохи заходити в тулуб (як у людини); далі — майже нуль */
          if (!g) for (let f0 = 1; f0 <= 10; f0++) { const f = f0 / 10;  /* частки — цілими (до 24.10 0,1 × 3 давало 0,30000000000000004 — пахвова межа не спрацьовувала) */
            const pu = J.shJ[i].clone().lerp(J.elb[i], f), pf = J.elb[i].clone().lerp(J.hand[i], f), pt = J.hip[i].clone().lerp(J.knee[i], f);
            const h1 = inTorso(b, pu, 0.052), h2 = inTorso(b, pf, 0.043), h3 = f >= 0.4 ? inTorso(b, pt, 0.078) : null;  // верх стегна сидить у тазі — це не вада
            const cm = (h) => fl(h.d) + ' (' + h.k + ', ' + f.toFixed(1) + ')';
            if (h1 && h1.d > (f <= 0.15 ? 0.04 : f <= 0.3 ? 0.02 : 0.008)) note('плече заходить у тулуб', cm(h1));  // пахвова складка (до 9 см від суглоба) — до 2 см, як пахова в стегна; перевірено на знімку 24.10
            if (h2 && h2.d > 0.008 && !(ex.handsUnder && f >= 0.6)) note('передпліччя заходить у тулуб', cm(h2));  /* handsUnder — кисті під попереком (скручування Макгілла): так і має бути */
            if (h3 && h3.d > (f < 0.45 ? 0.02 : 0.012)) note('стегно заходить у тулуб', cm(h3));  // пахова складка — до 2 см
            const hu = f >= 0.3 ? inBody(b, pu, 0.052, ['head']) : null, hf = inBody(b, pf, 0.043, ['head']), hh = f > 0.95 ? inBody(b, J.hand[i], 0.046, ['head']) : null;
            if (hu && hu.d > 0.008) note('плече заходить у голову', cm(hu)); if (hf && hf.d > 0.008) note('передпліччя заходить у голову', cm(hf)); if (hh && hh.d > 0.008) note('кисть у голові', cm(hh));
          }
        });
        if (!g) {
          const low = b.all.filter((m) => lowY(m) < floor - 0.006).map((m) => m.userData.name + ' ' + fl(floor - lowY(m)));
          if (low.length) note('тіло в підлозі', low.slice(0, 3).join(', '));
          (ex.ground || []).forEach((n) => { const m = b.all.find((x) => x.userData.name === n), y = lowY(m) - floor; if (y > 0.02) note('висить над підлогою', n + ' ' + fl(y)); });
          if (ex.after) ex.after(P, J);
          const hs = hitsEq(b, eqG, [k.soft, k.mat]); if (hs.length) { hs.sort((a, c) => c.d - a.d); note('тіло крізь обладнання', hs.slice(0, 2).map((h) => h.de + '→' + h.sho + ' ' + fl(h.d)).join(', ')); }
        }
        if (ex.check) ex.check(P, J, note, g);  // власні умови вправи (гриф не крізь голову тощо)
      }
      sc.remove(eqG); sc.remove(b.root);
      out.push({ ex: ex.name, bad: Object.fromEntries(Object.entries(bad).map(([key, v]) => [key, v.length + ' кадр(ів): ' + v.slice(0, 3).join('; ')])) });
    });
    return out;
  }

  /* ---------- картка-програвач: сцена, світло, тінь, тіло, «помилка», поворот пальцем ----------
     o: { canvas, ex, style() → 'clay' | 'xray', reduce, onFrame(ph, t, st) }; повертає { st, frame, size, rebuild, set } */
  /* рендерер і сцена зі світлом і тінню (спільні для картки й галереї) */
  function renderer3(canvas) {
    const opt = { antialias: true, alpha: true, preserveDrawingBuffer: !canvas }; if (canvas) opt.canvas = canvas;  // без canvas — власний (галерея копіює кадр у картки)
    const r = new THREE.WebGLRenderer(opt);
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    return r;
  }
  function stage(span) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 30), w = span || 1.8;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c6c4, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.2, 4.2, 3.2); key.castShadow = true;
    key.shadow.mapSize.set(512, 512); /* 512: на картці (до 440 px) оком так само, а в Safari симулятора тренажери — 25–33 кадри замість 17–22: прохід тіней найдорожчий (день 6) */ Object.assign(key.shadow.camera, { left: -w, right: w, top: 2.6, bottom: -0.6 }); key.shadow.radius = 5; key.shadow.bias = -0.0005; scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfeeea, 0.7); rim.position.set(-2.5, 2.5, -2); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(w + 0.3, 48), new THREE.ShadowMaterial({ opacity: 0.2 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    return { scene, camera, floor };
  }
  /* дзеркало пози (вправи на один бік: спершу правий, потім лівий — у тому самому циклі): z → −z, лівий ↔ правий; P.mirror — для after() */
  function mirrorP(P) {
    const f = (v) => (v && v.isVector3 ? V(v.x, v.y, -v.z) : v), Q = {};
    Object.keys(P).forEach((k) => {
      const v = P[k];
      if (Array.isArray(v) && v.length === 2 && ['ank', 'foot', 'kneePole', 'hand', 'elbowPole', 'protract', 'elev'].indexOf(k) >= 0) Q[k] = [f(v[1]), f(v[0])];
      else Q[k] = f(v);
    });
    if (P.rot) Q.rot = [-P.rot[0], -P.rot[1], P.rot[2]];
    if (P.side) Q.side = -P.side; if (P.twist) Q.twist = -P.twist; if (P.wi !== undefined) Q.wi = 1 - P.wi;
    Q.mirror = !P.mirror; return Q;
  }
  /* сцена вправи без рендерера (картка й атлас): тіло, «помилка», обладнання, камера — задана або за габаритами руху.
     ex.sides — цикл двічі: правий бік, потім лівий (дзеркало); ex.loop — безперервний рух (ходьба), t = 0…1 рівно за t1 с */
  function exScene(ex) {
    const st0 = stage(ex.span || 2.0), scene = st0.scene, camera = st0.camera, floor = st0.floor, ex1 = Object.create(ex);
    let ghost, body, eq;
    const build = () => { eq = new THREE.Group(); scene.add(eq); ex1.build(eqKit(eq)); ghost = makeBody(scene, 'ghost'); body = makeBody(scene, 'body'); };
    build();
    /* loop + sides (валізна прогулянка): t1 с одним боком, потім t1 с другим */
    const one = 0.5 + ex.t1 + 0.3 + ex.t2, cyc = ex.loop ? ex.t1 * (ex.sides ? 2 : 1) : ex.sides ? 2 * one : one;
    function tAt(s) {
      s = ((s % cyc) + cyc) % cyc;
      if (ex.loop) { const side = ex.sides && s >= ex.t1 ? 1 : 0; return { t: (s - side * ex.t1) / ex.t1, ph: 1, side }; }
      const side = ex.sides && s >= one ? 1 : 0; if (side) s -= one;
      if (s < 0.5) return { t: 0, ph: 1, side }; s -= 0.5;
      if (s < ex.t1) return { t: ease(s / ex.t1), ph: 1, side }; s -= ex.t1;
      if (s < 0.3) return { t: 1, ph: 2, side }; s -= 0.3;
      return { t: 1 - ease(s / ex.t2), ph: 2, side };
    }
    const poseAt = (t, g, side) => { const P = ex1.pose(t, g); return side ? mirrorP(P) : P; };
    let target, base;
    if (ex.cam) { target = V(...ex.look); base = V(...ex.cam).sub(target); }
    else {
      /* за габаритами: кадри t 0 / ½ / 1 (і другий бік), тіло й обладнання; ціль — центр, відстань — щоб усе влізло (34° по вертикалі, 4:3) */
      const bx = new THREE.Box3(), sp = new THREE.Sphere();
      [0, 0.5, 1].forEach((t) => [0, ex.sides ? 1 : 0].forEach((sd) => { const P = poseAt(t, false, sd), J = poseBody(body, P); if (ex1.after) ex1.after(P, J); body.root.updateMatrixWorld(true); bx.expandByObject(body.root); bx.expandByObject(eq); }));
      bx.getBoundingSphere(sp); target = sp.center.clone();
      base = V(...(ex.dir || [1, 0.5, 1.15])).normalize().multiplyScalar(sp.radius / Math.sin(17 * RAD) * (ex.zoom || 1.04));
    }
    /* кадр — за людиною (з 3.27.8; слово Alexа 26.10: «…збільшити такі моделі трішки бо погано видно, на 20-30%»). До 3.27.8 камера (target, base вище)
       брала в кадр кулю навколо тіла й усього обладнання — двері, тренажер, — і людина виходила дрібною (замір 27.10: медіана 55 % висоти кадру,
       найменше — 32 %). Тепер у кадрі — кулі сегментів тіла, того, що в руках (held: гантелі, ручки), і частин «помилки» в 9 фазах руху (й на обох боках);
       для кожного кута огляду (YAW_GRID — межа повороту пальцем у застосунку) — своя ціль і відстань: уся людина з полем FIT_M, краї обладнання можуть
       обрізатись. Наближаємо не більш ніж у FIT_MAX раза проти колишнього кадру з того самого кута (Alex: «на 20–30 %»: ближче губиться обладнання,
       на якому вправа; 1,26 відстані — це до +30 % зросту в кадрі: ближні частини тіла в перспективі ростуть трохи більше). camFlip — лише перший бік: другий — дзеркало сцени й камери (кадр той самий) */
    const FIT_M = 0.06, FIT_MAX = 1.26, YAW_GRID = 1.4, YAW_STEP = 0.1;
    const sph = [], grab = (m) => { const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); sph.push(g.boundingSphere.clone().applyMatrix4(m.matrixWorld)); };
    const gpOf = (sd) => (sd ? ex.ghost.map((n) => n.replace(/L$/, '#').replace(/R$/, 'L').replace(/#$/, 'R')) : ex.ghost);
    for (let i = 0; i <= 8; i++) [0, ex.sides && !ex.camFlip ? 1 : 0].forEach((sd, k, a) => {
      if (k && a[0] === sd) return;
      const t = i / 8, P = poseAt(t, false, sd), J = poseBody(body, P); if (ex1.after) ex1.after(P, J);
      body.root.updateMatrixWorld(true); eq.updateMatrixWorld(true);
      body.all.forEach(grab); eq.traverse((m) => { if (m.isMesh && m.userData.held) grab(m); });
      if (ex.ghost.length) { const gp = gpOf(sd); poseBody(ghost, poseAt(t, true, sd)); ghost.root.updateMatrixWorld(true); ghost.all.forEach((m) => { if (gp.indexOf(m.userData.name) >= 0) grab(m); }); }
    });
    const ctr = new THREE.Box3(); sph.forEach((s) => ctr.expandByPoint(s.center)); const c0 = ctr.getCenter(V(0, 0, 0));
    const tv = Math.tan(17 * RAD) * (1 - FIT_M), th = tv * 4 / 3;
    function fit(yaw) {
      const bo = base.clone().applyAxisAngle(UP, yaw), d = bo.clone().normalize(), f = d.clone().negate();
      const rt = V(0, 0, 0).crossVectors(f, UP).normalize(), up = V(0, 0, 0).crossVectors(rt, f), c = c0.clone(), p = V(0, 0, 0);
      let D = 0;
      for (let pass = 0; pass < 3; pass++) {
        D = 0; sph.forEach((s) => { p.copy(s.center).sub(c); const z = p.dot(f); D = Math.max(D, (Math.abs(p.dot(up)) + s.radius) / tv - z, (Math.abs(p.dot(rt)) + s.radius) / th - z); });
        if (pass === 2) break;
        /* ціль — на середину видимого: тоді поле однакове з обох боків і людина більша */
        let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
        sph.forEach((s) => { p.copy(s.center).sub(c); const z = D + p.dot(f), x = p.dot(rt), y = p.dot(up); u0 = Math.min(u0, (x - s.radius) / z); u1 = Math.max(u1, (x + s.radius) / z); v0 = Math.min(v0, (y - s.radius) / z); v1 = Math.max(v1, (y + s.radius) / z); });
        c.addScaledVector(rt, (u0 + u1) / 2 * D).addScaledVector(up, (v0 + v1) / 2 * D);
      }
      D = Math.max(D, target.clone().add(bo).distanceTo(c) / FIT_MAX);  // не ближче, ніж FIT_MAX × колишній кадр з того самого кута
      return { c, pos: c.clone().addScaledVector(d, D) };
    }
    const grid = []; for (let y = -YAW_GRID; y <= YAW_GRID + 1e-9; y += YAW_STEP) grid.push(fit(y));
    function camAt(yaw) {
      const u = (Math.max(-YAW_GRID, Math.min(YAW_GRID, yaw || 0)) + YAW_GRID) / YAW_STEP, i = Math.min(grid.length - 2, Math.floor(u)), k = u - i, a = grid[i], b = grid[i + 1];
      return { c: a.c.clone().lerp(b.c, k), pos: a.pos.clone().lerp(b.pos, k) };
    }
    function draw(sec, v, style, yaw) {
      const f = tAt(sec);
      styleBody(body, style, v === 'mus', ex.work);
      /* помилка — лише та частина тіла, де вона є (інакше червоне перекриває правильну позу); другий бік — дзеркальні частини.
         Спершу «помилка», потім правильна поза: тренажер, який рухає поза, лишається в правильному положенні */
      const show = v === 'bad', gp = f.side ? ex.ghost.map((n) => n.replace(/L$/, '#').replace(/R$/, 'L').replace(/#$/, 'R')) : ex.ghost;
      ghost.all.forEach((m) => { m.visible = show && gp.indexOf(m.userData.name) >= 0; });
      if (show) poseBody(ghost, poseAt(f.t, true, f.side));
      const P = poseAt(f.t, false, f.side), J = poseBody(body, P); if (ex1.after) ex1.after(P, J);
      /* camFlip — обладнання з одного боку (крісло під рукою): на другому боці камера дзеркалиться разом зі сценою, тож кадр той самий */
      const fl = ex.camFlip && f.side, k = camAt(yaw);  /* як до 3.27.8: дзеркало кадру першого боку з того самого кута */
      if (fl) { k.c.z = -k.c.z; k.pos.z = -k.pos.z; }
      camera.position.copy(k.pos); camera.lookAt(k.c);
      return f;
    }
    const rebuild = () => { scene.remove(...scene.children.filter((c) => (c.isMesh || c.isGroup) && c !== floor)); build(); };
    return { scene, camera, draw, cyc, rebuild, tAt, poseAt };
  }
  /* картка з власним рендерером (демо): o: { canvas, ex, style() → 'clay' | 'xray', reduce, onFrame(ph, t, st, side) } */
  function mountCard(o) {
    const { canvas, ex } = o, renderer = renderer3(canvas), X = exScene(ex);
    const st = { v: 'move', play: !o.reduce, t0: performance.now(), tp: 0, yaw: 0, vis: true };
    function size() { const w = canvas.clientWidth || 340, h = Math.round(w * 3 / 4); renderer.setSize(w, h, false); X.camera.aspect = w / h; X.camera.updateProjectionMatrix(); }
    function frame() { const f = X.draw(st.tp / 1000, st.v, o.style(), st.yaw); renderer.render(X.scene, X.camera); if (o.onFrame) o.onFrame(f.ph, f.t, st, f.side); }
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: st.yaw }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (!drag) return; st.yaw = Math.max(-1.2, Math.min(1.2, drag.yaw - (e.clientX - drag.x) * 0.01)); if (!st.play) frame(); });
    canvas.addEventListener('pointerup', () => { drag = null; });
    if (window.IntersectionObserver) new IntersectionObserver((es) => es.forEach((x) => { st.vis = x.isIntersecting; })).observe(canvas);
    size(); frame();
    const rebuild = () => { X.rebuild(); frame(); };
    /* для перевірок: кадр на секунді sec, режим, кут огляду */
    const set = (sec, v, yaw) => { st.play = false; st.tp = sec * 1000; if (v) st.v = v; if (yaw !== undefined) st.yaw = yaw; frame(); };
    return { st, frame, size, rebuild, set, renderer, cyc: X.cyc };
  }

  /* сидить на сидінні (верх top — поверхня сидіння): спина під кутом lumb / chest (− — назад, до спинки), стопи — на підлозі перед собою або в ank, кисті — у hands */
  const seated = (o) => {
    const pelvis = V(o.x || 0, o.top + 0.095, 0),  /* кульшові суглоби ≈ 7,5 см над сидінням, таз прогинає оббивку на 1 см (до 24.10 — +0,06: таз заходив у сидіння на 4,5 см) */ lumb = o.lumb === undefined ? -3 : o.lumb, chest = o.chest === undefined ? lumb : o.chest, fx = o.feetX === undefined ? pelvis.x + 0.46 : o.feetX;
    return { pelvis, lumb, chest, head: o.head === undefined ? chest * 0.5 : o.head, ank: o.ank || [V(fx, 0.08, 0.16), V(fx, 0.08, -0.16)],  /* щиколотка 8 см — підошва на основі тренажера (1,2 см) чи на підлозі */
      foot: o.foot || [V(1, 0, 0.18).normalize(), V(1, 0, -0.18).normalize()], kneePole: o.kneePole || [V(1, 0.6, 0.18), V(1, 0.6, -0.18)],
      hand: o.hands, elbowPole: o.elbowPole || [V(-0.3, -1, 0.6), V(-0.3, -1, -0.6)] };
  };
  /* стоїть рівно, руки вздовж тіла — для масштабу в галереї */
  const standing = () => ({ pelvis: V(0, 0.93, 0), lumb: 0, chest: 0, head: 0, ank: [V(0, 0.07, 0.11), V(0, 0.07, -0.11)], foot: [V(0.985, 0, 0.17), V(0.985, 0, -0.17)],
    kneePole: [V(1, 0, 0.1), V(1, 0, -0.1)], hand: [V(0.02, 0.84, 0.25), V(0.02, 0.84, -0.25)], elbowPole: [V(-1, 0, 0.3), V(-1, 0, -0.3)] });

  /* мапа відновлення мʼязів (з 3.24.0, пункт 1; слово Alexа 25.10: «… включаючи нові записи та 3д візуалізації»): два манекени стоять рівно —
     спереду (ліворуч) і ззаду (праворуч), як на 2D-мапі. Мʼяз, що відпочиває (rec[мʼяз].rest — менше restH год від тренування), — охра,
     свіжіший світиться сильніше (left / restH); готовий — звичайний колір мʼязів. rec — з ENGINE.recovery. Сцена статична — малюється на дію */
  function recScene(rec, restH) {
    const st0 = stage(1.3), scene = st0.scene, camera = st0.camera, floor = st0.floor;
    let bodies = [];
    const build = () => {
      const pal = PAL();
      bodies = [0, 180].map((ry, k) => { const b = makeBody(scene, 'body'), P = standing(); P.rot = [0, ry, 0]; P.at = V(0, 0, k ? -0.5 : 0.5); poseBody(b, P); return b; });
      bodies.forEach((b) => Object.entries(b.muscles).forEach(([name, list]) => list.forEach((m) => {
        const r = rec[name], f = r && r.rest ? Math.max(0.2, Math.min(1, r.left / (restH || 48))) : 0;
        m.visible = true; m.material.color.setHex(f ? pal.ochre : pal.mus);
        m.material.emissive = new THREE.Color(f ? pal.ochre : 0x000000); m.material.emissiveIntensity = f ? 0.1 + 0.3 * f : 0;
      })));
    };
    build();
    /* кадр: обидва тіла цілком (34° по вертикалі, 4:3) з невеликим запасом; камера трохи вище пояса */
    const bx = new THREE.Box3(); bodies.forEach((b) => { b.root.updateMatrixWorld(true); bx.expandByObject(b.root); });
    const target = bx.getCenter(V(0, 0, 0)), sz = bx.getSize(V(0, 0, 0)), t17 = Math.tan(17 * RAD);
    const base = V(1, 0.12, 0).normalize().multiplyScalar(Math.max(sz.y / 2 / t17, sz.z / 2 / (t17 * 4 / 3)) * 1.1 + sz.x / 2);
    function draw(yaw) { camera.position.copy(target).add(base.clone().applyAxisAngle(UP, yaw || 0)); camera.lookAt(target); }
    const rebuild = () => { scene.remove(...scene.children.filter((c) => (c.isMesh || c.isGroup) && c !== floor)); build(); };
    return { scene, camera, draw, rebuild, bodies };
  }

  return { THREE, V, UP, RAD, lerp, ease, dir, L, ik, place, dark, PAL, makeBody, styleBody, poseBody, eqKit, angAt, inTorso, inBody, lowY, hitsEq, torso2, toLocal, dir2, lint, renderer3, stage, exScene, mirrorP, mountCard, standing, seated, recScene };
}
