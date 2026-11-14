// Derleme betiği: src/main.js -> tek dosyalık, kendi kendine yeten index.html
//   node build.mjs            -> index.html (bağımsız oyun sayfası)
//   node build.mjs --watch    -> kaynak değiştikçe yeniden derler
//   node build.mjs --artifact <yol>  -> ayrıca sarmalayıcısız sayfa gövdesi üretir
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const dev = args.includes('--dev');
const artifactIdx = args.indexOf('--artifact');
const artifactPath = artifactIdx >= 0 ? resolve(args[artifactIdx + 1]) : null;

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@400;500;600;700&family=Saira+Stencil+One&family=IBM+Plex+Mono:wght@400;500&display=swap">';

function assemble(js) {
  const css = readFileSync(resolve(root, 'src/ui/style.css'), 'utf8');
  const markup = readFileSync(resolve(root, 'src/ui/markup.html'), 'utf8');
  // Satır içi betikte </script ve <!-- dizilerini etkisizleştir
  const safeJs = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  const head = `<title>Sessiz Vadi Harekâtı</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${FONTS}\n<style>\n${css}\n</style>`;
  const body = `${markup}\n<script>\n${safeJs}\n</script>`;
  const standalone = `<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n<meta name="theme-color" content="#0b0e0c">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  writeFileSync(resolve(root, 'index.html'), standalone);
  if (artifactPath) {
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, `${head}\n${body}\n`);
  }
  const kb = (Buffer.byteLength(standalone) / 1024).toFixed(0);
  console.log(`[build] index.html ${kb} KB${artifactPath ? ' (+ artifact)' : ''}`);
}

const options = {
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: !dev,
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
  define: { __DEV__: dev ? 'true' : 'false' },
};

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [{
      name: 'assemble',
      setup(b) { b.onEnd((r) => { if (r.outputFiles?.[0]) assemble(r.outputFiles[0].text); }); },
    }],
  });
  await ctx.watch();
  console.log('[build] izleniyor…');
} else {
  const r = await build(options);
  assemble(r.outputFiles[0].text);
}
