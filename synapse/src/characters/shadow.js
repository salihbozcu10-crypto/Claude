// "4. KİŞİ" — uzun, kapüşonlu siluet. Neredeyse tamamen siyah; yalnızca soğuk bir kenar ışığı
// ve kapüşon karanlığında iki soluk parıltı. Yansımalarda ürkütücü bir siluet olarak okunur.
import * as THREE from 'three';
import { defaultOutfit } from './rig.js';
import { charMaterial, glowMaterial } from '../engine/materials.js';

export default {
  name: 'shadow',
  scale: 1.1,
  skin: 0x050506,
  face: { blush: 0, freckles: 0 },
  body: { shoulderW: 0.19, chestR: 0.16, waistR: 0.13, hipR: 0.14, neckR: 0.045, legR: 1.1, armR: 1.1 },
  outfit(ctx) {
    const { bones, geo } = ctx;
    const black = charMaterial(0x040405, { roughness: 0.9, sheen: 0.2, sheenColor: 0x203040, rim: 2.2 });
    defaultOutfit(ctx, { topMat: black, bottomMat: black, shoeMat: black, sole: 0x060606, sleeve: 'long' });
    // uzun palto: göğüsten diz altına
    const coat = new THREE.Mesh(geo.lathe([[0.2, -0.95], [0.19, -0.6], [0.165, -0.3], [0.15, -0.05], [0.16, 0.08], [0.17, 0.16], [0.12, 0.2], [0.06, 0.22]], 40, 1.15, 0.8), black);
    bones.chest.add(coat);
    // kapüşon
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.165, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.78), black);
    hood.material = black; hood.scale.set(1.0, 1.12, 1.08); hood.position.set(0, 0.02, -0.02); hood.rotation.x = -0.55;
    bones.face.add(hood);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    inner.position.set(0, -0.005, 0.0); bones.face.add(inner);
    for (const sx of [1, -1]) {
      const g = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 12), glowMaterial(0x9fd8ff, 1.2, { transparent: true, opacity: 0.55 }));
      g.position.set(sx * 0.04, -0.005, 0.152); g.name = 'glint'; bones.face.add(g);
    }
    ctx.extras.shadowHide = { hood, inner };
  },
  hair(ctx) {
    // yüz ayrıntılarını gizle: yalnızca kapüşon, iç karanlık ve parıltılar kalsın
    const keep = new Set([ctx.extras.shadowHide.hood, ctx.extras.shadowHide.inner]);
    for (const c of ctx.bones.face.children) if (!keep.has(c) && c.name !== 'glint') c.visible = false;
    delete ctx.extras.shadowHide;
    for (const s of ['l', 'r']) ctx.hands[s].root.traverse((o) => { if (o.isMesh) o.material = ctx.mats.skinPlain; });
  },
};
