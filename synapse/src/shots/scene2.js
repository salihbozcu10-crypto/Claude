// SAHNE 2 — Gelişme: Sığınak ve Kilitlenen Zihinler (üs)
import * as THREE from 'three';
import { V, cam, vtrack, track, walk, say, faceLights, keyAt, fillAt, rimAt, grade, show, hold, placeProp, fadeIn, L, S, M, A, DUR, clamp, smoothstep, lerp, fbm1 } from './helpers.js';

const SET = 'base';
export const POS = {
  defneSeat: Object.assign(V(-2.3, 0, -2.72), { heading: Math.PI }),
  atlasScreens: Object.assign(V(-0.62, 0, -2.75), { heading: -2.5 }),
  asyaTable: Object.assign(V(0.6, 0, 1.18), { heading: Math.PI }),
};
const SLAM = 2.45; // s2_01 içinde masaya vuruş

// ortak kurulum (st: sahne-2 zamanı)
function stage(ctx, st) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET];
  show(atlas, asya, defne);
  set.state.mode = 'normal'; set.state.screens = 'code';
  // Defne: terminalde oturuyor, yazıyor
  defne.place(POS.defneSeat.x, POS.defneSeat.z, POS.defneSeat.heading);
  defne.setPose('sitTerminal'); defne.setPose('typing'); defne.mixPose({ spine: [0.04, 0, 0] });
  const typ = st < 26 ? 1 : 0; // donmadan önce hızlı yazma
  defne.mixPose({ lWrist: [Math.sin(st * 31) * 0.12 * typ, 0, 0], rWrist: [Math.sin(st * 27 + 1) * 0.12 * typ, 0, 0], lElbow: [Math.sin(st * 13) * 0.05 * typ], rElbow: [Math.cos(st * 11) * 0.05 * typ] });
  defne.lookAt(V(-2.3, 1.18, -3.55), 0.5, 1);
  // Atlas: ekranların önünde
  atlas.place(POS.atlasScreens.x, POS.atlasScreens.z, POS.atlasScreens.heading);
  atlas.setPose('stand'); atlas.mixPose({ lShoulder: [0.1, 0.05, 0], spine: [0.04, 0, 0], head: [0.05, 0, 0] });
  atlas.lookAt(V(-1.85, 2.0, -3.9), 0.7, 1); atlas.expr('tired', 0.6);
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
      const up = smoothstep(1.7, 2.25, lt) * (1 - smoothstep(2.25, 2.4, lt)), hit = smoothstep(2.3, 2.45, lt);
      asya.setPose('slamTable', Math.max(hit, up * 0.6));
      if (up > 0 && hit < 0.5) asya.mixPose({ rShoulder: [0.9 * up, 0, 0], rElbow: [0.8 * up] });
      asya.ik.r = hit > 0.2 ? V(0.55, 0.86, 0.72) : null; asya.ik.rW = hit;
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
      asya.mixPose({ lShoulder: [0.5 * g1, 0.25 * g1, 0], lElbow: [0.9 * g1], rShoulder: [0.45 * g1, 0.2 * g1, 0], rElbow: [0.8 * g1], lHand: g1 > 0.5 ? 'open' : 'relaxed', rHand: g1 > 0.5 ? 'open' : 'relaxed' });
      const pt = smoothstep(6.0, 6.6, lt); asya.setPose('pointing', pt * 0.8);
      asya.lookAt(lt > 5.5 ? atlas.headWorld(V()) : V(0.2, 1.4, -2.0), 0.8, 1);
      asya.expr('angry', 0.3); asya.face.browIn += 0.2;
      say(ctx, asya, 'L05', 0.3, lt);
      const h = asya.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x - 0.45, h.y - 0.06, h.z - 1.25]], [9.5, [h.x - 0.32, h.y - 0.06, h.z - 1.0]]], 'inOutSine'), target: h.clone().add(V(0.05, -0.1, 0)), fov: 34, shake: 0.6, dof: 1, focus: (t) => 1.25 - t * 0.025 });
      faceLights(ctx, asya, { key: 6, keyColor: 0xffe0c8, rim: 18, rimColor: 0x40d0ff });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_03', scene: 2, set: SET, dur: 10.0, desc: 'Atlas ekranlara bakar, yorgun: "Temizlemedik, Asya..."',
    cues: [L('L06', 0.4)],
    update(ctx, lt) {
      const st = 14 + lt; stage(ctx, st); const { atlas, asya } = ctx.chars;
      asya.setPose('handsOnHips', 0.8);
      const turn = smoothstep(4.5, 5.6, lt) * (1 - smoothstep(8.4, 9.4, lt));
      atlas.lookAt(turn > 0.5 ? asya.headWorld(V()) : V(-1.85, 2.0, -3.9), 0.8, 1);
      atlas.mixPose({ chest: [0, turn * 0.35, 0] });
      atlas.expr('tired', 0.4); atlas.expr('sad', 0.35);
      say(ctx, atlas, 'L06', 0.4, lt);
      const h = atlas.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x - 0.95, h.y - 0.02, h.z - 0.55]], [10, [h.x - 0.8, h.y - 0.02, h.z - 0.35]]], 'inOutSine'), target: h.clone().add(V(0, -0.08, 0)), fov: 34, shake: 0.35, dof: 1, focus: 1.05 });
      keyAt(ctx, V(-1.6, 2.0, -3.6), h, 10, 0x50c8ff, 0.5);
      rimAt(ctx, h.clone().add(V(0.8, 0.6, 1.0)), h, 16, 0xffb070);
      fillAt(ctx, h.clone().add(V(-0.4, -0.2, -0.6)), 0.6, 0xff50c0, 2);
      ctx.post.letterbox = 1;
    } },
  { id: 's2_04', scene: 2, set: SET, dur: 3.0, desc: 'Defne fırtına gibi yazar… ve donakalır',
    cues: [S('typing_fast', 0, -6, { dur: 2.2 })],
    update(ctx, lt) {
      const st = 24 + lt; stage(ctx, st); const { defne } = ctx.chars;
      const frz = smoothstep(2.0, 2.3, lt);
      if (frz > 0) { defne.setPose('typing'); defne.mixPose({ spine: [-0.05 * frz, 0, 0], head: [-0.08 * frz, 0, 0] }); }
      defne.expr('focused', 0.8 * (1 - frz)); defne.expr('scared', 0.9 * frz); defne.face.pupil -= 0.3 * frz;
      const h = defne.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.75, h.y - 0.3, h.z - 0.5]], [3, [h.x + 0.6, h.y - 0.22, h.z - 0.42]]]), target: vtrack([[0, [h.x, h.y - 0.35, h.z - 0.3]], [2.2, [h.x, h.y - 0.25, h.z - 0.2]], [3, [h.x, h.y - 0.05, h.z]]]), fov: 36, shake: 0.4, dof: 1, focus: 0.85 });
      faceLights(ctx, defne, { key: 6, keyColor: 0x60c8ff, rim: 14, rimColor: 0xff50c0 });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_05', scene: 2, set: SET, dur: 6.5, desc: 'Defne titrek sesle: "Arkadaşlar..."',
    cues: [L('L07', 0.3)],
    update(ctx, lt) {
      const st = 27 + lt; stage(ctx, st); const { defne, atlas } = ctx.chars;
      defne.setPose('typing', 1 - smoothstep(0.5, 2.0, lt)); defne.setPose('handsToChest', smoothstep(1.5, 2.6, lt) * 0.6);
      const turn = smoothstep(0.8, 2.4, lt);
      defne.mixPose({ chest: [0, -0.5 * turn, 0], neck: [0, -0.3 * turn, 0] });
      defne.lookAt(turn > 0.4 ? atlas.headWorld(V()) : V(-2.3, 1.18, -3.55), 0.6, 1);
      defne.expr('scared', 0.7); defne.expr('sad', 0.3);
      say(ctx, defne, 'L07', 0.3, lt, 0.9);
      const h = defne.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.6, h.y - 0.05, h.z + 0.55]], [6.5, [h.x + 0.48, h.y - 0.04, h.z + 0.42]]], 'inOutSine'), target: h.clone().add(V(0, -0.05, 0)), fov: 32, shake: 0.3, dof: 1, focus: 0.72, aperture: 0.07 });
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
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.35, h.y - 0.01, h.z + 0.3]], [3.5, [h.x + 0.3, h.y - 0.01, h.z + 0.26]]]), target: h.clone().add(V(0, -0.01, 0)), fov: 30, dof: 1, focus: 0.45, aperture: 0.08 });
      faceLights(ctx, defne, { key: 8, keyColor: 0xffd8b8, rim: 18, rimColor: 0x40d0ff });
      ctx.post.letterbox = 1;
    } },
  { id: 's2_11', scene: 2, set: SET, dur: 2.5, desc: 'Sessizlik: üçü birbirine bakar',
    cues: [],
    update(ctx, lt) {
      const st = 53.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      defne.setPose('typing', 0); defne.setPose('handsToChest', 0.5); defne.mixPose({ chest: [0, -0.5, 0] });
      atlas.mixPose({ chest: [0, -0.3, 0] });
      atlas.lookAt(asya.headWorld(V()), 0.8, 1); asya.lookAt(atlas.headWorld(V()), 0.8, 1); defne.lookAt(asya.headWorld(V()), 0.5, 1);
      asya.expr('angry', -0.8); asya.expr('worried', 0.8); atlas.expr('sad', 0.6); defne.expr('sad', 0.8);
      cam(ctx, lt, { pos: vtrack([[0, [1.4, 1.65, 2.9]], [2.5, [1.2, 1.6, 2.5]]], 'inOutSine'), target: V(-1.0, 1.15, -1.7), fov: 40 });
      ctx.post.letterbox = 1;
    } },
];
