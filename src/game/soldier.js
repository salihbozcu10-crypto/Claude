// Asker: prosedürel iskeletli model + ters kinematik (IK) ile yürüyüş, nişan, çömelme, vurulma ve düşme
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patch, SURF } from '../gfx/materials.js';
import { clamp, damp, lerp, smoothstep, rr, pick, closestSegSeg, Spring } from '../core/utils.js';

// Kemik dizinleri
// Not: karakter +Z'ye bakar; sağ tarafı -X'tir. 'r' önekli kemikler -X tarafındadır.
const B = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, rArm: 5, rFore: 6, rHand: 7, lArm: 8, lFore: 9, lHand: 10, rThigh: 11, rShin: 12, rFoot: 13, lThigh: 14, lShin: 15, lFoot: 16 };
const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];
const OFFSET = [[0, 0.96, 0], [0, 0.14, 0], [0, 0.2, 0], [0, 0.24, 0], [0, 0.1, 0], [-0.215, 0.17, 0], [0, -0.29, 0], [0, -0.27, 0], [0.215, 0.17, 0], [0, -0.29, 0], [0, -0.27, 0], [-0.1, -0.03, 0], [0, -0.44, 0], [0, -0.42, 0], [0.1, -0.03, 0], [0, -0.44, 0], [0, -0.42, 0]];
const L_ARM1 = 0.29, L_ARM2 = 0.27, L_LEG1 = 0.44, L_LEG2 = 0.42;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _res = { s: 0, t: 0, distSq: 0 }; const _zAxis = new THREE.Vector3(0, 0, 1);
const col = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

// Kemiklere katı bağlı parçalardan tek geometri üretir
class SkinParts {
  constructor() { this.geos = []; }
  push(g, bone, c, uvS = 1, uvT = 1) {
    const n = g.attributes.position.count; const cols = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    if (!g.index) { const idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; si[i * 4] = bone; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const U = g.attributes.uv; if (U) for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * uvS, U.getY(i) * uvT);
    this.geos.push(g); return this;
  }
  // a -> b arası konik uzuv
  limb(bone, a, b, r1, r2, c, flat = 1) {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); const len = _a.distanceTo(_b); const g = new THREE.CylinderGeometry(r1, r2, len, 8, 1);
    if (flat !== 1) g.scale(1, 1, flat);
    _q.setFromUnitVectors(_up, _c.copy(_a).sub(_b).normalize()); _p.copy(_a).add(_b).multiplyScalar(0.5); g.applyMatrix4(_m.compose(_p, _q, _s));
    return this.push(g, bone, c, Math.PI * (r1 + r2), len);
  }
  ball(bone, r, x, y, z, c, sx = 1, sy = 1, sz = 1) { const g = new THREE.SphereGeometry(r, 9, 6); g.scale(sx, sy, sz); g.translate(x, y, z); return this.push(g, bone, c, 6.3 * r * sx, 3.1 * r * sy); }
  box(bone, w, h, d, x, y, z, c, r = 0.012, rx = 0, ry = 0, rz = 0) {
    const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.01, h / 2.01, d / 2.01)); _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); g.applyMatrix4(_m.compose(_p, _q, _s));
    return this.push(g, bone, c, Math.max(w, d) * 2, h * 2);
  }
  build() { const g = mergeGeometries(this.geos, false); for (const x of this.geos) x.dispose(); g.computeBoundingSphere(); return g; }
}

const VARIANTS = [
  { shirt: col(0.31, 0.33, 0.24), pants: col(0.42, 0.37, 0.28), vest: col(0.1, 0.1, 0.1), head: 'cap', hat: col(0.2, 0.2, 0.18) },
  { shirt: col(0.5, 0.44, 0.33), pants: col(0.3, 0.31, 0.25), vest: col(0.26, 0.28, 0.2), head: 'helmet', hat: col(0.25, 0.27, 0.2) },
  { shirt: col(0.16, 0.17, 0.18), pants: col(0.22, 0.22, 0.21), vest: col(0.36, 0.32, 0.24), head: 'mask', hat: col(0.1, 0.1, 0.1) },
  { shirt: col(0.36, 0.3, 0.24), pants: col(0.5, 0.45, 0.36), vest: col(0.16, 0.18, 0.14), head: 'helmet', hat: col(0.42, 0.38, 0.29) },
];
const HOSTAGE = { shirt: col(0.5, 0.58, 0.68), pants: col(0.16, 0.18, 0.24), vest: null, head: 'bare', hat: col(0.1, 0.08, 0.06) };

