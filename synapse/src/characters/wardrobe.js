// Kıyafet dokuları ve parçaları (karakterler arası paylaşılan).
import * as THREE from 'three';
import { canvasTexture, normalMapFrom, fabricNormal, charMaterial } from '../engine/materials.js';
import { rng, fbm3, clamp } from '../engine/util.js';
import { lock, roundedBox } from './geo.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function denimMaterial(color = 0x3f6aa8, opts = {}) {
  const C = new THREE.Color(color); const R = rng(77);
  const map = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const tw = ((x + y) % 4 < 2) ? 1.06 : 0.92; // dimi (twill) çizgisi
      const n = fbm3(x * 0.05, y * 0.05, 3, 3) * 0.12 + (R() - 0.5) * 0.08;
      const c = C.clone().multiplyScalar(tw + n);
      const s = c.convertLinearToSRGB(); const i = (y * w + x) * 4;
      img.data[i] = clamp(s.r) * 255; img.data[i + 1] = clamp(s.g) * 255; img.data[i + 2] = clamp(s.b) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: opts.repeat || [6, 6] });
  return charMaterial(0xffffff, { map, normalMap: fabricNormal(opts.repeat || [6, 6], 1.0, true), normalScale: 0.6, roughness: 0.85, sheen: 0.5, sheenColor: 0x9ab8e8 });
}

export function stripeMaterial(colors, stripeCount = 14, opts = {}) {
  const cols = colors.map((c) => new THREE.Color(c));
  const map = canvasTexture(32, 512, (g, w, h) => {
    for (let i = 0; i < stripeCount; i++) {
      const c = cols[i % cols.length].clone().convertLinearToSRGB();
      g.fillStyle = `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`;
      g.fillRect(0, (i * h) / stripeCount, w, h / stripeCount + 1);
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return charMaterial(0xffffff, { map, normalMap: fabricNormal([10, 10], 0.8), normalScale: 0.35, roughness: 0.82, sheen: 0.6, sheenColor: 0xffffff, ...opts });
}

export function leatherMaterial(color, opts = {}) {
  const nm = normalMapFrom(128, 128, (u, v) => 0.5 + fbm3(u * 14, v * 14, 1, 3) * 0.5, 1.2, [3, 3]);
  return charMaterial(color, { roughness: opts.roughness ?? 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.2, normalMap: nm, normalScale: 0.35, ...opts });
}

export function clothMaterial(color, opts = {}) {
  return charMaterial(color, { roughness: 0.86, sheen: 0.55, normalMap: fabricNormal(opts.repeat || [12, 12], 1.0), normalScale: 0.4, ...opts });
}

// Gövde önüne oturan kısmi kabuk (önlük, ceket ön panelleri): lathe sektörü
export function torsoSector(profile, phi0, phiLen, sx, sz, mat, radial = 24) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), radial, phi0, phiLen);
  g.scale(sx, 1, sz); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); return m;
}

// Gövde profilinden y'deki yarıçap (lathe profili [[r,y]...])
export function profileR(profile, y) {
  for (let i = 1; i < profile.length; i++) if (y <= profile[i][1]) { const [r0, y0] = profile[i - 1], [r1, y1] = profile[i]; return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0)); }
  return profile[profile.length - 1][0];
}

// Kayış: gövde yüzeyinde (elips) üç noktadan geçen yassı bant
export function strap(points, w = 0.028, t = 0.006, mat) {
  return new THREE.Mesh(lock(points, w, t, { taper: 1, rootTaper: 1, segs: 16, radial: 8 }), mat);
}

export function button(r, mat) { const g = new THREE.CylinderGeometry(r, r, r * 0.45, 20); g.rotateX(Math.PI / 2); return new THREE.Mesh(g, mat); }

export function boot(mat, soleMat, { w = 0.11, h = 0.12, l = 0.27, sole = 0.03 } = {}) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(w, h, l, 0.045, 4), mat); body.position.set(0, -h / 2 + 0.02, 0.05); grp.add(body);
  const toe = new THREE.Mesh(new THREE.SphereGeometry(w * 0.52, 24, 16), mat); toe.scale.set(1, 0.72, 1.05); toe.position.set(0, -h + 0.06, 0.13); grp.add(toe);
  const so = new THREE.Mesh(roundedBox(w * 1.06, sole, l * 1.04, 0.012, 3), soleMat); so.position.set(0, -h + 0.005, 0.055); grp.add(so);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(w * 0.47, 0.012, 10, 28), mat); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0.03, 0.0); grp.add(cuff);
  return grp;
}

export function sneaker(mat, soleMat, accentMat) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(0.095, 0.075, 0.24, 0.035, 4), mat); body.position.set(0, -0.045, 0.045); grp.add(body);
  const so = new THREE.Mesh(roundedBox(0.1, 0.028, 0.25, 0.012, 3), soleMat); so.position.set(0, -0.08, 0.047); grp.add(so);
  if (accentMat) { const st = new THREE.Mesh(roundedBox(0.098, 0.012, 0.13, 0.005, 2), accentMat); st.position.set(0, -0.045, 0.03); st.rotation.x = 0.2; grp.add(st); }
  return grp;
}
