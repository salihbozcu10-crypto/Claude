// SAHNE 4 — Final ve Büyük Gizem (üs, karanlık sonrası loş ışık)
import * as THREE from 'three';
import { V, cam, vtrack, walk, say, faceCam, faceLights, keyAt, fillAt, rimAt, grade, show, hold, placeProp, fadeIn, L, S, M, A, clamp, smoothstep, lerp, fbm1 } from './helpers.js';

const SET = 'base';
const FLOOR = V(-1.25, 0, -2.0); // Atlas'ın yığıldığı yer
const PHOTO_T = 13.5; // fotoğrafı bulma (sahne-4 zamanı)

function stage(ctx, st) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET];
  show(atlas, asya, defne);
  Object.assign(set.state, { mode: 'after', power: 0, alarm: 0, afterDim: 1, screens: 'off', breaker: 1, cableAttached: false, doorBangs: [], emergency: 1 });
  grade(ctx, 'after', { exposure: 1.4 });
  ctx.RIM.color.value.set(0x6a90c0); ctx.RIM.strength.value = 0.16;
  // soğuk loş "normal" ışık: yukarıdan yumuşak anahtar
  fillAt(ctx, V(-0.5, 2.6, 0.5), 3.5, 0x8aa0c8, 7);
}

// Atlas yığılma: st 0.5 → 1.7
function atlasFall(ctx, st) {
  const { atlas } = ctx.chars; const np = atlas.extras.neuralPort;
  const k1 = smoothstep(0.5, 1.0, st), k2 = smoothstep(1.0, 1.6, st);
  atlas.place(FLOOR.x, FLOOR.z + 0.3 * k2, Math.PI - 0.3 * k2);
  atlas.setPose('kneel', k1 * (1 - k2));
  atlas.setPose('lying', k2);
  atlas.root.rotation.z = -k2 * 1.45;
  atlas.root.position.y = 0.13 * k2;
  atlas.root.position.x -= 0.0;
  np.glow = 0.25 * (1 - k1) + 0.05;
  return k2;
}

