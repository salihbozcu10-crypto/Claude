// Bitki örtüsü: kuru ot öbekleri, çalılar ve ağaç taçları (örneklenmiş kartlar)
import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { noise2 } from './terrain.js';

function cardGeo(uv0, uv1, w, h, n, upNormals = true) {
  const pos = [], uv = [], nrm = [], idx = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI; const c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2; const b = pos.length / 3;
    pos.push(-c, 0, -s, c, 0, s, c, h, s, -c, h, -s);
    uv.push(uv0[0], uv0[1], uv1[0], uv0[1], uv1[0], uv1[1], uv0[0], uv1[1]);
    for (let k = 0; k < 4; k++) { if (upNormals) nrm.push(0, 1, 0); else nrm.push(-s, 0.4, c); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}

// Ağaç tacı: küre çevresine dağılmış yaprak kartları, normaller dışa doğru (yumuşak hacim)
function crownGeo(rng) {
  const pos = [], uv = [], nrm = [], idx = []; const v = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < 22; i++) {
    v.set(rng.range(-1, 1), rng.range(-0.45, 0.9), rng.range(-1, 1)).normalize().multiplyScalar(rng.range(0.35, 1.0)); v.y *= 0.62;
    n.set(rng.range(-1, 1), rng.range(-0.3, 1), rng.range(-1, 1)).normalize();
    r.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize(); u.crossVectors(r, n).normalize(); const s = rng.range(0.55, 0.95); const b = pos.length / 3;
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(v.x + (r.x * a + u.x * c) * s, v.y + (r.y * a + u.y * c) * s, v.z + (r.z * a + u.z * c) * s); const nn = new THREE.Vector3(v.x, v.y + 0.35, v.z).normalize(); nrm.push(nn.x, nn.y, nn.z); }
    uv.push(0.01, 0.01, 0.49, 0.01, 0.49, 0.49, 0.01, 0.49);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}

export const TREES = [[-72, 72, 1.1], [-94, 106, 1.3], [30, 122, 1.0], [54, 96, 1.25], [-52, 132, 1.1], [82, 42, 1.2], [92, -22, 1.0], [-104, -32, 1.3], [-78, -72, 1.1], [22, -82, 1.2], [-22, -86, 1.0], [72, -82, 1.3],
  [102, 62, 1.1], [-132, 72, 1.2], [62, 152, 1.3], [-68, 152, 1.1], [38, -66, 1.0], [-47, 5, 1.0], [51, 41, 0.9], [-120, 150, 1.2], [130, 120, 1.3], [150, -40, 1.2], [-170, -60, 1.3], [-40, 190, 1.1], [44, 200, 1.2], [-160, 110, 1.2], [118, 10, 1.0]];

// Ağaç gövdeleri kurucuya eklenir (çarpışmalı); taçlar sonradan örneklenir
export function addTreeTrunks(B) {
  const rng = makeRng(99); const out = [];
  for (const [x, z, s] of TREES) {
    const y = B.terrain.heightAt(x, z); const h = rng.range(2.4, 3.6) * s; const lean = rng.range(-0.12, 0.12);
    B.cyl(B.M.bark, x, y - 0.2, z, 0.2 * s, h + 0.2, { seg: 7, rTop: 0.12 * s, rz: lean, rx: rng.range(-0.1, 0.1), col: false });
    B.collide(x, y, z, 0.34 * s, h, 0.34 * s, { surf: 2, navPad: 0.25 });
    for (let k = 0; k < 3; k++) { const a = rng.range(0, 6.28), l = rng.range(1.0, 1.7) * s; B.beam(B.M.bark, x, y + h * 0.8, z, x + Math.cos(a) * l, y + h + l * 0.6, z + Math.sin(a) * l, 0.05 * s, { round: true, seg: 5 }); }
    out.push({ x, y: y + h + 0.5 * s, z, s: rng.range(2.0, 2.7) * s, ry: rng.range(0, 6.28) });
  }
  return out;
}

