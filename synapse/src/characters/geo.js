// Organik geometri yardımcıları: yönden-yüzeye fonksiyonla küre ızgarası, konik uzuvlar,
// saç tutamları (yassı, incelen tüpler) ve bukleler.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _d = new THREE.Vector3();

// Birim yön için (u,v) → d. Dikiş arkada (-z), yüz (+z) dokunun ortasında (u=0.5).
export function dirFromUV(u, v, out = new THREE.Vector3()) {
  const phi = u * Math.PI * 2, th = v * Math.PI;
  return out.set(-Math.sin(phi) * Math.sin(th), Math.cos(th), -Math.cos(phi) * Math.sin(th)).normalize();
}
// d → (u,v)  (dirFromUV'nin tersi)
export function uvFromDir(d) {
  const th = Math.acos(Math.max(-1, Math.min(1, d.y)));
  let phi = Math.atan2(-d.x, -d.z); if (phi < 0) phi += Math.PI * 2;
  return [phi / (Math.PI * 2), th / Math.PI];
}

// F: (d: Vector3 birim) => Vector3 (yüzey noktası). Normaller sonlu farklarla, dikişsiz.
// keep: (d) => bool — false olan üçgenler atılır (kısmi kabuklar için)
export function sphereGrid(F, ws = 96, hs = 64, keep = null) {
  const pos = [], nor = [], uv = [], idx = [];
  const e = 1e-3; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const keepV = [];
  for (let j = 0; j <= hs; j++) {
    const v = j / hs;
    for (let i = 0; i <= ws; i++) {
      const u = i / ws;
      dirFromUV(u, v, _d); p.copy(F(_d.clone()));
      pos.push(p.x, p.y, p.z); uv.push(u, 1 - v);
      // normal: F'yi iki teğet yönde türet
      const vv = Math.min(Math.max(v, 0.002), 0.998);
      dirFromUV(u + e, vv, _d); a.copy(F(_d.clone()));
      dirFromUV(u - e, vv, _d); a.sub(F(_d.clone()));
      dirFromUV(u, vv + e, _d); b.copy(F(_d.clone()));
      dirFromUV(u, vv - e, _d); b.sub(F(_d.clone()));
      c.crossVectors(b, a).normalize();
      if (!Number.isFinite(c.x) || c.lengthSq() < 0.5) { dirFromUV(u, v, c); }
      nor.push(c.x, c.y, c.z);
      if (keep) { dirFromUV(u, v, _d); keepV.push(keep(_d.clone()) ? 1 : 0); }
    }
  }
  const row = ws + 1;
  for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) {
    const A = j * row + i, B = A + 1, C = A + row, D = C + 1;
    if (keep && !(keepV[A] && keepV[B] && keepV[C] && keepV[D])) continue;
    if (j !== 0) idx.push(A, C, B);
    if (j !== hs - 1) idx.push(B, C, D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Yüzey fonksiyonunun dışa normali (sayısal)
export function surfaceNormal(F, d) {
  const [u, v] = uvFromDir(d); const e = 1e-3; const vv = Math.min(Math.max(v, 0.01), 0.99);
  const a = F(dirFromUV(u + e, vv)).sub(F(dirFromUV(u - e, vv)));
  const b = F(dirFromUV(u, vv + e)).sub(F(dirFromUV(u, vv - e)));
  return new THREE.Vector3().crossVectors(b, a).normalize();
}

// Uzuv: üstten (y=0) aşağı (-y) uzanan konik kapsül. profile: [[t(0..1), r], ...]
export function limb(len, profile, radial = 24, rows = 24) {
  const pts = [];
  const r0 = profile[0][1], r1 = profile[profile.length - 1][1];
  // üst kubbe
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r0, Math.cos(a) * r0 * 0.9)); }
  for (let i = 1; i < rows; i++) {
    const t = i / rows; let r = r0;
    for (let k = 1; k < profile.length; k++) if (t <= profile[k][0]) { const p0 = profile[k - 1], p1 = profile[k]; const kk = (t - p0[0]) / (p1[0] - p0[0]); r = p0[1] + (p1[1] - p0[1]) * (kk * kk * (3 - 2 * kk)); break; }
    pts.push(new THREE.Vector2(r, -t * len));
  }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.9)); }
  const g = new THREE.LatheGeometry(pts.reverse(), radial);
  g.computeVertexNormals();
  return g;
}