export const scene4 = [
  { id: 's4_01', scene: 4, set: SET, dur: 3.5, desc: 'Derin sessizlik. Atlas yere yığılır',
    cues: [S('tinnitus_ring', 0, -10), S('body_fall', 1.5, -2), A('amb_after', 0.2, 33, -16)],
    update(ctx, lt) {
      const st = lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, st); atlas.expr('tired', 1); atlas.face.blink = smoothstep(0.6, 1.2, st) * 0.9; atlas.autoBlink = false;
      asya.place(3.9, 0.55, -Math.PI / 2 - 0.5); asya.setPose('alert'); asya.lookAt(atlas.headWorld(V()), 0.8, 1); asya.expr('shock', 0.6);
      const B = ctx.sets[SET].anchors.breaker; defne.place(B.x + 0.15, B.z + 0.1, B.heading + 1.3); defne.setPose('alert'); defne.lookAt(atlas.headWorld(V()), 0.7, 1); defne.expr('scared', 0.7);
      cam(ctx, lt, { pos: vtrack([[0, [0.4, 1.0, 0.4]], [3.5, [0.2, 0.9, 0.0]]], 'inOutSine'), target: V(-1.3, 0.75, -2.05), fov: 40, dof: 0.6, focus: 2.3 });
      keyAt(ctx, V(-0.4, 2.5, -0.8), V(-1.3, 0.6, -2.0), 30, 0xb8c8e8, 0.6);
      ctx.post.fade = 0.85 * (1 - smoothstep(0, 1.4, lt)); ctx.post.letterbox = 1;
    } },
  { id: 's4_02', scene: 4, set: SET, dur: 3.0, desc: 'Asya ve Defne koşarak yanına diz çöker',
    cues: [S('footsteps_run', 0.0, -6, { dur: 1.6 }), M('mus_s4_relief', 0.3, -6)],
    update(ctx, lt) {
      const st = 3.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, st); atlas.expr('tired', 1); atlas.face.blink = 0.95; atlas.autoBlink = false;
      const wa = walk(asya, [V(3.9, 0, 0.55), V(1.0, 0, -0.6), V(-0.75, 0, -1.55)], 0.0, 1.6, lt, { run: 1, heading: -2.4, strideScale: 1.3 });
      const B = ctx.sets[SET].anchors.breaker;
      const wd = walk(defne, [V(B.x + 0.15, 0, B.z + 0.1), V(-2.6, 0, -1.7), V(-1.85, 0, -1.6)], 0.2, 1.9, lt, { run: 1, heading: 2.3, strideScale: 1.2 });
      if (wa.done) { asya.setPose('kneel', smoothstep(1.6, 2.1, lt)); } else asya.setPose('run', wa.amount);
      if (wd.done) { defne.setPose('kneel', smoothstep(1.9, 2.4, lt)); } else defne.setPose('run', wd.amount);
      asya.lookAt(atlas.headWorld(V()), 0.9, 1); defne.lookAt(atlas.headWorld(V()), 0.9, 1);
      asya.expr('scared', 0.9); defne.expr('scared', 0.9);
      cam(ctx, lt, { pos: V(0.3, 0.45, 0.6), target: V(-1.2, 0.55, -1.9), fov: 42, shake: 0.5 });
      keyAt(ctx, V(-0.4, 2.5, -0.8), V(-1.3, 0.6, -2.0), 30, 0xb8c8e8, 0.6);
      ctx.post.letterbox = 1;
    } },
  { id: 's4_03', scene: 4, set: SET, dur: 3.0, desc: 'Asya: "Atlas... İyi misin? Başardın mı?"',
    cues: [L('L14', 0.3)],
    update(ctx, lt) {
      const st = 6.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, 3); atlas.face.blink = 0.95; atlas.autoBlink = false;
      asya.place(-0.75, -1.55, -2.4); asya.setPose('kneel'); asya.mixPose({ spine: [0.3, 0, 0], lShoulder: [0.7, 0.1, 0], lElbow: [0.6], rShoulder: [0.6, 0.1, 0], rElbow: [0.7], lHand: 'open', rHand: 'open' });
      defne.place(-1.85, -1.6, 2.3); defne.setPose('kneel');
      asya.lookAt(atlas.headWorld(V()), 0.9, 1); asya.expr('sad', 0.7); asya.expr('worried', 0.5);
      defne.lookAt(atlas.headWorld(V()), 0.9, 1); defne.expr('worried', 0.9);
      say(ctx, asya, 'L14', 0.3, lt, 0.85);
      const h = asya.headWorld(V());
      const fa = faceCam(asya, { dist: 0.85, side: 0.3, up: 0.05 }), fb = faceCam(asya, { dist: 0.7, side: 0.25, up: 0.04 });
      cam(ctx, lt, { pos: vtrack([[0, fa.pos.toArray()], [3, fb.pos.toArray()]]), target: fa.target, fov: 32, dof: 1, focus: 0.8 });
      faceLights(ctx, asya, { key: 8, keyColor: 0xc8d8f0, rim: 12, rimColor: 0x6a90c0 });
      ctx.post.letterbox = 1;
    } },
  { id: 's4_04', scene: 4, set: SET, dur: 4.2, desc: 'Atlas gözlerini açar: "Başardım... Güvendeyiz."',
    cues: [L('L15', 0.7)],
    update(ctx, lt) {
      const st = 9.5 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars;
      atlasFall(ctx, 3); atlas.autoBlink = true;
      atlas.face.blink = 1 - smoothstep(0.2, 0.9, lt) * 0.75; atlas.expr('tired', 1); atlas.expr('sadSmile', 0.5 * smoothstep(2.5, 3.5, lt));
      atlas.mixPose({ head: [-0.25, 0.4, 0] });
      asya.place(-0.75, -1.55, -2.4); asya.setPose('kneel'); asya.mixPose({ spine: [0.3, 0, 0] });
      defne.place(-1.85, -1.6, 2.3); defne.setPose('kneel');
      atlas.lookAt(asya.headWorld(V()), 0.3, 1); asya.lookAt(atlas.headWorld(V()), 0.9, 1);
      say(ctx, atlas, 'L15', 0.7, lt, 0.75);
      const h = atlas.headWorld(V());
      const fa = faceCam(atlas, { dist: 0.7, side: 0.15, up: 0.25 }), fb = faceCam(atlas, { dist: 0.55, side: 0.12, up: 0.2 });
      cam(ctx, lt, { pos: vtrack([[0, fa.pos.toArray()], [4.2, fb.pos.toArray()]]), target: fa.head, fov: 32, dof: 1, focus: 0.62 });
      keyAt(ctx, h.clone().add(V(0.4, 1.2, 0.4)), h, 10, 0xc8d8f0, 0.5); rimAt(ctx, h.clone().add(V(-0.8, 0.6, -0.5)), h, 10, 0x6a90c0);
      ctx.post.letterbox = 1;
    } },
  { id: 's4_05', scene: 4, set: SET, dur: 3.6, desc: 'Defne masanın altında buruşuk bir kâğıt bulur',
    cues: [S('paper_rustle', 1.2, -4)],
    update(ctx, lt) {
      const st = 13.7 + lt; stage(ctx, st); const { atlas, asya, defne } = ctx.chars; const P = ctx.props;
      atlasFall(ctx, 3); atlas.face.blink = 0.3;
      asya.place(-0.75, -1.55, -2.4); asya.setPose('kneel'); asya.lookAt(atlas.headWorld(V()), 0.9, 1); asya.expr('sadSmile', 0.4);
      // Defne masanın kenarına çömelir, kâğıdı alır, kalkar
      defne.place(0.1, -0.78, 0); defne.setPose('crouch', 1 - smoothstep(2.0, 3.0, lt)); defne.setPose('holdPaper', smoothstep(1.6, 2.6, lt));
      const pick = smoothstep(0.6, 1.3, lt) * (1 - smoothstep(1.6, 2.2, lt));
      if (pick > 0) { defne.ik.r = V(0.15, 0.06, -0.32); defne.ik.rW = pick; }
      defne.lookAt(lt < 1.8 ? V(0.15, 0.03, -0.3) : P.photo.group.getWorldPosition(V()), 0.8, 1); defne.expr('focused', 0.6);
      const unf = smoothstep(2.2, 3.5, lt);
      P.photo.unfold = unf * 0.85; P.photo.flip = 0;
      if (lt < 1.4) placeProp(ctx, P.photo, V(0.15, 0.012, -0.32), 0, [-Math.PI / 2, 0, 0.6]);
      else { defne.update(ctx.t); const hp = defne.bones.chest.localToWorld(V(0, 0.02, 0.28)); placeProp(ctx, P.photo, hp); P.photo.group.lookAt(defne.headWorld(V())); }
      P.photo.unfold = lt < 1.4 ? 0 : unf;
      cam(ctx, lt, { pos: vtrack([[0, [-0.85, 0.75, -0.15]], [3.6, [-0.8, 1.3, -0.05]]], 'inOutSine'), target: vtrack([[0, [0.1, 0.35, -0.6]], [3.6, [0.1, 1.15, -0.7]]], 'inOutSine'), fov: 40, dof: 0.6, focus: 1.2 });
      faceLights(ctx, defne, { key: 8, keyColor: 0xc8d8f0, rim: 10, rimColor: 0x6a90c0 });
      ctx.post.letterbox = 1;
    } },
  { id: 's4_06', scene: 4, set: SET, dur: 2.6, desc: 'Fotoğraf: hiç hatırlamadıkları bir an',
    cues: [M('mus_s4_ominous', 0.3, -4)],
    update(ctx, lt) {
      const st = 17.3 + lt; stage(ctx, st); const { defne, atlas } = ctx.chars; const P = ctx.props;
      atlasFall(ctx, 3);
      defne.place(0.1, -0.78, 0); defne.setPose('holdPaper'); defne.expr('surprised', 0.6);
      defne.update(ctx.t);
      const hp = defne.bones.chest.localToWorld(V(0, 0.02, 0.28)); placeProp(ctx, P.photo, hp); P.photo.group.lookAt(defne.headWorld(V())); P.photo.unfold = 1; P.photo.flip = 0;
      const n = defne.headWorld(V()).sub(hp).normalize();
      cam(ctx, lt, { pos: vtrack([[0, hp.clone().addScaledVector(n, 0.3).add(V(0.02, 0.02, 0)).toArray()], [2.6, hp.clone().addScaledVector(n, 0.24).toArray()]]), target: hp, fov: 34, dof: 1, focus: 0.27, aperture: 0.05 });
      keyAt(ctx, hp.clone().addScaledVector(n, 0.6).add(V(0.3, 0.5, 0)), hp, 8, 0xd8e0f0, 0.5);
      ctx.post.letterbox = 1; void atlas;
    } },
  { id: 's4_07', scene: 4, set: SET, dur: 7.2, desc: 'Arkası: kendi el yazısı — "4. kişiye dikkat et."',
    cues: [L('L16', 0.6), S('paper_rustle', 0.1, -6)],
    update(ctx, lt) {
      const st = 19.9 + lt; stage(ctx, st); const { defne } = ctx.chars; const P = ctx.props;
      atlasFall(ctx, 3);
      defne.place(0.1, -0.78, 0); defne.setPose('holdPaper'); defne.expr('scared', 0.4 + 0.5 * smoothstep(4, 6.5, lt)); defne.expr('shock', 0.45 * smoothstep(5.2, 6.6, lt)); defne.mixPose({ lWrist: [Math.sin(ctx.t * 19) * 0.03, 0, 0], rWrist: [Math.sin(ctx.t * 17) * 0.03, 0, 0] });
      defne.update(ctx.t);
      const hp = defne.bones.chest.localToWorld(V(0, 0.02, 0.28)); placeProp(ctx, P.photo, hp); P.photo.group.lookAt(defne.headWorld(V()));
      P.photo.unfold = 1; P.photo.flip = smoothstep(0.1, 0.6, lt);
      const head = defne.headWorld(V());
      const n = head.clone().sub(hp).normalize();
      // 0–4.8 sn: Defne'nin gözünden not (POV). 4.8 sn'de kesme: önden, korkmuş yüzüne yavaş itme
      // (eski geri çekilme hareketi kamerayı başın içinden geçiriyordu)
      const CUT = 4.8;
      if (lt < CUT) {
        cam(ctx, lt, { pos: hp.clone().addScaledVector(n, 0.26).add(V(0, 0.03, 0)), target: hp, fov: 34, shake: 0.15, dof: 1, focus: 0.26, aperture: 0.05 });
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
      // Atlas (Asya'nın desteğiyle ayakta) ve Asya kameranın arkasında: yalnızca yansımada görünürler
      atlas.place(1.45, -2.05, Math.PI - 0.1); atlas.setPose('stand'); atlas.expr('tired', 0.8); atlas.mixPose({ spine: [0.08, 0, 0.04], head: [0.1, 0, 0.06] });
      asya.place(2.05, -1.95, Math.PI + 0.12); asya.setPose('stand'); asya.mixPose({ rShoulder: [0.3, -0.2, 0.4], rElbow: [0.8] }); asya.expr('worried', 0.5);
      atlas.lookAt(V(1.7, 1.5, -3.9), 0.5, 1); asya.lookAt(V(1.7, 1.5, -3.9), 0.5, 1);
      // Defne ön planda solda, sırtı kameraya dönük, fotoğrafı tutuyor
      defne.place(1.05, -2.75, Math.PI + 0.15); defne.setPose('holdPaper'); defne.expr('scared', 0.6); defne.lookAt(V(1.6, 1.5, -3.9), 0.6, 1);
      defne.update(ctx.t);
      const hp = defne.bones.chest.localToWorld(V(0, 0.02, 0.28)); placeProp(ctx, P.photo, hp); P.photo.group.lookAt(defne.headWorld(V())); P.photo.unfold = 1; P.photo.flip = 1;
      // Gölge: odanın karanlık köşesine (sağ-arka) dönüp el sallar — yalnızca yansımada görünür
      defneShadow.root.visible = true; defneShadow.place(2.75, -1.55, 0.75); defneShadow.setPose('stand');
      const wv = smoothstep(2.0, 2.8, lt);
      defneShadow.setPose('wave', wv); defneShadow.mixPose({ rWrist: [0, Math.sin(ctx.t * 7) * 0.5 * wv, 0], rElbow: [Math.sin(ctx.t * 7) * 0.25 * wv] });
      defneShadow.lookAt(V(4.8, 1.3, 3.8), 0.8, 0); defneShadow.autoBlink = false;
      // gölgenin arkasındaki ön-sağ köşeyi soğukça aydınlat (yansımada siyah siluet net okunsun)
      keyAt(ctx, V(2.4, 2.95, 1.0), V(4.3, 0.9, 3.9), 140, 0x8aaad8, 0.6);
      fillAt(ctx, V(1.7, 2.4, -1.2), 5, 0x9ab0d0, 5);
      cam(ctx, lt, { pos: vtrack([[0, [1.7, 1.55, -2.35]], [7, [1.7, 1.58, -3.05]]], 'inOutSine'), target: V(1.7, 1.55, -3.95), fov: 40 });
      ctx.post.letterbox = 1; ctx.post.vignette = 0.65; ctx.post.fade = smoothstep(5.8, 7.0, lt);
      ctx.post.exposure = 1.5;
    } },
];
