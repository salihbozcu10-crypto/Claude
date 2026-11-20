// SAHNE 2-4 — Ekibin gizli üssü (eski bir bodrum atölyesi).
// Ekran duvarı, sökülmüş anakartlar, enerji içeceği kutuları, ana terminal, büyük masa,
// ağır dış kapı (drone darbeleri), ana şalter, kırmızı alarm ışıkları, karanlık yansıtıcı duvar ekranı.
//
// Kontroller (reset() sonrası çekim ayarlar):
//   mode: 'normal' | 'alarm' | 'blackout' | 'after'   (ışık düzeni)
//   alarm 0..1 (kırmızı döner ışık + yıkama), power 0..1 (ekranlar/lamba), afterDim 0..1
//   countdown: saniye | null  → ana ekran ve yan ekranlarda büyük sayaç; countdownFrozen: bool; countdownColor
//   screens: 'code' | 'countdown' | 'glitch' | 'off'
//   doorBangs: [t1, t2, ...] (küresel sn) → kapı sarsılır, kıvılcım, toz, kenarlardan ışık
//   breaker 0..1 (şalter kolu: 0 yukarı/açık, 1 aşağı/kapalı)
//   tableImpactAt: küresel sn | null → masadaki kutular zıplar
//   cableAttached: bool (terminal kablosu yerinde mi)
//   wallMirror 0..1 (karanlık duvar ekranında gerçek yansıma; yalnızca son çekimlerde)
//   droneLight 0..1 (kapının üstündeki yarıktan süpüren kırmızı tarayıcı)
// İşaret noktaları: terminalSeat, terminalStand, cablePort, table, tableSlam, door, breaker, wallScreen,
//   floorCenter, photoSpot, atlas, asya, defne
// Oda: x ∈ [-5,5], z ∈ [-4,4], tavan 3.2. Arka duvar z=-4 (ekranlar + terminal), sağ duvar x=+5 (kapı),
//   sol duvar x=-5 (şalter, not duvarı). Kamera tarafı z=+4 açık.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { concreteMaterial, rustMetalMaterial, hazardTexture, dust, hangingCable, screenCanvas, V, envMaterial, glowMaterial, rng } from './common.js';
import { canvasTexture } from '../engine/materials.js';
import { roundedBox } from '../characters/geo.js';
import { fbm1, clamp, smoothstep, noise1 } from '../engine/util.js';

