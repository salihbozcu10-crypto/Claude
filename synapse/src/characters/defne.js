// defne — geçici tasarım (karakter ajanı dolduracak)
import { defaultOutfit } from './rig.js';
export default {
  name: 'defne',
  outfit(ctx) { defaultOutfit(ctx, {}); },
};
