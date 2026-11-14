// Sahne donanımı: her fonksiyon kurucuya (Builder) parçalar ekler.
import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { SURF } from '../gfx/materials.js';
import { noise2 } from './terrain.js';

const R = makeRng(4242);

// Döndürülmüş yerel çerçeve: (lx, lz) yerel -> dünya
export function frame(B, ox, oy, oz, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const w = (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c];
  const F = {
    w,
    box(mat, lx, ly, lz, sx, sy, sz, o = {}) { const [x, z] = w(lx, lz); B.box(mat, x, oy + ly, z, sx, sy, sz, { ...o, ry: ry + (o.ry || 0) }); return F; },
    cyl(mat, lx, ly, lz, r, h, o = {}) { const [x, z] = w(lx, lz); B.cyl(mat, x, oy + ly, z, r, h, { ...o, ry: ry + (o.ry || 0) }); return F; },
    beam(mat, a, b, r, o) { const [x1, z1] = w(a[0], a[2]), [x2, z2] = w(b[0], b[2]); B.beam(mat, x1, oy + a[1], z1, x2, oy + b[1], z2, r, o); return F; },
    collide(lx, ly, lz, sx, sy, sz, o = {}) { const [x, z] = w(lx, lz); B.collide(x, oy + ly, z, sx, sy, sz, { ...o, ry: ry + (o.ry || 0) }); return F; },
    add(mat, g, lx, ly, lz, o = {}) { const [x, z] = w(lx, lz); B.add(mat, g, B.mat4(x, oy + ly, z, ry + (o.ry || 0), o.rx || 0, o.rz || 0, o.s ?? 1), o); return F; },
    light(lx, ly, lz, o) { const [x, z] = w(lx, lz); B.light(x, oy + ly, z, o); return F; },
    pt(lx, ly, lz) { const [x, z] = w(lx, lz); return { x, y: oy + ly, z }; },
    ry,
  };
  return F;
}

// ------------------------------------------------------------ küçük donanım

export function crate(B, x, y, z, s = 0.9, ry = 0, kind = 'wood') {
  const M = B.M; const mat = kind === 'ammo' ? M.crateAmmo : kind === 'expl' ? M.crateExpl : M.crateWood;
  if (kind === 'wood') B.box(mat, x, y, z, s, s, s, { ry, uvFit: true, grime: false });
  else B.box(mat, x, y, z, s * 1.25, s * 0.5, s * 0.62, { ry, uvFit: true, grime: false });
}

export function crateStack(B, x, z, ry = 0, n = 3, y = 0) {
  const kinds = ['wood', 'wood', 'ammo', 'expl'];
  let h = y;
  for (let i = 0; i < n; i++) {
    const k = kinds[R.int(0, 3)]; const s = k === 'wood' ? R.range(0.75, 1.0) : 0.9;
    crate(B, x + R.range(-0.08, 0.08), h, z + R.range(-0.08, 0.08), s, ry + R.range(-0.25, 0.25), k);
    h += k === 'wood' ? s : s * 0.5;
  }
}

export function barrel(B, x, y, z, mat, o = {}) {
  const M = B.M; const r = 0.29, h = 0.88;
  if (o.lying) {
    B.cyl(mat, x, y + r, z, r, h, { axis: 'x', ry: o.ry || 0, seg: 14 });
    for (const t of [-0.15, 0.15]) { const c = Math.cos(o.ry || 0), s = Math.sin(o.ry || 0); B.cyl(mat, x + t * c, y + r, z - t * s, r + 0.012, 0.03, { axis: 'x', ry: o.ry || 0, seg: 14, col: false }); }
    return;
  }
  B.cyl(mat, x, y, z, r, h, { seg: 14, navPad: 0.2 });
  B.cyl(mat, x, y + 0.29, z, r + 0.012, 0.03, { seg: 14, col: false }); B.cyl(mat, x, y + 0.59, z, r + 0.012, 0.03, { seg: 14, col: false });
  B.cyl(M.gunmetal, x + 0.16, y + h, z + 0.05, 0.03, 0.02, { seg: 6, col: false });
}

let _bagGeo = null;
function bagGeo() {
  if (_bagGeo) return _bagGeo;
  const g = new THREE.SphereGeometry(0.5, 9, 6); const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    x = Math.sign(x) * Math.pow(Math.abs(x) * 2, 0.55) / 2; z = Math.sign(z) * Math.pow(Math.abs(z) * 2, 0.6) / 2; y = Math.sign(y) * Math.pow(Math.abs(y) * 2, 0.75) / 2;
    P.setXYZ(i, x * 0.66, y * 0.2, z * 0.36);
  }
  g.computeVertexNormals();
  const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 1.4, U.getY(i) * 0.6);
  _bagGeo = g; return g;
}

// Kum torbası duvarı: (x1,z1)-(x2,z2) hattı boyunca, tuğla örgüsü
export function sandbags(B, x1, z1, x2, z2, layers = 4, y0 = 0, o = {}) {
  const M = B.M; const dx = x2 - x1, dz = z2 - z1; const len = Math.hypot(dx, dz); const ry = Math.atan2(-dz, dx);
  const n = Math.max(1, Math.round(len / 0.6)); const step = len / n; const g = bagGeo();
  for (let l = 0; l < layers; l++) {
    const off = (l & 1) ? 0.5 : 0; const cnt = (l & 1) ? n - 1 : n;
    for (let i = 0; i < cnt; i++) {
      const t = (i + 0.5 + off) * step / len;
      const m = B.mat4(x1 + dx * t + R.range(-0.03, 0.03), y0 + 0.09 + l * 0.175, z1 + dz * t + R.range(-0.03, 0.03), ry + R.range(-0.12, 0.12), R.range(-0.05, 0.05), R.range(-0.06, 0.06), new THREE.Vector3(R.range(0.93, 1.05), R.range(0.9, 1.1), R.range(0.95, 1.08)));
      B.add(M.burlap, g, m);
    }
  }
  B.collide((x1 + x2) / 2, y0, (z1 + z2) / 2, len, layers * 0.175 + 0.03, 0.38, { ry, surf: SURF.sand, nav: o.nav });
}

