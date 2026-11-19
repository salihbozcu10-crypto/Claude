// Çekim yardımcıları: kamera, yürüyüş, diyalog (dudak senkronu + ipuçları), ışık ve renk ön ayarları.
import * as THREE from 'three';
import { track, ease, clamp, lerp, smoothstep, handheld, fbm1 } from '../engine/util.js';
import MANIFEST from '../../assets/voices/manifest.json';
import LIP from '../../assets/voices/lipsync.json';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export { track, ease, clamp, lerp, smoothstep };
export const DUR = (id) => (MANIFEST[id] ? MANIFEST[id].dur : 3);

// Kamera: pos/target sabit ya da (lt)=>Vector3 fonksiyonu. shake: el kamerası şiddeti
export function cam(ctx, lt, { pos, target, fov = 35, roll = 0, shake = 0, seed = 0, dof = 0, focus = null, aperture = 0.06, maxBlur = 6 }) {
  const c = ctx.camera;
  const p = typeof pos === 'function' ? pos(lt) : pos;
  const tg = typeof target === 'function' ? target(lt) : target;
  c.position.copy(p); c.up.set(0, 1, 0); c.lookAt(tg);
  c.fov = typeof fov === 'function' ? fov(lt) : fov;
  const r = typeof roll === 'function' ? roll(lt) : roll;
  if (shake) { const h = handheld(ctx.t, shake, seed); c.translateX(h.x); c.translateY(h.y); c.rotateX(h.rx); c.rotateY(h.ry); c.rotateZ(h.rz); }
  if (r) c.rotateZ(r);
  c.updateMatrixWorld();
  if (dof) { ctx.post.dof = dof; ctx.post.dofFocus = focus != null ? (typeof focus === 'function' ? focus(lt) : focus) : p.distanceTo(tg); ctx.post.dofAperture = aperture; ctx.post.dofMaxBlur = maxBlur; }
}

// Vektör izi: [[t, [x,y,z]], ...]
export function vtrack(keys, e = 'inOutCubic') { const tr = track(keys.map(([t, v, ee]) => [t, v, ee]), e); return (t) => { const a = tr(t); return V(a[0], a[1], a[2]); }; }

// Yol boyunca yürüme: noktalar [Vector3], t0..t1 arası; döndürür {pos, heading, phase, moving}
export function walkPath(pts, t0, t1, lt, { stride = 0.62, easeIn = 0.25, easeOut = 0.35 } = {}) {
  const segL = []; let L = 0; for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segL.push(l); L += l; }
  const T = t1 - t0; const k = clamp((lt - t0) / T);
  // yumuşak hızlanma/yavaşlama
  const ei = easeIn / T, eo = easeOut / T;
  const s = smoothProfile(k, ei, eo);
  let d = s * L; let i = 0; while (i < segL.length - 1 && d > segL[i]) { d -= segL[i]; i++; }
  const a = pts[i], b = pts[i + 1] || pts[i]; const f = segL[i] ? d / segL[i] : 0;
  const pos = a.clone().lerp(b, Math.min(1, f));
  const dir = b.clone().sub(a); const heading = Math.atan2(dir.x, dir.z);
  const dist = s * L;
  const moving = lt > t0 && lt < t1 ? 1 : 0;
  const amt = clamp(Math.min((lt - t0) / 0.3, (t1 - lt) / 0.3)) * moving;
  return { pos, heading, phase: dist / stride, amount: amt, done: lt >= t1 };
}
function smoothProfile(k, ei, eo) {
  // hız: 0'dan 1'e ei içinde çık, eo içinde in (yaklaşık), alan normalize
  const n = 64; let acc = 0, tot = 0; const vel = (x) => Math.min(1, x / Math.max(ei, 1e-3), (1 - x) / Math.max(eo, 1e-3));
  for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; const v = vel(x); tot += v; if (x < k) acc += v; }
  return clamp(acc / tot + (k >= 1 ? 1 : 0));
}

// Karakteri yürüyüşle yerleştir (yol üzerinde) ve yüzünü ilerleme yönüne çevir
export function walk(ch, pts, t0, t1, lt, opts = {}) {
  const w = walkPath(pts, t0, t1, lt, opts);
  const head = opts.heading != null && w.done ? opts.heading : w.heading + (opts.headingOffset || 0);
  ch.place(w.pos.x, w.pos.z, head);
  if (w.amount > 0) ch.walk(w.phase, w.amount, { run: opts.run || 0, stride: opts.strideScale || 1 });
  return w;
}

// Diyalog: satır `at` (yerel sn) zamanında başlar. Aktifse dudak senkronu uygular.
export function say(ctx, ch, id, at, lt, gain = 1) {
  const d = DUR(id);
  if (lt >= at && lt <= at + d + 0.1 && LIP[id]) { ch.say({ ...LIP[id], gain }, ctx.t - (lt - at)); return true; }
  return false;
}

// Yüzün baktığı yöne göre kamera: dist (yüzden uzaklık), side (+ karakterin solu), up
export function faceCam(ch, { dist = 0.8, side = 0.25, up = 0.0, look = V(0, -0.04, 0) } = {}) {
  ch.sync(); const h = ch.headWorld(V());
  const fwd = ch.bones.face.localToWorld(V(0, 0, 1)).sub(h).normalize();
  const upv = ch.bones.face.localToWorld(V(0, 1, 0)).sub(h).normalize();
  const left = V().crossVectors(upv, fwd).normalize();
  const pos = h.clone().addScaledVector(fwd, dist).addScaledVector(left, side).addScaledVector(V(0, 1, 0), up);
  return { pos, target: h.clone().add(look), head: h, fwd };
}

