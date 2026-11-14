// Sessiz Vadi Harekâtı — ana oyun döngüsü ve durum yönetimi
import * as THREE from 'three';
import { generateTextures } from './gfx/textures.js';
import { createMaterials, globalUniforms } from './gfx/materials.js';
import { Sky, TIME_PRESETS } from './gfx/sky.js';
import { PostFX } from './gfx/postfx.js';
import { Effects } from './gfx/effects.js';
import { createWorld } from './world/level.js';
import { Helicopter } from './world/helicopter.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { Player } from './game/player.js';
import { WeaponSystem } from './game/weapons.js';
import { Ballistics } from './game/ballistics.js';
import { AISystem } from './game/ai.js';
import { Mission } from './game/mission.js';
import { HUD } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { QUALITY, DIFFICULTY, loadSettings, autoQuality, isTouch } from './config.js';
import { damp, lerp, clamp, smoothstep } from './core/utils.js';

const $ = (id) => document.getElementById(id);
const _d = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();

class Game {
  constructor() { this.settings = loadSettings(); this.time = 0; this.state = 'loading'; this.nvg = false; this.diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY.regular; this.frames = 0; this.perf = { acc: 0, n: 0, cool: 4, scale: 1 }; this.letter = 0; }

  async init() {
    const canvas = $('game'); this.testMode = /test/.test(location.hash); if (this.testMode) document.body.classList.add('testmode');
    this.audio = new AudioEngine(this); this.input = new Input(canvas); this.hud = new HUD(this); this.menu = new Menu(this);
    const hq = /q-(low|medium|high|ultra)/.exec(location.hash), ht = /t-(dawn|day|night)/.exec(location.hash); if (ht) this.settings.time = ht[1];
    let renderer;
    try { renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, alpha: false }); }
    catch (e) { $('load-text').textContent = 'Bu cihazda WebGL 2 başlatılamadı. Güncel bir tarayıcı ile deneyin.'; throw e; }
    renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    this.qualityName = hq ? hq[1] : this.settings.quality === 'auto' ? autoQuality(renderer) : this.settings.quality;
    const Q = this.Q = { ...QUALITY[this.qualityName] }; this.perf.scale = Q.scale;
    this.scene = new THREE.Scene(); this.fxScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.08, 6500); this.scene.add(this.camera);
    const T = this.T = await generateTextures({ size: Q.tex, anisotropy: Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy()), onProgress: (p) => this.menu.progress(p * 0.42, 'Dokular üretiliyor') });
    const M = this.M = createMaterials(T);
    this.sky = new Sky(this.scene, T.noise);
    this.post = new PostFX(renderer, this.sky.uniforms);
    this.post.setQuality({ ao: Q.ao, rays: Q.rays, bloom: Q.bloom, msaa: Q.msaa, scale: Q.scale });
    this.world = await createWorld({ T, M, quality: Q, onProgress: (p, t) => this.menu.progress(0.42 + p * 0.56, t) });
    this.scene.add(this.world.group);
    this.sky.setShadowQuality(Q.shadow, Q.shadowRange);
    this.fx = new Effects(this);
    this.buildLights();
    this.player = new Player(this); this.weapons = new WeaponSystem(this); this.ballistics = new Ballistics(this); this.ai = new AISystem(this); this.heli = new Helicopter(this); this.mission = new Mission(this);
    this.weapons.holder.visible = false;
    // sabit efekt yayıcıları
    for (const f of this.world.data.fires) this.fx.addEmitter({ type: 'fire', x: f.x, y: f.y, z: f.z, rate: 26, range: 120 });
    this.fx.addEmitter({ type: 'smoke', x: 58, y: 0.4, z: -22, rate: 1.6, range: 900, a: 0.5 });
    this.motes = this.fx.addEmitter({ type: 'motes', x: 0, y: 0, z: 0, rate: 9, range: 1e6 });
    // gece görüşü için kızılötesi aydınlatıcı
    this.irLight = new THREE.SpotLight(0xffffff, 0, 70, 0.55, 0.6, 1.4); this.irLight.position.set(0, 0, 0); this.camera.add(this.irLight); this.irLight.target.position.set(0, 0, -1); this.camera.add(this.irLight.target);
    this.setTime(this.settings.time);
    if (isTouch) { document.body.classList.add('touch'); $('touch').hidden = false; this.touchRoot = $('touch'); this.input.bindTouch(this.touchRoot); }
    this.resize();
    addEventListener('resize', () => { this.resize(); if (this.state === 'pause') this.render(0); });
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    this.input.onLockChange = (locked) => { if (!locked && this.state === 'play' && !this.input.touch && !this.input.freeLook) this.pause(); };
    this.focus = new THREE.Vector3(); this.clock = performance.now();
    this.menu.progress(0.99, 'Gölgelendiriciler derleniyor'); await new Promise((r) => setTimeout(r, 30));
    try { this.warmup(); } catch (e) { console.warn('warmup', e); }
    this.menu.progress(1, 'Hazır');
    this.toMenu(true);
    renderer.setAnimationLoop(() => { if (!this.paused) this.frame(); });
    window.__ready = true;
  }

  // Görev sırasında takılma olmasın diye tüm malzemeleri yükleme ekranının arkasında bir kez çizer
  warmup() {
    const st = this.world.data.playerStart, y = this.world.groundY(st.x, st.z), cam = this.camera;
    this.diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY.regular;
    const list = []; for (let i = 0; i < 4; i++) list.push({ x: st.x - 3 + i * 2, z: st.z - 9, yaw: 0, role: 'idle' });
    this.ai.spawn(list, { x: st.x, z: st.z - 6, y, yaw: 0 });
    this.player.spawn(st.x, st.z, 0); this.player.updateEye(0.016);
    this.weapons.holder.visible = true; for (const k in this.weapons.models) this.weapons.models[k].root.visible = true; for (const k in this.weapons.gren) this.weapons.gren[k].visible = true;
    const p = new THREE.Vector3(st.x, y + 1.2, st.z - 5), n = new THREE.Vector3(0, 0, 1);
    for (const s of [0, 1, 2]) { this.fx.impact(s, p, n); this.fx.decal(s, p, n); } this.fx.decal(99, p, n); this.fx.muzzle(p, n, false); this.fx.tracer(p, n); this.fx.casing(p.clone(), n.clone());
    this.heli.root.visible = true; this.heli.root.position.set(st.x, y + 4, st.z - 24);
    for (const m of this.ballistics.gMeshes) { m.visible = true; m.position.copy(p); }
    const c4 = new THREE.Mesh(this.mission.c4Geo, this.M.dyn.olive); c4.position.copy(p); c4.add(new THREE.Mesh(this.mission.lightGeo, this.mission.lightMat)); this.scene.add(c4);
    this.state = 'free'; this.weapons.update(0.016); for (const s of this.ai.soldiers) s.update(0.016); this.fx.update(0.016, cam); this.updateLights(0.016);
    this.render(0.016); this.post.fx.uNvg.value = 1; this.render(0.016); this.post.fx.uNvg.value = 0;
    this.scene.remove(c4); this.ai.clear(); this.fx.clear(); this.heli.reset(); for (const m of this.ballistics.gMeshes) m.visible = false; for (const k in this.weapons.gren) this.weapons.gren[k].visible = false;
    this.weapons.select('rifle', true); this.weapons.holder.visible = false; this.post.firstFrame = true;
  }

  // ---------------------------------------------------------------- ışıklar
  buildLights() {
    const n = this.Q.lights; this.lightPool = [];
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffc890, 0, 20, 2); l.castShadow = false; this.scene.add(l); this.lightPool.push(l); }
    this.lightSrc = this.world.lights.map((s) => ({ ...s, d: 0 })); this.lightT = 0; this.lightScale = 1;
  }
  updateLights(dt) {
    this.lightT -= dt; const cam = this.camera.position; const src = this.lightSrc;
    if (this.lightT <= 0) {
      this.lightT = 0.2;
      for (const s of src) { const on = s.flicker ? 1 : this.lightScale; s.d = on > 0.01 ? Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z) : 1e9; }
      src.sort((a, b) => a.d - b.d);
    }
    for (let i = 0; i < this.lightPool.length; i++) {
      const l = this.lightPool[i], s = src[i]; if (!s || s.d > 1e8) { l.intensity = 0; continue; }
      const R = s.indoor ? 34 : 60; const fade = 1 - smoothstep(R * 0.65, R, s.d);
      const fl = s.flicker ? 0.75 + 0.25 * Math.sin(this.time * 17 + s.x) * Math.sin(this.time * 7.3) + 0.1 * Math.sin(this.time * 31) : 1;
      l.position.set(s.x, s.y, s.z); l.color.setRGB(s.color[0], s.color[1], s.color[2]); l.intensity = s.intensity * (s.flicker ? 1 : this.lightScale) * fade * fl; l.distance = s.dist;
    }
  }

  setTime(name) {
    this.timeName = name; const p = this.preset = TIME_PRESETS[name]; this.sky.applyPreset(name, this.renderer); this.fx.setLight(p);
    const b = p.bulbs; this.lightScale = b; this.M.bulb.color.setRGB(0.05 + 9 * b, 0.05 + 6.2 * b, 0.05 + 3.2 * b); this.M.screenOn.color.setRGB(0.5, 0.95, 1.6);
    this.ai.lamps = b > 0.7 ? this.world.lights.filter((l) => !l.indoor).map((l) => ({ x: l.x, z: l.z, r: 11 })) : [];
    this.post.fx.uExpRange.value.set(name === 'night' ? 0.5 : 0.35, name === 'night' ? 7 : 3.4);
    this.post.firstFrame = true; this.motes.enabled = name !== 'night';
  }

  applyQuality(name) {
    this.qualityName = name === 'auto' ? autoQuality(this.renderer) : name; const Q = QUALITY[this.qualityName];
    Object.assign(this.Q, { scale: Q.scale, maxDpr: Q.maxDpr, msaa: Q.msaa, ao: Q.ao, rays: Q.rays, bloom: Q.bloom, shadow: Q.shadow, shadowRange: Q.shadowRange });
    this.perf.scale = Q.scale; this.post.setQuality({ ao: Q.ao, rays: Q.rays, bloom: Q.bloom, msaa: Q.msaa, scale: Q.scale }); this.sky.setShadowQuality(Q.shadow, Q.shadowRange); this.resize();
  }

  resize() {
    const w = Math.max(64, innerWidth), h = Math.max(64, innerHeight); const dpr = Math.min(devicePixelRatio || 1, this.Q.maxDpr);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.post.setSize(Math.round(w * dpr), Math.round(h * dpr)); this.fx.setSize(this.post.w, this.post.h); this.hud.resize();
    $('rotate').hidden = !(isTouch && h > w * 1.05);
  }

  lineBlocked(a, b) { _d.copy(b).sub(a); const dist = _d.length(); if (dist < 0.1) return false; _d.multiplyScalar(1 / dist); return !!this.ballistics.raycast(a, _d, dist - 0.1); }

  // ---------------------------------------------------------------- durum geçişleri
  toMenu(first) {
    this.state = 'menu'; this.menu.show('menu'); this.hud.show(false); this.weapons.holder.visible = false; this.input.enabled = false; this.input.exitLock(); this.nvg = false; this.post.fx.uNvg.value = 0; this.irLight.intensity = 0;
    if (!first) { this.ai.clear(); this.heli.reset(); this.audio.resume(); }
    this.paused = false; $('fade').classList.remove('on'); $('intro').hidden = true;
    if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
  }

  startMission() {
    const s = this.settings; this.audio.init(); this.audio.resume(); this.diff = DIFFICULTY[s.difficulty] || DIFFICULTY.regular;
    if (s.time !== this.timeName) this.setTime(s.time);
    this.ballistics.clear(); this.fx.clear(); for (const b of this.world.data.barrels) b.dead = false;
    this.ai.spawn(this.world.data.enemies, this.world.data.objectives.hostage);
    const st = this.world.data.playerStart; this.player.spawn(st.x, st.z, st.yaw); this.player.fovBase = s.fov; this.weapons.reset(); this.mission.start();
    this.nvg = false; this.post.fx.uNvg.value = 0; this.irLight.intensity = 0;
    this.state = 'intro'; this.stateT = 0; this.missionTime = 0; this.menu.hide(); this.hud.show(true); this.hud.objT = 9; this.hud.objKey = '';
    this.weapons.holder.visible = true; this.input.reset(); this.input.enabled = true; this.input.requestLock(); this.paused = false;
    const intro = $('intro'); intro.hidden = true; void intro.offsetWidth; intro.hidden = false;
    $('fade').classList.add('on'); setTimeout(() => $('fade').classList.remove('on'), 350);
    // ortam sesleri
    const d = this.world.data; if (d.fires[0]) this.audio.loop('fire', { vol: 0.5, pos: d.fires[0], ref: 2.5, roll: 1.4 });
    if (d.emitters[0]) this.audio.loop('generator', { vol: 0.5, pos: d.emitters[0], ref: 4, roll: 1.3 });
    if (this.timeName === 'night') { this.audio.loop('crickets', { vol: 0.0 }); this.audio.loopVol('crickets', 0.35, 1); } else this.audio.loopVol('crickets', 0, 0.5);
    this.clock = performance.now();
  }

  pause() { if (this.state !== 'play') return; this.state = 'pause'; this.menu.show('pause'); this.hud.show(false); this.input.enabled = false; this.input.reset(); this.input.exitLock(); this.audio.suspend(); }
  resume() { if (this.state !== 'pause') return; this.state = 'play'; this.menu.hide(); this.hud.show(true); this.input.enabled = true; this.input.reset(); this.input.requestLock(); this.audio.resume(); this.clock = performance.now(); }

  onPlayerDeath() { if (this.state !== 'play' && this.state !== 'intro') return; this.state = 'dead'; this.stateT = 0; this.deadInfo = ['Vuruldun', 'Kartal-1 ile telsiz bağlantısı kesildi. Daha sessiz ilerlemeyi ve siper kullanmayı dene.']; this.input.clearToggle('ads', this.touchRoot); }
  onMissionFailed(reason) { if (this.state !== 'play') return; this.state = 'dead'; this.stateT = 1.2; this.deadInfo = ['Görev iptal', reason + '. Harekât başarısız sayıldı.']; }
  onHeliLanded() { this.mission.radio(0.4, 'ŞAHİN-2', 'Şahin-2 yerde, bekliyorum. Acele et Kartal-1!'); }

  startOutro() {
    this.state = 'outro'; this.stateT = 0; this.outroStage = 0; this.input.enabled = false; this.input.exitLock(); this.hud.show(false); $('fade').classList.add('on');
    this.debrief = { time: this.missionTime, kills: this.ai.kills, shots: this.weapons.shots, accuracy: this.weapons.shots ? Math.round(100 * this.weapons.hits / this.weapons.shots) : 0, headshots: this.weapons.headshots, health: Math.round(this.player.health), optional: this.mission.obj('cache').done, spotted: this.ai.everSpotted, difficulty: this.settings.difficulty };
  }

  spawnReinforcements() {
    const r = this.world.data.reinforce; const list = []; for (let i = 0; i < 4; i++) list.push({ x: r.from[0][0] + (i % 2) * 2.5 - 1, z: 120 + Math.floor(i / 2) * 3, yaw: Math.PI, role: 'idle' });
    this.ai.reinforce(list, this.player.pos);
  }

  // ---------------------------------------------------------------- kare
  frame() {
    const now = performance.now(); const dt = Math.min(0.05, Math.max(0.001, (now - this.clock) / 1000)); this.clock = now;
    if (this.state === 'pause' || this.state === 'loading') return;
    this.time += dt; globalUniforms.uTime.value = this.time; this.frames++;
    const st = this.state, inp = this.input, pl = this.player; inp.poll();
    if (st === 'intro' || st === 'play' || st === 'dead') {
      this.stateT += dt;
      if (st === 'intro') { pl.frozen = this.stateT < 1.2; if (this.stateT > 4.2) { this.state = 'play'; $('intro').hidden = true; pl.frozen = false; } }
      if (st === 'play') { this.missionTime += dt; if (inp.hitAny('pause')) { this.pause(); inp.endFrame(); return; } }
      if (inp.hit('nvg') && pl.alive) { this.nvg = !this.nvg; this.audio.play('nvg', { vol: 0.8 }); this.post.fx.uNvg.value = this.nvg ? 1 : 0; this.irLight.intensity = this.nvg ? 60 : 0; }
      pl.update(dt); this.weapons.update(dt); this.ai.update(dt); this.ballistics.update(dt); if (st !== 'dead') this.mission.update(dt); this.heli.update(dt);
      if (st === 'dead' && this.stateT > 2.8 && this.menu.current !== 'dead') { this.menu.dead(this.deadInfo[0], this.deadInfo[1]); this.hud.show(false); this.input.enabled = false; this.input.exitLock(); }
      $('lockhint').hidden = !(st === 'play' && !inp.touch && !inp.locked && !inp.freeLook);
    } else if (st === 'outro') this.updateOutro(dt);
    else if (st !== 'free') this.updateMenuCamera(dt);
    this.fx.update(dt, this.camera); this.updateLights(dt);
    if (!this.noRender) { this.render(dt); this.hud.update(dt); }
    this.audio.update(dt, { inside: pl.inside, deaf: pl.deaf, hurt: pl.alive && (st === 'play') ? pl.hurt : 0, birds: this.timeName === 'dawn' && st !== 'outro', menu: st === 'menu' });
    this.monitor(dt);
    inp.endFrame();
  }

  updateMenuCamera(dt) {
    const a = this.time * 0.018 + 2.35; const cam = this.camera; const r = 132;
    cam.position.set(Math.cos(a) * r - 6, 30 + Math.sin(this.time * 0.05) * 3, Math.sin(a) * r + 14); _t.set(0, 5, -8); cam.lookAt(_t); this.letter = damp(this.letter, 0, 3, dt);
    this.player.inside = 0; this.player.deaf = 0;
  }

  updateOutro(dt) {
    this.stateT += dt; const t = this.stateT, lz = this.world.data.lz, cam = this.camera; this.letter = damp(this.letter, 1, 3, dt);
    if (this.outroStage === 0 && t > 0.8) { this.outroStage = 1; this.weapons.holder.visible = false; if (this.ai.hostage) this.ai.hostage.mesh.visible = false; this.heli.takeoff(); $('fade').classList.remove('on'); cam.fov = 42; cam.updateProjectionMatrix(); this.nvg = false; this.post.fx.uNvg.value = 0; this.irLight.intensity = 0; this.player.flash = 0; this.player.deaf = 0; }
    if (this.outroStage >= 1) {
      const k = smoothstep(0.8, 11, t);
      cam.position.set(lz.x - 30 - k * 6, lz.y + 4.5 + k * 3, lz.z + 16 + k * 4);
      _t.set(lerp(-24, 30, 0.5), 9, lerp(-41, -29, 0.5)).lerp(this.heli.pos, 0.42 * (1 - smoothstep(4, 8, t))); cam.lookAt(_t);
    }
    if (this.outroStage === 1 && t > 4.4) { this.outroStage = 2; this.mission.detonate(); }
    if (this.outroStage === 2 && t > 11.5) { this.outroStage = 3; $('fade').classList.add('on'); }
    if (this.outroStage === 3 && t > 12.4) { this.outroStage = 4; this.state = 'debrief'; this.menu.debrief(this.debrief); $('fade').classList.remove('on'); this.heli.reset(); this.ai.clear(); }
    this.heli.update(dt); this.ballistics.update(dt); this.player.inside = 0;
  }

  render(dt) {
    const cam = this.camera, pl = this.player, p = this.preset, fx = this.post.fx; cam.updateMatrixWorld();
    const playing = this.state === 'play' || this.state === 'intro' || this.state === 'dead';
    if (playing) { cam.getWorldDirection(_f); this.focus.copy(pl.pos).addScaledVector(_f.setY(0).normalize(), this.Q.shadowRange * 0.42); } else this.focus.copy(cam.position);
    this.sky.update(cam, this.time, this.focus);
    this.letter = damp(this.letter, this.state === 'intro' && this.stateT < 3.4 ? 1 : this.state === 'outro' ? 1 : 0, 4, dt || 0.016);
    fx.uKey.value = p.key; fx.uExposure.value = p.exposure * (playing ? lerp(1, 1.0, pl.inside) : 1);
    fx.uDamage.value = playing ? pl.damageFlash : 0; fx.uHurt.value = playing ? pl.hurt : 0; fx.uFlash.value = playing ? clamp(pl.flash, 0, 1) : 0; fx.uSuppress.value = playing ? pl.suppress : 0; fx.uLetter.value = this.letter;
    fx.uBloom.value = this.nvg ? 0.22 : 0.065; fx.uVignette.value = this.nvg ? 0 : 0.42;
    this.post.render(this.scene, cam, this.fxScene, dt || 0.016, { sunDir: this.sky.sunDir, rays: p.rays * (1 - (playing ? pl.inside : 0) * 0.7), fogDensity: p.fogDensity, fogHeight: p.fogHeight, bloomThreshold: this.nvg ? 0.35 : 1.0 });
  }

  // Otomatik kalitede kare süresine göre çözünürlük ölçeğini ayarlar
  monitor(dt) {
    const pf = this.perf; pf.acc += dt; pf.n++; pf.cool -= dt;
    if (pf.acc < 2) return; const avg = pf.acc / pf.n; pf.acc = 0; pf.n = 0; this.fps = Math.round(1 / avg);
    if (this.settings.quality !== 'auto' || pf.cool > 0 || this.state === 'menu') return;
    if (avg > 0.031 && pf.scale > 0.5) { pf.scale = Math.max(0.5, pf.scale - 0.12); this.post.setQuality({ scale: pf.scale }); this.fx.setSize(this.post.w, this.post.h); pf.cool = 4; if (pf.scale <= 0.62 && this.post.q.ao) { this.post.setQuality({ ao: false, rays: false }); } }
    else if (avg < 0.0125 && pf.scale < this.Q.scale - 0.01) { pf.scale = Math.min(this.Q.scale, pf.scale + 0.06); this.post.setQuality({ scale: pf.scale }); this.fx.setSize(this.post.w, this.post.h); pf.cool = 6; }
  }

  // --- test / hata ayıklama yardımcıları
  testPause(v) { this.paused = v; }
  // n kare benzetim yapar; yalnızca son kareyi çizer ve GPU'nun bitirmesini bekler (gerçek süreyi ölçer)
  renderOnce(n = 1, dtMs = 16.7) { for (let i = 0; i < n; i++) { this.clock = performance.now() - dtMs; this.noRender = i < n - 1; if (!this.noRender) this.post.firstFrame = true; this.frame(); } this.noRender = false; const t0 = performance.now(); const gl = this.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return Math.round(performance.now() - t0); }
  sim(n = 1, dtMs = 16.7) { for (let i = 0; i < n; i++) { this.clock = performance.now() - dtMs; this.noRender = true; this.frame(); } this.noRender = false; return this.state; }
  dbgCam(x, y, z, yaw, pitch, fov) { this.state = 'free'; this.camera.position.set(x, y, z); this.camera.rotation.set(pitch, yaw, 0, 'YXZ'); if (fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); } }
}

const game = window.__sv = new Game();
const boot = () => game.init().catch((e) => { console.error(e); const t = $('load-text'); if (t && game.state === 'loading') t.textContent = 'Başlatma hatası: ' + (e && e.message ? e.message : e); window.__ready = true; });
if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot();