export function hesco(B, x, z, ry = 0, n = 1, y = 0) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 1.12;
    F.box(M.hesco, lx, 0, 0, 1.08, 1.32, 1.08, { grime: true });
    F.box(M.burlap, lx, 1.3, 0, 1.0, 0.08, 1.0, { col: false });
    for (const [a, c] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) F.beam(M.galvanized, [lx + a, 0, c], [lx + a, 1.36, c], 0.012);
    for (const h of [0.02, 0.46, 0.9, 1.35]) {
      F.beam(M.galvanized, [lx - 0.55, h, -0.55], [lx + 0.55, h, -0.55], 0.008); F.beam(M.galvanized, [lx - 0.55, h, 0.55], [lx + 0.55, h, 0.55], 0.008);
      F.beam(M.galvanized, [lx - 0.55, h, -0.55], [lx - 0.55, h, 0.55], 0.008); F.beam(M.galvanized, [lx + 0.55, h, -0.55], [lx + 0.55, h, 0.55], 0.008);
    }
  }
}

export function container(B, x, y, z, ry, mat) {
  const M = B.M; const F = frame(B, x, y, z, ry); const L = 6.06, W = 2.44, H = 2.59;
  F.box(mat, 0, 0.12, 0, L - 0.1, H - 0.2, W - 0.08, { grime: true, col: false, uvRot: false });
  F.collide(0, 0, 0, L, H, W, { surf: SURF.metal });
  // köşe direkleri ve kirişler
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(mat, sx * (L / 2 - 0.06), 0, sz * (W / 2 - 0.06), 0.14, H, 0.14, { col: false });
  for (const sz of [-1, 1]) { F.box(mat, 0, 0, sz * (W / 2 - 0.05), L, 0.14, 0.1, { col: false }); F.box(mat, 0, H - 0.12, sz * (W / 2 - 0.05), L, 0.12, 0.1, { col: false }); }
  for (const sx of [-1, 1]) { F.box(mat, sx * (L / 2 - 0.05), 0, 0, 0.1, 0.14, W, { col: false }); F.box(mat, sx * (L / 2 - 0.05), H - 0.12, 0, 0.1, 0.12, W, { col: false }); }
  // kapı ucu: kilit çubukları
  for (const lz of [-0.75, -0.3, 0.3, 0.75]) { F.beam(M.galvanized, [L / 2 + 0.02, 0.2, lz], [L / 2 + 0.02, H - 0.2, lz], 0.018, { round: true }); F.box(M.gunmetal, L / 2 + 0.03, 1.05, lz + 0.06, 0.03, 0.05, 0.16, { col: false }); }
  F.box(M.gunmetal, L / 2 + 0.01, 0.14, 0, 0.02, H - 0.28, 0.03, { col: false });
}

function wheel(F, lx, ly, lz, r = 0.38, w = 0.26) {
  const M = F.M;
  F.cyl(M.tire, lx, ly, lz, r, w, { axis: 'x', seg: 16, col: false });
  F.cyl(M.steel, lx + Math.sign(lx) * 0.01, ly, lz, r * 0.52, w + 0.012, { axis: 'x', seg: 10, col: false });
}

// Pikap (isteğe bağlı kasada ağır makineli tüfek)
export function pickup(B, x, z, ry, mat, o = {}) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry); F.M = M;
  const wreck = !!o.wreck; const body = wreck ? M.rust : mat; const glass = M.glass;
  F.box(M.gunmetal, 0, 0.38, 0, 1.5, 0.22, 4.9, { col: false });
  F.box(body, 0, 0.56, 1.72, 1.78, 0.5, 1.35, { col: false, grime: true });      // motor kaputu
  F.box(body, 0, 0.56, 0.3, 1.82, 0.62, 1.6, { col: false, grime: true });       // kabin altı
  F.box(body, 0, 1.72, 0.22, 1.6, 0.07, 1.25, { col: false });                   // tavan
  for (const sx of [-1, 1]) {
    F.box(body, sx * 0.78, 1.18, 0.82, 0.06, 0.56, 0.07, { col: false, rx: -0.42 }); // A direği
    F.box(body, sx * 0.78, 1.18, -0.38, 0.06, 0.56, 0.09, { col: false });           // C direği
    F.box(body, sx * 0.78, 1.18, 0.2, 0.05, 0.56, 0.06, { col: false });
    if (!wreck) F.box(glass, sx * 0.79, 1.2, 0.22, 0.02, 0.5, 1.1, { col: false });
    // kasa yan duvarları
    F.box(body, sx * 0.86, 0.6, -1.55, 0.07, 0.5, 2.0, { col: false, grime: true });
    // çamurluklar
    F.box(body, sx * 0.9, 0.62, 1.55, 0.06, 0.34, 0.95, { col: false });
  }
  if (!wreck) { F.box(glass, 0, 1.2, 0.95, 1.5, 0.52, 0.02, { col: false, rx: -0.42 }); F.box(glass, 0, 1.2, -0.42, 1.5, 0.5, 0.02, { col: false }); }
  F.box(body, 0, 0.56, -0.55, 1.78, 0.62, 0.06, { col: false });                 // kabin arkası
  F.box(M.gunmetal, 0, 0.58, -1.55, 1.7, 0.06, 2.0, { col: false });             // kasa tabanı
  F.box(body, 0, 0.6, -2.56, 1.78, 0.5, 0.06, { col: false });                   // arka kapak
  F.box(M.gunmetal, 0, 0.36, 2.44, 1.86, 0.22, 0.14, { col: false }); F.box(M.gunmetal, 0, 0.36, -2.62, 1.86, 0.2, 0.12, { col: false });
  F.box(M.black, 0, 0.66, 2.4, 1.1, 0.26, 0.04, { col: false });                 // ızgara
  for (const sx of [-1, 1]) { F.box(wreck ? M.rust : M.bulbOff, sx * 0.68, 0.74, 2.4, 0.3, 0.16, 0.04, { col: false }); F.box(wreck ? M.rust : M.paintRed, sx * 0.76, 0.78, -2.6, 0.16, 0.14, 0.03, { col: false }); }
  const wy = 0.38;
  if (!wreck) { for (const sx of [-1, 1]) { wheel(F, sx * 0.84, wy, 1.6); wheel(F, sx * 0.84, wy, -1.55); } }
  else { wheel(F, -0.84, wy, 1.6); F.box(M.rust, 0.8, 0.02, -1.5, 0.5, 0.2, 0.5, { col: false }); }
  if (o.rollbar) { for (const sx of [-1, 1]) F.beam(M.black, [sx * 0.8, 1.1, -0.75], [sx * 0.8, 1.8, -0.75], 0.03); F.beam(M.black, [-0.8, 1.8, -0.75], [0.8, 1.8, -0.75], 0.03); }
  if (o.gun) { // kasada ağır makineli
    F.cyl(M.gunmetal, 0, 0.64, -1.5, 0.05, 0.9, { seg: 8, col: false });
    F.box(M.gunmetal, 0, 1.52, -1.4, 0.12, 0.16, 0.7, { col: false }); F.cyl(M.gunmetal, 0, 1.6, -0.75, 0.022, 0.9, { axis: 'z', seg: 8, col: false });
    F.box(M.paintOlive, 0.2, 1.42, -1.45, 0.2, 0.2, 0.34, { col: false });
    F.box(M.gunmetal, 0, 1.3, -1.05, 0.9, 0.6, 0.012, { col: false });
  }
  if (o.cargo) { crate(B, ...F.w(0.3, -1.3).slice(0, 1), y + 0.64, F.w(0.3, -1.3)[1], 0.7, ry + 0.2, 'wood'); const p = F.w(-0.4, -1.9); barrel(B, p[0], y + 0.64, p[1], M.paintBlue); }
  F.collide(0, 0.22, 0.2, 1.84, 0.98, 5.1, { surf: SURF.metal });
  F.collide(0, 1.2, 0.22, 1.66, 0.6, 1.3, { surf: SURF.metal, nav: false });
}

