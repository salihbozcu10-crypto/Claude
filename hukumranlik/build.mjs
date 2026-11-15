// Derleme: src -> tek dosyalık index.html (ve istenirse sarmalayıcısız yayın sayfası)
//   node build.mjs [--dev] [--artifact <yol>]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const dev = args.includes('--dev'); const ai = args.indexOf('--artifact'); const artifactPath = ai >= 0 ? resolve(args[ai + 1]) : null;
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap">';
const r = await build({ entryPoints: [resolve(root, 'src/main.js')], bundle: true, format: 'iife', target: 'es2020', minify: !dev, legalComments: 'none', write: false, loader: { '.json': 'json' }, logLevel: 'warning' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = readFileSync(resolve(root, 'src/ui/style.css'), 'utf8'), markup = readFileSync(resolve(root, 'src/ui/markup.html'), 'utf8');
const head = `<title>Hükümranlık</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${FONTS}\n<style>\n${css}\n</style>`;
const body = `${markup}\n<script>\n${js}\n</script>`;
writeFileSync(resolve(root, 'index.html'), `<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n<meta name="theme-color" content="#0d121a">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
if (artifactPath) { mkdirSync(dirname(artifactPath), { recursive: true }); writeFileSync(artifactPath, `${head}\n${body}\n`); }
console.log('[build] index.html', (Buffer.byteLength(body) / 1024).toFixed(0), 'KB' + (artifactPath ? ' (+ yayın sayfası)' : ''));
