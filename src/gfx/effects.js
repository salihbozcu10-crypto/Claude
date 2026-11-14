// Efektler: parçacıklar (duman, toz, kıvılcım, alev, iz mermisi), mermi deliği izleri, boş kovanlar
import * as THREE from 'three';
import { SURF } from './materials.js';
import { rr, lerp, clamp } from '../core/utils.js';

const P_VERT = /* glsl */`
attribute vec3 iPos; attribute vec4 iData; attribute vec4 iColor; attribute vec4 iVel;
varying vec2 vUv; varying vec4 vColor; varying float vViewZ;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 corner = position.xy; vec2 off;
  if (iVel.w > 0.0) {
    // hız yönünde uzatılmış çizgi (kıvılcım / iz mermisi)
    vec3 dv = (viewMatrix * vec4(iVel.xyz, 0.0)).xyz; vec2 d = normalize(dv.xy + vec2(1e-5, 0.0));
    float foreshort = length(dv.xy) / max(length(dv), 1e-5);
    off = d * (corner.x + 0.5) * iVel.w * max(foreshort, 0.06) * -1.0 + vec2(-d.y, d.x) * corner.y * iData.x;
  } else {
    float c = cos(iData.y), s = sin(iData.y);
    off = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iData.x;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float fr = iData.z; vec2 cell = vec2(mod(fr, 4.0), 3.0 - floor(fr / 4.0));
  vUv = (cell + uv) * 0.25; vColor = iColor; vColor.a *= iData.w; vViewZ = -mv.z;
}`;
const P_FRAG = /* glsl */`
uniform sampler2D tAtlas; uniform sampler2D tDepth; uniform vec4 uProj; uniform vec2 uRes; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec2 vUv; varying vec4 vColor; varying float vViewZ;
void main() {
  float a = texture2D(tAtlas, vUv).a * vColor.a;
  if (a < 0.003) discard;
  float d = texture2D(tDepth, gl_FragCoord.xy / uRes).x;
  float sceneZ = (uProj.z * uProj.w) / (uProj.w - d * (uProj.w - uProj.z));
  float fade = clamp((sceneZ - vViewZ) / (0.12 + vViewZ * 0.03), 0.0, 1.0);
  fade *= clamp((vViewZ - 0.12) / 0.4, 0.0, 1.0);
  vec3 col = vColor.rgb;
  #ifdef FOGGED
    col = mix(col, uFogColor, 1.0 - exp(-uFogDensity * vViewZ));
  #else
    a *= exp(-uFogDensity * vViewZ * 0.6);
  #endif
  gl_FragColor = vec4(col, a * fade);
}`;

class ParticleLayer {
  constructor(max, atlas, shared, additive) {
    this.max = max; this.additive = additive; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    for (const a of [this.aPos, this.aData, this.aColor, this.aVel]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iData', this.aData); g.setAttribute('iColor', this.aColor); g.setAttribute('iVel', this.aVel);
    this.uniforms = { tAtlas: { value: atlas }, tDepth: shared.depth, uProj: shared.proj, uRes: { value: new THREE.Vector2(1, 1) }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.002 } };
    this.material = new THREE.ShaderMaterial({ vertexShader: P_VERT, fragmentShader: P_FRAG, uniforms: this.uniforms, transparent: true, depthTest: false, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, defines: additive ? {} : { FOGGED: 1 } });
    this.mesh = new THREE.Mesh(g, this.material); this.mesh.frustumCulled = false; g.instanceCount = 0;
    this.list = [];
  }
  spawn(p) { if (this.list.length >= this.max) this.list.shift(); this.list.push(p); return p; }
  update(dt, cam) {
    const L = this.list; let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.age += dt; if (p.age >= p.life) continue;
      p.vy -= p.grav * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      p.rot += p.rv * dt; L[w++] = p;
    }
    L.length = w;
    if (!this.additive && w > 1) { const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z; for (const p of L) p.d = (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2; L.sort((a, b) => b.d - a.d); }
    const P = this.aPos.array, D = this.aData.array, C = this.aColor.array, V = this.aVel.array;
    for (let i = 0; i < w; i++) {
      const p = L[i]; const t = p.age / p.life;
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      D[i * 4] = lerp(p.s0, p.s1, p.sizeEase ? 1 - (1 - t) * (1 - t) : t); D[i * 4 + 1] = p.rot; D[i * 4 + 2] = p.frame;
      D[i * 4 + 3] = p.fadeIn > 0 ? Math.min(1, t / p.fadeIn) * (1 - t) * (p.fadeIn < 0.3 ? 1 / (1 - p.fadeIn) : 1.3) : 1 - t * t;
      C[i * 4] = p.r; C[i * 4 + 1] = p.g; C[i * 4 + 2] = p.b; C[i * 4 + 3] = p.a;
      if (p.stretch > 0) { V[i * 4] = p.vx; V[i * 4 + 1] = p.vy; V[i * 4 + 2] = p.vz; V[i * 4 + 3] = p.stretch; } else V[i * 4 + 3] = 0;
    }
    this.aPos.needsUpdate = this.aData.needsUpdate = this.aColor.needsUpdate = this.aVel.needsUpdate = true;
    this.mesh.geometry.instanceCount = w;
  }
}

