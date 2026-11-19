// Hikâye aksesuarları. Her biri: { group, update(t, ctx), reset(), preview?(t, ctx), ...kontroller }
//
// crt         : antika CRT monitör. power 0..1, countdown (sn), message 0..1 (kan kırmızısı yazı), glitch 0..1,
//               reflection 0..1 (camda gerçek yansıma), light 0..1. Grup kökü = masa üstü, ekran +z'ye bakar.
// flashlight  : el feneri. on 0..1, flicker 0..1. Işık grubun -z yönüne değil +z yönüne vurur (ön = +z).
//               keepParent: shot karakterin eline takar.
// pistol      : modifiye şok tabancası. charge 0..1, spark 0..1. Namlu +z.
// tablet      : sinyal izleyici tablet. mode 'signal'|'decode'|'alert', glow 0..1, prox 0..1.
// cable       : nöral kablo. setEnds(a, b, sag), pulse 0..1, plugSpark 0..1, plugAt (b ucunda fiş)
// photo       : buruşuk eski fotoğraf. unfold 0..1, flip 0..1 (arkası: el yazısı not)
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { envMaterial, glowMaterial, canvasTexture, charMaterial } from '../engine/materials.js';
import { roundedBox, lock } from '../characters/geo.js';
import { lightShaft, screenCanvas } from '../sets/common.js';
import { rng, fbm1, fbm3, noise1, clamp, smoothstep } from '../engine/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildProps(stage) {
  return { crt: crt(), flashlight: flashlight(), pistol: pistol(), tablet: tablet(), cable: cable(), photo: photo() };
}

const fmt = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };

// ---------------- CRT ----------------
function crt() {
  const group = new THREE.Group(); group.name = 'crt';
  const beige = canvasTexture(256, 256, (g, w, h) => { g.fillStyle = '#b8ab8a'; g.fillRect(0, 0, w, h); const R = rng(3); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${60 + R() * 40},${50 + R() * 30},${30},${R() * 0.12})`; g.fillRect(R() * w, R() * h, 2 + R() * 6, 2 + R() * 6); } for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(60,40,20,0.15)'; g.fillRect(R() * w, R() * h * 0.3, 2, 40 + R() * 80); } });
  const caseMat = envMaterial(0xffffff, { map: beige, roughness: 0.6 });
  const darkMat = envMaterial(0x2a2620, { roughness: 0.7 });
  // gövde: öne bakan çerçeve + arkaya daralan tüp
  const bezel = new THREE.Mesh(roundedBox(0.52, 0.44, 0.1, 0.03, 3), caseMat); bezel.position.set(0, 0.27, 0.12); group.add(bezel);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.32, 4, 1), caseMat); back.rotation.set(Math.PI / 2, Math.PI / 4, 0); back.position.set(0, 0.26, -0.08); back.scale.set(1.25, 1, 1.0); group.add(back);
  const stand = new THREE.Mesh(roundedBox(0.34, 0.05, 0.3, 0.015, 2), caseMat); stand.position.set(0, 0.025, 0.02); group.add(stand);
  const neck = new THREE.Mesh(roundedBox(0.16, 0.04, 0.14, 0.01, 2), darkMat); neck.position.set(0, 0.065, 0.03); group.add(neck);
  for (let i = 0; i < 7; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.006, 0.01), darkMat); v.position.set(0, 0.36 - i * 0.025, -0.12); v.rotation.x = -0.4; group.add(v); }
  for (const x of [0.15, 0.2]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 16), darkMat); k.rotation.x = Math.PI / 2; k.position.set(x, 0.085, 0.175); group.add(k); }
  const pled = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), glowMaterial(0x40ff60, 0)); pled.position.set(-0.2, 0.085, 0.171); group.add(pled);
  // ekran (hafif kavisli)
  const sc = screenCanvas(640, 480);
  const sg = new THREE.PlaneGeometry(0.4, 0.3, 24, 18);
  { const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, (0.03 - (x * x + y * y) * 0.25) * 0.4); } sg.computeVertexNormals(); }
  const inner = new THREE.Mesh(roundedBox(0.44, 0.34, 0.012, 0.02, 2), darkMat); inner.position.set(0, 0.28, 0.168); group.add(inner);
  const scrMat = new THREE.MeshBasicMaterial({ map: sc.tex, toneMapped: true });
  const screen = new THREE.Mesh(sg, scrMat); screen.position.set(0, 0.28, 0.175); group.add(screen);
  // cam yansıması (gerçek)
  const refl = new Reflector(new THREE.PlaneGeometry(0.4, 0.3), { textureWidth: 640, textureHeight: 480, multisample: 4, clipBias: 0.002,
    shader: { name: 'CRTGlass', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: 0.5 } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vQ; void main(){ vUv = textureMatrix * vec4(position,1.0); vQ = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec4 vUv; varying vec2 vQ; void main(){ vec4 b = texture2DProj(tDiffuse, vUv); float e = smoothstep(0.0, 0.12, vQ.x) * smoothstep(1.0, 0.88, vQ.x) * smoothstep(0.0, 0.12, vQ.y) * smoothstep(1.0, 0.88, vQ.y); gl_FragColor = vec4(b.rgb * strength * (0.4 + 0.6 * e), 1.0); }` } });
  refl.material.transparent = true; refl.material.blending = THREE.AdditiveBlending; refl.material.depthWrite = false;
  refl.position.set(0, 0.28, 0.1895); group.add(refl);
  const glass = new THREE.Mesh(sg.clone(), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.05, clearcoat: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.5 }));
  glass.position.set(0, 0.28, 0.1765); group.add(glass);
  const light = new THREE.PointLight(0x40ff80, 0, 4, 1.6); light.position.set(0, 0.45, 0.9); group.add(light);
  const st = {};
  const reset = () => Object.assign(st, { power: 0, countdown: 900, message: 0, glitch: 0, reflection: 0, light: 1, msgColor: '#ff1a1a' });
  reset();
  const MSG = 'Sizi 3 yıl önce sistemden sildik. Şimdi silinme sırası onlarda.';
  function draw(t) {
    const { g, w, h } = sc; const pw = st.power;
    g.fillStyle = '#020604'; g.fillRect(0, 0, w, h);
    if (pw <= 0.001) { sc.tex.needsUpdate = true; return; }
    // açılma: önce yatay çizgi, sonra ekran
    const open = clamp((pw - 0.15) / 0.85);
    if (pw < 0.15) { const k = pw / 0.15; g.fillStyle = `rgba(200,255,220,${k})`; g.fillRect(w * (0.5 - k * 0.5), h / 2 - 2, w * k, 4); sc.tex.needsUpdate = true; return; }
    g.save(); g.translate(0, h / 2); g.scale(1, open); g.translate(0, -h / 2);
    const R = rng(Math.floor(t * 24));
    const flick = 0.88 + 0.12 * R();
    // başlık satırları
    g.fillStyle = `rgba(60,255,120,${0.55 * flick})`; g.font = '22px "DejaVu Sans Mono", monospace'; g.textAlign = 'left';
    g.fillText('> ANALOG KANAL 147.30 // MÜHÜRLÜ', 30, 50);
    g.fillText('> KAYNAK: ' + (R() < 0.5 ? 'BİLİNMİYOR' : '????????'), 30, 80);
    // sayaç
    g.textAlign = 'center'; g.fillStyle = `rgba(80,255,140,${flick})`; g.shadowColor = '#40ff80'; g.shadowBlur = 24;
    g.font = 'bold 120px "DejaVu Sans Mono", monospace'; g.fillText(fmt(st.countdown), w / 2, h * 0.55);
    g.shadowBlur = 0;
    // mesaj
    if (st.message > 0) {
      const n = Math.floor(MSG.length * clamp(st.message * 1.15));
      const txt = MSG.slice(0, n);
      g.font = 'bold 30px "DejaVu Sans Mono", monospace'; g.fillStyle = st.msgColor; g.shadowColor = '#ff0000'; g.shadowBlur = 18;
      const words = txt.split(' '); let line = '', y = h * 0.72; const lines = [];
      for (const wd of words) { if (g.measureText(line + wd).width > w - 70) { lines.push(line); line = ''; } line += wd + ' '; } lines.push(line);
      lines.forEach((l, i) => g.fillText(l.trim() + (i === lines.length - 1 && n < MSG.length && Math.floor(t * 4) % 2 ? '█' : ''), w / 2, y + i * 38));
      g.shadowBlur = 0;
    }
    g.restore();
    // tarama çizgileri + parlama
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    const roll = (t * 60) % h; g.fillStyle = 'rgba(120,255,160,0.06)'; g.fillRect(0, roll, w, 40);
    // bozulma
    if (st.glitch > 0) { for (let i = 0; i < 8 * st.glitch; i++) { const y = R() * h, hh = 4 + R() * 20; g.drawImage(sc.c, 0, y, w, hh, (R() - 0.5) * 80 * st.glitch, y, w, hh); } g.fillStyle = `rgba(255,255,255,${0.08 * st.glitch})`; g.fillRect(0, 0, w, h); }
    // vinyet
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.8)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    sc.tex.needsUpdate = true;
  }
  function update(t) {
    draw(t);
    const pw = clamp(st.power);
    scrMat.color.setScalar(1.0 + st.glitch * 0.4);
    const red = st.message > 0.05 ? st.message : 0;
    light.color.setRGB(0.25 + red * 0.75, 1 - red * 0.8, 0.5 - red * 0.35);
    light.intensity = pw * st.light * 0.7 * (0.85 + 0.15 * noise1(t * 30));
    pled.material.color.setRGB(0.25, 1, 0.37).multiplyScalar(pw > 0.1 ? 2 : 0);
    refl.visible = st.reflection > 0.01; refl.material.uniforms.strength.value = st.reflection;
  }
  return Object.assign(st, { group, update, reset, preview(t) { st.power = 1; st.countdown = 900 - t; st.message = 0.6; } });
}

