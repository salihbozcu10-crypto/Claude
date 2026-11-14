// Tahliye helikopteri: prosedürel model + yaklaşma / iniş / kalkış uçuşu
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp, lerp, clamp, smoothstep, angleDelta } from '../core/utils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();

function build(M) {
  const root = new THREE.Group(); const parts = new Map();
  const add = (mat, g, x, y, z, rx = 0, ry = 0, rz = 0) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); g.applyMatrix4(_m.compose(_p, _q, _s)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); } if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(g); };
  const rb = (mat, w, h, d, x, y, z, r = 0.2, rx, ry, rz) => add(mat, new RoundedBoxGeometry(w, h, d, 2, r), x, y, z, rx, ry, rz);
  const cy = (mat, r1, r2, len, x, y, z, rx = 0, ry = 0, rz = 0, seg = 14) => add(mat, new THREE.CylinderGeometry(r1, r2, len, seg), x, y, z, rx, ry, rz);
  const O = M.dyn.olive, D = M.dyn.dark, G = M.dyn.glass, K = M.dyn.black;
  rb(O, 2.15, 1.95, 5.4, 0, 1.62, 0.5, 0.45);                      // kabin
  rb(O, 1.95, 1.5, 2.2, 0, 1.38, 3.55, 0.6);                       // burun
  rb(G, 1.72, 0.85, 1.25, 0, 1.98, 3.55, 0.3, -0.42);              // ön cam
  rb(G, 1.99, 0.5, 0.9, 0, 1.0, 4.1, 0.2, 0.5);                    // alt gözetleme camı
  for (const s of [-1, 1]) { rb(K, 0.04, 1.3, 1.9, s * 1.07, 1.55, 0.6, 0.02); rb(G, 0.05, 0.6, 0.9, s * 1.02, 1.95, 2.7, 0.02); rb(O, 0.06, 1.34, 1.0, s * 1.1, 1.55, -1.1, 0.02); }
  rb(O, 1.5, 0.7, 3.4, 0, 2.82, 0.2, 0.3);                         // motor kaportası
  for (const s of [-1, 1]) cy(D, 0.2, 0.24, 0.9, s * 0.62, 2.85, -1.55, Math.PI / 2, 0, 0, 10);
  cy(D, 0.16, 0.2, 0.7, 0, 3.4, 0.45); cy(D, 0.42, 0.42, 0.14, 0, 3.72, 0.45);
  cy(O, 0.24, 0.52, 5.6, 0, 2.15, -4.6, Math.PI / 2 - 0.07, 0, 0, 12);  // kuyruk bomu
  rb(O, 0.14, 1.9, 1.0, 0, 3.05, -7.3, 0.05, -0.35);               // dikey dümen
  rb(O, 2.6, 0.08, 0.66, 0, 2.38, -6.5, 0.03);                     // yatay dengeleyici
  for (const s of [-1, 1]) { cy(D, 0.05, 0.05, 1.1, s * 1.05, 0.72, 1.25, 0, 0, s * 0.5, 8); cy(K, 0.3, 0.3, 0.22, s * 1.32, 0.3, 1.25, 0, 0, Math.PI / 2, 14); rb(O, 0.5, 0.25, 1.2, s * 1.15, 1.0, 1.25, 0.1); }
  cy(D, 0.04, 0.04, 0.8, 0, 0.62, -5.6, 0.25, 0, 0, 8); cy(K, 0.17, 0.17, 0.14, 0, 0.17, -5.72, 0, 0, Math.PI / 2, 12);
  cy(D, 0.03, 0.03, 0.9, 0.5, 0.75, 4.3, 0, 0, 0.2, 6); rb(D, 0.2, 0.2, 0.5, 0, 0.75, 4.65, 0.06);
  for (const [mat, list] of parts) { const mesh = new THREE.Mesh(mergeGeometries(list), mat); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); for (const g of list) g.dispose(); }
  // ana rotor
  const rotor = new THREE.Group(); rotor.position.set(0, 3.82, 0.45);
  const bg = new THREE.BoxGeometry(7.1, 0.035, 0.36); bg.translate(3.75, 0, 0);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(bg, D); b.rotation.y = i * Math.PI / 2; b.rotation.z = -0.03; b.castShadow = false; rotor.add(b); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7.3, 40), new THREE.MeshBasicMaterial({ color: 0x0a0b0a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.renderOrder = 6; rotor.add(disc);
  root.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.24, 3.42, -7.42);
  const tg = new THREE.BoxGeometry(0.03, 1.25, 0.16); tg.translate(0, 0.68, 0);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(tg, D); b.rotation.x = i * Math.PI / 2; tail.add(b); }
  const td = new THREE.Mesh(new THREE.CircleGeometry(1.32, 24), disc.material); td.rotation.y = Math.PI / 2; tail.add(td); root.add(tail);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.3, 0.2) })); beacon.position.set(0, 3.25, -1.9); root.add(beacon);
  return { root, rotor, tail, beacon, disc };
}

