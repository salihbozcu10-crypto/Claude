// Parçacık efektleri (WebGL, örneklenmiş dörtgenler): savaş, fetih, toz, havai fişek
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 iPos; attribute vec4 iData; attribute vec4 iColor;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  vec2 off = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iData.x;
  if (iData.w > 0.5) { // yere yatık (halka)
    vec4 wp = vec4(iPos + vec3(off.x, 0.0, off.y), 1.0); gl_Position = projectionMatrix * viewMatrix * wp;
  } else { mv.xy += off; gl_Position = projectionMatrix * mv; }
  float fr = iData.z; vUv = (vec2(mod(fr, 4.0), 3.0 - floor(fr / 4.0)) + uv) * 0.25; vColor = iColor;
}`;
const FRAG = /* glsl */`
uniform sampler2D tAtlas; varying vec2 vUv; varying vec4 vColor;
void main() { vec4 t = texture2D(tAtlas, vUv); float a = t.a * vColor.a; if (a < 0.004) discard; gl_FragColor = vec4(vColor.rgb * t.rgb, a); }`;

function atlas() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); const cell = 128; let s = 5; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const puff = (cx, cy, r, n, a) => { for (let k = 0; k < n; k++) { const an = R() * 6.28, d = R() * r * 0.45, rr = r * (0.35 + R() * 0.4); const x = cx + Math.cos(an) * d, y = cy + Math.sin(an) * d; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.4})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 6.3); g.fill(); } };
  for (let i = 0; i < 4; i++) puff(i * cell + 64, 64, 58, 24, 0.17);
  const radial = (cx, cy, r, stops) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(cx - 64, cy - 64, 128, 128); };
  radial(64, 192, 60, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]); // 4 kıvılcım/nokta
  { const x = 192, y = 192; radial(x, y, 60, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,210,0.8)'], [1, 'rgba(255,200,120,0)']]); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, r = k % 2 ? 10 : 56; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); } // 5 parlama
  { const x = 320, y = 192; const gr = g.createRadialGradient(x, y, 34, x, y, 62); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(256, 128, 128, 128); } // 6 halka
  puff(448, 192, 56, 30, 0.1); // 7 toz
  radial(64, 320, 50, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); // 8 yumuşak nokta
  { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(160, 300); g.lineTo(200, 286); g.lineTo(226, 322); g.lineTo(196, 352); g.lineTo(166, 340); g.closePath(); g.fill(); } // 9 kırıntı
  { const x = 320, y = 320; g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 16 : 50; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); radial(x, y, 30, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); } // 10 yıldız
  radial(448, 320, 30, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,230,180,0.6)'], [1, 'rgba(255,200,120,0)']]); // 11 kor
  puff(64, 448, 60, 40, 0.12); // 12 bulut
  { // 13 alev dili
    const x = 192, y = 448; const gr = g.createRadialGradient(x, y + 20, 4, x, y, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,220,150,0.8)'); gr.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x, y - 58); g.bezierCurveTo(x + 40, y - 10, x + 30, y + 50, x, y + 54); g.bezierCurveTo(x - 30, y + 50, x - 40, y - 10, x, y - 58); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.NoColorSpace; return t;
}

class Layer {
  constructor(max, tex, additive) {
    this.max = max; this.list = [];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    for (const a of [this.aPos, this.aData, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iData', this.aData); g.setAttribute('iColor', this.aCol); g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { tAtlas: { value: tex } }, transparent: true, depthTest: false, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 20 : 10;
  }
  add(p) { if (this.list.length >= this.max) this.list.shift(); this.list.push(p); }
  update(dt) {
    const L = this.list; let w = 0;
    for (const p of L) { p.age += dt; if (p.age < 0) { L[w++] = p; continue; } if (p.age >= p.life) continue; p.vy -= p.grav * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0) { p.y = 0; p.vy *= -0.3; } p.rot += p.rv * dt; L[w++] = p; }
    L.length = w; const P = this.aPos.array, D = this.aData.array, C = this.aCol.array; let n = 0;
    for (const p of L) { if (p.age < 0) continue; const t = p.age / p.life; P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z; D[n * 4] = p.s0 + (p.s1 - p.s0) * (1 - (1 - t) * (1 - t)); D[n * 4 + 1] = p.rot; D[n * 4 + 2] = p.frame; D[n * 4 + 3] = p.flat ? 1 : 0; const fade = p.fadeIn ? Math.min(1, t / p.fadeIn) * (1 - t) : 1 - t * t; C[n * 4] = p.r; C[n * 4 + 1] = p.g; C[n * 4 + 2] = p.b; C[n * 4 + 3] = p.a * fade; n++; }
    this.aPos.needsUpdate = this.aData.needsUpdate = this.aCol.needsUpdate = true; this.mesh.geometry.instanceCount = n;
  }
}

const rr = (a, b) => a + Math.random() * (b - a);

export class Particles {
  constructor(view, budget = 1) {
    this.view = view; const tex = atlas(); this.budget = budget;
    this.alpha = new Layer(Math.round(1600 * budget), tex, false); this.add = new Layer(Math.round(1400 * budget), tex, true);
    view.scene.add(this.alpha.mesh, this.add.mesh);
  }
  // harita pikselinden dünya konumuna (kameraya en yakın kopya)
  wpos(x, y) { const v = this.view; let wx = x - v.W / 2; const cx = v.target.x - v.W / 2; if (wx - cx > v.W / 2) wx -= v.W; else if (cx - wx > v.W / 2) wx += v.W; return [wx, y - v.H / 2]; }
  k() { return Math.max(0.35, Math.min(4.5, 1.3 / this.view.pxScale)); }
  p(layer, o) { layer.add({ x: o.x, y: o.y ?? 0, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, age: -(o.delay || 0), life: o.life, s0: o.s0, s1: o.s1 ?? o.s0, rot: o.rot ?? rr(0, 6.28), rv: o.rv ?? rr(-1, 1), r: o.r, g: o.g, b: o.b, a: o.a ?? 1, frame: o.frame, grav: o.grav || 0, drag: o.drag || 0, flat: !!o.flat, fadeIn: o.fadeIn || 0 }); }

  battle(mx, my, power = 1, delay = 0) {
    const [x, z] = this.wpos(mx, my); const k = this.k() * (0.7 + 0.5 * Math.min(1, power)); const q = this.budget;
    this.p(this.add, { x, z, y: 2 * k, life: 0.35, s0: 6 * k, s1: 22 * k, r: 1, g: 0.82, b: 0.55, a: 1, frame: 5, rv: 0, delay });
    for (let i = 0; i < 16 * q; i++) { const a = rr(0, 6.28), sp = rr(10, 38) * k; this.p(this.add, { x, z, y: 3 * k, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rr(8, 30) * k, life: rr(0.35, 0.9), s0: rr(1.2, 2.4) * k, s1: 0.4 * k, r: 1, g: rr(0.6, 0.85), b: 0.3, a: 1, frame: 4, grav: 40 * k, drag: 1.5, delay }); }
    for (let i = 0; i < 6 * q; i++) this.p(this.add, { x: x + rr(-4, 4) * k, z: z + rr(-4, 4) * k, y: 2 * k, vy: rr(6, 14) * k, life: rr(0.5, 1.0), s0: rr(4, 7) * k, s1: 1.5 * k, r: 1, g: 0.55, b: 0.18, a: 0.9, frame: 13, rv: rr(-0.5, 0.5), drag: 2, delay, fadeIn: 0.15 });
    for (let i = 0; i < 10 * q; i++) this.p(this.alpha, { x: x + rr(-5, 5) * k, z: z + rr(-5, 5) * k, y: 3 * k, vx: rr(-4, 4) * k, vz: rr(-4, 4) * k, vy: rr(6, 16) * k, life: rr(1.6, 3.2), s0: rr(5, 9) * k, s1: rr(16, 28) * k, r: 0.2, g: 0.19, b: 0.18, a: rr(0.45, 0.7), frame: (Math.random() * 4) | 0, drag: 0.8, delay: delay + 0.05, fadeIn: 0.1 });
    this.p(this.add, { x, z, y: 0.5, life: 0.6, s0: 4 * k, s1: 46 * k, r: 1, g: 0.75, b: 0.45, a: 0.8, frame: 6, rv: 0, flat: true, delay });
  }
  capture(mx, my, col, delay = 0) {
    const [x, z] = this.wpos(mx, my); const k = this.k(); const r = col[0] / 255, g = col[1] / 255, b = col[2] / 255;
    this.p(this.add, { x, z, y: 0.5, life: 1.1, s0: 6 * k, s1: 70 * k, r: r * 1.2 + 0.2, g: g * 1.2 + 0.2, b: b * 1.2 + 0.2, a: 0.9, frame: 6, rv: 0, flat: true, delay });
    for (let i = 0; i < 14 * this.budget; i++) { const a = rr(0, 6.28), sp = rr(4, 14) * k; this.p(this.add, { x: x + Math.cos(a) * 4 * k, z: z + Math.sin(a) * 4 * k, y: 1, vx: Math.cos(a) * sp * 0.3, vz: Math.sin(a) * sp * 0.3, vy: rr(10, 26) * k, life: rr(0.8, 1.6), s0: rr(1.5, 3) * k, s1: 0.5 * k, r: Math.min(1, r + 0.4), g: Math.min(1, g + 0.4), b: Math.min(1, b + 0.4), a: 1, frame: 11, drag: 1.2, delay }); }
  }
  dust(mx, my) { const [x, z] = this.wpos(mx, my); const k = this.k(); this.p(this.alpha, { x: x + rr(-2, 2) * k, z: z + rr(-2, 2) * k, y: 1, vy: rr(1, 4) * k, vx: rr(-2, 2) * k, vz: rr(-2, 2) * k, life: rr(0.7, 1.3), s0: 2 * k, s1: rr(6, 10) * k, r: 0.62, g: 0.52, b: 0.38, a: 0.35, frame: 7, drag: 1.5, fadeIn: 0.15 }); }
  fireworks(mx, my, cols, delay = 0) {
    const [x, z] = this.wpos(mx, my); const k = this.k() * 1.4;
    for (let b = 0; b < 3; b++) { const c = cols[b % cols.length]; const cx = x + rr(-30, 30) * k, cz = z + rr(-20, 20) * k, h = rr(40, 70) * k; const d = delay + b * 0.35;
      this.p(this.add, { x: cx, z: cz, y: h, life: 0.25, s0: 8 * k, s1: 30 * k, r: 1, g: 1, b: 1, a: 1, frame: 5, delay: d });
      for (let i = 0; i < 40 * this.budget; i++) { const a = rr(0, 6.28), e = rr(-1.2, 1.2), sp = rr(20, 46) * k; this.p(this.add, { x: cx, z: cz, y: h, vx: Math.cos(a) * Math.cos(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, life: rr(1.0, 1.8), s0: 2.2 * k, s1: 0.6 * k, r: c[0] / 255 + 0.3, g: c[1] / 255 + 0.3, b: c[2] / 255 + 0.3, a: 1, frame: 10, grav: 22 * k, drag: 1.1, delay: d }); } }
  }
  // dokunma halkası
  ripple(mx, my, col) { const [x, z] = this.wpos(mx, my); const k = this.k(); this.p(this.add, { x, z, y: 0.5, life: 0.55, s0: 3 * k, s1: 30 * k, r: col[0] / 255 * 0.8 + 0.25, g: col[1] / 255 * 0.8 + 0.25, b: col[2] / 255 * 0.8 + 0.25, a: 0.85, frame: 6, rv: 0, flat: true }); }
  // asker toplama: ülke renginde yükselen kıvılcımlar
  sparkle(mx, my, col) {
    const [x, z] = this.wpos(mx, my); const k = this.k(); const r = Math.min(1, col[0] / 255 + 0.35), g = Math.min(1, col[1] / 255 + 0.35), b = Math.min(1, col[2] / 255 + 0.35);
    for (let i = 0; i < 12 * this.budget; i++) this.p(this.add, { x: x + rr(-6, 6) * k, z: z + rr(-4, 4) * k, y: 1, vx: rr(-3, 3) * k, vz: rr(-3, 3) * k, vy: rr(14, 30) * k, life: rr(0.7, 1.3), s0: rr(1.6, 2.8) * k, s1: 0.4 * k, r, g, b, a: 1, frame: 10, drag: 1.4, delay: rr(0, 0.25) });
    this.p(this.add, { x, z, y: 0.5, life: 0.8, s0: 4 * k, s1: 36 * k, r, g, b, a: 0.7, frame: 6, rv: 0, flat: true });
  }
  // tüfek yaylım ateşi: süren savaşta barut dumanı ve küçük parlamalar
  volley(mx, my, delay = 0) {
    const [x, z] = this.wpos(mx, my); const k = this.k(); const q = this.budget;
    for (let i = 0; i < 5 * q; i++) { const ox = rr(-7, 7) * k, oz = rr(-4, 4) * k; const d = delay + rr(0, 0.25); this.p(this.add, { x: x + ox, z: z + oz, y: 4 * k, life: 0.14, s0: 3 * k, s1: 7 * k, r: 1, g: 0.9, b: 0.6, a: 1, frame: 8, rv: 0, delay: d }); this.p(this.alpha, { x: x + ox, z: z + oz, y: 4 * k, vx: rr(-3, 3) * k, vy: rr(3, 8) * k, vz: rr(-2, 2) * k, life: rr(1.2, 2.2), s0: 3 * k, s1: rr(10, 16) * k, r: 0.78, g: 0.77, b: 0.74, a: 0.4, frame: (Math.random() * 4) | 0, drag: 1, delay: d, fadeIn: 0.12 }); }
  }
  update(dt) { this.alpha.update(dt); this.add.update(dt); }
  clear() { this.alpha.list.length = 0; this.add.list.length = 0; }
}