export function createVegetation({ M, terrain, feat, crowns, density = 1 }) {
  const group = new THREE.Group(); const rng = makeRng(555); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
  const distPoly = (x, z, pts) => { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) { const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };
  const ok = (x, z, inCamp) => {
    if (Math.abs(x) < 65.5 && Math.abs(z) < 53.5) return inCamp ? inCamp(x, z) : false;
    if (distPoly(x, z, feat.road.pts) < 3.6) return false;
    if (distPoly(x, z, feat.wadi.pts) < 5) return false;
    return true;
  };
  // --- ot
  const grassN = Math.round(11000 * density);
  const grass = new THREE.InstancedMesh(cardGeo([0.01, 0.505], [0.49, 0.99], 0.95, 0.75, 2), M.grass, grassN);
  let n = 0;
  for (let i = 0; i < grassN * 3 && n < grassN; i++) {
    const a = rng.range(0, 6.283), d = Math.pow(rng(), 0.62) * 250; const x = Math.cos(a) * d - 10, z = Math.sin(a) * d + 30;
    // kamp içinde yalnızca duvar diplerinde
    const inCamp = (cx, cz) => (Math.abs(Math.abs(cx) - 63) < 1.1 || Math.abs(Math.abs(cz) - 51) < 1.1) && rng() < 0.5;
    if (!ok(x, z, inCamp)) continue;
    if (noise2(x * 0.05, z * 0.05) + noise2(x * 0.3, z * 0.3) * 0.4 < -0.12) continue;
    const s = rng.range(0.55, 1.25); e.set(0, rng.range(0, 6.28), 0); q.setFromEuler(e); sc.set(s, s * rng.range(0.7, 1.2), s); p.set(x, terrain.heightAt(x, z) - 0.03, z);
    grass.setMatrixAt(n, m4.compose(p, q, sc));
    const t = rng(); col.setRGB(0.75 + t * 0.35, 0.72 + t * 0.3, 0.55 + t * 0.2); grass.setColorAt(n, col); n++;
  }
  grass.count = n; grass.receiveShadow = true; grass.castShadow = false; grass.frustumCulled = false; group.add(grass);
  // --- çalı
  const bushN = Math.round(700 * density);
  const bush = new THREE.InstancedMesh(cardGeo([0.51, 0.505], [0.99, 0.99], 1.5, 1.15, 3, false), M.bush, bushN);
  n = 0;
  for (let i = 0; i < bushN * 4 && n < bushN; i++) {
    const a = rng.range(0, 6.283), d = 66 + Math.pow(rng(), 0.8) * 260; const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.95 + 20;
    if (!ok(x, z)) continue;
    if (noise2(x * 0.03 + 7, z * 0.03) < 0.02) continue;
    const s = rng.range(0.6, 1.5); e.set(0, rng.range(0, 6.28), 0); q.setFromEuler(e); sc.set(s, s * rng.range(0.8, 1.15), s); p.set(x, terrain.heightAt(x, z) - 0.05, z);
    bush.setMatrixAt(n, m4.compose(p, q, sc)); const t = rng(); col.setRGB(0.8 + t * 0.3, 0.8 + t * 0.25, 0.7 + t * 0.2); bush.setColorAt(n, col); n++;
  }
  bush.count = n; bush.receiveShadow = true; bush.castShadow = true; bush.frustumCulled = false; group.add(bush);
  // --- ağaç taçları
  if (crowns && crowns.length) {
    const crown = new THREE.InstancedMesh(crownGeo(rng), M.leaves, crowns.length);
    crowns.forEach((c, i) => { e.set(0, c.ry, 0); q.setFromEuler(e); sc.set(c.s, c.s * 0.8, c.s); p.set(c.x, c.y, c.z); crown.setMatrixAt(i, m4.compose(p, q, sc)); const t = rng(); col.setRGB(0.8 + t * 0.3, 0.85 + t * 0.2, 0.75 + t * 0.2); crown.setColorAt(i, col); });
    crown.castShadow = true; crown.receiveShadow = true; crown.frustumCulled = false; group.add(crown);
  }
  return group;
}
