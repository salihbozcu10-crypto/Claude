// Harekât bölgesi: "Sessiz Vadi" — duvarlarla çevrili eski tesis ve çevresi.
// Koordinatlar metre; +X doğu, +Z güney. Kamp merkezi (0,0), zemin kotu 0.
import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { NavGrid } from './nav.js';
import { Builder } from './builder.js';
import { makeTerrainMaterial, SURF } from '../gfx/materials.js';
import { makeRng } from '../core/utils.js';
import * as P from './props.js';
import { addTreeTrunks, createVegetation } from './vegetation.js';

const R = makeRng(20261);

// Açıklıklı duvar. axis 'x': x boyunca uzanır (sabit z = c); axis 'z': z boyunca (sabit x = c)
function wallRun(B, mat, axis, a0, a1, c, y0, h, t, ops = [], o = {}) {
  const seg = (a, b, y, hh) => {
    if (b - a < 0.01 || hh < 0.01) return;
    const opt = { htBase: o.htBase ?? y0, htTotal: o.htTotal ?? h, grime: true, nav: o.nav };
    if (axis === 'x') B.box(mat, (a + b) / 2, y, c, b - a, hh, t, opt); else B.box(mat, c, y, (a + b) / 2, t, hh, b - a, opt);
  };
  let cur = a0;
  for (const op of [...ops].sort((p, q) => p.a - q.a)) {
    seg(cur, op.a, y0, h);
    seg(op.a, op.b, y0, op.y0);
    seg(op.a, op.b, y0 + op.y1, h - op.y1);
    cur = op.b;
    trim(B, axis, op, c, y0, t, o);
  }
  seg(cur, a1, y0, h);
}

// Pencere / kapı süsleri: denizlik, kasa, parmaklık, kepenk, kapı kanadı
function trim(B, axis, op, c, y0, t, o) {
  const M = B.M; const mid = (op.a + op.b) / 2, w = op.b - op.a; const frameMat = op.frame === 'metal' ? M.gunmetal : M.woodDark;
  const bx = (mat, along, y, across, sa, sy, sc, opt = {}) => { if (axis === 'x') B.box(mat, along, y, c + across, sa, sy, sc, { col: false, grime: false, ...opt }); else B.box(mat, c + across, y, along, sc, sy, sa, { col: false, grime: false, ...opt }); };
  const yb = y0 + op.y0, yt = y0 + op.y1;
  if (op.kind === 'window') {
    bx(M.concrete, mid, yb - 0.06, 0, w + 0.16, 0.06, t + 0.14);
    bx(frameMat, op.a + 0.025, yb, 0, 0.05, yt - yb, 0.08); bx(frameMat, op.b - 0.025, yb, 0, 0.05, yt - yb, 0.08); bx(frameMat, mid, yt - 0.05, 0, w, 0.05, 0.08);
    if (op.bars) { const n = Math.round(w / 0.14); for (let i = 1; i < n; i++) { const a = op.a + i * w / n; if (axis === 'x') B.beam(M.gunmetal, a, yb, c, a, yt, c, 0.009, { round: true, seg: 5 }); else B.beam(M.gunmetal, c, yb, a, c, yt, a, 0.009, { round: true, seg: 5 }); } bx(M.gunmetal, mid, (yb + yt) / 2, 0, w, 0.02, 0.02); }
    else { bx(frameMat, mid, yb, 0, 0.04, yt - yb, 0.06); if (op.glass) bx(M.glass, mid, yb, 0, w - 0.1, yt - yb - 0.05, 0.012); }
    if (op.shutter) { const s = op.shutter; bx(M.woodOld, s > 0 ? op.b + w / 4 : op.a - w / 4, yb, (o.out ?? 1) * (t / 2 + 0.03), w / 2, yt - yb, 0.035, { uvRot: false }); }
    if (op.boards) for (let i = 0; i < 3; i++) bx(M.woodOld, mid, yb + 0.12 + i * (yt - yb - 0.3) / 2, (o.out ?? 1) * (t / 2 + 0.02), w + 0.3, 0.14, 0.025, { rz: 0 });
  } else if (op.kind === 'door') {
    bx(frameMat, op.a + 0.03, yb, 0, 0.06, yt - yb, t + 0.04); bx(frameMat, op.b - 0.03, yb, 0, 0.06, yt - yb, t + 0.04); bx(frameMat, mid, yt - 0.06, 0, w, 0.06, t + 0.04);
    if (op.leaf) { // açık kapı kanadı (menteşe a ucunda), duvara doğru açılmış
      const ang = op.leaf; const lw = w - 0.12; const dir = (o.out ?? 1);
      const hx = op.a + 0.06, hz = dir * t / 2;
      const cx = hx + Math.cos(ang) * lw / 2, cz = hz + dir * Math.sin(ang) * lw / 2;
      const mat = op.frame === 'metal' ? M.paintDark : M.woodOld;
      if (axis === 'x') B.box(mat, cx, yb, c + cz, lw, yt - yb - 0.06, 0.045, { ry: -dir * ang, grime: false, uvRot: true, surf: op.frame === 'metal' ? SURF.metal : SURF.wood, navPad: 0.05 });
      else B.box(mat, c + cz, yb, cx, 0.045, yt - yb - 0.06, lw, { ry: dir * ang, grime: false, surf: op.frame === 'metal' ? SURF.metal : SURF.wood, navPad: 0.05 });
    }
  }
}
const door = (a, w = 1.0, o = {}) => ({ a, b: a + w, y0: o.y0 ?? 0.15, y1: o.y1 ?? 2.25, kind: 'door', ...o });
const win = (a, w = 1.2, o = {}) => ({ a, b: a + w, y0: o.y0 ?? 1.15, y1: o.y1 ?? 2.35, kind: 'window', ...o });

// Kapı eşiği için görünmez küçük rampa (kapsülün takılmaması için)
function sill(B, axis, along, c, dir, w = 1.2, rise = 0.15) {
  const len = 0.7; const ang = Math.atan2(rise, len);
  if (axis === 'x') B.collide(along, rise / 2 - 0.06, c + dir * len / 2, w, 0.06, len + 0.1, { rx: dir * ang, nav: false });
  else B.collide(c + dir * len / 2, rise / 2 - 0.06, along, len + 0.1, 0.06, w, { rz: -dir * ang, nav: false });
}

