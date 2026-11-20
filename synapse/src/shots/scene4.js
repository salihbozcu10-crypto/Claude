// SAHNE 4 — Final ve Büyük Gizem (üs, karanlık sonrası loş ışık)
import * as THREE from 'three';
import { canvasTexture } from '../engine/materials.js';
import { rng } from '../engine/util.js';
import { V, cam, vtrack, walk, walkPath, say, faceCam, faceLights, keyAt, fillAt, rimAt, grade, show, hold, placeProp, fadeIn, L, S, M, A, clamp, smoothstep, lerp, fbm1 } from './helpers.js';

const SET = 'base';
// Atlas'ın yığıldığı yer: kök (dizlerin yere değdiği nokta). Yüzü +z'ye (odaya) bakar, sol yanına
// (+x) devrilir; yerde başı ~x=+0.15'te, sırtı terminal masasına dönük yatar.
const FLOOR = V(-0.95, 0, -2.1);
// Asya ve Defne onun arkasında (sırt tarafında) diz çöker; yüzleri ön kameraya döner
const ASYA_K = Object.assign(V(0.25, 0, -2.55), { heading: -0.45 });
const DEFNE_K = Object.assign(V(-0.5, 0, -2.6), { heading: 0.25 });
const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };

function stage(ctx, st) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET];
  show(atlas, asya, defne);
  Object.assign(set.state, { mode: 'after', power: 0, alarm: 0, afterDim: 1, screens: 'off', breaker: 1, cableAttached: false, doorBangs: [], emergency: 1 });
  grade(ctx, 'after', { exposure: 1.4 });
  ctx.RIM.color.value.set(0x6a90c0); ctx.RIM.strength.value = 0.16;
  // soğuk loş "normal" ışık: yukarıdan yumuşak anahtar
  fillAt(ctx, V(-0.5, 2.6, 0.5), 3.5, 0x8aa0c8, 7);
}

// Atlas yığılma (sahne-4 zamanı st): 0–0.5 sendeler, 0.5–1.0 dizleri çözülür (iki dizi yere),
// 0.95–1.5 gövde yana devrilir (yerçekimi gibi hızlanarak), 1.5'te omuz/baş yere çarpar (body_fall),
// sonra kollar yerde/gövdede dinlenir.
const ATL_H = 0.05;
const P_WEAK = { spine: [0.12, 0, 0], neck: [0.12, 0, 0], head: [0.28, 0, 0], lShoulder: [0.05, 0.04, 0], rShoulder: [0.05, 0.04, 0], lElbow: [0.15], rElbow: [0.15], lKnee: 0.14, rKnee: 0.14, hips: { y: -0.018 }, lHand: 'relaxed', rHand: 'relaxed' };
const P_KNEEL2 = { hips: { y: -0.385, rot: [0.04, 0, 0] }, spine: [0.3, 0, 0], chest: [0.1, 0, 0], neck: [0.1, 0, 0], head: [0.35, 0, 0], lHip: [0.04, 0.06, 0], rHip: [0.04, 0.06, 0], lKnee: 1.62, rKnee: 1.62, lAnkle: -0.55, rAnkle: -0.55, lShoulder: [0.12, 0.06, 0], rShoulder: [0.12, 0.06, 0], lElbow: [0.25], rElbow: [0.25] };
// yerde, sol yanına yatmış (kök z ekseninde -π/2 döner). Gövde yanal bükülmesi alttaki omzu yerden kaldırır,
// boyun/baş aşağı bükülüp başı yere koyar; bacaklar yarı kıvrık (kendini toparlama duruşu).
const P_LIE = { hips: { y: -0.385, rot: [0, 0.12, 0] }, spine: [0.18, 0, 0.1], chest: [0.08, 0, 0.08], neck: [0.05, 0, -0.18], head: [0.12, 0, -0.26], lHip: [0.75, -0.05, 0], lKnee: 1.15, rHip: [1.0, -0.06, 0], rKnee: 1.45, lAnkle: 0.15, rAnkle: 0.15, lShoulder: [1.35, -0.3, 0], lElbow: [1.25], lWrist: [0.2, 0, 0], rShoulder: [0.55, -0.12, 0], rElbow: [0.7], lHand: 'relaxed', rHand: 'relaxed' };
const ATL_ROLL = Math.PI / 2, ATL_LIFT = 0.17;
const lieFrame = () => ({ A: V(Math.cos(ATL_H), 0, -Math.sin(ATL_H)), F: V(Math.sin(ATL_H), 0, Math.cos(ATL_H)) });
function atlasFall(ctx, st) {
  const { atlas } = ctx.chars; const np = atlas.extras.neuralPort;
  const kb = smoothstep(0.5, 1.0, st);
  const u = clamp((st - 0.95) / 0.55); const f = u * u * (1.6 - 0.6 * u); // hızlanan devrilme, 1.5'te çarpma
  const bell = Math.sin(Math.PI * clamp(u * 1.1));
  const sway = (1 - kb) * Math.sin(st * 3.1) * 0.03;
  atlas.place(FLOOR.x, FLOOR.z, ATL_H);
  atlas.setPose(P_WEAK, 1);
  atlas.setPose(P_KNEEL2, kb);
  atlas.setPose(P_LIE, f);
  // devrilirken: gövde düşüş yönüne kıvrılır, baş ve kollar geride kalır (gecikme)
  atlas.mixPose({ spine: [0.2 * bell, 0, -0.22 * bell], chest: [0.08 * bell, 0, -0.1 * bell], neck: [0, 0, 0.18 * bell], head: [-0.1 * bell, 0, 0.3 * bell], lShoulder: [0.25 * bell, 0.7 * bell, 0], lElbow: [0.3 * bell], rShoulder: [0.1 * bell, 0.45 * bell, 0], rElbow: [0.4 * bell], lHip: [0.25 * bell, 0, 0], rHip: [0.15 * bell, 0, 0] });
  // çarpma sonrası küçük sekme
  const d = st - 1.5; const bo = d > 0 ? Math.exp(-d * 8) * Math.sin(d * 24) : 0;
  atlas.mixPose({ head: [0, 0, 0.1 * bo], neck: [0, 0, 0.05 * bo], rShoulder: [0, 0.12 * bo, 0], spine: [0, 0, 0.03 * bo] });
  // yerde hafif, yorgun nefes
  const lb = smoothstep(1.6, 2.4, st); atlas.mixPose({ chest: [Math.sin(st * 2.2) * 0.015 * lb, 0, 0] });
  atlas.root.rotation.z = -ATL_ROLL * f + sway;
  atlas.root.position.y = ATL_LIFT * Math.sin(ATL_ROLL * f);
  // kollar yere değer: eller yerde (yüzünün ve göğsünün önünde)
  const { A, F } = lieFrame();
  const wIK = smoothstep(1.3, 1.62, st);
  if (wIK > 0) {
    atlas.ik.r = FLOOR.clone().addScaledVector(A, 0.62).addScaledVector(F, 0.3).setY(0.075); atlas.ik.rW = wIK;
  }
  np.glow = 0.25 * (1 - kb) + 0.05;
  return f;
}

