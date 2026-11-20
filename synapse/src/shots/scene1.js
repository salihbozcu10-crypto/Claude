// SAHNE 1 — Teaser: Antika Sinyal (sunucu odası)
import * as THREE from 'three';
import { V, cam, vtrack, walkPath, say, faceLights, keyAt, fillAt, rimAt, grade, show, hold, placeProp, fadeIn, L, S, M, A, clamp, smoothstep, lerp, fbm1 } from './helpers.js';
import { POSES, mirrorPose } from '../characters/poses.js';

const SET = 'serverRoom';
const FL_PALM = V(0, -0.07, 0.012);   // el feneri gövde merkezi: sağ bilek yerel (avuç)
const GUN_GRIP = V(0, -0.065, 0.0);   // tabanca kabzasının oturduğu nokta: sağ bilek yerel
const GUN_GRIP_LOCAL = V(0, -0.045, -0.01); // tabanca yerel uzayında kabza merkezi
const REACH_L = mirrorPose(POSES.reachForward); // ekrana sol elle uzanma (sağ elde el feneri var)
const REACH_TGT = V(-0.04, 1.06, -0.2);          // uzanan sol elin hedefi: camın ~20 cm önünde, dokunmadan durur
// Asya'ya (Atlas'ın sol arkasında) dönüp sol avucuyla "dur" işareti
const STOP_L = { chest: [0, 0.4, 0], lShoulder: [0.75, 0.75, 0.1], lElbow: [0.85, 0], lWrist: [-0.95, 0, 0], lHand: 'open' };

// ekip başlangıçta kapıdan girer; yürüyüş yolları
const pathA = [V(0, 0, 5.2), V(0.02, 0, 3.4), V(0, 0, 1.6), V(0.05, 0, 0.55)];
const pathS = [V(-0.3, 0, 6.0), V(-0.4, 0, 3.8), V(-0.6, 0, 2.0), V(-0.75, 0, 0.9)];
const pathD = [V(0.35, 0, 6.6), V(0.35, 0, 4.2), V(0.6, 0, 2.2), V(0.78, 0, 1.0)];
const WALK0 = 1.4; // küresel sahne zamanında ekip yürümeye başlar
const S1 = { A: [WALK0, WALK0 + 10.0], S: [WALK0 + 0.3, WALK0 + 11.0], D: [WALK0 + 0.5, WALK0 + 12.6] };
const CRT_ON = 18.0; // CRT açılır (sahne zamanı)
const LUNGE = 0.2;   // s1_07'den itibaren Atlas'ın ekrana doğru attığı adım (m)
const LUNGE_X = 0.1; // adımın yana bileşeni (ekranın sağ yarısına; yansımada Asya ile arasında boşluk kalır)
// s1_08: CRT camındaki yansıma. Cam ekranın ortasının altından bakan kamera, yansımada ekibin
// başlarını gösterir; dördüncü figür Atlas ile Asya arasındaki boşlukta, ekibin hemen arkasında durur.
const SHADOW_AT = Object.assign(V(-0.45, 0, 1.2), { heading: Math.PI + 0.2 });
const S8_CAM = [[0, [0.1, 0.86, 0.06]], [4.5, [0.08, 0.87, 0.0]]];
const S8_CAM_F = (t) => 0.47 - t * 0.012;
const S8_GLOW = V(-0.8, 1.85, 2.5);

