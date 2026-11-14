// Görüntü işleme hattı: HDR sahne -> SSAO -> yükseklik sisi + ışık huzmeleri -> parçacıklar
// -> bloom -> otomatik pozlama -> film ton eğrisi / renk / gren / gece görüşü.
import * as THREE from 'three';
import { SKY_GLSL } from './sky.js';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DEPTH_GLSL = /* glsl */`
uniform sampler2D tDepth; uniform vec4 uProj; // 1/P00, 1/P11, near, far
float linDepth(vec2 uv) { float d = texture2D(tDepth, uv).x; return (uProj.z * uProj.w) / (uProj.w - d * (uProj.w - uProj.z)); }
vec3 viewPos(vec2 uv, float ld) { return vec3((uv * 2.0 - 1.0) * uProj.xy * ld, -ld); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const AO_FRAG = /* glsl */`
varying vec2 vUv; uniform vec2 uTexel; uniform float uRadius; uniform float uIntensity; uniform float uAspect;
${DEPTH_GLSL}
void main() {
  float ld = linDepth(vUv);
  if (ld > uProj.w * 0.9 || ld < 0.34) { gl_FragColor = vec4(1.0, ld, 0.0, 1.0); return; }
  vec3 p = viewPos(vUv, ld);
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float l = linDepth(vUv - dx), r = linDepth(vUv + dx), b = linDepth(vUv - dy), t = linDepth(vUv + dy);
  vec3 ddx = abs(l - ld) < abs(r - ld) ? p - viewPos(vUv - dx, l) : viewPos(vUv + dx, r) - p;
  vec3 ddy = abs(b - ld) < abs(t - ld) ? p - viewPos(vUv - dy, b) : viewPos(vUv + dy, t) - p;
  vec3 n = normalize(cross(ddx, ddy));
  float rad = uRadius * clamp(ld * 0.35, 0.35, 2.2);
  float rs = min(rad / (uProj.y * ld) * 0.5, 0.09);
  float ang = ign(gl_FragCoord.xy) * 6.2831853;
  float sum = 0.0; float r2 = rad * rad;
  for (int i = 0; i < 11; i++) {
    float fi = (float(i) + 0.5) / 11.0; float a = ang + float(i) * 2.399963;
    vec2 suv = vUv + vec2(cos(a) / uAspect, sin(a)) * rs * sqrt(fi);
    float sd = linDepth(suv); vec3 v = viewPos(suv, sd) - p;
    float vv = dot(v, v); float vn = dot(v, n) - 0.012 * ld;
    float f = max(r2 - vv, 0.0);
    sum += f * f * f * max(vn / (vv + 0.0008), 0.0);
  }
  float ao = max(0.0, 1.0 - sum * 5.0 * uIntensity / (r2 * r2 * r2 * 11.0));
  gl_FragColor = vec4(ao, ld, 0.0, 1.0);
}`;

const AO_BLUR_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tAO; uniform vec2 uDir;
void main() {
  vec2 c = texture2D(tAO, vUv).rg; float sum = c.r * 0.3; float w = 0.3;
  for (int i = 1; i <= 3; i++) {
    float fi = float(i); float g = 0.24 - fi * 0.06;
    vec2 a = texture2D(tAO, vUv + uDir * fi).rg, b = texture2D(tAO, vUv - uDir * fi).rg;
    float wa = g * max(0.0, 1.0 - abs(a.g - c.g) / (0.06 * c.g + 0.02)), wb = g * max(0.0, 1.0 - abs(b.g - c.g) / (0.06 * c.g + 0.02));
    sum += a.r * wa + b.r * wb; w += wa + wb;
  }
  gl_FragColor = vec4(sum / w, c.g, 0.0, 1.0);
}`;

const RAY_GLSL = /* glsl */`
uniform vec3 uCamRight; uniform vec3 uCamUp; uniform vec3 uCamFwd; // tanHalfFov ile ölçekli
vec3 viewRay(vec2 uv) { vec2 n = uv * 2.0 - 1.0; return normalize(uCamFwd + uCamRight * n.x + uCamUp * n.y); }
`;

