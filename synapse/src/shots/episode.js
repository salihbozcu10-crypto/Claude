// Bölüm çekim listesi: Sahne 1 → Başlık → Sahne 2 → Sahne 3 → Sahne 4 → Bitiş
import { scene1 } from './scene1.js';
import { scene2 } from './scene2.js';
import { scene3 } from './scene3.js';
import { scene4 } from './scene4.js';
import { titleCard, endCard } from './cards.js';

export function buildEpisode(ctx) {
  return [...scene1, titleCard, ...scene2, ...scene3, ...scene4, endCard];
}
