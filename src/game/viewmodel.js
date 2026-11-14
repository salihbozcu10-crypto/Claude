// Birinci şahıs silah ve kol modelleri (prosedürel): karabina + tabanca
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { globalUniforms } from '../gfx/materials.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// Parçaları malzemeye göre toplayıp tek ağda birleştirir
class Parts {
  constructor() { this.map = new Map(); }
  push(mat, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz, 'XYZ'); _q.setFromEuler(_e); _p.set(x, y, z); g.applyMatrix4(_m.compose(_p, _q, _s));
    if (!g.index) { const n = g.attributes.position.count; const idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!this.map.has(mat)) this.map.set(mat, []); this.map.get(mat).push(g); return this;
  }
  box(mat, w, h, d, x, y, z, rx, ry, rz) { return this.push(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
  rbox(mat, w, h, d, x, y, z, r = 0.004, rx, ry, rz) { return this.push(mat, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), x, y, z, rx, ry, rz); }
  // z ekseni boyunca silindir (axis: 'z' | 'y' | 'x')
  cyl(mat, r, len, x, y, z, axis = 'z', seg = 14, rTop) { const g = new THREE.CylinderGeometry(rTop ?? r, r, len, seg); if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2); return this.push(mat, g, x, y, z); }
  // iki nokta arası kapsül (parmak, kol)
  cap(mat, a, b, r, r2) {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); const len = _a.distanceTo(_b);
    const g = r2 != null ? new THREE.CylinderGeometry(r2, r, len, 10) : new THREE.CapsuleGeometry(r, len, 3, 8);
    _q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize()); _p.copy(_a).add(_b).multiplyScalar(0.5); g.applyMatrix4(_m.compose(_p, _q, _s));
    return this.push(mat, g);
  }
  chain(mat, pts, r) { for (let i = 0; i < pts.length - 1; i++) this.cap(mat, pts[i], pts[i + 1], r); return this; }
  sphere(mat, r, x, y, z) { return this.push(mat, new THREE.SphereGeometry(r, 10, 8), x, y, z); }
  build(parent) {
    for (const [mat, list] of this.map) { const g = mergeGeometries(list, false); const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh); for (const l of list) l.dispose(); }
    return parent;
  }
}

