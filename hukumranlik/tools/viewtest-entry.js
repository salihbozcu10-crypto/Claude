import { generateWorld, proj } from '../src/map/generate.js';
import { MapView } from '../src/map/view.js';
import { assignColors } from '../src/game/colors.js';
(async () => {
  const world = await generateWorld(); assignColors(world);
  const view = new MapView(document.getElementById('c'), world); view.cloudsOn = true;
  const byId = new Map(world.countries.map((c) => [c.id, c]));
  const tr = world.countries.find((c) => c.ne === 'Turkey');
  for (let p = 1; p <= world.P; p++) { const c = byId.get(world.provinces[p].country); view.setProvince(p, c.color, c.id, c === tr ? 16 : 0); }
  view.commit(); window.__view = view; window.__world = world;
  window.__shot = ({ lon, lat, px, t = 5, sel }) => { const [x, y] = proj(lon, lat); view.target.set(x, y); const fovF = 2 * Math.tan(view.camera.fov * Math.PI / 360); view.dist = view.distGoal = Math.max(view.minDist, Math.min(view.maxDist, view.sh / (fovF * px))); if (sel) { const id = view.pick(view.sw / 2, view.sh / 2); view.setFlags(id, 1); view.commit(); } view.render(0.016, t); };
  window.__ready = true;
})();
