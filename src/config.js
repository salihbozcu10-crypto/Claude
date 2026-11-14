// Ayarlar ve kalite ön ayarları
export const QUALITY = {
  low: { label: 'Düşük', tex: 256, scale: 0.7, maxDpr: 1, msaa: 0, shadow: 1024, shadowRange: 40, shadowEvery: 2, soldierShadow: 26, ao: false, rays: false, bloom: 3, aniso: 2, grass: 0.2, lights: 2, particles: 0.5, terrainLow: true, terrainSegs: 128, skyRays: 5 },
  medium: { label: 'Orta', tex: 512, scale: 0.85, maxDpr: 1, msaa: 2, shadow: 2048, shadowRange: 55, soldierShadow: 42, ao: true, rays: true, bloom: 4, aniso: 4, grass: 0.55, lights: 4, particles: 0.8, terrainSegs: 224, skyRays: 6 },
  high: { label: 'Yüksek', tex: 512, scale: 1, maxDpr: 1.25, msaa: 4, shadow: 4096, shadowRange: 72, soldierShadow: 60, ao: true, rays: true, bloom: 5, aniso: 8, grass: 1, lights: 6, particles: 1, terrainSegs: 256, skyRays: 8 },
  ultra: { label: 'Ultra', tex: 1024, scale: 1, maxDpr: 2, msaa: 4, shadow: 4096, shadowRange: 85, soldierShadow: 80, ao: true, rays: true, bloom: 6, aniso: 16, grass: 1.5, lights: 9, particles: 1.3, terrainSegs: 256, skyRays: 10 },
};

export const DIFFICULTY = {
  recruit: { label: 'Acemi', dmg: 0.45, aim: 1.9, react: 1.8, sight: 0.75, shooters: 2 },
  regular: { label: 'Asker', dmg: 0.65, aim: 1.4, react: 1.35, sight: 0.9, shooters: 3 },
  veteran: { label: 'Komando', dmg: 0.9, aim: 1.05, react: 1.0, sight: 1.0, shooters: 5 },
  realistic: { label: 'Gerçekçi', dmg: 1.5, aim: 0.8, react: 0.8, sight: 1.1, shooters: 9 },
};

const DEFAULTS = { quality: 'auto', difficulty: 'regular', time: 'dawn', sens: 1.0, volume: 0.8, invertY: false, fov: 72, crosshair: true, adsToggle: false };

export const isTouch = (() => { try { return (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && matchMedia('(pointer: coarse)').matches; } catch { return false; } })();

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('sv-settings') || '{}') || {}; } catch { s = {}; }
  return { ...DEFAULTS, ...s };
}
export function saveSettings(s) { try { localStorage.setItem('sv-settings', JSON.stringify(s)); } catch { /* yoksay */ } }

// Cihaza göre makul başlangıç kalitesi
export function autoQuality(renderer) {
  if (isTouch) return (Math.min(screen.width, screen.height) >= 700 && (navigator.deviceMemory || 4) >= 6) ? 'medium' : 'low';
  let name = '';
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch { /* yoksay */ }
  if (/swiftshader|llvmpipe|software/i.test(name)) return 'medium';
  if (/(rtx|radeon rx|apple m\d|geforce gtx 1[0-9]|arc)/i.test(name)) return 'high';
  if (/intel/i.test(name)) return 'medium';
  return 'high';
}