function buildBody(v) {
  const P = new SkinParts(); const skin = col(0.66, 0.5, 0.4), boot = col(0.09, 0.08, 0.07), glove = col(0.14, 0.13, 0.12), dark = col(0.07, 0.07, 0.075);
  // bacaklar
  for (const s of [-1, 1]) {
    const T = s < 0 ? B.rThigh : B.lThigh, S = s < 0 ? B.rShin : B.lShin, F = s < 0 ? B.rFoot : B.lFoot; const x = s * 0.1;
    P.limb(T, [x, 0.95, 0], [x, 0.49, 0], 0.092, 0.07, v.pants); P.ball(S, 0.072, x, 0.49, 0.005, v.pants);
    P.limb(S, [x, 0.49, 0], [x, 0.1, 0], 0.068, 0.052, v.pants);
    P.box(F, 0.1, 0.12, 0.27, x, 0.06, 0.045, boot, 0.03); P.limb(S, [x, 0.2, 0], [x, 0.08, 0], 0.058, 0.056, boot);
    if (v.vest) P.box(S, 0.11, 0.12, 0.05, x, 0.5, 0.055, dark, 0.02);
  }
  if (v.vest) { P.box(B.rThigh, 0.05, 0.16, 0.1, -0.19, 0.76, 0.0, dark, 0.012); P.box(B.rThigh, 0.2, 0.03, 0.2, -0.1, 0.8, 0, dark, 0.008); }
  // gövde
  P.box(B.hips, 0.35, 0.2, 0.22, 0, 0.97, 0, v.pants, 0.06); P.box(B.hips, 0.37, 0.05, 0.24, 0, 1.045, 0, dark, 0.012);
  P.limb(B.spine, [0, 1.3, 0], [0, 1.04, 0], 0.165, 0.155, v.shirt, 0.72);
  P.box(B.chest, 0.4, 0.3, 0.24, 0, 1.38, 0, v.shirt, 0.08);
  if (v.vest) {
    P.box(B.chest, 0.35, 0.36, 0.3, 0, 1.33, 0.0, v.vest, 0.03); P.box(B.spine, 0.33, 0.14, 0.28, 0, 1.14, 0, v.vest, 0.03);
    for (let i = -1; i <= 1; i++) P.box(B.spine, 0.075, 0.14, 0.045, i * 0.085, 1.2, 0.16, v.vest, 0.01);
    P.box(B.chest, 0.12, 0.09, 0.04, -0.09, 1.4, 0.16, dark, 0.01); P.box(B.chest, 0.3, 0.3, 0.1, 0, 1.36, -0.18, v.vest, 0.03); P.box(B.chest, 0.07, 0.16, 0.05, 0.13, 1.47, -0.2, dark, 0.01);
    for (const s of [-1, 1]) P.box(B.chest, 0.07, 0.05, 0.3, s * 0.13, 1.515, 0, v.vest, 0.012);
  }
  // kollar
  for (const s of [-1, 1]) {
    const A = s < 0 ? B.rArm : B.lArm, Fo = s < 0 ? B.rFore : B.lFore, H = s < 0 ? B.rHand : B.lHand; const x = s * 0.215;
    P.ball(A, 0.078, x, 1.47, 0, v.shirt); P.limb(A, [x, 1.47, 0], [x, 1.18, 0], 0.062, 0.05, v.shirt); P.ball(Fo, 0.052, x, 1.18, 0, v.shirt);
    P.limb(Fo, [x, 1.18, 0], [x, 0.93, 0], 0.05, 0.04, v.shirt); P.box(H, 0.05, 0.11, 0.085, x, 0.86, 0.005, v.vest ? glove : skin, 0.02);
  }
  // baş
  P.limb(B.neck, [0, 1.6, 0], [0, 1.5, 0], 0.052, 0.058, v.head === 'mask' ? dark : skin);
  const hc = v.head === 'mask' ? dark : skin;
  P.ball(B.head, 0.1, 0, 1.675, 0.008, hc, 0.93, 1.16, 1.02);
  P.box(B.head, 0.03, 0.04, 0.03, 0, 1.66, 0.105, hc, 0.01);                                   // burun
  if (v.head === 'mask') P.box(B.head, 0.15, 0.036, 0.04, 0, 1.693, 0.082, skin, 0.01);       // göz açıklığı
  P.box(B.head, 0.028, 0.012, 0.01, -0.036, 1.694, 0.1, dark, 0.004); P.box(B.head, 0.028, 0.012, 0.01, 0.036, 1.694, 0.1, dark, 0.004);
  if (v.head === 'helmet') { const g = new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56); g.scale(0.98, 1.0, 1.1); g.translate(0, 1.7, 0); P.push(g, B.head, v.hat, 0.8, 0.4); P.box(B.head, 0.03, 0.07, 0.07, -0.108, 1.69, 0.0, dark, 0.012); P.box(B.head, 0.03, 0.07, 0.07, 0.108, 1.69, 0.0, dark, 0.012); P.box(B.head, 0.05, 0.03, 0.03, 0, 1.775, 0.12, dark, 0.008); }
  else if (v.head === 'cap') { const g = new THREE.SphereGeometry(0.108, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); g.scale(0.98, 0.9, 1.06); g.translate(0, 1.715, 0.006); P.push(g, B.head, v.hat, 0.7, 0.35); P.box(B.head, 0.13, 0.012, 0.1, 0, 1.722, 0.125, v.hat, 0.005, -0.12); }
  else if (v.head === 'bare') { const g = new THREE.SphereGeometry(0.106, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(0.97, 1.06, 1.06); g.translate(0, 1.7, -0.012); P.push(g, B.head, v.hat, 0.7, 0.35); P.box(B.head, 0.19, 0.045, 0.2, 0, 1.694, 0.005, col(0.8, 0.78, 0.72), 0.012); }
  else P.ball(B.head, 0.104, 0, 1.69, 0.0, dark, 0.95, 1.1, 1.0);
  return P.build();
}