// ---------------- El feneri ----------------
function flashlight() {
  const group = new THREE.Group(); group.name = 'flashlight';
  const metal = charMaterial(0x2a2d33, { metalness: 0.8, roughness: 0.35, sheen: 0, rim: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.17, 18), metal); body.rotation.x = Math.PI / 2; body.position.z = 0.0; group.add(body);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.019, 0.06, 20), metal); head.rotation.x = Math.PI / 2; head.position.z = 0.11; group.add(head);
  const lensMat = glowMaterial(0xfff2d8, 6); const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 20), lensMat); lens.position.z = 0.141; group.add(lens);
  for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0172, 0.002, 6, 18), metal); r.position.z = -0.06 + i * 0.012; group.add(r); }
  const spot = new THREE.SpotLight(0xffeccc, 40, 14, 0.42, 0.55, 1.4);
  spot.position.set(0, 0, 0.14); spot.target.position.set(0, 0, 3); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.03; spot.shadow.camera.near = 0.1;
  group.add(spot, spot.target);
  const beam = lightShaft(4, 0.03, 1.15, 0xffe8c8, 0.08); beam.rotation.x = -Math.PI / 2; beam.position.z = 0.14; group.add(beam);
  const glare = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), new THREE.MeshBasicMaterial({ map: canvasTexture(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(0.3, 'rgba(255,230,200,0.35)'); gr.addColorStop(1, 'rgba(255,230,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glare.position.z = 0.145; group.add(glare);
  const st = {};
  const reset = () => Object.assign(st, { on: 1, flicker: 0, intensity: 1 });
  reset();
  function update(t) {
    let k = st.on * st.intensity;
    if (st.flicker > 0) k *= 1 - st.flicker * (fbm1(t * 25) > 0.1 ? 0.8 : 0);
    spot.intensity = 40 * k; lensMat.color.setRGB(1, 0.95, 0.85).multiplyScalar(6 * k); beam.material.uniforms.intensity.value = 0.08 * k; glare.visible = k > 0.05; beam.visible = k > 0.02;
    beam.userData.setTime(t);
  }
  return Object.assign(st, { group, update, reset, keepParent: false, spot });
}

// ---------------- Şok tabancası ----------------
function pistol() {
  const group = new THREE.Group(); group.name = 'pistol';
  const gun = charMaterial(0x2c3036, { metalness: 0.7, roughness: 0.38, sheen: 0, rim: 0.6 });
  const yel = charMaterial(0xe8b818, { roughness: 0.5, rim: 0.6 });
  const copper = charMaterial(0xc87840, { metalness: 0.9, roughness: 0.3, sheen: 0 });
  const grip = new THREE.Mesh(roundedBox(0.032, 0.1, 0.045, 0.01, 2), gun); grip.position.set(0, -0.045, -0.01); grip.rotation.x = -0.25; group.add(grip);
  const bodyM = new THREE.Mesh(roundedBox(0.038, 0.05, 0.17, 0.01, 2), gun); bodyM.position.set(0, 0.012, 0.045); group.add(bodyM);
  const stripe = new THREE.Mesh(roundedBox(0.039, 0.01, 0.12, 0.003, 1), yel); stripe.position.set(0, 0.03, 0.05); group.add(stripe);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 6, 18), copper);
  const coils = new THREE.Group(); for (let i = 0; i < 7; i++) { const c = coil.clone(); c.position.z = 0.1 + i * 0.008; coils.add(c); } coils.position.y = 0.01; group.add(coils);
  const cellMat = glowMaterial(0x40e8ff, 1.5);
  for (const x of [-0.022, 0.022]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 10), cellMat); c.rotation.x = Math.PI / 2; c.position.set(x, 0.012, 0.03); group.add(c); }
  for (const x of [-0.01, 0.01]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 8), copper); p.rotation.x = Math.PI / 2; p.position.set(x, 0.01, 0.165); group.add(p); }
  const arcMat = glowMaterial(0x9ff4ff, 4, { transparent: true });
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), arcMat); group.add(arc);
  const glowL = { intensity: 0 };
  const st = {}; const reset = () => Object.assign(st, { charge: 0.4, spark: 0 }); reset();
  function update(t) {
    cellMat.color.setRGB(0.25, 0.9, 1).multiplyScalar(0.5 + st.charge * 2.5 * (0.8 + 0.2 * Math.sin(t * 20)));
    arc.visible = st.spark > 0.05;
    if (arc.visible) {
      const R = rng(Math.floor(t * 24)); const pts = [];
      for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push(V(-0.01 + 0.02 * k, 0.01 + (R() - 0.5) * 0.012, 0.182 + (R() - 0.5) * 0.006)); }
      arc.geometry.dispose(); arc.geometry = lock(pts, 0.0016, 0.0016, { taper: 1, rootTaper: 1, segs: 12, radial: 4 });
      arcMat.color.setRGB(0.6, 0.95, 1).multiplyScalar(4 * st.spark);
    }
    glowL.intensity = st.spark * 1.5 + st.charge * 0.2;
  }
  return Object.assign(st, { group, update, reset });
}

