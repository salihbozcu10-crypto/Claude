// SAHNE 3 — Zirve: Son İki Dakika (üs, alarm)
import * as THREE from 'three';
import { V, cam, vtrack, walk, say, faceLights, keyAt, fillAt, rimAt, grade, show, L, S, M, A, clamp, smoothstep, lerp } from './helpers.js';
import { POS } from './scene2.js';
import { neutralPose } from '../characters/poses.js';

const SET = 'base';
const ss = smoothstep;
// sahne-3 zamanı (st) ile olay zamanları
const BANGS = [0.3, 4.5, 6.6, 10.2, 13.8, 16.3, 25.0, 40.5];
const RIP = 19.8, PLUG = 22.1, FREEZE = 44.2, BREAKER = 46.4;
const DOOR_POS = Object.assign(V(4.32, 0, 0.5), { heading: Math.PI / 2 });
const ATLAS_TERM = Object.assign(V(-1.22, 0, -2.66), { heading: Math.PI });
const RUN0 = 1.0, RUN1 = 3.35;            // Asya masadan kapıya koşar (s3_02 başında kapıya varır)
const TERM_PT = V(-2.3, 1.18, -3.55);     // ana ekran (Defne'nin baktığı yer)
const DEFNE_HEAD = V(-2.3, 1.13, -2.82);  // oturan Defne'nin başı (Atlas'ın bakış hedefi)
const ASYA_HEAD = V(4.46, 1.45, 0.51);    // kapıdaki Asya'nın başı (Atlas'ın bakış hedefi)
const ATLAS_HEAD0 = V(-1.22, 1.5, -2.8);  // terminaldeki Atlas'ın başı (Defne'nin bakış hedefi)
// Atlas'ın kök çerçevesi (yön π): yerel (x: sol, y, z: ileri) → dünya
const AL = (x, y, z) => V(ATLAS_TERM.x - x, y, ATLAS_TERM.z - z);

// Sayaç. Sahne 2 00:13:41'de bitti; ilk darbeden sonra sistem saldırıyı algılar ve senkronizasyonu
// hızlandırır: sayaç s3_01'deki ara çekimde gözle görülür biçimde 00:02:00'ye çöker ("son iki dakika"),
// sonra s3_09'daki iki bipte 02 → 01 olur ve 01'de donar.
const CD_S2 = 14 * 60 + 37 - 56;          // scene2 stage(): 14:37 - st, s2_11 sonu st = 56 → 821 s
const CD_J0 = 1.15, CD_J1 = 1.75;         // çöküş (st)
const CD_TICK1 = 43.75;                   // 2 → 1 (s3_09 ikinci bip, lt 0.75)
const CD_RATE = 118 / (CD_TICK1 - CD_J1);
function countdownAt(st) {
  if (st < CD_J0) return CD_S2 - st;
  if (st < CD_J1) { const k = ss(CD_J0, CD_J1, st); return lerp(CD_S2 - CD_J0, 120, k * k * (2 - k)); }
  return Math.max(1, 120 - (st - CD_J1) * CD_RATE);
}

// İki bakış hedefi arasında açısal karışım (hedefler arası düz çizgi başın yanından geçip ani dönüş yapmasın)
// dir: 0 → en kısa yol; ±1 → dönüş yönü zorlanır (ör. arkadan değil, önden geçsin)
function gazeMix(ch, a, b, k, dir = 0) {
  if (k <= 0) return a.clone(); if (k >= 1) return b.clone();
  const o = ch.boneWorld('neck', V()).add(V(0, 0.18, 0));
  const da = a.clone().sub(o), db = b.clone().sub(o);
  const ya = Math.atan2(da.x, da.z), yb = Math.atan2(db.x, db.z);
  let dy = yb - ya; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  if (dir > 0 && dy < 0) dy += 2 * Math.PI; else if (dir < 0 && dy > 0) dy -= 2 * Math.PI;
  const pa = Math.atan2(da.y, Math.hypot(da.x, da.z)), pb = Math.atan2(db.y, Math.hypot(db.x, db.z));
  const y = ya + dy * k, p = lerp(pa, pb, k), r = lerp(da.length(), db.length(), k);
  return o.add(V(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(r));
}
// [st, hedef] anahtarları arasında yumuşak geçiş: [[t0, t1, hedef, dir?], ...] — her geçiş t0→t1 arasında
function gazeTrack(ch, st, first, steps) {
  let g = first;
  for (const [t0, t1, tg, dir] of steps) { if (st <= t0) break; g = gazeMix(ch, g, tg, ss(t0, t1, st), dir || 0); }
  return g;
}
// Vektör anahtarları arasında parçalı yumuşak geçiş: [[t, Vector3], ...]
function vpath(keys, t) {
  if (t <= keys[0][0]) return keys[0][1].clone();
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return v0.clone().lerp(v1, ss(t0, t1, t)); }
  }
  return keys[keys.length - 1][1].clone();
}