const RAYMASK_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tDepth; uniform vec3 uSunDir;
${RAY_GLSL}
void main() {
  float d = texture2D(tDepth, vUv).x; float sky = step(0.999999, d);
  float sd = max(dot(viewRay(vUv), uSunDir), 0.0);
  gl_FragColor = vec4(sky * (pow(sd, 6.0) * 0.16 + pow(sd, 48.0) * 0.5 + pow(sd, 400.0) * 1.2));
}`;

const RAYBLUR_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tMask; uniform vec2 uSunUv; uniform float uLen; uniform float uJitter;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 delta = (uSunUv - vUv) * (uLen / 14.0);
  vec2 uv = vUv + delta * ign(gl_FragCoord.xy) * uJitter; float acc = 0.0, w = 1.0, ws = 0.0;
  for (int i = 0; i < 14; i++) { acc += texture2D(tMask, clamp(uv, 0.001, 0.999)).r * w; ws += w; w *= 0.94; uv += delta; }
  gl_FragColor = vec4(acc / ws);
}`;

const COMPOSITE_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tRays;
uniform float uAo; uniform float uRayStrength; uniform vec3 uCamPos; uniform float uFogDensity; uniform float uFogHeight; uniform float uFogBase;
${DEPTH_GLSL}
${RAY_GLSL}
${SKY_GLSL}
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;
  if (d < 0.999999) {
    float ld = linDepth(vUv);
    if (ld > 0.34) {
      col *= mix(1.0, texture2D(tAO, vUv).r, uAo);
      vec3 ray = viewRay(vUv);
      float dist = ld / max(dot(ray, normalize(uCamFwd)), 0.05);
      // analitik üstel yükseklik sisi
      float k = 1.0 / uFogHeight; float ry = ray.y; if (abs(ry) < 0.0005) ry = 0.0005;
      float od = uFogDensity * exp(-(uCamPos.y - uFogBase) * k) * (1.0 - exp(-ry * dist * k)) / (ry * k);
      float fog = 1.0 - exp(-max(od, 0.0));
      vec3 fc = skyGradient(normalize(vec3(ray.x, max(ray.y, 0.0) * 0.35 + 0.015, ray.z)));
      col = mix(col, fc, fog);
    }
  }
  col += uGlow * texture2D(tRays, vUv).r * uRayStrength;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const DOWN_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv - h).rgb; c += texture2D(tSrc, vUv + h).rgb;
  c += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb; c += texture2D(tSrc, vUv - vec2(h.x, -h.y)).rgb;
  c *= 0.125;
  if (uThreshold > 0.0) {
    c = min(c, vec3(60.0));
    float br = max(c.r, max(c.g, c.b)); float soft = clamp(br - uThreshold + 0.5, 0.0, 1.0); soft = soft * soft * 0.5;
    c *= max(soft, br - uThreshold) / max(br, 1e-4);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const UP_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb
         + texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  c += (texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb + texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb
      + texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb + texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb) * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}`;

const LUM_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst;
void main() {
  vec2 h = uTexel;
  if (uFirst > 0.5) {
    float s = 0.0;
    for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
      vec3 c = texture2D(tSrc, vUv + (vec2(float(x), float(y)) - 0.5) * h).rgb;
      s += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0006));
    }
    // merkeze ağırlık
    float w = 1.0 - 0.55 * smoothstep(0.15, 0.75, length(vUv - 0.5) * 1.5);
    gl_FragColor = vec4(s * 0.25, w, 0.0, 1.0);
  } else {
    vec2 a = texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rg, b = texture2D(tSrc, vUv + vec2(h.x, -h.y)).rg, c = texture2D(tSrc, vUv + vec2(-h.x, h.y)).rg, d = texture2D(tSrc, vUv + vec2(h.x, h.y)).rg;
    float w = a.g + b.g + c.g + d.g;
    gl_FragColor = vec4((a.r * a.g + b.r * b.g + c.r * c.g + d.r * d.g) / max(w, 1e-4), w * 0.25, 0.0, 1.0);
  }
}`;

