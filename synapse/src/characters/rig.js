// Karakter iskeleti ve yüz sistemi (stilize, Pixar benzeri oranlar).
//
// KULLANIM
//   const ch = buildCharacter(spec)        // spec: characters/<isim>.js içinde
//   scene.add(ch.root)
//   // her karede (çekim içinde):
//   ch.reset()                             // nötr poz/ifade
//   ch.place(x, z, heading)                // heading: radyan, 0 = +z yönüne bakar
//   ch.setPose('typing', 1); ch.mixPose({ head: [0.1, 0.3, 0] }, 1)   // poses.js ön ayarları + ekler
//   ch.walk(phase, amount)                 // yürüyüş döngüsü (phase: adım sayısı cinsinden)
//   ch.lookAt(worldVec3, headW, eyesW)
//   ch.expr('worried', 0.8); ch.face.open = 0.3 ...
//   ch.update(t)                           // t: küresel saniye — göz kırpma, nefes, dudak senk.
//
// EKSEN KURALLARI: karakter +z'ye bakar, +y yukarı, karakterin SOLU +x.
// Poz alanları (radyan):
//   hips: { y, rot:[x,y,z] }  spine/chest/neck/head: [öne eğilme(+), sola dönme(+), yana yatma(+)]
//   lShoulder/rShoulder: [öne kaldırma(+), yana açma(+), içe burma(+)]
//   lElbow/rElbow: [bükme(+), burma]   lWrist/rWrist: [bükme(+), yana, burma]
//   lHip/rHip: [öne kaldırma(+), yana açma(+), burma]   lKnee/rKnee: bükme(+)   lAnkle/rAnkle: ayak ucu yukarı(+)
//   lHand/rHand: 'relaxed'|'fist'|'point'|'open'|'grip'|'pinch'|'claw' ya da [başparmak, işaret, orta, yüzük, serçe] (0..1 kıvrım)
import * as THREE from 'three';
import { sphereGrid, limb, lathe, lock, merge, roundedBox, dirFromUV, uvFromDir, helixPoints } from './geo.js';
import { skinMaterial, charMaterial, hairMaterial, canvasTexture, glowMaterial, skinPoreNormal, RIM } from '../engine/materials.js';
import { clamp, lerp, smoothstep, noise1, fbm1, rng } from '../engine/util.js';
import { POSES, HANDS, blendPose, neutralPose } from './poses.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const gauss = (d, c, w) => Math.exp(-d.distanceToSquared(c) / (w * w));

export const DEFAULT_SPEC = {
  name: 'char', scale: 1,
  skin: 0xe2a383, sss: 0xff4a2e,
  head: { rx: 0.126, ry: 0.148, rz: 0.136, jaw: 0.16, chin: 0.7, cheek: 1.3, cranium: 1.04, faceFlat: 0.07 },
  face: {
    eyeX: 0.054, eyeY: -0.006, eyeR: 0.0295, eyeTilt: 0.04, eyeDepth: 0.47,
    iris: 0x6a3c1c, iris2: 0x2e1608, irisSize: 0.56, pupil: 0.42, sclera: 0xf3eee8,
    lashes: 0.3, lashColor: 0x140c08, lidColor: null,
    brow: 0x2a1a10, browThick: 0.0085, browLen: 1, browArch: 1, browY: 0.0, browTilt: 0,
    nose: 0.8, noseW: 0.9, noseY: -0.044, noseTip: 0x000000,
    mouthY: -0.083, mouthW: 0.066, lip: 0xc0706a, lipFull: 1,
    ear: 1, freckles: 0, blush: 0.45, stubble: 0, stubbleColor: 0x2b2018, scar: null,
  },
  body: { shoulderW: 0.175, chestR: 0.15, waistR: 0.118, hipR: 0.135, neckR: 0.043, neckLen: 1, hand: 1, legR: 1, armR: 1, chestZ: 0.74 },
  hair: null,    // (ctx) => void
  outfit: null,  // (ctx) => void
};

function deepMerge(a, b) {
  const o = Array.isArray(a) ? a.slice() : { ...a };
  for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && !b[k].isColor && typeof a[k] === 'object' && a[k] ? deepMerge(a[k], b[k]) : b[k];
  return o;
}