// Yumuşatılmış yol boyunca koşu: köşelerde baş yönü kırılmaz, varışta son yöne 0.45 sn'de döner.
function runTo(ch, pts, t0, t1, lt, hEnd, stride = 1.2) {
  const w = walkPath(pts, t0, t1, lt, {});
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
  const k = clamp(w.phase * 0.62 / L);
  const p = curve.getPointAt(k), tg = curve.getTangentAt(Math.min(k, 0.999));
  const hPath = Math.atan2(tg.x, tg.z);
  ch.place(p.x, p.z, angLerp(hPath, hEnd, smoothstep(t1 - 0.5, t1 + 0.05, lt)));
  if (w.amount > 0) { ch.setPose('run', w.amount); ch.walk(w.phase, w.amount, { run: 1, stride }); }
  return w;
}
// İki dizi yerde, topuklarına hafif oturmuş (dizler kökün hemen önünde): yatan birine yakın diz çökmek için
const P_KNEELW = { hips: { y: -0.43, rot: [0.1, 0, 0] }, spine: [0.12, 0, 0], lHip: [0.35, 0.08, 0], rHip: [0.35, 0.08, 0], lKnee: 1.95, rKnee: 1.95, lAnkle: -0.55, rAnkle: -0.55 };
// Diz çökmüş karakter öne eğilip elini Atlas'ın üstteki omzuna (Asya) / kalçasına (Defne) koyar
function kneelReach(ctx, ch, w) {
  if (w <= 0) return;
  const { atlas } = ctx.chars; atlas.update(ctx.t);
  const isAsya = ch === ctx.chars.asya;
  const tgt = isAsya ? atlas.boneWorld('rShoulder', V()).add(V(0.05, 0.08, -0.08))
    : atlas.boneWorld('hips', V()).add(V(0.02, 0.2, -0.06));
  ch.mixPose({ spine: [0.34 * w, 0, 0], chest: [0.14 * w, 0, 0] });
  if (isAsya) { ch.ik.r = tgt; ch.ik.rW = w; ch.setPose({ rHand: 'relaxed' }, w); }
  else { ch.ik.l = tgt; ch.ik.lW = w; ch.setPose({ lHand: 'relaxed' }, w); }
}

function kneelers(ctx, w = 1, withDefne = true) {
  const { asya, defne } = ctx.chars;
  asya.place(ASYA_K.x, ASYA_K.z, ASYA_K.heading); asya.setPose(P_KNEELW); kneelReach(ctx, asya, w);
  if (withDefne) { defne.place(DEFNE_K.x, DEFNE_K.z, DEFNE_K.heading); defne.setPose(P_KNEELW); kneelReach(ctx, defne, w); }
}
const S4_04_ROLL = -0.85;

