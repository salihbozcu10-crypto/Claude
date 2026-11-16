// Poz kütüphanesi. Alanların anlamı için rig.js başındaki açıklamaya bakın.
// Pozlar kısmidir: yalnızca verilen alanlar uygulanır (setPose: karışım, mixPose: ekleme).

export const HANDS = {
  // [başparmak, işaret, orta, yüzük, serçe] — 0 açık, 1 tam kıvrık
  relaxed: [0.25, 0.22, 0.3, 0.36, 0.42],
  fist: [0.85, 1, 1, 1, 1],
  point: [0.65, 0, 1, 1, 1],
  open: [0, 0.02, 0, 0.02, 0.05],
  spread: [-0.1, -0.08, -0.04, -0.04, -0.06],
  grip: [0.6, 0.72, 0.8, 0.86, 0.92],
  gripLoose: [0.45, 0.5, 0.58, 0.64, 0.7],
  pinch: [0.65, 0.62, 0.35, 0.45, 0.55],
  claw: [0.5, 0.55, 0.6, 0.62, 0.66],
  type: [0.3, 0.38, 0.42, 0.45, 0.5],
};

export function neutralPose() {
  return {
    hips: { y: 0, x: 0, z: 0, rot: [0, 0, 0] },
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    lShoulder: [0.03, 0.06, 0], rShoulder: [0.03, 0.06, 0],
    lElbow: [0.18, 0], rElbow: [0.18, 0],
    lWrist: [0.05, 0, 0], rWrist: [0.05, 0, 0],
    lHip: [0, 0.02, 0], rHip: [0, 0.02, 0],
    lKnee: 0.03, rKnee: 0.03, lAnkle: 0, rAnkle: 0,
    lHand: 'relaxed', rHand: 'relaxed',
  };
}

const HANDKEYS = new Set(['lHand', 'rHand']);
export function blendPose(base, p, w = 1, additive = false) {
  const o = clonePose(base);
  for (const k in p) {
    const v = p[k];
    if (HANDKEYS.has(k)) {
      if (additive) { if (w >= 0.5) o[k] = v; continue; }
      const a = typeof o[k] === 'string' ? HANDS[o[k]] : o[k];
      const b = typeof v === 'string' ? HANDS[v] : v;
      o[k] = a.map((x, i) => x + (b[i] - x) * w);
      continue;
    }
    if (k === 'hips') {
      for (const hk of ['y', 'x', 'z']) if (v[hk] !== undefined) o.hips[hk] = additive ? o.hips[hk] + v[hk] * w : o.hips[hk] + (v[hk] - o.hips[hk]) * w;
      if (v.rot) o.hips.rot = o.hips.rot.map((x, i) => (additive ? x + (v.rot[i] || 0) * w : x + ((v.rot[i] || 0) - x) * w));
      continue;
    }
    if (Array.isArray(v)) o[k] = o[k].map((x, i) => (v[i] === undefined ? x : additive ? x + v[i] * w : x + (v[i] - x) * w));
    else if (typeof v === 'number') o[k] = additive ? o[k] + v * w : o[k] + (v - o[k]) * w;
  }
  return o;
}
export function clonePose(p) {
  const o = {};
  for (const k in p) o[k] = Array.isArray(p[k]) ? p[k].slice() : typeof p[k] === 'object' ? { ...p[k], rot: p[k].rot.slice() } : p[k];
  return o;
}
// sol/sağ aynala
export function mirrorPose(p) {
  const o = {};
  for (const k in p) {
    let nk = k;
    if (k[0] === 'l' && k[1] === k[1].toUpperCase()) nk = 'r' + k.slice(1);
    else if (k[0] === 'r' && k[1] === k[1].toUpperCase()) nk = 'l' + k.slice(1);
    let v = p[k];
    if (['spine', 'chest', 'neck', 'head'].includes(k)) v = [v[0], -v[1], -v[2]];
    if (k === 'hips') v = { ...v, rot: v.rot ? [v.rot[0], -v.rot[1], -v.rot[2]] : undefined, x: v.x !== undefined ? -v.x : undefined };
    o[nk] = Array.isArray(v) ? v.slice() : v;
  }
  return o;
}