// Brandalı kamyon
export function truck(B, x, z, ry, o = {}) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry); F.M = M; const body = M.paintOlive;
  F.box(M.gunmetal, 0, 0.62, 0, 1.2, 0.3, 7.2, { col: false });
  F.box(body, 0, 0.95, 2.55, 2.36, 1.75, 1.9, { col: false, grime: true });        // kabin
  F.box(M.glass, 0, 1.95, 3.51, 2.0, 0.6, 0.02, { col: false }); for (const sx of [-1, 1]) F.box(M.glass, sx * 1.19, 1.95, 2.7, 0.02, 0.55, 1.0, { col: false });
  F.box(M.gunmetal, 0, 0.6, 3.56, 2.4, 0.34, 0.16, { col: false });
  for (const sx of [-1, 1]) F.box(M.bulbOff, sx * 0.86, 1.02, 3.52, 0.3, 0.2, 0.03, { col: false });
  F.box(M.woodOld, 0, 1.02, -1.0, 2.4, 0.1, 4.7, { col: false });                   // kasa tabanı
  for (const sx of [-1, 1]) F.box(M.woodOld, sx * 1.17, 1.1, -1.0, 0.06, 0.7, 4.7, { col: false, uvRot: true });
  F.box(M.woodOld, 0, 1.1, -3.33, 2.4, 0.7, 0.06, { col: false }); F.box(M.woodOld, 0, 1.1, 1.33, 2.4, 0.7, 0.06, { col: false });
  if (o.cover !== false) { // branda kemeri
    const g = new THREE.CylinderGeometry(1.22, 1.22, 4.6, 12, 1, true, -Math.PI / 2, Math.PI);
    const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 3.8, U.getY(i) * 4.6);
    F.add(M.canvasOlive, g, 0, 1.78, -1.0, { rx: Math.PI / 2 });
    F.box(M.canvasOlive, 0, 1.8, 1.3, 2.4, 1.2, 0.03, { col: false });
  }
  for (const sx of [-1, 1]) { wheel(F, sx * 1.05, 0.52, 2.5, 0.52, 0.32); wheel(F, sx * 1.05, 0.52, -1.3, 0.52, 0.32); wheel(F, sx * 1.05, 0.52, -2.5, 0.52, 0.32); }
  F.cyl(M.steel, 0.95, 0.72, 0.6, 0.26, 0.9, { axis: 'z', seg: 10, col: false });
  F.collide(0, 0.3, 2.55, 2.4, 2.4, 2.0, { surf: SURF.metal });
  F.collide(0, 0.3, -1.0, 2.44, 1.55, 4.8, { surf: SURF.metal });
  if (o.cover !== false) F.collide(0, 1.85, -1.0, 2.3, 1.1, 4.6, { surf: SURF.fabric, nav: false });
}

