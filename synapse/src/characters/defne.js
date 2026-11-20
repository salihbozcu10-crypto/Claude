// DEFNE — 22, sessiz dijital dahi. Referans görseldeki Pixar tarzı kıza en yakın tasarım:
// kıvırcık hacimli kahverengi saç (pembe tokalı dağınık at kuyruğu), çiller, büyük kahve gözler,
// gökkuşağı çizgili tişört + kot salopet, boynunda büyük kulaklık, parlayan dijital bileklik.
// Gizli karanlık: buklelerin arasında ince koyu mor bir tutam.
import * as THREE from 'three';
import { defaultOutfit } from './rig.js';
import { hairShell, hairlineFn, hairMask, angles, strandNormal, strandColor, scatterRoots, helixPoints, lock, merge } from './hairkit.js';
import { denimMaterial, stripeMaterial, torsoSector, profileR, strap, button, sneaker, clothMaterial } from './wardrobe.js';
import { hairMaterial, charMaterial, glowMaterial } from '../engine/materials.js';
import { smoothstep, rng, fbm3 } from '../engine/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export default {
  name: 'defne',
  scale: 0.95,
  skin: 0xf2c4a4, sss: 0xff4a30,
  head: { rx: 0.128, ry: 0.146, rz: 0.136, jaw: 0.13, chin: 0.55, cheek: 1.6, cranium: 1.04, faceFlat: 0.07 },
  face: {
    eyeX: 0.055, eyeY: -0.008, eyeR: 0.0315, eyeTilt: 0.03,
    iris: 0x7a4520, iris2: 0x2c1206, irisSize: 0.6, pupil: 0.42, sclera: 0xf6f0ea,
    lashes: 0.7, lashColor: 0x1a0e08,
    brow: 0x3a2214, browThick: 0.0092, browLen: 0.95, browArch: 1.15, browY: 0.001,
    nose: 0.72, noseW: 0.88, noseY: -0.046,
    mouthY: -0.084, mouthW: 0.064, lip: 0xd27a72, lipFull: 1.08,
    ear: 0.95, freckles: 1.0, blush: 0.75,
  },
  body: { shoulderW: 0.158, chestR: 0.136, waistR: 0.11, hipR: 0.138, neckR: 0.038, neckLen: 1, hand: 0.92, legR: 1.08, armR: 0.95, chestZ: 0.74 },

  outfit(ctx) {
    const { bones, spec } = ctx; const B = spec.body;
    const tee = stripeMaterial([0xe8473f, 0xf28a2e, 0xf4c94a, 0x5cba6a, 0x3d8fd6, 0x8e5cc8], 14);
    const denim = denimMaterial(0x3d68a6);
    const brass = charMaterial(0xc89a3e, { metalness: 0.9, roughness: 0.32, sheen: 0, clearcoat: 0.3 });
    const stitch = charMaterial(0xe08a3a, { roughness: 0.7 });
    const parts = defaultOutfit(ctx, {
      topMat: tee, bottomMat: denim, sleeve: 'short',
      footwear: (s) => {
        const sn = sneaker(clothMaterial(0xd9483c), charMaterial(0xf2efe8, { roughness: 0.6 }), charMaterial(0xf4f1ea, { roughness: 0.6 }));
        return sn;
      },
    });
    // salopet önlüğü (göğüs paneli)
    const prof = parts.torsoProfile; const sx = parts.torsoSX, sz = parts.torsoSZ;
    const samp = (y0, y1, n, off) => Array.from({ length: n + 1 }, (_, i) => { const y = y0 + ((y1 - y0) * i) / n; return [profileR(prof, y) + off, y]; });
    const bibProf = samp(-0.2, 0.075, 12, 0.006);
    const bib = torsoSector(bibProf, -0.62, 1.24, sx, sz, denim, 20);
    bones.chest.add(bib);
    // önlük cebi + dikiş
    const pocket = torsoSector(samp(-0.08, 0.02, 6, 0.0095), -0.3, 0.6, sx, sz, denim, 10);
    bones.chest.add(pocket);
    // askılar (önden omuz üstünden arkaya)
    for (const side of [1, -1]) {
      const xf = 0.075 * side;
      const rf = profileR(prof, 0.07) + 0.008;
      const pts = [V(xf, 0.07, rf * sz * 0.98), V(xf * 1.2, 0.15, rf * sz * 0.85), V(side * 0.105, 0.2, 0.0), V(xf * 1.1, 0.13, -rf * sz * 0.95), V(xf * 0.6, 0.0, -profileR(prof, 0.0) * sz - 0.004)];
      bones.chest.add(strap(pts, 0.03, 0.006, denim));
      const bk = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 16), brass); bk.position.set(xf, 0.072, rf * sz + 0.004); bk.scale.set(1.2, 1, 1); bones.chest.add(bk);
      const bt = button(0.008, brass); bt.position.set(side * profileR(prof, -0.13) * sx * 0.82, -0.13, profileR(prof, -0.13) * sz * 0.62); bt.rotation.y = side * 0.75; bones.chest.add(bt);
    }
    // paçalar (kıvrık kot)
    for (const s of ['l', 'r']) {
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 10, 28), denim); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.33; bones[s + 'Knee'].add(cuff);
    }
    // kulaklık (boyunda)
    const hpMat = charMaterial(0x2a2d36, { roughness: 0.45, clearcoat: 0.4 });
    const hpPad = charMaterial(0x15161a, { roughness: 0.9 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 10, 40, Math.PI * 1.1), hpMat);
    band.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI + 0.85 * 0); band.position.set(0, 0.2, -0.01); band.rotation.z = -Math.PI * 0.05; bones.chest.add(band);
    for (const side of [1, -1]) {
      const cup = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.03, 28), hpMat); shell.rotation.z = Math.PI / 2; cup.add(shell);
      const pad = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 10, 24), hpPad); pad.rotation.y = Math.PI / 2; pad.position.x = -side * 0.016; cup.add(pad);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0025, 6, 28), glowMaterial(0x3cf0ff, 2.2)); glow.rotation.y = Math.PI / 2; glow.position.x = side * 0.016; cup.add(glow);
      cup.position.set(side * 0.085, 0.185, 0.07); cup.rotation.set(0.5, side * -0.5, side * 0.25);
      bones.chest.add(cup);
    }
    // dijital bileklik (sol bilek)
    const wb = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 10, 28), charMaterial(0x1a1c22, { roughness: 0.4 }));
    wb.rotation.x = Math.PI / 2; wb.position.y = -0.005; bones.lWrist.add(wb);
    const wbg = new THREE.Mesh(new THREE.TorusGeometry(0.0305, 0.0025, 6, 28, Math.PI * 0.7), glowMaterial(0xb070ff, 2.5)); wbg.rotation.x = Math.PI / 2; wbg.rotation.z = -0.9; wbg.position.y = -0.005; bones.lWrist.add(wbg);
  },

  hair(ctx) {
    const { bones, headF } = ctx;
    // hl0: özgün saç çizgisi (bukle kökleri bununla seçilir → önden görünüm aynı kalır)
    // hl: kabuk için; arkada enseye (boynun kafadan çıktığı hatta) kadar iner
    const hl0 = hairlineFn([[0, 0.5], [0.55, 0.36], [1.05, 0.1], [1.45, -0.05], [1.9, -0.32], [Math.PI, -0.55]]);
    const hl = hairlineFn([[0, 0.5], [0.55, 0.36], [1.05, 0.1], [1.45, -0.05], [1.72, -0.22], [1.88, -0.7], [2.05, -1.1], [2.4, -1.12], [Math.PI, -1.05]]);
    const mask0 = (d) => { const { el, az } = angles(d); return smoothstep(hl0(az) - 0.03, hl0(az) + 0.1, el); };
    const mask = hairMask(hl, -0.03, 0.1);
    const thick = (d) => {
      const up = smoothstep(-0.4, 0.9, d.y);
      const bump = fbm3(d.x * 9, d.y * 9, d.z * 9, 2) * 0.006;
      const nape = 0.45 + 0.55 * smoothstep(-0.95, -0.45, d.y); // ensede yukarı taranmış, ince
      // arkada yukarı toplanmış (at kuyruğuna doğru gergin), yanlarda hafif kabarık
      return Math.max(0.003, (0.012 + 0.02 * up + 0.006 * Math.abs(d.x) + bump) * nape);
    };
    const base = 0x24120a, tip = 0x4a2a16;
    const mat = hairMaterial(0xffffff, { map: strandColor(base, tip, 3), normalMap: strandNormal(), roughness: 0.5 });
    mat.normalScale = new THREE.Vector2(0.2, 0.2);
    const shell = new THREE.Mesh(hairShell(headF, thick, mask, { ws: 400, hs: 180 }), mat);
    bones.face.add(shell);
    const surf = (d) => headF(d).addScaledVector(d, thick(d) * smoothstep(0, 1, mask(d)));
    const R = rng(91);
    // at kuyruğu kökü (tepe-arka)
    const pd = V(0, 0.8, -0.6).normalize();
    const P = surf(pd).addScaledVector(pd, 0.012);
    const geos = [], dark = [];
    // kabuk üzerindeki kıvırcık doku: kuyruğa doğru gerilmiş küçük bukleler
    for (const d of scatterRoots(mask0, 75, 5, 0.55)) {
      const p = surf(d);
      let ax = P.clone().sub(p); ax.addScaledVector(d, -ax.dot(d)); ax.normalize();
      const len = 0.05 + R() * 0.05;
      const pts = helixPoints(p.clone().addScaledVector(d, 0.005), ax, len, 0.0075 + R() * 0.003, 1.3 + R() * 0.8, 16, R() * 6);
      geos.push(lock(pts, 0.022, 0.016, { taper: 0.45, segs: 18, radial: 7, rootTaper: 0.8 }));
    }
    // ense: yeni kapanan alt-arka bölgede, topuza doğru yukarı taranmış küçük bukleler
    {
      const R2 = rng(57);
      for (const d of scatterRoots((q) => mask(q) - mask0(q), 22, 15, 0.5)) {
        const p = surf(d);
        let ax = P.clone().sub(p); ax.addScaledVector(d, -ax.dot(d)); ax.normalize();
        const len = 0.045 + R2() * 0.04;
        const pts = helixPoints(p.clone().addScaledVector(d, 0.003), ax, len, 0.006 + R2() * 0.0025, 1.3 + R2() * 0.8, 16, R2() * 6);
        geos.push(lock(pts, 0.02, 0.013, { taper: 0.45, segs: 18, radial: 7, rootTaper: 0.8 }));
      }
    }
    // at kuyruğu: tepede kabarık kıvırcık topuz + aşağı dökülen bukleler
    const C = P.clone().add(V(0, 0.045, -0.045)); const RB = 0.068;
    for (let i = 0; i < 46; i++) {
      // küre yüzeyinde (alt-ön hariç) düzgün dağılım
      const z = 1 - (2 * (i + 0.5)) / 46, r = Math.sqrt(1 - z * z), a = i * 2.39996;
      const n = V(r * Math.cos(a), z, r * Math.sin(a));
      if (n.y < -0.35 && n.z > 0) continue;
      const p = C.clone().addScaledVector(n, RB * (0.85 + R() * 0.2));
      const tg = V().crossVectors(n, V(0, 1, 0.2).normalize()); if (tg.lengthSq() < 1e-3) tg.set(1, 0, 0); tg.normalize();
      const pts = helixPoints(p, tg.applyAxisAngle(n, R() * 6.28), 0.05 + R() * 0.03, 0.011 + R() * 0.005, 1.4 + R(), 18, R() * 6);
      (i === 13 ? dark : geos).push(lock(pts, 0.026, 0.02, { taper: 0.5, segs: 20, radial: 7, rootTaper: 0.9 }));
    }
    // topuz çekirdeği (boşlukları kapatır)
    const core = new THREE.SphereGeometry(RB * 0.86, 28, 20); { const p = core.attributes.position; const v = V(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + fbm3(v.x * 60, v.y * 60, v.z * 60, 2) * 0.18; p.setXYZ(i, v.x * k + C.x, v.y * k + C.y, v.z * k + C.z); } core.computeVertexNormals(); }
    geos.push(core);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8 - 0.5) * 2.2;
      const start = C.clone().add(V(Math.sin(a) * 0.04, -0.035, Math.cos(a) * 0.04 - 0.01));
      const ax = V(Math.sin(a) * 0.25, -1, -0.45 + Math.cos(a) * 0.1).normalize();
      const len = 0.12 + R() * 0.09, rad = 0.013 + R() * 0.006;
      geos.push(lock(helixPoints(start, ax, len, rad, 2.3 + R(), 26, R() * 6, rad * 1.25), 0.025, 0.018, { taper: 0.35, segs: 28, radial: 7, rootTaper: 0.9 }));
    }
    // yüzü çevreleyen bukleler (şakaklar)
    const frame = [[0.86, 0.2, 0.46], [0.9, 0.02, 0.38], [0.95, -0.08, 0.22], [-0.86, 0.2, 0.46], [-0.9, 0.02, 0.38], [-0.95, -0.08, 0.22], [0.3, 0.62, 0.72]];
    frame.forEach(([x, y, z], i) => {
      const d = V(x, y, z).normalize(); const p = surf(d);
      const isFringe = i === 6;
      const ax = isFringe ? V(0.75, -0.45, 0.1).normalize() : V(Math.sign(x) * 0.3, -1, -0.05).normalize();
      const len = isFringe ? 0.06 : 0.09 + R() * 0.05;
      const pts = helixPoints(p.clone().addScaledVector(d, 0.006), ax, len, isFringe ? 0.008 : 0.009 + R() * 0.004, isFringe ? 1.6 : 2.6 + R(), 24, R() * 6);
      // bukle sarmalı yanak/şakak derisine girmesin: kök sabit, gövde en derin batma kadar dışa itilir
      let pen = 0; for (const q of pts) pen = Math.max(pen, headF(q.clone().normalize()).length() + 0.0095 - q.length());
      if (pen > 0) pts.forEach((q, j) => q.addScaledVector(d, pen * smoothstep(0, 0.3, j / (pts.length - 1))));
      (i === 2 ? dark : geos).push(lock(pts, 0.018, 0.013, { taper: 0.3, segs: 26, radial: 6 }));
    });
    bones.face.add(new THREE.Mesh(merge(geos), mat));
    const violet = hairMaterial(0xffffff, { map: strandColor(0x1e1028, 0x4a2a66, 9), normalMap: strandNormal(), roughness: 0.5 });
    bones.face.add(new THREE.Mesh(merge(dark), violet));
    // pembe toka (büzgülü)
    const tg = new THREE.TorusGeometry(0.028, 0.012, 14, 40);
    { const p = tg.attributes.position; const v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.y, v.x); const k = 1 + 0.12 * Math.sin(a * 14); p.setXYZ(i, v.x * (1 + (k - 1) * 0.3), v.y * (1 + (k - 1) * 0.3), v.z * k); } tg.computeVertexNormals(); }
    const tie = new THREE.Mesh(tg, charMaterial(0xf06aa0, { roughness: 0.6, sheen: 0.9, sheenColor: 0xffc0dc }));
    tie.position.copy(P.clone().add(V(0, 0.012, -0.012))); tie.scale.setScalar(1.25); tie.lookAt(C);
    bones.face.add(tie);
  },
};
