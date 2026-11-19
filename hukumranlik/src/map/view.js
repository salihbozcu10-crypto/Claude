// Harita görünümü: three.js sahnesi, harita gölgelendiricisi, kamera denetimi, seçim (picking)
import * as THREE from 'three';

const PROV_TEX_W = 64; // eyalet bilgi dokuları 64 sütunlu 2B düzende
// Miller izdüşümünün harita üst/alt enlemleri (generate.js ile aynı: 84°K, 58°G)
const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * Math.PI / 180));
const MILLER_Y0 = millerY(84), MILLER_Y1 = millerY(-58);

const VERT = /* glsl */`
out vec2 vUv; out vec3 vWorld;
void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const FRAG = /* glsl */`
precision highp float; precision highp int;
in vec2 vUv; in vec3 vWorld; out vec4 fragColor;
uniform sampler2D tId, tField, tTerrain, tCol, tPrev, tAnim, tOwn, tNoise;
uniform vec2 uSize; uniform float uTime, uPx, uPolitical, uClouds, uPlayer; uniform vec2 uRes; uniform vec3 uCamPos;
uniform vec2 uMiller, uSnow, uIce;                // Miller izdüşümü sınırları; mevsimlik kar ve deniz buzu enlemleri (kuzey, güney)
ivec2 pc(int id) { return ivec2(id & 63, id >> 6); }
int dec(float a, float b) { return int(a * 255.0 + 0.5) + int(b * 255.0 + 0.5) * 256; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { return texture(tNoise, p / 256.0).r; }
float fbm(vec2 p) { return n2(p) * 0.5 + n2(p * 2.03 + 17.0) * 0.25 + n2(p * 4.11 + 41.0) * 0.125 + n2(p * 8.3 + 7.0) * 0.0625; }
void main() {
  vec2 tuv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 mp = tuv * uSize;                         // harita pikseli (kuzey üstte)
  float t = uTime; float pxw = 1.0 / max(uPx, 0.05);
  // dört komşu pikselden çift doğrusal ağırlıklı çoğunluk: sınırlar basamaksız
  vec2 bp = mp - 0.5; ivec2 b0 = ivec2(floor(bp)); vec2 f = bp - vec2(b0);
  ivec2 mx = ivec2(uSize) - 1;
  vec4 q00 = texelFetch(tId, clamp(b0, ivec2(0), mx), 0), q10 = texelFetch(tId, clamp(b0 + ivec2(1, 0), ivec2(0), mx), 0);
  vec4 q01 = texelFetch(tId, clamp(b0 + ivec2(0, 1), ivec2(0), mx), 0), q11 = texelFetch(tId, clamp(b0 + ivec2(1, 1), ivec2(0), mx), 0);
  int i00 = dec(q00.r, q00.g), i10 = dec(q10.r, q10.g), i01 = dec(q01.r, q01.g), i11 = dec(q11.r, q11.g);
  float w00 = (1.0 - f.x) * (1.0 - f.y), w10 = f.x * (1.0 - f.y), w01 = (1.0 - f.x) * f.y, w11 = f.x * f.y;
  float s00 = w00 + (i10 == i00 ? w10 : 0.0) + (i01 == i00 ? w01 : 0.0) + (i11 == i00 ? w11 : 0.0);
  float s10 = w10 + (i00 == i10 ? w00 : 0.0) + (i01 == i10 ? w01 : 0.0) + (i11 == i10 ? w11 : 0.0);
  float s01 = w01 + (i00 == i01 ? w00 : 0.0) + (i10 == i01 ? w10 : 0.0) + (i11 == i01 ? w11 : 0.0);
  float s11 = w11 + (i00 == i11 ? w00 : 0.0) + (i10 == i11 ? w10 : 0.0) + (i01 == i11 ? w01 : 0.0);
  // kara için: deniz olmayan en ağır aday
  int id = 0; vec4 qq = q00; float bs = -1.0;
  if (i00 > 0 && s00 > bs) { bs = s00; id = i00; qq = q00; } if (i10 > 0 && s10 > bs) { bs = s10; id = i10; qq = q10; }
  if (i01 > 0 && s01 > bs) { bs = s01; id = i01; qq = q01; } if (i11 > 0 && s11 > bs) { bs = s11; id = i11; qq = q11; }
  int ac = dec(qq.b, qq.a);
  vec4 fld = texture(tField, tuv);
  float coast = fld.g * 255.0 - 127.5;           // + kara, - deniz (piksel), yumuşak
  bool outside = tuv.y < 0.0 || tuv.y > 1.0;
  if (outside) { coast = -60.0; id = 0; }
  bool isLand = id > 0 && coast > 0.0;
  vec3 col;
  // ---------------------------------------------------------------- enlem (ters Miller) ve mevsim sınırı titreşimi
  float myy = uMiller.x - tuv.y * (uMiller.x - uMiller.y);
  float lat = (2.5 * atan(exp(0.8 * myy)) - 1.9634954) * 57.29578;
  float sj = (n2(mp * 0.045) - 0.5) * 7.0 + (n2(mp * 0.011 + 23.0) - 0.5) * 6.0;
  // ---------------------------------------------------------------- deniz
  float depth = clamp(-coast / 90.0, 0.0, 1.0);
  vec2 wq = mp * 0.045;
  float w1 = n2(wq * 2.0 + vec2(t * 0.35, t * 0.22)), w2 = n2(wq * 3.1 - vec2(t * 0.28, -t * 0.4) + 31.0);
  vec2 wn = vec2(w1 - 0.5, w2 - 0.5) * 1.3;
  vec3 deep = vec3(0.04, 0.12, 0.21), mid = vec3(0.07, 0.25, 0.36), shallow = vec3(0.15, 0.4, 0.46);
  vec3 sea = mix(shallow, mid, smoothstep(0.0, 0.07, depth));
  sea = mix(sea, deep, smoothstep(0.12, 0.9, depth));
  sea *= 0.9 + 0.2 * fbm(mp * 0.004 + 3.0);
  vec3 vdir = normalize(uCamPos - vWorld); vec3 ldir = normalize(vec3(-0.45, 0.75, 0.48));
  vec3 nrm = normalize(vec3(wn.x, 1.0, wn.y)); vec3 hv = normalize(vdir + ldir);
  float spec = pow(max(dot(nrm, hv), 0.0), 70.0) * 0.5;
  sea += vec3(1.0, 0.94, 0.82) * spec * (0.35 + 0.65 * depth) * smoothstep(0.35, 1.6, uPx);
  sea += (w1 + w2 - 1.0) * 0.03 * smoothstep(0.3, 1.2, uPx);
  float shoreD = max(-coast, 0.0);
  float foam = smoothstep(0.86, 1.0, sin(shoreD * 0.9 - t * 1.6 + n2(mp * 0.05) * 7.0)) * (1.0 - smoothstep(0.5, 6.0, shoreD));
  sea = mix(sea, vec3(0.8, 0.88, 0.9), foam * 0.4 * smoothstep(0.8, 2.5, uPx));
  // kutup denizleri: harita dışında buz ve koyu deniz
  float polar = smoothstep(0.02, -0.12, tuv.y) + smoothstep(0.98, 1.12, tuv.y);
  sea = mix(sea, vec3(0.62, 0.7, 0.76) * (0.85 + 0.25 * fbm(mp * 0.01)), smoothstep(0.0, 0.08, -tuv.y) * 0.85);
  sea *= 1.0 - smoothstep(1.05, 1.3, tuv.y) * 0.5;
  { // mevsimlik deniz buzu: kışın kuzey denizleri donar, yazın çözülür
    float lon = tuv.x * 360.0 - 180.0; float gulf = smoothstep(-40.0, -18.0, lon) * smoothstep(58.0, 30.0, lon) * 13.0;   // Golf Akıntısı: Norveç Denizi açık kalır
    float iN = smoothstep(uIce.x + gulf - 1.3, uIce.x + gulf + 1.3, lat + sj * 0.6), iS = smoothstep(-uIce.y - 1.3, -uIce.y + 1.3, -lat + sj * 0.6);
    float ik = max(iN, iS) * (1.0 - foam * 0.5);
    vec3 iceC = vec3(0.8, 0.87, 0.92) * (0.86 + 0.22 * n2(mp * 0.09 + 5.0));
    float crack = smoothstep(0.47, 0.5, n2(mp * 0.23)) * smoothstep(0.53, 0.5, n2(mp * 0.23));
    sea = mix(sea, iceC * (1.0 - crack * 0.25), ik * 0.9);
  }
  // ---------------------------------------------------------------- kara
  vec3 terr = texture(tTerrain, tuv).rgb;
  { // mevsimlik kar örtüsü: yükseklik karı güneye taşır; gölgelendirme korunur
    float hgt = fld.b; float lumT = dot(terr, vec3(0.3, 0.55, 0.15));
    float sN = smoothstep(uSnow.x - 2.2, uSnow.x + 2.2, lat + sj + hgt * 30.0);
    float sS = smoothstep(-uSnow.y - 2.2, -uSnow.y + 2.2, -lat + sj + hgt * 30.0);
    vec3 snowC = vec3(0.9, 0.93, 0.97) * (0.68 + 0.6 * lumT);
    terr = mix(terr, snowC, max(sN, sS) * 0.82);
  }
  vec3 land = terr;
  if (id > 0) {
    vec4 cur = texelFetch(tCol, pc(id), 0), prev = texelFetch(tPrev, pc(id), 0);
    vec4 an = texelFetch(tAnim, pc(id), 0);
    vec4 own = texelFetch(tOwn, pc(id), 0);
    int flags = int(own.b * 255.0 + 0.5);
    vec3 pcol = cur.rgb; float ring = 0.0; vec3 ringCol = vec3(0.0);
    float age = t - an.a;
    if (age < 3.0) {
      vec2 dd = mp - an.xy; dd.x -= uSize.x * floor(dd.x / uSize.x + 0.5);   // dikiş çizgisini aşan uzaklık
      float d = length(dd) / max(an.z, 4.0);
      float front = age * 1.25 - d; float on = step(0.0, age);
      if (prev.a > 0.5) { // fetih: yeni sahibin rengi merkezden yayılır (başlamadan önce önceki renk)
        pcol = mix(prev.rgb, cur.rgb, smoothstep(0.0, 0.08, front));
        ring = exp(-pow(front * 9.0, 2.0)) * (1.0 - age / 3.0) * on;
        ringCol = cur.rgb * 1.2 + vec3(0.6, 0.54, 0.36);
      } else { // diplomasi dalgası: ülkenin üzerinden geçen ışık bandı ve sönen iz
        float band = exp(-pow(front * 5.0, 2.0)) * on;
        float trail = smoothstep(0.0, 0.05, front) * exp(-max(front, 0.0) * 2.2) * on;
        float fade = 1.0 - age / 3.0;
        ring = (band + trail * 0.3) * fade;
        pcol = mix(cur.rgb, prev.rgb, min(1.0, band * 0.75 + trail * 0.3) * fade);
        ringCol = prev.rgb * 0.85 + 0.12;
      }
    }
    float lum = dot(terr, vec3(0.3, 0.55, 0.15));
    vec3 tinted = pcol * (0.42 + 0.85 * lum);
    land = mix(terr, tinted, uPolitical);
    if ((flags & 2) != 0) land *= 1.13;                                    // üzerine gelinen
    if ((flags & 4) != 0) land = mix(land, vec3(0.35, 0.85, 0.45), 0.22 + 0.08 * sin(t * 5.0));   // hareket hedefi
    if ((flags & 8) != 0) land = mix(land, vec3(0.95, 0.25, 0.18), 0.25 + 0.1 * sin(t * 6.0));   // saldırı hedefi
    land += ringCol * ring;
    // ---- sınırlar
    float bd = max(fld.r * 255.0 / 20.0 - 0.5, 0.0);                  // eyalet sınırı çizgisine uzaklık (harita pikseli)
    if (ac > 0) {
      vec4 owA = texelFetch(tOwn, pc(ac), 0);
      int oA = int(owA.r * 255.0 + 0.5) + int(owA.g * 255.0 + 0.5) * 256, oS = int(own.r * 255.0 + 0.5) + int(own.g * 255.0 + 0.5) * 256;
      if (oA != oS) {
        float w = (1.1 + 0.7 * smoothstep(0.5, 3.0, uPx)) * pxw;           // ülke sınırı
        float line = 1.0 - smoothstep(w * 0.5, w * 0.5 + pxw, bd);
        float glow = 1.0 - smoothstep(0.0, 7.0 * pxw, bd);
        land = mix(land, min(pcol * 1.3 + 0.06, 1.0), glow * 0.34 * uPolitical);
        int fA = int(owA.b * 255.0 + 0.5);
        if ((flags & 16) != 0 && (fA & 32) != 0 || (flags & 32) != 0 && (fA & 16) != 0) {   // cephe hattı
          float pulse = 0.55 + 0.45 * sin(t * 4.0 - bd * 0.9 / pxw);
          float fg = 1.0 - smoothstep(0.0, 9.0 * pxw, bd);
          land = mix(land, vec3(1.0, 0.24, 0.12), fg * 0.55 * pulse);
        }
        land = mix(land, vec3(0.07, 0.06, 0.06), line * 0.9);
      } else {
        float w = 0.9 * pxw; float line = 1.0 - smoothstep(w * 0.5, w * 0.5 + pxw, bd);
        land = mix(land, land * 0.45, line * 0.8 * smoothstep(0.3, 1.0, uPx));
      }
    }
    if ((flags & 1) != 0) { // seçili eyalet: altın iç ışıma
      float g = 1.0 - smoothstep(0.0, 10.0 * pxw, bd);
      land = mix(land, vec3(1.0, 0.86, 0.45), g * (0.55 + 0.25 * sin(t * 4.0)));
      land *= 1.08;
    }
  }
  float landK = isLand ? smoothstep(-0.5 * pxw, 0.5 * pxw, coast) : 0.0;
  // kıyı çizgisi (iki yanda ince koyu çizgi)
  float cl = 1.0 - smoothstep(0.35 * pxw, 1.25 * pxw, abs(coast));
  col = mix(sea, land, landK);
  col = mix(col, vec3(0.06, 0.07, 0.08), cl * (outside ? 0.0 : 0.55));
  // ---------------------------------------------------------------- bulutlar ve gölgeleri
  if (uClouds > 0.001) {
    vec2 cp = mp * 0.0035 + vec2(t * 0.004, t * 0.0015);
    float cn = fbm(cp * 40.0); float cover = smoothstep(0.56, 0.8, cn);
    float sh = smoothstep(0.56, 0.8, fbm((cp + vec2(0.012, -0.007)) * 40.0));
    col *= 1.0 - sh * 0.22 * uClouds;
    col = mix(col, vec3(0.98, 0.99, 1.0), cover * 0.88 * uClouds);
  }
  // hafif kenar kararması
  vec2 sc = gl_FragCoord.xy / uRes - 0.5; col *= 1.0 - dot(sc, sc) * 0.55;
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

export class MapView {
  constructor(canvas, world) {
    this.world = world; this.canvas = canvas;
    const W = world.W, H = world.H; this.W = W; this.H = H;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace; r.toneMapping = THREE.NoToneMapping; r.setClearColor(0x0a1a2a, 1);
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(42, 1, 5, 20000);
    const mk = (data, w, h, linear, mip, type = THREE.UnsignedByteType) => { const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, type); t.minFilter = linear ? (mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter) : THREE.NearestFilter; t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter; t.generateMipmaps = !!mip; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; };
    this.tId = mk(world.idTex, W, H, false, false);
    this.tField = mk(world.fieldTex, W, H, true, true);
    this.tTerrain = mk(world.terrainRGBA, world.TW, world.TH, true, true);
    const PH = Math.ceil((world.P + 1) / PROV_TEX_W); this.PH = PH;
    this.colData = new Uint8Array(PROV_TEX_W * PH * 4); this.prevData = new Uint8Array(PROV_TEX_W * PH * 4); this.ownData = new Uint8Array(PROV_TEX_W * PH * 4);
    this.animData = new Float32Array(PROV_TEX_W * PH * 4);
    for (let p = 1; p <= world.P; p++) { const pr = world.provinces[p]; this.animData[p * 4] = pr.cx; this.animData[p * 4 + 1] = pr.cy; this.animData[p * 4 + 2] = Math.max(6, Math.sqrt(pr.area) * 0.9); this.animData[p * 4 + 3] = -100; }
    this.tCol = mk(this.colData, PROV_TEX_W, PH, false, false); this.tPrev = mk(this.prevData, PROV_TEX_W, PH, false, false); this.tOwn = mk(this.ownData, PROV_TEX_W, PH, false, false);
    this.tAnim = mk(this.animData, PROV_TEX_W, PH, false, false, THREE.FloatType);
    { const S = 256, d = new Uint8Array(S * S * 4); let s = 9; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const layer = (cells) => { const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rnd(); return (x, y) => { const fx = x / S * cells, fy = y / S * cells; const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy; const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty); const a = g[(iy % cells) * cells + (ix % cells)], b = g[(iy % cells) * cells + ((ix + 1) % cells)], c = g[((iy + 1) % cells) * cells + (ix % cells)], e = g[((iy + 1) % cells) * cells + ((ix + 1) % cells)]; return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v; }; };
      const L = [layer(8), layer(16), layer(32), layer(64)], L2 = [layer(8), layer(16), layer(32), layer(64)];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; const f = L[0](x, y) * 0.5 + L[1](x, y) * 0.25 + L[2](x, y) * 0.15 + L[3](x, y) * 0.1; const f2 = L2[0](x, y) * 0.5 + L2[1](x, y) * 0.25 + L2[2](x, y) * 0.15 + L2[3](x, y) * 0.1; d[i] = f * 255; d[i + 1] = f2 * 255; d[i + 2] = L[3](x, y) * 255; d[i + 3] = 255; }
      this.tNoise = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); this.tNoise.wrapS = this.tNoise.wrapT = THREE.RepeatWrapping; this.tNoise.minFilter = THREE.LinearMipmapLinearFilter; this.tNoise.magFilter = THREE.LinearFilter; this.tNoise.generateMipmaps = true; this.tNoise.needsUpdate = true; }
    this.uniforms = {
      tId: { value: this.tId }, tField: { value: this.tField }, tTerrain: { value: this.tTerrain }, tCol: { value: this.tCol }, tPrev: { value: this.tPrev }, tAnim: { value: this.tAnim }, tOwn: { value: this.tOwn }, tNoise: { value: this.tNoise },
      uSize: { value: new THREE.Vector2(W, H) }, uTime: { value: 0 }, uPx: { value: 1 }, uPolitical: { value: 0.62 }, uClouds: { value: 0 }, uPlayer: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uCamPos: { value: new THREE.Vector3() },
      uMiller: { value: new THREE.Vector2(MILLER_Y0, MILLER_Y1) }, uSnow: { value: new THREE.Vector2(45, -68) }, uIce: { value: new THREE.Vector2(63, -68) },
    };
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms });
    const EXT = 0.6; const geo = new THREE.PlaneGeometry(W, H * (1 + 2 * EXT), 1, 1); geo.rotateX(-Math.PI / 2); { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (1 + 2 * EXT) - EXT); }
    this.planes = [-1, 0, 1].map((k) => { const m = new THREE.Mesh(geo, this.material); m.position.x = k * W; m.frustumCulled = false; this.scene.add(m); return m; });
    // kamera durumu: hedef nokta (harita pikseli), uzaklık
    this.target = new THREE.Vector2(W / 2, H * 0.42); this.dist = 2400; this.distGoal = 2400; this.vel = new THREE.Vector2(); this.fly = null;
    this.minDist = 70; this.maxDist = 4200; this.shake = 0;
    this._v = new THREE.Vector3(); this._ray = new THREE.Raycaster(); this._m = new THREE.Matrix4(); this.vp = new THREE.Matrix4();
    this.resize();
  }

  // eyalet görsel durumunu yükle (renk, sahip, bayraklar)
  setProvince(p, rgb, owner, flags) {
    const o = p * 4; const c = this.colData, w = this.ownData;
    c[o] = rgb[0]; c[o + 1] = rgb[1]; c[o + 2] = rgb[2]; c[o + 3] = 255; w[o] = owner & 255; w[o + 1] = owner >> 8; w[o + 2] = flags; w[o + 3] = 255;
  }
  setFlags(p, flags) { this.ownData[p * 4 + 2] = flags; }
  // fetih animasyonu: önceki rengi sakla, dalgayı başlat
  capture(p, prevRgb, startDelay = 0) {
    const o = p * 4, pr = this.world.provinces[p]; this.prevData[o] = prevRgb[0]; this.prevData[o + 1] = prevRgb[1]; this.prevData[o + 2] = prevRgb[2]; this.prevData[o + 3] = 255;
    this.animData[o] = pr.cx; this.animData[o + 1] = pr.cy; this.animData[o + 2] = Math.max(6, Math.sqrt(pr.area) * 0.9);
    this.animData[o + 3] = this.uniforms.uTime.value + startDelay; this.tAnim.needsUpdate = true; this.tPrev.needsUpdate = true;
  }
  // diplomasi dalgası: ortak bir merkezden (ox, oy) ülkenin üzerinden geçen renkli ışık bandı
  wave(p, rgbCol, ox, oy, radius, startDelay = 0) {
    const o = p * 4; this.prevData[o] = rgbCol[0]; this.prevData[o + 1] = rgbCol[1]; this.prevData[o + 2] = rgbCol[2]; this.prevData[o + 3] = 0;
    this.animData[o] = ox; this.animData[o + 1] = oy; this.animData[o + 2] = radius; this.animData[o + 3] = this.uniforms.uTime.value + startDelay;
    this.tAnim.needsUpdate = true; this.tPrev.needsUpdate = true;
  }
  commit() { this.tCol.needsUpdate = true; this.tOwn.needsUpdate = true; }

  resize() {
    const w = innerWidth, h = innerHeight; const dpr = Math.min(devicePixelRatio || 1, this.maxDpr || 2);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.uniforms.uRes.value.set(w * dpr, h * dpr); this.sw = w; this.sh = h;
    // en uzak: harita yüksekliği ekrana sığsın; en yakın: 1 harita pikseli ≈ 7 ekran pikseli
    const fovF = 2 * Math.tan(this.camera.fov * Math.PI / 360);
    this.maxDist = Math.min(this.H * 0.98 / fovF, h / (fovF * 0.3)); this.minDist = h / 4.2 / fovF;
    this.dist = Math.min(this.dist, this.maxDist); this.distGoal = Math.min(this.distGoal, this.maxDist);
  }

  tiltFor(d) { const k = 1 - Math.min(1, Math.max(0, (d - this.minDist) / (this.maxDist * 0.7 - this.minDist))); return (8 + 40 * k * k) * Math.PI / 180; }

  updateCamera(dt) {
    if (this.fly) { const f = this.fly; f.t += dt / f.dur; const k = f.t >= 1 ? 1 : 1 - Math.pow(1 - f.t, 3); this.target.lerpVectors(f.from, f.to, k); const arc = Math.sin(Math.PI * Math.min(1, f.t)) * f.lift; this.dist = this.distGoal = f.d0 + (f.d1 - f.d0) * k + arc; if (f.t >= 1) this.fly = null; }
    else { this.dist += (this.distGoal - this.dist) * (1 - Math.exp(-dt * 10)); this.target.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.exp(-dt * 5)); }
    this.target.x = ((this.target.x % this.W) + this.W) % this.W; this.target.y = Math.max(this.H * 0.05, Math.min(this.H * 0.95, this.target.y));
    const tilt = this.tiltFor(this.dist); const cam = this.camera;
    const tx = this.target.x - this.W / 2, tz = this.target.y - this.H / 2;
    let sx = 0, sz = 0; if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); sx = (Math.random() - 0.5) * this.shake * this.dist * 0.01; sz = (Math.random() - 0.5) * this.shake * this.dist * 0.01; }
    cam.position.set(tx + sx, this.dist * Math.cos(tilt), tz + this.dist * Math.sin(tilt) + sz); cam.lookAt(tx + sx, 0, tz + sz); cam.updateMatrixWorld();
    cam.near = Math.max(1, this.dist * 0.1); cam.far = this.dist * 8 + 2000; cam.updateProjectionMatrix();
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    // ekran pikseli başına harita pikseli (merkezde)
    const fovF = 2 * Math.tan(cam.fov * Math.PI / 360); this.pxScale = this.sh / (fovF * this.dist);
    this.uniforms.uPx.value = this.pxScale; this.uniforms.uCamPos.value.copy(cam.position);
    // bulutlar yalnız uzak görünümde
    this.uniforms.uClouds.value = this.cloudsOn ? Math.max(0, Math.min(1, (0.75 - this.pxScale) / 0.45)) : 0;
  }

  flyTo(x, y, dist, dur = 1.4) { const from = this.target.clone(); let tx = x; if (tx - from.x > this.W / 2) tx -= this.W; else if (from.x - tx > this.W / 2) tx += this.W; const d1 = Math.max(this.minDist, Math.min(this.maxDist, dist ?? this.dist)); this.fly = { from, to: new THREE.Vector2(tx, y), d0: this.dist, d1, t: 0, dur, lift: Math.min(900, from.distanceTo(new THREE.Vector2(tx, y)) * 0.25) }; this.vel.set(0, 0); }

  // ekran -> harita pikseli (y=0 düzlemiyle kesişim)
  screenToMap(sx, sy) {
    const ndc = new THREE.Vector2(sx / this.sw * 2 - 1, -(sy / this.sh) * 2 + 1); this._ray.setFromCamera(ndc, this.camera);
    const o = this._ray.ray.origin, d = this._ray.ray.direction; if (Math.abs(d.y) < 1e-6) return null; const t = -o.y / d.y; if (t < 0) return null;
    const x = o.x + d.x * t + this.W / 2, y = o.z + d.z * t + this.H / 2; return { x: ((x % this.W) + this.W) % this.W, y, rawX: x };
  }
  pick(sx, sy) { const m = this.screenToMap(sx, sy); if (!m || m.y < 0 || m.y >= this.H) return 0; return this.world.prov[Math.floor(m.y) * this.W + Math.floor(m.x)]; }
  // harita pikseli -> ekran (kameraya en yakın kopya)
  // near: başka bir noktanın dünya x'i verilirse o noktaya en yakın kopya seçilir (oklar dikiş çizgisini aşmasın)
  project(x, y, h = 0, out = { x: 0, y: 0, z: 0, s: 1 }, near) {
    let wx = x - this.W / 2; const cx = near ?? this.target.x - this.W / 2; if (wx - cx > this.W / 2) wx -= this.W; else if (cx - wx > this.W / 2) wx += this.W; out.wx = wx;
    const e = this.vp.elements; const wz = y - this.H / 2, wy = h;
    const cw = e[3] * wx + e[7] * wy + e[11] * wz + e[15]; const nx = (e[0] * wx + e[4] * wy + e[8] * wz + e[12]) / cw, ny = (e[1] * wx + e[5] * wy + e[9] * wz + e[13]) / cw;
    out.x = (nx * 0.5 + 0.5) * this.sw; out.y = (-ny * 0.5 + 0.5) * this.sh; out.z = cw; out.s = this.pxScale * this.dist / Math.max(1, cw); return out;
  }

  render(dt, time) { this.uniforms.uTime.value = time; this.updateCamera(dt); this.renderer.render(this.scene, this.camera); }
}
