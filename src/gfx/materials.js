// Malzeme kütüphanesi: PBR yüzeyler ve gölgelendirici yamaları
//  - gökyüzü görünürlüğü (iç mekânlarda ortam ışığını keser)
//  - duvar diplerinde kir / üstte akıntı izi
//  - silah (viewmodel) için ayrı izdüşüm
//  - bitkilerde rüzgâr salınımı
import * as THREE from 'three';

export const globalUniforms = {
  uTime: { value: 0 },
  uVmProj: { value: new THREE.Matrix4() },
  uWind: { value: 1 },
};

// Mermi çarpma tepkisi ve ses için yüzey türleri
export const SURF = { concrete: 0, metal: 1, wood: 2, dirt: 3, sand: 4, fabric: 5, glass: 6, rock: 7, flesh: 8, rubber: 9 };
export const SURF_NAMES = ['concrete', 'metal', 'wood', 'dirt', 'sand', 'fabric', 'glass', 'rock', 'flesh', 'rubber'];
// Delinebilirlik: 5.56 için metre cinsinden en çok geçilebilir kalınlık
export const SURF_PEN = [0.0, 0.035, 0.16, 0.0, 0.0, 0.5, 0.05, 0.0, 0.3, 0.1];

export function patch(mat, o = {}) {
  const key = `p|${o.sky || ''}|${o.grime ? 1 : 0}|${o.vm ? 1 : 0}|${o.wind ? 1 : 0}`;
  mat.userData.skyVis = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSkyVis = mat.userData.skyVis;
    sh.uniforms.uTime = globalUniforms.uTime; sh.uniforms.uVmProj = globalUniforms.uVmProj; sh.uniforms.uWind = globalUniforms.uWind;
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    let vpars = '', vmain = '', fpars = 'uniform float uSkyVis;\n', fsky = '';
    if (o.sky === 'attr') {
      vpars += 'attribute float skyVis; varying float vSkyVis;\n'; vmain += 'vSkyVis = skyVis;\n';
      fpars += 'varying float vSkyVis;\n'; fsky = 'float skyOcc = vSkyVis * uSkyVis;';
    } else fsky = 'float skyOcc = uSkyVis;';
    if (o.grime) {
      vpars += 'attribute vec2 aHt; varying vec2 vHt;\n'; vmain += 'vHt = aHt;\n'; fpars += 'varying vec2 vHt;\n';
      fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          float gN = texture2D(map, vMapUv * 0.31 + 0.37).g + texture2D(map, vMapUv * 0.083).r - 1.0;
        #else
          float gN = 0.0;
        #endif
        float gLow = 1.0 - smoothstep(0.0, 0.7 + gN * 1.3, vHt.x);
        float gTop = smoothstep(vHt.y - 0.55 - gN * 0.9, vHt.y, vHt.x) * step(1.2, vHt.y) * step(vHt.y, 50.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66, 0.56, 0.43) + vec3(0.035, 0.028, 0.02), gLow * 0.7 * step(vHt.y, 50.0));
        diffuseColor.rgb *= 1.0 - gTop * 0.34;`);
    }
    if (o.wind) {
      vpars += 'uniform float uTime; uniform float uWind;\n';
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wPos0 = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 wPos0 = vec3(0.0);
        #endif
        float wPh = uTime * 1.6 + wPos0.x * 0.31 + wPos0.z * 0.27;
        float wAmp = position.y * position.y * ${(o.wind).toFixed(3)} * uWind;
        transformed.x += (sin(wPh) + 0.5 * sin(wPh * 2.3 + 1.7)) * wAmp;
        transformed.z += (cos(wPh * 0.8) * 0.6) * wAmp;`);
    }
    if (o.vm) {
      vpars += 'uniform mat4 uVmProj;\n';
      vs = vs.replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = uVmProj * mvPosition;
        gl_Position.z = 0.75 * gl_Position.z - 0.25 * gl_Position.w;`);
    }
    vs = vs.replace('#include <common>', '#include <common>\n' + vpars).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vmain);
    fs = fs.replace('#include <common>', '#include <common>\n' + fpars)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        ${fsky}
        reflectedLight.indirectDiffuse *= skyOcc;
        reflectedLight.indirectSpecular *= skyOcc;`);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function setRepeat(set, tileMeters) {
  for (const k of ['map', 'normalMap', 'ormMap']) if (set[k]) set[k].repeat.set(1 / tileMeters, 1 / tileMeters);
}

