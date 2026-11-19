// Türkçe altyazılar: out/cues.json + assets/dialogue.json + assets/voices/manifest.json → SRT ve stilli ASS
//   node tools/subs.mjs  → out/SYNAPSE_B01_Olu_Kod.tr.srt, out/subs.ass
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cues = JSON.parse(readFileSync(resolve(root, 'out/cues.json')));
const D = JSON.parse(readFileSync(resolve(root, 'assets/dialogue.json')));
const M = JSON.parse(readFileSync(resolve(root, 'assets/voices/manifest.json')));
const byId = Object.fromEntries(D.lines.map((l) => [l.id, l]));
const MAXC = 42;

// metni okunabilir parçalara böl (cümle / üç nokta sınırları), sonra en çok 2 satıra sar
function chunks(text) {
  const parts = text.match(/[^.!?…]+(?:\.\.\.|[.!?…])+\s*|[^.!?…]+$/g).map((s) => s.trim()).filter(Boolean);
  const out = []; let cur = '';
  for (const p of parts) { if ((cur + ' ' + p).trim().length <= MAXC * 2 - 4) cur = (cur + ' ' + p).trim(); else { if (cur) out.push(cur); cur = p; } }
  if (cur) out.push(cur);
  // hâlâ çok uzunsa virgülden böl
  return out.flatMap((c) => {
    if (c.length <= MAXC * 2) return [c];
    const w = c.split(' '); const a = []; let s = '';
    for (const x of w) { if ((s + ' ' + x).trim().length > MAXC * 2 - 6) { a.push(s.trim()); s = x; } else s += ' ' + x; }
    if (s.trim()) a.push(s.trim()); return a;
  });
}
function wrap(s) {
  if (s.length <= MAXC) return [s];
  const w = s.split(' '); let best = [s, '']; let bestD = 1e9;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '); const d = Math.max(a.length, b.length) + Math.abs(a.length - b.length) * 0.3; if (d < bestD && a.length <= MAXC + 4 && b.length <= MAXC + 4) { bestD = d; best = [a, b]; } }
  return best;
}
const events = [];
for (const c of cues.filter((c) => c.type === 'line')) {
  const L = byId[c.id]; const dur = M[c.id] ? M[c.id].dur : L.text.length / 14;
  const cs = chunks(L.text); const total = cs.reduce((a, s) => a + s.length, 0);
  let t = c.t;
  cs.forEach((s) => { const d = Math.max(1.0, (dur * s.length) / total); events.push({ start: t, end: t + d, text: wrap(s), who: L.who }); t += d; });
}
events.sort((a, b) => a.start - b.start);
for (let i = 0; i < events.length - 1; i++) if (events[i].end > events[i + 1].start - 0.04) events[i].end = events[i + 1].start - 0.04;
const ts = (s, sep = ',') => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0').replace('.', sep)}`; };
const srt = events.map((e, i) => `${i + 1}\n${ts(e.start)} --> ${ts(e.end)}\n${e.who === 'system' || e.who === 'defneVO' ? '<i>' + e.text.join('\n') + '</i>' : e.text.join('\n')}\n`).join('\n');
writeFileSync(resolve(root, 'out/SYNAPSE_B01_Olu_Kod.tr.srt'), srt);
const at = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${x}`; };
const ass = `[Script Info]
Title: SYNAPSE - 1. Bölüm: Ölü Kod
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Inter,54,&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,0,0,0,0,100,100,0.5,0,1,3.2,1.6,2,160,160,150,1
Style: System,DejaVu Sans Mono,52,&H004040FF,&H00FFFFFF,&H00000018,&H96000000,1,0,0,0,100,100,2,0,1,3.4,2,2,160,160,150,1
Style: VO,Inter,54,&H00F0E6FF,&H00FFFFFF,&H00181018,&H96000000,0,1,0,0,100,100,0.5,0,1,3.2,1.6,2,160,160,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.map((e) => `Dialogue: 0,${at(e.start)},${at(e.end)},${e.who === 'system' ? 'System' : e.who === 'defneVO' ? 'VO' : 'Default'},,0,0,0,,${e.text.join('\\N')}`).join('\n')}
`;
writeFileSync(resolve(root, 'out/subs.ass'), ass);
console.log('altyazı olayları:', events.length);