export function createBase(stage) {
  const group = new THREE.Group(); group.name = 'base';
  const R = rng(4401);
  const W = 10, D = 8, HT = 3.2;

  // --- oda ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), concreteMaterial(0x34383e, { repeat: [5, 4], wet: 0.25, seed: 21, stains: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  const brick = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#2a2420'; g.fillRect(0, 0, w, h); const rr = rng(8);
    for (let y = 0; y < 8; y++) for (let x = -1; x < 9; x++) {
      const ox = (y % 2) * 32; const c = 70 + rr() * 40;
      g.fillStyle = `rgb(${c * 0.95 | 0},${c * 0.62 | 0},${c * 0.5 | 0})`; g.fillRect(x * 64 + ox + 2, y * 32 + 2, 60, 28);
      g.fillStyle = `rgba(0,0,0,${rr() * 0.3})`; g.fillRect(x * 64 + ox + 2, y * 32 + 2, 60, 28);
    }
  }, { repeat: [4, 3] });
  const brickMat = envMaterial(0xd8d8d8, { map: brick, roughness: 0.9 });
  const wallDefs = [[0, HT / 2, -D / 2, 0, W], [-W / 2, HT / 2, 0, Math.PI / 2, D], [W / 2, HT / 2, 0, -Math.PI / 2, D], [0, HT / 2, D / 2, Math.PI, W]];
  for (const [x, y, z, ry, w] of wallDefs) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, HT), brickMat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; group.add(m); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), concreteMaterial(0x24272c, { repeat: [3, 3], seed: 23 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = HT; group.add(ceil);
  const pipeMat = rustMetalMaterial(0x4a5056, { rust: 0.6, seed: 31 });
  for (const z of [-3.6, -1.5, 1.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W, 12), pipeMat); p.rotation.z = Math.PI / 2; p.position.set(0, HT - 0.18, z); group.add(p); }

  // --- ekran duvarı (arka duvar) ---
  const screenDefs = [];
  // ana terminal monitörü + yan monitörler (masada) ve duvara asılı ekranlar
  const wallScreens = [
    [-3.7, 2.15, 0.9, 0.55], [-2.75, 2.25, 0.8, 0.5], [-1.85, 2.15, 0.8, 0.5], [-3.7, 1.55, 0.9, 0.5], [-0.95, 2.25, 0.75, 0.48],
    [-2.75, 1.65, 0.8, 0.45], [3.3, 2.1, 1.0, 0.6], [3.9, 1.45, 0.6, 0.4],
  ];
  const screenFrame = envMaterial(0x14161a, { roughness: 0.5, metalness: 0.4 });
  const SC = [];
  const mkScreen = (x, y, z, w, h, ry = 0, kind = 'code', res = 256) => {
    const sc = screenCanvas(res, Math.round(res * h / w));
    const fr = new THREE.Mesh(roundedBox(w + 0.06, h + 0.06, 0.05, 0.012, 2), screenFrame); fr.position.set(x, y, z); fr.rotation.y = ry; fr.castShadow = true; group.add(fr);
    const mat = new THREE.MeshBasicMaterial({ map: sc.tex, toneMapped: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(0, 0, 0.027); fr.add(m);
    const s = { sc, mat, kind, seed: SC.length * 13 + 5, w, h, mesh: m, frame: fr };
    SC.push(s); return s;
  };
  wallScreens.forEach(([x, y, w, h], i) => mkScreen(x, y, -D / 2 + 0.06, w, h, 0, ['code', 'map', 'cam', 'wave', 'code', 'map', 'cam', 'wave'][i]));
  // terminal masası (sol-arka)
  const deskMat = envMaterial(0x2c2620, { roughness: 0.6 });
  const metalLeg = envMaterial(0x1a1c20, { roughness: 0.5, metalness: 0.7 });
  const desk = new THREE.Group(); desk.position.set(-2.3, 0, -3.35);
  const top = new THREE.Mesh(roundedBox(2.4, 0.05, 0.8, 0.01, 2), deskMat); top.position.y = 0.76; top.castShadow = top.receiveShadow = true; desk.add(top);
  for (const [x, z] of [[-1.15, -0.35], [1.15, -0.35], [-1.15, 0.35], [1.15, 0.35]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.76, 0.05), metalLeg); l.position.set(x, 0.38, z); desk.add(l); }
  group.add(desk);
  const mainScreen = mkScreen(-2.3, 1.18, -3.55, 1.0, 0.58, 0, 'main', 512);
  const sideL = mkScreen(-3.25, 1.1, -3.45, 0.62, 0.38, 0.35, 'code');
  const sideR = mkScreen(-1.35, 1.1, -3.45, 0.62, 0.38, -0.35, 'wave');
  // klavye
  const kbTex = canvasTexture(256, 96, (g, w, h) => { g.fillStyle = '#121418'; g.fillRect(0, 0, w, h); for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) { g.fillStyle = '#2a2e36'; g.fillRect(6 + c * 16.4, 6 + r * 17, 14, 14); } });
  const kbMat = envMaterial(0xffffff, { map: kbTex, roughness: 0.6 });
  const kbGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.17), glowMaterial(0x30c8ff, 0.5, { transparent: true, opacity: 0.4 })); kbGlow.rotation.x = -Math.PI / 2; kbGlow.position.set(-2.3, 0.787, -3.0); group.add(kbGlow);
  const kb = new THREE.Mesh(roundedBox(0.48, 0.022, 0.16, 0.005, 2), kbMat); kb.position.set(-2.3, 0.796, -3.0); group.add(kb);
  // terminal kasası + kablo portu
  const tower = new THREE.Mesh(roundedBox(0.24, 0.5, 0.5, 0.02, 2), envMaterial(0x1c1f24, { roughness: 0.45, metalness: 0.5 })); tower.position.set(-1.0, 0.25, -3.35); tower.castShadow = true; group.add(tower);
  const towerLed = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.3), glowMaterial(0x30d0ff, 2.5)); towerLed.position.set(-0.877, 0.3, -3.2); towerLed.rotation.y = Math.PI / 2; group.add(towerLed);
  const cablePort = V(-1.32, 0.83, -3.2);
  const portBox = new THREE.Mesh(roundedBox(0.12, 0.06, 0.1, 0.01, 2), envMaterial(0x1c1f24, { roughness: 0.4, metalness: 0.6 })); portBox.position.set(cablePort.x, 0.815, cablePort.z); group.add(portBox);
  const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 20), envMaterial(0x8a9098, { metalness: 0.9, roughness: 0.3 })); portRing.position.copy(cablePort).add(V(0, 0.017, 0.05)); group.add(portRing);
  const portGlow = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 20), glowMaterial(0x30d8ff, 2.5)); portGlow.position.copy(portRing.position).add(V(0, 0, 0.003)); group.add(portGlow);
  // takılı kalın veri kablosu (terminalden duvara)
  const cableMat = envMaterial(0x0c0d10, { roughness: 0.5 });
  const attachedCable = new THREE.Group();
  attachedCable.add(hangingCable(cablePort.clone().add(V(0, 0.017, 0.12)), V(-1.0, 0.45, -3.3), 0.05, 0.016, cableMat));
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 14), envMaterial(0x9aa0a8, { metalness: 0.9, roughness: 0.3 })); plug.rotation.x = Math.PI / 2; plug.position.copy(cablePort).add(V(0, 0.017, 0.085)); attachedCable.add(plug);
  group.add(attachedCable);
  // sandalye
  const chair = new THREE.Group(); chair.position.set(-2.3, 0, -2.55);
  const seat = new THREE.Mesh(roundedBox(0.5, 0.08, 0.48, 0.03, 2), envMaterial(0x22252b, { roughness: 0.7 })); seat.position.y = 0.48; chair.add(seat);
  const back = new THREE.Mesh(roundedBox(0.48, 0.55, 0.07, 0.03, 2), envMaterial(0x22252b, { roughness: 0.7 })); back.position.set(0, 0.8, 0.24); back.rotation.x = 0.12; chair.add(back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), metalLeg); pole.position.y = 0.23; chair.add(pole);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.04), metalLeg); l.position.set(Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15); l.rotation.y = -a; chair.add(l); }
  chair.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(chair);

  // --- büyük masa (orta) ---
  const table = new THREE.Group(); table.position.set(0.6, 0, 0.3);
  const ttop = new THREE.Mesh(roundedBox(2.0, 0.07, 1.1, 0.015, 2), envMaterial(0x3a2e24, { roughness: 0.55 })); ttop.position.y = 0.78; ttop.castShadow = ttop.receiveShadow = true; table.add(ttop);
  for (const [x, z] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), metalLeg); l.position.set(x, 0.39, z); table.add(l); }
  group.add(table);
  // masadaki eşyalar: anakartlar, kutular, laptop
  const pcbTex = canvasTexture(256, 192, (g, w, h) => {
    g.fillStyle = '#0f4a2c'; g.fillRect(0, 0, w, h); const rr = rng(5);
    g.strokeStyle = '#c9a54a'; g.lineWidth = 1.2; for (let i = 0; i < 70; i++) { g.beginPath(); let x = rr() * w, y = rr() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { if (rr() < 0.5) x += (rr() - 0.5) * 80; else y += (rr() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 14; i++) { g.fillStyle = '#111'; g.fillRect(rr() * w, rr() * h, 20 + rr() * 30, 14 + rr() * 20); }
  });
  const pcbMat = envMaterial(0xffffff, { map: pcbTex, roughness: 0.5, metalness: 0.2 });
  const pcbs = [];
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.24), pcbMat); p.position.set(-0.55 + i * 0.32, 0.822, -0.25 + (i % 2) * 0.3); p.rotation.y = R() * 0.6 - 0.3; table.add(p); pcbs.push(p); }
  const canCols = [0x1ad06a, 0xff2a6a, 0x2a8aff, 0xffc020, 0xa040ff];
  const canLabel = (c) => canvasTexture(128, 64, (g, w, h) => { const cc = new THREE.Color(c).convertLinearToSRGB(); g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h); g.fillStyle = `rgb(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0})`; g.fillRect(0, 18, w, 26); g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.fillText('VOLT', 34, 38); });
  const canMats = canCols.map((c) => new THREE.MeshStandardMaterial({ map: canLabel(c), roughness: 0.25, metalness: 0.75 }));
  const cans = [];
  const tableCans = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.125, 18), canMats[i % canMats.length]);
    c.position.set(-0.8 + R() * 1.6, 0.815 + 0.0625, -0.4 + R() * 0.8); c.rotation.y = R() * 6; c.castShadow = true; table.add(c); tableCans.push({ m: c, base: c.position.clone(), rot: c.rotation.clone(), k: 0.6 + R() * 0.8 });
  }
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.125, 14), canMats[i % canMats.length]);
    const onDesk = i < 5;
    if (onDesk) c.position.set(-3.3 + i * 0.5, 0.785 + 0.0625, -3.1 + R() * 0.15);
    else { c.position.set(-4 + R() * 8.5, 0.033, -3 + R() * 6); c.rotation.set(Math.PI / 2, 0, R() * 6); if (Math.abs(c.position.x - 0.6) < 1.2 && Math.abs(c.position.z - 0.3) < 0.8) c.position.x += 2; }
    c.castShadow = true; group.add(c); cans.push(c);
  }
  const laptop = new THREE.Group(); laptop.position.set(0.95, 0.815, 0.15); laptop.rotation.y = -0.5;
  const lb = new THREE.Mesh(roundedBox(0.34, 0.018, 0.24, 0.006, 2), envMaterial(0x2a2c30, { metalness: 0.6, roughness: 0.35 })); laptop.add(lb);
  const lsc = mkScreen(0, 0, 0, 0.32, 0.2, 0, 'code');
  table.add(laptop); laptop.add(lsc.frame); lsc.frame.position.set(0, 0.12, -0.12); lsc.frame.rotation.x = -0.25;

  // --- sol duvar: ana şalter + not duvarı + raf ---
  const brk = new THREE.Group(); brk.position.set(-4.92, 1.35, -1.4); brk.rotation.y = Math.PI / 2;
  const box = new THREE.Mesh(roundedBox(0.55, 0.75, 0.2, 0.02, 2), rustMetalMaterial(0x6a6e3a, { rust: 0.5, seed: 41 })); box.castShadow = true; brk.add(box);
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.09), envMaterial(0xffffff, { map: hazardTexture([3, 1]), roughness: 0.7 })); warn.position.set(0, 0.42, 0.101); brk.add(warn);
  const lbl = canvasTexture(256, 64, (g, w, h) => { g.fillStyle = '#d8d0b0'; g.fillRect(0, 0, w, h); g.fillStyle = '#b01010'; g.font = 'bold 30px sans-serif'; g.fillText('ANA ŞALTER', 30, 44); });
  const lblM = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), envMaterial(0xffffff, { map: lbl, roughness: 0.8 })); lblM.position.set(0, 0.24, 0.101); brk.add(lblM);
  const lever = new THREE.Group(); lever.position.set(0, -0.05, 0.12); brk.add(lever);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), envMaterial(0x8a8e94, { metalness: 0.9, roughness: 0.3 })); arm.position.y = 0.16; lever.add(arm);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 14), envMaterial(0xc01818, { roughness: 0.4, metalness: 0.1 })); handle.rotation.z = Math.PI / 2; handle.position.y = 0.33; lever.add(handle);
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16), envMaterial(0x3a3e44, { metalness: 0.8, roughness: 0.4 })); pivot.rotation.z = Math.PI / 2; lever.add(pivot);
  const brkLamp = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), glowMaterial(0x30ff60, 2)); brkLamp.position.set(0.19, 0.28, 0.101); brk.add(brkLamp);
  group.add(brk);
  // not duvarı (kırmızı iplik)
  const notes = canvasTexture(512, 320, (g, w, h) => {
    g.fillStyle = '#5a4630'; g.fillRect(0, 0, w, h); const rr = rng(9); const pins = [];
    for (let i = 0; i < 22; i++) { const x = 20 + rr() * (w - 80), y = 20 + rr() * (h - 70); g.save(); g.translate(x, y); g.rotate((rr() - 0.5) * 0.3); g.fillStyle = rr() < 0.5 ? '#f2e27a' : rr() < 0.5 ? '#f5f0e0' : '#8ad0f0'; g.fillRect(0, 0, 50, 42); g.fillStyle = '#333'; for (let k = 0; k < 4; k++) g.fillRect(6, 8 + k * 8, 20 + rr() * 18, 2); g.restore(); pins.push([x + 25, y + 4]); }
    g.strokeStyle = '#d01818'; g.lineWidth = 2; g.beginPath(); pins.slice(0, 12).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    pins.forEach(([x, y]) => { g.fillStyle = '#e02020'; g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.fill(); });
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), envMaterial(0xffffff, { map: notes, roughness: 0.9 })); board.position.set(-4.97, 1.75, 1.0); board.rotation.y = Math.PI / 2; group.add(board);
  // raf
  const shelf = new THREE.Group(); shelf.position.set(-4.75, 0, 2.9);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 1.2), metalLeg); s.position.y = 0.3 + i * 0.5; shelf.add(s); for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(roundedBox(0.3, 0.2 + R() * 0.15, 0.3, 0.01, 1), envMaterial([0x3a3e44, 0x5a4a30, 0x2a3a4a][k], { roughness: 0.7 })); b.position.set(0, 0.32 + i * 0.5 + 0.12, -0.4 + k * 0.4); shelf.add(b); } }
  group.add(shelf);
  // kanepe (ön sol)
  const couch = new THREE.Group(); couch.position.set(-3.2, 0, 2.7); couch.rotation.y = 0.5;
  const cm = envMaterial(0x4a2a30, { roughness: 0.85 });
  const cb = new THREE.Mesh(roundedBox(1.8, 0.4, 0.8, 0.12, 3), cm); cb.position.y = 0.3; couch.add(cb);
  const cbk = new THREE.Mesh(roundedBox(1.8, 0.5, 0.2, 0.1, 3), cm); cbk.position.set(0, 0.65, -0.32); couch.add(cbk);
  for (const x of [-0.9, 0.9]) { const a = new THREE.Mesh(roundedBox(0.2, 0.55, 0.8, 0.08, 3), cm); a.position.set(x, 0.42, 0); couch.add(a); }
  group.add(couch);

  // --- sağ duvar: ağır dış kapı ---
  const doorG = new THREE.Group(); doorG.position.set(4.93, 0, 0.5); doorG.rotation.y = -Math.PI / 2;
  const frameM = rustMetalMaterial(0x3a3f45, { rust: 0.5, seed: 51 });
  const dFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.5, 0.12), frameM); dFrame.position.y = 1.25; doorG.add(dFrame);
  const leakMat = glowMaterial(0xff5030, 0.0, { transparent: true });
  const leak = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 2.26), leakMat); leak.position.set(0, 1.14, 0.065); doorG.add(leak);
  const doorPanel = new THREE.Group(); doorPanel.position.set(0, 1.13, 0.1); doorG.add(doorPanel);
  const dp = new THREE.Mesh(roundedBox(1.32, 2.2, 0.12, 0.02, 2), rustMetalMaterial(0x50565e, { rust: 0.45, seed: 52 })); dp.castShadow = true; doorPanel.add(dp);
  for (const y of [-0.7, 0, 0.7]) { const bar = new THREE.Mesh(roundedBox(1.25, 0.12, 0.05, 0.015, 2), frameM); bar.position.set(0, y, 0.08); doorPanel.add(bar); }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 10, 28), envMaterial(0x8a8e94, { metalness: 0.85, roughness: 0.35 })); wheel.position.set(0.3, 0, 0.11); doorPanel.add(wheel);
  const dents = [];
  for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), rustMetalMaterial(0x40464c, { rust: 0.6, seed: 60 + i })); d.scale.set(1, 1, 0.12); d.position.set(-0.3 + i * 0.25, 0.3 - i * 0.35, 0.05); d.visible = false; doorPanel.add(d); dents.push(d); }
  // yarık pencere (kapının üstü) + drone tarayıcı
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), glowMaterial(0x0a0e18, 1)); slit.position.set(0, 2.72, 0.07); doorG.add(slit);
  const scanMat = glowMaterial(0xff2020, 0, { transparent: true });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), scanMat); scan.position.set(0, 2.72, 0.075); doorG.add(scan);
  group.add(doorG);
  // kıvılcımlar
  const sparkGeo = new THREE.BufferGeometry(); const NS = 60; const sparkPos = new Float32Array(NS * 3); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(4), size: 0.025, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; group.add(sparks);
  const sparkSeeds = Array.from({ length: NS }, () => [R(), R(), R(), R()]);

  // --- alarm ışıkları ---
  const beaconDefs = [V(4.75, 2.85, 1.6), V(-4.75, 2.85, -2.5), V(1.5, 3.1, -3.85)];
  const beacons = beaconDefs.map((p) => {
    const g = new THREE.Group(); g.position.copy(p);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glowMaterial(0xff1a10, 0.3, { transparent: true, opacity: 0.9 })); g.add(dome);
    const baseM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), metalLeg); baseM.position.y = -0.02; g.add(baseM);
    group.add(g); return { g, dome };
  });
  const alarmSpots = beaconDefs.slice(0, 2).map((p) => { const s = new THREE.SpotLight(0xff2010, 0, 9, 0.5, 0.6, 1.4); s.position.copy(p); group.add(s, s.target); return s; });
  const alarmWash = new THREE.PointLight(0xff2014, 0, 12, 1.2); alarmWash.position.set(0.5, 2.8, 0.5); group.add(alarmWash);

  // --- karanlık yansıtıcı duvar ekranı (arka duvar sağ) ---
  const mirrorW = 2.0, mirrorH = 1.15;
  const mirrorFrame = new THREE.Mesh(roundedBox(mirrorW + 0.08, mirrorH + 0.08, 0.06, 0.012, 2), screenFrame); mirrorFrame.position.set(1.7, 1.6, -D / 2 + 0.06); group.add(mirrorFrame);
  const darkGlass = new THREE.Mesh(new THREE.PlaneGeometry(mirrorW, mirrorH), new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }));
  darkGlass.position.set(1.7, 1.6, -D / 2 + 0.095); group.add(darkGlass);
  const reflector = new Reflector(new THREE.PlaneGeometry(mirrorW, mirrorH), { textureWidth: 1024, textureHeight: 590, multisample: 4, clipBias: 0.003,
    shader: {
      name: 'DarkMirror', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: 0.55 } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = textureMatrix * vec4(position,1.0); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float strength; varying vec4 vUv; varying vec3 vN; varying vec3 vV; void main(){ vec4 b = texture2DProj(tDiffuse, vUv); float f = 0.35 + 0.65 * pow(1.0 - max(dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(b.rgb * strength * mix(0.6, 1.0, f) * vec3(0.85, 0.92, 1.05), 1.0); }`,
    } });
  reflector.position.set(1.7, 1.6, -D / 2 + 0.1); group.add(reflector);
  const mirrorScreen = { reflector, darkGlass };

  // --- tavan lambası (sıcak) + monitör ışıkları ---
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.2, 20, 1, true), envMaterial(0x1a3a2a, { roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })); lampShade.position.set(0.6, 2.55, 0.3); group.add(lampShade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), glowMaterial(0xffd8a0, 4)); bulb.position.set(0.6, 2.47, 0.3); group.add(bulb);
  const lampWire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 6), metalLeg); lampWire.position.set(0.6, 2.92, 0.3); group.add(lampWire);
  const lamp = new THREE.SpotLight(0xffc890, 18, 8, 0.9, 0.7, 1.5); lamp.position.set(0.6, 2.45, 0.3); lamp.target.position.set(0.6, 0, 0.3);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0005; lamp.shadow.normalBias = 0.03; group.add(lamp, lamp.target);
  const screenLight = new THREE.PointLight(0x2ab8ff, 2.2, 6, 1.5); screenLight.position.set(-2.3, 1.45, -3.3); group.add(screenLight);
  const wallGlow = { intensity: 0 };
  const hemi = new THREE.HemisphereLight(0x3a4a6a, 0x0a0a0c, 0.5); group.add(hemi);
  const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.025, 0.025), glowMaterial(0xff3cc8, 2.4)); neonStrip.position.set(-2.2, 2.85, -3.93); group.add(neonStrip);
  const neonStrip2 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 2.5), glowMaterial(0x20e0ff, 2.4)); neonStrip2.position.set(4.93, 2.95, -1.8); group.add(neonStrip2);
  const neonFill = { intensity: 0 };
  // --- acil durum aydınlatması (şalter sonrası): ön duvarda soğuk beyaz armatür + odaya yumuşak yıkama
  const emgMat = glowMaterial(0xdfe8ff, 0);
  const emgBox = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.11, 0.08), envMaterial(0x30343a, { roughness: 0.6, metalness: 0.3 })); emgBox.position.set(3.0, 2.72, D / 2 - 0.05); group.add(emgBox);
  const emgPanel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.012), emgMat); emgPanel.position.set(3.0, 2.68, D / 2 - 0.095); group.add(emgPanel);
  const emgLight = new THREE.SpotLight(0xc8d8ff, 0, 10, 1.05, 0.85, 1.5); emgLight.position.set(3.0, 2.62, D / 2 - 0.25); emgLight.target.position.set(1.6, 0.3, 0.2); group.add(emgLight, emgLight.target);

  const dustPts = dust(400, new THREE.Box3(V(-4, 0.3, -3.5), V(4, 3, 3.5)), { color: 0xffe0c0, size: 0.01, opacity: 0.35, seed: 8 });
  group.add(dustPts);

  // --- durum ---
  const state = {};
  function reset() {
    Object.assign(state, { mode: 'normal', alarm: 0, power: 1, afterDim: 0, countdown: null, countdownFrozen: false, countdownColor: null, screens: 'code', doorBangs: [], breaker: 0, tableImpactAt: null, cableAttached: true, wallMirror: 0, droneLight: 0, glitch: 0, emergency: 0 });
  }
  reset();

  const fmt = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };
  const HEX = '0123456789ABCDEF';
  function drawScreen(s, t, mode) {
    const { g, w, h } = s.sc; const rr = rng(s.seed + Math.floor(t * 12) * 7);
    const pw = state.power;
    if (mode === 'off' || pw < 0.02) { g.fillStyle = '#020304'; g.fillRect(0, 0, w, h); s.sc.tex.needsUpdate = true; return; }
    const red = state.alarm > 0.3;
    const glitch = state.glitch;
    if (mode === 'countdown' && state.countdown != null) {
      g.fillStyle = red ? '#1a0204' : '#020c10'; g.fillRect(0, 0, w, h);
      const col = state.countdownColor || (red ? '#ff3030' : '#30e0ff');
      g.fillStyle = col; g.font = `bold ${Math.round(h * 0.34)}px "DejaVu Sans Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const blink = state.countdownFrozen ? (Math.floor(t * 2) % 2 ? 1 : 0.35) : 1;
      g.globalAlpha = blink; g.fillText(fmt(state.countdown), w / 2, h * 0.52); g.globalAlpha = 1;
      g.font = `${Math.round(h * 0.08)}px "DejaVu Sans Mono", monospace`;
      g.fillText(state.countdownFrozen ? 'SİSTEM DONDURULDU' : 'ZİHİN SENKRONİZASYONU', w / 2, h * 0.2);
      g.fillStyle = col; g.globalAlpha = 0.25; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); g.globalAlpha = 1;
    } else if (s.kind === 'map') {
      g.fillStyle = '#03101a'; g.fillRect(0, 0, w, h); g.strokeStyle = red ? '#ff4040' : '#1a8ac0'; g.lineWidth = 1;
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, i * h / 12); g.lineTo(w, i * h / 12 + Math.sin(i) * 10); g.stroke(); g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12 + 15, h); g.stroke(); }
      const px = w * (0.5 + 0.3 * Math.sin(t * 0.4 + s.seed)), py = h * (0.5 + 0.25 * Math.cos(t * 0.3));
      g.strokeStyle = red ? '#ff3030' : '#ffd030'; g.beginPath(); g.arc(px, py, 6 + (t * 20) % 20, 0, 6.3); g.stroke();
    } else if (s.kind === 'cam') {
      g.fillStyle = '#0a0d10'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1e252c'; g.fillRect(w * 0.1, h * 0.55, w * 0.8, h * 0.4); g.fillStyle = '#262e36'; g.fillRect(w * 0.3, h * 0.2, w * 0.35, h * 0.38);
      if (state.droneLight > 0) { g.fillStyle = '#ff2020'; const dx = w * (0.5 + 0.35 * Math.sin(t * 1.3 + s.seed)); g.beginPath(); g.arc(dx, h * 0.32, 5, 0, 6.3); g.fill(); g.fillStyle = '#111'; g.fillRect(dx - 18, h * 0.3 - 4, 36, 8); }
      g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 300; i++) g.fillRect(rr() * w, rr() * h, 1, 1);
      g.fillStyle = red ? '#ff3030' : '#e0e0e0'; g.font = '11px monospace'; g.fillText('CAM-0' + (s.seed % 7) + ' ● REC', 6, 14);
    } else if (s.kind === 'wave') {
      g.fillStyle = '#020a0c'; g.fillRect(0, 0, w, h); g.strokeStyle = red ? '#ff4040' : '#30ffa0'; g.lineWidth = 1.5; g.beginPath();
      for (let x = 0; x < w; x++) { const y = h / 2 + Math.sin(x * 0.08 + t * 6) * h * 0.18 * Math.sin(x * 0.013 + t) + noise1(x * 0.3 + t * 30) * h * 0.06; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    } else {
      // kod akışı
      g.fillStyle = red ? '#120203' : '#020a0e'; g.fillRect(0, 0, w, h);
      const lh = Math.max(9, Math.round(h / 16)); g.font = `${lh - 2}px "DejaVu Sans Mono", monospace`; g.textAlign = 'left'; g.textBaseline = 'top';
      const scroll = Math.floor(t * 6);
      for (let i = 0; i < Math.ceil(h / lh); i++) {
        const r2 = rng(s.seed * 31 + i + scroll);
        g.fillStyle = red ? (r2() < 0.2 ? '#ffffff' : '#ff4040') : (r2() < 0.15 ? '#e0ffff' : r2() < 0.5 ? '#30d0ff' : '#1a8a9a');
        let line = ''; const n = 6 + Math.floor(r2() * 20); for (let k = 0; k < n; k++) line += r2() < 0.15 ? ' ' : HEX[Math.floor(r2() * 16)];
        g.fillText(line, 6 + Math.floor(r2() * 3) * 10, i * lh + 2);
      }
    }
    if (glitch > 0 && rr() < glitch) { const y = rr() * h; g.drawImage(s.sc.c, 0, y, w, 12, (rr() - 0.5) * 30, y, w, 12); g.fillStyle = `rgba(255,${red ? 40 : 255},${red ? 40 : 255},0.3)`; g.fillRect(0, rr() * h, w, 3); }
    s.mat.color.setScalar(pw * 1.15);
    s.sc.tex.needsUpdate = true;
  }

  function update(t, ctx) {
    ctx.scene.fog = fogObj; fogObj.density = 0.03;
    ctx.scene.background = new THREE.Color(0x05060a);
    
    const pw = state.power; const al = state.alarm; const after = state.afterDim;
    // ekranlar
    const scrMode = state.screens;
    for (const s of SC) {
      const isMain = s === mainScreen || s.kind === 'main';
      const m = scrMode === 'off' ? 'off' : (scrMode === 'countdown' && (isMain || s.seed % 3 === 0)) ? 'countdown' : isMain ? 'code' : scrMode === 'glitch' ? s.kind : s.kind;
      drawScreen(s, t, m);
    }
    // ışık seviyeleri
    const normal = pw * (1 - al * 0.75) * (1 - after * 0.55);
    lamp.intensity = 18 * normal * (state.mode === 'blackout' ? 0 : 1);
    bulb.material.color.setRGB(1, 0.85, 0.63).multiplyScalar(4 * normal);
    screenLight.intensity = 2.2 * pw * (1 - after * 0.5);
    screenLight.color.set(al > 0.3 ? 0xff3030 : 0x2ab8ff);
    wallGlow.intensity = 0;
    neonFill.intensity = 0;
    neonStrip.material.color.setRGB(1, 0.235, 0.784).multiplyScalar(2.4 * pw);
    neonStrip2.material.color.setRGB(0.125, 0.878, 1).multiplyScalar(2.4 * pw);
    hemi.intensity = 1.5 * (pw > 0.05 ? 1 : 0.45) * (1 - al * 0.4) + after * 0.6;
    hemi.color.set(after > 0 ? 0x4a5468 : 0x3a4a6a);
    // acil durum ışığı (sahne 4)
    const emg = state.emergency || 0;
    hemi.intensity += emg * 4.6;
    emgLight.intensity = emg * 45;
    emgMat.color.setRGB(0.87, 0.91, 1).multiplyScalar(emg * 3);
    // alarm
    const rot = t * 4.2;
    beacons.forEach(({ g, dome }, i) => { const f = 0.5 + 0.5 * Math.cos(rot + i * 2); dome.material.color.setRGB(1, 0.1, 0.06).multiplyScalar(0.3 + al * (1.5 + 3 * f)); });
    alarmSpots.forEach((s, i) => { s.intensity = al * 55; const a = rot + i * 2.1; s.target.position.set(s.position.x + Math.cos(a) * 3, 0.5, s.position.z + Math.sin(a) * 3); });
    alarmWash.intensity = al * (3 + 3 * Math.max(0, Math.cos(rot * 2)));
    // şalter
    lever.rotation.x = 0.15 - state.breaker * 2.7;
    brkLamp.material.color.set(state.breaker > 0.5 ? 0xff2020 : 0x30ff60).multiplyScalar(2);
    // kapı darbeleri
    let shake = 0, flash = 0; let nHits = 0;
    for (const bt of state.doorBangs) { const dt = t - bt; if (dt >= 0) { nHits++; if (dt < 0.6) { shake += Math.exp(-dt * 9) * Math.sin(dt * 70); flash = Math.max(flash, Math.exp(-dt * 12)); } } }
    doorPanel.position.set(shake * 0.012, 1.13, 0.1 - Math.abs(shake) * 0.03);
    doorPanel.rotation.z = shake * 0.006;
    dents.forEach((d, i) => { d.visible = nHits > i * 2; });
    leakMat.color.setRGB(1, 0.35, 0.2).multiplyScalar(flash * 3 + al * 0.4 * (0.5 + 0.5 * Math.sin(t * 9)));
    // kıvılcımlar (son darbeden)
    let last = null; for (const bt of state.doorBangs) if (t >= bt) last = bt;
    if (last != null && t - last < 0.9) {
      const age = t - last; sparks.visible = true; sparkMat.opacity = 1 - age / 0.9;
      sparkSeeds.forEach(([a, b, c, d], i) => { const vx = -1.2 - a * 2, vy = 0.5 + b * 2, vz = (c - 0.5) * 2.4; const x0 = 4.85, y0 = 1.2 + (d - 0.5) * 1.8, z0 = 0.5 + (c - 0.5) * 1.2; sparkPos[i * 3] = x0 + vx * age; sparkPos[i * 3 + 1] = Math.max(0.01, y0 + vy * age - 4.9 * age * age); sparkPos[i * 3 + 2] = z0 + vz * age; });
      sparkGeo.attributes.position.needsUpdate = true;
    } else sparks.visible = false;
    // drone tarayıcı
    scanMat.color.setRGB(1, 0.1, 0.1).multiplyScalar(state.droneLight * 4 * (0.6 + 0.4 * Math.sin(t * 11)));
    scan.position.x = Math.sin(t * 1.4) * 0.45;
    // masa darbesi
    if (state.tableImpactAt != null) {
      const dt = t - state.tableImpactAt;
      tableCans.forEach((c) => { if (dt > 0 && dt < 0.8) { const hop = Math.max(0, Math.sin(Math.min(1, dt / (0.18 * c.k)) * Math.PI)) * 0.03 * c.k * Math.exp(-dt * 3); c.m.position.y = c.base.y + hop; c.m.rotation.z = Math.sin(dt * 30 * c.k) * 0.08 * Math.exp(-dt * 5); } else { c.m.position.copy(c.base); c.m.rotation.copy(c.rot); } });
      pcbs.forEach((p, i) => { p.position.y = 0.822 + (dt > 0 && dt < 0.3 ? Math.sin(dt / 0.3 * Math.PI) * 0.01 * (1 + i % 2) : 0); });
    } else tableCans.forEach((c) => { c.m.position.copy(c.base); c.m.rotation.copy(c.rot); });
    attachedCable.visible = state.cableAttached;
    // yansıma
    reflector.visible = state.wallMirror > 0.01; reflector.material.uniforms.strength.value = 1.15 * state.wallMirror;
    darkGlass.visible = !reflector.visible;
    dustPts.userData.update(t);
  }
  const fogObj = new THREE.FogExp2(0x080a10, 0.03);

  const anchors = {
    terminalSeat: Object.assign(V(-2.3, 0, -2.6), { heading: Math.PI }),
    terminalStand: Object.assign(V(-1.6, 0, -2.6), { heading: Math.PI - 0.4 }),
    cablePort: cablePort.clone().add(V(0, 0.017, 0.05)), towerPort: V(-0.95, 0.45, -3.3),
    table: V(0.6, 0.815, 0.3),
    tableSlam: Object.assign(V(0.6, 0, 1.15), { heading: Math.PI }),
    door: Object.assign(V(4.3, 0, 0.5), { heading: Math.PI / 2 }),
    breaker: Object.assign(V(-4.4, 0, -1.4), { heading: -Math.PI / 2 }),
    wallScreen: Object.assign(V(1.7, 1.6, -3.9), { normal: V(0, 0, 1) }),
    floorCenter: V(-0.9, 0, -1.6),
    photoSpot: V(0.3, 0, 0.2),
    atlas: Object.assign(V(-1.2, 0, -1.4), { heading: 0.4 }),
    asya: Object.assign(V(0.9, 0, 1.2), { heading: Math.PI + 0.3 }),
    defne: Object.assign(V(-2.3, 0, -2.6), { heading: Math.PI }),
  };
  const previewCams = [
    { pos: [3.6, 1.9, 3.6], target: [-1, 1.1, -1.5], fov: 50 },
    { pos: [-1.2, 1.5, -0.8], target: [-2.3, 1.1, -3.5], fov: 40 },
    { pos: [1.8, 1.5, 0.8], target: [4.9, 1.3, 0.5], fov: 42 },
    { pos: [-2.4, 1.5, -0.2], target: [-4.9, 1.3, -1.4], fov: 40 },
    { pos: [0.6, 1.4, 2.6], target: [0.6, 0.8, 0.3], fov: 40 },
    { pos: [1.7, 1.6, -1.2], target: [1.7, 1.6, -4], fov: 40 },
    { pos: [-0.5, 0.25, 2.5], target: [-1, 0.6, -2], fov: 45 },
  ];
  return { group, update, reset, state, anchors, previewCams, mirrorScreen, lights: { lamp, screenLight, hemi, alarmWash } };
}