// Düşman tüfeği (ahşap kundaklı, kavisli şarjörlü genel bir piyade tüfeği)
function buildRifleGeo() {
  const P = new SkinParts(); const metal = col(0.12, 0.12, 0.125), wood = col(0.36, 0.2, 0.1), b = 0;
  P.box(b, 0.04, 0.062, 0.27, 0, 0.0, 0.0, metal, 0.006); P.limb(b, [0, 0.012, 0.13], [0, 0.012, 0.56], 0.009, 0.009, metal); P.limb(b, [0, 0.036, 0.13], [0, 0.036, 0.4], 0.008, 0.008, metal);
  P.box(b, 0.042, 0.05, 0.2, 0, 0.012, 0.24, wood, 0.01); P.box(b, 0.014, 0.05, 0.014, 0, 0.05, 0.5, metal, 0.003); P.limb(b, [0, 0.012, 0.56], [0, 0.012, 0.6], 0.012, 0.012, metal);
  P.box(b, 0.034, 0.085, 0.26, 0, -0.03, -0.26, wood, 0.012, 0.16); P.box(b, 0.03, 0.1, 0.045, 0, -0.07, -0.085, wood, 0.01, -0.3);
  for (let k = 0; k < 3; k++) P.box(b, 0.026, 0.07, 0.06, 0, -0.06 - k * 0.058, 0.05 + k * k * 0.014, metal, 0.005, -0.18 * k - 0.1);
  P.box(b, 0.012, 0.03, 0.02, 0, 0.045, -0.08, metal, 0.003);
  const g = P.build(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); return g;
}

let _assets = null;
function assets(game) {
  if (_assets) return _assets;
  const T = game.T;
  const mkMat = () => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.cloth.map, normalMap: T.cloth.normalMap, roughness: 0.86, metalness: 0 }); m.userData.surface = SURF.flesh; return patch(m, {}); };
  const gunMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }), {});
  _assets = { bodies: VARIANTS.map(buildBody), hostage: buildBody(HOSTAGE), rifle: buildRifleGeo(), mkMat, gunMat };
  return _assets;
}

// Yön + ipucundan kemik dönüşü: kemiğin -Y ekseni 'dir' boyunca, +Z ekseni 'hint' yönüne
function quatFromDir(dir, hint, out) {
  _y.copy(dir).negate(); _z.copy(hint).addScaledVector(_y, -hint.dot(_y)); if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z); _z.normalize(); _x.crossVectors(_y, _z);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

