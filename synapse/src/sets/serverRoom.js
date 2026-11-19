// SAHNE 1 — Şehrin altındaki terk edilmiş analog sunucu odası.
// Koyu mavi + neon sarı. Paslı kabin sıraları, yanıp sönen eski LED'ler, sarkan kablolar,
// tavandaki ızgaradan inen soğuk mavi ışık huzmeleri, damlayan borular, su birikintileri, toz.
//
// Kontroller (her karede reset() sonrası çekim tarafından ayarlanır):
//   flicker   0..1  ışıklarda titreme/düşme (CRT açılırken)
//   level     0..1  genel set ışık çarpanı (vars. 1)
//   fogDensity      sis yoğunluğu (vars. 0.055)
// İşaret noktaları (anchors): entrance, path[], crt (masa üstü; ekran +z'ye bakar), atlas, asya, defne, shadowFigure
// Oda: x ∈ [-5,5], z ∈ [-5,5], tavan 3.4 m. Giriş kapısı z=+5'te; ekip -z yönüne yürür.
import * as THREE from 'three';
import { concreteMaterial, rustMetalMaterial, hazardTexture, lightShaft, dust, hangingCable, V, envMaterial, glowMaterial, rng } from './common.js';
import { canvasTexture, normalMapFrom } from '../engine/materials.js';
import { roundedBox } from '../characters/geo.js';
import { fbm1, clamp } from '../engine/util.js';