export function buildCharacter(specIn) {
  const spec = deepMerge(DEFAULT_SPEC, specIn || {});
  const H = spec.head, F = spec.face, B = spec.body;
  const root = new THREE.Group(); root.name = spec.name;
  const scaleG = new THREE.Group(); scaleG.scale.setScalar(spec.scale); root.add(scaleG);

  // ---------- iskelet ----------
  const bone = (name, parent, x, y, z) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const bones = {};
  bones.hips = bone('hips', scaleG, 0, 0.88, 0);
  bones.spine = bone('spine', bones.hips, 0, 0.08, 0);
  bones.chest = bone('chest', bones.spine, 0, 0.16, 0);
  bones.neck = bone('neck', bones.chest, 0, 0.185, -0.005);
  bones.head = bone('head', bones.neck, 0, 0.06 * B.neckLen, 0.005);
  bones.face = bone('face', bones.head, 0, 0.128, 0.014); // kafa merkezi
  for (const s of ['l', 'r']) {
    const sx = s === 'l' ? 1 : -1;
    bones[s + 'Shoulder'] = bone(s + 'Shoulder', bones.chest, sx * B.shoulderW, 0.162, -0.012);
    bones[s + 'Shoulder'].rotation.order = 'XYZ';
    bones[s + 'Elbow'] = bone(s + 'Elbow', bones[s + 'Shoulder'], 0, -0.255, 0);
    bones[s + 'Wrist'] = bone(s + 'Wrist', bones[s + 'Elbow'], 0, -0.23, 0);
    bones[s + 'Hip'] = bone(s + 'Hip', bones.hips, sx * 0.088, -0.04, 0);
    bones[s + 'Knee'] = bone(s + 'Knee', bones[s + 'Hip'], 0, -0.385, 0);
    bones[s + 'Ankle'] = bone(s + 'Ankle', bones[s + 'Knee'], 0, -0.375, 0);
  }

  // ---------- malzemeler ----------
  const skinTex = paintSkin(spec);
  const mats = {
    skin: skinMaterial(0xffffff, { map: skinTex, sssColor: spec.sss, normalMap: skinPoreNormal(), normalScale: 0.08 }),
    skinPlain: skinMaterial(spec.skin, { sssColor: spec.sss }),
    lid: skinMaterial(F.lidColor ?? spec.skin, { sssColor: spec.sss }),
    brow: hairMaterial(F.brow, { roughness: 0.7, anisotropy: 0 }),
    lip: skinMaterial(F.lip, { roughness: 0.38, clearcoat: 0.25, sssColor: 0xff3020 }),
    mouthIn: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    teeth: charMaterial(0xf2ece0, { roughness: 0.3, sheen: 0, clearcoat: 0.4, rim: 0.2 }),
    // (dişler ve dil, iç boşluğun önünde çizilsin diye daha güçlü polygonOffset alır)
    tongue: skinMaterial(0xc85a5c, { roughness: 0.35, clearcoat: 0.3 }),
    lash: new THREE.MeshStandardMaterial({ color: F.lashColor, roughness: 0.7 }),
  };
  mats.lid.side = THREE.DoubleSide;
  mats.brow.map = browTexture(); mats.brow.transparent = true; mats.brow.depthWrite = false;
  mats.brow.polygonOffset = true; mats.brow.polygonOffsetFactor = -2; mats.brow.polygonOffsetUnits = -2;
  for (const m of [mats.teeth, mats.tongue]) { m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; }

  // ---------- kafa yüzeyi ----------
  const eyeL = V(F.eyeX, F.eyeY, 0), eyeR = V(-F.eyeX, F.eyeY, 0);
  const cheekL = V(0.6, -0.42, 0.68).normalize(), cheekR = V(-0.6, -0.42, 0.68).normalize();
  const chinD = V(0, -0.8, 0.6).normalize();
  const browL = V(0.38, 0.28, 0.88).normalize(), browR = V(-0.38, 0.28, 0.88).normalize();
  const eyeDirL = V(F.eyeX / H.rx, F.eyeY / H.ry, 0.82).normalize(), eyeDirR = V(-F.eyeX / H.rx, F.eyeY / H.ry, 0.82).normalize();
  const noseD = V(0, -0.2, 1).normalize();
  function headF(d) {
    const r = 1 / Math.sqrt((d.x / H.rx) ** 2 + (d.y / H.ry) ** 2 + (d.z / H.rz) ** 2);
    const p = d.clone().multiplyScalar(r);
    const ny = p.y / H.ry; // -1..1
    if (ny < 0) {
      const k = Math.pow(-ny, 1.5);
      p.x *= 1 - H.jaw * k;
      if (p.z < 0) p.z *= 1 - 0.38 * Math.pow(-ny, 1.2);
      else p.z *= 1 - 0.1 * k;
    } else if (p.z < 0) {
      p.z *= H.cranium; p.y *= 1 + 0.03 * (H.cranium - 1);
    }
    // yüzü hafif düzleştir
    if (p.z > 0) p.z *= 1 - H.faceFlat * smoothstep(0.0, 0.8, d.z) * (1 - Math.abs(ny) * 0.5);
    // yanaklar, çene, kaş çıkıntısı, göz çukurları
    let bump = 0;
    bump += 0.012 * H.cheek * (gauss(d, cheekL, 0.32) + gauss(d, cheekR, 0.32));
    bump += 0.012 * H.chin * gauss(d, chinD, 0.22);
    bump += 0.004 * (gauss(d, browL, 0.2) + gauss(d, browR, 0.2));
    bump -= F.eyeR * 0.42 * (gauss(d, eyeDirL, 0.2) + gauss(d, eyeDirR, 0.2));
    // burun kemeri
    const bx = d.x / 0.05; const by = (d.y + 0.05) / 0.22;
    if (d.z > 0.6) bump += 0.006 * F.nose * Math.exp(-bx * bx) * Math.exp(-by * by) * smoothstep(0.6, 0.95, d.z);
    // ağız çevresi (dudak tümseği)
    bump += 0.005 * gauss(d, V(0, -0.5, 0.86).normalize(), 0.16);
    p.addScaledVector(d, bump);
    return p;
  }
  const headGeo = sphereGrid(headF, 200, 150);
  const headMesh = new THREE.Mesh(headGeo, mats.skin); headMesh.name = 'headSkin';
  bones.face.add(headMesh);

  // yüz düzleminde (u, v) noktasını yüzeye yansıt (ön yüz)
  const _p = V();
  function facePoint(u, v, off = 0, out = V()) {
    let d = V(u / H.rx, v / H.ry, 0); d.z = Math.sqrt(Math.max(0.04, 1 - d.x * d.x - d.y * d.y)); d.normalize();
    for (let i = 0; i < 4; i++) {
      _p.copy(headF(d));
      d.x += (u - _p.x) / H.rx; d.y += (v - _p.y) / H.ry; d.normalize();
    }
    _p.copy(headF(d));
    if (off) {
      const e = 0.002; const pu = headF(V(d.x + e, d.y, d.z).normalize()), pv = headF(V(d.x, d.y + e, d.z).normalize());
      const n = new THREE.Vector3().crossVectors(pu.sub(_p), pv.sub(_p)).normalize(); if (n.z < 0) n.negate();
      _p.addScaledVector(n, off);
    }
    return out.copy(_p);
  }

  // ---------- gözler ----------
  const irisTex = paintIris(F);
  const eyes = {};
  for (const s of ['l', 'r']) {
    const sx = s === 'l' ? 1 : -1;
    const surf = facePoint(sx * F.eyeX, F.eyeY);
    const socket = new THREE.Group(); socket.name = s + 'EyeSocket';
    socket.position.set(sx * F.eyeX, F.eyeY, surf.z - F.eyeR * F.eyeDepth);
    socket.rotation.z = sx * F.eyeTilt; socket.rotation.y = sx * 0.12;
    bones.face.add(socket);
    const ball = new THREE.Group(); socket.add(ball);
    const eg = new THREE.SphereGeometry(F.eyeR, 48, 32); eg.rotateX(Math.PI / 2);
    const eMat = new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x000000, emissiveIntensity: 1 });
    const eye = new THREE.Mesh(eg, eMat); ball.add(eye);
    // kornea (yalnızca speküler, eklemeli)
    const cg = new THREE.SphereGeometry(F.eyeR * 1.012, 40, 20, 0, Math.PI * 2, 0, 0.75); cg.rotateX(Math.PI / 2);
    { const p = cg.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > F.eyeR * 0.75) p.setZ(i, z + (z - F.eyeR * 0.75) * 0.6); } cg.computeVertexNormals(); }
    const corneaMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 2.5 });
    const cornea = new THREE.Mesh(cg, corneaMat); ball.add(cornea);
    // parıltı (catchlight) — göz yuvasına sabit
    const cl = new THREE.Mesh(new THREE.CircleGeometry(F.eyeR * 0.21, 24), glowMaterial(0xffffff, 1.8, { transparent: true, opacity: 0.92 }));
    cl.scale.set(1, 0.8, 1);
    socket.add(cl);
    // kapaklar
    const R = F.eyeR * 1.075;
    const ulg = new THREE.SphereGeometry(R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const llg = new THREE.SphereGeometry(R * 0.995, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const upper = new THREE.Group(), lower = new THREE.Group();
    upper.add(new THREE.Mesh(ulg, mats.lid)); lower.add(new THREE.Mesh(llg, mats.lid));
    socket.add(upper, lower);
    // kirpik çizgisi
    const lashG = new THREE.TorusGeometry(R * 1.003, 0.0017 + F.lashes * 0.0012, 6, 40, Math.PI); lashG.rotateX(Math.PI / 2);
    const lashMesh = new THREE.Mesh(lashG, mats.lash); upper.add(lashMesh);
    const lowLashG = new THREE.TorusGeometry(R * 1.0, 0.0008, 5, 40, Math.PI); lowLashG.rotateX(Math.PI / 2);
    const lowLash = new THREE.Mesh(lowLashG, new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.skin).multiplyScalar(0.55), roughness: 0.8 })); lower.add(lowLash);
    if (F.lashes > 0.25) {
      // dış köşe kirpikleri (kanat)
      const gs = [];
      for (let i = 0; i < 6; i++) {
        const a = 0.15 + i * 0.13; // dış köşeye doğru
        const ang = Math.PI / 2 - a * sx * -1; // torus açısı
        const x = Math.cos(Math.PI / 2 - a) * R * sx, z = Math.sin(Math.PI / 2 - a) * R;
        const p0 = V(x, 0.0005, z);
        const out = V(x * 0.8, 0, z).normalize();
        const len = (0.004 + i * 0.0009) * F.lashes * 1.6;
        gs.push(lock([p0, p0.clone().addScaledVector(out, len * 0.5).add(V(0, len * 0.35, 0)), p0.clone().addScaledVector(out, len).add(V(sx * len * 0.3, len * 0.9, 0))], 0.0014, 0.0007, { segs: 5, radial: 4, taper: 0.1 }));
        void ang;
      }
      upper.add(new THREE.Mesh(merge(gs), mats.lash));
    }
    eyes[s] = { socket, ball, eye, eMat, upper, lower, cl, corneaMat };
  }

  // ---------- burun ----------
  {
    const g = new THREE.Group(); g.name = 'nose';
    const tip = facePoint(0, F.noseY, 0);
    const nm = mats.skin;
    const tipG = new THREE.SphereGeometry(0.017 * F.nose, 32, 24); tipG.scale(1.05 * F.noseW, 0.88, 0.95);
    const tipM = new THREE.Mesh(tipG, nm); tipM.position.set(0, F.noseY + 0.002, tip.z + 0.004 * F.nose); g.add(tipM);
    for (const sx of [1, -1]) {
      const alG = new THREE.SphereGeometry(0.0105 * F.nose, 24, 16); alG.scale(1, 0.85, 0.9);
      const al = new THREE.Mesh(alG, nm); const ap = facePoint(sx * 0.0145 * F.noseW, F.noseY - 0.004);
      al.position.set(sx * 0.0145 * F.noseW, F.noseY - 0.004, ap.z - 0.0025); g.add(al);
      // burun deliği gölgesi
      const nh = new THREE.Mesh(new THREE.CircleGeometry(0.0034 * F.nose, 12), new THREE.MeshStandardMaterial({ color: 0x3a1410, roughness: 1 }));
      nh.scale.set(1.3, 0.7, 1); nh.position.set(sx * 0.0068 * F.noseW, F.noseY - 0.0135 * F.nose, tip.z - 0.0005); nh.rotation.x = Math.PI / 2 + 0.5; g.add(nh);
    }
    const brG = new THREE.CapsuleGeometry(0.0085 * F.nose, 0.032, 8, 16); brG.scale(1, 1, 0.85);
    const bridge = new THREE.Mesh(brG, nm); const bp = facePoint(0, F.noseY + 0.024);
    bridge.position.set(0, F.noseY + 0.022, bp.z - 0.0015); bridge.rotation.x = -0.32; g.add(bridge);
    bones.face.add(g);
  }

  // ---------- kulaklar ----------
  for (const sx of [1, -1]) {
    const eg = new THREE.SphereGeometry(1, 24, 16); eg.scale(0.011 * F.ear, 0.03 * F.ear, 0.021 * F.ear);
    const ear = new THREE.Mesh(eg, mats.skin);
    const ep = headF(V(sx, -0.08, -0.06).normalize());
    ear.position.set(ep.x + sx * 0.002, ep.y, ep.z); ear.rotation.y = sx * 0.35; ear.rotation.z = sx * -0.12;
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skinMaterial(new THREE.Color(spec.skin).multiplyScalar(0.8), { sssColor: 0xff2010 }));
    inner.scale.set(0.004 * F.ear, 0.018 * F.ear, 0.012 * F.ear); inner.position.set(sx * 0.008, 0, 0.002); ear.add(inner);
    bones.face.add(ear);
  }

  // ---------- dinamik: kaşlar ve ağız ----------
  const browMeshes = { l: new THREE.Mesh(new THREE.BufferGeometry(), mats.brow), r: new THREE.Mesh(new THREE.BufferGeometry(), mats.brow) };
  bones.face.add(browMeshes.l, browMeshes.r);
  const mouth = {
    inner: new THREE.Mesh(new THREE.BufferGeometry(), mats.mouthIn),
    teeth: new THREE.Mesh(new THREE.BufferGeometry(), mats.teeth),
    tongue: new THREE.Mesh(new THREE.BufferGeometry(), mats.tongue),
    upper: new THREE.Mesh(new THREE.BufferGeometry(), mats.lip),
    lower: new THREE.Mesh(new THREE.BufferGeometry(), mats.lip),
    crease: new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.8 })),
  };
  for (const k in mouth) bones.face.add(mouth[k]);

  // ---------- boyun, eller ----------
  const neckMesh = new THREE.Mesh(limb(0.15 * B.neckLen, [[0, B.neckR], [1, B.neckR * 1.12]], 28, 10), mats.skinPlain);
  neckMesh.position.set(0, 0.11 * B.neckLen, 0.0); bones.neck.add(neckMesh);
  const hands = { l: buildHand('l', mats.skinPlain, B.hand), r: buildHand('r', mats.skinPlain, B.hand) };
  bones.lWrist.add(hands.l.root); bones.rWrist.add(hands.r.root);

  // ---------- kıyafet & saç (karaktere özel) ----------
  const ctx = {
    THREE, spec, bones, mats, headF, facePoint, root, hands, eyes,
    geo: { sphereGrid, limb, lathe, lock, merge, roundedBox, dirFromUV, uvFromDir, helixPoints },
    materials: { skinMaterial, charMaterial, hairMaterial, glowMaterial, canvasTexture },
    add(boneName, mesh) { bones[boneName].add(mesh); return mesh; },
    extras: {}, // karaktere özel animasyonlu parçalar (ör. nöral port ışığı)
  };
  if (spec.outfit) spec.outfit(ctx); else defaultOutfit(ctx, {});
  if (spec.hair) spec.hair(ctx);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  for (const s of ['l', 'r']) { eyes[s].cl.castShadow = false; eyes[s].eye.castShadow = false; eyes[s].upper.traverse((o) => (o.castShadow = false)); eyes[s].lower.traverse((o) => (o.castShadow = false)); }
  for (const k in mouth) mouth[k].castShadow = false;
  browMeshes.l.castShadow = browMeshes.r.castShadow = false;

  // ---------- durum ----------
  const ch = {
    name: spec.name, spec, root, bones, mats, eyes, hands, ctx, headF, facePoint,
    pose: neutralPose(), face: neutralFace(),
    gaze: null, gazeW: { head: 1, eyes: 1 }, autoBlink: true, idle: 1, breath: 1,
    speech: null, // { env:[], shape:[], rate, t0 } — update(t) okuyup ağzı oynatır
    ik: { l: null, r: null, lW: 1, rW: 1 }, // kol IK hedefleri (dünya koordinatı)
    catchlight: { dir: V(-0.32, 0.38, 0.87), on: 1 },
    extras: ctx.extras,
  };

  ch.reset = () => { ch._synced = false; ch.ik = { l: null, r: null, lW: 1, rW: 1 }; ch.pose = neutralPose(); ch.face = neutralFace(); ch.gaze = null; ch.gazeW = { head: 1, eyes: 1 }; ch.speech = null; ch.root.visible = true; ch.idle = 1; ch.autoBlink = true; ch.catchlight.on = 1; ch.root.position.set(0, 0, 0); ch.root.rotation.set(0, 0, 0); for (const k in ch.extras) ch.extras[k].reset && ch.extras[k].reset(); };
  ch.place = (x, z, heading = 0, y = 0) => { root.position.set(x, y, z); root.rotation.set(0, heading, 0); ch._synced = false; };
  ch.setPose = (name, w = 1) => { ch._synced = false; const p = typeof name === 'string' ? POSES[name] : name; if (!p) { console.warn('poz yok:', name); return; } ch.pose = blendPose(ch.pose, p, w, false); };
  ch.mixPose = (p, w = 1) => { ch._synced = false; ch.pose = blendPose(ch.pose, p, w, true); }; // eklemeli
  ch.lookAt = (target, head = 1, eyesW = 1) => { ch.gaze = target ? target.clone() : null; ch.gazeW = { head, eyes: eyesW }; };
  ch.expr = (name, w = 1) => { const e = EXPR[name]; if (!e) return console.warn('ifade yok:', name); for (const k in e) ch.face[k] += e[k] * w; };
  ch.walk = (phase, amount = 1, opts = {}) => { ch._synced = false; applyWalk(ch.pose, phase, amount, opts); };
  ch.say = (lip, t0) => { ch.speech = lip ? { ...lip, t0 } : null; };
  const sync = () => { if (!ch._synced) ch.update(ch.lastT || 0); };
  ch.sync = sync;
  ch.headWorld = (out = V()) => { sync(); return bones.face.getWorldPosition(out); };
  ch.eyeWorld = (out = V()) => { sync(); const a = eyes.l.socket.getWorldPosition(V()); const b = eyes.r.socket.getWorldPosition(V()); return out.copy(a).add(b).multiplyScalar(0.5); };
  ch.boneWorld = (name, out = V()) => { sync(); return bones[name].getWorldPosition(out); };

  ch.update = (t) => {
    ch.lastT = t; ch._synced = true;
    const P = ch.pose, Fc = ch.face;
    // --- nefes & boşta hareket ---
    const br = Math.sin(t * 2 * Math.PI / 4.2 + spec.name.length) * ch.breath;
    const id = ch.idle;
    // --- gövde pozları ---
    bones.hips.position.y = 0.88 + (P.hips.y || 0) + br * 0.002;
    bones.hips.position.x = P.hips.x || 0; bones.hips.position.z = P.hips.z || 0;
    setRot(bones.hips, P.hips.rot[0] + fbm1(t * 0.25 + 3) * 0.01 * id, P.hips.rot[1], P.hips.rot[2] + fbm1(t * 0.2 + 9) * 0.012 * id);
    setRot(bones.spine, P.spine[0] - br * 0.008, P.spine[1], P.spine[2]);
    setRot(bones.chest, P.chest[0] - br * 0.012, P.chest[1], P.chest[2]);
    bones.chest.scale.set(1 + br * 0.006, 1, 1 + br * 0.01);
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      const sh = P[s + 'Shoulder'], el = P[s + 'Elbow'], wr = P[s + 'Wrist'];
      const sway = fbm1(t * 0.3 + sx * 5) * 0.025 * id;
      bones[s + 'Shoulder'].rotation.set(-(sh[0] + sway), sx * sh[2], sx * (sh[1] + 0.06 + br * 0.008));
      bones[s + 'Elbow'].rotation.set(-el[0], sx * (el[1] || 0), 0);
      bones[s + 'Wrist'].rotation.set(-wr[0], sx * (wr[2] || 0), sx * (wr[1] || 0));
      const hp = P[s + 'Hip'];
      bones[s + 'Hip'].rotation.set(-hp[0], sx * (hp[2] || 0), sx * hp[1]);
      bones[s + 'Knee'].rotation.set(P[s + 'Knee'], 0, 0);
      bones[s + 'Ankle'].rotation.set(-P[s + 'Ankle'], 0, 0);
      hands[s].setShape(P[s + 'Hand']);
    }
    // --- baş & bakış ---
    const micro = (k) => fbm1(t * 0.45 + k) * 0.02 * id;
    let nx = P.neck[0], ny = P.neck[1], nz = P.neck[2], hx = P.head[0] + micro(1), hy = P.head[1] + micro(2), hz = P.head[2] + micro(3) * 0.5;
    setRot(bones.neck, nx, ny, nz); setRot(bones.head, hx, hy, hz);
    root.updateMatrixWorld(true);
    for (const s of ['l', 'r']) if (ch.ik[s]) solveArmIK(bones, s, ch.ik[s], ch.ik[s + 'W'] ?? 1);
    if (ch.gaze && ch.gazeW.head > 0) {
      // boyun tabanı çerçevesinde hedef yönü
      const inv = new THREE.Matrix4().copy(bones.chest.matrixWorld).invert();
      const local = ch.gaze.clone().applyMatrix4(inv).sub(V(0, 0.32, 0));
      const yaw = Math.atan2(local.x, local.z), pitch = -Math.atan2(local.y, Math.hypot(local.x, local.z));
      const w = ch.gazeW.head;
      const cy = clamp(yaw, -1.3, 1.3) * w, cp = clamp(pitch, -0.7, 0.8) * w;
      setRot(bones.neck, nx + cp * 0.4, ny + cy * 0.4, nz);
      setRot(bones.head, hx + cp * 0.6, hy + cy * 0.6, hz);
      root.updateMatrixWorld(true);
    }
    // gözler
    let eyeYaw = Fc.eyeX, eyePitch = Fc.eyeY;
    if (ch.gaze && ch.gazeW.eyes > 0) {
      const inv = new THREE.Matrix4().copy(bones.face.matrixWorld).invert();
      const local = ch.gaze.clone().applyMatrix4(inv);
      const ey = Math.atan2(local.x, local.z), ep = -Math.atan2(local.y - F.eyeY, Math.hypot(local.x, local.z));
      eyeYaw += clamp(ey, -0.6, 0.6) * ch.gazeW.eyes; eyePitch += clamp(ep, -0.45, 0.5) * ch.gazeW.eyes;
    }
    // sakkadlar (küçük göz sıçramaları)
    const sk = Math.floor(t * 1.3 + spec.name.length * 3.1);
    const sr = rng(sk * 977 + spec.name.charCodeAt(0));
    eyeYaw += (sr() - 0.5) * 0.04 * id; eyePitch += (sr() - 0.5) * 0.03 * id;
    // göz kırpma
    let blink = Fc.blink;
    if (ch.autoBlink) {
      const period = 3.6; const k = Math.floor(t / period); const r2 = rng(k * 131 + spec.name.charCodeAt(1));
      const bt = k * period + r2() * (period - 0.4);
      const dt = t - bt; if (dt > 0 && dt < 0.2) blink = Math.max(blink, Math.sin((dt / 0.2) * Math.PI));
      if (r2() < 0.25) { const dt2 = dt - 0.28; if (dt2 > 0 && dt2 < 0.18) blink = Math.max(blink, Math.sin((dt2 / 0.18) * Math.PI)); }
    }
    blink = clamp(blink);
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1; const E = eyes[s];
      const conv = ch.gaze ? clamp(0.04 / Math.max(0.3, ch.gaze.distanceTo(ch.headWorld())), 0, 0.12) : 0.01;
      E.ball.rotation.set(eyePitch, eyeYaw - sx * conv - sx * 0.12 + sx * 0.12, 0);
      E.ball.rotation.y = eyeYaw - sx * conv;
      const ps = clamp(Fc.pupil, 0.4, 1.6);
      E.eye.scale.set(1, 1, 1); E.eMat.userData.pupil = ps;
      // kapaklar
      const asym = s === 'l' ? Fc.lidL : Fc.lidR;
      const wide = clamp(Fc.lidUp + asym, -1, 1);
      let uOpen = -0.47 - wide * 0.18 + Math.max(0, eyePitch) * 0.5 - Math.min(0, eyePitch) * 0.35;
      const uClosed = 0.24;
      const up = lerp(uOpen, uClosed, blink);
      E.upper.rotation.x = up;
      let lOpen = 0.62 - Fc.squint * 0.33 + Math.max(0, eyePitch) * 0.25 + Math.max(0, Fc.smile) * 0.08;
      E.lower.rotation.x = lerp(lOpen, 0.22, blink * 0.9);
      // dijital parlama (beyaz gözler)
      const g = Fc.eyeGlow;
      E.eMat.emissive.setRGB(0.7 * g, 0.92 * g, 1.0 * g); E.eMat.emissiveIntensity = 2.2;
      // parıltı
      const cd = ch.catchlight.dir.clone().normalize();
      E.cl.position.copy(cd).multiplyScalar(F.eyeR * 1.03 + F.eyeR * 0.02);
      E.cl.lookAt(E.cl.position.clone().multiplyScalar(2).applyMatrix4(E.socket.matrixWorld));
      E.cl.quaternion.setFromUnitVectors(V(0, 0, 1), cd);
      E.cl.visible = ch.catchlight.on > 0 && blink < 0.6;
    }
    // konuşma → ağız
    let open = Fc.open, wideM = Fc.wide, round = Fc.round;
    if (ch.speech) {
      const S = ch.speech; const lt = t - S.t0; const i = lt * S.rate;
      if (i >= 0 && i < S.env.length - 1) {
        const i0 = Math.floor(i), k = i - i0;
        const e = lerp(S.env[i0], S.env[i0 + 1], k);
        const sh = S.shape ? lerp(S.shape[i0], S.shape[i0 + 1], k) : 0;
        open += e * 0.85 * (S.gain ?? 1);
        wideM += sh > 0 ? sh * 0.6 * e : 0; round += sh < 0 ? -sh * 0.8 * e : 0;
      }
    }
    buildBrows(Fc);
    buildMouth(clamp(open, 0, 1.2), Fc.smile, wideM, round, Fc.teeth, Fc.sneer);
    for (const k in ch.extras) ch.extras[k].update && ch.extras[k].update(t, ch);
    root.updateMatrixWorld(true);
  };

  // ---- kaş geometrisi ----
  function buildBrows(Fc) {
    const NB = 16, NA = 6;
    const hMax = Math.min(F.browThick, 0.013) * 1.15;
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      const up = Fc.browUp + (s === 'l' ? Fc.browL : Fc.browR);
      const cu = [], cv = [], hh = [];
      for (let i = 0; i <= NB; i++) {
        const k = i / NB; // 0 iç → 1 dış
        let u = 0.0135 + k * 0.06 * F.browLen;
        let v = F.eyeY + F.eyeR + 0.0175 + F.browY;
        v += 0.0072 * F.browArch * Math.sin(Math.PI * Math.pow(k, 0.8)) * (1 - 0.35 * Fc.browIn) - 0.0035 * k * k + F.browTilt * (k - 0.5) * 0.01;
        v += up * 0.0105 * (0.8 + 0.2 * k) + Math.max(0, up) * 0.003 * Math.sin(Math.PI * k);
        v += -Fc.browIn * 0.0105 * Math.pow(1 - k, 1.3) + Fc.browIn * 0.002 * k;
        v += Fc.browSad * (0.012 * Math.pow(1 - k, 1.5) - 0.004 * k);
        u -= (Fc.browIn * 0.005 + Fc.browSad * 0.002) * Math.pow(1 - k, 1.5);
        cu.push(u * sx); cv.push(v);
        const prof = k < 0.14 ? 0.62 + 0.38 * smoothstep(0, 0.14, k) : 1 - 0.75 * Math.pow((k - 0.14) / 0.86, 1.35);
        hh.push(hMax * prof * (1 + 0.12 * Math.max(0, Fc.browIn)));
      }
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= NB; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(NB, i + 1);
        let tu = cu[i1] - cu[i0], tv = cv[i1] - cv[i0]; const tl = Math.hypot(tu, tv); tu /= tl; tv /= tl;
        let nu = -tv, nv = tu; if (nv < 0) { nu = -nu; nv = -nv; }
        for (let j = 0; j <= NA; j++) {
          const a = (j / NA) * 2 - 1;
          const p = facePoint(cu[i] + nu * a * hh[i] * 0.5, cv[i] + nv * a * hh[i] * 0.5, 0.0008 + 0.0012 * Math.sqrt(Math.max(0, 1 - a * a)) * (hh[i] / hMax));
          pos.push(p.x, p.y, p.z); uv.push(s === 'l' ? i / NB : i / NB, j / NA);
        }
      }
      for (let i = 0; i < NB; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; if (sx > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      browMeshes[s].geometry.dispose(); browMeshes[s].geometry = g;
    }
  }

  // ---- ağız geometrisi ----
  function buildMouth(open, smile, wideM, round, teethAmt, sneer) {
    const my = F.mouthY;
    const hw = (F.mouthW / 2) * (1 + 0.22 * wideM - 0.38 * clamp(round, 0, 1) + 0.16 * Math.max(0, smile));
    const cv = smile * 0.0095;
    const gap = open * 0.036 * (1 + 0.25 * round) * (1 - 0.15 * Math.max(0, smile));
    const vUc = 0.003 * open + 0.0015;
    const vLc = -gap - 0.0005 + 0.002 * open;
    const N = 22;
    const upperPts = [], lowerPts = [];
    const upper = (u) => { const f = Math.max(0, 1 - (u / hw) ** 2); return cv + (vUc - cv) * Math.pow(f, 0.6) - 0.0012 * Math.exp(-((u / 0.007) ** 2)) * (1 - open) + sneer * (u / hw) * 0.004; };
    const lower = (u) => { const f = Math.max(0, 1 - (u / hw) ** 2); return cv + (vLc - cv) * Math.pow(f, 0.55 + clamp(round, 0, 1) * 0.35 + Math.max(0, smile) * 0.25) - 0.0012 * (1 - open) * f + sneer * (u / hw) * 0.003; };
    for (let i = 0; i <= N; i++) { const u = -hw + (2 * hw * i) / N; upperPts.push([u, upper(u)]); lowerPts.push([u, lower(u)]); }
    // iç boşluk (renkli şerit)
    const pos = [], col = [], idx = [];
    const ROWS = 5; const cIn = new THREE.Color(0x14040a), cEdge = new THREE.Color(0x5a1a1e);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= ROWS; j++) {
      const k = j / ROWS; const u = upperPts[i][0]; const v = lerp(upperPts[i][1], lowerPts[i][1], k);
      const p = facePoint(u, my + v, 0.0007); pos.push(p.x, p.y, p.z);
      const e = Math.min(k, 1 - k) * 2 * (1 - Math.abs(u / hw)); const c = cEdge.clone().lerp(cIn, clamp(e * 1.6)); col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < ROWS; j++) { const a = i * (ROWS + 1) + j, b = a + ROWS + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    setGeo(mouth.inner, pos, idx, col);
    // dişler
    const tp = [], ti = []; const TH = 0.0075 * clamp(teethAmt, 0, 1.4);
    if (open > 0.04 && TH > 0) {
      const cols = 16;
      for (let i = 0; i <= cols; i++) {
        const u = -hw * 0.78 + (1.56 * hw * i) / cols; const vu = upper(u); const vl = lower(u);
        const bot = Math.max(vu - TH * (1 - 0.35 * (u / hw) ** 2), vl + 0.0005);
        const a = facePoint(u, my + vu - 0.0003, 0.0011), b = facePoint(u, my + bot, 0.0011);
        tp.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      for (let i = 0; i < cols; i++) { const a = i * 2; ti.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    }
    setGeo(mouth.teeth, tp, ti);
    // dil
    const gp = [], gi = [];
    if (open > 0.25) {
      const cols = 12;
      for (let i = 0; i <= cols; i++) {
        const u = -hw * 0.45 + (0.9 * hw * i) / cols; const vl = lower(u); const vu = upper(u);
        const h = Math.min((vu - vl) * 0.35, 0.009) * Math.sqrt(1 - ((u / (hw * 0.45)) ** 2) * 0.9);
        const a = facePoint(u, my + vl + 0.0004, 0.0012), b = facePoint(u, my + vl + h, 0.0012);
        gp.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      for (let i = 0; i < cols; i++) { const a = i * 2; gi.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    }
    setGeo(mouth.tongue, gp, gi);
    // dudaklar
    const lf = F.lipFull;
    const up3 = upperPts.map(([u, v]) => facePoint(u, my + v + 0.0018 * lf, 0.0012));
    const lo3 = lowerPts.map(([u, v]) => facePoint(u, my + v - 0.0024 * lf, 0.0014));
    const ru = upperPts.map(([u]) => 0.0024 * lf * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - (u / hw) ** 2))));
    const rl = lowerPts.map(([u]) => 0.0034 * lf * (0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - (u / hw) ** 2))));
    mouth.upper.geometry.dispose(); mouth.upper.geometry = tubeVar(up3, ru, 8, N, 1.25);
    mouth.lower.geometry.dispose(); mouth.lower.geometry = tubeVar(lo3, rl, 8, N, 1.25);
    // kapalıyken çizgi
    if (open < 0.12) {
      const cr = upperPts.map(([u, v], i) => facePoint(u * 1.04, my + (v + lowerPts[i][1]) * 0.5, 0.0016));
      mouth.crease.geometry.dispose(); mouth.crease.geometry = tubeVar(cr, cr.map(() => 0.0009), 5, N, 1);
      mouth.crease.visible = true;
    } else mouth.crease.visible = false;
  }

  ch.reset();
  ch.update(0);
  return ch;
}