// Gözetleme kulesi: platform yüksekliği h
export function tower(B, x, z, ry = 0, h = 5.4) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry); const s = 1.5;
  for (const [a, c] of [[-s, -s], [s, -s], [s, s], [-s, s]]) { F.box(M.woodDark, a, 0, c, 0.2, h + 2.4, 0.2, { grime: false, uvRot: true, navPad: 0.2 }); F.box(M.concrete, a, 0, c, 0.5, 0.25, 0.5, { col: false }); }
  for (let lv = 0; lv < 2; lv++) {
    const y0 = 0.3 + lv * (h / 2 - 0.1), y1 = y0 + h / 2 - 0.3;
    F.beam(M.woodDark, [-s, y0, -s], [s, y1, -s], 0.05); F.beam(M.woodDark, [s, y0, -s], [-s, y1, -s], 0.05);
    F.beam(M.woodDark, [-s, y0, s], [s, y1, s], 0.05); F.beam(M.woodDark, [s, y0, s], [-s, y1, s], 0.05);
    F.beam(M.woodDark, [-s, y0, -s], [-s, y1, s], 0.05); F.beam(M.woodDark, [-s, y0, s], [-s, y1, -s], 0.05);
    F.beam(M.woodDark, [s, y0, -s], [s, y1, s], 0.05); F.beam(M.woodDark, [s, y0, s], [s, y1, -s], 0.05);
  }
  F.box(M.woodOld, 0, h, 0, 3.5, 0.12, 3.5, { nav: false });
  // korkuluk: sac + ahşap
  for (const [a, c, w, d] of [[0, -1.7, 3.5, 0.03], [0, 1.7, 3.5, 0.03], [-1.7, 0, 0.03, 3.5]]) F.box(M.wallMetalGreen, a, h + 0.12, c, w, 1.0, d, { nav: false, grime: false, surf: SURF.metal });
  F.box(M.wallMetalGreen, 1.7, h + 0.12, -0.9, 0.03, 1.0, 1.7, { nav: false, grime: false });
  F.box(M.woodOld, 0, h + 1.12, -1.7, 3.6, 0.06, 0.14, { col: false }); F.box(M.woodOld, 0, h + 1.12, 1.7, 3.6, 0.06, 0.14, { col: false }); F.box(M.woodOld, -1.7, h + 1.12, 0, 0.14, 0.06, 3.6, { col: false });
  // çatı
  F.box(M.roofMetal, 0, h + 2.4, 0, 4.2, 0.05, 4.2, { nav: false, rx: 0.07, grime: false });
  // merdiven
  F.beam(M.woodDark, [1.85, 0, 0.5], [1.85, h + 1.1, 0.5], 0.035); F.beam(M.woodDark, [1.85, 0, 1.0], [1.85, h + 1.1, 1.0], 0.035);
  for (let i = 1; i < h / 0.32; i++) F.beam(M.woodDark, [1.85, i * 0.32, 0.5], [1.85, i * 0.32, 1.0], 0.02);
  // projektör
  F.cyl(M.paintDark, -1.2, h + 1.25, -1.45, 0.17, 0.3, { axis: 'z', seg: 10, col: false }); F.cyl(M.bulb, -1.2, h + 1.25, -1.6, 0.13, 0.02, { axis: 'z', seg: 10, col: false });
  const p = F.pt(0, h + 0.14, 0);
  return { x: p.x, y: p.y, z: p.z };
}

export function lampPost(B, x, z, ry = 0, h = 6.2) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry);
  F.cyl(M.galvanized, 0, 0, 0, 0.07, h, { seg: 8, navPad: 0.1 }); F.box(M.concrete, 0, 0, 0, 0.4, 0.2, 0.4, { col: false });
  F.beam(M.galvanized, [0, h - 0.1, 0], [0, h + 0.2, 1.3], 0.035, { round: true });
  F.box(M.paintDark, 0, h + 0.1, 1.35, 0.3, 0.1, 0.56, { col: false }); F.box(M.bulb, 0, h + 0.06, 1.35, 0.22, 0.04, 0.44, { col: false });
  const p = F.pt(0, h, 1.35);
  B.light(p.x, p.y, p.z, { intensity: 260, dist: 26, spot: { tx: p.x, ty: y, tz: p.z, angle: 1.05 } });
}

export function waterTank(B, x, z) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, 0.3);
  for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.box(M.galvanized, a, 0, c, 0.12, 3.6, 0.12, { navPad: 0.15, grime: false });
  F.beam(M.galvanized, [-1, 0.3, -1], [1, 3.3, -1], 0.03); F.beam(M.galvanized, [1, 0.3, 1], [-1, 3.3, 1], 0.03); F.beam(M.galvanized, [-1, 0.3, 1], [-1, 3.3, -1], 0.03); F.beam(M.galvanized, [1, 0.3, -1], [1, 3.3, 1], 0.03);
  F.box(M.woodOld, 0, 3.6, 0, 2.6, 0.1, 2.6, { nav: false });
  F.cyl(M.galvanized, 0, 3.7, 0, 1.2, 2.0, { seg: 18, nav: false, grime: true }); F.cyl(M.galvanized, 0, 5.7, 0, 1.25, 0.5, { seg: 18, rTop: 0.1, col: false });
  F.beam(M.steel, [1.2, 3.7, 0], [1.2, 0.3, 0], 0.035, { round: true });
}

// Kafes telsiz direği
export function radioMast(B, x, z, h = 21) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, 0.2); const r = 0.5;
  F.box(M.concrete, 0, 0, 0, 2.2, 0.3, 2.2, { nav: true });
  const leg = (k) => [Math.cos(k * 2.0944) * r, Math.sin(k * 2.0944) * r];
  const seg = 1.2; const n = Math.floor(h / seg);
  for (let k = 0; k < 3; k++) { const [a, c] = leg(k); F.beam(M.galvanized, [a, 0.3, c], [a, 0.3 + n * seg, c], 0.03, { round: true }); }
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const [a, c] = leg(k), [a2, c2] = leg((k + 1) % 3); const y0 = 0.3 + i * seg;
    F.beam(M.galvanized, [a, y0, c], [a2, y0, c2], 0.014); F.beam(M.galvanized, (i & 1) ? [a, y0, c] : [a2, y0, c2], (i & 1) ? [a2, y0 + seg, c2] : [a, y0 + seg, c], 0.012);
  }
  const top = 0.3 + n * seg;
  F.beam(M.steel, [0, top, 0], [0, top + 3.2, 0], 0.02, { round: true });
  for (let k = 0; k < 3; k++) { const a = k * 2.0944 + 0.5; F.beam(M.gunmetal, [Math.cos(a) * 0.4, top * 0.68, Math.sin(a) * 0.4], [Math.cos(a) * 10, 0.1, Math.sin(a) * 10], 0.008); F.box(M.concrete, Math.cos(a) * 10, 0, Math.sin(a) * 10, 0.5, 0.25, 0.5, { nav: false, col: false }); }
  // çanak antenler
  F.cyl(M.paintWhite, 0.75, top - 3.2, 0.2, 0.55, 0.16, { axis: 'x', seg: 14, rTop: 0.15, col: false }); F.cyl(M.paintWhite, -0.3, top - 5.4, 0.7, 0.42, 0.14, { axis: 'z', seg: 14, rTop: 0.12, col: false });
  for (const hh of [top - 1.2, top - 2.2]) for (let k = 0; k < 3; k++) { const [a, c] = leg(k); F.box(M.paintWhite, a * 1.5, hh, c * 1.5, 0.1, 0.9, 0.1, { col: false }); }
  F.collide(0, 0.3, 0, 0.9, top, 0.9, { surf: SURF.metal, ry: 0.5 });
  const p = F.pt(0, top + 3.25, 0);
  return { beacon: p, base: F.pt(0.75, 0.3, 0.75) };
}

