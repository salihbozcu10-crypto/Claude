// Gömülü yazı tipleri (dosya:// altında da çalışsın diye data-URL olarak pakete girer)
//   Caveat (OFL-1.1, Google Fonts / @fontsource): fotoğrafın arkasındaki el yazısı notu
import caveatLatin from '@fontsource/caveat/files/caveat-latin-600-normal.woff2';
import caveatLatinExt from '@fontsource/caveat/files/caveat-latin-ext-600-normal.woff2';

export const HAND_FONT = 'SynHand';

const faces = [
  new FontFace(HAND_FONT, `url(${caveatLatin})`, { weight: '600', unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }),
  new FontFace(HAND_FONT, `url(${caveatLatinExt})`, { weight: '600', unicodeRange: 'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF' }),
];

// Tüm yüzler yüklenip belgeye eklendiğinde çözülür; SYN.ready bunu bekler.
export const fontsReady = Promise.all(faces.map((f) => f.load().then((ff) => { document.fonts.add(ff); return ff; })))
  .then(() => document.fonts.load(`600 48px ${HAND_FONT}`, 'ğşıİçöü'))
  .catch((e) => { console.error('font yüklenemedi', e); });