// Işık ön ayarları
export function keyAt(ctx, from, to, intensity = 20, color = 0xffe6d0, angle = 0.45) {
  const k = ctx.keyLight; k.position.copy(from); k.target.position.copy(to); k.intensity = intensity * 0.28; k.color.set(color); k.angle = angle; k.target.updateMatrixWorld();
}
export function fillAt(ctx, pos, intensity = 2, color = 0x80a8ff, distance = 5) { const f = ctx.fillLight; f.position.copy(pos); f.intensity = intensity * 0.5; f.color.set(color); f.distance = distance; }
export function rimAt(ctx, from, to, intensity = 25, color = 0x60d8ff) { const r = ctx.rimLight; r.position.copy(from); r.target.position.copy(to); r.intensity = intensity * 0.45; r.color.set(color); r.target.updateMatrixWorld(); }

// Yüzü kameraya göre aydınlat: kameranın sol-üstünden anahtar, karşı arkadan kenar
export function faceLights(ctx, ch, { key = 14, fill = 1.2, rim = 18, keyColor = 0xffe2c8, rimColor = 0x60d8ff, fillColor = 0x7090d0, side = 1 } = {}) {
  const h = ch.headWorld(V());
  const c = ctx.camera.position.clone();
  const toCam = c.clone().sub(h).setY(0).normalize();
  const right = V(-toCam.z, 0, toCam.x).multiplyScalar(side);
  keyAt(ctx, h.clone().addScaledVector(toCam, 1.1).addScaledVector(right, 0.8).add(V(0, 0.7, 0)), h, key, keyColor, 0.4);
  fillAt(ctx, h.clone().addScaledVector(toCam, 0.9).addScaledVector(right, -0.9).add(V(0, -0.1, 0)), fill, fillColor, 3);
  rimAt(ctx, h.clone().addScaledVector(toCam, -1.2).addScaledVector(right, -0.7).add(V(0, 0.6, 0)), h, rim, rimColor);
}

// Renk derecelendirme ön ayarları
export const GRADE = {
  serverRoom: { lift: [0.0, 0.01, 0.03], gamma: [1.0, 1.0, 1.04], gain: [1.0, 1.0, 1.04], saturation: 1.08, contrast: 1.08, temperature: -0.15, vignette: 0.45, grain: 0.04, exposure: 1.0, bloomStrength: 0.55, bloomThreshold: 1.2 },
  base: { lift: [0.01, 0.005, 0.02], gamma: [1.0, 1.0, 1.02], gain: [1.03, 1.0, 1.0], saturation: 1.1, contrast: 1.06, temperature: 0.02, vignette: 0.38, grain: 0.035, exposure: 1.0, bloomStrength: 0.5, bloomThreshold: 1.2 },
  alarm: { lift: [0.03, 0.0, 0.0], gamma: [1.0, 0.97, 0.97], gain: [1.08, 0.95, 0.95], saturation: 1.12, contrast: 1.12, temperature: 0.2, vignette: 0.5, grain: 0.05, exposure: 1.0, bloomStrength: 0.65, bloomThreshold: 1.1 },
  after: { lift: [0.0, 0.01, 0.025], gamma: [1.0, 1.0, 1.03], gain: [0.97, 1.0, 1.03], saturation: 0.82, contrast: 1.04, temperature: -0.2, vignette: 0.5, grain: 0.045, exposure: 1.1, bloomStrength: 0.45, bloomThreshold: 1.2 },
};
export function grade(ctx, name, extra = {}) { Object.assign(ctx.post, structuredClone(GRADE[name]), extra); }

// Kısa yardımcılar
export const show = (...chs) => chs.forEach((c) => { c.root.visible = true; });
export function hold(prop, parentBone, pos = [0, 0, 0], rot = [0, 0, 0]) {
  prop.group.visible = true; if (prop.group.parent !== parentBone) parentBone.add(prop.group);
  prop.group.position.set(...pos); prop.group.rotation.set(...rot);
}
export function placeProp(ctx, prop, pos, rotY = 0, rot = null) {
  prop.group.visible = true; if (prop.group.parent !== ctx.scene) ctx.scene.add(prop.group);
  prop.group.position.copy(pos); if (rot) prop.group.rotation.set(...rot); else prop.group.rotation.set(0, rotY, 0);
}
export const fadeIn = (lt, d = 0.6) => 1 - smoothstep(0, d, lt);
export const fadeOut = (lt, dur, d = 0.6) => smoothstep(dur - d, dur, lt);
export const L = (id, at) => ({ type: 'line', id, at });
export const S = (id, at, gain_db = 0, extra = {}) => ({ type: 'sfx', id, at, gain_db, ...extra });
export const M = (id, at, gain_db = 0, extra = {}) => ({ type: 'music', id, at, gain_db, ...extra });
export const A = (id, at, dur, gain_db = 0, extra = {}) => ({ type: 'amb', id, at, dur, gain_db, ...extra });
export { fbm1 };
