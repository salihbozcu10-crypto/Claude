// SAHNE 3 — Zirve: Son İki Dakika (üs, alarm)
import * as THREE from 'three';
import { V, cam, vtrack, walk, say, faceCam, faceLights, keyAt, fillAt, rimAt, grade, show, hold, fadeIn, L, S, M, A, clamp, smoothstep, lerp, fbm1 } from './helpers.js';
import { POS } from './scene2.js';

const SET = 'base';
// sahne-3 zamanı (st) ile olay zamanları
const BANGS = [0.3, 4.5, 6.6, 10.2, 13.8, 16.3, 25.0, 40.5];
const RIP = 19.8, PLUG = 22.1, FREEZE = 44.2, BREAKER = 46.4;
const DOOR_POS = Object.assign(V(4.32, 0, 0.5), { heading: Math.PI / 2 });
const ATLAS_TERM = Object.assign(V(-1.22, 0, -2.66), { heading: Math.PI });

function stage(ctx, st, sh0) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET]; const P = ctx.props;
  show(atlas, asya, defne);
  const al = smoothstep(0.25, 0.6, st) * (st < BREAKER + 0.15 ? 1 : 0);
  Object.assign(set.state, { mode: 'alarm', alarm: al, screens: 'countdown', droneLight: al, glitch: 0.15 * al });
  set.state.doorBangs = BANGS.map((b) => ctx.t - (st - b));
  // sayaç: son iki dakika → dondu
  const cd = st < FREEZE ? Math.max(1, 118 - st * 2.6) : 1;
  set.state.countdown = cd; set.state.countdownFrozen = st >= FREEZE;
  if (st >= FREEZE) set.state.countdownColor = '#ffffff';
  set.state.breaker = smoothstep(BREAKER - 0.4, BREAKER, st);
  if (st > BREAKER + 0.15) { set.state.power = 0; set.state.alarm = 0; set.state.mode = 'blackout'; set.state.droneLight = 0; }
  set.state.cableAttached = st < RIP;
  // Defne: terminalde
  defne.place(POS.defneSeat.x, POS.defneSeat.z, POS.defneSeat.heading);
  defne.setPose('sitTerminal'); defne.setPose('typing');
  defne.mixPose({ lWrist: [Math.sin(st * 35) * 0.15, 0, 0], rWrist: [Math.sin(st * 29 + 1) * 0.15, 0, 0] });
  defne.lookAt(V(-2.3, 1.18, -3.55), 0.5, 1); defne.expr('scared', 0.7);
  // Asya: masadan kapıya koşar (st 1.0 → 2.8), kapıyı tutar
  const w = walk(asya, [V(POS.asyaTable.x, 0, POS.asyaTable.z), V(2.4, 0, 0.9), V(DOOR_POS.x, 0, DOOR_POS.z)], 1.0, 2.8, st, { heading: DOOR_POS.heading, run: 1, strideScale: 1.3 });
  if (w.done) { asya.setPose('pushDoor'); asya.lookAt(V(4.9, 1.6, 0.5), 0.6, 1); asya.expr('determined', 0.8); }
  else { asya.setPose('run', w.amount); asya.expr('determined', 0.6); }
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