function stage(ctx, st) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET]; const P = ctx.props;
  show(atlas, asya, defne);
  for (const c of [atlas, asya, defne]) c.update(ctx.t); // sonraki sync() çağrıları doğru zamanı kullansın
  const al = smoothstep(0.25, 0.6, st) * (st < BREAKER + 0.15 ? 1 : 0);
  Object.assign(set.state, { mode: 'alarm', alarm: al, screens: 'countdown', droneLight: al, glitch: 0.15 * al, deskCanAside: true });
  set.state.doorBangs = BANGS.map((b) => ctx.t - (st - b));
  // sayaç: 13:41 → (darbe) çöküş → son iki dakika → 01'de dondu
  set.state.countdown = st < FREEZE ? countdownAt(st) : 1; set.state.countdownFrozen = st >= FREEZE;
  if (st > CD_J0 - 0.1 && st < CD_J1 + 0.5) { set.state.glitch = Math.max(set.state.glitch, 0.85); set.state.countdownLabel = 'SENKRONİZASYON HIZLANDIRILDI'; }
  if (st >= FREEZE) set.state.countdownColor = '#ffffff';
  set.state.breaker = smoothstep(BREAKER - 0.5, BREAKER, st);
  if (st > BREAKER + 0.15) { set.state.power = 0; set.state.alarm = 0; set.state.mode = 'blackout'; set.state.droneLight = 0; }
  set.state.cableAttached = st < RIP;
  // Defne: terminalde. s3_03'te Asya'ya döner, Atlas harekete geçince ona bakar, "sistemi dondur" ile terminale döner
  const turnD = ss(10.7, 11.9, st) * (1 - ss(36.3, 37.1, st));
  defne.place(POS.defneSeat.x, POS.defneSeat.z, POS.defneSeat.heading);
  defne.setPose('sitTerminal'); defne.setPose('typing', 1 - 0.55 * turnD);
  defne.mixPose({ lWrist: [Math.sin(st * 35) * 0.15 * (1 - turnD), 0, 0], rWrist: [Math.sin(st * 29 + 1) * 0.15 * (1 - turnD), 0, 0], chest: [0, -0.45 * turnD, 0], neck: [0, -0.3 * turnD, 0] });
  defne.lookAt(gazeTrack(defne, st, TERM_PT, [[10.7, 11.6, ASYA_HEAD], [17.6, 18.4, ATLAS_HEAD0], [36.3, 37.0, TERM_PT]]), 0.6, 1);
  defne.expr('scared', 0.7);
  // Asya: masadan kapıya koşar (RUN0 → RUN1), kapıyı tutar; s3_06'da Atlas'a döner
  const w = walk(asya, [V(POS.asyaTable.x, 0, POS.asyaTable.z), V(2.4, 0, 0.9), V(DOOR_POS.x, 0, DOOR_POS.z)], RUN0, RUN1, st, { heading: DOOR_POS.heading, run: 1, strideScale: 1.3 });
  const arrive = ss(RUN1 - 0.35, RUN1 + 0.1, st);
  const turnA = ss(23.75, 24.45, st);
  // varışta yön ve poz yumuşak geçer; dönüş Atlas'a doğru (sola = +yön)
  asya.place(w.pos.x, w.pos.z, lerp(w.heading, DOOR_POS.heading, ss(RUN1 - 0.4, RUN1, st)) + 1.2 * turnA);
  if (st < RUN1) asya.setPose('run', w.amount);
  asya.setPose('pushDoor', arrive * (1 - turnA));
  asya.setPose('alert', turnA);
  asya.mixPose({ spine: [0, 0.3 * turnA, 0], chest: [0, 0.35 * turnA, 0] });
  asya.expr('determined', 0.6 + 0.2 * arrive);
  // Atlas: terminalin yanında
  atlas.place(ATLAS_TERM.x, ATLAS_TERM.z, ATLAS_TERM.heading);
  atlas.setPose('alert'); atlas.expr('worried', 0.6);
  // kapı darbelerinde herkes irkilir
  let flinch = 0; for (const b of BANGS) { const d = st - b; if (d > 0 && d < 0.5) flinch = Math.max(flinch, Math.exp(-d * 8)); }
  for (const c of [atlas, defne]) c.mixPose({ head: [-0.08 * flinch, 0, 0], spine: [-0.04 * flinch, 0, 0] });
  // nöral port & kablo
  P.cable.group.visible = st >= RIP;
  grade(ctx, st > BREAKER + 0.15 ? 'after' : 'alarm');
  ctx.RIM.color.value.set(al > 0.5 ? 0xff3020 : 0x40d0ff); ctx.RIM.strength.value = 0.28;
  return { al };
}