function perimeterWall(B, axis, a0, a1, c, h = 3.2, wire = true) {
  const M = B.M;
  wallRun(B, M.cmu, axis, a0, a1, c, 0, h, 0.3);
  const n = Math.max(1, Math.round((a1 - a0) / 8));
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; if (axis === 'x') B.box(M.concrete, a, 0, c, 0.5, h + 0.2, 0.5, { nav: false }); else B.box(M.concrete, c, 0, a, 0.5, h + 0.2, 0.5, { nav: false }); }
  if (axis === 'x') B.box(M.concrete, (a0 + a1) / 2, h, c, a1 - a0, 0.09, 0.42, { col: false, grime: false }); else B.box(M.concrete, c, h, (a0 + a1) / 2, 0.42, 0.09, a1 - a0, { col: false, grime: false });
  if (wire) { if (axis === 'x') P.razorWire(B, a0 + 0.4, h + 0.09, c, a1 - 0.4, c); else P.razorWire(B, c, h + 0.09, a0 + 0.4, c, a1 - 0.4); }
}

// Basamaklı merdiven (x boyunca yükselir) + pürüzsüz çarpışma rampası
function stairsX(B, x0, z, y0, y1, steps, width, mat) {
  const rise = (y1 - y0) / steps, run = 0.3;
  for (let i = 0; i < steps; i++) B.box(mat, x0 + (i + 0.5) * run, y0, z, run, (i + 1) * rise, width, { col: false, grime: false });
  const len = Math.hypot(steps * run, y1 - y0), ang = Math.atan2(y1 - y0, steps * run);
  B.collide(x0 + steps * run / 2, (y0 + y1) / 2 - 0.09, z, len, 0.1, width, { rz: ang, nav: false });
  B.collide(x0 + steps * run - 0.2, y0, z, 0.4, y1 - y0 - 0.02, width, { nav: false }); // üst basamağın altı dolu
  B.nav.blockOBB(x0 + steps * run / 2, z, steps * run, width, 0, 0.25);
}

