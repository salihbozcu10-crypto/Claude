// Bölüm çekim listesi (geçici).
import * as THREE from 'three';
export function buildEpisode(ctx) {
  return [{ id: 'test', scene: 0, set: 'serverRoom', dur: 5, update(c, lt) {
    const a = c.chars.atlas; a.root.visible = true; a.place(0, 0, 0);
    c.camera.position.set(1, 1.5, 3); c.camera.lookAt(0, 1.2, 0);
  } }];
}
