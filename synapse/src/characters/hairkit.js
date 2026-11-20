// Saç araçları: kafa yüzeyini izleyen "kabuk" (boşluksuz hacim) + yüzey boyunca akan tutamlar
// + bukleler. Tüm yönler kafa merkezine (bones.face) göre yereldir: +z yüz, +y yukarı, +x karakterin solu.
import * as THREE from 'three';
import { sphereGrid, lock, merge, helixPoints } from './geo.js';
import { normalMapFrom, canvasTexture } from '../engine/materials.js';
import { smoothstep, clamp, rng, fbm3 } from '../engine/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// yön → (yükseklik açısı, azimut)  azimut: 0 ön, +π/2 sol (+x), ±π arka
export function angles(d) { return { el: Math.asin(clamp(d.y, -1, 1)), az: Math.atan2(d.x, d.z) }; }

// Saç çizgisi: |azimut| → minimum yükseklik açısı (parçalı doğrusal)
export function hairlineFn(points) {
  // points: [[|az|, el], ...] artan |az|
  return (az) => {
    const a = Math.abs(az);
    if (a <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) if (a <= points[i][0]) { const [a0, e0] = points[i - 1], [a1, e1] = points[i]; const k = (a - a0) / (a1 - a0); return e0 + (e1 - e0) * (k * k * (3 - 2 * k)); }
    return points[points.length - 1][1];
  };
}

// Saç maskesi: hl çizgisine DİK mesafeyle yumuşak geçiş. Dik inen kesimlerde (kulak arkası → ense)
// yalnızca yükseklik açısına göre geçiş çok dar kalıp kabuk kenarını testere dişi yapıyordu.
// Ön/yan saç çizgisinde (|az| < 1.4) eski formülle birebir aynıdır.
export function hairMask(hl, lo, hi) {
  return (d) => {
    const { el, az } = angles(d); const a = Math.abs(az);
    let k = 1;
    if (a > 1.4) { const e = 0.01; const s = (hl(a + e) - hl(a - e)) / (2 * e); k = 1 + (Math.sqrt(1 + s * s) - 1) * smoothstep(1.4, 1.6, a); }
    return smoothstep(lo, hi, (el - hl(az)) / k);
  };
}

// Saç teli normal haritası (akış yönü boyunca çizgiler)
let _strand = null;
export function strandNormal() {
  if (_strand) return _strand;
  _strand = normalMapFrom(256, 256, (u, v) => {
    const n = fbm3(Math.cos(u * 6.2832) * 9, Math.sin(u * 6.2832) * 9, v * 1.2, 3);
    return 0.5 + 0.5 * Math.sin(u * 6.2832 * 40 + n * 6) * 0.6 + n * 0.4;
  }, 2.5, [1, 1]);
  return _strand;
}

// Saç rengi dokusu (kökte koyu, uçta hafif açık, ince tel çizgileri)
export function strandColor(base, tip, seed = 1) {
  const A = new THREE.Color(base), B = new THREE.Color(tip);
  const R = rng(seed);
  return canvasTexture(128, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const lines = Array.from({ length: w }, () => (R() - 0.5) * 0.12);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = y / h; const c = A.clone().lerp(B, v * 0.55 + lines[x]);
      const i = (y * w + x) * 4; const s = c.clone().convertLinearToSRGB();
      img.data[i] = clamp(s.r) * 255; img.data[i + 1] = clamp(s.g) * 255; img.data[i + 2] = clamp(s.b) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

// Kabuk: thick(d) metre (kafa yüzeyinden dışa). mask(d) 0..1; mask=0 olan kenarlar deri içine gömülür.
export function hairShell(headF, thick, mask, { ws = 160, hs = 120, sink = 0.004 } = {}) {
  const F = (d) => {
    const m = mask(d);
    const p = headF(d);
    const t = m > 0 ? thick(d) * smoothstep(0, 1, m) - sink * (1 - smoothstep(0, 0.35, m)) : -sink;
    return p.addScaledVector(d, t);
  };
  return sphereGrid(F, ws, hs, (d) => mask(d) > 0.001);
}

// Yüzey boyunca akan tutam. root: yön (birim), flow(d) → teğet yön (Vector3, dünya-yerel),
// surf(d) → yüzey noktası, lift(s) → yüzeyden yükselme (m), len, w, t
export function flowLock(surf, root, flow, { len = 0.12, steps = 10, lift = (s) => 0.006 * Math.sin(Math.PI * s), w = 0.03, t = 0.01, taper = 0.12, curl = 0, curlAxis = null, droop = 0 } = {}) {
  const pts = []; let d = root.clone().normalize();
  const step = len / steps;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const p = surf(d).clone();
    const n = d.clone();
    p.addScaledVector(n, lift(s));
    if (droop) p.y -= droop * s * s;
    pts.push(p);
    const f = flow(d, s).clone();
    f.addScaledVector(n, -f.dot(n)).normalize();
    const r = p.length() || 0.1;
    d.addScaledVector(f, step / r).normalize();
  }
  if (curl && curlAxis) {
    // sarmal sapma ekle
    for (let i = 1; i < pts.length; i++) {
      const s = i / (pts.length - 1); const a = s * curl * Math.PI * 2;
      pts[i].addScaledVector(curlAxis, Math.sin(a) * 0.006 * s);
    }
  }
  return lock(pts, w, t, { taper, segs: Math.max(8, steps * 2), radial: 8, up: null });
}

// Yönler kümesi (kabuk üzerinde düzgün dağılmış kökler): mask>thr olanlar
export function scatterRoots(mask, n, seed = 1, thr = 0.5) {
  const R = rng(seed); const out = []; let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const z = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    const d = V(r * Math.cos(a), z, r * Math.sin(a));
    if (mask(d) > thr) out.push(d);
  }
  return out;
}

export { merge, helixPoints, lock };
