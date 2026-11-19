// Başlık ve bitiş kartları
import { cam, V, smoothstep, M, S } from './helpers.js';
export const titleCard = { id: 'title', scene: 0, set: 'title', dur: 5.0, desc: 'Başlık: SYNAPSE — 1. Bölüm: Ölü Kod',
  cues: [M('mus_title', 0, -1), S('title_hit', 0.35, 0)],
  update(ctx, lt, k) {
    const s = ctx.sets.title.state; s.mode = 'title'; s.k = k; s.reveal = smoothstep(0.3, 1.1, lt) * (1 - smoothstep(4.3, 5.0, lt));
    cam(ctx, lt, { pos: V(0, 0, 5.2 - lt * 0.12), target: V(0, -0.05, 0), fov: 40 });
    Object.assign(ctx.post, { bloomStrength: 0.6, bloomThreshold: 0.85, bloomRadius: 0.6, vignette: 0.6, grain: 0.04, letterbox: 1, ca: 0.002, glitch: lt > 0.3 && lt < 0.6 ? 0.8 : (lt > 2.7 && lt < 2.8 ? 0.4 : 0) });
  } };
export const endCard = { id: 'end', scene: 5, set: 'title', dur: 4.5, desc: 'Bitiş: Devam edecek...',
  cues: [M('mus_end', 0, -2)],
  update(ctx, lt, k) {
    const s = ctx.sets.title.state; s.mode = 'end'; s.k = k; s.reveal = smoothstep(0.4, 1.3, lt) * (1 - smoothstep(3.8, 4.5, lt));
    cam(ctx, lt, { pos: V(0, 0, 5.0 - lt * 0.1), target: V(0, 0, 0), fov: 40 });
    Object.assign(ctx.post, { bloomStrength: 0.6, bloomThreshold: 0.85, vignette: 0.6, grain: 0.04, letterbox: 1 });
  } };
