// Dünya kurucusu: binlerce parçayı malzemeye göre tek ağlarda birleştirir,
// çarpışma ağı (BVH), yapay zekâ yürüme ızgarası ve iç mekân ışık kesintisini üretir.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { SURF } from '../gfx/materials.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _nm = new THREE.Matrix3(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

// Kutu yüzleri: normal + dışarıdan bakınca saat yönünün tersine 4 köşe (işaretler)
const BOX_FACES = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

export class Builder {
  constructor(M, terrain, nav) {
    this.M = M; this.terrain = terrain; this.nav = nav;
    this.batches = new Map(); this.shadows = new Map();
    this.colPos = []; this.colSurf = [];
    this.meshes = []; this.lights = []; this.floors = [];
    this.group = new THREE.Group();
  }

  // Parçalar malzeme + bölge (chunk) başına birleştirilir: ekran ya da gölge alanı dışındaki bölgeler hiç çizilmez
  chunkOf(x, z) {
    if (Math.abs(x) <= 90 && Math.abs(z) <= 80) return (x < -28 ? 0 : x < 28 ? 1 : 2) + 3 * (z < -8 ? 0 : z < 26 ? 1 : 2);
    return 100 + (Math.floor(x / 120) + 8) * 32 + (Math.floor(z / 120) + 8);
  }
  batch(mat) {
    let b = this.batches.get(mat);
    if (!b) { b = { pos: [], nrm: [], uv: [], ht: [], col: [], idx: [], n: 0 }; this.batches.set(mat, b); }
    return b;
  }
  // Yalnızca gölge için kullanılan, konum bilgili sade gövde (bölge ve yüz yönüne göre)
  castsShadow(m, o) { return o.shadow !== false && !m.transparent && !m.alphaTest && !m.isMeshBasicMaterial; }
  shadowBatch(m, x, z) {
    const key = this.chunkOf(x, z) * 2 + (m.side === THREE.DoubleSide ? 1 : 0);
    let s = this.shadows.get(key); if (!s) { s = { pos: [], idx: [], n: 0, double: m.side === THREE.DoubleSide }; this.shadows.set(key, s); }
    return s;
  }

