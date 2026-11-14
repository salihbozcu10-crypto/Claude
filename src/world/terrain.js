// Arazi: merkezde sık, uzakta seyrek tek ağ (vadi tabanı + çevre tepeler + uzak dağlar)
import * as THREE from 'three';
import { smoothstep, lerp, sat } from '../core/utils.js';

// Karma tabanlı 2B gradyan gürültüsü (periyodik değil; her noktada hesaplanabilir)
function h2(ix, iz) { let n = (ix * 374761393 + iz * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z); const fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const gd = (cx, cz, dx, dz) => { const a = h2(cx, cz) * 6.2831853; return Math.cos(a) * dx + Math.sin(a) * dz; };
  const a = gd(ix, iz, fx, fz), b = gd(ix + 1, iz, fx - 1, fz), c = gd(ix, iz + 1, fx, fz - 1), d = gd(ix + 1, iz + 1, fx - 1, fz - 1);
  return (a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v) * 1.5;
}
export function fbm2(x, z, oct = 4, gain = 0.5) { let s = 0, a = 1, f = 1; for (let i = 0; i < oct; i++) { s += noise2(x * f + i * 17.3, z * f - i * 9.1) * a; a *= gain; f *= 2.03; } return s; }

// Noktanın çoklu çizgiye uzaklığı
function distPolyline(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az; const t = sat(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) best = d;
  }
  return best;
}