// Atlas: kabloyu söker → boynuna takar → bırakır; bakış ve gövde dönüşleri (s3_04 – s3_08), hepsi st'nin sürekli fonksiyonu
function atlasAct(ctx, st) {
  const { atlas } = ctx.chars; const set = ctx.sets[SET]; const P = ctx.props; const np = atlas.extras.neuralPort;
  const port = set.anchors.cablePort;
  // gövde dönüşü: s3_06'da (görünmezken) Asya'ya doğru sağa, s3_07'de "Defne!" ile sola, s3_08'de öne
  let tw = lerp(0, -0.6, ss(25.8, 27.2, st)); tw = lerp(tw, 0.45, ss(33.95, 34.65, st)); tw = lerp(tw, 0, ss(39.1, 39.55, st));
  // eğilip uzanma (kopar) → doğrulma
  const reach = ss(18.5, 19.35, st) * (1 - ss(19.95, 20.8, st));
  // boynu açmak için baş sağa yatar (takarken)
  const tilt = ss(20.9, 21.7, st) * (1 - ss(24.6, 25.8, st));
  const fist = ss(19.8, 20.4, st) * (1 - ss(25.0, 26.0, st));
  atlas.mixPose({ spine: [0.35 * reach, tw * 0.45, 0], chest: [0.15 * reach, tw * 0.55, 0], lKnee: 0.25 * reach, rKnee: 0.25 * reach, hips: { y: -0.05 * reach },
    head: [0.05 * tilt, -0.22 * tilt, 0.28 * tilt], neck: [0, -0.08 * tilt, 0.12 * tilt] });
  atlas.setPose({ rShoulder: [0.25, 0.25, 0], rElbow: [0.6], rHand: 'fist' }, fist);
  // bakış
  const fwdLow = AL(0.05, 1.25, 1.2);
  const g = gazeTrack(atlas, st, DEFNE_HEAD, [[17.7, 18.4, port], [19.95, 20.5, fwdLow], [26.0, 27.4, ASYA_HEAD], [33.95, 34.6, DEFNE_HEAD, 1], [39.1, 39.5, AL(0, 1.6, 2)]]);
  const gw = 1 - ss(39.1, 39.5, st);
  atlas.lookAt(g, lerp(0.7, 0.85, ss(17.7, 18.4, st)) * gw, lerp(1, 0.7, ss(26, 27, st)) * gw);
  // sol el (IK): fişi kavra → kopar → göğüs önü → boyun yanı → tak → tut → bırak
  atlas.update(ctx.t);
  const s = np.socketWorld(V()), n = np.socketNormalWorld(V());
  const F = V(0, 0, -1), U = V(0, 1, 0);
  const plugC = port.clone().add(V(0, 0, 0.035));          // takılı fişin ortası
  const PLUG_OFF = 0.068;                                   // avuç → fiş ucu
  const k = (a, b, c, d) => s.clone().addScaledVector(n, a).addScaledVector(F, b).addScaledVector(U, c).add(d || V());
  const handKeys = [
    [18.45, AL(0.32, 1.0, 0.25)],
    [19.3, plugC.clone().add(V(0, 0.045, 0.01))],
    [19.8, plugC.clone().add(V(0, 0.04, 0.012))],
    [20.05, plugC.clone().add(V(0.0, 0.2, 0.12))],
    [20.9, k(0.17, 0.14, -0.3)],
    [21.78, k(0.17, 0.02, -0.03)],
    [PLUG, k(PLUG_OFF, 0.0, 0.0)],
    [PLUG + 0.25, k(PLUG_OFF - 0.006, 0.0, 0.0)],
    [PLUG + 0.85, k(0.15, 0.03, -0.09)],     // fişi bırakıp kabloyu aşağıdan tutar: port ve fiş açıkta
    [24.9, k(0.15, 0.03, -0.1)],
    [25.9, k(0.2, 0.15, -0.35)],
  ];
  const lW = ss(18.45, 19.0, st) * (1 - ss(25.2, 26.4, st));
  // boyna yakın hedefler için kolu katlanmış bir başlangıç pozuna getir (IK oradan iner; yoksa erişemez)
  atlas.setPose({ lShoulder: [1.3, 1.0, -0.45], lElbow: [2.45, 0], lWrist: [0.1, 0, 0] }, ss(20.3, 21.3, st) * (1 - ss(25.2, 26.4, st)));
  if (lW > 0.001) {
    const hk = vpath(handKeys, st);
    // takıldıktan sonra acıyla hafif titreme
    if (st > PLUG) { const tr = Math.exp(-(st - PLUG) * 0.8) * 0.004; hk.add(V(Math.sin(st * 41) * tr, Math.sin(st * 37 + 1) * tr, 0)); }
    atlas.ik.l = hk; atlas.ik.lW = lW;
    atlas.setPose({ lHand: st < 19.25 ? 'open' : 'grip' }, ss(18.9, 19.4, st) * (1 - ss(25.2, 25.8, st)));
  }
  // kablo uçları
  if (st >= RIP) {
    atlas.update(ctx.t);
    const a = set.anchors.towerPort.clone().add(V(0, 0.05, 0.1));
    const wr = atlas.bones.lWrist; const palm = wr.localToWorld(V(0, -0.075, 0.012));
    // fiş yönü: kopunca yukarı-geri, boyna yaklaşırken porta doğru (−n)
    const up = V(-0.1, 1, 0.35).normalize();
    const dirIn = n.clone().negate();
    const bDir = up.clone().lerp(dirIn, ss(20.6, 21.6, st)).normalize();
    const inHand = palm.clone().addScaledVector(bDir, PLUG_OFF);
    const inSock = s.clone().addScaledVector(n, 0.004 - 0.012 * ss(PLUG, PLUG + 0.2, st));
    const b = inHand.lerp(inSock, ss(PLUG - 0.12, PLUG, st));
    P.cable.setEnds(a, b, st < PLUG ? 0.12 : 0.15, bDir, V(0, 0, -0.14));
    // veri akışı: takılınca başlar, s3_07 boyunca kısık (yüzün altında parlamasın), s3_08 dalgasıyla tam güç
    P.cable.pulse = st > PLUG ? smoothstep(PLUG, PLUG + 1.5, st) * lerp(0.25, 1, ss(38.8, 39.4, st)) * (st > FREEZE + 0.5 ? 0.3 : 1) : 0;
    P.cable.plugSpark = st < RIP + 0.3 ? 1 - (st - RIP) / 0.3 : st > PLUG - 0.05 && st < PLUG + 0.6 ? 1 - (st - PLUG + 0.05) / 0.65 : (st > FREEZE - 4 && st < FREEZE ? 0.5 : 0);
  }
  // port: takılınca yanar; s3_08 dalgasında boynu camgöbeği aydınlatır (bağlantı önden de görünsün)
  np.glow = st < PLUG ? 0.25 : lerp(0.8, 1.7, ss(39.1, 39.6, st) * (1 - ss(FREEZE, FREEZE + 0.5, st)));
}