// ---------------- Fotoğraf: elde tutma ----------------
const PW = 0.15, PH = 0.105;                 // fotoğrafın açık boyutu (props/photo)
const D5 = Object.assign(V(0.2, 0, -0.86), { heading: 0 });   // Defne masanın arka kenarında diz çöker
const PAPER = V(-0.02, 0.03, -0.4);        // buruşuk kâğıt: masanın kenarının hemen altında, yerde (Defne'nin sağında)
const CAM05 = {
  pos: new THREE.CatmullRomCurve3([V(-1.2, 0.52, -0.6), V(-1.05, 0.95, -0.88), V(-0.8, 1.45, -1.12), V(-0.52, 1.78, -1.18)], false, 'centripetal'),
  tgt: new THREE.CatmullRomCurve3([V(0.12, 0.43, -0.5), V(0.15, 0.75, -0.55), V(0.2, 1.02, -0.55), V(0.2, 1.1, -0.52)], false, 'centripetal'),
};
const PAPER_ROT = [-Math.PI / 2, 0, 0.6];
const T_GRAB = 1.2;                          // paper_rustle ile eşzamanlı kavrama
const PALM = V(0.035, -0.095, 0.012);        // buruşuk top avuçta (sağ bilek yereli)
// tutuş: sağ el alt kenarın ortasını (başparmak önde), sol el sol kenarı tutar. IK ucu avuç ortasıdır;
// avuç kenarın dışında durur, parmaklar kâğıdın kenarına uzanır.
const RG = { x: 0.012, y: 0.05, z: -0.012 }, LG = { x: 0.05, y: -0.012, z: -0.012 };
const P_HOLDBASE = { lShoulder: [0.45, 0.12, 0.25], rShoulder: [0.45, 0.12, 0.25], lElbow: [1.45], rElbow: [1.45], lWrist: [-0.1, 0, 0], rWrist: [-0.1, 0, 0], lHand: 'pinch', rHand: 'pinch', neck: [0.12, 0, 0] };
// iki elle tutuş çerçevesi (dünya): göğsün önünde, yüzü Defne'nin gözlerine dönük
// tremble: elleri titrer (fotoğraf da onunla birlikte, eller IK ile kenarları izler)
function photoFrame(ch, { fwd = 0.37, up = 0.04, side = -0.05, tremble = 0, t = 0 } = {}) {
  const C = ch.bones.chest.localToWorld(V(side, up, fwd));
  const eye = ch.bones.chest.localToWorld(V(0, 0.36, 0.1));     // bakıştan bağımsız göz vekili
  if (tremble) C.add(V(fbm1(t * 9 + 1), fbm1(t * 11 + 7), fbm1(t * 8 + 3)).multiplyScalar(0.006 * tremble));
  const Z = eye.sub(C).normalize();
  if (tremble) Z.add(V(fbm1(t * 7 + 5), fbm1(t * 6 + 2), 0).multiplyScalar(0.05 * tremble)).normalize();
  const X = V(0, 1, 0).cross(Z).normalize(), Y = Z.clone().cross(X);
  return { C, X, Y, Z, M: new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(C) };
}
function gripTargets(fr, unfold) {
  const s = 1 - (1 - unfold) * 0.45; const hw = (PW / 2) * s, hh = (PH / 2) * s;
  const r = fr.C.clone().addScaledVector(fr.Y, -hh - RG.y).addScaledVector(fr.X, RG.x).addScaledVector(fr.Z, RG.z);
  const l = fr.C.clone().addScaledVector(fr.X, -hw - LG.x).addScaledVector(fr.Y, LG.y).addScaledVector(fr.Z, LG.z);
  return { r, l };
}
// dünya matrisi M'deki aksesuarı kemiğe bağla (kemik yerelinde M'yi koruyacak şekilde)
function localIn(bone, M) { bone.updateMatrixWorld(true); return new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(M); }
function attachLocal(prop, bone, Lm) { hold(prop, bone); Lm.decompose(prop.group.position, prop.group.quaternion, prop.group.scale); }
function lerpLocal(A, B, k) {
  const pa = V(), qa = new THREE.Quaternion(), sa = V(), pb = V(), qb = new THREE.Quaternion(), sb = V();
  A.decompose(pa, qa, sa); B.decompose(pb, qb, sb);
  return new THREE.Matrix4().compose(pa.lerp(pb, k), qa.slerp(qb, k), sa.lerp(sb, k));
}
// Defne fotoğrafı iki elle tutar (s4_06–08). leftW: sol elin kavrama ağırlığı (çevirirken bırakır)
function holdPhoto(ctx, ch, { unfold = 1, flip = 0, leftW = 1, frame = {}, look = 0.6 } = {}) {
  const P = ctx.props.photo;
  ch.setPose(P_HOLDBASE, 1); ch.update(ctx.t);
  const fr = photoFrame(ch, { ...frame, t: ctx.t }); const g = gripTargets(fr, unfold);
  if (look) ch.lookAt(fr.C, look, 1);
  ch.ik.r = g.r; ch.ik.rW = 1;
  // sol el bırakınca biraz aşağı ve yana çekilir
  ch.ik.l = g.l.clone().addScaledVector(fr.X, -0.06 * (1 - leftW)).add(V(0, -0.08 * (1 - leftW), 0)); ch.ik.lW = 0.35 + 0.65 * leftW;
  ch.setPose({ lHand: 'relaxed' }, 1 - leftW);
  ch.update(ctx.t);
  attachLocal(P, ch.bones.rWrist, localIn(ch.bones.rWrist, fr.M));
  P.unfold = unfold; P.flip = flip;
  return fr;
}
// s4_05: Defne'nin kâğıdı bulup alması (yalnız poz; kâğıt ayrıca bağlanır). Saf fonksiyon: aynı lt → aynı poz.
const unfold05 = (lt) => smoothstep(2.3, 3.55, lt) * 0.92;
function defne05(ctx, lt) {
  const ch = ctx.chars.defne;
  ch.place(D5.x, D5.z, D5.heading);
  const kr = smoothstep(1.5, 2.6, lt);                                     // ayağa kalkış
  const lean = smoothstep(0.2, 1.0, lt) * (1 - smoothstep(1.25, 2.2, lt)); // masanın altına uzanırken öne eğilme
  ch.setPose('kneel', 1 - kr);
  ch.mixPose({ hips: { y: -0.04 * lean, rot: [0.38 * lean, 0, 0] }, spine: [0.1 + 0.52 * lean, 0, 0.06 * lean], chest: [0.32 * lean, -0.14 * lean, 0] }, 1 - kr);
  // sol el sol dizde
  ch.mixPose({ lShoulder: [0.55, 0.1, 0.1], lElbow: [0.75] }, 1 - smoothstep(1.6, 2.2, lt));
  const reach = smoothstep(0.3, 1.05, lt);
  const close = smoothstep(1.02, 1.22, lt);
  // el biçimleri setPose ile (parmaklar yumuşak geçer; mixPose el biçimini 0.5'te tek karede değiştirir)
  const hb = smoothstep(1.9, 2.5, lt);
  ch.setPose({ rHand: 'open' }, reach * (1 - close)); ch.setPose({ rHand: 'grip' }, close);
  ch.setPose({ lHand: 'pinch', rHand: 'pinch' }, Math.max(hb, smoothstep(2.1, 2.5, lt)));
  const { lHand, rHand, ...holdArms } = P_HOLDBASE; void lHand; void rHand;
  ch.mixPose(holdArms, hb);
  ch.update(ctx.t);
  const fr = photoFrame(ch); const g = gripTargets(fr, unfold05(lt));
  // sağ el: kâğıdın üstüne iner, kavrar, göğüs önüne getirir, sonra alt kenarı tutar
  const above = PAPER.clone().add(V(0, 0.11, -0.02)), onP = PAPER.clone().add(V(0, 0.075, -0.01));
  const lift = smoothstep(1.28, 2.35, lt);
  const tr = above.clone().lerp(onP, smoothstep(0.85, 1.15, lt)).lerp(g.r, lift);
  tr.y += Math.sin(Math.PI * lift) * 0.08;   // yay çizerek kalkar
  ch.ik.r = tr; ch.ik.rW = reach;
  // sol el: kâğıdı açmak için gelir
  const lw = smoothstep(1.9, 2.45, lt); if (lw > 0) { ch.ik.l = g.l; ch.ik.lW = lw; }
  // bakış: yerdeki kâğıt → eldeki kâğıt
  ch.lookAt(PAPER.clone().lerp(tr, smoothstep(1.2, 1.7, lt)).lerp(fr.C, smoothstep(1.9, 2.5, lt)), 0.85, 1);
  ch.update(ctx.t);
  return fr;
}