function setRot(o, x, y, z) { o.rotation.set(x, y, z); }

// Kol IK: omuz [öne, yana, burma] + dirsek bükme parametrelerinde koordinat inişi.
const _tip = new THREE.Vector3();
function solveArmIK(bones, s, target, w = 1) {
  const sx = s === 'l' ? 1 : -1; const S = bones[s + 'Shoulder'], E = bones[s + 'Elbow'], Wr = bones[s + 'Wrist'];
  const r0 = S.rotation.clone(), e0 = E.rotation.x;
  let P = [-r0.x, sx * r0.z, sx * r0.y, -e0]; // fwd, out(+0.06 dahil), twist, elbow
  const apply = (q) => { S.rotation.set(-q[0], sx * q[2], sx * q[1]); E.rotation.set(-q[3], E.rotation.y, 0); S.updateMatrixWorld(true); };
  const cost = (q) => { apply(q); _tip.set(0, -0.075, 0.012).applyMatrix4(Wr.matrixWorld); return _tip.distanceToSquared(target) + 0.0004 * (q[2] * q[2]); };
  let best = cost(P);
  for (const step of [0.3, 0.15, 0.07, 0.03, 0.012]) {
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 0; i < 4; i++) for (const d of [step, -step]) {
        const q = P.slice(); q[i] += d; if (i === 3) q[3] = Math.min(2.6, Math.max(0.02, q[3]));
        const c = cost(q); if (c < best) { best = c; P = q; improved = true; }
      }
      if (!improved) break;
    }
  }
  const q0 = [-r0.x, sx * r0.z, sx * r0.y, -e0];
  apply(q0.map((v, i) => v + (P[i] - v) * w));
}