export const POSES = {
  stand: {},
  alert: { spine: [0.06, 0, 0], chest: [0.04, 0, 0], lShoulder: [0.15, 0.12, 0], rShoulder: [0.15, 0.12, 0], lElbow: [0.45], rElbow: [0.45], lKnee: 0.12, rKnee: 0.12, hips: { y: -0.012 }, lHand: 'gripLoose', rHand: 'gripLoose' },
  // sağ elde el feneri, göğüs hizasında ileri
  holdFlashlight: { rShoulder: [0.95, 0.12, 0.25], rElbow: [0.75, 0], rWrist: [-0.15, 0, 0], rHand: 'grip', lShoulder: [0.2, 0.1, 0], lElbow: [0.5] },
  // iki elle şok tabancası nişanı
  aimPistol: { spine: [0.05, 0, 0], chest: [0.02, 0.15, 0], rShoulder: [1.42, -0.08, 0.15], rElbow: [0.12, 0], rWrist: [0.05, 0, 0], rHand: 'grip', lShoulder: [1.25, -0.35, 0.45], lElbow: [0.55, 0], lWrist: [0.2, -0.2, 0], lHand: 'grip', head: [0.08, 0, 0], lKnee: 0.15, rKnee: 0.15, hips: { y: -0.015 } },
  // tabanca aşağıda, hazır
  lowReady: { rShoulder: [0.55, 0.0, 0.2], rElbow: [0.6, 0], rHand: 'grip', lShoulder: [0.4, -0.1, 0.3], lElbow: [0.9, 0], lHand: 'gripLoose', spine: [0.05, 0, 0] },
  // iki elle tablet, göğüs önünde
  holdTablet: { rShoulder: [0.3, 0.1, 0.2], rElbow: [1.45, 0], rWrist: [-0.15, 0, 0.0], rHand: 'gripLoose', lShoulder: [0.3, 0.1, 0.2], lElbow: [1.45, 0], lWrist: [-0.15, 0, 0], lHand: 'gripLoose', head: [0.3, 0, 0], neck: [0.1, 0, 0] },
  // tek elle tablet (sol) + sağ elle dokunma
  tabletTouch: { lShoulder: [0.3, 0.12, 0.25], lElbow: [1.5, 0], lWrist: [-0.1, 0, 0], lHand: 'gripLoose', rShoulder: [0.42, -0.05, 0.35], rElbow: [1.35, 0], rWrist: [0.2, 0, 0], rHand: 'point', head: [0.32, 0, 0], neck: [0.1, 0, 0] },
  // klavyede yazma (masa ~0.78 m)
  typing: { spine: [0.14, 0, 0], chest: [0.06, 0, 0], neck: [0.05, 0, 0], head: [0.12, 0, 0], lShoulder: [0.72, 0.12, 0.3], rShoulder: [0.72, 0.12, 0.3], lElbow: [1.0, 0], rElbow: [1.0, 0], lWrist: [-0.3, 0, 0], rWrist: [-0.3, 0, 0], lHand: 'type', rHand: 'type' },
  // ileri uzanma (ekrana dokunma isteği)
  reachForward: { spine: [0.1, 0, 0], chest: [0.06, 0, 0], rShoulder: [1.25, 0.05, 0.1], rElbow: [0.25, 0], rWrist: [0.1, 0, 0], rHand: 'open' },
  // engelleme: kolu yana açıp "dur" işareti
  stopArm: { lShoulder: [1.15, 0.45, -0.2], lElbow: [0.35, 0], lWrist: [-0.9, 0, 0], lHand: 'open', chest: [0, -0.15, 0] },
  pointing: { rShoulder: [1.35, 0.15, 0], rElbow: [0.08, 0], rWrist: [0.05, 0, 0], rHand: 'point' },
  // masaya yumruk
  slamTable: { spine: [0.28, 0, 0], chest: [0.1, -0.1, 0], rShoulder: [0.55, 0.15, 0.1], rElbow: [0.55, 0], rWrist: [0.1, 0, 0], rHand: 'fist', lShoulder: [0.3, 0.2, 0], lElbow: [0.6], head: [-0.05, 0, 0] },
  handsOnHips: { lShoulder: [-0.1, 0.5, -0.4], rShoulder: [-0.1, 0.5, -0.4], lElbow: [1.55, 0], rElbow: [1.55, 0], lWrist: [0.3, 0.3, 0], rWrist: [0.3, 0.3, 0], lHand: 'open', rHand: 'open' },
  armsCrossed: { lShoulder: [0.5, -0.05, 0.75], rShoulder: [0.55, -0.05, 0.75], lElbow: [1.95, 0], rElbow: [1.85, 0], lHand: 'relaxed', rHand: 'relaxed' },
  // çömelme
  crouch: { hips: { y: -0.3, rot: [0.1, 0, 0] }, spine: [0.25, 0, 0], lHip: [1.35, 0.15, 0], rHip: [1.35, 0.15, 0], lKnee: 2.2, rKnee: 2.2, lAnkle: 0.85, rAnkle: 0.85 },
  // tek dizüstü (sağ diz yerde)
  kneel: { hips: { y: -0.43, rot: [0, 0, 0] }, spine: [0.15, 0, 0], lHip: [1.45, 0.1, 0], lKnee: 1.5, lAnkle: 0.05, rHip: [-0.05, 0.06, 0], rKnee: 1.62, rAnkle: -0.75 },
  // yere oturmuş, sırtı hafif geride
  sitFloor: { hips: { y: -0.8, rot: [-0.15, 0, 0] }, spine: [0.15, 0, 0], lHip: [1.35, 0.15, 0], rHip: [1.35, 0.15, 0], lKnee: 1.0, rKnee: 0.7, lAnkle: 0.1, rAnkle: 0.1, lShoulder: [0.2, 0.25, 0], rShoulder: [0.2, 0.25, 0], lElbow: [0.3], rElbow: [0.3], lHand: 'open', rHand: 'open' },
  // boynun sol tarafına sağ elle kablo takma
  plugNeck: { head: [0.05, -0.35, -0.3], neck: [0, -0.1, -0.15], rShoulder: [1.05, -0.35, 0.55], rElbow: [2.05, 0], rWrist: [0.3, -0.3, 0], rHand: 'pinch', lShoulder: [0.25, 0.25, 0], lElbow: [0.6], lHand: 'fist' },
  // acıyla kasılma
  brace: { spine: [0.18, 0, 0], chest: [0.1, 0, 0], head: [-0.25, 0, 0], lShoulder: [0.3, 0.35, 0], rShoulder: [0.3, 0.35, 0], lElbow: [1.2], rElbow: [1.2], lHand: 'claw', rHand: 'claw', lKnee: 0.25, rKnee: 0.25, hips: { y: -0.03 } },
  // koşu duruşu (walk({run:1}) ile birlikte)
  run: { spine: [0.15, 0, 0], lElbow: [1.3], rElbow: [1.3], lHand: 'fist', rHand: 'fist' },
  // kapıyı iterek tutma (iki el ileri, omuz)
  pushDoor: { spine: [0.3, 0, 0], chest: [0.1, 0.25, 0], lShoulder: [1.35, 0.15, 0.1], rShoulder: [1.2, 0.3, 0.1], lElbow: [0.6], rElbow: [0.7], lWrist: [-1.0, 0, 0], rWrist: [-1.0, 0, 0], lHand: 'open', rHand: 'open', lHip: [0.35, 0.05, 0], rHip: [-0.35, 0.05, 0], lKnee: 0.5, rKnee: 0.1, hips: { y: -0.05 } },
  // korku: eller göğüse
  handsToChest: { lShoulder: [0.55, -0.1, 0.55], rShoulder: [0.55, -0.1, 0.55], lElbow: [2.0], rElbow: [2.0], lHand: 'claw', rHand: 'claw', spine: [-0.05, 0, 0] },
  // kağıdı iki elle tutup bakma
  holdPaper: { lShoulder: [0.4, 0.05, 0.35], rShoulder: [0.4, 0.05, 0.35], lElbow: [1.65], rElbow: [1.65], lWrist: [-0.2, 0, 0], rWrist: [-0.2, 0, 0], lHand: 'pinch', rHand: 'pinch', head: [0.3, 0, 0], neck: [0.1, 0, 0] },
  // el sallama (sağ el yukarı) — gölge için
  wave: { rShoulder: [0.4, 1.4, 0], rElbow: [1.2, 0], rWrist: [0, 0, 0], rHand: 'open' },
};
