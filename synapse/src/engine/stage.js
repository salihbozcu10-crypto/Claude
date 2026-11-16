// Sahne, kamera ve sinematik görüntü işleme hattı.
//   sahne (HDR, MSAA, derinlik dokusu) → alan derinliği (DOF) → bloom → ton eşleme + renk
//   derecelendirme + vinyet + film greni + kromatik sapma + sinemaskop bant + kararma
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const POST_DEFAULTS = {
  exposure: 1.0,
  bloomStrength: 0.55, bloomRadius: 0.55, bloomThreshold: 0.85,
  dof: 0, dofFocus: 3, dofAperture: 0.06, dofMaxBlur: 9, // dof: 0 kapalı, 1 açık (karışım)
  vignette: 0.35, grain: 0.035, ca: 0.0015,
  lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
  saturation: 1.0, contrast: 1.04, temperature: 0, tint: 0,
  letterbox: 0, // 0..1 (1 = 2.39:1)
  fade: 0, fadeColor: [0, 0, 0], flash: 0, flashColor: [1, 1, 1],
  glitch: 0, scanlines: 0, whiteout: 0,
};

const DOF_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform float cameraNear, cameraFar, focus, aperture, maxBlur, amount;
uniform vec2 resolution;
varying vec2 vUv;
float linDepth(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear)); }
float coc(float z){ return clamp(abs(z - focus) / max(z, 0.001) * aperture * 400.0, 0.0, maxBlur); }
void main(){
  vec4 base = texture2D(tColor, vUv);
  // temizleme: NaN/sonsuz pikselleri ve aşırı parlak noktaları bastır (bloom'u korur)
  if (any(isnan(base)) || any(isinf(base))) base = vec4(0.0, 0.0, 0.0, 1.0);
  base.rgb = min(base.rgb, vec3(48.0));
  if (amount < 0.001) { gl_FragColor = base; return; }
  float zc = linDepth(vUv); float cc = coc(zc) * amount;
  vec3 acc = base.rgb; float wsum = 1.0;
  const int N = 28; const float GA = 2.39996323;
  for (int i = 1; i < N; i++) {
    float fi = float(i); float r = sqrt(fi / float(N)); float a = fi * GA;
    vec2 off = vec2(cos(a), sin(a)) * r * maxBlur * amount / resolution;
    vec2 uv = vUv + off;
    float zs = linDepth(uv); float cs = coc(zs) * amount;
    // örnek, kendi bulanıklık yarıçapı bu mesafeyi kapsıyorsa katkı verir (ön plan taşması dahil)
    float dist = r * maxBlur * amount;
    float w = smoothstep(dist - 1.0, dist + 0.5, (zs < zc ? cs : min(cs, cc)) );
    vec3 s = texture2D(tColor, uv).rgb; if (any(isnan(s)) || any(isinf(s))) s = vec3(0.0); s = min(s, vec3(48.0));
    float lum = dot(s, vec3(0.299,0.587,0.114));
    w *= 1.0 + smoothstep(1.0, 4.0, lum) * 2.0; // parlak bokeh
    acc += s * w; wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, base.a);
}`;

const FINAL_FRAG = /* glsl */`
uniform sampler2D tColor; uniform vec2 resolution; uniform float time;
uniform float exposure, vignette, grain, ca, saturation, contrast, temperature, tintAmt, letterbox, fade, flash, glitch, scanlines, whiteout;
uniform vec3 lift, gammaV, gain, fadeColor, flashColor;
varying vec2 vUv;
// ACES (Narkowicz) + hafif omuz
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vUv;
  if (glitch > 0.0) {
    float band = floor(uv.y * 40.0 + floor(time*24.0)*7.0);
    float h = hash(vec2(band, floor(time*24.0)));
    if (h < glitch * 0.5) uv.x += (hash(vec2(band, 3.0)) - 0.5) * 0.08 * glitch;
  }
  vec2 dc = uv - 0.5;
  float caAmt = ca * (1.0 + glitch * 6.0);
  vec3 col;
  col.r = texture2D(tColor, uv + dc * caAmt * 2.0).r;
  col.g = texture2D(tColor, uv).g;
  col.b = texture2D(tColor, uv - dc * caAmt * 2.0).b;
  col *= exposure;
  // beyaz balans (sıcaklık / ton)
  col *= vec3(1.0 + temperature * 0.1, 1.0 + tintAmt * 0.05, 1.0 - temperature * 0.1);
  col = aces(col);
  col = toSRGB(col);
  // lift / gamma / gain
  col = gain * (col + lift * (1.0 - col));
  col = pow(max(col, 0.0), 1.0 / gammaV);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  // vinyet
  float vig = smoothstep(0.85, 0.2, length(dc * vec2(resolution.x/resolution.y, 1.0)) * 0.95);
  col *= mix(1.0, vig, vignette);
  // tarama çizgileri (ekran içi / bozulma anları)
  if (scanlines > 0.0) col *= 1.0 - scanlines * 0.25 * (0.5 + 0.5 * sin(uv.y * resolution.y * 1.5));
  // film greni (luma'ya bağlı)
  float g = hash(uv * resolution + fract(time * 13.7) * 100.0) - 0.5;
  col += g * grain * (1.0 - l * 0.6);
  col = mix(col, flashColor, flash);
  col = mix(col, vec3(1.0), whiteout);
  col = mix(col, fadeColor, fade);
  // sinemaskop bantlar
  float bar = letterbox * (1.0 - (resolution.x / resolution.y) / 2.39) * 0.5;
  if (uv.y < bar || uv.y > 1.0 - bar) col = vec3(0.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function createStage(canvas, W, H, { msaa = 4, shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // son geçiş sRGB'yi kendisi yapar
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 200);

  // Yumuşak ortam yansımaları için oda ortamı (her set kendi rengini ekler)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.25;

  const depthTex = new THREE.DepthTexture(W, H);
  depthTex.type = THREE.FloatType;
  const sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: msaa, depthTexture: depthTex, depthBuffer: true });
  const rtA = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });

  const dofMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tDepth: { value: depthTex }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, focus: { value: 3 }, aperture: { value: 0.05 }, maxBlur: { value: 8 }, amount: { value: 0 }, resolution: { value: new THREE.Vector2(W, H) } },
    vertexShader: VERT, fragmentShader: DOF_FRAG, depthTest: false, depthWrite: false,
  });
  const finalMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, resolution: { value: new THREE.Vector2(W, H) }, time: { value: 0 },
      exposure: { value: 1 }, vignette: { value: 0.3 }, grain: { value: 0.03 }, ca: { value: 0.001 }, saturation: { value: 1 }, contrast: { value: 1 },
      temperature: { value: 0 }, tintAmt: { value: 0 }, letterbox: { value: 0 }, fade: { value: 0 }, flash: { value: 0 }, glitch: { value: 0 }, scanlines: { value: 0 }, whiteout: { value: 0 },
      lift: { value: new THREE.Vector3() }, gammaV: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) },
      fadeColor: { value: new THREE.Vector3() }, flashColor: { value: new THREE.Vector3(1, 1, 1) },
    },
    vertexShader: VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false,
  });
  const dofQuad = new FullScreenQuad(dofMat);
  const finalQuad = new FullScreenQuad(finalMat);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.5, 0.85);

  const post = { ...structuredClone(POST_DEFAULTS) };
  const resetPost = () => { Object.assign(post, structuredClone(POST_DEFAULTS)); };

  function render(t) {
    // 1) sahne
    renderer.setRenderTarget(sceneRT);
    renderer.setClearColor(scene.background && scene.background.isColor ? scene.background : 0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    // 2) alan derinliği
    let src = sceneRT;
    {
      Object.assign(dofMat.uniforms.cameraNear, { value: camera.near });
      dofMat.uniforms.cameraFar.value = camera.far;
      dofMat.uniforms.tColor.value = sceneRT.texture;
      dofMat.uniforms.focus.value = post.dofFocus;
      dofMat.uniforms.aperture.value = post.dofAperture;
      dofMat.uniforms.maxBlur.value = post.dofMaxBlur;
      dofMat.uniforms.amount.value = Math.max(0, post.dof);
      renderer.setRenderTarget(rtA); dofQuad.render(renderer);
      src = rtA;
    }
    // 3) bloom (yerinde, eklemeli)
    if (post.bloomStrength > 0.001) {
      bloom.strength = post.bloomStrength; bloom.radius = post.bloomRadius; bloom.threshold = post.bloomThreshold;
      bloom.render(renderer, null, src, 0, false);
    }
    // 4) son birleşim → ekran
    const u = finalMat.uniforms;
    u.tColor.value = src.texture; u.time.value = t;
    u.exposure.value = post.exposure; u.vignette.value = post.vignette; u.grain.value = post.grain; u.ca.value = post.ca;
    u.saturation.value = post.saturation; u.contrast.value = post.contrast; u.temperature.value = post.temperature; u.tintAmt.value = post.tint;
    u.letterbox.value = post.letterbox; u.fade.value = post.fade; u.flash.value = post.flash; u.glitch.value = post.glitch; u.scanlines.value = post.scanlines; u.whiteout.value = post.whiteout;
    u.lift.value.fromArray(post.lift); u.gammaV.value.fromArray(post.gamma); u.gain.value.fromArray(post.gain);
    u.fadeColor.value.fromArray(post.fadeColor); u.flashColor.value.fromArray(post.flashColor);
    renderer.setRenderTarget(null); finalQuad.render(renderer);
  }

  return { renderer, scene, camera, post, resetPost, render, W, H, envRT };
}
