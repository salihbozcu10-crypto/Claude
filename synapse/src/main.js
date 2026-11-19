// SYNAPSE — giriş noktası.
// Modlar (URL sorgusu):
//   ?mode=episode (varsayılan)       tam bölüm; window.SYN.renderFrame(i)
//   ?mode=char&name=atlas&view=face|bust|full|threeq|side|back|hands&expr=happy&pose=typing&open=0.5&t=0
//   ?mode=set&name=serverRoom|base&cam=0..n   (setin önizleme kameraları)
//   ?mode=prop&name=crt|tablet|...            (aksesuar önizleme)
//   ?mode=shot&id=s1_03&lt=1.5                (tek çekim, yerel zaman)
import * as THREE from 'three';
import { createStage } from './engine/stage.js';
import { RIM } from './engine/materials.js';
import { buildCast } from './characters/index.js';
import { buildSets } from './sets/index.js';
import { buildProps } from './props/index.js';
import { createTimeline } from './engine/timeline.js';
import { buildEpisode } from './shots/episode.js';
import { studioLights } from './engine/studio.js';
import { EXPR } from './characters/rig.js';

let q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920), H = +(q.get('h') || 1080);
const FPS = 24;
const canvas = document.getElementById('c');
canvas.style.width = '100vw'; canvas.style.height = 'auto';
const stage = createStage(canvas, W, H, { msaa: +(q.get('msaa') ?? 4) });
const { scene, camera } = stage;

const cast = buildCast();
for (const k in cast) { scene.add(cast[k].root); cast[k].root.visible = false; }
const sets = buildSets(stage);
for (const k in sets) { scene.add(sets[k].group); sets[k].group.visible = false; }
const props = buildProps(stage);
for (const k in props) { if (props[k].group && !props[k].group.parent) scene.add(props[k].group); if (props[k].group) props[k].group.visible = false; }

// çekim başına sinematik ışıklar (yüzler için anahtar + dolgu + kenar); her karede sıfırlanır
const keyLight = new THREE.SpotLight(0xffe6d0, 0, 8, 0.45, 0.8, 1.5); keyLight.castShadow = false; scene.add(keyLight, keyLight.target);
const fillLight = new THREE.PointLight(0x80a8ff, 0, 5, 1.6); scene.add(fillLight);
const rimLight = new THREE.SpotLight(0x60d8ff, 0, 8, 0.5, 0.8, 1.5); scene.add(rimLight, rimLight.target);
const ctx = { stage, scene, camera, post: stage.post, chars: cast, sets, props, RIM, THREE, t: 0, keyLight, fillLight, rimLight };

// her kare başında dünya sıfırlanır; çekim her şeyi baştan kurar
const RIM0 = { color: RIM.color.value.clone(), strength: RIM.strength.value, power: RIM.power.value };
function resetWorld() {
  stage.resetPost();
  RIM.color.value.copy(RIM0.color); RIM.strength.value = RIM0.strength; RIM.power.value = RIM0.power;
  for (const k in cast) { cast[k].reset(); cast[k].root.visible = false; }
  for (const k in sets) { sets[k].group.visible = false; sets[k].reset && sets[k].reset(); }
  for (const k in props) { const p = props[k]; if (p.reset) p.reset(); if (p.group) { p.group.visible = false; if (p.group.parent !== scene && !p.keepParent) scene.add(p.group); } }
  camera.fov = 35; camera.near = 0.05; camera.far = 200; camera.up.set(0, 1, 0); camera.rotation.set(0, 0, 0);
  scene.fog = null; scene.background = new THREE.Color(0x05070c);
  studio.group.visible = false;
  keyLight.intensity = 0; fillLight.intensity = 0; rimLight.intensity = 0;
}
// şiddeti 0 olan ışıkları gizle: shader ışık döngüsünden çıkar (yazılımsal GPU'da büyük kazanç)
function cullLights() {
  scene.traverse((o) => { if (o.isLight && !o.isHemisphereLight && !o.isAmbientLight) o.visible = o.intensity > 1e-3; });
}
const studio = studioLights(scene);

let mode = q.get('mode') || 'episode';
let timeline = null;
if (mode === 'episode' || mode === 'shot') timeline = createTimeline(buildEpisode(ctx));

function finishFrame(t) {
  for (const k in cast) if (cast[k].root.visible) cast[k].update(t);
  cullLights();
  camera.updateProjectionMatrix();
  stage.render(t);
}

function renderEpisodeTime(t) {
  ctx.t = t;
  const { shot, lt } = timeline.at(t);
  resetWorld();
  if (shot.set && sets[shot.set]) sets[shot.set].group.visible = true;
  shot.update(ctx, lt, lt / shot.dur, t);
  if (shot.set && sets[shot.set] && sets[shot.set].update) sets[shot.set].update(t, ctx);
  for (const k in props) if (props[k].group && props[k].group.visible && props[k].update) props[k].update(t, ctx);
  finishFrame(t);
}

