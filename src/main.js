import * as THREE from 'three';
import { generateTextures } from './gfx/textures.js';
import { createMaterials, globalUniforms } from './gfx/materials.js';
import { Sky, TIME_PRESETS } from './gfx/sky.js';
import { PostFX } from './gfx/postfx.js';
import { createWorld } from './world/level.js';
import { QUALITY, loadSettings, autoQuality } from './config.js';

class Game {
  constructor() { this.settings = loadSettings(); this.time = 0; }
  async init() {
    const canvas = document.getElementById('game');
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, alpha: false });
    renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.info.autoReset = true;
    const hq = /q-(low|medium|high|ultra)/.exec(location.hash); const ht = /t-(dawn|day|night)/.exec(location.hash); if (ht) this.settings.time = ht[1];
    const qn = hq ? hq[1] : this.settings.quality === 'auto' ? autoQuality(renderer) : this.settings.quality; this.qualityName = qn; const Q = this.Q = QUALITY[qn];
    this.scene = new THREE.Scene(); this.fxScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 6500); this.scene.add(this.camera);
    const T = this.T = await generateTextures({ size: Q.tex, anisotropy: Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy()), onProgress: (p) => this.progress(p * 0.4, 'Dokular üretiliyor') });
    const M = this.M = createMaterials(T);
    this.sky = new Sky(this.scene, T.noise);
    this.post = new PostFX(renderer, this.sky.uniforms);
    this.post.setQuality({ ao: Q.ao, rays: Q.rays, bloom: Q.bloom, msaa: Q.msaa, scale: Q.scale });
    this.world = await createWorld({ T, M, quality: Q, onProgress: (p, t) => this.progress(0.4 + p * 0.6, t) });
    this.scene.add(this.world.group);
    this.sky.setShadowQuality(Q.shadow, Q.shadowRange);
    this.setTime(this.settings.time);
    this.resize(); addEventListener('resize', () => this.resize());
    this.focus = new THREE.Vector3();
    this.clock = performance.now();
    this.dbgCam(6, 12, 176, 0, -0.12);
    renderer.setAnimationLoop(() => { if (!this.paused) this.frame(); });
  }
  progress(p, t) { window.__progress = [p, t]; }
  setTime(name) { this.timeName = name; this.sky.applyPreset(name, this.renderer); this.preset = TIME_PRESETS[name]; }
  resize() {
    const w = innerWidth, h = innerHeight; const dpr = Math.min(devicePixelRatio || 1, this.Q.maxDpr);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); const c = this.renderer.domElement; c.style.width = w + 'px'; c.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.post.setSize(Math.round(w * dpr), Math.round(h * dpr));
  }
  pause(v) { this.paused = v; }
  renderOnce(n = 1) { const t0 = performance.now(); for (let i = 0; i < n; i++) { this.clock = performance.now() - 16; this.frame(); } this.renderer.getContext().finish(); return Math.round(performance.now() - t0); }
  dbgCam(x, y, z, yaw, pitch, fov) { this.camera.position.set(x, y, z); this.camera.rotation.set(pitch, yaw, 0, 'YXZ'); if (fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); } }
  frame() {
    const now = performance.now(); const dt = Math.min(0.05, (now - this.clock) / 1000); this.clock = now; this.time += dt;
    globalUniforms.uTime.value = this.time;
    this.camera.updateMatrixWorld();
    this.focus.copy(this.camera.position);
    this.sky.update(this.camera, this.time, this.focus);
    const p = this.preset;
    this.post.fx.uKey.value = p.key; this.post.fx.uExposure.value = p.exposure;
    this.post.render(this.scene, this.camera, this.fxScene, dt, { sunDir: this.sky.sunDir, rays: p.rays, fogDensity: p.fogDensity, fogHeight: p.fogHeight });
    this.frames = (this.frames || 0) + 1; if (this.frames > 3) window.__ready = true;
  }
}
const game = window.__sv = new Game();
game.init().catch((e) => { console.error(e); window.__ready = true; });
