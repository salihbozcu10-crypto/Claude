// Malzemeler ve prosedürel dokular.
// "Pixar" görünümünün temeli: yumuşak sarmal (wrap) aydınlatma + kırmızımsı alt yüzey
// saçılımı yaklaşımı (cilt), görüş açısına bağlı kenar ışığı (rim) ve yumuşak pürüzlülük.
import * as THREE from 'three';
import { rng, fbm3, clamp } from './util.js';

// Tüm karakter malzemelerinin paylaştığı kenar ışığı ayarı (çekimler değiştirebilir).
export const RIM = {
  color: { value: new THREE.Color(0x6fd8ff) },
  strength: { value: 0.12 },
  power: { value: 4.0 },
};

const chunkBase = THREE.ShaderChunk.lights_physical_pars_fragment;
const WRAP_CHUNK_SRC = chunkBase
  .replace(
    /float dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);\s*vec3 irradiance = dotNL \* directLight\.color;/,
    `float rawNL = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( rawNL );
	vec3 irradiance = dotNL * directLight.color;`
  )
  .replace(
    /reflectedLight\.directDiffuse \+= irradiance \* diffuseBRDF \* \( 1\.0 - F \);\s*\}/,
    `#ifdef WRAP_SSS
	// sarmal (wrap) dağınık ışık yalnızca dağınık bileşende; speküler dotNL ile kalır
	float wrapNL = saturate( ( rawNL + sssWrap ) / ( 1.0 + sssWrap ) );
	vec3 irrD = mix( vec3( dotNL ), vec3( wrapNL ), sssMix ) * directLight.color;
	reflectedLight.directDiffuse += irrD * diffuseBRDF * ( 1.0 - F );
	#else
	reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );
	#endif
	#ifdef WRAP_SSS
	// terminatöre yakın kırmızımsı saçılım bandı
	float band = saturate( ( rawNL + sssWrap * 1.6 ) / ( 1.0 + sssWrap * 1.6 ) ) - dotNL;
	reflectedLight.directDiffuse += directLight.color * sssColor * max( band, 0.0 ) * BRDF_Lambert( material.diffuseContribution ) * 0.55;
	#endif
}`
  );
if (!/WRAP_SSS[\s\S]*WRAP_SSS/.test(WRAP_CHUNK_SRC)) console.warn('materials: SSS yaması uygulanamadı');
const WRAP_CHUNK = WRAP_CHUNK_SRC;