  // Yürünebilir zemin kaydı (bina döşemeleri) — yapay zekâ yüksekliği için
  floor(minX, minZ, maxX, maxZ, y) { this.floors.push({ minX, minZ, maxX, maxZ, y }); }
  groundY(x, z) {
    let g = this.terrain.heightAt(x, z);
    for (const f of this.floors) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && f.y > g && f.y < g + 0.6) g = f.y;
    return g;
  }

  _navBlock(x, y, z, sx, sy, sz, ry, o) {
    if (!this.nav || o.nav === false) return;
    const g = this.terrain.heightAt(x, z);
    if (y < g + 1.7 && y + sy > g + 0.42) this.nav.blockOBB(x, z, sx, sz, ry, o.navPad ?? 0.24);
  }

  // Eksenlere hizalı ya da döndürülmüş kutu. (x,z) merkez, y taban.
  box(mat, x, y, z, sx, sy, sz, o = {}) {
    const ry = o.ry || 0, rx = o.rx || 0, rz = o.rz || 0;
    const rot = ry !== 0 || rx !== 0 || rz !== 0;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, cy = y + hy;
    if (rot) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); }
    const visible = mat !== null && o.visible !== false;
    const real = mat && mat.isTint ? mat.base : mat, tint = mat && mat.isTint ? mat.color : null;
    const b = visible ? this.batch(real) : null;
    const sb = visible && this.castsShadow(real, o) ? this.shadowBatch(real, x, z) : null;
    const tr = tint ? tint.r : 1, tg = tint ? tint.g : 1, tb = tint ? tint.b : 1;
    const grime = o.grime ?? (sy > 1.3);
    const uo = rot ? x * 0.37 + z * 0.61 : 0, vo = rot ? z * 0.23 : 0;
    const col = o.col !== false; const surf = o.surf ?? (mat ? mat.userData.surface : 0) ?? 0;
    const skip = o.skip || 0;
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const F = BOX_FACES[f]; const base = b ? b.n : 0;
      _n.set(F.n[0], F.n[1], F.n[2]); if (rot) _n.applyQuaternion(_q);
      const wp = [];
      for (let k = 0; k < 4; k++) {
        const lx = F.c[k][0] * hx, ly = F.c[k][1] * hy, lz = F.c[k][2] * hz;
        _v.set(lx, ly, lz); if (rot) _v.applyQuaternion(_q);
        const wx = _v.x + x, wy = _v.y + cy, wz = _v.z + z;
        wp.push(wx, wy, wz);
        if (b) {
          b.pos.push(wx, wy, wz); b.nrm.push(_n.x, _n.y, _n.z); b.col.push(tr, tg, tb);
          // dünya hizalı UV (metre) — bitişik kutularda doku kesintisiz
          const ax = rot ? lx : wx, ay = rot ? ly + hy : wy, az = rot ? lz : wz;
          let u, v;
          if (f === 0) { u = -az; v = ay; } else if (f === 1) { u = az; v = ay; } else if (f === 2) { u = ax; v = -az; } else if (f === 3) { u = ax; v = az; } else if (f === 4) { u = ax; v = ay; } else { u = -ax; v = ay; }
          if (o.uvFit) { u = k === 1 || k === 2 ? 1 : 0; v = k >= 2 ? 1 : 0; }
          else { u += uo; v += vo; if (o.uvRot) { const t = u; u = v; v = t; } }
          b.uv.push(u, v);
          if (grime && f !== 2 && f !== 3) b.ht.push(wy - (o.htBase ?? y), o.htTotal ?? sy); else b.ht.push(99, 99);
        }
      }
      if (b) { b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); b.n += 4; }
      if (sb) { const s0 = sb.n; sb.pos.push(...wp); sb.idx.push(s0, s0 + 1, s0 + 2, s0, s0 + 2, s0 + 3); sb.n += 4; }
      if (col) {
        this.colPos.push(wp[0], wp[1], wp[2], wp[3], wp[4], wp[5], wp[6], wp[7], wp[8], wp[0], wp[1], wp[2], wp[6], wp[7], wp[8], wp[9], wp[10], wp[11]);
        for (let k = 0; k < 6; k++) this.colSurf.push(surf);
      }
    }
    if (col) this._navBlock(x, y, z, sx, sy, sz, ry, o);
    return this;
  }

  // Görünmez çarpışma kutusu
  collide(x, y, z, sx, sy, sz, o = {}) { return this.box(null, x, y, z, sx, sy, sz, { ...o, visible: false, surf: o.surf ?? SURF.concrete }); }

  // Herhangi bir geometri + dönüşüm matrisi
  add(mat, g, matrix, o = {}) {
    const real = mat.isTint ? mat.base : mat, tint = mat.isTint ? mat.color : null;
    const b = this.batch(real); const base = b.n;
    const sb = this.castsShadow(real, o) ? this.shadowBatch(real, matrix.elements[12], matrix.elements[14]) : null; const sbase = sb ? sb.n : 0;
    const tr = tint ? tint.r : 1, tg = tint ? tint.g : 1, tb = tint ? tint.b : 1;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    _nm.getNormalMatrix(matrix);
    let minY = Infinity, maxY = -Infinity; const ys = [];
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix); b.pos.push(_v.x, _v.y, _v.z); ys.push(_v.y); b.col.push(tr, tg, tb); if (sb) sb.pos.push(_v.x, _v.y, _v.z);
      if (_v.y < minY) minY = _v.y; if (_v.y > maxY) maxY = _v.y;
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); b.nrm.push(_n.x, _n.y, _n.z);
      if (U) b.uv.push(U.getX(i) * (o.uvS ?? 1), U.getY(i) * (o.uvT ?? o.uvS ?? 1)); else b.uv.push(0, 0);
    }
    const H = maxY - minY;
    for (let i = 0; i < P.count; i++) { if (o.grime) b.ht.push(ys[i] - minY, H); else b.ht.push(99, 99); }
    if (g.index) { const I = g.index; for (let i = 0; i < I.count; i++) { b.idx.push(base + I.getX(i)); if (sb) sb.idx.push(sbase + I.getX(i)); } }
    else for (let i = 0; i < P.count; i++) { b.idx.push(base + i); if (sb) sb.idx.push(sbase + i); }
    b.n += P.count; if (sb) sb.n += P.count;
    if (o.col === true) {
      const surf = o.surf ?? mat.userData.surface ?? 0;
      const I = g.index; const cnt = I ? I.count : P.count;
      for (let i = 0; i < cnt; i++) { const vi = I ? I.getX(i) : i; _v.fromBufferAttribute(P, vi).applyMatrix4(matrix); this.colPos.push(_v.x, _v.y, _v.z); this.colSurf.push(surf); }
    }
    return this;
  }

  mat4(x, y, z, ry = 0, rx = 0, rz = 0, s = 1) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z);
    return _m.compose(_p, _q, typeof s === 'number' ? _one.clone().multiplyScalar(s) : s).clone();
  }

  // Silindir: varsayılan dikey; axis 'x' | 'z' ile yatay. (x,y,z) taban merkezi (dikeyde) ya da gövde merkezi (yatayda)
  cyl(mat, x, y, z, r, h, o = {}) {
    const seg = o.seg || 12; const rTop = o.rTop ?? r;
    const g = new THREE.CylinderGeometry(rTop, r, h, seg, 1, !!o.open);
    const U = g.attributes.uv; const circ = 2 * Math.PI * r;
    for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * circ, U.getY(i) * h);
    let m;
    if (o.axis === 'x') m = this.mat4(x, y, z, o.ry || 0, 0, Math.PI / 2);
    else if (o.axis === 'z') m = this.mat4(x, y, z, o.ry || 0, Math.PI / 2, 0);
    else { g.translate(0, h / 2, 0); m = this.mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0); }
    this.add(mat, g, m, { grime: o.grime });
    if (o.col !== false) {
      const d = r * 1.7;
      if (o.axis === 'x') this.collide(x, y - r, z, h, r * 2, d, { ry: o.ry, surf: mat.userData.surface, nav: o.nav });
      else if (o.axis === 'z') this.collide(x, y - r, z, d, r * 2, h, { ry: o.ry, surf: mat.userData.surface, nav: o.nav });
      else if (!o.rx && !o.rz) this.collide(x, y, z, d, h, d, { ry: (o.ry || 0) + 0.4, surf: mat.userData.surface, nav: o.nav, navPad: o.navPad });
    }
    g.dispose();
    return this;
  }

  // İki nokta arasında ince çubuk (direk, çapraz, kablo)
  beam(mat, x1, y1, z1, x2, y2, z2, r, o = {}) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1; const len = Math.hypot(dx, dy, dz);
    const g = o.round ? new THREE.CylinderGeometry(r, r, len, o.seg || 6, 1, true) : new THREE.BoxGeometry(r * 2, len, r * 2);
    const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * r * 4, U.getY(i) * len);
    _v.set(dx, dy, dz).normalize(); _q.setFromUnitVectors(_n.set(0, 1, 0), _v);
    _p.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    this.add(mat, g, _m.compose(_p, _q, _one).clone(), { col: o.col === true });
    g.dispose();
    return this;
  }

  light(x, y, z, o = {}) { this.lights.push({ x, y, z, color: o.color ?? [1.0, 0.72, 0.42], intensity: o.intensity ?? 30, dist: o.dist ?? 14, indoor: !!o.indoor, spot: o.spot || null, flicker: !!o.flicker }); }

  // Tüm parçaları malzeme başına tek ağda birleştirir
  finalize() {
    for (const [mat, b] of this.batches) {
      if (!b.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('aHt', new THREE.Float32BufferAttribute(b.ht, 2));
      if (mat.vertexColors) g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setAttribute('skyVis', new THREE.Float32BufferAttribute(new Float32Array(b.n).fill(1), 1));
      g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !!mat.alphaTest; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      if (mat.transparent) mesh.renderOrder = 5;
      this.group.add(mesh); this.meshes.push(mesh);
      b.pos = b.nrm = b.uv = b.ht = b.col = b.idx = null;
    }
    const shF = new THREE.MeshBasicMaterial({ side: THREE.FrontSide }), shD = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const s of this.shadows.values()) {
      if (!s.n) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
      g.setIndex(s.n > 65535 ? new THREE.Uint32BufferAttribute(s.idx, 1) : new THREE.Uint16BufferAttribute(s.idx, 1)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, s.double ? shD : shF); m.layers.set(1); m.castShadow = true; m.receiveShadow = false; m.matrixAutoUpdate = false;
      this.group.add(m); s.pos = s.idx = null;
    }
    return this.group;
  }

  // Çarpışma ağı + BVH
  buildCollider(extra) {
    let pos = this.colPos, surf = this.colSurf;
    const n = pos.length / 3 + (extra ? extra.pos.length / 3 : 0);
    const P = new Float32Array(n * 3), S = new Uint8Array(n);
    P.set(pos, 0); S.set(surf, 0);
    if (extra) { P.set(extra.pos, pos.length); S.fill(extra.surf, surf.length); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    const bvh = new MeshBVH(g);
    this.colPos = this.colSurf = null;
    return { geometry: g, bvh, surf: S };
  }

  // Köşe başına gökyüzü görünürlüğü: iç mekânlar ortam ışığını az alır
  async bakeSkyVis(bvh, { rays = 8, yieldEvery = 6000, onProgress, region } = {}) {
    const cache = new Map(); const ray = new THREE.Ray();
    // üst yarım küre örnek yönleri (kosinüs ağırlıklı, yerel eksende z = normal)
    const dirs = [];
    for (let i = 0; i < rays; i++) { const a = (i + 0.5) / rays * Math.PI * 2 * 2.4, r = Math.sqrt((i + 0.5) / rays) * 0.92; dirs.push([Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - r * r)]); }
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), nn = new THREE.Vector3(), d = new THREE.Vector3();
    let done = 0, total = 0, last = performance.now();
    for (const m of this.meshes) total += m.geometry.attributes.position.count;
    for (const mesh of this.meshes) {
      const g = mesh.geometry; const P = g.attributes.position.array, N = g.attributes.normal.array, V = g.attributes.skyVis.array;
      for (let i = 0; i < V.length; i++) {
        const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
        done++;
        if (region && (px < region.minX || px > region.maxX || pz < region.minZ || pz > region.maxZ)) { V[i] = 1; continue; }
        const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        const axis = ax > ay && ax > az ? (nx > 0 ? 0 : 1) : ay > az ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);
        const key = ((Math.round(px * 2) + 4096) * 8192 + (Math.round(pz * 2) + 4096)) * 2048 + ((Math.round(py * 2) + 100) & 255) * 8 + axis;
        let v = cache.get(key);
        if (v === undefined) {
          nn.set(nx, ny, nz);
          if (Math.abs(ny) > 0.9) t1.set(1, 0, 0); else t1.set(0, 1, 0);
          t2.crossVectors(nn, t1).normalize(); t1.crossVectors(t2, nn);
          let open = 0;
          ray.origin.set(px + nx * 0.09, py + ny * 0.09 + 0.02, pz + nz * 0.09);
          for (let k = 0; k < rays; k++) {
            const D = dirs[k];
            d.set(0, 0, 0).addScaledVector(t1, D[0]).addScaledVector(t2, D[1]).addScaledVector(nn, D[2]);
            // yere doğru bakan ışınlar gökyüzünü görmez ama zeminden seken ışığı bir miktar sayarız
            if (d.y < -0.05) { open += 0.3; continue; }
            ray.direction.copy(d);
            const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 26);
            if (!hit) open += 1; else if (hit.distance > 9) open += 0.45;
          }
          v = open / rays; cache.set(key, v);
        }
        V[i] = 0.1 + 0.9 * Math.min(1, v * 1.15);
        if ((done % yieldEvery) === 0 && performance.now() - last > 30) { if (onProgress) onProgress(done / total); await new Promise((r) => setTimeout(r, 0)); last = performance.now(); }
      }
      g.attributes.skyVis.needsUpdate = true;
    }
  }
}
