# SYNAPSE — 1. Bölüm: "Ölü Kod"

Tamamen kodla üretilmiş, Pixar benzeri stilize 3D animasyon bölümü.

| | |
| --- | --- |
| Süre | 3 dk 20 sn (200,7 sn, 45 çekim) |
| Görüntü | 1920×1080, 24 kare/sn, H.264 High, BT.709 (1600×900 render + Lanczos ölçekleme) |
| Ses | 48 kHz stereo, AAC 320 kbps, −14 LUFS / −1,5 dBTP (YouTube seviyesi) |
| Dil | Türkçe seslendirme + Türkçe altyazı (gömülü sürüm ve ayrı `.srt`) |

Teslim dosyaları (`out/` altında üretilir): `SYNAPSE_B01_Olu_Kod.mp4` (temiz),
`SYNAPSE_B01_Olu_Kod_altyazili.mp4` (altyazı gömülü), `SYNAPSE_B01_Olu_Kod.tr.srt`, `thumbnail.jpg`.

## Bölüm akışı

1. **Teaser — Antika Sinyal** (0:00–0:53): yer altındaki terk edilmiş analog sunucu odası; kablosuz
   CRT kendiliğinden açılır, 00:15:00'dan geri sayar; camdaki yansımada dördüncü siluet; kan
   kırmızısı mesaj ve sistem sesi.
2. **Başlık** (0:53–0:58)
3. **Sığınak ve Kilitlenen Zihinler** (0:58–1:54): Asya masaya vurur; Atlas yorgun; Defne sayacın
   anlamını çözer: son üç yılın anıları silinecek.
4. **Son İki Dakika** (1:54–2:42): drone'lar kapıya vurur, alarm; Atlas kabloyu kendi boynundaki
   nöral porta takar, gözleri bembeyaz olur, sayaç 00:00:01'de donar; Defne ana şalteri indirir.
5. **Final ve Büyük Gizem** (2:42–3:16): sessizlik; Atlas yığılır ve uyanır; Defne masanın altında
   hiç hatırlamadıkları bir anın fotoğrafını bulur — arkasında kendi el yazısı: "4. kişiye dikkat et."
   Karanlık ekranın yansımasında Defne'nin gölgesi köşeye el sallar.
6. **Bitiş kartı** — "Devam edecek..."

## Karakterler (referans: kullanıcının paylaştığı Pixar tarzı görsel)

- **Defne (22)** — referansa en yakın tasarım: kıvırcık topuz saç ve pembe toka, çiller, büyük kahve
  gözler, gökkuşağı çizgili tişört + kot salopet; boynunda kulaklık, dijital bileklik, buklelerinde
  gizli koyu mor bir tutam.
- **Asya (23)** — asimetrik siyah kesim (tıraşlı yan), kızıl/fuşya tutam, sol kaşta yara izi,
  kırmızı-siyah deri ceket, parmaksız eldiven, dizlik, bot; modifiye şok tabancası.
- **Atlas (24)** — dağınık koyu saç, yorgun bakış, sakal gölgesi, camgöbeği şeritli antrasit teknik
  ceket; boynunun solunda parlayan nöral port; dijital beyaz gözler.
- **4. kişi** — kapüşonlu, uzun paltolu siyah siluet.

## Üretim hattı

```bash
npm install
node tools/build.mjs                 # src/ → dist/ (tek dosya paket)
python3 audio/voices.py              # Türkçe TTS + dudak senkronu (assets/voices/)
python3 audio/sfx.py && python3 audio/music.py   # efekt kütüphanesi ve özgün müzik
node tools/cues.mjs                  # bölümün ses/altyazı ipuçları → out/cues.json
python3 audio/mix.py --cues out/cues.json --dur 200.7 --out out/mix.wav
node tools/subs.mjs                  # out/*.srt + out/subs.ass
tools/render_all.sh 1600 900         # kareler → frames/ (devam ettirilebilir; aralık verilebilir)
tools/encode.sh                      # MP4 teslim dosyaları
```

İnceleme: `tools/look.sh out.jpg "mode=char&name=defne&view=face&expr=happy"`,
`node tools/sheet.mjs --out s.jpg "mode=episode@t=12" "mode=episode@t=150"` (çoklu kare).

## Klasörler

| Yol | İçerik |
| --- | --- |
| `src/engine/` | `stage.js` (render + DOF, bloom, ACES, renk derecelendirme, gren, kromatik sapma, sinemaskop), `materials.js` (alt yüzey saçılımlı cilt, kumaş, saç), `util.js`, `timeline.js` |
| `src/characters/` | `rig.js` (iskelet, yüz: göz/kapak/kaş/ağız/dişler, eller, yürüyüş, kol IK, dudak senkronu), `poses.js`, `hairkit.js`, `wardrobe.js`, `atlas.js` `asya.js` `defne.js` `shadow.js` |
| `src/sets/` | `serverRoom.js`, `base.js`, `title.js`, `common.js` |
| `src/props/` | CRT (geri sayım + gerçek cam yansıması), el feneri, şok tabancası, tablet, nöral kablo, fotoğraf |
| `src/shots/` | `scene1..4.js`, `cards.js`, `helpers.js`, `episode.js` |
| `audio/` | `voices.py`, `sfx.py`, `music.py`, `mix.py`, `dsp.py` |
| `assets/` | `dialogue.json`, `voices/` (TTS çıktıları + dudak senkronu) |
| `tools/` | `build.mjs`, `frames.mjs`, `render_all.sh`, `sheet.mjs`, `look.sh`, `cues.mjs`, `subs.mjs`, `encode.sh` |

## Kurallar (geliştirenler için)

Birimler metre, +y yukarı, karakterler +z'ye bakar (solu +x). Her kare yalnızca zamanın fonksiyonudur
(`Math.random`/`Date` yok; `rng(seed)`), bu yüzden kareler herhangi bir sırayla/paralel render edilebilir.
Render yazılımsal GPU (SwiftShader) ile CPU'da yapılır: ışık sayısı az tutulur, şiddeti 0 olan ışıklar
otomatik gizlenir.

## Lisanslar ve kaynaklar

- Seslendirme: [Piper](https://github.com/rhasspy/piper) Türkçe sesleri **fahrettin** ve **fettah** (CC0),
  kadın sesleri WORLD vokoderi (pyworld) ile perde/formant dönüşümüyle türetildi. Ticari kullanıma uygundur.
- Müzik ve ses efektleri: bu depodaki betiklerle sentezlendi (özgün).
- 3D: [three.js](https://threejs.org) (MIT). Tüm modeller, dokular ve animasyonlar prosedüreldir.
