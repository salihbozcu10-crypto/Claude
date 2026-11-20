// SAHNE 2 — Gelişme: Sığınak ve Kilitlenen Zihinler (üs)
import * as THREE from 'three';
import { V, cam, vtrack, track, walk, say, faceLights, keyAt, fillAt, rimAt, grade, show, hold, placeProp, fadeIn, L, S, M, A, DUR, clamp, smoothstep, lerp, fbm1 } from './helpers.js';
import { noise1 } from '../engine/util.js';

const SET = 'base';
export const POS = {
  defneSeat: Object.assign(V(-2.3, 0, -2.72), { heading: Math.PI }),
  atlasScreens: Object.assign(V(-0.62, 0, -2.75), { heading: -2.5 }),
  asyaTable: Object.assign(V(0.6, 0, 1.18), { heading: Math.PI }),
};
const SLAM = 2.45; // s2_01 içinde masaya vuruş
const SCREEN_LOOK = V(-1.85, 2.0, -3.9); // Atlas'ın baktığı duvar ekranı
const TERM_LOOK = V(-2.3, 1.18, -3.55); // Defne'nin ana terminal ekranı
// sağ elle Atlas'a işaret (kol hafif içe: Asya'nın önü-solundaki Atlas'a doğru)
const RPOINT = { rShoulder: [1.6, -0.12, 0], rElbow: [0.12, 0], rWrist: [0.05, 0, 0], rHand: 'point' };

// Bakış hedefini baş çevresinde açısal olarak karıştır (küresel ara değer). Uzak iki noktayı doğrusal
// karıştırmak baş dönüşünü birkaç kareye sıkıştırabiliyor; burada açı hızı eşit dağılır.
function gazeMix(ch, a, b, k) {
  k = clamp(k);
  if (k <= 0) return a.clone();
  if (k >= 1) return b.clone();
  const h = ch.headWorld(V());
  const da = a.clone().sub(h), db = b.clone().sub(h);
  const ra = da.length(), rb = db.length(); da.normalize(); db.normalize();
  const om = Math.acos(clamp(da.dot(db), -1, 1));
  if (om < 1e-3) return a.clone().lerp(b, k);
  const s = Math.sin(om);
  const d = da.multiplyScalar(Math.sin((1 - k) * om) / s).add(db.multiplyScalar(Math.sin(k * om) / s));
  return h.add(d.multiplyScalar(lerp(ra, rb, k)));
}

// Defne'nin elleri klavyede (IK): 'typing' pozu tek başına elleri masanın altına sokuyordu.
// Klavye: merkez (-2.3, 0.807 üst yüz, -3.0), 0.48 genişlik. Defne -z'ye bakar, sol eli -x tarafında.
const KEYS = { y: 0.842, z: -2.985, l: -2.405, r: -2.195 };
const FREEZE = 26.0; // sahne-2 zamanında donma anı (s2_04 lt 2.0)
function defneKeys(defne, st, w) {
  if (w <= 0) return;
  const typ = 1 - smoothstep(FREEZE - 0.06, FREEZE + 0.12, st); // fırtına gibi yazma → donma
  const lift = smoothstep(FREEZE, FREEZE + 0.35, st); // donunca eller tuşlardan hafifçe kalkar
  for (const s of ['l', 'r']) {
    const o = s === 'l' ? 0 : 7.3;
    const ph = st * (s === 'l' ? 6.3 : 7.1) * Math.PI * 2 + noise1(st * 2.1 + o) * 2.5;
    const strike = Math.pow(Math.max(0, Math.sin(ph)), 3); // tuşa vuruş
    const dx = (noise1(st * 1.7 + o) * 0.04 + noise1(st * 6.3 + o + 3) * 0.008) * typ;
    const dz = noise1(st * 2.2 + o + 11) * 0.018 * typ;
    const dy = (0.012 * (1 - strike) - 0.004) * typ + 0.03 * lift;
    defne.ik[s] = V(KEYS[s] + dx, KEYS.y + dy, KEYS.z + dz); defne.ik[s + 'W'] = w;
    // parmaklar: her biri kendi ritminde tuşlara iner; donunca hafif açılır
    const fing = [0.3, 0.38, 0.42, 0.45, 0.5].map((c, i) => (i === 0 ? c : c + typ * 0.38 * Math.pow(Math.max(0, Math.sin(st * (19 + i * 4.3) + i * 1.9 + o)), 2) - lift * 0.18));
    defne.setPose({ [s + 'Hand']: fing }, w);
    // bilek: avuç aşağı (önkol burulması -1.5) + vuruşta bükülme
    defne.mixPose({ [s + 'Wrist']: [0.18 * strike * typ - 0.1 * lift, 0, -1.5] }, w);
  }
}