const ADAPT_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tLum; uniform sampler2D tPrev; uniform float uRate;
void main() {
  float cur = exp(texture2D(tLum, vec2(0.5)).r); float prev = texture2D(tPrev, vec2(0.5)).r;
  float v = mix(prev, cur, uRate); if (!(v > 0.0)) v = cur;
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

const FINAL_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAdapt; uniform sampler2D tNoise;
uniform float uBloom; uniform float uExposure; uniform float uKey; uniform vec2 uExpRange; uniform float uTime; uniform vec2 uRes;
uniform float uNvg; uniform float uGrain; uniform float uVignette; uniform float uCA; uniform float uDamage; uniform float uHurt; uniform float uFlash;
uniform float uSuppress; uniform float uFade; uniform float uSat; uniform float uSharpen; uniform float uAspect; uniform float uLetter;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {
  const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = I * (c / 0.6); c = RRTAndODTFit(c); return clamp(O * c, 0.0, 1.0);
}
void main() {
  vec2 uv = vUv; vec2 cc = uv - 0.5;
  float nvg = uNvg;
  if (nvg > 0.5) { float r2 = dot(cc, cc); uv = 0.5 + cc * (1.0 + r2 * 0.14); cc = uv - 0.5; }
  float edge = dot(cc, cc);
  vec2 caOff = cc * (uCA * (0.4 + edge * 2.6) + uSuppress * 0.006);
  vec3 col;
  col.r = texture2D(tScene, uv + caOff).r; col.g = texture2D(tScene, uv).g; col.b = texture2D(tScene, uv - caOff).b;
  if (uSharpen > 0.0) {
    vec2 px = 1.0 / uRes;
    vec3 nb = texture2D(tScene, uv + vec2(px.x, 0.0)).rgb + texture2D(tScene, uv - vec2(px.x, 0.0)).rgb + texture2D(tScene, uv + vec2(0.0, px.y)).rgb + texture2D(tScene, uv - vec2(0.0, px.y)).rgb;
    col = max(col + (col * 4.0 - nb) * uSharpen, 0.0);
  }
  vec3 bloom = texture2D(tBloom, uv).rgb;
  col += bloom * uBloom;
  float lumAvg = texture2D(tAdapt, vec2(0.5)).r;
  float ev = clamp(uKey / max(lumAvg, 1e-4), uExpRange.x, uExpRange.y) * uExposure;
  vec3 outc;
  if (nvg > 0.5) {
    // Gece görüşü: görüntü yoğunlaştırıcı tüp benzetimi
    float l = dot(col + bloom * 0.6, vec3(0.34, 0.5, 0.16)) * ev * 26.0;
    float n = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 613.0);
    float n2 = hash12(floor(gl_FragCoord.xy * 0.5) + fract(uTime * 3.7) * 271.0);
    l += (n - 0.5) * 0.11 * (0.35 + l) + step(0.9985, n2) * 0.5;
    l = l / (1.0 + l); l = pow(max(l, 0.0), 0.82) * 1.12;
    outc = mix(vec3(0.02, 0.07, 0.035), vec3(0.62, 1.0, 0.72), l) * l + vec3(0.0, 0.012, 0.004);
    // çift tüp maskesi
    vec2 q = vec2(cc.x * uAspect, cc.y);
    float m1 = length(q - vec2(-0.2 * uAspect / 1.78, 0.0)), m2 = length(q - vec2(0.2 * uAspect / 1.78, 0.0));
    float m = min(m1, m2); float rad = 0.47;
    outc *= 1.0 - smoothstep(rad - 0.035, rad, m);
    outc *= 1.0 - smoothstep(0.1, rad, m) * 0.45;
  } else {
    col *= ev;
    outc = aces(col);
    // renk: doygunluk + hafif sıcak/soğuk ayrışması
    float l = dot(outc, vec3(0.2126, 0.7152, 0.0722));
    outc = mix(vec3(l), outc, uSat * (1.0 - uHurt * 0.55));
    outc *= mix(vec3(0.985, 1.0, 1.035), vec3(1.035, 1.0, 0.965), smoothstep(0.0, 0.7, l));
    outc = pow(outc, vec3(1.04));
    float vg = 1.0 - smoothstep(0.12, 0.78, edge * (1.0 + uSuppress * 1.4)) * uVignette;
    outc *= vg;
  }
  // hasar: kenarlarda kırmızı nabız
  float dmgMask = smoothstep(0.05, 0.42, edge);
  outc = mix(outc, vec3(0.42, 0.015, 0.01), clamp(dmgMask * (uDamage * 0.6 + uHurt * 0.26), 0.0, 0.62));
  // flaş bombası beyazlığı
  outc = mix(outc, vec3(1.0), clamp(uFlash, 0.0, 1.0));
  // gren (aynı zamanda bantlanmayı kırar)
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 917.0) - 0.5;
  outc += g * (uGrain * (0.6 + 0.9 * (1.0 - dot(outc, vec3(0.333)))) + 1.5 / 255.0);
  outc *= 1.0 - uFade;
  if (uLetter > 0.0) { float bar = step(abs(cc.y), 0.5 - uLetter * 0.12); outc *= bar; }
  // sRGB kodlama
  outc = clamp(outc, 0.0, 1.0);
  outc = mix(outc * 12.92, 1.055 * pow(outc, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, outc));
  gl_FragColor = vec4(outc, 1.0);
}`;

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: opts.type ?? THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: opts.filter ?? THREE.LinearFilter, magFilter: opts.filter ?? THREE.LinearFilter,
    depthBuffer: !!opts.depth, stencilBuffer: false, samples: opts.samples || 0, generateMipmaps: false,
  });
}

export class PostFX {
  constructor(renderer, skyUniforms) {
    this.renderer = renderer;
    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), null);
    this.quad.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad.frustumCulled = false;
    this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.q = { ao: true, rays: true, bloom: 5, msaa: 4, scale: 1 };
    this.w = 0; this.h = 0;
    const proj = { value: new THREE.Vector4() }, depth = { value: null };
    const cam = { uCamRight: { value: new THREE.Vector3() }, uCamUp: { value: new THREE.Vector3() }, uCamFwd: { value: new THREE.Vector3() } };
    const sky = { uSunDir: skyUniforms.uSunDir, uZenith: skyUniforms.uZenith, uHorizon: skyUniforms.uHorizon, uGlow: skyUniforms.uGlow, uGround: skyUniforms.uGround };
    this.shared = { proj, depth, cam };
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mAO = mk(AO_FRAG, { tDepth: depth, uProj: proj, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.55 }, uIntensity: { value: 1.0 }, uAspect: { value: 1 } });
    this.mAOBlur = mk(AO_BLUR_FRAG, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mRayMask = mk(RAYMASK_FRAG, { tDepth: depth, uSunDir: sky.uSunDir, ...cam });
    this.mRayBlur = mk(RAYBLUR_FRAG, { tMask: { value: null }, uSunUv: { value: new THREE.Vector2() }, uLen: { value: 1 }, uJitter: { value: 1 } });
    this.mComp = mk(COMPOSITE_FRAG, {
      tScene: { value: null }, tAO: { value: null }, tRays: { value: null }, tDepth: depth, uProj: proj, ...cam, ...sky,
      uAo: { value: 1 }, uRayStrength: { value: 0 }, uCamPos: { value: new THREE.Vector3() }, uFogDensity: { value: 0.002 }, uFogHeight: { value: 40 }, uFogBase: { value: 0 },
    });
    this.mDown = mk(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } });
    this.mUp = mk(UP_FRAG, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mLum = mk(LUM_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 1 } });
    this.mAdapt = mk(ADAPT_FRAG, { tLum: { value: null }, tPrev: { value: null }, uRate: { value: 1 } });
    this.uFinal = {
      tScene: { value: null }, tBloom: { value: null }, tAdapt: { value: null }, tNoise: { value: null },
      uBloom: { value: 0.06 }, uExposure: { value: 1 }, uKey: { value: 0.18 }, uExpRange: { value: new THREE.Vector2(0.4, 4) }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uNvg: { value: 0 }, uGrain: { value: 0.012 }, uVignette: { value: 0.42 }, uCA: { value: 0.0016 }, uDamage: { value: 0 }, uHurt: { value: 0 }, uFlash: { value: 0 },
      uSuppress: { value: 0 }, uFade: { value: 0 }, uSat: { value: 1.06 }, uSharpen: { value: 0.12 }, uAspect: { value: 1.78 }, uLetter: { value: 0 },
    };
    this.mFinal = mk(FINAL_FRAG, this.uFinal);
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    this.lum = [rt(64, 64), rt(16, 16), rt(4, 4), rt(1, 1)];
    this.adapt = [rt(1, 1, { filter: THREE.NearestFilter }), rt(1, 1, { filter: THREE.NearestFilter })];
    this.adaptIdx = 0; this.firstFrame = true;
    this.fx = this.uFinal; // dışarıdan erişim kısayolu
    this.sunUv = new THREE.Vector3();
    this.rtList = [];
  }

  setQuality(q) { Object.assign(this.q, q); if (this.w) this.setSize(this.cw, this.ch); }

  setSize(cw, ch) {
    this.cw = cw; this.ch = ch;
    const w = Math.max(64, Math.round(cw * this.q.scale)), h = Math.max(64, Math.round(ch * this.q.scale));
    this.w = w; this.h = h;
    for (const t of this.rtList) t.dispose();
    this.rtList = [];
    const add = (t) => { this.rtList.push(t); return t; };
    this.sceneRT = add(rt(w, h, { depth: true, samples: this.q.msaa }));
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.sceneRT.depthTexture.minFilter = this.sceneRT.depthTexture.magFilter = THREE.NearestFilter;
    this.hdrRT = add(rt(w, h));
    const hw = w >> 1, hh = h >> 1;
    this.aoRT = [add(rt(hw, hh, { type: THREE.HalfFloatType })), add(rt(hw, hh, { type: THREE.HalfFloatType }))];
    const qw = w >> 2, qh = h >> 2;
    this.rayRT = [add(rt(qw, qh, { type: THREE.UnsignedByteType })), add(rt(qw, qh, { type: THREE.UnsignedByteType }))];
    this.down = []; this.up = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < 6; i++) { this.down.push(add(rt(bw, bh))); this.up.push(add(rt(bw, bh))); bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); }
    this.shared.depth.value = this.sceneRT.depthTexture;
    this.uFinal.uRes.value.set(w, h); this.uFinal.uAspect.value = w / h;
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.qcam);
  }

  render(scene, camera, fxScene, dt, env) {
    const r = this.renderer, q = this.q;
    const near = camera.near, far = camera.far;
    const pe = camera.projectionMatrix.elements;
    this.shared.proj.value.set(1 / pe[0], 1 / pe[5], near, far);
    const tanY = 1 / pe[5], tanX = 1 / pe[0];
    const e = camera.matrixWorld.elements;
    this.shared.cam.uCamRight.value.set(e[0], e[1], e[2]).multiplyScalar(tanX);
    this.shared.cam.uCamUp.value.set(e[4], e[5], e[6]).multiplyScalar(tanY);
    this.shared.cam.uCamFwd.value.set(-e[8], -e[9], -e[10]);

    // 1) sahne (HDR, MSAA, derinlik dokulu)
    r.setRenderTarget(this.sceneRT); r.autoClear = true;
    r.render(scene, camera);

    // 2) SSAO
    let aoTex = this.white;
    if (q.ao) {
      const u = this.mAO.uniforms; u.uTexel.value.set(1 / this.w, 1 / this.h); u.uAspect.value = this.w / this.h;
      this.pass(this.mAO, this.aoRT[0]);
      const b = this.mAOBlur.uniforms; const hw = this.aoRT[0].width, hh = this.aoRT[0].height;
      b.tAO.value = this.aoRT[0].texture; b.uDir.value.set(1 / hw, 0); this.pass(this.mAOBlur, this.aoRT[1]);
      b.tAO.value = this.aoRT[1].texture; b.uDir.value.set(0, 1 / hh); this.pass(this.mAOBlur, this.aoRT[0]);
      aoTex = this.aoRT[0].texture;
    }

    // 3) ışık huzmeleri
    let rayTex = this.black, rayStrength = 0;
    if (q.rays && env.rays > 0) {
      const sd = this.sunUv.copy(env.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
      const facing = env.sunDir.dot(this.shared.cam.uCamFwd.value);
      if (facing > 0.08) {
        const fade = Math.min(1, (facing - 0.08) * 3) * Math.max(0, 1 - Math.max(Math.abs(sd.x), Math.abs(sd.y)) * 0.35);
        if (fade > 0.01) {
          this.pass(this.mRayMask, this.rayRT[0]);
          const u = this.mRayBlur.uniforms; u.uSunUv.value.set(sd.x * 0.5 + 0.5, sd.y * 0.5 + 0.5);
          u.tMask.value = this.rayRT[0].texture; u.uLen.value = 0.92; u.uJitter.value = 1; this.pass(this.mRayBlur, this.rayRT[1]);
          u.tMask.value = this.rayRT[1].texture; u.uLen.value = 0.14; u.uJitter.value = 0.5; this.pass(this.mRayBlur, this.rayRT[0]);
          rayTex = this.rayRT[0].texture; rayStrength = env.rays * fade;
        }
      }
    }

    // 4) birleştirme: AO + sis + huzmeler
    const c = this.mComp.uniforms;
    c.tScene.value = this.sceneRT.texture; c.tAO.value = aoTex; c.tRays.value = rayTex; c.uRayStrength.value = rayStrength;
    c.uAo.value = q.ao ? 0.9 : 0; c.uCamPos.value.copy(camera.position);
    c.uFogDensity.value = env.fogDensity; c.uFogHeight.value = env.fogHeight;
    this.pass(this.mComp, this.hdrRT);

    // 5) parçacıklar / iz mermileri / alevler (derinlik dokusuna karşı yumuşak test)
    if (fxScene) { r.autoClear = false; r.setRenderTarget(this.hdrRT); r.render(fxScene, camera); r.autoClear = true; }

    // 6) bloom
    const levels = Math.min(q.bloom, 6);
    const d = this.mDown.uniforms;
    d.tSrc.value = this.hdrRT.texture; d.uTexel.value.set(1 / this.w, 1 / this.h); d.uThreshold.value = 0; this.pass(this.mDown, this.down[0]);
    // pozlama ölçümü (eşiksiz yarım çözünürlükten)
    const l = this.mLum.uniforms;
    l.uFirst.value = 1; l.tSrc.value = this.down[0].texture; l.uTexel.value.set(1 / 128, 1 / 128); this.pass(this.mLum, this.lum[0]);
    l.uFirst.value = 0;
    for (let i = 1; i < 4; i++) { l.tSrc.value = this.lum[i - 1].texture; const s = this.lum[i - 1].width; l.uTexel.value.set(1 / s, 1 / s); this.pass(this.mLum, this.lum[i]); }
    const a = this.mAdapt.uniforms; const prev = this.adapt[this.adaptIdx], next = this.adapt[1 - this.adaptIdx];
    a.tLum.value = this.lum[3].texture; a.tPrev.value = prev.texture; a.uRate.value = this.firstFrame ? 1 : 1 - Math.exp(-dt * (env.adaptSpeed ?? 1.6));
    this.pass(this.mAdapt, next); this.adaptIdx = 1 - this.adaptIdx; this.firstFrame = false;

    let bloomTex = this.black;
    if (levels > 1) {
      d.uThreshold.value = env.bloomThreshold ?? 1.0;
      for (let i = 1; i < levels; i++) {
        d.tSrc.value = this.down[i - 1].texture; d.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
        this.pass(this.mDown, this.down[i]); d.uThreshold.value = 0;
      }
      const u = this.mUp.uniforms; let src = this.down[levels - 1];
      for (let i = levels - 2; i >= 1; i--) {
        u.tSrc.value = src.texture; u.tAdd.value = this.down[i].texture; u.uTexel.value.set(1 / src.width, 1 / src.height);
        this.pass(this.mUp, this.up[i]); src = this.up[i];
      }
      bloomTex = src.texture;
    }

    // 7) son geçiş: ekrana
    const f = this.uFinal;
    f.tScene.value = this.hdrRT.texture; f.tBloom.value = bloomTex; f.tAdapt.value = next.texture;
    f.uTime.value = (f.uTime.value + dt) % 1000;
    this.pass(this.mFinal, null);
  }
}
