// Jenerik / başlık kartı "seti": karanlık boşlukta parlayan sinir ağı + SYNAPSE logosu.
// Kontroller: mode 'title' | 'end', k (0..1 çekim ilerlemesi), reveal 0..1
import * as THREE from 'three';
import { glowMaterial, canvasTexture } from '../engine/materials.js';
import { rng, clamp, smoothstep } from '../engine/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function textTex(lines, w = 2048, h = 512) {
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const L of lines) {
      g.font = L.font; g.fillStyle = L.color || '#fff';
      // ölç: harf aralığı ve parıltı payıyla birlikte tuvale sığmıyorsa yazıyı küçült
      // (önceden "DEVAM EDECEK..." 2048 px tuvalden taşıyor, D ve son nokta kesiliyordu)
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      const sp = parseFloat(L.spacing || '0') || 0;
      const tw = g.measureText(L.text).width + sp * L.text.length;
      const pad = (L.blur || 0) * 1.5 + 0.03 * w;
      const k = Math.min(1, (w - 2 * pad) / Math.max(1, tw));
      if (L.spacing && 'letterSpacing' in g) g.letterSpacing = L.spacing;
      g.shadowColor = L.glow || 'transparent'; g.shadowBlur = L.blur || 0;
      g.save(); g.translate(w / 2 + sp * 0.5 * k, L.y * h); g.scale(k, k); g.fillText(L.text, 0, 0); g.restore();
    }
  });
}

