// SAHNE 1 — Teaser: Antika Sinyal (sunucu odası)
import * as THREE from 'three';
import { V, cam, vtrack, track, walk, say, faceLights, keyAt, fillAt, rimAt, grade, show, hold, placeProp, fadeIn, fadeOut, L, S, M, A, DUR, clamp, smoothstep, lerp, fbm1 } from './helpers.js';

const SET = 'serverRoom';
const FL_HAND = [[0, -0.07, 0.012], [Math.PI / 2, 0, 0]];   // el feneri: sağ bilek yerel
const GUN_HAND = [[0, -0.075, 0.045], [Math.PI / 2, 0, 0]]; // tabanca: sağ bilek yerel

// ekip başlangıçta kapıdan girer; yürüyüş yolları
const pathA = [V(0, 0, 5.2), V(0.02, 0, 3.4), V(0, 0, 1.6), V(0.05, 0, 0.55)];
const pathS = [V(-0.3, 0, 6.0), V(-0.4, 0, 3.8), V(-0.6, 0, 2.0), V(-0.75, 0, 0.9)];
const pathD = [V(0.35, 0, 6.6), V(0.35, 0, 4.2), V(0.6, 0, 2.2), V(0.78, 0, 1.0)];
const WALK0 = 1.4; // küresel sahne zamanında ekip yürümeye başlar
const S1 = { A: [WALK0, WALK0 + 10.0], S: [WALK0 + 0.3, WALK0 + 11.0], D: [WALK0 + 0.5, WALK0 + 12.6] };
const CRT_ON = 18.0; // CRT açılır (sahne zamanı)

// sahne-zamanı (st) tabanlı ortak kurulum: her çekim kendi başlangıç ofsetini verir
function stage(ctx, st, opts = {}) {
  const { atlas, asya, defne } = ctx.chars; const set = ctx.sets[SET]; const P = ctx.props;
  show(atlas, asya, defne);
  // pozlar (önce), sonra yürüyüş eklenir
  atlas.setPose('holdFlashlight'); asya.setPose('lowReady'); defne.setPose('holdTablet');
  const wa = walk(atlas, pathA, S1.A[0], S1.A[1], st, { heading: Math.PI, strideScale: 0.95 });
  const ws = walk(asya, pathS, S1.S[0], S1.S[1], st, { heading: Math.PI - 0.25 });
  const wd = walk(defne, pathD, S1.D[0], S1.D[1], st, { heading: Math.PI + 0.3, strideScale: 0.85 });
  // el feneri ile tarama (baş + kol)
  const scan = st < CRT_ON - 1 ? Math.sin(st * 0.9) * 0.35 + fbm1(st * 0.5) * 0.2 : 0;
  atlas.mixPose({ rShoulder: [0, 0, -scan * 0.6], chest: [0, scan * 0.4, 0], head: [0, scan * 0.6, 0] });
  asya.mixPose({ head: [0, Math.sin(st * 0.7 + 1) * 0.5, 0], chest: [0, Math.sin(st * 0.7 + 1) * 0.2, 0] });
  atlas.expr('focused', 0.6); atlas.expr('tired', 0.3); asya.expr('suspicious', 0.7); defne.expr('focused', 0.6);
  // aksesuarlar
  hold(P.flashlight, atlas.bones.rWrist, ...FL_HAND); P.flashlight.on = 1;
  hold(P.pistol, asya.bones.rWrist, ...GUN_HAND); P.pistol.charge = 0.35;
  hold(P.tablet, defne.bones.chest, [0, 0.03, 0.3], [-0.95, 0, 0]); P.tablet.mode = 'signal';
  P.tablet.prox = clamp((st - 2) / 14, 0.05, 0.98);
  // CRT
  placeProp(ctx, P.crt, set.anchors.crt, 0);
  const pw = clamp((st - CRT_ON) / 0.9);
  P.crt.power = pw; P.crt.countdown = 900 - Math.max(0, st - CRT_ON - 0.6);
  set.state.flicker = st > CRT_ON - 0.2 && st < CRT_ON + 1.5 ? 0.6 * (1 - (st - CRT_ON + 0.2) / 1.7) : 0;
  if (st > CRT_ON) P.tablet.mode = 'alert';
  // gözler: CRT açıldıktan sonra ekrana bakış
  const crtEye = set.anchors.crt.clone().add(V(0, 0.28, 0.15));
  if (st > CRT_ON + 0.3) { atlas.lookAt(crtEye, 0.8, 1); asya.lookAt(crtEye, 0.7, 1); defne.lookAt(crtEye, 0.6, 1); }
  else { defne.lookAt(P.tablet.group.getWorldPosition(V()), 0.3, 1); }
  grade(ctx, 'serverRoom');
  ctx.RIM.color.value.set(0x5ab0ff); ctx.RIM.strength.value = 0.22;
  return { wa, ws, wd, crtEye };
}

