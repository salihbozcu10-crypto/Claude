// Silah sistemi: atış, geri tepme, nişan alma, şarjör değiştirme, silah geçişi, bomba atma
import * as THREE from 'three';
import { buildRifle, buildPistol, buildGrenade } from './viewmodel.js';
import { createViewmodelMaterials, globalUniforms } from '../gfx/materials.js';
import { clamp, damp, lerp, smoothstep, Spring, rr, gauss, DEG } from '../core/utils.js';

export const WEAPON_DEFS = {
  rifle: { key: 'rifle', name: 'KARABİNA 5.56', sub: 'Susturuculu · holografik nişangâh', magSize: 30, mags: 6, rpm: 780, vel: 880, dmg: 46, modes: ['OTO', 'TEK'], sound: 'rifleSup', noise: 24,
    kick: { pitch: 0.0105, yaw: 0.0042 }, hip: [0.084, -0.119, -0.112], hipRot: [0.0, 0.03, 0.0], adsZ: -0.052, zoom: 1.32, spreadHip: 0.02, spreadAds: 0.0009, reload: 2.65, reloadEmpty: 3.2, magGrab: [0, -0.07, 0.215], boltGrab: [-0.02, 0.03, 0.25] },
  pistol: { key: 'pistol', name: 'TABANCA 9 MM', sub: 'Susturuculu', magSize: 17, mags: 3, rpm: 430, vel: 365, dmg: 28, modes: ['TEK'], sound: 'pistolSup', noise: 15,
    kick: { pitch: 0.017, yaw: 0.006 }, hip: [0.068, -0.108, -0.21], hipRot: [0.0, 0.02, 0.0], adsZ: -0.25, zoom: 1.12, spreadHip: 0.026, spreadAds: 0.0035, reload: 1.9, reloadEmpty: 2.3, magGrab: [0, -0.04, 0.0], boltGrab: [0, 0.05, 0.02] },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _upv = new THREE.Vector3();
const seg = (t, a, b) => smoothstep(a, b, t);

export class WeaponSystem {
  constructor(game) {
    this.g = game; const V = this.V = createViewmodelMaterials(game.T);
    this.vmCam = new THREE.PerspectiveCamera(54, 1, 0.012, 8);
    this.holder = new THREE.Group(); game.camera.add(this.holder);
    this.models = { rifle: buildRifle(V, game.T), pistol: buildPistol(V) };
    for (const k in this.models) { this.holder.add(this.models[k].root); this.models[k].root.visible = false; }
    this.gren = { frag: buildGrenade(V, false), flash: buildGrenade(V, true) };
    for (const k in this.gren) { this.holder.add(this.gren[k]); this.gren[k].visible = false; }
    this.state = {}; for (const k in WEAPON_DEFS) { const d = WEAPON_DEFS[k]; this.state[k] = { def: d, mag: d.magSize, reserve: Array(d.mags).fill(d.magSize), mode: 0 }; }
    this.curKey = 'rifle'; this.adsT = 0; this.sprintT = 0; this.lowerT = 0; this.cool = 0; this.reloadT = -1; this.reloadDur = 0; this.reloadEmpty = false; this.reloadStage = 0;
    this.switchT = -1; this.switchTo = null; this.throwT = -1; this.throwKind = null; this.frags = 2; this.flashes = 2;
    this.kickZ = new Spring(260, 22); this.kickRot = new Spring(240, 20); this.kickRoll = new Spring(200, 16); this.lagYaw = 0; this.lagPitch = 0;
    this.aimYaw = 0; this.aimPitch = 0; this.shots = 0; this.hits = 0; this.headshots = 0; this.adsToggle = false; this.lowered = false; this.burstHeat = 0;
    this.models.rifle.root.visible = true;
  }
  get cur() { return this.state[this.curKey]; }
  get model() { return this.models[this.curKey]; }
  get reloading() { return this.reloadT >= 0; }
  get busy() { return this.reloadT >= 0 || this.switchT >= 0 || this.throwT >= 0; }
  reset() { for (const k in this.state) { const d = this.state[k].def; this.state[k].mag = d.magSize; this.state[k].reserve = Array(d.mags).fill(d.magSize); this.state[k].mode = 0; } this.frags = 2; this.flashes = 2; this.shots = this.hits = this.headshots = 0; this.reloadT = this.switchT = this.throwT = -1; this.select('rifle', true); }
  select(key, instant) { if (instant) { for (const k in this.models) this.models[k].root.visible = k === key; this.curKey = key; this.switchT = -1; return; } if (key === this.curKey || this.busy) return; this.switchT = 0; this.switchTo = key; this.g.audio.play('cloth', { vol: 0.5 }); }
  totalReserve(k = this.curKey) { return this.state[k].reserve.reduce((a, b) => a + b, 0); }

  // Silah uzayındaki noktayı, ekranda aynı yere düşen dünya noktasına çevirir
  vmToWorld(obj, out) {
    obj.getWorldPosition(out); const cam = this.g.camera;
    out.applyMatrix4(cam.matrixWorldInverse);
    const k = Math.tan(cam.fov * DEG / 2) / Math.tan(this.vmCam.fov * DEG / 2); out.x *= k; out.y *= k;
    return out.applyMatrix4(cam.matrixWorld);
  }

  aimDirection(out, spread) {
    _e.set(this.aimPitch + gauss() * spread, this.aimYaw + gauss() * spread, 0, 'YXZ');
    out.set(0, 0, -1).applyEuler(_e); out.y += 0.00065; // 100 m sıfırlama
    return out.normalize().applyQuaternion(this.g.camera.quaternion);
  }

  fire() {
    const g = this.g, w = this.cur, d = w.def, pl = g.player;
    if (w.mag <= 0) { g.audio.play('dry', { vol: 0.7 }); this.cool = 0.25; g.hud?.toast(this.totalReserve() > 0 ? 'Şarjör boş — R ile değiştir' : 'Mühimmat tükendi'); return false; }
    w.mag--; this.shots++; this.burstHeat = Math.min(1, this.burstHeat + 0.14);
    const ads = this.adsT; const crouch = pl.crouching ? 0.7 : 1;
    let spread = lerp(d.spreadHip, d.spreadAds, ads) * crouch * (1 + pl.speed * lerp(0.35, 0.5, ads)) * (1 + this.burstHeat * lerp(0.8, 0.5, ads)) * (pl.onGround ? 1 : 2.5);
    const dir = this.aimDirection(_dir, spread);
    const from = _v.copy(g.camera.position).addScaledVector(dir, 0.2);
    const muzzle = this.vmToWorld(this.model.muzzle, _v2);
    g.ballistics.fire({ from, dir, speed: d.vel, dmg: d.dmg, owner: 'player', visFrom: muzzle, kind: d.key });
    g.fx.muzzle(muzzle, dir, true, d.key === 'pistol' ? 0.8 : 1);
    // kovan
    const port = this.vmToWorld(this.model.port, new THREE.Vector3());
    _right.set(1, 0, 0).applyQuaternion(g.camera.quaternion); _upv.set(0, 1, 0).applyQuaternion(g.camera.quaternion);
    g.fx.casing(port, new THREE.Vector3().copy(_right).multiplyScalar(rr(1.8, 2.7)).addScaledVector(_upv, rr(1.2, 2.0)).addScaledVector(dir, rr(-0.6, 0.2)).add(new THREE.Vector3(pl.hv.x, 0, pl.hv.z)));
    g.audio.play(d.sound, { vol: 0.85, reverb: 0.22, pitch: rr(0.97, 1.03) });
    // geri tepme
    const k = lerp(1, 0.72, ads) * crouch;
    pl.kickPitch += d.kick.pitch * k * rr(0.85, 1.15); pl.kickYaw += d.kick.yaw * k * rr(-1, 1) + d.kick.yaw * 0.25 * k;
    pl.recoilPitch.impulse(2.4 * k); pl.recoilYaw.impulse(rr(-1.2, 1.2) * k);
    this.kickZ.impulse(d.key === 'pistol' ? 1.3 : 0.95); this.kickRot.impulse(d.key === 'pistol' ? 2.6 : 1.25); this.kickRoll.impulse(rr(-1.2, 1.2));
    this.boltT = 0.06;
    g.ai?.hearNoise(pl.pos, d.noise, 'shot');
    if (w.mag === 0 && this.totalReserve() > 0) g.hud?.toast('Şarjör boş — R');
    return true;
  }

  startReload() {
    const w = this.cur; if (this.busy || w.mag >= w.def.magSize + 0 || this.totalReserve() <= 0) return;
    this.reloadEmpty = w.mag === 0; this.reloadDur = this.reloadEmpty ? w.def.reloadEmpty : w.def.reload; this.reloadT = 0; this.reloadStage = 0; this.g.audio.play('cloth', { vol: 0.5 });
    this.g.input.clearToggle('ads', this.g.touchRoot);
  }
  finishMagSwap() {
    const w = this.cur; if (w.mag > 0) w.reserve.push(w.mag);
    w.reserve.sort((a, b) => a - b); w.mag = w.reserve.pop() || 0; w.reserve = w.reserve.filter((n) => n > 0);
  }

  startThrow(kind) {
    if (this.busy) return; if (kind === 'frag' ? this.frags <= 0 : this.flashes <= 0) { this.g.hud?.toast(kind === 'frag' ? 'El bombası kalmadı' : 'Flaş bombası kalmadı'); return; }
    this.throwT = 0; this.throwKind = kind; this.throwStage = 0; this.g.audio.play('cloth', { vol: 0.5 });
  }

  update(dt) {
    const g = this.g, inp = g.input, pl = g.player, w = this.cur, d = w.def, m = this.model;
    const alive = pl.alive && !pl.frozen;
    // --- girdi
    if (alive) {
      if (inp.hit('reload')) this.startReload();
      if (inp.hit('slot1')) this.select('rifle'); if (inp.hit('slot2')) this.select('pistol');
      if (inp.hit('swap') || inp.wheel !== 0) this.select(this.curKey === 'rifle' ? 'pistol' : 'rifle');
      if (inp.hit('firemode') && d.modes.length > 1) { w.mode = (w.mode + 1) % d.modes.length; g.audio.play('selector'); g.hud?.toast('Atış modu: ' + d.modes[w.mode]); }
      if (inp.hit('grenade')) this.startThrow('frag'); if (inp.hit('flash')) this.startThrow('flash');
    }
    const lowered = !alive || pl.healing > 0 || g.mission?.interacting || pl.mantle != null || this.switchT >= 0 || this.throwT >= 0;
    const canAim = alive && !lowered && !this.reloading && !pl.sprinting;
    const adsTarget = canAim && inp.is('ads') ? 1 : 0;
    this.adsT = damp(this.adsT, adsTarget, adsTarget ? 13 : 16, dt);
    this.sprintT = damp(this.sprintT, pl.sprinting && !this.reloading ? 1 : 0, 9, dt);
    this.lowerT = damp(this.lowerT, lowered ? 1 : 0, 12, dt);
    this.burstHeat = Math.max(0, this.burstHeat - dt * 1.6);

    // --- atış
    this.cool -= dt;
    const auto = d.modes[w.mode] === 'OTO';
    if (alive && !lowered && !this.reloading && this.sprintT < 0.35 && this.cool <= 0 && (auto ? inp.is('fire') : inp.hit('fire'))) {
      if (this.fire()) this.cool = Math.max(this.cool, 0) * 0 + 60 / d.rpm;
    }
    if (this.cool < -0.2) this.cool = 0;

    // --- şarjör değiştirme zaman çizelgesi
    let tilt = 0, handMag = 0, drop = 0, boltHand = 0;
    if (this.reloadT >= 0) {
      const t = (this.reloadT += dt), D = this.reloadDur, s = d.key === 'pistol' ? 0.72 : 1; const E = this.reloadEmpty;
      tilt = seg(t, 0, 0.3 * s) * (1 - seg(t, D - 0.4 * s, D));
      const back = E ? D - 0.75 * s : D - 0.8 * s;
      handMag = seg(t, 0.25 * s, 0.52 * s) * (1 - seg(t, 1.85 * s, 2.2 * s));
      drop = seg(t, 0.55 * s, 0.85 * s) * (1 - seg(t, 1.42 * s, 1.78 * s));
      if (E) boltHand = seg(t, 2.2 * s, 2.42 * s) * (1 - seg(t, 2.6 * s, 2.85 * s));
      if (this.reloadStage === 0 && t > 0.55 * s) { this.reloadStage = 1; g.audio.play('magOut', { vol: 0.8 }); }
      if (this.reloadStage === 1 && t > 1.76 * s) { this.reloadStage = 2; g.audio.play('magIn', { vol: 0.9 }); this.finishMagSwap(); }
      if (this.reloadStage === 2 && E && t > 2.44 * s) { this.reloadStage = 3; g.audio.play('bolt', { vol: 0.85 }); this.kickZ.impulse(-0.4); }
      if (t >= D) { this.reloadT = -1; void back; }
    }
    // --- silah değiştirme
    if (this.switchT >= 0) {
      this.switchT += dt;
      if (this.switchT > 0.3 && this.switchTo) { for (const k in this.models) this.models[k].root.visible = k === this.switchTo; this.curKey = this.switchTo; this.switchTo = null; }
      if (this.switchT > 0.62) this.switchT = -1;
    }
    // --- bomba atma
    const gm = this.throwKind ? this.gren[this.throwKind] : null;
    if (this.throwT >= 0) {
      const t = (this.throwT += dt);
      if (this.throwStage === 0 && t > 0.22) { this.throwStage = 1; g.audio.play('pin', { vol: 0.8 }); gm.visible = true; }
      if (gm && gm.visible) { const u = seg(t, 0.22, 0.52); gm.position.set(lerp(-0.16, 0.02, u), lerp(-0.26, -0.02, u) + Math.sin(u * 3.14) * 0.05, lerp(-0.22, -0.42, u)); gm.rotation.set(t * 5, t * 3, 0); }
      if (this.throwStage === 1 && t > 0.52) {
        this.throwStage = 2; gm.visible = false; const dir = _dir.set(0, 0.12, -1).normalize().applyQuaternion(g.camera.quaternion);
        const from = _v.copy(g.camera.position).addScaledVector(dir, 0.45); from.y -= 0.05;
        g.ballistics.throwGrenade({ from, vel: new THREE.Vector3().copy(dir).multiplyScalar(this.throwKind === 'frag' ? 17.5 : 16).add(new THREE.Vector3(pl.hv.x * 0.6, 1.4, pl.hv.z * 0.6)), kind: this.throwKind, owner: 'player' });
        if (this.throwKind === 'frag') this.frags--; else this.flashes--; g.audio.play('cloth', { vol: 0.7, pitch: 1.3 });
      }
      if (t > 0.95) { this.throwT = -1; this.throwKind = null; }
    }

    // --- duruş: konum + dönüş
    const ads = this.adsT, sp = this.sprintT * (1 - ads), lo = this.lowerT;
    const hx = d.hip[0], hy = d.hip[1], hz = d.hip[2];
    let px = lerp(hx, 0, ads), py = lerp(hy, -m.sightY, ads), pz = lerp(hz, d.adsZ, ads);
    let rx = lerp(d.hipRot[0], 0, ads), ry = lerp(d.hipRot[1], 0, ads), rz = lerp(d.hipRot[2], 0, ads);
    px += sp * -0.035; py += sp * -0.035; pz += sp * 0.03; rx += sp * -0.22; ry += sp * 0.62; rz += sp * 0.22;
    py -= lo * 0.2; rx -= lo * 0.75; ry += lo * 0.2;
    // yürüme salınımı
    const bob = pl.bobPhase, amp = pl.bobAmt * lerp(1, 0.1, ads) * (1 + sp * 1.4);
    px += Math.cos(bob) * 0.0055 * amp; py += Math.sin(bob * 2) * 0.0045 * amp; rz += Math.cos(bob) * 0.014 * amp; rx += Math.sin(bob * 2) * 0.006 * amp;
    // nefes / nişan salınımı (mermi bu sapmayı izler)
    const t = g.time; const crouchK = pl.crouching ? 0.6 : 1;
    const sw = lerp(0.0062, 0.0013, ads) * crouchK * (pl.moving ? 1.8 : 1) * (1 + (1 - pl.stamina) * 1.6 + pl.hurt * 1.3 + pl.suppress * 1.5) * (Math.abs(pl.lean) > 0.3 ? 1.2 : 1);
    this.aimYaw = (Math.sin(t * 0.83) + 0.5 * Math.sin(t * 2.07 + 1.3)) * sw; this.aimPitch = (Math.sin(t * 1.21 + 0.7) + 0.5 * Math.sin(t * 2.63)) * sw * 0.8;
    ry += this.aimYaw; rx += this.aimPitch;
    // bakış gecikmesi
    const lk = inp.enabled ? inp.look(0.0021 * g.settings.sens) : { x: 0, y: 0 };
    this.lagYaw = clamp(damp(this.lagYaw + lk.x * 0.55, 0, 9, dt), -0.09, 0.09); this.lagPitch = clamp(damp(this.lagPitch + lk.y * 0.5, 0, 9, dt), -0.07, 0.07);
    const lagK = lerp(1, 0.25, ads); ry += this.lagYaw * lagK; rx += this.lagPitch * lagK * 0.8; px += this.lagYaw * 0.035 * lagK; py -= this.lagPitch * 0.03 * lagK; rz += this.lagYaw * 0.5 * lagK;
    // geri tepme yayları
    const kz = this.kickZ.update(dt), kr = this.kickRot.update(dt), kl = this.kickRoll.update(dt);
    pz += kz * 0.03 * lerp(1, 0.7, ads); rx += kr * 0.02 * lerp(1, 0.45, ads); rz += kl * 0.01; py += kr * 0.0015;
    py += pl.landDip.x * 0.03; rx -= pl.lean * 0.0; rz -= pl.lean * 0.06 * (1 - ads);
    // şarjör değiştirme pozu
    px += tilt * -0.028; py += tilt * 0.022; pz += tilt * 0.045; rz += tilt * 0.5; rx += tilt * 0.3; ry += tilt * -0.12;
    m.root.position.set(px, py, pz); m.root.rotation.set(rx, ry, rz, 'YXZ');
    // hareketli parçalar
    const G = d.magGrab, Bg = d.boltGrab;
    m.arms.L.position.set(m.armLHome.x + G[0] * handMag + Bg[0] * boltHand, m.armLHome.y + G[1] * handMag - drop * 0.34 + Bg[1] * boltHand, m.armLHome.z + G[2] * handMag + Bg[2] * boltHand);
    m.arms.L.rotation.set(handMag * 0.25, 0, handMag * -0.35 * (d.key === 'rifle' ? 1 : 0.3));
    m.mag.position.set(m.magHome.x, m.magHome.y - drop * 0.34, m.magHome.z + drop * 0.02); if (d.key === 'pistol') m.mag.visible = drop > 0.02;
    if (this.boltT > 0) this.boltT -= dt; const bk = this.boltT > 0 ? Math.sin((this.boltT / 0.06) * Math.PI) : 0; const lockBack = (d.key === 'pistol' && w.mag === 0 && !this.reloading) ? 1 : 0;
    m.bolt.position.z = m.boltHome.z + Math.max(bk, lockBack) * (d.key === 'pistol' ? 0.035 : 0.04);

    // --- kamera ve silah izdüşümü
    const cam = g.camera; const base = pl.fovBase;
    const fov = lerp(base + this.sprintT * 4, base / d.zoom, ads);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.vmCam.fov = lerp(52, cam.fov, ads * ads); this.vmCam.aspect = cam.aspect; this.vmCam.updateProjectionMatrix();
    globalUniforms.uVmProj.value.copy(this.vmCam.projectionMatrix);
    if (m.retMat) { // retikül yönü: silah eksenleri (görüş uzayında)
      _q.setFromEuler(m.root.rotation); m.retMat.uniforms.uAimF.value.set(0, 0, -1).applyQuaternion(_q); m.retMat.uniforms.uAimR.value.set(1, 0, 0).applyQuaternion(_q); m.retMat.uniforms.uAimU.value.set(0, 1, 0).applyQuaternion(_q);
      m.retMat.uniforms.uBright.value = g.nvg ? 0.5 : lerp(2.0, 3.6, 1 - pl.inside * 0.5);
    }
    // silahın ortam aydınlatması: iç mekânda kısılır
    const sv = lerp(1, 0.22, pl.inside); for (const k in this.V) { const mt = this.V[k]; if (mt.userData.skyVis) mt.userData.skyVis.value = sv; }
  }
}
