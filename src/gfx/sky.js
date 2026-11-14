// Gökyüzü: atmosfer gradyanı, güneş/ay, bulutlar, yıldızlar + güneş ışığı ve ortam (IBL) haritası.
import * as THREE from 'three';
import { DEG } from '../core/utils.js';

// Günün saati ön ayarları (renkler doğrusal HDR)
export const TIME_PRESETS = {
  dawn: {
    label: 'Şafak', clock: '05:42',
    sunElev: 11.5, sunAzim: 56, sunColor: [1.0, 0.62, 0.36], sunIntensity: 4.4,
    zenith: [0.13, 0.25, 0.52], horizon: [0.66, 0.55, 0.5], glow: [1.0, 0.52, 0.22], ground: [0.20, 0.155, 0.11],
    cloudLit: [1.0, 0.72, 0.52], cloudShade: [0.30, 0.29, 0.36], cloudCover: 0.46,
    fogDensity: 0.0017, fogHeight: 34, envIntensity: 1.7, exposure: 1.0, stars: 0.0, rays: 0.9,
    bulbs: 0.55, key: 0.19, nightFactor: 0,
  },
  day: {
    label: 'Gündüz', clock: '13:10',
    sunElev: 52, sunAzim: 150, sunColor: [1.0, 0.95, 0.86], sunIntensity: 6.2,
    zenith: [0.075, 0.2, 0.52], horizon: [0.52, 0.66, 0.84], glow: [1.0, 0.92, 0.8], ground: [0.26, 0.22, 0.17],
    cloudLit: [1.0, 0.98, 0.95], cloudShade: [0.46, 0.5, 0.58], cloudCover: 0.4,
    fogDensity: 0.0011, fogHeight: 60, envIntensity: 1.0, exposure: 0.8, stars: 0.0, rays: 0.25,
    bulbs: 0.0, key: 0.2, nightFactor: 0,
  },
  night: {
    label: 'Gece', clock: '02:17',
    sunElev: 41, sunAzim: 205, sunColor: [0.55, 0.68, 1.0], sunIntensity: 0.11, moon: true,
    zenith: [0.0016, 0.0032, 0.0085], horizon: [0.006, 0.0095, 0.018], glow: [0.03, 0.045, 0.075], ground: [0.004, 0.004, 0.005],
    cloudLit: [0.05, 0.065, 0.1], cloudShade: [0.004, 0.005, 0.009], cloudCover: 0.34,
    fogDensity: 0.0014, fogHeight: 45, envIntensity: 1.0, exposure: 1.0, stars: 1.0, rays: 0.0,
    bulbs: 1.0, key: 0.045, nightFactor: 1,
  },
};

// Gökyüzü ve sis gölgelendiricilerinin ortak kullandığı gradyan fonksiyonu
export const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uGround;
vec3 skyGradient(vec3 dir) {
  float h = clamp(dir.y, 0.0, 1.0);
  float t = 1.0 - pow(1.0 - h, 3.4);
  vec3 col = mix(uHorizon, uZenith, t);
  float sd = max(dot(dir, uSunDir), 0.0);
  float band = pow(1.0 - h, 5.0);
  col += uGlow * (pow(sd, 3.0) * 0.42 * band + pow(sd, 22.0) * 0.36 + pow(sd, 180.0) * 0.9);
  // güneşin karşı yönünde hafif soğuk/pembe kuşak
  float anti = max(dot(dir, vec3(-uSunDir.x, 0.0, -uSunDir.z)), 0.0);
  col += uGlow.bgr * 0.05 * anti * anti * band;
  return col;
}
`;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}`;