export class Soldier {
  constructor(game, o) {
    this.g = game; const A = assets(game); this.team = o.team || 'enemy';
    const geo = this.team === 'hostage' ? A.hostage : A.bodies[o.variant ?? (Math.random() * A.bodies.length) | 0];
    this.mat = A.mkMat(); this.mesh = new THREE.SkinnedMesh(geo, this.mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.bones = []; for (let i = 0; i < OFFSET.length; i++) { const b = new THREE.Bone(); b.position.set(...OFFSET[i]); this.bones.push(b); if (PARENT[i] >= 0) this.bones[PARENT[i]].add(b); }
    this.mesh.add(this.bones[0]); this.mesh.updateMatrixWorld(true); this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.9); this.mesh.frustumCulled = true;
    game.scene.add(this.mesh);
    if (this.team === 'enemy') { this.gun = new THREE.Mesh(A.rifle, A.gunMat); this.gun.castShadow = true; game.scene.add(this.gun); } else this.gun = null;
    this.pos = new THREE.Vector3(o.x, o.y ?? game.world.groundY(o.x, o.z), o.z); this.yaw = o.yaw || 0; this.fixedY = o.y != null;
    this.alive = true; this.health = 100; this.height = 1.78; this.scale = rr(0.96, 1.04); this.mesh.scale.setScalar(this.scale);
    // animasyon girdileri (yapay zekâ ayarlar)
    this.speed = 0; this.moveLocal = new THREE.Vector2(0, 1); this.crouch = 0; this.crouchT = 0; this.aim = 0; this.aimT = 0; this.aimPitch = 0; this.aimYaw = 0; this.cover = 0; this.kneel = this.team === 'hostage' ? 1 : 0;
    this.phase = Math.random(); this.moveK = 0; this.kick = 0; this.flinch = new Spring(120, 10); this.flinchYaw = new Spring(100, 9); this.idleT = Math.random() * 10; this.look = 0; this.stunT = 0;
    this.deathT = -1; this.deathDir = 1; this.deathDur = 1; this.gunVel = null; this.wp = { head: new THREE.Vector3(), pelvis: new THREE.Vector3(), neck: new THREE.Vector3(), lKnee: new THREE.Vector3(), rKnee: new THREE.Vector3(), lFoot: new THREE.Vector3(), rFoot: new THREE.Vector3(), chest: new THREE.Vector3() };
    this.muzzle = new THREE.Vector3(); this.gunDir = new THREE.Vector3(0, 0, 1); this.skyT = Math.random() * 0.5; this.frozen = false; this.ai = null; this.stepAcc = 0;
    // çalışma alanı
    this.Q = Array.from({ length: 17 }, () => new THREE.Quaternion()); this.Pp = Array.from({ length: 17 }, () => new THREE.Vector3());
    this.pose(0.016); this.syncWorld();
  }