export async function createWorld({ T, M, quality, onProgress }) {
  const data = { enemies: [], objectives: {}, emitters: [], fires: [], barrels: [], covers: [] };

  // ---------------------------------------------------------------- arazi
  const feat = {
    flats: [{ x: 0, z: 0, hw: 70, hd: 58, y: 0, blend: 34 }],
    road: { pts: [[0, 50], [0, 78], [-14, 112], [-30, 150], [-42, 230], [-20, 420]], w: 5 },
    wadi: { pts: [[-300, 230], [-190, 130], [-118, 78], [-90, 22], [-98, -60], [-150, -170], [-210, -330]], w: 9, depth: 2.7 },
    bumps: [{ x: 6, z: 176, h: 6.5, r: 40 }],
  };
  const probe = Object.create(Terrain.prototype); probe.feat = feat;
  const LZ = { x: -152, z: 34 }; LZ.y = probe.rawHeight(LZ.x, LZ.z) + 0.6;
  feat.flats.push({ x: LZ.x, z: LZ.z, r: 13, y: LZ.y, blend: 20 });
  const startY = probe.rawHeight(6, 172);
  feat.flats.push({ x: 6, z: 172, r: 5, y: startY - 0.3, blend: 14 });
  const terrain = new Terrain(feat, { segs: quality.terrainSegs || 256 });
  const nav = new NavGrid(-190, -110, 300, 300, 0.5);
  const B = new Builder(M, terrain, nav);

  const ctrl = terrain.buildControlMap((c) => {
    c.rect(0, 0, 62, 50, 'rgba(150,0,0,1)', 5);                       // avlu: sıkışmış toprak
    c.line(feat.road.pts, 5.5, 'rgba(200,0,0,1)', 0.35);              // yol
    c.line(feat.road.pts.map((p) => [p[0] - 0.95, p[1]]), 0.5, 'rgba(0,0,90,1)', 0.5); c.line(feat.road.pts.map((p) => [p[0] + 0.95, p[1]]), 0.5, 'rgba(0,0,90,1)', 0.5);
    c.line(feat.wadi.pts, 10, 'rgba(0,170,0,1)', 0.4);                // dere yatağı: çakıl
    c.rect(13, 19, 14, 12, 'rgba(0,120,0,1)', 3);                     // araç parkı çakılı
    c.line([[0, 50], [2, 30], [10, 18]], 0.5, 'rgba(0,0,110,1)', 0.6); c.line([[1.9, 50], [4, 30], [12, 18]], 0.5, 'rgba(0,0,110,1)', 0.6);
    c.line([[0, 50], [0, 0], [28, -29]], 4.5, 'rgba(90,0,0,1)', 0.5); c.line([[0, 0], [-30, -24]], 3, 'rgba(70,0,0,1)', 0.5);
    for (const [x, z, r] of [[7, 15, 1.6], [14, 23, 1.3], [22, 12, 2.0], [-22, 27, 2.6], [20, -3, 1.4], [-30, -40, 1.2]]) c.blob(x, z, r, 'rgba(0,0,150,1)');
    c.blob(LZ.x, LZ.z, 16, 'rgba(110,0,0,1)');
    for (let i = 0; i < 60; i++) c.blob(R.range(-300, 300), R.range(-300, 300), R.range(5, 22), 'rgba(0,70,0,1)');
  });
  const terrMat = makeTerrainMaterial(T, ctrl, terrain.ctrlSize, !!quality.terrainLow);
  const terrMesh = terrain.buildMesh(terrMat);
  B.group.add(terrMesh);

  // ---------------------------------------------------------------- çevre duvarı
  perimeterWall(B, 'x', -64, -8, 52); perimeterWall(B, 'x', 8, 64, 52);
  perimeterWall(B, 'x', -64, 26, -52, 3.2, false); perimeterWall(B, 'x', 34, 64, -52, 3.2, false);
  perimeterWall(B, 'z', -52, 5, -64); perimeterWall(B, 'z', 15, 52, -64);
  perimeterWall(B, 'z', -52, 52, 64, 3.2, false);
  // batı duvarındaki yıkık gedik
  B.box(M.cmu, -64, 0, 5.8, 0.3, 2.1, 1.4, { grime: true }); B.box(M.cmu, -64, 0, 7.1, 0.3, 1.0, 1.2, {}); B.box(M.cmu, -64, 0, 14.3, 0.3, 1.7, 1.3, {}); B.box(M.cmu, -64, 0, 13.2, 0.3, 0.7, 1.0, {});
  P.rubble(B, -64.6, 10, 3.4, 44); P.rubble(B, -62.6, 8.4, 1.6, 14);
  // ana kapı
  for (const sx of [-1, 1]) { B.box(M.concrete, sx * 8, 0, 52, 0.9, 3.9, 0.9, {}); B.box(M.concrete, sx * 8, 3.9, 52, 1.1, 0.14, 1.1, { col: false }); }
  P.gate(B, 0, 52, 0, 16, 0.62);
  const booth = P.guardBooth(B, -11.5, 47.2, 0);
  B.light(booth.x, booth.y - 0.2, booth.z, { intensity: 10, dist: 7, indoor: true });
  // arka kapı (kapalı sac kapı)
  B.box(M.wallMetalGreen, 30, 0.1, -52, 8, 2.9, 0.06, { grime: true, surf: SURF.metal });
  for (const a of [26.2, 30, 33.8]) B.box(M.gunmetal, a, 0, -52, 0.12, 3.1, 0.12, { col: false }); B.box(M.gunmetal, 30, 2.95, -52, 8, 0.1, 0.1, { col: false });

  // ---------------------------------------------------------------- KARARGÂH (2 kat)
  {
    const X0 = -10, X1 = 10, Z0 = -42, Z1 = -28, t = 0.3, H = 6.5; const wm = M.plaster; const W = { htBase: 0, htTotal: H };
    B.box(M.concrete, 0, -0.4, -35, 20.5, 0.55, 14.5, { nav: false, grime: false }); B.floor(X0, Z0, X1, Z1, 0.15);
    B.box(M.floor, 0, 0.13, -35, 19.4, 0.02, 13.4, { col: false });
    // 1. kat dış duvarları
    wallRun(B, wm, 'x', X0, X1, Z1 - t / 2, 0, 3.2, t, [win(-7, 1.4, { shutter: -1 }), door(-0.9, 1.8, { y1: 2.4 }), win(5.6, 1.4, { glass: true })], { ...W, out: 1 });
    wallRun(B, wm, 'x', X0, X1, Z0 + t / 2, 0, 3.2, t, [win(-7, 1.4, { bars: true }), win(-1.5, 1.2, { boards: true })], { ...W, out: -1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X0 + t / 2, 0, 3.2, t, [win(-36, 1.4, { bars: true })], { ...W, out: -1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X1 - t / 2, 0, 3.2, t, [door(-32.5, 1.0, { leaf: 1.9 }), win(-38, 1.2, { glass: true })], { ...W, out: 1 });
    sill(B, 'x', 0, Z1, 1, 2.2); sill(B, 'z', -32, X1, 1, 1.4);
    // 2. kat dış duvarları
    wallRun(B, wm, 'x', X0, X1, Z1 - t / 2, 3.2, 3.3, t, [win(-7, 1.4, { y0: 1.25, y1: 2.5, glass: true }), win(-0.7, 1.4, { y0: 1.25, y1: 2.5 }), win(5.6, 1.4, { y0: 1.25, y1: 2.5, shutter: 1 })], { ...W, out: 1 });
    wallRun(B, wm, 'x', X0, X1, Z0 + t / 2, 3.2, 3.3, t, [win(-7, 1.4, { y0: 1.25, y1: 2.5 }), win(5.2, 1.4, { y0: 1.25, y1: 2.5, glass: true })], { ...W, out: -1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X0 + t / 2, 3.2, 3.3, t, [win(-36, 1.4, { y0: 1.25, y1: 2.5 })], { ...W, out: -1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X1 - t / 2, 3.2, 3.3, t, [win(-35, 1.4, { y0: 1.25, y1: 2.5, glass: true })], { ...W, out: 1 });
    // iç bölmeler
    wallRun(B, M.plasterIn, 'x', X0 + t, 3.0, -35, 0.15, 3.05, 0.2, [door(-4.6, 1.0, { y0: 0, y1: 2.1, leaf: 1.4 })], { out: 1 });
    wallRun(B, M.plasterIn, 'z', Z0 + t, Z1 - t, -2, 3.45, 3.05, 0.2, [door(-34.2, 1.0, { y0: 0, y1: 2.1, leaf: 1.7 })], { out: 1 });
    // 2. kat döşemesi (merdiven boşluklu) ve çatı
    const slab = (x0, x1, z0, z1) => B.box(M.concrete, (x0 + x1) / 2, 3.2, (z0 + z1) / 2, x1 - x0, 0.25, z1 - z0, { nav: false, grime: false });
    slab(X0 + t, 3.3, Z0 + t, Z1 - t); slab(3.3, 8.4, -40.4, Z1 - t); slab(8.4, X1 - t, Z0 + t, Z1 - t);
    B.box(M.floor, -3.3, 3.45, -35, 12.8, 0.012, 13.3, { col: false }); B.box(M.floor, 6.4, 3.45, -34.3, 6.6, 0.012, 12, { col: false });
    stairsX(B, 3.3, -41.05, 0.15, 3.45, 17, 1.25, M.concrete);
    // merdiven boşluğu korkuluğu
    for (const [x, z] of [[3.3, -40.35], [5.0, -40.35], [6.7, -40.35], [8.35, -40.35], [3.3, -41.6]]) B.beam(M.gunmetal, x, 3.45, z, x, 4.45, z, 0.02, {});
    for (const hh of [3.95, 4.45]) { B.beam(M.gunmetal, 3.3, hh, -40.35, 8.35, hh, -40.35, 0.018, {}); B.beam(M.gunmetal, 3.3, hh, -40.35, 3.3, hh, -41.6, 0.018, {}); }
    B.collide(5.85, 3.45, -40.35, 5.1, 1.0, 0.06, { surf: SURF.metal, nav: false }); B.collide(3.3, 3.45, -41, 0.06, 1.0, 1.3, { surf: SURF.metal, nav: false });
    B.box(M.concrete, 0, H, -35, 20.4, 0.25, 14.4, { nav: false, grime: false });
    // çatı korkuluğu
    wallRun(B, wm, 'x', X0, X1, Z1 - 0.1, H + 0.25, 0.75, 0.2, [], { nav: false }); wallRun(B, wm, 'x', X0, X1, Z0 + 0.1, H + 0.25, 0.75, 0.2, [], { nav: false });
    wallRun(B, wm, 'z', Z0 + 0.2, Z1 - 0.2, X0 + 0.1, H + 0.25, 0.75, 0.2, [], { nav: false }); wallRun(B, wm, 'z', Z0 + 0.2, Z1 - 0.2, X1 - 0.1, H + 0.25, 0.75, 0.2, [], { nav: false });
    // giriş saçağı
    B.box(M.concrete, 0, 2.75, -26.6, 5.2, 0.16, 2.8, { nav: false, grime: false });
    for (const sx of [-1, 1]) B.box(M.concrete, sx * 2.3, 0, -25.5, 0.3, 2.75, 0.3, {});
    B.box(M.concrete, 0, 0, -27.2, 3.2, 0.15, 1.6, { nav: false, grime: false });
    // çatı: kum torbası mevzisi, anten, klima
    const ry0 = H + 0.25;
    P.sandbags(B, -9.5, -30.4, -6.2, -30.4, 3, ry0, { nav: false }); P.sandbags(B, -6.2, -30.2, -6.2, -28.5, 3, ry0, { nav: false });
    B.beam(M.steel, 7, ry0, -39, 7, ry0 + 5.5, -39, 0.03, { round: true }); B.beam(M.steel, 6.2, ry0 + 4.6, -39, 7.8, ry0 + 4.6, -39, 0.012, {}); B.beam(M.steel, 6.5, ry0 + 5.0, -39, 7.5, ry0 + 5.0, -39, 0.012, {});
    B.cyl(M.paintWhite, 4, ry0 + 0.9, -38.5, 0.6, 0.16, { axis: 'z', seg: 14, rTop: 0.14, col: false, ry: 0.6 }); B.beam(M.steel, 4, ry0, -38.5, 4, ry0 + 0.9, -38.5, 0.03, {});
    B.box(M.paintWhite, 2, ry0, -31, 1.0, 0.7, 0.5, { nav: false, grime: true }); B.box(M.black, 2, ry0 + 0.15, -30.74, 0.7, 0.4, 0.02, { col: false });
    // mobilya — 1. kat
    P.table(B, -5.5, 0.15, -39, 0, 2.2, 1.0); P.radioSet(B, -6.1, 0.915, -39.1, 0.1); P.laptop(B, -4.9, 0.915, -38.9, -0.3);
    P.chair(B, -5.6, 0.15, -38.0, 3.2); P.chair(B, -4.4, 0.15, -37.9, 2.9);
    P.mapBoard(B, -9.66, 1.2, -38.6, Math.PI / 2); P.locker(B, -9.3, 0.15, -36.0, Math.PI / 2); P.locker(B, -9.3, 0.15, -35.45, Math.PI / 2);
    P.table(B, -6.5, 0.15, -31, 0, 1.8, 0.8); P.chair(B, -7, 0.15, -30.1, 3.1); P.chair(B, -6, 0.15, -31.9, 0.2);
    P.crateStack(B, 8.6, -29.6, 0.2, 2, 0.15); P.crate(B, 7.5, 0.15, -29.4, 0.8, 0.5, 'ammo'); P.shelf(B, -1.0, 0.15, -34.5, 0, 2.0, 2.0);
    P.barrel(B, 9.0, 0.15, -38.4, M.paintBlue);
    P.hangingBulb(B, 0.5, 3.2, -31.2); P.hangingBulb(B, -5.2, 3.2, -38.6, { intensity: 14 });
    // mobilya — 2. kat (komutan odası: istihbarat)
    const y2 = 3.45;
    P.table(B, -7.2, y2, -39.2, 0, 2.0, 0.9); P.laptop(B, -7.2, y2 + 0.765, -39.2, 0); P.chair(B, -7.2, y2, -38.2, 3.14);
    P.mapBoard(B, -5.5, y2 + 1.1, -41.66, 0); P.locker(B, -9.3, y2, -30.2, Math.PI / 2, M.paintDark); P.shelf(B, -2.5, y2, -30.5, Math.PI / 2, 1.8, 1.9);
    P.bunk(B, -8.9, y2, -33.5, 0); P.crate(B, -4, y2, -40.6, 0.8, 0.2, 'ammo');
    P.table(B, 6, y2, -30, 0, 1.6, 0.8); P.radioSet(B, 6.2, y2 + 0.765, -30.1, 3.0); P.chair(B, 6, y2, -31, 3.14); P.crateStack(B, 8.8, -36, 0.1, 2, y2);
    P.hangingBulb(B, -6, H, -36, { intensity: 14 }); P.hangingBulb(B, 5, H, -33.5, { intensity: 12 });
    data.objectives.intel = { x: -7.2, y: y2 + 0.9, z: -39.2 };
    data.enemies.push({ x: 0, z: -31.5, yaw: 0, role: 'guard' }, { x: -6.4, z: -37.4, yaw: 3.0, role: 'idle' },
      { x: -5.5, z: -36, y: y2, yaw: 1.6, role: 'static' }, { x: 5.5, z: -32.5, y: y2, yaw: 3.1, role: 'static' },
      { x: -8, z: -29.3, y: ry0, yaw: 3.14, role: 'static', elevated: true });
  }

  // ---------------------------------------------------------------- KIŞLA
  {
    const X0 = -54, X1 = -32, Z0 = -32, Z1 = -22, t = 0.3, H = 3.0; const wm = M.plasterOchre;
    B.box(M.concrete, -43, -0.4, -27, 22.5, 0.55, 10.5, { nav: false, grime: false }); B.floor(X0, Z0, X1, Z1, 0.15); B.box(M.floor, -43, 0.13, -27, 21.4, 0.02, 9.4, { col: false });
    wallRun(B, wm, 'x', X0, X1, Z1 - t / 2, 0, H, t, [door(-50.2, 1.0, { leaf: 2.0 }), win(-46.4, 1.3), win(-42.4, 1.3, { shutter: 1 }), door(-37.6, 1.0)], { out: 1 });
    wallRun(B, wm, 'x', X0, X1, Z0 + t / 2, 0, H, t, [win(-51.4, 1.2, { bars: true }), win(-44.4, 1.2), win(-37.4, 1.2, { boards: true })], { out: -1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X0 + t / 2, 0, H, t, [win(-27.6, 1.2)], { out: -1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X1 - t / 2, 0, H, t, [win(-27.6, 1.2, { glass: true })], { out: 1 });
    wallRun(B, M.plasterIn, 'z', Z0 + t, Z1 - t, -40, 0.15, H - 0.15, 0.2, [door(-27.6, 1.0, { y0: 0, y1: 2.1 })], {});
    sill(B, 'x', -49.7, Z1, 1); sill(B, 'x', -37.1, Z1, 1);
    // hafif eğimli sac çatı + mertekler + alın tahtası
    B.box(M.roofMetal, -43, 3.36, -27, 23.4, 0.05, 11.6, { rx: 0.05, nav: false, grime: false });
    for (let x = -53; x <= -33; x += 2.5) B.box(M.woodDark, x, 3.22, -27, 0.07, 0.14, 11.2, { rx: 0.05, col: false, grime: false });
    B.box(M.woodDark, -43, 2.98, -21.25, 23.4, 0.34, 0.04, { col: false }); B.box(M.woodDark, -43, 3.3, -32.75, 23.4, 0.5, 0.04, { col: false });
    for (const x of [X0 - 0.7, X1 + 0.7]) B.box(M.woodDark, x, 3.0, -27, 0.04, 0.75, 11.5, { col: false });
    for (const x of [X0 + 0.15, X1 - 0.15]) B.box(wm, x, 3.0, -27, 0.3, 0.55, 10, { col: false, grime: false });
    B.box(wm, -43, 3.0, Z0 + 0.15, 22, 0.55, 0.3, { col: false, grime: false });
    for (const x of [-52.9, -50.6, -48.3, -46.0, -43.7]) P.bunk(B, x, 0.15, -30.6, 0);
    P.locker(B, -53.3, 0.15, -24.2, Math.PI / 2); P.locker(B, -53.3, 0.15, -24.75, Math.PI / 2); P.locker(B, -41, 0.15, -22.7, Math.PI);
    P.table(B, -36, 0.15, -27.5, 0.1, 1.8, 0.9); P.chair(B, -36.5, 0.15, -26.5, 3.0); P.chair(B, -35.4, 0.15, -28.5, 0.1); P.chair(B, -34.6, 0.15, -27.3, -1.5);
    P.crate(B, -33.2, 0.15, -31, 0.9, 0.3, 'wood'); P.barrel(B, -33, 0.15, -23.2, M.paintOlive); P.radioSet(B, -36.2, 0.915, -27.4, 0.4);
    P.hangingBulb(B, -47, 3.15, -27, { intensity: 15 }); P.hangingBulb(B, -36, 3.15, -27, { intensity: 13 });
    data.enemies.push({ x: -47, z: -26.5, yaw: 1.2, role: 'idle' }, { x: -35.6, z: -25.4, yaw: -2, role: 'idle' }, { x: -44, z: -19.5, yaw: 2.2, role: 'guard' });
  }

  // ---------------------------------------------------------------- DEPO (cephanelik)
  {
    const X0 = 30, X1 = 52, Z0 = -40, Z1 = -18, t = 0.24, H = 6.0; const wm = M.wallMetal; const W = { htBase: 0, htTotal: H };
    B.box(M.concreteDark, 41, -0.4, -29, 22.4, 0.5, 22.4, { nav: false, grime: false }); B.floor(X0, Z0, X1, Z1, 0.1); B.box(M.floor, 41, 0.09, -29, 21.6, 0.012, 21.6, { col: false });
    const hi = (a) => ({ a, b: a + 3, y0: 4.2, y1: 5.2, kind: 'window', frame: 'metal' });
    wallRun(B, wm, 'x', X0, X1, Z1 - t / 2, 0, H, t, [door(45.5, 1.0, { frame: 'metal', leaf: 1.8, y0: 0.1 }), hi(32.5), hi(38.5), hi(47.5)], { ...W, out: 1 });
    wallRun(B, wm, 'x', X0, X1, Z0 + t / 2, 0, H, t, [hi(32.5), hi(38.5), hi(44.5)], { ...W, out: -1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X1 - t / 2, 0, H, t, [], W);
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X0 + t / 2, 0, H, t, [{ a: -32, b: -26, y0: 0.1, y1: 4.6, kind: 'none' }], W);
    sill(B, 'x', 46, Z1, 1, 1.4, 0.1); B.collide(29.6, -0.01, -29, 1.0, 0.06, 6.2, { rz: 0.1, nav: false });
    // beton etek + kayar kapı kanatları + ray
    for (const [x, z, sx, sz] of [[41, Z1 + 0.03, 22.3, 0.1], [41, Z0 - 0.03, 22.3, 0.1], [X1 + 0.03, -29, 0.1, 22.3]]) B.box(M.cmu, x, 0, z, sx, 1.1, sz, { col: false, grime: true });
    B.box(M.cmu, X0 - 0.03, 0, -36, 0.1, 1.1, 8, { col: false }); B.box(M.cmu, X0 - 0.03, 0, -22, 0.1, 1.1, 8, { col: false });
    B.box(M.wallMetalGreen, 29.7, 0.15, -34.6, 0.07, 4.6, 3.1, { grime: true, surf: SURF.metal }); B.box(M.wallMetalGreen, 29.7, 0.15, -23.4, 0.07, 4.6, 3.1, { grime: true, surf: SURF.metal });
    B.box(M.gunmetal, 29.7, 4.78, -29, 0.1, 0.1, 13, { col: false });
    // beşik çatı (mahya x boyunca), kalkan duvarları, makaslar
    const pitch = Math.atan2(2.3, 11.3), sl = Math.hypot(2.3, 11.3) + 0.5;
    B.box(M.roofMetal, 41, 7.12, -23.2, 23.4, 0.05, sl, { rx: pitch, nav: false, grime: false, surf: SURF.metal });
    B.box(M.roofMetal, 41, 7.12, -34.8, 23.4, 0.05, sl, { rx: -pitch, nav: false, grime: false, surf: SURF.metal });
    B.box(M.galvanized, 41, 8.3, -29, 23.5, 0.06, 0.5, { col: false, grime: false });
    for (const gx of [X0 + t / 2, X1 - t / 2]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 11, 0, 0, -11, 0, 2.3, 0, 0, 0, -11, 0, 0, 11, 0, 2.3, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([11, 0, -11, 0, 0, 2.3, -11, 0, 11, 0, 0, 2.3], 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0], 3));
      B.add(wm, g, B.mat4(gx, H, -29), { col: true });
    }
    for (const tx of [35.5, 41, 46.5]) {
      B.beam(M.gunmetal, tx, 6.0, -39.7, tx, 6.0, -18.3, 0.06, {}); B.beam(M.gunmetal, tx, 6.0, -39.7, tx, 8.2, -29, 0.05, {}); B.beam(M.gunmetal, tx, 6.0, -18.3, tx, 8.2, -29, 0.05, {});
      B.beam(M.gunmetal, tx, 6.0, -29, tx, 8.2, -29, 0.04, {}); B.beam(M.gunmetal, tx, 6.0, -34.3, tx, 7.1, -34.3, 0.035, {}); B.beam(M.gunmetal, tx, 6.0, -23.7, tx, 7.1, -23.7, 0.035, {});
      for (const z of [-39.6, -18.4]) B.box(M.gunmetal, tx, 0.1, z, 0.22, 5.9, 0.22, { grime: false, navPad: 0.15 });
      P.hangingBulb(B, tx, 6.0, -29, { drop: 1.3, intensity: 26, dist: 13 });
    }
    // içerik: raflar, sandıklar, variller, paletler
    P.shelf(B, 34, 0.1, -39.2, 0, 2.6, 2.6); P.shelf(B, 37.2, 0.1, -39.2, 0, 2.6, 2.6); P.shelf(B, 51.2, 0.1, -24, Math.PI / 2, 2.6, 2.6); P.shelf(B, 51.2, 0.1, -27.2, Math.PI / 2, 2.6, 2.6);
    for (const [x, z, n] of [[44, -35, 3], [45.3, -35.2, 2], [44.2, -33.6, 2], [46.4, -34.2, 3], [40, -21, 2], [34, -21.5, 3], [35.4, -21.2, 2], [49, -37.5, 3], [33, -31, 2]]) { P.pallet(B, x, 0.1, z, R.range(-0.1, 0.1)); P.crateStack(B, x, z, R.range(-0.3, 0.3), n, 0.22); }
    for (const [x, z] of [[50.6, -19.4], [50.8, -20.3], [49.8, -19.6], [31.4, -38.8], [32.2, -39.1]]) P.barrel(B, x, 0.1, z, R() < 0.5 ? M.paintBlue : M.paintOlive);
    B.box(M.canvasOlive, 39.5, 0.1, -36.5, 2.4, 1.2, 1.8, { surf: SURF.fabric, grime: false, ry: 0.15 });
    P.table(B, 48, 0.1, -30.5, 1.57, 2.0, 0.9); P.crate(B, 48, 0.865, -30.5, 0.6, 1.5, 'expl');
    data.objectives.cache = { x: 45.2, y: 1.2, z: -34.4 };
    data.enemies.push({ x: 28, z: -29, yaw: -1.57, role: 'guard' }, { x: 40, z: -30, yaw: 1, role: 'patrol', route: [[40, -30], [48, -24], [36, -24], [34, -35], [42, -37]] }, { x: 47, z: -33, yaw: -2.5, role: 'idle' });
  }

  // ---------------------------------------------------------------- HÜCRE BLOĞU (rehine)
  {
    const X0 = 38, X1 = 50, Z0 = 16, Z1 = 28, t = 0.3, H = 3.2; const wm = M.concrete;
    B.box(M.concreteDark, 44, -0.4, 22, 12.4, 0.55, 12.4, { nav: false, grime: false }); B.floor(X0, Z0, X1, Z1, 0.15); B.box(M.floor, 44, 0.13, 22, 11.4, 0.02, 11.4, { col: false });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X0 + t / 2, 0, H, t, [door(18.4, 1.0, { frame: 'metal', leaf: 2.0 })], { out: -1 });
    wallRun(B, wm, 'x', X0, X1, Z0 + t / 2, 0, H, t, [win(41, 1.2, { bars: true })], { out: -1 });
    wallRun(B, wm, 'x', X0, X1, Z1 - t / 2, 0, H, t, [win(43.4, 0.8, { y0: 1.95, y1: 2.5, bars: true })], { out: 1 });
    wallRun(B, wm, 'z', Z0 + t, Z1 - t, X1 - t / 2, 0, H, t, [win(24.6, 0.8, { y0: 1.95, y1: 2.5, bars: true })], { out: 1 });
    wallRun(B, wm, 'x', X0 + t, X1 - t, 22, 0.15, H - 0.15, 0.24, [door(45.4, 1.0, { y0: 0, y1: 2.1, frame: 'metal', leaf: 1.5 })], { out: 1 });
    sill(B, 'z', 18.9, X0, -1);
    B.box(M.concrete, 44, H, 22, 12.6, 0.25, 12.6, { nav: false, grime: false });
    for (const [x, z, sx, sz] of [[44, Z0 + 0.1, 12.6, 0.2], [44, Z1 - 0.1, 12.6, 0.2], [X0 + 0.1, 22, 0.2, 12.2], [X1 - 0.1, 22, 0.2, 12.2]]) B.box(M.concrete, x, H + 0.25, z, sx, 0.35, sz, { nav: false });
    P.table(B, 41.2, 0.15, 17.6, 0, 1.4, 0.7); P.chair(B, 41.2, 0.15, 18.5, 3.14); P.radioSet(B, 41.5, 0.915, 17.5, 0); P.locker(B, 49.3, 0.15, 17, -Math.PI / 2, M.paintDark);
    B.box(M.mattress, 40.2, 0.15, 26.6, 0.85, 0.1, 1.9, { col: false }); B.cyl(M.galvanized, 48.8, 0.15, 27.0, 0.15, 0.28, { seg: 10, col: false }); P.chair(B, 46.6, 0.15, 25.6, 2.4);
    P.hangingBulb(B, 43, H, 19, { intensity: 11 }); P.hangingBulb(B, 44.5, H, 25, { intensity: 7, dist: 7 });
    data.objectives.hostage = { x: 47.6, y: 0.15, z: 25.2, yaw: -2.2 };
    data.enemies.push({ x: 43, z: 19.2, yaw: 2.6, role: 'guard' }, { x: 36.2, z: 21.5, yaw: -1.57, role: 'patrol', route: [[36.2, 21.5], [36.2, 12], [52.5, 12], [36.2, 12]] });
  }

  // ---------------------------------------------------------------- telsiz direği + jeneratör
  {
    const mast = P.radioMast(B, -24, -41, 21);
    data.objectives.comms = { x: mast.base.x, y: mast.base.y + 0.3, z: mast.base.z }; data.beacon = mast.beacon;
    // jeneratör sundurması
    for (const [x, z] of [[-32.5, -43], [-28.5, -43], [-32.5, -39.4], [-28.5, -39.4]]) B.box(M.galvanized, x, 0, z, 0.1, 2.5, 0.1, { grime: false, navPad: 0.15 });
    B.box(M.roofMetal, -30.5, 2.5, -41.2, 4.8, 0.05, 4.4, { rx: 0.08, nav: false, grime: false });
    const gp = P.generator(B, -30.5, -41.4, 0.05); data.emitters.push({ type: 'generator', ...gp });
    P.barrel(B, -33.4, 0, -44.5, M.paintRed); P.barrel(B, -32.6, 0, -45.1, M.paintOlive);
    B.beam(M.black, -29.6, 0.3, -41.4, -24.5, 0.35, -41, 0.02, {});
    data.enemies.push({ x: -27, z: -37, yaw: 2.4, role: 'patrol', route: [[-27, -37], [-18, -36], [-18, -46], [-34, -47], [-36, -37]] });
  }

  // ---------------------------------------------------------------- avlu: araçlar, konteynerler, mevziler
  P.pickup(B, 7, 15, 0.35, M.paintTan, { gun: true, rollbar: true });
  P.pickup(B, 14, 24, -1.25, M.paintWhite, { cargo: true });
  P.truck(B, 22.5, 13, 0.08);
  P.truck(B, 21, -4, 1.7, { cover: false });
  P.fuelTank(B, -22, 28, 0.2);
  for (const [x, z, m] of [[-18.4, 30.6, M.paintRed], [-17.6, 29.9, M.paintRed], [-18.6, 29.6, M.paintBlue], [-25.6, 30.8, M.paintOlive]]) P.barrel(B, x, 0, z, m);
  P.barrel(B, -26.5, 0, 31.6, M.paintOlive, { lying: true, ry: 0.6 });
  data.barrels.push({ x: -18.0, y: 0.45, z: 30.2, r: 1.1 });
  P.container(B, -46, 0, 24, 0.02, M.contRed); P.container(B, -46, 0, 27.0, -0.03, M.contBlue); P.container(B, -45.6, 2.59, 24.2, 0.06, M.contGreen);
  P.container(B, -38, 0, 37.5, Math.PI / 2 + 0.05, M.contTan); P.container(B, -53, 0, 39, 0.12, M.contBlue); P.container(B, -30.5, 0, 22, Math.PI / 2, M.contRed);
  P.container(B, 56, 0, 2, Math.PI / 2, M.contGreen); P.container(B, 56.2, 0, -5, Math.PI / 2 + 0.04, M.contTan);
  // kapı mevzileri
  P.sandbags(B, 3.5, 44.5, 7.2, 44.5, 5); P.sandbags(B, 7.2, 44.3, 7.2, 47.5, 5); P.sandbags(B, -5.5, 40.5, -2.2, 41.8, 4);
  P.hesco(B, -7.5, 60, 0.1, 3); P.hesco(B, 7.8, 66, -0.08, 3); P.hesco(B, 12, 55.5, 1.5, 2);
  // avlu ortası mevzi ve yığınlar
  P.sandbags(B, -12, 2, -8, 2, 4); P.sandbags(B, -12.2, 2.2, -12.2, 5.5, 4); P.hesco(B, 26, 4, 0, 2); P.hesco(B, -2, -14, 1.57, 2);
  P.camoNet(B, -15, -9, 0.15, 7, 5.5, 2.9);
  for (const [x, z, n] of [[-16, -9, 3], [-14.6, -9.6, 2], [-15.4, -7.6, 2], [-13, -8, 1]]) P.crateStack(B, x, z, R.range(-0.4, 0.4), n);
  P.barrel(B, -17.2, 0, -7, M.paintBlue); P.barrel(B, -12.4, 0, -10.6, M.paintOlive);
  P.camoNet(B, 17, -11, -0.1, 8, 6, 3.0);
  P.table(B, 15.5, 0, -11, 0, 2.2, 0.9); P.table(B, 18.6, 0, -11.4, 0.1, 2.2, 0.9); P.chair(B, 15, 0, -10, 3.0); P.chair(B, 16.2, 0, -12, 0.1); P.chair(B, 18.8, 0, -10.3, 3.2); P.chair(B, 19.3, 0, -12.4, -0.2);
  P.tent(B, 4, 34, 1.5, M.canvasTan); P.tent(B, -6, 30, 1.62, M.canvasOlive); P.pallet(B, 9, 0, 31, 0.3); P.crateStack(B, 9, 31, 0.3, 2, 0.12);
  P.tireStack(B, 17.5, 28.5, 4); P.tireStack(B, 18.6, 28.9, 2); P.tireStack(B, 27, 17, 3); P.pallet(B, 26, 0, 20.5, 0.2);
  P.jerrycan(B, 10.2, 0, 14, 0.5); P.jerrycan(B, 10.5, 0, 14.4, 1.2, M.paintRed); P.barrel(B, 25.2, 0, 9, M.paintOlive); P.barrel(B, 5, 0, 20.5, M.paintBlue);
  P.waterTank(B, -57, -15);
  B.box(M.concreteDark, 41, -0.02, -8, 20, 0.07, 14, { nav: false, grime: false, col: false });
  for (const [x, z, n] of [[-58, 10, 2], [-56, -42, 3], [58, 30, 2], [60, 44, 3], [-20, 46, 2], [24, 46, 2], [56, -30, 2]]) P.crateStack(B, x, z, R.range(-0.5, 0.5), n);
  for (const [x, z] of [[-60, 20], [-59.2, 20.6], [59, 36], [44, 6], [-36, -10], [22, -18], [-10, -20]]) P.barrel(B, x, 0, z, R() < 0.4 ? M.paintBlue : M.paintOlive);
  // ısınma varili (ateş)
  P.barrel(B, -6.5, 0, 8.5, M.rust); data.fires.push({ x: -6.5, y: 0.95, z: 8.5 });
  B.light(-6.5, 1.5, 8.5, { intensity: 22, dist: 11, color: [1.0, 0.5, 0.18], flicker: true });
  // kuleler
  const t1 = P.tower(B, -58.5, 46.5, 0.0), t2 = P.tower(B, 58.5, -46.5, Math.PI);
  data.enemies.push({ x: t1.x, z: t1.z, y: t1.y, yaw: 2.4, role: 'static', elevated: true }, { x: t2.x, z: t2.z, y: t2.y, yaw: -0.8, role: 'static', elevated: true });
  // aydınlatma direkleri
  for (const [x, z, ry] of [[-20, 12, 1.2], [22, 3, -1.9], [-12, -24.5, 0.3], [27.5, -14, -0.6], [-31, -15, 2.2], [36, 10, -2.4], [-9.5, 49, 2.6], [10.5, 49, -2.6], [-50, 14, 0.9]]) P.lampPost(B, x, z, ry);
  // elektrik hattı
  { const poles = [[-11, 150, 0.1], [-13, 112, 0.05], [-10.5, 78, 0], [-10.5, 55.5, 0], [-13.5, -24, 0.3]].map(([x, z, ry]) => P.powerPole(B, x, z, ry)); for (let i = 0; i < poles.length - 1; i++) for (let k = 0; k < 3; k++) P.cable(B, poles[i][k], poles[i + 1][k], i === 3 ? 1.6 : 1.0); }

  // ---------------------------------------------------------------- kamp dışı
  P.pickup(B, 3.2, 86, 2.5, M.paintWhite, { wreck: true });
  // yıkık kulübe (yaklaşma siperi)
  { const hx = -36, hz = 104; const y = terrain.heightAt(hx, hz);
    const seg = (x, z, sx, sz, h) => B.box(M.plasterOchre, x, y - 0.3, z, sx, h + 0.3, sz, { grime: true });
    seg(hx, hz - 2.5, 6, 0.35, 2.4); seg(hx - 3, hz - 0.4, 0.35, 3.8, 1.5); seg(hx - 3, hz + 2.2, 0.35, 1.4, 0.8); seg(hx + 3, hz - 1.2, 0.35, 2.6, 2.0); seg(hx + 3, hz + 1.7, 0.35, 1.4, 1.1); seg(hx + 1.6, hz + 2.5, 2.8, 0.35, 0.9);
    P.rubble(B, hx - 1, hz + 1.8, 2.0, 20); P.rubble(B, hx + 2, hz + 0.3, 1.2, 10); }
  // taş çitler
  const stoneWall = (x1, z1, x2, z2, h = 0.85) => { const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx); const n = Math.round(len / 0.55);
    for (let i = 0; i < n; i++) for (let l = 0; l < 2; l++) { const tt = (i + 0.5 + (l ? 0.5 : 0)) / n; if (tt > 1) continue; const x = x1 + dx * tt + R.range(-0.06, 0.06), z = z1 + dz * tt + R.range(-0.06, 0.06); const s = R.range(0.42, 0.6); B.box(M.rock, x, terrain.heightAt(x, z) - 0.08 + l * h * 0.5, z, s * 1.15, h * 0.56, s * 0.8, { ry: ry + R.range(-0.2, 0.2), rx: R.range(-0.08, 0.08), col: false, grime: false }); }
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; B.collide(mx, terrain.heightAt(mx, mz) - 0.4, mz, len, h + 0.4, 0.5, { ry, surf: SURF.rock }); };
  stoneWall(-20, 122, -2, 128); stoneWall(18, 100, 36, 94); stoneWall(-58, 86, -44, 78); stoneWall(30, 70, 44, 74, 0.8); stoneWall(-84, 44, -78, 30); stoneWall(8, 140, 22, 136);
  // kayalar
  for (let i = 0; i < 150; i++) {
    const a = R.range(0, 6.283), d = R.range(74, 330); const x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d;
    if (Math.abs(x) < 72 && Math.abs(z) < 60) continue;
    const big = R() < 0.16; P.rock(B, x, z, big ? R.range(1.5, 3.4) : R.range(0.3, 1.1));
  }
  for (const [x, z, s] of [[-78, 60, 2.2], [-74, 62.5, 1.3], [16, 118, 1.8], [-24, 140, 2.4], [-26.5, 142, 1.2], [40, 132, 2.0], [-100, 96, 2.6], [70, 84, 2.3], [-112, 40, 1.9], [-130, 12, 2.4], [26, 158, 1.5], [-8, 164, 1.2]]) P.rock(B, x, z, s);

  const crowns = addTreeTrunks(B);

  // ---------------------------------------------------------------- devriyeler ve nöbetçiler
  data.enemies.push(
    { x: -3.5, z: 48, yaw: 3.0, role: 'guard' }, { x: 5.4, z: 46.2, yaw: 2.8, role: 'guard' },
    { x: -8, z: 7, yaw: 0.8, role: 'idle' }, { x: -5, z: 9.6, yaw: -2.4, role: 'idle' },
    { x: -20, z: 16, yaw: 0, role: 'patrol', route: [[-20, 16], [-24, -6], [-4, -20], [14, -18], [30, 2], [16, 34], [-8, 38], [-26, 34]] },
    { x: 30, z: 2, yaw: 3, role: 'patrol', route: [[30, 2], [14, -18], [-4, -20], [-24, -6], [-20, 16], [-26, 34], [-8, 38], [16, 34]] },
    { x: -50, z: 32, yaw: 1, role: 'patrol', route: [[-50, 32], [-34, 31], [-34, 18], [-58, 16], [-58, 44], [-42, 44]] },
    { x: 12, z: 18, yaw: -1, role: 'idle' }, { x: 24, z: 8.5, yaw: 2, role: 'guard' },
    { x: 32, z: -47, yaw: 1.57, role: 'guard' }, { x: 55, z: 20, yaw: -1.6, role: 'patrol', route: [[55, 20], [58, -20], [56, -36], [58, 46]] },
    { x: 16.5, z: -9.6, yaw: 2.5, role: 'idle' },
  );
  data.playerStart = { x: 6, z: 172, yaw: 0.02 };
  data.lz = LZ;
  data.reinforce = { from: [[-6, 300], [2, 304]], to: [0, 70] };

  // ---------------------------------------------------------------- birleştir, çarpışma ve ışık hesabı
  onProgress?.(0.2, 'Geometri birleştiriliyor');
  await new Promise((r) => setTimeout(r, 0));
  const group = B.finalize();
  const collider = B.buildCollider({ pos: terrain.colliderTriangles(), surf: SURF.sand });
  onProgress?.(0.5, 'Işık haritası hesaplanıyor');
  await new Promise((r) => setTimeout(r, 0));
  await B.bakeSkyVis(collider.bvh, { rays: quality.skyRays || 8, onProgress: (p) => onProgress?.(0.5 + p * 0.45, 'Işık haritası hesaplanıyor') });
  // arazi köşeleri (yalnızca kamp çevresi)
  {
    const g = terrMesh.geometry; const Pp = g.attributes.position.array, V = g.attributes.skyVis.array; const ray = new THREE.Ray(); const dirs = [[0, 1, 0], [0.5, 0.8, 0.3], [-0.5, 0.8, -0.3], [0.3, 0.8, -0.5], [-0.3, 0.8, 0.5], [0.7, 0.6, 0.1], [-0.7, 0.6, -0.1], [0, 0.6, 0.75], [0, 0.6, -0.75]];
    for (let i = 0; i < V.length; i++) {
      const x = Pp[i * 3], z = Pp[i * 3 + 2]; if (Math.abs(x) > 68 || Math.abs(z) > 56) continue;
      let open = 0; ray.origin.set(x, Pp[i * 3 + 1] + 0.12, z);
      for (const d of dirs) { ray.direction.set(d[0], d[1], d[2]).normalize(); const h = collider.bvh.raycastFirst(ray, THREE.DoubleSide, 0, 24); if (!h) open += 1; else if (h.distance > 8) open += 0.4; }
      V[i] = 0.14 + 0.86 * open / dirs.length;
    }
    g.attributes.skyVis.needsUpdate = true;
  }
  group.add(createVegetation({ M, terrain, feat, crowns, density: quality.grass ?? 1 }));
  onProgress?.(1, 'Hazır');
  return { group, terrain, nav, collider, data, lights: B.lights, floors: B.floors, groundY: (x, z) => B.groundY(x, z), builder: B };
}