// Paralakssız holografik retikül (sonsuzda odaklı)
function reticleMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { tRet: { value: tex }, uVmProj: globalUniforms.uVmProj, uAimF: { value: new THREE.Vector3(0, 0, -1) }, uAimR: { value: new THREE.Vector3(1, 0, 0) }, uAimU: { value: new THREE.Vector3(0, 1, 0) }, uSize: { value: 0.04 }, uBright: { value: 3.2 } },
    vertexShader: /* glsl */`uniform mat4 uVmProj; varying vec3 vView; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = mv.xyz; gl_Position = uVmProj * mv; gl_Position.z = 0.75 * gl_Position.z - 0.25 * gl_Position.w; }`,
    fragmentShader: /* glsl */`uniform sampler2D tRet; uniform vec3 uAimF; uniform vec3 uAimR; uniform vec3 uAimU; uniform float uSize; uniform float uBright; varying vec3 vView;
      void main(){ vec3 d = normalize(vView); float f = dot(d, uAimF); vec2 a = vec2(dot(d, uAimR), dot(d, uAimU)) / max(f, 0.001); vec2 uv = a / uSize + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard; vec4 t = texture2D(tRet, uv); gl_FragColor = vec4(t.rgb * uBright * t.a, t.a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// Dikey bir tutamağı kavrayan el (parmak eklem noktaları silindir çevresinde)
function wrapFingers(P, mat, cx, zc, R, ys, angles, r, zTilt = 0) {
  for (const y of ys) { const pts = angles.map((deg) => { const t = deg * Math.PI / 180; return [cx + R * Math.cos(t), y, zc(y) - R * Math.sin(t) + zTilt]; }); P.chain(mat, pts, r); }
}

function buildArms(V, kind) {
  const L = new THREE.Group(), Rg = new THREE.Group();
  // --- sol el: dikey ön tutamak (karabina) ya da tabancada destek el
  { const P = new Parts(); const R = 0.027;
    if (kind === 'rifle') {
      wrapFingers(P, V.glove, 0, () => 0, R, [-0.016, -0.036, -0.056, -0.074], [172, 118, 62, 8, -34], 0.0092);
      P.chain(V.glove, [[-0.03, -0.012, 0.012], [-0.012, -0.008, 0.03], [0.012, -0.008, 0.026]], 0.0105);
      P.rbox(V.glove, 0.03, 0.094, 0.074, -0.04, -0.047, 0.016, 0.012, 0, 0.12, 0); P.rbox(V.gloveDark, 0.012, 0.07, 0.03, -0.054, -0.044, -0.004, 0.005, 0, 0.12, 0);
      P.cap(V.glove, [-0.045, -0.06, 0.045], [-0.075, -0.09, 0.105], 0.032);
      P.cap(V.sleeve, [-0.07, -0.085, 0.095], [-0.34, -0.29, 0.46], 0.043, 0.06); P.cap(V.gloveDark, [-0.066, -0.082, 0.09], [-0.078, -0.092, 0.11], 0.044, 0.044);
      P.rbox(V.polymer, 0.04, 0.014, 0.042, -0.082, -0.056, 0.115, 0.004, 0.5, 0.0, 0.66); P.box(V.watch, 0.026, 0.002, 0.026, -0.0865, -0.0495, 0.1118, 0.5, 0.0, 0.66);
    } else {
      wrapFingers(P, V.glove, 0.0, () => 0.0, 0.03, [-0.012, -0.031, -0.05], [200, 150, 96, 42, 0], 0.0092);
      P.chain(V.glove, [[-0.028, 0.012, 0.02], [-0.026, 0.02, -0.01], [-0.022, 0.022, -0.04]], 0.0098);
      P.rbox(V.glove, 0.03, 0.08, 0.07, -0.038, -0.03, 0.02, 0.012); P.cap(V.glove, [-0.045, -0.05, 0.05], [-0.07, -0.085, 0.11], 0.031);
      P.cap(V.sleeve, [-0.066, -0.08, 0.1], [-0.3, -0.3, 0.46], 0.043, 0.06);
    }
    P.build(L); }
  // --- sağ el: tabanca kabzası
  { const P = new Parts(); const zc = (y) => 0.0 - (y + 0.0) * 0.36;
    wrapFingers(P, V.glove, 0, zc, 0.027, [-0.028, -0.048, -0.067], [-18, 40, 92, 142, 182], 0.0092);
    P.chain(V.glove, [[0.022, 0.014, 0.0], [0.024, 0.02, -0.035], [0.022, 0.022, -0.062]], 0.0088);          // işaret parmağı (gövde boyunca)
    P.chain(V.glove, [[-0.012, 0.016, 0.03], [-0.025, 0.02, 0.004], [-0.025, 0.022, -0.022]], 0.0102);        // başparmak
    P.rbox(V.glove, 0.032, 0.09, 0.05, 0.022, -0.035, 0.03, 0.012, -0.36, 0, 0); P.rbox(V.glove, 0.05, 0.05, 0.034, 0.004, 0.0, 0.045, 0.014);
    P.rbox(V.gloveDark, 0.03, 0.03, 0.012, 0.006, 0.004, 0.063, 0.004);
    P.cap(V.glove, [0.014, -0.03, 0.06], [0.03, -0.055, 0.115], 0.033);
    P.cap(V.sleeve, [0.028, -0.05, 0.105], [0.2, -0.24, 0.5], 0.044, 0.062); P.cap(V.gloveDark, [0.025, -0.047, 0.1], [0.033, -0.058, 0.12], 0.045, 0.045);
    P.build(Rg); }
  return { L, R: Rg };
}

export function buildRifle(V, T) {
  const root = new THREE.Group(); const P = new Parts(); const BY = 0.032; // namlu ekseni yüksekliği
  // gövde
  P.rbox(V.metal, 0.042, 0.052, 0.205, 0, BY, -0.015, 0.006); P.rbox(V.metal, 0.036, 0.042, 0.19, 0, -0.012, 0.0, 0.005); P.rbox(V.metal, 0.034, 0.056, 0.07, 0, -0.046, -0.055, 0.004);
  P.box(V.metal, 0.021, 0.006, 0.47, 0, 0.0615, -0.15);
  for (let z = 0.076; z > -0.382; z -= 0.0105) P.box(V.metal, 0.0212, 0.0042, 0.0056, 0, 0.0665, z);
  P.box(V.metal, 0.012, 0.004, 0.062, 0, -0.058, 0.018); P.box(V.metal, 0.012, 0.026, 0.004, 0, -0.046, 0.05, 0.25);
  P.box(V.metalWorn, 0.006, 0.022, 0.006, 0, -0.044, 0.022, 0.3);
  P.rbox(V.polymer, 0.031, 0.102, 0.044, 0, -0.08, 0.063, 0.007, -0.33);
  // dipçik
  P.cyl(V.metal, 0.0145, 0.2, 0, 0.026, 0.19); P.rbox(V.fde, 0.04, 0.052, 0.125, 0, 0.022, 0.24, 0.008); P.rbox(V.fde, 0.036, 0.1, 0.06, 0, -0.016, 0.278, 0.008, 0.12); P.rbox(V.polymer, 0.041, 0.125, 0.014, 0, -0.008, 0.308, 0.004, 0.06);
  // kurma kolu, kovan atma penceresi, saptırıcı
  P.box(V.metal, 0.052, 0.008, 0.02, 0, 0.05, 0.086); P.box(V.polymer, 0.002, 0.018, 0.058, 0.0215, 0.036, -0.03); P.rbox(V.metal, 0.009, 0.016, 0.016, 0.022, 0.036, 0.012, 0.003);
  P.cyl(V.metal, 0.006, 0.014, 0.025, 0.044, 0.04, 'z', 8); P.cyl(V.metalWorn, 0.0042, 0.008, -0.019, -0.004, -0.02, 'x', 8); P.box(V.metalWorn, 0.004, 0.006, 0.02, -0.02, 0.002, 0.03);
  // namlu, el kundağı
  P.cyl(V.metal, 0.009, 0.36, 0, BY, -0.3);
  { const g = new THREE.CylinderGeometry(0.0238, 0.0238, 0.272, 8); g.rotateY(Math.PI / 8); g.rotateX(Math.PI / 2); P.push(V.fde, g, 0, BY, -0.256); }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { P.box(V.polymer, 0.0015, 0.0085, 0.036, s * 0.0222, BY, -0.168 - k * 0.075); P.box(V.polymer, 0.0085, 0.0015, 0.036, s * 0.0158, BY - 0.0158, -0.168 - k * 0.075, 0, 0, s * 0.785); }
  P.cyl(V.metal, 0.0245, 0.01, 0, BY, -0.122, 'z', 8); P.cyl(V.metal, 0.0115, 0.022, 0, BY, -0.398);
  // susturucu
  P.cyl(V.suppressor, 0.0188, 0.168, 0, BY, -0.557, 'z', 18); P.cyl(V.metal, 0.0198, 0.014, 0, BY, -0.479, 'z', 18); P.cyl(V.metal, 0.0192, 0.006, 0, BY, -0.638, 'z', 18);
  for (let k = 0; k < 5; k++) P.cyl(V.metal, 0.0192, 0.003, 0, BY, -0.5 - k * 0.007, 'z', 18);
  P.cyl(V.polymer, 0.0058, 0.002, 0, BY, -0.6415, 'z', 10);
  // katlanır nişangâhlar
  P.rbox(V.metal, 0.018, 0.011, 0.032, 0, 0.074, -0.362, 0.002); P.rbox(V.metal, 0.02, 0.011, 0.03, 0, 0.074, 0.064, 0.002);
  // holografik nişangâh
  const SY = 0.106;
  P.rbox(V.metal, 0.037, 0.017, 0.078, 0, 0.0765, -0.044, 0.003); P.box(V.metal, 0.0035, 0.043, 0.05, -0.0205, SY, -0.052); P.box(V.metal, 0.0035, 0.043, 0.05, 0.0205, SY, -0.052);
  P.box(V.metal, 0.0445, 0.0035, 0.05, 0, SY + 0.0215, -0.052); P.rbox(V.metal, 0.037, 0.014, 0.03, 0, 0.09, -0.012, 0.003); P.cyl(V.metalWorn, 0.004, 0.005, 0.02, 0.085, -0.012, 'x', 8);
  P.box(V.metal, 0.012, 0.004, 0.012, -0.012, 0.0985, -0.006); P.box(V.metal, 0.012, 0.004, 0.012, 0.012, 0.0985, -0.006);
  // lazer kutusu, fener, ön tutamak
  P.rbox(V.fde, 0.047, 0.027, 0.076, 0, 0.0825, -0.3, 0.004); P.cyl(V.polymer, 0.0065, 0.005, -0.012, 0.086, -0.339, 'z', 10); P.cyl(V.polymer, 0.0065, 0.005, 0.012, 0.086, -0.339, 'z', 10); P.cyl(V.metalWorn, 0.004, 0.006, 0.0, 0.098, -0.29, 'y', 8);
  P.cyl(V.metal, 0.0125, 0.088, 0.037, BY, -0.33, 'z', 12); P.cyl(V.metal, 0.0145, 0.02, 0.037, BY, -0.366, 'z', 12); P.rbox(V.metal, 0.012, 0.012, 0.03, 0.028, BY, -0.31, 0.002);
  P.cyl(V.polymer, 0.0158, 0.085, 0, -0.035, -0.27, 'y', 12); P.rbox(V.polymer, 0.027, 0.013, 0.042, 0, 0.006, -0.27, 0.003); P.cyl(V.polymer, 0.0168, 0.008, 0, -0.078, -0.27, 'y', 12);
  P.build(root);
  // mercek + retikül
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.04), V.lens); lens.position.set(0, SY, -0.074); lens.frustumCulled = false; root.add(lens);
  const retMat = reticleMaterial(T.reticle); const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.0375, 0.0395), retMat); ret.position.set(0, SY, -0.056); ret.frustumCulled = false; ret.renderOrder = 10; root.add(ret);
  // hareketli parçalar: şarjör, sürgü
  const mag = new THREE.Group(); mag.position.set(0, -0.07, -0.055);
  { const M = new Parts(); for (let k = 0; k < 3; k++) M.rbox(V.fde, 0.025, 0.052, 0.058, 0, -0.022 - k * 0.044, -k * k * 0.0045, 0.004, 0.07 * k); M.box(V.polymer, 0.028, 0.007, 0.064, 0, -0.142, -0.024, 0.16); M.build(mag); }
  root.add(mag);
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.014, 0.05), V.steelBright); bolt.position.set(0.021, 0.036, -0.03); bolt.frustumCulled = false; root.add(bolt);
  const arms = buildArms(V, 'rifle'); arms.L.position.set(0, -0.012, -0.27); arms.R.position.set(0, -0.06, 0.05); root.add(arms.L, arms.R);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, BY, -0.66); root.add(muzzle);
  const port = new THREE.Object3D(); port.position.set(0.03, 0.04, -0.03); root.add(port);
  return { root, mag, bolt, arms, muzzle, port, retMat, sightY: SY, magHome: mag.position.clone(), boltHome: bolt.position.clone(), armLHome: arms.L.position.clone() };
}

export function buildPistol(V) {
  const root = new THREE.Group(); const P = new Parts(); const BY = 0.02;
  P.rbox(V.metal, 0.027, 0.027, 0.19, 0, BY, -0.03, 0.004);                 // sürgü ayrı çizilecek; bu çerçeve üstü
  const slide = new THREE.Group();
  { const S = new Parts(); S.rbox(V.metal, 0.0285, 0.029, 0.195, 0, 0, 0, 0.004); for (let k = 0; k < 7; k++) S.box(V.polymer, 0.0292, 0.02, 0.002, 0, 0, 0.055 + k * 0.005);
    S.box(V.polymer, 0.002, 0.012, 0.03, 0.0144, 0.004, -0.01); S.box(V.metal, 0.004, 0.006, 0.004, 0, 0.0175, -0.085); S.box(V.metal, 0.016, 0.006, 0.006, 0, 0.0175, 0.085); S.box(V.polymer, 0.005, 0.0062, 0.0062, 0, 0.0176, 0.085);
    S.build(slide); }
  slide.position.set(0, BY + 0.004, -0.03); root.add(slide);
  const Q = new Parts();
  Q.rbox(V.polymer, 0.028, 0.02, 0.17, 0, -0.004, -0.022, 0.004); Q.rbox(V.polymer, 0.03, 0.105, 0.05, 0, -0.06, 0.04, 0.008, -0.3);
  Q.box(V.polymer, 0.012, 0.004, 0.05, 0, -0.045, -0.02); Q.box(V.polymer, 0.012, 0.03, 0.004, 0, -0.03, -0.045, -0.3); Q.box(V.metalWorn, 0.005, 0.018, 0.005, 0, -0.028, -0.008, 0.3);
  Q.box(V.polymer, 0.022, 0.006, 0.04, 0, -0.016, -0.085);
  Q.cyl(V.metal, 0.0065, 0.03, 0, BY + 0.003, -0.14); Q.cyl(V.suppressor, 0.0155, 0.135, 0, BY + 0.003, -0.215, 'z', 16); Q.cyl(V.metal, 0.0162, 0.008, 0, BY + 0.003, -0.151, 'z', 16);
  Q.box(V.polymer, 0.026, 0.008, 0.052, 0, -0.112, 0.056, -0.3);
  Q.build(root);
  const arms = buildArms(V, 'pistol'); arms.R.position.set(0, -0.035, 0.03); arms.L.position.set(0.0, -0.06, 0.035); root.add(arms.R, arms.L);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, BY + 0.003, -0.29); root.add(muzzle);
  const port = new THREE.Object3D(); port.position.set(0.02, BY + 0.012, -0.02); root.add(port);
  const mag = new THREE.Group(); { const M = new Parts(); M.rbox(V.metal, 0.022, 0.11, 0.034, 0, -0.05, 0, 0.003, -0.3); M.build(mag); } mag.position.set(0, -0.03, 0.03); mag.visible = false; root.add(mag);
  return { root, mag, bolt: slide, arms, muzzle, port, retMat: null, sightY: BY + 0.0245, magHome: mag.position.clone(), boltHome: slide.position.clone(), armLHome: arms.L.position.clone() };
}

// Elde tutulan bomba / sargı için basit modeller
export function buildGrenade(V, flash) {
  const g = new THREE.Group(); const P = new Parts();
  if (flash) { P.cyl(V.metal, 0.021, 0.1, 0, 0, 0, 'y', 8); P.cyl(V.metalWorn, 0.022, 0.012, 0, 0.05, 0, 'y', 8); P.cyl(V.metalWorn, 0.022, 0.012, 0, -0.05, 0, 'y', 8); }
  else { P.sphere(V.olive, 0.031, 0, 0, 0); P.cyl(V.metalWorn, 0.012, 0.03, 0, 0.038, 0, 'y', 8); P.box(V.metalWorn, 0.008, 0.06, 0.004, 0.014, 0.02, 0, 0, 0, -0.2); }
  P.build(g); return g;
}