// ortak kurulum (st: sahne-2 zamanı)
function stage(ctx, st) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET];
  show(atlas, asya, defne);
  set.state.mode = 'normal'; set.state.screens = 'code';
  // Defne: terminalde oturuyor, yazıyor (s2_05'te eller klavyeden kalkar)
  defne.place(POS.defneSeat.x, POS.defneSeat.z, POS.defneSeat.heading);
  defne.setPose('sitTerminal'); defne.setPose('typing'); defne.mixPose({ spine: [0.04, 0, 0] });
  defneKeys(defne, st, 1 - smoothstep(27.5, 29.0, st));
  defne.lookAt(TERM_LOOK, 0.5, 1);
  // Atlas: ekranların önünde
  atlas.place(POS.atlasScreens.x, POS.atlasScreens.z, POS.atlasScreens.heading);
  atlas.setPose('stand'); atlas.mixPose({ lShoulder: [0.1, 0.05, 0], spine: [0.04, 0, 0], head: [0.05, 0, 0] });
  atlas.lookAt(SCREEN_LOOK, 0.7, 1); atlas.expr('tired', 0.6);
  // Asya: masada (s2_01'de yürüyerek gelir)
  if (st >= 0) {
    const w = walk(asya, [V(2.6, 0, 2.8), V(1.6, 0, 2.0), V(POS.asyaTable.x, 0, POS.asyaTable.z)], 0, 1.9, st, { heading: Math.PI });
    void w;
  }
  asya.expr('angry', 0.8);
  // terminal ekranı: ana ekranda sayaç
  set.state.countdown = 14 * 60 + 37 - st; set.state.screens = 'countdown';
  grade(ctx, 'base');
  ctx.RIM.color.value.set(0x40d0ff); ctx.RIM.strength.value = 0.2;
}