export const scene1 = [
  // 1) Kuruluş: karanlık oda, ışık huzmeleri; kapıdan el feneri giriyor
  { id: 's1_01', scene: 1, set: SET, dur: 6.0, desc: 'Kuruluş planı: sunucu odası, ekip kapıdan giriyor',
    cues: [A('amb_rain_muffled', 0, 52, -6), A('amb_drips', 0, 52, -4), A('amb_room_hum', 0, 52, -10), M('mus_s1_dark', 0, -2), S('flashlight_click', 1.2, -6), S('footsteps_wet', 1.6, -8, { dur: 10 })],
    update(ctx, lt) {
      const st = lt; stage(ctx, st);
      cam(ctx, lt, { pos: vtrack([[0, [3.6, 2.9, -3.4]], [6, [3.1, 2.4, -2.6]]], 'inOutSine'), target: vtrack([[0, [0, 0.8, 2.6]], [6, [0, 1.0, 2.2]]], 'inOutSine'), fov: 40, shake: 0.3 });
      ctx.post.fade = fadeIn(lt, 1.6); ctx.post.letterbox = 1;
    } },
  // 2) Koridorda takip: ekip yaklaşıyor; Defne mırıldanmaya başlar
  { id: 's1_02', scene: 1, set: SET, dur: 5.5, desc: 'Koridorda önden takip çekimi; Defne: "Sinyal kaynağı..."',
    cues: [L('L01', 1.6)],
    update(ctx, lt) {
      const st = 6.0 + lt; const { atlas, defne } = ctx.chars; stage(ctx, st);
      say(ctx, defne, 'L01', 1.6, lt, 0.8);
      const a = atlas.root.position;
      cam(ctx, lt, { pos: V(a.x + 0.55, 1.45, a.z - 1.9), target: V(a.x - 0.05, 1.25, a.z + 0.6), fov: 34, shake: 0.6, dof: 0.6, focus: 2.0, aperture: 0.05 });
      faceLights(ctx, atlas, { key: 4, rim: 10, rimColor: 0x5ab0ff, keyColor: 0x9ac0ff });
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
      cam(ctx, lt, { pos: V(h.x - 0.25, h.y - 0.02, h.z - 0.75), target: h.clone().add(V(0, -0.03, 0)), fov: 30, shake: 0.4, dof: 1, focus: 0.8, aperture: 0.07 });
      keyAt(ctx, h.clone().add(V(0.05, -0.35, -0.35)), h, 3, 0x60c8ff, 0.5);
      rimAt(ctx, h.clone().add(V(0.6, 0.6, 0.9)), h, 16, 0x5ab0ff);
      fillAt(ctx, h.clone().add(V(-0.6, 0.2, -0.4)), 0.4, 0xffc070, 2);
      ctx.post.letterbox = 1;
    } },
  // 4) Ekip durur; el feneri CRT'yi bulur; CRT kendiliğinden açılır
  { id: 's1_04', scene: 1, set: SET, dur: 5.5, desc: 'Arkadan geniş: el feneri CRT\'yi bulur, ekran kendiliğinden yanar',
    cues: [S('crt_on', CRT_ON - 16.5, -2), A('crt_whine', CRT_ON - 16.5 + 0.4, 34, -14), S('sting_low', CRT_ON - 16.5, -6)],
    update(ctx, lt) {
      const st = 16.5 + lt; const { atlas } = ctx.chars; stage(ctx, st);
      atlas.mixPose({ rShoulder: [0.1, 0, 0] });
      cam(ctx, lt, { pos: vtrack([[0, [0.9, 1.75, 2.9]], [5.5, [0.75, 1.6, 2.5]]], 'inOutSine'), target: V(0, 0.95, -0.6), fov: 36, shake: 0.35, dof: 0.5, focus: 3.2 });
      ctx.post.letterbox = 1;
    } },
  // 5) CRT ekleme: yeşil sayaç
  { id: 's1_05', scene: 1, set: SET, dur: 2.5, desc: 'CRT ekranı yakın: 00:15:00 geri sayım',
    cues: [S('beep_count', 0.3, -10), S('beep_count', 1.3, -10), S('beep_count', 2.3, -10)],
    update(ctx, lt) {
      const st = 22 + lt; stage(ctx, st);
      const c = ctx.sets[SET].anchors.crt;
      cam(ctx, lt, { pos: vtrack([[0, [c.x + 0.12, c.y + 0.32, c.z + 0.85]], [2.5, [c.x + 0.08, c.y + 0.3, c.z + 0.7]]]), target: V(c.x, c.y + 0.28, c.z + 0.15), fov: 32, dof: 0.8, focus: 0.62, aperture: 0.05 });
      ctx.post.letterbox = 1;
    } },
  // 6) Asya tabancayı doğrultur
  { id: 's1_06', scene: 1, set: SET, dur: 4.5, desc: 'Asya kaşlarını çatıp tabancayı doğrultur',
    cues: [L('L02', 0.4), S('pistol_charge', 0.1, -6)],
    update(ctx, lt) {
      const st = 24.5 + lt; const { asya } = ctx.chars; const r = stage(ctx, st);
      const k = smoothstep(0, 0.5, lt);
      asya.setPose('aimPistol', k); asya.expr('angry', 0.8 * k); asya.lookAt(r.crtEye, 0.9, 1);
      ctx.props.pistol.charge = 0.35 + 0.65 * k; ctx.props.pistol.spark = lt > 0.6 ? 0.5 + 0.5 * Math.sin(lt * 30) : 0;
      say(ctx, asya, 'L02', 0.4, lt);
      const h = asya.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.55, h.y - 0.1, h.z - 1.1]], [4.5, [h.x + 0.45, h.y - 0.08, h.z - 0.95]]]), target: h.clone().add(V(0.05, -0.12, 0)), fov: 34, shake: 0.5, dof: 1, focus: 1.1 });
      faceLights(ctx, asya, { key: 7, keyColor: 0x80ffb0, rim: 14, rimColor: 0x5ab0ff, side: -1 });
      ctx.post.letterbox = 1;
    } },
  // 7) Atlas öne atılır: "Bekle, dokunma! ... Bu bir imza."
  { id: 's1_07', scene: 1, set: SET, dur: 4.0, desc: 'Atlas öne atılır, elini ekrana uzatır',
    cues: [L('L03', 0.2)],
    update(ctx, lt) {
      const st = 29 + lt; const { atlas, asya } = ctx.chars; const r = stage(ctx, st);
      asya.setPose('aimPistol', 1 - smoothstep(0.8, 1.6, lt) * 0.6); asya.expr('angry', 0.6);
      // önce Asya'ya "dur" eli, sonra ekrana uzanış
      const s1 = smoothstep(0.1, 0.5, lt) * (1 - smoothstep(1.4, 1.9, lt));
      const s2 = smoothstep(1.6, 2.6, lt);
      atlas.setPose('stopArm', s1); atlas.setPose('reachForward', s2);
      atlas.root.position.z -= 0.18 * s2;
      atlas.expr('worried', 0.5 * s1); atlas.expr('surprised', 0.4 * s2);
      if (lt < 1.4) atlas.lookAt(asya.headWorld(V()), 0.7, 1); else atlas.lookAt(r.crtEye, 1, 1);
      say(ctx, atlas, 'L03', 0.2, lt);
      const h = atlas.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x - 0.75, h.y + 0.05, h.z + 0.9]], [4, [h.x - 0.55, h.y + 0.02, h.z + 0.6]]]), target: vtrack([[0, [h.x, h.y - 0.1, h.z - 0.5]], [4, [h.x, h.y - 0.08, h.z - 0.7]]]), fov: 36, shake: 0.4, dof: 0.7, focus: 1.2 });
      faceLights(ctx, atlas, { key: 6, keyColor: 0x80ffb0, rim: 12, rimColor: 0x5ab0ff });
      ctx.post.letterbox = 1;
    } },
  // 8) CRT camındaki yansıma: arkalarında dördüncü siluet
  { id: 's1_08', scene: 1, set: SET, dur: 4.5, desc: 'CRT camındaki yansıma: dördüncü siluet belirir',
    cues: [S('sting_reveal', 1.6, 0), S('heartbeat', 1.8, -6, { dur: 4 })],
    update(ctx, lt) {
      const st = 33 + lt; const { atlas, shadow } = ctx.chars; stage(ctx, st);
      atlas.setPose('reachForward', 0.6); atlas.root.position.z -= 0.12; atlas.expr('focused', 0.5);
      const set = ctx.sets[SET]; const c = set.anchors.crt;
      // gölge figür: ekibin arkasında
      shadow.root.visible = true; const sf = set.anchors.shadowFigure; shadow.place(sf.x, sf.z, sf.heading); shadow.autoBlink = false; shadow.idle = 0.2;
      const vis = smoothstep(1.2, 2.6, lt);
      shadow.root.scale.setScalar(1);
      ctx.props.crt.reflection = 0.35 + 0.5 * vis;
      shadow.root.visible = vis > 0.02;
      // kamera: Atlas'ın başının hemen yanından ekrana
      cam(ctx, lt, { pos: vtrack([[0, [c.x - 0.2, c.y + 0.42, c.z + 0.75]], [4.5, [c.x - 0.14, c.y + 0.36, c.z + 0.55]]], 'inOutSine'), target: V(c.x + 0.02, c.y + 0.28, c.z + 0.15), fov: 30, dof: 0.6, focus: 0.55, aperture: 0.04 });
      ctx.post.letterbox = 1; ctx.post.vignette = 0.6;
    } },
  // 9) Atlas'ın gözleri büyür
  { id: 's1_09', scene: 1, set: SET, dur: 2.0, desc: 'Atlas yakın: nefesi kesilir',
    cues: [],
    update(ctx, lt) {
      const st = 37.5 + lt; const { atlas } = ctx.chars; const r = stage(ctx, st);
      atlas.setPose('reachForward', 0.5 * (1 - smoothstep(0.2, 1.2, lt))); atlas.root.position.z -= 0.12;
      atlas.expr('shock', smoothstep(0.1, 0.6, lt)); atlas.face.open = 0.15 * smoothstep(0.2, 0.6, lt); atlas.breath = 0;
      atlas.lookAt(r.crtEye, 1, 1);
      const h = atlas.headWorld(V());
      cam(ctx, lt, { pos: vtrack([[0, [h.x + 0.05, h.y + 0.0, h.z - 0.62]], [2, [h.x + 0.03, h.y, h.z - 0.42]]], 'inOutSine'), target: h.clone().add(V(0, 0.0, 0)), fov: 28, dof: 1, focus: 0.5, aperture: 0.06 });
      keyAt(ctx, h.clone().add(V(0.1, 0.0, -0.6)), h, 5, 0x60ff90, 0.5);
      rimAt(ctx, h.clone().add(V(-0.6, 0.7, 0.8)), h, 18, 0x5ab0ff);
      ctx.post.letterbox = 1;
    } },
  // 10) Hızla döner — oda boş
  { id: 's1_10', scene: 1, set: SET, dur: 2.5, desc: 'Atlas hızla arkasını döner: kimse yok',
    cues: [S('whoosh_turn', 0.15, -2)],
    update(ctx, lt) {
      const st = 39.5 + lt; const { atlas, asya, defne } = ctx.chars; stage(ctx, st);
      const k = smoothstep(0.0, 0.35, lt);
      atlas.root.position.z -= 0.12;
      atlas.root.rotation.y = Math.PI - k * Math.PI * 0.95;
      atlas.setPose('alert'); atlas.setPose('holdFlashlight', 0.8); atlas.expr('scared', 0.8);
      asya.lookAt(atlas.headWorld(V()), 0.6, 1); defne.lookAt(atlas.headWorld(V()), 0.6, 1); defne.expr('worried', 0.6);
      const a = atlas.root.position;
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
      cam(ctx, lt, { pos: vtrack([[0, [c.x + 0.25, c.y + 0.4, c.z + 1.25]], [7, [c.x + 0.05, c.y + 0.31, c.z + 0.62]]], 'inOutSine'), target: V(c.x, c.y + 0.28, c.z + 0.15), fov: 32, shake: 0.2, dof: 0.6, focus: (t) => 1.1 - t * 0.07 });
      ctx.post.glitch = lt > 0.6 && lt < 1.1 ? 0.6 : 0; ctx.post.ca = 0.003;
      ctx.post.letterbox = 1;
    } },
  // 12) Kırmızıyla aydınlanan yüzler; kesme
  { id: 's1_12', scene: 1, set: SET, dur: 4.0, desc: 'Ters açı: üçü kırmızı ışıkta donakalmış',
    cues: [S('sub_drop', 3.4, -2)],
    update(ctx, lt) {
      const st = 49 + lt; const { atlas, asya, defne } = ctx.chars; const r = stage(ctx, st);
      const P = ctx.props; P.crt.message = 1; P.crt.countdown = 900 - (st - CRT_ON) - 8 * 49 / 7 - lt * 30;
      atlas.setPose('alert'); atlas.root.position.z -= 0.12; atlas.expr('shock', 0.7); atlas.lookAt(r.crtEye, 1, 1);
      asya.setPose('aimPistol', 0.7); asya.expr('angry', 0.4); asya.expr('scared', 0.4);
      defne.expr('scared', 0.9);
      const c = ctx.sets[SET].anchors.crt;
      cam(ctx, lt, { pos: vtrack([[0, [c.x + 0.05, c.y + 0.55, c.z + 0.35]], [4, [c.x + 0.05, c.y + 0.6, c.z + 0.55]]]), target: V(0, 1.45, 0.9), fov: 40, dof: 0.6, focus: 1.3 });
      keyAt(ctx, V(c.x, c.y + 0.35, c.z + 0.35), V(0, 1.45, 0.8), 7, 0xff2a1a, 0.7);
      ctx.post.fade = smoothstep(3.3, 4.0, lt); ctx.post.letterbox = 1;
    } },
];
export const SCENE1_DUR = scene1.reduce((a, s) => a + s.dur, 0);
