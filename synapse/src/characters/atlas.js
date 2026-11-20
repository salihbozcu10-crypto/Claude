// ATLAS — 24, ekibin analitik beyni. Geçmişindeki veri sızıntısı travması onu temkinli yapmış;
// yorgun bakışlı ama sahada en mantıklı kararları o verir. Sistem tarafından aranıyor.
// Dağınık koyu saç (tepesi uzun, sağa-yukarı savrulmuş, alnına düşen birkaç tel), hafif sakal gölgesi,
// koyu antrasit teknik ceket (yüksek yaka, sırtta kapüşon, camgöbeği şerit), gri tişört, kargo, bot.
// Boynunun SOLUNDA (+x) nöral port.
//
// ch.extras.neuralPort: { glow (0..1), plugged (0..1), update(t, ch), reset(), socketWorld(out), socketNormalWorld(out) }
// ch.extras.digitalEyes: ch.face.eyeGlow ile iris üstünde parlayan devre halkaları
import * as THREE from 'three';
import { defaultOutfit } from './rig.js';
import { hairShell, hairlineFn, hairMask, angles, strandNormal, strandColor, scatterRoots, flowLock, lock, merge } from './hairkit.js';
import { clothMaterial, torsoSector, profileR, boot } from './wardrobe.js';
import { hairMaterial, charMaterial, glowMaterial } from '../engine/materials.js';
import { smoothstep, rng, fbm3, fbm1 } from '../engine/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export default {
  name: 'atlas',
  scale: 1.05,
  skin: 0xd09a74, sss: 0xff4a2e,
  head: { rx: 0.122, ry: 0.152, rz: 0.136, jaw: 0.09, chin: 0.95, cheek: 0.75, cranium: 1.03, faceFlat: 0.08 },
  face: {
    eyeX: 0.053, eyeY: -0.004, eyeR: 0.0282, eyeTilt: -0.02,
    iris: 0x8a6430, iris2: 0x3a2410, irisSize: 0.58, pupil: 0.4, sclera: 0xf1ece4,
    lashes: 0.2, lashColor: 0x120b07,
    brow: 0x1a120c, browThick: 0.0118, browLen: 1.08, browArch: 0.6, browY: 0.0, browTilt: 0.15,
    nose: 0.95, noseW: 1.0, noseY: -0.045,
    mouthY: -0.088, mouthW: 0.064, lip: 0xb06a5e, lipFull: 0.85,
    ear: 1.05, freckles: 0, blush: 0.25, stubble: 0.55, stubbleColor: 0x2c2420, underEye: 0.8,
  },
  body: { shoulderW: 0.185, chestR: 0.158, waistR: 0.125, hipR: 0.132, neckR: 0.05, neckLen: 1.1, hand: 1.06, legR: 1.12, armR: 1.1, chestZ: 0.72 },

  outfit(ctx) {
    const { bones, spec } = ctx; const B = spec.body;
    const jacket = clothMaterial(0x2c3036, { roughness: 0.72, sheen: 0.4, repeat: [14, 14] });
    const tee = clothMaterial(0x5a5e66);
    const cargo = clothMaterial(0x23262a, { repeat: [10, 10] });
    const trim = glowMaterial(0x2fd8ff, 1.6);
    const darkMat = charMaterial(0x16181c, { roughness: 0.55 });
    const parts = defaultOutfit(ctx, {
      topMat: jacket, bottomMat: cargo, sleeve: 'long',
      footwear: () => boot(charMaterial(0x24201c, { roughness: 0.55, clearcoat: 0.2 }), charMaterial(0x8e8a80, { roughness: 0.8 }), { w: 0.115, h: 0.13, l: 0.29 }),
    });
    const prof = parts.torsoProfile; const sx = parts.torsoSX, sz = parts.torsoSZ;
    // açık ceket önü: içte gri tişört paneli
    const teeP = Array.from({ length: 10 }, (_, i) => { const y = -0.18 + (i / 9) * 0.38; return [profileR(prof, y) + 0.003, y]; });
    bones.chest.add(torsoSector(teeP, -0.3, 0.6, sx, sz, tee, 12));
    // ceket kenarları (camgöbeği şeritli fermuar hattı)
    for (const side of [1, -1]) {
      const a = side * 0.31;
      const pts = Array.from({ length: 8 }, (_, i) => { const y = -0.2 + (i / 7) * 0.4; const r = profileR(prof, Math.min(y, 0.2)) + 0.006; return V(Math.sin(a) * r * sx, y, Math.cos(a) * r * sz); });
      bones.chest.add(new THREE.Mesh(lock(pts, 0.016, 0.01, { taper: 1, rootTaper: 1, segs: 14, radial: 6 }), jacket));
      const pts2 = pts.map((p) => p.clone().add(V(Math.sin(a) * 0.004, 0, Math.cos(a) * 0.006)));
      bones.chest.add(new THREE.Mesh(lock(pts2, 0.0035, 0.002, { taper: 1, rootTaper: 1, segs: 14, radial: 4 }), trim));
    }
    // yüksek yaka
    // önde/yan-önde alçalıp hafif açılır: baş öne eğildiğinde çene ve yanak yakanın içine gömülmesin
    const colG = ctx.geo.lathe([[B.neckR * 1.55, 0.18], [B.neckR * 1.5, 0.22], [B.neckR * 1.42, 0.26], [B.neckR * 1.48, 0.27]], 48, 1.15, 1.05);
    {
      const p = colG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const r = Math.hypot(x, z) || 1;
        const f = smoothstep(-0.6, 0.85, z / r), h = Math.max(0, y - 0.19) / 0.08;
        const fl = 1 + 0.2 * f * h;
        p.setXYZ(i, x * fl, y - 0.04 * f * h, z * fl);
      }
      colG.computeVertexNormals();
    }
    const collar = new THREE.Mesh(colG, jacket);
    collar.material = jacket; bones.chest.add(collar);
    // sırtta kapüşon
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), jacket);
    hood.scale.set(1.25, 0.7, 0.75); hood.position.set(0, 0.165, -0.1); hood.rotation.x = -1.1; hood.material.side = THREE.DoubleSide; bones.chest.add(hood);
    // omuz şeritleri ve kol manşetleri
    for (const s of ['l', 'r']) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.0025, 6, 24), trim); band.rotation.x = Math.PI / 2; band.position.y = -0.1; bones[s + 'Shoulder'].add(band);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 8, 22), darkMat); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.21; bones[s + 'Elbow'].add(cuff);
      const pk = new THREE.Mesh(ctx.geo.roundedBox(0.03, 0.11, 0.1, 0.01, 2), cargo); pk.position.set(s === 'l' ? 0.075 : -0.075, -0.21, 0.0); bones[s + 'Hip'].add(pk);
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.006, 6, 24), darkMat); st.rotation.x = Math.PI / 2; st.position.y = -0.26; st.scale.set(1.05, 1, 1); bones[s + 'Hip'].add(st);
    }
    // nöral port (boynun sol yanı)
    const port = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0035, 12, 28), charMaterial(0x9aa0aa, { metalness: 0.95, roughness: 0.25, sheen: 0 }));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.009, 20), new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.9 }));
    hole.position.z = -0.001;
    const glowMat = glowMaterial(0x40e8ff, 3, { transparent: true });
    const glowR = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0013, 8, 28), glowMat);
    const skinRing = new THREE.Mesh(new THREE.TorusGeometry(0.0155, 0.004, 10, 28), ctx.mats.skinPlain);
    port.add(skinRing, ring, hole, glowR);
    const nr = B.neckR;
    port.position.set(nr * 0.93, 0.115 * B.neckLen, -0.006); port.rotation.y = Math.PI / 2 - 0.15;
    bones.neck.add(port);
    const pl = new THREE.PointLight(0x40e8ff, 0, 0.25, 2); port.add(pl); pl.position.z = 0.02;
    const _q = new THREE.Quaternion();
    ctx.extras.neuralPort = {
      glow: 0.25, plugged: 0, group: port,
      reset() { this.glow = 0.25; this.plugged = 0; },
      update(t) {
        const g = this.glow * (0.85 + 0.15 * Math.sin(t * 5.2) + 0.1 * fbm1(t * 7));
        glowMat.color.setRGB(0.25 * g * 3, 0.9 * g * 3, 1.0 * g * 3); glowMat.opacity = Math.min(1, 0.2 + g);
        pl.intensity = this.glow > 0.5 ? (this.glow - 0.5) * 0.6 : 0;
      },
      socketWorld(out = V()) { return port.getWorldPosition(out); },
      socketNormalWorld(out = V()) { port.getWorldQuaternion(_q); return out.set(0, 0, 1).applyQuaternion(_q); },
    };
    // dijital gözler: iris üstünde devre halkaları
    const eyeRings = [];
    for (const s of ['l', 'r']) {
      const E = ctx.eyes[s]; const r = spec.face.eyeR;
      const m = glowMaterial(0xbff6ff, 2.4, { transparent: true, opacity: 0, depthWrite: false });
      const g = new THREE.Group();
      for (const [rr, arc, rot] of [[0.42, 1.6, 0], [0.32, 2.4, 1.2], [0.22, 1.2, 3.0], [0.5, 0.9, 4.0]]) {
        const tg = new THREE.TorusGeometry(r * rr, r * 0.018, 4, 32, arc); const tm = new THREE.Mesh(tg, m); tm.rotation.z = rot; g.add(tm);
      }
      g.position.z = r * 1.02; E.ball.add(g); eyeRings.push({ g, m });
    }
    ctx.extras.digitalEyes = {
      update(t, ch) {
        const k = ch.face.eyeGlow;
        for (const { g, m } of eyeRings) { m.opacity = Math.min(1, k * 1.2); g.visible = k > 0.01; g.rotation.z = t * 2.5; }
      },
    };
  },

  hair(ctx) {
    const { bones, headF } = ctx;
    // hl0: özgün saç çizgisi (tutam kökleri bununla seçilir → önden görünüm aynı kalır)
    // hl: kabuk için; arkada kulak gerisinden enseye (boynun kafadan çıktığı hatta) iner
    const hl0 = hairlineFn([[0, 0.56], [0.5, 0.4], [1.0, 0.16], [1.4, 0.02], [1.9, -0.3], [Math.PI, -0.5]]);
    const hl = hairlineFn([[0, 0.56], [0.5, 0.4], [1.0, 0.16], [1.4, 0.02], [1.72, -0.22], [1.88, -0.68], [2.05, -1.06], [2.4, -1.03], [Math.PI, -0.98]]);
    const mask0 = (d) => { const { el, az } = angles(d); return smoothstep(hl0(az) - 0.03, hl0(az) + 0.08, el); };
    const mask = hairMask(hl, -0.03, 0.08);
    const thick = (d) => {
      const top = smoothstep(0.1, 0.95, d.y);
      const sides = 1 - smoothstep(0.3, 0.9, Math.abs(d.x)) * (1 - top);
      const nape = 0.6 + 0.4 * smoothstep(-0.9, -0.45, d.y); // ensede incelir
      return Math.max(0.0025, ((0.006 + 0.03 * top * (0.7 + 0.3 * smoothstep(-0.5, 0.6, d.z))) * (0.5 + 0.5 * sides) + fbm3(d.x * 6, d.y * 6, d.z * 6, 2) * 0.004) * nape);
    };
    const mat = hairMaterial(0xffffff, { map: strandColor(0x120c09, 0x2e1f16, 21), normalMap: strandNormal(), roughness: 0.5 });
    mat.normalScale = new THREE.Vector2(0.15, 0.15);
    bones.face.add(new THREE.Mesh(hairShell(headF, thick, mask, { ws: 400, hs: 180 }), mat));
    const surf = (d) => headF(d).addScaledVector(d, thick(d) * smoothstep(0, 1, mask(d)));
    const R = rng(31);
    // akış: önde yukarı ve sağa (−x) savrulan, tepede arkaya, yanlarda aşağı-arkaya
    const flow = (d) => {
      const front = smoothstep(0.0, 0.6, d.z) * smoothstep(0.1, 0.6, d.y);
      const side = smoothstep(0.5, 0.9, Math.abs(d.x)) * (1 - smoothstep(0.4, 0.8, d.y));
      const f = V(-0.5 * front, 0.6 * front - 0.6 * side, -0.4 * (1 - front) - 0.2 * side);
      if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
      return f.normalize();
    };
    const geos = [];
    for (const d of scatterRoots(mask0, 46, 9, 0.5)) {
      const topK = smoothstep(0.3, 0.8, d.y);
      const len = 0.04 + 0.08 * topK + R() * 0.03;
      geos.push(flowLock(surf, d, flow, { len, steps: 10, w: 0.04 + 0.016 * topK, t: 0.011, lift: (s) => 0.002 + (0.004 + 0.006 * topK) * Math.sin(Math.PI * Math.min(1, s * 1.15)), taper: 0.18 }));
    }
    // ön perçem: yukarı kalkıp sağa dönen kalın tutamlar + alna düşen 2 tel
    for (let i = 0; i < 6; i++) {
      const root = V(0.2 - i * 0.07, 0.62, 0.75).normalize();
      const p0 = surf(root);
      const pts = [p0, p0.clone().add(V(-0.01, 0.03, 0.012)), p0.clone().add(V(-0.03 - i * 0.004, 0.055, 0.0)), p0.clone().add(V(-0.06 - i * 0.006, 0.06, -0.03))];
      geos.push(lock(pts, 0.034, 0.013, { taper: 0.1, segs: 16, radial: 8 }));
    }
    // (alın telleri: kaşa inmeden biter ve alnın üstünde yatar — önceden deriden çıkıp kaşı deliyordu)
    for (const [x, len] of [[0.03, 0.027], [0.055, 0.021]]) {
      const root = V(x, 0.6, 0.8).normalize(); const p0 = surf(root);
      const pts = [p0, p0.clone().add(V(0.004, 0.012, 0.016)), p0.clone().add(V(0.012, -len * 0.4, 0.02)), p0.clone().add(V(0.02, -len, 0.012))];
      for (const p of pts.slice(1)) p.z = Math.max(p.z, ctx.facePoint(p.x, p.y, 0.0045).z);
      geos.push(lock(pts, 0.014, 0.0065, { taper: 0.3, segs: 14, radial: 6 }));
    }
    // ense: yeni kapanan alt-arka bölgede aşağı akan kısa, dağınık tutamlar (düz kabuğu kırar)
    {
      const R2 = rng(77);
      const down = (d) => V(-0.25 * d.x, -1, 0).normalize();
      // kökler yeni saç çizgisinin epey üstünde: tutam uçları deriye taşmaz
      const deep = (q) => { const { el, az } = angles(q); return el > hl(az) + 0.3 ? 1 - mask0(q) : 0; };
      for (const d of scatterRoots(deep, 18, 13, 0.6)) {
        const len = 0.022 + R2() * 0.018;
        geos.push(flowLock(surf, d, down, { len, steps: 8, w: 0.032, t: 0.008, lift: (s) => 0.0015 + 0.003 * Math.sin(Math.PI * s), taper: 0.2 }));
      }
    }
    bones.face.add(new THREE.Mesh(merge(geos), mat));
  },
};