export const scene2 = [
  { id: 's2_01', scene: 2, set: SET, dur: 4.5, desc: 'Üs genel plan: Asya masaya hırsla vurur',
    cues: [A('amb_base_tone', 0, 56, -8), M('mus_s2_tension', 0, -4), S('footsteps_fast', 0.1, -10, { dur: 1.8 }), S('table_slam', SLAM, 0)],
    update(ctx, lt) {
      stage(ctx, lt); const { asya } = ctx.chars;
      // yumruk yolu (IK): yanda → omuz üstüne kalkar (1.7–2.2) → masa üstünden hızlanarak iner (2.25–SLAM)
      // → tabla yüzeyine oturur (üst yüz 0.815 + yumruk yarıçapı) ve orada kalır.
      const raise = smoothstep(1.7, 2.2, lt), lean = smoothstep(2.22, SLAM, lt);
      asya.setPose('slamTable', Math.max(lean, raise * 0.3));
      asya.mixPose({ spine: [-0.08 * raise * (1 - lean) + 0.12 * lean, 0, 0], chest: [-0.05 * raise * (1 - lean), 0.15 * raise * (1 - lean), 0] });
      asya.setPose({ rHand: 'fist' }, smoothstep(1.7, 2.0, lt));
      const hd = asya.root.rotation.y, rp = asya.root.position;
      const fwd = V(Math.sin(hd), 0, Math.cos(hd)), right = V(-Math.cos(hd), 0, Math.sin(hd));
      const P0 = rp.clone().addScaledVector(right, 0.21).addScaledVector(fwd, 0.08).setY(0.84);
      // PHIT: kol erişimi içinde (omuzdan ~0.5 m); yumruğun alt yüzü IK ucunun ~4.3 cm altında → tabla 0.815'e değer
      const PUP = V(0.8, 1.45, 0.97), PHIT = V(0.69, 0.868, 0.75);
      let tgt;
      if (lt < 2.25) tgt = P0.lerp(PUP, raise);
      else { const k = clamp((lt - 2.25) / (SLAM - 2.25)); tgt = PUP.clone().lerp(PHIT, k * k); }
      if (lt > SLAM) tgt.y += 0.012 * Math.sin(clamp((lt - SLAM) / 0.16) * Math.PI); // küçük geri tepme
      asya.ik.r = tgt; asya.ik.rW = smoothstep(1.55, 1.85, lt);
      ctx.sets[SET].state.tableImpactAt = ctx.t - (lt - SLAM);
      cam(ctx, lt, { pos: vtrack([[0, [3.6, 2.1, 3.7]], [4.5, [3.1, 1.85, 3.2]]], 'inOutSine'), target: V(-0.6, 0.95, -1.0), fov: 46, shake: lt > SLAM && lt < SLAM + 0.5 ? 2.5 * (1 - (lt - SLAM) / 0.5) : 0.25 });
      ctx.post.fade = fadeIn(lt, 0.7); ctx.post.letterbox = 1;
    } },
  { id: 's2_02', scene: 2, set: SET, dur: 9.5, desc: 'Asya öfkeli: "Bizi buldular!"',
    cues: [L('L05', 0.3)],
    update(ctx, lt) {
      const st = 4.5 + lt; stage(ctx, st); const { asya, atlas } = ctx.chars;
      asya.setPose('slamTable', 0.5 * (1 - smoothstep(0.2, 1.2, lt)));
      // jestler: kollar açılır, işaret eder
      const g1 = smoothstep(1.0, 1.6, lt) * (1 - smoothstep(4.5, 5.2, lt));
      asya.mixPose({ lShoulder: [0.4 * g1, 0.55 * g1, -0.2 * g1], lElbow: [1.35 * g1], rShoulder: [0.4 * g1, 0.5 * g1, -0.2 * g1], rElbow: [1.3 * g1], lWrist: [-0.25 * g1, 0, 0], rWrist: [-0.25 * g1, 0, 0] });
      asya.setPose({ lHand: 'open', rHand: 'open' }, g1);
      const pt = smoothstep(6.0, 6.6, lt); asya.setPose(RPOINT, pt * 0.9);
      // bakış: önce ekranlara, sonra Atlas'a (yumuşak geçiş); hedef objektifin yanından geçer
      const atl = atlas.headWorld(V()).add(V(0.12, 0, 0));
      asya.lookAt(gazeMix(asya, V(0.2, 1.4, -2.0), atl, smoothstep(5.2, 5.9, lt)), 0.8, 1);
      asya.expr('angry', 0.3); asya.face.browIn += 0.2;
      say(ctx, asya, 'L05', 0.3, lt);
      const h = asya.headWorld(V());
      // kamera Asya→Atlas bakış ekseninin ~35° dışında (s2_03 ile aynı tarafta): göz çizgisi objektife değil,
      // işaret eden kol kadrajın soluna uzanır. MS'ten yavaşça MCU'ya iter, eller kadrajda kalır.
      const dir = V(-0.791, 0, -0.612), fl = V(0.612, 0, -0.791); // kameraya yön, kadraj solu
      const dist = lerp(1.6, 1.38, smoothstep(0, 9.5, lt));
      const p = h.clone().addScaledVector(dir, dist).add(V(0, -0.1, 0));
      const eyes = asya.eyeWorld(V());
      cam(ctx, lt, { pos: p, target: h.clone().add(V(0, -0.16 + 0.04 * smoothstep(0, 9.5, lt), 0)).addScaledVector(fl, 0.07), fov: 34, shake: 0.6, dof: 1, focus: p.distanceTo(eyes) });
      faceLights(ctx, asya, { key: 6, keyColor: 0xffe0c8, rim: 18, rimColor: 0x40d0ff });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_03', scene: 2, set: SET, dur: 10.0, desc: 'Atlas ekranlara bakar, yorgun: "Temizlemedik, Asya..."',
    cues: [L('L06', 0.4)],
    update(ctx, lt) {
      const st = 14 + lt; stage(ctx, st); const { atlas, asya } = ctx.chars;
      asya.setPose('handsOnHips', 0.8);
      const turn = smoothstep(4.5, 5.6, lt) * (1 - smoothstep(8.4, 9.4, lt));
      atlas.mixPose({ chest: [0, turn * 0.35, 0] });
      // Asya arkasında kalıyor: omzunun üstünden ona döner. Hedef açısal olarak karışır (ani baş/göz sıçraması yok);
      // yolun %60'ında durur ki baş dönüş sınırına çarpıp gözler köşeye yapışmasın.
      atlas.lookAt(gazeMix(atlas, SCREEN_LOOK, asya.headWorld(V()), 0.6 * turn), 0.8, 1);
      atlas.expr('tired', 0.4); atlas.expr('sad', 0.35);
      say(ctx, atlas, 'L06', 0.4, lt);
      const h = atlas.headWorld(V());
      // odak kamera–göz mesafesini izler (dolly boyunca yüz net kalır)
      const p = vtrack([[0, [h.x - 0.95, h.y - 0.02, h.z - 0.55]], [10, [h.x - 0.8, h.y - 0.02, h.z - 0.35]]], 'inOutSine')(lt);
      cam(ctx, lt, { pos: p, target: h.clone().add(V(0, -0.08, 0)), fov: 34, shake: 0.35, dof: 1, focus: p.distanceTo(atlas.eyeWorld(V())) });
      keyAt(ctx, V(-1.6, 2.0, -3.6), h, 10, 0x50c8ff, 0.5);
      rimAt(ctx, h.clone().add(V(0.8, 0.6, 1.0)), h, 16, 0xffb070);
      fillAt(ctx, h.clone().add(V(-0.4, -0.2, -0.6)), 0.6, 0xff50c0, 2);
      ctx.post.letterbox = 1;
    } },
  { id: 's2_04', scene: 2, set: SET, dur: 3.0, desc: 'Defne fırtına gibi yazar… ve donakalır',
    cues: [S('typing_fast', 0, -6, { dur: 2.2 })],
    update(ctx, lt) {
      const st = 24 + lt; stage(ctx, st); const { defne } = ctx.chars;
      // eller klavyede fırtına gibi (stage → defneKeys); 2.0'da donar, irkilip doğrulur
      const frz = smoothstep(2.0, 2.3, lt);
      defne.mixPose({ spine: [-0.06 * frz, 0, 0], neck: [-0.04 * frz, 0, 0], head: [-0.1 * frz, 0, 0] });
      defne.mixPose({ head: [noise1(st * 9.0) * 0.012 * (1 - frz), noise1(st * 7.0 + 4) * 0.015 * (1 - frz), 0] }); // yazarken baş titreşimi
      defne.expr('focused', 0.8 * (1 - frz)); defne.expr('scared', 0.9 * frz); defne.face.pupil -= 0.3 * frz;
      const h = defne.headWorld(V()), eyes = defne.eyeWorld(V());
      // ön-sağdan: eller + yüz birlikte; donmada yüze doğru tilt-up ve hafif itme
      const tilt = smoothstep(2.05, 2.95, lt);
      const hands = V(-2.3, 0.87, -2.97);
      const p = vtrack([[0, [-1.8, 1.22, -3.42]], [2.05, [-1.83, 1.21, -3.39]], [3, [-1.95, 1.19, -3.25]]], 'inOutSine')(lt);
      const tg = V(-2.3, 0.965, -2.94).lerp(V(h.x, h.y - 0.025, h.z), tilt);
      const fd = lerp(p.distanceTo(hands.clone().lerp(eyes, 0.45)), p.distanceTo(eyes), tilt);
      cam(ctx, lt, { pos: p, target: tg, fov: lerp(42, 34, tilt), shake: 0.4, dof: 1, focus: fd });
      // yazarken yüzü monitör (camgöbeği) aydınlatır; donma/tilt-up'ta sıcak anahtar yükselir ki s2_05'in
      // sıcak ışığına geçiş sıçramasın (pozlama hafif kısılır, cilt patlamasın)
      faceLights(ctx, defne, { key: lerp(7, 16, tilt), keyColor: 0xffa070, fill: 0.6, rim: 12, rimColor: 0x40d0ff });
      ctx.post.exposure = lerp(1.0, 0.88, tilt);
      ctx.post.letterbox = 1;
    } },
  { id: 's2_05', scene: 2, set: SET, dur: 6.5, desc: 'Defne titrek sesle: "Arkadaşlar..."',
    cues: [L('L07', 0.3)],
    update(ctx, lt) {
      const st = 27 + lt; stage(ctx, st); const { defne, atlas } = ctx.chars;
      defne.setPose('typing', 1 - smoothstep(0.5, 2.0, lt)); defne.setPose('handsToChest', smoothstep(1.5, 2.6, lt) * 0.6);
      const turn = smoothstep(0.8, 2.4, lt);
      defne.mixPose({ chest: [0, -0.5 * turn, 0], neck: [0, -0.3 * turn, 0] });
      // ekrandan Atlas'a açısal olarak karışan bakış (tek karelik baş dönüşü yok)
      defne.lookAt(gazeMix(defne, TERM_LOOK, atlas.headWorld(V()), turn), 0.6, 1);
      defne.expr('scared', 0.7); defne.expr('sad', 0.3);
      say(ctx, defne, 'L07', 0.3, lt, 0.9);
      const h = defne.headWorld(V());
      // sağ yandan (ense değil profil): dönüşle birlikte hafifçe öne kayar, yüz 3/4'e gelir; sayaç arka planda
      const p = vtrack([[0, [h.x + 0.76, h.y - 0.05, h.z + 0.06]], [0.8, [h.x + 0.75, h.y - 0.05, h.z + 0.09]], [2.7, [h.x + 0.58, h.y - 0.045, h.z + 0.4]], [6.5, [h.x + 0.49, h.y - 0.04, h.z + 0.38]]], 'inOutSine')(lt);
      cam(ctx, lt, { pos: p, target: h.clone().add(V(0, -0.05, 0)), fov: 32, shake: 0.3, dof: 1, focus: p.distanceTo(defne.eyeWorld(V())), aperture: 0.07 });
      faceLights(ctx, defne, { key: 9, keyColor: 0xffd8b8, rim: 16, rimColor: 0x40d0ff });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_06', scene: 2, set: SET, dur: 2.0, desc: 'Atlas: "Ne o zaman, Defne?"',
    cues: [L('L08', 0.3)],
    update(ctx, lt) {
      const st = 33.5 + lt; stage(ctx, st); const { atlas, defne } = ctx.chars;
      atlas.mixPose({ chest: [0, -0.5, 0] }); atlas.lookAt(defne.headWorld(V()), 0.9, 1); atlas.expr('worried', 0.8);
      say(ctx, atlas, 'L08', 0.3, lt);
      const h = atlas.headWorld(V());
      cam(ctx, lt, { pos: V(h.x - 0.8, h.y - 0.05, h.z + 0.75), target: h.clone().add(V(0, -0.06, 0)), fov: 32, shake: 0.3, dof: 1, focus: 1.1 });
      faceLights(ctx, atlas, { key: 9, keyColor: 0xffd8b8, rim: 14, rimColor: 0x40d0ff, side: -1 });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_07', scene: 2, set: SET, dur: 8.0, desc: 'Defne: "Zihin senkronizasyonu..."',
    cues: [L('L09', 0.3), S('heartbeat', 2.0, -10, { dur: 15 })],
    update(ctx, lt) {
      const st = 35.5 + lt; stage(ctx, st); const { defne, atlas } = ctx.chars;
      defne.setPose('typing', 0); defne.setPose('handsToChest', 0.6); defne.mixPose({ chest: [0, -0.5, 0], neck: [0, -0.3, 0] });
      defne.lookAt(atlas.headWorld(V()), 0.6, 1); defne.expr('scared', 0.5); defne.expr('sad', 0.5 + 0.2 * smoothstep(4, 8, lt));
      say(ctx, defne, 'L09', 0.3, lt, 0.9);
      const h = defne.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.62, h.y - 0.03, h.z + 0.5]], [8, [h.x + 0.4, h.y - 0.02, h.z + 0.32]]], 'inOutSine'), target: h.clone().add(V(0, -0.03, 0)), fov: 30, shake: 0.25, dof: 1, focus: (t) => 0.8 - t * 0.03, aperture: 0.08 });
      faceLights(ctx, defne, { key: 8, keyColor: 0xffd8b8, rim: 16, rimColor: 0x40d0ff });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_08', scene: 2, set: SET, dur: 3.5, desc: 'Asya’nın tepkisi',
    cues: [],
    update(ctx, lt) {
      const st = 43.5 + lt; stage(ctx, st); const { asya, defne } = ctx.chars;
      say(ctx, defne, 'L09', 0.3 - 8.0, lt, 0.9);
      asya.setPose('stand'); asya.lookAt(defne.headWorld(V()), 0.8, 1);
      asya.expr('angry', -0.8); asya.expr('sad', 0.6 * smoothstep(0.5, 2, lt)); asya.expr('scared', 0.4); asya.face.open = 0.08;
      const h = asya.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x - 0.55, h.y - 0.02, h.z - 0.85]], [3.5, [h.x - 0.48, h.y - 0.02, h.z - 0.72]]]), target: h.clone().add(V(0, -0.05, 0)), fov: 32, dof: 1, focus: 1.0 });
      faceLights(ctx, asya, { key: 7, keyColor: 0xffd0a8, rim: 16, rimColor: 0x40d0ff });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_09', scene: 2, set: SET, dur: 3.0, desc: 'Atlas’ın tepkisi',
    cues: [],
    update(ctx, lt) {
      const st = 47 + lt; stage(ctx, st); const { atlas, defne } = ctx.chars;
      say(ctx, defne, 'L09', 0.3 - 11.5, lt, 0.9);
      atlas.mixPose({ chest: [0, -0.5, 0] }); atlas.lookAt(defne.headWorld(V()), 0.9, 1); atlas.expr('sad', 0.7); atlas.expr('pain', 0.25);
      const h = atlas.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x - 0.72, h.y, h.z + 0.6]], [3, [h.x - 0.6, h.y, h.z + 0.5]]]), target: h.clone().add(V(0, -0.05, 0)), fov: 30, dof: 1, focus: 0.95 });
      faceLights(ctx, atlas, { key: 8, keyColor: 0xffd8b8, rim: 16, rimColor: 0xff50c0, side: -1 });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_10', scene: 2, set: SET, dur: 3.5, desc: 'Defne: "...birbirimize tamamen yabancı olacağız."',
    cues: [],
    update(ctx, lt) {
      const st = 50 + lt; stage(ctx, st); const { defne, atlas } = ctx.chars;
      defne.setPose('typing', 0); defne.setPose('handsToChest', 0.6); defne.mixPose({ chest: [0, -0.5, 0], neck: [0, -0.3, 0] });
      say(ctx, defne, 'L09', 0.3 - 14.5, lt, 0.9);
      defne.lookAt(atlas.headWorld(V()).add(V(0, -0.4, 0)), 0.5, 1); defne.expr('sad', 0.9); defne.expr('scared', 0.3);
      const h = defne.headWorld(V());
      // CU: gözler + ağız birlikte kadrajda, daha önden (ön plan bukleleri kadrajı kapatmasın)
      const p = vtrack([[0, [h.x + 0.66, h.y - 0.04, h.z + 0.25]], [3.5, [h.x + 0.6, h.y - 0.04, h.z + 0.22]]])(lt);
      cam(ctx, lt, { pos: p, target: h.clone().add(V(0, -0.045, 0)), fov: 30, dof: 1, focus: p.distanceTo(defne.eyeWorld(V())), aperture: 0.08 });
      faceLights(ctx, defne, { key: 8, keyColor: 0xffd8b8, rim: 18, rimColor: 0x40d0ff });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_11', scene: 2, set: SET, dur: 2.5, desc: 'Sessizlik: üçü birbirine bakar',
    cues: [],
    update(ctx, lt) {
      const st = 53.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      // Yeniden sahneleme (s2_08–s2_10 kadraj dışında): Asya masanın sol ucundan dolaşıp Atlas'ın önüne
      // (~1.8 m) gelmiş; Atlas ona dönmüş; Defne sandalyede onlara dönük. Masa önündeki eski yerinden tek
      // karede üç yüz birden görünemiyordu (Asya diğer ikisinin 4 m önünde, onlara bakıyordu).
      atlas.place(POS.atlasScreens.x, POS.atlasScreens.z, -0.2);
      asya.place(-1.1, -1.05, Math.PI - 0.3); asya.setPose('stand');
      defne.setPose('typing', 0); defne.setPose('handsToChest', 0.5); defne.mixPose({ chest: [0, -0.6, 0], neck: [0, -0.2, 0] });
      atlas.mixPose({ spine: [0.04, 0, 0] });
      // bakış alışverişi (sessizlik): Atlas yerden Asya'ya, Asya Defne'den Atlas'a, Defne Atlas'tan Asya'ya
      const hA = atlas.headWorld(V()), hY = asya.headWorld(V()), hD = defne.headWorld(V());
      atlas.lookAt(gazeMix(atlas, V(-0.5, 0.5, -1.6), hY, smoothstep(0.2, 0.8, lt)), 0.85, 1);
      asya.lookAt(gazeMix(asya, hD, hA, smoothstep(0.7, 1.25, lt)), 0.85, 1);
      defne.lookAt(gazeMix(defne, hA, hY, smoothstep(1.2, 1.8, lt)), 0.75, 1);
      asya.expr('angry', -0.8); asya.expr('worried', 0.8); atlas.expr('sad', 0.6); defne.expr('sad', 0.8);
      // sağdan geniş 3'lü plan: üç yüz de 3/4–profil, arkada sayaçlı ekranlar; yavaş itme
      cam(ctx, lt, { pos: vtrack([[0, [1.78, 1.56, -0.93]], [2.5, [1.62, 1.54, -0.97]]], 'inOutSine'), target: V(-1.0, 1.28, -1.85), fov: 36 });
      // yüz ışıkları: anahtar Atlas+Defne'ye (sağ önden), ikinci spot Asya'ya (önünden), soğuk dolgu
      keyAt(ctx, V(0.9, 2.5, -1.5), V(-1.45, 1.3, -2.75), 12, 0xffd8b8, 0.42);
      rimAt(ctx, V(0.2, 2.3, -2.0), hY, 10, 0xffd0a8);
      fillAt(ctx, V(1.2, 1.6, -1.2), 1.4, 0x7090d0, 6);
      ctx.post.letterbox = 1;
    } },
];