// ---- önizleme modları ----
function renderCharPreview(t) {
  resetWorld();
  studio.group.visible = true; scene.background = new THREE.Color(0x1a2a3c);
  const name = q.get('name') || 'atlas'; const ch = cast[name];
  ch.root.visible = true; ch.place(0, 0, +(q.get('rot') || 0));
  if (q.get('pose')) ch.setPose(q.get('pose'));
  if (q.get('expr')) for (const e of q.get('expr').split(',')) { const [n, w] = e.split(':'); ch.expr(n, w ? +w : 1); }
  for (const k of ['open', 'smile', 'wide', 'round', 'browUp', 'browIn', 'browSad', 'squint', 'lidUp', 'blink', 'eyeGlow']) if (q.get(k)) ch.face[k] = +q.get(k);
  if (q.get('walk')) ch.walk(+q.get('walk'), 1);
  ch.autoBlink = false;
  const view = q.get('view') || 'threeq';
  ch.update(t);
  const head = ch.headWorld();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const views = {
    face: [V(0.0, head.y + 0.01, 0.62), head.clone().add(V(0, -0.01, 0)), 30],
    faceL: [V(0.38, head.y + 0.02, 0.5), head, 30],
    bust: [V(0.25, head.y - 0.05, 1.25), head.clone().add(V(0, -0.12, 0)), 32],
    threeq: [V(1.2, 1.35, 2.6), V(0, 0.95, 0), 35],
    full: [V(0, 1.0, 3.6), V(0, 0.88, 0), 35],
    side: [V(3.0, 1.0, 0), V(0, 0.9, 0), 35],
    back: [V(-0.8, 1.3, -2.8), V(0, 1.0, 0), 35],
    hands: [V(0.5, 1.0, 1.0), V(0.15, 0.9, 0.1), 35],
    top: [V(0.2, head.y + 0.6, 0.45), head, 35],
  };
  const [p, tg, fov] = views[view] || views.threeq;
  camera.position.copy(p); camera.lookAt(tg); camera.fov = fov;
  if (q.get('look')) { const [x, y, z] = q.get('look').split(',').map(Number); ch.lookAt(V(x, y, z)); }
  else ch.lookAt(camera.position.clone(), 0, 1);
  stage.post.bloomStrength = 0.3; stage.post.vignette = 0.25; stage.post.grain = 0.015;
  finishFrame(t);
}

function renderSetPreview(t) {
  resetWorld();
  const s = sets[q.get('name') || 'serverRoom'];
  s.group.visible = true;
  const ci = +(q.get('cam') || 0);
  const cams = s.previewCams || [{ pos: [0, 1.6, 5], target: [0, 1, 0], fov: 40 }];
  const c = cams[Math.min(ci, cams.length - 1)];
  camera.position.fromArray(c.pos); camera.lookAt(new THREE.Vector3().fromArray(c.target)); camera.fov = c.fov || 40;
  if (s.preview) s.preview(t, ctx);
  if (s.update) s.update(t, ctx);
  if (q.get('chars')) {
    // yer tutucu karakterleri setin işaret noktalarına koy
    const names = q.get('chars').split(',');
    names.forEach((n, i) => { const ch = cast[n]; const a = (s.anchors && s.anchors[n]) || new THREE.Vector3(i - 1, 0, 0); ch.root.visible = true; ch.place(a.x, a.z, a.heading || 0); });
  }
  for (const k in props) if (props[k].group && props[k].group.visible && props[k].update) props[k].update(t, ctx);
  finishFrame(t);
}

function renderPropPreview(t) {
  resetWorld();
  studio.group.visible = true; scene.background = new THREE.Color(0x1a2230);
  const p = props[q.get('name')];
  p.group.visible = true; p.group.position.set(0, 1, 0); p.group.rotation.set(0, +(q.get('rot') || 0.5), 0);
  if (p.preview) p.preview(t, ctx);
  if (p.update) p.update(t, ctx);
  const d = +(q.get('dist') || 0.8);
  camera.position.set(0, 1.0 + d * 0.3, d); camera.lookAt(0, 1, 0); camera.fov = 35;
  finishFrame(t);
}

function renderShot(lt) {
  const s = timeline.byId(q.get('id'));
  renderEpisodeTime(s.start + Math.min(lt, s.dur - 1e-3));
}

window.SYN = {
  fps: FPS,
  duration: timeline ? timeline.duration : 10,
  frames: timeline ? Math.ceil(timeline.duration * FPS) : 240,
  timeline, ctx, stage, cast, sets, props, EXPR,
  renderFrame(i) { this.renderTime(i / FPS); },
  renderTime(t) {
    if (mode === 'episode') renderEpisodeTime(t);
    else if (mode === 'char') renderCharPreview(t);
    else if (mode === 'set') renderSetPreview(t);
    else if (mode === 'prop') renderPropPreview(t);
    else if (mode === 'shot') renderShot(t);
  },
  // ses/altyazı ipuçları (küresel saniye)
  cues() {
    if (!timeline) return [];
    const out = [];
    for (const s of timeline.list) {
      for (const c of s.cues || []) out.push({ ...c, t: s.start + c.at, shot: s.id });
    }
    return out.sort((a, b) => a.t - b.t);
  },
  shots() { return timeline ? timeline.list.map((s) => ({ id: s.id, scene: s.scene, start: s.start, dur: s.dur, desc: s.desc || '' })) : []; },
  // önizleme sorgusunu sayfayı yeniden yüklemeden değiştir (çoklu inceleme için)
  setQuery(str) { const keep = ['w', 'h', 'msaa', 'render']; const nq = new URLSearchParams(str); for (const k of keep) if (q.get(k) && !nq.get(k)) nq.set(k, q.get(k)); q = nq; mode = q.get('mode') || mode; },
  ready: true,
};

// tarayıcıda doğrudan açılırsa gerçek zamanlı önizleme
if (!q.get('render')) {
  const t0 = performance.now(); const start = +(q.get('t') || 0);
  const loop = () => { window.SYN.renderTime(start + (performance.now() - t0) / 1000); requestAnimationFrame(loop); };
  if (q.get('play')) loop(); else window.SYN.renderTime(start);
}
