// Genel yardımcılar: matematik, tohumlu rastgele sayı, yumuşatma
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const remap = (x, a, b, c, d) => c + (d - c) * sat((x - a) / (b - a));
// Kare hızından bağımsız üstel yaklaşma
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function angleDelta(from, to) { return wrapAngle(to - from); }
export function dampAngle(a, b, lambda, dt) { return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt)); }

// Tohumlu hızlı PRNG (mulberry32)
export function makeRng(seed) {
  let s = seed | 0;
  const f = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.gauss = () => { // yaklaşık normal dağılım
    return (f() + f() + f() + f() - 2) * 0.8660254;
  };
  return f;
}

export const rand = makeRng(0x5EED1234);
export const rr = (a, b) => a + (b - a) * Math.random();
export const rsign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.8660254;

// Kritik sönümlü yay (konum, hız) -> hedefe yaklaşır
export class Spring {
  constructor(stiffness = 120, damping = 14, value = 0) {
    this.k = stiffness; this.c = damping; this.x = value; this.v = 0; this.target = 0;
  }
  update(dt) {
    // yarı örtük Euler, küçük alt adımlarla kararlı
    const steps = dt > 0.02 ? 2 : 1; const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.x - this.target) - this.c * this.v;
      this.v += a * h; this.x += this.v * h;
    }
    return this.x;
  }
  impulse(v) { this.v += v; }
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const tmpV = [V3(), V3(), V3(), V3(), V3(), V3(), V3(), V3()];
export const tmpQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
export const tmpM = [new THREE.Matrix4(), new THREE.Matrix4()];
export const UP = V3(0, 1, 0);

export function formatTime(sec) {
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Bir noktadan doğru parçasına en yakın uzaklık (kare) ve parametre
export function distPointSegSq(p, a, b, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const d = abx * abx + aby * aby + abz * abz;
  let t = d > 1e-9 ? (apx * abx + apy * aby + apz * abz) / d : 0;
  t = sat(t);
  const cx = a.x + abx * t - p.x, cy = a.y + aby * t - p.y, cz = a.z + abz * t - p.z;
  if (out) out.t = t;
  return cx * cx + cy * cy + cz * cz;
}

// İki doğru parçası arasındaki en yakın noktalar (s,t parametreleri) — kapsül isabet testi için
export function closestSegSeg(p1, q1, p2, q2, res) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = 0; t = 0; }
  else if (a <= 1e-9) { s = 0; t = sat(f / e); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = sat(-c / a); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? sat((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = sat(-c / a); } else if (t > 1) { t = 1; s = sat((b - c) / a); }
    }
  }
  const cx = (p1.x + d1x * s) - (p2.x + d2x * t);
  const cy = (p1.y + d1y * s) - (p2.y + d2y * t);
  const cz = (p1.z + d1z * s) - (p2.z + d2z * t);
  res.s = s; res.t = t; res.distSq = cx * cx + cy * cy + cz * cz;
  return res;
}