// Döner profil (gövde, kıyafet). pts: [[r, y], ...] aşağıdan yukarı. sx/sz: elips ölçek.
export function lathe(pts, radial = 40, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), radial);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

// Saç tutamı: eğri boyunca yassı, incelen tüp.
// pts: Vector3[] (kök → uç), w: genişlik, t: kalınlık, opts.taper: uç oranı, opts.up: kesit yönü ipucu
export function lock(pts, w = 0.02, t = 0.008, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const segs = opts.segs ?? 18, radial = opts.radial ?? 8;
  const taper = opts.taper ?? 0.12, rootTaper = opts.rootTaper ?? 0.7;
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uvs = [], idx = [];
  const upHint = opts.up || null;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs; const p = curve.getPointAt(s);
    const T = curve.getTangentAt(s);
    let N, B;
    if (upHint) { B = new THREE.Vector3().crossVectors(T, upHint).normalize(); if (B.lengthSq() < 0.1) B = frames.binormals[i].clone(); N = new THREE.Vector3().crossVectors(B, T).normalize(); }
    else { N = frames.normals[i]; B = frames.binormals[i]; }
    const prof = Math.min(1, s / 0.15) * (1 - rootTaper) + rootTaper; // kökte hafif ince
    const k = prof * (1 - s * (1 - taper)) ** (opts.pow ?? 1.2);
    const twist = (opts.twist ?? 0) * s;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2 + twist;
      const cx = Math.cos(a) * w * 0.5 * k, cy = Math.sin(a) * t * 0.5 * k;
      const v = new THREE.Vector3().copy(p).addScaledVector(B, cx).addScaledVector(N, cy);
      const n = new THREE.Vector3().addScaledVector(B, Math.cos(a) * t).addScaledVector(N, Math.sin(a) * w).normalize();
      pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uvs.push(j / radial, s);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const A = i * row + j, Bi = A + 1, C = A + row, D = C + 1;
    idx.push(A, C, Bi, Bi, C, D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// Sarmal (bukle) yol noktaları: başlangıç p0, eksen yönü axis, uzunluk len, yarıçap rad, tur sayısı turns
export function helixPoints(p0, axis, len, rad, turns, n = 24, phase = 0, radEnd = null) {
  const A = axis.clone().normalize();
  const tmp = Math.abs(A.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const U = new THREE.Vector3().crossVectors(A, tmp).normalize(); const V = new THREE.Vector3().crossVectors(A, U);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n; const ang = phase + s * turns * Math.PI * 2; const r = (radEnd == null ? rad : rad + (radEnd - rad) * s) * Math.min(1, s * 4);
    pts.push(new THREE.Vector3().copy(p0).addScaledVector(A, s * len).addScaledVector(U, Math.cos(ang) * r).addScaledVector(V, Math.sin(ang) * r));
  }
  return pts;
}

export function merge(geos) { const g = mergeGeometries(geos.filter(Boolean), false); geos.forEach((x) => x && x.dispose()); return g; }

// Yuvarlatılmış kutu (ayakkabı, cihaz gövdesi vb.)
export function roundedBox(w, h, d, r = 0.01, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position; const v = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const n = v.clone().sub(c); if (n.lengthSq() > 0) n.normalize().multiplyScalar(r);
    p.setXYZ(i, c.x + n.x, c.y + n.y, c.z + n.z);
  }
  g.computeVertexNormals();
  return g;
}