// ---------------- Tablet ----------------
function tablet() {
  const group = new THREE.Group(); group.name = 'tablet';
  const shell = new THREE.Mesh(roundedBox(0.26, 0.18, 0.016, 0.012, 2), charMaterial(0x26292f, { roughness: 0.5, rim: 0.6 })); group.add(shell);
  const bumper = new THREE.Mesh(roundedBox(0.272, 0.192, 0.012, 0.016, 2), charMaterial(0xe8a020, { roughness: 0.7 })); bumper.position.z = -0.003; group.add(bumper);
  const sc = screenCanvas(512, 352);
  const mat = new THREE.MeshBasicMaterial({ map: sc.tex });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.236, 0.162), mat); scr.position.z = 0.0085; group.add(scr);
  const light = { intensity: 0, color: new THREE.Color() };
  const st = {}; const reset = () => Object.assign(st, { mode: 'signal', glow: 1, prox: 0.3, freq: 147.3 }); reset();
  function draw(t) {
    const { g, w, h } = sc; const R = rng(Math.floor(t * 12));
    const alert = st.mode === 'alert'; const C = alert ? '#ff4040' : '#40d8ff';
    g.fillStyle = alert ? '#16030404' : '#03101a'; g.fillStyle = alert ? '#160304' : '#03101a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = C; g.fillStyle = C; g.lineWidth = 2; g.font = 'bold 22px "DejaVu Sans Mono", monospace'; g.textAlign = 'left';
    if (st.mode === 'decode') {
      g.font = '16px "DejaVu Sans Mono", monospace';
      for (let i = 0; i < 16; i++) { const r2 = rng(i + Math.floor(t * 8)); let s = ''; for (let k = 0; k < 28; k++) s += '0123456789ABCDEF'[Math.floor(r2() * 16)]; g.globalAlpha = 0.5 + r2() * 0.5; g.fillText(s, 14, 24 + i * 20); }
      g.globalAlpha = 1; g.fillStyle = '#ffe040'; g.font = 'bold 20px "DejaVu Sans Mono", monospace'; g.fillText('ÇÖZÜLÜYOR... %' + Math.floor(clamp(st.prox) * 100), 14, h - 16);
    } else {
      // radar
      const cx = w * 0.32, cy = h * 0.55, rr = h * 0.36;
      for (let i = 1; i <= 3; i++) { g.globalAlpha = 0.5; g.beginPath(); g.arc(cx, cy, (rr * i) / 3, 0, 6.3); g.stroke(); }
      const a = t * 2.4; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.stroke();
      const bx = cx + Math.cos(-1.2) * rr * (1 - clamp(st.prox)) , by = cy + Math.sin(-1.2) * rr * (1 - clamp(st.prox));
      g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8); g.beginPath(); g.arc(bx, by, 8, 0, 6.3); g.fill(); g.globalAlpha = 1;
      g.fillText('SİNYAL', w * 0.62, 50);
      g.font = 'bold 34px "DejaVu Sans Mono", monospace'; g.fillText((st.freq + noise1(t * 3) * 0.02).toFixed(2), w * 0.62, 92);
      g.font = '18px "DejaVu Sans Mono", monospace'; g.fillText('MHz  ANALOG', w * 0.62, 116);
      g.fillText('KAYNAK: ' + Math.max(0.3, (1 - clamp(st.prox)) * 12).toFixed(1) + ' m', w * 0.62, 160);
      // dalga
      g.beginPath(); for (let x = 0; x < w * 0.36; x++) { const y = 230 + Math.sin(x * 0.2 + t * 10) * 18 * (0.3 + st.prox) + (R() - 0.5) * 6; x ? g.lineTo(w * 0.62 + x, y) : g.moveTo(w * 0.62 + x, y); } g.stroke();
      g.fillRect(w * 0.62, 290, w * 0.34 * clamp(st.prox), 14); g.strokeRect(w * 0.62, 290, w * 0.34, 14);
      if (alert) { g.font = 'bold 26px "DejaVu Sans Mono", monospace'; g.fillText('!! MÜHÜRLÜ FREKANS !!', 20, 34); }
    }
    sc.tex.needsUpdate = true;
  }
  function update(t) { draw(t); mat.color.setScalar(0.9 * st.glow); light.intensity = 0.12 * st.glow; light.color.set(st.mode === 'alert' ? 0xff4040 : 0x50c8ff); }
  return Object.assign(st, { group, update, reset });
}

