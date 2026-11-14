// Oyuncu: kapsül çarpışmalı hareket, duruşlar, eğilme, engel aşma, sağlık
import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep, DEG, Spring } from '../core/utils.js';
import { SURF_NAMES } from '../gfx/materials.js';

const R = 0.32, H_STAND = 1.8, H_CROUCH = 1.12;
const _seg = new THREE.Line3(), _box = new THREE.Box3(), _tp = new THREE.Vector3(), _cp = new THREE.Vector3(), _dir = new THREE.Vector3();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Ray(), _n = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.g = game; this.pos = new THREE.Vector3(); this.hv = new THREE.Vector3(); this.vy = 0;
    this.yaw = 0; this.pitch = 0; this.height = H_STAND; this.crouching = false; this.onGround = true; this.groundN = new THREE.Vector3(0, 1, 0);
    this.lean = 0; this.leanT = 0; this.health = 100; this.bandages = 3; this.alive = true; this.stamina = 1;
    this.eye = new THREE.Vector3(); this.speed = 0; this.moving = false; this.sprinting = false;
    this.bobPhase = 0; this.bobAmt = 0; this.landDip = new Spring(160, 16); this.recoilPitch = new Spring(110, 15); this.recoilYaw = new Spring(110, 15);
    this.kickPitch = 0; this.kickYaw = 0; this.stepDist = 0; this.airTime = 0; this.fallStart = 0;
    this.mantle = null; this.noise = 0; this.hurt = 0; this.damageFlash = 0; this.suppress = 0; this.flash = 0; this.deaf = 0;
    this.healing = 0; this.shakeT = 0; this.shakeAmp = 0; this.deathT = 0; this.lastSurface = 'sand'; this.camRoll = 0;
    this.adsT = 0; this.fovBase = game.settings.fov; this.breath = 0; this.hitDir = []; this.inside = 0; this.sunVis = 1; this.visT = 0;
    this.lastDamageT = -99; this.godMode = false; this.frozen = false; this.viewPunch = new Spring(90, 12);
  }

  spawn(x, z, yaw) {
    const y = this.g.world.groundY(x, z);
    this.pos.set(x, y + 0.02, z); this.hv.set(0, 0, 0); this.vy = 0; this.yaw = yaw; this.pitch = -0.05; this.health = 100; this.alive = true; this.bandages = 3; this.stamina = 1;
    this.crouching = false; this.height = H_STAND; this.deathT = 0; this.mantle = null; this.hurt = 0; this.flash = 0; this.deaf = 0;
  }

  // Kapsülü çarpışma ağından dışarı iter; düzeltme vektörünü döndürür
  resolve(h) {
    const bvh = this.g.world.collider.bvh;
    _seg.start.set(this.pos.x, this.pos.y + R, this.pos.z); _seg.end.set(this.pos.x, this.pos.y + h - R, this.pos.z);
    _box.makeEmpty(); _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end); _box.min.addScalar(-R); _box.max.addScalar(R);
    bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const d = tri.closestPointToSegment(_seg, _tp, _cp);
        if (d < R) {
          const depth = R - d;
          if (d > 1e-5) _dir.copy(_cp).sub(_tp).multiplyScalar(1 / d); else tri.getNormal(_dir);
          _seg.start.addScaledVector(_dir, depth); _seg.end.addScaledVector(_dir, depth);
        }
      },
    });
    _v.set(_seg.start.x - this.pos.x, _seg.start.y - R - this.pos.y, _seg.start.z - this.pos.z);
    return _v;
  }

  fits(x, y, z, h) {
    const bvh = this.g.world.collider.bvh; let hit = false;
    _seg.start.set(x, y + R + 0.02, z); _seg.end.set(x, y + h - R, z);
    _box.makeEmpty(); _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end); _box.min.addScalar(-R); _box.max.addScalar(R);
    bvh.shapecast({ intersectsBounds: (b) => b.intersectsBox(_box), intersectsTriangle: (tri) => { if (tri.closestPointToSegment(_seg, _tp, _cp) < R - 0.03) { hit = true; return true; } return false; } });
    return !hit;
  }

  raycast(origin, dir, far) { _ray.origin.copy(origin); _ray.direction.copy(dir); return this.g.world.collider.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far); }

  tryMantle() {
    const f = _v2.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    for (const hgt of [0.55, 1.0, 1.4]) {
      const o = new THREE.Vector3(this.pos.x, this.pos.y + hgt, this.pos.z);
      const hit = this.raycast(o, f, 0.95);
      if (!hit) continue;
      // engelin üst yüzeyini bul
      const top = new THREE.Vector3(hit.point.x + f.x * 0.32, this.pos.y + 2.1, hit.point.z + f.z * 0.32);
      const dn = this.raycast(top, new THREE.Vector3(0, -1, 0), 1.9);
      if (!dn) continue;
      const rise = dn.point.y - this.pos.y;
      if (rise < 0.42 || rise > 1.65 || dn.face.normal.y < 0.6) continue;
      if (!this.fits(top.x, dn.point.y + 0.03, top.z, H_CROUCH)) continue;
      this.mantle = { t: 0, dur: 0.38 + rise * 0.28, from: this.pos.clone(), to: new THREE.Vector3(top.x, dn.point.y + 0.02, top.z) };
      this.crouching = true; this.g.audio.play('cloth', { vol: 0.5 });
      return true;
    }
    return false;
  }

  update(dt) {
    const g = this.g, inp = g.input, set = g.settings;
    if (!this.alive) { this.deathT += dt; this.height = damp(this.height, 0.35, 5, dt); this.camRoll = damp(this.camRoll, 0.9, 3, dt); this.pitch = damp(this.pitch, -0.5, 2, dt); this.vy -= 12 * dt; this.pos.y += this.vy * dt; const d = this.resolve(0.7); this.pos.add(d); if (d.y > 0) this.vy = 0; this.updateEye(dt); return; }

    // --- bakış
    const ads = g.weapons ? g.weapons.adsT : 0; this.adsT = ads;
    const sens = 0.0021 * set.sens * lerp(1, 0.62, ads) * (inp.touch ? 1.15 : 1);
    if (!this.frozen) {
      const lk = inp.look(sens);
      this.yaw -= lk.x; this.pitch -= lk.y * (set.invertY ? -1 : 1);
    }
    this.pitch = clamp(this.pitch, -1.45, 1.45);

    // --- duruş
    if (inp.hit('crouch')) this.crouching = !this.crouching;
    const wantCrouch = this.crouching || inp.is('crouchHold');
    const targetH = wantCrouch ? H_CROUCH : H_STAND;
    if (targetH > this.height + 0.01 && !this.fits(this.pos.x, this.pos.y, this.pos.z, Math.min(H_STAND, this.height + 0.25))) { /* tavan engel */ }
    else this.height = damp(this.height, targetH, 11, dt);
    const crouchK = 1 - smoothstep(H_CROUCH, H_STAND, this.height);

    // --- engel aşma animasyonu
    if (this.mantle) {
      const m = this.mantle; m.t += dt / m.dur; const t = Math.min(1, m.t); const e = t * t * (3 - 2 * t);
      this.pos.lerpVectors(m.from, m.to, e); this.pos.y = lerp(m.from.y, m.to.y, Math.min(1, t * 1.5)) + Math.sin(t * Math.PI) * 0.12;
      this.hv.set(0, 0, 0); this.vy = 0; this.onGround = true;
      if (m.t >= 1) { this.mantle = null; if (!inp.is('crouchHold')) this.crouching = false; }
      this.speed = 1.5; this.moving = true; this.noise = 5; this.updateEye(dt); return;
    }

    // --- hareket
    const mx = this.frozen ? 0 : inp.moveX, my = this.frozen ? 0 : inp.moveY; const moveLen = Math.hypot(mx, my);
    const wantSprint = (inp.is('sprint') || inp.touchSprint) && my > 0.5 && !wantCrouch && this.stamina > 0.05 && ads < 0.3 && !this.healing;
    this.sprinting = wantSprint && this.onGround;
    let maxSpd = this.sprinting ? 6.1 : lerp(3.5, 1.75, crouchK);
    maxSpd *= lerp(1, 0.55, ads) * (this.healing ? 0.4 : 1) * lerp(0.8, 1, clamp(this.health / 60, 0, 1));
    if (my < 0) maxSpd *= 0.75;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = (-sy * my + cy * mx), wz = (-cy * my - sy * mx);
    const accel = this.onGround ? 46 : 6;
    const tx = wx * maxSpd, tz = wz * maxSpd;
    if (this.onGround) {
      const k = 1 - Math.exp(-(moveLen > 0.01 ? 9 : 12) * dt);
      this.hv.x += (tx - this.hv.x) * k; this.hv.z += (tz - this.hv.z) * k;
    } else { this.hv.x += clamp(tx - this.hv.x, -accel * dt, accel * dt) * 0.5; this.hv.z += clamp(tz - this.hv.z, -accel * dt, accel * dt) * 0.5; }
    this.stamina = clamp(this.stamina + (this.sprinting ? -dt / 14 : dt / 7), 0, 1);

    if (inp.hit('jump') && this.onGround && !this.frozen) {
      if (!this.tryMantle()) { if (this.fits(this.pos.x, this.pos.y, this.pos.z, H_STAND)) { this.vy = 3.7; this.onGround = false; this.crouching = false; g.audio.play('cloth', { vol: 0.35 }); } }
    }

    const wasGround = this.onGround; const steps = 5, h = dt / steps; let grounded = false;
    for (let i = 0; i < steps; i++) {
      if (this.onGround && this.vy <= 0) this.vy = -4.5; else this.vy -= 15.5 * h;
      this.pos.x += this.hv.x * h; this.pos.y += this.vy * h; this.pos.z += this.hv.z * h;
      const d = this.resolve(this.height); const dl = d.length();
      if (dl > 1e-6) {
        this.pos.add(d); _n.copy(d).multiplyScalar(1 / dl);
        if (_n.y > 0.62) { grounded = true; this.groundN.copy(_n); if (this.vy < 0) this.vy = 0; }
        else if (_n.y < -0.5 && this.vy > 0) this.vy = 0;
        // duvara doğru olan yatay hızı sönümle (kay)
        const hl = Math.hypot(_n.x, _n.z);
        if (hl > 0.3) { const nx = _n.x / hl, nz = _n.z / hl; const vn = this.hv.x * nx + this.hv.z * nz; if (vn < 0) { this.hv.x -= nx * vn; this.hv.z -= nz * vn; } }
        if (_n.y > 0.05 && _n.y <= 0.62 && !grounded) { /* dik yamaç: kay */ this.hv.x += _n.x * 6 * h; this.hv.z += _n.z * 6 * h; }
      }
    }
    this.onGround = grounded;
    if (!grounded) { if (wasGround) this.fallStart = this.pos.y; this.airTime += dt; }
    else if (!wasGround || this.airTime > 0) {
      const fall = this.fallStart - this.pos.y;
      if (this.airTime > 0.22) { this.landDip.impulse(-Math.min(2.2, 0.6 + fall * 0.5)); this.footstep(1.0); if (fall > 3.4) this.damage((fall - 3.4) * 22, null, true); }
      this.airTime = 0;
    }
    // harekât alanı sınırı
    const rr = Math.hypot(this.pos.x, this.pos.z); if (rr > 345) { this.pos.x *= 345 / rr; this.pos.z *= 345 / rr; g.hud?.warn('HAREKÂT ALANI SINIRI — GERİ DÖN'); }
    if (this.pos.y < -60) this.pos.y = this.g.world.terrain.heightAt(this.pos.x, this.pos.z) + 1;

    this.speed = Math.hypot(this.hv.x, this.hv.z); this.moving = this.speed > 0.4;
    // adım sesleri + gürültü yarıçapı (yapay zekâ duyması için)
    if (this.onGround && this.moving) {
      this.stepDist += this.speed * dt; const stride = this.sprinting ? 2.1 : crouchK > 0.5 ? 1.15 : 1.5;
      if (this.stepDist > stride) { this.stepDist = 0; this.footstep(this.sprinting ? 0.9 : crouchK > 0.5 ? 0.22 : 0.5); }
      this.noise = this.sprinting ? 14 : crouchK > 0.5 ? 2.2 : this.speed > 2.4 ? 7 : 4;
    } else this.noise = 0;

    // eğilme (köşeden bakış)
    const leanIn = (inp.is('leanR') ? 1 : 0) - (inp.is('leanL') ? 1 : 0);
    let leanTarget = this.sprinting ? 0 : leanIn;
    if (leanTarget !== 0) { const side = _v2.set(cy * leanTarget, 0, -sy * leanTarget); const o = new THREE.Vector3(this.pos.x, this.pos.y + this.height - 0.2, this.pos.z); const hit = this.raycast(o, side, 0.75); if (hit) leanTarget *= clamp((hit.distance - 0.3) / 0.45, 0, 1); }
    this.lean = damp(this.lean, leanTarget, 9, dt);

    // iyileşme (sargı)
    if (inp.is('heal') && this.bandages > 0 && this.health < 99 && !this.sprinting) {
      if (this.healing === 0) g.audio.play('cloth', { vol: 0.6 });
      this.healing += dt; if (this.healing > 3.2) { this.health = Math.min(100, this.health + 45); this.bandages--; this.healing = 0; g.audio.play('cloth', { vol: 0.7 }); g.hud?.toast('Sargı uygulandı'); inp.clearToggle('heal', g.touchRoot); }
    } else this.healing = 0;

    // etkiler
    this.hurt = damp(this.hurt, this.health < 40 ? 1 - this.health / 40 : 0, 3, dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.4); this.suppress = Math.max(0, this.suppress - dt * 0.9);
    this.flash = Math.max(0, this.flash - dt * (this.flash > 1 ? 0.5 : 0.28)); this.deaf = Math.max(0, this.deaf - dt * 0.2);
    for (const hd of this.hitDir) hd.t -= dt; this.hitDir = this.hitDir.filter((hd) => hd.t > 0);

    // içeride mi / gölgede mi? (pozlama ve silah aydınlatması için)
    this.visT -= dt;
    if (this.visT <= 0) {
      this.visT = 0.12; const o = new THREE.Vector3(this.pos.x, this.pos.y + this.height - 0.1, this.pos.z);
      let open = 0; const dirs = [[0, 1, 0], [0.5, 0.86, 0], [-0.5, 0.86, 0], [0, 0.86, 0.5], [0, 0.86, -0.5]];
      for (const d of dirs) if (!this.raycast(o, _v2.set(d[0], d[1], d[2]), 30)) open++;
      this._insideT = 1 - open / dirs.length;
      this._sunT = this.raycast(o, g.sky.sunDir, 200) ? 0 : 1;
    }
    this.inside = damp(this.inside, this._insideT ?? 0, 4, dt); this.sunVis = damp(this.sunVis, this._sunT ?? 1, 7, dt);
    this.updateEye(dt);
  }

  footstep(vol) {
    const o = _v.set(this.pos.x, this.pos.y + 0.3, this.pos.z).clone(); const hit = this.raycast(o, _v2.set(0, -1, 0), 0.9);
    let s = 'sand'; if (hit) { const si = this.g.world.collider.surf[hit.face.a]; s = SURF_NAMES[si] || 'sand'; }
    this.lastSurface = s; this.g.audio.footstep(s, vol);
  }

  damage(amount, fromPos, silent) {
    if (!this.alive || this.godMode) return;
    this.health -= amount; this.damageFlash = Math.min(1, this.damageFlash + 0.45 + amount / 60); this.lastDamageT = this.g.time;
    this.viewPunch.impulse((Math.random() - 0.5) * 3); this.recoilPitch.impulse(1.2 + amount * 0.03);
    if (fromPos) { const a = Math.atan2(fromPos.x - this.pos.x, fromPos.z - this.pos.z); this.hitDir.push({ a, t: 1.6 }); }
    if (!silent) this.g.audio.play('hitFlesh', { vol: 0.9 });
    this.g.audio.play('grunt', { vol: 0.7 });
    if (this.health <= 0) { this.health = 0; this.alive = false; this.vy = 0; this.g.onPlayerDeath(); }
  }

  shake(amp, time = 0.5) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = Math.max(this.shakeT, time); }

  // Göz konumu + kamera dönüşü (kafa sallanması, geri tepme, eğilme)
  updateEye(dt) {
    const cam = this.g.camera;
    const target = this.onGround && this.moving ? 1 : 0; this.bobAmt = damp(this.bobAmt, target, 8, dt);
    this.bobPhase += this.speed * dt * (this.sprinting ? 1.5 : 2.0);
    const ads = this.adsT;
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * this.bobAmt * lerp(1, 0.3, ads) * (this.sprinting ? 1.7 : 1);
    const bobX = Math.cos(this.bobPhase) * 0.02 * this.bobAmt * lerp(1, 0.3, ads);
    this.breath += dt;
    const dip = this.landDip.update(dt) * 0.06;
    const rp = this.recoilPitch.update(dt), ry = this.recoilYaw.update(dt), vp = this.viewPunch.update(dt);
    let shx = 0, shy = 0; if (this.shakeT > 0) { this.shakeT -= dt; const a = this.shakeAmp * Math.min(1, this.shakeT * 2.5); shx = (Math.random() - 0.5) * a; shy = (Math.random() - 0.5) * a; if (this.shakeT <= 0) this.shakeAmp = 0; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const eyeH = this.height - 0.13 + bobY + dip - Math.abs(this.lean) * 0.07;
    const lx = this.lean * 0.42 + bobX;
    this.eye.set(this.pos.x + cy * lx, this.pos.y + eyeH, this.pos.z - sy * lx);
    cam.position.copy(this.eye);
    const roll = -this.lean * 0.2 + vp * 0.02 + bobX * 0.25 + (this.alive ? 0 : this.camRoll);
    cam.rotation.set(this.pitch + (rp * 0.012) + this.kickPitch + shy * 0.02, this.yaw + ry * 0.012 + this.kickYaw + shx * 0.02, roll, 'YXZ');
    // geri tepmenin kalıcı kısmı yavaşça merkeze döner
    this.kickPitch = damp(this.kickPitch, 0, 5, dt); this.kickYaw = damp(this.kickYaw, 0, 5, dt);
  }

  getHeadPos(out) { return out.set(this.pos.x, this.pos.y + this.height - 0.15, this.pos.z); }
  getChestPos(out) { return out.set(this.pos.x, this.pos.y + this.height * 0.68, this.pos.z); }
}
