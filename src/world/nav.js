// Yürüme ızgarası + A* yol bulma (düşman ve rehine hareketi için)
export class NavGrid {
  constructor(minX, minZ, sizeX, sizeZ, cell = 0.5) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.w = Math.ceil(sizeX / cell); this.h = Math.ceil(sizeZ / cell);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n); this.f = new Float32Array(n); this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n); this.tick = 1;
    this.heap = [];
  }
  cx(x) { return Math.floor((x - this.minX) / this.cell); }
  cz(z) { return Math.floor((z - this.minZ) / this.cell); }
  wx(cx) { return this.minX + (cx + 0.5) * this.cell; }
  wz(cz) { return this.minZ + (cz + 0.5) * this.cell; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }
  isBlockedCell(cx, cz) { return !this.inside(cx, cz) || this.blocked[cz * this.w + cx] === 1; }
  walkable(x, z) { return !this.isBlockedCell(this.cx(x), this.cz(z)); }

  // Döndürülmüş dikdörtgeni (ajan yarıçapı kadar şişirerek) engelli işaretler
  blockOBB(x, z, sx, sz, ry = 0, pad = 0.32) {
    const hx = sx / 2 + pad, hz = sz / 2 + pad; const c = Math.cos(ry), s = Math.sin(ry);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const x0 = Math.max(0, this.cx(x - ex)), x1 = Math.min(this.w - 1, this.cx(x + ex));
    const z0 = Math.max(0, this.cz(z - ez)), z1 = Math.min(this.h - 1, this.cz(z + ez));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const dx = this.wx(i) - x, dz = this.wz(j) - z;
      // dünya -> yerel (Y ekseninde -ry dönüş)
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) this.blocked[j * this.w + i] = 1;
    }
  }
  unblockRect(minX, minZ, maxX, maxZ) {
    for (let j = Math.max(0, this.cz(minZ)); j <= Math.min(this.h - 1, this.cz(maxZ)); j++) for (let i = Math.max(0, this.cx(minX)); i <= Math.min(this.w - 1, this.cx(maxX)); i++) this.blocked[j * this.w + i] = 0;
  }

  nearestWalkable(x, z, maxR = 12) {
    const cx = this.cx(x), cz = this.cz(z);
    if (!this.isBlockedCell(cx, cz)) return { x, z };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (!this.isBlockedCell(cx + i, cz + j)) { const d = i * i + j * j; if (d < bd) { bd = d; best = { x: this.wx(cx + i), z: this.wz(cz + j) }; } }
      }
      if (best) return best;
    }
    return null;
  }

  // Izgara üzerinde düz hat açık mı? (ajan gövdesi için)
  lineClear(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az; const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / (this.cell * 0.5));
    for (let i = 0; i <= steps; i++) { const t = steps ? i / steps : 0; if (!this.walkable(ax + dx * t, az + dz * t)) return false; }
    return true;
  }

  _push(i) { const h = this.heap, f = this.f; h.push(i); let c = h.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[h[p]] <= f[h[c]]) break; const t = h[p]; h[p] = h[c]; h[c] = t; c = p; } }
  _pop() {
    const h = this.heap, f = this.f; const top = h[0]; const last = h.pop();
    if (h.length) { h[0] = last; let p = 0; for (;;) { const l = p * 2 + 1, r = l + 1; let m = p; if (l < h.length && f[h[l]] < f[h[m]]) m = l; if (r < h.length && f[h[r]] < f[h[m]]) m = r; if (m === p) break; const t = h[p]; h[p] = h[m]; h[m] = t; p = m; } }
    return top;
  }

  // A* (8 yön, köşe kesmeden). Dönüş: [{x,z}, ...] ya da null
  findPath(ax, az, bx, bz, maxIter = 9000) {
    const a = this.nearestWalkable(ax, az), b = this.nearestWalkable(bx, bz);
    if (!a || !b) return null;
    const w = this.w; const sx = this.cx(a.x), sz = this.cz(a.z), ex = this.cx(b.x), ez = this.cz(b.z);
    const start = sz * w + sx, goal = ez * w + ex;
    if (start === goal) return [{ x: b.x, z: b.z }];
    const tick = ++this.tick; const { g, f, from, stamp, closed, blocked } = this;
    this.heap.length = 0;
    g[start] = 0; f[start] = 0; from[start] = -1; stamp[start] = tick; this._push(start);
    let iter = 0, found = false;
    while (this.heap.length && iter++ < maxIter) {
      const cur = this._pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur] === tick) continue; closed[cur] = tick;
      const cx = cur % w, cz = (cur / w) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const ni = nz * w + nx;
        if (blocked[ni] || closed[ni] === tick) continue;
        if (dx && dz && (blocked[cz * w + nx] || blocked[nz * w + cx])) continue;
        const ng = g[cur] + (dx && dz ? 1.41421 : 1);
        if (stamp[ni] !== tick || ng < g[ni]) {
          g[ni] = ng; stamp[ni] = tick; from[ni] = cur;
          const hx = Math.abs(nx - ex), hz = Math.abs(nz - ez);
          f[ni] = ng + (hx + hz + (1.41421 - 2) * Math.min(hx, hz)) * 1.02;
          this._push(ni);
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let c = goal; c !== -1; c = from[c]) raw.push({ x: this.wx(c % w), z: this.wz((c / w) | 0) });
    raw.reverse();
    // ip çekme: görüş hattı olan ara noktaları at
    const out = []; let i = 0;
    while (i < raw.length - 1) {
      let j = Math.min(raw.length - 1, i + 40);
      while (j > i + 1 && !this.lineClear(raw[i].x, raw[i].z, raw[j].x, raw[j].z)) j--;
      out.push(raw[j]); i = j;
    }
    if (!out.length) out.push(raw[raw.length - 1]);
    return out;
  }

  randomNear(x, z, rMin, rMax, tries = 14) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * 6.2832, r = rMin + Math.random() * (rMax - rMin);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (this.walkable(px, pz)) return { x: px, z: pz };
    }
    return null;
  }
}