// ---------------- Nöral kablo ----------------
function cable() {
  const group = new THREE.Group(); group.name = 'cable';
  const cm = charMaterial(0x111316, { roughness: 0.45, clearcoat: 0.4, rim: 0.8 });
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, amt: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float t; uniform float amt; varying vec2 vUv; void main(){ float b = pow(0.5 + 0.5 * sin((vUv.x * 40.0 - t * 18.0)), 8.0); vec3 c = vec3(0.3, 0.95, 1.0) * (b * 6.0 + 0.4) * amt; gl_FragColor = vec4(c, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), cm); group.add(tube);
  const glowTube = new THREE.Mesh(new THREE.BufferGeometry(), pulseMat); group.add(glowTube);
  const plug = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.055, 16), charMaterial(0x8a9098, { metalness: 0.9, roughness: 0.25, sheen: 0 })); pb.rotation.x = Math.PI / 2; pb.position.z = -0.028; plug.add(pb);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10), charMaterial(0xd0a050, { metalness: 1, roughness: 0.2 })); pin.rotation.x = Math.PI / 2; pin.position.z = 0.005; plug.add(pin);
  const ringMat = glowMaterial(0x40e8ff, 2); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.002, 6, 20), ringMat); ring.position.z = -0.01; plug.add(ring);
  group.add(plug);
  const sparkGeo = new THREE.BufferGeometry(); const sp = new Float32Array(40 * 3); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(4), size: 0.012, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; group.add(sparks);
  const st = {}; const reset = () => Object.assign(st, { a: V(0, 1, 0), b: V(0.5, 1, 0), bDir: V(-1, 0, 0), sag: 0.3, pulse: 0, plugSpark: 0, mid: null }); reset();
  st.setEnds = (a, b, sag = 0.3, bDir = null, mid = null) => { st.a = a.clone(); st.b = b.clone(); st.sag = sag; st.bDir = bDir ? bDir.clone().normalize() : st.b.clone().sub(st.a).normalize(); st.mid = mid; };
  function update(t) {
    const pts = []; const n = 24;
    const endDir = st.bDir.clone();
    for (let i = 0; i <= n; i++) {
      const k = i / n; const p = st.a.clone().lerp(st.b, k); p.y -= st.sag * 4 * k * (1 - k);
      if (st.mid) p.add(st.mid.clone().multiplyScalar(4 * k * (1 - k)));
      // uca yakın: fiş yönüne hizala
      const w = smoothstep(0.75, 1, k); p.add(endDir.clone().multiplyScalar(-(1 - k) * 0.25 * w));
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    tube.geometry.dispose(); tube.geometry = new THREE.TubeGeometry(curve, 48, 0.011, 8, false);
    glowTube.visible = st.pulse > 0.01;
    if (glowTube.visible) { glowTube.geometry.dispose(); glowTube.geometry = new THREE.TubeGeometry(curve, 48, 0.0125, 8, false); pulseMat.uniforms.t.value = t; pulseMat.uniforms.amt.value = st.pulse; }
    plug.position.copy(st.b); plug.quaternion.setFromUnitVectors(V(0, 0, 1), endDir);
    ringMat.color.setRGB(0.25, 0.9, 1).multiplyScalar(1 + st.pulse * 4);
    sparks.visible = st.plugSpark > 0.02;
    if (sparks.visible) { const R = rng(Math.floor(t * 24)); for (let i = 0; i < 40; i++) { const d = V(R() - 0.5, R() - 0.3, R() - 0.5).normalize().multiplyScalar(0.02 + R() * 0.08 * st.plugSpark); sp[i * 3] = st.b.x + d.x; sp[i * 3 + 1] = st.b.y + d.y; sp[i * 3 + 2] = st.b.z + d.z; } sparkGeo.attributes.position.needsUpdate = true; sparkMat.opacity = st.plugSpark; }
  }
  return Object.assign(st, { group, update, reset, preview(t) { st.setEnds(V(-0.3, 1.1, 0), V(0.25, 1.0, 0.1), 0.15); st.pulse = 1; } });
}