export function createServerRoom(stage) {
  const group = new THREE.Group(); group.name = 'serverRoom';
  const R = rng(1201);
  const W = 10, D = 10, HT = 3.4;

  // --- zemin, duvarlar, tavan ---
  const floorMat = concreteMaterial(0x3c4048, { repeat: [5, 5], wet: 0.65, seed: 2, stains: 0.7 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  const wallMat = concreteMaterial(0x40464f, { repeat: [4, 1.4], seed: 5, stains: 1.0 });
  const wallDefs = [[0, HT / 2, -D / 2, 0, W], [0, HT / 2, D / 2, Math.PI, W], [-W / 2, HT / 2, 0, Math.PI / 2, D], [W / 2, HT / 2, 0, -Math.PI / 2, D]];
  for (const [x, y, z, ry, w] of wallDefs) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, HT), wallMat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; group.add(m); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), concreteMaterial(0x2a2e34, { repeat: [3, 3], seed: 9 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = HT; group.add(ceil);
  // kolonlar (sarı-siyah tehlike şeritli)
  const hz = envMaterial(0xffffff, { map: hazardTexture([3, 1]), roughness: 0.7 });
  const colMat = concreteMaterial(0x4a4f57, { repeat: [1, 2], seed: 11 });
  for (const [x, z] of [[-3, -2.4], [3, -2.4], [-3, 2.6], [3, 2.6]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, HT, 0.5), colMat); c.position.set(x, HT / 2, z); c.castShadow = c.receiveShadow = true; group.add(c);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.52), hz); band.position.set(x, 0.16, z); group.add(band);
  }

  // --- sunucu kabinleri ---
  const rackMat = rustMetalMaterial(0x3a4048, { rust: 0.55, seed: 4 });
  const frontTex = canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#1b1f25'; g.fillRect(0, 0, w, h);
    const rr = rng(77);
    for (let u = 0; u < 22; u++) {
      const y = 10 + u * 22.5; g.fillStyle = rr() < 0.5 ? '#2a3038' : '#232830'; g.fillRect(8, y, w - 16, 20);
      g.fillStyle = '#0d0f12'; for (let k = 0; k < 18; k++) g.fillRect(70 + k * 9, y + 5, 5, 10);
      g.fillStyle = '#596270'; g.fillRect(12, y + 7, 4, 4); g.fillRect(w - 18, y + 7, 4, 4);
      if (rr() < 0.3) { g.fillStyle = '#c8c0a0'; g.fillRect(22, y + 6, 30, 8); }
      if (rr() < 0.25) { g.fillStyle = 'rgba(120,60,20,0.5)'; g.fillRect(8 + rr() * 200, y, 30 + rr() * 40, 20); }
    }
    g.strokeStyle = '#0a0b0d'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
  const frontMat = envMaterial(0xffffff, { map: frontTex, roughness: 0.55, metalness: 0.5 });
  const rackGeo = roundedBox(0.7, 2.05, 0.95, 0.03, 2);
  const frontGeo = new THREE.PlaneGeometry(0.62, 1.95);
  const racks = [];
  const addRack = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const b = new THREE.Mesh(rackGeo, rackMat); b.position.y = 1.025; b.castShadow = b.receiveShadow = true; g.add(b);
    const f = new THREE.Mesh(frontGeo, frontMat); f.position.set(0, 1.03, 0.476); f.receiveShadow = true; g.add(f);
    group.add(g); racks.push(g); return g;
  };
  // koridor (giriş → merkez)
  for (let i = 0; i < 3; i++) { addRack(-1.55, 4.0 - i * 0.74, Math.PI / 2); addRack(1.55, 4.0 - i * 0.74, -Math.PI / 2); }
  // yan duvarlar
  for (let i = 0; i < 9; i++) { const z = -3.6 + i * 0.74; if (Math.abs(z + 2.4) < 0.4 || Math.abs(z - 2.6) < 0.4) continue; addRack(-4.45, z, Math.PI / 2); addRack(4.45, z, -Math.PI / 2); }
  // arka sıra
  for (let i = 0; i < 9; i++) { const x = -3.0 + i * 0.74; if (Math.abs(x) < 0.5) continue; addRack(x, -4.45, 0); }
  // devrilmiş/aralıklı bir kabin (bozuk ritim)
  { const r = addRack(2.6, -1.2, -Math.PI / 2 + 0.35); r.rotation.z = 0.04; }

  // LED'ler (örneklenmiş)
  const ledPerRack = 14;
  const ledGeo = new THREE.BoxGeometry(0.012, 0.012, 0.004);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, racks.length * ledPerRack);
  const ledInfo = []; const m4 = new THREE.Matrix4(); const tmpQ = new THREE.Quaternion(); const tmpS = new THREE.Vector3(1, 1, 1);
  racks.forEach((rk, ri) => {
    rk.updateMatrixWorld(true);
    for (let k = 0; k < ledPerRack; k++) {
      const local = V(-0.26 + (k % 2) * 0.03, 0.25 + Math.floor(k / 2) * 0.24 + R() * 0.05, 0.48);
      const wp = local.applyMatrix4(rk.matrixWorld);
      rk.getWorldQuaternion(tmpQ);
      m4.compose(wp, tmpQ, tmpS); leds.setMatrixAt(ri * ledPerRack + k, m4);
      const kind = R(); // 0 ölü, yeşil, amber, kırmızı
      ledInfo.push({ col: kind < 0.25 ? null : kind < 0.65 ? new THREE.Color(0x40ff70) : kind < 0.9 ? new THREE.Color(0xffb020) : new THREE.Color(0xff3020), rate: 0.5 + R() * 6, ph: R() * 10, duty: 0.2 + R() * 0.7, steady: R() < 0.35 });
    }
  });
  leds.instanceMatrix.needsUpdate = true; group.add(leds);
  const ledColor = new THREE.Color();

  // --- borular, damlalar ---
  const pipeMat = rustMetalMaterial(0x50565c, { rust: 0.8, seed: 8 });
  const pipes = [[-0.8, 3.1], [0.9, 3.05], [2.2, 3.15]];
  for (const [x, y] of pipes) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, D, 16), pipeMat); p.rotation.x = Math.PI / 2; p.position.set(x, y, 0); p.castShadow = true; group.add(p);
    for (let z = -4; z <= 4; z += 2) { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 16), pipeMat); j.rotation.x = Math.PI / 2; j.position.set(x, y, z); group.add(j); } }
  for (const [x, z] of [[-4.9, -1], [4.9, 1.5], [-4.9, 3.6]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, HT, 12), pipeMat); p.position.set(x + Math.sign(-x) * 0.12, HT / 2, z); group.add(p); }
  // birikintiler
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.85 });
  const puddleSpots = [[0.9, 0.35, 0.55], [-0.8, 2.4, 0.4], [0.3, -1.6, 0.7], [-2.2, 0.8, 0.5], [2.4, 3.3, 0.35]];
  const pg = (r) => { const g = new THREE.CircleGeometry(r, 40); const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)); const k = 1 + 0.25 * Math.sin(a * 3 + r * 10) + 0.12 * Math.sin(a * 7); p.setXY(i, p.getX(i) * k, p.getY(i) * k * 0.8); } return g; };
  for (const [x, z, r] of puddleSpots) { const m = new THREE.Mesh(pg(r), puddleMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); m.receiveShadow = true; group.add(m); }
  // damlalar + halkalar
  const dropMat = new THREE.MeshStandardMaterial({ color: 0x9ab8d8, roughness: 0.05, metalness: 0.1, emissive: 0x203048 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x6a9ad0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const drips = [{ x: 0.9, z: 0.35, y0: 2.98, period: 2.3, ph: 0.4 }, { x: -0.8, z: 2.4, y0: 3.03, period: 3.1, ph: 1.7 }, { x: 0.32, z: -1.6, y0: 3.1, period: 2.7, ph: 0.9 }];
  for (const d of drips) {
    d.drop = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), dropMat); d.drop.scale.set(1, 1.8, 1); group.add(d.drop);
    d.rings = [0, 1].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), ringMat.clone()); r.rotation.x = -Math.PI / 2; r.position.set(d.x, 0.008, d.z); group.add(r); return r; });
    // borudaki asılı damla
    d.hang = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), dropMat); d.hang.position.set(d.x, d.y0, d.z); group.add(d.hang);
  }

  // --- kablolar ---
  const cableMat = envMaterial(0x101215, { roughness: 0.6 });
  const cableMat2 = envMaterial(0x2a1a14, { roughness: 0.6 });
  for (let i = 0; i < 16; i++) {
    const x0 = -4 + R() * 8, z0 = -4 + R() * 8; const x1 = x0 + (R() - 0.5) * 3, z1 = z0 + (R() - 0.5) * 3;
    group.add(hangingCable(V(x0, 3.3, z0), V(x1, 2.9 + R() * 0.4, z1), 0.3 + R() * 0.6, 0.012 + R() * 0.01, i % 3 ? cableMat : cableMat2));
  }
  for (let i = 0; i < 6; i++) { const x = -1.55 + (i % 2) * 3.1; const z = 4 - Math.floor(i / 2) * 0.74; group.add(hangingCable(V(x, 2.05, z), V(x * 0.5, 3.3, z - 0.5), 0.25, 0.015, cableMat)); }

  // --- tavan ızgarası ve mavi huzmeler ---
  const grate = new THREE.Group(); grate.position.set(0.4, HT - 0.01, 1.1);
  const gm = envMaterial(0x15181c, { roughness: 0.7, metalness: 0.6 });
  for (let i = -5; i <= 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.02), gm); b.position.z = i * 0.12; grate.add(b); const c = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 1.3), gm); c.position.x = i * 0.12; grate.add(c); }
  const skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), glowMaterial(0x6ab0ff, 2.2)); skyGlow.rotation.x = Math.PI / 2; skyGlow.position.y = 0.05; grate.add(skyGlow);
  group.add(grate);
  const shafts = [];
  for (let i = 0; i < 2; i++) {
    const s = lightShaft(3.6, 0.5 + i * 0.14, 1.1 + i * 0.3, 0x5a9cff, 0.13 - i * 0.03);
    s.position.set(0.4 + (i - 1) * 0.15, HT, 1.1 + (i - 1) * 0.1); s.rotation.set(0.12, 0, -0.08 + i * 0.05); group.add(s); shafts.push(s);
  }
  // diğer ızgara (arkada, sönük)
  { const s = lightShaft(3.4, 0.3, 0.7, 0x4a80d0, 0.05); s.position.set(-2.5, HT, -2.8); group.add(s); shafts.push(s); }

  // --- neon sarı acil durum şeritleri ---
  const neonMat = glowMaterial(0xffc62a, 3.2);
  const neon1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.2, 10), neonMat); neon1.rotation.x = Math.PI / 2; neon1.position.set(-4.9, 2.55, 0.4); group.add(neon1);
  const neon2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.2, 10), neonMat); neon2.rotation.z = Math.PI / 2; neon2.position.set(0, 2.95, 4.9); group.add(neon2);
  const cage = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glowMaterial(0xffaa20, 2.5)); cage.rotation.x = Math.PI; cage.position.set(0, 3.05, 4.85); group.add(cage);
  // zemin tehlike şeridi (kapı önü)
  const hzFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.2), envMaterial(0xffffff, { map: hazardTexture([6, 1]), roughness: 0.8 })); hzFloor.rotation.x = -Math.PI / 2; hzFloor.position.set(0, 0.006, 4.5); group.add(hzFloor);
  // kapı (aralık, ağır metal)
  const doorMat = rustMetalMaterial(0x4a5258, { rust: 0.7, seed: 12 });
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.15), envMaterial(0x202328, { roughness: 0.6, metalness: 0.5 })); doorFrame.position.set(0, 1.2, 4.98); group.add(doorFrame);
  const doorGap = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.2), glowMaterial(0x0a1220, 1)); doorGap.position.set(0, 1.1, 4.9); doorGap.rotation.y = Math.PI; group.add(doorGap);
  const door = new THREE.Mesh(roundedBox(1.2, 2.18, 0.08, 0.02, 2), doorMat); door.position.set(-0.6, 1.1, 4.9); door.geometry.translate(0.6, 0, 0); door.rotation.y = 1.15; door.castShadow = true; group.add(door);

  // --- CRT için tahta sandık ---
  const wood = canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#6a4a2c'; g.fillRect(0, 0, w, h); const rr = rng(4); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#5a3c22' : '#73512f'; g.fillRect(0, i * h / 6, w, h / 6 - 3); g.fillStyle = '#2a1a0e'; g.fillRect(0, (i + 1) * h / 6 - 3, w, 3); } for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(40,25,10,${0.15 + rr() * 0.2})`; g.beginPath(); const y = rr() * h; g.moveTo(0, y); g.bezierCurveTo(w / 3, y + rr() * 6 - 3, 2 * w / 3, y + rr() * 6 - 3, w, y + rr() * 4 - 2); g.stroke(); } });
  const crateMat = envMaterial(0xffffff, { map: wood, roughness: 0.85 });
  const crate = new THREE.Mesh(roundedBox(0.75, 0.74, 0.6, 0.015, 2), crateMat); crate.position.set(0, 0.37, -0.6); crate.castShadow = crate.receiveShadow = true; group.add(crate);
  const crate2 = new THREE.Mesh(roundedBox(0.5, 0.45, 0.5, 0.015, 2), crateMat); crate2.position.set(-0.55, 0.225, -0.95); crate2.rotation.y = 0.4; crate2.castShadow = crate2.receiveShadow = true; group.add(crate2);
  // yerde dağınık eski kâğıtlar / disketler
  const paperMat = envMaterial(0xc8c2b0, { roughness: 0.9 });
  for (let i = 0; i < 14; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), paperMat); p.rotation.set(-Math.PI / 2, 0, R() * 6); p.position.set(-2 + R() * 4, 0.003 + i * 0.0003, -2 + R() * 4.5); p.receiveShadow = true; group.add(p); }

  // --- toz ---
  const dustPts = dust(700, new THREE.Box3(V(-3, 0.2, -3.5), V(3, 3.2, 4.5)), { color: 0xa8c8ff, size: 0.014, opacity: 0.55 });
  group.add(dustPts);

  // --- ışıklar ---
  const hemi = new THREE.HemisphereLight(0x2a4a78, 0x06080a, 1.0); group.add(hemi);
  const grateSpot = new THREE.SpotLight(0x6aa8ff, 26, 9, 0.55, 0.85, 1.6); grateSpot.position.set(0.4, HT - 0.05, 1.1); grateSpot.target.position.set(0.1, 0, 0.3);
  grateSpot.castShadow = true; grateSpot.shadow.mapSize.set(1024, 1024); grateSpot.shadow.bias = -0.0005; grateSpot.shadow.normalBias = 0.03;
  group.add(grateSpot, grateSpot.target);
  const yellow = new THREE.PointLight(0xffb830, 3.5, 7, 1.6); yellow.position.set(-4.4, 2.5, 0.4); group.add(yellow);
  const yellow2 = { intensity: 0 };
  const backFill = { intensity: 0 };
  const lights = { hemi, grateSpot, yellow, yellow2, backFill };
  const base = { hemi: 1.0, grateSpot: 26, yellow: 3.5, yellow2: 0, backFill: 0 };

  const state = { flicker: 0, level: 1, fogDensity: 0.055 };
  const fog = new THREE.FogExp2(0x0a1424, 0.055);

  const crtTop = V(0, 0.74, -0.6);
  const anchors = {
    entrance: Object.assign(V(0, 0, 4.4), { heading: Math.PI }),
    path: [V(0, 0, 4.4), V(0.05, 0, 3.2), V(-0.05, 0, 2.2), V(0, 0, 1.2), V(0, 0, 0.6)],
    crt: Object.assign(crtTop.clone(), { heading: 0 }),
    atlas: Object.assign(V(0.05, 0, 0.35), { heading: Math.PI }),
    asya: Object.assign(V(-0.75, 0, 0.85), { heading: Math.PI - 0.3 }),
    defne: Object.assign(V(0.78, 0, 0.95), { heading: Math.PI + 0.35 }),
    shadowFigure: Object.assign(V(0.15, 0, 2.4), { heading: Math.PI }),
  };

  function reset() { state.flicker = 0; state.level = 1; state.fogDensity = 0.055; }

  function update(t, ctx) {
    ctx.scene.fog = fog; fog.density = state.fogDensity;
    ctx.scene.background = new THREE.Color(0x070b12);
    
    // ışık titremesi
    const fl = state.flicker > 0 ? 1 - state.flicker * (0.5 + 0.5 * Math.max(0, fbm1(t * 22))) : 1;
    const L = state.level * fl;
    for (const k in lights) lights[k].intensity = base[k] * L;
    neonMat.color.setRGB(1, 0.776, 0.165).multiplyScalar(3.2 * (0.85 + 0.15 * Math.sin(t * 50)) * L);
    // LED'ler
    racks.forEach((rk, ri) => {
      for (let k = 0; k < ledPerRack; k++) {
        const info = ledInfo[ri * ledPerRack + k];
        if (!info.col) { ledColor.setRGB(0.02, 0.02, 0.02); }
        else {
          const on = info.steady ? 1 : (((t * info.rate + info.ph) % 1) < info.duty ? 1 : 0.08);
          ledColor.copy(info.col).multiplyScalar(on * 3 * (0.6 + 0.4 * L));
        }
        leds.setColorAt(ri * ledPerRack + k, ledColor);
      }
    });
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
    // damlalar
    for (const d of drips) {
      const lt = ((t + d.ph) % d.period); const fallT = Math.sqrt((2 * (d.y0 - 0.01)) / 9.81);
      const grow = lt < d.period - fallT ? lt / (d.period - fallT) : 1;
      d.hang.scale.setScalar(0.5 + grow * 0.6);
      const ft = lt - (d.period - fallT);
      if (ft > 0) { d.drop.visible = true; d.drop.position.set(d.x, d.y0 - 0.5 * 9.81 * ft * ft, d.z); }
      else d.drop.visible = false;
      // halkalar: son iki çarpmadan
      d.rings.forEach((r, i) => {
        const since = (t + d.ph) - (Math.floor((t + d.ph) / d.period) - i) * d.period;
        const age = since - 0; // çarpmadan bu yana (döngü sonunda çarpma)
        const a2 = ((t + d.ph) % d.period) + i * d.period; // önceki döngüler
        const s = a2 < 1.4 ? a2 : 9;
        void age;
        if (s < 1.4) { r.visible = true; const rad = 0.02 + s * 0.22; r.scale.setScalar(rad); r.material.opacity = 0.45 * (1 - s / 1.4); }
        else r.visible = false;
      });
    }
    for (const s of shafts) s.userData.setTime(t);
    dustPts.userData.update(t);
  }

  const previewCams = [
    { pos: [3.2, 1.8, -3.6], target: [0, 1.0, 2.0], fov: 42 },
    { pos: [0, 0.55, 4.6], target: [0, 1.2, 0], fov: 38 },
    { pos: [0.5, 1.6, 1.5], target: [0, 0.95, -0.6], fov: 35 },
    { pos: [0, 1.15, -1.5], target: [0, 1.3, 1.5], fov: 38 },
    { pos: [2.6, 3.1, 3.2], target: [0, 0.4, 0], fov: 45 },
    { pos: [1.4, 0.35, 1.0], target: [0.9, 0.1, 0.35], fov: 35 },
  ];

  return { group, update, reset, anchors, previewCams, state, lights, racks };
}