const SURF_DUST = [[0.6, 0.58, 0.54], [0.5, 0.5, 0.5], [0.55, 0.45, 0.32], [0.5, 0.42, 0.3], [0.62, 0.53, 0.4], [0.5, 0.5, 0.45], [0.8, 0.85, 0.85], [0.5, 0.45, 0.4], [0.3, 0.02, 0.02], [0.2, 0.2, 0.2]];

export class Effects {
  constructor(game) {
    this.g = game; const T = game.T; const q = game.Q.particles;
    this.alpha = new ParticleLayer(Math.round(1400 * q), T.particles, game.post.shared, false);
    this.add = new ParticleLayer(Math.round(700 * q), T.particles, game.post.shared, true);
    game.fxScene.add(this.alpha.mesh, this.add.mesh);
    this.light = new THREE.Color(1, 1, 1); this.q = q;
    this.emitters = [];
    // --- mermi izleri (4 tür x 48)
    this.decals = []; const dm = new THREE.MeshStandardMaterial({ map: T.decals, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
    for (let k = 0; k < 4; k++) {
      const u0 = (k % 2) * 0.5, v0 = k < 2 ? 0.5 : 0; const g = new THREE.PlaneGeometry(1, 1); const U = g.attributes.uv; for (let i = 0; i < 4; i++) U.setXY(i, u0 + U.getX(i) * 0.5, v0 + U.getY(i) * 0.5);
      const m = new THREE.InstancedMesh(g, dm, 48); m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 3; game.scene.add(m); this.decals.push({ mesh: m, i: 0 });
    }
    // --- boş kovanlar
    const cg = new THREE.CylinderGeometry(0.0048, 0.0048, 0.045, 6); cg.rotateZ(Math.PI / 2);
    this.casingMesh = new THREE.InstancedMesh(cg, game.M.dyn.brass, 48); this.casingMesh.count = 0; this.casingMesh.frustumCulled = false; game.scene.add(this.casingMesh);
    this.casings = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1); this._n = new THREE.Vector3();
    // --- namlu / patlama ışığı
    this.flashLight = new THREE.PointLight(0xffc27a, 0, 16, 2); game.scene.add(this.flashLight); this.flashT = 0;
    this.blastLight = new THREE.PointLight(0xff9a50, 0, 60, 1.6); game.scene.add(this.blastLight); this.blastT = 0;
  }

  setLight(preset) {
    const s = preset.sunColor, z = preset.zenith, h = preset.horizon;
    this.light.setRGB(s[0] * preset.sunIntensity * 0.16 + (z[0] + h[0]) * preset.envIntensity * 0.75, s[1] * preset.sunIntensity * 0.16 + (z[1] + h[1]) * preset.envIntensity * 0.75, s[2] * preset.sunIntensity * 0.16 + (z[2] + h[2]) * preset.envIntensity * 0.75);
    for (const L of [this.alpha, this.add]) { L.uniforms.uFogColor.value.setRGB(h[0], h[1], h[2]); L.uniforms.uFogDensity.value = preset.fogDensity * 1.4; }
  }
  clear() { this.alpha.list.length = 0; this.add.list.length = 0; this.casings.length = 0; for (const d of this.decals) { d.mesh.count = 0; d.i = 0; } this.flashLight.intensity = 0; this.blastLight.intensity = 0; }
  setSize(w, h) { this.alpha.uniforms.uRes.value.set(w, h); this.add.uniforms.uRes.value.set(w, h); }

  p(layer, o) {
    const L = this.light; const lit = o.lit !== false && !layer.additive;
    return layer.spawn({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, age: 0, life: o.life || 1, s0: o.s0 ?? 0.1, s1: o.s1 ?? o.s0 ?? 0.1, rot: o.rot ?? rr(0, 6.28), rv: o.rv ?? rr(-0.6, 0.6),
      r: o.r * (lit ? L.r : 1), g: o.g * (lit ? L.g : 1), b: o.b * (lit ? L.b : 1), a: o.a ?? 1, frame: o.frame ?? 0, grav: o.grav ?? 0, drag: o.drag ?? 0, stretch: o.stretch || 0, fadeIn: o.fadeIn ?? 0, sizeEase: o.sizeEase !== false, floor: o.floor });
  }

  // Yüzeye göre mermi çarpma efekti
  impact(surf, pos, normal, big = 1) {
    const c = SURF_DUST[surf] || SURF_DUST[0]; const n = Math.round((surf === SURF.metal ? 2 : 5) * this.q * big);
    for (let i = 0; i < n; i++) {
      const sp = rr(0.6, 2.6) * big;
      this.p(this.alpha, { x: pos.x, y: pos.y, z: pos.z, vx: normal.x * sp + rr(-0.7, 0.7), vy: normal.y * sp + rr(0.1, 1.2), vz: normal.z * sp + rr(-0.7, 0.7), life: rr(0.6, 1.7), s0: 0.06, s1: rr(0.35, 0.9) * big, r: c[0], g: c[1], b: c[2], a: rr(0.25, 0.5), frame: (Math.random() * 4) | 0, drag: 2.6, grav: -0.15 });
    }
    if (surf === SURF.metal || surf === SURF.concrete || surf === SURF.rock) {
      const k = surf === SURF.metal ? 7 : 3;
      for (let i = 0; i < k; i++) { const sp = rr(3, 11); this.p(this.add, { x: pos.x, y: pos.y, z: pos.z, vx: normal.x * sp + rr(-4, 4), vy: normal.y * sp + rr(-2, 5), vz: normal.z * sp + rr(-4, 4), life: rr(0.12, 0.4), s0: 0.012, s1: 0.004, r: 6, g: 3.4, b: 1.2, a: 1, frame: 6, grav: 9, drag: 1, stretch: rr(0.05, 0.16) }); }
    }
    if (surf !== SURF.metal && surf !== SURF.flesh && surf !== SURF.glass) { // sıçrayan kırıntılar
      for (let i = 0; i < 3 * this.q; i++) { const sp = rr(1.5, 5); this.p(this.alpha, { x: pos.x, y: pos.y, z: pos.z, vx: normal.x * sp + rr(-1.5, 1.5), vy: normal.y * sp + rr(0.5, 3), vz: normal.z * sp + rr(-1.5, 1.5), life: rr(0.5, 1.1), s0: rr(0.015, 0.04), s1: 0.02, r: c[0] * 0.7, g: c[1] * 0.7, b: c[2] * 0.7, a: 1, frame: 7, grav: 9.8, drag: 0.4, fadeIn: 0, sizeEase: false }); }
    }
    if (surf === SURF.flesh) for (let i = 0; i < 5; i++) { const sp = rr(0.5, 2.5); this.p(this.alpha, { x: pos.x, y: pos.y, z: pos.z, vx: normal.x * sp + rr(-0.6, 0.6), vy: normal.y * sp + rr(-0.2, 0.9), vz: normal.z * sp + rr(-0.6, 0.6), life: rr(0.25, 0.6), s0: 0.03, s1: rr(0.12, 0.3), r: 0.32, g: 0.012, b: 0.012, a: 0.7, frame: 11, grav: 4, drag: 3 }); }
  }

  decal(surf, pos, normal, size) {
    const kind = surf === SURF.metal ? 1 : surf === SURF.wood ? 2 : surf === 99 ? 3 : (surf === SURF.concrete || surf === SURF.rock) ? 0 : -1;
    if (kind < 0) return;
    const d = this.decals[kind]; const s = size ?? (kind === 3 ? rr(2.4, 3.6) : kind === 1 ? rr(0.05, 0.07) : rr(0.09, 0.15));
    this._q.setFromUnitVectors(this._z, this._n.copy(normal).normalize()); this._e.set(0, 0, rr(0, 6.28)); this._q.multiply(new THREE.Quaternion().setFromEuler(this._e));
    this._p.copy(pos).addScaledVector(normal, 0.006 + Math.random() * 0.004);
    d.mesh.setMatrixAt(d.i, this._m.compose(this._p, this._q, this._s.set(s, s, s))); d.i = (d.i + 1) % 48; d.mesh.count = Math.min(48, d.mesh.count + 1); d.mesh.instanceMatrix.needsUpdate = true; this._s.set(1, 1, 1);
  }

  muzzle(pos, dir, suppressed, scale = 1) {
    const fs = suppressed ? 0.11 : 0.36;
    this.p(this.add, { x: pos.x, y: pos.y, z: pos.z, life: suppressed ? 0.035 : 0.05, s0: fs * scale, s1: fs * 1.5 * scale, r: 5, g: 3.3, b: 1.6, a: suppressed ? 0.7 : 1, frame: Math.random() < 0.5 ? 8 : 9, rv: 0, sizeEase: false });
    const k = suppressed ? 2 : 3;
    for (let i = 0; i < k; i++) { const sp = rr(1.5, 5); this.p(this.alpha, { x: pos.x + dir.x * 0.05, y: pos.y + dir.y * 0.05, z: pos.z + dir.z * 0.05, vx: dir.x * sp + rr(-0.5, 0.5), vy: dir.y * sp + rr(0, 0.6), vz: dir.z * sp + rr(-0.5, 0.5), life: rr(0.5, 1.2), s0: 0.04, s1: rr(0.3, 0.6) * scale, r: 0.6, g: 0.6, b: 0.62, a: suppressed ? 0.16 : 0.24, frame: (Math.random() * 4) | 0, drag: 4.5, grav: -0.3 }); }
    if (!suppressed) { this.flashLight.position.copy(pos).addScaledVector(dir, 0.3); this.flashLight.intensity = 55 * scale; this.flashT = 0.055; }
    else { this.flashLight.position.copy(pos).addScaledVector(dir, 0.2); this.flashLight.intensity = 5; this.flashT = 0.04; }
  }

  tracer(pos, vel, color = [6, 2.2, 0.8]) {
    return this.p(this.add, { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z, life: 0.5, s0: 0.035, s1: 0.035, r: color[0], g: color[1], b: color[2], a: 1, frame: 13, stretch: 9, sizeEase: false });
  }

  casing(pos, vel) {
    const fy = this.g.world.groundY(pos.x, pos.z);
    this.casings.push({ p: pos.clone(), v: vel.clone(), rx: rr(0, 6), ry: rr(0, 6), rz: rr(0, 6), w: rr(8, 22), life: 14, floor: fy + 0.006, hits: 0 });
    if (this.casings.length > 48) this.casings.shift();
  }

  explosion(pos, scale = 1) {
    const q = this.q;
    for (let i = 0; i < 14 * q; i++) { const a = rr(0, 6.28), e = rr(0, 1.4), sp = rr(2, 9) * scale; this.p(this.add, { x: pos.x, y: pos.y + 0.3, z: pos.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, life: rr(0.22, 0.5), s0: 0.6 * scale, s1: rr(2.2, 3.8) * scale, r: 7, g: 3.1, b: 0.9, a: 0.9, frame: 10, drag: 3.5 }); }
    for (let i = 0; i < 26 * q; i++) { const a = rr(0, 6.28), e = rr(-0.1, 1.5), sp = rr(1.5, 8) * scale; this.p(this.alpha, { x: pos.x + rr(-0.5, 0.5), y: pos.y + 0.4, z: pos.z + rr(-0.5, 0.5), vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 1.5, vz: Math.sin(a) * Math.cos(e) * sp, life: rr(2.5, 6), s0: 0.8 * scale, s1: rr(3.5, 7) * scale, r: 0.16, g: 0.15, b: 0.14, a: rr(0.5, 0.85), frame: (Math.random() * 4) | 0, drag: 1.6, grav: -0.7, fadeIn: 0.05 }); }
    for (let i = 0; i < 22 * q; i++) { const a = rr(0, 6.28), sp = rr(3, 9) * scale; this.p(this.alpha, { x: pos.x, y: pos.y + 0.15, z: pos.z, vx: Math.cos(a) * sp, vy: rr(0.2, 1.4), vz: Math.sin(a) * sp, life: rr(1.5, 3.5), s0: 0.6, s1: rr(2.5, 5) * scale, r: 0.55, g: 0.47, b: 0.36, a: 0.5, frame: 4 + ((Math.random() * 2) | 0), drag: 2.2, fadeIn: 0.05 }); }
    for (let i = 0; i < 30 * q; i++) { const a = rr(0, 6.28), e = rr(0.1, 1.5), sp = rr(6, 26) * scale; this.p(this.add, { x: pos.x, y: pos.y + 0.3, z: pos.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, life: rr(0.4, 1.2), s0: 0.03, s1: 0.01, r: 7, g: 3.6, b: 1.2, a: 1, frame: 6, grav: 9.8, drag: 0.6, stretch: rr(0.2, 0.6) }); }
    for (let i = 0; i < 26 * q; i++) { const a = rr(0, 6.28), e = rr(0.3, 1.4), sp = rr(4, 16) * scale; this.p(this.alpha, { x: pos.x, y: pos.y + 0.2, z: pos.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, life: rr(1, 2.4), s0: rr(0.04, 0.12), s1: 0.05, r: 0.2, g: 0.17, b: 0.13, a: 1, frame: 7, grav: 9.8, drag: 0.2, sizeEase: false, floor: pos.y }); }
    this.p(this.add, { x: pos.x, y: pos.y + 0.5, z: pos.z, life: 0.28, s0: 1, s1: 16 * scale, r: 1.2, g: 1.0, b: 0.8, a: 0.4, frame: 12, rv: 0 });
    this.blastLight.position.set(pos.x, pos.y + 1.2, pos.z); this.blastLight.intensity = 2600 * scale; this.blastT = 0.45;
  }

  flashbang(pos) {
    this.p(this.add, { x: pos.x, y: pos.y + 0.2, z: pos.z, life: 0.12, s0: 2, s1: 7, r: 30, g: 30, b: 28, a: 1, frame: 6, rv: 0 });
    for (let i = 0; i < 10; i++) { const a = rr(0, 6.28), sp = rr(1, 4); this.p(this.alpha, { x: pos.x, y: pos.y + 0.2, z: pos.z, vx: Math.cos(a) * sp, vy: rr(0.5, 2.5), vz: Math.sin(a) * sp, life: rr(1.5, 3), s0: 0.3, s1: rr(1.5, 3), r: 0.8, g: 0.8, b: 0.8, a: 0.4, frame: (Math.random() * 4) | 0, drag: 2.5 }); }
    this.blastLight.position.set(pos.x, pos.y + 0.6, pos.z); this.blastLight.intensity = 6000; this.blastT = 0.15;
  }

  // Sürekli yayıcılar: ateş, duman sütunu, işaret dumanı, rotor tozu
  addEmitter(e) { e.acc = 0; this.emitters.push(e); return e; }
  removeEmitter(e) { const i = this.emitters.indexOf(e); if (i >= 0) this.emitters.splice(i, 1); }

  update(dt, cam) {
    const q = this.q;
    for (const e of this.emitters) {
      if (e.enabled === false) continue;
      const dx = e.x - cam.position.x, dz = e.z - cam.position.z; if (dx * dx + dz * dz > (e.range || 260) ** 2) continue;
      e.acc += dt * (e.rate || 10) * q;
      while (e.acc >= 1) {
        e.acc -= 1;
        if (e.type === 'fire') {
          this.p(this.add, { x: e.x + rr(-0.1, 0.1), y: e.y, z: e.z + rr(-0.1, 0.1), vx: rr(-0.15, 0.15), vy: rr(0.9, 1.8), vz: rr(-0.15, 0.15), life: rr(0.3, 0.6), s0: rr(0.3, 0.42) * (e.s || 1), s1: 0.08, r: 4.5, g: 1.9, b: 0.45, a: 0.75, frame: 10, drag: 0.6, fadeIn: 0.15 });
          if (Math.random() < 0.3) this.p(this.alpha, { x: e.x, y: e.y + 0.5, z: e.z, vx: rr(0.1, 0.4), vy: rr(0.8, 1.4), vz: rr(-0.1, 0.2), life: rr(2.5, 5), s0: 0.25, s1: rr(1.2, 2.2), r: 0.12, g: 0.115, b: 0.11, a: 0.3, frame: (Math.random() * 4) | 0, drag: 0.25, fadeIn: 0.15 });
          if (Math.random() < 0.12) this.p(this.add, { x: e.x, y: e.y + 0.2, z: e.z, vx: rr(-0.5, 0.5), vy: rr(1.5, 3), vz: rr(-0.5, 0.5), life: rr(0.6, 1.4), s0: 0.012, s1: 0.004, r: 6, g: 2.5, b: 0.6, a: 1, frame: 6, grav: -0.5, drag: 0.8 });
        } else if (e.type === 'smoke') {
          this.p(this.alpha, { x: e.x + rr(-0.3, 0.3), y: e.y, z: e.z + rr(-0.3, 0.3), vx: rr(0.5, 1.1), vy: rr(1.4, 2.4), vz: rr(-0.2, 0.3), life: rr(7, 12), s0: 0.6, s1: rr(5, 9), r: e.c ? e.c[0] : 0.09, g: e.c ? e.c[1] : 0.085, b: e.c ? e.c[2] : 0.08, a: e.a ?? 0.55, frame: (Math.random() * 4) | 0, drag: 0.12, grav: -0.05, fadeIn: 0.08 });
        } else if (e.type === 'signal') {
          this.p(this.alpha, { x: e.x + rr(-0.1, 0.1), y: e.y, z: e.z + rr(-0.1, 0.1), vx: rr(0.3, 0.9), vy: rr(0.9, 1.6), vz: rr(-0.2, 0.3), life: rr(5, 8), s0: 0.25, s1: rr(2.5, 4.5), r: e.c[0], g: e.c[1], b: e.c[2], a: 0.6, frame: (Math.random() * 4) | 0, drag: 0.25, fadeIn: 0.06 });
        } else if (e.type === 'rotor') {
          const a = rr(0, 6.28), d = rr(3, 9); this.p(this.alpha, { x: e.x + Math.cos(a) * d, y: e.y + 0.2, z: e.z + Math.sin(a) * d, vx: Math.cos(a) * rr(5, 11), vy: rr(0.3, 1.6), vz: Math.sin(a) * rr(5, 11), life: rr(1.6, 3.2), s0: 0.8, s1: rr(4, 7), r: 0.6, g: 0.52, b: 0.4, a: 0.3 * (e.power ?? 1), frame: 4 + ((Math.random() * 2) | 0), drag: 0.9, fadeIn: 0.12 });
        } else if (e.type === 'motes') {
          const cp = cam.position; this.p(this.alpha, { x: cp.x + rr(-9, 9), y: cp.y + rr(-1.2, 2.5), z: cp.z + rr(-9, 9), vx: rr(0.1, 0.5), vy: rr(-0.05, 0.1), vz: rr(-0.1, 0.25), life: rr(3, 6), s0: rr(0.012, 0.03), s1: 0.02, r: 1.4, g: 1.2, b: 0.9, a: 0.5, frame: 6, fadeIn: 0.3, sizeEase: false });
        }
      }
    }
    this.alpha.update(dt, cam); this.add.update(dt, cam);
    // kovan fiziği
    const C = this.casings; let n = 0;
    for (let i = 0; i < C.length; i++) {
      const c = C[i]; c.life -= dt; if (c.life <= 0) continue;
      if (c.hits < 4) {
        c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); c.rx += c.w * dt; c.rz += c.w * 0.7 * dt;
        if (c.p.y < c.floor) { c.p.y = c.floor; c.v.y *= -0.38; c.v.x *= 0.55; c.v.z *= 0.55; c.w *= 0.5; c.hits++; if (c.hits === 1) this.g.audio.playAt('casing', c.p, { vol: 0.35, pitch: rr(0.9, 1.2) }); if (c.hits >= 4) { c.rx = 0; c.rz = 0; } }
      }
      this._e.set(c.rx, c.ry, c.rz); this._q.setFromEuler(this._e); this.casingMesh.setMatrixAt(n, this._m.compose(c.p, this._q, this._s)); C[n++] = c;
    }
    C.length = n; this.casingMesh.count = n; this.casingMesh.instanceMatrix.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    if (this.blastT > 0) { this.blastT -= dt; this.blastLight.intensity *= Math.exp(-dt * 9); if (this.blastT <= 0) this.blastLight.intensity = 0; }
  }
}