// ---- yardımcılar ----
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpA = (a, b, k) => a + wrapA(b - a) * k;
const lerpV = (a, b, k) => a.clone().lerp(b, k);
const STRIDE = 0.62; // walkPath varsayılan adım boyu
// yol yönü: köşelerde ±0.35 m boyunca yumuşak dönüş (tek karelik yön sıçraması olmasın)
function pathHeading(pts, d, blend = 0.35) {
  let h = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z), acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += pts[i].distanceTo(pts[i - 1]);
    const hn = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    h = lerpA(h, hn, smoothstep(acc - blend, acc + blend, d));
  }
  return h;
}
// walk() benzeri; varılınca son yöne ani geçiş yerine ~0.8 sn'lik yumuşak dönüş
function walkS(ch, pts, t0, t1, st, { heading = null, strideScale = 1 } = {}) {
  const w = walkPath(pts, t0, t1, st);
  let h = pathHeading(pts, w.phase * STRIDE);
  if (heading != null) h = lerpA(h, heading, smoothstep(t1 - 0.7, t1 + 0.1, st));
  ch.place(w.pos.x, w.pos.z, h);
  if (w.amount > 0) ch.walk(w.phase, w.amount, { run: 0, stride: strideScale });
  return w;
}
// karakter kemiklerini bu karenin zamanıyla güncelle (önceki karenin zamanını kullanmasın)
const syncAt = (ch, t) => { ch.lastT = t; ch._synced = false; ch.sync(); };
// aksesuarı kemiğe bağla; dünya uzayında `grip` noktası `at`ta, +z ekseni `target`a bakacak şekilde
const _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function aimProp(prop, bone, at, target, grip = V(), roll = 0) {
  hold(prop, bone);
  const z = target.clone().sub(at).normalize();
  let x = V(0, 1, 0).cross(z); if (x.lengthSq() < 1e-6) x = V(1, 0, 0); x.normalize();
  const y = z.clone().cross(x);
  _m4.makeBasis(x, y, z); _q1.setFromRotationMatrix(_m4);
  if (roll) _q1.multiply(_q2.setFromAxisAngle(V(0, 0, 1), roll));
  const bs = bone.getWorldScale(V()).x;
  const origin = at.clone().sub(grip.clone().multiplyScalar(bs).applyQuaternion(_q1));
  const bq = bone.getWorldQuaternion(new THREE.Quaternion());
  prop.group.quaternion.copy(bq.invert().multiply(_q1));
  prop.group.position.copy(bone.worldToLocal(origin));
}
const fwdOf = (ch) => V(Math.sin(ch.root.rotation.y), 0, Math.cos(ch.root.rotation.y));
const leftOf = (ch) => V(Math.cos(ch.root.rotation.y), 0, -Math.sin(ch.root.rotation.y));

// her karede stage() doldurur, çekim kodu değiştirebilir, finalize() uygular
let F = null;

// sahne-zamanı (st) tabanlı ortak kurulum: her çekim kendi başlangıç ofsetini verir
function stage(ctx, st) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET]; const P = ctx.props;
  show(atlas, asya, defne);
  // pozlar (önce), sonra yürüyüş eklenir
  atlas.setPose('holdFlashlight'); asya.setPose('lowReady'); defne.setPose('holdTablet');
  // tablete bakarken baş/boyun aşırı öne düşmesin (çene yakaya gömülmesin)
  defne.mixPose({ head: [-0.2, 0, 0], neck: [-0.05, 0, 0] });
  const wa = walkS(atlas, pathA, S1.A[0], S1.A[1], st, { heading: Math.PI, strideScale: 0.95 });
  const ws = walkS(asya, pathS, S1.S[0], S1.S[1], st, { heading: Math.PI - 0.25 });
  const wd = walkS(defne, pathD, S1.D[0], S1.D[1], st, { heading: Math.PI + 0.3, strideScale: 0.85 });
  // el feneri ile tarama (baş + gövde); CRT bulununca yumuşakça söner
  const kFind = smoothstep(CRT_ON - 1.6, CRT_ON - 0.7, st);
  const scan = (Math.sin(st * 0.9) * 0.35 + fbm1(st * 0.5) * 0.2) * (1 - kFind);
  atlas.mixPose({ chest: [0, scan * 0.4, 0], head: [0, scan * 0.6, 0] });
  asya.mixPose({ head: [0, Math.sin(st * 0.7 + 1) * 0.5, 0], chest: [0, Math.sin(st * 0.7 + 1) * 0.2, 0] });
  atlas.expr('focused', 0.6); atlas.expr('tired', 0.3); asya.expr('suspicious', 0.7); defne.expr('focused', 0.6);
  // aksesuarlar (yön/konum finalize'da kesinleşir)
  hold(P.flashlight, atlas.bones.rWrist); P.flashlight.on = 1; P.flashlight.intensity = lerp(1, 0.14, kFind); P.flashlight.spot.distance = 14; P.flashlight.spot.castShadow = true; // yakındaki CRT'yi yakmasın
  hold(P.pistol, asya.bones.rWrist); P.pistol.charge = 0.35;
  hold(P.tablet, defne.bones.chest, [0, 0.1, 0.31], [-0.85, 0, 0]); P.tablet.mode = 'signal';
  P.tablet.prox = clamp((st - 2) / 14, 0.05, 0.98);
  // CRT
  placeProp(ctx, P.crt, set.anchors.crt, 0);
  const pw = clamp((st - CRT_ON) / 0.9);
  P.crt.power = pw; P.crt.countdown = 900 - Math.max(0, st - CRT_ON - 0.6);
  set.state.flicker = st > CRT_ON - 0.2 && st < CRT_ON + 1.5 ? 0.6 * (1 - (st - CRT_ON + 0.2) / 1.7) : 0;
  if (st > CRT_ON) P.tablet.mode = 'alert';
  const crtEye = set.anchors.crt.clone().add(V(0, 0.28, 0.15));
  const crtBody = set.anchors.crt.clone().add(V(0.03, 0.06, 0.24)); // el feneri: CRT'nin ayağı/ekranın altı (ekranı yakmadan)
  // el feneri hedefi: ileride zemini tarar, sonra CRT'ye oturur
  const ah = atlas.root.rotation.y + scan * 1.1; const ap = atlas.root.position;
  const scanTgt = V(ap.x + Math.sin(ah) * 3.0, 0.75, ap.z + Math.cos(ah) * 3.0);
  // gözler: CRT açıldıktan sonra ekrana bakış (yumuşak geçiş)
  const kEye = smoothstep(CRT_ON + 0.2, CRT_ON + 0.75, st);
  if (kEye > 0) { atlas.lookAt(crtEye, 0.8 * kEye, kEye); asya.lookAt(crtEye, 0.7 * kEye, kEye); }
  syncAt(defne, ctx.t);
  const tabletPos = P.tablet.group.getWorldPosition(V());
  defne.lookAt(lerpV(tabletPos, crtEye, kEye), lerp(0.3, 0.6, kEye), 1);
  F = { st, fl: { target: lerpV(scanTgt, crtBody, kFind), ik: 1 }, gun: { aim: 0, target: crtEye.clone().add(V(0, -0.05, 0)) }, tabletW: 1 };
  grade(ctx, 'serverRoom');
  ctx.RIM.color.value.set(0x5ab0ff); ctx.RIM.strength.value = 0.22;
  return { wa, ws, wd, crtEye, crtBody };
}