export const scene3 = [
  { id: 's3_01', scene: 3, set: SET, dur: 3.0, desc: 'KAPIYA DARBE! Alarm başlar',
    cues: [S('door_bang_1', BANGS[0], 0), A('alarm_klaxon', 0.4, 46.0, -10), A('drone_buzz', 0.2, 46.2, -12), M('mus_s3_climax', 0.6, -3, { dur: 45.8 })],
    update(ctx, lt) {
      const st = lt; stage(ctx, st); const { atlas, defne } = ctx.chars;
      atlas.lookAt(V(4.9, 1.4, 0.5), 0.8, 1); defne.lookAt(V(4.9, 1.4, 0.5), 0.4, 1);
      // ara çekim (0.95 → 1.95): ana ekranda sayaç 00:13:4x'ten 00:02:00'ye çöker
      if (lt >= 0.95 && lt < 1.95) {
        const k = (lt - 0.95) / 1.0;
        cam(ctx, lt, { pos: V(-1.76 - 0.04 * k, 1.25, -2.58 - 0.07 * k), target: V(-2.3, 1.215, -3.52), fov: 38, shake: 0.6 });
        ctx.post.ca = 0.004;
      } else {
        cam(ctx, lt, { pos: vtrack([[0, [2.0, 1.45, 1.9]], [3, [2.5, 1.4, 1.6]]]), target: V(4.9, 1.35, 0.5), fov: 40, shake: 0.4 + 2.5 * Math.exp(-Math.max(0, lt - BANGS[0]) * 5) * (lt > BANGS[0] ? 1 : 0) });
      }
      ctx.post.letterbox = 1;
    } },
  { id: 's3_02', scene: 3, set: SET, dur: 4.7, desc: 'Asya kapıya koşar: "Kapının kilidi iki dakika dayanır!"',
    cues: [L('L10', 0.4), S('door_bang_2', BANGS[1] - 3.0, 0), S('door_bang_3', BANGS[2] - 3.0, -1), S('footsteps_run', 0.0, -6, { dur: 1.8 })],
    update(ctx, lt) {
      const st = 3.0 + lt; stage(ctx, st); const { asya, defne } = ctx.chars;
      // kapıyı tutarken ona bakar; seslenirken yüzü kameraya açık kalsın
      asya.lookAt(V(4.9, 1.55, 0.62), 0.85, 1);
      say(ctx, asya, 'L10', 0.4, lt, 1.1);
      // kapının sağ yanından 3/4 ön açı (s3_01'in arka açısından farklı; perçem yüzün sol yanını örter)
      cam(ctx, lt, { pos: vtrack([[0, [4.74, 1.52, 1.42]], [4.7, [4.72, 1.5, 1.34]]]), target: (t) => asya.headWorld(V()).add(V(0.0, -0.08, 0)), fov: 38, shake: 0.9, dof: 0.5, focus: 0.9 });
      faceLights(ctx, asya, { key: 6, keyColor: 0xffb0a0, rim: 22, rimColor: 0xff2a1a, side: -1 });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_03', scene: 3, set: SET, dur: 10.0, desc: 'Defne panikte: "Yazılımla imkânsız!"',
    cues: [L('L11', 0.3), S('door_bang_1', BANGS[3] - 7.7, -2), S('door_bang_2', BANGS[4] - 7.7, -1), S('door_bang_3', BANGS[5] - 7.7, -2), S('typing_fast', 0, -8, { dur: 3 })],
    update(ctx, lt) {
      const st = 7.7 + lt; stage(ctx, st); const { defne, atlas } = ctx.chars;
      defne.expr('scared', 0.4); defne.face.browIn += 0.3;
      atlas.lookAt(defne.headWorld(V()), 0.7, 1);
      say(ctx, defne, 'L11', 0.3, lt, 1.0);
      const h = defne.headWorld(V());
      // sağ-ön 3/4 açı: yüz ve dudaklar baştan görünür
      cam(ctx, lt, { pos: vtrack([[0, [-1.58, 1.17, -3.3]], [10, [-1.72, 1.14, -3.24]]], 'inOutSine'), target: h.clone().add(V(0.0, -0.04, 0)), fov: 36, shake: 0.6, dof: 0.9, focus: (t) => 0.86 - t * 0.012 });
      faceLights(ctx, defne, { key: 8, keyColor: 0xffc8b0, rim: 20, rimColor: 0xff2a1a });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_04', scene: 3, set: SET, dur: 3.5, desc: 'Atlas tereddüt etmez: kabloyu terminalden söker',
    cues: [S('cable_rip', RIP - 17.7, 0)],
    update(ctx, lt) {
      const st = 17.7 + lt; stage(ctx, st); const { atlas } = ctx.chars;
      atlas.expr('determined', 0.9);
      atlasAct(ctx, st);
      // sol-ön sabit kamera; hedef yüzden fişe iner, koparınca elle birlikte boyna doğru kalkar
      cam(ctx, lt, { pos: vtrack([[0, [-2.0, 1.5, -3.36]], [3.5, [-1.97, 1.47, -3.33]]]),
        target: vtrack([[0, [-1.22, 1.46, -2.76]], [0.8, [-1.24, 1.38, -2.82]], [1.7, [-1.28, 1.13, -3.0]], [2.3, [-1.28, 1.17, -2.98]], [2.95, [-1.25, 1.4, -2.84]], [3.5, [-1.24, 1.42, -2.8]]]),
        fov: 53, shake: 0.6 + (lt > 2.1 ? 1.2 * Math.exp(-(lt - 2.1) * 6) : 0), dof: 0.5, focus: 0.95 });
      faceLights(ctx, atlas, { key: 6, keyColor: 0x60c8ff, rim: 22, rimColor: 0xff2a1a });
      // portun üstündeki monitörün soğuk ışığı: el, fiş ve kopuş masada okunsun
      const port = ctx.sets[SET].anchors.cablePort;
      fillAt(ctx, port.clone().add(V(0.06, 0.1, 0.12)), 0.25 + 1.1 * ss(0.7, 1.4, lt) * (1 - ss(2.6, 3.2, lt)), 0x7ad8ff, 0.42);
      ctx.post.letterbox = 1;
    } },
  { id: 's3_05', scene: 3, set: SET, dur: 2.5, desc: 'Çok yakın: kablo boyundaki nöral porta takılır',
    cues: [S('plug_in', PLUG - 21.2, 0)],
    update(ctx, lt) {
      const st = 21.2 + lt; stage(ctx, st); const { atlas } = ctx.chars;
      atlasAct(ctx, st);
      const pk = ss(PLUG - 0.1, PLUG + 0.15, st);
      atlas.expr('determined', 0.8 * (1 - pk)); atlas.expr('pain', 0.9 * pk);
      atlas.update(ctx.t);
      const np = atlas.extras.neuralPort; const s = np.socketWorld(V()); const n = np.socketNormalWorld(V());
      // sol omzunun arkasından boyun yanına: el fişi önden getirir, fiş porta girer, el kabloya kayar (port açık kalır)
      const pos = s.clone().addScaledVector(n, 0.17).add(V(0, 0.05, 0.44));
      cam(ctx, lt, { pos: vtrack([[0, pos.clone().add(V(0, 0.01, 0.05)).toArray()], [2.5, pos.toArray()]]), target: s.clone().add(V(0, -0.015, -0.05)), fov: 32, shake: 0.4 + (lt > PLUG - 21.2 ? 1.5 * Math.exp(-(lt - (PLUG - 21.2)) * 4) : 0), dof: 1, focus: 0.48, aperture: 0.05 });
      keyAt(ctx, s.clone().addScaledVector(n, 0.5).add(V(0, 0.45, 0.45)), s, 3, 0xff8070, 0.5);
      rimAt(ctx, s.clone().add(V(0.2, 0.4, -0.7)), s, 12, 0x40e0ff);
      ctx.post.flash = st > PLUG && st < PLUG + 0.15 ? 0.4 : 0; ctx.post.flashColor = [0.6, 0.95, 1];
      ctx.post.letterbox = 1;
    } },
  { id: 's3_06', scene: 3, set: SET, dur: 4.5, desc: 'Asya döner: "Atlas! Ne yapıyorsun?"',
    cues: [L('L12', 0.3), S('door_bang_1', BANGS[6] - 23.7, -3)],
    update(ctx, lt) {
      const st = 23.7 + lt; stage(ctx, st); const { asya, atlas } = ctx.chars;
      atlasAct(ctx, st); atlas.expr('pain', 0.7);
      // Atlas'a bakış: kapıdan başlayıp en kısa yoldan (sola) döner
      asya.lookAt(gazeMix(asya, V(4.9, 1.55, 0.62), atlas.headWorld(V()), ss(0.0, 0.5, lt)), 0.9, 1);
      // dehşet: şok + korku, kaşlar çatık (negatif ağırlık yok)
      asya.expr('shock', 0.75); asya.expr('scared', 0.6); asya.expr('angry', 0.25); asya.face.browIn += 0.25; asya.face.smile -= 0.2; asya.face.round += 0.15;
      say(ctx, asya, 'L12', 0.3, lt, 1.1);
      cam(ctx, lt, { pos: vtrack([[0, [3.28, 1.45, 0.1]], [4.5, [3.34, 1.44, 0.12]]]), target: (t) => asya.headWorld(V()).add(V(0, -0.06, 0)), fov: 32, shake: 0.8, dof: 1, focus: 1.1 });
      faceLights(ctx, asya, { key: 8, keyColor: 0xffc0b0, rim: 22, rimColor: 0xff2a1a, side: -1 });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_07', scene: 3, set: SET, dur: 10.8, desc: 'Atlas acıyla gülümser: "Eğer anılarım silinecekse..."',
    cues: [L('L13', 0.3), S('neural_hum', 0, -8, { dur: 10.8 })],
    update(ctx, lt) {
      const st = 28.2 + lt; stage(ctx, st); const { atlas } = ctx.chars;
      atlasAct(ctx, st);
      const det = ss(5.8, 6.6, lt);
      atlas.expr('sadSmile', 0.8 * (1 - det)); atlas.expr('pain', 0.35 + 0.3 * det); atlas.expr('determined', 0.6 * det);
      // iris görünür kalsın: beyaz göz s3_08'e saklı
      atlas.face.eyeGlow = 0.03 + 0.09 * ss(6.5, 10.8, lt);
      say(ctx, atlas, 'L13', 0.3, lt);
      if (lt < 6.0) {
        // A: Asya'ya konuşurken sağ-ön 3/4 (Asya kadraj sağında)
        cam(ctx, lt, { pos: vtrack([[0, [-0.4, 1.66, -2.2]], [6.0, [-0.62, 1.64, -2.36]]], 'inOutSine'), target: vtrack([[0, [-1.18, 1.56, -2.72]], [6.0, [-1.19, 1.55, -2.72]]]), fov: 32, shake: 0.35, dof: 1, focus: (t) => 0.92 - t * 0.03 });
      } else {
        // B: "Defne!" — dönüşün ortasında kesme; sol-önden, port ve kablo görünür
        cam(ctx, lt, { pos: vtrack([[6.0, [-1.86, 1.66, -3.3]], [10.8, [-1.78, 1.64, -3.22]]], 'inOutSine'), target: vtrack([[6.0, [-1.26, 1.52, -2.72]], [10.8, [-1.27, 1.52, -2.73]]]), fov: 32, shake: 0.4, dof: 1, focus: (t) => 0.82 - (t - 6.0) * 0.012 });
      }
      faceLights(ctx, atlas, { key: 9, keyColor: 0xffc8b8, rim: 20, rimColor: 0xff2a1a, fill: 1.5, fillColor: 0x40d8ff });
      ctx.post.letterbox = 1; ctx.post.ca = 0.002 + 0.002 * smoothstep(5, 10, lt);
    } },
  { id: 's3_08', scene: 3, set: SET, dur: 4.0, desc: 'Gözleri bembeyaz parlar; veri fırtınası',
    cues: [S('neural_surge', 0.2, 0), S('door_bang_2', BANGS[7] - 39.0, -4)],
    update(ctx, lt) {
      const st = 39.0 + lt; stage(ctx, st); const { atlas } = ctx.chars;
      atlasAct(ctx, st); atlas.setPose('brace', smoothstep(0.1, 0.6, lt) * 0.6);
      atlas.expr('pain', 0.8); atlas.face.eyeGlow = 0.12 + 0.88 * smoothstep(0.15, 0.8, lt); atlas.face.lidUp = 0.8; atlas.face.open = 0.25; atlas.autoBlink = false;
      ctx.sets[SET].state.glitch = 0.8; ctx.sets[SET].state.screens = 'glitch';
      const h = atlas.headWorld(V());
      // kamera Atlas'ın kök çerçevesinde sabit (canlı baş kemiğine kilitli değil)
      const f0 = AL(0.14, 1.56, 0.85), f1 = AL(0.06, 1.55, 0.5);   // hafif solundan: boyundaki port/fiş çene arkasından görünsün
      cam(ctx, lt, { pos: vtrack([[0, f0.toArray()], [4, f1.toArray()]], 'inQuad'), target: AL(0.02, 1.5, 0.05), fov: 30, roll: (t) => Math.sin(t * 3) * 0.04, shake: 1.2, dof: 1, focus: (t) => 0.86 - t * 0.09 });
      keyAt(ctx, h.clone().add(V(0, 0.25, -0.7)), h, 10, 0x9ff0ff, 0.5); rimAt(ctx, h.clone().add(V(0.5, 0.6, 0.7)), h, 26, 0xff2a1a);
      const fl = Math.max(0, Math.sin(lt * 23)) * smoothstep(0.4, 1.0, lt) * (1 - smoothstep(3.3, 4, lt));
      Object.assign(ctx.post, { glitch: 0.35 + 0.4 * fl, whiteout: 0.25 * fl, ca: 0.006, letterbox: 1 });
    } },
  { id: 's3_09', scene: 3, set: SET, dur: 2.5, desc: 'Ana ekran: 00:00:01 — DONDU',
    cues: [S('beep_count', 0.4, -6), S('beep_count', 0.75, -6), S('system_freeze', FREEZE - 43.0, 0)],
    update(ctx, lt) {
      const st = 43.0 + lt; stage(ctx, st);
      ctx.sets[SET].state.screens = 'countdown';
      // ekranın sağından, tüm sayaç ve başlık kadrajda
      cam(ctx, lt, { pos: vtrack([[0, [-1.7, 1.25, -2.5]], [2.5, [-1.78, 1.23, -2.62]]]), target: V(-2.3, 1.215, -3.52), fov: 38, shake: lerp(0.8, 0.1, ss(0.1, 0.45, lt)) });
      ctx.post.letterbox = 1; ctx.post.flash = st > FREEZE && st < FREEZE + 0.12 ? 0.5 : 0;
    } },
  { id: 's3_10', scene: 3, set: SET, dur: 2.6, desc: 'Defne ana şalteri indirir — karanlık',
    cues: [S('breaker_clunk', BREAKER - 45.5, 0)],
    update(ctx, lt) {
      const st = 45.5 + lt; stage(ctx, st); const { defne } = ctx.chars; const set = ctx.sets[SET];
      // Defne şalterin önünde, ayakta (terminal oturuş pozu temizlenir)
      const B = set.anchors.breaker; defne.place(B.x + 0.17, B.z + 0.1, B.heading);
      defne.setPose(neutralPose(), 1);
      const brk = set.state.breaker;
      const lean = ss(0.0, 0.3, lt) * (1 - brk);   // kola uzanma
      // uzanırken öne eğilir; çekerken ağırlığını verip çömelir (diz/kalça/bilek oranları ayakları yerde tutar)
      defne.mixPose({ spine: [0.22 * lean - 0.06 * brk, 0, 0], chest: [0.08 * lean, 0, 0], hips: { y: -0.08 * brk }, lHip: [0.45 * brk, 0, 0], rHip: [0.45 * brk, 0, 0], lKnee: 0.9 * brk, rKnee: 0.9 * brk, lAnkle: 0.45 * brk, rAnkle: 0.45 * brk });
      // eller her karede kolun tutamağını izler (tutamak dünya konumu set'ten)
      const hnd = set.breakerHandle(brk, V());
      const grab = ss(0.0, 0.3, lt);
      defne.ik.r = hnd.clone().add(V(0.03, -0.01, -0.06)); defne.ik.rW = grab;
      defne.ik.l = hnd.clone().add(V(0.03, -0.01, 0.06)); defne.ik.lW = grab;
      defne.setPose({ rHand: 'grip', lHand: 'grip' }, ss(0.15, 0.35, lt));
      defne.expr('determined', 0.9); defne.lookAt(hnd, 0.6, 1);
      cam(ctx, lt, { pos: V(-4.25, 1.45, -2.75), target: V(-4.58, 1.28, -1.4), fov: 40, shake: 0.5 + (st > BREAKER ? 1.5 * Math.exp(-(st - BREAKER) * 5) : 0) });
      faceLights(ctx, defne, { key: st > BREAKER + 0.15 ? 0 : 6, keyColor: 0xffb0a0, rim: st > BREAKER + 0.15 ? 3 : 18, rimColor: 0xff2a1a });
      ctx.post.letterbox = 1; ctx.post.fade = smoothstep(BREAKER + 0.2 - 45.5, 2.6, lt) * 0.85;
    } },
];
