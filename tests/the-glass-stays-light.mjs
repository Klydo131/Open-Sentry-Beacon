// The Frutiger Aero looks stay cheap to draw on a phone.
//
// Measured with a 6x-slowed CPU: the room-change animation with a blur and a
// scale cost about ten times the paint work of a plain fade, and any movement
// re-rasterised the whole page on every frame. These rules keep that out.
//
//   node tests/the-glass-stays-light.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const aeroFiles = fs.readdirSync(path.join(root, 'app/themes')).filter((f) => f.startsWith('aero')).map((f) => `app/themes/${f}`);
const aero = aeroFiles.map((f) => strip(read(f))).join('\n');
ok(aeroFiles.length >= 6, `every Aero file was read (${aeroFiles.length})`);

ok(!/(?<!backdrop-)filter\s*:(?!\s*none)/.test(aero), 'no filter on anything in the Aero looks');
ok(!/backdrop-filter\s*:(?!\s*none)/.test(aero), 'no backdrop blur: the glass is gradients');

const frames = (/@keyframes lookBubble\s*\{([\s\S]*?)\n\}/.exec(strip(read('app/globals.css'))) ?? [])[1] ?? '';
ok(frames.length > 0, 'the Aero room-change animation exists');
ok(!/transform|filter|blur|scale/.test(frames), 'and it is a fade only: no movement, scale or blur');

const use = /\.page-in\s*\{\s*animation:\s*lookBubble\s+(\d+)ms/.exec(aero);
ok(!!use && Number(use[1]) <= 250, `the fade is short (${use?.[1] ?? '?'}ms, at most 250)`);

const hover = /\[data-update-card\]\s*\{\s*([^}]*)\}/.exec(aero)?.[1] ?? '';
ok(/transition:\s*transform\s+\d+ms[^;,]*;/.test(hover),
  'a card animates only its lift on hover, never its shadow or a filter');

ok(!/infinite/.test(aero), 'nothing in the Aero looks animates forever');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