// pozlar kesinleştikten sonra: IK (tablet tutan eller, nişan alan kollar, el feneri kolu) ve aksesuar yönleri
function finalize(ctx) {
  if (!F) return;
  const { atlas, asya, defne } = ctx.chars; const P = ctx.props; const t = ctx.t;
  // Defne: tablet iki elinde (avuçlar kenarlarda)
  if (F.tabletW > 0) {
    syncAt(defne, t);
    const tg = P.tablet.group;
    defne.ik.l = tg.localToWorld(V(0.15, -0.03, -0.015)); defne.ik.lW = F.tabletW;
    defne.ik.r = tg.localToWorld(V(-0.15, -0.03, -0.015)); defne.ik.rW = F.tabletW;
  }
  // Asya: şok tabancası — hazırda yere, nişanda iki elle hedefe
  if (F.gun) {
    syncAt(asya, t);
    const k = F.gun.aim; const fwd = fwdOf(asya), left = leftOf(asya);
    const lowT = asya.root.position.clone().addScaledVector(fwd, 1.5).add(V(0, 0.02, 0));
    const aimT = F.gun.target;
    if (k > 0.001) {
      const eye = asya.headWorld(V());
      const dir = aimT.clone().sub(eye).normalize();
      const gp = eye.clone().addScaledVector(dir, 0.44).add(V(0, -0.09, 0)); // kabza: yüzün önünde, göz hizasının altında
      asya.ik.r = gp; asya.ik.rW = k;
      asya.ik.l = gp.clone().addScaledVector(left, 0.03).addScaledVector(dir, -0.012).add(V(0, -0.04, 0)); asya.ik.lW = k * 0.95;
      asya.mixPose({ lHand: 'grip' }, 1);
      syncAt(asya, t);
    }
    const grip = asya.bones.rWrist.localToWorld(GUN_GRIP.clone());
    aimProp(P.pistol, asya.bones.rWrist, grip, lerpV(lowT, aimT, k), GUN_GRIP_LOCAL);
  }
  // Atlas: el feneri kolu hedefe uzanır, ışık hedefe bakar
  if (F.fl) {
    syncAt(atlas, t);
    const tgt = F.fl.target;
    if (F.fl.ik > 0) {
      const shR = atlas.boneWorld('rShoulder', V());
      const dir = tgt.clone().sub(shR).normalize();
      atlas.ik.r = shR.clone().addScaledVector(dir, 0.38).add(V(0, -0.1, 0)); atlas.ik.rW = F.fl.ik;
      syncAt(atlas, t);
    }
    const palm = atlas.bones.rWrist.localToWorld(FL_PALM.clone());
    aimProp(P.flashlight, atlas.bones.rWrist, palm, tgt);
  }
}

