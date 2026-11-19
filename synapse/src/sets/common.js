// Setler için ortak yardımcılar: dokular, ışık huzmeleri, toz, sarkan kablolar, damlalar.
import * as THREE from 'three';
import { canvasTexture, normalMapFrom, envMaterial, glowMaterial } from '../engine/materials.js';
import { rng, fbm3, clamp } from '../engine/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function concreteMaterial(color = 0x5a5e66, { repeat = [4, 4], wet = 0, seed = 1, stains = 0.5 } = {}) {
  const C = new THREE.Color(color); const R = rng(seed);
  const map = canvasTexture(512, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = fbm3(Math.cos(u * 6.283) * 3 + seed, Math.sin(u * 6.283) * 3, v * 6, 5);
      const st = fbm3(u * 3 + 9, v * 2 + seed, 1, 3);
      let k = 0.86 + n * 0.25 - Math.max(0, st) * stains * 0.5 + (R() - 0.5) * 0.06;
      const c = C.clone().multiplyScalar(k); const s = c.convertLinearToSRGB(); const i = (y * w + x) * 4;
      img.data[i] = clamp(s.r) * 255; img.data[i + 1] = clamp(s.g) * 255; img.data[i + 2] = clamp(s.b) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat });
  const rough = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h; const n = fbm3(Math.cos(u * 6.283) * 2 + 4, Math.sin(u * 6.283) * 2, v * 4 + seed, 4);
      const r = clamp(0.85 - wet * smoothPuddle(n)); const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = r * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat, srgb: false });
  const nm = normalMapFrom(256, 256, (u, v) => 0.5 + 0.5 * fbm3(Math.cos(u * 6.283) * 5, Math.sin(u * 6.283) * 5, v * 10, 4), 2.2, repeat);
  return envMaterial(0xffffff, { map, roughnessMap: rough, normalMap: nm, normalScale: 0.8, roughness: 1, metalness: 0.0 });
}
function smoothPuddle(n) { return clamp((n - 0.05) * 6) * 0.8; }

export function rustMetalMaterial(color = 0x4c5258, { repeat = [1, 1], rust = 0.5, seed = 3 } = {}) {
  const C = new THREE.Color(color), Rc = new THREE.Color(0x7a3a1a);
  const map = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = fbm3(u * 6 + seed, v * 6, 2, 5);
      const streak = fbm3(u * 20 + seed, v * 1.5, 5, 3);
      const rk = clamp((n + 0.15) * 2.5 * rust + Math.max(0, streak) * v * rust * 0.9);
      const c = C.clone().multiplyScalar(0.9 + n * 0.25).lerp(Rc, rk * 0.75); const s = c.convertLinearToSRGB(); const i = (y * w + x) * 4;
      img.data[i] = clamp(s.r) * 255; img.data[i + 1] = clamp(s.g) * 255; img.data[i + 2] = clamp(s.b) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat });
  return envMaterial(0xffffff, { map, roughness: 0.62, metalness: 0.55 });
}

export function hazardTexture(repeat = [4, 1]) {
  return canvasTexture(128, 32, (g, w, h) => {
    g.fillStyle = '#e8b81a'; g.fillRect(0, 0, w, h); g.fillStyle = '#121212';
    for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 24, h); g.lineTo(i * 24 + 12, h); g.lineTo(i * 24 + 12 + h, 0); g.lineTo(i * 24 + h, 0); g.fill(); }
  }, { repeat });
}

// Yumuşak ışık huzmesi (eklemeli koni). Tepe noktası 0'da, -y yönüne uzunluk len.
export function lightShaft(len, r0, r1, color, intensity = 0.25, { noise = true } = {}) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 24, 4, true); g.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, time: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = position; vY = -position.y; vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float intensity; uniform float time; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float len = ${len.toFixed(3)};
        float fall = smoothstep(0.0, 0.15 * len, vY) * (1.0 - smoothstep(0.55 * len, len, vY));
        float nz = ${noise ? '0.7 + 0.3 * sin(vP.x * 9.0 + time * 0.6) * sin(vP.z * 7.0 - time * 0.4 + vP.y * 2.0)' : '1.0'};
        gl_FragColor = vec4(color * intensity * edge * fall * nz, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 5; m.frustumCulled = false;
  m.userData.setTime = (t) => { mat.uniforms.time.value = t; };
  return m;
}

// Toz parçacıkları (deterministik; kutu içinde yavaş sürüklenme)
export function dust(count, box, { color = 0xbfd8ff, size = 0.012, seed = 5, opacity = 0.5 } = {}) {
  const R = rng(seed); const pos = new Float32Array(count * 3); const base = [];
  for (let i = 0; i < count; i++) base.push([R(), R(), R(), R() * 6.28, 0.2 + R() * 0.8]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprite = canvasTexture(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
  const mat = new THREE.PointsMaterial({ color, size, map: sprite, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  pts.userData.update = (t) => {
    for (let i = 0; i < count; i++) {
      const [x, y, z, ph, sp] = base[i];
      pos[i * 3] = box.min.x + (box.max.x - box.min.x) * ((x + Math.sin(t * 0.07 * sp + ph) * 0.03 + t * 0.004 * sp) % 1);
      pos[i * 3 + 1] = box.min.y + (box.max.y - box.min.y) * (((y + t * 0.006 * sp + Math.sin(t * 0.11 + ph) * 0.02) % 1 + 1) % 1);
      pos[i * 3 + 2] = box.min.z + (box.max.z - box.min.z) * ((z + Math.cos(t * 0.05 * sp + ph) * 0.03) % 1);
    }
    g.attributes.position.needsUpdate = true;
  };
  return pts;
}

// Sarkan kablo (zincir eğrisi)
export function hangingCable(a, b, sag, r, mat, segs = 24) {
  const pts = [];
  for (let i = 0; i <= segs; i++) { const k = i / segs; const p = a.clone().lerp(b, k); p.y -= sag * 4 * k * (1 - k); pts.push(p); }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 6, false), mat);
  return m;
}

// Ekran içeriği için yeniden çizilebilir tuval dokusu
export function screenCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g, tex, w, h };
}

export { V, envMaterial, glowMaterial, rng };