export class Helicopter {
  constructor(game) {
    this.g = game; const h = build(game.M); Object.assign(this, h);
    this.root.visible = false; game.scene.add(this.root);
    this.state = 'hidden'; this.pos = this.root.position; this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.roll = 0; this.t = 0; this.lz = null; this.rpm = 0; this.emitter = null;
  }
  reset() { this.state = 'hidden'; this.root.visible = false; if (this.emitter) this.emitter.enabled = false; this.g.audio.loopVol('heli', 0, 0.1); }

  start(lz) {
    this.lz = lz; const a = Math.atan2(lz.x, lz.z) + 0.5; // vadinin dışından gel
    this.pos.set(lz.x + Math.sin(a) * 900, lz.y + 140, lz.z + Math.cos(a) * 900); this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(lz.x - this.pos.x, lz.z - this.pos.z); this.state = 'inbound'; this.root.visible = true; this.rpm = 1; this.t = 0;
    this.g.audio.loop('heli', { vol: 0, pos: this.pos, ref: 30, roll: 0.9 });
    if (!this.emitter) this.emitter = this.g.fx.addEmitter({ type: 'rotor', x: lz.x, y: lz.y, z: lz.z, rate: 0, enabled: false, range: 400 });
  }
  takeoff() { if (this.state === 'landed') { this.state = 'takeoff'; this.t = 0; } }
  get landed() { return this.state === 'landed'; }

  update(dt) {
    if (this.state === 'hidden') return; const g = this.g, lz = this.lz; this.t += dt;
    let target = _v, maxSpeed = 55, accel = 14, wantYaw = this.yaw;
    const dx = lz.x - this.pos.x, dz = lz.z - this.pos.z, dh = Math.hypot(dx, dz);
    if (this.state === 'inbound') { target.set(lz.x, lz.y + 26 + Math.min(110, dh * 0.2), lz.z); maxSpeed = clamp(dh * 0.45 + 6, 6, 58); if (dh < 14) { this.state = 'landing'; this.t = 0; } wantYaw = Math.atan2(dx, dz); }
    else if (this.state === 'landing') { target.set(lz.x, lz.y + Math.max(0.02, 22 - this.t * 4.2), lz.z); maxSpeed = 5; accel = 5; wantYaw = this.landYaw ?? (this.landYaw = this.yaw + 0.9); if (this.pos.y - lz.y < 0.12 && dh < 2.5) { this.state = 'landed'; this.vel.set(0, 0, 0); this.pos.y = lz.y + 0.02; g.onHeliLanded?.(); } }
    else if (this.state === 'landed') { target.copy(this.pos); maxSpeed = 0; }
    else if (this.state === 'takeoff') { const a = this.yaw; target.set(this.pos.x + Math.sin(a) * 300, lz.y + 30 + this.t * 16, this.pos.z + Math.cos(a) * 300); maxSpeed = clamp(this.t * 9, 2, 60); accel = 9; if (this.t > 3.5) this.state = 'outbound'; }
    else if (this.state === 'outbound') { const a = this.yaw; target.set(this.pos.x + Math.sin(a) * 500, lz.y + 160, this.pos.z + Math.cos(a) * 500); maxSpeed = 62; if (this.t > 40) this.reset(); }
    // hız kontrolü
    const to = _p.copy(target).sub(this.pos); const dist = to.length(); const prevSp = Math.hypot(this.vel.x, this.vel.z);
    if (dist > 0.01 && maxSpeed > 0) { to.multiplyScalar(Math.min(maxSpeed, dist * 0.9) / dist); this.vel.x += clamp(to.x - this.vel.x, -accel * dt, accel * dt); this.vel.y += clamp(to.y - this.vel.y, -accel * 0.7 * dt, accel * 0.7 * dt); this.vel.z += clamp(to.z - this.vel.z, -accel * dt, accel * dt); }
    else this.vel.multiplyScalar(Math.exp(-4 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const sp = Math.hypot(this.vel.x, this.vel.z); const acc = (sp - prevSp) / Math.max(dt, 1e-3);
    const dy = angleDelta(this.yaw, wantYaw); this.yaw += clamp(dy, -0.6 * dt, 0.6 * dt);
    this.pitch = damp(this.pitch, clamp(acc * 0.022 + sp * 0.0035, -0.3, 0.32), 2.2, dt); this.roll = damp(this.roll, clamp(-dy * 0.5, -0.35, 0.35), 2, dt);
    this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.rpm = damp(this.rpm, 1, 1, dt); this.rotor.rotation.y += 27 * this.rpm * dt; this.tail.rotation.x += 70 * this.rpm * dt;
    this.beacon.visible = (g.time % 1.1) < 0.12;
    // ses + rotor tozu
    const alt = this.pos.y - lz.y; g.audio.loopPos('heli', this.pos); g.audio.loopVol('heli', 1.6, 0.4);
    if (this.emitter) { this.emitter.enabled = alt < 22 && dh < 30; this.emitter.x = this.pos.x; this.emitter.z = this.pos.z; this.emitter.y = lz.y; this.emitter.rate = 26 * smoothstep(22, 2, alt); this.emitter.power = smoothstep(22, 3, alt); }
    const pd = this.pos.distanceTo(g.player.pos); if (alt < 25 && pd < 30) g.player.shake(0.12 * (1 - pd / 30), 0.2);
  }
}