const shots = [
  // 1) Kuruluş: karanlık oda, ışık huzmeleri; kapıdan el feneri giriyor
  { id: 's1_01', scene: 1, set: SET, dur: 6.0, desc: 'Kuruluş planı: sunucu odası, ekip kapıdan giriyor',
    cues: [A('amb_rain_muffled', 0, 52, -6), A('amb_drips', 0, 52, -4), A('amb_room_hum', 0, 52, -10), M('mus_s1_dark', 0, -2), S('flashlight_click', 1.2, -6), S('footsteps_wet', 1.6, -8, { dur: 10 })],
    update(ctx, lt) {
      const st = lt; stage(ctx, st); const { atlas, defne } = ctx.chars; const set = ctx.sets[SET];
      cam(ctx, lt, { pos: vtrack([[0, [-0.9, 2.0, -3.4]], [6, [-0.75, 1.8, -2.9]]], 'inOutSine'), target: vtrack([[0, [0.2, 1.0, 3.0]], [6, [0.15, 1.1, 2.6]]], 'inOutSine'), fov: 44, shake: 0.3 });
      // ekibi okunur kıl: kamera tarafından yumuşak soğuk anahtar, arkalarında kapıdan sızan ışık; huzme pusu biraz azalır
      const mid = atlas.root.position.clone().lerp(defne.root.position, 0.5);
      keyAt(ctx, mid.clone().add(V(-0.6, 2.4, -2.6)), mid.clone().add(V(0, 1.1, 0)), 34, 0xa8c4ff, 0.42);
      set.state.shaft = 0.55; set.state.doorGlow = 2.2; ctx.props.flashlight.intensity = 0.45; ctx.props.flashlight.spot.distance = 3.6; F.fl.target.y = 1.0; // ıslak zeminde uzak sıcak nokta olmasın
      ctx.props.flashlight.spot.castShadow = false; // kapı kanadının sert gölgesi raflara düşmesin
      ctx.props.flashlight.beam = 0; // kameraya dönük koni uçtan bakınca karanlık disk bırakıyor
      ctx.post.fade = fadeIn(lt, 1.6); ctx.post.letterbox = 1;
    } },
  // 2) Koridorda takip: ekip yaklaşıyor; Defne mırıldanmaya başlar
  { id: 's1_02', scene: 1, set: SET, dur: 5.5, desc: 'Koridorda önden takip çekimi; Defne: "Sinyal kaynağı..."',
    cues: [L('L01', 1.6)],
    update(ctx, lt) {
      const st = 6.0 + lt; const { atlas, defne } = ctx.chars; stage(ctx, st);
      say(ctx, defne, 'L01', 1.6, lt, 0.8);
      // önden takip; Defne konuşmaya başlayınca netlik ona kayar, yüzüne anahtar ışık düşer
      const a = atlas.root.position; const dh = defne.headWorld(V());
      const cp = V(a.x + 0.55, 1.45, a.z - 1.9);
      const kD = smoothstep(1.1, 2.1, lt);
      const tg = V(lerp(a.x - 0.05, (a.x + dh.x) * 0.5 + 0.05, kD), lerp(1.25, 1.3, kD), lerp(a.z + 0.6, a.z + 1.0, kD));
      cam(ctx, lt, { pos: cp, target: tg, fov: 34, shake: 0.6, dof: 0.6, focus: lerp(cp.distanceTo(atlas.headWorld(V())), cp.distanceTo(dh), kD), aperture: 0.05 });
      keyAt(ctx, dh.clone().add(V(-0.35, 0.55, -1.1)), dh, 9, 0xa8c8ff, 0.4);
      fillAt(ctx, dh.clone().add(V(0.3, -0.1, -0.6)), 1.2, 0x60c8ff, 2);
      rimAt(ctx, a.clone().add(V(-0.6, 2.2, 1.0)), atlas.headWorld(V()), 10, 0x5ab0ff);
      ctx.sets[SET].state.shaft = 0.6;
      ctx.post.letterbox = 1;
    } },
  // 3) Defne yakın: tabletin ışığı yüzünde
  { id: 's1_03', scene: 1, set: SET, dur: 5.0, desc: 'Defne yakın plan, tablet ışığı yüzünde',
    cues: [],
    update(ctx, lt) {
      const st = 11.5 + lt; const { defne } = ctx.chars; stage(ctx, st);
      say(ctx, defne, 'L01', 1.6 - 5.5, lt, 0.8);
      defne.expr('worried', 0.4 + 0.4 * smoothstep(1, 3, lt)); defne.face.browSad += 0.2;
      const h = defne.headWorld(V());
      cam(ctx, lt, { pos: V(h.x - 0.25, h.y - 0.13, h.z - 0.72), target: h.clone().add(V(0, -0.06, 0)), fov: 30, shake: 0.4, dof: 1, focus: 0.8, aperture: 0.07 });
      keyAt(ctx, h.clone().add(V(0.05, -0.35, -0.35)), h, 3, 0x60c8ff, 0.5);
      rimAt(ctx, h.clone().add(V(0.6, 0.6, 0.9)), h, 16, 0x5ab0ff);
      fillAt(ctx, h.clone().add(V(-0.6, 0.2, -0.4)), 0.4, 0xffc070, 2);
      ctx.post.letterbox = 1;
    } },
  // 4) Ekip durur; el feneri CRT'yi bulur; CRT kendiliğinden açılır
  { id: 's1_04', scene: 1, set: SET, dur: 5.5, desc: 'Arkadan geniş: el feneri CRT\'yi bulur, ekran kendiliğinden yanar',
    cues: [S('crt_on', CRT_ON - 16.5, -2), A('crt_whine', CRT_ON - 16.5 + 0.4, 34, -14), S('sting_low', CRT_ON - 16.5, -6)],
    update(ctx, lt) {
      const st = 16.5 + lt; stage(ctx, st);
      // arka-sol omuz üstünden: ekran Atlas ile Asya arasındaki boşlukta görünür
      cam(ctx, lt, { pos: vtrack([[0, [-0.95, 1.9, 2.6]], [5.5, [-0.98, 1.78, 2.25]]], 'inOutSine'), target: vtrack([[0, [0.0, 1.0, -0.35]], [5.5, [0.0, 0.98, -0.4]]], 'inOutSine'), fov: 36, shake: 0.35, dof: 0.5, focus: (t) => 3.0 - t * 0.06 });
      ctx.post.letterbox = 1;
    } },
  // 5) CRT ekleme: yeşil sayaç
  { id: 's1_05', scene: 1, set: SET, dur: 2.5, desc: 'CRT ekranı yakın: 00:15:00 geri sayım',
    cues: [S('beep_count', 0.3, -10), S('beep_count', 1.3, -10), S('beep_count', 2.3, -10)],
    update(ctx, lt) {
      const st = 22 + lt; stage(ctx, st); ctx.props.crt.glassSheen = 0.35;
      F.fl.target = ctx.sets[SET].anchors.crt.clone().add(V(0.4, -0.3, 0.3)); // huzme ekranın önünden geçmesin
      const c = ctx.sets[SET].anchors.crt;
      cam(ctx, lt, { pos: vtrack([[0, [c.x - 0.1, c.y + 0.32, c.z + 0.85]], [2.5, [c.x - 0.07, c.y + 0.3, c.z + 0.7]]]), target: V(c.x, c.y + 0.28, c.z + 0.15), fov: 32, dof: 0.8, focus: 0.62, aperture: 0.05 });
      ctx.post.letterbox = 1;
    } },
  // 6) Asya tabancayı doğrultur
  { id: 's1_06', scene: 1, set: SET, dur: 4.5, desc: 'Asya kaşlarını çatıp tabancayı doğrultur',
    cues: [L('L02', 0.4), S('pistol_charge', 0.1, -6)],
    update(ctx, lt) {
      const st = 24.5 + lt; const { asya } = ctx.chars; const r = stage(ctx, st);
      const k = smoothstep(0, 0.6, lt);
      asya.setPose('aimPistol', k); asya.expr('angry', 0.8 * k); asya.lookAt(r.crtEye, 0.9, 1);
      F.gun.aim = k;
      ctx.props.pistol.charge = 0.35 + 0.65 * k; ctx.props.pistol.spark = lt > 0.6 ? 0.5 + 0.5 * Math.sin(lt * 30) : 0;
      say(ctx, asya, 'L02', 0.4, lt);
      const h = asya.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.55, h.y - 0.1, h.z - 1.1]], [4.5, [h.x + 0.45, h.y - 0.08, h.z - 0.95]]]), target: h.clone().add(V(0.05, -0.16, 0)), fov: 36, shake: 0.5, dof: 1, focus: 1.1 });
      faceLights(ctx, asya, { key: 7, keyColor: 0x80ffb0, rim: 14, rimColor: 0x5ab0ff, side: -1 });
      ctx.post.letterbox = 1;
    } },
  // 7) Atlas öne atılır: "Bekle, dokunma! ... Bu bir imza."
  { id: 's1_07', scene: 1, set: SET, dur: 4.0, desc: 'Atlas öne atılır, elini ekrana uzatır',
    cues: [L('L03', 0.2)],
    update(ctx, lt) {
      const st = 29 + lt; const { atlas, asya } = ctx.chars; const r = stage(ctx, st);
      const aimK = 1 - smoothstep(0.8, 1.6, lt) * 0.6;
      asya.setPose('aimPistol', aimK); asya.expr('angry', 0.6); F.gun.aim = aimK;
      // önce Asya'ya sol elle "dur" işareti, sonra aynı elle ekrana uzanış (sağ elde el feneri)
      const s1 = smoothstep(0.1, 0.5, lt) * (1 - smoothstep(1.4, 1.9, lt));
      const s2 = smoothstep(1.6, 2.6, lt);
      atlas.setPose(STOP_L, s1); atlas.setPose(REACH_L, s2); atlas.mixPose({ spine: [0.14, 0, 0], chest: [0.05, 0, 0] }, s2);
      atlas.root.position.z -= LUNGE * s2; atlas.root.position.x += LUNGE_X * s2;
      if (s2 > 0.01) { atlas.ik.l = REACH_TGT; atlas.ik.lW = s2 * 0.9; }
      atlas.expr('worried', 0.5 * s1); atlas.expr('surprised', 0.4 * s2);
      const kL = smoothstep(1.2, 1.7, lt);
      atlas.lookAt(lerpV(asya.headWorld(V()), r.crtEye, kL), lerp(0.7, 1, kL), 1);
      say(ctx, atlas, 'L03', 0.2, lt);
      // yandan: yüz, uzanan el ve ekran aynı karede
      const h = atlas.headWorld(V());
      const cp = vtrack([[0, [-1.8, 1.47, 0.18]], [4, [-1.32, 1.4, 0.0]]], 'inOutSine')(lt);
      cam(ctx, lt, { pos: cp, target: V(h.x * 0.5 - 0.02, h.y - 0.22, h.z - 0.22), fov: 38, shake: 0.4, dof: 0.6, focus: cp.distanceTo(h) });
      faceLights(ctx, atlas, { key: 6, keyColor: 0x80ffb0, rim: 12, rimColor: 0x5ab0ff });
      ctx.post.letterbox = 1;
    } },
  // 8) CRT camındaki yansıma: arkalarında dördüncü siluet
  { id: 's1_08', scene: 1, set: SET, dur: 4.5, desc: 'CRT camındaki yansıma: dördüncü siluet belirir',
    cues: [S('sting_reveal', 1.6, 0), S('heartbeat', 1.8, -6, { dur: 4 })],
    update(ctx, lt) {
      const st = 33 + lt; const { atlas, shadow } = ctx.chars; const r = stage(ctx, st);
      atlas.setPose(REACH_L, 0.15); atlas.mixPose({ spine: [0.14, 0, 0], chest: [0.05, 0, 0] }, 1); atlas.root.position.z -= LUNGE; atlas.root.position.x += LUNGE_X; atlas.expr('focused', 0.5);
      const set = ctx.sets[SET]; const c = set.anchors.crt; const P = ctx.props;
      F.fl.target = V(0.9, 0, 0.2); F.fl.ik = 0.6; P.flashlight.intensity = 0.5;
      // gölge figür: ekibin arkasında
      // figür Asya'nın arkasından süzülerek boşluğa çıkar
      const sf = SHADOW_AT; shadow.place(lerp(sf.x - 0.5, sf.x, smoothstep(0.6, 2.4, lt)), sf.z, sf.heading); shadow.autoBlink = false; shadow.idle = 0.2;
      const vis = smoothstep(1.2, 2.6, lt);
      shadow.root.scale.setScalar(1.1);
      P.crt.reflection = 0.45 + 0.5 * vis;
      shadow.root.visible = true; // hep orada: arka parıltı yükseldikçe siluet karanlıktan belirir
      // figürün arkasında soğuk pus parıltısı: yansımada karanlık bir kapüşonlu siluet olarak okunur
      set.state.backGlow = 0.8 * vis; set.state.backGlowAt = S8_GLOW; set.state.backGlowSize = 2.6;
      P.crt.glassSheen = 0; // camın nokta parlamaları yansımayı boğmasın
      // sivri kapüşon (yalnızca bu sette yaşayan kabuk) figürün başına
      if (shadow.root.visible) { syncAt(shadow, ctx.t); set.state.hood = shadow.bones.face.matrixWorld.clone(); }
      ctx.RIM.strength.value = 0.22 + 0.08 * vis;
      cam(ctx, lt, { pos: vtrack(S8_CAM, 'inOutSine'), target: V(c.x, c.y + 0.28, c.z + 0.19), fov: 30, dof: 0.6, focus: (t) => S8_CAM_F(t), aperture: 0.04 });
      ctx.post.letterbox = 1; ctx.post.vignette = 0.6;
    } },
  // 9) Atlas'ın gözleri büyür
  { id: 's1_09', scene: 1, set: SET, dur: 2.0, desc: 'Atlas yakın: nefesi kesilir',
    cues: [],
    update(ctx, lt) {
      const st = 37.5 + lt; const { atlas } = ctx.chars; const r = stage(ctx, st);
      const back = smoothstep(0.2, 1.2, lt);
      atlas.setPose(REACH_L, 0.15 * (1 - back)); atlas.mixPose({ spine: [0.14, 0, 0], chest: [0.05, 0, 0] }, 1 - back); atlas.root.position.z -= LUNGE; atlas.root.position.x += LUNGE_X;
      const k = smoothstep(0.1, 0.6, lt);
      atlas.expr('focused', -0.6 * k); atlas.expr('tired', -0.3 * k);
      atlas.expr('shock', k); atlas.face.open = 0.3 * smoothstep(0.2, 0.6, lt); atlas.breath = 0;
      atlas.lookAt(r.crtEye, 1, 1); ctx.props.crt.light = 0.3; atlas.catchlight.on = 0;
      // kamera bakış çizgisine yakın: gözler üst üçte birde, ağız (nefesin kesilişi) kadrajda
      const h = atlas.headWorld(V()); const e = atlas.eyeWorld(V());
      const dir = r.crtEye.clone().sub(e).normalize(); const side = V().crossVectors(dir, V(0, 1, 0)).normalize();
      const d = lerp(0.56, 0.44, smoothstep(0, 2, lt));
      const cp = e.clone().addScaledVector(dir, d).addScaledVector(side, 0.06);
      cam(ctx, lt, { pos: cp, target: e.clone().add(V(0, -0.04, 0)), fov: 28, dof: 1, focus: d, aperture: 0.06 });
      keyAt(ctx, e.clone().addScaledVector(dir, 0.6).addScaledVector(side, -0.45).add(V(0, 0.4, 0)), e, 4, 0x60ff90, 0.5);
      rimAt(ctx, h.clone().add(V(-0.6, 0.7, 0.8)), h, 18, 0x5ab0ff);
      ctx.post.letterbox = 1;
    } },
  // 10) Hızla döner — oda boş
  { id: 's1_10', scene: 1, set: SET, dur: 2.5, desc: 'Atlas hızla arkasını döner: kimse yok',
    cues: [S('whoosh_turn', 0.15, -2)],
    update(ctx, lt) {
      const st = 39.5 + lt; const { atlas, asya, defne } = ctx.chars; stage(ctx, st);
      const k = smoothstep(0.0, 0.35, lt);
      atlas.root.position.z -= LUNGE; atlas.root.position.x += LUNGE_X;
      atlas.root.rotation.y = Math.PI - k * Math.PI * 0.95;
      atlas.setPose('alert'); atlas.setPose('holdFlashlight', 0.8); atlas.expr('scared', 0.8);
      asya.lookAt(atlas.headWorld(V()), 0.6, 1); defne.lookAt(atlas.headWorld(V()), 0.6, 1); defne.expr('worried', 0.6);
      const a = atlas.root.position;
      F.fl.target = a.clone().addScaledVector(fwdOf(atlas), 3).add(V(0, 0.8, 0));
      cam(ctx, lt, { pos: V(a.x - 0.35, 1.55, a.z - 0.75), target: V(0.1, 1.3, 3.5), fov: 38, shake: 1.2 * (1 - smoothstep(0.3, 1.5, lt)) + 0.3, dof: 0.4, focus: 3 });
      ctx.post.letterbox = 1;
    } },
  // 11) Sayaç hızlanır; kan kırmızısı mesaj; sistem sesi
  { id: 's1_11', scene: 1, set: SET, dur: 7.0, desc: 'Sayaç hızlanır, kırmızı mesaj belirir (sistem sesi)',
    cues: [L('L04', 0.9), S('countdown_accel', 0.0, -6), S('text_reveal_red', 0.8, -2), S('glitch_1', 0.6, -6), S('glitch_2', 3.8, -8)],
    update(ctx, lt) {
      const st = 42 + lt; stage(ctx, st);
      const P = ctx.props; const c = ctx.sets[SET].anchors.crt;
      // hızlanan sayaç
      const base = 900 - (st - CRT_ON - 0.6);
      P.crt.countdown = base - Math.pow(Math.max(0, lt), 2.2) * 9;
      P.crt.message = smoothstep(0.8, 5.0, lt); P.crt.glitch = 0.15 + 0.5 * Math.max(0, Math.sin(lt * 9)) * (lt < 1.5 ? 1 : 0.3);
      ctx.sets[SET].state.flicker = 0.4;
      // ekleme çekimi: Atlas geri çekilmiş, kollar inik (kamera yolunda kimse yok); mesaj sonda bantta kesilmez
      const { atlas } = ctx.chars; atlas.setPose('alert'); atlas.root.position.z = 0.95; F.fl.ik = 0;
      F.fl.target = atlas.root.position.clone().add(V(0.1, 0, -1.0));
      const cp = vtrack([[0, [c.x + 0.12, c.y + 0.36, c.z + 0.97]], [7, [c.x + 0.03, c.y + 0.25, c.z + 0.76]]], 'inOutSine');
      const tg = vtrack([[0, [c.x, c.y + 0.28, c.z + 0.15]], [7, [c.x, c.y + 0.235, c.z + 0.18]]], 'inOutSine');
      cam(ctx, lt, { pos: cp, target: tg, fov: 32, shake: 0.2, dof: 0.6, focus: (t) => cp(t).distanceTo(tg(t)) });
      ctx.post.glitch = lt > 0.6 && lt < 1.1 ? 0.6 : 0; ctx.post.ca = 0.003;
      ctx.post.letterbox = 1;
    } },
  // 12) Kırmızıyla aydınlanan yüzler; kesme
  { id: 's1_12', scene: 1, set: SET, dur: 4.0, desc: 'Ters açı: üçü kırmızı ışıkta donakalmış',
    cues: [S('sub_drop', 3.4, -2)],
    update(ctx, lt) {
      const st = 49 + lt; const { atlas, asya, defne } = ctx.chars; const r = stage(ctx, st);
      const P = ctx.props; P.crt.message = 1; P.crt.countdown = 900 - (st - CRT_ON) - 8 * 49 / 7 - lt * 30;
      atlas.setPose('alert'); atlas.root.position.z -= LUNGE; atlas.root.position.x += LUNGE_X; atlas.expr('shock', 0.7); atlas.lookAt(r.crtEye, 1, 1);
      asya.setPose('aimPistol', 0.7); asya.expr('angry', 0.4); asya.expr('scared', 0.4); F.gun.aim = 0.7;
      defne.expr('scared', 0.9);
      const c = ctx.sets[SET].anchors.crt;
      // CRT'nin üstünden ters açı: üçü birden kadrajda; kamera gruptan uzaklaşır
      F.fl.ik = 0; F.fl.target = atlas.root.position.clone().add(V(0.1, 0, -0.9));
      const cp = vtrack([[0, [c.x + 0.04, c.y + 0.6, c.z + 0.18]], [4, [c.x + 0.04, c.y + 0.64, c.z + 0.05]]], 'inOutSine');
      cam(ctx, lt, { pos: cp, target: V(0.02, 1.42, 0.8), fov: 46, dof: 0.5, focus: (t) => cp(t).distanceTo(V(0.1, 1.5, 0.3)) + 0.15 });
      keyAt(ctx, V(c.x, c.y + 0.35, c.z + 0.35), V(0, 1.45, 0.8), 3.6, 0xff2a1a, 0.75);
      P.crt.light = 0.45;
      ctx.post.fade = smoothstep(3.3, 4.0, lt); ctx.post.letterbox = 1;
    } },
];

// her çekimden sonra ortak son adım (IK + aksesuar yönleri)
export const scene1 = shots.map((s) => ({ ...s, update(ctx, lt, k, t) { F = null; s.update(ctx, lt, k, t); finalize(ctx); } }));
export const SCENE1_DUR = scene1.reduce((a, s) => a + s.dur, 0);