export function generator(B, x, z, ry = 0) {
  const M = B.M; const y = B.groundY(x, z); const F = frame(B, x, y, z, ry);
  F.box(M.gunmetal, 0, 0, 0, 1.9, 0.12, 1.0, { col: false }); F.box(M.paintYellow, 0, 0.12, 0, 1.7, 0.95, 0.9, { grime: true });
  F.box(M.paintDark, 0.5, 0.5, 0.455, 0.5, 0.4, 0.02, { col: false }); F.box(M.black, -0.4, 0.3, 0.455, 0.6, 0.55, 0.02, { col: false });
  F.cyl(M.rust, -0.6, 1.07, -0.2, 0.05, 0.5, { seg: 8, col: false }); F.box(M.paintDark, 0, 1.07, 0, 1.5, 0.04, 0.7, { col: false });
  jerrycan(B, ...Object.values(F.pt(1.2, 0, 0.3)), ry + 0.4); jerrycan(B, ...Object.values(F.pt(1.25, 0, -0.15)), ry - 0.2);
  return F.pt(0, 0.6, 0);
}

export function jerrycan(B, x, y, z, ry = 0, mat) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  F.box(mat || M.paintOlive, 0, 0, 0, 0.34, 0.44, 0.16, { col: false, grime: false }); F.box(mat || M.paintOlive, 0, 0.44, 0, 0.2, 0.04, 0.05, { col: false }); F.cyl(M.gunmetal, 0.12, 0.44, 0, 0.025, 0.04, { seg: 6, col: false });
}

export function fuelTank(B, x, z, ry = 0) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry);
  for (const lx of [-1.1, 1.1]) F.box(M.concrete, lx, 0, 0, 0.4, 0.7, 1.9, {});
  F.cyl(M.paintWhite, 0, 1.6, 0, 0.98, 3.8, { axis: 'x', seg: 18 });
  F.box(M.paintRed, 0, 0.66, 0, 0.5, 1.9, 2.0, { col: false, visible: false });
  F.cyl(M.paintRed, 0, 1.6, 0, 0.995, 0.5, { axis: 'x', seg: 18, col: false });
  F.cyl(M.steel, 0.8, 2.56, 0, 0.14, 0.14, { seg: 8, col: false }); F.beam(M.steel, [1.95, 1.0, 0.4], [1.95, 0.25, 0.4], 0.03, { round: true }); F.beam(M.steel, [1.95, 1.0, 0.4], [1.8, 1.0, 0.4], 0.03, { round: true });
  F.box(M.paintYellow, 0, 0.9, 0.99, 0.5, 0.5, 0.01, { col: false, rz: Math.PI / 4 });
}

export function tent(B, x, z, ry = 0, mat, o = {}) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry); const w = o.w || 3.2, len = o.len || 4.6, hgt = o.h || 2.2;
  const slope = Math.atan2(hgt - 0.5, w / 2); const sl = Math.hypot(hgt - 0.5, w / 2);
  for (const sx of [-1, 1]) {
    F.box(mat, sx * w / 4, 0.5 + (hgt - 0.5) / 2 - 0.02, 0, sl, 0.03, len, { rz: sx * -slope, surf: SURF.fabric, nav: false, grime: false, visible: true, col: false });
    F.box(mat, sx * w / 2, 0, 0, 0.03, 0.52, len, { surf: SURF.fabric, grime: false });
  }
  // arka üçgen duvar
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, w / 2, 0.5, 0, -w / 2, 0, 0, w / 2, 0.5, 0, -w / 2, 0.5, 0, -w / 2, 0.5, 0, w / 2, 0.5, 0, 0, hgt, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w, 0, w, 0.5, 0, 0, w, 0.5, 0, 0.5, 0, 0.5, w, 0.5, w / 2, hgt], 2)); tri.computeVertexNormals();
  F.add(mat, tri, 0, 0, -len / 2); F.collide(0, 0, -len / 2, w, hgt * 0.8, 0.04, { surf: SURF.fabric });
  F.beam(M.woodDark, [0, 0, len / 2], [0, hgt + 0.1, len / 2], 0.035); F.beam(M.woodDark, [0, 0, -len / 2], [0, hgt + 0.1, -len / 2], 0.035); F.beam(M.woodDark, [0, hgt, -len / 2], [0, hgt, len / 2], 0.03);
  for (const sx of [-1, 1]) for (const lz of [-len / 2, 0, len / 2]) F.beam(M.gunmetal, [sx * w / 2, 0.5, lz], [sx * (w / 2 + 0.9), 0, lz], 0.006);
  // eğimli yüzeyler için çarpışma (basamaklı)
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const t = (i + 0.5) / 3; F.collide(sx * (w / 2) * (1 - t), 0.5 + (hgt - 0.5) * t - 0.25, 0, 0.1, 0.55, len, { surf: SURF.fabric, nav: i === 0 }); }
}

