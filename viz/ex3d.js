/* Вправи для 3D-візуалізації (дні 3–4, 24.10; слово Alexа: «роби день 3 та 4»): усі 53 вправи програм + тяга зверху на колінах + 6 варіантів = 60.
   Поза за t (0 — старт, 1 — крайня точка), g — поза з помилкою (червоним — лише частини ghost; порожньо — помилку видно лише в тексті).
   id і v — як у застосунку (app/program.js, app/generator.js; v — варіант); work — мʼязи з програми (m: p — основні, s — допоміжні).
   Рух — з тексту тренера (app/coach.js: Положення / Рух), помилка — перша з «Чого не робити», яку видно оком. Обладнання — equip3d.js.
   sides — один підхід на обидва боки: правий, потім лівий (дзеркало, з 3.21.9); loop — безперервно (ходьба). Камера — за габаритами руху (exScene), якщо не задана. */
function EX3D(E, Q) {
  'use strict';
  const { V, lerp, dir, L, RAD, THREE } = E;
  const MUS = { chest: 'Груди', delts: 'Плечі', reardelts: 'Задні дельти', biceps: 'Біцепс', triceps: 'Трицепс', forearms: 'Передпліччя', traps: 'Трапеції', lats: 'Спина',
    lowback: 'Поперек', abs: 'Прес', obliques: 'Косі', glutes: 'Сідниці', quads: 'Квадрицепс', hams: 'Задня поверхня стегна', calves: 'Литки' };
  const mk = (o) => Object.assign({ t1: 2, t2: 1.5, ghost: [], key: o.id + (o.v ? ':' + o.v : ''), mus: o.work.p.map((m) => MUS[m]).join(' · ') }, o);
  const both = (x, y, z) => [V(x, y, z), V(x, y, -z)];
  const eps = (x, y, z) => [V(x, y, z), V(x, y, -z)];  // напрям згину (лікті / коліна), лівий +z
  const ARMS = ['shoulderL', 'shoulderR', 'uaL', 'uaR', 'faL', 'faR', 'elbowL', 'elbowR', 'handL', 'handR'], TORSO = ['lumb', 'chest', 'neck', 'head', 'pelvis', 'girdle', 'shoulderL', 'shoulderR'];
  const LEGS = ['thighL', 'thighR', 'shinL', 'shinR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'footL', 'footR'];
  /* стоячи: таз 0,95 (коліна ≈ 162°), щиколотки 0,07 (стопа — під ними), стопи на ширині w, носки назовні a° */
  const feet = (x, w, a) => ({ ank: both(x, 0.07, w), foot: [V(Math.cos(a * RAD), 0, Math.sin(a * RAD)), V(Math.cos(a * RAD), 0, -Math.sin(a * RAD))], kneePole: eps(1, 0.1, Math.sin(a * RAD) * 1.3) });
  const stand = (o) => Object.assign({ pelvis: V(o.px || 0, o.py || 0.95, 0), lumb: o.lumb || 0, chest: o.chest === undefined ? (o.lumb || 0) : o.chest, head: o.head || 0,
    hand: o.hand, elbowPole: o.ep || eps(-1, -0.3, 0.3) }, feet(o.fx || 0, o.fw || 0.11, o.fa === undefined ? 10 : o.fa), o.extra || {});
  /* плечові суглоби пози (як у poseBody, без лопатки) — щоб ставити кисті відносно плечей */
  const shOf = (P) => { const w = P.pelvis.clone().addScaledVector(dir(P.lumb), L.lumb), sh = w.clone().addScaledVector(dir(P.chest), L.chest), f = V(Math.cos(P.chest * RAD), -Math.sin(P.chest * RAD), 0);
    return [1, -1].map((z) => sh.clone().addScaledVector(dir(P.chest), -0.045).addScaledVector(f, -0.012).add(V(0, 0, z * L.sh))); };
  /* тіло з поворотом (лежачи, на боці, навкарачки): rot (°), at — де таз у світі; цілі кистей і стоп, напрями згину — у світі → у систему тіла */
  const qInv = (P) => { const r = P.rot || [0, 0, 0]; return new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * RAD, r[1] * RAD, r[2] * RAD)).invert(); };
  function world(P, w) {
    const q = qInv(P), out = Object.assign({}, P);
    ['ank', 'hand'].forEach((k) => { if (w[k]) out[k] = w[k].map((v) => E.toLocal(P, v)); });
    ['kneePole', 'elbowPole', 'foot'].forEach((k) => { if (w[k]) out[k] = w[k].map((v) => v.clone().applyQuaternion(q)); });
    return out;
  }
  /* руки на рукоятях тренажера: ручки повертає сам тренажер (it.move / set) */
  const seat = (o) => E.seated(o);

  /* ---------- на килимку ----------
     на спині: тіло повернуте на 90° навколо z (голова — до −x), таз у at; спина на килимку (0,008 + 0,115). Кисті й стопи — у світі (world). */
  const AX = 0.3, BACK = 0.123, MATY = 0.008;
  const supine = (o) => ({ rot: [0, 0, 90], at: V(o.ax === undefined ? AX : o.ax, o.y === undefined ? BACK : o.y, 0), pelvis: V(0, 0, 0), lumb: o.lumb || 0, chest: o.chest === undefined ? (o.lumb || 0) : o.chest, head: o.head === undefined ? (o.chest || 0) * 0.6 : o.head });
  const shS = (ax) => [V(ax - 0.455, 0.111, 0.205), V(ax - 0.455, 0.111, -0.205)];  // плечові суглоби лежачи на спині
  const kneesUp = (ax, d) => ({ ank: both(ax + (d || 0.5), 0.078, 0.14), foot: both(1, 0, 0.15).map((v) => v.normalize()), kneePole: eps(0, 1, 0.15) });
  const matK = (k, x) => Q.mat(k, { x: x === undefined ? AX - 0.1 : x });
  /* гантель у кисті: вісь поперек тіла (z) чи вздовж (x) */
  const dbAt = (db, p, axis) => { db.g.position.copy(p); db.g.rotation.set(axis === 'x' ? 0 : Math.PI / 2, 0, axis === 'x' ? Math.PI / 2 : 0); };
  /* кут корпусу лежачи (у системі тіла: + — угору від килимка) і точка на ньому — для кистей, що рухаються з грудьми */
  const onChest = (P, along, out, z) => { const w = P.pelvis.clone().addScaledVector(dir(P.lumb), L.lumb), c = P.chest * RAD; return w.clone().add(V(Math.sin(c) * along + Math.cos(c) * out, Math.cos(c) * along - Math.sin(c) * out, z)); };
  /* обличчям донизу (віджимання, навкарачки): голова — до +x, ліворуч — +z; th — нахил тіла, ° (+ — голова вище таза) */
  const prone = (at, th, o) => Object.assign({ rot: [0, 0, -90 + th], at, pelvis: V(0, 0, 0), lumb: 0, chest: 0, head: 0 }, o || {});
  /* на правому боці (бічна планка): праве плече внизу, обличчя до +z, голова до +x; th — нахил тіла, ° (+ — голова вище стоп) */
  const sideRot = (th) => { const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), th * RAD).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2)));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ'); return [e.x / RAD, e.y / RAD, e.z / RAD]; };
  /* віджимання: тіло — пряма від опори (коліна чи носки) до лінії плечей і обертається навколо опори; кисті стоять трохи ширше плечей, на рівні низу грудей.
     Лінія плечей угорі 0,615 (руки майже прямі), унизу 0,22 (груди ≈ 10 см над килимком); помилка — таз провисає на 7 см, поперек прогнутий */
  function pushPose(t, g, toes) {
    const pv = toes ? V(-0.55, 0.19, 0) : V(-0.15, 0.078, 0), R = toes ? 1.335 : 0.915, th = (y) => Math.asin((y - pv.y) / R) / RAD;
    const a = lerp(th(0.615), th(0.22), t), u = V(Math.cos(a * RAD), Math.sin(a * RAD), 0), hx = pv.x + R * Math.cos(th(0.22) * RAD) - 0.05;
    const P = prone(pv.clone().addScaledVector(u, R - 0.455), a, g ? { pelvis: V(0.07, 0, 0), lumb: -20 } : {}); P.protract = [0.02, 0.02];
    const w = { hand: both(hx, 0.054, 0.285), elbowPole: eps(-0.6, 0.5, 0.6) };
    if (toes) { const f = V(0.574, -0.819, 0); Object.assign(w, { ank: both(pv.x, pv.y, 0.1), foot: [f, f.clone()], kneePole: [V(0, -1, 0), V(0, -1, 0)] }); }
    else { const k = (z) => V(pv.x - 0.39, pv.y + 0.182, z), f = V(-0.98, 0.2, 0).normalize(); Object.assign(w, { ank: [k(0.1), k(-0.1)], foot: [f, f.clone()], kneePole: [V(0, -1, 0), V(0, -1, 0)] }); }
    return world(P, w);
  }
  /* бічна планка (правий бік — на правому лікті): тіло — пряма від опори (стопи одна на одній чи коліна) до плечей; лікоть під плечем, передпліччя вперед на килимку, ліва кисть — на стегні.
     Нахил тіла — з умов опори (лікоть 0,058, праве плече 0,358, права щиколотка 0,06 / праве коліно 0,078). t: таз провис (униз, поперек лінії тіла) → пряма.
     У русі провис малий — 3,5 см з ніг, 4,5 см з колін: лікоть і стопи стоять, корпус і прямі ноги не розтягуються, а поворот таза ще й відсуває кульшовий суглоб
     (до 24.10 було 10 см — стопа не діставала на 2,9 см). Помилка — провис 9 см: її ноги не малюються, тож ціль стопи підтягнута до досяжної (стегна дивляться туди ж) */
  function sidePose(t, g, feet) {
    const th = feet ? 19.4 : 26, c = Math.cos(th * RAD), sn = Math.sin(th * RAD), u = V(c, sn, 0), lat = V(-sn, c, 0);
    const S = V(0.75, 0.358 + 0.205 * c, 0), pel = S.clone().addScaledVector(u, -0.455), hip = pel.clone().addScaledVector(u, -0.02);
    const h = g ? 0.09 : (feet ? 0.035 : 0.045) * (1 - t), at = S.clone().addScaledVector(u, -Math.sqrt(0.455 * 0.455 - h * h)).addScaledVector(lat, -h), ut = S.clone().sub(at).normalize();
    const P = { rot: sideRot(Math.atan2(ut.y, ut.x) / RAD), at, pelvis: V(0, 0, 0), lumb: 0, chest: 0, head: 0 };
    const shR = S.clone().addScaledVector(lat, -0.205), w = { hand: [V(0, 0, 0), V(shR.x, 0.054, 0.258)], elbowPole: [V(0, 1, 0), V(0, -1, -0.9).normalize()] };
    if (feet) { const ac = hip.clone().addScaledVector(u, -0.86); Object.assign(w, { ank: [ac.clone().addScaledVector(lat, 0.05), ac.clone().addScaledVector(lat, -0.05)], foot: [V(0, 0, 1), V(0, 0, 1)], kneePole: [V(0, 0, 1), V(0, 0, 1)] }); }
    else {
      /* коліна одне на одному (±0,07 від осі), стегно рівно 0,44 від кульшового суглоба (±0,1); гомілки назад на килимку, коліно ≈ 117° */
      const knee = (z) => hip.clone().addScaledVector(lat, 0.1 * z).addScaledVector(u.clone().multiplyScalar(-1).addScaledVector(lat, -0.03 * z / 0.44).normalize(), 0.44);
      const kL = knee(1), kR = knee(-1), sh = V(-0.5, 0, -0.866), f = V(-1, 0, -0.4).normalize(), ank = (k) => k.clone().addScaledVector(sh, 0.43);
      const pole = (k, z) => { const hp = hip.clone().addScaledVector(lat, 0.1 * z), ln = ank(k).sub(hp).normalize(), v = k.clone().sub(hp); return v.addScaledVector(ln, -v.dot(ln)).normalize(); };
      Object.assign(w, { ank: [ank(kL), ank(kR)], foot: [f, f.clone()], kneePole: [pole(kL, 1), pole(kR, -1)] });
    }
    if (g) { const lt = V(-ut.y, ut.x, 0); w.ank = w.ank.map((a, i) => { const hp = at.clone().addScaledVector(ut, -0.02).addScaledVector(lt, i ? -0.1 : 0.1), d = a.clone().sub(hp); return hp.addScaledVector(d.normalize(), Math.min(a.distanceTo(hp), 0.865)); }); }
    const out = world(P, w); out.hand[0] = V(0.04, 0.03, 0.235); out.elbowPole[0] = V(-0.4, 0.2, 1).normalize(); return out;  /* верхня рука — у системі тіла: кисть на стегні, лікоть угору */
  }

  /* ---------- гантелі ---------- */
  const UPV = V(0, 1, 0);
  /* гантель уздовж напрямку v (вісь гантелі — local y) */
  const dbDir = (db, p, v) => { db.g.position.copy(p); db.g.quaternion.setFromUnitVectors(UPV, v.clone().normalize()); };
  /* кисті звисають під плечима (0,55 — лікті ледь зігнуті); dz — назовні від плеча, dx — уперед */
  const hang = (P, dz, dx, len) => shOf(P).map((s, i) => s.clone().add(V(dx || 0, -(len || 0.55), (i ? -1 : 1) * (dz || 0))));  // dz ≥ 0,06: пряма рука з плеча (z 0,205) інакше йде в груди на 1–2 см
  /* перед ноги (стегно чи гомілка — вісь + радіус) на висоті y: гантель у тягах ковзає вздовж ніг, а не крізь них */
  const legFront = (P, y) => { const hip = P.pelvis.clone().add(V(0, -0.02, 0.1)), kn = E.ik(hip, P.ank[0], L.thigh, L.shin, P.kneePole[0])[0];
    const [a, b, r] = y >= kn.y ? [hip, kn, 0.078] : [kn, P.ank[0], 0.058], f = Math.max(0, Math.min(1, (a.y - y) / Math.max(1e-6, a.y - b.y))); return a.x + (b.x - a.x) * f + r; };
  /* присід до крісла (сидіння 0,4625 — таз 0,575): таз назад і вниз, корпус ≈ 35°, коліна за носками; помилка — коліна всередину */
  const squat = (t, g) => { const P = stand({ px: lerp(0, -0.27, t), py: lerp(0.95, 0.575, t), lumb: lerp(3, 38, t), chest: lerp(3, 30, t), head: lerp(0, 12, t), fw: 0.15, fa: 18 });
    if (g) P.kneePole = eps(1, 0.1, -0.7 * t); return P; };
  /* згинання: лікті біля боків (ez від осі), передпліччя від a0° (униз) до a1°; кисті внизу — hz від осі (поруч стегна чи сидіння), угорі — над ліктями */
  const curlPose = (P, t, a0, a1, ez, hz) => { const sh = shOf(P), a = lerp(a0, a1, t) * RAD;
    P.hand = sh.map((s, i) => V(s.x + 0.05 + 0.26 * Math.cos(a), s.y - 0.29 + 0.26 * Math.sin(a), (i ? -1 : 1) * lerp(hz, ez - 0.01, t)));
    P.elbowPole = eps(-1, -0.3, 0.55); P.t = t; return P; };
  const sw1 = (t) => Math.sin(Math.PI * Math.min(1, t * 1.2));  // розгойдування корпусу (помилка)
  /* вісь гантелі ⟂ передпліччю в площині руху — нейтральний хват (молотки) */
  const perpF = (J, i) => { const f = J.hand[i].clone().sub(J.elb[i]); return V(-f.y, f.x, 0).normalize(); };
  /* одвірок для опори рукою: стійка 10 × 6 см заввишки 2,05 м, внутрішня грань — на z0; окремий вузол у початку координат — для дзеркала другого боку.
     До 24.10 тут була стіна 2,4 × 2,4 м — на другому боці вона ставала між камерою й людиною */
  const jamb = (k, x, z0) => { const s = k.sub(); s.box(0.1, 2.05, 0.06, s.m, x, 1.025, z0 + Math.sign(z0) * 0.03); return s; };
  /* дверна рама з порогом (підйом на носок): стійки на z ±0,47, поріг — Q.step без стіни */
  const doorway = (k, x) => { const s = k.sub(); [0.47, -0.47].forEach((z) => s.box(0.1, 2.05, 0.05, s.m, x, 1.025, z + Math.sign(z) * 0.025)); s.box(0.1, 0.05, 1.04, s.m, x, 2.075, 0); return s; };
  /* розщеплений присід: ліва рука ковзає по одвірку ліворуч (z 0,62), гантель — у правій, звисає збоку */
  const splitArms = (P, hx) => { const sh = shOf(P); P.hand = [V(hx, sh[0].y - 0.28, 0.572), sh[1].clone().add(V(0.03, -0.54, -0.1))]; P.elbowPole = [V(-0.4, -1, 0.3), V(-1, 0, -0.3)]; return P; };  // гантель — назовні від переднього стегна
  const splitAfter = (o, P, J) => { o.w.g.scale.z = P.mirror ? -1 : 1; dbAt(o.db, J.hand[P.mirror ? 0 : 1], 'x'); };
  /* хода на місці: n кроків-циклів за t1; стопа в опорі 60 % циклу (їде назад), 40 % — у перенесенні (угору на 7 см і вперед); o.side — нахил убік (помилка) */
  const walk = (t, n, o) => {
    const q = (t * n) % 1, leg = (d) => { const p = (q + d) % 1; if (p < 0.6) { const s = p / 0.6; return [lerp(0.17, -0.17, s), 0.07, 0]; } const s = (p - 0.6) / 0.4; return [lerp(-0.17, 0.17, s), 0.07 + 0.07 * Math.sin(Math.PI * s), Math.sin(Math.PI * s)]; };
    const a = leg(0), b = leg(0.5), P = stand(Object.assign({ py: 0.93 + 0.012 * Math.cos(4 * Math.PI * q), fw: 0.1, fa: 6 }, o || {}));
    P.ank = [V(a[0], a[1], 0.1), V(b[0], b[1], -0.1)]; P.foot = [a, b].map((l, i) => V(1, 0.35 * l[2], (i ? -1 : 1) * 0.08).normalize()); P.kneePole = eps(1, 0, 0.1);
    if (o && o.side) P.side = o.side; return P;
  };

  /* ---------- резинка з кріпленням до дверей ---------- */
  /* двері збоку (паллоф, ротація, відведення): площина дверей z = side·wx (−1 — праворуч, +1 — ліворуч); окремий вузол — дзеркало другого боку.
     anchor — кріплення у світі: той самий вектор, що в Q.band, тож flip() переносить і кріплення */
  const doorSide = (k, side, wx, h) => { const m = k.sub(), s = m.sub(); Q.door(s, { x: wx, h }); s.g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const a0 = V(0, h, side * (wx - 0.035)), anchor = a0.clone(); return { g: m.g, anchor, flip(mr) { m.g.scale.z = mr ? -1 : 1; anchor.set(a0.x, a0.y, mr ? -a0.z : a0.z); } }; };
  const SIDEV = [0.2, 0.42, 1];  // двері попереду: камера збоку — стіна з дверима не стає між камерою й людиною
  /* тяга зверху: кисті від витягнутих угору-вперед (до кріплення над дверима) до рівня підборіддя, лікті — до боків */
  const pullHands = (P, t) => { P.hand = shOf(P).map((s, i) => { const z = i ? -1 : 1; return V(s.x + lerp(0.2, 0.12, t), s.y + lerp(0.5, 0.14, t), s.z + z * lerp(-0.04, 0.08, t)); }); P.elbowPole = eps(-0.2, -1, 1); return P; };

  return [
    /* ===================== на килимку ===================== */
    mk({ id: 'floorpress', grp: 'mat', name: 'Жим лежачи на підлозі', work: { p: ['chest'], s: ['triceps', 'delts'] },
      t1: 2.4, t2: 1.2, c1: 'Опускай до легкого дотику ліктями підлоги', c2: 'Пауза — і вичавлюй угору', bad: '✕ Не розводь лікті під прямим кутом', ghost: ARMS,
      build(k) { matK(k); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const sh = shS(AX), P = Object.assign(supine({}), {});
        const top = sh.map((s, i) => V(s.x + 0.02, 0.64, (i ? -1 : 1) * 0.19)), bot = sh.map((s, i) => V(s.x + (g ? 0 : 0.07), 0.3, (i ? -1 : 1) * (g ? 0.46 : 0.33)));
        return world(P, Object.assign(kneesUp(AX), { hand: top.map((v, i) => v.clone().lerp(bot[i], t)), elbowPole: g ? eps(0, -0.3, 1) : eps(0.5, -1, 0.8) }));
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.w(J.hand[i]), 'z')); } }),
    mk({ id: 'floorfly', grp: 'mat', name: 'Розведення лежачи на підлозі', work: { p: ['chest'], s: ['delts'] },
      t1: 2.4, t2: 1.4, c1: 'Розводь руки по дузі до дотику плечима підлоги', c2: 'Зводь, ніби обіймаєш бочку', bad: '✕ Не випрямляй лікті', ghost: ARMS,
      build(k) { matK(k); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const sh = shS(AX), R = g ? 0.565 : 0.5, a = lerp(8, 78, t) * RAD;
        const hand = sh.map((s, i) => V(s.x + 0.03, s.y + R * Math.cos(a), s.z + (i ? -1 : 1) * R * Math.sin(a) - (i ? -1 : 1) * 0.1 * (1 - t)));
        return world(supine({}), Object.assign(kneesUp(AX), { hand, elbowPole: eps(0.3, 0.1, 1) }));  /* лікті — назовні, не в підлогу */
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.w(J.hand[i]), 'x')); } }),
    mk({ id: 'pullover', grp: 'mat', name: 'Пуловер лежачи на підлозі', work: { p: ['lats'], s: ['chest'] },
      t1: 2.4, t2: 1.6, c1: 'Опускай за голову по дузі до розтягнення', c2: 'Повертай тим самим шляхом', bad: '✕ Не прогинай поперек', ghost: ['lumb', 'chest', 'pelvis'],
      build(k) { matK(k, AX - 0.3); this.db = Q.dumbbell(k); },
      pose(t, g) {
        const sh = shS(AX), a = lerp(8, 92, t) * RAD, R = 0.5, c = V(sh[0].x, sh[0].y, 0);
        const hc = c.clone().add(V(-R * Math.sin(a), R * Math.cos(a), 0));
        const P = supine({ lumb: g ? 14 * t : 0, chest: g ? -10 * t : 0 });
        return world(P, Object.assign(kneesUp(AX), { hand: [hc.clone().add(V(0, 0, 0.055)), hc.clone().add(V(0, 0, -0.055))], elbowPole: eps(0.2, 0.2, 1) }));
      },
      after(P, J) { const c = J.w(J.hand[0]).add(J.w(J.hand[1])).multiplyScalar(0.5); this.db.g.position.copy(c).add(V(0, 0.02, 0)); this.db.g.rotation.set(0, 0, 0); } }),
    mk({ id: 'skull', grp: 'mat', name: 'Французький жим лежачи', work: { p: ['triceps'], s: [] },
      t1: 2.2, t2: 1.3, c1: 'Згинай лише в ліктях — гантелі до скронь', c2: 'Розгинай, плечі нерухомі', bad: '✕ Не рухай плечима', ghost: ARMS,
      build(k) { matK(k); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const sh = shS(AX), ua = (8 + (g ? 32 * t : 0)) * RAD, fa = (8 + 102 * t + (g ? 32 * t : 0)) * RAD;
        const hand = sh.map((s, i) => { const e = V(s.x - 0.3 * Math.sin(ua), s.y + 0.3 * Math.cos(ua), (i ? -1 : 1) * 0.17); return e.add(V(-0.27 * Math.sin(fa), 0.27 * Math.cos(fa), 0)); });
        return world(supine({}), Object.assign(kneesUp(AX), { hand, elbowPole: eps(0.1, 1, 0.15) }));
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.w(J.hand[i]), 'z')); } }),
    mk({ id: 'closegrip', grp: 'mat', name: 'Жим вузьким хватом лежачи', work: { p: ['triceps'], s: ['chest'] },
      t1: 2.4, t2: 1.2, c1: 'Опускай до дотику ліктями підлоги, лікті біля тулуба', c2: 'Вичавлюй, не розводячи ліктів', bad: '✕ Не розводь лікті', ghost: ARMS,
      build(k) { matK(k); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const sh = shS(AX), top = sh.map((s, i) => V(s.x + 0.04, 0.63, (i ? -1 : 1) * 0.12)), bot = sh.map((s, i) => V(s.x + 0.12, 0.3, (i ? -1 : 1) * (g ? 0.3 : 0.15)));
        return world(supine({}), Object.assign(kneesUp(AX), { hand: top.map((v, i) => v.clone().lerp(bot[i], t)), elbowPole: g ? eps(0, -0.3, 1) : eps(0.7, -1, 0.6) }));  /* лікті біля тулуба, не в ньому */
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.w(J.hand[i]), 'x')); } }),
    mk({ id: 'crunch', grp: 'mat', name: 'Скручування на підлозі', work: { p: ['abs'], s: [] },
      t1: 1.4, t2: 1.8, c1: 'Підіймай лопатки, а не всю спину', c2: 'Повільно опускайся', bad: '✕ Не підіймай усю спину — поперек на підлозі', ghost: ['lumb', 'chest', 'neck', 'head', 'pelvis', 'girdle'],
      build(k) { matK(k); },
      pose(t, g) {
        const P = supine({ lumb: g ? 34 * t : 0, chest: (g ? 58 : 30) * t, head: (g ? 66 : 40) * t });
        P.hand = [onChest(P, 0.2, 0.14, 0.08), onChest(P, 0.24, 0.14, -0.08)]; P.elbowPole = eps(0.4, 0, 1);
        return world(P, kneesUp(AX, 0.46));
      } }),
    mk({ id: 'crunchw', grp: 'mat', name: 'Скручування з гантеллю на грудях', work: { p: ['abs'], s: [] },
      t1: 1.4, t2: 1.8, c1: 'Підіймай лопатки, гантель на грудях', c2: 'Повільно опускайся', bad: '✕ Не підіймай усю спину — поперек на підлозі', ghost: ['lumb', 'chest', 'neck', 'head', 'pelvis', 'girdle'],
      build(k) { matK(k); this.db = Q.dumbbell(k); },
      pose(t, g) {
        const P = supine({ lumb: g ? 34 * t : 0, chest: (g ? 58 : 30) * t, head: (g ? 66 : 40) * t });
        P.hand = [onChest(P, 0.2, 0.2, 0.1), onChest(P, 0.2, 0.2, -0.1)]; P.elbowPole = eps(0.4, 0, 1); P.dbc = onChest(P, 0.2, 0.21, 0);
        return world(P, kneesUp(AX, 0.46));
      },
      after(P, J) { this.db.g.position.copy(J.w(P.dbc)); const r = (P.rot || [0, 0, 0]); this.db.g.rotation.set(Math.PI / 2, 0, 0); } }),
    mk({ id: 'curlup', grp: 'mat', name: 'Скручування Макгілла', work: { p: ['abs'], s: [] }, handsUnder: true,
      t1: 1.2, t2: 1.5, c1: 'Трохи підніми голову й плечі, шия нерухома', c2: 'Тримай 8–10 секунд — і опустись', bad: '✕ Не підіймайся високо', ghost: ['chest', 'neck', 'head', 'girdle', 'shoulderL', 'shoulderR'],
      build(k) { matK(k); },
      pose(t, g) {
        const P = supine({ chest: (g ? 34 : 9) * t, head: (g ? 40 : 9) * t });
        return world(P, { ank: [V(AX + 0.5, 0.078, 0.14), V(AX + 0.86, 0.06, -0.1)], foot: [V(1, 0, 0.15).normalize(), V(0.2, 1, 0).normalize()], kneePole: [V(0, 1, 0.15), V(0, 1, 0)],
          hand: [V(AX - 0.12, 0.06, 0.07), V(AX - 0.12, 0.06, -0.07)], elbowPole: eps(0.3, 0, 1) });
      } }),
    mk({ id: 'deadbug', grp: 'mat', name: 'Мертвий жук', work: { p: ['abs'], s: ['obliques'] }, sides: true,
      t1: 2, t2: 1.6, c1: 'Повільно опускай протилежні руку й ногу', c2: 'Видих — і назад', bad: '✕ Не відривай поперек від підлоги', ghost: ['lumb', 'chest', 'pelvis'],
      build(k) { matK(k); },
      pose(t, g) {
        const sh = shS(AX), up = sh.map((s) => V(s.x + 0.02, 0.66, s.z)), down = V(sh[0].x - 0.52, 0.17, 0.2);
        const kneeUp = (z) => V(AX + 0.43, 0.56, z), legDown = V(AX + 0.86, 0.14, -0.1);
        return world(supine({ lumb: g ? 14 * t : 0, chest: g ? -8 * t : 0 }), { hand: [up[0].clone().lerp(down, t), up[1]], elbowPole: eps(0, 0.3, 1),
          ank: [kneeUp(0.1), kneeUp(-0.1).lerp(legDown, t)], foot: [V(0.2, 1, 0.1).normalize(), V(0.2, 1, -0.1).normalize().lerp(V(1, 0.4, -0.1).normalize(), t).normalize()], kneePole: [V(-0.3, 1, 0.1), V(-0.3, 1, -0.1)] });
      } }),
    mk({ id: 'bridge', grp: 'mat', name: 'Сідничний міст з гантеллю', work: { p: ['glutes'], s: ['hams'] },
      t1: 1.3, t2: 2, c1: 'Підніми таз до лінії плечі — коліна', c2: 'Пауза, повільно вниз', bad: '✕ Не прогинай поперек угорі', ghost: ['pelvis', 'lumb', 'chest', 'thighL', 'thighR'],
      build(k) { matK(k); this.db = Q.dumbbell(k); },
      pose(t, g) {
        const h = lerp(BACK, 0.4 + (g ? 0.07 * t : 0), t), a = Math.asin((BACK - h) / 0.5) / RAD, px = AX;
        const P = Object.assign(supine({ y: h, lumb: a + (g ? 16 * t : 0), chest: a - (g ? 6 * t : 0), head: 0 }), {});
        P.dbc = V(0.18, 0.05, 0); P.hand = [V(0.18, 0.06, 0.17), V(0.18, 0.06, -0.17)]; P.elbowPole = eps(-0.4, 0.1, 1);  /* гантель лежить на тазових кістках — не в тазі й не на стегнах */
        return world(P, { ank: both(px + 0.42, 0.078, 0.14), foot: both(1, 0, 0.15).map((v) => v.normalize()), kneePole: eps(0.3, 1, 0.15) });
      },
      after(P, J) { this.db.g.position.copy(J.w(P.dbc)); this.db.g.rotation.set(Math.PI / 2, 0, 0); } }),
    mk({ id: 'bridge', v: 'c', grp: 'mat', name: 'Сідничний міст · плечі на кріслі', work: { p: ['glutes'], s: ['hams'] },
      t1: 1.3, t2: 2, c1: 'Підніми таз до лінії плечі — коліна', c2: 'Пауза, повільно вниз', bad: '✕ Не прогинай поперек угорі', ghost: ['pelvis', 'lumb', 'chest', 'thighL', 'thighR'],
      build(k) { this.ch = Q.chair(k, { x: -0.42 }); this.db = Q.dumbbell(k); },
      pose(t, g) {
        /* опора — верх спини на ребрі сидіння: лінія корпусу дотична до ребра на товщину тулуба (0,115); угорі спина лежить на сидінні.
           До 24.10 груди проходили крізь сидіння на 7–12 см */
        const C = V(-0.2, 0.4625, 0), sy = 0.4625 + 0.115, h = lerp(0.2, sy + (g ? 0.06 * t : 0), t), sa = Math.max(0, Math.min(0.99, (sy - h) / 0.5)), ca = Math.sqrt(1 - sa * sa);
        const tan = sa > 0.01 ? Math.min(-0.15, C.x + ((C.y - sy) * ca + 0.115) / sa) : -0.27, w = Math.max(0, Math.min(1, (0.35 - sa) / 0.2)), sx = lerp(tan, -0.27, w);
        const a = Math.asin(sa) / RAD, px = sx + 0.5 * ca;
        const P = supine({ ax: px, y: h, lumb: a + (g ? 16 * t : 0), chest: a - (g ? 6 * t : 0), head: a - 10 });
        /* гантель — на тазових кістках, перпендикулярно до попереку: що крутіше нахилений корпус унизу, то далі вона від живота й ближче до голови (до 24.10 сиділа в попереку на 7,8 см, потім — у стегнах) */
        const ka = Math.max(0, P.lumb) * RAD, kc = Math.cos(ka), ks = Math.sin(ka), ko = 0.18 + 0.04 * ks, kl = 0.05 + 0.08 * ks;
        P.dbc = V(kc * ko + ks * kl, -ks * ko + kc * kl, 0); P.hand = [P.dbc.clone().add(V(0, 0.01, 0.17)), P.dbc.clone().add(V(0, 0.01, -0.17))]; P.elbowPole = eps(-0.4, 0.1, 1);  /* гантель лежить на тазових кістках — не в тазі й не на стегнах */
        return world(P, { ank: both(0.72, 0.078, 0.15), foot: both(1, 0, 0.15).map((v) => v.normalize()), kneePole: eps(0.3, 1, 0.15) });
      },
      after(P, J) { this.db.g.position.copy(J.w(P.dbc)); this.db.g.rotation.set(Math.PI / 2, 0, 0); } }),
    mk({ id: 'pushup', grp: 'mat', name: 'Віджимання · з колін', work: { p: ['chest'], s: ['triceps', 'delts', 'abs'] },
      t1: 1.6, t2: 1.2, c1: 'Опускайся грудьми до підлоги, лікті ≈ 45° до тулуба', c2: 'Відштовхнись — тіло рівне', bad: '✕ Не провисай у попереку', ghost: ['pelvis', 'lumb', 'thighL', 'thighR'],
      build(k) { Q.mat(k, { x: 0.15 }); }, pose(t, g) { return pushPose(t, g, false); } }),
    mk({ id: 'pushup', v: 't', grp: 'mat', name: 'Віджимання · з носків', work: { p: ['chest'], s: ['triceps', 'delts', 'abs'] },
      t1: 1.6, t2: 1.2, c1: 'Опускайся грудьми до підлоги, лікті ≈ 45° до тулуба', c2: 'Відштовхнись — тіло рівне від голови до пʼят', bad: '✕ Не провисай у попереку', ghost: ['pelvis', 'lumb', 'thighL', 'thighR'],
      build(k) { Q.mat(k, { x: 0.15 }); }, pose(t, g) { return pushPose(t, g, true); } }),
    mk({ id: 'birddog', grp: 'mat', name: 'Птах-собака', work: { p: ['lowback', 'glutes'], s: ['abs'] }, sides: true,
      t1: 1.6, t2: 1.6, c1: 'Витягни протилежні руку й ногу в лінію з корпусом', c2: 'Тримай 8–10 секунд — і повернись', bad: '✕ Не задирай ногу вище корпусу', ghost: ['thighL', 'shinL', 'kneeL', 'ankleL', 'footL'],
      build(k) { Q.mat(k, { x: 0.05 }); },
      pose(t, g) {
        /* навкарачки: коліна під тазом (стегно 0,44 від коліна 0,078), долоні під плечима, руки прямі — плечі на 10 см вище таза; правий бік — права рука й ліва нога */
        const a = 12.7, u = V(Math.cos(a * RAD), Math.sin(a * RAD), 0), hipY = 0.518, at = V(0, hipY + 0.02 * u.y, 0), hip = at.clone().addScaledVector(u, -0.02), S = at.clone().addScaledVector(u, 0.455);
        const P = prone(at, a); P.protract = [0.015, 0.015];
        const ph = lerp(-90, a, t) * RAD, arm = V(S.x + 0.55 * Math.cos(ph), S.y + 0.55 * Math.sin(ph), -0.205);
        const k0 = (z) => V(hip.x - 0.415, 0.2, z), lg = (g ? lerp(0, 24, t) : 0) * RAD, leg = k0(0.1).lerp(V(hip.x - 0.85 * Math.cos(lg), hipY + 0.85 * Math.sin(lg), 0.1), t);
        const tuck = V(0.5, -0.866, 0), f0 = tuck.clone().lerp(V(0, -1, 0), t).normalize();
        return world(P, { hand: [V(S.x, 0.054, 0.2), arm], elbowPole: [V(-1, 0, 0.2).normalize(), V(-1, -0.6, -0.2).normalize()],
          ank: [leg, k0(-0.1)], foot: [f0, tuck.clone()], kneePole: [V(0, -1, 0), V(0, -1, 0)] });
      } }),
    mk({ id: 'sideplank', grp: 'mat', name: 'Бічна планка · з колін', work: { p: ['obliques'], s: ['abs'] }, sides: true,
      t1: 1.4, t2: 1.8, c1: 'Підніми таз до прямої лінії', c2: 'Тримай, дихай рівно — і опусти', bad: '✕ Не провисай тазом', ghost: ['pelvis', 'lumb', 'thighL', 'thighR'],
      build(k) { Q.mat(k, { x: 0.25, z: -0.08 }); }, pose(t, g) { return sidePose(t, g, false); } }),
    mk({ id: 'sideplank', v: 'f', grp: 'mat', name: 'Бічна планка · з ніг', work: { p: ['obliques'], s: ['abs'] }, sides: true,
      t1: 1.4, t2: 1.8, c1: 'Підніми таз до прямої лінії', c2: 'Тримай, дихай рівно — і опусти', bad: '✕ Не провисай тазом', ghost: ['pelvis', 'lumb', 'thighL', 'thighR'],
      build(k) { Q.mat(k, { x: 0.25 }); }, pose(t, g) { return sidePose(t, g, true); } }),
    /* ===================== гантелі: стоячи й на кріслі ===================== */
    mk({ id: 'goblet', grp: 'db', name: 'Присідання до крісла · гоблет', work: { p: ['quads', 'glutes'], s: ['abs'] },
      t1: 2.2, t2: 1.2, c1: 'Таз назад і вниз — до дотику сидіння', c2: 'Одразу вгору, не сідаючи', bad: '✕ Не зводь коліна всередину', ghost: LEGS,
      build(k) { this.ch = Q.chair(k, { x: -0.47 }); this.db = Q.dumbbell(k); },
      pose(t, g) {
        const P = squat(t, g), c = P.chest * RAD, w = P.pelvis.clone().addScaledVector(dir(P.lumb), L.lumb), al = V(Math.sin(c), Math.cos(c), 0), fr = V(Math.cos(c), -Math.sin(c), 0);
        P.dbc = w.addScaledVector(al, 0.16).addScaledVector(fr, 0.27); P.hand = both(0, 0, 0.06).map((v) => v.add(P.dbc).add(V(0, 0.021, 0))); P.elbowPole = eps(-0.2, -1, 0.85);
        return P;
      },
      after(P, J) { this.db.g.position.copy(P.dbc); this.db.g.rotation.set(0, 0, 0); } }),
    mk({ id: 'goblet', v: 's2', grp: 'db', name: 'Присідання до крісла · 2 гантелі на плечах', work: { p: ['quads', 'glutes'], s: ['abs'] },
      t1: 2.2, t2: 1.2, c1: 'Таз назад і вниз — до дотику сидіння', c2: 'Одразу вгору, не сідаючи', bad: '✕ Не зводь коліна всередину', ghost: LEGS,
      build(k) { this.ch = Q.chair(k, { x: -0.47 }); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        /* гантелі стоять нижнім диском на плечах, вісь — уперед і трохи вгору, кисть — на грифі */
        const P = squat(t, g), c = P.chest * RAD, al = V(Math.sin(c), Math.cos(c), 0), fr = V(Math.cos(c), -Math.sin(c), 0);
        P.hand = shOf(P).map((s, i) => s.clone().addScaledVector(al, 0.14).addScaledVector(fr, 0.14).add(V(0, 0, (i ? -1 : 1) * 0.035)));
        P.ax = fr.clone().addScaledVector(al, 0.45).normalize(); P.elbowPole = [fr.clone().addScaledVector(al, -1).add(V(0, 0, 0.4)), fr.clone().addScaledVector(al, -1).add(V(0, 0, -0.4))];
        return P;
      },
      after(P, J) { this.db.forEach((d, i) => dbDir(d, J.hand[i], P.ax)); } }),
    mk({ id: 'rdl', grp: 'db', name: 'Румунська тяга', work: { p: ['hams', 'glutes'], s: ['lowback'] },
      t1: 2.2, t2: 1.3, c1: 'Таз назад, гантелі ковзають уздовж ніг', c2: 'Угору — стискаючи сідниці', bad: '✕ Не округлюй поперек', ghost: TORSO,
      build(k) { this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const a = lerp(3, 70, t), P = stand({ px: lerp(0, -0.17, t), py: lerp(0.95, 0.91, t), lumb: a - (g ? 12 * t : 0), chest: a + (g ? 26 * t : 0), head: a * 0.5 + (g ? 14 * t : 0), fw: 0.11, fa: 6 });
        P.hand = hang(P, 0.06, 0); P.hand.forEach((h) => { h.x = Math.max(h.x, legFront(P, h.y) + 0.1); }); P.elbowPole = eps(-1, 0, 0.3); return P;
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.hand[i], 'z')); } }),
    mk({ id: 'slrdl', grp: 'db', name: 'Румунська тяга на одній нозі', work: { p: ['hams', 'glutes'], s: ['lowback'] }, sides: true, camFlip: true,  // одвірок — позаду людини й на другому боці
      t1: 2.2, t2: 1.5, c1: 'Нахиляйся тазом назад, вільна нога — назад у лінію з корпусом', c2: 'Угору — стискаючи сідницю', bad: '✕ Не розкривай таз', ghost: ['thighL', 'shinL', 'kneeL', 'ankleL', 'footL'],
      build(k) { this.w = jamb(k, 0.3, -0.6); this.db = Q.dumbbell(k); },
      pose(t, g) {
        /* правий бік: стоїть на правій, ліва йде назад, гантель — у лівій руці, права — на одвірку праворуч */
        const a = lerp(3, 76, t), P = stand({ px: lerp(0, -0.09, t), py: lerp(0.94, 0.92, t), lumb: a - 3, chest: a, head: a * 0.5, fw: 0.1, fa: 6 });
        P.pelvis.z = -0.035; const hipL = P.pelvis.clone().add(V(0, -0.02, 0.1)), la = a * RAD;
        P.ank = [hipL.clone().add(V(-0.845 * Math.sin(la), -0.845 * Math.cos(la), g ? 0.15 * t : 0)), V(0, 0.07, -0.1)]; P.ank[0].y = Math.max(P.ank[0].y, 0.075 + 0.17 * Math.sin(la));  /* носок не черкає підлогу */
        const fd = V(Math.cos(la), -Math.sin(la), 0); P.foot = [fd, V(1, 0, -0.1).normalize()]; P.kneePole = [g ? V(0.3, -0.2, 1) : fd.clone().add(V(0, 0, 0.1)), V(1, 0, -0.1)];
        P.hand = [hang(P, 0.1, 0.02)[0], V(0.3, lerp(1.1, 0.86, t), -0.552)];  /* права ковзає по одвірку вниз */  /* гантель — трохи назовні: стегно вільної ноги йде назад повз неї */ P.elbowPole = [V(-1, -0.2, 0.3), V(-0.6, -1, -0.2)]; return P;
      },
      after(P, J) { this.w.g.scale.z = P.mirror ? -1 : 1; dbAt(this.db, J.hand[P.mirror ? 1 : 0], 'x'); } }),
    mk({ id: 'shrug', grp: 'db', name: 'Шраги стоячи', work: { p: ['traps'], s: ['forearms'] },
      t1: 1.1, t2: 1.6, c1: 'Плечі прямо вгору до вух', c2: 'Пауза — і повільно вниз', bad: '✕ Не нахиляйся вперед', ghost: TORSO.concat(ARMS),
      build(k) { this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const e = 0.065 * t, P = stand({ lumb: g ? 14 * t : 0, chest: g ? 22 * t : 0, head: g ? 10 * t : 0, fw: 0.12 }); P.elev = [e, e];
        P.hand = hang(P, 0.035, 0.01).map((h) => h.add(V(0, e, 0))); P.elbowPole = eps(-1, 0, 0.3); return P;
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.hand[i], 'x')); } }),
    mk({ id: 'lateral', grp: 'db', name: 'Махи в сторони стоячи', work: { p: ['delts'], s: [] },
      t1: 1.3, t2: 2.2, c1: 'Піднімай у сторони до рівня плечей — ведуть лікті', c2: 'Вниз — дві-три секунди', bad: '✕ Не допомагай корпусом', ghost: TORSO,
      build(k) { this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const sw = g ? Math.sin(Math.PI * Math.min(1, t * 1.15)) : 0, P = stand({ lumb: -12 * sw, chest: -17 * sw, fw: 0.13 }), sh = shOf(P), a = (7 + 83 * t) * RAD, R = 0.53;
        P.hand = sh.map((s, i) => V(s.x + lerp(0.1, 0.05, t), s.y - R * Math.cos(a), s.z + (i ? -1 : 1) * (0.03 + R * Math.sin(a)))); P.elbowPole = eps(-0.4, -0.6, 1); return P;
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.hand[i], 'x')); } }),
    mk({ id: 'hammer', grp: 'db', name: 'Молотки', work: { p: ['biceps', 'forearms'], s: [] },
      t1: 1.3, t2: 2, c1: 'Згинай, не обертаючи кисть', c2: 'Вниз — повільно', bad: '✕ Не розгойдуйся', ghost: TORSO.concat(ARMS),
      build(k) { this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) { return curlPose(stand({ fw: 0.12, lumb: g ? -14 * sw1(t) : 0, chest: g ? -20 * sw1(t) : 0 }), t, -74, 45, 0.235, 0.27); },
      after(P, J) { this.db.forEach((d, i) => dbDir(d, J.hand[i], perpF(J, i))); } }),
    mk({ id: 'bentrow', grp: 'db', name: 'Тяга двох гантелей у нахилі', work: { p: ['lats', 'reardelts'], s: ['biceps', 'lowback'] },
      t1: 1.3, t2: 2, c1: 'Тягни гантелі до пояса, лікті вздовж тулуба', c2: 'Повільно опускай до прямих рук', bad: '✕ Не округлюй спину', ghost: TORSO,
      build(k) { this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const P = stand({ px: -0.15, py: 0.9, lumb: g ? 44 : 56, chest: g ? 84 : 60, head: g ? 50 : 32, fw: 0.12, fa: 8 }), sh = shOf(P), c = P.chest * RAD, al = V(Math.sin(c), Math.cos(c), 0);
        P.hand = sh.map((s, i) => { const lo = s.clone().add(V(0.02, -0.55, (i ? -1 : 1) * 0.06)), hi = s.clone().addScaledVector(al, -0.24).add(V(0, -0.15, (i ? -1 : 1) * 0.07)); return lo.lerp(hi, t); });
        P.hand.forEach((h) => { h.x = Math.max(h.x, legFront(P, h.y) + 0.1); }); P.elbowPole = eps(-0.6, 1, 0.25); return P;
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.hand[i], 'z')); } }),
    mk({ id: 'calf', grp: 'db', name: 'Підйом на носок однією ногою', work: { p: ['calves'], s: [] }, sides: true, dir: [-0.5, 0.42, 1],  // ззаду-збоку — видно пʼяту, рама за людиною, а не перед нею
      t1: 1.2, t2: 2, c1: 'Повністю вгору на носок, пауза', c2: 'Повільно вниз нижче порога — до розтягнення', bad: '✕ Не скорочуй амплітуду', ghost: ['thighR', 'shinR', 'kneeR', 'ankleR', 'footR'],
      build(k) { this.st = Q.step(k, { x: 0.05, wall: false }); this.dw = doorway(k, 0.05); },
      pose(t, g) {
        /* правий бік: подушечка правої стопи на ребрі порога, пʼята звисає; угорі стопа обертається навколо кінчиків пальців. Ліва нога зігнута позаду, ліва рука — на дверній рамі */
        const ph = (g ? lerp(-4, 12, t) : lerp(-20, 34, t)) * RAD, fd = V(Math.cos(ph), -Math.sin(ph), 0), sd = V(fd.y, -fd.x, 0);
        const ank = ph < 0 ? V(-0.11, 0.1, 0).addScaledVector(fd, -0.12).addScaledVector(sd, -0.067) : V(-0.07, 0.1, 0).addScaledVector(fd, -0.16).addScaledVector(sd, -0.067);
        const P = stand({ px: ank.x + 0.03, py: ank.y + 0.865, fw: 0.1 }); P.pelvis.z = -0.06;
        P.ank = [P.pelvis.clone().add(V(-0.3, -0.62, 0.11)), V(ank.x, ank.y, -0.1)]; P.foot = [V(0.35, -1, 0).normalize(), fd.clone().add(V(0, 0, -0.06)).normalize()]; P.kneePole = [V(1, 0, 0.1), V(1, 0.05, -0.1)];
        P.hand = [V(0.05, 1.3, 0.422), shOf(P)[1].add(V(0.04, -0.54, -0.07))];  /* ліва — на стійці дверної рами */ P.elbowPole = [V(-0.3, -1, 0.5), V(-1, 0, -0.3)]; return P;
      },
      after(P, J) { this.dw.g.scale.z = P.mirror ? -1 : 1; } }),
    mk({ id: 'splitsquat', grp: 'db', name: 'Розщеплений присід з опорою', work: { p: ['quads', 'glutes'], s: ['hams'] }, sides: true, dir: [1, 0.5, -1.15], camFlip: true,  // камера — з боку, протилежного одвірку (до дня 6 стійка перекривала корпус)
      t1: 2, t2: 1.4, c1: 'Опускайся вертикально — заднє коліно майже до підлоги', c2: 'Угору — пʼятою передньої ноги', bad: '✕ Не завалюй переднє коліно всередину', ghost: ['thighR', 'shinR', 'kneeR'],
      build(k) { this.w = jamb(k, 0.1, 0.62); this.db = Q.dumbbell(k); },
      pose(t, g) {
        /* правий бік: права нога спереду, ліва — позаду на носку; ліва рука ковзає по одвірку, гантель — у правій */
        const P = stand({ px: -0.02, py: lerp(0.84, 0.57, t), lumb: 5, chest: 5, head: 2 }), toe = V(0.643, -0.766, 0);
        P.ank = [V(-0.42, 0.185, 0.12), V(0.38, 0.07, -0.12)]; P.foot = [toe, V(1, 0, -0.1).normalize()]; P.kneePole = [V(0.6, -1, 0.05), g ? V(1, 0, 0.9) : V(1, 0, -0.12)];
        return splitArms(P, 0.1);
      },
      after(P, J) { splitAfter(this, P, J); } }),
    mk({ id: 'splitsquat', v: 'l', grp: 'db', name: 'Зворотні випади з опорою', work: { p: ['quads', 'glutes'], s: ['hams'] }, sides: true, dir: [1, 0.5, -1.15], camFlip: true,
      t1: 2.4, t2: 1.8, c1: 'Крок назад і вниз — заднє коліно майже до підлоги', c2: 'Угору й повернення до передньої ноги', bad: '✕ Не завалюй переднє коліно всередину', ghost: ['thighR', 'shinR', 'kneeR'],
      build(k) { this.w = jamb(k, -0.18, 0.62); this.db = Q.dumbbell(k); },
      pose(t, g) {
        const s1 = Math.min(1, t / 0.55), s2 = Math.max(0, (t - 0.35) / 0.65), sm = s1 * s1 * (3 - 2 * s1);
        const P = stand({ px: lerp(0, -0.36, sm), py: lerp(0.93, 0.58, s2), lumb: 5 * t, chest: 5 * t, head: 2 }), toe = V(0.643, -0.766, 0);
        P.ank = [V(lerp(0, -0.76, sm), lerp(0.07, 0.185, s1) + 0.07 * Math.sin(Math.PI * s1), lerp(0.11, 0.12, s1)), V(0, 0.07, -0.11)];
        P.foot = [V(1, 0, 0.1).normalize().lerp(toe, s1).normalize(), V(1, 0, -0.1).normalize()]; P.kneePole = [V(0.6, -1 * s1 + (1 - s1) * 0.1, 0.05).add(V(1 - s1, 0, 0)), g ? V(1, 0, 0.9) : V(1, 0, -0.12)];
        return splitArms(P, -0.18);  /* одвірок — посередині кроку: тіло їде назад на 0,36 м */
      },
      after(P, J) { splitAfter(this, P, J); } }),
    mk({ id: 'splitsquat', v: 'b', grp: 'db', name: 'Болгарський присід', work: { p: ['quads', 'glutes'], s: ['hams'] }, sides: true, dir: [1, 0.5, -1.15], camFlip: true,
      t1: 2.2, t2: 1.4, c1: 'Опускайся вниз — задня стопа на сидінні', c2: 'Угору — пʼятою передньої ноги', bad: '✕ Не завалюй переднє коліно всередину', ghost: ['thighR', 'shinR', 'kneeR'],
      build(k) { this.ch = Q.chair(k, { x: -0.95 }); this.w = jamb(k, -0.05, 0.62); this.db = Q.dumbbell(k); },
      pose(t, g) {
        /* задня стопа підйомом на передньому краї сидіння (верх 0,4625), передня — за 0,84 м попереду */
        const P = stand({ px: -0.2, py: lerp(0.87, 0.56, t), lumb: lerp(6, 14, t), chest: lerp(6, 12, t), head: 3 });
        P.ank = [V(-0.72, 0.52, 0.1), V(0.12, 0.07, -0.12)]; P.foot = [V(-0.95, -0.3, 0).normalize(), V(1, 0, -0.1).normalize()]; P.kneePole = [V(0.3, -1, 0.05), g ? V(1, 0, 0.9) : V(1, 0, -0.12)];
        return splitArms(P, -0.05);
      },
      after(P, J) { splitAfter(this, P, J); } }),
    mk({ id: 'farmer', grp: 'db', name: 'Фермерська прогулянка', work: { p: ['forearms', 'traps'], s: ['abs'] }, loop: true,
      t1: 2.4, c1: 'Ходи дрібними кроками, корпус нерухомий, дихай рівно', bad: '✕ Не сутулься й не нахиляйся вперед', ghost: TORSO,
      build(k) { this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) { const P = walk(t, 2, g ? { lumb: 12, chest: 24, head: 12 } : {}); P.hand = hang(P, 0.065, 0.02); P.elbowPole = eps(-1, 0, 0.3); return P; },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.hand[i], 'x')); } }),
    mk({ id: 'suitcase', grp: 'db', name: 'Валізна прогулянка', work: { p: ['obliques', 'forearms'], s: ['traps'] }, loop: true, sides: true,
      t1: 2.4, c1: 'Ходи повільно, корпус рівно, плечі на одному рівні', bad: '✕ Не нахиляйся вбік', ghost: TORSO,
      build(k) { this.db = Q.dumbbell(k); },
      pose(t, g) { const P = walk(t, 2, g ? { side: -12 } : {}); P.hand = hang(P, 0.065, 0.02, g ? 0.5 : 0.55); P.elbowPole = eps(-1, 0, 0.3); return P; },
      after(P, J) { dbAt(this.db, J.hand[P.mirror ? 0 : 1], 'x'); } }),
    mk({ id: 'curl', grp: 'db', name: 'Згинання на біцепс сидячи', work: { p: ['biceps'], s: ['forearms'] },
      t1: 1.3, t2: 2.2, c1: 'Згинай, розвертаючи долоні вгору', c2: 'Угорі стисни — вниз дві-три секунди', bad: '✕ Не розгойдуй корпус', ghost: TORSO.concat(ARMS),
      build(k) { this.ch = Q.chair(k, { x: -0.06 }); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) { return curlPose(seat({ x: -0.07, top: 0.4625, lumb: g ? -14 * sw1(t) : 2, chest: g ? -20 * sw1(t) : 2, head: 0 }), t, -58, 62, 0.235, 0.295); },
      after(P, J) { const u = Math.max(0, (P.t - 0.5) / 0.5), s = u * u * (3 - 2 * u); this.db.forEach((d, i) => dbDir(d, J.hand[i], perpF(J, i).lerp(V(0, 0, 1), s))); } }),  /* долоні розвертаються, коли гантель уже над стегном (до 24.10 диск ішов крізь стегно) */
    mk({ id: 'seatedpress', grp: 'db', name: 'Жим сидячи на кріслі', work: { p: ['delts'], s: ['triceps'] },
      t1: 1.3, t2: 2.2, c1: 'Вичавлюй угору й трохи назустріч', c2: 'Повільно вниз до рівня вух', bad: '✕ Не прогинай поперек і не відривай спину від спинки', ghost: TORSO,
      build(k) { this.ch = Q.chair(k, { x: 0 }); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const P = seat({ x: -0.06, top: 0.4625, lumb: -3 - (g ? 12 * t : 0), chest: -4 - (g ? 22 * t : 0), head: 0 }), sh = shOf(P);  // спина торкається спинки грудьми, таз — на 3 см попереду (до 24.10 груди йшли в спинку на 3,5 см)
        if (g) P.pelvis.x += 0.05 * t;
        P.hand = sh.map((s, i) => V(s.x + lerp(0.09, 0.05, t), s.y + lerp(0.06, 0.5, t), (i ? -1 : 1) * lerp(0.37, 0.215, t))); P.elbowPole = eps(0.35, -1, 0.9); return P;
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.hand[i], 'z')); } }),
    mk({ id: 'ohext', grp: 'db', name: 'Розгинання з-за голови сидячи', work: { p: ['triceps'], s: [] },
      t1: 1.4, t2: 2, c1: 'Розгинай руки вгору', c2: 'Вниз — повільно до розтягнення', bad: '✕ Не розводь лікті', ghost: ARMS,
      build(k) { this.ch = Q.chair(k, { x: -0.06 }); this.db = Q.dumbbell(k); },
      pose(t, g) {
        /* лікті вгорі й не розходяться; кисті — по дузі (0,27) навколо уявного ліктя над плечима: угорі руки майже прямі, унизу кисті за головою.
           Гантель висить вертикально під долонями (долоні під верхнім диском): унизу вона за спиною, угорі нижній диск ≈ 6 см над маківкою */
        const P = seat({ x: -0.07, top: 0.4625, lumb: 0, chest: 0, head: 0 }), sh = shOf(P), mid = sh[0].clone().add(sh[1]).multiplyScalar(0.5), ph = lerp(128, 2, t) * RAD;
        const c = mid.add(V(0.02 - 0.27 * Math.sin(ph), 0.29 + 0.27 * Math.cos(ph), 0)); P.hand = [c.clone().add(V(0, 0, 0.055)), c.clone().add(V(0, 0, -0.055))];
        P.dbc = c.clone().add(V(0, -0.021, 0)); P.elbowPole = g ? eps(0.2, 0.2, 1.6) : eps(0.6, 0.5, 1); return P;
      },
      after(P, J) { this.db.g.position.copy(P.dbc); this.db.g.rotation.set(0, 0, 0); } }),
    mk({ id: 'reardelt', grp: 'db', name: 'Розведення в нахилі сидячи', work: { p: ['reardelts'], s: ['traps'] },
      t1: 1.3, t2: 2, c1: 'Розводь руки в сторони ліктями до рівня плечей', c2: 'Пауза — і повільно вниз', bad: '✕ Не зводь лопатки з усієї сили', ghost: [],
      build(k) { this.ch = Q.chair(k, { x: -0.32 }); this.db = [Q.dumbbell(k), Q.dumbbell(k)]; },
      pose(t, g) {
        const P = seat({ x: -0.16, top: 0.4625, lumb: 42, chest: 56, head: 26, feetX: 0.4 }), sh = shOf(P), a = (6 + 76 * t) * RAD, R = 0.51;
        P.hand = sh.map((s, i) => V(s.x - 0.02, s.y - R * Math.cos(a), s.z + (i ? -1 : 1) * (0.06 + R * Math.sin(a)))); P.elbowPole = eps(0.2, 1, 0.6); return P;
      },
      after(P, J) { this.db.forEach((d, i) => dbAt(d, J.hand[i], 'x')); } }),
    mk({ id: 'row1', grp: 'db', name: 'Тяга однією рукою з упором на крісло', work: { p: ['lats'], s: ['biceps', 'reardelts'] }, sides: true, dir: [1, 0.5, -1.15], camFlip: true,  // камера — з боку робочої руки, крісло за людиною
      t1: 1.3, t2: 2, c1: 'Зведи лопатку, тягни лікоть до кишені', c2: 'Пауза — і повільно вниз до повного розтягнення', bad: '✕ Не розкручуй корпус', ghost: TORSO.concat(['uaR', 'faR', 'elbowR', 'handR', 'shoulderR']),
      build(k) { const s = k.sub(); this.ch = Q.chair(s, { x: 0.42, z: 0.2, rotY: 90 }); this.mg = s.g; this.db = Q.dumbbell(k); },
      pose(t, g) {
        /* правий бік: тягне права, ліва долоня на сидінні крісла ліворуч-спереду; ліва нога попереду; спина майже паралельна підлозі */
        const P = stand({ px: -0.1, py: 0.87, lumb: 74, chest: 78, head: 46 }), sh = shOf(P), c = P.chest * RAD, al = V(Math.sin(c), Math.cos(c), 0);
        if (g) P.twist = -26 * t;
        P.ank = [V(0.16, 0.07, 0.15), V(-0.36, 0.07, -0.14)]; P.foot = [V(1, 0, 0.1).normalize(), V(1, 0, -0.25).normalize()]; P.kneePole = [V(1, 0, 0.1), V(1, 0, -0.2)];
        const lo = sh[1].clone().add(V(0.03, -0.55, -0.02)), hi = sh[1].clone().addScaledVector(al, -0.26).add(V(0, -0.12, -0.03));
        P.hand = [V(sh[0].x + 0.04, 0.4625 + 0.046, 0.21), lo.lerp(hi, t)]; P.elbowPole = [V(-0.3, -1, 0.4), V(-0.6, 1, -0.2)]; return P;
      },
      after(P, J) { this.mg.scale.z = P.mirror ? -1 : 1; dbAt(this.db, J.hand[P.mirror ? 0 : 1], 'x'); } }),
    /* ===================== резинка з кріпленням до дверей ===================== */
    mk({ id: 'bandrow', grp: 'band', name: 'Тяга еспандера до пояса сидячи', work: { p: ['lats', 'reardelts'], s: ['biceps', 'traps'] }, dir: SIDEV, zoom: 0.85,
      t1: 1.3, t2: 2.2, c1: 'Зведи лопатки й тягни лікті назад до пояса', c2: 'Пауза — повернення дві-три секунди', bad: '✕ Не відхиляйся назад', ghost: TORSO,
      build(k) { this.ch = Q.chair(k, { x: -0.06 }); this.b = Q.band(k, Q.door(k, { x: 1.25, h: 1.1 }).anchor, 2); },
      pose(t, g) {
        /* крісло обличчям до дверей, кріплення на висоті ліктя стоячи (1,1) — сидячи це рівень грудей; угорі руки прямі, у кінці кисті біля пояса */
        const P = seat({ x: -0.07, top: 0.4625, lumb: 3 - (g ? 16 * t : 0), chest: 3 - (g ? 22 * t : 0), head: 0 });
        P.hand = shOf(P).map((s, i) => { const z = i ? -1 : 1; return V(s.x + lerp(0.54, 0.1, t), s.y - lerp(0.12, 0.33, t), s.z + z * lerp(-0.06, 0.045, t)); }); P.elbowPole = eps(-1, -0.4, 0.5); return P;  // лікті трохи назовні — не крізь груди
      },
      after(P, J) { this.b.set([J.hand[0], J.hand[1]]); } }),
    mk({ id: 'pulldown', grp: 'band', name: 'Тяга еспандера зверху сидячи', work: { p: ['lats'], s: ['biceps'] }, dir: SIDEV, zoom: 0.85,
      t1: 1.3, t2: 2.2, c1: 'Тягни лікті вниз до боків — ніби в задні кишені', c2: 'Пауза — повернення дві-три секунди', bad: '✕ Не відхиляйся назад', ghost: TORSO,
      build(k) { this.ch = Q.chair(k, { x: 0.5 }); this.b = Q.band(k, Q.door(k, { x: 1.25, h: 1.98 }).anchor, 2); },
      pose(t, g) { return pullHands(seat({ x: 0.49, top: 0.4625, lumb: 4 - (g ? 18 * t : 0), chest: 6 - (g ? 26 * t : 0), head: 2, feetX: 0.93 }), t); },
      after(P, J) { this.b.set([J.hand[0], J.hand[1]]); } }),
    mk({ id: 'pulldown', v: 'k', grp: 'band', name: 'Тяга зверху на колінах', work: { p: ['lats'], s: ['biceps'] }, dir: SIDEV, zoom: 0.85,
      t1: 1.3, t2: 2.2, c1: 'Тягни лікті вниз до боків — ніби в задні кишені', c2: 'Пауза — повернення дві-три секунди', bad: '✕ Не відхиляйся назад', ghost: TORSO,
      build(k) { this.b = Q.band(k, Q.door(k, { x: 1.25, h: 1.98 }).anchor, 2); },
      pose(t, g) {
        /* на колінах обличчям до дверей: стегна вертикально (коліно 0,078 → кульшовий 0,518), гомілки назад, пальці підігнуті */
        const kx = 0.55, P = stand({ px: kx, py: 0.538, lumb: 3 - (g ? 18 * t : 0), chest: 5 - (g ? 26 * t : 0), head: 2 });
        P.ank = both(kx - 0.415, 0.19, 0.12); P.foot = [V(0.5, -0.866, 0), V(0.5, -0.866, 0)]; P.kneePole = [V(1, -0.5, 0.1), V(1, -0.5, -0.1)];
        return pullHands(P, t);
      },
      after(P, J) { this.b.set([J.hand[0], J.hand[1]]); } }),
    mk({ id: 'facepull', grp: 'band', name: 'Тяга еспандера до обличчя', work: { p: ['reardelts'], s: ['traps'] }, dir: SIDEV, zoom: 0.85,
      t1: 1.3, t2: 2, c1: 'Тягни до лоба, лікті високо в сторони', c2: 'Пауза дві секунди — і повільно віддавай', bad: '✕ Не опускай лікті', ghost: ARMS,
      build(k) { this.b = Q.band(k, Q.door(k, { x: 1.25, h: 1.45 }).anchor, 2); },
      pose(t, g) {
        /* як тяга каната на блоці (g_facepull), кріплення на рівні плечей */
        const h = [1, -1].map((z) => V(lerp(0.5, g ? 0.2 : 0.1, t), lerp(1.47, g ? 1.4 : 1.58, t), z * lerp(0.07, g ? 0.16 : 0.26, t)));
        return stand({ lumb: -3, chest: -3, hand: h, ep: g ? eps(-0.3, -1, 0.4) : eps(-0.5, 0.35, 1), fx: 0.02, fw: 0.13 });
      },
      after(P, J) { this.b.set([J.hand[0], J.hand[1]]); } }),
    mk({ id: 'pallof', grp: 'band', name: 'Паллоф-жим з еспандером', work: { p: ['obliques', 'abs'], s: [] }, sides: true, camFlip: true,
      t1: 1.2, t2: 2.4, c1: 'Випрями руки вперед і тримай дві секунди', c2: 'Корпус не повертається — руки до грудей', bad: '✕ Не розвертайся за еспандером', ghost: TORSO.concat(ARMS),
      build(k) { this.d = doorSide(k, -1, 0.8, 1.22); this.b = Q.band(k, this.d.anchor, 1); },
      pose(t, g) {
        /* боком до дверей (праворуч), ручка двома руками біля грудей — як паллоф на блоці */
        const P = stand({ fw: 0.16, hand: both(lerp(0.34, 0.53, t), 1.16, 0.035), ep: eps(-0.3, -1, 0.8) });
        if (g) { P.twist = -24 * t; P.hand = [V(lerp(0.34, 0.37, t), 1.16, 0.035 - 0.13 * t), V(lerp(0.34, 0.37, t), 1.16, -0.035 - 0.13 * t)]; }
        return P;
      },
      after(P, J) { this.d.flip(P.mirror); this.b.set([J.hand[0].clone().add(J.hand[1]).multiplyScalar(0.5)]); } }),
    mk({ id: 'extrot', grp: 'band', name: 'Зовнішня ротація плеча', work: { p: ['reardelts'], s: [] }, sides: true, dir: [1, 0.5, -1.15], camFlip: true,
      t1: 1.2, t2: 2, c1: 'Розвертай передпліччя назовні, від дверей', c2: 'Повільно назад до живота', bad: '✕ Не відводь лікоть від тулуба', ghost: ARMS,
      build(k) { this.d = doorSide(k, 1, 0.75, 1.1); this.b = Q.band(k, this.d.anchor, 1); },
      pose(t, g) {
        /* правий бік: працює права, двері — з боку вільної (лівої) руки; лікоть під 90° біля тулуба, передпліччя — горизонтально навколо ліктя */
        const P = stand({ fw: 0.13 }), sh = shOf(P), el = sh[1].clone().add(V(0.03, -0.29, -0.05 - (g ? 0.16 * t : 0))), th = lerp(38, -62, t) * RAD;
        P.hand = [hang(P, 0.06, 0.01)[0], el.clone().add(V(0.26 * Math.cos(th), 0, 0.26 * Math.sin(th)))]; P.elbowPole = [V(-1, 0, 0.3), V(-0.2, -1, -0.65)]; return P;  /* лікоть — збоку біля тулуба, як із затиснутим рушником (до 24.10 плече йшло в груди на 1,8 см) */
      },
      after(P, J) { this.d.flip(P.mirror); this.b.set([J.hand[P.mirror ? 0 : 1]]); } }),
    mk({ id: 'abduct', grp: 'band', name: 'Відведення ноги в сторону', work: { p: ['glutes'], s: [] }, sides: true, dir: [1, 0.5, -1.15], camFlip: true,
      t1: 1.3, t2: 2, c1: 'Відводь ногу в сторону без нахилу корпусу', c2: 'Пауза — і повільно назад', bad: '✕ Не нахиляйся вбік', ghost: TORSO,
      build(k) { this.d = doorSide(k, 1, 0.65, 0.25); this.st = Q.wire(k, 0.0065, k.band); this.cuff = k.torus(0.064, 0.012, k.band); },
      pose(t, g) {
        /* правий бік: стоїть на лівій (ближчій до дверей), ремінець на правій щиколотці; ліва долоня — на дверях; права нога відходить на 30° */
        const P = stand({ fw: 0.11 }); P.pelvis.z = 0.035; if (g) P.side = 12 * t;
        const hr = P.pelvis.clone().add(V(0, -0.02, -0.1)), a = lerp(2, 30, t) * RAD;
        P.ank = [V(0, 0.07, 0.11), hr.clone().add(V(0.02, -0.86 * Math.cos(a), -0.86 * Math.sin(a)))]; P.ank[1].y = Math.max(P.ank[1].y, 0.07);
        P.foot = [V(1, 0, 0.17).normalize(), V(1, 0, -0.05).normalize()]; P.kneePole = [V(1, 0, 0.1), V(1, 0, -0.05)];
        P.hand = [V(0.08, 1.2, 0.602), hang(P, 0.06, 0.02, g ? 0.5 : 0.55)[1]]; P.elbowPole = [V(-0.4, -1, 0.3), V(-1, 0, -0.3)]; return P;
      },
      after(P, J) {
        this.d.flip(P.mirror); const i = P.mirror ? 0 : 1, a = J.ank[i], up = J.knee[i].clone().sub(a).normalize();
        this.cuff.position.copy(a).addScaledVector(up, 0.03); this.cuff.quaternion.setFromUnitVectors(V(0, 0, 1), up); this.st.set(this.cuff.position.clone(), this.d.anchor);
      } }),
    /* ===================== тренажери й блок ===================== */
    mk({ id: 'g_legpress', grp: 'gym', name: 'Жим ногами в тренажері', work: { p: ['quads', 'glutes'], s: ['hams'] },
      t1: 2.4, t2: 1.1, c1: 'Опускай платформу повільно', c2: 'Вичавлюй, коліна не замикай', bad: '✕ Не відривай таз і поперек від спинки',
      cam: [1.5, 1.45, 2.35], look: [0.22, 0.72, 0], ghost: ['pelvis', 'lumb', 'thighL', 'thighR'],
      build(k) { this.lp = Q.legPress(k); },
      pose(t, g) {
        const u = this.lp.u, p = this.lp.p, pelvis = V(0, 0.48, 0).add(g ? V(0.06 * t, 0.07 * t, 0) : V(0, 0, 0));
        /* помилка: таз відривається від сидіння й підкручується, лопатки лишаються на спинці; червоним — таз, поперек, стегна */
        const lumb = -50 - (g ? 20 * t : 0), chest = -54 + (g ? 3 * t : 0), a0 = this.lp.ext.clone().addScaledVector(u, -0.22 * t);  // унизу коліна ≈ 90°
        return { pelvis, lumb, chest, head: -38 + (g ? 3 * t : 0), ank: [a0.clone().add(V(0, 0, 0.18)), a0.clone().add(V(0, 0, -0.18))],
          foot: [p.clone().add(V(0, 0, 0.35)).normalize(), p.clone().add(V(0, 0, -0.35)).normalize()], kneePole: eps(0, 1, 0.5),
          hand: both(0.06, 0.48, 0.3), elbowPole: eps(-0.35, -1, 0.9), a0 };
      },
      after(P) { this.lp.set(P.a0); } }),
    mk({ id: 'g_latpull', grp: 'gym', name: 'Тяга верхнього блока до грудей', work: { p: ['lats'], s: ['biceps'] },
      t1: 1.25, t2: 2.4, c1: 'Тягни гриф до верху грудей', c2: 'Відпускай повільно', bad: '✕ Не розгойдуйся корпусом',
      cam: [2.55, 1.65, 2.6], look: [-0.06, 1.13, 0], ghost: TORSO.concat(ARMS),
      build(k) { this.lat = Q.latPull(k); },
      pose(t, g) {
        const pelvis = V(0, 0.53, 0), sw = g ? Math.sin(Math.PI * Math.min(1, t * 1.15)) : 0, lumb = -6 - 18 * sw, chest = -10 - 30 * sw;
        const sh0 = pelvis.clone().addScaledVector(dir(-6), L.lumb).addScaledVector(dir(-10), L.chest), sh1 = pelvis.clone().addScaledVector(dir(lumb), L.lumb).addScaledVector(dir(chest), L.chest);
        const sh = g ? V(sh1.x, sh0.y, 0) : sh0, y = lerp(sh.y + 0.46, sh.y - 0.04, t), bx = g ? sh.x + 0.2 : 0.17;
        return { pelvis, lumb, chest, head: -6 - 20 * sw, ank: both(0.47, 0.07, 0.14), foot: [V(1, 0, 0.12).normalize(), V(1, 0, -0.12).normalize()], kneePole: eps(1, 0.7, 0.2),
          hand: both(bx, y, 0.32), elbowPole: eps(-0.35, -1, 1), y, bx };
      },
      after(P) { this.lat.set(P.bx, P.y); },
      check(P, J, note, g) { if (!g && Math.abs(P.y - J.head.y) < 0.13 && P.bx - J.head.x < 0.12) note('гриф заходить у голову', ((P.bx - J.head.x) * 100).toFixed(1) + ' см'); } }),
    mk({ id: 'g_cablerow', grp: 'gym', name: 'Тяга нижнього блока сидячи', work: { p: ['lats'], s: ['biceps', 'reardelts'] },
      t1: 1.4, t2: 2, c1: 'Тягни руківʼя до живота, лопатки разом', c2: 'Повільно віддавай уперед', bad: '✕ Не відхиляйся назад', ghost: TORSO.concat(ARMS),
      build(k) { this.cr = Q.cableRow(k); },
      pose(t, g) {
        const x = 0.5 - 0.3 * t, P = seat({ top: 0.42, lumb: 8 - 10 * t - (g ? 16 * t : 0), chest: 6 - 12 * t - (g ? 20 * t : 0), ank: both(0.795, 0.52, 0.15), foot: [V(0.34, 0.94, 0.1).normalize(), V(0.34, 0.94, -0.1).normalize()],
          kneePole: eps(0.2, 1, 0.2), hands: both(x - (g ? 0.06 * t : 0), 0.78, 0.07), elbowPole: eps(-0.3, -1, 1.1) });
        P.hx = x - (g ? 0.06 * t : 0); return P;
      },
      after(P, J) { this.cr.set(J.w(J.hand[0]).add(J.w(J.hand[1])).multiplyScalar(0.5)); } }),
    mk({ id: 'g_chestpress', grp: 'gym', name: 'Жим від грудей у тренажері', work: { p: ['chest'], s: ['triceps', 'delts'] },
      t1: 1.2, t2: 2.2, c1: 'Жми ручки вперед до майже прямих рук', c2: 'Повертай за дві-три секунди', bad: '✕ Не відривай лопатки від спинки', ghost: TORSO.concat(ARMS),
      build(k) { this.m = Q.chestPress(k); },
      pose(t, g) { return seat({ x: -0.05, top: 0.435, lumb: -7 + (g ? 10 * t : 0), chest: -7 + (g ? 20 * t : 0), head: -3, hands: this.m.move(t), elbowPole: eps(-0.6, -0.5, 1) }); } }),
    mk({ id: 'g_shpress', grp: 'gym', name: 'Жим угору в тренажері сидячи', work: { p: ['delts'], s: ['triceps'] },
      t1: 1.2, t2: 2.2, c1: 'Жми вгору до майже прямих рук', c2: 'Повільно опускай до рівня плечей', bad: '✕ Не прогинай поперек', ghost: ['lumb', 'chest', 'pelvis', 'neck', 'head', 'girdle'],
      build(k) { this.m = Q.shoulderPress(k); },
      pose(t, g) { const P = seat({ x: -0.02, top: 0.435, lumb: -3, chest: -3, head: 0, hands: this.m.move(t), elbowPole: eps(0, -1, 1) }); if (g) { P.pelvis.x += 0.05 * t; P.lumb = -3 - 16 * t; P.chest = -3 - 4 * t; } return P; } }),
    mk({ id: 'g_abduct', grp: 'gym', name: 'Розведення ніг у тренажері', work: { p: ['glutes'], s: [] },
      t1: 1.4, t2: 2, c1: 'Розводь ноги плавно', c2: 'Повертай повільно, не кидай вагу', bad: '✕ Не нахиляйся вперед', ghost: TORSO,
      build(k) { this.m = Q.abduction(k); },
      pose(t, g) {
        const f = this.m.move(t) * RAD, legs = [1, -1].map((q) => { const c = Math.cos(f), s = Math.sin(f), knee = V(-0.08 + 0.44 * c, 0.51, q * (0.1 + 0.44 * s)); return { knee, ank: knee.clone().add(V(0.06 * c, -0.42, q * 0.06 * s)) }; });
        return seat({ x: -0.08, top: 0.435, lumb: g ? -18 + 34 * t : -18, chest: g ? -18 + 42 * t : -18, head: -8, ank: legs.map((l) => l.ank), foot: [V(Math.cos(f), 0, 0.15 + Math.sin(f)).normalize(), V(Math.cos(f), 0, -0.15 - Math.sin(f)).normalize()],
          kneePole: legs.map((l) => l.knee.clone().sub(V(-0.08, 0.51, Math.sign(l.knee.z) * 0.1)).add(V(0, 0.6, 0))), hands: both(0.0, 0.52, 0.26) });
      } }),
    mk({ id: 'g_legcurl', grp: 'gym', name: 'Згинання ніг у тренажері', work: { p: ['hams'], s: ['calves'] },
      t1: 1.4, t2: 2, c1: 'Згинай ноги плавно до кінця', c2: 'Повільно розгинай', bad: '✕ Не відривай таз', ghost: ['pelvis', 'lumb', 'chest', 'thighL', 'thighR'],
      build(k) { this.m = Q.legCurl(k); },
      pose(t, g) {
        const a = this.m.move(t), d = (90 - 85 * t) * RAD;
        const P = seat({ x: -0.04, top: 0.465, lumb: -11, chest: -11, head: -5, ank: a, foot: [V(Math.cos(d), Math.sin(d), 0.15).normalize(), V(Math.cos(d), Math.sin(d), -0.15).normalize()], kneePole: eps(0, 1, 0.05), hands: both(0.0, 0.58, 0.27) });
        if (g) { P.pelvis.y += 0.06 * t; P.pelvis.x += 0.03 * t; P.lumb = -11 + 12 * t; } return P;
      } }),
    mk({ id: 'g_legext', grp: 'gym', name: 'Розгинання ніг у тренажері', work: { p: ['quads'], s: [] },
      t1: 1.4, t2: 2, c1: 'Розгинай ноги плавно, пауза вгорі', c2: 'Повільно опускай', bad: '✕ Не розгинай ривком', ghost: ['shinL', 'shinR', 'ankleL', 'ankleR', 'footL', 'footR'],
      build(k) { this.m = Q.legExt(k); },
      pose(t, g) {
        const tt = g ? Math.min(1, t * 2.4) : t, a = this.m.move(tt), d = 85 * tt * RAD;  // помилка: та сама дуга, але ривком — нога вгорі вже на третині часу
        if (g) this.m.move(t);
        return seat({ x: -0.04, top: 0.465, lumb: -8, chest: -8, head: -4, ank: a, foot: [V(Math.cos(d), Math.sin(d), 0.15).normalize(), V(Math.cos(d), Math.sin(d), -0.15).normalize()], kneePole: eps(0, 1, 0.05), hands: both(0.0, 0.58, 0.27) });
      } }),
    mk({ id: 'g_pecdeck', grp: 'gym', name: 'Зведення рук у тренажері', work: { p: ['chest'], s: ['delts'] },
      t1: 1.3, t2: 2, c1: 'Зводь руки перед собою, пауза', c2: 'Повертай лише до лінії плечей', bad: '✕ Не відводь руки за лінію плечей', ghost: ARMS,
      build(k) { this.m = Q.pecDeck(k); },
      pose(t, g) { const h = this.m.set(g ? -20 + 125 * t : 105 * t); return seat({ x: -0.05, top: 0.435, lumb: -2, chest: -2, hands: h, elbowPole: eps(-0.2, -1, 0.3) }); } }),
    mk({ id: 'g_revfly', grp: 'gym', name: 'Зворотні розведення в тренажері', work: { p: ['reardelts'], s: ['traps'] },
      t1: 1.3, t2: 2, c1: 'Розводь руки назад до лінії плечей', c2: 'Повільно повертай', bad: '✕ Не відводь руки за лінію плечей', ghost: ARMS,
      build(k) { this.m = Q.pecDeck(k); },
      /* сидиш обличчям до спинки (тіло повернуте на 180°): груди на подушці, ручки — перед тобою за спинкою */
      pose(t, g) {
        const h = this.m.rev(g ? Math.min(1.35, t * 1.35) : t);
        const P = Object.assign(seat({ x: 0, top: 0.435, lumb: 6, chest: 10, head: 4, hands: [V(0, 1, 0), V(0, 1, 0)] }), { rot: [0, 180, 0], at: V(0.055, 0, 0) });
        P.pelvis = V(0, P.pelvis.y, 0); P.ank = both(0.28, 0.08, 0.16);
        return world(P, { hand: [h[1], h[0]], elbowPole: [V(0, -0.3, -1), V(0, -0.3, 1)] });
      } }),
    mk({ id: 'g_machrow', grp: 'gym', name: 'Тяга в тренажері з упором у груди', work: { p: ['lats'], s: ['biceps', 'reardelts'] },
      t1: 1.3, t2: 2, c1: 'Тягни лікті назад, лопатки разом', c2: 'Повільно віддавай уперед', bad: '✕ Не відривай груди від упора', ghost: TORSO.concat(ARMS), dir: [-0.45, 0.5, 1.2],
      build(k) { this.m = Q.chestRow(k); },
      pose(t, g) { return seat({ x: -0.02, top: 0.465, lumb: g ? 12 - 18 * t : 12, chest: g ? 14 - 24 * t : 14, head: 8, hands: this.m.move(t), elbowPole: eps(-1, -0.3, 0.4) }); } }),
    mk({ id: 'g_machcurl', grp: 'gym', name: 'Згинання рук у тренажері', work: { p: ['biceps'], s: ['forearms'] },
      t1: 1.3, t2: 2.2, c1: 'Згинай руки плавно до кінця', c2: 'Повільно опускай до майже прямих рук', bad: '✕ Не відривай лікті від подушки', ghost: ARMS,
      build(k) { this.m = Q.preacher(k); },
      pose(t, g) {
        const h = this.m.move(t); if (g) h.forEach((v) => { v.y += 0.12 * t; v.x -= 0.06 * t; });
        return Object.assign(seat({ x: -0.05, top: 0.455, lumb: 8, chest: 14, head: 6, hands: h, elbowPole: eps(0.3, -1, 0.09) }), { protract: [0, 0] });
      } }),
    mk({ id: 'g_triext', grp: 'gym', name: 'Розгинання рук у тренажері', work: { p: ['triceps'], s: [] },
      t1: 1.2, t2: 2.2, c1: 'Розгинай руки до кінця, пауза', c2: 'Повільно повертай', bad: '✕ Не відривай лікті від подушки', ghost: ARMS,
      build(k) { this.m = Q.tricepsExt(k); },
      pose(t, g) {
        const h = this.m.move(t); if (g) h.forEach((v) => { v.y += 0.1 * (1 - t); v.x -= 0.05; });
        return Object.assign(seat({ x: -0.05, top: 0.455, lumb: 8, chest: 14, head: 6, hands: h, elbowPole: eps(0.3, -1, 0.09) }), { protract: [0, 0] });
      } }),
    /* блок (одна стійка): відведення руки — стійка збоку, шків унизу, руківʼя в дальній руці; другий бік — стійку переставляємо дзеркально */
    mk({ id: 'g_cablelat', grp: 'gym', name: 'Відведення руки в сторону на блоці', work: { p: ['delts'], s: [] }, sides: true,
      t1: 1.4, t2: 2, c1: 'Веди руку в сторону до рівня плеча', c2: 'Повільно опускай', bad: '✕ Не піднімай вище плеча', ghost: ['uaL', 'faL', 'elbowL', 'handL', 'shoulderL'],
      build(k) { this.c = Q.cable(k, { height: 'low', attach: 'd', x: 0.05, z: -0.78, rotY: 90 }); },
      pose(t, g) {
        const a = (2 + (g ? 120 : 88) * t) * RAD, R = 0.53, sh = V(-0.012, 1.405, 0.205);  // старт — рука перед стегном (до 24.10 навхрест — проходила крізь корпус)
        return stand({ hand: [V(lerp(0.24, 0.1, t), sh.y - R * Math.cos(a), sh.z + R * Math.sin(a)), V(0.02, 0.95, -0.27)], ep: [V(-0.4, -0.6, 1), V(-1, -0.3, -0.3)], fw: 0.14 });
      },
      after(P, J) { this.c.place(0.05, P.mirror ? 0.78 : -0.78, P.mirror ? -90 : 90); this.c.set([J.w(J.hand[P.mirror ? 1 : 0])]); } }),
    mk({ id: 'g_facepull', grp: 'gym', name: 'Тяга каната до обличчя', work: { p: ['reardelts'], s: ['traps'] },
      t1: 1.3, t2: 2, c1: 'Тягни канат до лоба, лікті високо в сторони', c2: 'Пауза — і повільно віддавай', bad: '✕ Не опускай лікті', ghost: ARMS,
      build(k) { this.c = Q.cable(k, { height: 'face', attach: 'rope', x: 1.0 }); },
      pose(t, g) {
        const h = [V(lerp(0.5, g ? 0.2 : 0.1, t), lerp(1.5, g ? 1.4 : 1.58, t), lerp(0.07, g ? 0.16 : 0.26, t)), V(lerp(0.5, g ? 0.2 : 0.1, t), lerp(1.5, g ? 1.4 : 1.58, t), -lerp(0.07, g ? 0.16 : 0.26, t))];
        return stand({ lumb: -3, chest: -3, hand: h, ep: g ? eps(-0.3, -1, 0.4) : eps(-0.5, 0.35, 1), fx: 0.02, fw: 0.13 });
      },
      after(P, J) { this.c.set([J.w(J.hand[0]), J.w(J.hand[1])]); } }),
    mk({ id: 'g_pushdown', grp: 'gym', name: 'Розгинання рук на блоці', work: { p: ['triceps'], s: [] },
      t1: 1.2, t2: 2, c1: 'Розгинай руки донизу до кінця', c2: 'Повільно повертай до прямого кута', bad: '✕ Не відводь лікті від тулуба', ghost: ARMS,
      build(k) { this.c = Q.cable(k, { height: 'high', attach: 'bar', x: 0.5 }); },
      pose(t, g) {
        const P = stand({ lumb: 5, chest: 9, fx: 0.0, fw: 0.13 }), sh = shOf(P);
        const elb = sh.map((s, i) => s.clone().add(V(0.04 + (g ? 0.16 : 0), -0.28 + (g ? 0.06 : 0), (i ? -1 : 1) * 0.07)));  // лікті біля боків, не в тулубі (до 24.10 заходили на 2,5 см)
        const a = lerp(5, -78, t) * RAD;  // кут передпліччя від горизонталі: старт ≈ горизонтально, кінець — униз
        P.hand = elb.map((e, i) => e.clone().add(V(0.26 * Math.cos(a), 0.26 * Math.sin(a), (i ? 1 : -1) * 0.05)));
        P.elbowPole = g ? eps(0.3, -0.5, 1) : eps(-1, -0.2, 0.55); return P;
      },
      after(P, J) { this.c.set([J.w(J.hand[0]), J.w(J.hand[1])]); } }),
    mk({ id: 'g_cablecurl', grp: 'gym', name: 'Згинання рук на блоці', work: { p: ['biceps'], s: ['forearms'] },
      t1: 1.3, t2: 2, c1: 'Згинай руки до плечей без руху ліктів', c2: 'Пауза — і повільно опускай', bad: '✕ Не розгойдуй корпус', ghost: TORSO.concat(ARMS),
      build(k) { this.c = Q.cable(k, { height: 'low', attach: 'bar', x: 0.6 }); },
      pose(t, g) {
        const sw = g ? Math.sin(Math.PI * Math.min(1, t * 1.2)) : 0, P = stand({ lumb: -sw * 14, chest: -sw * 20, fw: 0.13 }), sh = shOf(P);
        const elb = sh.map((s, i) => s.clone().add(V(0.07, -0.29, (i ? -1 : 1) * 0.075)));  // лікті біля боків, не в тулубі
        const a = lerp(-72, 62, t) * RAD;  // старт — гриф перед стегнами (до 24.10 — у стегнах)
        P.hand = elb.map((e, i) => e.clone().add(V(0.26 * Math.cos(a), 0.26 * Math.sin(a), (i ? 1 : -1) * 0.03)));
        P.elbowPole = eps(-1, -0.3, 0.55); return P;
      },
      after(P, J) { this.c.set([J.w(J.hand[0]), J.w(J.hand[1])]); } }),
    mk({ id: 'g_pallof', grp: 'gym', name: 'Паллоф-жим на блоці', work: { p: ['obliques', 'abs'], s: [] }, sides: true,
      t1: 1.2, t2: 2.4, c1: 'Випрямляй руки вперед і тримай', c2: 'Корпус не повертається — руки до грудей', bad: '✕ Не повертай корпус за тросом', ghost: TORSO.concat(ARMS),
      build(k) { this.c = Q.cable(k, { height: 'chest', attach: 'd', x: 0.1, z: -0.95, rotY: 90 }); },
      pose(t, g) {
        const P = stand({ fw: 0.16, hand: both(lerp(0.34, 0.53, t), 1.16, 0.035), ep: eps(-0.3, -1, 0.8) });  // старт — кисті за 15 см від грудей, лікті вниз і в боки
        if (g) { P.twist = -24 * t; P.hand = [V(lerp(0.34, 0.37, t), 1.16, 0.035 - 0.13 * t), V(lerp(0.34, 0.37, t), 1.16, -0.035 - 0.13 * t)]; }
        return P;
      },
      after(P, J) { this.c.place(0.1, P.mirror ? 0.95 : -0.95, P.mirror ? -90 : 90); this.c.set([J.w(J.hand[0]).add(J.w(J.hand[1])).multiplyScalar(0.5)]); } })
  ];
}
