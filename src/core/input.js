// Girdi: klavye + fare (imleç kilidi, yedek serbest mod) + dokunmatik (sanal çubuk, bakış alanı, düğmeler)
import { clamp } from './utils.js';

const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', KeyD: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyC: 'crouch', ControlLeft: 'crouchHold',
  KeyR: 'reload', KeyF: 'interact', KeyG: 'grenade', KeyT: 'flash', KeyB: 'firemode', KeyN: 'nvg', KeyH: 'heal',
  KeyQ: 'leanL', KeyE: 'leanR', Digit1: 'slot1', Digit2: 'slot2', KeyX: 'swap', KeyV: 'melee', Tab: 'objectives',
  Escape: 'pause', KeyP: 'pause', KeyL: 'laser', ArrowLeft: 'turnL', ArrowRight: 'turnR',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set(); this.pressed = new Set(); this.released = new Set();
    this.lookX = 0; this.lookY = 0; this.moveX = 0; this.moveY = 0;
    this.locked = false; this.freeLook = false; this.lockFails = 0; this.enabled = false;
    this.touch = false; this.touchMove = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }; this.touchLook = { id: -1, x: 0, y: 0 };
    this.onLockChange = null; this.wheel = 0;

    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code]; if (!a) return;
      if (this.enabled || a === 'pause') { if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); }
      if (!e.repeat) { this.pressed.add(a); } this.down.add(a);
    });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) { this.down.delete(a); this.released.add(a); } });
    addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.freeLook) { this.requestLock(); return; }
      const a = e.button === 0 ? 'fire' : e.button === 2 ? 'ads' : e.button === 1 ? 'melee' : null;
      if (a) { this.down.add(a); this.pressed.add(a); } e.preventDefault();
    });
    addEventListener('mouseup', (e) => { const a = e.button === 0 ? 'fire' : e.button === 2 ? 'ads' : e.button === 1 ? 'melee' : null; if (a) { this.down.delete(a); this.released.add(a); } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.freeLook) { this.lookX += e.movementX || 0; this.lookY += e.movementY || 0; }
    });
    addEventListener('wheel', (e) => { if (this.enabled) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFails = 0;
      if (!this.locked) this.down.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this._lockFailed());
  }

  // Kilit birkaç kez üst üste reddedilirse (ör. gömülü görünüm) kilitsiz serbest bakışa geç
  _lockFailed() { this.lockFails++; if (this.lockFails >= 3 || !this.canvas.requestPointerLock) { this.freeLook = true; if (this.onLockChange) this.onLockChange(true); } }

  requestLock() {
    if (this.touch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock ? this.canvas.requestPointerLock() : null;
      if (!this.canvas.requestPointerLock) this._lockFailed();
      else if (p && p.catch) p.catch(() => this._lockFailed());
    } catch { this._lockFailed(); }
  }
  exitLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* yoksay */ } }

  // Dokunmatik denetimleri bağla (HUD içindeki #touch katmanı)
  bindTouch(root) {
    this.touch = true;
    const stick = root.querySelector('#stick'), knob = root.querySelector('#stick-knob');
    const setKnob = () => { const m = this.touchMove; if (m.id < 0) { stick.hidden = true; return; } stick.hidden = false; stick.style.left = m.ox + 'px'; stick.style.top = m.oy + 'px'; knob.style.transform = `translate(${m.x * 46}px, ${m.y * 46}px)`; };
    const area = root.querySelector('#touch-area');
    const start = (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && this.touchMove.id < 0) { this.touchMove.id = t.identifier; this.touchMove.ox = t.clientX; this.touchMove.oy = t.clientY; this.touchMove.x = 0; this.touchMove.y = 0; }
        else if (this.touchLook.id < 0) { this.touchLook.id = t.identifier; this.touchLook.x = t.clientX; this.touchLook.y = t.clientY; }
      }
      setKnob(); e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchMove.id) { const m = this.touchMove; let dx = (t.clientX - m.ox) / 56, dy = (t.clientY - m.oy) / 56; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } m.x = dx; m.y = dy; }
        else if (t.identifier === this.touchLook.id) { this.lookX += (t.clientX - this.touchLook.x) * 2.4; this.lookY += (t.clientY - this.touchLook.y) * 2.4; this.touchLook.x = t.clientX; this.touchLook.y = t.clientY; }
      }
      setKnob(); e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchMove.id) { this.touchMove.id = -1; this.touchMove.x = this.touchMove.y = 0; }
        if (t.identifier === this.touchLook.id) this.touchLook.id = -1;
      }
      setKnob(); e.preventDefault();
    };
    area.addEventListener('touchstart', start, { passive: false }); area.addEventListener('touchmove', move, { passive: false });
    area.addEventListener('touchend', end, { passive: false }); area.addEventListener('touchcancel', end, { passive: false });
    // düğmeler: basılı tutma ya da aç/kapa; ateş düğmesi sürüklenince nişan da çevirir
    root.querySelectorAll('[data-act]').forEach((b) => {
      const act = b.dataset.act, toggle = b.dataset.toggle != null; let tid = -1, lx = 0, ly = 0;
      b.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0]; tid = t.identifier; lx = t.clientX; ly = t.clientY;
        if (toggle) { if (this.down.has(act)) { this.down.delete(act); b.classList.remove('on'); } else { this.down.add(act); this.pressed.add(act); b.classList.add('on'); } }
        else { this.down.add(act); this.pressed.add(act); b.classList.add('on'); }
        e.preventDefault(); e.stopPropagation();
      }, { passive: false });
      b.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === tid) { this.lookX += (t.clientX - lx) * 2.4; this.lookY += (t.clientY - ly) * 2.4; lx = t.clientX; ly = t.clientY; } e.preventDefault(); e.stopPropagation(); }, { passive: false });
      const up = (e) => { if (!toggle) { this.down.delete(act); this.released.add(act); b.classList.remove('on'); } tid = -1; e.preventDefault(); e.stopPropagation(); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    });
  }

  clearToggle(act, root) { this.down.delete(act); const b = root && root.querySelector(`[data-act="${act}"]`); if (b) b.classList.remove('on'); }

  // Kare başında: hareket eksenlerini hesapla
  poll() {
    let mx = 0, my = 0;
    if (this.down.has('fwd')) my += 1; if (this.down.has('back')) my -= 1; if (this.down.has('right')) mx += 1; if (this.down.has('left')) mx -= 1;
    if (this.touchMove.id >= 0) { mx = this.touchMove.x; my = -this.touchMove.y; }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    this.moveX = mx; this.moveY = my;
    this.touchSprint = this.touchMove.id >= 0 && Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92 && this.touchMove.y < -0.7;
    if (this.down.has('turnL')) this.lookX -= 9; if (this.down.has('turnR')) this.lookX += 9;
  }
  is(a) { return this.enabled && this.down.has(a); }
  hit(a) { return this.enabled && this.pressed.has(a); }
  hitAny(a) { return this.pressed.has(a); }
  endFrame() { this.pressed.clear(); this.released.clear(); this.lookX = 0; this.lookY = 0; this.wheel = 0; }
  reset() { this.down.clear(); this.pressed.clear(); this.lookX = this.lookY = 0; }
  look(sens) { return { x: clamp(this.lookX, -400, 400) * sens, y: clamp(this.lookY, -400, 400) * sens }; }
}