// Kamuflaj ağı gölgeliği
export function camoNet(B, x, z, ry, w, d, h = 2.8) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry);
  const g = new THREE.PlaneGeometry(w, d, 8, 8); g.rotateX(-Math.PI / 2);
  const P = g.attributes.position, U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    const px = P.getX(i) / (w / 2), pz = P.getZ(i) / (d / 2);
    P.setY(i, -0.55 * (1 - px * px) * (1 - pz * pz) + noise2(px * 2.3 + x, pz * 2.3 + z) * 0.12);
    U.setXY(i, 0.5 + ((U.getX(i) * w / 2.6) % 1) * 0.5, ((U.getY(i) * d / 2.6) % 1) * 0.5);
  }
  // döşeme tekrarını atlas hücresinde tutmak için her dörtgeni ayrı UV ile kur
  const ng = g.toNonIndexed(); const NU = ng.attributes.uv; const NP = ng.attributes.position;
  for (let i = 0; i < NU.count; i += 3) {
    let mu = 1e9, mv = 1e9; for (let k = 0; k < 3; k++) { mu = Math.min(mu, NP.getX(i + k)); mv = Math.min(mv, NP.getZ(i + k)); }
    const cw = w / 8, cd = d / 8; const bu = Math.floor((mu + w / 2 + 1e-4) / cw), bv = Math.floor((mv + d / 2 + 1e-4) / cd);
    for (let k = 0; k < 3; k++) {
      const fu = (NP.getX(i + k) + w / 2) / cw - bu, fv = (NP.getZ(i + k) + d / 2) / cd - bv;
      const ou = ((bu * 0.37) % 0.5), ov = ((bv * 0.29) % 0.5);
      NU.setXY(i + k, 0.51 + ((ou + fu * 0.24) % 0.48), 0.01 + ((ov + fv * 0.24) % 0.48));
    }
  }
  ng.computeVertexNormals();
  F.add(M.camoNet, ng, 0, h, 0);
  for (const [a, c] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, -d / 2], [0, d / 2]]) F.beam(M.woodDark, [a, 0, c], [a, h + 0.05, c], 0.04, {});
  g.dispose();
}

export function tireStack(B, x, z, n = 3, y = null) {
  const M = B.M; const y0 = y ?? B.terrain.heightAt(x, z);
  const g = new THREE.TorusGeometry(0.3, 0.13, 7, 14); g.rotateX(Math.PI / 2);
  const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 4, U.getY(i) * 1);
  for (let i = 0; i < n; i++) B.add(M.tire, g, B.mat4(x + R.range(-0.04, 0.04), y0 + 0.13 + i * 0.25, z + R.range(-0.04, 0.04), R.range(0, 6)));
  B.collide(x, y0, z, 0.8, n * 0.25 + 0.02, 0.8, { surf: SURF.rubber, ry: 0.4 });
  g.dispose();
}

export function pallet(B, x, y, z, ry = 0) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  for (const lz of [-0.45, 0, 0.45]) F.box(M.woodOld, 0, 0, lz, 1.2, 0.09, 0.09, { col: false });
  for (let i = 0; i < 5; i++) F.box(M.woodOld, -0.5 + i * 0.25, 0.09, 0, 0.14, 0.022, 1.0, { col: false, uvRot: true });
  F.collide(0, 0, 0, 1.2, 0.12, 1.0, { surf: SURF.wood, nav: false });
}

export function table(B, x, y, z, ry = 0, w = 1.6, d = 0.8, mat) {
  const M = B.M; const F = frame(B, x, y, z, ry); const m = mat || M.woodOld;
  F.box(m, 0, 0.72, 0, w, 0.045, d, { nav: false, col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(M.gunmetal, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), 0.04, 0.72, 0.04, { col: false });
  F.collide(0, 0, 0, w, 0.765, d, { surf: SURF.wood });
}

export function chair(B, x, y, z, ry = 0) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  F.box(M.paintDark, 0, 0.44, 0, 0.42, 0.035, 0.42, { col: false }); F.box(M.paintDark, 0, 0.55, -0.2, 0.42, 0.42, 0.03, { col: false, rx: -0.12 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.beam(M.steel, [sx * 0.18, 0, sz * 0.18], [sx * 0.18, 0.44, sz * 0.18], 0.012);
  F.collide(0, 0, 0, 0.44, 0.5, 0.44, { surf: SURF.metal, navPad: 0.1 });
}

export function bunk(B, x, y, z, ry = 0) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(M.gunmetal, sx * 0.44, 0, sz * 0.98, 0.04, 1.75, 0.04, { col: false, grime: false });
  for (const [h, blanket] of [[0.35, M.canvasOlive], [1.3, M.canvasTan]]) {
    F.box(M.gunmetal, 0, h, 0, 0.9, 0.035, 1.98, { col: false });
    F.box(M.mattress, 0, h + 0.035, 0, 0.84, 0.11, 1.9, { col: false }); F.box(blanket, 0, h + 0.15, -0.3, 0.86, 0.025, 1.2, { col: false }); F.box(M.mattress, 0, h + 0.15, 0.75, 0.5, 0.08, 0.3, { col: false });
  }
  F.collide(0, 0, 0, 0.92, 1.75, 2.0, { surf: SURF.fabric });
}

export function locker(B, x, y, z, ry = 0, mat) {
  const M = B.M; const F = frame(B, x, y, z, ry); const m = mat || M.paintOlive;
  F.box(m, 0, 0, 0, 0.5, 1.85, 0.5, { grime: false }); F.box(M.gunmetal, 0.12, 1.0, 0.255, 0.02, 0.1, 0.01, { col: false }); F.box(M.gunmetal, 0, 0.02, 0.252, 0.005, 1.8, 0.005, { col: false });
  for (let i = 0; i < 4; i++) F.box(M.black, 0, 1.5 + i * 0.05, 0.253, 0.3, 0.012, 0.005, { col: false });
}

export function shelf(B, x, y, z, ry = 0, w = 2.2, h = 2.1) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(M.paintBlue, sx * (w / 2 - 0.03), 0, sz * 0.27, 0.05, h, 0.05, { col: false, grime: false });
  for (let i = 0; i < 4; i++) {
    const hh = 0.15 + i * (h - 0.25) / 3; F.box(M.woodOld, 0, hh, 0, w, 0.03, 0.6, { col: false });
    if (i < 3) for (let k = 0; k < 3; k++) { if (R() < 0.75) { const s = R.range(0.3, 0.48); const kx = -w / 2 + 0.4 + k * (w - 0.8) / 2 + R.range(-0.1, 0.1); const p = F.pt(kx, hh + 0.03, 0); if (R() < 0.5) crate(B, p.x, p.y, p.z, s, ry + R.range(-0.2, 0.2), R() < 0.5 ? 'wood' : 'ammo'); else F.box(R() < 0.5 ? M.paintOlive : M.canvasTan, kx, hh + 0.03, 0, s, s * 0.8, 0.4, { col: false, grime: false }); } }
  }
  F.collide(0, 0, 0, w, h, 0.62, { surf: SURF.wood });
}