// s4_08: karanlık duvar ekranının camı — yansımanın üstünde çok hafif çapraz parlama ve toz (bir ekran
// yansıması olduğu okunsun). Gölge-klonun köküne bağlıdır: o yalnızca s4_08'de görünür, her karede sıfırlanır.
let SHEEN = null;
function screenSheen(ctx) {
  const sh = ctx.chars.defneShadow;
  if (!SHEEN) {
    const tex = canvasTexture(512, 296, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const band = (x0, wd, a) => { const gr = g.createLinearGradient(x0, 0, x0 + wd, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(200,220,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.transform(1, 0, -0.55, 1, 0, 0); g.fillStyle = gr; g.fillRect(x0, 0, wd, h); g.restore(); };
      band(w * 0.12, w * 0.22, 0.55); band(w * 0.4, w * 0.06, 0.4); band(w * 0.78, w * 0.12, 0.3);
      const vg = g.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, 'rgba(160,190,230,0.18)'); vg.addColorStop(0.25, 'rgba(0,0,0,0)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
      const R = rng(808); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(220,230,255,${0.15 + R() * 0.35})`; g.fillRect(R() * w, R() * h, 1 + R() * 1.5, 1 + R() * 1.5); }
      g.strokeStyle = 'rgba(190,210,245,0.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    });
    SHEEN = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.15), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.1 }));
    SHEEN.castShadow = false; SHEEN.receiveShadow = false;
  }
  if (SHEEN.parent !== sh.root) sh.root.add(SHEEN);
  sh.root.updateMatrixWorld(true);
  const M = new THREE.Matrix4().makeTranslation(1.7, 1.6, -3.888);
  new THREE.Matrix4().copy(sh.root.matrixWorld).invert().multiply(M).decompose(SHEEN.position, SHEEN.quaternion, SHEEN.scale);
}

export const scene4 = [
  { id: 's4_01', scene: 4, set: SET, dur: 3.5, desc: 'Derin sessizlik. Atlas yere yığılır',
    cues: [S('tinnitus_ring', 0, -10), S('body_fall', 1.5, -2), A('amb_after', 0.2, 33, -16)],
    update(ctx, lt) {
      const st = lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, st); atlas.expr('tired', 1); atlas.face.blink = smoothstep(0.6, 1.2, st) * 0.9; atlas.autoBlink = false;
      asya.place(3.9, 0.55, -Math.PI / 2 - 0.5); asya.setPose('alert'); asya.lookAt(atlas.headWorld(V()), 0.8, 1); asya.expr('shock', 0.6);
      const B = ctx.sets[SET].anchors.breaker; defne.place(B.x + 0.15, B.z + 0.1, B.heading + 1.3); defne.setPose('alert'); defne.lookAt(atlas.headWorld(V()), 0.7, 1); defne.expr('scared', 0.7);
      // önden, hafif sağdan: ayaktayken baş kadrajda; yığıldıkça kamera aşağı ve sağa (başın düştüğü yere) iner
      cam(ctx, lt, { pos: vtrack([[0, [-0.95, 1.3, 0.35]], [0.9, [-0.9, 1.22, 0.3]], [1.9, [-0.65, 0.95, 0.1]], [3.5, [-0.6, 0.88, 0.0]]], 'inOutSine'),
        target: vtrack([[0, [-0.92, 1.12, -2.1]], [0.9, [-0.85, 0.9, -2.1]], [1.75, [-0.38, 0.32, -2.1]], [3.5, [-0.33, 0.28, -2.1]]], 'inOutSine'), fov: 44, dof: 0.6, focus: 2.35 });
      keyAt(ctx, V(0.2, 2.6, -0.6), V(-0.6, 0.5, -2.1), 30, 0xb8c8e8, 0.6);
      ctx.post.fade = 0.85 * (1 - smoothstep(0, 1.4, lt)); ctx.post.letterbox = 1;
    } },
  { id: 's4_02', scene: 4, set: SET, dur: 3.0, desc: 'Asya ve Defne koşarak yanına diz çöker',
    cues: [S('footsteps_run', 0.0, -6, { dur: 1.6 }), M('mus_s4_relief', 0.3, -6)],
    update(ctx, lt) {
      const st = 3.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, st); atlas.expr('tired', 1); atlas.face.blink = 0.95; atlas.autoBlink = false;
      // ikisi de Atlas'ın arkasına (sırt tarafına) koşup diz çöker: yüzleri öndeki kameraya döner, Atlas önde açıkta kalır
      const B = ctx.sets[SET].anchors.breaker;
      runTo(asya, [V(3.0, 0, 0.0), V(1.55, 0, -1.75), V(1.05, 0, -2.6), V(ASYA_K.x, 0, ASYA_K.z)], 0.0, 1.6, lt, ASYA_K.heading, 1.3);
      runTo(defne, [V(B.x + 0.75, 0, B.z - 0.05), V(-2.0, 0, -1.72), V(-1.4, 0, -2.6), V(DEFNE_K.x, 0, DEFNE_K.z)], 0.2, 1.9, lt, DEFNE_K.heading, 1.2);
      asya.setPose(P_KNEELW, smoothstep(1.45, 2.05, lt)); defne.setPose(P_KNEELW, smoothstep(1.75, 2.35, lt));
      kneelReach(ctx, asya, smoothstep(2.0, 2.6, lt)); kneelReach(ctx, defne, smoothstep(2.3, 2.9, lt));
      asya.lookAt(atlas.headWorld(V()), 0.9, 1); defne.lookAt(atlas.headWorld(V()), 0.9, 1);
      asya.expr('scared', 0.9); defne.expr('scared', 0.9);
      cam(ctx, lt, { pos: vtrack([[0, [-1.1, 1.6, 0.6]], [3, [-1.0, 1.5, 0.4]]], 'inOutSine'), target: vtrack([[0, [-0.25, 0.78, -2.35]], [3, [-0.18, 0.66, -2.4]]], 'inOutSine'), fov: 48, shake: 0.35 });
      keyAt(ctx, V(-0.3, 2.6, -0.4), V(-0.2, 0.5, -2.5), 30, 0xb8c8e8, 0.6);
      ctx.post.letterbox = 1;
    } },
  { id: 's4_03', scene: 4, set: SET, dur: 3.0, desc: 'Asya: "Atlas... İyi misin? Başardın mı?"',
    cues: [L('L14', 0.3)],
    update(ctx, lt) {
      const st = 6.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, 3); atlas.face.blink = 0.95; atlas.autoBlink = false;
      kneelers(ctx, 1);
      asya.lookAt(atlas.headWorld(V()), 0.9, 1); asya.expr('sad', 0.7); asya.expr('worried', 0.5);
      defne.lookAt(atlas.headWorld(V()), 0.9, 1); defne.expr('worried', 0.9);
      say(ctx, asya, 'L14', 0.3, lt, 0.85);
      // Asya'nın yakın planı: kamera yüzünün önünde ama yandan (3/4), Atlas'ın başının üstünde değil —
      // saçına/başına en az ~0.45 m uzak
      asya.update(ctx.t); const h = asya.headWorld(V());
      const fw = V(Math.sin(ASYA_K.heading), 0, Math.cos(ASYA_K.heading)), lf = V(fw.z, 0, -fw.x);
      // göz hizasının altından (Atlas'ın yanından) yukarı bakar: aşağı bakan yüzü görünür
      const pA = h.clone().addScaledVector(fw, 0.72).addScaledVector(lf, 0.46).add(V(0, -0.36, 0));
      const pB = h.clone().addScaledVector(fw, 0.62).addScaledVector(lf, 0.4).add(V(0, -0.3, 0));
      cam(ctx, lt, { pos: vtrack([[0, pA.toArray()], [3, pB.toArray()]], 'inOutSine'), target: h.clone().add(V(0, -0.04, 0)), fov: 32, dof: 1, focus: pA.distanceTo(h) - 0.04 * smoothstep(0, 3, lt) });
      faceLights(ctx, asya, { key: 8, keyColor: 0xc8d8f0, rim: 12, rimColor: 0x6a90c0 });
      ctx.post.letterbox = 1;
    } },
  { id: 's4_04', scene: 4, set: SET, dur: 4.2, desc: 'Atlas gözlerini açar: "Başardım... Güvendeyiz."',
    cues: [L('L15', 0.7)],
    update(ctx, lt) {
      const st = 9.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, 3); atlas.autoBlink = true;
      atlas.face.blink = 1 - smoothstep(0.2, 0.9, lt) * 0.75; atlas.expr('tired', 1); atlas.expr('sadSmile', 0.5 * smoothstep(2.5, 3.5, lt));
      kneelers(ctx, 1);
      // gözünü açınca başını yavaşça yukarı, Asya'ya çevirir
      const gl = smoothstep(0.6, 1.6, lt);
      atlas.lookAt(asya.headWorld(V()), 0.15 + 0.3 * gl, gl); asya.lookAt(atlas.headWorld(V()), 0.9, 1);
      say(ctx, atlas, 'L15', 0.7, lt, 0.75);
      atlas.update(ctx.t); const h = atlas.headWorld(V());
      // yüzünün önünden, hafif yukarıdan (tepeden değil): burun/göz biçimi bozulmadan okunur
      const fa = faceCam(atlas, { dist: 0.72, side: 0.1, up: 0.06 }), fb = faceCam(atlas, { dist: 0.58, side: 0.08, up: 0.05 });
      cam(ctx, lt, { pos: vtrack([[0, fa.pos.toArray()], [4.2, fb.pos.toArray()]], 'inOutSine'), target: h, fov: 32, roll: S4_04_ROLL, dof: 1, focus: (t) => lerp(0.73, 0.59, smoothstep(0, 4.2, t)) });
      keyAt(ctx, h.clone().add(V(0.3, 1.2, 0.6)), h, 10, 0xc8d8f0, 0.5); rimAt(ctx, h.clone().add(V(0.6, 0.6, -0.8)), h, 10, 0x6a90c0);
      ctx.post.letterbox = 1;
    } },
  { id: 's4_05', scene: 4, set: SET, dur: 3.6, desc: 'Defne masanın altında buruşuk bir kâğıt bulur',
    cues: [S('paper_rustle', 1.2, -4)],
    update(ctx, lt) {
      const st = 13.7 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars; const P = ctx.props;
      atlasFall(ctx, 3); atlas.face.blink = 0.3;
      kneelers(ctx, 1, false); asya.lookAt(atlas.headWorld(V()), 0.9, 1); asya.expr('sadSmile', 0.4);
      // Defne masanın arka kenarında diz çöker, masanın altına uzanır, kâğıdı sağ eliyle kavrar (1.2 sn,
      // hışırtı), kalkarken göğsüne getirir ve iki eliyle açar. Kâğıt kavrandığı andan itibaren sağ bileğe bağlı.
      const tg = ctx.t - lt + T_GRAB;
      let Wg = null;
      if (lt >= T_GRAB) { defne.reset(); defne05({ ...ctx, t: tg }, T_GRAB); defne.update(tg); Wg = defne.bones.rWrist.matrixWorld.clone(); defne.reset(); }
      const fr = defne05(ctx, lt); defne.expr('focused', 0.6 * (1 - smoothstep(2.4, 3.2, lt))); defne.expr('surprised', 0.4 * smoothstep(2.6, 3.4, lt));
      const Mfloor = new THREE.Matrix4().compose(PAPER, new THREE.Quaternion().setFromEuler(new THREE.Euler(...PAPER_ROT)), V(1, 1, 1));
      P.photo.flip = 0; P.photo.unfold = unfold05(lt);
      if (lt < T_GRAB) { placeProp(ctx, P.photo, PAPER, 0, PAPER_ROT); P.photo.group.scale.set(1, 1, 1); }
      else {
        const Lg = new THREE.Matrix4().copy(Wg).invert().multiply(Mfloor);           // kavrama anındaki yerel (sıçramasız)
        const pg = V(), qg = new THREE.Quaternion(), sg = V(); Lg.decompose(pg, qg, sg);
        const Lpalm = new THREE.Matrix4().compose(pg.clone().lerp(PALM, smoothstep(T_GRAB, T_GRAB + 0.4, lt)), qg, sg);
        const Lhold = localIn(defne.bones.rWrist, fr.M);
        attachLocal(P.photo, defne.bones.rWrist, lerpLocal(Lpalm, Lhold, smoothstep(2.05, 2.55, lt)));
      }
      // önce yandan, alçaktan: yerdeki kâğıt, uzanan el ve baş kadrajda. Kalkarken kamera onunla yükselip
      // sağ omzunun arkasına döner: açılan fotoğrafın ön yüzü görünür (arkadaki not s4_07'ye kadar saklı).
      const cu = smoothstep(1.15, 3.45, lt);
      cam(ctx, lt, { pos: CAM05.pos.getPoint(cu).add(V(0, 0, -0.03 * smoothstep(0, 1.15, lt))), target: CAM05.tgt.getPoint(cu), fov: lerp(53, 40, cu), dof: 0.6, focus: lerp(1.4, 0.75, cu) });
      faceLights(ctx, defne, { key: 8, keyColor: 0xc8d8f0, rim: 10, rimColor: 0x6a90c0 });
      ctx.post.letterbox = 1;
    } },
  { id: 's4_06', scene: 4, set: SET, dur: 2.6, desc: 'Fotoğraf: hiç hatırlamadıkları bir an',
    cues: [M('mus_s4_ominous', 0.3, -4)],
    update(ctx, lt) {
      const st = 17.3 + lt; stage(ctx, st); const { defne, atlas, asya } = ctx.chars;
      atlasFall(ctx, 3); atlas.face.blink = 0.3; kneelers(ctx, 1, false); asya.lookAt(atlas.headWorld(V()), 0.9, 1);
      // insert: Defne'nin parmakları fotoğrafın kenarlarında (sağ el alt kenar, sol el sol kenar)
      defne.place(D5.x, D5.z, D5.heading); defne.expr('surprised', 0.6);
      const fr = holdPhoto(ctx, defne, { unfold: 1, flip: 0, frame: { tremble: 0.25 } });
      const hp = fr.C.clone().addScaledVector(fr.Y, -0.012), n = fr.Z;
      const p0 = hp.clone().addScaledVector(n, 0.29).addScaledVector(fr.X, 0.012).add(V(0, 0.01, 0)), p1 = hp.clone().addScaledVector(n, 0.24);
      cam(ctx, lt, { pos: vtrack([[0, p0.toArray()], [2.6, p1.toArray()]], 'inOutSine'), target: hp, fov: 38, dof: 1, focus: lerp(0.29, 0.24, smoothstep(0, 2.6, lt)), aperture: 0.05 });
      keyAt(ctx, hp.clone().addScaledVector(n, 0.6).add(V(0.3, 0.5, 0)), hp, 8, 0xd8e0f0, 0.5);
      ctx.post.letterbox = 1;
    } },
  { id: 's4_07', scene: 4, set: SET, dur: 7.2, desc: 'Arkası: kendi el yazısı — "4. kişiye dikkat et."',
    cues: [L('L16', 0.6), S('paper_rustle', 0.1, -6)],
    update(ctx, lt) {
      const st = 19.9 + lt; stage(ctx, st); const { defne, atlas, asya } = ctx.chars;
      atlasFall(ctx, 3); atlas.face.blink = 0.3; kneelers(ctx, 1, false); asya.lookAt(atlas.headWorld(V()), 0.9, 1);
      defne.place(D5.x, D5.z, D5.heading); defne.expr('scared', 0.4 + 0.5 * smoothstep(4, 6.5, lt)); defne.expr('shock', 0.45 * smoothstep(5.2, 6.6, lt));
      // çevirme: sağ el alt kenarın ortasından tutup (dikey eksen bu tutuştan geçer) fotoğrafı döndürür;
      // sol el bu sırada bırakır, sonra notun sol kenarını yeniden tutar. Okurken eller giderek titrer.
      const leftW = 1 - smoothstep(0.0, 0.12, lt) * (1 - smoothstep(0.58, 0.85, lt));
      const fr = holdPhoto(ctx, defne, { unfold: 1, flip: smoothstep(0.1, 0.6, lt), leftW, frame: { tremble: 0.3 + 0.9 * smoothstep(1.5, 4.5, lt) } });
      const fr0 = photoFrame(defne);            // titremesiz çerçeve: POV kamerası gözden bakar, fotoğraf onun önünde titrer
      const hp = fr0.C.clone();
      const head = defne.headWorld(V());
      const n = fr0.Z; void fr;
      // 0–4.8 sn: Defne'nin gözünden not (POV). 4.8 sn'de kesme: önden, korkmuş yüzüne yavaş itme
      // (eski geri çekilme hareketi kamerayı başın içinden geçiriyordu)
      const CUT = 4.8;
      if (lt < CUT) {
        cam(ctx, lt, { pos: hp.clone().addScaledVector(n, 0.28).add(V(0, 0.02, 0)), target: hp.clone().addScaledVector(fr0.Y, -0.01), fov: 36, shake: 0.12, dof: 1, focus: 0.28, aperture: 0.05 });
        keyAt(ctx, hp.clone().addScaledVector(n, 0.6).add(V(0.3, 0.5, 0)), hp, 8, 0xd8e0f0, 0.5);
      } else {
        const fc = faceCam(defne);
        const fw = fc.fwd.clone().setY(0).normalize(), sd = V(fw.z, 0, -fw.x);
        const k = smoothstep(CUT, 7.2, lt);
        const camPos = head.clone().addScaledVector(fw, 0.66 - 0.1 * k).addScaledVector(sd, 0.14).add(V(0, 0.0, 0));
        const camTgt = head.clone().add(V(0, -0.05, 0));
        defne.autoBlink = false;
        cam(ctx, lt, { pos: camPos, target: camTgt, fov: 32, shake: 0.12, dof: 1, focus: camPos.distanceTo(head), aperture: 0.04 });
        keyAt(ctx, head.clone().addScaledVector(fw, 1.1).addScaledVector(sd, -0.7).add(V(0, 0.7, 0)), head, 6, 0xd0dcf0, 0.45);
      }
      rimAt(ctx, head.clone().add(V(-0.6, 0.5, -0.8)), head, 10, 0x6a90c0);
      ctx.post.letterbox = 1;
    } },
  { id: 's4_08', scene: 4, set: SET, dur: 7.0, desc: 'Karanlık ekranın yansıması: Defne’nin gölgesi köşeye el sallar',
    cues: [S('final_sting', 2.6, 0)],
    update(ctx, lt) {
      const st = 27.1 + lt; stage(ctx, st); const { atlas, asya, defne, defneShadow } = ctx.chars; const P = ctx.props; const set = ctx.sets[SET];
      set.state.wallMirror = 1;
      // Atlas (Asya'nın desteğiyle ayakta) ve Asya kameranın arkasında: yalnızca yansımada görünürler.
      // Atlas hâlâ bitkin: dizleri hafif bükük, Asya'ya yaslanır; sağ kolu Asya'nın omzunda, Asya'nın sol kolu belinde.
      atlas.place(1.47, -2.05, Math.PI - 0.1); atlas.setPose('stand'); atlas.expr('tired', 0.8);
      atlas.mixPose({ hips: { y: -0.02, rot: [0, 0, 0.05] }, spine: [0.1, 0, 0.08], chest: [0.04, 0, 0.05], head: [0.12, 0, 0.1], lKnee: 0.18, rKnee: 0.12, lShoulder: [0.02, 0.02, 0], lElbow: [0.15], lHand: 'relaxed' });
      asya.place(1.83, -2.0, Math.PI + 0.12); asya.setPose('stand'); asya.mixPose({ spine: [0.03, 0, -0.04], head: [0.05, 0, -0.06] }); asya.expr('worried', 0.5);
      atlas.update(ctx.t); asya.update(ctx.t);
      atlas.ik.r = asya.boneWorld('rShoulder', V()).add(V(0.02, 0.07, 0.04)); atlas.ik.rW = 1; atlas.mixPose({ rHand: 'relaxed' });
      asya.ik.l = atlas.boneWorld('spine', V()).add(V(-0.05, 0.02, 0.13)); asya.ik.lW = 1; asya.mixPose({ lHand: 'open' });
      atlas.lookAt(V(1.7, 1.5, -3.9), 0.5, 1); asya.lookAt(V(1.7, 1.5, -3.9), 0.5, 1);
      // Defne önde solda, sırtı kameraya dönük, fotoğrafı iki eliyle göğsünün önünde tutuyor (yansımada ön yüzü görünür)
      defne.place(1.05, -2.75, Math.PI + 0.15); defne.expr('scared', 0.6);
      holdPhoto(ctx, defne, { unfold: 1, flip: 1, look: 0, frame: { tremble: 0.4 } });
      defne.lookAt(V(1.6, 1.5, -3.9), 0.6, 1); void P;
      // Gölge: odanın karanlık köşesine (sağ-arka) dönüp el sallar — yalnızca yansımada görünür
      defneShadow.root.visible = true; defneShadow.place(2.75, -1.55, 0.75); defneShadow.setPose('stand');
      const wv = smoothstep(2.0, 2.8, lt);
      defneShadow.setPose('wave', wv); defneShadow.mixPose({ rWrist: [0, Math.sin(ctx.t * 7) * 0.5 * wv, 0], rElbow: [Math.sin(ctx.t * 7) * 0.25 * wv] });
      defneShadow.lookAt(V(4.8, 1.3, 3.8), 0.8, 0); defneShadow.autoBlink = false;
      // gölgenin arkasındaki ön-sağ köşeyi soğukça aydınlat (yansımada siyah siluet net okunsun)
      keyAt(ctx, V(2.4, 2.95, 1.0), V(4.3, 0.9, 3.9), 140, 0x8aaad8, 0.6);
      fillAt(ctx, V(1.7, 2.4, -1.2), 5, 0x9ab0d0, 5);
      cam(ctx, lt, { pos: vtrack([[0, [1.7, 1.55, -2.35]], [7, [1.7, 1.58, -3.05]]], 'inOutSine'), target: V(1.7, 1.55, -3.95), fov: 40 });
      screenSheen(ctx);
      ctx.post.letterbox = 1; ctx.post.vignette = 0.65; ctx.post.fade = smoothstep(5.8, 7.0, lt);
      ctx.post.exposure = 1.5;
    } },
];