// Atlas'ın kablo eylemi (kopar → boyna tak → it)
function atlasCable(ctx, st) {
  const { atlas } = ctx.chars; const set = ctx.sets[SET]; const P = ctx.props; const np = atlas.extras.neuralPort;
  const port = set.anchors.cablePort;
  if (st < RIP - 1.3) { atlas.lookAt(port, 0.8, 1); return; }
  // uzan (RIP-1.3 → RIP-0.3), kopar (RIP), boyna götür (RIP+0.3 → PLUG-0.4), tak (PLUG)
  const reach = smoothstep(RIP - 1.3, RIP - 0.4, st) * (1 - smoothstep(RIP + 0.2, RIP + 0.8, st));
  atlas.mixPose({ spine: [0.35 * reach, 0, 0], chest: [0.15 * reach, 0, 0], lKnee: 0.25 * reach, rKnee: 0.25 * reach, hips: { y: -0.05 * reach } });
  if (reach > 0.01) { atlas.ik.l = port.clone().add(V(0, 0.05 + (st > RIP ? (st - RIP) * 0.4 : 0), 0.06)); atlas.ik.lW = reach; atlas.mixPose({ lHand: 'grip' }, 1); }
  const toNeck = smoothstep(RIP + 0.3, PLUG - 0.5, st);
  if (toNeck > 0) { atlas.setPose(st < PLUG - 0.15 ? 'plugReady' : 'plugNeck', toNeck); }
  atlas.lookAt(st < RIP + 0.4 ? port : null, 0.8, 1);
  if (st > RIP + 0.4) atlas.lookAt(null);
  // kablo uçları
  if (st >= RIP) {
    const a = set.anchors.towerPort.clone();
    let b, bDir;
    if (st < PLUG) {
      atlas.update(ctx.t); // el konumunu güncel almak için
      b = atlas.bones.lWrist.localToWorld(V(0, -0.075, 0.012)); bDir = atlas.bones.lWrist.localToWorld(V(0, -1, 0)).sub(atlas.bones.lWrist.getWorldPosition(V())).normalize();
    } else {
      atlas.update(ctx.t);
      b = np.socketWorld(V()); const n = np.socketNormalWorld(V()); bDir = n.clone().negate(); b.addScaledVector(n, 0.004 - 0.012 * smoothstep(PLUG, PLUG + 0.2, st));
    }
    P.cable.setEnds(a, b, 0.25, bDir, V(0, 0, 0.25));
    P.cable.pulse = st > PLUG ? smoothstep(PLUG, PLUG + 1.5, st) * (st > FREEZE + 0.5 ? 0.3 : 1) : 0;
    P.cable.plugSpark = st > PLUG - 0.05 && st < PLUG + 0.6 ? 1 - (st - PLUG + 0.05) / 0.65 : (st > FREEZE - 4 && st < FREEZE ? 0.5 : 0);
  }
  np.glow = st < PLUG ? 0.25 : 1;
}