const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform sampler2D tNoise; uniform float uTime; uniform vec3 uSunColor; uniform float uDisk; uniform float uMoon;
uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uCloudCover; uniform float uStars;
${SKY_GLSL}
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float cloudDensity(vec2 uv) {
  vec2 w = vec2(uTime * 0.0016, uTime * 0.0006);
  float n = texture2D(tNoise, uv * 0.5 + w).r * 0.55 + texture2D(tNoise, uv * 1.3 + w * 1.7).g * 0.28 + texture2D(tNoise, uv * 3.1 + w * 2.6).b * 0.17;
  return n;
}
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyGradient(dir);
  float sd = dot(dir, uSunDir);
  // güneş / ay diski
  float disk = smoothstep(0.99990, 0.99996, sd);
  if (uMoon > 0.5) {
    float md = smoothstep(0.99975, 0.99985, sd);
    float cr = texture2D(tNoise, dir.xz * 9.0 + dir.y * 5.0).g;
    col += uSunColor * md * (2.2 + cr * 1.6) * uDisk;
  } else {
    col += uSunColor * disk * 40.0 * uDisk;
  }
  // yıldızlar
  if (uStars > 0.01 && dir.y > 0.0) {
    vec3 sp = dir * 260.0; vec3 cell = floor(sp); float hsh = hash13(cell);
    vec3 f = fract(sp) - 0.5;
    float star = step(0.9965, hsh) * smoothstep(0.42, 0.0, length(f)) ;
    float tw = 0.75 + 0.25 * sin(uTime * 3.0 + hsh * 90.0);
    col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * (0.02 + 0.09 * fract(hsh * 71.3)) * smoothstep(0.0, 0.25, dir.y);
  }
  // bulut katmanı
  if (dir.y > 0.012) {
    vec2 uv = dir.xz / (dir.y + 0.16) * 0.34;
    float n = cloudDensity(uv);
    float th = 1.0 - uCloudCover;
    float d = smoothstep(th, th + 0.24, n);
    if (d > 0.001) {
      float n2 = cloudDensity(uv + normalize(uSunDir.xz + 1e-4) * 0.035);
      float lit = clamp((n - n2) * 3.4 + 0.52, 0.0, 1.0);
      vec3 cc = mix(uCloudShade, uCloudLit, lit);
      float sdc = max(sd, 0.0);
      cc += uGlow * (pow(sdc, 5.0) * 0.55 + pow(sdc, 40.0) * 1.2) * (1.0 - d * 0.55);
      float fade = smoothstep(0.012, 0.2, dir.y);
      // ufka yakın bulutlar pusla karışır
      cc = mix(skyGradient(vec3(dir.x, 0.02, dir.z)), cc, fade * 0.82 + 0.1);
      col = mix(col, cc, d * 0.92 * fade);
    }
  }
  // ufuk altı: zemin yansıması
  if (dir.y < 0.0) col = mix(skyGradient(vec3(dir.x, 0.0, dir.z)) * 0.8, uGround, smoothstep(0.0, -0.1, dir.y));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene, noiseTex) {
    this.scene = scene;
    this.uniforms = {
      tNoise: { value: noiseTex }, uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uCloudCover: { value: 0.4 },
      uStars: { value: 0 }, uDisk: { value: 1 }, uMoon: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 20), this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1000; this.mesh.matrixAutoUpdate = true;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00035; this.sun.shadow.normalBias = 0.045;
    scene.add(this.sun); scene.add(this.sun.target);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.preset = null; this.shadowRange = 70;
    this._envRT = null;
  }

  setShadowQuality(mapSize, range) {
    this.shadowRange = range;
    const s = this.sun.shadow;
    if (mapSize <= 0) { this.sun.castShadow = false; return; }
    this.sun.castShadow = true;
    if (s.mapSize.x !== mapSize) { s.mapSize.set(mapSize, mapSize); if (s.map) { s.map.dispose(); s.map = null; } }
    const c = s.camera; c.left = -range; c.right = range; c.top = range; c.bottom = -range; c.near = 1; c.far = 520; c.updateProjectionMatrix();
    s.radius = 2.2;
  }

  applyPreset(name, renderer) {
    const p = TIME_PRESETS[name]; this.preset = p; this.presetName = name;
    const el = p.sunElev * DEG, az = p.sunAzim * DEG;
    // azimut: kuzeyden (-Z) saat yönünde
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    const u = this.uniforms;
    u.uSunDir.value.copy(this.sunDir);
    u.uSunColor.value.setRGB(...p.sunColor);
    u.uZenith.value.setRGB(...p.zenith); u.uHorizon.value.setRGB(...p.horizon); u.uGlow.value.setRGB(...p.glow); u.uGround.value.setRGB(...p.ground);
    u.uCloudLit.value.setRGB(...p.cloudLit); u.uCloudShade.value.setRGB(...p.cloudShade); u.uCloudCover.value = p.cloudCover;
    u.uStars.value = p.stars; u.uMoon.value = p.moon ? 1 : 0;
    this.sun.color.setRGB(...p.sunColor); this.sun.intensity = p.sunIntensity;
    if (renderer) this.bakeEnvironment(renderer);
  }

  // Gökyüzünden ortam aydınlatması (PMREM) üretir
  bakeEnvironment(renderer) {
    const envScene = new THREE.Scene();
    const mat = this.material.clone();
    mat.uniforms = THREE.UniformsUtils.clone(this.uniforms);
    mat.uniforms.tNoise.value = this.uniforms.tNoise.value;
    mat.uniforms.uDisk.value = 0.0; // doğrudan güneş ayrı ışıkla verilir
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), mat);
    envScene.add(dome);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(envScene, 0, 0.1, 200);
    if (this._envRT) this._envRT.dispose();
    this._envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = this.preset.envIntensity;
    pm.dispose(); mat.dispose(); dome.geometry.dispose();
  }

  // Gölge kamerasını oyuncuyu takip edecek şekilde (texel'e oturtarak) konumlandırır
  update(camera, time, focus) {
    this.uniforms.uTime.value = time;
    this.mesh.position.copy(camera.position);
    if (!this.sun.castShadow) { this.sun.position.copy(focus).addScaledVector(this.sunDir, 200); this.sun.target.position.copy(focus); return; }
    const s = this.sun.shadow; const range = this.shadowRange; const texel = (range * 2) / s.mapSize.x;
    // ışık uzayı eksenleri
    const d = this.sunDir; const up = Math.abs(d.y) > 0.99 ? _vx.set(1, 0, 0) : _vx.set(0, 1, 0);
    _right.crossVectors(up, d).normalize(); _upv.crossVectors(d, _right).normalize();
    const fx = focus.dot(_right), fy = focus.dot(_upv), fz = focus.dot(d);
    const sx = Math.round(fx / texel) * texel, sy = Math.round(fy / texel) * texel;
    _c.set(0, 0, 0).addScaledVector(_right, sx).addScaledVector(_upv, sy).addScaledVector(d, fz);
    this.sun.target.position.copy(_c);
    this.sun.position.copy(_c).addScaledVector(d, 260);
    this.sun.target.updateMatrixWorld(); this.sun.updateMatrixWorld();
  }
}
const _vx = new THREE.Vector3(), _right = new THREE.Vector3(), _upv = new THREE.Vector3(), _c = new THREE.Vector3();