export function createTitle() {
  const group = new THREE.Group(); group.name = 'title';
  const R = rng(777);
  // sinir ağı düğümleri ve bağlantıları
  const N = 140; const nodes = [];
  for (let i = 0; i < N; i++) { const r = 2 + R() * 6; const a = R() * Math.PI * 2, b = (R() - 0.5) * 1.6; nodes.push(V(Math.cos(a) * r, Math.sin(b) * r * 0.6, Math.sin(a) * r - 4)); }
  const linePos = []; const lineCol = [];
  const cA = new THREE.Color(0x30d8ff), cB = new THREE.Color(0xff3cc8);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const d = nodes[i].distanceTo(nodes[j]); if (d < 1.8 && R() < 0.45) { linePos.push(...nodes[i].toArray(), ...nodes[j].toArray()); const c = cA.clone().lerp(cB, R()); lineCol.push(c.r, c.g, c.b, c.r, c.g, c.b); } }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const net = new THREE.Group(); net.add(new THREE.LineSegments(lg, lineMat));
  const sprite = canvasTexture(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(nodes.flatMap((n) => n.toArray()), 3));
  const pm = new THREE.PointsMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(3), size: 0.18, map: sprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  net.add(new THREE.Points(pg, pm));
  group.add(net);
  // sinyal darbeleri (ağ üzerinde gezen parlak noktalar)
  const pulses = []; const pulseGeo = new THREE.BufferGeometry(); const NP = 40; const pp = new Float32Array(NP * 3); pulseGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  for (let i = 0; i < NP; i++) { const k = Math.floor(R() * (linePos.length / 6)); pulses.push({ k, sp: 0.3 + R() * 0.8, ph: R() }); }
  const pulsePts = new THREE.Points(pulseGeo, new THREE.PointsMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(4), size: 0.12, map: sprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  net.add(pulsePts);
  // logo
  const logoTex = textTex([{ text: 'SYNAPSE', font: '900 300px "DejaVu Sans", sans-serif', y: 0.5, color: '#ffffff', glow: '#40e0ff', blur: 40, spacing: '40px' }]);
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false, color: new THREE.Color(0xc8f6ff).multiplyScalar(0.75), blending: THREE.AdditiveBlending });
  // (katman yoğunlukları: üç eklemeli katmanın toplamı bloom eşiğinin altında kalır; önceden harfler
  //  beyaza kırpılıp büyük bir bloom lekesine dönüşüyordu)
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), logoMat); logo.position.set(0, 0.15, 0); group.add(logo);
  const logoR = logo.clone(); logoR.material = logoMat.clone(); logoR.material.color = new THREE.Color(0xff2a6a).multiplyScalar(0.5); group.add(logoR);
  const logoB = logo.clone(); logoB.material = logoMat.clone(); logoB.material.color = new THREE.Color(0x2a6aff).multiplyScalar(0.5); group.add(logoB);
  const subTex = textTex([{ text: '1. BÖLÜM  ·  ÖLÜ KOD', font: '600 120px "DejaVu Sans", sans-serif', y: 0.5, color: '#ffd84a', glow: '#ffb020', blur: 18, spacing: '18px' }], 2048, 256);
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.4), new THREE.MeshBasicMaterial({ map: subTex, transparent: true, depthWrite: false, color: new THREE.Color(0xffffff).multiplyScalar(1.0) })); sub.position.set(0, -0.62, 0); group.add(sub);
  const endTex = textTex([{ text: 'DEVAM EDECEK...', font: 'italic 700 200px "DejaVu Sans", sans-serif', y: 0.5, color: '#ffffff', glow: '#ff3cc8', blur: 30, spacing: '20px' }], 3072, 512);
  const endM = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), new THREE.MeshBasicMaterial({ map: endTex, transparent: true, depthWrite: false, color: new THREE.Color(0xffffff).multiplyScalar(0.8) })); endM.position.set(0, 0.1, 0); group.add(endM);
  const smallTex = textTex([{ text: 'SYNAPSE', font: '900 200px "DejaVu Sans", sans-serif', y: 0.5, color: '#9ff0ff', glow: '#40e0ff', blur: 20, spacing: '30px' }], 2048, 512);
  const small = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: smallTex, transparent: true, depthWrite: false, color: new THREE.Color(0xffffff).multiplyScalar(1.2) })); small.position.set(0, -0.75, 0); group.add(small);

  const state = {}; const reset = () => Object.assign(state, { mode: 'title', k: 0, reveal: 0 }); reset();
  function update(t, ctx) {
    ctx.scene.fog = null; ctx.scene.background = new THREE.Color(0x020306);
    net.rotation.y = t * 0.05; net.rotation.x = Math.sin(t * 0.1) * 0.1;
    const segN = linePos.length / 6;
    pulses.forEach((p, i) => { const k = p.k % segN; const f = (t * p.sp + p.ph) % 1; for (let c = 0; c < 3; c++) pp[i * 3 + c] = linePos[k * 6 + c] + (linePos[k * 6 + 3 + c] - linePos[k * 6 + c]) * f; });
    pulseGeo.attributes.position.needsUpdate = true;
    const r = state.reveal; const isT = state.mode === 'title';
    logo.visible = logoR.visible = logoB.visible = sub.visible = isT; endM.visible = small.visible = !isT;
    if (isT) {
      const gl = (Math.sin(t * 37) > 0.7 || r < 0.3) ? (1 - r) * 0.06 + 0.012 : 0.006;
      logo.material.opacity = r; logoR.material.opacity = r * 0.55; logoB.material.opacity = r * 0.55;
      logoR.position.set(gl, 0.15, -0.01); logoB.position.set(-gl, 0.15, -0.01);
      const sc = 1 + (1 - r) * 0.08 + state.k * 0.04; logo.scale.setScalar(sc); logoR.scale.setScalar(sc); logoB.scale.setScalar(sc);
      sub.material.opacity = smoothstep(0.35, 0.75, state.k) * r;
    } else {
      endM.material.opacity = r; small.material.opacity = r * smoothstep(0.3, 0.7, state.k);
    }
    lineMat.opacity = 0.35 + 0.25 * r;
  }
  return { group, update, reset, state, anchors: {}, previewCams: [{ pos: [0, 0, 5], target: [0, 0, 0], fov: 40 }] };
}
