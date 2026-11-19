// Karakter kayıt defteri. Her karakterin tasarımı kendi dosyasındadır.
import * as THREE from 'three';
import { buildCharacter } from './rig.js';
import atlas from './atlas.js';
import asya from './asya.js';
import defne from './defne.js';
import shadow from './shadow.js';
export const SPECS = { atlas, asya, defne, shadow };
export function buildCast() {
  const out = {};
  for (const k in SPECS) { out[k] = buildCharacter(SPECS[k]); }
  // Defne'nin "gölgesi": aynı model, tamamen siyah (yalnızca yansımada görünür)
  const sh = buildCharacter({ ...defne, name: 'defneShadow' });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  sh.root.traverse((o) => { if (o.isMesh || o.isPoints) { o.material = black; o.castShadow = false; } });
  sh.catchlight.on = 0;
  out.defneShadow = sh;
  return out;
}