export class Terrain {
  constructor(feat, { segs = 256, radius = 1500, power = 2.1 } = {}) {
    this.feat = feat; this.segs = segs; this.radius = radius; this.power = power;
    const n = segs + 1;
    this.X = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = (i / segs) * 2 - 1; this.X[i] = Math.sign(u) * Math.pow(Math.abs(u), power) * radius; }
    this.H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.H[j * n + i] = this.rawHeight(this.X[i], this.X[j]);
    this.size = radius * 2;
  }

  // Analitik yükseklik: tepeler + kumullar + düzlemeler (kamp, yol, vadi yatağı, iniş alanı)
  rawHeight(x, z) {
    const F = this.feat; const r = Math.hypot(x, z);
    let h = fbm2(x * 0.0042 + 3.1, z * 0.0042 - 1.7, 4, 0.5) * 16;
    h += fbm2(x * 0.019, z * 0.019, 3, 0.5) * 2.6;
    // vadiyi çevreleyen tepeler ve uzak dağlar
    const ring = smoothstep(150, 420, r);
    h += ring * (20 + 26 * (0.5 + 0.5 * noise2(x * 0.0031 + 9, z * 0.0031)));
    const mt = smoothstep(520, 1250, r);
    const ridge = 1 - Math.abs(fbm2(x * 0.0011 + 40, z * 0.0011 + 7, 4, 0.55));
    h += mt * (90 + ridge * ridge * 300 + fbm2(x * 0.004, z * 0.004, 3) * 28);
    // kuru dere yatağı
    if (F.wadi) { const d = distPolyline(x, z, F.wadi.pts); const m = 1 - smoothstep(F.wadi.w * 0.4, F.wadi.w * 1.6, d); h -= m * F.wadi.depth * (0.75 + 0.25 * noise2(x * 0.05, z * 0.05)); }
    // gözetleme sırtı (başlangıç)
    for (const b of F.bumps || []) { const d = Math.hypot(x - b.x, z - b.z); h += b.h * Math.exp(-(d * d) / (b.r * b.r)); }
    // yol: hafif kazı ve düzleme
    if (F.road) { const d = distPolyline(x, z, F.road.pts); const m = 1 - smoothstep(F.road.w * 0.5, F.road.w * 2.2, d); h -= m * 0.22; }
    // düzlemeler
    for (const f of F.flats || []) {
      let d;
      if (f.r != null) d = Math.max(0, Math.hypot(x - f.x, z - f.z) - f.r);
      else { const dx = Math.max(Math.abs(x - f.x) - f.hw, 0), dz = Math.max(Math.abs(z - f.z) - f.hd, 0); d = Math.hypot(dx, dz); }
      const m = 1 - smoothstep(0, f.blend, d);
      if (m > 0) h = lerp(h, f.y, m);
    }
    return h;
  }

  // Ağ üçgenleriyle birebir aynı yükseklik
  heightAt(x, z) {
    const n = this.segs + 1; const R = this.radius, p = this.power;
    const gi = (v) => { const u = Math.sign(v) * Math.pow(Math.min(Math.abs(v) / R, 1), 1 / p); return sat((u + 1) / 2) * this.segs; };
    let ix = Math.floor(gi(x)), iz = Math.floor(gi(z));
    if (ix >= this.segs) ix = this.segs - 1; if (iz >= this.segs) iz = this.segs - 1;
    // kayan nokta yuvarlamasına karşı hücreyi doğrula
    while (ix > 0 && x < this.X[ix]) ix--; while (ix < this.segs - 1 && x > this.X[ix + 1]) ix++;
    while (iz > 0 && z < this.X[iz]) iz--; while (iz < this.segs - 1 && z > this.X[iz + 1]) iz++;
    const fx = sat((x - this.X[ix]) / (this.X[ix + 1] - this.X[ix])), fz = sat((z - this.X[iz]) / (this.X[iz + 1] - this.X[iz]));
    const H = this.H; const a = H[iz * n + ix], d = H[iz * n + ix + 1], b = H[(iz + 1) * n + ix], c = H[(iz + 1) * n + ix + 1];
    return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }

  normalAt(x, z, out) {
    const e = 0.6; const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z), hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  buildMesh(material) {
    const n = this.segs + 1; const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = j * n + i; pos[o * 3] = this.X[i]; pos[o * 3 + 1] = this.H[o]; pos[o * 3 + 2] = this.X[j];
      uv[o * 2] = this.X[i]; uv[o * 2 + 1] = -this.X[j];
    }
    const idx = new Uint32Array(this.segs * this.segs * 6); let k = 0;
    for (let j = 0; j < this.segs; j++) for (let i = 0; i < this.segs; i++) {
      const a = j * n + i, d = a + 1, b = a + n, c = b + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skyVis', new THREE.BufferAttribute(new Float32Array(n * n).fill(1), 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, material); mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
    return mesh;
  }

  // Çarpışma için üçgen listesi (indekssiz)
  colliderTriangles() {
    const g = this.mesh.geometry; const P = g.attributes.position.array, I = g.index.array;
    const out = new Float32Array(I.length * 3);
    for (let i = 0; i < I.length; i++) { out[i * 3] = P[I[i] * 3]; out[i * 3 + 1] = P[I[i] * 3 + 1]; out[i * 3 + 2] = P[I[i] * 3 + 2]; }
    return out;
  }

  // Kontrol haritası: R = sıkışmış toprak (yol, avlu), G = çakıl, B = koyu iz (teker izi, yağ lekesi)
  buildControlMap(paint) {
    const S = 1024; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const size = this.ctrlSize = 640; const px = (x) => (x / size + 0.5) * S, pz = (z) => (z / size + 0.5) * S, pr = (r) => r / size * S;
    g.globalCompositeOperation = 'lighter';
    const api = {
      line: (pts, w, col, blur = 0.5) => { g.strokeStyle = col; g.lineWidth = Math.max(1, pr(w)); g.lineCap = 'round'; g.lineJoin = 'round'; g.filter = `blur(${Math.max(0.3, pr(w) * blur)}px)`; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(px(p[0]), pz(p[1])) : g.moveTo(px(p[0]), pz(p[1])))); g.stroke(); g.filter = 'none'; },
      rect: (x, z, hw, hd, col, blur = 3) => { g.fillStyle = col; g.filter = `blur(${pr(blur)}px)`; g.fillRect(px(x - hw), pz(z - hd), pr(hw * 2), pr(hd * 2)); g.filter = 'none'; },
      blob: (x, z, r, col) => { const gr = g.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), Math.max(1, pr(r))); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(px(x), pz(z), Math.max(1, pr(r)), 0, 6.3); g.fill(); },
    };
    paint(api);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.flipY = false;
    return t;
  }
}
