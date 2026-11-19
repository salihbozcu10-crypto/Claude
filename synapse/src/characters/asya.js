// ASYA — 23, ekibin adrenalin bağımlısı, fevri ve gözü kara saha gücü. Otoriteye nefret.
// Siyah asimetrik kesim: sağ yan tıraşlı (undercut), uzun yan kahkül sola-öne savrulmuş, kahkülde
// kızıl/fuşya tutam. Sol kaşında küçük yara izi, kulaklarında halkalar. Kırmızı-siyah kısa deri ceket
// (kollar sıvalı), siyah atlet, parmaksız eldiven, kargo pantolon + dizlik, kalın bot.
import * as THREE from 'three';
import { defaultOutfit } from './rig.js';
import { hairShell, hairlineFn, angles, strandNormal, strandColor, scatterRoots, flowLock, lock, merge } from './hairkit.js';
import { leatherMaterial, clothMaterial, torsoSector, profileR, strap, boot } from './wardrobe.js';
import { hairMaterial, charMaterial, canvasTexture } from '../engine/materials.js';
import { smoothstep, rng, fbm3 } from '../engine/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export default {
  name: 'asya',
  scale: 1.0,
  skin: 0xd59a72, sss: 0xff4a2a,
  head: { rx: 0.124, ry: 0.148, rz: 0.134, jaw: 0.17, chin: 0.85, cheek: 1.05, cranium: 1.03, faceFlat: 0.08 },
  face: {
    eyeX: 0.054, eyeY: -0.006, eyeR: 0.029, eyeTilt: 0.1,
    iris: 0x4e9a5a, iris2: 0x1d3d22, irisSize: 0.58, pupil: 0.4, sclera: 0xf3eee8,
    lashes: 0.55, lashColor: 0x0c0806,
    brow: 0x140c0a, browThick: 0.0098, browLen: 1.05, browArch: 0.75, browY: -0.001, browTilt: 0.35,
    nose: 0.78, noseW: 0.9, noseY: -0.045,
    mouthY: -0.085, mouthW: 0.062, lip: 0xb85a58, lipFull: 1.0,
    ear: 1.0, freckles: 0.25, blush: 0.4,
    scar: { dir: new THREE.Vector3(0.36, 0.3, 0.88).normalize(), len: 0.07, ang: 1.25 },
  },
  body: { shoulderW: 0.165, chestR: 0.138, waistR: 0.108, hipR: 0.136, neckR: 0.04, neckLen: 1, hand: 0.95, legR: 1.08, armR: 1.0, chestZ: 0.74 },

  outfit(ctx) {
    const { bones, spec, mats } = ctx;
    const tank = clothMaterial(0x16171b, { roughness: 0.9 });
    const cargo = clothMaterial(0x34382e, { repeat: [10, 10] });
    const leather = leatherMaterial(0xb3202a);
    const leatherBlk = leatherMaterial(0x141416, { roughness: 0.5 });
    const parts = defaultOutfit(ctx, {
      topMat: tank, bottomMat: cargo, sleeve: 'none',
      footwear: () => boot(leatherBlk, charMaterial(0x2a2724, { roughness: 0.8 }), { w: 0.11, h: 0.13, l: 0.27 }),
    });
    // kısa deri ceket: göğüs kabuğu (önü açık) + omuz/üst kol kolları
    const prof = parts.torsoProfile; const sx = parts.torsoSX, sz = parts.torsoSZ;
    const jp = Array.from({ length: 14 }, (_, i) => { const y = -0.1 + (i / 13) * 0.32; return [profileR(prof, Math.min(y, 0.212)) + 0.012 + (y > 0.19 ? 0.004 : 0), Math.min(y, 0.22)]; });
    for (const [a0, len, m] of [[0.42, 2.4, leather], [-0.42 - 2.4, 2.4, leather]]) {
      const half = torsoSector(jp, a0, len, sx * 1.01, sz * 1.04, m, 24); half.material.side = THREE.DoubleSide; bones.chest.add(half);
    }
    // ceketin siyah alt bandı ve yaka
    const hem = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 48), leatherBlk); hem.scale.set(profileR(prof, -0.1) * sx + 0.012, profileR(prof, -0.1) * sz + 0.012, 1); hem.rotation.x = Math.PI / 2; hem.position.y = -0.1; bones.chest.add(hem);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1, 0.016, 10, 48, Math.PI * 1.4), leatherBlk);
    collar.scale.set(0.075, 0.062, 1); collar.rotation.set(Math.PI / 2 - 0.35, 0, Math.PI * 1.2); collar.position.set(0, 0.2, -0.004); bones.chest.add(collar);
    // fermuar dişleri (iki kenar)
    for (const side of [1, -1]) {
      const zp = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.3, 0.006), charMaterial(0x9a9aa0, { metalness: 0.9, roughness: 0.3 }));
      const a = side * 0.44; zp.position.set(Math.sin(a) * (profileR(prof, 0.05) + 0.014) * sx, 0.05, Math.cos(a) * (profileR(prof, 0.05) + 0.014) * sz); bones.chest.add(zp);
    }
    for (const s of ['l', 'r']) {
      const armR = 0.044;
      const sleeve = new THREE.Mesh(ctx.geo.limb(0.2, [[0, armR * 1.38], [0.7, armR * 1.25], [1, armR * 1.3]], 24, 10), leather); bones[s + 'Shoulder'].add(sleeve);
      const sb = new THREE.Mesh(new THREE.SphereGeometry(armR * 1.3, 24, 16), leather); sb.scale.set(0.9, 0.85, 1); sb.position.set(s === 'l' ? -0.01 : 0.01, -0.012, 0); bones[s + 'Shoulder'].add(sb);
      const roll = new THREE.Mesh(new THREE.TorusGeometry(armR * 1.22, 0.014, 10, 24), leatherBlk); roll.rotation.x = Math.PI / 2; roll.position.y = -0.205; bones[s + 'Shoulder'].add(roll);
      // parmaksız eldiven
      const glove = new THREE.Mesh(ctx.geo.roundedBox(0.034, 0.07, 0.084, 0.014, 3), leatherBlk); glove.position.set(0, -0.04, 0.004); bones[s + 'Wrist'].add(glove);
      const cuffG = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 22), leatherBlk); cuffG.rotation.x = Math.PI / 2; cuffG.position.y = -0.002; bones[s + 'Wrist'].add(cuffG);
    }
    // dizlik (sağ diz)
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), charMaterial(0x1a1b1e, { roughness: 0.5, clearcoat: 0.3 })); pad.scale.set(1, 1.2, 0.7); pad.position.set(0, -0.01, 0.05); bones.rKnee.add(pad);
    // kemer + kılıf
    const belt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 8, 48), leatherBlk); belt.scale.set(spec.body.waistR * 1.18 + 0.012, spec.body.waistR * 0.8 + 0.012, 1); belt.rotation.x = Math.PI / 2; belt.position.y = 0.1; bones.hips.add(belt);
    const buckle = new THREE.Mesh(ctx.geo.roundedBox(0.04, 0.03, 0.01, 0.004, 2), charMaterial(0xb0b0b8, { metalness: 0.95, roughness: 0.25 })); buckle.position.set(0, 0.1, spec.body.waistR * 0.8 + 0.018); bones.hips.add(buckle);
    const holster = new THREE.Mesh(ctx.geo.roundedBox(0.04, 0.12, 0.07, 0.012, 3), leatherBlk); holster.position.set(-0.15, 0.02, 0.0); holster.rotation.z = 0.08; bones.hips.add(holster);
    // cep (kargo)
    for (const s of ['l', 'r']) { const pk = new THREE.Mesh(ctx.geo.roundedBox(0.03, 0.1, 0.09, 0.01, 2), cargo); pk.position.set(s === 'l' ? 0.07 : -0.07, -0.2, 0.0); bones[s + 'Hip'].add(pk); }
    // kulak halkaları
    const silver = charMaterial(0xd8d8e0, { metalness: 1, roughness: 0.2, sheen: 0 });
    for (const side of [1, -1]) for (let k = 0; k < (side > 0 ? 3 : 1); k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0065, 0.0013, 6, 18), silver);
      const ep = ctx.headF(V(side, -0.2 + k * 0.09, -0.04 - k * 0.02).normalize());
      ring.position.set(ep.x + side * 0.004, ep.y - 0.004, ep.z + 0.004); ring.rotation.y = Math.PI / 2; bones.face.add(ring);
    }
    void mats;
  },

  hair(ctx) {
    const { bones, headF } = ctx;
    // sağ taraf (−x) tıraşlı; sol ve tepe uzun
    const hl = hairlineFn([[0, 0.52], [0.55, 0.34], [1.05, 0.08], [1.45, -0.08], [1.9, -0.35], [Math.PI, -0.62]]);
    const mask = (d) => { const { el, az } = angles(d); return smoothstep(hl(az) - 0.03, hl(az) + 0.08, el); };
    const shaved = (d) => smoothstep(-0.25, -0.55, d.x) * (1 - smoothstep(0.55, 0.85, d.y));
    const thick = (d) => {
      const top = smoothstep(-0.2, 0.9, d.y);
      const left = smoothstep(-0.3, 0.6, d.x);
      return (0.008 + 0.02 * top + 0.012 * left * smoothstep(-0.6, 0.3, d.y)) * (1 - 0.85 * shaved(d)) + fbm3(d.x * 7, d.y * 7, d.z * 7, 2) * 0.003;
    };
    const mat = hairMaterial(0xffffff, { map: strandColor(0x0d0b0c, 0x2a2228, 11), normalMap: strandNormal(), roughness: 0.45 });
    mat.normalScale = new THREE.Vector2(0.15, 0.15);
    bones.face.add(new THREE.Mesh(hairShell(headF, thick, mask), mat));
    // tıraşlı bölge koyulaştırma: ince koyu kabuk dokusu
    const surf = (d) => headF(d).addScaledVector(d, thick(d) * smoothstep(0, 1, mask(d)));
    const R = rng(23);
    const geos = [], red = [];
    // akış: tepeden öne ve sola (+x) savrulan; arkada aşağı
    const flow = (d) => {
      const front = smoothstep(-0.2, 0.5, d.z);
      return V(0.55 + 0.3 * front, -0.25 - 0.4 * (1 - front), 0.9 * front - 0.6 * (1 - front)).normalize();
    };
    for (const d of scatterRoots((q) => mask(q) * (1 - shaved(q)), 40, 4, 0.6)) {
      const big = d.z > 0.1 && d.y > 0.35;
      const len = big ? 0.11 + R() * 0.07 : 0.05 + R() * 0.04;
      geos.push(flowLock(surf, d, flow, { len, steps: 12, w: big ? 0.042 : 0.032, t: 0.011, lift: (s) => 0.002 + 0.006 * Math.sin(Math.PI * s * 0.9), taper: 0.2 }));
    }
    // uzun yan kahkül: tepeden alnın üstünden sol yanağa düşen büyük tutamlar (biri kızıl)
    for (let i = 0; i < 7; i++) {
      const root = V(-0.18 + i * 0.07, 0.86, 0.48).normalize();
      const p0 = surf(root).addScaledVector(root, 0.006);
      const side = 0.03 + i * 0.012;
      const pts = [p0,
        p0.clone().add(V(0.02 + side * 0.4, 0.012, 0.04)),
        V(0.025 + side, 0.075 - i * 0.004, 0.125 + 0.012),
        V(0.07 + side * 0.9, 0.025 - i * 0.006, 0.118),
        V(0.105 + side * 0.5, -0.03 - i * 0.008, 0.095 - i * 0.004)];
      const gq = lock(pts, 0.036, 0.012, { taper: 0.12, segs: 22, radial: 8 });
      (i === 3 || i === 4 ? red : geos).push(gq);
    }
    bones.face.add(new THREE.Mesh(merge(geos), mat));
    const crimson = hairMaterial(0xffffff, { map: strandColor(0x8a0a1c, 0xe0305a, 12), normalMap: strandNormal(), roughness: 0.42 });
    crimson.normalScale = new THREE.Vector2(0.15, 0.15);
    bones.face.add(new THREE.Mesh(merge(red), crimson));
    // tıraşlı yan: ten üstünde koyu gölge kabuğu
    const buzz = canvasTexture(64, 64, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); });
    const buzzMat = new THREE.MeshStandardMaterial({ color: 0x14100e, map: buzz, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const bm = (d) => (mask(d) > 0.2 && shaved(d) > 0.3) ? 1 : 0;
    bones.face.add(new THREE.Mesh(hairShell(headF, () => 0.0012, (d) => bm(d) * mask(d), { sink: 0 }), buzzMat));
  },
};
