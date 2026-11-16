// Karakter kayıt defteri. Her karakterin tasarımı kendi dosyasındadır.
import { buildCharacter } from './rig.js';
import atlas from './atlas.js';
import asya from './asya.js';
import defne from './defne.js';
import shadow from './shadow.js';
export const SPECS = { atlas, asya, defne, shadow };
export function buildCast() {
  const out = {};
  for (const k in SPECS) out[k] = buildCharacter(SPECS[k]);
  return out;
}