function pbr(set, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, aoMap: set.ormMap, roughnessMap: set.ormMap, metalnessMap: set.ormMap,
    roughness: o.roughness ?? 1, metalness: o.metalness ?? 1, color: o.color ?? 0xffffff,
    side: o.side ?? THREE.FrontSide, envMapIntensity: o.env ?? 1, vertexColors: !!o.vc,
  });
  if (o.normalScale != null) m.normalScale.set(o.normalScale, o.normalScale);
  m.userData.surface = o.surface ?? SURF.concrete;
  return m;
}

export function createMaterials(T) {
  // Doku döşeme ölçekleri (metre / döşeme)
  setRepeat(T.concrete, 3.2); setRepeat(T.plaster, 3.6); setRepeat(T.cmu, 1.6); setRepeat(T.floor, 3.0);
  setRepeat(T.corrugated, 1.0); setRepeat(T.container, 1.7); setRepeat(T.galvanized, 1.2); setRepeat(T.paint, 1.6);
  setRepeat(T.gunmetal, 0.6); setRepeat(T.steel, 0.6); setRepeat(T.polymerTan, 0.25); setRepeat(T.polymer, 0.25); setRepeat(T.wood, 0.72); setRepeat(T.woodOld, 0.9);
  setRepeat(T.burlap, 0.5); setRepeat(T.canvas, 0.9); setRepeat(T.camo, 0.5); setRepeat(T.cloth, 0.45);
  setRepeat(T.tire, 0.5); setRepeat(T.rust, 1.4); setRepeat(T.rock, 3.0); setRepeat(T.gravel, 1.4); setRepeat(T.dirt, 3.0); setRepeat(T.sand, 4.0);

  const S = (m, grime = false) => patch(m, { sky: 'attr', grime });
  const M = {};
  const c = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  // Yalnızca rengi farklı olan malzemeler köşe rengiyle tek malzemede birleşir (daha az çizim çağrısı)
  const tint = (base, color) => ({ isTint: true, base, color, userData: base.userData });
  M.concrete = S(pbr(T.concrete, { surface: SURF.concrete, vc: true }), true);
  M.concreteDark = tint(M.concrete, c(0.7, 0.68, 0.66));
  M.plasterBase = S(pbr(T.plaster, { surface: SURF.concrete, vc: true }), true);
  M.plaster = tint(M.plasterBase, c(0.9, 0.86, 0.78)); M.plasterOchre = tint(M.plasterBase, c(0.84, 0.7, 0.5));
  M.plasterGrey = tint(M.plasterBase, c(0.68, 0.7, 0.68)); M.plasterIn = tint(M.plasterBase, c(0.78, 0.76, 0.68));
  M.cmu = S(pbr(T.cmu, { surface: SURF.concrete }), true);
  M.floor = S(pbr(T.floor, { surface: SURF.concrete }));
  M.corrugated = S(pbr(T.corrugated, { surface: SURF.metal, vc: true }), true);
  M.roofMetal = tint(M.corrugated, c(0.56, 0.42, 0.36)); M.wallMetal = tint(M.corrugated, c(0.6, 0.64, 0.6)); M.wallMetalGreen = tint(M.corrugated, c(0.4, 0.47, 0.38));
  M.container = S(pbr(T.container, { surface: SURF.metal, vc: true }), true);
  M.contRed = tint(M.container, c(0.58, 0.2, 0.15)); M.contBlue = tint(M.container, c(0.2, 0.33, 0.48)); M.contGreen = tint(M.container, c(0.26, 0.4, 0.3)); M.contTan = tint(M.container, c(0.66, 0.56, 0.38));
  M.galvanized = S(pbr(T.galvanized, { surface: SURF.metal }));
  M.paint = S(pbr(T.paint, { surface: SURF.metal, vc: true }), true);
  M.paintOlive = tint(M.paint, c(0.33, 0.36, 0.24)); M.paintTan = tint(M.paint, c(0.66, 0.57, 0.4)); M.paintWhite = tint(M.paint, c(0.82, 0.82, 0.78));
  M.paintRed = tint(M.paint, c(0.6, 0.14, 0.1)); M.paintBlue = tint(M.paint, c(0.16, 0.26, 0.42)); M.paintYellow = tint(M.paint, c(0.78, 0.6, 0.12)); M.paintDark = tint(M.paint, c(0.16, 0.17, 0.17));
  M.steel = S(pbr(T.steel, { surface: SURF.metal }));
  M.gunmetal = S(pbr(T.gunmetal, { surface: SURF.metal }));
  M.black = S(pbr(T.polymer, { surface: SURF.rubber }));
  M.wood = S(pbr(T.wood, { surface: SURF.wood }));
  M.woodOld = S(pbr(T.woodOld, { surface: SURF.wood, vc: true }), true);
  M.woodDark = tint(M.woodOld, c(0.55, 0.47, 0.4)); M.bark = tint(M.woodOld, c(0.5, 0.42, 0.36));
  M.burlap = S(pbr(T.burlap, { surface: SURF.sand, vc: true }), true);
  M.hesco = tint(M.burlap, c(0.8, 0.78, 0.72));
  M.canvas = S(pbr(T.canvas, { surface: SURF.fabric, side: THREE.DoubleSide, vc: true }));
  M.canvasOlive = tint(M.canvas, c(0.36, 0.38, 0.27)); M.canvasTan = tint(M.canvas, c(0.66, 0.58, 0.44)); M.canvasBlue = tint(M.canvas, c(0.22, 0.34, 0.5));
  M.mattress = S(pbr(T.canvas, { surface: SURF.fabric, color: c(0.6, 0.58, 0.5) }));
  M.tire = S(pbr(T.tire, { surface: SURF.rubber }));
  M.rust = S(pbr(T.rust, { surface: SURF.metal }));
  M.rock = S(pbr(T.rock, { surface: SURF.rock }));
  M.crateAmmo = S(new THREE.MeshStandardMaterial({ map: T.crateAmmo, roughness: 0.82, metalness: 0 })); M.crateAmmo.userData.surface = SURF.wood;
  M.crateWood = S(new THREE.MeshStandardMaterial({ map: T.crateWood, roughness: 0.85, metalness: 0 })); M.crateWood.userData.surface = SURF.wood;
  M.crateExpl = S(new THREE.MeshStandardMaterial({ map: T.crateExpl, roughness: 0.82, metalness: 0 })); M.crateExpl.userData.surface = SURF.wood;
  M.glass = S(new THREE.MeshStandardMaterial({ color: c(0.5, 0.56, 0.56), roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.34, depthWrite: false }));
  M.glass.userData.surface = SURF.glass;
  M.screenOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.95, 1.6) }); M.screenOn.userData.surface = SURF.glass;
  M.bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6.2, 3.2) }); M.bulb.userData.surface = SURF.glass;
  M.bulbOff = S(new THREE.MeshStandardMaterial({ color: c(0.8, 0.8, 0.76), roughness: 0.3 })); M.bulbOff.userData.surface = SURF.glass;
  M.redLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 0.35, 0.2) }); M.redLight.userData.surface = SURF.glass;
  M.skin = S(new THREE.MeshStandardMaterial({ color: c(0.72, 0.52, 0.4), roughness: 0.62 })); M.skin.userData.surface = SURF.flesh;

  // Bitki örtüsü (alfa kesmeli kartlar)
  const fol = (wind) => {
    const m = new THREE.MeshStandardMaterial({ map: T.foliage, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
    m.userData.surface = SURF.fabric; m.alphaToCoverage = true;
    return patch(m, { wind });
  };
  M.grass = fol(0.09); M.bush = fol(0.035); M.leaves = fol(0.012);
  M.camoNet = patch(new THREE.MeshStandardMaterial({ map: T.foliage, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95, color: c(0.9, 0.9, 0.82) }), { wind: 0.0001 });
  M.camoNet.userData.surface = SURF.fabric; M.camoNet.alphaToCoverage = true;

  // Hareketli nesneler için (özniteliksiz, tekdüze gökyüzü görünürlüğü)
  M.dyn = {
    olive: patch(pbr(T.paint, { surface: SURF.metal, color: c(0.24, 0.27, 0.19) }), {}),
    dark: patch(pbr(T.gunmetal, { surface: SURF.metal }), {}),
    glass: patch(new THREE.MeshStandardMaterial({ color: c(0.1, 0.13, 0.14), roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.72 }), {}),
    black: patch(pbr(T.polymer, { surface: SURF.rubber }), {}),
    brass: patch(new THREE.MeshStandardMaterial({ color: c(0.78, 0.6, 0.28), roughness: 0.32, metalness: 1.0 }), {}),
    grenade: patch(pbr(T.paint, { surface: SURF.metal, color: c(0.2, 0.25, 0.17) }), {}),
    wood: patch(pbr(T.wood, { surface: SURF.wood, color: c(0.75, 0.6, 0.5) }), {}),
  };
  return M;
}

// Silah / kol (birinci şahıs) malzemeleri: özel izdüşümle, duvarlara girmeden çizilir
export function createViewmodelMaterials(T) {
  const c = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  const V = (m) => patch(m, { vm: true });
  const clone = (set, rep) => { const o = {}; for (const k of ['map', 'normalMap', 'ormMap']) { o[k] = set[k].clone(); o[k].repeat.set(rep, rep); o[k].needsUpdate = true; } return o; };
  const gm = clone(T.gunmetal, 9), st = clone(T.steel, 9), pl = clone(T.polymer, 28), pt = clone(T.polymerTan, 28), cm = clone(T.camo, 6), cl = clone(T.cloth, 10);
  return {
    metal: V(pbr(gm, { color: c(1.0, 1.0, 1.02) })),
    metalWorn: V(pbr(st, { color: c(0.42, 0.42, 0.44), roughness: 1.1 })),
    steelBright: V(pbr(st, {})),
    polymer: V(pbr(pl, {})),
    fde: V(pbr(pt, {})),
    suppressor: V(pbr(gm, { color: c(0.8, 0.8, 0.82), roughness: 1.25 })),
    sleeve: V(pbr(cm, { normalScale: 1.4 })),
    glove: V(pbr(cl, { color: c(0.5, 0.44, 0.33) })),
    gloveDark: V(pbr(cl, { color: c(0.13, 0.13, 0.13) })),
    brass: V(new THREE.MeshStandardMaterial({ color: c(0.78, 0.6, 0.28), roughness: 0.3, metalness: 1.0 })),
    lens: V(new THREE.MeshStandardMaterial({ color: c(0.05, 0.08, 0.09), roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.22, depthWrite: false })),
    watch: V(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.22, 0.1) })),
    skin: V(new THREE.MeshStandardMaterial({ color: c(0.7, 0.5, 0.38), roughness: 0.6 })),
    olive: V(pbr(clone(T.paint, 3), { color: c(0.24, 0.27, 0.19) })),
    bandage: V(pbr(cl, { color: c(0.85, 0.84, 0.78) })),
  };
}

