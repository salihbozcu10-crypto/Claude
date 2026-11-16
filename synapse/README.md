# SYNAPSE — 1. Bölüm: "Ölü Kod"

Tamamen kodla üretilen, Pixar benzeri stilize 3D animasyon bölümü (yaklaşık 3 dakika,
1920×1080, 24 kare/sn, Türkçe seslendirme + altyazı). Görüntü three.js ile başsız Chromium'da
kare kare render edilir; ses (nöral Türkçe TTS, efektler, müzik) Python ile sentezlenip ffmpeg ile
birleştirilir.

## Klasörler

| Yol | İçerik |
| --- | --- |
| `src/engine/` | `stage.js` (render + sinematik görüntü işleme), `materials.js` (cilt/kumaş/saç gölgelendiricileri, prosedürel dokular), `util.js` (deterministik gürültü, easing, anahtar kare izi), `timeline.js`, `studio.js` |
| `src/characters/` | `rig.js` (iskelet, yüz, göz, kapak, kaş, ağız, el, yürüyüş, dudak senkronu), `poses.js`, `geo.js` (organik geometri), `atlas.js` `asya.js` `defne.js` `shadow.js` (karakter tasarımları), `index.js` |
| `src/sets/` | `serverRoom.js` (terk edilmiş analog sunucu odası), `base.js` (ekibin gizli üssü), `index.js` |
| `src/props/` | CRT monitör, el feneri, şok tabancası, tablet, nöral kablo, fotoğraf, drone… `index.js` |
| `src/shots/` | `episode.js` (çekim listesi), sahne dosyaları, diyalog zamanlaması |
| `assets/` | `dialogue.json` (metin), `voices/` (TTS çıktıları, dudak senkron verisi) |
| `audio/` | ses üretim ve miks betikleri |
| `tools/` | `build.mjs` (paketleme), `frames.mjs` (kare render), `look.sh` (hızlı inceleme) |

## Temel kurallar (kod yazan herkes için)

- **Birimler/eksenler:** metre; +y yukarı; karakterler varsayılan olarak +z'ye bakar; karakterin solu +x.
- **Determinizm:** `Math.random`, `Date.now`, `performance.now` YOK. Rastgelelik için `rng(seed)`
  (`src/engine/util.js`). Her kare, yalnızca zamanın (t) fonksiyonudur; kareler paralel ve herhangi
  bir sırayla render edilebilir. Setler/aksesuarlar durumlarını her karede `update(t, ctx)` ile
  baştan kurar, `reset()` varsayılana döndürür.
- **Performans bütçesi:** render yazılımsal GPU (SwiftShader) ile CPU'da yapılır. Bir sette toplam
  ışık ≤ 8, gölge düşüren ışık ≤ 2 (tercihen 1), görünür üçgen ≲ 300 bin. Pahalı efektler (hacimsel
  ışık, parçacık) ucuz hilelerle (eklemeli konik ışık huzmesi mesh'i, sprite toz) yapılır.
- **Kendinden ışıklı yüzeyler** (ekranlar, neon): `glowMaterial` — bloom'u besler. Ekran içerikleri
  `CanvasTexture` ile her karede yeniden çizilebilir (`texture.needsUpdate = true`).
- **Malzemeler:** karakterler için `skinMaterial`/`charMaterial`/`hairMaterial`; çevre için
  `envMaterial` (daha ucuz). Kenar ışığı rengi `RIM` (çekim başına ayarlanır).

## Modüller arası arayüzler

**Karakter** (`buildCharacter(spec)` → `ch`): `ch.reset()`, `ch.place(x, z, heading)`,
`ch.setPose(ad|nesne, w)`, `ch.mixPose(nesne, w)`, `ch.walk(phase, amount, {run})`,
`ch.lookAt(dünyaNoktası, baş, göz)`, `ch.expr(ad, w)`, `ch.face.{open, smile, browUp, ...}`,
`ch.say(lipData, t0)`, `ch.update(t)`, `ch.bones.<kemik>` (aksesuar takmak için: `ch.bones.rWrist.add(obj)`),
`ch.extras.<ad>` (karaktere özel animasyonlu parçalar).

**Set** (`createX(stage)` →): `{ group, update(t, ctx), reset(), anchors, previewCams, preview(t,ctx)?, ...kontroller }`

**Aksesuar** (`buildProps(stage)` → `{ ad: { group, update(t, ctx), reset(), preview?(t,ctx), ...kontroller } }`)

**Çekim:** `{ id, scene, set, dur, desc, cues: [{type:'line'|'sfx'|'music', id, at}], update(ctx, lt, k, t) }`
— `ctx = { stage, scene, camera, post, chars, sets, props, RIM, THREE, t }`.

## İnceleme ve render

```bash
npm install
node tools/build.mjs                       # dist/ (ya da --out <klasör>)
tools/look.sh /tmp/yuz.jpg "mode=char&name=defne&view=face&expr=happy"
tools/look.sh /tmp/set.jpg "mode=set&name=serverRoom&cam=0"
tools/look.sh /tmp/prop.jpg "mode=prop&name=crt"
tools/look.sh /tmp/cekim.jpg "mode=shot&id=s1_03" 960 540 1.5
node tools/frames.mjs --from 0 --to 4319 --out frames/   # tam bölüm kareleri
```

Önizleme görünümleri (`mode=char`): `view=face|faceL|bust|threeq|full|side|back|hands|top`,
`pose=<poses.js>`, `expr=happy,worried:0.5`, `open=0.4`, `smile=..`, `eyeGlow=1`, `walk=0.5`, `rot=<radyan>`.