  // --- poz çözücü (kök uzayı: +Z ileri, +Y yukarı, +X karakterin solu)
  pose(dt) {
    const Q = this.Q, Pp = this.Pp, bn = this.bones; const dying = this.deathT >= 0;
    this.crouchT = damp(this.crouchT, this.crouch, 7, dt); this.aimT = damp(this.aimT, this.aim, 8, dt); this.moveK = damp(this.moveK, this.speed > 0.15 ? 1 : 0, 8, dt);
    const cr = this.crouchT, aim = this.aimT, run = smoothstep(2.6, 5, this.speed) * this.moveK, mk = this.moveK; const kn = this.kneel;
    const stride = 0.9 + 0.36 * this.speed; if (!dying) this.phase += (this.speed / stride) * dt; const ph = this.phase; this.idleT += dt;
    const breath = Math.sin(this.idleT * 1.4) * 0.006;
    const fl = this.flinch.update(dt), fy = this.flinchYaw.update(dt); this.kick = damp(this.kick, 0, 16, dt);
    const stun = this.stunT > 0 ? 1 : 0; const cov = damp(this.cover, stun, 8, dt); this.cover = cov;
    // --- kalça
    let hipY = 0.93 - cr * 0.36 - kn * 0.46 + Math.cos(ph * Math.PI * 4) * 0.022 * mk * (1 + run) - run * 0.03 + breath * 0.5;
    let hipX = Math.sin(ph * Math.PI * 2) * 0.018 * mk, hipZ = -cr * 0.05 + kn * 0.0;
    let hipPitch = 0.03 + cr * 0.2 + run * 0.16 + kn * 0.1 + cov * 0.25, hipRoll = Math.sin(ph * Math.PI * 2) * 0.03 * mk, hipYaw = Math.sin(ph * Math.PI * 2) * -0.06 * mk + aim * -0.35 * (1 - mk * 0.6);
    let spinePitch = 0.03 + cr * 0.12 + run * 0.1 + aim * 0.06 + this.aimPitch * -0.3 * aim + fl * 0.02 + kn * 0.22 + cov * 0.3, spineYaw = this.aimYaw * 0.4 + fy * 0.02 - hipYaw * 0.5;
    let chestPitch = 0.02 + this.aimPitch * -0.35 * aim + fl * 0.03 + cov * 0.2, chestYaw = this.aimYaw * 0.45 + fy * 0.03 - hipYaw * 0.5;
    let headPitch = -hipPitch * 0.6 - spinePitch * 0.5 + this.aimPitch * -0.2 * aim + kn * 0.35 + cov * 0.3 + aim * 0.06, headYaw = this.look * (1 - aim) + this.aimYaw * 0.15 + aim * 0.1;
    let d = 0; let fall = 0, buckle = 0;
    if (dying) {
      d = Math.min(1, this.deathT / this.deathDur); buckle = smoothstep(0, 0.4, d); fall = Math.pow(smoothstep(0.12, 0.92, d), 1.8);
      const bounce = d > 0.9 ? Math.sin((d - 0.9) * 31) * 0.02 * (1 - d) * 10 : 0;
      hipY = lerp(lerp(hipY, 0.52, buckle), 0.14 + bounce, fall); hipZ = lerp(hipZ, this.deathDir * -0.3, fall); hipX = lerp(hipX, this.deathSide * 0.12, fall);
      hipPitch = lerp(hipPitch + buckle * 0.2 * this.deathDir, this.deathDir * -1.47, fall); hipRoll = lerp(hipRoll, this.deathSide * 0.22, fall); hipYaw = lerp(hipYaw, this.deathSide * 0.3, fall);
      spinePitch = lerp(spinePitch, this.deathDir * 0.06, fall); chestPitch = lerp(chestPitch, 0, fall); spineYaw *= 1 - fall; chestYaw *= 1 - fall;
      headPitch = lerp(headPitch, this.deathDir > 0 ? -0.25 : 0.3, fall); headYaw = lerp(headYaw, this.deathSide * 0.7, fall);
    }
    _e.set(hipPitch, hipYaw, hipRoll, 'YXZ'); Q[B.hips].setFromEuler(_e); Pp[B.hips].set(hipX, hipY, hipZ);
    _e.set(spinePitch, spineYaw, 0, 'YXZ'); Q[B.spine].copy(Q[B.hips]).multiply(_q.setFromEuler(_e)); Pp[B.spine].set(0, 0.14, 0).applyQuaternion(Q[B.hips]).add(Pp[B.hips]);
    _e.set(chestPitch, chestYaw, 0, 'YXZ'); Q[B.chest].copy(Q[B.spine]).multiply(_q.setFromEuler(_e)); Pp[B.chest].set(0, 0.2, 0).applyQuaternion(Q[B.spine]).add(Pp[B.spine]);
    _e.set(headPitch * 0.5, headYaw * 0.5, 0, 'YXZ'); Q[B.neck].copy(Q[B.chest]).multiply(_q.setFromEuler(_e)); Pp[B.neck].set(0, 0.24, 0).applyQuaternion(Q[B.chest]).add(Pp[B.chest]);
    Q[B.head].copy(Q[B.neck]).multiply(_q); Pp[B.head].set(0, 0.1, 0).applyQuaternion(Q[B.neck]).add(Pp[B.neck]);
    bn[B.hips].position.copy(Pp[B.hips]); bn[B.hips].quaternion.copy(Q[B.hips]);
    this.setLocal(B.spine, B.hips); this.setLocal(B.chest, B.spine); this.setLocal(B.neck, B.chest); this.setLocal(B.head, B.neck);

    // --- silah dönüşümü (kök uzayı)
    const Qc = Q[B.chest], Pc = Pp[B.chest];
    const ap = this.aimPitch, ay = this.aimYaw;
    const aimDir = _a.set(Math.sin(ay) * Math.cos(ap), Math.sin(ap), Math.cos(ay) * Math.cos(ap));
    const lowDir = _b.set(0.5, -0.56, 0.66).normalize().applyQuaternion(Qc);
    const wDir = _c.copy(lowDir).lerp(aimDir, aim).normalize(); if (dying) wDir.lerp(_n.set(0.3, -0.9, 0.3), fall).normalize();
    const shR = this.shR || (this.shR = new THREE.Vector3()), shL = this.shL || (this.shL = new THREE.Vector3());
    shR.set(-0.215, 0.17, 0).applyQuaternion(Qc).add(Pc); shL.set(0.215, 0.17, 0).applyQuaternion(Qc).add(Pc);
    // dipçik sağ omuzda (karakterin sağı = -X)
    const grip = this.grip || (this.grip = new THREE.Vector3());
    const gAim = _n.set(-0.15, 0.115, 0.1).applyQuaternion(Qc).add(Pc).addScaledVector(aimDir, 0.2 - this.kick * 0.035); gAim.y += this.kick * 0.008;
    grip.set(-0.13, -0.1, 0.24).applyQuaternion(Qc).add(Pc).lerp(gAim, aim);
    const hasGun = !!this.gun && !this.gunVel;
    // --- kollar
    const handR = this.hR || (this.hR = new THREE.Vector3()), handL = this.hL || (this.hL = new THREE.Vector3());
    if (hasGun) { handR.copy(grip).addScaledVector(wDir, -0.02); handR.y -= 0.045; handL.copy(grip).addScaledVector(wDir, 0.3); handL.y -= 0.035; }
    else if (kn > 0.5) { handR.set(-0.06, 0.2, -0.2).applyQuaternion(Qc).add(Pc); handL.set(0.06, 0.2, -0.2).applyQuaternion(Qc).add(Pc); handR.y -= 0.42; handL.y -= 0.42; }
    else { const sw = Math.sin(ph * Math.PI * 2) * 0.22 * mk; handR.set(-0.27, -0.56 + Math.abs(sw) * 0.1, 0.06 + sw).applyQuaternion(Qc).add(Pc); handL.set(0.27, -0.56 + Math.abs(sw) * 0.1, 0.06 - sw).applyQuaternion(Qc).add(Pc); }
    if (cov > 0.01) { handR.lerp(_n.set(-0.07, 0.02, 0.13).applyQuaternion(Q[B.head]).add(Pp[B.head]), cov); handL.lerp(_n.set(0.07, 0.02, 0.13).applyQuaternion(Q[B.head]).add(Pp[B.head]), cov); }
    if (dying) { handR.lerp(_n.set(-0.5, 0.06, this.deathDir * -0.5), fall); handL.lerp(_n.set(0.55, 0.06, this.deathDir * -0.35), fall); }
    this.arm(B.rArm, shR, handR, _n.set(-0.6, -0.75, -0.25).applyQuaternion(Qc), wDir);
    this.arm(B.lArm, shL, handL, _n.set(0.55, -0.8, -0.1).applyQuaternion(Qc), wDir);

    // --- bacaklar
    const duty = lerp(0.62, 0.42, run), amp = stride * duty * 0.5, lift = lerp(0.07, 0.2, run);
    for (const s of [-1, 1]) {
      const T = s < 0 ? B.rThigh : B.lThigh; // s<0: karakterin sağı (-X)
      const u = (((ph + (s < 0 ? 0 : 0.5)) % 1) + 1) % 1; let fz, fyy = 0, toe = 0;
      if (u < duty) fz = lerp(amp, -amp, u / duty); else { const k = (u - duty) / (1 - duty); fz = lerp(-amp, amp, k * k * (3 - 2 * k)); fyy = Math.sin(k * Math.PI) * lift; toe = Math.sin(k * Math.PI * 2) * 0.5; }
      const baseX = s * (0.11 + cr * 0.05 + aim * 0.03), baseZ = (s > 0 ? 0.16 : -0.14) * aim * (1 - mk) + (s > 0 ? 0.05 : -0.05) * (1 - mk) + cr * (s > 0 ? 0.12 : -0.2) * (1 - mk);
      const foot = _a.set(baseX + this.moveLocal.x * fz * mk, 0.07 + fyy * mk, baseZ + this.moveLocal.y * fz * mk);
      if (kn > 0.01) foot.lerp(_n.set(s * 0.11, 0.09, -0.42), kn);
      if (dying) { foot.lerp(_n.set(s * 0.17 + this.deathSide * 0.08, 0.07, this.deathDir * (0.5 + (s > 0 ? 0.1 : -0.05))), fall); foot.z += buckle * (1 - fall) * 0.0; }
      const hipJ = _b.set(s * 0.1, -0.03, 0).applyQuaternion(Q[B.hips]).add(Pp[B.hips]);
      const pole = _c.set(s * 0.16, kn > 0.5 ? -0.4 : 0.05, 1); if (dying) pole.set(s * 0.5, lerp(0.05, 1, fall), this.deathDir > 0 ? 1 : 0.2).normalize();
      this.leg(T, hipJ, foot, pole, (dying ? 0 : toe * mk) + kn * 1.2 + fall * this.deathDir * 0.9, s * (0.12 + aim * 0.2 * (s > 0 ? 0 : 1)));
    }
    // --- silah nesnesi
    if (this.gun && !this.gunVel) {
      this.gunLocalPos = this.gunLocalPos || new THREE.Vector3(); this.gunLocalQ = this.gunLocalQ || new THREE.Quaternion();
      this.gunLocalPos.copy(grip); _x.set(0, 1, 0); if (Math.abs(wDir.y) > 0.95) _x.set(0, 0, 1);
      _z.copy(wDir); _n.crossVectors(_x, _z).normalize(); _y.crossVectors(_z, _n); this.gunLocalQ.setFromRotationMatrix(_m.makeBasis(_n, _y, _z));
      if (aim < 0.7 && !dying) { _q.setFromAxisAngle(_zAxis, -0.9 * (1 - aim)); this.gunLocalQ.multiply(_q); }
      this.gunDirLocal = this.gunDirLocal || new THREE.Vector3(); this.gunDirLocal.copy(wDir);
    }
  }

