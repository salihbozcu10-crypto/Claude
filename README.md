# Özel Kuvvetler

Tarayıcıda çalışan, tamamen özgün bir taktik birinci şahıs nişancı oyunu. Görev: **Sessiz Vadi Harekâtı** — şafak sökerken düşman hattının gerisindeki tesise tek başına sız, telsiz direğini sabote et, istihbaratı al, rehineyi kurtar ve helikopterle tahliye ol.

Oyun tek bir dosyadır: `index.html`. İndirip çift tıklayarak ya da herhangi bir statik sunucudan açarak oynanır; dış dosyaya, kuruluma ya da internet bağlantısına gerek yoktur (yalnızca yazı tipleri çevrimiçi yüklenir, yoksa sistem yazı tipi kullanılır).

## Özellikler

- **Görüntü:** HDR render hattı, fiziksel tabanlı (PBR) malzemeler, yumuşak güneş gölgeleri, ekran uzayı ortam gölgesi (SSAO), yükseklik sisi, ışık huzmeleri, bloom, otomatik pozlama, film ton eğrisi ve gren. Tüm dokular (beton, sıva, sac, ahşap, kum, kumaş…) açılışta cihazda prosedürel olarak üretilir.
- **Üç zaman dilimi:** şafak, gündüz ve gece. Gece görüş gözlüğü (GGC) ve kızılötesi aydınlatıcı.
- **Balistik:** mermiler gerçek namlu hızıyla uçar, yer çekimiyle düşer; ince ahşap, sac ve kumaşı deler, sert yüzeylerden sekebilir. Ses, mesafeye göre gecikmeli duyulur.
- **Silahlar:** susturuculu 5.56 karabina (holografik nişangâh, tek/otomatik atış), susturuculu 9 mm tabanca, el bombası, flaş bombası. Şarjör bazlı mühimmat takibi.
- **Yapay zekâ:** görüş konisi ve işitme ile algı, şüphelenme / araştırma / çatışma / arama durumları, siper alma, yan adım, el bombası atma, ceset fark edip alarm verme, takviye çağırma.
- **Hareket:** koşma, çömelme, köşeden eğilerek bakma, alçak engelleri aşma, sargı ile iyileşme.
- **Ses:** silah, mermi vınlaması, adım, patlama, rüzgâr, helikopter dahil tüm sesler WebAudio ile sentezlenir.
- Fare + klavye ve dokunmatik ekran desteği; dört grafik kalitesi ve dört zorluk düzeyi.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| W A S D | Hareket |
| Fare | Bakış · sol tık ateş · sağ tık nişan |
| Shift | Koş |
| C | Çömel |
| Boşluk | Zıpla / alçak engeli aş |
| Q / E | Köşeden eğil |
| R | Şarjör değiştir |
| B | Atış modu |
| 1 / 2 | Karabina / tabanca |
| G / T | El bombası / flaş bombası |
| F | Etkileşim (basılı tut) |
| H | Sargı (basılı tut) |
| N | Gece görüş gözlüğü |
| Tab | Hedefler |
| Esc | Duraklat |

Dokunmatik ekranda sol yarı hareket çubuğu, sağ yarı bakıştır; düğmeler ekranın sağındadır.

## Geliştirme

```bash
npm install
npm run build      # src/ -> index.html (tek dosya)
node build.mjs --dev   # küçültmeden derler
```

Kaynak kod `src/` altındadır: `gfx/` (dokular, malzemeler, gökyüzü, görüntü işleme, efektler), `world/` (arazi, bölge düzeni, donanım, helikopter), `game/` (oyuncu, silahlar, balistik, askerler, yapay zekâ, görev), `ui/` (gösterge paneli, menüler), `core/` (girdi, ses, yardımcılar). `tools/` içindeki betikler başsız tarayıcıyla ekran görüntüsü alır ve görev akışını otomatik sınar.

Üç boyutlu çizim için [three.js](https://threejs.org), çarpışma ve ışın sorguları için [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) kullanılır (ikisi de MIT lisanslı ve derlemeye gömülüdür).