export function laptop(B, x, y, z, ry = 0) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  F.box(M.black, 0, 0, 0, 0.36, 0.02, 0.25, { col: false }); F.box(M.black, 0, 0.02, -0.14, 0.36, 0.24, 0.012, { col: false, rx: -0.25 }); F.box(M.screenOn, 0, 0.035, -0.132, 0.32, 0.2, 0.004, { col: false, rx: -0.25 });
}

export function radioSet(B, x, y, z, ry = 0) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  F.box(M.paintOlive, 0, 0, 0, 0.5, 0.3, 0.32, { col: false, grime: false }); F.box(M.black, 0, 0.05, 0.162, 0.4, 0.2, 0.005, { col: false });
  for (let i = 0; i < 4; i++) F.cyl(M.steel, -0.15 + i * 0.1, 0.2, 0.17, 0.018, 0.02, { axis: 'z', seg: 6, col: false });
  F.beam(M.steel, [0.2, 0.3, -0.1], [0.2, 1.1, -0.1], 0.006); F.box(M.redLight, -0.18, 0.09, 0.166, 0.02, 0.02, 0.004, { col: false });
}

export function mapBoard(B, x, y, z, ry = 0) {
  const M = B.M; const F = frame(B, x, y, z, ry);
  F.box(M.woodOld, 0, 0, 0, 1.8, 1.2, 0.03, { col: false, grime: false }); F.box(M.canvasTan, 0, 0.06, 0.018, 1.66, 1.08, 0.004, { col: false, grime: false });
  for (let i = 0; i < 7; i++) F.box(M.paintWhite, R.range(-0.7, 0.7), R.range(0.15, 0.9), 0.022, R.range(0.12, 0.3), R.range(0.12, 0.24), 0.002, { col: false, rz: R.range(-0.15, 0.15), grime: false });
  for (let i = 0; i < 5; i++) F.box(M.paintRed, R.range(-0.6, 0.6), R.range(0.3, 0.9), 0.024, 0.03, 0.03, 0.004, { col: false });
}

// Tavandan sarkan ampul + ışık
export function hangingBulb(B, x, yCeil, z, o = {}) {
  const M = B.M; const drop = o.drop ?? 0.5;
  B.beam(M.black, x, yCeil, z, x, yCeil - drop, z, 0.006, {}); B.cyl(M.black, x, yCeil - drop - 0.05, z, 0.03, 0.06, { seg: 6, col: false });
  const g = new THREE.SphereGeometry(0.045, 8, 6); B.add(M.bulb, g, B.mat4(x, yCeil - drop - 0.09, z)); g.dispose();
  B.light(x, yCeil - drop - 0.14, z, { intensity: o.intensity ?? 16, dist: o.dist ?? 9, indoor: true });
}

let _rockGeos = null;
function rockGeos() {
  if (_rockGeos) return _rockGeos;
  _rockGeos = [];
  for (let v = 0; v < 4; v++) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const P = g.attributes.position; const tmp = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      tmp.fromBufferAttribute(P, i); const n = noise2(tmp.x * 1.3 + v * 11 + tmp.z * 0.7, tmp.y * 1.3 + tmp.z * 1.1 - v * 5) * 0.34 + noise2(tmp.x * 3.1 + v, tmp.y * 3.1 + tmp.z * 2.7) * 0.12;
      tmp.multiplyScalar(1 + n); tmp.y *= 0.72; if (tmp.y < -0.3) tmp.y = -0.3 + (tmp.y + 0.3) * 0.3;
      P.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    // köşeleri birleştirip yumuşak normal hesapla
    const merged = mergeVerts(g); merged.computeVertexNormals();
    const MP = merged.attributes.position, MN = merged.attributes.normal; const uv = new Float32Array(MP.count * 2);
    for (let i = 0; i < MP.count; i++) { const ax = Math.abs(MN.getX(i)), ay = Math.abs(MN.getY(i)), az = Math.abs(MN.getZ(i)); if (ay > ax && ay > az) { uv[i * 2] = MP.getX(i); uv[i * 2 + 1] = MP.getZ(i); } else if (ax > az) { uv[i * 2] = MP.getZ(i); uv[i * 2 + 1] = MP.getY(i); } else { uv[i * 2] = MP.getX(i); uv[i * 2 + 1] = MP.getY(i); } }
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    _rockGeos.push(merged); g.dispose();
  }
  return _rockGeos;
}
function mergeVerts(g) {
  const P = g.attributes.position; const map = new Map(); const pos = []; const idx = [];
  for (let i = 0; i < P.count; i++) {
    const k = `${Math.round(P.getX(i) * 1000)},${Math.round(P.getY(i) * 1000)},${Math.round(P.getZ(i) * 1000)}`;
    let j = map.get(k); if (j === undefined) { j = pos.length / 3; pos.push(P.getX(i), P.getY(i), P.getZ(i)); map.set(k, j); }
    idx.push(j);
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); return o;
}

export function rock(B, x, z, s = 1, o = {}) {
  const M = B.M; const y = o.y ?? B.terrain.heightAt(x, z); const g = rockGeos()[R.int(0, 3)];
  const sc = new THREE.Vector3(s * R.range(0.8, 1.3), s * R.range(0.7, 1.2), s * R.range(0.8, 1.3));
  B.add(M.rock, g, B.mat4(x, y + s * 0.12, z, R.range(0, 6.28), R.range(-0.2, 0.2), R.range(-0.2, 0.2), sc), { col: s > 0.55, uvS: s, surf: SURF.rock });
  if (s > 0.55 && B.nav) B.nav.blockOBB(x, z, sc.x * 1.7, sc.z * 1.7, 0, 0.25);
}

