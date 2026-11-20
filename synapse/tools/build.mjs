// src/main.js → dist/synapse.js (IIFE) + dist/index.html
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = process.argv.includes('--test') ? 'src/test.js' : 'src/main.js';
const oi = process.argv.indexOf('--out'); const outDir = oi > 0 ? resolve(process.argv[oi + 1]) : resolve(root, process.env.SYN_DIST || 'dist');
mkdirSync(outDir, { recursive: true });
await esbuild.build({ entryPoints: [resolve(root, entry)], bundle: true, format: 'iife', outfile: resolve(outDir, 'synapse.js'), minify: process.argv.includes('--min'), sourcemap: false, target: 'es2022', logLevel: 'warning', loader: { '.json': 'json', '.woff2': 'dataurl' } });
writeFileSync(resolve(outDir, 'index.html'), `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>SYNAPSE — Ölü Kod</title>
<style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style></head>
<body><canvas id="c"></canvas><script src="synapse.js"></script></body></html>`);
console.log('build ok:', entry, '->', outDir);