// Arazi: kum / sıkışmış toprak / çakıl / kaya katmanları + kontrol haritası + makro çeşitlilik
export function makeTerrainMaterial(T, ctrlTex, terrainSize, low) {
  const m = new THREE.MeshStandardMaterial({ map: T.sand.map, normalMap: T.sand.normalMap, roughness: 0.95, metalness: 0 });
  m.userData.surface = SURF.sand; m.userData.skyVis = { value: 1 };
  m.normalScale.set(0.55, 0.55);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tDirt: { value: T.dirt.map }, tDirtN: { value: T.dirt.normalMap }, tRock: { value: T.rock.map }, tRockN: { value: T.rock.normalMap },
      tGravel: { value: T.gravel.map }, tGravelN: { value: T.gravel.normalMap }, tCtrl: { value: ctrlTex }, tMacro: { value: T.noise },
      uTerrainSize: { value: terrainSize }, uSkyVis: m.userData.skyVis,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; attribute float skyVis; varying float vSkyVis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normal; vSkyVis = skyVis;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDirt; uniform sampler2D tDirtN; uniform sampler2D tRock; uniform sampler2D tRockN; uniform sampler2D tGravel; uniform sampler2D tGravelN;
        uniform sampler2D tCtrl; uniform sampler2D tMacro; uniform float uTerrainSize; uniform float uSkyVis;
        varying vec3 vWPos; varying vec3 vWNrm; varying float vSkyVis;`)
      .replace('#include <map_fragment>', `
        vec2 tuv = vMapUv;
        float camDist = length(vViewPosition);
        float farK = smoothstep(14.0, 60.0, camDist);
        vec4 ctrl = texture2D(tCtrl, vWPos.xz / uTerrainSize + 0.5);
        float macro = texture2D(tMacro, vWPos.xz * 0.0057).r;
        float macro2 = texture2D(tMacro, vWPos.xz * 0.033).g;
        float slope = 1.0 - normalize(vWNrm).y;
        float wRock = smoothstep(0.13, 0.3, slope + (macro2 - 0.5) * 0.18);
        float wDirt = clamp(ctrl.r * 1.3 + (macro2 - 0.5) * 0.5 * step(0.03, ctrl.r), 0.0, 1.0);
        float wGrav = clamp(ctrl.g * 1.4 + (macro2 - 0.5) * 0.6 * step(0.03, ctrl.g), 0.0, 1.0);
        vec3 alb = mix(texture2D(map, tuv).rgb, texture2D(map, tuv * 0.17 + 0.3).rgb, farK * 0.8);
        alb = mix(alb, texture2D(tDirt, tuv * 0.9).rgb, wDirt);
        ${low ? '' : 'alb = mix(alb, texture2D(tGravel, tuv * 1.6).rgb, wGrav);'}
        alb = mix(alb, mix(texture2D(tRock, tuv * 0.42).rgb, texture2D(tRock, tuv * 0.09).rgb, farK * 0.7), wRock);
        alb *= 0.7 + 0.58 * macro;
        alb *= mix(vec3(1.0), vec3(1.06, 0.98, 0.9), macro2);
        alb *= 1.0 - ctrl.b * 0.5;
        diffuseColor.rgb *= alb;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = mix(texture2D(normalMap, tuv).xyz, texture2D(normalMap, tuv * 0.17 + 0.3).xyz, farK * 0.8) * 2.0 - 1.0;
        mapN = mix(mapN, texture2D(tDirtN, tuv * 0.9).xyz * 2.0 - 1.0, wDirt);
        ${low ? '' : 'mapN = mix(mapN, texture2D(tGravelN, tuv * 1.6).xyz * 2.0 - 1.0, wGrav);'}
        mapN = mix(mapN, texture2D(tRockN, tuv * 0.42).xyz * 2.0 - 1.0, wRock);
        mapN.xy *= normalScale * mix(1.0, 0.6, farK);
        normal = normalize(tbn * mapN);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vSkyVis * uSkyVis; reflectedLight.indirectSpecular *= vSkyVis * uSkyVis;`);
  };
  m.customProgramCacheKey = () => 'terrain' + (low ? 'L' : 'H');
  return m;
}