  setLocal(i, parent) { this.bones[i].quaternion.copy(_q2.copy(this.Q[parent]).invert()).multiply(this.Q[i]); }

  // İki kemikli IK (kol)
  arm(iUp, shoulder, target, pole, wDir) {
    const iFore = iUp + 1, iHand = iUp + 2; const Q = this.Q;
    const mid = this.solve(shoulder, target, L_ARM1, L_ARM2, pole, _x);
    _y.copy(mid).sub(shoulder).normalize(); quatFromDir(_y, pole, Q[iUp]);
    const end = _z.copy(target).sub(mid).normalize(); quatFromDir(end, pole, Q[iFore]);
    Q[iHand].copy(Q[iFore]);
    this.bones[iUp].quaternion.copy(_q2.copy(Q[B.chest]).invert()).multiply(Q[iUp]); this.setLocal(iFore, iUp); this.bones[iHand].quaternion.identity();
  }
  leg(iThigh, hip, foot, pole, toe, footYaw) {
    const iShin = iThigh + 1, iFoot = iThigh + 2; const Q = this.Q;
    const mid = this.solve(hip, foot, L_LEG1, L_LEG2, pole, _x);
    const k = this.kneeTmp || (this.kneeTmp = new THREE.Vector3()); k.copy(mid);
    _y.copy(k).sub(hip).normalize(); quatFromDir(_y, pole, Q[iThigh]);
    _z.copy(foot).sub(k).normalize(); const fwd = _n.copy(pole); quatFromDir(_z, fwd, Q[iShin]);
    _e.set(toe, footYaw, 0, 'YXZ'); Q[iFoot].setFromEuler(_e);
    this.bones[iThigh].quaternion.copy(_q2.copy(Q[B.hips]).invert()).multiply(Q[iThigh]); this.setLocal(iShin, iThigh); this.setLocal(iFoot, iShin);
  }
  solve(A, T, l1, l2, pole, out) {
    const n = out.copy(T).sub(A); let d = n.length(); if (d < 1e-5) { n.set(0, -1, 0); d = 1e-5; } n.multiplyScalar(1 / d);
    const dc = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.004); const cosA = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const p = this.pTmp || (this.pTmp = new THREE.Vector3()); p.copy(pole).addScaledVector(n, -pole.dot(n)); if (p.lengthSq() < 1e-6) p.set(0, 0, 1); p.normalize();
    return out.multiplyScalar(cosA * l1).addScaledVector(p, sinA * l1).add(A);
  }

  // Kemik dünya konumlarını önbelleğe al (isabet testi ve silah ağzı için)
  syncWorld() {
    const m = this.mesh; m.position.copy(this.pos); m.rotation.y = this.yaw; m.updateMatrixWorld(true);
    const wp = this.wp, bn = this.bones; const get = (b, out) => { const e = bn[b].matrixWorld.elements; return out.set(e[12], e[13], e[14]); };
    get(B.head, wp.head); wp.head.y += 0.04 * this.scale; get(B.hips, wp.pelvis); get(B.neck, wp.neck); get(B.chest, wp.chest); get(B.lShin, wp.lKnee); get(B.rShin, wp.rKnee); get(B.lFoot, wp.lFoot); get(B.rFoot, wp.rFoot);
    if (this.gun && !this.gunVel && this.gunLocalPos) {
      this.gun.position.copy(this.gunLocalPos).applyMatrix4(m.matrixWorld); _q.setFromAxisAngle(_up, this.yaw); this.gun.quaternion.copy(_q).multiply(this.gunLocalQ); this.gun.scale.setScalar(this.scale);
      this.gunDir.copy(this.gunDirLocal).applyQuaternion(_q); this.muzzle.copy(this.gun.position).addScaledVector(this.gunDir, 0.62 * this.scale); this.muzzle.y += 0.012;
    }
  }

  update(dt) {
    if (this.frozen) return;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.deathT >= 0) {
      this.deathT += dt; if (this.deathT > this.deathDur + 0.6 && !this.gunVel?.active) { this.pose(dt); this.syncWorld(); this.frozen = true; return; }
      if (this.gunVel && this.gunVel.active) { const gv = this.gunVel; gv.v.y -= 9.8 * dt; this.gun.position.addScaledVector(gv.v, dt); this.gun.rotation.x += gv.w * dt; this.gun.rotation.z += gv.w * 0.6 * dt; if (this.gun.position.y < gv.floor) { this.gun.position.y = gv.floor; gv.active = false; this.gun.rotation.set(0, this.gun.rotation.y, Math.PI / 2); this.g.audio.playAt('impWood', this.gun.position, { vol: 0.5, ref: 3, max: 30 }); } }
    }
    this.pose(dt); this.syncWorld();
    // adım sesi
    if (this.alive && this.speed > 0.5) { this.stepAcc += this.speed * dt; if (this.stepAcc > (this.speed > 3 ? 1.9 : 1.4)) { this.stepAcc = 0; const dx = this.pos.x - this.g.camera.position.x, dz = this.pos.z - this.g.camera.position.z; if (dx * dx + dz * dz < 26 * 26) this.g.audio.footstep(this.surface || 'sand', this.speed > 3 ? 0.9 : 0.5, this.pos); } }
    // iç mekân karartması
    this.skyT -= dt; if (this.skyT <= 0) { this.skyT = 0.4 + Math.random() * 0.3; let open = 0; _a.copy(this.pos); _a.y += 1.5; for (const d of [[0, 1, 0], [0.5, 0.8, 0.2], [-0.4, 0.8, -0.4]]) if (!this.g.ballistics.raycast(_a, _b.set(d[0], d[1], d[2]).normalize(), 25)) open++; this.skyTarget = 0.2 + 0.8 * open / 3; }
    const sv = this.mat.userData.skyVis; sv.value = damp(sv.value, this.skyTarget ?? 1, 3, dt);
  }

  hitTest(o, d, maxT) {
    const wp = this.wp; const cx = this.pos.x - o.x, cy = this.pos.y + 0.9 - o.y, cz = this.pos.z - o.z;
    const tc = cx * d.x + cy * d.y + cz * d.z; if (tc < -1.4 || tc > maxT + 1.4) return null;
    const px = cx - d.x * tc, py = cy - d.y * tc, pz = cz - d.z * tc; if (px * px + py * py + pz * pz > 1.5 * 1.5) return null;
    let best = null; const end = _a.copy(o).addScaledVector(d, maxT);
    const test = (a, b, r, part) => { closestSegSeg(o, end, a, b, _res); if (_res.distSq < r * r) { const t = Math.max(0, _res.s * maxT - Math.sqrt(r * r - _res.distSq)); if (!best || t < best.t) best = { t, part }; } };
    const sc = this.scale; test(wp.head, wp.head, 0.125 * sc, 'head'); test(wp.pelvis, wp.neck, 0.2 * sc, 'torso');
    if (!best) { test(wp.pelvis, wp.lKnee, 0.1 * sc, 'legs'); test(wp.lKnee, wp.lFoot, 0.085 * sc, 'legs'); test(wp.pelvis, wp.rKnee, 0.1 * sc, 'legs'); test(wp.rKnee, wp.rFoot, 0.085 * sc, 'legs'); }
    return best;
  }

  damage(amount, dir, part, owner, explosive) {
    if (!this.alive) return false;
    this.health -= amount; this.flinch.impulse(rr(4, 9)); this.flinchYaw.impulse(rr(-8, 8));
    if (this.ai) this.ai.onDamage(owner, dir);
    if (this.health <= 0) { this.die(dir, part, explosive); return true; }
    return false;
  }

  die(dir, part, explosive) {
    this.alive = false; this.deathT = 0; this.speed = 0; this.aim = 0;
    // vuruş yönüne göre: önden vurulan arkaya, arkadan vurulan öne düşer
    const fwd = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); const along = dir ? dir.x * fwd.x + dir.z * fwd.z : -1;
    this.deathDir = along < 0.15 ? 1 : -1; this.deathSide = rr(-1, 1); this.deathDur = explosive ? 0.7 : part === 'head' ? 0.75 : rr(0.9, 1.25);
    if (this.gun) { const floor = this.g.world.groundY(this.gun.position.x, this.gun.position.z) + 0.03 + (this.fixedY ? this.pos.y - this.g.world.groundY(this.pos.x, this.pos.z) : 0); this.gunVel = { v: new THREE.Vector3(rr(-1, 1), rr(0.5, 1.6), rr(-1, 1)), w: rr(-5, 5), floor: Math.max(floor, this.pos.y + 0.03), active: true }; this.gun.rotation.setFromQuaternion(this.gun.quaternion); }
    if (this.ai) this.ai.onDeath();
    this.g.onSoldierKilled?.(this);
  }

  stun(sec) { if (!this.alive) return; this.stunT = Math.max(this.stunT, sec); if (this.ai) this.ai.onStun(sec); }
  getChest(out) { return out.copy(this.wp.chest); }
  getHead(out) { return out.copy(this.wp.head); }
  dispose() { this.g.scene.remove(this.mesh); if (this.gun) this.g.scene.remove(this.gun); this.mat.dispose(); this.mesh.skeleton.dispose(); }
}