// Moloz yığını (yıkık duvar)
export function rubble(B, x, z, r = 2.2, n = 26) {
  const M = B.M; const y = B.terrain.heightAt(x, z);
  for (let i = 0; i < n; i++) {
    const a = R.range(0, 6.28), d = Math.sqrt(R()) * r; const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; const hgt = (1 - d / r) * 0.5;
    const s = R.range(0.15, 0.5);
    if (R() < 0.6) B.box(R() < 0.5 ? M.cmu : M.concrete, px, y + hgt * R.range(0, 1) - 0.05, pz, s * 1.4, s * 0.6, s, { ry: R.range(0, 6), rx: R.range(-0.5, 0.5), rz: R.range(-0.5, 0.5), col: false, grime: false });
    else B.add(M.rock, rockGeos()[R.int(0, 3)], B.mat4(px, y + hgt * 0.5, pz, R.range(0, 6), 0, 0, s * 0.7), { uvS: s });
  }
  B.collide(x, y, z, r * 1.1, 0.3, r * 1.1, { surf: SURF.concrete, nav: false, ry: 0.5 });
}

// Jiletli tel sarmalı (duvar üstü)
export function razorWire(B, x1, y, z1, x2, z2) {
  const M = B.M; const dx = x2 - x1, dz = z2 - z1; const len = Math.hypot(dx, dz); const ry = Math.atan2(-dz, dx);
  const g = new THREE.TorusGeometry(0.3, 0.007, 3, 12); g.rotateY(Math.PI / 2);
  const n = Math.floor(len / 0.42);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; B.add(M.galvanized, g, B.mat4(x1 + dx * t, y + 0.3, z1 + dz * t, ry + ((i & 1) ? 0.5 : -0.5), 0, (i % 3) * 0.3)); }
  B.beam(M.galvanized, x1, y + 0.3, z1, x2, y + 0.3, z2, 0.006, {});
  g.dispose();
}

export function powerPole(B, x, z, ry = 0, h = 8.5) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry);
  F.cyl(M.woodDark, 0, 0, 0, 0.13, h, { seg: 8, rTop: 0.09, navPad: 0.1 }); F.box(M.woodDark, 0, h - 0.7, 0, 2.0, 0.1, 0.1, { col: false });
  for (const lx of [-0.9, 0, 0.9]) F.cyl(M.paintWhite, lx, h - 0.6, 0, 0.035, 0.12, { seg: 6, col: false });
  return [F.pt(-0.9, h - 0.46, 0), F.pt(0, h - 0.46, 0), F.pt(0.9, h - 0.46, 0)];
}
export function cable(B, a, b, sag = 0.9) {
  const M = B.M; const n = 7; let px = a.x, py = a.y, pz = a.z;
  for (let i = 1; i <= n; i++) { const t = i / n; const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t); B.beam(M.black, px, py, pz, x, y, z, 0.012, {}); px = x; py = y; pz = z; }
}

// Bekçi kulübesi
export function guardBooth(B, x, z, ry = 0) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry);
  F.box(M.concrete, 0, 0, 0, 2.4, 0.12, 2.4, {});
  F.box(M.plasterGrey, 0, 0.12, -1.1, 2.2, 2.3, 0.14, {}); F.box(M.plasterGrey, -1.03, 0.12, 0, 0.14, 2.3, 2.06, {});
  F.box(M.plasterGrey, 1.03, 0.12, 0, 0.14, 1.0, 2.06, {}); F.box(M.plasterGrey, 1.03, 1.95, 0, 0.14, 0.47, 2.06, { nav: false });
  F.box(M.plasterGrey, -0.7, 0.12, 1.1, 0.8, 2.3, 0.14, {}); F.box(M.plasterGrey, 0.75, 0.12, 1.1, 0.7, 1.0, 0.14, {}); F.box(M.plasterGrey, 0.35, 2.1, 1.1, 1.5, 0.32, 0.14, { nav: false });
  F.box(M.roofMetal, 0, 2.42, 0, 2.9, 0.05, 2.9, { rx: 0.05, nav: false });
  F.box(M.woodOld, 0.6, 0.85, -0.6, 0.6, 0.04, 0.9, { col: false });
  return F.pt(0, 2.3, 0);
}

// Kayar çelik kapı (yarı açık) ve bariyer kolu
export function gate(B, x, z, ry, width, openFrac = 0.6) {
  const M = B.M; const y = B.terrain.heightAt(x, z); const F = frame(B, x, y, z, ry); const gw = width + 0.4, gh = 2.8;
  const off = -width * openFrac - 0.6;
  F.box(M.wallMetalGreen, off, 0.12, 0.35, gw, gh - 0.2, 0.05, { grime: true, surf: SURF.metal });
  for (const lx of [-gw / 2, 0, gw / 2]) F.box(M.gunmetal, off + lx, 0.08, 0.35, 0.09, gh, 0.09, { col: false });
  F.box(M.gunmetal, off, 0.08, 0.35, gw, 0.09, 0.09, { col: false }); F.box(M.gunmetal, off, gh, 0.35, gw, 0.09, 0.09, { col: false });
  F.box(M.steel, 0, 0, 0.35, width * 2 + 2, 0.04, 0.08, { col: false });
  // bariyer
  F.box(M.paintDark, width / 2 - 0.5, 0, -1.8, 0.3, 1.1, 0.3, {});
  F.box(M.paintWhite, width / 2 - 0.5 - 2.6, 1.02, -1.8, 5.4, 0.1, 0.1, { rz: -1.05, col: false });
  for (let i = 0; i < 4; i++) F.box(M.paintRed, width / 2 - 0.5 - (0.7 + i * 1.25) * Math.cos(1.05), 1.02 + (0.7 + i * 1.25) * Math.sin(1.05), -1.8, 0.5, 0.104, 0.104, { rz: -1.05, col: false });
}