function patchCharacter(mat, { sss = false, wrap = 0.5, sssColor = 0xff5a3c, sssMix = 1.0, rim = 1.0 } = {}) {
  mat.userData.rimScale = { value: rim };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = RIM.color;
    sh.uniforms.rimStrength = RIM.strength;
    sh.uniforms.rimPower = RIM.power;
    sh.uniforms.rimScale = mat.userData.rimScale;
    if (sss) {
      sh.uniforms.sssWrap = { value: wrap };
      sh.uniforms.sssMix = { value: sssMix };
      sh.uniforms.sssColor = { value: new THREE.Color(sssColor) };
      sh.fragmentShader = '#define WRAP_SSS\nuniform float sssWrap;\nuniform float sssMix;\nuniform vec3 sssColor;\n' + sh.fragmentShader;
    }
    sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;\nuniform float rimScale;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', WRAP_CHUNK)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
	{
		float rimF = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), rimPower );
		totalEmissiveRadiance += rimColor * rimF * rimStrength * rimScale;
	}`
      );
  };
  mat.customProgramCacheKey = () => (sss ? 'charSSS' : 'charRim');
  return mat;
}

// Cilt: yumuşak, hafif parlak, alt yüzey saçılımlı.
export function skinMaterial(color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.48,
    metalness: 0,
    sheen: 0.12,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(opts.sheenColor ?? 0xffc9b0),
    specularIntensity: 0.55,
    clearcoat: opts.clearcoat ?? 0.06,
    clearcoatRoughness: 0.5,
    map: opts.map || null,
    normalMap: opts.normalMap || null,
    roughnessMap: opts.roughnessMap || null,
  });
  if (opts.normalMap) m.normalScale = new THREE.Vector2(opts.normalScale ?? 0.25, opts.normalScale ?? 0.25);
  return patchCharacter(m, { sss: true, wrap: opts.wrap ?? 0.55, sssColor: opts.sssColor ?? 0xff4a30, rim: opts.rim ?? 1.0 });
}

// Karakter kumaşı/aksesuarı: standart PBR + kenar ışığı.
export function charMaterial(color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0,
    sheen: opts.sheen ?? 0.4,
    sheenRoughness: opts.sheenRoughness ?? 0.8,
    sheenColor: new THREE.Color(opts.sheenColor ?? color).lerp(new THREE.Color(0xffffff), 0.3),
    clearcoat: opts.clearcoat ?? 0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.3,
    map: opts.map || null,
    normalMap: opts.normalMap || null,
    roughnessMap: opts.roughnessMap || null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  if (opts.normalMap) m.normalScale = new THREE.Vector2(opts.normalScale ?? 0.5, opts.normalScale ?? 0.5);
  if (opts.anisotropy) { m.anisotropy = opts.anisotropy; m.anisotropyRotation = opts.anisotropyRotation ?? 0; }
  return patchCharacter(m, { sss: !!opts.sss, wrap: opts.wrap ?? 0.3, rim: opts.rim ?? 1.0 });
}

// Saç: anizotropik parlama, hafif sarmal aydınlatma.
export function hairMaterial(color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.42,
    metalness: 0,
    sheen: 0.8,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffe2c0), 0.5),
    anisotropy: opts.anisotropy ?? 0,
    anisotropyRotation: opts.anisotropyRotation ?? Math.PI / 2,
    specularIntensity: 0.7,
    map: opts.map || null,
    normalMap: opts.normalMap || null,
  });
  if (opts.normalMap) m.normalScale = new THREE.Vector2(0.6, 0.6);
  return patchCharacter(m, { sss: true, wrap: 0.35, sssColor: 0x5a2a10, sssMix: 0.6, rim: opts.rim ?? 1.3 });
}

// Çevre malzemesi (karakter yamaları olmadan, daha hızlı).
export function envMaterial(color, opts = {}) {
  const P = opts.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new P({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0,
    map: opts.map || null,
    normalMap: opts.normalMap || null,
    roughnessMap: opts.roughnessMap || null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap || null,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
  if (opts.normalMap) m.normalScale = new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1);
  return m;
}

// Kendinden ışıklı (ekranlar, neon). Ton eşlemede bloom'u besler.
export function glowMaterial(color, intensity = 2, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    map: opts.map || null,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: opts.depthWrite ?? !opts.additive,
    side: opts.side ?? THREE.FrontSide,
    toneMapped: opts.toneMapped ?? true,
    fog: opts.fog ?? true,
  });
}

// ---------- Prosedürel dokular ----------
export function canvasTexture(w, h, draw, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Yükseklik fonksiyonundan normal haritası üretir: hf(u,v) -> 0..1
export function normalMapFrom(w, h, hf, strength = 2, repeat = null) {
  const hm = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hm[y * w + x] = hf(x / w, y / h);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = hm[y * w + ((x - 1 + w) % w)], xr = hm[y * w + ((x + 1) % w)];
    const yu = hm[((y - 1 + h) % h) * w + x], yd = hm[((y + 1) % h) * w + x];
    let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Gürültü renk dokusu (iki renk arası fbm karışımı + benekler)
export function noiseColorTexture(w, h, c1, c2, { scale = 6, seed = 1, speckle = 0, repeat = null } = {}) {
  const A = new THREE.Color(c1), B = new THREE.Color(c2); const R = rng(seed);
  return canvasTexture(w, h, (g) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      // döşenebilir: dairesel örnekleme
      const n = fbm3(Math.cos(u * 6.2832) * scale / 6.2832 + seed, Math.sin(u * 6.2832) * scale / 6.2832, v * scale, 5) * 0.5 + 0.5;
      let k = clamp(n * 1.2 - 0.1);
      if (speckle && R() < speckle) k = clamp(k + (R() - 0.5) * 0.8);
      const i = (y * w + x) * 4;
      img.data[i] = (A.r + (B.r - A.r) * k) * 255; img.data[i + 1] = (A.g + (B.g - A.g) * k) * 255; img.data[i + 2] = (A.b + (B.b - A.b) * k) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat });
}

// Kumaş dokuma normal haritası
export function fabricNormal(repeat = [8, 8], strength = 1.2, denim = false) {
  return normalMapFrom(128, 128, (u, v) => {
    const a = Math.sin(u * Math.PI * 2 * 32 + (denim ? v * 6.28 * 32 : 0)) * 0.5 + 0.5;
    const b = Math.sin(v * Math.PI * 2 * 32) * 0.5 + 0.5;
    return (Math.floor(u * 32) + Math.floor(v * 32)) % 2 ? a : b;
  }, strength, repeat);
}

// Cilt gözenek normal haritası
export function skinPoreNormal() {
  return normalMapFrom(256, 256, (u, v) => {
    const n = fbm3(Math.cos(u * 6.2832) * 6, Math.sin(u * 6.2832) * 6, v * 38, 3);
    return n * 0.5 + 0.5;
  }, 1.4, [1, 1]);
}