// ---------------- Fotoğraf ----------------
function photo() {
  const group = new THREE.Group(); group.name = 'photo';
  const PW = 0.15, PH = 0.105;
  const front = canvasTexture(600, 420, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
    const ix = 22, iy = 22, iw = w - 44, ih = h - 80;
    const bg = g.createLinearGradient(0, iy, 0, iy + ih); bg.addColorStop(0, '#f2b26a'); bg.addColorStop(0.55, '#e07a5a'); bg.addColorStop(1, '#5a3a4a'); g.fillStyle = bg; g.fillRect(ix, iy, iw, ih);
    // güneş batımı + çatı silueti
    g.fillStyle = 'rgba(255,230,160,0.9)'; g.beginPath(); g.arc(ix + iw * 0.75, iy + ih * 0.45, 40, 0, 6.3); g.fill();
    g.fillStyle = '#2a1e2a'; g.fillRect(ix, iy + ih * 0.78, iw, ih * 0.22);
    for (let i = 0; i < 9; i++) { g.fillRect(ix + i * 64, iy + ih * (0.5 + (i % 3) * 0.08), 40, ih * 0.4); }
    // üç arkadaş (stilize): Atlas (ortada), Asya (sol), Defne (sağ)
    const person = (x, scale, hair, top, extra) => {
      const by = iy + ih * 0.98;
      g.fillStyle = top; g.beginPath(); g.ellipse(x, by - 60 * scale, 46 * scale, 70 * scale, 0, Math.PI, 0); g.fill(); g.fillRect(x - 46 * scale, by - 60 * scale, 92 * scale, 60 * scale);
      g.fillStyle = '#e8b896'; g.beginPath(); g.arc(x, by - 150 * scale, 42 * scale, 0, 6.3); g.fill();
      g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(x - 14 * scale, by - 154 * scale, 5 * scale, 0, 6.3); g.arc(x + 14 * scale, by - 154 * scale, 5 * scale, 0, 6.3); g.fill();
      g.strokeStyle = '#6a2a2a'; g.lineWidth = 3 * scale; g.beginPath(); g.arc(x, by - 140 * scale, 14 * scale, 0.2, Math.PI - 0.2); g.stroke();
      extra(x, by, scale);
      void hair;
    };
    person(ix + iw * 0.5, 1.05, '#1a120c', '#2c3036', (x, by, s) => { g.fillStyle = '#1a120c'; g.beginPath(); g.ellipse(x - 6 * s, by - 186 * s, 46 * s, 22 * s, -0.3, 0, 6.3); g.fill(); g.fillStyle = '#2fd8ff'; g.fillRect(x - 3, by - 110 * s, 6, 50 * s); });
    person(ix + iw * 0.25, 0.95, '#0d0b0c', '#b3202a', (x, by, s) => { g.fillStyle = '#0d0b0c'; g.beginPath(); g.ellipse(x + 8 * s, by - 184 * s, 46 * s, 22 * s, 0.4, 0, 6.3); g.fill(); g.fillStyle = '#e0305a'; g.beginPath(); g.ellipse(x + 26 * s, by - 172 * s, 10 * s, 30 * s, 0.6, 0, 6.3); g.fill(); });
    person(ix + iw * 0.76, 0.9, '#3c2214', '#3d68a6', (x, by, s) => { g.fillStyle = '#3c2214'; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 1.2 + Math.PI * 0.9; g.beginPath(); g.arc(x + Math.cos(a) * 46 * s, by - 160 * s + Math.sin(a) * 44 * s, 15 * s, 0, 6.3); g.fill(); } g.beginPath(); g.arc(x + 4 * s, by - 216 * s, 26 * s, 0, 6.3); g.fill(); g.fillStyle = '#f06aa0'; g.fillRect(x - 10 * s, by - 196 * s, 28 * s, 8 * s); const cols = ['#e8473f', '#f28a2e', '#f4c94a', '#5cba6a', '#3d8fd6']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(x - 46 * s, by - 100 * s + i * 10 * s, 18 * s, 10 * s); g.fillRect(x + 28 * s, by - 100 * s + i * 10 * s, 18 * s, 10 * s); }); });
    // solma, çizik, renk kayması
    const R = rng(12); g.fillStyle = 'rgba(255,240,200,0.18)'; g.fillRect(ix, iy, iw, ih);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(255,255,255,${R() * 0.4})`; g.lineWidth = 1; g.beginPath(); const x = ix + R() * iw, y = iy + R() * ih; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 120, y + (R() - 0.5) * 40); g.stroke(); }
    g.fillStyle = '#7a6a50'; g.font = 'italic 22px serif'; g.fillText('çatı · ??.??.20??', 30, h - 22);
  });
  const backTex = canvasTexture(600, 420, (g, w, h) => {
    g.fillStyle = '#eee7d8'; g.fillRect(0, 0, w, h); const R = rng(44);
    for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(120,100,70,${R() * 0.06})`; g.fillRect(R() * w, R() * h, 3, 3); }
    const lines = ['Eğer bu notu okuyorsan,', 'döngüyü yine başlattın', 'demektir.', '', '4. kişiye dikkat et.'];
    g.fillStyle = '#1c2a5a'; g.textBaseline = 'alphabetic';
    let y = 90;
    lines.forEach((ln, li) => {
      let x = 44; const big = li === 4;
      g.font = `${big ? 'bold italic 46px' : 'italic 40px'} "DejaVu Serif", serif`;
      if (big) g.fillStyle = '#7a1010';
      for (const ch of ln) { g.save(); g.translate(x, y + (R() - 0.5) * 3); g.rotate((R() - 0.5) * 0.12 - 0.04); g.fillText(ch, 0, 0); g.restore(); x += g.measureText(ch).width * (0.92 + R() * 0.12); }
      if (big) { g.strokeStyle = '#7a1010'; g.lineWidth = 3; g.beginPath(); g.moveTo(44, y + 12); g.lineTo(x, y + 8); g.stroke(); }
      y += ln ? 62 : 30;
    });
    g.fillStyle = '#1c2a5a'; g.font = 'italic 30px "DejaVu Serif", serif'; g.fillText('— D.', w - 140, h - 40);
  });
  const geo = new THREE.PlaneGeometry(PW, PH, 30, 20);
  const restPos = geo.attributes.position.array.slice();
  const mFront = charMaterial(0xffffff, { map: front, roughness: 0.55, sheen: 0, clearcoat: 0.3, rim: 0.2 });
  const mBack = charMaterial(0xffffff, { map: backTex, roughness: 0.8, sheen: 0, rim: 0.2 });
  const fm = new THREE.Mesh(geo, mFront); const bm = new THREE.Mesh(geo, mBack); bm.rotation.y = Math.PI;
  const card = new THREE.Group(); card.add(fm, bm); group.add(card);
  const st = {}; const reset = () => Object.assign(st, { unfold: 1, flip: 0 }); reset();
  let lastU = -1;
  function update() {
    if (Math.abs(lastU - st.unfold) > 1e-4) {
      lastU = st.unfold; const p = geo.attributes.position; const c = 1 - clamp(st.unfold);
      for (let i = 0; i < p.count; i++) {
        const x = restPos[i * 3], y = restPos[i * 3 + 1];
        const n = fbm3(x * 40, y * 40, 3, 3);
        const fold = Math.abs(Math.sin(x * 60)) * 0.004 + Math.abs(Math.sin(y * 70 + 1)) * 0.003;
        p.setXYZ(i, x * (1 - c * 0.45), y * (1 - c * 0.45), (n * 0.04 + fold) * c + fold * 0.15);
      }
      p.needsUpdate = true; geo.computeVertexNormals();
    }
    card.rotation.y = clamp(st.flip) * Math.PI;
  }
  return Object.assign(st, { group, update, reset });
}