export const scene3 = [
  { id: 's3_01', scene: 3, set: SET, dur: 3.0, desc: 'KAPIYA DARBE! Alarm başlar',
    cues: [S('door_bang_1', BANGS[0], 0), A('alarm_klaxon', 0.4, 46.0, -10), A('drone_buzz', 0.2, 46.2, -12), M('mus_s3_climax', 0.6, -3)],
    update(ctx, lt) {
      const st = lt; stage(ctx, st); const { atlas, defne } = ctx.chars;
      atlas.lookAt(V(4.9, 1.4, 0.5), 0.8, 1); defne.lookAt(V(4.9, 1.4, 0.5), 0.4, 1);
      cam(ctx, lt, { pos: vtrack([[0, [2.0, 1.45, 1.9]], [3, [2.5, 1.4, 1.6]]]), target: V(4.9, 1.35, 0.5), fov: 40, shake: 0.4 + 2.5 * Math.exp(-Math.max(0, lt - BANGS[0]) * 5) * (lt > BANGS[0] ? 1 : 0) });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_02', scene: 3, set: SET, dur: 4.7, desc: 'Asya kapıya koşar: "Kapının kilidi iki dakika dayanır!"',
    cues: [L('L10', 0.4), S('door_bang_2', BANGS[1] - 3.0, 0), S('door_bang_3', BANGS[2] - 3.0, -1), S('footsteps_run', 0.0, -6, { dur: 1.8 })],
    update(ctx, lt) {
      const st = 3.0 + lt; stage(ctx, st); const { asya } = ctx.chars;
      say(ctx, asya, 'L10', 0.4, lt, 1.1);
      const a = asya.root.position;
      cam(ctx, lt, { pos: V(lerp(a.x, 3.5, 0.4) - 0.9, 1.55, a.z + 1.6), target: asya.headWorld(V()).add(V(0, -0.15, 0)), fov: 40, shake: 0.9, dof: 0.5, focus: 1.9 });
      faceLights(ctx, asya, { key: 6, keyColor: 0xffb0a0, rim: 22, rimColor: 0xff2a1a, side: -1 });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_03', scene: 3, set: SET, dur: 10.0, desc: 'Defne panikte: "Yazılımla imkânsız!"',
    cues: [L('L11', 0.3), S('door_bang_1', BANGS[3] - 7.7, -2), S('door_bang_2', BANGS[4] - 7.7, -1), S('door_bang_3', BANGS[5] - 7.7, -2), S('typing_fast', 0, -8, { dur: 3 })],
    update(ctx, lt) {
      const st = 7.7 + lt; stage(ctx, st); const { defne, asya, atlas } = ctx.chars;
      const turn = smoothstep(3.0, 4.2, lt);
      defne.setPose('typing', 1 - turn * 0.7); defne.mixPose({ chest: [0, -0.45 * turn, 0], neck: [0, -0.3 * turn, 0] });
      defne.lookAt(turn > 0.3 ? asya.headWorld(V()) : V(-2.3, 1.18, -3.55), 0.6, 1);
      defne.expr('scared', 0.4); defne.face.browIn += 0.3;
      atlas.lookAt(defne.headWorld(V()), 0.7, 1);
      say(ctx, defne, 'L11', 0.3, lt, 1.0);
      const h = defne.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.95, h.y + 0.05, h.z + 0.55]], [10, [h.x + 0.6, h.y + 0.0, h.z + 0.6]]], 'inOutSine'), target: h.clone().add(V(-0.05, -0.1, 0)), fov: 36, shake: 0.6, dof: 0.9, focus: (t) => 1.05 - t * 0.02 });
      faceLights(ctx, defne, { key: 8, keyColor: 0xffc8b0, rim: 20, rimColor: 0xff2a1a });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_04', scene: 3, set: SET, dur: 3.5, desc: 'Atlas tereddüt etmez: kabloyu terminalden söker',
    cues: [S('cable_rip', RIP - 17.7, 0)],
    update(ctx, lt) {
      const st = 17.7 + lt; stage(ctx, st); const { atlas } = ctx.chars;
      atlas.expr('determined', 0.9);
      atlasCable(ctx, st);
      const h = atlas.headWorld(V());
      const port = ctx.sets[SET].anchors.cablePort;
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.9, h.y - 0.05, h.z - 0.75]], [3.5, [h.x + 0.85, h.y - 0.25, h.z - 0.85]]]), target: vtrack([[0, [h.x, h.y - 0.08, h.z]], [2.6, [port.x + 0.1, port.y + 0.25, port.z + 0.3]], [3.5, [h.x - 0.02, h.y - 0.25, h.z - 0.1]]]), fov: 38, shake: 0.6, dof: 0.7, focus: 1.05 });
      faceLights(ctx, atlas, { key: 6, keyColor: 0x60c8ff, rim: 22, rimColor: 0xff2a1a });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_05', scene: 3, set: SET, dur: 2.5, desc: 'Çok yakın: kablo boyundaki nöral porta takılır',
    cues: [S('plug_in', PLUG - 21.2, 0)],
    update(ctx, lt) {
      const st = 21.2 + lt; stage(ctx, st); const { atlas } = ctx.chars;
      atlasCable(ctx, st);
      atlas.expr(st > PLUG ? 'pain' : 'determined', st > PLUG ? 0.9 : 0.8);
      const np = atlas.extras.neuralPort; const s = np.socketWorld(V()); const n = np.socketNormalWorld(V());
      const fc = faceCam(atlas, { dist: 0.3 });
      const pos = s.clone().addScaledVector(n, 0.42).addScaledVector(fc.fwd, 0.36).add(V(0, 0.08, 0));
      cam(ctx, lt, { pos: vtrack([[0, pos.clone().addScaledVector(n, 0.06).toArray()], [2.5, pos.toArray()]]), target: s.clone().add(V(0, 0.06, 0)).addScaledVector(fc.fwd, 0.06), fov: 30, shake: 0.4 + (lt > PLUG - 21.2 ? 1.5 * Math.exp(-(lt - (PLUG - 21.2)) * 4) : 0), dof: 1, focus: 0.58, aperture: 0.06 });
      keyAt(ctx, s.clone().addScaledVector(n, 0.6).add(V(0, 0.5, 0)), s, 4, 0xff8070, 0.5);
      rimAt(ctx, s.clone().add(V(-0.4, 0.5, -0.6)), s, 14, 0x40e0ff);
      ctx.post.flash = st > PLUG && st < PLUG + 0.15 ? 0.4 : 0; ctx.post.flashColor = [0.6, 0.95, 1];
      ctx.post.letterbox = 1;
    } },
  { id: 's3_06', scene: 3, set: SET, dur: 4.5, desc: 'Asya döner: "Atlas! Ne yapıyorsun?"',
    cues: [L('L12', 0.3), S('door_bang_1', BANGS[6] - 23.7, -3)],
    update(ctx, lt) {
      const st = 23.7 + lt; stage(ctx, st); const { asya, atlas } = ctx.chars;
      atlasCable(ctx, st); atlas.expr('pain', 0.7);
      const tr = smoothstep(0.0, 0.6, lt);
      asya.setPose('pushDoor', 1 - tr); asya.setPose('alert', tr); asya.mixPose({ chest: [0, -0.7 * tr, 0], hips: { rot: [0, -1.2 * tr, 0] } });
      asya.lookAt(atlas.headWorld(V()), 0.9, 1); asya.expr('determined', -0.6); asya.expr('shock', 0.8);
      say(ctx, asya, 'L12', 0.3, lt, 1.1);
      const h = asya.headWorld(V());
      cam(ctx, lt, { pos: V(h.x - 1.05, h.y - 0.05, h.z - 0.35), target: h.clone().add(V(0, -0.06, 0)), fov: 32, shake: 0.8, dof: 1, focus: 1.1 });
      faceLights(ctx, asya, { key: 8, keyColor: 0xffc0b0, rim: 22, rimColor: 0xff2a1a, side: -1 });
      ctx.post.letterbox = 1;
    } },
  { id: 's3_07', scene: 3, set: SET, dur: 10.8, desc: 'Atlas acıyla gülümser: "Eğer anılarım silinecekse..."',
    cues: [L('L13', 0.3), S('neural_hum', 0, -8, { dur: 10.8 })],
    update(ctx, lt) {
      const st = 28.2 + lt; stage(ctx, st); const { atlas, asya } = ctx.chars;
      atlasCable(ctx, st);
      atlas.expr('sadSmile', 0.8 * (1 - smoothstep(7.5, 8.5, lt))); atlas.expr('pain', 0.35 + 0.3 * smoothstep(7.5, 8.5, lt)); atlas.expr('determined', 0.6 * smoothstep(7.5, 8.5, lt));
      atlas.face.eyeGlow = 0.12 + 0.35 * smoothstep(1, 10, lt);
      atlas.lookAt(lt < 7.6 ? asya.headWorld(V()) : V(-2.3, 1.3, -2.7), 0.6, 1);
      say(ctx, atlas, 'L13', 0.3, lt);
      const h = atlas.headWorld(V());
      const fc0 = faceCam(atlas, { dist: 1.05, side: -0.35 }), fc1 = faceCam(atlas, { dist: 0.62, side: -0.18 });
      cam(ctx, lt, { pos: vtrack([[0, fc0.pos.toArray()], [10.8, fc1.pos.toArray()]], 'inOutSine'), target: fc0.target, fov: 32, shake: 0.35, dof: 1, focus: (t) => 1.1 - t * 0.045 });
      faceLights(ctx, atlas, { key: 9, keyColor: 0xffc8b8, rim: 20, rimColor: 0xff2a1a, fill: 1.5, fillColor: 0x40d8ff });
      ctx.post.letterbox = 1; ctx.post.ca = 0.002 + 0.002 * smoothstep(5, 10, lt);
    } },
  { id: 's3_08', scene: 3, set: SET, dur: 4.0, desc: 'Gözleri bembeyaz parlar; veri fırtınası',
    cues: [S('neural_surge', 0.2, 0), S('door_bang_2', BANGS[7] - 39.0, -4)],
    update(ctx, lt) {
      const st = 39.0 + lt; stage(ctx, st); const { atlas } = ctx.chars;
      atlasCable(ctx, st); atlas.setPose('brace', smoothstep(0.1, 0.6, lt) * 0.6);
      atlas.expr('pain', 0.8); atlas.face.eyeGlow = 0.5 + 0.5 * smoothstep(0.2, 0.8, lt); atlas.face.lidUp = 0.8; atlas.face.open = 0.25; atlas.autoBlink = false;
      ctx.sets[SET].state.glitch = 0.8; ctx.sets[SET].state.screens = 'glitch';
      const h = atlas.headWorld(V());
      const f0 = faceCam(atlas, { dist: 0.8, side: -0.08 }), f1 = faceCam(atlas, { dist: 0.42, side: -0.03 });
      cam(ctx, lt, { pos: vtrack([[0, f0.pos.toArray()], [4, f1.pos.toArray()]], 'inQuad'), target: f0.target, fov: 30, roll: (t) => Math.sin(t * 3) * 0.04, shake: 1.2, dof: 1, focus: (t) => 0.8 - t * 0.09 });
      keyAt(ctx, h.clone().add(V(0, 0.25, -0.7)), h, 10, 0x9ff0ff, 0.5); rimAt(ctx, h.clone().add(V(0.5, 0.6, 0.7)), h, 26, 0xff2a1a);
      const fl = Math.max(0, Math.sin(lt * 23)) * smoothstep(0.4, 1.0, lt) * (1 - smoothstep(3.3, 4, lt));
      Object.assign(ctx.post, { glitch: 0.35 + 0.4 * fl, whiteout: 0.25 * fl, ca: 0.006, letterbox: 1 });
    } },
  { id: 's3_09', scene: 3, set: SET, dur: 2.5, desc: 'Ana ekran: 00:00:01 — DONDU',
    cues: [S('beep_count', 0.4, -6), S('beep_count', 0.75, -6), S('system_freeze', FREEZE - 43.0, 0)],
    update(ctx, lt) {
      const st = 43.0 + lt; stage(ctx, st);
      ctx.sets[SET].state.screens = 'countdown';
      cam(ctx, lt, { pos: vtrack([[0, [-1.9, 1.34, -2.98]], [2.5, [-2.0, 1.28, -3.1]]]), target: V(-2.3, 1.18, -3.55), fov: 38, shake: lt < 0.2 ? 0.8 : 0.1 });
      ctx.post.letterbox = 1; ctx.post.flash = st > FREEZE && st < FREEZE + 0.12 ? 0.5 : 0;
    } },
  { id: 's3_10', scene: 3, set: SET, dur: 2.6, desc: 'Defne ana şalteri indirir — karanlık',
    cues: [S('breaker_clunk', BREAKER - 45.5, 0)],
    update(ctx, lt) {
      const st = 45.5 + lt; stage(ctx, st); const { defne } = ctx.chars;
      // Defne şalterin önünde
      const B = ctx.sets[SET].anchors.breaker; defne.place(B.x, B.z, B.heading);
      defne.setPose('stand'); const pull = smoothstep(0.2, 0.7, lt);
      defne.ik.r = V(-4.8, 1.62 - 0.4 * pull, -1.4); defne.ik.rW = 1; defne.mixPose({ rHand: 'grip' }, 1);
      defne.ik.l = V(-4.8, 1.55 - 0.4 * pull, -1.32); defne.ik.lW = 0.8; defne.mixPose({ lHand: 'grip' }, 1);
      defne.mixPose({ spine: [0.15 * pull, 0, 0], hips: { y: -0.06 * pull } });
      defne.expr('determined', 0.9); defne.lookAt(V(-4.9, 1.45, -1.4), 0.6, 1);
      cam(ctx, lt, { pos: V(-4.3, 1.5, -2.75), target: V(-4.6, 1.38, -1.4), fov: 40, shake: 0.5 + (st > BREAKER ? 1.5 * Math.exp(-(st - BREAKER) * 5) : 0) });
      faceLights(ctx, defne, { key: st > BREAKER + 0.15 ? 0 : 6, keyColor: 0xffb0a0, rim: st > BREAKER + 0.15 ? 3 : 18, rimColor: 0xff2a1a });
      ctx.post.letterbox = 1; ctx.post.fade = smoothstep(BREAKER + 0.2 - 45.5, 2.6, lt) * 0.85;
    } },
];