function setGeo(mesh, pos, idx, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (idx.length) g.setIndex(idx);
  g.computeVertexNormals();
  mesh.geometry.dispose(); mesh.geometry = g;
}

// Değişken yarıçaplı tüp (noktalar boyunca). flat: kesit yassılığı (>1: yatay geniş)
export function tubeVar(points, radii, radial = 6, segs = 16, flat = 1) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const n = segs; const pos = [], nor = [], idx = [];
  const up = V(0, 0, 1);
  for (let i = 0; i <= n; i++) {
    const s = i / n; const p = curve.getPointAt(s); const T = curve.getTangentAt(s);
    const rf = s * (radii.length - 1); const r0 = Math.floor(rf); const r = lerp(radii[r0], radii[Math.min(radii.length - 1, r0 + 1)], rf - r0);
    let Bn = V().crossVectors(T, up); if (Bn.lengthSq() < 1e-6) Bn.set(0, 1, 0); Bn.normalize();
    const N = V().crossVectors(Bn, T).normalize();
    const endK = Math.min(1, Math.min(s, 1 - s) * n * 0.6 + 0.35);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nx = Math.cos(a), ny = Math.sin(a);
      const v = p.clone().addScaledVector(N, nx * r * endK).addScaledVector(up, ny * r * endK / flat);
      const nn = V().addScaledVector(N, nx).addScaledVector(up, ny).normalize();
      pos.push(v.x, v.y, v.z); nor.push(nn.x, nn.y, nn.z);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * row + j, b = a + row; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export function neutralFace() {
  return { browUp: 0, browIn: 0, browSad: 0, browL: 0, browR: 0, lidUp: 0, lidL: 0, lidR: 0, blink: 0, squint: 0, smile: 0, open: 0, wide: 0, round: 0, teeth: 0.7, sneer: 0, eyeX: 0, eyeY: 0, pupil: 1, eyeGlow: 0 };
}

export const EXPR = {
  happy: { smile: 0.8, squint: 0.35, browUp: 0.25, lidUp: 0.1 },
  grin: { smile: 1, open: 0.35, squint: 0.4, browUp: 0.3, teeth: 0.4 },
  angry: { browIn: 1, browUp: -0.4, lidUp: 0.15, squint: 0.3, smile: -0.35, sneer: 0.2 },
  scared: { browSad: 0.8, browUp: 0.7, lidUp: 0.9, smile: -0.35, open: 0.15, pupil: -0.3 },
  surprised: { browUp: 1, lidUp: 1, open: 0.45, round: 0.4 },
  sad: { browSad: 1, lidUp: -0.35, smile: -0.5 },
  worried: { browSad: 0.65, browIn: 0.25, smile: -0.25, lidUp: 0.15 },
  focused: { browIn: 0.45, squint: 0.3, lidUp: -0.15, smile: -0.05 },
  determined: { browIn: 0.6, browUp: -0.2, smile: -0.1, squint: 0.2 },
  pain: { browIn: 0.7, browSad: 0.6, squint: 0.8, lidUp: -0.6, smile: -0.4, open: 0.2, teeth: 1 },
  shock: { browUp: 1, lidUp: 1, open: 0.6, round: 0.3, pupil: -0.4 },
  smirk: { smile: 0.45, sneer: 0.6, browL: 0.25, squint: 0.15 },
  tired: { lidUp: -0.55, browSad: 0.2, smile: -0.1 },
  sadSmile: { smile: 0.45, browSad: 0.7, squint: 0.25 },
  suspicious: { browIn: 0.35, browL: 0.35, squint: 0.45, smile: -0.1 },
};

// ---------- el ----------
function buildHand(side, mat, sc = 1) {
  const sx = side === 'l' ? 1 : -1;
  const root = new THREE.Group(); root.scale.setScalar(sc);
  const palm = new THREE.Mesh(roundedBox(0.03, 0.085, 0.078, 0.013, 3), mat);
  palm.position.set(0, -0.045, 0.004); root.add(palm);
  const fingers = [];
  const spec = [ // z konumu, uzunluklar, yarıçap
    [0.027, [0.036, 0.024, 0.02], 0.0088],
    [0.009, [0.04, 0.027, 0.021], 0.0092],
    [-0.009, [0.037, 0.025, 0.02], 0.0088],
    [-0.026, [0.03, 0.02, 0.017], 0.0078],
  ];
  for (const [z, lens, r] of spec) {
    let parent = root; const joints = [];
    let y = -0.085;
    for (let i = 0; i < 3; i++) {
      const j = new THREE.Group(); j.position.set(0, i === 0 ? y : -lens[i - 1], i === 0 ? z : 0); parent.add(j);
      const m = new THREE.Mesh(limb(lens[i], [[0, r * (1 - i * 0.08)], [1, r * (0.92 - i * 0.08)]], 12, 6), mat);
      j.add(m); joints.push(j); parent = j;
    }
    fingers.push(joints);
  }
  // başparmak
  const tb = new THREE.Group(); tb.position.set(-sx * 0.004, -0.022, 0.036); tb.rotation.set(0.5, 0, sx * 0.25); root.add(tb);
  const t1 = new THREE.Mesh(limb(0.034, [[0, 0.0115], [1, 0.0098]], 12, 6), mat); tb.add(t1);
  const tb2 = new THREE.Group(); tb2.position.set(0, -0.034, 0); tb.add(tb2);
  tb2.add(new THREE.Mesh(limb(0.026, [[0, 0.0098], [1, 0.0088]], 12, 6), mat));
  const thumb = [tb, tb2];
  function setShape(shape) {
    let c = shape;
    if (typeof shape === 'string') c = HANDS[shape] || HANDS.relaxed;
    if (!c) c = HANDS.relaxed;
    // c: [başparmak, işaret, orta, yüzük, serçe]
    for (let f = 0; f < 4; f++) {
      const k = c[f + 1];
      fingers[f][0].rotation.set(0, 0, -sx * k * 1.25 * -1 * -1);
      fingers[f][0].rotation.z = -sx * k * 1.3;
      fingers[f][1].rotation.z = -sx * k * 1.5;
      fingers[f][2].rotation.z = -sx * k * 1.1;
      fingers[f][0].rotation.x = (f - 1.5) * 0.06 * (1 - k);
    }
    const tk = c[0];
    thumb[0].rotation.set(0.5 + tk * 0.35, 0, sx * (0.25 + tk * 0.45));
    thumb[1].rotation.z = -sx * tk * 0.9;
  }
  return { root, setShape, palm };
}

// ---------- yürüyüş ----------
function applyWalk(P, phase, amount, opts = {}) {
  if (amount <= 0) return;
  const a = amount; const s = phase * Math.PI; // bir adım = pi
  const run = opts.run || 0;
  const stride = (opts.stride ?? 1) * (1 + run * 0.6);
  const L = Math.sin(s), R = -L;
  const add = (k, i, v) => { P[k][i] += v * a; };
  add('lHip', 0, L * 0.42 * stride); add('rHip', 0, R * 0.42 * stride);
  P.lKnee += a * (Math.max(0, -Math.cos(s + 0.6)) * 0.75 * stride + 0.08 + run * 0.5 * Math.max(0, Math.sin(s - 0.9)));
  P.rKnee += a * (Math.max(0, Math.cos(s + 0.6)) * 0.75 * stride + 0.08 + run * 0.5 * Math.max(0, -Math.sin(s - 0.9)));
  P.lAnkle += a * (Math.cos(s) * 0.18); P.rAnkle += a * (-Math.cos(s) * 0.18);
  add('lShoulder', 0, -L * 0.35 * stride * (1 + run)); add('rShoulder', 0, -R * 0.35 * stride * (1 + run));
  P.lElbow[0] += a * (0.25 + run * 0.9 + Math.max(0, -L) * 0.2); P.rElbow[0] += a * (0.25 + run * 0.9 + Math.max(0, -R) * 0.2);
  P.hips.y += a * (Math.abs(Math.cos(s)) * 0.02 - 0.015 - run * 0.03);
  P.hips.rot[1] += a * L * 0.08; P.chest[1] -= a * L * 0.1; P.hips.rot[2] += a * Math.cos(s) * 0.03;
  P.spine[0] += a * run * 0.2;
}

// ---------- varsayılan kıyafet ----------
// opts: { top, topMat, sleeve:'long'|'short'|'none', bottom, bottomMat, shoes, shoeMat, sole }
export function defaultOutfit(ctx, o = {}) {
  const { bones, geo, materials, spec, mats } = ctx;
  const B = spec.body;
  const top = o.topMat || materials.charMaterial(o.top ?? 0x445566, { roughness: 0.8 });
  const bottom = o.bottomMat || materials.charMaterial(o.bottom ?? 0x2a3040, { roughness: 0.85 });
  const shoe = o.shoeMat || materials.charMaterial(o.shoes ?? 0x222222, { roughness: 0.6 });
  const sole = materials.charMaterial(o.sole ?? 0xe8e4dc, { roughness: 0.7 });
  const parts = {};
  // gövde (göğüs) — chest kemiğine
  const torsoProfile = o.torsoProfile || [
    [B.waistR * 0.98, -0.2], [B.waistR, -0.15], [B.waistR * 1.06, -0.06], [B.chestR, 0.04], [B.chestR * 1.03, 0.1], [B.chestR * 0.97, 0.15], [B.chestR * 0.8, 0.185], [B.neckR * 1.5, 0.205], [B.neckR * 1.15, 0.215],
  ];
  parts.torsoProfile = torsoProfile; parts.torsoSX = o.torsoSX ?? 1.22; parts.torsoSZ = B.chestZ;
  parts.torso = new THREE.Mesh(geo.lathe(torsoProfile, 48, parts.torsoSX, B.chestZ), top);
  bones.chest.add(parts.torso);
  // pelvis — hips kemiğine
  parts.pelvis = new THREE.Mesh(geo.lathe([
    [0.02, -0.12], [B.hipR * 0.8, -0.1], [B.hipR, -0.04], [B.hipR * 1.0, 0.04], [B.waistR * 1.02, 0.1], [B.waistR * 0.98, 0.16],
  ], 40, 1.18, 0.8), bottom);
  bones.hips.add(parts.pelvis);
  // kollar
  const armR = 0.044 * (B.armR ?? 1);
  for (const s of ['l', 'r']) {
    const sleeveMat = o.sleeve === 'none' ? mats.skinPlain : top;
    const ua = new THREE.Mesh(geo.limb(0.255, [[0, armR * 1.15], [0.5, armR * 1.02], [1, armR * 0.88]], 24, 14), sleeveMat);
    bones[s + 'Shoulder'].add(ua);
    const sb = new THREE.Mesh(new THREE.SphereGeometry(armR * 1.04, 24, 16), sleeveMat); sb.scale.set(0.85, 0.9, 1); sb.position.set(s === 'l' ? -0.014 : 0.014, -0.01, 0); bones[s + 'Shoulder'].add(sb);
    const faMat = o.sleeve === 'long' || !o.sleeve ? top : mats.skinPlain;
    const fa = new THREE.Mesh(geo.limb(0.22, [[0, armR * 0.86], [0.6, armR * 0.78], [1, armR * 0.62]], 24, 14), faMat);
    bones[s + 'Elbow'].add(fa);
    const eb = new THREE.Mesh(new THREE.SphereGeometry(armR * 0.9, 20, 14), faMat); bones[s + 'Elbow'].add(eb);
    const wb = new THREE.Mesh(new THREE.SphereGeometry(armR * 0.6, 16, 12), mats.skinPlain); wb.position.y = -0.01; bones[s + 'Wrist'].add(wb);
    if (o.sleeve === 'short') { const cuff = new THREE.Mesh(geo.limb(0.12, [[0, armR * 1.25], [1, armR * 1.12]], 24, 6), top); bones[s + 'Shoulder'].add(cuff); }
    parts[s + 'UpperArm'] = ua; parts[s + 'Forearm'] = fa;
    // bacaklar
    const legR = 0.068 * (B.legR ?? 1);
    const th = new THREE.Mesh(geo.limb(0.385, [[0, legR * 1.1], [0.5, legR * 0.95], [1, legR * 0.78]], 28, 14), bottom);
    bones[s + 'Hip'].add(th);
    const hb = new THREE.Mesh(new THREE.SphereGeometry(legR * 1.08, 24, 16), bottom); bones[s + 'Hip'].add(hb);
    const sh = new THREE.Mesh(geo.limb(0.355, [[0, legR * 0.8], [0.4, legR * 0.78], [1, legR * 0.66]], 28, 14), bottom);
    bones[s + 'Knee'].add(sh);
    const kb = new THREE.Mesh(new THREE.SphereGeometry(legR * 0.8, 20, 14), bottom); bones[s + 'Knee'].add(kb);
    // ayakkabı
    if (o.footwear) { const f = o.footwear(s); bones[s + 'Ankle'].add(f); parts[s + 'Shoe'] = f; parts[s + 'Thigh'] = th; parts[s + 'Shin'] = sh; continue; }
    const sg = geo.roundedBox(0.1, 0.075, 0.25, 0.035, 4);
    const sm = new THREE.Mesh(sg, shoe); sm.position.set(0, -0.045, 0.045); bones[s + 'Ankle'].add(sm);
    const so = new THREE.Mesh(geo.roundedBox(0.104, 0.022, 0.258, 0.01, 3), sole); so.position.set(0, -0.075, 0.045); bones[s + 'Ankle'].add(so);
    parts[s + 'Thigh'] = th; parts[s + 'Shin'] = sh; parts[s + 'Shoe'] = sm;
  }
  return parts;
}

// ---------- doku boyama ----------
function paintSkin(spec) {
  const F = spec.face; const base = new THREE.Color(spec.skin);
  const W = 1024, Hh = 512;
  const R = rng(spec.name.length * 71 + 5);
  const fr = [];
  for (let i = 0; i < Math.round(F.freckles * 140); i++) {
    const sx = R() < 0.5 ? -1 : 1;
    const d = V(sx * (0.12 + R() * 0.55), -0.05 - R() * 0.42, 0.9).normalize();
    if (Math.abs(d.x) < 0.1 && d.y > -0.2) continue;
    fr.push([d, 0.006 + R() * 0.009, 0.25 + R() * 0.5]);
  }
  return canvasTexture(W, Hh, (g) => {
    const img = g.createImageData(W, Hh); const d = V();
    const blushC = new THREE.Color(0xe0605a), stub = new THREE.Color(F.stubbleColor);
    const cheekL = V(0.55, -0.32, 0.77).normalize(), cheekR = V(-0.55, -0.32, 0.77).normalize();
    const noseT = V(0, -0.25, 0.97).normalize();
    const ueL = V(F.eyeX / spec.head.rx * 0.95, (F.eyeY - F.eyeR * 1.25) / spec.head.ry, 0.86).normalize(), ueR = V(-ueL.x, ueL.y, ueL.z);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      dirFromUV(x / W, y / Hh, d);
      const c = base.clone();
      const n = fbm1(x * 0.07 + y * 13.1) * 0.012;
      c.offsetHSL(0, 0, n);
      const bl = F.blush * (Math.exp(-d.distanceToSquared(cheekL) / 0.05) + Math.exp(-d.distanceToSquared(cheekR) / 0.05) + 0.5 * Math.exp(-d.distanceToSquared(noseT) / 0.02));
      c.lerp(blushC, clamp(bl * 0.32));
      if (F.underEye) {
        const ue = Math.exp(-d.distanceToSquared(ueL) / 0.006) + Math.exp(-d.distanceToSquared(ueR) / 0.006);
        c.lerp(new THREE.Color(0x6a4040), clamp(ue * F.underEye * 0.35));
      }
      if (F.stubble > 0) {
        const jaw = smoothstep(-0.05, -0.45, d.y) * smoothstep(-0.2, 0.4, d.z) * (1 - Math.exp(-((d.x / 0.08) ** 2) - (((d.y + 0.3) / 0.12) ** 2)) * 0.6);
        const lipArea = Math.exp(-(((d.y + 0.43) / 0.07) ** 2)) * Math.exp(-((d.x / 0.3) ** 2)) * smoothstep(0.6, 0.9, d.z);
        const s = clamp(jaw * 1.1 + lipArea * 0.8) * F.stubble;
        const dots = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        c.lerp(stub, s * (0.35 + Math.abs(dots) * 0.25));
      }
      for (const [fd, rad, a] of fr) {
        const q = d.distanceTo(fd); if (q < rad) c.lerp(new THREE.Color(0x9a5a3a), a * (1 - q / rad) * 0.9);
      }
      if (F.scar) {
        const sd = F.scar.dir; const q = d.distanceTo(sd);
        if (q < F.scar.len) { const across = Math.abs((d.x - sd.x) * Math.cos(F.scar.ang) - (d.y - sd.y) * Math.sin(F.scar.ang)); if (across < 0.004) c.lerp(new THREE.Color(0xd8a094), 0.7); }
      }
      const i = (y * W + x) * 4;
      // canvas sRGB bekler: renk zaten sRGB tanımlı (Color .r g b doğrusal) → sRGB'ye çevir
      const s = c.clone().convertLinearToSRGB();
      img.data[i] = s.r * 255; img.data[i + 1] = s.g * 255; img.data[i + 2] = s.b * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

function browTexture() {
  const W = 256, Hh = 64; const R = rng(4242);
  return canvasTexture(W, Hh, (g) => {
    g.clearRect(0, 0, W, Hh);
    const grd = g.createLinearGradient(0, 0, 0, Hh);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.22, 'rgba(255,255,255,0.8)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.97)'); grd.addColorStop(0.78, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
    g.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      const x = R() * W, y = Hh * (0.12 + R() * 0.76);
      const k = x / W; const ang = -Math.PI / 2 + (0.35 + k * 0.95) + (R() - 0.5) * 0.3;
      const len = 6 + R() * 10; const sh = 0.55 + R() * 0.45;
      g.strokeStyle = `rgba(${Math.round(255 * sh)},${Math.round(255 * sh)},${Math.round(255 * sh)},${0.5 + R() * 0.5})`;
      g.lineWidth = 1 + R() * 1.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y - Math.sin(ang) * len * 0.6); g.stroke();
    }
  }, { srgb: true });
}

function paintIris(F) {
  const W = 512, Hh = 256;
  const ic = new THREE.Color(F.iris), ic2 = new THREE.Color(F.iris2), sc = new THREE.Color(F.sclera);
  const irisA = Math.asin(F.irisSize) / Math.PI; // satır oranı
  const pupA = irisA * F.pupil;
  return canvasTexture(W, Hh, (g) => {
    const img = g.createImageData(W, Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const th = y / Hh; const az = (x / W) * Math.PI * 2;
      let c;
      if (th < pupA) c = new THREE.Color(0x050302);
      else if (th < irisA) {
        const k = (th - pupA) / (irisA - pupA);
        const fib = 0.5 + 0.5 * Math.sin(az * 38 + Math.sin(az * 7) * 2) * Math.sin(az * 17 + 1.3);
        c = ic2.clone().lerp(ic, clamp(0.25 + k * 0.9 + fib * 0.2));
        c.lerp(new THREE.Color(0xffd28a), Math.exp(-(((k - 0.25) / 0.12) ** 2)) * 0.25); // iç halka parıltısı
        c.multiplyScalar(1 - smoothstep(0.82, 1.0, k) * 0.75); // limbal halka
      } else {
        const k = (th - irisA) / (1 - irisA);
        c = sc.clone().lerp(new THREE.Color(0xd9b0a8), smoothstep(0.15, 0.6, k) * 0.6);
        c.multiplyScalar(1 - smoothstep(0, 0.06, k) * 0 - smoothstep(0.0, 0.03, k) * 0.0);
        if (k < 0.04) c.multiplyScalar(0.75 + k / 0.04 * 0.25);
      }
      const i = (y * W + x) * 4; const s = c.convertLinearToSRGB();
      img.data[i] = s.r * 255; img.data[i + 1] = s.g * 255; img.data[i + 2] = s.b * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
